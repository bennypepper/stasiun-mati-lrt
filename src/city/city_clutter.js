(function () {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const P = (I.city = I.city || {});

  function placeCityFieldLogProp(city, root, id, x, y, z, ry, used) {
    if (!root) return;
    if (!city._fieldLogPropAssets) {
      const folderGeo = new THREE.BoxGeometry(0.26, 0.012, 0.33);
      const tabGeo = new THREE.BoxGeometry(0.08, 0.012, 0.032);
      const paperGeo = new THREE.BoxGeometry(0.22, 0.010, 0.29);
      const lineGeo = new THREE.BoxGeometry(0.145, 0.004, 0.012);
      const stampGeo = new THREE.BoxGeometry(0.044, 0.004, 0.026);

      const folderMat = new THREE.MeshStandardMaterial({ color: 0xd4ab6a, roughness: 0.72, metalness: 0.04 });
      const paperMat = new THREE.MeshStandardMaterial({
        color: 0xf7efd8,
        emissive: 0x3b2a10,
        emissiveIntensity: 0.24,
        roughness: 0.82,
        metalness: 0.02
      });
      const inkMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.90, metalness: 0.0 });
      const stampMat = new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        emissive: 0x450a0a,
        emissiveIntensity: 0.25,
        roughness: 0.65,
        metalness: 0.0
      });

      city.disposableGeometries.push(folderGeo, tabGeo, paperGeo, lineGeo, stampGeo);
      city.disposableMaterials.push(folderMat, paperMat, inkMat, stampMat);
      city._fieldLogPropAssets = {
        folderGeo, tabGeo, paperGeo, lineGeo, stampGeo,
        folderMat, paperMat, inkMat, stampMat
      };
    }

    const a = city._fieldLogPropAssets;
    city._fieldLogGlints = city._fieldLogGlints || [];
    city._perimeterHalos = city._perimeterHalos || [];

    const grp = new THREE.Group();
    grp.name = 'CityFieldLogProp_' + id;
    grp.position.set(x, y, z);
    if (ry) grp.rotation.y = ry;
    root.add(grp);

    const folder = new THREE.Mesh(a.folderGeo, a.folderMat);
    folder.position.set(0, 0.006, 0);
    folder.receiveShadow = true;
    grp.add(folder);

    const tab = new THREE.Mesh(a.tabGeo, a.folderMat);
    tab.position.set(0.08, 0.006, -0.175);
    grp.add(tab);

    const paper = new THREE.Mesh(a.paperGeo, a.paperMat);
    paper.position.set(0.01, 0.016, 0.012);
    paper.rotation.y = 0.14;
    grp.add(paper);

    for (let li = 0; li < 3; li++) {
      const ln = new THREE.Mesh(a.lineGeo, a.inkMat);
      ln.position.set(0.01, 0.022, -0.05 + li * 0.042);
      ln.rotation.y = 0.14;
      grp.add(ln);
    }

    const stamp = new THREE.Mesh(a.stampGeo, a.stampMat);
    stamp.position.set(0.055, 0.022, 0.095);
    stamp.rotation.y = 0.24;
    grp.add(stamp);

    // Universal perimeter silhouette halo around the folder prop (zero flat glint quads!)
    if (typeof LRT !== 'undefined' && LRT.Render && typeof LRT.Render.attachPerimeterHalo === 'function') {
      const halo = LRT.Render.attachPerimeterHalo(grp, {
        color: 0xfacc15,
        hoverColor: 0xfacc15,
        thicknessScale: 0.90,
        initialMode: used ? 'off' : 'subtle'
      });
      city._perimeterHalos.push({ id: id, halo: halo, used: !!used, x: x, y: y, z: z });
    }
  }



  function buildCornerHubsStatic(ctx) {
    const {
      city, arch, rng, root, addBox, addCylinder, addHippedRoof, addWedgeRamp,
      STREET_GROUND_Y, SIDEWALK_Y, CROSSING_Z_SOUTH, CROSSING_Z_NORTH, cMinX, cMaxX,
      westRoadCX, eastRoadCX, westInnerSwMinX, westInnerSwMaxX, westOuterSwMinX, westOuterSwMaxX,
      eastInnerSwMinX, eastInnerSwMaxX, eastOuterSwMinX, eastOuterSwMaxX, parkX,
      westColRoadMaxX, eastColRoadMinX,
      cornerHubCoords, emitSpatialLodBatches,
      bSteelDark, bTruss, bAmber, bCables, bCollHull, bInfraConcrete,
      bCornerWood, bCornerWarmBulb, bCornerGlass, bCornerRed, bCornerRoof, bCornerWhite,
      bCornerSandbag,
      lampPlacements, barrierPlacements, fencePlacements, pole1Placements, pole2Placements,
      hydrantPlacements, manholePlacements, powerBoxPlacements, trashCanPlacements, trashBagPlacements,
      seatingPlacements, planterPlacements, shrub1Placements,
      sedanPlacements, mpvAjarPlacements, angkotPlacements, busPlacements, ojolPlacements,
      gerobakPlacements, trafficSignalPlacements, ambulancePlacements, militaryTruckPlacements, palletPlacements,
      pachiraPlacements, shrub2Placements, fernPlacements, calatheaPlacements,
      monoblocChairPlacements, chalkboardPlacements, outdoorTablePlacements,
      plasticCratePlacements, militaryCratePlacements, jerrycanPlacements, fuelBarrelPlacements,
      oldTyrePlacements, cardboardBoxPlacements, handTruckPlacements, ammoBoxPlacements,
      airconPlacements, fireEscapePlacements, facadeModulePlacements, bermudaGrassPlacements, carPlacements,
      matSteelDark, matTruss, matAmber, matInvisColl, matCornerWood, matCornerDark,
      matRukoWall, matRukoTrim, matTowerGlass, matTowerFrame
} = ctx;
      const NW = cornerHubCoords.NW;
      const NE = cornerHubCoords.NE;
      const SW = cornerHubCoords.SW;
      const SE = cornerHubCoords.SE;

      // --- 1) NW CORNER: Posko Medis Darurat PMI & Ambulans ---
      {
        const cx = NW.cx;
        const tentZ = 100.8;
        // Weatherproof rubberized triage pad floor
        addBox(bSteelDark, 7.6, 0.05, 5.4, cx, SIDEWALK_Y + 0.025, tentZ);
        // Tent corner steel stanchions (colliders on posts only, open walk-in canopy)
        for (const [px, pz] of [
          [cx - 3.45, tentZ - 2.35], [cx + 3.45, tentZ - 2.35],
          [cx - 3.45, tentZ + 2.35], [cx + 3.45, tentZ + 2.35]
        ]) {
          addBox(bSteelDark, 0.12, 2.95, 0.12, px, SIDEWALK_Y + 1.475, pz);
          city._addCollider(px - 0.12, SIDEWALK_Y, pz - 0.12, px + 0.12, SIDEWALK_Y + 2.95, pz + 0.12, 'metal', { blocksBullets: false });
        }
        // White PMI canopy roof + red perimeter valance & Red Cross emblem
        addHippedRoof(bCornerWhite, cx - 3.6, tentZ - 2.5, cx + 3.6, tentZ + 2.5, SIDEWALK_Y + 2.90, 1.05, 0.35, 2.0);
        addBox(bCornerRed, 7.4, 0.24, 0.08, cx, SIDEWALK_Y + 2.82, tentZ - 2.52);
        addBox(bCornerRed, 7.4, 0.24, 0.08, cx, SIDEWALK_Y + 2.82, tentZ + 2.52);
        addBox(bCornerRed, 0.90, 0.26, 0.08, cx, SIDEWALK_Y + 3.25, tentZ - 2.56);
        addBox(bCornerRed, 0.26, 0.90, 0.08, cx, SIDEWALK_Y + 3.25, tentZ - 2.56);
        addBox(bCornerWarmBulb, 1.6, 0.08, 0.14, cx, SIDEWALK_Y + 2.86, tentZ);
        // Main medical examination table (interactive Kotak Medis PMI mesh added with perimeter halo in Stage 14)
        const medX = cx + 0.25, medZ = 101.3;
        addBox(bSteelDark, 2.1, 0.76, 0.90, medX, SIDEWALK_Y + 0.38, medZ);
        addBox(bCornerWhite, 2.2, 0.08, 0.96, medX, SIDEWALK_Y + 0.80, medZ);
        // IV drip stand beside triage table
        addCylinder(bSteelDark, 0.025, 0.03, 2.05, 6, medX + 1.35, SIDEWALK_Y + 1.025, medZ + 0.15);
        addBox(bCornerWhite, 0.14, 0.22, 0.08, medX + 1.25, SIDEWALK_Y + 1.88, medZ + 0.15);
        city._addCollider(medX - 1.12, SIDEWALK_Y, medZ - 0.50, medX + 1.12, SIDEWALK_Y + 1.05, medZ + 0.50, 'metal', { blocksBullets: false });
        addBox(bCollHull, 2.24, 1.05, 1.00, medX, SIDEWALK_Y + 0.525, medZ);
        // Folding desk holding note_nw_corner
        const deskX = cx - 2.1, deskZ = 100.9;
        addBox(bSteelDark, 0.96, 0.76, 0.64, deskX, SIDEWALK_Y + 0.38, deskZ);
        addBox(bCornerWood, 1.04, 0.06, 0.70, deskX, SIDEWALK_Y + 0.79, deskZ);
        city._addCollider(deskX - 0.54, SIDEWALK_Y, deskZ - 0.36, deskX + 0.54, SIDEWALK_Y + 0.84, deskZ + 0.36, 'wood', { blocksBullets: false });
        // Floodlight tripod mast + warm flood head
        const mastX = cx + 4.8, mastZ = 99.8;
        addCylinder(bSteelDark, 0.04, 0.06, 3.8, 6, mastX, SIDEWALK_Y + 1.9, mastZ);
        addBox(bSteelDark, 0.72, 0.28, 0.24, mastX, SIDEWALK_Y + 3.85, mastZ, 0, -0.45, 0);
        addBox(bCornerWarmBulb, 0.58, 0.18, 0.08, mastX - 0.05, SIDEWALK_Y + 3.85, mastZ - 0.10, 0, -0.45, 0);
        city._addCollider(mastX - 0.45, SIDEWALK_Y, mastZ - 0.45, mastX + 0.45, SIDEWALK_Y + 3.9, mastZ + 0.45, 'metal', { blocksBullets: false });
        // Ambulance parked on west side of NW lot facing south/collector entrance
        const ambX = cx - 5.2, ambZ = 96.5, ambRy = -0.18;
        ambulancePlacements.push({ x: ambX, y: SIDEWALK_Y, z: ambZ, ry: ambRy });
        city._addCollider(ambX - 1.32, SIDEWALK_Y, ambZ - 2.85, ambX + 1.32, SIDEWALK_Y + 2.45, ambZ + 2.85, 'metal', { blocksBullets: true });
        addBox(bCollHull, 2.35, 2.45, 5.65, ambX, SIDEWALK_Y + 1.225, ambZ, 0, ambRy, 0);
        // Surrounding PMI supply crates & seating
        plasticCratePlacements.push({ x: cx + 2.7, y: SIDEWALK_Y, z: 102.0, ry: 0.25 });
        plasticCratePlacements.push({ x: cx + 2.7, y: SIDEWALK_Y + 0.26, z: 102.0, ry: 0.42 });
        cardboardBoxPlacements.push({ x: cx - 2.9, y: SIDEWALK_Y, z: 99.2, ry: 0.15 });
        monoblocChairPlacements.push({ x: cx + 1.9, y: SIDEWALK_Y, z: 98.4, ry: -0.6 });
        barrierPlacements.push({ x: cx - 6.6, y: SIDEWALK_Y, z: 92.2, ry: 0.25 });
        city._addCollider(cx - 7.38, SIDEWALK_Y, 91.65, cx - 5.82, SIDEWALK_Y + 0.85, 92.75, 'concrete', { blocksBullets: false });
        addBox(bCollHull, 1.56, 0.85, 0.66, cx - 6.6, SIDEWALK_Y + 0.425, 92.2, 0, 0.25, 0);
      }

      // --- 2) NE CORNER: Gudang Logistik Ekspedisi & Pos Sekuriti ---
      {
        const cx = NE.cx;
        const dockY = SIDEWALK_Y + 0.62;
        const dockX0 = cx - 6.0, dockX1 = cx + 4.0, dockZ0 = 100.2, dockZ1 = 108.2;
        const dockW = dockX1 - dockX0, dockD = dockZ1 - dockZ0;
        const dockCX = (dockX0 + dockX1) * 0.5, dockCZ = (dockZ0 + dockZ1) * 0.5;
        // Raised concrete loading bay dock + BVH-walkable front ramp
        addBox(bInfraConcrete, dockW, 0.62, dockD, dockCX, SIDEWALK_Y + 0.31, dockCZ, 0, 0, 0, 3.0);
        addWedgeRamp(bInfraConcrete, cx - 5.8, 97.4, cx - 2.6, 100.2, SIDEWALK_Y, dockY, 'z', 2.0);
        addBox(bAmber, dockW - 3.6, 0.08, 0.14, cx + 0.9, dockY - 0.04, dockZ0 - 0.03);
        // Front vertical drop collider ONLY east of ramp so ramp walk-on stays smooth!
        city._addCollider(cx - 2.55, SIDEWALK_Y, dockZ0 - 0.18, dockX1, dockY - 0.06, dockZ0 + 0.18, 'concrete', { blocksBullets: false });
        // Corrugated steel warehouse canopy sheltering rear loading bay
        for (const [px, pz] of [
          [dockX0 + 0.35, dockZ0 + 0.45], [dockX1 - 0.35, dockZ0 + 0.45],
          [dockX0 + 0.35, dockZ1 - 0.45], [dockX1 - 0.35, dockZ1 - 0.45]
        ]) {
          addBox(bSteelDark, 0.18, 3.6, 0.18, px, dockY + 1.8, pz);
          city._addCollider(px - 0.16, dockY, pz - 0.16, px + 0.16, dockY + 3.6, pz + 0.16, 'metal', { blocksBullets: false });
        }
        addBox(bCornerRoof, dockW + 0.8, 0.14, dockD + 0.6, dockCX, dockY + 3.68, dockCZ, -0.06, 0, 0);
        addBox(bCornerWarmBulb, 2.2, 0.08, 0.16, dockCX, dockY + 3.55, dockCZ - 0.5);
        // Warehouse parapet walls & railing along north & east edges of dock
        addBox(bSteelDark, dockW, 0.95, 0.14, dockCX, dockY + 0.475, dockZ1 - 0.12);
        city._addCollider(dockX0, dockY, dockZ1 - 0.25, dockX1, dockY + 1.0, dockZ1 + 0.15, 'metal', { blocksBullets: false });

        // Interactive Peti Logistik Gudang Utara on dock apron + cargo pallet stacks
        const depotX = cx + 0.5, depotZ = 102.3;
        palletPlacements.push({ x: depotX, y: dockY, z: depotZ, ry: 0.08 });
        // Multi-part heavy armored Expedition Supply Chest on timber pallet
        addBox(bSteelDark, 0.96, 0.08, 0.68, depotX, dockY + 0.19, depotZ);
        addBox(bCornerRed, 0.88, 0.42, 0.60, depotX, dockY + 0.44, depotZ);
        addBox(bCornerRed, 0.92, 0.10, 0.64, depotX, dockY + 0.68, depotZ);
        // Dark-steel corner angle guards & protective lid rim bands
        for (const [cxOff, czOff] of [[-0.43, -0.29], [0.43, -0.29], [-0.43, 0.29], [0.43, 0.29]]) {
          addBox(bSteelDark, 0.09, 0.54, 0.09, depotX + cxOff, dockY + 0.46, depotZ + czOff);
        }
        addBox(bSteelDark, 0.95, 0.06, 0.67, depotX, dockY + 0.62, depotZ);
        // Side carry handles + twin front padlock clasps & amber stencil band
        addBox(bTruss, 0.05, 0.08, 0.28, depotX - 0.47, dockY + 0.45, depotZ);
        addBox(bTruss, 0.05, 0.08, 0.28, depotX + 0.47, dockY + 0.45, depotZ);
        addBox(bTruss, 0.10, 0.16, 0.05, depotX - 0.24, dockY + 0.56, depotZ - 0.32);
        addBox(bTruss, 0.10, 0.16, 0.05, depotX + 0.24, dockY + 0.56, depotZ - 0.32);
        addBox(bAmber, 0.66, 0.06, 0.04, depotX, dockY + 0.42, depotZ - 0.30);
        addBox(bAmber, 0.66, 0.05, 0.14, depotX, dockY + 0.74, depotZ);
        ammoBoxPlacements.push({ x: depotX - 0.18, y: dockY + 0.73, z: depotZ, ry: 0.14 });
        city._addCollider(depotX - 0.58, dockY, depotZ - 0.48, depotX + 0.58, dockY + 0.76, depotZ + 0.48, 'wood', { blocksBullets: false });
        addBox(bCollHull, 1.16, 0.76, 0.96, depotX, dockY + 0.38, depotZ);

        // Background palletized warehouse freight clusters (off main walkway)
        for (const [px, pz, pry] of [
          [cx - 4.4, 105.6, 0.05], [cx - 2.2, 106.0, -0.06], [cx + 2.4, 105.6, 0.12], [cx + 2.6, 102.4, -0.15]
        ]) {
          palletPlacements.push({ x: px, y: dockY, z: pz, ry: pry });
          plasticCratePlacements.push({ x: px - 0.2, y: dockY + 0.15, z: pz, ry: pry });
          cardboardBoxPlacements.push({ x: px + 0.25, y: dockY + 0.15, z: pz + 0.05, ry: pry + 0.4 });
          city._addCollider(px - 0.68, dockY, pz - 0.58, px + 0.68, dockY + 0.95, pz + 0.58, 'wood', { blocksBullets: false });
        }
        militaryCratePlacements.push({ x: cx - 4.5, y: dockY + 0.15, z: 103.5, ry: 0.1 });
        fuelBarrelPlacements.push({ x: cx - 5.4, y: SIDEWALK_Y, z: 95.8, ry: 0.5 });
        handTruckPlacements.push({ x: cx - 2.2, y: dockY, z: 102.0, ry: -0.7 });

        // Security Gatehouse Booth on east collector edge + manifest counter for note_ne_corner
        const secX = cx + 5.3, secZ = 98.4;
        addBox(bInfraConcrete, 2.4, 2.65, 2.5, secX, SIDEWALK_Y + 1.325, secZ, 0, 0, 0, 2.0);
        addBox(bCornerGlass, 2.48, 0.85, 2.0, secX, SIDEWALK_Y + 1.65, secZ);
        addBox(bCornerRoof, 2.9, 0.18, 3.0, secX, SIDEWALK_Y + 2.74, secZ);
        addBox(bCornerWarmBulb, 0.45, 0.08, 0.45, secX, SIDEWALK_Y + 2.52, secZ);
        city._addCollider(secX - 1.25, SIDEWALK_Y, secZ - 1.30, secX + 1.25, SIDEWALK_Y + 2.8, secZ + 1.30, 'concrete', { blocksBullets: true });
        addBox(bCollHull, 2.5, 2.8, 2.6, secX, SIDEWALK_Y + 1.4, secZ);
        // Manifest desk counter protruding on west booth wall holding note_ne_corner
        addBox(bCornerWood, 0.72, 0.84, 1.45, secX - 1.56, SIDEWALK_Y + 0.42, secZ);
        city._addCollider(secX - 1.94, SIDEWALK_Y, secZ - 0.74, secX - 1.20, SIDEWALK_Y + 0.86, secZ + 0.74, 'wood', { blocksBullets: false });
      }

      // --- 3) SW CORNER: Pos Sekat Militer & Konvoi Taktis ---
      {
        const cx = SW.cx;
        // Multi-course stacked sandbag defensive perimeter facing intersection (+Z shoulder)
        const sbCourses = [
          { x: cx - 0.8, z: -92.4, w: 3.4, ry: -0.10 },
          { x: cx + 2.6, z: -92.8, w: 3.4, ry: 0.12 },
          { x: cx + 4.8, z: -94.6, w: 2.6, ry: 1.22 }
        ];
        for (let si = 0; si < sbCourses.length; si++) {
          const s = sbCourses[si];
          for (let row = 0; row < 3; row++) {
            addBox(bCornerSandbag, s.w - row * 0.12, 0.27, 0.78 - row * 0.06, s.x, SIDEWALK_Y + 0.135 + row * 0.27, s.z, 0, s.ry, 0);
          }
          const cos = Math.abs(Math.cos(s.ry)), sin = Math.abs(Math.sin(s.ry));
          const hx = cos * (s.w * 0.5) + sin * 0.42;
          const hz = sin * (s.w * 0.5) + cos * 0.42;
          city._addCollider(s.x - hx, SIDEWALK_Y, s.z - hz, s.x + hx, SIDEWALK_Y + 0.86, s.z + hz, 'concrete', { blocksBullets: true });
          addBox(bCollHull, s.w, 0.86, 0.82, s.x, SIDEWALK_Y + 0.43, s.z, 0, s.ry, 0);
        }
        // Tactical olive/steel shelter canopy over SW ammo staging area
        const tentX = cx + 1.6, tentZ = -101.6;
        for (const [px, pz] of [
          [tentX - 2.4, tentZ - 1.6], [tentX + 2.4, tentZ - 1.6],
          [tentX - 2.4, tentZ + 1.6], [tentX + 2.4, tentZ + 1.6]
        ]) {
          addBox(bSteelDark, 0.10, 2.85, 0.10, px, SIDEWALK_Y + 1.425, pz);
          city._addCollider(px - 0.12, SIDEWALK_Y, pz - 0.12, px + 0.12, SIDEWALK_Y + 2.85, pz + 0.12, 'metal', { blocksBullets: false });
        }
        addBox(bSteelDark, 5.3, 0.10, 3.7, tentX, SIDEWALK_Y + 2.88, tentZ, 0.05, 0, 0);
        addBox(bCornerWarmBulb, 1.3, 0.08, 0.14, tentX, SIDEWALK_Y + 2.78, tentZ);
        // Interactive Peti Amunisi Konvoi Militer (reinforced military ordnance chest + GLTF ammo box) + operations crate
        const crateX = cx + 1.8, crateZ = -101.2;
        addBox(bCornerWood, 1.12, 0.10, 0.78, crateX, SIDEWALK_Y + 0.05, crateZ);
        addBox(bSteelDark, 1.00, 0.44, 0.68, crateX, SIDEWALK_Y + 0.32, crateZ);
        addBox(bSteelDark, 1.04, 0.11, 0.72, crateX, SIDEWALK_Y + 0.595, crateZ);
        for (const [cxOff, czOff] of [[-0.49, -0.33], [0.49, -0.33], [-0.49, 0.33], [0.49, 0.33]]) {
          addBox(bTruss, 0.08, 0.55, 0.08, crateX + cxOff, SIDEWALK_Y + 0.375, crateZ + czOff);
        }
        addBox(bTruss, 0.06, 0.08, 0.30, crateX - 0.52, SIDEWALK_Y + 0.35, crateZ);
        addBox(bTruss, 0.06, 0.08, 0.30, crateX + 0.52, SIDEWALK_Y + 0.35, crateZ);
        addBox(bTruss, 0.10, 0.16, 0.05, crateX - 0.26, SIDEWALK_Y + 0.48, crateZ + 0.36);
        addBox(bTruss, 0.10, 0.16, 0.05, crateX + 0.26, SIDEWALK_Y + 0.48, crateZ + 0.36);
        addBox(bAmber, 0.72, 0.06, 0.04, crateX, SIDEWALK_Y + 0.33, crateZ + 0.35);
        addBox(bAmber, 0.72, 0.05, 0.14, crateX, SIDEWALK_Y + 0.66, crateZ);
        ammoBoxPlacements.push({ x: crateX - 0.22, y: SIDEWALK_Y + 0.65, z: crateZ, ry: -0.22 });
        city._addCollider(crateX - 0.58, SIDEWALK_Y, crateZ - 0.42, crateX + 0.58, SIDEWALK_Y + 0.68, crateZ + 0.42, 'metal', { blocksBullets: false });
        addBox(bCollHull, 1.16, 0.68, 0.84, crateX, SIDEWALK_Y + 0.34, crateZ);

        const opX = cx - 0.4, opZ = -101.4;
        addBox(bCornerWood, 0.88, 0.70, 0.66, opX, SIDEWALK_Y + 0.35, opZ);
        ammoBoxPlacements.push({ x: opX + 0.22, y: SIDEWALK_Y + 0.70, z: opZ - 0.10, ry: 0.38 });
        city._addCollider(opX - 0.48, SIDEWALK_Y, opZ - 0.36, opX + 0.48, SIDEWALK_Y + 0.72, opZ + 0.36, 'wood', { blocksBullets: false });

        // Tactical warning amber beacon tripod near sandbag corner
        addCylinder(bSteelDark, 0.04, 0.07, 2.2, 6, cx + 4.8, SIDEWALK_Y + 1.1, -93.6);
        addBox(bAmber, 0.28, 0.30, 0.28, cx + 4.8, SIDEWALK_Y + 2.30, -93.6);

        // Tactical Military Utility Truck parked on west apron facing NE
        const trkX = cx - 4.8, trkZ = -101.0, trkRy = 0.38;
        militaryTruckPlacements.push({ x: trkX, y: SIDEWALK_Y, z: trkZ, ry: trkRy });
        city._addCollider(trkX - 1.65, SIDEWALK_Y, trkZ - 3.05, trkX + 1.65, SIDEWALK_Y + 2.65, trkZ + 3.05, 'metal', { blocksBullets: true });
        addBox(bCollHull, 2.38, 2.65, 6.10, trkX, SIDEWALK_Y + 1.325, trkZ, 0, trkRy, 0);

        // Military cargo & barrier dressing
        militaryCratePlacements.push({ x: cx + 3.4, y: SIDEWALK_Y, z: -102.2, ry: -0.25 });
        fuelBarrelPlacements.push({ x: cx - 2.3, y: SIDEWALK_Y, z: -103.5, ry: 0.6 });
        jerrycanPlacements.push({ x: cx - 1.8, y: SIDEWALK_Y, z: -102.8, ry: 1.1 });
        oldTyrePlacements.push({ x: cx + 4.9, y: SIDEWALK_Y, z: -96.5, ry: 0.4 });
        oldTyrePlacements.push({ x: cx + 4.9, y: SIDEWALK_Y + 0.165, z: -96.5, ry: 1.1 });
        barrierPlacements.push({ x: cx - 6.6, y: SIDEWALK_Y, z: -92.0, ry: -0.20 });
        city._addCollider(cx - 7.38, SIDEWALK_Y, -92.55, cx - 5.82, SIDEWALK_Y + 0.85, -91.45, 'concrete', { blocksBullets: false });
        addBox(bCollHull, 1.56, 0.85, 0.66, cx - 6.6, SIDEWALK_Y + 0.425, -92.0, 0, -0.20, 0);
      }

      // --- 4) SE CORNER: Poskamling RT/RW & Warung Kopi Malam ---
      {
        const cx = SE.cx;
        const posX = cx - 1.6, posZ = -101.8;
        const plinthY = SIDEWALK_Y + 0.30;
        // Concrete Pos Ronda raised foundation plinth & front entrance step
        addBox(bInfraConcrete, 3.8, 0.30, 3.6, posX, SIDEWALK_Y + 0.15, posZ, 0, 0, 0, 2.0);
        addBox(bInfraConcrete, 3.2, 0.15, 0.72, posX, SIDEWALK_Y + 0.075, posZ + 2.15, 0, 0, 0, 1.5);
        // 4 corner timber posts
        for (const [px, pz] of [
          [posX - 1.70, posZ - 1.60], [posX + 1.70, posZ - 1.60],
          [posX - 1.70, posZ + 1.60], [posX + 1.70, posZ + 1.60]
        ]) {
          addBox(bCornerWood, 0.15, 2.70, 0.15, px, plinthY + 1.35, pz);
          city._addCollider(px - 0.12, SIDEWALK_Y, pz - 0.12, px + 0.12, plinthY + 2.75, pz + 0.12, 'wood', { blocksBullets: false });
        }
        // Wooden half-height waist walls (back, left, right) & built-in bale-bale guard bench
        addBox(bCornerWood, 3.35, 0.90, 0.10, posX, plinthY + 0.45, posZ - 1.60);
        addBox(bCornerWood, 0.10, 0.90, 3.15, posX - 1.70, plinthY + 0.45, posZ);
        addBox(bCornerWood, 0.10, 0.90, 3.15, posX + 1.70, plinthY + 0.45, posZ);
        addBox(bCornerWood, 2.95, 0.42, 0.95, posX, plinthY + 0.21, posZ - 0.95);
        city._addCollider(posX - 1.82, SIDEWALK_Y, posZ - 1.72, posX + 1.82, plinthY + 1.0, posZ - 1.45, 'wood', { blocksBullets: false });
        city._addCollider(posX - 1.82, SIDEWALK_Y, posZ - 1.72, posX - 1.55, plinthY + 1.0, posZ + 1.68, 'wood', { blocksBullets: false });
        city._addCollider(posX + 1.55, SIDEWALK_Y, posZ - 1.72, posX + 1.82, plinthY + 1.0, posZ + 1.68, 'wood', { blocksBullets: false });
        // Pitched terracotta Genteng hipped roof
        addHippedRoof(bCornerRoof, posX - 1.9, posZ - 1.8, posX + 1.9, posZ + 1.8, plinthY + 2.70, 1.35, 0.48, 2.0);
        // Iconic Indonesian Kentongan hanging on front-right timber post
        addCylinder(bCornerWood, 0.095, 0.095, 0.68, 8, posX + 1.94, plinthY + 1.72, posZ + 1.58);
        addCylinder(bSteelDark, 0.020, 0.020, 0.34, 6, posX + 1.94, plinthY + 2.16, posZ + 1.58);
        addCylinder(bCornerWood, 0.025, 0.025, 0.38, 6, posX + 2.08, plinthY + 1.68, posZ + 1.58, 0.0, 0.0, 0.22);
        // Front Poskamling guard ledger sill holding note_se_corner
        addBox(bCornerWood, 1.15, 0.92, 0.48, posX + 0.95, SIDEWALK_Y + 0.46, posZ + 1.82);
        city._addCollider(posX + 0.34, SIDEWALK_Y, posZ + 1.54, posX + 1.56, SIDEWALK_Y + 0.95, posZ + 2.10, 'wood', { blocksBullets: false });

        // Warung Kopi Malam stall right beside Poskamling
        const warX = cx + 3.0, warZ = -101.2;
        for (const [px, pz] of [
          [warX - 1.65, warZ - 1.15], [warX + 1.65, warZ - 1.15],
          [warX - 1.65, warZ + 1.15], [warX + 1.65, warZ + 1.15]
        ]) {
          addBox(bCornerWood, 0.11, 2.55, 0.11, px, SIDEWALK_Y + 1.275, pz);
        }
        addBox(bCornerRoof, 3.9, 0.12, 2.9, warX, SIDEWALK_Y + 2.62, warZ, -0.10, 0, 0);
        // Serving counter & rear shelf
        addBox(bCornerWood, 3.4, 0.90, 0.72, warX, SIDEWALK_Y + 0.45, warZ + 1.05);
        addBox(bCornerWood, 3.2, 0.85, 0.50, warX, SIDEWALK_Y + 0.425, warZ - 0.85);
        city._addCollider(warX - 1.76, SIDEWALK_Y, warZ - 1.22, warX + 1.76, SIDEWALK_Y + 2.6, warZ + 1.42, 'wood', { blocksBullets: false });
        addBox(bCollHull, 3.5, 2.5, 2.6, warX, SIDEWALK_Y + 1.25, warZ);
        // Illuminated glass etalase display cabinet on east counter end
        addBox(bSteelDark, 0.96, 0.06, 0.48, warX + 0.85, SIDEWALK_Y + 0.93, warZ + 1.05);
        addBox(bCornerGlass, 0.92, 0.54, 0.44, warX + 0.85, SIDEWALK_Y + 1.23, warZ + 1.05);
        addBox(bCornerWarmBulb, 0.78, 0.06, 0.10, warX + 0.85, SIDEWALK_Y + 1.46, warZ + 1.05);
        // Snack jar on front counter (interactive Red/Silver Kopi Thermos added with perimeter halo in Stage 14)
        addCylinder(bCornerGlass, 0.09, 0.09, 0.24, 8, warX - 0.30, SIDEWALK_Y + 1.04, warZ + 1.08);
        // Festive warm string bulbs draped across Poskamling & Warung facade
        const strX0 = posX - 1.5, strX1 = warX + 1.6, strZ = -99.85;
        addBox(bCables, strX1 - strX0, 0.025, 0.025, (strX0 + strX1) * 0.5, SIDEWALK_Y + 2.82, strZ);
        for (let bx = strX0 + 0.35; bx <= strX1 - 0.25; bx += 0.78) {
          const tNorm = (bx - strX0) / (strX1 - strX0);
          const sagY = Math.sin(tNorm * Math.PI) * 0.22;
          addBox(bCornerWarmBulb, 0.10, 0.12, 0.10, bx, SIDEWALK_Y + 2.74 - sagY, strZ);
        }
        // Outdoor Warung Kopi bench + table + plastic crates
        seatingPlacements.push({ x: cx + 3.4, y: SIDEWALK_Y, z: -96.6, ry: Math.PI });
        city._addCollider(cx + 2.45, SIDEWALK_Y, -97.05, cx + 4.35, SIDEWALK_Y + 0.85, -96.15, 'wood', { blocksBullets: false });
        outdoorTablePlacements.push({ x: cx + 3.4, y: SIDEWALK_Y, z: -97.8, ry: 0.2 });
        monoblocChairPlacements.push({ x: cx + 4.4, y: SIDEWALK_Y, z: -98.0, ry: -1.1 });
        plasticCratePlacements.push({ x: warX + 2.1, y: SIDEWALK_Y, z: warZ + 0.4, ry: 0.3 });
      }

  }

  function buildStreetPropsAndVehicles(ctx) {
    const {
      city, arch, rng, root, addBox, addCylinder, addHippedRoof, addWedgeRamp,
      STREET_GROUND_Y, SIDEWALK_Y, CROSSING_Z_SOUTH, CROSSING_Z_NORTH, cMinX, cMaxX,
      westRoadCX, eastRoadCX, westInnerSwMinX, westInnerSwMaxX, westOuterSwMinX, westOuterSwMaxX,
      eastInnerSwMinX, eastInnerSwMaxX, eastOuterSwMinX, eastOuterSwMaxX, parkX,
      westColRoadMaxX, eastColRoadMinX,
      cornerHubCoords, emitSpatialLodBatches,
      bSteelDark, bTruss, bAmber, bCables, bCollHull, bInfraConcrete,
      bCornerWood, bCornerWarmBulb, bCornerGlass, bCornerRed, bCornerRoof, bCornerWhite,
      bCornerSandbag,
      lampPlacements, barrierPlacements, fencePlacements, pole1Placements, pole2Placements,
      hydrantPlacements, manholePlacements, powerBoxPlacements, trashCanPlacements, trashBagPlacements,
      seatingPlacements, planterPlacements, shrub1Placements,
      sedanPlacements, mpvAjarPlacements, angkotPlacements, busPlacements, ojolPlacements,
      gerobakPlacements, trafficSignalPlacements, ambulancePlacements, militaryTruckPlacements, palletPlacements,
      pachiraPlacements, shrub2Placements, fernPlacements, calatheaPlacements,
      monoblocChairPlacements, chalkboardPlacements, outdoorTablePlacements,
      plasticCratePlacements, militaryCratePlacements, jerrycanPlacements, fuelBarrelPlacements,
      oldTyrePlacements, cardboardBoxPlacements, handTruckPlacements, ammoBoxPlacements,
      airconPlacements, fireEscapePlacements, facadeModulePlacements, bermudaGrassPlacements, carPlacements,
      matSteelDark, matTruss, matAmber, matInvisColl, matCornerWood, matCornerDark,
      matRukoWall, matRukoTrim, matTowerGlass, matTowerFrame
} = ctx;
    // =========================================================
    // 7. OPTIMIZED LOW-POLY JAKARTA PROPS + 3-TIER LOD INSTANCED SCENERY
    // =========================================================
    const protoLamp = P.getStreetLampProto();
    const protosCar = city._extractModelLodProtos('covered_car', 1.65);
    const protoBarrier = P.getRoadBarrierProto();
    const protoFence = P.getWeldedWireFenceProto();
    const protoPole1 = P.getPowerPoleProto(0);
    const protoPole2 = P.getPowerPoleProto(1);
    const protoHydrant = P.getFireHydrantProto();
    const protoManhole = P.getManholeProto();
    const protoPowerBox = P.getPowerBoxProto();
    const protoTrashCan = P.getTrashCanProto();
    const protoTrashBag = P.getTrashBagProto();
    const protoBench = P.getParkBenchProto();
    const protoPlanter = P.getPlanterBoxProto();
    const protosAircon = city._extractModelLodProtos('exterior_aircon_unit', 0.82,
      (n) => n.name === 'exterior_aircon_unit'
    );
    const protosFireEscape = city._extractModelLodProtos('modular_fire_escape', 8.2,
      (n) => n.name !== 'modular_fire_escape_ladder_bottom'
    );
    const protosFacadeMod = city._extractModelLodProtos('modular_urban_apartments_facade', 4.0,
      (n) => /^(wall_door_centered_large_01|door_centered_large_01|dado_door_centered_large_01)$/.test(n.name || '')
    );
    const protoShrub1 = P.getFoliageCardProto(1.5, 0.72, 1);

    // Shadow casting pruned from minor props (lamps, poles, barriers, fences, trash, trees, etc.)
    city._emitInstancedProto(protoLamp, lampPlacements, false, false, 'StreetLamp');
    emitSpatialLodBatches(protosCar, carPlacements, 'CoveredCar', true, 0, 0, null);
    city._emitInstancedProto(protoBarrier, barrierPlacements, false, true, 'RoadBarrier');
    city._emitInstancedProto(protoFence, fencePlacements, false, true, 'WeldedWireFence');
    city._emitInstancedProto(protoPole1, pole1Placements, false, false, 'PowerPoleA');
    city._emitInstancedProto(protoPole2, pole2Placements, false, false, 'PowerPoleB');
    city._emitInstancedProto(protoHydrant, hydrantPlacements, false, true, 'FireHydrant');
    city._emitInstancedProto(protoManhole, manholePlacements, false, true, 'ManholeCover');
    city._emitInstancedProto(protoPowerBox, powerBoxPlacements, false, true, 'PowerBox');
    city._emitInstancedProto(protoTrashCan, trashCanPlacements, false, true, 'TrashCan');
    city._emitInstancedProto(protoTrashBag, trashBagPlacements, false, true, 'TrashBag');
    city._emitInstancedProto(protoBench, seatingPlacements, false, true, 'StreetBench');
    city._emitInstancedProto(protoPlanter, planterPlacements, false, true, 'PlanterBox');
    emitSpatialLodBatches(protosAircon, airconPlacements, 'AirconUnit', false, 0, 0, null);
    emitSpatialLodBatches(protosFireEscape, fireEscapePlacements, 'FireEscape', false, 0, 0, null);
    emitSpatialLodBatches(protosFacadeMod, facadeModulePlacements, 'FacadeModule', true, 0, 0, null);
    city._emitInstancedProto(protoShrub1, shrub1Placements, false, true, 'ShrubHedge');


    // Procedural Jakarta Street Vehicles & Street Dressing (cached low-draw-call merged prototypes)
    city._emitInstancedProto(P.getSedanMpvProto('sedan_closed'), sedanPlacements, false, true, 'JakartaSedan');
    city._emitInstancedProto(P.getSedanMpvProto('mpv_ajar'), mpvAjarPlacements, false, true, 'JakartaMpvAjar');
    city._emitInstancedProto(P.getAngkotProto(), angkotPlacements, false, true, 'JakartaAngkot');
    city._emitInstancedProto(P.getTransJakartaBusProto(), busPlacements, true, true, 'TransJakartaBus');
    city._emitInstancedProto(P.getOjolProto(), ojolPlacements, false, true, 'OjolMotorbike');
    city._emitInstancedProto(P.getGerobakProto(), gerobakPlacements, false, true, 'GerobakKakiLima');
    city._emitInstancedProto(P.getTrafficSignalProto(), trafficSignalPlacements, false, true, 'TrafficSignal');
    city._emitInstancedProto(P.getAmbulanceProto(), ambulancePlacements, true, true, 'CornerAmbulance');
    city._emitInstancedProto(P.getMilitaryTruckProto(), militaryTruckPlacements, true, true, 'CornerMilitaryTruck');
    city._emitInstancedProto(P.getPalletProto(), palletPlacements, false, true, 'CornerCargoPallet');

    // Register destructible/reactive environment prop anchors for ballistic & RPG impacts
    city.destructibleProps = [];
    const regDestruct = (list, kind, rad) => {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        city.destructibleProps.push({
          kind, x: list[i].x, y: (list[i].y || 0) + 0.7, z: list[i].z,
          radius: rad, hp: 100, damaged: false
        });
      }
    };
    regDestruct(sedanPlacements, 'vehicle', 2.4);
    regDestruct(ambulancePlacements, 'vehicle', 2.8);
    regDestruct(militaryTruckPlacements, 'bus', 3.4);
    regDestruct(mpvAjarPlacements, 'vehicle', 2.4);
    regDestruct(angkotPlacements, 'vehicle', 2.4);
    regDestruct(carPlacements, 'vehicle', 2.4);
    regDestruct(busPlacements, 'bus', 4.8);
    regDestruct(ojolPlacements, 'bike', 1.3);
    regDestruct(gerobakPlacements, 'wood_stall', 1.6);
    regDestruct(barrierPlacements, 'concrete', 1.4);
    regDestruct(lampPlacements, 'lamp', 1.2);

    // CoffeeCart_01 vendor cart on East Concourse outer promenade plaza (3-tier LOD instanced, always preserved)
    const protosCoffeeCart = city._extractModelLodProtos('CoffeeCart_01', 1.85);
    emitSpatialLodBatches(protosCoffeeCart, [{ x: eastInnerSwMinX + 4.4, y: SIDEWALK_Y, z: 10.5, ry: -Math.PI * 0.5 }], 'CoffeeCart', true, 0, 0, null);
    city._addCollider(eastInnerSwMinX + 3.6, SIDEWALK_Y, 9.2, eastInnerSwMinX + 5.2, SIDEWALK_Y + 1.8, 11.8, 'wood', { blocksBullets: false });

    // Alpha-masked Tropical Foliage variants (~12 tris each; zero multi-hundred-thousand-poly bloat!)
    for (let vi = 0; vi < 4; vi++) {
      city._emitInstancedProto(P.getFoliageCardProto(1.85, 2.05, vi + 1), pachiraPlacements[vi], false, true, 'Pachira_' + vi);
      city._emitInstancedProto(P.getFoliageCardProto(1.45, 1.05, vi + 5), shrub2Placements[vi], false, true, 'Shrub2_' + vi);
      city._emitInstancedProto(P.getFoliageCardProto(0.95, 0.52, vi + 9), fernPlacements[vi], false, true, 'Fern_' + vi);
      if (vi < 3) {
        city._emitInstancedProto(P.getFoliageCardProto(0.90, 0.54, vi + 13), calatheaPlacements[vi], false, true, 'Calathea_' + vi);
      }
    }

    // =========================================================
    // POPULATE SPARSE EXTERIOR ZONES WITH BLENDER-DECIMATED 3-LOD POLY HAVEN PROPS
    // =========================================================

    // 1) East Pocket Park, Gerobak Kaki Lima Seating, Ruko Arcades & West Promenade Coffee Nooks
    for (const pz of [-9.2, -3.2, 2.2]) {
      outdoorTablePlacements.push({ x: parkX + 2.2, y: SIDEWALK_Y, z: pz, ry: Math.PI * 0.5 + (rng() - 0.5) * 0.25 });
    }
    // Café Patio & Ruko Colonnade Dining Tables (East zi=1 & zi=3 + West zi=1 & zi=3)
    for (const tz of [-56, -42, 42, 56]) {
      outdoorTablePlacements.push({ x: eastOuterSwMinX + 2.75, y: SIDEWALK_Y, z: tz, ry: -Math.PI * 0.5 + (rng() - 0.5) * 0.2 });
      outdoorTablePlacements.push({ x: westOuterSwMaxX - 2.75, y: SIDEWALK_Y, z: tz + 3.0, ry: Math.PI * 0.5 + (rng() - 0.5) * 0.2 });
    }
    // Monobloc warung plastic chairs clustered beside all 3 Gerobaks and along shopfronts
    for (let gi = 0; gi < gerobakPlacements.length; gi++) {
      const gs = gerobakPlacements[gi];
      const offX = gi === 0 ? 1.85 : (gi === 1 ? -1.45 : 1.45);
      monoblocChairPlacements.push({ x: gs.x + offX, y: SIDEWALK_Y, z: gs.z - 0.85, ry: gs.ry + 0.6 });
      monoblocChairPlacements.push({ x: gs.x + offX, y: SIDEWALK_Y, z: gs.z + 0.95, ry: gs.ry + 2.2 });
      plasticCratePlacements.push({ x: gs.x + offX * 0.65, y: SIDEWALK_Y, z: gs.z - 1.55, ry: 0.2 + gi });
      plasticCratePlacements.push({ x: gs.x + offX * 0.65, y: SIDEWALK_Y + 0.25, z: gs.z - 1.55, ry: 0.35 + gi });
    }
    // Warung menu chalkboards outside Hero Ruko, CoffeeCart & Inner Ruko blocks
    chalkboardPlacements.push({ x: eastOuterSwMinX + 2.6, y: SIDEWALK_Y, z: 9.2, ry: -Math.PI * 0.65 });
    chalkboardPlacements.push({ x: eastInnerSwMinX + 4.3, y: SIDEWALK_Y, z: 8.2, ry: -Math.PI * 0.35 });
    for (const cz of [-52, -38, 38, 52]) {
      chalkboardPlacements.push({ x: eastOuterSwMinX + 2.1, y: SIDEWALK_Y, z: cz, ry: -Math.PI * 0.5 });
      chalkboardPlacements.push({ x: westOuterSwMaxX - 2.1, y: SIDEWALK_Y, z: cz - 4.0, ry: Math.PI * 0.5 });
      monoblocChairPlacements.push({ x: eastOuterSwMinX + 2.1, y: SIDEWALK_Y, z: cz + 2.2, ry: -Math.PI * 0.4 });
      monoblocChairPlacements.push({ x: westOuterSwMaxX - 2.1, y: SIDEWALK_Y, z: cz + 2.0, ry: Math.PI * 0.45 });
    }

    // 2) West Promenade & East Inner Sidewalk Evacuation Luggage, Supply Boxes & Hand Trucks (breaks up long bare sidewalks!)
    for (const wz of [-60, -48, -32, -12, 4, 14, 34, 48, 60]) {
      cardboardBoxPlacements.push({ x: westInnerSwMaxX - 1.35, y: SIDEWALK_Y, z: wz, ry: rng() * Math.PI });
      cardboardBoxPlacements.push({ x: westInnerSwMaxX - 1.85, y: SIDEWALK_Y, z: wz + 0.55, ry: rng() * Math.PI });
      plasticCratePlacements.push({ x: westInnerSwMinX + 1.4, y: SIDEWALK_Y, z: wz + 2.2, ry: rng() * 1.5 });
      if (Math.abs(wz) === 12 || Math.abs(wz) === 48) {
        handTruckPlacements.push({ x: westInnerSwMaxX - 1.5, y: SIDEWALK_Y, z: wz - 1.4, ry: Math.PI * 0.35 + wz * 0.1 });
        plasticCratePlacements.push({ x: eastInnerSwMaxX - 1.4, y: SIDEWALK_Y, z: wz + 1.1, ry: rng() * 2.0 });
      }
    }
    // Near CoffeeCart & East Inner Sidewalk utility spots
    plasticCratePlacements.push({ x: eastInnerSwMinX + 5.2, y: SIDEWALK_Y, z: 12.1, ry: 0.4 });
    plasticCratePlacements.push({ x: eastInnerSwMinX + 5.2, y: SIDEWALK_Y + 0.25, z: 12.1, ry: 0.65 });
    cardboardBoxPlacements.push({ x: eastInnerSwMinX + 4.9, y: SIDEWALK_Y, z: 12.7, ry: 0.2 });
    handTruckPlacements.push({ x: eastInnerSwMinX + 5.5, y: SIDEWALK_Y, z: 11.4, ry: -Math.PI * 0.7 });

    // 3) U-Shaped Courtyards & L-Tower Plazas + Collector Roads (evacuation supply stacks, barrels & tires)
    const courtyardHubs = [
      { x: eastColRoadMinX - 1.8, z: -108.5, ry: -Math.PI * 0.5 },
      { x: westOuterSwMaxX - 6.5, z: 48.0, ry: Math.PI * 0.5 },
      { x: eastOuterSwMinX + 5.5, z: 2.0, ry: 0.0 },
      { x: westOuterSwMaxX - 5.5, z: -98.0, ry: Math.PI * 0.25 },
      { x: eastColRoadMinX + 1.6, z: -46.0, ry: 0.0 },
      { x: westColRoadMaxX - 1.6, z: 46.0, ry: Math.PI },
    ];
    for (let hi = 0; hi < courtyardHubs.length; hi++) {
      const h = courtyardHubs[hi];
      const baseY = hi >= 4 ? STREET_GROUND_Y : SIDEWALK_Y;
      militaryCratePlacements.push({ x: h.x, y: baseY, z: h.z, ry: h.ry });
      fuelBarrelPlacements.push({ x: h.x + 1.15, y: baseY, z: h.z + 0.45, ry: rng() * 3 });
      fuelBarrelPlacements.push({ x: h.x + 1.25, y: baseY, z: h.z - 0.35, ry: rng() * 3 });
      jerrycanPlacements.push({ x: h.x - 0.85, y: baseY, z: h.z + 0.5, ry: rng() * 2 });
      oldTyrePlacements.push({ x: h.x - 1.2, y: baseY, z: h.z - 0.75, ry: rng() * 2 });
      oldTyrePlacements.push({ x: h.x - 1.2, y: baseY + 0.165, z: h.z - 0.75, ry: rng() * 2 });
      handTruckPlacements.push({ x: h.x + 0.35, y: baseY, z: h.z - 1.05, ry: h.ry + 0.8 });
    }

    // 4) TNI Patrol Car staging & Quarantine Checkpoint Roadblocks (z = ±116.5 & Level Crossings)
    militaryCratePlacements.push({ x: westRoadCX + 1.8, y: STREET_GROUND_Y, z: -47.8, ry: 0.35 });
    jerrycanPlacements.push({ x: westRoadCX + 1.45, y: STREET_GROUND_Y, z: -46.9, ry: 0.9 });
    fuelBarrelPlacements.push({ x: westRoadCX + 1.75, y: STREET_GROUND_Y, z: -44.2, ry: 0.2 });

    for (const rz of [-112.4, 112.4]) {
      for (const rx of [westRoadCX - 3.6, westRoadCX + 3.6, eastRoadCX - 3.6, eastRoadCX + 3.6]) {
        militaryCratePlacements.push({ x: rx, y: STREET_GROUND_Y, z: rz, ry: (rng() - 0.5) * 0.4 });
        fuelBarrelPlacements.push({ x: rx + (rx < 0 ? 1.1 : -1.1), y: STREET_GROUND_Y, z: rz + (rz < 0 ? 0.5 : -0.5), ry: rng() * 3 });
        jerrycanPlacements.push({ x: rx - 0.55, y: STREET_GROUND_Y, z: rz - 0.65, ry: rng() * 2 });
        oldTyrePlacements.push({ x: rx + 0.6, y: STREET_GROUND_Y, z: rz + (rz < 0 ? 1.1 : -1.1), ry: rng() * 3 });
      }
    }
    // Level crossings (z = ±74) road shoulders: warning tires & sandbag/barrel stations cleanly clear of tracks & roadway
    for (const cz of [CROSSING_Z_SOUTH, CROSSING_Z_NORTH]) {
      for (const sideX of [westInnerSwMinX + 1.4, eastInnerSwMaxX - 1.4]) {
        oldTyrePlacements.push({ x: sideX, y: SIDEWALK_Y, z: cz - 6.8, ry: rng() * 2 });
        oldTyrePlacements.push({ x: sideX, y: SIDEWALK_Y + 0.165, z: cz - 6.8, ry: rng() * 2 });
        fuelBarrelPlacements.push({ x: sideX, y: SIDEWALK_Y, z: cz + 6.8, ry: rng() * 2 });
      }
    }

    // 5) Urban Tropical Curb Grass Tufts (grass_bermuda_01) across Promenades, Pocket Park, Crossings & Alley Curbs
    for (let gz = -110; gz <= 110; gz += 7.5) {
      if (Math.abs(Math.abs(gz) - 24) < 5.2 || Math.abs(Math.abs(gz) - 74) < 6.2) continue;
      const j = (rng() - 0.5) * 2.2;
      bermudaGrassPlacements.push({ x: westInnerSwMinX + 0.55, y: SIDEWALK_Y, z: gz + j, ry: rng() * Math.PI * 2, sx: 0.72, sy: 1.5, sz: 0.72 });
      bermudaGrassPlacements.push({ x: eastInnerSwMaxX - 0.55, y: SIDEWALK_Y, z: gz - j, ry: rng() * Math.PI * 2, sx: 0.70, sy: 1.45, sz: 0.70 });
      if (Math.abs(gz) > 18) {
        bermudaGrassPlacements.push({ x: westOuterSwMaxX - 0.45, y: SIDEWALK_Y, z: gz + 1.8, ry: rng() * Math.PI * 2, sx: 0.65, sy: 1.35, sz: 0.65 });
        bermudaGrassPlacements.push({ x: eastOuterSwMinX + 0.45, y: SIDEWALK_Y, z: gz - 1.8, ry: rng() * Math.PI * 2, sx: 0.65, sy: 1.35, sz: 0.65 });
      }
    }
    for (let pz = -13.0; pz <= 5.0; pz += 3.0) {
      bermudaGrassPlacements.push({ x: parkX + (rng() - 0.5) * 2.4, y: SIDEWALK_Y, z: pz, ry: rng() * Math.PI * 2, sx: 0.80, sy: 1.7, sz: 0.80 });
    }

    // Extract Blender-optimized 3-LOD GLTF protos & emit spatial-cell LOD InstancedMeshes
    const pMonobloc = city._extractModelLodProtos('plastic_monobloc_chair_01', 0.88);
    const pTableSet = city._extractModelLodProtos('outdoor_table_chair_set_01', 0.86);
    const pChalk    = city._extractModelLodProtos('standing_chalkboard_01', 1.46);
    const pCrate2   = city._extractModelLodProtos('plastic_crate_02', 0.28);
    const pMilCrate = city._extractModelLodProtos('wooden_military_crate', 0.50);
    const pJerry    = city._extractModelLodProtos('metal_jerrycan_green', 0.48);
    const pBarrel   = city._extractModelLodProtos('barrel_03', 0.92);
    const pTyre     = city._extractModelLodProtos('old_tyre', 0.17);
    const pCardBox  = city._extractModelLodProtos('cardboard_box_01', 0.44);
    const pGrass    = city._extractModelLodProtos('grass_bermuda_01', 0.24);
    const pHandTrk  = city._extractModelLodProtos('hand_truck', 1.36);
    const pGen      = city._extractModelLodProtos('portable_generator', 0.72);
    const pMedBox   = city._extractModelLodProtos('medical_box', 0.36);
    const pAmmoBox  = city._extractModelLodProtos('ammo_box', 0.36);

    emitSpatialLodBatches(pMonobloc, monoblocChairPlacements, 'MonoblocChair', false, 0.28, 0.85, 'wood');
    emitSpatialLodBatches(pTableSet, outdoorTablePlacements, 'OutdoorTableSet', false, 0.55, 0.82, 'wood');
    emitSpatialLodBatches(pChalk, chalkboardPlacements, 'Chalkboard', false, 0.30, 1.42, 'wood');
    emitSpatialLodBatches(pCrate2, plasticCratePlacements, 'PlasticCrate', false, 0.24, 0.52, 'wood');
    emitSpatialLodBatches(pMilCrate, militaryCratePlacements, 'MilitaryCrate', false, 0.52, 0.52, 'wood');
    emitSpatialLodBatches(pJerry, jerrycanPlacements, 'Jerrycan', false, 0.18, 0.48, 'metal');
    emitSpatialLodBatches(pBarrel, fuelBarrelPlacements, 'FuelBarrel', false, 0.32, 0.92, 'metal');
    emitSpatialLodBatches(pTyre, oldTyrePlacements, 'OldTyre', false, 0.28, 0.32, 'wood');
    emitSpatialLodBatches(pCardBox, cardboardBoxPlacements, 'CardboardBox', false, 0.22, 0.44, 'wood');
    emitSpatialLodBatches(pGrass, bermudaGrassPlacements, 'BermudaGrass', false, 0, 0, null);
    emitSpatialLodBatches(pHandTrk, handTruckPlacements, 'HandTruck', false, 0.28, 1.30, 'metal');
    emitSpatialLodBatches(pGen, [
      { x: cornerHubCoords.NW.cx + 4.7, y: SIDEWALK_Y, z: 100.6, ry: -0.4 },
      { x: cornerHubCoords.SW.cx + 3.8, y: SIDEWALK_Y, z: -99.6, ry: 0.8 }
    ], 'CornerGenerator', false, 0.42, 0.72, 'metal');
    emitSpatialLodBatches(pMedBox, [
      { x: cornerHubCoords.NW.cx + 2.35, y: SIDEWALK_Y, z: 101.2, ry: 0.15 },
      { x: cornerHubCoords.NW.cx + 2.35, y: SIDEWALK_Y + 0.36, z: 101.2, ry: -0.20 },
      { x: cornerHubCoords.NW.cx - 1.4, y: SIDEWALK_Y, z: 101.6, ry: 0.45 }
    ], 'CornerMedicalBox', false, 0.28, 0.42, 'metal');
    emitSpatialLodBatches(pAmmoBox, ammoBoxPlacements, 'CornerAmmoBox', false, 0, 0, null);


  }

  function buildStreetInteractablesAndLoot(ctx) {
    const {
      city, arch, rng, root, addBox, addCylinder, addHippedRoof, addWedgeRamp,
      STREET_GROUND_Y, SIDEWALK_Y, CROSSING_Z_SOUTH, CROSSING_Z_NORTH, cMinX, cMaxX,
      westRoadCX, eastRoadCX, westInnerSwMinX, westInnerSwMaxX, westOuterSwMinX, westOuterSwMaxX,
      eastInnerSwMinX, eastInnerSwMaxX, eastOuterSwMinX, eastOuterSwMaxX, parkX,
      westColRoadMaxX, eastColRoadMinX,
      cornerHubCoords, emitSpatialLodBatches,
      bSteelDark, bTruss, bAmber, bCables, bCollHull, bInfraConcrete,
      bCornerWood, bCornerWarmBulb, bCornerGlass, bCornerRed, bCornerRoof, bCornerWhite,
      bCornerSandbag,
      lampPlacements, barrierPlacements, fencePlacements, pole1Placements, pole2Placements,
      hydrantPlacements, manholePlacements, powerBoxPlacements, trashCanPlacements, trashBagPlacements,
      seatingPlacements, planterPlacements, shrub1Placements,
      sedanPlacements, mpvAjarPlacements, angkotPlacements, busPlacements, ojolPlacements,
      gerobakPlacements, trafficSignalPlacements, ambulancePlacements, militaryTruckPlacements, palletPlacements,
      pachiraPlacements, shrub2Placements, fernPlacements, calatheaPlacements,
      monoblocChairPlacements, chalkboardPlacements, outdoorTablePlacements,
      plasticCratePlacements, militaryCratePlacements, jerrycanPlacements, fuelBarrelPlacements,
      oldTyrePlacements, cardboardBoxPlacements, handTruckPlacements, ammoBoxPlacements,
      airconPlacements, fireEscapePlacements, facadeModulePlacements, bermudaGrassPlacements, carPlacements,
      matSteelDark, matTruss, matAmber, matInvisColl, matCornerWood, matCornerDark,
      matRukoWall, matRukoTrim, matTowerGlass, matTowerFrame
} = ctx;
    // =========================================================
    // 9. STREET INTERACTABLES, TACTICAL LOOTBOXES & HYDRANT HAZARDS
    // =========================================================
    city.interactables = [];
    const usedSet = city._usedIds || new Set();

    const coffeeCartUsed = usedSet.has('city_coffee_cart');
    city.interactables.push({
      id: 'city_coffee_cart',
      type: 'street_stash',
      x: eastInnerSwMinX + 4.4,
      y: SIDEWALK_Y + 0.9,
      z: 10.5,
      label: coffeeCartUsed ? '[E] Gerobak Kopi East Promenade (Sudah Digeledah)' : '[E] Geledah Gerobak Kopi East Promenade (+Amunisi SS2 & Kopi Hangat)',
      prompt: coffeeCartUsed ? '[E] Gerobak Kopi East Promenade (Sudah Digeledah)' : '[E] Geledah Gerobak Kopi East Promenade (+Amunisi SS2 & Kopi Hangat)',
      used: coffeeCartUsed
    });
    placeCityFieldLogProp(city, root, 'city_coffee_cart', eastInnerSwMinX + 4.25, SIDEWALK_Y + 0.92, 10.25, -Math.PI * 0.5 + 0.16, coffeeCartUsed);

    const plnUsed = usedSet.has('city_pln_box') || city._plnRestored;
    const plnX = eastOuterSwMinX + 2.45;
    const plnZ = -16.2;
    // Detailed Canvas-Textured PLN Substation Distribution Cabinet (Gardu Distribusi TM/TR)
    const plnGroup = new THREE.Group();
    plnGroup.position.set(plnX, SIDEWALK_Y, plnZ);

    const plnCvs = document.createElement('canvas');
    plnCvs.width = 512;
    plnCvs.height = 512;
    const pctx = plnCvs.getContext('2d');
    pctx.fillStyle = '#364352';
    pctx.fillRect(0, 0, 512, 512);
    // Subtle weathering/grime gradient at bottom + brushed metal streaks
    const pGrad = pctx.createLinearGradient(0, 0, 0, 512);
    pGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    pGrad.addColorStop(0.7, 'rgba(0,0,0,0.0)');
    pGrad.addColorStop(1, 'rgba(20,18,14,0.45)');
    pctx.fillStyle = pGrad;
    pctx.fillRect(0, 0, 512, 512);
    // Double recessed panel door frames & center seam
    pctx.strokeStyle = '#182028';
    pctx.lineWidth = 8;
    pctx.strokeRect(24, 34, 224, 444);
    pctx.strokeRect(264, 34, 224, 444);
    pctx.strokeStyle = '#536477';
    pctx.lineWidth = 3;
    pctx.strokeRect(30, 40, 212, 432);
    pctx.strokeRect(270, 40, 212, 432);
    // Hinges & latch bolts
    pctx.fillStyle = '#111827';
    for (const hy of [90, 250, 410]) {
      pctx.fillRect(14, hy, 18, 28);
      pctx.fillRect(480, hy, 18, 28);
    }
    // Pressed cooling louver slats (top & bottom of both doors)
    for (let ly = 338; ly <= 446; ly += 16) {
      pctx.fillStyle = '#141a22';
      pctx.fillRect(48, ly, 176, 8);
      pctx.fillRect(288, ly, 176, 8);
      pctx.fillStyle = '#5b6c7f';
      pctx.fillRect(48, ly + 8, 176, 2);
      pctx.fillRect(288, ly + 8, 176, 2);
    }
    // PLN Corporate Header Plate + High Voltage 20kV Hazard Warning Plaque
    pctx.fillStyle = '#0f294a';
    pctx.fillRect(44, 54, 424, 52);
    pctx.fillStyle = '#facc15';
    pctx.fillRect(44, 102, 424, 8);
    pctx.fillStyle = '#ffffff';
    pctx.font = 'bold 24px sans-serif';
    pctx.fillText('PT PLN (PERSERO)', 62, 84);
    pctx.fillStyle = '#fde047';
    pctx.font = 'bold 14px sans-serif';
    pctx.fillText('SAKELAR PJU • JTR 20kV', 284, 83);
    // Left door: Yellow/Black Warning Triangle + Lightning Bolt
    pctx.fillStyle = '#eab308';
    pctx.fillRect(54, 134, 164, 126);
    pctx.strokeStyle = '#111827';
    pctx.lineWidth = 5;
    pctx.strokeRect(58, 138, 156, 118);
    pctx.fillStyle = '#111827';
    pctx.beginPath();
    pctx.moveTo(136, 150); pctx.lineTo(182, 224); pctx.lineTo(90, 224); pctx.closePath();
    pctx.fill();
    pctx.fillStyle = '#fde047';
    pctx.beginPath();
    pctx.moveTo(142, 168); pctx.lineTo(124, 196); pctx.lineTo(138, 196); pctx.lineTo(128, 218); pctx.lineTo(152, 190); pctx.lineTo(136, 190); pctx.closePath();
    pctx.fill();
    pctx.fillStyle = '#111827';
    pctx.font = 'bold 14px sans-serif';
    pctx.fillText('TEGANGAN TINGGI', 68, 246);
    // Right door: Analog kWh Meter Inspection Window & Dial
    pctx.fillStyle = '#0b1220';
    pctx.fillRect(294, 136, 160, 112);
    pctx.fillStyle = '#cbd5e1';
    pctx.fillRect(306, 148, 136, 86);
    pctx.fillStyle = '#0f172a';
    pctx.font = 'bold 16px monospace';
    pctx.fillText('kWh 04821.9', 318, 178);
    pctx.fillStyle = '#ef4444';
    pctx.fillRect(322, 196, 104, 14);
    pctx.fillStyle = '#1e293b';
    pctx.font = '12px sans-serif';
    pctx.fillText('PANEL RELAI UTAMA', 312, 226);

    const plnTex = new THREE.CanvasTexture(plnCvs);
    plnTex.colorSpace = THREE.SRGBColorSpace;
    const plnCabMat = new THREE.MeshStandardMaterial({ map: plnTex, roughness: 0.52, metalness: 0.58 });
    const plnPadMat = city._getMat('cityPlnPad', null, { color: 0x64748b, roughness: 0.92, metalness: 0.06 });
    const plnDarkMat = city._getMat('cityPlnBody', null, { color: 0x1e293b, roughness: 0.55, metalness: 0.72 });
    const plnHazardMat = city._getMat('cityPlnHazard', null, { color: 0xf59e0b, roughness: 0.42, metalness: 0.28 });
    const plnBeaconMat = new THREE.MeshStandardMaterial({
      color: plnUsed ? 0x22c55e : 0xef4444,
      emissive: plnUsed ? 0x22c55e : 0xef4444,
      emissiveIntensity: 1.4,
      roughness: 0.25
    });

    const plnPadGeo = new THREE.BoxGeometry(1.00, 0.24, 1.48);
    const plnFlangeGeo = new THREE.BoxGeometry(0.76, 0.08, 1.26);
    const plnBodyGeo = new THREE.BoxGeometry(0.68, 1.56, 1.20);
    const plnRoofGeo = new THREE.BoxGeometry(0.80, 0.10, 1.32);
    const plnConduitGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.42, 8);
    const plnFinGeo = new THREE.BoxGeometry(0.56, 1.18, 0.04);
    const plnLeverArmGeo = new THREE.BoxGeometry(0.08, 0.32, 0.08);
    const plnLeverGripGeo = new THREE.BoxGeometry(0.14, 0.08, 0.16);
    const plnLatchGeo = new THREE.BoxGeometry(0.04, 0.22, 0.10);
    const plnBeaconGeo = new THREE.BoxGeometry(0.16, 0.14, 0.28);
    city.disposableTextures.push(plnTex);
    city.disposableGeometries.push(plnPadGeo, plnFlangeGeo, plnBodyGeo, plnRoofGeo, plnConduitGeo, plnFinGeo, plnLeverArmGeo, plnLeverGripGeo, plnLatchGeo, plnBeaconGeo);
    city.disposableMaterials.push(plnCabMat, plnBeaconMat);
    city._plnBeaconMat = plnBeaconMat;

    const plnPadM = new THREE.Mesh(plnPadGeo, plnPadMat); plnPadM.position.set(0, 0.12, 0);
    const plnFlangeM = new THREE.Mesh(plnFlangeGeo, plnDarkMat); plnFlangeM.position.set(0, 0.28, 0);
    const plnBodyM = new THREE.Mesh(plnBodyGeo, [plnDarkMat, plnCabMat, plnDarkMat, plnDarkMat, plnCabMat, plnCabMat]);
    plnBodyM.position.set(0, 1.10, 0);
    const plnRoofM = new THREE.Mesh(plnRoofGeo, plnDarkMat); plnRoofM.position.set(0, 1.92, 0);
    plnGroup.add(plnPadM, plnFlangeM, plnBodyM, plnRoofM);
    for (const cz of [-0.36, -0.12, 0.12, 0.36]) {
      const cPipe = new THREE.Mesh(plnConduitGeo, plnDarkMat);
      cPipe.position.set(0.18, 0.42, cz);
      plnGroup.add(cPipe);
    }
    for (const fz of [-0.62, 0.62]) {
      const fin = new THREE.Mesh(plnFinGeo, plnDarkMat);
      fin.position.set(0, 1.10, fz);
      plnGroup.add(fin);
    }
    const doorLatch = new THREE.Mesh(plnLatchGeo, plnDarkMat); doorLatch.position.set(-0.35, 1.00, 0.0);
    const leverArm = new THREE.Mesh(plnLeverArmGeo, plnHazardMat); leverArm.position.set(0.06, 1.14, 0.66);
    const leverGrip = new THREE.Mesh(plnLeverGripGeo, plnHazardMat); leverGrip.position.set(0.06, 1.30, 0.70);
    const plnBeaconM = new THREE.Mesh(plnBeaconGeo, plnBeaconMat); plnBeaconM.position.set(-0.18, 2.04, 0);
    plnGroup.add(doorLatch, leverArm, leverGrip, plnBeaconM);
    root.add(plnGroup);
    city._addCollider(plnX - 0.50, SIDEWALK_Y, plnZ - 0.74, plnX + 0.50, SIDEWALK_Y + 1.98, plnZ + 0.74, 'metal');
    if (typeof LRT !== 'undefined' && LRT.Render && typeof LRT.Render.attachPerimeterHalo === 'function') {
      city._perimeterHalos = city._perimeterHalos || [];
      const plnHalo = LRT.Render.attachPerimeterHalo(plnGroup, {
        color: 0xfacc15,
        hoverColor: 0xfacc15,
        objectiveColor: 0xfde047,
        initialMode: plnUsed ? 'off' : 'objective'
      });
      city._perimeterHalos.push({ id: 'city_pln_box', halo: plnHalo, used: !!plnUsed, isObjective: true, x: plnX - 0.35, y: SIDEWALK_Y + 1.25, z: plnZ });
    }

    city.interactables.push({
      id: 'city_pln_box',
      type: 'power_box',
      x: plnX - 0.35,
      y: SIDEWALK_Y + 1.25,
      z: plnZ,
      label: plnUsed ? '[E] Kotak Relai PLN Jalanan (Daya Aktif)' : '[E] Sakelar Utama PLN Jalanan (Pulihkan Penerangan Jalan)',
      prompt: plnUsed ? '[E] Kotak Relai PLN Jalanan (Daya Aktif)' : '[E] Sakelar Utama PLN Jalanan (Pulihkan Penerangan Jalan)',
      used: plnUsed
    });

    const convoyUsed = usedSet.has('city_convoy_car');
    city.interactables.push({
      id: 'city_convoy_car',
      type: 'street_stash',
      x: westRoadCX + 3.5,
      y: STREET_GROUND_Y + 0.9,
      z: -46.0,
      label: convoyUsed ? '[E] Mobil Patroli TNI MT Haryono (Sudah Digeledah)' : '[E] Buka Bagasi Mobil Patroli TNI (+18 Shotgun Shells)',
      prompt: convoyUsed ? '[E] Mobil Patroli TNI MT Haryono (Sudah Digeledah)' : '[E] Buka Bagasi Mobil Patroli TNI (+18 Shotgun Shells)',
      used: convoyUsed
    });
    placeCityFieldLogProp(city, root, 'city_convoy_car', westRoadCX + 3.5, STREET_GROUND_Y + 0.88, -47.25, 0.20, convoyUsed);

    const parkUsed = usedSet.has('city_pocket_park');
    const parkCrateGeo = new THREE.BoxGeometry(0.56, 0.42, 0.40);
    const parkCrateMat = new THREE.MeshStandardMaterial({ color: 0x3f4739, roughness: 0.72, metalness: 0.25 });
    city.disposableGeometries.push(parkCrateGeo);
    city.disposableMaterials.push(parkCrateMat);
    const parkCrateMesh = new THREE.Mesh(parkCrateGeo, parkCrateMat);
    parkCrateMesh.position.set(parkX, SIDEWALK_Y + 0.21, 0.0);
    parkCrateMesh.receiveShadow = true;
    root.add(parkCrateMesh);
    city._addCollider(parkX - 0.30, SIDEWALK_Y, -0.22, parkX + 0.30, SIDEWALK_Y + 0.44, 0.22, 'wood', { blocksBullets: false });
    city.interactables.push({
      id: 'city_pocket_park',
      type: 'street_stash',
      x: parkX,
      y: SIDEWALK_Y + 0.85,
      z: 0.0,
      label: parkUsed ? '[E] Peti Taktis Taman East Pocket (Sudah Digeledah)' : '[E] Buka Peti Taktis Taman East Pocket (+RPG, +Senapan, +25 HP)',
      prompt: parkUsed ? '[E] Peti Taktis Taman East Pocket (Sudah Digeledah)' : '[E] Buka Peti Taktis Taman East Pocket (+RPG, +Senapan, +25 HP)',
      used: parkUsed
    });
    placeCityFieldLogProp(city, root, 'city_pocket_park', parkX, SIDEWALK_Y + 0.425, 0.0, -Math.PI * 0.5 + 0.14, parkUsed);

    // Sittable East Pocket Park & Warung Kopi Benches
    for (let si = 0; si < seatingPlacements.length; si++) {
      const sp = seatingPlacements[si];
      const isWarung = Math.abs(sp.ry - Math.PI) < 0.25 && sp.z < -80;
      city.interactables.push({
        id: 'bench_park_' + si,
        type: 'bench',
        x: sp.x,
        y: sp.y + 0.55,
        z: sp.z,
        seatPos: isWarung
          ? { x: sp.x, y: sp.y + 0.02, z: sp.z + 0.12 }
          : { x: sp.x - 0.12, y: sp.y + 0.02, z: sp.z },
        standPos: isWarung
          ? { x: sp.x, y: sp.y + 0.02, z: sp.z + 0.95 }
          : { x: sp.x - 0.95, y: sp.y + 0.02, z: sp.z },
        yaw: isWarung ? 0 : Math.PI * 0.5,
        label: isWarung ? '[E] Duduk di Bangku Warung Kopi' : '[E] Duduk di Bangku Taman',
        prompt: isWarung ? '[E] Duduk di Bangku Warung Kopi' : '[E] Duduk di Bangku Taman'
      });
    }

    // 4 Far-Corner Exploration Hub Rewards & Field Notes (NW, NE, SW, SE) — Universal Perimeter Halo (zero RingGeometry!)
    city._streetBeacons = city._streetBeacons || {};
    city._perimeterHalos = city._perimeterHalos || [];
    const attachCornerHalo = (id, targetMesh, hx, hy, hz) => {
      const used = usedSet.has(id);
      if (typeof LRT !== 'undefined' && LRT.Render && typeof LRT.Render.attachPerimeterHalo === 'function' && targetMesh) {
        const halo = LRT.Render.attachPerimeterHalo(targetMesh, {
          color: 0xfacc15,
          hoverColor: 0xfacc15,
          thicknessScale: 0.95,
          initialMode: used ? 'off' : 'subtle'
        });
        city._perimeterHalos.push({ id: id, halo: halo, used: used, x: hx, y: hy, z: hz });
        city._streetBeacons[id] = { halo: halo, used: used };
      }
    };

    // NW Corner Interactive PMI Trauma Kit Mesh
    const nwMedUsed = usedSet.has('city_nw_medpost');
    const nwMedX = cornerHubCoords.NW.cx + 0.25, nwMedY = SIDEWALK_Y + 0.84, nwMedZ = 101.3;
    const nwMedGrp = new THREE.Group();
    nwMedGrp.name = 'CornerNW_Medpost';
    nwMedGrp.position.set(nwMedX, nwMedY, nwMedZ);
    const nwMatW = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.48, metalness: 0.12 });
    const nwMatR = new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.40, metalness: 0.15 });
    const nwBoxGeo = new THREE.BoxGeometry(0.56, 0.24, 0.38);
    const nwCrossAGeo = new THREE.BoxGeometry(0.24, 0.04, 0.06);
    const nwCrossBGeo = new THREE.BoxGeometry(0.06, 0.04, 0.24);
    city.disposableGeometries.push(nwBoxGeo, nwCrossAGeo, nwCrossBGeo);
    city.disposableMaterials.push(nwMatW, nwMatR);
    const nwBoxM = new THREE.Mesh(nwBoxGeo, nwMatW); nwBoxM.position.y = 0.12;
    const nwCA = new THREE.Mesh(nwCrossAGeo, nwMatR); nwCA.position.y = 0.25;
    const nwCB = new THREE.Mesh(nwCrossBGeo, nwMatR); nwCB.position.y = 0.25;
    nwMedGrp.add(nwBoxM, nwCA, nwCB);
    root.add(nwMedGrp);
    attachCornerHalo('city_nw_medpost', nwMedGrp, nwMedX, nwMedY + 0.12, nwMedZ);
    city.interactables.push({
      id: 'city_nw_medpost',
      type: 'corner_medpost',
      corner: 'NW',
      x: nwMedX,
      y: SIDEWALK_Y + 0.96,
      z: nwMedZ,
      label: nwMedUsed ? '[E] Kotak Medis Darurat PMI (Sudah Diambil)' : '[E] Ambil Kotak Medis Darurat PMI (+35 Armor & +25 HP)',
      prompt: nwMedUsed ? '[E] Kotak Medis Darurat PMI (Sudah Diambil)' : '[E] Ambil Kotak Medis Darurat PMI (+35 Armor & +25 HP)',
      used: nwMedUsed
    });

    // NE Corner Interactive Expedition Supply Pack atop Dock Chest
    const neDockY = SIDEWALK_Y + 0.62;
    const neDepotUsed = usedSet.has('city_ne_depot');
    const neDepX = cornerHubCoords.NE.cx + 0.5, neDepY = neDockY + 0.73, neDepZ = 102.3;
    const nePackGrp = new THREE.Group();
    nePackGrp.name = 'CornerNE_DepotPack';
    nePackGrp.position.set(neDepX + 0.22, neDepY, neDepZ);
    const nePackMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.68 });
    const neBandMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.35 });
    const nePackGeo = new THREE.BoxGeometry(0.32, 0.18, 0.24);
    const neBandGeo = new THREE.BoxGeometry(0.34, 0.04, 0.06);
    city.disposableGeometries.push(nePackGeo, neBandGeo);
    city.disposableMaterials.push(nePackMat, neBandMat);
    const nePackM = new THREE.Mesh(nePackGeo, nePackMat); nePackM.position.y = 0.09;
    const neBandM = new THREE.Mesh(neBandGeo, neBandMat); neBandM.position.y = 0.16;
    nePackGrp.add(nePackM, neBandM);
    root.add(nePackGrp);
    attachCornerHalo('city_ne_depot', nePackGrp, neDepX, neDockY + 0.55, neDepZ);
    city.interactables.push({
      id: 'city_ne_depot',
      type: 'corner_depot',
      corner: 'NE',
      x: neDepX,
      y: neDockY + 0.55,
      z: neDepZ,
      label: neDepotUsed ? '[E] Peti Logistik Gudang Utara (Sudah Diambil)' : '[E] Bongkar Peti Logistik Gudang Utara (Amunisi Penuh & Heavy Ammo)',
      prompt: neDepotUsed ? '[E] Peti Logistik Gudang Utara (Sudah Diambil)' : '[E] Bongkar Peti Logistik Gudang Utara (Amunisi Penuh & Heavy Ammo)',
      used: neDepotUsed
    });

    // SW Corner Interactive Tactical Ordnance Pouch atop Convoy Chest
    const swConvoyUsed = usedSet.has('city_sw_convoy');
    const swX = cornerHubCoords.SW.cx + 1.8, swY = SIDEWALK_Y + 0.65, swZ = -101.2;
    const swPackGrp = new THREE.Group();
    swPackGrp.name = 'CornerSW_OrdnancePack';
    swPackGrp.position.set(swX + 0.24, swY, swZ);
    const swPackMat = new THREE.MeshStandardMaterial({ color: 0x3b4836, roughness: 0.58, metalness: 0.35 });
    const swStrapMat = new THREE.MeshStandardMaterial({ color: 0xd9a738, roughness: 0.32, metalness: 0.78 });
    const swPackGeo = new THREE.BoxGeometry(0.34, 0.16, 0.26);
    const swStrapGeo = new THREE.BoxGeometry(0.10, 0.18, 0.28);
    city.disposableGeometries.push(swPackGeo, swStrapGeo);
    city.disposableMaterials.push(swPackMat, swStrapMat);
    const swPackM = new THREE.Mesh(swPackGeo, swPackMat); swPackM.position.y = 0.08;
    const swStrapM = new THREE.Mesh(swStrapGeo, swStrapMat); swStrapM.position.y = 0.09;
    swPackGrp.add(swPackM, swStrapM);
    root.add(swPackGrp);
    attachCornerHalo('city_sw_convoy', swPackGrp, swX, swY, swZ);
    city.interactables.push({
      id: 'city_sw_convoy',
      type: 'corner_convoy',
      corner: 'SW',
      x: swX,
      y: SIDEWALK_Y + 0.65,
      z: swZ,
      label: swConvoyUsed ? '[E] Peti Amunisi Konvoi Militer (Sudah Diambil)' : '[E] Ambil Peti Amunisi Konvoi Militer (+25 Armor & +2 Mag)',
      prompt: swConvoyUsed ? '[E] Peti Amunisi Konvoi Militer (Sudah Diambil)' : '[E] Ambil Peti Amunisi Konvoi Militer (+25 Armor & +2 Mag)',
      used: swConvoyUsed
    });

    // SE Corner Interactive Red/Silver Kopi Thermos on Warung Counter
    const seWarungUsed = usedSet.has('city_se_warung');
    const seX = cornerHubCoords.SE.cx + 2.35, seY = SIDEWALK_Y + 0.90, seZ = -100.12;
    const seThermosGrp = new THREE.Group();
    seThermosGrp.name = 'CornerSE_KopiThermos';
    seThermosGrp.position.set(seX, seY, seZ);
    const seRedMat = new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.35, metalness: 0.25 });
    const seCapMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.26, metalness: 0.84 });
    const seBodyGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.36, 10);
    const seCapGeo = new THREE.CylinderGeometry(0.08, 0.10, 0.08, 10);
    city.disposableGeometries.push(seBodyGeo, seCapGeo);
    city.disposableMaterials.push(seRedMat, seCapMat);
    const seBodyM = new THREE.Mesh(seBodyGeo, seRedMat); seBodyM.position.y = 0.18;
    const seCapM = new THREE.Mesh(seCapGeo, seCapMat); seCapM.position.y = 0.40;
    seThermosGrp.add(seBodyM, seCapM);
    root.add(seThermosGrp);
    attachCornerHalo('city_se_warung', seThermosGrp, seX, seY + 0.15, seZ);
    city.interactables.push({
      id: 'city_se_warung',
      type: 'corner_warung',
      corner: 'SE',
      x: seX,
      y: SIDEWALK_Y + 1.05,
      z: seZ,
      label: seWarungUsed ? '[E] Termos Kopi & Bekal Pos Ronda (Sudah Diminum)' : '[E] Minum Termos Kopi & Bekal Pos Ronda (+25 HP & Fast Sprint 45s)',
      prompt: seWarungUsed ? '[E] Termos Kopi & Bekal Pos Ronda (Sudah Diminum)' : '[E] Minum Termos Kopi & Bekal Pos Ronda (+25 HP & Fast Sprint 45s)',
      used: seWarungUsed
    });

    const cornerNotes = [
      {
        id: 'note_nw_corner',
        x: cornerHubCoords.NW.cx - 2.1,
        y: SIDEWALK_Y + 0.83,
        z: 100.9,
        ry: 0.22,
        label: '[E] Baca Log Medis Posko PMI NW'
      },
      {
        id: 'note_ne_corner',
        x: cornerHubCoords.NE.cx + 3.74,
        y: SIDEWALK_Y + 0.85,
        z: 98.4,
        ry: -Math.PI * 0.5 + 0.15,
        label: '[E] Baca Manifes Kargo Pos Sekuriti NE'
      },
      {
        id: 'note_sw_corner',
        x: cornerHubCoords.SW.cx - 0.4,
        y: SIDEWALK_Y + 0.71,
        z: -101.4,
        ry: -0.30,
        label: '[E] Baca Perintah Sekat Konvoi SW'
      },
      {
        id: 'note_se_corner',
        x: cornerHubCoords.SE.cx - 0.65,
        y: SIDEWALK_Y + 0.93,
        z: -99.98,
        ry: 0.12,
        label: '[E] Baca Buku Jaga Poskamling SE'
      }
    ];
    for (let ni = 0; ni < cornerNotes.length; ni++) {
      const cn = cornerNotes[ni];
      const nUsed = usedSet.has(cn.id);
      city.interactables.push({
        id: cn.id,
        type: 'field_log',
        x: cn.x,
        y: cn.y + 0.04,
        z: cn.z,
        label: nUsed ? cn.label + ' (Sudah Dibaca)' : cn.label,
        prompt: nUsed ? cn.label + ' (Sudah Dibaca)' : cn.label,
        used: nUsed
      });
      placeCityFieldLogProp(city, root, cn.id, cn.x, cn.y, cn.z, cn.ry, nUsed);
    }
    if (typeof city._syncStreetBeacons === 'function') {
      city._syncStreetBeacons();
    }

    // Tactical Street Lootboxes (openable 3D Pelican cases with 3 individual 3D item slots & universal perimeter halo!)
    city._lootboxVisuals = city._lootboxVisuals || [];
    const lootboxSpecs = [
      {
        id: 'city_alley_lootbox',
        x: eastColRoadMinX - 1.1,
        y: SIDEWALK_Y,
        z: -30.2,
        ry: 0.25,
        riskLuck: 0.85,
        labelOpen: '[E / Klik] Buka Peti Suplai Gang Samping (High-Risk)',
        labelUsed: '[E] Peti Suplai Gang Samping (Kosong)',
        slotSpecs: [
          { itemType: 'ammo', ammoType: 'rifle', ammoAmount: 45, localX: -0.26, localZ: -0.14, label: '[E] Ambil Magasin 5.56mm (+45 Peluru)' },
          { itemType: 'weapon_variant', weaponId: 'rifle', variantId: 'ak47', variantLabel: 'AK-47', localX: 0.0, localZ: 0.08, label: '[E] Ambil Senapan AK-47 (Varian Langka)' },
          { itemType: 'medkit', healAmount: 35, localX: 0.26, localZ: -0.14, label: '[E] Ambil Medkit Taktis (+35 HP)' }
        ]
      },
      {
        id: 'city_plaza_lootbox',
        x: parkX + 2.2,
        y: SIDEWALK_Y,
        z: -15.5,
        ry: -0.35,
        riskLuck: 0.55,
        labelOpen: '[E / Klik] Buka Peti Taktis Taman & Busway',
        labelUsed: '[E] Peti Taktis Taman & Busway (Kosong)',
        slotSpecs: [
          { itemType: 'ammo', ammoType: 'shotgun', ammoAmount: 12, localX: -0.26, localZ: -0.14, label: '[E] Ambil Selongsong 12G (+12 Peluru)' },
          { itemType: 'weapon_variant', weaponId: 'pistol', variantId: 'revolver', variantLabel: 'Revolver .357', localX: 0.0, localZ: 0.08, label: '[E] Ambil Revolver .357 Magnum (Varian Langka)' },
          { itemType: 'armor', armorAmount: 25, localX: 0.26, localZ: -0.14, label: '[E] Ambil Pelat Rompi (+25 Armor)' }
        ]
      }
    ];
    if (rng() < 0.5) {
      lootboxSpecs.push({
        id: 'city_west_plaza_lootbox',
        x: westInnerSwMaxX - 2.4,
        y: SIDEWALK_Y,
        z: 18.0,
        ry: Math.PI * 0.5,
        riskLuck: 0.45,
        labelOpen: '[E / Klik] Buka Peti Suplai Trotoar Barat',
        labelUsed: '[E] Peti Suplai Trotoar Barat (Kosong)',
        slotSpecs: [
          { itemType: 'ammo', ammoType: 'pistol', ammoAmount: 30, localX: -0.26, localZ: -0.14, label: '[E] Ambil Magasin 9mm (+30 Peluru)' },
          { itemType: 'weapon_variant', weaponId: 'shotgun', variantId: 'doublebarrel', variantLabel: 'Double-Barrel 12G', localX: 0.0, localZ: 0.08, label: '[E] Ambil Double-Barrel Coach Gun (Varian Langka)' },
          { itemType: 'medkit', healAmount: 30, localX: 0.26, localZ: -0.14, label: '[E] Ambil Kotak P3K (+30 HP)' }
        ]
      });
    }
    const bLootColl = [];
    for (let li = 0; li < lootboxSpecs.length; li++) {
      const lb = lootboxSpecs[li];
      const takenSlots = new Set();
      let takenCount = 0;
      for (let si = 0; si < lb.slotSpecs.length; si++) {
        if (usedSet.has(`${lb.id}__slot_${si}`)) {
          takenSlots.add(si);
          takenCount++;
        }
      }
      const lbOpened = usedSet.has(`${lb.id}__opened`) || takenCount > 0 || usedSet.has(lb.id);
      const lbUsed = usedSet.has(lb.id) || takenCount >= lb.slotSpecs.length;

      const vis = P.createLootboxVisual(
        root, city.disposableGeometries, city.disposableMaterials,
        lb.id, lb.x, lb.y, lb.z, lb.ry, lbUsed,
        { slotSpecs: lb.slotSpecs, opened: lbOpened, takenSlots: takenSlots }
      );
      city._lootboxVisuals.push(vis);
      if (city._lootboxGlows) city._lootboxGlows[lb.id] = vis.haloGroup;

      city.interactables.push({
        id: lb.id,
        type: 'lootbox',
        riskLuck: lb.riskLuck,
        x: lb.x,
        y: lb.y + 0.58,
        z: lb.z,
        label: lbUsed ? lb.labelUsed : lb.labelOpen,
        prompt: lbUsed ? lb.labelUsed : lb.labelOpen,
        _openLabel: lb.labelOpen,
        _usedLabel: lb.labelUsed,
        opened: lbOpened,
        used: lbUsed
      });

      if (vis.slots && vis.slots.length > 0) {
        for (let si = 0; si < vis.slots.length; si++) {
          const sl = vis.slots[si];
          city.interactables.push({
            id: sl.id,
            type: 'lootbox',
            isLootSlot: true,
            crateId: lb.id,
            slotIdx: sl.slotIdx,
            x: sl.x,
            y: sl.y,
            z: sl.z,
            label: sl.label,
            prompt: sl.label,
            taken: !!sl.taken,
            used: !!sl.taken
          });
        }
      }

      city._addCollider(lb.x - 0.52, lb.y, lb.z - 0.52, lb.x + 0.52, lb.y + 0.66, lb.z + 0.52, 'metal', {
        blocksWalk: true, blocksBullets: false
      });
      addBox(bLootColl, 0.98, 0.62, 0.68, lb.x, lb.y + 0.31, lb.z, 0, lb.ry, 0);
    }
    city._mergeAndRegisterBVH(bLootColl, matInvisColl, false, false, 'CityLootboxCollisionHull', true);

    city.hydrants = [];
    for (let i = 0; i < hydrantPlacements.length; i++) {
      const hp = hydrantPlacements[i];
      city.hydrants.push({
        id: 'hydrant_' + i,
        x: hp.x,
        y: hp.y,
        z: hp.z,
        burst: false
      });
    }

  }

  P.clutter = {
    placeCityFieldLogProp,
    buildCornerHubsStatic,
    buildStreetPropsAndVehicles,
    buildStreetInteractablesAndLoot
  };
})();
