(function (LRT) {
  'use strict';

  const C = LRT.Config || {};
  const TD = C.TRAIN_DIMS || {
    carCount: 3,
    carLength: 17.10,
    gangwayLength: 0.45,
    carPitch: 17.55,
    carCentersZ: [-17.55, 0.0, 17.55],
    totalLength: 52.20,
    carWidth: 2.65,
    halfWidth: 1.325,
    interiorHalfWidth: 1.205,
    cabinFloorY: 0.02,
    cabinCeilingY: 2.02,
    roofDeckY: 2.99,
    hvacTopY: 3.685,
    railTopY: -1.00,
    trackGauge: 1.435,
    doorClearWidth: 1.35,
    doorHeight: 1.88,
    doorOffsetsLocal: [-5.70, 0.0, 5.70],
    doorCentersWorldZ: [-23.25, -17.55, -11.85, -5.70, 0.0, 5.70, 11.85, 17.55, 23.25],
    seatDepth: 0.52,
    seatHeight: 0.44,
    aisleWidth: 1.37,
    handrailHeight: 1.90,
    consoleHeight: 0.95
  };

  const DOOR_WORLDS_Z = TD.doorCentersWorldZ;
  const WHEEL_RADIUS = 0.39;
  const CRUISE_SPEED = 26.0;
  const MAX_DENT = 0.18;
  const CHUNK_LEN = 60.0;
  const CHUNK_COUNT = 6;

  // UV region helpers for textures_shaders.js atlases (bottom-up V)
  const LIVERY_UV = {
    upperWhite: [0.02, 0.858, 0.48, 0.954],
    windowBand: [0.02, 0.714, 0.48, 0.852],
    redStripe: [0.02, 0.648, 0.48, 0.708],
    redDiagonal: [0.28, 0.648, 0.42, 0.850],
    whiteLogoFlank: [0.02, 0.585, 0.48, 0.642],
    lowerSkirt: [0.02, 0.504, 0.48, 0.578],
    doorWhite: [0.095, 0.045, 0.240, 0.132],
    doorUpperWhite: [0.01, 0.445, 0.24, 0.495],
    doorRedBand: [0.01, 0.145, 0.24, 0.190],
    doorSticker: [0.01, 0.04, 0.095, 0.13],
    doorYellowEdge: [0.02, 0.005, 0.23, 0.032],
    hvacPod: [0.26, 0.02, 0.49, 0.48],
    noseBlack: [0.53, 0.480, 0.97, 0.585],
    noseRed: [0.52, 0.02, 0.98, 0.43],
    destLed: [0.528, 0.772, 0.970, 0.928],
    headlightCluster: [0.538, 0.620, 0.708, 0.700],
    taillightCluster: [0.764, 0.620, 0.935, 0.700]
  };

  const INT_UV = {
    creamWall: [0.02, 0.52, 0.48, 0.98],
    cyanSeat: [0.52, 0.52, 0.98, 0.98],
    sageAisle: [0.02, 0.02, 0.30, 0.48],
    slateBorder: [0.33, 0.02, 0.48, 0.48],
    pisLcd: [0.515, 0.265, 0.985, 0.485],
    doorWarnYellow: [0.52, 0.02, 0.98, 0.23]
  };

  // Reusable scratch objects (zero per-frame allocations)
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _m4 = new THREE.Matrix4();
  const _q1 = new THREE.Quaternion();
  const _e1 = new THREE.Euler();
  const _s1 = new THREE.Vector3();
  const _localRayOrigin = new THREE.Vector3();
  const _localRayDir = new THREE.Vector3();
  const _invMat = new THREE.Matrix4();
  const _box = new THREE.Box3();
  const _ray = new THREE.Ray();
  const _hitPt = new THREE.Vector3();
  const _upVec = new THREE.Vector3(0, 1, 0);

  // Module state
  let sceneRef = null;
  let initialized = false;
  let gameMode = 'survival';
  let state = 'AWAY'; // AWAY | APPROACHING | BOARDED_WAIT | DEPARTING | CRUISE | ARRIVING
  let activeTrackX = 0.0;
  let travelDir = 1; // +1 = Northbound Track 1 (+Z), -1 = Southbound Track 2 (-Z, rotated PI)
  let trainZ = -180.0;
  let speed = 0.0;
  let accel = 0.0;
  let wheelAngle = 0.0;
  let doorOpen = 0.0;
  let doorsTarget = 0.0;
  let pendingDepart = false;
  let brakeSoundPlayed = false;
  let approachSoundPlayed = false;
  let rideTime = 0.0;
  let rideDist = 0.0;
  let oldDisposed = false;
  let nextSpawned = false;
  let incomingStationZ = 220.0;
  let activeOldRootGroup = null;
  let currentStationName = 'Dukuh Atas BSI';
  let animTime = 0.0;

  let trainGroup = null;
  let trainVisualRoot = null;
  let viaductGroup = null;
  let viaductChunks = [];

  // Lights & Cones
  let trainLightsGroup = null;
  let headlightLight = null;
  let headlightIntensityTarget = 0.0;
  const cabinLights = [];
  const CABIN_LIGHT_Z = [-17.55, -5.85, 5.85, 17.55];
  let headlightConeL = null;
  let headlightConeR = null;
  let warmupActive = false;

  // Destructible collections
  const dentHulls = [];
  const dentSeats = [];
  const glassPanes = [];
  const lcdScreens = [];
  const handStraps = [];
  const ceilingTubes = [];
  const scorchDecals = [];
  let scorchCursor = 0;

  // Instanced meshes
  let doorFrameInst = null;
  let doorGlassInst = null;
  let sideGlassInst = null;
  let cabGlassInst = null;
  let strapInst = null;
  let tubeInst = null;
  let bogieInst = null;
  let wheelInst = null;
  let hvacInst = null;

  const doorLeaves = []; // { instIdx, carIdx, doorIdx, side, leafSign, baseX, baseY, baseZ, glassIdx }
  const bogieLocalCoords = [];
  const wheelLocalCoords = [];

  // Dynamic Canvas Textures
  let texNoseAtlas = null;
  let texConsole = null;
  let texConsoleEmissive = null;
  let texPisCanvas = null;
  let texPisCtx = null;
  let texPisMap = null;
  let texScorchFallback = null;
  let baseLcdMat = null;

  // Colliders & Interactables
  const staticLocalColliders = [];
  const doorLocalColliders = [];
  const raycastLocalBoxes = [];
  const activeColliders = [];
  const localInteractables = [];

  // Stats
  let stats = {
    brokenWindows: 0,
    brokenLcds: 0,
    snappedStraps: 0,
    dentedHits: 0,
    scorchDecals: 0
  };

  function safeAudioPlay(key, opts) {
    if (LRT.Audio && typeof LRT.Audio.play === 'function') {
      LRT.Audio.play(key, opts);
    }
  }

  function localXToWorld(lx) {
    return activeTrackX + (travelDir === -1 ? -lx : lx);
  }

  function localZToWorld(lz) {
    return trainZ + (travelDir === -1 ? -lz : lz);
  }

  function worldToLocalX(wx) {
    return travelDir === -1 ? -(wx - activeTrackX) : (wx - activeTrackX);
  }

  function worldToLocalZ(wz) {
    return travelDir === -1 ? -(wz - trainZ) : (wz - trainZ);
  }

  function localBoxToWorld(minX, minY, minZ, maxX, maxY, maxZ, tag, isFloor, solid) {
    const wx0 = localXToWorld(minX);
    const wx1 = localXToWorld(maxX);
    const wz0 = localZToWorld(minZ);
    const wz1 = localZToWorld(maxZ);
    const bMinX = Math.min(wx0, wx1);
    const bMaxX = Math.max(wx0, wx1);
    const bMinZ = Math.min(wz0, wz1);
    const bMaxZ = Math.max(wz0, wz1);
    return {
      minX: bMinX,
      minY: minY,
      minZ: bMinZ,
      maxX: bMaxX,
      maxY: maxY,
      maxZ: bMaxZ,
      min: { x: bMinX, y: minY, z: bMinZ },
      max: { x: bMaxX, y: maxY, z: bMaxZ },
      tag: tag,
      isFloor: isFloor,
      solid: solid !== false
    };
  }

  function localToWorld(pt) {
    if (!pt) return { x: activeTrackX, y: 0, z: trainZ, yaw: 0 };
    return {
      x: localXToWorld(pt.x || 0),
      y: pt.y || 0,
      z: localZToWorld(pt.z || 0),
      yaw: (typeof pt.yaw === 'number') ? (pt.yaw + (travelDir === -1 ? Math.PI : 0)) : undefined
    };
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Normalize and merge transformed static geometries into a single draw call
  function mergeStaticGeoms(items) {
    if (!items || !items.length) return null;
    const normalized = [];
    for (let i = 0; i < items.length; i++) {
      let g = items[i].geo;
      if (items[i].matrix) g.applyMatrix4(items[i].matrix);
      if (g.index) {
        const nonIdx = g.toNonIndexed();
        g.dispose();
        g = nonIdx;
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        const count = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      for (const attr in g.attributes) {
        if (attr !== 'position' && attr !== 'normal' && attr !== 'uv') {
          g.deleteAttribute(attr);
        }
      }
      normalized.push(g);
    }
    let merged;
    if (normalized.length === 1) {
      merged = normalized[0];
    } else if (window.THREE_UTILS && THREE_UTILS.mergeGeometries) {
      merged = THREE_UTILS.mergeGeometries(normalized, false);
      for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] !== merged) normalized[i].dispose();
      }
    } else {
      merged = normalized[0];
    }
    return merged;
  }

  function pushMatGeom(list, geo, x, y, z, rx, ry, rz, order) {
    _e1.set(rx || 0, ry || 0, rz || 0, order || 'YXZ');
    _q1.setFromEuler(_e1);
    _m4.compose(_v1.set(x || 0, y || 0, z || 0), _q1, _s1.set(1, 1, 1));
    list.push({ geo, matrix: _m4.clone() });
  }

  function buildProceduralTrainTextures() {
    // 1. Combined Nose Front / Rear Gloss Mask Atlas (2048x1024 crisp retina!)
    const atlas = makeCanvas(2048, 1024);
    const actx = atlas.getContext('2d');
    actx.scale(2, 2);
    const drawNoseHalf = (ox, isFront) => {
      actx.save();
      actx.translate(ox, 0);
      actx.beginPath();
      actx.rect(0, 0, 512, 512);
      actx.clip();

      const g = actx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, '#23262C');
      g.addColorStop(0.45, '#121418');
      g.addColorStop(1, '#1A1C20');
      actx.fillStyle = g;
      actx.fillRect(0, 0, 512, 512);

      // Crimson red boomerang side borders
      actx.fillStyle = '#C81E24';
      actx.beginPath();
      actx.moveTo(0, 0);
      actx.lineTo(74, 0);
      actx.quadraticCurveTo(38, 250, 92, 445);
      actx.lineTo(148, 512);
      actx.lineTo(0, 512);
      actx.closePath();
      actx.fill();

      actx.beginPath();
      actx.moveTo(512, 0);
      actx.lineTo(438, 0);
      actx.quadraticCurveTo(474, 250, 420, 445);
      actx.lineTo(364, 512);
      actx.lineTo(512, 512);
      actx.closePath();
      actx.fill();

      // White pin-stripe along red boomerang
      actx.strokeStyle = '#ECEDEF';
      actx.lineWidth = 6;
      actx.beginPath();
      actx.moveTo(74, 0);
      actx.quadraticCurveTo(38, 250, 92, 445);
      actx.lineTo(148, 512);
      actx.stroke();
      actx.beginPath();
      actx.moveTo(438, 0);
      actx.quadraticCurveTo(474, 250, 420, 445);
      actx.lineTo(364, 512);
      actx.stroke();

      // KAI Emblem & stylized swirl centered on nose below windshield
      actx.fillStyle = '#F5F7FA';
      actx.font = 'italic 900 62px sans-serif';
      actx.textAlign = 'center';
      actx.fillText('KAI', 216, 338);

      // Stylized infinity ribbon beside KAI
      actx.strokeStyle = '#F5F7FA';
      actx.lineWidth = 9;
      actx.beginPath();
      actx.moveTo(295, 318);
      actx.bezierCurveTo(315, 292, 348, 292, 345, 318);
      actx.bezierCurveTo(342, 344, 305, 344, 295, 318);
      actx.stroke();
      actx.beginPath();
      actx.moveTo(345, 318);
      actx.bezierCurveTo(365, 296, 392, 300, 384, 326);
      actx.bezierCurveTo(376, 346, 352, 338, 345, 318);
      actx.stroke();

      // Subtle monsoon grime streaks
      actx.fillStyle = 'rgba(28,24,20,0.22)';
      for (let i = 0; i < 24; i++) {
        actx.fillRect(90 + i * 14, 180 + (i % 5) * 28, 3, 45 + (i % 4) * 20);
      }

      // TS 04 badge near upper edge
      actx.fillStyle = '#F0F2F5';
      actx.fillRect(216, 26, 80, 32);
      actx.fillStyle = '#181A1E';
      actx.font = 'bold 20px monospace';
      actx.fillText(isFront ? 'TS 04' : 'TS 04R', 256, 49);
      actx.restore();
    };
    drawNoseHalf(0, true);
    drawNoseHalf(512, false);

    texNoseAtlas = new THREE.CanvasTexture(atlas);
    texNoseAtlas.colorSpace = THREE.SRGBColorSpace;
    texNoseAtlas.anisotropy = 8;

    // 2. GoA 3 Cockpit Console Texture (1024x512 crisp gauges & MFD)
    const cC = makeCanvas(1024, 512);
    const ctxC = cC.getContext('2d');
    const cCE = makeCanvas(1024, 512);
    const ctxCE = cCE.getContext('2d');
    ctxC.scale(2, 2);
    ctxCE.scale(2, 2);

    ctxC.fillStyle = '#1B1E23';
    ctxC.fillRect(0, 0, 512, 256);
    ctxCE.fillStyle = '#000000';
    ctxCE.fillRect(0, 0, 512, 256);

    // Metallic bevel plates
    ctxC.fillStyle = '#2B3038';
    ctxC.fillRect(14, 18, 484, 128);
    ctxC.fillStyle = '#121519';
    ctxC.fillRect(14, 152, 484, 92);

    // Left MFD screen
    ctxC.fillStyle = '#0B1624';
    ctxC.fillRect(28, 28, 120, 96);
    ctxC.fillStyle = '#38BDF8';
    ctxC.fillRect(36, 36, 104, 16);
    ctxC.fillStyle = '#22C55E';
    ctxC.fillRect(36, 62, 72, 12);
    ctxCE.fillStyle = '#1E5B88';
    ctxCE.fillRect(28, 28, 120, 96);
    ctxCE.fillStyle = '#5EEAD4';
    ctxCE.fillRect(36, 36, 104, 16);

    // Center analog brake/speed gauges
    for (let gIdx = 0; gIdx < 3; gIdx++) {
      const gx = 186 + gIdx * 42;
      const gy = 58;
      ctxC.fillStyle = '#0D1014';
      ctxC.beginPath();
      ctxC.arc(gx, gy, 16, 0, Math.PI * 2);
      ctxC.fill();
      ctxC.strokeStyle = '#94A3B8';
      ctxC.lineWidth = 2;
      ctxC.stroke();
      ctxCE.fillStyle = '#4ADE80';
      ctxCE.beginPath();
      ctxCE.arc(gx, gy, 10, 0, Math.PI * 2);
      ctxCE.fill();
    }

    // Green/Yellow Status Indicator Grid (center right, matching photo 06 & 22!)
    const indColors = ['#22C55E', '#22C55E', '#EAB308', '#22C55E', '#22C55E', '#EF4444'];
    for (let r = 0; r < 2; r++) {
      for (let col = 0; col < 3; col++) {
        const ix = 304 + col * 24;
        const iy = 34 + r * 22;
        const colHex = indColors[r * 3 + col];
        ctxC.fillStyle = colHex;
        ctxC.fillRect(ix, iy, 20, 16);
        ctxCE.fillStyle = colHex;
        ctxCE.fillRect(ix, iy, 20, 16);
      }
    }

    // Right MFD screen
    ctxC.fillStyle = '#0B1624';
    ctxC.fillRect(390, 28, 96, 96);
    ctxC.fillStyle = '#F59E0B';
    ctxC.fillRect(398, 40, 80, 14);
    ctxCE.fillStyle = '#1D4E78';
    ctxCE.fillRect(390, 28, 96, 96);

    // Lower illuminated pushbuttons (green start / red emergency)
    for (let b = 0; b < 6; b++) {
      const bx = 42 + b * 24;
      ctxC.fillStyle = b === 2 ? '#EF4444' : '#22C55E';
      ctxC.beginPath();
      ctxC.arc(bx, 188, 7, 0, Math.PI * 2);
      ctxC.fill();
      ctxCE.fillStyle = b === 2 ? '#EF4444' : '#22C55E';
      ctxCE.beginPath();
      ctxCE.arc(bx, 188, 6, 0, Math.PI * 2);
      ctxCE.fill();
    }
    // Right red mushroom stop button + labels
    ctxC.fillStyle = '#DC2626';
    ctxC.beginPath();
    ctxC.arc(412, 188, 14, 0, Math.PI * 2);
    ctxC.fill();
    ctxCE.fillStyle = '#991B1B';
    ctxCE.beginPath();
    ctxCE.arc(412, 188, 9, 0, Math.PI * 2);
    ctxCE.fill();

    texConsole = new THREE.CanvasTexture(cC);
    texConsole.colorSpace = THREE.SRGBColorSpace;
    texConsoleEmissive = new THREE.CanvasTexture(cCE);
    texConsoleEmissive.colorSpace = THREE.SRGBColorSpace;

    // 3. Dynamic Interior LCD PIS Route Screen Texture (1024x256 ultra-sharp!)
    texPisCanvas = makeCanvas(1024, 256);
    texPisCtx = texPisCanvas.getContext('2d');
    texPisMap = new THREE.CanvasTexture(texPisCanvas);
    texPisMap.colorSpace = THREE.SRGBColorSpace;
    texPisMap.anisotropy = 8;
    repaintPisLcd(currentStationName);

    // 4. Fallback Scorch Decal Texture (in case LRT.Materials.mats.scorchDecal absent)
    const cS = makeCanvas(128, 128);
    const ctxS = cS.getContext('2d');
    const rg = ctxS.createRadialGradient(64, 64, 4, 64, 64, 60);
    rg.addColorStop(0.0, 'rgba(8, 7, 6, 0.95)');
    rg.addColorStop(0.45, 'rgba(22, 18, 15, 0.78)');
    rg.addColorStop(0.75, 'rgba(35, 30, 26, 0.32)');
    rg.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctxS.fillStyle = rg;
    ctxS.fillRect(0, 0, 128, 128);
    texScorchFallback = new THREE.CanvasTexture(cS);
    texScorchFallback.colorSpace = THREE.SRGBColorSpace;
  }

  function repaintPisLcd(stationName) {
    if (!texPisCtx || !texPisMap) return;
    const ctx = texPisCtx;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#182438';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#EDF3FB';
    ctx.fillRect(10, 10, 492, 108);

    // KAI header bar
    ctx.fillStyle = '#16325C';
    ctx.fillRect(10, 10, 492, 34);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('KAI  LRT JABODEBEK', 22, 33);
    ctx.fillStyle = '#E5D429';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('GoA-3 OTOMATIS', 488, 33);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 21px sans-serif';
    ctx.fillText('Next Station: ' + (stationName || 'Cawang'), 22, 72);

    // Route bar CB + BK
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(22, 92, 224, 10);
    ctx.fillStyle = '#15803D';
    ctx.fillRect(246, 92, 244, 10);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i === 3 ? '#E5D429' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(36 + i * 62, 97, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    texPisMap.needsUpdate = true;
  }

  // Geometry builder supporting subdivided dentable quads with basePositions + vertex colors
  function createMeshBuilder(withColors) {
    const pos = [];
    const norm = [];
    const uv = [];
    const col = withColors ? [] : null;
    const idx = [];

    function pushVert(x, y, z, nx, ny, nz, u, v, r, g, b) {
      const i = pos.length / 3;
      pos.push(x, y, z);
      norm.push(nx, ny, nz);
      uv.push(u, v);
      if (col) col.push(r, g, b);
      return i;
    }

    // Add a subdivided quad defined by corners p00(u0,v0), p10(u1,v0), p11(u1,v1), p01(u0,v1)
    function addQuad(p00, p10, p11, p01, nx, ny, nz, uvRect, segU, segV, tint) {
      const su = Math.max(1, segU | 0);
      const sv = Math.max(1, segV | 0);
      const u0 = uvRect[0], v0 = uvRect[1], u1 = uvRect[2], v1 = uvRect[3];
      const tr = tint ? tint[0] : 1.0;
      const tg = tint ? tint[1] : 1.0;
      const tb = tint ? tint[2] : 1.0;

      const startIdx = pos.length / 3;
      for (let j = 0; j <= sv; j++) {
        const ty = j / sv;
        const vv = v0 + (v1 - v0) * ty;
        for (let i = 0; i <= su; i++) {
          const tx = i / su;
          const uu = u0 + (u1 - u0) * tx;
          const x = (p00[0] * (1 - tx) + p10[0] * tx) * (1 - ty) + (p01[0] * (1 - tx) + p11[0] * tx) * ty;
          const y = (p00[1] * (1 - tx) + p10[1] * tx) * (1 - ty) + (p01[1] * (1 - tx) + p11[1] * tx) * ty;
          const z = (p00[2] * (1 - tx) + p10[2] * tx) * (1 - ty) + (p01[2] * (1 - tx) + p11[2] * tx) * ty;
          pushVert(x, y, z, nx, ny, nz, uu, vv, tr, tg, tb);
        }
      }
      const stride = su + 1;
      for (let j = 0; j < sv; j++) {
        for (let i = 0; i < su; i++) {
          const a = startIdx + j * stride + i;
          const b = a + 1;
          const c = a + stride + 1;
          const d = a + stride;
          idx.push(a, b, c, a, c, d);
        }
      }
    }

    function addBox(cx, cy, cz, sx, sy, sz, uvRect, stepSize, skipFaces, tint) {
      const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
      const x0 = cx - hx, x1 = cx + hx;
      const y0 = cy - hy, y1 = cy + hy;
      const z0 = cz - hz, z1 = cz + hz;
      const ss = stepSize || 10.0;
      const nxSeg = Math.max(1, Math.round(sx / ss));
      const nySeg = Math.max(1, Math.round(sy / ss));
      const nzSeg = Math.max(1, Math.round(sz / ss));
      const sk = skipFaces || {};

      if (!sk.px) addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, uvRect, nzSeg, nySeg, tint);
      if (!sk.nx) addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, uvRect, nzSeg, nySeg, tint);
      if (!sk.py) addQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, uvRect, nxSeg, nzSeg, tint);
      if (!sk.ny) addQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, uvRect, nxSeg, nzSeg, tint);
      if (!sk.pz) addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, uvRect, nxSeg, nySeg, tint);
      if (!sk.nz) addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, uvRect, nxSeg, nySeg, tint);
    }

    function toGeometry(dentable) {
      const g = new THREE.BufferGeometry();
      const posArr = new Float32Array(pos);
      const normArr = new Float32Array(norm);
      const uvArr = new Float32Array(uv);
      g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      if (col) {
        const colArr = new Float32Array(col);
        g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      }
      g.setIndex(idx);
      g.computeBoundingBox();
      g.computeBoundingSphere();

      if (dentable) {
        return {
          geometry: g,
          basePositions: new Float32Array(posArr),
          baseNormals: new Float32Array(normArr),
          dentAmounts: new Float32Array(posArr.length / 3)
        };
      }
      return g;
    }

    return { addQuad, addBox, toGeometry };
  }

  function cloneMatWithVertexColors(baseMat, cacheSuffix, physOpts) {
    if (!baseMat) {
      return new THREE.MeshPhysicalMaterial(Object.assign({
        color: 0xffffff,
        roughness: 0.36,
        metalness: 0.28,
        clearcoat: 0.55,
        clearcoatRoughness: 0.22,
        vertexColors: true
      }, physOpts || {}));
    }
    const m = baseMat.clone();
    m.vertexColors = true;
    if (physOpts) Object.assign(m, physOpts);
    const origKey = typeof baseMat.customProgramCacheKey === 'function' ? baseMat.customProgramCacheKey() : 'lrt_vc';
    m.customProgramCacheKey = () => origKey + '_' + (cacheSuffix || 'vc');
    m.onBeforeCompile = baseMat.onBeforeCompile;
    return m;
  }

  function getTrainMaterials() {
    const mats = (LRT.Materials && LRT.Materials.mats) ? LRT.Materials.mats : {};
    const trainBody = mats.trainBody || new THREE.MeshPhysicalMaterial({
      color: 0xd8dbdf,
      roughness: 0.34,
      metalness: 0.32,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.45
    });
    const trainInterior = mats.trainInterior || new THREE.MeshPhysicalMaterial({
      color: 0xece8dd,
      roughness: 0.58,
      metalness: 0.08,
      clearcoat: 0.35,
      clearcoatRoughness: 0.26,
      envMapIntensity: 1.25
    });

    const dentHullMat = cloneMatWithVertexColors(trainBody, 'dent_hull', {
      roughness: 0.34,
      metalness: 0.32,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.45
    });
    const dentSeatMat = cloneMatWithVertexColors(trainInterior, 'dent_seat', {
      roughness: 0.52,
      metalness: 0.08,
      clearcoat: 0.32,
      clearcoatRoughness: 0.26,
      envMapIntensity: 1.25
    });
    // Subtle ambient cabin bounce so interior stays crisply lit even inside blackout stations
    dentSeatMat.emissiveMap = null;
    dentSeatMat.emissive = new THREE.Color(0x18242e);
    dentSeatMat.emissiveIntensity = 0.26;

    const interiorWallMat = trainInterior.clone();
    interiorWallMat.customProgramCacheKey = () => 'lrt_train_metal_v1_int_wall';
    interiorWallMat.onBeforeCompile = trainInterior.onBeforeCompile;
    interiorWallMat.clearcoat = 0.42;
    interiorWallMat.clearcoatRoughness = 0.24;
    interiorWallMat.envMapIntensity = 1.25;
    interiorWallMat.emissiveMap = null;
    interiorWallMat.emissive = new THREE.Color(0x20272e);
    interiorWallMat.emissiveIntensity = 0.26;

    const glassMat = mats.glassClear ? mats.glassClear.clone() : new THREE.MeshPhysicalMaterial({
      color: 0x9ec4d4,
      roughness: 0.05,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.65,
      transparent: true,
      opacity: 0.30,
      depthWrite: false
    });
    glassMat.side = THREE.DoubleSide;

    const metalMat = new THREE.MeshPhysicalMaterial({
      color: 0xdde3ea,
      roughness: 0.16,
      metalness: 0.94,
      clearcoat: 0.35,
      clearcoatRoughness: 0.16,
      envMapIntensity: 1.65
    });

    const steelDarkMat = mats.steelDark || new THREE.MeshStandardMaterial({
      color: 0x2b2f35,
      roughness: 0.50,
      metalness: 0.72
    });

    const scorchMat = mats.scorchDecal || new THREE.MeshBasicMaterial({
      map: texScorchFallback,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide
    });

    const flickerTubeMat = mats.flickerTube || (LRT.Materials && LRT.Materials.createFlickerMat
      ? LRT.Materials.createFlickerMat({ color: 0xf2f9ff, emissive: 0xdff2ff, emissiveIntensity: 1.85 })
      : new THREE.MeshStandardMaterial({ color: 0xf2f9ff, emissive: 0xdff2ff, emissiveIntensity: 1.65 }));

    const concreteMat = mats.concrete || new THREE.MeshStandardMaterial({ color: 0x8e8c84, roughness: 0.90 });

    return {
      trainBody,
      dentHullMat,
      dentSeatMat,
      interiorWallMat,
      glassMat,
      metalMat,
      steelDarkMat,
      scorchMat,
      flickerTubeMat,
      concreteMat,
      concreteRough: mats.concreteRough || concreteMat,
      sidewalkPaver: mats.sidewalkPaver || concreteMat,
      asphaltRoad: mats.asphaltRoad || mats.highwayAsphalt || steelDarkMat,
      highwayAsphalt: mats.highwayAsphalt || mats.asphaltRoad || steelDarkMat,
      facadeModern: mats.facadeModern || mats.skylineBuilding || concreteMat,
      facadePlaster: mats.facadePlaster || concreteMat,
      brickWall: mats.brickWall || concreteMat,
      glassBuilding: mats.glassBuilding || glassMat,
      roofTerracotta: mats.roofTerracotta || new THREE.MeshStandardMaterial({ color: 0xa85e32, roughness: 0.60, metalness: 0.35 }),
      roofOchre: mats.roofOchre || new THREE.MeshStandardMaterial({ color: 0xc27c28, roughness: 0.60, metalness: 0.35 }),
      darkWood: mats.darkWood || new THREE.MeshStandardMaterial({ color: 0x4b3828, roughness: 0.78 }),
      skylineBuilding: mats.skylineBuilding || new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.78 }),
      foliageTree: mats.foliageTree || new THREE.MeshStandardMaterial({ color: 0x3a5b2b, roughness: 0.88 }),
      skylineLit: mats.skylineLit || new THREE.MeshStandardMaterial({ color: 0xffe4a8, emissive: 0xffc970, emissiveIntensity: 1.25 }),
      amberBeacon: mats.amberBeacon || new THREE.MeshStandardMaterial({ color: 0xff9b24, emissive: 0xff8011, emissiveIntensity: 2.0 })
    };
  }

  // Build one car's dentable exterior hull (sides, pillars, skirts, roof, and optional cab nose at +Z or -Z)
  function buildCarExteriorHull(carIdx, noseDir) {
    // noseDir: +1 for MC1 (+Z nose), -1 for MC3 (-Z nose), 0 for M2 (middle)
    const b = createMeshBuilder(true);
    const hw = TD.halfWidth; // 1.325
    const step = 0.42;

    // Car body Z span: [-8.55, +8.55]. If noseDir !== 0, nose occupies [6.45 .. 8.55] on that end!
    const zStart = noseDir === -1 ? -6.45 : -8.55;
    const zEnd = noseDir === 1 ? 6.45 : 8.55;

    // Door openings at local Z = [-5.70, 0.0, +5.70], width 1.35 -> half 0.675
    const doorSpans = [
      [-6.375, -5.025],
      [-0.675, 0.675],
      [5.025, 6.375]
    ];

    // Window bays between doors & ends (only outside doors)
    const solidWallSegments = [];
    // Compute segments outside door openings within [zStart, zEnd]
    let cursor = zStart;
    for (let d = 0; d < doorSpans.length; d++) {
      const ds0 = Math.max(zStart, doorSpans[d][0]);
      const ds1 = Math.min(zEnd, doorSpans[d][1]);
      if (ds0 > cursor + 0.02) {
        solidWallSegments.push([cursor, ds0, true]); // wall bay with window cutout!
      }
      if (ds1 > ds0 + 0.02) {
        solidWallSegments.push([ds0, ds1, false]); // doorway header/skirt only
      }
      cursor = Math.max(cursor, ds1);
    }
    if (zEnd > cursor + 0.02) {
      solidWallSegments.push([cursor, zEnd, true]);
    }

    // Add side body walls (both X sides: +1 and -1)
    for (let side of [-1, 1]) {
      const xOut = side * hw;
      const xTop = side * (hw - 0.15);
      const nx = side;

      for (let s = 0; s < solidWallSegments.length; s++) {
        const [za, zb, hasBay] = solidWallSegments[s];
        const segLen = zb - za;
        const nSegZ = Math.max(1, Math.round(segLen / step));

        // Lower under-floor dark skirt (-0.22 .. 0.04)
        const pSkirt00 = side > 0 ? [xOut - 0.03, -0.22, zb] : [xOut + 0.03, -0.22, za];
        const pSkirt10 = side > 0 ? [xOut - 0.03, -0.22, za] : [xOut + 0.03, -0.22, zb];
        const pSkirt11 = side > 0 ? [xOut, 0.05, za] : [xOut, 0.05, zb];
        const pSkirt01 = side > 0 ? [xOut, 0.05, zb] : [xOut, 0.05, za];
        b.addQuad(pSkirt00, pSkirt10, pSkirt11, pSkirt01, nx, 0, 0, LIVERY_UV.lowerSkirt, nSegZ, 1);

        // Above-door header & roof cantrail (2.04 .. 2.86) + cantrail bevel (2.86 .. 3.16)
        const hBot = TD.doorHeight;
        const cantY = 2.86;
        const roofY = TD.roofDeckY;
        const qTop00 = side > 0 ? [xOut, hBot, zb] : [xOut, hBot, za];
        const qTop10 = side > 0 ? [xOut, hBot, za] : [xOut, hBot, zb];
        const qTop11 = side > 0 ? [xOut, cantY, za] : [xOut, cantY, zb];
        const qTop01 = side > 0 ? [xOut, cantY, zb] : [xOut, cantY, za];
        b.addQuad(qTop00, qTop10, qTop11, qTop01, nx, 0, 0, LIVERY_UV.upperWhite, nSegZ, 2);

        const c00 = side > 0 ? [xOut, cantY, zb] : [xOut, cantY, za];
        const c10 = side > 0 ? [xOut, cantY, za] : [xOut, cantY, zb];
        const c11 = side > 0 ? [xTop, roofY, za] : [xTop, roofY, zb];
        const c01 = side > 0 ? [xTop, roofY, zb] : [xTop, roofY, za];
        b.addQuad(c00, c10, c11, c01, nx * 0.65, 0.76, 0, LIVERY_UV.upperWhite, nSegZ, 1);

        if (hasBay) {
          // Lower body red stripe + white flank (0.05 .. 0.96)
          // Sub-split into white lower flank (0.05..0.44) + signal red speed belt (0.44..0.96)
          const w00 = side > 0 ? [xOut, 0.05, zb] : [xOut, 0.05, za];
          const w10 = side > 0 ? [xOut, 0.05, za] : [xOut, 0.05, zb];
          const w11 = side > 0 ? [xOut, 0.44, za] : [xOut, 0.44, zb];
          const w01 = side > 0 ? [xOut, 0.44, zb] : [xOut, 0.44, za];
          b.addQuad(w00, w10, w11, w01, nx, 0, 0, LIVERY_UV.whiteLogoFlank, nSegZ, 1);

          const r00 = side > 0 ? [xOut, 0.44, zb] : [xOut, 0.44, za];
          const r10 = side > 0 ? [xOut, 0.44, za] : [xOut, 0.44, zb];
          const r11 = side > 0 ? [xOut, 0.96, za] : [xOut, 0.96, zb];
          const r01 = side > 0 ? [xOut, 0.96, zb] : [xOut, 0.96, za];
          b.addQuad(r00, r10, r11, r01, nx, 0, 0, LIVERY_UV.redStripe, nSegZ, 2);

          // Window frame vertical pillars at za..za+0.20 and zb-0.20..zb (0.96..2.04)
          const pW = Math.min(0.22, segLen * 0.25);
          for (const [pa, pb] of [[za, za + pW], [zb - pW, zb]]) {
            const m00 = side > 0 ? [xOut, 0.96, pb] : [xOut, 0.96, pa];
            const m10 = side > 0 ? [xOut, 0.96, pa] : [xOut, 0.96, pb];
            const m11 = side > 0 ? [xOut, hBot, pa] : [xOut, hBot, pb];
            const m01 = side > 0 ? [xOut, hBot, pb] : [xOut, hBot, pa];
            b.addQuad(m00, m10, m11, m01, nx, 0, 0, LIVERY_UV.windowBand, 1, 2);
          }
        }
      }
    }

    // Flat Roof Deck (zStart .. zEnd)
    const roofZSeg = Math.max(2, Math.round((zEnd - zStart) / 0.8));
    const rx = hw - 0.15;
    b.addQuad([-rx, TD.roofDeckY, zEnd], [rx, TD.roofDeckY, zEnd], [rx, TD.roofDeckY, zStart], [-rx, TD.roofDeckY, zStart], 0, 1, 0, LIVERY_UV.hvacPod, 3, roofZSeg);

    // Underside chassis pan (keeps exterior solid from underneath)
    b.addQuad([-hw + 0.08, -0.22, zStart], [hw - 0.08, -0.22, zStart], [hw - 0.08, -0.22, zEnd], [-hw + 0.08, -0.22, zEnd], 0, -1, 0, LIVERY_UV.lowerSkirt, 2, 6);

    // End Bulkhead frames (at non-nose ends with 1.32m wide open gangway cutout!)
    for (const endDir of [-1, 1]) {
      if (endDir === noseDir) continue;
      const ez = endDir * 8.55;
      const sideW = hw - 0.65;
      const sideCx = 0.65 + sideW * 0.5;
      b.addBox(-sideCx, 1.56, ez - endDir * 0.06, sideW, 3.12, 0.12, LIVERY_UV.upperWhite, 0.6);
      b.addBox(sideCx, 1.56, ez - endDir * 0.06, sideW, 3.12, 0.12, LIVERY_UV.upperWhite, 0.6);
      b.addBox(0.0, 2.60, ez - endDir * 0.06, 1.32, 1.08, 0.12, LIVERY_UV.upperWhite, 0.6);
    }

    // Aerodynamic Sloped Nose Cone (MC1 +Z or MC3 -Z)
    if (noseDir !== 0) {
      const s = noseDir; // +1 or -1
      const z0 = s * 6.45;
      const zTip = s * 8.55;
      const zMid = s * 8.42;
      const zBrow = s * 7.82;
      const zRoofStart = s * 6.58;
      const browY = 2.38;
      const roofY = TD.roofDeckY;

      for (const side of [-1, 1]) {
        const p00 = s > 0
          ? (side > 0 ? [side * 1.06, -0.22, zTip] : [side * hw, -0.22, z0])
          : (side > 0 ? [side * hw, -0.22, z0] : [side * 1.06, -0.22, zTip]);
        const p10 = s > 0
          ? (side > 0 ? [side * hw, -0.22, z0] : [side * 1.06, -0.22, zTip])
          : (side > 0 ? [side * 1.06, -0.22, zTip] : [side * hw, -0.22, z0]);
        const p11 = s > 0
          ? (side > 0 ? [side * hw, 0.98, z0] : [side * 1.08, 0.98, zTip])
          : (side > 0 ? [side * 1.08, 0.98, zTip] : [side * hw, 0.98, z0]);
        const p01 = s > 0
          ? (side > 0 ? [side * 1.08, 0.98, zTip] : [side * hw, 0.98, z0])
          : (side > 0 ? [side * hw, 0.98, z0] : [side * 1.08, 0.98, zTip]);
        b.addQuad(p00, p10, p11, p01, side * 0.92, 0, s * 0.39, LIVERY_UV.redStripe, 4, 3);

        const q00 = s > 0
          ? (side > 0 ? [side * (hw - 0.08), 0.98, s * 7.22] : [side * hw, 0.98, z0])
          : (side > 0 ? [side * hw, 0.98, z0] : [side * (hw - 0.08), 0.98, s * 7.22]);
        const q10 = s > 0
          ? (side > 0 ? [side * hw, 0.98, z0] : [side * (hw - 0.08), 0.98, s * 7.22])
          : (side > 0 ? [side * (hw - 0.08), 0.98, s * 7.22] : [side * hw, 0.98, z0]);
        const q11 = s > 0
          ? (side > 0 ? [side * hw, 2.86, z0] : [side * (hw - 0.14), 2.86, s * 7.05])
          : (side > 0 ? [side * (hw - 0.14), 2.86, s * 7.05] : [side * hw, 2.86, z0]);
        const q01 = s > 0
          ? (side > 0 ? [side * (hw - 0.14), 2.86, s * 7.05] : [side * hw, 2.86, z0])
          : (side > 0 ? [side * hw, 2.86, z0] : [side * (hw - 0.14), 2.86, s * 7.05]);
        b.addQuad(q00, q10, q11, q01, side * 0.94, 0.1, s * 0.32, LIVERY_UV.redStripe, 2, 3);

        const ap00 = s > 0
          ? (side > 0 ? [side * 0.88, 0.98, s * 8.48] : [side * 1.08, 0.98, s * 8.20])
          : (side > 0 ? [side * 1.08, 0.98, s * 8.20] : [side * 0.88, 0.98, s * 8.48]);
        const ap10 = s > 0
          ? (side > 0 ? [side * 1.08, 0.98, s * 8.20] : [side * 0.88, 0.98, s * 8.48])
          : (side > 0 ? [side * 0.88, 0.98, s * 8.48] : [side * 1.08, 0.98, s * 8.20]);
        const ap11 = s > 0
          ? (side > 0 ? [side * 1.04, browY, s * 7.72] : [side * 0.84, browY, s * 7.86])
          : (side > 0 ? [side * 0.84, browY, s * 7.86] : [side * 1.04, browY, s * 7.72]);
        const ap01 = s > 0
          ? (side > 0 ? [side * 0.84, browY, s * 7.86] : [side * 1.04, browY, s * 7.72])
          : (side > 0 ? [side * 1.04, browY, s * 7.72] : [side * 0.84, browY, s * 7.86]);
        b.addQuad(ap00, ap10, ap11, ap01, side * 0.55, 0.35, s * 0.75, LIVERY_UV.noseRed, 1, 3);

        const rc00 = s > 0
          ? (side > 0 ? [side * 1.20, browY, s * 7.65] : [side * hw, 2.86, z0])
          : (side > 0 ? [side * hw, 2.86, z0] : [side * 1.20, browY, s * 7.65]);
        const rc10 = s > 0
          ? (side > 0 ? [side * hw, 2.86, z0] : [side * 1.20, browY, s * 7.65])
          : (side > 0 ? [side * 1.20, browY, s * 7.65] : [side * hw, 2.86, z0]);
        const rc11 = s > 0
          ? (side > 0 ? [side * (hw - 0.15), roofY, zRoofStart] : [side * 0.98, 2.80, s * 7.35])
          : (side > 0 ? [side * 0.98, 2.80, s * 7.35] : [side * (hw - 0.15), roofY, zRoofStart]);
        const rc01 = s > 0
          ? (side > 0 ? [side * 0.98, 2.80, s * 7.35] : [side * (hw - 0.15), roofY, zRoofStart])
          : (side > 0 ? [side * (hw - 0.15), roofY, zRoofStart] : [side * 0.98, 2.80, s * 7.35]);
        b.addQuad(rc00, rc10, rc11, rc01, side * 0.5, 0.8, s * 0.3, LIVERY_UV.noseRed, 2, 2);
      }

      const f00 = s > 0 ? [-1.06, -0.22, zTip] : [1.06, -0.22, zTip];
      const f10 = s > 0 ? [1.06, -0.22, zTip] : [-1.06, -0.22, zTip];
      const f11 = s > 0 ? [0.98, 0.98, zMid] : [-0.98, 0.98, zMid];
      const f01 = s > 0 ? [-0.98, 0.98, zMid] : [0.98, 0.98, zMid];
      b.addQuad(f00, f10, f11, f01, 0, 0.12, s * 0.99, LIVERY_UV.noseBlack, 5, 3);

      const u00 = s > 0 ? [-0.90, browY, zBrow] : [0.90, browY, zBrow];
      const u10 = s > 0 ? [0.90, browY, zBrow] : [-0.90, browY, zBrow];
      const u11 = s > 0 ? [1.16, roofY, zRoofStart] : [-1.16, roofY, zRoofStart];
      const u01 = s > 0 ? [-1.16, roofY, zRoofStart] : [1.16, roofY, zRoofStart];
      b.addQuad(u00, u10, u11, u01, 0, 0.85, s * 0.52, LIVERY_UV.noseBlack, 4, 3);
    }

    return b.toGeometry(true);
  }

  // Build crisp KAI front/rear glossy fascia overlay shield & brow lights & couplers (merged per material!)
  function buildNoseDetails(mats, col) {
    const group = new THREE.Group();
    const shieldGeoms = [];
    const destGeoms = [];
    const frontLampGeoms = [];
    const rearLampGeoms = [];
    const hoseGeoms = [];

    for (const s of [1, -1]) {
      const carCenterZ = s * TD.carPitch;
      const zMid = carCenterZ + s * 8.43;
      const zTip = carCenterZ + s * 8.56;
      const ry = s > 0 ? 0 : Math.PI;

      // 1. KAI Gloss Black Shield Overlay on Lower Nose Apron (left/right half of texNoseAtlas)
      const shieldGeo = new THREE.PlaneGeometry(1.78, 1.12, 4, 4);
      const suv = shieldGeo.attributes.uv;
      const uOff = s > 0 ? 0.0 : 0.5;
      for (let ui = 0; ui < suv.count; ui++) {
        suv.setX(ui, uOff + suv.getX(ui) * 0.5);
      }
      pushMatGeom(shieldGeoms, shieldGeo, 0, 0.39, (zTip + zMid) * 0.5 + s * 0.025, -0.10, ry, 0, 'YXZ');

      // 2. LED Destination Header Strip right above windshield ('YXZ' fixes rear pitch)
      const destGeo = new THREE.PlaneGeometry(1.16, 0.16);
      const destUV = destGeo.attributes.uv;
      const du = LIVERY_UV.destLed;
      destUV.setXY(0, du[0], du[3]);
      destUV.setXY(1, du[2], du[3]);
      destUV.setXY(2, du[0], du[1]);
      destUV.setXY(3, du[2], du[1]);
      pushMatGeom(destGeoms, destGeo, 0, 2.48, carCenterZ + s * 7.68, -0.58, ry, 0, 'YXZ');

      // 3. 4 Top LED Brow Lights (merged per front/rear emissive color)
      const browOffsets = [
        { x: -0.68, y: 2.68, r: 0.075 },
        { x: -0.16, y: 2.72, r: 0.055 },
        { x: 0.16, y: 2.72, r: 0.055 },
        { x: 0.68, y: 2.68, r: 0.075 }
      ];
      const lampList = s > 0 ? frontLampGeoms : rearLampGeoms;
      for (const bl of browOffsets) {
        pushMatGeom(
          lampList,
          new THREE.CylinderGeometry(bl.r, bl.r, 0.06, 12),
          bl.x, bl.y, carCenterZ + s * 7.36,
          Math.PI * 0.5 - s * 0.48, 0, 0, 'XYZ'
        );
      }

      // 4. Dual Teardrop Cheek Headlights (Front) / Red Taillights (Rear)
      for (const side of [-1, 1]) {
        pushMatGeom(
          col.steelDarkGeoms,
          new THREE.BoxGeometry(0.22, 0.34, 0.12),
          side * 0.72, 0.68, zMid + s * 0.04,
          0, side * s * 0.20, side * 0.18, 'YXZ'
        );
        pushMatGeom(
          lampList,
          new THREE.BoxGeometry(0.14, 0.24, 0.05),
          side * 0.73, 0.68, zMid + s * 0.09,
          0, side * s * 0.20, side * 0.18, 'YXZ'
        );
      }

      // 5. Dellner Automatic Coupler & Obstacle Deflector Skirt
      const czCoup = carCenterZ + s * 8.68;
      pushMatGeom(col.steelDarkGeoms, new THREE.BoxGeometry(0.22, 0.16, 0.65), 0, -0.36, czCoup - s * 0.15, 0, ry, 0, 'YXZ');
      pushMatGeom(col.metalGeoms, new THREE.BoxGeometry(0.42, 0.28, 0.24), 0, -0.36, czCoup + s * 0.18, 0, ry, 0, 'YXZ');
      pushMatGeom(col.steelDarkGeoms, new THREE.CylinderGeometry(0.08, 0.08, 0.10, 10), 0, -0.34, czCoup + s * 0.31, Math.PI * 0.5, ry, 0, 'YXZ');
      pushMatGeom(col.steelDarkGeoms, new THREE.BoxGeometry(1.75, 0.28, 0.14), 0, -0.62, czCoup - s * 0.22, 0, ry, 0, 'YXZ');

      pushMatGeom(hoseGeoms, new THREE.CylinderGeometry(0.028, 0.028, 0.42, 8), -0.34 * s, -0.41, czCoup + s * 0.06, 0, ry, 0.22, 'YXZ');
      pushMatGeom(hoseGeoms, new THREE.CylinderGeometry(0.028, 0.028, 0.42, 8), 0.34 * s, -0.41, czCoup + s * 0.06, 0, ry, -0.22, 'YXZ');
    }

    const shieldMat = new THREE.MeshPhysicalMaterial({
      map: texNoseAtlas,
      roughness: 0.18,
      metalness: 0.30,
      clearcoat: 0.78,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.55,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    group.add(new THREE.Mesh(mergeStaticGeoms(shieldGeoms), shieldMat));
    group.add(new THREE.Mesh(mergeStaticGeoms(destGeoms), mats.trainBody));

    const frontLampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xf6fbff),
      emissiveIntensity: 2.6,
      roughness: 0.14
    });
    group.add(new THREE.Mesh(mergeStaticGeoms(frontLampGeoms), frontLampMat));

    const rearLampMat = new THREE.MeshStandardMaterial({
      color: 0xff2228,
      emissive: new THREE.Color(0xd91c24),
      emissiveIntensity: 1.9,
      roughness: 0.16
    });
    group.add(new THREE.Mesh(mergeStaticGeoms(rearLampGeoms), rearLampMat));

    const hoseRedMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.65 });
    group.add(new THREE.Mesh(mergeStaticGeoms(hoseGeoms), hoseRedMat));

    // Translucent Volumetric Headlight Cones (Front MC1 +Z)
    const coneGeo = new THREE.ConeGeometry(2.6, 16.0, 16, 1, true);
    coneGeo.translate(0, -8.0, 0);
    coneGeo.rotateX(-Math.PI * 0.5);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xdff2ff,
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    headlightConeL = new THREE.Mesh(coneGeo, coneMat);
    headlightConeL.position.set(-0.72, 0.68, 26.10);
    headlightConeL.visible = false;
    group.add(headlightConeL);

    headlightConeR = new THREE.Mesh(coneGeo, coneMat);
    headlightConeR.position.set(0.72, 0.68, 26.10);
    headlightConeR.visible = false;
    group.add(headlightConeR);

    return group;
  }

  // Build walkable Cabin Floor + Accordion Gangway Plates + Interior Cream FRP Walls, Ceiling, Decals & GoA3 Consoles (1 interior mesh + merged details)
  function buildInteriorFloorAndShell(mats, col) {
    const group = new THREE.Group();
    const b = createMeshBuilder(false);
    const hw = TD.interiorHalfWidth; // 1.205
    const aisleHW = TD.aisleWidth * 0.5; // 0.685
    const ceilY = TD.cabinCeilingY; // 2.02

    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      const noseDir = c === 0 ? -1 : (c === 2 ? 1 : 0);
      const zA = cz + (noseDir === -1 ? -7.95 : -8.55);
      const zB = cz + (noseDir === 1 ? 7.95 : 8.55);

      // Olive-sage center aisle
      b.addQuad(
        [-aisleHW, TD.cabinFloorY, zB],
        [aisleHW, TD.cabinFloorY, zB],
        [aisleHW, TD.cabinFloorY, zA],
        [-aisleHW, TD.cabinFloorY, zA],
        0, 1, 0, INT_UV.sageAisle, 2, 10
      );

      // Dark slate under-seat borders
      b.addQuad(
        [-hw, TD.cabinFloorY, zB],
        [-aisleHW, TD.cabinFloorY, zB],
        [-aisleHW, TD.cabinFloorY, zA],
        [-hw, TD.cabinFloorY, zA],
        0, 1, 0, INT_UV.slateBorder, 1, 8
      );
      b.addQuad(
        [aisleHW, TD.cabinFloorY, zB],
        [hw, TD.cabinFloorY, zB],
        [hw, TD.cabinFloorY, zA],
        [aisleHW, TD.cabinFloorY, zA],
        0, 1, 0, INT_UV.slateBorder, 1, 8
      );
    }

    // Inter-car gangway floor plates at z = -8.775 and +8.775
    for (const gz of [-8.775, 8.775]) {
      b.addBox(0, TD.cabinFloorY - 0.015, gz, 1.48, 0.03, 0.56, INT_UV.slateBorder, 1.0);
    }

    const doorSpans = [
      [-6.375, -5.025],
      [-0.675, 0.675],
      [5.025, 6.375]
    ];

    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      const noseDir = c === 0 ? -1 : (c === 2 ? 1 : 0);

      // Compute bay spans in local car coords -> world train coords
      const localZStart = noseDir === -1 ? -6.45 : -8.55;
      const localZEnd = noseDir === 1 ? 6.45 : 8.55;
      const segs = [];
      let cur = localZStart;
      for (const [d0, d1] of doorSpans) {
        const ds0 = Math.max(localZStart, d0);
        const ds1 = Math.min(localZEnd, d1);
        if (ds0 > cur + 0.02) segs.push([cur, ds0, true]);
        if (ds1 > ds0 + 0.02) segs.push([ds0, ds1, false]);
        cur = Math.max(cur, ds1);
      }
      if (localZEnd > cur + 0.02) segs.push([cur, localZEnd, true]);

      for (const side of [-1, 1]) {
        const xIn = side * hw;
        const nx = -side;

        for (const [la, lb, isBay] of segs) {
          const za = cz + la;
          const zb = cz + lb;

          // Above-window / above-door interior header (2.04 .. 2.28)
          const wTop = TD.doorHeight;
          const h00 = side > 0 ? [xIn, wTop, za] : [xIn, wTop, zb];
          const h10 = side > 0 ? [xIn, wTop, zb] : [xIn, wTop, za];
          const h11 = side > 0 ? [xIn, ceilY, zb] : [xIn, ceilY, za];
          const h01 = side > 0 ? [xIn, ceilY, za] : [xIn, ceilY, zb];
          b.addQuad(h00, h10, h11, h01, nx, 0, 0, INT_UV.creamWall, 2, 1);

          // Yellow Indonesian door warning header above doorways!
          if (!isBay) {
            const y00 = side > 0 ? [xIn - side * 0.015, wTop - 0.02, za + 0.08] : [xIn - side * 0.015, wTop - 0.02, zb - 0.08];
            const y10 = side > 0 ? [xIn - side * 0.015, wTop - 0.02, zb - 0.08] : [xIn - side * 0.015, wTop - 0.02, za + 0.08];
            const y11 = side > 0 ? [xIn - side * 0.015, wTop + 0.14, zb - 0.08] : [xIn - side * 0.015, wTop + 0.14, za + 0.08];
            const y01 = side > 0 ? [xIn - side * 0.015, wTop + 0.14, za + 0.08] : [xIn - side * 0.015, wTop + 0.14, zb - 0.08];
            b.addQuad(y00, y10, y11, y01, nx, 0, 0, INT_UV.doorWarnYellow, 1, 1);
          } else {
            // Lower interior cream FRP wall under window (0.02 .. 0.96)
            const l00 = side > 0 ? [xIn, 0.02, za] : [xIn, 0.02, zb];
            const l10 = side > 0 ? [xIn, 0.02, zb] : [xIn, 0.02, za];
            const l11 = side > 0 ? [xIn, 0.96, zb] : [xIn, 0.96, za];
            const l01 = side > 0 ? [xIn, 0.96, za] : [xIn, 0.96, zb];
            b.addQuad(l00, l10, l11, l01, nx, 0, 0, INT_UV.creamWall, 2, 1);

            // Window vertical interior trim pillars + 0.12m window sill/header thickness
            const pW = Math.min(0.22, (lb - la) * 0.25);
            for (const [pa, pb] of [[za, za + pW], [zb - pW, zb]]) {
              const w00 = side > 0 ? [xIn, 0.96, pa] : [xIn, 0.96, pb];
              const w10 = side > 0 ? [xIn, 0.96, pb] : [xIn, 0.96, pa];
              const w11 = side > 0 ? [xIn, wTop, pb] : [xIn, wTop, pa];
              const w01 = side > 0 ? [xIn, wTop, pa] : [xIn, wTop, pb];
              b.addQuad(w00, w10, w11, w01, nx, 0, 0, INT_UV.creamWall, 1, 1);
            }
            const xMidWall = side * (hw + 0.06);
            b.addBox(xMidWall, 0.955, (za + zb) * 0.5, 0.12, 0.03, zb - za, INT_UV.creamWall, 2.0);
            b.addBox(xMidWall, wTop + 0.005, (za + zb) * 0.5, 0.12, 0.03, zb - za, INT_UV.creamWall, 2.0);
          }
          // Door jamb vertical end caps closing wall cavity at doorways
          if (!isBay) {
            const xMidWall = side * (hw + 0.06);
            b.addBox(xMidWall, wTop * 0.5, za, 0.12, wTop, 0.03, INT_UV.creamWall, 2.0);
            b.addBox(xMidWall, wTop * 0.5, zb, 0.12, wTop, 0.03, INT_UV.creamWall, 2.0);
          }
        }
      }

      // Interior Ceiling Panels (full matte cream FRP ceiling between linear LEDs matching INKA iE203!)
      const cA = cz + (noseDir === -1 ? -7.85 : -8.55);
      const cB = cz + (noseDir === 1 ? 7.85 : 8.55);
      b.addQuad([-hw, ceilY, cA], [-0.22, ceilY, cA], [-0.22, ceilY, cB], [-hw, ceilY, cB], 0, -1, 0, INT_UV.creamWall, 1, 4);
      b.addQuad([0.22, ceilY, cA], [hw, ceilY, cA], [hw, ceilY, cB], [0.22, ceilY, cB], 0, -1, 0, INT_UV.creamWall, 1, 4);
      b.addQuad([-0.22, ceilY - 0.008, cA], [0.22, ceilY - 0.008, cA], [0.22, ceilY - 0.008, cB], [-0.22, ceilY - 0.008, cB], 0, -1, 0, INT_UV.creamWall, 1, 6);

      // End interior gangway frames (open 1.30m wide arch)
      for (const endDir of [-1, 1]) {
        if (endDir === noseDir) continue;
        const gz = cz + endDir * 8.53;
        const gIn = -endDir;
        b.addQuad(
          endDir > 0 ? [-hw, 0.02, gz] : [-0.66, 0.02, gz],
          endDir > 0 ? [-0.66, 0.02, gz] : [-hw, 0.02, gz],
          endDir > 0 ? [-0.66, ceilY, gz] : [-hw, ceilY, gz],
          endDir > 0 ? [-hw, ceilY, gz] : [-0.66, ceilY, gz],
          0, 0, gIn, INT_UV.creamWall, 1, 2
        );
        b.addQuad(
          endDir > 0 ? [0.66, 0.02, gz] : [hw, 0.02, gz],
          endDir > 0 ? [hw, 0.02, gz] : [0.66, 0.02, gz],
          endDir > 0 ? [hw, ceilY, gz] : [0.66, ceilY, gz],
          endDir > 0 ? [0.66, ceilY, gz] : [hw, ceilY, gz],
          0, 0, gIn, INT_UV.creamWall, 1, 2
        );
      }

      // GoA 3 Open Driverless Front / Rear Cab Consoles & Side Equipment Cabinets (NO bulkhead wall!)
      if (noseDir !== 0) {
        const s = noseDir;
        for (const side of [-1, 1]) {
          b.addBox(side * 0.96, 0.55, cz + s * 7.05, 0.44, 1.06, 1.15, INT_UV.creamWall, 0.8);
          b.addBox(side * 1.18, 0.52, cz + s * 7.65, 0.08, 1.00, 1.25, INT_UV.creamWall, 0.8);
        }
        // Main U-shaped front console housing (waist-high 0.95m!)
        b.addBox(0.0, 0.46, cz + s * 8.05, 1.82, 0.88, 0.72, INT_UV.creamWall, 0.8);
        // Sloped dark top dashboard bezel
        b.addBox(0.0, 0.92, cz + s * 7.98, 1.72, 0.10, 0.56, INT_UV.slateBorder, 0.8);
        // Overhead CCTV mount base inside interior mesh + emergency brake decal trim
        b.addBox(0, ceilY - 0.04, cz + s * 6.95, 0.14, 0.06, 0.14, INT_UV.creamWall, 0.5);
        // Sculpted side ceiling coving cornice runs along car
        for (const cSide of [-1, 1]) {
          b.addBox(cSide * (hw - 0.10), ceilY - 0.06, cz, 0.18, 0.10, 12.6, INT_UV.creamWall, 2.0);
        }
      }
    }

    const interiorMesh = new THREE.Mesh(b.toGeometry(false), mats.interiorWallMat);
    interiorMesh.receiveShadow = true;
    group.add(interiorMesh);

    // Merged GoA 3 Backlit Instrument Console Plates ('YXZ' tilts upward toward standing passenger!)
    const consoleMat = new THREE.MeshStandardMaterial({
      map: texConsole,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texConsoleEmissive,
      emissiveIntensity: 1.25,
      roughness: 0.35,
      metalness: 0.25
    });
    const consoleGeoms = [];
    for (const s of [-1, 1]) {
      const cz = s * TD.carPitch;
      pushMatGeom(consoleGeoms, new THREE.PlaneGeometry(1.66, 0.40), 0, 1.01, cz + s * 7.86, -0.62, s > 0 ? Math.PI : 0, 0, 'YXZ');

      pushMatGeom(col.metalGeoms, new THREE.CylinderGeometry(0.015, 0.018, 0.18, 8), -0.20, 1.04, cz + s * 7.82, -s * 0.22, 0, 0, 'YXZ');
      pushMatGeom(col.steelDarkGeoms, new THREE.SphereGeometry(0.032, 10, 8), -0.20, 1.13, cz + s * 7.80, 0, 0, 0, 'YXZ');
      pushMatGeom(col.metalGeoms, new THREE.CylinderGeometry(0.014, 0.016, 0.14, 8), 0.24, 1.02, cz + s * 7.82, 0, 0, 0, 'YXZ');
      pushMatGeom(col.steelDarkGeoms, new THREE.SphereGeometry(0.06, 10, 8), 0, ceilY - 0.08, cz + s * 6.95, 0, 0, 0, 'YXZ');
    }
    group.add(new THREE.Mesh(mergeStaticGeoms(consoleGeoms), consoleMat));

    // Inter-car Ribbed Accordion Gangways (30 ribs merged into col.steelDarkGeoms!)
    for (const gz of [-8.775, 8.775]) {
      for (let rib = -2; rib <= 2; rib++) {
        const rz = gz + rib * 0.095;
        const w = 1.48 + (rib % 2 === 0 ? 0.05 : -0.02);
        const h = ceilY - 0.06 + (rib % 2 === 0 ? 0.04 : 0.0);
        pushMatGeom(col.steelDarkGeoms, new THREE.BoxGeometry(0.11, h, 0.065), -w * 0.5, h * 0.5 + 0.02, rz);
        pushMatGeom(col.steelDarkGeoms, new THREE.BoxGeometry(0.11, h, 0.065), w * 0.5, h * 0.5 + 0.02, rz);
        pushMatGeom(col.steelDarkGeoms, new THREE.BoxGeometry(w + 0.11, 0.12, 0.065), 0, h + 0.02, rz);
      }
    }

    return group;
  }

  // Build Dentable & Soot-Charrable Longitudinal Cyan Bench Seats (1 mesh per car)
  function buildCarSeatsMesh(carIdx, noseDir, mats) {
    const b = createMeshBuilder(true);
    const cz = TD.carCentersZ[carIdx];

    // Bench spans per car side (local Z relative to car center)
    const benchBays = [
      [-4.90, -0.82],
      [0.82, 4.90]
    ];
    if (noseDir !== -1) benchBays.push([-8.35, -6.52]);
    if (noseDir !== 1) benchBays.push([6.52, 8.35]);

    for (const side of [-1, 1]) {
      for (let bi = 0; bi < benchBays.length; bi++) {
        const [zaLocal, zbLocal] = benchBays[bi];
        const len = zbLocal - zaLocal;
        const zMid = cz + (zaLocal + zbLocal) * 0.5;

        // Wheelchair bay on side = -1, middle-front bay of M2 (carIdx === 1, bi === 1) -> shorter folding blue jump seat!
        if (carIdx === 1 && side === -1 && bi === 1) {
          // Compact blue priority folding jump seat at zMid - 1.35, leaving open wheelchair parking space!
          b.addBox(side * 0.98, 0.24, zMid - 1.35, 0.36, 0.34, 0.72, INT_UV.creamWall, 0.35);
          b.addBox(side * 0.96, 0.44, zMid - 1.35, 0.38, 0.09, 0.72, INT_UV.cyanSeat, 0.35, null, [0.55, 0.72, 1.0]);
          b.addBox(side * 1.13, 0.68, zMid - 1.35, 0.11, 0.44, 0.72, INT_UV.cyanSeat, 0.35, null, [0.55, 0.72, 1.0]);
          continue;
        }

        // Cream FRP seat plinth (0.02 .. 0.38)
        b.addBox(side * 1.00, 0.20, zMid, 0.46, 0.36, len - 0.12, INT_UV.creamWall, 0.38);

        // Priority seats at door-end bays highlighted in deep sapphire blue
        const isPriority = bi === 0;
        const seatTint = isPriority ? [0.42, 0.58, 1.0] : null;
        b.addBox(side * 0.97, 0.42, zMid, 0.50, 0.09, len - 0.14, INT_UV.cyanSeat, 0.36, null, seatTint);
        b.addBox(side * 1.17, 0.68, zMid, 0.12, 0.46, len - 0.16, INT_UV.cyanSeat, 0.36, null, seatTint);
        // Sculpted upper cream headrest trim along backrest top (0.91 .. 0.96)
        b.addBox(side * 1.19, 0.935, zMid, 0.10, 0.05, len - 0.16, INT_UV.creamWall, 0.4);

        // Cream end dividers/armrests at both bench ends
        b.addBox(side * 0.99, 0.36, cz + zaLocal + 0.04, 0.48, 0.66, 0.07, INT_UV.creamWall, 0.35);
        b.addBox(side * 0.99, 0.36, cz + zbLocal - 0.04, 0.48, 0.66, 0.07, INT_UV.creamWall, 0.35);
      }
    }

    const dentData = b.toGeometry(true);
    const mesh = new THREE.Mesh(dentData.geometry, mats.dentSeatMat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    dentSeats.push({
      carIdx,
      mesh,
      geometry: dentData.geometry,
      basePositions: dentData.basePositions,
      baseNormals: dentData.baseNormals,
      dentAmounts: dentData.dentAmounts,
      localBox: dentData.geometry.boundingBox.clone()
    });
    return mesh;
  }

  // Push Brushed Stainless Vertical Stanchions & Twin Overhead Handrails into shared metal collector
  function buildHandrailsAndStanchions(col) {
    const pushCyl = (x, y, z, r, len, rotX, rotZ) => {
      const g = new THREE.CylinderGeometry(r, r, len, 8);
      if (rotX) g.rotateX(rotX);
      if (rotZ) g.rotateZ(rotZ);
      g.translate(x, y, z);
      col.metalGeoms.push({ geo: g, matrix: null });
    };

    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      const noseDir = c === 0 ? -1 : (c === 2 ? 1 : 0);
      const zA = cz + (noseDir === -1 ? -6.30 : -8.25);
      const zB = cz + (noseDir === 1 ? 6.30 : 8.25);
      const railLen = zB - zA;

      // Twin continuous overhead stainless handrails (y = TD.handrailHeight = 2.08, x = +-0.68)
      for (const side of [-1, 1]) {
        pushCyl(side * 0.68, TD.handrailHeight, (zA + zB) * 0.5, 0.018, railLen, Math.PI * 0.5, 0);

        // Overhead ceiling mounting brackets every ~2.2m up to TD.cabinCeilingY
        for (let bz = zA + 0.6; bz <= zB - 0.4; bz += 2.2) {
          pushCyl(side * 0.68, (TD.handrailHeight + TD.cabinCeilingY) * 0.5, bz, 0.014, TD.cabinCeilingY - TD.handrailHeight + 0.04, 0, 0);
        }

        // Vertical stanchions at doorways & seat ends reaching ceiling (matching photo 21!)
        const stanchionLocals = [-4.92, -0.80, 0.80, 4.92];
        for (const lz of stanchionLocals) {
          pushCyl(side * 0.72, 1.32, cz + lz, 0.019, 1.92, 0, 0);
          pushCyl(side * 0.88, 0.62, cz + lz, 0.017, 0.32, 0, Math.PI * 0.5);
        }

        // Center-car triple grab pole stanchion in door vestibule
        pushCyl(side * 0.72, 1.15, cz, 0.020, 2.24, 0, 0);

        // GoA 3 Cab side cabinet stainless top grab rails (photo 22!)
        if (noseDir !== 0) {
          pushCyl(side * 0.76, 1.13, cz + noseDir * 7.05, 0.019, 1.08, Math.PI * 0.5, 0);
          pushCyl(side * 0.76, 1.09, cz + noseDir * 6.56, 0.017, 0.12, 0, 0);
          pushCyl(side * 0.76, 1.09, cz + noseDir * 7.54, 0.017, 0.12, 0, 0);
        }
      }
    }
  }

  // Build Grey Triangular Hanging Straps InstancedMesh (~132 straps!)
  function buildHangingStraps() {
    // Construct a triangular ring + webbing strap centered at its top pivot (0, 0, 0) hanging downward (-Y)
    const parts = [];
    const strapWeb = new THREE.BoxGeometry(0.022, 0.12, 0.012);
    strapWeb.translate(0, -0.06, 0);
    parts.push(strapWeb);

    // Triangular grip made of 3 slim bars
    const leftBar = new THREE.BoxGeometry(0.016, 0.13, 0.018);
    leftBar.rotateZ(-0.42);
    leftBar.translate(-0.028, -0.175, 0);
    parts.push(leftBar);

    const rightBar = new THREE.BoxGeometry(0.016, 0.13, 0.018);
    rightBar.rotateZ(0.42);
    rightBar.translate(0.028, -0.175, 0);
    parts.push(rightBar);

    const botBar = new THREE.BoxGeometry(0.115, 0.020, 0.020);
    botBar.translate(0, -0.232, 0);
    parts.push(botBar);

    const geo = (window.THREE_UTILS && THREE_UTILS.mergeGeometries)
      ? THREE_UTILS.mergeGeometries(parts, false)
      : parts[0];
    for (const p of parts) { if (p !== geo) p.dispose(); }

    const mat = new THREE.MeshStandardMaterial({
      color: 0xa8acb0,
      roughness: 0.72,
      metalness: 0.08
    });

    // Place straps along both overhead rails in all 3 cars
    const coords = [];
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      const noseDir = c === 0 ? -1 : (c === 2 ? 1 : 0);
      const zA = cz + (noseDir === -1 ? -6.10 : -8.00);
      const zB = cz + (noseDir === 1 ? 6.10 : 8.00);
      for (const side of [-1, 1]) {
        for (let z = zA + 0.35; z <= zB - 0.35; z += 0.68) {
          coords.push({ x: side * 0.68, y: TD.handrailHeight, z, side });
        }
      }
    }

    strapInst = new THREE.InstancedMesh(geo, mat, coords.length);
    strapInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    handStraps.length = 0;
    for (let i = 0; i < coords.length; i++) {
      const pt = coords[i];
      handStraps.push({
        idx: i,
        basePos: new THREE.Vector3(pt.x, pt.y, pt.z),
        angX: 0,
        angZ: 0,
        velX: 0,
        velZ: 0,
        restX: 0,
        restZ: 0,
        snapped: false,
        phase: (i * 0.73) % (Math.PI * 2)
      });
      _m4.makeTranslation(pt.x, pt.y, pt.z);
      strapInst.setMatrixAt(i, _m4);
    }
    strapInst.instanceMatrix.needsUpdate = true;
    return strapInst;
  }

  // Build Twin Cool-White Linear Ceiling LED Strips (1 InstancedMesh using flickerTube shader!)
  function buildCeilingLights(mats) {
    const segGeo = new THREE.BoxGeometry(0.18, 0.024, 2.55);
    const placements = [];
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      const noseDir = c === 0 ? -1 : (c === 2 ? 1 : 0);
      const zOffsets = noseDir === -1
        ? [-4.2, -1.2, 1.8, 4.8, 7.2]
        : (noseDir === 1 ? [-7.2, -4.8, -1.8, 1.2, 4.2] : [-6.0, -3.0, 0.0, 3.0, 6.0]);

      for (const lz of zOffsets) {
        for (const side of [-1, 1]) {
          // Car 2 (M2) gets a couple subtly distressed flickering tubes for atmosphere!
          const initHealth = (c === 1 && Math.abs(lz) < 1.0 && side > 0) ? 0.42 : 1.0;
          placements.push({
            x: side * 0.42,
            y: TD.cabinCeilingY - 0.012,
            z: cz + lz,
            health: initHealth,
            baseHealth: initHealth,
            seed: (placements.length * 1.37 + 0.5) % 10.0
          });
        }
      }
    }

    const tubeStateArr = new Float32Array(placements.length * 2);
    for (let i = 0; i < placements.length; i++) {
      tubeStateArr[i * 2] = placements[i].seed;
      tubeStateArr[i * 2 + 1] = placements[i].health;
    }
    segGeo.setAttribute('aTubeState', new THREE.InstancedBufferAttribute(tubeStateArr, 2));

    tubeInst = new THREE.InstancedMesh(segGeo, mats.flickerTubeMat, placements.length);
    ceilingTubes.length = 0;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      _m4.makeTranslation(p.x, p.y, p.z);
      tubeInst.setMatrixAt(i, _m4);
      ceilingTubes.push({
        idx: i,
        pos: new THREE.Vector3(p.x, p.y, p.z),
        health: p.health,
        baseHealth: p.baseHealth
      });
    }
    tubeInst.instanceMatrix.needsUpdate = true;
    return tubeInst;
  }

  // Build Breakable Overhead Angled LCD PIS Route Screens (6 screens; housings merged into steelDarkGeoms!)
  function buildLcdScreens(group, mats, col) {
    baseLcdMat = new THREE.MeshStandardMaterial({
      map: texPisMap,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texPisMap,
      emissiveIntensity: 1.05,
      roughness: 0.25,
      metalness: 0.15
    });

    lcdScreens.length = 0;
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      for (const side of [-1, 1]) {
        const lcdZ = cz + (side > 0 ? 0.0 : 5.70 * (c === 2 ? -1 : 1));
        const ry = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
        const rx = 0.28; // tilted down toward center aisle (YXZ order)

        pushMatGeom(
          col.steelDarkGeoms,
          new THREE.BoxGeometry(0.92, 0.24, 0.05),
          side * 1.08, 2.08, lcdZ,
          rx, ry, 0, 'YXZ'
        );

        const matClone = baseLcdMat.clone();
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.20), matClone);
        face.rotation.order = 'YXZ';
        face.rotation.y = ry;
        face.rotation.x = rx;
        // Offset 0.027m outward along rotated normal (cos(rx) toward center aisle, sin(rx) downward)
        face.position.set(
          side * 1.08 + (side > 0 ? -0.026 : 0.026),
          2.08 - 0.008,
          lcdZ
        );
        group.add(face);

        lcdScreens.push({
          id: lcdScreens.length,
          mesh: face,
          mat: matClone,
          localPos: new THREE.Vector3(side * 1.08, 2.08, lcdZ),
          localBox: new THREE.Box3(
            new THREE.Vector3(side * 1.08 - 0.12, 1.94, lcdZ - 0.46),
            new THREE.Vector3(side * 1.08 + 0.12, 2.22, lcdZ + 0.46)
          ),
          hp: 20,
          broken: false
        });
      }
    }
  }

  // Build Animated Double-Leaf Sliding Pocket Doors (36 leaves + 36 shatterable door window panes)
  function buildDoors(mats) {
    // Door frame with cut-out window aperture (leaf width 0.675, height 2.04, centered at local (0, 0, 0))
    const b = createMeshBuilder(false);
    // Bottom solid panel (y = -1.02 .. -0.30)
    b.addBox(0, -0.66, 0, 0.06, 0.72, 0.675, LIVERY_UV.doorRedBand, 1.0);
    // Top header panel (y = 0.84 .. 1.02)
    b.addBox(0, 0.93, 0, 0.06, 0.18, 0.675, LIVERY_UV.doorUpperWhite, 1.0);
    // Front & rear vertical window stiles (y = -0.30 .. 0.84)
    b.addBox(0, 0.27, -0.255, 0.06, 1.14, 0.165, LIVERY_UV.doorWhite, 1.0);
    b.addBox(0, 0.27, 0.255, 0.06, 1.14, 0.165, LIVERY_UV.doorWhite, 1.0);
    const frameGeo = b.toGeometry(false);

    // Door glass pane fitting inside the aperture (0.35m wide x 1.14m tall)
    const glassGeo = new THREE.BoxGeometry(0.018, 1.14, 0.35);

    const totalLeaves = 3 * 3 * 2 * 2; // 36
    doorFrameInst = new THREE.InstancedMesh(frameGeo, mats.trainBody, totalLeaves);
    doorFrameInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    doorFrameInst.castShadow = false;

    doorGlassInst = new THREE.InstancedMesh(glassGeo, mats.glassMat, totalLeaves);
    doorGlassInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    doorLeaves.length = 0;
    let idx = 0;
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      for (let d = 0; d < 3; d++) {
        const dz = cz + TD.doorOffsetsLocal[d];
        for (const side of [-1, 1]) {
          for (const leafSign of [-1, 1]) {
            const baseX = side * (TD.halfWidth - 0.05);
            const baseY = 1.04; // bottom at y = 0.02, top at y = 2.06
            const baseZ = dz + leafSign * 0.338;

            const paneObj = {
              id: 'door_glass_' + idx,
              kind: 'door_glass',
              instIdx: idx,
              hp: 22,
              broken: false,
              side,
              baseX,
              baseY,
              baseZ,
              localBox: new THREE.Box3(
                new THREE.Vector3(baseX - 0.05, baseY - 0.30, baseZ - 0.18),
                new THREE.Vector3(baseX + 0.05, baseY + 0.84, baseZ + 0.18)
              )
            };
            glassPanes.push(paneObj);

            doorLeaves.push({
              instIdx: idx,
              carIdx: c,
              doorIdx: d,
              side,
              leafSign,
              baseX,
              baseY,
              baseZ,
              paneObj
            });
            idx++;
          }
        }
      }
    }
    updateDoorTransforms();
  }

  function updateDoorTransforms() {
    if (!doorFrameInst || !doorGlassInst) return;
    const slideDist = doorOpen * 0.67;

    for (let i = 0; i < doorLeaves.length; i++) {
      const dl = doorLeaves[i];
      // Only platform side (+X) opens at station so player never walks out track side!
      const slide = dl.side > 0 ? dl.leafSign * slideDist : 0.0;
      const curZ = dl.baseZ + slide;
      const curX = dl.baseX - (dl.side > 0 && doorOpen > 0.02 ? dl.side * 0.035 : 0);

      _m4.makeTranslation(curX, dl.baseY, curZ);
      doorFrameInst.setMatrixAt(dl.instIdx, _m4);

      if (dl.paneObj.broken) {
        _m4.makeScale(0, 0, 0);
        doorGlassInst.setMatrixAt(dl.instIdx, _m4);
      } else {
        _m4.makeTranslation(curX, dl.baseY + 0.27, curZ);
        doorGlassInst.setMatrixAt(dl.instIdx, _m4);
        dl.paneObj.localBox.min.set(curX - 0.06, dl.baseY - 0.22, curZ - 0.18);
        dl.paneObj.localBox.max.set(curX + 0.06, dl.baseY + 0.76, curZ + 0.18);
      }
    }
    doorFrameInst.instanceMatrix.needsUpdate = true;
    doorGlassInst.instanceMatrix.needsUpdate = true;
  }

  // Build Shatterable Side Bay Windows + Sloped Panoramic Front/Rear Windshields + Cab Quarter Windows
  function buildWindows(group, mats) {
    // Side bays per car: between doors (-4.82..-0.88, +0.88..+4.82) & end bays (-8.35..-6.58, +6.58..+8.35)
    const sideBaySpecs = [];
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      const noseDir = c === 0 ? -1 : (c === 2 ? 1 : 0);
      const bays = [
        { z0: -4.82, z1: -0.88 },
        { z0: 0.88, z1: 4.82 }
      ];
      if (noseDir !== -1) bays.push({ z0: -8.35, z1: -6.58 });
      if (noseDir !== 1) bays.push({ z0: 6.58, z1: 8.35 });

      for (const side of [-1, 1]) {
        for (const bay of bays) {
          const w = bay.z1 - bay.z0;
          const zMid = cz + (bay.z0 + bay.z1) * 0.5;
          sideBaySpecs.push({
            x: side * (TD.halfWidth - 0.045),
            y: 1.50,
            z: zMid,
            len: w,
            h: 1.08
          });
        }
      }
    }

    const unitPaneGeo = new THREE.BoxGeometry(0.022, 1.0, 1.0);
    sideGlassInst = new THREE.InstancedMesh(unitPaneGeo, mats.glassMat, sideBaySpecs.length);
    sideGlassInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < sideBaySpecs.length; i++) {
      const sp = sideBaySpecs[i];
      _m4.compose(
        _v1.set(sp.x, sp.y, sp.z),
        _q1.identity(),
        _s1.set(1, sp.h, sp.len)
      );
      sideGlassInst.setMatrixAt(i, _m4);

      glassPanes.push({
        id: 'side_glass_' + i,
        kind: 'side_glass',
        instIdx: i,
        hp: 25,
        broken: false,
        baseMatrix: _m4.clone(),
        localBox: new THREE.Box3(
          new THREE.Vector3(sp.x - 0.08, sp.y - sp.h * 0.5, sp.z - sp.len * 0.5),
          new THREE.Vector3(sp.x + 0.08, sp.y + sp.h * 0.5, sp.z + sp.len * 0.5)
        )
      });
    }
    sideGlassInst.instanceMatrix.needsUpdate = true;
    group.add(sideGlassInst);

    // Front (+Z) & Rear (-Z) Panoramic Sloped Windshields + 4 Cab Quarter Windows (1 InstancedMesh!)
    const cabPaneGeo = new THREE.PlaneGeometry(1.0, 1.0);
    cabGlassInst = new THREE.InstancedMesh(cabPaneGeo, mats.glassMat, 6);
    cabGlassInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    let cabIdx = 0;

    for (const s of [-1, 1]) {
      const cz = s * TD.carPitch;
      // Windshield spans y = 0.98..2.38, x = -0.84..+0.84, z: 8.48..7.84 (YXZ order)
      _e1.set(-0.44, s > 0 ? 0 : Math.PI, 0, 'YXZ');
      _q1.setFromEuler(_e1);
      _m4.compose(_v1.set(0, 1.68, cz + s * 8.16), _q1, _s1.set(1.74, 1.54, 1));
      cabGlassInst.setMatrixAt(cabIdx, _m4);

      glassPanes.push({
        id: 'windshield_' + (s > 0 ? 'front' : 'rear'),
        kind: 'cab_glass',
        instIdx: cabIdx++,
        hp: 25,
        broken: false,
        baseMatrix: _m4.clone(),
        localBox: new THREE.Box3(
          new THREE.Vector3(-0.90, 0.98, cz + s * 8.16 - 0.36),
          new THREE.Vector3(0.90, 2.38, cz + s * 8.16 + 0.36)
        )
      });

      // Cab side quarter windows (trapezoidal view ports flanking the console)
      for (const side of [-1, 1]) {
        _e1.set(0, side * (Math.PI * 0.5 - s * 0.24), 0, 'YXZ');
        _q1.setFromEuler(_e1);
        _m4.compose(_v1.set(side * (TD.halfWidth - 0.20), 1.56, cz + s * 7.62), _q1, _s1.set(0.95, 0.98, 1));
        cabGlassInst.setMatrixAt(cabIdx, _m4);

        glassPanes.push({
          id: 'cab_quarter_' + (s > 0 ? 'f' : 'r') + '_' + (side > 0 ? 'r' : 'l'),
          kind: 'cab_glass',
          instIdx: cabIdx++,
          hp: 22,
          broken: false,
          baseMatrix: _m4.clone(),
          localBox: new THREE.Box3(
            new THREE.Vector3(side * (TD.halfWidth - 0.20) - 0.16, 1.02, cz + s * 7.62 - 0.50),
            new THREE.Vector3(side * (TD.halfWidth - 0.20) + 0.16, 2.08, cz + s * 7.62 + 0.50)
          )
        });
      }
    }
    cabGlassInst.instanceMatrix.needsUpdate = true;
    group.add(cabGlassInst);
  }

  // Build MB-718 Bogies (6), Rotating Steel Wheels (24), & Roof I-Cond ACI-3601 HVAC Pods (6)
  function buildBogiesWheelsAndHvac(group, mats) {
    // Bogie frame geometry
    const bParts = [];
    const addPart = (sx, sy, sz, x, y, z) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(x, y, z);
      bParts.push(g);
    };
    addPart(0.14, 0.24, 2.45, -0.82, 0.0, 0);
    addPart(0.14, 0.24, 2.45, 0.82, 0.0, 0);
    addPart(1.80, 0.22, 0.45, 0, 0.08, 0); // bolster
    addPart(0.18, 0.26, 0.24, -0.88, -0.05, 0); // third-rail collector shoe bracket
    const bogieGeo = (window.THREE_UTILS && THREE_UTILS.mergeGeometries)
      ? THREE_UTILS.mergeGeometries(bParts, false) : bParts[0];
    for (const p of bParts) { if (p !== bogieGeo) p.dispose(); }

    bogieLocalCoords.length = 0;
    wheelLocalCoords.length = 0;
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      for (const bzOff of [-5.25, 5.25]) {
        const bz = cz + bzOff;
        bogieLocalCoords.push({ x: 0, y: -0.58, z: bz });
        for (const wzOff of [-0.95, 0.95]) {
          for (const side of [-1, 1]) {
            wheelLocalCoords.push({
              x: side * (TD.trackGauge * 0.5),
              y: TD.railTopY + WHEEL_RADIUS, // -0.61 -> bottom touches rail at -1.00!
              z: bz + wzOff
            });
          }
        }
      }
    }

    bogieInst = new THREE.InstancedMesh(bogieGeo, mats.steelDarkMat, bogieLocalCoords.length);
    for (let i = 0; i < bogieLocalCoords.length; i++) {
      const bc = bogieLocalCoords[i];
      _m4.makeTranslation(bc.x, bc.y, bc.z);
      bogieInst.setMatrixAt(i, _m4);
    }
    bogieInst.instanceMatrix.needsUpdate = true;
    group.add(bogieInst);

    // Flanged wheels (Cylinder rotated so axis is X)
    const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.13, 16);
    wheelGeo.rotateZ(Math.PI * 0.5);
    wheelInst = new THREE.InstancedMesh(wheelGeo, mats.steelDarkMat, wheelLocalCoords.length);
    wheelInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    updateWheels();
    group.add(wheelInst);

    // Roof I-Cond ACI-3601 HVAC Pods (2 per car = 6 pods)
    const hb = createMeshBuilder(false);
    hb.addBox(0, 0, 0, 1.78, 0.56, 2.75, LIVERY_UV.hvacPod, 2.0);
    hb.addBox(0, 0.30, 0, 1.56, 0.08, 2.45, LIVERY_UV.hvacPod, 2.0);
    const hvacGeo = hb.toGeometry(false);
    hvacInst = new THREE.InstancedMesh(hvacGeo, mats.trainBody, 6);
    hvacInst.castShadow = true;
    let hi = 0;
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      for (const hzOff of [-3.65, 3.65]) {
        _m4.makeTranslation(0, TD.roofDeckY + 0.28, cz + hzOff);
        hvacInst.setMatrixAt(hi++, _m4);
      }
    }
    hvacInst.instanceMatrix.needsUpdate = true;
    group.add(hvacInst);
  }

  function updateWheels() {
    if (!wheelInst) return;
    _q1.setFromAxisAngle(_v1.set(1, 0, 0), wheelAngle);
    for (let i = 0; i < wheelLocalCoords.length; i++) {
      const wc = wheelLocalCoords[i];
      _m4.compose(_v2.set(wc.x, wc.y, wc.z), _q1, _s1.set(1, 1, 1));
      wheelInst.setMatrixAt(i, _m4);
    }
    wheelInst.instanceMatrix.needsUpdate = true;
  }

  // Pre-allocate 16 train-parented scorch decals (ride permanently with trainVisualRoot!)
  function buildScorchPool(group, mats) {
    const geo = new THREE.PlaneGeometry(1.45, 1.45);
    scorchDecals.length = 0;
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(geo, mats.scorchMat);
      m.visible = false;
      group.add(m);
      scorchDecals.push(m);
    }
  }

  // Helper: build non-square extruded architectural polygon with meter-scaled UVs
  function buildExtrudedPolygon(pts2D, height, baseY, bx, bz, bevel, uvScale) {
    const shape = new THREE.Shape();
    shape.moveTo(pts2D[0][0], pts2D[0][1]);
    for (let i = 1; i < pts2D.length; i++) {
      shape.lineTo(pts2D[i][0], pts2D[i][1]);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: !!bevel,
      bevelThickness: bevel ? 0.14 : 0,
      bevelSize: bevel ? 0.14 : 0,
      bevelSegments: 1,
      curveSegments: 2
    });
    geo.rotateX(-Math.PI * 0.5);
    const nonIdx = geo.index ? geo.toNonIndexed() : geo;
    if (nonIdx !== geo) geo.dispose();

    const sc = uvScale || 0.16;
    const uv = nonIdx.attributes.uv;
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * sc, uv.getY(i) * sc);
      }
      uv.needsUpdate = true;
    }
    nonIdx.translate(bx, baseY, bz);
    nonIdx.computeVertexNormals();
    return nonIdx;
  }

  function pushExtrudedToBucket(bucket, pts2D, height, baseY, bx, bz, bevel, uvScale) {
    bucket.push({ geo: buildExtrudedPolygon(pts2D, height, baseY, bx, bz, bevel, uvScale), matrix: null });
  }

  function makeBuildingFootprint(variant, w, d) {
    const hw = w * 0.5;
    const hd = d * 0.5;
    if (variant === 0) {
      // L-shaped Jakarta commercial shophouse / office
      return [
        [-hw, -hd], [hw, -hd], [hw, 0.0],
        [0.05 * hw, 0.0], [0.05 * hw, hd], [-hw, hd]
      ];
    }
    if (variant === 1) {
      // Chamfered octagonal tower footprint
      const c = Math.min(hw, hd) * 0.34;
      return [
        [-hw + c, -hd], [hw - c, -hd], [hw, -hd + c],
        [hw, hd - c], [hw - c, hd], [-hw + c, hd],
        [-hw, hd - c], [-hw, -hd + c]
      ];
    }
    // Notched U-shaped courtyard building
    return [
      [-hw, -hd], [hw, -hd], [hw, hd],
      [hw * 0.35, hd], [hw * 0.35, hd * 0.15],
      [-hw * 0.35, hd * 0.15], [-hw * 0.35, hd], [-hw, hd]
    ];
  }

  // Build recycled 60m at-grade ground-level Jakarta urban rail corridor chunks
  function buildViaductCruiseChunks(mats) {
    const dims = C.STATION_DIMS || {};
    const railTopY = typeof dims.railTopY === 'number' ? dims.railTopY : -1.00;
    const trackBedY = typeof dims.trackBedY === 'number' ? dims.trackBedY : -1.18;
    const streetY = typeof dims.streetGroundY === 'number' ? dims.streetGroundY : -1.00;
    const sidewalkY = typeof dims.sidewalkY === 'number' ? dims.sidewalkY : -0.82;

    viaductGroup = new THREE.Group();
    viaductGroup.visible = false;
    viaductChunks.length = 0;

    // Continuous track bed & running rails directly under train during station handoff (z = -34..+34, never hits station buildings)
    const handoffB = createMeshBuilder(false);
    handoffB.addBox(0, (trackBedY - 0.12 + (railTopY - 0.06)) * 0.5, 0, 5.4, (railTopY - 0.06) - (trackBedY - 0.12), 68.0, [0, 0, 1.2, 14], 15);
    const handoffMesh = new THREE.Mesh(handoffB.toGeometry(false), mats.concreteRough);
    handoffMesh.receiveShadow = true;
    viaductGroup.add(handoffMesh);

    const handoffRailB = createMeshBuilder(false);
    handoffRailB.addBox(-TD.trackGauge * 0.5, railTopY - 0.045, 0, 0.075, 0.09, 68.0, [0, 0, 1, 12], 20);
    handoffRailB.addBox(TD.trackGauge * 0.5, railTopY - 0.045, 0, 0.075, 0.09, 68.0, [0, 0, 1, 12], 20);
    const handoffRailMesh = new THREE.Mesh(handoffRailB.toGeometry(false), mats.steelDarkMat);
    viaductGroup.add(handoffRailMesh);

    for (let c = 0; c < CHUNK_COUNT; c++) {
      const chunk = new THREE.Group();
      const ballastB = createMeshBuilder(false);
      const sidewalkB = createMeshBuilder(false);
      const railSteelB = createMeshBuilder(false);
      const tieB = createMeshBuilder(false);
      const beaconB = createMeshBuilder(false);
      const roadMarkB = createMeshBuilder(false);

      const facadeModernGeoms = [];
      const facadePlasterGeoms = [];
      const brickGeoms = [];
      const glassBldgGeoms = [];
      const roofTerraGeoms = [];
      const roofOchreGeoms = [];
      const treeGeoms = [];

      const hasCrossing = (c % 2 === 0);

      // 1. At-grade Ballasted Track Bed (-1.18..-1.06) + Sleepers + Steel Rails (top = -1.00)
      ballastB.addBox(-2.35, (trackBedY - 0.12 + (railTopY - 0.06)) * 0.5, 0, 9.6, (railTopY - 0.06) - (trackBedY - 0.12), CHUNK_LEN, [0, 0, 2, 12], 15);
      // Low concrete corridor curb dividers bordering the track bed
      ballastB.addBox(-7.22, streetY + 0.08, 0, 0.24, 0.36, CHUNK_LEN, [0, 0, 1, 12], 15);
      ballastB.addBox(2.52, streetY + 0.08, 0, 0.24, 0.36, CHUNK_LEN, [0, 0, 1, 12], 15);

      for (const tx of [0.0, -4.70]) {
        // Running steel rails (top flush at railTopY = -1.00)
        railSteelB.addBox(tx - TD.trackGauge * 0.5, railTopY - 0.045, 0, 0.075, 0.09, CHUNK_LEN, [0, 0, 1, 10], 20);
        railSteelB.addBox(tx + TD.trackGauge * 0.5, railTopY - 0.045, 0, 0.075, 0.09, CHUNK_LEN, [0, 0, 1, 10], 20);
        // 750V DC third rail coverboard (breaks at level crossing!)
        if (hasCrossing) {
          ballastB.addBox(tx - 1.15, railTopY + 0.06, -17.5, 0.22, 0.14, 25.0, [0, 0, 1, 5], 15);
          ballastB.addBox(tx - 1.15, railTopY + 0.06, 17.5, 0.22, 0.14, 25.0, [0, 0, 1, 5], 15);
        } else {
          ballastB.addBox(tx - 1.15, railTopY + 0.06, 0, 0.22, 0.14, CHUNK_LEN, [0, 0, 1, 12], 20);
        }
        // Sleepers (ties) along track
        for (let tz = -CHUNK_LEN * 0.5 + 0.6; tz < CHUNK_LEN * 0.5; tz += 1.0) {
          if (hasCrossing && Math.abs(tz) < 4.5) continue;
          tieB.addBox(tx, railTopY - 0.09, tz, 2.15, 0.08, 0.24, [0, 0, 1, 1], 3);
        }
      }

      // 2. Flanking Raised Sidewalks (top at sidewalkY = -0.82) & Jakarta Asphalt Avenues (y = -1.00)
      const curbH = sidewalkY - (streetY - 0.16);
      const curbMidY = (sidewalkY + (streetY - 0.16)) * 0.5;
      // Inner sidewalks bordering the rail bed
      sidewalkB.addBox(-9.05, curbMidY, 0, 3.6, curbH, CHUNK_LEN, [0, 0, 1.5, 16], 15);
      sidewalkB.addBox(4.35, curbMidY, 0, 3.6, curbH, CHUNK_LEN, [0, 0, 1.5, 16], 15);
      // Outer sidewalks flanking the avenues
      sidewalkB.addBox(-21.2, curbMidY, 0, 4.0, curbH, CHUNK_LEN, [0, 0, 1.6, 16], 15);
      sidewalkB.addBox(16.5, curbMidY, 0, 4.0, curbH, CHUNK_LEN, [0, 0, 1.6, 16], 15);

      // Asphalt avenue roadbeds at streetY = -1.00
      const westRoadGeo = new THREE.PlaneGeometry(8.6, CHUNK_LEN);
      westRoadGeo.rotateX(-Math.PI * 0.5);
      const wuv = westRoadGeo.attributes.uv;
      for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wuv.getX(i) * 1.4, wuv.getY(i) * 8.0);
      const westRoadMesh = new THREE.Mesh(westRoadGeo, mats.asphaltRoad);
      westRoadMesh.position.set(-15.0, streetY, 0);
      westRoadMesh.receiveShadow = true;
      chunk.add(westRoadMesh);

      const eastRoadGeo = westRoadGeo.clone();
      const eastRoadMesh = new THREE.Mesh(eastRoadGeo, mats.asphaltRoad);
      eastRoadMesh.position.set(10.3, streetY, 0);
      eastRoadMesh.receiveShadow = true;
      chunk.add(eastRoadMesh);

      // Dashed white lane dividers & center lines along both avenues
      for (let dz = -27; dz <= 27; dz += 6.0) {
        roadMarkB.addBox(-15.0, streetY + 0.012, dz, 0.14, 0.01, 2.8, [0, 0, 1, 1], 4);
        roadMarkB.addBox(10.3, streetY + 0.012, dz, 0.14, 0.01, 2.8, [0, 0, 1, 1], 4);
      }

      // 3. Level Crossing across tracks (flush at streetY = -1.00)
      if (hasCrossing) {
        // Rubberized concrete crossing pad across track bed
        ballastB.addBox(-2.35, streetY - 0.03, 0, 9.8, 0.06, 8.6, [0, 0, 2, 2], 6);
        // Crosswalk stripes on crossing & avenues
        for (let sx = -18.5; sx <= 13.8; sx += 1.2) {
          roadMarkB.addBox(sx, streetY + 0.014, -3.2, 0.52, 0.01, 1.8, [0, 0, 1, 1], 2);
          roadMarkB.addBox(sx, streetY + 0.014, 3.2, 0.52, 0.01, 1.8, [0, 0, 1, 1], 2);
        }
        // Crossing warning gate posts & beacons
        for (const cx of [-7.4, 2.7]) {
          for (const cz of [-4.6, 4.6]) {
            railSteelB.addBox(cx, sidewalkY + 1.4, cz, 0.18, 2.8, 0.18, [0, 0, 1, 1], 4);
            beaconB.addBox(cx, sidewalkY + 2.85, cz, 0.28, 0.28, 0.28, [0, 0, 1, 1], 2);
          }
        }
      }

      // 4. Streetlamps & Tropical Trees rooted on Sidewalks (y = -0.82)
      for (const sz of [-20, 0, 20]) {
        for (const lamp of [{ x: -8.1, dir: -1 }, { x: 3.4, dir: 1 }, { x: -19.8, dir: 1 }, { x: 15.1, dir: -1 }]) {
          railSteelB.addBox(lamp.x, sidewalkY + 2.9, sz, 0.14, 5.8, 0.14, [0, 0, 1, 1], 5);
          railSteelB.addBox(lamp.x + lamp.dir * 0.9, sidewalkY + 5.75, sz, 1.9, 0.11, 0.11, [0, 0, 1, 1], 4);
          beaconB.addBox(lamp.x + lamp.dir * 1.65, sidewalkY + 5.66, sz, 0.45, 0.10, 0.24, [0, 0, 1, 1], 2);
        }
      }

      for (let ti = 0; ti < 8; ti++) {
        const tSide = ti % 2 === 0 ? -1 : 1;
        const tx = tSide < 0 ? (-9.7 - (ti % 2) * 10.6) : (4.8 + (ti % 2) * 10.6);
        const tz = -24 + ti * 6.8;
        if (hasCrossing && Math.abs(tz) < 6.0) continue;
        tieB.addBox(tx, sidewalkY + 1.4, tz, 0.28, 2.8, 0.28, [0, 0, 1, 1], 4);
        pushMatGeom(treeGeoms, new THREE.IcosahedronGeometry(1.75, 1), tx, sidewalkY + 3.4, tz, 0, ti * 0.9, 0, 'YXZ');
        pushMatGeom(treeGeoms, new THREE.IcosahedronGeometry(1.25, 1), tx + 0.7, sidewalkY + 2.9, tz + 0.5, 0, ti * 0.4, 0, 'YXZ');
      }

      // 5. Non-Square Stepped & Chamfered ExtrudeGeometry Buildings flanking Avenues (y = -0.82)
      const seedBase = c * 19 + 7;
      for (let bi = 0; bi < 6; bi++) {
        const side = bi % 2 === 0 ? -1 : 1;
        const variant = (bi + c) % 3;
        const w = 11 + ((seedBase + bi * 7) % 8);
        const d = 11 + ((seedBase + bi * 11) % 7);
        const h = 16 + ((seedBase * (bi + 2) * 13) % 38);
        const bx = side < 0 ? -(29.5 + (bi % 2) * 7.5) : (24.5 + (bi % 2) * 7.5);
        const bz = -20.0 + Math.floor(bi / 2) * 20.0;

        const podH = Math.max(4.5, h * 0.26);
        const shaftH = h * 0.58;
        const crownH = h * 0.16;

        const podShape = makeBuildingFootprint(variant, w, d);
        const shaftShape = makeBuildingFootprint((variant + 1) % 3, w * 0.80, d * 0.80);
        const crownShape = makeBuildingFootprint(1, w * 0.56, d * 0.56);

        // Tier 1: Ground-level Shophouse / Retail Podium (alternating plaster, brick, modern concrete)
        const podBucket = (bi + c) % 3 === 0
          ? facadePlasterGeoms
          : ((bi + c) % 3 === 1 ? brickGeoms : facadeModernGeoms);
        pushExtrudedToBucket(podBucket, podShape, podH, sidewalkY, bx, bz, true, 0.18);

        // Tier 2: Curtain-wall glass or facade upper shaft
        if (h > 26) {
          pushExtrudedToBucket(glassBldgGeoms, shaftShape, shaftH, sidewalkY + podH, bx, bz, false, 0.14);
          pushExtrudedToBucket(facadeModernGeoms, crownShape, crownH, sidewalkY + podH + shaftH, bx, bz, true, 0.18);
          railSteelB.addBox(bx, sidewalkY + h + 1.8, bz, 0.20, 3.6, 0.20, [0, 0, 1, 1], 4);
          beaconB.addBox(bx, sidewalkY + h + 3.7, bz, 0.42, 0.42, 0.42, [0, 0, 1, 1], 2);
        } else {
          // 2-3 story Indonesian ruko with corrugated terracotta / ochre stepped roof!
          pushExtrudedToBucket(facadePlasterGeoms, shaftShape, shaftH * 0.6, sidewalkY + podH, bx, bz, false, 0.18);
          const roofBucket = (bi % 2 === 0) ? roofTerraGeoms : roofOchreGeoms;
          pushExtrudedToBucket(roofBucket, crownShape, 1.4, sidewalkY + podH + shaftH * 0.6, bx, bz, true, 0.22);
        }
      }

      const ballastMesh = new THREE.Mesh(ballastB.toGeometry(false), mats.concreteRough);
      ballastMesh.receiveShadow = true;
      const sidewalkMesh = new THREE.Mesh(sidewalkB.toGeometry(false), mats.sidewalkPaver);
      sidewalkMesh.receiveShadow = true;
      const railPoleMesh = new THREE.Mesh(railSteelB.toGeometry(false), mats.steelDarkMat);
      const tieMesh = new THREE.Mesh(tieB.toGeometry(false), mats.darkWood);
      const roadMarkMesh = new THREE.Mesh(roadMarkB.toGeometry(false), mats.skylineLit);
      const lightsMesh = new THREE.Mesh(beaconB.toGeometry(false), mats.amberBeacon);
      const treeMesh = new THREE.Mesh(mergeStaticGeoms(treeGeoms), mats.foliageTree);

      chunk.add(ballastMesh, sidewalkMesh, railPoleMesh, tieMesh, roadMarkMesh, lightsMesh, treeMesh);

      if (facadeModernGeoms.length) {
        const m = new THREE.Mesh(mergeStaticGeoms(facadeModernGeoms), mats.facadeModern);
        m.castShadow = true;
        m.receiveShadow = true;
        chunk.add(m);
      }
      if (facadePlasterGeoms.length) {
        const m = new THREE.Mesh(mergeStaticGeoms(facadePlasterGeoms), mats.facadePlaster);
        m.castShadow = true;
        m.receiveShadow = true;
        chunk.add(m);
      }
      if (brickGeoms.length) {
        const m = new THREE.Mesh(mergeStaticGeoms(brickGeoms), mats.brickWall);
        m.castShadow = true;
        m.receiveShadow = true;
        chunk.add(m);
      }
      if (glassBldgGeoms.length) {
        const m = new THREE.Mesh(mergeStaticGeoms(glassBldgGeoms), mats.glassBuilding);
        m.castShadow = true;
        m.receiveShadow = true;
        chunk.add(m);
      }
      if (roofTerraGeoms.length) {
        chunk.add(new THREE.Mesh(mergeStaticGeoms(roofTerraGeoms), mats.roofTerracotta));
      }
      if (roofOchreGeoms.length) {
        chunk.add(new THREE.Mesh(mergeStaticGeoms(roofOchreGeoms), mats.roofOchre));
      }

      chunk.userData = {
        girderMesh: ballastMesh,
        railPoleMesh,
        roadMesh: westRoadMesh,
        treeMesh
      };
      chunk.position.set(0, 0, (c - (CHUNK_COUNT * 0.5 - 0.5)) * CHUNK_LEN);
      viaductGroup.add(chunk);
      viaductChunks.push(chunk);
    }

    return viaductGroup;
  }

  // Register pre-allocated static & doorway local AABBs + interactables + projectile raycast boxes
  function initCollidersAndInteractables() {
    staticLocalColliders.length = 0;
    doorLocalColliders.length = 0;
    raycastLocalBoxes.length = 0;
    localInteractables.length = 0;

    const addRaycastBox = (minX, minY, minZ, maxX, maxY, maxZ, tag) => {
      raycastLocalBoxes.push({
        box: new THREE.Box3(
          new THREE.Vector3(minX, minY, minZ),
          new THREE.Vector3(maxX, maxY, maxZ)
        ),
        tag: tag || 'train_wall'
      });
    };

    const addStatic = (minX, minY, minZ, maxX, maxY, maxZ, tag, isFloor, raycastSolid) => {
      staticLocalColliders.push({
        minX, minY, minZ, maxX, maxY, maxZ,
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        tag: tag || 'train_wall',
        isFloor: !!isFloor,
        solid: true
      });
      if (raycastSolid) {
        addRaycastBox(minX, minY, minZ, maxX, maxY, maxZ, tag || 'train_wall');
      }
    };

    const hw = TD.interiorHalfWidth; // 1.25
    const wallOut = TD.halfWidth + 0.03; // 1.40
    const wallTop = TD.cabinCeilingY + 0.08;

    // 1. Indestructible Cabin Floor Deck across all 3 cars & gangways
    addStatic(-(hw + 0.05), -0.40, -25.45, hw + 0.05, TD.cabinFloorY, 25.45, 'train_floor', true, true);

    // 2. Indestructible Roof Ceiling containment (prevents jumping out roof) + solid roof shell for raycast
    addStatic(-(hw + 0.05), TD.cabinCeilingY + 0.02, -25.45, hw + 0.05, TD.cabinCeilingY + 0.35, 25.45, 'train_wall', false, false);
    addRaycastBox(-TD.halfWidth, TD.cabinCeilingY, -25.60, TD.halfWidth, TD.roofDeckY, 25.60, 'train_roof');

    // 3. Continuous -X side wall (player safety containment; bullets use segmented walls leaving window/door glass open)
    addStatic(-wallOut, 0.0, -25.60, -hw + 0.02, wallTop, 25.60, 'train_wall', false, false);

    // 4. +X side wall segments between the 9 doorways (player safety containment)
    const doorHalf = TD.doorClearWidth * 0.5; // 0.675
    let cur = -25.60;
    for (let i = 0; i < DOOR_WORLDS_Z.length; i++) {
      const dz = DOOR_WORLDS_Z[i];
      const d0 = dz - doorHalf;
      const d1 = dz + doorHalf;
      if (d0 > cur + 0.01) {
        addStatic(hw - 0.02, 0.0, cur, wallOut, wallTop, d0, 'train_wall', false, false);
      }
      // Doorway blocker (active when doorOpen < 0.65)
      doorLocalColliders.push({
        minX: hw - 0.02, minY: 0.0, minZ: d0,
        maxX: wallOut, maxY: wallTop, maxZ: d1,
        bridgeMinX: hw - 0.04, bridgeMinY: -0.18, bridgeMinZ: d0 - 0.06,
        bridgeMaxX: wallOut + 0.16, bridgeMaxY: TD.cabinFloorY, bridgeMaxZ: d1 + 0.06,
        tag: 'train_wall'
      });
      cur = d1;
    }
    if (25.60 > cur + 0.01) {
      addStatic(hw - 0.02, 0.0, cur, wallOut, wallTop, 25.60, 'train_wall', false, false);
    }

    // 4b. Projectile/LoS side wall framing (skirt + cantrail + pillars, keeping bay/quarter windows & open doors shoot-through)
    const wallSpans = [
      { z0: -8.55, z1: -6.375, win0: -8.35, win1: -6.58, end: -1 },
      { z0: -5.025, z1: -0.675, win0: -4.82, win1: -0.88, end: 0 },
      { z0: 0.675, z1: 5.025, win0: 0.88, win1: 4.82, end: 0 },
      { z0: 6.375, z1: 8.55, win0: 6.58, win1: 8.35, end: 1 }
    ];
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      const noseDir = c === 0 ? -1 : (c === 2 ? 1 : 0);
      for (const side of [-1, 1]) {
        const wx0 = side > 0 ? hw - 0.02 : -wallOut;
        const wx1 = side > 0 ? wallOut : -(hw - 0.02);
        for (let di = 0; di < 3; di++) {
          const dz = cz + TD.doorOffsetsLocal[di];
          addRaycastBox(wx0, TD.doorHeight, dz - doorHalf, wx1, wallTop, dz + doorHalf, 'train_wall');
        }
        for (let wi = 0; wi < wallSpans.length; wi++) {
          const sp = wallSpans[wi];
          const isNoseEnd = sp.end !== 0 && sp.end === noseDir;
          const sillY = isNoseEnd ? 1.02 : 0.96;
          const headY = isNoseEnd ? 2.08 : TD.doorHeight;
          const open0 = isNoseEnd ? (sp.end > 0 ? 7.12 : -8.12) : sp.win0;
          const open1 = isNoseEnd ? (sp.end > 0 ? 8.12 : -7.12) : sp.win1;
          addRaycastBox(wx0, 0.0, cz + sp.z0, wx1, sillY, cz + sp.z1, 'train_wall');
          addRaycastBox(wx0, headY, cz + sp.z0, wx1, wallTop, cz + sp.z1, 'train_wall');
          if (open0 > sp.z0 + 0.01) {
            addRaycastBox(wx0, sillY, cz + sp.z0, wx1, headY, cz + open0, 'train_wall');
          }
          if (sp.z1 > open1 + 0.01) {
            addRaycastBox(wx0, sillY, cz + open1, wx1, headY, cz + sp.z1, 'train_wall');
          }
        }
      }
    }

    // 5. Front (+Z) & Rear (-Z) Nose containment walls, low GoA3 consoles, & side cabinets
    for (const s of [-1, 1]) {
      const cz = s * TD.carPitch;
      // Front/rear player containment wall (y = 0..wallTop)
      const nw0 = cz + s * 8.18;
      const nw1 = cz + s * 8.65;
      const nz0 = Math.min(nw0, nw1);
      const nz1 = Math.max(nw0, nw1);
      addStatic(-(hw + 0.05), 0.0, nz0, hw + 0.05, wallTop, nz1, 'train_wall', false, false);

      // Projectile/LoS nose framing around open windshield aperture (x: -0.90..0.90, y: 0.98..2.38)
      addRaycastBox(-TD.halfWidth, -0.40, nz0, TD.halfWidth, 0.98, nz1, 'train_nose');
      addRaycastBox(-TD.halfWidth, 0.98, nz0, -0.90, 2.38, nz1, 'train_nose');
      addRaycastBox(0.90, 0.98, nz0, TD.halfWidth, 2.38, nz1, 'train_nose');
      addRaycastBox(-TD.halfWidth, 2.38, nz0, TD.halfWidth, TD.roofDeckY, nz1, 'train_nose');

      // GoA 3 Console Desk (waist-high 0.95m)
      const cd0 = cz + s * 7.68;
      const cd1 = cz + s * 8.32;
      addStatic(-0.92, 0.0, Math.min(cd0, cd1), 0.92, 0.98, Math.max(cd0, cd1), 'train_wall', false, true);

      // Cab side equipment cabinets
      const cab0 = cz + s * 6.48;
      const cab1 = cz + s * 7.64;
      addStatic(-1.22, 0.0, Math.min(cab0, cab1), -0.74, 1.10, Math.max(cab0, cab1), 'train_wall', false, true);
      addStatic(0.74, 0.0, Math.min(cab0, cab1), 1.22, 1.10, Math.max(cab0, cab1), 'train_wall', false, true);
    }

    // 6. Gangway narrow pinch walls (leaving 1.30m clear aisle between cars!)
    for (const gz of [-8.775, 8.775]) {
      addStatic(-1.26, 0.0, gz - 0.30, -0.66, 2.05, gz + 0.30, 'train_wall', false, true);
      addStatic(0.66, 0.0, gz - 0.30, 1.26, 2.05, gz + 0.30, 'train_wall', false, true);
    }

    // 7. Interior longitudinal bench seat colliders
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      const noseDir = c === 0 ? -1 : (c === 2 ? 1 : 0);
      const bays = [[-4.88, -0.84], [0.84, 4.88]];
      if (noseDir !== -1) bays.push([-8.32, -6.54]);
      if (noseDir !== 1) bays.push([6.54, 8.32]);

      for (const side of [-1, 1]) {
        for (let bi = 0; bi < bays.length; bi++) {
          if (c === 1 && side === -1 && bi === 1) continue; // open wheelchair bay
          const [za, zb] = bays[bi];
          const xMin = side > 0 ? 0.74 : -1.24;
          const xMax = side > 0 ? 1.24 : -0.74;
          addStatic(xMin, 0.0, cz + za, xMax, 0.92, cz + zb, 'train_wall', false, true);
        }
      }
    }

    // 8. Interactables inside the train (GoA 3 front/rear consoles + 3 center door depart panels + horn)
    localInteractables.push({
      id: 'train_depart_front',
      action: 'depart',
      pos: new THREE.Vector3(0.0, 1.05, 25.25),
      promptBoarded: 'BERANGKAT KE STASIUN BERIKUTNYA / DEPART TRAIN',
      promptCruise: null
    });
    localInteractables.push({
      id: 'train_depart_rear',
      action: 'depart',
      pos: new THREE.Vector3(0.0, 1.05, -25.25),
      promptBoarded: 'BERANGKAT KE STASIUN BERIKUTNYA / DEPART TRAIN',
      promptCruise: null
    });
    for (let c = 0; c < 3; c++) {
      localInteractables.push({
        id: 'train_depart_door_' + c,
        action: 'depart',
        pos: new THREE.Vector3(1.12, 1.25, TD.carCentersZ[c] + 0.76),
        promptBoarded: 'TUTUP PINTU & BERANGKAT / DEPART NOW',
        promptCruise: null
      });
    }
    localInteractables.push({
      id: 'train_horn_front',
      action: 'horn',
      pos: new THREE.Vector3(-0.55, 1.02, 25.05),
      promptBoarded: 'KLAKSON KERETA / SOUND LRT HORN',
      promptCruise: 'KLAKSON KERETA / SOUND LRT HORN'
    });

    // 9. Passenger Bench Seat Interactables (4 longitudinal bays per car = 12 seats total!)
    const seatBays = [
      { idx: 0, zMid: -2.86 },
      { idx: 1, zMid: 2.86 }
    ];
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      for (const side of [-1, 1]) {
        for (let sb = 0; sb < seatBays.length; sb++) {
          const bay = seatBays[sb];
          const isWheelchairFolding = (c === 1 && side === -1 && bay.idx === 1);
          const zLoc = cz + (isWheelchairFolding ? 1.50 : bay.zMid);
          const seatId = `train_seat_c${c}_s${side > 0 ? 'R' : 'L'}_${bay.idx}`;
          localInteractables.push({
            id: seatId,
            action: 'sit',
            pos: new THREE.Vector3(side * 0.68, 0.78, zLoc),
            seatLocal: {
              x: side * 0.90,
              y: 0.0,
              z: zLoc,
              yaw: side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5
            },
            standLocal: {
              x: side * 0.25,
              y: 0.0,
              z: zLoc
            },
            promptBoarded: 'DUDUK DI KURSI / SIT IN TRAIN SEAT',
            promptCruise: 'DUDUK DI KURSI / SIT IN TRAIN SEAT'
          });
        }
      }
    }
  }

  // Distance from point p to Box3
  function distToBox(p, box) {
    const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x);
    const dy = Math.max(box.min.y - p.y, 0, p.y - box.max.y);
    const dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function shatterGlassPane(pane, hitWorldPos) {
    if (pane.broken) return { shardsSpawned: false, sfxPlayed: false };
    pane.broken = true;
    stats.brokenWindows++;

    if (pane.kind === 'side_glass' && sideGlassInst) {
      _m4.makeScale(0, 0, 0);
      sideGlassInst.setMatrixAt(pane.instIdx, _m4);
      sideGlassInst.instanceMatrix.needsUpdate = true;
    } else if (pane.kind === 'cab_glass' && cabGlassInst) {
      _m4.makeScale(0, 0, 0);
      cabGlassInst.setMatrixAt(pane.instIdx, _m4);
      cabGlassInst.instanceMatrix.needsUpdate = true;
    } else if (pane.kind === 'door_glass') {
      updateDoorTransforms();
    } else if (pane.kind === 'mesh_glass' && pane.mesh) {
      pane.mesh.visible = false;
    }

    // World center of shattered pane
    pane.localBox.getCenter(_v1);
    if (trainVisualRoot) trainVisualRoot.localToWorld(_v1);

    safeAudioPlay('glass_shatter', { pos: hitWorldPos || _v1, pitchVar: 0.14 });
    let shardsSpawned = false;
    if (LRT.Weapons && typeof LRT.Weapons.spawnGlassShards === 'function') {
      const inheritVel = _v2.set(0, 0, speed > 0.5 ? -speed * 0.85 : 0);
      LRT.Weapons.spawnGlassShards(hitWorldPos || _v1, 20, inheritVel);
      shardsSpawned = true;
    }
    return { shardsSpawned, sfxPlayed: true };
  }

  function dentMeshFromBlast(entry, localPos, radius, maxDmg) {
    const b = entry.localBox;
    const dx = Math.max(b.min.x - localPos.x, 0, localPos.x - b.max.x);
    const dy = Math.max(b.min.y - localPos.y, 0, localPos.y - b.max.y);
    const dz = Math.max(b.min.z - localPos.z, 0, localPos.z - b.max.z);
    if (dx * dx + dy * dy + dz * dz > radius * radius) return false;

    const geo = entry.geometry;
    const posAttr = geo.attributes.position;
    const colAttr = geo.attributes.color;
    const posArr = posAttr.array;
    const colArr = colAttr.array;
    const basePos = entry.basePositions;
    const baseNorm = entry.baseNormals;
    const dents = entry.dentAmounts;
    const r2 = radius * radius;
    let touched = false;

    for (let i = 0, vi = 0; i < posArr.length; i += 3, vi++) {
      const vx = posArr[i] - localPos.x;
      const vy = posArr[i + 1] - localPos.y;
      const vz = posArr[i + 2] - localPos.z;
      const d2 = vx * vx + vy * vy + vz * vz;
      if (d2 >= r2) continue;

      touched = true;
      const d = Math.sqrt(d2);
      const falloff = 1.0 - d / radius;
      const f2 = falloff * falloff;

      // Deform inward along original normal, clamped at MAX_DENT (0.18m)
      const deltaDent = Math.min(MAX_DENT, (maxDmg / 240.0) * MAX_DENT * f2);
      const nextDent = Math.min(MAX_DENT, dents[vi] + deltaDent);
      dents[vi] = nextDent;

      posArr[i] = basePos[i] - baseNorm[i] * nextDent;
      posArr[i + 1] = basePos[i + 1] - baseNorm[i + 1] * nextDent;
      posArr[i + 2] = basePos[i + 2] - baseNorm[i + 2] * nextDent;

      // Char vertex color toward blackened soot
      const soot = Math.min(0.86, falloff * (maxDmg / 170.0));
      colArr[i] = Math.max(0.08, colArr[i] * (1.0 - soot) + 0.08 * soot);
      colArr[i + 1] = Math.max(0.07, colArr[i + 1] * (1.0 - soot) + 0.07 * soot);
      colArr[i + 2] = Math.max(0.06, colArr[i + 2] * (1.0 - soot) + 0.06 * soot);
    }

    if (touched) {
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      geo.computeVertexNormals();
      stats.dentedHits++;
    }
    return touched;
  }

  function stampTrainScorchDecal(localPos, radius) {
    if (!scorchDecals.length) return;
    // Clamp localPos onto closest train surface (hull side, floor, or nose)
    const decal = scorchDecals[scorchCursor % scorchDecals.length];
    scorchCursor++;
    stats.scorchDecals++;

    const clampedZ = Math.max(-25.8, Math.min(25.8, localPos.z));
    const clampedY = Math.max(0.03, Math.min(2.85, localPos.y));
    const absX = Math.abs(localPos.x);

    decal.scale.setScalar(Math.max(0.55, Math.min(1.55, radius * 0.25)));
    if (localPos.y <= 0.45 && absX < 1.15) {
      // Floor scorch
      decal.position.set(Math.max(-1.05, Math.min(1.05, localPos.x)), TD.cabinFloorY + 0.015, clampedZ);
      decal.rotation.set(-Math.PI * 0.5, 0, Math.random() * Math.PI * 2);
    } else if (Math.abs(localPos.z) > 25.0) {
      // Nose scorch
      const s = localPos.z >= 0 ? 1 : -1;
      decal.position.set(Math.max(-0.95, Math.min(0.95, localPos.x)), clampedY, s * 25.95);
      decal.rotation.set(0, s > 0 ? 0 : Math.PI, Math.random() * Math.PI * 2);
    } else {
      // Side hull / interior wall scorch
      const side = localPos.x >= 0 ? 1 : -1;
      const onInside = absX < 1.24;
      decal.position.set(side * (onInside ? 1.18 : 1.34), clampedY, clampedZ);
      decal.rotation.set(0, side * (onInside ? -Math.PI * 0.5 : Math.PI * 0.5), Math.random() * Math.PI * 2);
    }
    decal.visible = true;
  }

  function syncTrainLights() {
    const active = warmupActive || (state !== 'AWAY' && trainGroup && trainGroup.visible);
    if (headlightLight) {
      headlightLight.visible = true;
      headlightLight.position.set(localXToWorld(0), 1.05, localZToWorld(27.2));
      headlightLight.intensity = active ? headlightIntensityTarget : 0.0;
    }
    const atm = LRT.Station && typeof LRT.Station.getAtmosphere === 'function' ? LRT.Station.getAtmosphere() : null;
    const isDay = atm && atm.mood ? !!atm.mood.isDaylight : false;
    const bright = (LRT.Main && typeof LRT.Main.getBrightness === 'function') ? LRT.Main.getBrightness() : 1.0;
    const bFactor = bright <= 1.0 ? (0.28 + 0.72 * bright) : (1.0 + (bright - 1.0) * 0.35);
    const baseCabin = isDay ? 1.85 : (0.44 * bFactor);
    for (let i = 0; i < cabinLights.length; i++) {
      const cl = cabinLights[i];
      cl.visible = true;
      cl.position.set(localXToWorld(0), 1.86, localZToWorld(CABIN_LIGHT_Z[i]));
      if (!active) {
        cl.intensity = 0.0;
      } else if (isDay) {
        cl.intensity = baseCabin;
      } else {
        // Eerie dark-mode fluorescent blink/flicker inside train cars (strongest in middle Car 2)
        const s1 = Math.sin(animTime * (9.5 + i * 3.7) + i * 2.1);
        const s2 = Math.sin(animTime * 23.0 + i * 5.3);
        let flick = 1.0;
        if (i === 1) {
          const cycle = (animTime * 0.65 + 0.4) % 4.0;
          flick = (cycle > 2.6 && s1 > -0.15) ? 0.14 : (s2 < -0.55 ? 0.42 : 0.88);
        } else {
          flick = (s1 < -0.72 && s2 < -0.25) ? 0.28 : (0.76 + 0.24 * s1);
        }
        cl.intensity = baseCabin * flick;
      }
    }
    if (!isDay && active && tubeInst && tubeInst.geometry && tubeInst.geometry.attributes.aTubeState) {
      const attr = tubeInst.geometry.attributes.aTubeState;
      for (let i = 0; i < ceilingTubes.length; i++) {
        const t = ceilingTubes[i];
        if (t.health <= 0.05) continue;
        const flickerGate = Math.sin(animTime * (7.0 + t.seed * 3.1) + i * 1.9);
        const drop = (i % 5 === 1 && flickerGate < -0.58) ? 0.12 : (i % 7 === 3 && Math.sin(animTime * 19.0 + i) < -0.7 ? 0.25 : 0.72);
        attr.array[i * 2 + 1] = Math.min(t.health, t.baseHealth * drop);
      }
      attr.needsUpdate = true;
    } else if (isDay && tubeInst && tubeInst.geometry && tubeInst.geometry.attributes.aTubeState) {
      const attr = tubeInst.geometry.attributes.aTubeState;
      let dirty = false;
      for (let i = 0; i < ceilingTubes.length; i++) {
        if (Math.abs(attr.array[i * 2 + 1] - ceilingTubes[i].health) > 0.01) {
          attr.array[i * 2 + 1] = ceilingTubes[i].health;
          dirty = true;
        }
      }
      if (dirty) attr.needsUpdate = true;
    }
  }

  function init(scene) {
    if (initialized) return LRT.Train;
    sceneRef = scene;

    buildProceduralTrainTextures();
    const mats = getTrainMaterials();

    trainGroup = new THREE.Group();
    trainGroup.position.set(0, 0, -180);
    trainGroup.visible = false;

    trainVisualRoot = new THREE.Group();
    trainGroup.add(trainVisualRoot);

    // Always-visible lights container in scene (toggles .intensity=0, NEVER .visible, eliminating shader recompiles!)
    trainLightsGroup = new THREE.Group();
    headlightLight = new THREE.PointLight(0xeef6ff, 0.0, 44, 1.55);
    headlightLight.castShadow = false;
    headlightLight.visible = true;
    headlightLight.position.set(0, 1.05, 27.2 - 180);
    trainLightsGroup.add(headlightLight);

    cabinLights.length = 0;
    for (let i = 0; i < CABIN_LIGHT_Z.length; i++) {
      const cl = new THREE.PointLight(i % 2 === 0 ? 0xf2f7ff : 0xfff3df, 0.0, 13.5, 1.55);
      cl.castShadow = false;
      cl.visible = true;
      cl.position.set(0, 1.86, CABIN_LIGHT_Z[i] - 180);
      trainLightsGroup.add(cl);
      cabinLights.push(cl);
    }

    // 1. 3 Dentable Exterior Car Hulls (MC3, M2, MC1)
    dentHulls.length = 0;
    const noseDirs = [-1, 0, 1];
    for (let c = 0; c < 3; c++) {
      const dentData = buildCarExteriorHull(c, noseDirs[c]);
      const hullMesh = new THREE.Mesh(dentData.geometry, mats.dentHullMat);
      hullMesh.position.set(0, 0, TD.carCentersZ[c]);
      hullMesh.castShadow = true;
      hullMesh.receiveShadow = true;
      trainVisualRoot.add(hullMesh);

      const worldLocalBox = dentData.geometry.boundingBox.clone();
      worldLocalBox.translate(new THREE.Vector3(0, 0, TD.carCentersZ[c]));
      dentHulls.push({
        carIdx: c,
        cz: TD.carCentersZ[c],
        mesh: hullMesh,
        geometry: dentData.geometry,
        basePositions: dentData.basePositions,
        baseNormals: dentData.baseNormals,
        dentAmounts: dentData.dentAmounts,
        localBox: worldLocalBox
      });
    }

    const collectors = { steelDarkGeoms: [], metalGeoms: [] };

    // 2. Front & Rear Nose KAI Overlays, Lights, Headlight Cone, & Dellner Couplers
    trainVisualRoot.add(buildNoseDetails(mats, collectors));

    // 3. Walkable Cabin Floor, Cream FRP Walls, GoA 3 Open Consoles, & Accordion Gangways
    trainVisualRoot.add(buildInteriorFloorAndShell(mats, collectors));

    // 4. 3 Dentable Interior Cyan Bench Seat Meshes
    dentSeats.length = 0;
    for (let c = 0; c < 3; c++) {
      trainVisualRoot.add(buildCarSeatsMesh(c, noseDirs[c], mats));
    }

    // 5. Brushed Stainless Vertical Stanchions & Twin Overhead Handrails (merged w/ coupler heads & cab sticks)
    buildHandrailsAndStanchions(collectors);

    // 6. Grey Triangular Hanging Straps (InstancedMesh)
    trainVisualRoot.add(buildHangingStraps());

    // 7. Twin Cool-White Linear LED Ceiling Strips (InstancedMesh w/ flicker shader)
    trainVisualRoot.add(buildCeilingLights(mats));

    // 8. Breakable Angled Overhead LCD PIS Route Screens
    buildLcdScreens(trainVisualRoot, mats, collectors);

    // 9. Merged Static Dark Steel & Brushed Stainless Details (1 draw call each!)
    if (collectors.steelDarkGeoms.length) {
      trainVisualRoot.add(new THREE.Mesh(mergeStaticGeoms(collectors.steelDarkGeoms), mats.steelDarkMat));
    }
    if (collectors.metalGeoms.length) {
      trainVisualRoot.add(new THREE.Mesh(mergeStaticGeoms(collectors.metalGeoms), mats.metalMat));
    }

    // 10. Animated Double-Leaf Pocket Doors + Door Glass
    buildDoors(mats);
    trainVisualRoot.add(doorFrameInst);
    trainVisualRoot.add(doorGlassInst);

    // 11. Shatterable Side Bay Windows + Panoramic Front/Rear Windshields + Quarter Windows
    buildWindows(trainVisualRoot, mats);

    // 12. MB-718 Bogies, Rotating Wheels, & Roof HVAC Pods
    buildBogiesWheelsAndHvac(trainVisualRoot, mats);

    // 13. Pre-allocated Train-Parented Scorch Decals
    buildScorchPool(trainVisualRoot, mats);

    // 14. Recycled 60m Ground-Level Jakarta Rail Corridor Cruise Chunks
    buildViaductCruiseChunks(mats);

    if (sceneRef) {
      sceneRef.add(trainGroup);
      sceneRef.add(trainLightsGroup);
      sceneRef.add(viaductGroup);
    }

    initCollidersAndInteractables();
    initialized = true;
    syncTrainLights();
    return LRT.Train;
  }

  function resetDamage() {
    stats.brokenWindows = 0;
    stats.brokenLcds = 0;
    stats.snappedStraps = 0;
    stats.dentedHits = 0;
    stats.scorchDecals = 0;

    // Restore glass panes
    for (let i = 0; i < glassPanes.length; i++) {
      const p = glassPanes[i];
      p.broken = false;
      p.hp = p.id.startsWith('windshield') ? 25 : 22;
      if (p.kind === 'side_glass' && sideGlassInst) {
        sideGlassInst.setMatrixAt(p.instIdx, p.baseMatrix);
      } else if (p.kind === 'cab_glass' && cabGlassInst) {
        cabGlassInst.setMatrixAt(p.instIdx, p.baseMatrix);
      } else if (p.kind === 'mesh_glass' && p.mesh) {
        p.mesh.visible = true;
      }
    }
    if (sideGlassInst) sideGlassInst.instanceMatrix.needsUpdate = true;
    if (cabGlassInst) cabGlassInst.instanceMatrix.needsUpdate = true;

    // Restore dentable hulls & seats
    const restoreDent = (list) => {
      for (const entry of list) {
        const posAttr = entry.geometry.attributes.position;
        const colAttr = entry.geometry.attributes.color;
        posAttr.array.set(entry.basePositions);
        entry.dentAmounts.fill(0);
        colAttr.array.fill(1.0);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        entry.geometry.computeVertexNormals();
      }
    };
    restoreDent(dentHulls);
    restoreDent(dentSeats);

    // Restore LCDs
    for (const lcd of lcdScreens) {
      lcd.broken = false;
      lcd.hp = 20;
      lcd.mat.emissiveIntensity = 1.05;
      lcd.mat.color.setHex(0xffffff);
    }

    // Restore straps
    for (const st of handStraps) {
      st.snapped = false;
      st.angX = 0;
      st.angZ = 0;
      st.velX = 0;
      st.velZ = 0;
      st.restX = 0;
      st.restZ = 0;
    }

    // Restore ceiling tubes
    if (tubeInst) {
      const attr = tubeInst.geometry.attributes.aTubeState;
      for (let i = 0; i < ceilingTubes.length; i++) {
        ceilingTubes[i].health = ceilingTubes[i].baseHealth;
        attr.array[i * 2 + 1] = ceilingTubes[i].health;
      }
      attr.needsUpdate = true;
    }

    // Hide scorch decals
    for (const sd of scorchDecals) {
      sd.visible = false;
    }
  }

  function reset(mode) {
    gameMode = mode || 'survival';
    state = 'AWAY';
    activeTrackX = 0.0;
    travelDir = 1;
    trainZ = -180.0;
    speed = 0.0;
    accel = 0.0;
    doorOpen = 0.0;
    doorsTarget = 0.0;
    pendingDepart = false;
    brakeSoundPlayed = false;
    approachSoundPlayed = false;
    rideTime = 0.0;
    rideDist = 0.0;
    oldDisposed = false;
    nextSpawned = false;
    incomingStationZ = 220.0;
    activeOldRootGroup = null;

    if (trainGroup) {
      trainGroup.position.set(0, 0, trainZ);
      trainGroup.rotation.set(0, 0, 0);
      trainGroup.visible = false;
    }
    if (trainVisualRoot) {
      trainVisualRoot.position.set(0, 0, 0);
      trainVisualRoot.rotation.set(0, 0, 0);
    }
    if (viaductGroup) {
      viaductGroup.visible = false;
      viaductGroup.position.set(0, 0, 0);
    }
    setHeadlights(false, 0.0);
    syncTrainLights();

    if (LRT.Audio && typeof LRT.Audio.stopLoop === 'function') {
      LRT.Audio.stopLoop('train_ride_loop', 0.15);
    }

    resetDamage();
    updateDoorTransforms();
  }

  function setHeadlights(on, intensity) {
    headlightIntensityTarget = on ? (intensity !== undefined ? intensity : 2.8) : 0.0;
    if (headlightLight) {
      headlightLight.visible = true;
      headlightLight.intensity = (warmupActive || (state !== 'AWAY' && trainGroup && trainGroup.visible))
        ? headlightIntensityTarget
        : 0.0;
    }
    if (headlightConeL) headlightConeL.visible = !!on;
    if (headlightConeR) headlightConeR.visible = !!on;
  }

  function startApproach(opts) {
    if (!initialized) return;
    if (state !== 'AWAY') return;
    activeTrackX = (opts && typeof opts.trackX === 'number') ? opts.trackX : 0.0;
    travelDir = (opts && opts.direction === -1) ? -1 : 1;
    if (opts && opts.nextStationName) {
      currentStationName = opts.nextStationName;
      repaintPisLcd(currentStationName);
    }

    state = 'APPROACHING';
    trainZ = -180.0 * travelDir;
    speed = 26.5;
    accel = -1.95;
    doorOpen = 0.0;
    doorsTarget = 0.0;
    pendingDepart = false;
    brakeSoundPlayed = false;
    approachSoundPlayed = true;

    trainGroup.position.set(activeTrackX, 0, trainZ);
    trainGroup.rotation.set(0, travelDir === -1 ? Math.PI : 0, 0);
    trainGroup.visible = true;
    setHeadlights(true, 3.6);
    syncTrainLights();
    updateDoorTransforms();

    safeAudioPlay('train_approach', { gain: 0.9 });
    safeAudioPlay('train_horn', { gain: 0.7 });
  }

  function openDoors() {
    if (doorsTarget < 0.5) {
      doorsTarget = 1.0;
      safeAudioPlay('door_chime', { gain: 0.85 });
      safeAudioPlay('door_open', { gain: 0.85 });
    }
  }

  function closeDoors() {
    if (doorsTarget > 0.5) {
      doorsTarget = 0.0;
      safeAudioPlay('door_chime', { gain: 0.85 });
      safeAudioPlay('door_close', { gain: 0.85 });
    }
  }

  function departNow() {
    if (state !== 'BOARDED_WAIT' && state !== 'APPROACHING') return false;
    if (state === 'APPROACHING') return false;
    pendingDepart = true;
    if (doorsTarget > 0.5) closeDoors();
    return true;
  }

  function beginDeparture(stationRef) {
    pendingDepart = false;
    state = 'DEPARTING';
    speed = 0.0;
    accel = 7.4;
    rideTime = 0.0;
    rideDist = 0.0;
    oldDisposed = false;
    nextSpawned = false;
    incomingStationZ = 215.0 * travelDir;
    activeOldRootGroup = (stationRef && stationRef.rootGroup) ? stationRef.rootGroup : null;

    setHeadlights(true, 2.2);
    if (viaductGroup) {
      viaductGroup.visible = true;
      viaductGroup.position.set(activeTrackX, 0, 0);
      for (let c = 0; c < CHUNK_COUNT; c++) {
        viaductChunks[c].position.set(0, 0, (c - (CHUNK_COUNT * 0.5 - 0.5)) * CHUNK_LEN);
      }
    }
    if (LRT.Audio && typeof LRT.Audio.startLoop === 'function') {
      LRT.Audio.startLoop('train_ride_loop', 0.25, 0.6, 0.85);
    }
  }

  function updateStrapsAndSway(dt) {
    const isMoving = speed > 0.2;
    if (trainVisualRoot) {
      if (isMoving) {
        const spFactor = Math.min(1.0, speed / CRUISE_SPEED);
        const targetRoll = Math.sin(animTime * 2.3) * 0.0065 * spFactor;
        const targetPitch = Math.sin(animTime * 3.7) * 0.0028 * spFactor - Math.max(-0.006, Math.min(0.006, accel * 0.0005));
        const clackPhase = Math.sin(animTime * 11.5);
        const railBob = (clackPhase > 0.92 ? -0.0055 : 0.0) * spFactor + Math.sin(animTime * 5.2) * 0.0025 * spFactor;

        trainVisualRoot.rotation.z += (targetRoll - trainVisualRoot.rotation.z) * Math.min(1, dt * 8);
        trainVisualRoot.rotation.x += (targetPitch - trainVisualRoot.rotation.x) * Math.min(1, dt * 8);
        trainVisualRoot.position.y += (railBob - trainVisualRoot.position.y) * Math.min(1, dt * 14);
      } else {
        trainVisualRoot.rotation.z *= Math.max(0, 1 - dt * 8);
        trainVisualRoot.rotation.x *= Math.max(0, 1 - dt * 8);
        trainVisualRoot.position.y *= Math.max(0, 1 - dt * 8);
      }
    }

    if (!strapInst) return;
    const inertialX = Math.max(-0.22, Math.min(0.22, -accel * 0.025));
    const swayZ = isMoving ? Math.sin(animTime * 2.3) * 0.055 * (speed / CRUISE_SPEED) : 0;

    for (let i = 0; i < handStraps.length; i++) {
      const st = handStraps[i];
      const targetX = st.snapped ? st.restX : inertialX + Math.sin(animTime * 2.1 + st.phase) * 0.03 * (speed / CRUISE_SPEED);
      const targetZ = st.snapped ? st.restZ : swayZ + Math.cos(animTime * 2.6 + st.phase) * 0.025 * (speed / CRUISE_SPEED);

      const k = st.snapped ? 26.0 : 18.0;
      const damp = st.snapped ? 1.45 : 3.2;

      st.velX += ((targetX - st.angX) * k - st.velX * damp) * dt;
      st.velZ += ((targetZ - st.angZ) * k - st.velZ * damp) * dt;
      st.angX += st.velX * dt;
      st.angZ += st.velZ * dt;

      // Clamp extreme angles
      st.angX = Math.max(-1.25, Math.min(1.25, st.angX));
      st.angZ = Math.max(-1.25, Math.min(1.25, st.angZ));

      _e1.set(st.angX, 0, st.angZ);
      _q1.setFromEuler(_e1);
      _m4.compose(st.basePos, _q1, _s1.set(1, 1, 1));
      strapInst.setMatrixAt(i, _m4);
    }
    strapInst.instanceMatrix.needsUpdate = true;
  }

  function updateViaductChunks(dt, stationZ) {
    if (!viaductGroup || !viaductGroup.visible) return;
    viaductGroup.position.set(activeTrackX, 0, 0);
    const scroll = travelDir * speed * dt;
    const halfSpan = CHUNK_LEN * CHUNK_COUNT * 0.5;
    for (let i = 0; i < viaductChunks.length; i++) {
      const ch = viaductChunks[i];
      if (state === 'DEPARTING' || state === 'CRUISE' || state === 'ARRIVING') {
        ch.position.z -= scroll;
        if (ch.position.z < -halfSpan) {
          ch.position.z += CHUNK_LEN * CHUNK_COUNT;
        } else if (ch.position.z > halfSpan) {
          ch.position.z -= CHUNK_LEN * CHUNK_COUNT;
        }
      }
      // Hide corridor chunk anywhere it could touch station + city district (district +-118m + chunk +-30m = 148m)
      const dz = stationZ !== null ? Math.abs(ch.position.z - stationZ) : 999;
      const hideDeck = !warmupActive && dz < 149.0;
      ch.visible = !hideDeck;
    }
  }

  function update(dt, stationRef, onDisposeOld, onSpawnNext) {
    if (!initialized) return;
    const clampedDt = Math.min(dt || 0.016, 0.05);
    animTime += clampedDt;

    // Update doors
    const prevDoor = doorOpen;
    if (Math.abs(doorsTarget - doorOpen) > 0.001) {
      const dir = doorsTarget > doorOpen ? 1 : -1;
      doorOpen = Math.max(0, Math.min(1, doorOpen + dir * clampedDt * 1.35));
      updateDoorTransforms();
    }
    if (stationRef && typeof stationRef.setPsdOpen === 'function' && (state === 'BOARDED_WAIT' || Math.abs(doorOpen - prevDoor) > 0.0001)) {
      stationRef.setPsdOpen(doorOpen, travelDir);
    }

    let stationWorldZ = stationRef && stationRef.rootGroup ? stationRef.rootGroup.position.z : 0;

    if (state === 'APPROACHING') {
      // Smooth kinematic approach toward z = 0 along active travelDir (+1 or -1)
      const distRemaining = Math.max(0, -trainZ * travelDir);
      speed = Math.max(1.8, Math.min(26.5, Math.sqrt(2.0 * 1.98 * distRemaining)));
      accel = -1.98;
      trainZ += travelDir * speed * clampedDt;

      if (!brakeSoundPlayed && trainZ * travelDir >= -58.0) {
        brakeSoundPlayed = true;
        safeAudioPlay('train_brake', { gain: 0.9 });
      }

      if (trainZ * travelDir >= 0.0) {
        trainZ = 0.0;
        speed = 0.0;
        accel = 0.0;
        state = 'BOARDED_WAIT';
        setHeadlights(true, 1.15);
        if (viaductGroup) viaductGroup.visible = false;
        openDoors();
        if (stationRef && typeof stationRef.getStats === 'function') {
          const stInfo = stationRef.getStats();
          const stName = stInfo && (stInfo.stationName || stInfo.name);
          if (stName) {
            currentStationName = stName;
            repaintPisLcd(currentStationName);
          }
        }
      }
      trainGroup.position.set(activeTrackX, 0, trainZ);
      trainGroup.rotation.set(0, travelDir === -1 ? Math.PI : 0, 0);
    } else if (state === 'BOARDED_WAIT') {
      speed = 0.0;
      accel = 0.0;
      trainGroup.position.set(activeTrackX, 0, 0);
      trainGroup.rotation.set(0, travelDir === -1 ? Math.PI : 0, 0);
      if (pendingDepart && doorOpen <= 0.02) {
        beginDeparture(stationRef);
      }
    } else if (state === 'DEPARTING' || state === 'CRUISE' || state === 'ARRIVING') {
      trainGroup.position.set(activeTrackX, 0, 0);
      trainGroup.rotation.set(0, travelDir === -1 ? Math.PI : 0, 0);
      rideTime += clampedDt;

      if (state === 'DEPARTING') {
        accel = 7.4;
        speed = Math.min(CRUISE_SPEED, speed + accel * clampedDt);
        if (speed >= CRUISE_SPEED - 0.5) {
          state = 'CRUISE';
          accel = 0.0;
        }
      } else if (state === 'CRUISE') {
        accel = 0.0;
        speed = CRUISE_SPEED;
      } else if (state === 'ARRIVING') {
        const distLeft = Math.max(0, incomingStationZ * travelDir);
        speed = Math.max(1.8, Math.min(CRUISE_SPEED, Math.sqrt(2.0 * 2.95 * distLeft)));
        accel = -2.95;
      }

      const stepZ = speed * clampedDt;
      rideDist += stepZ;

      // Update ride audio pitch & volume smoothly
      if (LRT.Audio && typeof LRT.Audio.setLoopVolume === 'function') {
        const ratio = Math.min(1.0, speed / CRUISE_SPEED);
        LRT.Audio.setLoopVolume('train_ride_loop', 0.15 + 0.72 * ratio, 0.1, 0.78 + 0.34 * ratio);
      }

      // Scroll Old Station opposite to travelDir until 160m behind, then dispose & spawn destination station ahead
      if (!oldDisposed && stationRef && stationRef.rootGroup) {
        stationRef.rootGroup.position.z -= travelDir * stepZ;
        stationWorldZ = stationRef.rootGroup.position.z;
        if (stationWorldZ * travelDir <= -160.0) {
          oldDisposed = true;
          if (typeof onDisposeOld === 'function') onDisposeOld();
        }
      } else if (oldDisposed && !nextSpawned) {
        nextSpawned = true;
        incomingStationZ = 215.0 * travelDir;
        const spawned = typeof onSpawnNext === 'function' ? onSpawnNext(incomingStationZ) : null;
        if (spawned && spawned.rootGroup) {
          spawned.rootGroup.position.z = incomingStationZ;
        } else if (stationRef && stationRef.rootGroup && stationRef.rootGroup !== activeOldRootGroup) {
          stationRef.rootGroup.position.z = incomingStationZ;
          stationWorldZ = incomingStationZ;
        }
      } else if (nextSpawned) {
        incomingStationZ -= travelDir * stepZ;
        const remDist = incomingStationZ * travelDir;
        if (stationRef && stationRef.rootGroup && stationRef.rootGroup !== activeOldRootGroup) {
          stationRef.rootGroup.position.z = incomingStationZ;
          stationWorldZ = incomingStationZ;
        }
        if (state === 'CRUISE' && remDist <= 114.0) {
          state = 'ARRIVING';
          brakeSoundPlayed = false;
        }
        if (state === 'ARRIVING' && !brakeSoundPlayed && remDist <= 52.0) {
          brakeSoundPlayed = true;
          safeAudioPlay('train_brake', { gain: 0.9 });
        }
        if (remDist <= 0.02) {
          incomingStationZ = 0.0;
          if (stationRef && stationRef.rootGroup) stationRef.rootGroup.position.z = 0;
          speed = 0.0;
          accel = 0.0;
          state = 'BOARDED_WAIT';
          setHeadlights(true, 1.15);
          if (viaductGroup) viaductGroup.visible = false;
          if (LRT.Audio && typeof LRT.Audio.stopLoop === 'function') {
            LRT.Audio.stopLoop('train_ride_loop', 0.35);
          }
          safeAudioPlay('station_chime', { gain: 0.75 });
          openDoors();
          if (stationRef && typeof stationRef.getStats === 'function') {
            const stInfo = stationRef.getStats();
            const stName = stInfo && (stInfo.stationName || stInfo.name);
            if (stName) {
              currentStationName = stName;
              repaintPisLcd(currentStationName);
            }
          }
        }
      }

      updateViaductChunks(clampedDt, stationWorldZ);
    }

    if (speed > 0.05) {
      wheelAngle += (speed * clampedDt) / WHEEL_RADIUS;
      updateWheels();
    }
    updateStrapsAndSway(clampedDt);
    syncTrainLights();
  }

  function setWarmupMode(active) {
    if (!initialized) return;
    warmupActive = !!active;
    if (warmupActive) {
      if (trainGroup) {
        trainGroup.visible = true;
        trainGroup.position.set(activeTrackX, 0, 0);
        trainGroup.rotation.set(0, travelDir === -1 ? Math.PI : 0, 0);
      }
      if (viaductGroup) {
        viaductGroup.visible = true;
        viaductGroup.position.set(activeTrackX, 0, 0);
        for (let i = 0; i < viaductChunks.length; i++) {
          viaductChunks[i].visible = true;
        }
      }
      if (headlightConeL) headlightConeL.visible = true;
      if (headlightConeR) headlightConeR.visible = true;
      for (let i = 0; i < scorchDecals.length; i++) scorchDecals[i].visible = true;
    } else {
      const showTrain = state !== 'AWAY';
      if (trainGroup) {
        trainGroup.visible = showTrain;
        trainGroup.position.set(activeTrackX, 0, trainZ);
        trainGroup.rotation.set(0, travelDir === -1 ? Math.PI : 0, 0);
      }
      const showViaduct = (state === 'DEPARTING' || state === 'CRUISE' || state === 'ARRIVING');
      if (viaductGroup) viaductGroup.visible = showViaduct;
      const showCones = showTrain && headlightIntensityTarget > 0.01;
      if (headlightConeL) headlightConeL.visible = showCones;
      if (headlightConeR) headlightConeR.visible = showCones;
      for (let i = 0; i < scorchDecals.length; i++) scorchDecals[i].visible = false;
    }
    syncTrainLights();
  }

  function getColliders() {
    if (!initialized || !trainGroup || !trainGroup.visible) return [];
    activeColliders.length = 0;

    for (let i = 0; i < staticLocalColliders.length; i++) {
      const c = staticLocalColliders[i];
      activeColliders.push(localBoxToWorld(c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, c.tag, c.isFloor, true));
    }

    const doorOpenPassable = doorOpen >= 0.65;
    for (let i = 0; i < doorLocalColliders.length; i++) {
      const d = doorLocalColliders[i];
      if (!doorOpenPassable) {
        activeColliders.push(localBoxToWorld(d.minX, d.minY, d.minZ, d.maxX, d.maxY, d.maxZ, 'train_wall', false, true));
      }
      if (doorOpen >= 0.40) {
        // Seamless threshold bridge spanning the 9.5cm gap between platform and train floor
        activeColliders.push(localBoxToWorld(d.bridgeMinX, d.bridgeMinY, d.bridgeMinZ, d.bridgeMaxX, d.bridgeMaxY, d.bridgeMaxZ, 'train_floor', true, true));
      }
    }

    return activeColliders;
  }

  function isPlayerInside(pos) {
    if (!initialized || !trainGroup || !trainGroup.visible || !pos) return false;
    return (
      Math.abs(worldToLocalX(pos.x)) <= 1.25 &&
      pos.y >= -0.35 && pos.y <= 2.38 &&
      Math.abs(worldToLocalZ(pos.z)) <= 25.35
    );
  }

  // Fast local-space analytic raycast against unbroken glass, LCDs, doors, hull & interior colliders
  function raycastTrain(origin, dir, maxDist) {
    if (!initialized || !trainGroup || !trainGroup.visible || !origin || !dir) return null;
    const limit = maxDist || 200;

    // Transform world ray into trainVisualRoot local space
    trainGroup.updateMatrixWorld(true);
    _invMat.copy(trainVisualRoot.matrixWorld).invert();
    _localRayOrigin.copy(origin).applyMatrix4(_invMat);
    _localRayDir.copy(dir).transformDirection(_invMat).normalize();
    _ray.set(_localRayOrigin, _localRayDir);

    // Broad-phase AABB check around entire 3-car consist
    _box.min.set(-1.55, -1.10, -27.2);
    _box.max.set(1.55, 3.80, 27.2);
    if (!_ray.intersectBox(_box, _hitPt)) return null;

    let bestDist = limit;
    let bestMaterial = null;
    let bestNormal = new THREE.Vector3(0, 1, 0);
    let bestTargetId = null;

    const testBox = (b, matTag, tId) => {
      if (_ray.intersectBox(b, _hitPt)) {
        const d = _hitPt.distanceTo(_localRayOrigin);
        if (d > 0.001 && d < bestDist) {
          bestDist = d;
          bestMaterial = matTag;
          bestTargetId = tId;
          // Compute outward normal from hit face
          const cx = (b.min.x + b.max.x) * 0.5;
          const cy = (b.min.y + b.max.y) * 0.5;
          const cz = (b.min.z + b.max.z) * 0.5;
          const hx = Math.max(0.005, (b.max.x - b.min.x) * 0.5);
          const hy = Math.max(0.005, (b.max.y - b.min.y) * 0.5);
          const hz = Math.max(0.005, (b.max.z - b.min.z) * 0.5);
          const dx = (_hitPt.x - cx) / hx;
          const dy = (_hitPt.y - cy) / hy;
          const dz = (_hitPt.z - cz) / hz;
          const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
          if (ax >= ay && ax >= az) bestNormal.set(dx > 0 ? 1 : -1, 0, 0);
          else if (ay >= ax && ay >= az) bestNormal.set(0, dy > 0 ? 1 : -1, 0);
          else bestNormal.set(0, 0, dz > 0 ? 1 : -1);
        }
      }
    };

    // 1. Test all unbroken glass panes (side windows, windshields, quarter windows, exposed door glass)
    for (let i = 0; i < glassPanes.length; i++) {
      const p = glassPanes[i];
      if (p.broken) continue;
      if (p.kind === 'door_glass' && p.side > 0 && doorOpen >= 0.65) continue;
      testBox(p.localBox, 'glass', p.id);
    }

    // 2. Test unbroken LCD PIS screens
    for (let i = 0; i < lcdScreens.length; i++) {
      const l = lcdScreens[i];
      if (!l.broken) testBox(l.localBox, 'lcd', 'lcd_' + l.id);
    }

    // 3. Test solid architectural framing/floor/seat/roof AABBs (leaving window & open doorway apertures open)
    for (let i = 0; i < raycastLocalBoxes.length; i++) {
      const rc = raycastLocalBoxes[i];
      testBox(rc.box, 'metal', rc.tag);
    }

    // Closed door metal framing (lower/upper leaf metal + vertical rubber seal & stiles, keeping door_glass open!)
    const testClosedDoorFrame = (side, dz) => {
      const dx0 = side > 0 ? 1.20 : -1.34;
      const dx1 = side > 0 ? 1.34 : -1.20;
      _box.min.set(dx0, 0.02, dz - 0.675);
      _box.max.set(dx1, 0.74, dz + 0.675);
      testBox(_box, 'metal', 'door_leaf');
      _box.min.set(dx0, 1.72, dz - 0.675);
      _box.max.set(dx1, 1.90, dz + 0.675);
      testBox(_box, 'metal', 'door_leaf');
      _box.min.set(dx0, 0.74, dz - 0.14);
      _box.max.set(dx1, 1.72, dz + 0.14);
      testBox(_box, 'metal', 'door_leaf');
      _box.min.set(dx0, 0.74, dz - 0.675);
      _box.max.set(dx1, 1.72, dz - 0.52);
      testBox(_box, 'metal', 'door_leaf');
      _box.min.set(dx0, 0.74, dz + 0.52);
      _box.max.set(dx1, 1.72, dz + 0.675);
      testBox(_box, 'metal', 'door_leaf');
    };
    for (let i = 0; i < DOOR_WORLDS_Z.length; i++) {
      const dz = DOOR_WORLDS_Z[i];
      testClosedDoorFrame(-1, dz);
      if (doorOpen < 0.65) testClosedDoorFrame(1, dz);
    }

    // 4. Roof HVAC pods & lower underbody/bogies
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      for (const hzOff of [-3.65, 3.65]) {
        _box.min.set(-0.90, TD.roofDeckY, cz + hzOff - 1.38);
        _box.max.set(0.90, TD.roofDeckY + 0.62, cz + hzOff + 1.38);
        testBox(_box, 'metal', 'hvac');
      }
      _box.min.set(-1.10, -0.95, cz - 7.8);
      _box.max.set(1.10, 0.0, cz + 7.8);
      testBox(_box, 'metal', 'underbody');
    }

    if (!bestMaterial) return null;

    const hitWorld = _localRayOrigin.clone().addScaledVector(_localRayDir, bestDist).applyMatrix4(trainVisualRoot.matrixWorld);
    const normWorld = bestNormal.clone().transformDirection(trainVisualRoot.matrixWorld).normalize();

    return {
      dist: bestDist,
      distance: bestDist,
      point: hitWorld,
      normal: normWorld,
      material: bestMaterial,
      tag: bestMaterial,
      materialTag: bestMaterial,
      isGlass: bestMaterial === 'glass',
      type: bestMaterial,
      targetId: bestTargetId
    };
  }

  function applyDamage(worldPos, radius, maxDmg, impulse) {
    const res = { shardsSpawned: false, sfxPlayed: false, hitGlass: false, hitSolid: false };
    if (!initialized || !trainGroup || !trainGroup.visible || !worldPos) return res;

    const r = radius !== undefined ? radius : 0.4;
    const dmg = maxDmg !== undefined ? maxDmg : 30;
    const imp = impulse !== undefined ? impulse : 8;

    trainGroup.updateMatrixWorld(true);
    _invMat.copy(trainVisualRoot.matrixWorld).invert();
    const localPos = _v3.copy(worldPos).applyMatrix4(_invMat).clone();

    // Quick distance check against train bounding box
    _box.min.set(-1.55, -1.10, -27.2);
    _box.max.set(1.55, 3.80, 27.2);
    if (distToBox(localPos, _box) > r + 0.6) return res;

    // 1. Shatterable Train Windows (Side bays + Windshields + Quarter windows + Door glass)
    for (let i = 0; i < glassPanes.length; i++) {
      const p = glassPanes[i];
      if (p.broken) continue;
      const d = distToBox(localPos, p.localBox);
      if (d <= Math.max(r, 0.38)) {
        const falloff = (r > 0.65 && d > 0.25) ? Math.max(0.25, 1.0 - d / r) : 1.0;
        p.hp -= dmg * falloff;
        res.hitGlass = true;
        if (p.hp <= 0) {
          const sh = shatterGlassPane(p, worldPos);
          if (sh.shardsSpawned) res.shardsSpawned = true;
          if (sh.sfxPlayed) res.sfxPlayed = true;
        }
      }
    }

    // 2. Breakable Interior LCD PIS Route Screens
    for (let i = 0; i < lcdScreens.length; i++) {
      const l = lcdScreens[i];
      if (l.broken) continue;
      const d = distToBox(localPos, l.localBox);
      if (d <= Math.max(r, 0.38)) {
        const falloff = r > 0.6 ? Math.max(0.25, 1.0 - d / r) : 1.0;
        l.hp -= dmg * falloff;
        if (l.hp <= 0) {
          l.broken = true;
          stats.brokenLcds++;
          l.mat.emissiveIntensity = 0.04;
          l.mat.color.setHex(0x1e2228);
          if (LRT.Weapons && typeof LRT.Weapons.spawnSparks === 'function') {
            _v1.copy(l.localPos).applyMatrix4(trainVisualRoot.matrixWorld);
            LRT.Weapons.spawnSparks(_v1, 12);
          }
        }
      }
    }

    // 3. Overhead Ceiling Tubes Short-Circuit / Flicker
    if (tubeInst && r >= 1.2) {
      const attr = tubeInst.geometry.attributes.aTubeState;
      let changed = false;
      for (let i = 0; i < ceilingTubes.length; i++) {
        const t = ceilingTubes[i];
        const d = localPos.distanceTo(t.pos);
        if (d <= r + 1.5) {
          t.health = d <= 3.2 ? 0.0 : Math.min(t.health, 0.28);
          attr.array[i * 2 + 1] = t.health;
          changed = true;
        }
      }
      if (changed) attr.needsUpdate = true;
    }

    // 4. Hanging Hand Straps Knocked Into Damped Chaotic Sway
    const strapRadius = Math.max(r, 0.9);
    for (let i = 0; i < handStraps.length; i++) {
      const st = handStraps[i];
      const d = localPos.distanceTo(st.basePos);
      if (d <= strapRadius) {
        const f = 1.0 - d / strapRadius;
        const kick = Math.min(18.0, imp * 0.85 * f + 4.0);
        const dirX = st.basePos.x - localPos.x;
        const dirZ = st.basePos.z - localPos.z;
        const len = Math.max(0.05, Math.sqrt(dirX * dirX + dirZ * dirZ));
        st.velZ += (dirX / len) * kick;
        st.velX += (dirZ / len) * kick;
        if (dmg >= 65 && !st.snapped) {
          st.snapped = true;
          stats.snappedStraps++;
          st.restX = (Math.random() - 0.5) * 0.55;
          st.restZ = (Math.random() - 0.5) * 0.55;
        }
      }
    }

    // 5. Dentable & Soot-Charrable Exterior Livery Hull & Interior Bench Seats
    if (dmg >= 45 || r >= 1.0) {
      const blastR = Math.max(1.25, Math.min(r * 0.72, 4.2));
      for (let i = 0; i < dentHulls.length; i++) {
        if (dentMeshFromBlast(dentHulls[i], localPos, blastR, dmg)) res.hitSolid = true;
      }
      for (let i = 0; i < dentSeats.length; i++) {
        if (dentMeshFromBlast(dentSeats[i], localPos, blastR, dmg)) res.hitSolid = true;
      }
      stampTrainScorchDecal(localPos, blastR);
    }
    return res;
  }

  function createStaticLrtConsist(opts) {
    if (!texNoseAtlas) buildProceduralTrainTextures();
    const mats = getTrainMaterials();
    const cfg = opts || {};
    const count = cfg.carCount === 3 ? 3 : 2;
    const derelict = !!cfg.derelict;
    const centersZ = count === 3 ? TD.carCentersZ : [-TD.carPitch * 0.5, TD.carPitch * 0.5];
    const noseDirs = count === 3 ? [-1, 0, 1] : [-1, 1];
    const group = new THREE.Group();
    group.name = cfg.name || 'StaticLrtConsist';

    const steelDarkParts = [];
    const glassParts = [];
    const hvacParts = [];

    for (let c = 0; c < count; c++) {
      const cz = centersZ[c];
      const nd = noseDirs[c];
      const hull = buildCarExteriorHull(c, nd);
      const hullMesh = new THREE.Mesh(hull.geometry, mats.trainBody);
      hullMesh.position.set(0, 0, cz);
      hullMesh.castShadow = true;
      hullMesh.receiveShadow = true;
      group.add(hullMesh);

      // Floor deck & roof end plugs
      pushMatGeom(steelDarkParts, new THREE.BoxGeometry(TD.carWidth - 0.14, 0.22, TD.carLength - 0.4), 0, -0.09, cz);

      // Closed double-leaf pocket doors + door windows along both sides
      for (const side of [-1, 1]) {
        const dx = side * (TD.halfWidth - 0.04);
        for (let di = 0; di < TD.doorOffsetsLocal.length; di++) {
          const dz = cz + TD.doorOffsetsLocal[di];
          const db = createMeshBuilder(false);
          db.addBox(dx, 0.36, dz, 0.06, 0.72, 1.35, LIVERY_UV.doorRedBand, 1.0);
          db.addBox(dx, 1.95, dz, 0.06, 0.18, 1.35, LIVERY_UV.doorUpperWhite, 1.0);
          db.addBox(dx, 1.29, dz - 0.51, 0.06, 1.14, 0.33, LIVERY_UV.doorWhite, 1.0);
          db.addBox(dx, 1.29, dz + 0.51, 0.06, 1.14, 0.33, LIVERY_UV.doorWhite, 1.0);
          const dMesh = new THREE.Mesh(db.toGeometry(false), mats.trainBody);
          dMesh.castShadow = true;
          group.add(dMesh);
          pushMatGeom(glassParts, new THREE.BoxGeometry(0.025, 1.10, 0.68), dx, 1.29, dz);
        }
        // Side bay windows
        const baySpans = [[-4.82, -0.88], [0.88, 4.82]];
        if (nd !== -1) baySpans.push([-8.35, -6.58]);
        if (nd !== 1) baySpans.push([6.58, 8.35]);
        for (let bi = 0; bi < baySpans.length; bi++) {
          const [z0, z1] = baySpans[bi];
          pushMatGeom(glassParts, new THREE.BoxGeometry(0.025, 1.08, z1 - z0), side * (TD.halfWidth - 0.045), 1.50, cz + (z0 + z1) * 0.5);
        }
      }

      // Interior bench core so shattered/transparent windows show realistic cabin mass
      pushMatGeom(steelDarkParts, new THREE.BoxGeometry(2.10, 1.40, 14.2), 0, 0.72, cz);

      // Bogies + wheelsets + Roof HVAC pods
      for (const bzOff of [-5.25, 5.25]) {
        const bz = cz + bzOff;
        pushMatGeom(steelDarkParts, new THREE.BoxGeometry(0.16, 0.24, 2.45), -0.82, -0.58, bz);
        pushMatGeom(steelDarkParts, new THREE.BoxGeometry(0.16, 0.24, 2.45), 0.82, -0.58, bz);
        pushMatGeom(steelDarkParts, new THREE.BoxGeometry(1.80, 0.22, 0.45), 0, -0.50, bz);
        for (const wzOff of [-0.95, 0.95]) {
          for (const side of [-1, 1]) {
            pushMatGeom(steelDarkParts, new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.13, 12),
              side * (TD.trackGauge * 0.5), TD.railTopY + WHEEL_RADIUS, bz + wzOff, 0, 0, Math.PI * 0.5);
          }
        }
      }
      for (const hzOff of [-3.65, 3.65]) {
        const hb = createMeshBuilder(false);
        hb.addBox(0, TD.roofDeckY + 0.28, cz + hzOff, 1.78, 0.56, 2.75, LIVERY_UV.hvacPod, 2.0);
        hvacParts.push({ geo: hb.toGeometry(false) });
      }
      if (c < count - 1) {
        pushMatGeom(steelDarkParts, new THREE.BoxGeometry(2.26, 2.55, 0.52), 0, 1.28, cz + TD.carPitch * 0.5);
      }

      // Streamlined Cab Nose Shield, Windshield & Coupler on head/tail cars
      if (nd !== 0) {
        const s = nd;
        const ry = s > 0 ? 0 : Math.PI;
        const shieldGeo = new THREE.PlaneGeometry(1.78, 1.12, 2, 2);
        const suv = shieldGeo.attributes.uv;
        const uOff = s > 0 ? 0.0 : 0.5;
        for (let ui = 0; ui < suv.count; ui++) suv.setX(ui, uOff + suv.getX(ui) * 0.5);
        const shieldMat = new THREE.MeshPhysicalMaterial({
          map: texNoseAtlas, roughness: derelict ? 0.55 : 0.20, metalness: 0.28, clearcoat: derelict ? 0.2 : 0.72
        });
        const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        shieldMesh.position.set(0, 0.39, cz + s * 8.52);
        shieldMesh.rotation.order = 'YXZ';
        shieldMesh.rotation.set(-0.10, ry, 0);
        group.add(shieldMesh);

        pushMatGeom(glassParts, new THREE.BoxGeometry(1.74, 1.48, 0.05), 0, 1.68, cz + s * 8.16, -0.44, ry, 0, 'YXZ');
        pushMatGeom(steelDarkParts, new THREE.BoxGeometry(1.75, 0.28, 0.14), 0, -0.62, cz + s * 8.46);
        pushMatGeom(steelDarkParts, new THREE.BoxGeometry(0.42, 0.28, 0.70), 0, -0.36, cz + s * 8.68);
      }
    }

    if (steelDarkParts.length) {
      const mSteel = new THREE.Mesh(mergeStaticGeoms(steelDarkParts), mats.steelDarkMat);
      mSteel.castShadow = true;
      mSteel.receiveShadow = true;
      group.add(mSteel);
    }
    if (glassParts.length) {
      group.add(new THREE.Mesh(mergeStaticGeoms(glassParts), mats.glassMat));
    }
    if (hvacParts.length) {
      const mHvac = new THREE.Mesh(mergeStaticGeoms(hvacParts), mats.trainBody);
      mHvac.castShadow = true;
      group.add(mHvac);
    }
    return group;
  }

  function getInteractableNear(pos, lookDir) {
    if (!initialized || !trainGroup || !trainGroup.visible || !pos) return null;
    if (!isPlayerInside(pos)) return null;

    let best = null;
    let bestDist = 2.65;

    for (let i = 0; i < localInteractables.length; i++) {
      const item = localInteractables[i];
      const prompt = state === 'BOARDED_WAIT' ? item.promptBoarded : item.promptCruise;
      if (!prompt) continue;

      _v1.set(localXToWorld(item.pos.x), item.pos.y, localZToWorld(item.pos.z));
      const d = _v1.distanceTo(pos);
      if (d < bestDist) {
        if (lookDir) {
          _v2.copy(_v1).sub(pos).normalize();
          if (_v2.dot(lookDir) < 0.20 && d > 1.35) continue;
        }
        bestDist = d;
        best = {
          id: item.id,
          action: item.action,
          label: prompt,
          prompt: '[E] ' + prompt,
          pos: _v1.clone(),
          distance: d
        };
      }
    }
    return best;
  }

  function interact(id) {
    if (!initialized || !id) return { handled: false };
    for (let i = 0; i < localInteractables.length; i++) {
      const item = localInteractables[i];
      if (item.id === id) {
        if (item.action === 'depart' && state === 'BOARDED_WAIT') {
          departNow();
          return { handled: true, action: 'depart', message: 'Pintu ditutup — LRT berangkat ke stasiun berikutnya!' };
        }
        if (item.action === 'horn') {
          safeAudioPlay('train_horn', { gain: 0.95 });
          const lure = localToWorld({ x: 0, y: 1.0, z: 0 });
          if (LRT.Enemies && typeof LRT.Enemies.alertAllTo === 'function') {
            LRT.Enemies.alertAllTo(lure, 60.0);
          }
          return {
            handled: true,
            action: 'horn',
            lurePos: lure,
            message: 'Klakson LRT Jabodebek dibunyikan — Menarik perhatian infected!'
          };
        }
        if (item.action === 'sit') {
          safeAudioPlay('turnstile_beep', { gain: 0.35 });
          return {
            handled: true,
            action: 'sit',
            seatLocal: item.seatLocal,
            standLocal: item.standLocal,
            seatWorld: localToWorld(item.seatLocal),
            standWorld: localToWorld(item.standLocal),
            message: 'Duduk di kursi penumpang LRT — [E] / [Space] untuk berdiri'
          };
        }
      }
    }
    return { handled: false };
  }

  LRT.Train = {
    init,
    reset,
    setMode: reset,
    startApproach,
    openDoors,
    closeDoors,
    departNow,
    update,
    stepRide: update,
    getState: () => state,
    getSpeed: () => speed,
    getDoorOpen: () => doorOpen,
    getOffsetZ: () => (trainGroup ? trainGroup.position.z : 0),
    getTrackX: () => activeTrackX,
    getDirection: () => travelDir,
    localToWorld,
    createStaticLrtConsist,
    isPlayerInside,
    getColliders,
    raycastTrain,
    applyDamage,
    getInteractableNear,
    interact,
    getVisualRoot: () => trainVisualRoot,
    getRoot: () => trainGroup,
    setWarmupMode,
    setNextStationName: (name) => {
      currentStationName = name || 'Cawang';
      repaintPisLcd(currentStationName);
    },
    getStats: () => ({ ...stats, state, speed, doorOpen, trainZ, activeTrackX, travelDir }),
    syncLights: syncTrainLights
  };
})(window.LRT = window.LRT || {});
