#!/usr/bin/env python3
"""Build script for hydrogen-subway (Post-Apocalyptic Jakarta LRT 3D FPS).

- Ensures pinned offline ESM vendor libraries exist in vendor/:
  - three@0.170.0 (three.module.min.js + recursively resolved examples/jsm addons + glTF Draco decoders)
  - three-mesh-bvh@0.8.3 (build/index.module.js)
  - n8ao@1.9.3 (dist/N8AO.js)
- Reads assets/sfx/sfx_bank.json and writes vendor/sfx_bank.js
- Reads assets/voice/manifest.json and embeds offline voice metadata
- Emits index.html (and dev.html) using an offline ES module importmap + src/boot.js
"""
from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENDOR_DIR = ROOT / "vendor"
SRC_DIR = ROOT / "src"
RESEARCH_DIR = ROOT / "research"

USER_AGENT = "HydrogenSubwayAssetFetcher/1.0"

THREE_VERSION = "0.170.0"
BVH_VERSION = "0.8.3"
N8AO_VERSION = "1.9.3"

THREE_BASE_URL = f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}"
BVH_URL = f"https://cdn.jsdelivr.net/npm/three-mesh-bvh@{BVH_VERSION}/build/index.module.js"
N8AO_URL = f"https://cdn.jsdelivr.net/npm/n8ao@{N8AO_VERSION}/dist/N8AO.js"

JSM_SEEDS = [
    "loaders/GLTFLoader.js",
    "loaders/DRACOLoader.js",
    "loaders/RGBELoader.js",
    "utils/BufferGeometryUtils.js",
    "geometries/RoundedBoxGeometry.js",
    "postprocessing/EffectComposer.js",
    "postprocessing/RenderPass.js",
    "postprocessing/UnrealBloomPass.js",
    "postprocessing/OutputPass.js",
    "postprocessing/ShaderPass.js",
    "postprocessing/Pass.js",
    "postprocessing/MaskPass.js",
    "shaders/CopyShader.js",
    "shaders/LuminosityHighPassShader.js",
    "shaders/OutputShader.js",
    "objects/Sky.js",
]

DRACO_FILES = [
    "draco_decoder.js",
    "draco_decoder.wasm",
    "draco_wasm_wrapper.js",
]

IMPORT_SPEC_RE = re.compile(
    r"""(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]"""
)

REQUIRED_SRC_MODULES = [
    "config.js",
    "audio.js",
    "asset_loader.js",
    "render/textures_procedural.js",
    "render/materials_shaders.js",
    "city/city_protos.js",
    "city/city_clutter.js",
    "city/city_mission_props.js",
    "city/city_district.js",
    "city/city_api.js",
    "station/station_geo.js",
    "station/station_arch.js",
    "station/station_props.js",
    "station/station_lore_loot.js",
    "station/station_nav_props.js",
    "station/station_api.js",
    "train/train_builders.js",
    "train/train_fx_damage.js",
    "train/train_api.js",
    "weapons/weapons_catalog.js",
    "weapons/weapons_models.js",
    "weapons/weapons_fx_ballistics.js",
    "enemies/enemies_nav.js",
    "enemies/enemies_mesh.js",
    "enemies/enemies_procedural.js",
    "enemies/enemies_rig_pool.js",
    "enemies/enemies_pose.js",
    "enemies/enemies_ai.js",
    "player/player_physics.js",
    "player/fast_travel.js",
    "player/hud_overlays.js",
    "player/player_hud.js",
    "core/render_pipeline.js",
    "core/save_system.js",
    "core/wave_spawner.js",
    "core/campaign_director.js",
    "core/tutorial_director.js",
    "main.js",
    "boot.js",
]

HEAD_EXTRA_STYLES = """  <style id="loading-overlay-styles">
    #loading-overlay {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #040507;
      color: #e8e5df;
      font-family: 'Segoe UI', 'Helvetica Neue', system-ui, -apple-system, sans-serif;
    }
    #loading-overlay .loading-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 18px;
      padding: 0;
      background: transparent;
      border: none;
    }
    #loading-overlay .loading-emblem {
      width: 28px;
      height: 28px;
      opacity: 0.62;
      animation: lrt-spin 3.6s linear infinite;
    }
    @keyframes lrt-spin {
      to { transform: rotate(360deg); }
    }
    #loading-overlay .loading-title {
      margin: 0;
      font-size: 19px;
      font-weight: 300;
      letter-spacing: 0.38em;
      text-transform: uppercase;
      color: rgba(242, 240, 234, 0.88);
    }
    #loading-overlay .loading-bar-track {
      width: 200px;
      height: 1px;
      background: rgba(242, 240, 234, 0.12);
      overflow: hidden;
    }
    #loading-overlay #loading-bar-fill {
      width: 0%;
      height: 100%;
      background: rgba(242, 240, 234, 0.78);
      transition: width 0.16s ease-out;
    }
    #loading-overlay #loading-status {
      font-size: 10.5px;
      font-weight: 300;
      letter-spacing: 0.14em;
      color: rgba(212, 208, 198, 0.42);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 320px;
    }
    .tool-pills {
      flex-wrap: wrap;
    }
  </style>"""

IMPORTMAP_JSON = """{
  "imports": {
    "three": "./vendor/three/three.module.min.js",
    "three/addons/": "./vendor/three/addons/",
    "three/examples/jsm/": "./vendor/three/addons/",
    "three-mesh-bvh": "./vendor/three-mesh-bvh/index.module.js",
    "n8ao": "./vendor/n8ao/N8AO.js",
    "postprocessing": "./vendor/three/addons/postprocessing/Pass.js"
  }
}"""

