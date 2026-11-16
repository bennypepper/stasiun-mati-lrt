(function (LRT) {
  'use strict';

  const C = LRT.Config;
  const P = C.PLAYER_CFG;

  let canvas = null;
  let camera = null;
  let flashlight = null;
  let flashlightTarget = null;
  let flashlightBounce = null;

  const dom = {};
  const keys = Object.create(null);
  let pointerLocked = false;
  let paused = true;
  let allowActionInput = false;

  let onPauseCb = null;
  let onSummonTrainCb = null;
  let onWeaponShootDownCb = null;
  let onWeaponShootUpCb = null;
  let onInteractResultCb = null;
  let subtitleTimer = 0;
  let logTimer = 0;
  let currentBrightness = 1.0;

  const state = {
    pos: new THREE.Vector3(4.0, 0.05, 6.0),
    vel: new THREE.Vector3(0, 0, 0),
    speed: 0,
    mode: 'survival',
    yaw: 0,
    pitch: 0,
    eyeHeight: P.eyeHeight,
    grounded: true,
    crouching: false,
    sprinting: false,
    ads: false,
    health: P.maxHealth,
    maxHealth: P.maxHealth,
    isInsideTrain: false,
    isSitting: false,
    seatLocalPos: null,
    standLocalPos: null,
    flashlightOn: false,
    hudHidden: false,
    invulnerable: false,
    kills: 0,
    lastSafePos: new THREE.Vector3(4.0, 0.05, 6.0),
    bobPhase: 0,
    stepDist: 0,
    stepAlternate: false,
    vignetteAlpha: 0,
    heartbeatActive: false,
    noticeTimer: 0,
    activeInteractable: null
  };

  const _tmpForward = new THREE.Vector3();
  const _tmpRight = new THREE.Vector3();
  const _tmpLook = new THREE.Vector3();
  const _tmpCandidates = [];

  // Reusable scratch objects for zero-alloc MeshBVH collision & raycasting
  const _bvhMeshes = [];
  const _bvhHits = [];
  const _bvhRaycaster = new THREE.Raycaster();
  _bvhRaycaster.firstHitOnly = true;
  const _bvhRayOrigin = new THREE.Vector3();
  const _bvhRayDir = new THREE.Vector3();
  const _bvhInvMat = new THREE.Matrix4();
  const _bvhBoxWorld = new THREE.Box3();
  const _bvhBoxLocal = new THREE.Box3();
  const _bvhSphereLow = new THREE.Sphere();
  const _bvhSphereHigh = new THREE.Sphere();
  const _bvhCenterLow = new THREE.Vector3();
  const _bvhCenterHigh = new THREE.Vector3();
  const _bvhClosest = new THREE.Vector3();
  const _bvhClosestWorld = new THREE.Vector3();
  const _bvhTriNorm = new THREE.Vector3();
  const _bvhNormalMat = new THREE.Matrix3();
  const _bvhFaceNorm = new THREE.Vector3();

  function cacheDom() {
    const ids = [
      'damage-vignette', 'hud', 'hud-mode-badge', 'hud-station-code',
      'hud-station-name', 'hud-station-sub', 'objective-title', 'objective-detail',
      'fps-readout', 'crosshair', 'hitmarker', 'hud-notice', 'interact-prompt',
      'interact-label', 'hud-subtitle-box', 'subtitle-speaker', 'subtitle-text-id', 'subtitle-text-en',
      'hud-log-banner', 'log-title', 'log-body',
      'vitals-card', 'hp-value', 'hp-bar-fill', 'pill-flashlight', 'pill-lighting', 'pill-hud',
      'pill-mute', 'weapon-name', 'ammo-mag', 'ammo-reserve', 'weapon-slots',
      'menu-overlay', 'pause-overlay', 'gameover-overlay', 'gameover-stats',
      'btn-start-survival', 'btn-start-exploration', 'btn-menu-settings', 'btn-menu-controls',
      'btn-menu-lighting', 'btn-pause-lighting',
      'menu-settings-panel', 'menu-controls-panel', 'brightness-slider', 'brightness-readout',
      'pause-brightness-slider', 'pause-brightness-readout',
      'btn-resume', 'btn-restart-mode', 'btn-back-menu', 'btn-retry', 'btn-gameover-menu',
      'btn-menu-mute', 'btn-pause-mute', 'menu-quality-group', 'pause-quality-group'
    ];
    for (const id of ids) {
      dom[id] = document.getElementById(id);
    }
  }

  function formatBrightnessLabel(val) {
    const pct = Math.round(val * 100);
    let tag = 'STANDARD';
    if (val <= 0.7) tag = 'DEEP HORROR';
    else if (val <= 1.05) tag = 'DARK HORROR';
    else if (val <= 1.35) tag = 'ELEVATED';
    else tag = 'BRIGHT';
    return `${pct}% · ${tag}`;
  }

  function syncBrightnessUi(val) {
    const num = typeof val === 'number' && !Number.isNaN(val) ? val : currentBrightness;
    currentBrightness = Math.max(0.4, Math.min(1.8, num));
    if (dom['brightness-slider']) dom['brightness-slider'].value = String(currentBrightness);
    if (dom['pause-brightness-slider']) dom['pause-brightness-slider'].value = String(currentBrightness);
    const label = formatBrightnessLabel(currentBrightness);
    if (dom['brightness-readout']) dom['brightness-readout'].textContent = label;
    if (dom['pause-brightness-readout']) dom['pause-brightness-readout'].textContent = label;
  }

  function applyBrightness(val) {
    const parsed = parseFloat(val);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(0.4, Math.min(1.8, parsed));
    syncBrightnessUi(clamped);
    if (LRT.Main && typeof LRT.Main.setBrightness === 'function') {
      LRT.Main.setBrightness(clamped);
    }
  }

  function setMenuSubpanel(panelName) {
    const showSettings = panelName === 'settings';
    const showControls = panelName === 'controls';
    if (dom['menu-settings-panel']) dom['menu-settings-panel'].classList.toggle('hidden', !showSettings);
    if (dom['menu-controls-panel']) dom['menu-controls-panel'].classList.toggle('hidden', !showControls);
    if (dom['btn-menu-settings']) dom['btn-menu-settings'].classList.toggle('active', showSettings);
    if (dom['btn-menu-controls']) dom['btn-menu-controls'].classList.toggle('active', showControls);
  }

  function setNotice(text, color) {
    if (!dom['hud-notice']) return;
    dom['hud-notice'].textContent = text;
    dom['hud-notice'].style.borderColor = color || 'rgba(224,180,34,0.65)';
    dom['hud-notice'].style.opacity = '1';
    state.noticeTimer = 2.6;
  }

  function showSubtitle(speaker, textId, textEn, durationSec) {
    if (typeof speaker === 'object' && speaker !== null) {
      const entry = speaker;
      durationSec = textId ?? entry.duration_sec;
      textEn = entry.subtitle_en;
      textId = entry.subtitle_id;
      speaker = entry.speaker;
    }

    const box = dom['hud-subtitle-box'];
    if (!box) return;

    const spEl = dom['subtitle-speaker'];
    if (spEl) {
      const sp = String(speaker || '').trim().toUpperCase();
      let badgeText = sp;
      let badgeClass = 'speaker-occ';
      if (sp.includes('OCC') || sp.includes('DISPATCH') || sp === 'SARAH') {
        badgeText = 'OCC BEKASI // SARAH';
        badgeClass = 'speaker-occ';
      } else if (sp.includes('PLAYER') || sp.includes('GAGAK') || sp.includes('G2') || sp === 'ARYA') {
        badgeText = 'GAGAK-03 // ARYA';
        badgeClass = 'speaker-player';
      } else if (sp.includes('SYSTEM') || sp.includes('ANN') || sp.includes('PA') || sp.includes('LRT')) {
        badgeText = 'LRT PA SYSTEM';
        badgeClass = 'speaker-ann';
      }
      spEl.textContent = badgeText;
      spEl.className = `badge ${badgeClass}`;
    }

    if (dom['subtitle-text-id']) {
      dom['subtitle-text-id'].textContent = textId || '';
    }

    if (dom['subtitle-text-en']) {
      dom['subtitle-text-en'].textContent = textEn || '';
      dom['subtitle-text-en'].classList.toggle('hidden', !textEn);
    }

    box.classList.remove('hidden');
    box.style.opacity = '1';
    subtitleTimer = Math.max(1.0, typeof durationSec === 'number' ? durationSec : 6.0);
  }

  function hideSubtitle() {
    subtitleTimer = 0;
    const box = dom['hud-subtitle-box'];
    if (box) {
      box.style.opacity = '0';
      box.classList.add('hidden');
    }
  }

  function showFieldLog(title, body, durationSec) {
    const banner = dom['hud-log-banner'];
    if (!banner) return;
    if (dom['log-title']) {
      dom['log-title'].textContent = title || 'CATATAN LAPANGAN // FIELD NOTE';
    }
    if (dom['log-body']) {
      dom['log-body'].textContent = body || '';
    }
    banner.classList.remove('hidden');
    banner.style.opacity = '1';
    logTimer = Math.max(2.0, typeof durationSec === 'number' ? durationSec : 8.0);
  }

  function hideFieldLog() {
    logTimer = 0;
    const banner = dom['hud-log-banner'];
    if (banner) {
      banner.style.opacity = '0';
      banner.classList.add('hidden');
    }
  }

  function toggleFlashlight() {
    state.flashlightOn = !state.flashlightOn;
    if (flashlight) {
      flashlight.visible = true;
      flashlight.intensity = state.flashlightOn ? 42.0 : 0;
    }
    if (flashlightBounce) {
      flashlightBounce.visible = true;
      flashlightBounce.intensity = state.flashlightOn ? 2.2 : 0;
    }
    if (dom['pill-flashlight']) {
      dom['pill-flashlight'].textContent = `[F] Senter: ${state.flashlightOn ? 'ON' : 'OFF'}`;
      dom['pill-flashlight'].classList.toggle('active', state.flashlightOn);
    }
    if (LRT.Audio) LRT.Audio.play('weapon_switch', { gain: 0.4, pitchVar: 0.05 });
  }

  function syncLightingUi(lightingKey, moodObj) {
    const key = lightingKey || 'DAYLIGHT_CLEAR';
    const labelMap = {
      DAYLIGHT_CLEAR: 'DAYLIGHT',
      DAYLIGHT_OVERCAST: 'OVERCAST',
      GOLDEN_DUSK: 'GOLDEN HOUR',
      BLACKOUT_EMERGENCY: 'NIGHT BLACKOUT',
      CRIMSON_BLOOD_MOON: 'BLOOD MOON',
      MONSOON_OVERCAST: 'MONSOON NIGHT',
      TOXIC_SMOG: 'TOXIC SMOG',
      HAZY_DUSK: 'HAZY DUSK'
    };
    const shortMap = {
      DAYLIGHT_CLEAR: 'DAY',
      DAYLIGHT_OVERCAST: 'CLOUD',
      GOLDEN_DUSK: 'DUSK',
      BLACKOUT_EMERGENCY: 'NIGHT',
      CRIMSON_BLOOD_MOON: 'BLOOD',
      MONSOON_OVERCAST: 'STORM',
      TOXIC_SMOG: 'SMOG',
      HAZY_DUSK: 'HAZE'
    };
    const btnText = labelMap[key] || (moodObj && moodObj.name) || key;
    const pillShort = shortMap[key] || 'DAY';
    const isDay = moodObj ? !!moodObj.isDaylight : (key.startsWith('DAY') || key.startsWith('GOLD'));

    if (dom['btn-menu-lighting']) dom['btn-menu-lighting'].textContent = btnText;
    if (dom['btn-pause-lighting']) dom['btn-pause-lighting'].textContent = btnText;
    if (dom['pill-lighting']) {
      dom['pill-lighting'].textContent = `[L] Light: ${pillShort}`;
      dom['pill-lighting'].classList.toggle('active', isDay);
    }
  }

  function toggleHud() {
    state.hudHidden = !state.hudHidden;
    if (dom.hud) dom.hud.classList.toggle('hud-minimal', state.hudHidden);
    if (dom['pill-hud']) dom['pill-hud'].classList.toggle('active', !state.hudHidden);
  }

  function syncMuteUi() {
    const isMuted = LRT.Audio ? LRT.Audio.isMuted() : false;
    const toggleLabel = isMuted ? 'OFF' : 'ON';
    if (dom['btn-menu-mute']) {
      dom['btn-menu-mute'].textContent = toggleLabel;
      dom['btn-menu-mute'].classList.toggle('is-muted', isMuted);
    }
    if (dom['btn-pause-mute']) {
      dom['btn-pause-mute'].textContent = toggleLabel;
      dom['btn-pause-mute'].classList.toggle('is-muted', isMuted);
    }
    if (dom['pill-mute']) {
      dom['pill-mute'].textContent = `[M] ${isMuted ? 'Muted' : 'Audio'}`;
      dom['pill-mute'].classList.toggle('active', !isMuted);
    }
  }

  function syncQualityUi(tierKey) {
    const groups = [dom['menu-quality-group'], dom['pause-quality-group']];
    for (const g of groups) {
      if (!g) continue;
      g.querySelectorAll('[data-quality]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.quality === tierKey);
      });
    }
  }

  function requestLock() {
    if (!canvas || typeof canvas.requestPointerLock !== 'function') return;
    try {
      const res = canvas.requestPointerLock();
      if (res && typeof res.catch === 'function') res.catch(() => {});
    } catch (_) {}
  }

  function releaseLock() {
    if (document.pointerLockElement && typeof document.exitPointerLock === 'function') {
      try { document.exitPointerLock(); } catch (_) {}
    }
  }

  function bindInputs() {
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'F3') e.preventDefault();
      if (!allowActionInput || paused) return;

      if (e.code === 'Digit1') LRT.Weapons && LRT.Weapons.switchWeapon(1);
      else if (e.code === 'Digit2') LRT.Weapons && LRT.Weapons.switchWeapon(2);
      else if (e.code === 'Digit3') LRT.Weapons && LRT.Weapons.switchWeapon(3);
      else if (e.code === 'Digit4') LRT.Weapons && LRT.Weapons.switchWeapon(4);
      else if (e.code === 'KeyR') LRT.Weapons && LRT.Weapons.reload();
      else if (e.code === 'KeyF') toggleFlashlight();
      else if (e.code === 'KeyL') {
        if (LRT.Main && typeof LRT.Main.cycleLightingMode === 'function') {
          LRT.Main.cycleLightingMode();
        }
      } else if (e.code === 'KeyH') toggleHud();
      else if (e.code === 'F3') {
        if (dom['fps-readout']) dom['fps-readout'].classList.toggle('hidden');
      } else if (e.code === 'KeyM') {
        if (LRT.Audio) {
          LRT.Audio.setMute(!LRT.Audio.isMuted());
          syncMuteUi();
        }
      } else if (e.code === 'KeyE') {
        if (state.isSitting) {
          standFromSeat();
        } else {
          triggerInteract();
        }
      } else if (e.code === 'KeyT') {
        if (onSummonTrainCb) onSummonTrainCb(0);
      } else if (e.code === 'KeyC') {
        if (state.isSitting) standFromSeat();
      } else if (e.code === 'Space') {
        if (state.isSitting) {
          standFromSeat();
        } else if (state.grounded && !state.crouching) {
          state.vel.y = P.jumpSpeed;
          state.grounded = false;
        }
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      for (const k of Object.keys(keys)) keys[k] = false;
      state.ads = false;
      if (LRT.Weapons) LRT.Weapons.setADS(false);
      if (onWeaponShootUpCb) onWeaponShootUpCb();
    });

    document.addEventListener('mousemove', (e) => {
      if (paused || !allowActionInput) return;
      if (document.pointerLockElement !== canvas) return;
      // Chromium pointer lock spike guard
      if (Math.abs(e.movementX) > 180 || Math.abs(e.movementY) > 180) return;
      const sens = P.mouseSensitivity * (state.ads ? 0.65 : 1.0);
      state.yaw -= e.movementX * sens;
      state.pitch = Math.max(-1.46, Math.min(1.46, state.pitch - e.movementY * sens));
    });

    canvas.addEventListener('mousedown', (e) => {
      if (paused || !allowActionInput) return;
      if (document.pointerLockElement !== canvas) {
        requestLock();
      }
      if (e.button === 0) {
        if (onWeaponShootDownCb) onWeaponShootDownCb();
        else if (LRT.Weapons) LRT.Weapons.fireDown();
      } else if (e.button === 2) {
        state.ads = true;
        if (LRT.Weapons) LRT.Weapons.setADS(true);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        if (onWeaponShootUpCb) onWeaponShootUpCb();
        else if (LRT.Weapons) LRT.Weapons.fireUp();
      } else if (e.button === 2) {
        state.ads = false;
        if (LRT.Weapons) LRT.Weapons.setADS(false);
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('wheel', (e) => {
      if (paused || !allowActionInput || !LRT.Weapons || !LRT.Weapons.getHudState) return;
      const hud = LRT.Weapons.getHudState();
      if (!hud) return;
      let next = hud.slot + (e.deltaY > 0 ? 1 : -1);
      if (next > 4) next = 1;
      if (next < 1) next = 4;
      LRT.Weapons.switchWeapon(next);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      pointerLocked = document.pointerLockElement === canvas;
      if (!pointerLocked && allowActionInput && !paused && onPauseCb) {
        onPauseCb();
      }
    });

    if (dom['btn-menu-settings']) {
      dom['btn-menu-settings'].addEventListener('click', () => {
        const isOpen = dom['menu-settings-panel'] && !dom['menu-settings-panel'].classList.contains('hidden');
        setMenuSubpanel(isOpen ? null : 'settings');
      });
    }
    if (dom['btn-menu-controls']) {
      dom['btn-menu-controls'].addEventListener('click', () => {
        const isOpen = dom['menu-controls-panel'] && !dom['menu-controls-panel'].classList.contains('hidden');
        setMenuSubpanel(isOpen ? null : 'controls');
      });
    }
    [dom['brightness-slider'], dom['pause-brightness-slider']].forEach((slider) => {
      if (!slider) return;
      slider.addEventListener('input', (e) => applyBrightness(e.target.value));
      slider.addEventListener('change', (e) => applyBrightness(e.target.value));
    });
  }

  function sitInTrain(seatLocal, standLocal) {
    if (!seatLocal) return;
    const tz = (LRT.Train && LRT.Train.getOffsetZ) ? LRT.Train.getOffsetZ() : 0;
    state.isSitting = true;
    state.seatLocalPos = { x: seatLocal.x, y: seatLocal.y || 0, z: seatLocal.z, yaw: seatLocal.yaw };
    state.standLocalPos = standLocal
      ? { x: standLocal.x, y: standLocal.y || 0, z: standLocal.z }
      : { x: seatLocal.x * 0.25, y: 0, z: seatLocal.z };
    const worldSeat = (LRT.Train && LRT.Train.localToWorld)
      ? LRT.Train.localToWorld(state.seatLocalPos)
      : { x: state.seatLocalPos.x, y: state.seatLocalPos.y, z: state.seatLocalPos.z + tz, yaw: seatLocal.yaw };
    if (typeof worldSeat.yaw === 'number') state.yaw = worldSeat.yaw;
    else if (typeof seatLocal.yaw === 'number') state.yaw = seatLocal.yaw;
    state.pitch = 0;
    state.vel.set(0, 0, 0);
    state.grounded = true;
    state.crouching = false;
    state.sprinting = false;
    state.pos.set(worldSeat.x, worldSeat.y || 0, worldSeat.z);
    state.lastSafePos.copy(state.pos);
    state.isInsideTrain = true;
  }

  function standFromSeat(silent) {
    if (!state.isSitting) return;
    const tz = (LRT.Train && LRT.Train.getOffsetZ) ? LRT.Train.getOffsetZ() : 0;
    const sl = state.standLocalPos || { x: 0.0, y: 0.0, z: state.seatLocalPos ? state.seatLocalPos.z : 0.0 };
    const worldStand = (LRT.Train && LRT.Train.localToWorld)
      ? LRT.Train.localToWorld(sl)
      : { x: sl.x, y: sl.y || 0.02, z: sl.z + tz };
    state.isSitting = false;
    state.pos.set(worldStand.x, worldStand.y || 0.02, worldStand.z);
    state.vel.set(0, 0, 0);
    state.grounded = true;
    state.seatLocalPos = null;
    state.standLocalPos = null;
    state.lastSafePos.copy(state.pos);
    if (!silent) setNotice('Berdiri di lorong kereta LRT', '#94a3b8');
  }

  function triggerInteract() {
    if (state.isSitting) {
      standFromSeat();
      return;
    }
    const item = state.activeInteractable;
    if (!item) return;

    let res = null;

    if (item._source === 'train' && LRT.Train && LRT.Train.interact) {
      res = LRT.Train.interact(item.id);
      if (res && res.action === 'sit' && res.seatLocal) {
        sitInTrain(res.seatLocal, res.standLocal);
      }
      if (res && res.message) setNotice(res.message, '#4ade80');
    } else if (item._source === 'city' && LRT.City && LRT.City.interact) {
      res = LRT.City.interact(item.id);
      if (res && res.message) setNotice(res.message, '#e0b422');
    } else if (item._source === 'station' && LRT.Station && LRT.Station.interact) {
      res = LRT.Station.interact(item.id);
      if (res && res.message) setNotice(res.message, '#e0b422');
    } else if (LRT.Station && LRT.Station.interact) {
      res = LRT.Station.interact(item.id);
      if (res && res.message) setNotice(res.message, '#e0b422');
    }

    if (res) {
      const healAmt = res.healAmount ?? res.heal ?? 0;
      if (healAmt > 0 && state.health < state.maxHealth) {
        state.health = Math.min(state.maxHealth, state.health + healAmt);
      }
      if (res.ammo && LRT.Weapons && LRT.Weapons.addAmmo) {
        LRT.Weapons.addAmmo(res.ammo.type || 'all', res.ammo.amount || 15);
      } else if (res.ammoBonus && LRT.Weapons && LRT.Weapons.addAmmo) {
        LRT.Weapons.addAmmo('all', 20);
      }
      if ((res.triggerTrainCall || res.action === 'call_train' || res.action === 'call_train_prev') && onSummonTrainCb) {
        onSummonTrainCb(res.direction || (res.action === 'call_train_prev' ? -1 : 1));
      }
      if (res.logTitle && res.logBody) {
        showFieldLog(res.logTitle, res.logBody, 9.0);
      }
      if (onInteractResultCb) {
        try {
          onInteractResultCb(res, item);
        } catch (cbErr) {
          console.warn('[LRT.PlayerUI] onInteractResultCb error:', cbErr);
        }
      }
    }
  }

  function collectNearbyColliders(x, z, stationGrid, stationColliders, trainColliders) {
    _tmpCandidates.length = 0;
    if (stationGrid) {
      const fn = stationGrid.queryPoint || stationGrid.query;
      if (typeof fn === 'function') {
        const found = fn.call(stationGrid, x, z, 2.4);
        if (found && found.length) {
          for (let i = 0; i < found.length; i++) _tmpCandidates.push(found[i]);
        }
      }
    } else if (Array.isArray(stationColliders)) {
      for (let i = 0; i < stationColliders.length; i++) _tmpCandidates.push(stationColliders[i]);
    }
    if (Array.isArray(trainColliders)) {
      for (let i = 0; i < trainColliders.length; i++) _tmpCandidates.push(trainColliders[i]);
    }
    return _tmpCandidates;
  }

  function isObjectVisibleInHierarchy(obj) {
    let cur = obj;
    while (cur) {
      if (!cur.visible) return false;
      cur = cur.parent;
    }
    return true;
  }

  function gatherBVHMeshes(worldCtx) {
    _bvhMeshes.length = 0;
    const pushSource = (src) => {
      if (!src) return;
      if (Array.isArray(src)) {
        for (let i = 0; i < src.length; i++) {
          const m = src[i];
          if (m && m.geometry && m.geometry.boundsTree && _bvhMeshes.indexOf(m) === -1 && isObjectVisibleInHierarchy(m)) {
            _bvhMeshes.push(m);
          }
        }
      } else if (src.geometry && src.geometry.boundsTree && _bvhMeshes.indexOf(src) === -1 && isObjectVisibleInHierarchy(src)) {
        _bvhMeshes.push(src);
      }
    };

    if (worldCtx && worldCtx.bvhMeshes) pushSource(worldCtx.bvhMeshes);
    if (LRT.Station) {
      if (typeof LRT.Station.getBVHMeshes === 'function') pushSource(LRT.Station.getBVHMeshes());
      if (typeof LRT.Station.getBVHMesh === 'function') pushSource(LRT.Station.getBVHMesh());
    }
    if (LRT.City) {
      if (typeof LRT.City.getBVHMeshes === 'function') pushSource(LRT.City.getBVHMeshes());
      if (typeof LRT.City.getBVHMesh === 'function') pushSource(LRT.City.getBVHMesh());
    }
    return _bvhMeshes;
  }

  function resolveHorizontal(nx, nz, feetY, height, radius, colliders) {
    let px = nx;
    let pz = nz;
    const topY = feetY + height;
    const stepTop = feetY + P.stepHeight;

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < colliders.length; i++) {
        const b = colliders[i];
        if (!b || b.blocksWalk === false || b.disabled || b.isTrigger) continue;

        if (b.isRamp) {
          const closestX = Math.max(b.minX, Math.min(px, b.maxX));
          const closestZ = Math.max(b.minZ, Math.min(pz, b.maxZ));
          const dx = px - closestX;
          const dz = pz - closestZ;
          const distSq = dx * dx + dz * dz;
          if (distSq >= radius * radius) continue;

          const yA = typeof b.y0 === 'number' ? b.y0 : b.minY;
          const yB = typeof b.y1 === 'number' ? b.y1 : b.maxY;
          let t = 0;
          if (b.rampAxis === 'x') {
            t = (closestX - b.minX) / Math.max(0.01, b.maxX - b.minX);
          } else {
            t = (closestZ - b.minZ) / Math.max(0.01, b.maxZ - b.minZ);
          }
          t = Math.max(0, Math.min(1, t));
          const rampSurfaceY = yA + (yB - yA) * t;
          if (rampSurfaceY <= stepTop + 0.08 || b.minY >= topY) continue;

          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            px += (dx / dist) * push;
            pz += (dz / dist) * push;
          } else {
            const penLeft = px - b.minX + radius;
            const penRight = b.maxX - px + radius;
            const penBack = pz - b.minZ + radius;
            const penFront = b.maxZ - pz + radius;
            const minPen = Math.min(penLeft, penRight, penBack, penFront);
            if (minPen === penLeft) px = b.minX - radius;
            else if (minPen === penRight) px = b.maxX + radius;
            else if (minPen === penBack) pz = b.minZ - radius;
            else pz = b.maxZ + radius;
          }
          continue;
        }

        if (b.maxY <= stepTop || b.minY >= topY) continue;

        const closestX = Math.max(b.minX, Math.min(px, b.maxX));
        const closestZ = Math.max(b.minZ, Math.min(pz, b.maxZ));
        const dx = px - closestX;
        const dz = pz - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq >= radius * radius) continue;

        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          px += (dx / dist) * push;
          pz += (dz / dist) * push;
        } else {
          // Inside AABB: push out along shallowest axis
          const penLeft = px - b.minX + radius;
          const penRight = b.maxX - px + radius;
          const penBack = pz - b.minZ + radius;
          const penFront = b.maxZ - pz + radius;
          const minPen = Math.min(penLeft, penRight, penBack, penFront);
          if (minPen === penLeft) px = b.minX - radius;
          else if (minPen === penRight) px = b.maxX + radius;
          else if (minPen === penBack) pz = b.minZ - radius;
          else pz = b.maxZ + radius;
        }
      }
    }
    return { x: px, z: pz };
  }

  function getBVHWorldBox(mesh) {
    if (!mesh || !mesh.geometry) return null;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return null;

    const zPos = mesh.matrixWorld ? mesh.matrixWorld.elements[14] : 0;
    if (!mesh.userData._bvhWorldBox || mesh.userData._bvhMatVersion !== zPos) {
      mesh.updateWorldMatrix(true, false);
      if (!mesh.userData._bvhWorldBox) mesh.userData._bvhWorldBox = new THREE.Box3();
      mesh.userData._bvhWorldBox.copy(bb).applyMatrix4(mesh.matrixWorld);
      mesh.userData._bvhMatVersion = mesh.matrixWorld.elements[14];
    }
    return mesh.userData._bvhWorldBox;
  }

  function resolveBVHHorizontal(nx, nz, feetY, height, radius, bvhMeshes) {
    if (!bvhMeshes || bvhMeshes.length === 0) return { x: nx, z: nz };
    let px = nx;
    let pz = nz;
    const stepTop = feetY + P.stepHeight;
    const lowY = feetY + P.stepHeight + 0.16;
    const highY = feetY + Math.max(P.stepHeight + 0.36, height - 0.34);
    const rSq = radius * radius;

    for (let pass = 0; pass < 2; pass++) {
      _bvhBoxWorld.min.set(px - radius - 0.05, feetY + P.stepHeight * 0.65, pz - radius - 0.05);
      _bvhBoxWorld.max.set(px + radius + 0.05, feetY + height - 0.06, pz + radius + 0.05);

      for (let m = 0; m < bvhMeshes.length; m++) {
        const mesh = bvhMeshes[m];
        const bvh = mesh.geometry && mesh.geometry.boundsTree;
        if (!bvh) continue;

        const worldBox = getBVHWorldBox(mesh);
        if (worldBox && !_bvhBoxWorld.intersectsBox(worldBox)) {
          continue;
        }

        mesh.updateWorldMatrix(true, false);
        _bvhInvMat.copy(mesh.matrixWorld).invert();
        _bvhBoxLocal.copy(_bvhBoxWorld).applyMatrix4(_bvhInvMat);
        _bvhNormalMat.getNormalMatrix(mesh.matrixWorld);

        _bvhCenterLow.set(px, lowY, pz).applyMatrix4(_bvhInvMat);
        _bvhCenterHigh.set(px, highY, pz).applyMatrix4(_bvhInvMat);
        _bvhSphereLow.set(_bvhCenterLow, radius);
        _bvhSphereHigh.set(_bvhCenterHigh, radius);

        bvh.shapecast({
          intersectsBounds: (box) => box.intersectsBox(_bvhBoxLocal),
          intersectsTriangle: (tri) => {
            tri.getNormal(_bvhTriNorm);
            _bvhTriNorm.applyMatrix3(_bvhNormalMat).normalize();
            // Skip walkable floors & gentle slopes
            if (Math.abs(_bvhTriNorm.y) > 0.65) return false;

            const testSphere = (sph) => {
              tri.closestPointToPoint(sph.center, _bvhClosest);
              _bvhClosestWorld.copy(_bvhClosest).applyMatrix4(mesh.matrixWorld);
              if (_bvhClosestWorld.y <= stepTop) return;

              const dx = px - _bvhClosestWorld.x;
              const dz = pz - _bvhClosestWorld.z;
              const dSq = dx * dx + dz * dz;
              if (dSq >= rSq) return;

              if (dSq > 1e-6) {
                const d = Math.sqrt(dSq);
                const push = radius - d;
                px += (dx / d) * push;
                pz += (dz / d) * push;
              } else {
                const nLen = Math.hypot(_bvhTriNorm.x, _bvhTriNorm.z);
                if (nLen > 1e-4) {
                  px += (_bvhTriNorm.x / nLen) * radius;
                  pz += (_bvhTriNorm.z / nLen) * radius;
                }
              }
              _bvhCenterLow.set(px, lowY, pz).applyMatrix4(_bvhInvMat);
              _bvhCenterHigh.set(px, highY, pz).applyMatrix4(_bvhInvMat);
              _bvhSphereLow.center.copy(_bvhCenterLow);
              _bvhSphereHigh.center.copy(_bvhCenterHigh);
            };

            if (tri.intersectsSphere(_bvhSphereLow)) testSphere(_bvhSphereLow);
            if (tri.intersectsSphere(_bvhSphereHigh)) testSphere(_bvhSphereHigh);
            return false;
          }
        });
      }
    }
    return { x: px, z: pz };
  }

  function findBVHGroundAndCeiling(px, pz, feetY, height, bvhMeshes, groundY, ceilY) {
    if (!bvhMeshes || bvhMeshes.length === 0) return { groundY, ceilY };
    const stepTop = feetY + P.stepHeight + 0.08;
    const r = P.radius;

    _bvhRayOrigin.set(px, feetY + P.stepHeight + 0.22, pz);
    _bvhRayDir.set(0, -1, 0);
    _bvhRaycaster.set(_bvhRayOrigin, _bvhRayDir);
    _bvhRaycaster.near = 0.0;
    _bvhRaycaster.far = P.stepHeight + 8.5;
    _bvhRaycaster.firstHitOnly = true;

    for (let m = 0; m < bvhMeshes.length; m++) {
      const mesh = bvhMeshes[m];
      const worldBox = getBVHWorldBox(mesh);
      if (worldBox) {
        if (px + r < worldBox.min.x || px - r > worldBox.max.x ||
            pz + r < worldBox.min.z || pz - r > worldBox.max.z) {
          continue;
        }
      }

      mesh.updateWorldMatrix(true, false);
      _bvhHits.length = 0;
      _bvhRaycaster.intersectObject(mesh, false, _bvhHits);
      if (_bvhHits.length > 0) {
        const hit = _bvhHits[0];
        let validSlope = true;
        if (hit.face) {
          _bvhNormalMat.getNormalMatrix(mesh.matrixWorld);
          _bvhFaceNorm.copy(hit.face.normal).applyMatrix3(_bvhNormalMat).normalize();
          if (Math.abs(_bvhFaceNorm.y) <= 0.35) validSlope = false;
        }
        if (validSlope && hit.point.y <= stepTop && hit.point.y > groundY) {
          groundY = hit.point.y;
        }
      }
    }

    _bvhRayOrigin.set(px, feetY + 0.45, pz);
    _bvhRayDir.set(0, 1, 0);
    _bvhRaycaster.set(_bvhRayOrigin, _bvhRayDir);
    _bvhRaycaster.near = 0.0;
    _bvhRaycaster.far = height + 0.4;
    for (let m = 0; m < bvhMeshes.length; m++) {
      const mesh = bvhMeshes[m];
      const worldBox = getBVHWorldBox(mesh);
      if (worldBox) {
        if (px + r < worldBox.min.x || px - r > worldBox.max.x ||
            pz + r < worldBox.min.z || pz - r > worldBox.max.z) {
          continue;
        }
      }

      _bvhHits.length = 0;
      _bvhRaycaster.intersectObject(mesh, false, _bvhHits);
      if (_bvhHits.length > 0 && _bvhHits[0].point.y < ceilY && _bvhHits[0].point.y >= feetY + height * 0.5) {
        ceilY = _bvhHits[0].point.y;
      }
    }

    return { groundY, ceilY };
  }

  function findSupportAndCeiling(px, pz, feetY, height, radius, colliders) {
    let groundY = -999;
    let ceilY = 999;
    let groundTag = 'concrete';
    const stepTop = feetY + P.stepHeight;

    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (!b || b.blocksWalk === false || b.disabled || b.isTrigger) continue;

      if (px + radius <= b.minX || px - radius >= b.maxX) continue;
      if (pz + radius <= b.minZ || pz - radius >= b.maxZ) continue;

      if (b.isRamp) {
        let t = 0;
        if (b.rampAxis === 'x') {
          t = (px - b.minX) / Math.max(0.01, b.maxX - b.minX);
        } else {
          t = (pz - b.minZ) / Math.max(0.01, b.maxZ - b.minZ);
        }
        t = Math.max(0, Math.min(1, t));
        const yA = typeof b.y0 === 'number' ? b.y0 : b.minY;
        const yB = typeof b.y1 === 'number' ? b.y1 : b.maxY;
        const rampY = yA + (yB - yA) * t;
        if (rampY <= stepTop + 0.15 && rampY > groundY) {
          groundY = rampY;
          groundTag = b.tag || 'concrete';
        }
        continue;
      }

      if (b.maxY <= stepTop && b.maxY > groundY) {
        groundY = b.maxY;
        groundTag = b.tag || 'concrete';
      }
      if (b.minY >= feetY + height * 0.5 && b.minY < ceilY) {
        ceilY = b.minY;
      }
    }
    return { groundY, ceilY, groundTag };
  }

  function update(dt, worldCtx) {
    if (!camera) return;

    // Update toast notice timer
    if (state.noticeTimer > 0) {
      state.noticeTimer -= dt;
      if (state.noticeTimer <= 0 && dom['hud-notice']) {
        dom['hud-notice'].style.opacity = '0';
      }
    }

    // Subtitle timer
    if (subtitleTimer > 0) {
      subtitleTimer -= dt;
      if (subtitleTimer <= 0) {
        hideSubtitle();
      }
    }

    // Field log toast timer
    if (logTimer > 0) {
      logTimer -= dt;
      if (logTimer <= 0) {
        hideFieldLog();
      }
    }

    // Vignette decay
    if (state.vignetteAlpha > 0) {
      state.vignetteAlpha = Math.max(0, state.vignetteAlpha - dt * 1.8);
    }
    if (dom['damage-vignette']) {
      const lowHpPulse = state.health < 30 ? (0.18 + 0.12 * Math.sin(performance.now() * 0.008)) : 0;
      dom['damage-vignette'].style.opacity = String(Math.min(0.95, Math.max(state.vignetteAlpha, lowHpPulse)));
    }

    if (paused) return;

    let horizSpeed = 0;
    if (state.isSitting && state.seatLocalPos) {
      if (!LRT.Train || !LRT.Train.getState || LRT.Train.getState() === 'AWAY') {
        standFromSeat(true);
      } else {
        const tz = LRT.Train.getOffsetZ ? LRT.Train.getOffsetZ() : 0;
        const w = LRT.Train.localToWorld
          ? LRT.Train.localToWorld(state.seatLocalPos)
          : { x: state.seatLocalPos.x, y: state.seatLocalPos.y, z: state.seatLocalPos.z + tz };
        state.pos.set(w.x, w.y || 0, w.z);
        state.vel.set(0, 0, 0);
        state.grounded = true;
        state.crouching = false;
        state.sprinting = false;
        state.isInsideTrain = true;
        state.speed = 0;
        state.eyeHeight += (1.10 - state.eyeHeight) * Math.min(1, dt * 12);
        state.bobPhase = 0;
      }
    }

    if (!state.isSitting) {
      // Input axes
      const fInput = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const sInput = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      state.crouching = !!(keys.ControlLeft || keys.ControlRight || keys.KeyC);
      state.sprinting = !!(keys.ShiftLeft || keys.ShiftRight) && fInput > 0 && !state.crouching && !state.ads;

      const targetEye = state.crouching ? P.crouchEyeHeight : P.eyeHeight;
      state.eyeHeight += (targetEye - state.eyeHeight) * Math.min(1, dt * 12);

      const speed = state.crouching ? P.crouchSpeed : (state.sprinting ? P.sprintSpeed : P.walkSpeed);
      const sinY = Math.sin(state.yaw);
      const cosY = Math.cos(state.yaw);
      _tmpForward.set(-sinY, 0, -cosY);
      _tmpRight.set(cosY, 0, -sinY);

      let moveX = _tmpForward.x * fInput + _tmpRight.x * sInput;
      let moveZ = _tmpForward.z * fInput + _tmpRight.z * sInput;
      const moveLen = Math.hypot(moveX, moveZ);
      if (moveLen > 1e-4) {
        moveX = (moveX / moveLen) * speed;
        moveZ = (moveZ / moveLen) * speed;
      }

      const accel = state.grounded ? 16.0 : 5.0;
      state.vel.x += (moveX - state.vel.x) * Math.min(1, dt * accel);
      state.vel.z += (moveZ - state.vel.z) * Math.min(1, dt * accel);
      state.vel.y -= P.gravity * dt;

      const colliders = collectNearbyColliders(
        state.pos.x,
        state.pos.z,
        worldCtx.stationGrid,
        worldCtx.stationColliders,
        worldCtx.trainColliders
      );
      const trainMovingInside = state.isInsideTrain && LRT.Train && LRT.Train.getSpeed && LRT.Train.getSpeed() > 0.5;
      const bvhMeshes = trainMovingInside ? null : gatherBVHMeshes(worldCtx);

      const capsuleH = state.crouching ? 1.24 : P.capsuleHeight;
      const nx = state.pos.x + state.vel.x * dt;
      const nz = state.pos.z + state.vel.z * dt;
      let resolved = resolveHorizontal(nx, nz, state.pos.y, capsuleH, P.radius, colliders);
      if (bvhMeshes && bvhMeshes.length > 0) {
        resolved = resolveBVHHorizontal(resolved.x, resolved.z, state.pos.y, capsuleH, P.radius, bvhMeshes);
        // Re-clamp against AABBs after BVH pushout so player never enters train/glass boxes
        resolved = resolveHorizontal(resolved.x, resolved.z, state.pos.y, capsuleH, P.radius, colliders);
      }
      state.pos.x = resolved.x;
      state.pos.z = resolved.z;

      let ny = state.pos.y + state.vel.y * dt;
      const sup = findSupportAndCeiling(state.pos.x, state.pos.z, ny, capsuleH, P.radius, colliders);
      if (bvhMeshes && bvhMeshes.length > 0) {
        const bvhSup = findBVHGroundAndCeiling(state.pos.x, state.pos.z, ny, capsuleH, bvhMeshes, sup.groundY, sup.ceilY);
        sup.groundY = bvhSup.groundY;
        sup.ceilY = bvhSup.ceilY;
      }

      if (ny + capsuleH > sup.ceilY && state.vel.y > 0) {
        ny = sup.ceilY - capsuleH;
        state.vel.y = 0;
      }
      if (ny <= sup.groundY) {
        ny = sup.groundY;
        state.vel.y = 0;
        state.grounded = true;
      } else {
        state.grounded = false;
      }

      // Ground-level safety boundary: never permanently drop into void
      if (ny < -5.5) {
        state.pos.copy(state.lastSafePos);
        state.vel.set(0, 0, 0);
        state.grounded = true;
      } else {
        state.pos.y = ny;
        if (state.grounded && ny >= -1.5) {
          state.lastSafePos.copy(state.pos);
        }
      }

      // Track whether player is inside train bounds
      if (LRT.Train && typeof LRT.Train.isPlayerInside === 'function') {
        state.isInsideTrain = !!LRT.Train.isPlayerInside(state.pos);
      } else {
        state.isInsideTrain = false;
      }

      // Footstep cadence & subtle camera bob
      horizSpeed = Math.hypot(state.vel.x, state.vel.z);
      state.speed = horizSpeed;
      if (state.grounded && horizSpeed > 0.45) {
        const stepStride = state.sprinting ? 1.48 : 1.85;
        state.stepDist += horizSpeed * dt;
        state.bobPhase += horizSpeed * dt * 2.2;
        if (state.stepDist >= stepStride) {
          state.stepDist = 0;
          state.stepAlternate = !state.stepAlternate;
          if (LRT.Audio) {
            const isMetal = state.isInsideTrain || sup.groundTag === 'metal' || sup.groundTag === 'train_floor';
            const key = isMetal ? 'footstep_metal' : (state.stepAlternate ? 'footstep_concrete_1' : 'footstep_concrete_2');
            LRT.Audio.play(key, { gain: state.crouching ? 0.25 : 0.45, pitchVar: 0.09 });
          }
        }
      } else {
        state.bobPhase *= Math.max(0, 1 - dt * 8);
      }
    }

    // Apply camera transform + ADS FOV (fallback if Weapons not loaded) + weapon recoil/shake
    if (!LRT.Weapons || !LRT.Weapons.update) {
      const targetFov = state.ads ? P.adsFov : P.baseFov;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
        camera.updateProjectionMatrix();
      }
    }

    let shakePitch = 0;
    let shakeYaw = 0;
    let shakeRoll = 0;
    if (LRT.Weapons && typeof LRT.Weapons.consumeCameraKick === 'function') {
      const kick = LRT.Weapons.consumeCameraKick();
      if (kick) {
        state.pitch = Math.max(-1.46, Math.min(1.46, state.pitch + (kick.recoilPitch || 0)));
        state.yaw += (kick.recoilYaw || 0);
        shakePitch = kick.shakePitch || 0;
        shakeYaw = kick.shakeYaw || 0;
        shakeRoll = kick.shakeRoll || 0;
      }
    }

    const bobY = state.grounded && horizSpeed > 0.4 ? Math.sin(state.bobPhase) * 0.032 : 0;
    const trainBobY = (state.isInsideTrain && LRT.Train && LRT.Train.getSpeed && LRT.Train.getSpeed() > 1)
      ? Math.sin(performance.now() * 0.015) * 0.008
      : 0;

    camera.position.set(
      state.pos.x,
      state.pos.y + state.eyeHeight + bobY + trainBobY,
      state.pos.z
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.yaw + shakeYaw;
    camera.rotation.x = Math.max(-1.48, Math.min(1.48, state.pitch + shakePitch));
    camera.rotation.z = shakeRoll;

    // Look vector for interaction detection
    camera.getWorldDirection(_tmpLook);
    let near = null;
    if (state.isSitting) {
      near = {
        _source: 'seat',
        id: 'train_stand_up',
        label: 'BERDIRI DARI KURSI / STAND UP ([Space] / [C])',
        prompt: '[E] BERDIRI DARI KURSI / STAND UP ([Space] / [C])'
      };
    } else {
      if (LRT.Train && LRT.Train.getInteractableNear) {
        const tr = LRT.Train.getInteractableNear(camera.position, _tmpLook);
        if (tr) near = Object.assign({ _source: 'train' }, tr);
      }
      if (!near && LRT.Station && LRT.Station.getInteractableNear) {
        const st = LRT.Station.getInteractableNear(camera.position, _tmpLook);
        if (st) near = Object.assign({ _source: 'station' }, st);
      }
      if (!near && LRT.City && LRT.City.getInteractableNear) {
        const ct = LRT.City.getInteractableNear(camera.position, _tmpLook);
        if (ct) near = Object.assign({ _source: 'city' }, ct);
      }
    }
    state.activeInteractable = near;

    if (dom['interact-prompt']) {
      if (near) {
        dom['interact-prompt'].classList.remove('hidden');
        const rawTxt = near.prompt || near.label || 'Interact';
        const cleanTxt = rawTxt.replace(/^\[E\]\s*/i, '');
        if (dom['interact-label']) dom['interact-label'].textContent = cleanTxt;
      } else {
        dom['interact-prompt'].classList.add('hidden');
      }
    }

    // Low HP heartbeat audio
    if (LRT.Audio) {
      if (state.health > 0 && state.health < 30 && !state.invulnerable) {
        if (!state.heartbeatActive) {
          state.heartbeatActive = true;
          LRT.Audio.startLoop('player_heartbeat', 0.55, 0.4, 1.0);
        }
      } else if (state.heartbeatActive) {
        state.heartbeatActive = false;
        LRT.Audio.stopLoop('player_heartbeat', 0.35);
      }
    }
  }

  function takeDamage(amount) {
    if (state.invulnerable || state.health <= 0 || amount <= 0) return false;
    const prev = state.health;
    state.health = Math.max(0, state.health - amount);
    state.vignetteAlpha = 0.82;
    if (LRT.Audio) {
      LRT.Audio.play('player_hurt', { gain: 0.85, pitchVar: 0.08 });
      if (prev >= 30 && state.health < 30 && state.health > 0) {
        LRT.Audio.play('player_gasp', { gain: 0.8 });
      }
    }
    return state.health <= 0;
  }

  function heal(amount) {
    state.health = Math.min(state.maxHealth, state.health + amount);
  }

  const _hudCache = {
    hpText: null,
    hpPct: null,
    critical: null,
    mode: null,
    stationCode: null,
    stationName: null,
    stationSub: null,
    objTitle: null,
    objDetail: null,
    fpsText: null,
    weaponName: null,
    ammoMag: null,
    ammoRes: null,
    activeSlot: null,
    hmActive: null,
    hmCrit: null,
    chPx: null,
    chAds: null
  };

  function updateHud(info) {
    if (!dom.hud) return;

    const hpText = String(Math.ceil(state.health));
    if (_hudCache.hpText !== hpText) {
      _hudCache.hpText = hpText;
      if (dom['hp-value']) dom['hp-value'].textContent = hpText;
    }

    const hpPct = Math.max(0, Math.min(100, Math.round((state.health / state.maxHealth) * 100)));
    if (_hudCache.hpPct !== hpPct) {
      _hudCache.hpPct = hpPct;
      if (dom['hp-bar-fill']) dom['hp-bar-fill'].style.width = `${hpPct}%`;
    }

    const critical = state.health < 35;
    if (_hudCache.critical !== critical) {
      _hudCache.critical = critical;
      if (dom['vitals-card']) dom['vitals-card'].classList.toggle('hp-critical', critical);
    }

    if (info) {
      const mode = info.mode === C.MODES.EXPLORATION ? 'EXPLORATION' : 'SURVIVAL';
      if (_hudCache.mode !== mode) {
        _hudCache.mode = mode;
        if (dom['hud-mode-badge']) dom['hud-mode-badge'].textContent = mode;
      }

      const stationCode = info.stationCode || 'CB01 / BK01';
      if (_hudCache.stationCode !== stationCode) {
        _hudCache.stationCode = stationCode;
        if (dom['hud-station-code']) dom['hud-station-code'].textContent = stationCode;
      }

      const stationName = info.stationName || 'Dukuh Atas BSI';
      if (_hudCache.stationName !== stationName) {
        _hudCache.stationName = stationName;
        if (dom['hud-station-name']) dom['hud-station-name'].textContent = stationName;
      }

      const stationSub = info.stationSub || 'LRT Jabodebek';
      if (_hudCache.stationSub !== stationSub) {
        _hudCache.stationSub = stationSub;
        if (dom['hud-station-sub']) dom['hud-station-sub'].textContent = stationSub;
      }

      const objTitle = info.objectiveTitle || '';
      if (_hudCache.objTitle !== objTitle) {
        _hudCache.objTitle = objTitle;
        if (dom['objective-title']) dom['objective-title'].textContent = objTitle;
      }

      const objDetail = info.objectiveDetail || '';
      if (_hudCache.objDetail !== objDetail) {
        _hudCache.objDetail = objDetail;
        if (dom['objective-detail']) dom['objective-detail'].textContent = objDetail;
      }

      const fpsText = `FPS: ${info.fps || '--'} | Calls: ${info.drawCalls || '--'}`;
      if (_hudCache.fpsText !== fpsText) {
        _hudCache.fpsText = fpsText;
        if (dom['fps-readout']) dom['fps-readout'].textContent = fpsText;
      }
    }

    if (LRT.Weapons && LRT.Weapons.getHudState) {
      const wh = LRT.Weapons.getHudState();
      if (wh) {
        const reloading = !!(wh.isReloading ?? wh.reloading);
        const mag = wh.ammoInMag ?? wh.mag ?? 0;
        const inf = !!(wh.infReserve ?? wh.infiniteReserve);
        const hmTime = wh.hitmarkerTimer ?? wh.hitmarkerTime ?? 0;
        const hmCrit = !!(wh.headshotHit ?? wh.hitmarkerCrit);

        const weaponName = reloading ? `${wh.name} [RELOADING]` : wh.name;
        if (_hudCache.weaponName !== weaponName) {
          _hudCache.weaponName = weaponName;
          if (dom['weapon-name']) dom['weapon-name'].textContent = weaponName;
        }

        const ammoMag = String(mag);
        if (_hudCache.ammoMag !== ammoMag) {
          _hudCache.ammoMag = ammoMag;
          if (dom['ammo-mag']) dom['ammo-mag'].textContent = ammoMag;
        }

        const ammoRes = inf ? '/ INF' : `/ ${wh.reserve}`;
        if (_hudCache.ammoRes !== ammoRes) {
          _hudCache.ammoRes = ammoRes;
          if (dom['ammo-reserve']) dom['ammo-reserve'].textContent = ammoRes;
        }

        const activeSlot = wh.slot;
        if (_hudCache.activeSlot !== activeSlot) {
          _hudCache.activeSlot = activeSlot;
          if (dom['weapon-slots']) {
            dom['weapon-slots'].querySelectorAll('.w-slot').forEach((el) => {
              el.classList.toggle('active', Number(el.dataset.slot) === activeSlot);
            });
          }
        }

        const hmActive = hmTime > 0;
        if (_hudCache.hmActive !== hmActive) {
          _hudCache.hmActive = hmActive;
          if (dom.hitmarker) dom.hitmarker.style.opacity = hmActive ? '1' : '0';
        }
        if (_hudCache.hmCrit !== hmCrit) {
          _hudCache.hmCrit = hmCrit;
          if (dom.hitmarker) dom.hitmarker.classList.toggle('crit', hmCrit);
        }

        const chPx = Math.round(28 + Math.min(28, (wh.spread || 0) * 320));
        if (_hudCache.chPx !== chPx) {
          _hudCache.chPx = chPx;
          if (dom.crosshair) {
            dom.crosshair.style.width = `${chPx}px`;
            dom.crosshair.style.height = `${chPx}px`;
          }
        }

        const chAds = !!(wh.isADS);
        if (_hudCache.chAds !== chAds) {
          _hudCache.chAds = chAds;
          if (dom.crosshair) dom.crosshair.classList.toggle('ads-active', chAds);
        }
      }
    }
  }

  function showScreen(screenName) {
    if (dom['menu-overlay']) dom['menu-overlay'].classList.toggle('hidden', screenName !== 'menu');
    if (dom['pause-overlay']) dom['pause-overlay'].classList.toggle('hidden', screenName !== 'pause');
    if (dom['gameover-overlay']) dom['gameover-overlay'].classList.toggle('hidden', screenName !== 'gameover');
    if (dom.hud) dom.hud.classList.toggle('hidden', screenName !== 'play');
    if (screenName !== 'menu') {
      setMenuSubpanel(null);
    }
    if (screenName === 'menu' || screenName === 'pause') {
      if (LRT.Main && typeof LRT.Main.getBrightness === 'function') {
        syncBrightnessUi(LRT.Main.getBrightness());
      } else {
        syncBrightnessUi(currentBrightness);
      }
      if (LRT.Main && typeof LRT.Main.getLightingMode === 'function') {
        const lk = LRT.Main.getLightingMode();
        syncLightingUi(lk, C.MOODS ? C.MOODS[lk] : null);
      }
    }
  }

  function init(canvasEl, cam, callbacks) {
    canvas = canvasEl;
    camera = cam;
    const cb = callbacks || {};
    onPauseCb = cb.onPause || null;
    onSummonTrainCb = cb.onSummonTrain || null;
    onWeaponShootDownCb = cb.onShootDown || null;
    onWeaponShootUpCb = cb.onShootUp || null;
    onInteractResultCb = cb.onInteractResult || cb.onInteract || null;

    cacheDom();

    // Register audio voiceover callbacks so playVoice() drives subtitle overlay
    if (LRT.Audio && typeof LRT.Audio.setVoiceCallbacks === 'function') {
      LRT.Audio.setVoiceCallbacks({
        onStart: (entry) => {
          if (entry) {
            showSubtitle(entry.speaker, entry.subtitle_id, entry.subtitle_en, entry.duration_sec);
          }
        },
        onEnd: () => {
          hideSubtitle();
        }
      });
    }

    flashlight = new THREE.SpotLight(0xfff4dc, 0.0, 62, Math.PI / 5.4, 0.50, 1.05);
    flashlight.castShadow = false;
    flashlight.position.set(0.10, -0.08, -0.15);
    flashlightTarget = new THREE.Object3D();
    flashlightTarget.position.set(0, -0.06, -12);
    camera.add(flashlight);
    camera.add(flashlightTarget);
    flashlight.target = flashlightTarget;
    flashlight.visible = true;
    flashlightBounce = new THREE.PointLight(0xffead0, 0.0, 8.5, 1.35);
    flashlightBounce.castShadow = false;
    flashlightBounce.position.set(0.08, -0.06, -0.35);
    flashlightBounce.visible = true;
    camera.add(flashlightBounce);

    bindInputs();
    syncMuteUi();
    syncBrightnessUi(LRT.Main && typeof LRT.Main.getBrightness === 'function' ? LRT.Main.getBrightness() : currentBrightness);
    if (LRT.Main && typeof LRT.Main.getLightingMode === 'function') {
      const k = LRT.Main.getLightingMode();
      syncLightingUi(k, C.MOODS ? C.MOODS[k] : null);
    } else {
      syncLightingUi('DAYLIGHT_CLEAR', C.MOODS ? C.MOODS.DAYLIGHT_CLEAR : null);
    }
    return this;
  }

  function reset(spawnPos, invulnerable, mode) {
    const sp = spawnPos || { x: 4.0, y: 0.05, z: 6.0 };
    state.mode = mode || (invulnerable ? 'exploration' : 'survival');
    state.pos.set(sp.x, sp.y, sp.z);
    state.lastSafePos.copy(state.pos);
    state.vel.set(0, 0, 0);
    state.yaw = typeof sp.yaw === 'number' ? sp.yaw : Math.PI * 0.5;
    state.pitch = 0;
    state.eyeHeight = P.eyeHeight;
    state.grounded = true;
    state.health = P.maxHealth;
    state.invulnerable = !!invulnerable;
    state.isInsideTrain = false;
    state.isSitting = false;
    state.seatLocalPos = null;
    state.standLocalPos = null;
    state.ads = false;
    state.vignetteAlpha = 0;
    state.kills = 0;
    if (state.heartbeatActive && LRT.Audio) {
      state.heartbeatActive = false;
      LRT.Audio.stopLoop('player_heartbeat', 0.1);
    }
    if (camera) {
      camera.position.set(state.pos.x, state.pos.y + state.eyeHeight, state.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(state.pitch, state.yaw, 0);
    }
  }

  LRT.PlayerUI = {
    init,
    reset,
    update,
    updateHud,
    takeDamage,
    heal,
    setNotice,
    showScreen,
    requestLock,
    releaseLock,
    syncMuteUi,
    syncQualityUi,
    syncBrightnessUi,
    syncLightingUi,
    sitInTrain,
    standFromSeat,
    toggleFlashlight,
    showSubtitle,
    hideSubtitle,
    showFieldLog,
    hideFieldLog,
    setOnInteractResult: (fn) => { onInteractResultCb = fn; },
    setPaused: (flag, allowInput) => {
      paused = !!flag;
      allowActionInput = allowInput !== undefined ? !!allowInput : !paused;
      if (paused) {
        for (const k of Object.keys(keys)) keys[k] = false;
        state.ads = false;
        if (LRT.Weapons) LRT.Weapons.setADS(false);
      }
    },
    setLook: (yaw, pitch) => {
      state.yaw = yaw;
      state.pitch = Math.max(-1.46, Math.min(1.46, pitch));
    },
    setPosition: (x, y, z) => {
      state.pos.set(x, y, z);
      state.vel.set(0, 0, 0);
      state.lastSafePos.copy(state.pos);
    },
    applyImpulse: (vx, vy, vz) => {
      state.vel.x += vx || 0;
      state.vel.y += vy || 0;
      state.vel.z += vz || 0;
      if ((vy || 0) > 0.5) state.grounded = false;
    },
    getCamera: () => camera,
    getState: () => state,
    getDom: () => dom
  };
})(window.LRT = window.LRT || {});
