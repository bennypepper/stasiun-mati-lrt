(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const W = I.weapons;

  const FALLBACK_WEAPONS = W.FALLBACK_WEAPONS;
  const _v1 = W._v1;
  const _v2 = W._v2;
  const _v3 = W._v3;
  const _v4 = W._v4;
  const _rayOrigin = W._rayOrigin;
  const _rayDir = W._rayDir;
  const _shotDir = W._shotDir;
  const _muzzlePos = W._muzzlePos;
  const _camPos = W._camPos;
  const _camRight = W._camRight;
  const _camUp = W._camUp;
  const _localPos = W._localPos;
  const _localNorm = W._localNorm;
  const _upVec = W._upVec;
  const _fwdVec = W._fwdVec;
  const _q1 = W._q1;
  const _q2 = W._q2;
  const _m4 = W._m4;
  const _scaleV = W._scaleV;
  const _color1 = W._color1;
  const _zeroMat = W._zeroMat;
  const _invMat = W._invMat;
  const _normMat = W._normMat;

  const _vmModels = W._vmModels;
  const _attachedScorches = W._attachedScorches;

  // Pre-allocated InstancedMesh VFX pools
  const TRACER_CAP = 32;
  const ROCKET_CAP = 4;
  const SMOKE_CAP = 160;
  const FIREBALL_CAP = 28;
  const RING_CAP = 12;
  const SPARK_CAP = 160;
  const BLOOD_CAP = 110;
  const GLASS_CAP = 140;
  const RUBBLE_CAP = 120;
  const CASING_CAP = 48;
  const SCORCH_CAP = 96;
  const BLOOD_DECAL_CAP = 96;
  const ATTACHED_SCORCH_CAP = 32;

  let _tracerMesh, _rocketMesh, _smokeMesh, _fireballMesh, _ringMesh;
  let _sparkMesh, _bloodMesh, _glassMesh, _rubbleMesh, _casingMesh, _scorchMesh, _bloodDecalMesh;
  let _scorchMat = null;
  let _scorchGeo = null;
  let _bloodDecalMat = null;

  const _tracers = [];
  const _rockets = [];
  const _smokes = [];
  const _fireballs = [];
  const _rings = [];
  const _sparks = [];
  const _bloods = [];
  const _glasses = [];
  const _rubbles = [];
  const _casings = [];
  const _scorches = [];
  const _bloodDecals = [];

  let _smokeCursor = 0;
  let _fireballCursor = 0;
  let _ringCursor = 0;
  let _sparkCursor = 0;
  let _bloodCursor = 0;
  let _glassCursor = 0;
  let _rubbleCursor = 0;
  let _casingCursor = 0;
  let _lastCasingSfxMs = 0;
  let _playerGroundY = 0;
  let _playerInsideTrain = false;
  const _playerVel = new THREE.Vector3();
  let _scorchCursor = 0;
  let _bloodDecalCursor = 0;
  let _attachedScorchCursor = 0;
  const _downVec = new THREE.Vector3(0, -1, 0);
  const _probeDirs = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1)
  ];
  const _flashPos = new THREE.Vector3();

  function createFallbackScorchTex() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    g.addColorStop(0.0, 'rgba(6,6,6,0.98)');
    g.addColorStop(0.42, 'rgba(14,12,10,0.88)');
    g.addColorStop(0.76, 'rgba(26,22,18,0.48)');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    // Radial soot blast streaks
    ctx.strokeStyle = 'rgba(8,8,8,0.55)';
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + (i % 3) * 0.14;
      const rLen = 36 + (i % 5) * 6;
      ctx.lineWidth = 2.0 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(ang) * 14, 64 + Math.sin(ang) * 14);
      ctx.lineTo(64 + Math.cos(ang) * rLen, 64 + Math.sin(ang) * rLen);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function createBloodDecalTex() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const cx = 128;
    const cy = 128;

    const traceHarmonicLoop = (steps, radiusFn) => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const r = radiusFn(a);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    // 1. Outer wet arterial puddle (contiguous multi-lobed harmonic contour with soft feathered perimeter)
    traceHarmonicLoop(72, (a) => (
      86 + 15 * Math.sin(a * 3 + 0.4) + 11 * Math.cos(a * 5 - 0.8) + 7 * Math.sin(a * 7 + 1.7) + 4 * Math.cos(a * 11)
    ));
    const gOuter = ctx.createRadialGradient(cx, cy, 8, cx, cy, 118);
    gOuter.addColorStop(0.0, 'rgba(30, 1, 2, 0.96)');
    gOuter.addColorStop(0.45, 'rgba(77, 4, 7, 0.92)');
    gOuter.addColorStop(0.76, 'rgba(117, 9, 14, 0.78)');
    gOuter.addColorStop(0.92, 'rgba(92, 6, 10, 0.35)');
    gOuter.addColorStop(1.0, 'rgba(60, 2, 4, 0)');
    ctx.fillStyle = gOuter;
    ctx.fill();

    // 2. Connected arterial rivulets / tongues tapering smoothly from the main pool core
    const rivCount = 9;
    for (let i = 0; i < rivCount; i++) {
      const a = (i / rivCount) * Math.PI * 2 + Math.sin(i * 2.3) * 0.18;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const px = -sin;
      const py = cos;
      const rStart = 42;
      const rTip = 94 + ((i * 7) % 19);
      const halfBase = 9 + (i % 3) * 3;
      const midR = (rStart + rTip) * 0.55;
      const bend = ((i % 2 === 0 ? 1 : -1) * (4 + (i % 3) * 2.5));

      const gRiv = ctx.createLinearGradient(
        cx + cos * rStart, cy + sin * rStart,
        cx + cos * rTip, cy + sin * rTip
      );
      gRiv.addColorStop(0.0, 'rgba(77, 4, 7, 0.88)');
      gRiv.addColorStop(0.65, 'rgba(112, 8, 12, 0.72)');
      gRiv.addColorStop(1.0, 'rgba(70, 4, 6, 0.0)');
      ctx.fillStyle = gRiv;
      ctx.beginPath();
      ctx.moveTo(cx + cos * rStart + px * halfBase, cy + sin * rStart + py * halfBase);
      ctx.quadraticCurveTo(
        cx + cos * midR + px * (halfBase * 0.55 + bend),
        cy + sin * midR + py * (halfBase * 0.55 + bend),
        cx + cos * rTip + px * bend * 0.35,
        cy + sin * rTip + py * bend * 0.35
      );
      ctx.quadraticCurveTo(
        cx + cos * midR - px * (halfBase * 0.55 - bend),
        cy + sin * midR - py * (halfBase * 0.55 - bend),
        cx + cos * rStart - px * halfBase,
        cy + sin * rStart - py * halfBase
      );
      ctx.closePath();
      ctx.fill();
    }

    // 3. Dark coagulated inner core
    traceHarmonicLoop(56, (a) => 48 + 9 * Math.cos(a * 4 + 1.2) + 5 * Math.sin(a * 6));
    const gCore = ctx.createRadialGradient(cx, cy, 4, cx, cy, 62);
    gCore.addColorStop(0.0, 'rgba(18, 0, 1, 0.96)');
    gCore.addColorStop(0.60, 'rgba(34, 2, 4, 0.80)');
    gCore.addColorStop(1.0, 'rgba(48, 3, 5, 0)');
    ctx.fillStyle = gCore;
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function initPools(scene) {
    W._vfxRoot = new THREE.Group();
    W._vfxRoot.name = 'LRT_WeaponsVFX';
    scene.add(W._vfxRoot);

    function makeInstanced(geo, mat, cap, castShadow) {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.frustumCulled = false;
      m.castShadow = !!castShadow;
      m.receiveShadow = false;
      const white = new THREE.Color(0xffffff);
      for (let i = 0; i < cap; i++) {
        m.setMatrixAt(i, _zeroMat);
        m.setColorAt(i, white);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      W._vfxRoot.add(m);
      return m;
    }

    // 1. Tracers (unit Z box scaled along length — slim so ADS sight picture stays clean)
    _tracerMesh = makeInstanced(
      new THREE.BoxGeometry(0.011, 0.011, 1.0),
      new THREE.MeshBasicMaterial({ color: 0xffea9c, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }),
      TRACER_CAP
    );
    for (let i = 0; i < TRACER_CAP; i++) {
      _tracers.push({ active: false, life: 0, maxLife: 0.048, p0: new THREE.Vector3(), p1: new THREE.Vector3(), thickness: 1.0 });
    }

    // 2. Flying RPG rockets
    _rocketMesh = makeInstanced(
      new THREE.CylinderGeometry(0.036, 0.052, 0.52, 10),
      new THREE.MeshStandardMaterial({ color: 0x5c6d45, roughness: 0.36, metalness: 0.55, emissive: 0xff7722, emissiveIntensity: 1.8 }),
      ROCKET_CAP
    );
    _rocketMesh.geometry.rotateX(Math.PI / 2);
    for (let i = 0; i < ROCKET_CAP; i++) {
      _rockets.push({
        active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        distTraveled: 0, smokeAccum: 0, dmg: 280, radius: 6.5, impulse: 18
      });
    }

    // 3. Smoke puffs
    _smokeMesh = makeInstanced(
      new THREE.IcosahedronGeometry(0.32, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false }),
      SMOKE_CAP
    );
    for (let i = 0; i < SMOKE_CAP; i++) {
      _smokes.push({
        active: false, life: 0, maxLife: 1.0,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        startScale: 0.4, endScale: 2.2, color: new THREE.Color(0x555555)
      });
    }

    // 4. Fireballs
    _fireballMesh = makeInstanced(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }),
      FIREBALL_CAP
    );
    for (let i = 0; i < FIREBALL_CAP; i++) {
      _fireballs.push({
        active: false, life: 0, maxLife: 0.36,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        startScale: 0.4, endScale: 4.5, cStart: new THREE.Color(), cEnd: new THREE.Color()
      });
    }

    // 5. Shockwave rings
    _ringMesh = makeInstanced(
      new THREE.RingGeometry(0.65, 1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb866, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      RING_CAP
    );
    _ringMesh.geometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < RING_CAP; i++) {
      _rings.push({ active: false, life: 0, maxLife: 0.30, pos: new THREE.Vector3(), maxRadius: 7.0, color: new THREE.Color(0xffb866) });
    }

    // 6. Sparks
    _sparkMesh = makeInstanced(
      new THREE.BoxGeometry(0.025, 0.025, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }),
      SPARK_CAP
    );
    for (let i = 0; i < SPARK_CAP; i++) {
      _sparks.push({ active: false, life: 0, maxLife: 0.4, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(0xffbb44) });
    }

    // 7. Blood splatters (velocity-stretched arterial droplets)
    _bloodMesh = makeInstanced(
      new THREE.BoxGeometry(0.036, 0.036, 0.11),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      BLOOD_CAP
    );
    for (let i = 0; i < BLOOD_CAP; i++) {
      _bloods.push({ active: false, life: 0, maxLife: 0.5, pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 1.0, color: new THREE.Color(0x7a0c0e) });
    }

    // 8. Glass shards
    _glassMesh = makeInstanced(
      new THREE.BoxGeometry(0.14, 0.18, 0.012),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.08, metalness: 0.25,
        transparent: true, opacity: 0.72, side: THREE.DoubleSide
      }),
      GLASS_CAP
    );
    for (let i = 0; i < GLASS_CAP; i++) {
      _glasses.push({
        active: false, life: 0, maxLife: 1.8,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(), rotVel: new THREE.Vector3(),
        sx: 1, sy: 1, color: new THREE.Color(0xa6d2e2)
      });
    }

    // 9. Concrete rubble chunks
    _rubbleMesh = makeInstanced(
      new THREE.DodecahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.02 }),
      RUBBLE_CAP
    );
    for (let i = 0; i < RUBBLE_CAP; i++) {
      _rubbles.push({
        active: false, life: 0, maxLife: 2.2,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(), rotVel: new THREE.Vector3(),
        scale: 1.0, color: new THREE.Color(0x78756c)
      });
    }

    // 9B. Ejected brass/12G shell casings
    _casingMesh = makeInstanced(
      new THREE.CylinderGeometry(0.0048, 0.0052, 0.024, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.82 }),
      CASING_CAP
    );
    for (let i = 0; i < CASING_CAP; i++) {
      _casings.push({
        active: false, life: 0, maxLife: 2.1, bounced: false, groundY: 0,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(), rotVel: new THREE.Vector3(),
        sx: 1, sy: 1, sz: 1, color: new THREE.Color(0xd4a843)
      });
    }

    // 10. World scorch decals, blood decals, + train/parented scorch decal pool
    const matScorch = new THREE.MeshBasicMaterial({
      map: createFallbackScorchTex(),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide
    });
    _scorchMat = matScorch;
    _scorchGeo = new THREE.PlaneGeometry(1, 1);
    if (typeof _scorchGeo.computeBoundingSphere === 'function') {
      _scorchGeo.computeBoundingSphere();
    }

    _scorchMesh = makeInstanced(_scorchGeo, _scorchMat, SCORCH_CAP);
    for (let i = 0; i < SCORCH_CAP; i++) {
      _scorches.push({ active: false });
    }

    _bloodDecalMat = new THREE.MeshBasicMaterial({
      map: createBloodDecalTex(),
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      side: THREE.DoubleSide
    });
    _bloodDecalMesh = makeInstanced(_scorchGeo, _bloodDecalMat, BLOOD_DECAL_CAP);
    for (let i = 0; i < BLOOD_DECAL_CAP; i++) {
      _bloodDecals.push({
        active: false,
        pos: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        startScale: 0.2,
        targetScale: 1.0,
        aspect: 1.0,
        life: 0,
        growDuration: 0.18
      });
    }

    for (let i = 0; i < ATTACHED_SCORCH_CAP; i++) {
      const m = new THREE.Mesh(_scorchGeo, _scorchMat);
      m.visible = false;
      m.frustumCulled = true;
      m.renderOrder = 2;
      _attachedScorches.push(m);
    }
  }

  function resetPools() {
    const clearList = (arr, mesh) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i].active = false;
        if (mesh) mesh.setMatrixAt(i, _zeroMat);
      }
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    };
    clearList(_tracers, _tracerMesh);
    clearList(_rockets, _rocketMesh);
    clearList(_smokes, _smokeMesh);
    clearList(_fireballs, _fireballMesh);
    clearList(_rings, _ringMesh);
    clearList(_sparks, _sparkMesh);
    clearList(_bloods, _bloodMesh);
    clearList(_glasses, _glassMesh);
    clearList(_rubbles, _rubbleMesh);
    clearList(_casings, _casingMesh);
    clearList(_scorches, _scorchMesh);
    clearList(_bloodDecals, _bloodDecalMesh);
    for (let i = 0; i < _bloodDecals.length; i++) {
      _bloodDecals[i].life = 0;
      _bloodDecals[i].growDuration = 0.18;
    }

    for (let i = 0; i < _attachedScorches.length; i++) {
      const m = _attachedScorches[i];
      m.visible = false;
      if (m.parent) m.parent.remove(m);
    }
    _scorchCursor = 0;
    _bloodDecalCursor = 0;
    _attachedScorchCursor = 0;
  }

  function spawnTracer(p0, p1, thickness) {
    if (!_tracerMesh) return;
    let slot = null;
    for (let i = 0; i < TRACER_CAP; i++) {
      if (!_tracers[i].active) { slot = _tracers[i]; break; }
    }
    if (!slot) slot = _tracers[0];
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 0.048;
    slot.p0.copy(p0);
    slot.p1.copy(p1);
    slot.thickness = thickness || 1.0;
  }

  function spawnSmoke(pos, vel, startScale, endScale, maxLife, hexOrColor) {
    if (!_smokeMesh) return;
    const s = _smokes[_smokeCursor];
    _smokeCursor = (_smokeCursor + 1) % SMOKE_CAP;
    s.active = true;
    s.life = 0;
    s.maxLife = maxLife || 0.9;
    s.pos.copy(pos);
    s.vel.copy(vel);
    s.startScale = startScale || 0.35;
    s.endScale = endScale || 2.0;
    if (hexOrColor instanceof THREE.Color) s.color.copy(hexOrColor);
    else s.color.setHex(hexOrColor !== undefined ? hexOrColor : 0x55524d);
  }

  function spawnFireball(pos, vel, startScale, endScale, maxLife, cStartHex, cEndHex) {
    if (!_fireballMesh) return;
    const f = _fireballs[_fireballCursor];
    _fireballCursor = (_fireballCursor + 1) % FIREBALL_CAP;
    f.active = true;
    f.life = 0;
    f.maxLife = maxLife || 0.34;
    f.pos.copy(pos);
    f.vel.copy(vel);
    f.startScale = startScale || 0.4;
    f.endScale = endScale || 4.0;
    f.cStart.setHex(cStartHex !== undefined ? cStartHex : 0xfff0aa);
    f.cEnd.setHex(cEndHex !== undefined ? cEndHex : 0xd9380b);
  }

  function spawnRing(pos, maxRadius, maxLife, colorHex) {
    if (!_ringMesh) return;
    const r = _rings[_ringCursor];
    _ringCursor = (_ringCursor + 1) % RING_CAP;
    r.active = true;
    r.life = 0;
    r.maxLife = maxLife || 0.30;
    r.pos.copy(pos);
    r.pos.y += 0.08;
    r.maxRadius = maxRadius || 6.8;
    r.color.setHex(colorHex !== undefined ? colorHex : 0xffb866);
  }

  function spawnSparks(pos, count, normalOrDir, inheritVel) {
    if (!_sparkMesh || !pos) return;
    const n = count || 12;
    const baseDir = normalOrDir || _upVec;
    for (let i = 0; i < n; i++) {
      const s = _sparks[_sparkCursor];
      _sparkCursor = (_sparkCursor + 1) % SPARK_CAP;
      s.active = true;
      s.life = 0;
      s.maxLife = 0.22 + Math.random() * 0.28;
      s.pos.set(pos.x, pos.y, pos.z);
      const spd = 4.0 + Math.random() * 9.0;
      s.vel.set(
        baseDir.x * 0.6 + (Math.random() - 0.5) * 1.4,
        baseDir.y * 0.6 + Math.random() * 1.1,
        baseDir.z * 0.6 + (Math.random() - 0.5) * 1.4
      ).normalize().multiplyScalar(spd);
      if (inheritVel) {
        s.vel.x += inheritVel.x || 0;
        s.vel.y += inheritVel.y || 0;
        s.vel.z += inheritVel.z || 0;
      } else if (W._currentTrainSpeed > 1.0 && (Math.abs(pos.x) > 1.25 || pos.y < 0.0 || pos.y > 2.1)) {
        s.vel.z -= W._currentTrainSpeed * 0.8;
      }
      s.color.setHex(Math.random() > 0.3 ? 0xffcc55 : 0xff7722);
    }
  }

  function spawnBlood(pos, dir, count) {
    if (!_bloodMesh || !pos) return;
    const n = count || 10;
    const d = dir || _fwdVec;
    for (let i = 0; i < n; i++) {
      const b = _bloods[_bloodCursor];
      _bloodCursor = (_bloodCursor + 1) % BLOOD_CAP;
      b.active = true;
      b.life = 0;
      b.maxLife = 0.35 + Math.random() * 0.28;
      b.pos.set(pos.x, pos.y, pos.z);
      b.vel.set(
        d.x * 2.5 + (Math.random() - 0.5) * 3.8,
        0.8 + Math.random() * 2.8,
        d.z * 2.5 + (Math.random() - 0.5) * 3.8
      );
      b.scale = 0.6 + Math.random() * 0.9;
      b.color.setHex(Math.random() > 0.35 ? 0x7e0a0e : 0x4d0608);
    }
  }

  function spawnGoreBurst(pos, dir, count) {
    if (!pos) return;
    spawnBlood(pos, dir, count || 26);
    if (!_rubbleMesh) return;
    const d = dir || _upVec;
    const chunkColors = [0x5a0609, 0x3a0204, 0x7a0b10];
    const chunkCount = 9;
    for (let i = 0; i < chunkCount; i++) {
      const r = _rubbles[_rubbleCursor];
      _rubbleCursor = (_rubbleCursor + 1) % RUBBLE_CAP;
      r.active = true;
      r.life = 0;
      r.maxLife = 1.35 + Math.random() * 0.75;
      r.pos.set(
        pos.x + (Math.random() - 0.5) * 0.22,
        pos.y + (Math.random() - 0.5) * 0.22,
        pos.z + (Math.random() - 0.5) * 0.22
      );
      r.vel.set(
        d.x * 3.0 + (Math.random() - 0.5) * 5.8,
        1.8 + Math.random() * 4.4,
        d.z * 3.0 + (Math.random() - 0.5) * 5.8
      );
      r.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      r.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      r.scale = 0.26 + Math.random() * 0.34;
      r.color.setHex(chunkColors[i % chunkColors.length]);
    }
  }

  function spawnGlassShards(pos, count, inheritVel) {
    if (!_glassMesh || !pos) return;
    const n = count || 18;
    for (let i = 0; i < n; i++) {
      const g = _glasses[_glassCursor];
      _glassCursor = (_glassCursor + 1) % GLASS_CAP;
      g.active = true;
      g.life = 0;
      g.maxLife = 1.3 + Math.random() * 0.8;
      g.pos.set(
        pos.x + (Math.random() - 0.5) * 0.55,
        pos.y + (Math.random() - 0.5) * 0.55,
        pos.z + (Math.random() - 0.5) * 0.55
      );
      g.vel.set(
        (Math.random() - 0.5) * 5.2,
        1.0 + Math.random() * 3.4,
        (Math.random() - 0.5) * 5.2
      );
      if (inheritVel) {
        g.vel.x += inheritVel.x || 0;
        g.vel.y += inheritVel.y || 0;
        g.vel.z += inheritVel.z || 0;
      } else if (W._currentTrainSpeed > 1.0 && (Math.abs(pos.x) > 1.25 || pos.y < 0.0 || pos.y > 2.1)) {
        g.vel.z -= W._currentTrainSpeed * 0.85;
      }
      g.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      g.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      g.sx = 0.55 + Math.random() * 0.9;
      g.sy = 0.55 + Math.random() * 0.9;
      g.color.setHex(Math.random() > 0.4 ? 0x9ecae0 : 0xd6eef7);
    }
  }

  function spawnRubble(pos, count, impulseDir) {
    if (!_rubbleMesh || !pos) return;
    const n = count || 12;
    const d = impulseDir || _upVec;
    for (let i = 0; i < n; i++) {
      const r = _rubbles[_rubbleCursor];
      _rubbleCursor = (_rubbleCursor + 1) % RUBBLE_CAP;
      r.active = true;
      r.life = 0;
      r.maxLife = 1.6 + Math.random() * 0.9;
      r.pos.set(
        pos.x + (Math.random() - 0.5) * 0.35,
        pos.y + (Math.random() - 0.5) * 0.35,
        pos.z + (Math.random() - 0.5) * 0.35
      );
      r.vel.set(
        d.x * 2.5 + (Math.random() - 0.5) * 7.5,
        2.2 + Math.random() * 6.5,
        d.z * 2.5 + (Math.random() - 0.5) * 7.5
      );
      r.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      r.rotVel.set((Math.random() - 0.5) * 11, (Math.random() - 0.5) * 11, (Math.random() - 0.5) * 11);
      r.scale = 0.45 + Math.random() * 0.95;
      r.color.setHex(Math.random() > 0.35 ? 0x7b7870 : 0x52504a);
    }
  }

  function ejectShellCasing(weaponId) {
    if (!_casingMesh || !W._camera) return;
    if (weaponId === 'rpg') return;

    W._camera.updateMatrixWorld(true);
    _camRight.setFromMatrixColumn(W._camera.matrixWorld, 0).normalize();
    _camUp.setFromMatrixColumn(W._camera.matrixWorld, 1).normalize();
    W._camera.getWorldDirection(_rayDir);

    const idx = _casingCursor;
    _casingCursor = (_casingCursor + 1) % CASING_CAP;
    const c = _casings[idx];
    c.active = true;
    c.life = 0;
    c.maxLife = weaponId === 'shotgun' ? 2.4 : 2.0;
    c.bounced = false;
    c.groundY = _playerGroundY;

    const slotIdx = weaponId === 'shotgun' ? 2 : (weaponId === 'rifle' ? 1 : 0);
    const vm = _vmModels[slotIdx] || _vmModels[W._activeIdx];
    if (vm && vm.ejectAnchor) {
      vm.ejectAnchor.getWorldPosition(c.pos);
    } else {
      W._camera.getWorldPosition(c.pos);
      c.pos.addScaledVector(_camRight, 0.22).addScaledVector(_camUp, -0.10).addScaledVector(_rayDir, 0.35);
    }

    const rSpd = (weaponId === 'shotgun' ? 2.25 : 2.05) + Math.random() * 0.75;
    const uSpd = (weaponId === 'shotgun' ? 1.55 : 1.35) + Math.random() * 0.55;
    const fSpd = (Math.random() - 0.55) * 0.65;
    c.vel.copy(_playerVel)
      .addScaledVector(_camRight, rSpd)
      .addScaledVector(_camUp, uSpd)
      .addScaledVector(_rayDir, fSpd);

    c.rot.set(Math.random() * 6, Math.random() * 6, Math.PI * 0.5 + (Math.random() - 0.5) * 0.5);
    c.rotVel.set(
      (Math.random() - 0.5) * 26,
      (Math.random() - 0.5) * 22,
      14 + Math.random() * 14
    );

    if (weaponId === 'shotgun') {
      c.sx = 1.9;
      c.sy = 2.2;
      c.sz = 1.9;
      c.color.setHex(0xb91c1c);
    } else if (weaponId === 'rifle') {
      c.sx = 0.85;
      c.sy = 1.45;
      c.sz = 0.85;
      c.color.setHex(0xd4a843);
    } else {
      c.sx = 0.92;
      c.sy = 0.86;
      c.sz = 0.92;
      c.color.setHex(0xd4a843);
    }
  }
  W.ejectShellCasing = ejectShellCasing;

  function spawnScorchDecal(pos, normal, parentGroup, size) {
    if (!pos) return;
    const decalSize = size || 2.1;
    const norm = normal ? _v1.copy(normal).normalize() : _v1.set(0, 1, 0);

    if (parentGroup && parentGroup !== W._scene && typeof parentGroup.worldToLocal === 'function') {
      parentGroup.updateMatrixWorld(true);
      const m = _attachedScorches[_attachedScorchCursor];
      _attachedScorchCursor = (_attachedScorchCursor + 1) % ATTACHED_SCORCH_CAP;
      if (m.parent !== parentGroup) {
        if (m.parent) m.parent.remove(m);
        parentGroup.add(m);
      }
      _localPos.copy(pos);
      parentGroup.worldToLocal(_localPos);

      _invMat.copy(parentGroup.matrixWorld).invert();
      _normMat.getNormalMatrix(_invMat);
      _localNorm.copy(norm).applyMatrix3(_normMat).normalize();

      _localPos.addScaledVector(_localNorm, 0.025);
      m.position.copy(_localPos);
      _q1.setFromUnitVectors(_fwdVec, _localNorm);
      _q2.setFromAxisAngle(_fwdVec, Math.random() * Math.PI * 2);
      m.quaternion.copy(_q1).multiply(_q2);
      m.scale.set(decalSize, decalSize, 1);
      m.visible = true;
      return;
    }

    if (!_scorchMesh) return;
    const idx = _scorchCursor;
    _scorchCursor = (_scorchCursor + 1) % SCORCH_CAP;
    _scorches[idx].active = true;

    _v2.copy(pos).addScaledVector(norm, 0.025);
    _q1.setFromUnitVectors(_fwdVec, norm);
    _q2.setFromAxisAngle(_fwdVec, Math.random() * Math.PI * 2);
    _q1.multiply(_q2);
    _scaleV.set(decalSize, decalSize, 1);
    _m4.compose(_v2, _q1, _scaleV);
    _scorchMesh.setMatrixAt(idx, _m4);
    _scorchMesh.instanceMatrix.needsUpdate = true;
  }

  function spawnBloodDecal(pos, normal, size, isCorpsePool) {
    if (!_bloodDecalMesh || !pos) return;
    let decalSize = size || 0.95;
    const norm = normal ? _v1.copy(normal).normalize() : _v1.set(0, 1, 0);
    _v2.copy(pos);

    if (Math.abs(norm.y) > 0.75 && LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
      _v3.set(_v2.x, _v2.y + 0.45, _v2.z);
      const downHit = LRT.Station.raycastWorld(_v3, _downVec, 1.6);
      if (downHit && downHit.point && Math.abs(downHit.point.y - _v2.y) <= 0.35) {
        if (!downHit.normal || downHit.normal.y > 0.85) {
          const floorY = downHit.point.y;
          _v2.y = floorY;

          // Sample 4 cardinal probes around (pos.x, pos.z) to detect stair treads / ledge drops
          const probeOffsets = [[0.42, 0], [-0.42, 0], [0, 0.42], [0, -0.42]];
          const dropped = [false, false, false, false];
          let dropCount = 0;
          let nudgeX = 0;
          let nudgeZ = 0;
          for (let pi = 0; pi < 4; pi++) {
            const ox = probeOffsets[pi][0];
            const oz = probeOffsets[pi][1];
            _v3.set(_v2.x + ox, floorY + 0.45, _v2.z + oz);
            const pHit = LRT.Station.raycastWorld(_v3, _downVec, 1.6);
            const isStepOrDrop = !pHit || !pHit.point || Math.abs(pHit.point.y - floorY) > 0.08 || (pHit.normal && pHit.normal.y <= 0.85);
            if (isStepOrDrop) {
              dropped[pi] = true;
              dropCount++;
              nudgeX -= ox;
              nudgeZ -= oz;
            }
          }
          const opposingDrop = (dropped[0] && dropped[1]) || (dropped[2] && dropped[3]);
          if (opposingDrop) {
            decalSize = Math.min(decalSize, 0.34);
          } else if (dropCount === 1) {
            const nLen = Math.hypot(nudgeX, nudgeZ) || 1;
            _v2.x += (nudgeX / nLen) * 0.25;
            _v2.z += (nudgeZ / nLen) * 0.25;
            decalSize = Math.min(decalSize, 0.72);
          } else if (dropCount >= 2) {
            const nLen = Math.hypot(nudgeX, nudgeZ);
            if (nLen > 0.01) {
              _v2.x += (nudgeX / nLen) * 0.22;
              _v2.z += (nudgeZ / nLen) * 0.22;
            }
            decalSize = Math.min(decalSize, 0.54);
          }
        } else {
          decalSize = Math.min(decalSize, 0.36);
        }
      }
    }

    const idx = _bloodDecalCursor;
    _bloodDecalCursor = (_bloodDecalCursor + 1) % BLOOD_DECAL_CAP;
    const d = _bloodDecals[idx];
    d.active = true;
    d.pos.copy(_v2).addScaledVector(norm, 0.024);
    _q1.setFromUnitVectors(_fwdVec, norm);
    _q2.setFromAxisAngle(_fwdVec, Math.random() * Math.PI * 2);
    d.quat.copy(_q1).multiply(_q2);
    d.targetScale = decalSize;
    d.aspect = 0.88 + Math.random() * 0.24;
    d.life = 0;
    if (isCorpsePool) {
      d.startScale = decalSize * 0.18;
      d.growDuration = 2.0;
    } else {
      d.startScale = decalSize * 0.68;
      d.growDuration = 0.16;
    }

    _scaleV.set(d.startScale, d.startScale * d.aspect, 1);
    _m4.compose(d.pos, d.quat, _scaleV);
    _bloodDecalMesh.setMatrixAt(idx, _m4);
    _bloodDecalMesh.instanceMatrix.needsUpdate = true;
  }

  function triggerFlashLight(pos, colorHex, intensity, distance, duration) {
    if (!W._flashLight || !pos) return;
    W._flashLight.position.copy(pos);
    W._flashLight.color.setHex(colorHex);
    W._flashLight.intensity = intensity;
    W._flashLight.distance = distance;
    W._flashLight.visible = true;
    W._flashLightMaxIntensity = intensity;
    W._flashLightDuration = duration;
    W._flashLightTimer = duration;
  }

  function emitCityDamageFx(evList, fallbackPt, norm, isExplosion) {
    if (!evList || evList.length === 0) return;
    for (let i = 0; i < evList.length; i++) {
      const ev = evList[i];
      const ep = _v3.set(ev.x, ev.y, ev.z);
      if (ev.kind === 'hydrant') {
        spawnSparks(ep, 10, _upVec);
        for (let k = 0; k < 14; k++) {
          _v1.set((Math.random() - 0.5) * 2.2, 3.8 + Math.random() * 4.2, (Math.random() - 0.5) * 2.2);
          spawnSmoke(ep, _v1, 0.25, 1.35, 0.9, 0xdbeafe);
        }
      } else if (ev.kind === 'vehicle' || ev.kind === 'bus' || ev.kind === 'bike') {
        spawnSparks(fallbackPt || ep, isExplosion ? 16 : 8, norm || _upVec);
        if (ev.justDamaged || isExplosion) {
          for (let k = 0; k < (isExplosion ? 8 : 4); k++) {
            _v1.set((Math.random() - 0.5) * 1.4, 1.4 + Math.random() * 2.2, (Math.random() - 0.5) * 1.4);
            spawnSmoke(ep, _v1, 0.35, 1.8, 0.9, 0x26292e);
          }
          if (ev.kind !== 'bike') spawnGlassShards(fallbackPt || ep, isExplosion ? 6 : 2);
          if (LRT.Audio && LRT.Audio.play && ev.justDamaged) {
            LRT.Audio.play('impact_metal', { gain: 0.72, pitchVar: 0.1 });
          }
        }
      } else if (ev.kind === 'wood_stall') {
        spawnRubble(fallbackPt || ep, isExplosion ? 10 : 5, norm || _upVec);
        _v1.set((Math.random() - 0.5) * 1.6, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.6);
        spawnSmoke(ep, _v1, 0.24, 1.1, 0.65, 0xcbd5e1);
      } else {
        spawnSparks(fallbackPt || ep, isExplosion ? 10 : 5, norm || _upVec);
      }
    }
  }

  function applyExplosion(origin, radius, maxDmg, impulse, fromEnemy) {
    if (!origin) return;
    const rad = radius !== undefined ? radius : 6.5;
    const dmg = maxDmg !== undefined ? maxDmg : 280;
    const imp = impulse !== undefined ? impulse : 18;
    const enemyBlast = !!fromEnemy;

    const origVec = _v4.set(origin.x, origin.y, origin.z);

    // 1. Audio + Blast light + Camera trauma + AI sound impulse
    if (enemyBlast) {
      W.play3D('debris_crumble', origVec, 0.14, 0.95, { refDist: 10.0, maxDist: 90.0 });
      triggerFlashLight(origVec, 0x66ff33, 12.0, 18, 0.28);
    } else {
      W.play3D('rpg_explosion', origVec, 0.08, 1.50, { refDist: 28.0, maxDist: 280.0 });
      W.play3D('debris_crumble', origVec, 0.12, 0.90, { refDist: 20.0, maxDist: 180.0 });
      triggerFlashLight(origVec, 0xff8a24, 48.0, 42, 0.45);
      if (LRT.Enemies && typeof LRT.Enemies.emitSoundImpulse === 'function') {
        LRT.Enemies.emitSoundImpulse(origVec, 80, 'rpg');
      }
    }

    if (W._camera) {
      W._camera.getWorldPosition(_camPos);
      const distToCam = _camPos.distanceTo(origVec);
      const shakeAmt = enemyBlast
        ? Math.max(0.0, 0.45 * (1 - distToCam / 10))
        : Math.max(0.26, 1.0 * (1 - distToCam / 22));
      W._trauma = Math.min(1.0, W._trauma + shakeAmt);
    }

    // 2. Radial enemy damage + knockback
    if (LRT.Enemies && typeof LRT.Enemies.applyBlast === 'function') {
      LRT.Enemies.applyBlast(origVec, rad, dmg, imp);
    }

    // 3. Station & City destruction (pillars, glass, dynamic props, lights, vehicles, hydrants, stalls)
    if (!enemyBlast && LRT.Station && typeof LRT.Station.damageAt === 'function') {
      LRT.Station.damageAt(origVec, rad, dmg, imp, true);
    }
    if (!enemyBlast && LRT.City && typeof LRT.City.damageAt === 'function') {
      const cityEvs = LRT.City.damageAt(origVec, rad, dmg, true);
      emitCityDamageFx(cityEvs, origVec, _upVec, true);
    }

    // 4. Train destruction (windows, livery dent/char, seats, straps, LCDs)
    if (!enemyBlast && LRT.Train && typeof LRT.Train.applyDamage === 'function') {
      LRT.Train.applyDamage(origVec, rad, dmg, imp);
    }

    // 5. Player self-damage / spitter splash damage
    if (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function') {
      const pState = LRT.PlayerUI.getState();
      if (pState && pState.pos) {
        const dx = pState.pos.x - origVec.x;
        const dy = (pState.pos.y + 0.9) - origVec.y;
        const dz = pState.pos.z - origVec.z;
        const pDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (pDist < rad) {
          const falloff = Math.max(0, 1 - pDist / rad);
          const isExploration = (pState.mode === 'exploration') ||
            (LRT.Config && LRT.Config.MODES && pState.mode === LRT.Config.MODES.EXPLORATION);
          let pDmg = 0;
          if (enemyBlast) {
            pDmg = Math.round(dmg * falloff);
          } else if (!isExploration) {
            // Survival mode RPG self-damage capped at 35
            pDmg = Math.round(35 * falloff);
          }
          if (pDmg > 0 && typeof LRT.PlayerUI.takeDamage === 'function') {
            LRT.PlayerUI.takeDamage(pDmg, origVec);
          }
          if (typeof LRT.PlayerUI.applyImpulse === 'function' && pDist > 0.05) {
            const push = imp * 0.45 * falloff;
            LRT.PlayerUI.applyImpulse((dx / pDist) * push, 3.8 * falloff, (dz / pDist) * push);
          }
        }
      }
    }

    // 6. Multi-layered pooled VFX
    if (enemyBlast) {
      spawnRing(origVec, rad * 0.9, 0.25, 0x77ff22);
      for (let i = 0; i < 4; i++) {
        _v1.set((Math.random() - 0.5) * 2.5, 0.8 + Math.random() * 2.0, (Math.random() - 0.5) * 2.5);
        spawnFireball(origVec, _v1, 0.35, 1.9, 0.30, 0xbbff44, 0x2a7a14);
      }
      for (let i = 0; i < 12; i++) {
        _v1.set((Math.random() - 0.5) * 4.5, 0.8 + Math.random() * 3.0, (Math.random() - 0.5) * 4.5);
        spawnSmoke(origVec, _v1, 0.35, 1.8, 0.75, Math.random() > 0.4 ? 0x62b82a : 0x3b6324);
      }
      spawnSparks(origVec, 14, _upVec);
    } else {
      // Double shockwave rings
      spawnRing(origVec, rad * 1.25, 0.36, 0xffd07a);
      spawnRing(origVec, rad * 0.78, 0.24, 0xff7722);
      // Multi-layered fireballs (bright white-gold core + orange-red outer plumes)
      for (let i = 0; i < 11; i++) {
        _v1.set((Math.random() - 0.5) * 4.8, 1.4 + Math.random() * 4.2, (Math.random() - 0.5) * 4.8);
        const scEnd = (i === 0) ? rad * 0.95 : (i < 4 ? rad * 0.68 : 2.4 + Math.random() * 2.8);
        const cStart = i < 3 ? 0xfffad0 : 0xffcc66;
        const cEnd = i < 3 ? 0xff6611 : 0xb81f06;
        spawnFireball(origVec, _v1, 0.55, scEnd, 0.34 + Math.random() * 0.20, cStart, cEnd);
      }
      // Dense billowing dark smoke & soot plume
      for (let i = 0; i < 30; i++) {
        _v1.set((Math.random() - 0.5) * 6.8, 2.2 + Math.random() * 6.4, (Math.random() - 0.5) * 6.8);
        const shade = Math.random() > 0.40 ? 0x242220 : 0x46423d;
        spawnSmoke(origVec, _v1, 0.55, 3.0 + Math.random() * 1.8, 1.25 + Math.random() * 0.85, shade);
      }
      // Sparks & flying concrete rubble chunks
      spawnSparks(origVec, 44, _upVec);
      spawnRubble(origVec, 26, _upVec);

      // Stamp lasting black soot crater onto ground & nearby walls
      const trainBox = (LRT.Train && typeof LRT.Train.isPlayerInside === 'function' && LRT.Train.isPlayerInside(origVec));
      if (!trainBox) {
        let stampedFloor = false;
        if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
          _v2.set(origVec.x, origVec.y + 0.65, origVec.z);
          const downHit = LRT.Station.raycastWorld(_v2, _downVec, 4.0);
          if (downHit && downHit.point) {
            spawnScorchDecal(downHit.point, downHit.normal || _upVec, null, 5.2);
            spawnScorchDecal(downHit.point, downHit.normal || _upVec, null, 3.1);
            stampedFloor = true;
          }
          for (let pi = 0; pi < _probeDirs.length; pi++) {
            const wallHit = LRT.Station.raycastWorld(origVec, _probeDirs[pi], 2.8);
            if (wallHit && wallHit.point) {
              spawnScorchDecal(wallHit.point, wallHit.normal || _upVec, null, 2.5);
            }
          }
        }
        if (!stampedFloor) {
          if (origVec.y >= -1.25 && origVec.y <= -0.90) {
            _v2.set(origVec.x, -0.99, origVec.z);
          } else if (origVec.y > -0.90 && origVec.y <= -0.60) {
            _v2.set(origVec.x, -0.81, origVec.z);
          } else if (origVec.y >= -0.25 && origVec.y <= 0.45) {
            _v2.set(origVec.x, 0.01, origVec.z);
          } else {
            _v2.copy(origVec);
          }
          spawnScorchDecal(_v2, _upVec, null, 5.0);
          spawnScorchDecal(_v2, _upVec, null, 2.9);
        }
      }
    }
  }

  function findNearestHit(origin, dir, maxDist) {
    let best = null;
    let bestDist = maxDist;

    if (LRT.Enemies && typeof LRT.Enemies.raycastHit === 'function') {
      const h = LRT.Enemies.raycastHit(origin, dir, bestDist);
      if (h) {
        const d = h.dist !== undefined ? h.dist : h.distance;
        if (typeof d === 'number' && d < bestDist) {
          bestDist = d;
          best = { kind: 'enemy', dist: d, hit: h };
        }
      }
    }

    if (LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
      const h = LRT.Train.raycastTrain(origin, dir, bestDist);
      if (h) {
        const d = h.dist !== undefined ? h.dist : h.distance;
        if (typeof d === 'number' && d < bestDist) {
          bestDist = d;
          best = { kind: 'train', dist: d, hit: h };
        }
      }
    }

    if (LRT.City && typeof LRT.City.raycastHydrants === 'function') {
      const h = LRT.City.raycastHydrants(origin, dir, bestDist);
      if (h) {
        const d = h.dist !== undefined ? h.dist : h.distance;
        if (typeof d === 'number' && d < bestDist) {
          bestDist = d;
          best = { kind: 'hydrant', dist: d, hit: h };
        }
      }
    }

    if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
      const h = LRT.Station.raycastWorld(origin, dir, bestDist);
      if (h) {
        const d = h.dist !== undefined ? h.dist : h.distance;
        if (typeof d === 'number' && d < bestDist) {
          bestDist = d;
          best = { kind: 'station', dist: d, hit: h };
        }
      }
    }

    return best;
  }

  function launchRocket(weapon, aimOrigin, aimDir, muzzleWorld, dmgScale) {
    let slot = null;
    for (let i = 0; i < ROCKET_CAP; i++) {
      if (!_rockets[i].active) { slot = _rockets[i]; break; }
    }
    if (!slot) slot = _rockets[0];

    // Converge toward crosshair target
    const aimHit = findNearestHit(aimOrigin, aimDir, 160);
    const targetDist = aimHit ? Math.max(4.0, aimHit.dist) : 90.0;
    _v1.copy(aimOrigin).addScaledVector(aimDir, targetDist);

    // Start safely ahead of camera near barrel line
    slot.pos.copy(aimOrigin).addScaledVector(aimDir, 0.75);
    if (muzzleWorld) {
      slot.pos.lerp(muzzleWorld, 0.35);
    }
    _v2.subVectors(_v1, slot.pos).normalize();

    const speed = weapon.rocketSpeed || 48.0;
    slot.vel.copy(_v2).multiplyScalar(speed);
    slot.active = true;
    slot.distTraveled = 0;
    slot.smokeAccum = 0;
    slot.dmg = Math.round((weapon.damage || 280) * (dmgScale || 1.0));
    slot.radius = weapon.blastRadius || 6.5;
    slot.impulse = weapon.knockback || 18.0;

    // Hide visible warhead in RPG tube
    const rpgVm = _vmModels[3];
    if (rpgVm && rpgVm.parts.warhead) {
      rpgVm.parts.warhead.visible = false;
    }

    // Backblast smoke behind player viewmodel
    if (muzzleWorld) {
      _v3.copy(aimDir).multiplyScalar(-2.0);
      spawnSmoke(muzzleWorld, _v3, 0.25, 1.1, 0.45, 0x9c988e);
    }
  }

  function executeShot() {
    const wCfg = W.getEffectiveWeaponConfig(W._activeIdx);
    const wState = W._weaponStates[W._activeIdx];
    if (!wCfg || !wState || !wState.unlocked) return;

    if (wState.mag <= 0) {
      W.play3D('dry_fire', null, 0.03, 0.9);
      W._fireCooldown = 0.22;
      if (wState.reserve > 0 || wCfg.infiniteReserve) {
        W.reload();
      }
      return;
    }

    const diff = W.getDifficultyCfg();
    const dmgScale = (wState.dmgMult || 1.0) * (diff.playerDmgMult || 1.0);

    wState.mag -= 1;
    W._fireCooldown = 60.0 / (wCfg.rpm || 300);

    // Shotgun pump timing (pump12g only; doublebarrel has noPump)
    if (wCfg.id === 'shotgun' && !wCfg.noPump && wCfg.sfxPump) {
      W._pumpTimer = 0.001;
      W._pumpPlayed = false;
    }

    // Revolver cylinder index & hammer snap
    if (wCfg.variantId === 'revolver') {
      W._revolverCylTarget += Math.PI / 3;
      W._revolverHammerKick = 1.0;
    }

    // Audio
    W.play3D(wCfg.sfxFire || 'pistol_fire', null, 0.04, 1.0);

    // Recoil + Bloom + Camera kick
    const adsFactor = W._isADS ? 0.58 : 1.0;
    const isHeavyPistol = wCfg.variantId === 'revolver';
    const isCoach = wCfg.variantId === 'doublebarrel';
    const vmKickZ = isCoach ? 0.115 : (wCfg.id === 'shotgun' ? 0.095 : wCfg.id === 'rpg' ? 0.12 : isHeavyPistol ? 0.068 : 0.045);
    const vmKickPitch = isCoach ? 0.165 : (wCfg.id === 'shotgun' ? 0.14 : wCfg.id === 'rpg' ? 0.16 : isHeavyPistol ? 0.105 : 0.065);
    W._recoilZ = Math.min(0.15, W._recoilZ + vmKickZ);
    W._recoilPitchVM = Math.min(0.28, W._recoilPitchVM + vmKickPitch);
    W._pendingCamPitch += (wCfg.recoilPitch || 0.02) * adsFactor;
    W._pendingCamYaw += (Math.random() - 0.5) * 2 * (wCfg.recoilYaw || 0.008) * adsFactor;
    W._bloom = Math.min(0.038, W._bloom + (wCfg.id === 'rifle' ? 0.0045 : 0.003));
    W._trauma = Math.min(1.0, W._trauma + (wCfg.id === 'rpg' ? 0.42 : isCoach ? 0.34 : wCfg.id === 'shotgun' ? 0.28 : isHeavyPistol ? 0.14 : 0.06));

    // Muzzle flash & light (significantly toned down during ADS so target stays completely clear)
    const vm = _vmModels[W._activeIdx];
    if (vm && vm.muzzleAnchor) {
      vm.muzzleAnchor.getWorldPosition(_muzzlePos);
      if (W._muzzleFlashGroup && wCfg.id !== 'rpg') {
        if (W._muzzleFlashGroup.parent !== vm.muzzleAnchor) {
          vm.muzzleAnchor.add(W._muzzleFlashGroup);
        }
        W._muzzleFlashGroup.position.set(0, 0, W._isADS ? -0.095 : -0.02);
        W._muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
        const baseSc = wCfg.id === 'shotgun' ? 1.25 : wCfg.id === 'rifle' ? 0.92 : 0.72;
        const adsFlashMult = W._isADS ? (wCfg.id === 'rifle' ? 0.30 : 0.38) : 1.0;
        W._muzzleFlashGroup.scale.setScalar(baseSc * adsFlashMult * (0.85 + Math.random() * 0.25));
        W._muzzleFlashGroup.visible = true;
        W._muzzleFlashTimer = W._isADS ? 0.024 : 0.042;
      }
    }

    if (!W._camera) return;
    W._camera.updateMatrixWorld(true);
    W._camera.getWorldPosition(_rayOrigin);
    W._camera.getWorldDirection(_rayDir);
    _camRight.setFromMatrixColumn(W._camera.matrixWorld, 0).normalize();
    _camUp.setFromMatrixColumn(W._camera.matrixWorld, 1).normalize();

    // Illuminate surrounding dark geometry & zombie faces with dynamic muzzle flash light
    if (W._flashLightTimer <= 0.08 && wCfg.id !== 'rpg') {
      const clearProbe = findNearestHit(_rayOrigin, _rayDir, 0.85);
      const fwdPush = clearProbe ? Math.max(0.22, clearProbe.dist - 0.15) : 0.65;
      _flashPos.copy(_rayOrigin).addScaledVector(_rayDir, fwdPush);
      const baseFlash = wCfg.id === 'shotgun' ? 28.0 : (wCfg.id === 'rifle' ? 20.0 : 22.0);
      const lInt = W._isADS ? baseFlash * 0.85 : baseFlash;
      triggerFlashLight(_flashPos, 0xffb355, lInt, 24.0, W._isADS ? 0.075 : 0.095);
    }

    // Emit AI sound perception impulse on gunfire
    const noiseRadius = wCfg.noiseRadius || (wCfg.id === 'rpg' ? 75 : wCfg.id === 'shotgun' ? 50 : wCfg.id === 'rifle' ? 42 : 28);
    if (LRT.Enemies && typeof LRT.Enemies.emitSoundImpulse === 'function') {
      LRT.Enemies.emitSoundImpulse(_rayOrigin, noiseRadius, wCfg.id);
    }

    if (wCfg.projectile) {
      launchRocket(wCfg, _rayOrigin, _rayDir, _muzzlePos, dmgScale);
      W._totalShots++;
      return;
    }

    if (!wCfg.noCasingEject && (wCfg.id === 'pistol' || wCfg.id === 'rifle')) {
      ejectShellCasing(wCfg.id);
    }

    // Hitscan pellets
    const pellets = wCfg.pellets || 1;
    const baseSpread = (W._isADS ? (wCfg.adsSpread || 0.003) : (wCfg.spread || 0.01)) + W._bloom * adsFactor;
    const dismemberMult = wCfg.dismemberMult || 1.0;
    let landedAny = false;
    let anyHeadshot = false;
    let anyKill = false;

    for (let p = 0; p < pellets; p++) {
      W._totalShots++;
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * baseSpread;
      _shotDir.copy(_rayDir)
        .addScaledVector(_camRight, Math.cos(angle) * rad)
        .addScaledVector(_camUp, Math.sin(angle) * rad)
        .normalize();

      const maxDist = wCfg.range || 120;
      const res = findNearestHit(_rayOrigin, _shotDir, maxDist);

      const tracerFwdOff = W._isADS ? 1.15 : 0.28;
      const tracerThick = W._isADS ? 0.42 : (wCfg.id === 'shotgun' ? 0.72 : 0.85);
      _v2.copy(_muzzlePos).addScaledVector(_shotDir, tracerFwdOff);

      if (!res) {
        _v1.copy(_rayOrigin).addScaledVector(_shotDir, Math.min(maxDist, 65));
        spawnTracer(_v2, _v1, tracerThick);
        continue;
      }

      const h = res.hit;
      const pt = h.point;
      const norm = h.normal || _upVec;

      if (h.dist > (W._isADS ? 2.2 : 0.9)) {
        spawnTracer(_v2, pt, tracerThick);
      }

      if (res.kind === 'enemy') {
        landedAny = true;
        if (h.isHeadshot) anyHeadshot = true;
        W._totalHits++;
        const dmg = Math.round((wCfg.damage || 25) * dmgScale * (h.isHeadshot ? (wCfg.headMult || 2.0) : 1.0));
        const effectiveKb = (wCfg.knockback || 2.0) * (dismemberMult > 1.25 ? Math.min(1.6, 0.85 + dismemberMult * 0.25) : 1.0);
        const hitZone = h.hitZone || (h.isHeadshot ? 'head' : 'torso');
        let hitInfo = null;
        if (LRT.Enemies && typeof LRT.Enemies.hitZombie === 'function') {
          hitInfo = LRT.Enemies.hitZombie(
            h.zombieId,
            dmg,
            pt,
            _shotDir,
            effectiveKb,
            !!h.isHeadshot,
            hitZone,
            { dismemberMult, weaponId: wCfg.id, variantId: wCfg.variantId, wCfg }
          );
        }
        if (hitInfo && hitInfo.killed) anyKill = true;
        if (h.isArmor || (hitInfo && hitInfo.armored)) {
          spawnSparks(pt, 6, norm);
          if (p === 0) W.play3D('impact_metal', pt, 0.1, 0.8);
        } else {
          spawnBlood(pt, _shotDir, h.isHeadshot ? 16 : 9);
          if (p === 0) {
            W.play3D('zombie_hit', pt, 0.1, 0.85);
            if (h.isHeadshot) {
              W.play3D('headshot_crit', pt, 0.08, 0.65);
            }
            // Exit blood splatter decal on wall/floor behind target
            if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
              const exitHit = LRT.Station.raycastWorld(pt, _shotDir, 2.4);
              if (exitHit && exitHit.point) {
                spawnBloodDecal(exitHit.point, exitHit.normal || _upVec, h.isHeadshot ? 0.92 : 0.65);
              }
            }
          }
        }
      } else if (res.kind === 'train') {
        const tag = h.material || h.type || h.tag || h.materialTag || (h.isGlass ? 'glass' : 'metal');
        const prevBroken = (LRT.Train && typeof LRT.Train.getStats === 'function') ? (LRT.Train.getStats().brokenWindows || 0) : 0;
        let trainDmgRes = null;
        if (LRT.Train && typeof LRT.Train.applyDamage === 'function') {
          trainDmgRes = LRT.Train.applyDamage(pt, 0.45, Math.round((wCfg.damage || 25) * dmgScale), wCfg.knockback || 2.0, _shotDir);
        }
        const afterBroken = (LRT.Train && typeof LRT.Train.getStats === 'function') ? (LRT.Train.getStats().brokenWindows || 0) : prevBroken;
        const paneJustShattered = afterBroken > prevBroken || !!(trainDmgRes && trainDmgRes.shardsSpawned);
        if (tag === 'glass' || h.isGlass) {
          if (!paneJustShattered) {
            spawnGlassShards(pt, 2);
          }
          if (p === 0 && !paneJustShattered && !(trainDmgRes && trainDmgRes.sfxPlayed)) {
            W.play3D('glass_shatter', pt, 0.1, 0.35);
          }
        } else {
          spawnSparks(pt, pellets > 1 ? 3 : (tag === 'lcd' ? 10 : 8), norm);
          if (p === 0) W.play3D('impact_metal', pt, 0.12, 0.65);
        }
      } else if (res.kind === 'hydrant') {
        const hydId = h.hydrantId ?? (h.hydrant ? h.hydrant.id : null);
        if (LRT.City && typeof LRT.City.triggerHydrant === 'function' && hydId) {
          LRT.City.triggerHydrant(hydId);
        }
        spawnSparks(pt, pellets > 1 ? 3 : 8, norm);
        if (p === 0) W.play3D('impact_metal', pt, 0.12, 0.6);
      } else if (res.kind === 'station') {
        const tag = h.tag || h.material || h.type || h.materialTag || (h.isGlass ? 'glass' : 'concrete');
        const bId = h.barrelId !== undefined ? h.barrelId : (h.collider && h.collider.barrelId !== undefined ? h.collider.barrelId : -1);
        if ((tag === 'barrel' || (h.collider && h.collider.tag === 'barrel')) && bId >= 0) {
          if (LRT.Station && typeof LRT.Station.triggerBarrel === 'function') {
            LRT.Station.triggerBarrel(bId);
          }
        }
        const prevGlass = (LRT.Station && typeof LRT.Station.getStats === 'function') ? (LRT.Station.getStats().brokenGlassCount || 0) : 0;
        let stDmgRes = null;
        if (LRT.Station && typeof LRT.Station.damageAt === 'function') {
          stDmgRes = LRT.Station.damageAt(pt, 0.45, Math.round((wCfg.damage || 25) * dmgScale), wCfg.knockback || 2.0, false, _shotDir);
        }
        if (LRT.City && typeof LRT.City.damageAt === 'function') {
          const cityEvs = LRT.City.damageAt(pt, 0.85, Math.round((wCfg.damage || 25) * dmgScale), false);
          if (cityEvs && cityEvs.length > 0 && p === 0) emitCityDamageFx(cityEvs, pt, norm, false);
        }
        const afterGlass = (LRT.Station && typeof LRT.Station.getStats === 'function') ? (LRT.Station.getStats().brokenGlassCount || 0) : prevGlass;
        const paneJustShattered = afterGlass > prevGlass || !!(stDmgRes && stDmgRes.shardsSpawned);
        if (tag === 'barrel' || (h.collider && h.collider.tag === 'barrel')) {
          spawnSparks(pt, pellets > 1 ? 3 : 8, norm);
          if (p === 0) W.play3D('impact_metal', pt, 0.12, 0.6);
        } else if (tag === 'glass' || h.isGlass) {
          if (!paneJustShattered) {
            spawnGlassShards(pt, 2);
          }
          if (p === 0 && !paneJustShattered && !(stDmgRes && stDmgRes.sfxPlayed)) {
            W.play3D('glass_shatter', pt, 0.1, 0.35);
          }
        } else if (tag === 'metal' || tag === 'steel' || tag === 'prop' || tag === 'tube' || tag === 'pillar_damaged') {
          spawnSparks(pt, pellets > 1 ? 3 : 8, norm);
          if (p === 0) W.play3D('impact_metal', pt, 0.12, 0.6);
        } else {
          spawnRubble(pt, pellets > 1 ? 2 : 5, norm);
          _v2.copy(norm).multiplyScalar(1.2);
          spawnSmoke(pt, _v2, 0.12, 0.55, 0.42, 0x9b978d);
          if (p === 0) W.play3D('impact_concrete', pt, 0.12, 0.65);
          if (p === 0) {
            spawnScorchDecal(pt, norm, null, wCfg.id === 'shotgun' ? 0.36 : 0.22);
          }
        }
      }
    }

    if (landedAny) {
      W._hitmarkerTimer = 0.18;
      W._headshotHit = anyHeadshot;
      if (anyKill) W._killConfirmTimer = 0.35;
    }

    // Auto-reload on empty if desired? Only when pressing fire on empty, or let player tap R / auto-reload on empty rpg
    if (wCfg.id === 'rpg' && wState.mag === 0 && wState.reserve > 0) {
      // slight delay feel: let player see empty tube, reload immediately on next frame if needed or wait for R/fire
    }
  }

  function init(scene, camera) {
    W._scene = scene;
    W._camera = camera;
    if (!W._initialized) {
      W._viewmodelRoot = new THREE.Group();
      W._viewmodelRoot.name = 'LRT_WeaponViewmodels';

      if (typeof W.ensureSkinTexCache === 'function') W.ensureSkinTexCache();
      if (typeof W.createViewmodelMaterials === 'function') W.createViewmodelMaterials();

      if (typeof W.buildAllViewmodels === 'function') {
        W.buildAllViewmodels();
      } else {
        _vmModels.length = 0;
        _vmModels.push(W.buildPistolModel());
        _vmModels.push(W.buildRifleModel());
        _vmModels.push(W.buildShotgunModel());
        _vmModels.push(W.buildRpgModel());
        for (let i = 0; i < _vmModels.length; i++) {
          W._viewmodelRoot.add(_vmModels[i].group);
        }
      }

      W._muzzleFlashGroup = W.buildMuzzleFlash();
      W._flashLight = new THREE.PointLight(0xffaa44, 0, 24, 1.15);
      W._flashLight.castShadow = false;
      W._flashLight.visible = true;
      scene.add(W._flashLight);

      W._rocketLight = new THREE.PointLight(0xff9428, 0, 28, 1.15);
      W._rocketLight.castShadow = false;
      W._rocketLight.visible = true;
      scene.add(W._rocketLight);

      if (camera) camera.add(W._viewmodelRoot);
      W._viewmodelRoot.visible = false;
      initPools(scene);
      W._initialized = true;
    } else {
      if (camera && W._viewmodelRoot.parent !== camera) camera.add(W._viewmodelRoot);
      if (W._flashLight && W._flashLight.parent !== scene) scene.add(W._flashLight);
      if (W._rocketLight && W._rocketLight.parent !== scene) scene.add(W._rocketLight);
      if (W._vfxRoot && W._vfxRoot.parent !== scene) scene.add(W._vfxRoot);
      W._viewmodelRoot.visible = false;
    }

    W.initWeaponStates();
    return Weapons;
  }

  function reset(mode, difficultyKey) {
    resetPools();
    W.initWeaponStates(mode, difficultyKey);
    W._isFiringHeld = false;
    W._meleeCooldown = 0;
    if (W._camera) {
      const pcfg = W.getPlayerCfg();
      W._camera.fov = pcfg.baseFov || 74;
      W._camera.updateProjectionMatrix();
    }
    if (W._flashLight) {
      W._flashLight.intensity = 0;
      W._flashLight.visible = true;
      W._flashLightTimer = 0;
    }
    if (W._rocketLight) {
      W._rocketLight.intensity = 0;
      W._rocketLight.visible = true;
    }
  }

  function fireDown() {
    W._isFiringHeld = true;
    if (W._isReloading || W._switchTimer > 0.08) return;
    if (W._fireCooldown <= 0) {
      executeShot();
    }
  }

  function fireUp() {
    W._isFiringHeld = false;
  }

  function addAmmo(type, amt) {
    const amount = Math.max(0, Math.round(amt || 0));
    if (amount <= 0) return;
    const cfgList = W.getWeaponConfigs();

    if (type === 'all') {
      const scale = amount / 20;
      for (let i = 0; i < W._weaponStates.length; i++) {
        const ws = W._weaponStates[i];
        if (!ws || !ws.unlocked) continue;
        if (!cfgList[i].infiniteReserve) {
          const effMag = W.getEffectiveMagSize(i);
          const maxCap = Math.max(cfgList[i].startReserve * 2, effMag * 6);
          if (amount >= 500) {
            ws.mag = effMag;
            ws.reserve = maxCap;
          } else {
            if (cfgList[i].id === 'rpg') continue;
            const gain = Math.max(1, Math.ceil(cfgList[i].magSize * 1.2 * scale));
            ws.reserve = Math.min(maxCap, ws.reserve + gain);
          }
        }
      }
      return;
    }

    for (let i = 0; i < W._weaponStates.length; i++) {
      if (cfgList[i].id === type || cfgList[i].slot === type) {
        const ws = W._weaponStates[i];
        if (!ws || !ws.unlocked) return;
        if (!cfgList[i].infiniteReserve) {
          const effMag = W.getEffectiveMagSize(i);
          const maxCap = Math.max(cfgList[i].startReserve * 2, effMag * 6);
          ws.reserve = Math.min(maxCap, ws.reserve + amount);
        }
        return;
      }
    }
  }

  function updateRockets(dt) {
    let dirty = false;
    let activeRocketRef = null;
    for (let i = 0; i < ROCKET_CAP; i++) {
      const r = _rockets[i];
      if (!r.active) continue;
      dirty = true;

      const stepDist = r.vel.length() * dt;
      _v1.copy(r.vel).normalize();

      // Raycast ahead along flight path so rocket never tunnels
      const hit = findNearestHit(r.pos, _v1, stepDist + 0.38);
      if (hit) {
        r.active = false;
        _rocketMesh.setMatrixAt(i, _zeroMat);
        applyExplosion(hit.hit.point, r.radius, r.dmg, r.impulse, false);
        continue;
      }

      r.pos.addScaledVector(r.vel, dt);
      r.vel.y -= 1.2 * dt; // subtle realistic arc at long range
      r.distTraveled += stepDist;

      // Ground/range safety detonation
      if (r.pos.y <= -1.6 || r.distTraveled > 210) {
        r.active = false;
        _rocketMesh.setMatrixAt(i, _zeroMat);
        applyExplosion(r.pos, r.radius, r.dmg, r.impulse, false);
        continue;
      }

      activeRocketRef = r;

      // Bright thruster flame + billowing smoke trail + hot sparks
      r.smokeAccum += dt;
      if (r.smokeAccum >= 0.014) {
        r.smokeAccum = 0;
        _v2.set((Math.random() - 0.5) * 1.6, 0.7 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6);
        _v2.addScaledVector(_v1, -2.8);
        spawnSmoke(r.pos, _v2, 0.28, 1.55, 0.75, Math.random() > 0.35 ? 0xb5b1a8 : 0x6c6862);
        _v3.copy(_v1).multiplyScalar(-4.5);
        spawnFireball(r.pos, _v3, 0.16, 0.38, 0.11, 0xfff5aa, 0xff5a12);
        _v3.copy(_v1).multiplyScalar(-1);
        spawnSparks(r.pos, 2, _v3);
      }

      _q1.setFromUnitVectors(_fwdVec, _v1);
      _scaleV.set(1, 1, 1);
      _m4.compose(r.pos, _q1, _scaleV);
      _rocketMesh.setMatrixAt(i, _m4);
    }
    if (W._rocketLight) {
      W._rocketLight.visible = true;
      if (activeRocketRef) {
        W._rocketLight.position.copy(activeRocketRef.pos);
        W._rocketLight.intensity = 26.0 + Math.sin(W._traumaTime * 42.0) * 4.0;
      } else {
        W._rocketLight.intensity = 0;
      }
    }
    if (dirty && _rocketMesh) _rocketMesh.instanceMatrix.needsUpdate = true;
  }

  function updateVfxPools(dt) {
    // 1. Tracers
    if (_tracerMesh) {
      let dirty = false;
      for (let i = 0; i < TRACER_CAP; i++) {
        const t = _tracers[i];
        if (!t.active) continue;
        dirty = true;
        t.life += dt;
        if (t.life >= t.maxLife) {
          t.active = false;
          _tracerMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        const frac = 1.0 - t.life / t.maxLife;
        _v1.subVectors(t.p1, t.p0);
        const len = Math.max(0.05, _v1.length());
        _v1.multiplyScalar(1 / len);
        _v2.addVectors(t.p0, t.p1).multiplyScalar(0.5);
        _q1.setFromUnitVectors(_fwdVec, _v1);
        _scaleV.set(t.thickness * frac, t.thickness * frac, len);
        _m4.compose(_v2, _q1, _scaleV);
        _tracerMesh.setMatrixAt(i, _m4);
      }
      if (dirty) _tracerMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Smoke
    if (_smokeMesh) {
      let dirty = false;
      for (let i = 0; i < SMOKE_CAP; i++) {
        const s = _smokes[i];
        if (!s.active) continue;
        dirty = true;
        s.life += dt;
        if (s.life >= s.maxLife) {
          s.active = false;
          _smokeMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        const t = s.life / s.maxLife;
        s.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
        s.vel.y += 1.4 * dt;
        s.pos.addScaledVector(s.vel, dt);
        const sc = (s.startScale + (s.endScale - s.startScale) * t) * (1 - t * 0.35);
        _q1.identity();
        _scaleV.set(sc, sc, sc);
        _m4.compose(s.pos, _q1, _scaleV);
        _smokeMesh.setMatrixAt(i, _m4);
        _smokeMesh.setColorAt(i, s.color);
      }
      if (dirty) {
        _smokeMesh.instanceMatrix.needsUpdate = true;
        if (_smokeMesh.instanceColor) _smokeMesh.instanceColor.needsUpdate = true;
      }
    }

    // 3. Fireballs
    if (_fireballMesh) {
      let dirty = false;
      for (let i = 0; i < FIREBALL_CAP; i++) {
        const f = _fireballs[i];
        if (!f.active) continue;
        dirty = true;
        f.life += dt;
        if (f.life >= f.maxLife) {
          f.active = false;
          _fireballMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        const t = f.life / f.maxLife;
        f.pos.addScaledVector(f.vel, dt);
        f.vel.multiplyScalar(Math.max(0, 1 - dt * 4.0));
        const sc = (f.startScale + (f.endScale - f.startScale) * Math.pow(t, 0.55)) * (1 - t * 0.65);
        _q1.identity();
        _scaleV.set(sc, sc, sc);
        _m4.compose(f.pos, _q1, _scaleV);
        _fireballMesh.setMatrixAt(i, _m4);
        _color1.lerpColors(f.cStart, f.cEnd, t);
        _fireballMesh.setColorAt(i, _color1);
      }
      if (dirty) {
        _fireballMesh.instanceMatrix.needsUpdate = true;
        if (_fireballMesh.instanceColor) _fireballMesh.instanceColor.needsUpdate = true;
      }
    }

    // 4. Shockwave rings
    if (_ringMesh) {
      let dirty = false;
      for (let i = 0; i < RING_CAP; i++) {
        const r = _rings[i];
        if (!r.active) continue;
        dirty = true;
        r.life += dt;
        if (r.life >= r.maxLife) {
          r.active = false;
          _ringMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        const t = r.life / r.maxLife;
        const sc = 0.4 + r.maxRadius * Math.pow(t, 0.55);
        _q1.identity();
        _scaleV.set(sc, 1, sc);
        _m4.compose(r.pos, _q1, _scaleV);
        _ringMesh.setMatrixAt(i, _m4);
        _color1.copy(r.color).multiplyScalar(1 - t);
        _ringMesh.setColorAt(i, _color1);
      }
      if (dirty) {
        _ringMesh.instanceMatrix.needsUpdate = true;
        if (_ringMesh.instanceColor) _ringMesh.instanceColor.needsUpdate = true;
      }
    }

    // 5. Sparks
    if (_sparkMesh) {
      let dirty = false;
      for (let i = 0; i < SPARK_CAP; i++) {
        const s = _sparks[i];
        if (!s.active) continue;
        dirty = true;
        s.life += dt;
        if (s.life >= s.maxLife) {
          s.active = false;
          _sparkMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        s.vel.y -= 14.0 * dt;
        s.pos.addScaledVector(s.vel, dt);
        if ((s.pos.y < 0.02 && s.pos.y > -0.35 && Math.abs(s.pos.x) < 12) || (s.pos.y < -0.98 && s.pos.y > -1.30)) {
          s.pos.y = s.pos.y > -0.5 ? 0.02 : -0.98;
          s.vel.y = Math.abs(s.vel.y) * 0.45;
          s.vel.x *= 0.7;
          s.vel.z *= 0.7;
        }
        const spd = s.vel.length();
        if (spd > 0.05) _v1.copy(s.vel).multiplyScalar(1 / spd);
        else _v1.copy(_upVec);
        _q1.setFromUnitVectors(_fwdVec, _v1);
        const fade = 1.0 - s.life / s.maxLife;
        _scaleV.set(fade, fade, Math.max(0.5, spd * 0.08) * fade);
        _m4.compose(s.pos, _q1, _scaleV);
        _sparkMesh.setMatrixAt(i, _m4);
        _sparkMesh.setColorAt(i, s.color);
      }
      if (dirty) {
        _sparkMesh.instanceMatrix.needsUpdate = true;
        if (_sparkMesh.instanceColor) _sparkMesh.instanceColor.needsUpdate = true;
      }
    }

    // 6. Blood
    if (_bloodMesh) {
      let dirty = false;
      for (let i = 0; i < BLOOD_CAP; i++) {
        const b = _bloods[i];
        if (!b.active) continue;
        dirty = true;
        b.life += dt;
        if (b.life >= b.maxLife) {
          b.active = false;
          _bloodMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        b.vel.y -= 16.0 * dt;
        b.pos.addScaledVector(b.vel, dt);
        const spd = b.vel.length();
        if (spd > 0.05) _v1.copy(b.vel).multiplyScalar(1 / spd);
        else _v1.copy(_upVec);
        _q1.setFromUnitVectors(_fwdVec, _v1);
        const sc = b.scale * (1.0 - b.life / b.maxLife);
        _scaleV.set(sc, sc, sc * Math.max(0.8, Math.min(2.4, spd * 0.25)));
        _m4.compose(b.pos, _q1, _scaleV);
        _bloodMesh.setMatrixAt(i, _m4);
        _bloodMesh.setColorAt(i, b.color);
      }
      if (dirty) {
        _bloodMesh.instanceMatrix.needsUpdate = true;
        if (_bloodMesh.instanceColor) _bloodMesh.instanceColor.needsUpdate = true;
      }
    }

    // 7. Glass shards
    if (_glassMesh) {
      let dirty = false;
      for (let i = 0; i < GLASS_CAP; i++) {
        const g = _glasses[i];
        if (!g.active) continue;
        dirty = true;
        g.life += dt;
        if (g.life >= g.maxLife) {
          g.active = false;
          _glassMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        g.vel.y -= 17.5 * dt;
        g.pos.addScaledVector(g.vel, dt);
        if ((g.pos.y < 0.04 && g.pos.y > -0.35 && Math.abs(g.pos.x) < 12) || (g.pos.y < -0.96 && g.pos.y > -1.30)) {
          g.pos.y = g.pos.y > -0.5 ? 0.04 : -0.96;
          g.vel.y = Math.abs(g.vel.y) * 0.32;
          g.vel.x *= 0.68;
          g.vel.z *= 0.68;
          g.rotVel.multiplyScalar(0.6);
        }
        g.rot.x += g.rotVel.x * dt;
        g.rot.y += g.rotVel.y * dt;
        g.rot.z += g.rotVel.z * dt;
        const fade = g.life > g.maxLife * 0.7 ? (1 - (g.life - g.maxLife * 0.7) / (g.maxLife * 0.3)) : 1.0;
        _q1.setFromEuler(g.rot);
        _scaleV.set(g.sx * fade, g.sy * fade, fade);
        _m4.compose(g.pos, _q1, _scaleV);
        _glassMesh.setMatrixAt(i, _m4);
        _glassMesh.setColorAt(i, g.color);
      }
      if (dirty) {
        _glassMesh.instanceMatrix.needsUpdate = true;
        if (_glassMesh.instanceColor) _glassMesh.instanceColor.needsUpdate = true;
      }
    }

    // 8. Rubble chunks
    if (_rubbleMesh) {
      let dirty = false;
      for (let i = 0; i < RUBBLE_CAP; i++) {
        const r = _rubbles[i];
        if (!r.active) continue;
        dirty = true;
        r.life += dt;
        if (r.life >= r.maxLife) {
          r.active = false;
          _rubbleMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        r.vel.y -= 19.0 * dt;
        r.pos.addScaledVector(r.vel, dt);
        if ((r.pos.y < 0.07 && r.pos.y > -0.32 && Math.abs(r.pos.x) < 12) || (r.pos.y < -0.93 && r.pos.y > -1.30)) {
          r.pos.y = r.pos.y > -0.5 ? 0.07 : -0.93;
          r.vel.y = Math.abs(r.vel.y) * 0.28;
          r.vel.x *= 0.65;
          r.vel.z *= 0.65;
          r.rotVel.multiplyScalar(0.5);
        }
        r.rot.x += r.rotVel.x * dt;
        r.rot.y += r.rotVel.y * dt;
        r.rot.z += r.rotVel.z * dt;
        const fade = r.life > r.maxLife * 0.7 ? (1 - (r.life - r.maxLife * 0.7) / (r.maxLife * 0.3)) : 1.0;
        _q1.setFromEuler(r.rot);
        _scaleV.setScalar(r.scale * fade);
        _m4.compose(r.pos, _q1, _scaleV);
        _rubbleMesh.setMatrixAt(i, _m4);
        _rubbleMesh.setColorAt(i, r.color);
      }
      if (dirty) {
        _rubbleMesh.instanceMatrix.needsUpdate = true;
        if (_rubbleMesh.instanceColor) _rubbleMesh.instanceColor.needsUpdate = true;
      }
    }

    // 9. Ejected shell casings
    if (_casingMesh) {
      let dirty = false;
      for (let i = 0; i < CASING_CAP; i++) {
        const c = _casings[i];
        if (!c.active) continue;
        dirty = true;
        c.life += dt;
        if (c.life >= c.maxLife) {
          c.active = false;
          _casingMesh.setMatrixAt(i, _zeroMat);
          continue;
        }
        c.vel.y -= 11.5 * dt;
        c.pos.addScaledVector(c.vel, dt);
        const floorY = c.groundY + 0.014;
        if (c.pos.y <= floorY && c.vel.y < 0) {
          c.pos.y = floorY;
          c.vel.y = Math.abs(c.vel.y) * 0.36;
          c.vel.x *= 0.62;
          c.vel.z *= 0.62;
          c.rotVel.multiplyScalar(0.45);
          if (!c.bounced) {
            c.bounced = true;
            const nowMs = performance.now();
            if (nowMs - _lastCasingSfxMs >= 75) {
              _lastCasingSfxMs = nowMs;
              W.play3D(_playerInsideTrain ? 'casing_metal' : 'casing_concrete', c.pos, 0.14, 0.38);
            }
          }
        }
        c.rot.x += c.rotVel.x * dt;
        c.rot.y += c.rotVel.y * dt;
        c.rot.z += c.rotVel.z * dt;
        const fade = c.life > c.maxLife * 0.78 ? (1 - (c.life - c.maxLife * 0.78) / (c.maxLife * 0.22)) : 1.0;
        _q1.setFromEuler(c.rot);
        _scaleV.set(c.sx * fade, c.sy * fade, c.sz * fade);
        _m4.compose(c.pos, _q1, _scaleV);
        _casingMesh.setMatrixAt(i, _m4);
        _casingMesh.setColorAt(i, c.color);
      }
      if (dirty) {
        _casingMesh.instanceMatrix.needsUpdate = true;
        if (_casingMesh.instanceColor) _casingMesh.instanceColor.needsUpdate = true;
      }
    }

    // 10. Blood decals (expanding arterial pool)
    if (_bloodDecalMesh) {
      let dirty = false;
      for (let i = 0; i < BLOOD_DECAL_CAP; i++) {
        const d = _bloodDecals[i];
        if (!d.active || d.life >= d.growDuration) continue;
        dirty = true;
        d.life = Math.min(d.growDuration, d.life + dt);
        const u = d.growDuration > 1e-4 ? (d.life / d.growDuration) : 1.0;
        const ease = 1.0 - Math.pow(1.0 - u, 3);
        const s = d.startScale + (d.targetScale - d.startScale) * ease;
        _scaleV.set(s, s * d.aspect, 1);
        _m4.compose(d.pos, d.quat, _scaleV);
        _bloodDecalMesh.setMatrixAt(i, _m4);
      }
      if (dirty) {
        _bloodDecalMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  function update(dt, playerState, trainSpeed) {
    if (!W._initialized) return;
    if (playerState) {
      if (playerState.pos) _playerGroundY = playerState.pos.y || 0;
      if (playerState.vel) _playerVel.copy(playerState.vel);
      _playerInsideTrain = !!playerState.isInsideTrain;
    }
    const step = Math.min(dt || 0.016, 0.05);
    W._currentTrainSpeed = (typeof trainSpeed === 'number')
      ? trainSpeed
      : ((LRT.Train && typeof LRT.Train.getSpeed === 'function') ? LRT.Train.getSpeed() : 0);

    // Cooldowns & HUD feedback
    if (W._fireCooldown > 0) W._fireCooldown = Math.max(0, W._fireCooldown - step);
    if (W._meleeCooldown > 0) W._meleeCooldown = Math.max(0, W._meleeCooldown - step);
    if (W._hitmarkerTimer > 0) W._hitmarkerTimer = Math.max(0, W._hitmarkerTimer - step);
    if (W._killConfirmTimer > 0) W._killConfirmTimer = Math.max(0, W._killConfirmTimer - step);

    // Full-auto sustain
    const wCfg = W.getEffectiveWeaponConfig(W._activeIdx);
    if (W._isFiringHeld && wCfg && wCfg.fireMode === 'auto' && !W._isReloading && W._switchTimer <= 0.05 && W._fireCooldown <= 0) {
      executeShot();
    }

    // Muzzle flash fade
    if (W._muzzleFlashTimer > 0) {
      W._muzzleFlashTimer -= step;
      if (W._muzzleFlashTimer <= 0 && W._muzzleFlashGroup) {
        W._muzzleFlashGroup.visible = false;
      }
    }

    // Pooled PointLight decay (NEVER toggle .visible — keep visible=true, intensity=0 when off!)
    if (W._flashLight && W._flashLightTimer > 0) {
      W._flashLightTimer -= step;
      if (W._flashLightTimer <= 0) {
        W._flashLight.intensity = 0;
        W._flashLight.visible = true;
      } else {
        const frac = W._flashLightTimer / Math.max(0.01, W._flashLightDuration);
        W._flashLight.intensity = W._flashLightMaxIntensity * frac * frac;
      }
    }

    // Trauma decay & subtle viewmodel shake
    W._traumaTime += step;
    if (W._trauma > 0) {
      W._trauma = Math.max(0, W._trauma - step * 1.45);
    }

    if (W._viewmodelRoot && !W._viewmodelRoot.visible) W._viewmodelRoot.visible = true;
    W.updateViewmodel(step, playerState);
    updateRockets(step);
    updateVfxPools(step);
  }

  const LOOT_TIERS = [
    { key: 'common', label: 'COMMON', weight: 0.50, colorHex: '#94a3b8' },
    { key: 'uncommon', label: 'UNCOMMON', weight: 0.28, colorHex: '#22c55e' },
    { key: 'rare', label: 'RARE', weight: 0.14, colorHex: '#38bdf8' },
    { key: 'epic', label: 'EPIC', weight: 0.06, colorHex: '#a855f7' },
    { key: 'legendary', label: 'LEGENDARY', weight: 0.02, colorHex: '#f59e0b' }
  ];

  const DIFF_LUCK_OFFSET = {
    easy: -0.10,
    medium: 0.00,
    hard: 0.10,
    nightmare: 0.20
  };

  function clamp01(v) {
    return Math.max(0.0, Math.min(1.0, v));
  }

  function computeLootProbabilities(riskLuck, stationIndex, difficultyKey) {
    const baseLuck = typeof riskLuck === 'number' ? riskLuck : 0;
    let effectiveLuck;
    if (stationIndex === undefined && difficultyKey === undefined) {
      effectiveLuck = clamp01(baseLuck);
    } else {
      const sIdx = Math.min(5, Math.max(0, typeof stationIndex === 'number' ? stationIndex : 0));
      const dKey = difficultyKey || W._difficultyKey || 'medium';
      const dOff = (DIFF_LUCK_OFFSET[dKey] !== undefined) ? DIFF_LUCK_OFFSET[dKey] : 0;
      effectiveLuck = clamp01(baseLuck + 0.08 * sIdx + dOff);
    }

    const gamma = 1.0 - 0.30 * effectiveLuck;
    const raw = new Array(LOOT_TIERS.length);
    let sum = 0;
    for (let i = 0; i < LOOT_TIERS.length; i++) {
      const wPrime = Math.pow(LOOT_TIERS[i].weight, gamma);
      raw[i] = wPrime;
      sum += wPrime;
    }

    const probabilities = new Array(LOOT_TIERS.length);
    const result = {
      effectiveLuck,
      gamma,
      probabilities
    };
    for (let i = 0; i < LOOT_TIERS.length; i++) {
      const p = raw[i] / sum;
      probabilities[i] = p;
      result[LOOT_TIERS[i].key] = p;
    }
    return result;
  }

  function pickNextLockedWeapon(orderList) {
    for (let i = 0; i < orderList.length; i++) {
      const idx = W.findWeaponIndex(orderList[i]);
      if (idx >= 0 && W._weaponStates[idx] && !W._weaponStates[idx].unlocked) {
        return orderList[i];
      }
    }
    return null;
  }

  function pickUpgradeTargetWeapon(preferredId, rng) {
    if (preferredId) {
      const pIdx = W.findWeaponIndex(preferredId);
      if (pIdx >= 0 && W._weaponStates[pIdx] && W._weaponStates[pIdx].unlocked) {
        return preferredId;
      }
    }
    const cfgList = W.getWeaponConfigs();
    const unlockedNonPistol = [];
    const unlockedAll = [];
    for (let i = 0; i < W._weaponStates.length; i++) {
      if (W._weaponStates[i] && W._weaponStates[i].unlocked) {
        unlockedAll.push(cfgList[i].id);
        if (cfgList[i].id !== 'pistol') unlockedNonPistol.push(cfgList[i].id);
      }
    }
    const pool = unlockedNonPistol.length > 0 ? unlockedNonPistol : unlockedAll;
    if (!pool.length) return 'pistol';
    const activeCfg = cfgList[W._activeIdx];
    if (activeCfg && pool.indexOf(activeCfg.id) >= 0 && rng() < 0.55) {
      return activeCfg.id;
    }
    return pool[Math.floor(rng() * pool.length) % pool.length];
  }

  function rollLootbox(opts) {
    if (!W._weaponStates || !W._weaponStates.length) {
      W.initWeaponStates();
    }
    const o = opts || {};
    const rng = typeof o.rng === 'function' ? o.rng : Math.random;
    const stationIdx = typeof o.stationIndex === 'number'
      ? o.stationIndex
      : ((I.core && typeof I.core.stationIndex === 'number') ? I.core.stationIndex : 0);
    const diffKey = o.difficultyKey || W._difficultyKey || 'medium';
    const diff = W.getDifficultyCfg(diffKey);
    const pickupMult = typeof diff.pickupAmmoMult === 'number' ? diff.pickupAmmoMult : 1.0;

    const probDist = computeLootProbabilities(
      typeof o.riskLuck === 'number' ? o.riskLuck : 0,
      stationIdx,
      diffKey
    );

    let tierIdx = 0;
    if (o.forcedRarity) {
      const forcedIdx = LOOT_TIERS.findIndex((t) => t.key === o.forcedRarity);
      tierIdx = forcedIdx >= 0 ? forcedIdx : 0;
    } else {
      const u = rng();
      let accum = 0;
      tierIdx = LOOT_TIERS.length - 1;
      for (let i = 0; i < LOOT_TIERS.length; i++) {
        accum += probDist.probabilities[i];
        if (u < accum) {
          tierIdx = i;
          break;
        }
      }
      // Pity protection timers
      if (W._cratesSinceLegendary >= 18) {
        tierIdx = 4;
      } else if (W._cratesSinceEpic >= 7 && tierIdx < 3) {
        tierIdx = 3;
      }
    }

    const tier = LOOT_TIERS[tierIdx];
    if (tier.key === 'legendary') {
      W._cratesSinceLegendary = 0;
      W._cratesSinceEpic = 0;
    } else if (tier.key === 'epic') {
      W._cratesSinceEpic = 0;
      W._cratesSinceLegendary += 1;
    } else {
      W._cratesSinceEpic += 1;
      W._cratesSinceLegendary += 1;
    }

    let unlockedWeapon = null;
    let unlockedVariant = null;
    let ammoGranted = 0;

    // 1. Weapon unlock roll
    let unlockChance = 0;
    let unlockOrder = ['rifle', 'shotgun'];
    if (tier.key === 'uncommon') {
      unlockChance = 0.35;
    } else if (tier.key === 'rare') {
      unlockChance = 0.65;
    } else if (tier.key === 'epic') {
      unlockChance = 1.0;
      unlockOrder = stationIdx >= 1 ? ['rifle', 'shotgun', 'rpg'] : ['rifle', 'shotgun'];
    } else if (tier.key === 'legendary') {
      unlockChance = 1.0;
      unlockOrder = ['rpg', 'shotgun', 'rifle'];
    }

    if (unlockChance > 0) {
      let candidate = null;
      if (o.weaponId) {
        const pIdx = W.findWeaponIndex(o.weaponId);
        if (pIdx >= 0 && W._weaponStates[pIdx] && !W._weaponStates[pIdx].unlocked) {
          candidate = o.weaponId;
        }
      }
      if (!candidate) {
        candidate = pickNextLockedWeapon(unlockOrder);
      }
      if (candidate && (unlockChance >= 1.0 || rng() < unlockChance)) {
        let bonusRes;
        if (candidate === 'rpg') {
          bonusRes = (tier.key === 'legendary') ? 2 : ((diffKey === 'hard' || diffKey === 'nightmare') ? 1 : 2);
        }
        const uRes = W.unlockWeapon(candidate, bonusRes);
        if (uRes && uRes.newlyUnlocked) {
          unlockedWeapon = candidate;
          ammoGranted += (uRes.ammoGranted || 0);
        }
      }
    }

    // 1B. Rare weapon variant roll (if explicit variantId requested, or rare+ crate without base unlock)
    if (o.variantId) {
      const vRes = W.unlockOrEquipVariant(o.weaponId || o.variantId, o.variantId);
      if (vRes && vRes.ok) unlockedVariant = vRes.variantId;
    } else if (!unlockedWeapon && (tier.key === 'rare' || tier.key === 'epic' || tier.key === 'legendary')) {
      const varChance = tier.key === 'legendary' ? 0.70 : (tier.key === 'epic' ? 0.45 : 0.22);
      if (rng() < varChance) {
        const rareCandidates = [
          { wId: 'pistol', vId: 'revolver' },
          { wId: 'rifle', vId: 'm4' },
          { wId: 'rifle', vId: 'ak47' },
          { wId: 'shotgun', vId: 'doublebarrel' }
        ].filter((item) => {
          const idx = W.findWeaponIndex(item.wId);
          const ws = W._weaponStates[idx];
          if (!ws || !ws.unlocked) return false;
          const owned = Array.isArray(ws.unlockedVariants) ? ws.unlockedVariants : [];
          return owned.indexOf(item.vId) === -1;
        });
        if (rareCandidates.length > 0) {
          const pick = rareCandidates[Math.floor(rng() * rareCandidates.length) % rareCandidates.length];
          const vRes = W.unlockOrEquipVariant(pick.wId, pick.vId);
          if (vRes && vRes.ok) unlockedVariant = vRes.variantId;
        }
      }
    }

    // 2. Weapon stat mod roll
    const targetId = pickUpgradeTargetWeapon(unlockedWeapon || o.weaponId, rng);
    const targetIdx = W.findWeaponIndex(targetId);
    const targetCfg = W.getEffectiveWeaponConfig(targetIdx >= 0 ? targetIdx : 0);
    let upgradedWeapon = null;

    if (tier.key === 'common') {
      const magStep = targetId === 'rifle' ? 3 : targetId === 'pistol' ? 2 : 1;
      const mod = (!targetCfg.fixedMag && rng() < 0.5 && targetId !== 'rpg')
        ? { magBonusAdd: magStep }
        : { dmgMultAdd: 0.06 };
      upgradedWeapon = W.applyWeaponUpgrade(targetId, mod);
    } else if (tier.key === 'uncommon') {
      const roll = rng();
      let mod;
      if (roll < 0.34) {
        mod = { dmgMultAdd: 0.08 };
      } else if (roll < 0.67 || targetCfg.fixedMag) {
        mod = { reloadMult: 0.90 };
      } else {
        const magStep = targetId === 'rifle' ? 4 : targetId === 'pistol' ? 3 : 1;
        mod = { magBonusAdd: magStep };
      }
      upgradedWeapon = W.applyWeaponUpgrade(targetId, mod);
    } else if (tier.key === 'rare') {
      upgradedWeapon = W.applyWeaponUpgrade(targetId, { dmgMultAdd: 0.12, reloadMult: 0.88 });
    } else if (tier.key === 'epic') {
      const magStep = targetCfg.fixedMag ? 0 : (targetId === 'rifle' ? 6 : targetId === 'shotgun' ? 2 : targetId === 'pistol' ? 3 : 0);
      upgradedWeapon = W.applyWeaponUpgrade(targetId, { dmgMultAdd: 0.18, reloadMult: 0.82, magBonusAdd: magStep });
    } else if (tier.key === 'legendary') {
      const magStep = targetCfg.fixedMag ? 0 : (targetId === 'rpg' ? 1 : targetId === 'rifle' ? 8 : targetId === 'shotgun' ? 3 : 4);
      upgradedWeapon = W.applyWeaponUpgrade(targetId, { dmgMultAdd: 0.25, reloadMult: 0.78, magBonusAdd: magStep });
    }

    // 3. Bonus ammo supply for unlocked non-infinite weapons when no weapon was unlocked
    if (!unlockedWeapon) {
      const cfgList = W.getWeaponConfigs();
      let ammoTargetId = null;
      if (targetCfg && !targetCfg.infiniteReserve) {
        ammoTargetId = targetCfg.id;
      } else {
        for (let i = 0; i < W._weaponStates.length; i++) {
          if (W._weaponStates[i] && W._weaponStates[i].unlocked && !cfgList[i].infiniteReserve) {
            ammoTargetId = cfgList[i].id;
            break;
          }
        }
      }
      if (ammoTargetId) {
        const aIdx = W.findWeaponIndex(ammoTargetId);
        const aCfg = cfgList[aIdx];
        const aState = W._weaponStates[aIdx];
        let baseGain = 0;
        if (ammoTargetId === 'rpg') {
          baseGain = tier.key === 'legendary' ? 2 : (tier.key === 'epic' || tier.key === 'rare' ? 1 : 0);
        } else {
          const mult = tier.key === 'legendary' ? 2.0 : tier.key === 'epic' ? 1.5 : tier.key === 'rare' ? 1.2 : 0.8;
          baseGain = Math.max(1, Math.round(aCfg.magSize * mult * pickupMult));
        }
        if (baseGain > 0 && aState) {
          const prevRes = aState.reserve;
          addAmmo(ammoTargetId, baseGain);
          ammoGranted += Math.max(0, aState.reserve - prevRes);
        }
      }
    }

    // 4. Armor & HP deltas (returned for campaign_director / PlayerUI to apply)
    let armorGranted = 0;
    let maxArmor = 0;
    let hpGranted = 0;
    if (tier.key === 'common') {
      hpGranted = 15;
    } else if (tier.key === 'uncommon') {
      armorGranted = 25;
      maxArmor = 50;
    } else if (tier.key === 'rare') {
      armorGranted = 35;
      maxArmor = 50;
      hpGranted = 20;
    } else if (tier.key === 'epic') {
      armorGranted = 50;
      maxArmor = 75;
    } else if (tier.key === 'legendary') {
      armorGranted = 75;
      maxArmor = 100;
      hpGranted = 100;
    }

    // 5. Visual skin roll & live application
    let skinUnlocked = null;
    let skinRollId = null;
    if (tier.key === 'common') {
      W._unlockedSkins.add('pindad_standard');
    } else if (tier.key === 'uncommon' && rng() < 0.60) {
      skinRollId = 'tni_digital_forest';
    } else if (tier.key === 'rare' && rng() < 0.80) {
      skinRollId = 'kai_brass_navy';
    } else if (tier.key === 'epic') {
      skinRollId = 'carbon_crimson';
    } else if (tier.key === 'legendary') {
      skinRollId = 'evac_gold_24k';
    }

    if (skinRollId) {
      const hadGlobal = W._unlockedSkins.has(skinRollId);
      const prevWeaponSkin = W._weaponStates[targetIdx] ? W._weaponStates[targetIdx].skinId : null;
      W.applySkin(targetId, skinRollId);
      if (!hadGlobal || prevWeaponSkin !== skinRollId) {
        skinUnlocked = skinRollId;
      }
    }

    // 6. Summary text
    const parts = [`[${tier.label}]`];
    if (unlockedWeapon) parts.push(`UNLOCK ${unlockedWeapon.toUpperCase()}`);
    if (unlockedVariant) parts.push(`VARIANT ${unlockedVariant.toUpperCase()}`);
    if (upgradedWeapon) parts.push(`${targetCfg.shortName} UPGRADE`);
    if (skinUnlocked && W.SKIN_PRESETS && W.SKIN_PRESETS[skinUnlocked]) {
      parts.push(`SKIN: ${W.SKIN_PRESETS[skinUnlocked].name}`);
    }
    if (armorGranted > 0) parts.push(`+${armorGranted} Armor`);
    if (hpGranted > 0) parts.push(hpGranted >= 100 ? 'FULL HP' : `+${hpGranted} HP`);
    if (ammoGranted > 0) parts.push(`+${ammoGranted} Ammo`);

    return {
      rarity: tier.key,
      rarityLabel: tier.label,
      colorHex: tier.colorHex,
      effectiveLuck: probDist.effectiveLuck,
      unlockedWeapon,
      unlockedVariant,
      upgradedWeapon,
      skinUnlocked,
      armorGranted,
      maxArmor,
      hpGranted,
      ammoGranted,
      summaryText: parts.join(' · ')
    };
  }

  function getHudState() {
    const cfgList = W.getWeaponConfigs();
    const wCfg = W.getEffectiveWeaponConfig(W._activeIdx);
    const wState = W._weaponStates[W._activeIdx] || {
      mag: 0, reserve: 0, unlocked: true, magBonus: 0, dmgMult: 1.0, reloadMult: 1.0,
      skinId: 'pindad_standard', variantId: wCfg.variantId || wCfg.defaultVariant, unlockedVariants: []
    };
    const effMagSize = W.getEffectiveMagSize(W._activeIdx) || wCfg.magSize;
    const activeVarId = wState.variantId || wCfg.variantId || W.getDefaultVariantId(wCfg.id);
    return {
      slot: wCfg.slot,
      id: wCfg.id,
      variantId: activeVarId,
      variantName: wCfg.name,
      variantLabel: wCfg.isDefault ? '' : wCfg.name,
      isRareVariant: !wCfg.isDefault && wCfg.rarity !== 'common',
      unlockedVariants: Array.isArray(wState.unlockedVariants) ? wState.unlockedVariants.slice() : [activeVarId],
      name: wCfg.name,
      shortName: wCfg.shortName,
      dismemberMult: wCfg.dismemberMult || 1.0,
      unlocked: wState.unlocked !== false,
      ammoInMag: wState.mag,
      mag: wState.mag,
      magSize: effMagSize,
      baseMagSize: wCfg.magSize,
      magBonus: wState.magBonus || 0,
      dmgMult: wState.dmgMult || 1.0,
      reloadMult: wState.reloadMult || 1.0,
      skinId: wState.skinId || 'pindad_standard',
      reserve: wCfg.infiniteReserve ? Infinity : wState.reserve,
      infReserve: !!wCfg.infiniteReserve,
      infiniteReserve: !!wCfg.infiniteReserve,
      isReloading: W._isReloading,
      reloadProgress: W._isReloading ? Math.max(0, Math.min(1, 1 - W._reloadTimer / W._reloadDuration)) : 0,
      isADS: W._isADS,
      adsBlend: W._adsBlend,
      spread: (W._isADS ? (wCfg.adsSpread || 0.003) : (wCfg.spread || 0.01)) + W._bloom,
      hitmarkerTimer: W._hitmarkerTimer,
      headshotHit: W._headshotHit,
      killConfirmTimer: W._killConfirmTimer,
      trauma: W._trauma,
      totalShots: W._totalShots,
      totalHits: W._totalHits,
      difficultyKey: W._difficultyKey,
      pityCounters: {
        cratesSinceEpic: W._cratesSinceEpic,
        cratesSinceLegendary: W._cratesSinceLegendary
      },
      weapons: W._weaponStates.map((ws, i) => {
        const vc = W.getEffectiveWeaponConfig(i);
        const vId = ws.variantId || vc.variantId || W.getDefaultVariantId(cfgList[i].id);
        return {
          slot: vc.slot,
          id: vc.id,
          variantId: vId,
          variantName: vc.name,
          variantLabel: vc.isDefault ? '' : vc.name,
          name: vc.name,
          shortName: vc.shortName,
          isRareVariant: !vc.isDefault && vc.rarity !== 'common',
          unlockedVariants: Array.isArray(ws.unlockedVariants) ? ws.unlockedVariants.slice() : [vId],
          unlocked: ws.unlocked !== false,
          mag: ws.mag,
          magSize: W.getEffectiveMagSize(i) || vc.magSize,
          baseMagSize: vc.magSize,
          magBonus: ws.magBonus || 0,
          dmgMult: ws.dmgMult || 1.0,
          reloadMult: ws.reloadMult || 1.0,
          skinId: ws.skinId || 'pindad_standard',
          reserve: vc.infiniteReserve ? Infinity : ws.reserve,
          infReserve: !!vc.infiniteReserve
        };
      })
    };
  }

  function meleeShove() {
    if (W._meleeCooldown > 0 || !W._camera) return { hitCount: 0 };
    W._meleeCooldown = 0.95;
    W._recoilZ = -0.10;
    W._recoilPitchVM = -0.14;
    W._trauma = Math.min(1.0, W._trauma + 0.08);
    W.play3D('weapon_switch', null, 0.06, 0.85);

    W._camera.updateMatrixWorld(true);
    W._camera.getWorldPosition(_rayOrigin);
    W._camera.getWorldDirection(_rayDir);

    const enemyInt = I.enemies;
    const pool = enemyInt && enemyInt.zombies ? enemyInt.zombies : null;
    if (!pool || !LRT.Enemies || typeof LRT.Enemies.hitZombie !== 'function') {
      return { hitCount: 0 };
    }

    let hits = 0;
    for (let i = 0; i < pool.length && hits < 2; i++) {
      const z = pool[i];
      if (!z || !z.active || z.dead) continue;
      const dx = z.x - _rayOrigin.x;
      const dy = (z.y + 1.1 * z.scale) - _rayOrigin.y;
      const dz = z.z - _rayOrigin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 2.25) continue;
      const invD = dist > 0.05 ? 1 / dist : 1;
      const dot = (dx * _rayDir.x + dy * _rayDir.y + dz * _rayDir.z) * invD;
      if (dot < 0.45 && dist > 1.05) continue;

      _v1.set(z.x, z.y + 1.15 * z.scale, z.z);
      _v2.set(_rayDir.x, 0, _rayDir.z).normalize();
      const res = LRT.Enemies.hitZombie(z.id, 24, _v1, _v2, 6.8, false, 'torso');
      if (res && res.hit) {
        hits++;
        spawnBlood(_v1, _v2, 6);
        W.play3D('zombie_hit', _v1, 0.08, 0.95);
        W._hitmarkerTimer = 0.16;
        if (res.killed) W._killConfirmTimer = 0.30;
      }
    }
    return { hitCount: hits };
  }

  // Checkpoint save/restore of per-weapon progression (unlocks, variants, ammo, upgrades). Plain data only.
  function getSaveState() {
    const out = { active: W._activeIdx | 0, weapons: [] };
    for (let i = 0; i < W._weaponStates.length; i++) {
      const ws = W._weaponStates[i];
      if (!ws) continue;
      const defVar = W.getDefaultVariantId(ws.id);
      out.weapons.push({
        id: ws.id,
        variantId: ws.variantId || defVar,
        unlockedVariants: Array.isArray(ws.unlockedVariants) ? ws.unlockedVariants.slice() : [defVar],
        unlocked: !!ws.unlocked,
        mag: ws.mag | 0,
        reserve: Number.isFinite(ws.reserve) ? ws.reserve : 0,
        magBonus: ws.magBonus || 0,
        dmgMult: ws.dmgMult || 1,
        reloadMult: ws.reloadMult || 1,
        skinId: ws.skinId || null
      });
    }
    return out;
  }

  function loadSaveState(data) {
    if (!data || !Array.isArray(data.weapons)) return false;
    for (let k = 0; k < data.weapons.length; k++) {
      const s = data.weapons[k];
      for (let i = 0; i < W._weaponStates.length; i++) {
        const ws = W._weaponStates[i];
        if (!ws || ws.id !== s.id) continue;
        const defVar = W.getDefaultVariantId(ws.id);
        ws.unlocked = !!s.unlocked || i === 0;
        ws.magBonus = s.magBonus || 0;
        ws.dmgMult = s.dmgMult || 1;
        ws.reloadMult = s.reloadMult || 1;
        if (Array.isArray(s.unlockedVariants) && s.unlockedVariants.length > 0) {
          ws.unlockedVariants = s.unlockedVariants.slice();
        } else {
          ws.unlockedVariants = [defVar];
        }
        const targetVar = s.variantId || defVar;
        if (ws.unlockedVariants.indexOf(targetVar) === -1) {
          ws.unlockedVariants.push(targetVar);
        }
        if (typeof W.unlockOrEquipVariant === 'function' && targetVar) {
          W.unlockOrEquipVariant(ws.id, targetVar);
        } else {
          ws.variantId = targetVar;
        }
        if (s.skinId && typeof W.applySkin === 'function') {
          W.applySkin(ws.id, s.skinId);
        } else if (s.skinId) {
          ws.skinId = s.skinId;
        }
        ws.mag = Math.max(0, s.mag | 0);
        ws.reserve = Math.max(0, +s.reserve || 0);
        break;
      }
    }
    if (typeof data.active === 'number') {
      const act = Math.max(0, Math.min(W._weaponStates.length - 1, data.active | 0));
      if (W._weaponStates[act] && W._weaponStates[act].unlocked) {
        W._activeIdx = act;
        W.switchWeapon(act + 1);
      }
    }
    return true;
  }

  const Weapons = {
    init,
    reset,
    getSaveState,
    loadSaveState,
    setVisible: W.setVisible,
    setWarmupMode: W.setWarmupMode,
    switchWeapon: W.switchWeapon,
    cycleWeapon: W.cycleWeapon,
    setADS: W.setADS,
    fireDown,
    fireUp,
    reload: W.reload,
    meleeShove,
    addAmmo,
    update,
    applyExplosion,
    spawnGlassShards,
    spawnSparks,
    spawnBlood,
    spawnBloodDecal,
    spawnGoreBurst,
    spawnRubble,
    spawnScorchDecal,
    consumeCameraKick: W.consumeCameraKick,
    getHudState,
    getActiveWeaponConfig: W.getActiveWeaponConfig,
    unlockWeapon: W.unlockWeapon,
    unlockOrEquipVariant: W.unlockOrEquipVariant,
    getVariantCatalog: W.getVariantCatalog,
    buildWorldWeaponMesh: W.buildWorldWeaponMesh,
    applyWeaponUpgrade: W.applyWeaponUpgrade,
    applySkin: W.applySkin,
    warmupSkins: W.warmupSkins,
    getProgressionState: W.getProgressionState,
    setDifficulty: W.setDifficulty,
    rollLootbox,
    computeLootProbabilities,
    ejectShellCasing,
    getCasingStats: () => ({
      cap: CASING_CAP,
      activeCount: _casings.filter((c) => c.active).length
    })
  };

  LRT.Weapons = Weapons;
})(window.LRT = window.LRT || {});
