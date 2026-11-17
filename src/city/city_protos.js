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
  let _vehTrimMat = null;
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
        roughness: 0.34,
        metalness: 0.44,
        envMapIntensity: 1.2
      });
    }
    return _vehPaintMat;
  }

  function getVehicleTrimMaterial() {
    if (!_vehTrimMat) {
      _vehTrimMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.68,
        metalness: 0.16
      });
    }
    return _vehTrimMat;
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

  function addWheelPair(trimBucket, radius, width, y, z, halfTrack) {
    for (const sx of [-halfTrack, halfTrack]) {
      addColoredCylinder(trimBucket, radius, radius, width, 10, sx, y, z, 0, 0, Math.PI * 0.5, 0x191b1f, 0.75);
      addColoredCylinder(trimBucket, radius * 0.56, radius * 0.56, width + 0.02, 8, sx, y, z, 0, 0, Math.PI * 0.5, 0x6e747c, 0.85);
    }
  }

  // Indonesian Sedan & MPV (Avanza/Innova) prototypes: paint part (for instanceColor) + trim part
  function getSedanMpvProto(variant) {
    const cacheKey = 'proc_veh_' + variant;
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const isMpv = variant === 'mpv_ajar';
    const bPaint = [];
    const bTrim = [];

    const len = isMpv ? 4.42 : 4.24;
    const w = isMpv ? 1.74 : 1.70;
    const wheelR = isMpv ? 0.34 : 0.31;

    // 4 wheels + dark undercarriage + front/rear bumpers
    addWheelPair(bTrim, wheelR, 0.22, wheelR, 1.32, w * 0.46);
    addWheelPair(bTrim, wheelR, 0.22, wheelR, -1.32, w * 0.46);
    addColoredBox(bTrim, w * 0.90, 0.16, len * 0.92, 0, wheelR * 0.75, 0, 0, 0, 0, 0x181a1d, 0.8);
    addColoredBox(bTrim, w * 0.98, 0.26, 0.24, 0, wheelR + 0.12, len * 0.48, 0, 0, 0, 0x2a2e33, 0.75);
    addColoredBox(bTrim, w * 0.98, 0.26, 0.24, 0, wheelR + 0.12, -len * 0.48, 0, 0, 0, 0x2a2e33, 0.75);
    // Headlights & taillights
    addColoredBox(bTrim, 0.32, 0.14, 0.08, -w * 0.34, wheelR + 0.38, len * 0.49, 0, 0, 0, 0xd8d6c4, 0.9);
    addColoredBox(bTrim, 0.32, 0.14, 0.08, w * 0.34, wheelR + 0.38, len * 0.49, 0, 0, 0, 0xd8d6c4, 0.9);
    addColoredBox(bTrim, 0.30, 0.14, 0.08, -w * 0.34, wheelR + 0.42, -len * 0.49, 0, 0, 0, 0x992020, 0.85);
    addColoredBox(bTrim, 0.30, 0.14, 0.08, w * 0.34, wheelR + 0.42, -len * 0.49, 0, 0, 0, 0x992020, 0.85);
    // Grille
    addColoredBox(bTrim, w * 0.44, 0.20, 0.06, 0, wheelR + 0.34, len * 0.49, 0, 0, 0, 0x1b1e22, 0.8);

    // Lower painted chassis body
    addPaintBox(bPaint, w, 0.56, len * 0.96, 0, wheelR + 0.32, 0);

    if (isMpv) {
      // Avanza/Innova longer greenhouse + roof rack rails + ajar driver door & popped hood
      addPaintBox(bPaint, w * 0.88, 0.58, 2.52, 0, wheelR + 0.86, -0.34);
      // Popped hood (+Z front) tilted up ~14 deg + dark engine bay underneath
      addColoredBox(bTrim, w * 0.78, 0.24, 1.05, 0, wheelR + 0.50, 1.38, 0, 0, 0, 0x1d1f23, 0.7);
      addPaintBox(bPaint, w * 0.92, 0.07, 1.12, 0, wheelR + 0.72, 1.34, -0.24, 0, 0);
      // Slightly ajar front-left door
      addPaintBox(bPaint, 0.08, 0.54, 0.92, -w * 0.5 - 0.18, wheelR + 0.34, 0.22, 0, -0.38, 0);
      addColoredBox(bTrim, 0.06, 0.42, 0.78, -w * 0.5 - 0.18, wheelR + 0.80, 0.22, 0, -0.38, 0, 0x1b2833, 0.8);
      // Tinted cabin windows & roof rails
      addColoredBox(bTrim, w * 0.80, 0.44, 0.12, 0, wheelR + 0.84, 0.92, -0.35, 0, 0, 0x1b2a36, 0.85);
      addColoredBox(bTrim, w * 0.90, 0.42, 2.25, 0, wheelR + 0.85, -0.38, 0, 0, 0, 0x1a2630, 0.85);
      addColoredBox(bTrim, 0.06, 0.06, 2.10, -w * 0.36, wheelR + 1.18, -0.35, 0, 0, 0, 0x2a2d32, 0.9);
      addColoredBox(bTrim, 0.06, 0.06, 2.10, w * 0.36, wheelR + 1.18, -0.35, 0, 0, 0, 0x2a2d32, 0.9);
    } else {
      // Compact Indonesian sedan greenhouse + trunk
      addPaintBox(bPaint, w * 0.86, 0.48, 1.85, 0, wheelR + 0.82, -0.10);
      addColoredBox(bTrim, w * 0.78, 0.38, 0.12, 0, wheelR + 0.78, 0.84, -0.45, 0, 0, 0x1b2a36, 0.85);
      addColoredBox(bTrim, w * 0.78, 0.36, 0.12, 0, wheelR + 0.78, -1.04, 0.45, 0, 0, 0x1b2a36, 0.85);
      addColoredBox(bTrim, w * 0.88, 0.34, 1.56, 0, wheelR + 0.80, -0.10, 0, 0, 0, 0x1a2630, 0.85);
    }

    const proto = {
      parts: mergePartBuckets([
        { bucket: bPaint, mat: getVehiclePaintMaterial() },
        { bucket: bTrim, mat: getVehicleTrimMaterial() }
      ]),
      size: { x: w, y: isMpv ? 1.66 : 1.44, z: len }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Blue Bird / JakLingko Angkot Minivan (sky-blue & white livery + roof rack)
  function getAngkotProto() {
    const cacheKey = 'proc_veh_angkot';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bTrim = [];
    const len = 3.92;
    const w = 1.62;
    const wheelR = 0.31;

    addWheelPair(bTrim, wheelR, 0.20, wheelR, 1.24, w * 0.45);
    addWheelPair(bTrim, wheelR, 0.20, wheelR, -1.24, w * 0.45);
    // Bumpers & lights
    addColoredBox(bTrim, w * 0.98, 0.24, 0.20, 0, wheelR + 0.08, len * 0.49, 0, 0, 0, 0x23272c, 0.75);
    addColoredBox(bTrim, w * 0.98, 0.24, 0.20, 0, wheelR + 0.08, -len * 0.49, 0, 0, 0, 0x23272c, 0.75);
    addColoredBox(bTrim, 0.26, 0.14, 0.06, -w * 0.34, wheelR + 0.34, len * 0.50, 0, 0, 0, 0xeee6c8, 0.9);
    addColoredBox(bTrim, 0.26, 0.14, 0.06, w * 0.34, wheelR + 0.34, len * 0.50, 0, 0, 0, 0xeee6c8, 0.9);

    // Sky-blue lower skirt & body
    addColoredBox(bTrim, w, 0.68, len * 0.96, 0, wheelR + 0.34, 0, 0, 0, 0, 0x1e82cc, 0.78);
    // White JakLingko/Blue Bird stripe band
    addColoredBox(bTrim, w + 0.02, 0.14, len * 0.96, 0, wheelR + 0.66, 0, 0, 0, 0, 0xe8edf2, 0.9);
    // Upper white cabin & roof
    addColoredBox(bTrim, w * 0.94, 0.58, len * 0.88, 0, wheelR + 0.98, -0.08, 0, 0, 0, 0xe6ebf0, 0.88);
    // Dark window band (front + sides)
    addColoredBox(bTrim, w * 0.84, 0.42, 0.10, 0, wheelR + 0.96, len * 0.42, -0.18, 0, 0, 0x192530, 0.85);
    addColoredBox(bTrim, w * 0.96, 0.38, len * 0.68, 0, wheelR + 0.96, -0.14, 0, 0, 0, 0x1a2632, 0.85);
    // Yellow JakLingko route sign on roof brow + roof luggage rack
    addColoredBox(bTrim, 0.78, 0.16, 0.18, 0, wheelR + 1.34, len * 0.30, 0, 0, 0, 0xf2c928, 0.9);
    addColoredBox(bTrim, w * 0.74, 0.06, 2.20, 0, wheelR + 1.31, -0.35, 0, 0, 0, 0x383e45, 0.85);
    addColoredBox(bTrim, 0.05, 0.10, 2.20, -w * 0.36, wheelR + 1.35, -0.35, 0, 0, 0, 0x383e45, 0.85);
    addColoredBox(bTrim, 0.05, 0.10, 2.20, w * 0.36, wheelR + 1.35, -0.35, 0, 0, 0, 0x383e45, 0.85);

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: w, y: 1.72, z: len }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // TransJakarta BRT Bus Wreck (tactical cover landmark)
  function getTransJakartaBusProto() {
    const cacheKey = 'proc_veh_tj_bus';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bTrim = [];
    const len = 10.6;
    const w = 2.46;
    const wheelR = 0.50;

    addWheelPair(bTrim, wheelR, 0.32, wheelR, 3.15, w * 0.45);
    addWheelPair(bTrim, wheelR, 0.32, wheelR, -2.85, w * 0.45);
    // Heavy chassis + dark wheel arches
    addColoredBox(bTrim, w * 0.94, 0.32, len * 0.96, 0, wheelR * 0.85, 0, 0, 0, 0, 0x1c2024, 0.75);
    // Lower TransJakarta sky-blue body
    addColoredBox(bTrim, w, 1.05, len, 0, wheelR + 0.52, 0, 0, 0, 0, 0x1b74c4, 0.80);
    // White upper bus hull
    addColoredBox(bTrim, w * 0.99, 1.38, len * 0.98, 0, wheelR + 1.72, 0, 0, 0, 0, 0xe8edf2, 0.88);
    // Navy & red livery stripe
    addColoredBox(bTrim, w + 0.02, 0.16, len + 0.02, 0, wheelR + 1.08, 0, 0, 0, 0, 0x0e2f5c, 0.9);
    addColoredBox(bTrim, w + 0.02, 0.08, len * 0.96, 0, wheelR + 0.24, 0, 0, 0, 0, 0xc82428, 0.9);
    // Panoramic dark side windows & split front windshield
    addColoredBox(bTrim, w + 0.02, 0.86, len * 0.84, 0, wheelR + 1.78, -0.25, 0, 0, 0, 0x17222c, 0.85);
    addColoredBox(bTrim, w * 0.88, 1.02, 0.12, 0, wheelR + 1.64, len * 0.49, 0, 0, 0, 0x141d26, 0.85);
    // Front orange destination LED brow + crumpled front bumper
    addColoredBox(bTrim, 1.65, 0.22, 0.14, 0, wheelR + 2.26, len * 0.495, 0, 0, 0, 0xf59e0b, 0.95);
    addColoredBox(bTrim, w * 1.02, 0.34, 0.26, 0.06, wheelR + 0.12, len * 0.50, 0.06, 0.04, -0.04, 0x262b30, 0.75);
    // Rooftop HVAC pods
    addColoredBox(bTrim, 1.48, 0.34, 3.60, 0, wheelR + 2.58, 0.4, 0, 0, 0, 0x9aa2aa, 0.85);
    addColoredBox(bTrim, 1.32, 0.26, 2.20, 0, wheelR + 2.54, -3.2, 0, 0, 0, 0x8a929a, 0.85);

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: w, y: 3.12, z: len }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Detailed Abandoned Indonesian Ojol Scooter (Gojek/Grab green & black courier livery)
  function getOjolProto() {
    const cacheKey = 'proc_veh_ojol_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bTrim = [];
    // Front & rear rubber tires + silver 5-spoke hub rims + brake rotor (12-seg wheels)
    for (const wz of [0.64, -0.62]) {
      addColoredCylinder(bTrim, 0.25, 0.25, 0.11, 12, 0, 0.25, wz, 0, 0, Math.PI * 0.5, 0x16181c, 0.78);
      addColoredCylinder(bTrim, 0.155, 0.155, 0.125, 10, 0, 0.25, wz, 0, 0, Math.PI * 0.5, 0x9ca3af, 0.88);
      addColoredCylinder(bTrim, 0.06, 0.06, 0.135, 8, 0, 0.25, wz, 0, 0, Math.PI * 0.5, 0x1e2228, 0.9);
    }
    // Front telescopic fork tubes & arched mudguard fender
    for (const fx of [-0.085, 0.085]) {
      addColoredCylinder(bTrim, 0.022, 0.022, 0.54, 6, fx, 0.50, 0.54, -0.26, 0, 0, 0xb8c0cc, 0.9);
    }
    addColoredBox(bTrim, 0.15, 0.05, 0.34, 0, 0.49, 0.63, -0.22, 0, 0, 0x15803d, 0.85);
    // Lower engine casing / CVT swingarm + muffler exhaust pipe
    addColoredBox(bTrim, 0.24, 0.16, 0.62, -0.04, 0.27, -0.34, 0, 0, 0, 0x262930, 0.82);
    addColoredCylinder(bTrim, 0.045, 0.052, 0.48, 8, 0.16, 0.26, -0.44, Math.PI * 0.5 - 0.18, 0, 0, 0x3f444d, 0.85);
    addColoredBox(bTrim, 0.025, 0.08, 0.34, 0.19, 0.26, -0.44, -0.18, 0, 0, 0xcfd4dc, 0.9);
    // Recessed step-through floorboard deck
    addColoredBox(bTrim, 0.34, 0.08, 0.56, 0, 0.25, 0.08, 0, 0, 0, 0x1c1f24, 0.8);
    addColoredBox(bTrim, 0.38, 0.10, 0.58, 0, 0.19, 0.06, 0, 0, 0, 0x16a34a, 0.82);
    // Angled front leg-shield fairing (two-tone Gojek green + matte charcoal inner knee panel)
    addColoredBox(bTrim, 0.38, 0.56, 0.22, 0, 0.58, 0.45, -0.24, 0, 0, 0x16a34a, 0.86);
    addColoredBox(bTrim, 0.32, 0.48, 0.10, 0, 0.57, 0.35, -0.24, 0, 0, 0x22262c, 0.82);
    // Front headlamp cowl + visor + amber turn signals
    addColoredBox(bTrim, 0.26, 0.14, 0.12, 0, 0.68, 0.53, -0.18, 0, 0, 0xeef6ff, 0.95);
    addColoredBox(bTrim, 0.06, 0.06, 0.06, -0.13, 0.68, 0.51, 0, 0, 0, 0xf59e0b, 0.92);
    addColoredBox(bTrim, 0.06, 0.06, 0.06, 0.13, 0.68, 0.51, 0, 0, 0, 0xf59e0b, 0.92);
    // Steering stem, sculpted speedometer cowl, swept handlebars + grips + twin mirrors
    addColoredBox(bTrim, 0.22, 0.11, 0.18, 0, 0.95, 0.34, -0.12, 0, 0, 0x15803d, 0.88);
    addColoredBox(bTrim, 0.14, 0.04, 0.12, 0, 1.00, 0.31, -0.45, 0, 0, 0x101820, 0.95);
    addColoredBox(bTrim, 0.66, 0.045, 0.06, 0, 0.95, 0.32, 0, 0, 0, 0x1f2429, 0.9);
    addColoredCylinder(bTrim, 0.025, 0.025, 0.14, 6, -0.32, 0.95, 0.31, 0, 0, Math.PI * 0.5, 0x111317, 0.85);
    addColoredCylinder(bTrim, 0.025, 0.025, 0.14, 6, 0.32, 0.95, 0.31, 0, 0, Math.PI * 0.5, 0x111317, 0.85);
    for (const sx of [-1, 1]) {
      addColoredCylinder(bTrim, 0.01, 0.01, 0.16, 5, sx * 0.25, 1.04, 0.32, 0, 0, -sx * 0.24, 0x26292e, 0.85);
      addColoredBox(bTrim, 0.11, 0.065, 0.025, sx * 0.28, 1.12, 0.32, 0, 0, 0, 0x1a1e24, 0.9);
    }
    // Tapered rear side body panels + contoured matte leather saddle + rear grab rail
    addColoredBox(bTrim, 0.36, 0.34, 0.70, 0, 0.53, -0.36, 0.05, 0, 0, 0x16a34a, 0.84);
    addColoredBox(bTrim, 0.30, 0.12, 0.64, 0, 0.72, -0.26, -0.06, 0, 0, 0x181a1f, 0.86);
    addColoredBox(bTrim, 0.24, 0.07, 0.30, 0, 0.77, -0.10, 0.08, 0, 0, 0x20232a, 0.9);
    // Tail light + rear fender/plate
    addColoredBox(bTrim, 0.20, 0.08, 0.06, 0, 0.56, -0.73, 0, 0, 0, 0xdc2626, 0.9);
    addColoredBox(bTrim, 0.16, 0.14, 0.04, 0, 0.40, -0.76, -0.22, 0, 0, 0x111316, 0.9);
    // Side kickstand + Ojol thermal delivery box (Gojek green/white stripe)
    addColoredCylinder(bTrim, 0.015, 0.015, 0.28, 5, -0.14, 0.13, -0.10, 0, 0, 0.52, 0x26292e, 0.85);
    addColoredBox(bTrim, 0.42, 0.34, 0.40, 0, 0.93, -0.62, 0, 0, 0, 0x15803d, 0.88);
    addColoredBox(bTrim, 0.44, 0.055, 0.42, 0, 1.11, -0.62, 0, 0, 0, 0x181a1e, 0.9);
    addColoredBox(bTrim, 0.43, 0.045, 0.41, 0, 0.94, -0.62, 0, 0, 0, 0xe5e7eb, 0.95);

    // Slight natural 7.5 deg kickstand lean
    for (let i = 0; i < bTrim.length; i++) {
      bTrim[i].rotateZ(0.13);
    }

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 0.72, y: 1.18, z: 1.85 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Grounded Cast-Iron & Stained-Teak Jakarta Park Bench (replaces broken GLTF)
  function getParkBenchProto() {
    const cacheKey = 'proc_prop_park_bench_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bTrim = [];
    // Two cast-iron end frames + center stiffener strut (grounded at y = 0)
    for (const fx of [-0.82, 0.82]) {
      addColoredBox(bTrim, 0.10, 0.03, 0.62, fx, 0.015, 0.02, 0, 0, 0, 0x1e2329, 0.85); // base pad
      addColoredBox(bTrim, 0.06, 0.42, 0.07, fx, 0.21, 0.24, 0, 0, 0, 0x242a32, 0.85);  // front leg
      addColoredBox(bTrim, 0.06, 0.42, 0.07, fx, 0.21, -0.22, 0, 0, 0, 0x242a32, 0.85); // back leg
      addColoredBox(bTrim, 0.06, 0.06, 0.56, fx, 0.42, 0.01, 0, 0, 0, 0x242a32, 0.85);  // seat rail
      addColoredBox(bTrim, 0.055, 0.48, 0.065, fx, 0.66, -0.25, -0.14, 0, 0, 0x242a32, 0.88); // backrest post
      // Welded armrest loop connected cleanly from seat rail to backrest post
      addColoredBox(bTrim, 0.055, 0.20, 0.055, fx, 0.52, 0.22, 0, 0, 0, 0x242a32, 0.88);
      addColoredBox(bTrim, 0.065, 0.045, 0.46, fx, 0.62, 0.01, 0, 0, 0, 0x2b313a, 0.92);
    }
    addColoredBox(bTrim, 0.05, 0.39, 0.06, 0, 0.20, -0.02, 0, 0, 0, 0x242a32, 0.85); // center brace
    addColoredBox(bTrim, 1.64, 0.045, 0.045, 0, 0.36, -0.02, 0, 0, 0, 0x242a32, 0.85); // under-seat tie bar

    // 4 Stained teak wood seat planks
    for (let s = 0; s < 4; s++) {
      const sz = -0.17 + s * 0.125;
      addColoredBox(bTrim, 1.84, 0.042, 0.095, 0, 0.455, sz, 0, 0, 0, 0x7a4b2a, 0.86);
    }
    // 3 Stained teak backrest planks matching -0.14 backrest angle
    for (let r = 0; r < 3; r++) {
      const ry = 0.58 + r * 0.125;
      const rz = -0.22 - r * 0.018;
      addColoredBox(bTrim, 1.84, 0.088, 0.038, 0, ry, rz, -0.14, 0, 0, 0x7c4d2c, 0.88);
    }

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 1.90, y: 0.90, z: 0.68 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Ultra-low-poly Sloped Concrete Jersey Road Barrier (~36 tris vs 60,928-tri GLTF!)
  function getRoadBarrierProto() {
    const cacheKey = 'proc_prop_road_barrier_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    // Wide concrete foot + sloped waist + hazard yellow/dark band top
    addColoredBox(bTrim, 1.62, 0.24, 0.64, 0, 0.12, 0, 0, 0, 0, 0x7d8084, 0.82);
    addColoredBox(bTrim, 1.60, 0.40, 0.38, 0, 0.44, 0, 0, 0, 0, 0x8e9296, 0.86);
    addColoredBox(bTrim, 1.58, 0.20, 0.24, 0, 0.74, 0, 0, 0, 0, 0x9aa0a6, 0.90);
    // Black & amber hazard reflection cap strip
    addColoredBox(bTrim, 0.50, 0.14, 0.26, -0.48, 0.72, 0, 0, 0, 0, 0xd99b18, 0.94);
    addColoredBox(bTrim, 0.50, 0.14, 0.26, 0.48, 0.72, 0, 0, 0, 0, 0x20242a, 0.92);

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 1.62, y: 0.84, z: 0.64 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Jakarta PJU Street Lamp (~76 tris vs 30,050-tri GLTF! Arm extends +X cleanly over roadway)
  function getStreetLampProto() {
    const cacheKey = 'proc_prop_street_lamp_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    const bBulb = [];
    // Concrete octagonal pedestal base + tapered dark-iron pole + curved cantilever arm along +X + hood
    addColoredCylinder(bTrim, 0.17, 0.22, 0.58, 8, 0, 0.29, 0, 0, 0, 0, 0x262b31, 0.80);
    addColoredCylinder(bTrim, 0.065, 0.105, 4.05, 8, 0, 2.55, 0, 0, 0, 0, 0x23282e, 0.84);
    addColoredBox(bTrim, 1.15, 0.09, 0.09, 0.46, 4.66, 0, 0, 0, 0.14, 0x2c323a, 0.88);
    addColoredBox(bTrim, 0.52, 0.09, 0.28, 1.05, 4.74, 0, 0, 0, 0, 0x353c46, 0.90);
    const bulb = new THREE.BoxGeometry(0.40, 0.06, 0.22);
    bulb.translate(1.05, 4.68, 0);
    bBulb.push(prepGeo(bulb, false));

    const proto = {
      parts: mergePartBuckets([
        { bucket: bTrim, mat: getVehicleTrimMaterial() },
        { bucket: bBulb, mat: getLampBulbMaterial() }
      ]),
      size: { x: 1.35, y: 4.80, z: 0.45 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Fire Hydrant (~68 tris vs 43,158-tri GLTF!)
  function getFireHydrantProto() {
    const cacheKey = 'proc_prop_fire_hydrant_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    addColoredCylinder(bTrim, 0.17, 0.19, 0.10, 8, 0, 0.05, 0, 0, 0, 0, 0x451212, 0.80);
    addColoredCylinder(bTrim, 0.12, 0.13, 0.56, 8, 0, 0.38, 0, 0, 0, 0, 0xb91c1c, 0.84);
    addColoredCylinder(bTrim, 0.14, 0.11, 0.12, 8, 0, 0.70, 0, 0, 0, 0, 0xdc2626, 0.90);
    addColoredCylinder(bTrim, 0.04, 0.05, 0.08, 6, 0, 0.79, 0, 0, 0, 0, 0xd4d4d8, 0.95);
    addColoredCylinder(bTrim, 0.055, 0.055, 0.36, 6, 0, 0.52, 0, 0, 0, Math.PI * 0.5, 0xcbd5e1, 0.92);
    addColoredCylinder(bTrim, 0.07, 0.07, 0.12, 6, 0, 0.50, 0.12, Math.PI * 0.5, 0, 0, 0xcbd5e1, 0.92);

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 0.38, y: 0.83, z: 0.38 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // PLN Concrete Utility Pole (~52 tris vs 28,839-tri GLTF!)
  function getPowerPoleProto(variantIdx) {
    const cacheKey = `proc_prop_power_pole_v1_${variantIdx || 0}`;
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    addColoredCylinder(bTrim, 0.11, 0.19, 6.80, 7, 0, 3.40, 0, 0, 0, 0, 0x8b8e92, 0.82);
    addColoredCylinder(bTrim, 0.175, 0.178, 0.45, 7, 0, 1.35, 0, 0, 0, 0, 0xeab308, 0.9);
    // Steel crossarms + ceramic insulators
    addColoredBox(bTrim, 1.85, 0.08, 0.09, 0, 6.25, 0, 0, 0, 0, 0x4b5563, 0.88);
    if ((variantIdx || 0) === 1) {
      addColoredBox(bTrim, 1.55, 0.08, 0.09, 0, 5.55, 0, 0, 0, 0, 0x4b5563, 0.88);
      addColoredCylinder(bTrim, 0.24, 0.24, 0.72, 8, 0.28, 4.75, 0, 0, 0, 0, 0x475569, 0.85);
    }
    for (const ix of [-0.78, 0, 0.78]) {
      addColoredCylinder(bTrim, 0.04, 0.05, 0.14, 6, ix, 6.35, 0, 0, 0, 0, 0xd1d5db, 0.94);
    }

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 1.9, y: 6.8, z: 0.5 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Grounded PLN Power Feeder Pillar on concrete plinth (~48 tris vs 21,272-tri GLTF!)
  function getPowerBoxProto() {
    const cacheKey = 'proc_prop_power_box_v2';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    // Concrete foundation pedestal resting cleanly at y = 0
    addColoredBox(bTrim, 0.84, 0.34, 0.56, 0, 0.17, 0, 0, 0, 0, 0x6b7280, 0.80);
    // Steel relay cabinet housing + sloped rain hood
    addColoredBox(bTrim, 0.76, 1.08, 0.46, 0, 0.88, 0, 0, 0, 0, 0x475569, 0.84);
    addColoredBox(bTrim, 0.82, 0.08, 0.52, 0, 1.46, 0, 0, 0, 0, 0x334155, 0.90);
    // Center door seam, handle & high-voltage yellow hazard diamond/plate on +Z front face
    addColoredBox(bTrim, 0.03, 0.96, 0.02, 0, 0.88, 0.24, 0, 0, 0, 0x1e293b, 0.90);
    addColoredBox(bTrim, 0.05, 0.14, 0.04, 0.08, 0.88, 0.24, 0, 0, 0, 0x1f2937, 0.92);
    addColoredBox(bTrim, 0.18, 0.18, 0.02, 0.20, 1.10, 0.24, 0, 0, 0, 0xeab308, 0.96);

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 0.84, y: 1.50, z: 0.56 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Cast-Iron Manhole Cover (~16 tris vs 50,408-tri GLTF!)
  function getManholeProto() {
    const cacheKey = 'proc_prop_manhole_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    addColoredCylinder(bTrim, 0.36, 0.38, 0.03, 10, 0, 0.015, 0, 0, 0, 0, 0x26292e, 0.85);
    addColoredCylinder(bTrim, 0.30, 0.30, 0.036, 10, 0, 0.018, 0, 0, 0, 0, 0x373c44, 0.90);
    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 0.76, y: 0.04, z: 0.76 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Jakarta Municipal Street Trash Bin (~32 tris vs 51,424-tri GLTF!)
  function getTrashCanProto() {
    const cacheKey = 'proc_prop_trash_can_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    addColoredCylinder(bTrim, 0.25, 0.22, 0.76, 8, 0, 0.38, 0, 0, 0, 0, 0x1e5c3a, 0.82);
    addColoredCylinder(bTrim, 0.27, 0.26, 0.08, 8, 0, 0.78, 0, 0, 0, 0, 0x23282e, 0.90);
    addColoredBox(bTrim, 0.28, 0.16, 0.28, 0, 0.86, 0, 0, 0, 0, 0x2a3038, 0.88);
    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 0.54, y: 0.94, z: 0.54 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Tied Plastic Trash Bags (~24 tris vs 35,856-tri GLTF!)
  function getTrashBagProto() {
    const cacheKey = 'proc_prop_trash_bag_v1';
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

  // Concrete Boulevard Planter Box (~28 tris vs 24,282-tri GLTF!)
  function getPlanterBoxProto() {
    const cacheKey = 'proc_prop_planter_box_v1';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);
    const bTrim = [];
    addColoredBox(bTrim, 1.32, 0.42, 0.62, 0, 0.21, 0, 0, 0, 0, 0x767a80, 0.82);
    addColoredBox(bTrim, 1.38, 0.06, 0.68, 0, 0.43, 0, 0, 0, 0, 0x8f949a, 0.90);
    addColoredBox(bTrim, 1.18, 0.08, 0.48, 0, 0.41, 0, 0, 0, 0, 0x3b2a1e, 0.85);
    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
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

  // Jakarta Gerobak Kaki Lima (street food pushcart)
  function getGerobakProto() {
    const cacheKey = 'proc_prop_gerobak';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bTrim = [];
    // Two spoked side wheels + front rest leg
    addColoredCylinder(bTrim, 0.32, 0.32, 0.07, 10, -0.46, 0.32, 0.0, 0, 0, Math.PI * 0.5, 0x26292e, 0.8);
    addColoredCylinder(bTrim, 0.32, 0.32, 0.07, 10, 0.46, 0.32, 0.0, 0, 0, Math.PI * 0.5, 0x26292e, 0.8);
    addColoredBox(bTrim, 0.08, 0.36, 0.08, 0, 0.18, 0.62, 0, 0, 0, 0x5c3d28, 0.75);
    // Lower royal-blue & teak wooden cabinet
    addColoredBox(bTrim, 0.82, 0.68, 1.56, 0, 0.70, 0, 0, 0, 0, 0x1d68a8, 0.78);
    addColoredBox(bTrim, 0.84, 0.08, 1.60, 0, 1.06, 0, 0, 0, 0, 0x7c5132, 0.85);
    // Upper display glass cabinet + interior warm wood shelf
    addColoredBox(bTrim, 0.70, 0.56, 1.24, 0, 1.38, 0.08, 0, 0, 0, 0xa8c6d8, 0.88);
    addColoredBox(bTrim, 0.06, 0.62, 0.06, -0.34, 1.38, -0.52, 0, 0, 0, 0x6b442a, 0.85);
    addColoredBox(bTrim, 0.06, 0.62, 0.06, 0.34, 1.38, -0.52, 0, 0, 0, 0x6b442a, 0.85);
    addColoredBox(bTrim, 0.06, 0.62, 0.06, -0.34, 1.38, 0.68, 0, 0, 0, 0x6b442a, 0.85);
    addColoredBox(bTrim, 0.06, 0.62, 0.06, 0.34, 1.38, 0.68, 0, 0, 0, 0x6b442a, 0.85);
    // Pitched awning roof (terracotta/tarp blue-orange) + push handle
    addColoredBox(bTrim, 1.12, 0.08, 1.76, 0, 1.78, 0, 0, 0, 0.08, 0xc85828, 0.88);
    addColoredBox(bTrim, 0.06, 0.06, 0.42, -0.34, 0.98, -0.92, 0, 0, 0, 0x7c5132, 0.85);
    addColoredBox(bTrim, 0.06, 0.06, 0.42, 0.34, 0.98, -0.92, 0, 0, 0, 0x7c5132, 0.85);
    addColoredBox(bTrim, 0.74, 0.06, 0.06, 0, 0.98, -1.10, 0, 0, 0, 0x7c5132, 0.85);

    const proto = {
      parts: mergePartBuckets([{ bucket: bTrim, mat: getVehicleTrimMaterial() }]),
      size: { x: 1.12, y: 1.90, z: 1.92 }
    };
    _cityProtoCache.set(cacheKey, proto);
    return proto;
  }

  // Cantilever Traffic Signal Pole (amber lens blink via shader; paired with 1 pooled amber PointLight)
  function getTrafficSignalProto() {
    const cacheKey = 'proc_prop_traffic_signal';
    if (_cityProtoCache.has(cacheKey)) return _cityProtoCache.get(cacheKey);

    const bTrim = [];
    const bAmberLens = [];

    // Vertical mast (4.9m) + base flange
    addColoredCylinder(bTrim, 0.10, 0.14, 4.9, 8, 0, 2.45, 0, 0, 0, 0, 0x3b424a, 0.75);
    addColoredBox(bTrim, 0.42, 0.16, 0.42, 0, 0.08, 0, 0, 0, 0, 0x262a30, 0.8);
    // Cantilever arm extending +X over street
    addColoredCylinder(bTrim, 0.07, 0.09, 3.1, 8, 1.50, 4.68, 0, 0, 0, Math.PI * 0.5, 0x3b424a, 0.85);
    // 3-aspect signal housing hanging at x = 2.45
    addColoredBox(bTrim, 0.38, 1.04, 0.34, 2.45, 4.10, 0, 0, 0, 0, 0x1a1d22, 0.85);
    // Dark red & green unlit lenses + hood visors
    for (const lz of [-0.18, 0.18]) {
      addColoredCylinder(bTrim, 0.11, 0.11, 0.06, 8, 2.45, 4.40, lz, Math.PI * 0.5, 0, 0, 0x451212, 0.9);
      addColoredCylinder(bTrim, 0.11, 0.11, 0.06, 8, 2.45, 3.80, lz, Math.PI * 0.5, 0, 0, 0x103820, 0.9);
      // Blinking amber lens (both faces)
      const lens = new THREE.CylinderGeometry(0.115, 0.115, 0.07, 8);
      transformGeo(lens, 2.45, 4.10, lz, Math.PI * 0.5, 0, 0);
      bAmberLens.push(prepGeo(lens, false));
    }

    const proto = {
      parts: mergePartBuckets([
        { bucket: bTrim, mat: getVehicleTrimMaterial() },
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
    getVehicleTrimMaterial,
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
