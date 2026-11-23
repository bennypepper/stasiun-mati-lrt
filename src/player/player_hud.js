(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const PL = (I.player = I.player || {});

  const C = LRT.Config;

  const dom = (PL.dom = PL.dom || {});
  let subtitleTimer = 0;
  let lastSubtitleId = '';
  let lastSubtitleEn = '';
  let currentBrightness = 1.0;

  const setMenuSubpanel = (...args) => PL.setMenuSubpanel && PL.setMenuSubpanel(...args);
  const setPauseSubpanel = (...args) => PL.setPauseSubpanel && PL.setPauseSubpanel(...args);
  const renderPauseFieldLogs = (...args) => PL.renderPauseFieldLogs && PL.renderPauseFieldLogs(...args);
  const openDocViewer = (...args) => PL.openDocViewer && PL.openDocViewer(...args);
  const closeDocViewer = (...args) => PL.closeDocViewer && PL.closeDocViewer(...args);
  const showFieldLog = (...args) => PL.showFieldLog && PL.showFieldLog(...args);
  const hideFieldLog = (...args) => PL.hideFieldLog && PL.hideFieldLog(...args);
  const syncFastTravelAtmosphereUi = (...args) => PL.syncFastTravelAtmosphereUi && PL.syncFastTravelAtmosphereUi(...args);
  const syncFastTravelAvailability = (...args) => PL.syncFastTravelAvailability && PL.syncFastTravelAvailability(...args);
  const openFastTravelModal = (...args) => PL.openFastTravelModal && PL.openFastTravelModal(...args);
  const closeFastTravelModal = (...args) => PL.closeFastTravelModal && PL.closeFastTravelModal(...args);
  const openTutorialCompleteModal = (...args) => PL.openTutorialCompleteModal && PL.openTutorialCompleteModal(...args);
  const closeTutorialCompleteModal = (...args) => PL.closeTutorialCompleteModal && PL.closeTutorialCompleteModal(...args);
  const showScreen = (...args) => PL.showScreen && PL.showScreen(...args);
  const refreshContinueButton = (...args) => PL.refreshContinueButton && PL.refreshContinueButton(...args);

  const WAYPOINT_POOL_SIZE = 6;
  const PING_DURATION = 2.5;
  const PING_COOLDOWN = 10.0;
  const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const hudState = {
    pingTimer: 0,
    pingCooldown: 0,
    pingDuration: PING_DURATION,
    pingCooldownMax: PING_COOLDOWN
  };
  const _wpPool = [];
  const _wpList = [];
  const _wpProjVec = new THREE.Vector3();
  const _wpCamForward = new THREE.Vector3();
  const _wpCamPos = new THREE.Vector3();
  const _wpLabelCache = new Map();
  let _pingCacheVisible = false;
  let _pingCacheOpacity = null;
  let _pingCacheX = null;
  let _pingCacheBearing = null;
  let _pingCacheLabel = null;
  let _pingCacheDist = null;
  let _cachedVw = window.innerWidth || 1280;
  let _cachedVh = window.innerHeight || 720;
  window.addEventListener('resize', () => {
    _cachedVw = window.innerWidth || 1280;
    _cachedVh = window.innerHeight || 720;
  });

  const SKIN_LABELS = {
    tni_digital_forest: 'TNI FOREST',
    kai_brass_navy: 'KAI NAVY',
    carbon_crimson: 'CARBON CRIMSON',
    evac_gold_24k: '24K EVAC GOLD'
  };

  PL.dom = dom;

  function ensureWaypointPool() {
    const container = dom['hud-waypoints'];
    if (!container || _wpPool.length >= WAYPOINT_POOL_SIZE) return;
    while (_wpPool.length < WAYPOINT_POOL_SIZE) {
      const el = document.createElement('div');
      el.className = 'hud-wp wp-objective hidden';

      const diamond = document.createElement('div');
      diamond.className = 'wp-diamond';

      const info = document.createElement('div');
      info.className = 'wp-info';

      const labelEl = document.createElement('span');
      labelEl.className = 'wp-label';

      const metaEl = document.createElement('span');
      metaEl.className = 'wp-meta';

      const distEl = document.createElement('span');
      distEl.className = 'wp-dist';

      const elevEl = document.createElement('span');
      elevEl.className = 'wp-elev';

      metaEl.appendChild(distEl);
      metaEl.appendChild(elevEl);
      info.appendChild(labelEl);
      info.appendChild(metaEl);
      el.appendChild(diamond);
      el.appendChild(info);
      container.appendChild(el);

      _wpPool.push({
        el,
        diamond,
        labelEl,
        distEl,
        elevEl,
        visible: false,
        lastType: 'wp-objective',
        lastOffscreen: false,
        lastLabel: null,
        lastDist: null,
        lastElev: null,
        lastColor: '',
        lastOpacity: null,
        lastX: null,
        lastY: null,
        lastAnchor: null
      });
    }
  }

  function cacheDom() {
    const ids = [
      'damage-vignette', 'hud', 'hud-waypoints', 'hud-mode-badge', 'hud-station-code',
      'hud-station-name', 'hud-station-sub', 'objective-title', 'objective-detail',
      'hud-key-items', 'hud-ping-compass', 'ping-chevron', 'ping-bearing', 'ping-label', 'ping-dist',
      'fps-readout', 'scope-overlay', 'crosshair', 'hitmarker', 'hud-notice', 'interact-prompt',
      'pill-stance',
      'interact-label', 'hud-subtitle-box', 'subtitle-speaker', 'subtitle-text-id', 'subtitle-text-en',
      'hud-log-banner', 'log-title', 'log-body',
      'document-viewer-modal', 'doc-viewer-sheet', 'doc-viewer-kicker', 'doc-viewer-submeta',
      'doc-viewer-stamp', 'doc-viewer-title', 'doc-viewer-body', 'btn-doc-close-x', 'btn-doc-close',
      'vitals-card', 'hp-value', 'hp-max', 'hp-bar-fill', 'armor-row', 'armor-value', 'armor-bar-fill',
      'cheat-console', 'cheat-input', 'btn-cheat-apply', 'cheat-status-row',
      'cheat-pill-god', 'cheat-god-timer', 'cheat-god-bar', 'cheat-pill-sprint',
      'pill-flashlight', 'pill-lighting', 'pill-hud',
      'pill-mute', 'pill-fast-travel', 'weapon-silhouette', 'weapon-name', 'weapon-skin-tag',
      'ammo-mag', 'ammo-reserve', 'weapon-slots', 'weapon-caliber-label',
      'menu-overlay', 'pause-overlay', 'gameover-overlay', 'gameover-stats',
      'tutorial-complete-overlay', 'btn-tut-start-survival', 'btn-tut-back-menu',
      'fast-travel-modal', 'ft-active-meta', 'ft-atmos-group', 'btn-fast-travel-close',
      'ft-station-list', 'ft-zones-sub', 'ft-zone-grid', 'btn-pause-fast-travel',
      'victory-credits', 'credits-viewport', 'btn-credits-pause', 'btn-credits-skip', 'btn-credits-toggle',
      'btn-start-survival', 'btn-start-exploration', 'btn-menu-settings', 'btn-menu-controls', 'btn-exit-game',
      'btn-continue', 'continue-sub', 'btn-start-tutorial', 'new-game-title',
      'btn-menu-lighting', 'btn-pause-lighting',
      'menu-settings-panel', 'menu-controls-panel', 'brightness-slider', 'brightness-readout',
      'pause-brightness-slider', 'pause-brightness-readout',
      'btn-resume', 'btn-restart-mode', 'btn-back-menu', 'btn-retry', 'btn-gameover-menu',
      'btn-menu-mute', 'btn-pause-mute',
      'btn-menu-subtitles', 'btn-pause-subtitles', 'menu-sublang-group', 'pause-sublang-group',
      'menu-difficulty-group', 'pause-difficulty-group',
      'menu-atmosphere-group', 'pause-atmosphere-group',
      'menu-quality-group', 'pause-quality-group',
      'menu-resscale-group', 'pause-resscale-group',
      'btn-menu-shadows', 'btn-pause-shadows',
      'btn-menu-bloom', 'btn-pause-bloom',
      'menu-ao-group', 'pause-ao-group',
      'btn-menu-fps', 'btn-pause-fps',
      'btn-menu-dismember', 'btn-pause-dismember',
      'menu-waypoint-group', 'pause-waypoint-group',
      'menu-main-view', 'btn-menu-settings-back', 'btn-menu-controls-back',
      'pause-main-view', 'btn-pause-settings', 'btn-pause-controls', 'btn-pause-logs',
      'pause-settings-panel', 'pause-controls-panel', 'pause-logs-panel',
      'btn-pause-settings-back', 'btn-pause-controls-back', 'btn-pause-logs-back',
      'pause-logs-nav-sub'
    ];
    for (const id of ids) {
      dom[id] = document.getElementById(id);
    }
    ensureWaypointPool();
  }

  function formatBrightnessLabel(val) {
    const pct = Math.round(val * 100);
    let tag = 'STANDARD';
    if (val <= 0.7) tag = 'DEEP HORROR';
    else if (val <= 1.05) tag = 'DARK HORROR';
    else if (val <= 1.35) tag = 'ELEVATED';
    else tag = 'BRIGHT';
    return `${pct}% ${tag}`;
  }

  function syncBrightnessUi(val) {
    const num = typeof val === 'number' && !Number.isNaN(val) ? val : currentBrightness;
    currentBrightness = Math.max(0.4, Math.min(1.8, num));
    if (dom['brightness-slider']) dom['brightness-slider'].value = String(currentBrightness);
    if (dom['pause-brightness-slider']) dom['pause-brightness-slider'].value = String(currentBrightness);
    const label = formatBrightnessLabel(currentBrightness);
    if (dom['brightness-readout']) dom['brightness-readout'].textContent = label;
    if (dom['pause-brightness-readout']) dom['pause-brightness-readout'].textContent = label;
  }

  function applyBrightness(val) {
    const parsed = parseFloat(val);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(0.4, Math.min(1.8, parsed));
    syncBrightnessUi(clamped);
    if (LRT.Main && typeof LRT.Main.setBrightness === 'function') {
      LRT.Main.setBrightness(clamped);
    }
  }

  function applySettingsCategoryFilter(panelEl, catKey) {
    if (!panelEl) return;
    const activeCat = catKey || 'all';
    panelEl.querySelectorAll('[data-settings-cat]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.settingsCat === activeCat);
    });
    panelEl.querySelectorAll('.setting-group[data-cat]').forEach((grp) => {
      grp.classList.toggle('hidden', activeCat !== 'all' && grp.dataset.cat !== activeCat);
    });
  }

  // Menu/Pause subpanels moved to src/player/hud_overlays.js.

  function setNotice(text, color) {
    if (!dom['hud-notice']) return;
    dom['hud-notice'].textContent = text;
    dom['hud-notice'].style.borderColor = color || 'rgba(224,180,34,0.65)';
    dom['hud-notice'].style.opacity = '1';
    PL.state.noticeTimer = 2.6;
  }

  function showSubtitle(speaker, textId, textEn, durationSec) {
    if (typeof speaker === 'object' && speaker !== null) {
      const entry = speaker;
      durationSec = textId ?? entry.duration_sec;
      textEn = entry.subtitle_en;
      textId = entry.subtitle_id;
      speaker = entry.speaker;
    }

    lastSubtitleId = textId || '';
    lastSubtitleEn = textEn || '';

    const subOn = (I.core && typeof I.core.subtitlesEnabled === 'boolean') ? I.core.subtitlesEnabled : true;
    if (!subOn) {
      hideSubtitle();
      return;
    }

    const box = dom['hud-subtitle-box'];
    if (!box) return;

    const spEl = dom['subtitle-speaker'];
    if (spEl) {
      const sp = String(speaker || '').trim().toUpperCase();
      let badgeText = sp;
      let badgeClass = 'speaker-occ';
      if (sp.includes('OCC') || sp.includes('DISPATCH') || sp === 'SARAH') {
        badgeText = 'Sarah';
        badgeClass = 'speaker-occ';
      } else if (sp.includes('PLAYER') || sp.includes('GAGAK') || sp.includes('G2') || sp === 'ARYA') {
        badgeText = 'Arya';
        badgeClass = 'speaker-player';
      } else if (sp.includes('SYSTEM') || sp.includes('ANN') || sp.includes('PA') || sp.includes('LRT')) {
        badgeText = 'PA Stasiun';
        badgeClass = 'speaker-ann';
      }
      spEl.textContent = badgeText;
      spEl.className = `badge ${badgeClass}`;
    }

    const subLang = (I.core && I.core.subtitleLang === 'en') ? 'en' : 'id';
    const activeText = subLang === 'en' ? (lastSubtitleEn || lastSubtitleId) : (lastSubtitleId || lastSubtitleEn);

    if (dom['subtitle-text-id']) {
      dom['subtitle-text-id'].textContent = activeText;
    }

    if (dom['subtitle-text-en']) {
      dom['subtitle-text-en'].textContent = '';
      dom['subtitle-text-en'].classList.add('hidden');
    }

    box.classList.remove('hidden');
    box.style.opacity = '1';
    subtitleTimer = Math.max(1.0, typeof durationSec === 'number' ? durationSec : 6.0);
  }

  function hideSubtitle() {
    subtitleTimer = 0;
    const box = dom['hud-subtitle-box'];
    if (box) {
      box.style.opacity = '0';
      box.classList.add('hidden');
    }
  }

  // Field log viewer & Fast Travel moved to src/player/hud_overlays.js & src/player/fast_travel.js.

  function syncLightingUi(lightingKey, moodObj) {
    const key = lightingKey || 'DAYLIGHT_CLEAR';
    const labelMap = {
      DAYLIGHT_CLEAR: 'DAYLIGHT',
      DAYLIGHT_OVERCAST: 'OVERCAST',
      GOLDEN_DUSK: 'GOLDEN HOUR',
      AMBER_SUNSET: 'AMBER SUNSET',
      BLACKOUT_EMERGENCY: 'NIGHT BLACKOUT',
      CRIMSON_BLOOD_MOON: 'BLOOD MOON',
      MONSOON_OVERCAST: 'MONSOON NIGHT',
      TOXIC_SMOG: 'TOXIC SMOG',
      HAZY_DUSK: 'HAZY DUSK'
    };
    const shortMap = {
      DAYLIGHT_CLEAR: 'DAY',
      DAYLIGHT_OVERCAST: 'CLOUD',
      GOLDEN_DUSK: 'DUSK',
      AMBER_SUNSET: 'SUNSET',
      BLACKOUT_EMERGENCY: 'NIGHT',
      CRIMSON_BLOOD_MOON: 'BLOOD',
      MONSOON_OVERCAST: 'STORM',
      TOXIC_SMOG: 'SMOG',
      HAZY_DUSK: 'HAZE'
    };
    const btnText = labelMap[key] || (moodObj && moodObj.name) || key;
    const pillShort = shortMap[key] || 'DAY';
    const isDay = moodObj ? !!moodObj.isDaylight : (key.startsWith('DAY') || key.startsWith('GOLD') || key.startsWith('AMBER'));

    if (dom['btn-menu-lighting']) dom['btn-menu-lighting'].textContent = btnText;
    if (dom['btn-pause-lighting']) dom['btn-pause-lighting'].textContent = btnText;
    if (dom['pill-lighting']) {
      dom['pill-lighting'].textContent = `L Cahaya`;
      dom['pill-lighting'].classList.toggle('active', isDay);
    }
    syncFastTravelAtmosphereUi(key);
  }

  function toggleHud() {
    PL.state.hudHidden = !PL.state.hudHidden;
    if (dom.hud) dom.hud.classList.toggle('hud-minimal', PL.state.hudHidden);
    if (dom['pill-hud']) dom['pill-hud'].classList.toggle('active', !PL.state.hudHidden);
  }

  function syncTabGroup(groups, dataAttr, activeVal) {
    for (const g of groups) {
      if (!g) continue;
      g.querySelectorAll(`[data-${dataAttr}]`).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset[dataAttr] === activeVal);
      });
    }
  }

  function syncToggleButtons(btns, enabled, onLabel, offLabel, offClass) {
    const isOn = !!enabled;
    const label = isOn ? onLabel : offLabel;
    for (const btn of btns) {
      if (!btn) continue;
      btn.textContent = label;
      btn.classList.toggle(offClass, !isOn);
    }
  }

  function syncMuteUi() {
    const isMuted = LRT.Audio ? LRT.Audio.isMuted() : false;
    syncToggleButtons([dom['btn-menu-mute'], dom['btn-pause-mute']], !isMuted, 'ON', 'OFF', 'is-muted');
    if (dom['pill-mute']) {
      dom['pill-mute'].textContent = `M Suara`;
      dom['pill-mute'].classList.toggle('active', !isMuted);
    }
  }

  function syncQualityUi(tierKey) {
    syncTabGroup([dom['menu-quality-group'], dom['pause-quality-group']], 'quality', tierKey || 'balanced');
  }

  function syncDifficultyUi(diffKey) {
    syncTabGroup([dom['menu-difficulty-group'], dom['pause-difficulty-group']], 'difficulty', diffKey || 'medium');
  }

  function syncAtmosphereUi(mode) {
    const val = mode === 'daylight_outbreak' ? 'daylight_outbreak' : 'night_horror';
    syncTabGroup([dom['menu-atmosphere-group'], dom['pause-atmosphere-group']], 'atmosphere', val);
  }

  function syncResScaleUi(resKey) {
    syncTabGroup([dom['menu-resscale-group'], dom['pause-resscale-group']], 'resscale', resKey || 'floor_720');
  }

  function syncShadowsUi(enabled) {
    syncToggleButtons([dom['btn-menu-shadows'], dom['btn-pause-shadows']], enabled, 'ON', 'OFF', 'is-off');
  }

  function syncBloomUi(enabled) {
    syncToggleButtons([dom['btn-menu-bloom'], dom['btn-pause-bloom']], enabled, 'ON', 'OFF', 'is-off');
  }

  function syncAoUi(aoKey) {
    syncTabGroup([dom['menu-ao-group'], dom['pause-ao-group']], 'ao', aoKey || 'off');
  }

  function syncFpsUi(enabled) {
    const isOn = !!enabled;
    syncToggleButtons([dom['btn-menu-fps'], dom['btn-pause-fps']], isOn, 'ON', 'OFF', 'is-off');
    if (dom['fps-readout']) {
      dom['fps-readout'].classList.toggle('hidden', !isOn);
    }
  }

  function syncSubtitlesUi(enabled) {
    const isOn = enabled !== undefined ? !!enabled : true;
    syncToggleButtons([dom['btn-menu-subtitles'], dom['btn-pause-subtitles']], isOn, 'ON', 'OFF', 'is-off');
    if (!isOn) {
      hideSubtitle();
    }
  }

  function syncSubtitleLangUi(lang) {
    const val = lang === 'en' ? 'en' : 'id';
    syncTabGroup([dom['menu-sublang-group'], dom['pause-sublang-group']], 'sublang', val);
    if (subtitleTimer > 0 && dom['subtitle-text-id']) {
      dom['subtitle-text-id'].textContent = val === 'en' ? (lastSubtitleEn || lastSubtitleId) : (lastSubtitleId || lastSubtitleEn);
    }
  }

  function syncDismembermentUi(enabled) {
    const isOn = enabled !== undefined ? !!enabled : true;
    syncToggleButtons([dom['btn-menu-dismember'], dom['btn-pause-dismember']], isOn, 'ON', 'OFF', 'is-off');
  }

  function syncWaypointUi(mode) {
    let val = mode;
    if (val !== 'off' && val !== 'proximity' && val !== 'on') {
      val = (I.core && typeof I.core.getEffectiveWaypointMode === 'function')
        ? I.core.getEffectiveWaypointMode()
        : 'proximity';
    }
    syncTabGroup([dom['menu-waypoint-group'], dom['pause-waypoint-group']], 'waypoint', val);
  }

  function syncAllSettingsUi(settings) {
    const s = settings || {};
    syncDifficultyUi(s.difficultyKey || s.difficulty || 'medium');
    syncAtmosphereUi(s.atmosphereMode || 'night_horror');
    syncDismembermentUi(s.dismembermentEnabled !== undefined ? s.dismembermentEnabled : true);
    syncWaypointUi(s.effectiveWaypointMode || s.waypointMode);
    syncQualityUi(s.qualityKey || s.quality || 'balanced');
    syncResScaleUi(s.resScaleMode || s.resScale || 'floor_720');
    syncShadowsUi(s.shadowsEnabled !== undefined ? s.shadowsEnabled : (s.shadows !== undefined ? s.shadows : true));
    syncBloomUi(s.bloomEnabled !== undefined ? s.bloomEnabled : (s.bloom !== undefined ? s.bloom : true));
    syncAoUi(s.aoMode || s.ao || 'off');
    syncFpsUi(s.fpsCounterEnabled !== undefined ? s.fpsCounterEnabled : false);
    syncSubtitlesUi(s.subtitlesEnabled !== undefined ? s.subtitlesEnabled : true);
    syncSubtitleLangUi(s.subtitleLang || 'id');
    if (typeof s.brightness === 'number') {
      syncBrightnessUi(s.brightness);
    } else if (LRT.Main && typeof LRT.Main.getBrightness === 'function') {
      syncBrightnessUi(LRT.Main.getBrightness());
    } else {
      syncBrightnessUi(currentBrightness);
    }
    syncMuteUi();
  }

  // Credits roll logic moved to src/player/hud_overlays.js.

  function bindHudUiInputs() {
    if (dom['btn-menu-settings']) {
      dom['btn-menu-settings'].addEventListener('click', () => {
        const isOpen = dom['menu-settings-panel'] && !dom['menu-settings-panel'].classList.contains('hidden');
        setMenuSubpanel(isOpen ? null : 'settings');
      });
    }
    if (dom['btn-menu-controls']) {
      dom['btn-menu-controls'].addEventListener('click', () => {
        const isOpen = dom['menu-controls-panel'] && !dom['menu-controls-panel'].classList.contains('hidden');
        setMenuSubpanel(isOpen ? null : 'controls');
      });
    }
    if (dom['btn-menu-settings-back']) {
      dom['btn-menu-settings-back'].addEventListener('click', () => setMenuSubpanel(null));
    }
    if (dom['btn-menu-controls-back']) {
      dom['btn-menu-controls-back'].addEventListener('click', () => setMenuSubpanel(null));
    }
    if (dom['btn-pause-settings']) {
      dom['btn-pause-settings'].addEventListener('click', () => {
        const isOpen = dom['pause-settings-panel'] && !dom['pause-settings-panel'].classList.contains('hidden');
        setPauseSubpanel(isOpen ? null : 'settings');
      });
    }
    if (dom['btn-pause-controls']) {
      dom['btn-pause-controls'].addEventListener('click', () => {
        const isOpen = dom['pause-controls-panel'] && !dom['pause-controls-panel'].classList.contains('hidden');
        setPauseSubpanel(isOpen ? null : 'controls');
      });
    }
    if (dom['btn-pause-logs']) {
      dom['btn-pause-logs'].addEventListener('click', () => {
        const isOpen = dom['pause-logs-panel'] && !dom['pause-logs-panel'].classList.contains('hidden');
        setPauseSubpanel(isOpen ? null : 'logs');
      });
    }
    if (dom['btn-pause-settings-back']) {
      dom['btn-pause-settings-back'].addEventListener('click', () => setPauseSubpanel(null));
    }
    if (dom['btn-pause-controls-back']) {
      dom['btn-pause-controls-back'].addEventListener('click', () => setPauseSubpanel(null));
    }
    if (dom['btn-pause-logs-back']) {
      dom['btn-pause-logs-back'].addEventListener('click', () => setPauseSubpanel(null));
    }
    [dom['menu-settings-panel'], dom['pause-settings-panel']].forEach((panel) => {
      if (!panel) return;
      panel.addEventListener('click', (e) => {
        const catBtn = e.target.closest('[data-settings-cat]');
        if (catBtn) {
          applySettingsCategoryFilter(panel, catBtn.dataset.settingsCat);
        }
      });
    });
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.key === 'Escape') && !PL.state.docViewerOpen && !PL.state.cheatOpen && !PL.state.fastTravelOpen) {
        if (dom['menu-overlay'] && !dom['menu-overlay'].classList.contains('hidden') && dom['menu-overlay'].classList.contains('subview-open')) {
          e.preventDefault();
          e.stopPropagation();
          setMenuSubpanel(null);
        } else if (dom['pause-overlay'] && !dom['pause-overlay'].classList.contains('hidden') && dom['pause-overlay'].classList.contains('subview-open')) {
          e.preventDefault();
          e.stopPropagation();
          setPauseSubpanel(null);
        }
      }
    });
    [dom['brightness-slider'], dom['pause-brightness-slider']].forEach((slider) => {
      if (!slider) return;
      slider.addEventListener('input', (e) => applyBrightness(e.target.value));
      slider.addEventListener('change', (e) => applyBrightness(e.target.value));
    });
    if (dom['btn-credits-pause']) {
      dom['btn-credits-pause'].addEventListener('click', () => {
        if (creditsEnded || creditsCollapsed) return;
        creditsPaused = !creditsPaused;
        if (creditsPaused) {
          stopCreditsRoll();
          syncCreditsControlsUi();
        } else {
          startCreditsRoll(false);
        }
      });
    }
    if (dom['btn-credits-skip']) {
      dom['btn-credits-skip'].addEventListener('click', () => {
        if (creditsCollapsed) return;
        const vp = dom['credits-viewport'];
        if (creditsEnded) {
          startCreditsRoll(true);
          return;
        }
        stopCreditsRoll();
        if (vp) {
          const maxScroll = Math.max(0, vp.scrollHeight - vp.clientHeight);
          creditsScrollPos = maxScroll;
          vp.scrollTop = maxScroll;
        }
        creditsPaused = false;
        creditsEnded = true;
        syncCreditsControlsUi();
      });
    }
    if (dom['btn-credits-toggle']) {
      dom['btn-credits-toggle'].addEventListener('click', () => {
        creditsCollapsed = !creditsCollapsed;
        if (creditsCollapsed) {
          stopCreditsRoll();
          syncCreditsControlsUi();
        } else {
          startCreditsRoll(false);
        }
      });
    }
    if (dom['credits-viewport']) {
      dom['credits-viewport'].addEventListener('scroll', () => {
        const vp = dom['credits-viewport'];
        if (!vp) return;
        if (Math.abs(vp.scrollTop - creditsScrollPos) > 4) {
          creditsScrollPos = vp.scrollTop;
        }
      }, { passive: true });
    }
    if (dom['cheat-input']) {
      dom['cheat-input'].addEventListener('input', () => {
        if (PL.stripCheatInputNoise) PL.stripCheatInputNoise(dom['cheat-input']);
      });
    }
    if (dom['btn-cheat-apply']) {
      dom['btn-cheat-apply'].addEventListener('click', () => {
        const input = dom['cheat-input'];
        const raw = PL.stripCheatInputNoise ? PL.stripCheatInputNoise(input) : (input ? input.value : '');
        if (PL.closeCheatConsole) PL.closeCheatConsole(true);
        if (raw && raw.trim() && PL.executeCheat) PL.executeCheat(raw);
      });
    }
    if (dom['btn-doc-close-x']) {
      dom['btn-doc-close-x'].addEventListener('click', () => closeDocViewer(true));
    }
    if (dom['btn-doc-close']) {
      dom['btn-doc-close'].addEventListener('click', () => closeDocViewer(true));
    }
    if (dom['document-viewer-modal']) {
      dom['document-viewer-modal'].addEventListener('click', (e) => {
        if (e.target === dom['document-viewer-modal']) {
          closeDocViewer(true);
        }
      });
    }
    if (dom['btn-pause-fast-travel']) {
      dom['btn-pause-fast-travel'].addEventListener('click', () => {
        openFastTravelModal({ fromPause: true });
      });
    }
    syncFastTravelAvailability();
    if (dom['btn-fast-travel-close']) {
      dom['btn-fast-travel-close'].addEventListener('click', () => {
        closeFastTravelModal(true);
      });
    }
    if (dom['fast-travel-modal']) {
      dom['fast-travel-modal'].addEventListener('click', (e) => {
        if (e.target === dom['fast-travel-modal']) {
          closeFastTravelModal(true);
        }
      });
    }
    if (dom['ft-atmos-group']) {
      dom['ft-atmos-group'].addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ft-mood]');
        if (!btn) return;
        const moodKey = btn.dataset.ftMood;
        if (LRT.Main && typeof LRT.Main.setLightingMode === 'function') {
          LRT.Main.setLightingMode(moodKey);
        } else if (I.core && typeof I.core.setLightingMode === 'function') {
          I.core.setLightingMode(moodKey);
        }
        if (I.core && typeof I.core.requestPausedRender === 'function') {
          I.core.requestPausedRender();
        } else if (I.core && typeof I.core.renderFrame === 'function') {
          I.core.renderFrame();
        }
        syncFastTravelAtmosphereUi(moodKey);
        const moodObj = C.MOODS && C.MOODS[moodKey];
        setNotice(`LIGHTING: ${moodObj ? moodObj.name.toUpperCase() : moodKey}`, moodObj && moodObj.isDaylight ? '#38bdf8' : '#e0b422');
      });
    }
    if (dom['btn-tut-start-survival']) {
      dom['btn-tut-start-survival'].addEventListener('click', () => {
        closeTutorialCompleteModal();
        if (I.core && typeof I.core.endTutorial === 'function') {
          I.core.endTutorial('complete', { stayInGame: true });
        } else if (LRT.Main && typeof LRT.Main.startGame === 'function') {
          LRT.Main.startGame(C.MODES.SURVIVAL);
        }
      });
    }
    if (dom['btn-tut-back-menu']) {
      dom['btn-tut-back-menu'].addEventListener('click', () => {
        closeTutorialCompleteModal();
        if (I.core && typeof I.core.endTutorial === 'function') {
          I.core.endTutorial('complete');
        } else if (I.core && typeof I.core.backToMenu === 'function') {
          I.core.backToMenu();
        }
      });
    }
  }

  function update(dt, worldCtx) {
    if (!PL.refs.camera) return;

    // Update toast notice timer
    if (PL.state.noticeTimer > 0) {
      PL.state.noticeTimer -= dt;
      if (PL.state.noticeTimer <= 0 && dom['hud-notice']) {
        dom['hud-notice'].style.opacity = '0';
      }
    }

    // Subtitle timer (pauses while reading notes or paused so narrator subtitles resume in sync!)
    if (subtitleTimer > 0 && !PL.flags.paused && !(PL.state && PL.state.docViewerOpen)) {
      subtitleTimer -= dt;
      if (subtitleTimer <= 0) {
        hideSubtitle();
      }
    }

    // Field log toast timer
    if (PL.tickFieldLog) PL.tickFieldLog(dt);

    // Tactical Ping active window & cooldown timers
    if (!PL.flags.paused && !(PL.state && PL.state.docViewerOpen)) {
      if (hudState.pingTimer > 0) {
        hudState.pingTimer = Math.max(0, hudState.pingTimer - dt);
      }
      if (hudState.pingCooldown > 0) {
        hudState.pingCooldown = Math.max(0, hudState.pingCooldown - dt);
      }
    }

    PL.updatePhysics(dt, worldCtx);
  }

  function triggerTacticalPing(silentCooldown) {
    if (hudState.pingCooldown > 0) {
      if (!silentCooldown) {
        setNotice(`KOMPAS TAKTIS COOLDOWN (${Math.ceil(hudState.pingCooldown)}s)`, '#8b929a');
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('dry_fire', { gain: 0.25 });
        }
      }
      return { ok: false, cooldown: hudState.pingCooldown };
    }
    hudState.pingTimer = PING_DURATION;
    hudState.pingCooldown = PING_COOLDOWN;
    if (LRT.Audio && typeof LRT.Audio.play === 'function') {
      LRT.Audio.play('turnstile_beep', { gain: 0.34, pitchVar: 0.03 });
    }
    return { ok: true, duration: PING_DURATION, cooldown: PING_COOLDOWN };
  }

  function hidePingCompass() {
    if (_pingCacheVisible) {
      _pingCacheVisible = false;
      _pingCacheOpacity = null;
      if (dom['hud-ping-compass']) dom['hud-ping-compass'].classList.add('hidden');
    }
  }

  const WEAPON_SILHOUETTES = {
    1: {
      caliber: '9mm',
      svg: '<svg class="wsil-svg" viewBox="0 0 88 38" fill="currentColor"><path d="M12 8h54l4 3v5l-3 2H44l-2 4h-9l-3 12H18l5-16h-5l-4-3V9zM35 18h7l-1.5 3.5h-6.5z"/></svg>'
    },
    2: {
      caliber: '5.56mm',
      svg: '<svg class="wsil-svg" viewBox="0 0 112 38" fill="currentColor"><path d="M4 13h16l5-4h38l5 3h36v4H72l-2 4h-12l3 14h-7l-3.5-13H40l-3 10h-7l2.5-10H18l-2 7H4V13zM34 6h14v2.5H34z"/></svg>'
    },
    3: {
      caliber: '12G',
      svg: '<svg class="wsil-svg" viewBox="0 0 112 38" fill="currentColor"><path d="M4 15h20l6-3h76v4.5H68v3.5H44l-4 11H28l4.5-11H16l-2 5H4V15z"/></svg>'
    },
    4: {
      caliber: 'PG-7V',
      svg: '<svg class="wsil-svg" viewBox="0 0 116 38" fill="currentColor"><path d="M4 15h10l6-3h48l10-6 28 11.5L78 29l-10-6H44l-2 11h-6l2-11H20l-6-3H4v-5z"/></svg>'
    }
  };

  const WEAPON_VARIANT_SILHOUETTES = {
    g2: {
      caliber: '9mm',
      svg: WEAPON_SILHOUETTES[1].svg
    },
    revolver: {
      caliber: '.357',
      svg: '<svg class="wsil-svg" viewBox="0 0 92 38" fill="currentColor"><path d="M14 14l4-4h16l2-2h42v4.5H48v2.5h-4v7.5H33l-1.5 3h-5l-4.5 9.5H12l6.5-14.5L14 17v-3zm19-2.5v8h11v-8H33z"/></svg>'
    },
    ss2v5: {
      caliber: '5.56mm',
      svg: WEAPON_SILHOUETTES[2].svg
    },
    m4: {
      caliber: '5.56mm',
      svg: '<svg class="wsil-svg" viewBox="0 0 112 38" fill="currentColor"><path d="M4 12h15l5-3h34l4 3h40v3.5H76l-2 3.5H60l2 14h-6.5l-2.5-13H41l-3 10h-7l2.5-10H19l-2 6H4V12zm27-5h18v2.5H31z"/></svg>'
    },
    ak47: {
      caliber: '7.62mm',
      svg: '<svg class="wsil-svg" viewBox="0 0 112 38" fill="currentColor"><path d="M4 15l15-3h12l4-3h32l6 2h33v3.5H74l-2 3.5H60l5 14.5-6.5 1.5-5.5-14H41l-3.5 10h-7l2.5-10H20l-14 4.5V15z"/></svg>'
    },
    pump12g: {
      caliber: '12G',
      svg: WEAPON_SILHOUETTES[3].svg
    },
    doublebarrel: {
      caliber: '12G',
      svg: '<svg class="wsil-svg" viewBox="0 0 112 38" fill="currentColor"><path d="M4 17l18-4h18l4-2h62v4H46l-4 3H30l-14 9-12-3.5V17z"/></svg>'
    },
    rpg7: {
      caliber: 'PG-7V',
      svg: WEAPON_SILHOUETTES[4].svg
    }
  };

  const _hudCache = {
    hpText: null,
    hpMaxText: null,
    hpPct: null,
    warn: null,
    critical: null,
    armorVal: null,
    armorPct: null,
    armorVisible: null,
    hadArmor: false,
    mode: null,
    stationCode: null,
    stationName: null,
    stationSub: null,
    objTitle: null,
    objDetail: null,
    keyItemsText: null,
    fpsText: null,
    weaponName: null,
    skinTag: null,
    skinIdAttr: null,
    ammoMag: null,
    ammoRes: null,
    slotKey: null,
    silSlot: null,
    hmActive: null,
    hmCrit: null,
    chPx: null,
    chAds: null,
    godText: null,
    godPct: null,
    sprintActive: null
  };

  function formatWeaponTag(wh) {
    const parts = [];
    if (wh.skinLabel) {
      parts.push(String(wh.skinLabel).toUpperCase());
    } else if (wh.skinId && wh.skinId !== 'pindad_standard') {
      parts.push(SKIN_LABELS[wh.skinId] || String(wh.skinId).replace(/_/g, ' ').toUpperCase());
    }
    const dmgPct = Math.round(((wh.dmgMult || 1) - 1) * 100);
    const relPct = Math.round((1 - (wh.reloadMult || 1)) * 100);
    const magB = wh.magBonus || 0;
    if (dmgPct > 0) parts.push(`+${dmgPct}% DMG`);
    if (relPct > 0) parts.push(`-${relPct}% RLD`);
    if (magB > 0) parts.push(`+${magB} MAG`);
    return parts.join(' · ');
  }

  function hideWaypoints() {
    for (let i = 0; i < _wpPool.length; i++) {
      const slot = _wpPool[i];
      if (slot.visible) {
        slot.el.classList.add('hidden');
        slot.visible = false;
        slot.lastOpacity = null;
      }
    }
    hidePingCompass();
  }

  function cleanWaypointLabel(rawLabel) {
    let labelText = _wpLabelCache.get(rawLabel);
    if (labelText === undefined) {
      const cleanLabel = String(rawLabel || 'WAYPOINT').replace(/^\[E\]\s*/i, '').replace(/\s*\([^)]*\)/g, '').trim();
      labelText = cleanLabel.length > 26 ? `${cleanLabel.slice(0, 24)}…` : (cleanLabel || 'WAYPOINT');
      if (_wpLabelCache.size > 128) _wpLabelCache.clear();
      _wpLabelCache.set(rawLabel, labelText);
    }
    return labelText;
  }

  function updateWaypoints(markers, activeIds, camera) {
    ensureWaypointPool();
    if (!_wpPool.length) return;

    const cam = camera || PL.refs.camera;
    if (!cam || !markers) {
      hideWaypoints();
      return;
    }

    if (typeof cam.updateMatrixWorld === 'function') {
      cam.updateMatrixWorld();
    }
    cam.getWorldPosition(_wpCamPos);
    cam.getWorldDirection(_wpCamForward);

    const hasFilter = activeIds !== undefined && activeIds !== null;
    const isFilterSet = hasFilter && typeof activeIds.has === 'function';
    const isFilterArr = hasFilter && Array.isArray(activeIds);

    _wpList.length = 0;
    const pushMarker = (m) => {
      if (!m || m.active === false || _wpList.length >= WAYPOINT_POOL_SIZE) return;
      if (hasFilter && m.alwaysShow !== true) {
        const id = m.id;
        if (isFilterSet && !activeIds.has(id)) return;
        if (isFilterArr && activeIds.indexOf(id) === -1) return;
      }
      const p = m.pos || m.position || m;
      if (typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') return;
      _wpList.push(m);
    };

    if (Array.isArray(markers)) {
      for (let i = 0; i < markers.length; i++) pushMarker(markers[i]);
    } else if (typeof markers.forEach === 'function') {
      markers.forEach((m) => pushMarker(m));
    } else if (typeof markers === 'object') {
      for (const k of Object.keys(markers)) pushMarker(markers[k]);
    }

    const effectiveMode = (I.core && typeof I.core.getEffectiveWaypointMode === 'function')
      ? I.core.getEffectiveWaypointMode()
      : 'proximity';
    const pingActive = hudState.pingTimer > 0;
    const pingFade = pingActive ? Math.min(1.0, hudState.pingTimer / 0.5) : 0.0;

    const vw = _cachedVw;
    const vh = _cachedVh;
    const marginX = 48;
    const marginY = 84;
    const halfW = vw * 0.5;
    const halfH = vh * 0.5;
    const maxX = Math.max(marginX, vw - marginX);
    const maxY = Math.max(marginY, vh - marginY);
    const refY = (PL.state && PL.refs && PL.refs.camera === cam) ? (PL.state.pos.y + 1.0) : _wpCamPos.y;

    let nearestPingMarker = null;
    let nearestPingDist = Infinity;
    let nearestPingDx = 0;
    let nearestPingDz = 0;

    for (let i = 0; i < WAYPOINT_POOL_SIZE; i++) {
      const slot = _wpPool[i];
      if (i >= _wpList.length) {
        if (slot.visible) {
          slot.el.classList.add('hidden');
          slot.visible = false;
          slot.lastOpacity = null;
        }
        continue;
      }

      const m = _wpList[i];
      const p = m.pos || m.position || m;
      const mx = p.x;
      const my = p.y;
      const mz = p.z;

      const dx = mx - _wpCamPos.x;
      const dy = my - _wpCamPos.y;
      const dz = mz - _wpCamPos.z;
      const distExact = Math.hypot(dx, dy, dz);
      const distM = Math.round(distExact);

      if (pingActive && distExact < nearestPingDist) {
        nearestPingDist = distExact;
        nearestPingMarker = m;
        nearestPingDx = dx;
        nearestPingDz = dz;
      }

      // Layer 2 & 3 visibility filtering (alwaysShow hard exception for train boarding / extraction)
      let baseAlpha = 0.0;
      if (m.alwaysShow === true) {
        baseAlpha = 1.0;
      } else if (effectiveMode === 'on') {
        baseAlpha = 1.0;
      } else if (effectiveMode === 'proximity') {
        const revealFar = (typeof m.revealDist === 'number' && m.revealDist > 0) ? (m.revealDist + 2.0) : 22.0;
        const revealNear = Math.max(4.0, revealFar - 6.0);
        let proxAlpha = 0.0;
        if (distExact <= revealNear) {
          proxAlpha = 1.0;
        } else if (distExact < revealFar) {
          proxAlpha = (revealFar - distExact) / (revealFar - revealNear);
        }
        baseAlpha = pingActive ? Math.max(proxAlpha, pingFade * 0.88) : proxAlpha;
      } else {
        // 'off' mode: hide all non-alwaysShow floating diamonds (rely on landmarks, halos, and Q compass ping)
        baseAlpha = 0.0;
      }

      if (baseAlpha <= 0.01) {
        if (slot.visible) {
          slot.el.classList.add('hidden');
          slot.visible = false;
          slot.lastOpacity = null;
        }
        continue;
      }

      const deltaY = my - refY;
      const elev = deltaY > 2.2 ? '▲' : (deltaY < -2.2 ? '▼' : '');

      const forwardDot = dx * _wpCamForward.x + dy * _wpCamForward.y + dz * _wpCamForward.z;
      const behind = forwardDot <= 0.01;

      _wpProjVec.set(mx, my, mz).project(cam);
      let ndcX = _wpProjVec.x;
      let ndcY = _wpProjVec.y;
      if (behind) {
        ndcX = -ndcX;
        ndcY = -ndcY;
      }

      let sx = (ndcX * 0.5 + 0.5) * vw;
      let sy = (-ndcY * 0.5 + 0.5) * vh;
      const offscreen = behind || sx < marginX || sx > maxX || sy < marginY || sy > maxY;

      if (behind) {
        let vx = sx - halfW;
        let vy = sy - halfH;
        const len = Math.hypot(vx, vy);
        if (len < 1e-3) {
          vx = 0;
          vy = 1;
        } else {
          vx /= len;
          vy /= len;
        }
        const tx = Math.abs(vx) > 1e-4 ? ((vx > 0 ? maxX - halfW : marginX - halfW) / vx) : 1e6;
        const ty = Math.abs(vy) > 1e-4 ? ((vy > 0 ? maxY - halfH : marginY - halfH) / vy) : 1e6;
        const t = Math.min(tx, ty);
        sx = halfW + vx * t;
        sy = halfH + vy * t;
      }

      sx = Math.round(Math.max(marginX, Math.min(maxX, sx)));
      sy = Math.round(Math.max(marginY, Math.min(maxY, sy)));

      const rawType = String(m.type || m.kind || m.id || '').toLowerCase();
      const typeClass = rawType.includes('train')
        ? 'wp-train'
        : (rawType.includes('loot') ? 'wp-loot' : ((rawType.includes('hazard') || rawType.includes('barrel')) ? 'wp-hazard' : 'wp-objective'));
      if (slot.lastType !== typeClass) {
        slot.el.classList.remove(slot.lastType);
        slot.el.classList.add(typeClass);
        slot.lastType = typeClass;
      }

      if (slot.lastOffscreen !== offscreen) {
        slot.el.classList.toggle('wp-offscreen', offscreen);
        slot.lastOffscreen = offscreen;
      }

      const finalOpacity = Math.round(baseAlpha * (offscreen ? 0.65 : 1.0) * 100) / 100;
      if (slot.lastOpacity !== finalOpacity) {
        slot.el.style.opacity = String(finalOpacity);
        slot.lastOpacity = finalOpacity;
      }

      const labelText = cleanWaypointLabel(m.label || m.title || m.text || 'WAYPOINT');
      if (slot.lastLabel !== labelText) {
        slot.labelEl.textContent = labelText;
        slot.lastLabel = labelText;
      }

      const distText = `${distM}m`;
      if (slot.lastDist !== distText) {
        slot.distEl.textContent = distText;
        slot.lastDist = distText;
      }

      if (slot.lastElev !== elev) {
        slot.elevEl.textContent = elev;
        slot.lastElev = elev;
      }

      const color = m.color || '';
      if (slot.lastColor !== color) {
        slot.diamond.style.borderColor = color;
        slot.lastColor = color;
      }

      if (!slot.visible) {
        slot.el.classList.remove('hidden');
        slot.visible = true;
      }

      const anchorX = sx <= marginX + 16 ? '0%' : (sx >= maxX - 16 ? '-100%' : '-50%');
      if (slot.lastX !== sx || slot.lastY !== sy || slot.lastAnchor !== anchorX) {
        slot.lastX = sx;
        slot.lastY = sy;
        slot.lastAnchor = anchorX;
        slot.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(${anchorX}, -50%)`;
      }
    }

    // Update top-edge Tactical Ping directional compass chevron (2.5s active window)
    const compassEl = dom['hud-ping-compass'];
    if (compassEl && pingActive && nearestPingMarker) {
      const fLen = Math.hypot(_wpCamForward.x, _wpCamForward.z) || 1;
      const fx = _wpCamForward.x / fLen;
      const fz = _wpCamForward.z / fLen;
      const rx = -fz;
      const rz = fx;
      const fwdDot = nearestPingDx * fx + nearestPingDz * fz;
      const rightDot = nearestPingDx * rx + nearestPingDz * rz;
      const relAngle = Math.atan2(rightDot, fwdDot);
      const normX = Math.max(-1, Math.min(1, relAngle / (Math.PI * 0.65)));
      const chevX = Math.round(normX * 102);

      const worldDeg = ((Math.atan2(nearestPingDx, nearestPingDz) * 180 / Math.PI) + 360) % 360;
      const cardinal = CARDINALS[Math.round(worldDeg / 45) % 8];
      const lbl = cleanWaypointLabel(nearestPingMarker.label || nearestPingMarker.title || 'OBJEKTIF');
      const dTxt = `${Math.round(nearestPingDist)}m`;
      const op = Math.round(pingFade * 100) / 100;

      if (!_pingCacheVisible) {
        compassEl.classList.remove('hidden');
        _pingCacheVisible = true;
      }
      if (_pingCacheOpacity !== op) {
        compassEl.style.opacity = String(op);
        _pingCacheOpacity = op;
      }
      if (_pingCacheX !== chevX && dom['ping-chevron']) {
        dom['ping-chevron'].style.transform = `translate3d(${chevX}px, 0, 0) rotate(45deg)`;
        _pingCacheX = chevX;
      }
      if (_pingCacheBearing !== cardinal && dom['ping-bearing']) {
        dom['ping-bearing'].textContent = cardinal;
        _pingCacheBearing = cardinal;
      }
      if (_pingCacheLabel !== lbl && dom['ping-label']) {
        dom['ping-label'].textContent = lbl;
        _pingCacheLabel = lbl;
      }
      if (_pingCacheDist !== dTxt && dom['ping-dist']) {
        dom['ping-dist'].textContent = dTxt;
        _pingCacheDist = dTxt;
      }
    } else {
      hidePingCompass();
    }
  }

  function updateHud(info) {
    if (!dom.hud) return;
    const state = PL.state;

    const hpText = String(Math.ceil(state.health));
    if (_hudCache.hpText !== hpText) {
      _hudCache.hpText = hpText;
      if (dom['hp-value']) dom['hp-value'].textContent = hpText;
    }

    const hpMaxText = ` / ${Math.round(state.maxHealth || 100)}`;
    if (_hudCache.hpMaxText !== hpMaxText) {
      _hudCache.hpMaxText = hpMaxText;
      if (dom['hp-max']) dom['hp-max'].textContent = hpMaxText;
    }

    const hpPct = Math.max(0, Math.min(100, Math.round((state.health / state.maxHealth) * 100)));
    if (_hudCache.hpPct !== hpPct) {
      _hudCache.hpPct = hpPct;
      if (dom['hp-bar-fill']) dom['hp-bar-fill'].style.width = `${hpPct}%`;
    }

    const critical = state.health < 35;
    const warn = !critical && state.health < 60;
    if (_hudCache.warn !== warn) {
      _hudCache.warn = warn;
      if (dom['vitals-card']) dom['vitals-card'].classList.toggle('hp-warn', warn);
    }
    if (_hudCache.critical !== critical) {
      _hudCache.critical = critical;
      if (dom['vitals-card']) dom['vitals-card'].classList.toggle('hp-critical', critical);
    }

    const armorVal = Math.max(0, Math.round(state.armor || 0));
    const maxArmor = Math.max(1, state.maxArmor || 100);
    if (armorVal > 0) _hudCache.hadArmor = true;
    const armorVisible = armorVal > 0 || !!_hudCache.hadArmor;
    if (_hudCache.armorVisible !== armorVisible) {
      _hudCache.armorVisible = armorVisible;
      if (dom['armor-row']) dom['armor-row'].classList.toggle('hidden', !armorVisible);
    }
    if (_hudCache.armorVal !== armorVal) {
      _hudCache.armorVal = armorVal;
      if (dom['armor-value']) dom['armor-value'].textContent = String(armorVal);
    }
    const armorPct = Math.max(0, Math.min(100, Math.round((armorVal / maxArmor) * 100)));
    if (_hudCache.armorPct !== armorPct) {
      _hudCache.armorPct = armorPct;
      if (dom['armor-bar-fill']) dom['armor-bar-fill'].style.width = `${armorPct}%`;
    }

    const godTimerSec = Math.max(0, state.invulnCheatTimer || 0);
    const godRem = Math.ceil(godTimerSec);
    const godText = godRem > 0
      ? `${String(Math.floor(godRem / 60)).padStart(2, '0')}:${String(godRem % 60).padStart(2, '0')}`
      : '';
    const godPct = godRem > 0 ? Math.round(Math.max(0, Math.min(100, (godTimerSec / 300) * 100)) * 2) / 2 : 0;
    const sprintActive = !!state.fastSprint;
    if (_hudCache.godText !== godText || _hudCache.sprintActive !== sprintActive) {
      _hudCache.godText = godText;
      _hudCache.sprintActive = sprintActive;
      if (dom['cheat-pill-god']) {
        dom['cheat-pill-god'].classList.toggle('hidden', !godText);
      }
      if (dom['cheat-god-timer'] && godText) {
        dom['cheat-god-timer'].textContent = godText;
      }
      if (dom['cheat-pill-sprint']) {
        dom['cheat-pill-sprint'].classList.toggle('hidden', !sprintActive);
      }
      if (dom['cheat-status-row']) {
        dom['cheat-status-row'].classList.toggle('hidden', !godText && !sprintActive);
      }
    }
    if (_hudCache.godPct !== godPct) {
      _hudCache.godPct = godPct;
      if (dom['cheat-god-bar']) {
        dom['cheat-god-bar'].style.width = `${godPct}%`;
      }
    }

    if (info) {
      const mode = info.mode === C.MODES.EXPLORATION ? 'EXPLORATION' : 'SURVIVAL';
      if (_hudCache.mode !== mode) {
        _hudCache.mode = mode;
        if (dom['hud-mode-badge']) dom['hud-mode-badge'].textContent = mode;
      }

      const stationCode = info.stationCode || 'CB01 / BK01';
      if (_hudCache.stationCode !== stationCode) {
        _hudCache.stationCode = stationCode;
        if (dom['hud-station-code']) dom['hud-station-code'].textContent = stationCode;
      }

      const stationName = info.stationName || 'Dukuh Atas BSI';
      if (_hudCache.stationName !== stationName) {
        _hudCache.stationName = stationName;
        if (dom['hud-station-name']) dom['hud-station-name'].textContent = stationName;
      }

      const stationSub = info.stationSub || 'LRT Jabodebek';
      if (_hudCache.stationSub !== stationSub) {
        _hudCache.stationSub = stationSub;
        if (dom['hud-station-sub']) dom['hud-station-sub'].textContent = stationSub;
      }

      const objTitle = info.objectiveTitle || '';
      if (_hudCache.objTitle !== objTitle) {
        _hudCache.objTitle = objTitle;
        if (dom['objective-title']) dom['objective-title'].textContent = objTitle;
      }

      const objDetail = info.objectiveDetail || '';
      if (_hudCache.objDetail !== objDetail) {
        _hudCache.objDetail = objDetail;
        if (dom['objective-detail']) dom['objective-detail'].textContent = objDetail;
      }

      const keyItemsText = info.keyItemsText || '';
      if (_hudCache.keyItemsText !== keyItemsText) {
        _hudCache.keyItemsText = keyItemsText;
        const kiEl = dom['hud-key-items'];
        if (kiEl) {
          kiEl.textContent = keyItemsText;
          kiEl.classList.toggle('hidden', !keyItemsText);
        }
      }

      const fpsText = `FPS: ${info.fps || '--'} | Calls: ${info.drawCalls || '--'}`;
      if (_hudCache.fpsText !== fpsText) {
        _hudCache.fpsText = fpsText;
        if (dom['fps-readout']) dom['fps-readout'].textContent = fpsText;
      }
    }

    if (LRT.Weapons && LRT.Weapons.getHudState) {
      const wh = LRT.Weapons.getHudState();
      if (wh) {
        const reloading = !!(wh.isReloading ?? wh.reloading);
        const mag = wh.ammoInMag ?? wh.mag ?? 0;
        const inf = !!(wh.infReserve ?? wh.infiniteReserve);
        const hmTime = wh.hitmarkerTimer ?? wh.hitmarkerTime ?? 0;
        const hmCrit = !!(wh.headshotHit ?? wh.hitmarkerCrit);

        const rawVariantLabel = wh.variantLabel ? String(wh.variantLabel).trim() : '';
        const useVariantName = !!(rawVariantLabel && !/^(default|standard|base)$/i.test(rawVariantLabel));
        const displayWeaponName = useVariantName ? rawVariantLabel : wh.name;
        const weaponName = reloading ? `${displayWeaponName} [RELOADING]` : displayWeaponName;
        if (_hudCache.weaponName !== weaponName) {
          _hudCache.weaponName = weaponName;
          if (dom['weapon-name']) dom['weapon-name'].textContent = weaponName;
        }

        const skinTag = formatWeaponTag(wh);
        const skinIdAttr = wh.skinId || '';
        if (_hudCache.skinTag !== skinTag || _hudCache.skinIdAttr !== skinIdAttr) {
          _hudCache.skinTag = skinTag;
          _hudCache.skinIdAttr = skinIdAttr;
          const tagEl = dom['weapon-skin-tag'];
          if (tagEl) {
            tagEl.textContent = skinTag;
            tagEl.dataset.skin = skinIdAttr;
            tagEl.classList.toggle('hidden', !skinTag);
          }
        }

        const ammoMag = String(mag);
        if (_hudCache.ammoMag !== ammoMag) {
          _hudCache.ammoMag = ammoMag;
          if (dom['ammo-mag']) dom['ammo-mag'].textContent = ammoMag;
        }

        const ammoRes = inf ? '/ INF' : `/ ${wh.reserve}`;
        if (_hudCache.ammoRes !== ammoRes) {
          _hudCache.ammoRes = ammoRes;
          if (dom['ammo-reserve']) dom['ammo-reserve'].textContent = ammoRes;
        }

        const activeSlot = wh.slot;
        const slotList = Array.isArray(wh.slots) ? wh.slots : (Array.isArray(wh.weapons) ? wh.weapons : null);
        let lockedMask = 0;
        if (slotList) {
          for (let i = 0; i < slotList.length; i++) {
            const item = slotList[i];
            if (item && item.unlocked === false) {
              const sn = Number(item.slot || (i + 1));
              if (sn >= 1 && sn <= 8) lockedMask |= (1 << sn);
            }
          }
        }
        const slotKey = `${activeSlot}|${lockedMask}`;
        if (_hudCache.slotKey !== slotKey) {
          _hudCache.slotKey = slotKey;
          if (dom['weapon-slots']) {
            dom['weapon-slots'].querySelectorAll('.w-slot').forEach((el) => {
              const sn = Number(el.dataset.slot);
              el.classList.toggle('active', sn === activeSlot);
              el.classList.toggle('locked', (lockedMask & (1 << sn)) !== 0);
            });
          }
        }
        const silKey = `${activeSlot}|${wh.variantId || ''}`;
        if (_hudCache.silSlot !== silKey) {
          _hudCache.silSlot = silKey;
          const varDef = wh.variantId ? WEAPON_VARIANT_SILHOUETTES[wh.variantId] : null;
          const silDef = varDef || WEAPON_SILHOUETTES[activeSlot] || WEAPON_SILHOUETTES[1];
          if (dom['weapon-silhouette'] && silDef) {
            dom['weapon-silhouette'].innerHTML = silDef.svg;
          }
          if (dom['weapon-caliber-label'] && silDef) {
            dom['weapon-caliber-label'].textContent = silDef.caliber;
          }
        }

        const hmActive = hmTime > 0;
        if (_hudCache.hmActive !== hmActive) {
          _hudCache.hmActive = hmActive;
          if (dom.hitmarker) dom.hitmarker.style.opacity = hmActive ? '1' : '0';
        }
        if (_hudCache.hmCrit !== hmCrit) {
          _hudCache.hmCrit = hmCrit;
          if (dom.hitmarker) dom.hitmarker.classList.toggle('crit', hmCrit);
        }

        const chScale = Math.round(((28 + Math.min(28, (wh.spread || 0) * 320)) / 24) * 100) / 100;
        if (_hudCache.chPx !== chScale) {
          _hudCache.chPx = chScale;
          if (dom.crosshair) {
            dom.crosshair.style.transform = `translate(-50%, -50%) scale(${chScale})`;
          }
        }

        const chAds = !!(wh.isADS);
        if (_hudCache.chAds !== chAds) {
          _hudCache.chAds = chAds;
          if (dom.crosshair) dom.crosshair.classList.toggle('ads-active', chAds);
        }

        const chCrouch = !!(PL.state && PL.state.crouching);
        if (_hudCache.chCrouch !== chCrouch) {
          _hudCache.chCrouch = chCrouch;
          if (dom.crosshair) dom.crosshair.classList.toggle('crouch-active', chCrouch);
          if (dom['pill-stance']) {
            dom['pill-stance'].classList.toggle('active', chCrouch);
            dom['pill-stance'].textContent = chCrouch ? 'C JONGKOK' : 'C Jongkok';
          }
        }

        const scopeOn = !!(wh.scopeOverlayActive);
        if (_hudCache.scopeOn !== scopeOn) {
          _hudCache.scopeOn = scopeOn;
          if (dom['scope-overlay']) dom['scope-overlay'].classList.toggle('active', scopeOn);
        }
      }
    }
  }

  // Tutorial Complete, showScreen & refreshContinueButton moved to src/player/hud_overlays.js.

  function init(canvasEl, cam, callbacks) {
    PL.refs.canvas = canvasEl;
    PL.refs.camera = cam;
    const cb = callbacks || {};
    PL.callbacks.onPause = cb.onPause || null;
    PL.callbacks.onSummonTrain = cb.onSummonTrain || null;
    PL.callbacks.onWeaponShootDown = cb.onShootDown || null;
    PL.callbacks.onWeaponShootUp = cb.onShootUp || null;
    PL.callbacks.onInteractResult = cb.onInteractResult || cb.onInteract || null;

    cacheDom();

    // Register audio voiceover callbacks so playVoice() drives subtitle overlay
    if (LRT.Audio && typeof LRT.Audio.setVoiceCallbacks === 'function') {
      LRT.Audio.setVoiceCallbacks({
        onStart: (entry) => {
          if (entry) {
            showSubtitle(entry.speaker, entry.subtitle_id, entry.subtitle_en, entry.duration_sec);
          }
        },
        onEnd: () => {
          hideSubtitle();
        }
      });
    }

    PL.initFlashlight(cam);
    PL.bindInputListeners();
    bindHudUiInputs();
    if (I.core && typeof I.core.getSettings === 'function') {
      syncAllSettingsUi(I.core.getSettings());
    } else {
      syncAllSettingsUi({
        brightness: LRT.Main && typeof LRT.Main.getBrightness === 'function' ? LRT.Main.getBrightness() : currentBrightness
      });
    }
    if (LRT.Main && typeof LRT.Main.getLightingMode === 'function') {
      const k = LRT.Main.getLightingMode();
      syncLightingUi(k, C.MOODS ? C.MOODS[k] : null);
    } else {
      syncLightingUi('DAYLIGHT_CLEAR', C.MOODS ? C.MOODS.DAYLIGHT_CLEAR : null);
    }
    return this;
  }

  function reset(spawnPos, invulnerable, mode) {
    closeDocViewer(false, true);
    closeFastTravelModal(false, true);
    closeTutorialCompleteModal();
    PL.resetPhysics(spawnPos, invulnerable, mode);
    syncFastTravelAvailability();
    _hudCache.armorVal = null;
    _hudCache.armorPct = null;
    _hudCache.armorVisible = null;
    _hudCache.hadArmor = false;
    _hudCache.skinTag = null;
    _hudCache.skinIdAttr = null;
    _hudCache.slotKey = null;
    _hudCache.godText = null;
    _hudCache.godPct = null;
    _hudCache.sprintActive = null;
    _hudCache.keyItemsText = null;
    hudState.pingTimer = 0;
    hudState.pingCooldown = 0;
    if (dom['hud-key-items']) {
      dom['hud-key-items'].textContent = '';
      dom['hud-key-items'].classList.add('hidden');
    }
    if (dom['cheat-status-row']) dom['cheat-status-row'].classList.add('hidden');
    if (dom['cheat-pill-god']) dom['cheat-pill-god'].classList.add('hidden');
    if (dom['cheat-god-bar']) dom['cheat-god-bar'].style.width = '100%';
    if (dom['cheat-pill-sprint']) dom['cheat-pill-sprint'].classList.add('hidden');
    if (dom['armor-row']) dom['armor-row'].classList.add('hidden');
    if (dom['weapon-skin-tag']) {
      dom['weapon-skin-tag'].textContent = '';
      dom['weapon-skin-tag'].classList.add('hidden');
    }
    if (PL.state) PL.state.noticeTimer = 0;
    if (dom['hud-notice']) {
      dom['hud-notice'].style.opacity = '0';
      dom['hud-notice'].textContent = '';
    }
    hideWaypoints();
  }

  PL.applySettingsCategoryFilter = applySettingsCategoryFilter;
  PL.syncBrightnessUi = syncBrightnessUi;
  PL.syncLightingUi = syncLightingUi;
  PL.syncAllSettingsUi = syncAllSettingsUi;
  PL.getCurrentBrightness = () => currentBrightness;
  PL.setNotice = setNotice;
  PL.toggleHud = toggleHud;
  PL.syncMuteUi = syncMuteUi;
  PL.syncAtmosphereUi = syncAtmosphereUi;
  PL.syncWaypointUi = syncWaypointUi;
  PL.triggerTacticalPing = triggerTacticalPing;
  PL.hudState = hudState;

  LRT.PlayerUI = {
    init,
    reset,
    update,
    updateHud,
    updateWaypoints,
    triggerTacticalPing,
    getHudState: () => hudState,
    takeDamage: PL.takeDamage,
    heal: PL.heal,
    addArmor: PL.addArmor,
    setNotice,
    showScreen,
    requestLock: PL.requestLock,
    releaseLock: PL.releaseLock,
    syncMuteUi,
    syncQualityUi,
    syncDifficultyUi,
    syncAtmosphereUi,
    syncResScaleUi,
    syncShadowsUi,
    syncBloomUi,
    syncAoUi,
    syncFpsUi,
    syncSubtitlesUi,
    syncSubtitleLangUi,
    syncDismembermentUi,
    syncWaypointUi,
    syncAllSettingsUi,
    syncBrightnessUi,
    syncLightingUi,
    sitInTrain: PL.sitInTrain,
    standFromSeat: PL.standFromSeat,
    toggleFlashlight: PL.toggleFlashlight,
    showSubtitle,
    hideSubtitle,
    pulseObjectiveHint: (durationMs) => {
      const el = dom['objective-detail'];
      if (!el) return;
      el.classList.add('hint-pulse');
      if (PL._hintPulseTimer) clearTimeout(PL._hintPulseTimer);
      PL._hintPulseTimer = setTimeout(() => {
        PL._hintPulseTimer = null;
        if (dom['objective-detail']) dom['objective-detail'].classList.remove('hint-pulse');
      }, Math.max(1500, durationMs || 4500));
    },
    showFieldLog,
    hideFieldLog,
    openDocViewer,
    closeDocViewer,
    openFastTravelModal,
    closeFastTravelModal,
    syncFastTravelAvailability,
    isFastTravelUnlocked: () => !!(PL.isFastTravelUnlocked && PL.isFastTravelUnlocked()),
    openTutorialCompleteModal,
    closeTutorialCompleteModal,
    setOnInteractResult: (fn) => { PL.callbacks.onInteractResult = fn; },
    setPaused: (flag, allowInput) => {
      PL.flags.paused = !!flag;
      PL.flags.allowActionInput = allowInput !== undefined ? !!allowInput : !PL.flags.paused;
      if (PL.flags.paused) {
        if (PL.closeCheatConsole) PL.closeCheatConsole(false);
        if (PL.state && PL.state.docViewerOpen) closeDocViewer(false, true);
        if (PL.state && PL.state.fastTravelOpen) closeFastTravelModal(false, true);
        for (const k of Object.keys(PL.keys)) PL.keys[k] = false;
        PL.state.ads = false;
        if (LRT.Weapons) LRT.Weapons.setADS(false);
      }
    },
    openCheatConsole: PL.openCheatConsole,
    closeCheatConsole: PL.closeCheatConsole,
    executeCheat: PL.executeCheat,
    setLook: (yaw, pitch) => {
      PL.state.yaw = yaw;
      PL.state.pitch = Math.max(-1.46, Math.min(1.46, pitch));
      if (PL.refs.camera) {
        PL.refs.camera.rotation.order = 'YXZ';
        PL.refs.camera.rotation.set(PL.state.pitch, PL.state.yaw, 0);
        PL.refs.camera.updateMatrixWorld();
      }
    },
    setPosition: (x, y, z) => {
      PL.state.pos.set(x, y, z);
      PL.state.vel.set(0, 0, 0);
      PL.state.lastSafePos.copy(PL.state.pos);
      if (PL.refs.camera) {
        PL.refs.camera.position.set(x, y + PL.state.eyeHeight, z);
        PL.refs.camera.updateMatrixWorld();
      }
    },
    applyImpulse: (vx, vy, vz) => {
      PL.state.vel.x += vx || 0;
      PL.state.vel.y += vy || 0;
      PL.state.vel.z += vz || 0;
      if ((vy || 0) > 0.5) PL.state.grounded = false;
    },
    getCamera: () => PL.refs.camera,
    getState: () => PL.state,
    getDom: () => dom
  };
})(window.LRT = window.LRT || {});
