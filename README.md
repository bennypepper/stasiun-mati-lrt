# Stasiun Mati — Jakarta LRT 3D FPS (`hydrogen-subway`)

An offline-first Three.js WebGL 3D first-person shooter and urban transit sandbox set across the **Jakarta LRT Jabodebek** corridor (**Dukuh Atas BSI**, **Cawang Interchange**, **Harjamukti**, **Kuningan**, **Cikoko**, and **Setiabudi**), featuring bidirectional 3-car INKA iE203 train travel, at-grade Jakarta street districts, Poly Haven PBR props, N8AO + bloom post-processing, 3D spatialized audio, and articulated horror infected with multi-level A\* pathfinding.

---

## Quick Start

### Windows 1-Click Launch
Double-click [`run.bat`](run.bat). It starts the local HTTP server via `serve.py` and opens the game in your default browser.

### Manual Run / Rebuild
```powershell
# 1. Start the local HTTP server (auto-picks free port if 8080 is busy)
python serve.py --port 8080 --auto-port --open

# 2. Rebuild index.html / dev.html and validate vendor/SFX assets after editing src/*.js
python build.py --strict
```

> **Note:** ES module imports and GLB/HDR assets require HTTP serving (`serve.py`), not `file://`.

---

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / `Arrow Keys` | Move |
| `Shift` / `C` / `Ctrl` / `Space` | Sprint / Crouch / Jump (also Stand from train seat) |
| `Left Click` / `Right Click` | Fire / Aim Down Sights (ADS, including RPG-7 optic) |
| `1` – `4` / `R` | Switch Weapon (`1` Pindad G2 9mm, `2` SS2-V5, `3` 12G Shotgun, `4` RPG-7) / Reload |
| `F` | Toggle Flashlight (Senter) |
| `E` | Interact (Kiosks, Turnstiles, Lockers, Call Train, Sit, Depart, Train Horn) |
| `T` | Quick-Summon LRT / Depart inside cab |
| `L` | Cycle Time-of-Day & Lighting (`DAYLIGHT_CLEAR`, `DAYLIGHT_OVERCAST`, `GOLDEN_DUSK`, `BLACKOUT_EMERGENCY`, `CRIMSON_BLOOD_MOON`) |
| `H` / `M` | Toggle HUD / Mute Audio |
| `` ` `` / `~` | Open Cheat Console (`PAINKILLER`, `TURTLE`, `TOOLUP`, `CATCHME`) |

---

## License & Third-Party Credits

- **Game Source Code:** Licensed under the [MIT License](LICENSE) (`Copyright (c) 2026 Benny Pepper`).
- **3D Models, Textures, HDRIs, SFX & Voiceovers:** Full third-party disclosures and attributions are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`assets/sfx/sfx_licenses.md`](assets/sfx/sfx_licenses.md).

---

## Project Structure

- [`src/`](src/) — Modular game scripts loaded sequentially via `src/boot.js`:
  - `config.js` — Station archetypes, lighting moods, difficulty tiers, weapon/lootbox/skin configs, enemy stats
  - `audio.js` — Web Audio API mixer, stereo attenuation, and offline narrator/radio voiceover + subtitle sync
  - `asset_loader.js` — Offline GLB/HDR loader with Draco support
  - [`render/`](src/render/) — Procedural PBR textures/atlases (`textures_procedural.js`) & weathering/flicker shaders (`materials_shaders.js`)
  - [`city/`](src/city/) — Cached vehicle/tree/prop prototypes + HLOD skyline (`city_protos.js`), Jakarta boulevards/vehicles/street props (`city_district.js`), and frustum/LOD culling API (`city_api.js`)
  - [`station/`](src/station/) — Geometry/BVH/SpatialGrid (`station_geo.js`), station/hub/depot architecture (`station_arch.js`), NavGraph/props/Cawang signage (`station_nav_props.js`), and pulsing objective halos (`station_api.js`)
  - [`train/`](src/train/) — 3-car INKA iE203 builders (`train_builders.js`), cruise chunks & hull damage (`train_fx_damage.js`), and state machine (`train_api.js`)
  - [`weapons/`](src/weapons/) — Viewmodels, unlock progression & live PBR skins (`weapons_models.js`), pooled VFX & statistical lootboxes (`weapons_fx_ballistics.js`)
  - [`enemies/`](src/enemies/) — 14-part `InstancedMesh` articulated zombies (`enemies_mesh.js`), A\* NavGraph & recovery (`enemies_nav.js`), difficulty/FOV/LOS AI & roamers (`enemies_ai.js`)
  - [`player/`](src/player/) — Capsule/BVH physics & armor absorption (`player_physics.js`), Zenith HUD, expanded settings & 3D-to-2D waypoints (`player_hud.js`)
  - [`core/`](src/core/) — Shadow-cached composer/resolution pipeline (`render_pipeline.js`) & 6-station campaign/VO director (`campaign_director.js`)
  - `main.js` — Boot orchestrator, frame simulation loop, UI bindings & `__LRT_DEBUG__`
- [`assets/`](assets/) — Offline Poly Haven GLBs, textures, HDRIs (`assets/manifest.json`), SFX bank (`assets/sfx/`), and offline voiceover clips (`assets/voice/`)
- [`vendor/`](vendor/) — Offline pinned `three@0.170.0`, `three-mesh-bvh@0.8.3`, `n8ao@1.9.3`, and generated `sfx_bank.js`

> Non-runtime folders (`docs/`, `tests/`, `research/`, `scripts/`) and `.env` are excluded from Git via [`.gitignore`](.gitignore).
