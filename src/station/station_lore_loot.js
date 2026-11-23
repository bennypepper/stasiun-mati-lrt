(function (LRT) {
  'use strict';

  const S = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {}).station = window.__LRT_INTERNAL__.station || {};

  function getFieldLogPropAssets(station) {
    if (station._fieldLogPropAssets) return station._fieldLogPropAssets;
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

    station.disposableGeometries.push(folderGeo, tabGeo, paperGeo, lineGeo, stampGeo);
    station.disposableMaterials.push(folderMat, paperMat, inkMat, stampMat);

    station._fieldLogPropAssets = {
      folderGeo, tabGeo, paperGeo, lineGeo, stampGeo,
      folderMat, paperMat, inkMat, stampMat
    };
    return station._fieldLogPropAssets;
  }

  function placeFieldLogProp(station, root, id, x, y, z, ry, used, skipHalo) {
    if (!root) return null;
    const a = getFieldLogPropAssets(station);

    const grp = new THREE.Group();
    grp.name = 'FieldLogProp_' + id;
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

    if (!skipHalo && typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget(id, grp, { category: 'interactable', x, y: y + 0.03, z, hitRadius: 0.48 });
    }
    return grp;
  }


  function buildFieldLogProps(station, ctx) {
    const { root, arch, isCawang, track2X, gardenMaxX, depotMaxX, supX, supZ } = ctx;
    const { UPPER_FLOOR_Y } = S.CONST;
    const addPbrPart = S.addPbrPart;
    // 3D Physical Field Log Paper / Manila Folder Props at Station Note Counters
    if (isCawang && ctx.cawangWreckX !== undefined) {
      const cabX = ctx.cawangWreckX - 2.25;
      const cabZ = -10.6;
      const cabGrp = new THREE.Group();
      cabGrp.name = 'CawangFuseJunctionBox';
      // Grounded on the y = -1.0 trackbed cleanly outside the derailed train cab nose (no hull clipping!)
      cabGrp.position.set(cabX, -1.0, cabZ);
      root.add(cabGrp);
      const cabSteel = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.46, metalness: 0.68 });
      const cabTrim = new THREE.MeshStandardMaterial({ color: 0x1e252e, roughness: 0.36, metalness: 0.78 });
      const cabWarn = new THREE.MeshStandardMaterial({ color: 0xeab308, emissive: 0x422006, emissiveIntensity: 0.45, roughness: 0.42 });
      const cabUsedNow = !!(station._usedIds && station._usedIds.has('cawang_derelict_cab'));
      const cabLed = new THREE.MeshStandardMaterial({
        color: cabUsedNow ? 0x22c55e : 0xf97316,
        emissive: cabUsedNow ? 0x22c55e : 0xf97316,
        emissiveIntensity: 1.5
      });
      station._cawangCabLedMat = cabLed;
      const cabCopper = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.30, metalness: 0.85 });
      station.disposableMaterials.push(cabSteel, cabTrim, cabWarn, cabLed, cabCopper);
      // Heavy steel base plate & dual support legs resting on the trackbed ballast (y = 0..0.96 local)
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.66, 0.06, 0.56), cabTrim, 0, 0.03, 0);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.08, 0.92, 0.08), cabTrim, -0.22, 0.49, -0.14);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.08, 0.92, 0.08), cabTrim, 0.22, 0.49, -0.14);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.52, 0.06, 0.06), cabSteel, 0, 0.48, -0.14);
      // Flat inspection work table shelf at local y = 0.96 (world y = -0.04)
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.64, 0.05, 0.52), cabTrim, 0, 0.96, 0);
      // High-voltage LRT emergency cab bypass junction box rising to local y = 1.42 (world y = +0.42)
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.50, 0.42, 0.36), cabSteel, 0, 1.19, -0.04);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.54, 0.04, 0.40), cabTrim, 0, 1.41, -0.04);
      // Open hinged inspection door + yellow hazard plate + glowing bypass fuse cartridge & status LED
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.03, 0.36, 0.26), cabSteel, -0.28, 1.19, 0.24, 0, -0.45, 0);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.28, 0.16, 0.02), cabWarn, 0, 1.16, 0.15);
      addPbrPart(station, cabGrp, new THREE.CylinderGeometry(0.028, 0.028, 0.14, 10), cabCopper, -0.08, 1.24, 0.16);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.055, 0.055, 0.03), cabLed, 0.15, 1.30, 0.15);
      // Heavy armored umbilical conduit connecting back toward the derailed train cab undercarriage
      addPbrPart(station, cabGrp, new THREE.CylinderGeometry(0.028, 0.028, 0.62, 8), cabTrim, 0.28, 0.72, -0.08, 0, 0, -0.62);
      if (typeof station._registerHaloTarget === 'function') {
        station._registerHaloTarget('cawang_derelict_cab', cabGrp, {
          category: 'interactable', x: cabX, y: 0.25, z: cabZ, hitRadius: 0.82
        });
      }
      placeFieldLogProp(station, root, 'cawang_derelict_cab', cabX + 0.04, 0.44, cabZ - 0.02, 0.22, station._usedIds.has('cawang_derelict_cab'), true);
    }
    if (arch.hasGardenTerrace) {
      const gCX = (track2X + 1.85 + gardenMaxX) * 0.5;
      placeFieldLogProp(station, root, 'garden_supply', gCX + 0.22, 0.785, -47.8, 0.12, station._usedIds.has('garden_supply'));
    }
    if (arch.hasDepotShed) {
      placeFieldLogProp(station, root, 'depot_supply', depotMaxX - 1.2, 1.16, 54.0, -Math.PI * 0.5 + 0.14, station._usedIds.has('depot_supply'));
    }
    if (arch.id === 'setiabudi') {
      const relGrp = new THREE.Group();
      relGrp.name = 'SetiabudiRelayCabinet';
      relGrp.position.set(supX + 1.8, UPPER_FLOOR_Y, supZ);
      root.add(relGrp);
      const relBodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.44, metalness: 0.68 });
      const relTrimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.28, metalness: 0.85 });
      const relDarkMat = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.55, metalness: 0.6 });
      const relLedRed = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.6 });
      const relLedAmb = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.6 });
      station.disposableMaterials.push(relBodyMat, relTrimMat, relDarkMat, relLedRed, relLedAmb);
      addPbrPart(station, relGrp, new THREE.BoxGeometry(0.54, 0.06, 0.46), relDarkMat, 0, 0.03, 0);
      addPbrPart(station, relGrp, new THREE.BoxGeometry(0.48, 0.74, 0.40), relBodyMat, 0, 0.43, 0);
      addPbrPart(station, relGrp, new THREE.BoxGeometry(0.52, 0.05, 0.44), relTrimMat, 0, 0.82, 0);
      addPbrPart(station, relGrp, new THREE.BoxGeometry(0.38, 0.56, 0.02), relDarkMat, 0, 0.43, 0.205);
      for (let lv = 0; lv < 4; lv++) {
        addPbrPart(station, relGrp, new THREE.BoxGeometry(0.28, 0.025, 0.015), relTrimMat, 0, 0.22 + lv * 0.06, 0.22);
      }
      addPbrPart(station, relGrp, new THREE.BoxGeometry(0.04, 0.14, 0.04), relTrimMat, 0.14, 0.52, 0.22);
      addPbrPart(station, relGrp, new THREE.BoxGeometry(0.04, 0.04, 0.02), relLedRed, -0.10, 0.64, 0.22);
      addPbrPart(station, relGrp, new THREE.BoxGeometry(0.04, 0.04, 0.02), relLedAmb, -0.02, 0.64, 0.22);
      addPbrPart(station, relGrp, new THREE.CylinderGeometry(0.010, 0.016, 0.42, 6), relTrimMat, -0.18, 1.05, -0.12);
      station._addCollider(supX + 1.55, UPPER_FLOOR_Y, supZ - 0.22, supX + 2.05, UPPER_FLOOR_Y + 0.85, supZ + 0.22, 'metal');
      if (typeof station._registerHaloTarget === 'function') {
        station._registerHaloTarget('setiabudi_jpo_switch', relGrp, {
          category: 'interactable', x: supX + 1.8, y: UPPER_FLOOR_Y + 0.52, z: supZ, hitRadius: 0.72
        });
      }
      placeFieldLogProp(station, root, 'setiabudi_jpo_switch', supX + 1.8, UPPER_FLOOR_Y + 0.845, supZ, 0.15, station._usedIds.has('setiabudi_jpo_switch'), true);
    }

  }

  function buildPelicanLootboxes(station, ctx) {
    const {
      root, arch, rng, isIsland, isCawang, isElevated, hasDualTrack,
      p1MinX, p1MaxX, p2MinX, i2MinX, i2MaxX, track2X, concMinX, concMaxX, concMinZ, concMaxZ, concMidZ,
      jpoCX, jpoZ, jpoNearZ, jpo2Z, gardenMaxX, depotMaxX, platMinZ, platMaxZ, rotioZ, indoZ,
      isInStairExclusion
    } = ctx;
    const { UPPER_FLOOR_Y } = S.CONST;
    const addPbrPart = S.addPbrPart;
    // =========================================================
    // 9B. CURATED STRATEGIC TACTICAL LOOTBOX CRATES (2-3 PER STATION)
    // =========================================================
    station._lootboxGlows = new Map();
    station._lootboxVisuals = [];
    const RARE_WEAPON_DROPS = [
      { weaponId: 'pistol', variantId: 'revolver', label: '[E] Ambil Revolver .357 Magnum', ammoAmount: 18 },
      { weaponId: 'rifle', variantId: 'm4', label: '[E] Ambil M4A1 Tactical', ammoAmount: 45 },
      { weaponId: 'rifle', variantId: 'ak47', label: '[E] Ambil AK-47 Kalashnikov', ammoAmount: 45 },
      { weaponId: 'shotgun', variantId: 'doublebarrel', label: '[E] Ambil Double-Barrel Coach Gun', ammoAmount: 16 }
    ];

    const buildFallbackWeaponMesh = (weaponId, variantId) => {
      const wg = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0x2a313b, roughness: 0.34, metalness: 0.84 });
      const wood = new THREE.MeshStandardMaterial({ color: 0x6b3e22, roughness: 0.64, metalness: 0.08 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xd4a338, roughness: 0.28, metalness: 0.88 });
      station.disposableMaterials.push(steel, wood, brass);
      if (variantId === 'revolver' || weaponId === 'pistol') {
        addPbrPart(station, wg, new THREE.BoxGeometry(0.18, 0.032, 0.026), steel, 0.03, 0.04, 0);
        addPbrPart(station, wg, new THREE.CylinderGeometry(0.022, 0.022, 0.044, 10), steel, -0.02, 0.036, 0, 0, 0, Math.PI * 0.5);
        addPbrPart(station, wg, new THREE.BoxGeometry(0.042, 0.08, 0.024), wood, -0.08, 0.015, 0, 0, 0, 0.28);
      } else if (variantId === 'doublebarrel' || weaponId === 'shotgun') {
        addPbrPart(station, wg, new THREE.CylinderGeometry(0.011, 0.011, 0.24, 8), steel, 0.05, 0.035, -0.013, 0, 0, Math.PI * 0.5);
        addPbrPart(station, wg, new THREE.CylinderGeometry(0.011, 0.011, 0.24, 8), steel, 0.05, 0.035, 0.013, 0, 0, Math.PI * 0.5);
        addPbrPart(station, wg, new THREE.BoxGeometry(0.11, 0.042, 0.044), steel, -0.04, 0.03, 0);
        addPbrPart(station, wg, new THREE.BoxGeometry(0.14, 0.045, 0.036), wood, -0.14, 0.022, 0, 0, 0, 0.14);
      } else {
        const isAk = variantId === 'ak47';
        addPbrPart(station, wg, new THREE.BoxGeometry(0.18, 0.048, 0.038), steel, -0.01, 0.038, 0);
        addPbrPart(station, wg, new THREE.CylinderGeometry(0.009, 0.009, 0.17, 8), steel, 0.13, 0.044, 0, 0, 0, Math.PI * 0.5);
        addPbrPart(station, wg, new THREE.BoxGeometry(0.12, 0.044, 0.034), isAk ? wood : steel, -0.13, 0.032, 0);
        addPbrPart(station, wg, new THREE.BoxGeometry(0.028, 0.08, 0.022), isAk ? brass : steel, 0.02, 0.015, 0.035, 0.4, 0, -0.18);
      }
      return wg;
    };

    let crateSerial = 0;
    const placeLootbox = (id, lx, ly, lz, ry, riskLuck, title) => {
      const myIdx = crateSerial++;
      const used = station._usedIds.has(id);
      const grp = new THREE.Group();
      grp.name = id + '_PelicanCrate';
      grp.position.set(lx, ly, lz);
      if (ry) grp.rotation.y = ry;
      root.add(grp);

      const caseMat = new THREE.MeshStandardMaterial({ color: 0x3b4432, roughness: 0.56, metalness: 0.22 });
      const rubberMat = new THREE.MeshStandardMaterial({ color: 0x181c22, roughness: 0.78, metalness: 0.18 });
      const foamMat = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.92, metalness: 0.04 });
      const latchMat = new THREE.MeshStandardMaterial({ color: 0xd4a338, roughness: 0.30, metalness: 0.85 });
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.28, metalness: 0.86 });
      const redMat = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.40, metalness: 0.14 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.44, metalness: 0.10 });
      const medGreenMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.46, metalness: 0.20 });
      const gunMetalMat = new THREE.MeshStandardMaterial({ color: 0x27303b, roughness: 0.36, metalness: 0.78 });
      station.disposableMaterials.push(caseMat, rubberMat, foamMat, latchMat, steelMat, redMat, whiteMat, medGreenMat, gunMetalMat);

      const RBG = window.THREE_JSM && window.THREE_JSM.RoundedBoxGeometry;
      const makeBox = (w, h, d, r) => (typeof RBG === 'function'
        ? new RBG(w, h, d, 2, Math.min(r || 0.015, Math.min(w, h, d) * 0.35))
        : new THREE.BoxGeometry(w, h, d));

      // Crisp stenciled military logistics plaque texture (cached once on station!)
      if (!station._pelicanStencilMat) {
        const sc = document.createElement('canvas');
        sc.width = 256;
        sc.height = 64;
        const sctx = sc.getContext('2d');
        sctx.fillStyle = '#2f3728';
        sctx.fillRect(0, 0, 256, 64);
        sctx.strokeStyle = '#d4a338';
        sctx.lineWidth = 4;
        sctx.strokeRect(4, 4, 248, 56);
        sctx.fillStyle = '#eab308';
        sctx.font = 'bold 18px monospace';
        sctx.textAlign = 'center';
        sctx.fillText('LOGISTIK DARURAT', 128, 30);
        sctx.fillStyle = '#cbd5e1';
        sctx.font = 'bold 12px monospace';
        sctx.fillText('TNI-AD // KAI JABODEBEK', 128, 49);
        const sTex = new THREE.CanvasTexture(sc);
        sTex.colorSpace = THREE.SRGBColorSpace;
        station._pelicanStencilMat = new THREE.MeshStandardMaterial({
          map: sTex, roughness: 0.52, metalness: 0.24
        });
        station.disposableMaterials.push(station._pelicanStencilMat);
      }

      // 1) Rugged beveled Pelican polymer-steel lower tub, recessed panels, corner bumpers, ribs & carry handles
      addPbrPart(station, grp, makeBox(1.12, 0.38, 0.66, 0.025), caseMat, 0, 0.20, 0);
      addPbrPart(station, grp, makeBox(1.16, 0.05, 0.70, 0.012), rubberMat, 0, 0.03, 0); // molded bottom skid feet rim
      for (const bx of [-0.54, 0.54]) {
        for (const bz of [-0.31, 0.31]) {
          addPbrPart(station, grp, makeBox(0.095, 0.42, 0.095, 0.018), rubberMat, bx, 0.21, bz);
        }
      }
      for (const cx of [-0.57, 0.57]) {
        addPbrPart(station, grp, makeBox(0.05, 0.34, 0.54, 0.010), rubberMat, cx, 0.21, 0);
        // Fold-down heavy-duty carry handle + twin steel pivot brackets
        addPbrPart(station, grp, new THREE.CylinderGeometry(0.016, 0.016, 0.26, 10), rubberMat, cx * 1.075, 0.23, 0, Math.PI * 0.5, 0, 0);
        for (const hz of [-0.13, 0.13]) {
          addPbrPart(station, grp, new THREE.BoxGeometry(0.055, 0.04, 0.035), steelMat, cx * 1.03, 0.23, hz);
        }
      }
      // Vertical structural reinforcement ribs across front & back faces
      for (const rxPos of [-0.38, -0.22, 0.22, 0.38]) {
        addPbrPart(station, grp, makeBox(0.036, 0.34, 0.695, 0.008), rubberMat, rxPos, 0.20, 0);
      }
      // Upper waterproof rubber gasket rim + twin dual-stage metallic clasp latches + pressure purge valve + stencil plate
      addPbrPart(station, grp, makeBox(1.16, 0.048, 0.70, 0.012), rubberMat, 0, 0.415, 0);
      for (const lxPos of [-0.30, 0.30]) {
        addPbrPart(station, grp, makeBox(0.088, 0.15, 0.048, 0.008), rubberMat, lxPos, 0.34, 0.346);
        addPbrPart(station, grp, makeBox(0.068, 0.11, 0.036, 0.006), latchMat, lxPos, 0.35, 0.362);
        addPbrPart(station, grp, new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8), steelMat, lxPos, 0.28, 0.365, 0, 0, Math.PI * 0.5);
      }
      // Center pressure-equalization valve dial + stenciled logistics ID plaque
      addPbrPart(station, grp, new THREE.CylinderGeometry(0.026, 0.028, 0.024, 12), steelMat, -0.14, 0.14, 0.336, Math.PI * 0.5, 0, 0);
      addPbrPart(station, grp, new THREE.BoxGeometry(0.36, 0.095, 0.018), station._pelicanStencilMat, 0.04, 0.24, 0.338);

      // Recessed charcoal foam interior tray + 3 contoured divider ribs
      addPbrPart(station, grp, new THREE.BoxGeometry(1.04, 0.048, 0.58), foamMat, 0, 0.405, 0);
      for (const divX of [-0.17, 0.17]) {
        addPbrPart(station, grp, makeBox(0.032, 0.040, 0.54, 0.006), rubberMat, divX, 0.432, 0);
      }

      // 2) Hinged beveled Pelican lid anchored at back edge (y = 0.44, z = -0.34) with rear knuckle hinges
      const lidPivot = new THREE.Group();
      lidPivot.name = id + '_LidPivot';
      lidPivot.position.set(0, 0.44, -0.34);
      lidPivot.rotation.x = used ? -1.72 : 0.0;
      grp.add(lidPivot);
      addPbrPart(station, lidPivot, makeBox(1.16, 0.095, 0.70, 0.018), rubberMat, 0, 0.048, 0.34);
      addPbrPart(station, lidPivot, makeBox(1.04, 0.055, 0.58, 0.014), caseMat, 0, 0.108, 0.34);
      addPbrPart(station, lidPivot, new THREE.BoxGeometry(0.98, 0.024, 0.52), foamMat, 0, 0.006, 0.34);
      for (const lxPos of [-0.36, -0.12, 0.12, 0.36]) {
        addPbrPart(station, lidPivot, makeBox(0.048, 0.032, 0.56, 0.008), rubberMat, lxPos, 0.140, 0.34);
      }
      for (const hx of [-0.36, 0.36]) {
        addPbrPart(station, lidPivot, new THREE.CylinderGeometry(0.020, 0.020, 0.11, 8), steelMat, hx, 0.015, 0.00, 0, 0, Math.PI * 0.5);
      }
      addPbrPart(station, lidPivot, new THREE.BoxGeometry(0.74, 0.024, 0.06), latchMat, 0, 0.142, 0.58);
      addPbrPart(station, lidPivot, new THREE.BoxGeometry(0.36, 0.020, 0.095), station._pelicanStencilMat, 0, 0.140, 0.34);

      // Attach outer Pelican case perimeter halo BEFORE adding interior item slots
      const crateHalo = (LRT.Render && typeof LRT.Render.attachPerimeterHalo === 'function')
        ? LRT.Render.attachPerimeterHalo(grp, { initialMode: used ? 'off' : 'subtle' })
        : null;

      // 3) Build 3 discrete interactive 3D item meshes inside interior tray (Slot 0: Rare Weapon, Slot 1: Ammo, Slot 2: Medkit)
      const cos = Math.cos(ry || 0);
      const sin = Math.sin(ry || 0);
      const slotWorldPos = (slx, slz) => [lx + slx * cos + slz * sin, ly + 0.46, lz - slx * sin + slz * cos];

      const stSeed = (typeof station._stationIndex === 'number' ? station._stationIndex : 0);
      const wPick = RARE_WEAPON_DROPS[(stSeed * 3 + myIdx) % RARE_WEAPON_DROPS.length];
      const useShotgunAmmo = (myIdx % 2 === 1) || wPick.weaponId === 'shotgun';

      const slotSpecs = [
        {
          slotIdx: 0,
          lx: -0.34,
          itemType: 'weapon_variant',
          weaponId: wPick.weaponId,
          variantId: wPick.variantId,
          ammoType: wPick.weaponId,
          amount: wPick.ammoAmount,
          label: wPick.label
        },
        {
          slotIdx: 1,
          lx: 0.0,
          itemType: 'ammo',
          weaponId: null,
          variantId: null,
          ammoType: useShotgunAmmo ? 'shotgun' : 'rifle',
          amount: useShotgunAmmo ? 12 : 30,
          label: useShotgunAmmo ? '[E] Ambil Peluru 12G (+12)' : '[E] Ambil Amunisi 5.56mm (+30)'
        },
        {
          slotIdx: 2,
          lx: 0.34,
          itemType: 'medkit',
          weaponId: null,
          variantId: null,
          ammoType: null,
          amount: 35,
          label: '[E] Ambil Medkit (+35 HP)'
        }
      ];

      const items = [];
      for (let si = 0; si < slotSpecs.length; si++) {
        const spec = slotSpecs[si];
        const slotGrp = new THREE.Group();
        slotGrp.name = id + '_Slot_' + spec.slotIdx;
        slotGrp.position.set(spec.lx, 0.435, 0);
        slotGrp.visible = !used;
        grp.add(slotGrp);

        if (spec.itemType === 'weapon_variant') {
          let wMesh = (LRT.Weapons && typeof LRT.Weapons.buildWorldWeaponMesh === 'function')
            ? LRT.Weapons.buildWorldWeaponMesh(spec.weaponId, spec.variantId)
            : null;
          if (!wMesh) wMesh = buildFallbackWeaponMesh(spec.weaponId, spec.variantId);
          wMesh.rotation.y = Math.PI * 0.5;
          wMesh.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(wMesh);
          const sz = new THREE.Vector3();
          const ctr = new THREE.Vector3();
          box.getSize(sz);
          box.getCenter(ctr);
          const maxDim = Math.max(sz.x, sz.y, sz.z, 0.01);
          const fit = 0.42;
          const sc = maxDim > fit ? (fit / maxDim) : Math.min(1.0, 0.32 / maxDim);
          wMesh.scale.multiplyScalar(sc);
          wMesh.position.set(-ctr.x * sc, -box.min.y * sc + 0.006, -ctr.z * sc);
          slotGrp.add(wMesh);
        } else if (spec.itemType === 'ammo') {
          if (spec.ammoType === 'shotgun') {
            for (let sh = 0; sh < 4; sh++) {
              const szPos = -0.105 + sh * 0.07;
              addPbrPart(station, slotGrp, new THREE.CylinderGeometry(0.020, 0.020, 0.14, 8), redMat, -0.015, 0.022, szPos, 0, 0, Math.PI * 0.5);
              addPbrPart(station, slotGrp, new THREE.CylinderGeometry(0.021, 0.021, 0.032, 8), latchMat, 0.068, 0.022, szPos, 0, 0, Math.PI * 0.5);
            }
          } else {
            for (const [mx, mz, mry] of [[-0.055, -0.02, 0.16], [0.055, 0.02, 0.16]]) {
              addPbrPart(station, slotGrp, new THREE.BoxGeometry(0.075, 0.048, 0.24), gunMetalMat, mx, 0.026, mz, 0, mry, 0);
              addPbrPart(station, slotGrp, new THREE.CylinderGeometry(0.008, 0.011, 0.05, 6), latchMat, mx + 0.015, 0.052, mz + 0.08, Math.PI * 0.5, 0, 0);
            }
          }
        } else {
          addPbrPart(station, slotGrp, new THREE.BoxGeometry(0.24, 0.068, 0.28), whiteMat, 0, 0.036, 0);
          addPbrPart(station, slotGrp, new THREE.BoxGeometry(0.25, 0.018, 0.29), medGreenMat, 0, 0.062, 0);
          addPbrPart(station, slotGrp, new THREE.BoxGeometry(0.11, 0.014, 0.032), redMat, 0, 0.076, 0);
          addPbrPart(station, slotGrp, new THREE.BoxGeometry(0.032, 0.014, 0.11), redMat, 0, 0.076, 0);
        }

        const slotHalo = (LRT.Render && typeof LRT.Render.attachPerimeterHalo === 'function')
          ? LRT.Render.attachPerimeterHalo(slotGrp, { initialMode: 'off', thicknessScale: 0.78 })
          : null;
        const [sx, sy, sz] = slotWorldPos(spec.lx, 0);
        const slotRec = {
          slotIdx: spec.slotIdx,
          itemType: spec.itemType,
          weaponId: spec.weaponId,
          variantId: spec.variantId,
          ammoType: spec.ammoType,
          amount: spec.amount,
          label: spec.label,
          mesh: slotGrp,
          halo: slotHalo,
          taken: !!used,
          x: sx,
          y: sy,
          z: sz
        };
        items.push(slotRec);

        const slotInterId = id + '__slot_' + spec.slotIdx;
        station.interactables.push({
          id: slotInterId,
          type: 'lootbox_item',
          crateId: id,
          slotIdx: spec.slotIdx,
          x: sx,
          y: sy,
          z: sz,
          radius: 2.65,
          used: !!used,
          label: spec.label,
          prompt: spec.label,
          targetObj: slotGrp,
          _crateItemRef: slotRec
        });
      }

      const vis = {
        id: id,
        group: grp,
        lidPivot: lidPivot,
        halo: crateHalo,
        opened: !!used,
        used: !!used,
        x: lx,
        y: ly,
        z: lz,
        items: items
      };
      station._lootboxVisuals.push(vis);
      if (crateHalo) station._lootboxGlows.set(id, crateHalo.group);

      station._addCollider(lx - 0.58, ly, lz - 0.38, lx + 0.58, ly + 0.64, lz + 0.38, 'metal', {
        blocksWalk: true, blocksBullets: false
      });

      const tierTag = riskLuck >= 0.5 ? '(Risiko Tinggi — Senjata & Medis)' : '(Taktis — Senjata & Medis)';
      const lbl = used ? `[E] ${title} (Kosong)` : `[E / Klik] Buka ${title} ${tierTag}`;
      station.interactables.push({
        id: id,
        type: 'lootbox',
        riskLuck: riskLuck,
        x: lx,
        y: ly + 0.32,
        z: lz,
        radius: 2.85,
        label: lbl,
        prompt: lbl,
        opened: !!used,
        used: !!used,
        targetObj: grp,
        _crateVisual: vis
      });

      if (typeof station._registerHaloTarget === 'function') {
        station._registerHaloTarget(id, grp, {
          category: 'lootbox',
          x: lx,
          y: ly + 0.32,
          z: lz,
          hitRadius: 0.72,
          halo: crateHalo,
          isUsedFn: () => vis.opened || vis.used
        });
        for (let si = 0; si < items.length; si++) {
          const sr = items[si];
          station._registerHaloTarget(id + '__slot_' + sr.slotIdx, sr.mesh, {
            category: 'lootbox_item',
            x: sr.x,
            y: sr.y,
            z: sr.z,
            hitRadius: 0.24,
            halo: sr.halo,
            isUsedFn: () => !vis.opened || sr.taken
          });
        }
      }
    };

    const isLootboxSocketValid = (lx, ly, lz) => {
      if (ly < UPPER_FLOOR_Y - 0.5 && isInStairExclusion(lx, lz, 0.75, 0.75)) return false;
      for (let i = 0; i < station.interactables.length; i++) {
        const it = station.interactables[i];
        if (!it) continue;
        if (Math.abs((it.y || 0) - (ly + 0.55)) < 1.2 && Math.hypot(it.x - lx, it.z - lz) < 1.55) {
          return false;
        }
      }
      let hasFloor = false;
      for (let i = 0; i < station.colliders.length; i++) {
        const c = station.colliders[i];
        if (!c || c.disabled) continue;
        if (c.isFloor || c.tag === 'floor') {
          if (lx - 0.45 >= c.minX && lx + 0.45 <= c.maxX && lz - 0.45 >= c.minZ && lz + 0.45 <= c.maxZ) {
            if (Math.abs(c.maxY - ly) <= 0.15) hasFloor = true;
          }
          continue;
        }
        if (c.isRamp || c.tag === 'ramp') {
          if (lx + 0.65 > c.minX && lx - 0.65 < c.maxX && lz + 0.65 > c.minZ && lz - 0.65 < c.maxZ) {
            if (c.maxY > ly + 0.05 && c.minY < ly + 1.5) return false;
          }
          continue;
        }
        if (!c.blocksWalk || c.tag === 'interact') continue;
        if (c.maxY <= ly + 0.06 || c.minY >= ly + 1.25) continue;
        if (lx + 0.62 > c.minX && lx - 0.62 < c.maxX && lz + 0.62 > c.minZ && lz - 0.62 < c.maxZ) {
          return false;
        }
      }
      return hasFloor;
    };

    const socketPool = [];
    if (!isIsland) {
      socketPool.push(
        { id: 'sock_loket_corner', x: concMaxX - 2.6, y: 0.0, z: concMinZ + 1.25, ry: 0.0, riskLuck: 0.40, title: 'Peti Taktis Sudut Selatan' },
        { id: 'sock_under_jpo_stair', x: p1MinX + 1.25, y: 0.0, z: jpoZ > 0 ? jpoNearZ - 1.4 : jpoNearZ + 1.4, ry: Math.PI * 0.5, riskLuck: 0.44, title: 'Peti Taktis Bawah JPO' },
        { id: 'sock_jpo_west_overlook', x: -9.8, y: UPPER_FLOOR_Y, z: jpoZ + (jpoZ > 0 ? 1.2 : -1.2), ry: 0.0, riskLuck: 0.52, title: 'Peti Taktis JPO Barat' },
        { id: 'sock_balcony_overlook', x: concMinX + 1.25, y: UPPER_FLOOR_Y, z: concMidZ - 4.2, ry: Math.PI * 0.5, riskLuck: 0.32, title: 'Peti Taktis Balkon Concourse' },
        { id: 'sock_p2_far_south', x: p2MinX + 1.4, y: 0.0, z: platMinZ + 9.5, ry: Math.PI * 0.5, riskLuck: 0.70, title: 'Peti Taktis Ujung Peron 2' },
        { id: 'sock_p2_far_north', x: p2MinX + 1.4, y: 0.0, z: platMaxZ - 11.5, ry: Math.PI * 0.5, riskLuck: 0.64, title: 'Peti Taktis Peron 2 Utara' },
        { id: 'sock_concourse_shutter', x: concMinX + 1.4, y: 0.0, z: concMaxZ - 2.4, ry: Math.PI * 0.5, riskLuck: 0.36, title: 'Peti Taktis Sudut Concourse' }
      );
      if (arch.id === 'cikoko' || arch.hasTollOverpass) {
        socketPool.push({ id: 'sock_cikoko_skywalk', x: p1MaxX - 1.3, y: 0.0, z: platMinZ + 9.0, ry: -Math.PI * 0.5, riskLuck: 0.74, title: 'Peti Taktis Sayap Cikoko' });
      } else if (jpo2Z !== null) {
        socketPool.push({ id: 'sock_jpo2_span', x: -5.2, y: UPPER_FLOOR_Y, z: jpo2Z, ry: 0.0, riskLuck: 0.60, title: 'Peti Taktis JPO Sekunder' });
      }
    } else if (isCawang) {
      socketPool.push(
        { id: 'sock_cawang_i1_alcove', x: p1MaxX - 1.8, y: 0.0, z: -48.0, ry: -Math.PI * 0.5, riskLuck: 0.52, title: 'Peti Taktis Peron 1 Cawang' },
        { id: 'sock_cawang_i1_north', x: p1MinX + 2.2, y: 0.0, z: platMaxZ - 10.0, ry: Math.PI * 0.5, riskLuck: 0.56, title: 'Peti Taktis Ujung Utara Cawang' },
        { id: 'sock_cawang_jpo_mezz', x: jpoCX + 2.0, y: UPPER_FLOOR_Y, z: jpoZ + 5.5, ry: Math.PI, riskLuck: 0.40, title: 'Peti Taktis Mezzanine JPO Cawang' },
        { id: 'sock_cawang_jpo_east', x: i2MinX + 2.2, y: UPPER_FLOOR_Y, z: jpoZ - 6.0, ry: 0.0, riskLuck: 0.48, title: 'Peti Taktis Skybridge Cawang' },
        { id: 'sock_cawang_wreck_near', x: i2MaxX - 2.0, y: 0.0, z: -12.0, ry: -Math.PI * 0.5, riskLuck: 0.74, title: 'Peti Taktis Bangkai Kereta Cawang' },
        { id: 'sock_cawang_wreck_opp', x: i2MaxX - 2.0, y: 0.0, z: -48.0, ry: -Math.PI * 0.5, riskLuck: 0.68, title: 'Peti Taktis Ujung Peron 4 Cawang' },
        { id: 'sock_cawang_i2_north', x: i2MinX + 2.2, y: 0.0, z: 48.0, ry: Math.PI * 0.5, riskLuck: 0.62, title: 'Peti Taktis Peron 4 Utara Cawang' }
      );
    } else if (arch.hasDepotShed) {
      socketPool.push(
        { id: 'sock_harja_depot_deep', x: depotMaxX - 2.5, y: 0.0, z: 58.5, ry: -Math.PI * 0.5, riskLuck: 0.78, title: 'Peti Taktis Gudang Depo' },
        { id: 'sock_harja_depot_west', x: -4.2, y: 0.0, z: 45.0, ry: Math.PI * 0.5, riskLuck: 0.64, title: 'Peti Taktis Jalur Barat Depo' },
        { id: 'sock_harja_garden_corner', x: gardenMaxX - 2.4, y: 0.0, z: -48.5, ry: -Math.PI * 0.5, riskLuck: 0.72, title: 'Peti Taktis Sudut Kebun Atap' },
        { id: 'sock_harja_garden_north', x: track2X + 4.2, y: 0.0, z: -18.5, ry: Math.PI, riskLuck: 0.54, title: 'Peti Taktis Teras Kebun Utara' },
        { id: 'sock_harja_south_term', x: (p1MinX + p1MaxX) * 0.5, y: 0.0, z: platMinZ + 9.0, ry: 0.0, riskLuck: 0.58, title: 'Peti Taktis Terminus Harjamukti' },
        { id: 'sock_harja_jpo_deck', x: jpoCX - 1.8, y: UPPER_FLOOR_Y, z: jpoZ + 1.2, ry: 0.0, riskLuck: 0.36, title: 'Peti Taktis JPO Harjamukti' },
        { id: 'sock_harja_rotio_back', x: (p1MinX + p1MaxX) * 0.5, y: 0.0, z: rotioZ - 2.35, ry: Math.PI, riskLuck: 0.40, title: 'Peti Taktis Kios Harjamukti' }
      );
    } else {
      // ISLAND_CENTRAL (Setiabudi)
      socketPool.push(
        { id: 'sock_island_rotio_spine', x: (p1MinX + p1MaxX) * 0.5, y: 0.0, z: rotioZ - 2.35, ry: Math.PI, riskLuck: 0.36, title: "Peti Taktis Belakang Roti'O" },
        { id: 'sock_island_indo_spine', x: p1MinX + 1.8, y: 0.0, z: indoZ + 2.6, ry: Math.PI * 0.5, riskLuck: 0.42, title: 'Peti Taktis Sayap Indomaret' },
        { id: 'sock_island_south_bay', x: (p1MinX + p1MaxX) * 0.5, y: 0.0, z: platMinZ + 8.5, ry: 0.0, riskLuck: 0.68, title: 'Peti Taktis Ujung Selatan Setiabudi' },
        { id: 'sock_island_north_bay', x: p1MaxX - 2.0, y: 0.0, z: platMaxZ - 9.5, ry: -Math.PI * 0.5, riskLuck: 0.64, title: 'Peti Taktis Ujung Utara Setiabudi' },
        { id: 'sock_island_jpo_relay', x: jpoCX - 2.0, y: UPPER_FLOOR_Y, z: jpoZ + 1.2, ry: 0.0, riskLuck: 0.46, title: 'Peti Taktis Relai JPO Setiabudi' },
        { id: 'sock_island_mid_east', x: p1MaxX - 1.7, y: 0.0, z: -26.0, ry: -Math.PI * 0.5, riskLuck: 0.50, title: 'Peti Taktis Peron Timur Setiabudi' }
      );
      if (jpo2Z !== null) {
        socketPool.push({ id: 'sock_island_jpo2', x: p1MinX + 2.4, y: UPPER_FLOOR_Y, z: jpo2Z, ry: Math.PI * 0.5, riskLuck: 0.58, title: 'Peti Taktis JPO Selatan' });
      }
    }

    const validSockets = [];
    for (let i = 0; i < socketPool.length; i++) {
      const sk = socketPool[i];
      if (isLootboxSocketValid(sk.x, sk.y, sk.z)) validSockets.push(sk);
    }
    // Deterministic Fisher-Yates shuffle seeded by station rng
    for (let i = validSockets.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmpSk = validSockets[i];
      validSockets[i] = validSockets[j];
      validSockets[j] = tmpSk;
    }

    const crateTarget = rng() < 0.45 ? 3 : 2;
    const chosenSockets = [];
    const lowRiskPick = validSockets.find((s) => s.riskLuck < 0.52);
    const highRiskPick = validSockets.find((s) => s.riskLuck >= 0.52 && s !== lowRiskPick);
    if (lowRiskPick) chosenSockets.push(lowRiskPick);
    if (highRiskPick && chosenSockets.length < crateTarget) chosenSockets.push(highRiskPick);
    for (let i = 0; i < validSockets.length && chosenSockets.length < crateTarget; i++) {
      const cand = validSockets[i];
      if (chosenSockets.indexOf(cand) >= 0) continue;
      const tooClose = chosenSockets.some((sel) => Math.hypot(sel.x - cand.x, sel.z - cand.z) < 8.0 && Math.abs(sel.y - cand.y) < 1.5);
      if (!tooClose) chosenSockets.push(cand);
    }
    if (chosenSockets.length > 0) {
      for (let i = 0; i < chosenSockets.length; i++) {
        const sk = chosenSockets[i];
        placeLootbox('station_' + sk.id, sk.x, sk.y, sk.z, sk.ry, sk.riskLuck, sk.title);
      }
    } else {
      const balLootX = isIsland ? (jpoCX - 1.8) : (concMinX + 1.2);
      const balLootZ = isIsland ? (jpoZ + 1.2) : (concMidZ - 4.0);
      placeLootbox('station_balcony_lootbox', balLootX, UPPER_FLOOR_Y, balLootZ, isIsland ? 0.0 : Math.PI * 0.5, 0.30, 'Peti Taktis Balkon');
    }

  }

  function buildExplosiveBarrels(station, ctx) {
    const { arch, depotMaxX } = ctx;
    station.explosiveBarrels = [];
    station._barrelCueVisual = null;
    if (arch.hasDepotShed) {
      const addExplosiveBarrel = (id, bx, bz, rotY) => {
        const mesh = station._placeNormalizedModel('Barrel_01', bx, 0.0, bz, rotY, 0.90, null, 'barrel');
        const cIdx = station.colliders.length - 1;
        const col = station.colliders[cIdx];
        if (col) col.barrelId = id;

        const halo = (mesh && LRT.Render && typeof LRT.Render.attachPerimeterHalo === 'function')
          ? LRT.Render.attachPerimeterHalo(mesh, {
              color: 0xf97316,
              hoverColor: 0xfacc15,
              objectiveColor: 0xfde047,
              initialMode: 'subtle'
            })
          : null;

        station.explosiveBarrels.push({
          id: id,
          x: bx,
          y: 0.0,
          z: bz,
          hp: 35,
          exploded: false,
          mesh: mesh,
          colliderIdx: cIdx,
          halo: halo
        });
      };

      addExplosiveBarrel(0, depotMaxX - 1.3, 41.0, 0.0);
      addExplosiveBarrel(1, depotMaxX - 1.3, 50.0, 1.2);
    }

  }

  S.loreLoot = {
    getFieldLogPropAssets,
    placeFieldLogProp,
    buildFieldLogProps,
    buildPelicanLootboxes,
    buildExplosiveBarrels
  };
})(window.LRT = window.LRT || {});