BODY_MARKUP = """  <canvas id="game-canvas"></canvas>
  <div id="damage-vignette"></div>

  <!-- Minimalist Loading Screen -->
  <div id="loading-overlay">
    <div class="loading-panel">
      <svg class="loading-emblem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke-opacity="0.22"/>
        <path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"/>
      </svg>
      <h2 class="loading-title">STASIUN MATI</h2>
      <div class="loading-bar-track"><div id="loading-bar-fill"></div></div>
      <div id="loading-status">Memuat stasiun...</div>
    </div>
  </div>

  <div id="hud" class="hidden">
    <div id="hud-top">
      <div id="objective-pill">
        <div class="obj-bar" aria-hidden="true"></div>
        <div class="obj-content">
          <div class="obj-row">
            <svg class="hud-icon obj-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true">
              <path d="M8 1.6L14.4 8L8 14.4L1.6 8Z"/>
              <path d="M8 4.8L11.2 8L8 11.2L4.8 8Z" fill="currentColor" fill-opacity="0.28"/>
            </svg>
            <span class="obj-prefix">MISI:</span>
            <div id="objective-title">CARI JALAN KE PERON</div>
          </div>
          <div id="objective-detail">Clear Platform Infected</div>
          <div id="hud-key-items" class="hidden" aria-live="polite"></div>
        </div>
      </div>

      <div class="transit-card">
        <div class="transit-badges">
          <svg class="hud-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 1.8a4.4 4.4 0 0 0-4.4 4.4c0 3.2 4.4 8 4.4 8s4.4-4.8 4.4-8A4.4 4.4 0 0 0 8 1.8zm0 6a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z"/></svg>
          <span class="badge badge-cb hidden">CB</span>
          <span class="badge badge-bk hidden">BK</span>
          <span class="badge badge-mode" id="hud-mode-badge">SURVIVAL</span>
          <span id="hud-station-code">CB01 / BK01</span>
        </div>
        <div class="station-title" id="hud-station-name">Dukuh Atas BSI</div>
        <div class="station-sub" id="hud-station-sub">Stasiun LRT Jabodebek</div>
        <div id="fps-readout" class="hidden">FPS: -- | Calls: --</div>
        <div class="route-bar" aria-hidden="true">
          <span class="route-seg seg-cb"></span>
          <span class="route-seg seg-bk"></span>
          <span class="route-seg seg-gold"></span>
        </div>
      </div>
    </div>

    <div id="hud-ping-compass" class="hidden" aria-hidden="true">
      <div class="ping-track">
        <div class="ping-center-tick"></div>
        <div class="ping-chevron" id="ping-chevron"></div>
      </div>
      <div class="ping-meta">
        <span id="ping-bearing">N</span>
        <span id="ping-label">OBJEKTIF</span>
        <span id="ping-dist">--m</span>
      </div>
    </div>

    <div id="hud-waypoints" aria-hidden="true"></div>

    <div id="scope-overlay" aria-hidden="true">
      <svg class="scope-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="scopeLensGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(16, 48, 42, 0.02)"/>
            <stop offset="76%" stop-color="rgba(8, 28, 24, 0.14)"/>
            <stop offset="93%" stop-color="rgba(4, 10, 12, 0.62)"/>
            <stop offset="100%" stop-color="rgba(2, 4, 6, 0.98)"/>
          </radialGradient>
          <mask id="scopeApertureMask" maskUnits="userSpaceOnUse" x="-1500" y="-1500" width="4000" height="4000">
            <rect x="-1500" y="-1500" width="4000" height="4000" fill="white"/>
            <circle cx="500" cy="500" r="385" fill="black"/>
          </mask>
        </defs>
        <rect x="-1500" y="-1500" width="4000" height="4000" fill="rgba(3, 4, 7, 0.96)" mask="url(#scopeApertureMask)"/>
        <circle cx="500" cy="500" r="385" fill="url(#scopeLensGrad)" stroke="rgba(18, 24, 28, 0.96)" stroke-width="12"/>
        <circle cx="500" cy="500" r="380" fill="none" stroke="rgba(224, 180, 34, 0.20)" stroke-width="1.2"/>
        <!-- PGO-7 Illuminated Stadiametric Crosshairs & Ballistic Chevrons -->
        <g stroke="#e0b422" stroke-linecap="round" fill="none" opacity="0.92">
          <line x1="175" y1="500" x2="452" y2="500" stroke-width="2"/>
          <line x1="548" y1="500" x2="825" y2="500" stroke-width="2"/>
          <line x1="500" y1="538" x2="500" y2="815" stroke-width="1.8"/>
          <!-- Windage ticks -->
          <line x1="340" y1="491" x2="340" y2="509" stroke-width="1.6"/>
          <line x1="400" y1="493" x2="400" y2="507" stroke-width="1.6"/>
          <line x1="600" y1="493" x2="600" y2="507" stroke-width="1.6"/>
          <line x1="660" y1="491" x2="660" y2="509" stroke-width="1.6"/>
          <!-- Ballistic drop chevrons (100m, 200m, 300m) -->
          <polyline points="484,512 500,500 516,512" stroke-width="2.2"/>
          <polyline points="488,554 500,544 512,554" stroke-width="1.8"/>
          <polyline points="491,596 500,588 509,596" stroke-width="1.6"/>
          <!-- Stadiametric rangefinder curve (bottom-right) -->
          <path d="M 555 660 Q 615 620 680 612" stroke-width="1.4" opacity="0.72"/>
          <line x1="555" y1="670" x2="680" y2="670" stroke-width="1.4" opacity="0.72"/>
        </g>
        <circle cx="500" cy="500" r="2.6" fill="#ff4d2e"/>
      </svg>
      <div class="scope-telemetry">PGO-7V · 2.7× OPTICAL</div>
    </div>

    <div id="crosshair">
      <div class="ch-tick ch-top"></div>
      <div class="ch-tick ch-bot"></div>
      <div class="ch-tick ch-left"></div>
      <div class="ch-tick ch-right"></div>
      <div class="ch-dot"></div>
    </div>
    <div id="hitmarker"></div>

    <div id="hud-notice"></div>
    <div id="interact-prompt" class="hidden">
      <span class="key-cap">E</span>
      <span id="interact-label">Tap Kartu / Interact</span>
    </div>

    <!-- Field Note / Dispatch Log Card Banner -->
    <div id="hud-log-banner" class="hidden">
      <div class="log-kicker">Catatan Lapangan</div>
      <div id="log-title">LOG ENTRY</div>
      <div id="log-body">Log content details...</div>
    </div>

    <!-- Cinema-Style Voiceover Subtitles (Borderless & Transparent) -->
    <div id="hud-subtitle-box" class="hidden">
      <div id="subtitle-speaker" class="badge speaker-occ">Sarah</div>
      <div id="subtitle-text-id">Dialog Bahasa Indonesia</div>
      <div id="subtitle-text-en" class="hidden"></div>
    </div>

    <!-- Cheat Console Bar (` key) -->
    <div id="cheat-console" class="hidden" role="dialog" aria-label="Cheat Console">
      <span class="cheat-prompt">&gt;</span>
      <input id="cheat-input" type="text" maxlength="32" autocomplete="off" spellcheck="false" placeholder="Cheat code..." aria-label="Cheat Code Input">
      <button id="btn-cheat-apply" type="button">Apply</button>
      <span class="cheat-hint">[Enter] · [Esc]</span>
    </div>

    <div id="hud-bottom">
      <div id="vitals-card">
        <div class="vital-row">
          <span class="vital-label" aria-label="Health">HP</span>
          <span class="hp-num-group"><span id="hp-value">100</span><span id="hp-max"> / 100</span></span>
        </div>
        <div class="hp-bar-track"><div id="hp-bar-fill"></div></div>
        <div class="armor-row hidden" id="armor-row">
          <span class="armor-label" aria-label="Armor">
            <svg class="hud-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 1.8l5 2v4.2c0 3.3-2.1 5.6-5 6.4-2.9-.8-5-3.1-5-6.4V3.8l5-2z"/></svg>
          </span>
          <span id="armor-value">0</span>
          <div class="armor-bar-track"><div id="armor-bar-fill"></div></div>
        </div>
        <div class="tool-pills">
          <span class="pill-ind" id="pill-stance">C Jongkok</span>
          <span class="pill-ind" id="pill-flashlight">F Senter</span>
          <span class="pill-ind active" id="pill-lighting">L Cahaya</span>
          <span class="pill-ind active" id="pill-hud">H Layar</span>
          <span class="pill-ind" id="pill-mute">M Suara</span>
          <span class="pill-ind" id="pill-fast-travel">Tab Peta</span>
        </div>
      </div>

      <div id="weapon-panel">
        <div class="cheat-status-row hidden" id="cheat-status-row">
          <div class="cheat-pill cheat-pill-god hidden" id="cheat-pill-god">
            <div class="cheat-pill-header">
              <span class="cheat-pill-label">Painkiller</span>
              <span class="cheat-pill-timer" id="cheat-god-timer">05:00</span>
            </div>
            <div class="cheat-bar-track"><div class="cheat-bar-fill" id="cheat-god-bar"></div></div>
          </div>
          <div class="cheat-pill cheat-pill-sprint hidden" id="cheat-pill-sprint">Fast Sprint</div>
        </div>
        <div id="ammo-card">
          <div id="weapon-silhouette" aria-hidden="true">
            <svg class="wsil-svg" viewBox="0 0 88 38" fill="currentColor"><path d="M10 8h54l4 3v5l-3 2H42l-2 4h-9l-3 12H16l5-16h-5l-4-3V9zM33 18h7l-1.5 3.5h-6.5z"/></svg>
          </div>
          <div id="weapon-name">Pindad G2 9mm</div>
          <div id="weapon-skin-tag" class="hidden"></div>
          <div id="ammo-readout"><span id="ammo-mag">15</span> <span id="ammo-reserve">/ INF</span></div>
        </div>
        <div id="weapon-slots">
          <div class="w-slot active" data-slot="1" title="Pindad G2 9mm">
            <svg class="wslot-icon" viewBox="0 0 36 22" fill="currentColor" aria-hidden="true"><path d="M5 4h22l2 2v3l-1.5 1H18l-1 2.2h-4l-1.5 6.8H6.5l2.3-8.5H6.5L5 9V4z"/></svg>
            <span class="wslot-num">1</span>
          </div>
          <div class="w-slot" data-slot="2" title="Pindad SS2-V4">
            <svg class="wslot-icon" viewBox="0 0 36 22" fill="currentColor" aria-hidden="true"><path d="M2 9h6l2-2h14l2 1.5h8v2h-8l-1 1.5h-5l1.2 6h-3.2l-1.4-5.5h-4.5L8.5 17H5.5l1.2-5H2V9z"/></svg>
            <span class="wslot-num">2</span>
          </div>
          <div class="w-slot" data-slot="3" title="Shotgun 12G">
            <svg class="wslot-icon" viewBox="0 0 36 22" fill="currentColor" aria-hidden="true"><path d="M2 10h8l2-1.5h22v2H22v1.8h-9l-2 4.7H6l1.5-4.5H2V10z"/></svg>
            <span class="wslot-num">3</span>
          </div>
          <div class="w-slot" data-slot="4" title="RPG-7">
            <svg class="wslot-icon" viewBox="0 0 36 22" fill="currentColor" aria-hidden="true"><path d="M2 10h4l2-1.2h16l3-2.3 7 3.5-7 3.5-3-2.3H15l-.8 4.8h-2.5l.8-4.8H8l-2 1.2H2V10z"/></svg>
            <span class="wslot-num">4</span>
          </div>
        </div>
        <div id="weapon-caliber-label">9mm</div>
      </div>
    </div>
  </div>

  <!-- Physical Paper Note / Letter Viewer Modal -->
  <div id="document-viewer-modal" class="doc-viewer-modal hidden" role="dialog" aria-modal="true" aria-labelledby="doc-viewer-title">
    <div class="doc-sheet" id="doc-viewer-sheet">
      <div class="doc-fold-crease" aria-hidden="true"></div>
      <div class="doc-paper-stain" aria-hidden="true"></div>

      <div class="doc-header hidden">
        <div class="doc-header-meta">
          <div class="doc-classification" id="doc-viewer-kicker">Catatan</div>
          <div class="doc-submeta" id="doc-viewer-submeta">Dukuh Atas BSI</div>
        </div>
        <div class="doc-stamp" id="doc-viewer-stamp"></div>
        <button class="doc-close-x" id="btn-doc-close-x" type="button" aria-label="Tutup Dokumen">Tutup</button>
      </div>

      <div class="doc-rule hidden"></div>
      <h2 class="doc-title" id="doc-viewer-title">Catatan</h2>

      <div class="doc-body-wrap">
        <div class="doc-body" id="doc-viewer-body"></div>
      </div>
    </div>

    <div class="doc-footer">
      <span class="doc-footer-hint hidden">Tekan E atau Esc untuk menutup</span>
      <button class="doc-close-btn" id="btn-doc-close" type="button">Tutup</button>
    </div>
  </div>

  <!-- RE-Style Fast Travel & Station Inspector Modal ([Tab] / Pause Menu) -->
  <div id="fast-travel-modal" class="fast-travel-modal hidden" role="dialog" aria-modal="true" aria-labelledby="ft-modal-title">
    <div class="ft-shell">
      <div class="ft-topbar">
        <div class="ft-title-block">
          <div class="ft-kicker">NAVIGASI KORIDOR LRT</div>
          <h2 class="ft-title" id="ft-modal-title">FAST TRAVEL</h2>
          <div class="ft-meta" id="ft-active-meta">Stasiun Aktif: Dukuh Atas BSI (01)</div>
        </div>
        <div class="ft-topbar-actions">
          <div class="ft-atmos-group" id="ft-atmos-group" role="group" aria-label="Atmosphere Lighting Presets">
            <span class="ft-atmos-label">SUASANA:</span>
            <button class="ft-atmos-btn" data-ft-mood="GOLDEN_DUSK" type="button">Sunset</button>
            <button class="ft-atmos-btn" data-ft-mood="HAZY_DUSK" type="button">Dusk</button>
            <button class="ft-atmos-btn" data-ft-mood="BLACKOUT_EMERGENCY" type="button">Night</button>
            <button class="ft-atmos-btn" data-ft-mood="DAYLIGHT_CLEAR" type="button">Daylight</button>
          </div>
          <button class="ft-close-btn" id="btn-fast-travel-close" type="button">TUTUP [TAB / ESC]</button>
        </div>
      </div>

      <div class="ft-columns">
        <section class="ft-col ft-col-stations" aria-label="6 LRT Stations">
          <div class="ft-col-head">
            <span class="ft-col-title">STASIUN LRT JABODEBEK (01&ndash;06)</span>
            <span class="ft-col-sub">Klik stasiun untuk melompat</span>
          </div>
          <div class="ft-station-list" id="ft-station-list"></div>
        </section>

        <section class="ft-col ft-col-zones" aria-label="10 Intra-Station &amp; City Zones">
          <div class="ft-col-head">
            <span class="ft-col-title">ZONA STASIUN &amp; KOTA (10 TITIK)</span>
            <span class="ft-col-sub" id="ft-zones-sub">Teleport aman di stasiun aktif</span>
          </div>
          <div class="ft-zone-grid" id="ft-zone-grid"></div>
        </section>
      </div>
    </div>
  </div>

  <!-- Main Menu Overlay (Cohesive AAA Title & Options Architecture) -->
  <div id="menu-overlay" class="overlay-screen menu-asymmetric">
    <div class="menu-dock zenith-column" id="menu-main-view">
      <div class="zenith-header">
        <div class="zenith-kicker">JAKARTA LRT</div>
        <h1 class="zenith-title">STASIUN MATI</h1>
        <div class="zenith-subtitle">SEKTOR SELATAN</div>
      </div>

      <nav class="zenith-nav" aria-label="Main Menu">
        <button class="zenith-item hidden" id="btn-continue" type="button">
          <span class="zenith-item-title">CONTINUE</span>
          <span class="zenith-item-sub" id="continue-sub">Resume your last checkpoint</span>
        </button>

        <button class="zenith-item" id="btn-start-survival" type="button">
          <span class="zenith-item-title" id="new-game-title">NEW GAME</span>
          <span class="zenith-item-sub">Survival campaign &mdash; clear waves &amp; board the INKA iE203</span>
        </button>

        <button class="zenith-item" id="btn-start-tutorial" type="button">
          <span class="zenith-item-title">BRIEFING</span>
          <span class="zenith-item-sub">Guided training: controls, combat &amp; objectives</span>
        </button>

        <button class="zenith-item" id="btn-start-exploration" type="button">
          <span class="zenith-item-title">EXPLORATION</span>
          <span class="zenith-item-sub">Free-roam without enemies, ride LRT anytime</span>
        </button>

        <button class="zenith-item" id="btn-menu-settings" type="button">
          <span class="zenith-item-title">SETTINGS</span>
          <span class="zenith-item-sub">Gameplay, display, graphics &amp; audio</span>
        </button>

        <button class="zenith-item" id="btn-menu-controls" type="button">
          <span class="zenith-item-title">CONTROLS</span>
          <span class="zenith-item-sub">Operator keybinds &amp; tactical inputs</span>
        </button>

        <button class="zenith-item" id="btn-exit-game" type="button">
          <span class="zenith-item-title">EXIT</span>
          <span class="zenith-item-sub">Save progress &amp; close game</span>
        </button>
      </nav>
    </div>

    <!-- Cohesive Full-Screen AAA Settings View (Replaces Main Menu in-place) -->
    <div id="menu-settings-panel" class="menu-detail-panel aaa-subview-panel hidden">
      <div class="aaa-subview-header">
        <div class="aaa-subview-title-group">
          <div class="zenith-kicker">STASIUN MATI &middot; OPTIONS</div>
          <div class="detail-title">SETTINGS</div>
        </div>
        <div class="aaa-cat-tabs" role="tablist" aria-label="Settings Categories">
          <button class="aaa-cat-tab active" data-settings-cat="all" type="button">ALL</button>
          <button class="aaa-cat-tab" data-settings-cat="gameplay" type="button">GAMEPLAY</button>
          <button class="aaa-cat-tab" data-settings-cat="display" type="button">DISPLAY</button>
          <button class="aaa-cat-tab" data-settings-cat="graphics" type="button">GRAPHICS</button>
          <button class="aaa-cat-tab" data-settings-cat="audio" type="button">AUDIO</button>
        </div>
        <button class="aaa-back-btn" id="btn-menu-settings-back" type="button">&larr; BACK</button>
      </div>

      <div class="aaa-subview-body">
        <div class="setting-group" data-cat="gameplay">
          <div class="setting-group-title">GAMEPLAY</div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">DIFFICULTY</span>
              <span class="setting-desc">Controls enemy count, damage, and supply scarcity.</span>
            </div>
            <div class="zenith-tabs" id="menu-difficulty-group">
              <button class="zenith-tab" data-difficulty="easy" type="button">EASY</button>
              <button class="zenith-tab active" data-difficulty="medium" type="button">MEDIUM</button>
              <button class="zenith-tab" data-difficulty="hard" type="button">HARD</button>
              <button class="zenith-tab" data-difficulty="nightmare" type="button">NIGHTMARE</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">TIME CYCLE</span>
              <span class="setting-desc">Choose dark night horror or bright daytime-to-sunset with faster enemies.</span>
            </div>
            <div class="zenith-tabs" id="menu-atmosphere-group">
              <button class="zenith-tab active" data-atmosphere="night_horror" type="button">NIGHT HORROR</button>
              <button class="zenith-tab" data-atmosphere="daylight_outbreak" type="button">DAYLIGHT&ndash;SUNSET</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">DISMEMBERMENT</span>
              <span class="setting-desc">Enable or disable enemy limb severing and headshot decapitation.</span>
            </div>
            <button class="zenith-toggle" id="btn-menu-dismember" type="button">ON</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">WAYPOINTS</span>
              <span class="setting-desc">Controls objective diamond HUD markers (Off, Proximity fade, or Always On).</span>
            </div>
            <div class="zenith-tabs" id="menu-waypoint-group">
              <button class="zenith-tab" data-waypoint="off" type="button">OFF</button>
              <button class="zenith-tab active" data-waypoint="proximity" type="button">PROXIMITY</button>
              <button class="zenith-tab" data-waypoint="on" type="button">ON</button>
            </div>
          </div>
        </div>

        <div class="setting-group" data-cat="display">
          <div class="setting-group-title">DISPLAY</div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">LIGHTING PRESET</span>
              <span class="setting-desc">Cycles the sky and atmosphere mood in-game.</span>
            </div>
            <button class="zenith-toggle" id="btn-menu-lighting" type="button">DAYLIGHT</button>
          </div>
          <div class="setting-block">
            <div class="setting-head">
              <div class="setting-info">
                <span class="setting-label">BRIGHTNESS</span>
                <span class="setting-desc">Adjusts overall scene exposure for dark stations.</span>
              </div>
              <span class="setting-readout" id="brightness-readout">100% DARK HORROR</span>
            </div>
            <input type="range" id="brightness-slider" class="zenith-slider" min="0.4" max="1.8" step="0.05" value="1.0" aria-label="Atmosphere Brightness">
          </div>
        </div>

        <div class="setting-group" data-cat="graphics">
          <div class="setting-group-title">GRAPHICS</div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">QUALITY PRESET</span>
              <span class="setting-desc">Overall visual fidelity and performance balance from Low to High.</span>
            </div>
            <div class="zenith-tabs" id="menu-quality-group">
              <button class="zenith-tab" data-quality="potato" type="button">LOW</button>
              <button class="zenith-tab active" data-quality="balanced" type="button">MEDIUM</button>
              <button class="zenith-tab" data-quality="high" type="button">HIGH</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">RENDER SCALE</span>
              <span class="setting-desc">Internal 3D rendering resolution.</span>
            </div>
            <div class="zenith-tabs" id="menu-resscale-group">
              <button class="zenith-tab active" data-resscale="floor_720" type="button">720P</button>
              <button class="zenith-tab" data-resscale="native" type="button">NATIVE</button>
              <button class="zenith-tab" data-resscale="scale_125" type="button">1.25X</button>
              <button class="zenith-tab" data-resscale="scale_150" type="button">1.5X</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">SHADOWS</span>
              <span class="setting-desc">Dynamic directional shadows from pillars and enemies.</span>
            </div>
            <button class="zenith-toggle" id="btn-menu-shadows" type="button">ON</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">BLOOM</span>
              <span class="setting-desc">Soft light glow on lamps and muzzle flashes.</span>
            </div>
            <button class="zenith-toggle" id="btn-menu-bloom" type="button">ON</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">AMBIENT OCCLUSION</span>
              <span class="setting-desc">Contact shading in corners and beneath objects.</span>
            </div>
            <div class="zenith-tabs" id="menu-ao-group">
              <button class="zenith-tab active" data-ao="off" type="button">OFF</button>
              <button class="zenith-tab" data-ao="half" type="button">HALF</button>
              <button class="zenith-tab" data-ao="full" type="button">FULL</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">FPS COUNTER</span>
              <span class="setting-desc">Displays frame rate in the top-right corner.</span>
            </div>
            <button class="zenith-toggle is-off" id="btn-menu-fps" type="button">OFF</button>
          </div>
        </div>

        <div class="setting-group" data-cat="audio">
          <div class="setting-group-title">AUDIO &amp; SUBTITLES</div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">SOUND</span>
              <span class="setting-desc">Master audio for sound effects, ambience, and voiceover.</span>
            </div>
            <button class="zenith-toggle" id="btn-menu-mute" type="button">ON</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">SUBTITLES</span>
              <span class="setting-desc">Show or hide voiceover subtitles at the bottom of the screen.</span>
            </div>
            <button class="zenith-toggle" id="btn-menu-subtitles" type="button">ON</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">SUBTITLE LANGUAGE</span>
              <span class="setting-desc">Display subtitles in either Indonesian or English.</span>
            </div>
            <div class="zenith-tabs" id="menu-sublang-group">
              <button class="zenith-tab active" data-sublang="id" type="button">INDONESIAN</button>
              <button class="zenith-tab" data-sublang="en" type="button">ENGLISH</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="menu-controls-panel" class="menu-detail-panel aaa-subview-panel hidden">
      <div class="aaa-subview-header">
        <div class="aaa-subview-title-group">
          <div class="zenith-kicker">STASIUN MATI &middot; KEYBINDS</div>
          <div class="detail-title">CONTROLS</div>
        </div>
        <button class="aaa-back-btn" id="btn-menu-controls-back" type="button">&larr; BACK</button>
      </div>
      <div class="aaa-subview-body">
        <div class="controls-list">
          <div class="ctrl-row"><span class="ctrl-key">WASD</span><span class="ctrl-desc">Move</span></div>
          <div class="ctrl-row"><span class="ctrl-key">SPACE</span><span class="ctrl-desc">Jump</span></div>
          <div class="ctrl-row"><span class="ctrl-key">SHIFT / CTRL</span><span class="ctrl-desc">Sprint / Crouch</span></div>
          <div class="ctrl-row"><span class="ctrl-key">LMB / RMB</span><span class="ctrl-desc">Fire / Aim (ADS)</span></div>
          <div class="ctrl-row"><span class="ctrl-key">1-4 / WHEEL</span><span class="ctrl-desc">Switch Weapon</span></div>
          <div class="ctrl-row"><span class="ctrl-key">R</span><span class="ctrl-desc">Reload</span></div>
          <div class="ctrl-row"><span class="ctrl-key">V</span><span class="ctrl-desc">Melee Shove</span></div>
          <div class="ctrl-row"><span class="ctrl-key">E</span><span class="ctrl-desc">Interact / Tap Kartu</span></div>
          <div class="ctrl-row"><span class="ctrl-key">Q</span><span class="ctrl-desc">Tactical Ping (Compass)</span></div>
          <div class="ctrl-row"><span class="ctrl-key">F</span><span class="ctrl-desc">Flashlight</span></div>
          <div class="ctrl-row"><span class="ctrl-key">L</span><span class="ctrl-desc">Cycle Lighting</span></div>
          <div class="ctrl-row"><span class="ctrl-key">T</span><span class="ctrl-desc">Summon Peron 1 / Depart LRT</span></div>
          <div class="ctrl-row"><span class="ctrl-key">SHIFT + T</span><span class="ctrl-desc">Summon Peron 2 (Return LRT)</span></div>
          <div class="ctrl-row"><span class="ctrl-key">TAB</span><span class="ctrl-desc">Peta &amp; Fast Travel</span></div>
          <div class="ctrl-row"><span class="ctrl-key">F3</span><span class="ctrl-desc">FPS Telemetry</span></div>
          <div class="ctrl-row"><span class="ctrl-key">H</span><span class="ctrl-desc">Toggle HUD</span></div>
          <div class="ctrl-row"><span class="ctrl-key">M</span><span class="ctrl-desc">Mute Audio</span></div>
          <div class="ctrl-row"><span class="ctrl-key">` / ~</span><span class="ctrl-desc">Cheat Console</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Pause Overlay (Centered AAA Pause Screen with Cohesive Subviews) -->
  <div id="pause-overlay" class="overlay-screen overlay-centered hidden">
    <div class="zenith-column pause-center-col" id="pause-main-view">
      <div class="zenith-header">
        <div class="zenith-kicker">JEDA PERMAINAN</div>
        <h1 class="zenith-title">PAUSED</h1>
        <div class="zenith-subtitle">STASIUN MATI</div>
      </div>

      <nav class="zenith-nav zenith-nav-centered" aria-label="Pause Menu">
        <button class="zenith-item" id="btn-resume" type="button">
          <span class="zenith-item-title">RESUME</span>
          <span class="zenith-item-sub">Return to station platform</span>
        </button>
        <button class="zenith-item" id="btn-pause-fast-travel" type="button">
          <span class="zenith-item-title">🗺️ FAST TRAVEL &amp; INSPECTOR [TAB]</span>
          <span class="zenith-item-sub">Jump across 6 stations, 10 zones &amp; atmosphere</span>
        </button>
        <button class="zenith-item" id="btn-restart-mode" type="button">
          <span class="zenith-item-title">RESTART</span>
          <span class="zenith-item-sub">Reset current deployment</span>
        </button>
        <button class="zenith-item" id="btn-pause-settings" type="button">
          <span class="zenith-item-title">SETTINGS</span>
          <span class="zenith-item-sub">Gameplay, display, graphics &amp; audio</span>
        </button>
        <button class="zenith-item" id="btn-pause-controls" type="button">
          <span class="zenith-item-title">CONTROLS</span>
          <span class="zenith-item-sub">Operator keybinds &amp; tactical inputs</span>
        </button>
        <button class="zenith-item" id="btn-pause-logs" type="button">
          <span class="zenith-item-title">FIELD NOTES</span>
          <span class="zenith-item-sub" id="pause-logs-nav-sub">0 Catatan ditemukan</span>
        </button>
        <button class="zenith-item" id="btn-back-menu" type="button">
          <span class="zenith-item-title">RETURN TO MENU</span>
          <span class="zenith-item-sub">Abort deployment &amp; exit to title</span>
        </button>
      </nav>
    </div>

    <!-- Pause Settings Subview (Consistent with Main Menu Settings) -->
    <div id="pause-settings-panel" class="aaa-subview-panel pause-settings hidden">
      <div class="aaa-subview-header">
        <div class="aaa-subview-title-group">
          <div class="zenith-kicker">JEDA PERMAINAN &middot; OPTIONS</div>
          <div class="detail-title">SETTINGS</div>
        </div>
        <div class="aaa-cat-tabs" role="tablist" aria-label="Pause Settings Categories">
          <button class="aaa-cat-tab active" data-settings-cat="all" type="button">ALL</button>
          <button class="aaa-cat-tab" data-settings-cat="gameplay" type="button">GAMEPLAY</button>
          <button class="aaa-cat-tab" data-settings-cat="display" type="button">DISPLAY</button>
          <button class="aaa-cat-tab" data-settings-cat="graphics" type="button">GRAPHICS</button>
          <button class="aaa-cat-tab" data-settings-cat="audio" type="button">AUDIO</button>
        </div>
        <button class="aaa-back-btn" id="btn-pause-settings-back" type="button">&larr; BACK</button>
      </div>

      <div class="aaa-subview-body">
        <div class="setting-group" data-cat="gameplay">
          <div class="setting-group-title">GAMEPLAY</div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">DIFFICULTY</span>
              <span class="setting-desc">Controls enemy count, damage, and supply scarcity.</span>
            </div>
            <div class="zenith-tabs" id="pause-difficulty-group">
              <button class="zenith-tab" data-difficulty="easy" type="button">EASY</button>
              <button class="zenith-tab active" data-difficulty="medium" type="button">MEDIUM</button>
              <button class="zenith-tab" data-difficulty="hard" type="button">HARD</button>
              <button class="zenith-tab" data-difficulty="nightmare" type="button">NIGHTMARE</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">TIME CYCLE</span>
              <span class="setting-desc">Choose dark night horror or bright daytime-to-sunset with faster enemies.</span>
            </div>
            <div class="zenith-tabs" id="pause-atmosphere-group">
              <button class="zenith-tab active" data-atmosphere="night_horror" type="button">NIGHT HORROR</button>
              <button class="zenith-tab" data-atmosphere="daylight_outbreak" type="button">DAYLIGHT&ndash;SUNSET</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">DISMEMBERMENT</span>
              <span class="setting-desc">Enable or disable enemy limb severing and headshot decapitation.</span>
            </div>
            <button class="zenith-toggle" id="btn-pause-dismember" type="button">ON</button>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">WAYPOINTS</span>
              <span class="setting-desc">Controls objective diamond HUD markers (Off, Proximity fade, or Always On).</span>
            </div>
            <div class="zenith-tabs" id="pause-waypoint-group">
              <button class="zenith-tab" data-waypoint="off" type="button">OFF</button>
              <button class="zenith-tab active" data-waypoint="proximity" type="button">PROXIMITY</button>
              <button class="zenith-tab" data-waypoint="on" type="button">ON</button>
            </div>
          </div>
        </div>

        <div class="setting-group" data-cat="display">
          <div class="setting-group-title">DISPLAY</div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">LIGHTING PRESET</span>
              <span class="setting-desc">Cycles the sky and atmosphere mood in-game.</span>
            </div>
            <button class="zenith-toggle" id="btn-pause-lighting" type="button">DAYLIGHT</button>
          </div>

          <div class="setting-block">
            <div class="setting-head">
              <div class="setting-info">
                <span class="setting-label">BRIGHTNESS</span>
                <span class="setting-desc">Adjusts overall scene exposure for dark stations.</span>
              </div>
              <span class="setting-readout" id="pause-brightness-readout">100% DARK HORROR</span>
            </div>
            <input type="range" id="pause-brightness-slider" class="zenith-slider" min="0.4" max="1.8" step="0.05" value="1.0" aria-label="Pause Brightness">
          </div>
        </div>

        <div class="setting-group" data-cat="graphics">
          <div class="setting-group-title">GRAPHICS</div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">QUALITY PRESET</span>
              <span class="setting-desc">Overall visual fidelity and performance balance from Low to High.</span>
            </div>
            <div class="zenith-tabs" id="pause-quality-group">
              <button class="zenith-tab" data-quality="potato" type="button">LOW</button>
              <button class="zenith-tab active" data-quality="balanced" type="button">MEDIUM</button>
              <button class="zenith-tab" data-quality="high" type="button">HIGH</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">RENDER SCALE</span>
              <span class="setting-desc">Internal 3D rendering resolution.</span>
            </div>
            <div class="zenith-tabs" id="pause-resscale-group">
              <button class="zenith-tab active" data-resscale="floor_720" type="button">720P</button>
              <button class="zenith-tab" data-resscale="native" type="button">NATIVE</button>
              <button class="zenith-tab" data-resscale="scale_125" type="button">1.25X</button>
              <button class="zenith-tab" data-resscale="scale_150" type="button">1.5X</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">SHADOWS</span>
              <span class="setting-desc">Dynamic directional shadows from pillars and enemies.</span>
            </div>
            <button class="zenith-toggle" id="btn-pause-shadows" type="button">ON</button>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">BLOOM</span>
              <span class="setting-desc">Soft light glow on lamps and muzzle flashes.</span>
            </div>
            <button class="zenith-toggle" id="btn-pause-bloom" type="button">ON</button>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">AMBIENT OCCLUSION</span>
              <span class="setting-desc">Contact shading in corners and beneath objects.</span>
            </div>
            <div class="zenith-tabs" id="pause-ao-group">
              <button class="zenith-tab active" data-ao="off" type="button">OFF</button>
              <button class="zenith-tab" data-ao="half" type="button">HALF</button>
              <button class="zenith-tab" data-ao="full" type="button">FULL</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">FPS COUNTER</span>
              <span class="setting-desc">Displays frame rate in the top-right corner.</span>
            </div>
            <button class="zenith-toggle is-off" id="btn-pause-fps" type="button">OFF</button>
          </div>
        </div>

        <div class="setting-group" data-cat="audio">
          <div class="setting-group-title">AUDIO &amp; SUBTITLES</div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">SOUND</span>
              <span class="setting-desc">Master audio for sound effects, ambience, and voiceover.</span>
            </div>
            <button class="zenith-toggle" id="btn-pause-mute" type="button">ON</button>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">SUBTITLES</span>
              <span class="setting-desc">Show or hide voiceover subtitles at the bottom of the screen.</span>
            </div>
            <button class="zenith-toggle" id="btn-pause-subtitles" type="button">ON</button>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">SUBTITLE LANGUAGE</span>
              <span class="setting-desc">Display subtitles in either Indonesian or English.</span>
            </div>
            <div class="zenith-tabs" id="pause-sublang-group">
              <button class="zenith-tab active" data-sublang="id" type="button">INDONESIAN</button>
              <button class="zenith-tab" data-sublang="en" type="button">ENGLISH</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pause Controls Subview -->
    <div id="pause-controls-panel" class="aaa-subview-panel hidden">
      <div class="aaa-subview-header">
        <div class="aaa-subview-title-group">
          <div class="zenith-kicker">JEDA PERMAINAN &middot; KEYBINDS</div>
          <div class="detail-title">CONTROLS</div>
        </div>
        <button class="aaa-back-btn" id="btn-pause-controls-back" type="button">&larr; BACK</button>
      </div>
      <div class="aaa-subview-body">
        <div class="controls-list">
          <div class="ctrl-row"><span class="ctrl-key">WASD</span><span class="ctrl-desc">Move</span></div>
          <div class="ctrl-row"><span class="ctrl-key">SPACE</span><span class="ctrl-desc">Jump</span></div>
          <div class="ctrl-row"><span class="ctrl-key">SHIFT / CTRL</span><span class="ctrl-desc">Sprint / Crouch</span></div>
          <div class="ctrl-row"><span class="ctrl-key">LMB / RMB</span><span class="ctrl-desc">Fire / Aim (ADS)</span></div>
          <div class="ctrl-row"><span class="ctrl-key">1-4 / WHEEL</span><span class="ctrl-desc">Switch Weapon</span></div>
          <div class="ctrl-row"><span class="ctrl-key">R</span><span class="ctrl-desc">Reload</span></div>
          <div class="ctrl-row"><span class="ctrl-key">V</span><span class="ctrl-desc">Melee Shove</span></div>
          <div class="ctrl-row"><span class="ctrl-key">E</span><span class="ctrl-desc">Interact / Tap Kartu</span></div>
          <div class="ctrl-row"><span class="ctrl-key">Q</span><span class="ctrl-desc">Tactical Ping (Compass)</span></div>
          <div class="ctrl-row"><span class="ctrl-key">F</span><span class="ctrl-desc">Flashlight</span></div>
          <div class="ctrl-row"><span class="ctrl-key">L</span><span class="ctrl-desc">Cycle Lighting</span></div>
          <div class="ctrl-row"><span class="ctrl-key">T</span><span class="ctrl-desc">Summon Peron 1 / Depart LRT</span></div>
          <div class="ctrl-row"><span class="ctrl-key">SHIFT + T</span><span class="ctrl-desc">Summon Peron 2 (Return LRT)</span></div>
          <div class="ctrl-row"><span class="ctrl-key">TAB</span><span class="ctrl-desc">Peta &amp; Fast Travel</span></div>
          <div class="ctrl-row"><span class="ctrl-key">F3</span><span class="ctrl-desc">FPS Telemetry</span></div>
          <div class="ctrl-row"><span class="ctrl-key">H</span><span class="ctrl-desc">Toggle HUD</span></div>
          <div class="ctrl-row"><span class="ctrl-key">M</span><span class="ctrl-desc">Mute Audio</span></div>
          <div class="ctrl-row"><span class="ctrl-key">` / ~</span><span class="ctrl-desc">Cheat Console</span></div>
        </div>
      </div>
    </div>

    <!-- Pause Field Notes Subview -->
    <div id="pause-logs-panel" class="aaa-subview-panel pause-logs-panel hidden">
      <div class="aaa-subview-header">
        <div class="aaa-subview-title-group">
          <div class="zenith-kicker">ARSIP LAPANGAN</div>
          <div class="detail-title">CATATAN DITEMUKAN</div>
        </div>
        <span class="setting-readout" id="pause-logs-count">0 CATATAN</span>
        <button class="aaa-back-btn" id="btn-pause-logs-back" type="button">&larr; BACK</button>
      </div>
      <div class="aaa-subview-body">
        <div class="pause-logs-list" id="pause-field-logs-list">
          <div class="pause-log-empty">Belum ada catatan yang ditemukan.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Game Over Overlay (Centered Death Screen; Dual-Column when Victory Credits active) -->
  <div id="gameover-overlay" class="overlay-screen overlay-centered hidden">
    <div class="zenith-column gameover-summary-col">
      <div class="zenith-header">
        <div class="zenith-kicker kicker-alert">JALUR TERPUTUS</div>
        <h1 class="zenith-title">OVERRUN AT STATION</h1>
        <div class="zenith-subtitle gameover-readout" id="gameover-stats">Stations Cleared: 0, Kills: 0</div>
      </div>

      <nav class="zenith-nav zenith-nav-centered" aria-label="Game Over Menu">
        <button class="zenith-item" id="btn-retry" type="button">
          <span class="zenith-item-title">RETRY SURVIVAL</span>
          <span class="zenith-item-sub">Redeploy to Dukuh Atas BSI</span>
        </button>
        <button class="zenith-item" id="btn-gameover-menu" type="button">
          <span class="zenith-item-title">RETURN TO MENU</span>
          <span class="zenith-item-sub">Return to title screen</span>
        </button>
      </nav>
    </div>

    <!-- Victory Rolling Credits Stage (shown ONLY on EXTRACTION COMPLETE) -->
    <section id="victory-credits" class="victory-credits hidden" aria-label="End Credits">
      <div class="credits-toolbar">
        <div class="credits-toolbar-label">DAFTAR KREDIT</div>
        <div class="credits-toolbar-actions">
          <button class="zenith-tab" id="btn-credits-pause" type="button">PAUSE</button>
          <button class="zenith-tab" id="btn-credits-skip" type="button">SKIP</button>
          <button class="zenith-tab" id="btn-credits-toggle" type="button">HIDE</button>
        </div>
      </div>

      <div class="credits-viewport" id="credits-viewport">
        <div class="credits-track" id="credits-track">
          <div class="credits-lead-spacer"></div>

          <div class="credits-hero">
            <div class="credits-kicker">KORIDOR SELATAN JAKARTA</div>
            <h2 class="credits-game-title">STASIUN MATI</h2>
            <div class="credits-game-sub">JAKARTA LRT SURVIVAL</div>
          </div>

          <div class="credits-section credits-featured">
            <div class="credits-role">DEVELOPER</div>
            <div class="credits-name-hero">Benny Pepper</div>
            <div class="credits-detail">Game Design · 3D Architecture · Gameplay Systems · Narrative</div>
          </div>

          <div class="credits-rule"></div>

          <div class="credits-section">
            <div class="credits-role">ENGINE &amp; 3D TECHNOLOGY</div>
            <div class="credits-entry">
              <span class="credits-item">Three.js</span>
              <span class="credits-license">MIT License · WebGL 3D Engine</span>
            </div>
            <div class="credits-entry">
              <span class="credits-item">three-mesh-bvh</span>
              <span class="credits-license">MIT License · Spatial Raycasting &amp; Collision BVH</span>
            </div>
            <div class="credits-entry">
              <span class="credits-item">N8AO</span>
              <span class="credits-license">MIT License · Screen-Space Ambient Occlusion</span>
            </div>
          </div>

          <div class="credits-section">
            <div class="credits-role">3D MODELS, HDRIS &amp; PBR TEXTURES</div>
            <div class="credits-entry">
              <span class="credits-item">Poly Haven</span>
              <span class="credits-license">CC0 1.0 Public Domain · Props, Foliage, Skies &amp; Materials</span>
            </div>
          </div>

          <div class="credits-section">
            <div class="credits-role">SOUND EFFECTS &amp; AUDIO ARCHIVE</div>
            <div class="credits-entry">
              <span class="credits-item">Oculus Audio Pack 1 — Oculus VR / Meta</span>
              <span class="credits-license">CC-BY 4.0 · Transit Doors, Chimes, Props, Impacts &amp; Foley</span>
            </div>
            <div class="credits-entry">
              <span class="credits-item">Michel Baradari</span>
              <span class="credits-license">CC-BY 3.0 · Shotgun, RPG Launch, Explosions &amp; Creature Death</span>
            </div>
            <div class="credits-entry">
              <span class="credits-item">Philt3r &amp; PascalHD</span>
              <span class="credits-license">CC-BY 4.0 via Wikimedia Commons · Train Arrival &amp; Braking</span>
            </div>
            <div class="credits-entry">
              <span class="credits-item">OpenGameArt CC0 Contributors</span>
              <span class="credits-license">CC0 1.0 · Ben Jaszczak / bart, SpringySpringo, LFA, Till Behrend, Fantozzi, artisticdude, Darsycho</span>
            </div>
            <div class="credits-entry">
              <span class="credits-item">Lavenderdotpet CC0 Archive</span>
              <span class="credits-license">CC0 1.0 · Concrete Impacts &amp; Structural Debris</span>
            </div>
            <div class="credits-entry">
              <span class="credits-item">Cassiopeia sweet &amp; NIRVAAN222222</span>
              <span class="credits-license">Public Domain / CC0 1.0 via Wikimedia Commons · Rail Joint Loop &amp; Train Horn</span>
            </div>
          </div>

          <div class="credits-section">
            <div class="credits-role">VOICE SYNTHESIS</div>
            <div class="credits-entry">
              <span class="credits-item">Google Gemini 3.8 Flash-Lite TTS</span>
              <span class="credits-license">via OpenRouter · Bilingual Tactical Dispatch &amp; PA Announcements</span>
            </div>
          </div>

          <div class="credits-section">
            <div class="credits-role">SETTING TRIBUTE</div>
            <div class="credits-entry">
              <span class="credits-item">LRT Jabodebek &amp; Jakarta Transit Corridor</span>
              <span class="credits-license">Dukuh Atas BSI · Cawang Interchange · Harjamukti · Kuningan · Cikoko · Setiabudi</span>
            </div>
          </div>

          <div class="credits-rule"></div>

          <div class="credits-finale">
            <div class="credits-finale-kicker">KERETA DARURAT JALUR SELATAN</div>
            <div class="credits-finale-msg">THANK YOU FOR SURVIVING THE CORRIDOR</div>
            <div class="credits-finale-dev">Created by Benny Pepper</div>
          </div>

          <div class="credits-tail-spacer"></div>
        </div>
      </div>
    </section>
  </div>

  <!-- Dedicated Tutorial Completion Modal -->
  <div id="tutorial-complete-overlay" class="overlay-screen overlay-centered hidden" role="dialog" aria-modal="true" aria-labelledby="tut-complete-title">
    <div class="zenith-column tut-complete-col">
      <div class="zenith-header">
        <div class="zenith-kicker tut-complete-kicker">BRIEFING SELESAI</div>
        <h1 class="zenith-title" id="tut-complete-title">TUTORIAL COMPLETE</h1>
        <div class="zenith-subtitle">Gagak-03 siap beroperasi &middot; Sistem LRT &amp; protokol evakuasi dikuasai</div>
      </div>

      <div class="tut-complete-summary">
        <span class="tut-complete-badge">&#10003; DUKUH ATAS BSI &middot; KONTROL KERETA TERVERIFIKASI</span>
      </div>

      <nav class="zenith-nav zenith-nav-centered" aria-label="Tutorial Completion Actions">
        <button class="zenith-item tut-complete-primary" id="btn-tut-start-survival" type="button">
          <span class="zenith-item-title">MULAI OPERASI SURVIVAL</span>
          <span class="zenith-item-sub">Terjun langsung ke Stasiun Dukuh Atas BSI (Misi Utama)</span>
        </button>
        <button class="zenith-item" id="btn-tut-back-menu" type="button">
          <span class="zenith-item-title">KEMBALI KE MENU UTAMA</span>
          <span class="zenith-item-sub">Kembali ke layar judul &amp; pengaturan</span>
        </button>
      </nav>
    </div>
  </div>"""


