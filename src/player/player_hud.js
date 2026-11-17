(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const PL = (I.player = I.player || {});

  const C = LRT.Config;

  const dom = {};
  let subtitleTimer = 0;
  let logTimer = 0;
  let currentBrightness = 1.0;

  let creditsRafId = 0;
  let creditsLastTs = 0;
  let creditsScrollPos = 0;
  let creditsPaused = false;
  let creditsEnded = false;
  let creditsCollapsed = false;

  const WAYPOINT_POOL_SIZE = 6;
  const _wpPool = [];
  const _wpList = [];
  const _wpProjVec = new THREE.Vector3();
  const _wpCamForward = new THREE.Vector3();
  const _wpCamPos = new THREE.Vector3();

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
        lastX: null,
        lastY: null
      });
    }
  }

  function cacheDom() {
    const ids = [
      'damage-vignette', 'hud', 'hud-waypoints', 'hud-mode-badge', 'hud-station-code',
      'hud-station-name', 'hud-station-sub', 'objective-title', 'objective-detail',
      'fps-readout', 'crosshair', 'hitmarker', 'hud-notice', 'interact-prompt',
      'interact-label', 'hud-subtitle-box', 'subtitle-speaker', 'subtitle-text-id', 'subtitle-text-en',
      'hud-log-banner', 'log-title', 'log-body',
      'vitals-card', 'hp-value', 'hp-bar-fill', 'armor-row', 'armor-value', 'armor-bar-fill',
      'cheat-console', 'cheat-input', 'cheat-status-row', 'cheat-pill-god', 'cheat-pill-sprint',
      'pill-flashlight', 'pill-lighting', 'pill-hud',
      'pill-mute', 'weapon-name', 'weapon-skin-tag', 'ammo-mag', 'ammo-reserve', 'weapon-slots',
      'menu-overlay', 'pause-overlay', 'gameover-overlay', 'gameover-stats',
      'victory-credits', 'credits-viewport', 'btn-credits-pause', 'btn-credits-skip', 'btn-credits-toggle',
      'btn-start-survival', 'btn-start-exploration', 'btn-menu-settings', 'btn-menu-controls',
      'btn-menu-lighting', 'btn-pause-lighting',
      'menu-settings-panel', 'menu-controls-panel', 'brightness-slider', 'brightness-readout',
      'pause-brightness-slider', 'pause-brightness-readout',
      'btn-resume', 'btn-restart-mode', 'btn-back-menu', 'btn-retry', 'btn-gameover-menu',
      'btn-menu-mute', 'btn-pause-mute',
      'menu-difficulty-group', 'pause-difficulty-group',
      'menu-quality-group', 'pause-quality-group',
      'menu-resscale-group', 'pause-resscale-group',
      'btn-menu-shadows', 'btn-pause-shadows',
      'btn-menu-bloom', 'btn-pause-bloom',
      'menu-ao-group', 'pause-ao-group',
      'btn-menu-fps', 'btn-pause-fps'
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
    return `${pct}% · ${tag}`;
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

  function setMenuSubpanel(panelName) {
    const showSettings = panelName === 'settings';
    const showControls = panelName === 'controls';
    if (dom['menu-settings-panel']) dom['menu-settings-panel'].classList.toggle('hidden', !showSettings);
    if (dom['menu-controls-panel']) dom['menu-controls-panel'].classList.toggle('hidden', !showControls);
    if (dom['btn-menu-settings']) dom['btn-menu-settings'].classList.toggle('active', showSettings);
    if (dom['btn-menu-controls']) dom['btn-menu-controls'].classList.toggle('active', showControls);
  }

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

    const box = dom['hud-subtitle-box'];
    if (!box) return;

    const spEl = dom['subtitle-speaker'];
    if (spEl) {
      const sp = String(speaker || '').trim().toUpperCase();
      let badgeText = sp;
      let badgeClass = 'speaker-occ';
      if (sp.includes('OCC') || sp.includes('DISPATCH') || sp === 'SARAH') {
        badgeText = 'OCC BEKASI // SARAH';
        badgeClass = 'speaker-occ';
      } else if (sp.includes('PLAYER') || sp.includes('GAGAK') || sp.includes('G2') || sp === 'ARYA') {
        badgeText = 'GAGAK-03 // ARYA';
        badgeClass = 'speaker-player';
      } else if (sp.includes('SYSTEM') || sp.includes('ANN') || sp.includes('PA') || sp.includes('LRT')) {
        badgeText = 'LRT PA SYSTEM';
        badgeClass = 'speaker-ann';
      }
      spEl.textContent = badgeText;
      spEl.className = `badge ${badgeClass}`;
    }

    if (dom['subtitle-text-id']) {
      dom['subtitle-text-id'].textContent = textId || '';
    }

    if (dom['subtitle-text-en']) {
      dom['subtitle-text-en'].textContent = textEn || '';
      dom['subtitle-text-en'].classList.toggle('hidden', !textEn);
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

  function renderPauseFieldLogs() {
    const listEl = document.getElementById('pause-field-logs-list');
    const countEl = document.getElementById('pause-logs-count');
    if (!listEl) return;
    const logs = (I.core && I.core.campaignState && Array.isArray(I.core.campaignState.collectedLogs))
      ? I.core.campaignState.collectedLogs
      : [];
    if (countEl) {
      countEl.textContent = `${logs.length} ${logs.length === 1 ? 'LOG' : 'LOGS'}`;
    }
    listEl.innerHTML = '';
    if (logs.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'pause-log-empty';
      emptyEl.textContent = 'No field logs recovered yet.';
      listEl.appendChild(emptyEl);
      return;
    }
    for (let i = logs.length - 1; i >= 0; i--) {
      const item = logs[i];
      const row = document.createElement('div');
      row.className = 'pause-log-entry';
      const tEl = document.createElement('div');
      tEl.className = 'pause-log-title';
      tEl.textContent = item.title || 'FIELD NOTE';
      const bEl = document.createElement('div');
      bEl.className = 'pause-log-body';
      bEl.textContent = item.body || '';
      row.appendChild(tEl);
      row.appendChild(bEl);
      listEl.appendChild(row);
    }
  }

  function showFieldLog(title, body, durationSec) {
    if (I.core && typeof I.core.recordFieldLog === 'function') {
      I.core.recordFieldLog(title, body);
    }
    const banner = dom['hud-log-banner'];
    if (!banner) return;
    if (dom['log-title']) {
      dom['log-title'].textContent = title || 'CATATAN LAPANGAN // FIELD NOTE';
    }
    if (dom['log-body']) {
      dom['log-body'].textContent = body || '';
    }
    banner.classList.remove('hidden');
    banner.style.opacity = '1';
    logTimer = Math.max(2.0, typeof durationSec === 'number' ? durationSec : 8.0);
  }

  function hideFieldLog() {
    logTimer = 0;
    const banner = dom['hud-log-banner'];
    if (banner) {
      banner.style.opacity = '0';
      banner.classList.add('hidden');
    }
  }

  function syncLightingUi(lightingKey, moodObj) {
    const key = lightingKey || 'DAYLIGHT_CLEAR';
    const labelMap = {
      DAYLIGHT_CLEAR: 'DAYLIGHT',
      DAYLIGHT_OVERCAST: 'OVERCAST',
      GOLDEN_DUSK: 'GOLDEN HOUR',
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
      BLACKOUT_EMERGENCY: 'NIGHT',
      CRIMSON_BLOOD_MOON: 'BLOOD',
      MONSOON_OVERCAST: 'STORM',
      TOXIC_SMOG: 'SMOG',
      HAZY_DUSK: 'HAZE'
    };
    const btnText = labelMap[key] || (moodObj && moodObj.name) || key;
    const pillShort = shortMap[key] || 'DAY';
    const isDay = moodObj ? !!moodObj.isDaylight : (key.startsWith('DAY') || key.startsWith('GOLD'));

    if (dom['btn-menu-lighting']) dom['btn-menu-lighting'].textContent = btnText;
    if (dom['btn-pause-lighting']) dom['btn-pause-lighting'].textContent = btnText;
    if (dom['pill-lighting']) {
      dom['pill-lighting'].textContent = `[L] Light: ${pillShort}`;
      dom['pill-lighting'].classList.toggle('active', isDay);
    }
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
      dom['pill-mute'].textContent = `[M] ${isMuted ? 'Muted' : 'Audio'}`;
      dom['pill-mute'].classList.toggle('active', !isMuted);
    }
  }

  function syncQualityUi(tierKey) {
    syncTabGroup([dom['menu-quality-group'], dom['pause-quality-group']], 'quality', tierKey || 'balanced');
  }

  function syncDifficultyUi(diffKey) {
    syncTabGroup([dom['menu-difficulty-group'], dom['pause-difficulty-group']], 'difficulty', diffKey || 'medium');
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

  function syncAllSettingsUi(settings) {
    const s = settings || {};
    syncDifficultyUi(s.difficultyKey || s.difficulty || 'medium');
    syncQualityUi(s.qualityKey || s.quality || 'balanced');
    syncResScaleUi(s.resScaleMode || s.resScale || 'floor_720');
    syncShadowsUi(s.shadowsEnabled !== undefined ? s.shadowsEnabled : (s.shadows !== undefined ? s.shadows : true));
    syncBloomUi(s.bloomEnabled !== undefined ? s.bloomEnabled : (s.bloom !== undefined ? s.bloom : true));
    syncAoUi(s.aoMode || s.ao || 'off');
    syncFpsUi(s.fpsCounterEnabled !== undefined ? s.fpsCounterEnabled : false);
    if (typeof s.brightness === 'number') {
      syncBrightnessUi(s.brightness);
    } else if (LRT.Main && typeof LRT.Main.getBrightness === 'function') {
      syncBrightnessUi(LRT.Main.getBrightness());
    } else {
      syncBrightnessUi(currentBrightness);
    }
    syncMuteUi();
  }

  function stopCreditsRoll() {
    if (creditsRafId) {
      window.cancelAnimationFrame(creditsRafId);
      creditsRafId = 0;
    }
    creditsLastTs = 0;
  }

  function syncCreditsControlsUi() {
    const panel = dom['victory-credits'];
    const vp = dom['credits-viewport'];
    const pauseBtn = dom['btn-credits-pause'];
    const skipBtn = dom['btn-credits-skip'];
    const toggleBtn = dom['btn-credits-toggle'];

    if (panel) panel.classList.toggle('is-collapsed', creditsCollapsed);
    if (vp) vp.classList.toggle('hidden', creditsCollapsed);

    if (pauseBtn) {
      pauseBtn.textContent = creditsPaused ? 'RESUME' : 'PAUSE';
      pauseBtn.classList.toggle('active', creditsPaused);
      pauseBtn.classList.toggle('hidden', creditsCollapsed || creditsEnded);
    }
    if (skipBtn) {
      skipBtn.textContent = creditsEnded ? 'REPLAY' : 'SKIP';
      skipBtn.classList.toggle('hidden', creditsCollapsed);
    }
    if (toggleBtn) {
      toggleBtn.textContent = creditsCollapsed ? 'SHOW' : 'HIDE';
      toggleBtn.classList.toggle('active', creditsCollapsed);
    }
  }

  function stepCreditsRoll(ts) {
    creditsRafId = 0;
    const ov = dom['gameover-overlay'];
    const panel = dom['victory-credits'];
    const vp = dom['credits-viewport'];
    if (
      !ov || ov.classList.contains('hidden') || !ov.classList.contains('is-victory') ||
      !panel || panel.classList.contains('hidden') || !vp || creditsCollapsed
    ) {
      creditsLastTs = 0;
      return;
    }
    if (!creditsLastTs) creditsLastTs = ts;
    const dt = Math.min(0.1, Math.max(0, (ts - creditsLastTs) / 1000));
    creditsLastTs = ts;

    const maxScroll = Math.max(0, vp.scrollHeight - vp.clientHeight);
    if (!creditsPaused && !creditsEnded && maxScroll > 0) {
      if (Math.abs(vp.scrollTop - creditsScrollPos) > 4) {
        creditsScrollPos = vp.scrollTop;
      }
      creditsScrollPos = Math.min(maxScroll, creditsScrollPos + dt * 36);
      vp.scrollTop = creditsScrollPos;
      if (creditsScrollPos >= maxScroll - 1) {
        creditsEnded = true;
        syncCreditsControlsUi();
      }
    }
    if (!creditsPaused && !creditsEnded) {
      creditsRafId = window.requestAnimationFrame(stepCreditsRoll);
    } else {
      creditsLastTs = 0;
    }
  }

  function startCreditsRoll(fromTop) {
    stopCreditsRoll();
    const vp = dom['credits-viewport'];
    if (fromTop) {
      creditsScrollPos = 0;
      creditsPaused = false;
      creditsEnded = false;
      if (vp) vp.scrollTop = 0;
    }
    syncCreditsControlsUi();
    if (!creditsCollapsed && !creditsPaused && !creditsEnded) {
      creditsRafId = window.requestAnimationFrame(stepCreditsRoll);
    }
  }

  function setVictoryCreditsActive(active) {
    const ov = dom['gameover-overlay'];
    const panel = dom['victory-credits'];
    const isVic = !!active;
    if (ov) ov.classList.toggle('is-victory', isVic);
    if (panel) panel.classList.toggle('hidden', !isVic);
    if (!isVic) {
      stopCreditsRoll();
      creditsScrollPos = 0;
      creditsPaused = false;
      creditsEnded = false;
      creditsCollapsed = false;
      if (dom['credits-viewport']) dom['credits-viewport'].scrollTop = 0;
      syncCreditsControlsUi();
      return;
    }
    creditsCollapsed = false;
    startCreditsRoll(true);
  }

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

    // Subtitle timer
    if (subtitleTimer > 0) {
      subtitleTimer -= dt;
      if (subtitleTimer <= 0) {
        hideSubtitle();
      }
    }

    // Field log toast timer
    if (logTimer > 0) {
      logTimer -= dt;
      if (logTimer <= 0) {
        hideFieldLog();
      }
    }

    PL.updatePhysics(dt, worldCtx);
  }

  const _hudCache = {
    hpText: null,
    hpPct: null,
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
    fpsText: null,
    weaponName: null,
    skinTag: null,
    skinIdAttr: null,
    ammoMag: null,
    ammoRes: null,
    slotKey: null,
    hmActive: null,
    hmCrit: null,
    chPx: null,
    chAds: null,
    godText: null,
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
      }
    }
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
      if (hasFilter) {
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

    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const marginX = 48;
    const marginY = 84;
    const halfW = vw * 0.5;
    const halfH = vh * 0.5;
    const maxX = Math.max(marginX, vw - marginX);
    const maxY = Math.max(marginY, vh - marginY);
    const refY = (PL.state && PL.refs && PL.refs.camera === cam) ? (PL.state.pos.y + 1.0) : _wpCamPos.y;

    for (let i = 0; i < WAYPOINT_POOL_SIZE; i++) {
      const slot = _wpPool[i];
      if (i >= _wpList.length) {
        if (slot.visible) {
          slot.el.classList.add('hidden');
          slot.visible = false;
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
      const distM = Math.round(Math.hypot(dx, dy, dz));
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

      const rawLabel = String(m.label || m.title || m.text || 'WAYPOINT');
      const cleanLabel = rawLabel.replace(/^\[E\]\s*/i, '').replace(/\s*\([^)]*\)/g, '').trim();
      const labelText = cleanLabel.length > 26 ? `${cleanLabel.slice(0, 24)}…` : (cleanLabel || 'WAYPOINT');
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
  }

  function updateHud(info) {
    if (!dom.hud) return;
    const state = PL.state;

    const hpText = String(Math.ceil(state.health));
    if (_hudCache.hpText !== hpText) {
      _hudCache.hpText = hpText;
      if (dom['hp-value']) dom['hp-value'].textContent = hpText;
    }

    const hpPct = Math.max(0, Math.min(100, Math.round((state.health / state.maxHealth) * 100)));
    if (_hudCache.hpPct !== hpPct) {
      _hudCache.hpPct = hpPct;
      if (dom['hp-bar-fill']) dom['hp-bar-fill'].style.width = `${hpPct}%`;
    }

    const critical = state.health < 35;
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

    const godRem = Math.ceil(state.invulnCheatTimer || 0);
    const godText = godRem > 0
      ? `PAINKILLER ${String(Math.floor(godRem / 60)).padStart(2, '0')}:${String(godRem % 60).padStart(2, '0')}`
      : '';
    const sprintActive = !!state.fastSprint;
    if (_hudCache.godText !== godText || _hudCache.sprintActive !== sprintActive) {
      _hudCache.godText = godText;
      _hudCache.sprintActive = sprintActive;
      if (dom['cheat-pill-god']) {
        dom['cheat-pill-god'].classList.toggle('hidden', !godText);
        if (godText) dom['cheat-pill-god'].textContent = godText;
      }
      if (dom['cheat-pill-sprint']) {
        dom['cheat-pill-sprint'].classList.toggle('hidden', !sprintActive);
      }
      if (dom['cheat-status-row']) {
        dom['cheat-status-row'].classList.toggle('hidden', !godText && !sprintActive);
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

        const weaponName = reloading ? `${wh.name} [RELOADING]` : wh.name;
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

        const hmActive = hmTime > 0;
        if (_hudCache.hmActive !== hmActive) {
          _hudCache.hmActive = hmActive;
          if (dom.hitmarker) dom.hitmarker.style.opacity = hmActive ? '1' : '0';
        }
        if (_hudCache.hmCrit !== hmCrit) {
          _hudCache.hmCrit = hmCrit;
          if (dom.hitmarker) dom.hitmarker.classList.toggle('crit', hmCrit);
        }

        const chPx = Math.round(28 + Math.min(28, (wh.spread || 0) * 320));
        if (_hudCache.chPx !== chPx) {
          _hudCache.chPx = chPx;
          if (dom.crosshair) {
            dom.crosshair.style.width = `${chPx}px`;
            dom.crosshair.style.height = `${chPx}px`;
          }
        }

        const chAds = !!(wh.isADS);
        if (_hudCache.chAds !== chAds) {
          _hudCache.chAds = chAds;
          if (dom.crosshair) dom.crosshair.classList.toggle('ads-active', chAds);
        }
      }
    }
  }

  function showScreen(screenName) {
    if (dom['menu-overlay']) dom['menu-overlay'].classList.toggle('hidden', screenName !== 'menu');
    if (dom['pause-overlay']) dom['pause-overlay'].classList.toggle('hidden', screenName !== 'pause');
    if (dom['gameover-overlay']) dom['gameover-overlay'].classList.toggle('hidden', screenName !== 'gameover');
    if (dom.hud) dom.hud.classList.toggle('hidden', screenName !== 'play');
    if (screenName !== 'play' && PL.closeCheatConsole) {
      PL.closeCheatConsole(false);
    }
    if (screenName !== 'menu') {
      setMenuSubpanel(null);
    }
    if (screenName === 'gameover') {
      const ov = dom['gameover-overlay'];
      const titleEl = ov ? ov.querySelector('.zenith-title') : null;
      const isVictory = !!(titleEl && titleEl.textContent.trim().toUpperCase() === 'EXTRACTION COMPLETE');
      setVictoryCreditsActive(isVictory);
    } else {
      setVictoryCreditsActive(false);
    }
    if (screenName === 'menu' || screenName === 'pause') {
      if (I.core && typeof I.core.getSettings === 'function') {
        syncAllSettingsUi(I.core.getSettings());
      } else if (LRT.Main && typeof LRT.Main.getBrightness === 'function') {
        syncBrightnessUi(LRT.Main.getBrightness());
      } else {
        syncBrightnessUi(currentBrightness);
      }
      if (LRT.Main && typeof LRT.Main.getLightingMode === 'function') {
        const lk = LRT.Main.getLightingMode();
        syncLightingUi(lk, C.MOODS ? C.MOODS[lk] : null);
      }
      if (screenName === 'pause') {
        renderPauseFieldLogs();
      }
    }
  }

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
    PL.resetPhysics(spawnPos, invulnerable, mode);
    _hudCache.armorVal = null;
    _hudCache.armorPct = null;
    _hudCache.armorVisible = null;
    _hudCache.hadArmor = false;
    _hudCache.skinTag = null;
    _hudCache.skinIdAttr = null;
    _hudCache.slotKey = null;
    _hudCache.godText = null;
    _hudCache.sprintActive = null;
    if (dom['cheat-status-row']) dom['cheat-status-row'].classList.add('hidden');
    if (dom['cheat-pill-god']) dom['cheat-pill-god'].classList.add('hidden');
    if (dom['cheat-pill-sprint']) dom['cheat-pill-sprint'].classList.add('hidden');
    if (dom['armor-row']) dom['armor-row'].classList.add('hidden');
    if (dom['weapon-skin-tag']) {
      dom['weapon-skin-tag'].textContent = '';
      dom['weapon-skin-tag'].classList.add('hidden');
    }
    hideWaypoints();
  }

  PL.setNotice = setNotice;
  PL.showFieldLog = showFieldLog;
  PL.toggleHud = toggleHud;
  PL.syncMuteUi = syncMuteUi;

  LRT.PlayerUI = {
    init,
    reset,
    update,
    updateHud,
    updateWaypoints,
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
    syncResScaleUi,
    syncShadowsUi,
    syncBloomUi,
    syncAoUi,
    syncFpsUi,
    syncAllSettingsUi,
    syncBrightnessUi,
    syncLightingUi,
    sitInTrain: PL.sitInTrain,
    standFromSeat: PL.standFromSeat,
    toggleFlashlight: PL.toggleFlashlight,
    showSubtitle,
    hideSubtitle,
    showFieldLog,
    hideFieldLog,
    setOnInteractResult: (fn) => { PL.callbacks.onInteractResult = fn; },
    setPaused: (flag, allowInput) => {
      PL.flags.paused = !!flag;
      PL.flags.allowActionInput = allowInput !== undefined ? !!allowInput : !PL.flags.paused;
      if (PL.flags.paused) {
        if (PL.closeCheatConsole) PL.closeCheatConsole(false);
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
