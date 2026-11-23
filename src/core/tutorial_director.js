(function (LRT) {
  'use strict';

  // =========================================================
  // BRIEFING / TUTORIAL DIRECTOR
  // A guided, no-risk walk through Station 0 (Dukuh Atas) that teaches every core mechanic by doing it:
  // movement, sprint/jump, fare gates, paper notes, aim/shoot, reload, melee/kills, generator objective,
  // calling the train, boarding and departing. No waves, no roamers, no autosave, player cannot die.
  // =========================================================

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const CORE = (I.core = I.core || {});

  const C = LRT.Config;
  const STATES = C.STATES;

  const DONE_KEY = 'lrt_tutorial_done_v1';
  const REQUIRED_SHOTS = 2;
  const MOVE_DISTANCE = 3.0;
  const WALKER_COUNT = 2;

  CORE.tutorialActive = false;

  const T = {
    step: -1,
    stepTime: 0,
    startX: 0,
    startZ: 0,
    sprinted: false,
    flashlightToggled: false,
    lastFlashlight: false,
    jumped: false,
    adsSeen: false,
    shots: 0,
    reloaded: false,
    docOpened: false,
    turnstileTapped: false,
    shoved: false,
    stepKills: 0,
    stepTargets: [],
    countedKillIds: new Set(),
    walkersSpawned: false,
    walkerWait: 0,
    endTimer: -1,
    prevDifficulty: null,
    prevInvulnerable: false,
    card: null,
    els: null,
    voPlayed: new Set(),
    origWeapons: null,
    origStationInteract: null,
    completedOverlayOpen: false
  };

  const _marker = { id: 'tutorial_marker', pos: { x: 0, y: 0, z: 0 }, label: '', color: '#e0b422', active: true, alwaysShow: true };
  const _markers = [_marker];
  const _noMarkers = [];

  // ---------- helpers ----------
  function pState() {
    return (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') ? LRT.PlayerUI.getState() : null;
  }

  function stationOffsetZ() {
    return (LRT.Station && LRT.Station.rootGroup) ? (LRT.Station.rootGroup.position.z || 0) : 0;
  }

  function findInteractable(pred) {
    const list = (LRT.Station && (LRT.Station.interactables || (typeof LRT.Station.getInteractables === 'function' && LRT.Station.getInteractables()))) || [];
    for (let i = 0; i < list.length; i++) {
      if (pred(list[i])) return list[i];
    }
    return null;
  }

  function nearestInteractable(pred, from) {
    const list = (LRT.Station && (LRT.Station.interactables || (typeof LRT.Station.getInteractables === 'function' && LRT.Station.getInteractables()))) || [];
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!pred(it)) continue;
      const d = from ? Math.hypot(it.x - from.x, it.z - from.z) : 0;
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  function playVoice(id) {
    if (T.voPlayed.has(id)) return;
    T.voPlayed.add(id);
    const man = window.__VOICE_MANIFEST__;
    if (!man || !man[id]) return;
    if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') LRT.Audio.playVoice(id, { force: true });
  }

  function hasClearSight(fromPos, toX, toY, toZ) {
    if (!LRT.Station || typeof LRT.Station.raycastWorld !== 'function') return true;
    const dx = toX - fromPos.x;
    const dy = toY - fromPos.y;
    const dz = toZ - fromPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.8) return true;
    const origin = new THREE.Vector3(fromPos.x, fromPos.y + 1.15, fromPos.z);
    const dir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
    const hit = LRT.Station.raycastWorld(origin, dir, dist - 0.45);
    return !hit;
  }

  function pickClearFrontSpawns(p, n, minDist, maxDist) {
    const nodes = (LRT.Station && LRT.Station.getSpawnNodes) ? (LRT.Station.getSpawnNodes() || []) : [];
    const cand = [];
    const targetIdeal = (minDist + maxDist) * 0.5;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      if ((nd.y || 0) > 0.5 || (nd.y || 0) < -0.5) continue;
      const d = Math.hypot(nd.x - p.pos.x, nd.z - p.pos.z);
      if (d < 3.2 || d > 22.0) continue;
      const clear = hasClearSight(p.pos, nd.x, nd.y || 0, nd.z);
      const inRange = d >= minDist && d <= maxDist;
      const score = (clear ? 0 : 100) + (inRange ? 0 : 25) + Math.abs(d - targetIdeal);
      cand.push({ n: nd, score });
    }
    cand.sort((a, b) => a.score - b.score);
    const out = [];
    for (let i = 0; i < cand.length && out.length < n; i++) out.push(cand[i].n);

    // Fallback: project forward into open corridor/platform if no clear node found
    if (out.length < n && LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
      const fx = -Math.sin(p.yaw || 0);
      const fz = -Math.cos(p.yaw || 0);
      for (const stepDist of [6.0, 5.0, 7.5]) {
        if (out.length >= n) break;
        const tx = p.pos.x + fx * stepDist;
        const tz = p.pos.z + fz * stepDist;
        if (!hasClearSight(p.pos, tx, 0, tz)) continue;
        const downHit = LRT.Station.raycastWorld(new THREE.Vector3(tx, 1.2, tz), new THREE.Vector3(0, -1, 0), 2.5);
        if (downHit && downHit.point && Math.abs(downHit.point.y) <= 0.35) {
          out.unshift({ x: tx, y: downHit.point.y, z: tz });
        }
      }
    }
    return out.slice(0, n);
  }

  function spawnTrackedWalkers(p, count, minDist, maxDist) {
    const spots = pickClearFrontSpawns(p, count, minDist, maxDist);
    const pool = I.enemies && Array.isArray(I.enemies.zombies) ? I.enemies.zombies : null;
    const beforeActive = new Set();
    if (pool) {
      for (let i = 0; i < pool.length; i++) {
        if (pool[i] && pool[i].active && !pool[i].dead) beforeActive.add(pool[i].id);
      }
    }
    for (let i = 0; i < spots.length; i++) {
      const nd = spots[i];
      if (LRT.Enemies && typeof LRT.Enemies.spawnOneZombie === 'function') {
        LRT.Enemies.spawnOneZombie('walker', { x: nd.x, y: nd.y || 0, z: nd.z }, { isRoamer: false, aggroState: 'CHASE', diffKey: 'easy' });
      }
    }
    if (pool) {
      for (let i = 0; i < pool.length; i++) {
        const z = pool[i];
        if (z && z.active && !z.dead && !beforeActive.has(z.id) && T.stepTargets.indexOf(z) === -1) {
          T.stepTargets.push(z);
        }
      }
    }
    return spots.length;
  }

  function firstLiveTarget(preferList) {
    if (Array.isArray(preferList)) {
      for (let i = 0; i < preferList.length; i++) {
        const z = preferList[i];
        if (z && z.active && !z.dead) return z;
      }
    }
    const pool = I.enemies && Array.isArray(I.enemies.zombies) ? I.enemies.zombies : null;
    if (pool) {
      for (let i = 0; i < pool.length; i++) {
        const z = pool[i];
        if (z && z.active && !z.dead) return z;
      }
    }
    return null;
  }

  // ---------- step definitions ----------
  // marker(p) returns {x,y,z,label} or null. check(p, dt) returns true when the step is complete.
  const STEPS = [
    {
      title: 'MOVE',
      text: 'Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk ~3 meters and the mouse to look around.',
      voice: 'TUT_01_WELCOME',
      check: (p) => Math.hypot(p.pos.x - T.startX, p.pos.z - T.startZ) >= MOVE_DISTANCE
    },
    {
      title: 'SPRINT & FLASHLIGHT',
      text: 'Hold <kbd>SHIFT</kbd> while moving to sprint, and press <kbd>F</kbd> to toggle your tactical flashlight.',
      check: () => T.sprinted && T.flashlightToggled
    },
    {
      title: 'FARE GATES',
      text: 'Follow the marker to the Access by KAI turnstiles and press <kbd>E</kbd> to tap through.',
      voice: 'TUT_02_INTERACT',
      marker: (p) => {
        const it = nearestInteractable((x) => x.type === 'turnstile', p.pos);
        return it ? { x: it.x, y: it.y + 0.2, z: it.z + stationOffsetZ(), label: 'TAP KARTU' } : null;
      },
      check: () => T.turnstileTapped
    },
    {
      title: 'FIELD NOTES',
      text: 'Press <kbd>E</kbd> at the ticket booth to read the logbook, then press <kbd>E</kbd> or <kbd>ESC</kbd> to close.',
      marker: () => {
        const it = findInteractable((x) => x.id === 'loket_counter');
        return it ? { x: it.x, y: it.y + 0.2, z: it.z + stationOffsetZ(), label: 'BUKU PIKET' } : null;
      },
      check: () => T.docOpened
    },
    {
      title: 'SHOOT & RELOAD',
      text: 'Hold <kbd>RMB</kbd> to aim, fire 2 shots with <kbd>LMB</kbd>, then press <kbd>R</kbd> to reload.',
      voice: 'TUT_03_COMBAT',
      check: () => T.adsSeen && T.shots >= REQUIRED_SHOTS && T.reloaded
    },
    {
      title: 'SHOVE [V]',
      text: 'Approach the infected ahead and press <kbd>V</kbd> to shove it back!',
      onEnter: (p) => {
        T.shoved = false;
        T.stepTargets.length = 0;
        const alive = firstLiveTarget();
        if (alive) T.stepTargets.push(alive);
        else spawnTrackedWalkers(p, 1, 4.8, 7.2);
      },
      marker: () => {
        const z = firstLiveTarget(T.stepTargets);
        return z ? { x: z.x, y: (z.y || 0) + 1.45, z: z.z, label: 'TEKAN [V] SHOVE' } : null;
      },
      check: (p) => {
        if (T.shoved) return true;
        if (!firstLiveTarget(T.stepTargets)) {
          spawnTrackedWalkers(p, 1, 4.8, 7.2);
        }
        return false;
      }
    },
    {
      title: 'HEADSHOT INFECTED',
      text: 'Eliminate 2 infected ahead! Aim for the head for lethal headshots and decapitation.',
      voice: 'TUT_04_INFECTED',
      onEnter: (p) => {
        T.stepKills = 0;
        T.countedKillIds.clear();
        T.stepTargets.length = 0;
        const pool = I.enemies && Array.isArray(I.enemies.zombies) ? I.enemies.zombies : null;
        if (pool) {
          for (let i = 0; i < pool.length; i++) {
            const z = pool[i];
            if (z && z.active && !z.dead) T.stepTargets.push(z);
          }
        }
        const need = Math.max(0, WALKER_COUNT - T.stepTargets.length);
        if (need > 0) spawnTrackedWalkers(p, need, 5.5, 11.0);
        T.walkersSpawned = T.stepTargets.length > 0;
      },
      marker: () => {
        const z = firstLiveTarget(T.stepTargets);
        return z ? { x: z.x, y: (z.y || 0) + 1.55, z: z.z, label: 'ELIMINASI (' + T.stepKills + '/2)' } : null;
      },
      check: (p) => {
        for (let i = 0; i < T.stepTargets.length; i++) {
          const z = T.stepTargets[i];
          if (z && (z.dead || !z.active) && !T.countedKillIds.has(z.id)) {
            T.countedKillIds.add(z.id);
            T.stepKills += 1;
          }
        }
        if (T.stepKills >= WALKER_COUNT) return true;
        if (!firstLiveTarget(T.stepTargets)) {
          spawnTrackedWalkers(p, 1, 5.5, 10.5);
        }
        return false;
      }
    },
    {
      title: 'RESTORE POWER',
      text: 'Objective: follow the glowing amber outline to the portable generator and press <kbd>E</kbd>.',
      voice: 'TUT_05_OBJECTIVE',
      marker: () => {
        const it = findInteractable((x) => x.id === 'portable_generator');
        return it ? { x: it.x, y: it.y + 0.6, z: it.z + stationOffsetZ(), label: 'GENERATOR' } : null;
      },
      check: () => {
        const s0 = CORE.campaignState && CORE.campaignState.stationObjectives && CORE.campaignState.stationObjectives[0];
        return !!(s0 && s0.genOn);
      }
    },
    {
      title: 'CALL & BOARD TRAIN',
      text: 'Call Peron 1 LRT (<kbd>E</kbd> / <kbd>T</kbd>), board the open doors, walk to the <b>Front Control Room</b> &amp; lock doors (<kbd>E</kbd> / <kbd>T</kbd>).',
      voice: 'TUT_06_CALL_TRAIN',
      marker: (p) => {
        if (CORE.gameState === STATES.STATION_ACTIVE) {
          const it = findInteractable((x) => x.id === 'call_train');
          return it ? { x: it.x, y: it.y + 0.6, z: it.z + stationOffsetZ(), label: 'PANGGIL KERETA' } : null;
        }
        if (!LRT.Train || typeof LRT.Train.getTrackX !== 'function') return null;
        if (LRT.Train.getState && LRT.Train.getState() === 'AWAY') return null;
        const inside = !!(LRT.Train.isPlayerInside && LRT.Train.isPlayerInside(p.pos));
        if (inside && LRT.Train.getState && LRT.Train.getState() === 'BOARDED_WAIT') {
          playVoice('TUT_07_DEPART');
          if (typeof LRT.Train.localToWorld === 'function') {
            const pW = LRT.Train.localToWorld({ x: 0.0, y: 1.35, z: 24.8 });
            return { x: pW.x, y: pW.y, z: pW.z, label: 'RUANG KONTROL' };
          }
          const z = (typeof LRT.Train.getOffsetZ === 'function') ? LRT.Train.getOffsetZ() : 0;
          return { x: LRT.Train.getTrackX(), y: 1.35, z: z + 24.8, label: 'RUANG KONTROL' };
        }
        if (typeof LRT.Train.localToWorld === 'function') {
          const pW = LRT.Train.localToWorld({ x: 0.25, y: 1.35, z: 17.75 });
          return { x: pW.x, y: pW.y, z: pW.z, label: 'BERGERAK MASUK KERETA' };
        }
        const z = (typeof LRT.Train.getOffsetZ === 'function') ? LRT.Train.getOffsetZ() : 0;
        return { x: LRT.Train.getTrackX() + 0.25, y: 1.35, z: z + 17.75, label: 'BERGERAK MASUK KERETA' };
      },
      check: () => !!T.completedOverlayOpen
    }
  ];

  // ---------- card UI (created once, lives inside #hud so it hides with the HUD) ----------
  function ensureCard() {
    if (T.card && T.card.isConnected) return;
    const host = document.getElementById('hud') || document.body;
    const card = document.createElement('div');
    card.id = 'tutorial-card';
    card.className = 'hidden';
    card.innerHTML =
      '<div class="tut-head"><span class="tut-kicker">BRIEFING</span><span class="tut-count" id="tutorial-count">1/11</span></div>' +
      '<div class="tut-title" id="tutorial-title"></div>' +
      '<div class="tut-text" id="tutorial-text"></div>' +
      '<div class="tut-bar"><div class="tut-bar-fill" id="tutorial-bar"></div></div>' +
      '<div class="tut-foot"><span>[BACKSPACE] SKIP BRIEFING</span><span id="tutorial-done" class="tut-done hidden">&#10003; COMPLETE</span></div>';
    host.appendChild(card);
    T.card = card;
    T.els = {
      count: card.querySelector('#tutorial-count'),
      title: card.querySelector('#tutorial-title'),
      text: card.querySelector('#tutorial-text'),
      bar: card.querySelector('#tutorial-bar'),
      done: card.querySelector('#tutorial-done')
    };
  }

  function renderStep() {
    ensureCard();
    const st = STEPS[T.step];
    if (!st) return;
    T.els.count.textContent = (T.step + 1) + '/' + STEPS.length;
    T.els.title.textContent = st.title;
    T.els.text.innerHTML = st.text;
    T.els.bar.style.width = Math.round((T.step / STEPS.length) * 100) + '%';
    T.els.done.classList.add('hidden');
    T.card.classList.remove('hidden');
    T.card.classList.remove('is-advancing');
    // retrigger entrance animation
    void T.card.offsetWidth;
    T.card.classList.add('is-advancing');
  }

  // ---------- weapon/event wrappers ----------
  function wrapWeapons() {
    const W = LRT.Weapons;
    if (!W || T.origWeapons) return;
    T.origWeapons = {
      fireDown: W.fireDown, reload: W.reload, meleeShove: W.meleeShove, setADS: W.setADS
    };
    if (typeof W.fireDown === 'function') {
      W.fireDown = function () { T.shots++; return T.origWeapons.fireDown.apply(W, arguments); };
    }
    if (typeof W.reload === 'function') {
      W.reload = function () { T.reloaded = true; return T.origWeapons.reload.apply(W, arguments); };
    }
    if (typeof W.setADS === 'function') {
      W.setADS = function (on) { if (on) T.adsSeen = true; return T.origWeapons.setADS.apply(W, arguments); };
    }
    if (typeof W.meleeShove === 'function') {
      W.meleeShove = function () {
        const res = T.origWeapons.meleeShove.apply(W, arguments);
        if (res && res.hitCount > 0) T.shoved = true;
        return res;
      };
    }
  }

  function unwrapWeapons() {
    const W = LRT.Weapons;
    if (!W || !T.origWeapons) return;
    W.fireDown = T.origWeapons.fireDown;
    W.reload = T.origWeapons.reload;
    W.meleeShove = T.origWeapons.meleeShove;
    W.setADS = T.origWeapons.setADS;
    T.origWeapons = null;
  }

  function wrapStationInteract() {
    const S = LRT.Station;
    if (!S || T.origStationInteract || typeof S.interact !== 'function') return;
    T.origStationInteract = S.interact;
    S.interact = function (id) {
      if (CORE.tutorialActive) {
        if (id === 'portable_generator' && T.step < 7) {
          if (LRT.Audio && typeof LRT.Audio.play === 'function') LRT.Audio.play('station_chime', { gain: 0.55 });
          return { ok: false, blocked: true, message: 'IKUTI LANGKAH BRIEFING TERLEBIH DAHULU' };
        }
        if ((id === 'call_train' || id === 'call_train_prev' || id === 'call_train_p2') && T.step < 8) {
          if (LRT.Audio && typeof LRT.Audio.play === 'function') LRT.Audio.play('station_chime', { gain: 0.55 });
          return { ok: false, blocked: true, message: 'IKUTI LANGKAH BRIEFING TERLEBIH DAHULU' };
        }
      }
      return T.origStationInteract.apply(S, arguments);
    };
  }

  function unwrapStationInteract() {
    const S = LRT.Station;
    if (!S || !T.origStationInteract) return;
    S.interact = T.origStationInteract;
    T.origStationInteract = null;
  }

  function onKeyDown(e) {
    if (!CORE.tutorialActive) return;
    if (e.code === 'Backspace') {
      // Never swallow Backspace while typing in the cheat console
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      endTutorial('skip');
    }
  }

  // ---------- public API ----------
  function isDone() {
    try { return localStorage.getItem(DONE_KEY) === '1'; } catch (_) { return false; }
  }

  function markDone() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch (_) {}
  }

  // Called by main.js startGame(opts.tutorial) AFTER the station is built and the player reset.
  function beginTutorial() {
    const p = pState();
    if (!p) return;
    T.step = -1;
    T.stepTime = 0;
    T.startX = p.pos.x;
    T.startZ = p.pos.z;
    T.sprinted = false;
    T.flashlightToggled = false;
    T.lastFlashlight = !!p.flashlightOn;
    T.jumped = false;
    T.adsSeen = false;
    T.shots = 0;
    T.reloaded = false;
    T.docOpened = false;
    T.turnstileTapped = false;
    T.shoved = false;
    T.stepKills = 0;
    T.stepTargets.length = 0;
    T.countedKillIds.clear();
    T.walkersSpawned = false;
    T.walkerWait = 0;
    T.endTimer = -1;
    T.completedOverlayOpen = false;
    T.voPlayed.clear();

    T.prevDifficulty = CORE.difficultyKey;
    CORE.difficultyKey = 'easy'; // not persisted; restored on exit
    if (LRT.Enemies && typeof LRT.Enemies.setDifficulty === 'function') LRT.Enemies.setDifficulty('easy');
    T.prevInvulnerable = !!p.invulnerable;
    p.invulnerable = true;
    p.noticeTimer = 0;
    const noticeEl = document.getElementById('hud-notice');
    if (noticeEl) noticeEl.style.opacity = '0';

    wrapWeapons();
    wrapStationInteract();
    window.addEventListener('keydown', onKeyDown, true);
    CORE.tutorialActive = true;
    ensureCard();
    advanceTo(0);
  }

  function advanceTo(idx) {
    T.step = idx;
    T.stepTime = 0;
    const st = STEPS[idx];
    if (!st) return;
    renderStep();
    if (LRT.Audio && typeof LRT.Audio.play === 'function' && idx > 0) LRT.Audio.play('station_chime', { gain: 0.45 });
    const p = pState();
    if (st.onEnter && p) st.onEnter(p);
    if (st.voice) playVoice(st.voice);
  }

  function completeTutorialStep11() {
    if (!CORE.tutorialActive || T.completedOverlayOpen) return false;
    T.completedOverlayOpen = true;
    _marker.active = false;
    markDone();

    if (LRT.Station && typeof LRT.Station.setPsdOpen === 'function') {
      LRT.Station.setPsdOpen(0, CORE.activeTravelDir || 1);
    }
    if (LRT.Train && typeof LRT.Train.closeDoors === 'function') {
      LRT.Train.closeDoors();
    }
    if (LRT.Train && typeof LRT.Train.ejectExteriorEntities === 'function') {
      LRT.Train.ejectExteriorEntities();
    }

    ensureCard();
    if (T.els) {
      T.els.bar.style.width = '100%';
      T.els.done.classList.remove('hidden');
      T.els.title.textContent = 'BRIEFING SELESAI';
      T.els.text.textContent = 'Pintu kereta terkunci di Ruang Kontrol. Pilih operasi selanjutnya.';
    }
    if (LRT.Audio && typeof LRT.Audio.play === 'function') {
      LRT.Audio.play('loot_chime', { gain: 0.75 });
    }
    if (LRT.PlayerUI && typeof LRT.PlayerUI.openTutorialCompleteModal === 'function') {
      LRT.PlayerUI.openTutorialCompleteModal();
    }
    return true;
  }

  function tutorialUpdate(dt, p) {
    if (!CORE.tutorialActive || !p) return;
    if (T.completedOverlayOpen) return;
    T.stepTime += dt;

    if (p.sprinting) T.sprinted = true;
    if (p.vel && p.vel.y > 1.0) T.jumped = true;
    if (!!p.flashlightOn !== T.lastFlashlight) {
      T.lastFlashlight = !!p.flashlightOn;
      T.flashlightToggled = true;
    }

    if (T.endTimer >= 0) {
      T.endTimer -= dt;
      if (T.endTimer <= 0) endTutorial('complete');
      return;
    }

    const st = STEPS[T.step];
    if (!st) return;

    if (st.marker) {
      const m = st.marker(p);
      if (m) {
        _marker.pos.x = m.x; _marker.pos.y = m.y; _marker.pos.z = m.z;
        _marker.label = m.label || '';
        _marker.active = true;
      } else {
        _marker.active = false;
      }
    } else {
      _marker.active = false;
    }

    if (st.check(p, dt)) {
      if (T.step >= STEPS.length - 1) {
        completeTutorialStep11();
      } else {
        advanceTo(T.step + 1);
      }
    }
  }

  function endTutorial(reason, opts) {
    if (!CORE.tutorialActive) return;
    const o = opts || {};
    CORE.tutorialActive = false;
    T.completedOverlayOpen = false;
    window.removeEventListener('keydown', onKeyDown, true);
    unwrapWeapons();
    unwrapStationInteract();
    _marker.active = false;
    if (T.card) T.card.classList.add('hidden');
    if (LRT.PlayerUI && typeof LRT.PlayerUI.closeTutorialCompleteModal === 'function') {
      LRT.PlayerUI.closeTutorialCompleteModal();
    }

    if (reason === 'complete' || reason === 'skip') markDone();

    const p = pState();
    if (p) p.invulnerable = T.prevInvulnerable;
    if (T.prevDifficulty) CORE.difficultyKey = T.prevDifficulty;

    if (LRT.Audio) {
      if (typeof LRT.Audio.stopVoice === 'function') LRT.Audio.stopVoice();
      if (typeof LRT.Audio.stopAllLoops === 'function') LRT.Audio.stopAllLoops();
    }

    if (o.stayInGame) {
      const starter = (LRT.Main && typeof LRT.Main.startGame === 'function')
        ? LRT.Main.startGame
        : CORE.startGame;
      if (typeof starter === 'function') {
        starter(C.MODES.SURVIVAL);
        return;
      }
    }

    // Reset the world and send the player back to the main menu with a fresh Station 0 backdrop.
    if (LRT.Station && LRT.Station.dispose) LRT.Station.dispose(CORE.scene);
    if (LRT.Enemies && LRT.Enemies.reset) LRT.Enemies.reset();
    if (LRT.Train && LRT.Train.reset) LRT.Train.reset(CORE.gameMode);
    if (typeof CORE.resetCampaignState === 'function') CORE.resetCampaignState();
    CORE.stationIndex = 0;
    CORE.activeTravelDir = 1;
    CORE.prevTrainState = 'AWAY';
    CORE.rideCompleteReady = false;
    CORE.boardingCloseTimer = 0;
    CORE.gameState = STATES.MENU;
    if (typeof CORE.syncMenuLights === 'function') CORE.syncMenuLights();
    if (typeof CORE.buildStation === 'function') CORE.buildStation(0, 0);
    if (typeof CORE.backToMenu === 'function') CORE.backToMenu();
  }

  // Interaction/document events routed in from the director and the HUD.
  CORE.onTutorialEvent = function (kind, item, res) {
    if (!CORE.tutorialActive) return;
    if (kind === 'interact' && item && item.type === 'turnstile') T.turnstileTapped = true;
    else if (kind === 'doc') T.docOpened = true;
    else if (kind === 'flashlight') T.flashlightToggled = true;
    else if (kind === 'shove') {
      if (res && (res.hit || (res.shoveRes && res.shoveRes.hitCount > 0))) T.shoved = true;
    } else if (kind === 'door_lock' && T.step >= STEPS.length - 1) {
      completeTutorialStep11();
    }
  };

  CORE.beginTutorial = beginTutorial;
  CORE.endTutorial = endTutorial;
  CORE.tutorialUpdate = tutorialUpdate;
  CORE.completeTutorialStep11 = completeTutorialStep11;
  CORE.getTutorialStep = function () { return T.step; };
  CORE.isTutorialDone = isDone;
  CORE.getTutorialMarkers = function () { return _marker.active ? _markers : _noMarkers; };
  CORE.getTutorialInfo = function () {
    const st = STEPS[T.step];
    return st ? { title: 'BRIEFING ' + (T.step + 1) + '/' + STEPS.length, detail: st.title } : null;
  };
})(window.LRT = window.LRT || {});
