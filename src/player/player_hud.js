(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const PL = (I.player = I.player || {});

  const C = LRT.Config;

  const dom = {};
  let subtitleTimer = 0;
  let lastSubtitleId = '';
  let lastSubtitleEn = '';
  let logTimer = 0;
  let currentBrightness = 1.0;
  let pausedByDocViewer = false;
  let docViewerFromPause = false;
  let pausedByFastTravel = false;
  let fastTravelFromPause = false;

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
      'document-viewer-modal', 'doc-viewer-sheet', 'doc-viewer-kicker', 'doc-viewer-submeta',
      'doc-viewer-stamp', 'doc-viewer-title', 'doc-viewer-body', 'btn-doc-close-x', 'btn-doc-close',
      'vitals-card', 'hp-value', 'hp-bar-fill', 'armor-row', 'armor-value', 'armor-bar-fill',
      'cheat-console', 'cheat-input', 'btn-cheat-apply', 'cheat-status-row',
      'cheat-pill-god', 'cheat-god-timer', 'cheat-god-bar', 'cheat-pill-sprint',
      'pill-flashlight', 'pill-lighting', 'pill-hud',
      'pill-mute', 'pill-fast-travel', 'weapon-name', 'weapon-skin-tag', 'ammo-mag', 'ammo-reserve', 'weapon-slots',
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

  function setMenuSubpanel(panelName) {
    const showSettings = panelName === 'settings';
    const showControls = panelName === 'controls';
    const anySub = showSettings || showControls;
    if (dom['menu-overlay']) dom['menu-overlay'].classList.toggle('subview-open', anySub);
    if (dom['menu-main-view']) dom['menu-main-view'].classList.toggle('subview-hidden', anySub);
    if (dom['menu-settings-panel']) {
      dom['menu-settings-panel'].classList.toggle('hidden', !showSettings);
      if (showSettings) applySettingsCategoryFilter(dom['menu-settings-panel'], 'all');
    }
    if (dom['menu-controls-panel']) dom['menu-controls-panel'].classList.toggle('hidden', !showControls);
    if (dom['btn-menu-settings']) dom['btn-menu-settings'].classList.toggle('active', showSettings);
    if (dom['btn-menu-controls']) dom['btn-menu-controls'].classList.toggle('active', showControls);
  }

  function setPauseSubpanel(panelName) {
    const showSettings = panelName === 'settings';
    const showControls = panelName === 'controls';
    const showLogs = panelName === 'logs';
    const anySub = showSettings || showControls || showLogs;
    if (dom['pause-overlay']) dom['pause-overlay'].classList.toggle('subview-open', anySub);
    if (dom['pause-main-view']) dom['pause-main-view'].classList.toggle('hidden', anySub);
    if (dom['pause-settings-panel']) {
      dom['pause-settings-panel'].classList.toggle('hidden', !showSettings);
      if (showSettings) applySettingsCategoryFilter(dom['pause-settings-panel'], 'all');
    }
    if (dom['pause-controls-panel']) dom['pause-controls-panel'].classList.toggle('hidden', !showControls);
    if (dom['pause-logs-panel']) dom['pause-logs-panel'].classList.toggle('hidden', !showLogs);
    if (dom['btn-pause-settings']) dom['btn-pause-settings'].classList.toggle('active', showSettings);
    if (dom['btn-pause-controls']) dom['btn-pause-controls'].classList.toggle('active', showControls);
    if (dom['btn-pause-logs']) dom['btn-pause-logs'].classList.toggle('active', showLogs);
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

  function renderPauseFieldLogs() {
    const listEl = document.getElementById('pause-field-logs-list');
    const countEl = document.getElementById('pause-logs-count');
    if (!listEl) return;
    const logs = (I.core && I.core.campaignState && Array.isArray(I.core.campaignState.collectedLogs))
      ? I.core.campaignState.collectedLogs
      : [];
    if (countEl) {
      countEl.textContent = `${logs.length} Catatan`;
    }
    if (dom['pause-logs-nav-sub']) {
      dom['pause-logs-nav-sub'].textContent = `${logs.length} Catatan ditemukan`;
    }
    listEl.innerHTML = '';
    if (logs.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'pause-log-empty';
      emptyEl.textContent = 'Belum ada catatan yang ditemukan.';
      listEl.appendChild(emptyEl);
      return;
    }
    for (let i = logs.length - 1; i >= 0; i--) {
      const item = logs[i];
      const fileNum = i + 1;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pause-log-entry';

      const head = document.createElement('div');
      head.className = 'pause-log-head';
      const tEl = document.createElement('span');
      tEl.className = 'pause-log-title';
      tEl.textContent = item.title || 'Catatan';
      const openEl = document.createElement('span');
      openEl.className = 'pause-log-open';
      openEl.textContent = 'Baca';
      head.appendChild(tEl);
      head.appendChild(openEl);

      const bEl = document.createElement('div');
      bEl.className = 'pause-log-body';
      bEl.textContent = item.body || '';

      row.appendChild(head);
      row.appendChild(bEl);
      row.addEventListener('click', () => {
        openDocViewer(item.title, item.body, {
          fromPause: true,
          fileNum,
          stationIndex: item.stationIndex
        });
      });
      listEl.appendChild(row);
    }
  }

  function resolveDocFileMeta(title, opts) {
    const o = opts || {};
    const logs = (I.core && I.core.campaignState && Array.isArray(I.core.campaignState.collectedLogs))
      ? I.core.campaignState.collectedLogs
      : [];
    let fileNum = typeof o.fileNum === 'number' && o.fileNum > 0 ? o.fileNum : 0;
    if (!fileNum && title) {
      const idx = logs.findIndex((l) => l && l.title === title);
      if (idx >= 0) fileNum = idx + 1;
    }
    if (!fileNum) fileNum = Math.max(1, logs.length || 1);

    let stationLabel = o.stationName || '';
    if (!stationLabel && typeof o.stationIndex === 'number' && Array.isArray(C.STATIONS) && C.STATIONS[o.stationIndex]) {
      stationLabel = C.STATIONS[o.stationIndex].name || '';
    }
    if (!stationLabel && dom['hud-station-name']) {
      stationLabel = dom['hud-station-name'].textContent || '';
    }
    return {
      fileLabel: String(fileNum).padStart(2, '0'),
      stationLabel: stationLabel ? stationLabel.toUpperCase() : 'LRT JABODEBEK'
    };
  }

  function openDocViewer(title, body, opts) {
    const o = opts || {};
    const modal = dom['document-viewer-modal'];
    if (!modal) return false;

    hideFieldLog();
    if (PL.closeCheatConsole) PL.closeCheatConsole(false);

    docViewerFromPause = !!o.fromPause;
    if (!docViewerFromPause) {
      pausedByDocViewer = !PL.flags.paused;
      if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
      LRT.PlayerUI.setPaused(true, false);
      if (PL.callbacks && PL.callbacks.onWeaponShootUp) PL.callbacks.onWeaponShootUp();
      if (PL.releaseLock) PL.releaseLock();
    } else {
      pausedByDocViewer = false;
    }

    const meta = resolveDocFileMeta(title, o);
    if (dom['doc-viewer-kicker']) {
      dom['doc-viewer-kicker'].textContent = 'Catatan';
    }
    if (dom['doc-viewer-submeta']) {
      dom['doc-viewer-submeta'].textContent = `${meta.stationLabel}`;
    }
    if (dom['doc-viewer-stamp']) {
      dom['doc-viewer-stamp'].textContent = '';
    }
    if (dom['doc-viewer-title']) {
      dom['doc-viewer-title'].textContent = title || 'Catatan';
    }
    if (dom['doc-viewer-body']) {
      dom['doc-viewer-body'].textContent = body || '';
    }
    const bodyWrap = modal.querySelector('.doc-body-wrap');
    if (bodyWrap) bodyWrap.scrollTop = 0;

    if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') {
      LRT.Audio.setGameplayPaused(true);
    }

    PL.state.docViewerOpen = true;
    modal.classList.remove('hidden');
    if (I.core && typeof I.core.onTutorialEvent === 'function') {
      I.core.onTutorialEvent('doc');
    }
    return true;
  }

  function closeDocViewer(refocusGame, silent) {
    const modal = dom['document-viewer-modal'];
    const wasOpen = !!(PL.state && PL.state.docViewerOpen);
    if (PL.state) PL.state.docViewerOpen = false;
    if (modal) modal.classList.add('hidden');

    const fromPause = docViewerFromPause;
    const shouldUnpause = pausedByDocViewer;
    docViewerFromPause = false;
    pausedByDocViewer = false;

    if (!wasOpen) return false;

    for (const k of Object.keys(PL.keys)) PL.keys[k] = false;

    if (!fromPause) {
      if (shouldUnpause) {
        if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
        LRT.PlayerUI.setPaused(false, true);
      }
      const pauseHidden = !dom['pause-overlay'] || dom['pause-overlay'].classList.contains('hidden');
      if (pauseHidden && LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') {
        LRT.Audio.setGameplayPaused(false);
      }
      if (refocusGame !== false && PL.flags.allowActionInput && !PL.flags.paused) {
        if (PL.relockAfterOverlay) PL.relockAfterOverlay();
        else if (PL.requestLock) PL.requestLock();
      }
    }
    return true;
  }

  function showFieldLog(title, body, opts) {
    const o = (typeof opts === 'number') ? { durationSec: opts } : (opts || {});
    if (I.core && typeof I.core.recordFieldLog === 'function') {
      I.core.recordFieldLog(title, body);
    }
    if (dom['log-title']) {
      dom['log-title'].textContent = title || 'Catatan';
    }
    if (dom['log-body']) {
      dom['log-body'].textContent = body || '';
    }
    if (o.noModal) {
      const banner = dom['hud-log-banner'];
      if (!banner) return;
      banner.classList.remove('hidden');
      banner.style.opacity = '1';
      logTimer = Math.max(2.0, typeof o.durationSec === 'number' ? o.durationSec : 8.0);
      return;
    }
    openDocViewer(title, body, o);
  }

  function hideFieldLog() {
    logTimer = 0;
    const banner = dom['hud-log-banner'];
    if (banner) {
      banner.style.opacity = '0';
      banner.classList.add('hidden');
    }
  }

  function getFastTravelStations() {
    if (C && Array.isArray(C.ARCHETYPES) && C.ARCHETYPES.length) return C.ARCHETYPES;
    if (LRT.CONFIG && Array.isArray(LRT.CONFIG.stations) && LRT.CONFIG.stations.length) return LRT.CONFIG.stations;
    return [
      { id: 'dukuh_atas', code: 'CB01 / BK01', name: 'Dukuh Atas BSI', layout: 'SIDE_DUAL_PLAZA', hasTerminusBuffer: true },
      { id: 'cawang', code: 'CB08 / BK08', name: 'Cawang Interchange', layout: 'CAWANG_HUB', hasFourTracks: true },
      { id: 'harjamukti', code: 'CB12 / BK14', name: 'Harjamukti', layout: 'ISLAND_DEPOT', hasGardenTerrace: true },
      { id: 'kuningan', code: 'CB04 / BK04', name: 'Kuningan', layout: 'SIDE_DUAL' },
      { id: 'cikoko', code: 'CB06 / BK06', name: 'Cikoko', layout: 'SIDE_DUAL', hasTollOverpass: true },
      { id: 'setiabudi', code: 'CB02 / BK02', name: 'Setiabudi', layout: 'ISLAND_CENTRAL' }
    ];
  }

  function getStationBadgeMeta(arch, idx) {
    const id = arch && arch.id ? arch.id : '';
    const map = {
      dukuh_atas: { district: 'Kawasan Sudirman · Dukuh Atas', badge: 'Terminus · Side-Dual' },
      cawang: { district: 'Simpang Cawang · MT Haryono', badge: '4-Track Interchange' },
      harjamukti: { district: 'Cibubur · Harjamukti Depot', badge: 'Elevated Garden' },
      kuningan: { district: 'HR Rasuna Said · Kuningan', badge: 'Side-Dual' },
      cikoko: { district: 'Cikoko · MT Haryono Tol', badge: 'Side-Dual' },
      setiabudi: { district: 'Setiabudi · Sudirman', badge: 'Terminus · Island' }
    };
    if (map[id]) return map[id];
    let badge = 'Side-Dual';
    if (arch && (arch.hasFourTracks || arch.layout === 'CAWANG_HUB')) badge = '4-Track Interchange';
    else if (arch && (arch.hasGardenTerrace || arch.layout === 'ISLAND_DEPOT')) badge = 'Elevated Garden';
    else if (arch && (arch.hasTerminusBuffer || idx === 0 || idx === 5)) badge = 'Terminus';
    return {
      district: (arch && arch.destinationHint) || 'Koridor Selatan LRT',
      badge
    };
  }

  function gatherAllWorldColliders() {
    const out = [];
    if (LRT.Station) {
      const sc = typeof LRT.Station.getColliders === 'function' ? LRT.Station.getColliders() : LRT.Station.colliders;
      if (Array.isArray(sc)) for (let i = 0; i < sc.length; i++) out.push(sc[i]);
    }
    if (LRT.City) {
      const cc = typeof LRT.City.getColliders === 'function' ? LRT.City.getColliders() : LRT.City.colliders;
      if (Array.isArray(cc)) for (let i = 0; i < cc.length; i++) out.push(cc[i]);
    }
    return out;
  }

  function findSupportFloorY(x, z, expectedY, colliders) {
    let bestY = null;
    let bestDiff = Infinity;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c || c.disabled || !c.isFloor) continue;
      if (x >= c.minX + 0.30 && x <= c.maxX - 0.30 && z >= c.minZ + 0.30 && z <= c.maxZ - 0.30) {
        const diff = Math.abs(c.maxY - expectedY);
        if (diff <= 0.75 && diff < bestDiff) {
          bestDiff = diff;
          bestY = c.maxY;
        }
      }
    }
    return bestY;
  }

  function isSpotFreeOfObstacles(x, floorY, z, colliders) {
    const r = 0.44;
    const lowY = floorY + 0.35;
    const highY = floorY + 1.62;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c || c.disabled || c.blocksWalk === false || c.isTrigger || c.isFloor) continue;
      if (c.isRamp) {
        if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ && c.maxY > floorY + 0.25 && c.minY < highY) {
          return false;
        }
        continue;
      }
      if (c.maxY <= lowY || c.minY >= highY) continue;
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
        return false;
      }
    }
    return true;
  }

  function resolveSafeCheckpointPosition(baseX, expectedFloorY, baseZ, yaw) {
    const colliders = gatherAllWorldColliders();
    if (!colliders.length) {
      return { x: baseX, y: expectedFloorY + 0.05, z: baseZ, yaw: yaw || 0 };
    }
    const offsets = [
      [0, 0],
      [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3],
      [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3],
      [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4],
      [2.4, 2.4], [-2.4, 2.4], [2.4, -2.4], [-2.4, -2.4],
      [3.8, 0], [-3.8, 0], [0, 3.8], [0, -3.8]
    ];
    for (let oi = 0; oi < offsets.length; oi++) {
      const tx = baseX + offsets[oi][0];
      const tz = baseZ + offsets[oi][1];
      const floorY = findSupportFloorY(tx, tz, expectedFloorY, colliders);
      if (floorY === null) continue;
      if (isSpotFreeOfObstacles(tx, floorY, tz, colliders)) {
        return { x: tx, y: floorY + 0.05, z: tz, yaw: yaw || 0 };
      }
    }
    for (let oi = 0; oi < offsets.length; oi++) {
      const tx = baseX + offsets[oi][0];
      const tz = baseZ + offsets[oi][1];
      if (isSpotFreeOfObstacles(tx, expectedFloorY, tz, colliders)) {
        return { x: tx, y: expectedFloorY + 0.05, z: tz, yaw: yaw || 0 };
      }
    }
    return { x: baseX, y: expectedFloorY + 0.05, z: baseZ, yaw: yaw || 0 };
  }

  function findInteractableById(list, id) {
    if (!Array.isArray(list)) return null;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function computeFastTravelZones() {
    const stations = getFastTravelStations();
    const stIdx = (I.core && typeof I.core.stationIndex === 'number') ? I.core.stationIndex : 0;
    const st = LRT.Station;
    const ct = LRT.City;
    const ctx = (st && (st.ctx || st._layoutCtx)) || null;
    const arch = (ctx && ctx.arch) || (st && st._archetype) || stations[stIdx % stations.length] || {};
    const rail = (st && typeof st.getRailConfig === 'function')
      ? st.getRailConfig()
      : { isIsland: false, isCawang: false, track1X: 0.0, track2X: -4.70, p1MinX: 1.46, p1MaxX: 7.06, p2MinX: -11.36, p2MaxX: -6.16 };

    const isIsland = !!(ctx ? ctx.isIsland : rail.isIsland);
    const isCawang = !!(ctx ? ctx.isCawang : (rail.isCawang || arch.layout === 'CAWANG_HUB'));
    const p1MinX = (ctx && typeof ctx.p1MinX === 'number') ? ctx.p1MinX : (typeof rail.p1MinX === 'number' ? rail.p1MinX : 1.46);
    const p1MaxX = (ctx && typeof ctx.p1MaxX === 'number') ? ctx.p1MaxX : (typeof rail.p1MaxX === 'number' ? rail.p1MaxX : (isIsland ? 12.26 : 7.06));
    const p2MinX = (ctx && typeof ctx.p2MinX === 'number') ? ctx.p2MinX : (typeof rail.p2MinX === 'number' ? rail.p2MinX : -11.36);
    const p2MaxX = (ctx && typeof ctx.p2MaxX === 'number') ? ctx.p2MaxX : (typeof rail.p2MaxX === 'number' ? rail.p2MaxX : -6.16);
    const track2X = (ctx && typeof ctx.track2X === 'number') ? ctx.track2X : (typeof rail.track2X === 'number' ? rail.track2X : -4.70);

    const concMinX = (ctx && typeof ctx.concMinX === 'number') ? ctx.concMinX : p1MaxX;
    const concMaxX = (ctx && typeof ctx.concMaxX === 'number') ? ctx.concMaxX : (isIsland ? p1MaxX : concMinX + (arch.concourseWidth || 15.0));
    const concLen = (ctx && typeof ctx.concLen === 'number') ? ctx.concLen : Math.min(arch.concourseLen || 36.0, 48.0);
    const rawConcMin = arch.concourseEnd === 'south' ? Math.round(-concLen - 2)
      : (arch.concourseEnd === 'north' ? 2 : Math.round(-concLen * 0.5));
    const concMinZ = (ctx && typeof ctx.concMinZ === 'number') ? ctx.concMinZ : Math.max(-58, Math.min(58 - concLen, rawConcMin));
    const concMaxZ = (ctx && typeof ctx.concMaxZ === 'number') ? ctx.concMaxZ : (concMinZ + concLen);
    const concMidZ = (ctx && typeof ctx.concMidZ === 'number') ? ctx.concMidZ : ((concMinZ + concMaxZ) * 0.5);

    const jpoZ = (ctx && typeof ctx.jpoZ === 'number')
      ? ctx.jpoZ
      : (isCawang ? 0.0 : (arch.id === 'harjamukti' ? 24.0 : (arch.concourseEnd === 'north' ? 49.0 : (arch.concourseEnd === 'south' ? -49.0 : 34.0))));
    const hasJpo2 = !(arch.id === 'cikoko' || (ctx && ctx.jpo2Z === null));
    const jpo2Z = (ctx && typeof ctx.jpo2Z === 'number')
      ? ctx.jpo2Z
      : (hasJpo2 ? (isCawang ? 44.0 : (isIsland ? (jpoZ > 0 ? -38.0 : 38.0) : (jpoZ > 0 ? -34.0 : 34.0))) : null);

    const corridorMinX = (ctx && typeof ctx.corridorMinX === 'number')
      ? ctx.corridorMinX
      : (isIsland ? (isCawang ? -7.2 : (arch.hasDepotShed ? -6.2 : -2.4)) : (p2MinX - 0.2));
    const corridorMaxX = (ctx && typeof ctx.corridorMaxX === 'number')
      ? ctx.corridorMaxX
      : (isIsland
        ? (isCawang ? (track2X + 4.70 + 1.42 + 9.4) : Math.max(track2X + 2.4, arch.hasDepotShed ? p1MaxX + 10.0 : 0, arch.hasGardenTerrace ? track2X + 12.6 : 0))
        : (concMaxX + 0.2));

    // District street bounds (matches city_district.js SW_PROM=7, BLVD_W=14, SW_OUTER=5, BLOCK_W=30, COL_ROAD_W=10)
    const westInnerSwMinX = corridorMinX - 7.0;
    const westRoadMinX = westInnerSwMinX - 14.0;
    const westOuterSwMinX = westRoadMinX - 5.0;
    const westColRoadMaxX = westOuterSwMinX - 30.0;
    const westColRoadMinX = westColRoadMaxX - 10.0;

    const eastInnerSwMaxX = corridorMaxX + 7.0;
    const eastRoadMaxX = eastInnerSwMaxX + 14.0;
    const eastRoadCX = (eastInnerSwMaxX + eastRoadMaxX) * 0.5;
    const eastOuterSwMinX = eastRoadMaxX;
    const eastOuterSwMaxX = eastOuterSwMinX + 5.0;
    const eastColRoadMinX = eastOuterSwMaxX + 30.0;
    const eastColRoadMaxX = eastColRoadMinX + 10.0;

    const ctBounds = (ct && ct.layoutBounds) || null;
    const westColRoadCX = ctBounds
      ? ((ctBounds.westColRoadMinX + ctBounds.westColRoadMaxX) * 0.5)
      : ((westColRoadMinX + westColRoadMaxX) * 0.5);
    const eastRoadCXVal = ctBounds
      ? ((ctBounds.eastInnerSwMaxX + ctBounds.eastRoadMaxX) * 0.5)
      : eastRoadCX;
    const eastColRoadCX = ctBounds
      ? ((ctBounds.eastColRoadMinX + ctBounds.eastColRoadMaxX) * 0.5)
      : ((eastColRoadMinX + eastColRoadMaxX) * 0.5);

    const stItems = st ? (typeof st.getInteractables === 'function' ? st.getInteractables() : st.interactables) : null;
    const ctItems = ct ? (typeof ct.getInteractables === 'function' ? ct.getInteractables() : ct.interactables) : null;

    const indoChill = findInteractableById(stItems, 'indomaret_chiller');
    const jpo2Item = findInteractableById(stItems, 'jpo2_supply');
    const plnItem = findInteractableById(ctItems, 'city_pln_box');
    const nwItem = findInteractableById(ctItems, 'city_nw_medpost');
    const neItem = findInteractableById(ctItems, 'city_ne_depot');
    const swItem = findInteractableById(ctItems, 'city_sw_convoy');
    const seItem = findInteractableById(ctItems, 'city_se_warung');
    const hubs = (ct && ct.cornerHubs) || null;

    const directIndo = (ctx && ctx.indoWalkInPos) || (st && st.indoWalkInPos) || null;
    const indoPos = directIndo
      ? { x: directIndo.x, z: directIndo.z, yaw: typeof directIndo.yaw === 'number' ? directIndo.yaw : 0 }
      : (indoChill
        ? (isIsland
          ? { x: indoChill.x + 0.80, z: indoChill.z + 1.50, yaw: 0 }
          : { x: indoChill.x - 1.50, z: indoChill.z + 0.80, yaw: -Math.PI * 0.5 })
        : (isIsland
          ? { x: (p1MinX + p1MaxX) * 0.5, z: 16.2, yaw: 0 }
          : { x: concMinX + 5.2, z: concMidZ, yaw: -Math.PI * 0.5 }));

    const jpo1Pos = isIsland
      ? { x: p1MinX + 2.6, z: jpoZ, yaw: 0 }
      : { x: -2.0, z: jpoZ, yaw: 0 };

    const directJpo2 = (ctx && ctx.jpo2LoungePos) || (st && st.jpo2LoungePos) || null;
    const jpo2Pos = directJpo2
      ? { x: directJpo2.x, z: directJpo2.z, yaw: typeof directJpo2.yaw === 'number' ? directJpo2.yaw : (jpo2Z !== null && jpo2Z >= 0 ? Math.PI : 0) }
      : (jpo2Item && jpo2Z !== null
        ? { x: jpo2Item.x, z: jpo2Z, yaw: jpo2Z >= 0 ? Math.PI : 0 }
        : (hasJpo2 && jpo2Z !== null
          ? { x: isIsland ? (p1MinX + 2.6) : -2.2, z: jpo2Z, yaw: 0 }
          : { x: isIsland ? (p1MinX + 3.0) : (concMinX + 2.5), z: jpoZ, yaw: -Math.PI * 0.5 }));

    const plnPos = plnItem
      ? { x: plnItem.x - 1.6, z: plnItem.z + 2.0, yaw: -Math.PI * 0.5 }
      : { x: eastRoadCXVal + 4.5, z: -14.0, yaw: -Math.PI * 0.5 };

    const nwPos = (hubs && hubs.NW && typeof hubs.NW.x === 'number')
      ? { x: hubs.NW.x, z: hubs.NW.z, yaw: typeof hubs.NW.yaw === 'number' ? hubs.NW.yaw : Math.PI }
      : (nwItem
        ? { x: nwItem.x + 1.8, z: nwItem.z - 1.8, yaw: -Math.PI * 0.25 }
        : { x: westColRoadCX, z: 96.0, yaw: Math.PI });

    const nePos = (hubs && hubs.NE && typeof hubs.NE.x === 'number')
      ? { x: hubs.NE.x, z: hubs.NE.z, yaw: typeof hubs.NE.yaw === 'number' ? hubs.NE.yaw : Math.PI }
      : (neItem
        ? { x: neItem.x - 1.8, z: neItem.z - 1.8, yaw: Math.PI * 0.25 }
        : { x: eastColRoadCX, z: 96.0, yaw: Math.PI });

    const swPos = (hubs && hubs.SW && typeof hubs.SW.x === 'number')
      ? { x: hubs.SW.x, z: hubs.SW.z, yaw: typeof hubs.SW.yaw === 'number' ? hubs.SW.yaw : 0 }
      : (swItem
        ? { x: swItem.x + 1.8, z: swItem.z + 1.8, yaw: -Math.PI * 0.75 }
        : { x: westColRoadCX, z: -96.0, yaw: 0 });

    const sePos = (hubs && hubs.SE && typeof hubs.SE.x === 'number')
      ? { x: hubs.SE.x, z: hubs.SE.z, yaw: typeof hubs.SE.yaw === 'number' ? hubs.SE.yaw : 0 }
      : (seItem
        ? { x: seItem.x - 1.8, z: seItem.z + 1.8, yaw: Math.PI * 0.75 }
        : { x: eastColRoadCX, z: -96.0, yaw: 0 });

    const rawZones = [
      { id: 'zone_p1', num: '01', tag: 'Lantai 1 · Maju', name: 'Peron 1 (Jalur Maju)', x: p1MinX + 2.1, floorY: 0.0, z: -16.0, yaw: Math.PI * 0.5 },
      { id: 'zone_p2', num: '02', tag: 'Lantai 1 · Kembali', name: 'Peron 2 (Jalur Kembali)', x: isIsland ? (p1MaxX - 2.0) : (p2MaxX - 2.4), floorY: 0.0, z: -16.0, yaw: -Math.PI * 0.5 },
      { id: 'zone_conc', num: '03', tag: 'Lantai 1 · Plaza', name: 'Concourse & Indomaret Point', x: indoPos.x, floorY: 0.0, z: indoPos.z, yaw: indoPos.yaw },
      { id: 'zone_jpo1', num: '04', tag: 'Lantai 2 · Skybridge', name: 'JPO Utama (Lantai 2)', x: jpo1Pos.x, floorY: 4.25, z: jpo1Pos.z, yaw: jpo1Pos.yaw },
      { id: 'zone_jpo2', num: '05', tag: (hasJpo2 || directJpo2) ? 'Lantai 2 · Lounge' : 'Lantai 2 · Alt Balkon', name: 'JPO 2 Sekunder & Lounge', x: jpo2Pos.x, floorY: 4.25, z: jpo2Pos.z, yaw: jpo2Pos.yaw },
      { id: 'zone_street', num: '06', tag: 'Jalan Raya · Timur', name: 'Jalan Raya & Gerobak / PLN', x: plnPos.x, floorY: -0.82, z: plnPos.z, yaw: plnPos.yaw },
      { id: 'zone_nw', num: '07', tag: 'Pojok NW · Medis', name: 'Pojok NW — Posko Medis PMI', x: nwPos.x, floorY: -0.82, z: nwPos.z, yaw: nwPos.yaw },
      { id: 'zone_ne', num: '08', tag: 'Pojok NE · Gudang', name: 'Pojok NE — Gudang Logistik', x: nePos.x, floorY: -0.82, z: nePos.z, yaw: nePos.yaw },
      { id: 'zone_sw', num: '09', tag: 'Pojok SW · Militer', name: 'Pojok SW — Konvoi Militer', x: swPos.x, floorY: -0.82, z: swPos.z, yaw: swPos.yaw },
      { id: 'zone_se', num: '10', tag: 'Pojok SE · Warung', name: 'Pojok SE — Pos Ronda & Warung', x: sePos.x, floorY: -0.82, z: sePos.z, yaw: sePos.yaw }
    ];

    return rawZones.map((z) => {
      const safe = resolveSafeCheckpointPosition(z.x, z.floorY, z.z, z.yaw);
      return {
        id: z.id,
        num: z.num,
        tag: z.tag,
        name: z.name,
        floorY: z.floorY,
        x: safe.x,
        y: safe.y,
        z: safe.z,
        yaw: safe.yaw
      };
    });
  }

  function syncFastTravelAtmosphereUi(lightingKey) {
    const grp = dom['ft-atmos-group'];
    if (!grp) return;
    const rawKey = lightingKey || (I.core && I.core.currentLightingKey) || 'DAYLIGHT_CLEAR';
    const matchKey = rawKey === 'AMBER_SUNSET' ? 'GOLDEN_DUSK' : rawKey;
    grp.querySelectorAll('[data-ft-mood]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.ftMood === matchKey);
    });
  }

  function jumpToFastTravelStation(idx) {
    const stations = getFastTravelStations();
    const targetIdx = Math.max(0, Math.min(stations.length - 1, idx | 0));
    const wasFromPause = fastTravelFromPause || !!(dom['pause-overlay'] && !dom['pause-overlay'].classList.contains('hidden'));

    if (PL.state) PL.state.fastTravelOpen = false;
    if (dom['fast-travel-modal']) dom['fast-travel-modal'].classList.add('hidden');
    fastTravelFromPause = false;
    pausedByFastTravel = false;

    if (LRT.Director && typeof LRT.Director.jumpToStation === 'function') {
      LRT.Director.jumpToStation(targetIdx);
    } else if (I.core && typeof I.core.jumpToStation === 'function') {
      I.core.jumpToStation(targetIdx);
    } else if (window.__LRT_DEBUG__ && typeof window.__LRT_DEBUG__.jumpToStation === 'function') {
      window.__LRT_DEBUG__.jumpToStation(targetIdx);
    }

    if (wasFromPause && LRT.Main && typeof LRT.Main.resume === 'function') {
      LRT.Main.resume();
    } else {
      if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
      showScreen('play');
      LRT.PlayerUI.setPaused(false, true);
      if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') LRT.Audio.setGameplayPaused(false);
      if (PL.relockAfterOverlay) PL.relockAfterOverlay();
      else if (PL.requestLock) PL.requestLock();
    }

    const targetArch = stations[targetIdx] || {};
    setNotice(`FAST TRAVEL: ${String(targetArch.name || ('Stasiun ' + (targetIdx + 1))).toUpperCase()}`, '#22c55e');
    if (LRT.Audio) LRT.Audio.play('station_chime', { gain: 0.65 });
  }

  function teleportToFastTravelZone(zone) {
    if (!zone) return;
    const core = I.core;
    const curIdx = (core && typeof core.stationIndex === 'number') ? core.stationIndex : 0;
    const gs = core ? core.gameState : null;
    const inTransit = gs === C.STATES.TRAIN_DEPARTING || gs === C.STATES.TRAIN_CRUISE || gs === C.STATES.TRAIN_ARRIVING;
    if (inTransit || (LRT.Station && !LRT.Station.rootGroup)) {
      if (LRT.Director && typeof LRT.Director.jumpToStation === 'function') {
        LRT.Director.jumpToStation(curIdx);
      } else if (window.__LRT_DEBUG__ && typeof window.__LRT_DEBUG__.jumpToStation === 'function') {
        window.__LRT_DEBUG__.jumpToStation(curIdx);
      }
    }

    if (PL.state && PL.state.isSitting && PL.standFromSeat) {
      PL.standFromSeat(true);
    }
    if (PL.state) {
      PL.state.isInsideTrain = false;
      PL.state.grounded = true;
    }

    const safe = resolveSafeCheckpointPosition(zone.x, zone.floorY, zone.z, zone.yaw);
    LRT.PlayerUI.setPosition(safe.x, safe.y, safe.z);
    if (typeof safe.yaw === 'number') {
      LRT.PlayerUI.setLook(safe.yaw, 0);
    }

    closeFastTravelModal(true, true, true);
    if (core && typeof core.updateCityVisibility === 'function') {
      core.updateCityVisibility(PL.state);
    }
    if (core && typeof core.updateSunTracking === 'function') {
      core.updateSunTracking(safe.x, safe.z);
    }
    if (core && typeof core.renderFrame === 'function') {
      core.renderFrame();
    }
    setNotice(`FAST TRAVEL: ${String(zone.name).toUpperCase()}`, '#38bdf8');
    if (LRT.Audio) LRT.Audio.play('turnstile_beep', { gain: 0.55 });
  }

  function renderFastTravelModal() {
    const stations = getFastTravelStations();
    const core = I.core;
    const curIdx = (core && typeof core.stationIndex === 'number') ? core.stationIndex : 0;
    const curArch = stations[curIdx % stations.length] || {};

    if (dom['ft-active-meta']) {
      const p = PL.state && PL.state.pos ? PL.state.pos : { x: 0, y: 0, z: 0 };
      dom['ft-active-meta'].textContent =
        `Stasiun Aktif: ${curArch.name || 'Dukuh Atas BSI'} (${curArch.code || 'CB01'}) · Pos (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
    }
    if (dom['ft-zones-sub']) {
      dom['ft-zones-sub'].textContent = `Zona aman untuk ${curArch.name || 'Stasiun Aktif'}`;
    }

    const stListEl = dom['ft-station-list'];
    if (stListEl) {
      stListEl.innerHTML = '';
      for (let i = 0; i < stations.length; i++) {
        const arch = stations[i];
        const meta = getStationBadgeMeta(arch, i);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ft-station-card' + (i === curIdx ? ' is-active' : '');
        btn.dataset.stationIdx = String(i);

        const top = document.createElement('div');
        top.className = 'ft-st-top';
        const codeEl = document.createElement('span');
        codeEl.className = 'ft-st-code';
        codeEl.textContent = `0${i + 1} · ${arch.code || ''}`;
        const badgeEl = document.createElement('span');
        badgeEl.className = 'ft-st-badge';
        badgeEl.textContent = i === curIdx ? `${meta.badge} · AKTIF` : meta.badge;
        top.appendChild(codeEl);
        top.appendChild(badgeEl);

        const nameEl = document.createElement('div');
        nameEl.className = 'ft-st-name';
        nameEl.textContent = arch.name || `Stasiun ${i + 1}`;

        const distEl = document.createElement('div');
        distEl.className = 'ft-st-district';
        distEl.textContent = meta.district;

        btn.appendChild(top);
        btn.appendChild(nameEl);
        btn.appendChild(distEl);
        btn.addEventListener('click', () => jumpToFastTravelStation(i));
        stListEl.appendChild(btn);
      }
    }

    const zoneGridEl = dom['ft-zone-grid'];
    if (zoneGridEl) {
      zoneGridEl.innerHTML = '';
      const zones = computeFastTravelZones();
      for (let zi = 0; zi < zones.length; zi++) {
        const z = zones[zi];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ft-zone-card';
        btn.dataset.zoneId = z.id;

        const head = document.createElement('div');
        head.className = 'ft-zone-head';
        const numEl = document.createElement('span');
        numEl.className = 'ft-zone-num';
        numEl.textContent = z.num;
        const tagEl = document.createElement('span');
        tagEl.className = 'ft-zone-tag';
        tagEl.textContent = z.tag;
        head.appendChild(numEl);
        head.appendChild(tagEl);

        const nameEl = document.createElement('div');
        nameEl.className = 'ft-zone-name';
        nameEl.textContent = z.name;

        const coordEl = document.createElement('div');
        coordEl.className = 'ft-zone-coords';
        coordEl.textContent = `X ${z.x.toFixed(1)} · Y ${z.y.toFixed(1)} · Z ${z.z.toFixed(1)}`;

        btn.appendChild(head);
        btn.appendChild(nameEl);
        btn.appendChild(coordEl);
        btn.addEventListener('click', () => teleportToFastTravelZone(z));
        zoneGridEl.appendChild(btn);
      }
    }

    syncFastTravelAtmosphereUi();
  }

  function syncFastTravelAvailability() {
    const unlocked = !!(PL.isFastTravelUnlocked && PL.isFastTravelUnlocked());
    if (dom['btn-pause-fast-travel']) {
      dom['btn-pause-fast-travel'].classList.toggle('hidden', !unlocked);
    }
    if (dom['pill-fast-travel']) {
      dom['pill-fast-travel'].classList.toggle('hidden', !unlocked);
    }
    return unlocked;
  }

  function openFastTravelModal(opts) {
    if (!syncFastTravelAvailability()) return false;
    const o = opts || {};
    const modal = dom['fast-travel-modal'];
    if (!modal) return false;
    const gs = I.core ? I.core.gameState : null;
    if (gs === C.STATES.MENU || gs === C.STATES.GAME_OVER) return false;
    if (PL.state && PL.state.fastTravelOpen) return true;

    if (PL.closeCheatConsole) PL.closeCheatConsole(false);
    if (PL.state && PL.state.docViewerOpen) closeDocViewer(false, true);

    const pauseOpen = !!(o.fromPause || (dom['pause-overlay'] && !dom['pause-overlay'].classList.contains('hidden')));
    fastTravelFromPause = pauseOpen;
    if (!fastTravelFromPause) {
      pausedByFastTravel = !PL.flags.paused;
      if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
      LRT.PlayerUI.setPaused(true, false);
      if (PL.callbacks && PL.callbacks.onWeaponShootUp) PL.callbacks.onWeaponShootUp();
      if (PL.releaseLock) PL.releaseLock();
    } else {
      pausedByFastTravel = false;
    }

    if (PL.state) PL.state.fastTravelOpen = true;
    renderFastTravelModal();
    modal.classList.remove('hidden');
    if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') {
      LRT.Audio.setGameplayPaused(true);
    }
    return true;
  }

  function closeFastTravelModal(refocusGame, silent, forceExitPause) {
    const modal = dom['fast-travel-modal'];
    const wasOpen = !!(PL.state && PL.state.fastTravelOpen);
    if (PL.state) PL.state.fastTravelOpen = false;
    if (modal) modal.classList.add('hidden');

    const fromPause = fastTravelFromPause;
    const shouldUnpause = pausedByFastTravel;
    fastTravelFromPause = false;
    pausedByFastTravel = false;

    if (!wasOpen && !forceExitPause) return false;
    for (const k of Object.keys(PL.keys)) PL.keys[k] = false;

    if (forceExitPause) {
      if (fromPause || (dom['pause-overlay'] && !dom['pause-overlay'].classList.contains('hidden'))) {
        if (LRT.Main && typeof LRT.Main.resume === 'function') {
          LRT.Main.resume();
          return true;
        }
        showScreen('play');
        LRT.PlayerUI.setPaused(false, true);
        if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') LRT.Audio.setGameplayPaused(false);
      } else if (shouldUnpause) {
        if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
        LRT.PlayerUI.setPaused(false, true);
        if (LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') LRT.Audio.setGameplayPaused(false);
      }
      if (refocusGame !== false && PL.flags.allowActionInput && !PL.flags.paused) {
        if (PL.relockAfterOverlay) PL.relockAfterOverlay();
        else if (PL.requestLock) PL.requestLock();
      }
      return true;
    }

    if (!fromPause) {
      if (shouldUnpause) {
        if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
        LRT.PlayerUI.setPaused(false, true);
      }
      const pauseHidden = !dom['pause-overlay'] || dom['pause-overlay'].classList.contains('hidden');
      if (pauseHidden && LRT.Audio && typeof LRT.Audio.setGameplayPaused === 'function') {
        LRT.Audio.setGameplayPaused(false);
      }
      if (refocusGame !== false && PL.flags.allowActionInput && !PL.flags.paused) {
        if (PL.relockAfterOverlay) PL.relockAfterOverlay();
        else if (PL.requestLock) PL.requestLock();
      }
    }
    if (!silent && LRT.Audio && (!LRT.Audio.isGameplayPaused || !LRT.Audio.isGameplayPaused())) {
      LRT.Audio.play('turnstile_beep', { gain: 0.30 });
    }
    return true;
  }

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

  function syncAllSettingsUi(settings) {
    const s = settings || {};
    syncDifficultyUi(s.difficultyKey || s.difficulty || 'medium');
    syncAtmosphereUi(s.atmosphereMode || 'night_horror');
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
        if (I.core && typeof I.core.renderFrame === 'function') {
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

  function openTutorialCompleteModal() {
    const ov = dom['tutorial-complete-overlay'];
    if (!ov) return false;
    if (PL.closeCheatConsole) PL.closeCheatConsole(false);
    if (PL.state && PL.state.docViewerOpen) closeDocViewer(false, true);
    if (PL.state && PL.state.fastTravelOpen) closeFastTravelModal(false, true);
    if (PL.suppressPauseAfterUnlock) PL.suppressPauseAfterUnlock(900);
    if (LRT.PlayerUI && typeof LRT.PlayerUI.setPaused === 'function') {
      LRT.PlayerUI.setPaused(true, false);
    }
    if (PL.callbacks && PL.callbacks.onWeaponShootUp) PL.callbacks.onWeaponShootUp();
    if (PL.releaseLock) PL.releaseLock();
    if (dom['pause-overlay']) dom['pause-overlay'].classList.add('hidden');
    ov.classList.remove('hidden');
    return true;
  }

  function closeTutorialCompleteModal() {
    const ov = dom['tutorial-complete-overlay'];
    if (ov) ov.classList.add('hidden');
  }

  function showScreen(screenName) {
    if (dom['menu-overlay']) dom['menu-overlay'].classList.toggle('hidden', screenName !== 'menu');
    if (dom['pause-overlay']) dom['pause-overlay'].classList.toggle('hidden', screenName !== 'pause');
    if (dom['gameover-overlay']) dom['gameover-overlay'].classList.toggle('hidden', screenName !== 'gameover');
    if (dom['tutorial-complete-overlay']) dom['tutorial-complete-overlay'].classList.add('hidden');
    if (dom.hud) dom.hud.classList.toggle('hidden', screenName !== 'play');
    syncFastTravelAvailability();
    if (screenName !== 'play' && PL.closeCheatConsole) {
      PL.closeCheatConsole(false);
    }
    if (screenName !== 'play' && screenName !== 'pause') {
      closeDocViewer(false, true);
      closeFastTravelModal(false, true);
    }
    if (screenName !== 'menu') {
      setMenuSubpanel(null);
    }
    setPauseSubpanel(null);
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
      if (screenName === 'menu') {
        refreshContinueButton();
      }
    }
  }

  // Shows CONTINUE (with save details) only when a valid checkpoint exists; relabels NEW GAME accordingly.
  function refreshContinueButton() {
    const core = I.core;
    const summary = (core && typeof core.getSaveSummary === 'function') ? core.getSaveSummary() : null;
    if (dom['btn-continue']) dom['btn-continue'].classList.toggle('hidden', !summary);
    if (dom['new-game-title']) dom['new-game-title'].textContent = summary ? 'NEW GAME (OVERWRITE SAVE)' : 'NEW GAME';
    if (summary && dom['continue-sub']) {
      const tier = C.DIFFICULTY_TIERS && C.DIFFICULTY_TIERS[summary.difficultyKey];
      const diff = tier ? tier.label : String(summary.difficultyKey || '').toUpperCase();
      const atmo = summary.atmosphereMode === 'daylight_outbreak' ? 'Daylight–Sunset' : 'Night Horror';
      dom['continue-sub'].textContent = `Station ${summary.stationIndex + 1} · ${summary.stationName} · ${diff} · ${atmo}`;
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

  PL.setNotice = setNotice;
  PL.showFieldLog = showFieldLog;
  PL.openDocViewer = openDocViewer;
  PL.closeDocViewer = closeDocViewer;
  PL.openFastTravelModal = openFastTravelModal;
  PL.closeFastTravelModal = closeFastTravelModal;
  PL.syncFastTravelAvailability = syncFastTravelAvailability;
  PL.openTutorialCompleteModal = openTutorialCompleteModal;
  PL.closeTutorialCompleteModal = closeTutorialCompleteModal;
  PL.toggleHud = toggleHud;
  PL.syncMuteUi = syncMuteUi;
  PL.syncAtmosphereUi = syncAtmosphereUi;

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
    syncAtmosphereUi,
    syncResScaleUi,
    syncShadowsUi,
    syncBloomUi,
    syncAoUi,
    syncFpsUi,
    syncSubtitlesUi,
    syncSubtitleLangUi,
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