def escape_inline_script(js: str) -> str:
    return re.sub(r"</script", r"<\\/script", js, flags=re.IGNORECASE)


def download_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def ensure_file(url: str, dest: Path, force: bool = False) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0 and not force:
        return False
    print(f"[build] Fetching {url} -> {dest.relative_to(ROOT)}")
    data = download_bytes(url)
    if not data:
        raise RuntimeError(f"Empty download from {url}")
    dest.write_bytes(data)
    return True


def ensure_vendor(force: bool = False) -> None:
    three_dir = VENDOR_DIR / "three"
    addons_dir = three_dir / "addons"
    draco_dir = three_dir / "draco"
    bvh_dir = VENDOR_DIR / "three-mesh-bvh"
    n8ao_dir = VENDOR_DIR / "n8ao"

    # Core three.module.min.js
    three_core_dest = three_dir / "three.module.min.js"
    legacy_three = VENDOR_DIR / "three.module.min.js"
    if not three_core_dest.exists() and legacy_three.exists() and not force:
        three_dir.mkdir(parents=True, exist_ok=True)
        three_core_dest.write_bytes(legacy_three.read_bytes())
    else:
        ensure_file(f"{THREE_BASE_URL}/build/three.module.min.js", three_core_dest, force=force)

    # Recursively fetch examples/jsm addons and all relative dependencies
    seen: set[str] = set()
    queue = list(JSM_SEEDS)
    while queue:
        rel = queue.pop(0)
        if rel in seen:
            continue
        seen.add(rel)
        dest = addons_dir / rel
        ensure_file(f"{THREE_BASE_URL}/examples/jsm/{rel}", dest, force=force)
        src_text = dest.read_text(encoding="utf-8")
        for match in IMPORT_SPEC_RE.finditer(src_text):
            spec = match.group(1)
            if spec == "three":
                continue
            if spec.startswith("."):
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(rel), spec))
                if resolved not in seen:
                    queue.append(resolved)
            else:
                raise RuntimeError(f"Unexpected non-relative import '{spec}' in examples/jsm/{rel}")

    # Draco decoders (glTF variant)
    for fname in DRACO_FILES:
        ensure_file(
            f"{THREE_BASE_URL}/examples/jsm/libs/draco/gltf/{fname}",
            draco_dir / fname,
            force=force,
        )

    # three-mesh-bvh@0.8.3 & n8ao@1.9.3
    ensure_file(BVH_URL, bvh_dir / "index.module.js", force=force)
    ensure_file(N8AO_URL, n8ao_dir / "N8AO.js", force=force)


