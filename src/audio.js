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
  const voiceQueue = [];
  const MAX_VOICE_QUEUE = 3;
  const VOICE_GAP_SEC = 0.40;
  let voiceGapRemainingSec = 0;
  let voiceGapTimerId = null;
  let voiceGapStartedAtMs = 0;
  let voiceCallbacks = { onStart: null, onEnd: null };
  let voiceDucked = false;
  let radioBus = null;
  let paBus = null;

  let decodeStarted = false;
  let decodeDone = false;
  let decodePromise = null;
  let muted = false;
  let gameplayPaused = false;
  let pauseFadeTimer = null;
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
    if (!ctx || muted || gameplayPaused) return null;
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
    if (gameplayPaused && ctx.state === 'running' && typeof ctx.suspend === 'function') {
      ctx.suspend().catch(() => {});
    }
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
      masterGain.gain.setTargetAtTime((muted || gameplayPaused) ? 0 : masterVolume, ctx.currentTime, 0.03);
    }
    if (!muted && !gameplayPaused && ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
  }

  function setGameplayPaused(flag) {
    const next = !!flag;
    if (next === gameplayPaused) return;
    gameplayPaused = next;
    if (pauseFadeTimer) {
      clearTimeout(pauseFadeTimer);
      pauseFadeTimer = null;
    }

    if (gameplayPaused) {
      // Pause (do NOT stop!) active mission narrator voiceover timer or inter-line queue gap
      if (currentVoice && !currentVoice.ended) {
        const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (currentVoice.timerStartedAtMs) {
          const elapsedMs = Math.max(0, nowMs - currentVoice.timerStartedAtMs);
          currentVoice.remainingMs = Math.max(120, (currentVoice.remainingMs || currentVoice.durationSec * 1000) - elapsedMs);
        }
        if (currentVoice.timerId) {
          clearTimeout(currentVoice.timerId);
          currentVoice.timerId = null;
        }
        currentVoice.paused = true;
      }
      if (voiceGapTimerId) {
        clearTimeout(voiceGapTimerId);
        voiceGapTimerId = null;
        if (voiceGapStartedAtMs) {
          const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const elapsedSec = Math.max(0, (nowMs - voiceGapStartedAtMs) / 1000);
          voiceGapRemainingSec = Math.max(0.05, voiceGapRemainingSec - elapsedSec);
        }
      }

      const FADE_OUT_SEC = 0.20;
      if (ctx && masterGain) {
        const now = ctx.currentTime;
        const curVal = Math.max(0.0001, masterGain.gain.value || (muted ? 0.0001 : masterVolume));
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(curVal, now);
        masterGain.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT_SEC);
      }
      // Suspend AudioContext after smooth fade-out so all BufferSources (narrator + ambience + zombies) freeze in place
      pauseFadeTimer = setTimeout(() => {
        pauseFadeTimer = null;
        if (gameplayPaused && ctx && ctx.state === 'running' && typeof ctx.suspend === 'function') {
          ctx.suspend().catch(() => {});
        }
      }, Math.ceil(FADE_OUT_SEC * 1000) + 15);
    } else {
      const FADE_IN_SEC = 0.24;
      const targetVol = muted ? 0 : masterVolume;
      const onResumed = () => {
        if (gameplayPaused) return;
        if (ctx && masterGain) {
          const now = ctx.currentTime;
          masterGain.gain.cancelScheduledValues(now);
          masterGain.gain.setValueAtTime(0.0001, now);
          masterGain.gain.linearRampToValueAtTime(targetVol, now + FADE_IN_SEC);
        }
        // Resume pending narrator voiceover, remaining timer, or inter-line queue gap
        if (currentVoice && !currentVoice.ended) {
          currentVoice.paused = false;
          if (typeof currentVoice.pendingStartFn === 'function' && !currentVoice.src) {
            const fn = currentVoice.pendingStartFn;
            currentVoice.pendingStartFn = null;
            fn();
          } else if (typeof currentVoice.finishVoice === 'function' && !currentVoice.timerId) {
            const remMs = Math.max(150, currentVoice.remainingMs || (currentVoice.durationSec * 1000));
            currentVoice.timerStartedAtMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            currentVoice.timerId = setTimeout(currentVoice.finishVoice, remMs + 80);
          }
        } else if (voiceQueue.length > 0 && voiceGapRemainingSec > 0 && !voiceGapTimerId) {
          scheduleVoiceQueueDrain(voiceGapRemainingSec);
        }
      };

      if (ctx && ctx.state === 'suspended' && !muted && typeof ctx.resume === 'function') {
        ctx.resume().then(onResumed).catch(onResumed);
      } else {
        onResumed();
      }
    }
  }

  function setVolumes(master, sfx) {
    if (typeof master === 'number') masterVolume = Math.max(0, Math.min(1, master));
    if (typeof sfx === 'number') sfxVolume = Math.max(0, Math.min(1, sfx));
    if (ctx && masterGain) {
      masterGain.gain.setTargetAtTime((muted || gameplayPaused) ? 0 : masterVolume, ctx.currentTime, 0.03);
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

  function clearVoiceQueue() {
    voiceQueue.length = 0;
    voiceGapRemainingSec = 0;
    if (voiceGapTimerId) {
      clearTimeout(voiceGapTimerId);
      voiceGapTimerId = null;
    }
  }

  function scheduleVoiceQueueDrain(delaySec) {
    if (voiceGapTimerId) {
      clearTimeout(voiceGapTimerId);
      voiceGapTimerId = null;
    }
    if (voiceQueue.length === 0) {
      voiceGapRemainingSec = 0;
      return;
    }
    const sec = Math.max(0.05, typeof delaySec === 'number' ? delaySec : VOICE_GAP_SEC);
    voiceGapRemainingSec = sec;
    if (gameplayPaused) return;
    voiceGapStartedAtMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    voiceGapTimerId = setTimeout(() => {
      voiceGapTimerId = null;
      voiceGapRemainingSec = 0;
      drainNextQueuedVoice();
    }, Math.ceil(sec * 1000));
  }

  function drainNextQueuedVoice() {
    if (gameplayPaused || (currentVoice && !currentVoice.ended)) return null;
    if (voiceQueue.length === 0) return null;
    const nextItem = voiceQueue.shift();
    if (!nextItem) return null;
    return startVoiceItemNow(nextItem.id, nextItem.entry, nextItem.priorityRank, nextItem.radioChime);
  }

  function stopVoice(opts) {
    const clearQueue = !opts || opts.clearQueue !== false;
    if (clearQueue) clearVoiceQueue();
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

  function startVoiceItemNow(voId, entry, priorityRank, radioChime) {
    const durationSec = Math.max(0.5, typeof entry.duration_sec === 'number' ? entry.duration_sec : 5.0);
    const durationMs = durationSec * 1000;
    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    if (radioChime && !muted && !gameplayPaused) {
      try { play('turnstile_beep', { gain: 0.14, pitchVar: 0.04 }); } catch (_) {}
    }

    const handle = {
      id: voId,
      entry: entry,
      priorityRank: priorityRank || 1,
      durationSec: durationSec,
      remainingMs: durationMs,
      timerStartedAtMs: nowMs,
      elapsed: 0,
      src: null,
      timerId: null,
      finishVoice: null,
      pendingStartFn: null,
      paused: gameplayPaused,
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
        if (voiceQueue.length > 0) {
          scheduleVoiceQueueDrain(VOICE_GAP_SEC);
        }
      }
    };
    handle.finishVoice = finishVoice;

    // Scheduled deterministic fallback timer (only runs while unpaused)
    if (!gameplayPaused) {
      handle.timerStartedAtMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      handle.timerId = setTimeout(finishVoice, durationMs);
    }

    // If audio file is present and unmuted, play voice clip (or defer until unpaused)
    const c = ensureContext();
    if (entry.file && c && !muted) {
      if (!gameplayPaused && c.state === 'suspended') {
        c.resume().catch(() => {});
      }

      const startPlayback = (buf) => {
        if (currentVoice !== handle || handle.ended) return;
        if (gameplayPaused) {
          handle.remainingMs = Math.ceil(buf.duration * 1000);
          handle.pendingStartFn = () => startPlayback(buf);
          return;
        }
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
        handle.remainingMs = Math.ceil(buf.duration * 1000);
        handle.timerStartedAtMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        handle.timerId = setTimeout(finishVoice, handle.remainingMs + 120);

        try {
          src.start(0);
        } catch (playErr) {
          console.warn('[LRT.Audio] Failed to start voice source:', voId, playErr);
          finishVoice();
        }
      };

      if (voiceBuffers.has(voId)) {
        startPlayback(voiceBuffers.get(voId));
      } else if (typeof fetch === 'function') {
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
          });
      }
    }

    return handle;
  }

  function enqueueOrPlayVoice(voId, entry, opts) {
    const o = opts || {};
    const newPriority = (typeof o.priorityRank === 'number')
      ? o.priorityRank
      : (PRIORITY_ORDER[o.priority || entry.priority] || 1);
    const force = !!(o.force || o.interrupt);
    const groupKey = o.groupKey || null;
    const radioChime = !!o.radioChime;

    if (force) {
      stopVoice({ clearQueue: true });
      return startVoiceItemNow(voId, entry, newPriority, radioChime);
    }

    // Deduplicate if exact same line is already active or queued
    if (currentVoice && !currentVoice.ended && currentVoice.id === voId) {
      return currentVoice;
    }
    for (let i = 0; i < voiceQueue.length; i++) {
      if (voiceQueue[i].id === voId) return { queued: true, id: voId, queueLength: voiceQueue.length };
    }

    // If a line is currently playing (or in the brief post-line radio gap), NEVER cut it off!
    if ((currentVoice && !currentVoice.ended) || voiceGapRemainingSec > 0) {
      const item = { id: voId, entry: entry, priorityRank: newPriority, groupKey: groupKey, radioChime: radioChime };

      // Supersede stale queued hint in the same groupKey instead of stacking outdated reminders
      if (groupKey) {
        const existingIdx = voiceQueue.findIndex((q) => q.groupKey === groupKey);
        if (existingIdx >= 0) {
          voiceQueue[existingIdx] = item;
          return { queued: true, id: voId, replaced: true, queueLength: voiceQueue.length };
        }
      }

      // Enforce queue backlog cap (MAX_VOICE_QUEUE = 3)
      if (voiceQueue.length >= MAX_VOICE_QUEUE) {
        let lowestIdx = -1;
        let lowestRank = Infinity;
        for (let i = 0; i < voiceQueue.length; i++) {
          if (voiceQueue[i].priorityRank < lowestRank) {
            lowestRank = voiceQueue[i].priorityRank;
            lowestIdx = i;
          }
        }
        if (lowestIdx >= 0 && newPriority > lowestRank) {
          voiceQueue.splice(lowestIdx, 1);
        } else {
          return null; // Drop stale/low-priority chatter rather than piling up a long backlog
        }
      }

      // Insert after all items with >= priorityRank (strict FIFO within same priority)
      let insertAt = voiceQueue.length;
      for (let i = 0; i < voiceQueue.length; i++) {
        if (newPriority > voiceQueue[i].priorityRank) {
          insertAt = i;
          break;
        }
      }
      voiceQueue.splice(insertAt, 0, item);
      return { queued: true, id: voId, queueLength: voiceQueue.length };
    }

    return startVoiceItemNow(voId, entry, newPriority, radioChime);
  }

  function playVoice(voId, opts) {
    if (!voId) return null;
    const entry = voiceManifest[voId];
    if (!entry) return null;
    return enqueueOrPlayVoice(voId, entry, opts);
  }

  function queueRadioSubtitle(speaker, textId, textEn, durationSec, opts) {
    if (!textId && !textEn) return null;
    const o = opts || {};
    const id = o.id || (`RADIO_${Date.now()}_${Math.floor(Math.random() * 9999)}`);
    const dur = Math.max(2.0, typeof durationSec === 'number' ? durationSec : 5.5);
    const entry = {
      id: id,
      speaker: speaker || 'SARAH',
      subtitle_id: textId || '',
      subtitle_en: textEn || '',
      duration_sec: dur,
      priority: o.priority || 'MEDIUM',
      file: null
    };
    return enqueueOrPlayVoice(id, entry, Object.assign({ radioChime: true }, o));
  }

  function tickVoice(dt) {
    if (gameplayPaused) return;
    if (currentVoice && !currentVoice.ended) {
      if (currentVoice.src) return; // audio buffer is driving timing
      currentVoice.elapsed += dt;
      if (currentVoice.elapsed >= currentVoice.durationSec) {
        if (typeof currentVoice.finishVoice === 'function') {
          currentVoice.finishVoice();
        } else {
          stopVoice({ clearQueue: false });
        }
      }
      return;
    }
    if (voiceGapRemainingSec > 0) {
      voiceGapRemainingSec = Math.max(0, voiceGapRemainingSec - dt);
      if (voiceGapRemainingSec <= 0) {
        if (voiceGapTimerId) {
          clearTimeout(voiceGapTimerId);
          voiceGapTimerId = null;
        }
        drainNextQueuedVoice();
      }
    }
  }

  function getVoiceQueueLength() {
    return voiceQueue.length;
  }

  function getStatus() {
    return {
      ready: decodeDone,
      loadedClips: buffers.size,
      expectedClips: Object.keys(window.__SFX_BANK__ || {}).length,
      muted,
      gameplayPaused,
      masterVolume,
      sfxVolume,
      activeVoices: activeVoices.length,
      activeLoops: Array.from(activeLoops.keys()),
      voiceLoaded: voiceBuffers.size,
      activeVoice: currentVoice ? currentVoice.id : null,
      voiceQueueLen: voiceQueue.length,
      voiceQueuedIds: voiceQueue.map((q) => q.id)
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
    setGameplayPaused,
    isGameplayPaused: () => gameplayPaused,
    setVolumes,
    getStatus,
    playVoice,
    queueRadioSubtitle,
    stopVoice,
    clearVoiceQueue,
    getVoiceQueueLength,
    setVoiceCallbacks,
    getVoiceManifest: () => voiceManifest,
    preloadVoice,
    tickVoice
  };
})(window.LRT = window.LRT || {});
