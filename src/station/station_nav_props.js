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
          prompt: '[E] Tap Kartu Elektronik (Access by KAI)', used: false,
          targetObj: cab
        });
        if (typeof station._registerHaloTarget === 'function') {
          station._registerHaloTarget(tid, cab, { category: 'interactable', x: lx, y: 0.9, z: lz, hitRadius: 0.55 });
        }
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

  function makeCanvasTex(station, w, h, drawFn, repeat) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    drawFn(ctx, w, h);
    const tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    }
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    station.disposableTextures.push(tex);
    return tex;
  }

  function addPbrPart(station, parent, geo, mat, x, y, z, rx, ry, rz) {
    station.disposableGeometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function addBenchProp(station, root, id, x, y, z, rotY, playerYaw, seatOffX, seatOffZ, standOffX, standOffZ, scaleX) {
    const cityInt = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.city;
    const benchProto = (cityInt && typeof cityInt.getParkBenchProto === 'function') ? cityInt.getParkBenchProto() : null;
    const sx = scaleX || 1.0;
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const bw = 1.90 * sx;
    const bd = 0.68;
    const hw = (cos * bw + sin * bd) * 0.5;
    const hd = (sin * bw + cos * bd) * 0.5;

    let bGrp = null;
    if (benchProto && benchProto.parts && benchProto.parts.length) {
      bGrp = new THREE.Group();
      bGrp.position.set(x, y, z);
      bGrp.rotation.y = rotY;
      if (sx !== 1.0) bGrp.scale.set(sx, 1, 1);
      for (let bp = 0; bp < benchProto.parts.length; bp++) {
        const bm = new THREE.Mesh(benchProto.parts[bp].geo, benchProto.parts[bp].mat);
        bm.castShadow = false;
        bm.receiveShadow = true;
        bGrp.add(bm);
      }
      root.add(bGrp);
    } else {
      bGrp = new THREE.Group();
      bGrp.position.set(x, y, z);
      bGrp.rotation.y = rotY;
      const ironMat = new THREE.MeshStandardMaterial({ color: 0x242a32, roughness: 0.45, metalness: 0.72 });
      const teakMat = new THREE.MeshStandardMaterial({ color: 0x7c4d2c, roughness: 0.72, metalness: 0.05 });
      station.disposableMaterials.push(ironMat, teakMat);
      addPbrPart(station, bGrp, new THREE.BoxGeometry(1.76 * sx, 0.05, 0.48), teakMat, 0, 0.45, 0.02);
      addPbrPart(station, bGrp, new THREE.BoxGeometry(1.76 * sx, 0.36, 0.05), teakMat, 0, 0.68, -0.22, -0.14);
      for (const lx of [-0.76 * sx, 0.76 * sx]) {
        addPbrPart(station, bGrp, new THREE.BoxGeometry(0.08, 0.44, 0.54), ironMat, lx, 0.22, 0);
      }
      root.add(bGrp);
    }

    station._addCollider(x - hw, y, z - hd, x + hw, y + 0.88, z + hd, 'wood', { blocksBullets: false });
    station.interactables.push({
      id: id,
      type: 'bench',
      sittable: true,
      x: x,
      y: y + 0.55,
      z: z,
      seatPos: { x: x + seatOffX, y: y + 0.02, z: z + seatOffZ },
      standPos: { x: x + standOffX, y: y + 0.02, z: z + standOffZ },
      yaw: playerYaw,
      label: '[E] Duduk di Bangku Stasiun',
      prompt: '[E] Duduk di Bangku Stasiun',
      targetObj: bGrp
    });
    if (bGrp && typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget(id, bGrp, { category: 'interactable', x, y: y + 0.45, z, hitRadius: 0.95 });
    }
  }

  function addTrashBinProp(station, root, x, y, z) {
    const cityInt = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.city;
    const trashProto = (cityInt && typeof cityInt.getTrashCanProto === 'function') ? cityInt.getTrashCanProto() : null;
    if (trashProto && trashProto.parts && trashProto.parts.length) {
      const tGrp = new THREE.Group();
      tGrp.position.set(x, y, z);
      for (let tp = 0; tp < trashProto.parts.length; tp++) {
        const tm = new THREE.Mesh(trashProto.parts[tp].geo, trashProto.parts[tp].mat);
        tm.castShadow = false;
        tm.receiveShadow = true;
        tGrp.add(tm);
      }
      root.add(tGrp);
    } else {
      const binMat = new THREE.MeshStandardMaterial({ color: 0x1e5c3a, roughness: 0.48, metalness: 0.35 });
      const lidMat = new THREE.MeshStandardMaterial({ color: 0x262c34, roughness: 0.36, metalness: 0.65 });
      station.disposableMaterials.push(binMat, lidMat);
      addPbrPart(station, root, new THREE.CylinderGeometry(0.24, 0.21, 0.76, 10), binMat, x, y + 0.38, z);
      addPbrPart(station, root, new THREE.CylinderGeometry(0.26, 0.25, 0.08, 10), lidMat, x, y + 0.78, z);
    }
    station._addCollider(x - 0.28, y, z - 0.28, x + 0.28, y + 0.92, z + 0.28, 'metal', { blocksBullets: false });
  }

  function buildWalkInIndomaret(station, ctx, indoX, indoZ, indoYaw) {
    const { root, glassRecords } = ctx;
    const cos = Math.cos(indoYaw);
    const sin = Math.sin(indoYaw);
    const inW = (lx, lz) => [indoX + lx * cos + lz * sin, indoZ - lx * sin + lz * cos];
    const addIndoCollider = (lx, lz, w, d, minY, maxY, tag, opts) => {
      const [wx, wz] = inW(lx, lz);
      const hw = (Math.abs(cos) * w + Math.abs(sin) * d) * 0.5;
      const hd = (Math.abs(sin) * w + Math.abs(cos) * d) * 0.5;
      return station._addCollider(wx - hw, minY, wz - hd, wx + hw, maxY, wz + hd, tag || 'metal', opts);
    };

    const grp = new THREE.Group();
    grp.name = 'IndomaretPointWalkIn';
    grp.position.set(indoX, 0, indoZ);
    grp.rotation.y = indoYaw;
    root.add(grp);

    // Rich PBR materials & procedural CanvasTextures
    const floorTex = makeCanvasTex(station, 256, 256, (c, w, h) => {
      c.fillStyle = '#e6e4de';
      c.fillRect(0, 0, w, h);
      const step = 64;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          c.fillStyle = ((x / step + y / step) & 1) ? '#dcd9d1' : '#ebe9e3';
          c.fillRect(x + 2, y + 2, step - 4, step - 4);
        }
      }
      c.strokeStyle = '#b4b0a6';
      c.lineWidth = 2;
      for (let i = 0; i <= w; i += step) {
        c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke();
        c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke();
      }
    }, true);
    floorTex.repeat.set(3, 2);

    const fasciaMap = makeCanvasTex(station, 512, 128, (c, w, h) => {
      c.fillStyle = '#183f82';
      c.fillRect(0, 0, 272, h);
      c.fillStyle = '#1e509e';
      c.fillRect(0, 0, 272, 74);
      c.fillStyle = '#d62328';
      c.fillRect(0, 74, 272, 30);
      c.fillStyle = '#f5c71a';
      c.fillRect(0, 104, 272, 24);
      c.fillStyle = '#ffffff';
      c.font = 'bold 26px sans-serif';
      c.fillText('INDOMARET', 18, 42);
      c.font = 'bold 17px sans-serif';
      c.fillStyle = '#fde68a';
      c.fillText('POINT  •  MINIMARKET', 18, 66);

      c.fillStyle = '#161f1b';
      c.fillRect(272, 0, 240, h);
      c.fillStyle = '#0e7c41';
      c.fillRect(272, 0, 240, 18);
      c.fillRect(272, 110, 240, 18);
      c.fillStyle = '#f8fafc';
      c.font = 'bold 26px sans-serif';
      c.fillText('POINT COFFEE', 288, 56);
      c.fillStyle = '#4ade80';
      c.font = 'bold 14px sans-serif';
      c.fillText('FRESH BREW  •  COLD DRINKS', 288, 86);
    }, false);
    const fasciaEm = makeCanvasTex(station, 512, 128, (c) => {
      c.fillStyle = '#102956';
      c.fillRect(0, 0, 272, 74);
      c.fillStyle = '#4f0c0e';
      c.fillRect(0, 74, 272, 30);
      c.fillStyle = '#5c4806';
      c.fillRect(0, 104, 272, 24);
      c.fillStyle = '#ffffff';
      c.font = 'bold 26px sans-serif';
      c.fillText('INDOMARET', 18, 42);
      c.fillStyle = '#0b1812';
      c.fillRect(272, 0, 240, 128);
      c.fillStyle = '#0c8c48';
      c.fillRect(272, 0, 240, 18);
      c.fillRect(272, 110, 240, 18);
      c.fillStyle = '#d9fce6';
      c.font = 'bold 26px sans-serif';
      c.fillText('POINT COFFEE', 288, 56);
    }, false);

    const chillerMap = makeCanvasTex(station, 512, 512, (c, w, h) => {
      c.fillStyle = '#0e1726';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#164e8c';
      c.fillRect(10, 10, w - 20, 56);
      c.fillStyle = '#ffffff';
      c.font = 'bold 24px sans-serif';
      c.textAlign = 'center';
      c.fillText('CHILLER MINUMAN DINGIN', w * 0.5, 47);

      // Twin refrigerated glass bays
      for (const bayX of [16, 264]) {
        c.fillStyle = '#cbe7f7';
        c.fillRect(bayX, 76, 232, 418);
        c.strokeStyle = '#1e293b';
        c.lineWidth = 6;
        c.strokeRect(bayX, 76, 232, 418);
        const palette = ['#ef4444', '#16a34a', '#2563eb', '#eab308', '#f97316', '#06b6d4', '#8b5cf6'];
        for (let row = 0; row < 5; row++) {
          const sy = 96 + row * 78;
          c.fillStyle = '#334155';
          c.fillRect(bayX + 6, sy + 56, 220, 8);
          for (let col = 0; col < 7; col++) {
            const bx = bayX + 16 + col * 30;
            const bCol = palette[(row * 3 + col) % palette.length];
            c.fillStyle = '#0f172a';
            c.fillRect(bx + 5, sy + 6, 10, 7);
            c.fillStyle = bCol;
            c.fillRect(bx, sy + 13, 20, 42);
            c.fillStyle = '#f8fafc';
            c.fillRect(bx + 2, sy + 24, 16, 11);
          }
        }
      }
    }, false);
    const chillerEm = makeCanvasTex(station, 512, 512, (c, w) => {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, w, 512);
      c.fillStyle = '#1e5aa8';
      c.fillRect(10, 10, w - 20, 56);
      c.fillStyle = '#dbeafe';
      c.font = 'bold 24px sans-serif';
      c.textAlign = 'center';
      c.fillText('CHILLER MINUMAN DINGIN', w * 0.5, 47);
      for (const bayX of [20, 268]) {
        c.fillStyle = '#2b5570';
        c.fillRect(bayX, 82, 224, 406);
      }
    }, false);

    const menuMap = makeCanvasTex(station, 512, 256, (c, w, h) => {
      c.fillStyle = '#161b18';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#0e7c41';
      c.fillRect(0, 0, w, 52);
      c.fillStyle = '#e5b82e';
      c.fillRect(0, 52, w, 6);
      c.fillStyle = '#ffffff';
      c.font = 'bold 28px sans-serif';
      c.fillText('POINT COFFEE  •  MENU', 20, 36);
      const items = [
        ['Palm Sugar Latte', 'Rp 22K'],
        ['Espresso Double Shot', 'Rp 18K'],
        ['Matcha Green Tea', 'Rp 25K'],
        ['Cold Brew Boost (+HP/Sprint)', 'GRATIS [E]']
      ];
      c.font = 'bold 19px sans-serif';
      for (let i = 0; i < items.length; i++) {
        const y = 96 + i * 38;
        c.fillStyle = i === 3 ? '#4ade80' : '#f1f5f9';
        c.textAlign = 'left';
        c.fillText(items[i][0], 22, y);
        c.textAlign = 'right';
        c.fillStyle = i === 3 ? '#fde047' : '#cbd5e1';
        c.fillText(items[i][1], w - 22, y);
      }
    }, false);
    const menuEm = makeCanvasTex(station, 512, 256, (c, w, h) => {
      c.fillStyle = '#0b120e';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#0c8c48';
      c.fillRect(0, 0, w, 52);
      c.fillStyle = '#d1fae5';
      c.font = 'bold 28px sans-serif';
      c.fillText('POINT COFFEE  •  MENU', 20, 36);
      c.font = 'bold 19px sans-serif';
      c.fillStyle = '#4ade80';
      c.fillText('Cold Brew Boost (+HP/Sprint)', 22, 210);
    }, false);

    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.08 });
    const wallTileMat = new THREE.MeshStandardMaterial({ color: 0xeaece9, roughness: 0.45, metalness: 0.06 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x262c36, roughness: 0.36, metalness: 0.72 });
    const brushedMat = new THREE.MeshStandardMaterial({ color: 0xd4dae0, roughness: 0.24, metalness: 0.86 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c4f2e, roughness: 0.66, metalness: 0.06 });
    const navyAccentMat = new THREE.MeshStandardMaterial({ color: 0x1e509e, roughness: 0.40, metalness: 0.25 });
    const redAccentMat = new THREE.MeshStandardMaterial({ color: 0xd62328, roughness: 0.40, metalness: 0.22 });
    const greenAccentMat = new THREE.MeshStandardMaterial({ color: 0x0e7c41, roughness: 0.42, metalness: 0.20 });
    const fasciaMat = new THREE.MeshStandardMaterial({
      map: fasciaMap, emissive: new THREE.Color(0xffffff), emissiveMap: fasciaEm, emissiveIntensity: 0.68, roughness: 0.36, metalness: 0.18
    });
    const chillerMat = new THREE.MeshStandardMaterial({
      map: chillerMap, emissive: new THREE.Color(0xffffff), emissiveMap: chillerEm, emissiveIntensity: 0.75, roughness: 0.22, metalness: 0.16
    });
    const menuMat = new THREE.MeshStandardMaterial({
      map: menuMap, emissive: new THREE.Color(0xffffff), emissiveMap: menuEm, emissiveIntensity: 0.65, roughness: 0.32, metalness: 0.15
    });
    const ceilGlowMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, emissive: new THREE.Color(0xfff1d6), emissiveIntensity: 1.25, roughness: 0.25
    });
    const pastryGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xdbeafe, roughness: 0.06, metalness: 0.08, transparent: true, opacity: 0.34, depthWrite: false
    });
    const pastryBunMat = new THREE.MeshStandardMaterial({ color: 0xc87a35, roughness: 0.62, metalness: 0.05 });

    station.disposableMaterials.push(
      floorMat, wallTileMat, steelMat, brushedMat, woodMat, navyAccentMat, redAccentMat,
      greenAccentMat, fasciaMat, chillerMat, menuMat, ceilGlowMat, pastryGlassMat, pastryBunMat
    );

    // 1) Floor reveal & threshold (walkable height 0.04m, well below 0.36m stepHeight)
    addPbrPart(station, grp, new THREE.BoxGeometry(5.64, 0.03, 3.64), steelMat, 0, 0.015, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(5.46, 0.04, 3.46), floorMat, 0, 0.02, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(2.40, 0.02, 0.22), brushedMat, 0, 0.01, 1.72);

    // 2) Walk-in shell: Back Wall, Left Wall, Right Wall + Open Front Wings (lx in [-1.20 .. +1.20] OPEN!)
    addPbrPart(station, grp, new THREE.BoxGeometry(5.60, 2.42, 0.16), wallTileMat, 0, 1.21, -1.72);
    addPbrPart(station, grp, new THREE.BoxGeometry(5.44, 0.12, 0.04), navyAccentMat, 0, 2.26, -1.63);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.16, 2.42, 3.60), wallTileMat, -2.72, 1.21, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.16, 2.42, 3.60), wallTileMat, 2.72, 1.21, 0);
    // Exterior decorative cladding stripes on side walls
    addPbrPart(station, grp, new THREE.BoxGeometry(0.04, 0.16, 3.44), redAccentMat, -2.81, 2.22, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.04, 0.16, 3.44), greenAccentMat, 2.81, 2.22, 0);

    addIndoCollider(0, -1.72, 5.60, 0.16, 0, 2.95, 'concrete');
    addIndoCollider(-2.72, 0, 0.16, 3.60, 0, 2.95, 'concrete');
    addIndoCollider(2.72, 0, 0.16, 3.60, 0, 2.95, 'concrete');

    // Front-Left & Front-Right storefront window wings (1.52m each, leaving exact 2.40m central doorway!)
    for (const sgn of [-1, 1]) {
      const wx = sgn * 1.96;
      addPbrPart(station, grp, new THREE.BoxGeometry(1.52, 0.56, 0.16), wallTileMat, wx, 0.28, 1.72);
      addPbrPart(station, grp, new THREE.BoxGeometry(1.52, 0.06, 0.18), brushedMat, wx, 0.57, 1.72);
      addPbrPart(station, grp, new THREE.BoxGeometry(0.14, 2.42, 0.18), steelMat, sgn * 2.70, 1.21, 1.72);
      addPbrPart(station, grp, new THREE.BoxGeometry(0.10, 2.42, 0.18), steelMat, sgn * 1.24, 1.21, 1.72);
      // Mullion walk collider + solid knee wall & steel jamb bullet colliders + shatterable storefront glass above knee wall
      addIndoCollider(wx, 1.72, 1.52, 0.18, 0, 2.42, 'metal', { blocksWalk: true, blocksBullets: false });
      addIndoCollider(wx, 1.72, 1.52, 0.18, 0, 0.58, 'concrete', { blocksWalk: true, blocksBullets: true });
      addIndoCollider(sgn * 1.24, 1.72, 0.10, 0.18, 0, 2.42, 'metal', { blocksWalk: true, blocksBullets: true });

      const gPos = inW(wx, 1.72);
      const cWin = addIndoCollider(wx, 1.72, 1.34, 0.10, 0.60, 2.32, 'glass', { blocksWalk: false, blocksBullets: true });
      glassRecords.push({
        cx: gPos[0], cy: 1.46, cz: gPos[1], w: 1.34, h: 1.72, d: 0.04,
        ry: indoYaw, hp: 20, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cWin
      });
    }
    // Overhead doorway header beam (y = 2.32..2.44)
    addPbrPart(station, grp, new THREE.BoxGeometry(5.60, 0.12, 0.18), steelMat, 0, 2.38, 1.72);

    // 3) Roof soffit, warm ceiling light & illuminated Indomaret Point / Point Coffee fascia (H = 2.95m)
    addPbrPart(station, grp, new THREE.BoxGeometry(5.74, 0.10, 3.74), steelMat, 0, 2.45, 0.04);
    addPbrPart(station, grp, new THREE.BoxGeometry(4.60, 0.03, 1.60), ceilGlowMat, 0, 2.39, -0.10);
    addPbrPart(station, grp, new THREE.BoxGeometry(5.62, 0.42, 3.62), fasciaMat, 0, 2.71, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(5.76, 0.04, 3.76), steelMat, 0, 2.93, 0);

    // 4) Interior Left Bay: Illuminated 2-door glass Beverage Chiller
    const chillerGrp = new THREE.Group();
    chillerGrp.name = 'IndomaretBeverageChiller';
    chillerGrp.position.set(-1.55, 0, -1.32);
    grp.add(chillerGrp);
    addPbrPart(station, chillerGrp, new THREE.BoxGeometry(1.90, 2.16, 0.58), steelMat, 0, 1.12, 0);
    addPbrPart(station, chillerGrp, new THREE.BoxGeometry(1.80, 2.04, 0.04), chillerMat, 0, 1.12, 0.30);
    for (const hX of [-0.07, 0.07]) {
      addPbrPart(station, chillerGrp, new THREE.BoxGeometry(0.03, 0.42, 0.04), brushedMat, hX, 1.08, 0.33);
    }
    addIndoCollider(-1.55, -1.32, 1.92, 0.60, 0, 2.20, 'metal', { blocksWalk: true });

    // 5) Interior Left-Center: Stocked Snack Gondola Shelves
    addPbrPart(station, grp, new THREE.BoxGeometry(1.34, 1.30, 0.10), steelMat, -1.78, 0.69, 0.35);
    for (const sx of [-2.42, -1.14]) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.06, 1.32, 0.44), steelMat, sx, 0.70, 0.35);
    }
    const snackPalette = [redAccentMat, navyAccentMat, greenAccentMat, pastryBunMat];
    for (let tier = 0; tier < 4; tier++) {
      const sy = 0.24 + tier * 0.32;
      addPbrPart(station, grp, new THREE.BoxGeometry(1.26, 0.04, 0.42), brushedMat, -1.78, sy, 0.35);
      for (let pk = 0; pk < 5; pk++) {
        const px = -2.26 + pk * 0.24;
        const pMat = snackPalette[(tier + pk) % snackPalette.length];
        addPbrPart(station, grp, new THREE.BoxGeometry(0.16, 0.20, 0.14), pMat, px, sy + 0.12, 0.24);
        addPbrPart(station, grp, new THREE.BoxGeometry(0.16, 0.18, 0.14), snackPalette[(tier + pk + 1) % snackPalette.length], px, sy + 0.11, 0.46);
      }
    }
    addIndoCollider(-1.78, 0.35, 1.38, 0.48, 0, 1.38, 'metal', { blocksWalk: true });

    // 6) Interior Right Bay: Point Coffee Bar Counter, Espresso Machine, Pastry Display & Menu Board
    addPbrPart(station, grp, new THREE.BoxGeometry(2.04, 0.08, 0.52), steelMat, 1.45, 0.08, -0.25);
    addPbrPart(station, grp, new THREE.BoxGeometry(2.06, 0.84, 0.56), woodMat, 1.45, 0.52, -0.25);
    addPbrPart(station, grp, new THREE.BoxGeometry(2.14, 0.06, 0.66), brushedMat, 1.45, 0.97, -0.25);
    addPbrPart(station, grp, new THREE.BoxGeometry(2.10, 0.86, 0.46), steelMat, 1.45, 0.47, -1.38);
    addPbrPart(station, grp, new THREE.BoxGeometry(2.14, 0.05, 0.50), brushedMat, 1.45, 0.92, -1.38);

    // 2-Group Commercial Espresso Machine
    addPbrPart(station, grp, new THREE.BoxGeometry(0.56, 0.36, 0.40), steelMat, 0.88, 1.18, -0.25);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.52, 0.06, 0.34), brushedMat, 0.88, 1.38, -0.25);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.58, 0.04, 0.16), brushedMat, 0.88, 1.02, -0.02);
    // Cup stacks & POS Register
    addPbrPart(station, grp, new THREE.CylinderGeometry(0.045, 0.038, 0.24, 10), greenAccentMat, 1.24, 1.12, -0.24);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.32, 0.22, 0.18), steelMat, 1.50, 1.11, -0.25);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.26, 0.16, 0.03), chillerMat, 1.50, 1.24, -0.20, -0.35);
    // Glass Pastry Display Case with golden croissants/buns
    addPbrPart(station, grp, new THREE.BoxGeometry(0.58, 0.06, 0.38), steelMat, 2.02, 1.03, -0.24);
    for (const bx of [1.86, 2.02, 2.18]) {
      addPbrPart(station, grp, new THREE.SphereGeometry(0.055, 8, 6), pastryBunMat, bx, 1.10, -0.24);
    }
    addPbrPart(station, grp, new THREE.BoxGeometry(0.56, 0.26, 0.36), pastryGlassMat, 2.02, 1.19, -0.24);

    // Backlit Point Coffee Menu Board on Rear Wall
    addPbrPart(station, grp, new THREE.BoxGeometry(2.12, 0.82, 0.05), steelMat, 1.45, 1.72, -1.61);
    addPbrPart(station, grp, new THREE.BoxGeometry(2.04, 0.74, 0.06), menuMat, 1.45, 1.72, -1.59);

    addIndoCollider(1.45, -0.25, 2.12, 0.66, 0, 1.36, 'wood', { blocksWalk: true });
    addIndoCollider(1.45, -1.38, 2.12, 0.50, 0, 1.18, 'wood', { blocksWalk: true });

    // 7) Interactive Chiller Minuman & Point Coffee inside store (radius: 2.3)
    const chillIntP = inW(-1.15, -0.95);
    const chillUsed = station._usedIds.has('indomaret_chiller');
    station.interactables.push({
      id: 'indomaret_chiller',
      type: 'indomaret_chiller',
      x: chillIntP[0],
      y: 1.15,
      z: chillIntP[1],
      radius: 2.3,
      label: chillUsed ? '[E] Chiller Indomaret & Point Coffee (Sudah Diambil)' : '[E] Ambil Minuman Dingin & Point Coffee (+20 HP & +15s Fast Sprint)',
      prompt: chillUsed ? '[E] Chiller Indomaret & Point Coffee (Sudah Diambil)' : '[E] Ambil Minuman Dingin & Point Coffee (+20 HP & +15s Fast Sprint)',
      used: chillUsed,
      targetObj: chillerGrp
    });
    if (typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget('indomaret_chiller', chillerGrp, {
        category: 'interactable', x: chillIntP[0], y: 1.15, z: chillIntP[1], hitRadius: 1.15
      });
    }

    const walkIn = inW(-0.35, 0.55);
    const frontDoor = inW(0, 2.55);
    const warmCtr = inW(0, 0.1);
    return {
      walkInPos: { x: walkIn[0], y: 0.05, z: walkIn[1], yaw: indoYaw },
      frontPos: { x: frontDoor[0], y: 0.05, z: frontDoor[1], yaw: indoYaw },
      warmAnchor: { x: warmCtr[0], y: 2.25, z: warmCtr[1] }
    };
  }

  function buildDetailedJaklingkoKiosk(station, root, x, z, yaw) {
    const grp = new THREE.Group();
    grp.name = 'JakLingkoKiosk3D';
    grp.position.set(x, 0, z);
    grp.rotation.y = yaw;
    root.add(grp);

    const headerMap = makeCanvasTex(station, 256, 128, (c, w, h) => {
      c.fillStyle = '#143d87';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#38bdf8';
      c.fillRect(0, 108, w, 20);
      c.fillStyle = '#ffffff';
      c.font = 'bold 30px sans-serif';
      c.textAlign = 'center';
      c.fillText('JAKLINGKO', w * 0.5, 52);
      c.font = 'bold 16px sans-serif';
      c.fillStyle = '#bae6fd';
      c.fillText('TOP UP KUE / E-MONEY', w * 0.5, 86);
    }, false);
    const screenMap = makeCanvasTex(station, 256, 256, (c, w, h) => {
      c.fillStyle = '#0c1c36';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#0284c7';
      c.fillRect(14, 14, w - 28, 46);
      c.fillStyle = '#ffffff';
      c.font = 'bold 18px sans-serif';
      c.textAlign = 'center';
      c.fillText('PILIH NOMINAL TOP UP', w * 0.5, 44);
      const btns = ['Rp 20.000', 'Rp 50.000', 'Rp 100.000', 'QRIS / NFC'];
      for (let i = 0; i < 4; i++) {
        const bx = 18 + (i % 2) * 114;
        const by = 78 + Math.floor(i / 2) * 74;
        c.fillStyle = i === 3 ? '#16a34a' : '#1d4ed8';
        c.fillRect(bx, by, 104, 58);
        c.fillStyle = '#f8fafc';
        c.font = 'bold 15px sans-serif';
        c.fillText(btns[i], bx + 52, by + 34);
      }
    }, false);

    const brushedMat = new THREE.MeshStandardMaterial({ color: 0xd0d7e0, roughness: 0.24, metalness: 0.88 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.58 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x1a4ba0, roughness: 0.36, metalness: 0.28 });
    const headerMat = new THREE.MeshStandardMaterial({
      map: headerMap, emissive: new THREE.Color(0xffffff), emissiveMap: headerMap, emissiveIntensity: 0.58, roughness: 0.32
    });
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenMap, emissive: new THREE.Color(0xffffff), emissiveMap: screenMap, emissiveIntensity: 0.88, roughness: 0.16
    });
    const nfcLedMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee, emissive: new THREE.Color(0x10b981), emissiveIntensity: 1.5, roughness: 0.20
    });
    station.disposableMaterials.push(brushedMat, darkMat, blueMat, headerMat, screenMat, nfcLedMat);

    addPbrPart(station, grp, new THREE.BoxGeometry(0.92, 0.08, 0.72), darkMat, 0, 0.04, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.76, 1.92, 0.54), blueMat, 0, 1.04, -0.02);
    for (const sx of [-0.40, 0.40]) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.08, 1.98, 0.62), brushedMat, sx, 1.07, 0);
    }
    // Top backlit header box
    addPbrPart(station, grp, new THREE.BoxGeometry(0.84, 0.28, 0.64), darkMat, 0, 1.94, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.76, 0.22, 0.03), headerMat, 0, 1.94, 0.32);
    // Sloped touchscreen bezel & screen
    addPbrPart(station, grp, new THREE.BoxGeometry(0.70, 0.54, 0.22), darkMat, 0, 1.38, 0.20, -0.32);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.58, 0.42, 0.04), screenMat, 0, 1.38, 0.30, -0.32);
    // Utility tray shelf (top flush at y = 1.04, z = +0.44 in local space) + NFC pad & LED
    addPbrPart(station, grp, new THREE.BoxGeometry(0.74, 0.05, 0.32), brushedMat, 0, 1.015, 0.42);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.22, 0.03, 0.16), darkMat, -0.22, 1.05, 0.42);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.18, 0.015, 0.04), nfcLedMat, -0.22, 1.07, 0.46);
    // Bill acceptor & card dispenser pocket
    addPbrPart(station, grp, new THREE.BoxGeometry(0.24, 0.10, 0.06), darkMat, 0.18, 0.84, 0.26);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.52, 0.22, 0.06), darkMat, 0, 0.52, 0.26);

    station._addCollider(x - 0.48, 0, z - 0.44, x + 0.48, 2.10, z + 0.44, 'metal');
    return grp;
  }

  function buildDetailedCowayStation(station, root, x, z, yaw) {
    const grp = new THREE.Group();
    grp.name = 'CowayStation3D';
    grp.position.set(x, 0, z);
    grp.rotation.y = yaw;
    root.add(grp);

    const headerMap = makeCanvasTex(station, 256, 128, (c, w, h) => {
      c.fillStyle = '#d41e2a';
      c.fillRect(0, 0, w, 78);
      c.fillStyle = '#f1f5f9';
      c.fillRect(0, 78, w, 50);
      c.fillStyle = '#ffffff';
      c.font = 'bold 34px sans-serif';
      c.textAlign = 'center';
      c.fillText('coway', w * 0.5, 50);
      c.fillStyle = '#1e3a8a';
      c.font = 'bold 16px sans-serif';
      c.fillText('AIR MINUM STERIL RO GRATIS', w * 0.5, 110);
    }, false);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeef3f6, roughness: 0.28, metalness: 0.12 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.22, metalness: 0.88 });
    const darkNicheMat = new THREE.MeshStandardMaterial({ color: 0x1e252e, roughness: 0.42, metalness: 0.68 });
    const headerMat = new THREE.MeshStandardMaterial({
      map: headerMap, emissive: new THREE.Color(0xffffff), emissiveMap: headerMap, emissiveIntensity: 0.45, roughness: 0.32
    });
    const hotLedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: new THREE.Color(0xef4444), emissiveIntensity: 1.5 });
    const coldLedMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: new THREE.Color(0x38bdf8), emissiveIntensity: 1.5 });
    const okLedMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: new THREE.Color(0x22c55e), emissiveIntensity: 1.4 });
    station.disposableMaterials.push(whiteMat, steelMat, darkNicheMat, headerMat, hotLedMat, coldLedMat, okLedMat);

    // Base plinth & upright white body with stainless trim pillars
    addPbrPart(station, grp, new THREE.BoxGeometry(1.14, 0.08, 0.64), darkNicheMat, 0, 0.04, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(1.06, 1.84, 0.50), whiteMat, 0, 1.00, -0.04);
    for (const sx of [-0.52, 0.52]) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.06, 1.86, 0.56), steelMat, sx, 1.01, -0.01);
    }
    // Top Coway illuminated branding fascia
    addPbrPart(station, grp, new THREE.BoxGeometry(1.04, 0.34, 0.56), whiteMat, 0, 1.74, -0.01);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.96, 0.30, 0.04), headerMat, 0, 1.74, 0.27);
    // Recessed stainless water dispensing niche framed by upper/lower cheeks & side panels
    addPbrPart(station, grp, new THREE.BoxGeometry(0.76, 0.14, 0.16), whiteMat, 0, 1.44, 0.21);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.16, 0.60, 0.16), whiteMat, -0.44, 1.08, 0.21);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.16, 0.60, 0.16), whiteMat, 0.44, 1.08, 0.21);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.72, 0.56, 0.04), darkNicheMat, 0, 1.08, 0.18);
    // Perforated stainless drip tray shelf
    addPbrPart(station, grp, new THREE.BoxGeometry(0.74, 0.06, 0.22), steelMat, 0, 0.77, 0.24);
    // Dual chrome spigots (Hot + Cold) + Hot/Cold/Normal status LEDs
    addPbrPart(station, grp, new THREE.CylinderGeometry(0.022, 0.018, 0.12, 8), steelMat, -0.16, 1.24, 0.25);
    addPbrPart(station, grp, new THREE.CylinderGeometry(0.022, 0.018, 0.12, 8), steelMat, 0.16, 1.24, 0.25);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.08, 0.03, 0.02), hotLedMat, -0.16, 1.44, 0.29);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.08, 0.03, 0.02), okLedMat, 0, 1.44, 0.29);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.08, 0.03, 0.02), coldLedMat, 0.16, 1.44, 0.29);
    // Lower filtration access door
    addPbrPart(station, grp, new THREE.BoxGeometry(0.92, 0.68, 0.10), whiteMat, 0, 0.40, 0.22);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.14, 0.03, 0.03), steelMat, 0, 0.62, 0.28);

    station._addCollider(x - 0.60, 0, z - 0.36, x + 0.60, 1.98, z + 0.36, 'metal');
    return grp;
  }

  function buildCallTrainPedestal(station, ctx, x, z, isPrev, destName) {
    const { root } = ctx;
    const grp = new THREE.Group();
    grp.name = isPrev ? 'CallTrainPedestalP2' : 'CallTrainPedestalP1';
    grp.position.set(x, 0, z);
    grp.rotation.y = isPrev ? -Math.PI * 0.5 : Math.PI * 0.5;
    root.add(grp);

    const accentHex = isPrev ? 0xf59e0b : 0x10b981;
    const darkHex = isPrev ? '#241406' : '#08241d';
    const badgeHex = isPrev ? '#d97706' : '#059669';
    const subHex = isPrev ? '#fde68a' : '#6ee7b7';

    const powderMat = new THREE.MeshStandardMaterial({ color: 0x1c222b, roughness: 0.48, metalness: 0.66 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.24, metalness: 0.88 });
    const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.56, metalness: 0.52 });
    const ledMat = new THREE.MeshStandardMaterial({
      color: accentHex, emissive: new THREE.Color(accentHex), emissiveIntensity: 1.65, roughness: 0.20, metalness: 0.12
    });

    const faceMap = makeCanvasTex(station, 384, 384, (c, w, h) => {
      c.fillStyle = '#141b24';
      c.fillRect(0, 0, w, h);
      // Brushed stainless border
      c.strokeStyle = '#94a3b8';
      c.lineWidth = 8;
      c.strokeRect(10, 10, w - 20, h - 20);
      // KAI LRT header plate
      c.fillStyle = darkHex;
      c.fillRect(22, 22, w - 44, 152);
      c.fillStyle = badgeHex;
      c.fillRect(22, 22, w - 44, 42);
      c.fillStyle = '#ffffff';
      c.font = 'bold 21px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('PANGGIL KERETA LRT', w * 0.5, 43);

      c.fillStyle = subHex;
      c.font = 'bold 17px sans-serif';
      c.fillText(isPrev ? 'PERON 2  •  ← KEMBALI' : 'PERON 1  •  → MAJU', w * 0.5, 92);
      c.fillStyle = '#ffffff';
      c.font = 'bold 22px sans-serif';
      c.fillText(String(destName || '').toUpperCase().slice(0, 18), w * 0.5, 132);
      c.fillStyle = '#94a3b8';
      c.font = 'bold 13px sans-serif';
      c.fillText('KAI LRT JABODEBEK  •  INTERKOM DARURAT', w * 0.5, 162);

      // Lower panel background behind physical button & speaker grille
      c.fillStyle = '#1e2733';
      c.fillRect(22, 188, w - 44, 174);
      c.fillStyle = '#cbd5e1';
      c.font = 'bold 15px sans-serif';
      c.fillText('TEKAN TOMBOL [E]', w * 0.5, 212);
    }, false);
    const faceEm = makeCanvasTex(station, 384, 384, (c, w, h) => {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, w, h);
      c.fillStyle = darkHex;
      c.fillRect(22, 22, w - 44, 152);
      c.fillStyle = badgeHex;
      c.fillRect(22, 22, w - 44, 42);
      c.fillStyle = '#ffffff';
      c.font = 'bold 21px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('PANGGIL KERETA LRT', w * 0.5, 43);
      c.fillStyle = subHex;
      c.font = 'bold 17px sans-serif';
      c.fillText(isPrev ? 'PERON 2  •  ← KEMBALI' : 'PERON 1  •  → MAJU', w * 0.5, 92);
      c.fillStyle = '#f8fafc';
      c.font = 'bold 22px sans-serif';
      c.fillText(String(destName || '').toUpperCase().slice(0, 18), w * 0.5, 132);
    }, false);
    const faceMat = new THREE.MeshStandardMaterial({
      map: faceMap, emissive: new THREE.Color(0xffffff), emissiveMap: faceEm, emissiveIntensity: 0.72, roughness: 0.28, metalness: 0.25
    });
    station.disposableMaterials.push(powderMat, steelMat, darkTrimMat, ledMat, faceMat);

    // 1) Heavy bolted steel floor flange + 4 corner hex anchor bolts
    addPbrPart(station, grp, new THREE.BoxGeometry(0.54, 0.045, 0.50), steelMat, 0, 0.0225, 0);
    for (const bx of [-0.21, 0.21]) {
      for (const bz of [-0.19, 0.19]) {
        addPbrPart(station, grp, new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6), darkTrimMat, bx, 0.055, bz);
      }
    }
    // 2) Tapered beveled powder-coated pedestal shaft + brushed stainless side trim pillars
    addPbrPart(station, grp, new THREE.BoxGeometry(0.38, 0.22, 0.34), powderMat, 0, 0.155, 0);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.32, 0.84, 0.28), powderMat, 0, 0.68, -0.01);
    for (const sx of [-0.175, 0.175]) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.035, 1.38, 0.30), steelMat, sx, 0.74, 0);
    }
    // Side illuminated direction status bars
    for (const sx of [-0.196, 0.196]) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.012, 0.36, 0.05), ledMat, sx, 1.24, 0.04);
    }
    // 3) Upper hooded kiosk head & brushed faceplate (y = 1.06..1.52)
    addPbrPart(station, grp, new THREE.BoxGeometry(0.40, 0.44, 0.34), powderMat, 0, 1.28, 0.01);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.42, 0.04, 0.42), steelMat, 0, 1.50, 0.04);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.42, 0.10, 0.03), steelMat, 0, 1.46, 0.23, 0.18);
    // Front angled LCD faceplate + rear brushed access cover
    addPbrPart(station, grp, new THREE.BoxGeometry(0.36, 0.38, 0.03), steelMat, 0, 1.27, 0.175, -0.10);
    addPbrPart(station, grp, new THREE.PlaneGeometry(0.32, 0.34), faceMat, 0, 1.27, 0.194, -0.10);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.28, 0.66, 0.02), steelMat, 0, 0.72, -0.16);
    // 4) Tactile glowing push-button ring + stainless plunger + intercom speaker grille
    addPbrPart(station, grp, new THREE.CylinderGeometry(0.058, 0.062, 0.03, 18), ledMat, 0, 1.01, 0.16, Math.PI * 0.5 - 0.10);
    addPbrPart(station, grp, new THREE.CylinderGeometry(0.038, 0.038, 0.045, 16), steelMat, 0, 1.01, 0.168, Math.PI * 0.5 - 0.10);
    addPbrPart(station, grp, new THREE.BoxGeometry(0.22, 0.12, 0.03), darkTrimMat, 0, 0.84, 0.14);
    for (let gy = -1; gy <= 1; gy++) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.16, 0.014, 0.015), steelMat, 0, 0.84 + gy * 0.032, 0.156);
    }

    station._addCollider(x - 0.28, 0, z - 0.28, x + 0.28, 1.56, z + 0.28, 'metal');
    return grp;
  }

  function buildCallTrainPidsSign(station, ctx, x, z, isPrev, destName) {
    const { root, getCanopyArchY, isCawang, jpoNearZ, jpoFarZ } = ctx;
    const grp = new THREE.Group();
    grp.name = isPrev ? 'CallTrainPidsBoardP2' : 'CallTrainPidsBoardP1';
    root.add(grp);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.42, metalness: 0.72 });
    station.disposableMaterials.push(frameMat);

    // Overhead Platform PIDS Signboard (y = 3.10m, suspended clear of Cawang JPO soffit & canopies)
    const signY = 3.10;
    const signW = 2.24;
    const signH = 0.56;
    const roofY = (isCawang && z >= jpoNearZ - 0.5 && z <= jpoFarZ + 0.5)
      ? 3.97
      : (getCanopyArchY(x) + 0.08);
    const rodLen = Math.max(0.25, roofY - (signY + signH * 0.5));

    const pidsMap = makeCanvasTex(station, 512, 160, (c, w, h) => {
      c.fillStyle = isPrev ? '#241406' : '#08241d';
      c.fillRect(0, 0, w, h);
      c.fillStyle = isPrev ? '#f59e0b' : '#10b981';
      c.fillRect(0, 0, w, 14);
      c.fillRect(0, h - 10, w, 10);
      // Badge
      c.fillStyle = isPrev ? '#d97706' : '#059669';
      c.fillRect(14, 24, 68, 112);
      c.fillStyle = '#ffffff';
      c.font = 'bold 34px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(isPrev ? 'P2' : 'P1', 48, 80);
      // Direction & Destination
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillStyle = isPrev ? '#fde68a' : '#6ee7b7';
      c.font = 'bold 20px sans-serif';
      c.fillText(isPrev ? '← KEMBALI (PERON 2)' : '→ MAJU (PERON 1)', 98, 52);
      c.fillStyle = '#ffffff';
      c.font = 'bold 29px sans-serif';
      c.fillText(String(destName || '').toUpperCase().slice(0, 22), 98, 96);
      c.fillStyle = '#cbd5e1';
      c.font = 'bold 15px sans-serif';
      c.fillText('LRT JABODEBEK  •  TEKAN [E] PANGGIL KERETA', 98, 130);
    }, false);
    const pidsEm = makeCanvasTex(station, 512, 160, (c, w, h) => {
      c.fillStyle = isPrev ? '#1c0f04' : '#051a14';
      c.fillRect(0, 0, w, h);
      c.fillStyle = isPrev ? '#f59e0b' : '#10b981';
      c.fillRect(0, 0, w, 12);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillStyle = isPrev ? '#fde68a' : '#6ee7b7';
      c.font = 'bold 20px sans-serif';
      c.fillText(isPrev ? '← KEMBALI (PERON 2)' : '→ MAJU (PERON 1)', 98, 52);
      c.fillStyle = '#e2f8f0';
      c.font = 'bold 29px sans-serif';
      c.fillText(String(destName || '').toUpperCase().slice(0, 22), 98, 96);
    }, false);
    const pidsMat = new THREE.MeshStandardMaterial({
      map: pidsMap, emissive: new THREE.Color(0xffffff), emissiveMap: pidsEm, emissiveIntensity: 0.78, roughness: 0.30
    });
    station.disposableMaterials.push(pidsMat);

    addPbrPart(station, grp, new THREE.BoxGeometry(signW + 0.08, signH + 0.06, 0.12), frameMat, x, signY, z);
    addPbrPart(station, grp, new THREE.PlaneGeometry(signW, signH), pidsMat, x, signY, z + 0.065);
    addPbrPart(station, grp, new THREE.PlaneGeometry(signW, signH), pidsMat, x, signY, z - 0.065, 0, Math.PI, 0);
    for (const rx of [-0.85, 0.85]) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.04, rodLen, 0.04), frameMat, x + rx, signY + signH * 0.5 + rodLen * 0.5, z);
    }
  }

  function buildJpo2SkybridgeLounge(station, ctx) {
    const {
      root, arch, isIsland, isCawang, p1MinX, p1MaxX, i2MaxX, track2X,
      jpo2Z, jpoPergolaY, isInStairExclusion
    } = ctx;
    if (jpo2Z === null || jpo2Z === undefined) return null;

    const UPPER_FLOOR_Y = S.CONST.UPPER_FLOOR_Y;
    const farDir = jpo2Z > 0 ? 1 : -1;
    const farZ = jpo2Z + farDir * 1.92;
    const nearZ = jpo2Z - farDir * 1.82;
    const faceYaw = farDir > 0 ? Math.PI : 0;
    const benchRotY = farDir > 0 ? 0 : Math.PI;
    const benchPlayerYaw = farDir > 0 ? Math.PI : 0;

    // Guaranteed stair-free lounge center X across all archetypes
    let loungeCX = -2.0;
    if (isCawang) loungeCX = 12.4;
    else if (arch.hasGardenTerrace) loungeCX = 11.4;
    else if (isIsland) loungeCX = 9.95;

    const grp = new THREE.Group();
    grp.name = 'JPO2SkybridgeLounge';
    root.add(grp);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x222933, roughness: 0.38, metalness: 0.72 });
    const brushedMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.24, metalness: 0.88 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xdbeafe, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.26, depthWrite: false });
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.92 });
    const leafMatA = new THREE.MeshStandardMaterial({ color: 0x2f6b32, roughness: 0.78 });
    const leafMatB = new THREE.MeshStandardMaterial({ color: 0x458b3d, roughness: 0.74 });
    const cctvDomeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.45 });
    const cctvLedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: new THREE.Color(0xef4444), emissiveIntensity: 1.6 });
    station.disposableMaterials.push(frameMat, brushedMat, glassMat, soilMat, leafMatA, leafMatB, cctvDomeMat, cctvLedMat);

    // 1) Standing Backlit Peta Rute & Integrasi LRT Jabodebek Board
    const routeMapTex = makeCanvasTex(station, 512, 320, (c, w, h) => {
      c.fillStyle = '#f8fafc';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#16325c';
      c.fillRect(0, 0, w, 54);
      c.fillStyle = '#e5b82e';
      c.fillRect(0, 54, w, 6);
      c.fillStyle = '#ffffff';
      c.font = 'bold 21px sans-serif';
      c.fillText('PETA RUTE & INTEGRASI LRT JABODEBEK', 18, 34);

      c.strokeStyle = '#1d4ed8';
      c.lineWidth = 8;
      c.beginPath(); c.moveTo(42, 145); c.lineTo(310, 145); c.lineTo(468, 108); c.stroke();
      c.strokeStyle = '#15803d';
      c.lineWidth = 8;
      c.beginPath(); c.moveTo(310, 145); c.lineTo(468, 188); c.stroke();

      const stops = ['Dukuh Atas', 'Setiabudi', 'Kuningan', 'Cikoko', 'Cawang'];
      for (let i = 0; i < stops.length; i++) {
        const sx = 44 + i * 66;
        const isHere = arch && arch.name && arch.name.toLowerCase().indexOf(stops[i].toLowerCase()) !== -1;
        c.fillStyle = isHere ? '#ef4444' : '#ffffff';
        c.beginPath(); c.arc(sx, 145, isHere ? 10 : 7, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#16325c'; c.lineWidth = 2.5; c.stroke();
        c.fillStyle = '#0f172a';
        c.font = isHere ? 'bold 12px sans-serif' : '11px sans-serif';
        c.textAlign = 'center';
        c.fillText(stops[i], sx, 174);
      }
      c.textAlign = 'left';
      c.fillStyle = '#1e293b';
      c.font = 'bold 14px sans-serif';
      c.fillText('TRANSIT: KRL Commuter  •  TransJakarta  •  Whoosh Halim', 22, 238);
      c.fillStyle = '#0e7c41';
      c.fillRect(20, 260, 472, 42);
      c.fillStyle = '#ffffff';
      c.font = 'bold 15px sans-serif';
      c.fillText('AREA TUNGGU JPO 2  •  PERON 1 (MAJU)  |  PERON 2 (KEMBALI)', 32, 286);
    }, false);
    const routeBoardMat = new THREE.MeshStandardMaterial({
      map: routeMapTex, emissive: new THREE.Color(0xffffff), emissiveMap: routeMapTex, emissiveIntensity: 0.38, roughness: 0.36
    });
    station.disposableMaterials.push(routeBoardMat);

    addPbrPart(station, grp, new THREE.BoxGeometry(1.56, 0.08, 0.28), frameMat, loungeCX, UPPER_FLOOR_Y + 0.04, farZ);
    for (const px of [-0.74, 0.74]) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.08, 2.02, 0.14), frameMat, loungeCX + px, UPPER_FLOOR_Y + 1.01, farZ);
    }
    addPbrPart(station, grp, new THREE.BoxGeometry(1.52, 1.04, 0.12), frameMat, loungeCX, UPPER_FLOOR_Y + 1.48, farZ);
    addPbrPart(station, grp, new THREE.PlaneGeometry(1.44, 0.94), routeBoardMat, loungeCX, UPPER_FLOOR_Y + 1.48, farZ - farDir * 0.065, 0, faceYaw, 0);
    station._addCollider(loungeCX - 0.82, UPPER_FLOOR_Y, farZ - 0.16, loungeCX + 0.82, UPPER_FLOOR_Y + 2.05, farZ + 0.16, 'metal');

    // 2) Dual Automated Beverage & Snack Vending Machines
    const buildVending = (vx, isSnack) => {
      const vz = jpo2Z + farDir * 1.76;
      const vMap = makeCanvasTex(station, 256, 512, (c, w, h) => {
        c.fillStyle = isSnack ? '#7c2d12' : '#0c356a';
        c.fillRect(0, 0, w, h);
        c.fillStyle = isSnack ? '#f59e0b' : '#0ea5e9';
        c.fillRect(0, 0, w, 64);
        c.fillStyle = '#ffffff';
        c.font = 'bold 22px sans-serif';
        c.textAlign = 'center';
        c.fillText(isSnack ? 'SNACK MART' : 'COLD DRINKS', w * 0.5, 42);
        c.fillStyle = '#e0f2fe';
        c.fillRect(20, 82, 216, 268);
        const cols = isSnack ? ['#ef4444', '#f59e0b', '#eab308', '#8b5cf6'] : ['#06b6d4', '#16a34a', '#2563eb', '#dc2626'];
        for (let r = 0; r < 5; r++) {
          const ry = 94 + r * 52;
          c.fillStyle = '#334155';
          c.fillRect(24, ry + 36, 208, 6);
          for (let col = 0; col < 5; col++) {
            c.fillStyle = cols[(r + col) % cols.length];
            c.fillRect(32 + col * 40, ry + 8, 28, 28);
          }
        }
        c.fillStyle = '#111827';
        c.fillRect(36, 376, 184, 96);
      }, false);
      const vEm = makeCanvasTex(station, 256, 512, (c, w, h) => {
        c.fillStyle = '#000000'; c.fillRect(0, 0, w, h);
        c.fillStyle = isSnack ? '#92400e' : '#0369a1';
        c.fillRect(0, 0, w, 64);
        c.fillStyle = '#3b566e';
        c.fillRect(24, 86, 208, 260);
      }, false);
      const vFaceMat = new THREE.MeshStandardMaterial({
        map: vMap, emissive: new THREE.Color(0xffffff), emissiveMap: vEm, emissiveIntensity: 0.72, roughness: 0.26
      });
      station.disposableMaterials.push(vFaceMat);

      const vGrp = new THREE.Group();
      vGrp.position.set(vx, UPPER_FLOOR_Y, vz);
      vGrp.rotation.y = faceYaw;
      grp.add(vGrp);
      addPbrPart(station, vGrp, new THREE.BoxGeometry(0.80, 1.98, 0.60), frameMat, 0, 0.99, 0);
      addPbrPart(station, vGrp, new THREE.BoxGeometry(0.74, 1.90, 0.03), vFaceMat, 0, 0.99, 0.30);
      addPbrPart(station, vGrp, new THREE.BoxGeometry(0.66, 0.96, 0.02), glassMat, 0, 1.18, 0.32);
      addPbrPart(station, vGrp, new THREE.BoxGeometry(0.12, 0.24, 0.04), brushedMat, 0.28, 0.98, 0.32);
      station._addCollider(vx - 0.43, UPPER_FLOOR_Y, vz - 0.34, vx + 0.43, UPPER_FLOOR_Y + 2.00, vz + 0.34, 'metal');
    };
    buildVending(loungeCX - 1.38, false);
    buildVending(loungeCX + 1.38, true);

    // 3) Planters with Lush Greenery & Trash Bins
    for (const pxOff of [-2.05, 2.05]) {
      const px = loungeCX + pxOff;
      addPbrPart(station, grp, new THREE.BoxGeometry(0.42, 0.36, 0.42), frameMat, px, UPPER_FLOOR_Y + 0.18, farZ);
      addPbrPart(station, grp, new THREE.BoxGeometry(0.36, 0.04, 0.36), soilMat, px, UPPER_FLOOR_Y + 0.35, farZ);
      addPbrPart(station, grp, new THREE.DodecahedronGeometry(0.22, 0), leafMatA, px, UPPER_FLOOR_Y + 0.56, farZ);
      addPbrPart(station, grp, new THREE.DodecahedronGeometry(0.16, 0), leafMatB, px + 0.06, UPPER_FLOOR_Y + 0.72, farZ - 0.04);
      station._addCollider(px - 0.24, UPPER_FLOOR_Y, farZ - 0.24, px + 0.24, UPPER_FLOOR_Y + 0.75, farZ + 0.24, 'concrete', { blocksBullets: false });
    }
    const binXLeft = isIsland && !isCawang && !arch.hasGardenTerrace ? loungeCX - 2.05 : loungeCX - 2.65;
    const binZ = isIsland && !isCawang && !arch.hasGardenTerrace ? (jpo2Z + farDir * 1.25) : farZ;
    addTrashBinProp(station, grp, binXLeft, UPPER_FLOOR_Y, binZ);
    if (!(isIsland && !isCawang && !arch.hasGardenTerrace)) {
      addTrashBinProp(station, grp, loungeCX + 2.65, UPPER_FLOOR_Y, farZ);
    }

    // 4) Two Sittable Commuter Benches (sittable: true) + Skybridge Tactical Bench with jpo2_supply
    const benchScaleX = (isIsland && !isCawang && !arch.hasGardenTerrace) ? 0.80 : 0.92;
    const seatZOff = farDir * 0.24;
    const standZOff = farDir * 0.92;
    addBenchProp(station, grp, 'bench_jpo2_0', loungeCX - 1.48, UPPER_FLOOR_Y, nearZ, benchRotY, benchPlayerYaw, 0, seatZOff, 0, standZOff, benchScaleX);
    addBenchProp(station, grp, 'bench_jpo2_1', loungeCX + 1.48, UPPER_FLOOR_Y, nearZ, benchRotY, benchPlayerYaw, 0, seatZOff, 0, standZOff, benchScaleX);

    // Tactical Bench + Tas Logistik JPO Sekunder (jpo2_supply)
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x3b4d36, roughness: 0.65, metalness: 0.14 });
    const strapMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.42, metalness: 0.45 });
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: new THREE.Color(0x7f1d1d), emissiveIntensity: 0.55, roughness: 0.35 });
    station.disposableMaterials.push(bagMat, strapMat, crossMat);

    addPbrPart(station, grp, new THREE.BoxGeometry(0.84, 0.06, 0.46), brushedMat, loungeCX, UPPER_FLOOR_Y + 0.45, nearZ);
    for (const lx of [-0.36, 0.36]) {
      addPbrPart(station, grp, new THREE.BoxGeometry(0.06, 0.42, 0.42), frameMat, loungeCX + lx, UPPER_FLOOR_Y + 0.21, nearZ);
    }
    // 3D Tactical Logistics Bag sitting on Tactical Bench
    const bagGrp = new THREE.Group();
    bagGrp.name = 'Jpo2SupplyBag';
    bagGrp.position.set(loungeCX, UPPER_FLOOR_Y + 0.60, nearZ);
    bagGrp.rotation.y = 0.12;
    grp.add(bagGrp);
    addPbrPart(station, bagGrp, new THREE.BoxGeometry(0.54, 0.24, 0.32), bagMat, 0, 0, 0);
    addPbrPart(station, bagGrp, new THREE.BoxGeometry(0.10, 0.26, 0.34), strapMat, -0.14, 0, 0);
    addPbrPart(station, bagGrp, new THREE.BoxGeometry(0.10, 0.26, 0.34), strapMat, 0.14, 0, 0);
    addPbrPart(station, bagGrp, new THREE.BoxGeometry(0.12, 0.03, 0.04), crossMat, 0, 0.13, 0);
    addPbrPart(station, bagGrp, new THREE.BoxGeometry(0.04, 0.03, 0.12), crossMat, 0, 0.13, 0);
    station._addCollider(loungeCX - 0.44, UPPER_FLOOR_Y, nearZ - 0.26, loungeCX + 0.44, UPPER_FLOOR_Y + 0.80, nearZ + 0.26, 'metal');

    const jpo2Used = station._usedIds.has('jpo2_supply');
    station.interactables.push({
      id: 'jpo2_supply',
      type: 'jpo2_supply',
      x: loungeCX,
      y: UPPER_FLOOR_Y + 0.75,
      z: nearZ,
      label: jpo2Used ? '[E] Tas Logistik JPO Sekunder (Sudah Diambil)' : '[E] Ambil Tas Logistik JPO Sekunder (+20 Amunisi & +15 HP)',
      prompt: jpo2Used ? '[E] Tas Logistik JPO Sekunder (Sudah Diambil)' : '[E] Ambil Tas Logistik JPO Sekunder (+20 Amunisi & +15 HP)',
      used: jpo2Used,
      targetObj: bagGrp
    });
    if (typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget('jpo2_supply', bagGrp, {
        category: 'interactable', x: loungeCX, y: UPPER_FLOOR_Y + 0.62, z: nearZ, hitRadius: 0.55
      });
    }
    placeFieldLogProp(station, grp, 'jpo2_supply', loungeCX + 0.26, UPPER_FLOOR_Y + 0.485, nearZ + farDir * 0.08, 0.2, jpo2Used, true);

    // 5) Ceiling CCTV Domes under JPO 2 Pergola Soffit
    const cctvY = (jpoPergolaY || 6.95) - 0.14;
    for (const [cxOff, czOff] of [[-1.5, farDir * 1.2], [1.5, -farDir * 1.2]]) {
      addPbrPart(station, grp, new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), frameMat, loungeCX + cxOff, cctvY, jpo2Z + czOff);
      addPbrPart(station, grp, new THREE.SphereGeometry(0.10, 12, 8), cctvDomeMat, loungeCX + cxOff, cctvY - 0.06, jpo2Z + czOff);
      addPbrPart(station, grp, new THREE.BoxGeometry(0.025, 0.025, 0.025), cctvLedMat, loungeCX + cxOff + 0.08, cctvY - 0.04, jpo2Z + czOff);
    }

    return {
      loungeCX: loungeCX,
      loungePos: { x: loungeCX, y: UPPER_FLOOR_Y + 0.05, z: jpo2Z, yaw: benchPlayerYaw }
    };
  }

  function buildStallsAndTubes(station, ctx) {
    const { UPPER_FLOOR_Y } = S.CONST;
    const { addBox, addAtlasBox, addAtlasQuad } = S;
    const {
      arch, STALL_UV, SIGN_UV, buckets, glassRecords, isInStairExclusion,
      isIsland, isCawang, p1MinX, p1MaxX, p2MinX, p2MaxX, i2MaxX, track2X,
      concMinX, concMaxX, concMinZ, concMaxZ, concMidZ, cw, concLen,
      platMinZ, platMaxZ, getCanopyArchY,
      stairX, stairFootZ, jpoZ, jpoDepth, jpoCX, jpoPergolaY, jpo2Z, jpo2CX,
      cStairX, cStairFootZ, cStairTopZ, eaveY, i2MinX
    } = ctx;

    const { bTruss, bSteelDark, bStall, bSign, bConcrete } = buckets;

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

    const indoYaw = isIsland ? 0 : -Math.PI * 0.5;
    let indoX = isIsland ? (p1MinX + p1MaxX) * 0.5 : concMaxX - 2.25;
    let indoZ = isIsland ? 14.0 : concMaxZ - 5.5;
    if (isIsland && isInStairExclusion(indoX, indoZ, 2.9, 2.0)) {
      indoZ = 32.0; // Harjamukti: JPO 1 stair sits at z = 11.8..21.3
    }
    const indoInfo = buildWalkInIndomaret(station, ctx, indoX, indoZ, indoYaw);

    // Access by KAI Turnstiles (chamfered purple cabinets, brushed stainless plinth/bezel, angled RFID reader, 3-arm chrome tripod)
    const gateBaseX = isIsland ? (p1MinX + 2.2) : (concMinX + 2.2);
    const gateZStart = isIsland ? 2.0 : (concMidZ - 6.5);
    const numGates = isIsland ? 4 : 6;
    const turnstileList = buildKaiTurnstileBank(station, ctx, gateBaseX, gateZStart, numGates, isIsland);

    let lkX = null, lkZ = null, shX = null, shZ = null;
    if (!isIsland) {
      // Prominent glass-fronted LRT Ticket & Customer Service Pavilion (Loket / Layanan Penumpang)
      // Placed cleanly in the front unpaid concourse plaza opposite the KAI Turnstile gates
      lkX = Math.min(concMinX + 8.8, concMaxX - 5.2);
      lkZ = concMidZ - 9.0;
      const lkYaw = -Math.PI * 0.5;
      const lkCos = Math.cos(lkYaw);
      const lkSin = Math.sin(lkYaw);
      const lkW = (lx, lz) => [lkX + lx * lkCos + lz * lkSin, lkZ - lx * lkSin + lz * lkCos];

      // 1) Recessed dark-steel reveal plinth (0.00..0.12) & concrete interior slab (0.00..0.14)
      addBox(bSteelDark, 3.74, 0.12, 1.88, lkX, 0.06, lkZ, 0, lkYaw, 0);
      addBox(bConcrete, 3.44, 0.14, 1.62, lkX, 0.07, lkZ, 0, lkYaw, 0);

      // 2) Hollow cabinet enclosure: front counter apron (0.12..0.96), rear solid backing wall, left/right paneled piers
      const frontAp = lkW(0, 0.84);
      addAtlasBox(bStall, 3.88, 0.84, 0.24, frontAp[0], 0.54, frontAp[1], lkYaw, null, STALL_UV.loketWood);
      const backWall = lkW(0, -0.84);
      addAtlasBox(bStall, 3.88, 2.34, 0.22, backWall[0], 1.29, backWall[1], lkYaw, null, STALL_UV.loketWood);
      for (const sSide of [-1, 1]) {
        const pCornerF = lkW(sSide * 1.80, 0.78);
        const pCornerB = lkW(sSide * 1.80, -0.78);
        addAtlasBox(bStall, 0.28, 2.34, 0.34, pCornerF[0], 1.29, pCornerF[1], lkYaw, null, STALL_UV.loketWood);
        addAtlasBox(bStall, 0.28, 2.34, 0.34, pCornerB[0], 1.29, pCornerB[1], lkYaw, null, STALL_UV.loketWood);
        const sideApron = lkW(sSide * 1.80, 0.0);
        addAtlasBox(bStall, 0.22, 0.84, 1.32, sideApron[0], 0.54, sideApron[1], lkYaw, null, STALL_UV.loketWood);
        // Side glass window panes between corner piers (world X span = 1.22m, Z thickness = 0.04m)
        const sideWin = lkW(sSide * 1.80, 0.0);
        const cSideG = station._addCollider(sideWin[0] - 0.62, 1.0, sideWin[1] - 0.14, sideWin[0] + 0.62, 2.34, sideWin[1] + 0.14, 'glass', { blocksWalk: false });
        glassRecords.push({
          cx: sideWin[0], cy: 1.67, cz: sideWin[1], w: 1.22, h: 1.28, d: 0.04,
          ry: 0, hp: 18, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cSideG
        });
      }

      // 3) Brushed stainless steel overhanging teller counter (y = 0.96..1.03) + dark interior desk (y = 0.74)
      const ledgePos = lkW(0, 0.90);
      addBox(bTruss, 3.98, 0.07, 0.60, ledgePos[0], 0.995, ledgePos[1], 0, lkYaw, 0);
      const deskPos = lkW(0, 0.44);
      addBox(bSteelDark, 3.24, 0.05, 0.52, deskPos[0], 0.74, deskPos[1], 0, lkYaw, 0);

      // 4) Teller window mullions (center pier, horizontal transom, sill rail) & 2 glass teller screens with 0.12m pass-through slot
      const midPier = lkW(0, 0.84);
      addBox(bSteelDark, 0.16, 1.40, 0.14, midPier[0], 1.73, midPier[1], 0, lkYaw, 0);
      const transBar = lkW(0, 0.84);
      addBox(bSteelDark, 3.36, 0.07, 0.12, transBar[0], 2.04, transBar[1], 0, lkYaw, 0);
      const headBar = lkW(0, 0.84);
      addBox(bSteelDark, 3.36, 0.08, 0.14, headBar[0], 2.38, headBar[1], 0, lkYaw, 0);

      for (const bayX of [-0.88, 0.88]) {
        // Dark steel coin/document pass-through tray recessed on counter
        const trayPos = lkW(bayX, 0.94);
        addBox(bSteelDark, 0.52, 0.02, 0.34, trayPos[0], 1.035, trayPos[1], 0, lkYaw, 0);
        // Tempered glass pane above 12cm pass-through slot
        const winPos = lkW(bayX, 0.84);
        const cBayG = station._addCollider(winPos[0] - 0.1, 1.15, winPos[1] - 0.78, winPos[0] + 0.1, 2.02, winPos[1] + 0.78, 'glass', { blocksWalk: false });
        glassRecords.push({
          cx: winPos[0], cy: 1.58, cz: winPos[1], w: 1.54, h: 0.88, d: 0.04,
          ry: lkYaw, hp: 18, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cBayG
        });
        // Clerestory top glass transom (2.08..2.34)
        const cTopG = station._addCollider(winPos[0] - 0.1, 2.08, winPos[1] - 0.78, winPos[0] + 0.1, 2.34, winPos[1] + 0.78, 'glass', { blocksWalk: false });
        glassRecords.push({
          cx: winPos[0], cy: 2.21, cz: winPos[1], w: 1.54, h: 0.25, d: 0.04,
          ry: lkYaw, hp: 14, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cTopG
        });
        // Anodized acoustic intercom disc mounted on glass pane
        const icomPos = lkW(bayX, 0.85);
        addBox(bTruss, 0.16, 0.16, 0.07, icomPos[0], 1.58, icomPos[1], 0, lkYaw, 0);
        addBox(bSteelDark, 0.10, 0.10, 0.08, icomPos[0], 1.58, icomPos[1], 0, lkYaw, 0);
        // Furnished interior: POS monitor stand, screen, keyboard & swivel office chair
        const monPos = lkW(bayX + 0.12, 0.36);
        addBox(bSteelDark, 0.08, 0.14, 0.08, monPos[0], 0.83, monPos[1], 0, lkYaw, 0);
        addBox(bSteelDark, 0.44, 0.28, 0.05, monPos[0], 1.00, monPos[1], 0, lkYaw, 0);
        addAtlasBox(bStall, 0.38, 0.22, 0.055, monPos[0], 1.00, monPos[1], lkYaw, null, STALL_UV.jaklingko);
        const kbPos = lkW(bayX + 0.12, 0.56);
        addBox(bSteelDark, 0.34, 0.025, 0.14, kbPos[0], 0.775, kbPos[1], 0, lkYaw, 0);
        const chPos = lkW(bayX, -0.22);
        addBox(bSteelDark, 0.10, 0.34, 0.10, chPos[0], 0.31, chPos[1], 0, lkYaw, 0);
        addBox(bSteelDark, 0.44, 0.06, 0.42, chPos[0], 0.49, chPos[1], 0, lkYaw, 0);
        const chBack = lkW(bayX, -0.40);
        addBox(bSteelDark, 0.42, 0.44, 0.06, chBack[0], 0.72, chBack[1], 0, lkYaw, 0);
      }

      // KUE / E-Money card tap pad on counter edge + warm interior ceiling diffuser + service map strip on rear interior wall
      const tapPos = lkW(-0.22, 1.08);
      addAtlasBox(bStall, 0.16, 0.05, 0.20, tapPos[0], 1.055, tapPos[1], lkYaw, null, STALL_UV.jaklingko);
      const mapWall = lkW(0, -0.71);
      addAtlasBox(bSign, 2.40, 0.72, 0.04, mapWall[0], 1.78, mapWall[1], lkYaw, { 4: SIGN_UV.routeMap, 5: SIGN_UV.routeMap }, SIGN_UV.loketHeader);
      const ceilGlow = lkW(0, 0.08);
      addBox(bTruss, 2.60, 0.04, 0.34, ceilGlow[0], 2.38, ceilGlow[1], 0, lkYaw, 0);

      // 5) Overhanging LRT Canopy & Illuminated Loket Header Fascia (2.42..3.00m)
      const roofPos = lkW(0, 0.12);
      addBox(bSteelDark, 4.24, 0.10, 2.28, roofPos[0], 2.45, roofPos[1], 0, lkYaw, 0);
      addBox(bTruss, 4.28, 0.04, 2.32, roofPos[0], 2.51, roofPos[1], 0, lkYaw, 0);
      // Dark-navy backing band across booth roof + crisp centered non-stretched LOKET / TIKET lightboxes
      addBox(bSteelDark, 4.02, 0.54, 1.92, lkX, 2.78, lkZ, 0, lkYaw, 0);
      const fasciaF = lkW(0, 0.965);
      addAtlasBox(bSign, 2.08, 0.52, 0.06, fasciaF[0], 2.78, fasciaF[1], lkYaw, null, SIGN_UV.loketHeader);
      const fasciaB = lkW(0, -0.965);
      addAtlasBox(bSign, 2.08, 0.52, 0.06, fasciaB[0], 2.78, fasciaB[1], lkYaw, null, SIGN_UV.loketHeader);

      // Clean AABB collider around ticket booth envelope
      station._addCollider(lkX - 1.15, 0, lkZ - 1.98, lkX + 1.15, 3.04, lkZ + 1.98, 'wood');

      // Queue guidance matte dark-steel stanchions flanking teller front (zero bloom glare)
      for (const qSide of [-1, 1]) {
        const stP = lkW(qSide * 1.48, 1.88);
        addBox(bSteelDark, 0.055, 0.88, 0.055, stP[0], 0.44, stP[1], 0, lkYaw, 0);
        addBox(bSteelDark, 0.24, 0.03, 0.24, stP[0], 0.015, stP[1], 0, lkYaw, 0);
      }

      const loketUsed = station._usedIds.has('loket_counter');
      const notePos = lkW(-0.62, 0.98);
      const interactPos = lkW(-0.45, 1.38);
      station.interactables.push({
        id: 'loket_counter',
        type: 'field_log',
        x: interactPos[0],
        y: 1.12,
        z: interactPos[1],
        label: loketUsed ? '[E] Meja Loket Stasiun (Sudah Diperiksa)' : '[E] Periksa Buku Catatan Loket Tiket',
        prompt: loketUsed ? '[E] Meja Loket Stasiun (Sudah Diperiksa)' : '[E] Periksa Buku Catatan Loket Tiket',
        used: loketUsed
      });
      placeFieldLogProp(station, ctx.root, 'loket_counter', notePos[0], 1.055, notePos[1], lkYaw + 0.14, loketUsed);
    }

    const jakX = isIsland ? p1MaxX - 2.0 : concMinX + 3.8;
    const jakZ = isIsland ? -16.0 : concMaxZ - 1.8;
    const jakYaw = isIsland ? 0 : Math.PI;
    const jakTrayZ = isIsland ? (jakZ + 0.44) : (jakZ - 0.44);
    const jakGrp = buildDetailedJaklingkoKiosk(station, ctx.root, jakX, jakZ, jakYaw);
    const jakUsed = station._usedIds.has('jaklingko_kiosk');
    station.interactables.push({
      id: 'jaklingko_kiosk', type: 'jaklingko', x: jakX, y: 1.2, z: jakZ,
      label: jakUsed ? '[E] Terminal JakLingko (Sudah Diambil)' : '[E] Top-Up KUE / JakLingko Terminal (+Amunisi)',
      prompt: jakUsed ? '[E] Terminal JakLingko (Sudah Diambil)' : '[E] Top-Up KUE / JakLingko Terminal (+1 Magazin)',
      used: jakUsed,
      targetObj: jakGrp
    });
    if (jakGrp && typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget('jaklingko_kiosk', jakGrp, {
        category: 'interactable', x: jakX, y: 1.05, z: jakZ, hitRadius: 0.85
      });
    }
    placeFieldLogProp(station, ctx.root, 'jaklingko_kiosk', jakX, 1.045, jakTrayZ, isIsland ? 0.12 : Math.PI + 0.12, jakUsed, true);

    const cowX = isIsland ? p1MaxX - 2.0 : concMinX + 5.4;
    const cowZ = isIsland ? -13.5 : concMaxZ - 1.8;
    const cowYaw = isIsland ? 0 : Math.PI;
    const cowGrp = buildDetailedCowayStation(station, ctx.root, cowX, cowZ, cowYaw);
    const cowUsed = station._usedIds.has('coway_water');
    station.interactables.push({
      id: 'coway_water', type: 'coway', x: cowX, y: 1.1, z: cowZ,
      label: cowUsed ? '[E] Dispenser Coway (Sudah Minum)' : '[E] Minum Air Steril Coway (+15 HP)',
      prompt: cowUsed ? '[E] Dispenser Coway (Sudah Minum)' : '[E] Minum Air Steril Coway (+15 HP)',
      used: cowUsed,
      targetObj: cowGrp
    });
    if (cowGrp && typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget('coway_water', cowGrp, {
        category: 'interactable', x: cowX, y: 1.0, z: cowZ, hitRadius: 0.78
      });
    }

    const stationsList = (LRT.Config && (LRT.Config.stations || LRT.Config.ARCHETYPES))
      || (LRT.CONFIG && LRT.CONFIG.stations)
      || [];
    const stIdx = typeof station._stationIndex === 'number' ? station._stationIndex : 0;
    const totalSt = stationsList.length || 6;
    const nextSt = (stIdx + 1 < totalSt) ? stationsList[stIdx + 1] : null;
    const prevSt = (stIdx > 0) ? stationsList[stIdx - 1] : null;
    const nextName = (nextSt && nextSt.name) ? nextSt.name : (stIdx >= totalSt - 1 ? 'Ekstraksi Evakuasi' : 'Stasiun Berikutnya');
    const prevName = (prevSt && prevSt.name) ? prevSt.name : 'Terminal Awal';

    const callX = p1MinX + 1.45;
    const callZ = -2.85;
    const call1Ped = buildCallTrainPedestal(station, ctx, callX, callZ, false, nextName);
    buildCallTrainPidsSign(station, ctx, callX, callZ, false, nextName);
    station.interactables.push({
      id: 'call_train', type: 'call_train', x: callX, y: 1.2, z: callZ,
      label: '[E] Panggil Kereta LRT Peron 1 → MAJU (Tujuan: ' + nextName + ')',
      prompt: '[E] Panggil Kereta LRT Peron 1 → MAJU (Tujuan: ' + nextName + ')', used: false,
      targetObj: call1Ped
    });
    if (call1Ped && typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget('call_train', call1Ped, {
        category: 'train', x: callX, y: 0.9, z: callZ, hitRadius: 0.65
      });
    }

    const call2X = (isIsland ? p1MaxX : p2MaxX) - 1.45;
    const call2Z = -2.85;
    const call2Ped = buildCallTrainPedestal(station, ctx, call2X, call2Z, true, prevName);
    buildCallTrainPidsSign(station, ctx, call2X, call2Z, true, prevName);
    station.interactables.push({
      id: 'call_train_prev', type: 'call_train_prev', x: call2X, y: 1.2, z: call2Z,
      label: '[E] Panggil Kereta LRT Peron 2 ← KEMBALI (Tujuan: ' + prevName + ')',
      prompt: '[E] Panggil Kereta LRT Peron 2 ← KEMBALI (Tujuan: ' + prevName + ')', used: false,
      targetObj: call2Ped
    });
    if (call2Ped && typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget('call_train_prev', call2Ped, {
        category: 'train', x: call2X, y: 0.9, z: call2Z, hitRadius: 0.65
      });
    }

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
    const totemGrp = new THREE.Group();
    totemGrp.name = 'RouteMapTotem';
    totemGrp.position.set(totemX, 0, totemZ);
    ctx.root.add(totemGrp);
    const totemSteelMat = new THREE.MeshStandardMaterial({ color: 0x222933, roughness: 0.42, metalness: 0.74 });
    const totemBrushedMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.26, metalness: 0.86 });
    const totemTex = makeCanvasTex(station, 512, 256, (c, w, h) => {
      c.fillStyle = '#f2f3f5';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#16325c';
      c.fillRect(0, 0, w, 46);
      c.fillStyle = '#e5b82e';
      c.fillRect(0, 46, w, 5);
      c.fillStyle = '#ffffff';
      c.font = 'bold 20px sans-serif';
      c.fillText('PETA RUTE LRT JABODEBEK  •  INFO STASIUN', 16, 30);
      c.strokeStyle = '#1d4ed8';
      c.lineWidth = 7;
      c.beginPath(); c.moveTo(32, 128); c.lineTo(295, 128); c.lineTo(476, 94); c.stroke();
      c.strokeStyle = '#15803d';
      c.beginPath(); c.moveTo(295, 128); c.lineTo(476, 174); c.stroke();
      const tStops = ['Dukuh Atas', 'Setiabudi', 'Kuningan', 'Cikoko', 'Cawang'];
      for (let ts = 0; ts < tStops.length; ts++) {
        const sx = 40 + ts * 64;
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(sx, 128, 7, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#16325c'; c.lineWidth = 2.5; c.stroke();
        c.fillStyle = '#0f172a';
        c.font = 'bold 12px sans-serif';
        c.textAlign = 'center';
        c.fillText(tStops[ts], sx, 154);
      }
      c.textAlign = 'left';
      c.fillStyle = '#9d6e32';
      c.fillRect(0, 224, w, 32);
      c.fillStyle = '#e5d429';
      for (let bx = 10; bx < w; bx += 26) c.fillRect(bx, 232, 12, 12);
    }, false);
    const totemMapMat = new THREE.MeshStandardMaterial({
      map: totemTex, emissive: new THREE.Color(0xffffff), emissiveMap: totemTex, emissiveIntensity: 0.34, roughness: 0.34
    });
    station.disposableMaterials.push(totemSteelMat, totemBrushedMat, totemMapMat);
    addPbrPart(station, totemGrp, new THREE.BoxGeometry(1.68, 0.08, 0.34), totemSteelMat, 0, 0.04, 0);
    addPbrPart(station, totemGrp, new THREE.BoxGeometry(0.08, 1.88, 0.14), totemBrushedMat, -0.76, 0.94, 0);
    addPbrPart(station, totemGrp, new THREE.BoxGeometry(0.08, 1.88, 0.14), totemBrushedMat, 0.76, 0.94, 0);
    addPbrPart(station, totemGrp, new THREE.BoxGeometry(1.62, 0.72, 0.14), totemSteelMat, 0, 1.54, 0);
    addPbrPart(station, totemGrp, new THREE.PlaneGeometry(1.52, 0.64), totemMapMat, 0, 1.54, 0.075);
    addPbrPart(station, totemGrp, new THREE.PlaneGeometry(1.52, 0.64), totemMapMat, 0, 1.54, -0.075, 0, Math.PI, 0);
    addPbrPart(station, totemGrp, new THREE.BoxGeometry(0.56, 0.05, 0.32), totemSteelMat, 0, 1.04, -0.16);
    station._addCollider(totemX - 0.86, 0, totemZ - 0.18, totemX + 0.86, 1.92, totemZ + 0.18, 'metal');
    station.interactables.push({
      id: 'route_totem', type: 'info', x: totemX, y: 1.2, z: totemZ,
      label: '[E] Periksa Peta Rute LRT Jabodebek',
      prompt: '[E] Periksa Peta Rute LRT Jabodebek', used: false,
      targetObj: totemGrp
    });
    if (typeof station._registerHaloTarget === 'function') {
      station._registerHaloTarget('route_totem', totemGrp, {
        category: 'interactable', x: totemX, y: 1.05, z: totemZ, hitRadius: 0.95
      });
    }
    placeFieldLogProp(station, ctx.root, 'route_totem', totemX, 1.07, totemZ - 0.16, Math.PI + 0.10, station._usedIds.has('route_totem'), true);

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

    // JPO 2 Skybridge Commuter Lounge & Transit Hub + Side-Dual Peron 2 Waiting Amenities
    const jpo2LoungeRes = buildJpo2SkybridgeLounge(station, ctx);
    if (!isIsland) {
      const p2BenchX = p2MinX + 1.45;
      const p2Candidates = [-42, -14, 14, 42, -28, 28];
      let p2Placed = 0;
      for (let bi = 0; bi < p2Candidates.length && p2Placed < 3; bi++) {
        const bz = p2Candidates[bi];
        if (isInStairExclusion(p2BenchX, bz, 0.55, 1.25)) continue;
        addBenchProp(station, ctx.root, 'bench_p2_' + p2Placed, p2BenchX, 0.0, bz, Math.PI * 0.5, -Math.PI * 0.5, 0.14, 0, 0.92, 0, 1.0);
        if (!isInStairExclusion(p2BenchX, bz + 1.45, 0.4, 0.4)) {
          addTrashBinProp(station, ctx.root, p2BenchX, 0.0, bz + 1.45);
        }
        p2Placed++;
      }
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
    ctx.indoYaw = indoYaw;
    ctx.indoWalkInPos = indoInfo.walkInPos;
    ctx.indoFrontPos = indoInfo.frontPos;
    ctx.indoWarmAnchor = indoInfo.warmAnchor;
    ctx.loungeCX = jpo2LoungeRes ? jpo2LoungeRes.loungeCX : null;
    ctx.jpo2LoungePos = jpo2LoungeRes ? jpo2LoungeRes.loungePos : null;
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

    // 3D Physical Field Log Paper / Manila Folder Props at Station Note Counters
    if (isCawang && ctx.cawangWreckX !== undefined) {
      const cabGrp = new THREE.Group();
      cabGrp.name = 'CawangFuseJunctionBox';
      cabGrp.position.set(ctx.cawangWreckX - 1.58, 0, -10.5);
      root.add(cabGrp);
      const cabSteel = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.46, metalness: 0.68 });
      const cabTrim = new THREE.MeshStandardMaterial({ color: 0x1e252e, roughness: 0.36, metalness: 0.78 });
      const cabWarn = new THREE.MeshStandardMaterial({ color: 0xeab308, emissive: 0x422006, emissiveIntensity: 0.45, roughness: 0.42 });
      const cabLed = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 1.5 });
      station.disposableMaterials.push(cabSteel, cabTrim, cabWarn, cabLed);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.46, 0.06, 0.40), cabTrim, 0, 0.03, 0);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.40, 0.36, 0.34), cabSteel, 0, 0.24, 0);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.44, 0.04, 0.38), cabTrim, 0, 0.43, 0);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.24, 0.14, 0.02), cabWarn, 0, 0.25, 0.18);
      addPbrPart(station, cabGrp, new THREE.BoxGeometry(0.05, 0.05, 0.03), cabLed, 0.14, 0.36, 0.18);
      addPbrPart(station, cabGrp, new THREE.CylinderGeometry(0.022, 0.022, 0.38, 8), cabTrim, -0.18, 0.22, -0.18);
      if (typeof station._registerHaloTarget === 'function') {
        station._registerHaloTarget('cawang_derelict_cab', cabGrp, {
          category: 'interactable', x: ctx.cawangWreckX - 1.58, y: 0.42, z: -10.5, hitRadius: 0.72
        });
      }
      placeFieldLogProp(station, root, 'cawang_derelict_cab', ctx.cawangWreckX - 1.58, 0.45, -10.5, 0.22, station._usedIds.has('cawang_derelict_cab'), true);
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

      // 1) Pelican / military polymer-steel lower tub, rubber corner bumpers, reinforced ribs & steel carry handles
      addPbrPart(station, grp, new THREE.BoxGeometry(1.12, 0.38, 0.66), caseMat, 0, 0.20, 0);
      for (const bx of [-0.54, 0.54]) {
        for (const bz of [-0.31, 0.31]) {
          addPbrPart(station, grp, new THREE.BoxGeometry(0.08, 0.42, 0.08), rubberMat, bx, 0.21, bz);
        }
      }
      for (const cx of [-0.57, 0.57]) {
        addPbrPart(station, grp, new THREE.BoxGeometry(0.05, 0.36, 0.56), rubberMat, cx, 0.21, 0);
        addPbrPart(station, grp, new THREE.CylinderGeometry(0.015, 0.015, 0.24, 8), steelMat, cx * 1.07, 0.23, 0, Math.PI * 0.5, 0, 0);
      }
      for (const rxPos of [-0.36, -0.18, 0.18, 0.36]) {
        addPbrPart(station, grp, new THREE.BoxGeometry(0.036, 0.35, 0.69), rubberMat, rxPos, 0.20, 0);
      }
      // Upper perimeter lip & rubber gasket seal + dual brass draw-latches + stencil plate
      addPbrPart(station, grp, new THREE.BoxGeometry(1.16, 0.045, 0.70), rubberMat, 0, 0.415, 0);
      for (const lxPos of [-0.32, 0.32]) {
        addPbrPart(station, grp, new THREE.BoxGeometry(0.08, 0.14, 0.045), latchMat, lxPos, 0.34, 0.345);
        addPbrPart(station, grp, new THREE.BoxGeometry(0.045, 0.06, 0.055), rubberMat, lxPos, 0.28, 0.35);
      }
      addPbrPart(station, grp, new THREE.BoxGeometry(0.32, 0.055, 0.02), latchMat, 0, 0.23, 0.335);

      // Recessed charcoal foam interior tray + 3 divider ribs
      addPbrPart(station, grp, new THREE.BoxGeometry(1.02, 0.045, 0.58), foamMat, 0, 0.405, 0);
      for (const divX of [-0.17, 0.17]) {
        addPbrPart(station, grp, new THREE.BoxGeometry(0.028, 0.035, 0.54), rubberMat, divX, 0.432, 0);
      }

      // 2) Hinged Pelican lid anchored at back edge (y = 0.44, z = -0.34)
      const lidPivot = new THREE.Group();
      lidPivot.name = id + '_LidPivot';
      lidPivot.position.set(0, 0.44, -0.34);
      lidPivot.rotation.x = used ? -1.72 : 0.0;
      grp.add(lidPivot);
      addPbrPart(station, lidPivot, new THREE.BoxGeometry(1.16, 0.09, 0.70), rubberMat, 0, 0.045, 0.34);
      addPbrPart(station, lidPivot, new THREE.BoxGeometry(1.04, 0.05, 0.58), caseMat, 0, 0.105, 0.34);
      addPbrPart(station, lidPivot, new THREE.BoxGeometry(0.98, 0.02, 0.52), foamMat, 0, 0.005, 0.34);
      for (const lxPos of [-0.34, 0, 0.34]) {
        addPbrPart(station, lidPivot, new THREE.BoxGeometry(0.055, 0.03, 0.56), rubberMat, lxPos, 0.135, 0.34);
      }
      addPbrPart(station, lidPivot, new THREE.BoxGeometry(0.74, 0.024, 0.06), latchMat, 0, 0.138, 0.58);
      addPbrPart(station, lidPivot, new THREE.BoxGeometry(0.24, 0.03, 0.036), steelMat, 0, 0.145, 0.34);

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

      // 1) Full-width 5-block lower concrete Jersey barricade wall (10.5m span) + stacked upper central bunker blocks
      for (const dx of [-4.4, -2.2, 0.0, 2.2, 4.4]) {
        const blk = new THREE.Mesh(bcConcGeo, bcConcMat);
        blk.position.set(dx, 0.56, 0);
        blk.castShadow = true;
        blk.receiveShadow = true;
        bcGroup.add(blk);
      }
      for (const dx of [-2.2, 0.0, 2.2]) {
        const topBlk = new THREE.Mesh(bcTopConcGeo, bcConcMat);
        topBlk.position.set(dx, 1.50, 0);
        bcGroup.add(topBlk);
      }
      // 2) Twin sandbag defensive wings in front of barricade flanks
      for (const sx of [-3.6, -2.6, 2.6, 3.6]) {
        for (const layer of [0, 1, 2]) {
          const sb = new THREE.Mesh(bcSandGeo, bcSandMat);
          sb.position.set(sx + (layer % 2 ? 0.12 : -0.12), 0.17 + layer * 0.30, 0.66 - layer * 0.06);
          sb.rotation.y = (layer - 1) * 0.08;
          bcGroup.add(sb);
        }
      }
      // 3) Heavy steel Czech Hedgehog anti-vehicle spikes flanking approaches
      for (const hx of [-4.2, -1.5, 1.5, 4.2]) {
        for (const rotZ of [0.68, -0.68, 0.0]) {
          const beam = new THREE.Mesh(bcHedgeGeo, bcSteelMat);
          beam.position.set(hx, 0.72, 1.18);
          beam.rotation.set(rotZ === 0 ? 0.72 : 0.25, 0.4, rotZ);
          bcGroup.add(beam);
        }
      }
      // 4) Overhead steel quarantine gantry portal + illuminated Quarantine Banner + twin strobes
      for (const px of [-4.7, 4.7]) {
        const post = new THREE.Mesh(bcPostGeo, bcSteelMat);
        post.position.set(px, 1.67, 0);
        bcGroup.add(post);
        const beacon = new THREE.Mesh(bcGlowGeo, bcGlowMat);
        beacon.position.set(px, 3.38, 0);
        bcGroup.add(beacon);
      }
      const rail1 = new THREE.Mesh(bcBeamGeo, bcHazMat); rail1.position.set(0, 2.15, 0); bcGroup.add(rail1);
      const qSign = new THREE.Mesh(bcSignGeo, bcSignMat); qSign.position.set(0, 2.86, 0); bcGroup.add(qSign);

      // 5) Volatile payload cluster at center weak point: 5 fuel drums, 2 pressurized tanks, ordnance crates & C4 flasher
      for (const [dx, dz] of [[-1.05, 0.72], [-0.45, 0.92], [0.0, 0.68], [0.48, 0.92], [1.05, 0.72]]) {
        const dr = new THREE.Mesh(bcDrumGeo, bcHazMat);
        dr.position.set(dx, 0.46, dz);
        bcGroup.add(dr);
      }
      for (const tx of [-0.24, 0.24]) {
        const tk = new THREE.Mesh(bcTankGeo, bcGlowMat);
        tk.position.set(tx, 1.24, 0.64);
        bcGroup.add(tk);
      }
      for (const cx of [-0.72, 0.72]) {
        const cr = new THREE.Mesh(bcCrateGeo, bcCrateMat);
        cr.position.set(cx, 0.26, 1.38);
        cr.rotation.y = cx * 0.22;
        bcGroup.add(cr);
      }
      const c4Beacon = new THREE.Mesh(bcGlowGeo, bcGlowMat);
      c4Beacon.position.set(0, 1.10, 0.44);
      bcGroup.add(c4Beacon);
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
