(function (LRT) {
  'use strict';

  const C = LRT.Config;
  const STATES = C.STATES;
  const MODES = C.MODES;

  let renderer = null;
  let scene = null;
  let camera = null;
  let canvas = null;
  let composer = null;
  let renderPass = null;
  let n8aoPass = null;
  let bloomPass = null;
  let outputPass = null;
  let sky = null;

  let hemiLight = null;
  let sunLight = null;
  let cityVisibilityTimer = 0;

  let gameState = STATES.MENU;
  let gameMode = MODES.SURVIVAL;
  let qualityKey = 'high';
  let currentLightingKey = 'DAYLIGHT_CLEAR';
  let lightingLockedByUser = false;
  let campaignSeed = 4207;
  let stationIndex = 0;
  let activeTravelDir = 1;
  let currentWave = 1;
  let wavesPerStation = 1;
  let waveClearTimer = 0;
  let boardingCloseTimer = 0;
  let rideCompleteReady = false;
  let stationsCleared = 0;
  let totalKills = 0;
  let enemySightTimer = 0;
  let victoryCruiseTimer = 0;

  const CAMPAIGN_MOODS = [
    'GOLDEN_DUSK',          // 0: Dukuh Atas BSI
    'TOXIC_SMOG',           // 1: Cawang Interchange
    'BLACKOUT_EMERGENCY',   // 2: Harjamukti
    'MONSOON_OVERCAST',     // 3: Kuningan
    'HAZY_DUSK',            // 4: Cikoko
    'CRIMSON_BLOOD_MOON'    // 5: Setiabudi
  ];

  const campaignState = {
    stationUsedIds: new Map(),
    clearedStations: new Set(),
    visitedStations: new Set([0]),
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
    let existing = campaignState.stationUsedIds.get(stationIndex);
    if (!existing) {
      existing = new Set();
      campaignState.stationUsedIds.set(stationIndex, existing);
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
        if (stats) stats.textContent = `All 6 Stations Cleared | Spore Vaccine Secured | Infected Eliminated: ${totalKills}`;
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

  function handleInteractResult(res, item) {
    if (!res || !item) return;

    if (res.lurePos && LRT.Enemies && typeof LRT.Enemies.alertAllTo === 'function') {
      LRT.Enemies.alertAllTo(res.lurePos, 55.0);
    }

    if (item.id === 'portable_generator' || res.action === 'generator') {
      if (campaignState.stationObjectives[0]) {
        campaignState.stationObjectives[0].genOn = true;
      }
      if (LRT.Station && typeof LRT.Station.setLightingFactor === 'function') {
        LRT.Station.setLightingFactor(1.0);
      }
      applyBrightness();
      if (!campaignState.voTriggered.has('VO_02_GEN_ON')) {
        campaignState.voTriggered.add('VO_02_GEN_ON');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_02_GEN_ON');
        }
      }
    }

    if (item.id === 'cawang_derelict_cab' || res.action === 'derelict_fuse') {
      if (campaignState.stationObjectives[1]) {
        campaignState.stationObjectives[1].fuseFound = true;
      }
      if (!campaignState.voTriggered.has('VO_08_FUSE_FOUND')) {
        campaignState.voTriggered.add('VO_08_FUSE_FOUND');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_08_FUSE_FOUND');
        }
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
    }

    if (item.id === 'depot_supply') {
      if (campaignState.stationObjectives[2]) {
        campaignState.stationObjectives[2].depotDone = true;
      }
    }

    if (item.id === 'city_pln_box' || res.action === 'power_box') {
      if (stationIndex === 3 && campaignState.stationObjectives[3]) {
        campaignState.stationObjectives[3].plnDone = true;
      } else if (stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.pln = true;
        checkSetiabudiRelays();
      }
    }

    if (item.id === 'route_totem') {
      if (stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.totem = true;
        checkSetiabudiRelays();
      }
    }

    if (item.id === 'setiabudi_jpo_switch' || res.action === 'relay') {
      if (stationIndex === 5 && campaignState.stationObjectives[5]) {
        campaignState.stationObjectives[5].relays.jpo = true;
        checkSetiabudiRelays();
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

  let simTime = 0;
  let lastFrameMs = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let currentFps = 60;
  let lastDrawCalls = 0;
  let prevTrainState = 'AWAY';
  let isSoftwareRenderer = false;
  let loopPaused = false;
  let rafId = 0;
  let _bootPromise = null;

  let currentBrightness = 1.0;
  const _brightFogTarget = new THREE.Color(0x526378);
  const baseMood = {
    isDaylight: true,
    hemiIntensity: 0.92,
    sunIntensity: 2.75,
    fogColor: new THREE.Color(0x9eb8cc),
    fogDensity: 0.0042,
    tubeIntensity: 0.22,
    streetLampIntensity: 0.0,
    envIntensity: 1.05,
    exposure: 1.04,
    bloomStrength: 0.22
  };

  const consoleErrors = [];
  const _listenerRight = new THREE.Vector3();
  const _menuLookAt = new THREE.Vector3();
  const _sunDir = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
  const _sunRight = new THREE.Vector3();
  const _sunUp = new THREE.Vector3();
  const _upAxis = new THREE.Vector3(0, 1, 0);
  const _focusVec = new THREE.Vector3();

  function captureErrors() {
    window.addEventListener('error', (e) => {
      consoleErrors.push(String(e.message || e.error || e));
    });
    window.addEventListener('unhandledrejection', (e) => {
      consoleErrors.push(String(e.reason || e));
    });
  }

  function initPostProcessing(width, height) {
    const JSM = window.THREE_JSM || {};
    const N8AOCtor = window.N8AOPostPass || window.N8AOPass;
    if (!JSM.EffectComposer || !JSM.RenderPass || !JSM.OutputPass || !renderer || !scene || !camera) {
      return;
    }

    composer = new JSM.EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);

    renderPass = new JSM.RenderPass(scene, camera);
    composer.addPass(renderPass);

    if (N8AOCtor) {
      n8aoPass = new N8AOCtor(scene, camera, width, height);
      n8aoPass.configuration.gammaCorrection = false;
      n8aoPass.autoDetectTransparency = false;
      n8aoPass.configuration.transparencyAware = false;
      n8aoPass.configuration.aoRadius = 1.8;
      n8aoPass.configuration.distanceFalloff = 0.85;
      n8aoPass.configuration.intensity = 2.0;
      n8aoPass.configuration.aoSamples = 12;
      n8aoPass.configuration.denoiseSamples = 6;
      n8aoPass.configuration.denoiseRadius = 8;
      n8aoPass.configuration.halfRes = false;
      composer.addPass(n8aoPass);
    }

    if (JSM.UnrealBloomPass) {
      bloomPass = new JSM.UnrealBloomPass(
        new THREE.Vector2(width, height),
        baseMood.bloomStrength * 0.82,
        0.32,
        1.08
      );
      composer.addPass(bloomPass);
    }

    outputPass = new JSM.OutputPass();
    composer.addPass(outputPass);
  }

  function renderFrame() {
    if (!renderer || !scene || !camera) return;
    renderer.info.autoReset = false;
    renderer.info.reset();
    if (qualityKey === 'potato' || !composer) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
    lastDrawCalls = renderer.info.render.calls;
    renderer.info.autoReset = true;
  }

  function applyQuality(tierKey) {
    const tier = C.QUALITY_TIERS[tierKey] || C.QUALITY_TIERS.high;
    qualityKey = tierKey in C.QUALITY_TIERS ? tierKey : 'high';
    if (renderer) {
      const dprCap = isSoftwareRenderer ? Math.min(1.0, tier.dprCap) : tier.dprCap;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      // Keep shadowMap.enabled true so switching to/from Potato never triggers USE_SHADOWMAP shader recompiles.
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = qualityKey !== 'potato' && !!tier.shadows;
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(Math.max(2, window.innerWidth), Math.max(2, window.innerHeight));
      }
    }
    if (n8aoPass) {
      if (qualityKey === 'potato') {
        n8aoPass.enabled = false;
      } else if (qualityKey === 'balanced' || isSoftwareRenderer) {
        n8aoPass.enabled = true;
        n8aoPass.configuration.halfRes = true;
        n8aoPass.configuration.aoSamples = isSoftwareRenderer ? 6 : 8;
        n8aoPass.configuration.denoiseSamples = isSoftwareRenderer ? 3 : 4;
      } else {
        n8aoPass.enabled = true;
        n8aoPass.configuration.halfRes = false;
        n8aoPass.configuration.aoSamples = 12;
        n8aoPass.configuration.denoiseSamples = 5;
      }
    }
    if (renderPass) {
      renderPass.enabled = !(n8aoPass && n8aoPass.enabled);
    }
    if (bloomPass) {
      bloomPass.enabled = (qualityKey !== 'potato');
    }
    if (sunLight) {
      sunLight.castShadow = true;
      if (qualityKey === 'potato') {
        sunLight.shadow.intensity = 0;
      } else {
        sunLight.shadow.intensity = 1.0;
      }
      const targetSize = tier.shadows ? tier.shadowSize : Math.min(512, tier.shadowSize);
      if (sunLight.shadow.mapSize.width !== targetSize) {
        sunLight.shadow.mapSize.set(targetSize, targetSize);
        if (sunLight.shadow.map) {
          sunLight.shadow.map.setSize(targetSize, targetSize);
        }
      }
    }

    const aniso = tier.maxAniso || (qualityKey === 'potato' ? 1 : (qualityKey === 'balanced' ? 2 : 8));
    if (LRT.AssetLoader && typeof LRT.AssetLoader.setAnisotropy === 'function') {
      LRT.AssetLoader.setAnisotropy(aniso);
    }
    const updateMatTexAniso = (mat) => {
      if (!mat) return;
      const maps = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.emissiveMap, mat.aoMap, mat.bumpMap];
      for (let i = 0; i < maps.length; i++) {
        const tex = maps[i];
        if (tex && tex.isTexture && tex.anisotropy !== aniso) {
          tex.anisotropy = aniso;
        }
      }
    };
    if (LRT.Materials && LRT.Materials.mats) {
      for (const k in LRT.Materials.mats) {
        updateMatTexAniso(LRT.Materials.mats[k]);
      }
    }
    if (scene) {
      scene.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          if (Array.isArray(obj.material)) {
            for (let i = 0; i < obj.material.length; i++) updateMatTexAniso(obj.material[i]);
          } else {
            updateMatTexAniso(obj.material);
          }
        }
      });
    }

    if (LRT.City && typeof LRT.City.updateVisibility === 'function' && camera) {
      LRT.City.updateVisibility(camera.position, qualityKey);
    }

    if (LRT.PlayerUI) LRT.PlayerUI.syncQualityUi(qualityKey);
  }

  function syncMenuLights() {
    const isMenu = gameState === STATES.MENU;
    const b = currentBrightness;
    const bScale = (b <= 1.0
      ? (0.28 + 0.72 * b)
      : (1.0 + Math.max(0, b - 1.0) * 0.35)) * (isMenu ? 1.45 : 1.0);
    if (LRT.Station && typeof LRT.Station.setLightingFactor === 'function') {
      LRT.Station.setLightingFactor(bScale);
    }
  }

  function applyStreetLightsIntensity(val) {
    const applyOnList = (list, factor) => {
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        const l = entry && entry.light ? entry.light : entry;
        if (l && l.isLight) {
          l.visible = true;
          const mult = (entry && typeof entry.baseIntensity === 'number') ? entry.baseIntensity : 1.0;
          l.intensity = factor * mult;
        }
      }
    };

    const streetFactor = Math.max(0, val / 2.2);
    if (LRT.Station) {
      const isMenu = gameState === STATES.MENU;
      const tubeInt = (baseMood && baseMood.tubeIntensity !== undefined) ? baseMood.tubeIntensity : 0.72;
      const bScale = (currentBrightness <= 1.0
        ? (0.28 + 0.72 * currentBrightness)
        : (1.0 + Math.max(0, currentBrightness - 1.0) * 0.35)) * (isMenu ? 1.45 : 1.0);
      if (typeof LRT.Station.setLightingFactor === 'function') {
        LRT.Station.setLightingFactor(bScale);
      } else if (Array.isArray(LRT.Station.stationLights)) {
        applyOnList(LRT.Station.stationLights, tubeInt * bScale);
      } else if (typeof LRT.Station.setStreetLightIntensity === 'function') {
        LRT.Station.setStreetLightIntensity(val);
      } else if (typeof LRT.Station.setLightingIntensity === 'function') {
        LRT.Station.setLightingIntensity(val);
      } else {
        const list = typeof LRT.Station.getStreetLights === 'function' ? LRT.Station.getStreetLights() : LRT.Station.streetLights;
        applyOnList(list, val);
      }
    }

    if (LRT.City) {
      if (typeof LRT.City.setLightingFactor === 'function') {
        LRT.City.setLightingFactor(streetFactor);
      } else if (typeof LRT.City.setStreetLightIntensity === 'function') {
        LRT.City.setStreetLightIntensity(val);
      } else if (typeof LRT.City.setLightingIntensity === 'function') {
        LRT.City.setLightingIntensity(val);
      } else {
        const list = typeof LRT.City.getStreetLights === 'function' ? LRT.City.getStreetLights() : LRT.City.streetLights;
        applyOnList(list, val);
      }
    }
  }

  function updateSunTracking(focusX, focusZ) {
    if (!sunLight) return;
    const mapSize = sunLight.shadow.mapSize.width || 1024;
    const texelWorld = 110.0 / mapSize;

    _sunRight.crossVectors(_upAxis, _sunDir);
    if (_sunRight.lengthSq() < 1e-5) _sunRight.set(1, 0, 0);
    else _sunRight.normalize();
    _sunUp.crossVectors(_sunDir, _sunRight).normalize();

    _focusVec.set(focusX || 0, 0, focusZ || 0);
    const uProj = Math.round(_focusVec.dot(_sunRight) / texelWorld) * texelWorld;
    const vProj = Math.round(_focusVec.dot(_sunUp) / texelWorld) * texelWorld;
    const wProj = _focusVec.dot(_sunDir);

    sunLight.target.position.set(0, 0, 0)
      .addScaledVector(_sunRight, uProj)
      .addScaledVector(_sunUp, vProj)
      .addScaledVector(_sunDir, wProj);
    sunLight.position.copy(sunLight.target.position).addScaledVector(_sunDir, 62);
    sunLight.target.updateMatrixWorld();
  }

  function applyBrightness() {
    const b = currentBrightness;
    const isMenu = gameState === STATES.MENU;
    const over = Math.max(0, b - 1.0);
    const lightScale = b <= 1.0 ? Math.pow(b, 1.35) : 1.0;

    syncMenuLights();

    if (hemiLight) {
      const baseHemi = baseMood.hemiIntensity * lightScale + over * 0.65;
      hemiLight.intensity = baseHemi + (isMenu && !baseMood.isDaylight ? 0.14 : 0);
    }
    if (sunLight) {
      const baseSun = baseMood.sunIntensity * lightScale + over * 0.95;
      sunLight.intensity = baseSun + (isMenu && !baseMood.isDaylight ? 0.22 : 0);
    }
    if (renderer) {
      const baseExp = baseMood.exposure || 1.05;
      const exp = b <= 1.0
        ? Math.max(0.32, baseExp * (0.28 + b * 0.72))
        : Math.min(1.65, baseExp + over * 0.55);
      renderer.toneMappingExposure = exp;
    }
    if (scene) {
      if ('environmentIntensity' in scene) {
        const envVal = b <= 1.0
          ? Math.max(0.03, baseMood.envIntensity * (0.22 + 0.78 * b))
          : Math.min(1.85, baseMood.envIntensity + over * 0.85);
        scene.environmentIntensity = envVal + (isMenu && !baseMood.isDaylight ? 0.14 : 0);
      }
      if (scene.fog) {
        const fogLift = (!baseMood.isDaylight && over > 0) ? Math.min(0.65, (over / 0.8) * 0.65) : 0;
        scene.fog.color.copy(baseMood.fogColor).lerp(_brightFogTarget, fogLift);
        if (scene.background && scene.background.isColor) {
          scene.background.copy(scene.fog.color);
        }
        if (LRT.Materials) {
          LRT.Materials.uGlobals.uFogHazeColor.value.copy(scene.fog.color);
          LRT.Materials.uGlobals.uFogHazeDensity.value = baseMood.isDaylight ? 0.16 : 0.42;
        }
        if (scene.fog.isFogExp2) {
          const fogFactor = b <= 1.0
            ? 1.0 + (1.0 - b) * 0.10
            : Math.max(0.55, 1.0 - over * 0.50);
          scene.fog.density = baseMood.fogDensity * fogFactor;
        }
      }
    }
    if (bloomPass) {
      bloomPass.strength = baseMood.bloomStrength * (b <= 1.0 ? 0.85 + 0.15 * b : 1.0 + over * 0.25);
    }
    applyStreetLightsIntensity(baseMood.streetLampIntensity * (b <= 1.0 ? (0.30 + 0.70 * b) : 1.0));
    if (LRT.Materials && LRT.Materials.mats) {
      const m = LRT.Materials.mats;
      const tubeFactor = b <= 1.0 ? (0.30 + 0.70 * b) : (1.0 + over * 0.55);
      if (m.flickerTube) {
        m.flickerTube.emissiveIntensity = 1.65 * baseMood.tubeIntensity * tubeFactor;
      }
      if (m.tubeHalo) {
        m.tubeHalo.opacity = Math.min(0.28, 0.12 * baseMood.tubeIntensity * tubeFactor);
      }
      if (m.skylineBuilding) {
        m.skylineBuilding.emissiveIntensity = baseMood.isDaylight ? 0.08 : (0.14 + 0.18 * Math.min(1.2, b));
      }
    }
    if (LRT.Train && typeof LRT.Train.syncLights === 'function') {
      LRT.Train.syncLights();
    }
  }

  function setBrightness(val) {
    const num = Number(val);
    const clamped = Number.isFinite(num) ? Math.max(0.40, Math.min(1.80, num)) : 1.0;
    currentBrightness = Math.round(clamped * 100) / 100;
    applyBrightness();
    if (LRT.PlayerUI && typeof LRT.PlayerUI.syncBrightnessUi === 'function') {
      LRT.PlayerUI.syncBrightnessUi(currentBrightness);
    }
    return currentBrightness;
  }

  function getBrightness() {
    return currentBrightness;
  }

  function applyMoodLighting(stats, atmos) {
    const requestedKey = (atmos && atmos.moodKey) || currentLightingKey || (stats && (stats.moodKey || stats.atmosphere)) || 'DAYLIGHT_CLEAR';
    const moodKey = (requestedKey in C.MOODS) ? requestedKey : 'DAYLIGHT_CLEAR';
    const m = C.MOODS[moodKey] || C.MOODS.DAYLIGHT_CLEAR;
    currentLightingKey = moodKey;

    baseMood.isDaylight = !!m.isDaylight;
    baseMood.hemiIntensity = m.hemiIntensity;
    baseMood.sunIntensity = m.sunIntensity;
    baseMood.fogColor.setHex(m.fogColor);
    baseMood.fogDensity = m.fogDensity;
    baseMood.tubeIntensity = m.tubeIntensity !== undefined ? m.tubeIntensity : 0.72;
    baseMood.streetLampIntensity = m.streetLampIntensity !== undefined ? m.streetLampIntensity : (m.isDaylight ? 0.0 : 2.0);
    baseMood.envIntensity = m.envIntensity !== undefined ? m.envIntensity : (m.isDaylight ? 1.0 : 0.62);
    baseMood.exposure = m.exposure !== undefined ? m.exposure : 1.05;
    baseMood.bloomStrength = m.bloomStrength !== undefined ? m.bloomStrength : (m.isDaylight ? 0.24 : 0.42);

    if (scene) {
      if (scene.background && scene.background.isColor) scene.background.setHex(m.fogColor);
      else scene.background = new THREE.Color(m.fogColor);
      if (scene.fog && scene.fog.isFogExp2) {
        scene.fog.color.setHex(m.fogColor);
        scene.fog.density = m.fogDensity;
      } else {
        scene.fog = new THREE.FogExp2(m.fogColor, m.fogDensity);
      }
    }

    const elev = typeof m.sunElevation === 'number' ? m.sunElevation : (m.isDaylight ? 45 : 24);
    const azim = typeof m.sunAzimuth === 'number' ? m.sunAzimuth : 150;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    _sunDir.setFromSphericalCoords(1, phi, theta).normalize();

    if (sky) {
      sky.visible = !!m.isDaylight;
      const su = sky.material && sky.material.uniforms;
      if (su && m.isDaylight) {
        if (su.turbidity) su.turbidity.value = m.skyTurbidity !== undefined ? m.skyTurbidity : 4.0;
        if (su.rayleigh) su.rayleigh.value = m.skyRayleigh !== undefined ? m.skyRayleigh : 1.5;
        if (su.mieCoefficient) su.mieCoefficient.value = m.skyMie !== undefined ? m.skyMie : 0.005;
        if (su.mieDirectionalG) su.mieDirectionalG.value = m.skyMieG !== undefined ? m.skyMieG : 0.8;
        if (su.sunPosition) su.sunPosition.value.copy(_sunDir).multiplyScalar(400);
      }
    }

    if (hemiLight) {
      hemiLight.color.setHex(m.hemiSky);
      hemiLight.groundColor.setHex(m.hemiGround);
    }
    if (sunLight) {
      sunLight.color.setHex(m.sunColor);
    }
    if (LRT.Materials) {
      LRT.Materials.uGlobals.uFogHazeColor.value.setHex(m.fogColor);
      LRT.Materials.uGlobals.uWetness.value = m.wetness;
      if (typeof LRT.Materials.setEnvironmentTexture === 'function') {
        LRT.Materials.setEnvironmentTexture(m.hdri || (m.isDaylight ? 'day_clear' : 'night_station'), scene, renderer);
      }
    }

    if (camera) {
      let farDist = 300;
      if (moodKey === 'DAYLIGHT_CLEAR' || (m.isDaylight && m.fogDensity < 0.006)) {
        farDist = 400;
      } else if (!m.isDaylight && m.fogDensity >= 0.014) {
        farDist = 220;
      } else if (!m.isDaylight) {
        farDist = 260;
      } else {
        farDist = 300;
      }
      camera.far = farDist;
      camera.updateProjectionMatrix();
    }

    if (LRT.PlayerUI && typeof LRT.PlayerUI.syncLightingUi === 'function') {
      LRT.PlayerUI.syncLightingUi(moodKey, m);
    }

    applyBrightness();
  }

  function setLightingMode(key) {
    const validKey = (key && key in C.MOODS) ? key : 'DAYLIGHT_CLEAR';
    lightingLockedByUser = true;
    currentLightingKey = validKey;
    applyMoodLighting(null, { moodKey: validKey });
    return validKey;
  }

  function cycleLightingMode() {
    lightingLockedByUser = true;
    const cycle = (C.LIGHTING_CYCLE && C.LIGHTING_CYCLE.length)
      ? C.LIGHTING_CYCLE
      : ['DAYLIGHT_CLEAR', 'DAYLIGHT_OVERCAST', 'GOLDEN_DUSK', 'BLACKOUT_EMERGENCY', 'CRIMSON_BLOOD_MOON'];
    const idx = cycle.indexOf(currentLightingKey);
    const nextKey = cycle[(idx + 1) % cycle.length];
    setLightingMode(nextKey);
    const m = C.MOODS[nextKey];
    if (gameState !== STATES.MENU && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
      LRT.PlayerUI.setNotice(`LIGHTING: ${m ? m.name.toUpperCase() : nextKey}`, m && m.isDaylight ? '#38bdf8' : '#e0b422');
    }
    return nextKey;
  }

  function getLightingMode() {
    return currentLightingKey;
  }

  function getStationSeed(idx) {
    return (campaignSeed + idx * 7919) >>> 0;
  }

  function buildStation(idx, offsetZ) {
    const seed = getStationSeed(idx);
    if (LRT.Station && LRT.Station.build) {
      if (gameState !== STATES.MENU && gameMode === MODES.SURVIVAL && !lightingLockedByUser) {
        currentLightingKey = CAMPAIGN_MOODS[idx % 6] || 'GOLDEN_DUSK';
      }
      const savedUsed = campaignState.stationUsedIds ? campaignState.stationUsedIds.get(idx) : null;
      const usedIds = savedUsed ? new Set(savedUsed) : new Set();
      const powerRestored = (idx > 0) || !!(campaignState.stationObjectives && campaignState.stationObjectives[0] && campaignState.stationObjectives[0].genOn);
      LRT.Station.build(idx, seed, gameMode, scene, offsetZ || 0, { usedIds, powerRestored });
      const st = LRT.Station.getStats ? LRT.Station.getStats() : null;
      applyMoodLighting(st, { moodKey: currentLightingKey });
      if (LRT.City && typeof LRT.City.updateVisibility === 'function' && camera) {
        LRT.City.updateVisibility(camera.position, qualityKey);
      }
      return st;
    }
    return null;
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
    if (gameMode !== MODES.SURVIVAL) return;
    if (!LRT.Enemies || !LRT.Enemies.spawnWave) return;
    const nodes = LRT.Station && LRT.Station.getSpawnNodes ? LRT.Station.getSpawnNodes() : [];
    LRT.Enemies.spawnWave(currentWave, stationIndex, nodes);
    if (LRT.Audio) LRT.Audio.play('zombie_groan_1', { gain: 0.7 });
    LRT.PlayerUI.setNotice(`WAVE ${currentWave}`, '#ef4444');
  }

  function startGame(mode) {
    gameMode = mode === MODES.EXPLORATION ? MODES.EXPLORATION : MODES.SURVIVAL;
    lightingLockedByUser = false;
    if (LRT.Audio) LRT.Audio.unlock();

    resetGameOverDom();
    resetCampaignState();

    if (LRT.Station && LRT.Station.dispose) LRT.Station.dispose(scene);
    if (LRT.Enemies && LRT.Enemies.reset) LRT.Enemies.reset();
    if (LRT.Weapons && LRT.Weapons.reset) LRT.Weapons.reset();
    if (LRT.Weapons && LRT.Weapons.setVisible) LRT.Weapons.setVisible(true);
    if (LRT.Train && LRT.Train.reset) LRT.Train.reset(gameMode);

    stationIndex = 0;
    activeTravelDir = 1;
    currentWave = 1;
    wavesPerStation = 1;
    waveClearTimer = 0;
    boardingCloseTimer = 0;
    rideCompleteReady = false;
    stationsCleared = 0;
    totalKills = 0;
    prevTrainState = 'AWAY';
    enemySightTimer = 0;
    victoryCruiseTimer = 0;

    gameState = STATES.STATION_ACTIVE;
    if (gameMode === MODES.EXPLORATION) {
      currentLightingKey = 'DAYLIGHT_CLEAR';
    }
    syncMenuLights();
    const stats = buildStation(stationIndex, 0);
    const spawnPos = (stats && stats.spawnPos) || pickPlayerSpawnPos();
    LRT.PlayerUI.reset(spawnPos, gameMode === MODES.EXPLORATION, gameMode);
    LRT.PlayerUI.setPaused(false, true);
    LRT.PlayerUI.showScreen('play');
    LRT.PlayerUI.requestLock();

    if (gameMode === MODES.SURVIVAL) {
      spawnCurrentWave();
      if (!campaignState.voTriggered.has('VO_01_INTRO')) {
        campaignState.voTriggered.add('VO_01_INTRO');
        if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
          LRT.Audio.playVoice('VO_01_INTRO');
        }
      }
    } else {
      LRT.PlayerUI.setNotice('EXPLORATION MODE — TEKAN [T] UNTUK PANGGIL LRT', '#e0b422');
      if (LRT.Weapons && LRT.Weapons.addAmmo) {
        LRT.Weapons.addAmmo('all', 999);
      }
    }
  }

  function summonTrain(dirOverride, isDirectDebugCall) {
    if (gameState !== STATES.STATION_ACTIVE) return;
    if (!LRT.Train || !LRT.Train.startApproach) return;
    const rail = (LRT.Station && typeof LRT.Station.getRailConfig === 'function')
      ? LRT.Station.getRailConfig()
      : { isIsland: false, track1X: 0.0, track2X: -4.70, platEdge1X: 1.46, platEdge2X: -6.16 };
    const pState = LRT.PlayerUI ? LRT.PlayerUI.getState() : null;
    const px = pState ? pState.pos.x : 3.0;
    let dir = (dirOverride === -1 || dirOverride === 1) ? dirOverride : 0;
    if (dir === 0) {
      if (stationIndex > 0) {
        if (!rail.isIsland && px < 0) dir = -1;
        else if (rail.isIsland && Math.abs(px - rail.track2X) < Math.abs(px - rail.track1X)) dir = -1;
        else dir = 1;
      } else {
        dir = 1;
      }
    }
    if (dir === -1 && stationIndex <= 0) {
      if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.55 });
      LRT.PlayerUI.setNotice('TERMINAL AWAL (DUKUH ATAS) — GUNAKAN PERON 1', '#e0b422');
      return;
    }

    if (gameMode === MODES.SURVIVAL && !isDirectDebugCall) {
      if (dir === 1) {
        if (!isStationPrimaryObjectiveComplete(stationIndex)) {
          let hint = 'Selesaikan objektif utama stasiun terlebih dahulu!';
          const s = stationIndex % 6;
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
    const nextIdx = Math.max(0, stationIndex + dir);
    const nextArch = archetypes.length ? archetypes[nextIdx % archetypes.length] : null;
    const nextName = (dir === -1 ? '← ' : '') + ((nextArch && nextArch.name) || 'Stasiun Berikutnya');

    activeTravelDir = dir;
    gameState = STATES.TRAIN_APPROACHING;
    LRT.Train.startApproach({
      trackX: dir === -1 ? rail.track2X : rail.track1X,
      direction: dir,
      nextStationName: nextName
    });
    if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.85 });
    LRT.PlayerUI.setNotice(
      dir === -1
        ? `KERETA ARAH PULANG MENDEKATI PERON 2 (← ${nextArch ? nextArch.name : 'PREV'})`
        : `KERETA LRT MENDEKATI PERON 1 (→ ${nextArch ? nextArch.name : 'NEXT'})`,
      '#38bdf8'
    );
  }

  function departTrainNow() {
    if (gameState !== STATES.TRAIN_BOARDING) return;
    if (!LRT.Train) return;
    const pState = LRT.PlayerUI.getState();
    if (!LRT.Train.isPlayerInside(pState.pos)) {
      LRT.PlayerUI.setNotice('MASUK KE DALAM KERETA TERLEBIH DAHULU', '#e0b422');
      return;
    }
    if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, activeTravelDir);
    LRT.Train.closeDoors();
    LRT.Train.departNow();
    gameState = STATES.TRAIN_DEPARTING;
    boardingCloseTimer = 0;
    LRT.PlayerUI.setNotice('PINTU DITUTUP — BERANGKAT!', '#4ade80');
    campaignState.voTriggered.add('VO_24_DOOR_CLOSE');
    if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
      LRT.Audio.playVoice('VO_24_DOOR_CLOSE');
    }
  }

  function handleEnemyDrop(dropPos, dropType) {
    if (!dropPos || !LRT.Weapons || !LRT.Weapons.addAmmo) return;
    if (dropType === 'health') {
      LRT.PlayerUI.heal(18);
      LRT.PlayerUI.setNotice('+18 HEALTH PICKUP', '#22c55e');
      return;
    }
    const roll = Math.random();
    if (roll < 0.72) {
      LRT.Weapons.addAmmo('rifle', 20);
      LRT.Weapons.addAmmo('shotgun', 4);
      LRT.PlayerUI.setNotice('+AMMO RESUPPLY', '#e0b422');
    } else {
      LRT.Weapons.addAmmo('rpg', 1);
      LRT.PlayerUI.setNotice('+1 RPG ROCKET', '#f97316');
    }
  }

  function handlePlayerHit(dmg, srcPos) {
    if (gameMode === MODES.EXPLORATION || gameState === STATES.GAME_OVER) return;
    const died = LRT.PlayerUI.takeDamage(dmg, srcPos);
    if (died) {
      gameState = STATES.GAME_OVER;
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
        dom['gameover-stats'].textContent = `Stations Cleared: ${stationsCleared} | Infected Eliminated: ${totalKills}`;
      }
      LRT.PlayerUI.showScreen('gameover');
    }
  }

  function buildObjectiveInfo(stationStats, atmos) {
    const name = (stationStats && (stationStats.name || stationStats.stationName)) || 'Dukuh Atas BSI';
    const code = (stationStats && (stationStats.code || stationStats.stationCode)) || 'CB01 / BK01';
    const activeMood = C.MOODS && C.MOODS[currentLightingKey];
    const sub = (activeMood && activeMood.name) || (atmos && atmos.mood && atmos.mood.name) || (stationStats && stationStats.mood && stationStats.mood.name) || 'Jakarta LRT';

    if (gameMode === MODES.EXPLORATION) {
      if (gameState === STATES.STATION_ACTIVE) {
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'EXPLORATION FREE-ROAM',
          objectiveDetail: 'Press [T] or Platform Console to Summon LRT'
        };
      }
      if (gameState === STATES.TRAIN_APPROACHING) {
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'LRT APPROACHING',
          objectiveDetail: 'Stand behind yellow tactile line'
        };
      }
      if (gameState === STATES.TRAIN_BOARDING) {
        const p = LRT.PlayerUI.getState();
        const inside = LRT.Train && LRT.Train.isPlayerInside(p.pos);
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: inside ? 'BOARDED — READY TO DEPART' : 'BOARD LRT TRAIN',
          objectiveDetail: inside
            ? 'Press [E] / [T] inside cab to Depart'
            : `Enter open train doors along Peron ${activeTravelDir === -1 ? 2 : 1}`
        };
      }
      return {
        mode: gameMode,
        stationName: name,
        stationCode: code,
        stationSub: 'INKA iE203 In Transit',
        objectiveTitle: 'LRT TRANSIT CORRIDOR',
        objectiveDetail: `Approaching ${activeTravelDir === -1 ? 'previous' : 'next'} stop (#${Math.max(1, stationIndex + activeTravelDir + 1)})`
      };
    }

    // SURVIVAL MODE
    const alive = LRT.Enemies && LRT.Enemies.getAliveCount ? LRT.Enemies.getAliveCount() : 0;
    const sIdx = stationIndex % 6;

    if (gameState === STATES.TRAIN_APPROACHING) {
      return {
        mode: gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'LRT APPROACHING',
        objectiveDetail: `Stand behind yellow line on Peron ${activeTravelDir === -1 ? 2 : 1}`
      };
    }

    if (gameState === STATES.TRAIN_BOARDING) {
      const p = LRT.PlayerUI.getState();
      const inside = LRT.Train && LRT.Train.isPlayerInside(p.pos);
      return {
        mode: gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: inside ? 'BOARDED — READY TO DEPART' : 'BOARD LRT TRAIN',
        objectiveDetail: inside
          ? `Press [E] / [T] in front cab to Depart (Auto-seal: ${Math.max(0, boardingCloseTimer).toFixed(1)}s)`
          : `Enter open doors on Peron ${activeTravelDir === -1 ? 2 : 1}`
      };
    }

    if (gameState === STATES.TRAIN_CRUISE || gameState === STATES.TRAIN_DEPARTING || gameState === STATES.TRAIN_ARRIVING) {
      return {
        mode: gameMode,
        stationName: name,
        stationCode: code,
        stationSub: 'INKA iE203 In Transit',
        objectiveTitle: 'LRT TRANSIT CORRIDOR',
        objectiveDetail: `Approaching ${activeTravelDir === -1 ? 'previous' : 'next'} stop (#${Math.max(1, stationIndex + activeTravelDir + 1)})`
      };
    }

    // Station Active
    if (sIdx === 0) {
      if (!campaignState.stationObjectives[0].genOn) {
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RESTORE AUXILIARY POWER',
          objectiveDetail: 'Locate portable generator in Concourse [E]'
        };
      }
      if (alive > 0) {
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'REPEL CONCOURSE INCURSION',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: gameMode,
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
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RECOVER SIGNAL FUSE',
          objectiveDetail: 'Search derelict cab on Track 4 [E]'
        };
      }
      if (alive > 0) {
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'CLEAR TRACK INTERCHANGE',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: gameMode,
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
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RECOVER VACCINE & HEAVY ARMS',
          objectiveDetail: (!o2.vaxFound ? 'South Garden Terrace [Vax]' : '') + (!o2.vaxFound && !o2.depotDone ? ' & ' : '') + (!o2.depotDone ? 'North Depot Shed [RPG-7]' : '')
        };
      }
      if (alive > 0) {
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'DEFEND HARJAMUKTI DEPOT',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: gameMode,
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
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'RESTORE STREET POWER RELAY',
          objectiveDetail: 'Activate city_pln_box at street level [E]'
        };
      }
      if (alive > 0) {
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'SURVIVE MONSOON AMBUSH',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: gameMode,
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
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'CLEAR TOLL OVERPASS & KRL STAIRS',
          objectiveDetail: `Infected Remaining: ${alive}`
        };
      }
      return {
        mode: gameMode,
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
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: `ACTIVATE 3 SIGNAL RELAYS (${count}/3)`,
          objectiveDetail: `Remaining: ${missing.join(', ')} [E]`
        };
      }
      if (alive > 0) {
        return {
          mode: gameMode,
          stationName: name,
          stationCode: code,
          stationSub: sub,
          objectiveTitle: 'SURVIVE OMEGA SIEGE',
          objectiveDetail: `Swarm Remaining: ${alive} | Defend until blast doors open`
        };
      }
      return {
        mode: gameMode,
        stationName: name,
        stationCode: code,
        stationSub: sub,
        objectiveTitle: 'EXTRACTION GATES OPEN',
        objectiveDetail: 'Summon LRT on Peron 1 [T/E] -> Board & Depart to Escape!'
      };
    }

    return {
      mode: gameMode,
      stationName: name,
      stationCode: code,
      stationSub: sub,
      objectiveTitle: `STATION ${stationIndex + 1}`,
      objectiveDetail: alive > 0 ? `Infected Remaining: ${alive}` : 'Summon LRT [T/E]'
    };
  }

  function stepSimulation(dt) {
    simTime += dt;
    if (LRT.Audio && typeof LRT.Audio.tickVoice === 'function') {
      LRT.Audio.tickVoice(dt);
    }
    if (LRT.Materials) {
      LRT.Materials.update(simTime);
    }
    if (LRT.Station && LRT.Station.update) {
      LRT.Station.update(dt);
    }

    cityVisibilityTimer -= dt;
    if (cityVisibilityTimer <= 0) {
      cityVisibilityTimer = 0.25;
      if (LRT.City && typeof LRT.City.updateVisibility === 'function' && camera) {
        LRT.City.updateVisibility(camera.position, qualityKey);
      }
    }

    const pState = LRT.PlayerUI.getState();
    const stStats = LRT.Station && LRT.Station.getStats ? LRT.Station.getStats() : null;
    const stAtmos = LRT.Station && LRT.Station.getAtmosphere ? LRT.Station.getAtmosphere() : null;

    // Victory check 1.5s into cruise from Station 5 heading forward
    if (gameState === STATES.TRAIN_CRUISE && stationIndex === 5 && activeTravelDir === 1 && !campaignState.campaignVictory) {
      victoryCruiseTimer += dt;
      if (victoryCruiseTimer >= 1.5) {
        triggerExtractionVictory();
        return;
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
          if (LRT.Station && LRT.Station.dispose) LRT.Station.dispose(scene);
        },
        (incomingZ) => {
          // Spawn next/previous station along corridor dynamically
          saveCurrentStationUsedIds();
          const nextIdx = Math.max(0, stationIndex + activeTravelDir);
          const isBacktrack = activeTravelDir === -1;
          const isNewStop = !campaignState.visitedStations.has(nextIdx);
          stationIndex = nextIdx;
          campaignState.visitedStations.add(stationIndex);

          if (isNewStop && !isBacktrack) {
            stationsCleared += 1;
            currentWave += 1;
          }
          wavesPerStation = 1;
          buildStation(stationIndex, incomingZ !== undefined ? incomingZ : (215 * activeTravelDir));
          rideCompleteReady = true;
          return LRT.Station;
        }
      );

      const trState = LRT.Train.getState();
      if (trState !== prevTrainState) {
        if (LRT.City && typeof LRT.City.setTrackGatesOpen === 'function') {
          const gatesOpen = (trState === 'APPROACHING' || trState === 'DEPARTING' || trState === 'CRUISE' || trState === 'ARRIVING');
          LRT.City.setTrackGatesOpen(gatesOpen);
        }
        if (trState === 'BOARDED_WAIT') {
          if (gameState === STATES.TRAIN_APPROACHING || gameState === STATES.TRAIN_ARRIVING) {
            const wasArrival = gameState === STATES.TRAIN_ARRIVING;
            gameState = STATES.TRAIN_BOARDING;
            boardingCloseTimer = 16.0;
            if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(1, activeTravelDir);
            LRT.Train.openDoors();
            if (wasArrival) {
              const isNewStop = !campaignState.visitedStations.has(stationIndex);
              campaignState.visitedStations.add(stationIndex);
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
              const aVo = arrivalVoMap[stationIndex];
              if (aVo && !campaignState.voTriggered.has(aVo)) {
                campaignState.voTriggered.add(aVo);
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice(aVo);
                }
              }
              if (gameMode === MODES.SURVIVAL) {
                rideCompleteReady = true;
              }
            } else {
              LRT.PlayerUI.setNotice(`PINTU PERON ${activeTravelDir === -1 ? 2 : 1} TERBUKA — NAIK KE KERETA`, '#4ade80');
              if (!campaignState.voTriggered.has('VO_05_TRAIN_DOCK')) {
                campaignState.voTriggered.add('VO_05_TRAIN_DOCK');
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice('VO_05_TRAIN_DOCK');
                }
              }
            }
          }
        } else if (trState === 'DEPARTING') {
          gameState = STATES.TRAIN_DEPARTING;
          if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, activeTravelDir);
        } else if (trState === 'CRUISE') {
          gameState = STATES.TRAIN_CRUISE;
        } else if (trState === 'ARRIVING') {
          gameState = STATES.TRAIN_ARRIVING;
        }
        prevTrainState = trState;
      }

      // Sync PSD smooth slide & disembark flow across both Peron 1 and Peron 2
      if (gameState === STATES.TRAIN_BOARDING) {
        if (gameMode === MODES.SURVIVAL && !campaignState.voTriggered.has('VO_06_BOARD_WARN')) {
          const aliveNow = LRT.Enemies && LRT.Enemies.getAliveCount ? LRT.Enemies.getAliveCount() : 0;
          if (aliveNow > 0) {
            campaignState.voTriggered.add('VO_06_BOARD_WARN');
            if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
              LRT.Audio.playVoice('VO_06_BOARD_WARN');
            }
          }
        }

        const railCfg = (LRT.Station && typeof LRT.Station.getRailConfig === 'function') ? LRT.Station.getRailConfig() : null;
        const onPlat = railCfg
          ? (activeTravelDir === -1 ? pState.pos.x < railCfg.platEdge2X - 0.20 : pState.pos.x > railCfg.platEdge1X + 0.20)
          : (activeTravelDir === -1 ? pState.pos.x < -6.36 : pState.pos.x > 1.72);
        if (rideCompleteReady && !LRT.Train.isPlayerInside(pState.pos) && onPlat) {
          // Player stepped safely onto the newly arrived station platform
          rideCompleteReady = false;
          if (LRT.Station && LRT.Station.setPsdOpen) LRT.Station.setPsdOpen(0, activeTravelDir);
          LRT.Train.closeDoors();
          LRT.Train.reset(gameMode);
          prevTrainState = 'AWAY';
          gameState = STATES.STATION_ACTIVE;
          if (gameMode === MODES.SURVIVAL) {
            if (campaignState.clearedStations.has(stationIndex)) {
              LRT.PlayerUI.setNotice('STASIUN SUDAH DIBERSIHKAN — LOGISTIK TERSEDIA', '#4ade80');
            } else {
              spawnCurrentWave();
            }
          } else {
            LRT.PlayerUI.setNotice('JELAJAHI STASIUN — TEKAN [T] UNTUK PANGGIL LRT', '#e0b422');
          }
        } else if (gameMode === MODES.SURVIVAL && !rideCompleteReady && LRT.Train.isPlayerInside(pState.pos)) {
          boardingCloseTimer = boardingCloseTimer > 0 ? boardingCloseTimer - dt : 16.0;
          if (boardingCloseTimer <= 0) {
            boardingCloseTimer = 0;
            departTrainNow();
          }
        }
      }
    }

    const stationGrid = LRT.Station && LRT.Station.getSpatialGrid ? LRT.Station.getSpatialGrid() : null;
    const stationCols = LRT.Station && LRT.Station.getColliders ? LRT.Station.getColliders() : [];
    const trainCols = LRT.Train && LRT.Train.getColliders ? LRT.Train.getColliders() : [];
    const bvhMeshes = [];
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

    updateSunTracking(pState.pos.x, pState.pos.z);
    if (sky) sky.position.copy(camera.position);

    const trainSpeed = LRT.Train && LRT.Train.getSpeed ? LRT.Train.getSpeed() : 0;
    if (LRT.Weapons && LRT.Weapons.update) {
      LRT.Weapons.update(dt, pState, trainSpeed);
    }

    // Survival wave logic (plus animate/update any manually spawned zombies in exploration mode)
    const hasCustomZombies = LRT.Enemies && typeof LRT.Enemies.getAliveCount === 'function' && LRT.Enemies.getAliveCount() > 0;
    if ((gameMode === MODES.SURVIVAL || hasCustomZombies) && (gameState === STATES.STATION_ACTIVE || gameState === STATES.TRAIN_APPROACHING || gameState === STATES.TRAIN_BOARDING)) {
      if (LRT.Enemies && LRT.Enemies.update) {
        const beforeAlive = LRT.Enemies.getAliveCount();
        LRT.Enemies.update(dt, pState.pos, stationGrid, trainCols, handlePlayerHit, handleEnemyDrop);
        const afterAlive = LRT.Enemies.getAliveCount();
        if (gameMode === MODES.SURVIVAL) {
          if (afterAlive < beforeAlive) {
            totalKills += (beforeAlive - afterAlive);
          }

          if (afterAlive === 0 && campaignState.stationObjectives[stationIndex % 6]) {
            campaignState.stationObjectives[stationIndex % 6].waveCleared = true;
            if (isStationPrimaryObjectiveComplete(stationIndex)) {
              campaignState.clearedStations.add(stationIndex);
            }
          }
        }
      }
    }

    // Periodic survival voice checks
    if (gameMode === MODES.SURVIVAL) {
      enemySightTimer += dt;
      if (enemySightTimer >= 0.5) {
        enemySightTimer = 0;
        if (LRT.Enemies && typeof LRT.Enemies.getDebugSummary === 'function') {
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
        if (stationIndex >= 1 && !campaignState.voTriggered.has('VO_15_RETREAT_NOTE')) {
          if (LRT.Weapons && typeof LRT.Weapons.getHudState === 'function') {
            const wh = LRT.Weapons.getHudState();
            if (wh && Array.isArray(wh.slots)) {
              const rifleSlot = wh.slots.find((s) => s.id === 'rifle');
              const shotgunSlot = wh.slots.find((s) => s.id === 'shotgun');
              const rRes = rifleSlot ? rifleSlot.reserve : 999;
              const sRes = shotgunSlot ? shotgunSlot.reserve : 999;
              if (rRes <= 10 && sRes <= 4) {
                campaignState.voTriggered.add('VO_15_RETREAT_NOTE');
                if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
                  LRT.Audio.playVoice('VO_15_RETREAT_NOTE');
                }
              }
            }
          }
        }
      }

      if (stationIndex === 0 && !campaignState.voTriggered.has('VO_03_STREET_HINT')) {
        if (pState.pos.x > 20.0 || pState.pos.x < -12.0) {
          campaignState.voTriggered.add('VO_03_STREET_HINT');
          if (LRT.Audio && typeof LRT.Audio.playVoice === 'function') {
            LRT.Audio.playVoice('VO_03_STREET_HINT');
          }
        }
      }

      // Station 5 holdout progression
      if (stationIndex === 5 && campaignState.stationObjectives[5] && campaignState.stationObjectives[5].omegaActive) {
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
    if (gameMode === MODES.EXPLORATION && LRT.Weapons && LRT.Weapons.getHudState) {
      const wh = LRT.Weapons.getHudState();
      if (wh && !wh.infiniteReserve && wh.reserve <= 2 && LRT.Weapons.addAmmo) {
        LRT.Weapons.addAmmo(wh.id, 12);
      }
    }

    const info = buildObjectiveInfo(stStats, stAtmos);
    info.fps = currentFps;
    info.drawCalls = lastDrawCalls || (renderer ? renderer.info.render.calls : 0);
    LRT.PlayerUI.updateHud(info);
  }

  function updateMenuCamera(t) {
    if (!camera) return;
    const drift = t * 0.12;
    const camZ = -4.5 + Math.cos(drift * 0.65) * 2.2;
    camera.position.set(
      0.95 + Math.sin(drift) * 0.35,
      2.20 + Math.sin(drift * 1.1) * 0.16,
      camZ
    );
    _menuLookAt.set(
      -1.65 + Math.sin(drift * 0.7) * 0.25,
      1.75,
      camZ - 20.0
    );
    camera.lookAt(_menuLookAt);
    if (sky) sky.position.copy(camera.position);
    updateSunTracking(0, -10);
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

    if (gameState === STATES.MENU && camera) {
      simTime += dt;
      if (LRT.Materials) LRT.Materials.update(simTime);
      if (LRT.Station && LRT.Station.update) LRT.Station.update(dt);
      updateMenuCamera(simTime);
    } else if (gameState !== STATES.GAME_OVER) {
      const pauseVisible = LRT.PlayerUI.getDom()['pause-overlay'] && !LRT.PlayerUI.getDom()['pause-overlay'].classList.contains('hidden');
      if (!pauseVisible) {
        stepSimulation(dt);
      }
    }

    renderFrame();
    if (!loopPaused) {
      rafId = requestAnimationFrame(animate);
    }
  }

  function bindUiButtons() {
    const dom = LRT.PlayerUI.getDom();

    if (dom['btn-start-survival']) {
      dom['btn-start-survival'].addEventListener('click', () => startGame(MODES.SURVIVAL));
    }
    if (dom['btn-start-exploration']) {
      dom['btn-start-exploration'].addEventListener('click', () => startGame(MODES.EXPLORATION));
    }
    if (dom['btn-resume']) {
      dom['btn-resume'].addEventListener('click', () => resume());
    }
    if (dom['btn-restart-mode']) {
      dom['btn-restart-mode'].addEventListener('click', () => startGame(gameMode));
    }
    if (dom['btn-retry']) {
      dom['btn-retry'].addEventListener('click', () => startGame(MODES.SURVIVAL));
    }
    const backToMenu = () => {
      gameState = STATES.MENU;
      LRT.PlayerUI.setPaused(true, false);
      LRT.PlayerUI.releaseLock();
      if (LRT.Audio) LRT.Audio.stopAllLoops();
      if (LRT.Weapons && LRT.Weapons.setVisible) LRT.Weapons.setVisible(false);
      applyBrightness();
      updateMenuCamera(simTime);
      LRT.PlayerUI.showScreen('menu');
    };
    if (dom['btn-back-menu']) dom['btn-back-menu'].addEventListener('click', backToMenu);
    if (dom['btn-gameover-menu']) dom['btn-gameover-menu'].addEventListener('click', backToMenu);

    const toggleMute = () => {
      if (!LRT.Audio) return;
      LRT.Audio.setMute(!LRT.Audio.isMuted());
      LRT.PlayerUI.syncMuteUi();
    };
    if (dom['btn-menu-mute']) dom['btn-menu-mute'].addEventListener('click', toggleMute);
    if (dom['btn-pause-mute']) dom['btn-pause-mute'].addEventListener('click', toggleMute);

    if (dom['btn-menu-lighting']) dom['btn-menu-lighting'].addEventListener('click', () => cycleLightingMode());
    if (dom['btn-pause-lighting']) dom['btn-pause-lighting'].addEventListener('click', () => cycleLightingMode());

    [dom['menu-quality-group'], dom['pause-quality-group']].forEach((grp) => {
      if (!grp) return;
      grp.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-quality]');
        if (btn) applyQuality(btn.dataset.quality);
      });
    });
  }

  function pause() {
    if (gameState === STATES.MENU || gameState === STATES.GAME_OVER) return;
    LRT.PlayerUI.setPaused(true, false);
    LRT.PlayerUI.showScreen('pause');
  }

  function resume() {
    if (gameState === STATES.MENU || gameState === STATES.GAME_OVER) return;
    if (LRT.Audio) LRT.Audio.unlock();
    LRT.PlayerUI.showScreen('play');
    LRT.PlayerUI.setPaused(false, true);
    LRT.PlayerUI.requestLock();
  }

  async function boot() {
    if (_bootPromise) return _bootPromise;
    _bootPromise = (async () => {
      captureErrors();
      canvas = document.getElementById('game-canvas');
      const w = Math.max(2, window.innerWidth);
      const h = Math.max(2, window.innerHeight);

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false
      });
      try {
        const gl = renderer.getContext();
        const dbgExt = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
        const rStr = gl ? String(dbgExt ? gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : '';
        isSoftwareRenderer = /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(rStr);
      } catch (e) {
        isSoftwareRenderer = false;
      }
      renderer.setSize(w, h, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(
        C.PLAYER_CFG.baseFov,
        w / h,
        0.08,
        520
      );
      scene.add(camera);

      const JSM = window.THREE_JSM || {};
      if (JSM.Sky) {
        sky = new JSM.Sky();
        sky.scale.setScalar(420);
        sky.frustumCulled = false;
        scene.add(sky);
      }

      hemiLight = new THREE.HemisphereLight(0xdbeeff, 0x5c5348, 0.92);
      scene.add(hemiLight);

      sunLight = new THREE.DirectionalLight(0xfff3de, 2.75);
      sunLight.position.set(28, 46, 22);
      sunLight.castShadow = true;
      sunLight.shadow.camera.left = -55;
      sunLight.shadow.camera.right = 55;
      sunLight.shadow.camera.top = 55;
      sunLight.shadow.camera.bottom = -55;
      sunLight.shadow.camera.near = 1;
      sunLight.shadow.camera.far = 160;
      sunLight.shadow.bias = -0.00045;
      sunLight.shadow.normalBias = 0.025;
      sunLight.shadow.mapSize.set(1024, 1024);
      scene.add(sunLight);
      scene.add(sunLight.target);

      if (LRT.City && typeof LRT.City.setTrackGatesOpen === 'function') {
        LRT.City.setTrackGatesOpen(false);
      }

      initPostProcessing(w, h);
      applyQuality('high');

      if (LRT.Audio && LRT.Audio.init) LRT.Audio.init();
      if (LRT.Materials && LRT.Materials.init) LRT.Materials.init(renderer, scene);
      LRT.PlayerUI.init(canvas, camera, {
        onPause: pause,
        onInteractResult: handleInteractResult,
        onSummonTrain: (dirOverride) => {
          if (gameState === STATES.STATION_ACTIVE) {
            summonTrain(dirOverride, false);
          } else if (gameState === STATES.TRAIN_BOARDING) {
            departTrainNow();
          }
        }
      });

      if (LRT.Train && LRT.Train.init) LRT.Train.init(scene);
      if (LRT.Weapons && LRT.Weapons.init) {
        LRT.Weapons.init(scene, camera);
        if (LRT.Weapons.setVisible) LRT.Weapons.setVisible(false);
      }
      if (LRT.Enemies && LRT.Enemies.init) LRT.Enemies.init(scene);

      // Pre-build Station 0 & apply startup Daylight preset
      buildStation(0);
      setLightingMode(currentLightingKey);
      lightingLockedByUser = false;
      updateMenuCamera(simTime);

      // Async shader warmup BEFORE hiding loading screen (zero reload/switch freezes!)
      if (LRT.Weapons && typeof LRT.Weapons.setWarmupMode === 'function') LRT.Weapons.setWarmupMode(true);
      if (LRT.Train && typeof LRT.Train.setWarmupMode === 'function') LRT.Train.setWarmupMode(true);
      if (LRT.Enemies && typeof LRT.Enemies.setWarmupMode === 'function') LRT.Enemies.setWarmupMode(true);

      try {
        if (typeof renderer.compileAsync === 'function') {
          await renderer.compileAsync(scene, camera);
        } else {
          renderer.compile(scene, camera);
        }
        renderFrame();
      } catch (warmErr) {
        console.warn('[main] Shader warmup fallback:', warmErr);
      }

      if (LRT.Weapons && typeof LRT.Weapons.setWarmupMode === 'function') LRT.Weapons.setWarmupMode(false);
      if (LRT.Train && typeof LRT.Train.setWarmupMode === 'function') LRT.Train.setWarmupMode(false);
      if (LRT.Enemies && typeof LRT.Enemies.setWarmupMode === 'function') LRT.Enemies.setWarmupMode(false);

      // Render one clean menu frame with restored visibility to pre-warm composer targets
      renderFrame();

      LRT.PlayerUI.showScreen('menu');
      LRT.PlayerUI.setPaused(true, false);
      bindUiButtons();

      window.addEventListener('resize', () => {
        if (!renderer || !camera) return;
        const rw = Math.max(2, window.innerWidth);
        const rh = Math.max(2, window.innerHeight);
        camera.aspect = rw / rh;
        camera.updateProjectionMatrix();
        renderer.setSize(rw, rh, false);
        if (composer) {
          composer.setPixelRatio(renderer.getPixelRatio());
          composer.setSize(rw, rh);
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
            state: gameState,
            mode: gameMode,
            lightingMode: currentLightingKey,
            lightingLockedByUser,
            stationIndex,
            activeTravelDir,
            stationName: st.name || st.stationName || null,
            wave: currentWave,
            aliveEnemies: LRT.Enemies && LRT.Enemies.getAliveCount ? LRT.Enemies.getAliveCount() : 0,
            trainState: LRT.Train && LRT.Train.getState ? LRT.Train.getState() : 'MISSING',
            trainSpeed: LRT.Train && LRT.Train.getSpeed ? LRT.Train.getSpeed() : 0,
            trainTrackX: LRT.Train && LRT.Train.getTrackX ? LRT.Train.getTrackX() : 0,
            trainDir: LRT.Train && LRT.Train.getDirection ? LRT.Train.getDirection() : 1,
            playerPos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) },
            playerHp: p.health,
            isInsideTrain: p.isInsideTrain,
            isSitting: !!p.isSitting,
            activeWeapon: wh.id || null,
            ammo: wh ? { mag: wh.ammoInMag ?? wh.mag ?? null, reserve: wh.reserve ?? null } : null,
            drawCalls: lastDrawCalls || (renderer ? renderer.info.render.calls : 0),
            geometries: renderer ? renderer.info.memory.geometries : 0,
            textures: renderer ? renderer.info.memory.textures : 0,
            fps: currentFps,
            brokenGlassCount: st.brokenGlassCount || 0,
            destroyedPillars: st.destroyedPillars || 0,
            audioStatus: LRT.Audio ? LRT.Audio.getStatus() : null,
            brightness: currentBrightness,
            exposure: renderer ? +renderer.toneMappingExposure.toFixed(3) : null,
            hemiIntensity: hemiLight ? +hemiLight.intensity.toFixed(3) : null,
            sunIntensity: sunLight ? +sunLight.intensity.toFixed(3) : null,
            fogDensity: scene && scene.fog ? +scene.fog.density.toFixed(4) : null,
            campaignVictory: campaignState.campaignVictory,
            clearedStations: Array.from(campaignState.clearedStations),
            consoleErrors: consoleErrors.slice()
          };
        },
        getCampaignState: () => ({
          clearedStations: Array.from(campaignState.clearedStations),
          visitedStations: Array.from(campaignState.visitedStations),
          stationObjectives: JSON.parse(JSON.stringify(campaignState.stationObjectives)),
          voTriggered: Array.from(campaignState.voTriggered),
          campaignVictory: campaignState.campaignVictory,
          stationUsedIds: Array.from(campaignState.stationUsedIds.entries()).map(([k, v]) => [k, Array.from(v)])
        }),
        startMode: (m) => startGame(m),
        setBrightness,
        getBrightness,
        setLightingMode,
        cycleLightingMode,
        getLightingMode,
        summonTrain: (dir) => summonTrain(dir, true),
        departTrainNow,
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
          saveCurrentStationUsedIds();
          if (LRT.Station && LRT.Station.dispose) LRT.Station.dispose(scene);
          if (LRT.Enemies && LRT.Enemies.reset) LRT.Enemies.reset();
          if (LRT.Train && LRT.Train.reset) LRT.Train.reset(gameMode);
          stationIndex = Math.max(0, idx | 0);
          activeTravelDir = 1;
          prevTrainState = 'AWAY';
          rideCompleteReady = false;
          gameState = STATES.STATION_ACTIVE;
          syncMenuLights();
          const st = buildStation(stationIndex, 0);
          const sp = (st && st.spawnPos) || pickPlayerSpawnPos();
          LRT.PlayerUI.reset(sp, gameMode === MODES.EXPLORATION, gameMode);
          updateSunTracking(sp.x, sp.z);
          renderFrame();
          return st;
        },
        getLoadedModules: () => Object.keys(LRT),
        getScene: () => scene,
        isSoftwareRenderer: () => isSoftwareRenderer,
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
          if (doRender !== false) renderFrame();
        },
        applyPlayerDamage: (dmg, srcPos) => handlePlayerHit(dmg, srcPos)
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
    setQuality: applyQuality,
    setBrightness,
    getBrightness,
    setLightingMode,
    cycleLightingMode,
    getLightingMode,
    summonTrain,
    departTrainNow,
    getState: () => gameState,
    getCampaignState: () => ({
      clearedStations: Array.from(campaignState.clearedStations),
      visitedStations: Array.from(campaignState.visitedStations),
      stationObjectives: JSON.parse(JSON.stringify(campaignState.stationObjectives)),
      voTriggered: Array.from(campaignState.voTriggered),
      campaignVictory: campaignState.campaignVictory
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
