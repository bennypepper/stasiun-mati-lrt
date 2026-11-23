(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const CORE = (I.core = I.core || {});
  const C = LRT.Config;
  const MODES = C.MODES;
  const STATES = C.STATES;

  const SAVE_KEY = 'lrt_campaign_save_v1';
  const SAVE_VERSION = 1;
  const AUTOSAVE_INTERVAL = 8.0;
  let _autosaveTimer = 0;

  function buildSaveData() {
    const campaignState = CORE.campaignState;
    const p = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') ? LRT.PlayerUI.getState() : null;
    if (typeof CORE.saveCurrentStationUsedIds === 'function') CORE.saveCurrentStationUsedIds();
    const usedObj = {};
    if (campaignState && campaignState.stationUsedIds) {
      campaignState.stationUsedIds.forEach((set, idx) => { usedObj[idx] = Array.from(set); });
    }
    const atmos = (typeof CORE.getAtmosphereMode === 'function') ? CORE.getAtmosphereMode() : CORE.atmosphereMode;
    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      difficultyKey: CORE.difficultyKey,
      atmosphereMode: atmos,
      stationIndex: CORE.stationIndex | 0,
      currentWave: CORE.currentWave | 0,
      stationsCleared: CORE.stationsCleared | 0,
      totalKills: CORE.totalKills | 0,
      health: p ? Math.round(p.health) : 100,
      armor: p ? Math.round(p.armor || 0) : 0,
      maxArmor: p ? (p.maxArmor || 100) : 100,
      weapons: (LRT.Weapons && typeof LRT.Weapons.getSaveState === 'function') ? LRT.Weapons.getSaveState() : null,
      campaign: campaignState ? {
        clearedStations: Array.from(campaignState.clearedStations),
        visitedStations: Array.from(campaignState.visitedStations),
        triggeredSurgeStations: Array.from(campaignState.triggeredSurgeStations),
        keyItems: Array.from(campaignState.keyItems || []),
        stationObjectives: JSON.parse(JSON.stringify(campaignState.stationObjectives)),
        voTriggered: Array.from(campaignState.voTriggered),
        collectedLogs: campaignState.collectedLogs.slice(),
        firstBarrelExploded: !!campaignState.firstBarrelExploded,
        stationUsedIds: usedObj
      } : null
    };
  }

  function writeSave() {
    const campaignState = CORE.campaignState;
    if (CORE.gameMode !== MODES.SURVIVAL || (campaignState && campaignState.campaignVictory)) return false;
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
    const campaignState = CORE.campaignState;
    if (!d || !d.campaign || !campaignState) return false;
    const c = d.campaign;
    campaignState.clearedStations = new Set(c.clearedStations || []);
    campaignState.visitedStations = new Set(c.visitedStations || [0]);
    campaignState.triggeredSurgeStations = new Set(c.triggeredSurgeStations || []);
    campaignState.keyItems = new Set(Array.isArray(c.keyItems) ? c.keyItems : []);
    if (typeof CORE.invalidateKeyItemsCache === 'function') CORE.invalidateKeyItemsCache();
    if (c.stationObjectives) {
      for (const k of Object.keys(c.stationObjectives)) {
        const idx = parseInt(k, 10);
        if (campaignState.stationObjectives[idx] && c.stationObjectives[k]) {
          const savedObj = c.stationObjectives[k];
          Object.assign(campaignState.stationObjectives[idx], savedObj);
          if (idx === 5 && savedObj.relays && campaignState.stationObjectives[5].relays) {
            const sr = savedObj.relays;
            campaignState.stationObjectives[5].relays = {
              street: !!(sr.street || sr.pln),
              jpo: !!sr.jpo,
              platform: !!(sr.platform || sr.totem),
              pln: !!(sr.street || sr.pln),
              totem: !!(sr.platform || sr.totem)
            };
          }
        }
      }
    }
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
    const campaignState = CORE.campaignState;
    if (CORE.gameMode !== MODES.SURVIVAL) return;
    if (campaignState && campaignState.campaignVictory) { clearSave(); return; }
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
})(window.LRT = window.LRT || {});
