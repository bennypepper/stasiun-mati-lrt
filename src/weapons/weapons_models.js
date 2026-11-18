(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const W = (I.weapons = I.weapons || {});

  // Fallback weapon specs if LRT.Config is not yet loaded
  const FALLBACK_WEAPONS = [
    {
      slot: 1, id: 'pistol', variantId: 'g2', defaultVariant: 'g2',
      name: 'Pindad G2 9mm', shortName: 'G2 PISTOL',
      fireMode: 'semi', damage: 34, headMult: 2.6, dismemberMult: 1.0, rpm: 360, pellets: 1,
      spread: 0.006, adsSpread: 0.002, magSize: 15, startReserve: 999,
      infiniteReserve: true, reloadTime: 1.10, range: 110, knockback: 2.2,
      recoilPitch: 0.022, recoilYaw: 0.006, sfxFire: 'pistol_fire', projectile: false
    },
    {
      slot: 2, id: 'rifle', variantId: 'ss2v5', defaultVariant: 'ss2v5',
      name: 'SS2-V5 Carbine', shortName: 'SS2-V5',
      fireMode: 'auto', damage: 26, headMult: 2.4, dismemberMult: 1.0, rpm: 650, pellets: 1,
      spread: 0.016, adsSpread: 0.005, magSize: 30, startReserve: 180,
      infiniteReserve: false, reloadTime: 1.65, range: 140, knockback: 1.9,
      recoilPitch: 0.017, recoilYaw: 0.010, sfxFire: 'rifle_fire', projectile: false
    },
    {
      slot: 3, id: 'shotgun', variantId: 'pump12g', defaultVariant: 'pump12g',
      name: '12G Pump Tactical', shortName: 'SHOTGUN',
      fireMode: 'semi', damage: 19, headMult: 1.85, dismemberMult: 1.35, rpm: 72, pellets: 8,
      spread: 0.068, adsSpread: 0.044, magSize: 6, startReserve: 42,
      infiniteReserve: false, reloadTime: 1.90, range: 46, knockback: 6.4,
      recoilPitch: 0.055, recoilYaw: 0.018, sfxFire: 'shotgun_fire', sfxPump: 'shotgun_pump', projectile: false
    },
    {
      slot: 4, id: 'rpg', variantId: 'rpg7', defaultVariant: 'rpg7',
      name: 'RPG-7 Launcher', shortName: 'RPG-7',
      fireMode: 'semi', damage: 280, headMult: 1.0, dismemberMult: 3.0, rpm: 35, pellets: 1,
      spread: 0.004, adsSpread: 0.001, magSize: 1, startReserve: 8,
      infiniteReserve: false, reloadTime: 2.25, range: 200, knockback: 18.0,
      blastRadius: 6.5, rocketSpeed: 48.0, recoilPitch: 0.085, recoilYaw: 0.014,
      sfxFire: 'rpg_launch', sfxExplode: 'rpg_explosion', projectile: true
    }
  ];

  const FALLBACK_VARIANTS = {
    pistol: {
      g2: {
        variantId: 'g2', weaponId: 'pistol', slot: 1, name: 'Pindad G2 9mm', shortName: 'G2 PISTOL',
        rarity: 'common', isDefault: true, fireMode: 'semi', damage: 34, headMult: 2.6, dismemberMult: 1.0,
        rpm: 360, pellets: 1, spread: 0.006, adsSpread: 0.002, magSize: 15, reloadTime: 1.10, range: 110,
        knockback: 2.2, recoilPitch: 0.022, recoilYaw: 0.006, sfxFire: 'pistol_fire'
      },
      revolver: {
        variantId: 'revolver', weaponId: 'pistol', slot: 1, name: '.357 Magnum Revolver', shortName: '.357 MAG',
        rarity: 'rare', isDefault: false, fixedMag: true, noCasingEject: true,
        fireMode: 'semi', damage: 82, headMult: 3.1, dismemberMult: 2.25, rpm: 175, pellets: 1,
        spread: 0.005, adsSpread: 0.0012, magSize: 6, reloadTime: 1.55, range: 130, knockback: 6.4,
        recoilPitch: 0.048, recoilYaw: 0.010, sfxFire: 'pistol_fire', firePitch: 0.72
      }
    },
    rifle: {
      ss2v5: {
        variantId: 'ss2v5', weaponId: 'rifle', slot: 2, name: 'SS2-V5 Carbine', shortName: 'SS2-V5',
        rarity: 'common', isDefault: true, fireMode: 'auto', damage: 26, headMult: 2.4, dismemberMult: 1.0,
        rpm: 650, pellets: 1, spread: 0.016, adsSpread: 0.005, magSize: 30, reloadTime: 1.65, range: 140,
        knockback: 1.9, recoilPitch: 0.017, recoilYaw: 0.010, sfxFire: 'rifle_fire'
      },
      m4: {
        variantId: 'm4', weaponId: 'rifle', slot: 2, name: 'M4A1 Tactical', shortName: 'M4A1 TAC',
        rarity: 'rare', isDefault: false, fireMode: 'auto', damage: 29, headMult: 2.55, dismemberMult: 1.2,
        rpm: 780, pellets: 1, spread: 0.012, adsSpread: 0.0018, magSize: 30, reloadTime: 1.45, range: 155,
        knockback: 2.1, recoilPitch: 0.014, recoilYaw: 0.007, sfxFire: 'rifle_fire', firePitch: 1.08
      },
      ak47: {
        variantId: 'ak47', weaponId: 'rifle', slot: 2, name: 'AK-47', shortName: 'AK-47',
        rarity: 'epic', isDefault: false, fireMode: 'auto', damage: 44, headMult: 2.5, dismemberMult: 1.9,
        rpm: 560, pellets: 1, spread: 0.019, adsSpread: 0.0042, magSize: 30, reloadTime: 1.75, range: 150,
        knockback: 3.8, recoilPitch: 0.025, recoilYaw: 0.013, sfxFire: 'rifle_fire', firePitch: 0.84
      }
    },
    shotgun: {
      pump12g: {
        variantId: 'pump12g', weaponId: 'shotgun', slot: 3, name: '12G Pump Tactical', shortName: 'SHOTGUN',
        rarity: 'common', isDefault: true, fireMode: 'semi', damage: 19, headMult: 1.85, dismemberMult: 1.35,
        rpm: 72, pellets: 8, spread: 0.068, adsSpread: 0.044, magSize: 6, reloadTime: 1.90, range: 46,
        knockback: 6.4, recoilPitch: 0.055, recoilYaw: 0.018, sfxFire: 'shotgun_fire', sfxPump: 'shotgun_pump'
      },
      doublebarrel: {
        variantId: 'doublebarrel', weaponId: 'shotgun', slot: 3, name: 'Double-Barrel Coach Gun', shortName: 'COACH 12G',
        rarity: 'epic', isDefault: false, fixedMag: true, noPump: true, noCasingEject: true,
        fireMode: 'semi', damage: 25, headMult: 2.15, dismemberMult: 2.65, rpm: 150, pellets: 12,
        spread: 0.082, adsSpread: 0.052, magSize: 2, reloadTime: 1.55, range: 40, knockback: 10.5,
        recoilPitch: 0.075, recoilYaw: 0.024, sfxFire: 'shotgun_fire', firePitch: 0.86
      }
    },
    rpg: {
      rpg7: {
        variantId: 'rpg7', weaponId: 'rpg', slot: 4, name: 'RPG-7 Launcher', shortName: 'RPG-7',
        rarity: 'common', isDefault: true, fireMode: 'semi', damage: 280, headMult: 1.0, dismemberMult: 3.0,
        rpm: 35, pellets: 1, spread: 0.004, adsSpread: 0.001, magSize: 1, reloadTime: 2.25, range: 200,
        knockback: 18.0, blastRadius: 6.5, rocketSpeed: 48.0, recoilPitch: 0.085, recoilYaw: 0.014,
        sfxFire: 'rpg_launch', sfxExplode: 'rpg_explosion'
      }
    }
  };

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
  const _worldBox = new THREE.Box3();
  const _worldSize = new THREE.Vector3();
  const _worldCenter = new THREE.Vector3();

  W.FALLBACK_WEAPONS = FALLBACK_WEAPONS;
  W.FALLBACK_VARIANTS = FALLBACK_VARIANTS;
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
  W._revolverCylAngle = 0;
  W._revolverCylTarget = 0;
  W._revolverHammerKick = 0;

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

  const SKIN_ALIASES = {
    default: 'pindad_standard',
    standard: 'pindad_standard',
    pindad: 'pindad_standard',
    forest: 'tni_digital_forest',
    digital_forest: 'tni_digital_forest',
    desert: 'desert_tactical',
    desert_tan: 'desert_tactical',
    navy: 'kai_brass_navy',
    brass: 'kai_brass_navy',
    carbon: 'carbon_crimson',
    gold: 'evac_gold_24k',
    emerald: 'emerald_specops'
  };

  const SKIN_PRESETS = {
    pindad_standard: {
      id: 'pindad_standard',
      name: 'Pindad Standard',
      rarity: 'common',
      texKey: 'brushedSteelTex',
      bumpKey: 'brushedSteelBump',
      bumpScale: 0.0018,
      gunSteelMid: { color: 0x6c788a, roughness: 0.24, metalness: 0.82, clearcoat: 0.34, emissive: 0x000000, useTex: true },
      gunSteelDark: { color: 0x454d5a, roughness: 0.34, metalness: 0.74, emissive: 0x000000, useTex: true },
      gunSteelLight: { color: 0xb2becf, roughness: 0.17, metalness: 0.92, clearcoat: 0.42, emissive: 0x000000, useTex: true },
      polymerBlack: { color: 0x2d323b, roughness: 0.60, metalness: 0.14, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x424954, roughness: 0.72, metalness: 0.08, emissive: 0x000000, useKnurl: true },
      rpgOlive: { color: 0x627a4b, roughness: 0.36, metalness: 0.46, clearcoat: 0.28, emissive: 0x000000, useTex: true },
      rpgWarhead: { color: 0x5c7244, roughness: 0.42, metalness: 0.40, emissive: 0x000000, useTex: true },
      rpgWood: { color: 0xd8a878, roughness: 0.48, metalness: 0.06, clearcoat: 0.22, emissive: 0x000000, useWood: true },
      brass: { color: 0xe6be5e, roughness: 0.20, metalness: 0.90, emissive: 0x000000, useTex: true },
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
      bumpKey: 'brushedSteelBump',
      bumpScale: 0.0014,
      gunSteelMid: { color: 0xecf2e4, roughness: 0.44, metalness: 0.38, clearcoat: 0.12, emissive: 0x000000, useTex: true },
      gunSteelDark: { color: 0xbcc8b0, roughness: 0.50, metalness: 0.32, emissive: 0x000000, useTex: true },
      gunSteelLight: { color: 0x637d4a, roughness: 0.30, metalness: 0.62, clearcoat: 0.22, emissive: 0x000000, useTex: false },
      polymerBlack: { color: 0x2a3326, roughness: 0.66, metalness: 0.12, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x364231, roughness: 0.72, metalness: 0.08, emissive: 0x000000, useKnurl: true },
      rpgOlive: { color: 0xecf2e4, roughness: 0.44, metalness: 0.38, clearcoat: 0.12, emissive: 0x000000, useTex: true },
      rpgWarhead: { color: 0xd4dec8, roughness: 0.44, metalness: 0.34, emissive: 0x000000, useTex: true },
      rpgWood: { color: 0x6e7d5a, roughness: 0.54, metalness: 0.12, emissive: 0x000000, useWood: true },
      brass: { color: 0xabb672, roughness: 0.26, metalness: 0.80, emissive: 0x000000, useTex: false },
      tritiumGreen: 0x55ff77,
      redDot: 0xff2a2a,
      amberBead: 0x55ff77,
      opticLensColor: 0x46b898,
      opticLensEmissive: 0x0a3428
    },
    desert_tactical: {
      id: 'desert_tactical',
      name: 'Desert Tactical',
      rarity: 'uncommon',
      texKey: 'camoDesertTex',
      bumpKey: 'brushedSteelBump',
      bumpScale: 0.0014,
      gunSteelMid: { color: 0xf4ece0, roughness: 0.42, metalness: 0.40, clearcoat: 0.14, emissive: 0x000000, useTex: true },
      gunSteelDark: { color: 0xcabca6, roughness: 0.48, metalness: 0.34, emissive: 0x000000, useTex: true },
      gunSteelLight: { color: 0xa6895f, roughness: 0.30, metalness: 0.65, clearcoat: 0.25, emissive: 0x000000, useTex: false },
      polymerBlack: { color: 0x43382a, roughness: 0.66, metalness: 0.10, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x544635, roughness: 0.72, metalness: 0.08, emissive: 0x000000, useKnurl: true },
      rpgOlive: { color: 0xf4ece0, roughness: 0.42, metalness: 0.40, clearcoat: 0.14, emissive: 0x000000, useTex: true },
      rpgWarhead: { color: 0xded2be, roughness: 0.44, metalness: 0.36, emissive: 0x000000, useTex: true },
      rpgWood: { color: 0xb08a5a, roughness: 0.50, metalness: 0.08, emissive: 0x000000, useWood: true },
      brass: { color: 0xd4a850, roughness: 0.22, metalness: 0.86, emissive: 0x000000, useTex: false },
      tritiumGreen: 0x55ff77,
      redDot: 0xff3b2f,
      amberBead: 0xffb33a,
      opticLensColor: 0x4cc2d9,
      opticLensEmissive: 0x0c3442
    },
    kai_brass_navy: {
      id: 'kai_brass_navy',
      name: 'KAI Brass/Navy',
      rarity: 'rare',
      texKey: 'anodizedNavyTex',
      bumpKey: 'brushedSteelBump',
      bumpScale: 0.0020,
      gunSteelMid: { color: 0xffffff, roughness: 0.21, metalness: 0.78, clearcoat: 0.50, emissive: 0x030c1e, useTex: true },
      gunSteelDark: { color: 0xd6dff0, roughness: 0.26, metalness: 0.72, emissive: 0x010612, useTex: true },
      gunSteelLight: { color: 0xd4aa48, roughness: 0.17, metalness: 0.92, clearcoat: 0.55, emissive: 0x160f02, useTex: false },
      polymerBlack: { color: 0x1b2536, roughness: 0.52, metalness: 0.20, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x263247, roughness: 0.56, metalness: 0.16, emissive: 0x000000, useKnurl: true },
      rpgOlive: { color: 0xffffff, roughness: 0.21, metalness: 0.78, clearcoat: 0.50, emissive: 0x030c1e, useTex: true },
      rpgWarhead: { color: 0xe6eefc, roughness: 0.24, metalness: 0.74, emissive: 0x020816, useTex: true },
      rpgWood: { color: 0x9b7229, roughness: 0.36, metalness: 0.42, clearcoat: 0.30, emissive: 0x000000, useWood: true },
      brass: { color: 0xd4aa48, roughness: 0.16, metalness: 0.92, emissive: 0x181002, useTex: false },
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
      bumpKey: 'carbonWeaveBump',
      bumpScale: 0.0028,
      gunSteelMid: { color: 0xedf0f6, roughness: 0.24, metalness: 0.62, clearcoat: 0.68, emissive: 0x000000, useTex: true },
      gunSteelDark: { color: 0xc2c8d4, roughness: 0.28, metalness: 0.58, clearcoat: 0.55, emissive: 0x000000, useTex: true },
      gunSteelLight: { color: 0xd9232a, roughness: 0.20, metalness: 0.80, clearcoat: 0.62, emissive: 0x1e0306, useTex: false },
      polymerBlack: { color: 0x15171c, roughness: 0.42, metalness: 0.22, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x1f222a, roughness: 0.46, metalness: 0.18, emissive: 0x000000, useKnurl: true },
      rpgOlive: { color: 0xedf0f6, roughness: 0.24, metalness: 0.62, clearcoat: 0.68, emissive: 0x000000, useTex: true },
      rpgWarhead: { color: 0xd9232a, roughness: 0.24, metalness: 0.72, emissive: 0x1a0305, useTex: false },
      rpgWood: { color: 0xb2b8c4, roughness: 0.38, metalness: 0.28, emissive: 0x000000, useTex: true },
      brass: { color: 0xd9232a, roughness: 0.20, metalness: 0.82, emissive: 0x1e0306, useTex: false },
      tritiumGreen: 0xff2a2a,
      redDot: 0xff2a2a,
      amberBead: 0xff2a2a,
      opticLensColor: 0xe11d48,
      opticLensEmissive: 0x4c0519
    },
    emerald_specops: {
      id: 'emerald_specops',
      name: 'Emerald Spec-Ops',
      rarity: 'epic',
      texKey: 'emeraldHexTex',
      bumpKey: 'emeraldHexBump',
      bumpScale: 0.0024,
      gunSteelMid: { color: 0xffffff, roughness: 0.20, metalness: 0.82, clearcoat: 0.60, emissive: 0x021810, useTex: true },
      gunSteelDark: { color: 0xd2e8de, roughness: 0.26, metalness: 0.76, clearcoat: 0.48, emissive: 0x01100a, useTex: true },
      gunSteelLight: { color: 0x6ee7b7, roughness: 0.16, metalness: 0.90, clearcoat: 0.66, emissive: 0x04281a, useTex: false },
      polymerBlack: { color: 0x111a18, roughness: 0.44, metalness: 0.20, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x182622, roughness: 0.48, metalness: 0.18, emissive: 0x000000, useKnurl: true },
      rpgOlive: { color: 0xffffff, roughness: 0.20, metalness: 0.82, clearcoat: 0.60, emissive: 0x021810, useTex: true },
      rpgWarhead: { color: 0xd4f0e4, roughness: 0.22, metalness: 0.78, emissive: 0x021810, useTex: true },
      rpgWood: { color: 0x203830, roughness: 0.40, metalness: 0.30, emissive: 0x000000, useWood: true },
      brass: { color: 0x6ee7b7, roughness: 0.18, metalness: 0.90, emissive: 0x042418, useTex: false },
      tritiumGreen: 0x34d399,
      redDot: 0x34d399,
      amberBead: 0x6ee7b7,
      opticLensColor: 0x10b981,
      opticLensEmissive: 0x064e3b
    },
    evac_gold_24k: {
      id: 'evac_gold_24k',
      name: '24K Evac Gold',
      rarity: 'legendary',
      texKey: 'goldEngravedTex',
      bumpKey: 'goldEngravedBump',
      bumpScale: 0.0022,
      gunSteelMid: { color: 0xffffff, roughness: 0.15, metalness: 0.94, clearcoat: 0.72, emissive: 0x1e1300, useTex: true },
      gunSteelDark: { color: 0xe6d4a0, roughness: 0.20, metalness: 0.90, clearcoat: 0.62, emissive: 0x140c00, useTex: true },
      gunSteelLight: { color: 0xfef4a8, roughness: 0.13, metalness: 0.96, clearcoat: 0.80, emissive: 0x281c02, useTex: false },
      polymerBlack: { color: 0x16181c, roughness: 0.36, metalness: 0.28, emissive: 0x000000, useTex: false },
      polymerGrip: { color: 0x20242b, roughness: 0.42, metalness: 0.24, emissive: 0x000000, useKnurl: true },
      rpgOlive: { color: 0xffffff, roughness: 0.15, metalness: 0.94, clearcoat: 0.72, emissive: 0x1e1300, useTex: true },
      rpgWarhead: { color: 0xfff0b8, roughness: 0.17, metalness: 0.92, emissive: 0x1e1300, useTex: true },
      rpgWood: { color: 0x24201c, roughness: 0.34, metalness: 0.30, emissive: 0x000000, useWood: true },
      brass: { color: 0xfef4a8, roughness: 0.13, metalness: 0.96, emissive: 0x281c02, useTex: false },
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
  W._vmVariantMap = [{}, {}, {}, {}];
  W._warmupActive = false;
  W._savedVmRootVisible = false;

  // VFX references shared with setWarmupMode
  W._vfxRoot = null;
  W._attachedScorches = [];

  // Shared base PBR viewmodel materials, per-slot cloned material sets & cached procedural textures
  W._vmMats = null;
  W._weaponMatSets = [];
  W._worldMats = null;
  W._skinTexCache = null;

  const _vmModels = W._vmModels;
  const _attachedScorches = W._attachedScorches;

  function getWeaponConfigs() {
    return (LRT.Config && LRT.Config.WEAPONS) ? LRT.Config.WEAPONS : FALLBACK_WEAPONS;
  }

  function getWeaponVariants(weaponId) {
    const src = (LRT.Config && LRT.Config.WEAPON_VARIANTS) ? LRT.Config.WEAPON_VARIANTS : FALLBACK_VARIANTS;
    if (weaponId) return src[weaponId] || FALLBACK_VARIANTS[weaponId] || {};
    return src;
  }

  function getDefaultVariantId(weaponId) {
    const cfgList = getWeaponConfigs();
    for (let i = 0; i < cfgList.length; i++) {
      if (cfgList[i].id === weaponId) {
        return cfgList[i].defaultVariant || cfgList[i].variantId || 'g2';
      }
    }
    const vMap = getWeaponVariants(weaponId);
    for (const k in vMap) {
      if (vMap[k] && vMap[k].isDefault) return k;
    }
    const keys = Object.keys(vMap);
    return keys[0] || null;
  }

  function resolveVariantSpec(weaponIdOrVariant, maybeVariantId) {
    const allVariants = getWeaponVariants();
    if (maybeVariantId) {
      const idx = findWeaponIndex(weaponIdOrVariant);
      const cfgList = getWeaponConfigs();
      const wId = idx >= 0 ? cfgList[idx].id : weaponIdOrVariant;
      const vMap = allVariants[wId] || {};
      const v = vMap[maybeVariantId];
      if (v) return { slotIdx: idx >= 0 ? idx : (v.slot - 1), weaponId: wId, variantId: v.variantId, spec: v };
    }
    // Search across all weapons if first arg is actually a variantId, or if only weaponId was given
    if (typeof weaponIdOrVariant === 'string') {
      for (const wId of Object.keys(allVariants)) {
        const vMap = allVariants[wId];
        if (vMap && vMap[weaponIdOrVariant]) {
          const v = vMap[weaponIdOrVariant];
          const idx = findWeaponIndex(wId);
          return { slotIdx: idx >= 0 ? idx : (v.slot - 1), weaponId: wId, variantId: v.variantId, spec: v };
        }
      }
      const idx = findWeaponIndex(weaponIdOrVariant);
      if (idx >= 0) {
        const wId = getWeaponConfigs()[idx].id;
        const defId = getDefaultVariantId(wId);
        const v = (allVariants[wId] && allVariants[wId][defId]) || null;
        return { slotIdx: idx, weaponId: wId, variantId: defId, spec: v };
      }
    }
    if (typeof weaponIdOrVariant === 'number') {
      const idx = findWeaponIndex(weaponIdOrVariant);
      if (idx >= 0) {
        const wId = getWeaponConfigs()[idx].id;
        const defId = maybeVariantId || getDefaultVariantId(wId);
        const v = (allVariants[wId] && allVariants[wId][defId]) || null;
        return { slotIdx: idx, weaponId: wId, variantId: defId, spec: v };
      }
    }
    return null;
  }

  function getEffectiveWeaponConfig(idxOrId) {
    const cfgList = getWeaponConfigs();
    const idx = (typeof idxOrId === 'number' && idxOrId >= 0 && idxOrId < cfgList.length && Math.floor(idxOrId) === idxOrId)
      ? idxOrId
      : findWeaponIndex(idxOrId);
    const base = cfgList[idx >= 0 ? idx : 0] || FALLBACK_WEAPONS[0];
    const wState = W._weaponStates[idx >= 0 ? idx : 0];
    const vId = (wState && wState.variantId) ? wState.variantId : (base.defaultVariant || base.variantId);
    const vMap = getWeaponVariants(base.id);
    const vSpec = vMap && vMap[vId];
    if (!vSpec) return base;
    return Object.assign({}, base, vSpec, { id: base.id, slot: base.slot, defaultVariant: base.defaultVariant || vId });
  }

  function getActiveWeaponConfig() {
    return getEffectiveWeaponConfig(W._activeIdx);
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
    const wCfg = getEffectiveWeaponConfig(idx);
    const wState = W._weaponStates[idx];
    if (!wCfg) return 0;
    if (wCfg.fixedMag) return wCfg.magSize;
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

  function makeSeededRng(seedInit) {
    let seed = seedInit >>> 0;
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function makeCanvasTex(canvas, repeatX, repeatY, isColor) {
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    if (isColor && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX || 2, repeatY || 2);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
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
    grad.addColorStop(0.0, 'rgba(30, 110, 95, 0.04)');
    grad.addColorStop(0.78, 'rgba(20, 75, 68, 0.12)');
    grad.addColorStop(0.95, 'rgba(10, 22, 20, 0.38)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, Math.PI * 2);
    ctx.fill();

    // PGO-7 crisp illuminated rangefinder crosshairs & ballistic chevrons
    ctx.strokeStyle = 'rgba(255, 185, 65, 0.92)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(28, 128); ctx.lineTo(106, 128);
    ctx.moveTo(150, 128); ctx.lineTo(228, 128);
    ctx.moveTo(128, 146); ctx.lineTo(128, 226);
    ctx.stroke();

    ctx.lineWidth = 1.8;
    for (const [cy, w] of [[128, 9], [148, 7], [168, 5]]) {
      ctx.beginPath();
      ctx.moveTo(128 - w, cy + w * 0.65);
      ctx.lineTo(128, cy);
      ctx.lineTo(128 + w, cy + w * 0.65);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 110, 50, 0.95)';
    ctx.beginPath();
    ctx.arc(128, 128, 2.0, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
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

  function createBrushedSteelTextures() {
    if (typeof document === 'undefined') return { map: null, bump: null };
    const rng = makeSeededRng(104729);
    const size = 512;

    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    const cb = document.createElement('canvas');
    cb.width = size; cb.height = size;
    const btx = cb.getContext('2d');

    if (!ctx || !btx) return { map: null, bump: null };

    // Neutral light-silver base (multiplied cleanly by material tint)
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0.0, '#eaeef4');
    g.addColorStop(0.5, '#f6f8fb');
    g.addColorStop(1.0, '#e2e6ee');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    btx.fillStyle = '#808080';
    btx.fillRect(0, 0, size, size);

    // Fine directional machined grain
    for (let i = 0; i < 1600; i++) {
      const y = Math.floor(rng() * size);
      const x = Math.floor(rng() * size);
      const len = 32 + Math.floor(rng() * 140);
      const shade = 205 + Math.floor(rng() * 48);
      const alpha = 0.08 + rng() * 0.16;
      ctx.fillStyle = `rgba(${shade},${shade + 2},${Math.min(255, shade + 6)},${alpha.toFixed(3)})`;
      ctx.fillRect(x, y, len, 1);
      if (x + len > size) ctx.fillRect(0, y, (x + len) - size, 1);

      const bVal = 95 + Math.floor(rng() * 65);
      btx.fillStyle = `rgba(${bVal},${bVal},${bVal},0.35)`;
      btx.fillRect(x, y, len, 1);
    }

    // Subtle milled bevel seams & micro-scuffs
    ctx.strokeStyle = 'rgba(130, 140, 155, 0.16)';
    ctx.lineWidth = 1.5;
    for (let y = 64; y < size; y += 128) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      btx.strokeStyle = 'rgba(40,40,40,0.45)';
      btx.beginPath();
      btx.moveTo(0, y);
      btx.lineTo(size, y);
      btx.stroke();
    }

    return {
      map: makeCanvasTex(c, 2, 2, true),
      bump: makeCanvasTex(cb, 2, 2, false)
    };
  }

  function createKnurlTextures() {
    if (typeof document === 'undefined') return { map: null, bump: null };
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    const cb = document.createElement('canvas');
    cb.width = size; cb.height = size;
    const btx = cb.getContext('2d');
    if (!ctx || !btx) return { map: null, bump: null };

    ctx.fillStyle = '#cfcfcf';
    ctx.fillRect(0, 0, size, size);
    btx.fillStyle = '#585858';
    btx.fillRect(0, 0, size, size);

    const step = 12;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const cx = x + step * 0.5;
        const cy = y + step * 0.5;
        // Diamond pyramid stud
        ctx.fillStyle = '#f2f2f2';
        ctx.beginPath();
        ctx.moveTo(cx, y + 1);
        ctx.lineTo(x + step - 1, cy);
        ctx.lineTo(cx, y + step - 1);
        ctx.lineTo(x + 1, cy);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(65,65,65,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();

        btx.fillStyle = '#d8d8d8';
        btx.beginPath();
        btx.moveTo(cx, y + 1);
        btx.lineTo(x + step - 1, cy);
        btx.lineTo(cx, y + step - 1);
        btx.lineTo(x + 1, cy);
        btx.closePath();
        btx.fill();
      }
    }

    return {
      map: makeCanvasTex(c, 4, 4, true),
      bump: makeCanvasTex(cb, 4, 4, false)
    };
  }

  function createWoodGrainTextures() {
    if (typeof document === 'undefined') return { map: null, bump: null };
    const size = 256;
    const rng = makeSeededRng(77291);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    const cb = document.createElement('canvas');
    cb.width = size; cb.height = size;
    const btx = cb.getContext('2d');
    if (!ctx || !btx) return { map: null, bump: null };

    // Warm laminated walnut / Russian birch laminate base
    ctx.fillStyle = '#8b4d24';
    ctx.fillRect(0, 0, size, size);
    btx.fillStyle = '#7e7e7e';
    btx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      const wave = Math.sin(y * 0.14) * 0.5 + Math.sin(y * 0.045 + 1.1) * 0.5;
      const dark = wave > 0.15;
      const alpha = 0.10 + Math.abs(wave) * 0.24;
      ctx.fillStyle = dark ? `rgba(52, 24, 9, ${alpha.toFixed(3)})` : `rgba(176, 108, 56, ${(alpha * 0.85).toFixed(3)})`;
      ctx.fillRect(0, y, size, 1);

      const bv = dark ? 95 : 155;
      btx.fillStyle = `rgb(${bv},${bv},${bv})`;
      btx.fillRect(0, y, size, 1);
    }

    // Fine longitudinal wood pores
    for (let i = 0; i < 420; i++) {
      const x = Math.floor(rng() * size);
      const y = Math.floor(rng() * size);
      const w = 14 + Math.floor(rng() * 44);
      ctx.fillStyle = rng() > 0.4 ? 'rgba(38, 16, 6, 0.28)' : 'rgba(196, 130, 74, 0.18)';
      ctx.fillRect(x, y, w, 1);
    }

    return {
      map: makeCanvasTex(c, 2, 2, true),
      bump: makeCanvasTex(cb, 2, 2, false)
    };
  }

  function createDigitalHexCamoTexture(palette, seedVal) {
    if (typeof document === 'undefined') return null;
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, size, size);

    const rng = makeSeededRng(seedVal);
    // Digital stepped blocks
    const cell = 12;
    const cols = Math.floor(size / cell);
    for (let y = 0; y < cols; y++) {
      for (let x = 0; x < cols; x++) {
        const r = rng();
        if (r < 0.64) {
          const col = palette[1 + Math.floor(rng() * (palette.length - 1))];
          ctx.fillStyle = col;
          const runW = 1 + Math.floor(rng() * 3);
          ctx.fillRect(x * cell, y * cell, Math.min(runW, cols - x) * cell, cell);
          if (rng() < 0.48 && y + 1 < cols) {
            ctx.fillRect(x * cell, (y + 1) * cell, cell, cell);
          }
        }
      }
    }

    // Crisp micro-hex tactical overlay for crisp close-up texture in 1P
    ctx.strokeStyle = 'rgba(18, 22, 18, 0.22)';
    ctx.lineWidth = 1.2;
    const r = 14;
    const dx = r * 1.5;
    const dy = r * Math.sqrt(3);
    for (let row = -1; row < size / (dy * 0.5) + 2; row++) {
      for (let col = -1; col < size / dx + 2; col++) {
        const cx = col * dx;
        const cy = row * (dy * 0.5) + ((col % 2) ? dy * 0.25 : 0);
        if (row % 2 !== 0) continue;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Matte polymer/cerakote grain noise
    for (let i = 0; i < 1800; i++) {
      const nx = Math.floor(rng() * size);
      const ny = Math.floor(rng() * size);
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(nx, ny, 2, 2);
    }

    return makeCanvasTex(c, 2, 2, true);
  }

  function createAnodizedNavyTexture() {
    if (typeof document === 'undefined') return null;
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0.0, '#132a4f');
    grad.addColorStop(0.5, '#1b3e73');
    grad.addColorStop(1.0, '#102444');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const rng = makeSeededRng(90421);
    for (let i = 0; i < 1400; i++) {
      const y = Math.floor(rng() * size);
      const x = Math.floor(rng() * size);
      const len = 30 + Math.floor(rng() * 120);
      ctx.fillStyle = rng() > 0.45 ? 'rgba(110, 165, 240, 0.09)' : 'rgba(6, 14, 30, 0.14)';
      ctx.fillRect(x, y, len, 1);
    }

    // Subtle brass pinstripe accents
    ctx.fillStyle = 'rgba(212, 170, 72, 0.45)';
    ctx.fillRect(0, 126, size, 3);
    ctx.fillRect(0, 382, size, 3);
    ctx.fillStyle = 'rgba(255, 224, 140, 0.25)';
    ctx.fillRect(0, 129, size, 1);

    return makeCanvasTex(c, 2, 2, true);
  }

  function createCarbonWeaveTextures() {
    if (typeof document === 'undefined') return { map: null, bump: null };
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    const cb = document.createElement('canvas');
    cb.width = size; cb.height = size;
    const btx = cb.getContext('2d');
    if (!ctx || !btx) return { map: null, bump: null };

    ctx.fillStyle = '#14161b';
    ctx.fillRect(0, 0, size, size);
    btx.fillStyle = '#404040';
    btx.fillRect(0, 0, size, size);

    // 2x2 Twill Carbon Fiber + Anodized Hex Sheen
    const tile = 16;
    const half = tile / 2;
    for (let y = 0; y < size; y += tile) {
      for (let x = 0; x < size; x += tile) {
        const shift = ((y / tile) % 2) * half;
        const g1 = ctx.createLinearGradient(x, y, x + half, y + tile);
        g1.addColorStop(0.0, '#2a2e38');
        g1.addColorStop(0.5, '#464d5e');
        g1.addColorStop(1.0, '#1c1f26');
        ctx.fillStyle = g1;
        ctx.fillRect((x + shift) % size, y, half - 1, tile - 1);

        const g2 = ctx.createLinearGradient(x, y, x + tile, y + half);
        g2.addColorStop(0.0, '#16181e');
        g2.addColorStop(0.5, '#303540');
        g2.addColorStop(1.0, '#111317');
        ctx.fillStyle = g2;
        ctx.fillRect((x + shift + half) % size, y + (half * 0.5), half - 1, half - 1);

        btx.fillStyle = '#c8c8c8';
        btx.fillRect((x + shift) % size, y + 1, half - 2, tile - 2);
        btx.fillStyle = '#888888';
        btx.fillRect((x + shift + half) % size, y + (half * 0.5) + 1, half - 2, half - 2);
      }
    }

    // Subtle crimson tactical hex pinstripe micro-grid
    ctx.strokeStyle = 'rgba(217, 35, 42, 0.22)';
    ctx.lineWidth = 1.2;
    const r = 32;
    const dx = r * 1.5;
    const dy = r * Math.sqrt(3);
    for (let row = 0; row < size / (dy * 0.5) + 2; row += 2) {
      for (let col = 0; col < size / dx + 2; col++) {
        const cx = col * dx;
        const cy = row * (dy * 0.5) + ((col % 2) ? dy * 0.25 : 0);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    return {
      map: makeCanvasTex(c, 3, 3, true),
      bump: makeCanvasTex(cb, 3, 3, false)
    };
  }

  function createGoldEngravedTextures() {
    if (typeof document === 'undefined') return { map: null, bump: null };
    const size = 512;
    const rng = makeSeededRng(240024);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    const cb = document.createElement('canvas');
    cb.width = size; cb.height = size;
    const btx = cb.getContext('2d');
    if (!ctx || !btx) return { map: null, bump: null };

    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0.0, '#c78c08');
    g.addColorStop(0.35, '#f8cb32');
    g.addColorStop(0.65, '#fded86');
    g.addColorStop(1.0, '#cf940a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    btx.fillStyle = '#909090';
    btx.fillRect(0, 0, size, size);

    // Fine directional brushed gold grain
    for (let i = 0; i < 1200; i++) {
      const y = Math.floor(rng() * size);
      const x = Math.floor(rng() * size);
      const len = 30 + Math.floor(rng() * 110);
      ctx.fillStyle = rng() > 0.4 ? 'rgba(255, 250, 200, 0.16)' : 'rgba(130, 82, 0, 0.12)';
      ctx.fillRect(x, y, len, 1);
    }

    // Crisp engraved diamond/filigree lattice
    ctx.strokeStyle = 'rgba(115, 68, 0, 0.34)';
    ctx.lineWidth = 1.6;
    btx.strokeStyle = '#383838';
    btx.lineWidth = 2.0;
    const step = 32;
    for (let y = 0; y <= size; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(size, y + size);
      ctx.moveTo(size, y); ctx.lineTo(0, y + size);
      ctx.stroke();

      btx.beginPath();
      btx.moveTo(0, y); btx.lineTo(size, y + size);
      btx.moveTo(size, y); btx.lineTo(0, y + size);
      btx.stroke();
    }

    return {
      map: makeCanvasTex(c, 2, 2, true),
      bump: makeCanvasTex(cb, 2, 2, false)
    };
  }

  function createEmeraldHexTextures() {
    if (typeof document === 'undefined') return { map: null, bump: null };
    const size = 512;
    const rng = makeSeededRng(50123);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    const cb = document.createElement('canvas');
    cb.width = size; cb.height = size;
    const btx = cb.getContext('2d');
    if (!ctx || !btx) return { map: null, bump: null };

    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0.0, '#065f46');
    g.addColorStop(0.5, '#10b981');
    g.addColorStop(1.0, '#044e3b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    btx.fillStyle = '#707070';
    btx.fillRect(0, 0, size, size);

    for (let i = 0; i < 1100; i++) {
      const y = Math.floor(rng() * size);
      const x = Math.floor(rng() * size);
      const len = 24 + Math.floor(rng() * 100);
      ctx.fillStyle = rng() > 0.45 ? 'rgba(167, 243, 208, 0.14)' : 'rgba(2, 44, 34, 0.18)';
      ctx.fillRect(x, y, len, 1);
    }

    ctx.strokeStyle = 'rgba(2, 44, 34, 0.55)';
    ctx.lineWidth = 1.8;
    btx.strokeStyle = '#303030';
    btx.lineWidth = 2.0;
    const r = 18;
    const dx = r * 1.5;
    const dy = r * Math.sqrt(3);
    for (let row = 0; row < size / (dy * 0.5) + 2; row += 2) {
      for (let col = 0; col < size / dx + 2; col++) {
        const cx = col * dx;
        const cy = row * (dy * 0.5) + ((col % 2) ? dy * 0.25 : 0);
        ctx.beginPath();
        btx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (k === 0) { ctx.moveTo(px, py); btx.moveTo(px, py); }
          else { ctx.lineTo(px, py); btx.lineTo(px, py); }
        }
        ctx.closePath(); ctx.stroke();
        btx.closePath(); btx.stroke();
      }
    }

    return {
      map: makeCanvasTex(c, 3, 3, true),
      bump: makeCanvasTex(cb, 3, 3, false)
    };
  }

  function ensureSkinTexCache() {
    if (W._skinTexCache) return W._skinTexCache;
    const steel = createBrushedSteelTextures();
    const knurl = createKnurlTextures();
    const wood = createWoodGrainTextures();
    const carbon = createCarbonWeaveTextures();
    const gold = createGoldEngravedTextures();
    const emerald = createEmeraldHexTextures();
    W._skinTexCache = {
      white: createFallbackWhiteTexture(),
      brushedSteelTex: steel.map,
      brushedSteelBump: steel.bump,
      knurlTex: knurl.map,
      knurlBump: knurl.bump,
      woodGrainTex: wood.map,
      woodGrainBump: wood.bump,
      camoForestTex: createDigitalHexCamoTexture(['#3f5138', '#293224', '#646d4c', '#4c6040', '#20271d'], 133742),
      camoDesertTex: createDigitalHexCamoTexture(['#c2a87e', '#8d7552', '#5e4e3a', '#d7c29e', '#766146'], 449811),
      anodizedNavyTex: createAnodizedNavyTexture(),
      carbonWeaveTex: carbon.map,
      carbonWeaveBump: carbon.bump,
      goldEngravedTex: gold.map,
      goldEngravedBump: gold.bump,
      emeraldHexTex: emerald.map,
      emeraldHexBump: emerald.bump
    };
    return W._skinTexCache;
  }

  function createViewmodelMaterials() {
    if (W._vmMats) return W._vmMats;
    const texCache = ensureSkinTexCache();
    const whiteTex = texCache.white;
    const reticleTex = createRpgReticleTexture();
    W._vmMats = {
      gunSteelDark: new THREE.MeshStandardMaterial({
        color: 0x454d5a, map: texCache.brushedSteelTex || whiteTex,
        bumpMap: texCache.brushedSteelBump || null, bumpScale: 0.0018,
        roughness: 0.34, metalness: 0.74, envMapIntensity: 1.45
      }),
      gunSteelMid: new THREE.MeshPhysicalMaterial({
        color: 0x6c788a, map: texCache.brushedSteelTex || whiteTex,
        bumpMap: texCache.brushedSteelBump || null, bumpScale: 0.0018,
        roughness: 0.24, metalness: 0.82,
        clearcoat: 0.34, clearcoatRoughness: 0.18, envMapIntensity: 1.65
      }),
      gunSteelLight: new THREE.MeshPhysicalMaterial({
        color: 0xb2becf, map: texCache.brushedSteelTex || whiteTex,
        bumpMap: texCache.brushedSteelBump || null, bumpScale: 0.0015,
        roughness: 0.17, metalness: 0.92,
        clearcoat: 0.42, clearcoatRoughness: 0.14, envMapIntensity: 1.85
      }),
      polymerBlack: new THREE.MeshStandardMaterial({
        color: 0x2d323b, map: whiteTex, roughness: 0.60, metalness: 0.14, envMapIntensity: 1.15
      }),
      polymerGrip: new THREE.MeshStandardMaterial({
        color: 0x424954, map: texCache.knurlTex || whiteTex,
        bumpMap: texCache.knurlBump || null, bumpScale: 0.0032,
        roughness: 0.72, metalness: 0.08, envMapIntensity: 1.12
      }),
      rpgOlive: new THREE.MeshPhysicalMaterial({
        color: 0x627a4b, map: texCache.brushedSteelTex || whiteTex,
        bumpMap: texCache.brushedSteelBump || null, bumpScale: 0.0016,
        roughness: 0.36, metalness: 0.46,
        clearcoat: 0.28, clearcoatRoughness: 0.24, envMapIntensity: 1.40
      }),
      rpgWarhead: new THREE.MeshStandardMaterial({
        color: 0x5c7244, map: texCache.brushedSteelTex || whiteTex,
        roughness: 0.42, metalness: 0.40, envMapIntensity: 1.30
      }),
      rpgWood: new THREE.MeshPhysicalMaterial({
        color: 0xd8a878, map: texCache.woodGrainTex || whiteTex,
        bumpMap: texCache.woodGrainBump || null, bumpScale: 0.0022,
        roughness: 0.48, metalness: 0.06, clearcoat: 0.22, clearcoatRoughness: 0.35, envMapIntensity: 1.25
      }),
      brass: new THREE.MeshStandardMaterial({
        color: 0xe6be5e, map: texCache.brushedSteelTex || whiteTex,
        roughness: 0.20, metalness: 0.90, envMapIntensity: 1.65
      }),
      shellRed: new THREE.MeshStandardMaterial({ color: 0xd12c2c, roughness: 0.44, metalness: 0.14, envMapIntensity: 1.20 }),
      boreDark: new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.88, metalness: 0.10, envMapIntensity: 0.4 }),
      opticLens: new THREE.MeshPhysicalMaterial({
        color: 0x45b8e0, emissive: 0x072430, emissiveIntensity: 0.28,
        roughness: 0.03, metalness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.03, envMapIntensity: 1.4,
        transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide
      }),
      rpgScopeTube: new THREE.MeshStandardMaterial({
        color: 0x2e343e, roughness: 0.36, metalness: 0.72, envMapIntensity: 1.35, side: THREE.DoubleSide
      }),
      rpgEyecup: new THREE.MeshStandardMaterial({
        color: 0x1e2228, roughness: 0.78, metalness: 0.08, envMapIntensity: 1.0, side: THREE.DoubleSide
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
        if (base[key].map && !cloned[key].map) cloned[key].map = base[key].map;
        if (base[key].bumpMap && !cloned[key].bumpMap) cloned[key].bumpMap = base[key].bumpMap;
      } else {
        cloned[key] = base[key];
      }
    }
    W._weaponMatSets[slotIdx] = cloned;
    return cloned;
  }

  function createWorldMaterials() {
    if (W._worldMats) return W._worldMats;
    const base = createViewmodelMaterials();
    const cloned = {};
    for (const key of Object.keys(base)) {
      if (key === 'rpgReticle' || key === 'muzzleFlash') {
        cloned[key] = base[key];
      } else if (base[key] && typeof base[key].clone === 'function') {
        cloned[key] = base[key].clone();
        if (base[key].map && !cloned[key].map) cloned[key].map = base[key].map;
        if (base[key].bumpMap && !cloned[key].bumpMap) cloned[key].bumpMap = base[key].bumpMap;
      } else {
        cloned[key] = base[key];
      }
    }
    W._worldMats = cloned;
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

  // Shared helper: machined Picatinny rail segment with cross-slots
  function addPicatinnyRail(parent, mats, x, y, zStart, zEnd, width, teethCount) {
    const len = Math.abs(zEnd - zStart);
    const zMid = (zStart + zEnd) * 0.5;
    addPart(parent, new THREE.BoxGeometry(width * 0.80, 0.005, len), mats.gunSteelDark, x, y - 0.002, zMid);
    const count = Math.max(2, teethCount || Math.floor(len / 0.014));
    const step = len / count;
    const toothLen = step * 0.54;
    for (let i = 0; i < count; i++) {
      const tz = Math.max(zStart, zEnd) - (i + 0.5) * step;
      addPart(parent, new THREE.BoxGeometry(width, 0.0045, toothLen), mats.gunSteelLight, x, y + 0.002, tz);
    }
  }

  // Shared helper: compact steel sling swivel loop
  function addSlingSwivel(parent, mats, x, y, z, rz) {
    addPart(parent, new THREE.BoxGeometry(0.008, 0.008, 0.008), mats.gunSteelDark, x, y, z);
    addPart(parent, new THREE.TorusGeometry(0.0075, 0.0018, 6, 12), mats.gunSteelLight, x, y - 0.007, z, 0, Math.PI * 0.5, rz || 0);
  }

  // =========================================================================
  // SLOT 0: PISTOL ('g2' Pindad G2 9mm, 'revolver' .357 Magnum Revolver)
  // =========================================================================
  function buildPistolG2(mats) {
    const g = new THREE.Group();

    // Polymer frame + dust cover + flared magwell + knurled grip panels
    addPart(g, new THREE.BoxGeometry(0.029, 0.020, 0.208), mats.polymerBlack, 0, 0.000, -0.042);
    addPart(g, new THREE.BoxGeometry(0.028, 0.112, 0.044), mats.polymerBlack, 0, -0.060, 0.040, 0.24, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.0315, 0.078, 0.034), mats.polymerGrip, 0, -0.060, 0.040, 0.24, 0, 0);
    // Flared magwell lip + lanyard swivel
    addPart(g, new THREE.BoxGeometry(0.032, 0.009, 0.048), mats.gunSteelDark, 0, -0.112, 0.052, 0.24, 0, 0);
    addSlingSwivel(g, mats, 0, -0.118, 0.066);

    // Under-barrel Picatinny accessory rail
    addPicatinnyRail(g, mats, 0, -0.012, -0.072, -0.136, 0.025, 4);

    // Trigger guard + curved trigger + frame controls (slide stop, takedown lever, safety)
    addPart(g, new THREE.BoxGeometry(0.011, 0.0045, 0.046), mats.polymerBlack, 0, -0.035, -0.016);
    addPart(g, new THREE.BoxGeometry(0.011, 0.025, 0.005), mats.polymerBlack, 0, -0.023, -0.037);
    addPart(g, new THREE.BoxGeometry(0.0045, 0.018, 0.005), mats.gunSteelLight, 0, -0.021, -0.010, -0.38, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.004, 0.006, 0.024), mats.gunSteelLight, -0.016, 0.005, 0.008);
    addPart(g, new THREE.BoxGeometry(0.005, 0.007, 0.012), mats.gunSteelLight, -0.016, 0.003, -0.034);

    // Stainless match barrel + recessed dark bore + recoil guide rod tip
    addPart(g, new THREE.CylinderGeometry(0.0078, 0.0078, 0.208, 12), mats.gunSteelLight, 0, 0.024, -0.056, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.0046, 0.0046, 0.012, 10), mats.boreDark, 0, 0.024, -0.156, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.022, 0.014, 0.038), mats.gunSteelLight, 0, 0.033, -0.028); // Barrel hood
    addPart(g, new THREE.CylinderGeometry(0.0045, 0.0045, 0.095, 8), mats.gunSteelLight, 0, 0.005, -0.104, Math.PI / 2, 0, 0);

    // Articulated beveled 2-tone slide (chamfered top flat + angled serrations + ejection port)
    const slide = new THREE.Group();
    addPart(slide, new THREE.BoxGeometry(0.031, 0.024, 0.214), mats.gunSteelMid, 0, 0.024, -0.042);
    // Chamfered upper bevel & top flat (top surface at y = 0.0405)
    addPart(slide, new THREE.BoxGeometry(0.024, 0.006, 0.208), mats.gunSteelMid, 0, 0.0375, -0.042);
    addPart(slide, new THREE.BoxGeometry(0.018, 0.002, 0.204), mats.gunSteelLight, 0, 0.0398, -0.042);
    // Angled rear & front serrations
    for (let i = 0; i < 6; i++) {
      addPart(slide, new THREE.BoxGeometry(0.0325, 0.018, 0.0025), mats.gunSteelDark, 0, 0.024, 0.022 + i * 0.0065, -0.18, 0, 0);
    }
    for (let i = 0; i < 4; i++) {
      addPart(slide, new THREE.BoxGeometry(0.0325, 0.016, 0.0025), mats.gunSteelDark, 0, 0.024, -0.118 + i * 0.0065, -0.18, 0, 0);
    }
    // Extractor claw
    addPart(slide, new THREE.BoxGeometry(0.003, 0.006, 0.024), mats.gunSteelDark, 0.0155, 0.028, -0.005);

    // Rear sight notch (wide clear 10mm gap) + 2 glowing tritium dots at y = 0.048
    addPart(slide, new THREE.BoxGeometry(0.0065, 0.009, 0.010), mats.gunSteelDark, -0.0085, 0.0465, 0.052);
    addPart(slide, new THREE.BoxGeometry(0.0065, 0.009, 0.010), mats.gunSteelDark, 0.0085, 0.0465, 0.052);
    addPart(slide, new THREE.BoxGeometry(0.018, 0.003, 0.010), mats.gunSteelDark, 0, 0.0415, 0.052);
    addPart(slide, new THREE.BoxGeometry(0.0026, 0.0026, 0.002), mats.tritiumGreen, -0.0085, 0.0480, 0.0572);
    addPart(slide, new THREE.BoxGeometry(0.0026, 0.0026, 0.002), mats.tritiumGreen, 0.0085, 0.0480, 0.0572);

    // Front sight post (slim 3.0mm blade) + glowing tritium center dot at (0, 0.048, -0.140)
    addPart(slide, new THREE.BoxGeometry(0.0030, 0.0095, 0.010), mats.gunSteelDark, 0, 0.0455, -0.140);
    addPart(slide, new THREE.BoxGeometry(0.0024, 0.0024, 0.002), mats.tritiumGreen, 0, 0.0480, -0.135);
    g.add(slide);

    // Removable magazine
    const mag = new THREE.Group();
    addPart(mag, new THREE.BoxGeometry(0.021, 0.108, 0.034), mats.gunSteelMid, 0, -0.068, 0.042, 0.24, 0, 0);
    addPart(mag, new THREE.BoxGeometry(0.027, 0.010, 0.042), mats.polymerGrip, 0, -0.120, 0.054, 0.24, 0, 0);
    g.add(mag);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.024, -0.175);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.018, 0.032, -0.026);
    g.add(ejectAnchor);

    // ADS mathematical check: front dot (0, 0.048, -0.135) + adsPos (0, -0.048, -0.26) => (0, 0) exact!
    return {
      group: g,
      variantId: 'g2',
      muzzleAnchor,
      ejectAnchor,
      parts: { slide, mag },
      hipPos: new THREE.Vector3(0.19, -0.16, -0.35),
      adsPos: new THREE.Vector3(0.0, -0.048, -0.26),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 62
    };
  }

  function buildPistolRevolver(mats) {
    const g = new THREE.Group();

    // Forged steel revolver frame + cylinder window + topstrap sight channel
    addPart(g, new THREE.BoxGeometry(0.026, 0.016, 0.132), mats.gunSteelMid, 0, -0.005, -0.004); // Lower frame
    addPart(g, new THREE.BoxGeometry(0.024, 0.010, 0.095), mats.gunSteelMid, 0, 0.036, 0.002); // Topstrap
    addPart(g, new THREE.BoxGeometry(0.026, 0.044, 0.040), mats.gunSteelMid, 0, 0.016, 0.034); // Recoil shield / backstrap
    addPart(g, new THREE.BoxGeometry(0.026, 0.042, 0.022), mats.gunSteelMid, 0, 0.015, -0.048); // Forward crane frame
    // Cylinder latch (left side) + trigger guard + curved DA trigger
    addPart(g, new THREE.BoxGeometry(0.005, 0.010, 0.018), mats.gunSteelLight, -0.015, 0.016, 0.030);
    addPart(g, new THREE.TorusGeometry(0.016, 0.0032, 6, 14), mats.gunSteelMid, 0, -0.022, 0.000, 0, Math.PI * 0.5, 0);
    addPart(g, new THREE.BoxGeometry(0.004, 0.018, 0.005), mats.gunSteelLight, 0, -0.020, 0.003, -0.36, 0, 0);

    // Articulated spurred hammer
    const hammer = new THREE.Group();
    hammer.position.set(0, 0.026, 0.050);
    addPart(hammer, new THREE.BoxGeometry(0.007, 0.018, 0.012), mats.gunSteelLight, 0, 0.006, 0.004, -0.45, 0, 0);
    addPart(hammer, new THREE.BoxGeometry(0.009, 0.004, 0.014), mats.gunSteelLight, 0, 0.013, 0.011, 0.2, 0, 0);
    g.add(hammer);

    // Rich walnut grip panels + brass grip medallion + lanyard swivel
    addPart(g, new THREE.BoxGeometry(0.028, 0.105, 0.040), mats.rpgWood, 0, -0.052, 0.056, 0.34, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.016, 0.102, 0.036), mats.gunSteelLight, 0, -0.052, 0.056, 0.34, 0, 0); // Steel backstrap spine
    addPart(g, new THREE.CylinderGeometry(0.005, 0.005, 0.030, 10), mats.brass, 0, -0.042, 0.052, 0, 0, Math.PI * 0.5);
    addSlingSwivel(g, mats, 0, -0.106, 0.072);

    // Detailed 6-shot revolving cylinder (rotates 60 deg per shot!)
    const cylinder = new THREE.Group();
    cylinder.position.set(0, 0.015, -0.014);
    addPart(cylinder, new THREE.CylinderGeometry(0.0205, 0.0205, 0.044, 18), mats.gunSteelLight, 0, 0, 0, Math.PI / 2, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const rx = Math.sin(a) * 0.0185;
      const ry = Math.cos(a) * 0.0185;
      // Fluted weight-reduction grooves
      addPart(cylinder, new THREE.CylinderGeometry(0.0048, 0.0048, 0.032, 8), mats.gunSteelDark, rx, ry, -0.002, Math.PI / 2, 0, 0);
      // Visible brass .357 cartridge rims at rear cylinder face
      const cx = Math.sin(a) * 0.0115;
      const cy = Math.cos(a) * 0.0115;
      addPart(cylinder, new THREE.CylinderGeometry(0.0052, 0.0052, 0.004, 8), mats.brass, cx, cy, 0.0225, Math.PI / 2, 0, 0);
    }
    g.add(cylinder);

    // Heavy underlug barrel + ventilated top rib + ejector rod shroud + dark bore
    addPart(g, new THREE.CylinderGeometry(0.0105, 0.0115, 0.158, 12), mats.gunSteelMid, 0, 0.022, -0.136, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.015, 0.018, 0.152), mats.gunSteelMid, 0, 0.008, -0.133); // Full underlug
    addPart(g, new THREE.CylinderGeometry(0.0045, 0.0045, 0.11, 8), mats.gunSteelLight, 0, -0.001, -0.112, Math.PI / 2, 0, 0); // Ejector rod
    addPart(g, new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 10), mats.boreDark, 0, 0.022, -0.212, Math.PI / 2, 0, 0);
    // Ventilated rib along top of barrel (y = 0.042 max)
    addPart(g, new THREE.BoxGeometry(0.011, 0.0035, 0.156), mats.gunSteelLight, 0, 0.040, -0.135);
    for (let i = 0; i < 6; i++) {
      addPart(g, new THREE.BoxGeometry(0.008, 0.007, 0.008), mats.gunSteelDark, 0, 0.035, -0.068 - i * 0.026);
    }

    // Rear adjustable notch + 2 tritium dots at y = 0.049
    addPart(g, new THREE.BoxGeometry(0.006, 0.0085, 0.010), mats.gunSteelDark, -0.0075, 0.0475, 0.036);
    addPart(g, new THREE.BoxGeometry(0.006, 0.0085, 0.010), mats.gunSteelDark, 0.0075, 0.0475, 0.036);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.0024, 0.002), mats.tritiumGreen, -0.0075, 0.0490, 0.0412);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.0024, 0.002), mats.tritiumGreen, 0.0075, 0.0490, 0.0412);
    // Front ramped blade + glowing amber/tritium bead at (0, 0.049, -0.200)
    addPart(g, new THREE.BoxGeometry(0.0030, 0.010, 0.018), mats.gunSteelDark, 0, 0.046, -0.200);
    addPart(g, new THREE.BoxGeometry(0.0026, 0.0026, 0.0025), mats.amberBead, 0, 0.0490, -0.191);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.022, -0.228);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.020, 0.020, -0.014);
    g.add(ejectAnchor);

    // ADS mathematical check: front bead (0, 0.049, -0.191) + adsPos (0, -0.049, -0.25) => (0, 0) exact!
    return {
      group: g,
      variantId: 'revolver',
      muzzleAnchor,
      ejectAnchor,
      parts: { cylinder, hammer },
      hipPos: new THREE.Vector3(0.19, -0.16, -0.34),
      adsPos: new THREE.Vector3(0.0, -0.049, -0.25),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 60
    };
  }

  function buildPistolModel(variantId, matsOverride) {
    const mats = matsOverride || createWeaponMaterialSet(0);
    if (variantId === 'revolver') return buildPistolRevolver(mats);
    return buildPistolG2(mats);
  }

  // =========================================================================
  // SLOT 1: RIFLE ('ss2v5' SS2-V5 Carbine, 'm4' M4A1 Tactical, 'ak47' AK-47)
  // =========================================================================
  function buildRifleSS2V5(mats) {
    const g = new THREE.Group();

    // Chamfered upper & lower receiver + brass deflector + ejection port
    addPart(g, new THREE.BoxGeometry(0.042, 0.028, 0.228), mats.gunSteelDark, 0, -0.012, 0.0);
    addPart(g, new THREE.BoxGeometry(0.043, 0.030, 0.232), mats.gunSteelMid, 0, 0.015, 0.0);
    addPart(g, new THREE.BoxGeometry(0.034, 0.008, 0.228), mats.gunSteelLight, 0, 0.032, 0.0); // Upper bevel
    addPart(g, new THREE.BoxGeometry(0.010, 0.014, 0.016), mats.gunSteelDark, 0.024, 0.016, 0.032); // Brass deflector
    // Top Picatinny rail (receiver + low-profile handguard rail kept well below sight line)
    addPicatinnyRail(g, mats, 0, 0.033, 0.09, -0.29, 0.020, 22);

    // Ergonomic knurled pistol grip + trigger guard + curved trigger + selector
    addPart(g, new THREE.BoxGeometry(0.031, 0.104, 0.042), mats.polymerGrip, 0, -0.064, 0.072, 0.28, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.012, 0.005, 0.044), mats.gunSteelDark, 0, -0.042, 0.020);
    addPart(g, new THREE.BoxGeometry(0.005, 0.018, 0.005), mats.gunSteelLight, 0, -0.032, 0.026, -0.35, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.005, 0.006, 0.020), mats.gunSteelLight, -0.023, -0.006, 0.064, -0.35, 0, 0);

    // Folding/telescoping carbine stock + rubber buttpad + sling swivels
    addPart(g, new THREE.BoxGeometry(0.032, 0.032, 0.175), mats.gunSteelMid, 0, 0.004, 0.195);
    addPart(g, new THREE.BoxGeometry(0.040, 0.106, 0.112), mats.polymerBlack, 0, -0.022, 0.248);
    addPart(g, new THREE.BoxGeometry(0.043, 0.016, 0.095), mats.polymerGrip, 0, 0.026, 0.242);
    addSlingSwivel(g, mats, -0.022, -0.010, 0.255);
    addSlingSwivel(g, mats, -0.026, 0.004, -0.320);

    // Ventilated carbine handguard + machined cooling slots
    addPart(g, new THREE.BoxGeometry(0.045, 0.050, 0.215), mats.gunSteelDark, 0, 0.009, -0.220);
    for (let i = 0; i < 6; i++) {
      addPart(g, new THREE.BoxGeometry(0.050, 0.010, 0.014), mats.gunSteelLight, 0, 0.009, -0.140 - i * 0.028);
      addPart(g, new THREE.BoxGeometry(0.047, 0.008, 0.010), mats.boreDark, 0, 0.022, -0.148 - i * 0.028);
    }

    // Fluted barrel + low-profile gas block + birdcage flash hider + dark muzzle bore
    addPart(g, new THREE.CylinderGeometry(0.0105, 0.0115, 0.245, 12), mats.gunSteelMid, 0, 0.011, -0.405, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.014, 0.016, 0.024), mats.gunSteelLight, 0, 0.016, -0.355);
    addPart(g, new THREE.CylinderGeometry(0.0135, 0.0125, 0.048, 12), mats.gunSteelLight, 0, 0.011, -0.525, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.006, 0.006, 0.016, 10), mats.boreDark, 0, 0.011, -0.545, Math.PI / 2, 0, 0);

    // Articulated reciprocating bolt carrier
    const bolt = new THREE.Group();
    addPart(bolt, new THREE.BoxGeometry(0.012, 0.015, 0.064), mats.gunSteelLight, 0.021, 0.017, -0.010);
    addPart(bolt, new THREE.BoxGeometry(0.020, 0.008, 0.011), mats.polymerGrip, 0.029, 0.017, -0.010);
    g.add(bolt);

    // Articulated curved 30-rd STANAG magazine
    const mag = new THREE.Group();
    addPart(mag, new THREE.BoxGeometry(0.025, 0.142, 0.062), mats.gunSteelMid, 0, -0.088, -0.048, -0.14, 0, 0);
    addPart(mag, new THREE.BoxGeometry(0.027, 0.016, 0.065), mats.polymerGrip, 0, -0.154, -0.058, -0.14, 0, 0);
    g.add(mag);

    // Slim Panoramic Holographic Optic centered at y = +0.075 (ultra-clear wide window)
    addPart(g, new THREE.BoxGeometry(0.036, 0.010, 0.052), mats.gunSteelDark, 0, 0.043, 0.002);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.042, 0.036), mats.gunSteelMid, -0.024, 0.073, 0.000);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.042, 0.036), mats.gunSteelMid, 0.024, 0.073, 0.000);
    addPart(g, new THREE.BoxGeometry(0.050, 0.0024, 0.036), mats.gunSteelLight, 0, 0.095, 0.000);
    addPart(g, new THREE.PlaneGeometry(0.045, 0.040), mats.opticLens, 0, 0.074, -0.011);
    // Crisp pinpoint dot + ultra-fine reference ticks
    addPart(g, new THREE.BoxGeometry(0.0014, 0.0014, 0.0012), mats.redDot, 0, 0.075, -0.010);
    addPart(g, new THREE.BoxGeometry(0.0032, 0.0007, 0.001), mats.redDot, -0.009, 0.075, -0.010);
    addPart(g, new THREE.BoxGeometry(0.0032, 0.0007, 0.001), mats.redDot, 0.009, 0.075, -0.010);
    addPart(g, new THREE.BoxGeometry(0.0007, 0.0032, 0.001), mats.redDot, 0, 0.066, -0.010);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.011, -0.555);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.026, 0.018, -0.010);
    g.add(ejectAnchor);

    // ADS mathematical check: reticle (0, 0.075, -0.010) + adsPos (0, -0.075, -0.25) => (0, 0) exact!
    return {
      group: g,
      variantId: 'ss2v5',
      muzzleAnchor,
      ejectAnchor,
      parts: { bolt, mag },
      hipPos: new THREE.Vector3(0.20, -0.18, -0.36),
      adsPos: new THREE.Vector3(0.0, -0.075, -0.25),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 56
    };
  }

  function buildRifleM4(mats) {
    const g = new THREE.Group();

    // Forged AR-15 upper & lower receiver + forward assist + brass deflector + T-handle latch
    addPart(g, new THREE.BoxGeometry(0.042, 0.028, 0.222), mats.gunSteelDark, 0, -0.012, 0.002);
    addPart(g, new THREE.BoxGeometry(0.043, 0.030, 0.228), mats.gunSteelMid, 0, 0.015, 0.0);
    addPart(g, new THREE.BoxGeometry(0.011, 0.014, 0.016), mats.gunSteelDark, 0.024, 0.017, 0.034); // Brass deflector
    addPart(g, new THREE.CylinderGeometry(0.006, 0.006, 0.028, 8), mats.gunSteelLight, 0.023, 0.012, 0.068, Math.PI / 2, 0, -0.2); // Forward assist
    addPart(g, new THREE.BoxGeometry(0.036, 0.008, 0.018), mats.gunSteelLight, 0, 0.026, 0.114); // T-handle

    // Low-profile top Picatinny rail (kept cleanly below ADS sight line)
    addPicatinnyRail(g, mats, 0, 0.032, 0.10, -0.10, 0.020, 12);
    addPart(g, new THREE.BoxGeometry(0.016, 0.004, 0.215), mats.gunSteelDark, 0, 0.031, -0.215);

    // Knurled pistol grip + trigger guard + curved trigger
    addPart(g, new THREE.BoxGeometry(0.031, 0.102, 0.042), mats.polymerGrip, 0, -0.064, 0.072, 0.28, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.012, 0.005, 0.044), mats.gunSteelDark, 0, -0.042, 0.020);
    addPart(g, new THREE.BoxGeometry(0.005, 0.018, 0.005), mats.gunSteelLight, 0, -0.032, 0.026, -0.35, 0, 0);

    // 6-position telescoping crane stock + buffer tube + sling swivel
    addPart(g, new THREE.CylinderGeometry(0.017, 0.017, 0.185, 12), mats.gunSteelMid, 0, 0.004, 0.198, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.046, 0.108, 0.120), mats.polymerBlack, 0, -0.020, 0.252);
    addPart(g, new THREE.CylinderGeometry(0.014, 0.014, 0.115, 10), mats.polymerGrip, -0.020, -0.004, 0.250, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.014, 0.014, 0.115, 10), mats.polymerGrip, 0.020, -0.004, 0.250, Math.PI / 2, 0, 0);
    addSlingSwivel(g, mats, -0.024, -0.025, 0.275);

    // Quad-Rail RIS Handguard with ventilated cooling slots & rail covers + angled handstop
    addPart(g, new THREE.CylinderGeometry(0.018, 0.018, 0.220, 12), mats.gunSteelDark, 0, 0.010, -0.220, Math.PI / 2, 0, 0);
    addPicatinnyRail(g, mats, 0, -0.017, -0.115, -0.320, 0.020, 12);
    addPart(g, new THREE.BoxGeometry(0.052, 0.022, 0.165), mats.polymerGrip, 0, 0.010, -0.220); // Side rail panels
    for (let i = 0; i < 7; i++) {
      addPart(g, new THREE.BoxGeometry(0.054, 0.009, 0.010), mats.gunSteelLight, 0, 0.010, -0.135 - i * 0.028);
    }
    // Tactical angled foregrip / handstop
    addPart(g, new THREE.BoxGeometry(0.026, 0.056, 0.032), mats.polymerBlack, 0, -0.042, -0.245, 0.18, 0, 0);

    // SOPMOD barrel + low-profile gas block + A2 birdcage flash hider
    addPart(g, new THREE.CylinderGeometry(0.010, 0.011, 0.235, 12), mats.gunSteelMid, 0, 0.011, -0.415, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.016, 0.020, 0.026), mats.gunSteelDark, 0, 0.015, -0.355);
    addPart(g, new THREE.CylinderGeometry(0.013, 0.012, 0.046, 12), mats.gunSteelLight, 0, 0.011, -0.535, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.006, 0.006, 0.016, 10), mats.boreDark, 0, 0.011, -0.554, Math.PI / 2, 0, 0);

    // Articulated bolt carrier
    const bolt = new THREE.Group();
    addPart(bolt, new THREE.BoxGeometry(0.012, 0.015, 0.062), mats.gunSteelLight, 0.021, 0.017, -0.010);
    g.add(bolt);

    // Ribbed 30-rd Tactical PMAG
    const mag = new THREE.Group();
    addPart(mag, new THREE.BoxGeometry(0.026, 0.145, 0.064), mats.polymerBlack, 0, -0.088, -0.048, -0.14, 0, 0);
    for (let i = 0; i < 4; i++) {
      addPart(mag, new THREE.BoxGeometry(0.028, 0.007, 0.066), mats.polymerGrip, 0, -0.056 - i * 0.024, -0.044 - i * 0.003, -0.14, 0, 0);
    }
    g.add(mag);

    // Slim Panoramic Holographic Sight at y = 0.076 (razor-thin frame, wide clear lens window)
    addPart(g, new THREE.BoxGeometry(0.036, 0.010, 0.054), mats.gunSteelDark, 0, 0.043, 0.002);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.044, 0.036), mats.gunSteelMid, -0.025, 0.074, 0.000);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.044, 0.036), mats.gunSteelMid, 0.025, 0.074, 0.000);
    addPart(g, new THREE.BoxGeometry(0.0524, 0.0024, 0.036), mats.gunSteelLight, 0, 0.097, 0.000);
    addPart(g, new THREE.PlaneGeometry(0.047, 0.042), mats.opticLens, 0, 0.075, -0.010);
    // Crisp pinpoint reticle dot + ultra-fine holo quadrant ticks
    addPart(g, new THREE.BoxGeometry(0.0014, 0.0014, 0.0012), mats.redDot, 0, 0.076, -0.009);
    addPart(g, new THREE.BoxGeometry(0.0034, 0.0007, 0.001), mats.redDot, -0.010, 0.076, -0.009);
    addPart(g, new THREE.BoxGeometry(0.0034, 0.0007, 0.001), mats.redDot, 0.010, 0.076, -0.009);
    addPart(g, new THREE.BoxGeometry(0.0007, 0.0034, 0.001), mats.redDot, 0, 0.086, -0.009);
    addPart(g, new THREE.BoxGeometry(0.0007, 0.0034, 0.001), mats.redDot, 0, 0.066, -0.009);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.011, -0.562);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.026, 0.018, -0.010);
    g.add(ejectAnchor);

    // ADS mathematical check: reticle (0, 0.076, -0.009) + adsPos (0, -0.076, -0.25) => (0, 0) exact!
    return {
      group: g,
      variantId: 'm4',
      muzzleAnchor,
      ejectAnchor,
      parts: { bolt, mag },
      hipPos: new THREE.Vector3(0.20, -0.18, -0.36),
      adsPos: new THREE.Vector3(0.0, -0.076, -0.25),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 54
    };
  }

  function buildRifleAK47(mats) {
    const g = new THREE.Group();

    // Stamped steel receiver + ribbed top dust cover (top at y = 0.039) + trunnion rivets
    addPart(g, new THREE.BoxGeometry(0.040, 0.038, 0.235), mats.gunSteelDark, 0, 0.006, 0.002);
    addPart(g, new THREE.BoxGeometry(0.036, 0.015, 0.222), mats.gunSteelMid, 0, 0.030, 0.006);
    for (let i = 0; i < 4; i++) {
      addPart(g, new THREE.BoxGeometry(0.038, 0.003, 0.008), mats.gunSteelLight, 0, 0.038, 0.065 - i * 0.036);
    }
    // Right-side iconic safety selector lever
    addPart(g, new THREE.BoxGeometry(0.004, 0.014, 0.092), mats.gunSteelLight, 0.022, 0.012, 0.038, 0.08, 0, 0);

    // Warm laminated wood furniture: classic angled buttstock + steel buttplate + sling swivel
    addPart(g, new THREE.BoxGeometry(0.035, 0.056, 0.225), mats.rpgWood, 0, -0.018, 0.220, 0.14, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.036, 0.095, 0.055), mats.rpgWood, 0, -0.036, 0.308, 0.14, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.038, 0.100, 0.010), mats.gunSteelDark, 0, -0.038, 0.338, 0.14, 0, 0);
    addSlingSwivel(g, mats, -0.020, -0.045, 0.285);

    // Checkered grip + trigger guard + curved trigger
    addPart(g, new THREE.BoxGeometry(0.030, 0.100, 0.040), mats.rpgWood, 0, -0.062, 0.072, 0.30, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.012, 0.005, 0.044), mats.gunSteelDark, 0, -0.038, 0.018);
    addPart(g, new THREE.BoxGeometry(0.005, 0.018, 0.005), mats.gunSteelLight, 0, -0.026, 0.024, -0.35, 0, 0);

    // Upper & lower laminated wood handguards with steel retainer ferrules + sling swivel
    addPart(g, new THREE.BoxGeometry(0.040, 0.026, 0.165), mats.rpgWood, 0, 0.002, -0.200);
    addPart(g, new THREE.CylinderGeometry(0.016, 0.016, 0.155, 10), mats.rpgWood, 0, 0.024, -0.198, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.042, 0.046, 0.016), mats.gunSteelMid, 0, 0.012, -0.120);
    addPart(g, new THREE.BoxGeometry(0.042, 0.046, 0.016), mats.gunSteelMid, 0, 0.012, -0.280);
    addSlingSwivel(g, mats, -0.023, 0.004, -0.280);

    // Exposed barrel + gas tube + angled gas block + slant muzzle brake + cleaning rod
    addPart(g, new THREE.CylinderGeometry(0.010, 0.011, 0.285, 12), mats.gunSteelMid, 0, 0.008, -0.415, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.009, 0.009, 0.090, 10), mats.gunSteelDark, 0, 0.024, -0.320, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.018, 0.032, 0.026), mats.gunSteelMid, 0, 0.018, -0.358, -0.32, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.0032, 0.0032, 0.240, 6), mats.gunSteelLight, 0, -0.008, -0.395, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.0125, 0.012, 0.034, 12), mats.gunSteelLight, 0, 0.008, -0.562, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.006, 0.006, 0.014, 10), mats.boreDark, 0, 0.008, -0.576, Math.PI / 2, 0, 0);

    // Articulated curved charging handle bolt carrier
    const bolt = new THREE.Group();
    addPart(bolt, new THREE.BoxGeometry(0.010, 0.014, 0.068), mats.gunSteelLight, 0.020, 0.022, -0.012);
    addPart(bolt, new THREE.BoxGeometry(0.020, 0.007, 0.010), mats.gunSteelLight, 0.028, 0.022, -0.030);
    g.add(bolt);

    // Iconic curved 7.62x39mm steel banana magazine
    const mag = new THREE.Group();
    addPart(mag, new THREE.BoxGeometry(0.026, 0.095, 0.066), mats.gunSteelMid, 0, -0.056, -0.048, -0.10, 0, 0);
    addPart(mag, new THREE.BoxGeometry(0.025, 0.098, 0.062), mats.gunSteelDark, 0, -0.132, -0.072, -0.36, 0, 0);
    addPart(mag, new THREE.BoxGeometry(0.028, 0.012, 0.065), mats.gunSteelLight, 0, -0.178, -0.090, -0.36, 0, 0);
    g.add(mag);

    // Classic AK tangent rear sight (wide U-notch + tritium dots at y = 0.058)
    addPart(g, new THREE.BoxGeometry(0.022, 0.014, 0.046), mats.gunSteelDark, 0, 0.042, -0.115);
    addPart(g, new THREE.BoxGeometry(0.006, 0.009, 0.010), mats.gunSteelDark, -0.0085, 0.0565, -0.100);
    addPart(g, new THREE.BoxGeometry(0.006, 0.009, 0.010), mats.gunSteelDark, 0.0085, 0.0565, -0.100);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.0024, 0.002), mats.tritiumGreen, -0.0085, 0.0580, -0.095);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.0024, 0.002), mats.tritiumGreen, 0.0085, 0.0580, -0.095);

    // Open-top front sight base + protective ears + slim tritium pinpoint at (0, 0.058, -0.515)
    addPart(g, new THREE.BoxGeometry(0.018, 0.028, 0.022), mats.gunSteelMid, 0, 0.026, -0.515);
    addPart(g, new THREE.BoxGeometry(0.0032, 0.022, 0.014), mats.gunSteelDark, -0.0095, 0.048, -0.515);
    addPart(g, new THREE.BoxGeometry(0.0032, 0.022, 0.014), mats.gunSteelDark, 0.0095, 0.048, -0.515);
    addPart(g, new THREE.BoxGeometry(0.0026, 0.018, 0.004), mats.gunSteelDark, 0, 0.049, -0.515);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.0024, 0.002), mats.tritiumGreen, 0, 0.0580, -0.512);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.008, -0.585);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.026, 0.022, -0.014);
    g.add(ejectAnchor);

    // ADS mathematical check: front dot (0, 0.058, -0.512) + adsPos (0, -0.058, -0.24) => (0, 0) exact!
    return {
      group: g,
      variantId: 'ak47',
      muzzleAnchor,
      ejectAnchor,
      parts: { bolt, mag },
      hipPos: new THREE.Vector3(0.20, -0.18, -0.36),
      adsPos: new THREE.Vector3(0.0, -0.058, -0.24),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 56
    };
  }

  function buildRifleModel(variantId, matsOverride) {
    const mats = matsOverride || createWeaponMaterialSet(1);
    if (variantId === 'm4') return buildRifleM4(mats);
    if (variantId === 'ak47') return buildRifleAK47(mats);
    return buildRifleSS2V5(mats);
  }

  // =========================================================================
  // SLOT 2: SHOTGUN ('pump12g' 12G Pump Tactical, 'doublebarrel' Coach Gun)
  // =========================================================================
  function buildShotgunPump12G(mats) {
    const g = new THREE.Group();

    // Chamfered heavy tactical receiver + top Picatinny rail + ejection port
    addPart(g, new THREE.BoxGeometry(0.048, 0.062, 0.222), mats.gunSteelMid, 0, 0.000, 0.0);
    addPart(g, new THREE.BoxGeometry(0.036, 0.007, 0.210), mats.gunSteelLight, 0, 0.033, 0.0);
    addPicatinnyRail(g, mats, 0, 0.038, 0.01, -0.09, 0.022, 7);
    addPart(g, new THREE.BoxGeometry(0.005, 0.020, 0.062), mats.gunSteelLight, 0.0235, 0.013, -0.022);
    addPart(g, new THREE.BoxGeometry(0.007, 0.015, 0.048), mats.shellRed, 0.023, 0.005, -0.022);

    // Tactical stock + knurled grip + trigger guard + sling swivel
    addPart(g, new THREE.BoxGeometry(0.038, 0.088, 0.240), mats.polymerGrip, 0, -0.036, 0.210, 0.16, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.042, 0.095, 0.016), mats.polymerBlack, 0, -0.056, 0.325, 0.16, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.012, 0.005, 0.044), mats.gunSteelDark, 0, -0.038, 0.038);
    addPart(g, new THREE.BoxGeometry(0.005, 0.018, 0.005), mats.gunSteelLight, 0, -0.026, 0.044, -0.35, 0, 0);
    addSlingSwivel(g, mats, -0.020, -0.062, 0.295);

    // Heavy 12G barrel + perforated ventilated heatshield + dark bore + under-barrel mag tube
    addPart(g, new THREE.CylinderGeometry(0.014, 0.015, 0.545, 14), mats.gunSteelDark, 0, 0.022, -0.365, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.0095, 0.0095, 0.016, 12), mats.boreDark, 0, 0.022, -0.630, Math.PI / 2, 0, 0);
    // Ventilated perforated heatshield & top rib
    addPart(g, new THREE.CylinderGeometry(0.0165, 0.0165, 0.28, 12, 1, true, -Math.PI * 0.45, Math.PI * 0.9), mats.gunSteelMid, 0, 0.022, -0.26, Math.PI / 2, 0, 0);
    for (let i = 0; i < 8; i++) {
      addPart(g, new THREE.BoxGeometry(0.012, 0.005, 0.014), mats.gunSteelLight, 0, 0.039, -0.14 - i * 0.030);
    }
    // Under-barrel tube magazine + barrel clamp + front sling swivel
    addPart(g, new THREE.CylinderGeometry(0.012, 0.012, 0.465, 12), mats.gunSteelLight, 0, -0.005, -0.325, Math.PI / 2, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.034, 0.042, 0.018), mats.gunSteelMid, 0, 0.008, -0.525);
    addSlingSwivel(g, mats, 0, -0.022, -0.525);

    // Ghost-ring rear sight (open aperture centered at y = 0.054) + front fiber-optic bead at y = 0.054
    addPart(g, new THREE.TorusGeometry(0.011, 0.0018, 8, 22), mats.gunSteelDark, 0, 0.054, 0.030);
    addPart(g, new THREE.BoxGeometry(0.005, 0.009, 0.012), mats.gunSteelDark, -0.013, 0.054, 0.030);
    addPart(g, new THREE.BoxGeometry(0.005, 0.009, 0.012), mats.gunSteelDark, 0.013, 0.054, 0.030);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.0024, 0.002), mats.tritiumGreen, -0.013, 0.054, 0.0365);
    addPart(g, new THREE.BoxGeometry(0.0024, 0.0024, 0.002), mats.tritiumGreen, 0.013, 0.054, 0.0365);
    // Front pedestal & glowing amber bead at (0, 0.054, -0.600)
    addPart(g, new THREE.BoxGeometry(0.006, 0.014, 0.014), mats.gunSteelDark, 0, 0.044, -0.600);
    addPart(g, new THREE.SphereGeometry(0.0028, 8, 8), mats.amberBead, 0, 0.054, -0.600);

    // Articulated ribbed pump fore-end
    const pump = new THREE.Group();
    addPart(pump, new THREE.CylinderGeometry(0.022, 0.022, 0.175, 12), mats.polymerBlack, 0, -0.005, -0.275, Math.PI / 2, 0, 0);
    for (let i = 0; i < 6; i++) {
      addPart(pump, new THREE.CylinderGeometry(0.0245, 0.0245, 0.012, 12), mats.gunSteelMid, 0, -0.005, -0.205 - i * 0.026, Math.PI / 2, 0, 0);
    }
    g.add(pump);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.022, -0.648);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.027, 0.008, -0.020);
    g.add(ejectAnchor);

    // ADS mathematical check: ghost ring + bead at (0, 0.054) + adsPos (0, -0.054, -0.27) => (0, 0) exact!
    return {
      group: g,
      variantId: 'pump12g',
      muzzleAnchor,
      ejectAnchor,
      parts: { pump },
      hipPos: new THREE.Vector3(0.21, -0.19, -0.38),
      adsPos: new THREE.Vector3(0.0, -0.054, -0.27),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 63
    };
  }

  function buildShotgunDoubleBarrel(mats) {
    const g = new THREE.Group();

    // Break-action sculpted steel receiver + top tang lever + double triggers + hinge pin
    addPart(g, new THREE.BoxGeometry(0.054, 0.046, 0.145), mats.gunSteelLight, 0, 0.004, 0.004);
    addPart(g, new THREE.BoxGeometry(0.024, 0.014, 0.065), mats.gunSteelMid, 0, 0.012, 0.088, 0.16, 0, 0); // Tang
    addPart(g, new THREE.BoxGeometry(0.009, 0.007, 0.042), mats.gunSteelDark, 0, 0.030, 0.038, 0, -0.12, 0); // Top locking lever
    addPart(g, new THREE.CylinderGeometry(0.006, 0.006, 0.058, 10), mats.brass, 0, -0.006, -0.064, 0, 0, Math.PI / 2); // Hinge pin
    // Double triggers & elongated guard
    addPart(g, new THREE.BoxGeometry(0.014, 0.005, 0.054), mats.gunSteelDark, 0, -0.036, 0.022);
    addPart(g, new THREE.BoxGeometry(0.004, 0.016, 0.005), mats.brass, 0, -0.024, 0.014, -0.35, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.004, 0.016, 0.005), mats.brass, 0, -0.024, 0.030, -0.35, 0, 0);

    // Classic walnut stock + brass buttplate + sling swivel
    addPart(g, new THREE.BoxGeometry(0.038, 0.052, 0.095), mats.rpgWood, 0, -0.014, 0.115, 0.24, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.040, 0.092, 0.195), mats.rpgWood, 0, -0.044, 0.245, 0.14, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.042, 0.096, 0.010), mats.brass, 0, -0.056, 0.342, 0.14, 0, 0);
    addSlingSwivel(g, mats, 0, -0.092, 0.275);

    // Rear sight notch at tang (y = 0.038)
    addPart(g, new THREE.BoxGeometry(0.006, 0.005, 0.008), mats.gunSteelDark, -0.007, 0.0365, 0.015);
    addPart(g, new THREE.BoxGeometry(0.006, 0.005, 0.008), mats.gunSteelDark, 0.007, 0.0365, 0.015);
    addPart(g, new THREE.BoxGeometry(0.0022, 0.0022, 0.002), mats.tritiumGreen, -0.007, 0.0380, 0.0195);
    addPart(g, new THREE.BoxGeometry(0.0022, 0.0022, 0.002), mats.tritiumGreen, 0.007, 0.0380, 0.0195);

    // Articulated break-action twin side-by-side barrels + walnut splinter forend + twin shells
    const breakBarrel = new THREE.Group();
    breakBarrel.position.set(0, -0.004, -0.066);

    // Twin 12G side-by-side barrels (local z from 0.02 down to -0.46)
    addPart(breakBarrel, new THREE.CylinderGeometry(0.0135, 0.0145, 0.475, 14), mats.gunSteelDark, -0.0145, 0.022, -0.220, Math.PI / 2, 0, 0);
    addPart(breakBarrel, new THREE.CylinderGeometry(0.0135, 0.0145, 0.475, 14), mats.gunSteelDark, 0.0145, 0.022, -0.220, Math.PI / 2, 0, 0);
    // Dark recessed muzzles
    addPart(breakBarrel, new THREE.CylinderGeometry(0.0095, 0.0095, 0.014, 12), mats.boreDark, -0.0145, 0.022, -0.452, Math.PI / 2, 0, 0);
    addPart(breakBarrel, new THREE.CylinderGeometry(0.0095, 0.0095, 0.014, 12), mats.boreDark, 0.0145, 0.022, -0.452, Math.PI / 2, 0, 0);
    // Top & bottom barrel joining ribs
    addPart(breakBarrel, new THREE.BoxGeometry(0.010, 0.008, 0.470), mats.gunSteelMid, 0, 0.031, -0.220);
    addPart(breakBarrel, new THREE.BoxGeometry(0.010, 0.008, 0.460), mats.gunSteelMid, 0, 0.012, -0.215);
    // Walnut splinter forend + front sling swivel
    addPart(breakBarrel, new THREE.BoxGeometry(0.044, 0.026, 0.185), mats.rpgWood, 0, 0.004, -0.115);
    addSlingSwivel(breakBarrel, mats, 0, -0.012, -0.205);
    // Twin visible 12G red shells with brass rims inside chambers (visible when break-action opens!)
    addPart(breakBarrel, new THREE.CylinderGeometry(0.0105, 0.0105, 0.048, 10), mats.shellRed, -0.0145, 0.022, -0.005, Math.PI / 2, 0, 0);
    addPart(breakBarrel, new THREE.CylinderGeometry(0.0112, 0.0112, 0.008, 10), mats.brass, -0.0145, 0.022, 0.018, Math.PI / 2, 0, 0);
    addPart(breakBarrel, new THREE.CylinderGeometry(0.0105, 0.0105, 0.048, 10), mats.shellRed, 0.0145, 0.022, -0.005, Math.PI / 2, 0, 0);
    addPart(breakBarrel, new THREE.CylinderGeometry(0.0112, 0.0112, 0.008, 10), mats.brass, 0.0145, 0.022, 0.018, Math.PI / 2, 0, 0);

    // Glowing front brass/amber bead centered at world-local (0, 0.038, -0.506)
    addPart(breakBarrel, new THREE.SphereGeometry(0.0028, 8, 8), mats.amberBead, 0, 0.042, -0.440);
    g.add(breakBarrel);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.018, -0.540);
    g.add(muzzleAnchor);

    const ejectAnchor = new THREE.Object3D();
    ejectAnchor.position.set(0.025, 0.018, -0.020);
    g.add(ejectAnchor);

    // ADS mathematical check: front bead (0, -0.004 + 0.042 = 0.038, -0.506) + adsPos (0, -0.038, -0.26) => (0, 0) exact!
    return {
      group: g,
      variantId: 'doublebarrel',
      muzzleAnchor,
      ejectAnchor,
      parts: { breakBarrel },
      hipPos: new THREE.Vector3(0.21, -0.19, -0.38),
      adsPos: new THREE.Vector3(0.0, -0.038, -0.26),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 62
    };
  }

  function buildShotgunModel(variantId, matsOverride) {
    const mats = matsOverride || createWeaponMaterialSet(2);
    if (variantId === 'doublebarrel') return buildShotgunDoubleBarrel(mats);
    return buildShotgunPump12G(mats);
  }

  // =========================================================================
  // SLOT 3: RPG-7 ('rpg7')
  // =========================================================================
  function buildRpgModel(variantId, matsOverride) {
    const mats = matsOverride || createWeaponMaterialSet(3);
    const g = new THREE.Group();

    // Main olive-green launch tube + muzzle collar + rear venturi flare
    addPart(g, new THREE.CylinderGeometry(0.030, 0.030, 0.86, 16), mats.rpgOlive, 0, 0, -0.06, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.038, 0.032, 0.052, 16), mats.gunSteelMid, 0, 0, -0.49, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.026, 0.026, 0.020, 14), mats.boreDark, 0, 0, -0.51, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.030, 0.046, 0.145, 16), mats.gunSteelMid, 0, 0, 0.42, Math.PI / 2, 0, 0);

    // Varnished wooden heatguard wraps + machined steel band clamps + sling swivels
    addPart(g, new THREE.CylinderGeometry(0.0365, 0.0365, 0.28, 14), mats.rpgWood, 0, 0, 0.04, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.0385, 0.0385, 0.016, 14), mats.gunSteelLight, 0, 0, -0.09, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.0385, 0.0385, 0.016, 14), mats.gunSteelLight, 0, 0, 0.17, Math.PI / 2, 0, 0);
    addSlingSwivel(g, mats, -0.034, -0.020, -0.26);
    addSlingSwivel(g, mats, -0.034, -0.020, 0.22);

    // Forward trigger grip + trigger guard + rear support grip
    addPart(g, new THREE.BoxGeometry(0.028, 0.11, 0.038), mats.rpgWood, 0, -0.068, -0.22, 0.18, 0, 0);
    addPart(g, new THREE.BoxGeometry(0.012, 0.005, 0.036), mats.gunSteelDark, 0, -0.052, -0.242);
    addPart(g, new THREE.BoxGeometry(0.026, 0.09, 0.032), mats.polymerGrip, 0, -0.060, -0.04, 0.10, 0, 0);

    // Front folding iron sight blade
    addPart(g, new THREE.BoxGeometry(0.005, 0.034, 0.012), mats.gunSteelLight, 0, 0.048, -0.46);
    addPart(g, new THREE.BoxGeometry(0.003, 0.006, 0.004), mats.amberBead, 0, 0.065, -0.46);

    // Side-mounted PGO-7 hollow optical sight (centered at (-0.055, 0.042, -0.145))
    addPart(g, new THREE.BoxGeometry(0.036, 0.024, 0.048), mats.gunSteelDark, -0.034, 0.025, -0.14);
    addPart(g, new THREE.CylinderGeometry(0.020, 0.021, 0.092, 18, 1, true), mats.rpgScopeTube, -0.055, 0.042, -0.145, Math.PI / 2, 0, 0);
    addPart(g, new THREE.CylinderGeometry(0.021, 0.019, 0.028, 18, 1, true), mats.rpgEyecup, -0.055, 0.042, -0.088, Math.PI / 2, 0, 0);
    addPart(g, new THREE.TorusGeometry(0.021, 0.0028, 8, 20), mats.rpgEyecup, -0.055, 0.042, -0.074);
    addPart(g, new THREE.TorusGeometry(0.020, 0.0025, 8, 20), mats.gunSteelMid, -0.055, 0.042, -0.191);
    addPart(g, new THREE.CircleGeometry(0.019, 20), mats.rpgReticle, -0.055, 0.042, -0.165);

    // Visible PG-7V Warhead protruding from muzzle
    const warhead = new THREE.Group();
    addPart(warhead, new THREE.CylinderGeometry(0.020, 0.020, 0.12, 12), mats.rpgOlive, 0, 0, -0.52, Math.PI / 2, 0, 0);
    addPart(warhead, new THREE.CylinderGeometry(0.046, 0.022, 0.11, 14), mats.rpgWarhead, 0, 0, -0.60, Math.PI / 2, 0, 0);
    addPart(warhead, new THREE.CylinderGeometry(0.048, 0.048, 0.016, 14), mats.brass, 0, 0, -0.655, Math.PI / 2, 0, 0);
    addPart(warhead, new THREE.CylinderGeometry(0.014, 0.046, 0.14, 14), mats.rpgWarhead, 0, 0, -0.72, Math.PI / 2, 0, 0);
    addPart(warhead, new THREE.CylinderGeometry(0.008, 0.014, 0.04, 12), mats.gunSteelLight, 0, 0, -0.80, Math.PI / 2, 0, 0);
    g.add(warhead);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0, -0.62);
    g.add(muzzleAnchor);

    // ADS mathematical check: PGO-7 reticle (-0.055, 0.042, -0.165) + adsPos (0.055, -0.042, -0.23) => (0, 0) exact!
    return {
      group: g,
      variantId: 'rpg7',
      muzzleAnchor,
      parts: { warhead },
      hipPos: new THREE.Vector3(0.24, -0.18, -0.35),
      adsPos: new THREE.Vector3(0.055, -0.042, -0.23),
      hipRot: new THREE.Euler(0.02, -0.03, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 52
    };
  }

  function buildAllViewmodels() {
    const cfgList = getWeaponConfigs();
    W._vmVariantMap = [{}, {}, {}, {}];
    _vmModels.length = 0;

    for (let i = 0; i < cfgList.length; i++) {
      const wId = cfgList[i].id;
      const vMap = getWeaponVariants(wId);
      const vKeys = Object.keys(vMap);
      const defId = getDefaultVariantId(wId);

      for (let k = 0; k < vKeys.length; k++) {
        const vId = vKeys[k];
        let vm;
        if (wId === 'pistol') vm = buildPistolModel(vId);
        else if (wId === 'rifle') vm = buildRifleModel(vId);
        else if (wId === 'shotgun') vm = buildShotgunModel(vId);
        else vm = buildRpgModel(vId);

        vm.group.visible = false;
        W._vmVariantMap[i][vId] = vm;
        if (W._viewmodelRoot) W._viewmodelRoot.add(vm.group);
      }

      const defVm = W._vmVariantMap[i][defId] || W._vmVariantMap[i][vKeys[0]];
      _vmModels.push(defVm);
    }
    return _vmModels;
  }

  // Lightweight world-space 3D pickup mesh for 3D loot crates (lying flat centered on XZ around y = 0.04m)
  function buildWorldWeaponMesh(weaponId, variantId) {
    const resolved = resolveVariantSpec(weaponId, variantId) || {
      slotIdx: 0,
      weaponId: 'pistol',
      variantId: 'g2'
    };
    const wId = resolved.weaponId;
    const vId = resolved.variantId;
    const mats = createWorldMaterials();

    let desc;
    if (wId === 'pistol') desc = buildPistolModel(vId, mats);
    else if (wId === 'rifle') desc = buildRifleModel(vId, mats);
    else if (wId === 'shotgun') desc = buildShotgunModel(vId, mats);
    else desc = buildRpgModel(vId, mats);

    const raw = desc.group;
    // Remove invisible anchors & keep warhead visible
    if (desc.muzzleAnchor && desc.muzzleAnchor.parent) desc.muzzleAnchor.parent.remove(desc.muzzleAnchor);
    if (desc.ejectAnchor && desc.ejectAnchor.parent) desc.ejectAnchor.parent.remove(desc.ejectAnchor);
    if (desc.parts && desc.parts.warhead) desc.parts.warhead.visible = true;

    raw.traverse((obj) => {
      if (obj && obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
        obj.frustumCulled = true;
      }
    });

    // Lay flat on its side across XZ plane (barrel pointing along -Z/+Z, profile spanning X)
    const pivot = new THREE.Group();
    raw.rotation.set(0, 0, Math.PI * 0.5);
    pivot.add(raw);
    pivot.updateMatrixWorld(true);

    _worldBox.setFromObject(pivot);
    _worldBox.getSize(_worldSize);
    const maxHoriz = Math.max(0.05, _worldSize.x, _worldSize.z);

    // Real-world crate-friendly target length (0.35m..0.75m)
    const targetLength = wId === 'pistol' ? 0.36
      : (wId === 'rifle' ? 0.72
      : (wId === 'shotgun' ? 0.74 : 0.75));
    const scale = targetLength / maxHoriz;
    pivot.scale.setScalar(scale);
    pivot.updateMatrixWorld(true);

    _worldBox.setFromObject(pivot);
    _worldBox.getCenter(_worldCenter);

    // Center XZ at (0, 0) and rest bottom cleanly above y = 0 so midpoint sits around y = 0.04m
    pivot.position.x -= _worldCenter.x;
    pivot.position.z -= _worldCenter.z;
    const desiredMinY = 0.012;
    pivot.position.y += (desiredMinY - _worldBox.min.y);

    const container = new THREE.Group();
    container.name = `WorldWeapon_${wId}_${vId}`;
    container.userData = { weaponId: wId, variantId: vId, isWorldWeapon: true };
    container.add(pivot);
    return container;
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

    const outer = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
    outer.addColorStop(0.0, 'rgba(255, 240, 190, 0.22)');
    outer.addColorStop(0.22, 'rgba(255, 200, 100, 0.52)');
    outer.addColorStop(0.55, 'rgba(255, 130, 40, 0.16)');
    outer.addColorStop(1.0, 'rgba(255, 90, 20, 0.0)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, 128, 128);

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
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
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

  function resolveSkinId(skinId) {
    if (!skinId) return 'pindad_standard';
    if (SKIN_PRESETS[skinId]) return skinId;
    const low = String(skinId).toLowerCase().trim();
    if (SKIN_PRESETS[low]) return low;
    if (SKIN_ALIASES[low] && SKIN_PRESETS[SKIN_ALIASES[low]]) return SKIN_ALIASES[low];
    return 'pindad_standard';
  }

  function applySkin(weaponId, skinId) {
    const resolvedId = resolveSkinId(skinId);
    const preset = SKIN_PRESETS[resolvedId] || SKIN_PRESETS.pindad_standard;
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
      const skinBump = (preset.bumpKey && texCache[preset.bumpKey]) || null;

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
          if (spec.useKnurl) mat.map = texCache.knurlTex || whiteTex;
          else if (spec.useWood) mat.map = texCache.woodGrainTex || whiteTex;
          else if (spec.useTex) mat.map = skinTex || whiteTex;
          else mat.map = whiteTex;
        }
        if ('bumpMap' in mat) {
          if (spec.useKnurl) {
            mat.bumpMap = texCache.knurlBump || null;
            mat.bumpScale = 0.0032;
          } else if (spec.useWood) {
            mat.bumpMap = texCache.woodGrainBump || null;
            mat.bumpScale = 0.0022;
          } else if (spec.useTex && skinBump) {
            mat.bumpMap = skinBump;
            mat.bumpScale = preset.bumpScale || 0.0018;
          } else {
            mat.bumpMap = null;
          }
        }
        mat.needsUpdate = true;
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

  function warmupSkins(warmupGroup, anchor) {
    if (!warmupGroup || !anchor) return;
    const texCache = ensureSkinTexCache();
    const swatchGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const keys = Object.keys(SKIN_PRESETS);
    for (let i = 0; i < keys.length; i++) {
      const preset = SKIN_PRESETS[keys[i]];
      const spec = preset.gunSteelMid;
      const mat = new THREE.MeshPhysicalMaterial({
        color: spec.color,
        map: spec.useTex ? (texCache[preset.texKey] || texCache.white) : texCache.white,
        bumpMap: (spec.useTex && preset.bumpKey) ? (texCache[preset.bumpKey] || null) : null,
        bumpScale: preset.bumpScale || 0.0018,
        roughness: spec.roughness,
        metalness: spec.metalness,
        clearcoat: spec.clearcoat || 0.2
      });
      const m = new THREE.Mesh(swatchGeo, mat);
      m.position.copy(anchor);
      m.frustumCulled = false;
      warmupGroup.add(m);
    }
  }

  function syncSlotViewmodelVisibility() {
    if (W._warmupActive) return;
    for (let i = 0; i < W._vmVariantMap.length; i++) {
      const vDict = W._vmVariantMap[i];
      if (!vDict) continue;
      const activeVm = _vmModels[i];
      for (const vId of Object.keys(vDict)) {
        const vm = vDict[vId];
        if (vm && vm.group) {
          vm.group.visible = (i === W._activeIdx && vm === activeVm);
        }
      }
    }
  }

  function unlockOrEquipVariant(weaponId, variantId) {
    if (!W._weaponStates || !W._weaponStates.length) {
      initWeaponStates();
    }
    const resolved = resolveVariantSpec(weaponId, variantId);
    if (!resolved || !resolved.spec) return null;

    const idx = resolved.slotIdx;
    const wId = resolved.weaponId;
    const vId = resolved.variantId;
    const cfgList = getWeaponConfigs();
    const baseCfg = cfgList[idx];
    const wState = W._weaponStates[idx];
    if (!baseCfg || !wState) return null;

    const newlyUnlockedSlot = !wState.unlocked;
    if (!Array.isArray(wState.unlockedVariants)) {
      wState.unlockedVariants = [getDefaultVariantId(wId)];
    }
    const newlyUnlockedVariant = wState.unlockedVariants.indexOf(vId) === -1;
    if (newlyUnlockedVariant) {
      wState.unlockedVariants.push(vId);
    }

    const changedVariant = (wState.variantId !== vId);
    wState.unlocked = true;
    wState.variantId = vId;

    const effCfg = getEffectiveWeaponConfig(idx);
    const effMag = getEffectiveMagSize(idx);

    if (newlyUnlockedSlot || newlyUnlockedVariant) {
      wState.mag = effMag;
      if (!effCfg.infiniteReserve) {
        const diff = getDifficultyCfg();
        const grant = Math.max(effMag, Math.round(effCfg.magSize * 2 * (diff.pickupAmmoMult || 1.0)));
        const maxReserve = Math.max(baseCfg.startReserve * 2, effMag * 6);
        wState.reserve = Math.min(maxReserve, Math.max(wState.reserve, 0) + grant);
      }
    } else if (changedVariant) {
      wState.mag = Math.min(effMag, Math.max(wState.mag, effMag));
    }

    if (changedVariant && idx === W._activeIdx) {
      W._isReloading = false;
      W._reloadTimer = 0;
      W._pumpTimer = -1;
      W._switchTimer = Math.max(W._switchTimer, 0.22);
    }

    // Swap active viewmodel descriptor for this slot
    if (W._vmVariantMap[idx] && W._vmVariantMap[idx][vId]) {
      _vmModels[idx] = W._vmVariantMap[idx][vId];
    }
    syncSlotViewmodelVisibility();
    applySkin(wId, wState.skinId || 'pindad_standard');

    if (idx === 3 && _vmModels[3] && _vmModels[3].parts.warhead) {
      _vmModels[3].parts.warhead.visible = wState.mag > 0;
      _vmModels[3].parts.warhead.position.set(0, 0, 0);
    }

    return {
      ok: true,
      slot: effCfg.slot,
      id: wId,
      weaponId: wId,
      variantId: vId,
      name: effCfg.name,
      shortName: effCfg.shortName,
      rarity: effCfg.rarity || 'common',
      newlyUnlockedSlot,
      newlyUnlockedVariant,
      mag: wState.mag,
      magSize: effMag,
      reserve: effCfg.infiniteReserve ? Infinity : wState.reserve
    };
  }

  function getVariantCatalog() {
    const cfgList = getWeaponConfigs();
    const allVariants = getWeaponVariants();
    const catalog = {};

    for (let i = 0; i < cfgList.length; i++) {
      const base = cfgList[i];
      const wId = base.id;
      const wState = W._weaponStates[i];
      const defId = getDefaultVariantId(wId);
      const activeVar = (wState && wState.variantId) ? wState.variantId : defId;
      const unlockedList = (wState && Array.isArray(wState.unlockedVariants))
        ? wState.unlockedVariants
        : [defId];
      const vMap = allVariants[wId] || {};
      const entries = [];

      for (const vKey of Object.keys(vMap)) {
        const spec = vMap[vKey];
        if (!spec) continue;
        entries.push({
          id: spec.variantId || vKey,
          weaponId: wId,
          slot: base.slot,
          name: spec.name,
          shortName: spec.shortName,
          rarity: spec.rarity || 'common',
          isDefault: !!spec.isDefault,
          unlocked: unlockedList.indexOf(vKey) !== -1 || (W._gameMode === 'exploration'),
          equipped: activeVar === vKey,
          stats: {
            damage: spec.damage,
            headMult: spec.headMult,
            dismemberMult: spec.dismemberMult || 1.0,
            rpm: spec.rpm,
            pellets: spec.pellets,
            magSize: spec.magSize,
            spread: spec.spread,
            adsSpread: spec.adsSpread,
            knockback: spec.knockback
          }
        });
      }

      catalog[wId] = {
        slot: base.slot,
        id: wId,
        slotUnlocked: wState ? !!wState.unlocked : (i === 0),
        activeVariant: activeVar,
        variants: entries
      };
    }

    return catalog;
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
    const wCfg = getEffectiveWeaponConfig(idx);
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
    if (magAdd > 0 && !wCfg.fixedMag) {
      const cap = MAG_BONUS_CAPS[wCfg.id] || 0;
      wState.magBonus = Math.min(cap, Math.max(0, (wState.magBonus || 0) + Math.round(magAdd)));
    }

    return {
      applied: true,
      id: wCfg.id,
      variantId: wState.variantId,
      magBonus: wState.magBonus,
      dmgMult: wState.dmgMult,
      reloadMult: wState.reloadMult,
      effectiveMagSize: getEffectiveMagSize(idx)
    };
  }

  function rollDuplicateUpgrade(idx, rngFn) {
    const wCfg = getEffectiveWeaponConfig(idx);
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
    if (!wCfg.fixedMag && (wState.magBonus || 0) < magCap) {
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
        const wCfg = getEffectiveWeaponConfig(i);
        const wState = W._weaponStates[i];
        if (!wState) continue;
        wState.unlocked = true;
        const vMap = getWeaponVariants(wCfg.id);
        wState.unlockedVariants = Object.keys(vMap);
        const effMag = getEffectiveMagSize(i);
        wState.mag = Math.max(wState.mag, effMag);
        if (!wCfg.infiniteReserve) {
          const targetRes = (typeof bonusReserve === 'number')
            ? Math.max(wState.reserve, Math.round(bonusReserve))
            : Math.max(wState.reserve, wCfg.id === 'rpg' ? 6 : cfgList[i].startReserve);
          wState.reserve = Math.min(Math.max(cfgList[i].startReserve * 2, effMag * 6), targetRes);
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

    // Also allow passing a rare variantId directly to unlockWeapon (cheat convenience)
    const idxDirect = findWeaponIndex(idOrAll);
    if (idxDirect < 0 && typeof idOrAll === 'string') {
      const varMatch = resolveVariantSpec(idOrAll);
      if (varMatch && varMatch.spec) {
        return unlockOrEquipVariant(varMatch.weaponId, varMatch.variantId);
      }
    }

    const idx = idxDirect;
    if (idx < 0) return null;
    const baseCfg = cfgList[idx];
    const wCfg = getEffectiveWeaponConfig(idx);
    const wState = W._weaponStates[idx];
    if (!baseCfg || !wCfg || !wState) return null;

    const effMag = getEffectiveMagSize(idx);
    const maxReserve = Math.max(baseCfg.startReserve * 2, effMag * 6);

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
        variantId: wState.variantId,
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
      variantId: wState.variantId,
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
    const equippedVariants = {};
    const unlockedVariants = {};
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
      equippedVariants[cfg.id] = ws.variantId || getDefaultVariantId(cfg.id);
      unlockedVariants[cfg.id] = Array.isArray(ws.unlockedVariants) ? ws.unlockedVariants.slice() : [equippedVariants[cfg.id]];
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
      equippedVariants,
      unlockedVariants,
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

    W._weaponStates = cfgList.map((w, idx) => {
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

      const defVar = getDefaultVariantId(w.id);
      const vKeys = Object.keys(getWeaponVariants(w.id));
      const mag = unlocked ? w.magSize : 0;
      const reserve = !unlocked
        ? 0
        : (w.infiniteReserve ? 999 : Math.round(w.startReserve * (isExploration ? 1.0 : startAmmoMult)));

      if (W._vmVariantMap[idx] && W._vmVariantMap[idx][defVar]) {
        _vmModels[idx] = W._vmVariantMap[idx][defVar];
      }

      return {
        id: w.id,
        slot: w.slot,
        variantId: defVar,
        unlockedVariants: isExploration ? vKeys : [defVar],
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
    W._revolverCylAngle = 0;
    W._revolverCylTarget = 0;
    W._revolverHammerKick = 0;

    syncSlotViewmodelVisibility();
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

    syncSlotViewmodelVisibility();
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
    const wCfg = getEffectiveWeaponConfig(W._activeIdx);
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

    const wCfg = getEffectiveWeaponConfig(W._activeIdx);
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
    const bobAmp = grounded ? Math.min(1.0, moveSpd / 5.5) * (1.0 - W._adsBlend * 0.80) : 0.05;
    W._walkBobPhase += dt * (4.0 + moveSpd * 1.55);

    const bobX = Math.cos(W._walkBobPhase * 0.5) * 0.011 * bobAmp;
    const bobY = Math.abs(Math.sin(W._walkBobPhase)) * -0.012 * bobAmp;

    // Recoil spring decay
    W._recoilZ += (0 - W._recoilZ) * Math.min(1, dt * 16.0);
    W._recoilPitchVM += (0 - W._recoilPitchVM) * Math.min(1, dt * 14.0);
    W._bloom = Math.max(0, W._bloom - dt * 0.055);
    W._revolverHammerKick = Math.max(0, W._revolverHammerKick - dt * 7.5);
    W._revolverCylAngle += (W._revolverCylTarget - W._revolverCylAngle) * Math.min(1, dt * 18.0);

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
      if (vm.parts.cylinder) {
        vm.parts.cylinder.position.x = -0.024 * wave;
        vm.parts.cylinder.rotation.z = W._revolverCylAngle + wave * Math.PI * 2;
      }
      if (vm.parts.breakBarrel) {
        vm.parts.breakBarrel.rotation.x = -0.54 * wave;
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
        if (vm.parts.cylinder) vm.parts.cylinder.position.x = 0;
        if (vm.parts.breakBarrel) vm.parts.breakBarrel.rotation.x = 0;
        if (vm.parts.warhead) {
          vm.parts.warhead.visible = wState.mag > 0;
          vm.parts.warhead.position.set(0, 0, 0);
        }
      }
    } else {
      if (vm.parts.cylinder) {
        vm.parts.cylinder.position.x = 0;
        vm.parts.cylinder.rotation.z = W._revolverCylAngle;
      }
      if (vm.parts.breakBarrel) {
        vm.parts.breakBarrel.rotation.x = 0;
      }
    }

    // Slide / Bolt / Hammer / Pump articulation
    if (vm.parts.slide) {
      vm.parts.slide.position.z = W._recoilZ * 0.65;
    }
    if (vm.parts.bolt) {
      vm.parts.bolt.position.z = W._recoilZ * 0.85;
    }
    if (vm.parts.hammer) {
      vm.parts.hammer.rotation.x = -0.55 * W._revolverHammerKick;
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
      for (let i = 0; i < W._vmVariantMap.length; i++) {
        const vDict = W._vmVariantMap[i];
        if (!vDict) continue;
        for (const vId of Object.keys(vDict)) {
          const vm = vDict[vId];
          if (vm && vm.group) vm.group.visible = true;
          if (vm && vm.parts && vm.parts.warhead) vm.parts.warhead.visible = true;
        }
      }
      if (W._muzzleFlashGroup) {
        if (!W._muzzleFlashGroup.parent && _vmModels[0] && _vmModels[0].muzzleAnchor) {
          _vmModels[0].muzzleAnchor.add(W._muzzleFlashGroup);
        }
        W._muzzleFlashGroup.visible = true;
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
      syncSlotViewmodelVisibility();
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
  W.getWeaponVariants = getWeaponVariants;
  W.getDefaultVariantId = getDefaultVariantId;
  W.resolveVariantSpec = resolveVariantSpec;
  W.getEffectiveWeaponConfig = getEffectiveWeaponConfig;
  W.getActiveWeaponConfig = getActiveWeaponConfig;
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
  W.buildAllViewmodels = buildAllViewmodels;
  W.buildWorldWeaponMesh = buildWorldWeaponMesh;
  W.createMuzzleFlashTexture = createMuzzleFlashTexture;
  W.buildMuzzleFlash = buildMuzzleFlash;
  W.initWeaponStates = initWeaponStates;
  W.setVisible = setVisible;
  W.cycleWeapon = cycleWeapon;
  W.switchWeapon = switchWeapon;
  W.setADS = setADS;
  W.reload = reload;
  W.applySkin = applySkin;
  W.warmupSkins = warmupSkins;
  W.applyWeaponUpgrade = applyWeaponUpgrade;
  W.unlockWeapon = unlockWeapon;
  W.unlockOrEquipVariant = unlockOrEquipVariant;
  W.getVariantCatalog = getVariantCatalog;
  W.getProgressionState = getProgressionState;
  W.updateViewmodel = updateViewmodel;
  W.consumeCameraKick = consumeCameraKick;
  W.setWarmupMode = setWarmupMode;
})(window.LRT = window.LRT || {});
