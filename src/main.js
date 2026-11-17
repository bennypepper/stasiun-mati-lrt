(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const CORE = (I.core = I.core || {});

  const C = LRT.Config;
  const STATES = C.STATES;
  const MODES = C.MODES;

  let cityVisibilityTimer = 0;
  let simTime = 0;
  let lastFrameMs = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let currentFps = 60;
  let loopPaused = false;
  let rafId = 0;
  let _bootPromise = null;
  let _lastActiveObjKey = null;
  let _atmosphereMode = 'night_horror';
  const _camForward = new THREE.Vector3();
  const _bvhMeshesScratch = [];
  const consoleErrors = [];

  function computePlayerCityContext(pState) {
    const pos = pState && pState.pos ? pState.pos : (CORE.camera ? CORE.camera.position : null);
    const trainCruising = CORE.gameState === STATES.TRAIN_CRUISE
      || CORE.gameState === STATES.TRAIN_DEPARTING
      || CORE.gameState === STATES.TRAIN_ARRIVING;
    const insideTrain = !!(pState && pState.isInsideTrain);
    let insideConcourse = false;
    if (pos && !insideTrain && !trainCruising && LRT.City && LRT.City._concourseBounds) {
      const cb = LRT.City._concourseBounds;
      const rail = (LRT.Station && typeof LRT.Station.getRailConfig === 'function') ? LRT.Station.getRailConfig() : null;
      const concMinX = rail ? rail.p1MaxX : 6.66;
      const offsetZ = (LRT.Station && LRT.Station.rootGroup) ? (LRT.Station.rootGroup.position.z || 0) : 0;
      const lz = pos.z - offsetZ;
      insideConcourse = pos.x >= concMinX && pos.x <= cb.concMaxX
        && lz >= cb.concMinZ && lz <= cb.concMaxZ
        && pos.y >= -0.3 && pos.y <= 3.8;
    }
    return { insideConcourse, insideTrain, trainCruising };
  }

  function updateCityVisibility(pState) {
    if (LRT.City && typeof LRT.City.updateVisibility === 'function' && CORE.camera) {
      if (typeof CORE.updateFrustum === 'function') CORE.updateFrustum();
      const frustum = typeof CORE.getFrustum === 'function' ? CORE.getFrustum() : null;
      const ctx = computePlayerCityContext(pState);
      LRT.City.updateVisibility(CORE.camera.position, CORE.qualityKey, frustum, ctx);
    }
  }

  function captureErrors() {
    window.addEventListener('error', (e) => {
      consoleErrors.push(String(e.message || e.error || e));
    });
    window.addEventListener('unhandledrejection', (e) => {
      consoleErrors.push(String(e.reason || e));
    });
  }

  function getStationSeed(idx) {
    return (CORE.campaignSeed + idx * 7919) >>> 0;
  }

  CORE.updateCityVisibility = updateCityVisibility;

  function normalizeAtmosphereMode(mode) {
    return mode === 'daylight_outbreak' ? 'daylight_outbreak' : 'night_horror';
  }

  function getAtmosphereMode() {
    if (typeof CORE.getAtmosphereMode === 'function') {
      return normalizeAtmosphereMode(CORE.getAtmosphereMode());
    }
    return normalizeAtmosphereMode(CORE.atmosphereMode || _atmosphereMode);
  }

  function getCampaignMoodKey(idx) {
    const i = ((idx | 0) % 6 + 6) % 6;
    if (typeof CORE.getCampaignMoodForStation === 'function') {
      const k = CORE.getCampaignMoodForStation(i);
      if (k && C.MOODS && (k in C.MOODS)) return k;
    }
    if (getAtmosphereMode() === 'daylight_outbreak' && Array.isArray(C.CAMPAIGN_MOODS_DAYLIGHT) && C.CAMPAIGN_MOODS_DAYLIGHT.length) {
      return C.CAMPAIGN_MOODS_DAYLIGHT[i % C.CAMPAIGN_MOODS_DAYLIGHT.length] || 'DAYLIGHT_CLEAR';
    }
    return (CORE.CAMPAIGN_MOODS && CORE.CAMPAIGN_MOODS[i]) || 'GOLDEN_DUSK';
  }

  function _resolveStationBuildParams(idx) {
    const seed = getStationSeed(idx);
    const autoMood = (CORE.gameState !== STATES.MENU && CORE.gameMode === MODES.SURVIVAL && !CORE.lightingLockedByUser);
    const targetMoodKey = autoMood
      ? getCampaignMoodKey(idx)
      : CORE.currentLightingKey;
    const savedUsed = CORE.campaignState.stationUsedIds ? CORE.campaignState.stationUsedIds.get(idx) : null;
    const usedIds = savedUsed ? new Set(savedUsed) : new Set();
    const powerRestored = (idx > 0) || !!(CORE.campaignState.stationObjectives && CORE.campaignState.stationObjectives[0] && CORE.campaignState.stationObjectives[0].genOn);
    return { seed, targetMoodKey, usedIds, powerRestored };
  }

  function finishBuildStation(idx, offsetZ, st) {
    _lastActiveObjKey = null;
    const pState = LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' ? LRT.PlayerUI.getState() : null;
    updateCityVisibility(pState);
    if (typeof CORE.onStationBuilt === 'function') {
      CORE.onStationBuilt(idx, offsetZ || 0, st);
    }
    if (!offsetZ && !CORE.tutorialActive && CORE.gameMode === MODES.SURVIVAL && CORE.gameState !== STATES.MENU && typeof CORE.writeSave === 'function') {
      CORE.writeSave();
    }
    return st;
  }

  function beginBuildStation(idx, offsetZ) {
    if (!LRT.Station) return null;
    const p = _resolveStationBuildParams(idx);
    if (typeof LRT.Station.beginIncrementalBuild === 'function') {
      LRT.Station.beginIncrementalBuild(idx, p.seed, CORE.gameMode, CORE.scene, offsetZ || 0, {
        usedIds: p.usedIds,
        powerRestored: p.powerRestored,
        moodKey: p.targetMoodKey,
        preserveFog: true,
        deferAttach: true
      });
      return LRT.Station;
    }
    return buildStation(idx, offsetZ);
  }

  function buildStation(idx, offsetZ) {
    const p = _resolveStationBuildParams(idx);
    if (LRT.Station && LRT.Station.build) {
      CORE.currentLightingKey = p.targetMoodKey;
      LRT.Station.build(idx, p.seed, CORE.gameMode, CORE.scene, offsetZ || 0, {
        usedIds: p.usedIds,
        powerRestored: p.powerRestored,
        moodKey: CORE.currentLightingKey
      });
      const st = LRT.Station.getStats ? LRT.Station.getStats() : null;
      CORE.applyMoodLighting(st, { moodKey: CORE.currentLightingKey });
      return finishBuildStation(idx, offsetZ || 0, st);
    }
    return null;
  }

  CORE.beginBuildStation = beginBuildStation;
  CORE.finishBuildStation = finishBuildStation;
  CORE.buildStation = buildStation;

  function startGame(mode, opts) {
    const o = opts || {};
    const isTutorial = !!(o.tutorial || mode === 'tutorial');
    const isResume = !!(o.resume || mode === 'continue');
    if (CORE.tutorialActive && typeof CORE.endTutorial === 'function') {
      CORE.endTutorial('abort');
    }
    CORE.gameMode = mode === MODES.EXPLORATION ? MODES.EXPLORATION : MODES.SURVIVAL;
    CORE.lightingLockedByUser = false;
    CORE.isMoodLerping = false;
    CORE._rideFromMoodKey = null;
    CORE._rideToMoodKey = null;
    _lastActiveObjKey = null;
    if (LRT.Audio) {
      LRT.Audio.unlock();
      if (typeof LRT.Audio.stopVoice === 'function') LRT.Audio.stopVoice();
      if (typeof LRT.Audio.stopAllLoops === 'function') LRT.Audio.stopAllLoops();
    }

    const savedData = (isResume && typeof CORE.readSave === 'function') ? CORE.readSave() : null;
    if (!isResume && !isTutorial && CORE.gameMode === MODES.SURVIVAL && typeof CORE.clearSave === 'function') {
      CORE.clearSave();
    }

    CORE.resetGameOverDom();
    CORE.resetCampaignState();

    if (savedData) {
      if (savedData.difficultyKey) applyDifficultySetting(savedData.difficultyKey, false);
      if (savedData.atmosphereMode) applyAtmosphereSetting(savedData.atmosphereMode, false);
    }

    if (LRT.Station && LRT.Station.dispose) LRT.Station.dispose(CORE.scene);
    if (LRT.Enemies && LRT.Enemies.reset) LRT.Enemies.reset();
    if (LRT.Enemies && typeof LRT.Enemies.setDifficulty === 'function') LRT.Enemies.setDifficulty(CORE.difficultyKey);
    if (LRT.Enemies && typeof LRT.Enemies.setAtmosphereMode === 'function') LRT.Enemies.setAtmosphereMode(getAtmosphereMode());
    if (LRT.Weapons && LRT.Weapons.reset) LRT.Weapons.reset(CORE.gameMode, CORE.difficultyKey);
    if (LRT.Weapons && LRT.Weapons.setVisible) LRT.Weapons.setVisible(true);
    if (LRT.Train && LRT.Train.reset) LRT.Train.reset(CORE.gameMode);

    CORE.stationIndex = 0;
    CORE.activeTravelDir = 1;
    CORE.currentWave = 1;
    CORE.wavesPerStation = 1;
    CORE.waveClearTimer = 0;
    CORE.boardingCloseTimer = 0;
    CORE.rideCompleteReady = false;
    CORE.stationsCleared = 0;
    CORE.totalKills = 0;
    CORE.prevTrainState = 'AWAY';
    CORE.enemySightTimer = 0;
    CORE.victoryCruiseTimer = 0;

    if (savedData && typeof CORE.applySaveData === 'function') {
      CORE.applySaveData(savedData);
    }

    CORE.gameState = STATES.STATION_ACTIVE;
    if (CORE.gameMode === MODES.EXPLORATION || isTutorial) {
      CORE.currentLightingKey = 'DAYLIGHT_CLEAR';
      if (isTutorial) CORE.lightingLockedByUser = true;
    }
    CORE.syncMenuLights();
    const stats = buildStation(CORE.stationIndex, 0);
    const spawnPos = (stats && stats.spawnPos) || CORE.pickPlayerSpawnPos();
    LRT.PlayerUI.reset(spawnPos, CORE.gameMode === MODES.EXPLORATION || isTutorial, CORE.gameMode);

    if (savedData) {
      const p = LRT.PlayerUI.getState();
      if (p) {
        if (typeof savedData.health === 'number') p.health = Math.max(10, Math.min(p.maxHealth || 100, savedData.health));
        if (typeof savedData.maxArmor === 'number') p.maxArmor = Math.max(100, savedData.maxArmor);
        if (typeof savedData.armor === 'number') p.armor = Math.max(0, Math.min(p.maxArmor, savedData.armor));
      }
      if (savedData.weapons && LRT.Weapons && typeof LRT.Weapons.loadSaveState === 'function') {
        LRT.Weapons.loadSaveState(savedData.weapons);
      }
    }

    updateCityVisibility(LRT.PlayerUI.getState());
    LRT.PlayerUI.setPaused(false, true);
    LRT.PlayerUI.showScreen('play');
    LRT.PlayerUI.requestLock();

    if (isTutorial) {
      if (typeof CORE.beginTutorial === 'function') CORE.beginTutorial();
      return;
    }

    if (CORE.gameMode === MODES.SURVIVAL) {
      const alreadyCleared = CORE.campaignState && CORE.campaignState.clearedStations && CORE.campaignState.clearedStations.has(CORE.stationIndex);
      if (!alreadyCleared) {
        CORE.spawnCurrentWave();
      }
      if (CORE.stationIndex === 0 && !CORE.campaignState.voTriggered.has('VO_01_INTRO')) {
        CORE.campaignState.voTriggered.add('VO_01_INTRO');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_01_INTRO');
        }
      }
      if (typeof CORE.writeSave === 'function') CORE.writeSave();
    } else {
      LRT.PlayerUI.setNotice('EXPLORATION MODE — TEKAN [T] UNTUK PANGGIL LRT', '#e0b422');
      if (LRT.Weapons && LRT.Weapons.addAmmo) {
        LRT.Weapons.addAmmo('all', 999);
      }
    }
  }

  function stepSimulation(dt) {
    simTime += dt;
    if (LRT.Audio && typeof LRT.Audio.tickVoice === 'function') {
      LRT.Audio.tickVoice(dt);
    }
    if (LRT.Materials) {
      LRT.Materials.update(simTime);
    }

    const pState = LRT.PlayerUI.getState();
    if (pState) {
      const cp = Math.cos(pState.pitch || 0);
      _camForward.set(-Math.sin(pState.yaw || 0) * cp, Math.sin(pState.pitch || 0), -Math.cos(pState.yaw || 0) * cp).normalize();
    } else if (CORE.camera) {
      CORE.camera.getWorldDirection(_camForward);
    }
    if (LRT.Station && LRT.Station.update) {
      LRT.Station.update(dt, pState ? pState.pos : undefined, _camForward, CORE.difficultyKey);
    }

    cityVisibilityTimer -= dt;
    if (cityVisibilityTimer <= 0) {
      cityVisibilityTimer = 0.25;
      updateCityVisibility(pState);
    }

    const stStats = LRT.Station && LRT.Station.getStats ? LRT.Station.getStats() : null;
    const stAtmos = LRT.Station && LRT.Station.getAtmosphere ? LRT.Station.getAtmosphere() : null;

    if (CORE.updateTrainCampaign(dt, pState)) {
      return;
    }

    const stationGrid = LRT.Station && LRT.Station.getSpatialGrid ? LRT.Station.getSpatialGrid() : null;
    const stationCols = LRT.Station && LRT.Station.getColliders ? LRT.Station.getColliders() : [];
    const trainCols = LRT.Train && LRT.Train.getColliders ? LRT.Train.getColliders() : [];
    const bvhMeshes = _bvhMeshesScratch;
    bvhMeshes.length = 0;
    if (LRT.Station && typeof LRT.Station.getBVHMeshes === 'function') {
      const list = LRT.Station.getBVHMeshes();
      if (Array.isArray(list)) for (let i = 0; i < list.length; i++) bvhMeshes.push(list[i]);
    } else if (LRT.Station && typeof LRT.Station.getBVHMesh === 'function') {
      const m = LRT.Station.getBVHMesh();
      if (m) bvhMeshes.push(m);
    }
    if (LRT.City && typeof LRT.City.getBVHMeshes === 'function') {
      const list = LRT.City.getBVHMeshes();
      if (Array.isArray(list)) for (let i = 0; i < list.length; i++) bvhMeshes.push(list[i]);
    } else if (LRT.City && typeof LRT.City.getBVHMesh === 'function') {
      const m = LRT.City.getBVHMesh();
      if (m) bvhMeshes.push(m);
    }

    LRT.PlayerUI.update(dt, {
      stationGrid,
      stationColliders: stationCols,
      trainColliders: trainCols,
      bvhMeshes
    });

    CORE.updateSunTracking(pState.pos.x, pState.pos.z);
    if (CORE.sky && CORE.camera) CORE.sky.position.copy(CORE.camera.position);

    const trainSpeed = LRT.Train && LRT.Train.getSpeed ? LRT.Train.getSpeed() : 0;
    const tState = LRT.Train && LRT.Train.getState ? LRT.Train.getState() : 'AWAY';
    if (LRT.Weapons && LRT.Weapons.update) {
      LRT.Weapons.update(dt, pState, trainSpeed);
    }

    let enemyOpts = null;
    if (CORE.camera) {
      CORE.camera.getWorldDirection(_camForward);
      enemyOpts = {
        camPos: CORE.camera.position,
        camForward: _camForward,
        camera: CORE.camera,
        moodKey: CORE.currentLightingKey,
        flashlightOn: !!(pState && pState.flashlightOn)
      };
    }

    CORE.updateSurvivalAndVoChecks(dt, pState, stationGrid, trainCols, enemyOpts);
    if (CORE.tutorialActive && typeof CORE.tutorialUpdate === 'function') {
      CORE.tutorialUpdate(dt, pState);
      if (!CORE.tutorialActive) return;
    }

    const alive = LRT.Enemies && LRT.Enemies.getAliveCount ? LRT.Enemies.getAliveCount() : 0;
    const isTrainCruise = CORE.gameState === STATES.TRAIN_CRUISE || tState === 'CRUISE';
    if (typeof CORE.tickShadowCache === 'function') {
      CORE.tickShadowCache(dt, !isTrainCruise && (trainSpeed > 0.05 || tState === 'APPROACHING'), alive, isTrainCruise);
    }

    const activeIds = typeof CORE.getActiveObjectiveTargetIds === 'function'
      ? CORE.getActiveObjectiveTargetIds()
      : [];
    const activeKey = activeIds.join('|');
    if (activeKey !== _lastActiveObjKey) {
      _lastActiveObjKey = activeKey;
      if (LRT.Station && typeof LRT.Station.setActiveObjectiveIds === 'function') {
        LRT.Station.setActiveObjectiveIds(activeIds);
      }
    }
    if (LRT.PlayerUI && typeof LRT.PlayerUI.updateWaypoints === 'function') {
      if (CORE.tutorialActive && typeof CORE.getTutorialMarkers === 'function') {
        LRT.PlayerUI.updateWaypoints(CORE.getTutorialMarkers(), null, CORE.camera);
      } else if (LRT.Station && typeof LRT.Station.getObjectiveMarkers === 'function') {
        const markers = LRT.Station.getObjectiveMarkers();
        LRT.PlayerUI.updateWaypoints(markers, activeIds, CORE.camera);
      }
    }

    const info = CORE.buildObjectiveInfo(stStats, stAtmos);
    if (CORE.tutorialActive && typeof CORE.getTutorialInfo === 'function') {
      const tInfo = CORE.getTutorialInfo();
      if (tInfo) {
        info.objectiveTitle = tInfo.title;
        info.objectiveDetail = tInfo.detail;
      }
    }
    info.fps = currentFps;
    info.drawCalls = CORE.lastDrawCalls || (CORE.renderer ? CORE.renderer.info.render.calls : 0);
    LRT.PlayerUI.updateHud(info);
  }

  function animate(nowMs) {
    rafId = 0;
    const rawDt = lastFrameMs ? (nowMs - lastFrameMs) / 1000 : 0.016;
    lastFrameMs = nowMs;
    const dt = Math.min(rawDt, 0.05);

    fpsAccum += rawDt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5) {
      currentFps = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
    }

    if (CORE.gameState === STATES.MENU && CORE.camera) {
      simTime += dt;
      if (LRT.Materials) LRT.Materials.update(simTime);
      if (LRT.Station && LRT.Station.update) LRT.Station.update(dt);
      CORE.updateMenuCamera(simTime);
    } else if (CORE.gameState !== STATES.GAME_OVER) {
      const pauseVisible = LRT.PlayerUI.getDom()['pause-overlay'] && !LRT.PlayerUI.getDom()['pause-overlay'].classList.contains('hidden');
      if (!pauseVisible) {
        stepSimulation(dt);
      }
    }

    CORE.renderFrame();
    if (!loopPaused) {
      rafId = requestAnimationFrame(animate);
    }
  }

  function applyDifficultySetting(key, showToast) {
    const applied = typeof CORE.setDifficulty === 'function' ? CORE.setDifficulty(key) : key;
    if (LRT.Enemies && typeof LRT.Enemies.setDifficulty === 'function') {
      LRT.Enemies.setDifficulty(applied);
    }
    if (LRT.Weapons && typeof LRT.Weapons.setDifficulty === 'function') {
      LRT.Weapons.setDifficulty(applied);
    }
    if (showToast && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
      const tier = C.DIFFICULTY_TIERS && C.DIFFICULTY_TIERS[applied];
      LRT.PlayerUI.setNotice(`DIFFICULTY: ${tier ? tier.label : String(applied).toUpperCase()}`, tier ? tier.color : '#e0b422');
    }
    return applied;
  }

  function applyAtmosphereSetting(mode, notify) {
    const normalized = normalizeAtmosphereMode(mode);
    const applied = typeof CORE.setAtmosphereMode === 'function'
      ? normalizeAtmosphereMode(CORE.setAtmosphereMode(normalized))
      : normalized;
    _atmosphereMode = applied;
    CORE.atmosphereMode = applied;

    if (LRT.Enemies && typeof LRT.Enemies.setAtmosphereMode === 'function') {
      LRT.Enemies.setAtmosphereMode(applied);
    }
    if (LRT.PlayerUI && typeof LRT.PlayerUI.syncAtmosphereUi === 'function') {
      LRT.PlayerUI.syncAtmosphereUi(applied);
    }
    if (typeof CORE.saveSettings === 'function') {
      CORE.saveSettings({ atmosphereMode: applied });
    }

    if (!CORE.lightingLockedByUser && CORE.gameState !== STATES.MENU && CORE.gameMode === MODES.SURVIVAL && typeof CORE.applyMoodLighting === 'function') {
      const targetMoodKey = getCampaignMoodKey(CORE.stationIndex || 0);
      const stStats = (LRT.Station && typeof LRT.Station.getStats === 'function') ? LRT.Station.getStats() : null;
      CORE.isMoodLerping = false;
      CORE._rideFromMoodKey = null;
      CORE._rideToMoodKey = null;
      CORE.applyMoodLighting(stStats, { moodKey: targetMoodKey });
    }

    if (notify === true && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
      const label = applied === 'daylight_outbreak'
        ? 'TIME CYCLE: DAYLIGHT–SUNSET'
        : 'TIME CYCLE: NIGHT HORROR';
      const color = applied === 'daylight_outbreak' ? '#f59e0b' : '#38bdf8';
      LRT.PlayerUI.setNotice(label, color);
    }
    return applied;
  }

  function bindUiButtons() {
    const dom = LRT.PlayerUI.getDom();

    if (dom['btn-continue']) {
      dom['btn-continue'].addEventListener('click', () => startGame(MODES.SURVIVAL, { resume: true }));
    }
    if (dom['btn-start-survival']) {
      dom['btn-start-survival'].addEventListener('click', () => startGame(MODES.SURVIVAL));
    }
    if (dom['btn-start-tutorial']) {
      dom['btn-start-tutorial'].addEventListener('click', () => startGame(MODES.SURVIVAL, { tutorial: true }));
    }
    if (dom['btn-start-exploration']) {
      dom['btn-start-exploration'].addEventListener('click', () => startGame(MODES.EXPLORATION));
    }
    if (dom['btn-resume']) {
      dom['btn-resume'].addEventListener('click', () => resume());
    }
    if (dom['btn-restart-mode']) {
      dom['btn-restart-mode'].addEventListener('click', () => startGame(CORE.gameMode));
    }
    if (dom['btn-retry']) {
      dom['btn-retry'].addEventListener('click', () => startGame(MODES.SURVIVAL));
    }
    const backToMenu = () => {
      if (CORE.tutorialActive && typeof CORE.endTutorial === 'function') {
        CORE.endTutorial('abort');
        return;
      }
      if (!CORE.tutorialActive && CORE.gameMode === MODES.SURVIVAL && CORE.gameState === STATES.STATION_ACTIVE && typeof CORE.writeSave === 'function') {
        CORE.writeSave();
      }
      CORE.gameState = STATES.MENU;
      LRT.PlayerUI.setPaused(true, false);
      LRT.PlayerUI.releaseLock();
      if (LRT.Audio) {
        if (typeof LRT.Audio.stopVoice === 'function') LRT.Audio.stopVoice();
        LRT.Audio.stopAllLoops();
      }
      if (LRT.Weapons && LRT.Weapons.setVisible) LRT.Weapons.setVisible(false);
      CORE.applyBrightness();
      CORE.updateMenuCamera(simTime);
      LRT.PlayerUI.showScreen('menu');
    };
    CORE.backToMenu = backToMenu;
    if (dom['btn-back-menu']) dom['btn-back-menu'].addEventListener('click', backToMenu);
    if (dom['btn-gameover-menu']) dom['btn-gameover-menu'].addEventListener('click', backToMenu);

    const toggleMute = () => {
      if (!LRT.Audio) return;
      LRT.Audio.setMute(!LRT.Audio.isMuted());
      LRT.PlayerUI.syncMuteUi();
    };
    if (dom['btn-menu-mute']) dom['btn-menu-mute'].addEventListener('click', toggleMute);
    if (dom['btn-pause-mute']) dom['btn-pause-mute'].addEventListener('click', toggleMute);

    if (dom['btn-menu-lighting']) dom['btn-menu-lighting'].addEventListener('click', () => CORE.cycleLightingMode());
    if (dom['btn-pause-lighting']) dom['btn-pause-lighting'].addEventListener('click', () => CORE.cycleLightingMode());

    [dom['menu-quality-group'], dom['pause-quality-group']].forEach((grp) => {
      if (!grp) return;
      grp.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-quality]');
        if (btn) CORE.applyQuality(btn.dataset.quality);
      });
    });

    const settingsRoots = [dom['menu-overlay'], dom['pause-overlay']].filter(Boolean);
    const delegates = settingsRoots.length ? settingsRoots : [document];
    delegates.forEach((root) => {
      root.addEventListener('click', (e) => {
        const diffBtn = e.target.closest('[data-difficulty]');
        if (diffBtn) {
          applyDifficultySetting(diffBtn.dataset.difficulty, true);
          return;
        }
        const atmoBtn = e.target.closest('[data-atmosphere]');
        if (atmoBtn) {
          applyAtmosphereSetting(atmoBtn.dataset.atmosphere, true);
          return;
        }
        const resBtn = e.target.closest('[data-resscale]');
        if (resBtn) {
          if (typeof CORE.setRenderScale === 'function') CORE.setRenderScale(resBtn.dataset.resscale);
          return;
        }
        const aoBtn = e.target.closest('[data-ao]');
        if (aoBtn) {
          if (typeof CORE.setAoMode === 'function') CORE.setAoMode(aoBtn.dataset.ao);
          return;
        }
        if (e.target.closest('#btn-menu-shadows, #btn-pause-shadows')) {
          if (typeof CORE.setShadowsEnabled === 'function') CORE.setShadowsEnabled(!CORE.shadowsEnabled);
          return;
        }
        if (e.target.closest('#btn-menu-bloom, #btn-pause-bloom')) {
          if (typeof CORE.setBloomEnabled === 'function') CORE.setBloomEnabled(!CORE.bloomEnabled);
          return;
        }
        if (e.target.closest('#btn-menu-fps, #btn-pause-fps')) {
          if (typeof CORE.setFpsCounterEnabled === 'function') CORE.setFpsCounterEnabled(!CORE.fpsCounterEnabled);
        }
      });
    });
  }

  function pause() {
    if (CORE.gameState === STATES.MENU || CORE.gameState === STATES.GAME_OVER) return;
    LRT.PlayerUI.setPaused(true, false);
    LRT.PlayerUI.showScreen('pause');
    if (LRT.PlayerUI && typeof LRT.PlayerUI.syncAllSettingsUi === 'function' && typeof CORE.getSettings === 'function') {
      LRT.PlayerUI.syncAllSettingsUi(Object.assign({ atmosphereMode: getAtmosphereMode() }, CORE.getSettings() || {}));
    }
  }

  function resume() {
    if (CORE.gameState === STATES.MENU || CORE.gameState === STATES.GAME_OVER) return;
    if (LRT.Audio) LRT.Audio.unlock();
    LRT.PlayerUI.showScreen('play');
    LRT.PlayerUI.setPaused(false, true);
    LRT.PlayerUI.requestLock();
  }

  async function boot() {
    if (_bootPromise) return _bootPromise;
    _bootPromise = (async () => {
      captureErrors();
      const canvas = document.getElementById('game-canvas');
      CORE.canvas = canvas;
      const w = Math.max(2, window.innerWidth);
      const h = Math.max(2, window.innerHeight);

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false
      });
      try {
        const gl = renderer.getContext();
        const dbgExt = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
        const rStr = gl ? String(dbgExt ? gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : '';
        CORE.isSoftwareRenderer = /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(rStr);
      } catch (e) {
        CORE.isSoftwareRenderer = false;
      }
      renderer.setSize(w, h, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      CORE.renderer = renderer;

      const scene = new THREE.Scene();
      CORE.scene = scene;
      const camera = new THREE.PerspectiveCamera(
        C.PLAYER_CFG.baseFov,
        w / h,
        0.08,
        520
      );
      scene.add(camera);
      CORE.camera = camera;

      const JSM = window.THREE_JSM || {};
      if (JSM.Sky) {
        CORE.sky = new JSM.Sky();
        CORE.sky.scale.setScalar(420);
        CORE.sky.frustumCulled = false;
        scene.add(CORE.sky);
      }

      CORE.hemiLight = new THREE.HemisphereLight(0xdbeeff, 0x5c5348, 0.92);
      scene.add(CORE.hemiLight);

      CORE.sunLight = new THREE.DirectionalLight(0xfff3de, 2.75);
      CORE.sunLight.position.set(28, 46, 22);
      CORE.sunLight.castShadow = true;
      CORE.sunLight.shadow.camera.left = -38;
      CORE.sunLight.shadow.camera.right = 38;
      CORE.sunLight.shadow.camera.top = 38;
      CORE.sunLight.shadow.camera.bottom = -38;
      CORE.sunLight.shadow.camera.near = 1;
      CORE.sunLight.shadow.camera.far = 140;
      CORE.sunLight.shadow.bias = -0.00045;
      CORE.sunLight.shadow.normalBias = 0.025;
      CORE.sunLight.shadow.mapSize.set(1024, 1024);
      scene.add(CORE.sunLight);
      scene.add(CORE.sunLight.target);

      if (LRT.City && typeof LRT.City.setTrackGatesOpen === 'function') {
        LRT.City.setTrackGatesOpen(false);
      }

      CORE.initPostProcessing(w, h);
      const savedSettings = typeof CORE.getSettings === 'function' ? CORE.getSettings() : null;
      CORE.applyQuality((savedSettings && savedSettings.qualityKey) || 'balanced');
      if (savedSettings) {
        if (savedSettings.resScaleMode && typeof CORE.setRenderScale === 'function') CORE.setRenderScale(savedSettings.resScaleMode);
        if (typeof savedSettings.shadowsEnabled === 'boolean' && typeof CORE.setShadowsEnabled === 'function') CORE.setShadowsEnabled(savedSettings.shadowsEnabled);
        if (typeof savedSettings.bloomEnabled === 'boolean' && typeof CORE.setBloomEnabled === 'function') CORE.setBloomEnabled(savedSettings.bloomEnabled);
        if (savedSettings.aoMode && typeof CORE.setAoMode === 'function') CORE.setAoMode(savedSettings.aoMode);
        if (typeof savedSettings.fpsCounterEnabled === 'boolean' && typeof CORE.setFpsCounterEnabled === 'function') CORE.setFpsCounterEnabled(savedSettings.fpsCounterEnabled);
        if (savedSettings.difficultyKey && typeof CORE.setDifficulty === 'function') CORE.setDifficulty(savedSettings.difficultyKey);
        if (savedSettings.atmosphereMode) applyAtmosphereSetting(savedSettings.atmosphereMode, false);
      }

      if (LRT.Audio && LRT.Audio.init) LRT.Audio.init();
      if (LRT.Materials && LRT.Materials.init) LRT.Materials.init(renderer, scene);
      LRT.PlayerUI.init(canvas, camera, {
        onPause: pause,
        onInteractResult: CORE.handleInteractResult,
        onSummonTrain: (dirOverride) => {
          if (CORE.gameState === STATES.STATION_ACTIVE) {
            CORE.summonTrain(dirOverride, false);
          } else if (CORE.gameState === STATES.TRAIN_BOARDING) {
            CORE.departTrainNow();
          }
        }
      });

      if (LRT.Train && LRT.Train.init) LRT.Train.init(scene);
      if (LRT.Weapons && LRT.Weapons.init) {
        LRT.Weapons.init(scene, camera);
        if (typeof LRT.Weapons.setDifficulty === 'function') LRT.Weapons.setDifficulty(CORE.difficultyKey);
        if (LRT.Weapons.setVisible) LRT.Weapons.setVisible(false);
      }
      if (LRT.Enemies && LRT.Enemies.init) {
        LRT.Enemies.init(scene);
        if (typeof LRT.Enemies.setDifficulty === 'function') LRT.Enemies.setDifficulty(CORE.difficultyKey);
        if (typeof LRT.Enemies.setAtmosphereMode === 'function') LRT.Enemies.setAtmosphereMode(getAtmosphereMode());
      }

      // Pre-build Station 0 & apply startup Daylight preset
      buildStation(0);
      CORE.setLightingMode(CORE.currentLightingKey);
      CORE.lightingLockedByUser = false;
      CORE.updateMenuCamera(simTime);

      // Async shader warmup BEFORE hiding loading screen (zero reload/switch freezes!)
      if (LRT.Weapons && typeof LRT.Weapons.setWarmupMode === 'function') LRT.Weapons.setWarmupMode(true);
      if (LRT.Train && typeof LRT.Train.setWarmupMode === 'function') LRT.Train.setWarmupMode(true);
      if (LRT.Enemies && typeof LRT.Enemies.setWarmupMode === 'function') LRT.Enemies.setWarmupMode(true);

      try {
        if (typeof CORE.warmupAllVariants === 'function') {
          await CORE.warmupAllVariants();
        } else if (typeof renderer.compileAsync === 'function') {
          await renderer.compileAsync(scene, camera);
        } else {
          renderer.compile(scene, camera);
        }
        CORE.renderFrame();
      } catch (warmErr) {
        console.warn('[main] Shader warmup fallback:', warmErr);
      }

      if (LRT.Weapons && typeof LRT.Weapons.setWarmupMode === 'function') LRT.Weapons.setWarmupMode(false);
      if (LRT.Train && typeof LRT.Train.setWarmupMode === 'function') LRT.Train.setWarmupMode(false);
      if (LRT.Enemies && typeof LRT.Enemies.setWarmupMode === 'function') LRT.Enemies.setWarmupMode(false);

      // Render one clean menu frame with restored visibility to pre-warm composer targets
      CORE.renderFrame();

      LRT.PlayerUI.showScreen('menu');
      LRT.PlayerUI.setPaused(true, false);
      bindUiButtons();
      if (LRT.PlayerUI && typeof LRT.PlayerUI.syncAllSettingsUi === 'function' && typeof CORE.getSettings === 'function') {
        LRT.PlayerUI.syncAllSettingsUi(Object.assign({ atmosphereMode: getAtmosphereMode() }, CORE.getSettings() || {}));
      }

      window.addEventListener('resize', () => {
        if (!CORE.renderer || !CORE.camera) return;
        const rw = Math.max(2, window.innerWidth);
        const rh = Math.max(2, window.innerHeight);
        CORE.camera.aspect = rw / rh;
        CORE.camera.updateProjectionMatrix();
        if (typeof CORE.applyRenderResolution === 'function') {
          CORE.applyRenderResolution(rw, rh);
        } else {
          CORE.renderer.setSize(rw, rh, false);
          if (CORE.composer) {
            CORE.composer.setPixelRatio(CORE.renderer.getPixelRatio());
            CORE.composer.setSize(rw, rh);
          }
        }
      });

      document.addEventListener('visibilitychange', () => {
        lastFrameMs = performance.now();
      });

      // Expose deterministic debug & automated QA hook
      window.__LRT_DEBUG__ = {
        getTelemetry: () => {
          const p = LRT.PlayerUI.getState();
          const st = LRT.Station && LRT.Station.getStats ? LRT.Station.getStats() : {};
          const wh = LRT.Weapons && LRT.Weapons.getHudState ? LRT.Weapons.getHudState() : {};
          return {
            revision: THREE.REVISION,
            state: CORE.gameState,
            mode: CORE.gameMode,
            atmosphereMode: getAtmosphereMode(),
            lightingMode: CORE.currentLightingKey,
            lightingLockedByUser: CORE.lightingLockedByUser,
            stationIndex: CORE.stationIndex,
            activeTravelDir: CORE.activeTravelDir,
            stationName: st.name || st.stationName || null,
            wave: CORE.currentWave,
            aliveEnemies: LRT.Enemies && LRT.Enemies.getAliveCount ? LRT.Enemies.getAliveCount() : 0,
            trainState: LRT.Train && LRT.Train.getState ? LRT.Train.getState() : 'MISSING',
            trainSpeed: LRT.Train && LRT.Train.getSpeed ? LRT.Train.getSpeed() : 0,
            trainTrackX: LRT.Train && LRT.Train.getTrackX ? LRT.Train.getTrackX() : 0,
            trainDir: LRT.Train && LRT.Train.getDirection ? LRT.Train.getDirection() : 1,
            playerPos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) },
            playerHp: p.health,
            playerArmor: p.armor,
            invulnerable: !!p.invulnerable,
            invulnCheatTimer: +(p.invulnCheatTimer || 0).toFixed(2),
            fastSprint: !!p.fastSprint,
            cheatOpen: !!p.cheatOpen,
            isInsideTrain: p.isInsideTrain,
            isSitting: !!p.isSitting,
            activeWeapon: wh.id || null,
            ammo: wh ? { mag: wh.ammoInMag ?? wh.mag ?? null, reserve: wh.reserve ?? null } : null,
            drawCalls: CORE.lastDrawCalls || (CORE.renderer ? CORE.renderer.info.render.calls : 0),
            geometries: CORE.renderer ? CORE.renderer.info.memory.geometries : 0,
            textures: CORE.renderer ? CORE.renderer.info.memory.textures : 0,
            fps: currentFps,
            brokenGlassCount: st.brokenGlassCount || 0,
            destroyedPillars: st.destroyedPillars || 0,
            audioStatus: LRT.Audio ? LRT.Audio.getStatus() : null,
            brightness: CORE.currentBrightness,
            exposure: CORE.renderer ? +CORE.renderer.toneMappingExposure.toFixed(3) : null,
            hemiIntensity: CORE.hemiLight ? +CORE.hemiLight.intensity.toFixed(3) : null,
            sunIntensity: CORE.sunLight ? +CORE.sunLight.intensity.toFixed(3) : null,
            fogDensity: CORE.scene && CORE.scene.fog ? +CORE.scene.fog.density.toFixed(4) : null,
            campaignVictory: CORE.campaignState.campaignVictory,
            clearedStations: Array.from(CORE.campaignState.clearedStations),
            consoleErrors: consoleErrors.slice()
          };
        },
        getCampaignState: () => ({
          clearedStations: Array.from(CORE.campaignState.clearedStations),
          visitedStations: Array.from(CORE.campaignState.visitedStations),
          stationObjectives: JSON.parse(JSON.stringify(CORE.campaignState.stationObjectives)),
          voTriggered: Array.from(CORE.campaignState.voTriggered),
          collectedLogs: (CORE.campaignState.collectedLogs || []).slice(),
          campaignVictory: CORE.campaignState.campaignVictory,
          stationUsedIds: Array.from(CORE.campaignState.stationUsedIds.entries()).map(([k, v]) => [k, Array.from(v)])
        }),
        startMode: (m, opts) => startGame(m, opts),
        continueGame: () => startGame(MODES.SURVIVAL, { resume: true }),
        startTutorial: () => startGame(MODES.SURVIVAL, { tutorial: true }),
        writeSave: () => (typeof CORE.writeSave === 'function' ? CORE.writeSave() : false),
        hasSave: () => (typeof CORE.hasSave === 'function' ? CORE.hasSave() : false),
        getSaveSummary: () => (typeof CORE.getSaveSummary === 'function' ? CORE.getSaveSummary() : null),
        setBrightness: CORE.setBrightness,
        getBrightness: CORE.getBrightness,
        setLightingMode: CORE.setLightingMode,
        cycleLightingMode: CORE.cycleLightingMode,
        getLightingMode: CORE.getLightingMode,
        summonTrain: (dir) => CORE.summonTrain(dir, true),
        departTrainNow: CORE.departTrainNow,
        triggerInteract: (itemId) => {
          if (itemId) {
            let item = null;
            let src = 'station';
            const stationList = (LRT.Station && typeof LRT.Station.getInteractables === 'function')
              ? LRT.Station.getInteractables()
              : (LRT.Station && LRT.Station.interactables);
            if (Array.isArray(stationList)) {
              item = stationList.find((x) => x.id === itemId);
              if (item) src = 'station';
            }
            if (!item) {
              const cityList = (LRT.City && typeof LRT.City.getInteractables === 'function')
                ? LRT.City.getInteractables()
                : (LRT.City && LRT.City.interactables);
              if (Array.isArray(cityList)) {
                item = cityList.find((x) => x.id === itemId);
                if (item) src = 'city';
              }
            }
            if (!item) {
              const trainList = (LRT.Train && typeof LRT.Train.getInteractables === 'function')
                ? LRT.Train.getInteractables()
                : (LRT.Train && (LRT.Train.interactables || LRT.Train.localInteractables));
              if (Array.isArray(trainList)) {
                item = trainList.find((x) => x.id === itemId);
                if (item) src = 'train';
              }
            }
            if (item) {
              const uis = LRT.PlayerUI.getState();
              uis.activeInteractable = Object.assign({ _source: src }, item);
            }
          }
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
        },
        jumpToStation: (idx) => {
          CORE.saveCurrentStationUsedIds();
          if (LRT.Station && LRT.Station.dispose) LRT.Station.dispose(CORE.scene);
          if (LRT.Enemies && LRT.Enemies.reset) LRT.Enemies.reset();
          if (LRT.Enemies && typeof LRT.Enemies.setDifficulty === 'function') LRT.Enemies.setDifficulty(CORE.difficultyKey);
          if (LRT.Enemies && typeof LRT.Enemies.setAtmosphereMode === 'function') LRT.Enemies.setAtmosphereMode(getAtmosphereMode());
          if (LRT.Train && LRT.Train.reset) LRT.Train.reset(CORE.gameMode);
          CORE.stationIndex = Math.max(0, idx | 0);
          CORE.activeTravelDir = 1;
          CORE.prevTrainState = 'AWAY';
          CORE.rideCompleteReady = false;
          CORE.gameState = STATES.STATION_ACTIVE;
          CORE.syncMenuLights();
          const st = buildStation(CORE.stationIndex, 0);
          const sp = (st && st.spawnPos) || CORE.pickPlayerSpawnPos();
          LRT.PlayerUI.reset(sp, CORE.gameMode === MODES.EXPLORATION, CORE.gameMode);
          updateCityVisibility(LRT.PlayerUI.getState());
          CORE.updateSunTracking(sp.x, sp.z);
          CORE.renderFrame();
          return st;
        },
        getLoadedModules: () => Object.keys(LRT),
        getScene: () => CORE.scene,
        isSoftwareRenderer: () => CORE.isSoftwareRenderer,
        setLoopPaused: (flag) => {
          loopPaused = !!flag;
          if (loopPaused && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          } else if (!loopPaused && !rafId) {
            lastFrameMs = performance.now();
            rafId = requestAnimationFrame(animate);
          }
        },
        advanceSim: (seconds, doRender) => {
          const steps = Math.max(1, Math.round((seconds || 0.05) / 0.05));
          for (let i = 0; i < steps; i++) stepSimulation(0.05);
          if (doRender !== false) CORE.renderFrame();
        },
        applyPlayerDamage: (dmg, srcPos) => CORE.handlePlayerHit(dmg, srcPos),
        unlockWeapon: (idOrAll, bonus) => (LRT.Weapons && typeof LRT.Weapons.unlockWeapon === 'function')
          ? LRT.Weapons.unlockWeapon(idOrAll, bonus)
          : null,
        setDifficulty: (k) => applyDifficultySetting(k, false),
        setAtmosphereMode: (m, notify) => applyAtmosphereSetting(m, !!notify),
        getAtmosphereMode: () => getAtmosphereMode(),
        grantLoot: (forcedRarity, riskLuck) => {
          if (!LRT.Weapons || typeof LRT.Weapons.rollLootbox !== 'function') return null;
          const opts = {
            stationIndex: CORE.stationIndex,
            difficultyKey: CORE.difficultyKey
          };
          if (typeof forcedRarity === 'string' && forcedRarity.length > 0) {
            opts.forcedRarity = forcedRarity;
          }
          if (typeof riskLuck === 'number') {
            opts.riskLuck = riskLuck;
          }
          const roll = LRT.Weapons.rollLootbox(opts);
          if (roll) {
            if (roll.armorGranted > 0 && LRT.PlayerUI && typeof LRT.PlayerUI.addArmor === 'function') {
              LRT.PlayerUI.addArmor(roll.armorGranted, roll.maxArmor || 100);
            }
            if (roll.hpGranted > 0 && LRT.PlayerUI && typeof LRT.PlayerUI.heal === 'function') {
              LRT.PlayerUI.heal(roll.hpGranted);
            }
            if (roll.summaryText && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
              LRT.PlayerUI.setNotice(roll.summaryText, roll.colorHex || '#e0b422');
            }
          }
          return roll;
        },
        getProgressionState: () => ({
          difficulty: CORE.difficultyKey,
          weapons: (LRT.Weapons && typeof LRT.Weapons.getProgressionState === 'function')
            ? LRT.Weapons.getProgressionState()
            : null,
          armor: (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function')
            ? ((LRT.PlayerUI.getState() && LRT.PlayerUI.getState().armor) || 0)
            : 0
        }),
        getRenderSettings: () => (typeof CORE.getSettings === 'function' ? CORE.getSettings() : null),
        setQuality: CORE.applyQuality,
        setRenderScale: CORE.setRenderScale,
        setShadowsEnabled: CORE.setShadowsEnabled,
        setBloomEnabled: CORE.setBloomEnabled,
        setAoMode: CORE.setAoMode,
        setFpsCounterEnabled: CORE.setFpsCounterEnabled,
        executeCheat: (code) => (LRT.PlayerUI && typeof LRT.PlayerUI.executeCheat === 'function')
          ? LRT.PlayerUI.executeCheat(code)
          : null
      };

      if (!loopPaused) {
        rafId = requestAnimationFrame(animate);
      }
    })();
    return _bootPromise;
  }

  LRT.Main = {
    boot,
    startGame,
    pause,
    resume,
    setQuality: CORE.applyQuality,
    setRenderScale: CORE.setRenderScale,
    setShadowsEnabled: CORE.setShadowsEnabled,
    setBloomEnabled: CORE.setBloomEnabled,
    setAoMode: CORE.setAoMode,
    setFpsCounterEnabled: CORE.setFpsCounterEnabled,
    setDifficulty: (k, notify) => applyDifficultySetting(k, !!notify),
    setAtmosphereMode: (m, notify) => applyAtmosphereSetting(m, !!notify),
    getAtmosphereMode: () => getAtmosphereMode(),
    getRenderSettings: CORE.getSettings,
    setBrightness: CORE.setBrightness,
    getBrightness: CORE.getBrightness,
    setLightingMode: CORE.setLightingMode,
    cycleLightingMode: CORE.cycleLightingMode,
    getLightingMode: CORE.getLightingMode,
    getMoodBlendState: () => (typeof CORE.getMoodBlendState === 'function' ? CORE.getMoodBlendState() : null),
    summonTrain: CORE.summonTrain,
    departTrainNow: CORE.departTrainNow,
    getState: () => CORE.gameState,
    getCampaignState: () => ({
      clearedStations: Array.from(CORE.campaignState.clearedStations),
      visitedStations: Array.from(CORE.campaignState.visitedStations),
      stationObjectives: JSON.parse(JSON.stringify(CORE.campaignState.stationObjectives)),
      voTriggered: Array.from(CORE.campaignState.voTriggered),
      campaignVictory: CORE.campaignState.campaignVictory
    })
  };

  if (!window.__LRT_MANAGED_BOOT__) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(window.LRT = window.LRT || {});
