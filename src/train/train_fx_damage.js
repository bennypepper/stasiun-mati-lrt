(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const T = I.train;

  const C = T.C;
  const TD = T.TD;
  const DOOR_WORLDS_Z = T.DOOR_WORLDS_Z;
  const CRUISE_SPEED = T.CRUISE_SPEED;
  const MAX_DENT = T.MAX_DENT;
  const CHUNK_LEN = T.CHUNK_LEN;
  const CHUNK_COUNT = T.CHUNK_COUNT;
  const CABIN_LIGHT_Z = T.CABIN_LIGHT_Z;

  const _v1 = T._v1;
  const _v2 = T._v2;
  const _v3 = T._v3;
  const _m4 = T._m4;
  const _q1 = T._q1;
  const _e1 = T._e1;
  const _s1 = T._s1;
  const _localRayOrigin = T._localRayOrigin;
  const _localRayDir = T._localRayDir;
  const _invMat = T._invMat;
  const _box = T._box;
  const _ray = T._ray;
  const _hitPt = T._hitPt;

  const dentHulls = T.dentHulls;
  const dentSeats = T.dentSeats;
  const glassPanes = T.glassPanes;
  const lcdScreens = T.lcdScreens;
  const handStraps = T.handStraps;
  const ceilingTubes = T.ceilingTubes;
  const scorchDecals = T.scorchDecals;
  const cabinLights = T.cabinLights;
  const viaductChunks = T.viaductChunks;
  const raycastLocalBoxes = T.raycastLocalBoxes;
  const stats = T.stats;

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

    T.viaductGroup = new THREE.Group();
    T.viaductGroup.visible = false;
    viaductChunks.length = 0;

    // Continuous track bed & running rails directly under train during station handoff (z = -34..+34, never hits station buildings)
    const handoffB = T.createMeshBuilder(false);
    handoffB.addBox(0, (trackBedY - 0.12 + (railTopY - 0.06)) * 0.5, 0, 5.4, (railTopY - 0.06) - (trackBedY - 0.12), 68.0, [0, 0, 1.2, 14], 15);
    const handoffMesh = new THREE.Mesh(handoffB.toGeometry(false), mats.concreteRough);
    handoffMesh.receiveShadow = true;
    T.viaductGroup.add(handoffMesh);

    const handoffRailB = T.createMeshBuilder(false);
    handoffRailB.addBox(-TD.trackGauge * 0.5, railTopY - 0.045, 0, 0.075, 0.09, 68.0, [0, 0, 1, 12], 20);
    handoffRailB.addBox(TD.trackGauge * 0.5, railTopY - 0.045, 0, 0.075, 0.09, 68.0, [0, 0, 1, 12], 20);
    const handoffRailMesh = new THREE.Mesh(handoffRailB.toGeometry(false), mats.steelDarkMat);
    T.viaductGroup.add(handoffRailMesh);

    for (let c = 0; c < CHUNK_COUNT; c++) {
      const chunk = new THREE.Group();
      const ballastB = T.createMeshBuilder(false);
      const sidewalkB = T.createMeshBuilder(false);
      const railSteelB = T.createMeshBuilder(false);
      const tieB = T.createMeshBuilder(false);
      const beaconB = T.createMeshBuilder(false);
      const roadMarkB = T.createMeshBuilder(false);

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
        T.pushMatGeom(treeGeoms, new THREE.IcosahedronGeometry(1.75, 1), tx, sidewalkY + 3.4, tz, 0, ti * 0.9, 0, 'YXZ');
        T.pushMatGeom(treeGeoms, new THREE.IcosahedronGeometry(1.25, 1), tx + 0.7, sidewalkY + 2.9, tz + 0.5, 0, ti * 0.4, 0, 'YXZ');
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
      const treeMesh = new THREE.Mesh(T.mergeStaticGeoms(treeGeoms), mats.foliageTree);

      chunk.add(ballastMesh, sidewalkMesh, railPoleMesh, tieMesh, roadMarkMesh, lightsMesh, treeMesh);

      if (facadeModernGeoms.length) {
        const m = new THREE.Mesh(T.mergeStaticGeoms(facadeModernGeoms), mats.facadeModern);
        m.castShadow = true;
        m.receiveShadow = true;
        chunk.add(m);
      }
      if (facadePlasterGeoms.length) {
        const m = new THREE.Mesh(T.mergeStaticGeoms(facadePlasterGeoms), mats.facadePlaster);
        m.castShadow = true;
        m.receiveShadow = true;
        chunk.add(m);
      }
      if (brickGeoms.length) {
        const m = new THREE.Mesh(T.mergeStaticGeoms(brickGeoms), mats.brickWall);
        m.castShadow = true;
        m.receiveShadow = true;
        chunk.add(m);
      }
      if (glassBldgGeoms.length) {
        const m = new THREE.Mesh(T.mergeStaticGeoms(glassBldgGeoms), mats.glassBuilding);
        m.castShadow = true;
        m.receiveShadow = true;
        chunk.add(m);
      }
      if (roofTerraGeoms.length) {
        chunk.add(new THREE.Mesh(T.mergeStaticGeoms(roofTerraGeoms), mats.roofTerracotta));
      }
      if (roofOchreGeoms.length) {
        chunk.add(new THREE.Mesh(T.mergeStaticGeoms(roofOchreGeoms), mats.roofOchre));
      }

      chunk.userData = {
        girderMesh: ballastMesh,
        railPoleMesh,
        roadMesh: westRoadMesh,
        treeMesh
      };
      chunk.position.set(0, 0, (c - (CHUNK_COUNT * 0.5 - 0.5)) * CHUNK_LEN);
      T.viaductGroup.add(chunk);
      viaductChunks.push(chunk);
    }

    return T.viaductGroup;
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

    if (pane.kind === 'side_glass' && T.sideGlassInst) {
      _m4.makeScale(0, 0, 0);
      T.sideGlassInst.setMatrixAt(pane.instIdx, _m4);
      T.sideGlassInst.instanceMatrix.needsUpdate = true;
    } else if (pane.kind === 'cab_glass' && T.cabGlassInst) {
      _m4.makeScale(0, 0, 0);
      T.cabGlassInst.setMatrixAt(pane.instIdx, _m4);
      T.cabGlassInst.instanceMatrix.needsUpdate = true;
    } else if (pane.kind === 'door_glass') {
      T.updateDoorTransforms();
    } else if (pane.kind === 'mesh_glass' && pane.mesh) {
      pane.mesh.visible = false;
    }

    // World center of shattered pane
    pane.localBox.getCenter(_v1);
    if (T.trainVisualRoot) T.trainVisualRoot.localToWorld(_v1);

    T.safeAudioPlay('glass_shatter', { pos: hitWorldPos || _v1, pitchVar: 0.14 });
    let shardsSpawned = false;
    if (LRT.Weapons && typeof LRT.Weapons.spawnGlassShards === 'function') {
      const inheritVel = _v2.set(0, 0, T.speed > 0.5 ? -T.speed * 0.85 : 0);
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
    const decal = scorchDecals[T.scorchCursor % scorchDecals.length];
    T.scorchCursor++;
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
    const active = T.warmupActive || (T.state !== 'AWAY' && T.trainGroup && T.trainGroup.visible);
    if (T.headlightLight) {
      const headOn = !T._tierDisableLights && active && T.headlightIntensityTarget > 0.001;
      T.headlightLight.visible = headOn;
      T.headlightLight.position.set(T.localXToWorld(0), 1.05, T.localZToWorld(27.2));
      T.headlightLight.intensity = headOn ? T.headlightIntensityTarget : 0.0;
    }
    const atm = LRT.Station && typeof LRT.Station.getAtmosphere === 'function' ? LRT.Station.getAtmosphere() : null;
    const mBlend = (LRT.Main && typeof LRT.Main.getMoodBlendState === 'function') ? LRT.Main.getMoodBlendState() : null;
    const dayBlend = (mBlend && mBlend.active)
      ? (mBlend.daylightBlend !== undefined ? mBlend.daylightBlend : 0.0)
      : (atm && atm.mood && atm.mood.isDaylight ? 1.0 : 0.0);
    const nightMix = 1.0 - dayBlend;
    const bright = (LRT.Main && typeof LRT.Main.getBrightness === 'function') ? LRT.Main.getBrightness() : 1.0;
    const bFactor = bright <= 1.0 ? (0.28 + 0.72 * bright) : (1.0 + (bright - 1.0) * 0.35);
    const nightCabin = 0.52 * bFactor;
    const baseCabin = nightCabin + (1.85 - nightCabin) * dayBlend;

    // Resolve player or camera Z to position the single pooled cabin PointLight at the active car
    let focusZ = 0.0;
    const pState = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') ? LRT.PlayerUI.getState() : null;
    const coreCam = (window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core && window.__LRT_INTERNAL__.core.camera) || null;
    const focusPos = (pState && pState.pos) ? pState.pos : (coreCam ? coreCam.position : null);
    if (focusPos && active) {
      const lz = T.worldToLocalZ(focusPos.z);
      focusZ = Math.max(-21.0, Math.min(21.0, lz));
    } else if (CABIN_LIGHT_Z.length) {
      focusZ = CABIN_LIGHT_Z[0];
    }

    for (let i = 0; i < cabinLights.length; i++) {
      const cl = cabinLights[i];
      cl.visible = !T._tierDisableLights;
      if (T._tierDisableLights) {
        cl.intensity = 0.0;
        continue;
      }
      if (cl.distance < 20.0) cl.distance = 20.0;
      const anchorZ = cabinLights.length === 1 ? focusZ : CABIN_LIGHT_Z[i];
      cl.position.set(T.localXToWorld(0), 1.86, T.localZToWorld(anchorZ));
      if (!active) {
        cl.intensity = 0.0;
      } else if (dayBlend >= 0.999) {
        cl.intensity = baseCabin;
      } else {
        // Eerie dark-mode fluorescent blink/flicker inside train cars (strongest in middle Car 2)
        const carBand = Math.abs(anchorZ) < 8.775 ? 1 : (anchorZ < 0 ? 0 : 2);
        const s1 = Math.sin(T.animTime * (9.5 + carBand * 3.7) + carBand * 2.1);
        const s2 = Math.sin(T.animTime * 23.0 + carBand * 5.3);
        let flick = 1.0;
        if (carBand === 1) {
          const cycle = (T.animTime * 0.65 + 0.4) % 4.0;
          flick = (cycle > 2.6 && s1 > -0.15) ? 0.14 : (s2 < -0.55 ? 0.42 : 0.88);
        } else {
          flick = (s1 < -0.72 && s2 < -0.25) ? 0.28 : (0.76 + 0.24 * s1);
        }
        const blendedFlick = 1.0 + (flick - 1.0) * nightMix;
        cl.intensity = baseCabin * blendedFlick;
      }
    }
    if (nightMix > 0.02 && active && T.tubeInst && T.tubeInst.geometry && T.tubeInst.geometry.attributes.aTubeState) {
      const attr = T.tubeInst.geometry.attributes.aTubeState;
      for (let i = 0; i < ceilingTubes.length; i++) {
        const t = ceilingTubes[i];
        if (t.health <= 0.05) continue;
        const flickerGate = Math.sin(T.animTime * (7.0 + t.seed * 3.1) + i * 1.9);
        const drop = (i % 5 === 1 && flickerGate < -0.58) ? 0.12 : (i % 7 === 3 && Math.sin(T.animTime * 19.0 + i) < -0.7 ? 0.25 : 0.72);
        const blendedDrop = 1.0 + (drop - 1.0) * nightMix;
        attr.array[i * 2 + 1] = Math.min(t.health, t.baseHealth * blendedDrop);
      }
      attr.needsUpdate = true;
    } else if (nightMix <= 0.02 && T.tubeInst && T.tubeInst.geometry && T.tubeInst.geometry.attributes.aTubeState) {
      const attr = T.tubeInst.geometry.attributes.aTubeState;
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
      if (p.kind === 'side_glass' && T.sideGlassInst) {
        T.sideGlassInst.setMatrixAt(p.instIdx, p.baseMatrix);
      } else if (p.kind === 'cab_glass' && T.cabGlassInst) {
        T.cabGlassInst.setMatrixAt(p.instIdx, p.baseMatrix);
      } else if (p.kind === 'mesh_glass' && p.mesh) {
        p.mesh.visible = true;
      }
    }
    if (T.sideGlassInst) T.sideGlassInst.instanceMatrix.needsUpdate = true;
    if (T.cabGlassInst) T.cabGlassInst.instanceMatrix.needsUpdate = true;

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
    if (T.tubeInst) {
      const attr = T.tubeInst.geometry.attributes.aTubeState;
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

  function updateStrapsAndSway(dt) {
    const isMoving = T.speed > 0.2;
    if (T.trainVisualRoot) {
      if (isMoving) {
        const spFactor = Math.min(1.0, T.speed / CRUISE_SPEED);
        const targetRoll = Math.sin(T.animTime * 2.3) * 0.0065 * spFactor;
        const targetPitch = Math.sin(T.animTime * 3.7) * 0.0028 * spFactor - Math.max(-0.006, Math.min(0.006, T.accel * 0.0005));
        const clackPhase = Math.sin(T.animTime * 11.5);
        const railBob = (clackPhase > 0.92 ? -0.0055 : 0.0) * spFactor + Math.sin(T.animTime * 5.2) * 0.0025 * spFactor;

        T.trainVisualRoot.rotation.z += (targetRoll - T.trainVisualRoot.rotation.z) * Math.min(1, dt * 8);
        T.trainVisualRoot.rotation.x += (targetPitch - T.trainVisualRoot.rotation.x) * Math.min(1, dt * 8);
        T.trainVisualRoot.position.y += (railBob - T.trainVisualRoot.position.y) * Math.min(1, dt * 14);
      } else {
        T.trainVisualRoot.rotation.z *= Math.max(0, 1 - dt * 8);
        T.trainVisualRoot.rotation.x *= Math.max(0, 1 - dt * 8);
        T.trainVisualRoot.position.y *= Math.max(0, 1 - dt * 8);
      }
    }

    if (!T.strapInst) return;
    if (isMoving || Math.abs(T.accel) >= 0.01) {
      T._strapsSettled = false;
    }
    if (T._strapsSettled) return;

    const inertialX = Math.max(-0.22, Math.min(0.22, -T.accel * 0.025));
    const swayZ = isMoving ? Math.sin(T.animTime * 2.3) * 0.055 * (T.speed / CRUISE_SPEED) : 0;
    let allSettled = !isMoving && Math.abs(T.accel) < 0.01;

    for (let i = 0; i < handStraps.length; i++) {
      const st = handStraps[i];
      const targetX = st.snapped ? st.restX : inertialX + Math.sin(T.animTime * 2.1 + st.phase) * 0.03 * (T.speed / CRUISE_SPEED);
      const targetZ = st.snapped ? st.restZ : swayZ + Math.cos(T.animTime * 2.6 + st.phase) * 0.025 * (T.speed / CRUISE_SPEED);

      const k = st.snapped ? 26.0 : 18.0;
      const damp = st.snapped ? 1.45 : 3.2;

      st.velX += ((targetX - st.angX) * k - st.velX * damp) * dt;
      st.velZ += ((targetZ - st.angZ) * k - st.velZ * damp) * dt;
      st.angX += st.velX * dt;
      st.angZ += st.velZ * dt;

      // Clamp extreme angles
      st.angX = Math.max(-1.25, Math.min(1.25, st.angX));
      st.angZ = Math.max(-1.25, Math.min(1.25, st.angZ));

      if (allSettled) {
        if (Math.abs(st.angX - targetX) > 0.001 || Math.abs(st.angZ - targetZ) > 0.001 || Math.abs(st.velX) > 0.002 || Math.abs(st.velZ) > 0.002) {
          allSettled = false;
        }
      }

      _e1.set(st.angX, 0, st.angZ);
      _q1.setFromEuler(_e1);
      _m4.compose(st.basePos, _q1, _s1.set(1, 1, 1));
      T.strapInst.setMatrixAt(i, _m4);
    }
    T.strapInst.instanceMatrix.needsUpdate = true;
    if (allSettled) T._strapsSettled = true;
  }

  function updateViaductChunks(dt, stationZ) {
    if (!T.viaductGroup || !T.viaductGroup.visible) return;
    T.viaductGroup.position.set(T.activeTrackX, 0, 0);
    const scroll = T.travelDir * T.speed * dt;
    const halfSpan = CHUNK_LEN * CHUNK_COUNT * 0.5;
    for (let i = 0; i < viaductChunks.length; i++) {
      const ch = viaductChunks[i];
      if (T.state === 'DEPARTING' || T.state === 'CRUISE' || T.state === 'ARRIVING') {
        ch.position.z -= scroll;
        if (ch.position.z < -halfSpan) {
          ch.position.z += CHUNK_LEN * CHUNK_COUNT;
        } else if (ch.position.z > halfSpan) {
          ch.position.z -= CHUNK_LEN * CHUNK_COUNT;
        }
      }
      // Hide corridor chunk anywhere it could touch station + city district (district +-118m + chunk +-30m = 148m)
      const dz = stationZ !== null ? Math.abs(ch.position.z - stationZ) : 999;
      const hideDeck = !T.warmupActive && dz < 149.0;
      ch.visible = !hideDeck;
    }
  }

  // Fast local-space analytic raycast against unbroken glass, LCDs, doors, hull & interior colliders
  function raycastTrain(origin, dir, maxDist) {
    if (!T.initialized || !T.trainGroup || !T.trainGroup.visible || !origin || !dir) return null;
    const limit = maxDist || 200;

    // Transform world ray into trainVisualRoot local space
    T.trainGroup.updateMatrixWorld(true);
    _invMat.copy(T.trainVisualRoot.matrixWorld).invert();
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
      if (p.kind === 'door_glass' && p.side > 0 && T.doorOpen >= 0.65) continue;
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
      if (T.doorOpen < 0.65) testClosedDoorFrame(1, dz);
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

    const hitWorld = _localRayOrigin.clone().addScaledVector(_localRayDir, bestDist).applyMatrix4(T.trainVisualRoot.matrixWorld);
    const normWorld = bestNormal.clone().transformDirection(T.trainVisualRoot.matrixWorld).normalize();

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
    if (!T.initialized || !T.trainGroup || !T.trainGroup.visible || !worldPos) return res;

    const r = radius !== undefined ? radius : 0.4;
    const dmg = maxDmg !== undefined ? maxDmg : 30;
    const imp = impulse !== undefined ? impulse : 8;

    T.trainGroup.updateMatrixWorld(true);
    _invMat.copy(T.trainVisualRoot.matrixWorld).invert();
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
            _v1.copy(l.localPos).applyMatrix4(T.trainVisualRoot.matrixWorld);
            LRT.Weapons.spawnSparks(_v1, 12);
          }
        }
      }
    }

    // 3. Overhead Ceiling Tubes Short-Circuit / Flicker
    if (T.tubeInst && r >= 1.2) {
      const attr = T.tubeInst.geometry.attributes.aTubeState;
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

  T.buildExtrudedPolygon = buildExtrudedPolygon;
  T.pushExtrudedToBucket = pushExtrudedToBucket;
  T.makeBuildingFootprint = makeBuildingFootprint;
  T.buildViaductCruiseChunks = buildViaductCruiseChunks;
  T.distToBox = distToBox;
  T.shatterGlassPane = shatterGlassPane;
  T.dentMeshFromBlast = dentMeshFromBlast;
  T.stampTrainScorchDecal = stampTrainScorchDecal;
  T.syncTrainLights = syncTrainLights;
  T.resetDamage = resetDamage;
  T.updateStrapsAndSway = updateStrapsAndSway;
  T.updateViaductChunks = updateViaductChunks;
  T.raycastTrain = raycastTrain;
  T.applyDamage = applyDamage;
})(window.LRT = window.LRT || {});
