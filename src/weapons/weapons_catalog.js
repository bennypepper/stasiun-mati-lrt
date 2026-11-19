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

  const WeaponsCatalog = {
    FALLBACK_WEAPONS,
    FALLBACK_VARIANTS,
    FALLBACK_DIFFICULTY_TIERS,
    MAG_BONUS_CAPS,
    DMG_MULT_CAP,
    RELOAD_MULT_FLOOR,
    SKIN_ALIASES,
    SKIN_PRESETS,
    SKINNABLE_MAT_KEYS
  };

  W.FALLBACK_WEAPONS = FALLBACK_WEAPONS;
  W.FALLBACK_VARIANTS = FALLBACK_VARIANTS;
  W.FALLBACK_DIFFICULTY_TIERS = FALLBACK_DIFFICULTY_TIERS;
  W.MAG_BONUS_CAPS = MAG_BONUS_CAPS;
  W.DMG_MULT_CAP = DMG_MULT_CAP;
  W.RELOAD_MULT_FLOOR = RELOAD_MULT_FLOOR;
  W.SKIN_ALIASES = SKIN_ALIASES;
  W.SKIN_PRESETS = SKIN_PRESETS;
  W.SKINNABLE_MAT_KEYS = SKINNABLE_MAT_KEYS;

  I.weaponsCatalog = WeaponsCatalog;
  LRT.WeaponsCatalog = WeaponsCatalog;
})(window.LRT = window.LRT || {});
