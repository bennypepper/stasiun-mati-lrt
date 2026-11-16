(function (LRT) {
  'use strict';

  const MAX_ENEMIES = 32;
  const MAX_BILE = 16;
  const MAX_NAV_NODES = 384;

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
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _v4 = new THREE.Vector3();
  const _vElbow = new THREE.Vector3();
  const _vKnee = new THREE.Vector3();
  const _vJointLocal = new THREE.Vector3();
  const _rayOrig = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _camPos = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  const _q1 = new THREE.Quaternion();
  const _qTorso = new THREE.Quaternion();
  const _e1 = new THREE.Euler();
  const _m4 = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _scale = new THREE.Vector3();
  const _color = new THREE.Color();
  const _zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
  const _nearbyBoxes = [];

  // Pre-allocated A* scratch buffers
  const _astarG = new Float32Array(MAX_NAV_NODES);
  const _astarF = new Float32Array(MAX_NAV_NODES);
  const _astarParent = new Int16Array(MAX_NAV_NODES);
  const _astarClosed = new Uint8Array(MAX_NAV_NODES);
  const _astarInOpen = new Uint8Array(MAX_NAV_NODES);
  const _astarOpen = new Int16Array(MAX_NAV_NODES);
  const _astarPath = new Int16Array(MAX_NAV_NODES);

  let _scene = null;
  let _enemyRoot = null;
  let _initialized = false;

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

  const _zombies = [];
  const _pendingQueue = [];
  const _bileOrbs = [];

  let _waveNum = 0;
  let _stationIndex = 0;
  let _waveTotalCount = 0;
  let _totalKills = 0;
  let _spawnNodes = [];
  let _spawnCursor = 0;
  let _groanTimer = 1.6;
  let _groanCursor = 0;
  let _stepAudioTimer = 0.45;
  let _stepAlternate = false;
  let _activeHighWater = 0;
  let _warmupActive = false;

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
        listenerPos: _camPos,
        listenerRight: _camRight,
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
      _enemyRoot.add(m);
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

    // Pooled Spitter bile projectiles
    const bileMat = new THREE.MeshBasicMaterial({ color: 0x7eff2a });
    _bileMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.14, 1), bileMat, MAX_BILE);
    _bileMesh.frustumCulled = false;
    _bileMesh.visible = false;
    for (let i = 0; i < MAX_BILE; i++) {
      _bileMesh.setMatrixAt(i, _zeroMat);
    }
    _bileMesh.instanceMatrix.needsUpdate = true;
    _enemyRoot.add(_bileMesh);
  }

  function initZombiePool() {
    _zombies.length = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      _zombies.push({
        id: i,
        active: false,
        dead: false,
        variant: 'walker',
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        yaw: 0,
        hp: 70, maxHp: 70,
        armorHp: 0, hasArmor: false,
        speed: 1.95,
        scale: 1.0,
        damage: 10,
        attackRange: 1.75,
        attackCooldown: 1.25,
        attackTimer: 0,
        spitTimer: 1.5,
        staggerTimer: 0,
        hitFlashTimer: 0,
        deathTimer: 0,
        fallAngle: 0,
        fallSign: 1,
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
        skinColor: new THREE.Color(),
        shirtColor: new THREE.Color(),
        pantsColor: new THREE.Color(),
        gearColor: new THREE.Color()
      });
    }

    _bileOrbs.length = 0;
    for (let i = 0; i < MAX_BILE; i++) {
      _bileOrbs.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0
      });
    }
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
    const flash = z.hitFlashTimer > 0 ? 1.55 : 1.0;

    _color.copy(z.skinColor).multiplyScalar(flash);
    _headMesh.setColorAt(idx, _color);
    _forearmLMesh.setColorAt(idx, _color);
    _forearmRMesh.setColorAt(idx, _color);

    _color.copy(z.shirtColor).multiplyScalar(flash);
    _torsoMesh.setColorAt(idx, _color);
    _upperArmLMesh.setColorAt(idx, _color);
    _upperArmRMesh.setColorAt(idx, _color);

    _color.copy(z.pantsColor).multiplyScalar(flash);
    _thighLMesh.setColorAt(idx, _color);
    _thighRMesh.setColorAt(idx, _color);
    _calfLMesh.setColorAt(idx, _color);
    _calfRMesh.setColorAt(idx, _color);

    _color.copy(z.gearColor);
    if (z.variant === 'brute' && z.hitFlashTimer > 0) _color.multiplyScalar(1.4);
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
    const list = [
      _headMesh, _torsoMesh, _upperArmLMesh, _upperArmRMesh,
      _forearmLMesh, _forearmRMesh, _thighLMesh, _thighRMesh,
      _calfLMesh, _calfRMesh, _bruteArmorMesh, _bruteHelmetMesh,
      _spitterBioMesh, _ragMesh
    ];
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].instanceColor) list[i].instanceColor.needsUpdate = true;
    }
    if (_headEyeAttr) _headEyeAttr.needsUpdate = true;
  }

  function gatherNearbyColliders(x, z, radius, spatialGrid, trainColliders) {
    _nearbyBoxes.length = 0;

    if (spatialGrid) {
      let raw = null;
      if (typeof spatialGrid.queryPoint === 'function') {
        raw = spatialGrid.queryPoint(x, z, radius);
      } else if (typeof spatialGrid.queryAABB === 'function') {
        raw = spatialGrid.queryAABB(x - radius, z - radius, x + radius, z + radius);
      } else if (typeof spatialGrid.query === 'function') {
        raw = spatialGrid.query(x, z, radius);
      } else if (typeof spatialGrid.queryRadius === 'function') {
        raw = spatialGrid.queryRadius(x, z, radius);
      } else if (Array.isArray(spatialGrid)) {
        raw = spatialGrid;
      }
      if (raw) {
        for (let i = 0; i < raw.length; i++) {
          const b = raw[i];
          if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
          const minX = b.min ? b.min.x : b.minX;
          const maxX = b.max ? b.max.x : b.maxX;
          const minZ = b.min ? b.min.z : b.minZ;
          const maxZ = b.max ? b.max.z : b.maxZ;
          if (maxX >= x - radius && minX <= x + radius && maxZ >= z - radius && minZ <= z + radius) {
            _nearbyBoxes.push(b);
          }
        }
      }
    } else if (LRT.Station && typeof LRT.Station.getColliders === 'function') {
      const all = LRT.Station.getColliders();
      if (all) {
        for (let i = 0; i < all.length; i++) {
          const b = all[i];
          if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
          const minX = b.min ? b.min.x : b.minX;
          const maxX = b.max ? b.max.x : b.maxX;
          const minZ = b.min ? b.min.z : b.minZ;
          const maxZ = b.max ? b.max.z : b.maxZ;
          if (maxX >= x - radius && minX <= x + radius && maxZ >= z - radius && minZ <= z + radius) {
            _nearbyBoxes.push(b);
          }
        }
      }
    }

    const tc = Array.isArray(trainColliders)
      ? trainColliders
      : ((LRT.Train && typeof LRT.Train.getColliders === 'function') ? LRT.Train.getColliders() : null);
    if (tc) {
      for (let i = 0; i < tc.length; i++) {
        const b = tc[i];
        if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
        const minX = b.min ? b.min.x : b.minX;
        const maxX = b.max ? b.max.x : b.maxX;
        const minZ = b.min ? b.min.z : b.minZ;
        const maxZ = b.max ? b.max.z : b.maxZ;
        if (maxX >= x - radius && minX <= x + radius && maxZ >= z - radius && minZ <= z + radius) {
          _nearbyBoxes.push(b);
        }
      }
    }
  }

  function isWalkableCollider(b) {
    if (b.isFloor || b.isRamp) return true;
    const tag = b.tag || '';
    return tag === 'floor' || tag === 'ramp' || tag === 'stair' || tag === 'stairs' || tag === 'train_floor' || tag === 'platform';
  }

  function isBlockedAt(x, y, z, rad) {
    for (let i = 0; i < _nearbyBoxes.length; i++) {
      const b = _nearbyBoxes[i];
      if (b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
      const tag = b.tag || '';
      if (isWalkableCollider(b) || tag === 'interact') continue;

      const minY = b.min ? b.min.y : b.minY;
      const maxY = b.max ? b.max.y : b.maxY;
      if (maxY <= y + 0.42 || minY >= y + 1.65) continue;

      const minX = b.min ? b.min.x : b.minX;
      const maxX = b.max ? b.max.x : b.maxX;
      const minZ = b.min ? b.min.z : b.minZ;
      const maxZ = b.max ? b.max.z : b.maxZ;

      const cx = Math.max(minX, Math.min(x, maxX));
      const cz = Math.max(minZ, Math.min(z, maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < rad * rad) {
        return true;
      }
    }
    return false;
  }

  function resolveCollisions(zObj, rad, dt) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < _nearbyBoxes.length; i++) {
        const b = _nearbyBoxes[i];
        if (b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
        const tag = b.tag || '';
        if (isWalkableCollider(b) || tag === 'interact') continue;

        const minY = b.min ? b.min.y : b.minY;
        const maxY = b.max ? b.max.y : b.maxY;
        if (maxY <= zObj.y + 0.42 || minY >= zObj.y + 1.65) continue;

        const minX = b.min ? b.min.x : b.minX;
        const maxX = b.max ? b.max.x : b.maxX;
        const minZ = b.min ? b.min.z : b.minZ;
        const maxZ = b.max ? b.max.z : b.maxZ;

        const cx = Math.max(minX, Math.min(zObj.x, maxX));
        const cz = Math.max(minZ, Math.min(zObj.z, maxZ));
        const dx = zObj.x - cx;
        const dz = zObj.z - cz;
        const distSq = dx * dx + dz * dz;

        if (distSq < rad * rad) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const push = rad - dist;
            zObj.x += (dx / dist) * push;
            zObj.z += (dz / dist) * push;
          } else {
            const dl = Math.abs(zObj.x - minX);
            const dr = Math.abs(maxX - zObj.x);
            const dtn = Math.abs(zObj.z - minZ);
            const db = Math.abs(maxZ - zObj.z);
            const m = Math.min(dl, dr, dtn, db);
            if (m === dl) zObj.x = minX - rad;
            else if (m === dr) zObj.x = maxX + rad;
            else if (m === dtn) zObj.z = minZ - rad;
            else zObj.z = maxZ + rad;
          }
        }
      }
    }

    // Precision surface Y tracking across ramps, stairs, sidewalks (-0.82), asphalt (-1.00), platforms (0.0) & JPO (4.25)
    let bestFloorY = -999;
    let bestRampY = -999;
    for (let i = 0; i < _nearbyBoxes.length; i++) {
      const b = _nearbyBoxes[i];
      if (b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
      const tag = b.tag || '';
      const minX = b.min ? b.min.x : b.minX;
      const maxX = b.max ? b.max.x : b.maxX;
      const minZ = b.min ? b.min.z : b.minZ;
      const maxZ = b.max ? b.max.z : b.maxZ;
      if (zObj.x < minX - 0.1 || zObj.x > maxX + 0.1 || zObj.z < minZ - 0.1 || zObj.z > maxZ + 0.1) continue;

      const minY = b.min ? b.min.y : b.minY;
      const maxY = b.max ? b.max.y : b.maxY;
      if (!isWalkableCollider(b) && !(tag === 'concrete' && maxY <= -0.5) && tag !== '') continue;

      let surfaceY = maxY;
      const isRamp = !!(b.isRamp || tag === 'ramp' || typeof b.getSurfaceY === 'function');
      const axis = b.rampAxis || b.slopeAxis;
      if (typeof b.getSurfaceY === 'function') {
        surfaceY = b.getSurfaceY(zObj.x, zObj.z);
      } else if (isRamp && typeof axis === 'string') {
        const y0 = b.y0 !== undefined ? b.y0 : minY;
        const y1 = b.y1 !== undefined ? b.y1 : maxY;
        if (axis === 'z') {
          const t = Math.max(0, Math.min(1, (zObj.z - minZ) / Math.max(0.01, maxZ - minZ)));
          surfaceY = y0 + (y1 - y0) * t;
        } else if (axis === 'x') {
          const t = Math.max(0, Math.min(1, (zObj.x - minX) / Math.max(0.01, maxX - minX)));
          surfaceY = y0 + (y1 - y0) * t;
        }
      }
      if (surfaceY <= zObj.y + 0.72) {
        if (isRamp && surfaceY > bestRampY) bestRampY = surfaceY;
        if (surfaceY > bestFloorY) bestFloorY = surfaceY;
      }
    }

    const chosenY = bestRampY > -50 && Math.abs(bestRampY - zObj.y) <= 0.72 ? bestRampY : bestFloorY;
    if (chosenY > -50) {
      if (chosenY >= zObj.y) {
        zObj.y += (chosenY - zObj.y) * Math.min(1.0, (dt || 0.016) * 18.0);
        zObj.vy = 0;
      } else {
        // Fast grounded descent down stair flights / sidewalks so feet never hover in mid-air
        zObj.vy = Math.min(14.0, (zObj.vy || 0) + 18.0 * (dt || 0.016));
        zObj.y = Math.max(chosenY, zObj.y - Math.max(zObj.vy * (dt || 0.016), (zObj.y - chosenY) * 0.55));
        if (Math.abs(zObj.y - chosenY) < 0.03) {
          zObj.y = chosenY;
          zObj.vy = 0;
        }
      }
    } else if (zObj.y > -1.05) {
      zObj.vy = Math.min(12.0, (zObj.vy || 0) + 14.0 * (dt || 0.016));
      zObj.y = Math.max(-1.05, zObj.y - zObj.vy * (dt || 0.016));
    }
  }

  // Multi-Level & Street A* Waypoint Pathfinder over LRT.Station.getNavGraph()
  function findNearestNavNode(nodes, x, y, z) {
    let bestId = -1;
    let bestScore = 1e9;
    const onRampBand = y > 0.12 && y < 4.08;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dy = n.y - y;
      const isRampNode = n.tag === 'stair_ramp' || n.tag === 'ada_ramp' || n.tag === 'jpo_stair';
      // Strongly avoid snapping a ground/track zombie up to an unreachable elevated platform face,
      // and avoid snapping a zombie climbing stairs down to the flat floor underneath the staircase
      let vertPenalty = Math.abs(dy) * 3.4;
      if (dy > 0.55 && !isRampNode) vertPenalty = Math.abs(dy) * 16.0;
      else if (onRampBand && dy < -0.45 && !isRampNode) vertPenalty = 24.0 + Math.abs(dy) * 4.0;
      else if (isRampNode) vertPenalty = Math.abs(dy) * 1.6;
      const d = Math.hypot(n.x - x, n.z - z) + vertPenalty;
      if (d < bestScore) {
        bestScore = d;
        bestId = i;
      }
    }
    return bestId;
  }

  function hasDirectWalkPath(spatialGrid, x0, y0, z0, x1, z1) {
    if (!spatialGrid || typeof spatialGrid.queryPoint !== 'function') return false;
    const dist = Math.hypot(x1 - x0, z1 - z0);
    if (dist < 1.2) return true;
    if (dist > 28.0) return false;
    const steps = Math.max(2, Math.ceil(dist / 1.15));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      const near = spatialGrid.queryPoint(px, pz, 0.55);
      let hasFloor = false;
      for (let k = 0; k < near.length; k++) {
        const b = near[k];
        if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
        if (isWalkableCollider(b)) {
          const minX = b.min ? b.min.x : b.minX, maxX = b.max ? b.max.x : b.maxX;
          const minZ = b.min ? b.min.z : b.minZ, maxZ = b.max ? b.max.z : b.maxZ;
          const maxY = b.max ? b.max.y : b.maxY, minY = b.min ? b.min.y : b.minY;
          if (px >= minX - 0.1 && px <= maxX + 0.1 && pz >= minZ - 0.1 && pz <= maxZ + 0.1 && maxY >= y0 - 0.55 && minY <= y0 + 0.55) {
            hasFloor = true;
          }
          continue;
        }
        if ((b.tag || '') === 'interact') continue;
        const minY = b.min ? b.min.y : b.minY, maxY = b.max ? b.max.y : b.maxY;
        if (maxY <= y0 + 0.42 || minY >= y0 + 1.65) continue;
        const minX = b.min ? b.min.x : b.minX, maxX = b.max ? b.max.x : b.maxX;
        const minZ = b.min ? b.min.z : b.minZ, maxZ = b.max ? b.max.z : b.maxZ;
        const cx = Math.max(minX, Math.min(px, maxX));
        const cz = Math.max(minZ, Math.min(pz, maxZ));
        if ((px - cx) * (px - cx) + (pz - cz) * (pz - cz) < 0.16) return false;
      }
      if (!hasFloor) return false;
    }
    return true;
  }

  function solveNavWaypoint(zObj, px, py, pz, spatialGrid) {
    const sameLevel = Math.abs((py || 0) - zObj.y) <= 0.65;
    if (sameLevel && hasDirectWalkPath(spatialGrid, zObj.x, zObj.y, zObj.z, px, pz)) {
      zObj.hasNavWp = false;
      return false;
    }

    const graph = (LRT.Station && typeof LRT.Station.getNavGraph === 'function') ? LRT.Station.getNavGraph() : null;
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      zObj.hasNavWp = false;
      return false;
    }

    const nodes = graph.nodes;
    const adj = graph.adj;
    const count = Math.min(nodes.length, MAX_NAV_NODES);
    const startId = findNearestNavNode(nodes, zObj.x, zObj.y, zObj.z);
    const goalId = findNearestNavNode(nodes, px, py || 0, pz);
    if (startId < 0 || goalId < 0) {
      zObj.hasNavWp = false;
      return false;
    }
    if (startId === goalId) {
      const gn = nodes[goalId];
      const dSelf = Math.hypot(gn.x - zObj.x, gn.z - zObj.z);
      if (dSelf > 1.2) {
        zObj.wpX = gn.x; zObj.wpY = gn.y; zObj.wpZ = gn.z; zObj.hasNavWp = true;
        return true;
      }
      zObj.hasNavWp = false;
      return false;
    }

    for (let i = 0; i < count; i++) {
      _astarG[i] = 1e9;
      _astarF[i] = 1e9;
      _astarParent[i] = -1;
      _astarClosed[i] = 0;
      _astarInOpen[i] = 0;
    }
    const goalNode = nodes[goalId];
    let openLen = 0;
    _astarG[startId] = 0;
    _astarF[startId] = Math.hypot(goalNode.x - nodes[startId].x, (goalNode.y - nodes[startId].y) * 1.4, goalNode.z - nodes[startId].z);
    _astarOpen[openLen++] = startId;
    _astarInOpen[startId] = 1;

    let found = false;
    while (openLen > 0) {
      let bestOpenIdx = 0;
      let bestF = _astarF[_astarOpen[0]];
      for (let i = 1; i < openLen; i++) {
        const f = _astarF[_astarOpen[i]];
        if (f < bestF) {
          bestF = f;
          bestOpenIdx = i;
        }
      }
      const cur = _astarOpen[bestOpenIdx];
      _astarOpen[bestOpenIdx] = _astarOpen[--openLen];
      _astarInOpen[cur] = 0;
      if (cur === goalId) {
        found = true;
        break;
      }
      _astarClosed[cur] = 1;

      const edges = adj[cur] || [];
      const curG = _astarG[cur];
      for (let i = 0; i < edges.length; i++) {
        const ed = edges[i];
        const nxt = ed.to;
        if (nxt >= count || _astarClosed[nxt]) continue;
        let edgeCost = ed.cost;
        if (zObj.variant === 'spitter' && Math.hypot(goalNode.x - zObj.x, goalNode.z - zObj.z) > 8.0 && nodes[nxt].y >= 3.8) {
          edgeCost *= 0.72;
        }
        const tentG = curG + edgeCost;
        if (tentG < _astarG[nxt]) {
          _astarParent[nxt] = cur;
          _astarG[nxt] = tentG;
          const nn = nodes[nxt];
          _astarF[nxt] = tentG + Math.hypot(goalNode.x - nn.x, (goalNode.y - nn.y) * 1.4, goalNode.z - nn.z);
          if (!_astarInOpen[nxt]) {
            _astarOpen[openLen++] = nxt;
            _astarInOpen[nxt] = 1;
          }
        }
      }
    }

    if (!found) {
      zObj.hasNavWp = false;
      return false;
    }

    let pathLen = 0;
    let cur = goalId;
    while (cur >= 0 && pathLen < MAX_NAV_NODES) {
      _astarPath[pathLen++] = cur;
      if (cur === startId) break;
      cur = _astarParent[cur];
    }
    if (pathLen <= 0) {
      zObj.hasNavWp = false;
      return false;
    }

    // Path array is reversed [goal .. start]; advance past start if near OR already on the forward side toward next waypoint
    let targetNodeId = _astarPath[pathLen - 1];
    if (pathLen >= 2) {
      const sn = nodes[startId];
      const nxt = nodes[_astarPath[pathLen - 2]];
      const distStart = Math.hypot(sn.x - zObj.x, sn.z - zObj.z);
      const fwdDot = (nxt.x - sn.x) * (sn.x - zObj.x) + (nxt.z - sn.z) * (sn.z - zObj.z);
      if ((distStart < 1.85 || fwdDot <= 0) && Math.abs(sn.y - zObj.y) < 0.85) {
        targetNodeId = _astarPath[pathLen - 2];
      }
    }
    // A* lookahead string-pulling: skip intermediate node if unobstructed direct walk path exists on same level
    if (pathLen >= 3) {
      const skipTarget = _astarPath[pathLen - 2];
      const nxt2 = nodes[skipTarget];
      if (nxt2 && Math.abs(nxt2.y - zObj.y) <= 0.65 && hasDirectWalkPath(spatialGrid, zObj.x, zObj.y, zObj.z, nxt2.x, nxt2.z)) {
        targetNodeId = skipTarget;
        if (pathLen >= 4) {
          const skipTarget2 = _astarPath[pathLen - 3];
          const nxt3 = nodes[skipTarget2];
          if (nxt3 && Math.abs(nxt3.y - zObj.y) <= 0.65 && hasDirectWalkPath(spatialGrid, zObj.x, zObj.y, zObj.z, nxt3.x, nxt3.z)) {
            targetNodeId = skipTarget2;
          }
        }
      }
    }
    const wp = nodes[targetNodeId];
    zObj.wpX = wp.x;
    zObj.wpY = wp.y;
    zObj.wpZ = wp.z;
    zObj.hasNavWp = true;
    return true;
  }

  function isValidSpawnPoint(x, y, z, playerPos) {
    if (playerPos) {
      const dx = x - playerPos.x;
      const dz = z - playerPos.z;
      if (dx * dx + dz * dz < 49) return false;
    }
    if (LRT.Train && typeof LRT.Train.isPlayerInside === 'function') {
      _v1.set(x, y + 0.8, z);
      if (LRT.Train.isPlayerInside(_v1)) return false;
    }
    if (x > -1.45 && x < 1.38 && y > -0.6) return false;
    return !isBlockedAt(x, y, z, 0.45);
  }

  function spawnOneZombie(variant, pos) {
    let slot = null;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!_zombies[i].active) { slot = _zombies[i]; break; }
    }
    if (!slot) return false;

    const cfg = getEnemyCfg(variant);
    const waveScale = 1.0 + Math.max(0, _waveNum - 1) * 0.06 + _stationIndex * 0.04;

    slot.active = true;
    slot.dead = false;
    slot.variant = variant;
    slot.x = pos.x;
    slot.y = pos.y !== undefined ? pos.y : 0.0;
    slot.z = pos.z;
    slot.vx = 0;
    slot.vy = 0;
    slot.vz = 0;
    slot.yaw = Math.random() * Math.PI * 2;
    slot.hp = Math.round(cfg.hp * waveScale);
    slot.maxHp = slot.hp;
    slot.armorHp = variant === 'brute' ? Math.round(115 * waveScale) : 0;
    slot.hasArmor = variant === 'brute';
    slot.speed = cfg.speed * (0.93 + Math.random() * 0.14);
    slot.scale = cfg.scale || 1.0;
    slot.damage = cfg.damage;
    slot.attackRange = cfg.attackRange;
    slot.attackCooldown = cfg.attackCooldown;
    slot.attackTimer = 0.25 + Math.random() * 0.4;
    slot.spitTimer = 1.2 + Math.random() * 1.4;
    slot.staggerTimer = 0;
    slot.hitFlashTimer = 0;
    slot.deathTimer = 0;
    slot.fallAngle = 0;
    slot.fallSign = Math.random() > 0.5 ? 1 : -1;
    slot.animPhase = Math.random() * Math.PI * 2;
    slot.seed = Math.random() * 100;
    slot.limbBias = Math.random() > 0.5 ? 1 : -1;
    slot.steerCommit = 0;
    slot.steerDir = (slot.id % 2 === 0 ? 1 : -1);
    slot.blockedTime = 0;
    slot.stuckTime = 0;
    slot.progTimer = 0;
    slot.lastProgX = slot.x;
    slot.lastProgZ = slot.z;
    slot.alertDelay = 0;
    slot.navTimer = Math.random() * 0.25;
    slot.hasNavWp = false;
    slot.screamTimer = 1.2 + Math.random() * 2.0;
    slot.shriekTimer = 0;
    slot.buffTimer = 0;
    slot.chargeWindup = 0;
    slot.chargeTimer = 0;
    slot.chargeCooldown = 2.0 + Math.random() * 2.0;
    slot.chargeDirX = 0;
    slot.chargeDirZ = 0;
    slot.lureTimer = 0;
    slot.lurePosX = 0;
    slot.lurePosY = 0;
    slot.lurePosZ = 0;

    assignVariantVisuals(slot);
    applyZombieColors(slot);
    markColorsDirty();

    if (slot.id + 1 > _activeHighWater) {
      _activeHighWater = slot.id + 1;
      const coreMeshes = [
        _headMesh, _torsoMesh, _upperArmLMesh, _upperArmRMesh,
        _forearmLMesh, _forearmRMesh, _thighLMesh, _thighRMesh,
        _calfLMesh, _calfRMesh
      ];
      for (let m = 0; m < coreMeshes.length; m++) {
        if (coreMeshes[m]) coreMeshes[m].count = _activeHighWater;
      }
      if (_bruteArmorMesh) _bruteArmorMesh.count = _activeHighWater;
      if (_bruteHelmetMesh) _bruteHelmetMesh.count = _activeHighWater;
      if (_spitterBioMesh) _spitterBioMesh.count = _activeHighWater;
      if (_ragMesh) _ragMesh.count = _activeHighWater;
    }
    return true;
  }

  function buildFallbackNodes(playerPos) {
    const nodes = [];
    const zs = [-46, -38, -28, -18, 18, 28, 38, 46];
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (!playerPos || Math.abs(z - playerPos.z) > 10) {
        nodes.push({ x: 3.4, y: 0.0, z });
        nodes.push({ x: 4.8, y: 0.0, z: z * 0.85 });
      }
    }
    return nodes;
  }

  function pickNextNode(playerPos) {
    const nodes = (_spawnNodes && _spawnNodes.length > 0) ? _spawnNodes : buildFallbackNodes(playerPos);
    const grid = LRT.Station && LRT.Station.getSpatialGrid ? LRT.Station.getSpatialGrid() : null;
    const tc = LRT.Train && LRT.Train.getColliders ? LRT.Train.getColliders() : null;

    if (playerPos && nodes.length > 3) {
      const near = [];
      const outer = [];
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        const dh = Math.hypot(nd.x - playerPos.x, nd.z - playerPos.z);
        if (dh <= 38.0) {
          near.push(nd);
        } else {
          outer.push(nd);
        }
      }

      const preferNear = Math.random() < 0.75;
      const primaryList = (preferNear && near.length > 0) ? near : (outer.length > 0 ? outer : near);
      const secondaryList = (primaryList === near && outer.length > 0) ? outer : near;

      for (const pool of [primaryList, secondaryList]) {
        for (let attempt = 0; attempt < pool.length; attempt++) {
          const n = pool[(_spawnCursor + attempt) % pool.length];
          const jx = (Math.random() - 0.5) * 0.9;
          const jz = (Math.random() - 0.5) * 0.9;
          const px = n.x + jx;
          const py = n.y !== undefined ? n.y : 0.0;
          const pz = n.z + jz;
          gatherNearbyColliders(px, pz, 1.5, grid, tc);
          if (isValidSpawnPoint(px, py, pz, playerPos)) {
            _spawnCursor = (_spawnCursor + attempt + 1) % nodes.length;
            return { x: px, y: py, z: pz };
          }
        }
      }
    }

    for (let attempt = 0; attempt < nodes.length * 2; attempt++) {
      const n = nodes[(_spawnCursor + attempt) % nodes.length];
      const jx = (Math.random() - 0.5) * 0.9;
      const jz = (Math.random() - 0.5) * 0.9;
      const px = n.x + jx;
      const py = n.y !== undefined ? n.y : 0.0;
      const pz = n.z + jz;
      gatherNearbyColliders(px, pz, 1.5, grid, tc);
      if (isValidSpawnPoint(px, py, pz, playerPos)) {
        _spawnCursor = (_spawnCursor + attempt + 1) % nodes.length;
        return { x: px, y: py, z: pz };
      }
    }
    const fallback = nodes[_spawnCursor % nodes.length];
    _spawnCursor = (_spawnCursor + 1) % nodes.length;
    return { x: fallback.x, y: fallback.y !== undefined ? fallback.y : 0.0, z: fallback.z };
  }

  function init(scene) {
    _scene = scene;
    if (!_initialized) {
      _enemyRoot = new THREE.Group();
      _enemyRoot.name = 'LRT_Enemies';
      scene.add(_enemyRoot);
      initZombiePool();
      buildZombieMeshes();
      _initialized = true;
    } else if (_enemyRoot && _enemyRoot.parent !== scene) {
      scene.add(_enemyRoot);
    }
    reset();
    return Enemies;
  }

  function zeroZombieMatrices(idx) {
    if (_headMesh) _headMesh.setMatrixAt(idx, _zeroMat);
    if (_torsoMesh) _torsoMesh.setMatrixAt(idx, _zeroMat);
    if (_upperArmLMesh) _upperArmLMesh.setMatrixAt(idx, _zeroMat);
    if (_upperArmRMesh) _upperArmRMesh.setMatrixAt(idx, _zeroMat);
    if (_forearmLMesh) _forearmLMesh.setMatrixAt(idx, _zeroMat);
    if (_forearmRMesh) _forearmRMesh.setMatrixAt(idx, _zeroMat);
    if (_thighLMesh) _thighLMesh.setMatrixAt(idx, _zeroMat);
    if (_thighRMesh) _thighRMesh.setMatrixAt(idx, _zeroMat);
    if (_calfLMesh) _calfLMesh.setMatrixAt(idx, _zeroMat);
    if (_calfRMesh) _calfRMesh.setMatrixAt(idx, _zeroMat);
    if (_bruteArmorMesh) _bruteArmorMesh.setMatrixAt(idx, _zeroMat);
    if (_bruteHelmetMesh) _bruteHelmetMesh.setMatrixAt(idx, _zeroMat);
    if (_spitterBioMesh) _spitterBioMesh.setMatrixAt(idx, _zeroMat);
    if (_ragMesh) _ragMesh.setMatrixAt(idx, _zeroMat);
  }

  function setWarmupMode(active) {
    _warmupActive = !!active;
    const overlayMeshes = [
      _bruteArmorMesh, _bruteHelmetMesh, _spitterBioMesh, _ragMesh
    ];
    for (let i = 0; i < overlayMeshes.length; i++) {
      if (overlayMeshes[i]) {
        if (_warmupActive) {
          overlayMeshes[i].visible = true;
          overlayMeshes[i].count = Math.max(1, _activeHighWater);
        } else {
          overlayMeshes[i].visible = false;
          overlayMeshes[i].count = _activeHighWater;
        }
      }
    }
  }

  function reset() {
    _pendingQueue.length = 0;
    _waveNum = 0;
    _stationIndex = 0;
    _waveTotalCount = 0;
    _totalKills = 0;
    _spawnNodes = [];
    _activeHighWater = 0;

    for (let i = 0; i < MAX_ENEMIES; i++) {
      _zombies[i].active = false;
      _zombies[i].dead = false;
      zeroZombieMatrices(i);
    }
    for (let i = 0; i < MAX_BILE; i++) {
      _bileOrbs[i].active = false;
      if (_bileMesh) _bileMesh.setMatrixAt(i, _zeroMat);
    }

    const coreMeshes = [
      _headMesh, _torsoMesh, _upperArmLMesh, _upperArmRMesh,
      _forearmLMesh, _forearmRMesh, _thighLMesh, _thighRMesh,
      _calfLMesh, _calfRMesh
    ];
    for (let m = 0; m < coreMeshes.length; m++) {
      if (coreMeshes[m]) {
        coreMeshes[m].count = 0;
        coreMeshes[m].instanceMatrix.needsUpdate = true;
      }
    }
    const overlayMeshes = [_bruteArmorMesh, _bruteHelmetMesh, _spitterBioMesh, _ragMesh];
    for (let m = 0; m < overlayMeshes.length; m++) {
      if (overlayMeshes[m]) {
        overlayMeshes[m].visible = _warmupActive;
        overlayMeshes[m].count = 0;
        overlayMeshes[m].instanceMatrix.needsUpdate = true;
      }
    }
    if (_bileMesh) {
      _bileMesh.visible = false;
      _bileMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function spawnWave(waveNum, stationIndex, spawnNodes) {
    if (!_initialized) return;
    _waveNum = Math.max(1, waveNum || 1);
    _stationIndex = Math.max(0, stationIndex || 0);
    _spawnNodes = Array.isArray(spawnNodes) ? spawnNodes.slice() : [];
    _pendingQueue.length = 0;

    let deactivationDirty = false;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (_zombies[i].dead) {
        _zombies[i].active = false;
        _zombies[i].dead = false;
        zeroZombieMatrices(i);
        deactivationDirty = true;
      }
    }
    if (deactivationDirty) {
      const allMeshes = [
        _headMesh, _torsoMesh, _upperArmLMesh, _upperArmRMesh,
        _forearmLMesh, _forearmRMesh, _thighLMesh, _thighRMesh,
        _calfLMesh, _calfRMesh, _bruteArmorMesh, _bruteHelmetMesh,
        _spitterBioMesh, _ragMesh
      ];
      for (let m = 0; m < allMeshes.length; m++) {
        if (allMeshes[m]) allMeshes[m].instanceMatrix.needsUpdate = true;
      }
    }

    const playerPos = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' && LRT.PlayerUI.getState().pos) || null;
    const list = [];

    if (_waveNum <= 1) {
      for (let i = 0; i < 4; i++) list.push('walker');
      for (let i = 0; i < 2; i++) list.push('runner');
    } else if (_waveNum === 2) {
      for (let i = 0; i < 6; i++) list.push('walker');
      for (let i = 0; i < 3; i++) list.push('runner');
      if (_stationIndex >= 1) list.push('spitter');
      if (_stationIndex >= 2) list.push('screamer');
    } else if (_waveNum === 3) {
      for (let i = 0; i < 6; i++) list.push('walker');
      for (let i = 0; i < 4; i++) list.push('runner');
      for (let i = 0; i < 2; i++) list.push('spitter');
      list.push('brute');
      list.push('screamer');
    } else {
      const total = Math.min(34, 10 + _waveNum * 3 + _stationIndex);
      const screamers = (_waveNum >= 3 || _stationIndex >= 2) ? Math.min(2, 1 + Math.floor((_waveNum + _stationIndex - 3) * 0.35)) : 0;
      const brutes = Math.min(4, Math.floor((_waveNum + _stationIndex) * 0.55));
      const spitters = Math.min(4, Math.floor((_waveNum + _stationIndex + 1) * 0.55));
      const runners = Math.min(10, 2 + _waveNum + Math.floor(_stationIndex * 0.6));
      const walkers = Math.max(4, total - brutes - spitters - runners - screamers);

      for (let i = 0; i < walkers; i++) list.push('walker');
      for (let i = 0; i < runners; i++) list.push('runner');
      for (let i = 0; i < brutes; i++) list.push('brute');
      for (let i = 0; i < spitters; i++) list.push('spitter');
      for (let i = 0; i < screamers; i++) list.push('screamer');
    }

    _waveTotalCount = list.length;

    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }

    let activeNow = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (_zombies[i].active) activeNow++;
    }

    for (let i = 0; i < list.length; i++) {
      if (activeNow < MAX_ENEMIES - 1) {
        const pt = pickNextNode(playerPos);
        if (spawnOneZombie(list[i], pt)) {
          activeNow++;
        } else {
          _pendingQueue.push(list[i]);
        }
      } else {
        _pendingQueue.push(list[i]);
      }
    }

    markColorsDirty();
  }

  function spawnBileProjectile(z, playerPos) {
    let slot = null;
    for (let i = 0; i < MAX_BILE; i++) {
      if (!_bileOrbs[i].active) { slot = _bileOrbs[i]; break; }
    }
    if (!slot) return;

    const sc = z.scale;
    slot.active = true;
    slot.life = 0;
    slot.pos.set(z.x, z.y + 1.48 * sc, z.z);

    const tx = playerPos.x;
    const ty = playerPos.y + 1.15;
    const tz = playerPos.z;
    const dx = tx - slot.pos.x;
    const dy = ty - slot.pos.y;
    const dz = tz - slot.pos.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    const speed = 15.5;
    const flightTime = Math.max(0.15, horizDist / speed);

    slot.vel.set(
      dx / flightTime,
      (dy / flightTime) + 0.5 * 9.8 * flightTime,
      dz / flightTime
    );

    play3D('zombie_attack', slot.pos, 0.16, 0.85);
  }

  function handleZombieDeath(z, hitDir, onDropPickup) {
    if (z.dead) return;
    z.dead = true;
    z.deathTimer = 0;
    z.fallAngle = 0;
    _totalKills++;
    if (_headEyeAttr) {
      _headEyeAttr.setXYZ(z.id, 0, 0, 0);
      _headEyeAttr.needsUpdate = true;
    }

    if (hitDir) {
      z.vx += hitDir.x * 3.5;
      z.vz += hitDir.z * 3.5;
    }

    _v1.set(z.x, z.y + 1.1, z.z);
    play3D('zombie_death', _v1, 0.14, 0.95);

    if (z.variant === 'spitter') {
      const cfg = getEnemyCfg('spitter');
      if (LRT.Weapons && typeof LRT.Weapons.applyExplosion === 'function') {
        LRT.Weapons.applyExplosion(_v1, cfg.deathBlastRadius || 3.6, cfg.deathBlastDmg || 32, 9.0, true);
      }
    }

    if (typeof onDropPickup === 'function') {
      const dropChance = z.variant === 'brute' ? 0.85 : z.variant === 'spitter' ? 0.45 : 0.28;
      if (Math.random() < dropChance) {
        const dropType = (z.variant === 'brute' || Math.random() < 0.35) ? 'health' : 'ammo';
        onDropPickup({ x: z.x, y: z.y + 0.35, z: z.z }, dropType);
      }
    }
  }

  function applyDamageToZombie(z, dmg, hitPoint, hitDir, knockbackForce, isHeadshot, onDropPickup) {
    if (!z || !z.active || z.dead) return { hit: false, killed: false, armored: false };

    let finalDmg = dmg;
    let armoredHit = false;

    if (z.variant === 'brute' && z.hasArmor) {
      if (!isHeadshot) {
        armoredHit = true;
        finalDmg = Math.round(dmg * 0.5);
        z.armorHp -= dmg;
        _v1.set(hitPoint ? hitPoint.x : z.x, hitPoint ? hitPoint.y : (z.y + 1.25), hitPoint ? hitPoint.z : z.z);
        if (LRT.Weapons && typeof LRT.Weapons.spawnSparks === 'function') {
          LRT.Weapons.spawnSparks(_v1, 10);
        }
        play3D('impact_metal', _v1, 0.12, 0.55);
      } else {
        z.armorHp -= dmg * 1.35;
      }
      if (z.armorHp <= 0) {
        z.hasArmor = false;
        _v2.set(z.x, z.y + 1.25, z.z);
        if (LRT.Weapons) {
          if (typeof LRT.Weapons.spawnSparks === 'function') LRT.Weapons.spawnSparks(_v2, 14);
          if (typeof LRT.Weapons.spawnRubble === 'function') LRT.Weapons.spawnRubble(_v2, 6);
        }
        play3D('debris_crumble', _v2, 0.1, 0.9);
      }
    }

    z.hp -= finalDmg;
    z.hitFlashTimer = 0.085;

    const kb = (knockbackForce || 1.5) / (z.variant === 'brute' ? 2.6 : 1.0);
    if (hitDir) {
      z.vx += hitDir.x * kb;
      z.vz += hitDir.z * kb;
    }
    z.staggerTimer = Math.max(z.staggerTimer, Math.min(0.5, 0.14 + kb * 0.05));

    applyZombieColors(z);
    markColorsDirty();

    if (z.hp <= 0) {
      handleZombieDeath(z, hitDir, onDropPickup);
      return { hit: true, killed: true, armored: armoredHit };
    }
    return { hit: true, killed: false, armored: armoredHit };
  }

  let _cachedOnDropPickup = null;

  function hitZombie(zombieId, dmg, hitPoint, hitDir, knockbackForce, isHeadshot) {
    const z = _zombies[zombieId];
    return applyDamageToZombie(z, dmg, hitPoint, hitDir, knockbackForce, isHeadshot, _cachedOnDropPickup);
  }

  function applyBlast(origin, radius, maxDmg, force) {
    if (!origin) return;
    const rad = radius || 6.5;
    const dmgMax = maxDmg || 280;
    const imp = force || 18.0;

    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = _zombies[i];
      if (!z.active || z.dead) continue;
      const dx = z.x - origin.x;
      const dy = (z.y + 0.9 * z.scale) - origin.y;
      const dz = z.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist >= rad) continue;

      const falloff = Math.max(0.15, 1.0 - dist / rad);
      const d = Math.round(dmgMax * falloff);

      if (z.variant === 'brute' && z.hasArmor) {
        z.armorHp -= d * 1.8;
      }

      if (dist > 0.05) {
        _v3.set(dx / dist, Math.max(0.25, dy / dist), dz / dist).normalize();
      } else {
        _v3.set(0, 1, 0);
      }

      const res = applyDamageToZombie(z, d, origin, _v3, imp * falloff, false, _cachedOnDropPickup);
      if (res.hit && LRT.Weapons && typeof LRT.Weapons.spawnBlood === 'function') {
        _v4.set(z.x, z.y + 1.0 * z.scale, z.z);
        LRT.Weapons.spawnBlood(_v4, _v3, 8);
      }
    }
  }

  function raycastHit(origin, dir, maxDist) {
    _rayOrig.set(origin.x, origin.y, origin.z);
    _rayDir.set(dir.x, dir.y, dir.z).normalize();
    let best = null;
    let bestDist = maxDist !== undefined ? maxDist : 200;

    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = _zombies[i];
      if (!z.active || z.dead) continue;
      const sc = z.scale;

      // 1. Head sphere test (matched to hunched anatomy)
      const leanFwd = (z.variant === 'runner' || z.variant === 'screamer') ? 0.26 * sc : 0.12 * sc;
      const hx = z.x + Math.sin(z.yaw) * leanFwd;
      const hy = z.y + (z.variant === 'runner' ? 1.42 : (z.variant === 'screamer' ? 1.46 : 1.56)) * sc;
      const hz = z.z + Math.cos(z.yaw) * leanFwd;
      const hr = 0.24 * sc;

      const ocx = _rayOrig.x - hx;
      const ocy = _rayOrig.y - hy;
      const ocz = _rayOrig.z - hz;
      const hb = ocx * _rayDir.x + ocy * _rayDir.y + ocz * _rayDir.z;
      const hc = ocx * ocx + ocy * ocy + ocz * ocz - hr * hr;
      const hDisc = hb * hb - hc;
      if (hDisc >= 0) {
        const t = -hb - Math.sqrt(hDisc);
        if (t >= 0 && t < bestDist) {
          bestDist = t;
          const px = _rayOrig.x + _rayDir.x * t;
          const py = _rayOrig.y + _rayDir.y * t;
          const pz = _rayOrig.z + _rayDir.z * t;
          best = {
            dist: t,
            point: new THREE.Vector3(px, py, pz),
            normal: new THREE.Vector3((px - hx) / hr, (py - hy) / hr, (pz - hz) / hr),
            zombieId: z.id,
            variant: z.variant,
            isHeadshot: true,
            isArmor: false
          };
          continue;
        }
      }

      // 2. Torso/Legs vertical segment capsule test
      const ax = z.x, ay = z.y + 0.22 * sc, az = z.z;
      const bx = z.x, by = z.y + 1.38 * sc, bz = z.z;
      const segLen = by - ay;
      const tr = (z.variant === 'brute' ? 0.44 : 0.36) * sc;

      const w0x = _rayOrig.x - ax;
      const w0y = _rayOrig.y - ay;
      const w0z = _rayOrig.z - az;
      const bCoef = _rayDir.y;
      const dCoef = _rayDir.x * w0x + _rayDir.y * w0y + _rayDir.z * w0z;
      const eCoef = w0y;
      const denom = 1 - bCoef * bCoef;

      let tNear, sNear;
      if (denom < 1e-5) {
        sNear = Math.max(0, Math.min(segLen, eCoef));
        tNear = Math.max(0, -dCoef + bCoef * sNear);
      } else {
        tNear = Math.max(0, (bCoef * eCoef - dCoef) / denom);
        sNear = bCoef * tNear + eCoef;
        if (sNear < 0) { sNear = 0; tNear = Math.max(0, -dCoef); }
        else if (sNear > segLen) { sNear = segLen; tNear = Math.max(0, -dCoef + bCoef * segLen); }
      }

      const rx = _rayOrig.x + _rayDir.x * tNear - ax;
      const ry = _rayOrig.y + _rayDir.y * tNear - (ay + sNear);
      const rz = _rayOrig.z + _rayDir.z * tNear - az;
      const distSq = rx * rx + ry * ry + rz * rz;
      if (distSq <= tr * tr) {
        const entryOffset = Math.sqrt(Math.max(0, tr * tr - distSq));
        const tHit = Math.max(0, tNear - entryOffset);
        if (tHit < bestDist) {
          bestDist = tHit;
          const px = _rayOrig.x + _rayDir.x * tHit;
          const py = _rayOrig.y + _rayDir.y * tHit;
          const pz = _rayOrig.z + _rayDir.z * tHit;
          _v1.set(px - ax, py - (ay + sNear), pz - az).normalize();
          best = {
            dist: tHit,
            point: new THREE.Vector3(px, py, pz),
            normal: _v1.clone(),
            zombieId: z.id,
            variant: z.variant,
            isHeadshot: false,
            isArmor: z.variant === 'brute' && z.hasArmor
          };
        }
      }
    }

    return best;
  }

  function updateZombieMatrices(z, timeSec) {
    if (!z.active) return;
    const idx = z.id;

    const sc = z.scale;
    const widthMult = z.variant === 'brute' ? 1.24 : (z.variant === 'runner' ? 0.90 : 0.98);
    let sinkY = 0;
    let scaleDecay = 1.0;

    if (z.dead) {
      const collapseT = Math.min(1.0, z.deathTimer / 0.36);
      z.fallAngle = collapseT * (Math.PI * 0.48) * z.fallSign;
      if (z.deathTimer > 0.45) {
        const fadeT = Math.min(1.0, (z.deathTimer - 0.45) / 0.85);
        sinkY = -0.34 * fadeT;
        scaleDecay = Math.max(0.01, 1.0 - fadeT);
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
    if (z.staggerTimer > 0 && !z.dead) torsoPitch -= 0.30 * (z.staggerTimer / 0.35);
    if (z.chargeWindup > 0 && !z.dead) torsoPitch += 0.24;
    if (z.shriekTimer > 0 && !z.dead) torsoPitch = -0.16;

    const torsoRoll = z.dead
      ? 0
      : (z.variant === 'walker' ? (Math.sin(phase) * 0.14 + limp * 0.08)
        : z.variant === 'spitter' ? (Math.sin(timeSec * 4.5 + z.seed) * 0.08 + limp * 0.10)
        : Math.sin(phase) * 0.06);

    const walkBob = z.dead ? 0 : Math.abs(Math.sin(phase)) * (z.variant === 'runner' ? 0.065 : 0.04) * s;
    const hipHeight = z.dead
      ? (0.76 * s * Math.cos(z.fallAngle * 0.92) + 0.14)
      : (0.77 * s - (z.variant === 'runner' ? 0.05 * s : 0) + walkBob);

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

    for (const side of [-1, 1]) {
      const isStrongSide = (side === limp);
      const uaMesh = side < 0 ? _upperArmLMesh : _upperArmRMesh;
      const faMesh = side < 0 ? _forearmLMesh : _forearmRMesh;

      let uaPitch, elbowFlex, uaRoll;
      if (z.shriekTimer > 0 && !z.dead) {
        uaPitch = -1.25;
        elbowFlex = 0.82;
        uaRoll = side * -0.62 + Math.sin(timeSec * 32.0) * 0.08;
      } else if (z.dead) {
        uaPitch = -0.35 + side * 0.25;
        elbowFlex = 0.28;
        uaRoll = side * -0.45;
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

    for (const side of [-1, 1]) {
      const thighMesh = side < 0 ? _thighLMesh : _thighRMesh;
      const calfMesh = side < 0 ? _calfLMesh : _calfRMesh;
      const legPhase = side < 0 ? phase : (phase + Math.PI);

      // Asymmetric walker drag on injured leg
      const dragMult = (!z.dead && z.variant === 'walker' && side !== limp) ? 0.62 : 1.0;
      const thighPitch = z.dead
        ? (z.fallAngle * 0.8 + side * 0.12)
        : (Math.sin(legPhase) * thighSwingAmp * dragMult - (z.variant === 'runner' ? 0.15 : 0));
      // Positive X rotation bends lower leg BACKWARD cleanly at the knee
      const kneeFlex = z.dead
        ? 0.18
        : Math.max(0.06, Math.sin(legPhase + 1.15) * kneeAmp + (z.variant === 'runner' ? 0.24 : 0.12));

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

  let _elapsed = 0;

  function update(dt, playerPos, spatialGrid, trainColliders, onPlayerHit, onDropPickup) {
    if (!_initialized) return;
    const step = Math.min(dt || 0.016, 0.05);
    _elapsed += step;
    _cachedOnDropPickup = onDropPickup || null;

    if (LRT.PlayerUI && typeof LRT.PlayerUI.getCamera === 'function') {
      const cam = LRT.PlayerUI.getCamera();
      if (cam) {
        cam.getWorldPosition(_camPos);
        _camRight.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      }
    } else if (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') {
      const ps = LRT.PlayerUI.getState();
      const pPos = (ps && ps.pos) || playerPos;
      if (pPos) _camPos.set(pPos.x, pPos.y + 1.6, pPos.z);
      const yaw = ps && typeof ps.yaw === 'number' ? ps.yaw : 0;
      _camRight.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
    } else if (playerPos) {
      _camPos.set(playerPos.x, playerPos.y + 1.6, playerPos.z);
      _camRight.set(1, 0, 0);
    }

    if (_pendingQueue.length > 0) {
      let activeCount = 0;
      for (let i = 0; i < MAX_ENEMIES; i++) {
        if (_zombies[i].active) activeCount++;
      }
      while (_pendingQueue.length > 0 && activeCount < MAX_ENEMIES) {
        const nextVar = _pendingQueue[0];
        const pt = pickNextNode(playerPos);
        if (spawnOneZombie(nextVar, pt)) {
          _pendingQueue.shift();
          activeCount++;
        } else {
          break;
        }
      }
    }

    let initHighWater = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (_zombies[i].active || _zombies[i].dead) initHighWater = i + 1;
    }
    _activeHighWater = initHighWater;

    // Count living zombies and emit clear directional + distance cues (round-robin + straggler/closest priority)
    let aliveCount = 0;
    let closestZ = null;
    let closestDistSq = Infinity;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = _zombies[i];
      if (!z.active || z.dead) continue;
      aliveCount++;
      if (playerPos) {
        const dx = z.x - playerPos.x, dy = z.y - (playerPos.y || 0), dz = z.z - playerPos.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          closestZ = z;
        }
      }
    }

    const isStraggler = (aliveCount > 0 && aliveCount <= 3 && _pendingQueue.length === 0);
    _groanTimer -= step;
    if (_groanTimer <= 0 && aliveCount > 0) {
      const fewLeft = aliveCount <= 4 || isStraggler;
      _groanTimer = fewLeft ? (1.15 + Math.random() * 0.85) : (1.75 + Math.random() * 1.45);
      let chosen = null;
      if (fewLeft && closestZ) {
        chosen = closestZ;
      } else {
        for (let k = 0; k < MAX_ENEMIES; k++) {
          const idx = (_groanCursor + k) % MAX_ENEMIES;
          const z = _zombies[idx];
          if (z.active && !z.dead) {
            chosen = z;
            _groanCursor = (idx + 1) % MAX_ENEMIES;
            break;
          }
        }
      }
      if (chosen) {
        _v1.set(chosen.x, chosen.y + 1.4, chosen.z);
        play3D(
          Math.random() > 0.5 ? 'zombie_groan_1' : 'zombie_groan_2',
          _v1,
          0.14,
          fewLeft ? 0.82 : 0.68,
          { refDist: fewLeft ? 8.5 : 6.0, maxDist: 92.0 }
        );
      }
    }

    _stepAudioTimer -= step;
    if (_stepAudioTimer <= 0 && closestZ && closestDistSq < 784.0) {
      const dClosest = Math.sqrt(closestDistSq);
      _stepAudioTimer = closestZ.variant === 'runner' ? 0.28 : 0.44;
      _stepAlternate = !_stepAlternate;
      _v1.set(closestZ.x, closestZ.y + 0.15, closestZ.z);
      play3D(
        _stepAlternate ? 'footstep_concrete_1' : 'footstep_concrete_2',
        _v1,
        0.12,
        dClosest < 10 ? 0.44 : 0.34,
        { refDist: 4.0, maxDist: 28.0 }
      );
    }

    let colorDirty = false;
    let deactivationDirty = false;
    const tc = Array.isArray(trainColliders)
      ? trainColliders
      : ((LRT.Train && typeof LRT.Train.getColliders === 'function') ? LRT.Train.getColliders() : null);

    for (let i = 0; i < _activeHighWater; i++) {
      const z = _zombies[i];
      if (!z.active) {
        continue;
      }

      if (z.hitFlashTimer > 0) {
        z.hitFlashTimer -= step;
        if (z.hitFlashTimer <= 0) {
          z.hitFlashTimer = 0;
          applyZombieColors(z);
          colorDirty = true;
        }
      }

      if (z.dead) {
        z.deathTimer += step;
        z.x += z.vx * step;
        z.z += z.vz * step;
        z.vx *= Math.max(0, 1 - step * 6.0);
        z.vz *= Math.max(0, 1 - step * 6.0);
        if (z.deathTimer >= 1.30) {
          z.active = false;
          z.dead = false;
          zeroZombieMatrices(z.id);
          deactivationDirty = true;
          continue;
        }
        updateZombieMatrices(z, _elapsed);
        continue;
      }

      if (z.staggerTimer > 0) z.staggerTimer = Math.max(0, z.staggerTimer - step);
      if (z.attackTimer > 0) z.attackTimer = Math.max(0, z.attackTimer - step);
      if (z.spitTimer > 0) z.spitTimer = Math.max(0, z.spitTimer - step);
      if (z.lureTimer > 0) z.lureTimer = Math.max(0, z.lureTimer - step);
      if (z.buffTimer > 0) z.buffTimer = Math.max(0, z.buffTimer - step);
      if (z.screamTimer > 0) z.screamTimer = Math.max(0, z.screamTimer - step);
      if (z.shriekTimer > 0) z.shriekTimer = Math.max(0, z.shriekTimer - step);
      if (z.chargeCooldown > 0) z.chargeCooldown = Math.max(0, z.chargeCooldown - step);

      z.x += z.vx * step;
      z.z += z.vz * step;
      z.vx *= Math.max(0, 1 - step * 7.5);
      z.vz *= Math.max(0, 1 - step * 7.5);

      const hasTarget = !!(playerPos || z.lureTimer > 0);
      if (hasTarget) {
        const targetX = (z.lureTimer > 0) ? z.lurePosX : playerPos.x;
        const targetY = (z.lureTimer > 0) ? z.lurePosY : (playerPos.y || 0);
        const targetZ = (z.lureTimer > 0) ? z.lurePosZ : playerPos.z;

        const pdx = targetX - z.x;
        const pdy = targetY - z.y;
        const pdz = targetZ - z.z;
        const distHoriz = Math.sqrt(pdx * pdx + pdz * pdz);
        const dist3D = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);

        if (z.lureTimer > 0 && distHoriz < 1.5) {
          z.lureTimer = 0;
        }

        // Refresh multi-level/street A* waypoint periodically or on reaching current waypoint
        z.navTimer -= step;
        const reachedWp = z.hasNavWp && Math.hypot(z.wpX - z.x, z.wpZ - z.z) < 1.25 && Math.abs(z.wpY - z.y) < 0.85;
        const activelyClimbing = z.hasNavWp && (z.wpY - z.y) > 0.25 && Math.hypot(z.wpX - z.x, z.wpZ - z.z) < 6.5;
        if (reachedWp || (z.navTimer <= 0 && !activelyClimbing)) {
          z.navTimer = 0.36 + (i % 5) * 0.04;
          solveNavWaypoint(z, targetX, targetY, targetZ, spatialGrid);
        }

        const goalX = z.hasNavWp ? z.wpX : targetX;
        const goalZ = z.hasNavWp ? z.wpZ : targetZ;
        const dx = goalX - z.x;
        const dz = goalZ - z.z;

        const targetYaw = Math.atan2(dx, dz);
        let diffYaw = targetYaw - z.yaw;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        z.yaw += diffYaw * Math.min(1, step * 8.0);

        if (z.alertDelay <= 0) {
          gatherNearbyColliders(z.x, z.z, 2.8, spatialGrid, tc);
        }

        // 1. Screamer shriek & frenzy buff
        if (z.variant === 'screamer' && playerPos && z.screamTimer <= 0 && z.shriekTimer <= 0 && z.staggerTimer <= 0 && dist3D <= 22.0) {
          _v1.set(z.x, z.y + 1.45 * z.scale, z.z);
          _v2.set(playerPos.x - _v1.x, (playerPos.y + 1.2) - _v1.y, playerPos.z - _v1.z).normalize();
          let losBlocked = false;
          if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
            const hit = LRT.Station.raycastWorld(_v1, _v2, dist3D - 0.5);
            if (hit) losBlocked = true;
          }
          if (!losBlocked) {
            z.shriekTimer = 0.55;
            const cfg = getEnemyCfg('screamer');
            z.screamTimer = (cfg && cfg.screamCooldown) ? cfg.screamCooldown : 7.5;
            play3D('zombie_groan_2', _v1, 0.04, 1.0, { rate: 1.42, refDist: 8.0, maxDist: 96.0 });
            const screamRad = (cfg && cfg.screamRadius) ? cfg.screamRadius : 24.0;
            for (let k = 0; k < _activeHighWater; k++) {
              const other = _zombies[k];
              if (!other.active || other.dead) continue;
              const dScream = Math.hypot(other.x - z.x, other.z - z.z);
              if (dScream <= screamRad) {
                other.buffTimer = Math.max(other.buffTimer || 0, 4.5);
              }
            }
          }
        }

        // 2. Brute telegraphed charge windup
        if (z.variant === 'brute' && !z.dead && z.staggerTimer <= 0 && z.chargeWindup <= 0 && z.chargeTimer <= 0 && z.chargeCooldown <= 0 && !z.hasNavWp && playerPos) {
          if (distHoriz >= 5.0 && distHoriz <= 14.0 && Math.abs(pdy) <= 0.85) {
            _v1.set(z.x, z.y + 1.35 * z.scale, z.z);
            _v2.set(playerPos.x - _v1.x, (playerPos.y + 1.2) - _v1.y, playerPos.z - _v1.z).normalize();
            let losBlocked = false;
            if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
              const hit = LRT.Station.raycastWorld(_v1, _v2, distHoriz - 0.5);
              if (hit) losBlocked = true;
            }
            if (!losBlocked) {
              z.chargeWindup = 0.65;
              z.chargeCooldown = 5.5 + Math.random() * 2.0;
              z.chargeDirX = pdx / distHoriz;
              z.chargeDirZ = pdz / distHoriz;
              z.yaw = Math.atan2(pdx, pdz);
              play3D('zombie_groan_1', _v1, 0.05, 1.1, { rate: 0.72, refDist: 8.0, maxDist: 88.0 });
            }
          }
        }
        if (z.chargeWindup > 0) {
          z.chargeWindup -= step;
          if (z.chargeWindup <= 0) {
            z.chargeTimer = 1.15;
            _v1.set(z.x, z.y + 0.15, z.z);
            play3D('footstep_metal', _v1, 0.08, 0.9);
          }
        }
        if (z.chargeTimer > 0) {
          z.chargeTimer -= step;
        }

        // 3. Movement speed with buffs & straggler rush
        let moveSpd = z.staggerTimer > 0 ? z.speed * 0.22 : z.speed;
        if (z.buffTimer > 0) moveSpd *= 1.22;
        if (isStraggler) moveSpd *= 1.25;
        if (z.chargeTimer > 0) moveSpd = z.speed * 2.1;
        if (z.shriekTimer > 0 || z.chargeWindup > 0) moveSpd = 0;

        // 4. Spitter active backpedaling when player pushes inside 5.5m
        let isBackpedaling = false;
        let backpedalAng = 0;
        if (z.variant === 'spitter' && !z.hasNavWp && dist3D < 5.5 && Math.abs(pdy) <= 0.85 && z.staggerTimer <= 0 && playerPos) {
          _v1.set(z.x, z.y + 1.45 * z.scale, z.z);
          _v2.set(playerPos.x - _v1.x, (playerPos.y + 1.2) - _v1.y, playerPos.z - _v1.z).normalize();
          let losBlocked = false;
          if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
            const hit = LRT.Station.raycastWorld(_v1, _v2, dist3D - 0.5);
            if (hit) losBlocked = true;
          }
          if (!losBlocked) {
            const away = Math.atan2(-pdx, -pdz);
            const rad = 0.38 * z.scale;
            const tryBack = [away, away + 0.65, away - 0.65];
            for (let ba = 0; ba < tryBack.length; ba++) {
              const bang = tryBack[ba];
              const bpx = z.x + Math.sin(bang) * 0.95;
              const bpz = z.z + Math.cos(bang) * 0.95;
              if (!isBlockedAt(bpx, z.y, bpz, rad)) {
                backpedalAng = bang;
                isBackpedaling = true;
                break;
              }
            }
          }
        }

        const stopDist = (z.variant === 'spitter' && !z.hasNavWp && Math.abs(pdy) <= 1.2) ? 7.5 : (z.attackRange * 0.82);

        if ((dist3D > stopDist || isBackpedaling || z.chargeTimer > 0) && z.alertDelay <= 0 && z.shriekTimer <= 0 && z.chargeWindup <= 0) {
          let baseAng = Math.atan2(dx, dz);
          if (z.chargeTimer > 0) {
            baseAng = Math.atan2(z.chargeDirX, z.chargeDirZ);
            z.yaw = baseAng;
          } else if (isBackpedaling) {
            baseAng = backpedalAng;
            if (playerPos) z.yaw = Math.atan2(pdx, pdz);
          } else if (z.variant === 'walker') {
            if (dist3D >= 3.2) {
              baseAng += Math.sin(z.animPhase * 0.7 + z.seed) * 0.18 * z.limbBias;
            } else if (dist3D < 3.2 && dist3D > z.attackRange) {
              moveSpd *= 1.35;
            }
          } else if (z.variant === 'runner' && distHoriz > 4.2 && !z.hasNavWp) {
            const flankOffset = z.steerDir * Math.min(0.52, 2.2 / distHoriz);
            baseAng += flankOffset;
          }

          const rad = 0.38 * z.scale;
          let chosenAng = baseAng;
          let foundClear = false;

          if (z.chargeTimer > 0) {
            const cpx = z.x + z.chargeDirX * 0.75;
            const cpz = z.z + z.chargeDirZ * 0.75;
            if (isBlockedAt(cpx, z.y, cpz, 0.46 * z.scale)) {
              z.chargeTimer = 0;
              z.staggerTimer = 0.7;
              _v1.set(cpx, z.y + 1.25, cpz);
              play3D('impact_metal', _v1, 0.1, 0.85);
              if (LRT.Weapons && typeof LRT.Weapons.spawnSparks === 'function') LRT.Weapons.spawnSparks(_v1, 14);
              if (LRT.Weapons && typeof LRT.Weapons.spawnRubble === 'function') LRT.Weapons.spawnRubble(_v1, 8);
              moveSpd = 0;
            } else {
              chosenAng = baseAng;
              foundClear = true;
            }
          } else if (isBackpedaling) {
            chosenAng = baseAng;
            foundClear = true;
            moveSpd = z.speed * 0.95;
          } else {
            const tryAngles = z.steerCommit > 0
              ? [baseAng + z.steerDir * 0.72, baseAng + z.steerDir * 1.25, baseAng]
              : [baseAng, baseAng + 0.62 * z.steerDir, baseAng - 0.62 * z.steerDir, baseAng + 1.18 * z.steerDir, baseAng - 1.18 * z.steerDir];

            for (let a = 0; a < tryAngles.length; a++) {
              const ang = tryAngles[a];
              const px = z.x + Math.sin(ang) * 0.95;
              const pz = z.z + Math.cos(ang) * 0.95;
              if (!isBlockedAt(px, z.y, pz, rad)) {
                chosenAng = ang;
                foundClear = true;
                break;
              }
            }

            if (z.steerCommit > 0) z.steerCommit -= step;
            if (!foundClear) {
              z.blockedTime += step;
              if (z.blockedTime > 0.35) {
                z.steerDir *= -1;
                z.steerCommit = 0.85;
                z.blockedTime = 0;
                z.navTimer = 0; // force re-plan around obstacle
              }
              moveSpd *= 0.4;
            } else if (chosenAng !== baseAng) {
              z.steerCommit = 0.35;
            }
          }

          let mx = Math.sin(chosenAng) * moveSpd;
          let mz = Math.cos(chosenAng) * moveSpd;

          for (let j = 0; j < _activeHighWater; j++) {
            if (i === j) continue;
            const other = _zombies[j];
            if (!other.active || other.dead) continue;
            const sx = z.x - other.x;
            const sz = z.z - other.z;
            const dSq = sx * sx + sz * sz;
            if (dSq > 1e-4 && dSq < 0.78) {
              const d = Math.sqrt(dSq);
              const push = (0.88 - d) * 3.4;
              mx += (sx / d) * push;
              mz += (sz / d) * push;
            }
          }

          z.x += mx * step;
          z.z += mz * step;
          z.animPhase += step * (3.4 + moveSpd * 1.9);
        } else {
          z.animPhase += step * 2.2;
        }

        if (z.alertDelay <= 0) {
          resolveCollisions(z, 0.38 * z.scale, step);
        }

        // Net-progress stuck recovery so stragglers never stall indefinitely on rails or corners
        z.progTimer += step;
        if (z.progTimer >= 1.2) {
          const moved = Math.hypot(z.x - z.lastProgX, z.z - z.lastProgZ);
          z.lastProgX = z.x;
          z.lastProgZ = z.z;
          z.progTimer = 0;
          if (moved < 0.35 && dist3D > stopDist + 0.5 && z.alertDelay <= 0) {
            z.stuckTime += 1.2;
            z.navTimer = 0;
            z.steerDir *= -1;
            if (z.stuckTime >= 2.4 && z.hasNavWp) {
              // Nudge cleanly along active A* waypoint if jammed against minor lip/prop
              const nx = z.wpX - z.x, nz = z.wpZ - z.z;
              const nd = Math.hypot(nx, nz) || 1;
              const stepDist = Math.min(1.6, nd);
              z.x += (nx / nd) * stepDist;
              z.z += (nz / nd) * stepDist;
              if (Math.abs(z.wpY - z.y) < 1.25) z.y = z.wpY;
              z.stuckTime = 0;
            }
          } else {
            z.stuckTime = 0;
          }
        }

        if (dist3D <= z.attackRange && z.attackTimer <= 0 && z.staggerTimer <= 0 && z.shriekTimer <= 0 && z.chargeWindup <= 0) {
          z.attackTimer = z.attackCooldown;
          const isChargingHit = z.chargeTimer > 0;
          if (isChargingHit) z.chargeTimer = 0;
          _v1.set(z.x, z.y + 1.3, z.z);
          play3D('zombie_attack', _v1, 0.14, 0.95);
          if (typeof onPlayerHit === 'function') {
            const hitDmg = isChargingHit ? Math.round(z.damage * 1.5) : z.damage;
            onPlayerHit(hitDmg, _v1);
          }
        }

        // Train siege during TRAIN_BOARDING: zombies batter train doors/hull if player is boarded
        if (LRT.Train && typeof LRT.Train.getState === 'function' && LRT.Train.getState() === 'BOARDED_WAIT') {
          const playerInTrain = (typeof LRT.Train.isPlayerInside === 'function' && playerPos && LRT.Train.isPlayerInside(playerPos));
          if (playerInTrain && z.attackTimer <= 0 && z.staggerTimer <= 0) {
            let distToTrain = 999;
            if (tc && tc.length > 0) {
              for (let c = 0; c < tc.length; c++) {
                const b = tc[c];
                if (!b) continue;
                const minX = b.min ? b.min.x : b.minX;
                const maxX = b.max ? b.max.x : b.maxX;
                const minZ = b.min ? b.min.z : b.minZ;
                const maxZ = b.max ? b.max.z : b.maxZ;
                const cx = Math.max(minX, Math.min(z.x, maxX));
                const cz = Math.max(minZ, Math.min(z.z, maxZ));
                const d = Math.hypot(z.x - cx, z.z - cz);
                if (d < distToTrain) distToTrain = d;
              }
            }
            if (distToTrain <= 2.2) {
              z.attackTimer = z.attackCooldown;
              _v1.set(z.x, z.y + 1.25, z.z);
              play3D('zombie_attack', _v1, 0.14, 0.95);
              if (typeof LRT.Train.applyDamage === 'function') {
                LRT.Train.applyDamage(_v1, 1.2, z.damage * 1.4, 4.0);
              }
            }
          }
        }

        if (z.variant === 'spitter' && dist3D >= 4.5 && dist3D <= 14.5 && z.spitTimer <= 0 && z.staggerTimer <= 0) {
          _v1.set(z.x, z.y + 1.48 * z.scale, z.z);
          _v2.set(playerPos.x - _v1.x, (playerPos.y + 1.25) - _v1.y, playerPos.z - _v1.z).normalize();
          let blocked = false;
          if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
            const wallHit = LRT.Station.raycastWorld(_v1, _v2, dist3D - 0.6);
            if (wallHit) blocked = true;
          }
          if (!blocked && LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
            const trainHit = LRT.Train.raycastTrain(_v1, _v2, dist3D - 0.6);
            if (trainHit && !trainHit.isGlass && trainHit.material !== 'glass' && trainHit.type !== 'glass') blocked = true;
          }
          if (!blocked) {
            z.spitTimer = 3.2 + Math.random() * 0.9;
            spawnBileProjectile(z, playerPos);
          } else {
            z.spitTimer = 0.6;
          }
        }
      }

      updateZombieMatrices(z, _elapsed);
    }

    // Update Spitter bile projectiles
    let anyBile = false;
    for (let i = 0; i < MAX_BILE; i++) {
      const b = _bileOrbs[i];
      if (!b.active) {
        if (_bileMesh) _bileMesh.setMatrixAt(i, _zeroMat);
        continue;
      }
      anyBile = true;
      b.life += step;
      b.vel.y -= 9.8 * step;
      const stepDist = b.vel.length() * step;
      _v1.copy(b.vel).normalize();

      let hitPoint = null;
      if (playerPos) {
        const dx = b.pos.x - playerPos.x;
        const dy = b.pos.y - (playerPos.y + 1.0);
        const dz = b.pos.z - playerPos.z;
        if (dx * dx + dy * dy + dz * dz < 0.72) {
          hitPoint = b.pos.clone();
        }
      }
      if (!hitPoint && LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
        const wh = LRT.Station.raycastWorld(b.pos, _v1, stepDist + 0.15);
        if (wh) hitPoint = wh.point;
      }
      if (!hitPoint && LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
        const th = LRT.Train.raycastTrain(b.pos, _v1, stepDist + 0.15);
        if (th) hitPoint = th.point;
      }

      b.pos.addScaledVector(b.vel, step);

      if (hitPoint || b.pos.y <= -1.3 || b.life > 3.5) {
        b.active = false;
        if (_bileMesh) _bileMesh.setMatrixAt(i, _zeroMat);
        const impact = hitPoint || b.pos;
        if (LRT.Weapons && typeof LRT.Weapons.spawnSparks === 'function') {
          LRT.Weapons.spawnSparks(impact, 10);
        }
        play3D('debris_crumble', impact, 0.2, 0.65);
        if (playerPos && typeof onPlayerHit === 'function') {
          const dx = impact.x - playerPos.x;
          const dy = impact.y - (playerPos.y + 1.0);
          const dz = impact.z - playerPos.z;
          if (dx * dx + dy * dy + dz * dz < 4.8) {
            onPlayerHit(15, impact);
          }
        }
      } else if (_bileMesh) {
        _q1.identity();
        _scale.setScalar(1.0 + Math.sin(_elapsed * 16 + i) * 0.18);
        _m4.compose(b.pos, _q1, _scale);
        _bileMesh.setMatrixAt(i, _m4);
      }
    }

    if (_bileMesh) {
      _bileMesh.visible = anyBile;
      if (anyBile) _bileMesh.instanceMatrix.needsUpdate = true;
    }

    let highWater = 0;
    let hasBruteArmor = false;
    let hasBio = false;
    let hasRag = false;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = _zombies[i];
      if (z.active || z.dead) {
        highWater = i + 1;
        if (z.variant === 'brute' && z.hasArmor && !z.dead) hasBruteArmor = true;
        if ((z.variant === 'spitter' || z.variant === 'screamer') && !z.dead) hasBio = true;
        if ((z.variant === 'walker' || z.variant === 'runner') && !z.dead) hasRag = true;
      }
    }
    _activeHighWater = highWater;

    const coreMeshes = [
      _headMesh, _torsoMesh, _upperArmLMesh, _upperArmRMesh,
      _forearmLMesh, _forearmRMesh, _thighLMesh, _thighRMesh,
      _calfLMesh, _calfRMesh
    ];
    for (let m = 0; m < coreMeshes.length; m++) {
      if (coreMeshes[m]) {
        coreMeshes[m].count = _activeHighWater;
      }
    }

    if (_bruteArmorMesh) {
      _bruteArmorMesh.visible = _warmupActive || hasBruteArmor;
      _bruteArmorMesh.count = _activeHighWater;
    }
    if (_bruteHelmetMesh) {
      _bruteHelmetMesh.visible = _warmupActive || hasBruteArmor;
      _bruteHelmetMesh.count = _activeHighWater;
    }
    if (_spitterBioMesh) {
      _spitterBioMesh.visible = _warmupActive || hasBio;
      _spitterBioMesh.count = _activeHighWater;
    }
    if (_ragMesh) {
      _ragMesh.visible = _warmupActive || hasRag;
      _ragMesh.count = _activeHighWater;
    }

    const allMeshes = [
      _headMesh, _torsoMesh, _upperArmLMesh, _upperArmRMesh,
      _forearmLMesh, _forearmRMesh, _thighLMesh, _thighRMesh,
      _calfLMesh, _calfRMesh, _bruteArmorMesh, _bruteHelmetMesh,
      _spitterBioMesh, _ragMesh
    ];
    const needsMatUpdate = _activeHighWater > 0 || deactivationDirty;
    if (needsMatUpdate) {
      for (let m = 0; m < allMeshes.length; m++) {
        if (allMeshes[m]) allMeshes[m].instanceMatrix.needsUpdate = true;
      }
    }
    if (colorDirty) markColorsDirty();
  }

  function getAliveCount() {
    let alive = _pendingQueue.length;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (_zombies[i].active && !_zombies[i].dead) alive++;
    }
    return alive;
  }

  function getTotalCount() {
    return _waveTotalCount;
  }

  function getSpawnedSpitterProjectiles() {
    const out = [];
    for (let i = 0; i < MAX_BILE; i++) {
      if (_bileOrbs[i].active) {
        out.push({ pos: _bileOrbs[i].pos, vel: _bileOrbs[i].vel, active: true });
      }
    }
    return out;
  }

  function getDebugSummary() {
    const list = [];
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = _zombies[i];
      if (!z.active || z.dead) continue;
      list.push({
        id: z.id,
        variant: z.variant,
        x: +z.x.toFixed(2),
        y: +z.y.toFixed(2),
        z: +z.z.toFixed(2),
        hp: z.hp,
        armorHp: z.armorHp,
        hasNavWp: z.hasNavWp,
        wp: z.hasNavWp ? { x: +z.wpX.toFixed(2), y: +z.wpY.toFixed(2), z: +z.wpZ.toFixed(2) } : null
      });
    }
    return list;
  }

  function alertAllTo(targetPos, radius) {
    if (!targetPos) return;
    const rad = radius !== undefined ? radius : 45.0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = _zombies[i];
      if (!z.active || z.dead) continue;
      const d = Math.hypot(z.x - targetPos.x, z.z - targetPos.z);
      if (d <= rad) {
        z.lureTimer = 6.0;
        z.lurePosX = targetPos.x;
        z.lurePosY = targetPos.y !== undefined ? targetPos.y : z.y;
        z.lurePosZ = targetPos.z;
        z.navTimer = 0;
      }
    }
  }

  function applyHydrantKnockback(origin, radius, impulse) {
    if (!origin) return;
    const rad = radius !== undefined ? radius : 4.5;
    const imp = impulse !== undefined ? impulse : 8.5;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = _zombies[i];
      if (!z.active || z.dead) continue;
      const dx = z.x - origin.x;
      const dy = z.y - origin.y;
      const dz = z.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < rad && dist > 0.01) {
        const falloff = 1.0 - dist / rad;
        const push = imp * falloff;
        z.vx += (dx / dist) * push;
        z.vz += (dz / dist) * push;
        z.staggerTimer = Math.max(z.staggerTimer, 0.45 * falloff);
      }
    }
  }

  const Enemies = {
    init,
    reset,
    setWarmupMode,
    spawnWave,
    spawnOneZombie,
    update,
    raycastHit,
    hitZombie,
    applyBlast,
    alertAllTo,
    applyHydrantKnockback,
    getAliveCount,
    getTotalCount,
    getKills: () => _totalKills,
    getSpawnedSpitterProjectiles,
    getDebugSummary
  };

  LRT.Enemies = Enemies;
})(window.LRT = window.LRT || {});
