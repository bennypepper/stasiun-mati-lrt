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

  const CAMPAIGN_MOODS = [
    'GOLDEN_DUSK',          // 0: Dukuh Atas BSI (Sunset)
    'HAZY_DUSK',            // 1: Cawang Interchange (Blue-Hour Twilight)
    'BLACKOUT_EMERGENCY',   // 2: Harjamukti (Blackout Night)
    'MONSOON_OVERCAST',     // 3: Kuningan (Monsoon Night)
    'TOXIC_SMOG',           // 4: Cikoko (Toxic Spore Night)
    'CRIMSON_BLOOD_MOON'    // 5: Setiabudi (Crimson Blood Moon)
  ];

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
      4: { waveCleared: false },
      5: { relays: { totem: false, pln: false, jpo: false }, waveCleared: false, omegaActive: false, holdoutElapsed: 0 }
    },
    voTriggered: new Set(),
    campaignVictory: false
  };

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
      4: { waveCleared: false },
      5: { relays: { totem: false, pln: false, jpo: false }, waveCleared: false, omegaActive: false, holdoutElapsed: 0 }
    };
    campaignState.voTriggered.clear();
    campaignState.campaignVictory = false;
  }

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
      if (kicker) kicker.textContent = 'SIGNAL LOST // JALUR TERPUTUS';
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
        if (kicker) kicker.textContent = 'EVACUATION PROTOCOL 114-OMEGA // PROTOKOL SELESAI';
        if (title) title.textContent = 'EXTRACTION COMPLETE';
        if (stats) stats.textContent = `All 6 Stations Cleared | Spore Vaccine Secured | Infected Eliminated: ${CORE.totalKills}`;
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

  function gatherClusterSpawnNodes(preferredZones) {
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
    const pPos = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') ? LRT.PlayerUI.getState().pos : null;
    const zoneSet = Array.isArray(preferredZones) && preferredZones.length ? new Set(preferredZones) : null;

    const preferred = [];
    const fallback = [];
    for (let i = 0; i < allNodes.length; i++) {
      const n = allNodes[i];
      if (!n || typeof n.x !== 'number' || typeof n.z !== 'number') continue;
      if (pPos && Math.hypot(n.x - pPos.x, n.z - pPos.z) < 7.0) continue;
      const tag = String(n.zone || n.tag || '').toLowerCase();
      if (zoneSet && zoneSet.has(tag)) {
        preferred.push(n);
      } else {
        fallback.push(n);
      }
    }
    if (preferred.length > 0) return preferred;
    if (fallback.length > 0) return fallback;
    return [
      { x: 3.4, y: 0.0, z: -38.0 },
      { x: 3.4, y: 0.0, z: 38.0 },
      { x: 16.0, y: -1.0, z: -42.0 },
      { x: 16.0, y: -1.0, z: 42.0 }
    ];
  }

  function spawnExtraInfectedCluster(variants, preferredZones) {
    if (!LRT.Enemies || typeof LRT.Enemies.spawnOneZombie !== 'function') return 0;
    const nodes = gatherClusterSpawnNodes(preferredZones);
    let spawned = 0;
    for (let i = 0; i < variants.length; i++) {
      const n = nodes[i % nodes.length];
      const pos = {
        x: n.x + (Math.random() - 0.5) * 1.4,
        y: n.y !== undefined ? n.y : 0.0,
        z: n.z + (Math.random() - 0.5) * 1.4
      };
      if (LRT.Enemies.spawnOneZombie(variants[i], pos, { isRoamer: false, aggroState: 'CHASE', diffKey: CORE.difficultyKey })) {
        spawned++;
      }
    }
    return spawned;
  }

  function triggerObjectiveSurgeWave(stationIdx) {
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

  function triggerTrainCallSiegeWave(stationIdx) {
    if (CORE.gameMode !== MODES.SURVIVAL || CORE.difficultyKey !== 'nightmare') return 0;
    const s = Math.max(0, stationIdx);
    const count = 6 + s;
    const variants = ['runner', 'runner', 'screamer'];
    if (s >= 1) variants.push('brute');
    while (variants.length < count) {
      variants.push(pickDifficultyVariant('nightmare', true));
    }
    const spawned = spawnExtraInfectedCluster(variants, ['crossing_south', 'crossing_north', 'concourse']);
    if (spawned > 0 && LRT.Audio) {
      LRT.Audio.play('zombie_groan_2', { gain: 0.8 });
    }
    return spawned;
  }

  function spawnStationRoamers(stationIdx) {
    if (CORE.gameMode !== MODES.SURVIVAL || CORE.gameState === STATES.MENU) return 0;
    if (campaignState.clearedStations.has(stationIdx)) return 0;
    if (!LRT.Enemies) return 0;
    if (typeof LRT.Enemies.setDifficulty === 'function') {
      LRT.Enemies.setDifficulty(CORE.difficultyKey);
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
    if (!offsetZ) {
      spawnStationRoamers(idx);
    }
  }

  function handleInteractResult(res, item) {
    if (!res || !item) return;

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
    if (idx === 4) return true;
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
    const pState = LRT.PlayerUI ? LRT.PlayerUI.getState() : null;
    const px = pState ? pState.pos.x : 3.0;
    let dir = (dirOverride === -1 || dirOverride === 1) ? dirOverride : 0;
    if (dir === 0) {
      if (CORE.stationIndex > 0) {
        if (!rail.isIsland && px < 0) dir = -1;
        else if (rail.isIsland && Math.abs(px - rail.track2X) < Math.abs(px - rail.track1X)) dir = -1;
        else dir = 1;
      } else {
        dir = 1;
      }
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

    const archetypes = C.ARCHETYPES || [];
    const nextIdx = Math.max(0, CORE.stationIndex + dir);
    const nextArch = archetypes.length ? archetypes[nextIdx % archetypes.length] : null;
    const nextName = (dir === -1 ? '← ' : '') + ((nextArch && nextArch.name) || 'Stasiun Berikutnya');

    CORE.activeTravelDir = dir;
    CORE.gameState = STATES.TRAIN_APPROACHING;
    LRT.Train.startApproach({
      trackX: dir === -1 ? rail.track2X : rail.track1X,
      direction: dir,
      nextStationName: nextName
    });
    if (dir === 1 && CORE.gameMode === MODES.SURVIVAL && CORE.difficultyKey === 'nightmare') {
      triggerTrainCallSiegeWave(CORE.stationIndex);
    }
    if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.85 });
    LRT.PlayerUI.setNotice(
      dir === -1
        ? `KERETA ARAH PULANG MENDEKATI PERON 2 (← ${nextArch ? nextArch.name : 'PREV'})`
        : `KERETA LRT MENDEKATI PERON 1 (→ ${nextArch ? nextArch.name : 'NEXT'})`,
      '#38bdf8'
    );
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
    LRT.Train.departNow();
    CORE.gameState = STATES.TRAIN_DEPARTING;
    CORE.boardingCloseTimer = 0;
    LRT.PlayerUI.setNotice('PINTU DITUTUP — BERANGKAT!', '#4ade80');
    campaignState.voTriggered.add('VO_24_DOOR_CLOSE');
    if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
      LRT.Audio.playVoice('VO_24_DOOR_CLOSE');
    }
  }

  function handleEnemyDrop(dropPos, dropType, dropMeta) {
    if (!dropPos || !LRT.Weapons || !LRT.Weapons.addAmmo) return;
    const meta = dropMeta || {};
    const tierCfg = (C.DIFFICULTY_TIERS && C.DIFFICULTY_TIERS[CORE.difficultyKey]) || {};
    const healMult = typeof meta.healMult === 'number'
      ? meta.healMult
      : (typeof tierCfg.healMult === 'number' ? tierCfg.healMult : 1.0);
    const ammoMult = typeof meta.ammoMult === 'number'
      ? meta.ammoMult
      : (typeof tierCfg.pickupAmmoMult === 'number' ? tierCfg.pickupAmmoMult : 1.0);

    if (dropType === 'lootcrate') {
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
      LRT.PlayerUI.setNotice(`+${healAmt} HEALTH PICKUP`, '#22c55e');
      return;
    }

    const roll = Math.random();
    if (roll < 0.72) {
      const rifleAmt = Math.max(1, Math.round(20 * ammoMult));
      const sgAmt = Math.max(1, Math.round(4 * ammoMult));
      LRT.Weapons.addAmmo('rifle', rifleAmt);
      LRT.Weapons.addAmmo('shotgun', sgAmt);
      LRT.PlayerUI.setNotice('+AMMO RESUPPLY', '#e0b422');
    } else {
      LRT.Weapons.addAmmo('rpg', 1);
      LRT.PlayerUI.setNotice('+1 RPG ROCKET', '#f97316');
    }
  }

  function handlePlayerHit(dmg, srcPos) {
    if (CORE.gameMode === MODES.EXPLORATION || CORE.gameState === STATES.GAME_OVER) return;
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

  function getActiveObjectiveTargetIds() {
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

  function updateTrainCampaign(dt, pState) {
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
          // Spawn next/previous station along corridor dynamically
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
          if (CORE.buildStation) {
            CORE.buildStation(CORE.stationIndex, incomingZ !== undefined ? incomingZ : (215 * CORE.activeTravelDir));
          }
          CORE.rideCompleteReady = true;
          return LRT.Station;
        }
      );

      const trState = LRT.Train.getState();
      if (trState !== CORE.prevTrainState) {
        if (LRT.City && typeof LRT.City.setTrackGatesOpen === 'function') {
          const gatesOpen = (trState === 'APPROACHING' || trState === 'DEPARTING' || trState === 'CRUISE' || trState === 'ARRIVING');
          LRT.City.setTrackGatesOpen(gatesOpen);
        }
        if (trState === 'BOARDED_WAIT') {
          if (CORE.gameState === STATES.TRAIN_APPROACHING || CORE.gameState === STATES.TRAIN_ARRIVING) {
            const wasArrival = CORE.gameState === STATES.TRAIN_ARRIVING;
            CORE.gameState = STATES.TRAIN_BOARDING;
            CORE.boardingCloseTimer = 16.0;
            if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(1, CORE.activeTravelDir);
            LRT.Train.openDoors();
            if (wasArrival) {
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
          CORE.gameState = STATES.TRAIN_DEPARTING;
          if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, CORE.activeTravelDir);
        } else if (trState === 'CRUISE') {
          CORE.gameState = STATES.TRAIN_CRUISE;
        } else if (trState === 'ARRIVING') {
          CORE.gameState = STATES.TRAIN_ARRIVING;
        }
        CORE.prevTrainState = trState;
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

  CORE.CAMPAIGN_MOODS = CAMPAIGN_MOODS;
  CORE.campaignState = campaignState;
  CORE.resetCampaignState = resetCampaignState;
  CORE.saveCurrentStationUsedIds = saveCurrentStationUsedIds;
  CORE.resetGameOverDom = resetGameOverDom;
  CORE.triggerExtractionVictory = triggerExtractionVictory;
  CORE.handleInteractResult = handleInteractResult;
  CORE.isStationPrimaryObjectiveComplete = isStationPrimaryObjectiveComplete;
  CORE.pickPlayerSpawnPos = pickPlayerSpawnPos;
  CORE.spawnCurrentWave = spawnCurrentWave;
  CORE.summonTrain = summonTrain;
  CORE.departTrainNow = departTrainNow;
  CORE.handleEnemyDrop = handleEnemyDrop;
  CORE.handlePlayerHit = handlePlayerHit;
  CORE.buildObjectiveInfo = buildObjectiveInfo;
  CORE.getActiveObjectiveTargetIds = getActiveObjectiveTargetIds;
  CORE.onStationBuilt = onStationBuilt;
  CORE.spawnStationRoamers = spawnStationRoamers;
  CORE.updateTrainCampaign = updateTrainCampaign;
  CORE.updateSurvivalAndVoChecks = updateSurvivalAndVoChecks;
})(window.LRT = window.LRT || {});
