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

  function applyCharSpaceDelta(bone, rootQuatInv, axisVec, angle) {
    if (!bone || !bone.parent || Math.abs(angle) < 1e-4) return;
    bone.parent.getWorldQuaternion(_qParentW);
    _qParentChar.copy(rootQuatInv).multiply(_qParentW);
    _qBoneChar.copy(_qParentChar).multiply(bone.quaternion);
    _qDelta.setFromAxisAngle(axisVec, angle);
    _qBoneChar.premultiply(_qDelta);
    _qParentCharInv.copy(_qParentChar).invert();
    bone.quaternion.copy(_qParentCharInv).multiply(_qBoneChar);
    bone.updateMatrixWorld(false);
  }

  function aimBoneInCharSpace(bone, rootQuatInv, targetX, targetY, targetZ, blendAlpha) {
    if (!bone || !bone.parent || blendAlpha <= 0.001) return;
    bone.parent.getWorldQuaternion(_qParentW);
    _qParentChar.copy(rootQuatInv).multiply(_qParentW);
    _qBoneChar.copy(_qParentChar).multiply(bone.quaternion);

    // In Mixamo skeletons, bone local +Y always runs down the bone length (shoulder->elbow, elbow->wrist)
    _vCurDir.set(0, 1, 0).applyQuaternion(_qBoneChar).normalize();
    _vTgtDir.set(targetX, targetY, targetZ).normalize();
    _qDelta.setFromUnitVectors(_vCurDir, _vTgtDir);
    _qTargetChar.copy(_qDelta).multiply(_qBoneChar);

    if (blendAlpha < 0.999) {
      _qBoneChar.slerp(_qTargetChar, blendAlpha);
    } else {
      _qBoneChar.copy(_qTargetChar);
    }
    _qParentCharInv.copy(_qParentChar).invert();
    bone.quaternion.copy(_qParentCharInv).multiply(_qBoneChar);
    bone.updateMatrixWorld(false);
  }

  function updateSkinnedZombie(z, timeSec, dt) {
    const idx = z.id;
    const slot = E._st._rigPool[idx];
    if (!slot) return;

    const rig = E.getSlotRigForVariant(z, slot);
    if (!rig || !rig.root) return;
    if (slot.infected && slot.infected !== rig && slot.infected.root) {
      slot.infected.root.visible = false;
      if (E.enemyRoot && slot.infected.root.parent === E.enemyRoot) E.enemyRoot.remove(slot.infected.root);
    }
    if (slot.commuter && slot.commuter !== rig && slot.commuter.root) {
      slot.commuter.root.visible = false;
      if (E.enemyRoot && slot.commuter.root.parent === E.enemyRoot) E.enemyRoot.remove(slot.commuter.root);
    }
    if (slot.soldier && slot.soldier !== rig && slot.soldier.root) {
      slot.soldier.root.visible = false;
      if (E.enemyRoot && slot.soldier.root.parent === E.enemyRoot) E.enemyRoot.remove(slot.soldier.root);
    }
    if (E.enemyRoot && rig.root.parent !== E.enemyRoot) {
      E.enemyRoot.add(rig.root);
    }

    const isBrute = (z.variant === 'brute');
    rig.root.visible = true;
    const sc = z.scale || 1.0;
    const animDt = (typeof dt === 'number' && dt >= 0)
      ? Math.min(0.20, dt)
      : Math.max(0.0, Math.min(0.05, timeSec - (z._lastAnimTime !== undefined ? z._lastAnimTime : timeSec)));
    z._lastAnimTime = timeSec;

    let sinkY = 0;
    let buckleT = 0;
    let layFlatT = 0;
    const isCrawling = (!z.dead && !!z.crawling);
    const crawlFallT = isCrawling ? Math.min(1.0, (z.crawlFallTimer || 0) / 0.42) : 0;
    const deadDir = z.crawling ? 1 : (z.fallPitchSign || z.fallSign || 1);
    let deadLiftY = 0;
    if (z.dead) {
      if (z.crawling) {
        const slumpT = Math.min(1.0, z.deathTimer / 0.25);
        layFlatT = 1.0;
        z.fallAngle = 1.44 + (Math.PI * 0.49 - 1.44) * slumpT;
        deadLiftY = (0.115 * (1.0 - slumpT) + 0.095 * slumpT) * sc;
      } else {
        buckleT = Math.min(1.0, z.deathTimer / 0.22);
        const raw2 = Math.max(0.0, Math.min(1.0, (z.deathTimer - 0.14) / 0.34));
        layFlatT = 1.0 - (1.0 - raw2) * (1.0 - raw2);
        z.fallAngle = layFlatT * (Math.PI * 0.49) * deadDir + buckleT * (1.0 - layFlatT) * 0.32 * deadDir;
        deadLiftY = 0.095 * sc * layFlatT;
      }
      if (z.deathTimer > 10.8) {
        const fadeT = Math.min(1.0, (z.deathTimer - 10.8) / 1.2);
        sinkY = -0.35 * sc * fadeT;
      }
    }

    const rootY = z.dead
      ? (z.y + deadLiftY + sinkY)
      : (isCrawling ? (z.y + 0.115 * sc * crawlFallT) : z.y);
    const crawlBackOffset = isCrawling
      ? (-0.52 * sc * crawlFallT)
      : ((z.dead && z.crawling) ? (-0.52 * sc) : 0);
    const yawRad = z.yaw || 0;
    rig.root.position.set(
      z.x + Math.sin(yawRad) * crawlBackOffset,
      rootY,
      z.z + Math.cos(yawRad) * crawlBackOffset
    );
    rig.root.rotation.order = 'YXZ';
    rig.root.rotation.set(
      z.dead ? z.fallAngle : (isCrawling ? 1.44 * crawlFallT : 0),
      yawRad,
      z.dead ? (deadDir * 0.08 * layFlatT * (z.fallSign || 1)) : 0
    );
    rig.root.scale.setScalar(sc);

    if (rig.visorMesh) {
      rig.visorMesh.visible = !!(z.hasArmor && !z.dead);
    }
    if (rig.runnerEyes) {
      rig.runnerEyes.visible = !z.dead && (z.variant === 'runner' || z.variant === 'screamer');
    }

    const skipCystPulse = E._st._potatoMode && E.camPos && (((z.x - E.camPos.x) * (z.x - E.camPos.x) + (z.z - E.camPos.z) * (z.z - E.camPos.z)) > 324.0);
    if (rig.spitterNodes) {
      const showSp = (z.variant === 'spitter' && !z.dead);
      const spPulse = skipCystPulse ? 1.0 : (1.0 + Math.sin(timeSec * 5.2 + z.seed) * 0.14 + (z.spitAnimTimer > 0 ? 0.18 : 0));
      for (let i = 0; i < rig.spitterNodes.length; i++) {
        rig.spitterNodes[i].visible = showSp;
        if (showSp && !skipCystPulse) rig.spitterNodes[i].scale.setScalar(spPulse);
      }
    }
    if (rig.screamerNodes) {
      const showSc = (z.variant === 'screamer' && !z.dead);
      const scPulse = skipCystPulse ? 1.0 : (1.0 + Math.sin(timeSec * 7.6 + z.seed) * 0.16 + (z.shriekTimer > 0 ? 0.22 : 0));
      for (let i = 0; i < rig.screamerNodes.length; i++) {
        rig.screamerNodes[i].visible = showSc;
        if (showSc && !skipCystPulse) rig.screamerNodes[i].scale.setScalar(scPulse);
      }
    }

    const acts = rig.actions;
    const mb = z.dead ? 0 : Math.max(0, Math.min(1, z.moveBlend !== undefined ? z.moveBlend : 0));
    const spdSmooth = z.dead ? 0 : (typeof z.actualSpeedSmooth === 'number' ? z.actualSpeedSmooth : (z.speed * mb));
    const walkTimeScale = Math.max(0.05, spdSmooth / (1.24 * sc));
    const runTimeScale = Math.max(0.10, spdSmooth / (3.15 * sc));
    const isCrippledLimp = (!z.dead && !isCrawling && !!z.legCrippled);
    const injLeg = z.crippledLeg || 1;
    const limpStumble = isCrippledLimp
      ? Math.max(0, Math.sin(timeSec * Math.max(2.6, walkTimeScale * 5.6) + z.seed))
      : 0;
    if (isCrippledLimp) {
      rig.root.position.y += -0.11 * sc - limpStumble * 0.07 * sc;
    }

    if (z.dead || isCrawling) {
      // Blend immediately out of Walk/Run stride into Idle for floor crawl or death collapse
      if (acts.idle) {
        acts.idle.paused = false;
        acts.idle.setEffectiveWeight(1.0);
        acts.idle.timeScale = 1.0;
      }
      if (acts.walk) {
        acts.walk.paused = false;
        acts.walk.setEffectiveWeight(0);
      }
      if (acts.run) {
        acts.run.paused = false;
        acts.run.setEffectiveWeight(0);
      }
      if (acts.zombieWalk && acts.zombieWalk !== acts.walk) {
        acts.zombieWalk.paused = false;
        acts.zombieWalk.setEffectiveWeight(0);
      }
      if (rig.mixer && !(z.dead && z.deathTimer >= 0.35)) {
        rig.mixer.update(animDt);
      }
    } else {
      if (acts.idle) {
        acts.idle.paused = false;
        acts.idle.setEffectiveWeight(1.0 - mb);
        acts.idle.timeScale = 1.0;
      }
      if (acts.zombieWalk && acts.zombieWalk !== acts.walk) {
        acts.zombieWalk.paused = false;
        acts.zombieWalk.setEffectiveWeight(0);
      }

      if (isBrute) {
        const isCharging = z.chargeTimer > 0 && !isCrippledLimp;
        if (acts.walk) {
          acts.walk.paused = false;
          acts.walk.setEffectiveWeight(isCharging ? 0 : mb);
          acts.walk.timeScale = walkTimeScale;
        }
        if (acts.run) {
          acts.run.paused = false;
          acts.run.setEffectiveWeight(isCharging ? mb : 0);
          acts.run.timeScale = runTimeScale;
        }
      } else if ((z.variant === 'runner' || z.variant === 'screamer') && !isCrippledLimp) {
        if (acts.run) {
          acts.run.paused = false;
          acts.run.setEffectiveWeight(mb);
          acts.run.timeScale = runTimeScale;
        }
        if (acts.walk) {
          acts.walk.paused = false;
          acts.walk.setEffectiveWeight(0);
        }
      } else {
        // Walker, Spitter, or crippled zombie: lock Walk clip to actual ground velocity
        if (acts.walk) {
          acts.walk.paused = false;
          acts.walk.setEffectiveWeight(mb);
          acts.walk.timeScale = walkTimeScale;
        }
        if (acts.run) {
          acts.run.paused = false;
          acts.run.setEffectiveWeight(0);
        }
      }

      if (rig.mixer) {
        rig.mixer.update(animDt);
      }
    }

    // Character-space bone posing (decapitation, arm stumps, wound patches, death collapse, limp & alive poses)
    rig.root.updateMatrixWorld(true);
    rig.root.getWorldQuaternion(_qRootInv);
    _qRootInv.invert();

    const b = rig.bones;
    const limp = z.limbBias || 1;
    if (b.head) {
      if (z.dead && z.decapitated) {
        b.head.scale.set(0.0001, 0.0001, 0.0001);
        if (rig.neckStumpNode) rig.neckStumpNode.visible = true;
      } else {
        b.head.scale.set(1, 1, 1);
        if (rig.neckStumpNode) rig.neckStumpNode.visible = false;
      }
    }
    const lostL = !!z.lostLeftArm;
    const lostR = !!z.lostRightArm;
    const lostLegL = !!z.lostLeftLeg;
    const lostLegR = !!z.lostRightLeg;
    if (b.leftForeArm) {
      b.leftForeArm.scale.setScalar(lostL ? 0.0001 : 1.0);
      if (rig.armStumpL) rig.armStumpL.visible = lostL;
    }
    if (b.rightForeArm) {
      b.rightForeArm.scale.setScalar(lostR ? 0.0001 : 1.0);
      if (rig.armStumpR) rig.armStumpR.visible = lostR;
    }
    if (b.leftLeg) {
      b.leftLeg.scale.setScalar(lostLegL ? 0.0001 : 1.0);
      if (rig.legStumpL) rig.legStumpL.visible = lostLegL;
    }
    if (b.rightLeg) {
      b.rightLeg.scale.setScalar(lostLegR ? 0.0001 : 1.0);
      if (rig.legStumpR) rig.legStumpR.visible = lostLegR;
    }
    if (rig.woundNodes) {
      const wm = z.woundMask || 0;
      for (let k = 0; k < rig.woundNodes.length; k++) {
        const wn = rig.woundNodes[k];
        if (wn) wn.visible = ((wm & (1 << k)) !== 0);
      }
    }

    if (z.dead) {
      const buckleBlend = z.crawling ? 0 : (buckleT * (1.0 - layFlatT));
      if (buckleBlend > 0.01) {
        applyCharSpaceDelta(b.spine2, _qRootInv, _axisX, 0.24 * deadDir * buckleBlend);
        applyCharSpaceDelta(b.leftUpLeg, _qRootInv, _axisX, -0.35 * deadDir * buckleBlend);
        applyCharSpaceDelta(b.rightUpLeg, _qRootInv, _axisX, -0.30 * deadDir * buckleBlend);
        applyCharSpaceDelta(b.leftLeg, _qRootInv, _axisX, 0.52 * deadDir * buckleBlend);
        applyCharSpaceDelta(b.rightLeg, _qRootInv, _axisX, 0.45 * deadDir * buckleBlend);
      }
      const flatAlpha = layFlatT * 0.96;
      if (flatAlpha > 0.005) {
        aimBoneInCharSpace(b.leftUpLeg, _qRootInv, 0.20 + limp * 0.05, -0.97, 0.04 * deadDir, flatAlpha);
        if (!lostLegL) aimBoneInCharSpace(b.leftLeg, _qRootInv, 0.06, -0.99, 0.05 * deadDir, flatAlpha);
        aimBoneInCharSpace(b.rightUpLeg, _qRootInv, -0.22 + limp * 0.05, -0.97, 0.04 * deadDir, flatAlpha);
        if (!lostLegR) aimBoneInCharSpace(b.rightLeg, _qRootInv, -0.10, -0.99, 0.05 * deadDir, flatAlpha);
        aimBoneInCharSpace(b.leftArm, _qRootInv, 0.84, -0.46 + limp * 0.16, 0.05 * deadDir, flatAlpha);
        if (!lostL) aimBoneInCharSpace(b.leftForeArm, _qRootInv, 0.65, 0.72, 0.05 * deadDir, flatAlpha);
        aimBoneInCharSpace(b.rightArm, _qRootInv, -0.84, -0.42 - limp * 0.16, 0.05 * deadDir, flatAlpha);
        if (!lostR) aimBoneInCharSpace(b.rightForeArm, _qRootInv, -0.70, 0.68, 0.05 * deadDir, flatAlpha);
      }
    } else if (isCrawling) {
      // Grounded prone crawler kinematics (never floats!): trailing thighs/shins flat, head arched forward, alternating floor-pull arms
      const trailBlend = 0.50 + 0.42 * crawlFallT;
      aimBoneInCharSpace(b.leftUpLeg, _qRootInv, 0.14, -0.98, 0.06, trailBlend);
      if (!lostLegL) aimBoneInCharSpace(b.leftLeg, _qRootInv, 0.06, -0.99, 0.05, trailBlend);
      aimBoneInCharSpace(b.rightUpLeg, _qRootInv, -0.14, -0.98, 0.06, trailBlend);
      if (!lostLegR) aimBoneInCharSpace(b.rightLeg, _qRootInv, -0.06, -0.99, 0.05, trailBlend);

      applyCharSpaceDelta(b.spine1, _qRootInv, _axisX, -0.22 * crawlFallT);
      applyCharSpaceDelta(b.spine2, _qRootInv, _axisX, -0.26 * crawlFallT);
      applyCharSpaceDelta(b.neck, _qRootInv, _axisX, -0.24 * crawlFallT);
      applyCharSpaceDelta(b.head, _qRootInv, _axisX, -0.32 * crawlFallT);

      const cp = z.crawlPhase || 0;
      const pullL = mb > 0.04 ? Math.sin(cp) : 0.45;
      const pullR = mb > 0.04 ? Math.sin(cp + Math.PI) : -0.35;
      const lyL = 0.25 + pullL * 0.62;
      const lzL = 0.24 + Math.max(0, pullL) * 0.12;
      aimBoneInCharSpace(b.leftArm, _qRootInv, 0.34, lyL, lzL, 0.90);
      if (!lostL) aimBoneInCharSpace(b.leftForeArm, _qRootInv, 0.16, 0.42 + pullL * 0.50, 0.26, 0.92);

      const lyR = 0.25 + pullR * 0.62;
      const lzR = 0.24 + Math.max(0, pullR) * 0.12;
      aimBoneInCharSpace(b.rightArm, _qRootInv, -0.34, lyR, lzR, 0.90);
      if (!lostR) aimBoneInCharSpace(b.rightForeArm, _qRootInv, -0.16, 0.42 + pullR * 0.50, 0.26, 0.92);
    } else {
      const lungeWave = (z.attackTimer > z.attackCooldown - 0.30)
        ? Math.sin(((z.attackCooldown - z.attackTimer) / 0.30) * Math.PI)
        : 0;
      const stagAngle = z.staggerTimer > 0 ? (-0.22 * Math.min(1.0, z.staggerTimer / 0.35)) : 0;

      if (z.variant === 'runner' || z.variant === 'screamer') {
        if (z.variant === 'screamer' && z.shriekTimer > 0) {
          // Skyward spine-arched shriek + arms flung wide
          applyCharSpaceDelta(b.spine, _qRootInv, _axisX, -0.18);
          applyCharSpaceDelta(b.spine1, _qRootInv, _axisX, -0.20);
          applyCharSpaceDelta(b.spine2, _qRootInv, _axisX, -0.22);
          applyCharSpaceDelta(b.neck, _qRootInv, _axisX, -0.24);
          applyCharSpaceDelta(b.head, _qRootInv, _axisX, -0.32);
          aimBoneInCharSpace(b.leftArm, _qRootInv, 0.72, 0.42, 0.55, 0.90);
          aimBoneInCharSpace(b.leftForeArm, _qRootInv, 0.58, 0.65, 0.48, 0.85);
          aimBoneInCharSpace(b.rightArm, _qRootInv, -0.72, 0.42, 0.55, 0.90);
          aimBoneInCharSpace(b.rightForeArm, _qRootInv, -0.58, 0.65, 0.48, 0.85);
        } else {
          // Terrifying feral chase: ~35 deg deep forward lunge, head pitched UP locking eyes forward, BOTH arms thrust forward (+Z) clawing!
          const thrash = Math.sin(timeSec * 10.5 + z.seed) * 0.09;
          const swayL = Math.sin(timeSec * 13.0 + z.seed) * 0.14;
          const swayR = Math.cos(timeSec * 13.0 + z.seed) * 0.14;
          applyCharSpaceDelta(b.spine, _qRootInv, _axisX, 0.20 + stagAngle * 0.4);
          applyCharSpaceDelta(b.spine1, _qRootInv, _axisX, 0.21);
          applyCharSpaceDelta(b.spine2, _qRootInv, _axisX, 0.21 + lungeWave * 0.24);
          applyCharSpaceDelta(b.spine2, _qRootInv, _axisZ, thrash);
          applyCharSpaceDelta(b.neck, _qRootInv, _axisX, -0.22);
          applyCharSpaceDelta(b.head, _qRootInv, _axisX, -0.26);
          applyCharSpaceDelta(b.head, _qRootInv, _axisZ, limp * 0.10 - thrash * 0.7);

          // Override upright waist-jogging Run arms completely: extend intact arm(s) FORWARD toward player (+Z)!
          aimBoneInCharSpace(b.leftArm, _qRootInv, 0.12, (lostL ? -0.45 : -0.02) + swayL, lostL ? 0.65 : 0.99, lostL ? 0.65 : 0.92);
          if (!lostL) aimBoneInCharSpace(b.leftForeArm, _qRootInv, -0.10, 0.12 + swayL, 0.98, 0.95);
          aimBoneInCharSpace(b.rightArm, _qRootInv, -0.12, (lostR ? -0.45 : -0.02) + swayR, lostR ? 0.65 : 0.99, lostR ? 0.65 : 0.92);
          if (!lostR) aimBoneInCharSpace(b.rightForeArm, _qRootInv, 0.10, 0.12 + swayR, 0.98, 0.95);
        }
      } else if (isBrute) {
        const chgPitch = z.chargeTimer > 0 ? 0.22 : (z.chargeWindup > 0 ? 0.14 : 0.06);
        applyCharSpaceDelta(b.spine, _qRootInv, _axisX, 0.08 + chgPitch * 0.5 + stagAngle * 0.4);
        applyCharSpaceDelta(b.spine2, _qRootInv, _axisX, 0.08 + chgPitch * 0.5 + lungeWave * 0.22);
        applyCharSpaceDelta(b.head, _qRootInv, _axisX, -0.12);
        if (z.chargeTimer > 0 || lungeWave > 0.05) {
          aimBoneInCharSpace(b.rightArm, _qRootInv, -0.18, -0.22, 0.96, 0.75);
          if (!lostR) aimBoneInCharSpace(b.rightForeArm, _qRootInv, 0.20, 0.28, 0.94, 0.75);
        }
      } else {
        // Walker & Spitter: ~24 deg hunched shamble, asymmetric limp roll, head cocked & leering up, reaching claw arm(s)
        let spitHeave = 0;
        if (z.variant === 'spitter' && z.spitAnimTimer > 0) {
          const spitT = 1.0 - Math.max(0, Math.min(1, z.spitAnimTimer / 0.50));
          spitHeave = spitT < 0.35
            ? -Math.sin((spitT / 0.35) * Math.PI) * 0.32
            : Math.sin(((spitT - 0.35) / 0.65) * Math.PI) * 0.46;
        }
        const shambleRoll = limp * 0.09 + Math.sin(timeSec * 3.0 + z.seed) * 0.05;
        const headCock = limp * 0.24 + Math.sin(timeSec * 2.1 + z.seed) * 0.06;

        applyCharSpaceDelta(b.spine, _qRootInv, _axisX, 0.14 + spitHeave * 0.35 + stagAngle * 0.4);
        applyCharSpaceDelta(b.spine1, _qRootInv, _axisX, 0.14 + spitHeave * 0.45);
        applyCharSpaceDelta(b.spine2, _qRootInv, _axisX, 0.14 + spitHeave * 0.55 + lungeWave * 0.25);
        applyCharSpaceDelta(b.spine2, _qRootInv, _axisZ, shambleRoll);
        applyCharSpaceDelta(b.neck, _qRootInv, _axisX, -0.11 + spitHeave * 0.3);
        applyCharSpaceDelta(b.head, _qRootInv, _axisX, -0.13 + spitHeave * 0.4);
        applyCharSpaceDelta(b.head, _qRootInv, _axisZ, headCock);

        const reachWave = Math.sin(timeSec * 2.8 + z.seed) * 0.08 + lungeWave * 0.22;
        // Reach forward with intact strong arm (switch to other intact arm if primary arm was severed)
        const reachLeft = (!lostL && (limp < 0 || lostR));
        if (reachLeft) {
          aimBoneInCharSpace(b.leftArm, _qRootInv, 0.12, -0.16 + reachWave, 0.98, 0.88);
          aimBoneInCharSpace(b.leftForeArm, _qRootInv, -0.12, -0.02 + reachWave, 0.99, 0.90);
          aimBoneInCharSpace(b.rightArm, _qRootInv, -0.16, -0.78, 0.60, 0.62);
          if (!lostR) aimBoneInCharSpace(b.rightForeArm, _qRootInv, -0.08, -0.50, 0.86, 0.62);
        } else {
          aimBoneInCharSpace(b.rightArm, _qRootInv, -0.12, (lostR ? -0.52 : -0.16) + reachWave, lostR ? 0.72 : 0.98, lostR ? 0.65 : 0.88);
          if (!lostR) aimBoneInCharSpace(b.rightForeArm, _qRootInv, 0.12, -0.02 + reachWave, 0.99, 0.90);
          aimBoneInCharSpace(b.leftArm, _qRootInv, 0.16, -0.78, 0.60, 0.62);
          if (!lostL) aimBoneInCharSpace(b.leftForeArm, _qRootInv, 0.08, -0.50, 0.86, 0.62);
        }
      }

      // True asymmetrical leg-shot limp pose (weight shifted onto healthy leg, injured leg stiff & dragging)
      if (isCrippledLimp) {
        const tilt = -injLeg * (0.16 + 0.14 * limpStumble);
        applyCharSpaceDelta(b.spine, _qRootInv, _axisZ, tilt);
        applyCharSpaceDelta(b.spine2, _qRootInv, _axisZ, tilt * 0.75);
        applyCharSpaceDelta(b.spine2, _qRootInv, _axisX, 0.16 + 0.16 * limpStumble);
        const injUp = injLeg >= 0 ? b.leftUpLeg : b.rightUpLeg;
        const injLow = injLeg >= 0 ? b.leftLeg : b.rightLeg;
        aimBoneInCharSpace(injUp, _qRootInv, injLeg * 0.16, -0.92, -0.32 + limpStumble * 0.16, 0.72);
        aimBoneInCharSpace(injLow, _qRootInv, injLeg * 0.10, -0.94, -0.28, 0.75);
      }
    }
    rig.root.updateMatrixWorld(true);
  }

  function getZombieCrawlerAnchors(z, outHead, outChest, outHips, outFeet) {
    if (!z) return false;
    const sc = z.scale || 1.0;
    const yaw = z.yaw || 0;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const fallT = z.crawling ? Math.min(1.0, (z.crawlFallTimer || 0) / 0.42) : 0;
    const backOff = -0.52 * sc * fallT;

    if (E._st._useSkinnedRigs) {
      const slot = E._st._rigPool[z.id];
      const rig = E.getSlotRigForVariant(z, slot);
      if (rig && rig.root && rig.bones && rig.bones.head && rig.bones.spine2 && rig.bones.hips) {
        const prevRootVis = rig.root.visible;
        rig.root.visible = true;
        rig.root.updateMatrixWorld(true);
        const offX = E.enemyRoot ? E.enemyRoot.position.x : 0;
        const offY = E.enemyRoot ? E.enemyRoot.position.y : 0;
        const offZ = E.enemyRoot ? E.enemyRoot.position.z : 0;

        rig.bones.head.getWorldPosition(outHead);
        rig.bones.spine2.getWorldPosition(outChest);
        rig.bones.hips.getWorldPosition(outHips);
        outHead.set(outHead.x - offX, outHead.y - offY, outHead.z - offZ);
        outChest.set(outChest.x - offX, outChest.y - offY, outChest.z - offZ);
        outHips.set(outHips.x - offX, outHips.y - offY, outHips.z - offZ);

        // Nudge head anchor slightly toward skull center along chest->head vector
        _v1.subVectors(outHead, outChest);
        const hcLen = _v1.length();
        if (hcLen > 0.02) {
          outHead.addScaledVector(_v1, (0.065 * sc) / hcLen);
        } else {
          outHead.y += 0.065 * sc;
        }

        if (outFeet) {
          const legAnchorFrac = (z.lostLeftLeg && z.lostRightLeg) ? 0.48 : 0.12;
          const baseRootX = z.x + fwdX * backOff;
          const baseRootZ = z.z + fwdZ * backOff;
          outFeet.set(
            baseRootX + (outHips.x - baseRootX) * legAnchorFrac,
            z.y + 0.14 * sc,
            baseRootZ + (outHips.z - baseRootZ) * legAnchorFrac
          );
        }
        rig.root.visible = prevRootVis;
        return true;
      }
    }

    // Analytical fallback matching root pitch 1.44 * fallT and backOff = -0.52 * fallT
    const pitch = 1.44 * fallT;
    const sinP = Math.sin(pitch);
    const cosP = Math.cos(pitch);
    const baseY = z.y + 0.115 * sc * fallT;
    const baseX = z.x + fwdX * backOff;
    const baseZ = z.z + fwdZ * backOff;
    outHips.set(baseX + fwdX * (0.90 * sc * sinP), baseY + 0.90 * sc * cosP, baseZ + fwdZ * (0.90 * sc * sinP));
    outChest.set(baseX + fwdX * (1.30 * sc * sinP), baseY + 1.30 * sc * cosP + 0.10 * sc * fallT, baseZ + fwdZ * (1.30 * sc * sinP));
    outHead.set(baseX + fwdX * (1.52 * sc * sinP), baseY + 1.52 * sc * cosP + 0.24 * sc * fallT, baseZ + fwdZ * (1.52 * sc * sinP));
    if (outFeet) {
      const legReach = (z.lostLeftLeg && z.lostRightLeg) ? 0.45 : 0.12;
      outFeet.set(baseX + fwdX * (0.90 * sc * sinP * legReach), z.y + 0.14 * sc, baseZ + fwdZ * (0.90 * sc * sinP * legReach));
    }
    return true;
  }

  function getZombieCorpsePoolPos(z, outVec) {
    const target = outVec || new THREE.Vector3();
    if (!z) return target.set(0, 0, 0);
    if (E._st._useSkinnedRigs) {
      const slot = E._st._rigPool[z.id];
      const rig = E.getSlotRigForVariant(z, slot);
      if (rig && rig.root && rig.bones) {
        const bone = (z.decapitated && rig.bones.neck)
          ? rig.bones.neck
          : (rig.bones.spine2 || rig.bones.spine1 || rig.bones.hips);
        if (bone) {
          rig.root.updateMatrixWorld(true);
          bone.getWorldPosition(target);
          return target;
        }
      }
    }
    const dist = (z.decapitated ? 1.32 : 1.05) * (z.scale || 1.0) * (z.fallPitchSign || 1);
    target.set(
      z.x + Math.sin(z.yaw || 0) * dist,
      z.y,
      z.z + Math.cos(z.yaw || 0) * dist
    );
    return target;
  }

  function updateZombieMatrices(z, timeSec, dt) {
    if (!z.active) return;
    if (E._st._useSkinnedRigs) {
      updateSkinnedZombie(z, timeSec, dt);
      return;
    }
    const idx = z.id;

    const sc = z.scale;
    const widthMult = z.variant === 'brute' ? 1.24 : (z.variant === 'runner' ? 0.90 : (z.variant === 'screamer' ? 0.92 : 0.98));
    let sinkY = 0;
    const scaleDecay = 1.0;
    let deadStage1 = 0;
    let deadStage2 = 0;
    const deadDir = z.fallPitchSign || z.fallSign || 1;

    if (z.dead) {
      deadStage1 = Math.min(1.0, z.deathTimer / 0.22);
      const raw2 = Math.max(0.0, Math.min(1.0, (z.deathTimer - 0.18) / 0.36));
      deadStage2 = 1.0 - (1.0 - raw2) * (1.0 - raw2);
      z.fallAngle = deadStage2 * (Math.PI * 0.48) * deadDir + deadStage1 * (1.0 - deadStage2) * 0.25 * deadDir;
      if (z.deathTimer > 10.8) {
        const fadeT = Math.min(1.0, (z.deathTimer - 10.8) / 1.2);
        sinkY = -0.35 * sc * fadeT;
      }
    }

    const s = sc * scaleDecay;
    const sw = s * widthMult;
    const phase = z.animPhase;
    const limp = z.limbBias;
    const mb = z.dead ? 0 : Math.max(0, Math.min(1, z.moveBlend !== undefined ? z.moveBlend : 0));
    const idleBreath = z.dead ? 0 : Math.sin(timeSec * 2.1 + z.seed);

    // Spitter vomit heave animation (0.50s retch & expel arc)
    let spitHeave = 0;
    if (!z.dead && z.spitAnimTimer > 0) {
      const spitT = 1.0 - Math.max(0, Math.min(1, z.spitAnimTimer / 0.50));
      spitHeave = spitT < 0.35
        ? -Math.sin((spitT / 0.35) * Math.PI) * 0.26
        : Math.sin(((spitT - 0.35) / 0.65) * Math.PI) * 0.38;
    }

    // Asymmetric horror posture & organic gait
    let torsoPitch = z.dead
      ? z.fallAngle
      : (z.variant === 'runner'
        ? (0.34 + 0.22 * mb)
        : z.variant === 'spitter'
          ? (0.28 + idleBreath * 0.04 + spitHeave)
          : z.variant === 'brute'
            ? (z.chargeTimer > 0 ? 0.44 : (0.14 + 0.04 * mb))
            : z.variant === 'screamer'
              ? (0.24 + 0.16 * mb + Math.sin(timeSec * 6.0 + z.seed) * 0.03)
              : (0.22 + 0.08 * mb + idleBreath * 0.025));

    const isLegHitZone = z.hitZone === 'legs' || z.hitZone === 'leftLeg' || z.hitZone === 'rightLeg';
    if (z.staggerTimer > 0 && !z.dead) {
      const stagT = Math.min(1.0, z.staggerTimer / 0.35);
      torsoPitch -= (isLegHitZone ? -0.18 : 0.12) * stagT;
    }
    if (z.chargeWindup > 0 && !z.dead) torsoPitch += 0.24;
    if (z.shriekTimer > 0 && !z.dead) torsoPitch = -0.26;

    // Biomechanical torso/pelvis counter-twist & lateral weight shift
    const hipYaw = z.dead ? 0 : Math.sin(phase) * 0.13 * mb;
    let chestYaw = z.dead ? 0 : -Math.sin(phase) * 0.16 * mb;
    if (!z.dead && z.variant === 'brute' && z.chargeTimer > 0) chestYaw += limp * 0.30;
    const hipRoll = z.dead ? 0 : Math.cos(phase) * 0.055 * mb;

    let torsoRoll = z.dead
      ? (deadDir * 0.08 * deadStage2 * z.fallSign)
      : (z.variant === 'walker'
        ? (Math.sin(phase) * 0.10 * mb + limp * 0.07)
        : z.variant === 'spitter'
          ? (Math.sin(timeSec * 4.5 + z.seed) * 0.06 + limp * 0.08)
          : (-hipRoll * 0.8 + Math.sin(phase) * 0.04 * mb));
    if (!z.dead && z.legCrippled) torsoRoll += limp * 0.16;
    if (!z.dead && z.staggerTimer > 0 && z.hitSide) torsoRoll += z.hitSide * 0.14 * Math.min(1.0, z.staggerTimer / 0.35);

    // Pelvis height anchored cleanly around hip level independently of torsoPitch (prevents runner feet floating!)
    const walkBob = z.dead ? 0 : (Math.abs(Math.sin(phase)) * (z.variant === 'runner' ? 0.048 : (z.variant === 'brute' ? 0.036 : 0.026)) - 0.012) * mb * s;
    const variantHipBase = z.variant === 'runner' ? (0.768 - 0.048 * mb) : (z.variant === 'screamer' ? 0.752 : 0.778);
    const crippleDrop = (!z.dead && z.legCrippled) ? 0.14 * s : 0;
    const stagLegDrop = (!z.dead && z.staggerTimer > 0 && isLegHitZone) ? 0.12 * s * Math.min(1.0, z.staggerTimer / 0.42) : 0;
    const hipHeight = z.dead
      ? (0.778 * s * (1.0 - 0.46 * deadStage1) * (1.0 - deadStage2) + 0.15 * s * deadStage2)
      : (variantHipBase * s - crippleDrop - stagLegDrop + walkBob);

    _pelvisPos.set(z.x, z.y + hipHeight + sinkY, z.z);
    _e1.set(z.dead ? z.fallAngle : 0, z.yaw + hipYaw, z.dead ? (deadDir * 0.08 * deadStage2 * z.fallSign) : hipRoll, 'YXZ');
    _qHip.setFromEuler(_e1);

    // 1. Torso pivoted cleanly from pelvis lumbar joint
    _e1.set(torsoPitch, z.yaw + chestYaw, torsoRoll, 'YXZ');
    _qTorso.setFromEuler(_e1);
    _pos.set(0, 0.265 * s, 0).applyQuaternion(_qTorso).add(_pelvisPos);
    _scale.set(sw, s, sw);
    _m4.compose(_pos, _qTorso, _scale);
    E._st._torsoMesh.setMatrixAt(idx, _m4);

    const attachTorso = (lx, ly, lz, outVec) => {
      outVec.set(lx * sw, ly * s, lz * sw).applyQuaternion(_qTorso).add(_pos);
    };
    const attachPelvis = (lx, ly, lz, outVec) => {
      outVec.set(lx * sw, ly * s, lz * sw).applyQuaternion(_qHip).add(_pelvisPos);
    };

    // 2. Head (variant-tailored bob, twitch, heave & shriek)
    const headFwdLean = (z.variant === 'runner' || z.variant === 'screamer') ? 0.08 : 0.03;
    attachTorso(0, 0.435, headFwdLean, _vHeadPos);
    const headTwitchY = z.dead ? 0
      : (z.variant === 'screamer'
        ? (Math.sin(timeSec * 8.5 + z.seed) * 0.16 + Math.cos(timeSec * 13.0 + z.seed) * 0.08)
        : Math.sin(timeSec * 2.2 + z.seed) * (z.variant === 'walker' ? 0.16 : 0.08));
    const headCockZ = z.dead ? 0 : limp * (0.13 + Math.sin(timeSec * 1.9 + z.seed) * 0.06);
    let headPitch = torsoPitch * 0.45 + 0.06 + (spitHeave * 0.85);
    if (!z.dead && z.variant === 'walker') headPitch += Math.sin(phase) * 0.08 * mb;
    if (z.shriekTimer > 0 && !z.dead) headPitch = -0.72;
    _e1.set(headPitch, z.yaw + chestYaw * 0.5 + headTwitchY, torsoRoll * 0.6 + headCockZ, 'YXZ');
    _qHead.setFromEuler(_e1);
    if (z.dead && z.decapitated) {
      E._st._headMesh.setMatrixAt(idx, _zeroMat);
    } else {
      _scale.set(s, s, s);
      _m4.compose(_vHeadPos, _qHead, _scale);
      E._st._headMesh.setMatrixAt(idx, _m4);
    }

    // 2b. Variant Head Overlays (Brute Helmet, Spitter Hanging Gas Mask, Screamer Split-Open Howling Jaw)
    if (z.variant === 'brute' && z.hasArmor && !z.dead) {
      _scale.set(s * 1.03, s * 1.03, s * 1.03);
      _m4.compose(_vHeadPos, _qHead, _scale);
      E._st._bruteHelmetMesh.setMatrixAt(idx, _m4);
    } else {
      E._st._bruteHelmetMesh.setMatrixAt(idx, _zeroMat);
    }

    if (E._st._spitterMaskMesh) {
      if (z.variant === 'spitter' && !z.dead) {
        const maskJolt = spitHeave > 0 ? spitHeave * 0.35 : 0;
        _e1.set(headPitch + maskJolt, z.yaw + chestYaw * 0.5 + headTwitchY, torsoRoll * 0.6 + headCockZ, 'YXZ');
        _q1.setFromEuler(_e1);
        _scale.set(s, s, s);
        _m4.compose(_vHeadPos, _q1, _scale);
        E._st._spitterMaskMesh.setMatrixAt(idx, _m4);
      } else {
        E._st._spitterMaskMesh.setMatrixAt(idx, _zeroMat);
      }
    }

    if (E._st._screamerJawMesh) {
      if (z.variant === 'screamer' && !z.dead) {
        const howlOpen = z.shriekTimer > 0 ? 0.28 : (0.06 * Math.abs(Math.sin(timeSec * 5.0 + z.seed)));
        _e1.set(headPitch + howlOpen, z.yaw + chestYaw * 0.5 + headTwitchY, torsoRoll * 0.6 + headCockZ, 'YXZ');
        _q1.setFromEuler(_e1);
        _scale.set(s, s, s);
        _m4.compose(_vHeadPos, _q1, _scale);
        E._st._screamerJawMesh.setMatrixAt(idx, _m4);
      } else {
        E._st._screamerJawMesh.setMatrixAt(idx, _zeroMat);
      }
    }

    // 3. Variant-exclusive Torso Overlays
    _scale.set(sw, s, sw);
    if (z.variant === 'brute' && z.hasArmor && !z.dead) {
      _m4.compose(_pos, _qTorso, _scale);
      E._st._bruteArmorMesh.setMatrixAt(idx, _m4);
      E._st._spitterBioMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._spitterGearMesh) E._st._spitterGearMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._screamerRibMesh) E._st._screamerRibMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._screamerCystMesh) E._st._screamerCystMesh.setMatrixAt(idx, _zeroMat);
      E._st._ragMesh.setMatrixAt(idx, _zeroMat);
    } else if (z.variant === 'spitter' && !z.dead) {
      const pulse = 1.0 + Math.sin(timeSec * 5.2 + z.seed) * 0.09 + (z.spitAnimTimer > 0 ? 0.14 : 0);
      _m4.compose(_pos, _qTorso, _scale);
      if (E._st._spitterGearMesh) E._st._spitterGearMesh.setMatrixAt(idx, _m4);
      _scale.set(sw * pulse, s * pulse, sw * pulse);
      _m4.compose(_pos, _qTorso, _scale);
      E._st._spitterBioMesh.setMatrixAt(idx, _m4);
      E._st._bruteArmorMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._screamerRibMesh) E._st._screamerRibMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._screamerCystMesh) E._st._screamerCystMesh.setMatrixAt(idx, _zeroMat);
      E._st._ragMesh.setMatrixAt(idx, _zeroMat);
    } else if (z.variant === 'screamer' && !z.dead) {
      const pulse = 1.0 + Math.sin(timeSec * 7.6 + z.seed) * 0.13 + (z.shriekTimer > 0 ? 0.18 : 0);
      _m4.compose(_pos, _qTorso, _scale);
      if (E._st._screamerRibMesh) E._st._screamerRibMesh.setMatrixAt(idx, _m4);
      _scale.set(sw * pulse, s * pulse, sw * pulse);
      _m4.compose(_pos, _qTorso, _scale);
      if (E._st._screamerCystMesh) E._st._screamerCystMesh.setMatrixAt(idx, _m4);
      E._st._bruteArmorMesh.setMatrixAt(idx, _zeroMat);
      E._st._spitterBioMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._spitterGearMesh) E._st._spitterGearMesh.setMatrixAt(idx, _zeroMat);
      E._st._ragMesh.setMatrixAt(idx, _zeroMat);
    } else if ((z.variant === 'walker' || z.variant === 'runner') && !z.dead) {
      _m4.compose(_pos, _qTorso, _scale);
      E._st._ragMesh.setMatrixAt(idx, _m4);
      E._st._bruteArmorMesh.setMatrixAt(idx, _zeroMat);
      E._st._spitterBioMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._spitterGearMesh) E._st._spitterGearMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._screamerRibMesh) E._st._screamerRibMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._screamerCystMesh) E._st._screamerCystMesh.setMatrixAt(idx, _zeroMat);
    } else {
      E._st._bruteArmorMesh.setMatrixAt(idx, _zeroMat);
      E._st._spitterBioMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._spitterGearMesh) E._st._spitterGearMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._screamerRibMesh) E._st._screamerRibMesh.setMatrixAt(idx, _zeroMat);
      if (E._st._screamerCystMesh) E._st._screamerCystMesh.setMatrixAt(idx, _zeroMat);
      E._st._ragMesh.setMatrixAt(idx, _zeroMat);
    }

    // 4. Hierarchical Two-Segment Arms (Torso -> Shoulder -> Upper Arm -> Elbow -> Forearm & Hand)
    const attackSwing = (!z.dead && z.attackTimer > z.attackCooldown - 0.30)
      ? Math.sin(((z.attackCooldown - z.attackTimer) / 0.30) * Math.PI) * -0.95
      : 0;

    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const side = sIdx === 0 ? -1 : 1;
      const isStrongSide = (side === limp);
      const uaMesh = side < 0 ? E._st._upperArmLMesh : E._st._upperArmRMesh;
      const faMesh = side < 0 ? E._st._forearmLMesh : E._st._forearmRMesh;

      let uaPitchRel, uaYawRel = 0, uaRollRel, elbowFlex;
      if (z.shriekTimer > 0 && !z.dead) {
        uaPitchRel = -0.95;
        uaYawRel = side * 0.25;
        uaRollRel = side * -0.68 + Math.sin(timeSec * 32.0) * 0.08;
        elbowFlex = 0.72;
      } else if (z.dead) {
        uaPitchRel = -0.22 - 0.16 * deadStage2 + side * 0.18 * deadStage2;
        uaRollRel = side * (-0.24 - 0.56 * deadStage2);
        elbowFlex = 0.35 - 0.18 * deadStage2;
      } else if (z.variant === 'runner') {
        const sgn = side < 0 ? 1 : -1;
        uaPitchRel = -1.08 + Math.sin(phase) * 0.70 * sgn * mb + idleBreath * 0.05 + attackSwing;
        elbowFlex = 1.06 + Math.cos(phase * sgn) * 0.24 * mb;
        uaRollRel = side * -0.12;
      } else if (z.variant === 'screamer') {
        const sgn = side < 0 ? 1 : -1;
        uaPitchRel = -1.12 + Math.sin(phase) * 0.46 * sgn * mb + Math.sin(timeSec * 9.0 + z.seed + side) * 0.07 + attackSwing;
        elbowFlex = 0.68 + Math.sin(timeSec * 7.0 + z.seed) * 0.08;
        uaRollRel = side * -0.20;
      } else if (z.variant === 'brute') {
        if (z.chargeTimer > 0 && isStrongSide) {
          uaPitchRel = -1.42;
          uaYawRel = side * -0.22;
          uaRollRel = side * -0.06;
          elbowFlex = 1.18;
        } else {
          uaPitchRel = -0.80 + Math.sin(phase + (side < 0 ? 0 : Math.PI)) * 0.34 * mb + idleBreath * 0.04 + attackSwing * 0.9;
          elbowFlex = 0.56 + Math.cos(phase) * 0.10 * mb;
          uaRollRel = side * -0.16;
        }
      } else if (z.variant === 'spitter') {
        uaPitchRel = -0.78 + Math.sin(phase + (side < 0 ? 0 : Math.PI)) * 0.16 * mb + idleBreath * 0.06 + (spitHeave * 0.65) + attackSwing * 0.6;
        elbowFlex = 0.74 + (spitHeave < 0 ? 0.22 : 0);
        uaRollRel = side * (-0.16 - Math.max(0, spitHeave) * 0.45);
      } else {
        // Walker asymmetric zombie shamble: reaching arm vs hung twitching arm (no frantic marching when stationary)
        if (isStrongSide) {
          uaPitchRel = -1.32 + Math.sin(phase) * 0.18 * mb + idleBreath * 0.06 + attackSwing;
          elbowFlex = 0.42 + Math.sin(phase * 1.3) * 0.12 * mb;
          uaRollRel = side * -0.08;
        } else {
          uaPitchRel = -0.48 + Math.sin(phase + 1.2) * 0.14 * mb + Math.sin(timeSec * 2.2 + z.seed) * 0.05 + attackSwing * 0.55;
          elbowFlex = 0.64 + Math.cos(phase) * 0.12 * mb;
          uaRollRel = side * -0.15;
        }
      }

      attachTorso(side * 0.242, 0.225, 0.015, _v1);
      _e1.set(uaPitchRel, uaYawRel, uaRollRel, 'YXZ');
      _qLocal.setFromEuler(_e1);
      _qUpper.copy(_qTorso).multiply(_qLocal);
      _scale.set(sw, s, sw);
      _m4.compose(_v1, _qUpper, _scale);
      uaMesh.setMatrixAt(idx, _m4);

      // Compose forearm orientation cleanly on top of upper-arm quaternion (hide if dismembered)
      if ((side < 0 && z.lostLeftArm) || (side > 0 && z.lostRightArm)) {
        faMesh.setMatrixAt(idx, _zeroMat);
      } else {
        _vJointLocal.set(0, -0.255 * s, 0).applyQuaternion(_qUpper).add(_v1);
        _e1.set(-elbowFlex, 0, side * 0.08, 'YXZ');
        _qLocal.setFromEuler(_e1);
        _q1.copy(_qUpper).multiply(_qLocal);
        _m4.compose(_vJointLocal, _q1, _scale);
        faMesh.setMatrixAt(idx, _m4);
      }
    }

    // 5. Articulated Two-Segment Legs (Pelvis -> Hip -> Knee -> Heel-Strike/Stance/Toe-Off Calf & Boot)
    const thighSwingAmp = z.dead ? 0.12 : (z.variant === 'runner' ? 0.86 : (z.variant === 'screamer' ? 0.70 : (z.variant === 'brute' ? 0.46 : 0.50)));
    const kneeAmp = z.dead ? 0.10 : (z.variant === 'runner' ? 1.02 : (z.variant === 'screamer' ? 0.80 : 0.64));
    const baseThighCrouch = z.dead ? 0 : (z.variant === 'runner' ? (-0.12 - 0.14 * mb) : (z.variant === 'screamer' ? -0.10 : -0.04));
    const baseKneeCrouch = z.dead ? 0 : (z.variant === 'runner' ? (0.28 + 0.14 * mb) : (z.variant === 'screamer' ? 0.22 : 0.12));

    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const side = sIdx === 0 ? -1 : 1;
      const thighMesh = side < 0 ? E._st._thighLMesh : E._st._thighRMesh;
      const calfMesh = side < 0 ? E._st._calfLMesh : E._st._calfRMesh;
      const legPhase = side < 0 ? phase : (phase + Math.PI);

      // Asymmetric walker drag on injured leg (exaggerated when legCrippled)
      const isCrippledLeg = !z.dead && z.legCrippled && side !== limp;
      const dragMult = isCrippledLeg ? 0.34 : ((!z.dead && z.variant === 'walker' && side !== limp) ? 0.58 : 1.0);
      const idleStanceOffset = (!z.dead && mb < 0.99) ? ((side * limp * 0.08) * (1.0 - mb)) : 0;

      const thighPitch = z.dead
        ? (deadDir * (Math.PI * 0.46) * deadStage2 - 0.65 * deadStage1 * (1.0 - deadStage2) + side * 0.12 * deadStage2)
        : (baseThighCrouch + idleStanceOffset + Math.sin(legPhase) * thighSwingAmp * dragMult * mb - (isCrippledLeg ? 0.20 : 0));

      // Natural heel-strike -> stance -> toe-off knee flexion (positive X bends lower leg backward)
      const swingLift = Math.max(0, Math.sin(legPhase + 1.35));
      const kneeFlex = z.dead
        ? (1.35 * deadStage1 * (1.0 - deadStage2) + 0.14 * deadStage2)
        : (baseKneeCrouch + swingLift * kneeAmp * dragMult * mb + (isCrippledLeg ? 0.42 : 0));

      const hipSpread = z.variant === 'brute' ? 0.122 : 0.104;
      attachPelvis(side * hipSpread, 0, 0, _v1);
      _e1.set(thighPitch, z.yaw + hipYaw, (z.dead ? 0 : hipRoll * 0.5) + side * -0.04, 'YXZ');
      _q1.setFromEuler(_e1);
      _scale.set(sw, s, sw);
      _m4.compose(_v1, _q1, _scale);
      thighMesh.setMatrixAt(idx, _m4);

      _vKnee.set(0, -0.375 * s, 0).applyQuaternion(_q1).add(_v1);
      if ((side < 0 && z.lostLeftLeg) || (side > 0 && z.lostRightLeg)) {
        calfMesh.setMatrixAt(idx, _zeroMat);
      } else {
        _e1.set(thighPitch + kneeFlex, z.yaw + hipYaw, side * -0.02, 'YXZ');
        _q1.setFromEuler(_e1);
        _m4.compose(_vKnee, _q1, _scale);
        calfMesh.setMatrixAt(idx, _m4);
      }
    }
  }


  E.applyCharSpaceDelta = applyCharSpaceDelta;
  E.aimBoneInCharSpace = aimBoneInCharSpace;
  E.updateSkinnedZombie = updateSkinnedZombie;
  E.getZombieCrawlerAnchors = getZombieCrawlerAnchors;
  E.getZombieCorpsePoolPos = getZombieCorpsePoolPos;
  E.updateZombieMatrices = updateZombieMatrices;
})(window.LRT = window.LRT || {});
