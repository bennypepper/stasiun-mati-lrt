(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const CORE = (I.core = I.core || {});

  const C = LRT.Config;
  const STATES = C.STATES;
  const MODES = C.MODES;

  CORE.gameMode = MODES.SURVIVAL;
  CORE.campaignSeed = 4207;
  CORE.stationIndex = 0;
  CORE.activeTravelDir = 1;
  CORE.currentWave = 1;
  CORE.wavesPerStation = 1;
  CORE.waveClearTimer = 0;
  CORE.boardingCloseTimer = 0;
  CORE.rideCompleteReady = false;
  CORE.stationsCleared = 0;
  CORE.totalKills = 0;
  CORE.enemySightTimer = 0;
  CORE.victoryCruiseTimer = 0;
  CORE.prevTrainState = 'AWAY';
  CORE.atmosphereMode = 'night_horror';

  const CAMPAIGN_MOODS = [
    'GOLDEN_DUSK',          // 0: Dukuh Atas BSI (Sunset)
    'HAZY_DUSK',            // 1: Cawang Interchange (Blue-Hour Twilight)
    'BLACKOUT_EMERGENCY',   // 2: Harjamukti (Blackout Night)
    'MONSOON_OVERCAST',     // 3: Kuningan (Monsoon Night)
    'TOXIC_SMOG',           // 4: Cikoko (Toxic Spore Night)
    'CRIMSON_BLOOD_MOON'    // 5: Setiabudi (Crimson Blood Moon)
  ];

  const FALLBACK_CAMPAIGN_MOODS_DAYLIGHT = [
    'DAYLIGHT_CLEAR',
    'DAYLIGHT_OVERCAST',
    'DAYLIGHT_CLEAR',
    'DAYLIGHT_OVERCAST',
    'GOLDEN_DUSK',
    'AMBER_SUNSET'
  ];

  function getActiveCampaignMoods() {
    if (CORE.atmosphereMode === 'daylight_outbreak') {
      return (C.CAMPAIGN_MOODS_DAYLIGHT && C.CAMPAIGN_MOODS_DAYLIGHT.length)
        ? C.CAMPAIGN_MOODS_DAYLIGHT
        : FALLBACK_CAMPAIGN_MOODS_DAYLIGHT;
    }
    return CAMPAIGN_MOODS;
  }

  function getCampaignMoodForStation(idx) {
    const moods = getActiveCampaignMoods();
    const i = ((idx | 0) % 6 + 6) % 6;
    return moods[i % moods.length] || 'GOLDEN_DUSK';
  }

  function getAtmosphereMode() {
    return CORE.atmosphereMode === 'daylight_outbreak' ? 'daylight_outbreak' : 'night_horror';
  }

  function setAtmosphereMode(mode) {
    const nextMode = mode === 'daylight_outbreak' ? 'daylight_outbreak' : 'night_horror';
    const prevMode = CORE.atmosphereMode;
    CORE.atmosphereMode = nextMode;
    if (LRT.Enemies && typeof LRT.Enemies.setAtmosphereMode === 'function') {
      LRT.Enemies.setAtmosphereMode(nextMode);
    }
    if (prevMode !== nextMode) {
      CORE.isMoodLerping = false;
      CORE._rideFromMoodKey = null;
      CORE._rideToMoodKey = null;
      if (!CORE.lightingLockedByUser && CORE.gameState !== STATES.MENU && CORE.gameMode === MODES.SURVIVAL && typeof CORE.applyMoodLighting === 'function') {
        const targetMoodKey = getCampaignMoodForStation(CORE.stationIndex || 0);
        const stAtmos = (LRT.Station && typeof LRT.Station.getAtmosphere === 'function') ? LRT.Station.getAtmosphere() : null;
        const stStats = (LRT.Station && typeof LRT.Station.getStats === 'function') ? LRT.Station.getStats() : null;
        CORE.currentLightingKey = targetMoodKey;
        CORE.applyMoodLighting(stStats, stAtmos ? { ...stAtmos, moodKey: targetMoodKey } : { moodKey: targetMoodKey });
      }
    }
    return nextMode;
  }

  const campaignState = {
    stationUsedIds: new Map(),
    clearedStations: new Set(),
    visitedStations: new Set([0]),
    triggeredSurgeStations: new Set(),
    stationObjectives: {
      0: { genOn: false, waveCleared: false },
      1: { fuseFound: false, waveCleared: false },
      2: { vaxFound: false, depotDone: false, waveCleared: false },
      3: { plnDone: false, waveCleared: false },
      4: { barricadeCleared: false, waveCleared: false },
      5: { relays: { totem: false, pln: false, jpo: false }, waveCleared: false, omegaActive: false, holdoutElapsed: 0 }
    },
    voTriggered: new Set(),
    collectedLogs: [],
    campaignVictory: false,
    firstBarrelExploded: false,
    barrelCueActive: false,
    trainCallActive: false,
    trainCallWaitElapsed: 0,
    trainCallTrickleStage: 0
  };

  const _spawnEyePos = new THREE.Vector3();
  const _spawnCamFwd = new THREE.Vector3();
  const _spawnCandDir = new THREE.Vector3();

  function resetCampaignState() {
    campaignState.stationUsedIds.clear();
    campaignState.clearedStations.clear();
    campaignState.visitedStations.clear();
    campaignState.visitedStations.add(0);
    campaignState.triggeredSurgeStations.clear();
    campaignState.stationObjectives = {
      0: { genOn: false, waveCleared: false },
      1: { fuseFound: false, waveCleared: false },
      2: { vaxFound: false, depotDone: false, waveCleared: false },
      3: { plnDone: false, waveCleared: false },
      4: { barricadeCleared: false, waveCleared: false },
      5: { relays: { totem: false, pln: false, jpo: false }, waveCleared: false, omegaActive: false, holdoutElapsed: 0 }
    };
    campaignState.voTriggered.clear();
    campaignState.collectedLogs.length = 0;
    campaignState.campaignVictory = false;
    campaignState.firstBarrelExploded = false;
    campaignState.barrelCueActive = false;
    campaignState.trainCallActive = false;
    campaignState.trainCallWaitElapsed = 0;
    campaignState.trainCallTrickleStage = 0;
    if (LRT.Station && typeof LRT.Station.setBarrelCueActive === 'function') {
      LRT.Station.setBarrelCueActive(false);
    }
  }

  CORE.recordFieldLog = function (title, body) {
    if (!title && !body) return;
    const key = String(title || '').trim();
    if (!key) return;
    if (!campaignState.collectedLogs.some((l) => l.title === key)) {
      campaignState.collectedLogs.push({
        title: key,
        body: String(body || ''),
        stationIndex: CORE.stationIndex
      });
    }
  };

  CORE.onCikokoBarricadeCleared = function () {
    if (campaignState.stationObjectives[4]) {
      campaignState.stationObjectives[4].barricadeCleared = true;
    }
    if (CORE.stationIndex === 4) {
      triggerObjectiveSurgeWave(4);
      if (isStationPrimaryObjectiveComplete(4) && getWaveRemainingCountSafe() === 0) {
        campaignState.clearedStations.add(CORE.stationIndex);
      }
    }
  };

  CORE.onBarrelExploded = function () {
    campaignState.firstBarrelExploded = true;
    campaignState.barrelCueActive = false;
    if (LRT.Station && typeof LRT.Station.setBarrelCueActive === 'function') {
      LRT.Station.setBarrelCueActive(false);
    }
  };

  function saveCurrentStationUsedIds() {
    let existing = campaignState.stationUsedIds.get(CORE.stationIndex);
    if (!existing) {
      existing = new Set();
      campaignState.stationUsedIds.set(CORE.stationIndex, existing);
    }
    if (LRT.Station && typeof LRT.Station.getUsedIds === 'function') {
      const sIds = LRT.Station.getUsedIds();
      for (let i = 0; i < sIds.length; i++) existing.add(sIds[i]);
    }
    if (LRT.City && typeof LRT.City.getUsedIds === 'function') {
      const cIds = LRT.City.getUsedIds();
      for (let i = 0; i < cIds.length; i++) existing.add(cIds[i]);
    }
  }

  function resetGameOverDom() {
    if (!LRT.PlayerUI) return;
    const dom = LRT.PlayerUI.getDom ? LRT.PlayerUI.getDom() : null;
    const ov = dom ? dom['gameover-overlay'] : document.getElementById('gameover-overlay');
    if (ov) {
      const kicker = ov.querySelector('.zenith-kicker');
      const title = ov.querySelector('.zenith-title');
      if (kicker) kicker.textContent = 'JALUR TERPUTUS';
      if (title) title.textContent = 'OVERRUN AT STATION';
    }
  }

  function triggerExtractionVictory() {
    if (campaignState.campaignVictory) return;
    campaignState.campaignVictory = true;
    if (campaignState.stationObjectives[5]) {
      campaignState.stationObjectives[5].waveCleared = true;
    }
    campaignState.clearedStations.add(5);
    campaignState.voTriggered.add('VO_21_VICTORY');

    if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
      LRT.Audio.playVoice('VO_21_VICTORY', { force: true });
    }
    if (LRT.Audio && typeof LRT.Audio.stopAllLoops === 'function') {
      LRT.Audio.stopAllLoops();
    }

    if (LRT.PlayerUI) {
      LRT.PlayerUI.setPaused(true, false);
      LRT.PlayerUI.releaseLock();
      const dom = LRT.PlayerUI.getDom ? LRT.PlayerUI.getDom() : null;
      const ov = dom ? dom['gameover-overlay'] : document.getElementById('gameover-overlay');
      if (ov) {
        const kicker = ov.querySelector('.zenith-kicker');
        const title = ov.querySelector('.zenith-title');
        const stats = dom ? dom['gameover-stats'] : document.getElementById('gameover-stats');
        if (kicker) kicker.textContent = 'EVAKUASI BERHASIL';
        if (title) title.textContent = 'EXTRACTION COMPLETE';
        if (stats) stats.textContent = `All 6 Stations Cleared, Spore Vaccine Secured, Infected Eliminated: ${CORE.totalKills}`;
      }
      LRT.PlayerUI.showScreen('gameover');
    }
  }

  function checkSetiabudiRelays() {
    const s5 = campaignState.stationObjectives[5];
    if (!s5 || !s5.relays) return;
    if (s5.relays.totem && s5.relays.pln && s5.relays.jpo) {
      s5.omegaActive = true;
      if (!campaignState.voTriggered.has('VO_19_FINAL_WAVE')) {
        campaignState.voTriggered.add('VO_19_FINAL_WAVE');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_19_FINAL_WAVE');
        }
      }
      if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
        LRT.PlayerUI.setNotice('SEMUA 3 RELAI TERHUBUNG — OMEGA SWARM MENDEKAT!', '#ef4444');
      }
    }
  }

  function getWaveRemainingCountSafe() {
    if (!LRT.Enemies) return 0;
    if (typeof LRT.Enemies.getWaveRemainingCount === 'function') {
      return LRT.Enemies.getWaveRemainingCount();
    }
    if (typeof LRT.Enemies.getAliveCount === 'function') {
      return LRT.Enemies.getAliveCount();
    }
    return 0;
  }

  function applyLootboxPayload(roll, noticePrefix) {
    if (!roll) return;
    if (roll.armorGranted > 0 && LRT.PlayerUI && typeof LRT.PlayerUI.addArmor === 'function') {
      LRT.PlayerUI.addArmor(roll.armorGranted, roll.maxArmor || 100);
    }
    if (roll.hpGranted > 0 && LRT.PlayerUI && typeof LRT.PlayerUI.heal === 'function') {
      LRT.PlayerUI.heal(roll.hpGranted);
    }
    if (roll.summaryText && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
      const msg = noticePrefix ? `${noticePrefix}${roll.summaryText}` : roll.summaryText;
      LRT.PlayerUI.setNotice(msg, roll.colorHex || '#e0b422');
    }
  }

  function pickDifficultyVariant(diffKey, allowScreamer) {
    const tier = (C.DIFFICULTY_TIERS && C.DIFFICULTY_TIERS[diffKey]) || (C.DIFFICULTY_TIERS && C.DIFFICULTY_TIERS.medium);
    const mix = (tier && tier.variantMix) || { walker: 0.54, runner: 0.26, spitter: 0.10, brute: 0.06, screamer: 0.04 };
    const r = Math.random();
    let acc = mix.walker || 0.5;
    if (r < acc) return 'walker';
    acc += mix.runner || 0.25;
    if (r < acc) return 'runner';
    acc += mix.spitter || 0.10;
    if (r < acc) return 'spitter';
    acc += mix.brute || 0.06;
    if (r < acc) return 'brute';
    return allowScreamer ? 'screamer' : 'runner';
  }

  const TRAIN_CALL_CONCEALED_ZONES = [
    'concealed_station', 'stairwell_pocket', 'concourse',
    'platform_south', 'platform_north', 'jpo', 'depot', 'garden',
    'island_far', 'plat2', 'balcony', 'island2'
  ];

  function gatherClusterSpawnNodes(preferredZones, opts) {
    const allNodes = [];
    if (LRT.Station && typeof LRT.Station.getSpawnNodes === 'function') {
      const sn = LRT.Station.getSpawnNodes();
      if (Array.isArray(sn)) {
        for (let i = 0; i < sn.length; i++) allNodes.push(sn[i]);
      }
    }
    if (LRT.Station && typeof LRT.Station.getNavGraph === 'function') {
      const ng = LRT.Station.getNavGraph();
      if (ng && Array.isArray(ng.nodes)) {
        for (let i = 0; i < ng.nodes.length; i++) allNodes.push(ng.nodes[i]);
      }
    }

    const pState = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') ? LRT.PlayerUI.getState() : null;
    const pPos = pState ? pState.pos : null;
    const zoneSet = Array.isArray(preferredZones) && preferredZones.length ? new Set(preferredZones) : null;
    const o = opts || {};
    const useHiddenClose = !!(o.requireHidden || o.preferClose);
    const minDist = o.minDist !== undefined ? o.minDist : (useHiddenClose ? 12.0 : 7.0);
    const maxDist = o.maxDist !== undefined ? o.maxDist : 34.0;

    let hasCam = false;
    if (useHiddenClose && pPos) {
      const cam = (LRT.PlayerUI && typeof LRT.PlayerUI.getCamera === 'function') ? LRT.PlayerUI.getCamera() : null;
      if (cam) {
        cam.getWorldPosition(_spawnEyePos);
        if (typeof cam.getWorldDirection === 'function') {
          cam.getWorldDirection(_spawnCamFwd);
        } else {
          _spawnCamFwd.setFromMatrixColumn(cam.matrixWorld, 2).multiplyScalar(-1).normalize();
        }
        hasCam = _spawnCamFwd.lengthSq() > 1e-6;
      } else {
        _spawnEyePos.set(pPos.x, (pPos.y || 0) + 1.6, pPos.z);
        const yaw = typeof pState.yaw === 'number' ? pState.yaw : 0;
        _spawnCamFwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
        hasCam = true;
      }
    }

    const checkTrainInside = LRT.Train && typeof LRT.Train.isPlayerInside === 'function';
    const hasStationRay = LRT.Station && typeof LRT.Station.raycastWorld === 'function';
    const hasTrainRay = LRT.Train && typeof LRT.Train.raycastTrain === 'function';

    const tier1 = []; // preferred zone + 12..34m + out-of-sight/occluded
    const tier2 = []; // non-crossing station + 12..34m + out-of-sight/occluded
    const tier3 = []; // preferred zone + relaxed range (9..44m) + occluded or edge FOV
    const preferred = [];
    const fallback = [];

    for (let i = 0; i < allNodes.length; i++) {
      const n = allNodes[i];
      if (!n || typeof n.x !== 'number' || typeof n.z !== 'number') continue;
      const ny = n.y !== undefined ? n.y : 0.0;
      if (checkTrainInside && LRT.Train.isPlayerInside({ x: n.x, y: ny + 0.8, z: n.z })) continue;

      const dh = pPos ? Math.hypot(n.x - pPos.x, n.z - pPos.z) : 20.0;
      if (dh < (useHiddenClose ? 9.0 : minDist)) continue;

      const tag = String(n.zone || n.tag || '').toLowerCase();
      const inPref = !!(zoneSet && zoneSet.has(tag));
      const isCrossing = tag.indexOf('crossing') === 0 || tag.indexOf('street') === 0;

      if (useHiddenClose && pPos && hasCam) {
        _spawnCandDir.set(n.x - _spawnEyePos.x, (ny + 1.35) - _spawnEyePos.y, n.z - _spawnEyePos.z);
        const d3 = _spawnCandDir.length();
        let dot = -1.0;
        let losOccluded = false;
        if (d3 > 0.2) {
          _spawnCandDir.divideScalar(d3);
          dot = _spawnCandDir.dot(_spawnCamFwd);
          if (hasStationRay && d3 > 0.6) {
            if (LRT.Station.raycastWorld(_spawnEyePos, _spawnCandDir, d3 - 0.45)) losOccluded = true;
          }
          if (!losOccluded && hasTrainRay && d3 > 0.6) {
            if (LRT.Train.raycastTrain(_spawnEyePos, _spawnCandDir, d3 - 0.45)) losOccluded = true;
          }
        }
        const inViewCone = dot > 0.36;
        const isHidden = !inViewCone || losOccluded;
        const score = Math.abs(dh - 20.0) + (tag === 'concealed_station' || tag === 'stairwell_pocket' ? -4.0 : 0.0);

        if (dh >= minDist && dh <= maxDist && isHidden) {
          if (inPref) {
            tier1.push({ node: n, score });
            continue;
          }
          if (!isCrossing) {
            tier2.push({ node: n, score });
            continue;
          }
        }
        if (dh <= maxDist + 10.0 && (losOccluded || dot <= 0.55) && inPref) {
          tier3.push({ node: n, score });
          continue;
        }
      }

      if (inPref) preferred.push(n);
      else fallback.push(n);
    }

    if (useHiddenClose) {
      const chosen = tier1.length > 0 ? tier1 : (tier2.length > 0 ? tier2 : (tier3.length > 0 ? tier3 : null));
      if (chosen) {
        chosen.sort((a, b) => a.score - b.score);
        return chosen.map((c) => c.node);
      }
    }
    if (preferred.length > 0) return preferred;
    if (fallback.length > 0) return fallback;
    return [
      { x: 3.4, y: 0.0, z: -26.0 },
      { x: 3.4, y: 0.0, z: 26.0 },
      { x: 14.0, y: 0.0, z: -22.0 },
      { x: 14.0, y: 0.0, z: 22.0 }
    ];
  }

  function spawnExtraInfectedCluster(variants, preferredZones, opts) {
    if (!LRT.Enemies || typeof LRT.Enemies.spawnOneZombie !== 'function') return 0;
    const nodes = gatherClusterSpawnNodes(preferredZones, opts);
    const spreadCount = (opts && opts.preferClose) ? Math.min(nodes.length, Math.max(variants.length, 6)) : nodes.length;
    const grid = (LRT.Station && typeof LRT.Station.getSpatialGrid === 'function') ? LRT.Station.getSpatialGrid() : null;
    let spawned = 0;
    for (let i = 0; i < variants.length; i++) {
      const n = nodes[i % spreadCount];
      const ny = n.y !== undefined ? n.y : 0.0;
      const jitterRange = (opts && opts.preferClose) ? 0.7 : 1.4;
      let px = n.x + (Math.random() - 0.5) * jitterRange;
      let pz = n.z + (Math.random() - 0.5) * jitterRange;
      if (grid && typeof grid.queryPoint === 'function') {
        const near = grid.queryPoint(px, pz, 0.5);
        for (let k = 0; k < near.length; k++) {
          const b = near[k];
          if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isFloor || b.isRamp || b.isTrigger) continue;
          if (b.maxY <= ny + 0.1 || b.minY >= ny + 1.8) continue;
          if (px + 0.4 > b.minX && px - 0.4 < b.maxX && pz + 0.4 > b.minZ && pz - 0.4 < b.maxZ) {
            px = n.x;
            pz = n.z;
            break;
          }
        }
      }
      if (LRT.Enemies.spawnOneZombie(variants[i], { x: px, y: ny, z: pz }, { isRoamer: false, aggroState: 'CHASE', diffKey: CORE.difficultyKey })) {
        spawned++;
      }
    }
    return spawned;
  }

  function triggerObjectiveSurgeWave(stationIdx) {
    if (CORE.tutorialActive) return 0;
    if (CORE.gameMode !== MODES.SURVIVAL) return 0;
    if (CORE.difficultyKey !== 'hard' && CORE.difficultyKey !== 'nightmare') return 0;
    if (campaignState.triggeredSurgeStations.has(stationIdx)) return 0;
    campaignState.triggeredSurgeStations.add(stationIdx);

    const w = Math.max(1, CORE.currentWave);
    const s = Math.max(0, stationIdx);
    const nBase = w === 1 ? 6 : (w === 2 ? 9 + (s >= 1 ? 1 : 0) + (s >= 2 ? 1 : 0) : (w === 3 ? 14 : Math.min(34, 10 + 3 * w + s)));
    const tier = (C.DIFFICULTY_TIERS && C.DIFFICULTY_TIERS[CORE.difficultyKey]) || { waveCountMult: 1.35 };
    const nWave = Math.max(4, Math.round(nBase * (tier.waveCountMult || 1.0)));
    const surgeCount = Math.max(3, Math.round(0.55 * nWave));

    const variants = [];
    for (let i = 0; i < surgeCount; i++) {
      variants.push(pickDifficultyVariant(CORE.difficultyKey, s >= 1 || CORE.difficultyKey === 'nightmare'));
    }
    if (variants.length >= 2 && !variants.includes('runner')) variants[0] = 'runner';
    if (variants.length >= 4 && s >= 1 && !variants.includes('brute')) variants[1] = 'brute';

    const spawned = spawnExtraInfectedCluster(variants, ['platform_south', 'platform_north', 'crossing_south', 'crossing_north']);
    if (spawned > 0) {
      if (LRT.Audio) LRT.Audio.play('zombie_groan_1', { gain: 0.75 });
      if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
        LRT.PlayerUI.setNotice('OBJECTIVE SURGE — INFECTED INCOMING!', '#f97316');
      }
    }
    return spawned;
  }

  function buildTrainCallSiegeVariants(diffKey, stationIdx, isReinforcement) {
    const s = Math.max(0, stationIdx);
    const dk = diffKey || CORE.difficultyKey || 'medium';
    const variants = [];
    if (isReinforcement) {
      let count = 2;
      if (dk === 'easy') count = 2;
      else if (dk === 'medium') count = 3;
      else if (dk === 'hard') count = 3 + (s >= 2 ? 1 : 0);
      else count = 4 + (s >= 2 ? 1 : 0);

      if (dk !== 'easy') variants.push('runner');
      if (dk === 'nightmare' && s >= 1) variants.push('screamer');
      while (variants.length < count) {
        variants.push(pickDifficultyVariant(dk, dk === 'hard' || dk === 'nightmare' || s >= 1));
      }
      return variants;
    }

    let count = 5;
    if (dk === 'easy') {
      count = 3 + Math.min(2, Math.floor(s / 2));
      if (s >= 1) variants.push('runner');
      if (s >= 3) variants.push('spitter');
    } else if (dk === 'medium') {
      count = 5 + Math.min(3, Math.floor((s + 1) / 2));
      variants.push('runner');
      if (s >= 1) variants.push('runner');
      if (s >= 2) variants.push('spitter');
    } else if (dk === 'hard') {
      count = 6 + s;
      variants.push('runner', 'runner');
      if (s >= 1) variants.push('screamer', 'brute');
      else variants.push('spitter');
    } else {
      count = 8 + s;
      variants.push('runner', 'runner', 'screamer');
      if (s >= 1) variants.push('brute');
      else variants.push('spitter');
    }
    while (variants.length < count) {
      variants.push(pickDifficultyVariant(dk, s >= 1 || dk === 'hard' || dk === 'nightmare'));
    }
    return variants;
  }

  function triggerTrainCallSiegeWave(stationIdx) {
    if (CORE.tutorialActive) return 0;
    if (CORE.gameMode !== MODES.SURVIVAL) return 0;
    const variants = buildTrainCallSiegeVariants(CORE.difficultyKey, stationIdx, false);
    const spawned = spawnExtraInfectedCluster(variants, TRAIN_CALL_CONCEALED_ZONES, {
      minDist: 12.0,
      maxDist: 34.0,
      requireHidden: true,
      preferClose: true
    });
    if (spawned > 0) {
      if (LRT.Audio) LRT.Audio.play('zombie_groan_2', { gain: 0.82 });
      if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
        LRT.PlayerUI.setNotice('TAHAN PERON — GEROMBOLAN INFECTED MENDEKAT!', '#f97316');
      }
    }
    return spawned;
  }

  function triggerTrainCallReinforcementTrickle(stationIdx, stage) {
    if (CORE.tutorialActive) return 0;
    if (CORE.gameMode !== MODES.SURVIVAL) return 0;
    const variants = buildTrainCallSiegeVariants(CORE.difficultyKey, stationIdx, true);
    if (stage >= 2 && variants.length > 2) variants.length = 2;
    const spawned = spawnExtraInfectedCluster(variants, TRAIN_CALL_CONCEALED_ZONES, {
      minDist: 12.0,
      maxDist: 34.0,
      requireHidden: true,
      preferClose: true
    });
    if (spawned > 0) {
      if (LRT.Audio) LRT.Audio.play('zombie_groan_1', { gain: 0.78 });
      if (stage === 1 && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
        LRT.PlayerUI.setNotice('GELOMBANG SUSULAN MUNCUL — PERTAHANKAN PERON!', '#f97316');
      }
    }
    return spawned;
  }

  function spawnStationRoamers(stationIdx) {
    if (CORE.tutorialActive) return 0;
    if (CORE.gameMode !== MODES.SURVIVAL || CORE.gameState === STATES.MENU) return 0;
    if (campaignState.clearedStations.has(stationIdx)) return 0;
    if (!LRT.Enemies) return 0;
    if (typeof LRT.Enemies.setDifficulty === 'function') {
      LRT.Enemies.setDifficulty(CORE.difficultyKey);
    }
    if (typeof LRT.Enemies.setAtmosphereMode === 'function') {
      LRT.Enemies.setAtmosphereMode(CORE.atmosphereMode);
    }
    if (typeof LRT.Enemies.spawnRoamers === 'function') {
      const navGraph = (LRT.Station && typeof LRT.Station.getNavGraph === 'function') ? LRT.Station.getNavGraph() : null;
      return LRT.Enemies.spawnRoamers(stationIdx, CORE.difficultyKey, navGraph);
    }
    return 0;
  }

  function onStationBuilt(idx, offsetZ) {
    if (LRT.Enemies && typeof LRT.Enemies.setDifficulty === 'function') {
      LRT.Enemies.setDifficulty(CORE.difficultyKey);
    }
    if (LRT.Enemies && typeof LRT.Enemies.setAtmosphereMode === 'function') {
      LRT.Enemies.setAtmosphereMode(CORE.atmosphereMode);
    }
    if (!offsetZ) {
      spawnStationRoamers(idx);
    }
  }

  function handleInteractResult(res, item) {
    if (!res || !item) return;
    if (CORE.tutorialActive && typeof CORE.onTutorialEvent === 'function') CORE.onTutorialEvent('interact', item, res);

    const s0 = campaignState.stationObjectives[0];
    const s1 = campaignState.stationObjectives[1];
    const wasGenOn = !!(s0 && s0.genOn);
    const wasFuseFound = !!(s1 && s1.fuseFound);
    const isFresh = res.fresh !== false && res.ammo !== null && res.ammoBonus !== 0;

    if (res.lurePos && LRT.Enemies && typeof LRT.Enemies.alertAllTo === 'function') {
      LRT.Enemies.alertAllTo(res.lurePos, 55.0);
    }

    if (item.id === 'portable_generator' || res.action === 'generator') {
      if (s0) {
        s0.genOn = true;
      }
      if (LRT.Station && typeof LRT.Station.setLightingFactor === 'function') {
        LRT.Station.setLightingFactor(1.0);
      }
      CORE.applyBrightness();
      if (!campaignState.voTriggered.has('VO_02_GEN_ON')) {
        campaignState.voTriggered.add('VO_02_GEN_ON');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_02_GEN_ON');
        }
      }
      if (CORE.stationIndex === 0) {
        triggerObjectiveSurgeWave(CORE.stationIndex);
      }
    }

    if (item.id === 'cawang_derelict_cab' || res.action === 'derelict_fuse') {
      if (s1) {
        s1.fuseFound = true;
      }
      if (!campaignState.voTriggered.has('VO_08_FUSE_FOUND')) {
        campaignState.voTriggered.add('VO_08_FUSE_FOUND');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_08_FUSE_FOUND');
        }
      }
      if (CORE.stationIndex === 1) {
        triggerObjectiveSurgeWave(CORE.stationIndex);
      }
    }

    if (item.id === 'garden_supply') {
      if (campaignState.stationObjectives[2]) {
        campaignState.stationObjectives[2].vaxFound = true;
      }
      if (!campaignState.voTriggered.has('VO_12_VAX_FOUND')) {
        campaignState.voTriggered.add('VO_12_VAX_FOUND');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_12_VAX_FOUND');
        }
      }
      if (CORE.stationIndex === 2) {
        triggerObjectiveSurgeWave(CORE.stationIndex);
      }
    }

    if (item.id === 'depot_supply') {
      if (campaignState.stationObjectives[2]) {
        campaignState.stationObjectives[2].depotDone = true;
      }
      if (CORE.stationIndex === 2) {
        triggerObjectiveSurgeWave(CORE.stationIndex);
      }
    }

    if (item.id === 'city_pln_box' || res.action === 'power_box') {
      if (CORE.stationIndex === 3 && campaignState.stationObjectives[3]) {
        campaignState.stationObjectives[3].plnDone = true;
        triggerObjectiveSurgeWave(CORE.stationIndex);
      } else if (CORE.stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.pln = true;
        checkSetiabudiRelays();
      }
    }

    if (item.id === 'route_totem') {
      if (CORE.stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.totem = true;
        checkSetiabudiRelays();
      }
    }

    if (item.id === 'setiabudi_jpo_switch' || res.action === 'relay') {
      if (CORE.stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.jpo = true;
        checkSetiabudiRelays();
      }
    }

    if (CORE.stationIndex === 5 && campaignState.stationObjectives[5] && campaignState.stationObjectives[5].relays) {
      const r5 = campaignState.stationObjectives[5].relays;
      const relayCount = (r5.totem ? 1 : 0) + (r5.pln ? 1 : 0) + (r5.jpo ? 1 : 0);
      if (relayCount >= 2) {
        triggerObjectiveSurgeWave(5);
      }
    }

    if (item.id === 'train_horn_front' || res.action === 'horn') {
      if (!campaignState.voTriggered.has('VO_14_HORN_HINT')) {
        campaignState.voTriggered.add('VO_14_HORN_HINT');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_14_HORN_HINT');
        }
      }
    }

    // Lootbox roll handling
    if ((res.type === 'lootbox' || item.type === 'lootbox') && res.fresh !== false) {
      if (LRT.Weapons && typeof LRT.Weapons.rollLootbox === 'function') {
        const resRoll = LRT.Weapons.rollLootbox({
          riskLuck: res.riskLuck !== undefined ? res.riskLuck : (item.riskLuck || 0.4),
          stationIndex: CORE.stationIndex,
          difficultyKey: CORE.difficultyKey
        });
        applyLootboxPayload(resRoll);
      }
      return;
    }

    // Survival world-progression weapon unlocks on station & street caches
    if (CORE.gameMode === MODES.SURVIVAL && LRT.Weapons && typeof LRT.Weapons.unlockWeapon === 'function') {
      let unlockRes = null;
      if ((item.id === 'portable_generator' && CORE.difficultyKey === 'easy' && !wasGenOn)
        || (isFresh && (item.id === 'jaklingko_kiosk' || item.id === 'city_coffee_cart' || item.id === 'balcony_supply'))) {
        unlockRes = LRT.Weapons.unlockWeapon('rifle', 60);
      } else if (isFresh && ((item.id === 'cawang_derelict_cab' && !wasFuseFound) || item.id === 'city_convoy_car')) {
        unlockRes = LRT.Weapons.unlockWeapon('shotgun', 16);
      } else if (isFresh && (item.id === 'depot_supply' || (item.id === 'city_pocket_park' && CORE.stationIndex >= 1))) {
        unlockRes = LRT.Weapons.unlockWeapon('rpg', 2);
      }
      if (unlockRes && unlockRes.newlyUnlocked && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
        LRT.PlayerUI.setNotice(`SENJATA BARU TERBUKA: ${String(unlockRes.id || '').toUpperCase()}!`, '#22c55e');
      }
    }
  }

  function isStationPrimaryObjectiveComplete(stIdx) {
    const idx = stIdx % 6;
    const obj = campaignState.stationObjectives[idx];
    if (!obj) return true;
    if (idx === 0) return !!obj.genOn;
    if (idx === 1) return !!obj.fuseFound;
    if (idx === 2) return !!(obj.vaxFound && obj.depotDone);
    if (idx === 3) return !!obj.plnDone;
    if (idx === 4) return !!obj.barricadeCleared;
    if (idx === 5) return !!(obj.relays && obj.relays.totem && obj.relays.pln && obj.relays.jpo);
    return true;
  }

  function pickPlayerSpawnPos() {
    if (LRT.Station && LRT.Station.getSpawnNodes) {
      const nodes = LRT.Station.getSpawnNodes() || [];
      const mid = nodes.find((n) => n.zone === 'platform_mid') || nodes.find((n) => n.zone === 'platform_north') || nodes[0];
      if (mid) return { x: mid.x, y: (mid.y || 0) + 0.05, z: mid.z, yaw: Math.PI * 0.5 };
    }
    return { x: 3.4, y: 0.05, z: 14.0, yaw: Math.PI * 0.5 };
  }

  function spawnCurrentWave() {
    if (CORE.tutorialActive) return;
    if (CORE.gameMode !== MODES.SURVIVAL) return;
    if (!LRT.Enemies || !LRT.Enemies.spawnWave) return;
    const nodes = LRT.Station && LRT.Station.getSpawnNodes ? LRT.Station.getSpawnNodes() : [];
    LRT.Enemies.spawnWave(CORE.currentWave, CORE.stationIndex, nodes, CORE.difficultyKey);
    if (LRT.Audio) LRT.Audio.play('zombie_groan_1', { gain: 0.7 });
    LRT.PlayerUI.setNotice(`WAVE ${CORE.currentWave}`, '#ef4444');
  }

  function summonTrain(dirOverride, isDirectDebugCall) {
    if (CORE.gameState !== STATES.STATION_ACTIVE) return;
    if (!LRT.Train || !LRT.Train.startApproach) return;
    const rail = (LRT.Station && typeof LRT.Station.getRailConfig === 'function')
      ? LRT.Station.getRailConfig()
      : { isIsland: false, track1X: 0.0, track2X: -4.70, platEdge1X: 1.46, platEdge2X: -6.16 };
    const archetypes = C.ARCHETYPES || [];
    const totalStations = archetypes.length || 6;
    let dir = (dirOverride === -1 || dirOverride === 1) ? dirOverride : 0;
    if (dir === 0) {
      // [T] hotkey ALWAYS summons Peron 1 Forward Mission Train (never auto-backtracks on Island east side)
      dir = 1;
    }
    if (dir === -1 && CORE.stationIndex <= 0) {
      if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.55 });
      LRT.PlayerUI.setNotice('TERMINAL AWAL (DUKUH ATAS) — GUNAKAN PERON 1', '#e0b422');
      return;
    }

    if (CORE.gameMode === MODES.SURVIVAL && !isDirectDebugCall) {
      if (dir === 1) {
        if (!isStationPrimaryObjectiveComplete(CORE.stationIndex)) {
          let hint = 'Selesaikan objektif utama stasiun terlebih dahulu!';
          const s = CORE.stationIndex % 6;
          if (s === 0) hint = 'Hidupkan generator portabel di Concourse [E]!';
          else if (s === 1) hint = 'Ambil sekring bypass dari kabin Jalur 4 [E]!';
          else if (s === 2) hint = 'Amankan vaksin (Kebun Atap) & data depot [E]!';
          else if (s === 3) hint = 'Aktifkan kotak relai PLN jalanan [E]!';
          else if (s === 4) hint = 'Hancurkan barikade jalan tol Cikoko [E / Tembak]!';
          else if (s === 5) hint = 'Hubungkan ketiga relai sinyal evakuasi Setiabudi [E]!';
          if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.55 });
          LRT.PlayerUI.setNotice(`OBJEKTIF BELUM SELESAI: ${hint}`, '#e0b422');
          return;
        }
        if (!campaignState.voTriggered.has('VO_04_CALL_HOLD')) {
          campaignState.voTriggered.add('VO_04_CALL_HOLD');
          if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
            LRT.Audio.playVoice('VO_04_CALL_HOLD');
          }
        }
      }
    }

    const nextIdx = dir === -1
      ? Math.max(0, CORE.stationIndex - 1)
      : (CORE.stationIndex + 1) % totalStations;
    const targetArch = archetypes.length ? archetypes[nextIdx] : null;
    const isFinalExtraction = (dir === 1 && CORE.stationIndex >= totalStations - 1 && CORE.gameMode === MODES.SURVIVAL);
    const targetName = isFinalExtraction
      ? `ZONA EVAKUASI (${(targetArch && targetArch.name) || 'Dukuh Atas BSI'})`
      : ((targetArch && targetArch.name) || (dir === -1 ? 'Stasiun Sebelumnya' : 'Stasiun Berikutnya'));

    CORE.activeTravelDir = dir;
    CORE.gameState = STATES.TRAIN_APPROACHING;
    LRT.Train.startApproach({
      trackX: dir === -1 ? rail.track2X : rail.track1X,
      direction: dir,
      nextStationName: targetName
    });
    if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.85 });
    LRT.PlayerUI.setNotice(
      dir === -1
        ? `🟠 KERETA KEMBALI (PERON 2) MENUJU ${targetName} SEDANG MENDEKAT`
        : `🟢 KERETA MAJU (PERON 1) MENUJU ${targetName} SEDANG MENDEKAT`,
      dir === -1 ? '#f59e0b' : '#22c55e'
    );
    if (dir === 1 && CORE.gameMode === MODES.SURVIVAL) {
      campaignState.trainCallActive = true;
      campaignState.trainCallWaitElapsed = 0;
      campaignState.trainCallTrickleStage = 0;
      triggerTrainCallSiegeWave(CORE.stationIndex);
    } else {
      campaignState.trainCallActive = false;
      campaignState.trainCallWaitElapsed = 0;
      campaignState.trainCallTrickleStage = 0;
    }
  }

  function initRideMoodTransition() {
    if (CORE.gameMode !== MODES.SURVIVAL || CORE.lightingLockedByUser) return;
    const fromIdx = CORE.stationIndex;
    const toIdx = Math.max(0, fromIdx + CORE.activeTravelDir);
    const moods = getActiveCampaignMoods();
    const fromMood = moods[fromIdx % moods.length] || CORE.currentLightingKey || 'GOLDEN_DUSK';
    const toMood = (fromIdx === 5 && CORE.activeTravelDir === 1)
      ? fromMood
      : (moods[toIdx % moods.length] || fromMood);
    CORE._rideFromMoodKey = fromMood;
    CORE._rideToMoodKey = toMood;
    CORE.isMoodLerping = true;
  }

  function departTrainNow() {
    if (CORE.gameState !== STATES.TRAIN_BOARDING) return;
    if (!LRT.Train) return;
    const pState = LRT.PlayerUI.getState();
    if (!LRT.Train.isPlayerInside(pState.pos)) {
      LRT.PlayerUI.setNotice('MASUK KE DALAM KERETA TERLEBIH DAHULU', '#e0b422');
      return;
    }
    if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, CORE.activeTravelDir);
    LRT.Train.closeDoors();
    if (typeof LRT.Train.ejectExteriorEntities === 'function') LRT.Train.ejectExteriorEntities();
    LRT.Train.departNow();
    campaignState.trainCallActive = false;
    CORE.gameState = STATES.TRAIN_DEPARTING;
    CORE.boardingCloseTimer = 0;
    initRideMoodTransition();
    LRT.PlayerUI.setNotice('PINTU DITUTUP — BERANGKAT!', '#4ade80');
    campaignState.voTriggered.add('VO_24_DOOR_CLOSE');
    if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
      LRT.Audio.playVoice('VO_24_DOOR_CLOSE');
    }
  }

  function collectEnemyDrop(dropType, dropMeta) {
    if (!LRT.Weapons || !LRT.Weapons.addAmmo) return;
    const meta = dropMeta || {};
    const tierCfg = (C.DIFFICULTY_TIERS && C.DIFFICULTY_TIERS[CORE.difficultyKey]) || {};
    const healMult = typeof meta.healMult === 'number'
      ? meta.healMult
      : (typeof tierCfg.healMult === 'number' ? tierCfg.healMult : 1.0);
    const ammoMult = typeof meta.ammoMult === 'number'
      ? meta.ammoMult
      : (typeof tierCfg.pickupAmmoMult === 'number' ? tierCfg.pickupAmmoMult : 1.0);

    if (dropType === 'lootcrate') {
      if (LRT.Audio && typeof LRT.Audio.play === 'function') {
        LRT.Audio.play('crate_open', { gain: 0.78 });
        LRT.Audio.play('loot_chime', { gain: 0.65 });
      }
      if (typeof LRT.Weapons.rollLootbox === 'function') {
        const riskLuck = typeof meta.luckFactor === 'number'
          ? meta.luckFactor
          : Math.min(1.0, 0.35 + 0.10 * CORE.stationIndex);
        const resRoll = LRT.Weapons.rollLootbox({
          riskLuck,
          stationIndex: CORE.stationIndex,
          difficultyKey: CORE.difficultyKey
        });
        applyLootboxPayload(resRoll, 'FIELD CRATE: ');
      }
      return;
    }

    if (dropType === 'health') {
      const healAmt = Math.max(1, Math.round(18 * healMult));
      LRT.PlayerUI.heal(healAmt);
      if (LRT.Audio && typeof LRT.Audio.play === 'function') {
        LRT.Audio.play('pickup_medkit', { gain: 0.72 });
      }
      LRT.PlayerUI.setNotice(`+${healAmt} HEALTH PICKUP`, '#22c55e');
      return;
    }

    if (dropType === 'rpg') {
      LRT.Weapons.addAmmo('rpg', 1);
      if (LRT.Audio && typeof LRT.Audio.play === 'function') {
        LRT.Audio.play('pickup_ammo', { gain: 0.80 });
      }
      LRT.PlayerUI.setNotice('+1 RPG ROCKET', '#f97316');
      return;
    }

    const rifleAmt = Math.max(1, Math.round(20 * ammoMult));
    const sgAmt = Math.max(1, Math.round(4 * ammoMult));
    LRT.Weapons.addAmmo('rifle', rifleAmt);
    LRT.Weapons.addAmmo('shotgun', sgAmt);
    if (LRT.Audio && typeof LRT.Audio.play === 'function') {
      LRT.Audio.play('pickup_ammo', { gain: 0.75 });
    }
    LRT.PlayerUI.setNotice('+AMMO RESUPPLY', '#e0b422');
  }

  function handleEnemyDrop(dropPos, dropType, dropMeta) {
    if (!dropPos || !LRT.Weapons || !LRT.Weapons.addAmmo) return;
    let resolvedType = dropType;
    if (resolvedType !== 'lootcrate' && resolvedType !== 'health' && resolvedType !== 'rpg') {
      resolvedType = Math.random() < 0.72 ? 'ammo' : 'rpg';
    }
    if (CORE.gameMode === MODES.SURVIVAL && LRT.Station && typeof LRT.Station.spawnGroundPickup === 'function') {
      LRT.Station.spawnGroundPickup(dropPos, resolvedType, dropMeta);
      return;
    }
    collectEnemyDrop(resolvedType, dropMeta);
  }

  function handlePlayerHit(dmg, srcPos) {
    const pState = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') ? LRT.PlayerUI.getState() : null;
    if ((pState && pState.fastTravelOpen) || CORE.gameMode === MODES.EXPLORATION || CORE.gameState === STATES.GAME_OVER) return;
    const died = LRT.PlayerUI.takeDamage(dmg, srcPos);
    if (died) {
      CORE.gameState = STATES.GAME_OVER;
      LRT.PlayerUI.setPaused(true, false);
      LRT.PlayerUI.releaseLock();
      if (LRT.Audio) LRT.Audio.stopAllLoops();
      resetGameOverDom();
      campaignState.voTriggered.add('VO_22_GAME_OVER');
      if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
        LRT.Audio.playVoice('VO_22_GAME_OVER', { force: true });
      }
      const dom = LRT.PlayerUI.getDom();
      if (dom['gameover-stats']) {
        dom['gameover-stats'].textContent = `Stations Cleared: ${CORE.stationsCleared} | Infected Eliminated: ${CORE.totalKills}`;
      }
      LRT.PlayerUI.showScreen('gameover');
    }
  }

  function buildObjectiveInfo(stationStats, atmos) {
    const name = (stationStats && (stationStats.name || stationStats.stationName)) || 'Dukuh Atas BSI';
    const code = (stationStats && (stationStats.code || stationStats.stationCode)) || 'CB01 / BK01';
    const activeMood = C.MOODS && C.MOODS[CORE.currentLightingKey];
    const sub = (activeMood && activeMood.name) || (atmos && atmos.mood && atmos.mood.name) || (stationStats && stationStats.mood && stationStats.mood.name) || 'Jakarta LRT';

    if (CORE.gameMode === MODES.EXPLORATION) {
      if (CORE.gameState === STATES.STATION_ACTIVE) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'EXPLORATION FREE-ROAM',
          objectiveDetail: 'Press [T] or Platform Console to Summon LRT'
        };
      }
      if (CORE.gameState === STATES.TRAIN_APPROACHING) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'LRT APPROACHING',
          objectiveDetail: 'Stand behind yellow tactile line'
        };
      }
      if (CORE.gameState === STATES.TRAIN_BOARDING) {
        const p = LRT.PlayerUI.getState();
        const inside = LRT.Train && LRT.Train.isPlayerInside(p.pos);
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: inside ? 'BOARDED — READY TO DEPART' : 'BOARD LRT TRAIN',
          objectiveDetail: inside
            ? 'Press [E] / [T] inside cab to Depart'
            : `Enter open train doors along Peron ${CORE.activeTravelDir === -1 ? 2 : 1}`
        };
      }
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: 'INKA iE203 In Transit',
        objectiveTitle: 'LRT TRANSIT CORRIDOR',
        objectiveDetail: `Approaching ${CORE.activeTravelDir === -1 ? 'previous' : 'next'} stop (#${Math.max(1, CORE.stationIndex + CORE.activeTravelDir + 1)})`
      };
    }

    // SURVIVAL MODE
    const alive = getWaveRemainingCountSafe();
    const sIdx = CORE.stationIndex % 6;

    if (CORE.gameState === STATES.TRAIN_APPROACHING) {
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'LRT APPROACHING',
        objectiveDetail: `Stand behind yellow line on Peron ${CORE.activeTravelDir === -1 ? 2 : 1}`
      };
    }

    if (CORE.gameState === STATES.TRAIN_BOARDING) {
      const p = LRT.PlayerUI.getState();
      const inside = LRT.Train && LRT.Train.isPlayerInside(p.pos);
      if (CORE.rideCompleteReady) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: inside ? 'ARRIVED — DISEMBARK TO PLATFORM' : 'BOARD LRT TRAIN',
          objectiveDetail: `Exit open doors onto Peron ${CORE.activeTravelDir === -1 ? 2 : 1}`
        };
      }
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: inside ? 'BOARDED — READY TO DEPART' : 'BOARD LRT TRAIN',
        objectiveDetail: inside
          ? `Press [E] / [T] in front cab to Depart (Auto-seal: ${Math.max(0, CORE.boardingCloseTimer).toFixed(1)}s)`
          : `Enter open doors on Peron ${CORE.activeTravelDir === -1 ? 2 : 1}`
      };
    }

    if (CORE.gameState === STATES.TRAIN_CRUISE || CORE.gameState === STATES.TRAIN_DEPARTING || CORE.gameState === STATES.TRAIN_ARRIVING) {
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: 'INKA iE203 In Transit',
        objectiveTitle: 'LRT TRANSIT CORRIDOR',
        objectiveDetail: `Approaching ${CORE.activeTravelDir === -1 ? 'previous' : 'next'} stop (#${Math.max(1, CORE.stationIndex + CORE.activeTravelDir + 1)})`
      };
    }

    // Station Active
    if (sIdx === 0) {
      if (!campaignState.stationObjectives[0].genOn) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RESTORE AUXILIARY POWER',
          objectiveDetail: 'Locate portable generator in Concourse [E]'
        };
      }
      if (alive > 0) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'REPEL CONCOURSE INCURSION',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'SUMMON LRT TRAIN',
        objectiveDetail: 'Summon LRT on Peron 1 [T/E] to advance to Cawang'
      };
    }

    if (sIdx === 1) {
      if (!campaignState.stationObjectives[1].fuseFound) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RECOVER SIGNAL FUSE',
          objectiveDetail: 'Cross JPO to Track 4 Derelict Cab (North End) [E]'
        };
      }
      if (alive > 0) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'CLEAR TRACK INTERCHANGE',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'SIGNALS RESTORED',
        objectiveDetail: 'Summon LRT on Peron 1 [T/E] | Retreat: Peron 2 [E]'
      };
    }

    if (sIdx === 2) {
      const o2 = campaignState.stationObjectives[2];
      if (!o2.vaxFound || !o2.depotDone) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RECOVER VACCINE & HEAVY ARMS',
          objectiveDetail: (!o2.vaxFound ? 'Search South Garden Crate' : '') + (!o2.vaxFound && !o2.depotDone ? ' & ' : '') + (!o2.depotDone ? 'Search North Depot Armory' : '')
        };
      }
      if (alive > 0) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'DEFEND HARJAMUKTI DEPOT',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'DEPOT SECURED',
        objectiveDetail: 'Summon LRT on Peron 1 [T/E] | Retreat: Peron 2 [E]'
      };
    }

    if (sIdx === 3) {
      if (!campaignState.stationObjectives[3].plnDone) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RESTORE STREET POWER RELAY',
          objectiveDetail: 'Restore East Boulevard PLN Substation Box [E]'
        };
      }
      if (alive > 0) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'SURVIVE MONSOON AMBUSH',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'RELAY RESTORED',
        objectiveDetail: 'Summon LRT on Peron 1 [T/E] | Retreat: Peron 2 [E]'
      };
    }

    if (sIdx === 4) {
      if (!campaignState.stationObjectives[4] || !campaignState.stationObjectives[4].barricadeCleared) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'BREACH HIGHWAY BARRICADE',
          objectiveDetail: 'Destroy Cikoko Roadblock with [E] Breach Charge or Firepower'
        };
      }
      if (alive > 0) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'CLEAR TOLL OVERPASS & KRL STAIRS',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'CORRIDOR CLEARED',
        objectiveDetail: 'Summon LRT on Peron 1 [T/E] to advance to Setiabudi'
      };
    }

    if (sIdx === 5) {
      const r = campaignState.stationObjectives[5].relays;
      const count = (r.totem ? 1 : 0) + (r.pln ? 1 : 0) + (r.jpo ? 1 : 0);
      if (count < 3) {
        const missing = [];
        if (!r.totem) missing.push('Platform Totem');
        if (!r.pln) missing.push('Street PLN Box');
        if (!r.jpo) missing.push('JPO Switch');
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: `ACTIVATE 3 SIGNAL RELAYS (${count}/3)`,
          objectiveDetail: `Remaining: ${missing.join(', ')} [E]`
        };
      }
      if (alive > 0) {
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'SURVIVE OMEGA SIEGE',
          objectiveDetail: `Swarm Remaining: ${alive} | Defend until blast doors open`
        };
      }
      return {
        mode: CORE.gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'EXTRACTION GATES OPEN',
        objectiveDetail: 'Summon LRT on Peron 1 [T/E] -> Board & Depart to Escape!'
      };
    }

    return {
      mode: CORE.gameMode,
      stationName: name,
      stationCode: code,
      stationSub: sub,
      objectiveTitle: `STATION ${CORE.stationIndex + 1}`,
      objectiveDetail: alive > 0 ? `Infected Remaining: ${alive}` : 'Summon LRT [T/E]'
    };
  }

  function getBaseObjectiveTargetIds() {
    if (CORE.gameState !== STATES.STATION_ACTIVE) return [];
    if (CORE.gameMode === MODES.EXPLORATION) return ['call_train', 'call_train_p2'];

    const sIdx = CORE.stationIndex % 6;
    const obj = campaignState.stationObjectives[sIdx] || {};
    const waveRemaining = getWaveRemainingCountSafe();

    if (sIdx === 0) {
      if (!obj.genOn) return ['portable_generator'];
      if (waveRemaining > 0) return [];
      return ['call_train'];
    }
    if (sIdx === 1) {
      if (!obj.fuseFound) return ['cawang_derelict_cab'];
      if (waveRemaining > 0) return [];
      return campaignState.clearedStations.has(CORE.stationIndex) ? ['call_train', 'call_train_p2'] : ['call_train'];
    }
    if (sIdx === 2) {
      if (!obj.vaxFound || !obj.depotDone) {
        const targets = [];
        if (!obj.vaxFound) targets.push('garden_supply');
        if (!obj.depotDone) targets.push('depot_supply');
        return targets;
      }
      if (waveRemaining > 0) return [];
      return ['call_train', 'call_train_p2'];
    }
    if (sIdx === 3) {
      if (!obj.plnDone) return ['city_pln_box'];
      if (waveRemaining > 0) return [];
      return ['call_train', 'call_train_p2'];
    }
    if (sIdx === 4) {
      if (!obj.barricadeCleared) return ['cikoko_barricade'];
      if (waveRemaining > 0) return [];
      return ['call_train', 'call_train_p2'];
    }
    if (sIdx === 5) {
      const r = obj.relays || {};
      const targets = [];
      if (!r.totem) targets.push('route_totem');
      if (!r.pln) targets.push('city_pln_box');
      if (!r.jpo) targets.push('setiabudi_jpo_switch');
      if (targets.length > 0) return targets;
      if (waveRemaining > 0) return [];
      return ['call_train', 'call_train_p2'];
    }

    return waveRemaining > 0 ? [] : ['call_train', 'call_train_p2'];
  }

  function getActiveObjectiveTargetIds() {
    const ids = getBaseObjectiveTargetIds();
    if (
      CORE.gameState === STATES.STATION_ACTIVE &&
      CORE.gameMode === MODES.SURVIVAL &&
      campaignState.barrelCueActive &&
      !campaignState.firstBarrelExploded &&
      LRT.Station &&
      LRT.Station.explosiveBarrels &&
      LRT.Station.explosiveBarrels.length > 0
    ) {
      ids.push('explosive_barrel_cue');
    }
    return ids;
  }

  function syncTrackGatesForTrainState(trState) {
    const gatesOpen = (trState === 'APPROACHING' || trState === 'DEPARTING' || trState === 'CRUISE' || trState === 'ARRIVING');
    if (LRT.City && typeof LRT.City.setTrackGatesOpen === 'function') {
      LRT.City.setTrackGatesOpen(gatesOpen);
    }
    const stCols = (LRT.Station && typeof LRT.Station.getColliders === 'function')
      ? LRT.Station.getColliders()
      : (LRT.Station && LRT.Station.colliders);
    if (Array.isArray(stCols)) {
      for (let i = 0; i < stCols.length; i++) {
        const c = stCols[i];
        if (c && c.isTrackGate) {
          c.disabled = gatesOpen;
          c.blocksWalk = !gatesOpen;
        }
      }
    }
  }

  function syncTrainTrackToDestination(pState) {
    if (!LRT.Train || typeof LRT.Train.setTrackX !== 'function') return;
    const destRail = (LRT.Station && typeof LRT.Station.getRailConfig === 'function')
      ? LRT.Station.getRailConfig()
      : null;
    if (!destRail) return;
    const targetTrackX = CORE.activeTravelDir === -1 ? destRail.track2X : destRail.track1X;
    if (typeof targetTrackX !== 'number' || !Number.isFinite(targetTrackX)) return;
    const curTrackX = typeof LRT.Train.getTrackX === 'function' ? LRT.Train.getTrackX() : targetTrackX;
    if (Math.abs(targetTrackX - curTrackX) <= 1e-4) return;
    const wasInside = !!(pState && (pState.isInsideTrain || pState.isSitting || LRT.Train.isPlayerInside(pState.pos)));
    const deltaX = LRT.Train.setTrackX(targetTrackX);
    if (wasInside && pState && pState.pos && Math.abs(deltaX) > 1e-4) {
      pState.pos.x += deltaX;
      if (pState.lastSafePos) pState.lastSafePos.x += deltaX;
    }
  }

  function updateTrainCampaign(dt, pState) {
    if (pState && pState.fastTravelOpen) return false;
    // Victory check 1.5s into cruise from Station 5 heading forward
    if (CORE.gameState === STATES.TRAIN_CRUISE && CORE.stationIndex === 5 && CORE.activeTravelDir === 1 && !campaignState.campaignVictory) {
      CORE.victoryCruiseTimer += dt;
      if (CORE.victoryCruiseTimer >= 1.5) {
        triggerExtractionVictory();
        return true;
      }
    }

    // Update Train & Handle Ride Callbacks
    if (LRT.Train && LRT.Train.update) {
      LRT.Train.update(
        dt,
        LRT.Station,
        () => {
          // Dispose old Station N mid-cruise once out of fog
          saveCurrentStationUsedIds();
          if (LRT.Enemies && LRT.Enemies.reset) LRT.Enemies.reset();
          if (LRT.Station && LRT.Station.dispose) LRT.Station.dispose(CORE.scene);
        },
        (incomingZ) => {
          // Spawn next/previous station along corridor dynamically (incremental build during cruise)
          saveCurrentStationUsedIds();
          const nextIdx = Math.max(0, CORE.stationIndex + CORE.activeTravelDir);
          const isBacktrack = CORE.activeTravelDir === -1;
          const isNewStop = !campaignState.visitedStations.has(nextIdx);
          CORE.stationIndex = nextIdx;
          campaignState.visitedStations.add(CORE.stationIndex);

          if (isNewStop && !isBacktrack) {
            CORE.stationsCleared += 1;
            CORE.currentWave += 1;
          }
          CORE.wavesPerStation = 1;
          const spawnZ = incomingZ !== undefined ? incomingZ : (215 * CORE.activeTravelDir);
          if (typeof CORE.beginBuildStation === 'function') {
            CORE.beginBuildStation(CORE.stationIndex, spawnZ);
          } else if (CORE.buildStation) {
            CORE.buildStation(CORE.stationIndex, spawnZ);
          }
          syncTrainTrackToDestination(pState);
          CORE.rideCompleteReady = true;
          return LRT.Station;
        },
        (builtStats, builtZ) => {
          if (typeof CORE.finishBuildStation === 'function') {
            CORE.finishBuildStation(CORE.stationIndex, builtZ || 0, builtStats);
          }
          syncTrainTrackToDestination(pState);
          syncTrackGatesForTrainState(LRT.Train.getState());
        }
      );

      const trState = LRT.Train.getState();
      if (trState !== CORE.prevTrainState) {
        syncTrackGatesForTrainState(trState);
        if (trState === 'BOARDED_WAIT') {
          if (CORE.gameState === STATES.TRAIN_APPROACHING || CORE.gameState === STATES.TRAIN_ARRIVING) {
            const wasArrival = CORE.gameState === STATES.TRAIN_ARRIVING;
            CORE.gameState = STATES.TRAIN_BOARDING;
            CORE.boardingCloseTimer = 16.0;
            if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(1, CORE.activeTravelDir);
            LRT.Train.openDoors();
            if (wasArrival) {
              if (CORE.gameMode === MODES.SURVIVAL && !CORE.lightingLockedByUser) {
                const finalMoodKey = CORE._rideToMoodKey || getCampaignMoodForStation(CORE.stationIndex) || CORE.currentLightingKey;
                if (finalMoodKey && typeof CORE.applyMoodLighting === 'function') {
                  CORE.currentLightingKey = finalMoodKey;
                  const stAtmos = (LRT.Station && typeof LRT.Station.getAtmosphere === 'function') ? LRT.Station.getAtmosphere() : null;
                  const stStats = (LRT.Station && typeof LRT.Station.getStats === 'function') ? LRT.Station.getStats() : null;
                  CORE.applyMoodLighting(stStats, stAtmos ? { ...stAtmos, moodKey: finalMoodKey } : { moodKey: finalMoodKey });
                }
              }
              CORE._rideFromMoodKey = null;
              CORE._rideToMoodKey = null;
              CORE.isMoodLerping = false;
              const isNewStop = !campaignState.visitedStations.has(CORE.stationIndex);
              campaignState.visitedStations.add(CORE.stationIndex);
              if (isNewStop) {
                LRT.PlayerUI.heal(15);
                if (LRT.Weapons && LRT.Weapons.addAmmo) {
                  LRT.Weapons.addAmmo('rifle', 15);
                  LRT.Weapons.addAmmo('shotgun', 4);
                }
              }
              const stName = (LRT.Station.getStats && (LRT.Station.getStats().name || LRT.Station.getStats().stationName) || 'STASIUN BARU').toUpperCase();
              LRT.PlayerUI.setNotice(`TIBA DI ${stName}`, '#4ade80');
              const arrivalVoMap = {
                1: 'VO_07_CAWANG_ARR',
                2: 'VO_10_HARJA_ARR',
                3: 'VO_16_KUNING_ARR',
                4: 'VO_17_CIKOKO_ARR',
                5: 'VO_18_SETIA_ARR'
              };
              const aVo = arrivalVoMap[CORE.stationIndex];
              if (aVo && !campaignState.voTriggered.has(aVo)) {
                campaignState.voTriggered.add(aVo);
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice(aVo);
                }
              }
              if (CORE.gameMode === MODES.SURVIVAL) {
                CORE.rideCompleteReady = true;
                spawnStationRoamers(CORE.stationIndex);
              }
            } else {
              LRT.PlayerUI.setNotice(`PINTU PERON ${CORE.activeTravelDir === -1 ? 2 : 1} TERBUKA — NAIK KE KERETA`, '#4ade80');
              if (!campaignState.voTriggered.has('VO_05_TRAIN_DOCK')) {
                campaignState.voTriggered.add('VO_05_TRAIN_DOCK');
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice('VO_05_TRAIN_DOCK');
                }
              }
            }
          }
        } else if (trState === 'DEPARTING') {
          campaignState.trainCallActive = false;
          CORE.gameState = STATES.TRAIN_DEPARTING;
          if (!CORE.isMoodLerping || !CORE._rideFromMoodKey || !CORE._rideToMoodKey) {
            initRideMoodTransition();
          }
          if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, CORE.activeTravelDir);
        } else if (trState === 'CRUISE') {
          CORE.gameState = STATES.TRAIN_CRUISE;
        } else if (trState === 'ARRIVING') {
          CORE.gameState = STATES.TRAIN_ARRIVING;
          if (typeof CORE.markShadowDirty === 'function') CORE.markShadowDirty();
        }
        CORE.prevTrainState = trState;
      }

      // Mid-wait train-call reinforcement trickle while LRT approaches / awaits boarding
      if (CORE.gameMode === MODES.SURVIVAL && campaignState.trainCallActive && CORE.activeTravelDir === 1 &&
          (CORE.gameState === STATES.TRAIN_APPROACHING || (CORE.gameState === STATES.TRAIN_BOARDING && !CORE.rideCompleteReady))) {
        campaignState.trainCallWaitElapsed += dt;
        if (campaignState.trainCallTrickleStage === 0 && campaignState.trainCallWaitElapsed >= 7.5) {
          campaignState.trainCallTrickleStage = 1;
          triggerTrainCallReinforcementTrickle(CORE.stationIndex, 1);
        } else if (campaignState.trainCallTrickleStage === 1 && campaignState.trainCallWaitElapsed >= 14.5) {
          campaignState.trainCallTrickleStage = 2;
          if (getWaveRemainingCountSafe() < 12) {
            triggerTrainCallReinforcementTrickle(CORE.stationIndex, 2);
          }
        }
      }

      if ((trState === 'DEPARTING' || trState === 'CRUISE' || trState === 'ARRIVING') &&
          CORE.gameMode === MODES.SURVIVAL && !CORE.lightingLockedByUser &&
          CORE._rideFromMoodKey && CORE._rideToMoodKey &&
          typeof CORE.lerpMoodLighting === 'function' &&
          typeof LRT.Train.getRideProgress === 'function') {
        CORE.lerpMoodLighting(CORE._rideFromMoodKey, CORE._rideToMoodKey, LRT.Train.getRideProgress());
      }

      // Sync PSD smooth slide & disembark flow across both Peron 1 and Peron 2
      if (CORE.gameState === STATES.TRAIN_BOARDING) {
        if (CORE.gameMode === MODES.SURVIVAL && !campaignState.voTriggered.has('VO_06_BOARD_WARN')) {
          const aliveNow = getWaveRemainingCountSafe();
          if (aliveNow > 0) {
            campaignState.voTriggered.add('VO_06_BOARD_WARN');
            if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
              LRT.Audio.playVoice('VO_06_BOARD_WARN');
            }
          }
        }

        const railCfg = (LRT.Station && typeof LRT.Station.getRailConfig === 'function') ? LRT.Station.getRailConfig() : null;
        const onPlat = railCfg
          ? (CORE.activeTravelDir === -1 ? pState.pos.x < railCfg.platEdge2X - 0.20 : pState.pos.x > railCfg.platEdge1X + 0.20)
          : (CORE.activeTravelDir === -1 ? pState.pos.x < -6.36 : pState.pos.x > 1.72);
        if (CORE.rideCompleteReady && !LRT.Train.isPlayerInside(pState.pos) && onPlat) {
          // Player stepped safely onto the newly arrived station platform
          CORE.rideCompleteReady = false;
          if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, CORE.activeTravelDir);
          LRT.Train.closeDoors();
          LRT.Train.reset(CORE.gameMode);
          CORE.prevTrainState = 'AWAY';
          CORE.gameState = STATES.STATION_ACTIVE;
          if (CORE.gameMode === MODES.SURVIVAL) {
            if (campaignState.clearedStations.has(CORE.stationIndex)) {
              LRT.PlayerUI.setNotice('STASIUN SUDAH DIBERSIHKAN — LOGISTIK TERSEDIA', '#4ade80');
            } else {
              spawnCurrentWave();
            }
          } else {
            LRT.PlayerUI.setNotice('JELAJAHI STASIUN — TEKAN [T] UNTUK PANGGIL LRT', '#e0b422');
          }
        } else if (CORE.gameMode === MODES.SURVIVAL && !CORE.rideCompleteReady && LRT.Train.isPlayerInside(pState.pos)) {
          CORE.boardingCloseTimer = CORE.boardingCloseTimer > 0 ? CORE.boardingCloseTimer - dt : 16.0;
          if (CORE.boardingCloseTimer <= 0) {
            CORE.boardingCloseTimer = 0;
            departTrainNow();
          }
        }
      }
    }

    return false;
  }

  function updateSurvivalAndVoChecks(dt, pState, stationGrid, trainCols, enemyOpts) {
    if (pState && pState.fastTravelOpen) return;
    if (!CORE.tutorialActive) tickAutosave(dt);
    // Survival wave logic (plus animate/update any manually spawned zombies in exploration mode)
    const hasCustomZombies = LRT.Enemies && typeof LRT.Enemies.getAliveCount === 'function' && LRT.Enemies.getAliveCount() > 0;
    if ((CORE.gameMode === MODES.SURVIVAL || hasCustomZombies) && (CORE.gameState === STATES.STATION_ACTIVE || CORE.gameState === STATES.TRAIN_APPROACHING || CORE.gameState === STATES.TRAIN_BOARDING)) {
      if (LRT.Enemies && LRT.Enemies.update) {
        const beforeAlive = LRT.Enemies.getAliveCount();
        LRT.Enemies.update(dt, pState.pos, stationGrid, trainCols, handlePlayerHit, handleEnemyDrop, enemyOpts);
        const afterAlive = LRT.Enemies.getAliveCount();
        if (CORE.gameMode === MODES.SURVIVAL) {
          if (afterAlive < beforeAlive) {
            CORE.totalKills += (beforeAlive - afterAlive);
          }

          const waveRemaining = getWaveRemainingCountSafe();
          if (waveRemaining === 0 && campaignState.stationObjectives[CORE.stationIndex % 6]) {
            campaignState.stationObjectives[CORE.stationIndex % 6].waveCleared = true;
            if (isStationPrimaryObjectiveComplete(CORE.stationIndex)) {
              campaignState.clearedStations.add(CORE.stationIndex);
            }
          }
        }
      }
    } else if (
      (CORE.gameState === STATES.TRAIN_DEPARTING || CORE.gameState === STATES.TRAIN_CRUISE || CORE.gameState === STATES.TRAIN_ARRIVING) &&
      LRT.Enemies && typeof LRT.Enemies.updateDepartingIdle === 'function'
    ) {
      LRT.Enemies.updateDepartingIdle(dt);
    }

    // Periodic survival voice checks
    if (CORE.gameMode === MODES.SURVIVAL) {
      CORE.enemySightTimer += dt;
      if (CORE.enemySightTimer >= 0.5) {
        CORE.enemySightTimer = 0;
        if (CORE.stationIndex >= 1 && LRT.Enemies && typeof LRT.Enemies.getDebugSummary === 'function') {
          const summary = LRT.Enemies.getDebugSummary();
          for (let i = 0; i < summary.length; i++) {
            const e = summary[i];
            const dist = Math.hypot(e.x - pState.pos.x, e.z - pState.pos.z);
            if (dist < 28.0 && e.variant === 'brute' && !campaignState.firstBarrelExploded && !campaignState.barrelCueActive) {
              if (LRT.Station && LRT.Station.explosiveBarrels && LRT.Station.explosiveBarrels.some((b) => !b.exploded)) {
                campaignState.barrelCueActive = true;
                if (typeof LRT.Station.setBarrelCueActive === 'function') {
                  LRT.Station.setBarrelCueActive(true);
                }
              }
            }
            if (dist < 24.0) {
              if (e.variant === 'spitter' && !campaignState.voTriggered.has('VO_09_SPITTER_SEE')) {
                campaignState.voTriggered.add('VO_09_SPITTER_SEE');
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice('VO_09_SPITTER_SEE');
                }
              } else if (e.variant === 'brute' && !campaignState.voTriggered.has('VO_11_BRUTE_SEE')) {
                campaignState.voTriggered.add('VO_11_BRUTE_SEE');
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice('VO_11_BRUTE_SEE');
                }
              } else if (e.variant === 'screamer' && !campaignState.voTriggered.has('VO_13_SCREAM_WARN')) {
                campaignState.voTriggered.add('VO_13_SCREAM_WARN');
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice('VO_13_SCREAM_WARN');
                }
              }
            }
          }
        }
        if (LRT.Station && typeof LRT.Station.setBarrelCueActive === 'function') {
          const hasUnexploded = !!(LRT.Station.explosiveBarrels && LRT.Station.explosiveBarrels.some((b) => !b.exploded));
          if (campaignState.firstBarrelExploded || !hasUnexploded) {
            campaignState.barrelCueActive = false;
            LRT.Station.setBarrelCueActive(false);
          } else {
            LRT.Station.setBarrelCueActive(campaignState.barrelCueActive);
          }
        }
        if (CORE.stationIndex >= 1 && !campaignState.voTriggered.has('VO_15_RETREAT_NOTE')) {
          if (LRT.Weapons && typeof LRT.Weapons.getHudState === 'function') {
            const wh = LRT.Weapons.getHudState();
            if (wh && Array.isArray(wh.slots)) {
              const rifleSlot = wh.slots.find((s) => s.id === 'rifle');
              const shotgunSlot = wh.slots.find((s) => s.id === 'shotgun');
              const anyUnlocked = (rifleSlot && rifleSlot.unlocked) || (shotgunSlot && shotgunSlot.unlocked);
              if (anyUnlocked) {
                const rLow = !rifleSlot || !rifleSlot.unlocked || rifleSlot.reserve <= 10;
                const sLow = !shotgunSlot || !shotgunSlot.unlocked || shotgunSlot.reserve <= 4;
                if (rLow && sLow) {
                  campaignState.voTriggered.add('VO_15_RETREAT_NOTE');
                  if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                    LRT.Audio.playVoice('VO_15_RETREAT_NOTE');
                  }
                }
              }
            }
          }
        }
      }

      if (CORE.stationIndex === 0 && !campaignState.voTriggered.has('VO_03_STREET_HINT')) {
        if (pState.pos.x > 20.0 || pState.pos.x < -12.0) {
          campaignState.voTriggered.add('VO_03_STREET_HINT');
          if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
            LRT.Audio.playVoice('VO_03_STREET_HINT');
          }
        }
      }

      // Station 5 holdout progression
      if (CORE.stationIndex === 5 && campaignState.stationObjectives[5] && campaignState.stationObjectives[5].omegaActive) {
        campaignState.stationObjectives[5].holdoutElapsed += dt;
        if (campaignState.stationObjectives[5].holdoutElapsed >= 80.0 && !campaignState.voTriggered.has('VO_20_COUNT_10')) {
          campaignState.voTriggered.add('VO_20_COUNT_10');
          if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
            LRT.Audio.playVoice('VO_20_COUNT_10');
          }
        }
        if (campaignState.stationObjectives[5].holdoutElapsed >= 90.0) {
          campaignState.stationObjectives[5].waveCleared = true;
          campaignState.clearedStations.add(5);
        }
      }
    }

    // Exploration Mode: replenish reserve ammo gracefully so testing RPG/weapons never dead-ends
    if (CORE.gameMode === MODES.EXPLORATION && LRT.Weapons && LRT.Weapons.getHudState) {
      const wh = LRT.Weapons.getHudState();
      if (wh && !wh.infiniteReserve && wh.reserve <= 2 && LRT.Weapons.addAmmo) {
        LRT.Weapons.addAmmo(wh.id, 12);
      }
    }
  }

  // =========================================================
  // CHECKPOINT SAVE / CONTINUE (localStorage, survival only)
  // =========================================================
  const SAVE_KEY = 'lrt_campaign_save_v1';
  const SAVE_VERSION = 1;
  const AUTOSAVE_INTERVAL = 8.0;
  let _autosaveTimer = 0;

  function buildSaveData() {
    const p = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') ? LRT.PlayerUI.getState() : null;
    saveCurrentStationUsedIds();
    const usedObj = {};
    campaignState.stationUsedIds.forEach((set, idx) => { usedObj[idx] = Array.from(set); });
    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      difficultyKey: CORE.difficultyKey,
      atmosphereMode: getAtmosphereMode(),
      stationIndex: CORE.stationIndex | 0,
      currentWave: CORE.currentWave | 0,
      stationsCleared: CORE.stationsCleared | 0,
      totalKills: CORE.totalKills | 0,
      health: p ? Math.round(p.health) : 100,
      armor: p ? Math.round(p.armor || 0) : 0,
      maxArmor: p ? (p.maxArmor || 100) : 100,
      weapons: (LRT.Weapons && typeof LRT.Weapons.getSaveState === 'function') ? LRT.Weapons.getSaveState() : null,
      campaign: {
        clearedStations: Array.from(campaignState.clearedStations),
        visitedStations: Array.from(campaignState.visitedStations),
        triggeredSurgeStations: Array.from(campaignState.triggeredSurgeStations),
        stationObjectives: JSON.parse(JSON.stringify(campaignState.stationObjectives)),
        voTriggered: Array.from(campaignState.voTriggered),
        collectedLogs: campaignState.collectedLogs.slice(),
        firstBarrelExploded: !!campaignState.firstBarrelExploded,
        stationUsedIds: usedObj
      }
    };
  }

  function writeSave() {
    if (CORE.gameMode !== MODES.SURVIVAL || campaignState.campaignVictory) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveData()));
      return true;
    } catch (_) { return false; }
  }

  function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== SAVE_VERSION || typeof d.stationIndex !== 'number' || !d.campaign) return null;
      return d;
    } catch (_) { return null; }
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  }

  function getSaveSummary() {
    const d = readSave();
    if (!d) return null;
    const archs = C.ARCHETYPES || [];
    const arch = archs.length ? archs[d.stationIndex % archs.length] : null;
    return {
      stationIndex: d.stationIndex,
      stationName: (arch && arch.name) || ('Stasiun ' + (d.stationIndex + 1)),
      difficultyKey: d.difficultyKey,
      atmosphereMode: d.atmosphereMode,
      stationsCleared: d.stationsCleared,
      savedAt: d.savedAt
    };
  }

  // Restores campaignState + CORE counters from a save. Called by startGame(resume) after resetCampaignState().
  function applySaveData(d) {
    if (!d || !d.campaign) return false;
    const c = d.campaign;
    campaignState.clearedStations = new Set(c.clearedStations || []);
    campaignState.visitedStations = new Set(c.visitedStations || [0]);
    campaignState.triggeredSurgeStations = new Set(c.triggeredSurgeStations || []);
    if (c.stationObjectives) campaignState.stationObjectives = c.stationObjectives;
    campaignState.voTriggered = new Set(c.voTriggered || []);
    campaignState.collectedLogs.length = 0;
    (c.collectedLogs || []).forEach((l) => campaignState.collectedLogs.push(l));
    campaignState.firstBarrelExploded = !!c.firstBarrelExploded;
    campaignState.stationUsedIds.clear();
    Object.keys(c.stationUsedIds || {}).forEach((k) => {
      campaignState.stationUsedIds.set(parseInt(k, 10), new Set(c.stationUsedIds[k]));
    });
    CORE.stationIndex = d.stationIndex | 0;
    CORE.currentWave = Math.max(1, d.currentWave | 0);
    CORE.stationsCleared = d.stationsCleared | 0;
    CORE.totalKills = d.totalKills | 0;
    return true;
  }

  function tickAutosave(dt) {
    if (CORE.gameMode !== MODES.SURVIVAL) return;
    if (campaignState.campaignVictory) { clearSave(); return; }
    // Checkpoint only while standing in a station (never mid-ride / game over).
    if (CORE.gameState !== STATES.STATION_ACTIVE) { _autosaveTimer = 0; return; }
    _autosaveTimer += dt;
    if (_autosaveTimer >= AUTOSAVE_INTERVAL) {
      _autosaveTimer = 0;
      writeSave();
    }
  }

  CORE.buildSaveData = buildSaveData;
  CORE.writeSave = writeSave;
  CORE.readSave = readSave;
  CORE.clearSave = clearSave;
  CORE.hasSave = () => !!readSave();
  CORE.getSaveSummary = getSaveSummary;
  CORE.applySaveData = applySaveData;
  CORE.tickAutosave = tickAutosave;

  CORE.CAMPAIGN_MOODS = CAMPAIGN_MOODS;
  CORE.CAMPAIGN_MOODS_DAYLIGHT = (C.CAMPAIGN_MOODS_DAYLIGHT || FALLBACK_CAMPAIGN_MOODS_DAYLIGHT);
  CORE.getActiveCampaignMoods = getActiveCampaignMoods;
  CORE.getCampaignMoodForStation = getCampaignMoodForStation;
  CORE.setAtmosphereMode = setAtmosphereMode;
  CORE.getAtmosphereMode = getAtmosphereMode;
  CORE.campaignState = campaignState;
  CORE.resetCampaignState = resetCampaignState;
  CORE.saveCurrentStationUsedIds = saveCurrentStationUsedIds;
  CORE.resetGameOverDom = resetGameOverDom;
  CORE.triggerExtractionVictory = triggerExtractionVictory;
  CORE.handleInteractResult = handleInteractResult;
  CORE.isStationPrimaryObjectiveComplete = isStationPrimaryObjectiveComplete;
  CORE.pickPlayerSpawnPos = pickPlayerSpawnPos;
  CORE.spawnCurrentWave = spawnCurrentWave;
  function jumpToStation(idx) {
    const total = (C.ARCHETYPES && C.ARCHETYPES.length) ? C.ARCHETYPES.length : 6;
    const targetIdx = Math.max(0, Math.min(total - 1, idx | 0));
    let st = null;
    if (window.__LRT_DEBUG__ && typeof window.__LRT_DEBUG__.jumpToStation === 'function') {
      st = window.__LRT_DEBUG__.jumpToStation(targetIdx);
    } else {
      saveCurrentStationUsedIds();
      if (LRT.Station && LRT.Station.dispose) LRT.Station.dispose(CORE.scene);
      if (LRT.Enemies && LRT.Enemies.reset) LRT.Enemies.reset();
      if (LRT.Enemies && typeof LRT.Enemies.setDifficulty === 'function') LRT.Enemies.setDifficulty(CORE.difficultyKey);
      if (LRT.Enemies && typeof LRT.Enemies.setAtmosphereMode === 'function') LRT.Enemies.setAtmosphereMode(getAtmosphereMode());
      if (LRT.Train && LRT.Train.reset) LRT.Train.reset(CORE.gameMode);
      CORE.stationIndex = targetIdx;
      CORE.activeTravelDir = 1;
      CORE.prevTrainState = 'AWAY';
      CORE.rideCompleteReady = false;
      CORE.gameState = STATES.STATION_ACTIVE;
      if (typeof CORE.syncMenuLights === 'function') CORE.syncMenuLights();
      st = typeof CORE.buildStation === 'function' ? CORE.buildStation(CORE.stationIndex, 0) : null;
      const sp = (st && st.spawnPos) || pickPlayerSpawnPos();
      if (LRT.PlayerUI && typeof LRT.PlayerUI.reset === 'function') {
        LRT.PlayerUI.reset(sp, CORE.gameMode === MODES.EXPLORATION || !!CORE.tutorialActive, CORE.gameMode);
      }
      if (typeof CORE.updateCityVisibility === 'function') {
        CORE.updateCityVisibility(LRT.PlayerUI ? LRT.PlayerUI.getState() : null);
      }
      if (typeof CORE.updateSunTracking === 'function') CORE.updateSunTracking(sp.x, sp.z);
      if (typeof CORE.renderFrame === 'function') CORE.renderFrame();
    }
    campaignState.visitedStations.add(CORE.stationIndex);
    if (CORE.gameMode === MODES.SURVIVAL && !CORE.tutorialActive && typeof writeSave === 'function') {
      writeSave();
    }
    return st;
  }

  CORE.summonTrain = summonTrain;
  CORE.departTrainNow = departTrainNow;
  CORE.jumpToStation = jumpToStation;
  CORE.collectEnemyDrop = collectEnemyDrop;
  CORE.handleEnemyDrop = handleEnemyDrop;
  CORE.handlePlayerHit = handlePlayerHit;
  CORE.buildObjectiveInfo = buildObjectiveInfo;
  CORE.getActiveObjectiveTargetIds = getActiveObjectiveTargetIds;
  CORE.onStationBuilt = onStationBuilt;
  CORE.spawnStationRoamers = spawnStationRoamers;
  CORE.updateTrainCampaign = updateTrainCampaign;
  CORE.updateSurvivalAndVoChecks = updateSurvivalAndVoChecks;

  const directorApi = LRT.Director || {};
  directorApi.jumpToStation = jumpToStation;
  directorApi.summonTrain = summonTrain;
  directorApi.departTrainNow = departTrainNow;
  directorApi.getCampaignState = () => campaignState;
  Object.defineProperty(directorApi, 'stationIndex', {
    configurable: true,
    enumerable: true,
    get: () => CORE.stationIndex,
    set: (v) => { CORE.stationIndex = v | 0; }
  });
  Object.defineProperty(directorApi, 'activeTravelDir', {
    configurable: true,
    enumerable: true,
    get: () => CORE.activeTravelDir
  });
  LRT.Director = directorApi;
})(window.LRT = window.LRT || {});
