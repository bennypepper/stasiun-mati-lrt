# Public Audio & SFX Bank Licenses (`hydrogen-subway`)

All 33 clips in [`sfx_bank.json`](file:///C:/Users/Benny%20Pepper/Downloads/others/llm-tests/hydrogen-subway/research/sfx_bank.json) and `research/sfx/*.mp3` were sourced from genuine, publicly available, permissively licensed recordings (CC0 / Public Domain / CC-BY 3.0 / CC-BY 4.0) — zero synthetic audio generation was used.

Each recording was trimmed to remove dead air, high-pass filtered against DC/subsonic rumble, peak-normalized with `ffmpeg` (`volumedetect` + `alimiter`), encoded to mono 32 kHz 96 kbps MP3 (`audio/mpeg`), and empirically verified in headless Chromium Web Audio (`AudioContext.decodeAudioData` over `file://` — 33/33 decoded, 0 failures).

## Bank Summary

| Metric | Value |
| --- | --- |
| Total Clips | 50 |
| Total Audio Duration | 55.454 s |
| Total Raw MP3 Size | 708,952 bytes (692.3 KB) |
| Total Base64 Payload | 945,336 bytes (923.2 KB) |
| `sfx_bank.json` Size | 949,325 bytes (927.1 KB) |
| License Breakdown | 17 CC0 1.0, 1 Public Domain, 4 CC-BY 3.0, 28 CC-BY 4.0 |

---

## Clip Manifest, Sources & Licenses

### 1. Weapons (9 clips)

| Key | Output File | Duration | MP3 Bytes | Base64 Bytes | Original Filename & Processing | Author / Creator | License | Source URL |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `pistol_fire` | `sfx/pistol_fire.mp3` | 0.612 s | 7,820 | 10,428 | `Prepared SFX Library/1911/A_42P.wav` (trimmed `0.928s–1.428s`, EQ + compand + limiter punch) | Ben Jaszczak et al. (submitted by `bart`) | CC0 1.0 | https://opengameart.org/content/the-free-firearm-sound-library |
| `rifle_fire` | `sfx/rifle_fire.mp3` | 0.504 s | 6,524 | 8,700 | `Prepared SFX Library/AK-47/C_28P.wav` (trimmed `3.245s–3.645s`, EQ + compand + limiter punch) | Ben Jaszczak et al. (submitted by `bart`) | CC0 1.0 | https://opengameart.org/content/the-free-firearm-sound-library |
| `shotgun_fire` | `sfx/shotgun_fire.mp3` | 1.008 s | 12,572 | 16,764 | `shots.7z` -> `shots/shotgun.wav` (blast + pump, `0.000s–0.960s`, EQ + compand + limiter) | Michel Baradari | CC-BY 3.0 | https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots |
| `rpg_launch` | `sfx/rpg_launch.mp3` | 1.548 s | 19,052 | 25,404 | `launches.7z` -> `launches/rlaunch.wav` (`0.000s–1.500s`, EQ + compand + limiter) | Michel Baradari | CC-BY 3.0 | https://opengameart.org/content/4-projectile-launches |
| `rpg_explosion` | `sfx/rpg_explosion.mp3` | 1.450 s | 18,620 | 24,828 | `explosions.7z` -> `explosions/explode.wav` (`0.000s–1.450s`) | Michel Baradari | CC-BY 3.0 | https://opengameart.org/content/2-high-quality-explosions |
| `weapon_reload` | `sfx/weapon_reload.mp3` | 1.500 s | 19,052 | 25,404 | `gunreload1.wav` (`0.040s–1.540s`) | SpringySpringo | CC0 1.0 | https://opengameart.org/content/gun-reload-sounds |
| `shotgun_pump` | `sfx/shotgun_pump.mp3` | 0.440 s | 6,524 | 8,700 | `shotguncock_0.wav` (`0.030s–0.470s`) | SpringySpringo | CC0 1.0 | https://opengameart.org/content/gun-reload-sounds |
| `weapon_switch` | `sfx/weapon_switch.mp3` | 0.360 s | 5,228 | 6,972 | `equipmentclicks.wav` (trimmed `3.735s–4.095s`) | LFA | CC0 1.0 | https://opengameart.org/content/equipment-clicks-ii |
| `dry_fire` | `sfx/dry_fire.mp3` | 0.180 s | 3,068 | 4,092 | `equipment_clicks3.wav` (trimmed `0.175s–0.355s`) | LFA | CC0 1.0 | https://opengameart.org/content/equipment-clicks-iii |

### 2. Environment & Destruction (5 clips)

| Key | Output File | Duration | MP3 Bytes | Base64 Bytes | Original Filename & Processing | Author / Creator | License | Source URL |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `glass_shatter` | `sfx/glass_shatter.mp3` | 0.920 s | 12,140 | 16,188 | `glass_breaking.wav` (`0.000s–0.920s`) | Till Behrend | CC0 1.0 | https://opengameart.org/content/glass-break |
| `impact_concrete` | `sfx/impact_concrete.mp3` | 0.449 s | 6,524 | 8,700 | `75-cc0-breaking-falling-hit-sfx/bfh1_hit_01.ogg` (`0.000s–0.450s`) | Lavenderdotpet CC0 archive | CC0 1.0 | https://github.com/Lavenderdotpet/CC0-Public-Domain-Sounds/blob/main/75-cc0-breaking-falling-hit-sfx/bfh1_hit_01.ogg |
| `impact_metal` | `sfx/impact_metal.mp3` | 0.580 s | 8,252 | 11,004 | `METLImpt_MetalHitSurface_OS_01.ogg` (`0.000s–0.580s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |
| `debris_crumble` | `sfx/debris_crumble.mp3` | 0.950 s | 12,572 | 16,764 | `75-cc0-breaking-falling-hit-sfx/bfh1_breaking_01.ogg` (`0.000s–0.950s`) | Lavenderdotpet CC0 archive | CC0 1.0 | https://github.com/Lavenderdotpet/CC0-Public-Domain-Sounds/blob/main/75-cc0-breaking-falling-hit-sfx/bfh1_breaking_01.ogg |
| `turnstile_beep` | `sfx/turnstile_beep.mp3` | 0.147 s | 3,068 | 4,092 | `UIAlert_Notification_OS_01.ogg` (`0.000s–0.150s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |

### 3. Train & Station Transit (8 clips)

| Key | Output File | Duration | MP3 Bytes | Base64 Bytes | Original Filename & Processing | Author / Creator | License | Source URL |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `train_approach` | `sfx/train_approach.mp3` | 4.300 s | 52,748 | 70,332 | `London Underground 1996 Stock train arriving in a station.ogg` (`5.100s–9.400s`) | Philt3r | CC-BY 4.0 | https://commons.wikimedia.org/wiki/File:London_Underground_1996_Stock_train_arriving_in_a_station.ogg |
| `train_brake` | `sfx/train_brake.mp3` | 3.400 s | 41,948 | 55,932 | `GO Train arrives at Guildwood GO Station (Freesound).ogg` (`48.400s–51.800s`) | PascalHD | CC-BY 4.0 | https://commons.wikimedia.org/wiki/File:GO_Train_arrives_at_Guildwood_GO_Station_(Freesound).ogg |
| `door_chime` | `sfx/door_chime.mp3` | 0.650 s | 9,116 | 12,156 | `UIAlert_Notification_OS_02.ogg` (`0.000s–0.650s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |
| `door_open` | `sfx/door_open.mp3` | 0.840 s | 11,276 | 15,036 | `TRNDoor_TrainDoorsOpen_OS_01.ogg` (`1.560s–2.400s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |
| `door_close` | `sfx/door_close.mp3` | 1.499 s | 19,052 | 25,404 | `TRNDoor_TrainDoorsClose_OS_01.ogg` (`0.100s–1.600s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |
| `train_horn` | `sfx/train_horn.mp3` | 1.580 s | 19,916 | 26,556 | `The horn of a Bluebird railcar.ogg` (`0.000s–1.580s`) | NIRVAAN222222 | CC0 1.0 | https://commons.wikimedia.org/wiki/File:The_horn_of_a_Bluebird_railcar.ogg |
| `station_chime` | `sfx/station_chime.mp3` | 2.200 s | 27,692 | 36,924 | `UIAlert_MusicTone_OS_01.ogg` (`0.000s–2.200s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |
| `train_ride_loop` | `sfx/train_ride_loop.mp3` | 2.860 s | 35,468 | 47,292 | `Rail Joint sound OER HiSE.ogg` (`3.100s–6.260s`, 0.30s equal-power crossfade loop) | Cassiopeia sweet | Public Domain | https://commons.wikimedia.org/wiki/File:Rail_Joint_sound_OER_HiSE.ogg |

### 4. Player & Enemies (11 clips)

| Key | Output File | Duration | MP3 Bytes | Base64 Bytes | Original Filename & Processing | Author / Creator | License | Source URL |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `footstep_concrete_1` | `sfx/footstep_concrete_1.mp3` | 0.330 s | 5,228 | 6,972 | `Fantozzi-footsteps/flac/Fantozzi-StoneL1.flac` (`0.000s–0.330s`) | Fantozzi | CC0 1.0 | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone |
| `footstep_concrete_2` | `sfx/footstep_concrete_2.mp3` | 0.330 s | 5,228 | 6,972 | `Fantozzi-footsteps/flac/Fantozzi-StoneR1.flac` (`0.000s–0.330s`) | Fantozzi | CC0 1.0 | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone |
| `footstep_metal` | `sfx/footstep_metal.mp3` | 0.347 s | 5,228 | 6,972 | `FEETHmn_ShoeMetalWalk_OS_02.ogg` (`0.000s–0.350s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |
| `zombie_groan_1` | `sfx/zombie_groan_1.mp3` | 0.800 s | 10,844 | 14,460 | `zombies.zip` -> `zombies/zombie-1.wav` (`0.030s–0.830s`) | artisticdude | CC0 1.0 | https://opengameart.org/content/zombies-sound-pack |
| `zombie_groan_2` | `sfx/zombie_groan_2.mp3` | 1.450 s | 18,620 | 24,828 | `darsycho__zombie-moans_0.ogg` (`0.180s–1.630s`) | Darsycho | CC0 1.0 | https://opengameart.org/content/zombie-moans |
| `zombie_attack` | `sfx/zombie_attack.mp3` | 0.700 s | 9,548 | 12,732 | `zombies.zip` -> `zombies/zombie-4.wav` (`0.015s–0.715s`) | artisticdude | CC0 1.0 | https://opengameart.org/content/zombies-sound-pack |
| `zombie_hit` | `sfx/zombie_hit.mp3` | 0.440 s | 6,524 | 8,700 | `FGHTImpt_PunchHarder_OS_01.ogg` (`0.000s–0.440s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |
| `zombie_death` | `sfx/zombie_death.mp3` | 1.020 s | 13,436 | 17,916 | `michelbaradari-monsters.7z` -> `monster/deathr.wav` (`0.000s–1.020s`) | Michel Baradari | CC-BY 3.0 | https://opengameart.org/content/15-monster-gruntpaindeath-sounds |
| `player_hurt` | `sfx/player_hurt.mp3` | 0.547 s | 7,820 | 10,428 | `VOXMale_Male01Hurt_OS_01.ogg` (`0.000s–0.550s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |
| `player_heartbeat` | `sfx/player_heartbeat.mp3` | 1.000 s | 13,004 | 17,340 | `heartbeat_fast_0.wav` (`0.000s–1.000s`) | bart | CC0 1.0 | https://opengameart.org/content/heartbeat-sounds |
| `player_gasp` | `sfx/player_gasp.mp3` | 0.317 s | 4,796 | 6,396 | `VOXEfrt_Male01Effort_OS_01.ogg` (`0.000s–0.320s`) | Oculus VR, LLC | CC-BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ |

### 5. Props, Pickups, Weather & Combat Details (17 clips)

| Key | Output File | Duration | MP3 Bytes | Original Filename & Processing | Author / Creator | License | Source URL |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| `generator_start` | `sfx/generator_start.mp3` | 1.656 s | 20,348 | `engine_start_up_01.mp3` (trimmed `0.03s–1.62s`, ignition crank + startup, mono 32kHz 96kbps MP3) | looneybits | CC0 1.0 | https://opengameart.org/content/car-engine-start-up-02 |
| `generator_loop` | `sfx/generator_loop.mp3` | 2.844 s | 34,604 | `MACHMisc_MachineGeneric_LOOP_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `electric_box_open` | `sfx/electric_box_open.mp3` | 0.936 s | 11,708 | `METLHndl_ElectricBoxOpen_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `breaker_throw` | `sfx/breaker_throw.mp3` | 0.864 s | 10,844 | `MECHLvr_LeverPull_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `crate_open` | `sfx/crate_open.mp3` | 1.152 s | 14,300 | `DOORMetl_HatchOpen_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `loot_chime` | `sfx/loot_chime.mp3` | 1.260 s | 15,596 | `UIMisc_Powerup_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `pickup_ammo` | `sfx/pickup_ammo.mp3` | 0.684 s | 8,684 | `CLOTHMvmt_MovementWithGear_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `pickup_medkit` | `sfx/pickup_medkit.mp3` | 0.936 s | 11,708 | `UIMisc_Powerup_OS_02.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `paper_rustle` | `sfx/paper_rustle.mp3` | 0.792 s | 9,980 | `PAPRHndl_PaperCrumple_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `car_trunk_open` | `sfx/car_trunk_open.mp3` | 0.936 s | 11,708 | `VEHDoor_CarDoorOpen_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `water_pour` | `sfx/water_pour.mp3` | 1.008 s | 12,572 | `WATRPlmb_FaucetWaterRun_LOOP_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `hydrant_spray` | `sfx/hydrant_spray.mp3` | 2.268 s | 27,692 | `WATRFall_Waterfall_LOOP_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `rain_loop` | `sfx/rain_loop.mp3` | 3.060 s | 37,196 | `RAIN_CityRain_LOOP_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `casing_concrete` | `sfx/casing_concrete.mp3` | 0.504 s | 6,524 | `BLLTShel_ShellCasingConcrete_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `casing_metal` | `sfx/casing_metal.mp3` | 0.504 s | 6,524 | `BLLTShel_ShellCasingMetal_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `flashlight_click` | `sfx/flashlight_click.mp3` | 0.288 s | 3,932 | `MECHSwtch_SwitchSmallOn_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |
| `headshot_crit` | `sfx/headshot_crit.mp3` | 0.504 s | 6,524 | `GOREBone_SkullCracking_OS_01.ogg` | Oculus VR, LLC | CC-BY 4.0 | https://github.com/facebookincubator/Meta-open-sound |

---

## Required Attribution Notice (CC-BY 3.0 / CC-BY 4.0 Credits)

If displaying an in-game or repository credits block, include the following attributions for CC-BY assets (all remaining assets are CC0 1.0 / Public Domain):

- **Oculus Audio Pack 01** (`impact_metal`, `turnstile_beep`, `door_chime`, `door_open`, `door_close`, `station_chime`, `footstep_metal`, `zombie_hit`, `player_hurt`, `player_gasp`, `generator_loop`, `electric_box_open`, `breaker_throw`, `crate_open`, `loot_chime`, `pickup_ammo`, `pickup_medkit`, `paper_rustle`, `car_trunk_open`, `water_pour`, `hydrant_spray`, `rain_loop`, `casing_concrete`, `casing_metal`, `flashlight_click`, `headshot_crit`): Copyright Oculus VR, LLC (`https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/`, GitHub mirror `https://github.com/facebookincubator/Meta-open-sound`), licensed under **CC BY 4.0** (`https://creativecommons.org/licenses/by/4.0/`). Modified (trimmed, filtered, mono MP3 re-encoded).
- **Michel Baradari** (`shotgun_fire`, `rpg_launch`, `rpg_explosion`, `zombie_death`): Sound effects from OpenGameArt (`https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots`, `/4-projectile-launches`, `/2-high-quality-explosions`, `/15-monster-gruntpaindeath-sounds`), licensed under **CC BY 3.0** (`https://creativecommons.org/licenses/by/3.0/`). Modified (trimmed, mono MP3 re-encoded).
- **Philt3r** (`train_approach`): *"London Underground 1996 Stock train arriving in a station.ogg"* (`https://commons.wikimedia.org/wiki/File:London_Underground_1996_Stock_train_arriving_in_a_station.ogg`), licensed under **CC BY 4.0**. Modified (excerpted `5.10s–9.40s`, mono MP3 re-encoded).
- **PascalHD** (`train_brake`): *"GO Train arrives at Guildwood GO Station (Freesound).ogg"* (`https://commons.wikimedia.org/wiki/File:GO_Train_arrives_at_Guildwood_GO_Station_(Freesound).ogg`), licensed under **CC BY 4.0**. Modified (excerpted braking squeal `48.40s–51.80s`, mono MP3 re-encoded).
