(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const E = (I.enemies = I.enemies || {});

  const MAX_ENEMIES = E.MAX_ENEMIES;
  const MAX_BILE = E.MAX_BILE;

  const FALLBACK_DIFFICULTY_TIERS = {
    easy: {
      key: 'easy',
      waveCountMult: 0.75,
      extraWavesPerStation: 0,
      roamCountBase: 4,
      poolCap: 20,
      enemyHpMult: 0.78,
      armorMult: 0.70,
      enemySpeedMult: 0.86,
      bruteChargeMult: 1.75,
      bruteChargeCooldown: 7.5,
      bruteChargeWindup: 0.80,
      runnerFlankAngle: 0.08,
      enemyDmgMult: 0.65,
      pickupAmmoMult: 1.35,
      healMult: 1.30,
      perceptionMode: 'RADIAL_SHORT',
      proxRadius: 18.0,
      fovDeg: 0,
      fovRange: 0,
      cosHalfFov: 1.0,
      soundMult: 0.35,
      yawRate: 4.5,
      alertDelay: 0.45,
      screamerBuffMult: 1.22,
      screamRadius: 18.0,
      roamSpeedMult: 0.55,
      dropRate: 0.48,
      dropRates: { walker: 0.48, runner: 0.48, spitter: 0.56, screamer: 0.58, brute: 0.72 }
    },
    medium: {
      key: 'medium',
      waveCountMult: 1.00,
      extraWavesPerStation: 0,
      roamCountBase: 10,
      poolCap: 26,
      enemyHpMult: 1.00,
      armorMult: 1.00,
      enemySpeedMult: 1.00,
      bruteChargeMult: 2.10,
      bruteChargeCooldown: 5.5,
      bruteChargeWindup: 0.65,
      runnerFlankAngle: 0.12,
      enemyDmgMult: 1.00,
      pickupAmmoMult: 1.00,
      healMult: 1.00,
      perceptionMode: 'RADIAL_MEDIUM',
      proxRadius: 28.0,
      fovDeg: 0,
      fovRange: 0,
      cosHalfFov: 1.0,
      soundMult: 0.65,
      yawRate: 6.5,
      alertDelay: 0.28,
      screamerBuffMult: 1.22,
      screamRadius: 24.0,
      roamSpeedMult: 0.55,
      dropRate: 0.26,
      dropRates: { walker: 0.26, runner: 0.26, spitter: 0.36, screamer: 0.38, brute: 0.52 }
    },
    hard: {
      key: 'hard',
      waveCountMult: 1.35,
      extraWavesPerStation: 1,
      roamCountBase: 18,
      poolCap: 32,
      enemyHpMult: 1.25,
      armorMult: 1.30,
      enemySpeedMult: 1.12,
      bruteChargeMult: 2.35,
      bruteChargeCooldown: 4.5,
      bruteChargeWindup: 0.52,
      runnerFlankAngle: 0.22,
      enemyDmgMult: 1.35,
      pickupAmmoMult: 0.80,
      healMult: 0.80,
      perceptionMode: 'FOV_CONE_LOS',
      proxRadius: 10.0,
      fovDeg: 110,
      fovRange: 45.0,
      cosHalfFov: Math.cos((55 * Math.PI) / 180),
      soundMult: 1.00,
      yawRate: 8.5,
      alertDelay: 0.14,
      screamerBuffMult: 1.22,
      screamRadius: 30.0,
      roamSpeedMult: 0.65,
      dropRate: 0.12,
      dropRates: { walker: 0.12, runner: 0.12, spitter: 0.19, screamer: 0.21, brute: 0.32 }
    },
    nightmare: {
      key: 'nightmare',
      waveCountMult: 1.70,
      extraWavesPerStation: 2,
      roamCountBase: 26,
      poolCap: 32,
      enemyHpMult: 1.55,
      armorMult: 1.65,
      enemySpeedMult: 1.24,
      bruteChargeMult: 2.65,
      bruteChargeCooldown: 3.6,
      bruteChargeWindup: 0.42,
      runnerFlankAngle: 0.30,
      enemyDmgMult: 1.75,
      pickupAmmoMult: 0.65,
      healMult: 0.65,
      perceptionMode: 'FOV_CONE_SOUND',
      proxRadius: 12.0,
      fovDeg: 135,
      fovRange: 60.0,
      cosHalfFov: Math.cos((67.5 * Math.PI) / 180),
      soundMult: 1.35,
      yawRate: 11.0,
      alertDelay: 0.05,
      screamerBuffMult: 1.30,
      screamRadius: 38.0,
      roamSpeedMult: 0.75,
      dropRate: 0.06,
      dropRates: { walker: 0.06, runner: 0.06, spitter: 0.10, screamer: 0.12, brute: 0.18 }
    }
  };

  const ROAM_ZONE_WEIGHTS = {
    easy: [0.50, 0.00, 0.50, 0.00, 0.00],
    medium: [0.20, 0.10, 0.40, 0.30, 0.00],
    hard: [0.10, 0.15, 0.25, 0.30, 0.20],
    nightmare: [0.05, 0.15, 0.20, 0.30, 0.30]
  };

  const VARIANT_MIX_RATIOS = {
    easy: { walker: 0.80, runner: 0.08, spitter: 0.07, brute: 0.05, screamer: 0.00 },
    medium: { walker: 0.68, runner: 0.12, spitter: 0.10, brute: 0.06, screamer: 0.04 },
    hard: { walker: 0.50, runner: 0.22, spitter: 0.12, brute: 0.09, screamer: 0.07 },
    nightmare: { walker: 0.38, runner: 0.28, spitter: 0.14, brute: 0.11, screamer: 0.09 }
  };

  // Pre-allocated scratch math (ZERO per-frame heap allocations inside update)
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _v4 = new THREE.Vector3();
  const _rayOrig = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _crawlHead = new THREE.Vector3();
  const _crawlChest = new THREE.Vector3();
  const _crawlHips = new THREE.Vector3();
  const _crawlFeet = new THREE.Vector3();
  const _losOrig = new THREE.Vector3();
  const _losDir = new THREE.Vector3();
  const _sepVel = { x: 0, z: 0 };
  const _patrolOut = { x: 0, y: 0, z: 0 };
  const _tryBack = [0, 0, 0];
  const _tryAngles3 = [0, 0, 0];
  const _tryAngles5 = [0, 0, 0, 0, 0];
  const MAX_BOARDING_ZOMBIES = 6;
  const MAX_PER_DOOR_FUNNEL = 2;
  const _closestDoorIdx = new Int8Array(3);
  const _closestDoorDist = new Float32Array(3);
  const _doorAssignCount = new Int8Array(9);
  const _candSlotIdx = new Int16Array(MAX_ENEMIES);
  const _candDist = new Float32Array(MAX_ENEMIES);
  const _candPicked = new Uint8Array(MAX_ENEMIES);
  const _zombieDoorAssign = new Int8Array(MAX_ENEMIES);

  const _sfxGroanFew = { refDist: 8.5, maxDist: 92.0 };
  const _sfxGroanNorm = { refDist: 6.0, maxDist: 92.0 };
  const _sfxStepClose = { refDist: 4.0, maxDist: 28.0 };
  const _sfxScream = { rate: 1.42, refDist: 8.0, maxDist: 96.0 };
  const _sfxBruteWindup = { rate: 0.72, refDist: 8.0, maxDist: 88.0 };

  const _cachedMergedTiers = {};
  let _cachedConfigTiersRef = null;

  let _difficultyKey = 'medium';
  let _atmosphereMode = 'night_horror';
  let _qualityTier = null;

  function getQualityTier() {
    if (_qualityTier) return _qualityTier;
    return (LRT.Config && LRT.Config.QUALITY_TIERS && LRT.Core && LRT.Config.QUALITY_TIERS[LRT.Core.qualityKey]) || {};
  }

  function applyQualityTier(tier) {
    _qualityTier = tier || null;
    if (typeof E.applyQualityTier === 'function') {
      E.applyQualityTier(getQualityTier());
    }
  }
  const FALLBACK_DAYLIGHT_MODS = {
    speedMult: 1.22,
    sightRangeMult: 1.40,
    fovDegBoost: 35,
    alertDelayMult: 0.65,
    gunshotAlertMult: 1.35,
    windupMult: 0.85
  };

  function getDaylightMods() {
    return (LRT.Config && LRT.Config.DAYLIGHT_OUTBREAK_MODS) || FALLBACK_DAYLIGHT_MODS;
  }

  function isDaylightOutbreak() {
    return _atmosphereMode === 'daylight_outbreak';
  }

  function setAtmosphereMode(mode) {
    _atmosphereMode = (mode === 'daylight_outbreak') ? 'daylight_outbreak' : 'night_horror';
    return _atmosphereMode;
  }

  function getAtmosphereMode() {
    return _atmosphereMode;
  }
  let _waveNum = 0;
  let _stationIndex = 0;
  let _waveTotalCount = 0;
  let _totalKills = 0;
  let _spawnNodes = [];
  let _spawnCursor = 0;
  let _groanTimer = 1.6;
  let _groanCursor = 0;
  let _stepAudioTimer = 0.45;
  let _stepAlternate = false;
  let _cachedOnDropPickup = null;
  let _elapsed = 0;
  let _frameCount = 0;

  function normalizeDiffKey(key) {
    return (key && key in FALLBACK_DIFFICULTY_TIERS) ? key : 'medium';
  }

  function getDifficultyTier(diffKey) {
    const key = normalizeDiffKey(diffKey || _difficultyKey);
    const cfgTiers = LRT.Config && LRT.Config.DIFFICULTY_TIERS ? LRT.Config.DIFFICULTY_TIERS : null;
    if (cfgTiers !== _cachedConfigTiersRef) {
      for (const k in _cachedMergedTiers) delete _cachedMergedTiers[k];
      _cachedConfigTiersRef = cfgTiers;
    }
    if (_cachedMergedTiers[key]) return _cachedMergedTiers[key];

    const base = FALLBACK_DIFFICULTY_TIERS[key];
    const ext = cfgTiers && cfgTiers[key] ? cfgTiers[key] : null;
    const merged = ext ? Object.assign({}, base, ext) : Object.assign({}, base);
    if (merged.fovDeg > 0) {
      merged.cosHalfFov = Math.cos((merged.fovDeg * 0.5 * Math.PI) / 180);
    }
    _cachedMergedTiers[key] = merged;
    return merged;
  }

  function setDifficulty(diffKey) {
    _difficultyKey = normalizeDiffKey(diffKey);
    const tier = getDifficultyTier(_difficultyKey);
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z || !z.active || z.dead) continue;
      const cfg = E.getEnemyCfg(z.variant);
      z.damage = Math.round(cfg.damage * tier.enemyDmgMult);
    }
    return _difficultyKey;
  }

  function getDifficulty() {
    return _difficultyKey;
  }

  function getDifficultyConfig(diffKey) {
    return getDifficultyTier(diffKey);
  }

  function getDropRoll(variant, diffKey) {
    const tier = getDifficultyTier(diffKey);
    const v = variant || 'walker';
    const rates = tier.dropRates || null;
    const chance = (rates && typeof rates[v] === 'number')
      ? rates[v]
      : (typeof tier.dropRate === 'number' ? tier.dropRate : 0.26);
    if (Math.random() >= chance) return null;

    const itemRoll = Math.random();
    if (v === 'brute') {
      if (itemRoll < 0.38) return 'lootcrate';
      if (itemRoll < 0.72) return 'health';
      return 'ammo';
    }
    if (v === 'screamer') {
      if (itemRoll < 0.25) return 'lootcrate';
      if (itemRoll < 0.55) return 'health';
      return 'ammo';
    }
    if (v === 'spitter') {
      return itemRoll < 0.38 ? 'health' : 'ammo';
    }
    return itemRoll < 0.32 ? 'health' : 'ammo';
  }

  function isValidSpawnPoint(x, y, z, playerPos, minPlayerDistSq) {
    const minDistSq = minPlayerDistSq !== undefined ? minPlayerDistSq : 49;
    if (playerPos) {
      const dx = x - playerPos.x;
      const dz = z - playerPos.z;
      if (dx * dx + dz * dz < minDistSq) return false;
    }
    if (LRT.Train && typeof LRT.Train.isPlayerInside === 'function') {
      _v1.set(x, y + 0.8, z);
      if (LRT.Train.isPlayerInside(_v1)) return false;
    }
    if (x > -1.45 && x < 1.38 && y > -0.6) return false;
    return !E.isBlockedAt(x, y, z, 0.45);
  }

  function pickPatrolTargetFor(slot, graph) {
    const g = graph || (LRT.Station && typeof LRT.Station.getNavGraph === 'function' ? LRT.Station.getNavGraph() : null);
    if (g && typeof E.pickAdjacentPatrolNode === 'function') {
      if (E.pickAdjacentPatrolNode(g, slot.x, slot.y, slot.z, slot.patrolTargetX, slot.patrolTargetZ, _patrolOut)) {
        slot.patrolTargetX = _patrolOut.x;
        slot.patrolTargetZ = _patrolOut.z;
        return;
      }
    }
    const ang = Math.random() * Math.PI * 2;
    const dist = 5.0 + Math.random() * 6.0;
    slot.patrolTargetX = slot.patrolOriginX + Math.sin(ang) * dist;
    slot.patrolTargetZ = slot.patrolOriginZ + Math.cos(ang) * dist;
  }

  function spawnOneZombie(variant, pos, opts) {
    let slot = null;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!E.zombies[i].active) { slot = E.zombies[i]; break; }
    }
    if (!slot) {
      // Evict oldest settled dead corpse so persistent corpses never block wave spawns
      let oldestDead = null;
      let bestScore = -1;
      for (let i = 0; i < MAX_ENEMIES; i++) {
        const cand = E.zombies[i];
        if (cand.active && cand.dead && cand.deathTimer >= 1.2) {
          const score = cand.deathTimer;
          if (score > bestScore) {
            bestScore = score;
            oldestDead = cand;
          }
        }
      }
      if (oldestDead) {
        oldestDead.active = false;
        oldestDead.dead = false;
        E.zeroZombieMatrices(oldestDead.id);
        slot = oldestDead;
      }
    }
    if (!slot) return false;

    const o = opts || {};
    const tier = getDifficultyTier(o.diffKey);
    const cfg = E.getEnemyCfg(variant);
    const w = Math.max(1, _waveNum);
    const s = Math.max(0, _stationIndex);
    const isHardPlus = (tier.key === 'hard' || tier.key === 'nightmare') ? 1 : 0;

    const hpScale = 1.0 + 0.06 * (w - 1) + 0.04 * s + 0.02 * isHardPlus * s;
    const armorScale = 1.0 + 0.06 * (w - 1) + 0.04 * s;

    const isRoamer = !!o.isRoamer;
    const initAggro = o.aggroState || (isRoamer ? 'IDLE' : 'CHASE');

    slot.active = true;
    slot.dead = false;
    slot.variant = variant;
    slot.x = pos.x;
    slot.y = pos.y !== undefined ? pos.y : 0.0;
    slot.z = pos.z;
    slot.vx = 0;
    slot.vy = 0;
    slot.vz = 0;
    slot.yaw = typeof o.yaw === 'number' ? o.yaw : (Math.random() * Math.PI * 2);
    slot.hp = Math.round(cfg.hp * tier.enemyHpMult * hpScale);
    slot.maxHp = slot.hp;
    slot.armorHp = variant === 'brute' ? Math.round(115 * tier.armorMult * armorScale) : 0;
    slot.hasArmor = variant === 'brute';
    slot.speed = cfg.speed * tier.enemySpeedMult * (0.93 + Math.random() * 0.14);
    slot.baseSpeed = slot.speed;
    slot.legDmg = 0;
    slot.legCrippled = false;
    slot.hitZone = 'torso';
    slot.hitSide = 0;
    slot.hornVulnTimer = 0;
    slot.fallPitchSign = 1;
    slot.scale = cfg.scale || 1.0;
    slot.damage = Math.round(cfg.damage * tier.enemyDmgMult);
    slot.attackRange = cfg.attackRange;
    slot.attackCooldown = cfg.attackCooldown;
    slot.attackTimer = 0.25 + Math.random() * 0.4;
    slot.spitTimer = 1.2 + Math.random() * 1.4;
    slot.spitAnimTimer = 0;
    slot.spitBlocked = false;
    slot.staggerTimer = 0;
    slot.hitFlashTimer = 0;
    slot.deathTimer = 0;
    slot.fallAngle = 0;
    slot.fallSign = Math.random() > 0.5 ? 1 : -1;
    slot.decapitated = false;
    slot.bloodPoolSpawned = false;
    slot.neckSpurtCount = 0;
    slot.headDmg = 0;
    slot.armLDmg = 0;
    slot.armRDmg = 0;
    slot.legLDmg = 0;
    slot.legRDmg = 0;
    slot.lostLeftArm = false;
    slot.lostRightArm = false;
    slot.lostLeftLeg = false;
    slot.lostRightLeg = false;
    slot.crawling = false;
    slot.crawlFallTimer = 0;
    slot.crawlPhase = 0;
    slot.crawlBloodDist = 0;
    slot.crippledLeg = 1;
    slot.woundMask = 0;
    slot.animPhase = Math.random() * Math.PI * 2;
    slot.moveBlend = 0;
    slot.actualSpeed = 0;
    slot.actualSpeedSmooth = 0;
    slot.smoothSteerX = 0;
    slot.smoothSteerZ = 0;
    slot.seed = Math.random() * 100;
    slot.limbBias = Math.random() > 0.5 ? 1 : -1;
    slot.steerCommit = 0;
    slot.steerDir = (slot.id % 2 === 0 ? 1 : -1);
    slot.blockedTime = 0;
    slot.stuckTime = 0;
    slot.progTimer = 0;
    slot.lastProgX = slot.x;
    slot.lastProgZ = slot.z;
    slot.alertDelay = 0;
    slot.navTimer = Math.random() * 0.25;
    slot.hasNavWp = false;
    slot.screamTimer = 1.2 + Math.random() * 2.0;
    slot.shriekTimer = 0;
    slot.buffTimer = 0;
    slot.chargeWindup = 0;
    slot.chargeTimer = 0;
    slot.chargeCooldown = tier.bruteChargeCooldown * 0.5 + Math.random() * 2.0;
    slot.chargeDirX = 0;
    slot.chargeDirZ = 0;
    slot.lureTimer = 0;
    slot.lurePosX = 0;
    slot.lurePosY = 0;
    slot.lurePosZ = 0;

    slot.isRoamer = isRoamer;
    slot.aggroState = initAggro;
    slot.aggroTimer = 0;
    slot.chaseLoseTimer = 0;
    slot.patrolOriginX = slot.x;
    slot.patrolOriginZ = slot.z;
    slot.patrolTargetX = o.patrolTarget ? o.patrolTarget.x : slot.x;
    slot.patrolTargetZ = o.patrolTarget ? o.patrolTarget.z : slot.z;
    slot.patrolWaitTimer = isRoamer ? (0.4 + Math.random() * 2.0) : 0;
    slot.lastKnownX = slot.x;
    slot.lastKnownY = slot.y;
    slot.lastKnownZ = slot.z;
    slot.coarseDt = 0;
    slot.matrixInit = false;
    slot.groundedOnce = false;
    slot._lastAnimTime = undefined;

    if (isRoamer && initAggro === 'PATROL' && !o.patrolTarget) {
      pickPatrolTargetFor(slot, o.navGraph);
    }

    E.assignVariantVisuals(slot);
    E.applyZombieColors(slot);
    E.markColorsDirty();
    E.updateZombieMatrices(slot, _elapsed, 0);
    slot.matrixInit = true;

    if (slot.id + 1 > E.activeHighWater) {
      E.activeHighWater = slot.id + 1;
      E.syncMeshCounts(E.activeHighWater);
    }
    return true;
  }

  function spawnLineup(originPos, spacing) {
    const base = originPos || { x: 2.8, y: 0.0, z: 0.5 };
    const sp = spacing !== undefined ? spacing : 1.15;
    const variants = ['walker', 'runner', 'brute', 'spitter', 'screamer'];
    let spawned = 0;
    for (let i = 0; i < variants.length; i++) {
      const ok = spawnOneZombie(variants[i], {
        x: base.x + i * sp,
        y: base.y !== undefined ? base.y : 0.0,
        z: base.z
      });
      if (ok) spawned++;
    }
    return spawned;
  }

  function buildFallbackNodes(playerPos) {
    const nodes = [];
    const zs = [-46, -38, -28, -18, 18, 28, 38, 46];
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (!playerPos || Math.abs(z - playerPos.z) > 10) {
        nodes.push({ x: 3.4, y: 0.0, z });
        nodes.push({ x: 4.8, y: 0.0, z: z * 0.85 });
      }
    }
    return nodes;
  }

  function pickNextNode(playerPos) {
    const nodes = (_spawnNodes && _spawnNodes.length > 0) ? _spawnNodes : buildFallbackNodes(playerPos);
    const grid = LRT.Station && LRT.Station.getSpatialGrid ? LRT.Station.getSpatialGrid() : null;
    const tc = LRT.Train && LRT.Train.getColliders ? LRT.Train.getColliders() : null;

    if (playerPos && nodes.length > 3) {
      const near = [];
      const outer = [];
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        const dh = Math.hypot(nd.x - playerPos.x, nd.z - playerPos.z);
        if (dh <= 38.0) {
          near.push(nd);
        } else {
          outer.push(nd);
        }
      }

      const preferNear = Math.random() < 0.75;
      const primaryList = (preferNear && near.length > 0) ? near : (outer.length > 0 ? outer : near);
      const secondaryList = (primaryList === near && outer.length > 0) ? outer : near;

      for (const pool of [primaryList, secondaryList]) {
        for (let attempt = 0; attempt < pool.length; attempt++) {
          const n = pool[(_spawnCursor + attempt) % pool.length];
          const jx = (Math.random() - 0.5) * 0.9;
          const jz = (Math.random() - 0.5) * 0.9;
          const px = n.x + jx;
          const py = n.y !== undefined ? n.y : 0.0;
          const pz = n.z + jz;
          E.gatherNearbyColliders(px, pz, 1.5, grid, tc);
          if (isValidSpawnPoint(px, py, pz, playerPos)) {
            _spawnCursor = (_spawnCursor + attempt + 1) % nodes.length;
            return { x: px, y: py, z: pz };
          }
        }
      }
    }

    for (let attempt = 0; attempt < nodes.length * 2; attempt++) {
      const n = nodes[(_spawnCursor + attempt) % nodes.length];
      const jx = (Math.random() - 0.5) * 0.9;
      const jz = (Math.random() - 0.5) * 0.9;
      const px = n.x + jx;
      const py = n.y !== undefined ? n.y : 0.0;
      const pz = n.z + jz;
      E.gatherNearbyColliders(px, pz, 1.5, grid, tc);
      if (isValidSpawnPoint(px, py, pz, playerPos)) {
        _spawnCursor = (_spawnCursor + attempt + 1) % nodes.length;
        return { x: px, y: py, z: pz };
      }
    }
    const fallback = nodes[_spawnCursor % nodes.length];
    _spawnCursor = (_spawnCursor + 1) % nodes.length;
    return { x: fallback.x, y: fallback.y !== undefined ? fallback.y : 0.0, z: fallback.z };
  }

  function allocateCountsByWeights(total, weights) {
    const counts = new Array(weights.length).fill(0);
    if (total <= 0) return counts;
    const rems = [];
    let assigned = 0;
    for (let i = 0; i < weights.length; i++) {
      const raw = total * weights[i];
      const fl = Math.floor(raw);
      counts[i] = fl;
      assigned += fl;
      rems.push({ idx: i, rem: raw - fl });
    }
    rems.sort((a, b) => b.rem - a.rem);
    let left = total - assigned;
    for (let i = 0; i < rems.length && left > 0; i++) {
      if (weights[rems[i].idx] > 0) {
        counts[rems[i].idx]++;
        left--;
      }
    }
    return counts;
  }

  function buildWaveVariantList(waveNum, stationIdx, tier) {
    const w = Math.max(1, waveNum);
    const s = Math.max(0, stationIdx);
    const key = tier.key;

    let nBase;
    if (w === 1) {
      nBase = 6;
    } else if (w === 2) {
      nBase = 9 + (s >= 1 ? 1 : 0) + (s >= 2 ? 1 : 0);
    } else if (w === 3) {
      nBase = 14;
    } else {
      nBase = Math.min(34, 10 + 3 * w + s);
    }

    const total = Math.max(4, Math.round(nBase * tier.waveCountMult));
    const list = [];

    if (w === 1 && s === 0) {
      let ratios;
      if (key === 'easy') ratios = [1.0, 0, 0, 0, 0];
      else if (key === 'hard') ratios = [0.70, 0.20, 0.10, 0, 0];
      else if (key === 'nightmare') ratios = [0.55, 0.30, 0.10, 0.05, 0];
      else ratios = [0.85, 0.15, 0, 0, 0];
      const counts = allocateCountsByWeights(total, ratios);
      const order = ['walker', 'runner', 'spitter', 'brute', 'screamer'];
      for (let v = 0; v < order.length; v++) {
        for (let c = 0; c < counts[v]; c++) list.push(order[v]);
      }
      return list;
    }

    const mix = VARIANT_MIX_RATIOS[key] || VARIANT_MIX_RATIOS.medium;
    const allowScreamer = (key !== 'easy') || ((s % 6) === 5);
    const screamWeight = allowScreamer ? mix.screamer : 0;
    const walkerWeight = mix.walker + (allowScreamer ? 0 : mix.screamer);
    const counts = allocateCountsByWeights(total, [walkerWeight, mix.runner, mix.spitter, mix.brute, screamWeight]);

    if (key === 'nightmare' && s >= 1 && counts[4] < 1) {
      counts[4] = 1;
      if (counts[0] > 1) counts[0]--;
      else if (counts[1] > 1) counts[1]--;
    }

    const order = ['walker', 'runner', 'spitter', 'brute', 'screamer'];
    for (let v = 0; v < order.length; v++) {
      for (let c = 0; c < counts[v]; c++) list.push(order[v]);
    }
    return list;
  }

  function init(scene) {
    E.initMeshRoot(scene);
    reset();
    return Enemies;
  }

  function reset() {
    E.pendingQueue.length = 0;
    _waveNum = 0;
    _stationIndex = 0;
    _waveTotalCount = 0;
    _totalKills = 0;
    _spawnNodes = [];
    _frameCount = 0;
    E.resetMeshes();
  }

  function spawnWave(waveNum, stationIndex, spawnNodes, diffKey) {
    if (!E.initialized) return;
    if (diffKey) setDifficulty(diffKey);
    const tier = getDifficultyTier();

    _waveNum = Math.max(1, waveNum || 1);
    _stationIndex = Math.max(0, stationIndex || 0);
    _spawnNodes = Array.isArray(spawnNodes) ? spawnNodes.slice() : [];
    E.pendingQueue.length = 0;

    let deactivationDirty = false;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (E.zombies[i].dead) {
        E.zombies[i].active = false;
        E.zombies[i].dead = false;
        E.zeroZombieMatrices(i);
        deactivationDirty = true;
      }
    }
    if (deactivationDirty) {
      E.flushMeshMatrices();
    }

    const playerPos = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' && LRT.PlayerUI.getState().pos) || null;
    const list = buildWaveVariantList(_waveNum, _stationIndex, tier);
    _waveTotalCount = list.length;

    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }

    const qTier = getQualityTier();
    const cap = Math.min(MAX_ENEMIES, tier.poolCap || MAX_ENEMIES, qTier.maxEnemies || MAX_ENEMIES);
    let activeNow = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (E.zombies[i].active) activeNow++;
    }

    for (let i = 0; i < list.length; i++) {
      if (activeNow < cap) {
        const pt = pickNextNode(playerPos);
        if (spawnOneZombie(list[i], pt, { isRoamer: false, aggroState: 'CHASE' })) {
          activeNow++;
        } else {
          E.pendingQueue.push(list[i]);
        }
      } else {
        E.pendingQueue.push(list[i]);
      }
    }

    E.markColorsDirty();
  }

  function categorizeAnchorNode(n, pools) {
    if (!n || typeof n.x !== 'number' || typeof n.z !== 'number') return;
    const tag = String(n.tag || n.zone || '').toLowerCase();
    const y = n.y !== undefined ? n.y : 0.0;
    if (tag === 'track_bed' || tag === 'stair_ramp' || tag === 'ada_ramp' || tag === 'jpo_stair' || tag === 'garden_stair_foot') {
      return;
    }

    if (y >= 3.5 || tag.includes('jpo') || tag.includes('balcony')) {
      pools.jpo.push({ x: n.x, y, z: n.z, tag });
      return;
    }
    if (tag.includes('alley') || tag.includes('col_road') || tag.includes('collector') || tag.includes('branch') || Math.abs(n.x) >= 48.0) {
      pools.alley.push({ x: n.x, y, z: n.z, tag });
      return;
    }
    if (tag.includes('road') || tag.includes('blvd') || tag.includes('crossing')) {
      pools.blvd.push({ x: n.x, y, z: n.z, tag });
      return;
    }
    if (tag.includes('plaza') || tag.includes('park') || tag.includes('prom') || tag.includes('depot_plaza') || tag.includes('depot_door')) {
      pools.plaza.push({ x: n.x, y, z: n.z, tag });
      return;
    }
    if (y < -0.92 && y > -1.08) {
      pools.blvd.push({ x: n.x, y, z: n.z, tag });
      return;
    }
    if (y <= -0.72 && y >= -0.92) {
      pools.plaza.push({ x: n.x, y, z: n.z, tag });
      return;
    }
    pools.station.push({ x: n.x, y, z: n.z, tag });
  }

  function appendCollectorAndAlleyAnchors(pools, spatialGrid, tc, playerPos) {
    // Derive outer boulevard center X from existing blvd anchors or rail config
    let eastBlvdX = 36.0;
    let westBlvdX = -25.5;
    for (let i = 0; i < pools.blvd.length; i++) {
      const b = pools.blvd[i];
      if (b.tag.includes('east') || b.x > 18) eastBlvdX = b.x;
      if (b.tag.includes('west') || b.x < -14) westBlvdX = b.x;
    }
    // Collector roads sit ~47m outside boulevard centers; branch alleys at z = -24, +24
    const eastColX = eastBlvdX + 47.0;
    const westColX = westBlvdX - 47.0;
    const branchMidEastX = eastBlvdX + 24.0;
    const branchMidWestX = westBlvdX - 24.0;

    const candidates = [
      { x: eastColX, y: -1.0, z: -50, tag: 'east_col_road' },
      { x: eastColX, y: -1.0, z: -24, tag: 'east_col_road' },
      { x: eastColX, y: -1.0, z: 0, tag: 'east_col_road' },
      { x: eastColX, y: -1.0, z: 24, tag: 'east_col_road' },
      { x: eastColX, y: -1.0, z: 50, tag: 'east_col_road' },
      { x: westColX, y: -1.0, z: -50, tag: 'west_col_road' },
      { x: westColX, y: -1.0, z: -24, tag: 'west_col_road' },
      { x: westColX, y: -1.0, z: 0, tag: 'west_col_road' },
      { x: westColX, y: -1.0, z: 24, tag: 'west_col_road' },
      { x: westColX, y: -1.0, z: 50, tag: 'west_col_road' },
      { x: branchMidEastX, y: -1.0, z: -24, tag: 'east_branch_alley' },
      { x: branchMidEastX, y: -1.0, z: 24, tag: 'east_branch_alley' },
      { x: branchMidWestX, y: -1.0, z: -24, tag: 'west_branch_alley' },
      { x: branchMidWestX, y: -1.0, z: 24, tag: 'west_branch_alley' }
    ];

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (spatialGrid && typeof spatialGrid.queryPoint === 'function') {
        const near = spatialGrid.queryPoint(c.x, c.z, 0.55);
        let hasFloor = false;
        for (let k = 0; k < near.length; k++) {
          const b = near[k];
          if (b && b.isFloor && b.maxY >= -1.25 && b.minY <= -0.7) {
            hasFloor = true;
            break;
          }
        }
        if (!hasFloor) continue;
      }
      E.gatherNearbyColliders(c.x, c.z, 1.5, spatialGrid, tc);
      if (isValidSpawnPoint(c.x, c.y, c.z, playerPos, 64)) {
        pools.alley.push(c);
      }
    }
  }

  function pickRoamerVariant(zoneKey, slotIdxInZone, zoneTotal, tier, stationIdx) {
    const key = tier.key;
    const s = stationIdx % 6;
    if (s === 0) {
      if (key === 'easy') return 'walker';
      const runnerChance = key === 'medium' ? 0.10 : 0.22;
      return Math.random() < (1.0 - runnerChance) ? 'walker' : 'runner';
    }
    const allowScreamer = (key !== 'easy') || (s === 5);

    if (zoneKey === 'jpo') {
      if (slotIdxInZone === 0) return 'spitter';
      return Math.random() < 0.55 ? 'spitter' : 'walker';
    }

    if (key === 'nightmare' && (zoneKey === 'blvd' || zoneKey === 'alley')) {
      if (slotIdxInZone === 0) return 'screamer';
      if (slotIdxInZone === 1 && zoneTotal >= 2) return Math.random() < 0.55 ? 'runner' : 'brute';
    }

    const mix = VARIANT_MIX_RATIOS[key] || VARIANT_MIX_RATIOS.medium;
    const r = Math.random();
    let acc = mix.walker;
    if (r < acc) return 'walker';
    acc += mix.runner;
    if (r < acc) return 'runner';
    acc += mix.spitter;
    if (r < acc) return 'spitter';
    acc += mix.brute;
    if (r < acc) return 'brute';
    return allowScreamer ? 'screamer' : 'walker';
  }

  function spawnRoamers(stationIdx, diffKey, navGraph) {
    if (!E.initialized) return 0;
    if (diffKey) setDifficulty(diffKey);
    if (stationIdx !== undefined && stationIdx !== null) {
      _stationIndex = Math.max(0, stationIdx | 0);
    }
    const tier = getDifficultyTier();

    // Clear any existing roamers cleanly so repeated calls are idempotent
    let deactivationDirty = false;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (z.active && z.isRoamer) {
        z.active = false;
        z.dead = false;
        z.isRoamer = false;
        E.zeroZombieMatrices(i);
        deactivationDirty = true;
      }
    }
    if (deactivationDirty) E.flushMeshMatrices();

    const graph = navGraph || (LRT.Station && typeof LRT.Station.getNavGraph === 'function' ? LRT.Station.getNavGraph() : null);
    const grid = LRT.Station && typeof LRT.Station.getSpatialGrid === 'function' ? LRT.Station.getSpatialGrid() : null;
    const tc = LRT.Train && typeof LRT.Train.getColliders === 'function' ? LRT.Train.getColliders() : null;
    const playerPos = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' && LRT.PlayerUI.getState().pos) || null;

    const pools = {
      station: [],
      jpo: [],
      plaza: [],
      blvd: [],
      alley: []
    };

    if (graph && Array.isArray(graph.nodes)) {
      for (let i = 0; i < graph.nodes.length; i++) {
        categorizeAnchorNode(graph.nodes[i], pools);
      }
    }
    if (LRT.Station && typeof LRT.Station.getSpawnNodes === 'function') {
      const sn = LRT.Station.getSpawnNodes();
      if (Array.isArray(sn)) {
        for (let i = 0; i < sn.length; i++) categorizeAnchorNode(sn[i], pools);
      }
    }
    if (LRT.City && typeof LRT.City.getSpawnNodes === 'function') {
      const cn = LRT.City.getSpawnNodes();
      if (Array.isArray(cn)) {
        for (let i = 0; i < cn.length; i++) categorizeAnchorNode(cn[i], pools);
      }
    }
    if (pools.alley.length < 4 && (grid || pools.blvd.length > 0)) {
      appendCollectorAndAlleyAnchors(pools, grid, tc, playerPos);
    }

    // Shuffle each pool cleanly
    const zoneOrder = ['station', 'jpo', 'plaza', 'blvd', 'alley'];
    for (let zIdx = 0; zIdx < zoneOrder.length; zIdx++) {
      const arr = pools[zoneOrder[zIdx]];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
    }

    const qTier = getQualityTier();
    const totalRoamers = Math.min(MAX_ENEMIES, tier.roamCountBase || 10, qTier.maxEnemies || MAX_ENEMIES);
    const weights = ROAM_ZONE_WEIGHTS[tier.key] || ROAM_ZONE_WEIGHTS.medium;
    const zoneCounts = allocateCountsByWeights(totalRoamers, weights);

    let spawned = 0;
    const cursors = [0, 0, 0, 0, 0];

    for (let zIdx = 0; zIdx < zoneOrder.length; zIdx++) {
      const zKey = zoneOrder[zIdx];
      const count = zoneCounts[zIdx];
      for (let k = 0; k < count; k++) {
        let chosen = null;
        // Prefer assigned zone pool; gracefully fall back to populated street/station pools if empty
        const fallbackOrder = [zIdx, 3, 2, 4, 0, 1];
        for (let f = 0; f < fallbackOrder.length && !chosen; f++) {
          const pIdx = fallbackOrder[f];
          const pool = pools[zoneOrder[pIdx]];
          if (!pool || pool.length === 0) continue;
          for (let attempt = 0; attempt < pool.length; attempt++) {
            const cand = pool[(cursors[pIdx] + attempt) % pool.length];
            const px = cand.x + (Math.random() - 0.5) * 0.8;
            const py = cand.y !== undefined ? cand.y : 0.0;
            const pz = cand.z + (Math.random() - 0.5) * 0.8;
            E.gatherNearbyColliders(px, pz, 1.5, grid, tc);
            const minDistSq = zKey === 'station' ? 144 : 49;
            if (isValidSpawnPoint(px, py, pz, playerPos, minDistSq)) {
              cursors[pIdx] = (cursors[pIdx] + attempt + 1) % pool.length;
              chosen = { x: px, y: py, z: pz };
              break;
            }
          }
        }
        if (!chosen) {
          chosen = pickNextNode(playerPos);
        }

        const variant = pickRoamerVariant(zKey, k, count, tier, _stationIndex);
        const initState = tier.key === 'easy'
          ? 'IDLE'
          : (Math.random() < 0.30 ? 'IDLE' : 'PATROL');

        if (spawnOneZombie(variant, chosen, {
          isRoamer: true,
          aggroState: initState,
          navGraph: graph
        })) {
          spawned++;
        }
      }
    }

    E.markColorsDirty();
    return spawned;
  }

  function handleZombieDeath(z, hitDir, onDropPickup) {
    if (z.dead) return;
    z.dead = true;
    z.deathTimer = 0;
    z.fallAngle = 0;
    z.bloodPoolSpawned = false;
    z.neckSpurtCount = 0;
    _totalKills++;
    E.setHeadEyeDead(z.id);

    // Fall direction follows bullet momentum relative to zombie facing
    if (hitDir) {
      const fwdX = Math.sin(z.yaw);
      const fwdZ = Math.cos(z.yaw);
      const fwdDot = hitDir.x * fwdX + hitDir.z * fwdZ;
      const isLegFall = z.hitZone === 'legs' || z.hitZone === 'leftLeg' || z.hitZone === 'rightLeg';
      z.fallPitchSign = (isLegFall || fwdDot > 0.15) ? 1 : -1;
      z.vx += hitDir.x * 2.2;
      z.vz += hitDir.z * 2.2;
      const deadSpd = Math.hypot(z.vx, z.vz);
      if (deadSpd > 6.8) {
        const sc = 6.8 / deadSpd;
        z.vx *= sc;
        z.vz *= sc;
      }
    } else {
      z.fallPitchSign = Math.random() > 0.5 ? -1 : 1;
    }

    _v1.set(z.x, z.y + 1.1, z.z);
    E.play3D('zombie_death', _v1, 0.14, 0.95);

    if (z.decapitated) {
      _v1.set(z.x, z.y + 1.52 * z.scale, z.z);
      if (LRT.Weapons && typeof LRT.Weapons.spawnGoreBurst === 'function') {
        LRT.Weapons.spawnGoreBurst(_v1, hitDir, 26);
      } else if (LRT.Weapons && typeof LRT.Weapons.spawnBlood === 'function') {
        LRT.Weapons.spawnBlood(_v1, hitDir, 24);
      }
      E.play3D('headshot_crit', _v1, 0.06, 0.9);
    }

    if (z.variant === 'spitter') {
      _v1.set(z.x, z.y + 1.1, z.z);
      const cfg = E.getEnemyCfg('spitter');
      if (LRT.Weapons && typeof LRT.Weapons.applyExplosion === 'function') {
        LRT.Weapons.applyExplosion(_v1, cfg.deathBlastRadius || 3.6, cfg.deathBlastDmg || 32, 9.0, true);
      }
      if (typeof E.spawnBilePuddle === 'function') {
        E.spawnBilePuddle(z.x, z.y, z.z, 1.55, z.y);
      }
    }

    if (typeof onDropPickup === 'function') {
      const dropType = getDropRoll(z.variant);
      if (dropType) {
        const tier = getDifficultyTier();
        onDropPickup({ x: z.x, y: z.y + 0.35, z: z.z }, dropType, {
          variant: z.variant,
          ammoMult: tier.pickupAmmoMult,
          healMult: tier.healMult,
          luckFactor: Math.min(1.0, 0.35 + 0.10 * _stationIndex)
        });
      }
    }
  }

  function applyDamageToZombie(z, dmg, hitPoint, hitDir, knockbackForce, isHeadshot, onDropPickup, hitZone, dismemberOpt) {
    if (!z || !z.active || z.dead) return { hit: false, killed: false, armored: false, hitZone: 'torso', legCrippledNow: false };

    const zone = hitZone || (isHeadshot ? 'head' : 'torso');
    const isHead = zone === 'head' || !!isHeadshot;
    const isLegZone = zone === 'legs' || zone === 'leftLeg' || zone === 'rightLeg';
    const isArmZone = zone === 'leftArm' || zone === 'rightArm';
    const rawDism = (dismemberOpt && typeof dismemberOpt === 'object') ? dismemberOpt.dismemberMult : dismemberOpt;
    const dMult = (typeof rawDism === 'number' && rawDism > 0) ? rawDism : ((knockbackForce || 0) >= 5.0 ? 1.8 : 1.0);
    let finalDmg = dmg;
    let armoredHit = false;
    let legCrippledNow = false;

    if (zone === 'torso') {
      finalDmg = Math.max(1, Math.round(dmg * 0.90));
    } else if (isArmZone) {
      finalDmg = Math.max(1, Math.round(dmg * 0.78));
    } else if (isLegZone) {
      finalDmg = Math.max(1, Math.round(dmg * 0.60));
    }

    if (z.hornVulnTimer > 0 && (z.variant === 'spitter' || z.variant === 'screamer')) {
      finalDmg = Math.round(finalDmg * 1.45);
    }

    if (z.variant === 'brute' && z.hasArmor) {
      if (!isHead) {
        armoredHit = true;
        finalDmg = Math.max(1, Math.round(dmg * 0.5));
        z.armorHp -= dmg;
        _v1.set(hitPoint ? hitPoint.x : z.x, hitPoint ? hitPoint.y : (z.y + 1.25), hitPoint ? hitPoint.z : z.z);
        if (LRT.Weapons && typeof LRT.Weapons.spawnSparks === 'function') {
          LRT.Weapons.spawnSparks(_v1, 10);
        }
        E.play3D('impact_metal', _v1, 0.12, 0.55);
      } else {
        z.armorHp -= dmg * 1.35;
      }
      if (z.armorHp <= 0) {
        z.hasArmor = false;
        _v2.set(z.x, z.y + 1.25, z.z);
        if (LRT.Weapons) {
          if (typeof LRT.Weapons.spawnSparks === 'function') LRT.Weapons.spawnSparks(_v2, 14);
          if (typeof LRT.Weapons.spawnRubble === 'function') LRT.Weapons.spawnRubble(_v2, 6);
        }
        E.play3D('debris_crumble', _v2, 0.1, 0.9);
      }
    }

    z.hitZone = zone;
    let hitLat = 0;
    if (hitPoint) {
      const lxVec = Math.cos(z.yaw);
      const lzVec = -Math.sin(z.yaw);
      hitLat = (hitPoint.x - z.x) * lxVec + (hitPoint.z - z.z) * lzVec;
    }
    if (hitDir) {
      const rightX = Math.cos(z.yaw);
      const rightZ = -Math.sin(z.yaw);
      z.hitSide = Math.max(-1, Math.min(1, hitDir.x * rightX + hitDir.z * rightZ));
    } else {
      z.hitSide = 0;
    }

    if (isHead && !armoredHit) {
      z.headDmg = (z.headDmg || 0) + finalDmg;
    }

    const dismOn = !(I.core && I.core.dismembermentEnabled === false);
    let armSeveredNow = false;
    let legSeveredNow = false;
    if (!armoredHit) {
      if (zone === 'torso') {
        z.woundMask = (z.woundMask || 0) | (((z.woundMask || 0) & 1) ? 2 : 1);
      } else if (zone === 'leftArm') {
        z.woundMask = (z.woundMask || 0) | 4;
        z.armLDmg = (z.armLDmg || 0) + finalDmg * dMult;
        if (dismOn && !z.lostLeftArm && (z.armLDmg >= 44 || (finalDmg * dMult >= 46) || ((knockbackForce || 0) >= 5.0 && dMult >= 1.5))) {
          z.lostLeftArm = true;
          armSeveredNow = true;
        }
      } else if (zone === 'rightArm') {
        z.woundMask = (z.woundMask || 0) | 8;
        z.armRDmg = (z.armRDmg || 0) + finalDmg * dMult;
        if (dismOn && !z.lostRightArm && (z.armRDmg >= 44 || (finalDmg * dMult >= 46) || ((knockbackForce || 0) >= 5.0 && dMult >= 1.5))) {
          z.lostRightArm = true;
          armSeveredNow = true;
        }
      } else if (isLegZone) {
        const legSide = zone === 'leftLeg' ? 1 : (zone === 'rightLeg' ? -1 : (hitLat !== 0 ? (hitLat >= 0 ? 1 : -1) : (z.limbBias || 1)));
        z.woundMask = (z.woundMask || 0) | (legSide >= 0 ? 16 : 32);
        const legBurst = finalDmg * dMult;
        if (legSide >= 0) z.legLDmg = (z.legLDmg || 0) + legBurst;
        else z.legRDmg = (z.legRDmg || 0) + legBurst;
        z.legDmg = (z.legDmg || 0) + finalDmg;
        if (!z.legCrippled && (z.legDmg >= 22 || finalDmg >= 24)) {
          z.legCrippled = true;
          z.crippledLeg = legSide;
          legCrippledNow = true;
          const baseSpd = z.baseSpeed || z.speed;
          if (!z.crawling) z.speed = baseSpd * 0.48;
        }
        const sideCumDmg = legSide >= 0 ? z.legLDmg : z.legRDmg;
        const canSeverLeg = dismOn && ((sideCumDmg >= 48) || (legBurst >= 46) || ((knockbackForce || 0) >= 5.0 && dMult >= 1.5));
        if (canSeverLeg) {
          if (legSide >= 0 && !z.lostLeftLeg) {
            z.lostLeftLeg = true;
            legSeveredNow = true;
          } else if (legSide < 0 && !z.lostRightLeg) {
            z.lostRightLeg = true;
            legSeveredNow = true;
          }
          if (legSeveredNow && !z.crawling) {
            z.crawling = true;
            z.crawlFallTimer = 0;
            z.crawlPhase = 0;
            z.crawlBloodDist = 0;
            const baseSpd = z.baseSpeed || z.speed;
            z.speed = baseSpd * (z.variant === 'runner' ? 0.36 : 0.46);
            z.chargeWindup = 0;
            z.chargeTimer = 0;
          }
        }
      }
    }

    if (armSeveredNow || legSeveredNow) {
      const sPt = hitPoint || _v1.set(z.x, z.y + (legSeveredNow ? 0.48 : 1.15) * z.scale, z.z);
      if (LRT.Weapons && typeof LRT.Weapons.spawnGoreBurst === 'function') {
        LRT.Weapons.spawnGoreBurst(sPt, hitDir, legSeveredNow ? 22 : 18);
      } else if (LRT.Weapons && typeof LRT.Weapons.spawnBlood === 'function') {
        LRT.Weapons.spawnBlood(sPt, hitDir, 18);
      }
      if (legSeveredNow && LRT.Weapons && typeof LRT.Weapons.spawnBloodDecal === 'function') {
        _v2.set(z.x, z.y + 0.022, z.z);
        _v3.set(0, 1, 0);
        LRT.Weapons.spawnBloodDecal(_v2, _v3, 0.72, false);
      }
      E.play3D('debris_crumble', sPt, 0.12, 0.75);
    }

    z.hp -= finalDmg;
    z.hitFlashTimer = 0.085;

    // Taking damage immediately alerts passive roamers into CHASE
    if (z.aggroState !== 'CHASE') {
      z.aggroState = 'CHASE';
      z.alertDelay = 0;
      z.chaseLoseTimer = 0;
      z.navTimer = 0;
      const ps = LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' ? LRT.PlayerUI.getState() : null;
      if (ps && ps.pos) {
        z.lastKnownX = ps.pos.x;
        z.lastKnownY = ps.pos.y;
        z.lastKnownZ = ps.pos.z;
      }
    }

    const kb = Math.min(7.5, (knockbackForce || 1.5) / (z.variant === 'brute' ? 2.6 : 1.0));
    if (hitDir && Number.isFinite(hitDir.x) && Number.isFinite(hitDir.z)) {
      z.vx += hitDir.x * kb;
      z.vz += hitDir.z * kb;
      const totSpd = Math.hypot(z.vx, z.vz);
      const maxKbSpd = z.variant === 'brute' ? 5.2 : 7.8;
      if (totSpd > maxKbSpd) {
        const sc = maxKbSpd / totSpd;
        z.vx *= sc;
        z.vz *= sc;
      }
    }
    let minStagger = Math.min(0.45, 0.12 + kb * 0.05);
    if (isHead) minStagger = Math.max(minStagger, 0.32);
    if (legCrippledNow || armSeveredNow || legSeveredNow) minStagger = Math.max(minStagger, 0.45);
    z.staggerTimer = Math.max(z.staggerTimer, minStagger);

    E.applyZombieColors(z);
    E.markColorsDirty();

    if (z.hp <= 0) {
      const headSever = isHead && (dMult >= 1.35 || (knockbackForce || 0) >= 4.2 || finalDmg >= 65 || (z.headDmg || 0) >= 55);
      z.decapitated = !!(dismOn && (headSever || ((knockbackForce || 0) >= 5.0 && (z.headDmg || 0) >= 28)))
        && !(z.variant === 'brute' && z.hasArmor);
      handleZombieDeath(z, hitDir, onDropPickup);
      return { hit: true, killed: true, armored: armoredHit, hitZone: zone, legCrippledNow, armSeveredNow, legSeveredNow };
    }
    return { hit: true, killed: false, armored: armoredHit, hitZone: zone, legCrippledNow, armSeveredNow, legSeveredNow };
  }

  function hitZombie(zombieId, dmg, hitPoint, hitDir, knockbackForce, isHeadshot, hitZone, dismemberOpt) {
    const z = E.zombies[zombieId];
    return applyDamageToZombie(z, dmg, hitPoint, hitDir, knockbackForce, isHeadshot, _cachedOnDropPickup, hitZone, dismemberOpt);
  }

  function applyBlast(origin, radius, maxDmg, force) {
    if (!origin) return;
    const rad = radius || 6.5;
    const dmgMax = maxDmg || 280;
    const imp = force || 18.0;

    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      const dx = z.x - origin.x;
      const dy = (z.y + 0.9 * z.scale) - origin.y;
      const dz = z.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist >= rad) continue;

      const falloff = Math.max(0.15, 1.0 - dist / rad);
      const d = Math.round(dmgMax * falloff);

      if (z.variant === 'brute' && z.hasArmor) {
        z.armorHp -= d * 1.8;
      }

      if (dist > 0.05) {
        _v3.set(dx / dist, Math.max(0.25, dy / dist), dz / dist).normalize();
      } else {
        _v3.set(0, 1, 0);
      }

      const res = applyDamageToZombie(z, d, origin, _v3, imp * falloff, false, _cachedOnDropPickup);
      if (res.hit && LRT.Weapons && typeof LRT.Weapons.spawnBlood === 'function') {
        _v4.set(z.x, z.y + 1.0 * z.scale, z.z);
        LRT.Weapons.spawnBlood(_v4, _v3, 8);
      }
    }
  }

  function raycastHit(origin, dir, maxDist) {
    _rayOrig.set(origin.x, origin.y, origin.z);
    _rayDir.set(dir.x, dir.y, dir.z).normalize();
    let best = null;
    let bestDist = maxDist !== undefined ? maxDist : 200;

    function testCapsule(z, sc, hipDrop, ax, ay, az, bx, by, bz, radius, zoneMode) {
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const cCoef = ux * ux + uy * uy + uz * uz;
      const w0x = _rayOrig.x - ax;
      const w0y = _rayOrig.y - ay;
      const w0z = _rayOrig.z - az;
      const bCoef = _rayDir.x * ux + _rayDir.y * uy + _rayDir.z * uz;
      const dCoef = _rayDir.x * w0x + _rayDir.y * w0y + _rayDir.z * w0z;
      const eCoef = ux * w0x + uy * w0y + uz * w0z;
      const denom = cCoef - bCoef * bCoef;

      let tNear, uNorm;
      if (denom < 1e-5) {
        uNorm = Math.max(0, Math.min(1, eCoef / Math.max(1e-5, cCoef)));
        tNear = Math.max(0, -dCoef + bCoef * uNorm);
      } else {
        tNear = Math.max(0, (bCoef * eCoef - cCoef * dCoef) / denom);
        uNorm = (bCoef * tNear + eCoef) / Math.max(1e-5, cCoef);
        if (uNorm < 0) { uNorm = 0; tNear = Math.max(0, -dCoef); }
        else if (uNorm > 1) { uNorm = 1; tNear = Math.max(0, bCoef - dCoef); }
      }

      const qx = ax + ux * uNorm;
      const qy = ay + uy * uNorm;
      const qz = az + uz * uNorm;
      const rx = _rayOrig.x + _rayDir.x * tNear - qx;
      const ry = _rayOrig.y + _rayDir.y * tNear - qy;
      const rz = _rayOrig.z + _rayDir.z * tNear - qz;
      const distSq = rx * rx + ry * ry + rz * rz;
      if (distSq > radius * radius) return;

      const entryOffset = Math.sqrt(Math.max(0, radius * radius - distSq));
      if (tNear + entryOffset < 0) return;
      const tHit = Math.max(0, tNear - entryOffset);
      if (tHit >= bestDist) return;

      bestDist = tHit;
      const px = _rayOrig.x + _rayDir.x * tHit;
      const py = _rayOrig.y + _rayDir.y * tHit;
      const pz = _rayOrig.z + _rayDir.z * tHit;
      const lat = (px - qx) * Math.cos(z.yaw) + (pz - qz) * (-Math.sin(z.yaw));
      const armLat = (z.variant === 'brute' ? 0.21 : 0.16) * sc;

      let hitZone = 'torso';
      let subZone = 'torso';
      if (zoneMode === 'lower') {
        subZone = lat >= 0 ? 'leftLeg' : 'rightLeg';
        hitZone = Math.abs(lat) < 0.055 * sc ? 'legs' : subZone;
      } else if (zoneMode === 'upper') {
        if (uNorm >= 0.35 && lat >= armLat) hitZone = 'leftArm';
        else if (uNorm >= 0.35 && lat <= -armLat) hitZone = 'rightArm';
        subZone = hitZone;
      } else {
        const sNear = uNorm * Math.sqrt(Math.max(1e-6, cCoef));
        const hipSplit = Math.max(0.25 * sc, 0.60 * sc - hipDrop * 0.5);
        if (sNear < hipSplit) {
          subZone = lat >= 0 ? 'leftLeg' : 'rightLeg';
          hitZone = Math.abs(lat) < 0.055 * sc ? 'legs' : subZone;
        } else {
          if (sNear >= hipSplit + 0.10 * sc && lat >= armLat) hitZone = 'leftArm';
          else if (sNear >= hipSplit + 0.10 * sc && lat <= -armLat) hitZone = 'rightArm';
          subZone = hitZone;
        }
      }

      _v1.set(px - qx, py - qy, pz - qz);
      if (_v1.lengthSq() > 1e-6) _v1.normalize();
      else _v1.set(0, 1, 0);

      best = {
        dist: tHit,
        point: new THREE.Vector3(px, py, pz),
        normal: _v1.clone(),
        zombieId: z.id,
        variant: z.variant,
        isHeadshot: false,
        hitZone: hitZone,
        subZone: subZone,
        isArmor: z.variant === 'brute' && z.hasArmor && (hitZone === 'torso' || hitZone === 'leftArm' || hitZone === 'rightArm')
      };
    }

    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      const sc = z.scale;
      const hipDrop = z.legCrippled ? 0.14 * sc : 0;
      const fwdX = Math.sin(z.yaw || 0);
      const fwdZ = Math.cos(z.yaw || 0);

      let hx, hy, hz, hr;
      let hasCrawlerAnchors = false;
      if (z.crawling && typeof E.getZombieCrawlerAnchors === 'function') {
        // Coarse sphere check before querying live bone world transforms
        const cx = z.x + fwdX * 0.35 * sc;
        const cy = z.y + 0.45 * sc;
        const cz = z.z + fwdZ * 0.35 * sc;
        const dxC = cx - _rayOrig.x;
        const dyC = cy - _rayOrig.y;
        const dzC = cz - _rayOrig.z;
        const proj = Math.max(0, dxC * _rayDir.x + dyC * _rayDir.y + dzC * _rayDir.z);
        const ex = dxC - _rayDir.x * proj;
        const ey = dyC - _rayDir.y * proj;
        const ez = dzC - _rayDir.z * proj;
        const maxCoarseR = 2.1 * sc;
        if (proj - maxCoarseR > bestDist || (ex * ex + ey * ey + ez * ez) > maxCoarseR * maxCoarseR) {
          continue;
        }
        hasCrawlerAnchors = E.getZombieCrawlerAnchors(z, _crawlHead, _crawlChest, _crawlHips, _crawlFeet);
      }

      if (hasCrawlerAnchors) {
        hx = _crawlHead.x;
        hy = _crawlHead.y;
        hz = _crawlHead.z;
        hr = 0.29 * sc;
      } else {
        const leanFwd = z.crawling ? (0.95 * sc) : ((z.variant === 'runner' || z.variant === 'screamer') ? 0.26 * sc : 0.12 * sc);
        hx = z.x + fwdX * leanFwd;
        hy = z.y + (z.crawling ? (0.38 * sc) : ((z.variant === 'runner' ? 1.42 : (z.variant === 'screamer' ? 1.46 : 1.56)) * sc - hipDrop));
        hz = z.z + fwdZ * leanFwd;
        hr = (z.crawling ? 0.29 : 0.24) * sc;
      }

      // 1. Head sphere test (supports point-blank / steep downward ray origins inside sphere)
      const ocx = _rayOrig.x - hx;
      const ocy = _rayOrig.y - hy;
      const ocz = _rayOrig.z - hz;
      const hb = ocx * _rayDir.x + ocy * _rayDir.y + ocz * _rayDir.z;
      const hc = ocx * ocx + ocy * ocy + ocz * ocz - hr * hr;
      const hDisc = hb * hb - hc;
      if (hDisc >= 0) {
        const sqrtD = Math.sqrt(hDisc);
        const tExit = -hb + sqrtD;
        if (tExit >= 0) {
          const t = Math.max(0, -hb - sqrtD);
          if (t < bestDist) {
            bestDist = t;
            const px = _rayOrig.x + _rayDir.x * t;
            const py = _rayOrig.y + _rayDir.y * t;
            const pz = _rayOrig.z + _rayDir.z * t;
            best = {
              dist: t,
              point: new THREE.Vector3(px, py, pz),
              normal: new THREE.Vector3((px - hx) / hr, (py - hy) / hr, (pz - hz) / hr),
              zombieId: z.id,
              variant: z.variant,
              isHeadshot: true,
              hitZone: 'head',
              isArmor: false
            };
          }
        }
      }

      // 2. Body/Limb capsule test(s)
      if (z.crawling) {
        const trUpper = (z.variant === 'brute' ? 0.45 : 0.39) * sc;
        const trLower = ((z.lostLeftLeg && z.lostRightLeg) ? 0.29 : 0.33) * sc;
        if (hasCrawlerAnchors) {
          testCapsule(z, sc, hipDrop, _crawlHips.x, _crawlHips.y, _crawlHips.z, _crawlChest.x, _crawlChest.y, _crawlChest.z, trUpper, 'upper');
          testCapsule(z, sc, hipDrop, _crawlFeet.x, _crawlFeet.y, _crawlFeet.z, _crawlHips.x, _crawlHips.y, _crawlHips.z, trLower, 'lower');
        } else {
          testCapsule(
            z, sc, hipDrop,
            z.x + fwdX * 0.25 * sc, z.y + 0.24 * sc, z.z + fwdZ * 0.25 * sc,
            z.x + fwdX * 0.85 * sc, z.y + 0.30 * sc, z.z + fwdZ * 0.85 * sc,
            trUpper, 'upper'
          );
          testCapsule(
            z, sc, hipDrop,
            z.x - fwdX * 0.40 * sc, z.y + 0.16 * sc, z.z - fwdZ * 0.40 * sc,
            z.x + fwdX * 0.25 * sc, z.y + 0.24 * sc, z.z + fwdZ * 0.25 * sc,
            trLower, 'lower'
          );
        }
      } else {
        const tr = (z.variant === 'brute' ? 0.44 : 0.36) * sc;
        testCapsule(z, sc, hipDrop, z.x, z.y + 0.18 * sc, z.z, z.x, z.y + 1.38 * sc - hipDrop, z.z, tr, 'standing');
      }
    }

    return best;
  }

  function hasLineOfSightToPlayer(z, playerPos) {
    const eyeY = z.y + (z.crawling ? 0.45 : 1.48) * z.scale;
    const pEyeY = (playerPos.y || 0) + 1.50;
    _losOrig.set(z.x, eyeY, z.z);
    _losDir.set(playerPos.x - z.x, pEyeY - eyeY, playerPos.z - z.z);
    const d = _losDir.length();
    if (d <= 0.5) return true;
    _losDir.divideScalar(d);
    const checkDist = Math.max(0.1, d - 0.45);
    if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
      const hit = LRT.Station.raycastWorld(_losOrig, _losDir, checkDist);
      if (hit) return false;
    }
    if (LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
      const thit = LRT.Train.raycastTrain(_losOrig, _losDir, checkDist);
      if (thit && !thit.isGlass && thit.material !== 'glass' && thit.type !== 'glass') return false;
    }
    return true;
  }

  function evaluatePerception(z, playerPos, pdx, pdy, pdz, distHoriz, dist3D, tier, isDaylight, flashlightOn) {
    const mode = tier.perceptionMode;
    const daylightOutbreak = isDaylightOutbreak();
    const mods = daylightOutbreak ? getDaylightMods() : null;
    const sightMult = mods ? (mods.sightRangeMult || 1.40) : 1.0;

    if (daylightOutbreak && (z.variant === 'screamer' || z.variant === 'spitter')) {
      if (dist3D <= 32.0 * sightMult && hasLineOfSightToPlayer(z, playerPos)) {
        return true;
      }
    }

    if (mode === 'RADIAL_SHORT') {
      if (dist3D > tier.proxRadius * sightMult) return false;
      return Math.abs(pdy) <= 2.5 || distHoriz <= 12.0 * sightMult;
    }

    if (mode === 'RADIAL_MEDIUM') {
      const onOpenStreet = z.y < -0.35 || Math.abs(z.x) > 22.0;
      const effRad = (onOpenStreet ? 20.0 : tier.proxRadius) * sightMult;
      if (dist3D > effRad) return false;
      return Math.abs(pdy) <= 4.8 || hasLineOfSightToPlayer(z, playerPos);
    }

    // FOV_CONE_LOS (hard) & FOV_CONE_SOUND (nightmare)
    if (dist3D <= tier.proxRadius * sightMult && (Math.abs(pdy) <= 4.8 || hasLineOfSightToPlayer(z, playerPos))) {
      return true;
    }

    let effFovRange = tier.fovRange * sightMult;
    if (!isDaylight && !daylightOutbreak) {
      effFovRange *= flashlightOn ? 1.15 : 0.78;
    }
    if (dist3D > effFovRange) return false;

    let effCosHalfFov = tier.cosHalfFov;
    if (mods && tier.fovDeg > 0) {
      const boostedDeg = tier.fovDeg + (mods.fovDegBoost || 35);
      effCosHalfFov = boostedDeg >= 358 ? -1.0 : Math.cos((boostedDeg * 0.5 * Math.PI) / 180);
    }

    if (distHoriz > 0.05) {
      const fwdX = Math.sin(z.yaw);
      const fwdZ = Math.cos(z.yaw);
      const dotXZ = (pdx * fwdX + pdz * fwdZ) / distHoriz;
      if (dotXZ < effCosHalfFov) return false;
    }
    return hasLineOfSightToPlayer(z, playerPos);
  }

  function rotateYawToward(z, targetYaw, rate, dt) {
    let diffYaw = targetYaw - z.yaw;
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
    z.yaw += diffYaw * Math.min(1, dt * rate);
  }

  function steerAndMove(z, idx, goalX, goalZ, moveSpd, moveStep, isBackpedaling, dist3D, distHoriz, pdx, pdz, directLine) {
    const tier = getDifficultyTier();
    let baseAng = Math.atan2(goalX - z.x, goalZ - z.z);
    if (z.chargeTimer > 0) {
      baseAng = Math.atan2(z.chargeDirX, z.chargeDirZ);
      z.yaw = baseAng;
    } else if (isBackpedaling) {
      baseAng = z._backpedalAng;
      rotateYawToward(z, Math.atan2(pdx, pdz), tier.yawRate * 1.25, moveStep);
    } else if (z.aggroState === 'CHASE' && !directLine) {
      if (z.variant === 'walker') {
        if (dist3D >= 3.2) {
          baseAng += Math.sin(z.animPhase * 0.7 + z.seed) * 0.04 * z.limbBias;
        }
      } else if (z.variant === 'runner' && distHoriz > 5.0 && !z.hasNavWp) {
        const flankOffset = z.steerDir * Math.min(tier.runnerFlankAngle, 1.4 / distHoriz);
        baseAng += flankOffset;
      }
    }

    const rad = 0.38 * z.scale;
    let chosenAng = baseAng;
    let foundClear = false;

    if (z.chargeTimer > 0) {
      const cpx = z.x + z.chargeDirX * 0.75;
      const cpz = z.z + z.chargeDirZ * 0.75;
      if (E.isBlockedAt(cpx, z.y, cpz, 0.46 * z.scale)) {
        z.chargeTimer = 0;
        z.staggerTimer = 0.7;
        _v1.set(cpx, z.y + 1.25, cpz);
        E.play3D('impact_metal', _v1, 0.1, 0.85);
        if (LRT.Weapons && typeof LRT.Weapons.spawnSparks === 'function') LRT.Weapons.spawnSparks(_v1, 14);
        if (LRT.Weapons && typeof LRT.Weapons.spawnRubble === 'function') LRT.Weapons.spawnRubble(_v1, 8);
        moveSpd = 0;
      } else {
        chosenAng = baseAng;
        foundClear = true;
      }
    } else if (isBackpedaling) {
      chosenAng = baseAng;
      foundClear = true;
      moveSpd = z.speed * 0.95;
    } else {
      let tryCount;
      let tryList;
      if (z.steerCommit > 0) {
        _tryAngles3[0] = baseAng + z.steerDir * 0.45;
        _tryAngles3[1] = baseAng + z.steerDir * 0.85;
        _tryAngles3[2] = baseAng;
        tryList = _tryAngles3;
        tryCount = 3;
      } else {
        _tryAngles5[0] = baseAng;
        _tryAngles5[1] = baseAng + 0.35 * z.steerDir;
        _tryAngles5[2] = baseAng - 0.35 * z.steerDir;
        _tryAngles5[3] = baseAng + 0.75 * z.steerDir;
        _tryAngles5[4] = baseAng - 0.75 * z.steerDir;
        tryList = _tryAngles5;
        tryCount = 5;
      }

      for (let a = 0; a < tryCount; a++) {
        const ang = tryList[a];
        const px = z.x + Math.sin(ang) * 0.95;
        const pz = z.z + Math.cos(ang) * 0.95;
        if (!E.isBlockedAt(px, z.y, pz, rad)) {
          chosenAng = ang;
          foundClear = true;
          break;
        }
      }

      if (z.steerCommit > 0) z.steerCommit -= moveStep;
      if (!foundClear) {
        z.blockedTime += moveStep;
        if (z.blockedTime > 0.35) {
          z.steerDir *= -1;
          z.steerCommit = 0.50;
          z.blockedTime = 0;
          z.navTimer = 0;
        }
        moveSpd *= 0.4;
      } else if (chosenAng !== baseAng) {
        z.steerCommit = 0.22;
      }
    }

    _sepVel.x = Math.sin(chosenAng) * moveSpd;
    _sepVel.z = Math.cos(chosenAng) * moveSpd;
    E.applyZombieSeparation(z, idx, E.zombies, E.activeHighWater, _sepVel);

    // Blend steering velocity smoothly and rotate facing along actual velocity (eliminates sideways crab-walking)
    const steerBlend = Math.min(1.0, moveStep * (z.chargeTimer > 0 || directLine ? 14.0 : 9.0));
    z.smoothSteerX += (_sepVel.x - z.smoothSteerX) * steerBlend;
    z.smoothSteerZ += (_sepVel.z - z.smoothSteerZ) * steerBlend;

    z.x += z.smoothSteerX * moveStep;
    z.z += z.smoothSteerZ * moveStep;

    if (z.chargeTimer <= 0 && !isBackpedaling) {
      const steerMag = Math.hypot(z.smoothSteerX, z.smoothSteerZ);
      if (steerMag > 0.15) {
        const moveAng = Math.atan2(z.smoothSteerX, z.smoothSteerZ);
        const yawMult = z.aggroState === 'PATROL' ? 0.72 : 1.05;
        rotateYawToward(z, moveAng, tier.yawRate * yawMult, moveStep);
      }
    }
  }

  function stepDeadZombie(z, step, spatialGrid, tc) {
    z.deathTimer += step;
    z.actualSpeed = 0;
    z.actualSpeedSmooth = 0;
    z.moveBlend = 0;
    if (!Number.isFinite(z.vx)) z.vx = 0;
    if (!Number.isFinite(z.vz)) z.vz = 0;
    let dxStep = z.vx * step;
    let dzStep = z.vz * step;
    const stepLen = Math.hypot(dxStep, dzStep);
    if (stepLen > 0.38) {
      const cl = 0.38 / stepLen;
      dxStep *= cl;
      dzStep *= cl;
    }
    z.x += dxStep;
    z.z += dzStep;
    const damp = Math.max(0, 1 - step * 6.5);
    z.vx *= damp;
    z.vz *= damp;

    if ((z.deathTimer < 0.65 || stepLen > 0.01) && (spatialGrid || tc)
      && typeof E.gatherNearbyColliders === 'function'
      && typeof E.resolveCollisions === 'function') {
      E.gatherNearbyColliders(z.x, z.z, 1.8, spatialGrid, tc);
      E.resolveCollisions(z, 0.35 * z.scale, step);
    }

    const willSpurt = z.decapitated && z.neckSpurtCount < 2 && z.deathTimer >= (z.neckSpurtCount + 1) * 0.14;
    const willPool = z.deathTimer >= 0.32 && !z.bloodPoolSpawned;
    if ((willSpurt || willPool) && typeof E.updateZombieMatrices === 'function') {
      E.updateZombieMatrices(z, _elapsed, 0);
    }

    if (willSpurt) {
      z.neckSpurtCount++;
      if (LRT.Weapons && typeof LRT.Weapons.spawnBlood === 'function' && typeof E.getZombieCorpsePoolPos === 'function') {
        E.getZombieCorpsePoolPos(z, _v1);
        const dirSign = z.fallPitchSign || 1;
        _v3.set(Math.sin(z.yaw || 0) * dirSign * 0.55, 0.65, Math.cos(z.yaw || 0) * dirSign * 0.55);
        LRT.Weapons.spawnBlood(_v1, _v3, 9);
      }
    }

    if (willPool) {
      z.bloodPoolSpawned = true;
      if (LRT.Weapons && typeof LRT.Weapons.spawnBloodDecal === 'function') {
        if (typeof E.getZombieCorpsePoolPos === 'function') {
          E.getZombieCorpsePoolPos(z, _v2);
        } else {
          _v2.set(z.x, z.y, z.z);
        }
        _v2.y = z.y + 0.022;
        _v3.set(0, 1, 0);
        const poolSize = (z.decapitated ? 1.55 : (z.variant === 'brute' ? 1.50 : 1.18)) + Math.random() * 0.22;
        LRT.Weapons.spawnBloodDecal(_v2, _v3, poolSize, true);
      }
    }

    if (z.deathTimer >= 12.0) {
      z.active = false;
      z.dead = false;
      E.zeroZombieMatrices(z.id);
      return true;
    }
    return false;
  }

  function update(dt, playerPos, spatialGrid, trainColliders, onPlayerHit, onDropPickup, opts) {
    if (!E.initialized) return;
    const step = Math.min(dt || 0.016, 0.05);
    _elapsed += step;
    _frameCount++;
    const frameMod = _frameCount & 3;
    _cachedOnDropPickup = onDropPickup || null;

    const tier = getDifficultyTier();
    let hasCamForward = false;

    if (opts && opts.camPos) {
      E.camPos.set(opts.camPos.x, opts.camPos.y, opts.camPos.z);
    }
    if (opts && opts.camForward) {
      E.camForward.set(opts.camForward.x, opts.camForward.y, opts.camForward.z);
      if (E.camForward.lengthSq() > 1e-6) {
        E.camForward.normalize();
        hasCamForward = true;
      }
    }

    const cam = (opts && opts.camera) || ((LRT.PlayerUI && typeof LRT.PlayerUI.getCamera === 'function') ? LRT.PlayerUI.getCamera() : null);
    let flashlightOn = false;
    const ps = (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') ? LRT.PlayerUI.getState() : null;
    if (ps) flashlightOn = !!ps.flashlightOn;
    if (opts && opts.flashlightOn !== undefined) flashlightOn = !!opts.flashlightOn;

    if (cam) {
      if (!(opts && opts.camPos)) cam.getWorldPosition(E.camPos);
      E.camRight.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      if (!hasCamForward) {
        if (typeof cam.getWorldDirection === 'function') {
          cam.getWorldDirection(E.camForward);
        } else {
          E.camForward.setFromMatrixColumn(cam.matrixWorld, 2).multiplyScalar(-1).normalize();
        }
        hasCamForward = true;
      }
    } else if (ps) {
      const pPos = ps.pos || playerPos;
      if (!(opts && opts.camPos) && pPos) E.camPos.set(pPos.x, (pPos.y || 0) + 1.6, pPos.z);
      const yaw = typeof ps.yaw === 'number' ? ps.yaw : 0;
      E.camRight.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
      if (!hasCamForward) {
        E.camForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
        hasCamForward = true;
      }
    } else if (playerPos) {
      if (!(opts && opts.camPos)) E.camPos.set(playerPos.x, (playerPos.y || 0) + 1.6, playerPos.z);
      if (hasCamForward) {
        E.camRight.set(-E.camForward.z, 0, E.camForward.x);
        if (E.camRight.lengthSq() > 1e-6) E.camRight.normalize();
        else E.camRight.set(1, 0, 0);
      } else {
        E.camRight.set(1, 0, 0);
        E.camForward.set(0, 0, -1);
      }
    }

    let isDaylight = true;
    const moodKey = (opts && opts.moodKey)
      || (I.core && I.core.currentLightingKey)
      || (LRT.Station && typeof LRT.Station.getAtmosphere === 'function' && LRT.Station.getAtmosphere().moodKey);
    if (moodKey && LRT.Config && LRT.Config.MOODS && LRT.Config.MOODS[moodKey]) {
      isDaylight = LRT.Config.MOODS[moodKey].isDaylight !== false;
    }

    const qTier = getQualityTier();
    const animThrottleDist = qTier.animThrottleDist || 28.0;
    const cap = Math.min(MAX_ENEMIES, tier.poolCap || MAX_ENEMIES, qTier.maxEnemies || MAX_ENEMIES);
    if (E.pendingQueue.length > 0) {
      let activeCount = 0;
      for (let i = 0; i < MAX_ENEMIES; i++) {
        if (E.zombies[i].active) activeCount++;
      }
      while (E.pendingQueue.length > 0 && activeCount < cap) {
        const nextVar = E.pendingQueue[0];
        const pt = pickNextNode(playerPos);
        if (spawnOneZombie(nextVar, pt, { isRoamer: false, aggroState: 'CHASE' })) {
          E.pendingQueue.shift();
          activeCount++;
        } else {
          break;
        }
      }
    }

    let initHighWater = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (E.zombies[i].active || E.zombies[i].dead) initHighWater = i + 1;
    }
    E.activeHighWater = initHighWater;

    // Count living wave/chasing zombies and closest living zombie for audio cues
    let aliveCount = 0;
    let waveAliveCount = 0;
    let closestZ = null;
    let closestDistSq = Infinity;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      aliveCount++;
      if (!z.isRoamer || z.aggroState === 'CHASE') waveAliveCount++;
      if (playerPos) {
        const dx = z.x - playerPos.x, dy = z.y - (playerPos.y || 0), dz = z.z - playerPos.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          closestZ = z;
        }
      }
    }

    const isStraggler = (waveAliveCount > 0 && waveAliveCount <= 3 && E.pendingQueue.length === 0);
    _groanTimer -= step;
    if (_groanTimer <= 0 && aliveCount > 0) {
      const fewLeft = waveAliveCount > 0 && (waveAliveCount <= 4 || isStraggler);
      _groanTimer = fewLeft ? (1.15 + Math.random() * 0.85) : (1.75 + Math.random() * 1.45);
      let chosen = null;
      if (fewLeft && closestZ) {
        chosen = closestZ;
      } else {
        for (let k = 0; k < MAX_ENEMIES; k++) {
          const idx = (_groanCursor + k) % MAX_ENEMIES;
          const z = E.zombies[idx];
          if (z.active && !z.dead) {
            chosen = z;
            _groanCursor = (idx + 1) % MAX_ENEMIES;
            break;
          }
        }
      }
      if (chosen) {
        _v1.set(chosen.x, chosen.y + 1.4, chosen.z);
        E.play3D(
          Math.random() > 0.5 ? 'zombie_groan_1' : 'zombie_groan_2',
          _v1,
          0.14,
          fewLeft ? 0.82 : 0.68,
          fewLeft ? _sfxGroanFew : _sfxGroanNorm
        );
      }
    }

    _stepAudioTimer -= step;
    if (_stepAudioTimer <= 0 && closestZ && closestDistSq < 784.0 && closestZ.aggroState !== 'IDLE') {
      const dClosest = Math.sqrt(closestDistSq);
      _stepAudioTimer = closestZ.variant === 'runner' ? 0.28 : 0.44;
      _stepAlternate = !_stepAlternate;
      _v1.set(closestZ.x, closestZ.y + 0.15, closestZ.z);
      E.play3D(
        _stepAlternate ? 'footstep_concrete_1' : 'footstep_concrete_2',
        _v1,
        0.12,
        dClosest < 10 ? 0.44 : 0.34,
        _sfxStepClose
      );
    }

    let colorDirty = false;
    let deactivationDirty = false;
    let anyMatrixUpdated = false;
    const tc = Array.isArray(trainColliders)
      ? trainColliders
      : ((LRT.Train && typeof LRT.Train.getColliders === 'function') ? LRT.Train.getColliders() : null);
    const navGraph = (LRT.Station && typeof LRT.Station.getNavGraph === 'function') ? LRT.Station.getNavGraph() : null;

    // Pre-pass: assign nearest few zombies to funnel through up to 3 closest open train doors during BOARDED_WAIT
    const trainState = (LRT.Train && typeof LRT.Train.getState === 'function') ? LRT.Train.getState() : 'AWAY';
    const trainBounds = (LRT.Train && typeof LRT.Train.getInteriorBounds === 'function') ? LRT.Train.getInteriorBounds() : null;
    const playerInTrain = !!(trainState === 'BOARDED_WAIT' && playerPos && LRT.Train && typeof LRT.Train.isPlayerInside === 'function' && LRT.Train.isPlayerInside(playerPos));
    const openDoors = (playerInTrain && typeof LRT.Train.getOpenDoorways === 'function') ? LRT.Train.getOpenDoorways() : null;
    const hasOpenDoors = !!(openDoors && openDoors.length > 0 && trainBounds && trainBounds.active);
    let topDoorCount = 0;

    for (let i = 0; i < E.activeHighWater; i++) _zombieDoorAssign[i] = -1;
    for (let d = 0; d < 9; d++) _doorAssignCount[d] = 0;

    if (playerInTrain && trainBounds && trainBounds.active) {
      let insideCount = 0;
      let candCount = 0;
      const tX = trainBounds.trackX;
      const tZ = trainBounds.trainZ;
      const tDir = trainBounds.travelDir;

      if (hasOpenDoors) {
        const doorTotal = openDoors.length;
        const maxTop = Math.min(3, doorTotal);
        for (let k = 0; k < maxTop; k++) {
          _closestDoorIdx[k] = -1;
          _closestDoorDist[k] = 1e9;
        }
        for (let d = 0; d < doorTotal; d++) {
          const dr = openDoors[d];
          const dd = Math.hypot(dr.doorX - playerPos.x, dr.z - playerPos.z);
          for (let k = 0; k < maxTop; k++) {
            if (dd < _closestDoorDist[k]) {
              for (let s = maxTop - 1; s > k; s--) {
                _closestDoorIdx[s] = _closestDoorIdx[s - 1];
                _closestDoorDist[s] = _closestDoorDist[s - 1];
              }
              _closestDoorIdx[k] = d;
              _closestDoorDist[k] = dd;
              break;
            }
          }
        }
        topDoorCount = maxTop;
      }

      for (let i = 0; i < E.activeHighWater; i++) {
        const z = E.zombies[i];
        if (!z.active || z.dead) continue;
        const lx = (z.x - tX) * tDir;
        const lz = (z.z - tZ) * tDir;
        if (Math.abs(lx) <= 1.12 && Math.abs(lz) <= trainBounds.lengthHalf && z.y >= -0.35 && z.y <= 2.2) {
          _zombieDoorAssign[i] = -2;
          insideCount++;
        } else if (hasOpenDoors && z.aggroState === 'CHASE' && z.lureTimer <= 0) {
          let bestD = 1e9;
          for (let k = 0; k < topDoorCount; k++) {
            const dr = openDoors[_closestDoorIdx[k]];
            const dd = Math.hypot(dr.thresholdX - z.x, dr.z - z.z);
            if (dd < bestD) bestD = dd;
          }
          // Prioritize zombies already lined up in the doorway threshold so they finish stepping inside
          if (lx >= 0.85 && lx <= 1.85 && Math.abs(lz) <= trainBounds.lengthHalf) {
            bestD -= 100.0;
          }
          _candSlotIdx[candCount] = i;
          _candDist[candCount] = bestD + Math.abs(z.y) * 2.5;
          _candPicked[candCount] = 0;
          candCount++;
        }
      }

      if (hasOpenDoors && topDoorCount > 0) {
        const slotsAvail = Math.max(0, MAX_BOARDING_ZOMBIES - insideCount);
        const picks = Math.min(slotsAvail, candCount);
        for (let p = 0; p < picks; p++) {
          let bestCand = -1;
          let bestScore = 1e9;
          for (let c = 0; c < candCount; c++) {
            if (_candPicked[c]) continue;
            if (_candDist[c] < bestScore) {
              bestScore = _candDist[c];
              bestCand = c;
            }
          }
          if (bestCand < 0) break;
          _candPicked[bestCand] = 1;
          const zIdx = _candSlotIdx[bestCand];
          const z = E.zombies[zIdx];

          let chosenDoor = -1;
          let chosenDoorDist = 1e9;
          for (let k = 0; k < topDoorCount; k++) {
            const dIdx = _closestDoorIdx[k];
            if (dIdx < 0 || _doorAssignCount[dIdx] >= MAX_PER_DOOR_FUNNEL) continue;
            const dr = openDoors[dIdx];
            const dd = Math.hypot(dr.thresholdX - z.x, dr.z - z.z);
            if (dd < chosenDoorDist) {
              chosenDoorDist = dd;
              chosenDoor = dIdx;
            }
          }
          if (chosenDoor >= 0) {
            _zombieDoorAssign[zIdx] = chosenDoor;
            _doorAssignCount[chosenDoor]++;
          }
        }
      }
    }

    for (let i = 0; i < E.activeHighWater; i++) {
      const z = E.zombies[i];
      if (!z.active) continue;

      if (z.hitFlashTimer > 0) {
        z.hitFlashTimer -= step;
        if (z.hitFlashTimer <= 0) {
          z.hitFlashTimer = 0;
          E.applyZombieColors(z);
          colorDirty = true;
        }
      }

      if (z.dead) {
        const prevTimer = z.deathTimer;
        if (stepDeadZombie(z, step, spatialGrid, tc)) {
          deactivationDirty = true;
          continue;
        }
        if (z.deathTimer < 0.52 || z.deathTimer >= 10.8 || prevTimer < 0.52) {
          E.updateZombieMatrices(z, _elapsed, step);
          anyMatrixUpdated = true;
        }
        continue;
      }

      if (z.staggerTimer > 0) z.staggerTimer = Math.max(0, z.staggerTimer - step);
      if (z.hornVulnTimer > 0) z.hornVulnTimer = Math.max(0, z.hornVulnTimer - step);
      if (z.attackTimer > 0) z.attackTimer = Math.max(0, z.attackTimer - step);
      if (z.spitTimer > 0) z.spitTimer = Math.max(0, z.spitTimer - step);
      if (z.spitAnimTimer > 0) z.spitAnimTimer = Math.max(0, z.spitAnimTimer - step);
      if (z.lureTimer > 0) z.lureTimer = Math.max(0, z.lureTimer - step);
      if (z.buffTimer > 0) z.buffTimer = Math.max(0, z.buffTimer - step);
      if (z.screamTimer > 0) z.screamTimer = Math.max(0, z.screamTimer - step);
      if (z.shriekTimer > 0) z.shriekTimer = Math.max(0, z.shriekTimer - step);
      if (z.chargeCooldown > 0) z.chargeCooldown = Math.max(0, z.chargeCooldown - step);
      if (z.alertDelay > 0) z.alertDelay = Math.max(0, z.alertDelay - step);

      z.x += z.vx * step;
      z.z += z.vz * step;
      z.vx *= Math.max(0, 1 - step * 7.5);
      z.vz *= Math.max(0, 1 - step * 7.5);

      // Camera FOV + distance check for AI & 14-limb matrix throttling
      const cdx = z.x - E.camPos.x;
      const cdy = (z.y + 1.0) - E.camPos.y;
      const cdz = z.z - E.camPos.z;
      const camDist = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz);
      let camDot = 1.0;
      if (hasCamForward && camDist > 0.05) {
        camDot = (cdx * E.camForward.x + cdy * E.camForward.y + cdz * E.camForward.z) / camDist;
      }
      const offFov = hasCamForward && (camDot < 0.25 && camDist > 10.0);
      const isThrottledAI = (camDist > animThrottleDist) || offFov;
      const isTickFrame = !isThrottledAI || (((i + frameMod) & 3) === 0);
      const isFarOffFov = (camDist > animThrottleDist * 1.4) && offFov;
      const isVeryFarOffFov = (camDist > 68.0) && offFov;

      if (z.isRoamer && z.aggroState === 'CHASE' && z.lureTimer <= 0) {
        z.chaseLoseTimer += step;
      }

      if (isVeryFarOffFov && !isTickFrame) {
        z.coarseDt += step;
        if (!z.matrixInit) {
          E.updateZombieMatrices(z, _elapsed, 0);
          z.matrixInit = true;
          anyMatrixUpdated = true;
        }
        continue;
      }

      const moveStep = Math.min(0.20, step + z.coarseDt);
      z.coarseDt = 0;

      // Perception check (staggered to 4th frame when >28m or off-FOV)
      if (playerPos && isTickFrame) {
        const pdx = playerPos.x - z.x;
        const pdy = (playerPos.y || 0) - z.y;
        const pdz = playerPos.z - z.z;
        const distHoriz = Math.sqrt(pdx * pdx + pdz * pdz);
        const dist3D = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
        const spotted = evaluatePerception(z, playerPos, pdx, pdy, pdz, distHoriz, dist3D, tier, isDaylight, flashlightOn);

        if (z.aggroState !== 'CHASE') {
          if (spotted) {
            const wasUnaware = (z.aggroState === 'IDLE' || z.aggroState === 'PATROL');
            z.aggroState = 'CHASE';
            z.chaseLoseTimer = 0;
            z.aggroTimer = 0;
            z.lastKnownX = playerPos.x;
            z.lastKnownY = playerPos.y || 0;
            z.lastKnownZ = playerPos.z;
            z.navTimer = 0;
            if (wasUnaware) {
              z.alertDelay = tier.alertDelay * (isDaylightOutbreak() ? (getDaylightMods().alertDelayMult || 0.65) : 1.0);
            }
          }
        } else if (z.isRoamer) {
          if (spotted) {
            z.chaseLoseTimer = 0;
            z.lastKnownX = playerPos.x;
            z.lastKnownY = playerPos.y || 0;
            z.lastKnownZ = playerPos.z;
          } else if (z.lureTimer <= 0 && z.chaseLoseTimer > 14.0) {
            z.aggroState = 'INVESTIGATE';
            z.chaseLoseTimer = 0;
            z.aggroTimer = 0;
            z.navTimer = 0;
          }
        }
      }

      const hasLure = z.lureTimer > 0;
      const preMoveX = z.x;
      const preMoveZ = z.z;

      if (z.aggroState === 'IDLE' && !hasLure) {
        z.actualSpeed = 0;
        z.actualSpeedSmooth += (0 - (z.actualSpeedSmooth || 0)) * Math.min(1, moveStep * 12.0);
        z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
        z.smoothSteerX *= 0.5;
        z.smoothSteerZ *= 0.5;
        z.animPhase += moveStep * 0.85;
        if (!z.groundedOnce) {
          E.gatherNearbyColliders(z.x, z.z, 2.0, spatialGrid, tc);
          E.resolveCollisions(z, 0.38 * z.scale, moveStep);
          z.groundedOnce = true;
        }
      } else if (z.aggroState === 'PATROL' && !hasLure) {
        if (z.patrolWaitTimer > 0) {
          z.patrolWaitTimer -= moveStep;
          z.actualSpeed = 0;
          z.actualSpeedSmooth += (0 - (z.actualSpeedSmooth || 0)) * Math.min(1, moveStep * 12.0);
          z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
          z.smoothSteerX = 0;
          z.smoothSteerZ = 0;
          z.animPhase += moveStep * 0.85;
          if (!z.groundedOnce) {
            E.gatherNearbyColliders(z.x, z.z, 2.0, spatialGrid, tc);
            E.resolveCollisions(z, 0.38 * z.scale, moveStep);
            z.groundedOnce = true;
          }
          if (z.patrolWaitTimer <= 0) {
            pickPatrolTargetFor(z, navGraph);
          }
        } else {
          const pdx = z.patrolTargetX - z.x;
          const pdz = z.patrolTargetZ - z.z;
          const pDist = Math.hypot(pdx, pdz);
          if (pDist <= 1.25) {
            z.patrolWaitTimer = 1.5 + Math.random() * 2.5;
            z.actualSpeed = 0;
            z.actualSpeedSmooth += (0 - (z.actualSpeedSmooth || 0)) * Math.min(1, moveStep * 12.0);
            z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
            z.smoothSteerX = 0;
            z.smoothSteerZ = 0;
            z.animPhase += moveStep * 0.85;
          } else {
            E.gatherNearbyColliders(z.x, z.z, 2.4, spatialGrid, tc);
            const patrolSpd = z.speed * tier.roamSpeedMult;
            steerAndMove(z, i, z.patrolTargetX, z.patrolTargetZ, patrolSpd, moveStep, false, pDist, pDist, pdx, pdz);
            E.resolveCollisions(z, 0.38 * z.scale, moveStep);
            z.groundedOnce = true;
            const frameDist = Math.hypot(z.x - preMoveX, z.z - preMoveZ);
            z.actualSpeed = moveStep > 1e-4 ? (frameDist / moveStep) : 0;
            z.actualSpeedSmooth += (z.actualSpeed - (z.actualSpeedSmooth || 0)) * Math.min(1.0, moveStep * 12.0);
            z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
            z.animPhase += moveStep * (1.2 + z.actualSpeedSmooth * 2.35);
            E.updateStuckRecovery(z, moveStep, pDist, 1.25);
          }
        }
      } else if (z.aggroState === 'INVESTIGATE' || (hasLure && z.aggroState !== 'CHASE')) {
        const targetX = hasLure ? z.lurePosX : z.lastKnownX;
        const targetY = hasLure ? z.lurePosY : z.lastKnownY;
        const targetZ = hasLure ? z.lurePosZ : z.lastKnownZ;

        const pdx = targetX - z.x;
        const pdy = targetY - z.y;
        const pdz = targetZ - z.z;
        const distHoriz = Math.sqrt(pdx * pdx + pdz * pdz);
        const dist3D = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);

        z.aggroTimer += moveStep;
        if ((hasLure && distHoriz < 1.5) || (!hasLure && distHoriz < 1.8 && Math.abs(pdy) <= 1.25) || z.aggroTimer > 10.0) {
          if (hasLure) z.lureTimer = 0;
          z.aggroState = 'PATROL';
          z.aggroTimer = 0;
          z.patrolOriginX = z.x;
          z.patrolOriginZ = z.z;
          z.patrolWaitTimer = 1.6 + Math.random() * 1.5;
          z.actualSpeed = 0;
          z.actualSpeedSmooth += (0 - (z.actualSpeedSmooth || 0)) * Math.min(1, moveStep * 12.0);
          z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
          z.smoothSteerX = 0;
          z.smoothSteerZ = 0;
          z.animPhase += moveStep * 0.85;
        } else {
          z.navTimer -= moveStep;
          const reachedWp = z.hasNavWp && Math.hypot(z.wpX - z.x, z.wpZ - z.z) < 1.25 && Math.abs(z.wpY - z.y) < 0.85;
          if ((reachedWp || z.navTimer <= 0) && isTickFrame) {
            z.navTimer = 0.45 + (i % 5) * 0.05;
            E.solveNavWaypoint(z, targetX, targetY, targetZ, spatialGrid, tc);
          }
          const goalX = z.hasNavWp ? z.wpX : targetX;
          const goalZ = z.hasNavWp ? z.wpZ : targetZ;

          if (z.alertDelay <= 0) {
            E.gatherNearbyColliders(z.x, z.z, 2.6, spatialGrid, tc);
            const invSpd = z.speed * (z.staggerTimer > 0 ? 0.22 : 0.85) * (isDaylightOutbreak() ? (getDaylightMods().speedMult || 1.22) : 1.0);
            steerAndMove(z, i, goalX, goalZ, invSpd, moveStep, false, dist3D, distHoriz, pdx, pdz);
            E.resolveCollisions(z, 0.38 * z.scale, moveStep);
            z.groundedOnce = true;
            const frameDist = Math.hypot(z.x - preMoveX, z.z - preMoveZ);
            z.actualSpeed = moveStep > 1e-4 ? (frameDist / moveStep) : 0;
            z.actualSpeedSmooth += (z.actualSpeed - (z.actualSpeedSmooth || 0)) * Math.min(1.0, moveStep * 12.0);
            z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
            z.animPhase += moveStep * (1.2 + z.actualSpeedSmooth * 2.35);
            E.updateStuckRecovery(z, moveStep, dist3D, 1.5);
          } else {
            rotateYawToward(z, Math.atan2(goalX - z.x, goalZ - z.z), tier.yawRate, moveStep);
            z.actualSpeed = 0;
            z.actualSpeedSmooth += (0 - (z.actualSpeedSmooth || 0)) * Math.min(1, moveStep * 12.0);
            z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
            z.smoothSteerX = 0;
            z.smoothSteerZ = 0;
            z.animPhase += moveStep * 1.4;
          }
        }
      } else {
        // CHASE state (full combat & multi-level pursuit)
        const hasTarget = !!(playerPos || hasLure);
        if (hasTarget) {
          const rawTargetX = hasLure ? z.lurePosX : playerPos.x;
          const rawTargetY = hasLure ? z.lurePosY : (playerPos.y || 0);
          const rawTargetZ = hasLure ? z.lurePosZ : playerPos.z;

          const pdx = rawTargetX - z.x;
          const pdy = rawTargetY - z.y;
          const pdz = rawTargetZ - z.z;
          const distHoriz = Math.sqrt(pdx * pdx + pdz * pdz);
          const dist3D = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);

          if (hasLure && distHoriz < 1.5) {
            z.lureTimer = 0;
          }

          let targetX = rawTargetX;
          let targetY = rawTargetY;
          let targetZ = rawTargetZ;
          const doorAssign = (!hasLure && playerInTrain) ? _zombieDoorAssign[i] : -1;
          let isDoorCrossing = false;
          let isInsideCabin = false;

          if (doorAssign === -2 && trainBounds) {
            isInsideCabin = true;
            z.hasNavWp = false;
            const zLocalZ = (z.z - trainBounds.trainZ) * trainBounds.travelDir;
            const pLocalX = (playerPos.x - trainBounds.trackX) * trainBounds.travelDir;
            const pLocalZ = (playerPos.z - trainBounds.trainZ) * trainBounds.travelDir;
            if (Math.abs(zLocalZ - pLocalZ) > 1.65) {
              const aisleLocalX = Math.max(-0.42, Math.min(0.42, pLocalX));
              targetX = trainBounds.trackX + aisleLocalX * trainBounds.travelDir;
              targetY = trainBounds.floorY;
              targetZ = playerPos.z;
            }
          } else if (doorAssign >= 0 && hasOpenDoors && trainBounds) {
            const door = openDoors[doorAssign];
            const zLocalX = (z.x - trainBounds.trackX) * trainBounds.travelDir;
            const distToThresh = Math.hypot(door.thresholdX - z.x, door.z - z.z);
            const inDoorwayLane = Math.abs(z.z - door.z) <= 0.55 && zLocalX >= 0.65 && zLocalX <= 2.35 && Math.abs(z.y - door.y) <= 0.65;
            if (inDoorwayLane || (distToThresh <= 1.25 && Math.abs(z.y - door.y) <= 0.65)) {
              z.hasNavWp = false;
              isDoorCrossing = true;
              targetX = door.aisleX;
              targetY = door.y;
              targetZ = door.z;
            } else {
              targetX = door.thresholdX;
              targetY = 0.0;
              targetZ = door.z;
            }
          }

          // Refresh multi-level/street A* waypoint on arrival or periodic interval (stagger periodic checks when throttled)
          if (!isInsideCabin && !isDoorCrossing) {
            z.navTimer -= moveStep;
            const reachedWp = z.hasNavWp && Math.hypot(z.wpX - z.x, z.wpZ - z.z) < 1.25 && Math.abs(z.wpY - z.y) < 0.85;
            const activelyClimbing = z.hasNavWp && (z.wpY - z.y) > 0.25 && Math.hypot(z.wpX - z.x, z.wpZ - z.z) < 6.5;
            if (reachedWp || (z.navTimer <= 0 && !activelyClimbing && isTickFrame)) {
              z.navTimer = 0.26 + (i % 4) * 0.03;
              E.solveNavWaypoint(z, targetX, targetY, targetZ, spatialGrid, tc);
            }
          }

          const goalX = (!isInsideCabin && !isDoorCrossing && z.hasNavWp) ? z.wpX : targetX;
          const goalZ = (!isInsideCabin && !isDoorCrossing && z.hasNavWp) ? z.wpZ : targetZ;
          const dx = goalX - z.x;
          const dz = goalZ - z.z;

          if (z.alertDelay <= 0) {
            E.gatherNearbyColliders(z.x, z.z, 2.8, spatialGrid, tc);
          }

          // 1. Screamer shriek & frenzy buff
          const shriekRange = isDaylightOutbreak() ? (22.0 * (getDaylightMods().sightRangeMult || 1.40)) : 22.0;
          if (z.variant === 'screamer' && playerPos && z.screamTimer <= 0 && z.shriekTimer <= 0 && z.staggerTimer <= 0 && dist3D <= shriekRange) {
            _v1.set(z.x, z.y + 1.45 * z.scale, z.z);
            _v2.set(playerPos.x - _v1.x, ((playerPos.y || 0) + 1.2) - _v1.y, playerPos.z - _v1.z).normalize();
            let losBlocked = false;
            if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
              const hit = LRT.Station.raycastWorld(_v1, _v2, dist3D - 0.5);
              if (hit) losBlocked = true;
            }
            if (!losBlocked) {
              z.shriekTimer = 0.55 * (isDaylightOutbreak() ? (getDaylightMods().windupMult || 0.85) : 1.0);
              const cfg = E.getEnemyCfg('screamer');
              z.screamTimer = (cfg && cfg.screamCooldown) ? cfg.screamCooldown : 7.5;
              E.play3D('zombie_groan_2', _v1, 0.04, 1.0, _sfxScream);
              const screamRad = tier.screamRadius || (cfg && cfg.screamRadius) || 24.0;
              const screamAlertDelay = tier.alertDelay * (isDaylightOutbreak() ? (getDaylightMods().alertDelayMult || 0.65) : 1.0);
              for (let k = 0; k < E.activeHighWater; k++) {
                const other = E.zombies[k];
                if (!other.active || other.dead) continue;
                const dScream = Math.hypot(other.x - z.x, other.z - z.z);
                if (dScream <= screamRad) {
                  other.buffTimer = Math.max(other.buffTimer || 0, 4.5);
                  if (other.aggroState !== 'CHASE') {
                    other.aggroState = 'CHASE';
                    other.alertDelay = screamAlertDelay;
                    other.chaseLoseTimer = 0;
                    other.lastKnownX = playerPos.x;
                    other.lastKnownY = playerPos.y || 0;
                    other.lastKnownZ = playerPos.z;
                  }
                }
              }
            }
          }

          // 2. Brute telegraphed charge windup
          if (z.variant === 'brute' && !z.dead && !z.crawling && z.staggerTimer <= 0 && z.chargeWindup <= 0 && z.chargeTimer <= 0 && z.chargeCooldown <= 0 && !z.hasNavWp && !isDoorCrossing && playerPos) {
            if (distHoriz >= 5.0 && distHoriz <= 14.0 && Math.abs(pdy) <= 0.85) {
              _v1.set(z.x, z.y + 1.35 * z.scale, z.z);
              _v2.set(playerPos.x - _v1.x, ((playerPos.y || 0) + 1.2) - _v1.y, playerPos.z - _v1.z).normalize();
              let losBlocked = false;
              if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
                const hit = LRT.Station.raycastWorld(_v1, _v2, distHoriz - 0.5);
                if (hit) losBlocked = true;
              }
              if (!losBlocked) {
                z.chargeWindup = tier.bruteChargeWindup * (isDaylightOutbreak() ? (getDaylightMods().windupMult || 0.85) : 1.0);
                z.chargeCooldown = tier.bruteChargeCooldown + Math.random() * 2.0;
                z.chargeDirX = pdx / distHoriz;
                z.chargeDirZ = pdz / distHoriz;
                z.yaw = Math.atan2(pdx, pdz);
                E.play3D('zombie_groan_1', _v1, 0.05, 1.1, _sfxBruteWindup);
              }
            }
          }
          if (z.chargeWindup > 0) {
            z.chargeWindup -= moveStep;
            if (z.chargeWindup <= 0) {
              z.chargeTimer = 1.15;
              _v1.set(z.x, z.y + 0.15, z.z);
              E.play3D('footstep_metal', _v1, 0.08, 0.9);
            }
          }
          if (z.chargeTimer > 0) {
            z.chargeTimer -= moveStep;
          }

          // 3. Movement speed with buffs & distant straggler catch-up
          let moveSpd = z.staggerTimer > 0 ? z.speed * 0.22 : z.speed;
          if (isDaylightOutbreak()) moveSpd *= (getDaylightMods().speedMult || 1.22);
          if (z.buffTimer > 0) moveSpd *= tier.screamerBuffMult;
          if (isStraggler && dist3D > 22.0) moveSpd *= 1.25;
          if (z.chargeTimer > 0) moveSpd = z.speed * tier.bruteChargeMult * (isDaylightOutbreak() ? (getDaylightMods().speedMult || 1.22) : 1.0);
          if (z.shriekTimer > 0 || z.chargeWindup > 0) moveSpd = 0;

          // 4. Spitter active backpedaling when player pushes inside 1.55m
          let isBackpedaling = false;
          if (z.variant === 'spitter' && !z.hasNavWp && !isDoorCrossing && !isInsideCabin && dist3D < 1.55 && Math.abs(pdy) <= 0.85 && z.staggerTimer <= 0 && playerPos) {
            _v1.set(z.x, z.y + 1.45 * z.scale, z.z);
            _v2.set(playerPos.x - _v1.x, ((playerPos.y || 0) + 1.2) - _v1.y, playerPos.z - _v1.z).normalize();
            let losBlocked = false;
            if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
              const hit = LRT.Station.raycastWorld(_v1, _v2, dist3D - 0.5);
              if (hit) losBlocked = true;
            }
            if (!losBlocked) {
              const away = Math.atan2(-pdx, -pdz);
              const rad = 0.38 * z.scale;
              _tryBack[0] = away;
              _tryBack[1] = away + 0.65;
              _tryBack[2] = away - 0.65;
              for (let ba = 0; ba < 3; ba++) {
                const bang = _tryBack[ba];
                const bpx = z.x + Math.sin(bang) * 0.95;
                const bpz = z.z + Math.cos(bang) * 0.95;
                if (!E.isBlockedAt(bpx, z.y, bpz, rad)) {
                  z._backpedalAng = bang;
                  isBackpedaling = true;
                  break;
                }
              }
            }
          }

          const meleeRange = z.variant === 'spitter' ? 1.55 : z.attackRange;
          const stopDist = (z.variant === 'spitter' && !z.hasNavWp && !isDoorCrossing && !isInsideCabin && Math.abs(pdy) <= 1.2 && !z.spitBlocked && distHoriz <= 3.5)
            ? 2.55
            : (meleeRange * 0.82);

          const isEnteringDoor = doorAssign >= 0;
          const moveCheckDist = isEnteringDoor ? Math.hypot(goalX - z.x, goalZ - z.z) : dist3D;
          const effStopDist = isEnteringDoor ? 0.22 : stopDist;
          if (z.crawling) z.crawlFallTimer = (z.crawlFallTimer || 0) + moveStep;
          const crawlFalling = z.crawling && z.crawlFallTimer < 0.30;
          const shouldMove = (moveCheckDist > effStopDist || isBackpedaling || z.chargeTimer > 0)
            && !crawlFalling && z.alertDelay <= 0 && z.shriekTimer <= 0 && z.chargeWindup <= 0;

          if (shouldMove) {
            steerAndMove(z, i, goalX, goalZ, moveSpd, moveStep, isBackpedaling, dist3D, distHoriz, pdx, pdz, isDoorCrossing || isInsideCabin);
          } else {
            // Stopped in combat/spit range or winding up: face player smoothly and stand planted
            const faceDx = z.alertDelay > 0 ? dx : pdx;
            const faceDz = z.alertDelay > 0 ? dz : pdz;
            if (faceDx * faceDx + faceDz * faceDz > 1e-4) {
              rotateYawToward(z, Math.atan2(faceDx, faceDz), tier.yawRate * 1.15, moveStep);
            }
            z.actualSpeed = 0;
            z.actualSpeedSmooth += (0 - (z.actualSpeedSmooth || 0)) * Math.min(1.0, moveStep * 12.0);
            z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
            z.smoothSteerX = 0;
            z.smoothSteerZ = 0;
            z.animPhase += moveStep * 1.4;
          }

          if (z.alertDelay <= 0) {
            E.resolveCollisions(z, 0.38 * z.scale, moveStep);
            z.groundedOnce = true;
            if (shouldMove) {
              const frameDist = Math.hypot(z.x - preMoveX, z.z - preMoveZ);
              z.actualSpeed = moveStep > 1e-4 ? (frameDist / moveStep) : 0;
              z.actualSpeedSmooth += (z.actualSpeed - (z.actualSpeedSmooth || 0)) * Math.min(1.0, moveStep * 12.0);
              z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
              z.animPhase += moveStep * (1.2 + z.actualSpeedSmooth * 2.35);
              if (z.crawling && z.crawlFallTimer >= 0.30) {
                z.crawlPhase = (z.crawlPhase || 0) + frameDist * 4.2 + moveStep * 0.8 * z.moveBlend;
                z.crawlBloodDist = (z.crawlBloodDist || 0) + frameDist;
                if (z.crawlBloodDist >= 0.95) {
                  z.crawlBloodDist = 0;
                  if (LRT.Weapons && typeof LRT.Weapons.spawnBloodDecal === 'function') {
                    _v2.set(z.x, z.y + 0.022, z.z);
                    _v3.set(0, 1, 0);
                    LRT.Weapons.spawnBloodDecal(_v2, _v3, 0.48, false);
                  }
                }
              }
            }
            E.updateStuckRecovery(z, moveStep, moveCheckDist, effStopDist);
          } else if (!z.groundedOnce) {
            E.gatherNearbyColliders(z.x, z.z, 2.0, spatialGrid, tc);
            E.resolveCollisions(z, 0.38 * z.scale, moveStep);
            z.groundedOnce = true;
          }

          const canMelee = !playerInTrain || isInsideCabin || (isDoorCrossing && trainBounds && Math.abs((z.x - trainBounds.trackX) * trainBounds.travelDir) <= 1.40);
          if (canMelee && !crawlFalling && dist3D <= meleeRange && Math.abs(pdy) <= 1.8 && z.attackTimer <= 0 && z.staggerTimer <= 0 && z.shriekTimer <= 0 && z.chargeWindup <= 0 && z.alertDelay <= 0) {
            z.attackTimer = z.attackCooldown * (isDaylightOutbreak() ? (getDaylightMods().windupMult || 0.85) : 1.0);
            const isChargingHit = z.chargeTimer > 0;
            if (isChargingHit) z.chargeTimer = 0;
            _v1.set(z.x, z.y + (z.crawling ? 0.42 : 1.3), z.z);
            E.play3D('zombie_attack', _v1, 0.14, 0.95);
            if (typeof onPlayerHit === 'function') {
              const armMult = (z.lostLeftArm && z.lostRightArm) ? 0.55 : ((z.lostLeftArm || z.lostRightArm) ? 0.80 : 1.0);
              const hitDmg = Math.max(1, Math.round((isChargingHit ? z.damage * 1.5 : z.damage) * armMult));
              onPlayerHit(hitDmg, _v1);
            }
          }

          // Train siege during TRAIN_BOARDING: overflow / closed-door exterior zombies batter train doors/hull
          if (playerInTrain && doorAssign === -1 && z.attackTimer <= 0 && z.staggerTimer <= 0) {
            let distToTrain = 999;
            if (tc && tc.length > 0) {
              for (let c = 0; c < tc.length; c++) {
                const b = tc[c];
                if (!b) continue;
                const minX = b.min ? b.min.x : b.minX;
                const maxX = b.max ? b.max.x : b.maxX;
                const minZ = b.min ? b.min.z : b.minZ;
                const maxZ = b.max ? b.max.z : b.maxZ;
                const cx = Math.max(minX, Math.min(z.x, maxX));
                const cz = Math.max(minZ, Math.min(z.z, maxZ));
                const d = Math.hypot(z.x - cx, z.z - cz);
                if (d < distToTrain) distToTrain = d;
              }
            }
            if (distToTrain <= 2.2) {
              z.attackTimer = z.attackCooldown;
              _v1.set(z.x, z.y + 1.25, z.z);
              E.play3D('zombie_attack', _v1, 0.14, 0.95);
              if (typeof LRT.Train.applyDamage === 'function') {
                LRT.Train.applyDamage(_v1, 1.2, z.damage * 1.4, 4.0);
              }
            }
          }

          if (z.variant === 'spitter' && playerPos && distHoriz >= 1.15 && distHoriz <= 3.5 && dist3D <= 3.9 && Math.abs(pdy) <= 2.5 && z.spitTimer <= 0 && z.staggerTimer <= 0 && z.alertDelay <= 0) {
            const mouthY = z.y + 1.46 * z.scale;
            const targetY = (playerPos.y || 0) + 1.05;
            _v1.set(z.x, mouthY, z.z);
            _v2.set(playerPos.x - _v1.x, targetY - _v1.y, playerPos.z - _v1.z);
            const losLen = _v2.length();
            if (losLen > 0.01) _v2.divideScalar(losLen);
            let blocked = false;
            const checkDist = Math.max(0.1, losLen - 0.45);
            if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
              const wallHit = LRT.Station.raycastWorld(_v1, _v2, checkDist);
              if (wallHit) blocked = true;
            }
            if (!blocked && LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
              const trainHit = LRT.Train.raycastTrain(_v1, _v2, checkDist);
              if (trainHit) blocked = true;
            }
            // Also verify ballistic arc apex clearance so Spitters do not lob blindly into low lintels/ceilings
            if (!blocked && distHoriz > 2.2) {
              const ft = Math.max(0.36, Math.min(0.88, distHoriz / 8.4));
              const apexY = (mouthY + targetY) * 0.5 + 0.125 * 11.5 * ft * ft;
              _v3.set((z.x + playerPos.x) * 0.5, apexY, (z.z + playerPos.z) * 0.5);
              _v4.subVectors(_v3, _v1);
              const seg1 = _v4.length();
              if (seg1 > 0.25) {
                _v4.divideScalar(seg1);
                if (LRT.Station && typeof LRT.Station.raycastWorld === 'function' && LRT.Station.raycastWorld(_v1, _v4, seg1 - 0.15)) {
                  blocked = true;
                }
                if (!blocked && LRT.Train && typeof LRT.Train.raycastTrain === 'function' && LRT.Train.raycastTrain(_v1, _v4, seg1 - 0.15)) {
                  blocked = true;
                }
              }
            }
            if (!blocked) {
              z.yaw = Math.atan2(pdx, pdz);
              z.spitBlocked = false;
              z.spitTimer = (3.2 + Math.random() * 1.0) * (isDaylightOutbreak() ? (getDaylightMods().windupMult || 0.85) : 1.0);
              E.spawnBileProjectile(z, playerPos);
            } else {
              z.spitBlocked = true;
              z.spitTimer = 0.55;
            }
          }
        }
      }

      z._animDtAccum = (z._animDtAccum || 0) + moveStep;
      const shouldUpdateAnim = (!isFarOffFov && (!isThrottledAI || isTickFrame)) || !z.matrixInit;
      if (shouldUpdateAnim) {
        E.updateZombieMatrices(z, _elapsed, z._animDtAccum);
        z._animDtAccum = 0;
        z.matrixInit = true;
        anyMatrixUpdated = true;
      }
    }

    // Update Spitter bile projectiles
    E.updateBileProjectiles(step, _elapsed, playerPos, onPlayerHit);

    let highWater = 0;
    let hasBruteArmor = false;
    let hasBio = false;
    let hasRag = false;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (z.active || z.dead) {
        highWater = i + 1;
        if (z.variant === 'brute' && z.hasArmor && !z.dead) hasBruteArmor = true;
        if ((z.variant === 'spitter' || z.variant === 'screamer') && !z.dead) hasBio = true;
        if ((z.variant === 'walker' || z.variant === 'runner') && !z.dead) hasRag = true;
      }
    }
    E.updateOverlayVisibilityAndCounts(highWater, hasBruteArmor, hasBio, hasRag, anyMatrixUpdated || deactivationDirty);
    if (colorDirty) E.markColorsDirty();
  }

  function getAliveCount() {
    let alive = E.pendingQueue.length;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (E.zombies[i].active && !E.zombies[i].dead) alive++;
    }
    return alive;
  }

  function getWaveRemainingCount() {
    let rem = E.pendingQueue.length;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      if (!z.isRoamer || z.aggroState === 'CHASE') rem++;
    }
    return rem;
  }

  function getTotalCount() {
    return _waveTotalCount;
  }

  function getSpawnedSpitterProjectiles() {
    const out = [];
    for (let i = 0; i < MAX_BILE; i++) {
      if (E.bileOrbs[i].active) {
        out.push({ pos: E.bileOrbs[i].pos, vel: E.bileOrbs[i].vel, active: true });
      }
    }
    return out;
  }

  function getActiveAcidPuddles() {
    const out = [];
    if (!E.bilePuddles) return out;
    for (let i = 0; i < E.bilePuddles.length; i++) {
      const p = E.bilePuddles[i];
      if (p && p.active) {
        out.push({ pos: p.pos, radius: p.radius, life: p.life, maxLife: p.maxLife, active: true });
      }
    }
    return out;
  }

  function getDebugSummary() {
    const list = [];
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      list.push({
        id: z.id,
        variant: z.variant,
        x: +z.x.toFixed(2),
        y: +z.y.toFixed(2),
        z: +z.z.toFixed(2),
        hp: z.hp,
        armorHp: z.armorHp,
        speed: +z.speed.toFixed(3),
        baseSpeed: +(z.baseSpeed || z.speed).toFixed(3),
        legCrippled: !!z.legCrippled,
        hitZone: z.hitZone || 'torso',
        isRoamer: !!z.isRoamer,
        aggroState: z.aggroState,
        patrolTarget: z.aggroState === 'PATROL' ? { x: +z.patrolTargetX.toFixed(2), z: +z.patrolTargetZ.toFixed(2) } : null,
        chaseLoseTimer: +z.chaseLoseTimer.toFixed(2),
        hasNavWp: z.hasNavWp,
        wp: z.hasNavWp ? { x: +z.wpX.toFixed(2), y: +z.wpY.toFixed(2), z: +z.wpZ.toFixed(2) } : null
      });
    }
    return list;
  }

  function emitSoundImpulse(pos, baseRadius, sourceTag) {
    if (!pos) return 0;
    const tier = getDifficultyTier();
    const daylightOutbreak = isDaylightOutbreak();
    const mods = daylightOutbreak ? getDaylightMods() : null;
    const baseRad = baseRadius !== undefined ? baseRadius : 28.0;
    const effRadius = baseRad * tier.soundMult * (mods ? (mods.gunshotAlertMult || 1.35) : 1.0);
    const effAlertDelay = tier.alertDelay * (mods ? (mods.alertDelayMult || 0.65) : 1.0);
    const py = pos.y !== undefined ? pos.y : 0.0;
    const tag = String(sourceTag || '').toLowerCase();
    const isHeavy = tag === 'shotgun' || tag === 'rpg' || tag === 'explosion' || tag === 'barrel' || tag === 'screamer';
    const isLure = tag === 'horn' || tag === 'pln' || tag === 'generator' || tag === 'lure';

    let alerted = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      const dx = z.x - pos.x;
      const dy = (z.y - py) * 0.75;
      const dz = z.z - pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > effRadius) continue;

      z.lastKnownX = pos.x;
      z.lastKnownY = pos.y !== undefined ? pos.y : z.y;
      z.lastKnownZ = pos.z;
      z.navTimer = 0;

      if (isLure) {
        z.lureTimer = 6.0;
        z.lurePosX = pos.x;
        z.lurePosY = z.lastKnownY;
        z.lurePosZ = pos.z;
      }

      if (tag === 'screamer') {
        z.buffTimer = Math.max(z.buffTimer || 0, 4.5);
      }

      if (isHeavy || d < effRadius * 0.5) {
        if (z.aggroState !== 'CHASE') {
          z.aggroState = 'CHASE';
          z.alertDelay = effAlertDelay;
          z.chaseLoseTimer = 0;
          z.aggroTimer = 0;
        } else {
          z.chaseLoseTimer = 0;
        }
        alerted++;
      } else if (z.aggroState === 'IDLE' || z.aggroState === 'PATROL') {
        z.aggroState = 'INVESTIGATE';
        z.aggroTimer = 0;
        alerted++;
      } else if (z.aggroState === 'INVESTIGATE') {
        z.aggroTimer = 0;
        if (d < effRadius * 0.65) {
          z.aggroState = 'CHASE';
          z.alertDelay = effAlertDelay;
          z.chaseLoseTimer = 0;
        }
        alerted++;
      }
    }
    return alerted;
  }

  function alertAllTo(targetPos, radius) {
    if (!targetPos) return;
    const mult = isDaylightOutbreak() ? (getDaylightMods().gunshotAlertMult || 1.35) : 1.0;
    const rad = (radius !== undefined ? radius : 45.0) * mult;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      const d = Math.hypot(z.x - targetPos.x, z.z - targetPos.z);
      if (d <= rad) {
        z.lureTimer = 6.0;
        z.lurePosX = targetPos.x;
        z.lurePosY = targetPos.y !== undefined ? targetPos.y : z.y;
        z.lurePosZ = targetPos.z;
        z.lastKnownX = targetPos.x;
        z.lastKnownY = z.lurePosY;
        z.lastKnownZ = targetPos.z;
        z.navTimer = 0;
        if (z.aggroState === 'IDLE' || z.aggroState === 'PATROL') {
          z.aggroState = 'INVESTIGATE';
          z.aggroTimer = 0;
        }
      }
    }
  }

  function stunByHorn(origin, radius) {
    if (!origin) return { stunned: 0 };
    const rad = radius !== undefined ? radius : 32.0;
    let stunned = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      const d = Math.hypot(z.x - origin.x, z.z - origin.z);
      if (d <= rad) {
        z.staggerTimer = Math.max(z.staggerTimer || 0, 2.6);
        z.vx = 0;
        z.vz = 0;
        if (z.variant === 'spitter') z.spitTimer = Math.max(z.spitTimer || 0, 3.2);
        if (z.variant === 'screamer') {
          z.screamTimer = Math.max(z.screamTimer || 0, 3.8);
          z.shriekTimer = 0;
        }
        z.hornVulnTimer = Math.max(z.hornVulnTimer || 0, 4.0);
        stunned++;
      }
    }
    return { stunned };
  }

  function applyHydrantKnockback(origin, radius, impulse) {
    if (!origin) return;
    const rad = radius !== undefined ? radius : 4.5;
    const imp = impulse !== undefined ? impulse : 8.5;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z.active || z.dead) continue;
      const dx = z.x - origin.x;
      const dy = z.y - origin.y;
      const dz = z.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < rad && dist > 0.01) {
        const falloff = 1.0 - dist / rad;
        const push = imp * falloff;
        z.vx += (dx / dist) * push;
        z.vz += (dz / dist) * push;
        z.staggerTimer = Math.max(z.staggerTimer, 0.45 * falloff);
      }
    }
  }

  function ejectFromTrain(bounds) {
    const b = bounds || (LRT.Train && typeof LRT.Train.getInteriorBounds === 'function' ? LRT.Train.getInteriorBounds() : null);
    if (!b || !b.active) return 0;
    const tX = b.trackX || 0;
    const tZ = b.trainZ || 0;
    const tDir = b.travelDir === -1 ? -1 : 1;
    const sideSign = b.platformSideSign || tDir;
    const halfW = (b.halfWidth || 1.325) + 0.30;
    const halfLen = (b.lengthHalf || 25.35) + 0.35;
    const exitX = b.platformExitX !== undefined ? b.platformExitX : (tX + sideSign * 2.20);

    let ejected = 0;
    for (let i = 0; i < E.activeHighWater; i++) {
      const z = E.zombies[i];
      if (!z.active) continue;
      const lx = (z.x - tX) * tDir;
      const lz = (z.z - tZ) * tDir;
      if (Math.abs(lx) <= halfW && Math.abs(lz) <= halfLen) {
        z.x = exitX + sideSign * (0.08 + Math.random() * 0.22);
        z.y = 0.0;
        z.vy = 0;
        z.vx = sideSign * 3.4;
        z.vz = (Math.random() - 0.5) * 0.8;
        z.staggerTimer = Math.max(z.staggerTimer || 0, 0.70);
        z.hasNavWp = false;
        z.chargeTimer = 0;
        z.chargeWindup = 0;
        z.lastProgX = z.x;
        z.lastProgZ = z.z;
        E.updateZombieMatrices(z, _elapsed, 0);
        z.matrixInit = true;
        ejected++;
      }
    }

    if (ejected > 0) {
      let highWater = 0;
      let hasBruteArmor = false;
      let hasBio = false;
      let hasRag = false;
      for (let i = 0; i < MAX_ENEMIES; i++) {
        const z = E.zombies[i];
        if (z.active || z.dead) {
          highWater = i + 1;
          if (z.variant === 'brute' && z.hasArmor && !z.dead) hasBruteArmor = true;
          if ((z.variant === 'spitter' || z.variant === 'screamer') && !z.dead) hasBio = true;
          if ((z.variant === 'walker' || z.variant === 'runner') && !z.dead) hasRag = true;
        }
      }
      E.updateOverlayVisibilityAndCounts(highWater, hasBruteArmor, hasBio, hasRag, true);
    }
    return ejected;
  }

  // Keeps station zombies animating in-place (without chasing the moving train) while the old station scrolls away
  function updateDepartingIdle(dt) {
    if (!E.initialized) return;
    const step = Math.min(dt || 0.016, 0.05);
    _elapsed += step;
    let anyMatrixUpdated = false;
    let deactivationDirty = false;
    let colorDirty = false;
    let highWater = 0;
    let hasBruteArmor = false;
    let hasBio = false;
    let hasRag = false;

    for (let i = 0; i < MAX_ENEMIES; i++) {
      const z = E.zombies[i];
      if (!z || (!z.active && !z.dead)) continue;

      if (z.hitFlashTimer > 0) {
        z.hitFlashTimer -= step;
        if (z.hitFlashTimer <= 0) {
          z.hitFlashTimer = 0;
          E.applyZombieColors(z);
          colorDirty = true;
        }
      }

      if (z.dead) {
        if (stepDeadZombie(z, step, null, null)) {
          deactivationDirty = true;
          continue;
        }
      } else {
        if (z.spitAnimTimer > 0) z.spitAnimTimer = Math.max(0, z.spitAnimTimer - step);
        z.actualSpeed = 0;
        z.actualSpeedSmooth += (0 - (z.actualSpeedSmooth || 0)) * Math.min(1, step * 8.0);
        z.moveBlend = Math.min(1.0, z.actualSpeedSmooth / Math.max(0.25, z.speed));
        z.smoothSteerX = 0;
        z.smoothSteerZ = 0;
        z.vx *= Math.max(0, 1 - step * 8.0);
        z.vz *= Math.max(0, 1 - step * 8.0);
        z.x += z.vx * step;
        z.z += z.vz * step;
        z.animPhase += step * 1.4;
      }

      highWater = i + 1;
      if (z.variant === 'brute' && z.hasArmor && !z.dead) hasBruteArmor = true;
      if ((z.variant === 'spitter' || z.variant === 'screamer') && !z.dead) hasBio = true;
      if ((z.variant === 'walker' || z.variant === 'runner') && !z.dead) hasRag = true;

      E.updateZombieMatrices(z, _elapsed, step);
      z.matrixInit = true;
      anyMatrixUpdated = true;
    }

    if (anyMatrixUpdated || deactivationDirty) {
      E.updateOverlayVisibilityAndCounts(highWater, hasBruteArmor, hasBio, hasRag, true);
    }
    if (colorDirty) E.markColorsDirty();
  }

  const Enemies = {
    get enemyRoot() { return E.enemyRoot; },
    init,
    reset,
    applyQualityTier,
    isUsingSkinnedRigs: () => (typeof E.isUsingSkinnedRigs === 'function' ? E.isUsingSkinnedRigs() : false),
    setOffsetZ: E.setOffsetZ,
    updateDepartingIdle,
    setWarmupMode: E.setWarmupMode,
    setDifficulty,
    getDifficulty,
    getDifficultyConfig,
    setAtmosphereMode,
    getAtmosphereMode,
    getDropRoll,
    spawnWave,
    spawnRoamers,
    spawnOneZombie,
    spawnSingle: spawnOneZombie,
    spawnLineup,
    emitSoundImpulse,
    update,
    raycastHit,
    hitZombie,
    applyBlast,
    alertAllTo,
    stunByHorn,
    applyHydrantKnockback,
    ejectFromTrain,
    getAliveCount,
    getWaveRemainingCount,
    getTotalCount,
    getKills: () => _totalKills,
    getSpawnedSpitterProjectiles,
    getActiveAcidPuddles,
    getDebugSummary
  };

  LRT.Enemies = Enemies;
})(window.LRT = window.LRT || {});
