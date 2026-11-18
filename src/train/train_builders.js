(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const T = (I.train = I.train || {});

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

  // Single pooled cabin light anchor (moves to player's active car Z; emissive ceilingTubeMesh lights all 3 cars)
  const CABIN_LIGHT_Z = [0.0];

  // Shared train module state
  T.C = C;
  T.TD = TD;
  T.DOOR_WORLDS_Z = DOOR_WORLDS_Z;
  T.WHEEL_RADIUS = WHEEL_RADIUS;
  T.CRUISE_SPEED = CRUISE_SPEED;
  T.MAX_DENT = MAX_DENT;
  T.CHUNK_LEN = CHUNK_LEN;
  T.CHUNK_COUNT = CHUNK_COUNT;
  T.LIVERY_UV = LIVERY_UV;
  T.INT_UV = INT_UV;
  T.CABIN_LIGHT_Z = CABIN_LIGHT_Z;

  T._v1 = _v1;
  T._v2 = _v2;
  T._v3 = _v3;
  T._m4 = _m4;
  T._q1 = _q1;
  T._e1 = _e1;
  T._s1 = _s1;
  T._localRayOrigin = _localRayOrigin;
  T._localRayDir = _localRayDir;
  T._invMat = _invMat;
  T._box = _box;
  T._ray = _ray;
  T._hitPt = _hitPt;
  T._upVec = _upVec;

  T.sceneRef = null;
  T.initialized = false;
  T.gameMode = 'survival';
  T.state = 'AWAY'; // AWAY | APPROACHING | BOARDED_WAIT | DEPARTING | CRUISE | ARRIVING
  T.activeTrackX = 0.0;
  T.travelDir = 1; // +1 = Northbound Track 1 (+Z), -1 = Southbound Track 2 (-Z, rotated PI)
  T.trainZ = -180.0;
  T.speed = 0.0;
  T.accel = 0.0;
  T.wheelAngle = 0.0;
  T.doorOpen = 0.0;
  T.doorsTarget = 0.0;
  T.pendingDepart = false;
  T.brakeSoundPlayed = false;
  T.approachSoundPlayed = false;
  T.rideTime = 0.0;
  T.rideDist = 0.0;
  T.oldDisposed = false;
  T.nextSpawned = false;
  T.incomingStationZ = 220.0;
  T.activeOldRootGroup = null;
  T.currentStationName = 'Dukuh Atas BSI';
  T.animTime = 0.0;

  T.trainGroup = null;
  T.trainVisualRoot = null;
  T.viaductGroup = null;
  T.viaductChunks = [];

  // Lights & Cones
  T.trainLightsGroup = null;
  T.headlightLight = null;
  T.headlightIntensityTarget = 0.0;
  T.cabinLights = [];
  T.headlightConeL = null;
  T.headlightConeR = null;
  T.warmupActive = false;

  // Destructible collections
  T.dentHulls = [];
  T.dentSeats = [];
  T.glassPanes = [];
  T.lcdScreens = [];
  T.handStraps = [];
  T.ceilingTubes = [];
  T.scorchDecals = [];
  T.scorchCursor = 0;

  // Instanced meshes
  T.doorFrameInst = null;
  T.doorGlassInst = null;
  T.sideGlassInst = null;
  T.cabGlassInst = null;
  T.strapInst = null;
  T.tubeInst = null;
  T.bogieInst = null;
  T.wheelInst = null;
  T.hvacInst = null;

  T.doorLeaves = []; // { instIdx, carIdx, doorIdx, side, leafSign, baseX, baseY, baseZ, glassIdx }
  T.bogieLocalCoords = [];
  T.wheelLocalCoords = [];

  // Dynamic Canvas Textures
  T.texNoseAtlas = null;
  T.texConsole = null;
  T.texConsoleEmissive = null;
  T.texPisCanvas = null;
  T.texPisCtx = null;
  T.texPisMap = null;
  T.texDestCanvas = null;
  T.texDestCtx = null;
  T.texDestMap = null;
  T.destBoardMat = null;
  T.texDoorLockPanel = null;
  T.doorLockLedMat = null;
  T.texScorchFallback = null;
  T.baseLcdMat = null;

  // Colliders & Interactables
  T.staticLocalColliders = [];
  T.doorLocalColliders = [];
  T.raycastLocalBoxes = [];
  T.activeColliders = [];
  T.localInteractables = [];

  // Stats
  T.stats = {
    brokenWindows: 0,
    brokenLcds: 0,
    snappedStraps: 0,
    dentedHits: 0,
    scorchDecals: 0
  };

  const dentSeats = T.dentSeats;
  const glassPanes = T.glassPanes;
  const lcdScreens = T.lcdScreens;
  const handStraps = T.handStraps;
  const ceilingTubes = T.ceilingTubes;
  const scorchDecals = T.scorchDecals;
  const doorLeaves = T.doorLeaves;
  const bogieLocalCoords = T.bogieLocalCoords;
  const wheelLocalCoords = T.wheelLocalCoords;

  function safeAudioPlay(key, opts) {
    if (LRT.Audio && typeof LRT.Audio.play === 'function') {
      LRT.Audio.play(key, opts);
    }
  }

  function localXToWorld(lx) {
    return T.activeTrackX + (T.travelDir === -1 ? -lx : lx);
  }

  function localZToWorld(lz) {
    return T.trainZ + (T.travelDir === -1 ? -lz : lz);
  }

  function worldToLocalX(wx) {
    return T.travelDir === -1 ? -(wx - T.activeTrackX) : (wx - T.activeTrackX);
  }

  function worldToLocalZ(wz) {
    return T.travelDir === -1 ? -(wz - T.trainZ) : (wz - T.trainZ);
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
    if (!pt) return { x: T.activeTrackX, y: 0, z: T.trainZ, yaw: 0 };
    return {
      x: localXToWorld(pt.x || 0),
      y: pt.y || 0,
      z: localZToWorld(pt.z || 0),
      yaw: (typeof pt.yaw === 'number') ? (pt.yaw + (T.travelDir === -1 ? Math.PI : 0)) : undefined
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

    T.texNoseAtlas = new THREE.CanvasTexture(atlas);
    T.texNoseAtlas.colorSpace = THREE.SRGBColorSpace;
    T.texNoseAtlas.anisotropy = 8;

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

    T.texConsole = new THREE.CanvasTexture(cC);
    T.texConsole.colorSpace = THREE.SRGBColorSpace;
    T.texConsoleEmissive = new THREE.CanvasTexture(cCE);
    T.texConsoleEmissive.colorSpace = THREE.SRGBColorSpace;

    // 3. Dynamic Interior LCD PIS Route Screen Texture (1024x256 ultra-sharp!)
    T.texPisCanvas = makeCanvas(1024, 256);
    T.texPisCtx = T.texPisCanvas.getContext('2d');
    T.texPisMap = new THREE.CanvasTexture(T.texPisCanvas);
    T.texPisMap.colorSpace = THREE.SRGBColorSpace;
    T.texPisMap.anisotropy = 8;

    // 3b. Dynamic Exterior Nose & Platform-Side LED Destination Board Texture (1024x192)
    T.texDestCanvas = makeCanvas(1024, 192);
    T.texDestCtx = T.texDestCanvas.getContext('2d');
    T.texDestMap = new THREE.CanvasTexture(T.texDestCanvas);
    T.texDestMap.colorSpace = THREE.SRGBColorSpace;
    T.texDestMap.anisotropy = 8;

    repaintPisLcd(T.currentStationName, T.travelDir);

    // 3c. Cab Door Lock Control Panel Texture ('PANEL KUNCI PINTU')
    const cDL = makeCanvas(256, 192);
    const ctxDL = cDL.getContext('2d');
    ctxDL.fillStyle = '#141920';
    ctxDL.fillRect(0, 0, 256, 192);
    ctxDL.strokeStyle = '#334155';
    ctxDL.lineWidth = 4;
    ctxDL.strokeRect(4, 4, 248, 184);
    ctxDL.fillStyle = '#0f172a';
    ctxDL.fillRect(10, 10, 236, 44);
    ctxDL.fillStyle = '#f8fafc';
    ctxDL.font = 'bold 18px sans-serif';
    ctxDL.textAlign = 'center';
    ctxDL.fillText('PANEL KUNCI PINTU', 128, 34);
    ctxDL.fillStyle = '#94a3b8';
    ctxDL.font = 'bold 10px monospace';
    ctxDL.fillText('GOA-3 CAB DOOR INTERLOCK', 128, 49);
    // Lock & Unlock button graphics
    ctxDL.fillStyle = '#166534';
    ctxDL.beginPath(); ctxDL.arc(76, 114, 28, 0, Math.PI * 2); ctxDL.fill();
    ctxDL.strokeStyle = '#4ade80'; ctxDL.lineWidth = 3; ctxDL.stroke();
    ctxDL.fillStyle = '#ecfdf5'; ctxDL.font = 'bold 13px monospace';
    ctxDL.fillText('KUNCI', 76, 118);
    ctxDL.fillStyle = '#991b1b';
    ctxDL.beginPath(); ctxDL.arc(180, 114, 28, 0, Math.PI * 2); ctxDL.fill();
    ctxDL.strokeStyle = '#f87171'; ctxDL.lineWidth = 3; ctxDL.stroke();
    ctxDL.fillStyle = '#fef2f2';
    ctxDL.fillText('BUKA', 180, 118);
    ctxDL.fillStyle = '#cbd5e1';
    ctxDL.font = 'bold 11px monospace';
    ctxDL.fillText('[E] RUANG KONTROL', 128, 170);
    T.texDoorLockPanel = new THREE.CanvasTexture(cDL);
    T.texDoorLockPanel.colorSpace = THREE.SRGBColorSpace;
    T.texDoorLockPanel.anisotropy = 4;

    if (!T.doorLockLedMat) {
      T.doorLockLedMat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x16a34a,
        emissiveIntensity: 1.65,
        roughness: 0.22,
        metalness: 0.15
      });
    }
    syncDoorLockPanels(false);

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
    T.texScorchFallback = new THREE.CanvasTexture(cS);
    T.texScorchFallback.colorSpace = THREE.SRGBColorSpace;
  }

  function syncDoorLockPanels(doorsOpen) {
    if (!T.doorLockLedMat) return;
    if (doorsOpen) {
      T.doorLockLedMat.color.setHex(0xef4444);
      T.doorLockLedMat.emissive.setHex(0xdc2626);
    } else {
      T.doorLockLedMat.color.setHex(0x22c55e);
      T.doorLockLedMat.emissive.setHex(0x16a34a);
    }
    T.doorLockLedMat.needsUpdate = true;
  }

  function repaintDestBoard(stationName, travelDir, isArrival) {
    if (!T.texDestCtx || !T.texDestMap) return;
    const ctx = T.texDestCtx;
    const dir = (typeof travelDir === 'number') ? travelDir : (typeof T.travelDir === 'number' ? T.travelDir : 1);
    const isForward = dir >= 0;
    const cleanName = String(stationName || 'Cawang')
      .replace(/^[←→]\s*/g, '')
      .replace(/^TIBA:\s*/i, '')
      .trim() || 'Cawang';

    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Matte black LED sign background & metallic inner bezel
    ctx.fillStyle = '#070A0F';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = isForward ? '#10B981' : '#F59E0B';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 504, 88);

    // Left direction badge (Emerald MAJU -> vs Amber <- KEMBALI)
    ctx.fillStyle = isForward ? '#064E3B' : '#451A03';
    ctx.fillRect(10, 10, 154, 76);
    ctx.strokeStyle = isForward ? '#34D399' : '#FBBF24';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, 154, 76);

    ctx.textAlign = 'center';
    ctx.fillStyle = isForward ? '#34D399' : '#FBBF24';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(isForward ? 'MAJU →' : '← KEMBALI', 87, 44);
    ctx.fillStyle = isForward ? '#A7F3D0' : '#FDE68A';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(isForward ? 'PERON 1' : 'PERON 2', 87, 68);

    // Right destination station readout
    ctx.textAlign = 'left';
    ctx.fillStyle = isForward ? '#6EE7B7' : '#FCD34D';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(isArrival ? 'STASIUN SAAT INI / ARRIVED' : 'TUJUAN AKHIR / DESTINATION', 180, 30);

    ctx.fillStyle = isForward ? '#ECFDF5' : '#FEF3C7';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(cleanName.toUpperCase(), 180, 68, 316);

    T.texDestMap.needsUpdate = true;
  }

  function repaintPisLcd(stationName, travelDir) {
    const dir = (typeof travelDir === 'number') ? travelDir : (typeof T.travelDir === 'number' ? T.travelDir : 1);
    const isForward = dir >= 0;
    const rawName = String(stationName || 'Cawang');
    const isArrival = /^TIBA:\s*/i.test(rawName);
    const cleanName = rawName.replace(/^[←→]\s*/g, '').replace(/^TIBA:\s*/i, '').trim() || 'Cawang';

    repaintDestBoard(cleanName, dir, isArrival);

    if (!T.texPisCtx || !T.texPisMap) return;
    const ctx = T.texPisCtx;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#182438';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#EDF3FB';
    ctx.fillRect(10, 10, 492, 108);

    // KAI header bar + color-coded direction pill
    ctx.fillStyle = '#16325C';
    ctx.fillRect(10, 10, 492, 34);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('KAI  LRT JABODEBEK', 20, 32);

    ctx.fillStyle = isForward ? '#059669' : '#D97706';
    ctx.fillRect(298, 14, 196, 26);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isForward ? 'MAJU →  •  PERON 1' : '← KEMBALI  •  PERON 2', 396, 32);

    ctx.textAlign = 'left';
    ctx.fillStyle = isForward ? '#065F46' : '#92400E';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(isArrival ? 'TIBA DI STASIUN:' : 'TUJUAN BERIKUTNYA:', 22, 60);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 21px sans-serif';
    ctx.fillText(cleanName, 22, 82, 468);

    // Route bar CB + BK
    ctx.fillStyle = isForward ? '#10B981' : '#F59E0B';
    ctx.fillRect(22, 96, 468, 8);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(38 + i * 87, 100, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    T.texPisMap.needsUpdate = true;
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
      map: T.texScorchFallback,
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

      // 2. Dynamic LED Destination Header Strip right above windshield ('YXZ' fixes rear pitch)
      const destGeo = new THREE.PlaneGeometry(1.28, 0.21);
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

    // Platform-side (+X) dynamic exterior destination LED boards above center doors (zero extra draw calls!)
    for (let c = 0; c < TD.carCentersZ.length; c++) {
      const sideDestGeo = new THREE.PlaneGeometry(1.52, 0.24);
      pushMatGeom(destGeoms, sideDestGeo, TD.halfWidth + 0.014, 2.42, TD.carCentersZ[c], 0, Math.PI * 0.5, 0, 'YXZ');
    }

    const shieldMat = new THREE.MeshPhysicalMaterial({
      map: T.texNoseAtlas,
      roughness: 0.18,
      metalness: 0.30,
      clearcoat: 0.78,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.55,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    group.add(new THREE.Mesh(mergeStaticGeoms(shieldGeoms), shieldMat));

    if (!T.destBoardMat && T.texDestMap) {
      T.destBoardMat = new THREE.MeshStandardMaterial({
        map: T.texDestMap,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: T.texDestMap,
        emissiveIntensity: 1.55,
        roughness: 0.22,
        metalness: 0.12
      });
    }
    group.add(new THREE.Mesh(mergeStaticGeoms(destGeoms), T.destBoardMat || mats.trainBody));

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
    T.headlightConeL = new THREE.Mesh(coneGeo, coneMat);
    T.headlightConeL.position.set(-0.72, 0.68, 26.10);
    T.headlightConeL.visible = false;
    group.add(T.headlightConeL);

    T.headlightConeR = new THREE.Mesh(coneGeo, coneMat);
    T.headlightConeR.position.set(0.72, 0.68, 26.10);
    T.headlightConeR.visible = false;
    group.add(T.headlightConeR);

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
      map: T.texConsole,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: T.texConsoleEmissive,
      emissiveIntensity: 1.25,
      roughness: 0.35,
      metalness: 0.25
    });
    const consoleHousingMat = mats.steelDarkMat || consoleMat;
    T._cabHalos = { departFront: null, departRear: null, lockFront: null, lockRear: null };
    const attachCabHalo = (mesh) => {
      if (LRT.Render && typeof LRT.Render.attachPerimeterHalo === 'function') {
        return LRT.Render.attachPerimeterHalo(mesh, {
          color: 0xfacc15,
          hoverColor: 0xfacc15,
          objectiveColor: 0xfde047,
          thicknessScale: 1.15,
          initialMode: 'off'
        });
      }
      return null;
    };

    const consoleGeoms = [];
    for (const s of [-1, 1]) {
      const cz = s * TD.carPitch;
      pushMatGeom(consoleGeoms, new THREE.PlaneGeometry(1.66, 0.40), 0, 1.01, cz + s * 7.86, -0.62, s > 0 ? Math.PI : 0, 0, 'YXZ');

      const podGeo = new THREE.BoxGeometry(1.68, 0.05, 0.42);
      const podMesh = new THREE.Mesh(podGeo, consoleHousingMat);
      podMesh.rotation.order = 'YXZ';
      podMesh.rotation.set(-0.62, s > 0 ? Math.PI : 0, 0);
      podMesh.position.set(0, 0.99, cz + s * 7.88);
      group.add(podMesh);
      const podHalo = attachCabHalo(podMesh);
      if (s > 0) T._cabHalos.departFront = podHalo;
      else T._cabHalos.departRear = podHalo;

      pushMatGeom(col.metalGeoms, new THREE.CylinderGeometry(0.015, 0.018, 0.18, 8), -0.20, 1.04, cz + s * 7.82, -s * 0.22, 0, 0, 'YXZ');
      pushMatGeom(col.steelDarkGeoms, new THREE.SphereGeometry(0.032, 10, 8), -0.20, 1.13, cz + s * 7.80, 0, 0, 0, 'YXZ');
      pushMatGeom(col.metalGeoms, new THREE.CylinderGeometry(0.014, 0.016, 0.14, 8), 0.24, 1.02, cz + s * 7.82, 0, 0, 0, 'YXZ');
      pushMatGeom(col.steelDarkGeoms, new THREE.SphereGeometry(0.06, 10, 8), 0, ceilY - 0.08, cz + s * 6.95, 0, 0, 0, 'YXZ');
    }
    group.add(new THREE.Mesh(mergeStaticGeoms(consoleGeoms), consoleMat));

    // Physical Door Lock Control Panels ('PANEL KUNCI PINTU') inside BOTH front (+0.68, 24.75) and rear (-0.68, -24.75) cabs
    const doorLockPlateMat = new THREE.MeshStandardMaterial({
      map: T.texDoorLockPanel,
      emissive: new THREE.Color(0x94a3b8),
      emissiveMap: T.texDoorLockPanel,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.30
    });
    const doorLockFaceGeoms = [];
    const doorLockLedGeoms = [];
    for (const s of [-1, 1]) {
      const px = s * 0.80;
      const pz = s * 24.75;
      const rotY = s > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
      // Angled dark steel pedestal/box mounted on inner cabinet shoulder (individual mesh for perimeter halo!)
      const lockBoxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.38), consoleHousingMat);
      lockBoxMesh.position.set(px, 1.13, pz);
      lockBoxMesh.rotation.set(0, 0, s * 0.28);
      group.add(lockBoxMesh);
      const lockHalo = attachCabHalo(lockBoxMesh);
      if (s > 0) T._cabHalos.lockFront = lockHalo;
      else T._cabHalos.lockRear = lockHalo;
      // Printed 'PANEL KUNCI PINTU' plate facing cab aisle
      pushMatGeom(doorLockFaceGeoms, new THREE.PlaneGeometry(0.32, 0.20), px - s * 0.072, 1.14, pz, 0, rotY, 0);
      // Glowing status indicator LED pill right above faceplate (Red = Unlocked/Open, Green = Locked)
      pushMatGeom(doorLockLedGeoms, new THREE.BoxGeometry(0.055, 0.042, 0.20), px - s * 0.05, 1.24, pz, 0, 0, 0);
      // Tactile chrome push bezel
      pushMatGeom(col.metalGeoms, new THREE.BoxGeometry(0.025, 0.015, 0.36), px - s * 0.06, 1.21, pz);
    }
    group.add(new THREE.Mesh(mergeStaticGeoms(doorLockFaceGeoms), doorLockPlateMat));
    if (T.doorLockLedMat) {
      group.add(new THREE.Mesh(mergeStaticGeoms(doorLockLedGeoms), T.doorLockLedMat));
    }

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

    T.strapInst = new THREE.InstancedMesh(geo, mat, coords.length);
    T.strapInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

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
      T.strapInst.setMatrixAt(i, _m4);
    }
    T.strapInst.instanceMatrix.needsUpdate = true;
    return T.strapInst;
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

    T.tubeInst = new THREE.InstancedMesh(segGeo, mats.flickerTubeMat, placements.length);
    ceilingTubes.length = 0;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      _m4.makeTranslation(p.x, p.y, p.z);
      T.tubeInst.setMatrixAt(i, _m4);
      ceilingTubes.push({
        idx: i,
        pos: new THREE.Vector3(p.x, p.y, p.z),
        health: p.health,
        baseHealth: p.baseHealth
      });
    }
    T.tubeInst.instanceMatrix.needsUpdate = true;
    return T.tubeInst;
  }

  // Build Breakable Overhead Angled LCD PIS Route Screens (6 screens; housings merged into steelDarkGeoms!)
  function buildLcdScreens(group, mats, col) {
    T.baseLcdMat = new THREE.MeshStandardMaterial({
      map: T.texPisMap,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: T.texPisMap,
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

        const matClone = T.baseLcdMat.clone();
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
    T.doorFrameInst = new THREE.InstancedMesh(frameGeo, mats.trainBody, totalLeaves);
    T.doorFrameInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    T.doorFrameInst.castShadow = false;

    T.doorGlassInst = new THREE.InstancedMesh(glassGeo, mats.glassMat, totalLeaves);
    T.doorGlassInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

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
    if (!T.doorFrameInst || !T.doorGlassInst) return;
    const slideDist = T.doorOpen * 0.67;

    for (let i = 0; i < doorLeaves.length; i++) {
      const dl = doorLeaves[i];
      // Only platform side (+X) opens at station so player never walks out track side!
      const slide = dl.side > 0 ? dl.leafSign * slideDist : 0.0;
      const curZ = dl.baseZ + slide;
      const curX = dl.baseX - (dl.side > 0 && T.doorOpen > 0.02 ? dl.side * 0.035 : 0);

      _m4.makeTranslation(curX, dl.baseY, curZ);
      T.doorFrameInst.setMatrixAt(dl.instIdx, _m4);

      if (dl.paneObj.broken) {
        _m4.makeScale(0, 0, 0);
        T.doorGlassInst.setMatrixAt(dl.instIdx, _m4);
      } else {
        _m4.makeTranslation(curX, dl.baseY + 0.27, curZ);
        T.doorGlassInst.setMatrixAt(dl.instIdx, _m4);
        dl.paneObj.localBox.min.set(curX - 0.06, dl.baseY - 0.22, curZ - 0.18);
        dl.paneObj.localBox.max.set(curX + 0.06, dl.baseY + 0.76, curZ + 0.18);
      }
    }
    T.doorFrameInst.instanceMatrix.needsUpdate = true;
    T.doorGlassInst.instanceMatrix.needsUpdate = true;
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
    T.sideGlassInst = new THREE.InstancedMesh(unitPaneGeo, mats.glassMat, sideBaySpecs.length);
    T.sideGlassInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < sideBaySpecs.length; i++) {
      const sp = sideBaySpecs[i];
      _m4.compose(
        _v1.set(sp.x, sp.y, sp.z),
        _q1.identity(),
        _s1.set(1, sp.h, sp.len)
      );
      T.sideGlassInst.setMatrixAt(i, _m4);

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
    T.sideGlassInst.instanceMatrix.needsUpdate = true;
    group.add(T.sideGlassInst);

    // Front (+Z) & Rear (-Z) Panoramic Sloped Windshields + 4 Cab Quarter Windows (1 InstancedMesh!)
    const cabPaneGeo = new THREE.PlaneGeometry(1.0, 1.0);
    T.cabGlassInst = new THREE.InstancedMesh(cabPaneGeo, mats.glassMat, 6);
    T.cabGlassInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    let cabIdx = 0;

    for (const s of [-1, 1]) {
      const cz = s * TD.carPitch;
      // Windshield spans y = 0.98..2.38, x = -0.84..+0.84, z: 8.48..7.84 (YXZ order)
      _e1.set(-0.44, s > 0 ? 0 : Math.PI, 0, 'YXZ');
      _q1.setFromEuler(_e1);
      _m4.compose(_v1.set(0, 1.68, cz + s * 8.16), _q1, _s1.set(1.74, 1.54, 1));
      T.cabGlassInst.setMatrixAt(cabIdx, _m4);

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
        T.cabGlassInst.setMatrixAt(cabIdx, _m4);

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
    T.cabGlassInst.instanceMatrix.needsUpdate = true;
    group.add(T.cabGlassInst);
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

    T.bogieInst = new THREE.InstancedMesh(bogieGeo, mats.steelDarkMat, bogieLocalCoords.length);
    for (let i = 0; i < bogieLocalCoords.length; i++) {
      const bc = bogieLocalCoords[i];
      _m4.makeTranslation(bc.x, bc.y, bc.z);
      T.bogieInst.setMatrixAt(i, _m4);
    }
    T.bogieInst.instanceMatrix.needsUpdate = true;
    group.add(T.bogieInst);

    // Flanged wheels (Cylinder rotated so axis is X)
    const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.13, 16);
    wheelGeo.rotateZ(Math.PI * 0.5);
    T.wheelInst = new THREE.InstancedMesh(wheelGeo, mats.steelDarkMat, wheelLocalCoords.length);
    T.wheelInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    updateWheels();
    group.add(T.wheelInst);

    // Roof I-Cond ACI-3601 HVAC Pods (2 per car = 6 pods)
    const hb = createMeshBuilder(false);
    hb.addBox(0, 0, 0, 1.78, 0.56, 2.75, LIVERY_UV.hvacPod, 2.0);
    hb.addBox(0, 0.30, 0, 1.56, 0.08, 2.45, LIVERY_UV.hvacPod, 2.0);
    const hvacGeo = hb.toGeometry(false);
    T.hvacInst = new THREE.InstancedMesh(hvacGeo, mats.trainBody, 6);
    T.hvacInst.castShadow = true;
    let hi = 0;
    for (let c = 0; c < 3; c++) {
      const cz = TD.carCentersZ[c];
      for (const hzOff of [-3.65, 3.65]) {
        _m4.makeTranslation(0, TD.roofDeckY + 0.28, cz + hzOff);
        T.hvacInst.setMatrixAt(hi++, _m4);
      }
    }
    T.hvacInst.instanceMatrix.needsUpdate = true;
    group.add(T.hvacInst);
  }

  function updateWheels() {
    if (!T.wheelInst) return;
    _q1.setFromAxisAngle(_v1.set(1, 0, 0), T.wheelAngle);
    for (let i = 0; i < wheelLocalCoords.length; i++) {
      const wc = wheelLocalCoords[i];
      _m4.compose(_v2.set(wc.x, wc.y, wc.z), _q1, _s1.set(1, 1, 1));
      T.wheelInst.setMatrixAt(i, _m4);
    }
    T.wheelInst.instanceMatrix.needsUpdate = true;
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

  function createStaticLrtConsist(opts) {
    if (!T.texNoseAtlas) buildProceduralTrainTextures();
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
          map: T.texNoseAtlas, roughness: derelict ? 0.55 : 0.20, metalness: 0.28, clearcoat: derelict ? 0.2 : 0.72
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

  T.safeAudioPlay = safeAudioPlay;
  T.localXToWorld = localXToWorld;
  T.localZToWorld = localZToWorld;
  T.worldToLocalX = worldToLocalX;
  T.worldToLocalZ = worldToLocalZ;
  T.localBoxToWorld = localBoxToWorld;
  T.localToWorld = localToWorld;
  T.makeCanvas = makeCanvas;
  T.mergeStaticGeoms = mergeStaticGeoms;
  T.pushMatGeom = pushMatGeom;
  T.buildProceduralTrainTextures = buildProceduralTrainTextures;
  T.syncDoorLockPanels = syncDoorLockPanels;
  T.repaintDestBoard = repaintDestBoard;
  T.repaintPisLcd = repaintPisLcd;
  T.createMeshBuilder = createMeshBuilder;
  T.cloneMatWithVertexColors = cloneMatWithVertexColors;
  T.getTrainMaterials = getTrainMaterials;
  T.buildCarExteriorHull = buildCarExteriorHull;
  T.buildNoseDetails = buildNoseDetails;
  T.buildInteriorFloorAndShell = buildInteriorFloorAndShell;
  T.buildCarSeatsMesh = buildCarSeatsMesh;
  T.buildHandrailsAndStanchions = buildHandrailsAndStanchions;
  T.buildHangingStraps = buildHangingStraps;
  T.buildCeilingLights = buildCeilingLights;
  T.buildLcdScreens = buildLcdScreens;
  T.buildDoors = buildDoors;
  T.updateDoorTransforms = updateDoorTransforms;
  T.buildWindows = buildWindows;
  T.buildBogiesWheelsAndHvac = buildBogiesWheelsAndHvac;
  T.updateWheels = updateWheels;
  T.buildScorchPool = buildScorchPool;
  T.createStaticLrtConsist = createStaticLrtConsist;
})(window.LRT = window.LRT || {});
