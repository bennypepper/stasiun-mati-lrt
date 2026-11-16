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

---

## Project Structure

- [`src/`](src/) — Game modules loaded sequentially via `src/boot.js`:
  - `config.js` — Station archetypes, lighting moods, player movement, weapon & enemy stats
  - `audio.js` — Web Audio API mixer + stereo directional & distance attenuation
  - `asset_loader.js` — Offline GLB/HDR loader with Draco support
  - `textures_shaders.js` — Procedural PBR textures, flickering fluorescent shaders, station/kiosk signage
  - `world_station.js` — At-grade stations, PSDs, JPO bridges/stairs, depot/garden wings, plaza aprons, NavGraph & BVH colliders
  - `world_city.js` — Surrounding Jakarta boulevards, ruko/tower blocks, level crossing gates, foliage & Poly Haven street props
  - `train.js` — Bidirectional 3-car INKA iE203 (interior, seats, horn, blinking night tubes, dentable hulls, recycled corridor chunks)
  - `weapons_fx.js` — Viewmodels, ADS scopes, ballistic traces, RPG projectiles, explosions, impacts
  - `enemies.js` — 14-part `InstancedMesh` articulated zombies (`walker`, `runner`, `brute`, `spitter`), A\* NavGraph pursuit, stuck recovery, 3D audio cues
  - `player_ui.js` — Capsule physics, flashlight SpotLight + spill, HUD & menus
  - `main.js` — Boot pipeline, shader warmup, N8AO/Bloom composer, game state machine, `__LRT_DEBUG__`
- [`assets/`](assets/) — Offline Poly Haven GLBs, textures, HDRIs (`assets/manifest.json`), SFX bank (`assets/sfx/`), and offline narrator/radio voice clips (`assets/voice/`)
- [`vendor/`](vendor/) — Offline pinned `three@0.170.0`, `three-mesh-bvh@0.8.3`, `n8ao@1.9.3`, and generated `sfx_bank.js`
- [`research/`](research/) — Original design specs, architecture reference, and photo references
- [`docs/`](docs/) — Engineering & design guides for agents and contributors:
  - [`docs/optimization_guide.md`](docs/optimization_guide.md) — Game optimization engineering reference + codebase notes
  - [`docs/roadmap_and_design_feedback.md`](docs/roadmap_and_design_feedback.md) — Gameplay, story, enemy AI, progression & performance roadmap
  - [`docs/plans/phase1_plan.md`](docs/plans/phase1_plan.md) — Phase 1 implementation plan
- [`scripts/`](scripts/) — Asset fetching utilities (`fetch_assets.py`)
- [`tests/`](tests/) — Headless Playwright D3D11 ANGLE verification suites:
  - `tests/verify_phase1.py` — Boot, shader warmup, lighting modes, weapon reload timing, walkability
  - `tests/verify_phase1_fixes.py` — Crossing gates, RPG ADS/SFX, bidirectional Track 1 & Track 2 train travel
  - `tests/verify_phase2.py` — 4 zombie variants, multi-level NavGraph JPO climbing, combat kill verification
  - `tests/verify_fixes_v2.py` — Zero ground voids & track overlaps across all 6 stations, 100% NavGraph connectivity, Night Mode + Flashlight, track-escape pursuit