def load_sfx_payload() -> str:
    sfx_path = ROOT / "assets" / "sfx" / "sfx_bank.json"
    if not sfx_path.exists():
        sfx_path = RESEARCH_DIR / "sfx_bank.json"
    if not sfx_path.exists():
        print(f"[build] WARNING: {sfx_path} not found; embedding empty SFX bank.")
        return "{}"
    data = json.loads(sfx_path.read_text(encoding="utf-8"))
    print(f"[build] Loaded SFX bank: {len(data)} clips")
    return json.dumps(data, separators=(",", ":"), ensure_ascii=True)


def load_voice_manifest_payload() -> str:
    manifest_path = ROOT / "assets" / "voice" / "manifest.json"
    if not manifest_path.exists():
        print(f"[build] WARNING: {manifest_path} not found; embedding empty voice manifest.")
        return "{}"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    print(f"[build] Loaded voice manifest: {len(data)} lines")
    return json.dumps(data, separators=(",", ":"), ensure_ascii=True)


def render_html(title: str, sfx_json: str, voice_json: str = "{}") -> str:
    return "\n".join([
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '  <meta charset="utf-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        f"  <title>{title}</title>",
        '  <link rel="stylesheet" href="src/style.css">',
        HEAD_EXTRA_STYLES,
        '  <script type="importmap">',
        IMPORTMAP_JSON,
        "  </script>",
        "</head>",
        "<body>",
        BODY_MARKUP,
        f"  <script>window.__SFX_BANK__={escape_inline_script(sfx_json)};window.__VOICE_MANIFEST__={escape_inline_script(voice_json)};</script>",
        '  <script type="module" src="src/boot.js"></script>',
        "</body>",
        "</html>",
        "",
    ])


