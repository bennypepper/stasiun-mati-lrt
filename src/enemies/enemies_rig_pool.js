(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const E = (I.enemies = I.enemies || {});

  const MAX_ENEMIES = E.MAX_ENEMIES;
  const MAX_BILE = E.MAX_BILE;
  const MAX_BILE_CHUNKS = E.MAX_BILE_CHUNKS;
  const MAX_BILE_DROPS = E.MAX_BILE_DROPS;
  const MAX_PUDDLES = E.MAX_PUDDLES;
  const MAX_PUDDLE_BUBBLES = E.MAX_PUDDLE_BUBBLES;
  const BILE_GRAVITY = E.BILE_GRAVITY;
  const BILE_HORIZ_SPEED = E.BILE_HORIZ_SPEED;
  const BILE_MAX_RANGE = E.BILE_MAX_RANGE;
  const FALLBACK_TYPES = E.FALLBACK_TYPES;
  const COMMUTER_SHIRT_COLORS = E.COMMUTER_SHIRT_COLORS;
  const SKIN_PALLOR_COLORS = E.SKIN_PALLOR_COLORS;
  const BILE_COLORS = E.BILE_COLORS;
  const DROP_COLORS = E.DROP_COLORS;
  const PUDDLE_COLORS = E.PUDDLE_COLORS;

  const _v1 = E._v1;
  const _v2 = E._v2;
  const _v3 = E._v3;
  const _vKnee = E._vKnee;
  const _vJointLocal = E._vJointLocal;
  const _pelvisPos = E._pelvisPos;
  const _vHeadPos = E._vHeadPos;
  const _q1 = E._q1;
  const _qTorso = E._qTorso;
  const _qHip = E._qHip;
  const _qHead = E._qHead;
  const _qUpper = E._qUpper;
  const _qLocal = E._qLocal;
  const _e1 = E._e1;
  const _m4 = E._m4;
  const _pos = E._pos;
  const _scale = E._scale;
  const _color = E._color;
  const _bileHitVec = E._bileHitVec;
  const _bileNormal = E._bileNormal;
  const _bileDir = E._bileDir;
  const _bileOrigin = E._bileOrigin;
  const _fwdZ = E._fwdZ;
  const _upY = E._upY;
  const _downY = E._downY;
  const _zeroMat = E._zeroMat;
  const _axisX = E._axisX;
  const _axisY = E._axisY;
  const _axisZ = E._axisZ;
  const _qRootInv = E._qRootInv;
  const _qParentW = E._qParentW;
  const _qParentChar = E._qParentChar;
  const _qParentCharInv = E._qParentCharInv;
  const _qBoneChar = E._qBoneChar;
  const _qTargetChar = E._qTargetChar;
  const _qDelta = E._qDelta;
  const _vCurDir = E._vCurDir;
  const _vTgtDir = E._vTgtDir;

  function mapClonedHierarchy(src, dst, map) {
    map.set(src, dst);
    const len = Math.min(src.children.length, dst.children.length);
    for (let i = 0; i < len; i++) {
      mapClonedHierarchy(src.children[i], dst.children[i], map);
    }
  }

  function cloneSkinnedGltf(gltf, kind) {
    if (!gltf || !gltf.scene) return null;
    const isSoldier = (kind === 'soldier');
    const root = gltf.scene.clone(true);
    const srcToDst = new Map();
    mapClonedHierarchy(gltf.scene, root, srcToDst);

    const nodesByName = new Map();
    root.traverse((node) => {
      if (node.name && !nodesByName.has(node.name)) {
        nodesByName.set(node.name, node);
      }
    });

    const sourceSkinned = [];
    gltf.scene.traverse((src) => {
      if (src.isSkinnedMesh) sourceSkinned.push(src);
    });

    const clonedSkinned = [];
    const materials = [];
    const matCache = new Map();
    let visorMesh = null;

    for (let i = 0; i < sourceSkinned.length; i++) {
      const srcSm = sourceSkinned[i];
      const sm = srcToDst.get(srcSm);
      if (!sm || !sm.isSkinnedMesh) continue;

      if (sm.geometry) {
        if (!sm.geometry.boundingSphere) {
          sm.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3.2);
        } else if (sm.geometry.boundingSphere.radius < 3.2) {
          sm.geometry.boundingSphere.center.set(0, 0.9, 0);
          sm.geometry.boundingSphere.radius = 3.2;
        }
      }
      sm.frustumCulled = true;
      sm.castShadow = E._st._enemyCastShadow;
      sm.receiveShadow = E._st._enemyReceiveShadow;
      if (isSoldier && (sm.name || '').toLowerCase().includes('visor')) {
        visorMesh = sm;
      }

      const cloneMat = (m) => {
        if (!m) return m;
        if (!matCache.has(m)) {
          const cm = m.clone();
          const mName = (cm.name || '').toLowerCase();
          const isVisor = isSoldier && (sm === visorMesh || mName.includes('visor'));
          const isPants = mName.includes('pants');
          const isSkin = mName.includes('skin');
          if ('envMapIntensity' in cm) cm.envMapIntensity = isVisor ? 0.95 : 0.72;
          if (!isVisor && typeof cm.roughness === 'number') {
            cm.roughness = Math.max(isSoldier ? 0.62 : 0.78, cm.roughness);
          }
          if (isVisor && typeof cm.roughness === 'number') {
            cm.roughness = 0.16;
            cm.metalness = 0.45;
          }
          matCache.set(m, cm);
          materials.push({
            mat: cm,
            isVisor,
            isPants,
            isSkin,
            baseColor: cm.color ? cm.color.clone() : new THREE.Color(0xffffff),
            baseEmissive: cm.emissive ? cm.emissive.clone() : new THREE.Color(0x000000),
            baseEmissiveIntensity: cm.emissiveIntensity !== undefined ? cm.emissiveIntensity : 1.0
          });
        }
        return matCache.get(m);
      };

      if (Array.isArray(sm.material)) {
        sm.material = sm.material.map(cloneMat);
      } else if (sm.material) {
        sm.material = cloneMat(sm.material);
      }

      if (srcSm.skeleton) {
        const origBones = srcSm.skeleton.bones;
        const newBones = new Array(origBones.length);
        for (let b = 0; b < origBones.length; b++) {
          const origBone = origBones[b];
          newBones[b] = srcToDst.get(origBone) || nodesByName.get(origBone.name) || origBone;
        }
        const newSkeleton = new THREE.Skeleton(newBones, srcSm.skeleton.boneInverses);
        sm.bind(newSkeleton, sm.bindMatrix);
      }

      clonedSkinned.push(sm);
    }

    return { root, nodesByName, skinnedMeshes: clonedSkinned, materials, visorMesh };
  }

  function findClipCaseInsensitive(animations, name) {
    if (!animations || !animations.length) return null;
    const exact = THREE.AnimationClip.findByName(animations, name);
    if (exact) return exact;
    const low = name.toLowerCase();
    for (let i = 0; i < animations.length; i++) {
      if ((animations[i].name || '').toLowerCase() === low) return animations[i];
    }
    return null;
  }

  function createRigEntry(gltf, kind) {
    const isSoldier = (kind === 'soldier');
    const cloned = cloneSkinnedGltf(gltf, kind);
    if (!cloned) return null;

    const mixer = new THREE.AnimationMixer(cloned.root);
    const anims = gltf.animations || [];
    const idleClip = findClipCaseInsensitive(anims, 'Idle') || anims[0] || null;
    const walkClip = findClipCaseInsensitive(anims, 'Walk') || idleClip;
    const runClip = findClipCaseInsensitive(anims, 'Run') || walkClip;
    const zombieWalkClip = findClipCaseInsensitive(anims, 'ZombieWalk')
      || findClipCaseInsensitive(anims, 'ANIMATION ZOMBIE')
      || walkClip;

    const setupAction = (clip, initialWeight) => {
      if (!clip) return null;
      const act = mixer.clipAction(clip);
      act.setLoop(THREE.LoopRepeat, Infinity);
      act.enabled = true;
      act.setEffectiveWeight(initialWeight);
      act.play();
      return act;
    };

    const actions = {
      idle: setupAction(idleClip, 1),
      walk: setupAction(walkClip, 0),
      run: setupAction(runClip, 0),
      zombieWalk: (zombieWalkClip && zombieWalkClip !== walkClip) ? setupAction(zombieWalkClip, 0) : null
    };
    if (!actions.zombieWalk) {
      actions.zombieWalk = actions.walk;
    }

    const findBone = (shortName) => {
      return cloned.nodesByName.get('mixamorig:' + shortName)
        || cloned.nodesByName.get('mixamorig' + shortName)
        || cloned.nodesByName.get(shortName)
        || null;
    };

    const bones = {
      hips: findBone('Hips'),
      spine: findBone('Spine'),
      spine1: findBone('Spine1'),
      spine2: findBone('Spine2'),
      neck: findBone('Neck'),
      head: findBone('Head'),
      leftArm: findBone('LeftArm'),
      leftForeArm: findBone('LeftForeArm'),
      rightArm: findBone('RightArm'),
      rightForeArm: findBone('RightForeArm'),
      leftUpLeg: findBone('LeftUpLeg'),
      leftLeg: findBone('LeftLeg'),
      leftFoot: findBone('LeftFoot'),
      rightUpLeg: findBone('RightUpLeg'),
      rightLeg: findBone('RightLeg'),
      rightFoot: findBone('RightFoot')
    };

    // Attach 3D bloody neck-stump gore cap for lethal headshot decapitations
    let neckStumpNode = null;
    if (bones.neck) {
      if (!E._st._cystGeo) E._st._cystGeo = new THREE.SphereGeometry(1.0, 8, 6);
      if (!E._st._neckStumpMat) {
        E._st._neckStumpMat = new THREE.MeshStandardMaterial({
          color: 0x4a0407,
          emissive: new THREE.Color(0x1a0102),
          roughness: 0.22,
          metalness: 0.05
        });
      }
      if (!E._st._neckBoneMat) {
        E._st._neckBoneMat = new THREE.MeshStandardMaterial({
          color: 0xd8cfc2,
          roughness: 0.55,
          metalness: 0.02
        });
      }
      if (!E._st._neckCollarGeo) E._st._neckCollarGeo = new THREE.CylinderGeometry(0.058, 0.068, 0.065, 10);
      if (!E._st._neckSpineGeo) E._st._neckSpineGeo = new THREE.CylinderGeometry(0.017, 0.019, 0.032, 8);

      cloned.root.updateMatrixWorld(true);
      bones.neck.getWorldScale(_v1);
      const nInvS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;

      neckStumpNode = new THREE.Group();
      neckStumpNode.visible = false;

      const collar = new THREE.Mesh(E._st._neckCollarGeo, E._st._neckStumpMat);
      collar.position.set(0, 0.045 * nInvS, 0);
      collar.scale.setScalar(nInvS);
      collar.castShadow = false;
      collar.receiveShadow = false;
      neckStumpNode.add(collar);

      const spineDisc = new THREE.Mesh(E._st._neckSpineGeo, E._st._neckBoneMat);
      spineDisc.position.set(0, 0.072 * nInvS, -0.012 * nInvS);
      spineDisc.scale.setScalar(nInvS);
      spineDisc.castShadow = false;
      spineDisc.receiveShadow = false;
      neckStumpNode.add(spineDisc);

      // 4 irregular crimson flesh/clot lobes around the severed rim
      const clotOffsets = [
        { x: -0.042, y: 0.066, z:  0.022, sx: 0.024, sy: 0.018, sz: 0.022 },
        { x:  0.040, y: 0.068, z:  0.018, sx: 0.022, sy: 0.020, sz: 0.024 },
        { x: -0.025, y: 0.065, z: -0.038, sx: 0.026, sy: 0.019, sz: 0.020 },
        { x:  0.032, y: 0.070, z: -0.034, sx: 0.021, sy: 0.022, sz: 0.023 }
      ];
      for (let i = 0; i < clotOffsets.length; i++) {
        const cl = clotOffsets[i];
        const m = new THREE.Mesh(E._st._cystGeo, E._st._neckStumpMat);
        m.position.set(cl.x * nInvS, cl.y * nInvS, cl.z * nInvS);
        m.scale.set(cl.sx * nInvS, cl.sy * nInvS, cl.sz * nInvS);
        m.castShadow = false;
        m.receiveShadow = false;
        neckStumpNode.add(m);
      }
      bones.neck.add(neckStumpNode);
    }

    // Attach 3D bloody arm stumps (at elbows) & 6 bullet wound hole patches on torso/arms/legs
    if (!E._st._cystGeo) E._st._cystGeo = new THREE.SphereGeometry(1.0, 8, 6);
    if (!E._st._neckStumpMat) {
      E._st._neckStumpMat = new THREE.MeshStandardMaterial({
        color: 0x4a0407,
        emissive: new THREE.Color(0x1a0102),
        roughness: 0.22,
        metalness: 0.05
      });
    }
    if (!E._st._neckBoneMat) {
      E._st._neckBoneMat = new THREE.MeshStandardMaterial({
        color: 0xd8cfc2,
        roughness: 0.55,
        metalness: 0.02
      });
    }
    if (!E._st._woundMat) {
      E._st._woundMat = new THREE.MeshStandardMaterial({
        color: 0x3b0204,
        emissive: new THREE.Color(0x180102),
        roughness: 0.18,
        metalness: 0.04
      });
    }
    if (!E._st._woundGeo) E._st._woundGeo = new THREE.CylinderGeometry(0.036, 0.044, 0.016, 8);
    if (!E._st._armCollarGeo) E._st._armCollarGeo = new THREE.CylinderGeometry(0.038, 0.048, 0.056, 9);
    if (!E._st._armBoneGeo) E._st._armBoneGeo = new THREE.CylinderGeometry(0.013, 0.015, 0.042, 7);
    if (!E._st._legCollarGeo) E._st._legCollarGeo = new THREE.CylinderGeometry(0.056, 0.066, 0.078, 10);
    if (!E._st._legBoneGeo) E._st._legBoneGeo = new THREE.CylinderGeometry(0.018, 0.021, 0.046, 8);

    const buildArmStump = (upperArmBone) => {
      if (!upperArmBone) return null;
      upperArmBone.getWorldScale(_v1);
      const aInvS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;
      const grp = new THREE.Group();
      grp.visible = false;
      const collar = new THREE.Mesh(E._st._armCollarGeo, E._st._neckStumpMat);
      collar.position.set(0, 0.222 * aInvS, 0);
      collar.scale.setScalar(aInvS);
      collar.castShadow = false;
      grp.add(collar);
      const boneTip = new THREE.Mesh(E._st._armBoneGeo, E._st._neckBoneMat);
      boneTip.position.set(0, 0.252 * aInvS, 0);
      boneTip.scale.setScalar(aInvS);
      boneTip.castShadow = false;
      grp.add(boneTip);
      for (let c = 0; c < 4; c++) {
        const ang = (c / 4) * Math.PI * 2 + 0.3;
        const clot = new THREE.Mesh(E._st._cystGeo, E._st._neckStumpMat);
        clot.position.set(Math.cos(ang) * 0.030 * aInvS, 0.238 * aInvS, Math.sin(ang) * 0.030 * aInvS);
        clot.scale.set(0.020 * aInvS, 0.017 * aInvS, 0.020 * aInvS);
        clot.castShadow = false;
        grp.add(clot);
      }
      upperArmBone.add(grp);
      return grp;
    };

    const buildLegStump = (thighBone) => {
      if (!thighBone) return null;
      thighBone.getWorldScale(_v1);
      const lInvS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;
      const distalY = (kind === 'commuter' || kind === 'soldier') ? 0.398 : 0.442;
      const grp = new THREE.Group();
      grp.visible = false;
      const collar = new THREE.Mesh(E._st._legCollarGeo, E._st._neckStumpMat);
      collar.position.set(0, (distalY - 0.016) * lInvS, 0);
      collar.scale.setScalar(lInvS);
      collar.castShadow = false;
      grp.add(collar);
      const boneTip = new THREE.Mesh(E._st._legBoneGeo, E._st._neckBoneMat);
      boneTip.position.set(0, (distalY + 0.026) * lInvS, 0);
      boneTip.scale.setScalar(lInvS);
      boneTip.castShadow = false;
      grp.add(boneTip);
      for (let c = 0; c < 5; c++) {
        const ang = (c / 5) * Math.PI * 2;
        const clot = new THREE.Mesh(E._st._cystGeo, E._st._neckStumpMat);
        clot.position.set(Math.cos(ang) * 0.044 * lInvS, (distalY + 0.004) * lInvS, Math.sin(ang) * 0.044 * lInvS);
        clot.scale.set(0.026 * lInvS, 0.020 * lInvS, 0.026 * lInvS);
        clot.castShadow = false;
        grp.add(clot);
      }
      thighBone.add(grp);
      return grp;
    };

    cloned.root.updateMatrixWorld(true);
    const armStumpL = buildArmStump(bones.leftArm);
    const armStumpR = buildArmStump(bones.rightArm);
    const legStumpL = buildLegStump(bones.leftUpLeg);
    const legStumpR = buildLegStump(bones.rightUpLeg);

    const addWoundPatch = (parentBone, lx, ly, lz, scaleMul) => {
      if (!parentBone) return null;
      parentBone.getWorldScale(_v1);
      const wInvS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;
      const grp = new THREE.Group();
      grp.visible = false;
      const disc = new THREE.Mesh(E._st._woundGeo, E._st._woundMat);
      disc.position.set(lx * wInvS, ly * wInvS, lz * wInvS);
      disc.rotation.x = Math.PI * 0.5;
      disc.scale.setScalar(wInvS * (scaleMul || 1.0));
      disc.castShadow = false;
      grp.add(disc);
      const clot = new THREE.Mesh(E._st._cystGeo, E._st._neckStumpMat);
      clot.position.set(lx * wInvS, ly * wInvS, (lz + 0.006) * wInvS);
      clot.scale.set(0.022 * wInvS * (scaleMul || 1.0), 0.022 * wInvS * (scaleMul || 1.0), 0.010 * wInvS);
      clot.castShadow = false;
      grp.add(clot);
      parentBone.add(grp);
      return grp;
    };

    const woundNodes = [
      addWoundPatch(bones.spine2, -0.04, 0.05, 0.125, 1.15),
      addWoundPatch(bones.spine1,  0.05, 0.03, 0.125, 1.10),
      addWoundPatch(bones.leftArm,  0.0, 0.13, 0.052, 0.85),
      addWoundPatch(bones.rightArm, 0.0, 0.13, 0.052, 0.85),
      addWoundPatch(bones.leftUpLeg,  0.0, 0.18, 0.074, 0.95),
      addWoundPatch(bones.rightUpLeg, 0.0, 0.18, 0.074, 0.95)
    ];

    // Attach bone-mounted bioluminescent cysts, glowing feral eyes, and Brimob Riot Police armor for soldier/brute
    let spitterNodes = null;
    let screamerNodes = null;
    let runnerEyes = null;
    let riotArmorGroup = null;
    let riotHelmetGroup = null;
    let riotLimbGuards = null;
    let riotVisorNode = cloned.visorMesh || null;

    if (!E._st._runnerEyeMat) {
      E._st._runnerEyeMat = new THREE.MeshStandardMaterial({
        color: 0xff5a18,
        emissive: new THREE.Color(0xff3408),
        emissiveIntensity: 2.8,
        roughness: 0.18,
        metalness: 0.0
      });
    }

    const addCystCluster = (parentBone, mat, specs) => {
      if (!parentBone) return null;
      parentBone.getWorldScale(_v1);
      const invS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;
      const grp = new THREE.Group();
      grp.visible = false;
      for (let i = 0; i < specs.length; i++) {
        const sp = specs[i];
        const m = new THREE.Mesh(E._st._cystGeo, mat);
        m.position.set(sp.x * invS, sp.y * invS, sp.z * invS);
        m.scale.set(sp.sx * invS, sp.sy * invS, sp.sz * invS);
        m.castShadow = false;
        m.receiveShadow = false;
        grp.add(m);
      }
      parentBone.add(grp);
      return grp;
    };

    // Infected, commuter, and Riot Police soldier all share the realistic humanoid zombie facial geometry
    const eyeZ = 0.132;
    const eyeY = 0.080;
    const eyeX = 0.032;
    runnerEyes = addCystCluster(bones.head, E._st._runnerEyeMat, [
      { x: -eyeX, y: eyeY, z: eyeZ, sx: 0.0085, sy: 0.0065, sz: 0.0065 },
      { x:  eyeX, y: eyeY, z: eyeZ, sx: 0.0085, sy: 0.0065, sz: 0.0065 }
    ]);

    if (isSoldier) {
      // Shared Brimob Riot Police materials & procedural POLISI stencil badge texture
      if (!E._st._riotArmorMat) {
        E._st._riotArmorMat = new THREE.MeshStandardMaterial({
          color: 0x161d28,
          roughness: 0.62,
          metalness: 0.18
        });
        E._st._riotPlateMat = new THREE.MeshStandardMaterial({
          color: 0x202938,
          roughness: 0.48,
          metalness: 0.32
        });
        E._st._riotVisorMat = new THREE.MeshStandardMaterial({
          color: 0x101822,
          emissive: new THREE.Color(0x060b12),
          roughness: 0.14,
          metalness: 0.55,
          transparent: true,
          opacity: 0.76
        });
        let badgeTex = null;
        if (typeof document !== 'undefined') {
          const c = document.createElement('canvas');
          c.width = 256;
          c.height = 128;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#18202c';
            ctx.fillRect(0, 0, 256, 128);
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 4;
            ctx.strokeRect(8, 8, 240, 112);
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 46px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('POLISI', 128, 48);
            ctx.fillStyle = '#eab308';
            ctx.font = 'bold 26px sans-serif';
            ctx.fillText('BRIMOB', 128, 92);
            // Blood smear across stencil
            ctx.fillStyle = 'rgba(78, 8, 10, 0.52)';
            ctx.beginPath();
            ctx.arc(185, 62, 36, 0, Math.PI * 2);
            ctx.fill();
            badgeTex = new THREE.CanvasTexture(c);
            if (THREE.SRGBColorSpace) badgeTex.colorSpace = THREE.SRGBColorSpace;
          }
        }
        E._st._riotBadgeMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: badgeTex,
          roughness: 0.68,
          metalness: 0.10
        });
      }

      const addArmorBox = (parentGrp, invS, mat, w, h, d, x, y, z, rx, ry, rz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x * invS, y * invS, z * invS);
        if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
        m.scale.setScalar(invS);
        m.castShadow = false;
        m.receiveShadow = false;
        parentGrp.add(m);
        return m;
      };

      // Shared rounded geometry cache (unit shapes scaled per piece) so 48 rigs reuse the same buffers
      const RG = (E._st._riotGeo = E._st._riotGeo || {});
      if (!RG.sphere) {
        RG.sphere = new THREE.SphereGeometry(1, 14, 10);
        RG.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false);
        RG.shin = new THREE.CylinderGeometry(0.075, 0.062, 0.27, 16, 1, true, -1.75, 3.5);
        RG.collar = new THREE.TorusGeometry(0.072, 0.024, 8, 18);
        RG.ring = new THREE.TorusGeometry(0.050, 0.008, 6, 14);
      }
      if (!E._st._riotShellMat) {
        E._st._riotShellMat = E._st._riotPlateMat.clone();
        E._st._riotShellMat.side = THREE.DoubleSide;
      }
      const addShape = (parentGrp, invS, mat, geo, x, y, z, sx, sy, sz, rx, ry, rz) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x * invS, y * invS, z * invS);
        if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
        m.scale.set(sx * invS, sy * invS, sz * invS);
        m.castShadow = false;
        m.receiveShadow = false;
        parentGrp.add(m);
        return m;
      };

      // 1. PASGT Riot Police Helmet + "POLISI" front patch + cracked polycarbonate riot visor on Head bone
      // (Leaves zombie face & snarling jaw visible beneath the visor; collapses automatically on decapitation!)
      if (bones.head) {
        bones.head.getWorldScale(_v1);
        const hInvS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;
        riotHelmetGroup = new THREE.Group();
        const domeGeo = new THREE.SphereGeometry(0.128, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
        const dome = new THREE.Mesh(domeGeo, E._st._riotShellMat);
        dome.position.set(0, 0.092 * hInvS, -0.008 * hInvS);
        dome.scale.set(0.96 * hInvS, 1.02 * hInvS, 1.08 * hInvS);
        dome.castShadow = false;
        riotHelmetGroup.add(dome);
        // Helmet brim ridge, rounded ear covers and flared rear nape guard
        addShape(riotHelmetGroup, hInvS, E._st._riotArmorMat, RG.cyl, 0, 0.098, -0.006, 0.250, 0.016, 0.268);
        addShape(riotHelmetGroup, hInvS, E._st._riotArmorMat, RG.sphere, -0.110, 0.066, -0.012, 0.020, 0.052, 0.062, 0, 0, 0.12);
        addShape(riotHelmetGroup, hInvS, E._st._riotArmorMat, RG.sphere, 0.110, 0.066, -0.012, 0.020, 0.052, 0.062, 0, 0, -0.12);
        addShape(riotHelmetGroup, hInvS, E._st._riotArmorMat, RG.sphere, 0, 0.050, -0.114, 0.098, 0.050, 0.020, 0.20, 0, 0);
        // Front brow plate + POLISI patch
        addShape(riotHelmetGroup, hInvS, E._st._riotPlateMat, RG.sphere, 0, 0.136, 0.112, 0.074, 0.022, 0.016, -0.12, 0, 0);
        addArmorBox(riotHelmetGroup, hInvS, E._st._riotBadgeMat, 0.088, 0.036, 0.006, 0.0, 0.160, 0.122, -0.18, 0, 0);

        // Detachable curved Riot Visor across upper face (shatters off when armor breaks!)
        const vGrp = new THREE.Group();
        const visorGeo = new THREE.CylinderGeometry(0.118, 0.112, 0.082, 18, 1, true, -1.25, 2.5);
        const visor = new THREE.Mesh(visorGeo, E._st._riotVisorMat);
        visor.material = E._st._riotVisorMat;
        visor.position.set(0, 0.086 * hInvS, 0.010 * hInvS);
        visor.scale.set(hInvS, hInvS, hInvS);
        vGrp.add(visor);
        riotHelmetGroup.add(vGrp);
        riotVisorNode = vGrp;
        bones.head.add(riotHelmetGroup);
      }

      // 2. Heavy Brimob MOLLE Ballistic Plate Carrier + POLISI / BRIMOB chest patch + pouches + radio on Spine2
      if (bones.spine2) {
        bones.spine2.getWorldScale(_v1);
        const sInvS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;
        riotArmorGroup = new THREE.Group();
        // Torso-hugging oval carrier + contoured front/back ceramic plates
        addShape(riotArmorGroup, sInvS, E._st._riotArmorMat, RG.cyl, 0, 0.045, 0.004, 0.350, 0.340, 0.262);
        addShape(riotArmorGroup, sInvS, E._st._riotPlateMat, RG.sphere, 0, 0.058, 0.108, 0.120, 0.135, 0.040, -0.04, 0, 0);
        addShape(riotArmorGroup, sInvS, E._st._riotPlateMat, RG.sphere, 0, 0.058, -0.104, 0.118, 0.135, 0.038, 0.04, 0, 0);
        // "POLISI / BRIMOB" identification patches
        addArmorBox(riotArmorGroup, sInvS, E._st._riotBadgeMat, 0.170, 0.082, 0.006, 0, 0.118, 0.145, -0.05, 0, 0);
        addArmorBox(riotArmorGroup, sInvS, E._st._riotBadgeMat, 0.190, 0.090, 0.006, 0, 0.116, -0.138, 0.04, Math.PI, 0);
        // Padded shoulder straps + throat collar
        addShape(riotArmorGroup, sInvS, E._st._riotPlateMat, RG.sphere, -0.112, 0.208, 0.004, 0.044, 0.030, 0.118, 0, 0, 0.22);
        addShape(riotArmorGroup, sInvS, E._st._riotPlateMat, RG.sphere, 0.112, 0.208, 0.004, 0.044, 0.030, 0.118, 0, 0, -0.22);
        addShape(riotArmorGroup, sInvS, E._st._riotArmorMat, RG.collar, 0, 0.232, 0.0, 1.0, 1.0, 1.0, Math.PI * 0.5, 0, 0);
        // 3 mag pouches + HT radio + whip antenna
        for (let p = -1; p <= 1; p++) {
          addShape(riotArmorGroup, sInvS, E._st._riotArmorMat, RG.cyl, p * 0.080, -0.026, 0.150, 0.068, 0.108, 0.040);
        }
        addShape(riotArmorGroup, sInvS, E._st._riotPlateMat, RG.sphere, -0.118, 0.172, 0.126, 0.026, 0.050, 0.020);
        addShape(riotArmorGroup, sInvS, E._st._riotArmorMat, RG.cyl, -0.130, 0.262, 0.126, 0.007, 0.150, 0.007);
        // Zombie gore: coagulated blood clots & ballistic trauma
        for (let c = 0; c < 3; c++) {
          const cl = new THREE.Mesh(E._st._cystGeo, E._st._neckStumpMat);
          cl.position.set((-0.06 + c * 0.055) * sInvS, (0.04 + (c & 1) * 0.05) * sInvS, 0.150 * sInvS);
          cl.scale.set(0.045 * sInvS, 0.038 * sInvS, 0.016 * sInvS);
          cl.castShadow = false;
          riotArmorGroup.add(cl);
        }
        bones.spine2.add(riotArmorGroup);
      }

      // 3. Rounded pauldrons, forearm bracers and shin/knee guards on bones (sever together with limbs;
      //    they also shatter off with the vest when the Brute's armor breaks)
      riotLimbGuards = [];
      const attachGuard = (bone, build) => {
        if (!bone) return;
        bone.getWorldScale(_v1);
        const bInvS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;
        const g = new THREE.Group();
        build(g, bInvS);
        bone.add(g);
        riotLimbGuards.push(g);
      };
      const pauldron = (g, k) => {
        addShape(g, k, E._st._riotPlateMat, RG.sphere, 0, 0.070, 0, 0.074, 0.098, 0.076);
        addShape(g, k, E._st._riotArmorMat, RG.ring, 0, 0.150, 0, 1.0, 1.0, 1.0, Math.PI * 0.5, 0, 0);
      };
      const bracer = (g, k) => {
        addShape(g, k, E._st._riotPlateMat, RG.cyl, 0, 0.115, 0, 0.100, 0.175, 0.098);
        addShape(g, k, E._st._riotArmorMat, RG.ring, 0, 0.032, 0, 1.0, 1.0, 1.0, Math.PI * 0.5, 0, 0);
        addShape(g, k, E._st._riotArmorMat, RG.ring, 0, 0.198, 0, 0.92, 0.92, 0.92, Math.PI * 0.5, 0, 0);
      };
      const shinGuard = (g, k) => {
        const shell = new THREE.Mesh(RG.shin, E._st._riotShellMat);
        shell.position.set(0, 0.180 * k, 0.012 * k);
        shell.scale.set(k, k, k);
        shell.castShadow = false;
        g.add(shell);
        addShape(g, k, E._st._riotPlateMat, RG.sphere, 0, 0.016, 0.042, 0.074, 0.058, 0.060);
        addShape(g, k, E._st._riotArmorMat, RG.ring, 0, 0.300, 0, 1.30, 1.30, 1.30, Math.PI * 0.5, 0, 0);
      };
      attachGuard(bones.leftArm, pauldron);
      attachGuard(bones.rightArm, pauldron);
      attachGuard(bones.leftForeArm, bracer);
      attachGuard(bones.rightForeArm, bracer);
      attachGuard(bones.leftLeg, shinGuard);
      attachGuard(bones.rightLeg, shinGuard);

      // Tactical duty belt, drop-leg holster & utility pouch on Hips
      if (bones.hips) {
        bones.hips.getWorldScale(_v1);
        const pInvS = _v1.y > 0.0005 ? (1.0 / _v1.y) : 100.0;
        const beltGrp = new THREE.Group();
        addShape(beltGrp, pInvS, E._st._riotArmorMat, RG.cyl, 0, 0.025, 0.004, 0.365, 0.062, 0.268);
        addShape(beltGrp, pInvS, E._st._riotPlateMat, RG.sphere, -0.190, -0.050, 0.022, 0.032, 0.072, 0.044);
        addShape(beltGrp, pInvS, E._st._riotPlateMat, RG.sphere, 0.186, 0.014, 0.026, 0.030, 0.046, 0.038);
        bones.hips.add(beltGrp);
      }
    } else {
      if (!E._st._spitterCystMat) {
        E._st._spitterCystMat = new THREE.MeshStandardMaterial({
          color: 0xa8e024,
          emissive: new THREE.Color(0x6da610),
          emissiveIntensity: 1.15,
          roughness: 0.24,
          metalness: 0.05
        });
      }
      if (!E._st._screamerCystMat) {
        E._st._screamerCystMat = new THREE.MeshStandardMaterial({
          color: 0xd92638,
          emissive: new THREE.Color(0x991422),
          emissiveIntensity: 1.25,
          roughness: 0.26,
          metalness: 0.05
        });
      }

      spitterNodes = [];
      const spChest = addCystCluster(bones.spine2, E._st._spitterCystMat, [
        { x: -0.085, y: 0.05, z: 0.115, sx: 0.048, sy: 0.042, sz: 0.036 },
        { x:  0.080, y: 0.02, z: 0.120, sx: 0.056, sy: 0.048, sz: 0.040 },
        { x: -0.095, y: 0.05, z: -0.122, sx: 0.065, sy: 0.060, sz: 0.052 },
        { x:  0.060, y: 0.08, z: -0.128, sx: 0.052, sy: 0.050, sz: 0.046 }
      ]);
      const spNeck = addCystCluster(bones.neck, E._st._spitterCystMat, [
        { x: -0.045, y: 0.025, z: 0.072, sx: 0.036, sy: 0.032, sz: 0.030 },
        { x:  0.048, y: 0.012, z: 0.068, sx: 0.038, sy: 0.034, sz: 0.032 }
      ]);
      const spHead = addCystCluster(bones.head, E._st._spitterCystMat, [
        { x: 0.055, y: 0.04, z: 0.085, sx: 0.030, sy: 0.026, sz: 0.026 }
      ]);
      if (spChest) spitterNodes.push(spChest);
      if (spNeck) spitterNodes.push(spNeck);
      if (spHead) spitterNodes.push(spHead);

      screamerNodes = [];
      const scNeck = addCystCluster(bones.neck, E._st._screamerCystMat, [
        { x: -0.040, y: 0.025, z: 0.070, sx: 0.038, sy: 0.034, sz: 0.032 },
        { x:  0.040, y: 0.020, z: 0.070, sx: 0.040, sy: 0.036, sz: 0.034 },
        { x:  0.000, y: 0.010, z: 0.078, sx: 0.034, sy: 0.030, sz: 0.030 }
      ]);
      const scSpine = addCystCluster(bones.spine1, E._st._screamerCystMat, [
        { x: -0.055, y: 0.04, z: 0.118, sx: 0.042, sy: 0.034, sz: 0.030 },
        { x:  0.055, y: 0.03, z: 0.118, sx: 0.042, sy: 0.034, sz: 0.030 }
      ]);
      if (scNeck) screamerNodes.push(scNeck);
      if (scSpine) screamerNodes.push(scSpine);
    }

    cloned.root.visible = false;

    return {
      kind,
      root: cloned.root,
      skinnedMeshes: cloned.skinnedMeshes,
      mixer,
      actions,
      bones,
      materials: cloned.materials,
      visorMesh: riotVisorNode,
      riotArmorGroup,
      riotHelmetGroup,
      riotLimbGuards,
      neckStumpNode,
      armStumpL,
      armStumpR,
      legStumpL,
      legStumpR,
      woundNodes,
      runnerEyes,
      spitterNodes,
      screamerNodes
    };
  }

  function buildSkinnedRigPool(infectedGltf, commuterGltf, soldierGltf) {
    E._st._rigPool.length = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const infected = createRigEntry(infectedGltf, 'infected');
      const commuter = (commuterGltf && commuterGltf.scene) ? createRigEntry(commuterGltf, 'commuter') : null;
      const soldier = createRigEntry(soldierGltf, 'soldier');
      E._st._rigPool.push({ infected, commuter, soldier });
    }
    E._st._useSkinnedRigs = true;
  }

  function getSlotRigForVariant(z, slot) {
    if (!slot) return null;
    if (z.variant === 'brute') return slot.soldier;
    if (z.variant === 'spitter') return slot.infected;
    if (z.variant === 'runner') return slot.commuter || slot.infected;
    if (z.variant === 'screamer') return slot.commuter || slot.infected;
    // Walker alternates cleanly between clothed urban commuter and torn-vest infected
    if ((z.id & 1) === 0 && slot.commuter) return slot.commuter;
    return slot.infected;
  }


  function resetRigAttachments(rig) {
    if (!rig || !rig.root) return;
    rig.root.visible = false;
    if (E.enemyRoot && rig.root.parent === E.enemyRoot) {
      E.enemyRoot.remove(rig.root);
    }
    if (rig.neckStumpNode) rig.neckStumpNode.visible = false;
    if (rig.armStumpL) rig.armStumpL.visible = false;
    if (rig.armStumpR) rig.armStumpR.visible = false;
    if (rig.legStumpL) rig.legStumpL.visible = false;
    if (rig.legStumpR) rig.legStumpR.visible = false;
    if (rig.woundNodes) {
      for (let k = 0; k < rig.woundNodes.length; k++) {
        if (rig.woundNodes[k]) rig.woundNodes[k].visible = false;
      }
    }
    if (rig.bones) {
      if (rig.bones.head) rig.bones.head.scale.set(1, 1, 1);
      if (rig.bones.leftForeArm) rig.bones.leftForeArm.scale.set(1, 1, 1);
      if (rig.bones.rightForeArm) rig.bones.rightForeArm.scale.set(1, 1, 1);
      if (rig.bones.leftLeg) rig.bones.leftLeg.scale.set(1, 1, 1);
      if (rig.bones.rightLeg) rig.bones.rightLeg.scale.set(1, 1, 1);
    }
  }


  function setWarmupMode(active) {
    E.warmupActive = !!active;
    if (E._st._useSkinnedRigs) {
      const slot0 = E._st._rigPool[0];
      if (slot0) {
        const z0 = E.zombies[0];
        const activeRig = (z0 && z0.active) ? E.getSlotRigForVariant(z0, slot0) : null;
        const rigs = [slot0.infected, slot0.commuter, slot0.soldier];
        for (let r = 0; r < rigs.length; r++) {
          const rig = rigs[r];
          if (!rig || !rig.root) continue;
          const shouldShow = E.warmupActive || (activeRig === rig);
          rig.root.visible = shouldShow;
          if (E.enemyRoot) {
            if (shouldShow && rig.root.parent !== E.enemyRoot) E.enemyRoot.add(rig.root);
            else if (!shouldShow && rig.root.parent === E.enemyRoot) E.enemyRoot.remove(rig.root);
          }
          if (E.warmupActive && (!z0 || !z0.active)) {
            rig.root.position.set(0, -100, 0);
          }
          if (shouldShow) {
            rig.root.updateMatrixWorld(true);
          }
          if (rig.runnerEyes) {
            rig.runnerEyes.visible = E.warmupActive || (activeRig === rig && !z0.dead && (z0.variant === 'runner' || z0.variant === 'screamer'));
          }
          if (rig.spitterNodes) {
            for (let i = 0; i < rig.spitterNodes.length; i++) {
              rig.spitterNodes[i].visible = E.warmupActive || (activeRig === rig && !z0.dead && z0.variant === 'spitter');
            }
          }
          if (rig.screamerNodes) {
            for (let i = 0; i < rig.screamerNodes.length; i++) {
              rig.screamerNodes[i].visible = E.warmupActive || (activeRig === rig && !z0.dead && z0.variant === 'screamer');
            }
          }
        }
      }
      return;
    }
    for (let i = 0; i < E._st._overlayPartMeshes.length; i++) {
      const m = E._st._overlayPartMeshes[i];
      if (m) {
        if (E.warmupActive) {
          m.visible = true;
          m.count = Math.max(1, E.activeHighWater);
        } else {
          m.visible = false;
          m.count = E.activeHighWater;
        }
      }
    }
  }


  function applyQualityTier(tier) {
    const t = tier || (LRT.Config && LRT.Config.QUALITY_TIERS && LRT.Core && LRT.Config.QUALITY_TIERS[LRT.Core.qualityKey]) || {};
    const qKey = (LRT.Core && LRT.Core.qualityKey) || '';
    E._st._enemyCastShadow = t.enemyCastShadow !== undefined ? !!t.enemyCastShadow : true;
    E._st._enemyReceiveShadow = (qKey === 'high') || (t.maxEnemies >= 32 && t.shadows !== false);
    E._st._potatoMode = (qKey === 'potato') || (t.maxEnemies !== undefined && t.maxEnemies <= 16);

    for (let i = 0; i < E._st._rigPool.length; i++) {
      const slot = E._st._rigPool[i];
      if (!slot) continue;
      const rigs = [slot.infected, slot.commuter, slot.soldier];
      for (let r = 0; r < rigs.length; r++) {
        const rig = rigs[r];
        if (!rig || !rig.skinnedMeshes) continue;
        for (let m = 0; m < rig.skinnedMeshes.length; m++) {
          const sm = rig.skinnedMeshes[m];
          if (sm) {
            sm.castShadow = E._st._enemyCastShadow;
            sm.receiveShadow = E._st._enemyReceiveShadow;
          }
        }
      }
    }
    for (let i = 0; i < E._st._allPartMeshes.length; i++) {
      const pm = E._st._allPartMeshes[i];
      if (pm) pm.castShadow = E._st._enemyCastShadow;
    }
  }

  E.isUsingSkinnedRigs = () => E._st._useSkinnedRigs;
  E.applyQualityTier = applyQualityTier;

  E.buildSkinnedRigPool = buildSkinnedRigPool;
  E.getSlotRigForVariant = getSlotRigForVariant;
  E.resetRigAttachments = resetRigAttachments;
  E.setWarmupMode = setWarmupMode;
  E.applyQualityTier = applyQualityTier;
})(window.LRT = window.LRT || {});
