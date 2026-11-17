(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const E = (I.enemies = I.enemies || {});

  const MAX_ENEMIES = 32;
  const MAX_BILE = 16;
  const MAX_BILE_CHUNKS = 32;
  const MAX_BILE_DROPS = 96;
  const MAX_PUDDLES = 24;
  const MAX_PUDDLE_BUBBLES = 48;
  const BILE_GRAVITY = 11.5;
  const BILE_HORIZ_SPEED = 11.0;
  const BILE_MAX_RANGE = 14.5;

  const FALLBACK_TYPES = {
    walker: { id: 'walker', label: 'Commuter Infected', hp: 70, speed: 1.95, damage: 10, attackRange: 1.75, attackCooldown: 1.25, scale: 1.0, armorMult: 1.0 },
    runner: { id: 'runner', label: 'Feral Sprinter', hp: 62, speed: 5.20, damage: 11, attackRange: 1.65, attackCooldown: 0.85, scale: 0.94, armorMult: 1.0 },
    brute: { id: 'brute', label: 'LRT Riot Brute', hp: 230, speed: 1.85, damage: 22, attackRange: 1.95, attackCooldown: 1.45, scale: 1.18, armorMult: 0.50 },
    spitter: { id: 'spitter', label: 'Toxic Hazmat', hp: 105, speed: 2.05, damage: 14, attackRange: 14.5, attackCooldown: 2.40, scale: 1.04, armorMult: 1.0, deathBlastRadius: 3.6, deathBlastDmg: 30 },
    screamer: { id: 'screamer', label: 'Cyst Screamer', hp: 75, speed: 3.45, damage: 12, attackRange: 1.65, attackCooldown: 1.0, scale: 0.96, armorMult: 1.0, screamRadius: 24.0, screamCooldown: 7.5 }
  };

  // Gritty, weather-stained Jakarta commuter garments (never neon plastic)
  const COMMUTER_SHIRT_COLORS = [
    0x9b8c74, // bloodied office beige
    0xb4b1a6, // dirty grey-white dress shirt
    0x45586d, // washed KAI / office navy
    0x7c5c42, // muddy batik ochre
    0x565a5e, // charcoal commuter jacket
    0x6d745a  // worn field shirt
  ];

  const SKIN_PALLOR_COLORS = [
    0x9c9a90, // cadaver ash
    0x8e9192, // cold livid slate
    0xa4968c, // drained pale clay
    0x8d9384  // sickly corpse olive-grey
  ];

  // Pre-allocated scratch math (ZERO per-frame heap allocations)
  const _v1 = new THREE.Vector3();
  const _vKnee = new THREE.Vector3();
  const _vJointLocal = new THREE.Vector3();
  const _q1 = new THREE.Quaternion();
  const _qTorso = new THREE.Quaternion();
  const _e1 = new THREE.Euler();
  const _m4 = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _scale = new THREE.Vector3();
  const _color = new THREE.Color();
  const _bileHitVec = new THREE.Vector3();
  const _bileNormal = new THREE.Vector3(0, 1, 0);
  const _bileDir = new THREE.Vector3();
  const _bileOrigin = new THREE.Vector3();
  const _fwdZ = new THREE.Vector3(0, 0, 1);
  const _upY = new THREE.Vector3(0, 1, 0);
  const _downY = new THREE.Vector3(0, -1, 0);
  const _zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  const BILE_COLORS = [0x7a901c, 0x8ea326, 0x657816, 0x9ab02e, 0x5c6d14];
  const DROP_COLORS = [0x7e941e, 0x99ad2c, 0x5d6d16, 0x4b4318, 0x869a22];
  const PUDDLE_COLORS = [0xdde6a8, 0xcbd88a, 0xe4ec9e, 0xc3d07e];

  // Articulated anatomical horror InstancedMeshes (zero shared-blob gear overlap)
  let _headMesh = null;
  let _torsoMesh = null;
  let _upperArmLMesh = null;
  let _upperArmRMesh = null;
  let _forearmLMesh = null;
  let _forearmRMesh = null;
  let _thighLMesh = null;
  let _thighRMesh = null;
  let _calfLMesh = null;
  let _calfRMesh = null;
  let _bruteArmorMesh = null;
  let _bruteHelmetMesh = null;
  let _spitterBioMesh = null;
  let _ragMesh = null;
  let _headEyeAttr = null;
  let _bileMesh = null;
  let _bileChunkMesh = null;
  let _bileDropMesh = null;
  let _puddleMesh = null;
  let _puddleBubbleMesh = null;
  let _corePartMeshes = [];
  let _overlayPartMeshes = [];
  let _allPartMeshes = [];

  E.MAX_ENEMIES = MAX_ENEMIES;
  E.MAX_BILE = MAX_BILE;
  E.MAX_PUDDLES = MAX_PUDDLES;
  E.FALLBACK_TYPES = FALLBACK_TYPES;
  E.camPos = new THREE.Vector3();
  E.camRight = new THREE.Vector3();
  E.camForward = new THREE.Vector3(0, 0, -1);
  E.scene = null;
  E.enemyRoot = null;
  E.initialized = false;
  E.zombies = [];
  E.pendingQueue = [];
  E.bileOrbs = [];
  E.bileDrops = [];
  E.bilePuddles = [];
  E.bileBubbles = [];
  let _bileDropCursor = 0;
  let _puddleCursor = 0;
  let _bubbleCursor = 0;
  E.activeHighWater = 0;
  E.warmupActive = false;

  function getEnemyCfg(typeId) {
    if (LRT.Config && LRT.Config.ENEMY_TYPES && LRT.Config.ENEMY_TYPES[typeId]) {
      return LRT.Config.ENEMY_TYPES[typeId];
    }
    return FALLBACK_TYPES[typeId] || FALLBACK_TYPES.walker;
  }

  function play3D(key, pos, pitchVar, gain, extra) {
    if (!LRT.Audio || typeof LRT.Audio.play !== 'function') return;
    if (pos) {
      LRT.Audio.play(key, {
        pos,
        listenerPos: E.camPos,
        listenerRight: E.camRight,
        pitchVar: pitchVar !== undefined ? pitchVar : 0.12,
        gain: gain !== undefined ? gain : 0.9,
        rate: extra && typeof extra.rate === 'number' ? extra.rate : 1.0,
        refDist: extra && extra.refDist ? extra.refDist : 5.5,
        maxDist: extra && extra.maxDist ? extra.maxDist : 88.0
      });
    }
  }

  function mergePartGeometries(parts) {
    let totalVerts = 0;
    const prepped = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      if (p.rx || p.ry || p.rz) {
        const rm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0));
        g.applyMatrix4(rm);
      }
      if (p.tx || p.ty || p.tz) {
        g.translate(p.tx || 0, p.ty || 0, p.tz || 0);
      }
      g.computeVertexNormals();
      if (p.uvRect && g.attributes.uv) {
        const uva = g.attributes.uv.array;
        const u0 = p.uvRect[0], v0 = p.uvRect[1], du = p.uvRect[2] - p.uvRect[0], dv = p.uvRect[3] - p.uvRect[1];
        for (let k = 0; k < uva.length; k += 2) {
          uva[k] = u0 + uva[k] * du;
          uva[k + 1] = v0 + uva[k + 1] * dv;
        }
      }
      totalVerts += g.attributes.position.count;
      prepped.push(g);
    }

    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);
    const uvArr = new Float32Array(totalVerts * 2);
    let offset = 0;
    let uvOffset = 0;
    for (let i = 0; i < prepped.length; i++) {
      const g = prepped[i];
      const pa = g.attributes.position.array;
      const na = g.attributes.normal.array;
      posArr.set(pa, offset);
      normArr.set(na, offset);
      offset += pa.length;
      if (g.attributes.uv) {
        const ua = g.attributes.uv.array;
        uvArr.set(ua, uvOffset);
        uvOffset += ua.length;
      }
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    merged.computeBoundingSphere();
    return merged;
  }

  // 512x512 4-quadrant horror atlas:
  // Top-Left  [u:0..0.5, v:0.5..1]: Torn bloodstained commuter cloth + chest gash + exposed gore seam
  // Bot-Left  [u:0..0.5, v:0..0.5]: Mud/blood-splattered trousers & work boots
  // Top-Right [u:0.5..1, v:0.5..1]: Desiccated cadaver skin, capillary marbling, open wounds
  // Bot-Right [u:0.5..1, v:0..0.5]: Sunken eye socket pinhole (center) & dark toothy gore (sides)
  function createZombieTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    let s = 4207;
    const rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

    // 1. Top-Left (canvas y 0..256, x 0..256) -> UV top-left (shirt/garment weave + dried crimson splatters)
    ctx.fillStyle = '#dddad2';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const n = Math.round(205 + (rng() - 0.5) * 30);
      ctx.fillStyle = `rgb(${n},${n - 2},${n - 6})`;
      ctx.fillRect(0, y, 256, 1);
    }
    // Cloth folds & grime shading
    ctx.strokeStyle = 'rgba(42,36,30,0.28)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      const y0 = rng() * 250;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.quadraticCurveTo(128, y0 + (rng() - 0.5) * 28, 256, y0 + (rng() - 0.5) * 34);
      ctx.stroke();
    }
    // Placket / button seam
    ctx.fillStyle = 'rgba(48,44,40,0.30)';
    ctx.fillRect(124, 0, 8, 256);
    // Arterial blood splatters & grime down torso
    for (let i = 0; i < 95; i++) {
      const gx = rng() * 250, gy = rng() * 250, rx = 4 + rng() * 26, ry = 5 + rng() * 34;
      ctx.fillStyle = rng() > 0.35 ? 'rgba(92,16,14,0.44)' : 'rgba(54,48,38,0.34)';
      ctx.beginPath();
      ctx.ellipse(gx, gy, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dark chest wound slash
    ctx.fillStyle = 'rgba(56,10,10,0.85)';
    ctx.beginPath();
    ctx.ellipse(128, 128, 34, 48, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Bottom-Left (canvas y 256..512, x 0..256) -> UV bottom-left (trousers & muddy boots)
    ctx.fillStyle = '#cfccc4';
    ctx.fillRect(0, 256, 256, 256);
    for (let x = 0; x < 256; x += 2) {
      const n = Math.round(192 + (rng() - 0.5) * 26);
      ctx.fillStyle = `rgb(${n},${n - 3},${n - 7})`;
      ctx.fillRect(x, 256, 1, 256);
    }
    const mudGrad = ctx.createLinearGradient(0, 380, 0, 512);
    mudGrad.addColorStop(0, 'rgba(35,28,22,0)');
    mudGrad.addColorStop(1, 'rgba(30,24,18,0.68)');
    ctx.fillStyle = mudGrad;
    ctx.fillRect(0, 380, 256, 132);
    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = rng() > 0.45 ? 'rgba(78,14,12,0.42)' : 'rgba(42,38,32,0.34)';
      ctx.beginPath();
      ctx.arc(rng() * 250, 260 + rng() * 246, 4 + rng() * 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Top-Right (canvas y 0..256, x 256..512) -> UV top-right (necrotic skin + veins + claw blood)
    ctx.fillStyle = '#dad8ce';
    ctx.fillRect(256, 0, 256, 256);
    for (let i = 0; i < 160; i++) {
      const sx = 256 + rng() * 256, sy = rng() * 256, r = 4 + rng() * 20;
      ctx.fillStyle = rng() > 0.40 ? 'rgba(98,104,94,0.20)' : 'rgba(92,42,40,0.22)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(58,46,56,0.34)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 28; i++) {
      let vx = 264 + rng() * 240, vy = 8 + rng() * 240;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      for (let k = 0; k < 5; k++) {
        vx += (rng() - 0.5) * 34;
        vy += (rng() - 0.5) * 34;
        ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }

    // 4. Bottom-Right (canvas y 256..512, x 256..512) -> UV bottom-right:
    // Left sub-strip [u: 0.50..0.75]: Dark orbital hollow + tiny pinpoint feral iris
    ctx.fillStyle = '#181110';
    ctx.fillRect(256, 256, 128, 256);
    const eyeGrad = ctx.createRadialGradient(320, 384, 3, 320, 384, 42);
    eyeGrad.addColorStop(0.0, '#ffffff');
    eyeGrad.addColorStop(0.28, '#ffd478');
    eyeGrad.addColorStop(0.62, '#9a3410');
    eyeGrad.addColorStop(1.0, 'rgba(24,17,16,0)');
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.arc(320, 384, 42, 0, Math.PI * 2);
    ctx.fill();

    // Right sub-strip [u: 0.75..1.00]: Clotted crimson gore, exposed sternum & teeth/bone
    ctx.fillStyle = '#5e1414';
    ctx.fillRect(384, 256, 128, 256);
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = '#cfc5ab';
      ctx.fillRect(390 + (i % 6) * 20, 270 + Math.floor(i / 6) * 82, 12, 26);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  function buildZombieMeshes() {
    const shirtUv = [0.02, 0.52, 0.48, 0.98];
    const pantsUv = [0.02, 0.02, 0.48, 0.48];
    const skinUv = [0.52, 0.52, 0.98, 0.98];
    const eyeUv = [0.54, 0.08, 0.71, 0.42];
    const boneGoreUv = [0.77, 0.04, 0.98, 0.46];

    const scaleGeo = (geo, sx, sy, sz) => {
      geo.scale(sx, sy, sz);
      return geo;
    };
    const makeLathe = (pts, segs, sx, sy, sz) => {
      const vpts = pts.map(([r, y]) => new THREE.Vector2(Math.max(0.002, r), y));
      const g = new THREE.LatheGeometry(vpts, segs || 12);
      if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx || 1, sy || 1, sz || 1);
      return g;
    };

    // 1. Sculpted Gaunt Zombie Head (hollow eye sockets, zygomatic bones, screaming gaping jaw, teeth row, tattered scalp)
    const cranium = makeLathe([
      [0.015, -0.055],
      [0.058, -0.035],
      [0.082, 0.005],
      [0.094, 0.055],
      [0.088, 0.105],
      [0.058, 0.145],
      [0.002, 0.158]
    ], 14, 0.86, 1.04, 1.05);
    const browRidge = scaleGeo(new THREE.CylinderGeometry(0.084, 0.088, 0.026, 10), 0.96, 1.0, 0.52);
    const cheekL = scaleGeo(new THREE.SphereGeometry(0.036, 8, 6), 1.05, 0.75, 0.85);
    const cheekR = scaleGeo(new THREE.SphereGeometry(0.036, 8, 6), 1.05, 0.75, 0.85);
    const jawLower = scaleGeo(new THREE.CylinderGeometry(0.056, 0.040, 0.095, 10), 0.86, 1.0, 1.05);
    const mawDark = new THREE.BoxGeometry(0.068, 0.052, 0.045);
    const upperTeeth = new THREE.BoxGeometry(0.058, 0.014, 0.020);
    const lowerTeeth = new THREE.BoxGeometry(0.052, 0.014, 0.018);
    const noseBridge = new THREE.ConeGeometry(0.015, 0.038, 6);
    const neckStump = makeLathe([
      [0.062, -0.065],
      [0.048, 0.0],
      [0.054, 0.055]
    ], 10, 0.92, 1.0, 0.96);
    const scalpHair = scaleGeo(new THREE.SphereGeometry(0.092, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.48), 0.90, 0.96, 1.06);

    const headGeo = mergePartGeometries([
      { geo: cranium, ty: 0.025, uvRect: skinUv },
      { geo: browRidge, ty: 0.054, tz: 0.055, uvRect: skinUv },
      { geo: cheekL, tx: -0.048, ty: 0.008, tz: 0.058, uvRect: skinUv },
      { geo: cheekR, tx: 0.048, ty: 0.008, tz: 0.058, uvRect: skinUv },
      { geo: jawLower, ty: -0.068, tz: 0.028, rx: 0.34, uvRect: skinUv },
      { geo: mawDark, ty: -0.035, tz: 0.062, rx: 0.22, uvRect: boneGoreUv },
      { geo: upperTeeth, ty: -0.014, tz: 0.080, uvRect: boneGoreUv },
      { geo: lowerTeeth, ty: -0.052, tz: 0.072, rx: 0.34, uvRect: boneGoreUv },
      { geo: noseBridge, ty: 0.020, tz: 0.092, rx: 1.05, uvRect: skinUv },
      { geo: neckStump, ty: -0.105, tz: -0.014, uvRect: skinUv },
      { geo: scalpHair, ty: 0.045, tz: -0.006, rx: -0.14, uvRect: shirtUv },
      // Sunken dark orbital sockets + small glowing pinpoint feral irises inside
      { geo: new THREE.PlaneGeometry(0.026, 0.018), tx: -0.034, ty: 0.032, tz: 0.086, ry: -0.22, uvRect: eyeUv },
      { geo: new THREE.PlaneGeometry(0.026, 0.018), tx: 0.034, ty: 0.032, tz: 0.086, ry: 0.22, uvRect: eyeUv }
    ]);

    const eyeGlowArr = new Float32Array(MAX_ENEMIES * 3);
    _headEyeAttr = new THREE.InstancedBufferAttribute(eyeGlowArr, 3);
    headGeo.setAttribute('aEyeGlow', _headEyeAttr);

    // 2. Gaunt Emaciated & Hunched Torso (ribcage contour, vertebrae ridge, clavicle, torn chest gash)
    const torsoLathe = makeLathe([
      [0.010, -0.275],
      [0.142, -0.250],
      [0.118, -0.140],
      [0.108, -0.035],
      [0.148, 0.095],
      [0.168, 0.215],
      [0.138, 0.295],
      [0.062, 0.330],
      [0.008, 0.335]
    ], 14, 1.24, 1.0, 0.70);
    const spineParts = [];
    for (let sp = 0; sp < 5; sp++) {
      spineParts.push({
        geo: new THREE.SphereGeometry(0.024, 6, 5),
        ty: -0.12 + sp * 0.095,
        tz: -0.115 - (sp === 2 || sp === 3 ? 0.012 : 0),
        uvRect: boneGoreUv
      });
    }
    const torsoGeo = mergePartGeometries([
      { geo: torsoLathe, ty: 0.0, uvRect: shirtUv },
      { geo: scaleGeo(new THREE.CylinderGeometry(0.095, 0.175, 0.09, 12), 1.20, 1.0, 0.58), ty: 0.275, tz: -0.012, uvRect: shirtUv },
      { geo: scaleGeo(new THREE.TorusGeometry(0.078, 0.020, 6, 12), 1.05, 1.0, 0.92), ty: 0.310, rx: Math.PI * 0.5, uvRect: shirtUv },
      // Torn chest wound revealing dark sternum & rib slats
      { geo: scaleGeo(new THREE.CylinderGeometry(0.070, 0.055, 0.14, 8), 1.2, 1.0, 0.28), ty: 0.11, tz: 0.102, uvRect: boneGoreUv },
      ...spineParts
    ]);

    // 3. Articulated Upper Arm (Shoulder at (0,0,0) -> Elbow at (0, -0.255, 0))
    const upperArmGeo = mergePartGeometries([
      { geo: new THREE.SphereGeometry(0.056, 10, 8), ty: -0.01, uvRect: shirtUv },
      { geo: new THREE.CylinderGeometry(0.052, 0.042, 0.22, 10), ty: -0.125, uvRect: shirtUv },
      { geo: scaleGeo(new THREE.TorusGeometry(0.044, 0.012, 5, 10), 1.0, 1.0, 0.95), ty: -0.225, rx: Math.PI * 0.5, uvRect: shirtUv },
      { geo: new THREE.SphereGeometry(0.038, 8, 6), ty: -0.255, uvRect: skinUv }
    ]);

    // 4. Articulated Forearm + Splayed Hooked Claws (Elbow at (0,0,0) -> Claw Tips at (0, -0.34, +0.04))
    const clawFingers = [];
    for (let f = 0; f < 4; f++) {
      const fx = -0.022 + f * 0.015;
      clawFingers.push({
        geo: new THREE.CylinderGeometry(0.008, 0.005, 0.055, 5),
        tx: fx, ty: -0.305, tz: 0.012, rx: -0.35, uvRect: boneGoreUv
      });
      clawFingers.push({
        geo: new THREE.ConeGeometry(0.006, 0.038, 5),
        tx: fx, ty: -0.345, tz: 0.028, rx: 2.35, uvRect: boneGoreUv
      });
    }
    const forearmGeo = mergePartGeometries([
      { geo: new THREE.CylinderGeometry(0.039, 0.028, 0.23, 10), ty: -0.115, uvRect: skinUv },
      { geo: scaleGeo(new THREE.BoxGeometry(0.064, 0.068, 0.036), 1.0, 1.0, 1.0), ty: -0.255, tz: 0.005, uvRect: boneGoreUv },
      { geo: new THREE.CylinderGeometry(0.008, 0.005, 0.045, 5), tx: -0.036, ty: -0.265, tz: 0.022, rz: 0.45, rx: -0.3, uvRect: boneGoreUv },
      ...clawFingers
    ]);

    // 5. Articulated Thigh (Hip at (0,0,0) -> Knee at (0, -0.365, 0))
    const thighGeo = mergePartGeometries([
      { geo: new THREE.SphereGeometry(0.072, 10, 8), ty: -0.02, uvRect: pantsUv },
      { geo: new THREE.CylinderGeometry(0.072, 0.054, 0.34, 10), ty: -0.185, uvRect: pantsUv },
      { geo: new THREE.SphereGeometry(0.050, 8, 6), ty: -0.365, tz: 0.010, uvRect: skinUv }
    ]);

    // 6. Articulated Calf & Work Boot (Knee at (0,0,0) -> Foot Sole at (0, -0.425, 0))
    const calfLathe = makeLathe([
      [0.048, -0.17],
      [0.034, -0.10],
      [0.056, 0.03],
      [0.054, 0.11],
      [0.046, 0.17]
    ], 10, 0.94, 1.0, 1.04);
    const calfGeo = mergePartGeometries([
      { geo: calfLathe, ty: -0.18, uvRect: pantsUv },
      { geo: scaleGeo(new THREE.BoxGeometry(0.094, 0.075, 0.21), 1.0, 1.0, 1.0), ty: -0.388, tz: 0.042, uvRect: pantsUv },
      { geo: scaleGeo(new THREE.CylinderGeometry(0.045, 0.048, 0.085, 8), 1.0, 1.0, 1.0), ty: -0.365, tz: -0.01, uvRect: pantsUv }
    ]);

    // 7a. Brute Tactical Riot Armor Vest & Shoulder Pauldrons (Brute ONLY!)
    const bruteArmorGeo = mergePartGeometries([
      { geo: scaleGeo(new THREE.BoxGeometry(0.39, 0.42, 0.26), 1.0, 1.0, 1.0), ty: 0.05, uvRect: pantsUv },
      { geo: scaleGeo(new THREE.BoxGeometry(0.32, 0.14, 0.28), 1.0, 1.0, 1.0), ty: -0.18, tz: 0.02, uvRect: shirtUv },
      { geo: scaleGeo(new THREE.CylinderGeometry(0.115, 0.125, 0.11, 10), 1.12, 1.0, 0.95), ty: 0.28, rx: 0.08, uvRect: pantsUv },
      { geo: scaleGeo(new THREE.CylinderGeometry(0.085, 0.105, 0.14, 8), 1.0, 1.0, 1.15), tx: -0.26, ty: 0.21, rz: 0.42, uvRect: pantsUv },
      { geo: scaleGeo(new THREE.CylinderGeometry(0.085, 0.105, 0.14, 8), 1.0, 1.0, 1.15), tx: 0.26, ty: 0.21, rz: -0.42, uvRect: pantsUv }
    ]);

    // 7b. Brute Riot Helmet + Polycarbonate Face Visor (Brute head overlay!)
    const bruteHelmetGeo = mergePartGeometries([
      { geo: scaleGeo(new THREE.SphereGeometry(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), 0.96, 1.02, 1.08), ty: 0.04, uvRect: pantsUv },
      { geo: scaleGeo(new THREE.CylinderGeometry(0.104, 0.106, 0.085, 10, 1, false, -0.95, 1.9), 0.98, 1.0, 1.10), ty: 0.02, tz: 0.015, uvRect: eyeUv }
    ]);

    // 7c. Spitter Biohazard Cyst Clusters + Cracked Pressurized Spore Cylinder (Spitter ONLY!)
    const spitterBioGeo = mergePartGeometries([
      { geo: new THREE.CylinderGeometry(0.068, 0.068, 0.34, 12), tx: 0.055, ty: 0.08, tz: -0.145, rz: -0.22, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.068, 10, 8), tx: 0.095, ty: 0.24, tz: -0.145, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.095, 10, 8), tx: -0.105, ty: 0.18, tz: -0.095, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.072, 8, 6), tx: -0.155, ty: 0.28, tz: -0.035, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.064, 8, 6), tx: 0.015, ty: -0.04, tz: -0.140, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.055, 8, 6), tx: -0.085, ty: 0.04, tz: 0.115, uvRect: eyeUv }
    ]);

    // 7d. Commuter Walker/Runner Torn Cloth Strips & Exposed Ribcage Gore Overlay
    const ragGeo = mergePartGeometries([
      { geo: scaleGeo(new THREE.BoxGeometry(0.065, 0.24, 0.025), 1.0, 1.0, 1.0), tx: 0.02, ty: 0.14, tz: 0.125, rz: 0.26, rx: -0.12, uvRect: shirtUv },
      { geo: scaleGeo(new THREE.BoxGeometry(0.09, 0.16, 0.02), 1.0, 1.0, 1.0), tx: -0.11, ty: -0.23, tz: 0.095, rz: -0.18, uvRect: shirtUv },
      { geo: scaleGeo(new THREE.BoxGeometry(0.08, 0.14, 0.02), 1.0, 1.0, 1.0), tx: 0.10, ty: -0.21, tz: -0.095, rz: 0.22, uvRect: shirtUv },
      { geo: scaleGeo(new THREE.BoxGeometry(0.14, 0.12, 0.025), 1.0, 1.0, 1.0), tx: 0.01, ty: 0.09, tz: 0.112, uvRect: boneGoreUv }
    ]);

    const zombieTex = createZombieTexture();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: zombieTex,
      roughness: 0.72,
      metalness: 0.06,
      envMapIntensity: 1.35
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: zombieTex,
      roughness: 0.64,
      metalness: 0.06,
      envMapIntensity: 1.40
    });
    headMat.customProgramCacheKey = () => 'lrt_zombie_head_eyes_v2';
    headMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aEyeGlow;\nvarying vec3 vEyeGlow;\nvarying vec2 vHeadUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvEyeGlow = aEyeGlow;\nvHeadUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEyeGlow;\nvarying vec2 vHeadUv;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\nif (vHeadUv.x > 0.52 && vHeadUv.x < 0.73 && vHeadUv.y < 0.45) { totalEmissiveRadiance += vEyeGlow; }'
        );
    };

    const armorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: zombieTex,
      roughness: 0.40,
      metalness: 0.42,
      envMapIntensity: 1.45
    });

    const bioMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0x222222),
      emissiveIntensity: 0.8,
      roughness: 0.28,
      metalness: 0.08
    });

    function makePartMesh(geo, mat, castShadow) {
      const m = new THREE.InstancedMesh(geo, mat, MAX_ENEMIES);
      m.frustumCulled = false;
      m.castShadow = castShadow !== undefined ? !!castShadow : true;
      m.receiveShadow = false;
      m.count = 0;
      const white = new THREE.Color(0xffffff);
      for (let i = 0; i < MAX_ENEMIES; i++) {
        m.setMatrixAt(i, _zeroMat);
        m.setColorAt(i, white);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      E.enemyRoot.add(m);
      return m;
    }

    _headMesh = makePartMesh(headGeo, headMat, true);
    _torsoMesh = makePartMesh(torsoGeo, bodyMat, true);
    _upperArmLMesh = makePartMesh(upperArmGeo, bodyMat, true);
    _upperArmRMesh = makePartMesh(upperArmGeo, bodyMat, true);
    _forearmLMesh = makePartMesh(forearmGeo, bodyMat, true);
    _forearmRMesh = makePartMesh(forearmGeo, bodyMat, true);
    _thighLMesh = makePartMesh(thighGeo, bodyMat, true);
    _thighRMesh = makePartMesh(thighGeo, bodyMat, true);
    _calfLMesh = makePartMesh(calfGeo, bodyMat, true);
    _calfRMesh = makePartMesh(calfGeo, bodyMat, true);
    _bruteArmorMesh = makePartMesh(bruteArmorGeo, armorMat, false);
    _bruteHelmetMesh = makePartMesh(bruteHelmetGeo, armorMat, false);
    _spitterBioMesh = makePartMesh(spitterBioGeo, bioMat, false);
    _ragMesh = makePartMesh(ragGeo, bodyMat, false);

    _bruteArmorMesh.visible = false;
    _bruteHelmetMesh.visible = false;
    _spitterBioMesh.visible = false;
    _ragMesh.visible = false;

    _corePartMeshes = [
      _headMesh, _torsoMesh, _upperArmLMesh, _upperArmRMesh,
      _forearmLMesh, _forearmRMesh, _thighLMesh, _thighRMesh,
      _calfLMesh, _calfRMesh
    ];
    _overlayPartMeshes = [
      _bruteArmorMesh, _bruteHelmetMesh, _spitterBioMesh, _ragMesh
    ];
    _allPartMeshes = _corePartMeshes.concat(_overlayPartMeshes);

    const createVomitPuddleTex = () => {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 192;
      const ctx = c.getContext('2d');
      if (!ctx) return null;

      let seed = 9187;
      const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

      // Multi-lobe irregular vomit puddle silhouette
      const cx = 96;
      const cy = 96;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + rng() * 0.45;
        const off = i === 0 ? 0 : (10 + rng() * 24);
        const lx = cx + Math.cos(ang) * off;
        const ly = cy + Math.sin(ang) * off;
        const rad = i === 0 ? 52 : (20 + rng() * 22);
        const g = ctx.createRadialGradient(lx, ly, 3, lx, ly, rad);
        g.addColorStop(0.0, 'rgba(66, 78, 16, 0.96)');
        g.addColorStop(0.48, 'rgba(108, 128, 22, 0.88)');
        g.addColorStop(0.80, 'rgba(148, 168, 34, 0.56)');
        g.addColorStop(1.0, 'rgba(92, 110, 18, 0.0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lx, ly, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Radial impact splash streaks & satellite droplets
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + (rng() - 0.5) * 0.28;
        const r0 = 28 + rng() * 14;
        const r1 = 56 + rng() * 34;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(134, 154, 28, 0.72)' : 'rgba(78, 92, 18, 0.78)';
        ctx.lineWidth = 2.0 + rng() * 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();

        const dr = r1 + 4 + rng() * 8;
        ctx.fillStyle = 'rgba(116, 136, 24, 0.76)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * dr, cy + Math.sin(ang) * dr, 2.2 + rng() * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Digested dark-brown/olive bile chunks & frothy acid pockets
      for (let i = 0; i < 48; i++) {
        const ang = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * 54;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        const cr = 1.4 + rng() * 3.6;
        ctx.fillStyle = (i % 3 === 0)
          ? 'rgba(176, 198, 48, 0.62)'
          : (i % 2 === 0 ? 'rgba(54, 46, 15, 0.85)' : 'rgba(84, 70, 20, 0.75)');
        ctx.beginPath();
        ctx.arc(px, py, cr, 0, Math.PI * 2);
        ctx.fill();
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    // Pooled Spitter vomit projectile (clustered lumpy wad + trailing mucus streak, NOT neon orb)
    const bileHeadGeo = new THREE.IcosahedronGeometry(0.095, 1);
    bileHeadGeo.scale(1.05, 0.92, 1.35);
    const bileLumpA = new THREE.IcosahedronGeometry(0.068, 0);
    const bileLumpB = new THREE.IcosahedronGeometry(0.056, 0);
    const bileStreakGeo = new THREE.ConeGeometry(0.075, 0.38, 6);
    const bileGeo = mergePartGeometries([
      { geo: bileHeadGeo, tx: 0, ty: 0, tz: 0.04 },
      { geo: bileLumpA, tx: 0.055, ty: 0.032, tz: -0.04 },
      { geo: bileLumpB, tx: -0.052, ty: -0.025, tz: -0.06 },
      { geo: bileStreakGeo, tx: 0, ty: 0, tz: -0.19, rx: -Math.PI * 0.5 }
    ]);
    bileHeadGeo.dispose();
    bileLumpA.dispose();
    bileLumpB.dispose();
    bileStreakGeo.dispose();

    const bileMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.16,
      metalness: 0.05,
      emissive: 0x263106,
      emissiveIntensity: 0.34
    });
    _bileMesh = new THREE.InstancedMesh(bileGeo, bileMat, MAX_BILE);
    _bileMesh.frustumCulled = false;
    _bileMesh.visible = false;
    for (let i = 0; i < MAX_BILE; i++) {
      _bileMesh.setMatrixAt(i, _zeroMat);
      _bileMesh.setColorAt(i, _color.setHex(BILE_COLORS[i % BILE_COLORS.length]));
    }
    _bileMesh.instanceMatrix.needsUpdate = true;
    if (_bileMesh.instanceColor) _bileMesh.instanceColor.needsUpdate = true;
    E.enemyRoot.add(_bileMesh);

    // Trailing secondary vomit chunks tumbling behind each projectile
    const chunkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.04,
      emissive: 0x202905,
      emissiveIntensity: 0.25
    });
    _bileChunkMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.052, 0), chunkMat, MAX_BILE_CHUNKS);
    _bileChunkMesh.frustumCulled = false;
    _bileChunkMesh.visible = false;
    for (let i = 0; i < MAX_BILE_CHUNKS; i++) {
      _bileChunkMesh.setMatrixAt(i, _zeroMat);
      _bileChunkMesh.setColorAt(i, _color.setHex(DROP_COLORS[i % DROP_COLORS.length]));
    }
    _bileChunkMesh.instanceMatrix.needsUpdate = true;
    if (_bileChunkMesh.instanceColor) _bileChunkMesh.instanceColor.needsUpdate = true;
    E.enemyRoot.add(_bileChunkMesh);

    // Falling vomit droplets in flight + impact splash particles
    const dropMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.14,
      metalness: 0.05,
      emissive: 0x2a3508,
      emissiveIntensity: 0.32
    });
    _bileDropMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.036, 0), dropMat, MAX_BILE_DROPS);
    _bileDropMesh.frustumCulled = false;
    _bileDropMesh.visible = false;
    for (let i = 0; i < MAX_BILE_DROPS; i++) {
      _bileDropMesh.setMatrixAt(i, _zeroMat);
      _bileDropMesh.setColorAt(i, _color.setHex(DROP_COLORS[i % DROP_COLORS.length]));
    }
    _bileDropMesh.instanceMatrix.needsUpdate = true;
    if (_bileDropMesh.instanceColor) _bileDropMesh.instanceColor.needsUpdate = true;
    E.enemyRoot.add(_bileDropMesh);

    // Persistent floor acid/vomit splatter puddle decals
    const puddleGeo = new THREE.PlaneGeometry(1, 1);
    puddleGeo.rotateX(-Math.PI * 0.5);
    const puddleMat = new THREE.MeshStandardMaterial({
      map: createVomitPuddleTex(),
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0.08,
      emissive: 0x324008,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      side: THREE.DoubleSide
    });
    _puddleMesh = new THREE.InstancedMesh(puddleGeo, puddleMat, MAX_PUDDLES);
    _puddleMesh.frustumCulled = false;
    _puddleMesh.visible = false;
    _puddleMesh.renderOrder = 2;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      _puddleMesh.setMatrixAt(i, _zeroMat);
      _puddleMesh.setColorAt(i, _color.setHex(PUDDLE_COLORS[i % PUDDLE_COLORS.length]));
    }
    _puddleMesh.instanceMatrix.needsUpdate = true;
    if (_puddleMesh.instanceColor) _puddleMesh.instanceColor.needsUpdate = true;
    E.enemyRoot.add(_puddleMesh);

    // Acid puddle fizzing/popping bubbles
    const bubbleMat = new THREE.MeshStandardMaterial({
      color: 0xb4ce32,
      roughness: 0.10,
      metalness: 0.10,
      emissive: 0x45560c,
      emissiveIntensity: 0.52,
      transparent: true,
      opacity: 0.82
    });
    _puddleBubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.048, 6, 5), bubbleMat, MAX_PUDDLE_BUBBLES);
    _puddleBubbleMesh.frustumCulled = false;
    _puddleBubbleMesh.visible = false;
    for (let i = 0; i < MAX_PUDDLE_BUBBLES; i++) {
      _puddleBubbleMesh.setMatrixAt(i, _zeroMat);
    }
    _puddleBubbleMesh.instanceMatrix.needsUpdate = true;
    E.enemyRoot.add(_puddleBubbleMesh);
  }

  function initZombiePool() {
    E.zombies.length = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      E.zombies.push({
        id: i,
        active: false,
        dead: false,
        variant: 'walker',
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        yaw: 0,
        hp: 70, maxHp: 70,
        armorHp: 0, hasArmor: false,
        speed: 1.32,
        baseSpeed: 1.32,
        scale: 1.0,
        damage: 20,
        attackRange: 1.75,
        attackCooldown: 1.35,
        attackTimer: 0,
        spitTimer: 1.5,
        staggerTimer: 0,
        hitFlashTimer: 0,
        deathTimer: 0,
        fallAngle: 0,
        fallSign: 1,
        fallPitchSign: 1,
        legDmg: 0,
        legCrippled: false,
        hitZone: 'torso',
        hitSide: 0,
        hornVulnTimer: 0,
        animPhase: Math.random() * 6.28,
        seed: Math.random() * 100,
        limbBias: Math.random() > 0.5 ? 1 : -1,
        steerCommit: 0,
        steerDir: 1,
        blockedTime: 0,
        stuckTime: 0,
        progTimer: 0,
        lastProgX: 0,
        lastProgZ: 0,
        alertDelay: 0,
        navTimer: 0,
        wpX: 0, wpY: 0, wpZ: 0,
        hasNavWp: false,
        screamTimer: 0,
        shriekTimer: 0,
        buffTimer: 0,
        chargeWindup: 0,
        chargeTimer: 0,
        chargeCooldown: 0,
        chargeDirX: 0,
        chargeDirZ: 0,
        lureTimer: 0,
        lurePosX: 0,
        lurePosY: 0,
        lurePosZ: 0,
        isRoamer: false,
        aggroState: 'CHASE',
        aggroTimer: 0,
        chaseLoseTimer: 0,
        patrolOriginX: 0,
        patrolOriginZ: 0,
        patrolTargetX: 0,
        patrolTargetZ: 0,
        patrolWaitTimer: 0,
        lastKnownX: 0,
        lastKnownY: 0,
        lastKnownZ: 0,
        coarseDt: 0,
        matrixInit: false,
        groundedOnce: false,
        skinColor: new THREE.Color(),
        shirtColor: new THREE.Color(),
        pantsColor: new THREE.Color(),
        gearColor: new THREE.Color()
      });
    }

    E.bileOrbs.length = 0;
    for (let i = 0; i < MAX_BILE; i++) {
      E.bileOrbs.push({
        active: false,
        pos: new THREE.Vector3(),
        startPos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        dropAccum: 0,
        damage: 14,
        groundY: 0,
        spin: 0
      });
    }

    E.bileDrops.length = 0;
    for (let i = 0; i < MAX_BILE_DROPS; i++) {
      E.bileDrops.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.65,
        scale: 1.0,
        floorY: -1.05
      });
    }

    E.bilePuddles.length = 0;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      E.bilePuddles.push({
        active: false,
        pos: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 1, 0),
        radius: 1.35,
        life: 0,
        maxLife: 7.0,
        yaw: 0,
        aspect: 1.0,
        damageTickTimer: 0,
        bubbleAccum: 0
      });
    }

    E.bileBubbles.length = 0;
    for (let i = 0; i < MAX_PUDDLE_BUBBLES; i++) {
      E.bileBubbles.push({
        active: false,
        pos: new THREE.Vector3(),
        riseSpeed: 0.25,
        life: 0,
        maxLife: 0.65,
        maxScale: 1.0
      });
    }
    _bileDropCursor = 0;
    _puddleCursor = 0;
    _bubbleCursor = 0;
  }

  function assignVariantVisuals(z) {
    const shirtPick = COMMUTER_SHIRT_COLORS[Math.floor(Math.random() * COMMUTER_SHIRT_COLORS.length)];
    const skinPick = SKIN_PALLOR_COLORS[Math.floor(Math.random() * SKIN_PALLOR_COLORS.length)];
    if (z.variant === 'walker') {
      z.skinColor.setHex(skinPick);
      z.shirtColor.setHex(shirtPick);
      z.pantsColor.setHex(Math.random() > 0.5 ? 0x3b4048 : 0x4b4339);
      z.gearColor.setHex(0x887c6e);
    } else if (z.variant === 'runner') {
      z.skinColor.setHex(0xa8928c);
      z.shirtColor.setHex(Math.random() > 0.4 ? 0x7a2f32 : 0x5c2628);
      z.pantsColor.setHex(0x34373e);
      z.gearColor.setHex(0x6e2424);
    } else if (z.variant === 'brute') {
      z.skinColor.setHex(0x8c9288);
      z.shirtColor.setHex(0x2c3648); // LRT Tactical Riot Uniform
      z.pantsColor.setHex(0x28303d);
      z.gearColor.setHex(0x4f5a69);
    } else if (z.variant === 'spitter') {
      z.skinColor.setHex(0x9ea86a);
      z.shirtColor.setHex(0x86903c); // Soiled chemical hazmat suit
      z.pantsColor.setHex(0x4d5432);
      z.gearColor.setHex(0xb8ff3c); // Toxic lime green
    } else if (z.variant === 'screamer') {
      z.skinColor.setHex(0x9c8e94); // cadaver ash with faint crimson tinge
      z.shirtColor.setHex(0x5a2d36); // blood-soaked tattered commuter fabric
      z.pantsColor.setHex(0x382c32); // dark ash commuter trousers
      z.gearColor.setHex(0xff3848); // crimson-red cyst overlay
    }
  }

  function applyZombieColors(z) {
    const idx = z.id;
    const isHit = z.hitFlashTimer > 0;
    const rTint = isHit ? 1.15 : 1.0;
    const gbTint = isHit ? 0.58 : 1.0;

    _color.copy(z.skinColor);
    if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
    _headMesh.setColorAt(idx, _color);
    _forearmLMesh.setColorAt(idx, _color);
    _forearmRMesh.setColorAt(idx, _color);

    _color.copy(z.shirtColor);
    if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
    _torsoMesh.setColorAt(idx, _color);
    _upperArmLMesh.setColorAt(idx, _color);
    _upperArmRMesh.setColorAt(idx, _color);

    _color.copy(z.pantsColor);
    if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
    _thighLMesh.setColorAt(idx, _color);
    _thighRMesh.setColorAt(idx, _color);
    _calfLMesh.setColorAt(idx, _color);
    _calfRMesh.setColorAt(idx, _color);

    _color.copy(z.gearColor);
    if (z.variant === 'brute' && isHit) _color.multiplyScalar(0.85);
    _bruteArmorMesh.setColorAt(idx, _color);
    _bruteHelmetMesh.setColorAt(idx, _color);
    _spitterBioMesh.setColorAt(idx, z.gearColor);
    _ragMesh.setColorAt(idx, z.gearColor);

    if (_headEyeAttr) {
      let er = 0, eg = 0, eb = 0;
      if (!z.dead) {
        if (z.variant === 'runner') { er = 2.6; eg = 0.32; eb = 0.06; }
        else if (z.variant === 'spitter') { er = 0.45; eg = 2.6; eb = 0.14; }
        else if (z.variant === 'brute') { er = 1.65; eg = 0.65; eb = 0.10; }
        else if (z.variant === 'screamer') { er = 2.2; eg = 0.25; eb = 0.25; }
        else { er = 0.72; eg = 0.48; eb = 0.18; }
      }
      _headEyeAttr.setXYZ(idx, er, eg, eb);
    }
  }

  function markColorsDirty() {
    for (let i = 0; i < _allPartMeshes.length; i++) {
      const m = _allPartMeshes[i];
      if (m && m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (_headEyeAttr) _headEyeAttr.needsUpdate = true;
  }

  function setHeadEyeDead(idx) {
    if (_headEyeAttr) {
      _headEyeAttr.setXYZ(idx, 0, 0, 0);
      _headEyeAttr.needsUpdate = true;
    }
  }

  function zeroZombieMatrices(idx) {
    for (let i = 0; i < _allPartMeshes.length; i++) {
      if (_allPartMeshes[i]) _allPartMeshes[i].setMatrixAt(idx, _zeroMat);
    }
  }

  function syncMeshCounts(highWater) {
    for (let m = 0; m < _allPartMeshes.length; m++) {
      if (_allPartMeshes[m]) _allPartMeshes[m].count = highWater;
    }
  }

  function flushMeshMatrices() {
    for (let m = 0; m < _allPartMeshes.length; m++) {
      if (_allPartMeshes[m]) _allPartMeshes[m].instanceMatrix.needsUpdate = true;
    }
  }

  function setWarmupMode(active) {
    E.warmupActive = !!active;
    for (let i = 0; i < _overlayPartMeshes.length; i++) {
      const m = _overlayPartMeshes[i];
      if (m) {
        if (E.warmupActive) {
          m.visible = true;
          m.count = Math.max(1, E.activeHighWater);
        } else {
          m.visible = false;
          m.count = E.activeHighWater;
        }
      }
    }
  }

  function resetMeshes() {
    E.activeHighWater = 0;

    for (let i = 0; i < MAX_ENEMIES; i++) {
      E.zombies[i].active = false;
      E.zombies[i].dead = false;
      E.zombies[i].isRoamer = false;
      E.zombies[i].aggroState = 'CHASE';
      E.zombies[i].coarseDt = 0;
      E.zombies[i].matrixInit = false;
      E.zombies[i].groundedOnce = false;
      zeroZombieMatrices(i);
    }
    for (let i = 0; i < MAX_BILE; i++) {
      E.bileOrbs[i].active = false;
      if (_bileMesh) _bileMesh.setMatrixAt(i, _zeroMat);
    }
    if (_bileChunkMesh) {
      for (let i = 0; i < MAX_BILE_CHUNKS; i++) _bileChunkMesh.setMatrixAt(i, _zeroMat);
      _bileChunkMesh.visible = false;
      _bileChunkMesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < MAX_BILE_DROPS; i++) {
      if (E.bileDrops[i]) E.bileDrops[i].active = false;
      if (_bileDropMesh) _bileDropMesh.setMatrixAt(i, _zeroMat);
    }
    for (let i = 0; i < MAX_PUDDLES; i++) {
      if (E.bilePuddles[i]) E.bilePuddles[i].active = false;
      if (_puddleMesh) _puddleMesh.setMatrixAt(i, _zeroMat);
    }
    for (let i = 0; i < MAX_PUDDLE_BUBBLES; i++) {
      if (E.bileBubbles[i]) E.bileBubbles[i].active = false;
      if (_puddleBubbleMesh) _puddleBubbleMesh.setMatrixAt(i, _zeroMat);
    }

    for (let m = 0; m < _corePartMeshes.length; m++) {
      if (_corePartMeshes[m]) {
        _corePartMeshes[m].count = 0;
        _corePartMeshes[m].instanceMatrix.needsUpdate = true;
      }
    }
    for (let m = 0; m < _overlayPartMeshes.length; m++) {
      if (_overlayPartMeshes[m]) {
        _overlayPartMeshes[m].visible = E.warmupActive;
        _overlayPartMeshes[m].count = 0;
        _overlayPartMeshes[m].instanceMatrix.needsUpdate = true;
      }
    }
    if (_bileMesh) {
      _bileMesh.visible = false;
      _bileMesh.instanceMatrix.needsUpdate = true;
    }
    if (_bileDropMesh) {
      _bileDropMesh.visible = false;
      _bileDropMesh.instanceMatrix.needsUpdate = true;
    }
    if (_puddleMesh) {
      _puddleMesh.visible = false;
      _puddleMesh.instanceMatrix.needsUpdate = true;
    }
    if (_puddleBubbleMesh) {
      _puddleBubbleMesh.visible = false;
      _puddleBubbleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function resolveBileFloorY(x, y, z, fallbackY) {
    let bestY = -999;
    _bileOrigin.set(x, y + 0.35, z);
    if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
      const wh = LRT.Station.raycastWorld(_bileOrigin, _downY, 6.5);
      if (wh && wh.normal && wh.normal.y > 0.45 && wh.point.y > bestY) {
        bestY = wh.point.y;
      }
    }
    if (LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
      const th = LRT.Train.raycastTrain(_bileOrigin, _downY, 6.5);
      if (th && th.normal && th.normal.y > 0.45 && th.point.y > bestY) {
        bestY = th.point.y;
      }
    }
    if (bestY > -50) return bestY;
    if (fallbackY !== undefined) return fallbackY;
    return y > 1.5 ? 0.0 : -1.0;
  }

  function spawnBileDrop(x, y, z, vx, vy, vz, scale, maxLife, floorY) {
    if (!E.bileDrops.length) return;
    const d = E.bileDrops[_bileDropCursor];
    _bileDropCursor = (_bileDropCursor + 1) % MAX_BILE_DROPS;
    d.active = true;
    d.life = 0;
    d.maxLife = maxLife || (0.45 + Math.random() * 0.35);
    d.scale = scale || (0.75 + Math.random() * 0.65);
    d.floorY = floorY !== undefined ? floorY : -1.1;
    d.pos.set(x, y, z);
    d.vel.set(vx, vy, vz);
  }

  function spawnBileDropsBurst(pos, normal, count, floorY) {
    const nx = normal ? normal.x : 0;
    const ny = normal ? normal.y : 1;
    const nz = normal ? normal.z : 0;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 3.0;
      const vx = Math.cos(ang) * spd + nx * 1.4;
      const vy = 1.4 + Math.random() * 2.8 + ny * 1.1;
      const vz = Math.sin(ang) * spd + nz * 1.4;
      spawnBileDrop(
        pos.x + (Math.random() - 0.5) * 0.16,
        pos.y + 0.08,
        pos.z + (Math.random() - 0.5) * 0.16,
        vx, vy, vz,
        0.7 + Math.random() * 0.75,
        0.42 + Math.random() * 0.42,
        floorY
      );
    }
  }

  function spawnBilePuddle(x, y, z, radius, fallbackFloorY) {
    if (!E.bilePuddles.length) return null;
    const idx = _puddleCursor;
    _puddleCursor = (_puddleCursor + 1) % MAX_PUDDLES;
    const p = E.bilePuddles[idx];
    const floorY = resolveBileFloorY(x, y, z, fallbackFloorY);
    p.active = true;
    p.pos.set(x, floorY + 0.024, z);
    p.normal.set(0, 1, 0);
    p.radius = radius || (1.28 + Math.random() * 0.32);
    p.life = 0;
    p.maxLife = 6.8 + Math.random() * 1.4;
    p.yaw = Math.random() * Math.PI * 2;
    p.aspect = 0.86 + Math.random() * 0.28;
    p.damageTickTimer = 0.25;
    p.bubbleAccum = 0;
    return p;
  }

  function spawnPuddleBubble(p) {
    if (!E.bileBubbles.length) return;
    const b = E.bileBubbles[_bubbleCursor];
    _bubbleCursor = (_bubbleCursor + 1) % MAX_PUDDLE_BUBBLES;
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * p.radius * 0.62;
    b.active = true;
    b.life = 0;
    b.maxLife = 0.45 + Math.random() * 0.45;
    b.maxScale = 0.65 + Math.random() * 0.95;
    b.riseSpeed = 0.14 + Math.random() * 0.18;
    b.pos.set(p.pos.x + Math.cos(ang) * rad, p.pos.y + 0.01, p.pos.z + Math.sin(ang) * rad);
  }

  function spawnBileProjectile(z, playerPos) {
    if (!playerPos) return;
    let slot = null;
    for (let i = 0; i < MAX_BILE; i++) {
      if (!E.bileOrbs[i].active) { slot = E.bileOrbs[i]; break; }
    }
    if (!slot) return;

    const sc = z.scale || 1.0;
    const fwdX = Math.sin(z.yaw || 0);
    const fwdZ = Math.cos(z.yaw || 0);
    slot.active = true;
    slot.life = 0;
    slot.dropAccum = 0;
    slot.damage = Math.max(8, z.damage || 14);
    slot.groundY = z.y !== undefined ? z.y : 0.0;
    slot.spin = Math.random() * Math.PI * 2;
    slot.pos.set(z.x + fwdX * 0.28, slot.groundY + 1.46 * sc, z.z + fwdZ * 0.28);
    slot.startPos.copy(slot.pos);

    let dx = playerPos.x - slot.pos.x;
    const ty = (playerPos.y || 0) + 1.05;
    const dy = ty - slot.pos.y;
    let dz = playerPos.z - slot.pos.z;
    let horizDist = Math.sqrt(dx * dx + dz * dz);
    if (horizDist > 14.0) {
      const clampScale = 14.0 / horizDist;
      dx *= clampScale;
      dz *= clampScale;
      horizDist = 14.0;
    }
    const flightTime = Math.max(0.26, Math.min(1.40, horizDist / BILE_HORIZ_SPEED));

    slot.vel.set(
      dx / flightTime,
      (dy / flightTime) + 0.5 * BILE_GRAVITY * flightTime,
      dz / flightTime
    );

    // Mouth spit droplets right at launch
    for (let k = 0; k < 3; k++) {
      spawnBileDrop(
        slot.pos.x, slot.pos.y, slot.pos.z,
        slot.vel.x * 0.35 + (Math.random() - 0.5) * 1.6,
        slot.vel.y * 0.30 - 0.4 + Math.random() * 0.8,
        slot.vel.z * 0.35 + (Math.random() - 0.5) * 1.6,
        0.85, 0.45, slot.groundY
      );
    }

    play3D('zombie_attack', slot.pos, 0.16, 0.85);
  }

  function updateBileProjectiles(step, elapsed, playerPos, onPlayerHit) {
    let anyBile = false;
    let anyChunks = false;
    let bileMatDirty = false;
    const hasStationRaycast = !!(LRT.Station && typeof LRT.Station.raycastWorld === 'function');

    for (let i = 0; i < MAX_BILE; i++) {
      const b = E.bileOrbs[i];
      if (!b.active) {
        continue;
      }
      anyBile = true;
      bileMatDirty = true;
      b.life += step;
      b.vel.y -= BILE_GRAVITY * step;
      const spd = b.vel.length();
      const stepDist = spd * step;
      if (spd > 0.001) {
        _bileDir.copy(b.vel).divideScalar(spd);
      } else {
        _bileDir.set(0, -1, 0);
      }

      b.dropAccum += step;
      while (b.dropAccum >= 0.035) {
        b.dropAccum -= 0.035;
        spawnBileDrop(
          b.pos.x + (Math.random() - 0.5) * 0.10,
          b.pos.y + (Math.random() - 0.5) * 0.10,
          b.pos.z + (Math.random() - 0.5) * 0.10,
          b.vel.x * 0.18 + (Math.random() - 0.5) * 1.1,
          b.vel.y * 0.12 - 0.7 - Math.random() * 1.1,
          b.vel.z * 0.18 + (Math.random() - 0.5) * 1.1,
          0.65 + Math.random() * 0.55,
          0.42 + Math.random() * 0.30,
          b.groundY
        );
      }

      let hitPoint = null;
      let directPlayerHit = false;
      _bileNormal.copy(_upY);

      if (playerPos) {
        const dx = b.pos.x - playerPos.x;
        const dy = b.pos.y - ((playerPos.y || 0) + 1.0);
        const dz = b.pos.z - playerPos.z;
        if (dx * dx + dy * dy + dz * dz < 0.65) {
          hitPoint = _bileHitVec.copy(b.pos);
          directPlayerHit = true;
        }
      }
      if (!hitPoint && hasStationRaycast) {
        const wh = LRT.Station.raycastWorld(b.pos, _bileDir, stepDist + 0.14);
        if (wh) {
          hitPoint = wh.point;
          if (wh.normal) _bileNormal.copy(wh.normal);
        }
      }
      if (!hitPoint && LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
        const th = LRT.Train.raycastTrain(b.pos, _bileDir, stepDist + 0.14);
        if (th) {
          hitPoint = th.point;
          if (th.normal) _bileNormal.copy(th.normal);
        }
      }

      b.pos.addScaledVector(b.vel, step);
      const horizTravelSq =
        (b.pos.x - b.startPos.x) * (b.pos.x - b.startPos.x) +
        (b.pos.z - b.startPos.z) * (b.pos.z - b.startPos.z);
      const minFloorCut = hasStationRaycast ? -1.15 : (b.groundY + 0.04);

      if (hitPoint || b.pos.y <= minFloorCut || b.life > 2.4 || horizTravelSq > BILE_MAX_RANGE * BILE_MAX_RANGE) {
        b.active = false;
        if (_bileMesh) _bileMesh.setMatrixAt(i, _zeroMat);
        if (_bileChunkMesh) {
          _bileChunkMesh.setMatrixAt(i * 2, _zeroMat);
          _bileChunkMesh.setMatrixAt(i * 2 + 1, _zeroMat);
        }

        const impact = hitPoint || b.pos;
        const puddle = spawnBilePuddle(impact.x, impact.y, impact.z, 1.32 + Math.random() * 0.28, b.groundY);
        const floorRef = puddle ? (puddle.pos.y - 0.02) : b.groundY;
        spawnBileDropsBurst(impact, _bileNormal, 12, floorRef);
        play3D('debris_crumble', impact, 0.24, 0.55);

        if (playerPos && typeof onPlayerHit === 'function') {
          if (directPlayerHit) {
            onPlayerHit(b.damage, impact);
          } else {
            const dx = impact.x - playerPos.x;
            const dy = impact.y - ((playerPos.y || 0) + 1.0);
            const dz = impact.z - playerPos.z;
            if (dx * dx + dy * dy + dz * dz < 2.15) {
              onPlayerHit(Math.max(4, Math.round(b.damage * 0.65)), impact);
            }
          }
        }
      } else {
        if (_bileMesh) {
          _q1.setFromUnitVectors(_fwdZ, _bileDir);
          const pulse = 1.0 + Math.sin(elapsed * 18 + i) * 0.14;
          _scale.set(pulse, pulse, 1.05 + Math.cos(elapsed * 14 + i) * 0.12);
          _m4.compose(b.pos, _q1, _scale);
          _bileMesh.setMatrixAt(i, _m4);
        }
        if (_bileChunkMesh) {
          anyChunks = true;
          for (let c = 0; c < 2; c++) {
            const cIdx = i * 2 + c;
            const back = 0.16 + c * 0.15;
            const wob = elapsed * 10 + i * 2.1 + c * 3.1;
            _pos.set(
              b.pos.x - _bileDir.x * back + Math.cos(wob) * 0.06,
              b.pos.y - _bileDir.y * back + Math.sin(wob * 1.3) * 0.05,
              b.pos.z - _bileDir.z * back + Math.sin(wob) * 0.06
            );
            _e1.set(wob, wob * 0.7, c);
            _q1.setFromEuler(_e1);
            _scale.setScalar(c === 0 ? 1.05 : 0.78);
            _m4.compose(_pos, _q1, _scale);
            _bileChunkMesh.setMatrixAt(cIdx, _m4);
          }
        }
      }
    }

    if (_bileMesh) {
      _bileMesh.visible = anyBile;
      if (bileMatDirty) _bileMesh.instanceMatrix.needsUpdate = true;
    }
    if (_bileChunkMesh) {
      _bileChunkMesh.visible = anyChunks;
      if (bileMatDirty) _bileChunkMesh.instanceMatrix.needsUpdate = true;
    }

    // Update falling vomit droplets in flight & impact splashes
    let anyDrops = false;
    let dropsDirty = false;
    for (let i = 0; i < MAX_BILE_DROPS; i++) {
      const d = E.bileDrops[i];
      if (!d || !d.active) continue;
      dropsDirty = true;
      d.life += step;
      d.vel.y -= BILE_GRAVITY * 1.1 * step;
      d.pos.addScaledVector(d.vel, step);

      if (d.life >= d.maxLife || d.pos.y <= d.floorY) {
        d.active = false;
        if (_bileDropMesh) _bileDropMesh.setMatrixAt(i, _zeroMat);
      } else {
        anyDrops = true;
        if (_bileDropMesh) {
          const dSpd = d.vel.length();
          if (dSpd > 0.05) {
            _bileDir.copy(d.vel).divideScalar(dSpd);
            _q1.setFromUnitVectors(_fwdZ, _bileDir);
          } else {
            _q1.identity();
          }
          const fade = Math.max(0.25, 1.0 - (d.life / d.maxLife) * 0.65);
          _scale.set(d.scale * fade, d.scale * fade, d.scale * fade * 2.1);
          _m4.compose(d.pos, _q1, _scale);
          _bileDropMesh.setMatrixAt(i, _m4);
        }
      }
    }
    if (_bileDropMesh) {
      _bileDropMesh.visible = anyDrops;
      if (dropsDirty) _bileDropMesh.instanceMatrix.needsUpdate = true;
    }

    // Update persistent acid/vomit floor puddles + brief DoT hazard
    let anyPuddles = false;
    let puddlesDirty = false;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      const p = E.bilePuddles[i];
      if (!p || !p.active) continue;
      puddlesDirty = true;
      p.life += step;

      if (p.life >= p.maxLife) {
        p.active = false;
        if (_puddleMesh) _puddleMesh.setMatrixAt(i, _zeroMat);
        continue;
      }

      anyPuddles = true;
      const growT = Math.min(1.0, p.life / 0.14);
      const decayWindow = 1.6;
      const fadeT = p.life > (p.maxLife - decayWindow)
        ? Math.max(0.0, (p.maxLife - p.life) / decayWindow)
        : 1.0;

      if (fadeT > 0.35) {
        p.bubbleAccum += step;
        if (p.bubbleAccum >= 0.20) {
          p.bubbleAccum -= 0.20;
          spawnPuddleBubble(p);
        }
      }

      if (playerPos && typeof onPlayerHit === 'function' && p.life > 0.35 && fadeT > 0.25) {
        const hdx = playerPos.x - p.pos.x;
        const hdz = playerPos.z - p.pos.z;
        const pdy = Math.abs((playerPos.y || 0) - p.pos.y);
        const effRad = p.radius * 0.88;
        if (pdy <= 1.2 && (hdx * hdx + hdz * hdz) <= (effRad * effRad)) {
          p.damageTickTimer -= step;
          if (p.damageTickTimer <= 0) {
            p.damageTickTimer = 0.55;
            onPlayerHit(4, p.pos);
          }
        } else {
          p.damageTickTimer = Math.min(p.damageTickTimer, 0.15);
        }
      }

      if (_puddleMesh) {
        const pulse = 1.0 + Math.sin(elapsed * 4.5 + i * 1.7) * 0.03;
        const diameter = p.radius * 2.0 * growT * fadeT * pulse;
        _e1.set(0, p.yaw, 0, 'YXZ');
        _q1.setFromEuler(_e1);
        _scale.set(diameter, 1.0, diameter * p.aspect);
        _m4.compose(p.pos, _q1, _scale);
        _puddleMesh.setMatrixAt(i, _m4);
      }
    }
    if (_puddleMesh) {
      _puddleMesh.visible = anyPuddles;
      if (puddlesDirty) _puddleMesh.instanceMatrix.needsUpdate = true;
    }

    // Update rising & popping acid puddle bubbles
    let anyBubbles = false;
    let bubblesDirty = false;
    for (let i = 0; i < MAX_PUDDLE_BUBBLES; i++) {
      const b = E.bileBubbles[i];
      if (!b || !b.active) continue;
      bubblesDirty = true;
      b.life += step;
      b.pos.y += b.riseSpeed * step;

      if (b.life >= b.maxLife) {
        b.active = false;
        if (_puddleBubbleMesh) _puddleBubbleMesh.setMatrixAt(i, _zeroMat);
      } else {
        anyBubbles = true;
        if (_puddleBubbleMesh) {
          const t = b.life / b.maxLife;
          const sc = Math.sin(t * Math.PI) * b.maxScale;
          _q1.identity();
          _scale.setScalar(Math.max(0.05, sc));
          _m4.compose(b.pos, _q1, _scale);
          _puddleBubbleMesh.setMatrixAt(i, _m4);
        }
      }
    }
    if (_puddleBubbleMesh) {
      _puddleBubbleMesh.visible = anyBubbles;
      if (bubblesDirty) _puddleBubbleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function updateOverlayVisibilityAndCounts(highWater, hasBruteArmor, hasBio, hasRag, needsMatFlush) {
    E.activeHighWater = highWater;

    for (let m = 0; m < _corePartMeshes.length; m++) {
      if (_corePartMeshes[m]) {
        _corePartMeshes[m].count = E.activeHighWater;
      }
    }

    if (_bruteArmorMesh) {
      _bruteArmorMesh.visible = E.warmupActive || hasBruteArmor;
      _bruteArmorMesh.count = E.activeHighWater;
    }
    if (_bruteHelmetMesh) {
      _bruteHelmetMesh.visible = E.warmupActive || hasBruteArmor;
      _bruteHelmetMesh.count = E.activeHighWater;
    }
    if (_spitterBioMesh) {
      _spitterBioMesh.visible = E.warmupActive || hasBio;
      _spitterBioMesh.count = E.activeHighWater;
    }
    if (_ragMesh) {
      _ragMesh.visible = E.warmupActive || hasRag;
      _ragMesh.count = E.activeHighWater;
    }

    if (needsMatFlush) {
      flushMeshMatrices();
    }
  }

  function updateZombieMatrices(z, timeSec) {
    if (!z.active) return;
    const idx = z.id;

    const sc = z.scale;
    const widthMult = z.variant === 'brute' ? 1.24 : (z.variant === 'runner' ? 0.90 : 0.98);
    let sinkY = 0;
    const scaleDecay = 1.0;
    let deadStage1 = 0;
    let deadStage2 = 0;
    const deadDir = z.fallPitchSign || z.fallSign || 1;

    if (z.dead) {
      deadStage1 = Math.min(1.0, z.deathTimer / 0.22);
      const raw2 = Math.max(0.0, Math.min(1.0, (z.deathTimer - 0.18) / 0.36));
      deadStage2 = 1.0 - (1.0 - raw2) * (1.0 - raw2);
      z.fallAngle = deadStage2 * (Math.PI * 0.48) * deadDir + deadStage1 * (1.0 - deadStage2) * 0.25 * deadDir;
      if (z.deathTimer > 10.8) {
        const fadeT = Math.min(1.0, (z.deathTimer - 10.8) / 1.2);
        sinkY = -0.35 * sc * fadeT;
      }
    }

    const s = sc * scaleDecay;
    const sw = s * widthMult;
    const phase = z.animPhase;
    const limp = z.limbBias;

    // Asymmetric horror posture & organic gait
    let torsoPitch = z.dead
      ? z.fallAngle
      : (z.variant === 'runner' ? 0.56 : z.variant === 'spitter' ? 0.24 : z.variant === 'brute' ? (z.chargeTimer > 0 ? 0.44 : 0.16) : z.variant === 'screamer' ? 0.38 : 0.28);
    if (z.staggerTimer > 0 && !z.dead) {
      const stagT = Math.min(1.0, z.staggerTimer / 0.35);
      torsoPitch -= (z.hitZone === 'legs' ? -0.18 : 0.10) * stagT;
    }
    if (z.chargeWindup > 0 && !z.dead) torsoPitch += 0.24;
    if (z.shriekTimer > 0 && !z.dead) torsoPitch = -0.16;

    let torsoRoll = z.dead
      ? (deadDir * 0.08 * deadStage2 * z.fallSign)
      : (z.variant === 'walker' ? (Math.sin(phase) * 0.12 + limp * 0.08)
        : z.variant === 'spitter' ? (Math.sin(timeSec * 4.5 + z.seed) * 0.08 + limp * 0.10)
        : Math.sin(phase) * 0.06);
    if (!z.dead && z.legCrippled) torsoRoll += limp * 0.16;
    if (!z.dead && z.staggerTimer > 0 && z.hitSide) torsoRoll += z.hitSide * 0.14 * Math.min(1.0, z.staggerTimer / 0.35);

    const walkBob = z.dead ? 0 : Math.abs(Math.sin(phase)) * (z.variant === 'runner' ? 0.065 : 0.04) * s;
    const crippleDrop = (!z.dead && z.legCrippled) ? 0.14 * s : 0;
    const stagLegDrop = (!z.dead && z.staggerTimer > 0 && z.hitZone === 'legs') ? 0.12 * s * Math.min(1.0, z.staggerTimer / 0.42) : 0;
    const hipHeight = z.dead
      ? (0.77 * s * (1.0 - 0.46 * deadStage1) * (1.0 - deadStage2) + 0.15 * s * deadStage2)
      : (0.77 * s - (z.variant === 'runner' ? 0.05 * s : 0) - crippleDrop - stagLegDrop + walkBob);

    // 1. Torso
    _e1.set(torsoPitch, z.yaw, torsoRoll, 'YXZ');
    _qTorso.setFromEuler(_e1);
    _pos.set(z.x, z.y + hipHeight + 0.27 * s + sinkY, z.z);
    _scale.set(sw, s, sw);
    _m4.compose(_pos, _qTorso, _scale);
    _torsoMesh.setMatrixAt(idx, _m4);

    const attachTorso = (lx, ly, lz, outVec) => {
      outVec.set(lx * sw, ly * s, lz * sw).applyQuaternion(_qTorso).add(_pos);
    };

    // 2. Head (twitching cocked neck)
    attachTorso(0, 0.42, (z.variant === 'runner' || z.variant === 'screamer') ? 0.12 : 0.05, _v1);
    const headTwitchY = z.dead ? 0 : Math.sin(timeSec * 2.6 + z.seed) * 0.18;
    const headCockZ = z.dead ? 0 : limp * (0.16 + Math.sin(timeSec * 1.9 + z.seed) * 0.08);
    let headPitch = torsoPitch * 0.55 + 0.08;
    if (z.shriekTimer > 0 && !z.dead) headPitch = -0.58;
    _e1.set(headPitch, z.yaw + headTwitchY, torsoRoll + headCockZ, 'YXZ');
    _q1.setFromEuler(_e1);
    _scale.set(s, s, s);
    _m4.compose(_v1, _q1, _scale);
    _headMesh.setMatrixAt(idx, _m4);

    // 2b. Brute Armored Helmet anchored on head
    if (z.variant === 'brute' && z.hasArmor && !z.dead) {
      _scale.set(s * 1.05, s * 1.05, s * 1.05);
      _m4.compose(_v1, _q1, _scale);
      _bruteHelmetMesh.setMatrixAt(idx, _m4);
    } else {
      _bruteHelmetMesh.setMatrixAt(idx, _zeroMat);
    }

    // 3. Variant-exclusive torso overlays
    _scale.set(sw, s, sw);
    if (z.variant === 'brute' && z.hasArmor && !z.dead) {
      _m4.compose(_pos, _qTorso, _scale);
      _bruteArmorMesh.setMatrixAt(idx, _m4);
      _spitterBioMesh.setMatrixAt(idx, _zeroMat);
      _ragMesh.setMatrixAt(idx, _zeroMat);
    } else if ((z.variant === 'spitter' || z.variant === 'screamer') && !z.dead) {
      const pulseRate = z.variant === 'screamer' ? 7.2 : 5.2;
      const pulseAmp = z.variant === 'screamer' ? 0.12 : 0.08;
      const pulse = 1.0 + Math.sin(timeSec * pulseRate + z.seed) * pulseAmp;
      _scale.set(sw * pulse, s * pulse, sw * pulse);
      _m4.compose(_pos, _qTorso, _scale);
      _spitterBioMesh.setMatrixAt(idx, _m4);
      _bruteArmorMesh.setMatrixAt(idx, _zeroMat);
      _ragMesh.setMatrixAt(idx, _zeroMat);
    } else if ((z.variant === 'walker' || z.variant === 'runner') && !z.dead) {
      _m4.compose(_pos, _qTorso, _scale);
      _ragMesh.setMatrixAt(idx, _m4);
      _bruteArmorMesh.setMatrixAt(idx, _zeroMat);
      _spitterBioMesh.setMatrixAt(idx, _zeroMat);
    } else {
      _bruteArmorMesh.setMatrixAt(idx, _zeroMat);
      _spitterBioMesh.setMatrixAt(idx, _zeroMat);
      _ragMesh.setMatrixAt(idx, _zeroMat);
    }

    // 4. Articulated Two-Segment Arms (Left & Right shoulders -> exact Elbows -> Forearm Claws)
    const attackSwing = (!z.dead && z.attackTimer > z.attackCooldown - 0.30)
      ? Math.sin(((z.attackCooldown - z.attackTimer) / 0.30) * Math.PI) * -0.95
      : 0;

    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const side = sIdx === 0 ? -1 : 1;
      const isStrongSide = (side === limp);
      const uaMesh = side < 0 ? _upperArmLMesh : _upperArmRMesh;
      const faMesh = side < 0 ? _forearmLMesh : _forearmRMesh;

      let uaPitch, elbowFlex, uaRoll;
      if (z.shriekTimer > 0 && !z.dead) {
        uaPitch = -1.25;
        elbowFlex = 0.82;
        uaRoll = side * -0.62 + Math.sin(timeSec * 32.0) * 0.08;
      } else if (z.dead) {
        uaPitch = (deadDir > 0 ? (0.45 + 0.95 * deadStage2) : (-0.35 - 1.15 * deadStage2)) + side * 0.24 * deadStage2;
        elbowFlex = 0.38 - 0.22 * deadStage2;
        uaRoll = side * (-0.28 - 0.62 * deadStage2);
      } else if (z.variant === 'runner') {
        const sgn = side < 0 ? 1 : -1;
        uaPitch = -0.85 + Math.sin(phase) * 0.72 * sgn + attackSwing;
        elbowFlex = 0.78 + Math.cos(phase * sgn) * 0.25;
        uaRoll = side * -0.14;
      } else if (z.variant === 'screamer') {
        const sgn = side < 0 ? 1 : -1;
        uaPitch = -0.92 + Math.sin(phase) * 0.48 * sgn + attackSwing;
        elbowFlex = 0.65;
        uaRoll = side * -0.22;
      } else if (z.variant === 'brute') {
        uaPitch = -0.68 + Math.sin(phase + (side < 0 ? 0 : Math.PI)) * 0.32 + attackSwing * 0.9;
        elbowFlex = 0.55;
        uaRoll = side * -0.18;
      } else {
        // Walker / Spitter asymmetric zombie shamble: reaching claw vs hung twitching arm!
        if (isStrongSide) {
          uaPitch = -1.18 + Math.sin(phase) * 0.22 + attackSwing;
          elbowFlex = 0.42 + Math.sin(phase * 1.3) * 0.14;
          uaRoll = side * -0.08;
        } else {
          uaPitch = -0.32 + Math.sin(phase + 1.2) * 0.16 + attackSwing * 0.55;
          elbowFlex = 0.68 + Math.cos(phase) * 0.15;
          uaRoll = side * -0.16;
        }
      }

      attachTorso(side * 0.245, 0.23, 0.02, _v1);
      _e1.set(uaPitch, z.yaw, uaRoll, 'YXZ');
      _q1.setFromEuler(_e1);
      _scale.set(sw, s, sw);
      _m4.compose(_v1, _q1, _scale);
      uaMesh.setMatrixAt(idx, _m4);

      // Compute exact elbow joint position at tip (0, -0.255 * s, 0) of upper arm
      _vJointLocal.set(0, -0.255 * s, 0).applyQuaternion(_q1).add(_v1);
      _e1.set(uaPitch - elbowFlex, z.yaw, uaRoll * 0.7, 'YXZ');
      _q1.setFromEuler(_e1);
      _m4.compose(_vJointLocal, _q1, _scale);
      faMesh.setMatrixAt(idx, _m4);
    }

    // 5. Articulated Two-Segment Legs (Hip -> Exact Knee -> Backward-Bending Calf & Boot!)
    const thighSwingAmp = z.dead ? 0.12 : (z.variant === 'runner' ? 0.85 : (z.variant === 'screamer' ? 0.72 : (z.variant === 'brute' ? 0.44 : 0.50)));
    const kneeAmp = z.dead ? 0.10 : (z.variant === 'runner' ? 0.95 : (z.variant === 'screamer' ? 0.82 : 0.62));

    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const side = sIdx === 0 ? -1 : 1;
      const thighMesh = side < 0 ? _thighLMesh : _thighRMesh;
      const calfMesh = side < 0 ? _calfLMesh : _calfRMesh;
      const legPhase = side < 0 ? phase : (phase + Math.PI);

      // Asymmetric walker drag on injured leg (exaggerated when legCrippled)
      const isCrippledLeg = !z.dead && z.legCrippled && side !== limp;
      const dragMult = isCrippledLeg ? 0.32 : ((!z.dead && z.variant === 'walker' && side !== limp) ? 0.62 : 1.0);
      const thighPitch = z.dead
        ? (deadDir * (Math.PI * 0.46) * deadStage2 - 0.65 * deadStage1 * (1.0 - deadStage2) + side * 0.12 * deadStage2)
        : (Math.sin(legPhase) * thighSwingAmp * dragMult - (z.variant === 'runner' ? 0.15 : 0) - (isCrippledLeg ? 0.22 : 0));
      // Positive X rotation bends lower leg BACKWARD cleanly at the knee
      const kneeFlex = z.dead
        ? (1.35 * deadStage1 * (1.0 - deadStage2) + 0.14 * deadStage2)
        : Math.max(0.06, Math.sin(legPhase + 1.15) * kneeAmp + (z.variant === 'runner' ? 0.24 : 0.12) + (isCrippledLeg ? 0.45 : 0));

      attachTorso(side * 0.105, -0.25, 0, _v1);
      _e1.set(thighPitch, z.yaw, side * -0.04, 'YXZ');
      _q1.setFromEuler(_e1);
      _scale.set(sw, s, sw);
      _m4.compose(_v1, _q1, _scale);
      thighMesh.setMatrixAt(idx, _m4);

      _vKnee.set(0, -0.365 * s, 0).applyQuaternion(_q1).add(_v1);
      _e1.set(thighPitch + kneeFlex, z.yaw, side * -0.02, 'YXZ');
      _q1.setFromEuler(_e1);
      _m4.compose(_vKnee, _q1, _scale);
      calfMesh.setMatrixAt(idx, _m4);
    }
  }

  function initMeshRoot(scene) {
    E.scene = scene;
    if (!E.initialized) {
      E.enemyRoot = new THREE.Group();
      E.enemyRoot.name = 'LRT_Enemies';
      scene.add(E.enemyRoot);
      initZombiePool();
      buildZombieMeshes();
      E.initialized = true;
    } else if (E.enemyRoot && E.enemyRoot.parent !== scene) {
      scene.add(E.enemyRoot);
    }
  }

  E.getEnemyCfg = getEnemyCfg;
  E.play3D = play3D;
  E.assignVariantVisuals = assignVariantVisuals;
  E.applyZombieColors = applyZombieColors;
  E.markColorsDirty = markColorsDirty;
  E.setHeadEyeDead = setHeadEyeDead;
  E.zeroZombieMatrices = zeroZombieMatrices;
  E.syncMeshCounts = syncMeshCounts;
  E.flushMeshMatrices = flushMeshMatrices;
  E.setWarmupMode = setWarmupMode;
  E.resetMeshes = resetMeshes;
  E.spawnBileProjectile = spawnBileProjectile;
  E.spawnBilePuddle = spawnBilePuddle;
  E.updateBileProjectiles = updateBileProjectiles;
  E.updateOverlayVisibilityAndCounts = updateOverlayVisibilityAndCounts;
  E.updateZombieMatrices = updateZombieMatrices;
  E.initMeshRoot = initMeshRoot;
})(window.LRT = window.LRT || {});
