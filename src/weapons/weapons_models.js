(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const W = (I.weapons = I.weapons || {});

  // Fallback weapon specs if LRT.Config is not yet loaded
  const FALLBACK_WEAPONS = [
    {
      slot: 1, id: 'pistol', name: 'Pindad G2 9mm', shortName: 'G2 PISTOL',
      fireMode: 'semi', damage: 34, headMult: 2.2, rpm: 360, pellets: 1,
      spread: 0.006, adsSpread: 0.002, magSize: 15, startReserve: 999,
      infiniteReserve: true, reloadTime: 1.10, range: 110, knockback: 2.2,
      recoilPitch: 0.022, recoilYaw: 0.006, sfxFire: 'pistol_fire', projectile: false
    },
    {
      slot: 2, id: 'rifle', name: 'SS2-V5 Carbine', shortName: 'SS2-V5',
      fireMode: 'auto', damage: 27, headMult: 2.0, rpm: 650, pellets: 1,
      spread: 0.016, adsSpread: 0.005, magSize: 30, startReserve: 180,
      infiniteReserve: false, reloadTime: 1.65, range: 140, knockback: 1.9,
      recoilPitch: 0.017, recoilYaw: 0.010, sfxFire: 'rifle_fire', projectile: false
    },
    {
      slot: 3, id: 'shotgun', name: '12G Pump Tactical', shortName: 'SHOTGUN',
      fireMode: 'semi', damage: 19, headMult: 1.65, rpm: 72, pellets: 8,
      spread: 0.068, adsSpread: 0.044, magSize: 6, startReserve: 42,
      infiniteReserve: false, reloadTime: 1.90, range: 46, knockback: 6.4,
      recoilPitch: 0.055, recoilYaw: 0.018, sfxFire: 'shotgun_fire', sfxPump: 'shotgun_pump', projectile: false
    },
    {
      slot: 4, id: 'rpg', name: 'RPG-7 Launcher', shortName: 'RPG-7',
      fireMode: 'semi', damage: 280, headMult: 1.0, rpm: 35, pellets: 1,
      spread: 0.004, adsSpread: 0.001, magSize: 1, startReserve: 8,
      infiniteReserve: false, reloadTime: 2.25, range: 200, knockback: 18.0,
      blastRadius: 6.5, rocketSpeed: 48.0, recoilPitch: 0.085, recoilYaw: 0.014,
      sfxFire: 'rpg_launch', sfxExplode: 'rpg_explosion', projectile: true
    }
  ];

  // Pre-allocated scratch math objects (ZERO per-shot allocations)
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _v4 = new THREE.Vector3();
  const _rayOrigin = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _shotDir = new THREE.Vector3();
  const _muzzlePos = new THREE.Vector3();
  const _camPos = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  const _camUp = new THREE.Vector3();
  const _localPos = new THREE.Vector3();
  const _localNorm = new THREE.Vector3();
  const _upVec = new THREE.Vector3(0, 1, 0);
  const _fwdVec = new THREE.Vector3(0, 0, 1);
  const _q1 = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _e1 = new THREE.Euler();
  const _m4 = new THREE.Matrix4();
  const _scaleV = new THREE.Vector3();
  const _color1 = new THREE.Color();
  const _zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
  const _invMat = new THREE.Matrix4();
  const _normMat = new THREE.Matrix3();

  W.FALLBACK_WEAPONS = FALLBACK_WEAPONS;
  W._v1 = _v1;
  W._v2 = _v2;
  W._v3 = _v3;
  W._v4 = _v4;
  W._rayOrigin = _rayOrigin;
  W._rayDir = _rayDir;
  W._shotDir = _shotDir;
  W._muzzlePos = _muzzlePos;
  W._camPos = _camPos;
  W._camRight = _camRight;
  W._camUp = _camUp;
  W._localPos = _localPos;
  W._localNorm = _localNorm;
  W._upVec = _upVec;
  W._fwdVec = _fwdVec;
  W._q1 = _q1;
  W._q2 = _q2;
  W._e1 = _e1;
  W._m4 = _m4;
  W._scaleV = _scaleV;
  W._color1 = _color1;
  W._zeroMat = _zeroMat;
  W._invMat = _invMat;
  W._normMat = _normMat;

  W._scene = null;
  W._camera = null;
  W._initialized = false;

  // Viewmodel hierarchy & runtime state
  W._viewmodelRoot = null;
  W._muzzleFlashGroup = null;
  W._flashLight = null;
  W._flashLightTimer = 0;
  W._flashLightDuration = 0.07;
  W._flashLightMaxIntensity = 5.0;
  W._rocketLight = null;
  W._meleeCooldown = 0;
  W._muzzleFlashTimer = 0;

  W._weaponStates = [];
  W._activeIdx = 0; // 0..3 -> slots 1..4
  W._isADS = false;
  W._adsBlend = 0;
  W._isFiringHeld = false;
  W._fireCooldown = 0;
  W._isReloading = false;
  W._reloadTimer = 0;
  W._reloadDuration = 1.0;
  W._switchTimer = 0;
  W._pumpTimer = -1;
  W._pumpPlayed = false;

  W._bloom = 0;
  W._recoilZ = 0;
  W._recoilPitchVM = 0;
  W._pendingCamPitch = 0;
  W._pendingCamYaw = 0;
  W._trauma = 0;
  W._traumaTime = 0;
  W._walkBobPhase = 0;
  W._currentTrainSpeed = 0;

  // HUD feedback timers
  W._hitmarkerTimer = 0;
  W._headshotHit = false;
  W._killConfirmTimer = 0;
  W._totalShots = 0;
  W._totalHits = 0;

  // Fallback difficulty tiers if LRT.Config.DIFFICULTY_TIERS is not yet loaded
  const FALLBACK_DIFFICULTY_TIERS = {
    easy: {
      key: 'easy', label: 'EASY', color: '#4ade80',
      playerDmgMult: 1.20, reloadTimeMult: 0.85, pickupAmmoMult: 1.35, healMult: 1.30, startAmmoMult: 1.25, luckOffset: -0.10
    },
    medium: {
      key: 'medium', label: 'MEDIUM', color: '#e0b422',
      playerDmgMult: 1.00, reloadTimeMult: 1.00, pickupAmmoMult: 1.00, healMult: 1.00, startAmmoMult: 1.00, luckOffset: 0.00
    },
    hard: {
      key: 'hard', label: 'HARD', color: '#f97316',
      playerDmgMult: 0.92, reloadTimeMult: 1.10, pickupAmmoMult: 0.80, healMult: 0.80, startAmmoMult: 0.75, luckOffset: 0.10
    },
    nightmare: {
      key: 'nightmare', label: 'NIGHTMARE', color: '#ef4444',
      playerDmgMult: 0.85, reloadTimeMult: 1.20, pickupAmmoMult: 0.65, healMult: 0.65, startAmmoMult: 0.55, luckOffset: 0.20
    }
  };

  const MAG_BONUS_CAPS = { pistol: 6, rifle: 15, shotgun: 4, rpg: 1 };
  const DMG_MULT_CAP = 1.45;
  const RELOAD_MULT_FLOOR = 0.65;

  const SKIN_PRESETS = {
    pindad_standard: {
      id: 'pindad_standard',
      name: 'Pindad Standard',
      rarity: 'common',
      texKey: 'white',
      gunSteelMid: { color: 0x5c6676, roughness: 0.24, metalness: 0.80, clearcoat: 0.32, emissive: 0x000000, useTex: false },
      gunSteelDark: { color: 0x3b424d, roughness: 0.34, metalness: 0.70, emissive: 0x000000, useTex: false },
      gunSteelLight: { color: 0x9aa6b6, roughness: 0.18, metalness: 0.90, clearcoat: 0.40, emissive: 0x000000, useTex: false },
      polymerBlack: { color: 0x2b3038, roughness: 0.62, metalness: 0.12, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x3f4550, roughness: 0.72, metalness: 0.08, emissive: 0x000000, useTex: false },
      rpgOlive: { color: 0x5a7244, roughness: 0.36, metalness: 0.44, clearcoat: 0.32, emissive: 0x000000, useTex: false },
      rpgWarhead: { color: 0x566c40, roughness: 0.42, metalness: 0.38, emissive: 0x000000, useTex: false },
      rpgWood: { color: 0x9c5c2e, roughness: 0.52, metalness: 0.06, emissive: 0x000000, useTex: false },
      brass: { color: 0xdab256, roughness: 0.24, metalness: 0.86, emissive: 0x000000, useTex: false },
      tritiumGreen: 0x55ff77,
      redDot: 0xff2a2a,
      amberBead: 0xffb33a,
      opticLensColor: 0x39a4cc,
      opticLensEmissive: 0x0a2e3e
    },
    tni_digital_forest: {
      id: 'tni_digital_forest',
      name: 'TNI Digital Forest',
      rarity: 'uncommon',
      texKey: 'camoForestTex',
      gunSteelMid: { color: 0xdce4d2, roughness: 0.48, metalness: 0.35, clearcoat: 0.08, emissive: 0x000000, useTex: true },
      gunSteelDark: { color: 0xaab89e, roughness: 0.54, metalness: 0.28, emissive: 0x000000, useTex: true },
      gunSteelLight: { color: 0x5a7244, roughness: 0.34, metalness: 0.58, clearcoat: 0.18, emissive: 0x000000, useTex: false },
      polymerBlack: { color: 0x273024, roughness: 0.70, metalness: 0.10, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x313c2d, roughness: 0.74, metalness: 0.08, emissive: 0x000000, useTex: false },
      rpgOlive: { color: 0xdce4d2, roughness: 0.48, metalness: 0.35, clearcoat: 0.08, emissive: 0x000000, useTex: true },
      rpgWarhead: { color: 0xc8d2bc, roughness: 0.46, metalness: 0.32, emissive: 0x000000, useTex: true },
      rpgWood: { color: 0x4c5a3c, roughness: 0.60, metalness: 0.12, emissive: 0x000000, useTex: false },
      brass: { color: 0x9aa468, roughness: 0.30, metalness: 0.76, emissive: 0x000000, useTex: false },
      tritiumGreen: 0x55ff77,
      redDot: 0xff2a2a,
      amberBead: 0x55ff77,
      opticLensColor: 0x46b898,
      opticLensEmissive: 0x0a3428
    },
    kai_brass_navy: {
      id: 'kai_brass_navy',
      name: 'KAI Brass/Navy',
      rarity: 'rare',
      texKey: 'white',
      gunSteelMid: { color: 0x16325C, roughness: 0.22, metalness: 0.72, clearcoat: 0.45, emissive: 0x020814, useTex: false },
      gunSteelDark: { color: 0x122645, roughness: 0.28, metalness: 0.66, emissive: 0x000000, useTex: false },
      gunSteelLight: { color: 0xC49B3E, roughness: 0.20, metalness: 0.88, clearcoat: 0.48, emissive: 0x120c02, useTex: false },
      polymerBlack: { color: 0x1c2432, roughness: 0.55, metalness: 0.18, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x242e3f, roughness: 0.58, metalness: 0.16, emissive: 0x000000, useTex: false },
      rpgOlive: { color: 0x16325C, roughness: 0.22, metalness: 0.72, clearcoat: 0.45, emissive: 0x020814, useTex: false },
      rpgWarhead: { color: 0x1d3f73, roughness: 0.26, metalness: 0.70, emissive: 0x000000, useTex: false },
      rpgWood: { color: 0x8F6924, roughness: 0.38, metalness: 0.45, emissive: 0x000000, useTex: false },
      brass: { color: 0xC49B3E, roughness: 0.18, metalness: 0.90, emissive: 0x140d02, useTex: false },
      tritiumGreen: 0x38bdf8,
      redDot: 0x38bdf8,
      amberBead: 0x38bdf8,
      opticLensColor: 0x38bdf8,
      opticLensEmissive: 0x0c4a6e
    },
    carbon_crimson: {
      id: 'carbon_crimson',
      name: 'Carbon Crimson',
      rarity: 'epic',
      texKey: 'carbonWeaveTex',
      gunSteelMid: { color: 0xd2d6e0, roughness: 0.28, metalness: 0.55, clearcoat: 0.60, emissive: 0x000000, useTex: true },
      gunSteelDark: { color: 0xb0b5c0, roughness: 0.32, metalness: 0.50, emissive: 0x000000, useTex: true },
      gunSteelLight: { color: 0xC81E24, roughness: 0.22, metalness: 0.75, clearcoat: 0.55, emissive: 0x1a0305, useTex: false },
      polymerBlack: { color: 0x141518, roughness: 0.45, metalness: 0.20, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x1c1e24, roughness: 0.48, metalness: 0.18, emissive: 0x000000, useTex: false },
      rpgOlive: { color: 0xd2d6e0, roughness: 0.28, metalness: 0.55, clearcoat: 0.60, emissive: 0x000000, useTex: true },
      rpgWarhead: { color: 0xC81E24, roughness: 0.26, metalness: 0.68, emissive: 0x180305, useTex: false },
      rpgWood: { color: 0x9aa0ac, roughness: 0.42, metalness: 0.24, emissive: 0x000000, useTex: true },
      brass: { color: 0xC81E24, roughness: 0.22, metalness: 0.78, emissive: 0x1a0305, useTex: false },
      tritiumGreen: 0xff2a2a,
      redDot: 0xff2a2a,
      amberBead: 0xff2a2a,
      opticLensColor: 0xe11d48,
      opticLensEmissive: 0x4c0519
    },
    evac_gold_24k: {
      id: 'evac_gold_24k',
      name: '24K Evac Gold',
      rarity: 'legendary',
      texKey: 'white',
      gunSteelMid: { color: 0xeab308, roughness: 0.16, metalness: 0.94, clearcoat: 0.65, emissive: 0x1c1200, useTex: false },
      gunSteelDark: { color: 0xca8a04, roughness: 0.22, metalness: 0.90, emissive: 0x120b00, useTex: false },
      gunSteelLight: { color: 0xfef08a, roughness: 0.14, metalness: 0.96, clearcoat: 0.75, emissive: 0x241a02, useTex: false },
      polymerBlack: { color: 0x16181c, roughness: 0.38, metalness: 0.25, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x1f2228, roughness: 0.42, metalness: 0.22, emissive: 0x000000, useTex: false },
      rpgOlive: { color: 0xeab308, roughness: 0.16, metalness: 0.94, clearcoat: 0.65, emissive: 0x1c1200, useTex: false },
      rpgWarhead: { color: 0xfacc15, roughness: 0.18, metalness: 0.92, emissive: 0x1c1200, useTex: false },
      rpgWood: { color: 0x16181c, roughness: 0.36, metalness: 0.28, emissive: 0x000000, useTex: false },
      brass: { color: 0xfef08a, roughness: 0.14, metalness: 0.96, emissive: 0x241a02, useTex: false },
      tritiumGreen: 0xffb33a,
      redDot: 0xffb33a,
      amberBead: 0xffb33a,
      opticLensColor: 0xf59e0b,
      opticLensEmissive: 0x451a03
    }
  };

  const SKINNABLE_MAT_KEYS = [
    'gunSteelMid', 'gunSteelDark', 'gunSteelLight',
    'polymerBlack', 'polymerGrip', 'rpgOlive',
    'rpgWarhead', 'rpgWood', 'brass'
  ];

  W.FALLBACK_DIFFICULTY_TIERS = FALLBACK_DIFFICULTY_TIERS;
  W.MAG_BONUS_CAPS = MAG_BONUS_CAPS;
  W.DMG_MULT_CAP = DMG_MULT_CAP;
  W.RELOAD_MULT_FLOOR = RELOAD_MULT_FLOOR;
  W.SKIN_PRESETS = SKIN_PRESETS;

  // Progression & loot pity state
  W._gameMode = 'survival';
  W._difficultyKey = 'medium';
  W._cratesSinceEpic = 0;
  W._cratesSinceLegendary = 0;
  W._unlockedSkins = new Set(['pindad_standard']);

  // Viewmodel descriptors (built once)
  W._vmModels = [];
  W._warmupActive = false;
  W._savedVmRootVisible = false;

  // VFX references shared with setWarmupMode
  W._vfxRoot = null;
  W._attachedScorches = [];

  // Shared base PBR viewmodel materials, per-slot cloned material sets & cached procedural textures
  W._vmMats = null;
  W._weaponMatSets = [];
  W._skinTexCache = null;

  const _vmModels = W._vmModels;
  const _attachedScorches = W._attachedScorches;

  function getWeaponConfigs() {
    return (LRT.Config && LRT.Config.WEAPONS) ? LRT.Config.WEAPONS : FALLBACK_WEAPONS;
  }

  function getPlayerCfg() {
    return (LRT.Config && LRT.Config.PLAYER_CFG) ? LRT.Config.PLAYER_CFG : { baseFov: 74, adsFov: 56 };
  }

  function getDifficultyCfg(diffKey) {
    const k = diffKey || W._difficultyKey || 'medium';
    const tiers = (LRT.Config && LRT.Config.DIFFICULTY_TIERS) ? LRT.Config.DIFFICULTY_TIERS : FALLBACK_DIFFICULTY_TIERS;
    return tiers[k] || FALLBACK_DIFFICULTY_TIERS[k] || FALLBACK_DIFFICULTY_TIERS.medium;
  }

  function setDifficulty(diffKey) {
    const tiers = (LRT.Config && LRT.Config.DIFFICULTY_TIERS) ? LRT.Config.DIFFICULTY_TIERS : FALLBACK_DIFFICULTY_TIERS;
    if (diffKey && (tiers[diffKey] || FALLBACK_DIFFICULTY_TIERS[diffKey])) {
      W._difficultyKey = diffKey;
    } else {
      W._difficultyKey = 'medium';
    }
    return W._difficultyKey;
  }

  function getEffectiveMagSize(idx) {
    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[idx];
    const wState = W._weaponStates[idx];
    if (!wCfg) return 0;
    const cap = MAG_BONUS_CAPS[wCfg.id] || 0;
    const bonus = wState ? Math.min(cap, Math.max(0, wState.magBonus || 0)) : 0;
    return wCfg.magSize + bonus;
  }

  function play3D(key, pos, pitchVar, gain, spatialOpts) {
    if (!LRT.Audio || typeof LRT.Audio.play !== 'function') return;
    if (pos && W._camera) {
      W._camera.getWorldPosition(_camPos);
      _camRight.setFromMatrixColumn(W._camera.matrixWorld, 0).normalize();
      LRT.Audio.play(key, {
        pos: pos,
        listenerPos: _camPos,
        listenerRight: _camRight,
        pitchVar: pitchVar !== undefined ? pitchVar : 0.08,
        gain: gain !== undefined ? gain : 1.0,
        refDist: spatialOpts && spatialOpts.refDist,
        maxDist: spatialOpts && spatialOpts.maxDist
      });
    } else {
      LRT.Audio.play(key, {
        pitchVar: pitchVar !== undefined ? pitchVar : 0.04,
        gain: gain !== undefined ? gain : 1.0
      });
    }
  }

  function createRpgReticleTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 256, 256);

    // Subtle anti-reflective scope glass tint (keeps target crystal clear!)
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 126);
    grad.addColorStop(0.0, 'rgba(30, 110, 95, 0.06)');
    grad.addColorStop(0.78, 'rgba(20, 75, 68, 0.14)');
    grad.addColorStop(0.95, 'rgba(10, 22, 20, 0.42)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, Math.PI * 2);
    ctx.fill();

    // PGO-7 crisp illuminated rangefinder crosshairs & ballistic chevrons
    ctx.strokeStyle = 'rgba(255, 185, 65, 0.92)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    // Horizontal windage ticks leaving center open
    ctx.moveTo(28, 128); ctx.lineTo(106, 128);
    ctx.moveTo(150, 128); ctx.lineTo(228, 128);
    // Vertical stadia post below center
    ctx.moveTo(128, 146); ctx.lineTo(128, 226);
    ctx.stroke();

    // Range drop chevrons
    ctx.lineWidth = 2.0;
    for (const [cy, w] of [[128, 9], [148, 7], [168, 5]]) {
      ctx.beginPath();
      ctx.moveTo(128 - w, cy + w * 0.65);
      ctx.lineTo(128, cy);
      ctx.lineTo(128 + w, cy + w * 0.65);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 110, 50, 0.95)';
    ctx.beginPath();
    ctx.arc(128, 128, 2.2, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function createFallbackWhiteTexture() {
    if (typeof THREE.DataTexture !== 'function') return null;
    const data = new Uint8Array([255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function createCamoForestTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    // Olive-slate base (#3f5138)
    ctx.fillStyle = '#3f5138';
    ctx.fillRect(0, 0, 256, 256);

    const palette = ['#2b3326', '#646b4e', '#4b5e40', '#242b20'];
    let seed = 133742;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const cell = 8;
    const cols = 256 / cell;
    for (let y = 0; y < cols; y++) {
      for (let x = 0; x < cols; x++) {
        const r = nextRand();
        if (r < 0.62) {
          const col = palette[Math.floor(nextRand() * palette.length)];
          ctx.fillStyle = col;
          const runW = 1 + Math.floor(nextRand() * 3);
          ctx.fillRect(x * cell, y * cell, Math.min(runW, cols - x) * cell, cell);
          if (nextRand() < 0.45 && y + 1 < cols) {
            ctx.fillRect(x * cell, (y + 1) * cell, cell, cell);
          }
        }
      }
    }

    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.needsUpdate = true;
    return tex;
  }

  function createCarbonWeaveTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#1b1d22';
    ctx.fillRect(0, 0, 256, 256);

    const tile = 16;
    const half = tile / 2;
    for (let y = 0; y < 256; y += tile) {
      for (let x = 0; x < 256; x += tile) {
        const shift = ((y / tile) % 2) * half;
        // Warp strand (brighter diagonal sheen)
        const g1 = ctx.createLinearGradient(x, y, x + half, y + tile);
        g1.addColorStop(0.0, '#2e323c');
        g1.addColorStop(0.5, '#3b404d');
        g1.addColorStop(1.0, '#1f2229');
        ctx.fillStyle = g1;
        ctx.fillRect((x + shift) % 256, y, half - 1, tile - 1);

        // Weft strand
        const g2 = ctx.createLinearGradient(x, y, x + tile, y + half);
        g2.addColorStop(0.0, '#17191e');
        g2.addColorStop(0.5, '#272b34');
        g2.addColorStop(1.0, '#131519');
        ctx.fillStyle = g2;
        ctx.fillRect((x + shift + half) % 256, y + (half * 0.5), half - 1, half - 1);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.needsUpdate = true;
    return tex;
  }

  function ensureSkinTexCache() {
    if (W._skinTexCache) return W._skinTexCache;
    W._skinTexCache = {
      white: createFallbackWhiteTexture(),
      camoForestTex: createCamoForestTexture(),
      carbonWeaveTex: createCarbonWeaveTexture()
    };
    return W._skinTexCache;
  }

  function createViewmodelMaterials() {
    if (W._vmMats) return W._vmMats;
    const texCache = ensureSkinTexCache();
    const whiteTex = texCache.white;
    const reticleTex = createRpgReticleTexture();
    W._vmMats = {
      gunSteelDark: new THREE.MeshStandardMaterial({ color: 0x3b424d, map: whiteTex, roughness: 0.34, metalness: 0.70, envMapIntensity: 1.45 }),
      gunSteelMid: new THREE.MeshPhysicalMaterial({
        color: 0x5c6676, map: whiteTex, roughness: 0.24, metalness: 0.80,
        clearcoat: 0.32, clearcoatRoughness: 0.20, envMapIntensity: 1.65
      }),
      gunSteelLight: new THREE.MeshPhysicalMaterial({
        color: 0x9aa6b6, map: whiteTex, roughness: 0.18, metalness: 0.90,
        clearcoat: 0.40, clearcoatRoughness: 0.15, envMapIntensity: 1.85
      }),
      polymerBlack: new THREE.MeshStandardMaterial({ color: 0x2b3038, map: whiteTex, roughness: 0.62, metalness: 0.12, envMapIntensity: 1.15 }),
      polymerGrip: new THREE.MeshStandardMaterial({ color: 0x3f4550, map: whiteTex, roughness: 0.72, metalness: 0.08, envMapIntensity: 1.10 }),
      rpgOlive: new THREE.MeshPhysicalMaterial({
        color: 0x5a7244, map: whiteTex, roughness: 0.36, metalness: 0.44,
        clearcoat: 0.32, clearcoatRoughness: 0.26, envMapIntensity: 1.40
      }),
      rpgWarhead: new THREE.MeshStandardMaterial({ color: 0x566c40, map: whiteTex, roughness: 0.42, metalness: 0.38, envMapIntensity: 1.30 }),
      rpgWood: new THREE.MeshStandardMaterial({ color: 0x9c5c2e, map: whiteTex, roughness: 0.52, metalness: 0.06, envMapIntensity: 1.25 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xdab256, map: whiteTex, roughness: 0.24, metalness: 0.86, envMapIntensity: 1.65 }),
      shellRed: new THREE.MeshStandardMaterial({ color: 0xd12c2c, roughness: 0.48, metalness: 0.12, envMapIntensity: 1.20 }),
      opticLens: new THREE.MeshPhysicalMaterial({
        color: 0x39a4cc, emissive: 0x0a2e3e, emissiveIntensity: 0.55,
        roughness: 0.04, metalness: 0.20, clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 1.85,
        transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide
      }),
      rpgScopeTube: new THREE.MeshStandardMaterial({
        color: 0x2e343e, roughness: 0.38, metalness: 0.68, envMapIntensity: 1.35, side: THREE.DoubleSide
      }),
      rpgEyecup: new THREE.MeshStandardMaterial({
        color: 0x1e2228, roughness: 0.76, metalness: 0.08, envMapIntensity: 1.0, side: THREE.DoubleSide
      }),
      rpgReticle: new THREE.MeshBasicMaterial({
        map: reticleTex, transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide
      }),
      tritiumGreen: new THREE.MeshBasicMaterial({ color: 0x55ff77 }),
      redDot: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
      amberBead: new THREE.MeshBasicMaterial({ color: 0xffb33a }),
      muzzleFlash: new THREE.MeshBasicMaterial({
        color: 0xffd27a, map: createMuzzleFlashTexture(), transparent: true, opacity: 0.78,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      })
    };
    return W._vmMats;
  }

  function createWeaponMaterialSet(slotIdx) {
    if (W._weaponMatSets[slotIdx]) return W._weaponMatSets[slotIdx];
    const base = createViewmodelMaterials();
    const cloned = {};
    for (const key of Object.keys(base)) {
      if (key === 'rpgReticle' || key === 'muzzleFlash') {
        cloned[key] = base[key];
      } else if (base[key] && typeof base[key].clone === 'function') {
        cloned[key] = base[key].clone();
        if (base[key].map && !cloned[key].map) {
          cloned[key].map = base[key].map;
        }
      } else {
        cloned[key] = base[key];
      }
    }
    W._weaponMatSets[slotIdx] = cloned;
    return cloned;
  }

  function addPart(parent, geo, mat, x, y, z, rx, ry, rz) {
    if (geo && typeof geo.computeBoundingSphere === 'function') {
      geo.computeBoundingSphere();
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = false;
    m.receiveShadow = false;
    // Viewmodel sits within 0.05..0.65m of camera near plane; keep frustumCulled=false on viewmodels
    // so stocks/grips never pop when swinging during reload/ADS.
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  function buildPistolModel() {
    const mats = createWeaponMaterialSet(0);
    const g = new THREE.Group();

    // Lower polymer frame + dust cover + textured side grip panels
    addPart(g, new THREE.BoxGeometry(0.030, 0.024, 0.21), mats.polymerBlack, 0, -0.002, -0.04);
    addPart(g, new THREE.BoxGeometry(0.029, 0.115, 0.044), mats.polymerBlack, 0, -0.062, 0.042, 0.24, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.032, 0.072, 0.032), mats.polymerGrip, 0, -0.062, 0.042, 0.24, 0, 0);
    // Picatinny under-rail + trigger guard + trigger
    addPart(g, new THREE.BoxGeometry(0.026, 0.008, 0.056), mats.gunSteelDark, 0, -0.015, -0.105);
    addPart(g, new THREE.BoxGeometry(0.012, 0.005, 0.046), mats.polymerBlack, 0, -0.036, -0.016);
    addPart(g, new THREE.BoxGeometry(0.012, 0.026, 0.005), mats.polymerBlack, 0, -0.024, -0.036);
    addPart(g, new THREE.BoxGeometry(0.006, 0.018, 0.006), mats.gunSteelLight, 0, -0.022, -0.010, -0.35, 0, 0);
    // Fixed barrel, stainless hood & guide rod tip
    const barrel = addPart(g, new THREE.CylinderGeometry(0.0075, 0.0075, 0.205, 10), mats.gunSteelLight, 0, 0.022, -0.055, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.022, 0.014, 0.036), mats.gunSteelLight, 0, 0.031, -0.028);
    addPart(g, new THREE.CylinderGeometry(0.0045, 0.0045, 0.09, 8), mats.gunSteelLight, 0, 0.004, -0.10, Math.PI / 2, 0, 0);

    // Articulated upper gunmetal slide (distinct 2-tone contrast vs polymer frame)
    const slide = new THREE.Group();
    addPart(slide, new THREE.BoxGeometry(0.031, 0.029, 0.215), mats.gunSteelMid, 0, 0.022, -0.042);
    // Top chamfer ridge + rear & front serrations
    addPart(slide, new THREE.BoxGeometry(0.024, 0.006, 0.210), mats.gunSteelLight, 0, 0.038, -0.042);
    for (let i = 0; i < 4; i++) {
      addPart(slide, new THREE.BoxGeometry(0.033, 0.018, 0.003), mats.gunSteelDark, 0, 0.022, 0.032 + i * 0.008);
    }
    // Rear sight notch + 2 green tritium dots
    addPart(slide, new THREE.BoxGeometry(0.007, 0.008, 0.008), mats.gunSteelDark, -0.008, 0.043, 0.054);
    addPart(slide, new THREE.BoxGeometry(0.007, 0.008, 0.008), mats.gunSteelDark, 0.008, 0.043, 0.054);
    addPart(slide, new THREE.BoxGeometry(0.003, 0.003, 0.002), mats.tritiumGreen, -0.008, 0.044, 0.059);
    addPart(slide, new THREE.BoxGeometry(0.003, 0.003, 0.002), mats.tritiumGreen, 0.008, 0.044, 0.059);
    // Front sight post + green dot
    addPart(slide, new THREE.BoxGeometry(0.004, 0.009, 0.009), mats.gunSteelDark, 0, 0.043, -0.140);
    addPart(slide, new THREE.BoxGeometry(0.003, 0.003, 0.002), mats.tritiumGreen, 0, 0.044, -0.135);
    g.add(slide);

    // Removable magazine
    const mag = new THREE.Group();
    addPart(mag, new THREE.BoxGeometry(0.022, 0.11, 0.036), mats.gunSteelMid, 0, -0.068, 0.044, 0.24, 0, 0);
    addPart(mag, new THREE.BoxGeometry(0.028, 0.010, 0.044), mats.polymerGrip, 0, -0.122, 0.056, 0.24, 0, 0);
    g.add(mag);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.022, -0.175);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.018, 0.028, -0.025);
    g.add(ejectAnchor);

    barrel.visible = true;
    return {
      group: g,
      muzzleAnchor,
      ejectAnchor,
      parts: { slide, mag },
      hipPos: new THREE.Vector3(0.18, -0.16, -0.34),
      adsPos: new THREE.Vector3(0.0, -0.044, -0.25),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 62
    };
  }

  function buildRifleModel() {
    const mats = createWeaponMaterialSet(1);
    const g = new THREE.Group();

    // Lower & Upper anodized gunmetal receiver (distinct edges under IBL)
    addPart(g, new THREE.BoxGeometry(0.044, 0.030, 0.23), mats.gunSteelDark, 0, -0.014, 0.0);
    addPart(g, new THREE.BoxGeometry(0.045, 0.032, 0.235), mats.gunSteelMid, 0, 0.014, 0.0);
    addPart(g, new THREE.BoxGeometry(0.046, 0.010, 0.34), mats.gunSteelLight, 0, 0.034, -0.06); // Top Picatinny rail
    // Ergonomic grip + telescoping stock
    addPart(g, new THREE.BoxGeometry(0.032, 0.105, 0.044), mats.polymerGrip, 0, -0.065, 0.072, 0.28, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.034, 0.034, 0.18), mats.gunSteelMid, 0, 0.002, 0.20); // Buffer tube
    addPart(g, new THREE.BoxGeometry(0.042, 0.11, 0.11), mats.polymerBlack, 0, -0.022, 0.25); // Buttstock
    addPart(g, new THREE.BoxGeometry(0.045, 0.016, 0.095), mats.polymerGrip, 0, 0.026, 0.245); // Cheek rest
    // Quad-rail handguard with machined gunmetal ribs
    addPart(g, new THREE.BoxGeometry(0.046, 0.052, 0.22), mats.gunSteelDark, 0, 0.008, -0.22);
    for (let i = 0; i < 6; i++) {
      addPart(g, new THREE.BoxGeometry(0.052, 0.012, 0.014), mats.gunSteelLight, 0, 0.008, -0.14 - i * 0.03);
    }
    // Barrel + front A-frame sight + flash hider
    addPart(g, new THREE.CylinderGeometry(0.010, 0.011, 0.25, 10), mats.gunSteelMid, 0, 0.010, -0.40, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.013, 0.012, 0.048, 10), mats.gunSteelLight, 0, 0.010, -0.52, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.012, 0.032, 0.024), mats.gunSteelLight, 0, 0.034, -0.35); // Gas block

    // Articulated reciprocating bolt carrier
    const bolt = new THREE.Group();
    addPart(bolt, new THREE.BoxGeometry(0.012, 0.016, 0.065), mats.gunSteelLight, 0.021, 0.016, -0.01);
    addPart(bolt, new THREE.BoxGeometry(0.022, 0.008, 0.012), mats.polymerGrip, 0.029, 0.016, -0.01);
    g.add(bolt);

    // Articulated curved 30-rd STANAG magazine
    const mag = new THREE.Group();
    addPart(mag, new THREE.BoxGeometry(0.026, 0.145, 0.064), mats.gunSteelMid, 0, -0.088, -0.048, -0.14, 0, 0);
    addPart(mag, new THREE.BoxGeometry(0.028, 0.016, 0.066), mats.polymerGrip, 0, -0.155, -0.058, -0.14, 0, 0);
    g.add(mag);

    // Reflex Red-Dot Sight aligned at y = +0.068
    addPart(g, new THREE.BoxGeometry(0.038, 0.014, 0.066), mats.gunSteelDark, 0, 0.045, 0.01);
    addPart(g, new THREE.BoxGeometry(0.005, 0.032, 0.056), mats.gunSteelMid, -0.019, 0.067, 0.01);
    addPart(g, new THREE.BoxGeometry(0.005, 0.032, 0.056), mats.gunSteelMid, 0.019, 0.067, 0.01);
    addPart(g, new THREE.BoxGeometry(0.042, 0.005, 0.056), mats.gunSteelLight, 0, 0.084, 0.01);
    addPart(g, new THREE.PlaneGeometry(0.032, 0.028), mats.opticLens, 0, 0.068, -0.012);
    // Crisp glowing red dot centered at y = 0.068
    addPart(g, new THREE.BoxGeometry(0.0022, 0.0022, 0.002), mats.redDot, 0, 0.068, -0.011);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.010, -0.55);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.026, 0.018, -0.010);
    g.add(ejectAnchor);

    return {
      group: g,
      muzzleAnchor,
      ejectAnchor,
      parts: { bolt, mag },
      hipPos: new THREE.Vector3(0.20, -0.18, -0.36),
      adsPos: new THREE.Vector3(0.0, -0.068, -0.23),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 56
    };
  }

  function buildShotgunModel() {
    const mats = createWeaponMaterialSet(2);
    const g = new THREE.Group();

    // Heavy tactical receiver + silver bolt face
    addPart(g, new THREE.BoxGeometry(0.048, 0.064, 0.22), mats.gunSteelMid, 0, 0.0, 0.0);
    addPart(g, new THREE.BoxGeometry(0.005, 0.022, 0.062), mats.gunSteelLight, 0.023, 0.014, -0.02);
    // Ejection port showing red 12G shell inside
    addPart(g, new THREE.BoxGeometry(0.007, 0.015, 0.048), mats.shellRed, 0.023, 0.005, -0.02);
    // Angled stock & grip
    addPart(g, new THREE.BoxGeometry(0.038, 0.09, 0.24), mats.polymerGrip, 0, -0.035, 0.21, 0.16, 0, 0);
    // Top barrel + vent rib + amber bead
    addPart(g, new THREE.CylinderGeometry(0.014, 0.015, 0.54, 12), mats.gunSteelDark, 0, 0.022, -0.36, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.010, 0.007, 0.52), mats.gunSteelLight, 0, 0.038, -0.35);
    addPart(g, new THREE.SphereGeometry(0.0032, 6, 6), mats.amberBead, 0, 0.045, -0.60);
    // Under-barrel tube magazine
    addPart(g, new THREE.CylinderGeometry(0.012, 0.012, 0.46, 10), mats.gunSteelLight, 0, -0.005, -0.32, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.034, 0.042, 0.018), mats.gunSteelMid, 0, 0.008, -0.52); // Barrel clamp

    // Articulated ribbed pump fore-end
    const pump = new THREE.Group();
    addPart(pump, new THREE.CylinderGeometry(0.022, 0.022, 0.17, 10), mats.polymerBlack, 0, -0.005, -0.27, Math.PI / 2, 0, 0);
    for (let i = 0; i < 6; i++) {
      addPart(pump, new THREE.CylinderGeometry(0.0245, 0.0245, 0.012, 10), mats.gunSteelMid, 0, -0.005, -0.20 - i * 0.026, Math.PI / 2, 0, 0);
    }
    g.add(pump);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.022, -0.64);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.027, 0.008, -0.020);
    g.add(ejectAnchor);

    return {
      group: g,
      muzzleAnchor,
      ejectAnchor,
      parts: { pump },
      hipPos: new THREE.Vector3(0.21, -0.19, -0.38),
      adsPos: new THREE.Vector3(0.0, -0.046, -0.28),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 63
    };
  }

  function buildRpgModel() {
    const mats = createWeaponMaterialSet(3);
    const g = new THREE.Group();

    // Main olive-green launch tube
    addPart(g, new THREE.CylinderGeometry(0.030, 0.030, 0.86, 14), mats.rpgOlive, 0, 0, -0.06, Math.PI / 2, 0, 0);
    // Flared muzzle collar & rear venturi nozzle
    addPart(g, new THREE.CylinderGeometry(0.038, 0.032, 0.05, 14), mats.gunSteelMid, 0, 0, -0.49, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.030, 0.046, 0.14, 14), mats.gunSteelMid, 0, 0, 0.42, Math.PI / 2, 0, 0);
    // Varnished wooden heatguard wraps + steel clamps
    addPart(g, new THREE.CylinderGeometry(0.036, 0.036, 0.28, 12), mats.rpgWood, 0, 0, 0.04, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.038, 0.038, 0.016, 12), mats.gunSteelLight, 0, 0, -0.09, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.038, 0.038, 0.016, 12), mats.gunSteelLight, 0, 0, 0.17, Math.PI / 2, 0, 0);
    // Forward trigger grip + rear support grip
    addPart(g, new THREE.BoxGeometry(0.028, 0.11, 0.038), mats.rpgWood, 0, -0.068, -0.22, 0.18, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.026, 0.09, 0.032), mats.polymerGrip, 0, -0.060, -0.04, 0.10, 0, 0);
    // Front iron sight blade
    addPart(g, new THREE.BoxGeometry(0.005, 0.034, 0.012), mats.gunSteelLight, 0, 0.048, -0.46);
    addPart(g, new THREE.BoxGeometry(0.003, 0.006, 0.004), mats.amberBead, 0, 0.065, -0.46);
    // Side-mounted PGO-7 hollow optical sight (left side — completely open see-through optic tube!)
    addPart(g, new THREE.BoxGeometry(0.036, 0.024, 0.048), mats.gunSteelDark, -0.034, 0.025, -0.14);
    addPart(g, new THREE.CylinderGeometry(0.020, 0.021, 0.092, 18, 1, true), mats.rpgScopeTube, -0.055, 0.042, -0.145, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.021, 0.019, 0.028, 18, 1, true), mats.rpgEyecup, -0.055, 0.042, -0.088, Math.PI / 2, 0, 0);
    addPart(g, new THREE.TorusGeometry(0.021, 0.0028, 8, 20), mats.rpgEyecup, -0.055, 0.042, -0.074);
    addPart(g, new THREE.TorusGeometry(0.020, 0.0025, 8, 20), mats.gunSteelMid, -0.055, 0.042, -0.191);
    addPart(g, new THREE.CircleGeometry(0.019, 20), mats.rpgReticle, -0.055, 0.042, -0.165);

    // Visible PG-7V Warhead protruding from muzzle (disappears on fire!)
    const warhead = new THREE.Group();
    // Booster neck inside/out muzzle
    addPart(warhead, new THREE.CylinderGeometry(0.020, 0.020, 0.12, 10), mats.rpgOlive, 0, 0, -0.52, Math.PI / 2, 0, 0);
    // Bulbous HEAT warhead cones + brass fuse band
    addPart(warhead, new THREE.CylinderGeometry(0.046, 0.022, 0.11, 12), mats.rpgWarhead, 0, 0, -0.60, Math.PI / 2, 0, 0);
    addPart(warhead, new THREE.CylinderGeometry(0.048, 0.048, 0.016, 12), mats.brass, 0, 0, -0.655, Math.PI / 2, 0, 0);
    addPart(warhead, new THREE.CylinderGeometry(0.014, 0.046, 0.14, 12), mats.rpgWarhead, 0, 0, -0.72, Math.PI / 2, 0, 0);
    addPart(warhead, new THREE.CylinderGeometry(0.008, 0.014, 0.04, 10), mats.gunSteelLight, 0, 0, -0.80, Math.PI / 2, 0, 0);
    g.add(warhead);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0, -0.62);
    g.add(muzzleAnchor);

    return {
      group: g,
      muzzleAnchor,
      parts: { warhead },
      hipPos: new THREE.Vector3(0.24, -0.18, -0.35),
      adsPos: new THREE.Vector3(0.055, -0.042, -0.23),
      hipRot: new THREE.Euler(0.02, -0.03, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 52
    };
  }

  function createMuzzleFlashTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, 128, 128);
    const cx = 64, cy = 64;

    // Soft outer gas halo (keep center subtle/hollow so iron sights & red-dot target remain readable)
    const outer = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
    outer.addColorStop(0.0, 'rgba(255, 240, 190, 0.22)');
    outer.addColorStop(0.22, 'rgba(255, 200, 100, 0.52)');
    outer.addColorStop(0.55, 'rgba(255, 130, 40, 0.16)');
    outer.addColorStop(1.0, 'rgba(255, 90, 20, 0.0)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, 128, 128);

    // 6-prong flash suppressor star streaks
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 3);
      const grad = ctx.createLinearGradient(0, 0, 62, 0);
      grad.addColorStop(0.0, 'rgba(255, 248, 210, 0.35)');
      grad.addColorStop(0.35, 'rgba(255, 215, 115, 0.85)');
      grad.addColorStop(1.0, 'rgba(255, 120, 30, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(6, -1.5);
      ctx.lineTo(62, -5.5);
      ctx.lineTo(62, 5.5);
      ctx.lineTo(6, 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function buildMuzzleFlash() {
    const mats = createViewmodelMaterials();
    const g = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.135), mats.muzzleFlash);
    p1.position.z = -0.045;
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.125, 0.125), mats.muzzleFlash);
    p2.position.z = -0.06;
    p2.rotation.z = Math.PI * 0.25;
    const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.055), mats.muzzleFlash);
    p3.position.z = -0.075;
    p3.rotation.y = Math.PI * 0.5;
    g.add(p1, p2, p3);
    g.visible = false;
    return g;
  }

  function resolveMode(mode) {
    const raw = (mode !== undefined && mode !== null)
      ? mode
      : ((I.core && I.core.gameMode) ? I.core.gameMode : (W._gameMode || 'survival'));
    const expConst = (LRT.Config && LRT.Config.MODES && LRT.Config.MODES.EXPLORATION) ? LRT.Config.MODES.EXPLORATION : 'exploration';
    return (raw === 'exploration' || raw === expConst) ? 'exploration' : 'survival';
  }

  function resolveDifficulty(difficultyKey) {
    if (difficultyKey !== undefined && difficultyKey !== null) {
      return setDifficulty(difficultyKey);
    }
    if (I.core && I.core.difficultyKey) {
      return setDifficulty(I.core.difficultyKey);
    }
    return setDifficulty(W._difficultyKey || 'medium');
  }

  function findWeaponIndex(idOrSlot) {
    const cfgList = getWeaponConfigs();
    if (typeof idOrSlot === 'number') {
      const idx = Math.floor(idOrSlot) - 1;
      return (idx >= 0 && idx < cfgList.length) ? idx : -1;
    }
    if (typeof idOrSlot === 'string') {
      const idx = cfgList.findIndex((w) => w.id === idOrSlot);
      if (idx >= 0) return idx;
      const num = Number(idOrSlot);
      if (!Number.isNaN(num) && num >= 1 && num <= cfgList.length) return Math.floor(num) - 1;
    }
    return -1;
  }

  function applySkin(weaponId, skinId) {
    const preset = SKIN_PRESETS[skinId] || SKIN_PRESETS.pindad_standard;
    W._unlockedSkins.add(preset.id);

    if (weaponId === 'all') {
      const cfgList = getWeaponConfigs();
      for (let i = 0; i < cfgList.length; i++) {
        applySkin(cfgList[i].id, preset.id);
      }
      return preset.id;
    }

    const idx = findWeaponIndex(weaponId);
    if (idx < 0) return null;

    if (W._weaponStates[idx]) {
      W._weaponStates[idx].skinId = preset.id;
    }

    const matSet = W._weaponMatSets[idx];
    if (matSet) {
      const texCache = ensureSkinTexCache();
      const whiteTex = texCache.white;
      const skinTex = (preset.texKey && texCache[preset.texKey]) || whiteTex;

      for (let i = 0; i < SKINNABLE_MAT_KEYS.length; i++) {
        const key = SKINNABLE_MAT_KEYS[i];
        const mat = matSet[key];
        const spec = preset[key];
        if (!mat || !spec) continue;
        if (mat.color && typeof mat.color.setHex === 'function') {
          mat.color.setHex(spec.color);
        }
        if (typeof spec.roughness === 'number') mat.roughness = spec.roughness;
        if (typeof spec.metalness === 'number') mat.metalness = spec.metalness;
        if ('clearcoat' in mat && typeof spec.clearcoat === 'number') {
          mat.clearcoat = spec.clearcoat;
        }
        if (mat.emissive && typeof mat.emissive.setHex === 'function') {
          mat.emissive.setHex(spec.emissive || 0x000000);
        }
        if ('map' in mat) {
          mat.map = spec.useTex ? (skinTex || whiteTex) : whiteTex;
        }
      }

      if (matSet.tritiumGreen && matSet.tritiumGreen.color && typeof preset.tritiumGreen === 'number') {
        matSet.tritiumGreen.color.setHex(preset.tritiumGreen);
      }
      if (matSet.redDot && matSet.redDot.color && typeof preset.redDot === 'number') {
        matSet.redDot.color.setHex(preset.redDot);
      }
      if (matSet.amberBead && matSet.amberBead.color && typeof preset.amberBead === 'number') {
        matSet.amberBead.color.setHex(preset.amberBead);
      }
      if (matSet.opticLens) {
        if (matSet.opticLens.color && typeof preset.opticLensColor === 'number') {
          matSet.opticLens.color.setHex(preset.opticLensColor);
        }
        if (matSet.opticLens.emissive && typeof preset.opticLensEmissive === 'number') {
          matSet.opticLens.emissive.setHex(preset.opticLensEmissive);
        }
      }
    }

    return preset.id;
  }

  function applyWeaponUpgrade(id, modObj) {
    if (!modObj || typeof modObj !== 'object') return null;
    const cfgList = getWeaponConfigs();

    if (id === 'all') {
      const res = [];
      for (let i = 0; i < W._weaponStates.length; i++) {
        if (W._weaponStates[i] && W._weaponStates[i].unlocked) {
          res.push(applyWeaponUpgrade(cfgList[i].id, modObj));
        }
      }
      return res;
    }

    const idx = findWeaponIndex(id);
    if (idx < 0) return null;
    const wCfg = cfgList[idx];
    const wState = W._weaponStates[idx];
    if (!wCfg || !wState) return null;

    if (typeof modObj.dmgMultAdd === 'number') {
      wState.dmgMult = Math.min(DMG_MULT_CAP, +((wState.dmgMult || 1.0) + modObj.dmgMultAdd).toFixed(4));
    } else if (typeof modObj.dmgAdd === 'number') {
      wState.dmgMult = Math.min(DMG_MULT_CAP, +((wState.dmgMult || 1.0) + modObj.dmgAdd).toFixed(4));
    } else if (typeof modObj.dmgMult === 'number') {
      const delta = modObj.dmgMult > 1 ? (modObj.dmgMult - 1) : modObj.dmgMult;
      wState.dmgMult = Math.min(DMG_MULT_CAP, +((wState.dmgMult || 1.0) + Math.max(0, delta)).toFixed(4));
    }

    if (typeof modObj.reloadMultSub === 'number') {
      wState.reloadMult = Math.max(RELOAD_MULT_FLOOR, +((wState.reloadMult || 1.0) - modObj.reloadMultSub).toFixed(4));
    } else if (typeof modObj.reloadSub === 'number') {
      wState.reloadMult = Math.max(RELOAD_MULT_FLOOR, +((wState.reloadMult || 1.0) - modObj.reloadSub).toFixed(4));
    } else if (typeof modObj.reloadMult === 'number' && modObj.reloadMult > 0 && modObj.reloadMult < 1) {
      wState.reloadMult = Math.max(RELOAD_MULT_FLOOR, +((wState.reloadMult || 1.0) * modObj.reloadMult).toFixed(4));
    }

    const magAdd = (typeof modObj.magBonusAdd === 'number')
      ? modObj.magBonusAdd
      : (typeof modObj.magBonus === 'number' ? modObj.magBonus : 0);
    if (magAdd > 0) {
      const cap = MAG_BONUS_CAPS[wCfg.id] || 0;
      wState.magBonus = Math.min(cap, Math.max(0, (wState.magBonus || 0) + Math.round(magAdd)));
    }

    return {
      applied: true,
      id: wCfg.id,
      magBonus: wState.magBonus,
      dmgMult: wState.dmgMult,
      reloadMult: wState.reloadMult,
      effectiveMagSize: getEffectiveMagSize(idx)
    };
  }

  function rollDuplicateUpgrade(idx, rngFn) {
    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[idx];
    const wState = W._weaponStates[idx];
    if (!wCfg || !wState) return null;
    const rng = typeof rngFn === 'function' ? rngFn : Math.random;
    const magCap = MAG_BONUS_CAPS[wCfg.id] || 0;
    const candidates = [];

    if ((wState.dmgMult || 1.0) < DMG_MULT_CAP) {
      candidates.push({ dmgMultAdd: 0.08 });
    }
    if ((wState.reloadMult || 1.0) > RELOAD_MULT_FLOOR) {
      candidates.push({ reloadMult: 0.90 });
    }
    if ((wState.magBonus || 0) < magCap) {
      const step = wCfg.id === 'rifle' ? 3 : wCfg.id === 'pistol' ? 2 : 1;
      candidates.push({ magBonusAdd: step });
    }
    if (candidates.length === 0) {
      candidates.push({ dmgMultAdd: 0.06 });
    }
    const chosen = candidates[Math.floor(rng() * candidates.length) % candidates.length];
    return applyWeaponUpgrade(wCfg.id, chosen);
  }

  function unlockWeapon(idOrAll, bonusReserve) {
    const cfgList = getWeaponConfigs();
    const diff = getDifficultyCfg();

    if (idOrAll === 'all') {
      for (let i = 0; i < cfgList.length; i++) {
        const wCfg = cfgList[i];
        const wState = W._weaponStates[i];
        if (!wState) continue;
        wState.unlocked = true;
        const effMag = getEffectiveMagSize(i);
        wState.mag = Math.max(wState.mag, effMag);
        if (!wCfg.infiniteReserve) {
          const targetRes = (typeof bonusReserve === 'number')
            ? Math.max(wState.reserve, Math.round(bonusReserve))
            : Math.max(wState.reserve, wCfg.id === 'rpg' ? 6 : wCfg.startReserve);
          wState.reserve = Math.min(Math.max(wCfg.startReserve * 2, effMag * 6), targetRes);
        }
      }
      if (W._activeIdx === 3 && _vmModels[3] && _vmModels[3].parts.warhead) {
        _vmModels[3].parts.warhead.visible = W._weaponStates[3].mag > 0;
      }
      return {
        unlockedAll: true,
        unlockedWeapons: W._weaponStates.filter((ws) => ws.unlocked).map((ws) => ws.id)
      };
    }

    const idx = findWeaponIndex(idOrAll);
    if (idx < 0) return null;
    const wCfg = cfgList[idx];
    const wState = W._weaponStates[idx];
    if (!wCfg || !wState) return null;

    const effMag = getEffectiveMagSize(idx);
    const maxReserve = Math.max(wCfg.startReserve * 2, effMag * 6);

    if (!wState.unlocked) {
      wState.unlocked = true;
      wState.mag = effMag;
      let ammoGranted = 0;
      if (!wCfg.infiniteReserve) {
        const defaultRes = wCfg.id === 'rpg'
          ? 2
          : Math.max(effMag, Math.round(wCfg.magSize * 2 * (diff.startAmmoMult || 1.0)));
        const gain = (typeof bonusReserve === 'number') ? Math.max(0, Math.round(bonusReserve)) : defaultRes;
        const prev = wState.reserve;
        wState.reserve = Math.min(maxReserve, prev + gain);
        ammoGranted = wState.reserve - prev;
      }
      if (idx === 3 && _vmModels[3] && _vmModels[3].parts.warhead) {
        _vmModels[3].parts.warhead.visible = wState.mag > 0;
      }
      return {
        id: wCfg.id,
        slot: wCfg.slot,
        newlyUnlocked: true,
        duplicate: false,
        ammoGranted,
        mag: wState.mag,
        reserve: wState.reserve,
        upgrade: null
      };
    }

    // Duplicate weapon rule: grant reserve + automatic Common/Uncommon upgrade roll
    let ammoGranted = 0;
    if (!wCfg.infiniteReserve) {
      const dupDefault = wCfg.id === 'rpg'
        ? 2
        : Math.max(1, Math.round(wCfg.magSize * 1.5 * (diff.pickupAmmoMult || 1.0)));
      const gain = (typeof bonusReserve === 'number') ? Math.max(0, Math.round(bonusReserve)) : dupDefault;
      const prev = wState.reserve;
      wState.reserve = Math.min(maxReserve, prev + gain);
      ammoGranted = wState.reserve - prev;
    }
    const upgrade = rollDuplicateUpgrade(idx);
    return {
      id: wCfg.id,
      slot: wCfg.slot,
      newlyUnlocked: false,
      duplicate: true,
      ammoGranted,
      mag: wState.mag,
      reserve: wState.reserve,
      upgrade
    };
  }

  function getProgressionState() {
    const cfgList = getWeaponConfigs();
    const upgrades = {};
    const equippedSkins = {};
    const unlockedWeapons = [];

    for (let i = 0; i < W._weaponStates.length; i++) {
      const ws = W._weaponStates[i];
      const cfg = cfgList[i];
      if (!ws || !cfg) continue;
      if (ws.unlocked) unlockedWeapons.push(cfg.id);
      upgrades[cfg.id] = {
        magBonus: ws.magBonus || 0,
        dmgMult: ws.dmgMult || 1.0,
        reloadMult: ws.reloadMult || 1.0,
        effectiveMagSize: getEffectiveMagSize(i)
      };
      equippedSkins[cfg.id] = ws.skinId || 'pindad_standard';
    }

    const armor = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function')
      ? ((LRT.PlayerUI.getState() && LRT.PlayerUI.getState().armor) || 0)
      : 0;

    return {
      difficulty: W._difficultyKey,
      mode: W._gameMode,
      unlockedWeapons,
      upgrades,
      equippedSkins,
      unlockedSkins: Array.from(W._unlockedSkins),
      armor,
      pityCounters: {
        cratesSinceEpic: W._cratesSinceEpic,
        cratesSinceLegendary: W._cratesSinceLegendary
      }
    };
  }

  function initWeaponStates(mode, difficultyKey) {
    const cfgList = getWeaponConfigs();
    const resolvedMode = resolveMode(mode);
    const resolvedDiff = resolveDifficulty(difficultyKey);
    W._gameMode = resolvedMode;
    const isExploration = (resolvedMode === 'exploration');
    const diffCfg = getDifficultyCfg(resolvedDiff);
    const startAmmoMult = typeof diffCfg.startAmmoMult === 'number' ? diffCfg.startAmmoMult : 1.0;

    W._cratesSinceEpic = 0;
    W._cratesSinceLegendary = 0;
    W._unlockedSkins = new Set(['pindad_standard']);

    W._weaponStates = cfgList.map((w) => {
      let unlocked = false;
      if (isExploration) {
        unlocked = true;
      } else if (w.id === 'pistol') {
        unlocked = true;
      } else if (w.id === 'rifle') {
        unlocked = (resolvedDiff === 'easy');
      } else {
        unlocked = false;
      }

      const mag = unlocked ? w.magSize : 0;
      const reserve = !unlocked
        ? 0
        : (w.infiniteReserve ? 999 : Math.round(w.startReserve * (isExploration ? 1.0 : startAmmoMult)));

      return {
        id: w.id,
        slot: w.slot,
        unlocked,
        mag,
        reserve,
        magBonus: 0,
        dmgMult: 1.0,
        reloadMult: 1.0,
        skinId: 'pindad_standard'
      };
    });

    for (let i = 0; i < cfgList.length; i++) {
      applySkin(cfgList[i].id, 'pindad_standard');
    }

    W._activeIdx = 0;
    W._isADS = false;
    W._adsBlend = 0;
    W._isFiringHeld = false;
    W._fireCooldown = 0;
    W._isReloading = false;
    W._reloadTimer = 0;
    W._switchTimer = 0;
    W._pumpTimer = -1;
    W._bloom = 0;
    W._recoilZ = 0;
    W._recoilPitchVM = 0;
    W._pendingCamPitch = 0;
    W._pendingCamYaw = 0;
    W._trauma = 0;
    W._hitmarkerTimer = 0;
    W._killConfirmTimer = 0;

    for (let i = 0; i < _vmModels.length; i++) {
      _vmModels[i].group.visible = (i === W._activeIdx);
    }
    const rpgVm = _vmModels[3];
    if (rpgVm && rpgVm.parts.warhead) {
      rpgVm.parts.warhead.visible = W._weaponStates[3] ? (W._weaponStates[3].mag > 0) : false;
      rpgVm.parts.warhead.position.set(0, 0, 0);
    }
  }

  function setVisible(bool) {
    if (W._viewmodelRoot) W._viewmodelRoot.visible = !!bool;
  }

  function cycleWeapon(dir) {
    const len = W._weaponStates.length;
    if (!len) return false;
    const step = (typeof dir === 'number' && dir < 0) ? -1 : 1;
    for (let k = 1; k < len; k++) {
      const cand = (W._activeIdx + step * k + len * 4) % len;
      if (W._weaponStates[cand] && W._weaponStates[cand].unlocked) {
        return switchWeapon(cand + 1);
      }
    }
    return false;
  }

  function switchWeapon(slot, opts) {
    const idx = findWeaponIndex(slot);
    if (idx < 0 || idx >= W._weaponStates.length) return false;

    const targetState = W._weaponStates[idx];
    if (!targetState || !targetState.unlocked) {
      if (opts && opts.skipLocked) {
        return cycleWeapon(opts.dir || 1);
      }
      play3D('dry_fire', null, 0.03, 0.85);
      if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
        LRT.PlayerUI.setNotice('Slot terkunci — temukan di Cache / Lootbox!', '#f97316');
      }
      return false;
    }

    if (idx === W._activeIdx) return false;

    W._isReloading = false;
    W._reloadTimer = 0;
    W._pumpTimer = -1;
    W._isADS = false;
    W._activeIdx = idx;
    W._switchTimer = 0.26;
    W._fireCooldown = 0.18;

    for (let i = 0; i < _vmModels.length; i++) {
      _vmModels[i].group.visible = (i === W._activeIdx);
    }
    // Sync RPG warhead visibility on switch back
    if (W._activeIdx === 3 && _vmModels[3] && _vmModels[3].parts.warhead) {
      _vmModels[3].parts.warhead.visible = W._weaponStates[3].mag > 0;
      _vmModels[3].parts.warhead.position.set(0, 0, 0);
    }
    play3D('weapon_switch', null, 0.05, 0.85);
    return true;
  }

  function setADS(bool) {
    W._isADS = !!bool;
  }

  function reload() {
    if (W._isReloading) return;
    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[W._activeIdx];
    const wState = W._weaponStates[W._activeIdx];
    if (!wCfg || !wState || !wState.unlocked) return;
    const effMag = getEffectiveMagSize(W._activeIdx);
    if (wState.mag >= effMag) return;
    if (!wCfg.infiniteReserve && wState.reserve <= 0) return;

    const diff = getDifficultyCfg();
    const reloadScale = Math.max(0.4, (wState.reloadMult || 1.0) * (diff.reloadTimeMult || 1.0));
    W._isReloading = true;
    W._reloadDuration = (wCfg.reloadTime || 1.4) * reloadScale;
    W._reloadTimer = W._reloadDuration;
    W._isADS = false;
    W._pumpTimer = -1;
    play3D('weapon_reload', null, 0.04, 0.9);
  }

  function updateViewmodel(dt, playerState) {
    const vm = _vmModels[W._activeIdx];
    if (!vm) return;

    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[W._activeIdx];
    const wState = W._weaponStates[W._activeIdx];

    // ADS transition & camera FOV zoom
    const targetAds = (W._isADS && !W._isReloading && W._switchTimer <= 0.05) ? 1.0 : 0.0;
    W._adsBlend += (targetAds - W._adsBlend) * Math.min(1, dt * 14.0);

    if (W._camera) {
      const pcfg = getPlayerCfg();
      const baseFov = pcfg.baseFov || 74;
      const targetFov = baseFov + ((vm.adsFov || 56) - baseFov) * W._adsBlend;
      if (Math.abs(W._camera.fov - targetFov) > 0.03) {
        W._camera.fov = targetFov;
        W._camera.updateProjectionMatrix();
      }
    }

    // Walk bob
    const moveSpd = (playerState && typeof playerState.speed === 'number') ? playerState.speed : 0;
    const grounded = playerState ? (playerState.grounded !== false) : true;
    const bobAmp = grounded ? Math.min(1.0, moveSpd / 5.5) * (1.0 - W._adsBlend * 0.78) : 0.05;
    W._walkBobPhase += dt * (4.0 + moveSpd * 1.55);

    const bobX = Math.cos(W._walkBobPhase * 0.5) * 0.011 * bobAmp;
    const bobY = Math.abs(Math.sin(W._walkBobPhase)) * -0.012 * bobAmp;

    // Recoil spring decay
    W._recoilZ += (0 - W._recoilZ) * Math.min(1, dt * 16.0);
    W._recoilPitchVM += (0 - W._recoilPitchVM) * Math.min(1, dt * 14.0);
    W._bloom = Math.max(0, W._bloom - dt * 0.055);

    // Switch dip
    let switchDip = 0;
    if (W._switchTimer > 0) {
      W._switchTimer = Math.max(0, W._switchTimer - dt);
      switchDip = (W._switchTimer / 0.26) * 0.20;
    }

    // Reload animation
    let reloadTiltZ = 0;
    let reloadTiltX = 0;
    let reloadDipY = 0;
    if (W._isReloading) {
      W._reloadTimer -= dt;
      const prog = 1.0 - Math.max(0, W._reloadTimer / W._reloadDuration);
      const wave = Math.sin(prog * Math.PI);
      reloadTiltZ = 0.44 * wave;
      reloadTiltX = -0.30 * wave;
      reloadDipY = -0.07 * wave;

      if (vm.parts.mag) {
        const magDrop = Math.sin(Math.min(1, prog * 1.35) * Math.PI);
        vm.parts.mag.position.set(0, -0.14 * magDrop, 0.02 * magDrop);
      }
      if (wCfg.id === 'rpg' && vm.parts.warhead) {
        if (prog > 0.35) {
          vm.parts.warhead.visible = true;
          const insertT = Math.min(1, (prog - 0.35) / 0.50);
          vm.parts.warhead.position.set(0, -0.08 * (1 - insertT), -0.32 * (1 - insertT));
        } else {
          vm.parts.warhead.visible = false;
        }
      }

      if (W._reloadTimer <= 0) {
        W._isReloading = false;
        W._reloadTimer = 0;
        const effMag = getEffectiveMagSize(W._activeIdx);
        const needed = Math.max(0, effMag - wState.mag);
        if (wCfg.infiniteReserve) {
          wState.mag = effMag;
        } else {
          const take = Math.min(needed, wState.reserve);
          wState.mag += take;
          wState.reserve -= take;
        }
        if (vm.parts.mag) vm.parts.mag.position.set(0, 0, 0);
        if (vm.parts.warhead) {
          vm.parts.warhead.visible = wState.mag > 0;
          vm.parts.warhead.position.set(0, 0, 0);
        }
      }
    }

    // Slide / Bolt / Pump articulation
    if (vm.parts.slide) {
      vm.parts.slide.position.z = W._recoilZ * 0.65;
    }
    if (vm.parts.bolt) {
      vm.parts.bolt.position.z = W._recoilZ * 0.85;
    }
    if (vm.parts.pump && W._pumpTimer > 0) {
      W._pumpTimer += dt;
      if (W._pumpTimer >= 0.16 && !W._pumpPlayed) {
        W._pumpPlayed = true;
        play3D('shotgun_pump', null, 0.04, 0.9);
        if (typeof W.ejectShellCasing === 'function') W.ejectShellCasing('shotgun');
      }
      if (W._pumpTimer >= 0.16 && W._pumpTimer <= 0.48) {
        const pt = (W._pumpTimer - 0.16) / 0.32;
        vm.parts.pump.position.z = Math.sin(pt * Math.PI) * 0.085;
      } else if (W._pumpTimer > 0.48) {
        vm.parts.pump.position.z = 0;
        W._pumpTimer = -1;
      }
    }

    // Compose viewmodel transform
    _v1.lerpVectors(vm.hipPos, vm.adsPos, W._adsBlend);
    vm.group.position.set(
      _v1.x + bobX,
      _v1.y + bobY - switchDip + reloadDipY,
      _v1.z + W._recoilZ
    );
    vm.group.rotation.set(
      vm.hipRot.x * (1 - W._adsBlend) + vm.adsRot.x * W._adsBlend + W._recoilPitchVM + reloadTiltX,
      vm.hipRot.y * (1 - W._adsBlend) + vm.adsRot.y * W._adsBlend,
      reloadTiltZ
    );
  }

  function consumeCameraKick() {
    const p = W._pendingCamPitch;
    const y = W._pendingCamYaw;
    W._pendingCamPitch = 0;
    W._pendingCamYaw = 0;
    const t2 = W._trauma * W._trauma;
    const shakePitch = Math.sin(W._traumaTime * 47.0) * t2 * 0.024;
    const shakeYaw = Math.cos(W._traumaTime * 53.0) * t2 * 0.020;
    const shakeRoll = Math.sin(W._traumaTime * 61.0) * t2 * 0.032;
    return {
      recoilPitch: p,
      recoilYaw: y,
      shakePitch,
      shakeYaw,
      shakeRoll,
      trauma: W._trauma
    };
  }

  function setWarmupMode(active) {
    if (!W._initialized) return;
    const on = !!active;
    if (on) {
      if (!W._warmupActive) {
        W._savedVmRootVisible = W._viewmodelRoot ? W._viewmodelRoot.visible : false;
      }
      W._warmupActive = true;
      if (W._viewmodelRoot) W._viewmodelRoot.visible = true;
      for (let i = 0; i < _vmModels.length; i++) {
        _vmModels[i].group.visible = true;
      }
      if (W._muzzleFlashGroup) {
        if (!W._muzzleFlashGroup.parent && _vmModels[0] && _vmModels[0].muzzleAnchor) {
          _vmModels[0].muzzleAnchor.add(W._muzzleFlashGroup);
        }
        W._muzzleFlashGroup.visible = true;
      }
      if (_vmModels[3] && _vmModels[3].parts.warhead) {
        _vmModels[3].parts.warhead.visible = true;
      }
      if (W._vfxRoot) W._vfxRoot.visible = true;
      if (_attachedScorches[0]) {
        if (!_attachedScorches[0].parent && W._vfxRoot) W._vfxRoot.add(_attachedScorches[0]);
        _attachedScorches[0].frustumCulled = false;
        _attachedScorches[0].visible = true;
      }
      if (W._flashLight) W._flashLight.visible = true;
      if (W._rocketLight) W._rocketLight.visible = true;
    } else {
      W._warmupActive = false;
      if (W._viewmodelRoot) W._viewmodelRoot.visible = W._savedVmRootVisible;
      for (let i = 0; i < _vmModels.length; i++) {
        _vmModels[i].group.visible = (i === W._activeIdx);
      }
      if (W._muzzleFlashGroup) {
        W._muzzleFlashGroup.visible = (W._muzzleFlashTimer > 0);
      }
      if (_vmModels[3] && _vmModels[3].parts.warhead) {
        _vmModels[3].parts.warhead.visible = W._weaponStates[3] ? (W._weaponStates[3].mag > 0) : true;
      }
      if (_attachedScorches[0] && _attachedScorches[0].parent === W._vfxRoot) {
        _attachedScorches[0].visible = false;
        _attachedScorches[0].frustumCulled = true;
        W._vfxRoot.remove(_attachedScorches[0]);
      }
    }
  }

  W.getWeaponConfigs = getWeaponConfigs;
  W.getPlayerCfg = getPlayerCfg;
  W.getDifficultyCfg = getDifficultyCfg;
  W.setDifficulty = setDifficulty;
  W.getEffectiveMagSize = getEffectiveMagSize;
  W.findWeaponIndex = findWeaponIndex;
  W.play3D = play3D;
  W.createRpgReticleTexture = createRpgReticleTexture;
  W.createViewmodelMaterials = createViewmodelMaterials;
  W.createWeaponMaterialSet = createWeaponMaterialSet;
  W.ensureSkinTexCache = ensureSkinTexCache;
  W.addPart = addPart;
  W.buildPistolModel = buildPistolModel;
  W.buildRifleModel = buildRifleModel;
  W.buildShotgunModel = buildShotgunModel;
  W.buildRpgModel = buildRpgModel;
  W.createMuzzleFlashTexture = createMuzzleFlashTexture;
  W.buildMuzzleFlash = buildMuzzleFlash;
  W.initWeaponStates = initWeaponStates;
  W.setVisible = setVisible;
  W.cycleWeapon = cycleWeapon;
  W.switchWeapon = switchWeapon;
  W.setADS = setADS;
  W.reload = reload;
  W.applySkin = applySkin;
  W.applyWeaponUpgrade = applyWeaponUpgrade;
  W.unlockWeapon = unlockWeapon;
  W.getProgressionState = getProgressionState;
  W.updateViewmodel = updateViewmodel;
  W.consumeCameraKick = consumeCameraKick;
  W.setWarmupMode = setWarmupMode;
})(window.LRT = window.LRT || {});
