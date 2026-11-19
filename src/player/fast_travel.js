(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const PL = (I.player = I.player || {});
  const C = LRT.Config;

  let pausedByFastTravel = false;
  let fastTravelFromPause = false;

  function getFastTravelStations() {
    if (C && Array.isArray(C.ARCHETYPES) && C.ARCHETYPES.length) return C.ARCHETYPES;
    if (LRT.CONFIG && Array.isArray(LRT.CONFIG.stations) && LRT.CONFIG.stations.length) return LRT.CONFIG.stations;
    return [
      { id: 'dukuh_atas', code: 'CB01 / BK01', name: 'Dukuh Atas BSI', layout: 'SIDE_DUAL_PLAZA', hasTerminusBuffer: true },
      { id: 'cawang', code: 'CB08 / BK08', name: 'Cawang Interchange', layout: 'CAWANG_HUB', hasFourTracks: true },
      { id: 'harjamukti', code: 'CB12 / BK14', name: 'Harjamukti', layout: 'ISLAND_DEPOT', hasGardenTerrace: true },
      { id: 'kuningan', code: 'CB04 / BK04', name: 'Kuningan', layout: 'SIDE_DUAL' },
      { id: 'cikoko', code: 'CB06 / BK06', name: 'Cikoko', layout: 'SIDE_DUAL', hasTollOverpass: true },
      { id: 'setiabudi', code: 'CB02 / BK02', name: 'Setiabudi', layout: 'ISLAND_CENTRAL' }
    ];
  }

  function getStationBadgeMeta(arch, idx) {
    const id = arch && arch.id ? arch.id : '';
    const map = {
      dukuh_atas: { district: 'Kawasan Sudirman · Dukuh Atas', badge: 'Terminus · Side-Dual' },
      cawang: { district: 'Simpang Cawang · MT Haryono', badge: '4-Track Interchange' },
      harjamukti: { district: 'Cibubur · Harjamukti Depot', badge: 'Elevated Garden' },
      kuningan: { district: 'HR Rasuna Said · Kuningan', badge: 'Side-Dual' },
      cikoko: { district: 'Cikoko · MT Haryono Tol', badge: 'Side-Dual' },
      setiabudi: { district: 'Setiabudi · Sudirman', badge: 'Terminus · Island' }
    };
    if (map[id]) return map[id];
    let badge = 'Side-Dual';
    if (arch && (arch.hasFourTracks || arch.layout === 'CAWANG_HUB')) badge = '4-Track Interchange';
    else if (arch && (arch.hasGardenTerrace || arch.layout === 'ISLAND_DEPOT')) badge = 'Elevated Garden';
    else if (arch && (arch.hasTerminusBuffer || idx === 0 || idx === 5)) badge = 'Terminus';
    return {
      district: (arch && arch.destinationHint) || 'Koridor Selatan LRT',
      badge
    };
  }

  function gatherAllWorldColliders() {
    const out = [];
    if (LRT.Station) {
      const sc = typeof LRT.Station.getColliders === 'function' ? LRT.Station.getColliders() : LRT.Station.colliders;
      if (Array.isArray(sc)) for (let i = 0; i < sc.length; i++) out.push(sc[i]);
    }
    if (LRT.City) {
      const cc = typeof LRT.City.getColliders === 'function' ? LRT.City.getColliders() : LRT.City.colliders;
      if (Array.isArray(cc)) for (let i = 0; i < cc.length; i++) out.push(cc[i]);
    }
    return out;
  }

  function findSupportFloorY(x, z, expectedY, colliders) {
    let bestY = null;
    let bestDiff = Infinity;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c || c.disabled || !c.isFloor) continue;
      if (x >= c.minX + 0.30 && x <= c.maxX - 0.30 && z >= c.minZ + 0.30 && z <= c.maxZ - 0.30) {
        const diff = Math.abs(c.maxY - expectedY);
        if (diff <= 0.75 && diff < bestDiff) {
          bestDiff = diff;
          bestY = c.maxY;
        }
      }
    }
    return bestY;
  }

  function isSpotFreeOfObstacles(x, floorY, z, colliders) {
    const r = 0.44;
    const lowY = floorY + 0.35;
    const highY = floorY + 1.62;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c || c.disabled || c.blocksWalk === false || c.isTrigger || c.isFloor) continue;
      if (c.isRamp) {
        if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ && c.maxY > floorY + 0.25 && c.minY < highY) {
          return false;
        }
        continue;
      }
      if (c.maxY <= lowY || c.minY >= highY) continue;
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
        return false;
      }
    }
    return true;
  }

  function resolveSafeCheckpointPosition(baseX, expectedFloorY, baseZ, yaw) {
    const colliders = gatherAllWorldColliders();
    if (!colliders.length) {
      return { x: baseX, y: expectedFloorY + 0.05, z: baseZ, yaw: yaw || 0 };
    }
    const offsets = [
      [0, 0],
      [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3],
      [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3],
      [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4],
      [2.4, 2.4], [-2.4, 2.4], [2.4, -2.4], [-2.4, -2.4],
      [3.8, 0], [-3.8, 0], [0, 3.8], [0, -3.8]
    ];
    for (let oi = 0; oi < offsets.length; oi++) {
      const tx = baseX + offsets[oi][0];
      const tz = baseZ + offsets[oi][1];
      const floorY = findSupportFloorY(tx, tz, expectedFloorY, colliders);
      if (floorY === null) continue;
      if (isSpotFreeOfObstacles(tx, floorY, tz, colliders)) {
        return { x: tx, y: floorY + 0.05, z: tz, yaw: yaw || 0 };
      }
    }
    for (let oi = 0; oi < offsets.length; oi++) {
      const tx = baseX + offsets[oi][0];
      const tz = baseZ + offsets[oi][1];
      if (isSpotFreeOfObstacles(tx, expectedFloorY, tz, colliders)) {
        return { x: tx, y: expectedFloorY + 0.05, z: tz, yaw: yaw || 0 };
      }
    }
    return { x: baseX, y: expectedFloorY + 0.05, z: baseZ, yaw: yaw || 0 };
  }

  function findInteractableById(list, id) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function computeFastTravelZones() {
    const stations = getFastTravelStations();
    const stIdx = (I.core && typeof I.core.stationIndex === 'number') ? I.core.stationIndex : 0;
    const st = LRT.Station;
    const ct = LRT.City;
    const ctx = (st && (st.ctx || st._layoutCtx)) || null;
    const arch = (ctx && ctx.arch) || (st && st._archetype) || stations[stIdx % stations.length] || {};
    const rail = (st && typeof st.getRailConfig === 'function')
      ? st.getRailConfig()
      : { isIsland: false, isCawang: false, track1X: 0.0, track2X: -4.70, p1MinX: 1.46, p1MaxX: 7.06, p2MinX: -11.36, p2MaxX: -6.16 };

    const isIsland = !!(ctx ? ctx.isIsland : rail.isIsland);
    const isCawang = !!(ctx ? ctx.isCawang : (rail.isCawang || arch.layout === 'CAWANG_HUB'));
    const p1MinX = (ctx && typeof ctx.p1MinX === 'number') ? ctx.p1MinX : (typeof rail.p1MinX === 'number' ? rail.p1MinX : 1.46);
    const p1MaxX = (ctx && typeof ctx.p1MaxX === 'number') ? ctx.p1MaxX : (typeof rail.p1MaxX === 'number' ? rail.p1MaxX : (isIsland ? 12.26 : 7.06));
    const p2MinX = (ctx && typeof ctx.p2MinX === 'number') ? ctx.p2MinX : (typeof rail.p2MinX === 'number' ? rail.p2MinX : -11.36);
    const p2MaxX = (ctx && typeof ctx.p2MaxX === 'number') ? ctx.p2MaxX : (typeof rail.p2MaxX === 'number' ? rail.p2MaxX : -6.16);
    const track2X = (ctx && typeof ctx.track2X === 'number') ? ctx.track2X : (typeof rail.track2X === 'number' ? rail.track2X : -4.70);

    const concMinX = (ctx && typeof ctx.concMinX === 'number') ? ctx.concMinX : p1MaxX;
    const concMaxX = (ctx && typeof ctx.concMaxX === 'number') ? ctx.concMaxX : (isIsland ? p1MaxX : concMinX + (arch.concourseWidth || 15.0));
    const concLen = (ctx && typeof ctx.concLen === 'number') ? ctx.concLen : Math.min(arch.concourseLen || 36.0, 48.0);
    const rawConcMin = arch.concourseEnd === 'south' ? Math.round(-concLen - 2)
      : (arch.concourseEnd === 'north' ? 2 : Math.round(-concLen * 0.5));
    const concMinZ = (ctx && typeof ctx.concMinZ === 'number') ? ctx.concMinZ : Math.max(-58, Math.min(58 - concLen, rawConcMin));
    const concMaxZ = (ctx && typeof ctx.concMaxZ === 'number') ? ctx.concMaxZ : (concMinZ + concLen);
    const concMidZ = (ctx && typeof ctx.concMidZ === 'number') ? ctx.concMidZ : ((concMinZ + concMaxZ) * 0.5);

    const jpoZ = (ctx && typeof ctx.jpoZ === 'number')
      ? ctx.jpoZ
      : (isCawang ? 0.0 : (arch.id === 'harjamukti' ? 24.0 : (arch.concourseEnd === 'north' ? 49.0 : (arch.concourseEnd === 'south' ? -49.0 : 34.0))));
    const hasJpo2 = !(arch.id === 'cikoko' || (ctx && ctx.jpo2Z === null));
    const jpo2Z = (ctx && typeof ctx.jpo2Z === 'number')
      ? ctx.jpo2Z
      : (hasJpo2 ? (isCawang ? 44.0 : (isIsland ? (jpoZ > 0 ? -38.0 : 38.0) : (jpoZ > 0 ? -34.0 : 34.0))) : null);

    const corridorMinX = (ctx && typeof ctx.corridorMinX === 'number')
      ? ctx.corridorMinX
      : (isIsland ? (isCawang ? -7.2 : (arch.hasDepotShed ? -6.2 : -2.4)) : (p2MinX - 0.2));
    const corridorMaxX = (ctx && typeof ctx.corridorMaxX === 'number')
      ? ctx.corridorMaxX
      : (isIsland
        ? (isCawang ? (track2X + 4.70 + 1.42 + 9.4) : Math.max(track2X + 2.4, arch.hasDepotShed ? p1MaxX + 10.0 : 0, arch.hasGardenTerrace ? track2X + 12.6 : 0))
        : (concMaxX + 0.2));

    const westInnerSwMinX = corridorMinX - 7.0;
    const westRoadMinX = westInnerSwMinX - 14.0;
    const westOuterSwMinX = westRoadMinX - 5.0;
    const westColRoadMaxX = westOuterSwMinX - 30.0;
    const westColRoadMinX = westColRoadMaxX - 10.0;

    const eastInnerSwMaxX = corridorMaxX + 7.0;
    const eastRoadMaxX = eastInnerSwMaxX + 14.0;
    const eastRoadCX = (eastInnerSwMaxX + eastRoadMaxX) * 0.5;
    const eastOuterSwMinX = eastRoadMaxX;
    const eastOuterSwMaxX = eastOuterSwMinX + 5.0;
    const eastColRoadMinX = eastOuterSwMaxX + 30.0;
    const eastColRoadMaxX = eastColRoadMinX + 10.0;

    const ctBounds = (ct && ct.layoutBounds) || null;
    const westColRoadCX = ctBounds
      ? ((ctBounds.westColRoadMinX + ctBounds.westColRoadMaxX) * 0.5)
      : ((westColRoadMinX + westColRoadMaxX) * 0.5);
    const eastRoadCXVal = ctBounds
      ? ((ctBounds.eastInnerSwMaxX + ctBounds.eastRoadMaxX) * 0.5)
      : eastRoadCX;
    const eastColRoadCX = ctBounds
      ? ((ctBounds.eastColRoadMinX + ctBounds.eastColRoadMaxX) * 0.5)
      : ((eastColRoadMinX + eastColRoadMaxX) * 0.5);

    const stItems = st ? (typeof st.getInteractables === 'function' ? st.getInteractables() : st.interactables) : null;
    const ctItems = ct ? (typeof ct.getInteractables === 'function' ? ct.getInteractables() : ct.interactables) : null;

    const indoChill = findInteractableById(stItems, 'indomaret_chiller');
    const jpo2Item = findInteractableById(stItems, 'jpo2_supply');
    const plnItem = findInteractableById(ctItems, 'city_pln_box');
    const nwItem = findInteractableById(ctItems, 'city_nw_medpost');
    const neItem = findInteractableById(ctItems, 'city_ne_depot');
    const swItem = findInteractableById(ctItems, 'city_sw_convoy');
    const seItem = findInteractableById(ctItems, 'city_se_warung');
    const hubs = (ct && ct.cornerHubs) || null;

    const directIndo = (ctx && ctx.indoWalkInPos) || (st && st.indoWalkInPos) || null;
    const indoPos = directIndo
      ? { x: directIndo.x, z: directIndo.z, yaw: typeof directIndo.yaw === 'number' ? directIndo.yaw : 0 }
      : (indoChill
        ? (isIsland
          ? { x: indoChill.x + 0.80, z: indoChill.z + 1.50, yaw: 0 }
          : { x: indoChill.x - 1.50, z: indoChill.z + 0.80, yaw: -Math.PI * 0.5 })
        : (isIsland
          ? { x: (p1MinX + p1MaxX) * 0.5, z: 16.2, yaw: 0 }
          : { x: concMinX + 5.2, z: concMidZ, yaw: -Math.PI * 0.5 }));

    const jpo1Pos = isIsland
      ? { x: p1MinX + 2.6, z: jpoZ, yaw: 0 }
      : { x: -2.0, z: jpoZ, yaw: 0 };

    const directJpo2 = (ctx && ctx.jpo2LoungePos) || (st && st.jpo2LoungePos) || null;
    const jpo2Pos = directJpo2
      ? { x: directJpo2.x, z: directJpo2.z, yaw: typeof directJpo2.yaw === 'number' ? directJpo2.yaw : (jpo2Z !== null && jpo2Z >= 0 ? Math.PI : 0) }
      : (jpo2Item && jpo2Z !== null
        ? { x: jpo2Item.x, z: jpo2Z, yaw: jpo2Z >= 0 ? Math.PI : 0 }
        : (hasJpo2 && jpo2Z !== null
          ? { x: isIsland ? (p1MinX + 2.6) : -2.2, z: jpo2Z, yaw: 0 }
          : { x: isIsland ? (p1MinX + 3.0) : (concMinX + 2.5), z: jpoZ, yaw: -Math.PI * 0.5 }));

    const plnPos = plnItem
      ? { x: plnItem.x - 1.6, z: plnItem.z + 2.0, yaw: -Math.PI * 0.5 }
      : { x: eastRoadCXVal + 4.5, z: -14.0, yaw: -Math.PI * 0.5 };

    const nwPos = (hubs && hubs.NW && typeof hubs.NW.x === 'number')
      ? { x: hubs.NW.x, z: hubs.NW.z, yaw: typeof hubs.NW.yaw === 'number' ? hubs.NW.yaw : Math.PI }
      : (nwItem
        ? { x: nwItem.x + 1.8, z: nwItem.z - 1.8, yaw: -Math.PI * 0.25 }
        : { x: westColRoadCX, z: 96.0, yaw: Math.PI });

    const nePos = (hubs && hubs.NE && typeof hubs.NE.x === 'number')
      ? { x: hubs.NE.x, z: hubs.NE.z, yaw: typeof hubs.NE.yaw === 'number' ? hubs.NE.yaw : Math.PI }
      : (neItem
        ? { x: neItem.x - 1.8, z: neItem.z - 1.8, yaw: Math.PI * 0.25 }
        : { x: eastColRoadCX, z: 96.0, yaw: Math.PI });

    const swPos = (hubs && hubs.SW && typeof hubs.SW.x === 'number')
      ? { x: hubs.SW.x, z: hubs.SW.z, yaw: typeof hubs.SW.yaw === 'number' ? hubs.SW.yaw : 0 }
      : (swItem
        ? { x: swItem.x + 1.8, z: swItem.z + 1.8, yaw: -Math.PI * 0.75 }
        : { x: westColRoadCX, z: -96.0, yaw: 0 });

    const sePos = (hubs && hubs.SE && typeof hubs.SE.x === 'number')
      ? { x: hubs.SE.x, z: hubs.SE.z, yaw: typeof hubs.SE.yaw === 'number' ? hubs.SE.yaw : 0 }
      : (seItem
        ? { x: seItem.x - 1.8, z: seItem.z + 1.8, yaw: Math.PI * 0.75 }
        : { x: eastColRoadCX, z: -96.0, yaw: 0 });

    const rawZones = [
      { id: 'zone_p1', num: '01', tag: 'Lantai 1 · Maju', name: 'Peron 1 (Jalur Maju)', x: p1MinX + 2.1, floorY: 0.0, z: -16.0, yaw: Math.PI * 0.5 },
      { id: 'zone_p2', num: '02', tag: 'Lantai 1 · Kembali', name: 'Peron 2 (Jalur Kembali)', x: isIsland ? (p1MaxX - 2.0) : (p2MaxX - 2.4), floorY: 0.0, z: -16.0, yaw: -Math.PI * 0.5 },
      { id: 'zone_conc', num: '03', tag: 'Lantai 1 · Plaza', name: 'Concourse & Indomaret Point', x: indoPos.x, floorY: 0.0, z: indoPos.z, yaw: indoPos.yaw },
      { id: 'zone_jpo1', num: '04', tag: 'Lantai 2 · Skybridge', name: 'JPO Utama (Lantai 2)', x: jpo1Pos.x, floorY: 4.25, z: jpo1Pos.z, yaw: jpo1Pos.yaw },
      { id: 'zone_jpo2', num: '05', tag: (hasJpo2 || directJpo2) ? 'Lantai 2 · Lounge' : 'Lantai 2 · Alt Balkon', name: 'JPO 2 Sekunder & Lounge', x: jpo2Pos.x, floorY: 4.25, z: jpo2Pos.z, yaw: jpo2Pos.yaw },
      { id: 'zone_street', num: '06', tag: 'Jalan Raya · Timur', name: 'Jalan Raya & Gerobak / PLN', x: plnPos.x, floorY: -0.82, z: plnPos.z, yaw: plnPos.yaw },
      { id: 'zone_nw', num: '07', tag: 'Pojok NW · Medis', name: 'Pojok NW — Posko Medis PMI', x: nwPos.x, floorY: -0.82, z: nwPos.z, yaw: nwPos.yaw },
      { id: 'zone_ne', num: '08', tag: 'Pojok NE · Gudang', name: 'Pojok NE — Gudang Logistik', x: nePos.x, floorY: -0.82, z: nePos.z, yaw: nePos.yaw },
      { id: 'zone_sw', num: '09', tag: 'Pojok SW · Militer', name: 'Pojok SW — Konvoi Militer', x: swPos.x, floorY: -0.82, z: swPos.z, yaw: swPos.yaw },
      { id: 'zone_se', num: '10', tag: 'Pojok SE · Warung', name: 'Pojok SE — Pos Ronda & Warung', x: sePos.x, floorY: -0.82, z: sePos.z, yaw: sePos.yaw }
    ];

    return rawZones.map((z) => {
      const safe = resolveSafeCheckpointPosition(z.x, z.floorY, z.z, z.yaw);
      return {
        id: z.id,
        num: z.num,
        tag: z.tag,
        name: z.name,
        floorY: z.floorY,
        x: safe.x,
        y: safe.y,
        z: safe.z,
        yaw: safe.yaw
      };
    });
  }

  function syncFastTravelAtmosphereUi(lightingKey) {
    const dom = PL.dom || {};
    const grp = dom['ft-atmos-group'];
    if (!grp) return;
    const rawKey = lightingKey || (I.core && I.core.currentLightingKey) || 'DAYLIGHT_CLEAR';
    const matchKey = rawKey === 'AMBER_SUNSET' ? 'GOLDEN_DUSK' : rawKey;
    grp.querySelectorAll('[data-ft-mood]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.ftMood === matchKey);
    });
  }

  function jumpToFastTravelStation(idx) {
    const dom = PL.dom || {};
    const stations = getFastTravelStations();
    const targetIdx = Math.max(0, Math.min(stations.length - 1, idx | 0));
    const wasFromPause = fastTravelFromPause || !!(dom['pause-overlay'] && !dom['pause-overlay'].classList.contains('hidden'));

    if (PL.state) PL.state.fastTravelOpen = false;
    if (dom['fast-travel-modal']) dom['fast-travel-modal'].classList.add('hidden');
    fastTravelFromPause = false;
    pausedByFastTravel = false;

    if (LRT.Director && typeof LRT.Director.jumpToStation === 'function') {
      LRT.Director.jumpToStation(targetIdx);
    } else if (I.core && typeof I.core.jumpToStation === 'function') {
      I.core.jumpToStation(targetIdx);
    } else if (window.__LRT_DEBUG__ && typeof window.__LRT_DEBUG__.jumpToStation === 'function') {
      window.__LRT_DEBUG__.jumpToStation(targetIdx);
    }

    if (wasFromPause && LRT.Main && typeof LRT.Main.resume === 'function') {
      LRT.Main.resume();
    } else {
      if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
      if (PL.showScreen) PL.showScreen('play');
      LRT.PlayerUI.setPaused(false, true);
      if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') LRT.Audio.setGameplayPaused(false);
      if (PL.relockAfterOverlay) PL.relockAfterOverlay();
      else if (PL.requestLock) PL.requestLock();
    }

    const targetArch = stations[targetIdx] || {};
    if (PL.setNotice) PL.setNotice(`FAST TRAVEL: ${String(targetArch.name || ('Stasiun ' + (targetIdx + 1))).toUpperCase()}`, '#22c55e');
    if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.65 });
  }

  function teleportToFastTravelZone(zone) {
    if (!zone) return;
    const core = I.core;
    const curIdx = (core && typeof core.stationIndex === 'number') ? core.stationIndex : 0;
    const gs = core ? core.gameState : null;
    const inTransit = gs === C.STATES.TRAIN_DEPARTING || gs === C.STATES.TRAIN_CRUISE || gs === C.STATES.TRAIN_ARRIVING;
    if (inTransit || (LRT.Station && !LRT.Station.rootGroup)) {
      if (LRT.Director && typeof LRT.Director.jumpToStation === 'function') {
        LRT.Director.jumpToStation(curIdx);
      } else if (window.__LRT_DEBUG__ && typeof window.__LRT_DEBUG__.jumpToStation === 'function') {
        window.__LRT_DEBUG__.jumpToStation(curIdx);
      }
    }

    if (PL.state && PL.state.isSitting && PL.standFromSeat) {
      PL.standFromSeat(true);
    }
    if (PL.state) {
      PL.state.isInsideTrain = false;
      PL.state.grounded = true;
    }

    const safe = resolveSafeCheckpointPosition(zone.x, zone.floorY, zone.z, zone.yaw);
    LRT.PlayerUI.setPosition(safe.x, safe.y, safe.z);
    if (typeof safe.yaw === 'number') {
      LRT.PlayerUI.setLook(safe.yaw, 0);
    }

    closeFastTravelModal(true, true, true);
    if (core && typeof core.updateCityVisibility === 'function') {
      core.updateCityVisibility(PL.state);
    }
    if (core && typeof core.updateSunTracking === 'function') {
      core.updateSunTracking(safe.x, safe.z);
    }
    if (core && typeof core.requestPausedRender === 'function') {
      core.requestPausedRender();
    } else if (core && typeof core.renderFrame === 'function') {
      core.renderFrame();
    }
    if (PL.setNotice) PL.setNotice(`FAST TRAVEL: ${String(zone.name).toUpperCase()}`, '#38bdf8');
    if (LRT.Audio) LRT.Audio.play('turnstile_beep', { gain: 0.55 });
  }

  function renderFastTravelModal() {
    const dom = PL.dom || {};
    const stations = getFastTravelStations();
    const core = I.core;
    const curIdx = (core && typeof core.stationIndex === 'number') ? core.stationIndex : 0;
    const curArch = stations[curIdx % stations.length] || {};

    if (dom['ft-active-meta']) {
      const p = PL.state && PL.state.pos ? PL.state.pos : { x: 0, y: 0, z: 0 };
      dom['ft-active-meta'].textContent =
        `Stasiun Aktif: ${curArch.name || 'Dukuh Atas BSI'} (${curArch.code || 'CB01'}) · Pos (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
    }
    if (dom['ft-zones-sub']) {
      dom['ft-zones-sub'].textContent = `Zona aman untuk ${curArch.name || 'Stasiun Aktif'}`;
    }

    const stListEl = dom['ft-station-list'];
    if (stListEl) {
      stListEl.innerHTML = '';
      for (let i = 0; i < stations.length; i++) {
        const arch = stations[i];
        const meta = getStationBadgeMeta(arch, i);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ft-station-card' + (i === curIdx ? ' is-active' : '');
        btn.dataset.stationIdx = String(i);

        const top = document.createElement('div');
        top.className = 'ft-st-top';
        const codeEl = document.createElement('span');
        codeEl.className = 'ft-st-code';
        codeEl.textContent = `0${i + 1} · ${arch.code || ''}`;
        const badgeEl = document.createElement('span');
        badgeEl.className = 'ft-st-badge';
        badgeEl.textContent = i === curIdx ? `${meta.badge} · AKTIF` : meta.badge;
        top.appendChild(codeEl);
        top.appendChild(badgeEl);

        const nameEl = document.createElement('div');
        nameEl.className = 'ft-st-name';
        nameEl.textContent = arch.name || `Stasiun ${i + 1}`;

        const distEl = document.createElement('div');
        distEl.className = 'ft-st-district';
        distEl.textContent = meta.district;

        btn.appendChild(top);
        btn.appendChild(nameEl);
        btn.appendChild(distEl);
        btn.addEventListener('click', () => jumpToFastTravelStation(i));
        stListEl.appendChild(btn);
      }
    }

    const zoneGridEl = dom['ft-zone-grid'];
    if (zoneGridEl) {
      zoneGridEl.innerHTML = '';
      const zones = computeFastTravelZones();
      for (let zi = 0; zi < zones.length; zi++) {
        const z = zones[zi];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ft-zone-card';
        btn.dataset.zoneId = z.id;

        const head = document.createElement('div');
        head.className = 'ft-zone-head';
        const numEl = document.createElement('span');
        numEl.className = 'ft-zone-num';
        numEl.textContent = z.num;
        const tagEl = document.createElement('span');
        tagEl.className = 'ft-zone-tag';
        tagEl.textContent = z.tag;
        head.appendChild(numEl);
        head.appendChild(tagEl);

        const nameEl = document.createElement('div');
        nameEl.className = 'ft-zone-name';
        nameEl.textContent = z.name;

        const coordEl = document.createElement('div');
        coordEl.className = 'ft-zone-coords';
        coordEl.textContent = `X ${z.x.toFixed(1)} · Y ${z.y.toFixed(1)} · Z ${z.z.toFixed(1)}`;

        btn.appendChild(head);
        btn.appendChild(nameEl);
        btn.appendChild(coordEl);
        btn.addEventListener('click', () => teleportToFastTravelZone(z));
        zoneGridEl.appendChild(btn);
      }
    }

    syncFastTravelAtmosphereUi();
  }

  function syncFastTravelAvailability() {
    const dom = PL.dom || {};
    const unlocked = !!(PL.isFastTravelUnlocked && PL.isFastTravelUnlocked());
    if (dom['btn-pause-fast-travel']) {
      dom['btn-pause-fast-travel'].classList.toggle('hidden', !unlocked);
    }
    if (dom['pill-fast-travel']) {
      dom['pill-fast-travel'].classList.toggle('hidden', !unlocked);
    }
    return unlocked;
  }

  function openFastTravelModal(opts) {
    if (!syncFastTravelAvailability()) return false;
    const dom = PL.dom || {};
    const o = opts || {};
    const modal = dom['fast-travel-modal'];
    if (!modal) return false;
    const gs = I.core ? I.core.gameState : null;
    if (gs === C.STATES.MENU || gs === C.STATES.GAME_OVER) return false;
    if (PL.state && PL.state.fastTravelOpen) return true;

    if (PL.closeCheatConsole) PL.closeCheatConsole(false);
    const wasPausedByDoc = !!(PL.isPausedByDocViewer && PL.isPausedByDocViewer());
    if (PL.state && PL.state.docViewerOpen && PL.closeDocViewer) PL.closeDocViewer(false, true);

    const pauseOpen = !!(o.fromPause || (dom['pause-overlay'] && !dom['pause-overlay'].classList.contains('hidden')));
    fastTravelFromPause = pauseOpen;
    if (!fastTravelFromPause) {
      pausedByFastTravel = !PL.flags.paused || wasPausedByDoc;
      if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
      LRT.PlayerUI.setPaused(true, false);
      if (PL.callbacks && PL.callbacks.onWeaponShootUp) PL.callbacks.onWeaponShootUp();
      if (PL.releaseLock) PL.releaseLock();
    } else {
      pausedByFastTravel = false;
    }

    if (PL.state) PL.state.fastTravelOpen = true;
    renderFastTravelModal();
    modal.classList.remove('hidden');
    if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') {
      LRT.Audio.setGameplayPaused(true);
    }
    return true;
  }

  function closeFastTravelModal(refocusGame, silent, forceExitPause) {
    const dom = PL.dom || {};
    const modal = dom['fast-travel-modal'];
    const wasOpen = !!(PL.state && PL.state.fastTravelOpen);
    if (PL.state) PL.state.fastTravelOpen = false;
    if (modal) modal.classList.add('hidden');

    const fromPause = fastTravelFromPause;
    const shouldUnpause = pausedByFastTravel;
    fastTravelFromPause = false;
    pausedByFastTravel = false;

    if (!wasOpen && !forceExitPause) return false;
    for (const k of Object.keys(PL.keys)) PL.keys[k] = false;

    if (forceExitPause) {
      if (fromPause || (dom['pause-overlay'] && !dom['pause-overlay'].classList.contains('hidden'))) {
        if (LRT.Main && typeof LRT.Main.resume === 'function') {
          LRT.Main.resume();
          return true;
        }
        if (PL.showScreen) PL.showScreen('play');
        LRT.PlayerUI.setPaused(false, true);
        if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') LRT.Audio.setGameplayPaused(false);
      } else if (shouldUnpause) {
        if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
        LRT.PlayerUI.setPaused(false, true);
        if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') LRT.Audio.setGameplayPaused(false);
      }
      if (refocusGame !== false && PL.flags.allowActionInput && !PL.flags.paused) {
        if (PL.relockAfterOverlay) PL.relockAfterOverlay();
        else if (PL.requestLock) PL.requestLock();
      }
      return true;
    }

    if (!fromPause) {
      if (shouldUnpause) {
        if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
        LRT.PlayerUI.setPaused(false, true);
      }
      const pauseHidden = !dom['pause-overlay'] || dom['pause-overlay'].classList.contains('hidden');
      if (pauseHidden && LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') {
        LRT.Audio.setGameplayPaused(false);
      }
      if (refocusGame !== false && PL.flags.allowActionInput && !PL.flags.paused) {
        if (PL.relockAfterOverlay) PL.relockAfterOverlay();
        else if (PL.requestLock) PL.requestLock();
      }
    }
    if (!silent && LRT.Audio && (!LRT.Audio.isGameplayPaused || !LRT.Audio.isGameplayPaused())) {
      LRT.Audio.play('turnstile_beep', { gain: 0.30 });
    }
    return true;
  }

  PL.syncFastTravelAtmosphereUi = syncFastTravelAtmosphereUi;
  PL.renderFastTravelModal = renderFastTravelModal;
  PL.syncFastTravelAvailability = syncFastTravelAvailability;
  PL.openFastTravelModal = openFastTravelModal;
  PL.closeFastTravelModal = closeFastTravelModal;
})(window.LRT = window.LRT || {});
