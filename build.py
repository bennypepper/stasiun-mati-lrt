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
    "city/city_district.js",
    "city/city_api.js",
    "station/station_geo.js",
    "station/station_arch.js",
    "station/station_nav_props.js",
    "station/station_api.js",
    "train/train_builders.js",
    "train/train_fx_damage.js",
    "train/train_api.js",
    "weapons/weapons_models.js",
    "weapons/weapons_fx_ballistics.js",
    "enemies/enemies_mesh.js",
    "enemies/enemies_nav.js",
    "enemies/enemies_ai.js",
    "player/player_physics.js",
    "player/player_hud.js",
    "core/render_pipeline.js",
    "core/campaign_director.js",
    "main.js",
    "boot.js",
]

HEAD_EXTRA_STYLES = """  <style id="loading-overlay-styles">
    #loading-overlay {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 42%, rgba(18, 24, 34, 0.96) 0%, rgba(4, 6, 10, 0.99) 72%);
      color: #f2f0ea;
      font-family: 'Segoe UI', 'Helvetica Neue', system-ui, -apple-system, sans-serif;
    }
    #loading-overlay .loading-panel {
      width: min(440px, 86vw);
      padding: 28px 30px;
      background: rgba(8, 10, 14, 0.78);
      border: 1px solid rgba(225, 222, 214, 0.16);
      border-left: 2px solid #c2a062;
    }
    #loading-overlay .loading-title {
      margin: 6px 0 18px;
      font-size: 24px;
      font-weight: 300;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #f2f0ea;
    }
    #loading-overlay .loading-bar-track {
      width: 100%;
      height: 4px;
      background: rgba(225, 222, 214, 0.12);
      overflow: hidden;
      margin-bottom: 12px;
    }
    #loading-overlay #loading-bar-fill {
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #c2a062 0%, #f2f0ea 100%);
      transition: width 0.12s ease-out;
    }
    #loading-overlay #loading-status {
      font-family: 'Cascadia Mono', 'Consolas', 'SFMono-Regular', monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      color: rgba(212, 208, 198, 0.78);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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

  <!-- Asset & Shader Preload Overlay -->
  <div id="loading-overlay">
    <div class="loading-panel">
      <div class="zenith-kicker">LRT JABODEBEK // ASSET PIPELINE</div>
      <h2 class="loading-title">STASIUN MATI</h2>
      <div class="loading-bar-track"><div id="loading-bar-fill"></div></div>
      <div id="loading-status">Initializing WebGL modules...</div>
    </div>
  </div>

  <div id="hud" class="hidden">
    <div id="hud-top">
      <div class="transit-card">
        <div class="transit-badges">
          <span class="badge badge-cb">CB</span>
          <span class="badge badge-bk">BK</span>
          <span class="badge badge-mode" id="hud-mode-badge">SURVIVAL</span>
          <span id="hud-station-code">CB01 / BK01</span>
        </div>
        <div class="station-title" id="hud-station-name">Dukuh Atas BSI</div>
        <div class="station-sub" id="hud-station-sub">Stasiun LRT Jabodebek</div>
        <div class="route-bar" aria-hidden="true">
          <span class="route-seg seg-cb"></span>
          <span class="route-seg seg-bk"></span>
          <span class="route-seg seg-gold"></span>
        </div>
      </div>

      <div id="objective-pill">
        <div class="obj-kicker">MISSION DIRECTIVE</div>
        <div id="objective-title">WAVE 1</div>
        <div id="objective-detail">Clear Platform Infected</div>
        <div id="fps-readout" class="hidden">FPS: -- | Calls: --</div>
      </div>
    </div>

    <div id="hud-waypoints" aria-hidden="true"></div>

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
      <div class="log-kicker">ARSIP DOKUMEN // FIELD LOG</div>
      <div id="log-title">LOG ENTRY</div>
      <div id="log-body">Log content details...</div>
    </div>

    <!-- Voiceover Subtitle HUD Overlay -->
    <div id="hud-subtitle-box" class="hidden">
      <div id="subtitle-speaker" class="badge speaker-occ">OCC BEKASI // SARAH</div>
      <div id="subtitle-text-id">Dialog Bahasa Indonesia</div>
      <div id="subtitle-text-en">English subtitle translation</div>
    </div>

    <!-- GTA-style Cheat Console Bar (Toggle with ` key) -->
    <div id="cheat-console" class="hidden" role="dialog" aria-label="Cheat Console">
      <span class="cheat-prompt">&gt;</span>
      <input id="cheat-input" type="text" maxlength="32" autocomplete="off" spellcheck="false" placeholder="ENTER CHEAT CODE..." aria-label="Cheat Code Input">
      <span class="cheat-hint">[ENTER] APPLY · [` / ESC] CLOSE</span>
    </div>

    <div id="hud-bottom">
      <div id="vitals-card">
        <div class="vital-row">
          <span class="vital-label">VITALS // HP</span>
          <span id="hp-value">100</span>
        </div>
        <div class="hp-bar-track"><div id="hp-bar-fill"></div></div>
        <div class="armor-row hidden" id="armor-row">
          <span class="armor-label">ARMOR</span>
          <span id="armor-value">0</span>
          <div class="armor-bar-track"><div id="armor-bar-fill"></div></div>
        </div>
        <div class="cheat-status-row hidden" id="cheat-status-row">
          <span class="cheat-pill hidden" id="cheat-pill-god">PAINKILLER 05:00</span>
          <span class="cheat-pill hidden" id="cheat-pill-sprint">CATCHME // FAST SPRINT</span>
        </div>
        <div class="tool-pills">
          <span class="pill-ind" id="pill-flashlight">[F] Senter: OFF</span>
          <span class="pill-ind active" id="pill-lighting">[L] Light: DAY</span>
          <span class="pill-ind active" id="pill-hud">[H] HUD</span>
          <span class="pill-ind" id="pill-mute">[M] Audio</span>
        </div>
      </div>

      <div id="weapon-panel">
        <div id="ammo-card">
          <div id="weapon-name">Pindad G2 9mm</div>
          <div id="weapon-skin-tag" class="hidden"></div>
          <div id="ammo-readout"><span id="ammo-mag">15</span> <span id="ammo-reserve">/ INF</span></div>
        </div>
        <div id="weapon-slots">
          <div class="w-slot active" data-slot="1">[1] G2</div>
          <div class="w-slot" data-slot="2">[2] SS2-V5</div>
          <div class="w-slot" data-slot="3">[3] 12G</div>
          <div class="w-slot" data-slot="4">[4] RPG-7</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Menu Overlay (Minimalist Transparent Aesthetic) -->
  <div id="menu-overlay" class="overlay-screen menu-asymmetric">
    <div class="menu-dock zenith-column">
      <div class="zenith-header">
        <div class="zenith-kicker">LRT JABODEBEK // SEKTOR SELATAN</div>
        <h1 class="zenith-title">STASIUN MATI</h1>
        <div class="zenith-subtitle">JAKARTA LRT</div>
      </div>

      <nav class="zenith-nav" aria-label="Main Menu">
        <button class="zenith-item" id="btn-start-survival" type="button">
          <span class="zenith-item-title">SURVIVAL</span>
          <span class="zenith-item-sub">Clear waves &amp; board the INKA iE203</span>
        </button>

        <button class="zenith-item" id="btn-start-exploration" type="button">
          <span class="zenith-item-title">EXPLORATION</span>
          <span class="zenith-item-sub">Free-roam without enemies, ride LRT anytime</span>
        </button>

        <button class="zenith-item" id="btn-menu-settings" type="button">
          <span class="zenith-item-title">SETTINGS</span>
          <span class="zenith-item-sub">Atmosphere lighting, brightness, render quality &amp; audio</span>
        </button>

        <!-- Collapsible Settings Panel (Directly under SETTINGS) -->
        <div id="menu-settings-panel" class="zenith-subpanel hidden">
          <div class="setting-row">
            <span class="setting-label">DIFFICULTY</span>
            <div class="zenith-tabs" id="menu-difficulty-group">
              <button class="zenith-tab" data-difficulty="easy" type="button">EASY</button>
              <button class="zenith-tab active" data-difficulty="medium" type="button">MEDIUM</button>
              <button class="zenith-tab" data-difficulty="hard" type="button">HARD</button>
              <button class="zenith-tab" data-difficulty="nightmare" type="button">NIGHTMARE</button>
            </div>
          </div>

          <div class="setting-row">
            <span class="setting-label">ATMOSPHERE / LIGHTING</span>
            <button class="zenith-toggle" id="btn-menu-lighting" type="button">DAYLIGHT</button>
          </div>

          <div class="setting-block">
            <div class="setting-head">
              <span class="setting-label">ATMOSPHERE BRIGHTNESS</span>
              <span class="setting-readout" id="brightness-readout">100% · DARK HORROR</span>
            </div>
            <input type="range" id="brightness-slider" class="zenith-slider" min="0.4" max="1.8" step="0.05" value="1.0" aria-label="Atmosphere Brightness">
          </div>

          <div class="setting-row">
            <span class="setting-label">RENDER QUALITY</span>
            <div class="zenith-tabs" id="menu-quality-group">
              <button class="zenith-tab" data-quality="high" type="button">HIGH</button>
              <button class="zenith-tab active" data-quality="balanced" type="button">BALANCED</button>
              <button class="zenith-tab" data-quality="potato" type="button">POTATO</button>
            </div>
          </div>

          <div class="setting-row">
            <span class="setting-label">RENDER SCALE</span>
            <div class="zenith-tabs" id="menu-resscale-group">
              <button class="zenith-tab active" data-resscale="floor_720" type="button">720P</button>
              <button class="zenith-tab" data-resscale="native" type="button">NATIVE</button>
              <button class="zenith-tab" data-resscale="scale_125" type="button">1.25X</button>
              <button class="zenith-tab" data-resscale="scale_150" type="button">1.5X</button>
            </div>
          </div>

          <div class="setting-row">
            <span class="setting-label">SHADOWS</span>
            <button class="zenith-toggle" id="btn-menu-shadows" type="button">ON</button>
          </div>

          <div class="setting-row">
            <span class="setting-label">BLOOM</span>
            <button class="zenith-toggle" id="btn-menu-bloom" type="button">ON</button>
          </div>

          <div class="setting-row">
            <span class="setting-label">AO (N8AO)</span>
            <div class="zenith-tabs" id="menu-ao-group">
              <button class="zenith-tab active" data-ao="off" type="button">OFF</button>
              <button class="zenith-tab" data-ao="half" type="button">HALF</button>
              <button class="zenith-tab" data-ao="full" type="button">FULL</button>
            </div>
          </div>

          <div class="setting-row">
            <span class="setting-label">FPS COUNTER</span>
            <button class="zenith-toggle is-off" id="btn-menu-fps" type="button">OFF</button>
          </div>

          <div class="setting-row">
            <span class="setting-label">AUDIO</span>
            <button class="zenith-toggle" id="btn-menu-mute" type="button">ON</button>
          </div>
        </div>

        <button class="zenith-item" id="btn-menu-controls" type="button">
          <span class="zenith-item-title">CONTROLS</span>
          <span class="zenith-item-sub">Operator keybinds &amp; tactical inputs</span>
        </button>

        <!-- Collapsible Controls Panel (Directly under CONTROLS) -->
        <div id="menu-controls-panel" class="zenith-subpanel hidden">
          <div class="controls-list">
            <div class="ctrl-row"><span class="ctrl-key">WASD</span><span class="ctrl-desc">Move</span></div>
            <div class="ctrl-row"><span class="ctrl-key">SPACE</span><span class="ctrl-desc">Jump</span></div>
            <div class="ctrl-row"><span class="ctrl-key">SHIFT / CTRL</span><span class="ctrl-desc">Sprint / Crouch</span></div>
            <div class="ctrl-row"><span class="ctrl-key">LMB / RMB</span><span class="ctrl-desc">Fire / Aim (ADS)</span></div>
            <div class="ctrl-row"><span class="ctrl-key">1-4 / WHEEL</span><span class="ctrl-desc">Switch Weapon</span></div>
            <div class="ctrl-row"><span class="ctrl-key">R</span><span class="ctrl-desc">Reload</span></div>
            <div class="ctrl-row"><span class="ctrl-key">E</span><span class="ctrl-desc">Interact / Tap Kartu</span></div>
            <div class="ctrl-row"><span class="ctrl-key">F</span><span class="ctrl-desc">Flashlight</span></div>
            <div class="ctrl-row"><span class="ctrl-key">L</span><span class="ctrl-desc">Cycle Lighting</span></div>
            <div class="ctrl-row"><span class="ctrl-key">T</span><span class="ctrl-desc">Summon / Depart LRT</span></div>
            <div class="ctrl-row"><span class="ctrl-key">F3</span><span class="ctrl-desc">FPS Telemetry</span></div>
            <div class="ctrl-row"><span class="ctrl-key">H</span><span class="ctrl-desc">Toggle HUD</span></div>
            <div class="ctrl-row"><span class="ctrl-key">M</span><span class="ctrl-desc">Mute Audio</span></div>
            <div class="ctrl-row"><span class="ctrl-key">` / ~</span><span class="ctrl-desc">Cheat Console</span></div>
          </div>
        </div>
      </nav>
    </div>
  </div>

  <!-- Pause Overlay -->
  <div id="pause-overlay" class="overlay-screen menu-asymmetric hidden">
    <div class="zenith-column">
      <div class="zenith-header">
        <div class="zenith-kicker">SIMULATION PAUSED // STANDBY</div>
        <h1 class="zenith-title">PAUSED</h1>
        <div class="zenith-subtitle">STASIUN MATI</div>
      </div>

      <nav class="zenith-nav" aria-label="Pause Menu">
        <button class="zenith-item" id="btn-resume" type="button">
          <span class="zenith-item-title">RESUME</span>
          <span class="zenith-item-sub">Return to station platform</span>
        </button>
        <button class="zenith-item" id="btn-restart-mode" type="button">
          <span class="zenith-item-title">RESTART</span>
          <span class="zenith-item-sub">Reset current deployment</span>
        </button>
      </nav>

      <div class="zenith-subpanel pause-settings">
        <div class="setting-row">
          <span class="setting-label">DIFFICULTY</span>
          <div class="zenith-tabs" id="pause-difficulty-group">
            <button class="zenith-tab" data-difficulty="easy" type="button">EASY</button>
            <button class="zenith-tab active" data-difficulty="medium" type="button">MEDIUM</button>
            <button class="zenith-tab" data-difficulty="hard" type="button">HARD</button>
            <button class="zenith-tab" data-difficulty="nightmare" type="button">NIGHTMARE</button>
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">LIGHTING</span>
          <button class="zenith-toggle" id="btn-pause-lighting" type="button">DAYLIGHT</button>
        </div>

        <div class="setting-block">
          <div class="setting-head">
            <span class="setting-label">BRIGHTNESS</span>
            <span class="setting-readout" id="pause-brightness-readout">100% · DARK HORROR</span>
          </div>
          <input type="range" id="pause-brightness-slider" class="zenith-slider" min="0.4" max="1.8" step="0.05" value="1.0" aria-label="Pause Brightness">
        </div>

        <div class="setting-row">
          <span class="setting-label">QUALITY</span>
          <div class="zenith-tabs" id="pause-quality-group">
            <button class="zenith-tab" data-quality="high" type="button">HIGH</button>
            <button class="zenith-tab active" data-quality="balanced" type="button">BALANCED</button>
            <button class="zenith-tab" data-quality="potato" type="button">POTATO</button>
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">RENDER SCALE</span>
          <div class="zenith-tabs" id="pause-resscale-group">
            <button class="zenith-tab active" data-resscale="floor_720" type="button">720P</button>
            <button class="zenith-tab" data-resscale="native" type="button">NATIVE</button>
            <button class="zenith-tab" data-resscale="scale_125" type="button">1.25X</button>
            <button class="zenith-tab" data-resscale="scale_150" type="button">1.5X</button>
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">SHADOWS</span>
          <button class="zenith-toggle" id="btn-pause-shadows" type="button">ON</button>
        </div>

        <div class="setting-row">
          <span class="setting-label">BLOOM</span>
          <button class="zenith-toggle" id="btn-pause-bloom" type="button">ON</button>
        </div>

        <div class="setting-row">
          <span class="setting-label">AO (N8AO)</span>
          <div class="zenith-tabs" id="pause-ao-group">
            <button class="zenith-tab active" data-ao="off" type="button">OFF</button>
            <button class="zenith-tab" data-ao="half" type="button">HALF</button>
            <button class="zenith-tab" data-ao="full" type="button">FULL</button>
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">FPS COUNTER</span>
          <button class="zenith-toggle is-off" id="btn-pause-fps" type="button">OFF</button>
        </div>

        <div class="setting-row">
          <span class="setting-label">AUDIO</span>
          <button class="zenith-toggle" id="btn-pause-mute" type="button">ON</button>
        </div>
      </div>

      <nav class="zenith-nav zenith-nav-footer" aria-label="Pause Exit">
        <button class="zenith-item" id="btn-back-menu" type="button">
          <span class="zenith-item-title">RETURN TO MENU</span>
          <span class="zenith-item-sub">Abort deployment &amp; exit to title</span>
        </button>
      </nav>
    </div>
  </div>

  <!-- Game Over Overlay -->
  <div id="gameover-overlay" class="overlay-screen menu-asymmetric hidden">
    <div class="zenith-column gameover-summary-col">
      <div class="zenith-header">
        <div class="zenith-kicker kicker-alert">SIGNAL LOST // JALUR TERPUTUS</div>
        <h1 class="zenith-title">OVERRUN AT STATION</h1>
        <div class="zenith-subtitle gameover-readout" id="gameover-stats">Stations Cleared: 0 | Kills: 0</div>
      </div>

      <nav class="zenith-nav" aria-label="Game Over Menu">
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
        <div class="credits-toolbar-label">EVACUATION ARCHIVE // CREDITS</div>
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
            <div class="credits-kicker">PROTOKOL EVAKUASI 114-OMEGA // CORRIDOR CB–BK</div>
            <h2 class="credits-game-title">STASIUN MATI</h2>
            <div class="credits-game-sub">HYDROGEN-SUBWAY · JAKARTA LRT SURVIVAL FPS</div>
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
            <div class="credits-finale-kicker">INKA iE203 TRAINSET #04 // HYDROGEN-SUBWAY</div>
            <div class="credits-finale-msg">THANK YOU FOR SURVIVING THE CORRIDOR</div>
            <div class="credits-finale-dev">Created by Benny Pepper</div>
          </div>

          <div class="credits-tail-spacer"></div>
        </div>
      </div>
    </section>
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
