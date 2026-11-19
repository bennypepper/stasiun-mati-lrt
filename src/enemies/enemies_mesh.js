(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const E = (I.enemies = I.enemies || {});

  const MAX_ENEMIES = 32;
  const MAX_BILE = 16;
  const MAX_BILE_CHUNKS = 32;
  const MAX_BILE_DROPS = 96;
  const MAX_PUDDLES = 24;
  const MAX_PUDDLE_BUBBLES = 48;
  const BILE_GRAVITY = 11.5;
  const BILE_HORIZ_SPEED = 8.4;
  const BILE_MAX_RANGE = 7.0;

  const FALLBACK_TYPES = {
    walker: { id: 'walker', label: 'Commuter Infected', hp: 70, speed: 1.95, damage: 10, attackRange: 1.75, attackCooldown: 1.25, scale: 1.0, armorMult: 1.0 },
    runner: { id: 'runner', label: 'Feral Sprinter', hp: 62, speed: 5.20, damage: 11, attackRange: 1.65, attackCooldown: 0.85, scale: 0.94, armorMult: 1.0 },
    brute: { id: 'brute', label: 'LRT Riot Brute', hp: 230, speed: 1.85, damage: 22, attackRange: 1.95, attackCooldown: 1.45, scale: 1.18, armorMult: 0.50 },
    spitter: { id: 'spitter', label: 'Toxic Hazmat', hp: 105, speed: 2.05, damage: 14, attackRange: 6.5, attackCooldown: 2.40, scale: 1.04, armorMult: 1.0, deathBlastRadius: 3.6, deathBlastDmg: 30 },
    screamer: { id: 'screamer', label: 'Cyst Screamer', hp: 75, speed: 3.45, damage: 12, attackRange: 1.65, attackCooldown: 1.0, scale: 0.96, armorMult: 1.0, screamRadius: 24.0, screamCooldown: 7.5 }
  };

  // Gritty, weather-stained Jakarta commuter garments (never neon plastic)
  const COMMUTER_SHIRT_COLORS = [
    0x9b8c74, // bloodied office beige
    0xb4b1a6, // dirty grey-white dress shirt
    0x45586d, // washed KAI / office navy
    0x7c5c42, // muddy batik ochre
    0x565a5e, // charcoal commuter jacket
    0x6d745a  // worn field shirt
  ];

  const SKIN_PALLOR_COLORS = [
    0x9c9a90, // cadaver ash
    0x8e9192, // cold livid slate
    0xa4968c, // drained pale clay
    0x8d9384  // sickly corpse olive-grey
  ];

  // Pre-allocated scratch math (ZERO per-frame heap allocations)
  const _v1 = new THREE.Vector3();
  const _vKnee = new THREE.Vector3();
  const _vJointLocal = new THREE.Vector3();
  const _pelvisPos = new THREE.Vector3();
  const _vHeadPos = new THREE.Vector3();
  const _q1 = new THREE.Quaternion();
  const _qTorso = new THREE.Quaternion();
  const _qHip = new THREE.Quaternion();
  const _qHead = new THREE.Quaternion();
  const _qUpper = new THREE.Quaternion();
  const _qLocal = new THREE.Quaternion();
  const _e1 = new THREE.Euler();
  const _m4 = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _scale = new THREE.Vector3();
  const _color = new THREE.Color();
  const _bileHitVec = new THREE.Vector3();
  const _bileNormal = new THREE.Vector3(0, 1, 0);
  const _bileDir = new THREE.Vector3();
  const _bileOrigin = new THREE.Vector3();
  const _fwdZ = new THREE.Vector3(0, 0, 1);
  const _upY = new THREE.Vector3(0, 1, 0);
  const _downY = new THREE.Vector3(0, -1, 0);
  const _zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  const BILE_COLORS = [0x7a901c, 0x8ea326, 0x657816, 0x9ab02e, 0x5c6d14];
  const DROP_COLORS = [0x7e941e, 0x99ad2c, 0x5d6d16, 0x4b4318, 0x869a22];
  const PUDDLE_COLORS = [0xdde6a8, 0xcbd88a, 0xe4ec9e, 0xc3d07e];


  E.MAX_ENEMIES = MAX_ENEMIES;
  E.MAX_BILE = MAX_BILE;
  E.MAX_BILE_CHUNKS = MAX_BILE_CHUNKS;
  E.MAX_BILE_DROPS = MAX_BILE_DROPS;
  E.MAX_PUDDLES = MAX_PUDDLES;
  E.MAX_PUDDLE_BUBBLES = MAX_PUDDLE_BUBBLES;
  E.BILE_GRAVITY = BILE_GRAVITY;
  E.BILE_HORIZ_SPEED = BILE_HORIZ_SPEED;
  E.BILE_MAX_RANGE = BILE_MAX_RANGE;
  E.FALLBACK_TYPES = FALLBACK_TYPES;
  E.COMMUTER_SHIRT_COLORS = COMMUTER_SHIRT_COLORS;
  E.SKIN_PALLOR_COLORS = SKIN_PALLOR_COLORS;
  E.BILE_COLORS = BILE_COLORS;
  E.DROP_COLORS = DROP_COLORS;
  E.PUDDLE_COLORS = PUDDLE_COLORS;

  E._v1 = _v1;
  E._v2 = new THREE.Vector3();
  E._v3 = new THREE.Vector3();
  E._vKnee = _vKnee;
  E._vJointLocal = _vJointLocal;
  E._pelvisPos = _pelvisPos;
  E._vHeadPos = _vHeadPos;
  E._q1 = _q1;
  E._qTorso = _qTorso;
  E._qHip = _qHip;
  E._qHead = _qHead;
  E._qUpper = _qUpper;
  E._qLocal = _qLocal;
  E._e1 = _e1;
  E._m4 = _m4;
  E._pos = _pos;
  E._scale = _scale;
  E._color = _color;
  E._bileHitVec = _bileHitVec;
  E._bileNormal = _bileNormal;
  E._bileDir = _bileDir;
  E._bileOrigin = _bileOrigin;
  E._fwdZ = _fwdZ;
  E._upY = _upY;
  E._downY = _downY;
  E._zeroMat = _zeroMat;
  E._axisX = new THREE.Vector3(1, 0, 0);
  E._axisY = new THREE.Vector3(0, 1, 0);
  E._axisZ = new THREE.Vector3(0, 0, 1);
  E._qRootInv = new THREE.Quaternion();
  E._qParentW = new THREE.Quaternion();
  E._qParentChar = new THREE.Quaternion();
  E._qParentCharInv = new THREE.Quaternion();
  E._qBoneChar = new THREE.Quaternion();
  E._qTargetChar = new THREE.Quaternion();
  E._qDelta = new THREE.Quaternion();
  E._vCurDir = new THREE.Vector3();
  E._vTgtDir = new THREE.Vector3();

  E._st = {
    _headMesh: null, _torsoMesh: null, _upperArmLMesh: null, _upperArmRMesh: null,
    _forearmLMesh: null, _forearmRMesh: null, _thighLMesh: null, _thighRMesh: null,
    _calfLMesh: null, _calfRMesh: null, _bruteArmorMesh: null, _bruteHelmetMesh: null,
    _spitterBioMesh: null, _spitterGearMesh: null, _spitterMaskMesh: null,
    _screamerRibMesh: null, _screamerJawMesh: null, _screamerCystMesh: null,
    _ragMesh: null, _headEyeAttr: null, _bileMesh: null, _bileChunkMesh: null,
    _bileDropMesh: null, _puddleMesh: null, _puddleBubbleMesh: null,
    _corePartMeshes: [], _overlayPartMeshes: [], _allPartMeshes: [],
    _useSkinnedRigs: false, _enemyCastShadow: true, _enemyReceiveShadow: true,
    _potatoMode: false, _rigPool: [],
    _spitterCystMat: null, _screamerCystMat: null, _runnerEyeMat: null, _cystGeo: null,
    _neckStumpMat: null, _neckBoneMat: null, _neckCollarGeo: null, _neckSpineGeo: null,
    _woundMat: null, _woundGeo: null, _armCollarGeo: null, _armBoneGeo: null,
    _legCollarGeo: null, _legBoneGeo: null,
    _bileDropCursor: 0, _puddleCursor: 0, _bubbleCursor: 0
  };

  E.camPos = new THREE.Vector3();
  E.camRight = new THREE.Vector3();
  E.camForward = new THREE.Vector3(0, 0, -1);
  E.scene = null;
  E.enemyRoot = null;
  E.initialized = false;
  E.zombies = [];
  E.pendingQueue = [];
  E.bileOrbs = [];
  E.bileDrops = [];
  E.bilePuddles = [];
  E.bileBubbles = [];
  E.activeHighWater = 0;
  E.warmupActive = false;

  E.isUsingSkinnedRigs = () => !!E._st._useSkinnedRigs;
  E.getEnemyCfg = getEnemyCfg;
  E.play3D = play3D;
  E.initZombiePool = initZombiePool;
  E.resetMeshes = resetMeshes;
  E.setOffsetZ = setOffsetZ;
  E.initMeshRoot = initMeshRoot;

  function getEnemyCfg(typeId) {
    if (LRT.Config && LRT.Config.ENEMY_TYPES && LRT.Config.ENEMY_TYPES[typeId]) {
      return LRT.Config.ENEMY_TYPES[typeId];
    }
    return FALLBACK_TYPES[typeId] || FALLBACK_TYPES.walker;
  }

  function play3D(key, pos, pitchVar, gain, extra) {
    if (!LRT.Audio || typeof LRT.Audio.play !== 'function') return;
    if (pos) {
      LRT.Audio.play(key, {
        pos,
        listenerPos: E.camPos,
        listenerRight: E.camRight,
        pitchVar: pitchVar !== undefined ? pitchVar : 0.12,
        gain: gain !== undefined ? gain : 0.9,
        rate: extra && typeof extra.rate === 'number' ? extra.rate : 1.0,
        refDist: extra && extra.refDist ? extra.refDist : 5.5,
        maxDist: extra && extra.maxDist ? extra.maxDist : 88.0
      });
    }
  }


  function initZombiePool() {
    E.zombies.length = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      E.zombies.push({
        id: i,
        active: false,
        dead: false,
        variant: 'walker',
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        yaw: 0,
        hp: 70, maxHp: 70,
        armorHp: 0, hasArmor: false,
        speed: 1.32,
        baseSpeed: 1.32,
        scale: 1.0,
        damage: 20,
        attackRange: 1.75,
        attackCooldown: 1.35,
        attackTimer: 0,
        spitTimer: 1.5,
        spitAnimTimer: 0,
        staggerTimer: 0,
        hitFlashTimer: 0,
        deathTimer: 0,
        fallAngle: 0,
        fallSign: 1,
        fallPitchSign: 1,
        decapitated: false,
        bloodPoolSpawned: false,
        neckSpurtCount: 0,
        headDmg: 0,
        armLDmg: 0,
        armRDmg: 0,
        legLDmg: 0,
        legRDmg: 0,
        lostLeftArm: false,
        lostRightArm: false,
        lostLeftLeg: false,
        lostRightLeg: false,
        crawling: false,
        crawlFallTimer: 0,
        crawlPhase: 0,
        crawlBloodDist: 0,
        crippledLeg: 1,
        woundMask: 0,
        legDmg: 0,
        legCrippled: false,
        hitZone: 'torso',
        hitSide: 0,
        hornVulnTimer: 0,
        animPhase: Math.random() * 6.28,
        moveBlend: 0,
        actualSpeed: 0,
        actualSpeedSmooth: 0,
        smoothSteerX: 0,
        smoothSteerZ: 0,
        seed: Math.random() * 100,
        limbBias: Math.random() > 0.5 ? 1 : -1,
        steerCommit: 0,
        steerDir: 1,
        blockedTime: 0,
        stuckTime: 0,
        progTimer: 0,
        lastProgX: 0,
        lastProgZ: 0,
        alertDelay: 0,
        navTimer: 0,
        wpX: 0, wpY: 0, wpZ: 0,
        hasNavWp: false,
        screamTimer: 0,
        shriekTimer: 0,
        buffTimer: 0,
        chargeWindup: 0,
        chargeTimer: 0,
        chargeCooldown: 0,
        chargeDirX: 0,
        chargeDirZ: 0,
        lureTimer: 0,
        lurePosX: 0,
        lurePosY: 0,
        lurePosZ: 0,
        isRoamer: false,
        aggroState: 'CHASE',
        aggroTimer: 0,
        chaseLoseTimer: 0,
        patrolOriginX: 0,
        patrolOriginZ: 0,
        patrolTargetX: 0,
        patrolTargetZ: 0,
        patrolWaitTimer: 0,
        lastKnownX: 0,
        lastKnownY: 0,
        lastKnownZ: 0,
        coarseDt: 0,
        matrixInit: false,
        groundedOnce: false,
        skinColor: new THREE.Color(),
        shirtColor: new THREE.Color(),
        pantsColor: new THREE.Color(),
        gearColor: new THREE.Color()
      });
    }

    E.bileOrbs.length = 0;
    for (let i = 0; i < MAX_BILE; i++) {
      E.bileOrbs.push({
        active: false,
        pos: new THREE.Vector3(),
        startPos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        dropAccum: 0,
        damage: 14,
        groundY: 0,
        spin: 0
      });
    }

    E.bileDrops.length = 0;
    for (let i = 0; i < MAX_BILE_DROPS; i++) {
      E.bileDrops.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.65,
        scale: 1.0,
        floorY: -1.05
      });
    }

    E.bilePuddles.length = 0;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      E.bilePuddles.push({
        active: false,
        pos: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 1, 0),
        radius: 1.35,
        life: 0,
        maxLife: 7.0,
        yaw: 0,
        aspect: 1.0,
        damageTickTimer: 0,
        bubbleAccum: 0
      });
    }

    E.bileBubbles.length = 0;
    for (let i = 0; i < MAX_PUDDLE_BUBBLES; i++) {
      E.bileBubbles.push({
        active: false,
        pos: new THREE.Vector3(),
        riseSpeed: 0.25,
        life: 0,
        maxLife: 0.65,
        maxScale: 1.0
      });
    }
    E._st._bileDropCursor = 0;
    E._st._puddleCursor = 0;
    E._st._bubbleCursor = 0;
  }


  function resetMeshes() {
    E.activeHighWater = 0;

    for (let i = 0; i < MAX_ENEMIES; i++) {
      E.zombies[i].active = false;
      E.zombies[i].dead = false;
      E.zombies[i].decapitated = false;
      E.zombies[i].bloodPoolSpawned = false;
      E.zombies[i].neckSpurtCount = 0;
      E.zombies[i].headDmg = 0;
      E.zombies[i].armLDmg = 0;
      E.zombies[i].armRDmg = 0;
      E.zombies[i].legLDmg = 0;
      E.zombies[i].legRDmg = 0;
      E.zombies[i].lostLeftArm = false;
      E.zombies[i].lostRightArm = false;
      E.zombies[i].lostLeftLeg = false;
      E.zombies[i].lostRightLeg = false;
      E.zombies[i].crawling = false;
      E.zombies[i].crawlFallTimer = 0;
      E.zombies[i].crawlPhase = 0;
      E.zombies[i].crawlBloodDist = 0;
      E.zombies[i].crippledLeg = 1;
      E.zombies[i].woundMask = 0;
      E.zombies[i].isRoamer = false;
      E.zombies[i].aggroState = 'CHASE';
      E.zombies[i].coarseDt = 0;
      E.zombies[i].matrixInit = false;
      E.zombies[i].groundedOnce = false;
      E.zombies[i].moveBlend = 0;
      E.zombies[i].actualSpeed = 0;
      E.zombies[i].actualSpeedSmooth = 0;
      E.zombies[i].smoothSteerX = 0;
      E.zombies[i].smoothSteerZ = 0;
      E.zombies[i].spitAnimTimer = 0;
      E.zombies[i]._lastAnimTime = undefined;
      E.zeroZombieMatrices(i);
    }
    for (let i = 0; i < MAX_BILE; i++) {
      E.bileOrbs[i].active = false;
      if (E._st._bileMesh) E._st._bileMesh.setMatrixAt(i, _zeroMat);
    }
    if (E._st._bileChunkMesh) {
      for (let i = 0; i < MAX_BILE_CHUNKS; i++) E._st._bileChunkMesh.setMatrixAt(i, _zeroMat);
      E._st._bileChunkMesh.visible = false;
      E._st._bileChunkMesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < MAX_BILE_DROPS; i++) {
      if (E.bileDrops[i]) E.bileDrops[i].active = false;
      if (E._st._bileDropMesh) E._st._bileDropMesh.setMatrixAt(i, _zeroMat);
    }
    for (let i = 0; i < MAX_PUDDLES; i++) {
      if (E.bilePuddles[i]) E.bilePuddles[i].active = false;
      if (E._st._puddleMesh) E._st._puddleMesh.setMatrixAt(i, _zeroMat);
    }
    for (let i = 0; i < MAX_PUDDLE_BUBBLES; i++) {
      if (E.bileBubbles[i]) E.bileBubbles[i].active = false;
      if (E._st._puddleBubbleMesh) E._st._puddleBubbleMesh.setMatrixAt(i, _zeroMat);
    }

    for (let m = 0; m < E._st._corePartMeshes.length; m++) {
      if (E._st._corePartMeshes[m]) {
        E._st._corePartMeshes[m].count = 0;
        E._st._corePartMeshes[m].instanceMatrix.needsUpdate = true;
      }
    }
    for (let m = 0; m < E._st._overlayPartMeshes.length; m++) {
      if (E._st._overlayPartMeshes[m]) {
        E._st._overlayPartMeshes[m].visible = E.warmupActive;
        E._st._overlayPartMeshes[m].count = 0;
        E._st._overlayPartMeshes[m].instanceMatrix.needsUpdate = true;
      }
    }
    if (E._st._bileMesh) {
      E._st._bileMesh.visible = false;
      E._st._bileMesh.instanceMatrix.needsUpdate = true;
    }
    if (E._st._bileDropMesh) {
      E._st._bileDropMesh.visible = false;
      E._st._bileDropMesh.instanceMatrix.needsUpdate = true;
    }
    if (E._st._puddleMesh) {
      E._st._puddleMesh.visible = false;
      E._st._puddleMesh.instanceMatrix.needsUpdate = true;
    }
    if (E._st._puddleBubbleMesh) {
      E._st._puddleBubbleMesh.visible = false;
      E._st._puddleBubbleMesh.instanceMatrix.needsUpdate = true;
    }
    if (E.enemyRoot) {
      E.enemyRoot.position.set(0, 0, 0);
      E.enemyRoot.updateMatrixWorld(true);
    }
  }

  function setOffsetZ(z) {
    const nextZ = Number.isFinite(z) ? z : 0;
    if (E.enemyRoot) {
      E.enemyRoot.position.z = nextZ;
      E.enemyRoot.updateMatrixWorld(true);
    }
  }


  function initMeshRoot(scene) {
    E.scene = scene;
    if (!E.initialized) {
      E.enemyRoot = new THREE.Group();
      E.enemyRoot.name = 'LRT_Enemies';
      scene.add(E.enemyRoot);
      initZombiePool();
      E.buildBileAndPuddleMeshes();

      const infectedGltf = (LRT.AssetLoader && typeof LRT.AssetLoader.getModelGltf === 'function')
        ? LRT.AssetLoader.getModelGltf('zombie_infected')
        : null;
      const commuterGltf = (LRT.AssetLoader && typeof LRT.AssetLoader.getModelGltf === 'function')
        ? LRT.AssetLoader.getModelGltf('zombie_commuter')
        : null;
      const soldierGltf = (LRT.AssetLoader && typeof LRT.AssetLoader.getModelGltf === 'function')
        ? LRT.AssetLoader.getModelGltf('zombie_soldier')
        : null;

      if (infectedGltf && infectedGltf.scene && soldierGltf && soldierGltf.scene) {
        E.buildSkinnedRigPool(infectedGltf, commuterGltf, soldierGltf);
      } else {
        E._st._useSkinnedRigs = false;
        E.buildZombieMeshes();
      }
      E.applyQualityTier();
      E.initialized = true;
    } else if (E.enemyRoot && E.enemyRoot.parent !== scene) {
      scene.add(E.enemyRoot);
    }
  }

})(window.LRT = window.LRT || {});
