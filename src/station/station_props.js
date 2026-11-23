(function (LRT) {
  'use strict';

  const S = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {}).station = window.__LRT_INTERNAL__.station || {};
  const _pooledStationLights = [];

  function createKaiCabinetTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const ctx = c.getContext('2d');
    // Grounded brushed stainless-steel industrial turnstile housing (matching Jakarta LRT concourse aesthetic)
    const grad = ctx.createLinearGradient(0, 0, 128, 256);
    grad.addColorStop(0, '#9aa2ab');
    grad.addColorStop(0.45, '#7e8790');
    grad.addColorStop(1, '#5d656e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 256);
    // Subtle vertical brushed-metal grain & panel seam
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 4; x < 128; x += 6) ctx.fillRect(x, 0, 2, 256);
    ctx.fillStyle = 'rgba(18,22,28,0.28)';
    ctx.fillRect(0, 118, 128, 3);
    // KAI LRT navy/purple accent fascia band at top
    const band = ctx.createLinearGradient(0, 16, 128, 84);
    band.addColorStop(0, '#1e325c');
    band.addColorStop(0.65, '#4b266d');
    band.addColorStop(1, '#7a2564');
    ctx.fillStyle = band;
    ctx.fillRect(0, 18, 128, 62);
    ctx.fillStyle = '#e5c038';
    ctx.fillRect(0, 78, 128, 4);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Access', 64, 46);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#dbeafe';
    ctx.fillText('by KAI LRT', 64, 65);
    // Recessed crimson flap indicator accent & lower service louver vents
    ctx.fillStyle = '#5c191e';
    ctx.fillRect(16, 134, 96, 26);
    ctx.fillStyle = 'rgba(15,20,26,0.45)';
    for (let y = 176; y < 236; y += 11) {
      ctx.fillRect(22, y, 84, 4);
    }
    // Hours-after-outbreak boot scuffs & grime along kickplate
    ctx.fillStyle = 'rgba(24,22,20,0.34)';
    ctx.fillRect(0, 232, 128, 24);
    ctx.fillStyle = 'rgba(32,28,24,0.18)';
    ctx.fillRect(12, 198, 28, 14);
    ctx.fillRect(76, 152, 24, 10);
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
      roughness: 0.36,
      metalness: 0.66
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
    const bankBatcher = createPartBatcher(station, bankGroup);
    const _tbParentM = new THREE.Matrix4();
    const _tbLocalM = new THREE.Matrix4();
    const _tbFinalM = new THREE.Matrix4();
    const _tbPos = new THREE.Vector3();
    const _tbEuler = new THREE.Euler();
    const _tbQuat = new THREE.Quaternion();
    const _tbScale = new THREE.Vector3(1, 1, 1);
    const addBankStatic = (geo, mat, px, py, pz, pry, lx, ly, lz, lrz) => {
      const g = S.prepGeo(geo.clone(), false);
      _tbPos.set(px, py, pz);
      _tbEuler.set(0, pry, 0);
      _tbQuat.setFromEuler(_tbEuler);
      _tbParentM.compose(_tbPos, _tbQuat, _tbScale);
      _tbPos.set(lx || 0, ly || 0, lz || 0);
      _tbEuler.set(0, 0, lrz || 0);
      _tbQuat.setFromEuler(_tbEuler);
      _tbLocalM.compose(_tbPos, _tbQuat, _tbScale);
      _tbFinalM.multiplyMatrices(_tbParentM, _tbLocalM);
      g.applyMatrix4(_tbFinalM);
      bankBatcher.add(g, mat, 0, 0, 0);
    };

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

      addBankStatic(plinthGeo, stainlessMat, gx, 0, tz, yaw, 0, 0.0275, 0);
      addBankStatic(cabBodyGeo, kaiBodyMat, gx, 0, tz, yaw, 0, 0, 0);
      addBankStatic(topBezelGeo, stainlessMat, gx, 0, tz, yaw, 0, 0.965, 0);

      for (const sgn of [-1, 1]) {
        addBankStatic(sideTrimGeo, stainlessMat, gx, 0, tz, yaw, sgn * 0.54, 0.865, 0, -sgn * Math.PI * 0.25);
        addBankStatic(readerBezelGeo, darkTrimMat, gx, 0, tz, yaw, sgn * 0.535, 0.882, 0, -sgn * Math.PI * 0.25);
        addBankStatic(readerGlassGeo, readerGlassMat, gx, 0, tz, yaw, sgn * 0.542, 0.889, 0, -sgn * Math.PI * 0.25);
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
          addBankStatic(ledFaceGeo, darkTrimMat, gx, 0, tz, yaw, sgn * 0.635, 0.63, 0);

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
        addBankStatic(bossGeo, stainlessMat, gx, 0, tz, yaw, 0, 0.75, 0.125);

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

      const railRy = isIsland ? 0 : Math.PI * 0.5;
      for (const px of [-0.58, 0.58]) {
        addBankStatic(railPostGeo, stainlessMat, rx, 0, rz, railRy, px, 0.48, 0);
      }
      addBankStatic(railBarGeo, stainlessMat, rx, 0, rz, railRy, 0, 0.95, 0);
      addBankStatic(railBarGeo, stainlessMat, rx, 0, rz, railRy, 0, 0.16, 0);
      addBankStatic(railGlassGeo, guardGlassMat, rx, 0, rz, railRy, 0, 0.55, 0);

      station._addCollider(
        rx - (isIsland ? 0.62 : 0.10), 0, rz - (isIsland ? 0.10 : 0.62),
        rx + (isIsland ? 0.62 : 0.10), 1.02, rz + (isIsland ? 0.10 : 0.62), 'metal', { blocksBullets: false }
      );
    };
    addEndGuardrail(-1);
    addEndGuardrail(1);
    bankBatcher.flush(false, true, 'KaiTurnstileStatic');

    return turnstileList;
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

  const _batchMat4 = new THREE.Matrix4();
  const _batchEuler = new THREE.Euler();
  const _batchQuat = new THREE.Quaternion();
  const _batchPos = new THREE.Vector3();
  const _batchScale = new THREE.Vector3(1, 1, 1);

  function createPartBatcher(station, parent) {
    const buckets = new Map();
    return {
      add: function (geo, mat, x, y, z, rx, ry, rz) {
        const g = S.prepGeo(geo, false);
        if (g !== geo && typeof geo.dispose === 'function') geo.dispose();
        _batchPos.set(x || 0, y || 0, z || 0);
        _batchEuler.set(rx || 0, ry || 0, rz || 0);
        _batchQuat.setFromEuler(_batchEuler);
        _batchMat4.compose(_batchPos, _batchQuat, _batchScale);
        g.applyMatrix4(_batchMat4);
        let arr = buckets.get(mat);
        if (!arr) { arr = []; buckets.set(mat, arr); }
        arr.push(g);
      },
      flush: function (castShadow, receiveShadow, namePrefix) {
        let idx = 0;
        for (const [mat, geos] of buckets.entries()) {
          const merged = geos.length === 1 ? geos[0] : THREE_UTILS.mergeGeometries(geos, false);
          if (geos.length > 1) {
            for (let i = 0; i < geos.length; i++) geos[i].dispose();
          }
          if (!merged) continue;
          station.disposableGeometries.push(merged);
          const m = new THREE.Mesh(merged, mat);
          m.castShadow = !!castShadow;
          m.receiveShadow = receiveShadow !== false;
          m.name = (namePrefix || 'BatchedProp') + '_' + (idx++);
          parent.add(m);
        }
        buckets.clear();
      }
    };
  }

  function addPbrPart(station, parent, geo, mat, x, y, z, rx, ry, rz) {
    if (parent && parent.userData && parent.userData._partBatcher) {
      parent.userData._partBatcher.add(geo, mat, x, y, z, rx, ry, rz);
      return null;
    }
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
    grp.userData._partBatcher = createPartBatcher(station, grp);
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

    if (grp.userData._partBatcher) {
      grp.userData._partBatcher.flush(false, true, 'IndomaretStatic');
      delete grp.userData._partBatcher;
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
    grp.userData._partBatcher = createPartBatcher(station, grp);
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
      // Fresh panic-evacuation spiderweb impact crack on glass touchscreen
      const ix = 152, iy = 128;
      c.fillStyle = 'rgba(5, 8, 14, 0.86)';
      c.beginPath();
      c.arc(ix, iy, 16, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(226, 240, 255, 0.82)';
      c.lineWidth = 1.6;
      const rays = [0.2, 0.85, 1.55, 2.25, 2.95, 3.65, 4.35, 5.15, 5.85];
      for (let r = 0; r < rays.length; r++) {
        const a = rays[r];
        const len = 42 + (r % 3) * 26;
        c.beginPath();
        c.moveTo(ix, iy);
        c.lineTo(ix + Math.cos(a) * len, iy + Math.sin(a) * len);
        c.stroke();
      }
      c.strokeStyle = 'rgba(186, 230, 253, 0.55)';
      c.lineWidth = 1.0;
      c.beginPath();
      c.arc(ix, iy, 28, 0, Math.PI * 2);
      c.stroke();
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

    if (grp.userData._partBatcher) {
      grp.userData._partBatcher.flush(false, true, 'JaklingkoKiosk');
      delete grp.userData._partBatcher;
    }
    station._addCollider(x - 0.48, 0, z - 0.44, x + 0.48, 2.10, z + 0.44, 'metal');
    return grp;
  }

  function buildDetailedCowayStation(station, root, x, z, yaw) {
    const grp = new THREE.Group();
    grp.name = 'CowayStation3D';
    grp.position.set(x, 0, z);
    grp.rotation.y = yaw;
    grp.userData._partBatcher = createPartBatcher(station, grp);
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

    if (grp.userData._partBatcher) {
      grp.userData._partBatcher.flush(false, true, 'CowayStation');
      delete grp.userData._partBatcher;
    }
    station._addCollider(x - 0.60, 0, z - 0.36, x + 0.60, 1.98, z + 0.36, 'metal');
    return grp;
  }

  function buildCallTrainPedestal(station, ctx, x, z, isPrev, destName) {
    const { root } = ctx;
    const grp = new THREE.Group();
    grp.name = isPrev ? 'CallTrainPedestalP2' : 'CallTrainPedestalP1';
    grp.position.set(x, 0, z);
    grp.rotation.y = isPrev ? -Math.PI * 0.5 : Math.PI * 0.5;
    grp.userData._partBatcher = createPartBatcher(station, grp);
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

    if (grp.userData._partBatcher) {
      grp.userData._partBatcher.flush(false, true, grp.name);
      delete grp.userData._partBatcher;
    }
    station._addCollider(x - 0.28, 0, z - 0.28, x + 0.28, 1.56, z + 0.28, 'metal');
    return grp;
  }

  function buildCallTrainPidsSign(station, ctx, x, z, isPrev, destName) {
    const { root, getCanopyArchY, isCawang, jpoNearZ, jpoFarZ } = ctx;
    const grp = new THREE.Group();
    grp.name = isPrev ? 'CallTrainPidsBoardP2' : 'CallTrainPidsBoardP1';
    grp.userData._partBatcher = createPartBatcher(station, grp);
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
    if (grp.userData._partBatcher) {
      grp.userData._partBatcher.flush(false, true, grp.name);
      delete grp.userData._partBatcher;
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
    grp.userData._partBatcher = createPartBatcher(station, grp);
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
    S.loreLoot.placeFieldLogProp(station, grp, 'jpo2_supply', loungeCX + 0.26, UPPER_FLOOR_Y + 0.485, nearZ + farDir * 0.08, 0.2, jpo2Used, true);

    // 5) Ceiling CCTV Domes under JPO 2 Pergola Soffit
    const cctvY = (jpoPergolaY || 6.95) - 0.14;
    for (const [cxOff, czOff] of [[-1.5, farDir * 1.2], [1.5, -farDir * 1.2]]) {
      addPbrPart(station, grp, new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), frameMat, loungeCX + cxOff, cctvY, jpo2Z + czOff);
      addPbrPart(station, grp, new THREE.SphereGeometry(0.10, 12, 8), cctvDomeMat, loungeCX + cxOff, cctvY - 0.06, jpo2Z + czOff);
      addPbrPart(station, grp, new THREE.BoxGeometry(0.025, 0.025, 0.025), cctvLedMat, loungeCX + cxOff + 0.08, cctvY - 0.04, jpo2Z + czOff);
    }

    if (grp.userData._partBatcher) {
      grp.userData._partBatcher.flush(false, true, 'Jpo2Lounge');
      delete grp.userData._partBatcher;
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
        S.loreLoot.placeFieldLogProp(station, ctx.root, 'rotio_counter', pNote[0], 0.995, pNote[1], yaw + 0.16, rotioUsed);
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
      S.loreLoot.placeFieldLogProp(station, ctx.root, 'loket_counter', notePos[0], 1.055, notePos[1], lkYaw + 0.14, loketUsed);
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
    S.loreLoot.placeFieldLogProp(station, ctx.root, 'jaklingko_kiosk', jakX, 1.045, jakTrayZ, isIsland ? 0.12 : Math.PI + 0.12, jakUsed, true);

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
    S.loreLoot.placeFieldLogProp(station, ctx.root, 'route_totem', totemX, 1.07, totemZ - 0.16, Math.PI + 0.10, station._usedIds.has('route_totem'), true);

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


  S.createPartBatcher = createPartBatcher;
  S.addPbrPart = addPbrPart;
  S.makeCanvasTex = makeCanvasTex;
  S._pooledStationLights = _pooledStationLights;
  S.props = {
    createPartBatcher,
    addPbrPart,
    makeCanvasTex,
    buildKaiTurnstileBank,
    addBenchProp,
    addTrashBinProp,
    buildStallsAndTubes
  };
})(window.LRT = window.LRT || {});