def build(strict: bool = False, force_vendor: bool = False) -> None:
    ensure_vendor(force=force_vendor)

    sfx_json = load_sfx_payload()
    (VENDOR_DIR / "sfx_bank.js").write_text(
        f"window.__SFX_BANK__ = {sfx_json};\n", encoding="utf-8"
    )
    voice_json = load_voice_manifest_payload()

    missing_modules = [m for m in REQUIRED_SRC_MODULES if not (SRC_DIR / m).exists()]
    if missing_modules:
        msg = f"[build] Missing modules in src/: {missing_modules}"
        if strict:
            raise FileNotFoundError(msg)
        print(f"{msg} (continuing because --strict is not set)")

    out_index = ROOT / "index.html"
    out_index.write_text(render_html("Stasiun Mati: Jakarta LRT 3D FPS", sfx_json, voice_json), encoding="utf-8")

    out_dev = ROOT / "dev.html"
    out_dev.write_text(render_html("[DEV] Stasiun Mati: Jakarta LRT 3D FPS", sfx_json, voice_json), encoding="utf-8")

    size_kb = out_index.stat().st_size / 1024.0
    print(f"[build] Wrote {out_index.name} ({size_kb:.1f} KB) and {out_dev.name}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Fail if any src module is missing")
    parser.add_argument("--force-vendor", action="store_true", help="Re-download offline vendor libraries")
    args = parser.parse_args()
    try:
        build(strict=args.strict, force_vendor=args.force_vendor)
    except Exception as exc:
        print(f"[build] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
