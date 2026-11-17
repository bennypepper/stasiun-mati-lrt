(function (LRT) {
  'use strict';

  const MAX_VOICES = 24;
  let ctx = null;
  let masterGain = null;
  let masterCompressor = null;
  let sfxGain = null;
  let loopGain = null;
  let voiceGain = null;

  const buffers = new Map();
  const baseVolumes = new Map();
  const activeVoices = [];
  const activeLoops = new Map();

  // Voiceover audio state
  let voiceManifest = (typeof window !== 'undefined' && window.__VOICE_MANIFEST__) ? Object.assign({}, window.__VOICE_MANIFEST__) : {};
  let manifestPromise = null;
  const voiceBuffers = new Map();
  const PRIORITY_ORDER = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    AMBIENT: 1
  };
  let currentVoice = null;
  let voiceCallbacks = { onStart: null, onEnd: null };
  let voiceDucked = false;
  let radioBus = null;
  let paBus = null;

  let decodeStarted = false;
  let decodeDone = false;
  let decodePromise = null;
  let muted = false;
  let masterVolume = 0.85;
  let sfxVolume = 0.90;

  function b64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : masterVolume;
    if (typeof ctx.createDynamicsCompressor === 'function') {
      masterCompressor = ctx.createDynamicsCompressor();
      masterCompressor.threshold.value = -4.0;
      masterCompressor.knee.value = 6.0;
      masterCompressor.ratio.value = 6.0;
      masterCompressor.attack.value = 0.002;
      masterCompressor.release.value = 0.08;
      masterGain.connect(masterCompressor);
      masterCompressor.connect(ctx.destination);
    } else {
      masterGain.connect(ctx.destination);
    }

    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(masterGain);

    loopGain = ctx.createGain();
    loopGain.gain.value = sfxVolume;
    loopGain.connect(masterGain);

    voiceGain = ctx.createGain();
    voiceGain.gain.value = 1.0;
    voiceGain.connect(masterGain);

    if (typeof ctx.createBiquadFilter === 'function') {
      // Tactical OCC radio bandpass (380Hz - 3200Hz + mid presence)
      const rHp = ctx.createBiquadFilter();
      rHp.type = 'highpass';
      rHp.frequency.value = 380;
      const rPeak = ctx.createBiquadFilter();
      rPeak.type = 'peaking';
      rPeak.frequency.value = 1650;
      rPeak.Q.value = 1.1;
      rPeak.gain.value = 4.0;
      const rLp = ctx.createBiquadFilter();
      rLp.type = 'lowpass';
      rLp.frequency.value = 3200;
      rHp.connect(rPeak);
      rPeak.connect(rLp);
      rLp.connect(voiceGain);
      radioBus = rHp;

      // Station PA speaker bandpass + subtle concourse slapback echo
      const pHp = ctx.createBiquadFilter();
      pHp.type = 'highpass';
      pHp.frequency.value = 320;
      const pLp = ctx.createBiquadFilter();
      pLp.type = 'lowpass';
      pLp.frequency.value = 3800;
      pHp.connect(pLp);
      pLp.connect(voiceGain);
      if (typeof ctx.createDelay === 'function') {
        const delay = ctx.createDelay(0.25);
        delay.delayTime.value = 0.085;
        const echoGain = ctx.createGain();
        echoGain.gain.value = 0.22;
        pLp.connect(delay);
        delay.connect(echoGain);
        echoGain.connect(voiceGain);
      }
      paBus = pHp;
    }
    return ctx;
  }

  async function decodeAll() {
    if (decodeStarted) return decodePromise;
    decodeStarted = true;
    const c = ensureContext();
    if (!c) {
      decodeDone = true;
      return;
    }
    const bank = window.__SFX_BANK__ || {};
    const entries = Object.entries(bank);
    decodePromise = Promise.all(
      entries.map(async ([key, entry]) => {
        if (!entry || !entry.base64) return;
        baseVolumes.set(key, typeof entry.volume === 'number' ? entry.volume : 0.8);
        try {
          const ab = b64ToArrayBuffer(entry.base64);
          const decoded = await c.decodeAudioData(ab);
          buffers.set(key, decoded);
        } catch (err) {
          console.warn('[LRT.Audio] Failed to decode clip:', key, err);
        }
      })
    ).then(() => {
      decodeDone = true;
    });
    return decodePromise;
  }

  async function unlock() {
    const c = ensureContext();
    if (!c) return false;
    const decodeTask = decodeAll();
    if (c.state === 'suspended') {
      try {
        await Promise.race([
          c.resume(),
          new Promise((res) => setTimeout(res, 150))
        ]);
      } catch (_) {}
    }
    await decodeTask;
    return true;
  }

  function pruneVoices() {
    const now = ctx ? ctx.currentTime : 0;
    for (let i = activeVoices.length - 1; i >= 0; i--) {
      if (activeVoices[i].ended || activeVoices[i].endAt <= now) {
        activeVoices.splice(i, 1);
      }
    }
  }

  function computeSpatial(opts) {
    if (!opts || !opts.pos || !opts.listenerPos) {
      return { atten: 1.0, pan: 0.0 };
    }
    const dx = opts.pos.x - opts.listenerPos.x;
    const dy = (opts.pos.y || 0) - (opts.listenerPos.y || 0);
    const dz = opts.pos.z - opts.listenerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const maxDist = opts.maxDist || 88.0;
    if (dist >= maxDist) return { atten: 0.0, pan: 0.0 };
    const refDist = opts.refDist || 4.8;
    const dRatio = Math.max(0.0, 1.0 - dist / maxDist);
    const atten = Math.min(1.0, Math.pow(refDist / Math.max(refDist, dist), 0.78)) * Math.pow(dRatio, 0.72);
    let pan = 0.0;
    if (opts.listenerRight && dist > 0.05) {
      const flatDist = Math.sqrt(dx * dx + dz * dz) || dist;
      const dot = (dx * opts.listenerRight.x + dz * opts.listenerRight.z) / flatDist;
      pan = Math.max(-0.96, Math.min(0.96, dot * 1.18));
    }
    return { atten, pan };
  }

  function play(key, opts) {
    if (!ctx || muted) return null;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const buf = buffers.get(key);
    if (!buf) return null;

    const spatial = computeSpatial(opts);
    if (spatial.atten <= 0.015) return null;

    pruneVoices();
    if (activeVoices.length >= MAX_VOICES) {
      const oldest = activeVoices.shift();
      try { oldest.src.stop(); } catch (_) {}
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const pitchVar = opts && typeof opts.pitchVar === 'number' ? opts.pitchVar : 0.0;
    const baseRate = opts && typeof opts.rate === 'number' ? opts.rate : 1.0;
    const rate = Math.max(0.5, Math.min(2.0, baseRate + (Math.random() * 2 - 1) * pitchVar));
    src.playbackRate.value = rate;

    const gainNode = ctx.createGain();
    const baseVol = baseVolumes.get(key) ?? 0.8;
    const userGain = opts && typeof opts.gain === 'number' ? opts.gain : 1.0;
    gainNode.gain.value = Math.max(0, Math.min(1.5, baseVol * userGain * spatial.atten));

    if (typeof ctx.createStereoPanner === 'function' && Math.abs(spatial.pan) > 0.02) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = spatial.pan;
      src.connect(panner);
      panner.connect(gainNode);
    } else {
      src.connect(gainNode);
    }
    gainNode.connect(sfxGain);

    const voice = {
      src,
      gainNode,
      ended: false,
      endAt: ctx.currentTime + (buf.duration / rate) + 0.05
    };
    src.onended = () => { voice.ended = true; };
    activeVoices.push(voice);
    src.start(0);
    return voice;
  }

  function startLoop(key, gain = 0.75, fadeSec = 0.35, rate = 1.0) {
    if (!ctx) return null;
    const existing = activeLoops.get(key);
    if (existing) {
      setLoopVolume(key, gain, fadeSec, rate);
      return existing;
    }
    const buf = buffers.get(key);
    if (!buf) return null;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;

    const g = ctx.createGain();
    const now = ctx.currentTime;
    const target = Math.max(0.0001, (baseVolumes.get(key) ?? 0.8) * gain);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(target, now + Math.max(0.05, fadeSec));

    src.connect(g);
    g.connect(loopGain);
    src.start(0);

    const handle = { src, gainNode: g, key };
    activeLoops.set(key, handle);
    return handle;
  }

  function setLoopVolume(key, gain, fadeSec = 0.15, rate = null) {
    const h = activeLoops.get(key);
    if (!h || !ctx) return;
    const now = ctx.currentTime;
    const target = Math.max(0.0001, (baseVolumes.get(key) ?? 0.8) * gain);
    h.gainNode.gain.cancelScheduledValues(now);
    h.gainNode.gain.setValueAtTime(Math.max(0.0001, h.gainNode.gain.value), now);
    h.gainNode.gain.linearRampToValueAtTime(target, now + Math.max(0.02, fadeSec));
    if (typeof rate === 'number') {
      h.src.playbackRate.setTargetAtTime(Math.max(0.5, Math.min(1.6, rate)), now, 0.08);
    }
  }

  function stopLoop(key, fadeSec = 0.25) {
    const h = activeLoops.get(key);
    if (!h || !ctx) return;
    activeLoops.delete(key);
    const now = ctx.currentTime;
    h.gainNode.gain.cancelScheduledValues(now);
    h.gainNode.gain.setValueAtTime(Math.max(0.0001, h.gainNode.gain.value), now);
    h.gainNode.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.04, fadeSec));
    setTimeout(() => {
      try { h.src.stop(); } catch (_) {}
    }, Math.ceil(fadeSec * 1000) + 40);
  }

  function stopAllLoops() {
    for (const key of Array.from(activeLoops.keys())) {
      stopLoop(key, 0.12);
    }
  }

  function setMute(flag) {
    muted = !!flag;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : masterVolume, ctx.currentTime, 0.03);
    }
  }

  function setVolumes(master, sfx) {
    if (typeof master === 'number') masterVolume = Math.max(0, Math.min(1, master));
    if (typeof sfx === 'number') sfxVolume = Math.max(0, Math.min(1, sfx));
    if (ctx && masterGain) {
      masterGain.gain.setTargetAtTime(muted ? 0 : masterVolume, ctx.currentTime, 0.03);
    }
    if (ctx && sfxGain && loopGain) {
      sfxGain.gain.setTargetAtTime(sfxVolume, ctx.currentTime, 0.03);
      const targetLoop = voiceDucked ? 0.45 * sfxVolume : sfxVolume;
      loopGain.gain.setTargetAtTime(targetLoop, ctx.currentTime, 0.03);
    }
  }

  function duckLoopGain(fadeSec = 0.08) {
    voiceDucked = true;
    if (loopGain && ctx) {
      const now = ctx.currentTime;
      loopGain.gain.cancelScheduledValues(now);
      loopGain.gain.setValueAtTime(loopGain.gain.value, now);
      loopGain.gain.linearRampToValueAtTime(0.45 * sfxVolume, now + Math.max(0.02, fadeSec));
    }
  }

  function restoreLoopGain(fadeSec = 0.18) {
    voiceDucked = false;
    if (loopGain && ctx) {
      const now = ctx.currentTime;
      loopGain.gain.cancelScheduledValues(now);
      loopGain.gain.setValueAtTime(loopGain.gain.value, now);
      loopGain.gain.linearRampToValueAtTime(sfxVolume, now + Math.max(0.04, fadeSec));
    }
  }

  function loadVoiceManifest() {
    if (manifestPromise) return manifestPromise;
    if (Object.keys(voiceManifest).length > 0) {
      manifestPromise = Promise.resolve(voiceManifest);
      return manifestPromise;
    }
    if (typeof fetch === 'function') {
      manifestPromise = fetch('assets/voice/manifest.json')
        .then((r) => (r.ok ? r.json() : {}))
        .then((data) => {
          if (data && typeof data === 'object') {
            voiceManifest = Object.assign(voiceManifest, data);
          }
          return voiceManifest;
        })
        .catch((err) => {
          console.warn('[LRT.Audio] Failed to load voice manifest:', err);
          return voiceManifest;
        });
    } else {
      manifestPromise = Promise.resolve(voiceManifest);
    }
    return manifestPromise;
  }

  async function preloadVoice(ids) {
    await loadVoiceManifest();
    const c = ensureContext();
    if (!c || typeof fetch !== 'function') return;
    const targetIds = Array.isArray(ids) ? ids : Object.keys(voiceManifest);
    await Promise.all(
      targetIds.map(async (voId) => {
        const entry = voiceManifest[voId];
        if (!entry || !entry.file || voiceBuffers.has(voId)) return;
        try {
          const res = await fetch(entry.file);
          if (!res.ok) return;
          const ab = await res.arrayBuffer();
          const decoded = await c.decodeAudioData(ab);
          voiceBuffers.set(voId, decoded);
        } catch (_) {}
      })
    );
  }

  function setVoiceCallbacks(cbs) {
    if (!cbs) {
      voiceCallbacks = { onStart: null, onEnd: null };
      return;
    }
    voiceCallbacks = {
      onStart: typeof cbs.onStart === 'function' ? cbs.onStart : null,
      onEnd: typeof cbs.onEnd === 'function' ? cbs.onEnd : null
    };
  }

  function stopVoice() {
    if (!currentVoice) return;
    const prev = currentVoice;
    currentVoice = null;
    prev.ended = true;

    if (prev.timerId) {
      clearTimeout(prev.timerId);
      prev.timerId = null;
    }

    if (prev.src) {
      try {
        prev.src.onended = null;
        prev.src.stop();
      } catch (_) {}
      prev.src = null;
    }

    restoreLoopGain();

    if (voiceCallbacks && typeof voiceCallbacks.onEnd === 'function') {
      try {
        voiceCallbacks.onEnd(prev.entry);
      } catch (err) {
        console.warn('[LRT.Audio] onVoiceEnd error in stopVoice:', err);
      }
    }
  }

  function playVoice(voId, opts) {
    if (!voId) return null;
    const entry = voiceManifest[voId];
    if (!entry) return null;

    const newPriority = PRIORITY_ORDER[entry.priority] || 1;
    const force = !!(opts && opts.force);

    if (currentVoice && !currentVoice.ended) {
      const curPriority = currentVoice.priorityRank || 1;
      if (!force && curPriority > newPriority) {
        return null; // Skip cleanly when currently playing line has strictly higher priority
      }
      stopVoice();
    }

    const durationSec = Math.max(0.5, typeof entry.duration_sec === 'number' ? entry.duration_sec : 5.0);
    const durationMs = durationSec * 1000;

    const handle = {
      id: voId,
      entry: entry,
      priorityRank: newPriority,
      durationSec: durationSec,
      elapsed: 0,
      src: null,
      timerId: null,
      ended: false
    };
    currentVoice = handle;

    // Emits subtitle callback onVoiceStart(entry) even if audio is muted or AudioContext is suspended
    if (voiceCallbacks && typeof voiceCallbacks.onStart === 'function') {
      try {
        voiceCallbacks.onStart(entry);
      } catch (err) {
        console.warn('[LRT.Audio] onVoiceStart error:', err);
      }
    }

    const finishVoice = () => {
      if (currentVoice === handle && !handle.ended) {
        handle.ended = true;
        currentVoice = null;
        if (handle.timerId) {
          clearTimeout(handle.timerId);
          handle.timerId = null;
        }
        if (handle.src) {
          try {
            handle.src.onended = null;
          } catch (_) {}
          handle.src = null;
        }
        restoreLoopGain();
        if (voiceCallbacks && typeof voiceCallbacks.onEnd === 'function') {
          try {
            voiceCallbacks.onEnd(entry);
          } catch (err) {
            console.warn('[LRT.Audio] onVoiceEnd error:', err);
          }
        }
      }
    };

    // Scheduled deterministic fallback timer
    handle.timerId = setTimeout(finishVoice, durationMs);

    // If audio is available and unmuted, play voice clip
    const c = ensureContext();
    if (c && !muted) {
      if (c.state === 'suspended') {
        c.resume().catch(() => {});
      }

      const startPlayback = (buf) => {
        if (currentVoice !== handle || handle.ended) return;
        if (handle.timerId) {
          clearTimeout(handle.timerId);
          handle.timerId = null;
        }
        duckLoopGain();

        const src = c.createBufferSource();
        src.buffer = buf;
        const spk = String(entry.speaker || '').toUpperCase();
        const targetBus = (spk.includes('OCC') && radioBus)
          ? radioBus
          : ((spk.includes('SYSTEM') || spk.includes('ANN')) && paBus ? paBus : voiceGain);
        src.connect(targetBus);
        handle.src = src;

        src.onended = () => {
          finishVoice();
        };

        // Safety fallback timer if onended is delayed or missed
        handle.timerId = setTimeout(finishVoice, Math.ceil(buf.duration * 1000) + 120);

        try {
          src.start(0);
        } catch (playErr) {
          console.warn('[LRT.Audio] Failed to start voice source:', voId, playErr);
          finishVoice();
        }
      };

      if (voiceBuffers.has(voId)) {
        startPlayback(voiceBuffers.get(voId));
      } else if (entry.file && typeof fetch === 'function') {
        fetch(entry.file)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
          })
          .then((ab) => c.decodeAudioData(ab))
          .then((decoded) => {
            voiceBuffers.set(voId, decoded);
            startPlayback(decoded);
          })
          .catch((fetchErr) => {
            console.warn('[LRT.Audio] Failed to load voice clip:', voId, fetchErr);
            // Fallback timer already running ensures onVoiceEnd triggers
          });
      }
    }

    return handle;
  }

  function tickVoice(dt) {
    if (!currentVoice || currentVoice.ended) return;
    if (currentVoice.src) return; // audio buffer is driving timing
    currentVoice.elapsed += dt;
    if (currentVoice.elapsed >= currentVoice.durationSec) {
      stopVoice();
    }
  }

  function getStatus() {
    return {
      ready: decodeDone,
      loadedClips: buffers.size,
      expectedClips: Object.keys(window.__SFX_BANK__ || {}).length,
      muted,
      masterVolume,
      sfxVolume,
      activeVoices: activeVoices.length,
      activeLoops: Array.from(activeLoops.keys()),
      voiceLoaded: voiceBuffers.size,
      activeVoice: currentVoice ? currentVoice.id : null
    };
  }

  function init() {
    ensureContext();
    decodeAll();
    loadVoiceManifest();
  }

  LRT.Audio = {
    init,
    unlock,
    play,
    startLoop,
    setLoopVolume,
    stopLoop,
    stopAllLoops,
    setMute,
    isMuted: () => muted,
    setVolumes,
    getStatus,
    playVoice,
    stopVoice,
    setVoiceCallbacks,
    getVoiceManifest: () => voiceManifest,
    preloadVoice,
    tickVoice
  };
})(window.LRT = window.LRT || {});
