(function (LRT) {
  'use strict';

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

  const City = {
    rootGroup: null,
    quadrants: null,
    clutterMeshes: [],
    clutterByQuadrant: null,
    trackGates: [],
    _trackGatesOpen: false,
    disposableGeometries: [],
    disposableMaterials: [],
    disposableTextures: [],
    bvhMeshes: [],
    colliders: [],
    streetLights: [],
    spawnNodes: [],
    _matCache: null,
    _timeAccum: 0,
    _lightingFactor: 1.0,

    _getMat: function (key, texKey, opts) {
      if (!this._matCache) this._matCache = new Map();
      const mats = (LRT.Materials && LRT.Materials.mats) || {};
      if (mats[key]) return mats[key];
      if (this._matCache.has(key)) return this._matCache.get(key);

      const o = opts || {};
      const loader = LRT.AssetLoader;
      const texSet = (texKey && loader && typeof loader.getTextureSet === 'function')
        ? loader.getTextureSet(texKey, o.repX || 1, o.repY || 1)
        : null;

      let mat;
      if (o.isPhysical) {
        mat = new THREE.MeshPhysicalMaterial({
          color: o.color !== undefined ? o.color : 0x3b586b,
          roughness: o.roughness !== undefined ? o.roughness : 0.14,
          metalness: o.metalness !== undefined ? o.metalness : 0.18,
          clearcoat: 0.75,
          clearcoatRoughness: 0.1,
          transparent: !!o.transparent,
          opacity: o.opacity !== undefined ? o.opacity : 1.0,
          side: o.side || THREE.FrontSide
        });
      } else {
        const params = {
          color: o.color !== undefined ? o.color : 0xffffff,
          roughness: o.roughness !== undefined ? o.roughness : 0.85,
          metalness: o.metalness !== undefined ? o.metalness : 0.05,
          side: o.side || THREE.FrontSide
        };
        if (texSet) {
          params.map = texSet.map;
          params.normalMap = texSet.normalMap;
          params.roughnessMap = texSet.roughnessMap;
          params.aoMap = texSet.aoMap;
          this.disposableTextures.push(texSet.map, texSet.normalMap, texSet.roughnessMap, texSet.aoMap);
        }
        mat = new THREE.MeshStandardMaterial(params);
      }
      this._matCache.set(key, mat);
      this.disposableMaterials.push(mat);
      return mat;
    },

    _addCollider: function (minX, minY, minZ, maxX, maxY, maxZ, tag, opts) {
      const o = opts || {};
      const c = {
        id: this.colliders.length,
        minX: Math.min(minX, maxX),
        minY: Math.min(minY, maxY),
        minZ: Math.min(minZ, maxZ),
        maxX: Math.max(minX, maxX),
        maxY: Math.max(minY, maxY),
        maxZ: Math.max(minZ, maxZ),
        tag: tag || 'concrete',
        blocksWalk: o.blocksWalk !== undefined ? o.blocksWalk : true,
        disabled: o.blocksWalk === false,
        blocksBullets: o.blocksBullets !== undefined ? o.blocksBullets : true,
        isFloor: !!o.isFloor,
        isRamp: !!o.isRamp,
        rampAxis: o.rampAxis,
        y0: o.y0,
        y1: o.y1
      };
      this.colliders.push(c);
      return c;
    },

    _mergeAndRegisterBVH: function (bucket, mat, castShadow, receiveShadow, name, addBVH) {
      if (!bucket || bucket.length === 0) return null;
      const merged = THREE_UTILS.mergeGeometries(bucket, false);
      for (let i = 0; i < bucket.length; i++) bucket[i].dispose();
      if (!merged) return null;
      if (addBVH !== false) {
        if (typeof merged.computeBoundsTree === 'function') {
          merged.computeBoundsTree();
        } else if (window.MeshBVH && typeof window.MeshBVH.computeBoundsTree === 'function') {
          window.MeshBVH.computeBoundsTree.call(merged);
        }
      }
      this.disposableGeometries.push(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !!castShadow;
      mesh.receiveShadow = !!receiveShadow;
      mesh.name = name || '';
      this.rootGroup.add(mesh);
      if (addBVH !== false) {
        this.bvhMeshes.push(mesh);
      }
      return mesh;
    },

    // Extract normalized prototype parts from Poly Haven .gltf models (supports multi-variant filter & pivot override)
    _extractModelProto: function (key, targetHeight, filterFn, pivotOverride, protoCacheKey) {
      const filterKey = protoCacheKey || (filterFn ? filterFn.toString().replace(/\s+/g, ' ') : '');
      const pivKey = pivotOverride ? `${pivotOverride.x},${pivotOverride.y},${pivotOverride.z}` : '';
      const cacheKey = `${key}|${targetHeight || 0}|${filterKey}|${pivKey}`;
      if (_cityProtoCache.has(cacheKey)) {
        return _cityProtoCache.get(cacheKey);
      }

      const loader = LRT.AssetLoader;
      if (!loader || typeof loader.getModelRaw !== 'function') return null;
      const raw = loader.getModelRaw(key);
      if (!raw) return null;

      raw.updateMatrixWorld(true);
      const selected = [];
      raw.traverse((node) => {
        if (!node.isMesh || !node.geometry) return;
        if (filterFn && !filterFn(node)) return;
        selected.push(node);
      });
      if (selected.length === 0) return null;

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

      const partsByMat = new Map();
      for (let i = 0; i < selected.length; i++) {
        const node = selected[i];
        const g = node.geometry.clone();
        g.applyMatrix4(node.matrixWorld);
        g.translate(-pivX, -pivY, -pivZ);
        if (scale !== 1.0) g.scale(scale, scale, scale);
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
        size: {
          x: rawSize.x * scale,
          y: rawSize.y * scale,
          z: rawSize.z * scale
        }
      };
      _cityProtoCache.set(cacheKey, proto);
      return proto;
    },

    _emitInstancedProto: function (proto, placements, castShadow, receiveShadow, namePrefix, customGroup) {
      if (!proto || !placements || placements.length === 0) return;
      if (!customGroup && this.quadrants) {
        const qPlacements = { NW: [], NE: [], SW: [], SE: [] };
        for (let i = 0; i < placements.length; i++) {
          const pl = placements[i];
          const q = (pl.x < 0) ? (pl.z < 0 ? 'NW' : 'SW') : (pl.z < 0 ? 'NE' : 'SE');
          qPlacements[q].push(pl);
        }
        for (const q of ['NW', 'NE', 'SW', 'SE']) {
          if (qPlacements[q].length > 0) {
            this._emitInstancedProto(proto, qPlacements[q], castShadow, receiveShadow, `${namePrefix}_${q}`, this.quadrants[q]);
          }
        }
        return;
      }

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
        }
        inst.instanceMatrix.needsUpdate = true;
        if (typeof inst.computeBoundingBox === 'function') inst.computeBoundingBox();
        if (typeof inst.computeBoundingSphere === 'function') inst.computeBoundingSphere();
        const targetGroup = customGroup || this.rootGroup;
        targetGroup.add(inst);

        const isClutter = /^(ManholeCover|TrashBag|Fern|Calathea|PowerBox|Shrub)/.test(namePrefix);
        if (isClutter) {
          this.clutterMeshes.push(inst);
          const qMatch = namePrefix.match(/_(NW|NE|SW|SE)/);
          const qKey = qMatch ? qMatch[1] : null;
          if (qKey && this.clutterByQuadrant && this.clutterByQuadrant[qKey]) {
            this.clutterByQuadrant[qKey].push(inst);
          }
        }
      }
    },

    _placeSingleProto: function (proto, x, y, z, ry, scale, parentGroup) {
      if (!proto) return null;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      if (ry) g.rotation.y = ry;
      if (scale && scale !== 1) g.scale.setScalar(scale);
      for (let p = 0; p < proto.parts.length; p++) {
        const m = new THREE.Mesh(proto.parts[p].geo, proto.parts[p].mat);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      }
      const target = parentGroup || this.rootGroup;
      target.add(g);
      return g;
    },

    dispose: function () {
      if (this.rootGroup && this.rootGroup.parent) {
        this.rootGroup.parent.remove(this.rootGroup);
      }
      for (let i = 0; i < this.disposableGeometries.length; i++) {
        const g = this.disposableGeometries[i];
        if (!g) continue;
        if (typeof g.disposeBoundsTree === 'function' && g.boundsTree) {
          g.disposeBoundsTree();
        }
        if (typeof g.dispose === 'function') g.dispose();
      }
      for (let i = 0; i < this.disposableMaterials.length; i++) {
        if (this.disposableMaterials[i] && this.disposableMaterials[i].dispose) {
          this.disposableMaterials[i].dispose();
        }
      }
      for (let i = 0; i < this.disposableTextures.length; i++) {
        if (this.disposableTextures[i] && this.disposableTextures[i].dispose) {
          this.disposableTextures[i].dispose();
        }
      }
      this.rootGroup = null;
      this.quadrants = null;
      this.clutterMeshes = [];
      this.clutterByQuadrant = null;
      this.trackGates = [];
      this._trackGatesOpen = false;
      this.disposableGeometries = [];
      this.disposableMaterials = [];
      this.disposableTextures = [];
      this.bvhMeshes = [];
      this.colliders = [];
      this.streetLights = [];
      this.spawnNodes = [];
      this.interactables = [];
      this.hydrants = [];
      this._plnRestored = false;
      this._usedIds = null;
      this._matCache = null;
      this._timeAccum = 0;
      this._lightingFactor = 1.0;
    },

    build: function (arch, rngArg, parentGroup, opts) {
      this.dispose();

      const rng = typeof rngArg === 'function' ? rngArg : fallbackRng(4207);
      const o = opts || {};
      this._usedIds = (o.usedIds) ? (o.usedIds instanceof Set ? new Set(o.usedIds) : new Set(o.usedIds)) : new Set();
      this._plnRestored = !!o.plnRestored;
      this._arch = arch;
      const cMinX = o.corridorMinX !== undefined ? o.corridorMinX : -11.5;
      const cMaxX = o.corridorMaxX !== undefined ? o.corridorMaxX : 22.0;
      const platMinZ = o.platMinZ !== undefined ? o.platMinZ : -62.0;
      const platMaxZ = o.platMaxZ !== undefined ? o.platMaxZ : 62.0;
      const trackXs = Array.isArray(o.trackXs) && o.trackXs.length > 0 ? o.trackXs : [0.0, -4.70];
      const tubeIntensity = o.tubeIntensity !== undefined ? o.tubeIntensity : 0.85;

      const root = new THREE.Group();
      root.name = 'JakartaCityRoot';
      this.rootGroup = root;
      if (parentGroup) parentGroup.add(root);

      this.quadrants = {
        NW: new THREE.Group(),
        NE: new THREE.Group(),
        SW: new THREE.Group(),
        SE: new THREE.Group()
      };
      this.quadrants.NW.name = 'CitySector_NW';
      this.quadrants.NE.name = 'CitySector_NE';
      this.quadrants.SW.name = 'CitySector_SW';
      this.quadrants.SE.name = 'CitySector_SE';
      root.add(this.quadrants.NW);
      root.add(this.quadrants.NE);
      root.add(this.quadrants.SW);
      root.add(this.quadrants.SE);

      this.clutterMeshes = [];
      this.clutterByQuadrant = { NW: [], NE: [], SW: [], SE: [] };
      this.trackGates = [];
      this._trackGatesOpen = false;

      // Resolve Poly Haven PBR materials (using LRT.Materials.mats when present, AssetLoader PBR fallback otherwise)
      const matAsphalt = this._getMat('asphaltRoad', 'asphalt_road', { color: 0x3b3d42, roughness: 0.82, metalness: 0.04 });
      const matSidewalk = this._getMat('sidewalkPaver', 'sidewalk_paver', { color: 0x9c978d, roughness: 0.88, metalness: 0.02 });
      const matCurb = this._getMat('concreteRough', 'concrete_rough', { color: 0x96938c, roughness: 0.90, metalness: 0.02 });
      const matTactile = this._getMat('tactile', null, { color: 0xe0b422, roughness: 0.72, metalness: 0.02 });
      const matFacadeModern = this._getMat('facadeModern', 'building_facade_1', { color: 0xc2cbd4, roughness: 0.64, metalness: 0.16 });
      const matFacadePlaster = this._getMat('facadePlaster', 'building_facade_2', { color: 0xd0d4d8, roughness: 0.86, metalness: 0.02 });
      const matBrick = this._getMat('brickWall', 'brick_wall', { color: 0xb08a76, roughness: 0.88, metalness: 0.02 });
      const matDarkWood = this._getMat('darkWood', 'dark_wood', { color: 0x7a5b45, roughness: 0.76, metalness: 0.04 });
      const matRoofTerra = this._getMat('roofTerracotta', 'roof_corrugated', { color: 0xa85e32, roughness: 0.64, metalness: 0.30, side: THREE.DoubleSide });
      const matRoofOchre = this._getMat('roofOchre', 'roof_corrugated', { color: 0xc27c28, roughness: 0.64, metalness: 0.30, side: THREE.DoubleSide });
      const matSteelDark = this._getMat('steelDark', 'rust_metal', { color: 0x454a52, roughness: 0.56, metalness: 0.65 });
      const matTruss = this._getMat('steelTruss', null, { color: 0xd4d8dc, roughness: 0.54, metalness: 0.45 });
      const matJpo = this._getMat('jpoOrange', null, { color: 0xe04628, roughness: 0.58, metalness: 0.28 });
      const matAmber = this._getMat('amberBeacon', null, { color: 0xff6a1a, roughness: 0.25, metalness: 0.2 });
      const matGlassBldg = this._getMat('glassBuilding', null, {
        isPhysical: true, color: 0x2f5368, roughness: 0.12, metalness: 0.22, transparent: true, opacity: 0.82
      });
      const matMarkWhite = this._getMat('cityStripeWhite', null, { color: 0xe2e6ec, roughness: 0.75, metalness: 0.02 });
      const matMarkYellow = this._getMat('cityStripeYellow', null, { color: 0xe2b424, roughness: 0.72, metalness: 0.02 });
      const matInvisColl = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      this.disposableMaterials.push(matInvisColl);

      // Geometry buckets
      const bAsphalt = [];
      const bSidewalk = [];
      const bCurb = [];
      const bTactile = [];
      const bWhiteMark = [];
      const bYellowMark = [];
      const bFacadeModern = [];
      const bFacadePlaster = [];
      const bBrick = [];
      const bDarkWood = [];
      const bRoofTerra = [];
      const bRoofOchre = [];
      const bGlass = [];
      const bSteelDark = [];
      const bTruss = [];
      const bJpo = [];
      const bAmber = [];
      const bCables = [];
      const bCollHull = [];

      // District Layout Bounds (~230m x 236m around station)
      const DIST_Z_MIN = -118.0;
      const DIST_Z_MAX = 118.0;
      const SW_PROM = 7.0;        // Inner promenade sidewalk flanking station corridor
      const BLVD_W = 14.0;        // 4-lane Sudirman/Thamrin boulevard
      const SW_OUTER = 5.0;       // Outer boulevard sidewalk
      const BLOCK_W = 30.0;       // Inner commercial/ruko/tower city block width
      const COL_ROAD_W = 10.0;    // Secondary collector N-S road
      const OUTER_BLOCK_W = 34.0; // Outer skyline blocks

      const westInnerSwMaxX = cMinX;
      const westInnerSwMinX = westInnerSwMaxX - SW_PROM;
      const westRoadMaxX = westInnerSwMinX;
      const westRoadMinX = westRoadMaxX - BLVD_W;
      const westOuterSwMaxX = westRoadMinX;
      const westOuterSwMinX = westOuterSwMaxX - SW_OUTER;
      const westColRoadMaxX = westOuterSwMinX - BLOCK_W;
      const westColRoadMinX = westColRoadMaxX - COL_ROAD_W;
      const DIST_X_MIN = westColRoadMinX - OUTER_BLOCK_W;

      const eastInnerSwMinX = cMaxX;
      const eastInnerSwMaxX = eastInnerSwMinX + SW_PROM;
      const eastRoadMinX = eastInnerSwMaxX;
      const eastRoadMaxX = eastRoadMinX + BLVD_W;
      const eastOuterSwMinX = eastRoadMaxX;
      const eastOuterSwMaxX = eastOuterSwMinX + SW_OUTER;
      const eastColRoadMinX = eastOuterSwMaxX + BLOCK_W;
      const eastColRoadMaxX = eastColRoadMinX + COL_ROAD_W;
      const DIST_X_MAX = eastColRoadMaxX + OUTER_BLOCK_W;

      const southCrossZ0 = CROSSING_Z_SOUTH - CROSSING_HALF_W; // -80
      const southCrossZ1 = CROSSING_Z_SOUTH + CROSSING_HALF_W; // -68
      const northCrossZ0 = CROSSING_Z_NORTH - CROSSING_HALF_W; // +68
      const northCrossZ1 = CROSSING_Z_NORTH + CROSSING_HALF_W; // +80

      // Branch cross-streets outside boulevards
      const midBranchA0 = -29.0, midBranchA1 = -19.0; // 10m wide street at z = -24
      const midBranchB0 = 19.0, midBranchB1 = 29.0;   // 10m wide street at z = +24

      // =========================================================
      // 1. ASPHALT ROADS & LEVEL RAIL CROSSINGS (y = -1.00)
      // =========================================================
      const addAsphaltSlab = (x0, z0, x1, z1, walkable) => {
        const w = x1 - x0;
        const d = z1 - z0;
        if (w <= 0.05 || d <= 0.05) return;
        addBox(bAsphalt, w, 0.24, d, (x0 + x1) * 0.5, STREET_GROUND_Y - 0.12, (z0 + z1) * 0.5, 0, 0, 0, 6.0);
        if (walkable !== false) {
          this._addCollider(x0, STREET_GROUND_Y - 0.24, z0, x1, STREET_GROUND_Y, z1, 'floor', {
            isFloor: true, blocksWalk: true, blocksBullets: false
          });
        }
      };

      // West & East Side Road Networks (leaving station track corridor x in [cMinX, cMaxX] free for ballasted track!)
      addAsphaltSlab(DIST_X_MIN, DIST_Z_MIN, westInnerSwMinX + 0.5, DIST_Z_MAX, true);
      addAsphaltSlab(eastInnerSwMaxX - 0.5, DIST_Z_MIN, DIST_X_MAX, DIST_Z_MAX, true);

      // Extended outer urban terrain skirt & perimeter bounds (prevents void falloff behind outer blocks)
      const OUTER_SKIRT = 90.0;
      addAsphaltSlab(DIST_X_MIN - OUTER_SKIRT, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MIN + 0.05, DIST_Z_MAX + OUTER_SKIRT, true);
      addAsphaltSlab(DIST_X_MAX - 0.05, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MAX + OUTER_SKIRT, DIST_Z_MAX + OUTER_SKIRT, true);
      addAsphaltSlab(DIST_X_MIN, DIST_Z_MIN - OUTER_SKIRT, cMinX - 0.02, DIST_Z_MIN + 0.05, true);
      addAsphaltSlab(cMaxX + 0.02, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MAX, DIST_Z_MIN + 0.05, true);
      addAsphaltSlab(DIST_X_MIN, DIST_Z_MAX - 0.05, cMinX - 0.02, DIST_Z_MAX + OUTER_SKIRT, true);
      addAsphaltSlab(cMaxX + 0.02, DIST_Z_MAX - 0.05, DIST_X_MAX, DIST_Z_MAX + OUTER_SKIRT, true);
      // Physical Quarantine Roadblocks along outer edges (z = ±116.5 & outer collector/cross exits)
      // (Replaces invisible walls with concrete road barriers, covered car blockades, chainlink fences & amber warning beacons)
      this._addCollider(DIST_X_MIN, STREET_GROUND_Y, -117.2, cMinX - 0.2, STREET_GROUND_Y + 3.0, -115.8, 'concrete', { blocksBullets: false });
      this._addCollider(cMaxX + 0.2, STREET_GROUND_Y, -117.2, DIST_X_MAX, STREET_GROUND_Y + 3.0, -115.8, 'concrete', { blocksBullets: false });
      this._addCollider(DIST_X_MIN, STREET_GROUND_Y, 115.8, cMinX - 0.2, STREET_GROUND_Y + 3.0, 117.2, 'concrete', { blocksBullets: false });
      this._addCollider(cMaxX + 0.2, STREET_GROUND_Y, 115.8, DIST_X_MAX, STREET_GROUND_Y + 3.0, 117.2, 'concrete', { blocksBullets: false });
      this._addCollider(DIST_X_MIN, STREET_GROUND_Y, -116.5, DIST_X_MIN + 1.2, STREET_GROUND_Y + 3.0, 116.5, 'concrete', { blocksBullets: false });
      this._addCollider(DIST_X_MAX - 1.2, STREET_GROUND_Y, -116.5, DIST_X_MAX, STREET_GROUND_Y + 3.0, 116.5, 'concrete', { blocksBullets: false });

      // Station Promenade Apron Road Connection & Level Rail Crossings at z = -74 & z = +74 (y = -1.00)
      for (const [cz0, cz1] of [[southCrossZ0, southCrossZ1], [northCrossZ0, northCrossZ1]]) {
        // Keep asphalt strictly outside the track crossing slab [cMinX .. cMaxX] so zero Z-fighting occurs!
        addAsphaltSlab(westInnerSwMinX, cz0, cMinX - 0.02, cz1, true);
        addAsphaltSlab(cMaxX + 0.02, cz0, eastInnerSwMaxX, cz1, true);
        this._addCollider(cMinX - 0.1, STREET_GROUND_Y - 0.24, cz0, cMaxX + 0.1, STREET_GROUND_Y, cz1, 'floor', {
          isFloor: true, blocksWalk: true, blocksBullets: false
        });

        // Concrete crossing slab bed at y = -1.14 .. -1.015 (rails stand cleanly 1.5cm proud at -1.00!)
        const crossSpanX = (cMaxX + 0.02) - (cMinX - 0.02);
        const crossMidX = (cMinX + cMaxX) * 0.5;
        addBox(bCurb, crossSpanX, 0.14, cz1 - cz0, crossMidX, RAIL_TOP_Y - 0.085, (cz0 + cz1) * 0.5, 0, 0, 0, 3.0);

        // Flush concrete/rubberized rail crossing deck panels between & flanking running rails (top = -1.004, crisp below -1.000 steel rail head!)
        for (let t = 0; t < trackXs.length; t++) {
          const tx = trackXs[t];
          addBox(bCurb, 1.24, 0.10, cz1 - cz0, tx, RAIL_TOP_Y - 0.054, (cz0 + cz1) * 0.5, 0, 0, 0, 2.8);
          addBox(bCurb, 0.58, 0.10, cz1 - cz0, tx - 1.10, RAIL_TOP_Y - 0.054, (cz0 + cz1) * 0.5, 0, 0, 0, 2.8);
          addBox(bCurb, 0.58, 0.10, cz1 - cz0, tx + 1.10, RAIL_TOP_Y - 0.054, (cz0 + cz1) * 0.5, 0, 0, 0, 2.8);
        }

        // Yellow stop limit lines & grounded Indonesian Palang Pintu Perlintasan barrier gates on sidewalk curbs
        const cSpanX = cMaxX - cMinX;
        const cMidX = (cMinX + cMaxX) * 0.5;
        addBox(bYellowMark, cSpanX + 0.8, 0.012, 0.22, cMidX, STREET_GROUND_Y + 0.008, cz0 + 0.35);
        addBox(bYellowMark, cSpanX + 0.8, 0.012, 0.22, cMidX, STREET_GROUND_Y + 0.008, cz1 - 0.35);

        // 4 Grounded crossing gate pedestals sitting at the curb corners flanking the E-W street (arms pivot from motor housing!)
        const gateArmLen = 5.4;
        const gateTilt = 1.05; // ~60 deg raised open angle anchored directly to pedestal hinge
        const gateCorners = [
          { gx: cMinX - 0.90, gz: cz0 - 0.55, swingSignZ: 1 },
          { gx: cMinX - 0.90, gz: cz1 + 0.55, swingSignZ: -1 },
          { gx: cMaxX + 0.90, gz: cz0 - 0.55, swingSignZ: 1 },
          { gx: cMaxX + 0.90, gz: cz1 + 0.55, swingSignZ: -1 }
        ];
        for (let gi = 0; gi < gateCorners.length; gi++) {
          const gc = gateCorners[gi];
          // Grounded motor cabinet housing at SIDEWALK_Y
          addBox(bJpo, 0.44, 1.08, 0.40, gc.gx, SIDEWALK_Y + 0.54, gc.gz);
          addBox(bSteelDark, 0.50, 0.16, 0.46, gc.gx, SIDEWALK_Y + 0.08, gc.gz);
          // Flashing crossbuck signal mast mounted directly on sidewalk beside cabinet
          const postZ = gc.gz - gc.swingSignZ * 0.45;
          addCylinder(bSteelDark, 0.09, 0.11, 3.4, 8, gc.gx, SIDEWALK_Y + 1.70, postZ);
          addBox(bWhiteMark, 0.12, 0.85, 0.16, gc.gx, SIDEWALK_Y + 2.85, postZ, 0.78, 0, 0);
          addBox(bWhiteMark, 0.12, 0.85, 0.16, gc.gx, SIDEWALK_Y + 2.85, postZ, -0.78, 0, 0);
          addBox(bSteelDark, 0.24, 0.28, 0.58, gc.gx, SIDEWALK_Y + 2.25, postZ);
          addBox(bAmber, 0.26, 0.16, 0.18, gc.gx, SIDEWALK_Y + 2.25, postZ - 0.16);
          addBox(bAmber, 0.26, 0.16, 0.18, gc.gx, SIDEWALK_Y + 2.25, postZ + 0.16);
          // Hinged red-and-white boom barrier arm anchored straight into cabinet axle (zero float!)
          const pivY = SIDEWALK_Y + 0.94;
          const pivZ = gc.gz;
          const cosA = Math.cos(gateTilt);
          const sinA = Math.sin(gateTilt);
          const armCX = gc.gx;
          const armCY = pivY + (gateArmLen * 0.42) * sinA;
          const armCZ = pivZ + gc.swingSignZ * (gateArmLen * 0.42) * cosA;
          const counterCY = pivY - 0.55 * sinA;
          const counterCZ = pivZ - gc.swingSignZ * 0.55 * cosA;
          addBox(bJpo, 0.10, 0.14, gateArmLen, armCX, armCY, armCZ, -gc.swingSignZ * gateTilt, 0, 0);
          addBox(bWhiteMark, 0.11, 0.11, gateArmLen * 0.45, armCX, armCY + 0.15 * sinA, armCZ + gc.swingSignZ * 0.15 * cosA, -gc.swingSignZ * gateTilt, 0, 0);
          addBox(bSteelDark, 0.18, 0.22, 0.85, armCX, counterCY, counterCZ, -gc.swingSignZ * gateTilt, 0, 0);
          this._addCollider(gc.gx - 0.30, SIDEWALK_Y, Math.min(gc.gz, postZ) - 0.30, gc.gx + 0.30, SIDEWALK_Y + 3.4, Math.max(gc.gz, postZ) + 0.30, 'metal', { blocksBullets: false });
        }
      }

      // Outer corridor ballasted tracks beyond z = ±80 (ground level -1.18 .. -1.00)
      for (const [tz0, tz1] of [[DIST_Z_MIN, southCrossZ0], [northCrossZ1, DIST_Z_MAX]]) {
        const tLen = tz1 - tz0;
        const tMidZ = (tz0 + tz1) * 0.5;
        addBox(bCurb, cMaxX - cMinX, 0.08, tLen, (cMinX + cMaxX) * 0.5, -1.16, tMidZ, 0, 0, 0, 4.0);
        this._addCollider(cMinX, -1.24, tz0, cMaxX, -1.12, tz1, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: false });
        for (let t = 0; t < trackXs.length; t++) {
          const tx = trackXs[t];
          addBox(bSteelDark, 0.10, 0.14, tLen, tx - 0.7175, RAIL_TOP_Y - 0.07, tMidZ);
          addBox(bSteelDark, 0.10, 0.14, tLen, tx + 0.7175, RAIL_TOP_Y - 0.07, tMidZ);
          for (let sz = tz0 + 1.0; sz <= tz1 - 1.0; sz += 2.0) {
            addBox(bCurb, 2.25, 0.10, 0.26, tx, -1.09, sz, 0, 0, 0, 2.0);
          }
        }
      }

      // =========================================================
      // 2. ROAD LANE MARKINGS & ZEBRA CROSSWALKS
      // =========================================================
      const addRoadMarkingsNS = (roadMinX, roadMaxX, isMajor) => {
        const cx = (roadMinX + roadMaxX) * 0.5;
        const laneW = (roadMaxX - roadMinX) * 0.25;
        for (let z = DIST_Z_MIN + 2; z <= DIST_Z_MAX - 2; z += 6.0) {
          // Skip markings inside cross-street intersections
          if ((z > southCrossZ0 - 2 && z < southCrossZ1 + 2) || (z > northCrossZ0 - 2 && z < northCrossZ1 + 2)) continue;
          addBox(bYellowMark, 0.14, 0.008, 4.8, cx - 0.12, STREET_GROUND_Y + 0.005, z);
          addBox(bYellowMark, 0.14, 0.008, 4.8, cx + 0.12, STREET_GROUND_Y + 0.005, z);
          if (isMajor) {
            addBox(bWhiteMark, 0.12, 0.008, 2.8, cx - laneW, STREET_GROUND_Y + 0.005, z);
            addBox(bWhiteMark, 0.12, 0.008, 2.8, cx + laneW, STREET_GROUND_Y + 0.005, z);
          }
        }
      };
      addRoadMarkingsNS(westRoadMinX, westRoadMaxX, true);
      addRoadMarkingsNS(eastRoadMinX, eastRoadMaxX, true);
      addRoadMarkingsNS(westColRoadMinX, westColRoadMaxX, false);
      addRoadMarkingsNS(eastColRoadMinX, eastColRoadMaxX, false);

      const addRoadMarkingsEW = (z0, z1, x0, x1) => {
        const cz = (z0 + z1) * 0.5;
        for (let x = x0 + 2; x <= x1 - 2; x += 6.0) {
          if (x > cMinX - 1 && x < cMaxX + 1) continue;
          if (x > westRoadMinX - 1 && x < westRoadMaxX + 1) continue;
          if (x > eastRoadMinX - 1 && x < eastRoadMaxX + 1) continue;
          addBox(bYellowMark, 3.2, 0.008, 0.14, x, STREET_GROUND_Y + 0.005, cz - 0.11);
          addBox(bYellowMark, 3.2, 0.008, 0.14, x, STREET_GROUND_Y + 0.005, cz + 0.11);
        }
      };
      addRoadMarkingsEW(southCrossZ0, southCrossZ1, DIST_X_MIN, DIST_X_MAX);
      addRoadMarkingsEW(northCrossZ0, northCrossZ1, DIST_X_MIN, DIST_X_MAX);

      const addZebraCrosswalk = (cx, cz, span, isAlongX, ySurf) => {
        const yMark = (ySurf !== undefined ? ySurf : STREET_GROUND_Y) + 0.010;
        const stripePitch = 0.95;
        const count = Math.max(4, Math.floor(span / stripePitch));
        const start = -((count - 1) * stripePitch) * 0.5;
        for (let i = 0; i < count; i++) {
          const off = start + i * stripePitch;
          if (isAlongX) {
            addBox(bWhiteMark, 0.46, 0.008, 2.8, cx + off, yMark, cz);
          } else {
            addBox(bWhiteMark, 2.8, 0.008, 0.46, cx, yMark, cz + off);
          }
        }
      };

      // =========================================================
      // 3. CURVED ROUNDED-CORNER SIDEWALK BLOCKS, CURBS & ADA RAMPS
      // =========================================================
      const addSidewalkBlock = (x0, z0, x1, z1, cornerR, emitWalkCollider) => {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minZ = Math.min(z0, z1);
        const maxZ = Math.max(z0, z1);
        if (maxX - minX < 1.2 || maxZ - minZ < 1.2) return;

        const r = cornerR !== undefined ? cornerR : 2.8;
        // Concrete curb body (-1.02 .. -0.828) accounting for 2 * bevelThickness
        const bevelT = 0.015;
        const curbShape = makeRoundedRectShape(minX, minZ, maxX, maxZ, r);
        bCurb.push(extrudeShapeXZ(curbShape, STREET_GROUND_Y - 0.02, 0.192 - 2 * bevelT, {
          bevelEnabled: true, bevelThickness: bevelT, bevelSize: 0.03, bevelSegments: 1, curveSegments: 8
        }, 3.5));

        // Brick paver top surface (-0.848 .. -0.820) inset 0.22m inside granite curb rim
        const inset = 0.22;
        if (maxX - minX > inset * 2.5 && maxZ - minZ > inset * 2.5) {
          const paverShape = makeRoundedRectShape(minX + inset, minZ + inset, maxX - inset, maxZ - inset, Math.max(0.25, r - inset));
          bSidewalk.push(extrudeShapeXZ(paverShape, SIDEWALK_Y - 0.028, 0.028, null, 2.5));
        }

        if (emitWalkCollider !== false) {
          this._addCollider(minX, STREET_GROUND_Y - 0.05, minZ, maxX, SIDEWALK_Y, maxZ, 'floor', {
            isFloor: true, blocksWalk: true, blocksBullets: false
          });
        }
      };

      const addAdaCurbRamp = (cx, cz, width, run, axis, highDirSign) => {
        // Slopes between SIDEWALK_Y (-0.82) at high edge and STREET_GROUND_Y (-1.00) at low edge
        const hw = width * 0.5;
        const hr = run * 0.5;
        if (axis === 'x') {
          const y0 = highDirSign > 0 ? STREET_GROUND_Y : SIDEWALK_Y;
          const y1 = highDirSign > 0 ? SIDEWALK_Y : STREET_GROUND_Y;
          addWedgeRamp(bCurb, cx - hr, cz - hw, cx + hr, cz + hw, y0, y1, 'x', 2.0);
          const tacX = highDirSign > 0 ? cx + hr - 0.25 : cx - hr + 0.25;
          addBox(bTactile, 0.45, 0.014, width, tacX, SIDEWALK_Y + 0.007, cz, 0, 0, 0, 1.0);
          const col = this._addCollider(cx - hr, STREET_GROUND_Y - 0.1, cz - hw, cx + hr, SIDEWALK_Y + 0.05, cz + hw, 'ramp', {
            isRamp: true, blocksWalk: true, blocksBullets: false
          });
          col.rampAxis = 'x';
          col.y0 = y0;
          col.y1 = y1;
        } else {
          const y0 = highDirSign > 0 ? STREET_GROUND_Y : SIDEWALK_Y;
          const y1 = highDirSign > 0 ? SIDEWALK_Y : STREET_GROUND_Y;
          addWedgeRamp(bCurb, cx - hw, cz - hr, cx + hw, cz + hr, y0, y1, 'z', 2.0);
          const tacZ = highDirSign > 0 ? cz + hr - 0.25 : cz - hr + 0.25;
          addBox(bTactile, width, 0.014, 0.45, cx, SIDEWALK_Y + 0.007, tacZ, 0, 0, 0, 1.0);
          const col = this._addCollider(cx - hw, STREET_GROUND_Y - 0.1, cz - hr, cx + hw, SIDEWALK_Y + 0.05, cz + hr, 'ramp', {
            isRamp: true, blocksWalk: true, blocksBullets: false
          });
          col.rampAxis = 'z';
          col.y0 = y0;
          col.y1 = y1;
        }
      };

      // Station Promenade Sidewalk Aprons (flanking station West & East between cross-streets)
      addSidewalkBlock(westInnerSwMinX, southCrossZ1, westInnerSwMaxX, northCrossZ0, 2.8, true);
      addSidewalkBlock(eastInnerSwMinX, southCrossZ1, eastInnerSwMaxX, northCrossZ0, 2.8, true);

      // Station North & South Platform-End Aprons connecting to level rail crossings (leaving track corridors clear!)
      const endSpans = Array.isArray(o.endApronSpans) && o.endApronSpans.length > 0
        ? o.endApronSpans
        : [[cMinX + 3.2, cMaxX]];
      const southApronZ0 = southCrossZ1;
      const southApronZ1 = platMinZ;
      const northApronZ0 = platMaxZ;
      const northApronZ1 = northCrossZ0;
      for (let ei = 0; ei < endSpans.length; ei++) {
        const sx0 = endSpans[ei][0];
        const sx1 = endSpans[ei][1];
        if (sx1 <= sx0 + 0.6) continue;
        if (southApronZ1 > southApronZ0 + 0.5) {
          addSidewalkBlock(sx0, southApronZ0, sx1, southApronZ1, 0.4, true);
        }
        if (northApronZ1 > northApronZ0 + 0.5) {
          addSidewalkBlock(sx0, northApronZ0, sx1, northApronZ1, 0.4, true);
        }
      }
      // At-grade ballast trough in the 6m gap between platform ends and z = ±74 level crossings
      for (const [gz0, gz1] of [[southCrossZ1, platMinZ], [platMaxZ, northCrossZ0]]) {
        if (gz1 <= gz0 + 0.4) continue;
        for (let t = 0; t < trackXs.length; t++) {
          const tx = trackXs[t];
          addBox(bCurb, 3.2, 0.08, gz1 - gz0, tx, -1.16, (gz0 + gz1) * 0.5, 0, 0, 0, 3.0);
          for (let sz = gz0 + 0.8; sz <= gz1 - 0.8; sz += 1.4) {
            addBox(bCurb, 2.25, 0.10, 0.24, tx, -1.09, sz, 0, 0, 0, 2.0);
          }
        }
      }

      // Outer Sidewalk Aprons North of z = +80 and South of z = -80 along station edges
      addSidewalkBlock(westInnerSwMinX, DIST_Z_MIN, westInnerSwMaxX, southCrossZ0, 2.6, true);
      addSidewalkBlock(eastInnerSwMinX, DIST_Z_MIN, eastInnerSwMaxX, southCrossZ0, 2.6, true);
      addSidewalkBlock(westInnerSwMinX, northCrossZ1, westInnerSwMaxX, DIST_Z_MAX, 2.6, true);
      addSidewalkBlock(eastInnerSwMinX, northCrossZ1, eastInnerSwMaxX, DIST_Z_MAX, 2.6, true);

      // Define Urban City Superblocks (West & East sides divided by E-W streets at z=-74, -24, +24, +74)
      const zSpans = [
        [DIST_Z_MIN, southCrossZ0],
        [southCrossZ1, midBranchA0],
        [midBranchA1, midBranchB0],
        [midBranchB1, northCrossZ0],
        [northCrossZ1, DIST_Z_MAX]
      ];
      const innerWestBlocks = [];
      const innerEastBlocks = [];
      const outerWestBlocks = [];
      const outerEastBlocks = [];

      for (let zi = 0; zi < zSpans.length; zi++) {
        const [bz0, bz1] = zSpans[zi];
        // Inner West block (between West Boulevard and West Collector)
        addSidewalkBlock(westColRoadMaxX, bz0, westOuterSwMaxX, bz1, 3.2, true);
        innerWestBlocks.push({ x0: westColRoadMaxX, z0: bz0, x1: westOuterSwMaxX, z1: bz1, zi });

        // Inner East block (between East Boulevard and East Collector)
        addSidewalkBlock(eastOuterSwMinX, bz0, eastColRoadMinX, bz1, 3.2, true);
        innerEastBlocks.push({ x0: eastOuterSwMinX, z0: bz0, x1: eastColRoadMinX, z1: bz1, zi });

        // Outer West & East skyline blocks
        addSidewalkBlock(DIST_X_MIN, bz0, westColRoadMinX, bz1, 3.0, true);
        outerWestBlocks.push({ x0: DIST_X_MIN, z0: bz0, x1: westColRoadMinX, z1: bz1, zi });
        addSidewalkBlock(eastColRoadMaxX, bz0, DIST_X_MAX, bz1, 3.0, true);
        outerEastBlocks.push({ x0: eastColRoadMaxX, z0: bz0, x1: DIST_X_MAX, z1: bz1, zi });
      }

      // Zebra Crosswalks & ADA Curb Ramps at all key pedestrian intersections!
      const westRoadCX = (westRoadMinX + westRoadMaxX) * 0.5;
      const eastRoadCX = (eastRoadMinX + eastRoadMaxX) * 0.5;

      // Crosswalks across Main West & East Boulevards at Concourse/Center (z = 0) & at Crossings (z = ±65.5, ±82.5)
      for (const cwZ of [-65.5, 0.0, 65.5, -82.5, 82.5]) {
        addZebraCrosswalk(westRoadCX, cwZ, BLVD_W - 2.4, true);
        addAdaCurbRamp(westOuterSwMaxX + 0.55, cwZ, 2.4, 1.15, 'x', -1);
        addAdaCurbRamp(westInnerSwMinX - 0.55, cwZ, 2.4, 1.15, 'x', 1);

        addZebraCrosswalk(eastRoadCX, cwZ, BLVD_W - 2.4, true);
        addAdaCurbRamp(eastInnerSwMaxX + 0.55, cwZ, 2.4, 1.15, 'x', -1);
        addAdaCurbRamp(eastOuterSwMinX - 0.55, cwZ, 2.4, 1.15, 'x', 1);
      }
      // Crosswalks across South & North E-W Cross Streets (z = ±74) along West & East sidewalks (clear of running rails!)
      for (const cz of [CROSSING_Z_SOUTH, CROSSING_Z_NORTH]) {
        addZebraCrosswalk(westInnerSwMinX + 2.5, cz, 9.6, false);
        addZebraCrosswalk(westOuterSwMaxX - 2.5, cz, 9.6, false);
        addZebraCrosswalk(eastInnerSwMaxX - 2.5, cz, 9.6, false);
        addZebraCrosswalk(eastOuterSwMinX + 2.5, cz, 9.6, false);
        // Clean asphalt pedestrian crosswalk strips immediately flanking the rail corridor edges
        addZebraCrosswalk(cMinX - 2.0, cz, 9.6, false);
        addZebraCrosswalk(cMaxX + 2.0, cz, 9.6, false);

        const zN = cz + CROSSING_HALF_W;
        const zS = cz - CROSSING_HALF_W;
        const rampXs = [westInnerSwMinX + 2.5, westOuterSwMaxX - 2.5, eastInnerSwMaxX - 2.5, eastOuterSwMinX + 2.5];
        for (let ei = 0; ei < endSpans.length; ei++) {
          rampXs.push((endSpans[ei][0] + endSpans[ei][1]) * 0.5);
        }
        for (let ri = 0; ri < rampXs.length; ri++) {
          const rx = rampXs[ri];
          addAdaCurbRamp(rx, zS - 0.55, 2.4, 1.15, 'z', -1);
          addAdaCurbRamp(rx, zN + 0.55, 2.4, 1.15, 'z', 1);
        }
      }
      // Crosswalks across mid-district branch street mouths (z = -24, z = +24)
      for (const bz of [-24.0, 24.0]) {
        addZebraCrosswalk(westOuterSwMaxX - 2.5, bz, 8.2, false);
        addZebraCrosswalk(eastOuterSwMinX + 2.5, bz, 8.2, false);
        addAdaCurbRamp(westOuterSwMaxX - 2.5, bz - 5.55, 2.2, 1.15, 'z', -1);
        addAdaCurbRamp(westOuterSwMaxX - 2.5, bz + 5.55, 2.2, 1.15, 'z', 1);
        addAdaCurbRamp(eastOuterSwMinX + 2.5, bz - 5.55, 2.2, 1.15, 'z', -1);
        addAdaCurbRamp(eastOuterSwMinX + 2.5, bz + 5.55, 2.2, 1.15, 'z', 1);
      }

      // =========================================================
      // 4. NON-SQUARE EXTRUDED JAKARTA ARCHITECTURE (NO BORING BOXES!)
      // =========================================================
      const self = this;
      const fireEscapePlacements = [];
      const airconPlacements = [];
      const facadeModulePlacements = [];

      const addExtrudedTier = (bucket, ptsXZ, yBot, height, tileM, emitCollider, tag) => {
        const ccw = ensureCCWShapeXZ(ptsXZ);
        const shape = makePolyShapeXZ(ccw);
        bucket.push(extrudeShapeXZ(shape, yBot, height, null, tileM || 4.5));
        if (emitCollider) {
          // Compute tight bounding box for AABB collider (or sub-boxes caller adds)
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (let i = 0; i < ccw.length; i++) {
            if (ccw[i][0] < minX) minX = ccw[i][0];
            if (ccw[i][0] > maxX) maxX = ccw[i][0];
            if (ccw[i][1] < minZ) minZ = ccw[i][1];
            if (ccw[i][1] > maxZ) maxZ = ccw[i][1];
          }
          self._addCollider(minX, yBot, minZ, maxX, yBot + height, maxZ, tag || 'building', {
            blocksWalk: true, blocksBullets: false // BVH handles exact non-square bullet hits!
          });
        }
      };

      // A) Indonesian 2-3 Story Ruko (Shophouse) Row with Ground Colonnade Arcade, Recessed Shopfronts & Pitched Roofs
      const buildRukoRow = (x0, z0, x1, z1, faceSide, bays, hasThreeFloors) => {
        // faceSide: 'east' (+X street face), 'west' (-X street face), 'south' (+Z), 'north' (-Z)
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minZ = Math.min(z0, z1);
        const maxZ = Math.max(z0, z1);
        const w = maxX - minX;
        const d = maxZ - minZ;
        const alongZ = faceSide === 'east' || faceSide === 'west';
        const bayCount = bays || Math.max(3, Math.floor((alongZ ? d : w) / 4.8));
        const baySpan = (alongZ ? d : w) / bayCount;
        const overhangDepth = 1.85;
        const gfH = 3.55;
        const ufH = hasThreeFloors ? 6.60 : 3.40;
        const baseY = SIDEWALK_Y - 0.04;

        for (let b = 0; b < bayCount; b++) {
          const b0 = (alongZ ? minZ : minX) + b * baySpan + 0.08;
          const b1 = b0 + baySpan - 0.16;
          const depthVar = (b % 2 === 1 ? -0.45 : 0.0);
          const hVar = (b % 3 === 0 ? 0.35 : 0.0);
          const wallBuck = b % 3 === 0 ? bFacadePlaster : (b % 3 === 1 ? bBrick : bFacadeModern);
          const roofBuck = b % 2 === 0 ? bRoofTerra : bRoofOchre;

          if (alongZ) {
            const frontX = faceSide === 'east' ? maxX : minX;
            const backX = faceSide === 'east' ? minX - depthVar : maxX + depthVar;
            const coreX0 = faceSide === 'east' ? Math.min(backX, frontX - overhangDepth) : frontX + overhangDepth;
            const coreX1 = faceSide === 'east' ? frontX - overhangDepth : Math.max(backX, frontX + overhangDepth);
            const colX = faceSide === 'east' ? frontX - 0.24 : frontX + 0.24;

            // Ground floor recessed shopfront core (leaves walkable colonnade under overhang!)
            const gfPts = [[coreX0, b0], [coreX1, b0], [coreX1, b1], [coreX0, b1]];
            addExtrudedTier(wallBuck, gfPts, baseY, gfH, 3.6, true, 'building');

            // Recessed glazed shopfront & wood fascia signage beam
            const shopFaceX = faceSide === 'east' ? coreX1 + 0.04 : coreX0 - 0.04;
            addBox(bGlass, 0.12, 2.55, baySpan - 0.85, shopFaceX, SIDEWALK_Y + 1.40, (b0 + b1) * 0.5, 0, 0, 0, 2.0);
            addBox(bDarkWood, 0.28, 0.58, baySpan - 0.2, colX, SIDEWALK_Y + gfH - 0.28, (b0 + b1) * 0.5, 0, 0, 0, 2.5);

            // Colonnade arcade columns supporting overhanging 2nd floor
            for (const cz of [b0 + 0.22, b1 - 0.22]) {
              addBox(bCurb, 0.34, gfH, 0.34, colX, baseY + gfH * 0.5, cz, 0, 0, 0, 2.0);
              self._addCollider(colX - 0.19, baseY, cz - 0.19, colX + 0.19, baseY + gfH, cz + 0.19, 'concrete', { blocksBullets: false });
            }

            // Upper 2nd/3rd story cantilevered out over colonnade + chamfered corner bay on end unit!
            const ufPts = (b === 0)
              ? [[Math.min(coreX0, frontX), b0 + 1.1], [Math.min(coreX0, frontX) + 1.1, b0], [Math.max(coreX1, frontX), b0], [Math.max(coreX1, frontX), b1], [Math.min(coreX0, frontX), b1]]
              : [[Math.min(coreX0, frontX), b0], [Math.max(coreX1, frontX), b0], [Math.max(coreX1, frontX), b1], [Math.min(coreX0, frontX), b1]];
            addExtrudedTier(wallBuck, ufPts, baseY + gfH, ufH + hVar, 3.8, true, 'building');

            // Upper recessed windows & metal balcony rail
            const winX = faceSide === 'east' ? frontX + 0.03 : frontX - 0.03;
            addBox(bGlass, 0.10, 1.55, baySpan * 0.62, winX, SIDEWALK_Y + gfH + 1.55, (b0 + b1) * 0.5, 0, 0, 0, 2.0);
            addBox(bSteelDark, 0.55, 0.90, baySpan * 0.72, faceSide === 'east' ? frontX + 0.24 : frontX - 0.24, SIDEWALK_Y + gfH + 0.55, (b0 + b1) * 0.5);

            // Hipped corrugated metal / terracotta roof
            const roofBaseY = baseY + gfH + ufH + hVar;
            addHippedRoof(roofBuck, Math.min(coreX0, frontX), b0, Math.max(coreX1, frontX), b1, roofBaseY, 1.75 + (b % 2) * 0.35, 0.48, 2.8);

            // Rooftop blue/steel water tank ("toren") & AC outdoor unit
            const torenX = (coreX0 + coreX1) * 0.5;
            addCylinder(bSteelDark, 0.45, 0.45, 1.10, 10, torenX, roofBaseY + 1.55, (b0 + b1) * 0.5);
            if (b % 2 === 0) {
              airconPlacements.push({
                x: faceSide === 'east' ? frontX + 0.18 : frontX - 0.18,
                y: SIDEWALK_Y + gfH + 0.55,
                z: (b0 + b1) * 0.5 + baySpan * 0.28,
                ry: faceSide === 'east' ? Math.PI * 0.5 : -Math.PI * 0.5
              });
            }
          } else {
            // Oriented along X facing North/South cross-street
            const frontZ = faceSide === 'south' ? maxZ : minZ;
            const backZ = faceSide === 'south' ? minZ - depthVar : maxZ + depthVar;
            const coreZ0 = faceSide === 'south' ? Math.min(backZ, frontZ - overhangDepth) : frontZ + overhangDepth;
            const coreZ1 = faceSide === 'south' ? frontZ - overhangDepth : Math.max(backZ, frontZ + overhangDepth);
            const colZ = faceSide === 'south' ? frontZ - 0.24 : frontZ + 0.24;

            addExtrudedTier(wallBuck, [[b0, coreZ0], [b1, coreZ0], [b1, coreZ1], [b0, coreZ1]], baseY, gfH, 3.6, true, 'building');
            const shopFaceZ = faceSide === 'south' ? coreZ1 + 0.04 : coreZ0 - 0.04;
            addBox(bGlass, baySpan - 0.85, 2.55, 0.12, (b0 + b1) * 0.5, SIDEWALK_Y + 1.40, shopFaceZ, 0, 0, 0, 2.0);
            addBox(bDarkWood, baySpan - 0.2, 0.58, 0.28, (b0 + b1) * 0.5, SIDEWALK_Y + gfH - 0.28, colZ, 0, 0, 0, 2.5);
            for (const cx of [b0 + 0.22, b1 - 0.22]) {
              addBox(bCurb, 0.34, gfH, 0.34, cx, baseY + gfH * 0.5, colZ, 0, 0, 0, 2.0);
              self._addCollider(cx - 0.19, baseY, colZ - 0.19, cx + 0.19, baseY + gfH, colZ + 0.19, 'concrete', { blocksBullets: false });
            }
            addExtrudedTier(wallBuck, [[b0, Math.min(coreZ0, frontZ)], [b1, Math.min(coreZ0, frontZ)], [b1, Math.max(coreZ1, frontZ)], [b0, Math.max(coreZ1, frontZ)]], baseY + gfH, ufH + hVar, 3.8, true, 'building');
            const winZ = faceSide === 'south' ? frontZ + 0.03 : frontZ - 0.03;
            addBox(bGlass, baySpan * 0.62, 1.55, 0.10, (b0 + b1) * 0.5, SIDEWALK_Y + gfH + 1.55, winZ, 0, 0, 0, 2.0);
            const roofBaseY = baseY + gfH + ufH + hVar;
            addHippedRoof(roofBuck, b0, Math.min(coreZ0, frontZ), b1, Math.max(coreZ1, frontZ), roofBaseY, 1.75, 0.48, 2.8);
          }
        }
      };

      // B) L-Shaped Sudirman Corporate Tower (non-square L-footprint + chamfered podium + marquee + spire)
      const buildLShapedTower = (x0, z0, x1, z1, cornerRot, totalH) => {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minZ = Math.min(z0, z1);
        const maxZ = Math.max(z0, z1);
        const w = maxX - minX;
        const d = maxZ - minZ;
        const armX = w * 0.52;
        const armZ = d * 0.52;
        const baseY = SIDEWALK_Y - 0.04;
        const podH = 7.2;

        // Build L polygon in XZ rotated by cornerRot (0..3)
        let lPts;
        let wingA, wingB;
        if (cornerRot === 0) {
          lPts = [[minX, minZ], [maxX, minZ], [maxX, minZ + armZ], [minX + armX, minZ + armZ], [minX + armX, maxZ], [minX, maxZ]];
          wingA = [minX, minZ, maxX, minZ + armZ];
          wingB = [minX, minZ + armZ, minX + armX, maxZ];
        } else if (cornerRot === 1) {
          lPts = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [maxX - armX, maxZ], [maxX - armX, minZ + armZ], [minX, minZ + armZ]];
          wingA = [minX, minZ, maxX, minZ + armZ];
          wingB = [maxX - armX, minZ + armZ, maxX, maxZ];
        } else if (cornerRot === 2) {
          lPts = [[minX, minZ], [minX + armX, minZ], [minX + armX, maxZ - armZ], [maxX, maxZ - armZ], [maxX, maxZ], [minX, maxZ]];
          wingA = [minX, maxZ - armZ, maxX, maxZ];
          wingB = [minX, minZ, minX + armX, maxZ - armZ];
        } else {
          lPts = [[maxX - armX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [minX, maxZ - armZ], [maxX - armX, maxZ - armZ]];
          wingA = [minX, maxZ - armZ, maxX, maxZ];
          wingB = [maxX - armX, minZ, maxX, maxZ - armZ];
        }

        // Recessed glazed lobby podium framed by solid corner piers + stone cornice (zero Z-fighting!)
        const lxMid = (minX + maxX) * 0.5;
        const lzMid = (minZ + maxZ) * 0.5;
        const insetTowardCenter = (pts, insetAmt) => pts.map(([px, pz]) => {
          const dx = lxMid - px;
          const dz = lzMid - pz;
          return [
            px + (Math.abs(dx) > 0.1 ? Math.sign(dx) * insetAmt : 0),
            pz + (Math.abs(dz) > 0.1 ? Math.sign(dz) * insetAmt : 0)
          ];
        });
        const podPts = insetTowardCenter(lPts, 0.55);
        addExtrudedTier(bGlass, podPts, baseY, podH - 0.7, 3.5, false, 'building');
        for (let ci = 0; ci < lPts.length; ci++) {
          const [cxp, czp] = lPts[ci];
          addBox(bCurb, 0.90, podH - 0.7, 0.90, cxp, baseY + (podH - 0.7) * 0.5, czp, 0, 0, 0, 2.0);
        }
        addExtrudedTier(bCurb, lPts, baseY + podH - 0.7, 0.85, 4.0, false, 'building');

        // Accurate 2-wing L-colliders (leaves the open L plaza corner walkable!)
        for (const wg of [wingA, wingB]) {
          self._addCollider(wg[0], baseY, wg[1], wg[2], baseY + totalH, wg[3], 'building', {
            blocksWalk: true, blocksBullets: false
          });
        }

        // Main L-shaped curtain-wall shaft + horizontal spandrel fins + stepped mechanical crown
        const shaftH = Math.max(12.0, totalH - podH - 0.15);
        const shaftPts = insetTowardCenter(lPts, 0.45);
        addExtrudedTier(bFacadeModern, shaftPts, baseY + podH + 0.15, shaftH, 5.0, false, 'building');

        // Horizontal architectural sun-shading fins every ~7m
        for (let fy = baseY + podH + 6.0; fy < baseY + totalH - 2.0; fy += 7.0) {
          addExtrudedTier(bTruss, lPts, fy, 0.28, 4.0, false);
        }

        // Stepped mechanical crown & aviation beacon
        const crownX = (wingA[0] + wingA[2]) * 0.5;
        const crownZ = (wingA[1] + wingA[3]) * 0.5;
        const cw = (wingA[2] - wingA[0]) * 0.55;
        const cd = (wingA[3] - wingA[1]) * 0.55;
        addExtrudedTier(bCurb, [
          [crownX - cw * 0.5, crownZ - cd * 0.5],
          [crownX + cw * 0.5, crownZ - cd * 0.5],
          [crownX + cw * 0.5, crownZ + cd * 0.5],
          [crownX - cw * 0.5, crownZ + cd * 0.5]
        ], baseY + totalH, 3.6, 3.0, false);
        addCylinder(bTruss, 0.08, 0.16, 6.5, 6, crownX, baseY + totalH + 6.8, crownZ);
        addBox(bAmber, 0.42, 0.42, 0.42, crownX, baseY + totalH + 10.1, crownZ);
      };

      // C) Chamfered Octagonal Landmark Tower (angled corners + stepped podium + curved canopy)
      const buildChamferedTower = (x0, z0, x1, z1, totalH) => {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minZ = Math.min(z0, z1);
        const maxZ = Math.max(z0, z1);
        const w = maxX - minX;
        const d = maxZ - minZ;
        const cx = (minX + maxX) * 0.5;
        const cz = (minZ + maxZ) * 0.5;
        const ch = Math.min(w, d) * 0.26;
        const baseY = SIDEWALK_Y - 0.04;

        const makeOct = (ox, oz, ow, od, oc) => [
          [ox - ow * 0.5 + oc, oz - od * 0.5],
          [ox + ow * 0.5 - oc, oz - od * 0.5],
          [ox + ow * 0.5, oz - od * 0.5 + oc],
          [ox + ow * 0.5, oz + od * 0.5 - oc],
          [ox + ow * 0.5 - oc, oz + od * 0.5],
          [ox - ow * 0.5 + oc, oz + od * 0.5],
          [ox - ow * 0.5, oz + od * 0.5 - oc],
          [ox - ow * 0.5, oz - od * 0.5 + oc]
        ];

        const podPts = makeOct(cx, cz, w, d, ch);
        const midPts = makeOct(cx, cz, w * 0.80, d * 0.80, ch * 0.9);
        const topPts = makeOct(cx, cz, w * 0.56, d * 0.56, ch * 0.7);

        addExtrudedTier(bCurb, podPts, baseY, 0.9, 4.0, true, 'building');
        addExtrudedTier(bGlass, makeOct(cx, cz, w * 0.94, d * 0.94, ch), baseY + 0.9, 3.5, 3.0, false);
        addExtrudedTier(bCurb, makeOct(cx, cz, w * 0.98, d * 0.98, ch), baseY + 4.4, 0.8, 4.0, false);
        addExtrudedTier(bFacadeModern, midPts, baseY + 5.2, totalH * 0.62, 4.8, false);
        addExtrudedTier(bGlass, makeOct(cx, cz, w * 0.74, d * 0.74, ch * 0.85), baseY + 5.2 + totalH * 0.62, totalH * 0.24, 4.0, false);
        addExtrudedTier(bFacadePlaster, topPts, baseY + 5.2 + totalH * 0.86, totalH * 0.14, 3.5, false);

        // Curved spline marquee canopy at street entry
        const marqShape = new THREE.Shape();
        marqShape.moveTo(0, 0);
        marqShape.quadraticCurveTo(1.6, 0.75, 3.2, 0.05);
        marqShape.lineTo(3.2, -0.18);
        marqShape.quadraticCurveTo(1.6, 0.50, 0, -0.22);
        marqShape.closePath();
        const marqGeo = new THREE.ExtrudeGeometry(marqShape, { depth: 7.0, bevelEnabled: false, curveSegments: 8 });
        marqGeo.translate(maxX - 0.4, SIDEWALK_Y + 3.6, cz - 3.5);
        bTruss.push(applyMetricUVs(marqGeo, 2.5));

        addBox(bAmber, 0.40, 0.40, 0.40, cx, baseY + totalH + 5.6, cz);
      };

      // D) U-Shaped Courtyard Complex (open walkable courtyard + fire escape + apartments facade + AC units)
      const buildUCourtyardComplex = (x0, z0, x1, z1, openSide, h) => {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minZ = Math.min(z0, z1);
        const maxZ = Math.max(z0, z1);
        const w = maxX - minX;
        const d = maxZ - minZ;
        const baseY = SIDEWALK_Y - 0.04;
        const wingT = Math.min(w, d) * 0.32;

        let uPts;
        let boxes;
        if (openSide === 'east') {
          uPts = [
            [minX, minZ], [maxX, minZ], [maxX, minZ + wingT], [minX + wingT, minZ + wingT],
            [minX + wingT, maxZ - wingT], [maxX, maxZ - wingT], [maxX, maxZ], [minX, maxZ]
          ];
          boxes = [
            [minX, minZ, minX + wingT, maxZ],
            [minX + wingT, minZ, maxX, minZ + wingT],
            [minX + wingT, maxZ - wingT, maxX, maxZ]
          ];
        } else {
          uPts = [
            [minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ],
            [minX, maxZ - wingT], [maxX - wingT, maxZ - wingT], [maxX - wingT, minZ + wingT], [minX, minZ + wingT]
          ];
          boxes = [
            [maxX - wingT, minZ, maxX, maxZ],
            [minX, minZ, maxX - wingT, minZ + wingT],
            [minX, maxZ - wingT, maxX - wingT, maxZ]
          ];
        }

        addExtrudedTier(bBrick, uPts, baseY, 3.4, 3.2, false);
        addExtrudedTier(bFacadePlaster, uPts, baseY + 3.4, Math.max(4.0, h - 3.4), 4.2, false, 'building');
        for (let bi = 0; bi < boxes.length; bi++) {
          const bx = boxes[bi];
          self._addCollider(bx[0], baseY, bx[1], bx[2], baseY + h, bx[3], 'building', {
            blocksWalk: true, blocksBullets: false
          });
          // Rooftop parapet trim + water tank seated cleanly on top of U-courtyard roof
          addBox(bCurb, bx[2] - bx[0] + 0.24, 0.55, bx[3] - bx[1] + 0.24, (bx[0] + bx[2]) * 0.5, baseY + h + 0.275, (bx[1] + bx[3]) * 0.5, 0, 0, 0, 3.0);
        }
        addCylinder(bSteelDark, 0.55, 0.55, 1.35, 10, (boxes[0][0] + boxes[0][2]) * 0.5, baseY + h + 0.9, (boxes[0][1] + boxes[0][3]) * 0.5);

        // Attach Poly Haven fire escape & apartment facade modules on exterior flank
        const wallX = openSide === 'east' ? minX : maxX;
        const wallZ = (minZ + maxZ) * 0.5;
        fireEscapePlacements.push({
          x: openSide === 'east' ? wallX - 0.65 : wallX + 0.65,
          y: SIDEWALK_Y + 0.2,
          z: wallZ,
          ry: openSide === 'east' ? -Math.PI * 0.5 : Math.PI * 0.5
        });
        facadeModulePlacements.push({
          x: openSide === 'east' ? maxX - wingT * 0.5 : minX + wingT * 0.5,
          y: SIDEWALK_Y,
          z: maxZ + 0.12,
          ry: 0
        });
        for (let az = minZ + 3.0; az <= maxZ - 3.0; az += 4.5) {
          airconPlacements.push({
            x: openSide === 'east' ? minX - 0.16 : maxX + 0.16,
            y: SIDEWALK_Y + 4.4,
            z: az,
            ry: openSide === 'east' ? -Math.PI * 0.5 : Math.PI * 0.5
          });
        }
      };

      // E) Diagonal / Trapezoidal Civic Podium with Terraced Roof
      const buildDiagonalCivic = (x0, z0, x1, z1, h) => {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minZ = Math.min(z0, z1);
        const maxZ = Math.max(z0, z1);
        const baseY = SIDEWALK_Y - 0.04;
        const skew = (maxX - minX) * 0.22;
        const trapPts = [
          [minX + skew, minZ],
          [maxX, minZ + skew * 0.6],
          [maxX - skew * 0.3, maxZ],
          [minX, maxZ - skew * 0.5]
        ];
        addExtrudedTier(bBrick, trapPts, baseY, 4.0, 3.5, true, 'building');
        const diagCX = (minX + maxX) * 0.5;
        const diagCZ = (minZ + maxZ) * 0.5;
        const glassTrap = trapPts.map(([px, pz]) => [
          diagCX + (px - diagCX) * 0.88,
          diagCZ + (pz - diagCZ) * 0.88
        ]);
        const midTrap = trapPts.map(([px, pz]) => [
          diagCX + (px - diagCX) * 0.90,
          diagCZ + (pz - diagCZ) * 0.90
        ]);
        addExtrudedTier(bGlass, glassTrap, baseY + 4.0, 2.5, 3.0, false);
        addExtrudedTier(bCurb, midTrap, baseY + 6.5, 0.45, 3.5, false);
        addExtrudedTier(bFacadeModern, midTrap, baseY + 6.95, Math.max(4.0, h - 6.95), 4.2, false);
        addHippedRoof(bRoofTerra, diagCX - (maxX - minX) * 0.42, diagCZ - (maxZ - minZ) * 0.42, diagCX + (maxX - minX) * 0.42, diagCZ + (maxZ - minZ) * 0.42, baseY + h, 2.2, 0.5, 3.0);
      };

      // Populate Inner West Blocks (facing West Boulevard)
      for (let i = 0; i < innerWestBlocks.length; i++) {
        const blk = innerWestBlocks[i];
        const bx0 = blk.x0 + 2.0;
        const bx1 = blk.x1 - 2.0;
        const bz0 = blk.z0 + 2.2;
        const bz1 = blk.z1 - 2.2;
        const midX = (bx0 + bx1) * 0.5;
        if (blk.zi === 0) {
          buildUCourtyardComplex(bx0, bz0, bx1, bz1, 'east', 14.5);
        } else if (blk.zi === 1) {
          buildRukoRow(midX + 1.5, bz0, bx1, bz1, 'east', 5, false);
          buildChamferedTower(bx0, bz0 + 1.5, midX - 0.5, bz1 - 1.5, 28.0);
        } else if (blk.zi === 2) {
          buildLShapedTower(bx0 + 1.0, bz0 + 1.0, bx1 - 1.0, bz1 - 1.0, 2, 34.0);
        } else if (blk.zi === 3) {
          buildRukoRow(midX + 1.5, bz0, bx1, bz1, 'east', 5, true);
          buildDiagonalCivic(bx0, bz0 + 1.0, midX - 0.5, bz1 - 1.0, 14.0);
        } else {
          buildChamferedTower(bx0 + 1.5, bz0 + 1.5, bx1 - 1.5, bz1 - 1.5, 24.0);
        }
      }

      // Populate Inner East Blocks (facing East Boulevard across from station!)
      for (let i = 0; i < innerEastBlocks.length; i++) {
        const blk = innerEastBlocks[i];
        const bx0 = blk.x0 + 2.0;
        const bx1 = blk.x1 - 2.0;
        const bz0 = blk.z0 + 2.2;
        const bz1 = blk.z1 - 2.2;
        const midX = (bx0 + bx1) * 0.5;
        if (blk.zi === 0) {
          buildLShapedTower(bx0 + 1.0, bz0 + 1.0, bx1 - 1.0, bz1 - 1.0, 0, 29.0);
        } else if (blk.zi === 1) {
          buildRukoRow(bx0, bz0, midX - 1.5, bz1, 'west', 5, true);
          buildLShapedTower(midX + 0.5, bz0 + 1.0, bx1, bz1 - 1.0, 1, 26.0);
        } else if (blk.zi === 2) {
          // Hero Block E3 directly across East Boulevard from Main Concourse Entrance:
          // Leave front 10m open as a walkable pocket plaza & build iconic Chamfered Tower + Café Ruko behind it!
          buildChamferedTower(bx0 + 9.0, bz0 + 1.5, bx1 - 0.5, bz1 - 8.5, 38.0);
          buildRukoRow(bx0 + 1.0, bz1 - 7.5, bx1 - 1.0, bz1, 'north', 4, false);
        } else if (blk.zi === 3) {
          buildUCourtyardComplex(bx0, bz0, bx1, bz1, 'west', 15.5);
        } else {
          buildDiagonalCivic(bx0 + 1.0, bz0 + 1.0, bx1 - 1.0, bz1 - 1.0, 18.0);
        }
      }

      // Populate Outer West & East Jakarta CBD Skyline Blocks (tall non-square towers!)
      const outerSets = [outerWestBlocks, outerEastBlocks];
      for (let s = 0; s < outerSets.length; s++) {
        const blks = outerSets[s];
        for (let i = 0; i < blks.length; i++) {
          const blk = blks[i];
          const bx0 = blk.x0 + 2.5;
          const bx1 = blk.x1 - 2.5;
          const bz0 = blk.z0 + 2.5;
          const bz1 = blk.z1 - 2.5;
          const h = (arch && arch.id === 'harjamukti' ? 18 : 32) + rng() * 26;
          const kind = (i + s) % 4;
          if (kind === 0) buildLShapedTower(bx0, bz0, bx1, bz1, (i + s) % 4, h);
          else if (kind === 1) buildChamferedTower(bx0, bz0, bx1, bz1, h);
          else if (kind === 2) buildUCourtyardComplex(bx0, bz0, bx1, bz1, s === 0 ? 'east' : 'west', Math.min(h, 22));
          else buildDiagonalCivic(bx0, bz0, bx1, bz1, Math.min(h, 24));
        }
      }

      // =========================================================
      // 5. RAIL CORRIDOR CHAINLINK FENCES, UTILITY POLES & CATENARY CABLES
      // =========================================================
      const fencePlacements = [];
      const pole1Placements = [];
      const pole2Placements = [];
      const lampPlacements = [];
      const carPlacements = [];
      const barrierPlacements = [];
      const hydrantPlacements = [];
      const manholePlacements = [];
      const powerBoxPlacements = [];
      const trashCanPlacements = [];
      const trashBagPlacements = [];
      const seatingPlacements = [];
      const planterPlacements = [];
      const pachiraPlacements = [[], [], [], []]; // 4 variants
      const shrub1Placements = [];
      const shrub2Placements = [[], [], [], []];
      const fernPlacements = [[], [], [], []];
      const calatheaPlacements = [[], [], []];
      const angsanaTransforms = [];

      // Rail right-of-way chainlink fences & concrete barriers guarding open track gaps (leaving z = ±74 level crossings & station plazas OPEN!)
      const fenceRuns = [
        { x: cMinX + 0.15, z0: southCrossZ1 + 1.5, z1: platMinZ - 2.5, ry: Math.PI * 0.5 },
        { x: cMinX + 0.15, z0: platMaxZ + 2.5, z1: northCrossZ0 - 1.5, ry: Math.PI * 0.5 },
        { x: cMaxX - 0.15, z0: southCrossZ1 + 1.5, z1: platMinZ - 2.5, ry: Math.PI * 0.5 },
        { x: cMaxX - 0.15, z0: platMaxZ + 2.5, z1: northCrossZ0 - 1.5, ry: Math.PI * 0.5 },
        { x: cMinX + 0.15, z0: -110, z1: southCrossZ0 - 1.5, ry: Math.PI * 0.5 },
        { x: cMaxX - 0.15, z0: -110, z1: southCrossZ0 - 1.5, ry: Math.PI * 0.5 },
        { x: cMinX + 0.15, z0: northCrossZ1 + 1.5, z1: 110, ry: Math.PI * 0.5 },
        { x: cMaxX - 0.15, z0: northCrossZ1 + 1.5, z1: 110, ry: Math.PI * 0.5 }
      ];
      for (let fr = 0; fr < fenceRuns.length; fr++) {
        const run = fenceRuns[fr];
        if (run.z1 <= run.z0 + 1.0) continue;
        // Leave 4m pedestrian crossing opening centered at track aprons if close to platform end
        for (let fz = run.z0 + 1.0; fz <= run.z1 - 1.0; fz += 2.0) {
          fencePlacements.push({ x: run.x, y: SIDEWALK_Y, z: fz, ry: run.ry, sy: 0.72 });
          addCylinder(bSteelDark, 0.045, 0.05, 1.80, 6, run.x, SIDEWALK_Y + 0.90, fz - 1.0);
        }
        addCylinder(bSteelDark, 0.045, 0.05, 1.80, 6, run.x, SIDEWALK_Y + 0.90, run.z1);
        addBox(bSteelDark, 0.06, 0.05, run.z1 - run.z0, run.x, SIDEWALK_Y + 1.76, (run.z0 + run.z1) * 0.5);
        this._addCollider(run.x - 0.14, SIDEWALK_Y, run.z0, run.x + 0.14, SIDEWALK_Y + 1.8, run.z1, 'metal', { blocksBullets: false });
        addBox(bCollHull, 0.12, 1.8, run.z1 - run.z0, run.x, SIDEWALK_Y + 0.9, (run.z0 + run.z1) * 0.5);
      }

      // Utility Poles (Jakarta PLN style) + Sagging Catenary Power Cables along West & East Sidewalks (avoiding ALL cross streets!)
      const poleRuns = [
        { x: westOuterSwMaxX - 0.95, ry: 0, zs: [-106, -84, -58, -33, -15, 15, 33, 58, 84, 106] },
        { x: eastOuterSwMinX + 0.95, ry: Math.PI, zs: [-106, -84, -58, -33, -15, 15, 33, 58, 84, 106] }
      ];
      const poleHeight = 6.8;
      for (let r = 0; r < poleRuns.length; r++) {
        const pr = poleRuns[r];
        for (let i = 0; i < pr.zs.length; i++) {
          const pz = pr.zs[i];
          const pl = { x: pr.x, y: SIDEWALK_Y, z: pz, ry: pr.ry };
          if (i % 2 === 0) pole1Placements.push(pl);
          else pole2Placements.push(pl);
          this._addCollider(pr.x - 0.22, SIDEWALK_Y, pz - 0.22, pr.x + 0.22, SIDEWALK_Y + poleHeight, pz + 0.22, 'metal', { blocksBullets: false });
          addCylinder(bCollHull, 0.12, 0.14, poleHeight, 6, pr.x, SIDEWALK_Y + poleHeight * 0.5, pz);

          // Catenary sagging cables to next pole
          if (i < pr.zs.length - 1) {
            const nz = pr.zs[i + 1];
            const span = nz - pz;
            const sag = Math.min(0.95, span * 0.032);
            const wireOffsets = [
              [-0.42, SIDEWALK_Y + 6.35],
              [0.0, SIDEWALK_Y + 6.35],
              [0.42, SIDEWALK_Y + 6.35],
              [0.0, SIDEWALK_Y + 5.05]
            ];
            for (let w = 0; w < wireOffsets.length; w++) {
              const wx = pr.x + wireOffsets[w][0];
              const wy = wireOffsets[w][1];
              const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(wx, wy, pz),
                new THREE.Vector3(wx, wy - sag * 0.72, pz + span * 0.25),
                new THREE.Vector3(wx, wy - sag, pz + span * 0.50),
                new THREE.Vector3(wx, wy - sag * 0.72, pz + span * 0.75),
                new THREE.Vector3(wx, wy, nz)
              ]);
              const tGeo = new THREE.TubeGeometry(curve, 10, 0.020, 4, false);
              bCables.push(prepGeo(tGeo, false));
            }
          }
        }
      }

      // Streetlamps along Boulevards & Level Crossings (pair 5 key lamps near station portals/crossings with pooled PointLights — NEVER toggle .visible!)
      const lampSpecs = [
        { x: eastInnerSwMaxX - 0.55, z: -66, ry: 0, lit: true },
        { x: eastInnerSwMaxX - 0.55, z: -20, ry: 0, lit: false },
        { x: eastInnerSwMaxX - 0.55, z: 0, ry: 0, lit: true },
        { x: eastInnerSwMaxX - 0.55, z: 20, ry: 0, lit: false },
        { x: eastInnerSwMaxX - 0.55, z: 66, ry: 0, lit: true },
        { x: westInnerSwMinX + 0.55, z: -66, ry: Math.PI, lit: true },
        { x: westInnerSwMinX + 0.55, z: -18, ry: Math.PI, lit: false },
        { x: westInnerSwMinX + 0.55, z: 18, ry: Math.PI, lit: false },
        { x: westInnerSwMinX + 0.55, z: 66, ry: Math.PI, lit: true },
        { x: eastOuterSwMinX + 0.55, z: -42, ry: 0, lit: false },
        { x: eastOuterSwMinX + 0.55, z: 42, ry: 0, lit: false },
        { x: westOuterSwMaxX - 0.55, z: -42, ry: Math.PI, lit: false },
        { x: westOuterSwMaxX - 0.55, z: 42, ry: Math.PI, lit: false },
        { x: cMinX - 1.5, z: CROSSING_Z_SOUTH - 6.8, ry: -Math.PI * 0.5, lit: false },
        { x: cMaxX + 1.5, z: CROSSING_Z_NORTH + 6.8, ry: Math.PI * 0.5, lit: false }
      ];
      for (let i = 0; i < lampSpecs.length; i++) {
        const ls = lampSpecs[i];
        lampPlacements.push({ x: ls.x, y: SIDEWALK_Y, z: ls.z, ry: ls.ry });
        this._addCollider(ls.x - 0.18, SIDEWALK_Y, ls.z - 0.18, ls.x + 0.18, SIDEWALK_Y + 4.8, ls.z + 0.18, 'metal', { blocksBullets: false });
        if (ls.lit && this.streetLights.length < 5) {
          const headX = ls.x + Math.cos(ls.ry) * 0.65;
          const headZ = ls.z - Math.sin(ls.ry) * 0.65;
          const baseInt = 3.6 * tubeIntensity;
          const ptLight = new THREE.PointLight(0xffa84c, baseInt, 28, 1.65);
          ptLight.position.set(headX, SIDEWALK_Y + 4.35, headZ);
          ptLight.visible = true; // NEVER toggle visible! Control strictly via intensity.
          ptLight.castShadow = false;
          root.add(ptLight);
          this.streetLights.push({
            light: ptLight,
            baseIntensity: 3.6,
            kind: 'streetlamp',
            flicker: i === 2 || i === 4
          });
        }
      }

      // Parked / Abandoned Covered Cars along Boulevard Lanes & Intersections (y = -1.00)
      const carSpecs = [
        { x: eastRoadCX - 3.6, z: -52, ry: 0.10 },
        { x: eastRoadCX + 3.8, z: -34, ry: Math.PI - 0.08 },
        { x: eastRoadCX + 3.4, z: 12, ry: Math.PI + 0.22 },
        { x: eastRoadCX - 3.2, z: 48, ry: -0.14 },
        { x: eastRoadCX + 2.8, z: -88, ry: 2.85 },
        { x: westRoadCX + 3.5, z: -46, ry: Math.PI + 0.12 },
        { x: westRoadCX - 3.6, z: -12, ry: -0.06 },
        { x: westRoadCX + 3.2, z: 36, ry: Math.PI - 0.18 },
        { x: westRoadCX - 3.4, z: 88, ry: 0.25 },
        { x: (eastOuterSwMaxX + eastColRoadMinX) * 0.5, z: -24.5, ry: Math.PI * 0.5 + 0.12 },
        { x: (westColRoadMaxX + westOuterSwMinX) * 0.5, z: 24.2, ry: -Math.PI * 0.5 - 0.15 }
      ];
      for (let i = 0; i < carSpecs.length; i++) {
        const cs = carSpecs[i];
        carPlacements.push({ x: cs.x, y: STREET_GROUND_Y, z: cs.z, ry: cs.ry });
        const cos = Math.abs(Math.cos(cs.ry));
        const sin = Math.abs(Math.sin(cs.ry));
        const hx = cos * 0.92 + sin * 2.22;
        const hz = sin * 0.92 + cos * 2.22;
        this._addCollider(cs.x - hx, STREET_GROUND_Y, cs.z - hz, cs.x + hx, STREET_GROUND_Y + 1.68, cs.z + hz, 'metal', {
          blocksWalk: true, blocksBullets: false
        });
        // Add 2-tier car collision hull to BVH mesh (chassis + cabin)
        addBox(bCollHull, 1.80, 0.82, 4.36, cs.x, STREET_GROUND_Y + 0.41, cs.z, 0, cs.ry, 0);
        addBox(bCollHull, 1.62, 0.78, 2.30, cs.x, STREET_GROUND_Y + 1.20, cs.z, 0, cs.ry, 0);
      }

      // Concrete Road Barriers (checkpoint roadblocks near intersections, leaving walkable paths open!)
      const barrierSpecs = [
        { x: eastRoadCX - 4.2, z: -69.5, ry: 0.15 },
        { x: eastRoadCX - 2.4, z: -69.2, ry: -0.08 },
        { x: eastRoadCX + 3.2, z: 69.5, ry: 0.12 },
        { x: westRoadCX - 3.5, z: -69.4, ry: -0.12 },
        { x: westRoadCX + 3.0, z: 69.4, ry: 0.08 },
        { x: eastInnerSwMaxX - 1.0, z: -11.5, ry: Math.PI * 0.5 },
        { x: eastInnerSwMaxX - 1.0, z: 11.5, ry: Math.PI * 0.5 }
      ];
      for (let i = 0; i < barrierSpecs.length; i++) {
        const bs = barrierSpecs[i];
        const onSw = Math.abs(bs.x - (eastInnerSwMaxX - 1.0)) < 0.2;
        const by = onSw ? SIDEWALK_Y : STREET_GROUND_Y;
        barrierPlacements.push({ x: bs.x, y: by, z: bs.z, ry: bs.ry });
        const cos = Math.abs(Math.cos(bs.ry));
        const sin = Math.abs(Math.sin(bs.ry));
        const hx = cos * 0.78 + sin * 0.34;
        const hz = sin * 0.78 + cos * 0.34;
        this._addCollider(bs.x - hx, by, bs.z - hz, bs.x + hx, by + 0.85, bs.z + hz, 'concrete', {
          blocksWalk: true, blocksBullets: false
        });
        addBox(bCollHull, 1.56, 0.85, 0.66, bs.x, by + 0.425, bs.z, 0, bs.ry, 0);
      }

      // Physical Quarantine Roadblocks across Boulevard, Collector & Sidewalk ends at z = ±116.5
      const roadblockZs = [-116.5, 116.5];
      for (let rzi = 0; rzi < roadblockZs.length; rzi++) {
        const rz = roadblockZs[rzi];
        const carSide = rzi === 0 ? 1 : -1;
        // West Boulevard roadblock
        for (let bx = westRoadMinX + 1.2; bx <= westRoadMaxX - 1.0; bx += 2.05) {
          barrierPlacements.push({ x: bx, y: STREET_GROUND_Y, z: rz, ry: 0 });
        }
        carPlacements.push({ x: westRoadCX + 2.5 * carSide, y: STREET_GROUND_Y, z: rz + 0.8 * carSide, ry: 0.35 * carSide });
        addBox(bAmber, 0.22, 0.24, 0.22, westRoadMinX + 1.2, STREET_GROUND_Y + 0.96, rz);
        addBox(bAmber, 0.22, 0.24, 0.22, westRoadMaxX - 1.2, STREET_GROUND_Y + 0.96, rz);

        // West Collector Road roadblock
        for (let bx = westColRoadMinX + 1.1; bx <= westColRoadMaxX - 1.0; bx += 2.05) {
          barrierPlacements.push({ x: bx, y: STREET_GROUND_Y, z: rz, ry: 0 });
        }
        addBox(bAmber, 0.22, 0.24, 0.22, (westColRoadMinX + westColRoadMaxX) * 0.5, STREET_GROUND_Y + 0.96, rz);

        // West sidewalks fence runs
        for (let fx = westInnerSwMinX + 1.2; fx <= westInnerSwMaxX - 0.5; fx += 2.4) {
          fencePlacements.push({ x: fx, y: SIDEWALK_Y, z: rz, ry: 0 });
        }
        for (let fx = westOuterSwMinX + 1.2; fx <= westOuterSwMaxX - 0.5; fx += 2.4) {
          fencePlacements.push({ x: fx, y: SIDEWALK_Y, z: rz, ry: 0 });
        }

        // East Boulevard roadblock
        for (let bx = eastRoadMinX + 1.2; bx <= eastRoadMaxX - 1.0; bx += 2.05) {
          barrierPlacements.push({ x: bx, y: STREET_GROUND_Y, z: rz, ry: 0 });
        }
        carPlacements.push({ x: eastRoadCX - 2.5 * carSide, y: STREET_GROUND_Y, z: rz + 0.8 * carSide, ry: -0.32 * carSide });
        addBox(bAmber, 0.22, 0.24, 0.22, eastRoadMinX + 1.2, STREET_GROUND_Y + 0.96, rz);
        addBox(bAmber, 0.22, 0.24, 0.22, eastRoadMaxX - 1.2, STREET_GROUND_Y + 0.96, rz);

        // East Collector Road roadblock
        for (let bx = eastColRoadMinX + 1.1; bx <= eastColRoadMaxX - 1.0; bx += 2.05) {
          barrierPlacements.push({ x: bx, y: STREET_GROUND_Y, z: rz, ry: 0 });
        }
        addBox(bAmber, 0.22, 0.24, 0.22, (eastColRoadMinX + eastColRoadMaxX) * 0.5, STREET_GROUND_Y + 0.96, rz);

        // East sidewalks fence runs
        for (let fx = eastInnerSwMinX + 1.2; fx <= eastInnerSwMaxX - 0.5; fx += 2.4) {
          fencePlacements.push({ x: fx, y: SIDEWALK_Y, z: rz, ry: 0 });
        }
        for (let fx = eastOuterSwMinX + 1.2; fx <= eastOuterSwMaxX - 0.5; fx += 2.4) {
          fencePlacements.push({ x: fx, y: SIDEWALK_Y, z: rz, ry: 0 });
        }
      }

      // Outer West & East cross-street exits at DIST_X_MIN and DIST_X_MAX
      const crossExits = [
        [southCrossZ0, southCrossZ1],
        [midBranchA0, midBranchA1],
        [midBranchB0, midBranchB1],
        [northCrossZ0, northCrossZ1]
      ];
      for (let ci = 0; ci < crossExits.length; ci++) {
        const [cz0, cz1] = crossExits[ci];
        const midZ = (cz0 + cz1) * 0.5;
        for (let bz = cz0 + 1.2; bz <= cz1 - 1.0; bz += 2.05) {
          barrierPlacements.push({ x: DIST_X_MIN + 0.8, y: STREET_GROUND_Y, z: bz, ry: Math.PI * 0.5 });
          barrierPlacements.push({ x: DIST_X_MAX - 0.8, y: STREET_GROUND_Y, z: bz, ry: -Math.PI * 0.5 });
        }
        fencePlacements.push({ x: DIST_X_MIN + 0.4, y: STREET_GROUND_Y, z: midZ - 2.2, ry: Math.PI * 0.5 });
        fencePlacements.push({ x: DIST_X_MIN + 0.4, y: STREET_GROUND_Y, z: midZ + 2.2, ry: Math.PI * 0.5 });
        fencePlacements.push({ x: DIST_X_MAX - 0.4, y: STREET_GROUND_Y, z: midZ - 2.2, ry: -Math.PI * 0.5 });
        fencePlacements.push({ x: DIST_X_MAX - 0.4, y: STREET_GROUND_Y, z: midZ + 2.2, ry: -Math.PI * 0.5 });
        addBox(bAmber, 0.22, 0.24, 0.22, DIST_X_MIN + 0.8, STREET_GROUND_Y + 0.96, midZ);
        addBox(bAmber, 0.22, 0.24, 0.22, DIST_X_MAX - 0.8, STREET_GROUND_Y + 0.96, midZ);
      }

      // Rail Corridor Security Gates at z = ±108.0 (x in [cMinX .. cMaxX])
      const railGateZs = [-108.0, 108.0];
      for (let gi = 0; gi < railGateZs.length; gi++) {
        const gz = railGateZs[gi];
        addBox(bSteelDark, 0.6, 5.8, 0.6, cMinX + 0.3, RAIL_TOP_Y + 2.9, gz);
        addBox(bSteelDark, 0.6, 5.8, 0.6, cMaxX - 0.3, RAIL_TOP_Y + 2.9, gz);
        addBox(bSteelDark, (cMaxX - cMinX), 0.5, 0.6, (cMinX + cMaxX) * 0.5, RAIL_TOP_Y + 5.5, gz);
        addBox(bAmber, 0.26, 0.26, 0.26, cMinX + 0.3, RAIL_TOP_Y + 5.95, gz);
        addBox(bAmber, 0.26, 0.26, 0.26, cMaxX - 0.3, RAIL_TOP_Y + 5.95, gz);

        const gateGroup = new THREE.Group();
        gateGroup.position.set(0, 0, gz);
        const spanW = (cMaxX - cMinX) - 0.7;
        const gateMesh = new THREE.Mesh(
          new THREE.BoxGeometry(spanW, 2.8, 0.26),
          matSteelDark
        );
        gateMesh.position.set((cMinX + cMaxX) * 0.5, RAIL_TOP_Y + 1.4, 0);
        gateMesh.castShadow = true;
        gateMesh.receiveShadow = true;
        gateGroup.add(gateMesh);
        this.disposableGeometries.push(gateMesh.geometry);
        root.add(gateGroup);

        const col = this._addCollider(cMinX, RAIL_TOP_Y, gz - 0.35, cMaxX, RAIL_TOP_Y + 3.5, gz + 0.35, 'metal', {
          blocksWalk: true,
          blocksBullets: false
        });
        col.isTrackGate = true;
        this.trackGates.push({ group: gateGroup, gateMesh, collider: col, z: gz });
      }

      // Sidewalk Street Furniture & Details (Hydrants, Manholes, Power Boxes, Trash Cans, Trash Bags, Benches, Planters, CoffeeCart)
      for (const hz of [-54, -14, 14, 54]) {
        hydrantPlacements.push({ x: eastOuterSwMinX + 0.7, y: SIDEWALK_Y, z: hz, ry: -Math.PI * 0.5 });
        hydrantPlacements.push({ x: westOuterSwMaxX - 0.7, y: SIDEWALK_Y, z: hz + 6, ry: Math.PI * 0.5 });
        manholePlacements.push({ x: eastRoadCX - 1.8, y: STREET_GROUND_Y + 0.01, z: hz + 4, ry: 0 });
        manholePlacements.push({ x: westRoadCX + 1.8, y: STREET_GROUND_Y + 0.01, z: hz - 4, ry: 0 });
        powerBoxPlacements.push({ x: eastOuterSwMinX + 4.4, y: SIDEWALK_Y + 1.35, z: hz - 5, ry: -Math.PI * 0.5 });
        trashCanPlacements.push({ x: eastInnerSwMaxX - 0.85, y: SIDEWALK_Y, z: hz + 3, ry: 0 });
        trashCanPlacements.push({ x: westInnerSwMinX + 0.85, y: SIDEWALK_Y, z: hz - 3, ry: Math.PI });
        trashBagPlacements.push({ x: eastInnerSwMaxX - 1.45, y: SIDEWALK_Y, z: hz + 3.4, ry: rng() * 3 });
        trashBagPlacements.push({ x: eastOuterSwMinX + 1.2, y: SIDEWALK_Y, z: hz + 0.6, ry: rng() * 3 });
      }

      // East Pocket Park Plaza (Block E3 front apron at z in [-14..+6], x = eastOuterSwMinX + 1.5..+7.5)
      const parkX = eastOuterSwMinX + 4.2;
      for (const pz of [-9.5, -3.5, 3.5]) {
        seatingPlacements.push({ x: parkX, y: SIDEWALK_Y, z: pz, ry: -Math.PI * 0.5 });
        this._addCollider(parkX - 0.45, SIDEWALK_Y, pz - 0.95, parkX + 0.45, SIDEWALK_Y + 0.85, pz + 0.95, 'wood', { blocksBullets: false });
        planterPlacements.push({ x: parkX - 1.8, y: SIDEWALK_Y, z: pz + 1.8, ry: Math.PI * 0.5 });
      }

      // Lush Tropical Jakarta Trees & Foliage (Non-blob procedural Angsana + Poly Haven glTF plants!)
      const treeSpots = [
        [eastInnerSwMaxX - 1.2, -52], [eastInnerSwMaxX - 1.2, -30], [eastInnerSwMaxX - 1.2, 30], [eastInnerSwMaxX - 1.2, 52],
        [westInnerSwMinX + 1.2, -52], [westInnerSwMinX + 1.2, -30], [westInnerSwMinX + 1.2, 30], [westInnerSwMinX + 1.2, 52],
        [eastOuterSwMinX + 1.4, -60], [eastOuterSwMinX + 1.4, -36], [eastOuterSwMinX + 1.4, 36], [eastOuterSwMinX + 1.4, 60],
        [westOuterSwMaxX - 1.4, -60], [westOuterSwMaxX - 1.4, -36], [westOuterSwMaxX - 1.4, 36], [westOuterSwMaxX - 1.4, 60],
        [parkX + 2.0, -11.5], [parkX + 2.0, 5.2], [eastOuterSwMinX + 1.6, -90], [westOuterSwMaxX - 1.6, 90]
      ];
      for (let t = 0; t < treeSpots.length; t++) {
        const [tx, tz] = treeSpots[t];
        const ts = 1.05 + rng() * 0.42;
        angsanaTransforms.push({ x: tx, y: SIDEWALK_Y, z: tz, ry: rng() * Math.PI * 2, sx: ts, sy: ts * (0.95 + rng() * 0.25), sz: ts });
        this._addCollider(tx - 0.28, SIDEWALK_Y, tz - 0.28, tx + 0.28, SIDEWALK_Y + 3.5, tz + 0.28, 'wood', { blocksBullets: false });
        addCylinder(bCollHull, 0.20, 0.26, 3.2, 6, tx, SIDEWALK_Y + 1.6, tz);

        // Understory Poly Haven tropical shrubs & ferns nestled in tree pits!
        const vP = t % 4;
        pachiraPlacements[vP].push({ x: tx + (rng() - 0.5) * 1.4, y: SIDEWALK_Y, z: tz + 1.35, ry: rng() * Math.PI * 2, sx: 1, sy: 1, sz: 1 });
        shrub2Placements[vP].push({ x: tx + (rng() - 0.5) * 0.9, y: SIDEWALK_Y, z: tz - 1.15, ry: rng() * Math.PI * 2 });
        fernPlacements[vP].push({ x: tx + 0.75, y: SIDEWALK_Y, z: tz + 0.55, ry: rng() * Math.PI * 2 });
        calatheaPlacements[t % 3].push({ x: tx - 0.7, y: SIDEWALK_Y, z: tz - 0.4, ry: rng() * Math.PI * 2 });
      }
      // Median/park hedge strips
      for (const pz of [-8.0, -2.0, 2.0, 8.0]) {
        shrub1Placements.push({ x: eastOuterSwMinX + 0.9, y: SIDEWALK_Y, z: pz, ry: Math.PI * 0.5 });
      }

      // =========================================================
      // 6. MERGE STATIC BUCKETS & COMPUTE MESH BVHs
      // =========================================================
      this._mergeAndRegisterBVH(bAsphalt, matAsphalt, false, true, 'CityRoads', true);
      this._mergeAndRegisterBVH(bSidewalk, matSidewalk, false, true, 'CitySidewalks', true);
      this._mergeAndRegisterBVH(bCurb, matCurb, true, true, 'CityCurbsAndCrossings', true);
      this._mergeAndRegisterBVH(bTactile, matTactile, false, true, 'CityTactile', false);
      this._mergeAndRegisterBVH(bWhiteMark, matMarkWhite, false, true, 'CityMarkingsWhite', false);
      this._mergeAndRegisterBVH(bYellowMark, matMarkYellow, false, true, 'CityMarkingsYellow', false);

      // 4-Quadrant Spatial Sector Partitioning for Building Geometry Frustum Culling
      const splitBucketByQuadrant = (bucket) => {
        const quads = { NW: [], NE: [], SW: [], SE: [] };
        for (let i = 0; i < bucket.length; i++) {
          const geo = bucket[i];
          if (!geo.boundingBox) geo.computeBoundingBox();
          const cx = (geo.boundingBox.min.x + geo.boundingBox.max.x) * 0.5;
          const cz = (geo.boundingBox.min.z + geo.boundingBox.max.z) * 0.5;
          const q = (cx < 0) ? (cz < 0 ? 'NW' : 'SW') : (cz < 0 ? 'NE' : 'SE');
          quads[q].push(geo);
        }
        return quads;
      };

      const mergeBuildingQuad = (bucket, mat, castShadow, receiveShadow, name, quadKey) => {
        if (!bucket || bucket.length === 0) return null;
        const merged = THREE_UTILS.mergeGeometries(bucket, false);
        for (let i = 0; i < bucket.length; i++) bucket[i].dispose();
        if (!merged) return null;
        if (typeof merged.computeBoundsTree === 'function') {
          merged.computeBoundsTree();
        } else if (window.MeshBVH && typeof window.MeshBVH.computeBoundsTree === 'function') {
          window.MeshBVH.computeBoundsTree.call(merged);
        }
        if (!merged.boundingBox) merged.computeBoundingBox();
        this.disposableGeometries.push(merged);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = !!castShadow;
        mesh.receiveShadow = !!receiveShadow;
        mesh.name = `${name}_${quadKey}`;
        this.quadrants[quadKey].add(mesh);
        this.bvhMeshes.push(mesh);
        return mesh;
      };

      const qFacadeModern = splitBucketByQuadrant(bFacadeModern);
      const qFacadePlaster = splitBucketByQuadrant(bFacadePlaster);
      const qBrick = splitBucketByQuadrant(bBrick);
      const qDarkWood = splitBucketByQuadrant(bDarkWood);
      const qRoofTerra = splitBucketByQuadrant(bRoofTerra);
      const qRoofOchre = splitBucketByQuadrant(bRoofOchre);
      const qGlass = splitBucketByQuadrant(bGlass);

      for (const q of ['NW', 'NE', 'SW', 'SE']) {
        mergeBuildingQuad(qFacadeModern[q], matFacadeModern, true, true, 'CityBuildingsModern', q);
        mergeBuildingQuad(qFacadePlaster[q], matFacadePlaster, true, true, 'CityBuildingsPlaster', q);
        mergeBuildingQuad(qBrick[q], matBrick, true, true, 'CityBuildingsBrick', q);
        mergeBuildingQuad(qDarkWood[q], matDarkWood, true, true, 'CityRukoWood', q);
        mergeBuildingQuad(qRoofTerra[q], matRoofTerra, true, true, 'CityRoofsTerra', q);
        mergeBuildingQuad(qRoofOchre[q], matRoofOchre, true, true, 'CityRoofsOchre', q);
        mergeBuildingQuad(qGlass[q], matGlassBldg, false, true, 'CityBuildingGlass', q);
      }

      this._mergeAndRegisterBVH(bSteelDark, matSteelDark, true, true, 'CitySteelDark', true);
      this._mergeAndRegisterBVH(bTruss, matTruss, true, true, 'CityTrimMetal', true);
      this._mergeAndRegisterBVH(bJpo, matJpo, true, true, 'CityCrossGates', true);
      this._mergeAndRegisterBVH(bAmber, matAmber, false, false, 'CityBeacons', false);
      this._mergeAndRegisterBVH(bCables, matSteelDark, false, false, 'CityPowerCables', false);
      this._mergeAndRegisterBVH(bCollHull, matInvisColl, false, false, 'CityPropCollisionHull', true);

      // Non-blob procedural Angsana Street Trees (cached assets, split into 4 quadrants, leaf castShadow = false)
      if (angsanaTransforms.length > 0) {
        const treeParts = getCachedAngsanaTreeParts();
        const matLeaf = getCachedAngsanaLeafMaterial();

        const qTrees = { NW: [], NE: [], SW: [], SE: [] };
        for (let i = 0; i < angsanaTransforms.length; i++) {
          const t = angsanaTransforms[i];
          const q = (t.x < 0) ? (t.z < 0 ? 'NW' : 'SW') : (t.z < 0 ? 'NE' : 'SE');
          qTrees[q].push(t);
        }

        for (const q of ['NW', 'NE', 'SW', 'SE']) {
          const list = qTrees[q];
          if (list.length === 0) continue;

          const barkInst = new THREE.InstancedMesh(treeParts.barkGeo, matDarkWood, list.length);
          barkInst.castShadow = true;
          barkInst.receiveShadow = true;
          barkInst.name = `AngsanaBark_${q}`;

          const leafInst = new THREE.InstancedMesh(treeParts.leafGeo, matLeaf, list.length);
          leafInst.castShadow = false; // Pruned shadow caster!
          leafInst.receiveShadow = true;
          leafInst.name = `AngsanaLeaf_${q}`;

          for (let i = 0; i < list.length; i++) {
            const t = list[i];
            _tmpDummy.position.set(t.x, t.y, t.z);
            _tmpDummy.rotation.set(0, t.ry, 0);
            _tmpDummy.scale.set(t.sx, t.sy, t.sz);
            _tmpDummy.updateMatrix();
            barkInst.setMatrixAt(i, _tmpDummy.matrix);
            leafInst.setMatrixAt(i, _tmpDummy.matrix);
          }
          barkInst.instanceMatrix.needsUpdate = true;
          leafInst.instanceMatrix.needsUpdate = true;
          if (typeof barkInst.computeBoundingBox === 'function') barkInst.computeBoundingBox();
          if (typeof leafInst.computeBoundingBox === 'function') leafInst.computeBoundingBox();
          if (typeof barkInst.computeBoundingSphere === 'function') barkInst.computeBoundingSphere();
          if (typeof leafInst.computeBoundingSphere === 'function') leafInst.computeBoundingSphere();

          this.quadrants[q].add(barkInst);
          this.quadrants[q].add(leafInst);
        }
      }

      // Distant Jakarta CBD Skyline Silhouette Ring (outside ±132m, 140m–220m radius)
      // 1 shared low-poly material, no colliders, no shadows, leaving [cMinX - 9 .. cMaxX + 9] rail corridor clear
      const matSkyline = this._getMat('citySkylineDistant', null, {
        color: 0x141f2b,
        roughness: 0.95,
        metalness: 0.05
      });
      const bSkyline = [];
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

      if (bSkyline.length > 0) {
        const geoSkyline = THREE_UTILS.mergeGeometries(bSkyline, false);
        for (let i = 0; i < bSkyline.length; i++) bSkyline[i].dispose();
        if (geoSkyline) {
          this.disposableGeometries.push(geoSkyline);
          const meshSkyline = new THREE.Mesh(geoSkyline, matSkyline);
          meshSkyline.castShadow = false;
          meshSkyline.receiveShadow = false;
          meshSkyline.name = 'CitySkylineSilhouetteRing';
          root.add(meshSkyline);
        }
      }

      // =========================================================
      // 7. INSTANCED & PLACED POLY HAVEN .GLTF STREET MODELS
      // =========================================================
      const protoLamp = this._extractModelProto('street_lamp_01', 4.8, null, { x: 0, y: 0, z: 0 });
      const protoCar = this._extractModelProto('covered_car', 1.65);
      const protoBarrier = this._extractModelProto('concrete_road_barrier', 0.85);
      const protoFence = this._extractModelProto('modular_chainlink_fence', 2.35,
        (n) => n.name === 'modular_chainlink_fence_double',
        { x: -1.0, y: 0, z: 0.02 }
      );
      const protoPole1 = this._extractModelProto('modular_electricity_poles', 6.8,
        (n) => (n.name || '').startsWith('preset_01_'),
        { x: -2.5, y: 0, z: 0 }
      );
      const protoPole2 = this._extractModelProto('modular_electricity_poles', 6.8,
        (n) => (n.name || '').startsWith('preset_02_'),
        { x: -4.5, y: 0, z: 0 }
      );
      const protoHydrant = this._extractModelProto('fire_hydrant', 0.82,
        (n) => (n.name || '').indexOf('_aged') === -1
      );
      const protoManhole = this._extractModelProto('water_manhole_cover', 0.06);
      const protoPowerBox = this._extractModelProto('power_box_01', 0.55);
      const protoTrashCan = this._extractModelProto('metal_trash_can', 0.92,
        (n) => (n.name || '').indexOf('_rust') === -1
      );
      const protoTrashBag = this._extractModelProto('trashbag', 0.58);
      const protoBench = this._extractModelProto('modular_street_seating', 0.82,
        (n) => /^(seat|seat_back|crossbar|back_support|arm_rest|legs_|suspended_support_01)/.test(n.name || '') && (n.name || '') !== 'seat_bench'
      );
      const protoPlanter = this._extractModelProto('planter_box_01', 0.45);
      const protoAircon = this._extractModelProto('exterior_aircon_unit', 0.82,
        (n) => n.name === 'exterior_aircon_unit'
      );
      const protoFireEscape = this._extractModelProto('modular_fire_escape', 8.2,
        (n) => n.name !== 'modular_fire_escape_ladder_bottom'
      );
      const protoFacadeMod = this._extractModelProto('modular_urban_apartments_facade', 4.0,
        (n) => /^(wall_door_centered_large_01|door_centered_large_01|dado_door_centered_large_01)$/.test(n.name || '')
      );
      const protoCoffeeCart = this._extractModelProto('CoffeeCart_01', 1.85);
      const protoShrub1 = this._extractModelProto('shrub_01', 0.55);

      this._emitInstancedProto(protoLamp, lampPlacements, true, false, 'StreetLamp');
      this._emitInstancedProto(protoCar, carPlacements, true, true, 'CoveredCar');
      this._emitInstancedProto(protoBarrier, barrierPlacements, false, true, 'RoadBarrier');
      this._emitInstancedProto(protoFence, fencePlacements, false, false, 'ChainlinkFence');
      this._emitInstancedProto(protoPole1, pole1Placements, true, false, 'PowerPoleA');
      this._emitInstancedProto(protoPole2, pole2Placements, true, false, 'PowerPoleB');
      this._emitInstancedProto(protoHydrant, hydrantPlacements, false, true, 'FireHydrant');
      this._emitInstancedProto(protoManhole, manholePlacements, false, true, 'ManholeCover');
      this._emitInstancedProto(protoPowerBox, powerBoxPlacements, false, true, 'PowerBox');
      this._emitInstancedProto(protoTrashCan, trashCanPlacements, false, true, 'TrashCan');
      this._emitInstancedProto(protoTrashBag, trashBagPlacements, false, true, 'TrashBag');
      this._emitInstancedProto(protoBench, seatingPlacements, false, true, 'StreetBench');
      this._emitInstancedProto(protoPlanter, planterPlacements, false, true, 'PlanterBox');
      this._emitInstancedProto(protoAircon, airconPlacements, false, true, 'AirconUnit');
      this._emitInstancedProto(protoFireEscape, fireEscapePlacements, true, true, 'FireEscape');
      this._emitInstancedProto(protoFacadeMod, facadeModulePlacements, true, true, 'FacadeModule');
      this._emitInstancedProto(protoShrub1, shrub1Placements, false, true, 'ShrubHedge');

      // CoffeeCart_01 vendor cart on East Concourse outer promenade plaza
      this._placeSingleProto(protoCoffeeCart, eastInnerSwMinX + 4.4, SIDEWALK_Y, 10.5, -Math.PI * 0.5, 1.0, this.quadrants ? this.quadrants.SE : null);
      this._addCollider(eastInnerSwMinX + 3.6, SIDEWALK_Y, 9.2, eastInnerSwMinX + 5.2, SIDEWALK_Y + 1.8, 11.8, 'wood', { blocksBullets: false });

      // Tropical Poly Haven Foliage variants (pruned secondary shadow casters)
      const variants = ['a', 'b', 'c', 'd'];
      for (let vi = 0; vi < variants.length; vi++) {
        const ch = variants[vi];
        const pPachira = this._extractModelProto('pachira_aquatica_01', 2.2 + vi * 0.35,
          (n) => (n.name || '').endsWith('_' + ch)
        );
        this._emitInstancedProto(pPachira, pachiraPlacements[vi], false, true, 'Pachira_' + ch);

        const pShrub2 = this._extractModelProto('shrub_02', 1.15 + vi * 0.15,
          (n) => n.name === 'shrub_02_' + ch
        );
        this._emitInstancedProto(pShrub2, shrub2Placements[vi], false, true, 'Shrub2_' + ch);

        const pFern = this._extractModelProto('fern_02', 0.42,
          (n) => n.name === 'fern_02_' + ch
        );
        this._emitInstancedProto(pFern, fernPlacements[vi], false, true, 'Fern_' + ch);

        if (vi < 3) {
          const pCalathea = this._extractModelProto('calathea_orbifolia_01', 0.45,
            (n) => n.name === 'calathea_orbifolia_01_' + ch
          );
          this._emitInstancedProto(pCalathea, calatheaPlacements[vi], false, true, 'Calathea_' + ch);
        }
      }

      // =========================================================
      // 8. CITY STREET & PLAZA SPAWN NODES (FOR ROAMING ZOMBIES)
      // =========================================================
      this.spawnNodes = [
        { x: eastInnerSwMinX + 3.5, y: SIDEWALK_Y, z: -48, zone: 'street_east_plaza' },
        { x: eastInnerSwMinX + 3.5, y: SIDEWALK_Y, z: 48, zone: 'street_east_plaza' },
        { x: eastRoadCX, y: STREET_GROUND_Y, z: -26, zone: 'street_east_road' },
        { x: eastRoadCX, y: STREET_GROUND_Y, z: 26, zone: 'street_east_road' },
        { x: westInnerSwMaxX - 3.5, y: SIDEWALK_Y, z: -42, zone: 'street_west_plaza' },
        { x: westInnerSwMaxX - 3.5, y: SIDEWALK_Y, z: 42, zone: 'street_west_plaza' },
        { x: westRoadCX, y: STREET_GROUND_Y, z: -22, zone: 'street_west_road' },
        { x: westRoadCX, y: STREET_GROUND_Y, z: 22, zone: 'street_west_road' },
        { x: (cMinX + cMaxX) * 0.5, y: STREET_GROUND_Y, z: CROSSING_Z_SOUTH, zone: 'crossing_south' },
        { x: (cMinX + cMaxX) * 0.5, y: STREET_GROUND_Y, z: CROSSING_Z_NORTH, zone: 'crossing_north' },
        { x: parkX, y: SIDEWALK_Y, z: 0.0, zone: 'east_pocket_park' }
      ];

      // =========================================================
      // 9. STREET INTERACTABLES & HYDRANT HAZARDS
      // =========================================================
      this.interactables = [];
      const usedSet = this._usedIds || new Set();

      const coffeeCartUsed = usedSet.has('city_coffee_cart');
      this.interactables.push({
        id: 'city_coffee_cart',
        type: 'street_stash',
        x: eastInnerSwMinX + 4.4,
        y: SIDEWALK_Y + 0.9,
        z: 10.5,
        label: coffeeCartUsed ? '[E] Gerobak Kopi East Promenade (Sudah Digeledah)' : '[E] Geledah Gerobak Kopi East Promenade (+Amunisi SS2 & Kopi Hangat)',
        prompt: coffeeCartUsed ? '[E] Gerobak Kopi East Promenade (Sudah Digeledah)' : '[E] Geledah Gerobak Kopi East Promenade (+Amunisi SS2 & Kopi Hangat)',
        used: coffeeCartUsed
      });

      const plnUsed = usedSet.has('city_pln_box') || this._plnRestored;
      this.interactables.push({
        id: 'city_pln_box',
        type: 'power_box',
        x: eastOuterSwMinX + 4.4,
        y: SIDEWALK_Y + 1.35,
        z: 9.0,
        label: plnUsed ? '[E] Kotak Relai PLN Jalanan (Daya Aktif)' : '[E] Sakelar Utama PLN Jalanan (Pulihkan Penerangan Jalan)',
        prompt: plnUsed ? '[E] Kotak Relai PLN Jalanan (Daya Aktif)' : '[E] Sakelar Utama PLN Jalanan (Pulihkan Penerangan Jalan)',
        used: plnUsed
      });

      const convoyUsed = usedSet.has('city_convoy_car');
      this.interactables.push({
        id: 'city_convoy_car',
        type: 'street_stash',
        x: westRoadCX + 3.5,
        y: STREET_GROUND_Y + 0.9,
        z: -46.0,
        label: convoyUsed ? '[E] Mobil Patroli TNI MT Haryono (Sudah Digeledah)' : '[E] Buka Bagasi Mobil Patroli TNI (+18 Shotgun Shells)',
        prompt: convoyUsed ? '[E] Mobil Patroli TNI MT Haryono (Sudah Digeledah)' : '[E] Buka Bagasi Mobil Patroli TNI (+18 Shotgun Shells)',
        used: convoyUsed
      });

      const parkUsed = usedSet.has('city_pocket_park');
      this.interactables.push({
        id: 'city_pocket_park',
        type: 'street_stash',
        x: parkX,
        y: SIDEWALK_Y + 0.85,
        z: 0.0,
        label: parkUsed ? '[E] Peti Taktis Taman East Pocket (Sudah Digeledah)' : '[E] Buka Peti Taktis Taman East Pocket (+RPG, +Senapan, +25 HP)',
        prompt: parkUsed ? '[E] Peti Taktis Taman East Pocket (Sudah Digeledah)' : '[E] Buka Peti Taktis Taman East Pocket (+RPG, +Senapan, +25 HP)',
        used: parkUsed
      });

      this.hydrants = [];
      for (let i = 0; i < hydrantPlacements.length; i++) {
        const hp = hydrantPlacements[i];
        this.hydrants.push({
          id: 'hydrant_' + i,
          x: hp.x,
          y: hp.y,
          z: hp.z,
          burst: false
        });
      }

      return this;
    },

    setLightingFactor: function (factor) {
      const num = Number(factor);
      this._lightingFactor = Number.isFinite(num) ? Math.max(0, num) : 1.0;
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
        sl.light.intensity = sl.baseIntensity * this._lightingFactor;
      }
    },

    setStreetLightIntensity: function (val) {
      return this.setLightingFactor(val);
    },

    setLightingIntensity: function (val) {
      return this.setLightingFactor(val);
    },

    update: function (dt, t) {
      if (!this.rootGroup) return;
      this._timeAccum = t !== undefined ? t : (this._timeAccum + dt);
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
        if (!sl.flicker) continue;
        // Subtle sodium-vapor streetlamp buzz (NEVER toggles visible!)
        const pulse = 0.85 + 0.15 * Math.sin(this._timeAccum * 17.0 + i * 3.1) * Math.sin(this._timeAccum * 4.3);
        sl.light.intensity = sl.baseIntensity * this._lightingFactor * pulse;
      }
    },

    setTrackGatesOpen: function (open) {
      this._trackGatesOpen = !!open;
      for (let i = 0; i < this.trackGates.length; i++) {
        const tg = this.trackGates[i];
        if (tg.gateMesh) {
          tg.gateMesh.position.y = this._trackGatesOpen ? (RAIL_TOP_Y + 6.8) : (RAIL_TOP_Y + 1.4);
        }
        if (tg.collider) {
          tg.collider.disabled = this._trackGatesOpen;
          tg.collider.blocksWalk = !this._trackGatesOpen;
        }
      }
    },

    setDetailVisibility: function (opts) {
      const visible = typeof opts === 'boolean' ? opts : (opts && opts.visible !== undefined ? !!opts.visible : true);
      for (let i = 0; i < this.clutterMeshes.length; i++) {
        this.clutterMeshes[i].visible = visible;
      }
    },

    updateVisibility: function (camPos, qualityKey) {
      if (qualityKey === 'potato') {
        for (let i = 0; i < this.clutterMeshes.length; i++) {
          this.clutterMeshes[i].visible = false;
        }
        return;
      }
      if (camPos && this.clutterByQuadrant) {
        const qCenters = {
          NW: { x: -60, z: -60 },
          NE: { x: 60, z: -60 },
          SW: { x: -60, z: 60 },
          SE: { x: 60, z: 60 }
        };
        const maxDistSq = qualityKey === 'balanced' ? (115 * 115) : (180 * 180);
        for (const [qKey, meshes] of Object.entries(this.clutterByQuadrant)) {
          const qc = qCenters[qKey];
          const distSq = (camPos.x - qc.x) ** 2 + (camPos.z - qc.z) ** 2;
          const vis = distSq <= maxDistSq;
          for (let i = 0; i < meshes.length; i++) {
            meshes[i].visible = vis;
          }
        }
      } else {
        for (let i = 0; i < this.clutterMeshes.length; i++) {
          this.clutterMeshes[i].visible = true;
        }
      }
    },

    getBVHMeshes: function () {
      return this.bvhMeshes;
    },

    getBVHMesh: function () {
      return this.bvhMeshes[0] || null;
    },

    getColliders: function () {
      return this.colliders;
    },

    getStreetLights: function () {
      return this.streetLights;
    },

    getLights: function () {
      return this.streetLights;
    },

    getSpawnNodes: function () {
      return this.spawnNodes;
    },

    getInteractableNear: function (pos, lookDir) {
      if (!this.interactables || !pos) return null;
      let best = null;
      let bestScore = -999;
      for (let i = 0; i < this.interactables.length; i++) {
        const it = this.interactables[i];
        const dx = it.x - pos.x;
        const dy = it.y - pos.y;
        const dz = it.z - pos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 3.0) continue;
        let dot = 1.0;
        if (lookDir && dist > 0.05) {
          dot = (dx * lookDir.x + dy * lookDir.y + dz * lookDir.z) / dist;
        }
        if (dot < 0.25 && dist > 1.2) continue;
        const score = dot * 2.0 - dist * 0.55;
        if (score > bestScore) {
          bestScore = score;
          best = it;
        }
      }
      return best;
    },

    interact: function (id) {
      if (!this.interactables) return { ok: false };
      const it = this.interactables.find((x) => x.id === id);
      if (!it) return { ok: false };

      if (it.type === 'power_box' || it.id === 'city_pln_box') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('turnstile_beep', { gain: 0.85 });
        }
        this._plnRestored = true;
        this.setLightingFactor(Math.max(this._lightingFactor, 1.35));
        it.used = true;
        it.label = '[E] Kotak Relai PLN Jalanan (Daya Aktif)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        if (LRT.Enemies && typeof LRT.Enemies.alertAllTo === 'function') {
          LRT.Enemies.alertAllTo({ x: it.x, y: it.y, z: it.z }, 45.0);
        }
        return {
          ok: true,
          type: 'power_box',
          action: 'power_box',
          lurePos: { x: it.x, y: it.y, z: it.z },
          message: 'Relai PLN Jalanan Aktif — Lampu Jalan Menyala & Sirine Palang Pintu Berbunyi!'
        };
      }

      if (it.id === 'city_coffee_cart') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('turnstile_beep', { gain: 0.6 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Gerobak Kopi East Promenade (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        return {
          ok: true,
          type: 'street_stash',
          action: 'street_stash',
          heal: fresh ? 15 : 0,
          healAmount: fresh ? 15 : 0,
          ammo: fresh ? { type: 'rifle', amount: 45 } : null,
          logTitle: "MEMO KASIR ROTI'O & KOPI — RESEP ANTI-PANIK",
          logBody: "Jumat, 16 Nov, 16:30 WIB. Di luar orang-orang mulai teriak dan mata mereka memerah aneh, tapi aroma kopi dan mentega vanila kita bikin suasana tetap tenang. Stok masih cukup sampai Senin. Jakarta udah sering banjir dan demo, masa kalah sama jamur? — Mas Budi",
          message: fresh ? 'Gerobak Kopi Promenade: +45 Amunisi Senapan & +15 HP Kopi Hangat!' : 'Gerobak Kopi East Promenade sudah digeledah.'
        };
      }

      if (it.id === 'city_convoy_car') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('turnstile_beep', { gain: 0.6 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Mobil Patroli TNI MT Haryono (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        return {
          ok: true,
          type: 'street_stash',
          action: 'street_stash',
          ammo: fresh ? { type: 'shotgun', amount: 18 } : null,
          logTitle: 'CATATAN PATROLI BARIKADE MT HARYONO',
          logBody: 'Satgas Yonif Mekanis 201: Jalur tol dalam kota dan Jalan MT Haryono lumpuh total akibat tabrakan beruntun. Jangan biarkan infected mendekati depo minyak atau gardu listrik PLN. Amankan amunisi shotgun untuk pertempuran jarak dekat!',
          message: fresh ? 'Bagasi Mobil Patroli: +18 Amunisi Shotgun 12G Ditemukan!' : 'Bagasi mobil patroli sudah kosong.'
        };
      }

      if (it.id === 'city_pocket_park') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('turnstile_beep', { gain: 0.65 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Peti Taktis Taman East Pocket (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        if (fresh && LRT.Weapons && typeof LRT.Weapons.addAmmo === 'function') {
          LRT.Weapons.addAmmo('rifle', 30);
        }
        return {
          ok: true,
          type: 'street_stash',
          action: 'street_stash',
          heal: fresh ? 25 : 0,
          healAmount: fresh ? 25 : 0,
          ammo: fresh ? { type: 'rpg', amount: 1 } : null,
          logTitle: 'CATATAN LOGISTIK TAMAN KOTA — MAS BUDI',
          logBody: 'Peti darurat ditinggalkan oleh regu pengawal logistik sebelum mereka mundur ke arah Setiabudi. Terdapat satu roket RPG cadangan dan amunisi kaliber 5.56mm. Jika situasi memburuk, gunakan roket untuk menghancurkan barikade atau kawanan Brute!',
          message: fresh ? 'Peti Taktis Taman: +1 Roket RPG, +30 Amunisi Senapan, dan Medkit +25 HP!' : 'Peti taktis taman sudah kosong.'
        };
      }

      return { ok: false };
    },

    getUsedIds: function () {
      return Array.from(this._usedIds || []);
    },

    raycastHydrants: function (origin, dir, maxDist) {
      if (!this.hydrants || !origin || !dir) return null;
      let best = null;
      let bestDist = maxDist || 200;

      const ox = origin.x, oy = origin.y, oz = origin.z;
      const dx = dir.x, dy = dir.y, dz = dir.z;
      const invX = dx !== 0 ? 1 / dx : 1e12;
      const invY = dy !== 0 ? 1 / dy : 1e12;
      const invZ = dz !== 0 ? 1 / dz : 1e12;

      for (let i = 0; i < this.hydrants.length; i++) {
        const h = this.hydrants[i];
        if (h.burst) continue;
        const minX = h.x - 0.40, maxX = h.x + 0.40;
        const minY = h.y, maxY = h.y + 0.95;
        const minZ = h.z - 0.40, maxZ = h.z + 0.40;

        let tmin = (minX - ox) * invX;
        let tmax = (maxX - ox) * invX;
        if (tmin > tmax) { const tmp = tmin; tmin = tmax; tmax = tmp; }

        let tymin = (minY - oy) * invY;
        let tymax = (maxY - oy) * invY;
        if (tymin > tymax) { const tmp = tymin; tymin = tymax; tymax = tmp; }

        if (tmin > tymax || tymin > tmax) continue;
        if (tymin > tmin) tmin = tymin;
        if (tymax < tmax) tmax = tymax;

        let tzmin = (minZ - oz) * invZ;
        let tzmax = (maxZ - oz) * invZ;
        if (tzmin > tzmax) { const tmp = tzmin; tzmin = tzmax; tzmax = tmp; }

        if (tmin > tzmax || tzmin > tmax) continue;
        if (tzmin > tmin) tmin = tzmin;
        if (tzmax < tmax) tmax = tzmax;

        const t = tmin > 0 ? tmin : tmax;
        if (t > 0 && t < bestDist) {
          bestDist = t;
          best = {
            dist: t,
            point: new THREE.Vector3(ox + dx * t, oy + dy * t, oz + dz * t),
            normal: new THREE.Vector3(0, 1, 0),
            hydrantId: h.id,
            hydrant: h
          };
        }
      }
      return best;
    },

    triggerHydrant: function (id) {
      if (!this.hydrants) return false;
      const h = this.hydrants.find((x) => x.id === id);
      if (!h || h.burst) return false;
      h.burst = true;

      const pos = { x: h.x, y: h.y + 0.5, z: h.z };

      if (LRT.Audio && typeof LRT.Audio.play === 'function') {
        LRT.Audio.play('debris_crumble', { gain: 0.85 });
      }

      if (LRT.Weapons && typeof LRT.Weapons.spawnSmoke === 'function') {
        for (let s = 0; s < 6; s++) {
          const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            3.5 + Math.random() * 2.5,
            (Math.random() - 0.5) * 1.5
          );
          LRT.Weapons.spawnSmoke(
            new THREE.Vector3(h.x, h.y + 0.4 + s * 0.2, h.z),
            vel,
            0.45,
            1.2,
            0.6,
            0xafeeee
          );
        }
      }

      if (LRT.Enemies && typeof LRT.Enemies.applyHydrantKnockback === 'function') {
        LRT.Enemies.applyHydrantKnockback(pos, 7.5, 14.0);
      }
      return true;
    },

    triggerHydrantAt: function (pos, radius) {
      if (!this.hydrants || !pos) return;
      const rad = radius !== undefined ? radius : 4.0;
      for (let i = 0; i < this.hydrants.length; i++) {
        const h = this.hydrants[i];
        if (h.burst) continue;
        const d = Math.hypot(h.x - pos.x, h.z - pos.z);
        if (d <= rad) {
          this.triggerHydrant(h.id);
        }
      }
    }
  };

  LRT.City = City;
})(window.LRT = window.LRT || {});
