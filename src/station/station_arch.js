(function (LRT) {
  'use strict';

  window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {};
  const S = (window.__LRT_INTERNAL__.station = window.__LRT_INTERNAL__.station || {});

  function computeRailConfig(arch, dims) {
    const a = arch || {};
    const d = dims || {};
    const layout = a.layout || 'SIDE_DUAL';
    const isCawang = layout === 'CAWANG_HUB';
    const isDepot = layout === 'ISLAND_DEPOT';
    const isIsland = layout === 'ISLAND_CENTRAL' || isCawang || isDepot;
    const psdX = d.psdEdgeX || 1.46;
    const p1MinX = psdX;
    const p1Width = isIsland ? (a.islandWidth || d.islandPlatformWidth || 9.60) : 5.60;
    const p1MaxX = p1MinX + p1Width;
    const track2X = isIsland ? (p1MaxX + 1.46) : (d.track2X || -4.70);
    return {
      layout: layout,
      isCawang: isCawang,
      isDepot: isDepot,
      isIsland: isIsland,
      track1X: 0.0,
      track2X: track2X,
      psd1X: psdX,
      psd2X: track2X - 1.46,
      platEdge1X: psdX,
      platEdge2X: track2X - 1.46,
      p1MinX: p1MinX,
      p1Width: p1Width,
      p1MaxX: p1MaxX,
      p2MinX: isIsland ? p1MinX : (track2X - 1.46 - 5.20),
      p2MaxX: track2X - 1.46
    };
  }

  function buildArchitecture(station, ctx) {
    const {
      STREET_GROUND_Y, SIDEWALK_Y, RAIL_TOP_Y, TRACK_BED_Y,
      UPPER_FLOOR_Y, CROSSING_Z_SOUTH, CROSSING_Z_NORTH, CROSSING_HALF_W
    } = S.CONST;
    const {
      prepGeo, addBox, addAtlasBox, addAtlasQuad, addCylinder,
      addWedgeRamp, addSlopedBeam, addSlopedBeamX
    } = S;

    const {
      arch, dims, root, mats, STALL_UV, SIGN_UV,
      matConcreteRough, buckets,
      addNavChain, glassRecords, registerStairZone,
      stairZones: ctxStairZones, isInStairExclusion: ctxIsInStairExclusion
    } = ctx;

    const stairZones = ctxStairZones || (ctx.stairZones = []);
    const isInStairExclusion = ctxIsInStairExclusion || ((x, z, extraX, extraZ) => {
      const ex = extraX || 0;
      const ez = extraZ || 0;
      for (let i = 0; i < stairZones.length; i++) {
        const s = stairZones[i];
        if (x >= s.minX - ex && x <= s.maxX + ex && z >= s.minZ - ez && z <= s.maxZ + ez) {
          return true;
        }
      }
      return false;
    });
    const ensureStairZone = (sx, zFoot, zTop) => {
      const minZ = Math.min(zFoot, zTop) - 2.6;
      const maxZ = Math.max(zFoot, zTop) + 2.6;
      for (let i = 0; i < stairZones.length; i++) {
        const s = stairZones[i];
        if (s.sx !== undefined && Math.abs(s.sx - sx) < 0.05 && Math.abs(s.minZ - minZ) < 0.05 && Math.abs(s.maxZ - maxZ) < 0.05) {
          return;
        }
      }
      registerStairZone(sx, zFoot, zTop);
    };

    station._structuralCols = [];
    station._stairZones = stairZones;
    const recordStructuralCol = (x, z, minY, maxY, tag) => {
      station._structuralCols.push({ x, z, minY, maxY, tag: tag || 'col' });
    };

    const {
      bConcrete, bConcreteRough, bTerrazzo, bChecker, bTactile,
      bRoof, bTruss, bSteelDark, bJpo, bStall, bSign, bBanner,
      bStairStepsConc, bStairStepsSteel, bStairSlopeBvh
    } = buckets;

    const buildTacticalSupplyCabinet = (x, y, z, yaw, style) => {
      const st = style || 'tactical';
      const isDepotStyle = st === 'depot';
      const isEmergStyle = st === 'emergency';
      const bodyH = isDepotStyle ? 1.01 : 0.86;
      const deckY = y + 0.08 + bodyH;
      const topY = deckY + 0.06; // 1.15m for depot (aligns with Field Log at 1.16m), 1.00m for others
      const cos = Math.cos(yaw || 0);
      const sin = Math.sin(yaw || 0);
      const toW = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];

      // 1) Heavy steel plinth base + main armored cabinet carcass
      addBox(bSteelDark, 1.08, 0.08, 0.62, x, y + 0.04, z, 0, yaw, 0);
      addBox(bSteelDark, 1.00, bodyH, 0.54, x, y + 0.08 + bodyH * 0.5, z, 0, yaw, 0);

      // 2) Brushed steel vertical corner trim & louvered side vents
      for (const sx of [-0.49, 0.49]) {
        for (const sz of [-0.26, 0.26]) {
          const cp = toW(sx, sz);
          addBox(bTruss, 0.05, bodyH + 0.02, 0.05, cp[0], y + 0.08 + bodyH * 0.5, cp[1], 0, yaw, 0);
        }
        const vp = toW(sx * 1.03, 0);
        for (let vy = 0.22; vy < bodyH - 0.14; vy += 0.14) {
          addBox(bTruss, 0.02, 0.04, 0.28, vp[0], y + 0.08 + vy, vp[1], 0, yaw, 0);
        }
      }

      // 3) Dual front cabinet door leaves + brushed stainless pull handles + center seam
      const doorH = bodyH - 0.14;
      const doorCY = y + 0.08 + doorH * 0.5 + 0.03;
      for (const dx of [-0.23, 0.23]) {
        const dp = toW(dx, 0.275);
        addAtlasBox(bStall, 0.42, doorH, 0.03, dp[0], doorCY, dp[1], yaw, null, STALL_UV.rotioCreamSolid);
        const hp = toW(dx + (dx < 0 ? 0.14 : -0.14), 0.298);
        addBox(bTruss, 0.03, 0.18, 0.03, hp[0], doorCY + 0.04, hp[1], 0, yaw, 0);
      }
      const seamP = toW(0, 0.282);
      addBox(bSteelDark, 0.03, doorH + 0.02, 0.03, seamP[0], doorCY, seamP[1], 0, yaw, 0);

      // 4) High-visibility safety stripe band + emissive status/keypad module (+ Red Cross for emergency)
      const bandP = toW(0, 0.282);
      addBox(isEmergStyle ? bJpo : bTactile, 0.98, 0.075, 0.028, bandP[0], deckY - 0.05, bandP[1], 0, yaw, 0);
      const ledP = toW(-0.34, 0.294);
      addAtlasBox(bSign, 0.16, 0.09, 0.025, ledP[0], doorCY + 0.16, ledP[1], yaw, null, SIGN_UV.evakuasiGreen);
      const warnP = toW(0.32, 0.294);
      addAtlasBox(bSign, 0.18, 0.12, 0.025, warnP[0], doorCY + 0.16, warnP[1], yaw, null, SIGN_UV.safetyWarn);
      if (isEmergStyle) {
        const crP = toW(0.23, 0.295);
        addAtlasBox(bSign, 0.20, 0.065, 0.025, crP[0], doorCY - 0.04, crP[1], yaw, null, SIGN_UV.hydrantRedSolid);
        addAtlasBox(bSign, 0.065, 0.20, 0.025, crP[0], doorCY - 0.04, crP[1], yaw, null, SIGN_UV.hydrantRedSolid);
      }

      // 5) Brushed stainless steel top worktop + scaled 3-LOD GLTF tactical crate(s) on top
      addBox(bTruss, 1.06, 0.06, 0.60, x, deckY + 0.03, z, 0, yaw, 0);
      const cloneFn = (LRT.AssetLoader && typeof LRT.AssetLoader.cloneModel === 'function')
        ? LRT.AssetLoader.cloneModel
        : null;
      const placeCabinetProp = (modelKey, lx, lz, ryOff, targetH) => {
        const wp = toW(lx, lz);
        if (typeof station._placeNormalizedModel === 'function') {
          station._placeNormalizedModel(modelKey, wp[0], topY, wp[1], (yaw || 0) + ryOff, targetH);
        } else if (cloneFn) {
          const mdl = cloneFn(modelKey);
          if (mdl) {
            mdl.position.set(wp[0], topY, wp[1]);
            mdl.rotation.y = (yaw || 0) + ryOff;
            root.add(mdl);
          }
        }
      };
      if (isDepotStyle) {
        // Leave center (0, topY, 0) clear for Depot Field Log folder placed by station_nav_props at y=1.16!
        placeCabinetProp('ammo_box', -0.28, 0.02, 0.18, 0.22);
      } else if (isEmergStyle) {
        placeCabinetProp('medical_box', -0.22, 0.0, 0.14, 0.16);
        placeCabinetProp('ammo_box', 0.24, 0.02, -0.22, 0.20);
      } else {
        placeCabinetProp('ammo_box', -0.22, 0.0, 0.24, 0.22);
        placeCabinetProp('medical_box', 0.24, 0.02, -0.15, 0.14);
      }
      return topY;
    };

    const railCfg = computeRailConfig(arch, dims);
    const {
      layout, isCawang, isDepot, isIsland,
      psd1X: psdX, p1MinX, p1Width, p1MaxX, track2X
    } = railCfg;

    // Clamp platform length <= 124m ([-62..+62]) so level crossings at z = ±74 are 100% open across all 6 archetypes!
    const platLen = Math.min(arch.platLen || dims.platformLength || 120, 124);
    const halfPlat = platLen * 0.5;
    const platMinZ = -halfPlat;
    const platMaxZ = halfPlat;
    station._railConfig = railCfg;

    // =========================================================
    // 1. AT-GRADE GROUND-LEVEL BALLASTED TRACKS (railTopY = -1.00)
    // =========================================================
    const trackXs = isCawang ? [-4.70, 0.0, track2X, track2X + 4.70] : [0.0, track2X];
    const buildAtGradeTrack = (tx) => {
      // Ballast bed trough inside station bounds (pausing cleanly at z = ±74 level crossings!)
      const segLen = (CROSSING_Z_NORTH - CROSSING_HALF_W) - (CROSSING_Z_SOUTH + CROSSING_HALF_W); // -68 .. +68
      const segCZ = 0.0;
      addBox(bConcreteRough, 3.30, 0.08, segLen, tx, TRACK_BED_Y + 0.04, segCZ, 0, 0, 0, 1.5, segLen * 0.25);
      // Continuous steel running rails (1.435m gauge, rail top flush at -1.00!)
      const railSpanLen = (CROSSING_Z_NORTH + CROSSING_HALF_W) - (CROSSING_Z_SOUTH - CROSSING_HALF_W); // -80 .. +80
      addBox(bSteelDark, 0.10, 0.14, railSpanLen, tx - 0.7175, RAIL_TOP_Y - 0.07, 0, 0, 0, 0, 1, railSpanLen * 0.3);
      addBox(bSteelDark, 0.10, 0.14, railSpanLen, tx + 0.7175, RAIL_TOP_Y - 0.07, 0, 0, 0, 0, 1, railSpanLen * 0.3);
      // 750V DC third rail coverboard (inside platform bounds only, pausing before crossings!)
      addBox(bSteelDark, 0.20, 0.14, platLen - 2.0, tx - 1.15, RAIL_TOP_Y + 0.05, 0, 0, 0, 0, 1, platLen * 0.25);
      // Concrete sleepers along ballasted bed (-67 .. +67)
      for (let sz = -66.6; sz <= 66.6; sz += 1.2) {
        addBox(bConcrete, 2.25, 0.10, 0.24, tx, TRACK_BED_Y + 0.09, sz, 0, 0, 0, 1, 1);
      }
    };
    for (let ti = 0; ti < trackXs.length; ti++) {
      buildAtGradeTrack(trackXs[ti]);
    }

    // Grounded trackbed floor colliders (y = -1.10) between z = -68 .. +68 so players/zombies never fall below -1.12
    const trackMinX = Math.min.apply(null, trackXs) - 1.7;
    const trackMaxX = Math.max.apply(null, trackXs) + 1.7;
    station._addCollider(trackMinX, -1.25, CROSSING_Z_SOUTH + CROSSING_HALF_W, trackMaxX, -1.10, CROSSING_Z_NORTH - CROSSING_HALF_W, 'floor', {
      isFloor: true, blocksWalk: true, blocksBullets: false
    });

    // =========================================================
    // 2. GROUNDED PLATFORMS 1 & 2 / ISLAND 2 (y = -1.16 .. 0.0)
    // =========================================================
    addBox(bConcrete, p1Width, 1.12, platLen, (p1MinX + p1MaxX) * 0.5, -0.60, 0, 0, 0, 0, p1Width * 0.4, platLen * 0.25);
    addBox(bTerrazzo, p1Width, 0.04, platLen, (p1MinX + p1MaxX) * 0.5, -0.02, 0, 0, 0, 0, p1Width / 2.4, platLen / 2.4);
    station._addCollider(p1MinX, -1.18, platMinZ, p1MaxX, 0.0, platMaxZ, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

    const tacX = p1MinX + (dims.tactileOffsetFromPsd || 0.60) + (dims.tactileWidth || 0.45) * 0.5;
    addBox(bTactile, dims.tactileWidth || 0.45, 0.015, platLen - 6, tacX, 0.008, 0, 0, 0, 0, 0.8, (platLen - 6) * 0.7);
    if (isIsland) {
      addBox(bTactile, dims.tactileWidth || 0.45, 0.015, platLen - 6, p1MaxX - 0.82, 0.008, 0, 0, 0, 0, 0.8, (platLen - 6) * 0.7);
    }

    const i2MinX = track2X + 4.70 + 1.42;
    const i2Width = 9.0;
    const i2MaxX = i2MinX + i2Width;
    const p2MaxX = track2X - 1.46;
    const p2MinX = p2MaxX - 5.20;

    // Trackside Emergency Maintenance Climb Steps (y = -0.55m, 0.42m wide)
    // Aligned with every breakable PSD doorway (dims.psdCentersZ) + open non-PSD bay ends so players
    // who breach any PSD door onto the -1.10m trackbed can jump onto the step and climb back onto any platform!
    const psdStepZs = Array.isArray(dims.psdCentersZ) && dims.psdCentersZ.length > 0
      ? dims.psdCentersZ
      : [-23.25, -17.55, -11.85, -5.70, 0.0, 5.70, 11.85, 17.55, 23.25];
    const psdStepLen = Math.min(1.80, dims.psdDoorClearWidth || 1.50);
    const buildTracksideClimbSteps = (wallX, sideSign, zList, stepLen, skipSpans) => {
      const stepX = wallX + sideSign * 0.21;
      const lenZ = stepLen || 1.50;
      const halfZ = lenZ * 0.5;
      const brkOff = Math.max(0.35, halfZ - 0.18);
      for (let ci = 0; ci < zList.length; ci++) {
        const sz = zList[ci];
        if (sz < platMinZ + 2.0 || sz > platMaxZ - 2.0) continue;
        if (skipSpans && skipSpans.some((sp) => sz >= sp[0] - 1.0 && sz <= sp[1] + 1.0)) continue;
        addBox(bTactile, 0.42, 0.06, lenZ, stepX, -0.55, sz, 0, 0, 0, 0.8, 1.5);
        addBox(bSteelDark, 0.38, 0.12, 0.08, wallX + sideSign * 0.19, -0.64, sz - brkOff);
        addBox(bSteelDark, 0.38, 0.12, 0.08, wallX + sideSign * 0.19, -0.64, sz + brkOff);
        station._addCollider(stepX - 0.21, -0.65, sz - halfZ, stepX + 0.21, -0.52, sz + halfZ, 'metal', {
          blocksWalk: true, blocksBullets: false
        });
      }
    };
    buildTracksideClimbSteps(p1MinX, -1, psdStepZs, psdStepLen);
    if (!isIsland) {
      buildTracksideClimbSteps(p2MaxX, 1, psdStepZs, psdStepLen);
    } else {
      buildTracksideClimbSteps(p1MaxX, 1, psdStepZs, psdStepLen);
      if (isCawang) {
        buildTracksideClimbSteps(i2MinX, -1, [-58.0, 58.0], 1.80, [[-11.6, 23.6]]);
      }
      if (arch.hasDepotShed) {
        buildTracksideClimbSteps(track2X + 1.60, 1, [40.0, 56.0], 1.80);
      }
    }

    // Exterior Grounded Stair or Smooth Ramp connecting highY <-> lowY along axis ('x' or 'z')
    const buildGroundedTransition = (cx, cz, width, run, highY, lowY, axis, highAtNeg, isStair) => {
      const hw = width * 0.5;
      const hr = run * 0.5;
      const minX = axis === 'x' ? cx - hr : cx - hw;
      const maxX = axis === 'x' ? cx + hr : cx + hw;
      const minZ = axis === 'z' ? cz - hr : cz - hw;
      const maxZ = axis === 'z' ? cz + hr : cz + hw;
      const y0 = highAtNeg ? highY : lowY;
      const y1 = highAtNeg ? lowY : highY;
      const minY = Math.min(lowY, highY);
      const maxY = Math.max(lowY, highY);

      stairZones.push({
        minX: minX - 1.2,
        maxX: maxX + 1.2,
        minZ: minZ - 1.2,
        maxZ: maxZ + 1.2,
        rawMinX: minX,
        rawMaxX: maxX,
        rawMinZ: minZ,
        rawMaxZ: maxZ,
        minY: minY,
        maxY: maxY + 1.0,
        isTransition: true
      });

      if (isStair) {
        const steps = Math.max(5, Math.round(Math.abs(highY - lowY) * 7));
        const stepRun = run / steps;
        for (let s = 0; s < steps; s++) {
          const frac = (s + 0.5) / steps;
          const syTop = y0 + (y1 - y0) * frac;
          const stepH = Math.max(0.14, syTop - (lowY - 0.16));
          if (axis === 'x') {
            const sx = minX + (s + 0.5) * stepRun;
            addBox(bStairStepsConc, stepRun + 0.02, stepH, width, sx, syTop - stepH * 0.5, cz, 0, 0, 0, 1, width * 0.5);
          } else {
            const sz = minZ + (s + 0.5) * stepRun;
            addBox(bStairStepsConc, width, stepH, stepRun + 0.02, cx, syTop - stepH * 0.5, sz, 0, 0, 0, width * 0.5, 1);
          }
        }
        addWedgeRamp(bStairSlopeBvh, minX, minZ, maxX, maxZ, y0, y1, axis, true);
      } else {
        // Smooth poured-concrete ADA ramp wedge (walkable & raycastable without riser snags)
        addWedgeRamp(bConcreteRough, minX, minZ, maxX, maxZ, y0, y1, axis, false);
      }

      // Handrails + Side Guard Colliders (prevents clipping sideways into ramp/stairs!)
      if (axis === 'x') {
        for (const sideSign of [-1, 1]) {
          const rz = cz + sideSign * (hw + 0.06);
          addSlopedBeamX(bTruss, 0.06, 0.06, rz, minX, y0 + 0.88, maxX, y1 + 0.88);
          addBox(bTruss, 0.05, 0.90, 0.05, minX + 0.12, y0 + 0.45, rz);
          addBox(bTruss, 0.05, 0.90, 0.05, maxX - 0.12, y1 + 0.45, rz);
          station._addCollider(minX, minY, rz - 0.08, maxX, maxY + 1.0, rz + 0.08, 'metal', { blocksBullets: false });
        }
      } else {
        for (const sideSign of [-1, 1]) {
          const rx = cx + sideSign * (hw + 0.06);
          addSlopedBeam(bTruss, 0.06, 0.06, rx, minZ, y0 + 0.88, maxZ, y1 + 0.88);
          addBox(bTruss, 0.05, 0.90, 0.05, rx, y0 + 0.45, minZ + 0.12);
          addBox(bTruss, 0.05, 0.90, 0.05, rx, y1 + 0.45, maxZ - 0.12);
          station._addCollider(rx - 0.08, minY, minZ, rx + 0.08, maxY + 1.0, maxZ, 'metal', { blocksBullets: false });
        }
      }

      const cid = station._addCollider(minX, minY - 0.15, minZ, maxX, maxY + 0.15, maxZ, 'ramp', {
        isRamp: true, blocksWalk: true, blocksBullets: false
      });
      const rc = station.colliders[cid];
      rc.rampAxis = axis;
      rc.y0 = y0;
      rc.y1 = y1;
      if (axis === 'x') {
        addNavChain([
          [minX - 0.65, y0, cz, 0.75],
          [cx, (y0 + y1) * 0.5, cz, 0.5],
          [maxX + 0.65, y1, cz, 0.75]
        ], isStair ? 'stair_ramp' : 'ada_ramp');
      } else {
        addNavChain([
          [cx, y0, minZ - 0.65, 0.75],
          [cx, (y0 + y1) * 0.5, cz, 0.5],
          [cx, y1, maxZ + 0.65, 0.75]
        ], isStair ? 'stair_ramp' : 'ada_ramp');
      }
    };

    // Platform 1 North & South End Guardrails WITH 3.8m OPEN EXIT PORTALS + Exterior Stairs down to -0.82!
    const buildEndGateAndStairs = (xMin, xMax, zEdge, isNorth) => {
      const w = xMax - xMin;
      const cx = (xMin + xMax) * 0.5;
      const gateHalf = 1.9;
      const sideW = Math.max(0.4, (w - gateHalf * 2) * 0.5);
      const wallZ = isNorth ? zEdge - 0.18 : zEdge + 0.18;
      if (w > gateHalf * 2 + 0.8) {
        addBox(bConcrete, sideW, 1.35, 0.35, xMin + sideW * 0.5, 0.68, wallZ);
        addBox(bConcrete, sideW, 1.35, 0.35, xMax - sideW * 0.5, 0.68, wallZ);
        station._addCollider(xMin, 0, wallZ - 0.22, cx - gateHalf, 1.8, wallZ + 0.22, 'concrete');
        station._addCollider(cx + gateHalf, 0, wallZ - 0.22, xMax, 1.8, wallZ + 0.22, 'concrete');
      }
      const run = 3.2;
      const stairCZ = isNorth ? zEdge + run * 0.5 : zEdge - run * 0.5;
      buildGroundedTransition(cx, stairCZ, Math.min(3.6, w - 0.4), run, 0.0, SIDEWALK_Y, 'z', isNorth, true);
    };
    buildEndGateAndStairs(p1MinX, p1MaxX, platMinZ, false);
    buildEndGateAndStairs(p1MinX, p1MaxX, platMaxZ, true);

    // Opposite Platform 2 (for SIDE_DUAL) or Walkable Island 2 (for CAWANG_HUB)
    if (!isIsland) {
      addBox(bConcrete, 5.20, 1.12, platLen, (p2MinX + p2MaxX) * 0.5, -0.60, 0, 0, 0, 0, 2, platLen * 0.25);
      addBox(bTerrazzo, 5.20, 0.04, platLen, (p2MinX + p2MaxX) * 0.5, -0.02, 0, 0, 0, 0, 2.2, platLen / 2.4);
      addBox(bTactile, dims.tactileWidth || 0.45, 0.015, platLen - 6, p2MaxX - 0.82, 0.008, 0, 0, 0, 0, 0.8, (platLen - 6) * 0.7);
      station._addCollider(p2MinX, -1.18, platMinZ, p2MaxX, 0.0, platMaxZ, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

      // Platform 2 outer windscreen with OPEN 5.2m West Street Exit Portal at z in [-2.6 .. +2.6]!
      const p2DoorZ0 = -2.6, p2DoorZ1 = 2.6;
      const sSeg = p2DoorZ0 - platMinZ;
      const nSeg = platMaxZ - p2DoorZ1;
      addBox(bConcrete, 0.35, 1.25, sSeg, p2MinX + 0.18, 0.62, platMinZ + sSeg * 0.5, 0, 0, 0, 1, sSeg * 0.2);
      addBox(bConcrete, 0.35, 1.25, nSeg, p2MinX + 0.18, 0.62, p2DoorZ1 + nSeg * 0.5, 0, 0, 0, 1, nSeg * 0.2);
      station._addCollider(p2MinX, 0.0, platMinZ, p2MinX + 0.35, 2.6, p2DoorZ0, 'concrete');
      station._addCollider(p2MinX, 0.0, p2DoorZ1, p2MinX + 0.35, 2.6, platMaxZ, 'concrete');
      // West Exit Stairs + Ramp descending to -0.82 West Promenade Sidewalk
      buildGroundedTransition(p2MinX - 1.8, 0.0, 4.8, 3.6, 0.0, SIDEWALK_Y, 'x', false, true);

      for (let lz = platMinZ + 4; lz <= platMaxZ - 4; lz += 6.5) {
        if (lz > p2DoorZ0 - 2.0 && lz < p2DoorZ1 + 2.0) continue;
        addBox(bSteelDark, 0.14, 1.65, 5.8, p2MinX + 0.18, 2.04, lz);
      }
      buildEndGateAndStairs(p2MinX, p2MaxX, platMinZ, false);
      buildEndGateAndStairs(p2MinX, p2MaxX, platMaxZ, true);
    } else if (isCawang) {
      addBox(bConcrete, i2Width, 1.12, platLen, (i2MinX + i2MaxX) * 0.5, -0.60, 0, 0, 0, 0, 3, platLen * 0.25);
      addBox(bTerrazzo, i2Width, 0.04, platLen, (i2MinX + i2MaxX) * 0.5, -0.02, 0, 0, 0, 0, 3.5, platLen / 2.4);
      addBox(bTactile, dims.tactileWidth || 0.45, 0.015, platLen - 6, i2MinX + 0.82, 0.008, 0, 0, 0, 0, 0.8, (platLen - 6) * 0.7);
      station._addCollider(i2MinX, -1.18, platMinZ, i2MaxX, 0.0, platMaxZ, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

      addBox(bSteelDark, 0.22, 1.40, platLen - 14, i2MinX + 0.12, 0.70, 0);
      station._addCollider(i2MinX, 0, platMinZ + 7, i2MinX + 0.26, 1.5, platMaxZ - 7, 'metal');

      // Island 2 East outer wall with 6m Open East Street Exit Portal at z in [12 .. 18]
      const i2DoorZ0 = 12.0, i2DoorZ1 = 18.0;
      const i2S = i2DoorZ0 - platMinZ;
      const i2N = platMaxZ - i2DoorZ1;
      addBox(bConcrete, 0.35, 1.25, i2S, i2MaxX - 0.18, 0.62, platMinZ + i2S * 0.5);
      addBox(bConcrete, 0.35, 1.25, i2N, i2MaxX - 0.18, 0.62, i2DoorZ1 + i2N * 0.5);
      station._addCollider(i2MaxX - 0.38, 0, platMinZ, i2MaxX, 2.6, i2DoorZ0, 'concrete');
      station._addCollider(i2MaxX - 0.38, 0, i2DoorZ1, i2MaxX, 2.6, platMaxZ, 'concrete');
      buildGroundedTransition(i2MaxX + 1.8, 15.0, 5.2, 3.6, 0.0, SIDEWALK_Y, 'x', true, true);

      for (let lz = platMinZ + 4; lz <= platMaxZ - 4; lz += 6.5) {
        if (lz > i2DoorZ0 - 2 && lz < i2DoorZ1 + 2) continue;
        addBox(bSteelDark, 0.14, 1.65, 5.8, i2MaxX - 0.18, 2.04, lz);
      }
      buildEndGateAndStairs(i2MinX, i2MaxX, platMinZ, false);
      buildEndGateAndStairs(i2MinX, i2MaxX, platMaxZ, true);

      const wreckX = track2X + 4.70;
      ctx.cawangWreckX = wreckX;
      if (LRT.Train && typeof LRT.Train.createStaticLrtConsist === 'function') {
        const derelictTrain = LRT.Train.createStaticLrtConsist({ carCount: 2, derelict: true, name: 'CawangDerelictConsist' });
        derelictTrain.position.set(wreckX + 0.12, 0.0, 6.0);
        derelictTrain.rotation.set(0.014, 0.035, -0.055);
        derelictTrain.traverse((ch) => {
          if (ch.isMesh) {
            ch.castShadow = false;
            if (ch.geometry) station.disposableGeometries.push(ch.geometry);
          }
        });
        root.add(derelictTrain);
      }
      station._addCollider(wreckX - 1.38, -1.0, -11.6, wreckX + 1.48, 3.15, 23.6, 'metal');
      buildTacticalSupplyCabinet(i2MaxX - 2.2, 0.0, 22.0, -Math.PI * 0.5, 'emergency');
      station._addCollider(i2MaxX - 2.55, 0, 21.42, i2MaxX - 1.85, 1.20, 22.58, 'metal');
      const i2Used = station._usedIds.has('island2_supply');
      station.interactables.push({
        id: 'island2_supply', type: 'balcony_supply', x: i2MaxX - 2.6, y: 1.0, z: 22.0,
        label: i2Used ? '[E] Loker Darurat Peron 4 Cawang (Sudah Diambil)' : '[E] Loker Darurat Peron 4 Cawang (+Amunisi & +25 HP)',
        prompt: i2Used ? '[E] Loker Darurat Peron 4 Cawang (Sudah Diambil)' : '[E] Loker Darurat Peron 4 Cawang (+Amunisi & +25 HP)',
        used: i2Used
      });

      const cabUsed = station._usedIds.has('cawang_derelict_cab');
      station.interactables.push({
        id: 'cawang_derelict_cab',
        type: 'derelict_fuse',
        x: wreckX - 1.55,
        y: 1.0,
        z: -10.5,
        label: cabUsed ? '[E] Kabin Bangkai LRT Cawang (Sudah Digeledah)' : '[E] Periksa Kabin Bangkai LRT Cawang (+Sekring Bypass & Shotgun 12G)',
        prompt: cabUsed ? '[E] Kabin Bangkai LRT Cawang (Sudah Digeledah)' : '[E] Periksa Kabin Bangkai LRT Cawang (+Sekring Bypass & Shotgun 12G)',
        used: cabUsed
      });
    }

    // =========================================================
    // 3. CONCOURSE HALL WING, OPEN STREET PORTALS & JPO OVERHEAD SKYBRIDGE
    // =========================================================
    const cw = arch.concourseWidth || 13.5;
    const concLen = Math.min(arch.concourseLen || 36.0, 48.0);
    const rawConcMin = arch.concourseEnd === 'south' ? Math.round(-concLen - 2)
      : arch.concourseEnd === 'north' ? 2 : Math.round(-concLen * 0.5);
    const concMinZ = Math.max(platMinZ + 4, Math.min(platMaxZ - concLen - 4, rawConcMin));
    const concMaxZ = concMinZ + concLen;
    const concMinX = p1MaxX;
    const concMaxX = isIsland ? p1MaxX : concMinX + cw;
    const concMidZ = (concMinZ + concMaxZ) * 0.5;

    let canopySpanX, canopyCenterX;
    if (isCawang) {
      canopySpanX = 38.5;
      canopyCenterX = 11.4;
    } else if (isIsland) {
      canopySpanX = p1Width + 5.8;
      canopyCenterX = (p1MinX + p1MaxX) * 0.5;
    } else {
      const canopyMinTgt = -12.2;
      const canopyMaxTgt = concMaxX - 4.0;
      canopySpanX = canopyMaxTgt - canopyMinTgt;
      canopyCenterX = (canopyMinTgt + canopyMaxTgt) * 0.5;
    }
    const canopyMinX = canopyCenterX - canopySpanX * 0.5;
    const canopyMaxX = canopyCenterX + canopySpanX * 0.5;
    const apexY = isCawang ? (dims.cawangApexY || 12.60) : (dims.canopyApexY || 9.85);
    const eaveY = dims.canopyEaveY || 7.15;
    const segs = 10; // Smooth curved barrel-vault canopy segments!

    const getCanopyArchY = (x) => {
      const t = Math.max(0, Math.min(1, (x - canopyMinX) / canopySpanX));
      const kf = t * segs;
      const k = Math.min(segs - 1, Math.floor(kf));
      const f = kf - k;
      const y0 = eaveY + Math.sin((k / segs) * Math.PI) * (apexY - eaveY);
      const y1 = eaveY + Math.sin(((k + 1) / segs) * Math.PI) * (apexY - eaveY);
      return y0 + (y1 - y0) * f;
    };

    const buildStairRamp = (sx, zFoot, zTop, topY, botYArg) => {
      const yBot = botYArg !== undefined ? botYArg : 0.0;
      const yTarget = topY !== undefined ? topY : UPPER_FLOOR_Y;
      const rise = yTarget - yBot;
      ensureStairZone(sx, zFoot, zTop);
      const steps = Math.max(12, Math.round(Math.abs(rise) * 4.2));
      const stepRise = rise / steps;
      const dir = zTop > zFoot ? 1 : -1;
      const stepRun = Math.abs(zTop - zFoot) / steps;
      for (let s = 0; s < steps; s++) {
        const syTop = yBot + (s + 1) * stepRise;
        const sz = zFoot + dir * (s + 0.5) * stepRun;
        addBox(bStairStepsSteel, 2.2, Math.abs(stepRise), stepRun + 0.02, sx, syTop - Math.abs(stepRise) * 0.5, sz);
      }
      const minSZ = Math.min(zFoot, zTop);
      const maxSZ = Math.max(zFoot, zTop);
      const yAtMinZ = zTop > zFoot ? yBot : yTarget;
      const yAtMaxZ = zTop > zFoot ? yTarget : yBot;
      addWedgeRamp(bStairSlopeBvh, sx - 1.1, minSZ, sx + 1.1, maxSZ, yAtMinZ, yAtMaxZ, 'z', true);
      for (let s = 0; s < 6; s++) {
        const f0 = s / 6;
        const f1 = (s + 1) / 6;
        const z0 = zFoot + (zTop - zFoot) * f0;
        const z1 = zFoot + (zTop - zFoot) * f1;
        const y0 = yBot + rise * f0;
        const y1 = yBot + rise * f1;
        const segMinY = Math.min(y0, y1);
        const segMaxY = Math.max(y0, y1);
        const segMinZ = Math.min(z0, z1);
        const segMaxZ = Math.max(z0, z1);
        const floorY = Math.min(yBot, yTarget);
        const headroom = segMinY - floorY;
        const colMinY = headroom < 2.00 ? (floorY - 0.1) : (segMinY - 0.26);
        const colMaxY = segMaxY + 0.1;
        const cid = station._addCollider(sx - 1.1, colMinY, segMinZ, sx + 1.1, colMaxY, segMaxZ, 'metal', {
          isRamp: true, blocksWalk: true, blocksBullets: false
        });
        const rc = station.colliders[cid];
        rc.rampAxis = 'z';
        rc.y0 = zTop > zFoot ? y0 : y1;
        rc.y1 = zTop > zFoot ? y1 : y0;
      }

      const postFracs = [0.04, 0.28, 0.52, 0.76, 0.96];
      for (const sideSign of [-1, 1]) {
        const rx = sx + sideSign * 1.13;
        addSlopedBeam(bSteelDark, 0.08, 0.24, rx, zFoot, yBot, zTop, yTarget - 0.24);
        addSlopedBeam(bTruss, 0.06, 0.06, rx, zFoot, yBot + 0.90, zTop, yTarget + 0.90);
        addSlopedBeam(bTruss, 0.035, 0.035, rx, zFoot, yBot + 0.48, zTop, yTarget + 0.48);
        for (let p = 0; p < postFracs.length; p++) {
          const pf = postFracs[p];
          const pz = zFoot + (zTop - zFoot) * pf;
          const py = yBot + rise * pf;
          addBox(bTruss, 0.05, 0.92, 0.05, rx, py + 0.46, pz);
        }
        // Stepped side guardrail colliders: where headroom is >= 2.00m, allow walking underneath
        for (let s = 0; s < 6; s++) {
          const f0 = s / 6;
          const f1 = (s + 1) / 6;
          const z0 = zFoot + (zTop - zFoot) * f0;
          const z1 = zFoot + (zTop - zFoot) * f1;
          const y0 = yBot + rise * f0;
          const y1 = yBot + rise * f1;
          const segMinY = Math.min(y0, y1);
          const segMaxY = Math.max(y0, y1);
          const segMinZ = Math.min(z0, z1);
          const segMaxZ = Math.max(z0, z1);
          const floorY = Math.min(yBot, yTarget);
          const headroom = segMinY - floorY;
          const colMinY = headroom < 2.00 ? floorY : (segMinY - 0.26);
          const colMaxY = segMaxY + 1.02;
          station._addCollider(rx - 0.08, colMinY, segMinZ, rx + 0.08, colMaxY, segMaxZ, 'metal', { blocksBullets: false });
        }
      }
      addNavChain([
        [sx, yBot, zFoot - dir * 0.75, 0.75],
        [sx, yBot + rise * 0.25, zFoot + (zTop - zFoot) * 0.25, 0.5],
        [sx, (yBot + yTarget) * 0.5, (zFoot + zTop) * 0.5, 0.5],
        [sx, yBot + rise * 0.75, zFoot + (zTop - zFoot) * 0.75, 0.5],
        [sx, yTarget, zTop + dir * 0.75, 0.75]
      ], 'jpo_stair');
    };

    const gardenMaxX = arch.hasGardenTerrace ? (track2X + 12.2) : p1MaxX;
    const depotMaxX = arch.hasDepotShed ? (p1MaxX + 9.6) : p1MaxX;
    const corridorMinX = isIsland
      ? (isCawang ? -7.2 : (arch.hasDepotShed ? -6.2 : -2.4))
      : (p2MinX - 0.2);
    const corridorMaxX = isIsland
      ? (isCawang ? i2MaxX + 0.4 : Math.max(track2X + 2.4, depotMaxX + 0.4, gardenMaxX + 0.4))
      : (concMaxX + 0.2);

    const jpoZ = isCawang ? 0.0 : (arch.id === 'harjamukti' ? 24.0 : (arch.concourseEnd === 'north' ? 49.0 : (arch.concourseEnd === 'south' ? -49.0 : 34.0)));
    const jpoDepth = isCawang ? 20.0 : 5.4;
    const jpoSpanMinX = isIsland ? (corridorMinX - 3.4) : -11.3;
    const jpoSpanMaxX = isIsland ? (corridorMaxX + 3.4) : (p1MaxX + 4.2);
    const jpoW = jpoSpanMaxX - jpoSpanMinX;
    const jpoCX = (jpoSpanMinX + jpoSpanMaxX) * 0.5;
    const jpoNearZ = jpoZ > 0 ? jpoZ - jpoDepth * 0.5 : (jpoZ < 0 ? jpoZ + jpoDepth * 0.5 : -jpoDepth * 0.5);
    const jpoFarZ = jpoZ > 0 ? jpoZ + jpoDepth * 0.5 : (jpoZ < 0 ? jpoZ - jpoDepth * 0.5 : jpoDepth * 0.5);
    const stairX = isIsland ? p1MinX + 4.8 : p1MaxX - 1.75;
    const stairFootZ = jpoZ >= 0 ? jpoNearZ - 9.5 : jpoNearZ + 9.5;
    const stairTopZ = jpoNearZ;

    const swX = concMinX + 2.2;
    const swW = 3.4;
    const swMinX = swX - swW * 0.5;
    const swMaxX = swX + swW * 0.5;
    let cStairX = concMaxX - 1.70;
    let cStairFootZ = concMidZ - 5.0;
    let cStairTopZ = concMidZ + 5.0;
    let stairWellMinX = concMaxX - 3.0;
    if (!isIsland) {
      cStairX = concMaxX - 2.35;
      if (jpoZ > 0) {
        cStairFootZ = concMidZ - 5.0;
        cStairTopZ = concMidZ + 5.0;
      } else {
        cStairFootZ = concMidZ + 5.0;
        cStairTopZ = concMidZ - 5.0;
      }
      stairWellMinX = concMaxX - 3.6;
    }

    // Pre-compute Secondary JPO (jpo2) metrics & pre-register ALL JPO/Concourse/Depot stairZones
    // before ANY structural column or pier loop runs!
    const hasJpo2 = !!(arch.hasDualJpo || arch.hasGardenTerrace);
    const jpo2Z = hasJpo2 ? (isCawang ? 44.0 : (isIsland ? (jpoZ > 0 ? -38.0 : 38.0) : (jpoZ > 0 ? -34.0 : 34.0))) : null;
    const jpo2Depth = 4.8;
    const jpo2MinX = isIsland ? (isCawang ? -7.6 : p1MinX + 1.4) : -11.3;
    const gxBridgeMin = track2X + 1.85;
    const jpo2MaxX = arch.hasGardenTerrace ? (gxBridgeMin + 4.8) : (isIsland ? (isCawang ? i2MaxX + 0.6 : p1MaxX + 0.2) : p1MaxX + 0.2);
    const jpo2CX = hasJpo2 ? (jpo2MinX + jpo2MaxX) * 0.5 : null;
    const jpo2NearZ = hasJpo2 ? (jpo2Z > 0 ? jpo2Z - jpo2Depth * 0.5 : jpo2Z + jpo2Depth * 0.5) : null;
    const jpo2FarZ = hasJpo2 ? (jpo2Z > 0 ? jpo2Z + jpo2Depth * 0.5 : jpo2Z - jpo2Depth * 0.5) : null;
    const j2StairFootZ = hasJpo2 ? (jpo2Z > 0 ? jpo2NearZ - 9.5 : jpo2NearZ + 9.5) : null;

    if (!isIsland) ensureStairZone(cStairX, cStairFootZ, cStairTopZ);
    ensureStairZone(stairX, stairFootZ, stairTopZ);
    if (!isIsland) {
      ensureStairZone(-9.4, stairFootZ, stairTopZ);
    } else {
      const jExitDirPre = jpoZ >= 0 ? -1 : 1;
      const jExitBotZPre = jpoNearZ + jExitDirPre * 11.5;
      ensureStairZone(jpoSpanMinX + 1.7, jExitBotZPre, jpoNearZ);
      ensureStairZone(jpoSpanMaxX - 1.7, jExitBotZPre, jpoNearZ);
      if (isCawang) ensureStairZone(i2MinX + 4.6, jpoFarZ + 10.5, jpoFarZ);
    }
    if (hasJpo2) {
      ensureStairZone(stairX, j2StairFootZ, jpo2NearZ);
      if (!isIsland) ensureStairZone(-9.4, j2StairFootZ, jpo2NearZ);
      else if (isCawang) ensureStairZone(i2MinX + 4.6, j2StairFootZ, jpo2NearZ);
      if (arch.hasGardenTerrace) ensureStairZone(gxBridgeMin + 1.4, j2StairFootZ, jpo2NearZ);
    }
    if (arch.hasDepotShed) {
      const depZ0Pre = 36.0;
      const craneNearZPre = 52.0 - 5.0 * 0.5;
      const depEastMinXPre = track2X + 1.60;
      const eastStairXPre = depEastMinXPre + 2.2;
      const wcCXPre = (-6.0 - 1.85) * 0.5;
      ensureStairZone(p1MinX + 4.8, craneNearZPre - 9.5, craneNearZPre);
      ensureStairZone(-4.0, craneNearZPre - 9.5, craneNearZPre);
      ensureStairZone(eastStairXPre, craneNearZPre - 9.5, craneNearZPre);
      ensureStairZone((depEastMinXPre + depotMaxX) * 0.5, depZ0Pre - 2.6, depZ0Pre);
      ensureStairZone(wcCXPre, depZ0Pre - 2.6, depZ0Pre);
      ensureStairZone(depotMaxX + 1.35, 41.5, 44.5);
    }

    if (!isIsland) {
      const cz = concMidZ;
      const cx = (concMinX + concMaxX) * 0.5;
      // Grounded concourse concrete substructure (-1.16 .. -0.04) + checker tile (-0.04 .. 0.0)
      addBox(bConcrete, cw, 1.12, concLen, cx, -0.60, cz, 0, 0, 0, cw * 0.4, concLen * 0.25);
      addBox(bChecker, cw, 0.04, concLen, cx, -0.02, cz, 0, 0, 0, cw / 2.4, concLen / 2.4);
      station._addCollider(concMinX, -1.18, concMinZ, concMaxX, 0.0, concMaxZ, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

      // OPEN 10m EAST CONCOURSE PORTAL (z in [concMidZ - 5.0 .. concMidZ + 5.0]) + Grand Stairs + ADA Ramp!
      const portalZ0 = concMidZ - 5.0;
      const portalZ1 = concMidZ + 5.0;
      const sWallLen = Math.max(0.5, portalZ0 - concMinZ);
      const nWallLen = Math.max(0.5, concMaxZ - portalZ1);
      addBox(bConcrete, 0.4, 7.10, sWallLen, concMaxX - 0.2, 3.55, concMinZ + sWallLen * 0.5, 0, 0, 0, 4, 2.5);
      addBox(bConcrete, 0.4, 7.10, nWallLen, concMaxX - 0.2, 3.55, portalZ1 + nWallLen * 0.5, 0, 0, 0, 4, 2.5);
      // Header lintel above 4.25m portal (keeps 0..4.25m doorway completely wide open!)
      addBox(bConcrete, 0.45, 2.85, 10.0, concMaxX - 0.2, 5.68, concMidZ, 0, 0, 0, 3, 1.0);
      // Exterior architectural articulation (pilasters, base plinth, dark steel belly/cornice bands, louver bays & portal banner)
      addBox(bConcreteRough, 0.16, 1.15, sWallLen, concMaxX + 0.04, 0.15, concMinZ + sWallLen * 0.5, 0, 0, 0, sWallLen * 0.2, 0.5);
      addBox(bConcreteRough, 0.16, 1.15, nWallLen, concMaxX + 0.04, 0.15, portalZ1 + nWallLen * 0.5, 0, 0, 0, nWallLen * 0.2, 0.5);
      addBox(bSteelDark, 0.14, 0.22, concLen + 0.2, concMaxX + 0.05, 3.15, concMidZ);
      addBox(bSteelDark, 0.22, 0.36, concLen + 0.3, concMaxX + 0.06, 6.95, concMidZ);
      for (const [wStart, wEnd] of [[concMinZ + 0.6, portalZ0 - 0.6], [portalZ1 + 0.6, concMaxZ - 0.6]]) {
        const span = wEnd - wStart;
        if (span <= 1.2) continue;
        const bays = Math.max(1, Math.round(span / 6.5));
        const step = span / bays;
        for (let bi = 0; bi <= bays; bi++) {
          const pz = wStart + bi * step;
          addBox(bConcreteRough, 0.28, 7.20, 0.48, concMaxX + 0.08, 3.55, pz, 0, 0, 0, 0.5, 2.5);
        }
        for (let bi = 0; bi < bays; bi++) {
          const bayMidZ = wStart + (bi + 0.5) * step;
          const bayLen = Math.max(0.8, step - 0.85);
          addBox(bSteelDark, 0.10, 1.45, bayLen, concMaxX + 0.03, 5.15, bayMidZ);
          for (const slY of [4.65, 5.00, 5.35, 5.70]) {
            addBox(bTruss, 0.14, 0.06, bayLen - 0.12, concMaxX + 0.06, slY, bayMidZ);
          }
        }
      }
      addAtlasQuad(bBanner, 8.2, 1.05, concMaxX + 0.125, 5.45, concMidZ, 0, Math.PI * 0.5, 0, [0, 0, 1, 1]);
      addBox(bSteelDark, 0.12, 1.18, 8.45, concMaxX + 0.05, 5.45, concMidZ);
      station._addCollider(concMaxX - 0.4, 0, concMinZ, concMaxX, 7.1, portalZ0, 'concrete');
      station._addCollider(concMaxX - 0.4, 0, portalZ1, concMaxX, 7.1, concMaxZ, 'concrete');
      station._addCollider(concMaxX - 0.45, UPPER_FLOOR_Y, portalZ0, concMaxX, 7.1, portalZ1, 'concrete');

      // Arched Entrance Marquee Canopy over East Concourse Portal
      const marqShape = new THREE.Shape();
      marqShape.moveTo(0, 0);
      marqShape.quadraticCurveTo(2.4, 1.05, 4.8, 0.10);
      marqShape.lineTo(4.8, -0.14);
      marqShape.quadraticCurveTo(2.4, 0.80, 0, -0.22);
      marqShape.closePath();
      const marqGeo = new THREE.ExtrudeGeometry(marqShape, { depth: 11.4, bevelEnabled: false, curveSegments: 8 });
      marqGeo.translate(concMaxX - 0.1, 4.15, concMidZ - 5.7);
      bRoof.push(prepGeo(marqGeo, false));
      const marqColX = concMaxX + 4.65;
      for (const mz of [concMidZ - 5.5, concMidZ + 5.5]) {
        if (!isInStairExclusion(marqColX, mz, 0.25, 0.25)) {
          addCylinder(bTruss, 0.11, 0.14, 5.0, 8, marqColX, 1.75, mz);
          recordStructuralCol(marqColX, mz, SIDEWALK_Y, 4.25, 'marquee_col');
        }
      }

      // Monumental East Concourse Stairs (5.2m wide) + Sloped 1:6 ADA Ramp (3.2m wide) down to -0.82 sidewalk!
      buildGroundedTransition(concMaxX + 1.7, concMidZ - 2.1, 5.2, 3.4, 0.0, SIDEWALK_Y, 'x', true, true);
      buildGroundedTransition(concMaxX + 2.4, concMidZ + 2.6, 3.2, 4.8, 0.0, SIDEWALK_Y, 'x', true, false);

      // At-Grade TransJakarta Feeder Halte Plaza (right on the East Promenade at y = -0.82!)
      if (arch.hasFeederSkywalk) {
        const haltZ = concMidZ >= 0 ? concMinZ + 7.5 : concMaxZ - 7.5;
        const hxMin = concMaxX + 3.2;
        const hxMax = concMaxX + 6.4;
        const hCX = (hxMin + hxMax) * 0.5;
        addBox(bConcrete, 3.2, 0.24, 12.0, hCX, SIDEWALK_Y + 0.12, haltZ);
        addBox(bTactile, 0.45, 0.015, 11.4, hxMax - 0.45, SIDEWALK_Y + 0.25, haltZ);
        addBox(bJpo, 3.6, 0.20, 12.6, hCX, SIDEWALK_Y + 3.15, haltZ, 0, 0, 0, 2, 4);
        for (const hpz of [haltZ - 5.2, haltZ, haltZ + 5.2]) {
          if (!isInStairExclusion(hxMin + 0.35, hpz, 0.9, 0.9)) {
            addCylinder(bSteelDark, 0.10, 0.12, 3.1, 8, hxMin + 0.35, SIDEWALK_Y + 1.55, hpz);
            recordStructuralCol(hxMin + 0.35, hpz, SIDEWALK_Y, SIDEWALK_Y + 3.10, 'feeder_col');
          }
        }
        // Realistic TransJakarta Security Tactical Locker Cabinet (dual steel doors, louver grille, keypad & blue header)
        const lkBaseY = SIDEWALK_Y + 0.24;
        const lkXPos = hxMin + 0.85;
        addBox(bSteelDark, 0.58, 0.12, 1.12, lkXPos, lkBaseY + 0.06, haltZ);
        addBox(bSteelDark, 0.52, 1.58, 1.06, lkXPos, lkBaseY + 0.91, haltZ);
        for (const dz of [-0.25, 0.25]) {
          addAtlasBox(bStall, 0.05, 1.24, 0.44, lkXPos + 0.26, lkBaseY + 0.88, haltZ + dz, 0, null, STALL_UV.rotioCreamSolid);
          addBox(bTruss, 0.06, 0.14, 0.05, lkXPos + 0.28, lkBaseY + 0.88, haltZ + dz + (dz < 0 ? 0.14 : -0.14));
        }
        addBox(bTactile, 0.54, 0.06, 1.08, lkXPos, lkBaseY + 1.50, haltZ);
        addBox(bTruss, 0.54, 0.14, 1.06, lkXPos, lkBaseY + 1.60, haltZ);
        addAtlasBox(bStall, 0.06, 0.18, 0.12, lkXPos + 0.27, lkBaseY + 1.12, haltZ - 0.06, 0, null, STALL_UV.turnstilePurple);
        addBox(bTruss, 0.60, 0.08, 1.14, lkXPos, lkBaseY + 1.72, haltZ);
        station._addCollider(lkXPos - 0.34, SIDEWALK_Y, haltZ - 0.60, lkXPos + 0.34, lkBaseY + 1.82, haltZ + 0.60, 'metal');
        const fdrUsed = station._usedIds.has('feeder_supply');
        station.interactables.push({
          id: 'feeder_supply', type: 'balcony_supply', x: hxMin + 1.6, y: SIDEWALK_Y + 1.1, z: haltZ,
          label: fdrUsed ? '[E] Loker Pos Halte TransJakarta (Sudah Diambil)' : '[E] Loker Pos Halte TransJakarta (+Amunisi & +25 HP)',
          prompt: fdrUsed ? '[E] Loker Pos Halte TransJakarta (Sudah Diambil)' : '[E] Loker Pos Halte TransJakarta (+Amunisi & +25 HP)',
          used: fdrUsed
        });
      }

      // Concourse end walls (0..4.25)
      addBox(bConcrete, cw, 4.25, 0.4, cx, 2.125, concMinZ + 0.2, 0, 0, 0, 5, 1.5);
      addBox(bConcrete, cw, 4.25, 0.4, cx, 2.125, concMaxZ - 0.2, 0, 0, 0, 5, 1.5);

      const skyEdgeZ = jpoZ > 0 ? concMaxZ : concMinZ;
      const oppEdgeZ = jpoZ > 0 ? concMinZ : concMaxZ;
      const oppInsetZ = jpoZ > 0 ? concMinZ + 0.16 : concMaxZ - 0.16;
      const skyInsetZ = jpoZ > 0 ? concMaxZ - 0.16 : concMinZ + 0.16;

      station._addCollider(concMinX, 0, oppEdgeZ - 0.35, concMaxX, 5.5, oppEdgeZ + 0.35, 'concrete');
      station._addCollider(concMinX, 0, skyEdgeZ - 0.35, concMaxX, 4.20, skyEdgeZ + 0.35, 'concrete');
      addBox(bJpo, cw, 1.05, 0.24, cx, UPPER_FLOOR_Y + 0.525, oppInsetZ, 0, 0, 0, 5, 1);

      // Parapet glass on 2nd-floor Balcony West edge
      station._addCollider(concMinX, UPPER_FLOOR_Y, concMinZ, concMinX + 0.22, UPPER_FLOOR_Y + 1.15, concMaxZ, 'metal');
      addBox(bConcrete, 0.20, 0.22, concLen, concMinX + 0.10, UPPER_FLOOR_Y + 0.11, cz);
      addBox(bSteelDark, 0.12, 0.08, concLen, concMinX + 0.10, UPPER_FLOOR_Y + 1.12, cz);
      for (let bgz = concMinZ + 3.4; bgz <= concMaxZ - 3.4; bgz += 6.8) {
        const cid = station._addCollider(concMinX - 0.05, UPPER_FLOOR_Y + 0.22, bgz - 3.2, concMinX + 0.18, UPPER_FLOOR_Y + 1.10, bgz + 3.2, 'glass', { blocksWalk: false });
        glassRecords.push({
          cx: concMinX + 0.10, cy: UPPER_FLOOR_Y + 0.66, cz: bgz, w: 6.4, h: 0.84, d: 0.04,
          ry: Math.PI * 0.5, hp: 22, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cid
        });
        addBox(bSteelDark, 0.12, 0.90, 0.12, concMinX + 0.10, UPPER_FLOOR_Y + 0.67, bgz - 3.3);
      }
      addBox(bSteelDark, 0.12, 0.90, 0.12, concMinX + 0.10, UPPER_FLOOR_Y + 0.67, concMaxZ - 0.12);

      // Interior Grand Staircase to 2nd Floor Balcony
      const cStairMinZ = Math.min(cStairFootZ, cStairTopZ);
      const cStairMaxZ = Math.max(cStairFootZ, cStairTopZ);

      const mainBalcW = stairWellMinX - concMinX;
      const mainBalcCX = concMinX + mainBalcW * 0.5;
      addBox(bConcrete, mainBalcW, 0.26, concLen, mainBalcCX, UPPER_FLOOR_Y - 0.15, cz, 0, 0, 0, mainBalcW * 0.35, concLen * 0.25);
      addBox(bTerrazzo, mainBalcW, 0.04, concLen, mainBalcCX, UPPER_FLOOR_Y - 0.02, cz, 0, 0, 0, mainBalcW / 2.4, concLen / 2.4);
      station._addCollider(concMinX, UPPER_FLOOR_Y - 0.28, concMinZ, stairWellMinX, UPPER_FLOOR_Y, concMaxZ, 'floor', { isFloor: true });

      const southPatchLen = Math.max(2.0, cStairMinZ - concMinZ);
      addBox(bConcrete, 3.6, 0.26, southPatchLen, stairWellMinX + 1.8, UPPER_FLOOR_Y - 0.15, concMinZ + southPatchLen * 0.5);
      addBox(bTerrazzo, 3.6, 0.04, southPatchLen, stairWellMinX + 1.8, UPPER_FLOOR_Y - 0.02, concMinZ + southPatchLen * 0.5);
      station._addCollider(stairWellMinX, UPPER_FLOOR_Y - 0.28, concMinZ, concMaxX, UPPER_FLOOR_Y, cStairMinZ, 'floor', { isFloor: true });

      const northPatchLen = Math.max(2.0, concMaxZ - cStairMaxZ);
      addBox(bConcrete, 3.6, 0.26, northPatchLen, stairWellMinX + 1.8, UPPER_FLOOR_Y - 0.15, cStairMaxZ + northPatchLen * 0.5);
      addBox(bTerrazzo, 3.6, 0.04, northPatchLen, stairWellMinX + 1.8, UPPER_FLOOR_Y - 0.02, cStairMaxZ + northPatchLen * 0.5);
      station._addCollider(stairWellMinX, UPPER_FLOOR_Y - 0.28, cStairMaxZ, concMaxX, UPPER_FLOOR_Y, concMaxZ, 'floor', { isFloor: true });

      const wellLen = cStairMaxZ - cStairMinZ;
      const wellMidZ = (cStairMinZ + cStairMaxZ) * 0.5;
      addBox(bTruss, 0.07, 0.07, wellLen, stairWellMinX - 0.06, UPPER_FLOOR_Y + 0.92, wellMidZ);
      addBox(bTruss, 0.04, 0.04, wellLen, stairWellMinX - 0.06, UPPER_FLOOR_Y + 0.48, wellMidZ);
      for (let wpz = cStairMinZ; wpz <= cStairMaxZ + 0.05; wpz += 2.5) {
        addBox(bTruss, 0.06, 0.94, 0.06, stairWellMinX - 0.06, UPPER_FLOOR_Y + 0.47, Math.min(cStairMaxZ, wpz));
      }
      station._addCollider(stairWellMinX - 0.12, UPPER_FLOOR_Y, cStairMinZ, stairWellMinX + 0.04, UPPER_FLOOR_Y + 1.15, cStairMaxZ, 'metal');

      const footEndW = (concMaxX - 0.4) - stairWellMinX;
      const footEndCX = stairWellMinX + footEndW * 0.5;
      addBox(bTruss, footEndW, 0.07, 0.07, footEndCX, UPPER_FLOOR_Y + 0.92, cStairFootZ);
      addBox(bTruss, footEndW, 0.04, 0.04, footEndCX, UPPER_FLOOR_Y + 0.48, cStairFootZ);
      addBox(bTruss, 0.06, 0.94, 0.06, footEndCX, UPPER_FLOOR_Y + 0.47, cStairFootZ);
      station._addCollider(stairWellMinX, UPPER_FLOOR_Y, cStairFootZ - 0.08, concMaxX - 0.4, UPPER_FLOOR_Y + 1.15, cStairFootZ + 0.08, 'metal');

      buildStairRamp(cStairX, cStairFootZ, cStairTopZ, UPPER_FLOOR_Y, 0.0);

      // Beveled Concourse Columns supporting Balcony
      const balcColZs = [concMinZ + 1.5, concMidZ + 4.0, concMaxZ - 1.5];
      const balcColX = concMinX + 0.35;
      for (let bc = 0; bc < balcColZs.length; bc++) {
        let bz = balcColZs[bc];
        if (isInStairExclusion(balcColX, bz, 0.9, 0.9)) {
          const candZ = bz < concMidZ ? (concMidZ - 7.5) : (concMidZ + 8.5);
          if (candZ >= concMinZ + 1.5 && candZ <= concMaxZ - 1.5 && !isInStairExclusion(balcColX, candZ, 0.9, 0.9)) {
            bz = candZ;
          } else {
            continue;
          }
        }
        addBox(bConcrete, 0.62, 0.32, 0.62, balcColX, 0.16, bz); // Beveled plinth base
        addBox(bConcrete, 0.46, UPPER_FLOOR_Y - 0.56, 0.46, balcColX, (UPPER_FLOOR_Y - 0.28) * 0.5 + 0.14, bz);
        recordStructuralCol(balcColX, bz, 0.0, UPPER_FLOOR_Y - 0.28, 'balcony_col');
        station._addCollider(concMinX + 0.10, 0, bz - 0.25, concMinX + 0.60, UPPER_FLOOR_Y, bz + 0.25, 'concrete');
      }

      const eastRoofMinX = canopyMaxX - 0.25;
      const eastRoofW = concMaxX - eastRoofMinX;
      if (eastRoofW > 0.4) {
        const eastRoofCX = eastRoofMinX + eastRoofW * 0.5;
        const eastRoofColX = eastRoofMinX + 0.12;
        addBox(bConcrete, eastRoofW, 0.22, concLen, eastRoofCX, eaveY - 0.02, cz, 0, 0, 0, 2, concLen * 0.25);
        for (let rz = concMinZ + 2; rz <= concMaxZ - 2; rz += 15) {
          let useRz = rz;
          if (isInStairExclusion(eastRoofColX, useRz, 0.9, 0.9)) {
            const altRz = useRz < concMidZ ? (cStairMinZ - 3.6) : (cStairMaxZ + 3.6);
            if (altRz >= concMinZ + 1.2 && altRz <= concMaxZ - 1.2 && !isInStairExclusion(eastRoofColX, altRz, 0.9, 0.9)) {
              useRz = altRz;
            } else {
              continue;
            }
          }
          addCylinder(bTruss, 0.12, 0.12, eaveY - UPPER_FLOOR_Y + 0.05, 6, eastRoofColX, (UPPER_FLOOR_Y + eaveY) * 0.5, useRz);
          recordStructuralCol(eastRoofColX, useRz, UPPER_FLOOR_Y, eaveY, 'east_roof_col');
          station._addCollider(eastRoofMinX, UPPER_FLOOR_Y, useRz - 0.15, eastRoofMinX + 0.25, eaveY, useRz + 0.15, 'metal');
        }
      }

      // 2nd Floor Skywalk Connector from Concourse Balcony edge to JPO Bridge (grounded piers to y = -1.00!)
      const swZ0 = Math.min(skyEdgeZ, jpoNearZ);
      const swZ1 = Math.max(skyEdgeZ, jpoNearZ);
      if (swZ1 > swZ0 + 0.5) {
        const swLen = swZ1 - swZ0;
        const swMidZ = (swZ0 + swZ1) * 0.5;
        addBox(bConcrete, swW, 0.26, swLen, swX, UPPER_FLOOR_Y - 0.15, swMidZ, 0, 0, 0, 1.5, swLen * 0.25);
        addBox(bConcrete, swW - 0.3, 0.42, swLen, swX, UPPER_FLOOR_Y - 0.49, swMidZ, 0, 0, 0, 1.5, swLen * 0.25);
        addBox(bTerrazzo, swW, 0.04, swLen, swX, UPPER_FLOOR_Y - 0.02, swMidZ, 0, 0, 0, 1.5, swLen / 2.4);
        station._addCollider(swMinX, UPPER_FLOOR_Y - 0.28, swZ0, swMaxX, UPPER_FLOOR_Y, swZ1, 'floor', { isFloor: true });
        addBox(bJpo, 0.16, 0.55, swLen, swMinX + 0.08, UPPER_FLOOR_Y + 0.275, swMidZ);
        addBox(bJpo, 0.16, 0.55, swLen, swMaxX - 0.08, UPPER_FLOOR_Y + 0.275, swMidZ);
        addBox(bSteelDark, 0.10, 0.06, swLen, swMinX + 0.08, UPPER_FLOOR_Y + 1.08, swMidZ);
        addBox(bSteelDark, 0.10, 0.06, swLen, swMaxX - 0.08, UPPER_FLOOR_Y + 1.08, swMidZ);
        station._addCollider(swMinX - 0.04, UPPER_FLOOR_Y, swZ0, swMinX + 0.18, UPPER_FLOOR_Y + 1.15, swZ1, 'metal');
        station._addCollider(swMaxX - 0.18, UPPER_FLOOR_Y, swZ0, swMaxX + 0.04, UPPER_FLOOR_Y + 1.15, swZ1, 'metal');

        const pierCount = Math.max(2, Math.round(swLen / 8.0) + 1);
        const colH = UPPER_FLOOR_Y - 0.5 - STREET_GROUND_Y;
        const colCY = (UPPER_FLOOR_Y - 0.5 + STREET_GROUND_Y) * 0.5;
        for (let pi = 0; pi < pierCount; pi++) {
          const pFrac = pierCount === 1 ? 0.5 : pi / (pierCount - 1);
          const pz = swZ0 + 0.6 + (swLen - 1.2) * pFrac;
          const swPierW = swMinX + 0.45;
          const swPierE = swMaxX - 0.35;
          if (!isInStairExclusion(swPierW, pz, 0.05, 0.05)) {
            addBox(bConcrete, 0.55, colH, 0.55, swPierW, colCY, pz);
            recordStructuralCol(swPierW, pz, STREET_GROUND_Y, UPPER_FLOOR_Y - 0.5, 'skywalk_pier');
          }
          if (!isInStairExclusion(swPierE, pz, 0.05, 0.05)) {
            addBox(bConcrete, 0.55, colH, 0.55, swPierE, colCY, pz);
            recordStructuralCol(swPierE, pz, STREET_GROUND_Y, UPPER_FLOOR_Y - 0.5, 'skywalk_pier');
          }
          addBox(bConcrete, swW + 0.2, 0.55, 0.75, swX, UPPER_FLOOR_Y - 0.55, pz);
        }
      }

      if (swMinX > concMinX + 0.15) {
        const wGap = swMinX - concMinX;
        addBox(bJpo, wGap, 1.05, 0.24, concMinX + wGap * 0.5, UPPER_FLOOR_Y + 0.525, skyInsetZ);
        station._addCollider(concMinX, UPPER_FLOOR_Y, skyEdgeZ - 0.25, swMinX, UPPER_FLOOR_Y + 1.2, skyEdgeZ + 0.25, 'concrete');
      }
      if (concMaxX > swMaxX + 0.15) {
        const eGap = concMaxX - swMaxX;
        addBox(bJpo, eGap, 1.05, 0.24, swMaxX + eGap * 0.5, UPPER_FLOOR_Y + 0.525, skyInsetZ);
        station._addCollider(swMaxX, UPPER_FLOOR_Y, skyEdgeZ - 0.25, concMaxX, UPPER_FLOOR_Y + 1.2, skyEdgeZ + 0.25, 'concrete');
      }

      // Platform 1 outer windscreen outside concourse opening
      if (concMinZ > platMinZ + 1) {
        const sLen = concMinZ - platMinZ;
        addBox(bConcrete, 0.35, 1.25, sLen, p1MaxX - 0.18, 0.62, (platMinZ + concMinZ) * 0.5);
        station._addCollider(p1MaxX - 0.35, 0, platMinZ, p1MaxX, 2.6, concMinZ, 'concrete');
        for (let lz = platMinZ + 3; lz < concMinZ - 2; lz += 6.0) {
          addBox(bSteelDark, 0.14, 1.65, 5.2, p1MaxX - 0.18, 2.04, lz);
        }
      }
      if (platMaxZ > concMaxZ + 1) {
        const nLen = platMaxZ - concMaxZ;
        addBox(bConcrete, 0.35, 1.25, nLen, p1MaxX - 0.18, 0.62, (concMaxZ + platMaxZ) * 0.5);
        station._addCollider(p1MaxX - 0.35, 0, concMaxZ, p1MaxX, 2.6, platMaxZ, 'concrete');
        for (let lz = concMaxZ + 3; lz < platMaxZ - 2; lz += 6.0) {
          addBox(bSteelDark, 0.14, 1.65, 5.2, p1MaxX - 0.18, 2.04, lz);
        }
      }
    }

    // Overhead JPO Skybridge Helper (grounded piers to y = -1.00, split downstand beams clear of Track 1 HVAC!)
    const jpoPergolaY = 6.95;
    const buildJpoEdgeParapet = (wallMat, spanMin, spanMax, edgeZ, openings, hasGlass) => {
      openings.sort((a, b) => a[0] - b[0]);
      const segsList = [];
      let cur = spanMin;
      for (let oi = 0; oi < openings.length; oi++) {
        const o0 = Math.max(spanMin, openings[oi][0]);
        const o1 = Math.min(spanMax, openings[oi][1]);
        if (o0 > cur + 0.15) segsList.push([cur, o0]);
        cur = Math.max(cur, o1);
      }
      if (spanMax > cur + 0.15) segsList.push([cur, spanMax]);
      for (let si = 0; si < segsList.length; si++) {
        const s0 = segsList[si][0];
        const s1 = segsList[si][1];
        const segW = s1 - s0;
        const segCX = (s0 + s1) * 0.5;
        addBox(wallMat, segW, 0.55, 0.20, segCX, UPPER_FLOOR_Y + 0.275, edgeZ, 0, 0, 0, segW * 0.2, 1);
        addBox(bSteelDark, segW, 0.06, 0.10, segCX, UPPER_FLOOR_Y + 1.12, edgeZ);
        addBox(bSteelDark, 0.10, 0.58, 0.10, s0 + 0.06, UPPER_FLOOR_Y + 0.82, edgeZ);
        addBox(bSteelDark, 0.10, 0.58, 0.10, s1 - 0.06, UPPER_FLOOR_Y + 0.82, edgeZ);
        station._addCollider(s0, UPPER_FLOOR_Y, edgeZ - 0.18, s1, UPPER_FLOOR_Y + 1.25, edgeZ + 0.18, 'metal');
        if (hasGlass) {
          for (let gx = s0 + 2.5; gx <= s1 - 2.0; gx += 5.0) {
            const panelW = Math.min(4.4, s1 - gx + 2.2);
            if (panelW < 1.0) continue;
            addBox(bSteelDark, 0.10, 0.58, 0.10, gx - panelW * 0.5, UPPER_FLOOR_Y + 0.82, edgeZ);
            const cgJpo = station._addCollider(gx - panelW * 0.5, UPPER_FLOOR_Y + 0.55, edgeZ - 0.12, gx + panelW * 0.5, UPPER_FLOOR_Y + 1.18, edgeZ + 0.12, 'glass', { blocksWalk: false });
            glassRecords.push({
              cx: gx, cy: UPPER_FLOOR_Y + 0.84, cz: edgeZ, w: panelW - 0.12, h: 0.54, d: 0.04,
              ry: 0, hp: 20, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cgJpo
            });
          }
        }
      }
    };

    const buildJpoBridgeSpan = (jz, depth, spanMinX, spanMaxX, nearZ, farZ, nearOps, farOps, pierXs) => {
      const w = spanMaxX - spanMinX;
      const cx = (spanMinX + spanMaxX) * 0.5;
      addBox(bConcrete, w, 0.28, depth, cx, UPPER_FLOOR_Y - 0.16, jz, 0, 0, 0, w * 0.3, 2);
      const beamSortedTracks = trackXs.slice().sort((a, b) => a - b);
      let bCursor = spanMinX;
      for (let tki = 0; tki < beamSortedTracks.length; tki++) {
        const tCut0 = beamSortedTracks[tki] - 1.75;
        const tCut1 = beamSortedTracks[tki] + 1.75;
        if (tCut0 > bCursor + 0.4) {
          const bw = Math.min(spanMaxX, tCut0) - bCursor;
          if (bw > 0.4) {
            const bcx = bCursor + bw * 0.5;
            addBox(bConcrete, bw, 0.42, 0.45, bcx, UPPER_FLOOR_Y - 0.48, nearZ + (farZ > nearZ ? 0.25 : -0.25));
            addBox(bConcrete, bw, 0.42, 0.45, bcx, UPPER_FLOOR_Y - 0.48, farZ + (farZ > nearZ ? -0.25 : 0.25));
          }
        }
        bCursor = Math.max(bCursor, tCut1);
      }
      if (spanMaxX > bCursor + 0.4) {
        const bw = spanMaxX - bCursor;
        const bcx = bCursor + bw * 0.5;
        addBox(bConcrete, bw, 0.42, 0.45, bcx, UPPER_FLOOR_Y - 0.48, nearZ + (farZ > nearZ ? 0.25 : -0.25));
        addBox(bConcrete, bw, 0.42, 0.45, bcx, UPPER_FLOOR_Y - 0.48, farZ + (farZ > nearZ ? -0.25 : 0.25));
      }
      addBox(bTerrazzo, w, 0.04, depth, cx, UPPER_FLOOR_Y - 0.02, jz, 0, 0, 0, w / 2.4, depth / 2.4);
      station._addCollider(spanMinX, UPPER_FLOOR_Y - 0.28, jz - depth * 0.5, spanMaxX, UPPER_FLOOR_Y, jz + depth * 0.5, 'floor', { isFloor: true });

      // Grounded concrete columns (streetGroundY = -1.00 .. upperFloorY - 0.30) with beveled plinth bases
      const jColH = UPPER_FLOOR_Y - 0.30 - STREET_GROUND_Y;
      const jColCY = (UPPER_FLOOR_Y - 0.30 + STREET_GROUND_Y) * 0.5;
      for (let jp = 0; jp < pierXs.length; jp++) {
        const jpx = pierXs[jp];
        const nearStairX = stairZones.some((s) => s.sx !== undefined && Math.abs(jpx - s.sx) < 2.8);
        const shaftW = nearStairX ? 0.46 : 0.64;
        const plinthW = nearStairX ? 0.55 : 0.88;
        const collHalf = nearStairX ? 0.275 : 0.36;
        const pzA = jz - depth * 0.5 + 0.45;
        const pzB = jz + depth * 0.5 - 0.45;
        addBox(bConcrete, shaftW, jColH, shaftW, jpx, jColCY, pzA, 0, 0, 0, 1, 3);
        addBox(bConcrete, shaftW, jColH, shaftW, jpx, jColCY, pzB, 0, 0, 0, 1, 3);
        addBox(bConcrete, plinthW, 0.32, plinthW, jpx, STREET_GROUND_Y + 0.16, pzA);
        addBox(bConcrete, plinthW, 0.32, plinthW, jpx, STREET_GROUND_Y + 0.16, pzB);
        addBox(bConcrete, Math.max(shaftW + 0.18, 0.72), 0.55, depth, jpx, UPPER_FLOOR_Y - 0.55, jz);
        recordStructuralCol(jpx, pzA, STREET_GROUND_Y, UPPER_FLOOR_Y - 0.30, 'jpo_pier');
        recordStructuralCol(jpx, pzB, STREET_GROUND_Y, UPPER_FLOOR_Y - 0.30, 'jpo_pier');
        station._addCollider(jpx - collHalf, STREET_GROUND_Y, pzA - collHalf, jpx + collHalf, UPPER_FLOOR_Y, pzA + collHalf, 'concrete');
        station._addCollider(jpx - collHalf, STREET_GROUND_Y, pzB - collHalf, jpx + collHalf, UPPER_FLOOR_Y, pzB + collHalf, 'concrete');
      }

      const wallMat = isCawang ? bRoof : bJpo;
      const farSide = farZ + (farZ > nearZ ? -0.10 : 0.10);
      const nearSide = nearZ + (farZ > nearZ ? 0.10 : -0.10);
      buildJpoEdgeParapet(wallMat, spanMinX, spanMaxX, farSide, farOps, farOps.length === 0);
      buildJpoEdgeParapet(wallMat, spanMinX, spanMaxX, nearSide, nearOps, false);

      addBox(wallMat, 0.22, 0.55, depth, spanMinX + 0.11, UPPER_FLOOR_Y + 0.275, jz);
      addBox(bSteelDark, 0.10, 0.06, depth, spanMinX + 0.11, UPPER_FLOOR_Y + 1.12, jz);
      station._addCollider(spanMinX - 0.05, UPPER_FLOOR_Y, jz - depth * 0.5, spanMinX + 0.25, UPPER_FLOOR_Y + 1.25, jz + depth * 0.5, 'metal');
      addBox(wallMat, 0.22, 0.55, depth, spanMaxX - 0.11, UPPER_FLOOR_Y + 0.275, jz);
      addBox(bSteelDark, 0.10, 0.06, depth, spanMaxX - 0.11, UPPER_FLOOR_Y + 1.12, jz);
      station._addCollider(spanMaxX - 0.25, UPPER_FLOOR_Y, jz - depth * 0.5, spanMaxX + 0.05, UPPER_FLOOR_Y + 1.25, jz + depth * 0.5, 'metal');

      addBox(wallMat, w, 0.22, depth + 0.2, cx, jpoPergolaY, jz, 0, 0, 0, w * 0.2, 1);
      const pergColH = jpoPergolaY - UPPER_FLOOR_Y;
      const pergColCY = UPPER_FLOOR_Y + pergColH * 0.5;
      let lastPx = -1e9;
      const emitPergolaPost = (px, sideZ, ops) => {
        if (ops.some((o) => px >= o[0] - 0.35 && px <= o[1] + 0.35)) return;
        if (isInStairExclusion(px, sideZ, 0.9, 0.9)) return;
        addBox(bSteelDark, 0.24, pergColH, 0.24, px, pergColCY, sideZ);
        recordStructuralCol(px, sideZ, UPPER_FLOOR_Y, jpoPergolaY, 'jpo_pergola_col');
      };
      for (let px = spanMinX + 0.35; px <= spanMaxX - 0.25; px += 7.5) {
        emitPergolaPost(px, farSide, farOps);
        emitPergolaPost(px, nearSide, nearOps);
        lastPx = px;
      }
      if (Math.abs((spanMaxX - 0.35) - lastPx) > 1.2) {
        emitPergolaPost(spanMaxX - 0.35, farSide, farOps);
        emitPergolaPost(spanMaxX - 0.35, nearSide, nearOps);
      }
    };

    const addJpoWayfindingGantry = (sx, sy, sz, ryRot, uvRect, mountRoofY) => {
      const sw = 3.2, sh = 0.62, sd = 0.10;
      addBox(bSteelDark, sw + 0.08, sh + 0.06, sd, sx, sy, sz, 0, ryRot, 0);
      const rodOff = 1.20;
      const rCos = Math.cos(ryRot), rSin = Math.sin(ryRot);
      const rodBotY = sy + sh * 0.5;
      for (const sgn of [-1, 1]) {
        const rx = sx + sgn * rodOff * rCos;
        const rz = sz - sgn * rodOff * rSin;
        const roofY = mountRoofY !== undefined ? mountRoofY : (getCanopyArchY(rx) + 0.08);
        const rodLen = Math.max(0.20, roofY - rodBotY);
        addBox(bSteelDark, 0.04, rodLen, 0.04, rx, rodBotY + rodLen * 0.5, rz);
      }
      addAtlasQuad(bSign, sw, sh, sx + Math.sin(ryRot) * (sd * 0.5 + 0.01), sy, sz + Math.cos(ryRot) * (sd * 0.5 + 0.01), 0, ryRot, 0, uvRect);
      addAtlasQuad(bSign, sw, sh, sx - Math.sin(ryRot) * (sd * 0.5 + 0.01), sy, sz - Math.cos(ryRot) * (sd * 0.5 + 0.01), 0, ryRot + Math.PI, 0, uvRect);
    };

    const nearSideZ = jpoNearZ + (jpoFarZ > jpoNearZ ? 0.10 : -0.10);
    const nearOpenings = [[stairX - 1.18, stairX + 1.18]];
    const farOpenings = [];
    if (!isIsland) {
      nearOpenings.push([-9.4 - 1.18, -9.4 + 1.18]);
      nearOpenings.push([swMinX, swMaxX]);
    } else {
      // Open West & East JPO Street Exit Stairs descending straight onto the -0.82 Boulevard Sidewalks!
      nearOpenings.push([jpoSpanMinX + 0.5, jpoSpanMinX + 2.9]);
      nearOpenings.push([jpoSpanMaxX - 2.9, jpoSpanMaxX - 0.5]);
      if (isCawang) {
        farOpenings.push([i2MinX + 4.6 - 1.18, i2MinX + 4.6 + 1.18]);
      }
    }
    const primaryPiers = isIsland
      ? (isCawang ? [jpoSpanMinX + 0.24, p1MinX + 0.65, p1MaxX - 0.65, i2MinX + 0.65, jpoSpanMaxX - 0.24] : [jpoSpanMinX + 0.24, p1MinX + 0.65, p1MaxX - 0.65, jpoSpanMaxX - 0.24])
      : [p2MinX + 0.42, p1MaxX - 0.28, jpoSpanMaxX - 0.55];

    buildJpoBridgeSpan(jpoZ, jpoDepth, jpoSpanMinX, jpoSpanMaxX, jpoNearZ, jpoFarZ, nearOpenings, farOpenings, primaryPiers);

    // Island Station West & East JPO Boulevard Street Stairs (y = 4.25 -> -0.82 via street-side flights!)
    if (isIsland) {
      const jExitDir = jpoZ >= 0 ? -1 : 1;
      const jExitTopZ = jpoNearZ;
      const jExitBotZ = jpoNearZ + jExitDir * 11.5;
      buildStairRamp(jpoSpanMinX + 1.7, jExitBotZ, jExitTopZ, UPPER_FLOOR_Y, SIDEWALK_Y);
      buildStairRamp(jpoSpanMaxX - 1.7, jExitBotZ, jExitTopZ, UPPER_FLOOR_Y, SIDEWALK_Y);
    }

    const supX = isIsland ? jpoCX : (concMinX + 2.4);
    const supZ = isIsland ? jpoZ : concMidZ;
    buildTacticalSupplyCabinet(supX, UPPER_FLOOR_Y, supZ, 0, 'tactical');
    station._addCollider(supX - 0.56, UPPER_FLOOR_Y, supZ - 0.34, supX + 0.56, UPPER_FLOOR_Y + 1.05, supZ + 0.34, 'metal');
    const balUsed = station._usedIds.has('balcony_supply');
    station.interactables.push({
      id: 'balcony_supply', type: 'balcony_supply', x: supX, y: UPPER_FLOOR_Y + 1.0, z: supZ + 0.5,
      label: balUsed ? '[E] Loker Taktis Balkon Lantai 2 (Sudah Diambil)' : '[E] Loker Taktis Balkon Lantai 2 (+Amunisi & +25 HP)',
      prompt: balUsed ? '[E] Loker Taktis Balkon Lantai 2 (Sudah Diambil)' : '[E] Loker Taktis Balkon Lantai 2 (+Amunisi & +25 HP)',
      used: balUsed
    });

    if (arch.id === 'setiabudi') {
      const switchUsed = station._usedIds.has('setiabudi_jpo_switch');
      station.interactables.push({
        id: 'setiabudi_jpo_switch',
        type: 'relay',
        x: supX + 1.8,
        y: UPPER_FLOOR_Y + 1.0,
        z: supZ,
        label: switchUsed ? '[E] Sakelar Relai Sinyal Master JPO Setiabudi (Terhubung)' : '[E] Aktifkan Sakelar Relai Sinyal Master JPO Setiabudi',
        prompt: switchUsed ? '[E] Sakelar Relai Sinyal Master JPO Setiabudi (Terhubung)' : '[E] Aktifkan Sakelar Relai Sinyal Master JPO Setiabudi',
        used: switchUsed
      });
    }

    buildStairRamp(stairX, stairFootZ, stairTopZ, UPPER_FLOOR_Y, 0.0);
    if (!isIsland) {
      buildStairRamp(-9.4, stairFootZ, stairTopZ, UPPER_FLOOR_Y, 0.0);
    } else if (isCawang) {
      buildStairRamp(i2MinX + 4.6, jpoFarZ + 10.5, jpoFarZ, UPPER_FLOOR_Y, 0.0);
      // Overhead Station Directory & Wayfinding Board (replaces legacy duplicate Indomaret block on Cawang JPO)
      addJpoWayfindingGantry(i2MinX + 2.5, 6.42, 0.0, 0.0, SIGN_UV.jpoWayfinding, jpoPergolaY);
    }

    // 2nd-Floor JPO Stair-Head Wayfinding Gantries on JPO 1 across ALL stations
    {
      const jpoDirSign = jpoFarZ > jpoNearZ ? 1 : -1;
      const nearGantryZ = jpoNearZ + jpoDirSign * 0.65;
      if (isCawang) {
        addJpoWayfindingGantry(stairX, 6.42, jpoNearZ + 1.95, 0.0, SIGN_UV.jpoWayfinding, jpoPergolaY);
        addJpoWayfindingGantry(i2MinX + 4.6, 6.42, jpoFarZ - 1.95, 0.0, SIGN_UV.jpoWayfinding, jpoPergolaY);
        addJpoWayfindingGantry(jpoCX, 6.42, 0.0, Math.PI * 0.5, SIGN_UV.jpoWayfinding, jpoPergolaY);
      } else {
        addJpoWayfindingGantry(stairX, 6.42, nearGantryZ, 0.0, SIGN_UV.jpoWayfinding, jpoPergolaY);
        if (!isIsland) {
          addJpoWayfindingGantry(-9.4, 6.42, nearGantryZ, 0.0, SIGN_UV.peron2, jpoPergolaY);
          addJpoWayfindingGantry(jpoCX, 6.42, jpoZ, Math.PI * 0.5, SIGN_UV.jpoWayfinding, jpoPergolaY);
        } else {
          addJpoWayfindingGantry(jpoSpanMinX + 1.7, 6.42, nearGantryZ, 0.0, SIGN_UV.exitYellow, jpoPergolaY);
          addJpoWayfindingGantry(jpoSpanMaxX - 1.7, 6.42, nearGantryZ, 0.0, SIGN_UV.exitYellow, jpoPergolaY);
          addJpoWayfindingGantry(jpoCX, 6.42, jpoZ, Math.PI * 0.5, SIGN_UV.jpoWayfinding, jpoPergolaY);
        }
      }
    }

    // Secondary Opposite JPO Skybridge (360-degree multi-level loop!)
    if (hasJpo2) {
      const j2Ops = [[stairX - 1.18, stairX + 1.18]];
      if (!isIsland) j2Ops.push([-9.4 - 1.18, -9.4 + 1.18]);
      else if (isCawang) j2Ops.push([i2MinX + 4.6 - 1.18, i2MinX + 4.6 + 1.18]);
      if (arch.hasGardenTerrace) j2Ops.push([gxBridgeMin + 1.4 - 1.18, gxBridgeMin + 1.4 + 1.18]);

      const j2Piers = isCawang
        ? [jpo2MinX + 0.55, p1MinX + 0.65, p1MaxX - 0.65, i2MinX + 0.65, jpo2MaxX - 0.55]
        : (arch.hasGardenTerrace
          ? [jpo2MinX + 0.55, p1MaxX - 0.65, jpo2MaxX - 0.55]
          : (isIsland ? [jpo2MinX + 0.55, p1MaxX - 0.65] : [p2MinX + 0.42, p1MaxX - 0.28]));
      buildJpoBridgeSpan(jpo2Z, jpo2Depth, jpo2MinX, jpo2MaxX, jpo2NearZ, jpo2FarZ, j2Ops, [], j2Piers);

      buildStairRamp(stairX, j2StairFootZ, jpo2NearZ, UPPER_FLOOR_Y, 0.0);
      if (!isIsland) buildStairRamp(-9.4, j2StairFootZ, jpo2NearZ, UPPER_FLOOR_Y, 0.0);
      else if (isCawang) buildStairRamp(i2MinX + 4.6, j2StairFootZ, jpo2NearZ, UPPER_FLOOR_Y, 0.0);
      if (arch.hasGardenTerrace) buildStairRamp(gxBridgeMin + 1.4, j2StairFootZ, jpo2NearZ, UPPER_FLOOR_Y, 0.0);

      // 2nd-Floor JPO 2 Stair-Head Wayfinding Gantries
      const j2DirSign = jpo2Z > 0 ? 1 : -1;
      const j2GantryZ = jpo2NearZ + j2DirSign * 0.65;
      addJpoWayfindingGantry(stairX, 6.42, j2GantryZ, 0.0, SIGN_UV.jpoWayfinding, jpoPergolaY);
      if (!isIsland) {
        addJpoWayfindingGantry(-9.4, 6.42, j2GantryZ, 0.0, SIGN_UV.peron2, jpoPergolaY);
      } else if (isCawang) {
        addJpoWayfindingGantry(i2MinX + 4.6, 6.42, j2GantryZ, 0.0, SIGN_UV.jpoWayfinding, jpoPergolaY);
      }
      if (arch.hasGardenTerrace) {
        addJpoWayfindingGantry(gxBridgeMin + 1.4, 6.42, j2GantryZ, 0.0, SIGN_UV.jpoWayfinding, jpoPergolaY);
      }
      addJpoWayfindingGantry(jpo2CX + 1.6, 6.42, jpo2Z, Math.PI * 0.5, SIGN_UV.jpoWayfinding, jpoPergolaY);
    }

    // Harjamukti North Maintenance Depot Shed (grounded at y = -1.16 .. 0.0, keeps Track 1 & Track 2 100% open!)
    if (arch.hasDepotShed) {
      const depZ0 = 36.0;
      const depZ1 = platMaxZ - 2.0;
      const depLen = depZ1 - depZ0;
      const depMidZ = (depZ0 + depZ1) * 0.5;
      const depMinX = -6.0;
      const depMaxX = depotMaxX;
      const depEastMinX = track2X + 1.60;

      const bayW = depMaxX - depEastMinX;
      const bayCX = (depEastMinX + depMaxX) * 0.5;
      addBox(bConcrete, bayW, 1.12, depLen, bayCX, -0.60, depMidZ, 0, 0, 0, 3, depLen * 0.2);
      addBox(bChecker, bayW, 0.04, depLen, bayCX, -0.02, depMidZ, 0, 0, 0, bayW / 2.4, depLen / 2.4);
      station._addCollider(depEastMinX, -1.18, depZ0, depMaxX, 0.0, depZ1, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

      const wcW = 4.15;
      const wcCX = (depMinX - 1.85) * 0.5;
      addBox(bConcrete, wcW, 1.12, depLen, wcCX, -0.60, depMidZ);
      addBox(bChecker, wcW, 0.04, depLen, wcCX, -0.02, depMidZ);
      station._addCollider(depMinX, -1.18, depZ0, -1.85, 0.0, depZ1, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });
      addBox(bSteelDark, 0.14, 1.15, depLen, -1.92, 0.58, depMidZ);
      station._addCollider(-2.0, 0, depZ0, -1.82, 1.25, depZ1, 'metal');

      const craneZ = 52.0;
      const craneDepth = 5.0;
      const craneNearZ = craneZ - craneDepth * 0.5;
      const eastStairX = depEastMinX + 2.2;
      buildJpoBridgeSpan(craneZ, craneDepth, depMinX, depMaxX, craneNearZ, craneZ + craneDepth * 0.5,
        [[-4.0 - 1.18, -4.0 + 1.18], [p1MinX + 4.8 - 1.18, p1MinX + 4.8 + 1.18], [eastStairX - 1.18, eastStairX + 1.18]], [],
        [depMinX + 0.45, -2.2, p1MinX + 0.55, p1MaxX - 0.55, depEastMinX + 0.45, depMaxX - 0.45]);
      buildStairRamp(p1MinX + 4.8, craneNearZ - 9.5, craneNearZ, UPPER_FLOOR_Y, 0.0);
      buildStairRamp(-4.0, craneNearZ - 9.5, craneNearZ, UPPER_FLOOR_Y, 0.0);
      buildStairRamp(eastStairX, craneNearZ - 9.5, craneNearZ, UPPER_FLOOR_Y, 0.0);
      // Connect Depot East & West bays cleanly down to surrounding plaza (-0.82) + open East doorway
      buildStairRamp((depEastMinX + depMaxX) * 0.5, depZ0 - 2.6, depZ0, 0.0, SIDEWALK_Y);
      buildStairRamp(wcCX, depZ0 - 2.6, depZ0, 0.0, SIDEWALK_Y);
      buildStairRamp(depMaxX + 1.35, 41.5, 44.5, 0.0, SIDEWALK_Y);

      const eastDoorZ0 = 41.5, eastDoorZ1 = 46.5;
      addBox(bSteelDark, 0.36, 7.6, eastDoorZ0 - depZ0, depMaxX - 0.18, 3.8, (depZ0 + eastDoorZ0) * 0.5);
      station._addCollider(depMaxX - 0.4, 0, depZ0, depMaxX, 7.6, eastDoorZ0, 'metal');
      addBox(bSteelDark, 0.36, 7.6, depZ1 - eastDoorZ1, depMaxX - 0.18, 3.8, (eastDoorZ1 + depZ1) * 0.5);
      station._addCollider(depMaxX - 0.4, 0, eastDoorZ1, depMaxX, 7.6, depZ1, 'metal');
      addBox(bSteelDark, 0.36, 3.8, eastDoorZ1 - eastDoorZ0, depMaxX - 0.18, 5.7, (eastDoorZ0 + eastDoorZ1) * 0.5);
      addBox(bSteelDark, 0.36, 7.6, depLen, depMinX + 0.18, 3.8, depMidZ);
      station._addCollider(depMinX, 0, depZ0, depMinX + 0.4, 7.6, depZ1, 'metal');
      addBox(bJpo, bayW, 1.2, 0.25, bayCX, 0.6, depZ1 - 0.15);
      station._addCollider(depEastMinX, 0, depZ1 - 0.35, depMaxX, 1.4, depZ1, 'metal');
      addBox(bSteelDark, bayW, 7.6, 0.35, bayCX, 3.8, depZ1 - 0.18);
      station._addCollider(depEastMinX, 0, depZ1 - 0.4, depMaxX, 7.6, depZ1, 'metal');
      addBox(bSteelDark, wcW, 7.6, 0.35, wcCX, 3.8, depZ1 - 0.18);
      station._addCollider(depMinX, 0, depZ1 - 0.4, -1.85, 7.6, depZ1, 'metal');
      // North portal headers leaving Track 1 (-1.85..+1.85) & Track 2 (track2X±1.6) completely open up to y=4.35!
      const betW = (track2X - 1.65) - 1.85;
      if (betW > 0.4) {
        addBox(bSteelDark, betW, 7.6, 0.35, 1.85 + betW * 0.5, 3.8, depZ1 - 0.18);
      }
      addBox(bSteelDark, 4.0, 3.25, 0.45, 0.0, 5.98, depZ1 - 0.20);
      addBox(bSteelDark, 3.6, 3.25, 0.45, track2X, 5.98, depZ1 - 0.20);

      for (let crz = depZ0 + 6; crz <= depZ1 - 4; crz += 12) {
        addBox(bJpo, depMaxX - depMinX - 0.8, 0.65, 0.45, (depMinX + depMaxX) * 0.5, 6.75, crz);
      }
      // Maintenance wheelsets & bogie racks parked inside East Depot Bay (off Track 2!)
      for (const wz of [40, 46]) {
        addBox(bSteelDark, 2.1, 0.72, 1.5, depMaxX - 1.8, 0.36, wz);
        addCylinder(bSteelDark, 0.40, 0.40, 1.9, 10, depMaxX - 1.8, 0.40, wz - 0.50, 0, 0, Math.PI * 0.5);
        addCylinder(bSteelDark, 0.40, 0.40, 1.9, 10, depMaxX - 1.8, 0.40, wz + 0.50, 0, 0, Math.PI * 0.5);
        station._addCollider(depMaxX - 2.9, 0, wz - 0.85, depMaxX - 0.7, 0.95, wz + 0.85, 'metal');
      }
      buildTacticalSupplyCabinet(depMaxX - 1.2, 0.0, 54.0, -Math.PI * 0.5, 'depot');
      station._addCollider(depMaxX - 1.56, 0, 53.40, depMaxX - 0.84, 1.25, 54.60, 'metal');
      const depUsed = station._usedIds.has('depot_supply');
      station.interactables.push({
        id: 'depot_supply', type: 'balcony_supply', x: depMaxX - 1.8, y: 1.0, z: 54.0,
        label: depUsed ? '[E] Loker Taktis Depot Perawatan (Sudah Diambil)' : '[E] Loker Taktis Depot Perawatan (+Amunisi & +25 HP)',
        prompt: depUsed ? '[E] Loker Taktis Depot Perawatan (Sudah Diambil)' : '[E] Loker Taktis Depot Perawatan (+Amunisi & +25 HP)',
        used: depUsed
      });
    }

    // Harjamukti Botanical Terrace (linked overhead via JPO 2 above Track 2 + direct East street stair!)
    if (arch.hasGardenTerrace) {
      const gZ0 = -50.0, gZ1 = -16.0;
      const gLen = gZ1 - gZ0;
      const gMidZ = (gZ0 + gZ1) * 0.5;
      const gxMin = track2X + 1.85;
      const gxMax = gardenMaxX;
      const gW = gxMax - gxMin;
      const gCX = (gxMin + gxMax) * 0.5;

      addBox(bConcrete, gW, 1.12, gLen, gCX, -0.60, gMidZ, 0, 0, 0, 3, 6);
      addBox(bTerrazzo, gW, 0.04, gLen, gCX, -0.02, gMidZ, 0, 0, 0, 3.2, 6.5);
      station._addCollider(gxMin, -1.18, gZ0, gxMax, 0.0, gZ1, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

      // East Garden Terrace Street Exit Staircase (z = -23..-19 -> East Promenade -0.82)
      const gDoorZ0 = -23.0, gDoorZ1 = -19.0;
      addBox(bSteelDark, 0.16, 1.08, gDoorZ0 - gZ0, gxMax - 0.08, 0.54, (gZ0 + gDoorZ0) * 0.5);
      addBox(bSteelDark, 0.16, 1.08, gZ1 - gDoorZ1, gxMax - 0.08, 0.54, (gDoorZ1 + gZ1) * 0.5);
      station._addCollider(gxMax - 0.2, 0, gZ0, gxMax + 0.05, 1.2, gDoorZ0, 'metal');
      station._addCollider(gxMax - 0.2, 0, gDoorZ1, gxMax + 0.05, 1.2, gZ1, 'metal');
      buildGroundedTransition(gxMax + 1.8, -21.0, 4.0, 3.6, 0.0, SIDEWALK_Y, 'x', true, true);

      addBox(bSteelDark, gW, 1.08, 0.16, gCX, 0.54, gZ0 + 0.08);
      station._addCollider(gxMin, 0, gZ0 - 0.05, gxMax, 1.2, gZ0 + 0.2, 'metal');
      addBox(bSteelDark, gW, 1.08, 0.16, gCX, 0.54, gZ1 - 0.08);
      station._addCollider(gxMin, 0, gZ1 - 0.2, gxMax, 1.2, gZ1 + 0.05, 'metal');
      addBox(bSteelDark, 0.16, 1.08, gLen, gxMin + 0.08, 0.54, gMidZ);
      station._addCollider(gxMin - 0.05, 0, gZ0, gxMin + 0.2, 1.2, gZ1, 'metal');
      addBox(bSteelDark, gW, 1.08, 0.16, gCX, 0.54, gZ1 - 0.08);
      station._addCollider(gxMin, 0, gZ1 - 0.2, gxMax, 1.2, gZ1 + 0.05, 'metal');
      addBox(bSteelDark, 0.16, 1.08, (-38.0 - gZ0), gxMin + 0.08, 0.54, (gZ0 - 38.0) * 0.5);
      station._addCollider(gxMin - 0.05, 0, gZ0, gxMin + 0.2, 1.2, -38.0, 'metal');
      addBox(bSteelDark, 0.16, 1.08, (gZ1 + 29.6), gxMin + 0.08, 0.54, (gZ1 - 29.6) * 0.5);
      station._addCollider(gxMin - 0.05, 0, -29.6, gxMin + 0.2, 1.2, gZ1, 'metal');

      for (let pz = gZ0 + 3; pz <= gZ1 - 3; pz += 6) {
        const j2StMin = hasJpo2 ? Math.min(j2StairFootZ, jpo2NearZ) - 0.8 : 999;
        const j2StMax = hasJpo2 ? Math.max(j2StairFootZ, jpo2NearZ) + 0.8 : -999;
        if (pz >= j2StMin && pz <= j2StMax) {
          // Keep pergola crossbeam strictly east of the JPO 2 garden stair at gxMin + 1.4
          const eastBeamStart = gxMin + 2.9;
          const eastBeamEnd = gxMax - 0.3;
          if (eastBeamEnd > eastBeamStart + 0.4) {
            addBox(bJpo, eastBeamEnd - eastBeamStart, 0.18, 0.22, (eastBeamStart + eastBeamEnd) * 0.5, 3.45, pz);
          }
        } else {
          addBox(bJpo, gW - 0.6, 0.18, 0.22, gCX, 3.45, pz);
        }
        const gPostX = gxMax - 0.4;
        if (!isInStairExclusion(gPostX, pz, 0.9, 0.9)) {
          addBox(bSteelDark, 0.18, 3.45, 0.18, gPostX, 1.72, pz);
          recordStructuralCol(gPostX, pz, 0.0, 3.45, 'garden_pergola_col');
        }
      }
      const planterSpots = [[gxMax - 2.2, -45], [gxMax - 2.2, -28], [gxMin + 2.4, -45], [gxMin + 2.4, -21]];
      for (let pt = 0; pt < planterSpots.length; pt++) {
        const [px, pz] = planterSpots[pt];
        addBox(bConcrete, 2.0, 0.42, 2.0, px, 0.21, pz);
        station._addCollider(px - 1.0, 0, pz - 1.0, px + 1.0, 0.6, pz + 1.0, 'concrete');
        station._placeNormalizedModel('pachira_aquatica_01', px, 0.42, pz, pt * 1.4, 2.4,
          (n) => (n.name || '').endsWith('_' + ['a', 'b', 'c', 'd'][pt % 4])
        );
      }

      // Detailed Field Medical Station Cabinet + Red Cross Emblem + 3-LOD medical_box GLTF on top
      addBox(bSteelDark, 1.04, 0.10, 0.62, gCX, 0.05, gZ0 + 2.2);
      addAtlasBox(bStall, 0.98, 0.62, 0.56, gCX, 0.41, gZ0 + 2.2, 0, null, STALL_UV.rotioCreamSolid);
      addBox(bTruss, 1.06, 0.06, 0.64, gCX, 0.75, gZ0 + 2.2);
      addBox(bTruss, 0.04, 0.58, 0.04, gCX, 0.41, gZ0 + 2.48);
      addBox(bTruss, 0.12, 0.04, 0.04, gCX - 0.30, 0.44, gZ0 + 2.49);
      addAtlasBox(bSign, 0.28, 0.10, 0.04, gCX + 0.18, 0.44, gZ0 + 2.49, 0, null, SIGN_UV.hydrantRedSolid);
      addAtlasBox(bSign, 0.10, 0.28, 0.04, gCX + 0.18, 0.44, gZ0 + 2.49, 0, null, SIGN_UV.hydrantRedSolid);
      station._placeNormalizedModel('medical_box', gCX - 0.14, 0.78, gZ0 + 2.2, 0.22, 0.14);
      station._addCollider(gCX - 0.55, 0, gZ0 + 1.85, gCX + 0.55, 1.05, gZ0 + 2.55, 'metal');
      const garUsed = station._usedIds.has('garden_supply');
      station.interactables.push({
        id: 'garden_supply', type: 'balcony_supply', x: gCX, y: 1.0, z: gZ0 + 2.7,
        label: garUsed ? '[E] Kotak Medis Kebun Atap Harjamukti (Sudah Diambil)' : '[E] Kotak Medis Kebun Atap Harjamukti (+Amunisi & +25 HP)',
        prompt: garUsed ? '[E] Kotak Medis Kebun Atap Harjamukti (Sudah Diambil)' : '[E] Kotak Medis Kebun Atap Harjamukti (+Amunisi & +25 HP)',
        used: garUsed
      });
    }

    // =========================================================
    // 3B. CONTINUOUS GROUNDED PLAZA APRONS FILLING ALL STATION LOT GAPS
    // =========================================================
    {
      const deckHoles = [
        { x0: p1MinX - 0.05, x1: p1MaxX + 0.05, z0: platMinZ - 0.05, z1: platMaxZ + 0.05 }
      ];
      if (!isIsland) {
        deckHoles.push({ x0: p2MinX - 0.05, x1: p2MaxX + 0.05, z0: platMinZ - 0.05, z1: platMaxZ + 0.05 });
        deckHoles.push({ x0: concMinX - 0.05, x1: concMaxX + 0.05, z0: concMinZ - 0.05, z1: concMaxZ + 0.05 });
      } else if (isCawang) {
        deckHoles.push({ x0: i2MinX - 0.05, x1: i2MaxX + 0.05, z0: platMinZ - 0.05, z1: platMaxZ + 0.05 });
      }
      if (arch.hasDepotShed) {
        deckHoles.push({ x0: -6.05, x1: -1.80, z0: 35.95, z1: (platMaxZ - 2.0) + 0.05 });
        deckHoles.push({ x0: track2X + 1.55, x1: depotMaxX + 0.05, z0: 35.95, z1: (platMaxZ - 2.0) + 0.05 });
      }
      if (arch.hasGardenTerrace) {
        deckHoles.push({ x0: track2X + 1.80, x1: gardenMaxX + 0.05, z0: -50.05, z1: -15.95 });
      }

      const subtractRect = (rects, h) => {
        const out = [];
        for (let ri = 0; ri < rects.length; ri++) {
          const r = rects[ri];
          if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) {
            out.push(r);
            continue;
          }
          const ix0 = Math.max(r.x0, h.x0);
          const ix1 = Math.min(r.x1, h.x1);
          if (ix0 > r.x0 + 0.05) out.push({ x0: r.x0, x1: ix0, z0: r.z0, z1: r.z1 });
          if (ix1 < r.x1 - 0.05) out.push({ x0: ix1, x1: r.x1, z0: r.z0, z1: r.z1 });
          if (h.z0 > r.z0 + 0.05) out.push({ x0: ix0, x1: ix1, z0: r.z0, z1: h.z0 });
          if (h.z1 < r.z1 - 0.05) out.push({ x0: ix0, x1: ix1, z0: h.z1, z1: r.z1 });
        }
        return out;
      };

      const sortedTracks = trackXs.slice().sort((a, b) => a - b);
      const plazaZ0 = CROSSING_Z_SOUTH + CROSSING_HALF_W + 0.02; // -67.98 (zero overlap with z=-68 crossing)
      const plazaZ1 = CROSSING_Z_NORTH - CROSSING_HALF_W - 0.02; // +67.98
      let curX = corridorMinX + 0.02;
      const bands = [];
      for (let ti = 0; ti < sortedTracks.length; ti++) {
        const t0 = sortedTracks[ti] - 1.66;
        const t1 = sortedTracks[ti] + 1.66;
        if (t0 > curX + 0.15) bands.push({ x0: curX, x1: t0, z0: plazaZ0, z1: plazaZ1 });
        curX = Math.max(curX, t1);
      }
      if (corridorMaxX - 0.02 > curX + 0.15) bands.push({ x0: curX, x1: corridorMaxX - 0.02, z0: plazaZ0, z1: plazaZ1 });

      let freeRects = bands;
      for (let hi = 0; hi < deckHoles.length; hi++) {
        freeRects = subtractRect(freeRects, deckHoles[hi]);
      }
      for (let fi = 0; fi < freeRects.length; fi++) {
        const fr = freeRects[fi];
        const fw = fr.x1 - fr.x0;
        const fd = fr.z1 - fr.z0;
        if (fw < 0.12 || fd < 0.12) continue;
        const fcx = (fr.x0 + fr.x1) * 0.5;
        const fcz = (fr.z0 + fr.z1) * 0.5;
        addBox(bConcrete, fw, 0.34, fd, fcx, SIDEWALK_Y - 0.21, fcz, 0, 0, 0, fw * 0.35, fd * 0.35);
        addBox(bConcreteRough, fw, 0.04, fd, fcx, SIDEWALK_Y - 0.02, fcz, 0, 0, 0, fw * 0.35, fd * 0.35);
        station._addCollider(fr.x0, -1.24, fr.z0, fr.x1, SIDEWALK_Y, fr.z1, 'floor', {
          isFloor: true, blocksWalk: true, blocksBullets: false
        });
      }
    }

    // =========================================================
    // 4. CURVED RIBBED CANOPY & BEVELED COLUMN PLINTHS
    // =========================================================
    const bayStep = 12;
    const canBays = Math.round((platLen - 4) / bayStep);
    const canStartZ = -(canBays * bayStep) * 0.5;
    const canEndZ = -canStartZ;
    for (let z = canStartZ; z <= canEndZ + 0.01; z += bayStep) {
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs;
        const t1 = (k + 1) / segs;
        const x0 = canopyCenterX + (t0 - 0.5) * canopySpanX;
        const x1 = canopyCenterX + (t1 - 0.5) * canopySpanX;
        const y0 = eaveY + Math.sin(t0 * Math.PI) * (apexY - eaveY);
        const y1 = eaveY + Math.sin(t1 * Math.PI) * (apexY - eaveY);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        addCylinder(bTruss, 0.11, 0.11, len + 0.1, 6, (x0 + x1) * 0.5, (y0 + y1) * 0.5, z, 0, 0, ang - Math.PI * 0.5);

        if (z < canEndZ - 0.5) {
          const isSkylight = (k === 4 || k === 5) && (Math.round(Math.abs(z)) % 24 === 0);
          if (!isSkylight) {
            addBox(bRoof, len + 0.14, 0.14, bayStep, (x0 + x1) * 0.5, (y0 + y1) * 0.5 + 0.16, z + bayStep * 0.5, 0, 0, ang, 1.5, 2.5);
          } else {
            addBox(bTruss, len + 0.12, 0.08, 0.18, (x0 + x1) * 0.5, (y0 + y1) * 0.5 + 0.14, z + bayStep * 0.33, 0, 0, ang);
            addBox(bTruss, len + 0.12, 0.08, 0.18, (x0 + x1) * 0.5, (y0 + y1) * 0.5 + 0.14, z + bayStep * 0.67, 0, 0, ang);
            const midK = (t0 + t1) * 0.5;
            const mx = canopyCenterX + (midK - 0.5) * canopySpanX;
            const my = (y0 + y1) * 0.5 + 0.14;
            addBox(bTruss, 0.10, 0.08, bayStep, mx, my, z + bayStep * 0.5, 0, 0, ang);
          }
        }
      }
      // Full-height canopy columns with beveled concrete plinth bases (skipping/flanking all stair exclusions)!
      const emitCanopyColumn = (colX, cz, baseY, topY, allowFlankPair) => {
        if (!isInStairExclusion(colX, cz, 0.9, 0.9)) {
          const plinthH = 0.45;
          const shaftH = topY - baseY;
          addCylinder(bConcrete, 0.18, 0.24, plinthH, 8, colX, baseY + plinthH * 0.5, cz);
          addCylinder(bTruss, 0.12, 0.14, shaftH, 8, colX, baseY + shaftH * 0.5, cz);
          recordStructuralCol(colX, cz, baseY, topY, 'canopy_col');
          return;
        }
        if (allowFlankPair && Math.abs(cz) < 1.0) {
          addBox(bTruss, 0.22, 0.28, 9.4, colX, topY - 0.14, cz);
          for (const fz of [cz - 4.6, cz + 4.6]) {
            if (!isInStairExclusion(colX, fz, 0.9, 0.9)) {
              const plinthH = 0.45;
              const shaftH = topY - baseY;
              addCylinder(bConcrete, 0.18, 0.24, plinthH, 8, colX, baseY + plinthH * 0.5, fz);
              addCylinder(bTruss, 0.12, 0.14, shaftH, 8, colX, baseY + shaftH * 0.5, fz);
              recordStructuralCol(colX, fz, baseY, topY, 'canopy_col');
            }
          }
          return;
        }
        // Bridge skipped stair-bay column with a longitudinal portal truss header beam
        addBox(bTruss, 0.22, 0.28, bayStep, colX, topY - 0.14, cz);
      };

      if (!isIsland) {
        const colE = p1MaxX - 0.35;
        const p1ColH = getCanopyArchY(colE);
        emitCanopyColumn(colE, z, 0.0, p1ColH + 0.15, false);
        const colW = canopyMinX + 0.15;
        emitCanopyColumn(colW, z, SIDEWALK_Y, eaveY + 0.15, true);
      } else {
        const colA = p1MinX + 1.85;
        const colB = isCawang ? (i2MaxX - 1.85) : (p1MaxX - 1.85);
        const hA = getCanopyArchY(colA);
        const hB = getCanopyArchY(colB);
        emitCanopyColumn(colA, z, 0.0, hA + 0.15, false);
        emitCanopyColumn(colB, z, 0.0, hB + 0.15, false);
      }
    }

    // Eave trim fascias & longitudinal roof purlins
    addBox(bJpo, 0.18, 0.38, platLen, canopyMinX - 0.05, eaveY + 0.12, 0);
    addBox(bJpo, 0.18, 0.38, platLen, canopyMaxX + 0.05, eaveY + 0.12, 0);
    for (let k = 0; k <= segs; k++) {
      const tk = k / segs;
      const px = canopyMinX + tk * canopySpanX;
      const py = eaveY + Math.sin(tk * Math.PI) * (apexY - eaveY);
      addCylinder(bTruss, 0.09, 0.09, platLen, 6, px, py, 0, Math.PI * 0.5, 0, 0);
    }

    // Station Name & Directional Peron Banners with dark steel frames & full-height suspension rods to canopy arch!
    const addHangingBanner = (bx, by, bz, ryRot, signUv) => {
      const bw = 2.8, bh = 0.68, bd = 0.10;
      addBox(bSteelDark, bw + 0.08, bh + 0.06, bd, bx, by, bz, 0, ryRot, 0);
      const rodOff = 1.05;
      const rCos = Math.cos(ryRot), rSin = Math.sin(ryRot);
      const rodBotY = by + bh * 0.5;
      for (const sgn of [-1, 1]) {
        const rx = bx + sgn * rodOff * rCos;
        const rz = bz - sgn * rodOff * rSin;
        const roofY = getCanopyArchY(rx) + 0.08;
        const rodLen = Math.max(0.3, roofY - rodBotY);
        addBox(bSteelDark, 0.04, rodLen, 0.04, rx, rodBotY + rodLen * 0.5, rz);
      }
      const targetBucket = signUv ? bSign : bBanner;
      const rect = signUv || [0, 0, 1, 1];
      addAtlasQuad(targetBucket, bw, bh, bx + Math.sin(ryRot) * (bd * 0.5 + 0.01), by, bz + Math.cos(ryRot) * (bd * 0.5 + 0.01), 0, ryRot, 0, rect);
      addAtlasQuad(targetBucket, bw, bh, bx - Math.sin(ryRot) * (bd * 0.5 + 0.01), by, bz - Math.cos(ryRot) * (bd * 0.5 + 0.01), 0, ryRot + Math.PI, 0, rect);
    };
    const midBannerZ = Math.abs(jpoZ) < 6.0 ? -22.0 : 0.0;
    addHangingBanner(p1MinX + 0.55, 3.35, -14.0, Math.PI * 0.5);
    addHangingBanner(p1MinX + 0.55, 3.35, 14.0, Math.PI * 0.5);
    addHangingBanner(p1MinX + (isIsland ? 2.45 : 2.55), 3.35, midBannerZ, 0.0, SIGN_UV.peron1);
    if (!isIsland) {
      addHangingBanner(p2MaxX - 2.45, 3.35, 0.0, 0.0, SIGN_UV.peron2);
      addHangingBanner(p2MaxX - 0.55, 3.35, -14.0, -Math.PI * 0.5, SIGN_UV.peron2);
      addHangingBanner(p2MaxX - 0.55, 3.35, 14.0, -Math.PI * 0.5, SIGN_UV.peron2);
    } else {
      addHangingBanner(p1MaxX - 2.45, 3.35, midBannerZ, 0.0, SIGN_UV.peron2);
      addHangingBanner(p1MaxX - 0.55, 3.35, -14.0, -Math.PI * 0.5, SIGN_UV.peron2);
      addHangingBanner(p1MaxX - 0.55, 3.35, 14.0, -Math.PI * 0.5, SIGN_UV.peron2);
    }

    // Cawang Interchange Illuminated Overhead Track Signage (Tracks 1-4 + JPO Stair Wayfinding)
    if (isCawang) {
      const bCawangSign = [];
      ctx.cawangSignBucket = bCawangSign;
      const trackUv = {
        jalur1: [0, 0.75, 1, 1.0],
        jalur2: [0, 0.50, 1, 0.75],
        jalur3: [0, 0.25, 1, 0.50],
        jalur4: [0, 0.00, 1, 0.25]
      };
      const addTrackSign = (sx, sy, sz, ryRot, uvRect, mountRoofY) => {
        const sw = 3.2, sh = 0.62, sd = 0.10;
        addBox(bSteelDark, sw + 0.08, sh + 0.06, sd, sx, sy, sz, 0, ryRot, 0);
        const rodOff = 1.20;
        const rCos = Math.cos(ryRot), rSin = Math.sin(ryRot);
        const rodBotY = sy + sh * 0.5;
        for (const sgn of [-1, 1]) {
          const rx = sx + sgn * rodOff * rCos;
          const rz = sz - sgn * rodOff * rSin;
          const roofY = mountRoofY !== undefined ? mountRoofY : (getCanopyArchY(rx) + 0.08);
          const rodLen = Math.max(0.25, roofY - rodBotY);
          addBox(bSteelDark, 0.04, rodLen, 0.04, rx, rodBotY + rodLen * 0.5, rz);
        }
        addAtlasQuad(bCawangSign, sw, sh, sx + Math.sin(ryRot) * (sd * 0.5 + 0.01), sy, sz + Math.cos(ryRot) * (sd * 0.5 + 0.01), 0, ryRot, 0, uvRect);
        addAtlasQuad(bCawangSign, sw, sh, sx - Math.sin(ryRot) * (sd * 0.5 + 0.01), sy, sz - Math.cos(ryRot) * (sd * 0.5 + 0.01), 0, ryRot + Math.PI, 0, uvRect);
      };

      const wreckX = ctx.cawangWreckX;
      // Platform canopy truss-mounted track signs (clear of trains)
      addTrackSign(p1MinX + 2.3, 3.45, -16.0, 0.0, trackUv.jalur1);
      addTrackSign(p1MinX + 2.3, 3.45, 18.0, 0.0, trackUv.jalur1);
      addTrackSign(p1MaxX - 2.3, 3.45, -16.0, 0.0, trackUv.jalur2);
      addTrackSign(p1MaxX - 2.3, 3.45, 18.0, 0.0, trackUv.jalur2);
      addTrackSign(i2MinX + 2.3, 3.45, -16.0, 0.0, trackUv.jalur4);
      addTrackSign(i2MinX + 2.3, 3.45, 18.0, 0.0, trackUv.jalur4);

      // JPO Pergola & Stair-head overhead signs across Tracks 1-4 (y = 6.38, suspended from jpoPergolaY)
      addTrackSign(-4.70, 6.38, jpoNearZ + 0.55, 0.0, trackUv.jalur3, jpoPergolaY);
      addTrackSign(0.0, 6.38, jpoNearZ + 0.55, 0.0, trackUv.jalur1, jpoPergolaY);
      addTrackSign(track2X, 6.38, jpoNearZ + 0.55, 0.0, trackUv.jalur2, jpoPergolaY);
      addTrackSign(wreckX, 6.38, jpoNearZ + 0.55, 0.0, trackUv.jalur4, jpoPergolaY);
      addTrackSign(wreckX, 6.38, jpoFarZ - 0.55, 0.0, trackUv.jalur4, jpoPergolaY);
      addTrackSign(stairX, 6.38, jpoNearZ + 0.55, Math.PI * 0.5, trackUv.jalur4, jpoPergolaY);
      addTrackSign(i2MinX + 4.6, 6.38, jpoFarZ - 0.55, 0.0, trackUv.jalur4, jpoPergolaY);
    }

    // =========================================================
    // 5. PLATFORM SCREEN DOORS (HHPSD) ALONG TRACK 1 (x=+1.46) & TRACK 2 (x=track2X-1.46)
    // =========================================================
    const doorCenters = dims.psdCentersZ;
    const doorW = dims.psdDoorClearWidth;
    const halfDoor = doorW * 0.5;
    const psd2X = track2X - 1.46;

    const fixedSpans = [];
    let prevZ = -29.0;
    for (let i = 0; i < doorCenters.length; i++) {
      const dz = doorCenters[i];
      if (dz - halfDoor > prevZ + 0.1) {
        fixedSpans.push([prevZ, dz - halfDoor]);
      }
      prevZ = dz + halfDoor;
    }
    fixedSpans.push([prevZ, 29.0]);

    const psdFrameGeo = new THREE.BoxGeometry(0.08, 0.36, halfDoor - 0.04);
    station.disposableGeometries.push(psdFrameGeo);

    const buildPsdRow = (rowX, signDirX, outDoors, headerUv) => {
      const psdHeaderRect = headerUv || SIGN_UV.psdHeader;
      // Offset PSD screen 5cm platform-ward from platform edge so steel frames & signage never clip the train hull (±1.37m)
      const rcX = rowX + signDirX * 0.05;
      const signYaw = signDirX > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      for (let s = 0; s < fixedSpans.length; s++) {
        const z0 = fixedSpans[s][0];
        const z1 = fixedSpans[s][1];
        const spanLen = z1 - z0;
        const cz = (z0 + z1) * 0.5;

        addBox(bSteelDark, 0.16, 1.40, 0.42, rcX, 0.70, z0 + 0.21);
        addBox(bSteelDark, 0.16, 1.40, 0.42, rcX, 0.70, z1 - 0.21);
        if (spanLen > 1.1) {
          addAtlasQuad(bSign, 0.36, 0.55, rcX + signDirX * 0.09, 0.72, z0 + 0.21, 0, signYaw, 0, SIGN_UV.safetyWarn);
        }

        const midSpan = spanLen - 0.84;
        if (midSpan > 0.6) {
          const isAdPanel = (s % 2 === 1);
          if (isAdPanel) {
            addBox(bSteelDark, 0.14, 1.18, midSpan, rcX, 0.59, cz);
            addAtlasQuad(bSign, midSpan - 0.12, 1.02, rcX + signDirX * 0.08, 0.62, cz, 0, signYaw, 0, SIGN_UV.smartTravelAd);
            station._addCollider(rcX - 0.09, 0, z0, rcX + 0.09, 1.42, z1, 'metal');
          } else {
            addBox(bSteelDark, 0.14, 0.42, midSpan, rcX, 0.21, cz);
            const cIdx = station._addCollider(rcX - 0.09, 0, z0, rcX + 0.09, 1.42, z1, 'glass');
            glassRecords.push({
              cx: rcX, cy: 0.82, cz: cz, w: midSpan - 0.06, h: 0.78, d: 0.04,
              ry: Math.PI * 0.5, hp: 25, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cIdx
            });
          }
          addBox(bSteelDark, 0.16, 0.24, spanLen, rcX, 1.30, cz);
          const tileCount = Math.max(1, Math.round(spanLen / 1.35));
          const tileW = (spanLen - 0.1) / tileCount;
          for (let tc = 0; tc < tileCount; tc++) {
            const tz = z0 + 0.05 + (tc + 0.5) * tileW;
            addAtlasQuad(bSign, tileW - 0.04, 0.24, rcX + 0.09, 1.30, tz, 0, Math.PI * 0.5, 0, psdHeaderRect);
            addAtlasQuad(bSign, tileW - 0.04, 0.24, rcX - 0.09, 1.30, tz, 0, -Math.PI * 0.5, 0, psdHeaderRect);
          }
        }
        station._addCollider(rcX - 0.10, 0, z0, rcX + 0.10, 1.45, z0 + 0.44, 'metal');
        station._addCollider(rcX - 0.10, 0, z1 - 0.44, rcX + 0.10, 1.45, z1, 'metal');
      }

      const extLen = Math.max(4.0, (platMaxZ - 0.5) - 29.0);
      const extMidZ = 29.0 + extLen * 0.5;
      addBox(bSteelDark, 0.14, 1.15, extLen, rcX, 0.58, -extMidZ);
      addBox(bSteelDark, 0.14, 1.15, extLen, rcX, 0.58, extMidZ);
      station._addCollider(rcX - 0.09, 0, -(platMaxZ - 0.5), rcX + 0.09, 1.35, -29.0, 'metal');
      station._addCollider(rcX - 0.09, 0, 29.0, rcX + 0.09, 1.35, platMaxZ - 0.5, 'metal');

      outDoors.length = 0;
      for (let d = 0; d < doorCenters.length; d++) {
        const dz = doorCenters[d];
        const doorCollId = station._addCollider(rcX - 0.08, 0.0, dz - halfDoor, rcX + 0.08, 1.40, dz + halfDoor, 'psd_door', {
          isDoor: true, isOpen: false, blocksWalk: true, blocksBullets: true
        });
        const leftGlassIdx = glassRecords.length;
        glassRecords.push({
          cx: rcX, cy: 0.85, cz: dz - halfDoor * 0.5, w: halfDoor - 0.04, h: 0.98, d: 0.04,
          ry: Math.PI * 0.5, hp: 20, isPsdDoor: true, psdDoorIdx: d, slideSign: -1, colliderIdx: doorCollId
        });
        const rightGlassIdx = glassRecords.length;
        glassRecords.push({
          cx: rcX, cy: 0.85, cz: dz + halfDoor * 0.5, w: halfDoor - 0.04, h: 0.98, d: 0.04,
          ry: Math.PI * 0.5, hp: 20, isPsdDoor: true, psdDoorIdx: d, slideSign: 1, colliderIdx: doorCollId
        });
        outDoors.push({
          index: d, z: dz, colliderIdx: doorCollId,
          leftGlassIdx: leftGlassIdx, rightGlassIdx: rightGlassIdx,
          leftFrameInst: d * 2, rightFrameInst: d * 2 + 1
        });
      }

      const frameInst = new THREE.InstancedMesh(psdFrameGeo, mats.steelDark, doorCenters.length * 2);
      frameInst.castShadow = false;
      frameInst.receiveShadow = true;
      root.add(frameInst);
      return frameInst;
    };

    station.psdDoors = [];
    station.psdDoors2 = [];
    station.navGraph = null;
    station._psdFrameInst = buildPsdRow(psdX, 1, station.psdDoors, SIGN_UV.psdHeader);
    station._psdFrameInst2 = buildPsdRow(psd2X, -1, station.psdDoors2, SIGN_UV.psdHeaderP2 || SIGN_UV.psdHeader);

    // Assert zero structural column/pier overlap with stairZones across all 6 station archetypes
    for (let ci = 0; ci < station._structuralCols.length; ci++) {
      const col = station._structuralCols[ci];
      for (let si = 0; si < stairZones.length; si++) {
        const s = stairZones[si];
        if (s.isTransition) {
          if (col.x >= s.minX && col.x <= s.maxX && col.z >= s.minZ && col.z <= s.maxZ && col.minY < s.maxY && col.maxY > s.minY) {
            throw new Error('[StationArch] Structural column (' + col.tag + ' at ' + col.x.toFixed(2) + ',' + col.z.toFixed(2) + ') overlaps transition stairZone on ' + (arch.id || 'station'));
          }
          continue;
        }
        if (s.sx !== undefined) {
          const zLo = Math.min(s.footZ, s.topZ);
          const zHi = Math.max(s.footZ, s.topZ);
          const physOverlap = Math.abs(col.x - s.sx) < 1.25 && col.z >= zLo - 0.15 && col.z <= zHi + 0.15 && col.minY < (UPPER_FLOOR_Y + 1.0) && col.maxY > 0.0;
          if (physOverlap) {
            throw new Error('[StationArch] Structural column (' + col.tag + ' at ' + col.x.toFixed(2) + ',' + col.z.toFixed(2) + ') overlaps physical stair at x=' + s.sx + ' on ' + (arch.id || 'station'));
          }
          if (col.tag !== 'jpo_pier') {
            if (col.x >= s.minX && col.x <= s.maxX && col.z >= s.minZ && col.z <= s.maxZ) {
              throw new Error('[StationArch] Non-pier structural column (' + col.tag + ' at ' + col.x.toFixed(2) + ',' + col.z.toFixed(2) + ') overlaps stairZone at x=' + s.sx + ' on ' + (arch.id || 'station'));
            }
          }
        }
      }
    }

    // Export shared layout metrics for station_nav_props
    ctx.layout = layout;
    ctx.isCawang = isCawang;
    ctx.isDepot = isDepot;
    ctx.isIsland = isIsland;
    ctx.platLen = platLen;
    ctx.halfPlat = halfPlat;
    ctx.psdX = psdX;
    ctx.p1MinX = p1MinX;
    ctx.p1Width = p1Width;
    ctx.p1MaxX = p1MaxX;
    ctx.platMinZ = platMinZ;
    ctx.platMaxZ = platMaxZ;
    ctx.track2X = track2X;
    ctx.trackXs = trackXs;
    ctx.i2MinX = i2MinX;
    ctx.i2Width = i2Width;
    ctx.i2MaxX = i2MaxX;
    ctx.p2MaxX = p2MaxX;
    ctx.p2MinX = p2MinX;
    ctx.cw = cw;
    ctx.concLen = concLen;
    ctx.concMinZ = concMinZ;
    ctx.concMaxZ = concMaxZ;
    ctx.concMinX = concMinX;
    ctx.concMaxX = concMaxX;
    ctx.concMidZ = concMidZ;
    ctx.canopySpanX = canopySpanX;
    ctx.canopyCenterX = canopyCenterX;
    ctx.canopyMinX = canopyMinX;
    ctx.canopyMaxX = canopyMaxX;
    ctx.apexY = apexY;
    ctx.eaveY = eaveY;
    ctx.segs = segs;
    ctx.getCanopyArchY = getCanopyArchY;
    ctx.gardenMaxX = gardenMaxX;
    ctx.depotMaxX = depotMaxX;
    ctx.corridorMinX = corridorMinX;
    ctx.corridorMaxX = corridorMaxX;
    ctx.jpoZ = jpoZ;
    ctx.jpoDepth = jpoDepth;
    ctx.jpoSpanMinX = jpoSpanMinX;
    ctx.jpoSpanMaxX = jpoSpanMaxX;
    ctx.jpoW = jpoW;
    ctx.jpoCX = jpoCX;
    ctx.jpoNearZ = jpoNearZ;
    ctx.jpoFarZ = jpoFarZ;
    ctx.jpoPergolaY = jpoPergolaY;
    ctx.jpo2Z = jpo2Z;
    ctx.jpo2NearZ = jpo2NearZ;
    ctx.jpo2CX = jpo2CX;
    ctx.stairX = stairX;
    ctx.stairFootZ = stairFootZ;
    ctx.stairTopZ = stairTopZ;
    ctx.cStairX = cStairX;
    ctx.cStairFootZ = cStairFootZ;
    ctx.cStairTopZ = cStairTopZ;
    ctx.supX = supX;
    ctx.supZ = supZ;
  }

  let _sharedInvisStairSlopeMat = null;
  function getInvisStairSlopeMat() {
    if (!_sharedInvisStairSlopeMat) {
      _sharedInvisStairSlopeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    }
    return _sharedInvisStairSlopeMat;
  }

  function mergeStaticBucketsBatch(station, ctx, batchIdx) {
    const { STREET_GROUND_Y } = S.CONST;
    const { addBox, mergeBucket } = S;
    const { arch, root, mats, matConcrete, matConcreteRough, matDarkWood, matCanopy, buckets } = ctx;
    const {
      bConcrete, bConcreteRough, bTerrazzo, bChecker, bTactile,
      bRoof, bTruss, bSteelDark, bJpo, bStall, bSign, bBanner,
      bStairStepsConc, bStairStepsSteel, bStairSlopeBvh
    } = buckets;

    if (batchIdx === 0) {
      // Cikoko Elevated Inner-Ring Highway Overpass crossing high above z = -88 (clearing trains & cross street!)
      if (arch.hasTollOverpass) {
        const tollZ = -90.0;
        const tollY = 6.6;
        const tollMat = mats.highwayAsphalt || matConcreteRough;
        addBox(bConcrete, 175, 0.80, 14.5, 5.0, tollY - 0.40, tollZ, 0, 0, 0, 12, 2);
        const tollTop = new THREE.Mesh(new THREE.BoxGeometry(175, 0.06, 13.4), tollMat);
        tollTop.position.set(5.0, tollY + 0.03, tollZ);
        station.disposableGeometries.push(tollTop.geometry);
        root.add(tollTop);
        addBox(bJpo, 175, 0.90, 0.50, 5.0, tollY + 0.45, tollZ);
        addBox(bConcrete, 175, 0.85, 0.45, 5.0, tollY + 0.42, tollZ - 7.0);
        addBox(bConcrete, 175, 0.85, 0.45, 5.0, tollY + 0.42, tollZ + 7.0);
        for (const px of [-36, -15, 34, 62]) {
          const pH = (tollY - 0.8) - STREET_GROUND_Y;
          addBox(bConcrete, 1.8, pH, 2.2, px, STREET_GROUND_Y + pH * 0.5, tollZ);
          addBox(bConcrete, 2.2, 0.9, 10.5, px, tollY - 1.1, tollZ);
          station._addCollider(px - 0.95, STREET_GROUND_Y, tollZ - 1.15, px + 0.95, tollY, tollZ + 1.15, 'concrete');
        }
      }

      // =========================================================
      // 7. MERGE STATIC STATION BUCKETS & BUILD MESH BVHs (BATCH 0)
      // =========================================================
      mergeBucket(bConcrete, matConcrete, true, true, station.disposableGeometries, root, 'StationConcrete', station.bvhMeshes);
      mergeBucket(bConcreteRough, matConcreteRough, false, true, station.disposableGeometries, root, 'StationBallast', station.bvhMeshes);
      mergeBucket(bTerrazzo, mats.terrazzo || matConcrete, false, true, station.disposableGeometries, root, 'StationTerrazzo', station.bvhMeshes);
      mergeBucket(bChecker, mats.checkerFloor || matConcrete, false, true, station.disposableGeometries, root, 'StationChecker', station.bvhMeshes);
      mergeBucket(bTactile, mats.tactile || matConcrete, false, true, station.disposableGeometries, root, 'StationTactile', null);
      return;
    }

    if (batchIdx === 1) {
      mergeBucket(bRoof, matCanopy, true, true, station.disposableGeometries, root, 'StationCanopy', station.bvhMeshes);
      mergeBucket(bTruss, mats.steelTruss || matConcrete, false, false, station.disposableGeometries, root, 'StationTrusses', station.bvhMeshes);
      mergeBucket(bSign, mats.signageAtlas || matConcrete, false, false, station.disposableGeometries, root, 'StationSignage', null);
      mergeBucket(bBanner, mats.stationBanner || matConcrete, false, false, station.disposableGeometries, root, 'StationBanner', null);
      return;
    }

    if (batchIdx === 2) {
      mergeBucket(bSteelDark, mats.steelDark || matConcrete, false, true, station.disposableGeometries, root, 'StationSteelDark', station.bvhMeshes);
      mergeBucket(bJpo, mats.jpoOrange || matConcrete, false, true, station.disposableGeometries, root, 'StationJPO', station.bvhMeshes);
      mergeBucket(bStall, mats.stallAtlas || matDarkWood, false, true, station.disposableGeometries, root, 'StationStalls', station.bvhMeshes);
      mergeBucket(bStairStepsConc, matConcrete, false, true, station.disposableGeometries, root, 'StationStairStepsConc', null);
      mergeBucket(bStairStepsSteel, mats.steelDark || matConcrete, false, true, station.disposableGeometries, root, 'StationStairStepsSteel', null);
      mergeBucket(bStairSlopeBvh, getInvisStairSlopeMat(), false, false, station.disposableGeometries, root, 'StationStairSlopes', station.bvhMeshes);

      if (ctx.cawangSignBucket && ctx.cawangSignBucket.length > 0) {
        const cSignMat = buildCawangTrackSignMaterial(station);
        mergeBucket(ctx.cawangSignBucket, cSignMat, false, false, station.disposableGeometries, root, 'StationCawangTrackSigns', null);
      }
    }
  }

  function mergeStaticBuckets(station, ctx) {
    mergeStaticBucketsBatch(station, ctx, 0);
    mergeStaticBucketsBatch(station, ctx, 1);
    mergeStaticBucketsBatch(station, ctx, 2);
  }

  function buildCawangTrackSignMaterial(station) {
    const w = 1024;
    const h = 512;
    const cA = document.createElement('canvas');
    cA.width = w;
    cA.height = h;
    const ctx = cA.getContext('2d');

    const cE = document.createElement('canvas');
    cE.width = w;
    cE.height = h;
    const etx = cE.getContext('2d');

    const rows = [
      { y: 0, bg: '#16325C', em: '#1E437A', badge: '#1D4ED8', code: 'CB', stripe: '#E5D429', text: 'JALUR 1 / HARJAMUKTI', sub: 'PERON 1  •  LRT JABODEBEK', arrow: '↓' },
      { y: 128, bg: '#16325C', em: '#1E437A', badge: '#1D4ED8', code: 'CB', stripe: '#E5D429', text: 'JALUR 2 / DUKUH ATAS', sub: 'PERON 2  •  LRT JABODEBEK', arrow: '↓' },
      { y: 256, bg: '#133A29', em: '#165239', badge: '#15803D', code: 'BK', stripe: '#22C55E', text: 'JALUR 3 / BEKASI', sub: 'KORIDOR TIMUR  •  JATI MULYA', arrow: '←' },
      { y: 384, bg: '#26180B', em: '#4A2B0A', badge: '#D97706', code: '!', stripe: '#F59E0B', text: 'JALUR 4 / BANGKAI LRT', sub: 'ISLAND 2  •  SEKRING BYPASS DARURAT', arrow: '→' }
    ];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      ctx.fillStyle = r.bg;
      ctx.fillRect(0, r.y, w, 128);
      ctx.fillStyle = r.stripe;
      ctx.fillRect(0, r.y, w, 10);
      ctx.fillRect(0, r.y + 118, w, 10);

      etx.fillStyle = r.em;
      etx.fillRect(0, r.y, w, 128);
      etx.fillStyle = r.stripe;
      etx.fillRect(0, r.y, w, 6);

      // Line badge
      ctx.fillStyle = r.badge;
      ctx.beginPath();
      ctx.arc(72, r.y + 64, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.code, 72, r.y + 66);

      etx.fillStyle = r.badge;
      etx.beginPath();
      etx.arc(72, r.y + 64, 32, 0, Math.PI * 2);
      etx.fill();

      // Main label (explicitly reset textBaseline from badge's 'middle' to 'alphabetic' on both canvases)
      ctx.textBaseline = 'alphabetic';
      etx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = i === 3 ? '#FDE68A' : '#FFFFFF';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(r.text, 130, r.y + 50);

      ctx.fillStyle = i === 3 ? '#F59E0B' : '#CBD5E1';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(r.sub, 130, r.y + 92);

      etx.textAlign = 'left';
      etx.fillStyle = i === 3 ? '#FBBF24' : '#DCEBFF';
      etx.font = 'bold 44px sans-serif';
      etx.fillText(r.text, 130, r.y + 50);

      // Direction arrow
      ctx.textBaseline = 'alphabetic';
      etx.textBaseline = 'alphabetic';
      ctx.textAlign = 'right';
      ctx.fillStyle = r.stripe;
      ctx.font = 'bold 58px sans-serif';
      ctx.fillText(r.arrow, w - 38, r.y + 66);
      etx.textAlign = 'right';
      etx.fillStyle = r.stripe;
      etx.font = 'bold 58px sans-serif';
      etx.fillText(r.arrow, w - 38, r.y + 66);
    }

    const mapTex = new THREE.CanvasTexture(cA);
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.anisotropy = 4;
    mapTex.needsUpdate = true;

    const emTex = new THREE.CanvasTexture(cE);
    emTex.colorSpace = THREE.SRGBColorSpace;
    emTex.anisotropy = 4;
    emTex.needsUpdate = true;

    station.disposableTextures.push(mapTex, emTex);
    const mat = new THREE.MeshStandardMaterial({
      map: mapTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: emTex,
      emissiveIntensity: 0.90,
      roughness: 0.34,
      metalness: 0.16
    });
    station.disposableMaterials.push(mat);
    return mat;
  }

  S.arch = {
    computeRailConfig: computeRailConfig,
    buildArchitecture: buildArchitecture,
    mergeStaticBuckets: mergeStaticBuckets,
    mergeStaticBucketsBatch: mergeStaticBucketsBatch
  };
})(window.LRT = window.LRT || {});
