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

  function mergePartGeometries(parts) {
    let totalVerts = 0;
    const prepped = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      if (p.rx || p.ry || p.rz) {
        const rm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0));
        g.applyMatrix4(rm);
      }
      if (p.tx || p.ty || p.tz) {
        g.translate(p.tx || 0, p.ty || 0, p.tz || 0);
      }
      g.computeVertexNormals();
      if (p.uvRect && g.attributes.uv) {
        const uva = g.attributes.uv.array;
        const u0 = p.uvRect[0], v0 = p.uvRect[1], du = p.uvRect[2] - p.uvRect[0], dv = p.uvRect[3] - p.uvRect[1];
        for (let k = 0; k < uva.length; k += 2) {
          uva[k] = u0 + uva[k] * du;
          uva[k + 1] = v0 + uva[k + 1] * dv;
        }
      }
      totalVerts += g.attributes.position.count;
      prepped.push(g);
    }

    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);
    const uvArr = new Float32Array(totalVerts * 2);
    let offset = 0;
    let uvOffset = 0;
    for (let i = 0; i < prepped.length; i++) {
      const g = prepped[i];
      const pa = g.attributes.position.array;
      const na = g.attributes.normal.array;
      posArr.set(pa, offset);
      normArr.set(na, offset);
      offset += pa.length;
      if (g.attributes.uv) {
        const ua = g.attributes.uv.array;
        uvArr.set(ua, uvOffset);
        uvOffset += ua.length;
      }
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    merged.computeBoundingSphere();
    return merged;
  }

  // 1024x1024 4-quadrant PBR horror atlas (albedo + companion bumpMap & roughnessMap):
  // Top-Left  [u:0..0.5, v:0.5..1]: Woven commuter garment cloth + folds + arterial blood stains (dry cloth 0.85, wet blood 0.25)
  // Bot-Left  [u:0..0.375, v:0..0.5]: Denim/twill trousers + trackbed soot; [0.375..0.5, 0.125..0.5]: Ballistic Kevlar & boot leather; [0.375..0.5, 0..0.125]: Smoked visor
  // Top-Right [u:0.5..0.875, v:0.5..1]: Cadaver skin, veins, wrinkles, wounds; [0.875..1, 0.5..1]: Matted scalp hair
  // Bot-Right [u:0.5..0.75, v:0..0.5]: Sunken eye cavity & feral iris; [0.75..1, 0..0.297]: Clotted gore & ribs; [0.75..1, 0.297..0.5]: Gumline & teeth
  function createZombieTextures() {
    if (typeof document === 'undefined') return { map: null, bumpMap: null, roughnessMap: null };
    const S = 1024;
    const c = document.createElement('canvas');
    const cB = document.createElement('canvas');
    const cR = document.createElement('canvas');
    c.width = cB.width = cR.width = S;
    c.height = cB.height = cR.height = S;
    const ctx = c.getContext('2d');
    const btx = cB.getContext('2d');
    const rtx = cR.getContext('2d');
    if (!ctx || !btx || !rtx) return { map: null, bumpMap: null, roughnessMap: null };

    let s = 4207;
    const rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const setR = (t, r, a) => {
      const v = Math.max(0, Math.min(255, Math.round(r * 255)));
      t.fillStyle = a !== undefined ? `rgba(${v},${v},${v},${a})` : `rgb(${v},${v},${v})`;
    };

    // 1. Top-Left (x: 0..512, y: 0..512) -> Woven commuter garment + folds + arterial blood
    ctx.fillStyle = '#dad7cf';
    ctx.fillRect(0, 0, 512, 512);
    btx.fillStyle = '#808080';
    btx.fillRect(0, 0, 512, 512);
    setR(rtx, 0.85);
    rtx.fillRect(0, 0, 512, 512);

    // Fine woven fabric crosshatch (albedo + bump)
    for (let y = 0; y < 512; y += 3) {
      const n = Math.round(206 + (rng() - 0.5) * 20);
      ctx.fillStyle = `rgb(${n},${n - 2},${n - 6})`;
      ctx.fillRect(0, y, 512, 1);
      const bn = Math.round(128 + (rng() - 0.5) * 32);
      btx.fillStyle = `rgb(${bn},${bn},${bn})`;
      btx.fillRect(0, y, 512, 1);
    }
    for (let x = 0; x < 512; x += 3) {
      const bn = Math.round(128 + (rng() - 0.5) * 24);
      btx.fillStyle = `rgba(${bn},${bn},${bn},0.45)`;
      btx.fillRect(x, 0, 1, 512);
    }
    // Tailored cloth folds & creases
    for (let i = 0; i < 36; i++) {
      const y0 = rng() * 500;
      const dy1 = (rng() - 0.5) * 44;
      const dy2 = (rng() - 0.5) * 52;
      ctx.strokeStyle = 'rgba(38,34,28,0.22)';
      ctx.lineWidth = 2.5 + rng() * 3.0;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.quadraticCurveTo(256, y0 + dy1, 512, y0 + dy2);
      ctx.stroke();

      btx.strokeStyle = i % 2 === 0 ? 'rgba(60,60,60,0.35)' : 'rgba(195,195,195,0.28)';
      btx.lineWidth = 3.5;
      btx.beginPath();
      btx.moveTo(0, y0);
      btx.quadraticCurveTo(256, y0 + dy1, 512, y0 + dy2);
      btx.stroke();
    }
    // Shirt placket & button detail
    ctx.fillStyle = 'rgba(42,38,34,0.28)';
    ctx.fillRect(248, 0, 16, 512);
    btx.fillStyle = 'rgba(175,175,175,0.45)';
    btx.fillRect(248, 0, 16, 512);
    for (let b = 48; b < 490; b += 64) {
      ctx.fillStyle = 'rgba(32,30,28,0.65)';
      ctx.beginPath();
      ctx.arc(256, b, 5, 0, Math.PI * 2);
      ctx.fill();
      btx.fillStyle = '#d8d8d8';
      btx.beginPath();
      btx.arc(256, b, 5, 0, Math.PI * 2);
      btx.fill();
    }
    // Arterial blood splatters & wet gore streaks (roughness drops to 0.25!)
    for (let i = 0; i < 140; i++) {
      const gx = rng() * 500, gy = rng() * 500;
      const rx = 5 + rng() * 36, ry = 7 + rng() * 48;
      const ang = rng() * Math.PI;
      const isBlood = rng() > 0.34;
      ctx.fillStyle = isBlood ? 'rgba(84,12,11,0.50)' : 'rgba(48,42,32,0.34)';
      ctx.beginPath();
      ctx.ellipse(gx, gy, rx, ry, ang, 0, Math.PI * 2);
      ctx.fill();
      if (isBlood) {
        setR(rtx, 0.25, 0.72);
        rtx.beginPath();
        rtx.ellipse(gx, gy, rx * 0.85, ry * 0.85, ang, 0, Math.PI * 2);
        rtx.fill();
      }
    }
    // Chest wound tear shading
    ctx.fillStyle = 'rgba(48,8,8,0.88)';
    ctx.beginPath();
    ctx.ellipse(256, 256, 48, 72, 0.14, 0, Math.PI * 2);
    ctx.fill();
    setR(rtx, 0.24, 0.92);
    rtx.beginPath();
    rtx.ellipse(256, 256, 46, 70, 0.14, 0, Math.PI * 2);
    rtx.fill();

    // 2. Bottom-Left (x: 0..384, y: 512..1024) -> Denim/twill trousers + mud & blood
    ctx.fillStyle = '#cfccc4';
    ctx.fillRect(0, 512, 384, 512);
    btx.fillStyle = '#808080';
    btx.fillRect(0, 512, 384, 512);
    setR(rtx, 0.86);
    rtx.fillRect(0, 512, 384, 512);

    // Diagonal twill weave
    for (let x = 0; x < 384; x += 3) {
      const n = Math.round(192 + (rng() - 0.5) * 24);
      ctx.fillStyle = `rgb(${n},${n - 3},${n - 7})`;
      ctx.fillRect(x, 512, 2, 512);
      const bn = Math.round(128 + (rng() - 0.5) * 28);
      btx.fillStyle = `rgb(${bn},${bn},${bn})`;
      btx.fillRect(x, 512, 1, 512);
    }
    // Trouser creases & mud/soot hem gradient
    const mudGrad = ctx.createLinearGradient(0, 770, 0, 1024);
    mudGrad.addColorStop(0, 'rgba(32,26,20,0)');
    mudGrad.addColorStop(1, 'rgba(26,20,16,0.72)');
    ctx.fillStyle = mudGrad;
    ctx.fillRect(0, 770, 384, 254);
    for (let i = 0; i < 80; i++) {
      const bx = rng() * 376, by = 520 + rng() * 494, br = 5 + rng() * 20;
      const isBlood = rng() > 0.48;
      ctx.fillStyle = isBlood ? 'rgba(74,12,10,0.44)' : 'rgba(38,34,28,0.34)';
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      if (isBlood) {
        setR(rtx, 0.28, 0.65);
        rtx.beginPath();
        rtx.arc(bx, by, br * 0.8, 0, Math.PI * 2);
        rtx.fill();
      }
    }

    // 2b. Tactical Kevlar / Ballistic Nylon / Boot Leather strip (x: 384..512, y: 512..896)
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(384, 512, 128, 384);
    btx.fillStyle = '#808080';
    btx.fillRect(384, 512, 128, 384);
    setR(rtx, 0.58);
    rtx.fillRect(384, 512, 128, 384);
    for (let y = 516; y < 896; y += 8) {
      for (let x = 388; x < 512; x += 8) {
        const shade = ((x + y) % 16 === 0) ? 148 : 118;
        ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
        ctx.fillRect(x, y, 6, 6);
        btx.fillStyle = ((x + y) % 16 === 0) ? '#9e9e9e' : '#646464';
        btx.fillRect(x, y, 6, 6);
      }
    }
    // MOLLE webbing seams & edge scuffs
    for (let y = 540; y < 880; y += 44) {
      ctx.fillStyle = 'rgba(26,30,36,0.55)';
      ctx.fillRect(384, y, 128, 8);
      btx.fillStyle = '#c8c8c8';
      btx.fillRect(384, y, 128, 8);
    }

    // 2c. Dark Smoked Polycarbonate Visor strip (x: 384..512, y: 896..1024)
    const visorGrad = ctx.createLinearGradient(384, 896, 512, 1024);
    visorGrad.addColorStop(0.0, '#141a22');
    visorGrad.addColorStop(0.45, '#222c38');
    visorGrad.addColorStop(1.0, '#10151c');
    ctx.fillStyle = visorGrad;
    ctx.fillRect(384, 896, 128, 128);
    btx.fillStyle = '#808080';
    btx.fillRect(384, 896, 128, 128);
    setR(rtx, 0.14);
    rtx.fillRect(384, 896, 128, 128);
    ctx.strokeStyle = 'rgba(180,200,220,0.16)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(390 + rng() * 40, 904 + rng() * 110);
      ctx.lineTo(445 + rng() * 60, 904 + rng() * 110);
      ctx.stroke();
    }

    // 3. Top-Right (x: 512..896, y: 0..512) -> Necrotic cadaver skin, creases, veins, abrasions
    ctx.fillStyle = '#d6d2c6';
    ctx.fillRect(512, 0, 384, 512);
    btx.fillStyle = '#808080';
    btx.fillRect(512, 0, 384, 512);
    setR(rtx, 0.78);
    rtx.fillRect(512, 0, 384, 512);

    // Mottled livor mortis & skin texture
    for (let i = 0; i < 240; i++) {
      const sx = 512 + rng() * 384, sy = rng() * 512, r = 5 + rng() * 26;
      const isBruise = rng() > 0.42;
      ctx.fillStyle = isBruise ? 'rgba(92,98,88,0.18)' : 'rgba(88,38,38,0.20)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      btx.fillStyle = isBruise ? 'rgba(112,112,112,0.22)' : 'rgba(148,148,148,0.22)';
      btx.beginPath();
      btx.arc(sx, sy, r * 0.65, 0, Math.PI * 2);
      btx.fill();
    }
    // Fine branching subcutaneous veins (albedo + raised bump + slight sheen)
    for (let i = 0; i < 42; i++) {
      let vx = 524 + rng() * 360, vy = 12 + rng() * 488;
      ctx.strokeStyle = 'rgba(54,42,58,0.34)';
      ctx.lineWidth = 1.6;
      btx.strokeStyle = 'rgba(165,165,165,0.40)';
      btx.lineWidth = 2.0;
      ctx.beginPath();
      btx.beginPath();
      ctx.moveTo(vx, vy);
      btx.moveTo(vx, vy);
      for (let k = 0; k < 6; k++) {
        vx += (rng() - 0.5) * 44;
        vy += (rng() - 0.5) * 44;
        ctx.lineTo(vx, vy);
        btx.lineTo(vx, vy);
      }
      ctx.stroke();
      btx.stroke();
    }
    // Skin creases & raw scraped blood patches (wet roughness 0.25)
    for (let i = 0; i < 38; i++) {
      const wx = 524 + rng() * 356, wy = 12 + rng() * 488, wr = 3 + rng() * 14;
      ctx.fillStyle = 'rgba(88,16,14,0.45)';
      ctx.beginPath();
      ctx.ellipse(wx, wy, wr * 1.4, wr * 0.7, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      setR(rtx, 0.26, 0.75);
      rtx.beginPath();
      rtx.ellipse(wx, wy, wr * 1.3, wr * 0.65, 0, 0, Math.PI * 2);
      rtx.fill();
    }

    // 3b. Matted Scalp & Coarse Hair strip (x: 896..1024, y: 0..512)
    ctx.fillStyle = '#2c2724';
    ctx.fillRect(896, 0, 128, 512);
    btx.fillStyle = '#707070';
    btx.fillRect(896, 0, 128, 512);
    setR(rtx, 0.80);
    rtx.fillRect(896, 0, 128, 512);
    for (let i = 0; i < 180; i++) {
      const hx = 898 + rng() * 124;
      ctx.strokeStyle = rng() > 0.35 ? 'rgba(20,17,15,0.7)' : 'rgba(68,60,54,0.5)';
      ctx.lineWidth = 1.5 + rng() * 2.0;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.quadraticCurveTo(hx + (rng() - 0.5) * 18, 256, hx + (rng() - 0.5) * 24, 512);
      ctx.stroke();

      btx.strokeStyle = i % 2 === 0 ? '#a8a8a8' : '#4a4a4a';
      btx.lineWidth = 2.0;
      btx.beginPath();
      btx.moveTo(hx, 0);
      btx.lineTo(hx + (rng() - 0.5) * 14, 512);
      btx.stroke();
    }

    // 4. Bottom-Right (x: 512..1024, y: 512..1024):
    // Left sub-strip [u: 0.50..0.75]: Dark orbital hollow + sharp feral iris (matches headMat aEyeGlow UV check)
    ctx.fillStyle = '#120b0a';
    ctx.fillRect(512, 512, 256, 512);
    btx.fillStyle = '#505050';
    btx.fillRect(512, 512, 256, 512);
    setR(rtx, 0.22);
    rtx.fillRect(512, 512, 256, 512);
    const eyeGrad = ctx.createRadialGradient(640, 768, 5, 640, 768, 76);
    eyeGrad.addColorStop(0.0, '#ffffff');
    eyeGrad.addColorStop(0.28, '#ffd478');
    eyeGrad.addColorStop(0.62, '#9a3410');
    eyeGrad.addColorStop(1.0, 'rgba(18,11,10,0)');
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.arc(640, 768, 76, 0, Math.PI * 2);
    ctx.fill();

    // Right-Lower sub-strip (x: 768..1024, y: 720..1024) -> Clotted crimson gore & exposed ribs
    ctx.fillStyle = '#4e0f0f';
    ctx.fillRect(768, 720, 256, 304);
    btx.fillStyle = '#686868';
    btx.fillRect(768, 720, 256, 304);
    setR(rtx, 0.24);
    rtx.fillRect(768, 720, 256, 304);
    for (let y = 740; y < 1005; y += 44) {
      ctx.fillStyle = '#c8be9e';
      ctx.fillRect(782, y, 228, 16);
      ctx.fillStyle = 'rgba(92,14,14,0.55)';
      ctx.fillRect(782, y + 6, 228, 10);
      btx.fillStyle = '#d4d4d4';
      btx.fillRect(782, y, 228, 16);
      setR(rtx, 0.42);
      rtx.fillRect(782, y, 228, 14);
    }

    // Right-Upper sub-strip (x: 768..1024, y: 512..720) -> Dark gumline & yellowed tooth row
    ctx.fillStyle = '#360a0c';
    ctx.fillRect(768, 512, 256, 208);
    btx.fillStyle = '#555555';
    btx.fillRect(768, 512, 256, 208);
    setR(rtx, 0.26);
    rtx.fillRect(768, 512, 256, 208);
    for (let i = 0; i < 10; i++) {
      const tx = 776 + i * 24;
      ctx.fillStyle = i % 3 === 0 ? '#b7aa86' : '#cfc5a4';
      ctx.fillRect(tx, 548, 18, 134);
      ctx.fillStyle = 'rgba(72,14,12,0.55)';
      ctx.fillRect(tx, 548, 18, 28);
      btx.fillStyle = '#e0e0e0';
      btx.fillRect(tx, 554, 18, 124);
      setR(rtx, 0.32);
      rtx.fillRect(tx, 554, 18, 124);
    }

    const makeTex = (canvas, isSRGB) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.needsUpdate = true;
      return t;
    };

    return {
      map: makeTex(c, true),
      bumpMap: makeTex(cB, false),
      roughnessMap: makeTex(cR, false)
    };
  }

  function sculptGeo(geo, fn) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const res = fn(x, y, z, i);
      if (res) {
        pos.setXYZ(i, res[0], res[1], res[2]);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  function buildZombieMeshes() {
    const shirtUv = [0.02, 0.52, 0.48, 0.98];
    const pantsUv = [0.02, 0.02, 0.35, 0.48];
    const tacticalUv = [0.39, 0.14, 0.48, 0.48];
    const visorUv = [0.39, 0.02, 0.48, 0.12];
    const skinUv = [0.52, 0.52, 0.86, 0.98];
    const hairUv = [0.89, 0.52, 0.98, 0.98];
    const eyeUv = [0.54, 0.08, 0.71, 0.42];
    const boneGoreUv = [0.77, 0.03, 0.98, 0.27];
    const teethUv = [0.77, 0.31, 0.98, 0.48];

    const scaleGeo = (geo, sx, sy, sz) => {
      geo.scale(sx, sy, sz);
      return geo;
    };
    const makeLathe = (pts, segs, sx, sy, sz) => {
      const vpts = pts.map(([r, y]) => new THREE.Vector2(Math.max(0.002, r), y));
      const g = new THREE.LatheGeometry(vpts, segs || 12);
      if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx || 1, sy || 1, sz || 1);
      return g;
    };

    // 1. Sculpted Anatomical Human Skull & Gaunt Face
    //    - Well-proportioned cranium (not pinhead), sculpted supraorbital brow ridge,
    //    - Sunken orbital cavities recessed INSIDE face, flush nasal bridge,
    //    - Deep gaunt cheekbones, hinged unhinged lower mandible & recessed curved teeth rows
    const cranium = sculptGeo(
      scaleGeo(new THREE.SphereGeometry(0.098, 22, 16), 0.85, 1.08, 1.04),
      (x, y, z) => {
        let nx = x, ny = y, nz = z;
        // Slightly flatten temples & narrow lower maxilla
        if (y < 0.02 && z > 0.0) {
          const t = Math.min(1.0, (0.02 - y) / 0.10);
          nx *= 1.0 - 0.24 * t;
        }
        // Taper back bottom of skull into occipital base
        if (y < -0.02 && z < 0.02) {
          ny -= 0.012;
          nz *= 0.92;
        }
        if (z > 0.015) {
          // Supraorbital brow ridge
          const browW = Math.exp(-Math.pow((y - 0.044) / 0.018, 2)) * Math.exp(-Math.pow(x / 0.058, 2));
          const glabellaDip = Math.exp(-Math.pow(x / 0.013, 2)) * 0.004;
          nz += browW * 0.013 - browW * glabellaDip;

          // Sunken orbital cavities recessed deeply INSIDE face
          const orbL = Math.exp(-(Math.pow((x + 0.032) / 0.021, 2) + Math.pow((y - 0.020) / 0.018, 2)));
          const orbR = Math.exp(-(Math.pow((x - 0.032) / 0.021, 2) + Math.pow((y - 0.020) / 0.018, 2)));
          nz -= (orbL + orbR) * 0.028;

          // Flush sculpted nasal bridge (no outward cone nose!)
          const noseRidge = Math.exp(-Math.pow(x / 0.013, 2)) * Math.exp(-Math.pow((y - 0.010) / 0.024, 2));
          const noseTip = Math.exp(-Math.pow(x / 0.014, 2)) * Math.exp(-Math.pow((y + 0.006) / 0.011, 2));
          nz += noseRidge * 0.014 + noseTip * 0.012;

          // Prominent zygomatic cheekbones + hollow gaunt buccal cheeks below
          const cheekL = Math.exp(-(Math.pow((x + 0.048) / 0.020, 2) + Math.pow((y - 0.002) / 0.016, 2)));
          const cheekR = Math.exp(-(Math.pow((x - 0.048) / 0.020, 2) + Math.pow((y - 0.002) / 0.016, 2)));
          const hollowL = Math.exp(-(Math.pow((x + 0.040) / 0.022, 2) + Math.pow((y + 0.032) / 0.022, 2)));
          const hollowR = Math.exp(-(Math.pow((x - 0.040) / 0.022, 2) + Math.pow((y + 0.032) / 0.022, 2)));
          nz += (cheekL + cheekR) * 0.012 - (hollowL + hollowR) * 0.016;
          nx += (cheekL * -0.005 + cheekR * 0.005);

          // Recessed oral gap at bottom front of cranium
          const mouthRecess = Math.exp(-Math.pow(x / 0.034, 2)) * Math.exp(-Math.pow((y + 0.045) / 0.024, 2));
          nz -= mouthRecess * 0.024;
        }
        return [nx, ny, nz];
      }
    );

    // Hinged lower jaw (U-shaped mandible arch + gaunt chin, pitched open)
    const jawArch = scaleGeo(new THREE.TorusGeometry(0.044, 0.015, 7, 14, Math.PI), 0.92, 1.0, 1.15);
    const chinBlock = scaleGeo(new THREE.BoxGeometry(0.044, 0.032, 0.030), 1.0, 1.0, 1.0);
    // Dark recessed oral cavity + curved upper & lower teeth rows
    const mawCavity = scaleGeo(new THREE.CylinderGeometry(0.036, 0.030, 0.056, 10), 0.92, 1.0, 0.78);
    const upperTeethArc = new THREE.CylinderGeometry(0.036, 0.035, 0.013, 10, 1, true, -0.92, 1.84);
    const lowerTeethArc = new THREE.CylinderGeometry(0.033, 0.032, 0.013, 10, 1, true, -0.88, 1.76);

    // Sternocleidomastoid contoured neck
    const neckStump = makeLathe([
      [0.060, -0.065],
      [0.046, -0.01],
      [0.048, 0.04],
      [0.052, 0.065]
    ], 12, 0.94, 1.0, 0.96);

    // Ragged matted scalp / hair cap
    const scalpHair = sculptGeo(
      scaleGeo(new THREE.SphereGeometry(0.101, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), 0.87, 1.02, 1.05),
      (x, y, z) => {
        const ang = Math.atan2(x, z);
        const rag = y < 0.025 ? (Math.sin(ang * 7.0) * 0.010 + Math.cos(ang * 11.0) * 0.006) : 0;
        return [x, y + rag, z];
      }
    );

    const headGeo = mergePartGeometries([
      { geo: cranium, ty: 0.028, uvRect: skinUv },
      { geo: jawArch, ty: -0.042, tz: 0.024, rx: Math.PI * 0.5 + 0.34, uvRect: skinUv },
      { geo: chinBlock, ty: -0.068, tz: 0.056, rx: 0.30, uvRect: skinUv },
      { geo: mawCavity, ty: -0.034, tz: 0.040, rx: 0.20, uvRect: boneGoreUv },
      { geo: upperTeethArc, ty: -0.022, tz: 0.040, uvRect: teethUv },
      { geo: lowerTeethArc, ty: -0.054, tz: 0.038, rx: 0.34, uvRect: teethUv },
      { geo: neckStump, ty: -0.102, tz: -0.014, uvRect: skinUv },
      { geo: scalpHair, ty: 0.032, tz: -0.006, rx: -0.14, uvRect: hairUv },
      // Recessed orbital irises seated INSIDE the sunken cavities (eyeUv matched to aEyeGlow shader)
      { geo: new THREE.CircleGeometry(0.013, 12), tx: -0.032, ty: 0.046, tz: 0.072, ry: -0.16, uvRect: eyeUv },
      { geo: new THREE.CircleGeometry(0.013, 12), tx: 0.032, ty: 0.046, tz: 0.072, ry: 0.16, uvRect: eyeUv }
    ]);

    const eyeGlowArr = new Float32Array(MAX_ENEMIES * 3);
    E._st._headEyeAttr = new THREE.InstancedBufferAttribute(eyeGlowArr, 3);
    headGeo.setAttribute('aEyeGlow', E._st._headEyeAttr);

    // 2. Anatomical Gaunt Torso (pelvis, waist, ribcage, pectorals, clavicle, sternal hollow, spinal groove)
    const torsoLathe = sculptGeo(
      makeLathe([
        [0.012, -0.270],
        [0.140, -0.245], // Pelvis
        [0.126, -0.170],
        [0.110, -0.070], // Tapered waist
        [0.124, 0.020],
        [0.156, 0.125],  // Ribcage / Pectorals
        [0.168, 0.215],  // Broad shoulders / deltoid shelf
        [0.124, 0.275],  // Trapezius
        [0.062, 0.305],  // Collar base
        [0.010, 0.312]
      ], 18, 1.24, 1.0, 0.70),
      (x, y, z) => {
        let nx = x, ny = y, nz = z;
        // Subtle cloth fold & ribcage contour on front/sides
        if (nz > 0.02) {
          const sternumDip = Math.exp(-Math.pow(nx / 0.032, 2)) * Math.exp(-Math.pow((ny - 0.13) / 0.09, 2));
          nz -= sternumDip * 0.016;
          // Recessed chest gash cavity
          const gash = Math.exp(-Math.pow((nx - 0.01) / 0.055, 2)) * Math.exp(-Math.pow((ny - 0.10) / 0.075, 2));
          nz -= gash * 0.014;
        }
        // Subtle dorsal spine groove down back (no bead spheres!)
        if (nz < -0.03) {
          const groove = Math.exp(-Math.pow(nx / 0.026, 2)) * (ny > -0.18 && ny < 0.24 ? 1 : 0);
          nz += groove * 0.012;
        }
        // Organic garment crease ripples around waist/hips
        nz += Math.sin(ny * 34.0 + nx * 12.0) * 0.004;
        return [nx, ny, nz];
      }
    );

    // Sculpted recessed rib slats inside the torn chest cavity (curved arcs, not a flat slab)
    const chestWoundParts = [
      { geo: scaleGeo(new THREE.CylinderGeometry(0.058, 0.048, 0.145, 10), 1.15, 1.0, 0.24), tx: 0.008, ty: 0.105, tz: 0.092, uvRect: boneGoreUv }
    ];
    for (let r = 0; r < 4; r++) {
      chestWoundParts.push({
        geo: new THREE.TorusGeometry(0.052, 0.006, 5, 10, Math.PI * 0.55),
        tx: 0.008, ty: 0.058 + r * 0.030, tz: 0.068,
        rx: Math.PI * 0.52, rz: -Math.PI * 0.28,
        uvRect: teethUv
      });
    }
    const torsoGeo = mergePartGeometries([
      { geo: torsoLathe, ty: 0.0, uvRect: shirtUv },
      ...chestWoundParts
    ]);

    // 3. Articulated Upper Arm (Shoulder (0,0,0) -> Elbow (0, -0.255, 0), anatomical deltoid & frayed sleeve cuff)
    const upperArmLathe = makeLathe([
      [0.010, 0.036],
      [0.056, 0.012],
      [0.058, -0.045], // Deltoid
      [0.050, -0.125], // Bicep
      [0.045, -0.205],
      [0.052, -0.222], // Frayed sleeve hem flare
      [0.038, -0.226],
      [0.036, -0.255], // Elbow joint
      [0.012, -0.268]
    ], 12, 0.98, 1.0, 1.02);
    const upperArmGeo = mergePartGeometries([
      { geo: upperArmLathe, ty: 0.0, uvRect: shirtUv },
      { geo: new THREE.SphereGeometry(0.036, 10, 8), ty: -0.255, uvRect: skinUv }
    ]);

    // 4. Articulated Forearm + Anatomical Wrist, Palm, Thumb & Naturally Curled Tattered Fingers
    //    (Elbow (0,0,0) -> Wrist (0,-0.225,0) -> Finger tips (~-0.33))
    const forearmLathe = makeLathe([
      [0.010, 0.020],
      [0.038, 0.000],
      [0.042, -0.055], // Brachioradialis muscle bulge
      [0.033, -0.145],
      [0.025, -0.215], // Tapered wrist
      [0.012, -0.225]
    ], 12, 1.02, 1.0, 0.86);
    const palmGeo = sculptGeo(
      new THREE.BoxGeometry(0.054, 0.064, 0.026, 3, 3, 2),
      (x, y, z) => {
        const taper = y > 0 ? (1.0 - (y / 0.032) * 0.16) : 1.0;
        const arch = Math.cos((x / 0.03) * 1.1) * 0.004;
        return [x * taper, y, z + arch];
      }
    );
    const fingerSpecs = [
      { x: -0.020, len: 0.050, r: 0.0068, curl: -0.28 }, // Index
      { x: -0.006, len: 0.056, r: 0.0070, curl: -0.34 }, // Middle
      { x: 0.008,  len: 0.052, r: 0.0066, curl: -0.38 }, // Ring
      { x: 0.021,  len: 0.042, r: 0.0058, curl: -0.44 }  // Pinky
    ];
    const handParts = [
      { geo: forearmLathe, ty: 0.0, uvRect: skinUv },
      // Dorsal wrist tendon ridges
      { geo: new THREE.CylinderGeometry(0.004, 0.003, 0.095, 5), tx: -0.008, ty: -0.185, tz: -0.015, uvRect: skinUv },
      { geo: new THREE.CylinderGeometry(0.004, 0.003, 0.095, 5), tx: 0.008, ty: -0.185, tz: -0.015, uvRect: skinUv },
      // Palm
      { geo: palmGeo, ty: -0.246, tz: 0.002, uvRect: skinUv },
      // Opposable 2-segment thumb
      { geo: new THREE.CylinderGeometry(0.0075, 0.0065, 0.032, 6), tx: -0.030, ty: -0.242, tz: 0.012, rz: 0.55, rx: -0.30, uvRect: skinUv },
      { geo: new THREE.CylinderGeometry(0.0062, 0.0048, 0.026, 6), tx: -0.042, ty: -0.264, tz: 0.022, rz: 0.30, rx: -0.65, uvRect: boneGoreUv }
    ];
    for (let f = 0; f < fingerSpecs.length; f++) {
      const fs = fingerSpecs[f];
      const proxLen = fs.len * 0.58;
      const distLen = fs.len * 0.45;
      // Proximal phalanx
      handParts.push({
        geo: new THREE.CylinderGeometry(fs.r, fs.r * 0.86, proxLen, 6),
        tx: fs.x, ty: -0.278 - proxLen * 0.45, tz: 0.008,
        rx: fs.curl, rz: (f - 1.5) * -0.04,
        uvRect: skinUv
      });
      // Naturally curled distal phalanx
      handParts.push({
        geo: new THREE.CylinderGeometry(fs.r * 0.84, fs.r * 0.55, distLen, 6),
        tx: fs.x, ty: -0.278 - proxLen * 0.92 - distLen * 0.34, tz: 0.016 - fs.curl * 0.022,
        rx: fs.curl - 0.52, rz: (f - 1.5) * -0.04,
        uvRect: boneGoreUv
      });
    }
    const forearmGeo = mergePartGeometries(handParts);

    // 5. Articulated Thigh (Hip (0,0,0) -> Knee (0, -0.375, 0), trouser fold contour)
    const thighLathe = makeLathe([
      [0.015, 0.035],
      [0.074, 0.005],
      [0.076, -0.065],
      [0.068, -0.175],
      [0.058, -0.295],
      [0.052, -0.365],
      [0.015, -0.382]
    ], 12, 0.98, 1.0, 1.04);
    const thighGeo = mergePartGeometries([
      { geo: thighLathe, ty: 0.0, uvRect: pantsUv },
      { geo: new THREE.SphereGeometry(0.050, 10, 8), ty: -0.372, tz: 0.008, uvRect: pantsUv }
    ]);

    // 6. Articulated Calf & Weathered Laced Shoe/Boot (Knee (0,0,0) -> Sole (0, -0.415, 0))
    const calfTrouserLathe = makeLathe([
      [0.048, -0.265], // Trouser hem cuff overlap
      [0.056, -0.258],
      [0.058, -0.180], // Calf swelling inside trouser leg
      [0.062, -0.095],
      [0.056, -0.020],
      [0.048, 0.015]
    ], 12, 0.94, 1.0, 1.08);
    const ankleShinLathe = makeLathe([
      [0.036, -0.345],
      [0.034, -0.305],
      [0.040, -0.260]
    ], 10, 0.92, 1.0, 1.0);
    const bootUpper = sculptGeo(
      new THREE.BoxGeometry(0.088, 0.064, 0.215, 3, 2, 4),
      (x, y, z) => {
        let nx = x, ny = y, nz = z;
        // Taper toe box downward and round front
        if (nz > 0.02) {
          const tf = (nz - 0.02) / 0.088;
          nx *= 1.0 - tf * 0.22;
          if (ny > 0) ny *= 1.0 - tf * 0.42;
        }
        return [nx, ny, nz];
      }
    );
    const calfGeo = mergePartGeometries([
      { geo: calfTrouserLathe, ty: 0.0, uvRect: pantsUv },
      { geo: ankleShinLathe, ty: 0.0, uvRect: skinUv },
      // Boot collar / ankle shaft
      { geo: new THREE.CylinderGeometry(0.046, 0.048, 0.085, 10), ty: -0.345, tz: -0.008, uvRect: tacticalUv },
      // Boot upper + sole + heel block
      { geo: bootUpper, ty: -0.376, tz: 0.044, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.092, 0.018, 0.222), ty: -0.406, tz: 0.044, uvRect: tacticalUv },
      // Instep lace tongue ridge
      { geo: new THREE.BoxGeometry(0.042, 0.020, 0.075), ty: -0.346, tz: 0.046, rx: 0.28, uvRect: pantsUv }
    ]);

    // 7a. Brute: Indonesian Mobile Brigade / LRT Tactical Riot Vest (ballistic plates, pouches, neck guard, pauldrons)
    const bruteArmorGeo = mergePartGeometries([
      // Front & back angled ballistic chest/back plates
      { geo: new THREE.BoxGeometry(0.35, 0.34, 0.24), ty: 0.07, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.28, 0.28, 0.27), ty: 0.09, tz: 0.005, uvRect: tacticalUv },
      // Padded tactical neck gorget guard
      { geo: new THREE.CylinderGeometry(0.112, 0.128, 0.095, 12, 1, false, 0.65, Math.PI * 1.60), ty: 0.27, rx: 0.06, uvRect: tacticalUv },
      // Shoulder harness straps
      { geo: new THREE.BoxGeometry(0.065, 0.04, 0.22), tx: -0.115, ty: 0.265, rz: 0.12, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.065, 0.04, 0.22), tx: 0.115, ty: 0.265, rz: -0.12, uvRect: tacticalUv },
      // 3 front rifle/SMG magazine pouches + utility belt
      { geo: new THREE.BoxGeometry(0.37, 0.09, 0.26), ty: -0.11, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.065, 0.115, 0.055), tx: -0.095, ty: -0.085, tz: 0.145, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.065, 0.115, 0.055), tx: 0.0, ty: -0.085, tz: 0.145, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.065, 0.115, 0.055), tx: 0.095, ty: -0.085, tz: 0.145, uvRect: tacticalUv },
      // Left collarbone tactical radio pouch + antenna
      { geo: new THREE.BoxGeometry(0.055, 0.085, 0.045), tx: -0.115, ty: 0.16, tz: 0.140, uvRect: tacticalUv },
      { geo: new THREE.CylinderGeometry(0.005, 0.005, 0.12, 5), tx: -0.125, ty: 0.25, tz: 0.142, uvRect: tacticalUv },
      // Pelvic groin armor flap
      { geo: new THREE.BoxGeometry(0.18, 0.13, 0.045), ty: -0.21, tz: 0.115, rx: -0.12, uvRect: tacticalUv },
      // Articulated shoulder pauldrons
      { geo: new THREE.CylinderGeometry(0.075, 0.098, 0.15, 10, 1, false, -0.5, Math.PI + 1.0), tx: -0.245, ty: 0.20, rz: 0.48, ry: -Math.PI * 0.5, uvRect: tacticalUv },
      { geo: new THREE.CylinderGeometry(0.075, 0.098, 0.15, 10, 1, false, -0.5, Math.PI + 1.0), tx: 0.245, ty: 0.20, rz: -0.48, ry: Math.PI * 0.5, uvRect: tacticalUv }
    ]);

    // 7b. Brute: Full Riot Helmet + Dark Smoked Polycarbonate Visor & Hinge Bolts
    const bruteHelmetGeo = mergePartGeometries([
      // Main ballistic shell + rear nape skirt
      { geo: scaleGeo(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.60), 0.94, 1.02, 1.08), ty: 0.044, uvRect: tacticalUv },
      { geo: new THREE.CylinderGeometry(0.110, 0.118, 0.095, 12, 1, false, 1.15, Math.PI * 1.25), ty: -0.005, tz: -0.015, uvRect: tacticalUv },
      // Ear protection pods & brow reinforcement visor frame
      { geo: new THREE.CylinderGeometry(0.036, 0.036, 0.024, 10), tx: -0.110, ty: 0.025, tz: -0.005, rz: Math.PI * 0.5, uvRect: tacticalUv },
      { geo: new THREE.CylinderGeometry(0.036, 0.036, 0.024, 10), tx: 0.110, ty: 0.025, tz: -0.005, rz: Math.PI * 0.5, uvRect: tacticalUv },
      { geo: new THREE.TorusGeometry(0.104, 0.012, 6, 14, Math.PI * 1.05), ty: 0.068, tz: 0.014, rx: Math.PI * 0.5, rz: -Math.PI * 0.025, uvRect: tacticalUv },
      // Dark smoked polycarbonate face shield visor
      { geo: scaleGeo(new THREE.CylinderGeometry(0.106, 0.102, 0.115, 14, 1, true, -1.05, 2.10), 0.96, 1.0, 1.08), ty: 0.010, tz: 0.016, rx: -0.06, uvRect: visorUv }
    ]);

    // 7c. Spitter: Pulsating Bioluminescent Neck/Chest/Back Vomit Blisters & Sores (bioMat)
    const spitterBioGeo = mergePartGeometries([
      { geo: new THREE.SphereGeometry(0.044, 9, 7), tx: -0.095, ty: 0.19, tz: 0.108, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.054, 9, 7), tx: 0.088, ty: 0.14, tz: 0.112, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.038, 8, 6), tx: -0.025, ty: 0.25, tz: 0.088, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.046, 8, 6), tx: 0.135, ty: 0.23, tz: 0.018, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.068, 10, 8), tx: -0.105, ty: 0.16, tz: -0.112, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.052, 8, 6), tx: 0.018, ty: -0.03, tz: -0.132, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.048, 8, 6), tx: 0.095, ty: 0.22, tz: -0.138, uvRect: eyeUv }
    ]);

    // 7c-2. Spitter: Ruptured Torn Hazmat Collar/Straps + Pressurized Cracked Canister & Hose on Back
    const spitterGearGeo = mergePartGeometries([
      // Torn hazmat hood collar & chest zipper flaps
      { geo: new THREE.CylinderGeometry(0.085, 0.135, 0.085, 12, 1, true), ty: 0.285, tz: -0.01, uvRect: shirtUv },
      { geo: new THREE.BoxGeometry(0.055, 0.24, 0.018), tx: -0.068, ty: 0.12, tz: 0.118, rz: 0.16, ry: -0.18, uvRect: shirtUv },
      { geo: new THREE.BoxGeometry(0.055, 0.22, 0.018), tx: 0.068, ty: 0.11, tz: 0.116, rz: -0.18, ry: 0.18, uvRect: shirtUv },
      // Shoulder harness straps
      { geo: new THREE.BoxGeometry(0.042, 0.032, 0.23), tx: -0.115, ty: 0.262, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.042, 0.032, 0.23), tx: 0.115, ty: 0.262, uvRect: tacticalUv },
      // Ruptured pressurized chemical canister on back + valve cap + breather hose
      { geo: new THREE.CylinderGeometry(0.064, 0.064, 0.31, 12), tx: 0.048, ty: 0.085, tz: -0.155, rz: -0.18, uvRect: tacticalUv },
      { geo: new THREE.CylinderGeometry(0.032, 0.048, 0.045, 10), tx: 0.076, ty: 0.255, tz: -0.155, rz: -0.18, uvRect: tacticalUv },
      { geo: new THREE.TorusGeometry(0.072, 0.013, 6, 12, Math.PI * 1.15), tx: 0.04, ty: 0.25, tz: -0.04, ry: Math.PI * 0.5, rx: 0.25, uvRect: tacticalUv }
    ]);

    // 7c-3. Spitter: Swollen Split Respirator / Gas-Mask Housing Hanging Off Jaw
    const spitterMaskGeo = mergePartGeometries([
      // Hanging rubber respirator cup pulled down off chin/jaw
      { geo: scaleGeo(new THREE.CylinderGeometry(0.048, 0.036, 0.070, 10), 1.0, 1.0, 0.85), tx: 0.012, ty: -0.082, tz: 0.068, rx: 0.65, rz: -0.22, uvRect: tacticalUv },
      // Dual filter cartridges (left cracked/dangling, right intact)
      { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.032, 8), tx: -0.038, ty: -0.095, tz: 0.064, rz: 1.15, rx: 0.45, uvRect: tacticalUv },
      { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.032, 8), tx: 0.056, ty: -0.078, tz: 0.074, rz: -1.10, rx: 0.45, uvRect: tacticalUv },
      // Torn mask cheek straps
      { geo: new THREE.BoxGeometry(0.014, 0.075, 0.012), tx: -0.066, ty: -0.025, tz: 0.038, rx: 0.4, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.014, 0.075, 0.012), tx: 0.068, ty: -0.020, tz: 0.038, rx: 0.4, uvRect: tacticalUv }
    ]);

    // 7d. Screamer: Emaciated Arched Ribcage & Sharp Dorsal Spine Ridges
    const screamerRibParts = [];
    for (let r = 0; r < 5; r++) {
      const ry = -0.02 + r * 0.046;
      const rad = 0.115 + (r === 2 || r === 3 ? 0.016 : 0);
      screamerRibParts.push({
        geo: new THREE.TorusGeometry(rad, 0.0085, 5, 12, Math.PI * 0.88),
        tx: 0, ty: ry, tz: 0.028,
        rx: Math.PI * 0.54, rz: -Math.PI * 0.44,
        uvRect: teethUv
      });
    }
    for (let sIdx = 0; sIdx < 5; sIdx++) {
      screamerRibParts.push({
        geo: new THREE.ConeGeometry(0.014, 0.042, 5),
        tx: 0, ty: -0.08 + sIdx * 0.075, tz: -0.118,
        rx: -Math.PI * 0.48,
        uvRect: teethUv
      });
    }
    const screamerRibGeo = mergePartGeometries(screamerRibParts);

    // 7d-2. Screamer: Elongated Split-Open Howling Jaw
    const screamerJawGeo = mergePartGeometries([
      { geo: scaleGeo(new THREE.TorusGeometry(0.048, 0.014, 6, 12, Math.PI), 0.88, 1.0, 1.45), ty: -0.075, tz: 0.020, rx: Math.PI * 0.5 + 0.72, uvRect: skinUv },
      { geo: new THREE.BoxGeometry(0.040, 0.046, 0.024), ty: -0.118, tz: 0.056, rx: 0.72, uvRect: boneGoreUv },
      { geo: new THREE.CylinderGeometry(0.034, 0.028, 0.018, 8, 1, true, -0.85, 1.7), ty: -0.092, tz: 0.038, rx: 0.72, uvRect: teethUv }
    ]);

    // 7d-3. Screamer: Ruptured Vocal Throat Cysts (bioMat)
    const screamerCystGeo = mergePartGeometries([
      { geo: new THREE.SphereGeometry(0.046, 9, 7), tx: -0.038, ty: 0.255, tz: 0.078, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.052, 9, 7), tx: 0.034, ty: 0.240, tz: 0.084, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.036, 8, 6), tx: 0.002, ty: 0.205, tz: 0.102, uvRect: eyeUv },
      { geo: new THREE.SphereGeometry(0.042, 8, 6), tx: -0.068, ty: 0.180, tz: 0.092, uvRect: eyeUv }
    ]);

    // 7e. Commuter Walker/Runner: Tailored Tattered Collar Lapels, Tie/Lanyard Silhouette & Contoured Coat Hem Flaps
    const ragGeo = mergePartGeometries([
      // Torn shirt lapels around neck
      { geo: new THREE.BoxGeometry(0.046, 0.095, 0.014), tx: -0.058, ty: 0.268, tz: 0.088, rz: 0.42, rx: -0.35, uvRect: shirtUv },
      { geo: new THREE.BoxGeometry(0.046, 0.095, 0.014), tx: 0.058, ty: 0.268, tz: 0.088, rz: -0.42, rx: -0.35, uvRect: shirtUv },
      // Shredded commuter tie / LRT lanyard draping down chest
      { geo: new THREE.BoxGeometry(0.026, 0.21, 0.010), tx: 0.012, ty: 0.165, tz: 0.114, rz: 0.14, rx: -0.08, uvRect: tacticalUv },
      { geo: new THREE.BoxGeometry(0.034, 0.052, 0.010), tx: -0.004, ty: 0.045, tz: 0.118, rz: 0.18, uvRect: shirtUv },
      // Contoured tattered jacket/shirt tail flaps hugging hips (curved cylinders, NOT flat boxes!)
      { geo: new THREE.CylinderGeometry(0.146, 0.168, 0.135, 10, 1, true, -0.75, 1.10), tx: 0, ty: -0.265, tz: 0, uvRect: shirtUv },
      { geo: new THREE.CylinderGeometry(0.146, 0.166, 0.125, 10, 1, true, 1.85, 1.35), tx: 0, ty: -0.260, tz: 0, uvRect: shirtUv }
    ]);

    const textures = createZombieTextures();
    const zombieTex = textures.map;
    const zombieBump = textures.bumpMap;
    const zombieRough = textures.roughnessMap;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: zombieTex,
      bumpMap: zombieBump,
      bumpScale: 0.018,
      roughnessMap: zombieRough,
      roughness: 1.0,
      metalness: 0.04,
      envMapIntensity: 0.75,
      side: THREE.DoubleSide
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: zombieTex,
      bumpMap: zombieBump,
      bumpScale: 0.016,
      roughnessMap: zombieRough,
      roughness: 1.0,
      metalness: 0.04,
      envMapIntensity: 0.75
    });
    headMat.customProgramCacheKey = () => 'lrt_zombie_head_eyes_v2';
    headMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aEyeGlow;\nvarying vec3 vEyeGlow;\nvarying vec2 vHeadUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvEyeGlow = aEyeGlow;\nvHeadUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEyeGlow;\nvarying vec2 vHeadUv;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\nif (vHeadUv.x > 0.52 && vHeadUv.x < 0.73 && vHeadUv.y < 0.45) { totalEmissiveRadiance += vEyeGlow; }'
        );
    };

    const armorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: zombieTex,
      bumpMap: zombieBump,
      bumpScale: 0.022,
      roughnessMap: zombieRough,
      roughness: 0.90,
      metalness: 0.34,
      envMapIntensity: 0.78,
      side: THREE.DoubleSide
    });

    const bioMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0x28340c),
      emissiveIntensity: 0.85,
      bumpMap: zombieBump,
      bumpScale: 0.015,
      roughness: 0.28,
      metalness: 0.05,
      envMapIntensity: 0.75
    });

    function makePartMesh(geo, mat, castShadow) {
      const m = new THREE.InstancedMesh(geo, mat, MAX_ENEMIES);
      m.frustumCulled = false;
      m.castShadow = castShadow !== undefined ? !!castShadow : true;
      m.receiveShadow = false;
      m.count = 0;
      const white = new THREE.Color(0xffffff);
      for (let i = 0; i < MAX_ENEMIES; i++) {
        m.setMatrixAt(i, _zeroMat);
        m.setColorAt(i, white);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      E.enemyRoot.add(m);
      return m;
    }

    E._st._headMesh = makePartMesh(headGeo, headMat, true);
    E._st._torsoMesh = makePartMesh(torsoGeo, bodyMat, true);
    E._st._upperArmLMesh = makePartMesh(upperArmGeo, bodyMat, true);
    E._st._upperArmRMesh = makePartMesh(upperArmGeo, bodyMat, true);
    E._st._forearmLMesh = makePartMesh(forearmGeo, bodyMat, true);
    E._st._forearmRMesh = makePartMesh(forearmGeo, bodyMat, true);
    E._st._thighLMesh = makePartMesh(thighGeo, bodyMat, true);
    E._st._thighRMesh = makePartMesh(thighGeo, bodyMat, true);
    E._st._calfLMesh = makePartMesh(calfGeo, bodyMat, true);
    E._st._calfRMesh = makePartMesh(calfGeo, bodyMat, true);

    E._st._bruteArmorMesh = makePartMesh(bruteArmorGeo, armorMat, false);
    E._st._bruteHelmetMesh = makePartMesh(bruteHelmetGeo, armorMat, false);
    E._st._spitterBioMesh = makePartMesh(spitterBioGeo, bioMat, false);
    E._st._spitterGearMesh = makePartMesh(spitterGearGeo, bodyMat, false);
    E._st._spitterMaskMesh = makePartMesh(spitterMaskGeo, armorMat, false);
    E._st._screamerRibMesh = makePartMesh(screamerRibGeo, bodyMat, false);
    E._st._screamerJawMesh = makePartMesh(screamerJawGeo, bodyMat, false);
    E._st._screamerCystMesh = makePartMesh(screamerCystGeo, bioMat, false);
    E._st._ragMesh = makePartMesh(ragGeo, bodyMat, false);

    E._st._corePartMeshes = [
      E._st._headMesh, E._st._torsoMesh, E._st._upperArmLMesh, E._st._upperArmRMesh,
      E._st._forearmLMesh, E._st._forearmRMesh, E._st._thighLMesh, E._st._thighRMesh,
      E._st._calfLMesh, E._st._calfRMesh
    ];
    E._st._overlayPartMeshes = [
      E._st._bruteArmorMesh, E._st._bruteHelmetMesh,
      E._st._spitterBioMesh, E._st._spitterGearMesh, E._st._spitterMaskMesh,
      E._st._screamerRibMesh, E._st._screamerJawMesh, E._st._screamerCystMesh,
      E._st._ragMesh
    ];
    for (let i = 0; i < E._st._overlayPartMeshes.length; i++) {
      E._st._overlayPartMeshes[i].visible = false;
    }
    E._st._allPartMeshes = E._st._corePartMeshes.concat(E._st._overlayPartMeshes);
  }

  function buildBileAndPuddleMeshes() {

    const createVomitPuddleTex = () => {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 192;
      const ctx = c.getContext('2d');
      if (!ctx) return null;

      let seed = 9187;
      const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

      // Multi-lobe irregular vomit puddle silhouette
      const cx = 96;
      const cy = 96;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + rng() * 0.45;
        const off = i === 0 ? 0 : (10 + rng() * 24);
        const lx = cx + Math.cos(ang) * off;
        const ly = cy + Math.sin(ang) * off;
        const rad = i === 0 ? 52 : (20 + rng() * 22);
        const g = ctx.createRadialGradient(lx, ly, 3, lx, ly, rad);
        g.addColorStop(0.0, 'rgba(66, 78, 16, 0.96)');
        g.addColorStop(0.48, 'rgba(108, 128, 22, 0.88)');
        g.addColorStop(0.80, 'rgba(148, 168, 34, 0.56)');
        g.addColorStop(1.0, 'rgba(92, 110, 18, 0.0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lx, ly, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Radial impact splash streaks & satellite droplets
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + (rng() - 0.5) * 0.28;
        const r0 = 28 + rng() * 14;
        const r1 = 56 + rng() * 34;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(134, 154, 28, 0.72)' : 'rgba(78, 92, 18, 0.78)';
        ctx.lineWidth = 2.0 + rng() * 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();

        const dr = r1 + 4 + rng() * 8;
        ctx.fillStyle = 'rgba(116, 136, 24, 0.76)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * dr, cy + Math.sin(ang) * dr, 2.2 + rng() * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Digested dark-brown/olive bile chunks & frothy acid pockets
      for (let i = 0; i < 48; i++) {
        const ang = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * 54;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        const cr = 1.4 + rng() * 3.6;
        ctx.fillStyle = (i % 3 === 0)
          ? 'rgba(176, 198, 48, 0.62)'
          : (i % 2 === 0 ? 'rgba(54, 46, 15, 0.85)' : 'rgba(84, 70, 20, 0.75)');
        ctx.beginPath();
        ctx.arc(px, py, cr, 0, Math.PI * 2);
        ctx.fill();
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    // Pooled Spitter vomit projectile (clustered lumpy wad + trailing mucus streak, NOT neon orb)
    const bileHeadGeo = new THREE.IcosahedronGeometry(0.095, 1);
    bileHeadGeo.scale(1.05, 0.92, 1.35);
    const bileLumpA = new THREE.IcosahedronGeometry(0.068, 0);
    const bileLumpB = new THREE.IcosahedronGeometry(0.056, 0);
    const bileStreakGeo = new THREE.ConeGeometry(0.075, 0.38, 6);
    const bileGeo = mergePartGeometries([
      { geo: bileHeadGeo, tx: 0, ty: 0, tz: 0.04 },
      { geo: bileLumpA, tx: 0.055, ty: 0.032, tz: -0.04 },
      { geo: bileLumpB, tx: -0.052, ty: -0.025, tz: -0.06 },
      { geo: bileStreakGeo, tx: 0, ty: 0, tz: -0.19, rx: -Math.PI * 0.5 }
    ]);
    bileHeadGeo.dispose();
    bileLumpA.dispose();
    bileLumpB.dispose();
    bileStreakGeo.dispose();

    const bileMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.16,
      metalness: 0.05,
      emissive: 0x263106,
      emissiveIntensity: 0.34
    });
    E._st._bileMesh = new THREE.InstancedMesh(bileGeo, bileMat, MAX_BILE);
    E._st._bileMesh.frustumCulled = false;
    E._st._bileMesh.visible = false;
    for (let i = 0; i < MAX_BILE; i++) {
      E._st._bileMesh.setMatrixAt(i, _zeroMat);
      E._st._bileMesh.setColorAt(i, _color.setHex(BILE_COLORS[i % BILE_COLORS.length]));
    }
    E._st._bileMesh.instanceMatrix.needsUpdate = true;
    if (E._st._bileMesh.instanceColor) E._st._bileMesh.instanceColor.needsUpdate = true;
    E.enemyRoot.add(E._st._bileMesh);

    // Trailing secondary vomit chunks tumbling behind each projectile
    const chunkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.04,
      emissive: 0x202905,
      emissiveIntensity: 0.25
    });
    E._st._bileChunkMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.052, 0), chunkMat, MAX_BILE_CHUNKS);
    E._st._bileChunkMesh.frustumCulled = false;
    E._st._bileChunkMesh.visible = false;
    for (let i = 0; i < MAX_BILE_CHUNKS; i++) {
      E._st._bileChunkMesh.setMatrixAt(i, _zeroMat);
      E._st._bileChunkMesh.setColorAt(i, _color.setHex(DROP_COLORS[i % DROP_COLORS.length]));
    }
    E._st._bileChunkMesh.instanceMatrix.needsUpdate = true;
    if (E._st._bileChunkMesh.instanceColor) E._st._bileChunkMesh.instanceColor.needsUpdate = true;
    E.enemyRoot.add(E._st._bileChunkMesh);

    // Falling vomit droplets in flight + impact splash particles
    const dropMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.14,
      metalness: 0.05,
      emissive: 0x2a3508,
      emissiveIntensity: 0.32
    });
    E._st._bileDropMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.036, 0), dropMat, MAX_BILE_DROPS);
    E._st._bileDropMesh.frustumCulled = false;
    E._st._bileDropMesh.visible = false;
    for (let i = 0; i < MAX_BILE_DROPS; i++) {
      E._st._bileDropMesh.setMatrixAt(i, _zeroMat);
      E._st._bileDropMesh.setColorAt(i, _color.setHex(DROP_COLORS[i % DROP_COLORS.length]));
    }
    E._st._bileDropMesh.instanceMatrix.needsUpdate = true;
    if (E._st._bileDropMesh.instanceColor) E._st._bileDropMesh.instanceColor.needsUpdate = true;
    E.enemyRoot.add(E._st._bileDropMesh);

    // Persistent floor acid/vomit splatter puddle decals
    const puddleGeo = new THREE.PlaneGeometry(1, 1);
    puddleGeo.rotateX(-Math.PI * 0.5);
    const puddleMat = new THREE.MeshStandardMaterial({
      map: createVomitPuddleTex(),
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0.08,
      emissive: 0x324008,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      side: THREE.DoubleSide
    });
    E._st._puddleMesh = new THREE.InstancedMesh(puddleGeo, puddleMat, MAX_PUDDLES);
    E._st._puddleMesh.frustumCulled = false;
    E._st._puddleMesh.visible = false;
    E._st._puddleMesh.renderOrder = 2;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      E._st._puddleMesh.setMatrixAt(i, _zeroMat);
      E._st._puddleMesh.setColorAt(i, _color.setHex(PUDDLE_COLORS[i % PUDDLE_COLORS.length]));
    }
    E._st._puddleMesh.instanceMatrix.needsUpdate = true;
    if (E._st._puddleMesh.instanceColor) E._st._puddleMesh.instanceColor.needsUpdate = true;
    E.enemyRoot.add(E._st._puddleMesh);

    // Acid puddle fizzing/popping bubbles
    const bubbleMat = new THREE.MeshStandardMaterial({
      color: 0xb4ce32,
      roughness: 0.10,
      metalness: 0.10,
      emissive: 0x45560c,
      emissiveIntensity: 0.52,
      transparent: true,
      opacity: 0.82
    });
    E._st._puddleBubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.048, 6, 5), bubbleMat, MAX_PUDDLE_BUBBLES);
    E._st._puddleBubbleMesh.frustumCulled = false;
    E._st._puddleBubbleMesh.visible = false;
    for (let i = 0; i < MAX_PUDDLE_BUBBLES; i++) {
      E._st._puddleBubbleMesh.setMatrixAt(i, _zeroMat);
    }
    E._st._puddleBubbleMesh.instanceMatrix.needsUpdate = true;
    E.enemyRoot.add(E._st._puddleBubbleMesh);
  }


  function assignVariantVisuals(z) {
    const shirtPick = COMMUTER_SHIRT_COLORS[Math.floor(Math.random() * COMMUTER_SHIRT_COLORS.length)];
    const skinPick = SKIN_PALLOR_COLORS[Math.floor(Math.random() * SKIN_PALLOR_COLORS.length)];
    if (z.variant === 'walker') {
      z.skinColor.setHex(skinPick);
      z.shirtColor.setHex(shirtPick);
      z.pantsColor.setHex(Math.random() > 0.5 ? 0x3b4048 : 0x4b4339);
      z.gearColor.setHex(0x887c6e);
    } else if (z.variant === 'runner') {
      z.skinColor.setHex(0xa8928c);
      z.shirtColor.setHex(Math.random() > 0.4 ? 0x7a2f32 : 0x5c2628);
      z.pantsColor.setHex(0x34373e);
      z.gearColor.setHex(0x6e2424);
    } else if (z.variant === 'brute') {
      z.skinColor.setHex(0x8c9288);
      z.shirtColor.setHex(0x2c3648); // LRT Tactical Riot Uniform
      z.pantsColor.setHex(0x28303d);
      z.gearColor.setHex(0x4f5a69);
    } else if (z.variant === 'spitter') {
      z.skinColor.setHex(0x9ea86a);
      z.shirtColor.setHex(0x86903c); // Soiled chemical hazmat suit
      z.pantsColor.setHex(0x4d5432);
      z.gearColor.setHex(0xb8ff3c); // Toxic lime green
    } else if (z.variant === 'screamer') {
      z.skinColor.setHex(0x9c8e94); // cadaver ash with faint crimson tinge
      z.shirtColor.setHex(0x5a2d36); // blood-soaked tattered commuter fabric
      z.pantsColor.setHex(0x382c32); // dark ash commuter trousers
      z.gearColor.setHex(0xff3848); // crimson-red cyst overlay
    }
  }

  function applyZombieColors(z) {
    const idx = z.id;
    const isHit = z.hitFlashTimer > 0;
    const rTint = isHit ? 1.15 : 1.0;
    const gbTint = isHit ? 0.58 : 1.0;

    if (E._st._useSkinnedRigs) {
      const slot = E._st._rigPool[idx];
      if (!slot) return;
      const rig = E.getSlotRigForVariant(z, slot);
      if (!rig || !rig.materials) return;

      let tintHex = 0xd6d3cb;
      let pantsHex = 0x9aa2aa;
      let emHex = 0x000000;
      if (z.variant === 'runner') {
        // Pale ash skin + dark blood-soaked commuter attire (NO pink wash!)
        tintHex = 0xd4d1c8;
        emHex = 0x080202;
      } else if (z.variant === 'spitter') {
        tintHex = 0xc2ce8e;
        pantsHex = 0x76824e;
        emHex = 0x162404;
      } else if (z.variant === 'screamer') {
        tintHex = 0xcec8d0;
        pantsHex = 0x7a727a;
        emHex = 0x1a0406;
      } else if (z.variant === 'brute') {
        tintHex = z.hasArmor ? 0xd8dee8 : 0xc2c8d2;
        pantsHex = 0xc8d0dc;
        emHex = 0x060202;
      } else {
        // Gritty neutral urban commuter wardrobe variants (never neon/pastel)
        const wPalette = [0xc8c5bc, 0xb8bec6, 0xc2bdb2, 0xb2b8ac];
        tintHex = (rig.kind === 'commuter') ? wPalette[idx % wPalette.length] : 0xdad7cf;
        const pPalette = [0x949ca6, 0x868c82, 0x9e968c, 0x7c848e];
        pantsHex = pPalette[idx % pPalette.length];
      }

      for (let i = 0; i < rig.materials.length; i++) {
        const info = rig.materials[i];
        const m = info.mat;
        if (!m) continue;
        if (m.color) {
          if (info.isVisor) {
            m.color.setHex(0x18222e);
          } else if (info.isSkin) {
            _color.setHex(0xd4d0c8);
            m.color.copy(info.baseColor).multiply(_color);
            if (isHit) m.color.setRGB(m.color.r * 1.25, m.color.g * 0.52, m.color.b * 0.52);
          } else {
            _color.setHex(info.isPants ? pantsHex : tintHex);
            m.color.copy(info.baseColor).multiply(_color);
            if (isHit) m.color.setRGB(m.color.r * 1.25, m.color.g * 0.52, m.color.b * 0.52);
          }
        }
        if (m.emissive) {
          if (isHit) {
            m.emissive.setHex(0x6e1410);
            m.emissiveIntensity = 1.0;
          } else if (info.isVisor) {
            m.emissive.setHex(0x0c1622);
            m.emissiveIntensity = 0.5;
          } else {
            m.emissive.copy(info.baseEmissive);
            if (emHex) m.emissive.setHex(emHex);
            m.emissiveIntensity = info.baseEmissiveIntensity;
          }
        }
      }
      if (rig.visorMesh) {
        rig.visorMesh.visible = !!(z.hasArmor && !z.dead);
      }
      if (rig.riotArmorGroup) {
        rig.riotArmorGroup.visible = !!(z.hasArmor);
      }
      if (rig.runnerEyes) {
        rig.runnerEyes.visible = !z.dead && (z.variant === 'runner' || z.variant === 'screamer' || z.variant === 'brute');
      }
      return;
    }

    if (!E._st._headMesh) return;

    _color.copy(z.skinColor);
    if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
    E._st._headMesh.setColorAt(idx, _color);
    E._st._forearmLMesh.setColorAt(idx, _color);
    E._st._forearmRMesh.setColorAt(idx, _color);

    _color.copy(z.shirtColor);
    if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
    E._st._torsoMesh.setColorAt(idx, _color);
    E._st._upperArmLMesh.setColorAt(idx, _color);
    E._st._upperArmRMesh.setColorAt(idx, _color);

    _color.copy(z.pantsColor);
    if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
    E._st._thighLMesh.setColorAt(idx, _color);
    E._st._thighRMesh.setColorAt(idx, _color);
    E._st._calfLMesh.setColorAt(idx, _color);
    E._st._calfRMesh.setColorAt(idx, _color);

    _color.copy(z.gearColor);
    if (z.variant === 'brute' && isHit) _color.multiplyScalar(0.85);
    E._st._bruteArmorMesh.setColorAt(idx, _color);
    E._st._bruteHelmetMesh.setColorAt(idx, _color);
    E._st._spitterBioMesh.setColorAt(idx, z.gearColor);
    if (E._st._spitterGearMesh) {
      _color.copy(z.shirtColor);
      if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
      E._st._spitterGearMesh.setColorAt(idx, _color);
    }
    if (E._st._spitterMaskMesh) {
      _color.setHex(0x454c40);
      if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
      E._st._spitterMaskMesh.setColorAt(idx, _color);
    }
    if (E._st._screamerRibMesh) {
      _color.setHex(0xd8d0c6);
      if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
      E._st._screamerRibMesh.setColorAt(idx, _color);
    }
    if (E._st._screamerJawMesh) {
      _color.copy(z.skinColor);
      if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
      E._st._screamerJawMesh.setColorAt(idx, _color);
    }
    if (E._st._screamerCystMesh) E._st._screamerCystMesh.setColorAt(idx, z.gearColor);
    _color.copy(z.shirtColor);
    if (isHit) _color.setRGB(_color.r * rTint, _color.g * gbTint, _color.b * gbTint);
    E._st._ragMesh.setColorAt(idx, _color);

    if (E._st._headEyeAttr) {
      let er = 0, eg = 0, eb = 0;
      if (!z.dead) {
        if (z.variant === 'runner') { er = 2.6; eg = 0.32; eb = 0.06; }
        else if (z.variant === 'spitter') { er = 0.45; eg = 2.6; eb = 0.14; }
        else if (z.variant === 'brute') { er = 1.65; eg = 0.65; eb = 0.10; }
        else if (z.variant === 'screamer') { er = 2.2; eg = 0.25; eb = 0.25; }
        else { er = 0.72; eg = 0.48; eb = 0.18; }
      }
      E._st._headEyeAttr.setXYZ(idx, er, eg, eb);
    }
  }

  function markColorsDirty() {
    if (E._st._useSkinnedRigs) return;
    for (let i = 0; i < E._st._allPartMeshes.length; i++) {
      const m = E._st._allPartMeshes[i];
      if (m && m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (E._st._headEyeAttr) E._st._headEyeAttr.needsUpdate = true;
  }

  function setHeadEyeDead(idx) {
    if (E._st._useSkinnedRigs) {
      const slot = E._st._rigPool[idx];
      if (slot) {
        const rigs = [slot.infected, slot.commuter, slot.soldier];
        for (let r = 0; r < rigs.length; r++) {
          const rig = rigs[r];
          if (!rig) continue;
          if (rig.runnerEyes) rig.runnerEyes.visible = false;
          if (rig.spitterNodes) {
            for (let i = 0; i < rig.spitterNodes.length; i++) rig.spitterNodes[i].visible = false;
          }
          if (rig.screamerNodes) {
            for (let i = 0; i < rig.screamerNodes.length; i++) rig.screamerNodes[i].visible = false;
          }
        }
      }
      return;
    }
    if (E._st._headEyeAttr) {
      E._st._headEyeAttr.setXYZ(idx, 0, 0, 0);
      E._st._headEyeAttr.needsUpdate = true;
    }
  }


  function zeroZombieMatrices(idx) {
    if (E._st._useSkinnedRigs) {
      const slot = E._st._rigPool[idx];
      if (slot) {
        E.resetRigAttachments(slot.infected);
        E.resetRigAttachments(slot.commuter);
        E.resetRigAttachments(slot.soldier);
      }
      return;
    }
    for (let i = 0; i < E._st._allPartMeshes.length; i++) {
      if (E._st._allPartMeshes[i]) E._st._allPartMeshes[i].setMatrixAt(idx, _zeroMat);
    }
  }

  function syncMeshCounts(highWater) {
    if (E._st._useSkinnedRigs) return;
    for (let m = 0; m < E._st._allPartMeshes.length; m++) {
      if (E._st._allPartMeshes[m]) E._st._allPartMeshes[m].count = highWater;
    }
  }

  function flushMeshMatrices() {
    if (E._st._useSkinnedRigs) return;
    for (let m = 0; m < E._st._allPartMeshes.length; m++) {
      if (E._st._allPartMeshes[m]) E._st._allPartMeshes[m].instanceMatrix.needsUpdate = true;
    }
  }


  function resolveBileFloorY(x, y, z, fallbackY) {
    let bestY = -999;
    _bileOrigin.set(x, y + 0.35, z);
    if (LRT.Station && typeof LRT.Station.raycastWorld === 'function') {
      const wh = LRT.Station.raycastWorld(_bileOrigin, _downY, 6.5);
      if (wh && wh.normal && wh.normal.y > 0.45 && wh.point.y > bestY) {
        bestY = wh.point.y;
      }
    }
    if (LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
      const th = LRT.Train.raycastTrain(_bileOrigin, _downY, 6.5);
      if (th && th.normal && th.normal.y > 0.45 && th.point.y > bestY) {
        bestY = th.point.y;
      }
    }
    if (bestY > -50) return bestY;
    if (fallbackY !== undefined) return fallbackY;
    return y > 1.5 ? 0.0 : -1.0;
  }

  function spawnBileDrop(x, y, z, vx, vy, vz, scale, maxLife, floorY) {
    if (!E.bileDrops.length) return;
    const d = E.bileDrops[E._st._bileDropCursor];
    E._st._bileDropCursor = (E._st._bileDropCursor + 1) % MAX_BILE_DROPS;
    d.active = true;
    d.life = 0;
    d.maxLife = maxLife || (0.45 + Math.random() * 0.35);
    d.scale = scale || (0.75 + Math.random() * 0.65);
    d.floorY = floorY !== undefined ? floorY : -1.1;
    d.pos.set(x, y, z);
    d.vel.set(vx, vy, vz);
  }

  function spawnBileDropsBurst(pos, normal, count, floorY) {
    const nx = normal ? normal.x : 0;
    const ny = normal ? normal.y : 1;
    const nz = normal ? normal.z : 0;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 3.0;
      const vx = Math.cos(ang) * spd + nx * 1.4;
      const vy = 1.4 + Math.random() * 2.8 + ny * 1.1;
      const vz = Math.sin(ang) * spd + nz * 1.4;
      spawnBileDrop(
        pos.x + (Math.random() - 0.5) * 0.16,
        pos.y + 0.08,
        pos.z + (Math.random() - 0.5) * 0.16,
        vx, vy, vz,
        0.7 + Math.random() * 0.75,
        0.42 + Math.random() * 0.42,
        floorY
      );
    }
  }

  function spawnBilePuddle(x, y, z, radius, fallbackFloorY) {
    if (!E.bilePuddles.length) return null;
    const idx = E._st._puddleCursor;
    E._st._puddleCursor = (E._st._puddleCursor + 1) % MAX_PUDDLES;
    const p = E.bilePuddles[idx];
    const floorY = resolveBileFloorY(x, y, z, fallbackFloorY);
    p.active = true;
    p.pos.set(x, floorY + 0.024, z);
    p.normal.set(0, 1, 0);
    p.radius = radius || (1.28 + Math.random() * 0.32);
    p.life = 0;
    p.maxLife = 6.8 + Math.random() * 1.4;
    p.yaw = Math.random() * Math.PI * 2;
    p.aspect = 0.86 + Math.random() * 0.28;
    p.damageTickTimer = 0.25;
    p.bubbleAccum = 0;
    return p;
  }

  function spawnPuddleBubble(p) {
    if (!E.bileBubbles.length) return;
    const b = E.bileBubbles[E._st._bubbleCursor];
    E._st._bubbleCursor = (E._st._bubbleCursor + 1) % MAX_PUDDLE_BUBBLES;
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * p.radius * 0.62;
    b.active = true;
    b.life = 0;
    b.maxLife = 0.45 + Math.random() * 0.45;
    b.maxScale = 0.65 + Math.random() * 0.95;
    b.riseSpeed = 0.14 + Math.random() * 0.18;
    b.pos.set(p.pos.x + Math.cos(ang) * rad, p.pos.y + 0.01, p.pos.z + Math.sin(ang) * rad);
  }

  function spawnBileProjectile(z, playerPos) {
    if (!playerPos) return;
    let slot = null;
    for (let i = 0; i < MAX_BILE; i++) {
      if (!E.bileOrbs[i].active) { slot = E.bileOrbs[i]; break; }
    }
    if (!slot) return;

    z.spitAnimTimer = 0.50;

    const sc = z.scale || 1.0;
    const fwdX = Math.sin(z.yaw || 0);
    const fwdZ = Math.cos(z.yaw || 0);
    slot.active = true;
    slot.life = 0;
    slot.dropAccum = 0;
    slot.damage = Math.max(8, z.damage || 14);
    slot.groundY = z.y !== undefined ? z.y : 0.0;
    slot.spin = Math.random() * Math.PI * 2;
    slot.pos.set(z.x + fwdX * 0.28, slot.groundY + 1.46 * sc, z.z + fwdZ * 0.28);
    slot.startPos.copy(slot.pos);

    let dx = playerPos.x - slot.pos.x;
    const ty = (playerPos.y || 0) + 1.05;
    const dy = ty - slot.pos.y;
    let dz = playerPos.z - slot.pos.z;
    let horizDist = Math.sqrt(dx * dx + dz * dz);
    if (horizDist > 6.8) {
      const clampScale = 6.8 / horizDist;
      dx *= clampScale;
      dz *= clampScale;
      horizDist = 6.8;
    }
    const flightTime = Math.max(0.36, Math.min(0.88, horizDist / BILE_HORIZ_SPEED));
    let vy = (dy / flightTime) + 0.5 * BILE_GRAVITY * flightTime;
    if (vy < 0.65 && Math.abs(dy) < 1.2) {
      vy = 0.65;
    }

    slot.vel.set(
      dx / flightTime,
      vy,
      dz / flightTime
    );

    // 8-droplet forward vomit spray cone on launch
    for (let k = 0; k < 8; k++) {
      const coneSpread = (k - 3.5) * 0.14 + (Math.random() - 0.5) * 0.12;
      const cosC = Math.cos(coneSpread);
      const sinC = Math.sin(coneSpread);
      const svx = slot.vel.x * cosC - slot.vel.z * sinC;
      const svz = slot.vel.x * sinC + slot.vel.z * cosC;
      const spdScale = 0.42 + Math.random() * 0.42;
      spawnBileDrop(
        slot.pos.x + (Math.random() - 0.5) * 0.08,
        slot.pos.y + (Math.random() - 0.5) * 0.06,
        slot.pos.z + (Math.random() - 0.5) * 0.08,
        svx * spdScale + (Math.random() - 0.5) * 0.45,
        slot.vel.y * (0.45 + Math.random() * 0.35) + (Math.random() - 0.5) * 0.6,
        svz * spdScale + (Math.random() - 0.5) * 0.45,
        0.72 + Math.random() * 0.45,
        0.38 + Math.random() * 0.24,
        slot.groundY
      );
    }

    E.play3D('zombie_attack', slot.pos, 0.16, 0.85);
  }

  function updateBileProjectiles(step, elapsed, playerPos, onPlayerHit) {
    let anyBile = false;
    let anyChunks = false;
    let bileMatDirty = false;
    const hasStationRaycast = !!(LRT.Station && typeof LRT.Station.raycastWorld === 'function');

    for (let i = 0; i < MAX_BILE; i++) {
      const b = E.bileOrbs[i];
      if (!b.active) {
        continue;
      }
      anyBile = true;
      bileMatDirty = true;
      b.life += step;
      b.vel.y -= BILE_GRAVITY * step;
      const spd = b.vel.length();
      const stepDist = spd * step;
      if (spd > 0.001) {
        _bileDir.copy(b.vel).divideScalar(spd);
      } else {
        _bileDir.set(0, -1, 0);
      }

      b.dropAccum += step;
      while (b.dropAccum >= 0.035) {
        b.dropAccum -= 0.035;
        spawnBileDrop(
          b.pos.x + (Math.random() - 0.5) * 0.10,
          b.pos.y + (Math.random() - 0.5) * 0.10,
          b.pos.z + (Math.random() - 0.5) * 0.10,
          b.vel.x * 0.18 + (Math.random() - 0.5) * 1.1,
          b.vel.y * 0.12 - 0.7 - Math.random() * 1.1,
          b.vel.z * 0.18 + (Math.random() - 0.5) * 1.1,
          0.65 + Math.random() * 0.55,
          0.42 + Math.random() * 0.30,
          b.groundY
        );
      }

      let hitPoint = null;
      let directPlayerHit = false;
      _bileNormal.copy(_upY);

      if (playerPos) {
        const dx = b.pos.x - playerPos.x;
        const dy = b.pos.y - ((playerPos.y || 0) + 1.0);
        const dz = b.pos.z - playerPos.z;
        if (dx * dx + dy * dy + dz * dz < 0.65) {
          hitPoint = _bileHitVec.copy(b.pos);
          directPlayerHit = true;
        }
      }
      if (!hitPoint && hasStationRaycast) {
        const wh = LRT.Station.raycastWorld(b.pos, _bileDir, stepDist + 0.14);
        if (wh) {
          hitPoint = wh.point;
          if (wh.normal) _bileNormal.copy(wh.normal);
        }
      }
      if (!hitPoint && LRT.Train && typeof LRT.Train.raycastTrain === 'function') {
        const th = LRT.Train.raycastTrain(b.pos, _bileDir, stepDist + 0.14);
        if (th) {
          hitPoint = th.point;
          if (th.normal) _bileNormal.copy(th.normal);
        }
      }

      b.pos.addScaledVector(b.vel, step);
      const horizTravelSq =
        (b.pos.x - b.startPos.x) * (b.pos.x - b.startPos.x) +
        (b.pos.z - b.startPos.z) * (b.pos.z - b.startPos.z);
      const minFloorCut = hasStationRaycast ? -1.15 : (b.groundY + 0.04);

      if (hitPoint || b.pos.y <= minFloorCut || b.life > 2.4 || horizTravelSq > BILE_MAX_RANGE * BILE_MAX_RANGE) {
        b.active = false;
        if (E._st._bileMesh) E._st._bileMesh.setMatrixAt(i, _zeroMat);
        if (E._st._bileChunkMesh) {
          E._st._bileChunkMesh.setMatrixAt(i * 2, _zeroMat);
          E._st._bileChunkMesh.setMatrixAt(i * 2 + 1, _zeroMat);
        }

        const impact = hitPoint || b.pos;
        const puddle = spawnBilePuddle(impact.x, impact.y, impact.z, 1.32 + Math.random() * 0.28, b.groundY);
        const floorRef = puddle ? (puddle.pos.y - 0.02) : b.groundY;
        spawnBileDropsBurst(impact, _bileNormal, 12, floorRef);
        E.play3D('debris_crumble', impact, 0.24, 0.55);

        if (playerPos && typeof onPlayerHit === 'function') {
          if (directPlayerHit) {
            onPlayerHit(b.damage, impact);
          } else {
            const dx = impact.x - playerPos.x;
            const dy = impact.y - ((playerPos.y || 0) + 1.0);
            const dz = impact.z - playerPos.z;
            if (dx * dx + dy * dy + dz * dz < 2.15) {
              onPlayerHit(Math.max(4, Math.round(b.damage * 0.65)), impact);
            }
          }
        }
      } else {
        if (E._st._bileMesh) {
          _q1.setFromUnitVectors(_fwdZ, _bileDir);
          const pulse = 1.0 + Math.sin(elapsed * 18 + i) * 0.14;
          _scale.set(pulse, pulse, 1.05 + Math.cos(elapsed * 14 + i) * 0.12);
          _m4.compose(b.pos, _q1, _scale);
          E._st._bileMesh.setMatrixAt(i, _m4);
        }
        if (E._st._bileChunkMesh) {
          anyChunks = true;
          for (let c = 0; c < 2; c++) {
            const cIdx = i * 2 + c;
            const back = 0.16 + c * 0.15;
            const wob = elapsed * 10 + i * 2.1 + c * 3.1;
            _pos.set(
              b.pos.x - _bileDir.x * back + Math.cos(wob) * 0.06,
              b.pos.y - _bileDir.y * back + Math.sin(wob * 1.3) * 0.05,
              b.pos.z - _bileDir.z * back + Math.sin(wob) * 0.06
            );
            _e1.set(wob, wob * 0.7, c);
            _q1.setFromEuler(_e1);
            _scale.setScalar(c === 0 ? 1.05 : 0.78);
            _m4.compose(_pos, _q1, _scale);
            E._st._bileChunkMesh.setMatrixAt(cIdx, _m4);
          }
        }
      }
    }

    if (E._st._bileMesh) {
      E._st._bileMesh.visible = anyBile;
      if (bileMatDirty) E._st._bileMesh.instanceMatrix.needsUpdate = true;
    }
    if (E._st._bileChunkMesh) {
      E._st._bileChunkMesh.visible = anyChunks;
      if (bileMatDirty) E._st._bileChunkMesh.instanceMatrix.needsUpdate = true;
    }

    // Update falling vomit droplets in flight & impact splashes
    let anyDrops = false;
    let dropsDirty = false;
    for (let i = 0; i < MAX_BILE_DROPS; i++) {
      const d = E.bileDrops[i];
      if (!d || !d.active) continue;
      dropsDirty = true;
      d.life += step;
      d.vel.y -= BILE_GRAVITY * 1.1 * step;
      d.pos.addScaledVector(d.vel, step);

      if (d.life >= d.maxLife || d.pos.y <= d.floorY) {
        d.active = false;
        if (E._st._bileDropMesh) E._st._bileDropMesh.setMatrixAt(i, _zeroMat);
      } else {
        anyDrops = true;
        if (E._st._bileDropMesh) {
          const dSpd = d.vel.length();
          if (dSpd > 0.05) {
            _bileDir.copy(d.vel).divideScalar(dSpd);
            _q1.setFromUnitVectors(_fwdZ, _bileDir);
          } else {
            _q1.identity();
          }
          const fade = Math.max(0.25, 1.0 - (d.life / d.maxLife) * 0.65);
          _scale.set(d.scale * fade, d.scale * fade, d.scale * fade * 2.1);
          _m4.compose(d.pos, _q1, _scale);
          E._st._bileDropMesh.setMatrixAt(i, _m4);
        }
      }
    }
    if (E._st._bileDropMesh) {
      E._st._bileDropMesh.visible = anyDrops;
      if (dropsDirty) E._st._bileDropMesh.instanceMatrix.needsUpdate = true;
    }

    // Update persistent acid/vomit floor puddles + brief DoT hazard
    let anyPuddles = false;
    let puddlesDirty = false;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      const p = E.bilePuddles[i];
      if (!p || !p.active) continue;
      puddlesDirty = true;
      p.life += step;

      if (p.life >= p.maxLife) {
        p.active = false;
        if (E._st._puddleMesh) E._st._puddleMesh.setMatrixAt(i, _zeroMat);
        continue;
      }

      anyPuddles = true;
      const growT = Math.min(1.0, p.life / 0.14);
      const decayWindow = 1.6;
      const fadeT = p.life > (p.maxLife - decayWindow)
        ? Math.max(0.0, (p.maxLife - p.life) / decayWindow)
        : 1.0;

      if (fadeT > 0.35) {
        p.bubbleAccum += step;
        if (p.bubbleAccum >= 0.20) {
          p.bubbleAccum -= 0.20;
          spawnPuddleBubble(p);
        }
      }

      if (playerPos && typeof onPlayerHit === 'function' && p.life > 0.35 && fadeT > 0.25) {
        const hdx = playerPos.x - p.pos.x;
        const hdz = playerPos.z - p.pos.z;
        const pdy = Math.abs((playerPos.y || 0) - p.pos.y);
        const effRad = p.radius * 0.88;
        if (pdy <= 1.2 && (hdx * hdx + hdz * hdz) <= (effRad * effRad)) {
          p.damageTickTimer -= step;
          if (p.damageTickTimer <= 0) {
            p.damageTickTimer = 0.55;
            onPlayerHit(4, p.pos);
          }
        } else {
          p.damageTickTimer = Math.min(p.damageTickTimer, 0.15);
        }
      }

      if (E._st._puddleMesh) {
        const pulse = 1.0 + Math.sin(elapsed * 4.5 + i * 1.7) * 0.03;
        const diameter = p.radius * 2.0 * growT * fadeT * pulse;
        _e1.set(0, p.yaw, 0, 'YXZ');
        _q1.setFromEuler(_e1);
        _scale.set(diameter, 1.0, diameter * p.aspect);
        _m4.compose(p.pos, _q1, _scale);
        E._st._puddleMesh.setMatrixAt(i, _m4);
      }
    }
    if (E._st._puddleMesh) {
      E._st._puddleMesh.visible = anyPuddles;
      if (puddlesDirty) E._st._puddleMesh.instanceMatrix.needsUpdate = true;
    }

    // Update rising & popping acid puddle bubbles
    let anyBubbles = false;
    let bubblesDirty = false;
    for (let i = 0; i < MAX_PUDDLE_BUBBLES; i++) {
      const b = E.bileBubbles[i];
      if (!b || !b.active) continue;
      bubblesDirty = true;
      b.life += step;
      b.pos.y += b.riseSpeed * step;

      if (b.life >= b.maxLife) {
        b.active = false;
        if (E._st._puddleBubbleMesh) E._st._puddleBubbleMesh.setMatrixAt(i, _zeroMat);
      } else {
        anyBubbles = true;
        if (E._st._puddleBubbleMesh) {
          const t = b.life / b.maxLife;
          const sc = Math.sin(t * Math.PI) * b.maxScale;
          _q1.identity();
          _scale.setScalar(Math.max(0.05, sc));
          _m4.compose(b.pos, _q1, _scale);
          E._st._puddleBubbleMesh.setMatrixAt(i, _m4);
        }
      }
    }
    if (E._st._puddleBubbleMesh) {
      E._st._puddleBubbleMesh.visible = anyBubbles;
      if (bubblesDirty) E._st._puddleBubbleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function updateOverlayVisibilityAndCounts(highWater, hasBruteArmor, hasBio, hasRag, needsMatFlush, hasSpitterOpt, hasScreamerOpt) {
    E.activeHighWater = highWater;
    if (E._st._useSkinnedRigs) return;

    for (let m = 0; m < E._st._corePartMeshes.length; m++) {
      if (E._st._corePartMeshes[m]) {
        E._st._corePartMeshes[m].count = E.activeHighWater;
      }
    }

    let hasSpitter = hasSpitterOpt;
    let hasScreamer = hasScreamerOpt;
    if (hasSpitter === undefined || hasScreamer === undefined) {
      hasSpitter = false;
      hasScreamer = false;
      if (hasBio) {
        for (let i = 0; i < highWater; i++) {
          const z = E.zombies[i];
          if (!z || (!z.active && !z.dead) || z.dead) continue;
          if (z.variant === 'spitter') hasSpitter = true;
          else if (z.variant === 'screamer') hasScreamer = true;
        }
      }
    }

    if (E._st._bruteArmorMesh) {
      E._st._bruteArmorMesh.visible = E.warmupActive || hasBruteArmor;
      E._st._bruteArmorMesh.count = E.activeHighWater;
    }
    if (E._st._bruteHelmetMesh) {
      E._st._bruteHelmetMesh.visible = E.warmupActive || hasBruteArmor;
      E._st._bruteHelmetMesh.count = E.activeHighWater;
    }
    if (E._st._spitterBioMesh) {
      E._st._spitterBioMesh.visible = E.warmupActive || hasSpitter;
      E._st._spitterBioMesh.count = E.activeHighWater;
    }
    if (E._st._spitterGearMesh) {
      E._st._spitterGearMesh.visible = E.warmupActive || hasSpitter;
      E._st._spitterGearMesh.count = E.activeHighWater;
    }
    if (E._st._spitterMaskMesh) {
      E._st._spitterMaskMesh.visible = E.warmupActive || hasSpitter;
      E._st._spitterMaskMesh.count = E.activeHighWater;
    }
    if (E._st._screamerRibMesh) {
      E._st._screamerRibMesh.visible = E.warmupActive || hasScreamer;
      E._st._screamerRibMesh.count = E.activeHighWater;
    }
    if (E._st._screamerJawMesh) {
      E._st._screamerJawMesh.visible = E.warmupActive || hasScreamer;
      E._st._screamerJawMesh.count = E.activeHighWater;
    }
    if (E._st._screamerCystMesh) {
      E._st._screamerCystMesh.visible = E.warmupActive || hasScreamer;
      E._st._screamerCystMesh.count = E.activeHighWater;
    }
    if (E._st._ragMesh) {
      E._st._ragMesh.visible = E.warmupActive || hasRag;
      E._st._ragMesh.count = E.activeHighWater;
    }

    if (needsMatFlush) {
      E.flushMeshMatrices();
    }
  }


  E.buildZombieMeshes = buildZombieMeshes;
  E.buildBileAndPuddleMeshes = buildBileAndPuddleMeshes;
  E.assignVariantVisuals = assignVariantVisuals;
  E.applyZombieColors = applyZombieColors;
  E.markColorsDirty = markColorsDirty;
  E.setHeadEyeDead = setHeadEyeDead;
  E.zeroZombieMatrices = zeroZombieMatrices;
  E.syncMeshCounts = syncMeshCounts;
  E.flushMeshMatrices = flushMeshMatrices;
  E.spawnBileProjectile = spawnBileProjectile;
  E.spawnBilePuddle = spawnBilePuddle;
  E.updateBileProjectiles = updateBileProjectiles;
  E.updateOverlayVisibilityAndCounts = updateOverlayVisibilityAndCounts;
})(window.LRT = window.LRT || {});
