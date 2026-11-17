(function (LRT) {
  'use strict';

  window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {};
  const S = (window.__LRT_INTERNAL__.station = window.__LRT_INTERNAL__.station || {});
  const _pooledStationLights = [];

  function createKaiCabinetTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#a3287b');
    grad.addColorStop(0.45, '#7c2988');
    grad.addColorStop(1, '#51206b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, 0, 128, 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Access', 64, 72);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#f3d8f7';
    ctx.fillText('by KAI', 64, 92);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(18, 108, 92, 3);
    ctx.fillStyle = 'rgba(20,24,34,0.38)';
    for (let y = 148; y < 224; y += 12) {
      ctx.fillRect(24, y, 80, 5);
    }
    const tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  function buildKaiTurnstileBank(station, ctx, gateBaseX, gateZStart, numGates, isIsland) {
    const { root, isInStairExclusion } = ctx;
    if (!root) return [];
    station._turnstileGates = station._turnstileGates || [];

    const kaiTex = createKaiCabinetTexture();
    station.disposableTextures.push(kaiTex);

    const kaiBodyMat = new THREE.MeshStandardMaterial({
      map: kaiTex,
      roughness: 0.34,
      metalness: 0.24
    });
    const stainlessMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde3,
      roughness: 0.22,
      metalness: 0.88
    });
    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.42,
      metalness: 0.55
    });
    const readerGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0b1524,
      roughness: 0.12,
      metalness: 0.40,
      emissive: 0x0891b2,
      emissiveIntensity: 0.55
    });
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.05
    });
    const guardGlassMat = new THREE.MeshStandardMaterial({
      color: 0xb6e3ff,
      roughness: 0.10,
      metalness: 0.16,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    station.disposableMaterials.push(kaiBodyMat, stainlessMat, darkTrimMat, readerGlassMat, rubberMat, guardGlassMat);

    // Chamfered cabinet profile (length 1.26m along X, height 0.90m above plinth)
    const cabShape = new THREE.Shape();
    cabShape.moveTo(-0.63, 0.0);
    cabShape.lineTo(0.63, 0.0);
    cabShape.lineTo(0.63, 0.72);
    cabShape.lineTo(0.45, 0.90);
    cabShape.lineTo(-0.45, 0.90);
    cabShape.lineTo(-0.63, 0.72);
    cabShape.closePath();

    const cabBodyGeo = new THREE.ExtrudeGeometry(cabShape, {
      depth: 0.21,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.010,
      bevelSegments: 2
    });
    cabBodyGeo.translate(0, 0.055, -0.105);
    cabBodyGeo.computeVertexNormals();
    {
      const posAttr = cabBodyGeo.attributes.position;
      const normAttr = cabBodyGeo.attributes.normal;
      const uvAttr = cabBodyGeo.attributes.uv;
      if (posAttr && normAttr && uvAttr) {
        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const nz = normAttr.getZ(i);
          const v = Math.max(0.02, Math.min(0.98, (vy - 0.055) / 0.90));
          if (Math.abs(nz) > 0.65) {
            const u = Math.max(0.02, Math.min(0.98, ((nz > 0 ? vx : -vx) / 1.26) + 0.5));
            uvAttr.setXY(i, u, v);
          } else {
            uvAttr.setXY(i, 0.04, v);
          }
        }
        uvAttr.needsUpdate = true;
      }
    }

    const plinthGeo = new THREE.BoxGeometry(1.32, 0.055, 0.27);
    const topBezelGeo = new THREE.BoxGeometry(0.92, 0.032, 0.245);
    const sideTrimGeo = new THREE.BoxGeometry(0.25, 0.022, 0.245);
    const readerBezelGeo = new THREE.BoxGeometry(0.22, 0.022, 0.205);
    const readerGlassGeo = new THREE.BoxGeometry(0.165, 0.014, 0.155);
    const bossGeo = new THREE.CylinderGeometry(0.088, 0.102, 0.048, 16);
    bossGeo.rotateX(Math.PI * 0.5);
    const hubGeo = new THREE.CylinderGeometry(0.068, 0.088, 0.082, 16);
    hubGeo.rotateX(Math.PI * 0.5);
    const hubCapGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.022, 14);
    hubCapGeo.rotateX(Math.PI * 0.5);
    const armGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.50, 10);
    const tipGeo = new THREE.CylinderGeometry(0.020, 0.019, 0.048, 10);
    const ledFaceGeo = new THREE.BoxGeometry(0.014, 0.095, 0.095);
    const ledArrowBarGeo = new THREE.BoxGeometry(0.018, 0.052, 0.016);
    const ledStripGeo = new THREE.BoxGeometry(0.145, 0.010, 0.024);

    const railPostGeo = new THREE.CylinderGeometry(0.026, 0.028, 0.96, 10);
    const railBarGeo = new THREE.CylinderGeometry(0.020, 0.020, 1.24, 10);
    railBarGeo.rotateZ(Math.PI * 0.5);
    const railGlassGeo = new THREE.BoxGeometry(1.16, 0.68, 0.016);

    station.disposableGeometries.push(
      cabBodyGeo, plinthGeo, topBezelGeo, sideTrimGeo, readerBezelGeo, readerGlassGeo,
      bossGeo, hubGeo, hubCapGeo, armGeo, tipGeo, ledFaceGeo, ledArrowBarGeo, ledStripGeo,
      railPostGeo, railBarGeo, railGlassGeo
    );

    const bankGroup = new THREE.Group();
    bankGroup.name = 'AccessByKaiTurnstileBank';
    root.add(bankGroup);

    const yaw = isIsland ? Math.PI * 0.5 : 0;
    const step = 1.05;
    const turnstileList = [];

    for (let g = 0; g < numGates; g++) {
      const gz = gateZStart + g * step;
      const gx = isIsland ? gateBaseX + g * step : gateBaseX;
      const tz = isIsland ? 2.5 : gz;

      station._addCollider(
        gx - (isIsland ? 0.14 : 0.65), 0, tz - (isIsland ? 0.65 : 0.14),
        gx + (isIsland ? 0.14 : 0.65), 1.05, tz + (isIsland ? 0.65 : 0.14), 'metal'
      );

      const cab = new THREE.Group();
      cab.position.set(gx, 0, tz);
      cab.rotation.y = yaw;
      bankGroup.add(cab);

      const plinth = new THREE.Mesh(plinthGeo, stainlessMat);
      plinth.position.y = 0.0275;
      plinth.receiveShadow = true;
      cab.add(plinth);

      const body = new THREE.Mesh(cabBodyGeo, kaiBodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      cab.add(body);

      const topDeck = new THREE.Mesh(topBezelGeo, stainlessMat);
      topDeck.position.y = 0.965;
      cab.add(topDeck);

      for (const sgn of [-1, 1]) {
        const slopeTrim = new THREE.Mesh(sideTrimGeo, stainlessMat);
        slopeTrim.position.set(sgn * 0.54, 0.865, 0);
        slopeTrim.rotation.z = -sgn * Math.PI * 0.25;
        cab.add(slopeTrim);

        const rBezel = new THREE.Mesh(readerBezelGeo, darkTrimMat);
        rBezel.position.set(sgn * 0.535, 0.882, 0);
        rBezel.rotation.z = -sgn * Math.PI * 0.25;
        cab.add(rBezel);

        const rGlass = new THREE.Mesh(readerGlassGeo, readerGlassMat);
        rGlass.position.set(sgn * 0.542, 0.889, 0);
        rGlass.rotation.z = -sgn * Math.PI * 0.25;
        cab.add(rGlass);
      }

      if (g < numGates - 1) {
        const lx = isIsland ? gx + 0.52 : gx;
        const lz = isIsland ? tz : tz + 0.52;
        const tid = 'turnstile_' + g;

        // Per-gate LED material (amber-cyan ready -> emerald green on tap)
        const ledMat = new THREE.MeshStandardMaterial({
          color: 0x22d3ee,
          emissive: 0xf59e0b,
          emissiveIntensity: 1.35,
          roughness: 0.22,
          metalness: 0.15
        });
        station.disposableMaterials.push(ledMat);

        for (const sgn of [-1, 1]) {
          const panelBack = new THREE.Mesh(ledFaceGeo, darkTrimMat);
          panelBack.position.set(sgn * 0.635, 0.63, 0);
          cab.add(panelBack);

          // Glowing status chevron arrow + reader strip
          const barA = new THREE.Mesh(ledArrowBarGeo, ledMat);
          barA.position.set(sgn * 0.642, 0.642, -0.015);
          barA.rotation.x = Math.PI * 0.25;
          cab.add(barA);

          const barB = new THREE.Mesh(ledArrowBarGeo, ledMat);
          barB.position.set(sgn * 0.642, 0.642, 0.015);
          barB.rotation.x = -Math.PI * 0.25;
          cab.add(barB);

          const topStrip = new THREE.Mesh(ledStripGeo, ledMat);
          topStrip.position.set(sgn * 0.48, 0.945, 0);
          topStrip.rotation.z = -sgn * Math.PI * 0.25;
          cab.add(topStrip);
        }

        // Side mounting flange & tilted 3-arm chrome tripod rotor (+Z lane side)
        const boss = new THREE.Mesh(bossGeo, stainlessMat);
        boss.position.set(0, 0.75, 0.125);
        cab.add(boss);

        const rotorPivot = new THREE.Group();
        rotorPivot.position.set(0, 0.75, 0.155);
        rotorPivot.rotation.x = Math.PI * 0.25;
        cab.add(rotorPivot);

        const rotorSpinGroup = new THREE.Group();
        rotorSpinGroup.name = tid + '_Rotor';
        rotorPivot.add(rotorSpinGroup);

        const hub = new THREE.Mesh(hubGeo, stainlessMat);
        rotorSpinGroup.add(hub);
        const cap = new THREE.Mesh(hubCapGeo, darkTrimMat);
        cap.position.z = 0.045;
        rotorSpinGroup.add(cap);

        const invSqrt2 = Math.SQRT1_2;
        for (let a = 0; a < 3; a++) {
          const armSlot = new THREE.Group();
          armSlot.rotation.z = a * ((Math.PI * 2) / 3);
          rotorSpinGroup.add(armSlot);

          const arm = new THREE.Mesh(armGeo, stainlessMat);
          arm.position.set(0, 0.25 * invSqrt2, 0.25 * invSqrt2);
          arm.rotation.x = Math.PI * 0.25;
          armSlot.add(arm);

          const tip = new THREE.Mesh(tipGeo, rubberMat);
          tip.position.set(0, 0.505 * invSqrt2, 0.505 * invSqrt2);
          tip.rotation.x = Math.PI * 0.25;
          armSlot.add(tip);
        }

        station._turnstileGates.push({
          id: tid,
          rotorSpinGroup: rotorSpinGroup,
          baseAngle: 0,
          startAngle: 0,
          targetAngle: 0,
          animElapsed: 0,
          animDuration: 0.42,
          animating: false,
          ledMat: ledMat,
          ledTimer: 0,
          ledDuration: 1.2
        });

        turnstileList.push({ x: lx, z: lz, id: tid, yaw: yaw });
        station.interactables.push({
          id: tid, type: 'turnstile', x: lx, y: 0.9, z: lz,
          label: '[E] Tap Kartu Elektronik (Access by KAI)',
          prompt: '[E] Tap Kartu Elektronik (Access by KAI)', used: false
        });
      }
    }

    // Sleek stainless-steel & tempered glass end-guardrails flanking both ends of the turnstile bank
    const addEndGuardrail = (endSign) => {
      const endGateIdx = endSign < 0 ? 0 : (numGates - 1);
      const baseGX = isIsland ? (gateBaseX + endGateIdx * step) : gateBaseX;
      const baseTZ = isIsland ? 2.5 : (gateZStart + endGateIdx * step);
      const off = endSign * 0.74;
      const rx = isIsland ? baseGX + off : baseGX;
      const rz = isIsland ? baseTZ : baseTZ + off;
      if (isInStairExclusion && isInStairExclusion(rx, rz, 0.5, 0.5)) return;

      const railGrp = new THREE.Group();
      railGrp.position.set(rx, 0, rz);
      // Align railing length along the bank line (Z for !isIsland, X for isIsland)
      railGrp.rotation.y = isIsland ? 0 : Math.PI * 0.5;
      bankGroup.add(railGrp);

      for (const px of [-0.58, 0.58]) {
        const post = new THREE.Mesh(railPostGeo, stainlessMat);
        post.position.set(px, 0.48, 0);
        railGrp.add(post);
      }
      const topRail = new THREE.Mesh(railBarGeo, stainlessMat);
      topRail.position.set(0, 0.95, 0);
      railGrp.add(topRail);
      const botRail = new THREE.Mesh(railBarGeo, stainlessMat);
      botRail.position.set(0, 0.16, 0);
      railGrp.add(botRail);
      const glassPane = new THREE.Mesh(railGlassGeo, guardGlassMat);
      glassPane.position.set(0, 0.55, 0);
      railGrp.add(glassPane);

      station._addCollider(
        rx - (isIsland ? 0.62 : 0.10), 0, rz - (isIsland ? 0.10 : 0.62),
        rx + (isIsland ? 0.62 : 0.10), 1.02, rz + (isIsland ? 0.10 : 0.62), 'metal', { blocksBullets: false }
      );
    };
    addEndGuardrail(-1);
    addEndGuardrail(1);

    return turnstileList;
  }

  function getFieldLogPropAssets(station) {
    if (station._fieldLogPropAssets) return station._fieldLogPropAssets;
    const folderGeo = new THREE.BoxGeometry(0.26, 0.012, 0.33);
    const tabGeo = new THREE.BoxGeometry(0.08, 0.012, 0.032);
    const paperGeo = new THREE.BoxGeometry(0.22, 0.010, 0.29);
    const lineGeo = new THREE.BoxGeometry(0.145, 0.004, 0.012);
    const stampGeo = new THREE.BoxGeometry(0.044, 0.004, 0.026);
    const glintGeo = new THREE.PlaneGeometry(0.46, 0.46);
    glintGeo.rotateX(-Math.PI * 0.5);

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

    station.disposableGeometries.push(folderGeo, tabGeo, paperGeo, lineGeo, stampGeo, glintGeo);
    station.disposableMaterials.push(folderMat, paperMat, inkMat, stampMat);

    station._fieldLogPropAssets = {
      folderGeo, tabGeo, paperGeo, lineGeo, stampGeo, glintGeo,
      folderMat, paperMat, inkMat, stampMat
    };
    return station._fieldLogPropAssets;
  }

  function placeFieldLogProp(station, root, id, x, y, z, ry, used) {
    if (!root) return;
    const a = getFieldLogPropAssets(station);
    station._fieldLogGlints = station._fieldLogGlints || [];

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

    const glintMat = new THREE.MeshBasicMaterial({
      color: 0xffd27d,
      transparent: true,
      opacity: 0.30,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    station.disposableMaterials.push(glintMat);
    const glint = new THREE.Mesh(a.glintGeo, glintMat);
    glint.position.set(0, 0.004, 0);
    glint.visible = !used;
    grp.add(glint);

    station._fieldLogGlints.push({
      id: id,
      mesh: glint,
      mat: glintMat,
      used: !!used
    });
  }

  function buildStallsAndTubes(station, ctx) {
    const { UPPER_FLOOR_Y } = S.CONST;
    const { addBox, addAtlasBox, addAtlasQuad } = S;
    const {
      arch, STALL_UV, SIGN_UV, buckets, glassRecords, isInStairExclusion,
      isIsland, isCawang, p1MinX, p1MaxX, p2MaxX,
      concMinX, concMaxX, concMinZ, concMaxZ, concMidZ, cw, concLen,
      platMinZ, platMaxZ, getCanopyArchY,
      stairX, stairFootZ, jpoZ, jpoDepth, jpoCX, jpoPergolaY, jpo2Z, jpo2CX,
      cStairX, cStairFootZ, cStairTopZ, eaveY, i2MinX
    } = ctx;

    const { bTruss, bSteelDark, bStall, bSign } = buckets;

    // =========================================================
    // 6. COMMERCIAL STALLS, HERO ROTI'O KIOSK, TURNSTILES & AMENITIES
    // =========================================================
    const rotioX = isIsland ? (p1MinX + p1MaxX) * 0.5 : concMinX + 4.8;
    const rotioZ = isIsland ? -8.5 : concMinZ + 2.2;
    const rotioYaw = 0;

    const buildRotioKiosk = (kx, kz, yaw) => {
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const toWorld = (lx, lz) => [kx + lx * cos + lz * sin, kz - lx * sin + lz * cos];

      addAtlasBox(bStall, 3.35, 0.92, 0.65, toWorld(0, 0.85)[0], 0.46, toWorld(0, 0.85)[1], yaw, null, STALL_UV.rotioSlatsOnly);
      addBox(bTruss, 3.45, 0.08, 0.74, toWorld(0, 0.85)[0], 0.95, toWorld(0, 0.85)[1], 0, yaw, 0);
      addAtlasBox(bStall, 0.24, 2.75, 2.35, toWorld(-1.55, 0)[0], 1.38, toWorld(-1.55, 0)[1], yaw,
        { 0: STALL_UV.rotioMedallion, 1: STALL_UV.rotioMedallion }, STALL_UV.rotioCreamSolid);
      addAtlasBox(bStall, 3.35, 2.75, 0.24, toWorld(0, -1.05)[0], 1.38, toWorld(0, -1.05)[1], yaw, null, STALL_UV.rotioSubwayTile);
      addAtlasBox(bStall, 2.36, 0.84, 0.12, toWorld(0.15, -0.88)[0], 1.76, toWorld(0.15, -0.88)[1], yaw,
        { 4: STALL_UV.rotioMenuBoard, 5: STALL_UV.rotioMenuBoard }, STALL_UV.rotioCreamSolid);
      addAtlasBox(bStall, 3.55, 0.68, 2.45, kx, 2.54, kz, yaw,
        { 0: STALL_UV.rotioSignTop, 1: STALL_UV.rotioSignTop, 4: STALL_UV.rotioSignTop, 5: STALL_UV.rotioSignTop },
        STALL_UV.rotioSlatsOnly);
      addAtlasBox(bStall, 1.15, 0.16, 0.48, toWorld(-0.45, 0.86)[0], 1.08, toWorld(-0.45, 0.86)[1], yaw, null, STALL_UV.rotioBuns);
      addAtlasBox(bStall, 0.56, 0.88, 0.48, toWorld(1.05, 0.85)[0], 1.44, toWorld(1.05, 0.85)[1], yaw,
        { 4: STALL_UV.indomaretCooler, 5: STALL_UV.indomaretCooler }, STALL_UV.indomaretCooler);

      const hw = Math.abs(cos) * 1.75 + Math.abs(sin) * 1.25;
      const hd = Math.abs(sin) * 1.75 + Math.abs(cos) * 1.25;
      station._addCollider(kx - hw, 0, kz - hd, kx + hw, 2.85, kz + hd, 'wood');

      const pDisp = toWorld(-0.45, 1.15);
      const cDisp = station._addCollider(pDisp[0] - 0.6, 0.98, pDisp[1] - 0.1, pDisp[0] + 0.6, 1.60, pDisp[1] + 0.1, 'glass', { blocksWalk: false });
      glassRecords.push({
        cx: pDisp[0], cy: 1.28, cz: pDisp[1], w: 1.18, h: 0.54, d: 0.04,
        ry: yaw, hp: 16, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cDisp
      });
      const pFridge = toWorld(1.05, 1.12);
      const cFridge = station._addCollider(pFridge[0] - 0.3, 1.0, pFridge[1] - 0.1, pFridge[0] + 0.3, 1.90, pFridge[1] + 0.1, 'glass', { blocksWalk: false });
      glassRecords.push({
        cx: pFridge[0], cy: 1.44, cz: pFridge[1], w: 0.54, h: 0.84, d: 0.04,
        ry: yaw, hp: 18, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cFridge
      });

      const pFront = toWorld(0, 1.45);
      const rotioUsed = station._usedIds.has('rotio_counter');
      station.interactables.push({
        id: 'rotio_counter', type: 'rotio',
        x: pFront[0], y: 1.1, z: pFront[1],
        label: rotioUsed ? "[E] Etalase Roti'O Coffee Bun (Kosong)" : "[E] Ambil Roti'O Coffee Bun Hangat (+25 HP)",
        prompt: rotioUsed ? "[E] Etalase Roti'O Coffee Bun (Kosong)" : "[E] Ambil Roti'O Coffee Bun Hangat (+25 HP)",
        used: rotioUsed
      });
      if (arch.id === 'dukuh_atas') {
        const pNote = toWorld(0.15, 0.95);
        placeFieldLogProp(station, ctx.root, 'rotio_counter', pNote[0], 0.995, pNote[1], yaw + 0.16, rotioUsed);
      }
    };

    buildRotioKiosk(rotioX, rotioZ, rotioYaw);

    const indoX = isIsland ? (p1MinX + p1MaxX) * 0.5 : concMaxX - 2.1;
    const indoZ = isIsland ? 12.5 : concMaxZ - 3.6;
    const indoYaw = isIsland ? 0 : -Math.PI * 0.5;
    addAtlasBox(bStall, 5.4, 0.72, 2.2, indoX, 2.55, indoZ, indoYaw, null, STALL_UV.indomaretHeader);
    addBox(bSteelDark, 5.2, 2.15, 0.85, indoX + (isIsland ? 0 : 0.7), 1.08, indoZ, 0, indoYaw, 0);
    for (let cb = -1; cb <= 1; cb += 2) {
      const off = cb * 1.28;
      const bx = isIsland ? indoX + off : indoX + 0.7;
      const bz = isIsland ? indoZ : indoZ - off;
      addAtlasBox(bStall, 2.48, 2.02, 0.88, bx, 1.08, bz, indoYaw,
        { 4: STALL_UV.indomaretCooler, 5: STALL_UV.indomaretCooler }, STALL_UV.rotioCreamSolid);
    }
    station._addCollider(indoX - 1.5, 0, indoZ - 2.6, indoX + 1.5, 2.9, indoZ + 2.6, 'metal');
    for (let cg = -1; cg <= 1; cg++) {
      const gx = isIsland ? indoX + cg * 1.65 : indoX - 0.45;
      const gz = isIsland ? indoZ + 0.5 : indoZ + cg * 1.65;
      const cid = station._addCollider(gx - 0.5, 0.2, gz - 0.5, gx + 0.5, 2.0, gz + 0.5, 'glass', { blocksWalk: false });
      glassRecords.push({
        cx: gx, cy: 1.15, cz: gz, w: 1.45, h: 1.85, d: 0.04,
        ry: indoYaw, hp: 20, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cid
      });
    }

    // Access by KAI Turnstiles (chamfered purple cabinets, brushed stainless plinth/bezel, angled RFID reader, 3-arm chrome tripod)
    const gateBaseX = isIsland ? (p1MinX + 2.2) : (concMinX + 2.2);
    const gateZStart = isIsland ? 2.0 : (concMidZ - 6.5);
    const numGates = isIsland ? 4 : 6;
    const turnstileList = buildKaiTurnstileBank(station, ctx, gateBaseX, gateZStart, numGates, isIsland);

    let lkX = null, lkZ = null, shX = null, shZ = null;
    if (!isIsland) {
      lkX = concMaxX - 1.35;
      lkZ = concMinZ + 3.2;
      addAtlasBox(bStall, 3.8, 2.7, 1.8, lkX, 1.35, lkZ, -Math.PI * 0.5, null, STALL_UV.loketWood);
      addAtlasBox(bSign, 3.9, 0.65, 1.9, lkX, 2.75, lkZ, -Math.PI * 0.5, null, SIGN_UV.loketHeader);
      addBox(bSteelDark, 0.36, 0.05, 1.40, lkX - 1.02, 0.99, lkZ);
      station._addCollider(lkX - 1.0, 0, lkZ - 2.0, lkX + 1.0, 2.9, lkZ + 2.0, 'wood');

      const loketUsed = station._usedIds.has('loket_counter');
      station.interactables.push({
        id: 'loket_counter',
        type: 'field_log',
        x: lkX - 1.2,
        y: 1.1,
        z: lkZ,
        label: loketUsed ? '[E] Meja Loket Stasiun (Sudah Diperiksa)' : '[E] Periksa Buku Catatan Loket Tiket',
        prompt: loketUsed ? '[E] Meja Loket Stasiun (Sudah Diperiksa)' : '[E] Periksa Buku Catatan Loket Tiket',
        used: loketUsed
      });
      placeFieldLogProp(station, ctx.root, 'loket_counter', lkX - 1.02, 1.02, lkZ + 0.16, -Math.PI * 0.5 + 0.14, loketUsed);

      shX = concMinX + 7.8;
      shZ = concMaxZ - 1.45;
      addAtlasBox(bStall, 2.4, 2.55, 2.1, shX, 1.28, shZ, 0, null, STALL_UV.shutter260);
      station._addCollider(shX - 1.2, 0, shZ - 1.1, shX + 1.2, 2.6, shZ + 1.1, 'metal');
    }

    const jakX = isIsland ? p1MaxX - 2.0 : concMinX + 3.8;
    const jakZ = isIsland ? -16.0 : concMaxZ - 1.8;
    addAtlasBox(bStall, 0.85, 2.05, 0.65, jakX, 1.02, jakZ, 0, null, STALL_UV.jaklingko);
    const jakTrayZ = isIsland ? (jakZ + 0.44) : (jakZ - 0.44);
    addBox(bSteelDark, 0.56, 0.04, 0.30, jakX, 1.02, jakTrayZ);
    station._addCollider(jakX - 0.45, 0, jakZ - 0.35, jakX + 0.45, 2.05, jakZ + 0.35, 'metal');
    const jakUsed = station._usedIds.has('jaklingko_kiosk');
    station.interactables.push({
      id: 'jaklingko_kiosk', type: 'jaklingko', x: jakX, y: 1.2, z: jakZ,
      label: jakUsed ? '[E] Terminal JakLingko (Sudah Diambil)' : '[E] Top-Up KUE / JakLingko Terminal (+Amunisi)',
      prompt: jakUsed ? '[E] Terminal JakLingko (Sudah Diambil)' : '[E] Top-Up KUE / JakLingko Terminal (+1 Magazin)',
      used: jakUsed
    });
    placeFieldLogProp(station, ctx.root, 'jaklingko_kiosk', jakX, 1.045, jakTrayZ, isIsland ? 0.12 : Math.PI + 0.12, jakUsed);

    const cowX = isIsland ? p1MaxX - 2.0 : concMinX + 5.4;
    const cowZ = isIsland ? -13.5 : concMaxZ - 1.8;
    addAtlasBox(bStall, 1.15, 1.95, 0.65, cowX, 0.98, cowZ, 0, null, STALL_UV.coway);
    station._addCollider(cowX - 0.6, 0, cowZ - 0.35, cowX + 0.6, 1.95, cowZ + 0.35, 'metal');
    const cowUsed = station._usedIds.has('coway_water');
    station.interactables.push({
      id: 'coway_water', type: 'coway', x: cowX, y: 1.1, z: cowZ,
      label: cowUsed ? '[E] Dispenser Coway (Sudah Minum)' : '[E] Minum Air Steril Coway (+15 HP)',
      prompt: cowUsed ? '[E] Dispenser Coway (Sudah Minum)' : '[E] Minum Air Steril Coway (+15 HP)',
      used: cowUsed
    });

    const callX = p1MinX + 1.45;
    const callZ = -2.85;
    addBox(bSteelDark, 0.42, 1.35, 0.42, callX, 0.68, callZ);
    addAtlasBox(bSign, 0.46, 0.44, 0.46, callX, 1.22, callZ, Math.PI * 0.5, null, SIGN_UV.callTrain);
    station._addCollider(callX - 0.25, 0, callZ - 0.25, callX + 0.25, 1.45, callZ + 0.25, 'metal');
    station.interactables.push({
      id: 'call_train', type: 'call_train', x: callX, y: 1.2, z: callZ,
      label: '[E] Panggil Kereta LRT Peron 1 (→ Stasiun Berikutnya)',
      prompt: '[E] Panggil Kereta LRT Peron 1 (→ Stasiun Berikutnya)', used: false
    });

    const call2X = (isIsland ? p1MaxX : p2MaxX) - 1.45;
    const call2Z = -2.85;
    addBox(bSteelDark, 0.42, 1.35, 0.42, call2X, 0.68, call2Z);
    addAtlasBox(bSign, 0.46, 0.44, 0.46, call2X, 1.22, call2Z, -Math.PI * 0.5, null, SIGN_UV.callTrain);
    station._addCollider(call2X - 0.25, 0, call2Z - 0.25, call2X + 0.25, 1.45, call2Z + 0.25, 'metal');
    station.interactables.push({
      id: 'call_train_prev', type: 'call_train_prev', x: call2X, y: 1.2, z: call2Z,
      label: '[E] Panggil Kereta LRT Peron 2 (← Stasiun Sebelumnya)',
      prompt: '[E] Panggil Kereta LRT Peron 2 (← Stasiun Sebelumnya)', used: false
    });

    const exX = p1MaxX - 1.1;
    const exBy = 3.25, exBh = 0.64;
    const exRoofY = getCanopyArchY(exX) + 0.08;
    const exRodLen = Math.max(0.3, exRoofY - (exBy + exBh * 0.5));
    addBox(bSteelDark, 0.10, exBh, 2.84, exX, exBy, concMidZ);
    addBox(bSteelDark, 0.04, exRodLen, 0.04, exX, exBy + exBh * 0.5 + exRodLen * 0.5, concMidZ - 1.05);
    addBox(bSteelDark, 0.04, exRodLen, 0.04, exX, exBy + exBh * 0.5 + exRodLen * 0.5, concMidZ + 1.05);
    addAtlasQuad(bSign, 2.76, 0.60, exX - 0.06, exBy, concMidZ, 0, -Math.PI * 0.5, 0, SIGN_UV.exitYellow);
    addAtlasQuad(bSign, 2.76, 0.60, exX + 0.06, exBy, concMidZ, 0, Math.PI * 0.5, 0, SIGN_UV.exitYellow);

    const evX = stairX;
    const evZ = stairFootZ + (jpoZ > 0 ? -0.35 : 0.35);
    const evBy = 3.25, evBh = 0.44;
    const evRoofY = getCanopyArchY(evX) + 0.08;
    const evRodLen = Math.max(0.3, evRoofY - (evBy + evBh * 0.5));
    addBox(bSteelDark, 1.12, evBh, 0.08, evX, evBy, evZ);
    addBox(bSteelDark, 0.04, evRodLen, 0.04, evX - 0.38, evBy + evBh * 0.5 + evRodLen * 0.5, evZ);
    addBox(bSteelDark, 0.04, evRodLen, 0.04, evX + 0.38, evBy + evBh * 0.5 + evRodLen * 0.5, evZ);
    addAtlasQuad(bSign, 1.04, 0.38, evX, evBy, evZ - 0.045, 0, Math.PI, 0, SIGN_UV.evakuasiGreen);
    addAtlasQuad(bSign, 1.04, 0.38, evX, evBy, evZ + 0.045, 0, 0, 0, SIGN_UV.evakuasiGreen);

    if (!isIsland) {
      const cevZ = cStairFootZ + (cStairTopZ > cStairFootZ ? -0.45 : 0.45);
      const cevBy = 3.25;
      const cevRodLen = Math.max(0.2, (UPPER_FLOOR_Y - 0.28) - (cevBy + 0.22) + 0.02);
      addBox(bSteelDark, 1.12, 0.44, 0.08, cStairX, cevBy, cevZ);
      addBox(bSteelDark, 0.04, cevRodLen, 0.04, cStairX - 0.38, cevBy + 0.22 + cevRodLen * 0.5, cevZ);
      addBox(bSteelDark, 0.04, cevRodLen, 0.04, cStairX + 0.38, cevBy + 0.22 + cevRodLen * 0.5, cevZ);
      addAtlasQuad(bSign, 1.04, 0.38, cStairX, cevBy, cevZ - 0.045, 0, Math.PI, 0, SIGN_UV.evakuasiGreen);
      addAtlasQuad(bSign, 1.04, 0.38, cStairX, cevBy, cevZ + 0.045, 0, 0, 0, SIGN_UV.evakuasiGreen);
    }

    const totemX = p1MinX + 3.0;
    const totemZ = 8.6;
    addBox(bSteelDark, 1.66, 0.08, 0.30, totemX, 0.04, totemZ);
    addBox(bSteelDark, 0.08, 1.88, 0.14, totemX - 0.76, 0.94, totemZ);
    addBox(bSteelDark, 0.08, 1.88, 0.14, totemX + 0.76, 0.94, totemZ);
    addBox(bSteelDark, 1.62, 0.58, 0.14, totemX, 1.54, totemZ);
    addAtlasQuad(bSign, 1.52, 0.48, totemX, 1.54, totemZ + 0.075, 0, 0, 0, SIGN_UV.routeMap);
    addAtlasQuad(bSign, 1.52, 0.48, totemX, 1.54, totemZ - 0.075, 0, Math.PI, 0, SIGN_UV.routeMap);
    addBox(bSteelDark, 0.56, 0.05, 0.32, totemX, 1.04, totemZ - 0.16);
    station._addCollider(totemX - 0.86, 0, totemZ - 0.16, totemX + 0.86, 1.92, totemZ + 0.16, 'metal');
    station.interactables.push({
      id: 'route_totem', type: 'info', x: totemX, y: 1.2, z: totemZ,
      label: '[E] Periksa Peta Rute LRT Jabodebek',
      prompt: '[E] Periksa Peta Rute LRT Jabodebek', used: false
    });
    placeFieldLogProp(station, ctx.root, 'route_totem', totemX, 1.07, totemZ - 0.16, Math.PI + 0.10, station._usedIds.has('route_totem'));

    for (let hz = -38; hz <= 38; hz += 38) {
      if (!isIsland && hz > concMinZ && hz < concMaxZ) continue;
      const hx = isIsland ? (p1MinX + 3.96) : (p1MaxX - 0.53);
      let hUseZ = isIsland ? (hz === 0 ? -12 : hz) : hz;
      if (isInStairExclusion(hx, hUseZ, 0.4, 0.6)) hUseZ = jpoZ > 0 ? -14 : 14;
      if (isInStairExclusion(hx, hUseZ, 0.4, 0.6)) continue;
      addAtlasBox(bSign, 0.34, 1.18, 0.74, hx, 0.60, hUseZ, 0,
        { 0: SIGN_UV.hydrantRed, 1: SIGN_UV.hydrantRed }, SIGN_UV.hydrantRedSolid);
      station._addCollider(hx - 0.20, 0, hUseZ - 0.40, hx + 0.20, 1.24, hUseZ + 0.40, 'metal');
    }

    // Fluorescent Tubes & Batten Housings
    const isClearOfJpoAndStairs = (tx, tz) => {
      if (Math.abs(tz - jpoZ) < jpoDepth * 0.5 + 1.8) return false;
      if (jpo2Z !== null && Math.abs(tz - jpo2Z) < 4.2) return false;
      if (arch.hasDepotShed && Math.abs(tz - 52.0) < 4.4) return false;
      if (isInStairExclusion(tx, tz, 0.2, 0.2)) return false;
      return true;
    };
    const tubeCoords = [];
    const tzMin = Math.round(platMinZ + 14);
    const tzMax = Math.round(platMaxZ - 14);
    for (let tz = tzMin; tz <= tzMax; tz += 14) {
      const txMain = p1MinX + 2.05;
      if (isClearOfJpoAndStairs(txMain, tz)) {
        tubeCoords.push({ x: txMain, y: 4.35, z: tz, mount: 'canopy', roofY: getCanopyArchY(txMain) + 0.08 });
      }
      if (isIsland) {
        const txIsl = p1MaxX - 2.05;
        if (isClearOfJpoAndStairs(txIsl, tz)) {
          tubeCoords.push({ x: txIsl, y: 4.35, z: tz, mount: 'canopy', roofY: getCanopyArchY(txIsl) + 0.08 });
        }
      }
    }
    if (!isIsland) {
      const concSoffitY = UPPER_FLOOR_Y - 0.28;
      for (let cz = concMinZ + 5; cz <= concMaxZ - 5; cz += 8) {
        tubeCoords.push({ x: concMinX + 4.4, y: concSoffitY - 0.09, z: cz, mount: 'soffit', roofY: concSoffitY });
        if (cw > 11.5) {
          tubeCoords.push({ x: concMaxX - 4.4, y: concSoffitY - 0.09, z: cz, mount: 'soffit', roofY: concSoffitY });
        }
      }
      const balcRoofSoffitY = eaveY - 0.13;
      const balcTubeX = concMaxX - 2.4;
      tubeCoords.push({ x: balcTubeX, y: balcRoofSoffitY - 0.09, z: concMidZ - Math.min(12, concLen * 0.25), mount: 'soffit', roofY: balcRoofSoffitY });
      tubeCoords.push({ x: balcTubeX, y: balcRoofSoffitY - 0.09, z: concMidZ + Math.min(12, concLen * 0.25), mount: 'soffit', roofY: balcRoofSoffitY });
    } else if (isCawang) {
      for (let tz = -42; tz <= 42; tz += 28) {
        if (Math.abs(tz) > 12) {
          const i2tx = i2MinX + 4.5;
          tubeCoords.push({ x: i2tx, y: 4.35, z: tz, mount: 'canopy', roofY: getCanopyArchY(i2tx) + 0.08 });
        }
      }
    }
    if (arch.hasDepotShed) {
      tubeCoords.push({ x: p1MaxX + 4.8, y: 4.65, z: 42, mount: 'canopy', roofY: 6.75 });
      tubeCoords.push({ x: p1MaxX + 4.8, y: 4.65, z: 58, mount: 'canopy', roofY: 6.75 });
    }
    const jpoSoffitY = jpoPergolaY - 0.11;
    if (isCawang) {
      for (const mz of [-5.5, 5.5]) {
        for (const mx of [-4.0, 7.5, 16.5, 25.5]) {
          tubeCoords.push({ x: mx, y: jpoSoffitY - 0.09, z: mz, mount: 'soffit', roofY: jpoSoffitY });
        }
      }
    } else {
      tubeCoords.push({ x: jpoCX - 4.0, y: jpoSoffitY - 0.09, z: jpoZ, mount: 'soffit', roofY: jpoSoffitY });
      tubeCoords.push({ x: jpoCX + 4.0, y: jpoSoffitY - 0.09, z: jpoZ, mount: 'soffit', roofY: jpoSoffitY });
    }
    if (jpo2Z !== null) {
      tubeCoords.push({ x: jpo2CX, y: jpoSoffitY - 0.09, z: jpo2Z, mount: 'soffit', roofY: jpoSoffitY });
    }

    for (let t = 0; t < tubeCoords.length; t++) {
      const tc = tubeCoords[t];
      addBox(bSteelDark, 0.24, 0.06, 2.32, tc.x, tc.y + 0.06, tc.z);
      if (tc.mount === 'canopy') {
        const rodBot = tc.y + 0.09;
        const rodLen = Math.max(0.2, tc.roofY - rodBot);
        addBox(bSteelDark, 0.035, rodLen, 0.035, tc.x, rodBot + rodLen * 0.5, tc.z - 0.88);
        addBox(bSteelDark, 0.035, rodLen, 0.035, tc.x, rodBot + rodLen * 0.5, tc.z + 0.88);
      }
    }

    ctx.rotioX = rotioX;
    ctx.rotioZ = rotioZ;
    ctx.indoX = indoX;
    ctx.indoZ = indoZ;
    ctx.lkX = lkX;
    ctx.lkZ = lkZ;
    ctx.shX = shX;
    ctx.shZ = shZ;
    ctx.turnstileList = turnstileList;
    ctx.tubeCoords = tubeCoords;
  }

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
    const haloGeo = new THREE.PlaneGeometry(0.72, 2.15);
    haloGeo.rotateX(-Math.PI * 0.5);
    station.disposableGeometries.push(haloGeo);
    const haloInst = new THREE.InstancedMesh(haloGeo, mats.tubeHalo, Math.max(1, tubeCoords.length));

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
    const benchZs = [-42, -14, 14, 42];
    for (let bi = 0; bi < benchZs.length; bi++) {
      const bz = benchZs[bi];
      const tx = p1MinX + 3.4;
      if (!isInStairExclusion(tx, bz + 2.2, 0.5, 0.5)) {
        paintPropSpecs.push({ x: tx, y: 0.45, z: bz + 2.2, sx: 0.55, sy: 0.90, sz: 0.40, rx: 0, ry: 0, rz: 0, color: 0x3b82c4, halfH: 0.45, dynamic: true });
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
            x: tx,
            y: 0.55,
            z: bz,
            seatPos: { x: tx + 0.14, y: 0.02, z: bz },
            standPos: { x: tx + 0.92, y: 0.02, z: bz },
            yaw: -Math.PI * 0.5,
            label: '[E] Duduk di Bangku Peron',
            prompt: '[E] Duduk di Bangku Peron'
          });
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
    root.add(propsPaintInst);
    station._propsPaintInst = propsPaintInst;

    const propsMetalInst = new THREE.InstancedMesh(propBoxGeo, mats.propsMetal, Math.max(1, metalPropSpecs.length));
    propsMetalInst.castShadow = false;
    propsMetalInst.receiveShadow = true;
    root.add(propsMetalInst);
    station._propsMetalInst = propsMetalInst;

    const barricadeGeo = buildBarricadeGeometry();
    station.disposableGeometries.push(barricadeGeo);
    const barricadeInst = new THREE.InstancedMesh(barricadeGeo, mats.barricade, Math.max(1, barricadePropSpecs.length));
    barricadeInst.castShadow = false;
    barricadeInst.receiveShadow = true;
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

    // Overgrown Canopy Vines (anchored cleanly onto canopy purlins above platform!)
    const vineCount = arch.heavyOvergrowth ? 34 : 16;
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

    // Roti'O Warm Plinth Glow + Cawang Derelict Cab Hazard Beacon
    const amberPositions = [
      [rotioX, 0.04, rotioZ + 1.15, 3.3, 0.08, 0.14]
    ];
    station._cawangHazardRing = null;
    if (isCawang && ctx.cawangWreckX !== undefined) {
      const hx = ctx.cawangWreckX;
      amberPositions.push([hx, 2.8, -10.5, 0.24, 0.24, 0.24]);
      const hazGroup = new THREE.Group();
      hazGroup.position.set(hx, 2.8, -10.5);
      const ringGeo = new THREE.RingGeometry(0.32, 0.72, 24);
      ringGeo.rotateX(-Math.PI * 0.5);
      const flareGeo = new THREE.PlaneGeometry(1.15, 1.15);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff9d2e,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const flareMat = new THREE.MeshBasicMaterial({
        color: 0xffb33a,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      station.disposableGeometries.push(ringGeo, flareGeo);
      station.disposableMaterials.push(ringMat, flareMat);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      const flareMesh = new THREE.Mesh(flareGeo, flareMat);
      flareMesh.rotation.y = Math.PI * 0.25;
      hazGroup.add(ringMesh);
      hazGroup.add(flareMesh);
      root.add(hazGroup);
      station._cawangHazardRing = { group: hazGroup, ring: ringMesh, flare: flareMesh, ringMat, flareMat };
    }
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
    if (!isInStairExclusion(p1MinX + 2.8, 12.0, 0.4, 0.4)) {
      station._placeNormalizedModel('WetFloorSign_01', p1MinX + 2.8, 0.0, 12.0, -0.4, 0.64);
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

    // 3D Physical Field Log Paper / Manila Folder Props at Station Note Counters
    if (isCawang && ctx.cawangWreckX !== undefined) {
      const cabBoxGeo = new THREE.BoxGeometry(0.38, 0.42, 0.34);
      const cabBoxMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.6 });
      station.disposableGeometries.push(cabBoxGeo);
      station.disposableMaterials.push(cabBoxMat);
      const cabBox = new THREE.Mesh(cabBoxGeo, cabBoxMat);
      cabBox.position.set(ctx.cawangWreckX - 1.58, 0.21, -10.5);
      cabBox.receiveShadow = true;
      root.add(cabBox);
      placeFieldLogProp(station, root, 'cawang_derelict_cab', ctx.cawangWreckX - 1.58, 0.425, -10.5, 0.22, station._usedIds.has('cawang_derelict_cab'));
    }
    if (arch.hasGardenTerrace) {
      const gCX = (track2X + 1.85 + gardenMaxX) * 0.5;
      placeFieldLogProp(station, root, 'garden_supply', gCX, 0.855, -47.8, 0.12, station._usedIds.has('garden_supply'));
    }
    if (arch.hasDepotShed) {
      placeFieldLogProp(station, root, 'depot_supply', depotMaxX - 1.2, 1.16, 54.0, -Math.PI * 0.5 + 0.14, station._usedIds.has('depot_supply'));
    }
    if (arch.id === 'setiabudi') {
      const relBoxGeo = new THREE.BoxGeometry(0.46, 0.82, 0.40);
      const relBoxMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.48, metalness: 0.65 });
      station.disposableGeometries.push(relBoxGeo);
      station.disposableMaterials.push(relBoxMat);
      const relBox = new THREE.Mesh(relBoxGeo, relBoxMat);
      relBox.position.set(supX + 1.8, UPPER_FLOOR_Y + 0.41, supZ);
      relBox.receiveShadow = true;
      root.add(relBox);
      station._addCollider(supX + 1.55, UPPER_FLOOR_Y, supZ - 0.22, supX + 2.05, UPPER_FLOOR_Y + 0.85, supZ + 0.22, 'metal');
      placeFieldLogProp(station, root, 'setiabudi_jpo_switch', supX + 1.8, UPPER_FLOOR_Y + 0.825, supZ, 0.15, station._usedIds.has('setiabudi_jpo_switch'));
    }

    // =========================================================
    // 9B. CURATED STRATEGIC TACTICAL LOOTBOX CRATES (2-3 PER STATION)
    // =========================================================
    station._lootboxGlows = new Map();
    station._lootboxVisuals = [];
    const placeLootbox = (id, lx, ly, lz, ry, riskLuck, title) => {
      const used = station._usedIds.has(id);
      const cityInt = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.city;
      if (cityInt && typeof cityInt.createLootboxVisual === 'function') {
        const vis = cityInt.createLootboxVisual(
          root, station.disposableGeometries, station.disposableMaterials,
          id, lx, ly, lz, ry, used
        );
        station._lootboxVisuals.push(vis);
        station._lootboxGlows.set(id, vis.haloGroup);
      } else {
        station._placeNormalizedModel('ammo_box', lx, ly, lz, ry, 0.38);
      }
      station._addCollider(lx - 0.50, ly, lz - 0.50, lx + 0.50, ly + 0.64, lz + 0.50, 'metal', {
        blocksWalk: true, blocksBullets: false
      });

      const tierTag = riskLuck >= 0.5 ? '(Risiko Tinggi — Amunisi Berat & Medis)' : '(Amunisi Taktis & Medis)';
      const lbl = used ? `[E] ${title} (Sudah Dibuka)` : `[E / Klik] Buka ${title} ${tierTag}`;
      station.interactables.push({
        id: id,
        type: 'lootbox',
        riskLuck: riskLuck,
        x: lx,
        y: ly + 0.55,
        z: lz,
        label: lbl,
        prompt: lbl,
        used: used
      });
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
        { id: 'sock_loket_corner', x: concMaxX - 2.6, y: 0.0, z: concMinZ + 1.25, ry: 0.0, riskLuck: 0.40, title: 'Peti Taktis Sudut Loket' },
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
        { id: 'sock_island_indo_spine', x: p1MinX + 2.2, y: 0.0, z: indoZ + 1.5, ry: Math.PI * 0.5, riskLuck: 0.42, title: 'Peti Taktis Sayap Indomaret' },
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

    station.explosiveBarrels = [];
    station._barrelCueVisual = null;
    if (arch.hasDepotShed) {
      const barrelHaloRingGeo = new THREE.RingGeometry(0.46, 0.72, 24);
      barrelHaloRingGeo.rotateX(-Math.PI * 0.5);
      const barrelHaloShellGeo = new THREE.CylinderGeometry(0.48, 0.56, 1.08, 16, 1, true);
      const barrelHaloRingMat = new THREE.MeshBasicMaterial({
        color: 0xff5a1f,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const barrelHaloShellMat = new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      station.disposableGeometries.push(barrelHaloRingGeo, barrelHaloShellGeo);
      station.disposableMaterials.push(barrelHaloRingMat, barrelHaloShellMat);

      const addExplosiveBarrel = (id, bx, bz, rotY) => {
        const mesh = station._placeNormalizedModel('Barrel_01', bx, 0.0, bz, rotY, 0.90, null, 'barrel');
        const cIdx = station.colliders.length - 1;
        const col = station.colliders[cIdx];
        if (col) col.barrelId = id;

        const haloGroup = new THREE.Group();
        haloGroup.position.set(bx, 0.0, bz);
        const haloRing = new THREE.Mesh(barrelHaloRingGeo, barrelHaloRingMat);
        haloRing.position.y = 0.035;
        const haloShell = new THREE.Mesh(barrelHaloShellGeo, barrelHaloShellMat);
        haloShell.position.y = 0.54;
        haloGroup.add(haloRing);
        haloGroup.add(haloShell);
        root.add(haloGroup);

        station.explosiveBarrels.push({
          id: id,
          x: bx,
          y: 0.0,
          z: bz,
          hp: 35,
          exploded: false,
          mesh: mesh,
          colliderIdx: cIdx,
          haloGroup: haloGroup,
          haloRing: haloRing,
          haloShell: haloShell
        });
      };

      addExplosiveBarrel(0, depotMaxX - 1.3, 41.0, 0.0);
      addExplosiveBarrel(1, depotMaxX - 1.3, 50.0, 1.2);

      const cueOrbGeo = new THREE.SphereGeometry(0.18, 12, 10);
      const cueShellGeo = new THREE.OctahedronGeometry(0.28, 0);
      const cueBeamGeo = new THREE.CylinderGeometry(0.05, 0.30, 1.55, 12, 1, true);
      const cueOrbMat = new THREE.MeshBasicMaterial({
        color: 0xff8c38,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const cueShellMat = new THREE.MeshBasicMaterial({
        color: 0xffb347,
        wireframe: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const cueBeamMat = new THREE.MeshBasicMaterial({
        color: 0xff5a1f,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      station.disposableGeometries.push(cueOrbGeo, cueShellGeo, cueBeamGeo);
      station.disposableMaterials.push(cueOrbMat, cueShellMat, cueBeamMat);

      const cueGroup = new THREE.Group();
      cueGroup.visible = false;
      const cueOrb = new THREE.Mesh(cueOrbGeo, cueOrbMat);
      cueOrb.position.y = 1.65;
      const cueShell = new THREE.Mesh(cueShellGeo, cueShellMat);
      cueShell.position.y = 1.65;
      const cueBeam = new THREE.Mesh(cueBeamGeo, cueBeamMat);
      cueBeam.position.y = 0.80;
      cueGroup.add(cueBeam);
      cueGroup.add(cueOrb);
      cueGroup.add(cueShell);
      root.add(cueGroup);

      station._barrelCueVisual = {
        group: cueGroup,
        orb: cueOrb,
        shell: cueShell,
        beam: cueBeam,
        ringMat: barrelHaloRingMat,
        shellMat: barrelHaloShellMat
      };
    }

    station._groundPickups = [];
    station._cikokoBarricade = null;
    if (arch.id === 'cikoko' || arch.hasTollOverpass) {
      const bcX = concMaxX + 12.5;
      const bcY = S.CONST.STREET_GROUND_Y;
      const bcZ = -48.0;
      const cleared = !!(station._usedIds && station._usedIds.has('cikoko_barricade'));

      const bcConcGeo = new THREE.BoxGeometry(2.0, 1.05, 0.72);
      const bcBeamGeo = new THREE.BoxGeometry(6.2, 0.24, 0.16);
      const bcDrumGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.88, 12);
      const bcGlowGeo = new THREE.BoxGeometry(1.1, 0.16, 0.18);
      const bcConcMat = new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.90, metalness: 0.08 });
      const bcHazMat = new THREE.MeshStandardMaterial({ color: 0xd94826, emissive: 0x3b1206, roughness: 0.55, metalness: 0.35 });
      const bcGlowMat = new THREE.MeshBasicMaterial({ color: 0xff6b2b });
      station.disposableGeometries.push(bcConcGeo, bcBeamGeo, bcDrumGeo, bcGlowGeo);
      station.disposableMaterials.push(bcConcMat, bcHazMat, bcGlowMat);

      const bcGroup = new THREE.Group();
      bcGroup.position.set(bcX, bcY, bcZ);
      bcGroup.visible = !cleared;
      for (const dx of [-2.1, 0.0, 2.1]) {
        const blk = new THREE.Mesh(bcConcGeo, bcConcMat);
        blk.position.set(dx, 0.525, 0);
        blk.castShadow = true;
        blk.receiveShadow = true;
        bcGroup.add(blk);
      }
      const rail1 = new THREE.Mesh(bcBeamGeo, bcHazMat);
      rail1.position.set(0, 1.25, 0);
      bcGroup.add(rail1);
      const drum = new THREE.Mesh(bcDrumGeo, bcHazMat);
      drum.position.set(0, 0.44, 0.65);
      bcGroup.add(drum);
      const beaconStrip = new THREE.Mesh(bcGlowGeo, bcGlowMat);
      beaconStrip.position.set(0, 1.44, 0.05);
      bcGroup.add(beaconStrip);
      root.add(bcGroup);

      station._addCollider(bcX - 3.3, bcY, bcZ - 0.55, bcX + 3.3, bcY + 1.55, bcZ + 0.85, 'barricade', {
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
        y: bcY + 0.90,
        z: bcZ + 1.15,
        used: cleared,
        label: cleared ? '[E] Barikade Jalan Tol Ditembus' : '[E / Tembak] Ledakkan Barikade Tol Cikoko',
        prompt: cleared ? '[E] Barikade Jalan Tol Ditembus' : '[E / Tembak] Ledakkan Barikade Tol Cikoko'
      };
      station.interactables.push(bcItem);
      station._cikokoBarricade = {
        id: 'cikoko_barricade',
        x: bcX,
        y: bcY,
        z: bcZ,
        hp: 90,
        maxHp: 90,
        cleared: cleared,
        group: bcGroup,
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
    if (jpo2Z !== null && ctx.jpo2CX !== null) {
      station._warmLightAnchors.push({ x: ctx.jpo2CX, y: 6.35, z: jpo2Z });
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
        { x: shX - 2.4, y: 0.0, z: shZ - 1.8, zone: 'concealed_station' },
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
