(function (LRT) {
  'use strict';

  window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {};
  const S = (window.__LRT_INTERNAL__.station = window.__LRT_INTERNAL__.station || {});
  const _pooledStationLights = S._pooledStationLights || [];
  const createPartBatcher = (...args) => S.createPartBatcher(...args);
  const addPbrPart = (...args) => S.addPbrPart(...args);
  const addBenchProp = (...args) => S.props.addBenchProp(...args);
  const addTrashBinProp = (...args) => S.props.addTrashBinProp(...args);
  const placeFieldLogProp = (...args) => S.loreLoot.placeFieldLogProp(...args);
  const buildStallsAndTubes = (...args) => S.props.buildStallsAndTubes(...args);

  function buildDestructiblesAndNav(station, ctx, opts) {
    const o = opts || {};
    const doDestruct = !o.onlyFinalizeNav;
    const doCitySync = !o.onlyDestructibles && !o.onlyFinalizeNav && !o.skipCity;
    const doFinalizeNav = !o.onlyDestructibles;

    const {
      STREET_GROUND_Y, SIDEWALK_Y, TRACK_BED_Y, UPPER_FLOOR_Y,
      CROSSING_Z_SOUTH, CROSSING_Z_NORTH
    } = S.CONST;
    const {
      prepGeo, buildRebarCoreGeometry, buildBarricadeGeometry, tmp
    } = S;
    const _tmpDummy = tmp.dummy;
    const _tmpColor = tmp.color;

    const {
      arch, mood, chosenMoodKey, rng, root, mats,
      glassRecords, isInStairExclusion,
      navNodes, navEdges, addNavNode, addNavChain,
      isIsland, isCawang, p1MinX, p1Width, p1MaxX, p2MinX, p2MaxX,
      i2MinX, i2MaxX, platMinZ, platMaxZ, platLen, track2X, trackXs,
      concMinX, concMaxX, concMinZ, concMaxZ, concMidZ, cw,
      canopyMinX, canopySpanX, segs, getCanopyArchY,
      corridorMinX, corridorMaxX, depotMaxX, gardenMaxX,
      jpoZ, jpoNearZ, jpoSpanMinX, jpoSpanMaxX, jpoCX, jpo2Z,
      stairX, stairFootZ, cStairX, cStairFootZ, cStairTopZ,
      supX, supZ, rotioX, rotioZ, indoX, indoZ, lkX, lkZ, shX, shZ,
      turnstileList, tubeCoords
    } = ctx;

    if (doDestruct) {
    // =========================================================
    // 8. DESTRUCTIBLE PILLARS + SHATTERABLE GLASS + TUBES + DYNAMIC PROPS
    // =========================================================
    station.pillars = [];
    const pillarPositions = [];
    for (let pz = -36; pz <= 36; pz += 18) {
      pillarPositions.push([p1MaxX - 0.55, pz]);
      if (isIsland && pz % 36 === 0) pillarPositions.push([p1MinX + 3.4, pz]);
    }
    if (!isIsland) {
      pillarPositions.push([concMinX + 7.5, concMinZ + 4.5]);
      pillarPositions.push([concMinX + 7.5, concMaxZ - 4.5]);
    }

    const coreGeo = buildRebarCoreGeometry();
    station.disposableGeometries.push(coreGeo);
    const pillarCoresInst = new THREE.InstancedMesh(coreGeo, mats.concreteRebar, pillarPositions.length);
    pillarCoresInst.castShadow = false;
    pillarCoresInst.receiveShadow = true;
    root.add(pillarCoresInst);

    for (let p = 0; p < pillarPositions.length; p++) {
      const px = pillarPositions[p][0];
      const pz = pillarPositions[p][1];
      if (isInStairExclusion(px, pz, 0.4, 0.4)) {
        _tmpDummy.scale.set(0, 0, 0);
        _tmpDummy.updateMatrix();
        pillarCoresInst.setMatrixAt(p, _tmpDummy.matrix);
        continue;
      }
      _tmpDummy.position.set(px, 1.90, pz);
      _tmpDummy.rotation.set(0, 0, 0);
      _tmpDummy.scale.set(1, 1, 1);
      _tmpDummy.updateMatrix();
      pillarCoresInst.setMatrixAt(p, _tmpDummy.matrix);

      const shellGeo = prepGeo(new THREE.BoxGeometry(0.76, 3.85, 0.76, 3, 6, 3), true);
      station.disposableGeometries.push(shellGeo);
      const basePos = new Float32Array(shellGeo.attributes.position.array);
      const shellMesh = new THREE.Mesh(shellGeo, mats.concretePillar);
      shellMesh.position.set(px, 1.925, pz);
      shellMesh.castShadow = true;
      shellMesh.receiveShadow = true;
      root.add(shellMesh);

      const colId = station._addCollider(px - 0.40, 0, pz - 0.40, px + 0.40, 3.85, pz + 0.40, 'pillar', {
        pillarId: station.pillars.length
      });

      station.pillars.push({
        id: station.pillars.length, x: px, y: 1.925, z: pz,
        hp: 140, maxHp: 140, destroyed: false, deformed: false,
        shellMesh: shellMesh, basePos: basePos, colliderIdx: colId
      });
    }
    pillarCoresInst.instanceMatrix.needsUpdate = true;

    // Shatterable Glass Panes
    const glassGeo = new THREE.BoxGeometry(1, 1, 1);
    station.disposableGeometries.push(glassGeo);
    const glassInst = new THREE.InstancedMesh(glassGeo, mats.glassPsd, Math.max(1, glassRecords.length));
    glassInst.renderOrder = 3;
    glassInst.count = glassRecords.length;
    glassInst.visible = glassRecords.length > 0;
    if (glassRecords.length === 0) {
      _tmpDummy.position.set(0, -100, 0);
      _tmpDummy.scale.set(0, 0, 0);
      _tmpDummy.updateMatrix();
      glassInst.setMatrixAt(0, _tmpDummy.matrix);
    }
    root.add(glassInst);
    station._glassInst = glassInst;
    station.glassPanes = [];

    for (let i = 0; i < glassRecords.length; i++) {
      const g = glassRecords[i];
      g.id = i;
      g.instIdx = i;
      g.broken = false;
      station.glassPanes.push(g);
      if (station.colliders[g.colliderIdx]) station.colliders[g.colliderIdx].glassId = i;
      _tmpDummy.position.set(g.cx, g.cy, g.cz);
      _tmpDummy.rotation.set(0, g.ry, 0);
      _tmpDummy.scale.set(g.w, g.h, g.d);
      _tmpDummy.updateMatrix();
      glassInst.setMatrixAt(i, _tmpDummy.matrix);
    }
    glassInst.instanceMatrix.needsUpdate = true;
    station.setPsdOpen(0, 1);
    station.setPsdOpen(0, -1);

    // Flickering Fluorescent Tubes + Halos
    const tubeGeo = new THREE.BoxGeometry(0.14, 0.06, 2.2);
    station.disposableGeometries.push(tubeGeo);
    const tubeStateArr = new Float32Array(Math.max(1, tubeCoords.length) * 2);
    const tubeInst = new THREE.InstancedMesh(tubeGeo, mats.flickerTube, Math.max(1, tubeCoords.length));
    tubeInst.count = tubeCoords.length;
    tubeInst.visible = tubeCoords.length > 0;
    const haloGeo = new THREE.PlaneGeometry(0.72, 2.15);
    haloGeo.rotateX(-Math.PI * 0.5);
    station.disposableGeometries.push(haloGeo);
    const haloInst = new THREE.InstancedMesh(haloGeo, mats.tubeHalo, Math.max(1, tubeCoords.length));
    haloInst.count = tubeCoords.length;
    haloInst.visible = tubeCoords.length > 0;
    if (tubeCoords.length === 0) {
      _tmpDummy.position.set(0, -100, 0);
      _tmpDummy.scale.set(0, 0, 0);
      _tmpDummy.updateMatrix();
      tubeInst.setMatrixAt(0, _tmpDummy.matrix);
      haloInst.setMatrixAt(0, _tmpDummy.matrix);
    }

    station.tubes = [];
    for (let t = 0; t < tubeCoords.length; t++) {
      const tc = tubeCoords[t];
      const seedVal = rng() * 100.0;
      const startHealth = chosenMoodKey === 'BLACKOUT_EMERGENCY'
        ? (rng() < 0.45 ? 0.0 : rng() < 0.65 ? 0.35 : 0.96)
        : (rng() < 0.15 ? 0.42 : 1.0);
      tubeStateArr[t * 2] = seedVal;
      tubeStateArr[t * 2 + 1] = startHealth;

      _tmpDummy.position.set(tc.x, tc.y, tc.z);
      _tmpDummy.rotation.set(0, 0, 0);
      _tmpDummy.scale.set(1, 1, 1);
      _tmpDummy.updateMatrix();
      tubeInst.setMatrixAt(t, _tmpDummy.matrix);

      _tmpDummy.position.set(tc.x, tc.y - 0.05, tc.z);
      _tmpDummy.scale.setScalar(startHealth > 0.1 ? 1.0 : 0.0);
      _tmpDummy.updateMatrix();
      haloInst.setMatrixAt(t, _tmpDummy.matrix);

      station.tubes.push({ id: t, x: tc.x, y: tc.y, z: tc.z, seed: seedVal, health: startHealth, instIdx: t });
    }
    tubeGeo.setAttribute('aTubeState', new THREE.InstancedBufferAttribute(tubeStateArr, 2));
    tubeInst.instanceMatrix.needsUpdate = true;
    haloInst.instanceMatrix.needsUpdate = true;
    root.add(tubeInst);
    root.add(haloInst);
    station._tubeInst = tubeInst;
    station._tubeHaloInst = haloInst;

    // Dynamic Rigid-Body Props
    const paintPropSpecs = [
      { x: rotioX + 2.15, y: 0.42, z: rotioZ + 1.45, sx: 0.42, sy: 0.82, sz: 0.42, rx: 0, ry: 0.2, rz: 0, color: 0xe6b81a, halfH: 0.41, dynamic: true },
      { x: rotioX + 2.15, y: 0.22, z: rotioZ + 2.10, sx: 0.42, sy: 0.82, sz: 0.42, rx: 1.45, ry: 0.7, rz: 0.3, color: 0xe6b81a, halfH: 0.22, dynamic: true }
    ];
    const metalPropSpecs = [];
    const benchZs = isIsland ? [-40, -20, 26, 42] : [-42, -14, 14, 42];
    for (let bi = 0; bi < benchZs.length; bi++) {
      const bz = benchZs[bi];
      const tx = p1MinX + 3.4;
      if (!isInStairExclusion(tx, bz + 2.2, 0.5, 0.5)) {
        addTrashBinProp(station, ctx.root, tx, 0.0, bz + 2.2);
      }
      if (!isInStairExclusion(tx, bz, 0.5, 1.2)) {
        const cityInt = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.city;
        const benchProto = (cityInt && typeof cityInt.getParkBenchProto === 'function') ? cityInt.getParkBenchProto() : null;
        if (benchProto && benchProto.parts && benchProto.parts.length) {
          const bGrp = new THREE.Group();
          bGrp.position.set(tx, 0.0, bz);
          bGrp.rotation.y = Math.PI * 0.5;
          for (let bp = 0; bp < benchProto.parts.length; bp++) {
            const bm = new THREE.Mesh(benchProto.parts[bp].geo, benchProto.parts[bp].mat);
            bm.castShadow = false;
            bm.receiveShadow = true;
            bGrp.add(bm);
          }
          root.add(bGrp);
          station._addCollider(tx - 0.36, 0.0, bz - 0.96, tx + 0.36, 0.88, bz + 0.96, 'wood', { blocksBullets: false });
          station.interactables.push({
            id: 'bench_plat_' + bi,
            type: 'bench',
            sittable: true,
            x: tx,
            y: 0.55,
            z: bz,
            seatPos: { x: tx + 0.14, y: 0.02, z: bz },
            standPos: { x: tx + 0.92, y: 0.02, z: bz },
            yaw: -Math.PI * 0.5,
            label: '[E] Duduk di Bangku Peron',
            prompt: '[E] Duduk di Bangku Peron',
            targetObj: bGrp
          });
          if (typeof station._registerHaloTarget === 'function') {
            station._registerHaloTarget('bench_plat_' + bi, bGrp, {
              category: 'interactable', x: tx, y: 0.45, z: bz, hitRadius: 0.95
            });
          }
        } else {
          metalPropSpecs.push({ x: tx, y: 0.26, z: bz, sx: 0.56, sy: 0.52, sz: 2.1, rx: 0, ry: 0, rz: 0, color: 0x383e44, halfH: 0.26, dynamic: true });
        }
      }
      if (rng() > 0.3 && !isInStairExclusion(tx - 0.5, bz - 2.6, 0.5, 0.5)) {
        paintPropSpecs.push({ x: tx - 0.5, y: 0.32, z: bz - 2.6, sx: 0.46, sy: 0.64, sz: 0.28, rx: rng() > 0.5 ? 1.4 : 0, ry: rng() * 3, rz: 0, color: rng() > 0.5 ? 0x7c2d2d : 0x2f3b4a, halfH: 0.24, dynamic: true });
      }
    }
    const barricadePropSpecs = [];
    const barZs = [-36, -10, 40];
    for (let k = 0; k < barZs.length; k++) {
      const brZ = barZs[k];
      const brX = p1MinX + 2.8 + (k % 2) * 1.1;
      if (isInStairExclusion(brX, brZ, 0.8, 0.8)) continue;
      barricadePropSpecs.push({ x: brX, y: 0.39, z: brZ, sx: 1.20, sy: 0.78, sz: 0.20, rx: 0, ry: (rng() - 0.5) * 0.4, rz: 0, color: 0xffffff, halfH: 0.39, dynamic: true });
    }

    const propBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    station.disposableGeometries.push(propBoxGeo);
    const propsPaintInst = new THREE.InstancedMesh(propBoxGeo, mats.propsPaint, Math.max(1, paintPropSpecs.length));
    propsPaintInst.castShadow = false;
    propsPaintInst.receiveShadow = true;
    propsPaintInst.count = paintPropSpecs.length;
    propsPaintInst.visible = paintPropSpecs.length > 0;
    if (paintPropSpecs.length === 0) {
      _tmpDummy.position.set(0, -100, 0);
      _tmpDummy.scale.set(0, 0, 0);
      _tmpDummy.updateMatrix();
      propsPaintInst.setMatrixAt(0, _tmpDummy.matrix);
      propsPaintInst.instanceMatrix.needsUpdate = true;
    }
    root.add(propsPaintInst);
    station._propsPaintInst = propsPaintInst;

    const propsMetalInst = new THREE.InstancedMesh(propBoxGeo, mats.propsMetal, Math.max(1, metalPropSpecs.length));
    propsMetalInst.castShadow = false;
    propsMetalInst.receiveShadow = true;
    propsMetalInst.count = metalPropSpecs.length;
    propsMetalInst.visible = metalPropSpecs.length > 0;
    if (metalPropSpecs.length === 0) {
      _tmpDummy.position.set(0, -100, 0);
      _tmpDummy.scale.set(0, 0, 0);
      _tmpDummy.updateMatrix();
      propsMetalInst.setMatrixAt(0, _tmpDummy.matrix);
      propsMetalInst.instanceMatrix.needsUpdate = true;
    }
    root.add(propsMetalInst);
    station._propsMetalInst = propsMetalInst;

    const barricadeGeo = buildBarricadeGeometry();
    station.disposableGeometries.push(barricadeGeo);
    const barricadeInst = new THREE.InstancedMesh(barricadeGeo, mats.barricade, Math.max(1, barricadePropSpecs.length));
    barricadeInst.castShadow = false;
    barricadeInst.receiveShadow = true;
    barricadeInst.count = barricadePropSpecs.length;
    barricadeInst.visible = barricadePropSpecs.length > 0;
    if (barricadePropSpecs.length === 0) {
      _tmpDummy.position.set(0, -100, 0);
      _tmpDummy.scale.set(0, 0, 0);
      _tmpDummy.updateMatrix();
      barricadeInst.setMatrixAt(0, _tmpDummy.matrix);
      barricadeInst.instanceMatrix.needsUpdate = true;
    }
    root.add(barricadeInst);
    station._barricadeInst = barricadeInst;

    station.dynamicProps = [];
    const registerProps = (specs, instMesh, isMetal) => {
      for (let i = 0; i < specs.length; i++) {
        const sp = specs[i];
        _tmpDummy.position.set(sp.x, sp.y, sp.z);
        _tmpDummy.rotation.set(sp.rx, sp.ry, sp.rz);
        _tmpDummy.scale.set(sp.sx, sp.sy, sp.sz);
        _tmpDummy.updateMatrix();
        instMesh.setMatrixAt(i, _tmpDummy.matrix);
        _tmpColor.setHex(sp.color);
        instMesh.setColorAt(i, _tmpColor);

        const colId = sp.dynamic ? station._addCollider(
          sp.x - sp.sx * 0.5, sp.y - sp.sy * 0.5, sp.z - sp.sz * 0.5,
          sp.x + sp.sx * 0.5, sp.y + sp.sy * 0.5, sp.z + sp.sz * 0.5,
          isMetal ? 'metal' : 'prop', { propId: station.dynamicProps.length }
        ) : -1;

        station.dynamicProps.push({
          id: station.dynamicProps.length, instMesh: instMesh, instIdx: i,
          x: sp.x, y: sp.y, z: sp.z, rx: sp.rx, ry: sp.ry, rz: sp.rz,
          sx: sp.sx, sy: sp.sy, sz: sp.sz, vx: 0, vy: 0, vz: 0,
          avx: 0, avy: 0, avz: 0, halfH: sp.halfH, dynamic: sp.dynamic,
          detached: false, settleTimer: 0, spinTimer: 0,
          interactId: sp.interactId || null, colliderIdx: colId
        });
      }
      instMesh.instanceMatrix.needsUpdate = true;
      if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
    };
    registerProps(paintPropSpecs, propsPaintInst, false);
    registerProps(metalPropSpecs, propsMetalInst, true);
    registerProps(barricadePropSpecs, barricadeInst, false);

    // Botanical Vines ONLY on Harjamukti's garden station (regular stations are hours after outbreak — NO months-old overgrowth!)
    const vineCount = arch.heavyOvergrowth ? 24 : 0;
    if (vineCount > 0) {
      const vPlane1 = new THREE.PlaneGeometry(1.4, 2.4);
      vPlane1.translate(0, -1.2, 0);
      const vPlane2 = new THREE.PlaneGeometry(1.4, 2.4);
      vPlane2.rotateY(Math.PI * 0.5);
      vPlane2.translate(0, -1.2, 0);
      const vineGeo = THREE_UTILS.mergeGeometries([prepGeo(vPlane1, false), prepGeo(vPlane2, false)], false);
      vPlane1.dispose();
      vPlane2.dispose();
      station.disposableGeometries.push(vineGeo);
      const vinesInst = new THREE.InstancedMesh(vineGeo, mats.foliageVine, vineCount);
      const purlinXs = [];
      for (let k = 0; k <= segs; k++) {
        const candX = canopyMinX + (k / segs) * canopySpanX;
        const nearTrack = trackXs.some((tx) => Math.abs(candX - tx) < 2.15);
        if (!nearTrack) purlinXs.push(candX);
      }
      if (purlinXs.length === 0) purlinXs.push(p1MinX + 2.2);
      for (let v = 0; v < vineCount; v++) {
        const px = purlinXs[v % purlinXs.length];
        const roofY = getCanopyArchY(px) + 0.04;
        _tmpDummy.position.set(px, roofY, (rng() - 0.5) * (platLen - 14));
        _tmpDummy.rotation.set(0, rng() * Math.PI, 0);
        const sc = 0.65 + rng() * 0.65;
        const maxSafeSy = Math.max(0.35, (roofY - 4.35) / 2.4);
        const sy = Math.min(maxSafeSy, sc * (0.85 + rng() * 0.5));
        _tmpDummy.scale.set(sc, sy, sc);
        _tmpDummy.updateMatrix();
        vinesInst.setMatrixAt(v, _tmpDummy.matrix);
      }
      vinesInst.instanceMatrix.needsUpdate = true;
      root.add(vinesInst);
    }

    // =========================================================
    // 8B. HOURS-AFTER-OUTBREAK EVACUATION CHAOS (SHATTERED GLASS, DROPPED BAGS, PAPERS)
    // =========================================================
    {
      const shardGeos = [];
      const addGlassShardTri = (gx, gy, gz, sz, rotY) => {
        const c = Math.cos(rotY), s = Math.sin(rotY);
        const a0x = -sz * 0.6, a0z = -sz * 0.35;
        const a1x = sz * 0.75, a1z = -sz * 0.15;
        const a2x = sz * 0.05, a2z = sz * 0.65;
        const r = (lx, lz) => [gx + lx * c - lz * s, gy, gz + lx * s + lz * c];
        const p0 = r(a0x, a0z), p1 = r(a1x, a1z), p2 = r(a2x, a2z);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        g.computeVertexNormals();
        shardGeos.push(prepGeo(g, false));
      };

      // Shattered curtain-wall glass scatter on concourse floor right below broken window bays
      const wallZs = Array.isArray(ctx.shatteredWallZs) ? ctx.shatteredWallZs : [];
      if (!isIsland && wallZs.length > 0) {
        for (let wi = 0; wi < wallZs.length; wi++) {
          const wz = wallZs[wi];
          for (let sc = 0; sc < 10; sc++) {
            const sx = concMaxX - 0.55 - rng() * 2.35;
            const sz = wz + (rng() - 0.5) * 2.1;
            if (isInStairExclusion(sx, sz, 0.4, 0.4)) continue;
            addGlassShardTri(sx, 0.012 + (sc % 3) * 0.003, sz, 0.09 + rng() * 0.14, rng() * Math.PI * 2);
          }
        }
      }
      // Fresh broken glass near Platform 1 PSD & turnstile panic choke points
      const platGlassSpots = [
        [p1MinX + 0.65, -8.5], [p1MinX + 0.75, 4.2], [p1MinX + 0.70, 16.5],
        !isIsland ? [concMinX + 3.4, concMidZ - 2.4] : [p1MinX + 2.8, 2.2]
      ];
      for (let pi = 0; pi < platGlassSpots.length; pi++) {
        const [bx, bz] = platGlassSpots[pi];
        for (let sc = 0; sc < 11; sc++) {
          const sx = bx + (rng() - 0.5) * 1.9;
          const sz = bz + (rng() - 0.5) * 2.2;
          if (isInStairExclusion(sx, sz, 0.3, 0.3)) continue;
          addGlassShardTri(sx, 0.012 + (sc % 3) * 0.003, sz, 0.07 + rng() * 0.13, rng() * Math.PI * 2);
        }
      }
      if (shardGeos.length > 0) {
        const mergedShards = THREE_UTILS.mergeGeometries(shardGeos, false);
        for (let i = 0; i < shardGeos.length; i++) shardGeos[i].dispose();
        if (mergedShards) {
          station.disposableGeometries.push(mergedShards);
          const shardMat = new THREE.MeshPhysicalMaterial({
            color: 0xbce6f5,
            roughness: 0.06,
            metalness: 0.15,
            clearcoat: 1.0,
            clearcoatRoughness: 0.04,
            envMapIntensity: 1.85,
            transparent: true,
            opacity: 0.62,
            depthWrite: false,
            side: THREE.DoubleSide
          });
          station.disposableMaterials.push(shardMat);
          const shardMesh = new THREE.Mesh(mergedShards, shardMat);
          shardMesh.name = 'StationBrokenGlassScatter';
          shardMesh.renderOrder = 3;
          root.add(shardMesh);
        }
      }

      // Abandoned Commuter Luggage, Backpacks & Knocked-Over Suitcases (Platform 1 train side + Concourse)
      const lugGeos = [];
      const addTintedBox = (w, h, d, x, y, z, rx, ry, rz, hexCol) => {
        const g = prepGeo(new THREE.BoxGeometry(w, h, d), true);
        if (rx) g.rotateX(rx);
        if (ry) g.rotateY(ry);
        if (rz) g.rotateZ(rz);
        g.translate(x, y, z);
        _tmpColor.setHex(hexCol);
        const colAttr = g.attributes.color;
        for (let ci = 0; ci < colAttr.count; ci++) colAttr.setXYZ(ci, _tmpColor.r, _tmpColor.g, _tmpColor.b);
        colAttr.needsUpdate = true;
        lugGeos.push(g);
      };
      const addBackpack = (x, z, yaw, hexCol, fallen) => {
        const cy = fallen ? 0.12 : 0.23;
        const rx = fallen ? Math.PI * 0.48 : 0.12;
        addTintedBox(0.32, 0.44, 0.20, x, cy, z, rx, yaw, 0, hexCol);
        addTintedBox(0.24, 0.22, 0.07, x + Math.sin(yaw) * 0.12, cy - 0.03, z + Math.cos(yaw) * 0.12, rx, yaw, 0, 0x1e242b);
      };
      const addSuitcase = (x, z, yaw, hexCol) => {
        // Overturned hardshell rolling suitcase with extended handle
        addTintedBox(0.46, 0.24, 0.66, x, 0.12, z, 0, yaw, 0, hexCol);
        addTintedBox(0.03, 0.03, 0.36, x + Math.sin(yaw) * 0.46, 0.13, z + Math.cos(yaw) * 0.46, 0, yaw, 0, 0x94a3b8);
        addTintedBox(0.20, 0.035, 0.04, x + Math.sin(yaw) * 0.64, 0.13, z + Math.cos(yaw) * 0.64, 0, yaw, 0, 0x181c22);
      };

      const bagColors = [0x2a3542, 0x4b3b2e, 0x6b2626, 0x2a3d31, 0x3b3d42, 0x544432];
      const bagSpots = [
        [p1MinX + 1.15, -15.2, 0.5, false],
        [p1MinX + 1.45, -14.5, 2.1, true],
        [p1MinX + 1.25, -4.8, -0.7, true],
        [p1MinX + 2.15, 2.6, 1.3, false],
        [p1MinX + 1.30, 11.4, -1.9, true],
        [p1MinX + 1.85, 19.2, 0.8, false]
      ];
      if (!isIsland) {
        bagSpots.push(
          [concMinX + 3.8, concMidZ - 4.2, 0.6, true],
          [concMinX + 5.6, concMidZ + 1.8, -1.2, false],
          [concMaxX - 2.1, concMidZ - 6.8, 2.3, true],
          [concMaxX - 2.4, concMidZ + 7.2, -0.4, false]
        );
      }
      for (let bi = 0; bi < bagSpots.length; bi++) {
        const [bx, bz, yaw, fallen] = bagSpots[bi];
        if (isInStairExclusion(bx, bz, 0.6, 0.6)) continue;
        const col = bagColors[bi % bagColors.length];
        if (bi % 3 === 1) addSuitcase(bx, bz, yaw, col);
        else addBackpack(bx, bz, yaw, col, fallen);
      }
      // Knocked-over stainless crowd stanchions & tipped cardboard supply boxes near turnstiles & curtain wall
      if (!isIsland) {
        const sx = concMinX + 4.4, sz = concMidZ - 1.2;
        if (!isInStairExclusion(sx, sz, 0.7, 0.7)) {
          addTintedBox(0.28, 0.28, 0.04, sx, 0.14, sz, 0, 0.4, 0, 0x262b33);
          addTintedBox(0.045, 0.045, 0.88, sx + 0.36, 0.04, sz + 0.18, 0, 0.45, 0, 0x9ca3af);
        }
        const bx1 = concMaxX - 1.85, bz1 = concMidZ - 7.8;
        if (!isInStairExclusion(bx1, bz1, 0.8, 0.8)) {
          addTintedBox(0.48, 0.36, 0.42, bx1, 0.18, bz1, 0, 0.32, 0, 0x8c6844);
          addTintedBox(0.44, 0.30, 0.38, bx1 - 0.52, 0.15, bz1 + 0.42, 0.25, -0.55, 0.18, 0x7a5838);
        }
        const bx2 = concMinX + 5.2, bz2 = concMidZ + 4.6;
        if (!isInStairExclusion(bx2, bz2, 0.8, 0.8)) {
          addTintedBox(0.46, 0.34, 0.40, bx2, 0.17, bz2, 0, -0.4, 0, 0x856240);
          addTintedBox(0.28, 0.28, 0.04, bx2 + 0.65, 0.14, bz2 - 0.35, 0, 1.1, 0, 0x262b33);
          addTintedBox(0.045, 0.045, 0.86, bx2 + 0.96, 0.04, bz2 - 0.12, 0, 1.15, 0, 0x9ca3af);
        }
      }
      if (lugGeos.length > 0) {
        const mergedLug = THREE_UTILS.mergeGeometries(lugGeos, false);
        for (let i = 0; i < lugGeos.length; i++) lugGeos[i].dispose();
        if (mergedLug) {
          station.disposableGeometries.push(mergedLug);
          const lugMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: 0.76,
            metalness: 0.10
          });
          station.disposableMaterials.push(lugMat);
          const lugMesh = new THREE.Mesh(mergedLug, lugMat);
          lugMesh.name = 'StationEvacLuggage';
          lugMesh.castShadow = false;
          lugMesh.receiveShadow = true;
          root.add(lugMesh);
        }
      }

      // Scattered Evacuation Flyers, Transit Maps & Newspapers on Concourse & Platform Floor
      const paperGeos = [];
      const paperZones = [
        [p1MinX + 2.2, -12.0, 2.2, 8.0, 12],
        [p1MinX + 2.2, 8.0, 2.2, 8.0, 10]
      ];
      if (!isIsland) {
        paperZones.push(
          [concMinX + 5.2, concMidZ, 6.5, 14.0, 26],
          [concMaxX - 2.2, concMidZ - 8.5, 2.6, 5.5, 10],
          [concMaxX - 2.2, concMidZ + 8.5, 2.6, 5.5, 10]
        );
      }
      for (let zi = 0; zi < paperZones.length; zi++) {
        const [zx, zz, zw, zd, cnt] = paperZones[zi];
        for (let k = 0; k < cnt; k++) {
          const px = zx + (rng() - 0.5) * zw;
          const pz = zz + (rng() - 0.5) * zd;
          if (isInStairExclusion(px, pz, 0.3, 0.3)) continue;
          const pw = 0.18 + rng() * 0.14;
          const pd = 0.24 + rng() * 0.16;
          const g = prepGeo(new THREE.PlaneGeometry(pw, pd), false);
          g.rotateX(-Math.PI * 0.5);
          g.rotateY(rng() * Math.PI * 2);
          g.translate(px, 0.009 + (k % 3) * 0.002, pz);
          paperGeos.push(g);
        }
      }
      if (paperGeos.length > 0) {
        const mergedPapers = THREE_UTILS.mergeGeometries(paperGeos, false);
        for (let i = 0; i < paperGeos.length; i++) paperGeos[i].dispose();
        if (mergedPapers) {
          station.disposableGeometries.push(mergedPapers);
          const paperMat = new THREE.MeshStandardMaterial({
            color: 0xd8d6ce,
            roughness: 0.90,
            metalness: 0.0,
            polygonOffset: true,
            polygonOffsetFactor: -1
          });
          station.disposableMaterials.push(paperMat);
          const paperMesh = new THREE.Mesh(mergedPapers, paperMat);
          paperMesh.name = 'StationEvacPapers';
          paperMesh.receiveShadow = true;
          root.add(paperMesh);
        }
      }
    }

    // Roti'O Warm Plinth Glow
    const amberPositions = [
      [rotioX, 0.04, rotioZ + 1.15, 3.3, 0.08, 0.14]
    ];
    const amberGeo = new THREE.BoxGeometry(1, 1, 1);
    station.disposableGeometries.push(amberGeo);
    const amberInst = new THREE.InstancedMesh(amberGeo, mats.amberBeacon, amberPositions.length);
    station._amberBasePositions = amberPositions;
    for (let a = 0; a < amberPositions.length; a++) {
      const ap = amberPositions[a];
      _tmpDummy.position.set(ap[0], ap[1], ap[2]);
      _tmpDummy.rotation.set(0, 0, 0);
      _tmpDummy.scale.set(ap[3], ap[4], ap[5]);
      _tmpDummy.updateMatrix();
      amberInst.setMatrixAt(a, _tmpDummy.matrix);
    }
    amberInst.instanceMatrix.needsUpdate = true;
    root.add(amberInst);
    station._amberInst = amberInst;

    // =========================================================
    // 9. POLY HAVEN .GLTF STATION PROPS (CLEAR OF STAIRS & PSDS!)
    // =========================================================
    station._placeNormalizedModel('CashRegister_01', rotioX + 0.65, 0.99, rotioZ + 0.82, 0.1, 0.42);
    if (!isInStairExclusion(rotioX - 2.3, rotioZ + 1.8, 0.4, 0.4)) {
      station._placeNormalizedModel('WetFloorSign_01', rotioX - 2.3, 0.0, rotioZ + 1.8, 0.35, 0.64);
    }
    const wetSignZ = isIsland ? 6.5 : 12.0;
    if (!isInStairExclusion(p1MinX + 2.8, wetSignZ, 0.4, 0.4)) {
      station._placeNormalizedModel('WetFloorSign_01', p1MinX + 2.8, 0.0, wetSignZ, -0.4, 0.64);
    }
    if (!isIsland) {
      station._placeNormalizedModel('CoffeeCart_01', concMinX + 8.6, 0.0, concMidZ + 7.2, -Math.PI * 0.5, 1.80, null, 'wood');
      station._placeNormalizedModel('portable_generator', concMinX + 2.6, 0.0, concMinZ + 4.8, 0.4, 0.68, null, 'metal');
      station._placeNormalizedModel('potted_plant_02', concMaxX - 1.4, 0.0, concMidZ - 6.2, 0.0, 0.78);
      station._placeNormalizedModel('potted_plant_02', concMaxX - 1.4, 0.0, concMidZ + 6.2, 1.1, 0.78);
      station._placeNormalizedModel('planter_box_01', concMaxX + 1.2, SIDEWALK_Y, concMidZ - 6.2, Math.PI * 0.5, 0.46);
      station._placeNormalizedModel('planter_box_01', concMaxX + 1.2, SIDEWALK_Y, concMidZ + 6.2, Math.PI * 0.5, 0.46);
      station._placeNormalizedModel('mounted_fluorescent_lights', concMinX + 5.5, UPPER_FLOOR_Y - 0.34, concMidZ, Math.PI * 0.5, 0.05,
        (n) => n.name === 'mounted_fluorescent_lights_d'
      );
    } else {
      station._placeNormalizedModel('portable_generator', p1MaxX - 1.8, 0.0, -24.0, 0.5, 0.68, null, 'metal');
      station._placeNormalizedModel('potted_plant_02', p1MaxX - 2.0, 0.0, 6.0, 0.4, 0.78);
    }

    const genX = !isIsland ? (concMinX + 2.6) : (p1MaxX - 1.8);
    const genY = 0.85;
    const genZ = !isIsland ? (concMinZ + 4.8) : -24.0;
    const genUsed = station._usedIds.has('portable_generator') || station._powerRestored;
    station.interactables.push({
      id: 'portable_generator',
      type: 'generator',
      x: genX,
      y: genY,
      z: genZ,
      label: genUsed ? '[E] Generator Darurat (Aktif)' : '[E] Hidupkan Generator Darurat (Pulihkan Lampu Stasiun)',
      prompt: genUsed ? '[E] Generator Darurat (Aktif)' : '[E] Hidupkan Generator Darurat (Pulihkan Lampu Stasiun)',
      used: genUsed
    });

    station._placeNormalizedModel('ammo_box', supX + 0.85, UPPER_FLOOR_Y, supZ, 0.25, 0.26);

    // Kuningan Concourse Main Breaker Cabinet (2 Street Feeder LEDs + Master Switch)
    station._kuninganBreakerMats = null;
    if (arch.id === 'kuningan') {
      const kbX = !isIsland ? (concMinX + 4.8) : (p1MaxX - 1.8);
      const kbY = 0.0;
      const kbZ = !isIsland ? concMidZ : -14.0;
      const kbUsed = !!(station._usedIds && station._usedIds.has('kuningan_main_breaker'));
      const kbGrp = new THREE.Group();
      kbGrp.name = 'KuninganMainBreaker';
      kbGrp.position.set(kbX, kbY, kbZ);

      const kbSteelMat = new THREE.MeshStandardMaterial({ color: 0x26313f, roughness: 0.46, metalness: 0.72 });
      const kbTrimMat = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.42, metalness: 0.78 });
      const kbLeverMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35, metalness: 0.32 });
      const kbWestLed = new THREE.MeshStandardMaterial({
        color: kbUsed ? 0x22c55e : 0xef4444,
        emissive: kbUsed ? 0x22c55e : 0xef4444,
        emissiveIntensity: 1.65
      });
      const kbEastLed = new THREE.MeshStandardMaterial({
        color: kbUsed ? 0x22c55e : 0xef4444,
        emissive: kbUsed ? 0x22c55e : 0xef4444,
        emissiveIntensity: 1.65
      });
      const kbMasterLed = new THREE.MeshStandardMaterial({
        color: kbUsed ? 0x22c55e : 0xef4444,
        emissive: kbUsed ? 0x22c55e : 0xef4444,
        emissiveIntensity: 1.65
      });
      station.disposableMaterials.push(kbSteelMat, kbTrimMat, kbLeverMat, kbWestLed, kbEastLed, kbMasterLed);

      const addKb = (geo, mat, px, py, pz) => {
        station.disposableGeometries.push(geo);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        kbGrp.add(m);
        return m;
      };
      addKb(new THREE.BoxGeometry(0.84, 0.14, 0.56), kbTrimMat, 0, 0.07, 0);
      addKb(new THREE.BoxGeometry(0.76, 1.56, 0.46), kbSteelMat, 0, 0.92, 0);
      addKb(new THREE.BoxGeometry(0.82, 0.08, 0.52), kbTrimMat, 0, 1.74, 0);
      addKb(new THREE.BoxGeometry(0.24, 0.08, 0.04), kbWestLed, -0.18, 1.38, 0.24);
      addKb(new THREE.BoxGeometry(0.24, 0.08, 0.04), kbEastLed, 0.18, 1.38, 0.24);
      addKb(new THREE.BoxGeometry(0.46, 0.07, 0.04), kbMasterLed, 0, 1.54, 0.24);
      addKb(new THREE.BoxGeometry(0.08, 0.34, 0.08), kbLeverMat, 0.42, 1.12, 0.06);
      root.add(kbGrp);
      kbGrp.updateMatrixWorld(true);
      station._addCollider(kbX - 0.46, 0.0, kbZ - 0.32, kbX + 0.46, 1.80, kbZ + 0.32, 'metal');
      station._kuninganBreakerMats = { westLed: kbWestLed, eastLed: kbEastLed, masterLed: kbMasterLed };

      station.interactables.push({
        id: 'kuningan_main_breaker',
        type: 'kuningan_breaker',
        x: kbX,
        y: 1.15,
        z: kbZ + 0.35,
        used: kbUsed,
        label: kbUsed ? '[E] Panel Induk Concourse Kuningan (Aktif)' : '[E] Periksa Panel Induk Concourse Kuningan',
        prompt: kbUsed ? '[E] Panel Induk Concourse Kuningan (Aktif)' : '[E] Periksa Panel Induk Concourse Kuningan',
        targetObj: kbGrp
      });
      if (typeof station._registerHaloTarget === 'function') {
        station._registerHaloTarget('kuningan_main_breaker', kbGrp, {
          category: 'interactable', x: kbX, y: 1.15, z: kbZ, hitRadius: 0.90
        });
      }
    }

    S.loreLoot.buildFieldLogProps(station, ctx);
    S.loreLoot.buildPelicanLootboxes(station, ctx);
    S.loreLoot.buildExplosiveBarrels(station, ctx);
    station._groundPickups = [];
    station._cikokoBarricade = null;
    if (arch.id === 'cikoko' || arch.hasTollOverpass) {
      const bcX = concMaxX + 12.5;
      const bcY = S.CONST.STREET_GROUND_Y;
      const bcZ = -48.0;
      const cleared = !!(station._usedIds && station._usedIds.has('cikoko_barricade'));

      // Quarantine warning banner Canvas texture
      const bnrCvs = document.createElement('canvas');
      bnrCvs.width = 512;
      bnrCvs.height = 128;
      const bctx = bnrCvs.getContext('2d');
      bctx.fillStyle = '#18181b';
      bctx.fillRect(0, 0, 512, 128);
      for (let sx = -40; sx < 560; sx += 44) {
        bctx.fillStyle = '#eab308';
        bctx.beginPath();
        bctx.moveTo(sx, 0); bctx.lineTo(sx + 22, 0); bctx.lineTo(sx + 4, 24); bctx.lineTo(sx - 18, 24); bctx.closePath();
        bctx.fill();
        bctx.beginPath();
        bctx.moveTo(sx, 104); bctx.lineTo(sx + 22, 104); bctx.lineTo(sx + 4, 128); bctx.lineTo(sx - 18, 128); bctx.closePath();
        bctx.fill();
      }
      bctx.fillStyle = '#dc2626';
      bctx.fillRect(14, 28, 484, 72);
      bctx.fillStyle = '#ffffff';
      bctx.font = 'bold 21px sans-serif';
      bctx.textAlign = 'center';
      bctx.textBaseline = 'middle';
      bctx.fillText('ZONA KARANTINA - DILARANG MELINTAS', 256, 65);
      const bnrTex = new THREE.CanvasTexture(bnrCvs);
      bnrTex.colorSpace = THREE.SRGBColorSpace;

      const bcConcGeo = new THREE.BoxGeometry(2.15, 1.12, 0.84);
      const bcTopConcGeo = new THREE.BoxGeometry(2.05, 0.78, 0.68);
      const bcSandGeo = new THREE.BoxGeometry(0.95, 0.34, 0.56);
      const bcBeamGeo = new THREE.BoxGeometry(9.8, 0.24, 0.16);
      const bcPostGeo = new THREE.BoxGeometry(0.24, 3.35, 0.24);
      const bcSignGeo = new THREE.BoxGeometry(7.2, 0.92, 0.10);
      const bcHedgeGeo = new THREE.BoxGeometry(0.14, 1.85, 0.14);
      const bcDrumGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.92, 12);
      const bcTankGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.68, 10);
      const bcCrateGeo = new THREE.BoxGeometry(1.05, 0.52, 0.58);
      const bcGlowGeo = new THREE.BoxGeometry(0.38, 0.22, 0.24);
      const bcScorchGeo = new THREE.CircleGeometry(4.4, 20);
      bcScorchGeo.rotateX(-Math.PI * 0.5);

      const bcConcMat = new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.92, metalness: 0.08 });
      const bcSandMat = new THREE.MeshStandardMaterial({ color: 0x8a7d5c, roughness: 0.95, metalness: 0.02 });
      const bcSteelMat = new THREE.MeshStandardMaterial({ color: 0x272a30, roughness: 0.55, metalness: 0.76 });
      const bcHazMat = new THREE.MeshStandardMaterial({ color: 0xd9381e, emissive: 0x3b0f06, roughness: 0.48, metalness: 0.35 });
      const bcCrateMat = new THREE.MeshStandardMaterial({ color: 0x4b5332, roughness: 0.80, metalness: 0.15 });
      const bcSignMat = new THREE.MeshStandardMaterial({ map: bnrTex, emissive: 0x441108, emissiveMap: bnrTex, roughness: 0.45 });
      const bcGlowMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f });
      const bcScorchMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.78, depthWrite: false });

      station.disposableTextures.push(bnrTex);
      station.disposableGeometries.push(bcConcGeo, bcTopConcGeo, bcSandGeo, bcBeamGeo, bcPostGeo, bcSignGeo, bcHedgeGeo, bcDrumGeo, bcTankGeo, bcCrateGeo, bcGlowGeo, bcScorchGeo);
      station.disposableMaterials.push(bcConcMat, bcSandMat, bcSteelMat, bcHazMat, bcCrateMat, bcSignMat, bcGlowMat, bcScorchMat);

      const bcGroup = new THREE.Group();
      bcGroup.position.set(bcX, bcY, bcZ);
      bcGroup.visible = !cleared;
      const bcBatcher = createPartBatcher(station, bcGroup);
      const addBcPart = (geo, mat, x, y, z, rx, ry, rz) => bcBatcher.add(geo.clone(), mat, x, y, z, rx, ry, rz);

      // 1) Full-width 5-block lower concrete Jersey barricade wall (10.5m span) + stacked upper central bunker blocks
      for (const dx of [-4.4, -2.2, 0.0, 2.2, 4.4]) {
        addBcPart(bcConcGeo, bcConcMat, dx, 0.56, 0);
      }
      for (const dx of [-2.2, 0.0, 2.2]) {
        addBcPart(bcTopConcGeo, bcConcMat, dx, 1.50, 0);
      }
      // 2) Twin sandbag defensive wings in front of barricade flanks
      for (const sx of [-3.6, -2.6, 2.6, 3.6]) {
        for (const layer of [0, 1, 2]) {
          addBcPart(bcSandGeo, bcSandMat, sx + (layer % 2 ? 0.12 : -0.12), 0.17 + layer * 0.30, 0.66 - layer * 0.06, 0, (layer - 1) * 0.08, 0);
        }
      }
      // 3) Heavy steel Czech Hedgehog anti-vehicle spikes flanking approaches
      for (const hx of [-4.2, -1.5, 1.5, 4.2]) {
        for (const rotZ of [0.68, -0.68, 0.0]) {
          addBcPart(bcHedgeGeo, bcSteelMat, hx, 0.72, 1.18, rotZ === 0 ? 0.72 : 0.25, 0.4, rotZ);
        }
      }
      // 4) Overhead steel quarantine gantry portal + illuminated Quarantine Banner + twin strobes
      for (const px of [-4.7, 4.7]) {
        addBcPart(bcPostGeo, bcSteelMat, px, 1.67, 0);
        addBcPart(bcGlowGeo, bcGlowMat, px, 3.38, 0);
      }
      addBcPart(bcBeamGeo, bcHazMat, 0, 2.15, 0);
      addBcPart(bcSignGeo, bcSignMat, 0, 2.86, 0);

      // 5) Volatile payload cluster at center weak point: 5 fuel drums, 2 pressurized tanks, ordnance crates & C4 flasher
      for (const [dx, dz] of [[-1.05, 0.72], [-0.45, 0.92], [0.0, 0.68], [0.48, 0.92], [1.05, 0.72]]) {
        addBcPart(bcDrumGeo, bcHazMat, dx, 0.46, dz);
      }
      for (const tx of [-0.24, 0.24]) {
        addBcPart(bcTankGeo, bcGlowMat, tx, 1.24, 0.64);
      }
      for (const cx of [-0.72, 0.72]) {
        addBcPart(bcCrateGeo, bcCrateMat, cx, 0.26, 1.38, 0, cx * 0.22, 0);
      }
      addBcPart(bcGlowGeo, bcGlowMat, 0, 1.10, 0.44);
      bcBatcher.flush(false, true, 'QuarantineBarricade');
      root.add(bcGroup);

      // Charred scorched blast aftermath (hidden until breached, leaves central highway completely clear!)
      const bcAftermathGroup = new THREE.Group();
      bcAftermathGroup.position.set(bcX, bcY, bcZ);
      bcAftermathGroup.visible = cleared;
      const scorchDisk = new THREE.Mesh(bcScorchGeo, bcScorchMat);
      scorchDisk.position.set(0, 0.025, 0.4);
      bcAftermathGroup.add(scorchDisk);
      for (const [sx, sz, sry] of [[-4.8, -0.4, 0.45], [-4.4, 1.1, -0.6], [4.7, -0.3, -0.5], [4.3, 1.2, 0.7]]) {
        const rubbleBlk = new THREE.Mesh(bcTopConcGeo, bcConcMat);
        rubbleBlk.position.set(sx, 0.34, sz);
        rubbleBlk.rotation.set(0.18, sry, 0.24);
        bcAftermathGroup.add(rubbleBlk);
      }
      root.add(bcAftermathGroup);

      station._addCollider(bcX - 5.2, bcY, bcZ - 0.85, bcX + 5.2, bcY + 2.4, bcZ + 1.55, 'barricade', {
        disabled: cleared,
        blocksWalk: !cleared,
        blocksBullets: !cleared,
        barricadeId: 'cikoko_barricade'
      });
      const bcCollIdx = station.colliders.length - 1;
      const bcItem = {
        id: 'cikoko_barricade',
        type: 'barricade_breach',
        x: bcX,
        y: bcY + 1.05,
        z: bcZ + 1.45,
        used: cleared,
        label: cleared ? '[E] Barikade Jalan Tol Ditembus' : '[E / Tembak] Ledakkan Barikade Tol Cikoko',
        prompt: cleared ? '[E] Barikade Jalan Tol Ditembus' : '[E / Tembak] Ledakkan Barikade Tol Cikoko',
        targetObj: bcGroup
      };
      station.interactables.push(bcItem);
      if (typeof station._registerHaloTarget === 'function') {
        station._registerHaloTarget('cikoko_barricade', bcGroup, {
          category: 'interactable', x: bcX, y: bcY + 1.05, z: bcZ + 0.65, hitRadius: 2.2
        });
      }
      station._cikokoBarricade = {
        id: 'cikoko_barricade',
        x: bcX,
        y: bcY,
        z: bcZ,
        hp: 110,
        maxHp: 110,
        cleared: cleared,
        group: bcGroup,
        aftermathGroup: bcAftermathGroup,
        colliderIdx: bcCollIdx,
        interactItem: bcItem
      };
    }

    station._track1Barricade = null;
    if (arch.id === 'setiabudi') {
      const tbX = 0.0;
      const tbY = S.CONST.RAIL_TOP_Y;
      const tbZ = platMaxZ + 2.5;
      const tbPostGeo = new THREE.BoxGeometry(0.24, 2.35, 0.24);
      const tbBeamGeo = new THREE.BoxGeometry(3.45, 0.28, 0.20);
      const tbSignGeo = new THREE.BoxGeometry(1.75, 0.62, 0.08);
      const tbLampGeo = new THREE.SphereGeometry(0.14, 10, 8);
      const tbSteelMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.55, metalness: 0.72 });
      const tbRedMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, emissive: 0x450a0a, roughness: 0.50, metalness: 0.30 });
      const tbLampMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
      station.disposableGeometries.push(tbPostGeo, tbBeamGeo, tbSignGeo, tbLampGeo);
      station.disposableMaterials.push(tbSteelMat, tbRedMat, tbLampMat);

      const tbGroup = new THREE.Group();
      tbGroup.position.set(tbX, tbY, tbZ);
      for (const sx of [-1.55, 1.55]) {
        const post = new THREE.Mesh(tbPostGeo, tbSteelMat);
        post.position.set(sx, 1.18, 0);
        tbGroup.add(post);
        const lamp = new THREE.Mesh(tbLampGeo, tbLampMat);
        lamp.position.set(sx, 2.45, 0);
        tbGroup.add(lamp);
      }
      for (const sy of [0.85, 1.65]) {
        const beam = new THREE.Mesh(tbBeamGeo, tbRedMat);
        beam.position.set(0, sy, 0);
        tbGroup.add(beam);
      }
      const sign = new THREE.Mesh(tbSignGeo, tbRedMat);
      sign.position.set(0, 1.25, -0.14);
      tbGroup.add(sign);
      root.add(tbGroup);

      station._track1Barricade = {
        x: tbX,
        y: tbY,
        z: tbZ,
        smashed: false,
        group: tbGroup
      };
    }

    // =========================================================
    // 10. STATION POOLED POINTLIGHTS (2 PERSISTENT SCENE LIGHTS, NEVER REMOVED OR TOGGLED VIA .visible!)
    // =========================================================
    station.stationLights = [];
    const tubeInt = mood && mood.tubeIntensity !== undefined ? mood.tubeIntensity : 0.85;
    const pwr = station._powerRestored ? 1.0 : 0.22;
    const poolScene = (ctx && ctx.scene) || (window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core && window.__LRT_INTERNAL__.core.scene) || root;
    const stationOffsetZ = (station.rootGroup && station.rootGroup.position.z) || 0;
    const addPooledLight = (lx, ly, lz, colorHex, baseInt, dist, kind) => {
      const slotIdx = station.stationLights.length;
      let l = _pooledStationLights[slotIdx];
      if (!l) {
        l = new THREE.PointLight(colorHex, 0, dist, 1.35);
        l.visible = true; // NEVER toggle light.visible at runtime!
        l.castShadow = false;
        _pooledStationLights[slotIdx] = l;
      }
      l.color.setHex(colorHex);
      l.distance = dist;
      l.decay = 1.35;
      l.visible = true;
      l.position.set(lx, ly, lz + stationOffsetZ);
      l.intensity = station._isBuilding ? 0.0 : (baseInt * tubeInt * station._lightingFactor * pwr);
      if (poolScene && l.parent !== poolScene) {
        poolScene.add(l);
      }
      station.stationLights.push({
        light: l,
        baseIntensity: baseInt,
        kind: kind,
        homeX: lx,
        homeY: ly,
        homeZ: lz
      });
    };
    addPooledLight(rotioX, 2.45, rotioZ + 1.35, 0xffb45a, 7.2, 26, 'warm');
    addPooledLight(p1MinX + 2.8, 3.85, 0.0, 0xd8ecff, 6.8, 30, 'cool');

    station._warmLightAnchors = [
      { x: rotioX, y: 2.45, z: rotioZ + 1.35 },
      { x: isIsland ? (p1MinX + p1Width * 0.5) : (concMinX + cw * 0.5), y: 3.65, z: concMidZ },
      { x: jpoCX, y: 6.35, z: jpoZ }
    ];
    if (ctx.indoWarmAnchor) {
      station._warmLightAnchors.push(ctx.indoWarmAnchor);
    }
    if (lkX !== null && lkZ !== null) {
      addPooledLight(lkX - 0.15, 2.22, lkZ, 0xffd194, 4.6, 16, 'warm');
      station._warmLightAnchors.push({ x: lkX - 0.15, y: 2.22, z: lkZ });
    }
    if (jpo2Z !== null && ctx.jpo2CX !== null) {
      station._warmLightAnchors.push({ x: ctx.loungeCX !== null && ctx.loungeCX !== undefined ? ctx.loungeCX : ctx.jpo2CX, y: 6.35, z: jpo2Z });
    }

    station._coolLightAnchors = [];
    for (let t = 0; t < tubeCoords.length; t++) {
      const tc = tubeCoords[t];
      station._coolLightAnchors.push({
        x: tc.x,
        y: Math.max(2.2, tc.y - 0.55),
        z: tc.z,
        tubeIdx: t
      });
    }
    if (station._coolLightAnchors.length === 0) {
      station._coolLightAnchors.push(
        { x: p1MinX + 2.8, y: 3.85, z: -22.0, tubeIdx: -1 },
        { x: p1MinX + 2.8, y: 3.85, z: 0.0, tubeIdx: -1 },
        { x: p1MinX + 2.8, y: 3.85, z: 22.0, tubeIdx: -1 }
      );
    }

    // =========================================================
    // 11. BUILD OPEN JAKARTA CITY DISTRICT AROUND STATION
    // =========================================================
    const endApronSpans = [[p1MinX, p1MaxX]];
    if (!isIsland) endApronSpans.push([p2MinX, p2MaxX]);
    else if (isCawang) endApronSpans.push([i2MinX, i2MaxX]);

    ctx.cityBuildOpts = {
      corridorMinX: corridorMinX,
      corridorMaxX: corridorMaxX,
      platMinZ: platMinZ,
      platMaxZ: platMaxZ,
      trackXs: trackXs,
      endApronSpans: endApronSpans,
      isIsland: isIsland,
      isCawang: isCawang,
      moodKey: chosenMoodKey,
      tubeIntensity: tubeInt,
      streetLampIntensity: mood && mood.streetLampIntensity !== undefined ? mood.streetLampIntensity : (mood && mood.isDaylight ? 0.0 : 2.0),
      usedIds: station._usedIds,
      scene: (ctx && ctx.scene) || null
    };
    }

    if (doCitySync && LRT.City && typeof LRT.City.build === 'function') {
      LRT.City.build(arch, rng, root, ctx.cityBuildOpts);
    }

    if (!doFinalizeNav) return;

    if (LRT.City && typeof LRT.City.getColliders === 'function') {
      const cityCols = LRT.City.getColliders();
      for (let ci = 0; ci < cityCols.length; ci++) {
        const cc = cityCols[ci];
        station._addCollider(cc.minX, cc.minY, cc.minZ, cc.maxX, cc.maxY, cc.maxZ, cc.tag, {
          blocksWalk: cc.blocksWalk,
          blocksBullets: cc.blocksBullets,
          isFloor: cc.isFloor,
          isRamp: cc.isRamp,
          isTrackGate: !!cc.isTrackGate,
          rampAxis: cc.rampAxis,
          y0: cc.y0,
          y1: cc.y1
        });
      }
    }

    // Finalize 2m x 2m Spatial Hash Grid (indexes BOTH station & city colliders!)
    station._buildSpatialGrid();

    // =========================================================
    // 12. GENERATE ZOMBIE SPAWN NODES (STATION + CONCEALED POCKETS + CITY STREETS)
    // =========================================================
    const isNavPointClear = (nx, ny, nz) => {
      if (!station.spatialGrid) return true;
      const near = station.spatialGrid.queryPoint(nx, nz, 0.55);
      let hasFloor = false;
      const rad = 0.36;
      for (let k = 0; k < near.length; k++) {
        const c = near[k];
        if (!c || c.broken || c.disabled || c.blocksWalk === false || c.isTrigger) continue;
        const tag = c.tag || '';
        const floorLike = c.isFloor || c.isRamp || tag === 'floor' || tag === 'ramp' || tag === 'stair' || tag === 'stairs';
        if (floorLike) {
          if (nx >= c.minX - 0.15 && nx <= c.maxX + 0.15 && nz >= c.minZ - 0.15 && nz <= c.maxZ + 0.15) {
            if (c.maxY >= ny - 0.65 && c.minY <= ny + 0.55) hasFloor = true;
          }
          continue;
        }
        if (tag === 'interact') continue;
        if (c.maxY <= ny + 0.42 || c.minY >= ny + 1.55) continue;
        const cx = Math.max(c.minX, Math.min(nx, c.maxX));
        const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
        if ((nx - cx) * (nx - cx) + (nz - cz) * (nz - cz) < rad * rad) return false;
      }
      return hasFloor;
    };

    const isConcealedPocketClear = (nx, ny, nz) => {
      if (ny < UPPER_FLOOR_Y - 0.5 && isInStairExclusion(nx, nz, 0.45, 0.45)) return false;
      if (!isNavPointClear(nx, ny, nz)) return false;
      if (!station.spatialGrid) return true;
      const near = station.spatialGrid.queryPoint(nx, nz, 0.65);
      for (let k = 0; k < near.length; k++) {
        const c = near[k];
        if (!c || c.disabled) continue;
        if (c.isRamp || c.tag === 'ramp') {
          if (nx + 0.5 > c.minX && nx - 0.5 < c.maxX && nz + 0.5 > c.minZ && nz - 0.5 < c.maxZ) {
            if (c.maxY > ny + 0.05 && c.minY < ny + 1.6) return false;
          }
        }
      }
      return true;
    };

    station.spawnNodes = [];
    const candidateZones = [
      { x: p1MinX + 2.5, z: platMinZ + 8, zone: 'platform_south' },
      { x: p1MinX + 4.2, z: platMinZ + 16, zone: 'platform_south' },
      { x: p1MinX + 2.6, z: -34, zone: 'platform_south' },
      { x: p1MinX + 4.0, z: -25, zone: 'platform_south' },
      { x: p1MinX + 2.6, z: 25, zone: 'platform_north' },
      { x: p1MinX + 4.2, z: 33, zone: 'platform_north' },
      { x: p1MinX + 2.8, z: platMaxZ - 16, zone: 'platform_north' },
      { x: p1MinX + 4.1, z: platMaxZ - 8, zone: 'platform_north' },
      { x: p1MinX + 3.4, z: 14, zone: 'platform_mid' },
      { x: p1MinX + 3.4, z: -14, zone: 'platform_mid' }
    ];
    if (!isIsland) {
      candidateZones.push(
        { x: concMinX + 3.8, z: concMidZ - 11, zone: 'concourse' },
        { x: concMinX + 6.5, z: concMidZ - 5, zone: 'concourse' },
        { x: concMinX + 8.5, z: concMidZ + 6, zone: 'concourse' },
        { x: concMinX + 4.5, z: concMidZ + 11, zone: 'concourse' },
        { x: concMinX + 9.8, z: concMidZ - 11, zone: 'concourse' },
        { x: -8.6, z: jpoZ, y: UPPER_FLOOR_Y, zone: 'jpo' },
        { x: -8.6, z: 0.0, zone: 'plat2' },
        { x: concMinX + 3.5, z: concMidZ + 8, y: UPPER_FLOOR_Y, zone: 'balcony' }
      );
    } else {
      candidateZones.push(
        { x: p1MaxX - 2.2, z: -38, zone: 'island_far' },
        { x: p1MaxX - 2.2, z: -18, zone: 'island_far' },
        { x: p1MaxX - 2.2, z: 18, zone: 'island_far' },
        { x: p1MaxX - 2.2, z: 38, zone: 'island_far' },
        { x: p1MinX + 4.8, z: jpoZ, y: UPPER_FLOOR_Y, zone: 'jpo' }
      );
      if (isCawang) {
        candidateZones.push(
          { x: i2MinX + 4.5, z: -30, zone: 'island2' },
          { x: i2MinX + 4.5, z: 30, zone: 'island2' }
        );
      }
      if (arch.hasDepotShed) candidateZones.push({ x: p1MaxX + 4.5, z: 56, zone: 'depot' });
      if (arch.hasGardenTerrace) candidateZones.push({ x: track2X + 7.5, z: -34, zone: 'garden' });
    }
    if (jpo2Z !== null) candidateZones.push({ x: p1MinX + 2.8, z: jpo2Z, y: UPPER_FLOOR_Y, zone: 'jpo2' });

    // Curated Concealed Close Station Spawn Pockets (14m-32m from platform center)
    const concealedCandidates = [
      // Behind far platform pillars & under JPO blind spots
      { x: p1MaxX - 1.35, y: 0.0, z: -22.0, zone: 'concealed_station' },
      { x: p1MaxX - 1.35, y: 0.0, z: 22.0, zone: 'concealed_station' },
      { x: p1MinX + 1.85, y: 0.0, z: -28.0, zone: 'concealed_station' },
      { x: p1MinX + 1.85, y: 0.0, z: 28.0, zone: 'concealed_station' },
      { x: p1MinX + 1.65, y: 0.0, z: jpoZ, zone: 'stairwell_pocket' },
      { x: jpoCX, y: UPPER_FLOOR_Y, z: jpoZ, zone: 'stairwell_pocket' }
    ];
    if (jpo2Z !== null) {
      concealedCandidates.push(
        { x: p1MinX + 2.2, y: 0.0, z: jpo2Z, zone: 'concealed_station' },
        { x: p1MaxX - 1.5, y: 0.0, z: jpo2Z, zone: 'concealed_station' }
      );
    }
    if (!isIsland) {
      // Behind Roti'O / Indomaret service wings, concourse corners/shutters & beneath stairwell landings
      concealedCandidates.push(
        { x: rotioX + 3.0, y: 0.0, z: rotioZ + 1.2, zone: 'concourse' },
        { x: concMinX + 1.8, y: 0.0, z: rotioZ + 2.6, zone: 'concealed_station' },
        { x: indoX - 2.6, y: 0.0, z: indoZ - 2.2, zone: 'concourse' },
        { x: concMinX + 5.4, y: 0.0, z: concMaxZ - 3.25, zone: 'concealed_station' },
        { x: concMinX + 1.6, y: 0.0, z: concMaxZ - 2.2, zone: 'concealed_station' },
        { x: concMaxX - 2.6, y: 0.0, z: concMinZ + 1.4, zone: 'concourse' },
        { x: concMaxX - 4.8, y: 0.0, z: cStairFootZ, zone: 'stairwell_pocket' },
        { x: concMaxX - 4.8, y: 0.0, z: cStairTopZ, zone: 'stairwell_pocket' },
        { x: p1MinX + 1.4, y: 0.0, z: stairFootZ + (jpoZ >= 0 ? -2.2 : 2.2), zone: 'stairwell_pocket' },
        { x: (p2MinX + p2MaxX) * 0.5, y: 0.0, z: -22.0, zone: 'concealed_station' },
        { x: (p2MinX + p2MaxX) * 0.5, y: 0.0, z: 22.0, zone: 'concealed_station' },
        { x: p2MinX + 1.4, y: 0.0, z: -15.0, zone: 'concealed_station' },
        { x: p2MinX + 1.4, y: 0.0, z: 15.0, zone: 'concealed_station' }
      );
    } else {
      // Behind Roti'O / Indomaret spine & stairwell pockets on Island platforms
      concealedCandidates.push(
        { x: rotioX - 2.8, y: 0.0, z: rotioZ - 2.0, zone: 'concealed_station' },
        { x: rotioX + 2.8, y: 0.0, z: rotioZ - 2.0, zone: 'concealed_station' },
        { x: indoX - 3.0, y: 0.0, z: indoZ + 2.2, zone: 'concealed_station' },
        { x: indoX + 3.0, y: 0.0, z: indoZ + 2.2, zone: 'concealed_station' },
        { x: p1MaxX - 1.6, y: 0.0, z: -16.0, zone: 'concealed_station' },
        { x: p1MaxX - 1.6, y: 0.0, z: 16.0, zone: 'concealed_station' },
        { x: p1MinX + 2.0, y: 0.0, z: stairFootZ + (jpoZ >= 0 ? -2.2 : 2.2), zone: 'stairwell_pocket' }
      );
      if (isCawang) {
        concealedCandidates.push(
          { x: i2MaxX - 1.8, y: 0.0, z: -22.0, zone: 'concealed_station' },
          { x: i2MaxX - 1.8, y: 0.0, z: 26.0, zone: 'concealed_station' },
          { x: i2MinX + 2.0, y: 0.0, z: -18.0, zone: 'concealed_station' },
          { x: i2MinX + 2.0, y: 0.0, z: 20.0, zone: 'concealed_station' }
        );
      }
      if (arch.hasDepotShed) {
        concealedCandidates.push(
          { x: track2X + 3.6, y: 0.0, z: 38.0, zone: 'concealed_station' },
          { x: -4.0, y: 0.0, z: 40.0, zone: 'concealed_station' }
        );
      }
      if (arch.hasGardenTerrace) {
        concealedCandidates.push(
          { x: track2X + 5.2, y: 0.0, z: -28.0, zone: 'concealed_station' },
          { x: track2X + 7.2, y: 0.0, z: -22.0, zone: 'concealed_station' }
        );
      }
    }

    const jitterOffsets = [[0, 0], [0.85, 0], [-0.85, 0], [0, 0.85], [0, -0.85]];
    for (let ci = 0; ci < concealedCandidates.length; ci++) {
      const cc = concealedCandidates[ci];
      const cy = cc.y !== undefined ? cc.y : 0.0;
      for (let oi = 0; oi < jitterOffsets.length; oi++) {
        const tx = cc.x + jitterOffsets[oi][0];
        const tz = cc.z + jitterOffsets[oi][1];
        if (isConcealedPocketClear(tx, cy, tz)) {
          candidateZones.push({ x: tx, y: cy, z: tz, zone: cc.zone, _validated: true });
          break;
        }
      }
    }

    if (LRT.City && typeof LRT.City.getSpawnNodes === 'function') {
      const citySpawns = LRT.City.getSpawnNodes();
      for (let i = 0; i < citySpawns.length; i++) candidateZones.push(citySpawns[i]);
    }

    for (let i = 0; i < candidateZones.length; i++) {
      const n = candidateZones[i];
      const ny = n.y !== undefined ? n.y : 0.0;
      if (n._validated) {
        station.spawnNodes.push({ x: n.x, y: ny, z: n.z, zone: n.zone });
        continue;
      }
      const nearby = station.spatialGrid.queryPoint(n.x, n.z, 0.55);
      let blocked = false;
      for (let j = 0; j < nearby.length; j++) {
        const c = nearby[j];
        if (!c.blocksWalk || c.isFloor || c.isRamp || c.tag === 'floor' || c.tag === 'ramp') continue;
        if (c.maxY <= ny + 0.1 || c.minY >= ny + 1.8) continue;
        if (n.x + 0.45 > c.minX && n.x - 0.45 < c.maxX && n.z + 0.45 > c.minZ && n.z - 0.45 < c.maxZ) {
          blocked = true;
          break;
        }
      }
      if (!blocked) station.spawnNodes.push({ x: n.x, y: ny, z: n.z, zone: n.zone });
    }

    // =========================================================
    // 13. MULTI-LEVEL & OPEN-STREET WAYPOINT NAVGRAPH (A* READY)
    // =========================================================
    const addSafeNavNode = (x, y, z, tag, tol) => {
      if (isNavPointClear(x, y, z)) return addNavNode(x, y, z, tag, tol);
      const offsets = [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [1.4, 0], [-1.4, 0]];
      for (let oi = 0; oi < offsets.length; oi++) {
        const tx = x + offsets[oi][0], tz = z + offsets[oi][1];
        if (isNavPointClear(tx, y, tz)) return addNavNode(tx, y, tz, tag, tol);
      }
      return -1;
    };

    const p1WalkX = p1MinX + 1.02;
    for (const pz of [-60, -48, -36, -24, -18, -12, -5, 5, 12, 18, 24, 36, 48, 60]) {
      if (!isInStairExclusion(p1WalkX, pz, -0.9, -0.9)) addSafeNavNode(p1WalkX, 0.0, pz, 'platform1', 1.1);
      if (isIsland) {
        const ieX = isCawang ? (p1MaxX - 1.85) : (p1MaxX - 1.12);
        if (!isInStairExclusion(ieX, pz, -0.9, -0.9)) addSafeNavNode(ieX, 0.0, pz, 'island_east', 1.1);
        if (!isInStairExclusion(p1MinX + 4.8, pz, -0.9, -0.9)) addSafeNavNode(p1MinX + 4.8, 0.0, pz, 'island_mid', 1.2);
      } else {
        if (!isInStairExclusion(p1MaxX - 1.4, pz, -0.9, -0.9)) addSafeNavNode(p1MaxX - 1.4, 0.0, pz, 'platform1_east', 1.1);
      }
    }
    if (!isIsland) {
      for (const cz of [concMidZ - 9.0, concMidZ - 4.0, concMidZ, concMidZ + 5.0, concMidZ + 10.0]) {
        addSafeNavNode(concMinX + 5.2, 0.0, cz, 'concourse', 1.4);
        addSafeNavNode(concMaxX - 0.65, 0.0, cz, 'concourse', 1.4);
      }
      addSafeNavNode(concMaxX - 0.65, 0.0, concMidZ - 2.1, 'concourse_portal_stair', 1.4);
      addSafeNavNode(concMaxX - 0.65, 0.0, concMidZ + 2.6, 'concourse_portal_ramp', 1.4);
      addSafeNavNode(concMinX + 2.2, 0.0, concMidZ + 3.5, 'concourse_gate', 1.2);
      addSafeNavNode(concMinX + 2.2, 0.0, concMidZ - 8.5, 'concourse_gate', 1.2);
      addSafeNavNode(concMinX + 3.4, UPPER_FLOOR_Y, concMidZ, 'balcony', 1.4);
      addSafeNavNode(concMinX + 3.4, UPPER_FLOOR_Y, (concMidZ + jpoZ) * 0.5, 'balcony', 1.4);
      addSafeNavNode(concMinX + 3.4, UPPER_FLOOR_Y, jpoZ, 'balcony', 1.4);
      for (const p2z of [-60, -46, -32, -18, -6, 6, 18, 32, 46, 60]) {
        addSafeNavNode((p2MinX + p2MaxX) * 0.5, 0.0, p2z, 'platform2', 1.2);
      }
      addSafeNavNode(-9.4, UPPER_FLOOR_Y, jpoZ, 'jpo_west', 1.2);
    } else {
      for (const jx of [jpoSpanMinX + 1.8, p1MinX + 3.2, p1MaxX - 1.8, jpoSpanMaxX - 1.8]) {
        addSafeNavNode(jx, UPPER_FLOOR_Y, jpoZ, 'jpo_deck', 1.2);
      }
      if (isCawang) {
        addSafeNavNode(i2MinX + 4.5, UPPER_FLOOR_Y, jpoZ, 'jpo_cawang', 1.2);
        for (const i2z of [-60, -48, -36, -24, -12, 0, 12, 24, 36, 48, 60]) {
          addSafeNavNode(i2MinX + 4.5, 0.0, i2z, 'island2', 1.2);
        }
      }
      if (arch.hasDepotShed) {
        addSafeNavNode(-4.0, 0.0, 38, 'depot_west', 1.2);
        addSafeNavNode(-4.0, 0.0, 48, 'depot_west', 1.2);
        addSafeNavNode(-4.0, SIDEWALK_Y, 32, 'depot_plaza_west', 1.2);
        addSafeNavNode(track2X + 3.8, 0.0, 38, 'depot_east', 1.2);
        addSafeNavNode(track2X + 3.8, 0.0, 48, 'depot_east', 1.2);
        addSafeNavNode(track2X + 3.8, SIDEWALK_Y, 32, 'depot_plaza_east', 1.2);
        addSafeNavNode(depotMaxX + 2.2, SIDEWALK_Y, 43, 'depot_door_east', 1.2);
      }
      if (arch.hasGardenTerrace) {
        addSafeNavNode(track2X + 4.5, 0.0, -44, 'garden', 1.2);
        addSafeNavNode(track2X + 4.5, 0.0, -32, 'garden', 1.2);
        addSafeNavNode(track2X + 4.5, 0.0, -21, 'garden', 1.2);
        addSafeNavNode(gardenMaxX - 1.0, 0.0, -21, 'garden_door', 1.2);
        addSafeNavNode(track2X + 3.25, 0.0, -24.5, 'garden_stair_foot', 1.2);
      }
    }
    if (jpo2Z !== null) {
      addSafeNavNode(p1MinX + 3.2, UPPER_FLOOR_Y, jpo2Z, 'jpo2', 1.2);
      if (!isIsland) addSafeNavNode(-9.4, UPPER_FLOOR_Y, jpo2Z, 'jpo2_west', 1.2);
      if (isCawang) addSafeNavNode(i2MinX + 4.5, UPPER_FLOOR_Y, jpo2Z, 'jpo2_i2', 1.2);
      if (arch.hasGardenTerrace) addSafeNavNode(track2X + 3.25, UPPER_FLOOR_Y, jpo2Z, 'jpo2_garden', 1.2);
    }

    // Level Crossings (-74 / +74) & Outer/Inner Street Spine Nodes (dense <= 16m spacing!)
    const crossMidX = (corridorMinX + corridorMaxX) * 0.5;
    for (const cz of [CROSSING_Z_SOUTH, CROSSING_Z_NORTH]) {
      addNavChain([
        [corridorMinX - 18.0, SIDEWALK_Y, cz, 1.4],
        [corridorMinX - 10.5, STREET_GROUND_Y, cz, 1.4],
        [corridorMinX - 3.0, SIDEWALK_Y, cz, 1.4],
        [corridorMinX - 0.5, STREET_GROUND_Y, cz, 1.4],
        [crossMidX, STREET_GROUND_Y, cz, 1.4],
        [corridorMaxX + 0.5, STREET_GROUND_Y, cz, 1.4],
        [corridorMaxX + 3.0, SIDEWALK_Y, cz, 1.4],
        [corridorMaxX + 10.5, STREET_GROUND_Y, cz, 1.4],
        [corridorMaxX + 18.0, SIDEWALK_Y, cz, 1.4]
      ], 'crossing');
    }
    // Track-trough exit chains so any zombie down on rails always routes cleanly out to crossings
    for (let ti = 0; ti < trackXs.length; ti++) {
      const tx = trackXs[ti];
      addNavChain([
        [tx, STREET_GROUND_Y, CROSSING_Z_SOUTH, 1.4],
        [tx, TRACK_BED_Y + 0.08, -62.0, 1.4],
        [tx, TRACK_BED_Y + 0.08, -42.0, 1.4],
        [tx, TRACK_BED_Y + 0.08, -22.0, 1.4],
        [tx, TRACK_BED_Y + 0.08, 0.0, 1.4],
        [tx, TRACK_BED_Y + 0.08, 22.0, 1.4],
        [tx, TRACK_BED_Y + 0.08, 42.0, 1.4],
        [tx, TRACK_BED_Y + 0.08, 62.0, 1.4],
        [tx, STREET_GROUND_Y, CROSSING_Z_NORTH, 1.4]
      ], 'track_bed');
    }
    for (const sz of [-58, -42, -26, -12, 0, 12, 26, 42, 58]) {
      addSafeNavNode(corridorMinX - 3.2, SIDEWALK_Y, sz, 'west_prom', 1.4);
      addSafeNavNode(corridorMaxX + 3.2, SIDEWALK_Y, sz, 'east_prom', 1.4);
      addSafeNavNode(corridorMinX - 10.5, STREET_GROUND_Y, sz, 'west_blvd', 1.6);
      addSafeNavNode(corridorMaxX + 10.5, STREET_GROUND_Y, sz, 'east_blvd', 1.6);
    }
    for (let i = 0; i < station.spawnNodes.length; i++) {
      const sp = station.spawnNodes[i];
      addSafeNavNode(sp.x, sp.y, sp.z, sp.zone, 1.6);
    }

    const isNavSegWalkable = (a, b) => {
      const horiz = Math.hypot(b.x - a.x, b.z - a.z);
      if (horiz < 0.25 || horiz > 25.0) return false;
      const steps = Math.max(3, Math.ceil(horiz / 0.90));
      const rad = 0.36;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        const pz = a.z + (b.z - a.z) * t;
        const near = station.spatialGrid.queryPoint(px, pz, 0.65);
        let hasFloor = false;
        for (let k = 0; k < near.length; k++) {
          const c = near[k];
          if (!c || c.broken || c.disabled || c.blocksWalk === false || c.isTrigger) continue;
          const tag = c.tag || '';
          const floorLike = c.isFloor || c.isRamp || tag === 'floor' || tag === 'ramp' || tag === 'stair' || tag === 'stairs';
          if (floorLike) {
            if (px >= c.minX - 0.15 && px <= c.maxX + 0.15 && pz >= c.minZ - 0.15 && pz <= c.maxZ + 0.15) {
              if (c.maxY >= py - 0.60 && c.minY <= py + 0.50) hasFloor = true;
            }
            continue;
          }
          if (tag === 'interact') continue;
          if (c.maxY <= py + 0.42 || c.minY >= py + 1.55) continue;
          const cx = Math.max(c.minX, Math.min(px, c.maxX));
          const cz = Math.max(c.minZ, Math.min(pz, c.maxZ));
          const dx = px - cx, dz = pz - cz;
          if (dx * dx + dz * dz < rad * rad) return false;
        }
        if (!hasFloor) return false;
      }
      return true;
    };

    const nCount = navNodes.length;
    const adj = new Array(nCount);
    for (let i = 0; i < nCount; i++) adj[i] = [];
    const addAdjBidir = (aId, bId, cost) => {
      if (!adj[aId].some((e) => e.to === bId)) adj[aId].push({ to: bId, cost });
      if (!adj[bId].some((e) => e.to === aId)) adj[bId].push({ to: aId, cost });
    };
    for (let i = 0; i < navEdges.length; i++) {
      const e = navEdges[i];
      addAdjBidir(e.a, e.b, e.cost);
    }
    for (let i = 0; i < nCount; i++) {
      const na = navNodes[i];
      for (let j = i + 1; j < nCount; j++) {
        const nb = navNodes[j];
        if (Math.abs(na.y - nb.y) > 0.45) continue;
        const dist = Math.hypot(nb.x - na.x, nb.z - na.z);
        if (dist < 0.35 || dist > 24.0) continue;
        if (isNavSegWalkable(na, nb)) {
          addAdjBidir(i, j, Math.hypot(nb.x - na.x, (nb.y - na.y) * 1.4, nb.z - na.z));
        }
      }
    }
    station.navGraph = { nodes: navNodes, adj: adj };

    root.updateMatrixWorld(true);
    station.destructibles = {
      glassPanes: station.glassPanes,
      pillars: station.pillars,
      tubes: station.tubes,
      dynamicProps: station.dynamicProps
    };
    station._drawCallsEst = 12 + station.pillars.length + 18;
  }

  S.navProps = {
    buildStallsAndTubes: buildStallsAndTubes,
    buildDestructiblesAndNav: buildDestructiblesAndNav
  };
})(window.LRT = window.LRT || {});
