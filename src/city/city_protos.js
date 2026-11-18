(function () {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});

  const STREET_GROUND_Y = -1.00;
  const SIDEWALK_Y = -0.82;
  const RAIL_TOP_Y = -1.00;
  const CROSSING_Z_SOUTH = -74.0;
  const CROSSING_Z_NORTH = 74.0;
  const CROSSING_HALF_W = 6.0; // z in [-80..-68] and [+68..+80]

  const _tmpDummy = new THREE.Object3D();
  const _tmpBox = new THREE.Box3();
  const _tmpVec = new THREE.Vector3();
  const _tmpMat4 = new THREE.Matrix4();
  const _tmpColor = new THREE.Color();

  function fallbackRng(seed) {
    let a = (seed >>> 0) || 1337;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function prepGeo(geo, wantColor) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const attr in g.attributes) {
      if (attr !== 'position' && attr !== 'normal' && attr !== 'uv' && !(wantColor && attr === 'color')) {
        g.deleteAttribute(attr);
      }
    }
    if (wantColor && !g.attributes.color) {
      const count = g.attributes.position.count;
      const arr = new Float32Array(count * 3);
      arr.fill(1.0);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return g;
  }

  function applyMetricUVs(geo, tileMeters) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    const invTile = 1.0 / (tileMeters || 4.0);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const nx = norm.getX(i);
      const ny = norm.getY(i);
      const nz = norm.getZ(i);
      if (Math.abs(ny) > 0.65) {
        uv[i * 2] = x * invTile;
        uv[i * 2 + 1] = z * invTile;
      } else {
        const hLen = Math.hypot(nx, nz) || 1.0;
        const tx = -nz / hLen;
        const tz = nx / hLen;
        uv[i * 2] = (x * tx + z * tz) * invTile;
        uv[i * 2 + 1] = y * invTile;
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return prepGeo(g, false);
  }

  function transformGeo(geo, x, y, z, rx, ry, rz) {
    if (rx) geo.rotateX(rx);
    if (ry) geo.rotateY(ry);
    if (rz) geo.rotateZ(rz);
    if (x || y || z) geo.translate(x, y, z);
    return geo;
  }

  function addBox(bucket, w, h, d, x, y, z, rx, ry, rz, tileMeters) {
    const g = new THREE.BoxGeometry(w, h, d);
    transformGeo(g, x, y, z, rx, ry, rz);
    bucket.push(applyMetricUVs(g, tileMeters || 4.0));
  }

  function addCylinder(bucket, rTop, rBot, h, segs, x, y, z, rx, ry, rz, tileMeters) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segs || 8);
    transformGeo(g, x, y, z, rx, ry, rz);
    bucket.push(applyMetricUVs(g, tileMeters || 3.0));
  }

  function extrudeShapeXZ(shape, yBottom, height, bevelOpts, tileMeters) {
    const opts = {
      depth: height,
      bevelEnabled: !!(bevelOpts && bevelOpts.bevelEnabled),
      bevelThickness: (bevelOpts && bevelOpts.bevelThickness) || 0,
      bevelSize: (bevelOpts && bevelOpts.bevelSize) || 0,
      bevelSegments: (bevelOpts && bevelOpts.bevelSegments) || 1,
      curveSegments: (bevelOpts && bevelOpts.curveSegments) || 8
    };
    const g = new THREE.ExtrudeGeometry(shape, opts);
    g.rotateX(-Math.PI * 0.5);
    const bevelY = opts.bevelEnabled ? opts.bevelThickness : 0;
    g.translate(0, yBottom + bevelY, 0);
    return applyMetricUVs(g, tileMeters || 4.0);
  }

  function makeRoundedRectShape(x0, z0, x1, z1, radius) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    const w = maxX - minX;
    const d = maxZ - minZ;
    const r = Math.max(0.15, Math.min(radius, w * 0.42, d * 0.42));
    // Map world (x, z) -> shape (x, -z) so rotateX(-PI/2) returns (x, +y, +z)
    const sy0 = -maxZ;
    const sy1 = -minZ;
    const s = new THREE.Shape();
    s.moveTo(minX + r, sy0);
    s.lineTo(maxX - r, sy0);
    s.absarc(maxX - r, sy0 + r, r, -Math.PI * 0.5, 0, false);
    s.lineTo(maxX, sy1 - r);
    s.absarc(maxX - r, sy1 - r, r, 0, Math.PI * 0.5, false);
    s.lineTo(minX + r, sy1);
    s.absarc(minX + r, sy1 - r, r, Math.PI * 0.5, Math.PI, false);
    s.lineTo(minX, sy0 + r);
    s.absarc(minX + r, sy0 + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }

  function makePolyShapeXZ(ptsXZ) {
    const s = new THREE.Shape();
    for (let i = 0; i < ptsXZ.length; i++) {
      const px = ptsXZ[i][0];
      const py = -ptsXZ[i][1];
      if (i === 0) s.moveTo(px, py);
      else s.lineTo(px, py);
    }
    s.closePath();
    return s;
  }

  // Signed area check in XZ so extruded caps face +Y cleanly
  function ensureCCWShapeXZ(ptsXZ) {
    let area2 = 0;
    for (let i = 0; i < ptsXZ.length; i++) {
      const a = ptsXZ[i];
      const b = ptsXZ[(i + 1) % ptsXZ.length];
      // In shape space (x, -z)
      area2 += a[0] * (-b[1]) - b[0] * (-a[1]);
    }
    return area2 >= 0 ? ptsXZ : ptsXZ.slice().reverse();
  }

  function addHippedRoof(bucket, x0, z0, x1, z1, yBase, height, overhang, tileMeters) {
    const ov = overhang || 0.42;
    const minX = Math.min(x0, x1) - ov;
    const maxX = Math.max(x0, x1) + ov;
    const minZ = Math.min(z0, z1) - ov;
    const maxZ = Math.max(z0, z1) + ov;
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const yTop = yBase + height;

    // Ridge runs along longer axis
    let r0x, r0z, r1x, r1z;
    if (w >= d) {
      const inset = Math.min(w * 0.35, d * 0.45);
      r0x = minX + inset;
      r1x = maxX - inset;
      r0z = cz;
      r1z = cz;
    } else {
      const inset = Math.min(d * 0.35, w * 0.45);
      r0x = cx;
      r1x = cx;
      r0z = minZ + inset;
      r1z = maxZ - inset;
    }

    const pBL = [minX, yBase, maxZ];
    const pBR = [maxX, yBase, maxZ];
    const pTR = [maxX, yBase, minZ];
    const pTL = [minX, yBase, minZ];
    const verts = [];
    const pushTri = (a, b, c) => {
      verts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    };

    if (w >= d) {
      const rL = [r0x, yTop, r0z];
      const rR = [r1x, yTop, r1z];
      // South (+Z) slope
      pushTri(pBL, pBR, rR);
      pushTri(pBL, rR, rL);
      // North (-Z) slope
      pushTri(pTR, pTL, rL);
      pushTri(pTR, rL, rR);
      // West (-X) hip
      pushTri(pTL, pBL, rL);
      // East (+X) hip
      pushTri(pBR, pTR, rR);
    } else {
      const rN = [r0x, yTop, r0z];
      const rS = [r1x, yTop, r1z];
      // West (-X) slope
      pushTri(pTL, pBL, rS);
      pushTri(pTL, rS, rN);
      // East (+X) slope
      pushTri(pBR, pTR, rN);
      pushTri(pBR, rN, rS);
      // North (-Z) hip
      pushTri(pTR, pTL, rN);
      // South (+Z) hip
      pushTri(pBL, pBR, rS);
    }
    // Bottom soffit cap
    pushTri(pBL, pTL, pTR);
    pushTri(pBL, pTR, pBR);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    bucket.push(applyMetricUVs(g, tileMeters || 3.0));
  }

  function addWedgeRamp(bucket, x0, z0, x1, z1, y0, y1, axis, tileMeters) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    const base = Math.min(y0, y1) - 0.04;
    const verts = [];
    const pushQuad = (a, b, c, d) => {
      verts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      verts.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    };

    let t00, t10, t11, t01;
    if (axis === 'x') {
      t00 = [minX, y0, minZ];
      t10 = [maxX, y1, minZ];
      t11 = [maxX, y1, maxZ];
      t01 = [minX, y0, maxZ];
    } else {
      t00 = [minX, y0, minZ];
      t10 = [maxX, y0, minZ];
      t11 = [maxX, y1, maxZ];
      t01 = [minX, y1, maxZ];
    }
    const b00 = [minX, base, minZ];
    const b10 = [maxX, base, minZ];
    const b11 = [maxX, base, maxZ];
    const b01 = [minX, base, maxZ];

    // Top sloped face (facing +Y)
    pushQuad(t01, t11, t10, t00);
    // Side walls
    pushQuad(b00, b10, t10, t00); // -Z
    pushQuad(b11, b01, t01, t11); // +Z
    pushQuad(b01, b00, t00, t01); // -X
    pushQuad(b10, b11, t11, t10); // +X

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    bucket.push(applyMetricUVs(g, tileMeters || 2.5));
  }

  function createAngsanaLeafTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);

    // Draw overlapping tropical pinnate leaflet sprays (non-blob, crisp alpha silhouette!)
    const rng = fallbackRng(9091);
    ctx.strokeStyle = '#3b2e1e';
    ctx.lineWidth = 3;
    for (let s = 0; s < 5; s++) {
      const ang = -Math.PI * 0.5 + (s - 2) * 0.34;
      ctx.beginPath();
      ctx.moveTo(128, 224);
      ctx.lineTo(128 + Math.cos(ang) * 165, 224 + Math.sin(ang) * 165);
      ctx.stroke();
    }

    for (let i = 0; i < 68; i++) {
      const branch = Math.floor(rng() * 5);
      const ang = -Math.PI * 0.5 + (branch - 2) * 0.34;
      const dist = 34 + rng() * 145;
      const side = (i & 1) ? 1 : -1;
      const bx = 128 + Math.cos(ang) * dist + Math.cos(ang + side * 1.2) * (10 + rng() * 24);
      const by = 224 + Math.sin(ang) * dist + Math.sin(ang + side * 1.2) * (10 + rng() * 24);
      const rx = 14 + rng() * 14;
      const ry = 7 + rng() * 7;
      const rot = ang + side * (0.55 + rng() * 0.45);
      const gCol = Math.floor(82 + rng() * 64);
      const rCol = Math.floor(38 + rng() * 34);
      const bCol = Math.floor(26 + rng() * 22);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(rot);
      ctx.fillStyle = `rgb(${rCol},${gCol},${bCol})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(22,42,16,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.8, 0);
      ctx.lineTo(rx * 0.8, 0);
      ctx.stroke();
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // Non-blob procedural multi-branch tropical Angsana street tree (branches + alpha-masked leaf fans)
  function buildAngsanaTreeParts() {
    const barkParts = [];
    const leafParts = [];

    const addLimb = (x0, y0, z0, x1, y1, z1, r0, r1) => {
      const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
      const len = dir.length();
      if (len < 0.05) return;
      const g = new THREE.CylinderGeometry(r1, r0, len, 6);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5),
        q,
        new THREE.Vector3(1, 1, 1)
      );
      g.applyMatrix4(m);
      barkParts.push(prepGeo(g, false));
    };

    // Main curved trunk + spreading limbs
    addLimb(0, 0, 0, 0.08, 1.85, -0.05, 0.22, 0.16);
    addLimb(0.08, 1.80, -0.05, 0.15, 3.25, 0.08, 0.16, 0.10);

    const boughs = [
      [0.12, 2.55, 0.02, 1.45, 4.15, 0.75, 0.11, 0.05],
      [0.10, 2.65, 0.00, -1.55, 4.05, 0.65, 0.11, 0.05],
      [0.14, 2.75, 0.04, 0.85, 4.35, -1.45, 0.10, 0.05],
      [0.09, 2.45, -0.04, -1.10, 3.95, -1.25, 0.10, 0.05],
      [0.15, 3.15, 0.08, 0.10, 4.75, 0.15, 0.09, 0.04]
    ];
    const crownAnchors = [];
    for (let i = 0; i < boughs.length; i++) {
      const b = boughs[i];
      addLimb(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]);
      crownAnchors.push([b[3], b[4], b[5]]);
      crownAnchors.push([(b[0] + b[3]) * 0.55, (b[1] + b[4]) * 0.55 + 0.35, (b[2] + b[5]) * 0.55]);
    }

    // Layered crossed/drooping pinnate foliage cards around branch tips (zero spheres!)
    const rng = fallbackRng(4567);
    for (let a = 0; a < crownAnchors.length; a++) {
      const [ax, ay, az] = crownAnchors[a];
      for (let f = 0; f < 3; f++) {
        const w = 1.65 + rng() * 0.95;
        const h = 1.45 + rng() * 0.75;
        const card = new THREE.PlaneGeometry(w, h);
        card.rotateX(-0.95 + (rng() - 0.5) * 0.55);
        card.rotateY(rng() * Math.PI * 2);
        card.rotateZ((rng() - 0.5) * 0.35);
        card.translate(ax + (rng() - 0.5) * 0.65, ay + (rng() - 0.3) * 0.45, az + (rng() - 0.5) * 0.65);
        leafParts.push(prepGeo(card, false));
      }
    }

    const barkGeo = THREE_UTILS.mergeGeometries(barkParts, false);
    const leafGeo = THREE_UTILS.mergeGeometries(leafParts, false);
    for (let i = 0; i < barkParts.length; i++) barkParts[i].dispose();
    for (let i = 0; i < leafParts.length; i++) leafParts[i].dispose();
    return { barkGeo, leafGeo };
  }

  // Module-level persistent prototype cache & procedural Angsana tree cache (never disposed per station!)
  const _cityProtoCache = new Map();
  const _cityNormCache = new Map();
  let _angsanaCachedParts = null;
  let _angsanaCachedLeafTex = null;
  let _angsanaCachedMatLeaf = null;

  function getCachedAngsanaTreeParts() {
    if (!_angsanaCachedParts) {
      _angsanaCachedParts = buildAngsanaTreeParts();
    }
    return _angsanaCachedParts;
  }

  function getCachedAngsanaLeafMaterial() {
    if (!_angsanaCachedMatLeaf) {
      _angsanaCachedLeafTex = createAngsanaLeafTexture();
      _angsanaCachedMatLeaf = new THREE.MeshStandardMaterial({
        map: _angsanaCachedLeafTex,
        alphaTest: 0.42,
        side: THREE.DoubleSide,
        roughness: 0.84,
        metalness: 0.0
      });
    }
    return _angsanaCachedMatLeaf;
  }

  // Extract normalized prototype parts from Poly Haven .gltf models (supports multi-variant filter, pivot override & 3-tier LOD)
  function extractModelProto(key, targetHeight, filterFn, pivotOverride, protoCacheKey, lodTier) {
    const tier = lodTier || 0;
    const filterKey = protoCacheKey || (filterFn ? filterFn.toString().replace(/\s+/g, ' ') : '');
    const pivKey = pivotOverride ? `${pivotOverride.x},${pivotOverride.y},${pivotOverride.z}` : '';
    const normKey = `${key}|${targetHeight || 0}|${filterKey}|${pivKey}`;
    const cacheKey = `${normKey}|L${tier}`;
    if (_cityProtoCache.has(cacheKey)) {
      return _cityProtoCache.get(cacheKey);
    }

    if (tier > 0 && !_cityNormCache.has(normKey)) {
      extractModelProto(key, targetHeight, filterFn, pivotOverride, protoCacheKey, 0);
    }

    const LRT = window.LRT;
    const loader = LRT && LRT.AssetLoader;
    if (!loader || typeof loader.getModelRaw !== 'function') return null;
    const raw = loader.getModelRaw(key);
    if (!raw) return null;

    raw.updateMatrixWorld(true);
    let hasLodNodes = false;
    raw.traverse((node) => {
      if (node.isMesh && /_LOD([012])$/.test(node.name || '')) hasLodNodes = true;
    });
    if (tier > 0 && !hasLodNodes) return null;

    const selected = [];
    raw.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const m = (node.name || '').match(/_LOD([012])$/);
      if (hasLodNodes) {
        const nodeTier = m ? Number(m[1]) : 0;
        if (nodeTier !== tier) return;
      }
      const cleanNode = m ? { name: node.name.slice(0, -5), isMesh: true, material: node.material } : node;
      if (filterFn && !filterFn(cleanNode)) return;
      selected.push(node);
    });
    if (selected.length === 0) return null;

    let norm = _cityNormCache.get(normKey);
    if (!norm) {
      _tmpBox.makeEmpty();
      const meshBox = new THREE.Box3();
      for (let i = 0; i < selected.length; i++) {
        const g = selected[i].geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        meshBox.copy(g.boundingBox).applyMatrix4(selected[i].matrixWorld);
        _tmpBox.union(meshBox);
      }
      const rawSize = _tmpBox.getSize(new THREE.Vector3());
      const rawCenter = _tmpBox.getCenter(new THREE.Vector3());
      const scale = targetHeight && rawSize.y > 0.01 ? (targetHeight / rawSize.y) : 1.0;
      const pivX = pivotOverride && pivotOverride.x !== undefined ? pivotOverride.x : rawCenter.x;
      const pivY = pivotOverride && pivotOverride.y !== undefined ? pivotOverride.y : _tmpBox.min.y;
      const pivZ = pivotOverride && pivotOverride.z !== undefined ? pivotOverride.z : rawCenter.z;
      norm = {
        pivX, pivY, pivZ, scale,
        size: { x: rawSize.x * scale, y: rawSize.y * scale, z: rawSize.z * scale }
      };
      _cityNormCache.set(normKey, norm);
    }

    const partsByMat = new Map();
    for (let i = 0; i < selected.length; i++) {
      const node = selected[i];
      const g = node.geometry.clone();
      g.applyMatrix4(node.matrixWorld);
      g.translate(-norm.pivX, -norm.pivY, -norm.pivZ);
      if (norm.scale !== 1.0) g.scale(norm.scale, norm.scale, norm.scale);
      const normGeo = prepGeo(g, false);
      const mat = Array.isArray(node.material) ? node.material[0] : node.material;
      if (mat && 'envMapIntensity' in mat && (!mat.envMapIntensity || mat.envMapIntensity < 0.8)) {
        mat.envMapIntensity = 1.0;
      }
      if (!partsByMat.has(mat)) partsByMat.set(mat, []);
      partsByMat.get(mat).push(normGeo);
    }

    const parts = [];
    for (const [mat, geos] of partsByMat.entries()) {
      const merged = geos.length === 1 ? geos[0] : THREE_UTILS.mergeGeometries(geos, false);
      if (geos.length > 1) {
        for (let j = 0; j < geos.length; j++) geos[j].dispose();
      }
      if (!merged) continue;
      // CRITICAL: Do NOT push cached prototype geometries into this.disposableGeometries!
      parts.push({ geo: merged, mat });
    }
    if (parts.length === 0) return null;

    const proto = {
      parts,
      size: norm.size
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  function addPaintBox(bucket, w, h, d, x, y, z, rx, ry, rz) {
    const g = new THREE.BoxGeometry(w, h, d);
    transformGeo(g, x, y, z, rx, ry, rz);
    bucket.push(applyMetricUVs(g, 2.0));
  }

  function fillGeoVertexColor(geo, hexColor, bottomShade) {
    const g = prepGeo(geo, true);
    _tmpColor.setHex(hexColor);
    const r0 = _tmpColor.r;
    const g0 = _tmpColor.g;
    const b0 = _tmpColor.b;
    const shade = bottomShade !== undefined ? bottomShade : 0.85;
    const pos = g.attributes.position;
    const col = g.attributes.color;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const spanY = Math.max(0.01, maxY - minY);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - minY) / spanY;
      const k = shade + (1.0 - shade) * t;
      col.setXYZ(i, r0 * k, g0 * k, b0 * k);
    }
    return g;
  }

  function addColoredBox(bucket, w, h, d, x, y, z, rx, ry, rz, hexColor, bottomShade) {
    const g = new THREE.BoxGeometry(w, h, d);
    transformGeo(g, x, y, z, rx, ry, rz);
    bucket.push(fillGeoVertexColor(g, hexColor, bottomShade));
  }

  function addColoredCylinder(bucket, rTop, rBot, h, segs, x, y, z, rx, ry, rz, hexColor, bottomShade) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segs || 8);
    transformGeo(g, x, y, z, rx, ry, rz);
    bucket.push(fillGeoVertexColor(g, hexColor, bottomShade));
  }

  // Persistent module-level cached materials for procedural Jakarta vehicles & props
  let _vehPaintMat = null;
  let _vehPaintedVertexMat = null;
  let _vehTrimMat = null;
  let _vehGlassMat = null;
  let _vehRubberMat = null;
  let _vehAlloyMat = null;
  let _vehHeadlightMat = null;
  let _vehTaillightMat = null;
  let _vehAmberMat = null;
  let _gerobakDisplayGlassMat = null;
  let _propWoodMat = null;
  let _propConcreteMat = null;
  let _trafficAmberMat = null;
  let _highwaySignMat = null;
  let _cityLodMat = null;
  let _lampBulbMat = null;
  const TRAFFIC_BLINK_RATE = 1.15;
  const TRAFFIC_BLINK_PHASE_SCALE = 0.037;
  const TRAFFIC_BLINK_THRESHOLD = 0.45;
  const _trafficSignalUniforms = {
    uBlinkTime: { value: 0 }
  };

  /** Evaluates the traffic signal blink multiplier in sync with getTrafficAmberMaterial(). */
  function evalTrafficSignalBlink(worldX, worldZ, time) {
    const t = time !== undefined ? time : _trafficSignalUniforms.uBlinkTime.value;
    const phaseRaw = ((worldX || 0) + (worldZ || 0)) * TRAFFIC_BLINK_PHASE_SCALE;
    const sigPhase = phaseRaw - Math.floor(phaseRaw);
    const waveRaw = (t || 0) * TRAFFIC_BLINK_RATE + sigPhase;
    const wave = waveRaw - Math.floor(waveRaw);
    const blinkOn = wave >= TRAFFIC_BLINK_THRESHOLD ? 1.0 : 0.0;
    return (0.14 + 1.65 * blinkOn) / 1.79;
  }

  function getVehiclePaintMaterial() {
    if (!_vehPaintMat) {
      _vehPaintMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.28,
        metalness: 0.55,
        envMapIntensity: 1.35
      });
    }
    return _vehPaintMat;
  }

  function getVehiclePaintedVertexMaterial() {
    if (!_vehPaintedVertexMat) {
      _vehPaintedVertexMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.28,
        metalness: 0.55,
        envMapIntensity: 1.3
      });
    }
    return _vehPaintedVertexMat;
  }

  function getVehicleTrimMaterial() {
    if (!_vehTrimMat) {
      _vehTrimMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.64,
        metalness: 0.22
      });
    }
    return _vehTrimMat;
  }

  function getCabinGlassMaterial() {
    if (!_vehGlassMat) {
      _vehGlassMat = new THREE.MeshStandardMaterial({
        color: 0x101c26,
        roughness: 0.12,
        metalness: 0.20,
        envMapIntensity: 1.55
      });
    }
    return _vehGlassMat;
  }

  function getRubberTireMaterial() {
    if (!_vehRubberMat) {
      _vehRubberMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.90,
        metalness: 0.04
      });
    }
    return _vehRubberMat;
  }

  function getAlloyMetalMaterial() {
    if (!_vehAlloyMat) {
      _vehAlloyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.30,
        metalness: 0.82,
        envMapIntensity: 1.35
      });
    }
    return _vehAlloyMat;
  }

  function getHeadlightEmissiveMaterial() {
    if (!_vehHeadlightMat) {
      _vehHeadlightMat = new THREE.MeshStandardMaterial({
        color: 0xf4f2e6,
        emissive: new THREE.Color(0xfff1cc),
        emissiveIntensity: 0.72,
        roughness: 0.18,
        metalness: 0.15
      });
    }
    return _vehHeadlightMat;
  }

  function getTaillightEmissiveMaterial() {
    if (!_vehTaillightMat) {
      _vehTaillightMat = new THREE.MeshStandardMaterial({
        color: 0xb91c1c,
        emissive: new THREE.Color(0xdc2626),
        emissiveIntensity: 0.65,
        roughness: 0.22,
        metalness: 0.12
      });
    }
    return _vehTaillightMat;
  }

  function getAmberAccentEmissiveMaterial() {
    if (!_vehAmberMat) {
      _vehAmberMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: new THREE.Color(0xf59e0b),
        emissiveIntensity: 0.90,
        roughness: 0.28,
        metalness: 0.10
      });
    }
    return _vehAmberMat;
  }

  function getWarmDisplayGlassMaterial() {
    if (!_gerobakDisplayGlassMat) {
      _gerobakDisplayGlassMat = new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: new THREE.Color(0xf59e0b),
        emissiveIntensity: 0.58,
        roughness: 0.16,
        metalness: 0.12,
        transparent: true,
        opacity: 0.80
      });
    }
    return _gerobakDisplayGlassMat;
  }

  function getWoodPbrMaterial() {
    if (!_propWoodMat) {
      _propWoodMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.04
      });
    }
    return _propWoodMat;
  }

  function getConcretePbrMaterial() {
    if (!_propConcreteMat) {
      _propConcreteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.90,
        metalness: 0.03
      });
    }
    return _propConcreteMat;
  }

  function getTrafficAmberMaterial() {
    if (!_trafficAmberMat) {
      _trafficAmberMat = new THREE.MeshStandardMaterial({
        color: 0xffaa22,
        emissive: new THREE.Color(0xff8c00),
        emissiveIntensity: 2.2,
        roughness: 0.25,
        metalness: 0.1
      });
      _trafficAmberMat.customProgramCacheKey = () => 'lrt_traffic_amber_blink_v1';
      _trafficAmberMat.onBeforeCompile = (shader) => {
        shader.uniforms.uBlinkTime = _trafficSignalUniforms.uBlinkTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vSigPhase;')
          .replace(
            '#include <project_vertex>',
            `#include <project_vertex>
            vec4 sigWp = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              sigWp = instanceMatrix * sigWp;
            #endif
            sigWp = modelMatrix * sigWp;
            vSigPhase = fract((sigWp.x + sigWp.z) * 0.037);`
          );
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uBlinkTime;\nvarying float vSigPhase;')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float blinkOn = step(0.45, fract(uBlinkTime * 1.15 + vSigPhase));
            totalEmissiveRadiance *= (0.14 + 1.65 * blinkOn);`
          );
      };
    }
    return _trafficAmberMat;
  }

  function updateTrafficSignalTime(t) {
    _trafficSignalUniforms.uBlinkTime.value = t || 0;
  }

  function getHighwaySignMaterial() {
    if (!_highwaySignMat) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 192;
      const ctx = c.getContext('2d');

      ctx.fillStyle = '#0e6b38';
      ctx.fillRect(0, 0, 512, 192);
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 176);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(254, 16, 4, 160);

      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('← SUDIRMAN', 24, 60, 218);
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#d1fae5';
      ctx.fillText('THAMRIN • DUKUH ATAS', 24, 96, 218);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(24, 118, 196, 36);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('JALUR KORIDOR LRT', 32, 142, 180);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('CAWANG / HALIM ↑', 274, 60, 222);
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#d1fae5';
      ctx.fillText('TOL DALAM KOTA →', 274, 96, 222);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('EXIT MT HARYONO 400m', 274, 142, 222);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      _highwaySignMat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(0x0b4a26),
        emissiveMap: tex,
        emissiveIntensity: 0.25,
        roughness: 0.45,
        metalness: 0.1
      });
    }
    return _highwaySignMat;
  }

  function getCityLodMaterial() {
    if (!_cityLodMat) {
      _cityLodMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.08
      });
    }
    return _cityLodMat;
  }

  function getLampBulbMaterial() {
    if (!_lampBulbMat) {
      _lampBulbMat = new THREE.MeshStandardMaterial({
        color: 0xfff1cc,
        emissive: new THREE.Color(0xffaa44),
        emissiveIntensity: 2.4,
        roughness: 0.2,
        metalness: 0.0
      });
    }
    return _lampBulbMat;
  }

  function mergePartBuckets(partDefs) {
    const parts = [];
    for (let i = 0; i < partDefs.length; i++) {
      const pd = partDefs[i];
      if (!pd.bucket || pd.bucket.length === 0) continue;
      const merged = pd.bucket.length === 1 ? pd.bucket[0] : THREE_UTILS.mergeGeometries(pd.bucket, false);
      if (pd.bucket.length > 1) {
        for (let j = 0; j < pd.bucket.length; j++) pd.bucket[j].dispose();
      }
      if (!merged) continue;
      parts.push({ geo: merged, mat: pd.mat });
    }
    return parts;
  }

  function addWheelPair(rubberBucket, alloyBucket, radius, width, y, z, halfTrack) {
    for (const sx of [-halfTrack, halfTrack]) {
      const sideSign = sx < 0 ? -1 : 1;
      addColoredCylinder(rubberBucket, radius, radius, width, 12, sx, y, z, 0, 0, Math.PI * 0.5, 0x16181c, 0.78);
      addColoredCylinder(alloyBucket, radius * 0.58, radius * 0.58, width + 0.018, 10, sx, y, z, 0, 0, Math.PI * 0.5, 0xb8c0ca, 0.88);
      addColoredCylinder(alloyBucket, radius * 0.22, radius * 0.22, 0.025, 8, sx + sideSign * (width * 0.5 + 0.008), y, z, 0, 0, Math.PI * 0.5, 0x2d333b, 0.92);
    }
  }

  function addLicensePlate(rubberBucket, alloyBucket, x, y, z, isYellowPublic) {
    addColoredBox(rubberBucket, 0.44, 0.13, 0.025, x, y, z, 0, 0, 0, 0x121417, 0.9);
    const faceCol = isYellowPublic ? 0xeab308 : 0xe2e8f0;
    const faceZ = z >= 0 ? z + 0.010 : z - 0.010;
    addColoredBox(alloyBucket, 0.38, 0.09, 0.014, x, y, faceZ, 0, 0, 0, faceCol, 0.95);
  }

  // Indonesian Sedan & MPV (Avanza/Innova) prototypes: paint part (for instanceColor) + PBR glass/rubber/alloy/lights
  function getSedanMpvProto(variant) {
    const cacheKey = 'proc_veh_v2_' + variant;
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const isMpv = variant === 'mpv_ajar';
    const bPaint = [];
    const bGlass = [];
    const bRubber = [];
    const bAlloy = [];
    const bHeadlight = [];
    const bTaillight = [];

    const len = isMpv ? 4.42 : 4.24;
    const w = isMpv ? 1.74 : 1.70;
    const wheelR = isMpv ? 0.34 : 0.31;

    // 4 rubber tires + silver alloy rims + dark undercarriage + front/rear bumpers
    addWheelPair(bRubber, bAlloy, wheelR, 0.22, wheelR, 1.32, w * 0.46);
    addWheelPair(bRubber, bAlloy, wheelR, 0.22, wheelR, -1.32, w * 0.46);
    addColoredBox(bRubber, w * 0.90, 0.16, len * 0.92, 0, wheelR * 0.75, 0, 0, 0, 0, 0x181a1d, 0.8);
    addColoredBox(bRubber, w * 0.98, 0.25, 0.24, 0, wheelR + 0.11, len * 0.48, 0, 0, 0, 0x1f2328, 0.75);
    addColoredBox(bRubber, w * 0.98, 0.25, 0.24, 0, wheelR + 0.11, -len * 0.48, 0, 0, 0, 0x1f2328, 0.75);
    // Front & rear Indonesian license plates + chrome exhaust pipe
    addLicensePlate(bRubber, bAlloy, 0, wheelR + 0.12, len * 0.505, false);
    addLicensePlate(bRubber, bAlloy, 0, wheelR + 0.16, -len * 0.505, false);
    addColoredCylinder(bAlloy, 0.032, 0.036, 0.22, 8, w * 0.28, wheelR * 0.58, -len * 0.49, Math.PI * 0.5, 0, 0, 0x9ca3af, 0.88);
    // Emissive headlights & taillights
    addBox(bHeadlight, 0.32, 0.13, 0.07, -w * 0.34, wheelR + 0.38, len * 0.492);
    addBox(bHeadlight, 0.32, 0.13, 0.07, w * 0.34, wheelR + 0.38, len * 0.492);
    addBox(bTaillight, 0.30, 0.13, 0.07, -w * 0.34, wheelR + 0.42, -len * 0.492);
    addBox(bTaillight, 0.30, 0.13, 0.07, w * 0.34, wheelR + 0.42, -len * 0.492);
    // Chrome-rimmed front grille + dark slats + door handles + side mirrors
    addColoredBox(bAlloy, w * 0.48, 0.22, 0.05, 0, wheelR + 0.34, len * 0.488, 0, 0, 0, 0xb8c0cc, 0.9);
    addColoredBox(bRubber, w * 0.42, 0.16, 0.06, 0, wheelR + 0.34, len * 0.492, 0, 0, 0, 0x16181c, 0.8);
    for (const sx of [-1, 1]) {
      addColoredBox(bAlloy, 0.10, 0.035, 0.04, sx * (w * 0.5 + 0.04), wheelR + 0.64, 0.66, 0, 0, 0, 0x374151, 0.9);
      addColoredBox(bAlloy, 0.14, 0.09, 0.10, sx * (w * 0.5 + 0.10), wheelR + 0.66, 0.65, 0, sx * 0.12, 0, 0x9ca3af, 0.92);
      if (!(isMpv && sx < 0)) {
        addColoredBox(bAlloy, 0.03, 0.035, 0.14, sx * (w * 0.505), wheelR + 0.48, 0.18, 0, 0, 0, 0xcbd5e1, 0.9);
      }
      addColoredBox(bAlloy, 0.03, 0.035, 0.14, sx * (w * 0.505), wheelR + 0.48, -0.58, 0, 0, 0, 0xcbd5e1, 0.9);
    }

    // Lower painted chassis body
    addPaintBox(bPaint, w, 0.56, len * 0.96, 0, wheelR + 0.32, 0);

    if (isMpv) {
      // Avanza/Innova longer greenhouse + roof rack rails + ajar driver door & popped hood
      addPaintBox(bPaint, w * 0.88, 0.58, 2.52, 0, wheelR + 0.86, -0.34);
      // Popped hood (+Z front) tilted up ~14 deg + dark engine bay underneath
      addColoredBox(bRubber, w * 0.78, 0.24, 1.05, 0, wheelR + 0.50, 1.38, 0, 0, 0, 0x1d1f23, 0.7);
      addPaintBox(bPaint, w * 0.92, 0.07, 1.12, 0, wheelR + 0.72, 1.34, -0.24, 0, 0);
      // Slightly ajar front-left door
      addPaintBox(bPaint, 0.08, 0.54, 0.92, -w * 0.5 - 0.18, wheelR + 0.34, 0.22, 0, -0.38, 0);
      addBox(bGlass, 0.06, 0.42, 0.78, -w * 0.5 - 0.18, wheelR + 0.80, 0.22, 0, -0.38, 0);
      // Glossy dark cabin glass & alloy roof rails
      addBox(bGlass, w * 0.80, 0.44, 0.12, 0, wheelR + 0.84, 0.92, -0.35, 0, 0);
      addBox(bGlass, w * 0.90, 0.42, 2.25, 0, wheelR + 0.85, -0.38);
      addColoredBox(bAlloy, 0.06, 0.06, 2.10, -w * 0.36, wheelR + 1.18, -0.35, 0, 0, 0, 0x9ca3af, 0.9);
      addColoredBox(bAlloy, 0.06, 0.06, 2.10, w * 0.36, wheelR + 1.18, -0.35, 0, 0, 0, 0x9ca3af, 0.9);
    } else {
      // Compact Indonesian sedan greenhouse + trunk + glossy dark glass
      addPaintBox(bPaint, w * 0.86, 0.48, 1.85, 0, wheelR + 0.82, -0.10);
      addBox(bGlass, w * 0.78, 0.38, 0.12, 0, wheelR + 0.78, 0.84, -0.45, 0, 0);
      addBox(bGlass, w * 0.78, 0.36, 0.12, 0, wheelR + 0.78, -1.04, 0.45, 0, 0);
      addBox(bGlass, w * 0.88, 0.34, 1.56, 0, wheelR + 0.80, -0.10);
    }

    const proto = {
      parts: mergePartBuckets([
        { bucket: bPaint, mat: getVehiclePaintMaterial() },
        { bucket: bGlass, mat: getCabinGlassMaterial() },
        { bucket: bRubber, mat: getRubberTireMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() },
        { bucket: bHeadlight, mat: getHeadlightEmissiveMaterial() },
        { bucket: bTaillight, mat: getTaillightEmissiveMaterial() }
      ]),
      size: { x: w, y: isMpv ? 1.66 : 1.44, z: len }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Blue Bird / JakLingko Angkot Minivan (crisp PBR paint, glossy glass, alloy rims, mirrors & yellow plate)
  function getAngkotProto() {
    const cacheKey = 'proc_veh_angkot_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bBody = [];
    const bGlass = [];
    const bRubber = [];
    const bAlloy = [];
    const bHeadlight = [];
    const bTaillight = [];
    const bAmber = [];

    const len = 3.92;
    const w = 1.62;
    const wheelR = 0.31;

    addWheelPair(bRubber, bAlloy, wheelR, 0.20, wheelR, 1.24, w * 0.45);
    addWheelPair(bRubber, bAlloy, wheelR, 0.20, wheelR, -1.24, w * 0.45);
    // Rubber bumpers & undercarriage + yellow public transport plates
    addColoredBox(bRubber, w * 0.90, 0.14, len * 0.92, 0, wheelR * 0.78, 0, 0, 0, 0, 0x16181c, 0.8);
    addColoredBox(bRubber, w * 0.98, 0.24, 0.20, 0, wheelR + 0.08, len * 0.49, 0, 0, 0, 0x1e2226, 0.75);
    addColoredBox(bRubber, w * 0.98, 0.24, 0.20, 0, wheelR + 0.08, -len * 0.49, 0, 0, 0, 0x1e2226, 0.75);
    addLicensePlate(bRubber, bAlloy, 0, wheelR + 0.09, len * 0.515, true);
    addLicensePlate(bRubber, bAlloy, 0, wheelR + 0.11, -len * 0.515, true);
    // Emissive headlights & taillights
    addBox(bHeadlight, 0.26, 0.14, 0.06, -w * 0.34, wheelR + 0.34, len * 0.495);
    addBox(bHeadlight, 0.26, 0.14, 0.06, w * 0.34, wheelR + 0.34, len * 0.495);
    addBox(bTaillight, 0.24, 0.16, 0.06, -w * 0.36, wheelR + 0.38, -len * 0.495);
    addBox(bTaillight, 0.24, 0.16, 0.06, w * 0.36, wheelR + 0.38, -len * 0.495);

    // Sky-blue lower skirt & body + white JakLingko band + upper cabin
    addColoredBox(bBody, w, 0.68, len * 0.96, 0, wheelR + 0.34, 0, 0, 0, 0, 0x1e82cc, 0.82);
    addColoredBox(bBody, w + 0.02, 0.14, len * 0.96, 0, wheelR + 0.66, 0, 0, 0, 0, 0xe8edf2, 0.92);
    addColoredBox(bBody, w * 0.94, 0.58, len * 0.88, 0, wheelR + 0.98, -0.08, 0, 0, 0, 0xe6ebf0, 0.90);
    // Glossy dark cabin glass (front windshield, side & rear windows)
    addBox(bGlass, w * 0.84, 0.42, 0.10, 0, wheelR + 0.96, len * 0.42, -0.18, 0, 0);
    addBox(bGlass, w * 0.96, 0.38, len * 0.68, 0, wheelR + 0.96, -0.14);
    addBox(bGlass, w * 0.78, 0.36, 0.08, 0, wheelR + 0.96, -len * 0.46);
    // Chrome grille, twin side mirrors & alloy roof luggage rack
    addColoredBox(bAlloy, w * 0.44, 0.16, 0.04, 0, wheelR + 0.32, len * 0.49, 0, 0, 0, 0xb8c0cc, 0.9);
    for (const sx of [-1, 1]) {
      addColoredBox(bAlloy, 0.12, 0.11, 0.08, sx * (w * 0.5 + 0.08), wheelR + 0.82, len * 0.35, 0, 0, 0, 0x9ca3af, 0.9);
    }
    addColoredBox(bAlloy, w * 0.74, 0.05, 2.20, 0, wheelR + 1.31, -0.35, 0, 0, 0, 0x94a3b8, 0.88);
    addColoredBox(bAlloy, 0.05, 0.10, 2.20, -w * 0.36, wheelR + 1.35, -0.35, 0, 0, 0, 0x94a3b8, 0.88);
    addColoredBox(bAlloy, 0.05, 0.10, 2.20, w * 0.36, wheelR + 1.35, -0.35, 0, 0, 0, 0x94a3b8, 0.88);
    // Illuminated amber JakLingko route sign on roof brow
    addBox(bAmber, 0.78, 0.16, 0.18, 0, wheelR + 1.34, len * 0.30);

    const proto = {
      parts: mergePartBuckets([
        { bucket: bBody, mat: getVehiclePaintedVertexMaterial() },
        { bucket: bGlass, mat: getCabinGlassMaterial() },
        { bucket: bRubber, mat: getRubberTireMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() },
        { bucket: bHeadlight, mat: getHeadlightEmissiveMaterial() },
        { bucket: bTaillight, mat: getTaillightEmissiveMaterial() },
        { bucket: bAmber, mat: getAmberAccentEmissiveMaterial() }
      ]),
      size: { x: w, y: 1.72, z: len }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // TransJakarta BRT Bus Wreck (crisp PBR paint, glossy glass, coach mirrors, AC rooftop unit, LED brow)
  function getTransJakartaBusProto() {
    const cacheKey = 'proc_veh_tj_bus_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bBody = [];
    const bGlass = [];
    const bRubber = [];
    const bAlloy = [];
    const bHeadlight = [];
    const bTaillight = [];
    const bAmber = [];

    const len = 10.6;
    const w = 2.46;
    const wheelR = 0.50;

    addWheelPair(bRubber, bAlloy, wheelR, 0.32, wheelR, 3.15, w * 0.45);
    addWheelPair(bRubber, bAlloy, wheelR, 0.32, wheelR, -2.85, w * 0.45);
    // Heavy rubber chassis + crumpled front bumper + rear bumper + license plates
    addColoredBox(bRubber, w * 0.94, 0.32, len * 0.96, 0, wheelR * 0.85, 0, 0, 0, 0, 0x16191d, 0.75);
    addColoredBox(bRubber, w * 1.02, 0.34, 0.26, 0.06, wheelR + 0.12, len * 0.50, 0.06, 0.04, -0.04, 0x22262b, 0.75);
    addColoredBox(bRubber, w * 1.00, 0.30, 0.22, 0, wheelR + 0.12, -len * 0.50, 0, 0, 0, 0x22262b, 0.75);
    addLicensePlate(bRubber, bAlloy, 0, wheelR + 0.14, len * 0.52, true);
    addLicensePlate(bRubber, bAlloy, 0, wheelR + 0.18, -len * 0.515, true);

    // Lower TransJakarta sky-blue body + upper white hull + navy/red livery bands
    addColoredBox(bBody, w, 1.05, len, 0, wheelR + 0.52, 0, 0, 0, 0, 0x1b74c4, 0.84);
    addColoredBox(bBody, w * 0.99, 1.38, len * 0.98, 0, wheelR + 1.72, 0, 0, 0, 0, 0xe8edf2, 0.90);
    addColoredBox(bBody, w + 0.02, 0.16, len + 0.02, 0, wheelR + 1.08, 0, 0, 0, 0, 0x0e2f5c, 0.9);
    addColoredBox(bBody, w + 0.02, 0.08, len * 0.96, 0, wheelR + 0.24, 0, 0, 0, 0, 0xc82428, 0.9);

    // Glossy dark panoramic side windows + split front windshield + rear window
    addBox(bGlass, w + 0.02, 0.86, len * 0.84, 0, wheelR + 1.78, -0.25);
    addBox(bGlass, w * 0.88, 1.02, 0.12, 0, wheelR + 1.64, len * 0.49);
    addBox(bGlass, w * 0.82, 0.74, 0.10, 0, wheelR + 1.82, -len * 0.49);
    // Front center wiper mullion & twin tall coach side mirrors
    addColoredBox(bAlloy, 0.08, 1.04, 0.14, 0, wheelR + 1.64, len * 0.495, 0, 0, 0, 0x64748b, 0.9);
    for (const sx of [-1, 1]) {
      addColoredBox(bAlloy, 0.28, 0.05, 0.05, sx * (w * 0.5 + 0.12), wheelR + 1.98, len * 0.49, 0, 0, 0, 0x94a3b8, 0.9);
      addColoredBox(bAlloy, 0.08, 0.34, 0.14, sx * (w * 0.5 + 0.24), wheelR + 1.82, len * 0.51, 0, 0, 0, 0x334155, 0.9);
    }

    // Emissive headlights, taillights & front orange LED destination brow
    addBox(bHeadlight, 0.38, 0.16, 0.08, -w * 0.34, wheelR + 0.46, len * 0.502);
    addBox(bHeadlight, 0.38, 0.16, 0.08, w * 0.34, wheelR + 0.46, len * 0.502);
    addBox(bTaillight, 0.36, 0.22, 0.08, -w * 0.36, wheelR + 0.56, -len * 0.502);
    addBox(bTaillight, 0.36, 0.22, 0.08, w * 0.36, wheelR + 0.56, -len * 0.502);
    addBox(bAmber, 1.65, 0.22, 0.14, 0, wheelR + 2.26, len * 0.495);

    // Detailed Rooftop AC / HVAC Unit (painted shroud + alloy rails + dark fan intake louvers)
    addColoredBox(bAlloy, 1.56, 0.06, 3.72, 0, wheelR + 2.43, 0.4, 0, 0, 0, 0x94a3b8, 0.88);
    addColoredBox(bBody, 1.48, 0.32, 3.60, 0, wheelR + 2.60, 0.4, 0, 0, 0, 0xd1d5db, 0.88);
    for (const fz of [-0.65, 0.40, 1.45]) {
      addColoredBox(bRubber, 1.06, 0.06, 0.72, 0, wheelR + 2.77, fz, 0, 0, 0, 0x1e2228, 0.85);
      addColoredBox(bAlloy, 1.12, 0.04, 0.78, 0, wheelR + 2.76, fz, 0, 0, 0, 0x64748b, 0.90);
    }
    addColoredBox(bAlloy, 1.52, 0.14, 3.20, 0, wheelR + 2.60, 0.4, 0, 0, 0, 0x475569, 0.85);
    addColoredBox(bBody, 1.32, 0.26, 2.20, 0, wheelR + 2.55, -3.2, 0, 0, 0, 0xcbd5e1, 0.86);
    addColoredBox(bRubber, 0.94, 0.05, 1.40, 0, wheelR + 2.69, -3.2, 0, 0, 0, 0x1e2228, 0.85);

    const proto = {
      parts: mergePartBuckets([
        { bucket: bBody, mat: getVehiclePaintedVertexMaterial() },
        { bucket: bGlass, mat: getCabinGlassMaterial() },
        { bucket: bRubber, mat: getRubberTireMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() },
        { bucket: bHeadlight, mat: getHeadlightEmissiveMaterial() },
        { bucket: bTaillight, mat: getTaillightEmissiveMaterial() },
        { bucket: bAmber, mat: getAmberAccentEmissiveMaterial() }
      ]),
      size: { x: w, y: 3.24, z: len }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Detailed Abandoned Indonesian Ojol Scooter (Gojek/Grab green & black courier livery with PBR materials)
  function getOjolProto() {
    const cacheKey = 'proc_veh_ojol_v3';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bBody = [];
    const bGlass = [];
    const bRubber = [];
    const bAlloy = [];
    const bHeadlight = [];
    const bTaillight = [];
    const bAmber = [];

    // Front & rear rubber tires + silver alloy rims + center brake rotors
    for (const wz of [0.64, -0.62]) {
      addColoredCylinder(bRubber, 0.25, 0.25, 0.11, 12, 0, 0.25, wz, 0, 0, Math.PI * 0.5, 0x16181c, 0.78);
      addColoredCylinder(bAlloy, 0.155, 0.155, 0.125, 10, 0, 0.25, wz, 0, 0, Math.PI * 0.5, 0xb4bcc6, 0.88);
      addColoredCylinder(bAlloy, 0.06, 0.06, 0.135, 8, 0, 0.25, wz, 0, 0, Math.PI * 0.5, 0x2a3038, 0.9);
    }
    // Front telescopic fork tubes & arched painted mudguard fender
    for (const fx of [-0.085, 0.085]) {
      addColoredCylinder(bAlloy, 0.022, 0.022, 0.54, 6, fx, 0.50, 0.54, -0.26, 0, 0, 0xcbd5e1, 0.92);
    }
    addColoredBox(bBody, 0.15, 0.05, 0.34, 0, 0.49, 0.63, -0.22, 0, 0, 0x15803d, 0.86);
    // Lower engine casing / CVT swingarm + muffler exhaust pipe + chrome heatshield
    addColoredBox(bRubber, 0.24, 0.16, 0.62, -0.04, 0.27, -0.34, 0, 0, 0, 0x262930, 0.82);
    addColoredCylinder(bAlloy, 0.045, 0.052, 0.48, 8, 0.16, 0.26, -0.44, Math.PI * 0.5 - 0.18, 0, 0, 0x3f444d, 0.85);
    addColoredBox(bAlloy, 0.025, 0.08, 0.34, 0.19, 0.26, -0.44, -0.18, 0, 0, 0xd1d5db, 0.92);
    // Recessed step-through floorboard deck
    addColoredBox(bRubber, 0.34, 0.08, 0.56, 0, 0.25, 0.08, 0, 0, 0, 0x1c1f24, 0.8);
    addColoredBox(bBody, 0.38, 0.10, 0.58, 0, 0.19, 0.06, 0, 0, 0, 0x16a34a, 0.84);
    // Angled front leg-shield fairing (two-tone Gojek green + matte inner knee panel)
    addColoredBox(bBody, 0.38, 0.56, 0.22, 0, 0.58, 0.45, -0.24, 0, 0, 0x16a34a, 0.86);
    addColoredBox(bRubber, 0.32, 0.48, 0.10, 0, 0.57, 0.35, -0.24, 0, 0, 0x22262c, 0.82);
    // Emissive front headlamp + amber turn signals
    addBox(bHeadlight, 0.24, 0.13, 0.10, 0, 0.68, 0.535, -0.18);
    addBox(bAmber, 0.06, 0.06, 0.06, -0.13, 0.68, 0.51);
    addBox(bAmber, 0.06, 0.06, 0.06, 0.13, 0.68, 0.51);
    // Steering stem, speedometer cowl, visor, handlebars + grips + twin mirrors
    addColoredBox(bBody, 0.22, 0.11, 0.18, 0, 0.95, 0.34, -0.12, 0, 0, 0x15803d, 0.88);
    addBox(bGlass, 0.14, 0.04, 0.12, 0, 1.00, 0.31, -0.45);
    addColoredBox(bAlloy, 0.66, 0.045, 0.06, 0, 0.95, 0.32, 0, 0, 0, 0x334155, 0.9);
    addColoredCylinder(bRubber, 0.025, 0.025, 0.14, 6, -0.32, 0.95, 0.31, 0, 0, Math.PI * 0.5, 0x111317, 0.85);
    addColoredCylinder(bRubber, 0.025, 0.025, 0.14, 6, 0.32, 0.95, 0.31, 0, 0, Math.PI * 0.5, 0x111317, 0.85);
    for (const sx of [-1, 1]) {
      addColoredCylinder(bAlloy, 0.01, 0.01, 0.16, 5, sx * 0.25, 1.04, 0.32, 0, 0, -sx * 0.24, 0x9ca3af, 0.9);
      addBox(bGlass, 0.11, 0.065, 0.025, sx * 0.28, 1.12, 0.32);
    }
    // Tapered rear side body panels + contoured leather saddle + rear grab rail
    addColoredBox(bBody, 0.36, 0.34, 0.70, 0, 0.53, -0.36, 0.05, 0, 0, 0x16a34a, 0.85);
    addColoredBox(bRubber, 0.30, 0.12, 0.64, 0, 0.72, -0.26, -0.06, 0, 0, 0x181a1f, 0.86);
    addColoredBox(bAlloy, 0.24, 0.07, 0.30, 0, 0.77, -0.10, 0.08, 0, 0, 0x64748b, 0.9);
    // Tail light + rear fender & license plate
    addBox(bTaillight, 0.20, 0.08, 0.06, 0, 0.56, -0.73);
    addColoredBox(bRubber, 0.18, 0.14, 0.04, 0, 0.40, -0.76, -0.22, 0, 0, 0x111316, 0.9);
    addColoredBox(bAlloy, 0.14, 0.06, 0.02, 0, 0.39, -0.78, -0.22, 0, 0, 0xe2e8f0, 0.95);
    // Side kickstand + Ojol thermal delivery box (Gojek green/white stripe)
    addColoredCylinder(bAlloy, 0.015, 0.015, 0.28, 5, -0.14, 0.13, -0.10, 0, 0, 0.52, 0x64748b, 0.85);
    addColoredBox(bBody, 0.42, 0.34, 0.40, 0, 0.93, -0.62, 0, 0, 0, 0x15803d, 0.88);
    addColoredBox(bRubber, 0.44, 0.055, 0.42, 0, 1.11, -0.62, 0, 0, 0, 0x181a1e, 0.9);
    addColoredBox(bBody, 0.43, 0.045, 0.41, 0, 0.94, -0.62, 0, 0, 0, 0xe5e7eb, 0.95);

    // Slight natural 7.5 deg kickstand lean across all parts
    for (const bkt of [bBody, bGlass, bRubber, bAlloy, bHeadlight, bTaillight, bAmber]) {
      for (let i = 0; i < bkt.length; i++) {
        bkt[i].rotateZ(0.13);
      }
    }

    const proto = {
      parts: mergePartBuckets([
        { bucket: bBody, mat: getVehiclePaintedVertexMaterial() },
        { bucket: bGlass, mat: getCabinGlassMaterial() },
        { bucket: bRubber, mat: getRubberTireMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() },
        { bucket: bHeadlight, mat: getHeadlightEmissiveMaterial() },
        { bucket: bTaillight, mat: getTaillightEmissiveMaterial() },
        { bucket: bAmber, mat: getAmberAccentEmissiveMaterial() }
      ]),
      size: { x: 0.72, y: 1.18, z: 1.85 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Grounded Cast-Iron & Stained-Teak Jakarta Park Bench
  function getParkBenchProto() {
    const cacheKey = 'proc_prop_park_bench_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bMetal = [];
    const bWood = [];
    for (const fx of [-0.82, 0.82]) {
      addColoredBox(bMetal, 0.10, 0.03, 0.62, fx, 0.015, 0.02, 0, 0, 0, 0x1e2329, 0.85);
      addColoredBox(bMetal, 0.06, 0.42, 0.07, fx, 0.21, 0.24, 0, 0, 0, 0x242a32, 0.85);
      addColoredBox(bMetal, 0.06, 0.42, 0.07, fx, 0.21, -0.22, 0, 0, 0, 0x242a32, 0.85);
      addColoredBox(bMetal, 0.06, 0.06, 0.56, fx, 0.42, 0.01, 0, 0, 0, 0x242a32, 0.85);
      addColoredBox(bMetal, 0.055, 0.48, 0.065, fx, 0.66, -0.25, -0.14, 0, 0, 0x242a32, 0.88);
      addColoredBox(bMetal, 0.055, 0.20, 0.055, fx, 0.52, 0.22, 0, 0, 0, 0x242a32, 0.88);
      addColoredBox(bMetal, 0.065, 0.045, 0.46, fx, 0.62, 0.01, 0, 0, 0, 0x2b313a, 0.92);
    }
    addColoredBox(bMetal, 0.05, 0.39, 0.06, 0, 0.20, -0.02, 0, 0, 0, 0x242a32, 0.85);
    addColoredBox(bMetal, 1.64, 0.045, 0.045, 0, 0.36, -0.02, 0, 0, 0, 0x242a32, 0.85);

    for (let s = 0; s < 4; s++) {
      const sz = -0.17 + s * 0.125;
      addColoredBox(bWood, 1.84, 0.042, 0.095, 0, 0.455, sz, 0, 0, 0, 0x7a4b2a, 0.86);
    }
    for (let r = 0; r < 3; r++) {
      const ry = 0.58 + r * 0.125;
      const rz = -0.22 - r * 0.018;
      addColoredBox(bWood, 1.84, 0.088, 0.038, 0, ry, rz, -0.14, 0, 0, 0x7c4d2c, 0.88);
    }

    const proto = {
      parts: mergePartBuckets([
        { bucket: bMetal, mat: getAlloyMetalMaterial() },
        { bucket: bWood, mat: getWoodPbrMaterial() }
      ]),
      size: { x: 1.90, y: 0.90, z: 0.68 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Ultra-low-poly Sloped Concrete Jersey Road Barrier
  function getRoadBarrierProto() {
    const cacheKey = 'proc_prop_road_barrier_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bConcrete = [];
    const bPaint = [];
    addColoredBox(bConcrete, 1.62, 0.24, 0.64, 0, 0.12, 0, 0, 0, 0, 0x7d8084, 0.82);
    addColoredBox(bConcrete, 1.60, 0.40, 0.38, 0, 0.44, 0, 0, 0, 0, 0x8e9296, 0.86);
    addColoredBox(bConcrete, 1.58, 0.20, 0.24, 0, 0.74, 0, 0, 0, 0, 0x9aa0a6, 0.90);
    addColoredBox(bPaint, 0.50, 0.14, 0.26, -0.48, 0.72, 0, 0, 0, 0, 0xd99b18, 0.94);
    addColoredBox(bPaint, 0.50, 0.14, 0.26, 0.48, 0.72, 0, 0, 0, 0, 0x20242a, 0.92);

    const proto = {
      parts: mergePartBuckets([
        { bucket: bConcrete, mat: getConcretePbrMaterial() },
        { bucket: bPaint, mat: getVehiclePaintedVertexMaterial() }
      ]),
      size: { x: 1.62, y: 0.84, z: 0.64 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Jakarta PJU Street Lamp (Arm extends +X cleanly over roadway)
  function getStreetLampProto() {
    const cacheKey = 'proc_prop_street_lamp_v3';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bMetal = [];
    const bBulb = [];
    addColoredCylinder(bMetal, 0.17, 0.22, 0.58, 8, 0, 0.29, 0, 0, 0, 0, 0x262b31, 0.80);
    addColoredCylinder(bMetal, 0.065, 0.105, 4.05, 8, 0, 2.55, 0, 0, 0, 0, 0x23282e, 0.84);
    addColoredBox(bMetal, 1.15, 0.09, 0.09, 0.46, 4.66, 0, 0, 0, 0.14, 0x2c323a, 0.88);
    addColoredBox(bMetal, 0.52, 0.09, 0.28, 1.05, 4.74, 0, 0, 0, 0, 0x353c46, 0.90);
    const bulb = new THREE.BoxGeometry(0.40, 0.06, 0.22);
    bulb.translate(1.05, 4.68, 0);
    bBulb.push(prepGeo(bulb, false));

    const proto = {
      parts: mergePartBuckets([
        { bucket: bMetal, mat: getAlloyMetalMaterial() },
        { bucket: bBulb, mat: getLampBulbMaterial() }
      ]),
      size: { x: 1.35, y: 4.80, z: 0.45 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Fire Hydrant (painted red cast iron + brushed alloy nozzle caps)
  function getFireHydrantProto() {
    const cacheKey = 'proc_prop_fire_hydrant_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bPaint = [];
    const bAlloy = [];
    addColoredCylinder(bPaint, 0.17, 0.19, 0.10, 8, 0, 0.05, 0, 0, 0, 0, 0x451212, 0.80);
    addColoredCylinder(bPaint, 0.12, 0.13, 0.56, 8, 0, 0.38, 0, 0, 0, 0, 0xb91c1c, 0.84);
    addColoredCylinder(bPaint, 0.14, 0.11, 0.12, 8, 0, 0.70, 0, 0, 0, 0, 0xdc2626, 0.90);
    addColoredCylinder(bAlloy, 0.04, 0.05, 0.08, 6, 0, 0.79, 0, 0, 0, 0, 0xd4d4d8, 0.95);
    addColoredCylinder(bAlloy, 0.055, 0.055, 0.36, 6, 0, 0.52, 0, 0, 0, Math.PI * 0.5, 0xcbd5e1, 0.92);
    addColoredCylinder(bAlloy, 0.07, 0.07, 0.12, 6, 0, 0.50, 0.12, Math.PI * 0.5, 0, 0, 0xcbd5e1, 0.92);

    const proto = {
      parts: mergePartBuckets([
        { bucket: bPaint, mat: getVehiclePaintedVertexMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() }
      ]),
      size: { x: 0.38, y: 0.83, z: 0.38 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // PLN Concrete Utility Pole
  function getPowerPoleProto(variantIdx) {
    const cacheKey = `proc_prop_power_pole_v2_${variantIdx || 0}`;
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bConcrete = [];
    const bAlloy = [];
    addColoredCylinder(bConcrete, 0.11, 0.19, 6.80, 7, 0, 3.40, 0, 0, 0, 0, 0x8b8e92, 0.82);
    addColoredCylinder(bConcrete, 0.175, 0.178, 0.45, 7, 0, 1.35, 0, 0, 0, 0, 0xeab308, 0.9);
    addColoredBox(bAlloy, 1.85, 0.08, 0.09, 0, 6.25, 0, 0, 0, 0, 0x4b5563, 0.88);
    if ((variantIdx || 0) === 1) {
      addColoredBox(bAlloy, 1.55, 0.08, 0.09, 0, 5.55, 0, 0, 0, 0, 0x4b5563, 0.88);
      addColoredCylinder(bAlloy, 0.24, 0.24, 0.72, 8, 0.28, 4.75, 0, 0, 0, 0, 0x475569, 0.85);
    }
    for (const ix of [-0.78, 0, 0.78]) {
      addColoredCylinder(bAlloy, 0.04, 0.05, 0.14, 6, ix, 6.35, 0, 0, 0, 0, 0xd1d5db, 0.94);
    }

    const proto = {
      parts: mergePartBuckets([
        { bucket: bConcrete, mat: getConcretePbrMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() }
      ]),
      size: { x: 1.9, y: 6.8, z: 0.5 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Grounded PLN Power Feeder Pillar on concrete plinth
  function getPowerBoxProto() {
    const cacheKey = 'proc_prop_power_box_v3';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bConcrete = [];
    const bMetal = [];
    addColoredBox(bConcrete, 0.84, 0.34, 0.56, 0, 0.17, 0, 0, 0, 0, 0x6b7280, 0.80);
    addColoredBox(bMetal, 0.76, 1.08, 0.46, 0, 0.88, 0, 0, 0, 0, 0x475569, 0.84);
    addColoredBox(bMetal, 0.82, 0.08, 0.52, 0, 1.46, 0, 0, 0, 0, 0x334155, 0.90);
    addColoredBox(bMetal, 0.03, 0.96, 0.02, 0, 0.88, 0.24, 0, 0, 0, 0x1e293b, 0.90);
    addColoredBox(bMetal, 0.05, 0.14, 0.04, 0.08, 0.88, 0.24, 0, 0, 0, 0x1f2937, 0.92);
    addColoredBox(bMetal, 0.18, 0.18, 0.02, 0.20, 1.10, 0.24, 0, 0, 0, 0xeab308, 0.96);

    const proto = {
      parts: mergePartBuckets([
        { bucket: bConcrete, mat: getConcretePbrMaterial() },
        { bucket: bMetal, mat: getAlloyMetalMaterial() }
      ]),
      size: { x: 0.84, y: 1.50, z: 0.56 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Cast-Iron Manhole Cover
  function getManholeProto() {
    const cacheKey = 'proc_prop_manhole_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bAlloy = [];
    addColoredCylinder(bAlloy, 0.36, 0.38, 0.03, 10, 0, 0.015, 0, 0, 0, 0, 0x26292e, 0.85);
    addColoredCylinder(bAlloy, 0.30, 0.30, 0.036, 10, 0, 0.018, 0, 0, 0, 0, 0x373c44, 0.90);
    const proto = {
      parts: mergePartBuckets([{ bucket: bAlloy, mat: getAlloyMetalMaterial() }]),
      size: { x: 0.76, y: 0.04, z: 0.76 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Jakarta Municipal Street Trash Bin
  function getTrashCanProto() {
    const cacheKey = 'proc_prop_trash_can_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bBody = [];
    const bAlloy = [];
    addColoredCylinder(bBody, 0.25, 0.22, 0.76, 8, 0, 0.38, 0, 0, 0, 0, 0x1e5c3a, 0.82);
    addColoredCylinder(bAlloy, 0.27, 0.26, 0.08, 8, 0, 0.78, 0, 0, 0, 0, 0x23282e, 0.90);
    addColoredBox(bAlloy, 0.28, 0.16, 0.28, 0, 0.86, 0, 0, 0, 0, 0x2a3038, 0.88);
    const proto = {
      parts: mergePartBuckets([
        { bucket: bBody, mat: getVehiclePaintedVertexMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() }
      ]),
      size: { x: 0.54, y: 0.94, z: 0.54 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Tied Plastic Trash Bags
  function getTrashBagProto() {
    const cacheKey = 'proc_prop_trash_bag_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    addColoredCylinder(bTrim, 0.16, 0.24, 0.44, 7, -0.06, 0.22, 0.02, 0, 0, 0.12, 0x16191d, 0.82);
    addColoredCylinder(bTrim, 0.12, 0.19, 0.34, 7, 0.18, 0.17, -0.08, 0.14, 0, -0.18, 0x1c2026, 0.85);
    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 0.62, y: 0.46, z: 0.54 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Concrete Boulevard Planter Box
  function getPlanterBoxProto() {
    const cacheKey = 'proc_prop_planter_box_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bConcrete = [];
    const bSoil = [];
    addColoredBox(bConcrete, 1.32, 0.42, 0.62, 0, 0.21, 0, 0, 0, 0, 0x767a80, 0.82);
    addColoredBox(bConcrete, 1.38, 0.06, 0.68, 0, 0.43, 0, 0, 0, 0, 0x8f949a, 0.90);
    addColoredBox(bSoil, 1.18, 0.08, 0.48, 0, 0.41, 0, 0, 0, 0, 0x3b2a1e, 0.85);
    const proto = {
      parts: mergePartBuckets([
        { bucket: bConcrete, mat: getConcretePbrMaterial() },
        { bucket: bSoil, mat: getRubberTireMaterial() }
      ]),
      size: { x: 1.38, y: 0.46, z: 0.68 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Alpha-Masked Tropical Understory Shrub/Fern Cluster (~12 tris vs 156k-tri GLTF!)
  function getFoliageCardProto(width, height, seedOffset) {
    const w = width || 1.3;
    const h = height || 0.85;
    const cacheKey = `proc_foliage_card_${w.toFixed(2)}_${h.toFixed(2)}_${seedOffset || 0}`;
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const planes = [];
    const ang0 = (seedOffset || 0) * 0.7;
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(w, h);
      p.translate(0, h * 0.46, 0);
      p.rotateX(-0.18 + (k - 1) * 0.12);
      p.rotateY(ang0 + k * (Math.PI / 3));
      planes.push(prepGeo(p, false));
    }
    const merged = THREE_UTILS.mergeGeometries(planes, false);
    for (let i = 0; i < planes.length; i++) planes[i].dispose();

    const proto = {
      parts: [{ geo: merged, mat: getCachedAngsanaLeafMaterial() }],
      size: { x: w, y: h, z: w }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Shared Hinged Tactical Lootbox + Difficulty-Scaled Yellow Perimeter Halo Builder
  let _lootCrateBodyMat = null;
  let _lootCrateRimMat = null;
  let _lootCrateGoldMat = null;
  function getLootboxMats() {
    if (!_lootCrateBodyMat) {
      _lootCrateBodyMat = new THREE.MeshStandardMaterial({ color: 0x262f28, roughness: 0.62, metalness: 0.28 });
      _lootCrateRimMat = new THREE.MeshStandardMaterial({ color: 0x171b20, roughness: 0.42, metalness: 0.65 });
      _lootCrateGoldMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15, emissive: new THREE.Color(0xeab308), emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.45
      });
    }
    return { body: _lootCrateBodyMat, rim: _lootCrateRimMat, gold: _lootCrateGoldMat };
  }

  function createLootboxVisual(parentGroup, disposableGeos, disposableMats, id, x, y, z, ry, used) {
    const mats = getLootboxMats();
    const grp = new THREE.Group();
    grp.name = `${id}_Crate`;
    grp.position.set(x, y, z);
    if (ry) grp.rotation.y = ry;

    const addPart = (geo, mat, px, py, pz, rx, ryLoc, rz) => {
      disposableGeos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      if (rx) m.rotation.x = rx;
      if (ryLoc) m.rotation.y = ryLoc;
      if (rz) m.rotation.z = rz;
      m.castShadow = false;
      m.receiveShadow = true;
      grp.add(m);
      return m;
    };

    // Armored lower tub with structural ribs, corner bumpers, and side handles
    addPart(new THREE.BoxGeometry(0.92, 0.38, 0.60), mats.body, 0, 0.21, 0);
    // Corner protective bumpers (4 corners)
    for (const bx of [-0.45, 0.45]) {
      for (const bz of [-0.29, 0.29]) {
        addPart(new THREE.BoxGeometry(0.07, 0.42, 0.07), mats.rim, bx, 0.22, bz);
      }
    }
    // Side reinforced ribs + recessed steel carry handles
    for (const cx of [-0.46, 0.46]) {
      addPart(new THREE.BoxGeometry(0.05, 0.40, 0.56), mats.rim, cx, 0.22, 0);
      addPart(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), mats.gold, cx * 1.09, 0.24, 0, Math.PI * 0.5, 0, 0);
    }
    // Front & rear vertical stiffening ribs + upper lip collar
    for (const rxPos of [-0.26, 0, 0.26]) {
      addPart(new THREE.BoxGeometry(0.035, 0.34, 0.63), mats.rim, rxPos, 0.21, 0);
    }
    addPart(new THREE.BoxGeometry(0.96, 0.05, 0.64), mats.rim, 0, 0.415, 0);
    // Heavy dual tactical draw-latches + yellow hazard plate on front face
    for (const lx of [-0.26, 0.26]) {
      addPart(new THREE.BoxGeometry(0.075, 0.14, 0.045), mats.gold, lx, 0.35, 0.315);
      addPart(new THREE.BoxGeometry(0.04, 0.06, 0.055), mats.rim, lx, 0.29, 0.32);
    }
    addPart(new THREE.BoxGeometry(0.28, 0.05, 0.02), mats.gold, 0, 0.24, 0.308);

    // Recessed foam supply tray + detailed 3D interior items (revealed when lid opens!)
    addPart(new THREE.BoxGeometry(0.84, 0.04, 0.52), mats.rim, 0, 0.41, 0);
    if (!mats._interiorRed) {
      mats._interiorRed = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.42, metalness: 0.15 });
      mats._interiorWhite = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45, metalness: 0.1 });
      mats._interiorBrass = new THREE.MeshStandardMaterial({ color: 0xd9a738, roughness: 0.28, metalness: 0.85 });
      mats._interiorGun = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.38, metalness: 0.72 });
      disposableMats.push(mats._interiorRed, mats._interiorWhite, mats._interiorBrass, mats._interiorGun);
    }
    // Two angled 5.56 STANAG magazines inside left bay
    addPart(new THREE.BoxGeometry(0.07, 0.045, 0.20), mats._interiorGun, -0.28, 0.445, -0.04, 0, 0.18, 0);
    addPart(new THREE.BoxGeometry(0.07, 0.045, 0.20), mats._interiorGun, -0.17, 0.445, 0.02, 0, 0.18, 0);
    // Row of four 12G red shells with brass heads in center bay
    for (let si = 0; si < 4; si++) {
      const sz = -0.11 + si * 0.07;
      addPart(new THREE.CylinderGeometry(0.018, 0.018, 0.11, 8), mats._interiorRed, 0.02, 0.445, sz, 0, 0, Math.PI * 0.5);
      addPart(new THREE.CylinderGeometry(0.019, 0.019, 0.025, 8), mats._interiorBrass, 0.075, 0.445, sz, 0, 0, Math.PI * 0.5);
    }
    // White & red-cross emergency trauma pouch in right bay
    addPart(new THREE.BoxGeometry(0.20, 0.055, 0.26), mats._interiorWhite, 0.26, 0.445, 0.0);
    addPart(new THREE.BoxGeometry(0.09, 0.012, 0.028), mats._interiorRed, 0.26, 0.476, 0.0);
    addPart(new THREE.BoxGeometry(0.028, 0.012, 0.09), mats._interiorRed, 0.26, 0.476, 0.0);

    // Hinged Lid Pivot anchored along back top edge (z = -0.31, y = 0.44)
    const lidPivot = new THREE.Group();
    lidPivot.name = `${id}_LidPivot`;
    lidPivot.position.set(0, 0.44, -0.31);
    lidPivot.rotation.x = used ? -1.72 : 0;

    const addLidPart = (geo, mat, px, py, pz) => {
      disposableGeos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = false;
      m.receiveShadow = true;
      lidPivot.add(m);
      return m;
    };
    addLidPart(new THREE.BoxGeometry(0.96, 0.10, 0.64), mats.rim, 0, 0.05, 0.31);
    addLidPart(new THREE.BoxGeometry(0.84, 0.05, 0.52), mats.body, 0, 0.115, 0.31);
    // Molded lid ribs + front hazard trim + top carry handle
    for (const lx of [-0.28, 0, 0.28]) {
      addLidPart(new THREE.BoxGeometry(0.05, 0.03, 0.50), mats.rim, lx, 0.145, 0.31);
    }
    addLidPart(new THREE.BoxGeometry(0.68, 0.025, 0.065), mats.gold, 0, 0.145, 0.52);
    addLidPart(new THREE.BoxGeometry(0.22, 0.028, 0.035), mats.gold, 0, 0.155, 0.31);
    grp.add(lidPivot);

    // Yellow-only perimeter halo around the crate model (ZERO floating orb/cone!)
    const haloGroup = new THREE.Group();
    haloGroup.name = `${id}_YellowHalo`;
    haloGroup.visible = !used;

    const ringGeo = new THREE.RingGeometry(0.56, 0.72, 24);
    ringGeo.rotateX(-Math.PI * 0.5);
    const haloShellGeo = new THREE.BoxGeometry(1.06, 0.66, 0.74);
    disposableGeos.push(ringGeo, haloShellGeo);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0xeab308,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide
    });
    disposableMats.push(ringMat, shellMat);

    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.03;
    const shellMesh = new THREE.Mesh(haloShellGeo, shellMat);
    shellMesh.position.y = 0.30;
    haloGroup.add(ringMesh);
    haloGroup.add(shellMesh);
    grp.add(haloGroup);

    if (parentGroup) parentGroup.add(grp);
    return { id, group: grp, lidPivot, haloGroup, ringMat, shellMat, ringMesh, x, y, z, used: !!used };
  }

  function updateLootboxVisuals(visuals, dt, timeAccum, camPos, camForward, difficultyKey, worldOffsetZ) {
    if (!visuals || visuals.length === 0) return;
    const diff = String(difficultyKey || 'medium').toLowerCase();
    const offZ = worldOffsetZ || 0;
    const pulse = 0.76 + 0.24 * Math.sin((timeAccum || 0) * 3.8);

    for (let i = 0; i < visuals.length; i++) {
      const v = visuals[i];
      if (!v) continue;
      // Smoothly animate hinged lid opening
      const targetRot = v.used ? -1.72 : 0.0;
      if (v.lidPivot && Math.abs(v.lidPivot.rotation.x - targetRot) > 0.005) {
        const step = Math.min(1, (dt || 0.016) * 9.5);
        v.lidPivot.rotation.x += (targetRot - v.lidPivot.rotation.x) * step;
      }
      if (!v.haloGroup) continue;
      if (v.used) {
        v.haloGroup.visible = false;
        continue;
      }

      let showHalo = true;
      if (camPos && diff !== 'easy') {
        const dx = v.x - camPos.x;
        const dy = (v.y + 0.35) - camPos.y;
        const dz = (v.z + offZ) - camPos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (diff === 'medium') {
          showHalo = dist <= 12.0;
        } else if (diff === 'hard') {
          showHalo = dist <= 3.6;
        } else if (diff === 'nightmare') {
          if (dist > 1.75) {
            showHalo = false;
          } else if (camForward && dist > 0.05) {
            const dot = (dx * camForward.x + dy * camForward.y + dz * camForward.z) / dist;
            showHalo = dot >= 0.62;
          }
        }
      }
      v.haloGroup.visible = showHalo;
      if (showHalo) {
        if (v.ringMat) v.ringMat.opacity = 0.62 * pulse;
        if (v.shellMat) v.shellMat.opacity = 0.22 * pulse;
        if (v.ringMesh) {
          const s = 0.97 + 0.05 * pulse;
          v.ringMesh.scale.set(s, 1, s);
        }
      }
    }
  }

  // Jakarta Gerobak Kaki Lima (street food pushcart with illuminated warm glass display case)
  function getGerobakProto() {
    const cacheKey = 'proc_prop_gerobak_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bBody = [];
    const bWood = [];
    const bRubber = [];
    const bAlloy = [];
    const bWarmGlass = [];
    const bAmber = [];

    // Two spoked rubber wheels + steel hubs & axle + front teak rest leg
    addColoredCylinder(bRubber, 0.32, 0.32, 0.07, 10, -0.46, 0.32, 0.0, 0, 0, Math.PI * 0.5, 0x16181c, 0.8);
    addColoredCylinder(bRubber, 0.32, 0.32, 0.07, 10, 0.46, 0.32, 0.0, 0, 0, Math.PI * 0.5, 0x16181c, 0.8);
    addColoredCylinder(bAlloy, 0.22, 0.22, 0.05, 8, -0.46, 0.32, 0.0, 0, 0, Math.PI * 0.5, 0x9ca3af, 0.88);
    addColoredCylinder(bAlloy, 0.22, 0.22, 0.05, 8, 0.46, 0.32, 0.0, 0, 0, Math.PI * 0.5, 0x9ca3af, 0.88);
    addColoredCylinder(bAlloy, 0.03, 0.03, 0.94, 6, 0, 0.32, 0.0, 0, 0, Math.PI * 0.5, 0x64748b, 0.9);
    addColoredBox(bWood, 0.08, 0.36, 0.08, 0, 0.18, 0.62, 0, 0, 0, 0x5c3d28, 0.78);

    // Lower royal-blue painted cabinet + stained teak countertop & push handle
    addColoredBox(bBody, 0.82, 0.68, 1.56, 0, 0.70, 0, 0, 0, 0, 0x1d68a8, 0.82);
    addColoredBox(bWood, 0.84, 0.08, 1.60, 0, 1.06, 0, 0, 0, 0, 0x7c5132, 0.86);
    addColoredBox(bWood, 0.06, 0.06, 0.42, -0.34, 0.98, -0.92, 0, 0, 0, 0x7c5132, 0.85);
    addColoredBox(bWood, 0.06, 0.06, 0.42, 0.34, 0.98, -0.92, 0, 0, 0, 0x7c5132, 0.85);
    addColoredBox(bWood, 0.74, 0.06, 0.06, 0, 0.98, -1.10, 0, 0, 0, 0x7c5132, 0.85);

    // Teak display corner posts + interior shelf + warm glowing food case + stainless panci pot
    addColoredBox(bWood, 0.06, 0.62, 0.06, -0.34, 1.38, -0.52, 0, 0, 0, 0x6b442a, 0.85);
    addColoredBox(bWood, 0.06, 0.62, 0.06, 0.34, 1.38, -0.52, 0, 0, 0, 0x6b442a, 0.85);
    addColoredBox(bWood, 0.06, 0.62, 0.06, -0.34, 1.38, 0.68, 0, 0, 0, 0x6b442a, 0.85);
    addColoredBox(bWood, 0.06, 0.62, 0.06, 0.34, 1.38, 0.68, 0, 0, 0, 0x6b442a, 0.85);
    addColoredBox(bWood, 0.62, 0.04, 1.12, 0, 1.34, 0.08, 0, 0, 0, 0x8b5a36, 0.90);
    addColoredCylinder(bAlloy, 0.16, 0.14, 0.22, 10, 0, 1.21, -0.22, 0, 0, 0, 0xd1d5db, 0.92);
    addBox(bAmber, 0.42, 0.04, 0.92, 0, 1.62, 0.08);
    addBox(bWarmGlass, 0.70, 0.56, 1.24, 0, 1.38, 0.08);

    // Painted pitched awning roof
    addColoredBox(bBody, 1.12, 0.08, 1.76, 0, 1.78, 0, 0, 0, 0.08, 0xc85828, 0.88);

    const proto = {
      parts: mergePartBuckets([
        { bucket: bBody, mat: getVehiclePaintedVertexMaterial() },
        { bucket: bWood, mat: getWoodPbrMaterial() },
        { bucket: bRubber, mat: getRubberTireMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() },
        { bucket: bWarmGlass, mat: getWarmDisplayGlassMaterial() },
        { bucket: bAmber, mat: getAmberAccentEmissiveMaterial() }
      ]),
      size: { x: 1.12, y: 1.90, z: 1.92 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Cantilever Traffic Signal Pole (amber lens blink via shader; paired with 1 pooled amber PointLight)
  function getTrafficSignalProto() {
    const cacheKey = 'proc_prop_traffic_signal_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bMetal = [];
    const bHood = [];
    const bAmberLens = [];

    addColoredCylinder(bMetal, 0.10, 0.14, 4.9, 8, 0, 2.45, 0, 0, 0, 0, 0x3b424a, 0.78);
    addColoredBox(bMetal, 0.42, 0.16, 0.42, 0, 0.08, 0, 0, 0, 0, 0x262a30, 0.82);
    addColoredCylinder(bMetal, 0.07, 0.09, 3.1, 8, 1.50, 4.68, 0, 0, 0, Math.PI * 0.5, 0x3b424a, 0.85);
    addColoredBox(bHood, 0.38, 1.04, 0.34, 2.45, 4.10, 0, 0, 0, 0, 0x1a1d22, 0.85);
    for (const lz of [-0.18, 0.18]) {
      addColoredCylinder(bHood, 0.11, 0.11, 0.06, 8, 2.45, 4.40, lz, Math.PI * 0.5, 0, 0, 0x451212, 0.9);
      addColoredCylinder(bHood, 0.11, 0.11, 0.06, 8, 2.45, 3.80, lz, Math.PI * 0.5, 0, 0, 0x103820, 0.9);
      const lens = new THREE.CylinderGeometry(0.115, 0.115, 0.07, 8);
      transformGeo(lens, 2.45, 4.10, lz, Math.PI * 0.5, 0, 0);
      bAmberLens.push(prepGeo(lens, false));
    }

    const proto = {
      parts: mergePartBuckets([
        { bucket: bMetal, mat: getAlloyMetalMaterial() },
        { bucket: bHood, mat: getRubberTireMaterial() },
        { bucket: bAmberLens, mat: getTrafficAmberMaterial() }
      ]),
      size: { x: 3.1, y: 4.9, z: 0.45 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  function emitInstancedProto(city, proto, placements, castShadow, receiveShadow, namePrefix, customGroup) {
    if (!proto || !placements || placements.length === 0) return;
    // Stop splitting props with < 16 placements into 4 quadrant InstancedMeshes (cuts ~120+ tiny draw calls)
    if (!customGroup && city.quadrants && placements.length >= 16) {
      const qPlacements = { NW: [], NE: [], SW: [], SE: [] };
      for (let i = 0; i < placements.length; i++) {
        const pl = placements[i];
        const q = (pl.x < 0) ? (pl.z < 0 ? 'NW' : 'SW') : (pl.z < 0 ? 'NE' : 'SE');
        qPlacements[q].push(pl);
      }
      for (const q of ['NW', 'NE', 'SW', 'SE']) {
        if (qPlacements[q].length > 0) {
          emitInstancedProto(city, proto, qPlacements[q], castShadow, receiveShadow, `${namePrefix}_${q}`, city.quadrants[q]);
        }
      }
      return;
    }

    const hasPerInstanceColor = placements[0] && placements[0].color !== undefined;

    for (let p = 0; p < proto.parts.length; p++) {
      const part = proto.parts[p];
      const inst = new THREE.InstancedMesh(part.geo, part.mat, placements.length);
      inst.castShadow = !!castShadow;
      inst.receiveShadow = !!receiveShadow;
      inst.name = (namePrefix || 'CityProp') + '_' + p;
      for (let i = 0; i < placements.length; i++) {
        const pl = placements[i];
        _tmpDummy.position.set(pl.x, pl.y, pl.z);
        _tmpDummy.rotation.set(pl.rx || 0, pl.ry || 0, pl.rz || 0);
        _tmpDummy.scale.set(pl.sx !== undefined ? pl.sx : 1, pl.sy !== undefined ? pl.sy : 1, pl.sz !== undefined ? pl.sz : 1);
        _tmpDummy.updateMatrix();
        inst.setMatrixAt(i, _tmpDummy.matrix);
        // Only apply per-instance tint on non-vertex-colored paint parts
        if (hasPerInstanceColor && p === 0 && !part.mat.vertexColors) {
          _tmpColor.setHex(pl.color);
          inst.setColorAt(i, _tmpColor);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      if (typeof inst.computeBoundingBox === 'function') inst.computeBoundingBox();
      if (typeof inst.computeBoundingSphere === 'function') inst.computeBoundingSphere();

      const localBox = inst.boundingBox ? inst.boundingBox.clone() : new THREE.Box3();
      inst.userData._localBox = localBox;
      inst.userData._worldBox = localBox.clone();

      const targetGroup = customGroup || city.rootGroup;
      targetGroup.add(inst);

      const isClutter = /^(ManholeCover|TrashBag|TrashCan|Fern|Calathea|PowerBox|Shrub|Pachira|PlanterBox|AirconUnit|FireEscape|RoadBarrier|FireHydrant|MonoblocChair|OutdoorTableSet|Chalkboard|PlasticCrate|MilitaryCrate|Jerrycan|FuelBarrel|OldTyre|CardboardBox|BermudaGrass|HandTruck)/.test(namePrefix);
      if (isClutter) {
        city.clutterMeshes.push(inst);
        const qMatch = namePrefix.match(/_(NW|NE|SW|SE)/);
        const qKey = qMatch ? qMatch[1] : null;
        if (qKey && city.clutterByQuadrant && city.clutterByQuadrant[qKey]) {
          city.clutterByQuadrant[qKey].push(inst);
        }
      }
    }
  }

  function emitInstancedLodProto(city, protos3, placements, castShadow, receiveShadow, namePrefix, customGroup, isStructural) {
    if (!protos3 || !protos3[0] || !placements || placements.length === 0) return;
    const hasPerInstanceColor = placements[0] && placements[0].color !== undefined;
    const qMatch = (namePrefix || '').match(/_(NW|NE|SW|SE)/);
    const qKey = qMatch ? qMatch[1] : null;

    // Precompute placement matrices & shared world bounding box once
    const matArr = new Array(placements.length);
    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i];
      _tmpDummy.position.set(pl.x, pl.y, pl.z);
      _tmpDummy.rotation.set(pl.rx || 0, pl.ry || 0, pl.rz || 0);
      _tmpDummy.scale.set(pl.sx !== undefined ? pl.sx : 1, pl.sy !== undefined ? pl.sy : 1, pl.sz !== undefined ? pl.sz : 1);
      _tmpDummy.updateMatrix();
      matArr[i] = _tmpDummy.matrix.clone();
    }

    let sharedBox = null;
    for (let t = 0; t < 3; t++) {
      const pr = protos3[t];
      if (!pr) continue;
      for (let p = 0; p < pr.parts.length; p++) {
        const part = pr.parts[p];
        const inst = new THREE.InstancedMesh(part.geo, part.mat, placements.length);
        inst.castShadow = t === 0 ? !!castShadow : false;
        inst.receiveShadow = !!receiveShadow;
        inst.name = `${namePrefix || 'CityLodProp'}_LOD${t}_${p}`;
        for (let i = 0; i < placements.length; i++) {
          inst.setMatrixAt(i, matArr[i]);
          if (hasPerInstanceColor && p === 0 && !part.mat.vertexColors) {
            _tmpColor.setHex(placements[i].color);
            inst.setColorAt(i, _tmpColor);
          }
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        if (!sharedBox) {
          if (typeof inst.computeBoundingBox === 'function') inst.computeBoundingBox();
          sharedBox = inst.boundingBox ? inst.boundingBox.clone() : new THREE.Box3();
        } else {
          inst.boundingBox = sharedBox.clone();
        }
        if (typeof inst.computeBoundingSphere === 'function') inst.computeBoundingSphere();

        inst.userData._localBox = sharedBox.clone();
        inst.userData._worldBox = sharedBox.clone();
        inst.userData._lodTier = t;
        inst.userData._lod1Dist = 22;
        inst.userData._lod2Dist = 46;
        inst.userData._alwaysStructural = !!isStructural;
        inst.visible = (t === 0);

        const targetGroup = customGroup || city.rootGroup;
        targetGroup.add(inst);
        city.clutterMeshes.push(inst);
        if (qKey && city.clutterByQuadrant && city.clutterByQuadrant[qKey]) {
          city.clutterByQuadrant[qKey].push(inst);
        }
      }
    }
  }

  function placeSingleProto(city, proto, x, y, z, ry, scale, parentGroup, castShadow) {
    if (!proto) return null;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (ry) g.rotation.y = ry;
    if (scale && scale !== 1) g.scale.setScalar(scale);
    for (let p = 0; p < proto.parts.length; p++) {
      const m = new THREE.Mesh(proto.parts[p].geo, proto.parts[p].mat);
      m.castShadow = castShadow !== undefined ? !!castShadow : false;
      m.receiveShadow = true;
      g.add(m);
    }
    const target = parentGroup || city.rootGroup;
    target.add(g);
    return g;
  }

  function buildSkylineSilhouetteRing(city, cMinX, cMaxX, root) {
    // Distant Jakarta CBD Skyline Silhouette Ring split into 4 directional cullChunks (N/S/E/W)
    // 1 shared low-poly material, no colliders, no shadows, leaving [cMinX - 9 .. cMaxX + 9] rail corridor clear
    const matSkyline = city._getMat('citySkylineDistant', null, {
      color: 0x141f2b,
      roughness: 0.95,
      metalness: 0.05
    });
    const buckets = { N: [], S: [], E: [], W: [] };
    const skylineRng = fallbackRng(7719);
    const ringSteps = 48;
    for (let i = 0; i < ringSteps; i++) {
      const angle = (i / ringSteps) * Math.PI * 2 + (skylineRng() - 0.5) * 0.08;
      const radius = 145.0 + skylineRng() * 70.0;
      const tx = Math.cos(angle) * radius;
      const tz = Math.sin(angle) * radius;

      if (Math.abs(tz) > 95.0 && tx >= (cMinX - 9.0) && tx <= (cMaxX + 9.0)) {
        continue;
      }

      const dirKey = Math.abs(tz) >= Math.abs(tx)
        ? (tz >= 0 ? 'N' : 'S')
        : (tx >= 0 ? 'E' : 'W');
      const bSkyline = buckets[dirKey];

      const tw = 20.0 + skylineRng() * 26.0;
      const td = 20.0 + skylineRng() * 26.0;
      const th = 48.0 + skylineRng() * 85.0;
      addBox(bSkyline, tw, th, td, tx, STREET_GROUND_Y + th * 0.5, tz);

      if (th > 75.0) {
        const sw = tw * 0.62;
        const sd = td * 0.62;
        const sh = 18.0 + skylineRng() * 32.0;
        addBox(bSkyline, sw, sh, sd, tx, STREET_GROUND_Y + th + sh * 0.5, tz);
        if (sh > 28.0) {
          const spireH = 12.0 + skylineRng() * 15.0;
          addBox(bSkyline, 2.5, spireH, 2.5, tx, STREET_GROUND_Y + th + sh + spireH * 0.5, tz);
        }
      }
    }

    for (const dirKey of ['N', 'S', 'E', 'W']) {
      const bSkyline = buckets[dirKey];
      if (bSkyline.length === 0) continue;
      const geoSkyline = THREE_UTILS.mergeGeometries(bSkyline, false);
      for (let i = 0; i < bSkyline.length; i++) bSkyline[i].dispose();
      if (!geoSkyline) continue;
      if (!geoSkyline.boundingBox) geoSkyline.computeBoundingBox();
      city.disposableGeometries.push(geoSkyline);
      const meshSkyline = new THREE.Mesh(geoSkyline, matSkyline);
      meshSkyline.castShadow = false;
      meshSkyline.receiveShadow = false;
      meshSkyline.name = 'Skyline_' + dirKey;
      root.add(meshSkyline);

      const localBox = geoSkyline.boundingBox.clone();
      city.cullChunks.push({
        name: 'Skyline_' + dirKey,
        sector: 'Skyline',
        mesh: meshSkyline,
        box: localBox.clone(),
        localBox,
        maxDist: 220,
        isFar: true,
        isSkyline: true
      });
    }
  }

  // Indonesian PMI Emergency Ambulance Prototype (PBR paint, glossy cab glass, alloy rims, red cross & lightbar)
  function getAmbulanceProto() {
    const cacheKey = 'proc_veh_ambulance_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bBody = [];
    const bGlass = [];
    const bRubber = [];
    const bAlloy = [];
    const bHeadlight = [];
    const bTaillight = [];

    const w = 2.06;
    const len = 5.26;
    const wheelR = 0.36;

    addWheelPair(bRubber, bAlloy, wheelR, 0.24, wheelR, 1.56, w * 0.45);
    addWheelPair(bRubber, bAlloy, wheelR, 0.24, wheelR, -1.48, w * 0.45);
    // Chassis + bumpers + license plates
    addColoredBox(bRubber, w * 0.90, 0.18, len * 0.94, 0, wheelR * 0.80, 0, 0, 0, 0, 0x16181c, 0.8);
    addColoredBox(bRubber, w * 1.01, 0.26, 0.24, 0, wheelR + 0.10, len * 0.48, 0, 0, 0, 0x1e2228, 0.78);
    addColoredBox(bRubber, w * 1.01, 0.26, 0.22, 0, wheelR + 0.10, -len * 0.49, 0, 0, 0, 0x1e2228, 0.78);
    addLicensePlate(bRubber, bAlloy, 0, wheelR + 0.11, len * 0.505, false);
    addLicensePlate(bRubber, bAlloy, 0, wheelR + 0.14, -len * 0.51, false);

    // Front cab + hood + high-roof rear medical box
    addColoredBox(bBody, w * 0.94, 0.72, 1.72, 0, wheelR + 0.42, 1.62, 0, 0, 0, 0xf1f5f9, 0.86);
    addColoredBox(bBody, w * 0.88, 0.68, 1.12, 0, wheelR + 1.06, 1.32, 0, 0, 0, 0xf1f5f9, 0.90);
    addColoredBox(bBody, w, 1.64, 3.36, 0, wheelR + 0.94, -0.84, 0, 0, 0, 0xf8fafc, 0.88);
    // Bold PMI red perimeter stripe & rear emergency chevron trim
    addColoredBox(bBody, w + 0.025, 0.22, 3.38, 0, wheelR + 0.72, -0.84, 0, 0, 0, 0xdc2626, 0.90);
    addColoredBox(bBody, w * 0.96, 0.18, 1.74, 0, wheelR + 0.64, 1.62, 0, 0, 0, 0xdc2626, 0.90);
    // Red cross emblems on left, right, rear & hood
    for (const sx of [-1, 1]) {
      const cx = sx * (w * 0.5 + 0.015);
      addColoredBox(bBody, 0.03, 0.46, 0.16, cx, wheelR + 1.24, -0.85, 0, 0, 0, 0xdc2626, 0.95);
      addColoredBox(bBody, 0.03, 0.16, 0.46, cx, wheelR + 1.24, -0.85, 0, 0, 0, 0xdc2626, 0.95);
      addColoredBox(bAlloy, 0.12, 0.14, 0.08, sx * (w * 0.5 + 0.08), wheelR + 0.98, 1.76, 0, 0, 0, 0x94a3b8, 0.9);
    }
    addColoredBox(bBody, 0.42, 0.03, 0.14, 0, wheelR + 0.80, 2.04, -0.14, 0, 0, 0xdc2626, 0.95);
    addColoredBox(bBody, 0.14, 0.03, 0.42, 0, wheelR + 0.80, 2.04, -0.14, 0, 0, 0xdc2626, 0.95);
    addColoredBox(bBody, 0.42, 0.14, 0.03, 0, wheelR + 1.26, -len * 0.485, 0, 0, 0, 0xdc2626, 0.95);
    addColoredBox(bBody, 0.14, 0.42, 0.03, 0, wheelR + 1.26, -len * 0.485, 0, 0, 0, 0xdc2626, 0.95);

    // Glossy dark windshield, cab side windows & rear medical bay windows
    addBox(bGlass, w * 0.82, 0.52, 0.10, 0, wheelR + 1.08, 1.88, -0.24);
    addBox(bGlass, w * 0.90, 0.46, 0.92, 0, wheelR + 1.06, 1.32);
    addBox(bGlass, 0.62, 0.44, 0.08, -0.44, wheelR + 1.30, -2.51);
    addBox(bGlass, 0.62, 0.44, 0.08, 0.44, wheelR + 1.30, -2.51);
    // Chrome grille, rear door seam & rooftop emergency lightbar
    addColoredBox(bAlloy, w * 0.48, 0.24, 0.05, 0, wheelR + 0.44, len * 0.48, 0, 0, 0, 0xb8c0cc, 0.9);
    addColoredBox(bAlloy, 0.03, 1.46, 0.03, 0, wheelR + 0.92, -len * 0.485, 0, 0, 0, 0x64748b, 0.9);
    addColoredBox(bAlloy, 1.22, 0.06, 0.26, 0, wheelR + 1.80, 0.72, 0, 0, 0, 0x475569, 0.9);
    addBox(bTaillight, 0.42, 0.12, 0.22, -0.36, wheelR + 1.86, 0.72);
    addBox(bTaillight, 0.42, 0.12, 0.22, 0.36, wheelR + 1.86, 0.72);
    addBox(bHeadlight, 0.28, 0.12, 0.22, 0, wheelR + 1.86, 0.72);
    // Headlights & taillights
    addBox(bHeadlight, 0.32, 0.16, 0.08, -w * 0.36, wheelR + 0.46, len * 0.485);
    addBox(bHeadlight, 0.32, 0.16, 0.08, w * 0.36, wheelR + 0.46, len * 0.485);
    addBox(bTaillight, 0.18, 0.40, 0.08, -w * 0.44, wheelR + 0.54, -len * 0.485);
    addBox(bTaillight, 0.18, 0.40, 0.08, w * 0.44, wheelR + 0.54, -len * 0.485);

    const proto = {
      parts: mergePartBuckets([
        { bucket: bBody, mat: getVehiclePaintedVertexMaterial() },
        { bucket: bGlass, mat: getCabinGlassMaterial() },
        { bucket: bRubber, mat: getRubberTireMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() },
        { bucket: bHeadlight, mat: getHeadlightEmissiveMaterial() },
        { bucket: bTaillight, mat: getTaillightEmissiveMaterial() }
      ]),
      size: { x: w, y: 2.32, z: len }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // TNI Tactical 6x6 Military Utility Truck Prototype
  function getMilitaryTruckProto() {
    const cacheKey = 'proc_veh_mil_truck_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bBody = [];
    const bCanvas = [];
    const bGlass = [];
    const bRubber = [];
    const bAlloy = [];
    const bHeadlight = [];
    const bTaillight = [];
    const bAmber = [];

    const w = 2.30;
    const len = 6.10;
    const wheelR = 0.48;

    addWheelPair(bRubber, bAlloy, wheelR, 0.32, wheelR, 1.95, w * 0.45);
    addWheelPair(bRubber, bAlloy, wheelR, 0.32, wheelR, -1.10, w * 0.45);
    addWheelPair(bRubber, bAlloy, wheelR, 0.32, wheelR, -2.25, w * 0.45);

    // Heavy steel frame rails + front bullbar bumper + side fuel tanks
    addColoredBox(bRubber, w * 0.62, 0.24, len * 0.94, 0, wheelR * 0.92, 0, 0, 0, 0, 0x16181c, 0.8);
    addColoredBox(bAlloy, w * 1.02, 0.32, 0.28, 0, wheelR + 0.16, len * 0.49, 0, 0, 0, 0x2a3028, 0.82);
    addColoredBox(bAlloy, w * 0.88, 0.28, 0.08, 0, wheelR + 0.42, len * 0.51, 0, 0, 0, 0x1f241d, 0.85);
    addColoredBox(bBody, 0.34, 0.36, 0.96, -w * 0.38, wheelR + 0.18, 0.35, 0, 0, 0, 0x3b482e, 0.8);
    addColoredBox(bBody, 0.34, 0.36, 0.96, w * 0.38, wheelR + 0.18, 0.35, 0, 0, 0, 0x3b482e, 0.8);

    // Olive-drab armored hood, cab & lower cargo bed
    addColoredBox(bBody, w * 0.90, 0.88, 1.15, 0, wheelR + 0.72, 2.25, 0, 0, 0, 0x3f4c31, 0.85);
    addColoredBox(bBody, w * 0.94, 1.46, 1.38, 0, wheelR + 1.06, 1.08, 0, 0, 0, 0x3d4a2f, 0.88);
    addColoredBox(bBody, w, 0.78, 3.55, 0, wheelR + 0.76, -1.25, 0, 0, 0, 0x3a462d, 0.84);
    // Matte khaki canvas troop canopy over cargo bed + rear opening flap
    addColoredBox(bCanvas, w * 0.96, 1.24, 3.45, 0, wheelR + 1.72, -1.25, 0, 0, 0, 0x5c6344, 0.88);
    addColoredBox(bRubber, w * 0.74, 0.98, 0.12, 0, wheelR + 1.62, -2.96, 0, 0, 0, 0x181a18, 0.82);

    // Split armored windshield & cab side glass + mirrors + roof beacon
    addBox(bGlass, w * 0.80, 0.44, 0.10, 0, wheelR + 1.48, 1.78, -0.10);
    addBox(bGlass, w * 0.96, 0.42, 0.96, 0, wheelR + 1.48, 1.08);
    for (const sx of [-1, 1]) {
      addColoredBox(bAlloy, 0.16, 0.22, 0.08, sx * (w * 0.5 + 0.10), wheelR + 1.44, 1.68, 0, 0, 0, 0x2f352e, 0.9);
    }
    addBox(bAmber, 0.20, 0.16, 0.20, 0, wheelR + 1.88, 1.38);
    addBox(bHeadlight, 0.24, 0.18, 0.08, -w * 0.34, wheelR + 0.74, 2.84);
    addBox(bHeadlight, 0.24, 0.18, 0.08, w * 0.34, wheelR + 0.74, 2.84);
    addBox(bTaillight, 0.26, 0.14, 0.08, -w * 0.38, wheelR + 0.44, -len * 0.498);
    addBox(bTaillight, 0.26, 0.14, 0.08, w * 0.38, wheelR + 0.44, -len * 0.498);

    const proto = {
      parts: mergePartBuckets([
        { bucket: bBody, mat: getVehiclePaintedVertexMaterial() },
        { bucket: bCanvas, mat: getConcretePbrMaterial() },
        { bucket: bGlass, mat: getCabinGlassMaterial() },
        { bucket: bRubber, mat: getRubberTireMaterial() },
        { bucket: bAlloy, mat: getAlloyMetalMaterial() },
        { bucket: bHeadlight, mat: getHeadlightEmissiveMaterial() },
        { bucket: bTaillight, mat: getTaillightEmissiveMaterial() },
        { bucket: bAmber, mat: getAmberAccentEmissiveMaterial() }
      ]),
      size: { x: w, y: 2.82, z: len }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Crisp PBR Wooden Cargo Pallet Prototype
  function getPalletProto() {
    const cacheKey = 'proc_prop_pallet_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bWood = [];
    for (const rx of [-0.52, 0.0, 0.52]) {
      addColoredBox(bWood, 0.11, 0.09, 1.02, rx, 0.045, 0, 0, 0, 0, 0x6f4a2b, 0.78);
    }
    for (let s = 0; s < 5; s++) {
      const sz = -0.44 + s * 0.22;
      addColoredBox(bWood, 1.24, 0.032, 0.14, 0, 0.106, sz, 0, 0, 0, 0x8b5e36, 0.88);
    }
    const proto = {
      parts: mergePartBuckets([{ bucket: bWood, mat: getWoodPbrMaterial() }]),
      size: { x: 1.24, y: 0.122, z: 1.02 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  I.city = Object.assign(I.city || {}, {
    STREET_GROUND_Y,
    SIDEWALK_Y,
    RAIL_TOP_Y,
    CROSSING_Z_SOUTH,
    CROSSING_Z_NORTH,
    CROSSING_HALF_W,
    _tmpDummy,
    _tmpBox,
    _tmpVec,
    _tmpMat4,
    _tmpColor,
    fallbackRng,
    prepGeo,
    applyMetricUVs,
    transformGeo,
    addBox,
    addCylinder,
    addColoredBox,
    addColoredCylinder,
    extrudeShapeXZ,
    makeRoundedRectShape,
    makePolyShapeXZ,
    ensureCCWShapeXZ,
    addHippedRoof,
    addWedgeRamp,
    getCachedAngsanaTreeParts,
    getCachedAngsanaLeafMaterial,
    getVehiclePaintMaterial,
    getVehiclePaintedVertexMaterial,
    getVehicleTrimMaterial,
    getCabinGlassMaterial,
    getRubberTireMaterial,
    getAlloyMetalMaterial,
    getHeadlightEmissiveMaterial,
    getTaillightEmissiveMaterial,
    getAmberAccentEmissiveMaterial,
    getWarmDisplayGlassMaterial,
    getWoodPbrMaterial,
    getConcretePbrMaterial,
    getTrafficAmberMaterial,
    evalTrafficSignalBlink,
    updateTrafficSignalTime,
    getHighwaySignMaterial,
    getCityLodMaterial,
    getLampBulbMaterial,
    getSedanMpvProto,
    getAngkotProto,
    getTransJakartaBusProto,
    getOjolProto,
    getAmbulanceProto,
    getMilitaryTruckProto,
    getPalletProto,
    getParkBenchProto,
    getRoadBarrierProto,
    getStreetLampProto,
    getFireHydrantProto,
    getPowerPoleProto,
    getPowerBoxProto,
    getManholeProto,
    getTrashCanProto,
    getTrashBagProto,
    getPlanterBoxProto,
    getFoliageCardProto,
    createLootboxVisual,
    updateLootboxVisuals,
    getGerobakProto,
    getTrafficSignalProto,
    extractModelProto,
    emitInstancedProto,
    emitInstancedLodProto,
    placeSingleProto,
    buildSkylineSilhouetteRing
  });
})();
