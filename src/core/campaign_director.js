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
  CORE.manualDoorHold = false;
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

  const KEY_ITEM_LABELS = {
    fuel_can: 'JERIGEN SOLAR',
    cawang_keycard: 'KARTU AKSES 750V',
    harja_cryo: 'CRYO STABILIZER',
    harja_pmi_key: 'KUNCI TRIAGE PMI',
    c4_charge: 'MUATAN C4'
  };

  let _keyItemsDisplayCache = '';
  let _keyItemsDirty = true;

  function createDefaultStationObjectives() {
    return {
      0: { genInspected: false, fuelFound: false, genOn: false, waveCleared: false },
      1: { cabInspected: false, keycardFound: false, fuseFound: false, waveCleared: false },
      2: { depotInspected: false, vaxCryoFound: false, pmiKeyFound: false, vaxFound: false, depotDone: false, waveCleared: false },
      3: { breakerInspected: false, feederWestOn: false, feederEastOn: false, plnDone: false, waveCleared: false },
      4: { barricadeInspected: false, c4Found: false, barricadeCleared: false, waveCleared: false },
      5: { relays: { street: false, jpo: false, platform: false, totem: false, pln: false }, waveCleared: false, omegaActive: false, holdoutElapsed: 0 }
    };
  }

  const campaignState = {
    stationUsedIds: new Map(),
    clearedStations: new Set(),
    visitedStations: new Set([0]),
    triggeredSurgeStations: new Set(),
    keyItems: new Set(),
    stationObjectives: createDefaultStationObjectives(),
    voTriggered: new Set(),
    collectedLogs: [],
    campaignVictory: false,
    firstBarrelExploded: false,
    barrelCueActive: false,
    trainCallActive: false,
    trainCallWaitElapsed: 0,
    trainCallTrickleStage: 0
  };

  function invalidateKeyItemsCache() {
    _keyItemsDirty = true;
  }

  function formatKeyItemLabel(id) {
    const k = String(id || '').trim();
    if (!k) return '';
    return KEY_ITEM_LABELS[k] || k.replace(/_/g, ' ').toUpperCase();
  }

  function addKeyItem(id) {
    const k = String(id || '').trim();
    if (!k) return false;
    const had = campaignState.keyItems.has(k);
    campaignState.keyItems.add(k);
    if (!had) _keyItemsDirty = true;
    return !had;
  }

  function hasKeyItem(id) {
    const k = String(id || '').trim();
    return !!k && campaignState.keyItems.has(k);
  }

  function consumeKeyItem(id) {
    const k = String(id || '').trim();
    if (!k) return false;
    const deleted = campaignState.keyItems.delete(k);
    if (deleted) _keyItemsDirty = true;
    return deleted;
  }

  function getKeyItems() {
    return Array.from(campaignState.keyItems);
  }

  function getKeyItemsDisplayText() {
    if (!_keyItemsDirty) return _keyItemsDisplayCache;
    _keyItemsDirty = false;
    if (!campaignState.keyItems || campaignState.keyItems.size === 0) {
      _keyItemsDisplayCache = '';
      return _keyItemsDisplayCache;
    }
    const labels = [];
    campaignState.keyItems.forEach((id) => {
      const lbl = formatKeyItemLabel(id);
      if (lbl) labels.push(lbl);
    });
    _keyItemsDisplayCache = labels.length ? `ITEM: ${labels.join(' · ')}` : '';
    return _keyItemsDisplayCache;
  }

  const triggerObjectiveSurgeWave = (...args) => CORE.triggerObjectiveSurgeWave(...args);
  const triggerStreetReturnAmbush = (...args) => (typeof CORE.triggerStreetReturnAmbush === 'function' ? CORE.triggerStreetReturnAmbush(...args) : 0);
  const triggerTrainCallSiegeWave = (...args) => CORE.triggerTrainCallSiegeWave(...args);
  const triggerTrainCallReinforcementTrickle = (...args) => CORE.triggerTrainCallReinforcementTrickle(...args);
  const spawnStationRoamers = (...args) => CORE.spawnStationRoamers(...args);
  const spawnCurrentWave = (...args) => CORE.spawnCurrentWave(...args);
  const writeSave = (...args) => CORE.writeSave(...args);
  const tickAutosave = (...args) => CORE.tickAutosave(...args);

  function resetCampaignState() {
    campaignState.stationUsedIds.clear();
    campaignState.clearedStations.clear();
    campaignState.visitedStations.clear();
    campaignState.visitedStations.add(0);
    campaignState.triggeredSurgeStations.clear();
    campaignState.keyItems.clear();
    _keyItemsDirty = true;
    _keyItemsDisplayCache = '';
    campaignState.stationObjectives = createDefaultStationObjectives();
    campaignState.voTriggered.clear();
    campaignState.collectedLogs.length = 0;
    campaignState.campaignVictory = false;
    campaignState.firstBarrelExploded = false;
    campaignState.barrelCueActive = false;
    campaignState.trainCallActive = false;
    campaignState.trainCallWaitElapsed = 0;
    campaignState.trainCallTrickleStage = 0;
    campaignState.objectiveIdleTimer = 0;
    campaignState.lastObjectiveIdleKey = '';
    campaignState.idleHintCount = 0;
    campaignState.onboardingHintDone = false;
    campaignState.stationElapsedSec = 0;
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
    consumeKeyItem('c4_charge');
    if (campaignState.stationObjectives[4]) {
      campaignState.stationObjectives[4].barricadeInspected = true;
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
    try { localStorage.setItem('lrt_campaign_completed_v1', '1'); } catch (_) {}
    if (LRT.PlayerUI && typeof LRT.PlayerUI.syncFastTravelAvailability === 'function') {
      LRT.PlayerUI.syncFastTravelAvailability();
    }

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
    const r = s5.relays;
    const streetDone = !!(r.street || r.pln);
    const jpoDone = !!r.jpo;
    const platDone = !!(r.platform || r.totem);
    if (streetDone && jpoDone && platDone) {
      s5.omegaActive = true;
      if (!campaignState.voTriggered.has('VO_19_FINAL_WAVE')) {
        campaignState.voTriggered.add('VO_19_FINAL_WAVE');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_19_FINAL_WAVE');
        }
      }
      if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
        LRT.PlayerUI.setNotice('SEMUA 3 RELAI ZONA TERHUBUNG — OMEGA SWARM MENDEKAT!', '#ef4444');
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

  // Wave/cluster/surge/roamer spawning moved to src/core/wave_spawner.js.

  function onStationBuilt(idx, offsetZ) {
    if (LRT.Enemies && typeof LRT.Enemies.setDifficulty === 'function') {
      LRT.Enemies.setDifficulty(CORE.difficultyKey);
    }
    if (LRT.Enemies && typeof LRT.Enemies.setAtmosphereMode === 'function') {
      LRT.Enemies.setAtmosphereMode(CORE.atmosphereMode);
    }
    if (idx % 6 === 3 && campaignState.stationObjectives[3]) {
      const s3 = campaignState.stationObjectives[3];
      if (LRT.City && typeof LRT.City.setKuninganFeederState === 'function') {
        LRT.City.setKuninganFeederState('west', !!s3.feederWestOn);
        LRT.City.setKuninganFeederState('east', !!s3.feederEastOn);
      }
      if (LRT.Station && typeof LRT.Station.syncKuninganBreakerLeds === 'function') {
        LRT.Station.syncKuninganBreakerLeds(!!s3.feederWestOn, !!s3.feederEastOn, !!s3.plnDone);
      }
    }
    if (!offsetZ) {
      spawnStationRoamers(idx);
    }
  }

  function handleInteractResult(res, item) {
    if (!res || !item) return;
    if (res && res.blocked) {
      if (res.message && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
        LRT.PlayerUI.setNotice(res.message, '#e0b422');
      }
      return;
    }
    if (CORE.tutorialActive && typeof CORE.onTutorialEvent === 'function') CORE.onTutorialEvent('interact', item, res);

    if (res.action === 'depart') {
      departTrainNow(false);
      return;
    }

    if (res.action === 'toggle_doors' || item.action === 'toggle_doors' || item.id === 'train_door_lock_front' || item.id === 'train_door_lock_rear') {
      if (CORE.gameState !== STATES.TRAIN_BOARDING || !LRT.Train || (LRT.Train.getState && LRT.Train.getState() !== 'BOARDED_WAIT')) {
        return;
      }
      const doorsWereOpen = typeof LRT.Train.areDoorsOpen === 'function'
        ? LRT.Train.areDoorsOpen()
        : (typeof LRT.Train.getDoorOpen === 'function' ? LRT.Train.getDoorOpen() > 0.5 : true);
      if (doorsWereOpen) {
        if (typeof LRT.Train.closeDoors === 'function') LRT.Train.closeDoors();
        if (LRT.Station && typeof LRT.Station.setPsdOpen === 'function') LRT.Station.setPsdOpen(0, CORE.activeTravelDir);
        CORE.boardingCloseTimer = 999;
        CORE.manualDoorHold = true;
        if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
          LRT.PlayerUI.setNotice('🔒 PINTU KERETA DIKUNCI — TEKAN PANEL BERANGKAT UNTUK JALAN', '#22c55e');
        }
        if (CORE.tutorialActive && typeof CORE.getTutorialStep === 'function' && CORE.getTutorialStep() >= 8 && typeof CORE.completeTutorialStep11 === 'function') {
          CORE.completeTutorialStep11();
        }
      } else {
        if (typeof LRT.Train.openDoors === 'function') LRT.Train.openDoors();
        if (LRT.Station && typeof LRT.Station.setPsdOpen === 'function') LRT.Station.setPsdOpen(1, CORE.activeTravelDir);
        CORE.boardingCloseTimer = 999;
        CORE.manualDoorHold = true;
        if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
          LRT.PlayerUI.setNotice('🔓 PINTU KERETA DIBUKA', '#f59e0b');
        }
      }
      return;
    }

    const s0 = campaignState.stationObjectives[0];
    const s1 = campaignState.stationObjectives[1];
    const wasGenOn = !!(s0 && s0.genOn);
    const wasFuseFound = !!(s1 && s1.fuseFound);
    const isFresh = res.fresh !== false && res.ammo !== null && res.ammoBonus !== 0;

    if (res.lurePos && LRT.Enemies && typeof LRT.Enemies.alertAllTo === 'function') {
      LRT.Enemies.alertAllTo(res.lurePos, 55.0);
    }

    if (res.keyItemId) {
      addKeyItem(res.keyItemId);
    }
    if (res.consumeKeyItemId) {
      consumeKeyItem(res.consumeKeyItemId);
    }

    if (res.action === 'generator_dry') {
      if (s0) s0.genInspected = true;
      return;
    }

    if (item.id === 'dukuh_fuel_can') {
      if (s0) {
        s0.genInspected = true;
        s0.fuelFound = true;
      }
      if (res.fresh !== false) {
        triggerStreetReturnAmbush(['runner', 'runner', 'walker', 'walker'], { x: item.x, z: item.z }, {
          notice: 'PENYERGAPAN JALAN TIMUR — LARI KEMBALI KE GENERATOR CONCOURSE!'
        });
      }
      return;
    }

    if (item.id === 'portable_generator' || res.action === 'generator') {
      if (CORE.tutorialActive && typeof CORE.getTutorialStep === 'function' && CORE.getTutorialStep() < 7) {
        if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
          LRT.PlayerUI.setNotice('IKUTI LANGKAH BRIEFING TERLEBIH DAHULU', '#e0b422');
        }
        return;
      }
      if (s0) {
        s0.genInspected = true;
        s0.fuelFound = true;
        s0.genOn = true;
      }
      if (LRT.Station && typeof LRT.Station.setLightingFactor === 'function') {
        LRT.Station.setLightingFactor(1.0);
      }
      CORE.applyBrightness();
      if (!CORE.tutorialActive && !campaignState.voTriggered.has('VO_02_GEN_ON')) {
        campaignState.voTriggered.add('VO_02_GEN_ON');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_02_GEN_ON');
        }
      }
      if (CORE.stationIndex === 0) {
        triggerObjectiveSurgeWave(CORE.stationIndex);
      }
    }

    if (res.action === 'derelict_locked') {
      if (s1) s1.cabInspected = true;
      return;
    }

    if (item.id === 'cawang_bypass_keycard') {
      if (s1) {
        s1.cabInspected = true;
        s1.keycardFound = true;
      }
      if (res.fresh !== false) {
        queueVariantRadioLine('STEP_KEYCARD', [
          {
            speaker: 'ARYA',
            id: 'Kartu akses 750V dapat dari Pos Sekuriti. Tapi area ini mulai ramai—balik ke Jalur 4 sekarang!',
            en: 'Got the 750V bypass keycard from the Security Booth. Place is crawling—heading back to Track 4!'
          },
          {
            speaker: 'SARAH',
            id: 'Bagus, Arya! Kode kartu cocok. Waspada Brute di jalur pulang menuju bangkai kereta Jalur 4.',
            en: 'Nice work, Arya! Card code matches. Watch for a Brute blocking the way back to the Track 4 wreck.'
          }
        ], { priority: 'HIGH' });
        triggerStreetReturnAmbush(['brute', 'walker', 'walker', 'walker'], { x: item.x, z: item.z }, {
          notice: 'RIOT BRUTE MENJAGA GUDANG LOGISTIK — KEMBALI KE KABIN JALUR 4!'
        });
      }
      return;
    }

    if (item.id === 'cawang_derelict_cab' || res.action === 'derelict_fuse') {
      if (s1) {
        s1.cabInspected = true;
        s1.keycardFound = true;
        s1.fuseFound = true;
      }
      if (!CORE.tutorialActive && !campaignState.voTriggered.has('VO_08_FUSE_FOUND')) {
        campaignState.voTriggered.add('VO_08_FUSE_FOUND');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_08_FUSE_FOUND');
        }
      }
      if (CORE.stationIndex === 1) {
        triggerObjectiveSurgeWave(CORE.stationIndex);
      }
    }

    if (res.action === 'depot_sealed') {
      if (campaignState.stationObjectives[2]) campaignState.stationObjectives[2].depotInspected = true;
      return;
    }

    if (item.id === 'harja_pmi_key') {
      if (campaignState.stationObjectives[2]) {
        campaignState.stationObjectives[2].depotInspected = true;
        campaignState.stationObjectives[2].pmiKeyFound = true;
      }
      if (res.fresh !== false) {
        queueVariantRadioLine('STEP_PMI_KEY', [
          {
            speaker: 'ARYA',
            id: 'Kunci Triage PMI di tangan. Ambulans ini sudah ditinggal panik—aku kembali ke Depo Harjamukti.',
            en: 'PMI Triage Key secured. This ambulance was abandoned mid-evac—moving back to Harjamukti Depot.'
          },
          {
            speaker: 'SARAH',
            id: 'Kunci terverifikasi, Arya. Bawa langsung ke lemari pendingin vaksin di Depo selatan—hati-hati Screamer!',
            en: 'Key verified, Arya. Bring it straight to the south Depot vaccine cooler—watch for Screamers!'
          }
        ], { priority: 'HIGH' });
        triggerStreetReturnAmbush(['screamer', 'runner', 'runner'], { x: item.x, z: item.z }, {
          notice: 'SCREAMER & RUNNER MENYERGAP JALAN BARAT — KEMBALI KE DEPO HARJAMUKTI!'
        });
      }
      return;
    }

    if (item.id === 'garden_supply') {
      if (campaignState.stationObjectives[2]) {
        campaignState.stationObjectives[2].depotInspected = true;
        campaignState.stationObjectives[2].vaxCryoFound = true;
        if (CORE.gameMode !== MODES.SURVIVAL) {
          campaignState.stationObjectives[2].vaxFound = true;
        }
      }
      if (CORE.stationIndex === 2 && res.fresh !== false && CORE.gameMode === MODES.SURVIVAL) {
        triggerStreetReturnAmbush(['spitter', 'spitter'], { x: item.x, z: item.z }, {
          allowStationZones: true,
          minDist: 6.0,
          maxDist: 22.0,
          fallbackY: 0.0,
          notice: '2 SPITTER MUNCUL DI SEMAK KEBUN ATAP!'
        });
      }
    }

    if (item.id === 'depot_supply' && res.action !== 'depot_sealed') {
      consumeKeyItem('harja_cryo');
      consumeKeyItem('harja_pmi_key');
      if (campaignState.stationObjectives[2]) {
        campaignState.stationObjectives[2].depotInspected = true;
        campaignState.stationObjectives[2].vaxCryoFound = true;
        campaignState.stationObjectives[2].pmiKeyFound = true;
        campaignState.stationObjectives[2].vaxFound = true;
        campaignState.stationObjectives[2].depotDone = true;
      }
      if (!CORE.tutorialActive && !campaignState.voTriggered.has('VO_12_VAX_FOUND')) {
        campaignState.voTriggered.add('VO_12_VAX_FOUND');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_12_VAX_FOUND');
        }
      }
      if (CORE.stationIndex === 2) {
        triggerObjectiveSurgeWave(CORE.stationIndex);
      }
    }

    if (res.action === 'kuningan_breaker_locked') {
      if (campaignState.stationObjectives[3]) campaignState.stationObjectives[3].breakerInspected = true;
      return;
    }

    if (item.id === 'kuningan_feeder_west' || res.action === 'kuningan_feeder_west') {
      const s3 = campaignState.stationObjectives[3];
      if (s3) {
        s3.breakerInspected = true;
        s3.feederWestOn = true;
        if (LRT.Station && typeof LRT.Station.syncKuninganBreakerLeds === 'function') {
          LRT.Station.syncKuninganBreakerLeds(s3.feederWestOn, s3.feederEastOn, s3.plnDone);
        }
      }
      if (res.fresh !== false) {
        queueVariantRadioLine('STEP_FEEDER_W', [
          {
            speaker: 'SARAH',
            id: 'Feeder Barat menyala! Sekarang seberangi boulevard ke Gardu Timur sebelum menarik sakelar induk di Concourse.',
            en: 'West Feeder is live! Now cross the boulevard to the East Feeder before throwing the Concourse main breaker.'
          },
          {
            speaker: 'ARYA',
            id: 'Gardu Barat aktif. Suaranya menarik perhatian mereka—lanjut ke sisi timur!',
            en: 'West Feeder online. The hum is drawing them in—pushing to the east side!'
          }
        ], { priority: 'HIGH' });
        triggerStreetReturnAmbush(['runner', 'walker', 'walker'], { x: item.x, z: item.z }, {
          notice: 'TRAFO BARAT MENYALA — INFECTED JALANAN TERTARIK SUARA GARDU!'
        });
      }
      return;
    }

    if (item.id === 'kuningan_main_breaker' || res.action === 'kuningan_breaker_on') {
      const s3 = campaignState.stationObjectives[3];
      if (s3) {
        s3.breakerInspected = true;
        s3.feederWestOn = true;
        s3.feederEastOn = true;
        s3.plnDone = true;
      }
      CORE.applyBrightness();
      if (CORE.stationIndex === 3) {
        triggerObjectiveSurgeWave(CORE.stationIndex);
      }
      return;
    }

    if (item.id === 'city_pln_box' || res.action === 'power_box') {
      if (CORE.stationIndex === 3 && campaignState.stationObjectives[3]) {
        const s3 = campaignState.stationObjectives[3];
        s3.breakerInspected = true;
        s3.feederEastOn = true;
        if (LRT.Station && typeof LRT.Station.syncKuninganBreakerLeds === 'function') {
          LRT.Station.syncKuninganBreakerLeds(s3.feederWestOn, s3.feederEastOn, s3.plnDone);
        }
        if (res.fresh !== false) {
          triggerStreetReturnAmbush(['brute', 'spitter', 'walker', 'walker'], { x: item.x, z: item.z }, {
            notice: 'FEEDER TIMUR AKTIF — PATROLI RIOT BRUTE & SPITTER MENDEKAT!'
          });
        }
      } else if (CORE.stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.pln = true;
        campaignState.stationObjectives[5].relays.street = true;
        checkSetiabudiRelays();
      }
    }

    if (res.action === 'barricade_locked') {
      if (campaignState.stationObjectives[4]) campaignState.stationObjectives[4].barricadeInspected = true;
      return;
    }

    if (item.id === 'cikoko_c4_charge') {
      if (campaignState.stationObjectives[4]) {
        campaignState.stationObjectives[4].barricadeInspected = true;
        campaignState.stationObjectives[4].c4Found = true;
      }
      if (res.fresh !== false) {
        triggerStreetReturnAmbush(['brute', 'runner', 'runner'], { x: item.x, z: item.z }, {
          notice: 'KONVOI MILITER DISERGAP RIOT BRUTE — KEMBALI & LEDAKKAN BARIKADE TOL!'
        });
      }
    }

    if (item.id === 'setiabudi_relay_street' || res.action === 'setiabudi_relay_street') {
      if (CORE.stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.street = true;
        campaignState.stationObjectives[5].relays.pln = true;
        checkSetiabudiRelays();
      }
      if (res.fresh !== false) {
        triggerStreetReturnAmbush(['runner', 'runner', 'spitter'], { x: item.x, z: item.z }, {
          notice: 'RELAI JALANAN AKTIF — INFECTED RASUNA SAID MENGEJAR!'
        });
      }
    }

    if (item.id === 'route_totem') {
      if (CORE.stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.totem = true;
        campaignState.stationObjectives[5].relays.platform = true;
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
      const relayCount = ((r5.platform || r5.totem) ? 1 : 0) + ((r5.street || r5.pln) ? 1 : 0) + (r5.jpo ? 1 : 0);
      if (relayCount >= 2) {
        triggerObjectiveSurgeWave(5);
      }
    }

    if (item.id === 'train_horn_front' || res.action === 'horn') {
      if (!CORE.tutorialActive && !campaignState.voTriggered.has('VO_14_HORN_HINT')) {
        campaignState.voTriggered.add('VO_14_HORN_HINT');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_14_HORN_HINT');
        }
      }
    }

    // Individual 3D crate variant weapon grant & armor grant (before legacy random roll)
    if (res.variantId && res.weaponId && LRT.Weapons) {
      if (!res._variantHandled) {
        if (typeof LRT.Weapons.unlockOrEquipVariant === 'function') {
          LRT.Weapons.unlockOrEquipVariant(res.weaponId, res.variantId);
        } else if (typeof LRT.Weapons.unlockWeapon === 'function') {
          LRT.Weapons.unlockWeapon(res.weaponId, res.ammoAmount || 0);
        }
        if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
          const label = res.variantLabel || res.label || `${String(res.weaponId).toUpperCase()} · ${String(res.variantId).toUpperCase()}`;
          LRT.PlayerUI.setNotice(res.message || `SENJATA VARIAN DIPEROLEH: ${String(label).toUpperCase()}`, '#22c55e');
        }
      }
      return;
    }
    if (!res._armorHandled && (res.armorBonus > 0 || res.armor > 0) && LRT.PlayerUI && typeof LRT.PlayerUI.addArmor === 'function') {
      LRT.PlayerUI.addArmor(res.armorBonus || res.armor, 100);
    }

    // Legacy Lootbox roll handling (skipped when 3D crate merely swings open or picks individual slot)
    if ((res.type === 'lootbox' || item.type === 'lootbox') && res.fresh !== false
        && !res.openedOnly && !res.individualSlot && !res.skipRandomRoll && res.action !== 'crate_open') {
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
      if ((res.action === 'generator' && CORE.difficultyKey === 'easy' && !wasGenOn)
        || (isFresh && (item.id === 'jaklingko_kiosk' || item.id === 'city_coffee_cart' || item.id === 'balcony_supply'))) {
        unlockRes = LRT.Weapons.unlockWeapon('rifle', 60);
      } else if (isFresh && ((res.action === 'derelict_fuse' && !wasFuseFound) || item.id === 'city_convoy_car')) {
        unlockRes = LRT.Weapons.unlockWeapon('shotgun', 16);
      } else if (isFresh && (res.action === 'depot_unlocked' || item.id === 'cikoko_c4_charge' || (item.id === 'city_pocket_park' && CORE.stationIndex >= 1))) {
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
    if (idx === 2) return !!obj.depotDone;
    if (idx === 3) return !!obj.plnDone;
    if (idx === 4) return !!obj.barricadeCleared;
    if (idx === 5) return !!(obj.relays && (obj.relays.platform || obj.relays.totem) && (obj.relays.street || obj.relays.pln) && obj.relays.jpo);
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

  // spawnCurrentWave moved to src/core/wave_spawner.js.

  function summonTrain(dirOverride, isDirectDebugCall) {
    if (CORE.gameState !== STATES.STATION_ACTIVE) return;
    if (!LRT.Train || !LRT.Train.startApproach) return;
    if (CORE.tutorialActive && !isDirectDebugCall && typeof CORE.getTutorialStep === 'function' && CORE.getTutorialStep() < 8) {
      if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.55 });
      LRT.PlayerUI.setNotice('IKUTI LANGKAH BRIEFING TERLEBIH DAHULU', '#e0b422');
      return;
    }
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
          if (s === 0) hint = 'Isi solar (Pojok SE) & nyalakan generator Concourse [E]!';
          else if (s === 1) hint = 'Ambil kartu akses (Pojok NE) & buka sekring kabin Jalur 4 [E]!';
          else if (s === 2) hint = 'Gabungkan Cryo (Kebun Atap) & Kunci PMI (Pojok NW) di Depo [E]!';
          else if (s === 3) hint = 'Nyalakan Feeder Barat & Timur lalu tarik Panel Induk Concourse [E]!';
          else if (s === 4) hint = 'Ambil C4 / RPG (Pojok SW) & ledakkan Barikade Tol Cikoko!';
          else if (s === 5) hint = 'Hubungkan 3 Zona Relai Setiabudi (Jalan, JPO, Peron Tengah) [E]!';
          if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.55 });
          LRT.PlayerUI.setNotice(`OBJEKTIF BELUM SELESAI: ${hint}`, '#e0b422');
          return;
        }
        if (!CORE.tutorialActive && !campaignState.voTriggered.has('VO_04_CALL_HOLD')) {
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

    CORE.manualDoorHold = false;
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
    if (dir === 1 && CORE.gameMode === MODES.SURVIVAL && !CORE.tutorialActive) {
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

  function departTrainNow(isDirectDebugCall) {
    if (CORE.gameState !== STATES.TRAIN_BOARDING) return false;
    if (!LRT.Train) return false;
    if (LRT.Train.getState && LRT.Train.getState() !== 'BOARDED_WAIT') return false;
    if (typeof LRT.Train.isPendingDepart === 'function' && LRT.Train.isPendingDepart()) return false;

    const pState = LRT.PlayerUI.getState();
    if (!LRT.Train.isPlayerInside(pState.pos)) {
      LRT.PlayerUI.setNotice('MASUK KE DALAM KERETA TERLEBIH DAHULU', '#e0b422');
      return false;
    }

    if (CORE.tutorialActive) {
      if (!isDirectDebugCall && typeof CORE.getTutorialStep === 'function' && CORE.getTutorialStep() < 8) {
        if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.55 });
        LRT.PlayerUI.setNotice('IKUTI LANGKAH BRIEFING TERLEBIH DAHULU', '#e0b422');
        return false;
      }
      if (typeof CORE.completeTutorialStep11 === 'function') {
        return CORE.completeTutorialStep11();
      }
      return true;
    }

    // Guard 1: Newly arrived train before player disembarks onto the new station
    if (CORE.rideCompleteReady === true && !isDirectDebugCall) {
      if (typeof LRT.Train.openDoors === 'function') LRT.Train.openDoors();
      if (LRT.Station && typeof LRT.Station.setPsdOpen === 'function') {
        LRT.Station.setPsdOpen(1, CORE.activeTravelDir);
      }
      CORE.manualDoorHold = true;
      CORE.boardingCloseTimer = 999;
      if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.65 });
      LRT.PlayerUI.setNotice('TURUN KE PERON & SELESAIKAN MISI STASIUN INI TERLEBIH DAHULU!', '#e0b422');
      return false;
    }

    // Guard 2: Incomplete station mission in Survival Mode
    if (CORE.gameMode === MODES.SURVIVAL && !CORE.tutorialActive && !isDirectDebugCall && CORE.activeTravelDir === 1 && !isStationPrimaryObjectiveComplete(CORE.stationIndex)) {
      if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.55 });
      LRT.PlayerUI.setNotice('OBJEKTIF UTAMA STASIUN BELUM SELESAI — SELESAIKAN MISI DULU!', '#e0b422');
      return false;
    }

    CORE.manualDoorHold = false;
    if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, CORE.activeTravelDir);
    LRT.Train.closeDoors();
    if (typeof LRT.Train.ejectExteriorEntities === 'function') LRT.Train.ejectExteriorEntities();
    LRT.Train.departNow();
    campaignState.trainCallActive = false;
    CORE.gameState = STATES.TRAIN_DEPARTING;
    CORE.boardingCloseTimer = 0;
    initRideMoodTransition();
    LRT.PlayerUI.setNotice(
      CORE.activeTravelDir < 0
        ? '🟠 PINTU DITUTUP — KERETA KEMBALI BERANGKAT!'
        : '🟢 PINTU DITUTUP — BERANGKAT!',
      CORE.activeTravelDir < 0 ? '#f59e0b' : '#4ade80'
    );
    if (!CORE.tutorialActive) {
      campaignState.voTriggered.add('VO_24_DOOR_CLOSE');
      if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
        LRT.Audio.playVoice('VO_24_DOOR_CLOSE');
      }
    }
    return true;
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
    const plFlags = I.player && I.player.flags ? I.player.flags : null;
    if ((pState && (pState.docViewerOpen || pState.fastTravelOpen)) || (plFlags && plFlags.paused) || CORE.gameMode === MODES.EXPLORATION || CORE.gameState === STATES.GAME_OVER) return;
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
          ? (CORE.manualDoorHold
            ? 'Gunakan Panel Ruang Kontrol untuk Kunci/Buka Pintu & Berangkat'
            : `Press [E] / [T] in Control Room to Depart (Auto-seal: ${Math.max(0, CORE.boardingCloseTimer).toFixed(1)}s)`)
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
      const o0 = campaignState.stationObjectives[0];
      if (!o0.genOn) {
        if (hasKeyItem('fuel_can') || o0.fuelFound) {
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'ISI SOLAR & NYALAKAN GENERATOR',
            objectiveDetail: 'Kembali ke Concourse & nyalakan generator portabel [E]'
          };
        }
        if (o0.genInspected) {
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'CARI JERIGEN SOLAR',
            objectiveDetail: 'Periksa Pojok SE — Pos Ronda & Warung Kopi'
          };
        }
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RESTORE AUXILIARY POWER',
          objectiveDetail: 'Periksa generator portabel di Concourse [E]'
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
      const o1 = campaignState.stationObjectives[1];
      if (!o1.fuseFound) {
        if (hasKeyItem('cawang_keycard') || o1.keycardFound) {
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'BUKA PANEL 750V & AMBIL SEKRING',
            objectiveDetail: 'Kembali ke Kabin Bangkai Jalur 4 & buka panel [E]'
          };
        }
        if (o1.cabInspected) {
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'CARI KARTU AKSES 750V',
            objectiveDetail: 'Periksa Pos Sekuriti — Pojok NE (Gudang Logistik)'
          };
        }
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RECOVER SIGNAL FUSE',
          objectiveDetail: 'Periksa Kabin Bangkai Jalur 4 (Ujung Utara) [E]'
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
      if (!o2.depotDone) {
        const hasCryo = hasKeyItem('harja_cryo') || o2.vaxCryoFound;
        const hasPmi = hasKeyItem('harja_pmi_key') || o2.pmiKeyFound;
        if (hasCryo && hasPmi) {
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'EKSTRAK VAKSIN SPORA',
            objectiveDetail: 'Kembali ke Depo Harjamukti & buka peti pendingin [E]'
          };
        }
        if (o2.depotInspected || hasCryo || hasPmi) {
          const need = [];
          if (!hasCryo) need.push('Cryo Stabilizer (Kebun Atap)');
          if (!hasPmi) need.push('Kunci PMI (Pojok NW — Ambulans)');
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'KUMPULKAN SEGEL PENDINGIN VAKSIN',
            objectiveDetail: `Cari: ${need.join(' & ')}`
          };
        }
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'PERIKSA PENDINGIN VAKSIN DEPO',
          objectiveDetail: 'Periksa peti bio-kontainmen di Depo Utara Harjamukti [E]'
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
      const o3 = campaignState.stationObjectives[3];
      if (!o3.plnDone) {
        if (o3.feederWestOn && o3.feederEastOn) {
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'NYALAKAN PANEL INDUK CONCOURSE',
            objectiveDetail: 'Kedua feeder aktif — tarik sakelar induk Kuningan [E]'
          };
        }
        if (o3.breakerInspected || o3.feederWestOn || o3.feederEastOn) {
          const need = [];
          if (!o3.feederWestOn) need.push('Feeder Barat (Trafo Jalan Barat)');
          if (!o3.feederEastOn) need.push('Feeder Timur (Gardu PLN Timur)');
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'PULIHKAN 2 FEEDER JALANAN',
            objectiveDetail: `Ikuti kabel kuning: ${need.join(' & ')}`
          };
        }
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'PERIKSA PANEL INDUK KUNINGAN',
          objectiveDetail: 'Periksa panel pemutus daya utama di Concourse [E]'
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
      const o4 = campaignState.stationObjectives[4] || {};
      if (!o4.barricadeCleared) {
        const hasC4 = hasKeyItem('c4_charge') || o4.c4Found;
        if (hasC4) {
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'LEDAKKAN BARIKADE BAJA CIKOKO',
            objectiveDetail: 'Pasang C4 [E] atau tembak roket RPG-7 ke barikade tol'
          };
        }
        if (o4.barricadeInspected) {
          return {
            mode: CORE.gameMode,
            stationName: name,
            stationCode: code,
            stationSub: sub,
            objectiveTitle: 'AMBIL C4 & RPG-7 KONVOI MILITER',
            objectiveDetail: 'Ikuti asap hitam & suar merah — Pojok SW (Konvoi Militer)'
          };
        }
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'PERIKSA BARIKADE JALAN TOL CIKOKO',
          objectiveDetail: 'Periksa sekat baja jalan tol di selatan stasiun [E]'
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
      const stDone = !!(r.street || r.pln);
      const jpoDone = !!r.jpo;
      const plDone = !!(r.platform || r.totem);
      const count = (stDone ? 1 : 0) + (jpoDone ? 1 : 0) + (plDone ? 1 : 0);
      if (count < 3) {
        const missing = [];
        if (!stDone) missing.push('Relai Jalan Rasuna Said');
        if (!jpoDone) missing.push('Relai JPO Atas');
        if (!plDone) missing.push('Totem Peron Tengah');
        return {
          mode: CORE.gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: `AKTIFKAN 3 ZONA RELAI SINYAL (${count}/3)`,
          objectiveDetail: `Tersisa: ${missing.join(', ')} [E]`
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
      if (!obj.genOn) {
        if (hasKeyItem('fuel_can') || obj.fuelFound) return ['portable_generator'];
        if (obj.genInspected) return ['dukuh_fuel_can'];
        return ['portable_generator'];
      }
      if (waveRemaining > 0) return [];
      return ['call_train'];
    }
    if (sIdx === 1) {
      if (!obj.fuseFound) {
        if (hasKeyItem('cawang_keycard') || obj.keycardFound) return ['cawang_derelict_cab'];
        if (obj.cabInspected) return ['cawang_bypass_keycard'];
        return ['cawang_derelict_cab'];
      }
      if (waveRemaining > 0) return [];
      return campaignState.clearedStations.has(CORE.stationIndex) ? ['call_train', 'call_train_p2'] : ['call_train'];
    }
    if (sIdx === 2) {
      if (!obj.depotDone) {
        const hasCryo = hasKeyItem('harja_cryo') || obj.vaxCryoFound;
        const hasPmi = hasKeyItem('harja_pmi_key') || obj.pmiKeyFound;
        if (hasCryo && hasPmi) return ['depot_supply'];
        if (obj.depotInspected || hasCryo || hasPmi) {
          const targets = [];
          if (!hasCryo) targets.push('garden_supply');
          if (!hasPmi) targets.push('harja_pmi_key');
          return targets;
        }
        return ['depot_supply'];
      }
      if (waveRemaining > 0) return [];
      return ['call_train', 'call_train_p2'];
    }
    if (sIdx === 3) {
      if (!obj.plnDone) {
        if (obj.feederWestOn && obj.feederEastOn) return ['kuningan_main_breaker'];
        if (obj.breakerInspected || obj.feederWestOn || obj.feederEastOn) {
          const targets = [];
          if (!obj.feederWestOn) targets.push('kuningan_feeder_west');
          if (!obj.feederEastOn) targets.push('city_pln_box');
          return targets;
        }
        return ['kuningan_main_breaker'];
      }
      if (waveRemaining > 0) return [];
      return ['call_train', 'call_train_p2'];
    }
    if (sIdx === 4) {
      if (!obj.barricadeCleared) {
        if (hasKeyItem('c4_charge') || obj.c4Found) return ['cikoko_barricade'];
        if (obj.barricadeInspected) return ['cikoko_c4_charge'];
        return ['cikoko_barricade'];
      }
      if (waveRemaining > 0) return [];
      return ['call_train', 'call_train_p2'];
    }
    if (sIdx === 5) {
      const r = obj.relays || {};
      const targets = [];
      if (!(r.street || r.pln)) targets.push('setiabudi_relay_street');
      if (!r.jpo) targets.push('setiabudi_jpo_switch');
      if (!(r.platform || r.totem)) targets.push('route_totem');
      if (targets.length > 0) return targets;
      if (waveRemaining > 0) return [];
      return ['call_train', 'call_train_p2'];
    }

    return waveRemaining > 0 ? [] : ['call_train', 'call_train_p2'];
  }

  const _trainBoardingMarker = {
    id: 'train_boarding_marker',
    x: 1.5,
    y: 1.5,
    z: 0,
    label: 'NAIK KE LRT',
    kind: 'train',
    type: 'train',
    color: '#22c55e',
    alwaysShow: true,
    active: true
  };
  const _trainBoardingMarkers = [_trainBoardingMarker];

  function getTrainBoardingMarkers(pState) {
    if (CORE.gameState !== STATES.TRAIN_APPROACHING && CORE.gameState !== STATES.TRAIN_BOARDING) {
      return null;
    }
    const rail = (LRT.Station && typeof LRT.Station.getRailConfig === 'function')
      ? LRT.Station.getRailConfig()
      : { isIsland: false, track1X: 0.0, track2X: -4.70, platEdge1X: 1.46, platEdge2X: -6.16 };
    const isReturn = CORE.activeTravelDir === -1;
    const stationOz = (LRT.Station && LRT.Station.rootGroup) ? (LRT.Station.rootGroup.position.z || 0) : 0;

    if (CORE.gameState === STATES.TRAIN_APPROACHING) {
      _trainBoardingMarker.x = isReturn ? (rail.platEdge2X - 0.65) : (rail.platEdge1X + 0.65);
      _trainBoardingMarker.y = 1.55;
      _trainBoardingMarker.z = stationOz;
      _trainBoardingMarker.label = isReturn ? 'PERON 2 — LRT MENDEKAT' : 'PERON 1 — LRT MENDEKAT';
      _trainBoardingMarker.color = isReturn ? '#f59e0b' : '#22c55e';
      _trainBoardingMarker.alwaysShow = true;
      _trainBoardingMarker.active = true;
      return _trainBoardingMarkers;
    }

    const pos = pState && pState.pos ? pState.pos : null;
    const inside = !!(pos && LRT.Train && typeof LRT.Train.isPlayerInside === 'function' && LRT.Train.isPlayerInside(pos));
    const trackX = (LRT.Train && typeof LRT.Train.getTrackX === 'function')
      ? LRT.Train.getTrackX()
      : (isReturn ? rail.track2X : rail.track1X);
    const tz = (LRT.Train && typeof LRT.Train.getOffsetZ === 'function') ? LRT.Train.getOffsetZ() : stationOz;

    if (CORE.rideCompleteReady) {
      _trainBoardingMarker.x = isReturn ? (rail.platEdge2X - 1.15) : (rail.platEdge1X + 1.15);
      _trainBoardingMarker.y = 1.45;
      _trainBoardingMarker.z = pos ? Math.max(-24, Math.min(24, pos.z)) : tz;
      _trainBoardingMarker.label = 'TURUN KE PERON';
      _trainBoardingMarker.color = '#38bdf8';
      _trainBoardingMarker.alwaysShow = true;
      _trainBoardingMarker.active = true;
      return _trainBoardingMarkers;
    }

    if (!inside) {
      const doors = (C.STATION_DIMS && C.STATION_DIMS.psdCentersZ) || [-17.55, -5.7, 0.0, 5.7, 17.55];
      let bestZ = 0;
      let bestD = Infinity;
      const pzRel = pos ? (pos.z - tz) : 0;
      for (let i = 0; i < doors.length; i++) {
        const d = Math.abs(doors[i] - pzRel);
        if (d < bestD) {
          bestD = d;
          bestZ = doors[i];
        }
      }
      _trainBoardingMarker.x = isReturn ? (trackX - 1.35) : (trackX + 1.35);
      _trainBoardingMarker.y = 1.45;
      _trainBoardingMarker.z = bestZ + tz;
      _trainBoardingMarker.label = 'NAIK KE LRT';
      _trainBoardingMarker.color = isReturn ? '#f59e0b' : '#22c55e';
      _trainBoardingMarker.alwaysShow = true;
      _trainBoardingMarker.active = true;
      return _trainBoardingMarkers;
    }

    _trainBoardingMarker.x = trackX;
    _trainBoardingMarker.y = 1.35;
    _trainBoardingMarker.z = tz + (isReturn ? -23.5 : 23.5);
    _trainBoardingMarker.label = 'BERANGKAT [E/T]';
    _trainBoardingMarker.color = '#22c55e';
    _trainBoardingMarker.alwaysShow = true;
    _trainBoardingMarker.active = true;
    return _trainBoardingMarkers;
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

  function queueVariantRadioLine(baseId, variants, opts) {
    if (!Array.isArray(variants) || variants.length === 0) return null;
    const pickIdx = Math.abs((CORE.campaignSeed | 0) + (CORE.stationIndex | 0) * 7 + (campaignState.idleHintCount | 0)) % variants.length;
    const line = variants[pickIdx];
    if (!line) return null;
    const o = Object.assign({ id: baseId + '_' + pickIdx, priority: 'MEDIUM' }, opts || {});
    if (LRT.Audio && typeof LRT.Audio.queueRadioSubtitle === 'function') {
      return LRT.Audio.queueRadioSubtitle(line.speaker || 'SARAH', line.id, line.en, line.dur || 6.2, o);
    }
    if (LRT.PlayerUI && typeof LRT.PlayerUI.showSubtitle === 'function') {
      LRT.PlayerUI.showSubtitle(line.speaker || 'SARAH', line.id, line.en, line.dur || 6.2);
    }
    return null;
  }

  const IDLE_DIRECTIONAL_HINTS = {
    0: [
      { speaker: 'SARAH', id: 'Arya, kalau butuh arah ke Jerigen Solar: keluar pintu timur menuju Pos Ronda di Pojok Tenggara (SE), atau tekan [Q] untuk Kompas Taktis.', en: 'Arya, if you need a bearing on the Diesel Can: head out the east exit toward the SE Poskamling Watchpost, or tap [Q] for Tactical Ping.' },
      { speaker: 'SARAH', id: 'Cek rambu arah hijau di persimpangan, Arya. Jerigen Solar ada di Pos Ronda Pojok SE — setelah itu balik nyalakan Genset dekat Concourse.', en: 'Check the green street signs at the intersection, Arya. The Diesel Can is at the SE Watchpost — bring it back to the Concourse generator.' }
    ],
    1: [
      { speaker: 'SARAH', id: 'Arya, ikuti jalan timur ke utara menuju Gudang Logistik Pojok Timur Laut (NE) untuk mengambil Kartu Akses 750V di Pos Sekuriti. Tekan [Q] untuk ping arah.', en: 'Arya, follow the east boulevard north to the NE Logistics Depot Security Booth for the 750V Keycard. Press [Q] for a bearing ping.' },
      { speaker: 'SARAH', id: 'Panel 750V di kabin Jalur 4 masih menunggu kartu bypass. Pos Sekuriti Pojok NE ditandai lampu kuning gudang — gunakan [Q] jika perlu arah.', en: 'The Track 4 cab 750V panel is still waiting on the bypass card. Look for the amber warehouse floodlights at the NE Security Booth, or tap [Q].' }
    ],
    2: [
      { speaker: 'SARAH', id: 'Arya, ingat dua komponen segel Depo Harjamukti: Cryo Stabilizer di Kebun Atap utara dan Kunci PMI di ambulans Pojok Barat Laut (NW). Tekan [Q] untuk arah.', en: 'Arya, remember both Harjamukti Depot pieces: Cryo Stabilizer on the north Garden Terrace and PMI Key at the NW ambulance. Press [Q] for bearing.' },
      { speaker: 'SARAH', id: 'Cek tenda putih palang merah di Pojok NW untuk Kunci PMI, lalu bawa bersama Cryo Stabilizer ke lemari vaksin di Depo selatan.', en: 'Check the white PMI medical tent in the NW corner for the key, then bring it with the Cryo Stabilizer to the south Depot cooler.' }
    ],
    3: [
      { speaker: 'SARAH', id: 'Ikuti garis kabel kuning di aspal, Arya — satu ke Gardu Feeder Barat, satu ke Gardu Feeder Timur. Setelah keduanya hijau, tarik Sakelar Induk Concourse. [Q] untuk arah.', en: 'Follow the yellow asphalt feeder cables, Arya — one to the West Feeder, one to the East Feeder. Once both show green, throw the Concourse Main Breaker. [Q] for ping.' },
      { speaker: 'SARAH', id: 'Gardu listrik Kuningan masih berbunyi dengung di sisi jalan timur dan barat. Tekan [Q] jika badai membuat lampu strobo oranye sulit terlihat.', en: 'Kuningan street feeders are humming along both the west and east boulevards. Tap [Q] if the storm obscures the amber strobe beacons.' }
    ],
    4: [
      { speaker: 'SARAH', id: 'Muatan C4 ada di Konvoi Militer Pojok Barat Daya (SW) — cari truk militer dan karung pasir, lalu pasang di Barikade Karantina. Tekan [Q] untuk arah.', en: 'The C4 charge is at the SW Military Convoy — look for the army truck and sandbags, then plant it on the Quarantine Barricade. Press [Q] for bearing.' },
      { speaker: 'SARAH', id: 'Kalau kehabisan peluru berat, ambil C4 dari peti konvoi di Pojok SW dekat barikade selatan — tekan [Q] untuk Kompas Taktis.', en: 'If you are out of heavy ordnance, grab the C4 from the SW convoy crate near the south checkpoint — tap [Q] for the Tactical Compass.' }
    ],
    5: [
      { speaker: 'SARAH', id: 'Tiga pemancar Setiabudi: Gardu Jalan Rasuna Said, Konsol JPO atas, dan Terminal Peron Tengah. Aktifkan semua lalu tahan gelombang Omega! [Q] untuk arah.', en: 'Three Setiabudi relays: Rasuna Said Street Feeder, upper JPO Console, and Central Platform Terminal. Bring all online to trigger Omega extraction! [Q] for ping.' },
      { speaker: 'SARAH', id: 'Pantau lampu suar oranye di JPO atas, jalan timur, dan peron tengah — tekan [Q] untuk menandai pemancar berikutnya yang masih padam.', en: 'Watch for the amber beacons on the upper JPO, east street, and central platform — tap [Q] to ping the next offline relay.' }
    ]
  };

  const STATION_ARRIVAL_BANTER = {
    1: [
      { speaker: 'ARYA', id: 'Cawang... simpang ini biasanya padat jam pulang kantor. Sekarang cuma kereta anjlok di Jalur 4.', en: 'Cawang... this interchange is usually packed at rush hour. Now it is just a derailed train on Track 4.' },
      { speaker: 'SARAH', id: 'Sinyal kita masih tembus di Cawang, Arya. Sisir Pos Sekuriti Pojok NE dulu, jangan biarkan mereka mengepung di terowongan.', en: 'Our comms still reach Cawang, Arya. Hit the NE Security Booth first and do not let them box you in.' }
    ],
    2: [
      { speaker: 'ARYA', id: 'Harjamukti terasa lebih sepi... tapi darah di tenda PMI luar masih basah. Wabah ini baru hitungan jam.', en: 'Harjamukti is eerily quiet... but the triage chaos outside is only hours old.' },
      { speaker: 'SARAH', id: 'Pendingin vaksin di Depo selatan masih bertahan pakai baterai cadangan. Ambil Cryo Stabilizer dan Kunci PMI sebelum terlambat.', en: 'The south Depot vaccine cooler is still running on backup battery. Get the Cryo Stabilizer and PMI Key before it warms up.' }
    ],
    3: [
      { speaker: 'ARYA', id: 'Langit Kuningan gelap sekali—kabel PLN di jalan sampai putus. Aku cari Gardu Barat dan Timur dulu.', en: 'Kuningan sky is pitch dark—half the street feeders blew out. Tracking down the West and East feeders.' },
      { speaker: 'SARAH', id: 'Ikuti suar oranye di boulevard Kuningan, Arya. Begitu dua feeder aktif, tarik Sakelar Induk Concourse untuk buka jalur kereta.', en: 'Follow the amber strobes along Kuningan boulevard, Arya. Once both feeders are live, throw the Concourse Main Breaker.' }
    ],
    4: [
      { speaker: 'ARYA', id: 'Cikoko diblokade total oleh barikade karantina. Aku perlu C4 dari konvoi militer barat daya.', en: 'Cikoko is completely sealed off by a quarantine barricade. Heading for C4 at the southwest military convoy.' },
      { speaker: 'SARAH', id: 'Hati-hati di pasar ruko Cikoko, Arya — kepadatan di sini bikin Infected cepat berkumpul begitu dengar ledakan.', en: 'Stay sharp around the Cikoko ruko strip, Arya — dense alleys mean infected converge fast once you blow that barricade.' }
    ],
    5: [
      { speaker: 'ARYA', id: 'Setiabudi... pemberhentian terakhir sebelum ekstraksi. Semua pemancar harus nyala sekarang.', en: 'Setiabudi... last stop before extraction. Time to bring every relay online.' },
      { speaker: 'SARAH', id: 'Helikopter dan kereta evakuasi menunggu sinyal Omega, Arya. Nyalakan pemancar Jalan, JPO, dan Peron — aku kawal dari radio!', en: 'Extraction is standing by for the Omega lock, Arya. Power up the Street, JPO, and Platform relays — I am with you on comms!' }
    ]
  };

  const MID_RIDE_BRIEFINGS = {
    1: {
      id: 'Arya, kita mendekati Cawang Interchange. Panel 750V di kabin bangkai Jalur 4 terkunci magnetik — siapkan diri menyisir Pos Sekuriti Gudang Logistik (Pojok NE) untuk kartu akses.',
      en: 'Arya, approaching Cawang Interchange. The Track 4 derelict cab 750V panel is magnetically locked — be ready to raid the NE Logistics Security Booth for the bypass keycard.'
    },
    2: {
      id: 'Harjamukti di depan, Arya. Pendingin vaksin di Depo tersegel termal — kamu perlu Cryo Stabilizer dari Kebun Atap dan Kunci PMI dari ambulans Pojok Barat Laut.',
      en: 'Harjamukti ahead, Arya. The depot vaccine cooler is thermally sealed — you will need the Cryo Stabilizer from the Garden Terrace and the PMI Override Key from the NW ambulance.'
    },
    3: {
      id: 'Arya, sensor listrik Kuningan mati total di tengah badai monsun — siap-siap ikuti kabel kuning di jalanan untuk menyalakan Feeder Barat dan Timur sebelum menarik sakelar induk.',
      en: 'Arya, Kuningan grid sensors are completely dead in the monsoon blackout — follow the yellow asphalt cables to restore both West and East street feeders before throwing the main breaker.'
    },
    4: {
      id: 'Cikoko di depan — barikade baja karantina memblokir jalur tol dan tahan peluru biasa. Pantau asap hitam di Konvoi Militer Pojok SW untuk muatan C4 atau peluncur RPG-7.',
      en: 'Cikoko ahead — an armored quarantine barricade blocks the highway and shrugs off small arms. Look for black smoke at the SW Military Convoy for C4 charges or an RPG-7.'
    },
    5: {
      id: 'Perhentian terakhir: Setiabudi. Tiga zona pemancar harus aktif serentak — Jalan Rasuna Said, JPO atas, dan Peron Tengah — untuk membuka gerbang ekstraksi Omega.',
      en: 'Final stop: Setiabudi. All three signal relay zones — Street Boulevard, JPO Skybridge, and Central Platform — must come online to open the Omega extraction gates.'
    }
  };

  function updateTrainCampaign(dt, pState) {
    const plFlags = I.player && I.player.flags ? I.player.flags : null;
    if ((pState && (pState.docViewerOpen || pState.fastTravelOpen)) || (plFlags && plFlags.paused)) return false;
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
          if (LRT.Weapons && typeof LRT.Weapons.clearStationDecals === 'function') LRT.Weapons.clearStationDecals();
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
            CORE.manualDoorHold = false;
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
              if (!CORE.tutorialActive && aVo && !campaignState.voTriggered.has(aVo)) {
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
              if (!CORE.tutorialActive && !campaignState.voTriggered.has('VO_05_TRAIN_DOCK')) {
                campaignState.voTriggered.add('VO_05_TRAIN_DOCK');
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice('VO_05_TRAIN_DOCK');
                }
              }
            }
          }
        } else if (trState === 'DEPARTING') {
          campaignState.trainCallActive = false;
          CORE._rideBriefingSent = false;
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

      if (typeof CORE.setTransitTunnelBlend === 'function' && typeof LRT.Train.getTunnelBlend === 'function') {
        const isRiding = (trState === 'DEPARTING' || trState === 'CRUISE' || trState === 'ARRIVING');
        CORE.setTransitTunnelBlend(isRiding ? LRT.Train.getTunnelBlend() : 0.0);
      }

      if ((trState === 'DEPARTING' || trState === 'CRUISE' || trState === 'ARRIVING') &&
          CORE.gameMode === MODES.SURVIVAL && !CORE.lightingLockedByUser &&
          CORE._rideFromMoodKey && CORE._rideToMoodKey &&
          typeof CORE.lerpMoodLighting === 'function' &&
          typeof LRT.Train.getRideProgress === 'function') {
        CORE.lerpMoodLighting(CORE._rideFromMoodKey, CORE._rideToMoodKey, LRT.Train.getRideProgress());
      }

      // Mid-Ride LRT Safe-Room Briefing Radio (rideProgress ~ 0.35)
      if (trState === 'CRUISE' &&
          CORE.activeTravelDir === 1 &&
          CORE.gameMode === MODES.SURVIVAL &&
          !CORE.tutorialActive &&
          !CORE._rideBriefingSent &&
          typeof LRT.Train.getRideProgress === 'function' &&
          LRT.Train.getRideProgress() >= 0.32) {
        CORE._rideBriefingSent = true;
        const upcomingIdx = CORE.rideCompleteReady ? CORE.stationIndex : (CORE.stationIndex + 1);
        const brief = MID_RIDE_BRIEFINGS[upcomingIdx];
        if (brief) {
          if (LRT.Audio && typeof LRT.Audio.queueRadioSubtitle === 'function') {
            LRT.Audio.queueRadioSubtitle('SARAH', brief.id, brief.en, 6.8, {
              id: 'MID_RIDE_BRIEF_' + upcomingIdx,
              priority: 'HIGH',
              radioChime: true
            });
          } else if (LRT.PlayerUI && typeof LRT.PlayerUI.showSubtitle === 'function') {
            LRT.PlayerUI.showSubtitle('SARAH', brief.id, brief.en, 6.8);
          }
        }
      }

      // Sync PSD smooth slide & disembark flow across both Peron 1 and Peron 2
      if (CORE.gameState === STATES.TRAIN_BOARDING) {
        if (CORE.gameMode === MODES.SURVIVAL && !CORE.tutorialActive && !campaignState.voTriggered.has('VO_06_BOARD_WARN')) {
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
          CORE.manualDoorHold = false;
          if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, CORE.activeTravelDir);
          LRT.Train.closeDoors();
          LRT.Train.reset(CORE.gameMode);
          CORE.prevTrainState = 'AWAY';
          CORE.gameState = STATES.STATION_ACTIVE;
          if (CORE.gameMode === MODES.SURVIVAL) {
            campaignState.objectiveIdleTimer = 0;
            campaignState.stationElapsedSec = 0;
            if (campaignState.clearedStations.has(CORE.stationIndex)) {
              LRT.PlayerUI.setNotice('STASIUN SUDAH DIBERSIHKAN — LOGISTIK TERSEDIA', '#4ade80');
            } else {
              spawnCurrentWave();
              const banterPool = STATION_ARRIVAL_BANTER[CORE.stationIndex % 6];
              const banterKey = 'ARRIVAL_BANTER_' + (CORE.stationIndex % 6);
              if (banterPool && !campaignState.voTriggered.has(banterKey)) {
                campaignState.voTriggered.add(banterKey);
                queueVariantRadioLine(banterKey, banterPool, { priority: 'MEDIUM' });
              }
            }
          } else {
            LRT.PlayerUI.setNotice('JELAJAHI STASIUN — TEKAN [T] UNTUK PANGGIL LRT', '#e0b422');
          }
        } else if (CORE.gameMode === MODES.SURVIVAL && !CORE.tutorialActive && !CORE.rideCompleteReady && !CORE.manualDoorHold && LRT.Train.isPlayerInside(pState.pos)) {
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
    const plFlags = I.player && I.player.flags ? I.player.flags : null;
    if ((pState && (pState.docViewerOpen || pState.fastTravelOpen)) || (plFlags && plFlags.paused)) return;
    if (!CORE.tutorialActive) tickAutosave(dt);
    // Survival wave logic (plus animate/update any manually spawned or dying zombies in exploration mode)
    const hasCustomZombies = LRT.Enemies && (
      (typeof LRT.Enemies.getTotalCount === 'function' && LRT.Enemies.getTotalCount() > 0) ||
      (typeof LRT.Enemies.getAliveCount === 'function' && LRT.Enemies.getAliveCount() > 0)
    );
    if ((CORE.gameMode === MODES.SURVIVAL || hasCustomZombies) && (CORE.gameState === STATES.STATION_ACTIVE || CORE.gameState === STATES.TRAIN_APPROACHING || CORE.gameState === STATES.TRAIN_BOARDING)) {
      if (LRT.Enemies && LRT.Enemies.update) {
        const beforeAlive = LRT.Enemies.getAliveCount();
        LRT.Enemies.update(dt, pState.pos, stationGrid, trainCols, handlePlayerHit, handleEnemyDrop, enemyOpts);
        const afterAlive = LRT.Enemies.getAliveCount();
        if (CORE.gameMode === MODES.SURVIVAL && !CORE.tutorialActive) {
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
    if (CORE.gameMode === MODES.SURVIVAL && !CORE.tutorialActive) {
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

      // Station 01 unobtrusive onboarding tip teaching landmark clues & [Q] Tactical Ping
      campaignState.stationElapsedSec = (campaignState.stationElapsedSec || 0) + dt;
      if (CORE.stationIndex === 0 && !campaignState.onboardingHintDone && campaignState.stationElapsedSec >= 8.5) {
        campaignState.onboardingHintDone = true;
        if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
          LRT.PlayerUI.setNotice('TIPS: BACA PETUNJUK MISI & RAMBU JALAN — TEKAN [Q] UNTUK KOMPAS TAKTIS', '#e0b422');
        }
        if (LRT.PlayerUI && typeof LRT.PlayerUI.pulseObjectiveHint === 'function') {
          LRT.PlayerUI.pulseObjectiveHint(4500);
        }
      }

      // Idle / wandering directional hint nudge on Medium/Hard (PROXIMITY/OFF waypoints) after 50s without objective progress
      if (CORE.gameState === STATES.STATION_ACTIVE && !isStationPrimaryObjectiveComplete(CORE.stationIndex)) {
        const wpMode = (typeof CORE.getWaypointMode === 'function') ? CORE.getWaypointMode() : 'proximity';
        const curTargets = getActiveObjectiveTargetIds(CORE.stationIndex);
        const objIdleKey = `${CORE.stationIndex}|${curTargets.join(',')}`;
        if (campaignState.lastObjectiveIdleKey !== objIdleKey) {
          campaignState.lastObjectiveIdleKey = objIdleKey;
          campaignState.objectiveIdleTimer = 0;
        } else if (wpMode !== 'on') {
          campaignState.objectiveIdleTimer = (campaignState.objectiveIdleTimer || 0) + dt;
          const threshold = campaignState.idleHintCount === 0 ? 50.0 : 65.0;
          if (campaignState.objectiveIdleTimer >= threshold) {
            campaignState.objectiveIdleTimer = 0;
            campaignState.idleHintCount = (campaignState.idleHintCount || 0) + 1;
            const hints = IDLE_DIRECTIONAL_HINTS[CORE.stationIndex % 6];
            if (hints && hints.length) {
              queueVariantRadioLine(`IDLE_HINT_S${CORE.stationIndex % 6}_${campaignState.idleHintCount}`, hints, {
                priority: 'MEDIUM',
                groupKey: 'idle_hint'
              });
            }
            if (LRT.PlayerUI && typeof LRT.PlayerUI.pulseObjectiveHint === 'function') {
              LRT.PlayerUI.pulseObjectiveHint(5200);
            }
          }
        }
      } else {
        campaignState.objectiveIdleTimer = 0;
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
  // SAVE / LOAD SYSTEM moved to src/core/save_system.js.
  // =========================================================

  CORE.CAMPAIGN_MOODS = CAMPAIGN_MOODS;
  CORE.CAMPAIGN_MOODS_DAYLIGHT = (C.CAMPAIGN_MOODS_DAYLIGHT || FALLBACK_CAMPAIGN_MOODS_DAYLIGHT);
  CORE.getActiveCampaignMoods = getActiveCampaignMoods;
  CORE.getCampaignMoodForStation = getCampaignMoodForStation;
  CORE.setAtmosphereMode = setAtmosphereMode;
  CORE.getAtmosphereMode = getAtmosphereMode;
  CORE.campaignState = campaignState;
  CORE.resetCampaignState = resetCampaignState;
  CORE.addKeyItem = addKeyItem;
  CORE.hasKeyItem = hasKeyItem;
  CORE.consumeKeyItem = consumeKeyItem;
  CORE.getKeyItems = getKeyItems;
  CORE.getKeyItemsDisplayText = getKeyItemsDisplayText;
  CORE.invalidateKeyItemsCache = invalidateKeyItemsCache;
  CORE.getTrainBoardingMarkers = getTrainBoardingMarkers;
  CORE.saveCurrentStationUsedIds = saveCurrentStationUsedIds;
  CORE.resetGameOverDom = resetGameOverDom;
  CORE.triggerExtractionVictory = triggerExtractionVictory;
  CORE.handleInteractResult = handleInteractResult;
  CORE.isStationPrimaryObjectiveComplete = isStationPrimaryObjectiveComplete;
  CORE.pickPlayerSpawnPos = pickPlayerSpawnPos;
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
      if (LRT.Weapons && typeof LRT.Weapons.clearStationDecals === 'function') LRT.Weapons.clearStationDecals();
      if (LRT.Enemies && typeof LRT.Enemies.setDifficulty === 'function') LRT.Enemies.setDifficulty(CORE.difficultyKey);
      if (LRT.Enemies && typeof LRT.Enemies.setAtmosphereMode === 'function') LRT.Enemies.setAtmosphereMode(getAtmosphereMode());
      if (LRT.Train && LRT.Train.reset) LRT.Train.reset(CORE.gameMode);
      CORE.stationIndex = targetIdx;
      CORE.activeTravelDir = 1;
      CORE.prevTrainState = 'AWAY';
      CORE.manualDoorHold = false;
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
  CORE.updateTrainCampaign = updateTrainCampaign;
  CORE.updateSurvivalAndVoChecks = updateSurvivalAndVoChecks;

  const directorApi = LRT.Director || {};
  directorApi.jumpToStation = jumpToStation;
  directorApi.summonTrain = summonTrain;
  directorApi.departTrainNow = departTrainNow;
  directorApi.getCampaignState = () => campaignState;
  directorApi.addKeyItem = addKeyItem;
  directorApi.hasKeyItem = hasKeyItem;
  directorApi.consumeKeyItem = consumeKeyItem;
  directorApi.getKeyItems = getKeyItems;
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
