# Third-Party Notices & Asset Credits (`stasiun-mati-lrt`)

**Developer:** Benny Pepper  
**Game Source Code License:** MIT (`LICENSE`)

All bundled third-party libraries, 3D models, PBR textures, HDRIs, sound effects, and synthesized voiceovers are disclosed below with their respective authors, sources, and licenses.

---

## 1. Engine & Libraries (`vendor/`)

| Library | Version | License | Source |
| --- | --- | --- | --- |
| **Three.js** | `0.170.0` | MIT | https://github.com/mrdoob/three.js |
| **three-mesh-bvh** | `0.8.3` | MIT | https://github.com/gkjohnson/three-mesh-bvh |
| **N8AO** | `1.9.3` | MIT | https://github.com/N8python/n8ao |

---

## 2. 3D Models, HDRIs & PBR Textures (`assets/manifest.json`)

All 3D models (`assets/models/`), HDRI environment maps (`assets/hdri/`), and PBR texture sets (`assets/textures/`) were sourced from **Poly Haven**:

- **Source:** https://polyhaven.com/
- **License:** **CC0 1.0 Universal (Public Domain)**
- **Included Assets:** 4 HDRIs (`day_clear`, `day_overcast`, `golden_dusk`, `night_station`), 12 PBR texture sets (`asphalt_road`, `sidewalk_paver`, `concrete_station`, `concrete_rough`, `platform_granite`, `concourse_tile`, `roof_corrugated`, `rust_metal`, `building_facade_1`, `building_facade_2`, `brick_wall`, `dark_wood`), and 30 1K glTF models (`ammo_box`, `medical_box`, `old_military_crate`, `portable_generator`, `Barrel_01`, `CoffeeCart_01`, `CashRegister_01`, `WetFloorSign_01`, `mounted_fluorescent_lights`, street props, and foliage).

---

## 3. Sound Effects (`assets/sfx/`)

Full per-clip filenames, processing notes, authors, and source URLs for all **50 clips** are documented in [`assets/sfx/sfx_licenses.md`](assets/sfx/sfx_licenses.md).

### CC-BY 4.0 Attributions
- **Oculus VR, LLC (Oculus Audio Pack 01):** `impact_metal`, `turnstile_beep`, `door_chime`, `door_open`, `door_close`, `station_chime`, `footstep_metal`, `zombie_hit`, `player_hurt`, `player_gasp`, `generator_loop`, `electric_box_open`, `breaker_throw`, `crate_open`, `loot_chime`, `pickup_ammo`, `pickup_medkit`, `paper_rustle`, `car_trunk_open`, `water_pour`, `hydrant_spray`, `rain_loop`, `casing_concrete`, `casing_metal`, `flashlight_click`, `headshot_crit` — https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ / https://github.com/facebookincubator/Meta-open-sound (Modified: trimmed, filtered, mono MP3 re-encoded).
- **Philt3r:** `train_approach` (*"London Underground 1996 Stock train arriving in a station.ogg"*) via Wikimedia Commons (Modified excerpt, mono MP3 re-encoded).
- **PascalHD:** `train_brake` (*"GO Train arrives at Guildwood GO Station (Freesound).ogg"*) via Wikimedia Commons (Modified excerpt, mono MP3 re-encoded).

### CC-BY 3.0 Attributions
- **Michel Baradari:** `shotgun_fire`, `rpg_launch`, `rpg_explosion`, `zombie_death` via OpenGameArt (https://opengameart.org/users/qubodup / OpenGameArt packs — Modified: trimmed, normalized, mono MP3 re-encoded).

### CC0 1.0 / Public Domain Contributors
- **Ben Jaszczak et al. (submitted by `bart`):** `pistol_fire`, `rifle_fire`, `player_heartbeat` (CC0 1.0, OpenGameArt)
- **SpringySpringo:** `weapon_reload`, `shotgun_pump` (CC0 1.0, OpenGameArt)
- **LFA:** `weapon_switch`, `dry_fire` (CC0 1.0, OpenGameArt)
- **Till Behrend:** `glass_shatter` (CC0 1.0, OpenGameArt)
- **Lavenderdotpet CC0 Archive:** `impact_concrete`, `debris_crumble` (CC0 1.0, GitHub)
- **Fantozzi:** `footstep_concrete_1`, `footstep_concrete_2` (CC0 1.0, OpenGameArt)
- **artisticdude:** `zombie_groan_1`, `zombie_attack` (CC0 1.0, OpenGameArt)
- **Darsycho:** `zombie_groan_2` (CC0 1.0, OpenGameArt)
- **looneybits:** `generator_start` (CC0 1.0, OpenGameArt)
- **NIRVAAN222222:** `train_horn` (CC0 1.0, Wikimedia Commons)
- **Cassiopeia sweet:** `train_ride_loop` (Public Domain, Wikimedia Commons)

---

## 4. Voiceovers (`assets/voice/`)

- **Synthesis Model:** `google/gemini-3.8-flash-lite-tts` via OpenRouter (`Erinome`, `Orus`, `Sulafat` voices).
- **Lines:** 24 bilingual Indonesian/English tactical dispatch, field agent, and LRT PA announcement clips (`VO_01_INTRO.mp3`–`VO_24_DOOR_CLOSE.mp3`), indexed in [`assets/voice/manifest.json`](assets/voice/manifest.json).
