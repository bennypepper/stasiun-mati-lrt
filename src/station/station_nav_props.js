(function (LRT) {
  'use strict';

  window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {};
  const S = (window.__LRT_INTERNAL__.station = window.__LRT_INTERNAL__.station || {});
  const _pooledStationLights = [];

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

    // Access by KAI Turnstiles
    const gateBaseX = isIsland ? (p1MinX + 2.2) : (concMinX + 2.2);
    const gateZStart = isIsland ? 2.0 : (concMidZ - 6.5);
    const numGates = isIsland ? 4 : 6;
    const turnstileList = [];
    for (let g = 0; g < numGates; g++) {
      const gz = gateZStart + g * 1.05;
      const gx = isIsland ? gateBaseX + g * 1.05 : gateBaseX;
      const tz = isIsland ? 2.5 : gz;
      addAtlasBox(bStall, 1.25, 1.00, 0.24, gx, 0.50, tz, isIsland ? Math.PI * 0.5 : 0, null, STALL_UV.turnstilePurple);
      station._addCollider(gx - (isIsland ? 0.14 : 0.65), 0, tz - (isIsland ? 0.65 : 0.14),
        gx + (isIsland ? 0.14 : 0.65), 1.05, tz + (isIsland ? 0.65 : 0.14), 'metal');
      if (g < numGates - 1) {
        const lx = isIsland ? gx + 0.52 : gx;
        const lz = isIsland ? tz : tz + 0.52;
        turnstileList.push({ x: lx, z: lz, id: 'turnstile_' + g, yaw: isIsland ? Math.PI * 0.5 : 0 });
        station.interactables.push({
          id: 'turnstile_' + g, type: 'turnstile', x: lx, y: 0.9, z: lz,
          label: '[E] Tap Kartu Elektronik (Access by KAI)',
          prompt: '[E] Tap Kartu Elektronik (Access by KAI)', used: false
        });
      }
    }

    if (!isIsland) {
      const lkX = concMaxX - 1.35;
      const lkZ = concMinZ + 3.2;
      addAtlasBox(bStall, 3.8, 2.7, 1.8, lkX, 1.35, lkZ, -Math.PI * 0.5, null, STALL_UV.loketWood);
      addAtlasBox(bSign, 3.9, 0.65, 1.9, lkX, 2.75, lkZ, -Math.PI * 0.5, null, SIGN_UV.loketHeader);
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

      const shX = concMinX + 7.8;
      const shZ = concMaxZ - 1.45;
      addAtlasBox(bStall, 2.4, 2.55, 2.1, shX, 1.28, shZ, 0, null, STALL_UV.shutter260);
      station._addCollider(shX - 1.2, 0, shZ - 1.1, shX + 1.2, 2.6, shZ + 1.1, 'metal');
    }

    const jakX = isIsland ? p1MaxX - 2.0 : concMinX + 3.8;
    const jakZ = isIsland ? -16.0 : concMaxZ - 1.8;
    addAtlasBox(bStall, 0.85, 2.05, 0.65, jakX, 1.02, jakZ, 0, null, STALL_UV.jaklingko);
    station._addCollider(jakX - 0.45, 0, jakZ - 0.35, jakX + 0.45, 2.05, jakZ + 0.35, 'metal');
    const jakUsed = station._usedIds.has('jaklingko_kiosk');
    station.interactables.push({
      id: 'jaklingko_kiosk', type: 'jaklingko', x: jakX, y: 1.2, z: jakZ,
      label: jakUsed ? '[E] Terminal JakLingko (Sudah Diambil)' : '[E] Top-Up KUE / JakLingko Terminal (+Amunisi)',
      prompt: jakUsed ? '[E] Terminal JakLingko (Sudah Diambil)' : '[E] Top-Up KUE / JakLingko Terminal (+1 Magazin)',
      used: jakUsed
    });

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
    station._addCollider(totemX - 0.86, 0, totemZ - 0.16, totemX + 0.86, 1.92, totemZ + 0.16, 'metal');
    station.interactables.push({
      id: 'route_totem', type: 'info', x: totemX, y: 1.2, z: totemZ,
      label: '[E] Periksa Peta Rute LRT Jabodebek',
      prompt: '[E] Periksa Peta Rute LRT Jabodebek', used: false
    });

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
      jpoZ, jpoSpanMinX, jpoSpanMaxX, jpoCX, jpo2Z,
      supX, supZ, rotioX, rotioZ, turnstileList, tubeCoords
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
    for (let t = 0; t < turnstileList.length; t++) {
      const ts = turnstileList[t];
      metalPropSpecs.push({ x: ts.x, y: 0.72, z: ts.z, sx: 0.46, sy: 0.14, sz: 0.46, rx: 0, ry: ts.yaw, rz: 0, color: 0xd6dade, halfH: 0.12, dynamic: false, interactId: ts.id });
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

    // =========================================================
    // 9B. TACTICAL LOOTBOX CRATES (2 PER STATION — Hinged Lid & Yellow Halo)
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

    const balLootX = isIsland ? (jpoCX - 1.8) : (concMinX + 1.2);
    const balLootZ = isIsland ? (jpoZ + 1.2) : (concMidZ - 4.0);
    placeLootbox('station_balcony_lootbox', balLootX, UPPER_FLOOR_Y, balLootZ, isIsland ? 0.0 : Math.PI * 0.5, 0.30, 'Peti Taktis Balkon');

    const farLootX = arch.hasDepotShed ? (depotMaxX - 1.6)
      : (isCawang ? (i2MaxX - 2.0) : (isIsland ? (p1MaxX - 2.2) : (p2MinX + 1.8)));
    const farLootZ = arch.hasDepotShed ? 58.2
      : (isCawang ? -46.0 : (isIsland ? 52.0 : -52.0));
    const farLootRy = (!isIsland && !arch.hasDepotShed) ? Math.PI * 0.5 : -Math.PI * 0.5;
    placeLootbox('station_far_lootbox', farLootX, 0.0, farLootZ, farLootRy, 0.65, arch.hasDepotShed ? 'Peti Taktis Depot' : 'Peti Taktis Peron 2');

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
          rampAxis: cc.rampAxis,
          y0: cc.y0,
          y1: cc.y1
        });
      }
    }

    // Finalize 2m x 2m Spatial Hash Grid (indexes BOTH station & city colliders!)
    station._buildSpatialGrid();

    // =========================================================
    // 12. GENERATE ZOMBIE SPAWN NODES (STATION + CITY STREETS)
    // =========================================================
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

    if (LRT.City && typeof LRT.City.getSpawnNodes === 'function') {
      const citySpawns = LRT.City.getSpawnNodes();
      for (let i = 0; i < citySpawns.length; i++) candidateZones.push(citySpawns[i]);
    }

    for (let i = 0; i < candidateZones.length; i++) {
      const n = candidateZones[i];
      const ny = n.y !== undefined ? n.y : 0.0;
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
