(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const CORE = (I.core = I.core || {});

  const C = LRT.Config;
  const STATES = C.STATES;

  CORE.renderer = null;
  CORE.scene = null;
  CORE.camera = null;
  CORE.canvas = null;
  CORE.composer = null;
  CORE.renderPass = null;
  CORE.n8aoPass = null;
  CORE.bloomPass = null;
  CORE.outputPass = null;
  CORE.sky = null;
  CORE.hemiLight = null;
  CORE.sunLight = null;

  const SETTINGS_STORAGE_KEY = 'lrt_settings_v1';
  const SHADOW_DYNAMIC_INTERVAL = 1 / 8; // max ~8 Hz dynamic shadow refresh while moving/in combat
  const SHADOW_SHIFT_SQ = 9.0; // 3.0m^2 sun target shift threshold

  CORE.gameState = CORE.gameState || STATES.MENU;
  CORE.qualityKey = 'balanced';
  CORE.resScaleMode = 'floor_720';
  CORE.shadowsEnabled = true;
  CORE.bloomEnabled = true;
  CORE.aoMode = 'off';
  CORE.fpsCounterEnabled = false;
  CORE.difficultyKey = 'medium';
  CORE.currentLightingKey = 'DAYLIGHT_CLEAR';
  CORE.lightingLockedByUser = false;
  CORE.isMoodLerping = false;
  CORE.currentBrightness = 1.0;
  CORE.lastDrawCalls = 0;
  CORE.isSoftwareRenderer = false;
  CORE.interiorOccluded = false;

  const _brightFogTarget = new THREE.Color(0x526378);
  const _lerpFogA = new THREE.Color();
  const _lerpFogB = new THREE.Color();
  const _lerpHemiSkyA = new THREE.Color();
  const _lerpHemiSkyB = new THREE.Color();
  const _lerpHemiGndA = new THREE.Color();
  const _lerpHemiGndB = new THREE.Color();
  const _lerpSunColA = new THREE.Color();
  const _lerpSunColB = new THREE.Color();
  const _skySunDir = new THREE.Vector3();
  const _moodBlendOut = {
    active: false,
    fromKey: null,
    toKey: null,
    t: 0.0,
    daylightBlend: 1.0,
    tubeIntensity: 0.22,
    streetLampIntensity: 0.0,
    wetness: 0.25
  };
  let _currentEnvHdriKey = null;

  const baseMood = {
    isDaylight: true,
    daylightBlend: 1.0,
    hemiIntensity: 0.92,
    sunIntensity: 2.75,
    fogColor: new THREE.Color(0x9eb8cc),
    fogDensity: 0.0042,
    tubeIntensity: 0.22,
    streetLampIntensity: 0.0,
    envIntensity: 1.05,
    exposure: 1.04,
    bloomStrength: 0.22,
    wetness: 0.25
  };

  const _menuLookAt = new THREE.Vector3();
  const _sunDir = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
  const _sunRight = new THREE.Vector3();
  const _sunUp = new THREE.Vector3();
  const _upAxis = new THREE.Vector3(0, 1, 0);
  const _focusVec = new THREE.Vector3();
  const _nextSunTarget = new THREE.Vector3();
  const _lastShadowTarget = new THREE.Vector3();
  const _projScreenMatrix = new THREE.Matrix4();
  const _frustum = new THREE.Frustum();

  let _hasShadowTarget = false;
  let _shadowCacheAccum = 0;
  let _frustumReady = false;

  function loadSettings() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (parsed.qualityKey && parsed.qualityKey in C.QUALITY_TIERS) {
        CORE.qualityKey = parsed.qualityKey;
      }
      if (parsed.resScaleMode && C.RES_SCALE_MODES && (parsed.resScaleMode in C.RES_SCALE_MODES)) {
        CORE.resScaleMode = parsed.resScaleMode;
      }
      if (typeof parsed.shadowsEnabled === 'boolean') {
        CORE.shadowsEnabled = parsed.shadowsEnabled;
      }
      if (typeof parsed.bloomEnabled === 'boolean') {
        CORE.bloomEnabled = parsed.bloomEnabled;
      }
      if (parsed.aoMode === 'off' || parsed.aoMode === 'half' || parsed.aoMode === 'full') {
        CORE.aoMode = parsed.aoMode;
      }
      if (typeof parsed.fpsCounterEnabled === 'boolean') {
        CORE.fpsCounterEnabled = parsed.fpsCounterEnabled;
      }
      if (parsed.difficultyKey && C.DIFFICULTY_TIERS && (parsed.difficultyKey in C.DIFFICULTY_TIERS)) {
        CORE.difficultyKey = parsed.difficultyKey;
      }
      if (typeof parsed.brightness === 'number' && Number.isFinite(parsed.brightness)) {
        CORE.currentBrightness = Math.round(Math.max(0.40, Math.min(1.80, parsed.brightness)) * 100) / 100;
      }
    } catch (_) {}
  }

  function saveSettings() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        qualityKey: CORE.qualityKey,
        resScaleMode: CORE.resScaleMode,
        shadowsEnabled: CORE.shadowsEnabled,
        bloomEnabled: CORE.bloomEnabled,
        aoMode: CORE.aoMode,
        fpsCounterEnabled: CORE.fpsCounterEnabled,
        difficultyKey: CORE.difficultyKey,
        brightness: CORE.currentBrightness
      }));
    } catch (_) {}
  }

  function getSettings() {
    return {
      qualityKey: CORE.qualityKey,
      resScaleMode: CORE.resScaleMode,
      shadowsEnabled: CORE.shadowsEnabled,
      bloomEnabled: CORE.bloomEnabled,
      aoMode: CORE.aoMode,
      fpsCounterEnabled: CORE.fpsCounterEnabled,
      difficultyKey: CORE.difficultyKey,
      brightness: CORE.currentBrightness
    };
  }

  function syncSettingsUi() {
    if (!LRT.PlayerUI) return;
    if (typeof LRT.PlayerUI.syncQualityUi === 'function') {
      LRT.PlayerUI.syncQualityUi(CORE.qualityKey);
    }
    if (typeof LRT.PlayerUI.syncAllSettingsUi === 'function') {
      LRT.PlayerUI.syncAllSettingsUi(getSettings());
    }
  }

  loadSettings();

  function markShadowDirty() {
    if (CORE.renderer && CORE.renderer.shadowMap) {
      CORE.renderer.shadowMap.autoUpdate = false;
      const needsInit = !!(CORE.sunLight && !CORE.sunLight.shadow.map);
      if (CORE.shadowsEnabled || needsInit) {
        CORE.renderer.shadowMap.needsUpdate = true;
      }
    }
  }

  function tickShadowCache(dt, trainMoving, enemiesAlive, pauseShadow) {
    if (!CORE.shadowsEnabled || !CORE.renderer || !CORE.renderer.shadowMap) {
      _shadowCacheAccum = 0;
      return false;
    }
    CORE.renderer.shadowMap.autoUpdate = false;
    if (pauseShadow || CORE.gameState === STATES.TRAIN_CRUISE) {
      _shadowCacheAccum = 0;
      return false;
    }
    const isDynamic = !!trainMoving || (typeof enemiesAlive === 'number' ? enemiesAlive > 0 : !!enemiesAlive);
    if (!isDynamic) {
      _shadowCacheAccum = 0;
      return false;
    }
    _shadowCacheAccum += Math.max(0, dt || 0);
    if (_shadowCacheAccum >= SHADOW_DYNAMIC_INTERVAL) {
      _shadowCacheAccum %= SHADOW_DYNAMIC_INTERVAL;
      markShadowDirty();
      return true;
    }
    return false;
  }

  function updateFrustum() {
    if (!CORE.camera) return null;
    CORE.camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(CORE.camera.projectionMatrix, CORE.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);
    _frustumReady = true;
    return _frustum;
  }

  function getFrustum() {
    if (!_frustumReady && CORE.camera) {
      updateFrustum();
    }
    return _frustum;
  }

  function isInteriorOccluded() {
    if (CORE.interiorOccluded) return true;
    if (CORE.camera && LRT.Station && typeof LRT.Station.isInteriorOccluded === 'function') {
      return !!LRT.Station.isInteriorOccluded(CORE.camera.position);
    }
    return false;
  }

  function applyRenderResolution(optW, optH) {
    if (!CORE.renderer) return 1.0;
    const cssW = Math.max(2, optW || window.innerWidth || 1280);
    const cssH = Math.max(2, optH || window.innerHeight || 720);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const modeCfg = (C.RES_SCALE_MODES && C.RES_SCALE_MODES[CORE.resScaleMode]) || { mult: 1.0, useDpr: false, dprCap: 1.0 };
    const tier = (C.QUALITY_TIERS && C.QUALITY_TIERS[CORE.qualityKey]) || C.QUALITY_TIERS.balanced || { dprCap: 1.0 };

    const dprCap = CORE.isSoftwareRenderer ? 1.0 : (modeCfg.dprCap || tier.dprCap || 1.5);
    const mult = CORE.isSoftwareRenderer ? 1.0 : (modeCfg.mult || 1.0);
    const baseScale = modeCfg.useDpr ? (Math.min(dpr, dprCap) * mult) : mult;

    const minFloorRatio = 720 / Math.max(1, cssH);
    const effectivePixelRatio = Math.max(minFloorRatio, baseScale);

    const glMaxTex = (CORE.renderer.capabilities && CORE.renderer.capabilities.maxTextureSize)
      ? Math.min(4096, CORE.renderer.capabilities.maxTextureSize)
      : 4096;
    const maxDim = CORE.isSoftwareRenderer ? Math.min(2048, glMaxTex) : glMaxTex;
    const maxBackbufferH = 2160;
    const maxRatio = Math.min(maxDim / Math.max(cssW, cssH), maxBackbufferH / cssH);
    const cappedRatio = Math.min(effectivePixelRatio, Math.max(minFloorRatio, maxRatio));

    CORE.renderer.setPixelRatio(cappedRatio);
    CORE.renderer.setSize(cssW, cssH, false);
    if (CORE.composer) {
      CORE.composer.setPixelRatio(cappedRatio);
      CORE.composer.setSize(cssW, cssH);
    }
    return cappedRatio;
  }

  function applyShadowsState(targetShadowSize) {
    if (CORE.renderer && CORE.renderer.shadowMap) {
      // Never toggle shadowMap.enabled or castShadow so Three.js never recompiles shaders.
      CORE.renderer.shadowMap.enabled = true;
      CORE.renderer.shadowMap.autoUpdate = false;
    }
    if (CORE.sunLight) {
      CORE.sunLight.castShadow = true;
      CORE.sunLight.shadow.intensity = CORE.shadowsEnabled ? 1.0 : 0;
      if (typeof targetShadowSize === 'number' && targetShadowSize > 0) {
        const clampedSize = CORE.shadowsEnabled ? targetShadowSize : Math.min(512, targetShadowSize);
        if (CORE.sunLight.shadow.mapSize.width !== clampedSize) {
          CORE.sunLight.shadow.mapSize.set(clampedSize, clampedSize);
          if (CORE.sunLight.shadow.map) {
            CORE.sunLight.shadow.map.setSize(clampedSize, clampedSize);
          }
        }
      }
    }
    _hasShadowTarget = false;
    markShadowDirty();
  }

  function applyAoState() {
    if (CORE.n8aoPass) {
      const mode = CORE.aoMode || 'off';
      if (mode === 'off') {
        CORE.n8aoPass.enabled = false;
      } else if (mode === 'half' || CORE.isSoftwareRenderer) {
        CORE.n8aoPass.enabled = true;
        CORE.n8aoPass.configuration.halfRes = true;
        CORE.n8aoPass.configuration.aoSamples = CORE.isSoftwareRenderer ? 6 : 8;
        CORE.n8aoPass.configuration.denoiseSamples = CORE.isSoftwareRenderer ? 3 : 4;
      } else {
        CORE.n8aoPass.enabled = true;
        CORE.n8aoPass.configuration.halfRes = false;
        CORE.n8aoPass.configuration.aoSamples = 12;
        CORE.n8aoPass.configuration.denoiseSamples = 5;
      }
    }
    if (CORE.renderPass) {
      CORE.renderPass.enabled = !(CORE.n8aoPass && CORE.n8aoPass.enabled);
    }
  }

  function applyBloomState() {
    if (CORE.bloomPass) {
      CORE.bloomPass.enabled = !!CORE.bloomEnabled;
    }
  }

  function setRenderScale(mode) {
    const validMode = (mode && C.RES_SCALE_MODES && (mode in C.RES_SCALE_MODES)) ? mode : 'floor_720';
    CORE.resScaleMode = validMode;
    applyRenderResolution();
    saveSettings();
    syncSettingsUi();
    return CORE.resScaleMode;
  }

  function setShadowsEnabled(flag) {
    CORE.shadowsEnabled = !!flag;
    applyShadowsState();
    saveSettings();
    syncSettingsUi();
    return CORE.shadowsEnabled;
  }

  function setBloomEnabled(flag) {
    CORE.bloomEnabled = !!flag;
    applyBloomState();
    saveSettings();
    syncSettingsUi();
    return CORE.bloomEnabled;
  }

  function setAoMode(mode) {
    const validMode = (mode === 'off' || mode === 'half' || mode === 'full') ? mode : 'off';
    CORE.aoMode = validMode;
    applyAoState();
    saveSettings();
    syncSettingsUi();
    return CORE.aoMode;
  }

  function setFpsCounterEnabled(flag) {
    CORE.fpsCounterEnabled = !!flag;
    saveSettings();
    syncSettingsUi();
    return CORE.fpsCounterEnabled;
  }

  function setDifficulty(key) {
    const validKey = (key && C.DIFFICULTY_TIERS && (key in C.DIFFICULTY_TIERS)) ? key : 'medium';
    CORE.difficultyKey = validKey;
    saveSettings();
    syncSettingsUi();
    return CORE.difficultyKey;
  }

  function initPostProcessing(width, height) {
    const JSM = window.THREE_JSM || {};
    const N8AOCtor = window.N8AOPostPass || window.N8AOPass;
    if (!JSM.EffectComposer || !JSM.RenderPass || !JSM.OutputPass || !CORE.renderer || !CORE.scene || !CORE.camera) {
      return;
    }

    const rt = new THREE.WebGLRenderTarget(Math.max(2, width), Math.max(2, height), {
      type: THREE.HalfFloatType,
      samples: 0
    });
    CORE.composer = new JSM.EffectComposer(CORE.renderer, rt);
    CORE.composer.setPixelRatio(CORE.renderer.getPixelRatio());
    CORE.composer.setSize(width, height);

    CORE.renderPass = new JSM.RenderPass(CORE.scene, CORE.camera);
    CORE.composer.addPass(CORE.renderPass);

    if (N8AOCtor) {
      CORE.n8aoPass = new N8AOCtor(CORE.scene, CORE.camera, width, height);
      CORE.n8aoPass.configuration.gammaCorrection = false;
      CORE.n8aoPass.autoDetectTransparency = false;
      CORE.n8aoPass.configuration.transparencyAware = false;
      CORE.n8aoPass.configuration.aoRadius = 1.8;
      CORE.n8aoPass.configuration.distanceFalloff = 0.85;
      CORE.n8aoPass.configuration.intensity = 2.0;
      CORE.n8aoPass.configuration.aoSamples = 12;
      CORE.n8aoPass.configuration.denoiseSamples = 6;
      CORE.n8aoPass.configuration.denoiseRadius = 8;
      CORE.n8aoPass.configuration.halfRes = false;
      CORE.composer.addPass(CORE.n8aoPass);
    }

    if (JSM.UnrealBloomPass) {
      CORE.bloomPass = new JSM.UnrealBloomPass(
        new THREE.Vector2(width, height),
        baseMood.bloomStrength * 0.82,
        0.32,
        1.08
      );
      CORE.composer.addPass(CORE.bloomPass);
    }

    CORE.outputPass = new JSM.OutputPass();
    CORE.composer.addPass(CORE.outputPass);

    applyRenderResolution(width, height);
    applyShadowsState();
    applyAoState();
    applyBloomState();
  }

  function renderFrame() {
    if (!CORE.renderer || !CORE.scene || !CORE.camera) return;
    updateFrustum();
    CORE.renderer.info.autoReset = false;
    CORE.renderer.info.reset();
    const useComposer = !!(CORE.composer && (CORE.bloomEnabled || (CORE.n8aoPass && CORE.n8aoPass.enabled)));
    if (!useComposer) {
      CORE.renderer.render(CORE.scene, CORE.camera);
    } else {
      CORE.composer.render();
    }
    CORE.lastDrawCalls = CORE.renderer.info.render.calls;
    CORE.renderer.info.autoReset = true;
  }

  function applyQuality(tierKey) {
    const validKey = (tierKey && C.QUALITY_TIERS && (tierKey in C.QUALITY_TIERS))
      ? tierKey
      : ((CORE.qualityKey && C.QUALITY_TIERS && (CORE.qualityKey in C.QUALITY_TIERS)) ? CORE.qualityKey : 'balanced');
    const tier = C.QUALITY_TIERS[validKey] || C.QUALITY_TIERS.balanced;
    CORE.qualityKey = validKey;
    CORE.resScaleMode = tier.resScale || (validKey === 'high' ? 'native' : 'floor_720');
    CORE.shadowsEnabled = !!tier.shadows;
    CORE.bloomEnabled = tier.bloom !== undefined ? !!tier.bloom : (validKey !== 'potato');
    CORE.aoMode = tier.ao || (validKey === 'high' ? 'half' : 'off');

    applyRenderResolution();
    applyShadowsState(tier.shadowSize);
    applyAoState();
    applyBloomState();

    const aniso = tier.maxAniso || (CORE.qualityKey === 'potato' ? 1 : (CORE.qualityKey === 'balanced' ? 2 : 8));
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
    if (CORE.scene) {
      CORE.scene.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          if (Array.isArray(obj.material)) {
            for (let i = 0; i < obj.material.length; i++) updateMatTexAniso(obj.material[i]);
          } else {
            updateMatTexAniso(obj.material);
          }
        }
      });
    }

    if (LRT.City && typeof LRT.City.updateVisibility === 'function' && CORE.camera) {
      updateFrustum();
      LRT.City.updateVisibility(CORE.camera.position, CORE.qualityKey, _frustum, isInteriorOccluded());
    }

    saveSettings();
    syncSettingsUi();
  }

  function syncMenuLights() {
    const isMenu = CORE.gameState === STATES.MENU;
    const b = CORE.currentBrightness;
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

    const dayMix = (baseMood && baseMood.daylightBlend !== undefined)
      ? baseMood.daylightBlend
      : ((baseMood && baseMood.isDaylight) ? 1.0 : 0.0);
    const nightStreetFloor = 0.25 * (1.0 - dayMix);
    const streetFactor = Math.max(nightStreetFloor, val / 1.8);
    if (LRT.Station) {
      const isMenu = CORE.gameState === STATES.MENU;
      const tubeInt = (baseMood && baseMood.tubeIntensity !== undefined) ? baseMood.tubeIntensity : 0.72;
      const bScale = (CORE.currentBrightness <= 1.0
        ? (0.28 + 0.72 * CORE.currentBrightness)
        : (1.0 + Math.max(0, CORE.currentBrightness - 1.0) * 0.35)) * (isMenu ? 1.45 : 1.0);
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
    if (!CORE.sunLight) return;
    const mapSize = CORE.sunLight.shadow.mapSize.width || 1024;
    const texelWorld = 76.0 / mapSize;

    _sunRight.crossVectors(_upAxis, _sunDir);
    if (_sunRight.lengthSq() < 1e-5) _sunRight.set(1, 0, 0);
    else _sunRight.normalize();
    _sunUp.crossVectors(_sunDir, _sunRight).normalize();

    _focusVec.set(focusX || 0, 0, focusZ || 0);
    const uProj = Math.round(_focusVec.dot(_sunRight) / texelWorld) * texelWorld;
    const vProj = Math.round(_focusVec.dot(_sunUp) / texelWorld) * texelWorld;
    const wProj = _focusVec.dot(_sunDir);

    _nextSunTarget.set(0, 0, 0)
      .addScaledVector(_sunRight, uProj)
      .addScaledVector(_sunUp, vProj)
      .addScaledVector(_sunDir, wProj);

    const dx = _nextSunTarget.x - _lastShadowTarget.x;
    const dy = _nextSunTarget.y - _lastShadowTarget.y;
    const dz = _nextSunTarget.z - _lastShadowTarget.z;
    if (_hasShadowTarget && (dx * dx + dy * dy + dz * dz) < SHADOW_SHIFT_SQ) {
      return;
    }

    _hasShadowTarget = true;
    _lastShadowTarget.copy(_nextSunTarget);
    CORE.sunLight.target.position.copy(_nextSunTarget);
    CORE.sunLight.position.copy(_nextSunTarget).addScaledVector(_sunDir, 62);
    CORE.sunLight.target.updateMatrixWorld();
    markShadowDirty();
  }

  function applyBrightness() {
    const b = CORE.currentBrightness;
    const isMenu = CORE.gameState === STATES.MENU;
    const over = Math.max(0, b - 1.0);
    const dayMix = (baseMood.daylightBlend !== undefined)
      ? Math.max(0.0, Math.min(1.0, baseMood.daylightBlend))
      : (baseMood.isDaylight ? 1.0 : 0.0);
    const nightMix = 1.0 - dayMix;
    const lsDay = b <= 1.0 ? Math.pow(b, 1.35) : 1.0;
    const lsNight = b <= 1.0 ? Math.pow(b, 1.85) : 1.0;
    const lightScale = lsNight + (lsDay - lsNight) * dayMix;

    syncMenuLights();

    if (CORE.hemiLight) {
      const baseHemi = baseMood.hemiIntensity * lightScale + over * (0.25 + (0.65 - 0.25) * dayMix);
      CORE.hemiLight.intensity = baseHemi + (isMenu ? 0.08 * nightMix : 0);
    }
    if (CORE.sunLight) {
      const baseSun = baseMood.sunIntensity * lightScale + over * (0.35 + (0.95 - 0.35) * dayMix);
      CORE.sunLight.intensity = baseSun + (isMenu ? 0.14 * nightMix : 0);
    }
    if (CORE.renderer) {
      const baseExp = baseMood.exposure || 1.05;
      const expDay = b <= 1.0 ? Math.max(0.32, baseExp * (0.28 + b * 0.72)) : Math.min(1.65, baseExp + over * 0.55);
      const expNight = b <= 1.0 ? Math.max(0.54, baseExp * (0.58 + b * 0.42)) : Math.min(1.45, baseExp + over * 0.42);
      CORE.renderer.toneMappingExposure = expNight + (expDay - expNight) * dayMix;
    }
    if (CORE.scene) {
      if ('environmentIntensity' in CORE.scene) {
        const envDay = b <= 1.0
          ? Math.max(0.03, baseMood.envIntensity * (0.22 + 0.78 * b))
          : Math.min(1.85, baseMood.envIntensity + over * 0.85);
        const envNight = b <= 1.0
          ? Math.max(0.004, baseMood.envIntensity * Math.pow(b, 1.9))
          : Math.min(0.45, baseMood.envIntensity + over * 0.22);
        const envVal = envNight + (envDay - envNight) * dayMix;
        CORE.scene.environmentIntensity = envVal + (isMenu ? 0.06 * nightMix : 0);
      }
      if (CORE.scene.fog) {
        const fogLift = over > 0 ? Math.min(0.42, (over / 0.8) * 0.42) * nightMix : 0;
        CORE.scene.fog.color.copy(baseMood.fogColor).lerp(_brightFogTarget, fogLift);
        if (CORE.scene.background && CORE.scene.background.isColor) {
          CORE.scene.background.copy(CORE.scene.fog.color);
        }
        if (LRT.Materials) {
          LRT.Materials.uGlobals.uFogHazeColor.value.copy(CORE.scene.fog.color);
          LRT.Materials.uGlobals.uFogHazeDensity.value = 0.52 + (0.16 - 0.52) * dayMix;
        }
        if (CORE.scene.fog.isFogExp2) {
          const fogFactor = b <= 1.0
            ? 1.0 + (1.0 - b) * 0.14
            : Math.max(0.55, 1.0 - over * 0.45);
          CORE.scene.fog.density = baseMood.fogDensity * fogFactor;
        }
      }
    }
    if (CORE.bloomPass) {
      CORE.bloomPass.strength = baseMood.bloomStrength * (b <= 1.0 ? 0.88 + 0.12 * b : 1.0 + over * 0.25);
    }
    const lampDay = b <= 1.0 ? (0.30 + 0.70 * b) : 1.0;
    const lampNight = b <= 1.0 ? Math.max(0.95, 0.92 + 0.08 * b) : 1.0 + over * 0.20;
    const localLampScale = lampNight + (lampDay - lampNight) * dayMix;
    applyStreetLightsIntensity(baseMood.streetLampIntensity * localLampScale);
    if (LRT.Materials && LRT.Materials.mats) {
      const m = LRT.Materials.mats;
      const tubeDay = b <= 1.0 ? (0.30 + 0.70 * b) : (1.0 + over * 0.55);
      const tubeNight = b <= 1.0 ? (0.72 + 0.28 * b) : (1.0 + over * 0.45);
      const tubeFactor = tubeNight + (tubeDay - tubeNight) * dayMix;
      if (m.flickerTube) {
        m.flickerTube.emissiveIntensity = 1.65 * baseMood.tubeIntensity * tubeFactor;
      }
      if (m.tubeHalo) {
        m.tubeHalo.opacity = Math.min(0.28, 0.12 * baseMood.tubeIntensity * tubeFactor);
      }
      if (m.skylineBuilding) {
        const skyNight = 0.14 + 0.14 * Math.min(1.2, b);
        m.skylineBuilding.emissiveIntensity = skyNight + (0.08 - skyNight) * dayMix;
      }
    }
    if (LRT.Train && typeof LRT.Train.syncLights === 'function') {
      LRT.Train.syncLights();
    }
  }

  function setBrightness(val) {
    const num = Number(val);
    const clamped = Number.isFinite(num) ? Math.max(0.40, Math.min(1.80, num)) : 1.0;
    CORE.currentBrightness = Math.round(clamped * 100) / 100;
    applyBrightness();
    saveSettings();
    if (LRT.PlayerUI && typeof LRT.PlayerUI.syncBrightnessUi === 'function') {
      LRT.PlayerUI.syncBrightnessUi(CORE.currentBrightness);
    }
    return CORE.currentBrightness;
  }

  function getBrightness() {
    return CORE.currentBrightness;
  }

  function _computeMoodFar(moodKey, m) {
    if (moodKey === 'DAYLIGHT_CLEAR' || (m.isDaylight && m.fogDensity < 0.006)) return 400;
    if (!m.isDaylight && m.fogDensity >= 0.014) return 220;
    if (!m.isDaylight) return 260;
    return 300;
  }

  function applyMoodLighting(stats, atmos) {
    const requestedKey = (atmos && atmos.moodKey) || CORE.currentLightingKey || (stats && (stats.moodKey || stats.atmosphere)) || 'DAYLIGHT_CLEAR';
    const moodKey = (requestedKey in C.MOODS) ? requestedKey : 'DAYLIGHT_CLEAR';
    const m = C.MOODS[moodKey] || C.MOODS.DAYLIGHT_CLEAR;
    CORE.currentLightingKey = moodKey;
    CORE.isMoodLerping = false;
    _moodBlendOut.active = false;
    _moodBlendOut.fromKey = moodKey;
    _moodBlendOut.toKey = moodKey;
    _moodBlendOut.t = 1.0;

    baseMood.isDaylight = !!m.isDaylight;
    baseMood.daylightBlend = m.isDaylight ? 1.0 : 0.0;
    baseMood.hemiIntensity = m.hemiIntensity;
    baseMood.sunIntensity = m.sunIntensity;
    baseMood.fogColor.setHex(m.fogColor);
    baseMood.fogDensity = m.fogDensity;
    baseMood.tubeIntensity = m.tubeIntensity !== undefined ? m.tubeIntensity : 0.72;
    baseMood.streetLampIntensity = m.streetLampIntensity !== undefined ? m.streetLampIntensity : (m.isDaylight ? 0.0 : 2.0);
    baseMood.envIntensity = m.envIntensity !== undefined ? m.envIntensity : (m.isDaylight ? 1.0 : 0.62);
    baseMood.exposure = m.exposure !== undefined ? m.exposure : 1.05;
    baseMood.bloomStrength = m.bloomStrength !== undefined ? m.bloomStrength : (m.isDaylight ? 0.24 : 0.42);
    baseMood.wetness = m.wetness !== undefined ? m.wetness : 0.5;
    _moodBlendOut.daylightBlend = baseMood.daylightBlend;
    _moodBlendOut.tubeIntensity = baseMood.tubeIntensity;
    _moodBlendOut.streetLampIntensity = baseMood.streetLampIntensity;
    _moodBlendOut.wetness = baseMood.wetness;

    if (CORE.scene) {
      if (CORE.scene.background && CORE.scene.background.isColor) CORE.scene.background.setHex(m.fogColor);
      else CORE.scene.background = new THREE.Color(m.fogColor);
      if (CORE.scene.fog && CORE.scene.fog.isFogExp2) {
        CORE.scene.fog.color.setHex(m.fogColor);
        CORE.scene.fog.density = m.fogDensity;
      } else {
        CORE.scene.fog = new THREE.FogExp2(m.fogColor, m.fogDensity);
      }
    }

    const elev = typeof m.sunElevation === 'number' ? m.sunElevation : (m.isDaylight ? 45 : 24);
    const azim = typeof m.sunAzimuth === 'number' ? m.sunAzimuth : 150;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    _sunDir.setFromSphericalCoords(1, phi, theta).normalize();

    if (CORE.sky) {
      CORE.sky.visible = !!m.isDaylight;
      const su = CORE.sky.material && CORE.sky.material.uniforms;
      if (su && m.isDaylight) {
        if (su.turbidity) su.turbidity.value = m.skyTurbidity !== undefined ? m.skyTurbidity : 4.0;
        if (su.rayleigh) su.rayleigh.value = m.skyRayleigh !== undefined ? m.skyRayleigh : 1.5;
        if (su.mieCoefficient) su.mieCoefficient.value = m.skyMie !== undefined ? m.skyMie : 0.005;
        if (su.mieDirectionalG) su.mieDirectionalG.value = m.skyMieG !== undefined ? m.skyMieG : 0.8;
        if (su.sunPosition) su.sunPosition.value.copy(_sunDir).multiplyScalar(400);
      }
    }

    if (CORE.hemiLight) {
      CORE.hemiLight.color.setHex(m.hemiSky);
      CORE.hemiLight.groundColor.setHex(m.hemiGround);
    }
    if (CORE.sunLight) {
      CORE.sunLight.color.setHex(m.sunColor);
    }
    const targetHdri = m.hdri || (m.isDaylight ? 'day_clear' : 'night_station');
    if (LRT.Materials) {
      LRT.Materials.uGlobals.uFogHazeColor.value.setHex(m.fogColor);
      LRT.Materials.uGlobals.uWetness.value = m.wetness;
      if (typeof LRT.Materials.setEnvironmentTexture === 'function') {
        LRT.Materials.setEnvironmentTexture(targetHdri, CORE.scene, CORE.renderer);
        _currentEnvHdriKey = targetHdri;
      }
    }

    if (CORE.camera) {
      CORE.camera.far = _computeMoodFar(moodKey, m);
      CORE.camera.updateProjectionMatrix();
      updateFrustum();
    }

    _hasShadowTarget = false;
    markShadowDirty();

    if (LRT.Station && typeof LRT.Station.setMood === 'function') {
      LRT.Station.setMood(moodKey);
    }
    if (LRT.Audio) {
      if (moodKey === 'MONSOON_OVERCAST' && CORE.gameState !== C.STATES.MENU) {
        if (typeof LRT.Audio.startLoop === 'function') LRT.Audio.startLoop('rain_loop', 0.28, 0.9, 1.0);
      } else if (typeof LRT.Audio.stopLoop === 'function') {
        LRT.Audio.stopLoop('rain_loop', 0.6);
      }
    }
    if (LRT.PlayerUI && typeof LRT.PlayerUI.syncLightingUi === 'function') {
      LRT.PlayerUI.syncLightingUi(moodKey, m);
    }

    applyBrightness();
  }

  function lerpMoodLighting(fromKey, toKey, rawT) {
    const validFrom = (fromKey && fromKey in C.MOODS) ? fromKey : (CORE.currentLightingKey || 'DAYLIGHT_CLEAR');
    const validTo = (toKey && toKey in C.MOODS) ? toKey : validFrom;
    const mA = C.MOODS[validFrom] || C.MOODS.DAYLIGHT_CLEAR;
    const mB = C.MOODS[validTo] || mA;

    const c = rawT <= 0 ? 0.0 : (rawT >= 1 ? 1.0 : rawT);
    const s = c * c * (3.0 - 2.0 * c);

    const dayA = mA.isDaylight ? 1.0 : 0.0;
    const dayB = mB.isDaylight ? 1.0 : 0.0;
    const dayBlend = dayA + (dayB - dayA) * s;

    const tubeA = mA.tubeIntensity !== undefined ? mA.tubeIntensity : 0.72;
    const tubeB = mB.tubeIntensity !== undefined ? mB.tubeIntensity : 0.72;
    const lampA = mA.streetLampIntensity !== undefined ? mA.streetLampIntensity : (mA.isDaylight ? 0.0 : 2.0);
    const lampB = mB.streetLampIntensity !== undefined ? mB.streetLampIntensity : (mB.isDaylight ? 0.0 : 2.0);
    const envA = mA.envIntensity !== undefined ? mA.envIntensity : (mA.isDaylight ? 1.0 : 0.62);
    const envB = mB.envIntensity !== undefined ? mB.envIntensity : (mB.isDaylight ? 1.0 : 0.62);
    const expA = mA.exposure !== undefined ? mA.exposure : 1.05;
    const expB = mB.exposure !== undefined ? mB.exposure : 1.05;
    const bloomA = mA.bloomStrength !== undefined ? mA.bloomStrength : (mA.isDaylight ? 0.24 : 0.42);
    const bloomB = mB.bloomStrength !== undefined ? mB.bloomStrength : (mB.isDaylight ? 0.24 : 0.42);
    const wetA = mA.wetness !== undefined ? mA.wetness : 0.5;
    const wetB = mB.wetness !== undefined ? mB.wetness : 0.5;

    const hdriA = mA.hdri || (mA.isDaylight ? 'day_clear' : 'night_station');
    const hdriB = mB.hdri || (mB.isDaylight ? 'day_clear' : 'night_station');
    let envBase = envA + (envB - envA) * s;
    if (hdriA !== hdriB) {
      const midDelta = (s - 0.5) / 0.16;
      const envDip = 1.0 - 0.60 * Math.exp(-midDelta * midDelta);
      envBase *= envDip;
    }

    baseMood.isDaylight = dayBlend >= 0.5;
    baseMood.daylightBlend = dayBlend;
    baseMood.hemiIntensity = mA.hemiIntensity + (mB.hemiIntensity - mA.hemiIntensity) * s;
    baseMood.sunIntensity = mA.sunIntensity + (mB.sunIntensity - mA.sunIntensity) * s;
    baseMood.fogColor.copy(_lerpFogA.setHex(mA.fogColor)).lerp(_lerpFogB.setHex(mB.fogColor), s);
    baseMood.fogDensity = mA.fogDensity + (mB.fogDensity - mA.fogDensity) * s;
    baseMood.tubeIntensity = tubeA + (tubeB - tubeA) * s;
    baseMood.streetLampIntensity = lampA + (lampB - lampA) * s;
    baseMood.envIntensity = envBase;
    baseMood.exposure = expA + (expB - expA) * s;
    baseMood.bloomStrength = bloomA + (bloomB - bloomA) * s;
    baseMood.wetness = wetA + (wetB - wetA) * s;

    const elevA = typeof mA.sunElevation === 'number' ? mA.sunElevation : (mA.isDaylight ? 45 : 24);
    const elevB = typeof mB.sunElevation === 'number' ? mB.sunElevation : (mB.isDaylight ? 45 : 24);
    const azimA = typeof mA.sunAzimuth === 'number' ? mA.sunAzimuth : 150;
    const azimB = typeof mB.sunAzimuth === 'number' ? mB.sunAzimuth : 150;
    let dAz = azimB - azimA;
    if (dAz > 180) dAz -= 360;
    else if (dAz < -180) dAz += 360;
    const azim = azimA + dAz * s;
    const elev = elevA + (elevB - elevA) * s;
    const theta = THREE.MathUtils.degToRad(azim);
    _sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), theta).normalize();

    if (CORE.sky) {
      const su = CORE.sky.material && CORE.sky.material.uniforms;
      if (!mA.isDaylight && !mB.isDaylight) {
        CORE.sky.visible = false;
      } else {
        const skyVisible = (mA.isDaylight && mB.isDaylight)
          ? true
          : (mA.isDaylight ? (s < 0.78) : (s >= 0.22));
        CORE.sky.visible = skyVisible;
        if (su && skyVisible) {
          const skyElevA = mA.isDaylight ? elevA : -8.0;
          const skyElevB = mB.isDaylight ? elevB : -8.0;
          const skyElev = skyElevA + (skyElevB - skyElevA) * s;
          _skySunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - skyElev), theta).normalize();

          const turbA = mA.skyTurbidity !== undefined ? mA.skyTurbidity : (mA.isDaylight ? 4.0 : 2.0);
          const turbB = mB.skyTurbidity !== undefined ? mB.skyTurbidity : (mB.isDaylight ? 4.0 : 2.0);
          const rayA = mA.isDaylight ? (mA.skyRayleigh !== undefined ? mA.skyRayleigh : 1.5) : 0.05;
          const rayB = mB.isDaylight ? (mB.skyRayleigh !== undefined ? mB.skyRayleigh : 1.5) : 0.05;
          const mieA = mA.skyMie !== undefined ? mA.skyMie : 0.005;
          const mieB = mB.skyMie !== undefined ? mB.skyMie : 0.005;
          const mieGA = mA.skyMieG !== undefined ? mA.skyMieG : 0.8;
          const mieGB = mB.skyMieG !== undefined ? mB.skyMieG : 0.8;

          if (su.turbidity) su.turbidity.value = turbA + (turbB - turbA) * s;
          if (su.rayleigh) su.rayleigh.value = rayA + (rayB - rayA) * s;
          if (su.mieCoefficient) su.mieCoefficient.value = mieA + (mieB - mieA) * s;
          if (su.mieDirectionalG) su.mieDirectionalG.value = mieGA + (mieGB - mieGA) * s;
          if (su.sunPosition) su.sunPosition.value.copy(_skySunDir).multiplyScalar(400);
        }
      }
    }

    if (CORE.hemiLight) {
      CORE.hemiLight.color.copy(_lerpHemiSkyA.setHex(mA.hemiSky)).lerp(_lerpHemiSkyB.setHex(mB.hemiSky), s);
      CORE.hemiLight.groundColor.copy(_lerpHemiGndA.setHex(mA.hemiGround)).lerp(_lerpHemiGndB.setHex(mB.hemiGround), s);
    }
    if (CORE.sunLight) {
      CORE.sunLight.color.copy(_lerpSunColA.setHex(mA.sunColor)).lerp(_lerpSunColB.setHex(mB.sunColor), s);
    }

    if (LRT.Materials) {
      LRT.Materials.uGlobals.uWetness.value = baseMood.wetness;
      LRT.Materials.uGlobals.uFogHazeColor.value.copy(baseMood.fogColor);
      if (typeof LRT.Materials.setEnvironmentTexture === 'function') {
        const targetHdri = (hdriA === hdriB || s < 0.50) ? hdriA : hdriB;
        if (targetHdri !== _currentEnvHdriKey || (CORE.scene && !CORE.scene.environment)) {
          LRT.Materials.setEnvironmentTexture(targetHdri, CORE.scene, CORE.renderer);
          _currentEnvHdriKey = targetHdri;
        }
      }
    }

    if (CORE.camera) {
      const farA = _computeMoodFar(validFrom, mA);
      const farB = _computeMoodFar(validTo, mB);
      const nextFar = farA + (farB - farA) * s;
      if (Math.abs(CORE.camera.far - nextFar) > 0.25) {
        CORE.camera.far = nextFar;
        CORE.camera.updateProjectionMatrix();
        updateFrustum();
      }
    }

    CORE.isMoodLerping = true;
    _moodBlendOut.active = true;
    _moodBlendOut.fromKey = validFrom;
    _moodBlendOut.toKey = validTo;
    _moodBlendOut.t = s;
    _moodBlendOut.daylightBlend = dayBlend;
    _moodBlendOut.tubeIntensity = baseMood.tubeIntensity;
    _moodBlendOut.streetLampIntensity = baseMood.streetLampIntensity;
    _moodBlendOut.wetness = baseMood.wetness;

    applyBrightness();
    return _moodBlendOut;
  }

  function getMoodBlendState() {
    return _moodBlendOut;
  }

  async function warmupAllVariants() {
    if (!CORE.renderer || !CORE.scene || !CORE.camera) return;

    const savedMoodKey = CORE.currentLightingKey || 'DAYLIGHT_CLEAR';
    const warmupGroup = new THREE.Group();
    warmupGroup.name = '__lrt_variant_warmup__';
    const tempGeos = [];
    const tempMats = [];

    // 1. Pre-bake PMREM cubemaps for every loaded HDRI so mid-game station/mood swaps have zero hitch
    if (LRT.Materials && typeof LRT.Materials.setEnvironmentTexture === 'function') {
      const loaderStats = (LRT.AssetLoader && typeof LRT.AssetLoader.getStats === 'function') ? LRT.AssetLoader.getStats() : null;
      const hdriKeys = (loaderStats && Array.isArray(loaderStats.hdriKeys) && loaderStats.hdriKeys.length)
        ? loaderStats.hdriKeys
        : ['day_clear', 'day_overcast', 'golden_dusk', 'night_station'];
      for (let i = 0; i < hdriKeys.length; i++) {
        try {
          LRT.Materials.setEnvironmentTexture(hdriKeys[i], CORE.scene, CORE.renderer);
        } catch (_) {}
      }
    }

    // 2. Mount late-station GLTF props (e.g. Barrel_01 used in Harjamukti) + station materials + skin shader variants
    try {
      const camPos = CORE.camera.position;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(CORE.camera.quaternion);
      const anchor = camPos.clone().addScaledVector(forward, 6.0);

      if (LRT.AssetLoader && typeof LRT.AssetLoader.instantiateModel === 'function') {
        const lateProps = ['Barrel_01', 'portable_generator', 'ammo_box', 'medical_box', 'old_military_crate', 'mounted_fluorescent_lights'];
        for (let i = 0; i < lateProps.length; i++) {
          const inst = LRT.AssetLoader.instantiateModel(lateProps[i]);
          if (inst) {
            inst.position.copy(anchor);
            inst.traverse((ch) => {
              if (ch.isMesh) ch.frustumCulled = false;
            });
            warmupGroup.add(inst);
          }
        }
      }

      const swatchGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
      tempGeos.push(swatchGeo);

      if (LRT.Materials && LRT.Materials.mats) {
        for (const key in LRT.Materials.mats) {
          const mat = LRT.Materials.mats[key];
          if (mat && mat.isMaterial) {
            const m = new THREE.Mesh(swatchGeo, mat);
            m.position.copy(anchor);
            m.frustumCulled = false;
            warmupGroup.add(m);
          }
        }
      }

      if (LRT.Weapons && typeof LRT.Weapons.warmupSkins === 'function') {
        LRT.Weapons.warmupSkins(warmupGroup, anchor);
      } else if (C.WEAPON_SKINS) {
        for (const skinKey in C.WEAPON_SKINS) {
          const sk = C.WEAPON_SKINS[skinKey];
          if (!sk) continue;
          const skinMat = new THREE.MeshPhysicalMaterial({
            color: sk.primaryColor || '#5c6676',
            roughness: sk.primaryRoughness !== undefined ? sk.primaryRoughness : 0.3,
            metalness: sk.primaryMetalness !== undefined ? sk.primaryMetalness : 0.6,
            clearcoat: sk.primaryClearcoat !== undefined ? sk.primaryClearcoat : 0.2
          });
          tempMats.push(skinMat);
          const sm = new THREE.Mesh(swatchGeo, skinMat);
          sm.position.copy(anchor);
          sm.frustumCulled = false;
          warmupGroup.add(sm);
        }
      }

      CORE.scene.add(warmupGroup);

      // Snapshot & force all scene groups/meshes temporarily visible & unculled so every hidden Group (viaduct/train/chunks) & GLTF shader compiles at boot
      const restoredVis = [];
      CORE.scene.traverse((obj) => {
        if (!obj || obj === CORE.scene || obj.isLight || obj.isCamera || obj.userData?.isShadowProxy) return;
        if (obj.isMesh || !obj.visible) {
          restoredVis.push({ obj, vis: obj.visible, fc: obj.frustumCulled });
          obj.visible = true;
          if (obj.isMesh) obj.frustumCulled = false;
        }
      });
      try {
        if (typeof CORE.renderer.compileAsync === 'function') {
          await CORE.renderer.compileAsync(CORE.scene, CORE.camera);
        } else {
          CORE.renderer.compile(CORE.scene, CORE.camera);
        }
        // Also execute one live render pass through EffectComposer while all objects/groups
        // are unculled & visible so half-float (srgb-linear, samples=0) shaders & InstancedMeshes compile at boot.
        renderFrame();
      } finally {
        for (let i = 0; i < restoredVis.length; i++) {
          const rec = restoredVis[i];
          rec.obj.visible = rec.vis;
          rec.obj.frustumCulled = rec.fc;
        }
      }
    } finally {
      CORE.scene.remove(warmupGroup);
      for (let i = 0; i < tempGeos.length; i++) tempGeos[i].dispose();
      for (let i = 0; i < tempMats.length; i++) tempMats[i].dispose();

      // Restore original mood HDRI & mark shadow map dirty for the real menu/first frame
      const m = C.MOODS[savedMoodKey] || C.MOODS.DAYLIGHT_CLEAR;
      if (LRT.Materials && typeof LRT.Materials.setEnvironmentTexture === 'function') {
        LRT.Materials.setEnvironmentTexture(m.hdri || (m.isDaylight ? 'day_clear' : 'night_station'), CORE.scene, CORE.renderer);
      }
      markShadowDirty();
    }
  }

  function setLightingMode(key) {
    const validKey = (key && key in C.MOODS) ? key : 'DAYLIGHT_CLEAR';
    CORE.lightingLockedByUser = true;
    CORE.isMoodLerping = false;
    _moodBlendOut.active = false;
    CORE.currentLightingKey = validKey;
    applyMoodLighting(null, { moodKey: validKey });
    return validKey;
  }

  function cycleLightingMode() {
    CORE.lightingLockedByUser = true;
    const cycle = (C.LIGHTING_CYCLE && C.LIGHTING_CYCLE.length)
      ? C.LIGHTING_CYCLE
      : ['DAYLIGHT_CLEAR', 'DAYLIGHT_OVERCAST', 'GOLDEN_DUSK', 'BLACKOUT_EMERGENCY', 'CRIMSON_BLOOD_MOON'];
    const idx = cycle.indexOf(CORE.currentLightingKey);
    const nextKey = cycle[(idx + 1) % cycle.length];
    setLightingMode(nextKey);
    const m = C.MOODS[nextKey];
    if (CORE.gameState !== STATES.MENU && LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
      LRT.PlayerUI.setNotice(`LIGHTING: ${m ? m.name.toUpperCase() : nextKey}`, m && m.isDaylight ? '#38bdf8' : '#e0b422');
    }
    return nextKey;
  }

  function getLightingMode() {
    return CORE.currentLightingKey;
  }

  function updateMenuCamera(t) {
    if (!CORE.camera) return;
    const drift = t * 0.12;
    const camZ = -4.5 + Math.cos(drift * 0.65) * 2.2;
    CORE.camera.position.set(
      0.95 + Math.sin(drift) * 0.35,
      2.20 + Math.sin(drift * 1.1) * 0.16,
      camZ
    );
    _menuLookAt.set(
      -1.65 + Math.sin(drift * 0.7) * 0.25,
      1.75,
      camZ - 20.0
    );
    CORE.camera.lookAt(_menuLookAt);
    if (CORE.sky) CORE.sky.position.copy(CORE.camera.position);
    updateSunTracking(0, -10);
  }

  CORE.initPostProcessing = initPostProcessing;
  CORE.renderFrame = renderFrame;
  CORE.applyQuality = applyQuality;
  CORE.applyRenderResolution = applyRenderResolution;
  CORE.setRenderScale = setRenderScale;
  CORE.applyRenderScale = setRenderScale;
  CORE.setShadowsEnabled = setShadowsEnabled;
  CORE.setBloomEnabled = setBloomEnabled;
  CORE.setAoMode = setAoMode;
  CORE.setFpsCounterEnabled = setFpsCounterEnabled;
  CORE.setDifficulty = setDifficulty;
  CORE.getSettings = getSettings;
  CORE.saveSettings = saveSettings;
  CORE.loadSettings = loadSettings;
  CORE.markShadowDirty = markShadowDirty;
  CORE.tickShadowCache = tickShadowCache;
  CORE.updateFrustum = updateFrustum;
  CORE.getFrustum = getFrustum;
  CORE.warmupAllVariants = warmupAllVariants;
  CORE.syncMenuLights = syncMenuLights;
  CORE.updateSunTracking = updateSunTracking;
  CORE.applyBrightness = applyBrightness;
  CORE.setBrightness = setBrightness;
  CORE.getBrightness = getBrightness;
  CORE.applyMoodLighting = applyMoodLighting;
  CORE.lerpMoodLighting = lerpMoodLighting;
  CORE.getMoodBlendState = getMoodBlendState;
  CORE.setLightingMode = setLightingMode;
  CORE.cycleLightingMode = cycleLightingMode;
  CORE.getLightingMode = getLightingMode;
  CORE.updateMenuCamera = updateMenuCamera;
})(window.LRT = window.LRT || {});
