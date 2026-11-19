(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const PL = (I.player = I.player || {});
  const C = LRT.Config;

  let logTimer = 0;
  let pausedByDocViewer = false;
  let docViewerFromPause = false;

  let creditsRafId = 0;
  let creditsLastTs = 0;
  let creditsScrollPos = 0;
  let creditsPaused = false;
  let creditsEnded = false;
  let creditsCollapsed = false;

  function setMenuSubpanel(panelName) {
    const dom = PL.dom || {};
    const showSettings = panelName === 'settings';
    const showControls = panelName === 'controls';
    const anySub = showSettings || showControls;
    if (dom['menu-overlay']) dom['menu-overlay'].classList.toggle('subview-open', anySub);
    if (dom['menu-main-view']) dom['menu-main-view'].classList.toggle('subview-hidden', anySub);
    if (dom['menu-settings-panel']) {
      dom['menu-settings-panel'].classList.toggle('hidden', !showSettings);
      if (showSettings && PL.applySettingsCategoryFilter) PL.applySettingsCategoryFilter(dom['menu-settings-panel'], 'all');
    }
    if (dom['menu-controls-panel']) dom['menu-controls-panel'].classList.toggle('hidden', !showControls);
    if (dom['btn-menu-settings']) dom['btn-menu-settings'].classList.toggle('active', showSettings);
    if (dom['btn-menu-controls']) dom['btn-menu-controls'].classList.toggle('active', showControls);
  }

  function setPauseSubpanel(panelName) {
    const dom = PL.dom || {};
    const showSettings = panelName === 'settings';
    const showControls = panelName === 'controls';
    const showLogs = panelName === 'logs';
    const anySub = showSettings || showControls || showLogs;
    if (dom['pause-overlay']) dom['pause-overlay'].classList.toggle('subview-open', anySub);
    if (dom['pause-main-view']) dom['pause-main-view'].classList.toggle('hidden', anySub);
    if (dom['pause-settings-panel']) {
      dom['pause-settings-panel'].classList.toggle('hidden', !showSettings);
      if (showSettings && PL.applySettingsCategoryFilter) PL.applySettingsCategoryFilter(dom['pause-settings-panel'], 'all');
    }
    if (dom['pause-controls-panel']) dom['pause-controls-panel'].classList.toggle('hidden', !showControls);
    if (dom['pause-logs-panel']) dom['pause-logs-panel'].classList.toggle('hidden', !showLogs);
    if (dom['btn-pause-settings']) dom['btn-pause-settings'].classList.toggle('active', showSettings);
    if (dom['btn-pause-controls']) dom['btn-pause-controls'].classList.toggle('active', showControls);
    if (dom['btn-pause-logs']) dom['btn-pause-logs'].classList.toggle('active', showLogs);
  }

  function renderPauseFieldLogs() {
    const dom = PL.dom || {};
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
    const dom = PL.dom || {};
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
    const dom = PL.dom || {};
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
    const dom = PL.dom || {};
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
    const dom = PL.dom || {};
    const o = (typeof opts === 'number') ? { durationSec: opts } : (opts || {});
    if (I.core && typeof I.core.recordFieldLog === 'function') {
      I.core.recordFieldLog(title, body);
    }
    if (openDocViewer(title, body, o)) return;
    const banner = dom['hud-log-banner'];
    if (!banner) return;
    if (dom['hud-log-title']) dom['hud-log-title'].textContent = title || 'Catatan';
    if (dom['hud-log-body']) dom['hud-log-body'].textContent = body || '';
    banner.classList.remove('hidden');
    banner.style.opacity = '1';
    logTimer = Math.max(3.5, typeof o.durationSec === 'number' ? o.durationSec : 8.0);
  }

  function hideFieldLog() {
    const dom = PL.dom || {};
    logTimer = 0;
    const banner = dom['hud-log-banner'];
    if (banner) {
      banner.style.opacity = '0';
      banner.classList.add('hidden');
    }
  }

  function tickFieldLog(dt) {
    if (logTimer > 0) {
      logTimer -= dt;
      if (logTimer <= 0) {
        hideFieldLog();
      }
    }
  }

  function stopCreditsRoll() {
    if (creditsRafId) {
      window.cancelAnimationFrame(creditsRafId);
      creditsRafId = 0;
    }
    creditsLastTs = 0;
  }

  function syncCreditsControlsUi() {
    const dom = PL.dom || {};
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
    const dom = PL.dom || {};
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
    const dom = PL.dom || {};
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
    const dom = PL.dom || {};
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

  function bindOverlayInputs() {
    const dom = PL.dom || {};
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
      });
    }
  }

  function openTutorialCompleteModal() {
    const dom = PL.dom || {};
    const ov = dom['tutorial-complete-overlay'];
    if (!ov) return false;
    if (PL.closeCheatConsole) PL.closeCheatConsole(false);
    if (PL.state && PL.state.docViewerOpen) closeDocViewer(false, true);
    if (PL.state && PL.state.fastTravelOpen && PL.closeFastTravelModal) PL.closeFastTravelModal(false, true);
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
    const dom = PL.dom || {};
    const ov = dom['tutorial-complete-overlay'];
    if (ov) ov.classList.add('hidden');
  }

  function refreshContinueButton() {
    const dom = PL.dom || {};
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

  function showScreen(screenName) {
    const dom = PL.dom || {};
    if (dom['menu-overlay']) dom['menu-overlay'].classList.toggle('hidden', screenName !== 'menu');
    if (dom['pause-overlay']) dom['pause-overlay'].classList.toggle('hidden', screenName !== 'pause');
    if (dom['gameover-overlay']) dom['gameover-overlay'].classList.toggle('hidden', screenName !== 'gameover');
    if (dom['tutorial-complete-overlay']) dom['tutorial-complete-overlay'].classList.add('hidden');
    if (dom.hud) dom.hud.classList.toggle('hidden', screenName !== 'play');
    if (PL.syncFastTravelAvailability) PL.syncFastTravelAvailability();
    if (screenName !== 'play' && PL.closeCheatConsole) {
      PL.closeCheatConsole(false);
    }
    if (screenName !== 'play' && screenName !== 'pause') {
      closeDocViewer(false, true);
      if (PL.closeFastTravelModal) PL.closeFastTravelModal(false, true);
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
        if (PL.syncAllSettingsUi) PL.syncAllSettingsUi(I.core.getSettings());
      } else if (LRT.Main && typeof LRT.Main.getBrightness === 'function') {
        if (PL.syncBrightnessUi) PL.syncBrightnessUi(LRT.Main.getBrightness());
      } else if (PL.syncBrightnessUi) {
        PL.syncBrightnessUi(PL.getCurrentBrightness ? PL.getCurrentBrightness() : 1.0);
      }
      if (LRT.Main && typeof LRT.Main.getLightingMode === 'function' && PL.syncLightingUi) {
        const lk = LRT.Main.getLightingMode();
        PL.syncLightingUi(lk, C.MOODS ? C.MOODS[lk] : null);
      }
      if (screenName === 'pause') {
        renderPauseFieldLogs();
      }
      if (screenName === 'menu') {
        refreshContinueButton();
      }
    }
  }

  PL.isPausedByDocViewer = () => pausedByDocViewer;
  PL.setMenuSubpanel = setMenuSubpanel;
  PL.setPauseSubpanel = setPauseSubpanel;
  PL.renderPauseFieldLogs = renderPauseFieldLogs;
  PL.openDocViewer = openDocViewer;
  PL.closeDocViewer = closeDocViewer;
  PL.showFieldLog = showFieldLog;
  PL.hideFieldLog = hideFieldLog;
  PL.tickFieldLog = tickFieldLog;
  PL.setVictoryCreditsActive = setVictoryCreditsActive;
  PL.bindOverlayInputs = bindOverlayInputs;
  PL.openTutorialCompleteModal = openTutorialCompleteModal;
  PL.closeTutorialCompleteModal = closeTutorialCompleteModal;
  PL.refreshContinueButton = refreshContinueButton;
  PL.showScreen = showScreen;
})(window.LRT = window.LRT || {});
