(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const CORE = (I.core = I.core || {});
  const C = LRT.Config;
  const MODES = C.MODES;
  const STATES = C.STATES;

  const _spawnEyePos = new THREE.Vector3();
  const _spawnCamFwd = new THREE.Vector3();
  const _spawnCandDir = new THREE.Vector3();

  const TRAIN_CALL_CONCEALED_ZONES = [
    'concealed_station', 'stairwell_pocket', 'concourse',
    'platform_south', 'platform_north', 'jpo', 'depot', 'garden',
    'island_far', 'plat2', 'balcony', 'island2'
  ];

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

    const tier1 = [];
    const tier2 = [];
    const tier3 = [];
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
    const campaignState = CORE.campaignState;
    if (CORE.tutorialActive) return 0;
    if (CORE.gameMode !== MODES.SURVIVAL) return 0;
    if (CORE.difficultyKey !== 'hard' && CORE.difficultyKey !== 'nightmare') return 0;
    if (campaignState && campaignState.triggeredSurgeStations.has(stationIdx)) return 0;
    if (campaignState) campaignState.triggeredSurgeStations.add(stationIdx);

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
    const campaignState = CORE.campaignState;
    if (CORE.tutorialActive) return 0;
    if (CORE.gameMode !== MODES.SURVIVAL || CORE.gameState === STATES.MENU) return 0;
    if (campaignState && campaignState.clearedStations.has(stationIdx)) return 0;
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

  function spawnCurrentWave() {
    if (CORE.tutorialActive) return;
    if (CORE.gameMode !== MODES.SURVIVAL) return;
    if (!LRT.Enemies || !LRT.Enemies.spawnWave) return;
    const nodes = LRT.Station && LRT.Station.getSpawnNodes ? LRT.Station.getSpawnNodes() : [];
    LRT.Enemies.spawnWave(CORE.currentWave, CORE.stationIndex, nodes, CORE.difficultyKey);
    if (LRT.Audio) LRT.Audio.play('zombie_groan_1', { gain: 0.7 });
    if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
      LRT.PlayerUI.setNotice(`WAVE ${CORE.currentWave}`, '#ef4444');
    }
  }

  CORE.pickDifficultyVariant = pickDifficultyVariant;
  CORE.gatherClusterSpawnNodes = gatherClusterSpawnNodes;
  CORE.spawnExtraInfectedCluster = spawnExtraInfectedCluster;
  CORE.triggerObjectiveSurgeWave = triggerObjectiveSurgeWave;
  CORE.buildTrainCallSiegeVariants = buildTrainCallSiegeVariants;
  CORE.triggerTrainCallSiegeWave = triggerTrainCallSiegeWave;
  CORE.triggerTrainCallReinforcementTrickle = triggerTrainCallReinforcementTrickle;
  CORE.spawnStationRoamers = spawnStationRoamers;
  CORE.spawnCurrentWave = spawnCurrentWave;
})(window.LRT = window.LRT || {});
