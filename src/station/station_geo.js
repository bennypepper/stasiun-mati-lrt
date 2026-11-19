(function () {
  'use strict';

  window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {};
  const S = (window.__LRT_INTERNAL__.station = window.__LRT_INTERNAL__.station || {});

  const CONST = {
    CELL_SIZE: 2.0,
    STREET_GROUND_Y: -1.00,
    SIDEWALK_Y: -0.82,
    RAIL_TOP_Y: -1.00,
    TRACK_BED_Y: -1.18,
    PLATFORM_TOP_Y: 0.0,
    UPPER_FLOOR_Y: 4.25,
    CROSSING_Z_SOUTH: -74.0,
    CROSSING_Z_NORTH: 74.0,
    CROSSING_HALF_W: 6.0
  };

  const _stationProtoCache = new Map();
  const NO_SHADOW_STATION_PROPS = new Set([
    'CashRegister_01', 'WetFloorSign_01', 'potted_plant_02',
    'planter_box_01', 'mounted_fluorescent_lights', 'ammo_box',
    'pachira_aquatica_01', 'Barrel_01', 'CoffeeCart_01', 'portable_generator'
  ]);

  const tmp = {
    dummy: new THREE.Object3D(),
    color: new THREE.Color(),
    vec: new THREE.Vector3(),
    box: new THREE.Box3(),
    rayOrigin: new THREE.Vector3(),
    rayDir: new THREE.Vector3(),
    normal: new THREE.Vector3()
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
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
    if (wantColor) {
      if (!g.attributes.color) {
        const count = g.attributes.position.count;
        const arr = new Float32Array(count * 3);
        arr.fill(1.0);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
    }
    return g;
  }

  function remapUV(geo, rect) {
    const uv = geo.attributes.uv;
    const u0 = rect[0];
    const v0 = rect[1];
    const du = rect[2] - u0;
    const dv = rect[3] - v0;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
    }
    uv.needsUpdate = true;
    return geo;
  }

  // Face index in BoxGeometry: 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
  function remapBoxFacesUV(boxGeo, faceRects, defaultRect) {
    const g = boxGeo.index ? boxGeo.toNonIndexed() : boxGeo;
    const uv = g.attributes.uv;
    const vertsPerFace = 6;
    for (let f = 0; f < 6; f++) {
      const rect = (faceRects && faceRects[f]) ? faceRects[f] : defaultRect;
      if (!rect) continue;
      const u0 = rect[0];
      const v0 = rect[1];
      const du = rect[2] - u0;
      const dv = rect[3] - v0;
      const start = f * vertsPerFace;
      for (let i = 0; i < vertsPerFace; i++) {
        const idx = start + i;
        uv.setXY(idx, u0 + uv.getX(idx) * du, v0 + uv.getY(idx) * dv);
      }
    }
    uv.needsUpdate = true;
    return g;
  }

  function scaleTileUV(geo, uScale, vScale) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
    }
    uv.needsUpdate = true;
    return geo;
  }

  function addBox(bucket, w, h, d, x, y, z, rx, ry, rz, uvScaleU, uvScaleV) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (uvScaleU || uvScaleV) {
      scaleTileUV(g, uvScaleU || 1, uvScaleV || 1);
    }
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    bucket.push(prepGeo(g, false));
  }

  function addAtlasBox(bucket, w, h, d, x, y, z, ry, faceRects, defaultRect) {
    let g = new THREE.BoxGeometry(w, h, d);
    g = remapBoxFacesUV(g, faceRects, defaultRect);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    bucket.push(prepGeo(g, false));
  }

  function addAtlasQuad(bucket, w, h, x, y, z, rx, ry, rz, rect) {
    const g = new THREE.PlaneGeometry(w, h);
    remapUV(g, rect);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    bucket.push(prepGeo(g, false));
  }

  function addCylinder(bucket, rTop, rBot, h, segs, x, y, z, rx, ry, rz) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segs);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    bucket.push(prepGeo(g, false));
  }

  function mergeBucket(bucket, mat, castShadow, receiveShadow, disposableList, parent, name, bvhOut) {
    if (!bucket || bucket.length === 0) return null;
    const merged = THREE_UTILS.mergeGeometries(bucket, false);
    for (let i = 0; i < bucket.length; i++) bucket[i].dispose();
    if (!merged) return null;
    if (bvhOut) {
      if (typeof merged.computeBoundsTree === 'function') {
        merged.computeBoundsTree();
      } else if (window.MeshBVH && typeof window.MeshBVH.computeBoundsTree === 'function') {
        window.MeshBVH.computeBoundsTree.call(merged);
      }
    }
    disposableList.push(merged);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = !!castShadow;
    mesh.receiveShadow = !!receiveShadow;
    mesh.name = name || '';
    parent.add(mesh);
    if (bvhOut) bvhOut.push(mesh);
    return mesh;
  }

  function tintGeoColor(geo, r, gCol, b) {
    const col = geo.attributes.color;
    for (let i = 0; i < col.count; i++) {
      col.setXYZ(i, r, gCol, b);
    }
    col.needsUpdate = true;
    return geo;
  }

  function addWedgeRamp(bucket, minX, minZ, maxX, maxZ, yAtMin, yAtMax, axis, slopeOnly) {
    const y00 = yAtMin;
    const y01 = axis === 'z' ? yAtMax : yAtMin;
    const y11 = yAtMax;
    const y10 = axis === 'x' ? yAtMax : yAtMin;
    const baseMin = Math.min(yAtMin, yAtMax) - 0.16;
    const b00 = slopeOnly ? (y00 - 0.14) : baseMin;
    const b01 = slopeOnly ? (y01 - 0.14) : baseMin;
    const b11 = slopeOnly ? (y11 - 0.14) : baseMin;
    const b10 = slopeOnly ? (y10 - 0.14) : baseMin;
    const verts = [];
    const uvs = [];
    const pushTri = (ax, ay, az, au, av, bx, by, bz, bu, bv, cx, cy, cz, cu, cv) => {
      verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      uvs.push(au, av, bu, bv, cu, cv);
    };
    const dx = maxX - minX;
    const dz = maxZ - minZ;
    // Top walkable slope (A=(minX,minZ), B=(minX,maxZ), C=(maxX,maxZ), D=(maxX,minZ)) -> +Y normal
    pushTri(minX, y00, minZ, 0, 0, minX, y01, maxZ, 0, dz * 0.5, maxX, y11, maxZ, dx * 0.5, dz * 0.5);
    pushTri(minX, y00, minZ, 0, 0, maxX, y11, maxZ, dx * 0.5, dz * 0.5, maxX, y10, minZ, dx * 0.5, 0);
    // Bottom soffit -> -Y normal
    pushTri(minX, b00, minZ, 0, 0, maxX, b11, maxZ, dx * 0.5, dz * 0.5, minX, b01, maxZ, 0, dz * 0.5);
    pushTri(minX, b00, minZ, 0, 0, maxX, b10, minZ, dx * 0.5, 0, maxX, b11, maxZ, dx * 0.5, dz * 0.5);
    if (!slopeOnly) {
      // Closed visual prism sides for poured concrete ADA ramps
      pushTri(minX, b00, minZ, 0, 0, minX, y00, minZ, 0, 1, minX, y01, maxZ, dz * 0.5, 1);
      pushTri(minX, b00, minZ, 0, 0, minX, y01, maxZ, dz * 0.5, 1, minX, b01, maxZ, dz * 0.5, 0);
      pushTri(maxX, b11, maxZ, 0, 0, maxX, y11, maxZ, 0, 1, maxX, y10, minZ, dz * 0.5, 1);
      pushTri(maxX, b11, maxZ, 0, 0, maxX, y10, minZ, dz * 0.5, 1, maxX, b10, minZ, dz * 0.5, 0);
      pushTri(minX, b01, maxZ, 0, 0, minX, y01, maxZ, 0, 1, maxX, y11, maxZ, dx * 0.5, 1);
      pushTri(minX, b01, maxZ, 0, 0, maxX, y11, maxZ, dx * 0.5, 1, maxX, b11, maxZ, dx * 0.5, 0);
      pushTri(maxX, b10, minZ, 0, 0, maxX, y10, minZ, 0, 1, minX, y00, minZ, dx * 0.5, 1);
      pushTri(maxX, b10, minZ, 0, 0, minX, y00, minZ, dx * 0.5, 1, minX, b00, minZ, dx * 0.5, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    bucket.push(prepGeo(g, false));
  }

  function addSlopedBeam(bucket, w, h, x, z0, y0, z1, y1) {
    let az0 = z0, ay0 = y0, az1 = z1, ay1 = y1;
    if (az1 < az0) { az0 = z1; ay0 = y1; az1 = z0; ay1 = y0; }
    const g = new THREE.BoxGeometry(w, h, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getZ(i) + 0.5;
      const zVal = az0 + (az1 - az0) * t;
      const yOff = ay0 + (ay1 - ay0) * t + h * 0.5;
      pos.setZ(i, zVal);
      pos.setY(i, pos.getY(i) + yOff);
      pos.setX(i, pos.getX(i) + x);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    bucket.push(prepGeo(g, false));
  }

  function addSlopedBeamX(bucket, w, h, z, x0, y0, x1, y1) {
    let ax0 = x0, ay0 = y0, ax1 = x1, ay1 = y1;
    if (ax1 < ax0) { ax0 = x1; ay0 = y1; ax1 = x0; ay1 = y0; }
    const g = new THREE.BoxGeometry(1, h, w);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getX(i) + 0.5;
      const xVal = ax0 + (ax1 - ax0) * t;
      const yOff = ay0 + (ay1 - ay0) * t + h * 0.5;
      pos.setX(i, xVal);
      pos.setY(i, pos.getY(i) + yOff);
      pos.setZ(i, pos.getZ(i) + z);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    bucket.push(prepGeo(g, false));
  }

  function buildRebarCoreGeometry() {
    const parts = [];
    const addCorePart = (g, r, gc, b, x, y, z, rx, ry, rz) => {
      if (rx) g.rotateX(rx);
      if (ry) g.rotateY(ry);
      if (rz) g.rotateZ(rz);
      g.translate(x, y, z);
      parts.push(tintGeoColor(prepGeo(g, true), r, gc, b));
    };

    addCorePart(new THREE.BoxGeometry(0.46, 0.72, 0.46), 0.78, 0.75, 0.70, 0, -1.52, 0, 0.02, 0.06, -0.02);
    addCorePart(new THREE.BoxGeometry(0.46, 0.68, 0.46), 0.76, 0.73, 0.68, 0, 1.54, 0, -0.02, -0.05, 0.02);
    addCorePart(new THREE.BoxGeometry(0.24, 2.55, 0.24), 0.70, 0.67, 0.63, 0, -0.02, 0, 0.03, 0.35, -0.04);

    const corners = [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]];
    for (let c = 0; c < corners.length; c++) {
      const cx = corners[c][0];
      const cz = corners[c][1];
      addCorePart(
        new THREE.CylinderGeometry(0.026, 0.028, 3.76, 5),
        0.58, 0.24, 0.14,
        cx, 0, cz,
        (c % 2 === 0 ? 0.022 : -0.018), 0, (c < 2 ? 0.02 : -0.022)
      );
    }

    for (let ry = -1.32; ry <= 1.38; ry += 0.54) {
      addCorePart(new THREE.BoxGeometry(0.34, 0.03, 0.03), 0.62, 0.60, 0.58, 0, ry, 0.15, 0, 0, 0.03);
      addCorePart(new THREE.BoxGeometry(0.34, 0.03, 0.03), 0.62, 0.60, 0.58, 0, ry, -0.15, 0, 0, -0.03);
      addCorePart(new THREE.BoxGeometry(0.03, 0.03, 0.34), 0.60, 0.58, 0.56, 0.15, ry, 0, 0.03, 0, 0);
      addCorePart(new THREE.BoxGeometry(0.03, 0.03, 0.34), 0.60, 0.58, 0.56, -0.15, ry, 0, -0.03, 0, 0);
    }

    const merged = THREE_UTILS.mergeGeometries(parts, false);
    for (let i = 0; i < parts.length; i++) parts[i].dispose();
    return merged;
  }

  function buildBarricadeGeometry() {
    const parts = [];
    const addPart = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      parts.push(prepGeo(g, false));
    };
    addPart(0.98, 0.78, 0.72, 0, 0.11, 0);
    addPart(1.00, 0.24, 1.00, 0, -0.38, 0);
    addPart(0.18, 0.10, 1.35, -0.36, -0.45, 0);
    addPart(0.18, 0.10, 1.35, 0.36, -0.45, 0);
    const merged = THREE_UTILS.mergeGeometries(parts, false);
    for (let i = 0; i < parts.length; i++) parts[i].dispose();
    return merged;
  }

  // Analytic ray vs AABB slab returning { t, nx, ny, nz } or null
  function intersectRayAABB(ox, oy, oz, invX, invY, invZ, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
    const t1 = (minX - ox) * invX;
    const t2 = (maxX - ox) * invX;
    const t3 = (minY - oy) * invY;
    const t4 = (maxY - oy) * invY;
    const t5 = (minZ - oz) * invZ;
    const t6 = (maxZ - oz) * invZ;

    let tmin = Math.min(t1, t2);
    let tmax = Math.max(t1, t2);
    let hitAxis = 0;
    let hitSign = t1 < t2 ? -1 : 1;

    const tymin = Math.min(t3, t4);
    const tymax = Math.max(t3, t4);
    if (tymin > tmin) {
      tmin = tymin;
      hitAxis = 1;
      hitSign = t3 < t4 ? -1 : 1;
    }
    if (tymax < tmax) tmax = tymax;

    const tzmin = Math.min(t5, t6);
    const tzmax = Math.max(t5, t6);
    if (tzmin > tmin) {
      tmin = tzmin;
      hitAxis = 2;
      hitSign = t5 < t6 ? -1 : 1;
    }
    if (tzmax < tmax) tmax = tzmax;

    if (tmax < 0 || tmin > tmax || tmin > maxDist) return null;
    const t = tmin >= 0 ? tmin : tmax;
    if (t < 0 || t > maxDist) return null;
    return {
      t: t,
      nx: hitAxis === 0 ? hitSign : 0,
      ny: hitAxis === 1 ? hitSign : 0,
      nz: hitAxis === 2 ? hitSign : 0
    };
  }

  function inferTagFromMeshName(name) {
    if (!name) return 'concrete';
    const n = name.toLowerCase();
    if (n.indexOf('steel') !== -1 || n.indexOf('truss') !== -1 || n.indexOf('jpo') !== -1 ||
        n.indexOf('canopy') !== -1 || n.indexOf('car') !== -1 || n.indexOf('gate') !== -1 ||
        n.indexOf('trim') !== -1 || n.indexOf('glass') !== -1) {
      return 'metal';
    }
    return 'concrete';
  }

  function SpatialHashGrid(colliders) {
    const CELL_SIZE = CONST.CELL_SIZE;
    const cells = new Map();
    const globalFloors = [];
    const grid = {
      cellSize: CELL_SIZE,
      cells: cells,
      colliders: colliders,
      globalFloors: globalFloors,
      _stamp: 1,
      query: function (x, z, r) {
        return this.queryPoint(x, z, r);
      },
      queryAABB: function (minX, minZ, maxX, maxZ) {
        const x0 = Math.floor(minX / CELL_SIZE);
        const x1 = Math.floor(maxX / CELL_SIZE);
        const z0 = Math.floor(minZ / CELL_SIZE);
        const z1 = Math.floor(maxZ / CELL_SIZE);
        const stamp = ++this._stamp;
        const res = [];
        for (let g = 0; g < globalFloors.length; g++) {
          const gc = globalFloors[g];
          if (gc.maxX >= minX && gc.minX <= maxX && gc.maxZ >= minZ && gc.minZ <= maxZ) {
            gc._q = stamp;
            res.push(gc);
          }
        }
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const key = cx + ',' + cz;
            const bucket = cells.get(key);
            if (!bucket) continue;
            for (let i = 0; i < bucket.length; i++) {
              const c = bucket[i];
              if (c._q !== stamp) {
                c._q = stamp;
                res.push(c);
              }
            }
          }
        }
        return res;
      },
      queryPoint: function (x, z, r) {
        return this.queryAABB(x - r, z - r, x + r, z + r);
      }
    };

    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      c._q = 0;
      const area = (c.maxX - c.minX) * (c.maxZ - c.minZ);
      if (area > 900) {
        globalFloors.push(c);
        continue;
      }
      const x0 = Math.floor(c.minX / CELL_SIZE);
      const x1 = Math.floor(c.maxX / CELL_SIZE);
      const z0 = Math.floor(c.minZ / CELL_SIZE);
      const z1 = Math.floor(c.maxZ / CELL_SIZE);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const key = cx + ',' + cz;
          let bucket = cells.get(key);
          if (!bucket) {
            bucket = [];
            cells.set(key, bucket);
          }
          bucket.push(c);
        }
      }
    }
    return grid;
  }

  const _stationNormCache = new Map();

  function _extractStationProto(key, targetHeight, filterFn, protoCacheKey, lodTier) {
    const LRT = window.LRT || {};
    const loader = LRT.AssetLoader;
    if (!loader || typeof loader.getModelRaw !== 'function') return null;

    const tier = lodTier || 0;
    const filterKey = protoCacheKey || (filterFn ? filterFn.toString().replace(/\s+/g, ' ') : '');
    const normKey = `${key}|${targetHeight || 0}|${filterKey}`;
    const cacheKey = `${normKey}|L${tier}`;
    let proto = _stationProtoCache.get(cacheKey);

    if (!proto) {
      if (tier > 0 && !_stationNormCache.has(normKey)) {
        _extractStationProto(key, targetHeight, filterFn, protoCacheKey, 0);
      }
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

      let norm = _stationNormCache.get(normKey);
      if (!norm) {
        tmp.box.makeEmpty();
        const mBox = new THREE.Box3();
        for (let i = 0; i < selected.length; i++) {
          const g = selected[i].geometry;
          if (!g.boundingBox) g.computeBoundingBox();
          mBox.copy(g.boundingBox).applyMatrix4(selected[i].matrixWorld);
          tmp.box.union(mBox);
        }
        const sz = tmp.box.getSize(new THREE.Vector3());
        const ctr = tmp.box.getCenter(new THREE.Vector3());
        const scale = targetHeight && sz.y > 0.01 ? (targetHeight / sz.y) : 1.0;
        norm = { ctrX: ctr.x, minY: tmp.box.min.y, ctrZ: ctr.z, scale, sz: { x: sz.x * scale, y: sz.y * scale, z: sz.z * scale } };
        _stationNormCache.set(normKey, norm);
      }

      const partsByMat = new Map();
      for (let i = 0; i < selected.length; i++) {
        const node = selected[i];
        const g = node.geometry.clone();
        g.applyMatrix4(node.matrixWorld);
        g.translate(-norm.ctrX, -norm.minY, -norm.ctrZ);
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
        parts.push({ geo: merged, mat });
      }
      if (parts.length === 0) return null;

      proto = {
        parts,
        sz: norm.sz
      };
      _stationProtoCache.set(cacheKey, proto);
    }

    return proto;
  }

  function _placeNormalizedModel(station, key, x, y, z, ry, targetHeight, filterFn, addCollTag, protoCacheKey) {
    const p0 = _extractStationProto(key, targetHeight, filterFn, protoCacheKey, 0);
    if (!p0) return null;
    const p1 = _extractStationProto(key, targetHeight, filterFn, protoCacheKey, 1);
    const p2 = _extractStationProto(key, targetHeight, filterFn, protoCacheKey, 2);

    const tierCfg = (LRT.Config && LRT.Config.QUALITY_TIERS && LRT.Core && LRT.Core.qualityKey)
      ? LRT.Config.QUALITY_TIERS[LRT.Core.qualityKey]
      : null;
    const allowPropShadow = tierCfg && tierCfg.propCastShadow !== undefined ? !!tierCfg.propCastShadow : false;
    const shouldCast = allowPropShadow && !NO_SHADOW_STATION_PROPS.has(key);
    const buildLevelGroup = (pr, cast) => {
      const g = new THREE.Group();
      for (let i = 0; i < pr.parts.length; i++) {
        const part = pr.parts[i];
        const m = new THREE.Mesh(part.geo, part.mat);
        m.castShadow = cast;
        m.receiveShadow = true;
        m.userData._isStationProp = !NO_SHADOW_STATION_PROPS.has(key);
        g.add(m);
      }
      return g;
    };

    let rootObj;
    if (p1 || p2) {
      rootObj = new THREE.LOD();
      rootObj.addLevel(buildLevelGroup(p0, shouldCast), 0);
      if (p1) rootObj.addLevel(buildLevelGroup(p1, shouldCast), 18);
      if (p2) rootObj.addLevel(buildLevelGroup(p2, false), 36);
    } else {
      rootObj = buildLevelGroup(p0, shouldCast);
    }
    rootObj.position.set(x, y, z);
    if (ry) rootObj.rotation.y = ry;
    station.rootGroup.add(rootObj);

    if (addCollTag) {
      const cos = Math.abs(Math.cos(ry || 0));
      const sin = Math.abs(Math.sin(ry || 0));
      const hw = (cos * p0.sz.x + sin * p0.sz.z) * 0.5;
      const hd = (sin * p0.sz.x + cos * p0.sz.z) * 0.5;
      station._addCollider(x - hw, y, z - hd, x + hw, y + p0.sz.y, z + hd, addCollTag, {
        blocksWalk: true, blocksBullets: true
      });
    }
    return rootObj;
  }

  S.CONST = CONST;
  S._stationProtoCache = _stationProtoCache;
  S.NO_SHADOW_STATION_PROPS = NO_SHADOW_STATION_PROPS;
  S.tmp = tmp;
  S.mulberry32 = mulberry32;
  S.prepGeo = prepGeo;
  S.remapUV = remapUV;
  S.remapBoxFacesUV = remapBoxFacesUV;
  S.scaleTileUV = scaleTileUV;
  S.addBox = addBox;
  S.addAtlasBox = addAtlasBox;
  S.addAtlasQuad = addAtlasQuad;
  S.addCylinder = addCylinder;
  S.mergeBucket = mergeBucket;
  S.tintGeoColor = tintGeoColor;
  S.addWedgeRamp = addWedgeRamp;
  S.addSlopedBeam = addSlopedBeam;
  S.addSlopedBeamX = addSlopedBeamX;
  S.buildRebarCoreGeometry = buildRebarCoreGeometry;
  S.buildBarricadeGeometry = buildBarricadeGeometry;
  S.intersectRayAABB = intersectRayAABB;
  S.inferTagFromMeshName = inferTagFromMeshName;
  S.SpatialHashGrid = SpatialHashGrid;
  S._extractStationProto = _extractStationProto;
  S._placeNormalizedModel = _placeNormalizedModel;
})();
