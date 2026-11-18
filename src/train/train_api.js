(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const T = I.train;

  const TD = T.TD;
  const DOOR_WORLDS_Z = T.DOOR_WORLDS_Z;
  const WHEEL_RADIUS = T.WHEEL_RADIUS;
  const CRUISE_SPEED = T.CRUISE_SPEED;
  const CHUNK_LEN = T.CHUNK_LEN;
  const CHUNK_COUNT = T.CHUNK_COUNT;
  const CABIN_LIGHT_Z = T.CABIN_LIGHT_Z;

  const _v1 = T._v1;
  const _v2 = T._v2;

  const dentHulls = T.dentHulls;
  const dentSeats = T.dentSeats;
  const scorchDecals = T.scorchDecals;
  const cabinLights = T.cabinLights;
  const viaductChunks = T.viaductChunks;
  const staticLocalColliders = T.staticLocalColliders;
  const doorLocalColliders = T.doorLocalColliders;
  const raycastLocalBoxes = T.raycastLocalBoxes;
  const activeColliders = T.activeColliders;
  const localInteractables = T.localInteractables;

  const EMPTY_DOORWAYS = [];

  function resolveStationList() {
    if (LRT.Config && Array.isArray(LRT.Config.ARCHETYPES) && LRT.Config.ARCHETYPES.length) {
      return LRT.Config.ARCHETYPES;
    }
    if (LRT.CONFIG && Array.isArray(LRT.CONFIG.stations) && LRT.CONFIG.stations.length) {
      return LRT.CONFIG.stations;
    }
    return [];
  }

  function resolveStationIndex() {
    if (LRT.Director && typeof LRT.Director.stationIndex === 'number') return LRT.Director.stationIndex;
    const core = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core;
    if (core && typeof core.stationIndex === 'number') return core.stationIndex;
    if (LRT.Station && typeof LRT.Station._stationIndex === 'number') return LRT.Station._stationIndex;
    return 0;
  }

  function formatDepartPrompt(dirOverride) {
    const stations = resolveStationList();
    const stIdx = resolveStationIndex();
    const trainDirection = typeof dirOverride === 'number'
      ? dirOverride
      : (typeof T.travelDir === 'number' ? T.travelDir : 1);
    const total = stations.length || 6;
    const nextArch = stations.length ? stations[(stIdx + 1) % total] : null;
    const prevArch = stations.length ? stations[Math.max(0, stIdx - 1) % total] : null;
    const core = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core;
    const isFinalExtraction = (stIdx >= total - 1 && core && core.gameMode === 'survival');
    const nextName = isFinalExtraction
      ? `ZONA EVAKUASI (${(nextArch && nextArch.name) || 'Dukuh Atas BSI'})`
      : ((nextArch && nextArch.name) || 'Stasiun Berikutnya');
    const prevName = (prevArch && prevArch.name) || 'Stasiun Sebelumnya';
    return trainDirection >= 0
      ? `🟢 [E] BERANGKAT MAJU → TUJUAN: ${nextName} (Kereta Peron 1)`
      : `🟠 [E] KEMBALI KE STASIUN SEBELUMNYA ← TUJUAN: ${prevName} (Kereta Peron 2)`;
  }

  function syncDepartPrompts() {
    const txt = formatDepartPrompt();
    for (let i = 0; i < localInteractables.length; i++) {
      if (localInteractables[i] && localInteractables[i].action === 'depart') {
        localInteractables[i].promptBoarded = txt;
      }
    }
  }
  const _openDoorwaysPool = [];
  for (let i = 0; i < DOOR_WORLDS_Z.length; i++) {
    _openDoorwaysPool.push({
      index: i,
      localZ: DOOR_WORLDS_Z[i],
      thresholdX: 0,
      doorX: 0,
      aisleX: 0,
      z: DOOR_WORLDS_Z[i],
      y: TD.cabinFloorY,
      clearHalfWidth: TD.doorClearWidth * 0.5,
      doorOpen: 0
    });
  }

  const _interiorBoundsOut = {
    active: false,
    trackX: 0,
    trainZ: 0,
    travelDir: 1,
    halfWidth: TD.halfWidth,
    interiorHalfWidth: TD.interiorHalfWidth,
    aisleHalfWidth: 0.72,
    floorY: TD.cabinFloorY,
    lengthHalf: 25.35,
    minX: -TD.interiorHalfWidth,
    maxX: TD.interiorHalfWidth,
    minZ: -25.35,
    maxZ: 25.35,
    platformSideSign: 1,
    platformExitX: TD.halfWidth + 0.88
  };

  const _ejectInfoOut = {
    ejectedCount: 0,
    platformExitX: TD.halfWidth + 0.88,
    trackX: 0,
    travelDir: 1,
    minZ: -25.65,
    maxZ: 25.65
  };

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
    const initialDepartPrompt = formatDepartPrompt(1);
    localInteractables.push({
      id: 'train_depart_front',
      action: 'depart',
      pos: new THREE.Vector3(0.0, 1.05, 25.25),
      promptBoarded: initialDepartPrompt,
      promptCruise: null
    });
    localInteractables.push({
      id: 'train_depart_rear',
      action: 'depart',
      pos: new THREE.Vector3(0.0, 1.05, -25.25),
      promptBoarded: initialDepartPrompt,
      promptCruise: null
    });
    for (let c = 0; c < 3; c++) {
      localInteractables.push({
        id: 'train_depart_door_' + c,
        action: 'depart',
        pos: new THREE.Vector3(1.12, 1.25, TD.carCentersZ[c] + 0.76),
        promptBoarded: initialDepartPrompt,
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

  function init(scene) {
    if (T.initialized) return LRT.Train;
    T.sceneRef = scene;

    T.buildProceduralTrainTextures();
    const mats = T.getTrainMaterials();

    T.trainGroup = new THREE.Group();
    T.trainGroup.position.set(0, 0, -180);
    T.trainGroup.visible = false;

    T.trainVisualRoot = new THREE.Group();
    T.trainGroup.add(T.trainVisualRoot);

    // Always-visible lights container in scene (toggles .intensity=0, NEVER .visible, eliminating shader recompiles!)
    T.trainLightsGroup = new THREE.Group();
    T.headlightLight = new THREE.PointLight(0xeef6ff, 0.0, 44, 1.55);
    T.headlightLight.castShadow = false;
    T.headlightLight.visible = true;
    T.headlightLight.position.set(0, 1.05, 27.2 - 180);
    T.trainLightsGroup.add(T.headlightLight);

    cabinLights.length = 0;
    for (let i = 0; i < CABIN_LIGHT_Z.length; i++) {
      const cl = new THREE.PointLight(i % 2 === 0 ? 0xf2f7ff : 0xfff3df, 0.0, 13.5, 1.55);
      cl.castShadow = false;
      cl.visible = true;
      cl.position.set(0, 1.86, CABIN_LIGHT_Z[i] - 180);
      T.trainLightsGroup.add(cl);
      cabinLights.push(cl);
    }

    // 1. 3 Dentable Exterior Car Hulls (MC3, M2, MC1)
    dentHulls.length = 0;
    const noseDirs = [-1, 0, 1];
    for (let c = 0; c < 3; c++) {
      const dentData = T.buildCarExteriorHull(c, noseDirs[c]);
      const hullMesh = new THREE.Mesh(dentData.geometry, mats.dentHullMat);
      hullMesh.position.set(0, 0, TD.carCentersZ[c]);
      hullMesh.castShadow = true;
      hullMesh.receiveShadow = true;
      T.trainVisualRoot.add(hullMesh);

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
    T.trainVisualRoot.add(T.buildNoseDetails(mats, collectors));

    // 3. Walkable Cabin Floor, Cream FRP Walls, GoA 3 Open Consoles, & Accordion Gangways
    T.trainVisualRoot.add(T.buildInteriorFloorAndShell(mats, collectors));

    // 4. 3 Dentable Interior Cyan Bench Seat Meshes
    dentSeats.length = 0;
    for (let c = 0; c < 3; c++) {
      T.trainVisualRoot.add(T.buildCarSeatsMesh(c, noseDirs[c], mats));
    }

    // 5. Brushed Stainless Vertical Stanchions & Twin Overhead Handrails (merged w/ coupler heads & cab sticks)
    T.buildHandrailsAndStanchions(collectors);

    // 6. Grey Triangular Hanging Straps (InstancedMesh)
    T.trainVisualRoot.add(T.buildHangingStraps());

    // 7. Twin Cool-White Linear LED Ceiling Strips (InstancedMesh w/ flicker shader)
    T.trainVisualRoot.add(T.buildCeilingLights(mats));

    // 8. Breakable Angled Overhead LCD PIS Route Screens
    T.buildLcdScreens(T.trainVisualRoot, mats, collectors);

    // 9. Merged Static Dark Steel & Brushed Stainless Details (1 draw call each!)
    if (collectors.steelDarkGeoms.length) {
      T.trainVisualRoot.add(new THREE.Mesh(T.mergeStaticGeoms(collectors.steelDarkGeoms), mats.steelDarkMat));
    }
    if (collectors.metalGeoms.length) {
      T.trainVisualRoot.add(new THREE.Mesh(T.mergeStaticGeoms(collectors.metalGeoms), mats.metalMat));
    }

    // 10. Animated Double-Leaf Pocket Doors + Door Glass
    T.buildDoors(mats);
    T.trainVisualRoot.add(T.doorFrameInst);
    T.trainVisualRoot.add(T.doorGlassInst);

    // 11. Shatterable Side Bay Windows + Panoramic Front/Rear Windshields + Quarter Windows
    T.buildWindows(T.trainVisualRoot, mats);

    // 12. MB-718 Bogies, Rotating Wheels, & Roof HVAC Pods
    T.buildBogiesWheelsAndHvac(T.trainVisualRoot, mats);

    // 13. Pre-allocated Train-Parented Scorch Decals
    T.buildScorchPool(T.trainVisualRoot, mats);

    // 14. Recycled 60m Ground-Level Jakarta Rail Corridor Cruise Chunks
    T.buildViaductCruiseChunks(mats);

    if (T.sceneRef) {
      T.sceneRef.add(T.trainGroup);
      T.sceneRef.add(T.trainLightsGroup);
      T.sceneRef.add(T.viaductGroup);
    }

    initCollidersAndInteractables();
    T.initialized = true;
    T.syncTrainLights();
    return LRT.Train;
  }

  function reset(mode) {
    T.gameMode = mode || 'survival';
    T.state = 'AWAY';
    T.activeTrackX = 0.0;
    T.travelDir = 1;
    T.trainZ = -180.0;
    T.speed = 0.0;
    T.accel = 0.0;
    T.doorOpen = 0.0;
    T.doorsTarget = 0.0;
    T.pendingDepart = false;
    T.brakeSoundPlayed = false;
    T.approachSoundPlayed = false;
    T.rideTime = 0.0;
    T.rideDist = 0.0;
    T.oldDisposed = false;
    T.nextSpawned = false;
    T.nextBuildInProgress = false;
    T.incomingStationZ = 220.0;
    T.activeOldRootGroup = null;

    if (T.trainGroup) {
      T.trainGroup.position.set(0, 0, T.trainZ);
      T.trainGroup.rotation.set(0, 0, 0);
      T.trainGroup.visible = false;
    }
    if (T.trainVisualRoot) {
      T.trainVisualRoot.position.set(0, 0, 0);
      T.trainVisualRoot.rotation.set(0, 0, 0);
    }
    if (T.viaductGroup) {
      T.viaductGroup.visible = false;
      T.viaductGroup.position.set(0, 0, 0);
    }
    setHeadlights(false, 0.0);
    T.syncTrainLights();

    if (LRT.Audio && typeof LRT.Audio.stopLoop === 'function') {
      LRT.Audio.stopLoop('train_ride_loop', 0.15);
    }

    T.resetDamage();
    T.updateDoorTransforms();
  }

  function setHeadlights(on, intensity) {
    T.headlightIntensityTarget = on ? (intensity !== undefined ? intensity : 2.8) : 0.0;
    if (T.headlightLight) {
      T.headlightLight.visible = true;
      T.headlightLight.intensity = (T.warmupActive || (T.state !== 'AWAY' && T.trainGroup && T.trainGroup.visible))
        ? T.headlightIntensityTarget
        : 0.0;
    }
    if (T.headlightConeL) T.headlightConeL.visible = !!on;
    if (T.headlightConeR) T.headlightConeR.visible = !!on;
  }

  function startApproach(opts) {
    if (!T.initialized) return;
    if (T.state !== 'AWAY') return;
    T.activeTrackX = (opts && typeof opts.trackX === 'number') ? opts.trackX : 0.0;
    T.travelDir = (opts && opts.direction === -1) ? -1 : 1;
    if (opts && opts.nextStationName) {
      T.currentStationName = opts.nextStationName;
    } else {
      const stations = resolveStationList();
      const stIdx = resolveStationIndex();
      const total = stations.length || 6;
      const targetIdx = T.travelDir < 0 ? Math.max(0, stIdx - 1) : ((stIdx + 1) % total);
      T.currentStationName = (stations[targetIdx] && stations[targetIdx].name) || 'Cawang Interchange';
    }
    T.repaintPisLcd(T.currentStationName, T.travelDir);
    syncDepartPrompts();

    T.state = 'APPROACHING';
    T.trainZ = -180.0 * T.travelDir;
    T.speed = 26.5;
    T.accel = -1.95;
    T.doorOpen = 0.0;
    T.doorsTarget = 0.0;
    T.pendingDepart = false;
    T.brakeSoundPlayed = false;
    T.approachSoundPlayed = true;

    T.trainGroup.position.set(T.activeTrackX, 0, T.trainZ);
    T.trainGroup.rotation.set(0, T.travelDir === -1 ? Math.PI : 0, 0);
    T.trainGroup.visible = true;
    setHeadlights(true, 3.6);
    T.syncTrainLights();
    T.updateDoorTransforms();

    T.safeAudioPlay('train_approach', { gain: 0.9 });
    T.safeAudioPlay('train_horn', { gain: 0.7 });
  }

  function getInteriorBounds() {
    const active = !!(T.initialized && T.trainGroup && T.trainGroup.visible && T.state !== 'AWAY');
    const dir = T.travelDir === -1 ? -1 : 1;
    _interiorBoundsOut.active = active;
    _interiorBoundsOut.trackX = T.activeTrackX || 0;
    _interiorBoundsOut.trainZ = T.trainZ || 0;
    _interiorBoundsOut.travelDir = dir;
    _interiorBoundsOut.halfWidth = TD.halfWidth;
    _interiorBoundsOut.interiorHalfWidth = TD.interiorHalfWidth;
    _interiorBoundsOut.aisleHalfWidth = 0.72;
    _interiorBoundsOut.floorY = TD.cabinFloorY;
    _interiorBoundsOut.lengthHalf = 25.35;
    _interiorBoundsOut.minX = _interiorBoundsOut.trackX - TD.interiorHalfWidth;
    _interiorBoundsOut.maxX = _interiorBoundsOut.trackX + TD.interiorHalfWidth;
    _interiorBoundsOut.minZ = _interiorBoundsOut.trainZ - 25.35;
    _interiorBoundsOut.maxZ = _interiorBoundsOut.trainZ + 25.35;
    _interiorBoundsOut.platformSideSign = dir;
    _interiorBoundsOut.platformExitX = T.localXToWorld(TD.halfWidth + 0.88);
    return _interiorBoundsOut;
  }

  function getOpenDoorways() {
    if (!T.initialized || !T.trainGroup || !T.trainGroup.visible) return EMPTY_DOORWAYS;
    if (T.state !== 'BOARDED_WAIT' || T.doorOpen < 0.70 || T.pendingDepart || T.doorsTarget < 0.5) {
      return EMPTY_DOORWAYS;
    }
    const thresholdWorldX = T.localXToWorld(TD.halfWidth + 0.62);
    const doorWorldX = T.localXToWorld(TD.halfWidth);
    const aisleWorldX = T.localXToWorld(0.0);
    for (let i = 0; i < DOOR_WORLDS_Z.length; i++) {
      const entry = _openDoorwaysPool[i];
      entry.localZ = DOOR_WORLDS_Z[i];
      entry.thresholdX = thresholdWorldX;
      entry.doorX = doorWorldX;
      entry.aisleX = aisleWorldX;
      entry.z = T.localZToWorld(DOOR_WORLDS_Z[i]);
      entry.y = TD.cabinFloorY;
      entry.doorOpen = T.doorOpen;
    }
    return _openDoorwaysPool;
  }

  function ejectExteriorEntities() {
    const bounds = getInteriorBounds();
    _ejectInfoOut.platformExitX = bounds.platformExitX;
    _ejectInfoOut.trackX = bounds.trackX;
    _ejectInfoOut.travelDir = bounds.travelDir;
    _ejectInfoOut.minZ = bounds.trainZ - 25.65;
    _ejectInfoOut.maxZ = bounds.trainZ + 25.65;
    _ejectInfoOut.ejectedCount = 0;
    if (bounds.active && LRT.Enemies && typeof LRT.Enemies.ejectFromTrain === 'function') {
      _ejectInfoOut.ejectedCount = LRT.Enemies.ejectFromTrain(bounds) || 0;
    }
    return _ejectInfoOut;
  }

  function openDoors() {
    if (T.doorsTarget < 0.5) {
      T.doorsTarget = 1.0;
      T.safeAudioPlay('door_chime', { gain: 0.85 });
      T.safeAudioPlay('door_open', { gain: 0.85 });
    }
  }

  function closeDoors() {
    if (T.doorsTarget > 0.5) {
      T.doorsTarget = 0.0;
      T.safeAudioPlay('door_chime', { gain: 0.85 });
      T.safeAudioPlay('door_close', { gain: 0.85 });
    }
    if (T.state === 'BOARDED_WAIT') {
      ejectExteriorEntities();
    }
  }

  function departNow() {
    if (T.state !== 'BOARDED_WAIT' && T.state !== 'APPROACHING') return false;
    if (T.state === 'APPROACHING') return false;
    T.pendingDepart = true;
    if (T.doorsTarget > 0.5) closeDoors();
    else ejectExteriorEntities();
    return true;
  }

  function beginDeparture(stationRef) {
    ejectExteriorEntities();
    T.pendingDepart = false;
    T.state = 'DEPARTING';
    T.speed = 0.0;
    T.accel = 7.4;
    T.rideTime = 0.0;
    T.rideDist = 0.0;
    T.oldDisposed = false;
    T.nextSpawned = false;
    T.nextBuildInProgress = false;
    T.incomingStationZ = 215.0 * T.travelDir;
    T.activeOldRootGroup = (stationRef && stationRef.rootGroup) ? stationRef.rootGroup : null;

    setHeadlights(true, 2.2);
    if (T.viaductGroup) {
      T.viaductGroup.visible = true;
      T.viaductGroup.position.set(T.activeTrackX, 0, 0);
      for (let c = 0; c < CHUNK_COUNT; c++) {
        viaductChunks[c].position.set(0, 0, (c - (CHUNK_COUNT * 0.5 - 0.5)) * CHUNK_LEN);
      }
    }
    if (LRT.Audio && typeof LRT.Audio.startLoop === 'function') {
      LRT.Audio.startLoop('train_ride_loop', 0.25, 0.6, 0.85);
    }
  }

  function getRideProgress() {
    if (T.state !== 'DEPARTING' && T.state !== 'CRUISE' && T.state !== 'ARRIVING') return 0.0;
    const totalDist = 375.0; // 160m departure scroll + 215m incoming station approach
    if (!T.oldDisposed) {
      return Math.max(0.0, Math.min(160.0 / totalDist, T.rideDist / totalDist));
    }
    if (!T.nextSpawned) return 160.0 / totalDist;
    const rem = Math.max(0.0, Math.min(215.0, T.incomingStationZ * T.travelDir));
    const done = 160.0 + (215.0 - rem);
    return Math.max(0.0, Math.min(1.0, done / totalDist));
  }

  function setTrackX(nextTrackX) {
    if (typeof nextTrackX !== 'number' || !Number.isFinite(nextTrackX)) return 0.0;
    const prevX = T.activeTrackX || 0.0;
    const deltaX = nextTrackX - prevX;
    if (Math.abs(deltaX) <= 1e-6) return 0.0;
    T.activeTrackX = nextTrackX;
    if (T.trainGroup) T.trainGroup.position.x = nextTrackX;
    if (T.viaductGroup) T.viaductGroup.position.x = nextTrackX;
    T.syncTrainLights();
    return deltaX;
  }

  function syncStationOffsetZ(stationRef, z) {
    if (!stationRef) return;
    if (typeof stationRef.setOffsetZ === 'function') {
      stationRef.setOffsetZ(z);
    } else if (stationRef.rootGroup) {
      stationRef.rootGroup.position.z = z;
      stationRef.rootGroup.updateMatrixWorld(true);
    }
  }

  function update(dt, stationRef, onDisposeOld, onSpawnNext, onBuildComplete) {
    if (!T.initialized) return;
    const clampedDt = Math.min(dt || 0.016, 0.05);
    T.animTime += clampedDt;

    // Update doors
    const prevDoor = T.doorOpen;
    if (Math.abs(T.doorsTarget - T.doorOpen) > 0.001) {
      const dir = T.doorsTarget > T.doorOpen ? 1 : -1;
      T.doorOpen = Math.max(0, Math.min(1, T.doorOpen + dir * clampedDt * 1.35));
      T.updateDoorTransforms();
    }
    if (stationRef && typeof stationRef.setPsdOpen === 'function' && (T.state === 'BOARDED_WAIT' || Math.abs(T.doorOpen - prevDoor) > 0.0001)) {
      stationRef.setPsdOpen(T.doorOpen, T.travelDir);
    }

    let stationWorldZ = stationRef && stationRef.rootGroup ? stationRef.rootGroup.position.z : 0;

    if (T.state === 'APPROACHING') {
      // Smooth kinematic approach toward z = 0 along active travelDir (+1 or -1)
      const distRemaining = Math.max(0, -T.trainZ * T.travelDir);
      T.speed = Math.max(1.8, Math.min(26.5, Math.sqrt(2.0 * 1.98 * distRemaining)));
      T.accel = -1.98;
      T.trainZ += T.travelDir * T.speed * clampedDt;

      if (!T.brakeSoundPlayed && T.trainZ * T.travelDir >= -58.0) {
        T.brakeSoundPlayed = true;
        T.safeAudioPlay('train_brake', { gain: 0.9 });
      }

      if (T.trainZ * T.travelDir >= 0.0) {
        T.trainZ = 0.0;
        T.speed = 0.0;
        T.accel = 0.0;
        T.state = 'BOARDED_WAIT';
        setHeadlights(true, 1.15);
        if (T.viaductGroup) T.viaductGroup.visible = false;
        openDoors();
        T.repaintPisLcd(T.currentStationName, T.travelDir);
        syncDepartPrompts();
      }
      T.trainGroup.position.set(T.activeTrackX, 0, T.trainZ);
      T.trainGroup.rotation.set(0, T.travelDir === -1 ? Math.PI : 0, 0);
    } else if (T.state === 'BOARDED_WAIT') {
      T.speed = 0.0;
      T.accel = 0.0;
      T.trainGroup.position.set(T.activeTrackX, 0, 0);
      T.trainGroup.rotation.set(0, T.travelDir === -1 ? Math.PI : 0, 0);
      if (T.pendingDepart && T.doorOpen <= 0.02) {
        beginDeparture(stationRef);
      }
    } else if (T.state === 'DEPARTING' || T.state === 'CRUISE' || T.state === 'ARRIVING') {
      T.trainGroup.position.set(T.activeTrackX, 0, 0);
      T.trainGroup.rotation.set(0, T.travelDir === -1 ? Math.PI : 0, 0);
      T.rideTime += clampedDt;

      if (T.state === 'DEPARTING') {
        T.accel = 7.4;
        T.speed = Math.min(CRUISE_SPEED, T.speed + T.accel * clampedDt);
        if (T.speed >= CRUISE_SPEED - 0.5) {
          T.state = 'CRUISE';
          T.accel = 0.0;
        }
      } else if (T.state === 'CRUISE') {
        T.accel = 0.0;
        T.speed = CRUISE_SPEED;
      } else if (T.state === 'ARRIVING') {
        const distLeft = Math.max(0, T.incomingStationZ * T.travelDir);
        T.speed = Math.max(1.8, Math.min(CRUISE_SPEED, Math.sqrt(2.0 * 2.95 * distLeft)));
        T.accel = -2.95;
      }

      const stepZ = T.speed * clampedDt;
      T.rideDist += stepZ;

      // Update ride audio pitch & volume smoothly
      if (LRT.Audio && typeof LRT.Audio.setLoopVolume === 'function') {
        const ratio = Math.min(1.0, T.speed / CRUISE_SPEED);
        LRT.Audio.setLoopVolume('train_ride_loop', 0.15 + 0.72 * ratio, 0.1, 0.78 + 0.34 * ratio);
      }

      // Scroll Old Station opposite to travelDir until 160m behind, then dispose & spawn destination station ahead
      if (!T.oldDisposed && stationRef && stationRef.rootGroup) {
        const nextOldZ = stationRef.rootGroup.position.z - T.travelDir * stepZ;
        syncStationOffsetZ(stationRef, nextOldZ);
        stationWorldZ = stationRef.rootGroup.position.z;
        if (stationWorldZ * T.travelDir <= -160.0) {
          T.oldDisposed = true;
          if (typeof onDisposeOld === 'function') onDisposeOld();
        }
      } else if (T.oldDisposed && !T.nextSpawned) {
        T.nextSpawned = true;
        T.incomingStationZ = 215.0 * T.travelDir;
        const spawned = typeof onSpawnNext === 'function' ? onSpawnNext(T.incomingStationZ) : null;
        const targetRef = spawned || stationRef;
        T.nextBuildInProgress = !!(targetRef && typeof targetRef.isIncrementalBuilding === 'function' && targetRef.isIncrementalBuilding());
        if (spawned && spawned.rootGroup) {
          syncStationOffsetZ(spawned, T.incomingStationZ);
        } else if (stationRef && stationRef.rootGroup && stationRef.rootGroup !== T.activeOldRootGroup) {
          syncStationOffsetZ(stationRef, T.incomingStationZ);
          stationWorldZ = T.incomingStationZ;
        }
        if (!T.nextBuildInProgress && typeof onBuildComplete === 'function' && targetRef && typeof targetRef.getStats === 'function') {
          onBuildComplete(targetRef.getStats(), T.incomingStationZ);
        }
      } else if (T.nextSpawned) {
        if (T.nextBuildInProgress && stationRef && typeof stationRef.stepIncrementalBuild === 'function') {
          const stepRes = stationRef.stepIncrementalBuild();
          if (stepRes && stepRes.done) {
            T.nextBuildInProgress = false;
            if (typeof onBuildComplete === 'function') {
              onBuildComplete(stepRes.stats, T.incomingStationZ);
            }
          }
        }
        T.incomingStationZ -= T.travelDir * stepZ;
        if (T.nextBuildInProgress && (T.incomingStationZ * T.travelDir) < 116.0) {
          T.incomingStationZ = 116.0 * T.travelDir;
        }
        const remDist = T.incomingStationZ * T.travelDir;
        if (stationRef && stationRef.rootGroup && stationRef.rootGroup !== T.activeOldRootGroup) {
          syncStationOffsetZ(stationRef, T.incomingStationZ);
          stationWorldZ = T.incomingStationZ;
        }
        if (T.state === 'CRUISE' && !T.nextBuildInProgress && remDist <= 114.0) {
          T.state = 'ARRIVING';
          T.brakeSoundPlayed = false;
        }
        if (T.state === 'ARRIVING' && !T.brakeSoundPlayed && remDist <= 52.0) {
          T.brakeSoundPlayed = true;
          T.safeAudioPlay('train_brake', { gain: 0.9 });
        }
        if (remDist <= 0.02) {
          T.incomingStationZ = 0.0;
          syncStationOffsetZ(stationRef, 0);
          stationWorldZ = 0.0;
          T.speed = 0.0;
          T.accel = 0.0;
          T.state = 'BOARDED_WAIT';
          setHeadlights(true, 1.15);
          if (T.viaductGroup) T.viaductGroup.visible = false;
          if (LRT.Audio && typeof LRT.Audio.stopLoop === 'function') {
            LRT.Audio.stopLoop('train_ride_loop', 0.35);
          }
          T.safeAudioPlay('station_chime', { gain: 0.75 });
          openDoors();
          if (stationRef && typeof stationRef.getStats === 'function') {
            const stInfo = stationRef.getStats();
            const stName = stInfo && (stInfo.stationName || stInfo.name);
            if (stName) {
              T.currentStationName = 'TIBA: ' + stName;
              T.repaintPisLcd(T.currentStationName, T.travelDir);
            }
          }
          syncDepartPrompts();
        }
      }

      T.updateViaductChunks(clampedDt, stationWorldZ);
    }

    if (T.speed > 0.05) {
      T.wheelAngle += (T.speed * clampedDt) / WHEEL_RADIUS;
      T.updateWheels();
    }
    T.updateStrapsAndSway(clampedDt);
    T.syncTrainLights();
  }

  function setWarmupMode(active) {
    if (!T.initialized) return;
    T.warmupActive = !!active;
    if (T.warmupActive) {
      if (T.trainGroup) {
        T.trainGroup.visible = true;
        T.trainGroup.position.set(T.activeTrackX, 0, 0);
        T.trainGroup.rotation.set(0, T.travelDir === -1 ? Math.PI : 0, 0);
      }
      if (T.viaductGroup) {
        T.viaductGroup.visible = true;
        T.viaductGroup.position.set(T.activeTrackX, 0, 0);
        for (let i = 0; i < viaductChunks.length; i++) {
          viaductChunks[i].visible = true;
        }
      }
      if (T.headlightConeL) T.headlightConeL.visible = true;
      if (T.headlightConeR) T.headlightConeR.visible = true;
      for (let i = 0; i < scorchDecals.length; i++) scorchDecals[i].visible = true;
    } else {
      const showTrain = T.state !== 'AWAY';
      if (T.trainGroup) {
        T.trainGroup.visible = showTrain;
        T.trainGroup.position.set(T.activeTrackX, 0, T.trainZ);
        T.trainGroup.rotation.set(0, T.travelDir === -1 ? Math.PI : 0, 0);
      }
      const showViaduct = (T.state === 'DEPARTING' || T.state === 'CRUISE' || T.state === 'ARRIVING');
      if (T.viaductGroup) T.viaductGroup.visible = showViaduct;
      const showCones = showTrain && T.headlightIntensityTarget > 0.01;
      if (T.headlightConeL) T.headlightConeL.visible = showCones;
      if (T.headlightConeR) T.headlightConeR.visible = showCones;
      for (let i = 0; i < scorchDecals.length; i++) scorchDecals[i].visible = false;
    }
    T.syncTrainLights();
  }

  function getColliders() {
    if (!T.initialized || !T.trainGroup || !T.trainGroup.visible) return [];
    activeColliders.length = 0;

    for (let i = 0; i < staticLocalColliders.length; i++) {
      const c = staticLocalColliders[i];
      activeColliders.push(T.localBoxToWorld(c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, c.tag, c.isFloor, true));
    }

    const doorOpenPassable = T.doorOpen >= 0.65;
    for (let i = 0; i < doorLocalColliders.length; i++) {
      const d = doorLocalColliders[i];
      if (!doorOpenPassable) {
        activeColliders.push(T.localBoxToWorld(d.minX, d.minY, d.minZ, d.maxX, d.maxY, d.maxZ, 'train_wall', false, true));
      }
      if (T.doorOpen >= 0.40) {
        // Seamless threshold bridge spanning the 9.5cm gap between platform and train floor
        activeColliders.push(T.localBoxToWorld(d.bridgeMinX, d.bridgeMinY, d.bridgeMinZ, d.bridgeMaxX, d.bridgeMaxY, d.bridgeMaxZ, 'train_floor', true, true));
      }
    }

    return activeColliders;
  }

  function isPlayerInside(pos) {
    if (!T.initialized || !T.trainGroup || !T.trainGroup.visible || !pos) return false;
    return (
      Math.abs(T.worldToLocalX(pos.x)) <= 1.25 &&
      pos.y >= -0.35 && pos.y <= 2.38 &&
      Math.abs(T.worldToLocalZ(pos.z)) <= 25.35
    );
  }

  function getInteractableNear(pos, lookDir) {
    if (!T.initialized || !T.trainGroup || !T.trainGroup.visible || !pos) return null;
    if (!isPlayerInside(pos)) return null;

    let best = null;
    let bestDist = 2.65;

    for (let i = 0; i < localInteractables.length; i++) {
      const item = localInteractables[i];
      let prompt = T.state === 'BOARDED_WAIT' ? item.promptBoarded : item.promptCruise;
      if (!prompt) continue;
      if (item.action === 'depart' && T.state === 'BOARDED_WAIT') {
        prompt = formatDepartPrompt();
        item.promptBoarded = prompt;
      }

      _v1.set(T.localXToWorld(item.pos.x), item.pos.y, T.localZToWorld(item.pos.z));
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
          prompt: prompt.indexOf('[E]') !== -1 ? prompt : ('[E] ' + prompt),
          pos: _v1.clone(),
          distance: d
        };
      }
    }
    return best;
  }

  function interact(id) {
    if (!T.initialized || !id) return { handled: false };
    for (let i = 0; i < localInteractables.length; i++) {
      const item = localInteractables[i];
      if (item.id === id) {
        if (item.action === 'depart' && T.state === 'BOARDED_WAIT') {
          departNow();
          return {
            handled: true,
            action: 'depart',
            message: T.travelDir < 0
              ? '🟠 Pintu ditutup — LRT kembali ke stasiun sebelumnya!'
              : '🟢 Pintu ditutup — LRT berangkat ke stasiun berikutnya!'
          };
        }
        if (item.action === 'horn') {
          T.safeAudioPlay('train_horn', { gain: 0.95 });
          const lure = T.localToWorld({ x: 0, y: 1.0, z: 0 });
          let stunnedCount = 0;
          if (LRT.Enemies) {
            if (typeof LRT.Enemies.alertAllTo === 'function') {
              LRT.Enemies.alertAllTo(lure, 60.0);
            }
            if (typeof LRT.Enemies.stunByHorn === 'function') {
              const sRes = LRT.Enemies.stunByHorn(lure, 32.0);
              stunnedCount = sRes && sRes.stunned ? sRes.stunned : 0;
            }
          }
          return {
            handled: true,
            action: 'horn',
            lurePos: lure,
            stunnedCount: stunnedCount,
            message: stunnedCount > 0
              ? `Klakson LRT dibunyikan — ${stunnedCount} infected terguncang gelombang akustik!`
              : 'Klakson LRT Jabodebek dibunyikan — Menarik perhatian infected!'
          };
        }
        if (item.action === 'sit') {
          T.safeAudioPlay('turnstile_beep', { gain: 0.35 });
          return {
            handled: true,
            action: 'sit',
            seatLocal: item.seatLocal,
            standLocal: item.standLocal,
            seatWorld: T.localToWorld(item.seatLocal),
            standWorld: T.localToWorld(item.standLocal),
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
    getRideProgress,
    getState: () => T.state,
    getSpeed: () => T.speed,
    getDoorOpen: () => T.doorOpen,
    getOffsetZ: () => (T.trainGroup ? T.trainGroup.position.z : 0),
    getTrackX: () => T.activeTrackX,
    setTrackX,
    getDirection: () => T.travelDir,
    localToWorld: T.localToWorld,
    createStaticLrtConsist: T.createStaticLrtConsist,
    isPlayerInside,
    getOpenDoorways,
    getInteriorBounds,
    ejectExteriorEntities,
    getColliders,
    raycastTrain: T.raycastTrain,
    applyDamage: T.applyDamage,
    getInteractableNear,
    getInteractables: () => {
      syncDepartPrompts();
      return localInteractables;
    },
    interact,
    getVisualRoot: () => T.trainVisualRoot,
    getRoot: () => T.trainGroup,
    setWarmupMode,
    setNextStationName: (name, dir) => {
      T.currentStationName = name || 'Cawang';
      T.repaintPisLcd(T.currentStationName, dir !== undefined ? dir : T.travelDir);
    },
    getStats: () => ({
      ...T.stats,
      state: T.state,
      speed: T.speed,
      doorOpen: T.doorOpen,
      trainZ: T.trainZ,
      activeTrackX: T.activeTrackX,
      travelDir: T.travelDir,
      rideProgress: getRideProgress(),
      oldDisposed: !!T.oldDisposed,
      nextSpawned: !!T.nextSpawned,
      nextBuildInProgress: !!T.nextBuildInProgress
    }),
    syncLights: T.syncTrainLights
  };
})(window.LRT = window.LRT || {});
