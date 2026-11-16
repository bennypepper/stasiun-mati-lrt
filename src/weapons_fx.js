(function (LRT) {
  'use strict';

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

  function getWeaponConfigs() {
    return (LRT.Config && LRT.Config.WEAPONS) ? LRT.Config.WEAPONS : FALLBACK_WEAPONS;
  }

  function getPlayerCfg() {
    return (LRT.Config && LRT.Config.PLAYER_CFG) ? LRT.Config.PLAYER_CFG : { baseFov: 74, adsFov: 56 };
  }

  function play3D(key, pos, pitchVar, gain, spatialOpts) {
    if (!LRT.Audio || typeof LRT.Audio.play !== 'function') return;
    if (pos && _camera) {
      _camera.getWorldPosition(_camPos);
      _camRight.setFromMatrixColumn(_camera.matrixWorld, 0).normalize();
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

  // Fallback scorch canvas texture if LRT.Materials is absent
  function createFallbackScorchTex() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    g.addColorStop(0.0, 'rgba(8,8,8,0.95)');
    g.addColorStop(0.35, 'rgba(20,18,16,0.82)');
    g.addColorStop(0.70, 'rgba(32,26,20,0.42)');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  let _scene = null;
  let _camera = null;
  let _initialized = false;

  // Viewmodel hierarchy & runtime state
  let _viewmodelRoot = null;
  let _muzzleFlashGroup = null;
  let _flashLight = null;
  let _flashLightTimer = 0;
  let _flashLightDuration = 0.07;
  let _flashLightMaxIntensity = 5.0;
  let _muzzleFlashTimer = 0;

  let _weaponStates = [];
  let _activeIdx = 0; // 0..3 -> slots 1..4
  let _isADS = false;
  let _adsBlend = 0;
  let _isFiringHeld = false;
  let _fireCooldown = 0;
  let _isReloading = false;
  let _reloadTimer = 0;
  let _reloadDuration = 1.0;
  let _switchTimer = 0;
  let _pumpTimer = -1;
  let _pumpPlayed = false;

  let _bloom = 0;
  let _recoilZ = 0;
  let _recoilPitchVM = 0;
  let _pendingCamPitch = 0;
  let _pendingCamYaw = 0;
  let _trauma = 0;
  let _traumaTime = 0;
  let _walkBobPhase = 0;
  let _currentTrainSpeed = 0;

  // HUD feedback timers
  let _hitmarkerTimer = 0;
  let _headshotHit = false;
  let _killConfirmTimer = 0;
  let _totalShots = 0;
  let _totalHits = 0;

  // Viewmodel descriptors (built once)
  const _vmModels = [];
  let _warmupActive = false;
  let _savedVmRootVisible = false;

  // Pre-allocated InstancedMesh VFX pools
  const TRACER_CAP = 32;
  const ROCKET_CAP = 4;
  const SMOKE_CAP = 110;
  const FIREBALL_CAP = 14;
  const RING_CAP = 8;
  const SPARK_CAP = 110;
  const BLOOD_CAP = 80;
  const GLASS_CAP = 140;
  const RUBBLE_CAP = 84;
  const SCORCH_CAP = 64;
  const ATTACHED_SCORCH_CAP = 32;

  let _vfxRoot = null;
  let _tracerMesh, _rocketMesh, _smokeMesh, _fireballMesh, _ringMesh;
  let _sparkMesh, _bloodMesh, _glassMesh, _rubbleMesh, _scorchMesh;
  let _scorchMat = null;
  let _scorchGeo = null;

  const _tracers = [];
  const _rockets = [];
  const _smokes = [];
  const _fireballs = [];
  const _rings = [];
  const _sparks = [];
  const _bloods = [];
  const _glasses = [];
  const _rubbles = [];
  const _scorches = [];
  const _attachedScorches = [];

  let _smokeCursor = 0;
  let _fireballCursor = 0;
  let _ringCursor = 0;
  let _sparkCursor = 0;
  let _bloodCursor = 0;
  let _glassCursor = 0;
  let _rubbleCursor = 0;
  let _scorchCursor = 0;
  let _attachedScorchCursor = 0;

  // Shared PBR viewmodel materials
  let _vmMats = null;

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

  function createViewmodelMaterials() {
    if (_vmMats) return _vmMats;
    const reticleTex = createRpgReticleTexture();
    _vmMats = {
      gunSteelDark: new THREE.MeshStandardMaterial({ color: 0x3b424d, roughness: 0.34, metalness: 0.70, envMapIntensity: 1.45 }),
      gunSteelMid: new THREE.MeshPhysicalMaterial({
        color: 0x5c6676, roughness: 0.24, metalness: 0.80,
        clearcoat: 0.32, clearcoatRoughness: 0.20, envMapIntensity: 1.65
      }),
      gunSteelLight: new THREE.MeshPhysicalMaterial({
        color: 0x9aa6b6, roughness: 0.18, metalness: 0.90,
        clearcoat: 0.40, clearcoatRoughness: 0.15, envMapIntensity: 1.85
      }),
      polymerBlack: new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.62, metalness: 0.12, envMapIntensity: 1.15 }),
      polymerGrip: new THREE.MeshStandardMaterial({ color: 0x3f4550, roughness: 0.72, metalness: 0.08, envMapIntensity: 1.10 }),
      rpgOlive: new THREE.MeshPhysicalMaterial({
        color: 0x5a7244, roughness: 0.36, metalness: 0.44,
        clearcoat: 0.32, clearcoatRoughness: 0.26, envMapIntensity: 1.40
      }),
      rpgWarhead: new THREE.MeshStandardMaterial({ color: 0x566c40, roughness: 0.42, metalness: 0.38, envMapIntensity: 1.30 }),
      rpgWood: new THREE.MeshStandardMaterial({ color: 0x9c5c2e, roughness: 0.52, metalness: 0.06, envMapIntensity: 1.25 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xdab256, roughness: 0.24, metalness: 0.86, envMapIntensity: 1.65 }),
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
    return _vmMats;
  }

  function addPart(parent, geo, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  function buildPistolModel() {
    const mats = createViewmodelMaterials();
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

    barrel.visible = true;
    return {
      group: g,
      muzzleAnchor,
      parts: { slide, mag },
      hipPos: new THREE.Vector3(0.18, -0.16, -0.34),
      adsPos: new THREE.Vector3(0.0, -0.044, -0.25),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 62
    };
  }

  function buildRifleModel() {
    const mats = createViewmodelMaterials();
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

    return {
      group: g,
      muzzleAnchor,
      parts: { bolt, mag },
      hipPos: new THREE.Vector3(0.20, -0.18, -0.36),
      adsPos: new THREE.Vector3(0.0, -0.068, -0.23),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 56
    };
  }

  function buildShotgunModel() {
    const mats = createViewmodelMaterials();
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

    return {
      group: g,
      muzzleAnchor,
      parts: { pump },
      hipPos: new THREE.Vector3(0.21, -0.19, -0.38),
      adsPos: new THREE.Vector3(0.0, -0.046, -0.28),
      hipRot: new THREE.Euler(0.02, -0.04, 0),
      adsRot: new THREE.Euler(0, 0, 0),
      adsFov: 63
    };
  }

  function buildRpgModel() {
    const mats = createViewmodelMaterials();
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

  function initPools(scene) {
    _vfxRoot = new THREE.Group();
    _vfxRoot.name = 'LRT_WeaponsVFX';
    scene.add(_vfxRoot);

    function makeInstanced(geo, mat, cap, castShadow) {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.frustumCulled = false;
      m.castShadow = !!castShadow;
      m.receiveShadow = false;
      const white = new THREE.Color(0xffffff);
      for (let i = 0; i < cap; i++) {
        m.setMatrixAt(i, _zeroMat);
        m.setColorAt(i, white);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      _vfxRoot.add(m);
      return m;
    }

    // 1. Tracers (unit Z box scaled along length — slim so ADS sight picture stays clean)
    _tracerMesh = makeInstanced(
      new THREE.BoxGeometry(0.011, 0.011, 1.0),
      new THREE.MeshBasicMaterial({ color: 0xffea9c, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }),
      TRACER_CAP
    );
    for (let i = 0; i < TRACER_CAP; i++) {
      _tracers.push({ active: false, life: 0, maxLife: 0.048, p0: new THREE.Vector3(), p1: new THREE.Vector3(), thickness: 1.0 });
    }

    // 2. Flying RPG rockets
    _rocketMesh = makeInstanced(
      new THREE.CylinderGeometry(0.036, 0.052, 0.52, 10),
      new THREE.MeshStandardMaterial({ color: 0x4b5c3a, roughness: 0.42, metalness: 0.55, emissive: 0xff5511, emissiveIntensity: 0.4 }),
      ROCKET_CAP
    );
    _rocketMesh.geometry.rotateX(Math.PI / 2);
    for (let i = 0; i < ROCKET_CAP; i++) {
      _rockets.push({
        active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        distTraveled: 0, smokeAccum: 0, dmg: 280, radius: 6.5, impulse: 18
      });
    }

    // 3. Smoke puffs
    _smokeMesh = makeInstanced(
      new THREE.IcosahedronGeometry(0.32, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false }),
      SMOKE_CAP
    );
    for (let i = 0; i < SMOKE_CAP; i++) {
      _smokes.push({
        active: false, life: 0, maxLife: 1.0,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        startScale: 0.4, endScale: 2.2, color: new THREE.Color(0x555555)
      });
    }

    // 4. Fireballs
    _fireballMesh = makeInstanced(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }),
      FIREBALL_CAP
    );
    for (let i = 0; i < FIREBALL_CAP; i++) {
      _fireballs.push({
        active: false, life: 0, maxLife: 0.36,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        startScale: 0.4, endScale: 4.5, cStart: new THREE.Color(), cEnd: new THREE.Color()
      });
    }

    // 5. Shockwave rings
    _ringMesh = makeInstanced(
      new THREE.RingGeometry(0.65, 1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb866, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      RING_CAP
    );
    _ringMesh.geometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < RING_CAP; i++) {
      _rings.push({ active: false, life: 0, maxLife: 0.30, pos: new THREE.Vector3(), maxRadius: 7.0, color: new THREE.Color(0xffb866) });
    }

    // 6. Sparks
    _sparkMesh = makeInstanced(
      new THREE.BoxGeometry(0.025, 0.025, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }),
      SPARK_CAP
    );
    for (let i = 0; i < SPARK_CAP; i++) {
      _sparks.push({ active: false, life: 0, maxLife: 0.4, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(0xffbb44) });
    }

    // 7. Blood splatters
    _bloodMesh = makeInstanced(
      new THREE.IcosahedronGeometry(0.065, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      BLOOD_CAP
    );
    for (let i = 0; i < BLOOD_CAP; i++) {
      _bloods.push({ active: false, life: 0, maxLife: 0.5, pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 1.0, color: new THREE.Color(0x7a0c0e) });
    }

    // 8. Glass shards
    _glassMesh = makeInstanced(
      new THREE.BoxGeometry(0.14, 0.18, 0.012),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.08, metalness: 0.25,
        transparent: true, opacity: 0.72, side: THREE.DoubleSide
      }),
      GLASS_CAP
    );
    for (let i = 0; i < GLASS_CAP; i++) {
      _glasses.push({
        active: false, life: 0, maxLife: 1.8,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(), rotVel: new THREE.Vector3(),
        sx: 1, sy: 1, color: new THREE.Color(0xa6d2e2)
      });
    }

    // 9. Concrete rubble chunks
    _rubbleMesh = makeInstanced(
      new THREE.DodecahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.02 }),
      RUBBLE_CAP
    );
    for (let i = 0; i < RUBBLE_CAP; i++) {
      _rubbles.push({
        active: false, life: 0, maxLife: 2.2,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(), rotVel: new THREE.Vector3(),
        scale: 1.0, color: new THREE.Color(0x78756c)
      });
    }

    // 10. World scorch decals + train/parented scorch decal pool
    const matScorch = (LRT.Materials && LRT.Materials.mats && LRT.Materials.mats.scorchDecal)
      ? LRT.Materials.mats.scorchDecal
      : new THREE.MeshBasicMaterial({
          map: createFallbackScorchTex(),
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          side: THREE.DoubleSide
        });
    _scorchMat = matScorch;
    _scorchGeo = new THREE.PlaneGeometry(1, 1);

    _scorchMesh = makeInstanced(_scorchGeo, _scorchMat, SCORCH_CAP);
    for (let i = 0; i < SCORCH_CAP; i++) {
      _scorches.push({ active: false });
    }

    for (let i = 0; i < ATTACHED_SCORCH_CAP; i++) {
      const m = new THREE.Mesh(_scorchGeo, _scorchMat);
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 2;
      _attachedScorches.push(m);
    }
  }

  function resetPools() {
    const clearList = (arr, mesh) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i].active = false;
        if (mesh) mesh.setMatrixAt(i, _zeroMat);
      }
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    };
    clearList(_tracers, _tracerMesh);
    clearList(_rockets, _rocketMesh);
    clearList(_smokes, _smokeMesh);
    clearList(_fireballs, _fireballMesh);
    clearList(_rings, _ringMesh);
    clearList(_sparks, _sparkMesh);
    clearList(_bloods, _bloodMesh);
    clearList(_glasses, _glassMesh);
    clearList(_rubbles, _rubbleMesh);
    clearList(_scorches, _scorchMesh);

    for (let i = 0; i < _attachedScorches.length; i++) {
      const m = _attachedScorches[i];
      m.visible = false;
      if (m.parent) m.parent.remove(m);
    }
    _scorchCursor = 0;
    _attachedScorchCursor = 0;
  }

  function spawnTracer(p0, p1, thickness) {
    if (!_tracerMesh) return;
    let slot = null;
    for (let i = 0; i < TRACER_CAP; i++) {
      if (!_tracers[i].active) { slot = _tracers[i]; break; }
    }
    if (!slot) slot = _tracers[0];
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 0.048;
    slot.p0.copy(p0);
    slot.p1.copy(p1);
    slot.thickness = thickness || 1.0;
  }

  function spawnSmoke(pos, vel, startScale, endScale, maxLife, hexOrColor) {
    if (!_smokeMesh) return;
    const s = _smokes[_smokeCursor];
    _smokeCursor = (_smokeCursor + 1) % SMOKE_CAP;
    s.active = true;
    s.life = 0;
    s.maxLife = maxLife || 0.9;
    s.pos.copy(pos);
    s.vel.copy(vel);
    s.startScale = startScale || 0.35;
    s.endScale = endScale || 2.0;
    if (hexOrColor instanceof THREE.Color) s.color.copy(hexOrColor);
    else s.color.setHex(hexOrColor !== undefined ? hexOrColor : 0x55524d);
  }

  function spawnFireball(pos, vel, startScale, endScale, maxLife, cStartHex, cEndHex) {
    if (!_fireballMesh) return;
    const f = _fireballs[_fireballCursor];
    _fireballCursor = (_fireballCursor + 1) % FIREBALL_CAP;
    f.active = true;
    f.life = 0;
    f.maxLife = maxLife || 0.34;
    f.pos.copy(pos);
    f.vel.copy(vel);
    f.startScale = startScale || 0.4;
    f.endScale = endScale || 4.0;
    f.cStart.setHex(cStartHex !== undefined ? cStartHex : 0xfff0aa);
    f.cEnd.setHex(cEndHex !== undefined ? cEndHex : 0xd9380b);
  }

  function spawnRing(pos, maxRadius, maxLife, colorHex) {
    if (!_ringMesh) return;
    const r = _rings[_ringCursor];
    _ringCursor = (_ringCursor + 1) % RING_CAP;
    r.active = true;
    r.life = 0;
    r.maxLife = maxLife || 0.30;
    r.pos.copy(pos);
    r.pos.y += 0.08;
    r.maxRadius = maxRadius || 6.8;
    r.color.setHex(colorHex !== undefined ? colorHex : 0xffb866);
  }

  function spawnSparks(pos, count, normalOrDir, inheritVel) {
    if (!_sparkMesh || !pos) return;
    const n = count || 12;
    const baseDir = normalOrDir || _upVec;
    for (let i = 0; i < n; i++) {
      const s = _sparks[_sparkCursor];
      _sparkCursor = (_sparkCursor + 1) % SPARK_CAP;
      s.active = true;
      s.life = 0;
      s.maxLife = 0.22 + Math.random() * 0.28;
      s.pos.set(pos.x, pos.y, pos.z);
      const spd = 4.0 + Math.random() * 9.0;
      s.vel.set(
        baseDir.x * 0.6 + (Math.random() - 0.5) * 1.4,
        baseDir.y * 0.6 + Math.random() * 1.1,
        baseDir.z * 0.6 + (Math.random() - 0.5) * 1.4
      ).normalize().multiplyScalar(spd);
      if (inheritVel) {
        s.vel.x += inheritVel.x || 0;
        s.vel.y += inheritVel.y || 0;
        s.vel.z += inheritVel.z || 0;
      } else if (_currentTrainSpeed > 1.0 && (Math.abs(pos.x) > 1.25 || pos.y < 0.0 || pos.y > 2.1)) {
        s.vel.z -= _currentTrainSpeed * 0.8;
      }
      s.color.setHex(Math.random() > 0.3 ? 0xffcc55 : 0xff7722);
    }
  }

  function spawnBlood(pos, dir, count) {
    if (!_bloodMesh || !pos) return;
    const n = count || 10;
    const d = dir || _fwdVec;
    for (let i = 0; i < n; i++) {
      const b = _bloods[_bloodCursor];
      _bloodCursor = (_bloodCursor + 1) % BLOOD_CAP;
      b.active = true;
      b.life = 0;
      b.maxLife = 0.35 + Math.random() * 0.28;
      b.pos.set(pos.x, pos.y, pos.z);
      b.vel.set(
        d.x * 2.5 + (Math.random() - 0.5) * 3.8,
        0.8 + Math.random() * 2.8,
        d.z * 2.5 + (Math.random() - 0.5) * 3.8
      );
      b.scale = 0.6 + Math.random() * 0.9;
      b.color.setHex(Math.random() > 0.35 ? 0x7e0a0e : 0x4d0608);
    }
  }

  function spawnGlassShards(pos, count, inheritVel) {
    if (!_glassMesh || !pos) return;
    const n = count || 18;
    for (let i = 0; i < n; i++) {
      const g = _glasses[_glassCursor];
      _glassCursor = (_glassCursor + 1) % GLASS_CAP;
      g.active = true;
      g.life = 0;
      g.maxLife = 1.3 + Math.random() * 0.8;
      g.pos.set(
        pos.x + (Math.random() - 0.5) * 0.55,
        pos.y + (Math.random() - 0.5) * 0.55,
        pos.z + (Math.random() - 0.5) * 0.55
      );
      g.vel.set(
        (Math.random() - 0.5) * 5.2,
        1.0 + Math.random() * 3.4,
        (Math.random() - 0.5) * 5.2
      );
      if (inheritVel) {
        g.vel.x += inheritVel.x || 0;
        g.vel.y += inheritVel.y || 0;
        g.vel.z += inheritVel.z || 0;
      } else if (_currentTrainSpeed > 1.0 && (Math.abs(pos.x) > 1.25 || pos.y < 0.0 || pos.y > 2.1)) {
        g.vel.z -= _currentTrainSpeed * 0.85;
      }
      g.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      g.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      g.sx = 0.55 + Math.random() * 0.9;
      g.sy = 0.55 + Math.random() * 0.9;
      g.color.setHex(Math.random() > 0.4 ? 0x9ecae0 : 0xd6eef7);
    }
  }

  function spawnRubble(pos, count, impulseDir) {
    if (!_rubbleMesh || !pos) return;
    const n = count || 12;
    const d = impulseDir || _upVec;
    for (let i = 0; i < n; i++) {
      const r = _rubbles[_rubbleCursor];
      _rubbleCursor = (_rubbleCursor + 1) % RUBBLE_CAP;
      r.active = true;
      r.life = 0;
      r.maxLife = 1.6 + Math.random() * 0.9;
      r.pos.set(
        pos.x + (Math.random() - 0.5) * 0.35,
        pos.y + (Math.random() - 0.5) * 0.35,
        pos.z + (Math.random() - 0.5) * 0.35
      );
      r.vel.set(
        d.x * 2.5 + (Math.random() - 0.5) * 7.5,
        2.2 + Math.random() * 6.5,
        d.z * 2.5 + (Math.random() - 0.5) * 7.5
      );
      r.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      r.rotVel.set((Math.random() - 0.5) * 11, (Math.random() - 0.5) * 11, (Math.random() - 0.5) * 11);
      r.scale = 0.45 + Math.random() * 0.95;
      r.color.setHex(Math.random() > 0.35 ? 0x7b7870 : 0x52504a);
    }
  }

  function spawnScorchDecal(pos, normal, parentGroup, size) {
    if (!pos) return;
    const decalSize = size || 2.1;
    const norm = normal ? _v1.copy(normal).normalize() : _v1.set(0, 1, 0);

    if (parentGroup && parentGroup !== _scene && typeof parentGroup.worldToLocal === 'function') {
      parentGroup.updateMatrixWorld(true);
      const m = _attachedScorches[_attachedScorchCursor];
      _attachedScorchCursor = (_attachedScorchCursor + 1) % ATTACHED_SCORCH_CAP;
      if (m.parent !== parentGroup) {
        if (m.parent) m.parent.remove(m);
        parentGroup.add(m);
      }
      _localPos.copy(pos);
      parentGroup.worldToLocal(_localPos);

      _invMat.copy(parentGroup.matrixWorld).invert();
      _normMat.getNormalMatrix(_invMat);
      _localNorm.copy(norm).applyMatrix3(_normMat).normalize();

      _localPos.addScaledVector(_localNorm, 0.025);
      m.position.copy(_localPos);
      _q1.setFromUnitVectors(_fwdVec, _localNorm);
      _q2.setFromAxisAngle(_fwdVec, Math.random() * Math.PI * 2);
      m.quaternion.copy(_q1).multiply(_q2);
      m.scale.set(decalSize, decalSize, 1);
      m.visible = true;
      return;
    }

    if (!_scorchMesh) return;
    const idx = _scorchCursor;
    _scorchCursor = (_scorchCursor + 1) % SCORCH_CAP;
    _scorches[idx].active = true;

    _v2.copy(pos).addScaledVector(norm, 0.025);
    _q1.setFromUnitVectors(_fwdVec, norm);
    _q2.setFromAxisAngle(_fwdVec, Math.random() * Math.PI * 2);
    _q1.multiply(_q2);
    _scaleV.set(decalSize, decalSize, 1);
    _m4.compose(_v2, _q1, _scaleV);
    _scorchMesh.setMatrixAt(idx, _m4);
    _scorchMesh.instanceMatrix.needsUpdate = true;
  }

  function triggerFlashLight(pos, colorHex, intensity, distance, duration) {
    if (!_flashLight || !pos) return;
    _flashLight.position.copy(pos);
    _flashLight.color.setHex(colorHex);
    _flashLight.intensity = intensity;
    _flashLight.distance = distance;
    _flashLight.visible = true;
    _flashLightMaxIntensity = intensity;
    _flashLightDuration = duration;
    _flashLightTimer = duration;
  }

  function applyExplosion(origin, radius, maxDmg, impulse, fromEnemy) {
    if (!origin) return;
    const rad = radius !== undefined ? radius : 6.5;
    const dmg = maxDmg !== undefined ? maxDmg : 280;
    const imp = impulse !== undefined ? impulse : 18;
    const enemyBlast = !!fromEnemy;

    const origVec = _v4.set(origin.x, origin.y, origin.z);

    // 1. Audio + Blast light + Camera trauma
    if (enemyBlast) {
      play3D('debris_crumble', origVec, 0.14, 0.95, { refDist: 10.0, maxDist: 90.0 });
      triggerFlashLight(origVec, 0x66ff33, 9.0, 14, 0.25);
    } else {
      play3D('rpg_explosion', origVec, 0.08, 1.45, { refDist: 26.0, maxDist: 260.0 });
      play3D('debris_crumble', origVec, 0.12, 0.80, { refDist: 18.0, maxDist: 160.0 });
      triggerFlashLight(origVec, 0xff8822, 16.0, 24, 0.34);
    }

    if (_camera) {
      _camera.getWorldPosition(_camPos);
      const distToCam = _camPos.distanceTo(origVec);
      const shakeAmt = enemyBlast
        ? Math.max(0.0, 0.45 * (1 - distToCam / 10))
        : Math.max(0.18, 0.95 * (1 - distToCam / 18));
      _trauma = Math.min(1.0, _trauma + shakeAmt);
    }

    // 2. Radial enemy damage + knockback
    if (LRT.Enemies && typeof LRT.Enemies.applyBlast === 'function') {
      LRT.Enemies.applyBlast(origVec, rad, dmg, imp);
    }

    // 3. Station destruction (pillars, glass, dynamic props, lights)
    if (!enemyBlast && LRT.Station && typeof LRT.Station.damageAt === 'function') {
      LRT.Station.damageAt(origVec, rad, dmg, imp, true);
    }

    // 4. Train destruction (windows, livery dent/char, seats, straps, LCDs)
    if (!enemyBlast && LRT.Train && typeof LRT.Train.applyDamage === 'function') {
      LRT.Train.applyDamage(origVec, rad, dmg, imp);
    }

    // 5. Player self-damage / spitter splash damage
    if (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') {
      const pState = LRT.PlayerUI.getState();
      if (pState && pState.pos) {
        const dx = pState.pos.x - origVec.x;
        const dy = (pState.pos.y + 0.9) - origVec.y;
        const dz = pState.pos.z - origVec.z;
        const pDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (pDist < rad) {
          const falloff = Math.max(0, 1 - pDist / rad);
          const isExploration = (pState.mode === 'exploration') ||
            (LRT.Config && LRT.Config.MODES && pState.mode === LRT.Config.MODES.EXPLORATION);
          let pDmg = 0;
          if (enemyBlast) {
            pDmg = Math.round(dmg * falloff);
          } else if (!isExploration) {
            // Survival mode RPG self-damage capped at 35
            pDmg = Math.round(35 * falloff);
          }
          if (pDmg > 0 && typeof LRT.PlayerUI.takeDamage === 'function') {
            LRT.PlayerUI.takeDamage(pDmg, origVec);
          }
          if (typeof LRT.PlayerUI.applyImpulse === 'function' && pDist > 0.05) {
            const push = imp * 0.45 * falloff;
            LRT.PlayerUI.applyImpulse((dx / pDist) * push, 3.8 * falloff, (dz / pDist) * push);
          }
        }
      }
    }

    // 6. Multi-layered pooled VFX
    if (enemyBlast) {
      spawnRing(origVec, rad * 0.9, 0.25, 0x77ff22);
      for (let i = 0; i < 4; i++) {
        _v1.set((Math.random() - 0.5) * 2.5, 0.8 + Math.random() * 2.0, (Math.random() - 0.5) * 2.5);
        spawnFireball(origVec, _v1, 0.35, 1.9, 0.30, 0xbbff44, 0x2a7a14);
      }
      for (let i = 0; i < 12; i++) {
        _v1.set((Math.random() - 0.5) * 4.5, 0.8 + Math.random() * 3.0, (Math.random() - 0.5) * 4.5);
        spawnSmoke(origVec, _v1, 0.35, 1.8, 0.75, Math.random() > 0.4 ? 0x62b82a : 0x3b6324);
      }
      spawnSparks(origVec, 14, _upVec);
    } else {
      // Shockwave ring
      spawnRing(origVec, rad * 1.1, 0.32, 0xffc166);
      // Multi-layered fireball spheres
      for (let i = 0; i < 5; i++) {
        _v1.set((Math.random() - 0.5) * 3.5, 1.2 + Math.random() * 3.2, (Math.random() - 0.5) * 3.5);
        const scEnd = (i === 0) ? rad * 0.75 : (2.0 + Math.random() * 2.4);
        spawnFireball(origVec, _v1, 0.45, scEnd, 0.28 + Math.random() * 0.14, 0xfff3b8, 0xc82a0a);
      }
      // Billowing smoke plume
      for (let i = 0; i < 18; i++) {
        _v1.set((Math.random() - 0.5) * 5.2, 1.8 + Math.random() * 5.0, (Math.random() - 0.5) * 5.2);
        const shade = Math.random() > 0.45 ? 0x383633 : 0x56524c;
        spawnSmoke(origVec, _v1, 0.45, 2.4 + Math.random() * 1.4, 0.95 + Math.random() * 0.6, shade);
      }
      // Sparks & concrete rubble chunks
      spawnSparks(origVec, 28, _upVec);
      spawnRubble(origVec, 18, _upVec);
      // Stamp floor/surface scorch decal if near platform, sidewalk, or street and not inside train
      const trainBox = (LRT.Train && typeof LRT.Train.isPlayerInside === 'function' && LRT.Train.isPlayerInside(origVec));
      if (!trainBox) {
        if (origVec.y >= -1.25 && origVec.y <= -0.90) {
          _v2.set(origVec.x, -0.99, origVec.z);
          spawnScorchDecal(_v2, _upVec, null, 2.8);
        } else if (origVec.y > -0.90 && origVec.y <= -0.60) {
          _v2.set(origVec.x, -0.81, origVec.z);
          spawnScorchDecal(_v2, _upVec, null, 2.6);
        } else if (origVec.y >= -0.25 && origVec.y <= 0.45) {
          _v2.set(origVec.x, 0.01, origVec.z);
          spawnScorchDecal(_v2, _upVec, null, 2.8);
        } else {
          spawnScorchDecal(origVec, _upVec, null, 2.2);
        }
      }
    }
  }

  function findNearestHit(origin, dir, maxDist) {
    let best = null;
    let bestDist = maxDist;

    if (LRT.Enemies && typeof LRT.Enemies.raycastHit === 'function') {
      const h = LRT.Enemies.raycastHit(origin, dir, bestDist);
      if (h) {
        const d = h.dist !== undefined ? h.dist : h.distance;
        if (typeof d === 'number' && d < bestDist) {
          bestDist = d;
          best = { kind: 'enemy', dist: d, hit: h };
        }
      }
    }

    if (LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
      const h = LRT.Train.raycastTrain(origin, dir, bestDist);
      if (h) {
        const d = h.dist !== undefined ? h.dist : h.distance;
        if (typeof d === 'number' && d < bestDist) {
          bestDist = d;
          best = { kind: 'train', dist: d, hit: h };
        }
      }
    }

    if (LRT.City && typeof LRT.City.raycastHydrants === 'function') {
      const h = LRT.City.raycastHydrants(origin, dir, bestDist);
      if (h) {
        const d = h.dist !== undefined ? h.dist : h.distance;
        if (typeof d === 'number' && d < bestDist) {
          bestDist = d;
          best = { kind: 'hydrant', dist: d, hit: h };
        }
      }
    }

    if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
      const h = LRT.Station.raycastWorld(origin, dir, bestDist);
      if (h) {
        const d = h.dist !== undefined ? h.dist : h.distance;
        if (typeof d === 'number' && d < bestDist) {
          bestDist = d;
          best = { kind: 'station', dist: d, hit: h };
        }
      }
    }

    return best;
  }

  function launchRocket(weapon, aimOrigin, aimDir, muzzleWorld) {
    let slot = null;
    for (let i = 0; i < ROCKET_CAP; i++) {
      if (!_rockets[i].active) { slot = _rockets[i]; break; }
    }
    if (!slot) slot = _rockets[0];

    // Converge toward crosshair target
    const aimHit = findNearestHit(aimOrigin, aimDir, 160);
    const targetDist = aimHit ? Math.max(4.0, aimHit.dist) : 90.0;
    _v1.copy(aimOrigin).addScaledVector(aimDir, targetDist);

    // Start safely ahead of camera near barrel line
    slot.pos.copy(aimOrigin).addScaledVector(aimDir, 0.75);
    if (muzzleWorld) {
      slot.pos.lerp(muzzleWorld, 0.35);
    }
    _v2.subVectors(_v1, slot.pos).normalize();

    const speed = weapon.rocketSpeed || 48.0;
    slot.vel.copy(_v2).multiplyScalar(speed);
    slot.active = true;
    slot.distTraveled = 0;
    slot.smokeAccum = 0;
    slot.dmg = weapon.damage || 280;
    slot.radius = weapon.blastRadius || 6.5;
    slot.impulse = weapon.knockback || 18.0;

    // Hide visible warhead in RPG tube
    const rpgVm = _vmModels[3];
    if (rpgVm && rpgVm.parts.warhead) {
      rpgVm.parts.warhead.visible = false;
    }

    // Backblast smoke behind player viewmodel
    if (muzzleWorld) {
      _v3.copy(aimDir).multiplyScalar(-2.0);
      spawnSmoke(muzzleWorld, _v3, 0.25, 1.1, 0.45, 0x9c988e);
    }
  }

  function executeShot() {
    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[_activeIdx];
    const wState = _weaponStates[_activeIdx];
    if (!wCfg || !wState) return;

    if (wState.mag <= 0) {
      play3D('dry_fire', null, 0.03, 0.9);
      _fireCooldown = 0.22;
      if (wState.reserve > 0 || wCfg.infiniteReserve) {
        reload();
      }
      return;
    }

    wState.mag -= 1;
    _fireCooldown = 60.0 / (wCfg.rpm || 300);

    // Shotgun pump timing
    if (wCfg.id === 'shotgun') {
      _pumpTimer = 0.001;
      _pumpPlayed = false;
    }

    // Audio
    play3D(wCfg.sfxFire || 'pistol_fire', null, 0.04, 1.0);

    // Recoil + Bloom + Camera kick
    const adsFactor = _isADS ? 0.58 : 1.0;
    _recoilZ = Math.min(0.14, _recoilZ + (wCfg.id === 'shotgun' ? 0.095 : wCfg.id === 'rpg' ? 0.12 : 0.045));
    _recoilPitchVM = Math.min(0.26, _recoilPitchVM + (wCfg.id === 'shotgun' ? 0.14 : wCfg.id === 'rpg' ? 0.16 : 0.065));
    _pendingCamPitch += (wCfg.recoilPitch || 0.02) * adsFactor;
    _pendingCamYaw += (Math.random() - 0.5) * 2 * (wCfg.recoilYaw || 0.008) * adsFactor;
    _bloom = Math.min(0.038, _bloom + (wCfg.id === 'rifle' ? 0.0045 : 0.003));
    _trauma = Math.min(1.0, _trauma + (wCfg.id === 'rpg' ? 0.42 : wCfg.id === 'shotgun' ? 0.28 : 0.06));

    // Muzzle flash & light (significantly toned down during ADS so target stays completely clear)
    const vm = _vmModels[_activeIdx];
    if (vm && vm.muzzleAnchor) {
      vm.muzzleAnchor.getWorldPosition(_muzzlePos);
      if (_muzzleFlashGroup && wCfg.id !== 'rpg') {
        if (_muzzleFlashGroup.parent !== vm.muzzleAnchor) {
          vm.muzzleAnchor.add(_muzzleFlashGroup);
        }
        _muzzleFlashGroup.position.set(0, 0, _isADS ? -0.095 : -0.02);
        _muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
        const baseSc = wCfg.id === 'shotgun' ? 1.25 : wCfg.id === 'rifle' ? 0.92 : 0.72;
        const adsFlashMult = _isADS ? (wCfg.id === 'rifle' ? 0.30 : 0.38) : 1.0;
        _muzzleFlashGroup.scale.setScalar(baseSc * adsFlashMult * (0.85 + Math.random() * 0.25));
        _muzzleFlashGroup.visible = true;
        _muzzleFlashTimer = _isADS ? 0.024 : 0.042;
      }
      if (_flashLightTimer <= 0.08) {
        const lInt = _isADS ? (wCfg.id === 'shotgun' ? 1.8 : 1.15) : (wCfg.id === 'shotgun' ? 5.6 : 3.6);
        const lRange = _isADS ? 5.5 : 10.5;
        triggerFlashLight(_muzzlePos, 0xffb355, lInt, lRange, _isADS ? 0.045 : 0.070);
      }
    }

    if (!_camera) return;
    _camera.updateMatrixWorld(true);
    _camera.getWorldPosition(_rayOrigin);
    _camera.getWorldDirection(_rayDir);
    _camRight.setFromMatrixColumn(_camera.matrixWorld, 0).normalize();
    _camUp.setFromMatrixColumn(_camera.matrixWorld, 1).normalize();

    if (wCfg.projectile) {
      launchRocket(wCfg, _rayOrigin, _rayDir, _muzzlePos);
      _totalShots++;
      return;
    }

    // Hitscan pellets
    const pellets = wCfg.pellets || 1;
    const baseSpread = (_isADS ? (wCfg.adsSpread || 0.003) : (wCfg.spread || 0.01)) + _bloom * adsFactor;
    let landedAny = false;
    let anyHeadshot = false;
    let anyKill = false;

    for (let p = 0; p < pellets; p++) {
      _totalShots++;
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * baseSpread;
      _shotDir.copy(_rayDir)
        .addScaledVector(_camRight, Math.cos(angle) * rad)
        .addScaledVector(_camUp, Math.sin(angle) * rad)
        .normalize();

      const maxDist = wCfg.range || 120;
      const res = findNearestHit(_rayOrigin, _shotDir, maxDist);

      const tracerFwdOff = _isADS ? 1.15 : 0.28;
      const tracerThick = _isADS ? 0.42 : (wCfg.id === 'shotgun' ? 0.72 : 0.85);
      _v2.copy(_muzzlePos).addScaledVector(_shotDir, tracerFwdOff);

      if (!res) {
        _v1.copy(_rayOrigin).addScaledVector(_shotDir, Math.min(maxDist, 65));
        spawnTracer(_v2, _v1, tracerThick);
        continue;
      }

      const h = res.hit;
      const pt = h.point;
      const norm = h.normal || _upVec;

      if (h.dist > (_isADS ? 2.2 : 0.9)) {
        spawnTracer(_v2, pt, tracerThick);
      }

      if (res.kind === 'enemy') {
        landedAny = true;
        if (h.isHeadshot) anyHeadshot = true;
        _totalHits++;
        const dmg = Math.round((wCfg.damage || 25) * (h.isHeadshot ? (wCfg.headMult || 2.0) : 1.0));
        let hitInfo = null;
        if (LRT.Enemies && typeof LRT.Enemies.hitZombie === 'function') {
          hitInfo = LRT.Enemies.hitZombie(h.zombieId, dmg, pt, _shotDir, wCfg.knockback || 2.0, !!h.isHeadshot);
        }
        if (hitInfo && hitInfo.killed) anyKill = true;
        if (h.isArmor || (hitInfo && hitInfo.armored)) {
          spawnSparks(pt, 6, norm);
          if (p === 0) play3D('impact_metal', pt, 0.1, 0.8);
        } else {
          spawnBlood(pt, _shotDir, h.isHeadshot ? 14 : 7);
          if (p === 0) play3D('zombie_hit', pt, 0.1, 0.85);
        }
      } else if (res.kind === 'train') {
        const tag = h.material || h.type || h.tag || h.materialTag || (h.isGlass ? 'glass' : 'metal');
        const prevBroken = (LRT.Train && typeof LRT.Train.getStats === 'function') ? (LRT.Train.getStats().brokenWindows || 0) : 0;
        let trainDmgRes = null;
        if (LRT.Train && typeof LRT.Train.applyDamage === 'function') {
          trainDmgRes = LRT.Train.applyDamage(pt, 0.45, wCfg.damage || 25, wCfg.knockback || 2.0, _shotDir);
        }
        const afterBroken = (LRT.Train && typeof LRT.Train.getStats === 'function') ? (LRT.Train.getStats().brokenWindows || 0) : prevBroken;
        const paneJustShattered = afterBroken > prevBroken || !!(trainDmgRes && trainDmgRes.shardsSpawned);
        if (tag === 'glass' || h.isGlass) {
          if (!paneJustShattered) {
            spawnGlassShards(pt, 2);
          }
          if (p === 0 && !paneJustShattered && !(trainDmgRes && trainDmgRes.sfxPlayed)) {
            play3D('glass_shatter', pt, 0.1, 0.35);
          }
        } else {
          spawnSparks(pt, pellets > 1 ? 3 : (tag === 'lcd' ? 10 : 8), norm);
          if (p === 0) play3D('impact_metal', pt, 0.12, 0.65);
        }
      } else if (res.kind === 'hydrant') {
        const hydId = h.hydrantId ?? (h.hydrant ? h.hydrant.id : null);
        if (LRT.City && typeof LRT.City.triggerHydrant === 'function' && hydId) {
          LRT.City.triggerHydrant(hydId);
        }
        spawnSparks(pt, pellets > 1 ? 3 : 8, norm);
        if (p === 0) play3D('impact_metal', pt, 0.12, 0.6);
      } else if (res.kind === 'station') {
        const tag = h.tag || h.material || h.type || h.materialTag || (h.isGlass ? 'glass' : 'concrete');
        const bId = h.barrelId !== undefined ? h.barrelId : (h.collider && h.collider.barrelId !== undefined ? h.collider.barrelId : -1);
        if ((tag === 'barrel' || (h.collider && h.collider.tag === 'barrel')) && bId >= 0) {
          if (LRT.Station && typeof LRT.Station.triggerBarrel === 'function') {
            LRT.Station.triggerBarrel(bId);
          }
        }
        const prevGlass = (LRT.Station && typeof LRT.Station.getStats === 'function') ? (LRT.Station.getStats().brokenGlassCount || 0) : 0;
        let stDmgRes = null;
        if (LRT.Station && typeof LRT.Station.damageAt === 'function') {
          stDmgRes = LRT.Station.damageAt(pt, 0.45, wCfg.damage || 25, wCfg.knockback || 2.0, false, _shotDir);
        }
        const afterGlass = (LRT.Station && typeof LRT.Station.getStats === 'function') ? (LRT.Station.getStats().brokenGlassCount || 0) : prevGlass;
        const paneJustShattered = afterGlass > prevGlass || !!(stDmgRes && stDmgRes.shardsSpawned);
        if (tag === 'barrel' || (h.collider && h.collider.tag === 'barrel')) {
          spawnSparks(pt, pellets > 1 ? 3 : 8, norm);
          if (p === 0) play3D('impact_metal', pt, 0.12, 0.6);
        } else if (tag === 'glass' || h.isGlass) {
          if (!paneJustShattered) {
            spawnGlassShards(pt, 2);
          }
          if (p === 0 && !paneJustShattered && !(stDmgRes && stDmgRes.sfxPlayed)) {
            play3D('glass_shatter', pt, 0.1, 0.35);
          }
        } else if (tag === 'metal' || tag === 'steel' || tag === 'prop' || tag === 'tube' || tag === 'pillar_damaged') {
          spawnSparks(pt, pellets > 1 ? 3 : 8, norm);
          if (p === 0) play3D('impact_metal', pt, 0.12, 0.6);
        } else {
          spawnRubble(pt, pellets > 1 ? 2 : 5, norm);
          _v2.copy(norm).multiplyScalar(1.2);
          spawnSmoke(pt, _v2, 0.12, 0.55, 0.42, 0x9b978d);
          if (p === 0) play3D('impact_concrete', pt, 0.12, 0.65);
          if (p === 0) {
            spawnScorchDecal(pt, norm, null, wCfg.id === 'shotgun' ? 0.36 : 0.22);
          }
        }
      }
    }

    if (landedAny) {
      _hitmarkerTimer = 0.18;
      _headshotHit = anyHeadshot;
      if (anyKill) _killConfirmTimer = 0.35;
    }

    // Auto-reload on empty if desired? Only when pressing fire on empty, or let player tap R / auto-reload on empty rpg
    if (wCfg.id === 'rpg' && wState.mag === 0 && wState.reserve > 0) {
      // slight delay feel: let player see empty tube, reload immediately on next frame if needed or wait for R/fire
    }
  }

  function initWeaponStates() {
    const cfgList = getWeaponConfigs();
    _weaponStates = cfgList.map((w) => ({
      id: w.id,
      slot: w.slot,
      mag: w.magSize,
      reserve: w.infiniteReserve ? 999 : w.startReserve
    }));
    _activeIdx = 0;
    _isADS = false;
    _adsBlend = 0;
    _isFiringHeld = false;
    _fireCooldown = 0;
    _isReloading = false;
    _reloadTimer = 0;
    _switchTimer = 0;
    _pumpTimer = -1;
    _bloom = 0;
    _recoilZ = 0;
    _recoilPitchVM = 0;
    _pendingCamPitch = 0;
    _pendingCamYaw = 0;
    _trauma = 0;
    _hitmarkerTimer = 0;
    _killConfirmTimer = 0;

    for (let i = 0; i < _vmModels.length; i++) {
      _vmModels[i].group.visible = (i === _activeIdx);
    }
    const rpgVm = _vmModels[3];
    if (rpgVm && rpgVm.parts.warhead) {
      rpgVm.parts.warhead.visible = true;
      rpgVm.parts.warhead.position.set(0, 0, 0);
    }
  }

  function init(scene, camera) {
    _scene = scene;
    _camera = camera;
    if (!_initialized) {
      _viewmodelRoot = new THREE.Group();
      _viewmodelRoot.name = 'LRT_WeaponViewmodels';

      _vmModels.length = 0;
      _vmModels.push(buildPistolModel());
      _vmModels.push(buildRifleModel());
      _vmModels.push(buildShotgunModel());
      _vmModels.push(buildRpgModel());

      for (let i = 0; i < _vmModels.length; i++) {
        _viewmodelRoot.add(_vmModels[i].group);
      }

      _muzzleFlashGroup = buildMuzzleFlash();
      _flashLight = new THREE.PointLight(0xffaa44, 0, 14, 2);
      _flashLight.castShadow = false;
      _flashLight.visible = true;
      scene.add(_flashLight);

      if (camera) camera.add(_viewmodelRoot);
      _viewmodelRoot.visible = false;
      initPools(scene);
      _initialized = true;
    } else {
      if (camera && _viewmodelRoot.parent !== camera) camera.add(_viewmodelRoot);
      if (_flashLight && _flashLight.parent !== scene) scene.add(_flashLight);
      if (_vfxRoot && _vfxRoot.parent !== scene) scene.add(_vfxRoot);
      _viewmodelRoot.visible = false;
    }

    initWeaponStates();
    return Weapons;
  }

  function setVisible(bool) {
    if (_viewmodelRoot) _viewmodelRoot.visible = !!bool;
  }

  function reset() {
    resetPools();
    initWeaponStates();
    _isFiringHeld = false;
    if (_camera) {
      const pcfg = getPlayerCfg();
      _camera.fov = pcfg.baseFov || 74;
      _camera.updateProjectionMatrix();
    }
    if (_flashLight) {
      _flashLight.intensity = 0;
      _flashLight.visible = true;
      _flashLightTimer = 0;
    }
  }

  function switchWeapon(slot) {
    if (!_initialized) return;
    let idx = -1;
    if (typeof slot === 'number') {
      idx = Math.max(0, Math.min(3, Math.floor(slot) - 1));
    } else if (typeof slot === 'string') {
      const cfgList = getWeaponConfigs();
      idx = cfgList.findIndex((w) => w.id === slot);
    }
    if (idx < 0 || idx >= _vmModels.length || idx === _activeIdx) return;

    _isReloading = false;
    _reloadTimer = 0;
    _pumpTimer = -1;
    _isADS = false;
    _activeIdx = idx;
    _switchTimer = 0.26;
    _fireCooldown = 0.18;

    for (let i = 0; i < _vmModels.length; i++) {
      _vmModels[i].group.visible = (i === _activeIdx);
    }
    // Sync RPG warhead visibility on switch back
    if (_activeIdx === 3 && _vmModels[3] && _vmModels[3].parts.warhead) {
      _vmModels[3].parts.warhead.visible = _weaponStates[3].mag > 0;
      _vmModels[3].parts.warhead.position.set(0, 0, 0);
    }
    play3D('weapon_switch', null, 0.05, 0.85);
  }

  function setADS(bool) {
    _isADS = !!bool;
  }

  function fireDown() {
    _isFiringHeld = true;
    if (_isReloading || _switchTimer > 0.08) return;
    if (_fireCooldown <= 0) {
      executeShot();
    }
  }

  function fireUp() {
    _isFiringHeld = false;
  }

  function reload() {
    if (_isReloading) return;
    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[_activeIdx];
    const wState = _weaponStates[_activeIdx];
    if (!wCfg || !wState) return;
    if (wState.mag >= wCfg.magSize) return;
    if (!wCfg.infiniteReserve && wState.reserve <= 0) return;

    _isReloading = true;
    _reloadDuration = wCfg.reloadTime || 1.4;
    _reloadTimer = _reloadDuration;
    _isADS = false;
    _pumpTimer = -1;
    play3D('weapon_reload', null, 0.04, 0.9);
  }

  function addAmmo(type, amt) {
    const amount = Math.max(0, Math.round(amt || 0));
    if (amount <= 0) return;
    const cfgList = getWeaponConfigs();

    if (type === 'all') {
      const scale = amount / 20;
      for (let i = 0; i < _weaponStates.length; i++) {
        if (!cfgList[i].infiniteReserve) {
          const maxCap = cfgList[i].startReserve * 2;
          if (amount >= 500) {
            _weaponStates[i].mag = cfgList[i].magSize;
            _weaponStates[i].reserve = maxCap;
          } else {
            if (cfgList[i].id === 'rpg') continue;
            const gain = Math.max(1, Math.ceil(cfgList[i].magSize * 1.2 * scale));
            _weaponStates[i].reserve = Math.min(maxCap, _weaponStates[i].reserve + gain);
          }
        }
      }
      return;
    }

    for (let i = 0; i < _weaponStates.length; i++) {
      if (cfgList[i].id === type || cfgList[i].slot === type) {
        if (!cfgList[i].infiniteReserve) {
          _weaponStates[i].reserve = Math.min(cfgList[i].startReserve * 2, _weaponStates[i].reserve + amount);
        }
        return;
      }
    }
  }

  function updateViewmodel(dt, playerState) {
    const vm = _vmModels[_activeIdx];
    if (!vm) return;

    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[_activeIdx];
    const wState = _weaponStates[_activeIdx];

    // ADS transition & camera FOV zoom
    const targetAds = (_isADS && !_isReloading && _switchTimer <= 0.05) ? 1.0 : 0.0;
    _adsBlend += (targetAds - _adsBlend) * Math.min(1, dt * 14.0);

    if (_camera) {
      const pcfg = getPlayerCfg();
      const baseFov = pcfg.baseFov || 74;
      const targetFov = baseFov + ((vm.adsFov || 56) - baseFov) * _adsBlend;
      if (Math.abs(_camera.fov - targetFov) > 0.03) {
        _camera.fov = targetFov;
        _camera.updateProjectionMatrix();
      }
    }

    // Walk bob
    const moveSpd = (playerState && typeof playerState.speed === 'number') ? playerState.speed : 0;
    const grounded = playerState ? (playerState.grounded !== false) : true;
    const bobAmp = grounded ? Math.min(1.0, moveSpd / 5.5) * (1.0 - _adsBlend * 0.78) : 0.05;
    _walkBobPhase += dt * (4.0 + moveSpd * 1.55);

    const bobX = Math.cos(_walkBobPhase * 0.5) * 0.011 * bobAmp;
    const bobY = Math.abs(Math.sin(_walkBobPhase)) * -0.012 * bobAmp;

    // Recoil spring decay
    _recoilZ += (0 - _recoilZ) * Math.min(1, dt * 16.0);
    _recoilPitchVM += (0 - _recoilPitchVM) * Math.min(1, dt * 14.0);
    _bloom = Math.max(0, _bloom - dt * 0.055);

    // Switch dip
    let switchDip = 0;
    if (_switchTimer > 0) {
      _switchTimer = Math.max(0, _switchTimer - dt);
      switchDip = (_switchTimer / 0.26) * 0.20;
    }

    // Reload animation
    let reloadTiltZ = 0;
    let reloadTiltX = 0;
    let reloadDipY = 0;
    if (_isReloading) {
      _reloadTimer -= dt;
      const prog = 1.0 - Math.max(0, _reloadTimer / _reloadDuration);
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

      if (_reloadTimer <= 0) {
        _isReloading = false;
        _reloadTimer = 0;
        const needed = wCfg.magSize - wState.mag;
        if (wCfg.infiniteReserve) {
          wState.mag = wCfg.magSize;
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
      vm.parts.slide.position.z = _recoilZ * 0.65;
    }
    if (vm.parts.bolt) {
      vm.parts.bolt.position.z = _recoilZ * 0.85;
    }
    if (vm.parts.pump && _pumpTimer > 0) {
      _pumpTimer += dt;
      if (_pumpTimer >= 0.16 && !_pumpPlayed) {
        _pumpPlayed = true;
        play3D('shotgun_pump', null, 0.04, 0.9);
      }
      if (_pumpTimer >= 0.16 && _pumpTimer <= 0.48) {
        const pt = (_pumpTimer - 0.16) / 0.32;
        vm.parts.pump.position.z = Math.sin(pt * Math.PI) * 0.085;
      } else if (_pumpTimer > 0.48) {
        vm.parts.pump.position.z = 0;
        _pumpTimer = -1;
      }
    }

    // Compose viewmodel transform
    _v1.lerpVectors(vm.hipPos, vm.adsPos, _adsBlend);
    vm.group.position.set(
      _v1.x + bobX,
      _v1.y + bobY - switchDip + reloadDipY,
      _v1.z + _recoilZ
    );
    vm.group.rotation.set(
      vm.hipRot.x * (1 - _adsBlend) + vm.adsRot.x * _adsBlend + _recoilPitchVM + reloadTiltX,
      vm.hipRot.y * (1 - _adsBlend) + vm.adsRot.y * _adsBlend,
      reloadTiltZ
    );
  }

  function updateRockets(dt) {
    let dirty = false;
    for (let i = 0; i < ROCKET_CAP; i++) {
      const r = _rockets[i];
      if (!r.active) continue;
      dirty = true;

      const stepDist = r.vel.length() * dt;
      _v1.copy(r.vel).normalize();

      // Raycast ahead along flight path so rocket never tunnels
      const hit = findNearestHit(r.pos, _v1, stepDist + 0.38);
      if (hit) {
        r.active = false;
        _rocketMesh.setMatrixAt(i, _zeroMat);
        applyExplosion(hit.hit.point, r.radius, r.dmg, r.impulse, false);
        continue;
      }

      r.pos.addScaledVector(r.vel, dt);
      r.vel.y -= 1.2 * dt; // subtle realistic arc at long range
      r.distTraveled += stepDist;

      // Ground/range safety detonation
      if (r.pos.y <= -1.6 || r.distTraveled > 210) {
        r.active = false;
        _rocketMesh.setMatrixAt(i, _zeroMat);
        applyExplosion(r.pos, r.radius, r.dmg, r.impulse, false);
        continue;
      }

      // Billowing smoke trail + thruster sparks
      r.smokeAccum += dt;
      if (r.smokeAccum >= 0.018) {
        r.smokeAccum = 0;
        _v2.set((Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4);
        _v2.addScaledVector(_v1, -2.5);
        spawnSmoke(r.pos, _v2, 0.24, 1.35, 0.65, Math.random() > 0.3 ? 0xbab6ad : 0x7a7670);
        if (Math.random() > 0.45) {
          _v3.copy(_v1).multiplyScalar(-1);
          spawnSparks(r.pos, 1, _v3);
        }
      }

      _q1.setFromUnitVectors(_fwdVec, _v1);
      _scaleV.set(1, 1, 1);
      _m4.compose(r.pos, _q1, _scaleV);
      _rocketMesh.setMatrixAt(i, _m4);
    }
    if (dirty && _rocketMesh) _rocketMesh.instanceMatrix.needsUpdate = true;
  }

  function updateVfxPools(dt) {
    // 1. Tracers
    if (_tracerMesh) {
      let dirty = false;
      for (let i = 0; i < TRACER_CAP; i++) {
        const t = _tracers[i];
        if (!t.active) continue;
        dirty = true;
        t.life += dt;
        if (t.life >= t.maxLife) {
          t.active = false;
          _tracerMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        const frac = 1.0 - t.life / t.maxLife;
        _v1.subVectors(t.p1, t.p0);
        const len = Math.max(0.05, _v1.length());
        _v1.multiplyScalar(1 / len);
        _v2.addVectors(t.p0, t.p1).multiplyScalar(0.5);
        _q1.setFromUnitVectors(_fwdVec, _v1);
        _scaleV.set(t.thickness * frac, t.thickness * frac, len);
        _m4.compose(_v2, _q1, _scaleV);
        _tracerMesh.setMatrixAt(i, _m4);
      }
      if (dirty) _tracerMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Smoke
    if (_smokeMesh) {
      let dirty = false;
      for (let i = 0; i < SMOKE_CAP; i++) {
        const s = _smokes[i];
        if (!s.active) continue;
        dirty = true;
        s.life += dt;
        if (s.life >= s.maxLife) {
          s.active = false;
          _smokeMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        const t = s.life / s.maxLife;
        s.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
        s.vel.y += 1.4 * dt;
        s.pos.addScaledVector(s.vel, dt);
        const sc = (s.startScale + (s.endScale - s.startScale) * t) * (1 - t * 0.35);
        _q1.identity();
        _scaleV.set(sc, sc, sc);
        _m4.compose(s.pos, _q1, _scaleV);
        _smokeMesh.setMatrixAt(i, _m4);
        _smokeMesh.setColorAt(i, s.color);
      }
      if (dirty) {
        _smokeMesh.instanceMatrix.needsUpdate = true;
        if (_smokeMesh.instanceColor) _smokeMesh.instanceColor.needsUpdate = true;
      }
    }

    // 3. Fireballs
    if (_fireballMesh) {
      let dirty = false;
      for (let i = 0; i < FIREBALL_CAP; i++) {
        const f = _fireballs[i];
        if (!f.active) continue;
        dirty = true;
        f.life += dt;
        if (f.life >= f.maxLife) {
          f.active = false;
          _fireballMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        const t = f.life / f.maxLife;
        f.pos.addScaledVector(f.vel, dt);
        f.vel.multiplyScalar(Math.max(0, 1 - dt * 4.0));
        const sc = (f.startScale + (f.endScale - f.startScale) * Math.pow(t, 0.55)) * (1 - t * 0.65);
        _q1.identity();
        _scaleV.set(sc, sc, sc);
        _m4.compose(f.pos, _q1, _scaleV);
        _fireballMesh.setMatrixAt(i, _m4);
        _color1.lerpColors(f.cStart, f.cEnd, t);
        _fireballMesh.setColorAt(i, _color1);
      }
      if (dirty) {
        _fireballMesh.instanceMatrix.needsUpdate = true;
        if (_fireballMesh.instanceColor) _fireballMesh.instanceColor.needsUpdate = true;
      }
    }

    // 4. Shockwave rings
    if (_ringMesh) {
      let dirty = false;
      for (let i = 0; i < RING_CAP; i++) {
        const r = _rings[i];
        if (!r.active) continue;
        dirty = true;
        r.life += dt;
        if (r.life >= r.maxLife) {
          r.active = false;
          _ringMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        const t = r.life / r.maxLife;
        const sc = 0.4 + r.maxRadius * Math.pow(t, 0.55);
        _q1.identity();
        _scaleV.set(sc, 1, sc);
        _m4.compose(r.pos, _q1, _scaleV);
        _ringMesh.setMatrixAt(i, _m4);
        _color1.copy(r.color).multiplyScalar(1 - t);
        _ringMesh.setColorAt(i, _color1);
      }
      if (dirty) {
        _ringMesh.instanceMatrix.needsUpdate = true;
        if (_ringMesh.instanceColor) _ringMesh.instanceColor.needsUpdate = true;
      }
    }

    // 5. Sparks
    if (_sparkMesh) {
      let dirty = false;
      for (let i = 0; i < SPARK_CAP; i++) {
        const s = _sparks[i];
        if (!s.active) continue;
        dirty = true;
        s.life += dt;
        if (s.life >= s.maxLife) {
          s.active = false;
          _sparkMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        s.vel.y -= 14.0 * dt;
        s.pos.addScaledVector(s.vel, dt);
        if ((s.pos.y < 0.02 && s.pos.y > -0.35 && Math.abs(s.pos.x) < 12) || (s.pos.y < -0.98 && s.pos.y > -1.30)) {
          s.pos.y = s.pos.y > -0.5 ? 0.02 : -0.98;
          s.vel.y = Math.abs(s.vel.y) * 0.45;
          s.vel.x *= 0.7;
          s.vel.z *= 0.7;
        }
        const spd = s.vel.length();
        if (spd > 0.05) _v1.copy(s.vel).multiplyScalar(1 / spd);
        else _v1.copy(_upVec);
        _q1.setFromUnitVectors(_fwdVec, _v1);
        const fade = 1.0 - s.life / s.maxLife;
        _scaleV.set(fade, fade, Math.max(0.5, spd * 0.08) * fade);
        _m4.compose(s.pos, _q1, _scaleV);
        _sparkMesh.setMatrixAt(i, _m4);
        _sparkMesh.setColorAt(i, s.color);
      }
      if (dirty) {
        _sparkMesh.instanceMatrix.needsUpdate = true;
        if (_sparkMesh.instanceColor) _sparkMesh.instanceColor.needsUpdate = true;
      }
    }

    // 6. Blood
    if (_bloodMesh) {
      let dirty = false;
      for (let i = 0; i < BLOOD_CAP; i++) {
        const b = _bloods[i];
        if (!b.active) continue;
        dirty = true;
        b.life += dt;
        if (b.life >= b.maxLife) {
          b.active = false;
          _bloodMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        b.vel.y -= 16.0 * dt;
        b.pos.addScaledVector(b.vel, dt);
        const sc = b.scale * (1.0 - b.life / b.maxLife);
        _q1.identity();
        _scaleV.set(sc, sc, sc);
        _m4.compose(b.pos, _q1, _scaleV);
        _bloodMesh.setMatrixAt(i, _m4);
        _bloodMesh.setColorAt(i, b.color);
      }
      if (dirty) {
        _bloodMesh.instanceMatrix.needsUpdate = true;
        if (_bloodMesh.instanceColor) _bloodMesh.instanceColor.needsUpdate = true;
      }
    }

    // 7. Glass shards
    if (_glassMesh) {
      let dirty = false;
      for (let i = 0; i < GLASS_CAP; i++) {
        const g = _glasses[i];
        if (!g.active) continue;
        dirty = true;
        g.life += dt;
        if (g.life >= g.maxLife) {
          g.active = false;
          _glassMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        g.vel.y -= 17.5 * dt;
        g.pos.addScaledVector(g.vel, dt);
        if ((g.pos.y < 0.04 && g.pos.y > -0.35 && Math.abs(g.pos.x) < 12) || (g.pos.y < -0.96 && g.pos.y > -1.30)) {
          g.pos.y = g.pos.y > -0.5 ? 0.04 : -0.96;
          g.vel.y = Math.abs(g.vel.y) * 0.32;
          g.vel.x *= 0.68;
          g.vel.z *= 0.68;
          g.rotVel.multiplyScalar(0.6);
        }
        g.rot.x += g.rotVel.x * dt;
        g.rot.y += g.rotVel.y * dt;
        g.rot.z += g.rotVel.z * dt;
        const fade = g.life > g.maxLife * 0.7 ? (1 - (g.life - g.maxLife * 0.7) / (g.maxLife * 0.3)) : 1.0;
        _q1.setFromEuler(g.rot);
        _scaleV.set(g.sx * fade, g.sy * fade, fade);
        _m4.compose(g.pos, _q1, _scaleV);
        _glassMesh.setMatrixAt(i, _m4);
        _glassMesh.setColorAt(i, g.color);
      }
      if (dirty) {
        _glassMesh.instanceMatrix.needsUpdate = true;
        if (_glassMesh.instanceColor) _glassMesh.instanceColor.needsUpdate = true;
      }
    }

    // 8. Rubble chunks
    if (_rubbleMesh) {
      let dirty = false;
      for (let i = 0; i < RUBBLE_CAP; i++) {
        const r = _rubbles[i];
        if (!r.active) continue;
        dirty = true;
        r.life += dt;
        if (r.life >= r.maxLife) {
          r.active = false;
          _rubbleMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        r.vel.y -= 19.0 * dt;
        r.pos.addScaledVector(r.vel, dt);
        if ((r.pos.y < 0.07 && r.pos.y > -0.32 && Math.abs(r.pos.x) < 12) || (r.pos.y < -0.93 && r.pos.y > -1.30)) {
          r.pos.y = r.pos.y > -0.5 ? 0.07 : -0.93;
          r.vel.y = Math.abs(r.vel.y) * 0.28;
          r.vel.x *= 0.65;
          r.vel.z *= 0.65;
          r.rotVel.multiplyScalar(0.5);
        }
        r.rot.x += r.rotVel.x * dt;
        r.rot.y += r.rotVel.y * dt;
        r.rot.z += r.rotVel.z * dt;
        const fade = r.life > r.maxLife * 0.7 ? (1 - (r.life - r.maxLife * 0.7) / (r.maxLife * 0.3)) : 1.0;
        _q1.setFromEuler(r.rot);
        _scaleV.setScalar(r.scale * fade);
        _m4.compose(r.pos, _q1, _scaleV);
        _rubbleMesh.setMatrixAt(i, _m4);
        _rubbleMesh.setColorAt(i, r.color);
      }
      if (dirty) {
        _rubbleMesh.instanceMatrix.needsUpdate = true;
        if (_rubbleMesh.instanceColor) _rubbleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  function update(dt, playerState, trainSpeed) {
    if (!_initialized) return;
    const step = Math.min(dt || 0.016, 0.05);
    _currentTrainSpeed = (typeof trainSpeed === 'number')
      ? trainSpeed
      : ((LRT.Train && typeof LRT.Train.getSpeed === 'function') ? LRT.Train.getSpeed() : 0);

    // Cooldowns & HUD feedback
    if (_fireCooldown > 0) _fireCooldown = Math.max(0, _fireCooldown - step);
    if (_hitmarkerTimer > 0) _hitmarkerTimer = Math.max(0, _hitmarkerTimer - step);
    if (_killConfirmTimer > 0) _killConfirmTimer = Math.max(0, _killConfirmTimer - step);

    // Full-auto sustain
    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[_activeIdx];
    if (_isFiringHeld && wCfg && wCfg.fireMode === 'auto' && !_isReloading && _switchTimer <= 0.05 && _fireCooldown <= 0) {
      executeShot();
    }

    // Muzzle flash fade
    if (_muzzleFlashTimer > 0) {
      _muzzleFlashTimer -= step;
      if (_muzzleFlashTimer <= 0 && _muzzleFlashGroup) {
        _muzzleFlashGroup.visible = false;
      }
    }

    // Pooled PointLight decay (NEVER toggle .visible — keep visible=true, intensity=0 when off!)
    if (_flashLight && _flashLightTimer > 0) {
      _flashLightTimer -= step;
      if (_flashLightTimer <= 0) {
        _flashLight.intensity = 0;
        _flashLight.visible = true;
      } else {
        const frac = _flashLightTimer / Math.max(0.01, _flashLightDuration);
        _flashLight.intensity = _flashLightMaxIntensity * frac * frac;
      }
    }

    // Trauma decay & subtle viewmodel shake
    _traumaTime += step;
    if (_trauma > 0) {
      _trauma = Math.max(0, _trauma - step * 1.45);
    }

    if (_viewmodelRoot && !_viewmodelRoot.visible) _viewmodelRoot.visible = true;
    updateViewmodel(step, playerState);
    updateRockets(step);
    updateVfxPools(step);
  }

  function consumeCameraKick() {
    const p = _pendingCamPitch;
    const y = _pendingCamYaw;
    _pendingCamPitch = 0;
    _pendingCamYaw = 0;
    const t2 = _trauma * _trauma;
    const shakePitch = Math.sin(_traumaTime * 47.0) * t2 * 0.024;
    const shakeYaw = Math.cos(_traumaTime * 53.0) * t2 * 0.020;
    const shakeRoll = Math.sin(_traumaTime * 61.0) * t2 * 0.032;
    return {
      recoilPitch: p,
      recoilYaw: y,
      shakePitch,
      shakeYaw,
      shakeRoll,
      trauma: _trauma
    };
  }

  function getHudState() {
    const cfgList = getWeaponConfigs();
    const wCfg = cfgList[_activeIdx] || FALLBACK_WEAPONS[0];
    const wState = _weaponStates[_activeIdx] || { mag: 0, reserve: 0 };
    return {
      slot: wCfg.slot,
      id: wCfg.id,
      name: wCfg.name,
      shortName: wCfg.shortName,
      ammoInMag: wState.mag,
      mag: wState.mag,
      magSize: wCfg.magSize,
      reserve: wCfg.infiniteReserve ? Infinity : wState.reserve,
      infReserve: !!wCfg.infiniteReserve,
      infiniteReserve: !!wCfg.infiniteReserve,
      isReloading: _isReloading,
      reloadProgress: _isReloading ? Math.max(0, Math.min(1, 1 - _reloadTimer / _reloadDuration)) : 0,
      isADS: _isADS,
      adsBlend: _adsBlend,
      spread: (_isADS ? (wCfg.adsSpread || 0.003) : (wCfg.spread || 0.01)) + _bloom,
      hitmarkerTimer: _hitmarkerTimer,
      headshotHit: _headshotHit,
      killConfirmTimer: _killConfirmTimer,
      trauma: _trauma,
      totalShots: _totalShots,
      totalHits: _totalHits,
      weapons: _weaponStates.map((ws, i) => ({
        slot: cfgList[i].slot,
        id: cfgList[i].id,
        shortName: cfgList[i].shortName,
        mag: ws.mag,
        magSize: cfgList[i].magSize,
        reserve: cfgList[i].infiniteReserve ? Infinity : ws.reserve,
        infReserve: !!cfgList[i].infiniteReserve
      }))
    };
  }

  function setWarmupMode(active) {
    if (!_initialized) return;
    const on = !!active;
    if (on) {
      if (!_warmupActive) {
        _savedVmRootVisible = _viewmodelRoot ? _viewmodelRoot.visible : false;
      }
      _warmupActive = true;
      if (_viewmodelRoot) _viewmodelRoot.visible = true;
      for (let i = 0; i < _vmModels.length; i++) {
        _vmModels[i].group.visible = true;
      }
      if (_muzzleFlashGroup) {
        if (!_muzzleFlashGroup.parent && _vmModels[0] && _vmModels[0].muzzleAnchor) {
          _vmModels[0].muzzleAnchor.add(_muzzleFlashGroup);
        }
        _muzzleFlashGroup.visible = true;
      }
      if (_vmModels[3] && _vmModels[3].parts.warhead) {
        _vmModels[3].parts.warhead.visible = true;
      }
      if (_vfxRoot) _vfxRoot.visible = true;
      if (_attachedScorches[0]) {
        if (!_attachedScorches[0].parent && _vfxRoot) _vfxRoot.add(_attachedScorches[0]);
        _attachedScorches[0].visible = true;
      }
      if (_flashLight) _flashLight.visible = true;
    } else {
      _warmupActive = false;
      if (_viewmodelRoot) _viewmodelRoot.visible = _savedVmRootVisible;
      for (let i = 0; i < _vmModels.length; i++) {
        _vmModels[i].group.visible = (i === _activeIdx);
      }
      if (_muzzleFlashGroup) {
        _muzzleFlashGroup.visible = (_muzzleFlashTimer > 0);
      }
      if (_vmModels[3] && _vmModels[3].parts.warhead) {
        _vmModels[3].parts.warhead.visible = _weaponStates[3] ? (_weaponStates[3].mag > 0) : true;
      }
      if (_attachedScorches[0] && _attachedScorches[0].parent === _vfxRoot) {
        _attachedScorches[0].visible = false;
        _vfxRoot.remove(_attachedScorches[0]);
      }
    }
  }

  const Weapons = {
    init,
    reset,
    setVisible,
    setWarmupMode,
    switchWeapon,
    setADS,
    fireDown,
    fireUp,
    reload,
    addAmmo,
    update,
    applyExplosion,
    spawnGlassShards,
    spawnSparks,
    spawnBlood,
    spawnRubble,
    spawnScorchDecal,
    consumeCameraKick,
    getHudState
  };

  LRT.Weapons = Weapons;
})(window.LRT = window.LRT || {});
