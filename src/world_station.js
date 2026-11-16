(function (LRT) {
  'use strict';

  const CELL_SIZE = 2.0;
  const STREET_GROUND_Y = -1.00;
  const SIDEWALK_Y = -0.82;
  const RAIL_TOP_Y = -1.00;
  const TRACK_BED_Y = -1.18;
  const PLATFORM_TOP_Y = 0.0;
  const UPPER_FLOOR_Y = 4.25;
  const CROSSING_Z_SOUTH = -74.0;
  const CROSSING_Z_NORTH = 74.0;
  const CROSSING_HALF_W = 6.0;

  const _stationProtoCache = new Map();
  const NO_SHADOW_STATION_PROPS = new Set([
    'CashRegister_01', 'WetFloorSign_01', 'potted_plant_02',
    'planter_box_01', 'mounted_fluorescent_lights', 'ammo_box',
    'pachira_aquatica_01'
  ]);

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

  const _tmpDummy = new THREE.Object3D();
  const _tmpColor = new THREE.Color();
  const _tmpVec = new THREE.Vector3();
  const _tmpBox = new THREE.Box3();
  const _tmpRayOrigin = new THREE.Vector3();
  const _tmpRayDir = new THREE.Vector3();
  const _tmpNormal = new THREE.Vector3();

  const Station = {
    rootGroup: null,
    disposableGeometries: [],
    disposableMaterials: [],
    disposableTextures: [],
    bvhMeshes: [],
    stationLights: [],
    colliders: [],
    spatialGrid: null,
    glassPanes: [],
    pillars: [],
    dynamicProps: [],
    tubes: [],
    interactables: [],
    spawnNodes: [],
    psdDoors: [],
    destructibles: null,

    _psdOpen: 0,
    _psdTarget: 0,
    _stationIndex: 0,
    _archetype: null,
    _mood: null,
    _moodKey: 'MONSOON_OVERCAST',
    _mode: 'survival',
    _brokenGlassCount: 0,
    _destroyedPillars: 0,
    _damagedTubes: 0,
    _drawCallsEst: 0,
    _queryStamp: 1,
    _lightingFactor: 1.0,
    _matCache: null,

    _glassInst: null,
    _psdFrameInst: null,
    _tubeInst: null,
    _tubeHaloInst: null,
    _propsPaintInst: null,
    _propsMetalInst: null,
    _barricadeInst: null,
    _amberInst: null,
    _amberBasePositions: [],
    _timeAccum: 0,
    _raycaster: new THREE.Raycaster(),

    _resolveMat: function (key, texKey, opts) {
      if (!this._matCache) this._matCache = new Map();
      const mats = (LRT.Materials && LRT.Materials.mats) || {};
      if (mats[key]) return mats[key];
      if (this._matCache.has(key)) return this._matCache.get(key);

      const o = opts || {};
      const loader = LRT.AssetLoader;
      const texSet = (texKey && loader && typeof loader.getTextureSet === 'function')
        ? loader.getTextureSet(texKey, o.repX || 1, o.repY || 1)
        : null;

      const params = {
        color: o.color !== undefined ? o.color : 0xffffff,
        roughness: o.roughness !== undefined ? o.roughness : 0.85,
        metalness: o.metalness !== undefined ? o.metalness : 0.04,
        side: o.side || THREE.FrontSide
      };
      if (texSet) {
        params.map = texSet.map;
        params.normalMap = texSet.normalMap;
        params.roughnessMap = texSet.roughnessMap;
        params.aoMap = texSet.aoMap;
        this.disposableTextures.push(texSet.map, texSet.normalMap, texSet.roughnessMap, texSet.aoMap);
      }
      const mat = new THREE.MeshStandardMaterial(params);
      this._matCache.set(key, mat);
      this.disposableMaterials.push(mat);
      return mat;
    },

    _resolveCanopyMat: function (arch, mats) {
      const colHex = (arch && arch.canopyColor) ? arch.canopyColor.toUpperCase() : '#A85E32';
      if (colHex === '#C27C28' && mats.roofOchre) return mats.roofOchre;
      if (colHex === '#A85E32' && mats.roofTerracotta) return mats.roofTerracotta;

      const cacheKey = 'canopy_' + colHex;
      if (!this._matCache) this._matCache = new Map();
      if (this._matCache.has(cacheKey)) return this._matCache.get(cacheKey);

      const base = mats.roofTerracotta || mats.roofOchre;
      if (base && typeof base.clone === 'function') {
        const cloned = base.clone();
        cloned.color.set(colHex);
        this._matCache.set(cacheKey, cloned);
        this.disposableMaterials.push(cloned);
        return cloned;
      }
      return this._resolveMat(cacheKey, 'roof_corrugated', {
        color: colHex, roughness: 0.64, metalness: 0.32, side: THREE.DoubleSide
      });
    },

    _placeNormalizedModel: function (key, x, y, z, ry, targetHeight, filterFn, addCollTag, protoCacheKey) {
      const loader = LRT.AssetLoader;
      if (!loader || typeof loader.getModelRaw !== 'function') return null;

      const filterKey = protoCacheKey || (filterFn ? filterFn.toString().replace(/\s+/g, ' ') : '');
      const cacheKey = `${key}|${targetHeight || 0}|${filterKey}`;
      let proto = _stationProtoCache.get(cacheKey);

      if (!proto) {
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
        const mBox = new THREE.Box3();
        for (let i = 0; i < selected.length; i++) {
          const g = selected[i].geometry;
          if (!g.boundingBox) g.computeBoundingBox();
          mBox.copy(g.boundingBox).applyMatrix4(selected[i].matrixWorld);
          _tmpBox.union(mBox);
        }
        const sz = _tmpBox.getSize(new THREE.Vector3());
        const ctr = _tmpBox.getCenter(new THREE.Vector3());
        const scale = targetHeight && sz.y > 0.01 ? (targetHeight / sz.y) : 1.0;

        const parts = [];
        for (let i = 0; i < selected.length; i++) {
          const node = selected[i];
          const g = node.geometry.clone();
          g.applyMatrix4(node.matrixWorld);
          g.translate(-ctr.x, -_tmpBox.min.y, -ctr.z);
          if (scale !== 1.0) g.scale(scale, scale, scale);
          const mat = Array.isArray(node.material) ? node.material[0] : node.material;
          if (mat && 'envMapIntensity' in mat && (!mat.envMapIntensity || mat.envMapIntensity < 0.8)) {
            mat.envMapIntensity = 1.0;
          }
          parts.push({ geo: g, mat });
        }

        proto = {
          parts,
          sz: {
            x: sz.x * scale,
            y: sz.y * scale,
            z: sz.z * scale
          }
        };
        _stationProtoCache.set(cacheKey, proto);
      }

      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      if (ry) grp.rotation.y = ry;

      const shouldCast = !NO_SHADOW_STATION_PROPS.has(key);

      for (let i = 0; i < proto.parts.length; i++) {
        const part = proto.parts[i];
        const m = new THREE.Mesh(part.geo, part.mat);
        m.castShadow = shouldCast;
        m.receiveShadow = true;
        grp.add(m);
      }
      this.rootGroup.add(grp);

      if (addCollTag) {
        const cos = Math.abs(Math.cos(ry || 0));
        const sin = Math.abs(Math.sin(ry || 0));
        const hw = (cos * proto.sz.x + sin * proto.sz.z) * 0.5;
        const hd = (sin * proto.sz.x + cos * proto.sz.z) * 0.5;
        this._addCollider(x - hw, y, z - hd, x + hw, y + proto.sz.y, z + hd, addCollTag, {
          blocksWalk: true, blocksBullets: true
        });
      }
      return grp;
    },

    _buildSpatialGrid: function () {
      const cells = new Map();
      const colliders = this.colliders;
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
      this.spatialGrid = grid;
    },

    _addCollider: function (minX, minY, minZ, maxX, maxY, maxZ, tag, opts) {
      const o = opts || {};
      const blocksWalk = o.blocksWalk !== undefined ? o.blocksWalk : true;
      const c = {
        id: this.colliders.length,
        minX: Math.min(minX, maxX),
        minY: Math.min(minY, maxY),
        minZ: Math.min(minZ, maxZ),
        maxX: Math.max(minX, maxX),
        maxY: Math.max(minY, maxY),
        maxZ: Math.max(minZ, maxZ),
        tag: tag || 'concrete',
        blocksWalk: blocksWalk,
        disabled: !blocksWalk,
        blocksBullets: o.blocksBullets !== undefined ? o.blocksBullets : true,
        isFloor: !!o.isFloor || tag === 'floor',
        isDoor: !!o.isDoor,
        isOpen: !!o.isOpen,
        isRamp: !!o.isRamp,
        rampAxis: o.rampAxis,
        y0: o.y0,
        y1: o.y1,
        glassId: o.glassId !== undefined ? o.glassId : -1,
        pillarId: o.pillarId !== undefined ? o.pillarId : -1,
        propId: o.propId !== undefined ? o.propId : -1,
        tubeId: o.tubeId !== undefined ? o.tubeId : -1,
        barrelId: o.barrelId !== undefined ? o.barrelId : -1
      };
      this.colliders.push(c);
      return c.id;
    },

    dispose: function (scene) {
      if (LRT.City && typeof LRT.City.dispose === 'function') {
        LRT.City.dispose();
      }
      if (this.rootGroup) {
        const parent = scene || this.rootGroup.parent;
        if (parent) parent.remove(this.rootGroup);
        this.rootGroup = null;
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
      this.disposableGeometries = [];
      this.disposableMaterials = [];
      this.disposableTextures = [];
      this.bvhMeshes = [];
      this.stationLights = [];
      this.colliders = [];
      this.spatialGrid = null;
      this.glassPanes = [];
      this.pillars = [];
      this.dynamicProps = [];
      this.tubes = [];
      this.interactables = [];
      this.spawnNodes = [];
      this.psdDoors = [];
      this.psdDoors2 = [];
      this.navGraph = null;
      this._glassInst = null;
      this._psdFrameInst = null;
      this._psdFrameInst2 = null;
      this._railConfig = null;
      this._tubeInst = null;
      this._tubeHaloInst = null;
      this._propsPaintInst = null;
      this._propsMetalInst = null;
      this._barricadeInst = null;
      this._amberInst = null;
      this._amberBasePositions = [];
      this._matCache = null;
      this._lightingFactor = 1.0;
      this.destructibles = null;
      this.explosiveBarrels = [];
      this._powerRestored = true;
      this._usedIds = new Set();
    },

    build: function (index, seed, mode, scene, offsetZ, opts) {
      if (this.rootGroup) this.dispose(scene);

      const o = opts || {};
      this._stationIndex = typeof index === 'number' ? index : 0;
      this._usedIds = (o.usedIds) ? (o.usedIds instanceof Set ? new Set(o.usedIds) : new Set(o.usedIds)) : (this._usedIds || new Set());
      this._powerRestored = (mode === 'exploration') || !!o.powerRestored || (this._stationIndex > 0);

      const cfg = LRT.Config || {};
      const dims = cfg.STATION_DIMS || {
        track1X: 0, track2X: -4.70, railTopY: RAIL_TOP_Y,
        streetGroundY: STREET_GROUND_Y, platformTopY: PLATFORM_TOP_Y, psdEdgeX: 1.46,
        platformMinZ: -60, platformMaxZ: 60, psdHeight: 1.40,
        psdDoorClearWidth: 1.50,
        psdCentersZ: [-23.25, -17.55, -11.85, -5.70, 0.0, 5.70, 11.85, 17.55, 23.25],
        tactileOffsetFromPsd: 0.60, tactileWidth: 0.45,
        sidePlatformWidth: 5.20, islandPlatformWidth: 9.60,
        canopyEaveY: 7.15, canopyApexY: 9.85, cawangApexY: 12.60
      };
      const archetypes = cfg.ARCHETYPES || [{
        id: 'dukuh_atas', code: 'CB01 / BK01', name: 'Dukuh Atas BSI',
        lineColor: '#1D4ED8', layout: 'SIDE_DUAL', canopyColor: '#A85E32',
        concourseEnd: 'center', hasSkyscraperCanyon: true, hasTerminusBuffer: true,
        moodBias: 'MONSOON_OVERCAST', destinationHint: 'Ke Harjamukti / Jati Mulya'
      }];
      const moods = cfg.MOODS || {
        MONSOON_OVERCAST: {
          name: 'Humid Monsoon Overcast', fogColor: 0x556062, fogDensity: 0.0145,
          sunColor: 0xd9e4ec, sunIntensity: 1.35, hemiSky: 0x9db0bd,
          hemiGround: 0x2c3032, hemiIntensity: 0.85, wetness: 0.96, tubeIntensity: 1.0
        }
      };

      const stIdx = Math.max(0, index | 0);
      const arch = archetypes[stIdx % archetypes.length];
      const sectorLoop = Math.floor(stIdx / archetypes.length);
      const rng = mulberry32((stIdx + 1) * 7919 + ((seed || 1337) | 0));

      const moodKeys = Object.keys(moods);
      const chosenMoodKey = sectorLoop === 0 && moods[arch.moodBias]
        ? arch.moodBias
        : moodKeys[Math.floor(rng() * moodKeys.length)];
      const mood = moods[chosenMoodKey];

      this._stationIndex = stIdx;
      this._archetype = arch;
      this._moodKey = chosenMoodKey;
      this._mood = mood;
      this._mode = mode || 'survival';
      this._brokenGlassCount = 0;
      this._destroyedPillars = 0;
      this._damagedTubes = 0;
      this._psdOpen = 0;
      this._psdTarget = 0;
      this._timeAccum = 0;
      this._raycaster.firstHitOnly = true;

      const root = new THREE.Group();
      root.name = 'StationRoot_' + arch.id;
      if (offsetZ) root.position.z = offsetZ;
      this.rootGroup = root;
      if (scene) scene.add(root);

      const M = LRT.Materials;
      const mats = (M && M.mats) ? M.mats : {};
      const STALL_UV = M.STALL_UV;
      const SIGN_UV = M.SIGN_UV;

      if (scene) {
        scene.fog = new THREE.FogExp2(mood.fogColor, mood.fogDensity);
        scene.background = new THREE.Color(mood.fogColor);
      }
      if (M && M.uGlobals) {
        M.uGlobals.uWetness.value = mood.wetness;
        M.uGlobals.uFogHazeColor.value.setHex(mood.fogColor);
        M.uGlobals.uFogHazeDensity.value = chosenMoodKey === 'TOXIC_SMOG' ? 0.52 : 0.38;
      }

      const displayName = sectorLoop > 0 ? arch.name + ' II' : arch.name;
      if (M && typeof M.repaintStationBanner === 'function') {
        M.repaintStationBanner({
          codeCB: arch.id === 'harjamukti' ? 'CB 12' : arch.code.split('/')[0].trim(),
          codeBK: arch.id === 'harjamukti' ? null : (arch.code.split('/')[1] || 'BK 01').trim(),
          name: displayName,
          subtitle: (arch.destinationHint || 'LRT JABODEBEK') + '  •  PERON 1',
          accentColor: arch.lineColor
        });
      }

      const matConcrete = this._resolveMat('concrete', 'concrete_station', { color: 0x9c9890, roughness: 0.90 });
      const matConcreteRough = this._resolveMat('concreteRough', 'concrete_rough', { color: 0x8d8982, roughness: 0.92 });
      const matDarkWood = this._resolveMat('darkWood', 'dark_wood', { color: 0x6f513d, roughness: 0.78 });
      const matCanopy = this._resolveCanopyMat(arch, mats);

      const bConcrete = [];
      const bConcreteRough = [];
      const bTerrazzo = [];
      const bChecker = [];
      const bTactile = [];
      const bRoof = [];
      const bTruss = [];
      const bSteelDark = [];
      const bJpo = [];
      const bStall = [];
      const bSign = [];
      const bBanner = [];
      const bStairStepsConc = [];
      const bStairStepsSteel = [];
      const bStairSlopeBvh = [];

      const navNodes = [];
      const navEdges = [];
      const addNavNode = (x, y, z, tag, mergeTol) => {
        const tol = mergeTol !== undefined ? mergeTol : 1.05;
        for (let i = 0; i < navNodes.length; i++) {
          const n = navNodes[i];
          if (Math.abs(n.y - y) <= 0.45 && Math.hypot(n.x - x, n.z - z) <= tol) return i;
        }
        const id = navNodes.length;
        navNodes.push({ id, x, y, z, tag: tag || 'walk' });
        return id;
      };
      const addNavLink = (idA, idB, mult) => {
        if (idA < 0 || idB < 0 || idA === idB) return;
        const a = navNodes[idA], b = navNodes[idB];
        const cost = Math.hypot(b.x - a.x, (b.y - a.y) * 1.35, b.z - a.z) * (mult || 1.0);
        navEdges.push({ a: idA, b: idB, cost });
      };
      const addNavChain = (pts, tag) => {
        let prev = -1;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const cur = addNavNode(p[0], p[1], p[2], tag, p[3]);
          if (prev >= 0) addNavLink(prev, cur, 1.0);
          prev = cur;
        }
        return prev;
      };

      const addWedgeRamp = (bucket, minX, minZ, maxX, maxZ, yAtMin, yAtMax, axis, slopeOnly) => {
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
      };

      const layout = arch.layout || 'SIDE_DUAL';
      const isCawang = layout === 'CAWANG_HUB';
      const isDepot = layout === 'ISLAND_DEPOT';
      const isIsland = layout === 'ISLAND_CENTRAL' || isCawang || isDepot;

      // Clamp platform length <= 124m ([-62..+62]) so level crossings at z = ±74 are 100% open across all 6 archetypes!
      const platLen = Math.min(arch.platLen || dims.platformLength || 120, 124);
      const halfPlat = platLen * 0.5;
      const psdX = dims.psdEdgeX || 1.46;
      const p1MinX = psdX;
      const p1Width = isIsland ? (arch.islandWidth || dims.islandPlatformWidth) : 5.60;
      const p1MaxX = p1MinX + p1Width;
      const platMinZ = -halfPlat;
      const platMaxZ = halfPlat;
      const track2X = isIsland ? (p1MaxX + 1.46) : (dims.track2X || -4.70);
      this._railConfig = {
        isIsland: isIsland,
        track1X: 0.0,
        track2X: track2X,
        psd1X: psdX,
        psd2X: track2X - 1.46,
        platEdge1X: psdX,
        platEdge2X: track2X - 1.46,
        p1MinX: p1MinX,
        p1MaxX: p1MaxX,
        p2MinX: isIsland ? p1MinX : (track2X - 1.46 - 5.20),
        p2MaxX: track2X - 1.46
      };

      // =========================================================
      // 1. AT-GRADE GROUND-LEVEL BALLASTED TRACKS (railTopY = -1.00)
      // =========================================================
      const trackXs = isCawang ? [-4.70, 0.0, track2X, track2X + 4.70] : [0.0, track2X];
      const buildAtGradeTrack = (tx) => {
        // Ballast bed trough inside station bounds (pausing cleanly at z = ±74 level crossings!)
        const segLen = (CROSSING_Z_NORTH - CROSSING_HALF_W) - (CROSSING_Z_SOUTH + CROSSING_HALF_W); // -68 .. +68
        const segCZ = 0.0;
        addBox(bConcreteRough, 3.30, 0.08, segLen, tx, TRACK_BED_Y + 0.04, segCZ, 0, 0, 0, 1.5, segLen * 0.25);
        // Continuous steel running rails (1.435m gauge, rail top flush at -1.00!)
        const railSpanLen = (CROSSING_Z_NORTH + CROSSING_HALF_W) - (CROSSING_Z_SOUTH - CROSSING_HALF_W); // -80 .. +80
        addBox(bSteelDark, 0.10, 0.14, railSpanLen, tx - 0.7175, RAIL_TOP_Y - 0.07, 0, 0, 0, 0, 1, railSpanLen * 0.3);
        addBox(bSteelDark, 0.10, 0.14, railSpanLen, tx + 0.7175, RAIL_TOP_Y - 0.07, 0, 0, 0, 0, 1, railSpanLen * 0.3);
        // 750V DC third rail coverboard (inside platform bounds only, pausing before crossings!)
        addBox(bSteelDark, 0.20, 0.14, platLen - 2.0, tx - 1.15, RAIL_TOP_Y + 0.05, 0, 0, 0, 0, 1, platLen * 0.25);
        // Concrete sleepers along ballasted bed (-67 .. +67)
        for (let sz = -66.6; sz <= 66.6; sz += 1.2) {
          addBox(bConcrete, 2.25, 0.10, 0.24, tx, TRACK_BED_Y + 0.09, sz, 0, 0, 0, 1, 1);
        }
      };
      for (let ti = 0; ti < trackXs.length; ti++) {
        buildAtGradeTrack(trackXs[ti]);
      }

      // Grounded trackbed floor colliders (y = -1.10) between z = -68 .. +68 so players/zombies never fall below -1.12
      const trackMinX = Math.min.apply(null, trackXs) - 1.7;
      const trackMaxX = Math.max.apply(null, trackXs) + 1.7;
      this._addCollider(trackMinX, -1.25, CROSSING_Z_SOUTH + CROSSING_HALF_W, trackMaxX, -1.10, CROSSING_Z_NORTH - CROSSING_HALF_W, 'floor', {
        isFloor: true, blocksWalk: true, blocksBullets: false
      });

      // =========================================================
      // 2. GROUNDED PLATFORMS 1 & 2 / ISLAND 2 (y = -1.16 .. 0.0)
      // =========================================================
      addBox(bConcrete, p1Width, 1.12, platLen, (p1MinX + p1MaxX) * 0.5, -0.60, 0, 0, 0, 0, p1Width * 0.4, platLen * 0.25);
      addBox(bTerrazzo, p1Width, 0.04, platLen, (p1MinX + p1MaxX) * 0.5, -0.02, 0, 0, 0, 0, p1Width / 2.4, platLen / 2.4);
      this._addCollider(p1MinX, -1.18, platMinZ, p1MaxX, 0.0, platMaxZ, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

      const tacX = p1MinX + (dims.tactileOffsetFromPsd || 0.60) + (dims.tactileWidth || 0.45) * 0.5;
      addBox(bTactile, dims.tactileWidth || 0.45, 0.015, platLen - 6, tacX, 0.008, 0, 0, 0, 0, 0.8, (platLen - 6) * 0.7);
      if (isIsland) {
        addBox(bTactile, dims.tactileWidth || 0.45, 0.015, platLen - 6, p1MaxX - 0.82, 0.008, 0, 0, 0, 0, 0.8, (platLen - 6) * 0.7);
      }

      const i2MinX = track2X + 4.70 + 1.42;
      const i2Width = 9.0;
      const i2MaxX = i2MinX + i2Width;
      const p2MaxX = track2X - 1.46;
      const p2MinX = p2MaxX - 5.20;

      // Exterior stair/ramp helper (connects y = 0.0 <-> -0.82, or y = 4.25 <-> -0.82 with side blocking rails!)
      const stairZones = [];
      const registerStairZone = (sx, zFoot, zTop) => {
        stairZones.push({
          sx: sx,
          minX: sx - 2.6, maxX: sx + 2.6,
          minZ: Math.min(zFoot, zTop) - 2.6, maxZ: Math.max(zFoot, zTop) + 2.6,
          footZ: zFoot, topZ: zTop
        });
      };
      const isInStairExclusion = (x, z, extraX, extraZ) => {
        const ex = extraX || 0;
        const ez = extraZ || 0;
        for (let i = 0; i < stairZones.length; i++) {
          const s = stairZones[i];
          if (x >= s.minX - ex && x <= s.maxX + ex && z >= s.minZ - ez && z <= s.maxZ + ez) {
            return true;
          }
        }
        return false;
      };

      const addSlopedBeam = (bucket, w, h, x, z0, y0, z1, y1) => {
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
      };

      const addSlopedBeamX = (bucket, w, h, z, x0, y0, x1, y1) => {
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
      };

      // Exterior Grounded Stair or Smooth Ramp connecting highY <-> lowY along axis ('x' or 'z')
      const buildGroundedTransition = (cx, cz, width, run, highY, lowY, axis, highAtNeg, isStair) => {
        const hw = width * 0.5;
        const hr = run * 0.5;
        const minX = axis === 'x' ? cx - hr : cx - hw;
        const maxX = axis === 'x' ? cx + hr : cx + hw;
        const minZ = axis === 'z' ? cz - hr : cz - hw;
        const maxZ = axis === 'z' ? cz + hr : cz + hw;
        const y0 = highAtNeg ? highY : lowY;
        const y1 = highAtNeg ? lowY : highY;

        if (isStair) {
          const steps = Math.max(5, Math.round(Math.abs(highY - lowY) * 7));
          const stepRun = run / steps;
          for (let s = 0; s < steps; s++) {
            const frac = (s + 0.5) / steps;
            const syTop = y0 + (y1 - y0) * frac;
            const stepH = Math.max(0.14, syTop - (lowY - 0.16));
            if (axis === 'x') {
              const sx = minX + (s + 0.5) * stepRun;
              addBox(bStairStepsConc, stepRun + 0.02, stepH, width, sx, syTop - stepH * 0.5, cz, 0, 0, 0, 1, width * 0.5);
            } else {
              const sz = minZ + (s + 0.5) * stepRun;
              addBox(bStairStepsConc, width, stepH, stepRun + 0.02, cx, syTop - stepH * 0.5, sz, 0, 0, 0, width * 0.5, 1);
            }
          }
          addWedgeRamp(bStairSlopeBvh, minX, minZ, maxX, maxZ, y0, y1, axis, true);
        } else {
          // Smooth poured-concrete ADA ramp wedge (walkable & raycastable without riser snags)
          addWedgeRamp(bConcreteRough, minX, minZ, maxX, maxZ, y0, y1, axis, false);
        }

        // Handrails + Side Guard Colliders (prevents clipping sideways into ramp/stairs!)
        const minY = Math.min(lowY, highY);
        const maxY = Math.max(lowY, highY);
        if (axis === 'x') {
          for (const sideSign of [-1, 1]) {
            const rz = cz + sideSign * (hw + 0.06);
            addSlopedBeamX(bTruss, 0.06, 0.06, rz, minX, y0 + 0.88, maxX, y1 + 0.88);
            addBox(bTruss, 0.05, 0.90, 0.05, minX + 0.12, y0 + 0.45, rz);
            addBox(bTruss, 0.05, 0.90, 0.05, maxX - 0.12, y1 + 0.45, rz);
            this._addCollider(minX, minY, rz - 0.08, maxX, maxY + 1.0, rz + 0.08, 'metal', { blocksBullets: false });
          }
        } else {
          for (const sideSign of [-1, 1]) {
            const rx = cx + sideSign * (hw + 0.06);
            addSlopedBeam(bTruss, 0.06, 0.06, rx, minZ, y0 + 0.88, maxZ, y1 + 0.88);
            addBox(bTruss, 0.05, 0.90, 0.05, rx, y0 + 0.45, minZ + 0.12);
            addBox(bTruss, 0.05, 0.90, 0.05, rx, y1 + 0.45, maxZ - 0.12);
            this._addCollider(rx - 0.08, minY, minZ, rx + 0.08, maxY + 1.0, maxZ, 'metal', { blocksBullets: false });
          }
        }

        const cid = this._addCollider(minX, minY - 0.15, minZ, maxX, maxY + 0.15, maxZ, 'ramp', {
          isRamp: true, blocksWalk: true, blocksBullets: false
        });
        const rc = this.colliders[cid];
        rc.rampAxis = axis;
        rc.y0 = y0;
        rc.y1 = y1;
        if (axis === 'x') {
          addNavChain([
            [minX - 0.65, y0, cz, 0.75],
            [cx, (y0 + y1) * 0.5, cz, 0.5],
            [maxX + 0.65, y1, cz, 0.75]
          ], isStair ? 'stair_ramp' : 'ada_ramp');
        } else {
          addNavChain([
            [cx, y0, minZ - 0.65, 0.75],
            [cx, (y0 + y1) * 0.5, cz, 0.5],
            [cx, y1, maxZ + 0.65, 0.75]
          ], isStair ? 'stair_ramp' : 'ada_ramp');
        }
      };

      // Platform 1 North & South End Guardrails WITH 3.8m OPEN EXIT PORTALS + Exterior Stairs down to -0.82!
      const buildEndGateAndStairs = (xMin, xMax, zEdge, isNorth) => {
        const w = xMax - xMin;
        const cx = (xMin + xMax) * 0.5;
        const gateHalf = 1.9;
        const sideW = Math.max(0.4, (w - gateHalf * 2) * 0.5);
        const wallZ = isNorth ? zEdge - 0.18 : zEdge + 0.18;
        if (w > gateHalf * 2 + 0.8) {
          addBox(bConcrete, sideW, 1.35, 0.35, xMin + sideW * 0.5, 0.68, wallZ);
          addBox(bConcrete, sideW, 1.35, 0.35, xMax - sideW * 0.5, 0.68, wallZ);
          this._addCollider(xMin, 0, wallZ - 0.22, cx - gateHalf, 1.8, wallZ + 0.22, 'concrete');
          this._addCollider(cx + gateHalf, 0, wallZ - 0.22, xMax, 1.8, wallZ + 0.22, 'concrete');
        }
        const run = 3.2;
        const stairCZ = isNorth ? zEdge + run * 0.5 : zEdge - run * 0.5;
        buildGroundedTransition(cx, stairCZ, Math.min(3.6, w - 0.4), run, 0.0, SIDEWALK_Y, 'z', isNorth, true);
      };
      buildEndGateAndStairs(p1MinX, p1MaxX, platMinZ, false);
      buildEndGateAndStairs(p1MinX, p1MaxX, platMaxZ, true);

      // Opposite Platform 2 (for SIDE_DUAL) or Walkable Island 2 (for CAWANG_HUB)
      if (!isIsland) {
        addBox(bConcrete, 5.20, 1.12, platLen, (p2MinX + p2MaxX) * 0.5, -0.60, 0, 0, 0, 0, 2, platLen * 0.25);
        addBox(bTerrazzo, 5.20, 0.04, platLen, (p2MinX + p2MaxX) * 0.5, -0.02, 0, 0, 0, 0, 2.2, platLen / 2.4);
        addBox(bTactile, dims.tactileWidth || 0.45, 0.015, platLen - 6, p2MaxX - 0.82, 0.008, 0, 0, 0, 0, 0.8, (platLen - 6) * 0.7);
        this._addCollider(p2MinX, -1.18, platMinZ, p2MaxX, 0.0, platMaxZ, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

        // Platform 2 outer windscreen with OPEN 5.2m West Street Exit Portal at z in [-2.6 .. +2.6]!
        const p2DoorZ0 = -2.6, p2DoorZ1 = 2.6;
        const sSeg = p2DoorZ0 - platMinZ;
        const nSeg = platMaxZ - p2DoorZ1;
        addBox(bConcrete, 0.35, 1.25, sSeg, p2MinX + 0.18, 0.62, platMinZ + sSeg * 0.5, 0, 0, 0, 1, sSeg * 0.2);
        addBox(bConcrete, 0.35, 1.25, nSeg, p2MinX + 0.18, 0.62, p2DoorZ1 + nSeg * 0.5, 0, 0, 0, 1, nSeg * 0.2);
        this._addCollider(p2MinX, 0.0, platMinZ, p2MinX + 0.35, 2.6, p2DoorZ0, 'concrete');
        this._addCollider(p2MinX, 0.0, p2DoorZ1, p2MinX + 0.35, 2.6, platMaxZ, 'concrete');
        // West Exit Stairs + Ramp descending to -0.82 West Promenade Sidewalk
        buildGroundedTransition(p2MinX - 1.8, 0.0, 4.8, 3.6, 0.0, SIDEWALK_Y, 'x', false, true);

        for (let lz = platMinZ + 4; lz <= platMaxZ - 4; lz += 6.5) {
          if (lz > p2DoorZ0 - 2.0 && lz < p2DoorZ1 + 2.0) continue;
          addBox(bSteelDark, 0.14, 1.65, 5.8, p2MinX + 0.18, 2.04, lz);
        }
        buildEndGateAndStairs(p2MinX, p2MaxX, platMinZ, false);
        buildEndGateAndStairs(p2MinX, p2MaxX, platMaxZ, true);
      } else if (isCawang) {
        addBox(bConcrete, i2Width, 1.12, platLen, (i2MinX + i2MaxX) * 0.5, -0.60, 0, 0, 0, 0, 3, platLen * 0.25);
        addBox(bTerrazzo, i2Width, 0.04, platLen, (i2MinX + i2MaxX) * 0.5, -0.02, 0, 0, 0, 0, 3.5, platLen / 2.4);
        addBox(bTactile, dims.tactileWidth || 0.45, 0.015, platLen - 6, i2MinX + 0.82, 0.008, 0, 0, 0, 0, 0.8, (platLen - 6) * 0.7);
        this._addCollider(i2MinX, -1.18, platMinZ, i2MaxX, 0.0, platMaxZ, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

        addBox(bSteelDark, 0.22, 1.40, platLen - 14, i2MinX + 0.12, 0.70, 0);
        this._addCollider(i2MinX, 0, platMinZ + 7, i2MinX + 0.26, 1.5, platMaxZ - 7, 'metal');

        // Island 2 East outer wall with 6m Open East Street Exit Portal at z in [10 .. 16]
        const i2DoorZ0 = 10.0, i2DoorZ1 = 16.0;
        const i2S = i2DoorZ0 - platMinZ;
        const i2N = platMaxZ - i2DoorZ1;
        addBox(bConcrete, 0.35, 1.25, i2S, i2MaxX - 0.18, 0.62, platMinZ + i2S * 0.5);
        addBox(bConcrete, 0.35, 1.25, i2N, i2MaxX - 0.18, 0.62, i2DoorZ1 + i2N * 0.5);
        this._addCollider(i2MaxX - 0.38, 0, platMinZ, i2MaxX, 2.6, i2DoorZ0, 'concrete');
        this._addCollider(i2MaxX - 0.38, 0, i2DoorZ1, i2MaxX, 2.6, platMaxZ, 'concrete');
        buildGroundedTransition(i2MaxX + 1.8, 13.0, 5.2, 3.6, 0.0, SIDEWALK_Y, 'x', true, true);

        for (let lz = platMinZ + 4; lz <= platMaxZ - 4; lz += 6.5) {
          if (lz > i2DoorZ0 - 2 && lz < i2DoorZ1 + 2) continue;
          addBox(bSteelDark, 0.14, 1.65, 5.8, i2MaxX - 0.18, 2.04, lz);
        }
        buildEndGateAndStairs(i2MinX, i2MaxX, platMinZ, false);
        buildEndGateAndStairs(i2MinX, i2MaxX, platMaxZ, true);

        const wreckX = track2X + 4.70;
        if (LRT.Train && typeof LRT.Train.createStaticLrtConsist === 'function') {
          const derelictTrain = LRT.Train.createStaticLrtConsist({ carCount: 2, derelict: true, name: 'CawangDerelictConsist' });
          derelictTrain.position.set(wreckX + 0.12, 0.0, 6.0);
          derelictTrain.rotation.set(0.014, 0.035, -0.055);
          derelictTrain.traverse((ch) => {
            if (ch.isMesh && ch.geometry) this.disposableGeometries.push(ch.geometry);
          });
          root.add(derelictTrain);
        }
        this._addCollider(wreckX - 1.38, -1.0, -11.6, wreckX + 1.48, 3.15, 23.6, 'metal');
        addAtlasBox(bStall, 0.95, 0.85, 0.55, i2MaxX - 2.2, 0.425, 22.0, -Math.PI * 0.5, null, STALL_UV.jaklingko);
        this._addCollider(i2MaxX - 2.7, 0, 21.5, i2MaxX - 1.7, 0.9, 22.5, 'metal');
        const i2Used = this._usedIds.has('island2_supply');
        this.interactables.push({
          id: 'island2_supply', type: 'balcony_supply', x: i2MaxX - 2.6, y: 1.0, z: 22.0,
          label: i2Used ? '[E] Loker Darurat Peron 4 Cawang (Sudah Diambil)' : '[E] Loker Darurat Peron 4 Cawang (+Amunisi & +25 HP)',
          prompt: i2Used ? '[E] Loker Darurat Peron 4 Cawang (Sudah Diambil)' : '[E] Loker Darurat Peron 4 Cawang (+Amunisi & +25 HP)',
          used: i2Used
        });

        const cabUsed = this._usedIds.has('cawang_derelict_cab');
        this.interactables.push({
          id: 'cawang_derelict_cab',
          type: 'derelict_fuse',
          x: wreckX - 1.55,
          y: 1.0,
          z: -10.5,
          label: cabUsed ? '[E] Kabin Bangkai LRT Cawang (Sudah Digeledah)' : '[E] Periksa Kabin Bangkai LRT Cawang (+Sekring Bypass & Shotgun 12G)',
          prompt: cabUsed ? '[E] Kabin Bangkai LRT Cawang (Sudah Digeledah)' : '[E] Periksa Kabin Bangkai LRT Cawang (+Sekring Bypass & Shotgun 12G)',
          used: cabUsed
        });
      }

      // =========================================================
      // 3. CONCOURSE HALL WING, OPEN STREET PORTALS & JPO OVERHEAD SKYBRIDGE
      // =========================================================
      const cw = arch.concourseWidth || 13.5;
      const concLen = Math.min(arch.concourseLen || 36.0, 48.0);
      const rawConcMin = arch.concourseEnd === 'south' ? Math.round(-concLen - 2)
        : arch.concourseEnd === 'north' ? 2 : Math.round(-concLen * 0.5);
      const concMinZ = Math.max(platMinZ + 4, Math.min(platMaxZ - concLen - 4, rawConcMin));
      const concMaxZ = concMinZ + concLen;
      const concMinX = p1MaxX;
      const concMaxX = isIsland ? p1MaxX : concMinX + cw;
      const concMidZ = (concMinZ + concMaxZ) * 0.5;
      const glassRecords = [];

      let canopySpanX, canopyCenterX;
      if (isCawang) {
        canopySpanX = 38.5;
        canopyCenterX = 11.4;
      } else if (isIsland) {
        canopySpanX = p1Width + 5.8;
        canopyCenterX = (p1MinX + p1MaxX) * 0.5;
      } else {
        const canopyMinTgt = -12.2;
        const canopyMaxTgt = concMaxX - 4.0;
        canopySpanX = canopyMaxTgt - canopyMinTgt;
        canopyCenterX = (canopyMinTgt + canopyMaxTgt) * 0.5;
      }
      const canopyMinX = canopyCenterX - canopySpanX * 0.5;
      const canopyMaxX = canopyCenterX + canopySpanX * 0.5;
      const apexY = isCawang ? (dims.cawangApexY || 12.60) : (dims.canopyApexY || 9.85);
      const eaveY = dims.canopyEaveY || 7.15;
      const segs = 10; // Smooth curved barrel-vault canopy segments!

      const getCanopyArchY = (x) => {
        const t = Math.max(0, Math.min(1, (x - canopyMinX) / canopySpanX));
        const kf = t * segs;
        const k = Math.min(segs - 1, Math.floor(kf));
        const f = kf - k;
        const y0 = eaveY + Math.sin((k / segs) * Math.PI) * (apexY - eaveY);
        const y1 = eaveY + Math.sin(((k + 1) / segs) * Math.PI) * (apexY - eaveY);
        return y0 + (y1 - y0) * f;
      };

      const buildStairRamp = (sx, zFoot, zTop, topY, botYArg) => {
        const yBot = botYArg !== undefined ? botYArg : 0.0;
        const yTarget = topY !== undefined ? topY : UPPER_FLOOR_Y;
        const rise = yTarget - yBot;
        registerStairZone(sx, zFoot, zTop);
        const steps = Math.max(12, Math.round(Math.abs(rise) * 4.2));
        const stepRise = rise / steps;
        const dir = zTop > zFoot ? 1 : -1;
        const stepRun = Math.abs(zTop - zFoot) / steps;
        for (let s = 0; s < steps; s++) {
          const syTop = yBot + (s + 1) * stepRise;
          const sz = zFoot + dir * (s + 0.5) * stepRun;
          addBox(bStairStepsSteel, 2.2, Math.abs(stepRise), stepRun + 0.02, sx, syTop - Math.abs(stepRise) * 0.5, sz);
        }
        const minSZ = Math.min(zFoot, zTop);
        const maxSZ = Math.max(zFoot, zTop);
        const yAtMinZ = zTop > zFoot ? yBot : yTarget;
        const yAtMaxZ = zTop > zFoot ? yTarget : yBot;
        addWedgeRamp(bStairSlopeBvh, sx - 1.1, minSZ, sx + 1.1, maxSZ, yAtMinZ, yAtMaxZ, 'z', true);
        for (let s = 0; s < 6; s++) {
          const f0 = s / 6;
          const f1 = (s + 1) / 6;
          const z0 = zFoot + (zTop - zFoot) * f0;
          const z1 = zFoot + (zTop - zFoot) * f1;
          const y0 = yBot + rise * f0;
          const y1 = yBot + rise * f1;
          const segMinY = Math.min(y0, y1);
          const segMaxY = Math.max(y0, y1);
          const segMinZ = Math.min(z0, z1);
          const segMaxZ = Math.max(z0, z1);
          const floorY = Math.min(yBot, yTarget);
          const headroom = segMinY - floorY;
          const colMinY = headroom < 2.00 ? (floorY - 0.1) : (segMinY - 0.26);
          const colMaxY = segMaxY + 0.1;
          const cid = this._addCollider(sx - 1.1, colMinY, segMinZ, sx + 1.1, colMaxY, segMaxZ, 'metal', {
            isRamp: true, blocksWalk: true, blocksBullets: false
          });
          const rc = this.colliders[cid];
          rc.rampAxis = 'z';
          rc.y0 = zTop > zFoot ? y0 : y1;
          rc.y1 = zTop > zFoot ? y1 : y0;
        }

        const postFracs = [0.04, 0.28, 0.52, 0.76, 0.96];
        for (const sideSign of [-1, 1]) {
          const rx = sx + sideSign * 1.13;
          addSlopedBeam(bSteelDark, 0.08, 0.24, rx, zFoot, yBot, zTop, yTarget - 0.24);
          addSlopedBeam(bTruss, 0.06, 0.06, rx, zFoot, yBot + 0.90, zTop, yTarget + 0.90);
          addSlopedBeam(bTruss, 0.035, 0.035, rx, zFoot, yBot + 0.48, zTop, yTarget + 0.48);
          for (let p = 0; p < postFracs.length; p++) {
            const pf = postFracs[p];
            const pz = zFoot + (zTop - zFoot) * pf;
            const py = yBot + rise * pf;
            addBox(bTruss, 0.05, 0.92, 0.05, rx, py + 0.46, pz);
          }
          // Stepped side guardrail colliders: where headroom is >= 2.00m, allow walking underneath
          for (let s = 0; s < 6; s++) {
            const f0 = s / 6;
            const f1 = (s + 1) / 6;
            const z0 = zFoot + (zTop - zFoot) * f0;
            const z1 = zFoot + (zTop - zFoot) * f1;
            const y0 = yBot + rise * f0;
            const y1 = yBot + rise * f1;
            const segMinY = Math.min(y0, y1);
            const segMaxY = Math.max(y0, y1);
            const segMinZ = Math.min(z0, z1);
            const segMaxZ = Math.max(z0, z1);
            const floorY = Math.min(yBot, yTarget);
            const headroom = segMinY - floorY;
            const colMinY = headroom < 2.00 ? floorY : (segMinY - 0.26);
            const colMaxY = segMaxY + 1.02;
            this._addCollider(rx - 0.08, colMinY, segMinZ, rx + 0.08, colMaxY, segMaxZ, 'metal', { blocksBullets: false });
          }
        }
        addNavChain([
          [sx, yBot, zFoot - dir * 0.75, 0.75],
          [sx, yBot + rise * 0.25, zFoot + (zTop - zFoot) * 0.25, 0.5],
          [sx, (yBot + yTarget) * 0.5, (zFoot + zTop) * 0.5, 0.5],
          [sx, yBot + rise * 0.75, zFoot + (zTop - zFoot) * 0.75, 0.5],
          [sx, yTarget, zTop + dir * 0.75, 0.75]
        ], 'jpo_stair');
      };

      const gardenMaxX = arch.hasGardenTerrace ? (track2X + 12.2) : p1MaxX;
      const depotMaxX = arch.hasDepotShed ? (p1MaxX + 9.6) : p1MaxX;
      const corridorMinX = isIsland
        ? (isCawang ? -7.2 : (arch.hasDepotShed ? -6.2 : -2.4))
        : (p2MinX - 0.2);
      const corridorMaxX = isIsland
        ? (isCawang ? i2MaxX + 0.4 : Math.max(track2X + 2.4, depotMaxX + 0.4, gardenMaxX + 0.4))
        : (concMaxX + 0.2);

      const jpoZ = isCawang ? 0.0 : (arch.id === 'harjamukti' ? 24.0 : (arch.concourseEnd === 'north' ? 49.0 : (arch.concourseEnd === 'south' ? -49.0 : 34.0)));
      const jpoDepth = isCawang ? 20.0 : 5.4;
      const jpoSpanMinX = isIsland ? (corridorMinX - 3.4) : -11.3;
      const jpoSpanMaxX = isIsland ? (corridorMaxX + 3.4) : (p1MaxX + 4.2);
      const jpoW = jpoSpanMaxX - jpoSpanMinX;
      const jpoCX = (jpoSpanMinX + jpoSpanMaxX) * 0.5;
      const jpoNearZ = jpoZ > 0 ? jpoZ - jpoDepth * 0.5 : (jpoZ < 0 ? jpoZ + jpoDepth * 0.5 : -jpoDepth * 0.5);
      const jpoFarZ = jpoZ > 0 ? jpoZ + jpoDepth * 0.5 : (jpoZ < 0 ? jpoZ - jpoDepth * 0.5 : jpoDepth * 0.5);
      const stairX = isIsland ? p1MinX + 4.8 : p1MaxX - 1.75;
      const stairFootZ = jpoZ >= 0 ? jpoNearZ - 9.5 : jpoNearZ + 9.5;
      const stairTopZ = jpoNearZ;

      const swX = concMinX + 2.2;
      const swW = 3.4;
      const swMinX = swX - swW * 0.5;
      const swMaxX = swX + swW * 0.5;
      let cStairX = concMaxX - 1.70;
      let cStairFootZ = concMidZ - 5.0;
      let cStairTopZ = concMidZ + 5.0;
      let stairWellMinX = concMaxX - 3.0;

      if (!isIsland) {
        const cz = concMidZ;
        const cx = (concMinX + concMaxX) * 0.5;
        // Grounded concourse concrete substructure (-1.16 .. -0.04) + checker tile (-0.04 .. 0.0)
        addBox(bConcrete, cw, 1.12, concLen, cx, -0.60, cz, 0, 0, 0, cw * 0.4, concLen * 0.25);
        addBox(bChecker, cw, 0.04, concLen, cx, -0.02, cz, 0, 0, 0, cw / 2.4, concLen / 2.4);
        this._addCollider(concMinX, -1.18, concMinZ, concMaxX, 0.0, concMaxZ, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

        // OPEN 10m EAST CONCOURSE PORTAL (z in [concMidZ - 5.0 .. concMidZ + 5.0]) + Grand Stairs + ADA Ramp!
        const portalZ0 = concMidZ - 5.0;
        const portalZ1 = concMidZ + 5.0;
        const sWallLen = Math.max(0.5, portalZ0 - concMinZ);
        const nWallLen = Math.max(0.5, concMaxZ - portalZ1);
        addBox(bConcrete, 0.4, 7.10, sWallLen, concMaxX - 0.2, 3.55, concMinZ + sWallLen * 0.5, 0, 0, 0, 4, 2.5);
        addBox(bConcrete, 0.4, 7.10, nWallLen, concMaxX - 0.2, 3.55, portalZ1 + nWallLen * 0.5, 0, 0, 0, 4, 2.5);
        // Header lintel above 4.25m portal (keeps 0..4.25m doorway completely wide open!)
        addBox(bConcrete, 0.45, 2.85, 10.0, concMaxX - 0.2, 5.68, concMidZ, 0, 0, 0, 3, 1.0);
        // Exterior architectural articulation (pilasters, base plinth, dark steel belly/cornice bands, louver bays & portal banner)
        addBox(bConcreteRough, 0.16, 1.15, sWallLen, concMaxX + 0.04, 0.15, concMinZ + sWallLen * 0.5, 0, 0, 0, sWallLen * 0.2, 0.5);
        addBox(bConcreteRough, 0.16, 1.15, nWallLen, concMaxX + 0.04, 0.15, portalZ1 + nWallLen * 0.5, 0, 0, 0, nWallLen * 0.2, 0.5);
        addBox(bSteelDark, 0.14, 0.22, concLen + 0.2, concMaxX + 0.05, 3.15, concMidZ);
        addBox(bSteelDark, 0.22, 0.36, concLen + 0.3, concMaxX + 0.06, 6.95, concMidZ);
        for (const [wStart, wEnd] of [[concMinZ + 0.6, portalZ0 - 0.6], [portalZ1 + 0.6, concMaxZ - 0.6]]) {
          const span = wEnd - wStart;
          if (span <= 1.2) continue;
          const bays = Math.max(1, Math.round(span / 6.5));
          const step = span / bays;
          for (let bi = 0; bi <= bays; bi++) {
            const pz = wStart + bi * step;
            addBox(bConcreteRough, 0.28, 7.20, 0.48, concMaxX + 0.08, 3.55, pz, 0, 0, 0, 0.5, 2.5);
          }
          for (let bi = 0; bi < bays; bi++) {
            const bayMidZ = wStart + (bi + 0.5) * step;
            const bayLen = Math.max(0.8, step - 0.85);
            addBox(bSteelDark, 0.10, 1.45, bayLen, concMaxX + 0.03, 5.15, bayMidZ);
            for (const slY of [4.65, 5.00, 5.35, 5.70]) {
              addBox(bTruss, 0.14, 0.06, bayLen - 0.12, concMaxX + 0.06, slY, bayMidZ);
            }
          }
        }
        addAtlasQuad(bBanner, 8.2, 1.05, concMaxX + 0.125, 5.45, concMidZ, 0, Math.PI * 0.5, 0, [0, 0, 1, 1]);
        addBox(bSteelDark, 0.12, 1.18, 8.45, concMaxX + 0.05, 5.45, concMidZ);
        this._addCollider(concMaxX - 0.4, 0, concMinZ, concMaxX, 7.1, portalZ0, 'concrete');
        this._addCollider(concMaxX - 0.4, 0, portalZ1, concMaxX, 7.1, concMaxZ, 'concrete');
        this._addCollider(concMaxX - 0.45, UPPER_FLOOR_Y, portalZ0, concMaxX, 7.1, portalZ1, 'concrete');

        // Arched Entrance Marquee Canopy over East Concourse Portal
        const marqShape = new THREE.Shape();
        marqShape.moveTo(0, 0);
        marqShape.quadraticCurveTo(2.4, 1.05, 4.8, 0.10);
        marqShape.lineTo(4.8, -0.14);
        marqShape.quadraticCurveTo(2.4, 0.80, 0, -0.22);
        marqShape.closePath();
        const marqGeo = new THREE.ExtrudeGeometry(marqShape, { depth: 11.4, bevelEnabled: false, curveSegments: 8 });
        marqGeo.translate(concMaxX - 0.1, 4.15, concMidZ - 5.7);
        bRoof.push(prepGeo(marqGeo, false));
        addCylinder(bTruss, 0.11, 0.14, 5.0, 8, concMaxX + 4.3, 1.75, concMidZ - 5.2);
        addCylinder(bTruss, 0.11, 0.14, 5.0, 8, concMaxX + 4.3, 1.75, concMidZ + 5.2);

        // Monumental East Concourse Stairs (5.2m wide) + Sloped 1:6 ADA Ramp (3.2m wide) down to -0.82 sidewalk!
        buildGroundedTransition(concMaxX + 1.7, concMidZ - 2.1, 5.2, 3.4, 0.0, SIDEWALK_Y, 'x', true, true);
        buildGroundedTransition(concMaxX + 2.4, concMidZ + 2.6, 3.2, 4.8, 0.0, SIDEWALK_Y, 'x', true, false);

        // At-Grade TransJakarta Feeder Halte Plaza (right on the East Promenade at y = -0.82!)
        if (arch.hasFeederSkywalk) {
          const haltZ = concMidZ >= 0 ? concMinZ + 7.5 : concMaxZ - 7.5;
          const hxMin = concMaxX + 3.2;
          const hxMax = concMaxX + 6.4;
          const hCX = (hxMin + hxMax) * 0.5;
          addBox(bConcrete, 3.2, 0.24, 12.0, hCX, SIDEWALK_Y + 0.12, haltZ);
          addBox(bTactile, 0.45, 0.015, 11.4, hxMax - 0.45, SIDEWALK_Y + 0.25, haltZ);
          addBox(bJpo, 3.6, 0.20, 12.6, hCX, SIDEWALK_Y + 3.15, haltZ, 0, 0, 0, 2, 4);
          for (const hpz of [haltZ - 5.2, haltZ, haltZ + 5.2]) {
            addCylinder(bSteelDark, 0.10, 0.12, 3.1, 8, hxMin + 0.35, SIDEWALK_Y + 1.55, hpz);
          }
          addAtlasBox(bStall, 0.95, 0.85, 0.55, hxMin + 0.9, SIDEWALK_Y + 0.66, haltZ, Math.PI * 0.5, null, STALL_UV.jaklingko);
          this._addCollider(hxMin + 0.5, SIDEWALK_Y, haltZ - 0.5, hxMin + 1.3, SIDEWALK_Y + 1.1, haltZ + 0.5, 'metal');
          const fdrUsed = this._usedIds.has('feeder_supply');
          this.interactables.push({
            id: 'feeder_supply', type: 'balcony_supply', x: hxMin + 1.6, y: SIDEWALK_Y + 1.1, z: haltZ,
            label: fdrUsed ? '[E] Loker Pos Halte TransJakarta (Sudah Diambil)' : '[E] Loker Pos Halte TransJakarta (+Amunisi & +25 HP)',
            prompt: fdrUsed ? '[E] Loker Pos Halte TransJakarta (Sudah Diambil)' : '[E] Loker Pos Halte TransJakarta (+Amunisi & +25 HP)',
            used: fdrUsed
          });
        }

        // Concourse end walls (0..4.25)
        addBox(bConcrete, cw, 4.25, 0.4, cx, 2.125, concMinZ + 0.2, 0, 0, 0, 5, 1.5);
        addBox(bConcrete, cw, 4.25, 0.4, cx, 2.125, concMaxZ - 0.2, 0, 0, 0, 5, 1.5);

        const skyEdgeZ = jpoZ > 0 ? concMaxZ : concMinZ;
        const oppEdgeZ = jpoZ > 0 ? concMinZ : concMaxZ;
        const oppInsetZ = jpoZ > 0 ? concMinZ + 0.16 : concMaxZ - 0.16;
        const skyInsetZ = jpoZ > 0 ? concMaxZ - 0.16 : concMinZ + 0.16;

        this._addCollider(concMinX, 0, oppEdgeZ - 0.35, concMaxX, 5.5, oppEdgeZ + 0.35, 'concrete');
        this._addCollider(concMinX, 0, skyEdgeZ - 0.35, concMaxX, 4.20, skyEdgeZ + 0.35, 'concrete');
        addBox(bJpo, cw, 1.05, 0.24, cx, UPPER_FLOOR_Y + 0.525, oppInsetZ, 0, 0, 0, 5, 1);

        // Parapet glass on 2nd-floor Balcony West edge
        this._addCollider(concMinX, UPPER_FLOOR_Y, concMinZ, concMinX + 0.22, UPPER_FLOOR_Y + 1.15, concMaxZ, 'metal');
        addBox(bConcrete, 0.20, 0.22, concLen, concMinX + 0.10, UPPER_FLOOR_Y + 0.11, cz);
        addBox(bSteelDark, 0.12, 0.08, concLen, concMinX + 0.10, UPPER_FLOOR_Y + 1.12, cz);
        for (let bgz = concMinZ + 3.4; bgz <= concMaxZ - 3.4; bgz += 6.8) {
          const cid = this._addCollider(concMinX - 0.05, UPPER_FLOOR_Y + 0.22, bgz - 3.2, concMinX + 0.18, UPPER_FLOOR_Y + 1.10, bgz + 3.2, 'glass', { blocksWalk: false });
          glassRecords.push({
            cx: concMinX + 0.10, cy: UPPER_FLOOR_Y + 0.66, cz: bgz, w: 6.4, h: 0.84, d: 0.04,
            ry: Math.PI * 0.5, hp: 22, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cid
          });
          addBox(bSteelDark, 0.12, 0.90, 0.12, concMinX + 0.10, UPPER_FLOOR_Y + 0.67, bgz - 3.3);
        }
        addBox(bSteelDark, 0.12, 0.90, 0.12, concMinX + 0.10, UPPER_FLOOR_Y + 0.67, concMaxZ - 0.12);

        // Interior Grand Staircase to 2nd Floor Balcony
        cStairX = concMaxX - 2.35;
        if (jpoZ > 0) {
          cStairFootZ = concMidZ - 5.0;
          cStairTopZ = concMidZ + 5.0;
        } else {
          cStairFootZ = concMidZ + 5.0;
          cStairTopZ = concMidZ - 5.0;
        }
        const cStairMinZ = Math.min(cStairFootZ, cStairTopZ);
        const cStairMaxZ = Math.max(cStairFootZ, cStairTopZ);
        stairWellMinX = concMaxX - 3.6;

        const mainBalcW = stairWellMinX - concMinX;
        const mainBalcCX = concMinX + mainBalcW * 0.5;
        addBox(bConcrete, mainBalcW, 0.26, concLen, mainBalcCX, UPPER_FLOOR_Y - 0.15, cz, 0, 0, 0, mainBalcW * 0.35, concLen * 0.25);
        addBox(bTerrazzo, mainBalcW, 0.04, concLen, mainBalcCX, UPPER_FLOOR_Y - 0.02, cz, 0, 0, 0, mainBalcW / 2.4, concLen / 2.4);
        this._addCollider(concMinX, UPPER_FLOOR_Y - 0.28, concMinZ, stairWellMinX, UPPER_FLOOR_Y, concMaxZ, 'floor', { isFloor: true });

        const southPatchLen = Math.max(2.0, cStairMinZ - concMinZ);
        addBox(bConcrete, 3.6, 0.26, southPatchLen, stairWellMinX + 1.8, UPPER_FLOOR_Y - 0.15, concMinZ + southPatchLen * 0.5);
        addBox(bTerrazzo, 3.6, 0.04, southPatchLen, stairWellMinX + 1.8, UPPER_FLOOR_Y - 0.02, concMinZ + southPatchLen * 0.5);
        this._addCollider(stairWellMinX, UPPER_FLOOR_Y - 0.28, concMinZ, concMaxX, UPPER_FLOOR_Y, cStairMinZ, 'floor', { isFloor: true });

        const northPatchLen = Math.max(2.0, concMaxZ - cStairMaxZ);
        addBox(bConcrete, 3.6, 0.26, northPatchLen, stairWellMinX + 1.8, UPPER_FLOOR_Y - 0.15, cStairMaxZ + northPatchLen * 0.5);
        addBox(bTerrazzo, 3.6, 0.04, northPatchLen, stairWellMinX + 1.8, UPPER_FLOOR_Y - 0.02, cStairMaxZ + northPatchLen * 0.5);
        this._addCollider(stairWellMinX, UPPER_FLOOR_Y - 0.28, cStairMaxZ, concMaxX, UPPER_FLOOR_Y, concMaxZ, 'floor', { isFloor: true });

        const wellLen = cStairMaxZ - cStairMinZ;
        const wellMidZ = (cStairMinZ + cStairMaxZ) * 0.5;
        addBox(bTruss, 0.07, 0.07, wellLen, stairWellMinX - 0.06, UPPER_FLOOR_Y + 0.92, wellMidZ);
        addBox(bTruss, 0.04, 0.04, wellLen, stairWellMinX - 0.06, UPPER_FLOOR_Y + 0.48, wellMidZ);
        for (let wpz = cStairMinZ; wpz <= cStairMaxZ + 0.05; wpz += 2.5) {
          addBox(bTruss, 0.06, 0.94, 0.06, stairWellMinX - 0.06, UPPER_FLOOR_Y + 0.47, Math.min(cStairMaxZ, wpz));
        }
        this._addCollider(stairWellMinX - 0.12, UPPER_FLOOR_Y, cStairMinZ, stairWellMinX + 0.04, UPPER_FLOOR_Y + 1.15, cStairMaxZ, 'metal');

        const footEndW = (concMaxX - 0.4) - stairWellMinX;
        const footEndCX = stairWellMinX + footEndW * 0.5;
        addBox(bTruss, footEndW, 0.07, 0.07, footEndCX, UPPER_FLOOR_Y + 0.92, cStairFootZ);
        addBox(bTruss, footEndW, 0.04, 0.04, footEndCX, UPPER_FLOOR_Y + 0.48, cStairFootZ);
        addBox(bTruss, 0.06, 0.94, 0.06, footEndCX, UPPER_FLOOR_Y + 0.47, cStairFootZ);
        this._addCollider(stairWellMinX, UPPER_FLOOR_Y, cStairFootZ - 0.08, concMaxX - 0.4, UPPER_FLOOR_Y + 1.15, cStairFootZ + 0.08, 'metal');

        buildStairRamp(cStairX, cStairFootZ, cStairTopZ, UPPER_FLOOR_Y, 0.0);

        // Beveled Concourse Columns supporting Balcony
        const balcColZs = [concMinZ + 1.5, concMidZ + 4.0, concMaxZ - 1.5];
        for (let bc = 0; bc < balcColZs.length; bc++) {
          addBox(bConcrete, 0.62, 0.32, 0.62, concMinX + 0.35, 0.16, balcColZs[bc]); // Beveled plinth base
          addBox(bConcrete, 0.46, UPPER_FLOOR_Y - 0.56, 0.46, concMinX + 0.35, (UPPER_FLOOR_Y - 0.28) * 0.5 + 0.14, balcColZs[bc]);
          this._addCollider(concMinX + 0.10, 0, balcColZs[bc] - 0.25, concMinX + 0.60, UPPER_FLOOR_Y, balcColZs[bc] + 0.25, 'concrete');
        }

        const eastRoofMinX = canopyMaxX - 0.25;
        const eastRoofW = concMaxX - eastRoofMinX;
        if (eastRoofW > 0.4) {
          const eastRoofCX = eastRoofMinX + eastRoofW * 0.5;
          addBox(bConcrete, eastRoofW, 0.22, concLen, eastRoofCX, eaveY - 0.02, cz, 0, 0, 0, 2, concLen * 0.25);
          for (let rz = concMinZ + 2; rz <= concMaxZ - 2; rz += 15) {
            addCylinder(bTruss, 0.12, 0.12, eaveY - UPPER_FLOOR_Y + 0.05, 6, eastRoofMinX + 0.12, (UPPER_FLOOR_Y + eaveY) * 0.5, rz);
            this._addCollider(eastRoofMinX, UPPER_FLOOR_Y, rz - 0.15, eastRoofMinX + 0.25, eaveY, rz + 0.15, 'metal');
          }
        }

        // 2nd Floor Skywalk Connector from Concourse Balcony edge to JPO Bridge (grounded piers to y = -1.00!)
        const swZ0 = Math.min(skyEdgeZ, jpoNearZ);
        const swZ1 = Math.max(skyEdgeZ, jpoNearZ);
        if (swZ1 > swZ0 + 0.5) {
          const swLen = swZ1 - swZ0;
          const swMidZ = (swZ0 + swZ1) * 0.5;
          addBox(bConcrete, swW, 0.26, swLen, swX, UPPER_FLOOR_Y - 0.15, swMidZ, 0, 0, 0, 1.5, swLen * 0.25);
          addBox(bConcrete, swW - 0.3, 0.42, swLen, swX, UPPER_FLOOR_Y - 0.49, swMidZ, 0, 0, 0, 1.5, swLen * 0.25);
          addBox(bTerrazzo, swW, 0.04, swLen, swX, UPPER_FLOOR_Y - 0.02, swMidZ, 0, 0, 0, 1.5, swLen / 2.4);
          this._addCollider(swMinX, UPPER_FLOOR_Y - 0.28, swZ0, swMaxX, UPPER_FLOOR_Y, swZ1, 'floor', { isFloor: true });
          addBox(bJpo, 0.16, 0.55, swLen, swMinX + 0.08, UPPER_FLOOR_Y + 0.275, swMidZ);
          addBox(bJpo, 0.16, 0.55, swLen, swMaxX - 0.08, UPPER_FLOOR_Y + 0.275, swMidZ);
          addBox(bSteelDark, 0.10, 0.06, swLen, swMinX + 0.08, UPPER_FLOOR_Y + 1.08, swMidZ);
          addBox(bSteelDark, 0.10, 0.06, swLen, swMaxX - 0.08, UPPER_FLOOR_Y + 1.08, swMidZ);
          this._addCollider(swMinX - 0.04, UPPER_FLOOR_Y, swZ0, swMinX + 0.18, UPPER_FLOOR_Y + 1.15, swZ1, 'metal');
          this._addCollider(swMaxX - 0.18, UPPER_FLOOR_Y, swZ0, swMaxX + 0.04, UPPER_FLOOR_Y + 1.15, swZ1, 'metal');

          const pierCount = Math.max(2, Math.round(swLen / 8.0) + 1);
          const colH = UPPER_FLOOR_Y - 0.5 - STREET_GROUND_Y;
          const colCY = (UPPER_FLOOR_Y - 0.5 + STREET_GROUND_Y) * 0.5;
          for (let pi = 0; pi < pierCount; pi++) {
            const pFrac = pierCount === 1 ? 0.5 : pi / (pierCount - 1);
            const pz = swZ0 + 0.6 + (swLen - 1.2) * pFrac;
            addBox(bConcrete, 0.60, colH, 0.60, swMinX + 0.35, colCY, pz);
            addBox(bConcrete, 0.60, colH, 0.60, swMaxX - 0.35, colCY, pz);
            addBox(bConcrete, swW + 0.2, 0.55, 0.75, swX, UPPER_FLOOR_Y - 0.55, pz);
          }
        }

        if (swMinX > concMinX + 0.15) {
          const wGap = swMinX - concMinX;
          addBox(bJpo, wGap, 1.05, 0.24, concMinX + wGap * 0.5, UPPER_FLOOR_Y + 0.525, skyInsetZ);
          this._addCollider(concMinX, UPPER_FLOOR_Y, skyEdgeZ - 0.25, swMinX, UPPER_FLOOR_Y + 1.2, skyEdgeZ + 0.25, 'concrete');
        }
        if (concMaxX > swMaxX + 0.15) {
          const eGap = concMaxX - swMaxX;
          addBox(bJpo, eGap, 1.05, 0.24, swMaxX + eGap * 0.5, UPPER_FLOOR_Y + 0.525, skyInsetZ);
          this._addCollider(swMaxX, UPPER_FLOOR_Y, skyEdgeZ - 0.25, concMaxX, UPPER_FLOOR_Y + 1.2, skyEdgeZ + 0.25, 'concrete');
        }

        // Platform 1 outer windscreen outside concourse opening
        if (concMinZ > platMinZ + 1) {
          const sLen = concMinZ - platMinZ;
          addBox(bConcrete, 0.35, 1.25, sLen, p1MaxX - 0.18, 0.62, (platMinZ + concMinZ) * 0.5);
          this._addCollider(p1MaxX - 0.35, 0, platMinZ, p1MaxX, 2.6, concMinZ, 'concrete');
          for (let lz = platMinZ + 3; lz < concMinZ - 2; lz += 6.0) {
            addBox(bSteelDark, 0.14, 1.65, 5.2, p1MaxX - 0.18, 2.04, lz);
          }
        }
        if (platMaxZ > concMaxZ + 1) {
          const nLen = platMaxZ - concMaxZ;
          addBox(bConcrete, 0.35, 1.25, nLen, p1MaxX - 0.18, 0.62, (concMaxZ + platMaxZ) * 0.5);
          this._addCollider(p1MaxX - 0.35, 0, concMaxZ, p1MaxX, 2.6, platMaxZ, 'concrete');
          for (let lz = concMaxZ + 3; lz < platMaxZ - 2; lz += 6.0) {
            addBox(bSteelDark, 0.14, 1.65, 5.2, p1MaxX - 0.18, 2.04, lz);
          }
        }
      }

      // Overhead JPO Skybridge Helper (grounded piers to y = -1.00, split downstand beams clear of Track 1 HVAC!)
      const jpoPergolaY = 6.95;
      const buildJpoEdgeParapet = (wallMat, spanMin, spanMax, edgeZ, openings, hasGlass) => {
        openings.sort((a, b) => a[0] - b[0]);
        const segsList = [];
        let cur = spanMin;
        for (let oi = 0; oi < openings.length; oi++) {
          const o0 = Math.max(spanMin, openings[oi][0]);
          const o1 = Math.min(spanMax, openings[oi][1]);
          if (o0 > cur + 0.15) segsList.push([cur, o0]);
          cur = Math.max(cur, o1);
        }
        if (spanMax > cur + 0.15) segsList.push([cur, spanMax]);
        for (let si = 0; si < segsList.length; si++) {
          const s0 = segsList[si][0];
          const s1 = segsList[si][1];
          const segW = s1 - s0;
          const segCX = (s0 + s1) * 0.5;
          addBox(wallMat, segW, 0.55, 0.20, segCX, UPPER_FLOOR_Y + 0.275, edgeZ, 0, 0, 0, segW * 0.2, 1);
          addBox(bSteelDark, segW, 0.06, 0.10, segCX, UPPER_FLOOR_Y + 1.12, edgeZ);
          addBox(bSteelDark, 0.10, 0.58, 0.10, s0 + 0.06, UPPER_FLOOR_Y + 0.82, edgeZ);
          addBox(bSteelDark, 0.10, 0.58, 0.10, s1 - 0.06, UPPER_FLOOR_Y + 0.82, edgeZ);
          this._addCollider(s0, UPPER_FLOOR_Y, edgeZ - 0.18, s1, UPPER_FLOOR_Y + 1.25, edgeZ + 0.18, 'metal');
          if (hasGlass) {
            for (let gx = s0 + 2.5; gx <= s1 - 2.0; gx += 5.0) {
              const panelW = Math.min(4.4, s1 - gx + 2.2);
              if (panelW < 1.0) continue;
              addBox(bSteelDark, 0.10, 0.58, 0.10, gx - panelW * 0.5, UPPER_FLOOR_Y + 0.82, edgeZ);
              const cgJpo = this._addCollider(gx - panelW * 0.5, UPPER_FLOOR_Y + 0.55, edgeZ - 0.12, gx + panelW * 0.5, UPPER_FLOOR_Y + 1.18, edgeZ + 0.12, 'glass', { blocksWalk: false });
              glassRecords.push({
                cx: gx, cy: UPPER_FLOOR_Y + 0.84, cz: edgeZ, w: panelW - 0.12, h: 0.54, d: 0.04,
                ry: 0, hp: 20, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cgJpo
              });
            }
          }
        }
      };

      const buildJpoBridgeSpan = (jz, depth, spanMinX, spanMaxX, nearZ, farZ, nearOps, farOps, pierXs) => {
        const w = spanMaxX - spanMinX;
        const cx = (spanMinX + spanMaxX) * 0.5;
        addBox(bConcrete, w, 0.28, depth, cx, UPPER_FLOOR_Y - 0.16, jz, 0, 0, 0, w * 0.3, 2);
        const beamSortedTracks = trackXs.slice().sort((a, b) => a - b);
        let bCursor = spanMinX;
        for (let tki = 0; tki < beamSortedTracks.length; tki++) {
          const tCut0 = beamSortedTracks[tki] - 1.75;
          const tCut1 = beamSortedTracks[tki] + 1.75;
          if (tCut0 > bCursor + 0.4) {
            const bw = Math.min(spanMaxX, tCut0) - bCursor;
            if (bw > 0.4) {
              const bcx = bCursor + bw * 0.5;
              addBox(bConcrete, bw, 0.42, 0.45, bcx, UPPER_FLOOR_Y - 0.48, nearZ + (farZ > nearZ ? 0.25 : -0.25));
              addBox(bConcrete, bw, 0.42, 0.45, bcx, UPPER_FLOOR_Y - 0.48, farZ + (farZ > nearZ ? -0.25 : 0.25));
            }
          }
          bCursor = Math.max(bCursor, tCut1);
        }
        if (spanMaxX > bCursor + 0.4) {
          const bw = spanMaxX - bCursor;
          const bcx = bCursor + bw * 0.5;
          addBox(bConcrete, bw, 0.42, 0.45, bcx, UPPER_FLOOR_Y - 0.48, nearZ + (farZ > nearZ ? 0.25 : -0.25));
          addBox(bConcrete, bw, 0.42, 0.45, bcx, UPPER_FLOOR_Y - 0.48, farZ + (farZ > nearZ ? -0.25 : 0.25));
        }
        addBox(bTerrazzo, w, 0.04, depth, cx, UPPER_FLOOR_Y - 0.02, jz, 0, 0, 0, w / 2.4, depth / 2.4);
        this._addCollider(spanMinX, UPPER_FLOOR_Y - 0.28, jz - depth * 0.5, spanMaxX, UPPER_FLOOR_Y, jz + depth * 0.5, 'floor', { isFloor: true });

        // Grounded concrete columns (streetGroundY = -1.00 .. upperFloorY - 0.30) with beveled plinth bases
        const jColH = UPPER_FLOOR_Y - 0.30 - STREET_GROUND_Y;
        const jColCY = (UPPER_FLOOR_Y - 0.30 + STREET_GROUND_Y) * 0.5;
        for (let jp = 0; jp < pierXs.length; jp++) {
          const jpx = pierXs[jp];
          const pzA = jz - depth * 0.5 + 0.45;
          const pzB = jz + depth * 0.5 - 0.45;
          addBox(bConcrete, 0.68, jColH, 0.68, jpx, jColCY, pzA, 0, 0, 0, 1, 3);
          addBox(bConcrete, 0.68, jColH, 0.68, jpx, jColCY, pzB, 0, 0, 0, 1, 3);
          addBox(bConcrete, 0.92, 0.32, 0.92, jpx, STREET_GROUND_Y + 0.16, pzA);
          addBox(bConcrete, 0.92, 0.32, 0.92, jpx, STREET_GROUND_Y + 0.16, pzB);
          addBox(bConcrete, 0.90, 0.55, depth, jpx, UPPER_FLOOR_Y - 0.55, jz);
          this._addCollider(jpx - 0.38, STREET_GROUND_Y, pzA - 0.38, jpx + 0.38, UPPER_FLOOR_Y, pzA + 0.38, 'concrete');
          this._addCollider(jpx - 0.38, STREET_GROUND_Y, pzB - 0.38, jpx + 0.38, UPPER_FLOOR_Y, pzB + 0.38, 'concrete');
        }

        const wallMat = isCawang ? bRoof : bJpo;
        const farSide = farZ + (farZ > nearZ ? -0.10 : 0.10);
        const nearSide = nearZ + (farZ > nearZ ? 0.10 : -0.10);
        buildJpoEdgeParapet(wallMat, spanMinX, spanMaxX, farSide, farOps, farOps.length === 0);
        buildJpoEdgeParapet(wallMat, spanMinX, spanMaxX, nearSide, nearOps, false);

        addBox(wallMat, 0.22, 0.55, depth, spanMinX + 0.11, UPPER_FLOOR_Y + 0.275, jz);
        addBox(bSteelDark, 0.10, 0.06, depth, spanMinX + 0.11, UPPER_FLOOR_Y + 1.12, jz);
        this._addCollider(spanMinX - 0.05, UPPER_FLOOR_Y, jz - depth * 0.5, spanMinX + 0.25, UPPER_FLOOR_Y + 1.25, jz + depth * 0.5, 'metal');
        addBox(wallMat, 0.22, 0.55, depth, spanMaxX - 0.11, UPPER_FLOOR_Y + 0.275, jz);
        addBox(bSteelDark, 0.10, 0.06, depth, spanMaxX - 0.11, UPPER_FLOOR_Y + 1.12, jz);
        this._addCollider(spanMaxX - 0.25, UPPER_FLOOR_Y, jz - depth * 0.5, spanMaxX + 0.05, UPPER_FLOOR_Y + 1.25, jz + depth * 0.5, 'metal');

        addBox(wallMat, w, 0.22, depth + 0.2, cx, jpoPergolaY, jz, 0, 0, 0, w * 0.2, 1);
        const pergColH = jpoPergolaY - UPPER_FLOOR_Y;
        const pergColCY = UPPER_FLOOR_Y + pergColH * 0.5;
        for (let px = spanMinX + 0.35; px <= spanMaxX - 0.25; px += 7.5) {
          if (!farOps.some((o) => px >= o[0] - 0.25 && px <= o[1] + 0.25)) {
            addBox(bSteelDark, 0.24, pergColH, 0.24, px, pergColCY, farSide);
          }
          if (!nearOps.some((o) => px >= o[0] - 0.25 && px <= o[1] + 0.25)) {
            addBox(bSteelDark, 0.24, pergColH, 0.24, px, pergColCY, nearSide);
          }
        }
        addBox(bSteelDark, 0.24, pergColH, 0.24, spanMaxX - 0.35, pergColCY, farSide);
        addBox(bSteelDark, 0.24, pergColH, 0.24, spanMaxX - 0.35, pergColCY, nearSide);
      };

      const nearSideZ = jpoNearZ + (jpoFarZ > jpoNearZ ? 0.10 : -0.10);
      const nearOpenings = [[stairX - 1.18, stairX + 1.18]];
      const farOpenings = [];
      if (!isIsland) {
        nearOpenings.push([-9.4 - 1.18, -9.4 + 1.18]);
        nearOpenings.push([swMinX, swMaxX]);
      } else {
        // Open West & East JPO Street Exit Stairs descending straight onto the -0.82 Boulevard Sidewalks!
        nearOpenings.push([jpoSpanMinX + 0.5, jpoSpanMinX + 2.9]);
        nearOpenings.push([jpoSpanMaxX - 2.9, jpoSpanMaxX - 0.5]);
        if (isCawang) {
          farOpenings.push([i2MinX + 4.6 - 1.18, i2MinX + 4.6 + 1.18]);
        }
      }
      const primaryPiers = isIsland
        ? (isCawang ? [jpoSpanMinX + 0.55, p1MinX + 0.65, p1MaxX - 0.65, i2MinX + 0.65, jpoSpanMaxX - 0.55] : [jpoSpanMinX + 0.45, p1MinX + 0.65, p1MaxX - 0.65, jpoSpanMaxX - 0.55])
        : [jpoSpanMinX + 0.55, p1MaxX - 0.35, jpoSpanMaxX - 0.55];

      buildJpoBridgeSpan(jpoZ, jpoDepth, jpoSpanMinX, jpoSpanMaxX, jpoNearZ, jpoFarZ, nearOpenings, farOpenings, primaryPiers);

      // Island Station West & East JPO Boulevard Street Stairs (y = 4.25 -> -0.82 via street-side flights!)
      if (isIsland) {
        const jExitDir = jpoZ >= 0 ? -1 : 1;
        const jExitTopZ = jpoNearZ;
        const jExitBotZ = jpoNearZ + jExitDir * 11.5;
        buildStairRamp(jpoSpanMinX + 1.7, jExitBotZ, jExitTopZ, UPPER_FLOOR_Y, SIDEWALK_Y);
        buildStairRamp(jpoSpanMaxX - 1.7, jExitBotZ, jExitTopZ, UPPER_FLOOR_Y, SIDEWALK_Y);
      }

      const supX = isIsland ? jpoCX : (concMinX + 2.4);
      const supZ = isIsland ? jpoZ : concMidZ;
      addAtlasBox(bStall, 0.95, 0.85, 0.55, supX, UPPER_FLOOR_Y + 0.425, supZ, 0, null, STALL_UV.jaklingko);
      this._addCollider(supX - 0.5, UPPER_FLOOR_Y, supZ - 0.3, supX + 0.5, UPPER_FLOOR_Y + 0.9, supZ + 0.3, 'metal');
      const balUsed = this._usedIds.has('balcony_supply');
      this.interactables.push({
        id: 'balcony_supply', type: 'balcony_supply', x: supX, y: UPPER_FLOOR_Y + 1.0, z: supZ + 0.5,
        label: balUsed ? '[E] Loker Taktis Balkon Lantai 2 (Sudah Diambil)' : '[E] Loker Taktis Balkon Lantai 2 (+Amunisi & +25 HP)',
        prompt: balUsed ? '[E] Loker Taktis Balkon Lantai 2 (Sudah Diambil)' : '[E] Loker Taktis Balkon Lantai 2 (+Amunisi & +25 HP)',
        used: balUsed
      });

      if (arch.id === 'setiabudi') {
        const switchUsed = this._usedIds.has('setiabudi_jpo_switch');
        this.interactables.push({
          id: 'setiabudi_jpo_switch',
          type: 'relay',
          x: supX + 1.8,
          y: UPPER_FLOOR_Y + 1.0,
          z: supZ,
          label: switchUsed ? '[E] Sakelar Relai Sinyal Master JPO Setiabudi (Terhubung)' : '[E] Aktifkan Sakelar Relai Sinyal Master JPO Setiabudi',
          prompt: switchUsed ? '[E] Sakelar Relai Sinyal Master JPO Setiabudi (Terhubung)' : '[E] Aktifkan Sakelar Relai Sinyal Master JPO Setiabudi',
          used: switchUsed
        });
      }

      buildStairRamp(stairX, stairFootZ, stairTopZ, UPPER_FLOOR_Y, 0.0);
      if (!isIsland) {
        buildStairRamp(-9.4, stairFootZ, stairTopZ, UPPER_FLOOR_Y, 0.0);
      } else if (isCawang) {
        buildStairRamp(i2MinX + 4.6, jpoFarZ + 10.5, jpoFarZ, UPPER_FLOOR_Y, 0.0);
        addAtlasBox(bStall, 3.5, 0.72, 2.0, i2MinX + 2.5, UPPER_FLOOR_Y + 2.55, 0, 0, null, STALL_UV.indomaretHeader);
        addAtlasBox(bStall, 2.6, 2.05, 1.0, i2MinX + 2.5, UPPER_FLOOR_Y + 1.02, 0, 0, null, STALL_UV.indomaretCooler);
        this._addCollider(i2MinX + 0.8, UPPER_FLOOR_Y, -0.7, i2MinX + 4.2, UPPER_FLOOR_Y + 2.6, 0.7, 'metal');
      }

      // Secondary Opposite JPO Skybridge (360-degree multi-level loop!)
      let jpo2Z = null, jpo2NearZ = null, jpo2CX = null;
      if (arch.hasDualJpo || arch.hasGardenTerrace) {
        jpo2Z = isCawang ? 44.0 : (isIsland ? (jpoZ > 0 ? -38.0 : 38.0) : (jpoZ > 0 ? -34.0 : 34.0));
        const jpo2Depth = 4.8;
        const jpo2MinX = isIsland ? (isCawang ? -7.6 : p1MinX + 1.4) : -11.3;
        const gxBridgeMin = track2X + 1.85;
        const jpo2MaxX = arch.hasGardenTerrace ? (gxBridgeMin + 2.8) : (isIsland ? (isCawang ? i2MaxX + 0.6 : p1MaxX + 0.2) : p1MaxX + 0.2);
        jpo2CX = (jpo2MinX + jpo2MaxX) * 0.5;
        jpo2NearZ = jpo2Z > 0 ? jpo2Z - jpo2Depth * 0.5 : jpo2Z + jpo2Depth * 0.5;
        const jpo2FarZ = jpo2Z > 0 ? jpo2Z + jpo2Depth * 0.5 : jpo2Z - jpo2Depth * 0.5;
        const j2StairFootZ = jpo2Z > 0 ? jpo2NearZ - 9.5 : jpo2NearZ + 9.5;
        const j2Ops = [[stairX - 1.18, stairX + 1.18]];
        if (!isIsland) j2Ops.push([-9.4 - 1.18, -9.4 + 1.18]);
        else if (isCawang) j2Ops.push([i2MinX + 4.6 - 1.18, i2MinX + 4.6 + 1.18]);
        if (arch.hasGardenTerrace) j2Ops.push([gxBridgeMin + 1.4 - 1.18, gxBridgeMin + 1.4 + 1.18]);

        const j2Piers = isCawang
          ? [jpo2MinX + 0.55, p1MinX + 0.65, p1MaxX - 0.65, i2MinX + 0.65, jpo2MaxX - 0.55]
          : (arch.hasGardenTerrace
            ? [jpo2MinX + 0.55, p1MaxX - 0.55, gxBridgeMin + 0.55, jpo2MaxX - 0.55]
            : (isIsland ? [jpo2MinX + 0.55, jpo2MaxX - 0.55] : [jpo2MinX + 0.55, jpo2MaxX - 0.45]));
        buildJpoBridgeSpan(jpo2Z, jpo2Depth, jpo2MinX, jpo2MaxX, jpo2NearZ, jpo2FarZ, j2Ops, [], j2Piers);

        buildStairRamp(stairX, j2StairFootZ, jpo2NearZ, UPPER_FLOOR_Y, 0.0);
        if (!isIsland) buildStairRamp(-9.4, j2StairFootZ, jpo2NearZ, UPPER_FLOOR_Y, 0.0);
        else if (isCawang) buildStairRamp(i2MinX + 4.6, j2StairFootZ, jpo2NearZ, UPPER_FLOOR_Y, 0.0);
        if (arch.hasGardenTerrace) buildStairRamp(gxBridgeMin + 1.4, j2StairFootZ, jpo2NearZ, UPPER_FLOOR_Y, 0.0);
      }

      // Harjamukti North Maintenance Depot Shed (grounded at y = -1.16 .. 0.0, keeps Track 1 & Track 2 100% open!)
      if (arch.hasDepotShed) {
        const depZ0 = 36.0;
        const depZ1 = platMaxZ - 2.0;
        const depLen = depZ1 - depZ0;
        const depMidZ = (depZ0 + depZ1) * 0.5;
        const depMinX = -6.0;
        const depMaxX = depotMaxX;
        const depEastMinX = track2X + 1.60;

        const bayW = depMaxX - depEastMinX;
        const bayCX = (depEastMinX + depMaxX) * 0.5;
        addBox(bConcrete, bayW, 1.12, depLen, bayCX, -0.60, depMidZ, 0, 0, 0, 3, depLen * 0.2);
        addBox(bChecker, bayW, 0.04, depLen, bayCX, -0.02, depMidZ, 0, 0, 0, bayW / 2.4, depLen / 2.4);
        this._addCollider(depEastMinX, -1.18, depZ0, depMaxX, 0.0, depZ1, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

        const wcW = 4.15;
        const wcCX = (depMinX - 1.85) * 0.5;
        addBox(bConcrete, wcW, 1.12, depLen, wcCX, -0.60, depMidZ);
        addBox(bChecker, wcW, 0.04, depLen, wcCX, -0.02, depMidZ);
        this._addCollider(depMinX, -1.18, depZ0, -1.85, 0.0, depZ1, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });
        addBox(bSteelDark, 0.14, 1.15, depLen, -1.92, 0.58, depMidZ);
        this._addCollider(-2.0, 0, depZ0, -1.82, 1.25, depZ1, 'metal');

        const craneZ = 52.0;
        const craneDepth = 5.0;
        const craneNearZ = craneZ - craneDepth * 0.5;
        const eastStairX = depEastMinX + 2.2;
        buildJpoBridgeSpan(craneZ, craneDepth, depMinX, depMaxX, craneNearZ, craneZ + craneDepth * 0.5,
          [[-4.0 - 1.18, -4.0 + 1.18], [p1MinX + 4.8 - 1.18, p1MinX + 4.8 + 1.18], [eastStairX - 1.18, eastStairX + 1.18]], [],
          [depMinX + 0.45, -2.2, p1MinX + 0.55, p1MaxX - 0.55, depEastMinX + 0.45, depMaxX - 0.45]);
        buildStairRamp(p1MinX + 4.8, craneNearZ - 9.5, craneNearZ, UPPER_FLOOR_Y, 0.0);
        buildStairRamp(-4.0, craneNearZ - 9.5, craneNearZ, UPPER_FLOOR_Y, 0.0);
        buildStairRamp(eastStairX, craneNearZ - 9.5, craneNearZ, UPPER_FLOOR_Y, 0.0);
        // Connect Depot East & West bays cleanly down to surrounding plaza (-0.82) + open East doorway
        buildStairRamp((depEastMinX + depMaxX) * 0.5, depZ0 - 2.6, depZ0, 0.0, SIDEWALK_Y);
        buildStairRamp(wcCX, depZ0 - 2.6, depZ0, 0.0, SIDEWALK_Y);
        buildStairRamp(depMaxX + 1.35, 41.5, 44.5, 0.0, SIDEWALK_Y);

        const eastDoorZ0 = 41.5, eastDoorZ1 = 46.5;
        addBox(bSteelDark, 0.36, 7.6, eastDoorZ0 - depZ0, depMaxX - 0.18, 3.8, (depZ0 + eastDoorZ0) * 0.5);
        this._addCollider(depMaxX - 0.4, 0, depZ0, depMaxX, 7.6, eastDoorZ0, 'metal');
        addBox(bSteelDark, 0.36, 7.6, depZ1 - eastDoorZ1, depMaxX - 0.18, 3.8, (eastDoorZ1 + depZ1) * 0.5);
        this._addCollider(depMaxX - 0.4, 0, eastDoorZ1, depMaxX, 7.6, depZ1, 'metal');
        addBox(bSteelDark, 0.36, 3.8, eastDoorZ1 - eastDoorZ0, depMaxX - 0.18, 5.7, (eastDoorZ0 + eastDoorZ1) * 0.5);
        addBox(bSteelDark, 0.36, 7.6, depLen, depMinX + 0.18, 3.8, depMidZ);
        this._addCollider(depMinX, 0, depZ0, depMinX + 0.4, 7.6, depZ1, 'metal');
        addBox(bJpo, bayW, 1.2, 0.25, bayCX, 0.6, depZ1 - 0.15);
        this._addCollider(depEastMinX, 0, depZ1 - 0.35, depMaxX, 1.4, depZ1, 'metal');
        addBox(bSteelDark, bayW, 7.6, 0.35, bayCX, 3.8, depZ1 - 0.18);
        this._addCollider(depEastMinX, 0, depZ1 - 0.4, depMaxX, 7.6, depZ1, 'metal');
        addBox(bSteelDark, wcW, 7.6, 0.35, wcCX, 3.8, depZ1 - 0.18);
        this._addCollider(depMinX, 0, depZ1 - 0.4, -1.85, 7.6, depZ1, 'metal');
        // North portal headers leaving Track 1 (-1.85..+1.85) & Track 2 (track2X±1.6) completely open up to y=4.35!
        const betW = (track2X - 1.65) - 1.85;
        if (betW > 0.4) {
          addBox(bSteelDark, betW, 7.6, 0.35, 1.85 + betW * 0.5, 3.8, depZ1 - 0.18);
        }
        addBox(bSteelDark, 4.0, 3.25, 0.45, 0.0, 5.98, depZ1 - 0.20);
        addBox(bSteelDark, 3.6, 3.25, 0.45, track2X, 5.98, depZ1 - 0.20);

        for (let crz = depZ0 + 6; crz <= depZ1 - 4; crz += 12) {
          addBox(bJpo, depMaxX - depMinX - 0.8, 0.65, 0.45, (depMinX + depMaxX) * 0.5, 6.75, crz);
        }
        // Maintenance wheelsets & bogie racks parked inside East Depot Bay (off Track 2!)
        for (const wz of [40, 46]) {
          addBox(bSteelDark, 2.1, 0.72, 1.5, depMaxX - 1.8, 0.36, wz);
          addCylinder(bSteelDark, 0.40, 0.40, 1.9, 10, depMaxX - 1.8, 0.40, wz - 0.50, 0, 0, Math.PI * 0.5);
          addCylinder(bSteelDark, 0.40, 0.40, 1.9, 10, depMaxX - 1.8, 0.40, wz + 0.50, 0, 0, Math.PI * 0.5);
          this._addCollider(depMaxX - 2.9, 0, wz - 0.85, depMaxX - 0.7, 0.95, wz + 0.85, 'metal');
        }
        addAtlasBox(bStall, 1.05, 1.15, 0.60, depMaxX - 1.2, 0.58, 54.0, -Math.PI * 0.5, null, STALL_UV.jaklingko);
        this._addCollider(depMaxX - 1.6, 0, 53.3, depMaxX - 0.8, 1.2, 54.7, 'metal');
        const depUsed = this._usedIds.has('depot_supply');
        this.interactables.push({
          id: 'depot_supply', type: 'balcony_supply', x: depMaxX - 1.8, y: 1.0, z: 54.0,
          label: depUsed ? '[E] Loker Taktis Depot Perawatan (Sudah Diambil)' : '[E] Loker Taktis Depot Perawatan (+Amunisi & +25 HP)',
          prompt: depUsed ? '[E] Loker Taktis Depot Perawatan (Sudah Diambil)' : '[E] Loker Taktis Depot Perawatan (+Amunisi & +25 HP)',
          used: depUsed
        });
      }

      // Harjamukti Botanical Terrace (linked overhead via JPO 2 above Track 2 + direct East street stair!)
      if (arch.hasGardenTerrace) {
        const gZ0 = -50.0, gZ1 = -16.0;
        const gLen = gZ1 - gZ0;
        const gMidZ = (gZ0 + gZ1) * 0.5;
        const gxMin = track2X + 1.85;
        const gxMax = gardenMaxX;
        const gW = gxMax - gxMin;
        const gCX = (gxMin + gxMax) * 0.5;

        addBox(bConcrete, gW, 1.12, gLen, gCX, -0.60, gMidZ, 0, 0, 0, 3, 6);
        addBox(bTerrazzo, gW, 0.04, gLen, gCX, -0.02, gMidZ, 0, 0, 0, 3.2, 6.5);
        this._addCollider(gxMin, -1.18, gZ0, gxMax, 0.0, gZ1, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: true });

        // East Garden Terrace Street Exit Staircase (z = -23..-19 -> East Promenade -0.82)
        const gDoorZ0 = -23.0, gDoorZ1 = -19.0;
        addBox(bSteelDark, 0.16, 1.08, gDoorZ0 - gZ0, gxMax - 0.08, 0.54, (gZ0 + gDoorZ0) * 0.5);
        addBox(bSteelDark, 0.16, 1.08, gZ1 - gDoorZ1, gxMax - 0.08, 0.54, (gDoorZ1 + gZ1) * 0.5);
        this._addCollider(gxMax - 0.2, 0, gZ0, gxMax + 0.05, 1.2, gDoorZ0, 'metal');
        this._addCollider(gxMax - 0.2, 0, gDoorZ1, gxMax + 0.05, 1.2, gZ1, 'metal');
        buildGroundedTransition(gxMax + 1.8, -21.0, 4.0, 3.6, 0.0, SIDEWALK_Y, 'x', true, true);

        addBox(bSteelDark, gW, 1.08, 0.16, gCX, 0.54, gZ0 + 0.08);
        this._addCollider(gxMin, 0, gZ0 - 0.05, gxMax, 1.2, gZ0 + 0.2, 'metal');
        addBox(bSteelDark, gW, 1.08, 0.16, gCX, 0.54, gZ1 - 0.08);
        this._addCollider(gxMin, 0, gZ1 - 0.2, gxMax, 1.2, gZ1 + 0.05, 'metal');
        addBox(bSteelDark, 0.16, 1.08, gLen, gxMin + 0.08, 0.54, gMidZ);
        this._addCollider(gxMin - 0.05, 0, gZ0, gxMin + 0.2, 1.2, gZ1, 'metal');
        addBox(bSteelDark, gW, 1.08, 0.16, gCX, 0.54, gZ1 - 0.08);
        this._addCollider(gxMin, 0, gZ1 - 0.2, gxMax, 1.2, gZ1 + 0.05, 'metal');
        addBox(bSteelDark, 0.16, 1.08, (-38.0 - gZ0), gxMin + 0.08, 0.54, (gZ0 - 38.0) * 0.5);
        this._addCollider(gxMin - 0.05, 0, gZ0, gxMin + 0.2, 1.2, -38.0, 'metal');
        addBox(bSteelDark, 0.16, 1.08, (gZ1 + 29.6), gxMin + 0.08, 0.54, (gZ1 - 29.6) * 0.5);
        this._addCollider(gxMin - 0.05, 0, -29.6, gxMin + 0.2, 1.2, gZ1, 'metal');

        for (let pz = gZ0 + 3; pz <= gZ1 - 3; pz += 6) {
          addBox(bJpo, gW - 0.6, 0.18, 0.22, gCX, 3.45, pz);
          addBox(bSteelDark, 0.18, 3.45, 0.18, gxMax - 0.4, 1.72, pz);
        }
        const planterSpots = [[gxMax - 2.2, -45], [gxMax - 2.2, -28], [gxMin + 2.4, -45], [gxMin + 2.4, -21]];
        for (let pt = 0; pt < planterSpots.length; pt++) {
          const [px, pz] = planterSpots[pt];
          addBox(bConcrete, 2.0, 0.42, 2.0, px, 0.21, pz);
          this._addCollider(px - 1.0, 0, pz - 1.0, px + 1.0, 0.6, pz + 1.0, 'concrete');
          this._placeNormalizedModel('pachira_aquatica_01', px, 0.42, pz, pt * 1.4, 2.4,
            (n) => (n.name || '').endsWith('_' + ['a', 'b', 'c', 'd'][pt % 4])
          );
        }

        addAtlasBox(bStall, 0.95, 0.85, 0.55, gCX, 0.425, gZ0 + 2.2, 0, null, STALL_UV.jaklingko);
        this._addCollider(gCX - 0.5, 0, gZ0 + 1.9, gCX + 0.5, 0.9, gZ0 + 2.5, 'metal');
        const garUsed = this._usedIds.has('garden_supply');
        this.interactables.push({
          id: 'garden_supply', type: 'balcony_supply', x: gCX, y: 1.0, z: gZ0 + 2.7,
          label: garUsed ? '[E] Kotak Medis Kebun Atap Harjamukti (Sudah Diambil)' : '[E] Kotak Medis Kebun Atap Harjamukti (+Amunisi & +25 HP)',
          prompt: garUsed ? '[E] Kotak Medis Kebun Atap Harjamukti (Sudah Diambil)' : '[E] Kotak Medis Kebun Atap Harjamukti (+Amunisi & +25 HP)',
          used: garUsed
        });
      }

      // =========================================================
      // 3B. CONTINUOUS GROUNDED PLAZA APRONS FILLING ALL STATION LOT GAPS
      // =========================================================
      {
        const deckHoles = [
          { x0: p1MinX - 0.05, x1: p1MaxX + 0.05, z0: platMinZ - 0.05, z1: platMaxZ + 0.05 }
        ];
        if (!isIsland) {
          deckHoles.push({ x0: p2MinX - 0.05, x1: p2MaxX + 0.05, z0: platMinZ - 0.05, z1: platMaxZ + 0.05 });
          deckHoles.push({ x0: concMinX - 0.05, x1: concMaxX + 0.05, z0: concMinZ - 0.05, z1: concMaxZ + 0.05 });
        } else if (isCawang) {
          deckHoles.push({ x0: i2MinX - 0.05, x1: i2MaxX + 0.05, z0: platMinZ - 0.05, z1: platMaxZ + 0.05 });
        }
        if (arch.hasDepotShed) {
          deckHoles.push({ x0: -6.05, x1: -1.80, z0: 35.95, z1: (platMaxZ - 2.0) + 0.05 });
          deckHoles.push({ x0: track2X + 1.55, x1: depotMaxX + 0.05, z0: 35.95, z1: (platMaxZ - 2.0) + 0.05 });
        }
        if (arch.hasGardenTerrace) {
          deckHoles.push({ x0: track2X + 1.80, x1: gardenMaxX + 0.05, z0: -50.05, z1: -15.95 });
        }

        const subtractRect = (rects, h) => {
          const out = [];
          for (let ri = 0; ri < rects.length; ri++) {
            const r = rects[ri];
            if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) {
              out.push(r);
              continue;
            }
            const ix0 = Math.max(r.x0, h.x0);
            const ix1 = Math.min(r.x1, h.x1);
            if (ix0 > r.x0 + 0.05) out.push({ x0: r.x0, x1: ix0, z0: r.z0, z1: r.z1 });
            if (ix1 < r.x1 - 0.05) out.push({ x0: ix1, x1: r.x1, z0: r.z0, z1: r.z1 });
            if (h.z0 > r.z0 + 0.05) out.push({ x0: ix0, x1: ix1, z0: r.z0, z1: h.z0 });
            if (h.z1 < r.z1 - 0.05) out.push({ x0: ix0, x1: ix1, z0: h.z1, z1: r.z1 });
          }
          return out;
        };

        const sortedTracks = trackXs.slice().sort((a, b) => a - b);
        const plazaZ0 = CROSSING_Z_SOUTH + CROSSING_HALF_W; // -68
        const plazaZ1 = CROSSING_Z_NORTH - CROSSING_HALF_W; // +68
        let curX = corridorMinX - 0.05;
        const bands = [];
        for (let ti = 0; ti < sortedTracks.length; ti++) {
          const t0 = sortedTracks[ti] - 1.66;
          const t1 = sortedTracks[ti] + 1.66;
          if (t0 > curX + 0.15) bands.push({ x0: curX, x1: t0, z0: plazaZ0, z1: plazaZ1 });
          curX = Math.max(curX, t1);
        }
        if (corridorMaxX + 0.05 > curX + 0.15) bands.push({ x0: curX, x1: corridorMaxX + 0.05, z0: plazaZ0, z1: plazaZ1 });

        let freeRects = bands;
        for (let hi = 0; hi < deckHoles.length; hi++) {
          freeRects = subtractRect(freeRects, deckHoles[hi]);
        }
        for (let fi = 0; fi < freeRects.length; fi++) {
          const fr = freeRects[fi];
          const fw = fr.x1 - fr.x0;
          const fd = fr.z1 - fr.z0;
          if (fw < 0.12 || fd < 0.12) continue;
          const fcx = (fr.x0 + fr.x1) * 0.5;
          const fcz = (fr.z0 + fr.z1) * 0.5;
          addBox(bConcrete, fw, 0.34, fd, fcx, SIDEWALK_Y - 0.21, fcz, 0, 0, 0, fw * 0.35, fd * 0.35);
          addBox(bConcreteRough, fw, 0.04, fd, fcx, SIDEWALK_Y - 0.02, fcz, 0, 0, 0, fw * 0.35, fd * 0.35);
          this._addCollider(fr.x0, -1.24, fr.z0, fr.x1, SIDEWALK_Y, fr.z1, 'floor', {
            isFloor: true, blocksWalk: true, blocksBullets: false
          });
        }
      }

      // =========================================================
      // 4. CURVED RIBBED CANOPY & BEVELED COLUMN PLINTHS
      // =========================================================
      const bayStep = 12;
      const canBays = Math.round((platLen - 4) / bayStep);
      const canStartZ = -(canBays * bayStep) * 0.5;
      const canEndZ = -canStartZ;
      for (let z = canStartZ; z <= canEndZ + 0.01; z += bayStep) {
        for (let k = 0; k < segs; k++) {
          const t0 = k / segs;
          const t1 = (k + 1) / segs;
          const x0 = canopyCenterX + (t0 - 0.5) * canopySpanX;
          const x1 = canopyCenterX + (t1 - 0.5) * canopySpanX;
          const y0 = eaveY + Math.sin(t0 * Math.PI) * (apexY - eaveY);
          const y1 = eaveY + Math.sin(t1 * Math.PI) * (apexY - eaveY);
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx);
          addCylinder(bTruss, 0.11, 0.11, len + 0.1, 6, (x0 + x1) * 0.5, (y0 + y1) * 0.5, z, 0, 0, ang - Math.PI * 0.5);

          if (z < canEndZ - 0.5) {
            const isSkylight = (k === 4 || k === 5) && (Math.round(Math.abs(z)) % 24 === 0);
            if (!isSkylight) {
              addBox(bRoof, len + 0.14, 0.14, bayStep, (x0 + x1) * 0.5, (y0 + y1) * 0.5 + 0.16, z + bayStep * 0.5, 0, 0, ang, 1.5, 2.5);
            } else {
              addBox(bTruss, len + 0.12, 0.08, 0.18, (x0 + x1) * 0.5, (y0 + y1) * 0.5 + 0.14, z + bayStep * 0.33, 0, 0, ang);
              addBox(bTruss, len + 0.12, 0.08, 0.18, (x0 + x1) * 0.5, (y0 + y1) * 0.5 + 0.14, z + bayStep * 0.67, 0, 0, ang);
              const midK = (t0 + t1) * 0.5;
              const mx = canopyCenterX + (midK - 0.5) * canopySpanX;
              const my = (y0 + y1) * 0.5 + 0.14;
              addBox(bTruss, 0.10, 0.08, bayStep, mx, my, z + bayStep * 0.5, 0, 0, ang);
            }
          }
        }
        // Full-height canopy columns with beveled concrete plinth bases!
        if (!isIsland) {
          const p1ColH = getCanopyArchY(p1MaxX - 0.35);
          addCylinder(bConcrete, 0.18, 0.24, 0.45, 8, p1MaxX - 0.35, 0.225, z);
          addCylinder(bTruss, 0.12, 0.14, p1ColH + 0.15, 8, p1MaxX - 0.35, p1ColH * 0.5, z);
          addCylinder(bConcrete, 0.18, 0.24, 0.45, 8, canopyMinX + 0.15, 0.225, z);
          addCylinder(bTruss, 0.12, 0.14, eaveY + 0.15, 8, canopyMinX + 0.15, eaveY * 0.5, z);
        } else {
          const colA = isCawang ? 6.26 : p1MinX + 2.6;
          const colB = isCawang ? i2MaxX - 4.2 : p1MaxX - 2.6;
          const hA = getCanopyArchY(colA);
          const hB = getCanopyArchY(colB);
          addCylinder(bConcrete, 0.18, 0.24, 0.45, 8, colA, 0.225, z);
          addCylinder(bTruss, 0.12, 0.14, hA + 0.15, 8, colA, hA * 0.5, z);
          addCylinder(bConcrete, 0.18, 0.24, 0.45, 8, colB, 0.225, z);
          addCylinder(bTruss, 0.12, 0.14, hB + 0.15, 8, colB, hB * 0.5, z);
        }
      }

      // Eave trim fascias & longitudinal roof purlins
      addBox(bJpo, 0.18, 0.38, platLen, canopyMinX - 0.05, eaveY + 0.12, 0);
      addBox(bJpo, 0.18, 0.38, platLen, canopyMaxX + 0.05, eaveY + 0.12, 0);
      for (let k = 0; k <= segs; k++) {
        const tk = k / segs;
        const px = canopyMinX + tk * canopySpanX;
        const py = eaveY + Math.sin(tk * Math.PI) * (apexY - eaveY);
        addCylinder(bTruss, 0.09, 0.09, platLen, 6, px, py, 0, Math.PI * 0.5, 0, 0);
      }

      // Station Name Banners with dark steel frames & full-height suspension rods to canopy arch!
      const addHangingBanner = (bx, by, bz, ryRot) => {
        const bw = 2.8, bh = 0.68, bd = 0.10;
        addBox(bSteelDark, bw + 0.08, bh + 0.06, bd, bx, by, bz, 0, ryRot, 0);
        const rodOff = 1.05;
        const rCos = Math.cos(ryRot), rSin = Math.sin(ryRot);
        const rodBotY = by + bh * 0.5;
        for (const sgn of [-1, 1]) {
          const rx = bx + sgn * rodOff * rCos;
          const rz = bz - sgn * rodOff * rSin;
          const roofY = getCanopyArchY(rx) + 0.08;
          const rodLen = Math.max(0.3, roofY - rodBotY);
          addBox(bSteelDark, 0.04, rodLen, 0.04, rx, rodBotY + rodLen * 0.5, rz);
        }
        addAtlasQuad(bBanner, bw, bh, bx + Math.sin(ryRot) * (bd * 0.5 + 0.01), by, bz + Math.cos(ryRot) * (bd * 0.5 + 0.01), 0, ryRot, 0, [0, 0, 1, 1]);
        addAtlasQuad(bBanner, bw, bh, bx - Math.sin(ryRot) * (bd * 0.5 + 0.01), by, bz - Math.cos(ryRot) * (bd * 0.5 + 0.01), 0, ryRot + Math.PI, 0, [0, 0, 1, 1]);
      };
      const midBannerZ = Math.abs(jpoZ) < 6.0 ? -22.0 : 0.0;
      addHangingBanner(p1MinX + 0.55, 3.35, -14.0, Math.PI * 0.5);
      addHangingBanner(p1MinX + 0.55, 3.35, 14.0, Math.PI * 0.5);
      addHangingBanner(p1MinX + (isIsland ? 3.8 : 2.55), 3.35, midBannerZ, 0.0);
      if (!isIsland) {
        addHangingBanner(p2MaxX - 2.45, 3.35, 0.0, 0.0);
      }

      // =========================================================
      // 5. PLATFORM SCREEN DOORS (HHPSD) ALONG TRACK 1 (x=+1.46) & TRACK 2 (x=track2X-1.46)
      // =========================================================
      const doorCenters = dims.psdCentersZ;
      const doorW = dims.psdDoorClearWidth;
      const halfDoor = doorW * 0.5;
      const psd2X = track2X - 1.46;

      const fixedSpans = [];
      let prevZ = -29.0;
      for (let i = 0; i < doorCenters.length; i++) {
        const dz = doorCenters[i];
        if (dz - halfDoor > prevZ + 0.1) {
          fixedSpans.push([prevZ, dz - halfDoor]);
        }
        prevZ = dz + halfDoor;
      }
      fixedSpans.push([prevZ, 29.0]);

      const psdFrameGeo = new THREE.BoxGeometry(0.08, 0.36, halfDoor - 0.04);
      this.disposableGeometries.push(psdFrameGeo);

      const buildPsdRow = (rowX, signDirX, outDoors) => {
        const signYaw = signDirX > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        for (let s = 0; s < fixedSpans.length; s++) {
          const z0 = fixedSpans[s][0];
          const z1 = fixedSpans[s][1];
          const spanLen = z1 - z0;
          const cz = (z0 + z1) * 0.5;

          addBox(bSteelDark, 0.22, 1.40, 0.42, rowX, 0.70, z0 + 0.21);
          addBox(bSteelDark, 0.22, 1.40, 0.42, rowX, 0.70, z1 - 0.21);
          if (spanLen > 1.1) {
            addAtlasQuad(bSign, 0.36, 0.55, rowX + signDirX * 0.12, 0.72, z0 + 0.21, 0, signYaw, 0, SIGN_UV.safetyWarn);
          }

          const midSpan = spanLen - 0.84;
          if (midSpan > 0.6) {
            const isAdPanel = (s % 2 === 1);
            if (isAdPanel) {
              addBox(bSteelDark, 0.16, 1.18, midSpan, rowX, 0.59, cz);
              addAtlasQuad(bSign, midSpan - 0.12, 1.02, rowX + signDirX * 0.09, 0.62, cz, 0, signYaw, 0, SIGN_UV.smartTravelAd);
              this._addCollider(rowX - 0.12, 0, z0, rowX + 0.12, 1.42, z1, 'metal');
            } else {
              addBox(bSteelDark, 0.18, 0.42, midSpan, rowX, 0.21, cz);
              const cIdx = this._addCollider(rowX - 0.12, 0, z0, rowX + 0.12, 1.42, z1, 'glass');
              glassRecords.push({
                cx: rowX, cy: 0.82, cz: cz, w: midSpan - 0.06, h: 0.78, d: 0.04,
                ry: Math.PI * 0.5, hp: 25, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cIdx
              });
            }
            addBox(bSteelDark, 0.19, 0.24, spanLen, rowX, 1.30, cz);
            const tileCount = Math.max(1, Math.round(spanLen / 1.35));
            const tileW = (spanLen - 0.1) / tileCount;
            for (let tc = 0; tc < tileCount; tc++) {
              const tz = z0 + 0.05 + (tc + 0.5) * tileW;
              addAtlasQuad(bSign, tileW - 0.04, 0.24, rowX + 0.105, 1.30, tz, 0, Math.PI * 0.5, 0, SIGN_UV.psdHeader);
              addAtlasQuad(bSign, tileW - 0.04, 0.24, rowX - 0.105, 1.30, tz, 0, -Math.PI * 0.5, 0, SIGN_UV.psdHeader);
            }
          }
          this._addCollider(rowX - 0.14, 0, z0, rowX + 0.14, 1.45, z0 + 0.44, 'metal');
          this._addCollider(rowX - 0.14, 0, z1 - 0.44, rowX + 0.14, 1.45, z1, 'metal');
        }

        const extLen = Math.max(4.0, (platMaxZ - 0.5) - 29.0);
        const extMidZ = 29.0 + extLen * 0.5;
        addBox(bSteelDark, 0.16, 1.15, extLen, rowX, 0.58, -extMidZ);
        addBox(bSteelDark, 0.16, 1.15, extLen, rowX, 0.58, extMidZ);
        this._addCollider(rowX - 0.12, 0, -(platMaxZ - 0.5), rowX + 0.12, 1.35, -29.0, 'metal');
        this._addCollider(rowX - 0.12, 0, 29.0, rowX + 0.12, 1.35, platMaxZ - 0.5, 'metal');

        outDoors.length = 0;
        for (let d = 0; d < doorCenters.length; d++) {
          const dz = doorCenters[d];
          const doorCollId = this._addCollider(rowX - 0.10, 0.0, dz - halfDoor, rowX + 0.10, 1.40, dz + halfDoor, 'psd_door', {
            isDoor: true, isOpen: false, blocksWalk: true, blocksBullets: true
          });
          const leftGlassIdx = glassRecords.length;
          glassRecords.push({
            cx: rowX, cy: 0.85, cz: dz - halfDoor * 0.5, w: halfDoor - 0.04, h: 0.98, d: 0.04,
            ry: Math.PI * 0.5, hp: 20, isPsdDoor: true, psdDoorIdx: d, slideSign: -1, colliderIdx: doorCollId
          });
          const rightGlassIdx = glassRecords.length;
          glassRecords.push({
            cx: rowX, cy: 0.85, cz: dz + halfDoor * 0.5, w: halfDoor - 0.04, h: 0.98, d: 0.04,
            ry: Math.PI * 0.5, hp: 20, isPsdDoor: true, psdDoorIdx: d, slideSign: 1, colliderIdx: doorCollId
          });
          outDoors.push({
            index: d, z: dz, colliderIdx: doorCollId,
            leftGlassIdx: leftGlassIdx, rightGlassIdx: rightGlassIdx,
            leftFrameInst: d * 2, rightFrameInst: d * 2 + 1
          });
        }

        const frameInst = new THREE.InstancedMesh(psdFrameGeo, mats.steelDark, doorCenters.length * 2);
        frameInst.castShadow = false;
        frameInst.receiveShadow = true;
        root.add(frameInst);
        return frameInst;
      };

      this.psdDoors = [];
      this.psdDoors2 = [];
      this.navGraph = null;
      this._psdFrameInst = buildPsdRow(psdX, 1, this.psdDoors);
      this._psdFrameInst2 = buildPsdRow(psd2X, -1, this.psdDoors2);

      // =========================================================
      // 6. COMMERCIAL STALLS, HERO ROTI'O KIOSK, TURNSTILES & AMENITIES
      // =========================================================
      const rotioX = isIsland ? (p1MinX + p1MaxX) * 0.5 : concMinX + 4.8;
      const rotioZ = isIsland ? -8.5 : concMinZ + 2.2;
      const rotioYaw = 0;

      const buildRotioKiosk = (kx, kz, yaw) => {
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const toWorld = (lx, lz) => [kx + lx * cos + lz * sin, kz - lx * sin + lz * cos];

        addAtlasBox(bStall, 3.35, 0.92, 0.65, toWorld(0, 0.85)[0], 0.46, toWorld(0, 0.85)[1], yaw, null, STALL_UV.rotioSlatsOnly);
        addBox(bTruss, 3.45, 0.08, 0.74, toWorld(0, 0.85)[0], 0.95, toWorld(0, 0.85)[1], 0, yaw, 0);
        addAtlasBox(bStall, 0.24, 2.75, 2.35, toWorld(-1.55, 0)[0], 1.38, toWorld(-1.55, 0)[1], yaw,
          { 0: STALL_UV.rotioMedallion, 1: STALL_UV.rotioMedallion }, STALL_UV.rotioCreamSolid);
        addAtlasBox(bStall, 3.35, 2.75, 0.24, toWorld(0, -1.05)[0], 1.38, toWorld(0, -1.05)[1], yaw, null, STALL_UV.rotioSubwayTile);
        addAtlasBox(bStall, 2.36, 0.84, 0.12, toWorld(0.15, -0.88)[0], 1.76, toWorld(0.15, -0.88)[1], yaw,
          { 4: STALL_UV.rotioMenuBoard, 5: STALL_UV.rotioMenuBoard }, STALL_UV.rotioCreamSolid);
        addAtlasBox(bStall, 3.55, 0.68, 2.45, kx, 2.54, kz, yaw,
          { 0: STALL_UV.rotioSignTop, 1: STALL_UV.rotioSignTop, 4: STALL_UV.rotioSignTop, 5: STALL_UV.rotioSignTop },
          STALL_UV.rotioSlatsOnly);
        addAtlasBox(bStall, 1.15, 0.16, 0.48, toWorld(-0.45, 0.86)[0], 1.08, toWorld(-0.45, 0.86)[1], yaw, null, STALL_UV.rotioBuns);
        addAtlasBox(bStall, 0.56, 0.88, 0.48, toWorld(1.05, 0.85)[0], 1.44, toWorld(1.05, 0.85)[1], yaw,
          { 4: STALL_UV.indomaretCooler, 5: STALL_UV.indomaretCooler }, STALL_UV.indomaretCooler);

        const hw = Math.abs(cos) * 1.75 + Math.abs(sin) * 1.25;
        const hd = Math.abs(sin) * 1.75 + Math.abs(cos) * 1.25;
        this._addCollider(kx - hw, 0, kz - hd, kx + hw, 2.85, kz + hd, 'wood');

        const pDisp = toWorld(-0.45, 1.15);
        const cDisp = this._addCollider(pDisp[0] - 0.6, 0.98, pDisp[1] - 0.1, pDisp[0] + 0.6, 1.60, pDisp[1] + 0.1, 'glass', { blocksWalk: false });
        glassRecords.push({
          cx: pDisp[0], cy: 1.28, cz: pDisp[1], w: 1.18, h: 0.54, d: 0.04,
          ry: yaw, hp: 16, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cDisp
        });
        const pFridge = toWorld(1.05, 1.12);
        const cFridge = this._addCollider(pFridge[0] - 0.3, 1.0, pFridge[1] - 0.1, pFridge[0] + 0.3, 1.90, pFridge[1] + 0.1, 'glass', { blocksWalk: false });
        glassRecords.push({
          cx: pFridge[0], cy: 1.44, cz: pFridge[1], w: 0.54, h: 0.84, d: 0.04,
          ry: yaw, hp: 18, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cFridge
        });

        const pFront = toWorld(0, 1.45);
        const rotioUsed = this._usedIds.has('rotio_counter');
        this.interactables.push({
          id: 'rotio_counter', type: 'rotio',
          x: pFront[0], y: 1.1, z: pFront[1],
          label: rotioUsed ? "[E] Etalase Roti'O Coffee Bun (Kosong)" : "[E] Ambil Roti'O Coffee Bun Hangat (+25 HP)",
          prompt: rotioUsed ? "[E] Etalase Roti'O Coffee Bun (Kosong)" : "[E] Ambil Roti'O Coffee Bun Hangat (+25 HP)",
          used: rotioUsed
        });
      };

      buildRotioKiosk(rotioX, rotioZ, rotioYaw);

      const indoX = isIsland ? (p1MinX + p1MaxX) * 0.5 : concMaxX - 2.1;
      const indoZ = isIsland ? 12.5 : concMaxZ - 3.6;
      const indoYaw = isIsland ? 0 : -Math.PI * 0.5;
      addAtlasBox(bStall, 5.4, 0.72, 2.2, indoX, 2.55, indoZ, indoYaw, null, STALL_UV.indomaretHeader);
      addBox(bSteelDark, 5.2, 2.15, 0.85, indoX + (isIsland ? 0 : 0.7), 1.08, indoZ, 0, indoYaw, 0);
      for (let cb = -1; cb <= 1; cb += 2) {
        const off = cb * 1.28;
        const bx = isIsland ? indoX + off : indoX + 0.7;
        const bz = isIsland ? indoZ : indoZ - off;
        addAtlasBox(bStall, 2.48, 2.02, 0.88, bx, 1.08, bz, indoYaw,
          { 4: STALL_UV.indomaretCooler, 5: STALL_UV.indomaretCooler }, STALL_UV.rotioCreamSolid);
      }
      this._addCollider(indoX - 1.5, 0, indoZ - 2.6, indoX + 1.5, 2.9, indoZ + 2.6, 'metal');
      for (let cg = -1; cg <= 1; cg++) {
        const gx = isIsland ? indoX + cg * 1.65 : indoX - 0.45;
        const gz = isIsland ? indoZ + 0.5 : indoZ + cg * 1.65;
        const cid = this._addCollider(gx - 0.5, 0.2, gz - 0.5, gx + 0.5, 2.0, gz + 0.5, 'glass', { blocksWalk: false });
        glassRecords.push({
          cx: gx, cy: 1.15, cz: gz, w: 1.45, h: 1.85, d: 0.04,
          ry: indoYaw, hp: 20, isPsdDoor: false, psdDoorIdx: -1, slideSign: 0, colliderIdx: cid
        });
      }

      // Access by KAI Turnstiles
      const gateBaseX = isIsland ? (p1MinX + 2.2) : (concMinX + 2.2);
      const gateZStart = isIsland ? 2.0 : (concMidZ - 6.5);
      const numGates = isIsland ? 4 : 6;
      const turnstileList = [];
      for (let g = 0; g < numGates; g++) {
        const gz = gateZStart + g * 1.05;
        const gx = isIsland ? gateBaseX + g * 1.05 : gateBaseX;
        const tz = isIsland ? 2.5 : gz;
        addAtlasBox(bStall, 1.25, 1.00, 0.24, gx, 0.50, tz, isIsland ? Math.PI * 0.5 : 0, null, STALL_UV.turnstilePurple);
        this._addCollider(gx - (isIsland ? 0.14 : 0.65), 0, tz - (isIsland ? 0.65 : 0.14),
          gx + (isIsland ? 0.14 : 0.65), 1.05, tz + (isIsland ? 0.65 : 0.14), 'metal');
        if (g < numGates - 1) {
          const lx = isIsland ? gx + 0.52 : gx;
          const lz = isIsland ? tz : tz + 0.52;
          turnstileList.push({ x: lx, z: lz, id: 'turnstile_' + g, yaw: isIsland ? Math.PI * 0.5 : 0 });
          this.interactables.push({
            id: 'turnstile_' + g, type: 'turnstile', x: lx, y: 0.9, z: lz,
            label: '[E] Tap Kartu Elektronik (Access by KAI)',
            prompt: '[E] Tap Kartu Elektronik (Access by KAI)', used: false
          });
        }
      }

      if (!isIsland) {
        const lkX = concMaxX - 1.35;
        const lkZ = concMinZ + 3.2;
        addAtlasBox(bStall, 3.8, 2.7, 1.8, lkX, 1.35, lkZ, -Math.PI * 0.5, null, STALL_UV.loketWood);
        addAtlasBox(bSign, 3.9, 0.65, 1.9, lkX, 2.75, lkZ, -Math.PI * 0.5, null, SIGN_UV.loketHeader);
        this._addCollider(lkX - 1.0, 0, lkZ - 2.0, lkX + 1.0, 2.9, lkZ + 2.0, 'wood');

        const loketUsed = this._usedIds.has('loket_counter');
        this.interactables.push({
          id: 'loket_counter',
          type: 'field_log',
          x: lkX - 1.2,
          y: 1.1,
          z: lkZ,
          label: loketUsed ? '[E] Meja Loket Stasiun (Sudah Diperiksa)' : '[E] Periksa Buku Catatan Loket Tiket',
          prompt: loketUsed ? '[E] Meja Loket Stasiun (Sudah Diperiksa)' : '[E] Periksa Buku Catatan Loket Tiket',
          used: loketUsed
        });

        const shX = concMinX + 7.8;
        const shZ = concMaxZ - 1.45;
        addAtlasBox(bStall, 2.4, 2.55, 2.1, shX, 1.28, shZ, 0, null, STALL_UV.shutter260);
        this._addCollider(shX - 1.2, 0, shZ - 1.1, shX + 1.2, 2.6, shZ + 1.1, 'metal');
      }

      const jakX = isIsland ? p1MaxX - 2.0 : concMinX + 3.8;
      const jakZ = isIsland ? -16.0 : concMaxZ - 1.8;
      addAtlasBox(bStall, 0.85, 2.05, 0.65, jakX, 1.02, jakZ, 0, null, STALL_UV.jaklingko);
      this._addCollider(jakX - 0.45, 0, jakZ - 0.35, jakX + 0.45, 2.05, jakZ + 0.35, 'metal');
      const jakUsed = this._usedIds.has('jaklingko_kiosk');
      this.interactables.push({
        id: 'jaklingko_kiosk', type: 'jaklingko', x: jakX, y: 1.2, z: jakZ,
        label: jakUsed ? '[E] Terminal JakLingko (Sudah Diambil)' : '[E] Top-Up KUE / JakLingko Terminal (+Amunisi)',
        prompt: jakUsed ? '[E] Terminal JakLingko (Sudah Diambil)' : '[E] Top-Up KUE / JakLingko Terminal (+1 Magazin)',
        used: jakUsed
      });

      const cowX = isIsland ? p1MaxX - 2.0 : concMinX + 5.4;
      const cowZ = isIsland ? -13.5 : concMaxZ - 1.8;
      addAtlasBox(bStall, 1.15, 1.95, 0.65, cowX, 0.98, cowZ, 0, null, STALL_UV.coway);
      this._addCollider(cowX - 0.6, 0, cowZ - 0.35, cowX + 0.6, 1.95, cowZ + 0.35, 'metal');
      const cowUsed = this._usedIds.has('coway_water');
      this.interactables.push({
        id: 'coway_water', type: 'coway', x: cowX, y: 1.1, z: cowZ,
        label: cowUsed ? '[E] Dispenser Coway (Sudah Minum)' : '[E] Minum Air Steril Coway (+15 HP)',
        prompt: cowUsed ? '[E] Dispenser Coway (Sudah Minum)' : '[E] Minum Air Steril Coway (+15 HP)',
        used: cowUsed
      });

      const callX = p1MinX + 1.45;
      const callZ = -2.85;
      addBox(bSteelDark, 0.42, 1.35, 0.42, callX, 0.68, callZ);
      addAtlasBox(bSign, 0.46, 0.44, 0.46, callX, 1.22, callZ, Math.PI * 0.5, null, SIGN_UV.callTrain);
      this._addCollider(callX - 0.25, 0, callZ - 0.25, callX + 0.25, 1.45, callZ + 0.25, 'metal');
      this.interactables.push({
        id: 'call_train', type: 'call_train', x: callX, y: 1.2, z: callZ,
        label: '[E] Panggil Kereta LRT Peron 1 (→ Stasiun Berikutnya)',
        prompt: '[E] Panggil Kereta LRT Peron 1 (→ Stasiun Berikutnya)', used: false
      });

      const call2X = (isIsland ? p1MaxX : p2MaxX) - 1.45;
      const call2Z = -2.85;
      addBox(bSteelDark, 0.42, 1.35, 0.42, call2X, 0.68, call2Z);
      addAtlasBox(bSign, 0.46, 0.44, 0.46, call2X, 1.22, call2Z, -Math.PI * 0.5, null, SIGN_UV.callTrain);
      this._addCollider(call2X - 0.25, 0, call2Z - 0.25, call2X + 0.25, 1.45, call2Z + 0.25, 'metal');
      this.interactables.push({
        id: 'call_train_prev', type: 'call_train_prev', x: call2X, y: 1.2, z: call2Z,
        label: '[E] Panggil Kereta LRT Peron 2 (← Stasiun Sebelumnya)',
        prompt: '[E] Panggil Kereta LRT Peron 2 (← Stasiun Sebelumnya)', used: false
      });

      const exX = p1MaxX - 1.1;
      const exBy = 3.25, exBh = 0.64;
      const exRoofY = getCanopyArchY(exX) + 0.08;
      const exRodLen = Math.max(0.3, exRoofY - (exBy + exBh * 0.5));
      addBox(bSteelDark, 0.10, exBh, 2.84, exX, exBy, concMidZ);
      addBox(bSteelDark, 0.04, exRodLen, 0.04, exX, exBy + exBh * 0.5 + exRodLen * 0.5, concMidZ - 1.05);
      addBox(bSteelDark, 0.04, exRodLen, 0.04, exX, exBy + exBh * 0.5 + exRodLen * 0.5, concMidZ + 1.05);
      addAtlasQuad(bSign, 2.76, 0.60, exX - 0.06, exBy, concMidZ, 0, -Math.PI * 0.5, 0, SIGN_UV.exitYellow);
      addAtlasQuad(bSign, 2.76, 0.60, exX + 0.06, exBy, concMidZ, 0, Math.PI * 0.5, 0, SIGN_UV.exitYellow);

      const evX = stairX;
      const evZ = stairFootZ + (jpoZ > 0 ? -0.35 : 0.35);
      const evBy = 3.25, evBh = 0.44;
      const evRoofY = getCanopyArchY(evX) + 0.08;
      const evRodLen = Math.max(0.3, evRoofY - (evBy + evBh * 0.5));
      addBox(bSteelDark, 1.12, evBh, 0.08, evX, evBy, evZ);
      addBox(bSteelDark, 0.04, evRodLen, 0.04, evX - 0.38, evBy + evBh * 0.5 + evRodLen * 0.5, evZ);
      addBox(bSteelDark, 0.04, evRodLen, 0.04, evX + 0.38, evBy + evBh * 0.5 + evRodLen * 0.5, evZ);
      addAtlasQuad(bSign, 1.04, 0.38, evX, evBy, evZ - 0.045, 0, Math.PI, 0, SIGN_UV.evakuasiGreen);
      addAtlasQuad(bSign, 1.04, 0.38, evX, evBy, evZ + 0.045, 0, 0, 0, SIGN_UV.evakuasiGreen);

      if (!isIsland) {
        const cevZ = cStairFootZ + (cStairTopZ > cStairFootZ ? -0.45 : 0.45);
        const cevBy = 3.25;
        const cevRodLen = Math.max(0.2, (UPPER_FLOOR_Y - 0.28) - (cevBy + 0.22) + 0.02);
        addBox(bSteelDark, 1.12, 0.44, 0.08, cStairX, cevBy, cevZ);
        addBox(bSteelDark, 0.04, cevRodLen, 0.04, cStairX - 0.38, cevBy + 0.22 + cevRodLen * 0.5, cevZ);
        addBox(bSteelDark, 0.04, cevRodLen, 0.04, cStairX + 0.38, cevBy + 0.22 + cevRodLen * 0.5, cevZ);
        addAtlasQuad(bSign, 1.04, 0.38, cStairX, cevBy, cevZ - 0.045, 0, Math.PI, 0, SIGN_UV.evakuasiGreen);
        addAtlasQuad(bSign, 1.04, 0.38, cStairX, cevBy, cevZ + 0.045, 0, 0, 0, SIGN_UV.evakuasiGreen);
      }

      const totemX = p1MinX + 3.0;
      const totemZ = 8.6;
      addBox(bSteelDark, 1.66, 0.08, 0.30, totemX, 0.04, totemZ);
      addBox(bSteelDark, 0.08, 1.88, 0.14, totemX - 0.76, 0.94, totemZ);
      addBox(bSteelDark, 0.08, 1.88, 0.14, totemX + 0.76, 0.94, totemZ);
      addBox(bSteelDark, 1.62, 0.58, 0.14, totemX, 1.54, totemZ);
      addAtlasQuad(bSign, 1.52, 0.48, totemX, 1.54, totemZ + 0.075, 0, 0, 0, SIGN_UV.routeMap);
      addAtlasQuad(bSign, 1.52, 0.48, totemX, 1.54, totemZ - 0.075, 0, Math.PI, 0, SIGN_UV.routeMap);
      this._addCollider(totemX - 0.86, 0, totemZ - 0.16, totemX + 0.86, 1.92, totemZ + 0.16, 'metal');
      this.interactables.push({
        id: 'route_totem', type: 'info', x: totemX, y: 1.2, z: totemZ,
        label: '[E] Periksa Peta Rute LRT Jabodebek',
        prompt: '[E] Periksa Peta Rute LRT Jabodebek', used: false
      });

      for (let hz = -38; hz <= 38; hz += 38) {
        if (!isIsland && hz > concMinZ && hz < concMaxZ) continue;
        const hx = isIsland ? (p1MinX + 3.96) : (p1MaxX - 0.53);
        let hUseZ = isIsland ? (hz === 0 ? -12 : hz) : hz;
        if (isInStairExclusion(hx, hUseZ, 0.4, 0.6)) hUseZ = jpoZ > 0 ? -14 : 14;
        if (isInStairExclusion(hx, hUseZ, 0.4, 0.6)) continue;
        addAtlasBox(bSign, 0.34, 1.18, 0.74, hx, 0.60, hUseZ, 0,
          { 0: SIGN_UV.hydrantRed, 1: SIGN_UV.hydrantRed }, SIGN_UV.hydrantRedSolid);
        this._addCollider(hx - 0.20, 0, hUseZ - 0.40, hx + 0.20, 1.24, hUseZ + 0.40, 'metal');
      }

      // Fluorescent Tubes & Batten Housings
      const isClearOfJpoAndStairs = (tx, tz) => {
        if (Math.abs(tz - jpoZ) < jpoDepth * 0.5 + 1.8) return false;
        if (jpo2Z !== null && Math.abs(tz - jpo2Z) < 4.2) return false;
        if (arch.hasDepotShed && Math.abs(tz - 52.0) < 4.4) return false;
        if (isInStairExclusion(tx, tz, 0.2, 0.2)) return false;
        return true;
      };
      const tubeCoords = [];
      const tzMin = Math.round(platMinZ + 14);
      const tzMax = Math.round(platMaxZ - 14);
      for (let tz = tzMin; tz <= tzMax; tz += 14) {
        const txMain = p1MinX + 2.05;
        if (isClearOfJpoAndStairs(txMain, tz)) {
          tubeCoords.push({ x: txMain, y: 4.35, z: tz, mount: 'canopy', roofY: getCanopyArchY(txMain) + 0.08 });
        }
        if (isIsland) {
          const txIsl = p1MaxX - 2.05;
          if (isClearOfJpoAndStairs(txIsl, tz)) {
            tubeCoords.push({ x: txIsl, y: 4.35, z: tz, mount: 'canopy', roofY: getCanopyArchY(txIsl) + 0.08 });
          }
        }
      }
      if (!isIsland) {
        const concSoffitY = UPPER_FLOOR_Y - 0.28;
        for (let cz = concMinZ + 5; cz <= concMaxZ - 5; cz += 8) {
          tubeCoords.push({ x: concMinX + 4.4, y: concSoffitY - 0.09, z: cz, mount: 'soffit', roofY: concSoffitY });
          if (cw > 11.5) {
            tubeCoords.push({ x: concMaxX - 4.4, y: concSoffitY - 0.09, z: cz, mount: 'soffit', roofY: concSoffitY });
          }
        }
        const balcRoofSoffitY = eaveY - 0.13;
        const balcTubeX = concMaxX - 2.4;
        tubeCoords.push({ x: balcTubeX, y: balcRoofSoffitY - 0.09, z: concMidZ - Math.min(12, concLen * 0.25), mount: 'soffit', roofY: balcRoofSoffitY });
        tubeCoords.push({ x: balcTubeX, y: balcRoofSoffitY - 0.09, z: concMidZ + Math.min(12, concLen * 0.25), mount: 'soffit', roofY: balcRoofSoffitY });
      } else if (isCawang) {
        for (let tz = -42; tz <= 42; tz += 28) {
          if (Math.abs(tz) > 12) {
            const i2tx = i2MinX + 4.5;
            tubeCoords.push({ x: i2tx, y: 4.35, z: tz, mount: 'canopy', roofY: getCanopyArchY(i2tx) + 0.08 });
          }
        }
      }
      if (arch.hasDepotShed) {
        tubeCoords.push({ x: p1MaxX + 4.8, y: 4.65, z: 42, mount: 'canopy', roofY: 6.75 });
        tubeCoords.push({ x: p1MaxX + 4.8, y: 4.65, z: 58, mount: 'canopy', roofY: 6.75 });
      }
      const jpoSoffitY = jpoPergolaY - 0.11;
      if (isCawang) {
        for (const mz of [-5.5, 5.5]) {
          for (const mx of [-4.0, 7.5, 16.5, 25.5]) {
            tubeCoords.push({ x: mx, y: jpoSoffitY - 0.09, z: mz, mount: 'soffit', roofY: jpoSoffitY });
          }
        }
      } else {
        tubeCoords.push({ x: jpoCX - 4.0, y: jpoSoffitY - 0.09, z: jpoZ, mount: 'soffit', roofY: jpoSoffitY });
        tubeCoords.push({ x: jpoCX + 4.0, y: jpoSoffitY - 0.09, z: jpoZ, mount: 'soffit', roofY: jpoSoffitY });
      }
      if (jpo2Z !== null) {
        tubeCoords.push({ x: jpo2CX, y: jpoSoffitY - 0.09, z: jpo2Z, mount: 'soffit', roofY: jpoSoffitY });
      }

      for (let t = 0; t < tubeCoords.length; t++) {
        const tc = tubeCoords[t];
        addBox(bSteelDark, 0.24, 0.06, 2.32, tc.x, tc.y + 0.06, tc.z);
        if (tc.mount === 'canopy') {
          const rodBot = tc.y + 0.09;
          const rodLen = Math.max(0.2, tc.roofY - rodBot);
          addBox(bSteelDark, 0.035, rodLen, 0.035, tc.x, rodBot + rodLen * 0.5, tc.z - 0.88);
          addBox(bSteelDark, 0.035, rodLen, 0.035, tc.x, rodBot + rodLen * 0.5, tc.z + 0.88);
        }
      }

      // Cikoko Elevated Inner-Ring Highway Overpass crossing high above z = -88 (clearing trains & cross street!)
      if (arch.hasTollOverpass) {
        const tollZ = -90.0;
        const tollY = 6.6;
        const tollMat = mats.highwayAsphalt || matConcreteRough;
        addBox(bConcrete, 175, 0.80, 14.5, 5.0, tollY - 0.40, tollZ, 0, 0, 0, 12, 2);
        const tollTop = new THREE.Mesh(new THREE.BoxGeometry(175, 0.06, 13.4), tollMat);
        tollTop.position.set(5.0, tollY + 0.03, tollZ);
        this.disposableGeometries.push(tollTop.geometry);
        root.add(tollTop);
        addBox(bJpo, 175, 0.90, 0.50, 5.0, tollY + 0.45, tollZ);
        addBox(bConcrete, 175, 0.85, 0.45, 5.0, tollY + 0.42, tollZ - 7.0);
        addBox(bConcrete, 175, 0.85, 0.45, 5.0, tollY + 0.42, tollZ + 7.0);
        for (const px of [-36, -15, 34, 62]) {
          const pH = (tollY - 0.8) - STREET_GROUND_Y;
          addBox(bConcrete, 1.8, pH, 2.2, px, STREET_GROUND_Y + pH * 0.5, tollZ);
          addBox(bConcrete, 2.2, 0.9, 10.5, px, tollY - 1.1, tollZ);
          this._addCollider(px - 0.95, STREET_GROUND_Y, tollZ - 1.15, px + 0.95, tollY, tollZ + 1.15, 'concrete');
        }
      }

      // =========================================================
      // 7. MERGE STATIC STATION BUCKETS & BUILD MESH BVHs
      // =========================================================
      mergeBucket(bConcrete, matConcrete, true, true, this.disposableGeometries, root, 'StationConcrete', this.bvhMeshes);
      mergeBucket(bConcreteRough, matConcreteRough, false, true, this.disposableGeometries, root, 'StationBallast', this.bvhMeshes);
      mergeBucket(bTerrazzo, mats.terrazzo || matConcrete, false, true, this.disposableGeometries, root, 'StationTerrazzo', this.bvhMeshes);
      mergeBucket(bChecker, mats.checkerFloor || matConcrete, false, true, this.disposableGeometries, root, 'StationChecker', this.bvhMeshes);
      mergeBucket(bTactile, mats.tactile || matConcrete, false, true, this.disposableGeometries, root, 'StationTactile', null);
      mergeBucket(bRoof, matCanopy, true, true, this.disposableGeometries, root, 'StationCanopy', this.bvhMeshes);
      mergeBucket(bTruss, mats.steelTruss || matConcrete, true, false, this.disposableGeometries, root, 'StationTrusses', this.bvhMeshes);
      mergeBucket(bSteelDark, mats.steelDark || matConcrete, false, true, this.disposableGeometries, root, 'StationSteelDark', this.bvhMeshes);
      mergeBucket(bJpo, mats.jpoOrange || matConcrete, true, true, this.disposableGeometries, root, 'StationJPO', this.bvhMeshes);
      mergeBucket(bStall, mats.stallAtlas || matDarkWood, true, true, this.disposableGeometries, root, 'StationStalls', this.bvhMeshes);
      mergeBucket(bSign, mats.signageAtlas || matConcrete, false, false, this.disposableGeometries, root, 'StationSignage', null);
      mergeBucket(bBanner, mats.stationBanner || matConcrete, false, false, this.disposableGeometries, root, 'StationBanner', null);
      mergeBucket(bStairStepsConc, matConcrete, true, true, this.disposableGeometries, root, 'StationStairStepsConc', null);
      mergeBucket(bStairStepsSteel, mats.steelDark || matConcrete, false, true, this.disposableGeometries, root, 'StationStairStepsSteel', null);
      const matInvisStairSlope = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      this.disposableMaterials.push(matInvisStairSlope);
      mergeBucket(bStairSlopeBvh, matInvisStairSlope, false, false, this.disposableGeometries, root, 'StationStairSlopes', this.bvhMeshes);

      // =========================================================
      // 8. DESTRUCTIBLE PILLARS + SHATTERABLE GLASS + TUBES + DYNAMIC PROPS
      // =========================================================
      this.pillars = [];
      const pillarPositions = [];
      for (let pz = -36; pz <= 36; pz += 18) {
        pillarPositions.push([p1MaxX - 0.55, pz]);
        if (isIsland && pz % 36 === 0) pillarPositions.push([p1MinX + 3.4, pz]);
      }
      if (!isIsland) {
        pillarPositions.push([concMinX + 7.5, concMinZ + 4.5]);
        pillarPositions.push([concMinX + 7.5, concMaxZ - 4.5]);
      }

      const coreGeo = buildRebarCoreGeometry();
      this.disposableGeometries.push(coreGeo);
      const pillarCoresInst = new THREE.InstancedMesh(coreGeo, mats.concreteRebar, pillarPositions.length);
      pillarCoresInst.castShadow = true;
      pillarCoresInst.receiveShadow = true;
      root.add(pillarCoresInst);

      for (let p = 0; p < pillarPositions.length; p++) {
        const px = pillarPositions[p][0];
        const pz = pillarPositions[p][1];
        if (isInStairExclusion(px, pz, 0.4, 0.4)) {
          _tmpDummy.scale.set(0, 0, 0);
          _tmpDummy.updateMatrix();
          pillarCoresInst.setMatrixAt(p, _tmpDummy.matrix);
          continue;
        }
        _tmpDummy.position.set(px, 1.90, pz);
        _tmpDummy.rotation.set(0, 0, 0);
        _tmpDummy.scale.set(1, 1, 1);
        _tmpDummy.updateMatrix();
        pillarCoresInst.setMatrixAt(p, _tmpDummy.matrix);

        const shellGeo = prepGeo(new THREE.BoxGeometry(0.76, 3.85, 0.76, 3, 6, 3), true);
        this.disposableGeometries.push(shellGeo);
        const basePos = new Float32Array(shellGeo.attributes.position.array);
        const shellMesh = new THREE.Mesh(shellGeo, mats.concretePillar);
        shellMesh.position.set(px, 1.925, pz);
        shellMesh.castShadow = true;
        shellMesh.receiveShadow = true;
        root.add(shellMesh);

        const colId = this._addCollider(px - 0.40, 0, pz - 0.40, px + 0.40, 3.85, pz + 0.40, 'pillar', {
          pillarId: this.pillars.length
        });

        this.pillars.push({
          id: this.pillars.length, x: px, y: 1.925, z: pz,
          hp: 140, maxHp: 140, destroyed: false, deformed: false,
          shellMesh: shellMesh, basePos: basePos, colliderIdx: colId
        });
      }
      pillarCoresInst.instanceMatrix.needsUpdate = true;

      // Shatterable Glass Panes
      const glassGeo = new THREE.BoxGeometry(1, 1, 1);
      this.disposableGeometries.push(glassGeo);
      const glassInst = new THREE.InstancedMesh(glassGeo, mats.glassPsd, Math.max(1, glassRecords.length));
      glassInst.renderOrder = 3;
      root.add(glassInst);
      this._glassInst = glassInst;
      this.glassPanes = [];

      for (let i = 0; i < glassRecords.length; i++) {
        const g = glassRecords[i];
        g.id = i;
        g.instIdx = i;
        g.broken = false;
        this.glassPanes.push(g);
        if (this.colliders[g.colliderIdx]) this.colliders[g.colliderIdx].glassId = i;
        _tmpDummy.position.set(g.cx, g.cy, g.cz);
        _tmpDummy.rotation.set(0, g.ry, 0);
        _tmpDummy.scale.set(g.w, g.h, g.d);
        _tmpDummy.updateMatrix();
        glassInst.setMatrixAt(i, _tmpDummy.matrix);
      }
      glassInst.instanceMatrix.needsUpdate = true;
      this.setPsdOpen(0, 1);
      this.setPsdOpen(0, -1);

      // Flickering Fluorescent Tubes + Halos
      const tubeGeo = new THREE.BoxGeometry(0.14, 0.06, 2.2);
      this.disposableGeometries.push(tubeGeo);
      const tubeStateArr = new Float32Array(Math.max(1, tubeCoords.length) * 2);
      const tubeInst = new THREE.InstancedMesh(tubeGeo, mats.flickerTube, Math.max(1, tubeCoords.length));
      const haloGeo = new THREE.PlaneGeometry(0.72, 2.15);
      haloGeo.rotateX(-Math.PI * 0.5);
      this.disposableGeometries.push(haloGeo);
      const haloInst = new THREE.InstancedMesh(haloGeo, mats.tubeHalo, Math.max(1, tubeCoords.length));

      this.tubes = [];
      for (let t = 0; t < tubeCoords.length; t++) {
        const tc = tubeCoords[t];
        const seedVal = rng() * 100.0;
        const startHealth = chosenMoodKey === 'BLACKOUT_EMERGENCY'
          ? (rng() < 0.45 ? 0.0 : rng() < 0.65 ? 0.35 : 0.96)
          : (rng() < 0.15 ? 0.42 : 1.0);
        tubeStateArr[t * 2] = seedVal;
        tubeStateArr[t * 2 + 1] = startHealth;

        _tmpDummy.position.set(tc.x, tc.y, tc.z);
        _tmpDummy.rotation.set(0, 0, 0);
        _tmpDummy.scale.set(1, 1, 1);
        _tmpDummy.updateMatrix();
        tubeInst.setMatrixAt(t, _tmpDummy.matrix);

        _tmpDummy.position.set(tc.x, tc.y - 0.05, tc.z);
        _tmpDummy.scale.setScalar(startHealth > 0.1 ? 1.0 : 0.0);
        _tmpDummy.updateMatrix();
        haloInst.setMatrixAt(t, _tmpDummy.matrix);

        this.tubes.push({ id: t, x: tc.x, y: tc.y, z: tc.z, seed: seedVal, health: startHealth, instIdx: t });
      }
      tubeGeo.setAttribute('aTubeState', new THREE.InstancedBufferAttribute(tubeStateArr, 2));
      tubeInst.instanceMatrix.needsUpdate = true;
      haloInst.instanceMatrix.needsUpdate = true;
      root.add(tubeInst);
      root.add(haloInst);
      this._tubeInst = tubeInst;
      this._tubeHaloInst = haloInst;

      // Dynamic Rigid-Body Props
      const paintPropSpecs = [
        { x: rotioX + 2.15, y: 0.42, z: rotioZ + 1.45, sx: 0.42, sy: 0.82, sz: 0.42, rx: 0, ry: 0.2, rz: 0, color: 0xe6b81a, halfH: 0.41, dynamic: true },
        { x: rotioX + 2.15, y: 0.22, z: rotioZ + 2.10, sx: 0.42, sy: 0.82, sz: 0.42, rx: 1.45, ry: 0.7, rz: 0.3, color: 0xe6b81a, halfH: 0.22, dynamic: true }
      ];
      const metalPropSpecs = [];
      const benchZs = [-42, -14, 14, 42];
      for (let bi = 0; bi < benchZs.length; bi++) {
        const bz = benchZs[bi];
        const tx = p1MinX + 3.4;
        if (!isInStairExclusion(tx, bz + 2.2, 0.5, 0.5)) {
          paintPropSpecs.push({ x: tx, y: 0.45, z: bz + 2.2, sx: 0.55, sy: 0.90, sz: 0.40, rx: 0, ry: 0, rz: 0, color: 0x3b82c4, halfH: 0.45, dynamic: true });
        }
        if (!isInStairExclusion(tx, bz, 0.5, 1.2)) {
          metalPropSpecs.push({ x: tx, y: 0.26, z: bz, sx: 0.56, sy: 0.52, sz: 2.1, rx: 0, ry: 0, rz: 0, color: 0x383e44, halfH: 0.26, dynamic: true });
        }
        if (rng() > 0.3 && !isInStairExclusion(tx - 0.5, bz - 2.6, 0.5, 0.5)) {
          paintPropSpecs.push({ x: tx - 0.5, y: 0.32, z: bz - 2.6, sx: 0.46, sy: 0.64, sz: 0.28, rx: rng() > 0.5 ? 1.4 : 0, ry: rng() * 3, rz: 0, color: rng() > 0.5 ? 0x7c2d2d : 0x2f3b4a, halfH: 0.24, dynamic: true });
        }
      }
      const barricadePropSpecs = [];
      const barZs = [-36, -10, 40];
      for (let k = 0; k < barZs.length; k++) {
        const brZ = barZs[k];
        const brX = p1MinX + 2.8 + (k % 2) * 1.1;
        if (isInStairExclusion(brX, brZ, 0.8, 0.8)) continue;
        barricadePropSpecs.push({ x: brX, y: 0.39, z: brZ, sx: 1.20, sy: 0.78, sz: 0.20, rx: 0, ry: (rng() - 0.5) * 0.4, rz: 0, color: 0xffffff, halfH: 0.39, dynamic: true });
      }
      for (let t = 0; t < turnstileList.length; t++) {
        const ts = turnstileList[t];
        metalPropSpecs.push({ x: ts.x, y: 0.72, z: ts.z, sx: 0.46, sy: 0.14, sz: 0.46, rx: 0, ry: ts.yaw, rz: 0, color: 0xd6dade, halfH: 0.12, dynamic: false, interactId: ts.id });
      }

      const propBoxGeo = new THREE.BoxGeometry(1, 1, 1);
      this.disposableGeometries.push(propBoxGeo);
      const propsPaintInst = new THREE.InstancedMesh(propBoxGeo, mats.propsPaint, Math.max(1, paintPropSpecs.length));
      propsPaintInst.castShadow = false;
      propsPaintInst.receiveShadow = true;
      root.add(propsPaintInst);
      this._propsPaintInst = propsPaintInst;

      const propsMetalInst = new THREE.InstancedMesh(propBoxGeo, mats.propsMetal, Math.max(1, metalPropSpecs.length));
      propsMetalInst.castShadow = false;
      propsMetalInst.receiveShadow = true;
      root.add(propsMetalInst);
      this._propsMetalInst = propsMetalInst;

      const barricadeGeo = buildBarricadeGeometry();
      this.disposableGeometries.push(barricadeGeo);
      const barricadeInst = new THREE.InstancedMesh(barricadeGeo, mats.barricade, Math.max(1, barricadePropSpecs.length));
      barricadeInst.castShadow = false;
      barricadeInst.receiveShadow = true;
      root.add(barricadeInst);
      this._barricadeInst = barricadeInst;

      this.dynamicProps = [];
      const registerProps = (specs, instMesh, isMetal) => {
        for (let i = 0; i < specs.length; i++) {
          const sp = specs[i];
          _tmpDummy.position.set(sp.x, sp.y, sp.z);
          _tmpDummy.rotation.set(sp.rx, sp.ry, sp.rz);
          _tmpDummy.scale.set(sp.sx, sp.sy, sp.sz);
          _tmpDummy.updateMatrix();
          instMesh.setMatrixAt(i, _tmpDummy.matrix);
          _tmpColor.setHex(sp.color);
          instMesh.setColorAt(i, _tmpColor);

          const colId = sp.dynamic ? this._addCollider(
            sp.x - sp.sx * 0.5, sp.y - sp.sy * 0.5, sp.z - sp.sz * 0.5,
            sp.x + sp.sx * 0.5, sp.y + sp.sy * 0.5, sp.z + sp.sz * 0.5,
            isMetal ? 'metal' : 'prop', { propId: this.dynamicProps.length }
          ) : -1;

          this.dynamicProps.push({
            id: this.dynamicProps.length, instMesh: instMesh, instIdx: i,
            x: sp.x, y: sp.y, z: sp.z, rx: sp.rx, ry: sp.ry, rz: sp.rz,
            sx: sp.sx, sy: sp.sy, sz: sp.sz, vx: 0, vy: 0, vz: 0,
            avx: 0, avy: 0, avz: 0, halfH: sp.halfH, dynamic: sp.dynamic,
            detached: false, settleTimer: 0, spinTimer: 0,
            interactId: sp.interactId || null, colliderIdx: colId
          });
        }
        instMesh.instanceMatrix.needsUpdate = true;
        if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
      };
      registerProps(paintPropSpecs, propsPaintInst, false);
      registerProps(metalPropSpecs, propsMetalInst, true);
      registerProps(barricadePropSpecs, barricadeInst, false);

      // Overgrown Canopy Vines (anchored cleanly onto canopy purlins above platform!)
      const vineCount = arch.heavyOvergrowth ? 34 : 16;
      const vPlane1 = new THREE.PlaneGeometry(1.4, 2.4);
      vPlane1.translate(0, -1.2, 0);
      const vPlane2 = new THREE.PlaneGeometry(1.4, 2.4);
      vPlane2.rotateY(Math.PI * 0.5);
      vPlane2.translate(0, -1.2, 0);
      const vineGeo = THREE_UTILS.mergeGeometries([prepGeo(vPlane1, false), prepGeo(vPlane2, false)], false);
      vPlane1.dispose();
      vPlane2.dispose();
      this.disposableGeometries.push(vineGeo);
      const vinesInst = new THREE.InstancedMesh(vineGeo, mats.foliageVine, vineCount);
      const purlinXs = [];
      for (let k = 0; k <= segs; k++) {
        const candX = canopyMinX + (k / segs) * canopySpanX;
        const nearTrack = trackXs.some((tx) => Math.abs(candX - tx) < 2.15);
        if (!nearTrack) purlinXs.push(candX);
      }
      if (purlinXs.length === 0) purlinXs.push(p1MinX + 2.2);
      for (let v = 0; v < vineCount; v++) {
        const px = purlinXs[v % purlinXs.length];
        const roofY = getCanopyArchY(px) + 0.04;
        _tmpDummy.position.set(px, roofY, (rng() - 0.5) * (platLen - 14));
        _tmpDummy.rotation.set(0, rng() * Math.PI, 0);
        const sc = 0.65 + rng() * 0.65;
        const maxSafeSy = Math.max(0.35, (roofY - 4.35) / 2.4);
        const sy = Math.min(maxSafeSy, sc * (0.85 + rng() * 0.5));
        _tmpDummy.scale.set(sc, sy, sc);
        _tmpDummy.updateMatrix();
        vinesInst.setMatrixAt(v, _tmpDummy.matrix);
      }
      vinesInst.instanceMatrix.needsUpdate = true;
      root.add(vinesInst);

      // Roti'O Warm Plinth Glow (flush-mounted, zero floating cubes)
      const amberPositions = [
        [rotioX, 0.04, rotioZ + 1.15, 3.3, 0.08, 0.14]
      ];
      const amberGeo = new THREE.BoxGeometry(1, 1, 1);
      this.disposableGeometries.push(amberGeo);
      const amberInst = new THREE.InstancedMesh(amberGeo, mats.amberBeacon, amberPositions.length);
      this._amberBasePositions = amberPositions;
      for (let a = 0; a < amberPositions.length; a++) {
        const ap = amberPositions[a];
        _tmpDummy.position.set(ap[0], ap[1], ap[2]);
        _tmpDummy.rotation.set(0, 0, 0);
        _tmpDummy.scale.set(ap[3], ap[4], ap[5]);
        _tmpDummy.updateMatrix();
        amberInst.setMatrixAt(a, _tmpDummy.matrix);
      }
      amberInst.instanceMatrix.needsUpdate = true;
      root.add(amberInst);
      this._amberInst = amberInst;

      // =========================================================
      // 9. POLY HAVEN .GLTF STATION PROPS (CLEAR OF STAIRS & PSDS!)
      // =========================================================
      this._placeNormalizedModel('CashRegister_01', rotioX + 0.65, 0.99, rotioZ + 0.82, 0.1, 0.42);
      if (!isInStairExclusion(rotioX - 2.3, rotioZ + 1.8, 0.4, 0.4)) {
        this._placeNormalizedModel('WetFloorSign_01', rotioX - 2.3, 0.0, rotioZ + 1.8, 0.35, 0.64);
      }
      if (!isInStairExclusion(p1MinX + 2.8, 12.0, 0.4, 0.4)) {
        this._placeNormalizedModel('WetFloorSign_01', p1MinX + 2.8, 0.0, 12.0, -0.4, 0.64);
      }
      if (!isIsland) {
        this._placeNormalizedModel('CoffeeCart_01', concMinX + 8.6, 0.0, concMidZ + 7.2, -Math.PI * 0.5, 1.80, null, 'wood');
        this._placeNormalizedModel('portable_generator', concMinX + 2.6, 0.0, concMinZ + 4.8, 0.4, 0.68, null, 'metal');
        this._placeNormalizedModel('potted_plant_02', concMaxX - 1.4, 0.0, concMidZ - 6.2, 0.0, 0.78);
        this._placeNormalizedModel('potted_plant_02', concMaxX - 1.4, 0.0, concMidZ + 6.2, 1.1, 0.78);
        this._placeNormalizedModel('planter_box_01', concMaxX + 1.2, SIDEWALK_Y, concMidZ - 6.2, Math.PI * 0.5, 0.46);
        this._placeNormalizedModel('planter_box_01', concMaxX + 1.2, SIDEWALK_Y, concMidZ + 6.2, Math.PI * 0.5, 0.46);
        this._placeNormalizedModel('mounted_fluorescent_lights', concMinX + 5.5, UPPER_FLOOR_Y - 0.34, concMidZ, Math.PI * 0.5, 0.05,
          (n) => n.name === 'mounted_fluorescent_lights_d'
        );
      } else {
        this._placeNormalizedModel('portable_generator', p1MaxX - 1.8, 0.0, -24.0, 0.5, 0.68, null, 'metal');
        this._placeNormalizedModel('potted_plant_02', p1MaxX - 2.0, 0.0, 6.0, 0.4, 0.78);
      }

      const genX = !isIsland ? (concMinX + 2.6) : (p1MaxX - 1.8);
      const genY = 0.85;
      const genZ = !isIsland ? (concMinZ + 4.8) : -24.0;
      const genUsed = this._usedIds.has('portable_generator') || this._powerRestored;
      this.interactables.push({
        id: 'portable_generator',
        type: 'generator',
        x: genX,
        y: genY,
        z: genZ,
        label: genUsed ? '[E] Generator Darurat (Aktif)' : '[E] Hidupkan Generator Darurat (Pulihkan Lampu Stasiun)',
        prompt: genUsed ? '[E] Generator Darurat (Aktif)' : '[E] Hidupkan Generator Darurat (Pulihkan Lampu Stasiun)',
        used: genUsed
      });

      this._placeNormalizedModel('ammo_box', supX + 0.85, UPPER_FLOOR_Y, supZ, 0.25, 0.26);

      this.explosiveBarrels = [];
      if (arch.hasDepotShed) {
        const b1 = this._placeNormalizedModel('Barrel_01', depotMaxX - 1.3, 0.0, 41.0, 0.0, 0.90, null, 'barrel');
        const c1 = this.colliders[this.colliders.length - 1];
        if (c1) c1.barrelId = 0;
        this.explosiveBarrels.push({
          id: 0, x: depotMaxX - 1.3, y: 0.0, z: 41.0, hp: 35, exploded: false, mesh: b1, colliderIdx: this.colliders.length - 1
        });

        const b2 = this._placeNormalizedModel('Barrel_01', depotMaxX - 1.3, 0.0, 48.0, 1.2, 0.90, null, 'barrel');
        const c2 = this.colliders[this.colliders.length - 1];
        if (c2) c2.barrelId = 1;
        this.explosiveBarrels.push({
          id: 1, x: depotMaxX - 1.3, y: 0.0, z: 48.0, hp: 35, exploded: false, mesh: b2, colliderIdx: this.colliders.length - 1
        });
      }

      // =========================================================
      // 10. STATION POINTLIGHT POOL (7 LIGHTS, NEVER TOGGLED VIA .visible!)
      // =========================================================
      this.stationLights = [];
      const tubeInt = mood && mood.tubeIntensity !== undefined ? mood.tubeIntensity : 0.85;
      const pwr = this._powerRestored ? 1.0 : 0.22;
      const addStationLight = (lx, ly, lz, colorHex, baseInt, dist, kind) => {
        const l = new THREE.PointLight(colorHex, baseInt * tubeInt * this._lightingFactor * pwr, dist, 1.35);
        l.position.set(lx, ly, lz);
        l.visible = true; // NEVER toggle light.visible at runtime!
        l.castShadow = false;
        root.add(l);
        this.stationLights.push({ light: l, baseIntensity: baseInt, kind: kind || 'station' });
      };
      addStationLight(p1MinX + 2.8, 3.85, -22.0, 0xd8ecff, 6.0, 28, 'platform');
      addStationLight(p1MinX + 2.8, 3.85, 0.0, 0xd8ecff, 6.5, 28, 'platform');
      addStationLight(p1MinX + 2.8, 3.85, 22.0, 0xd8ecff, 6.0, 28, 'platform');
      addStationLight(rotioX, 2.45, rotioZ + 1.35, 0xffb45a, 7.0, 18, 'rotio');
      addStationLight(isIsland ? (p1MinX + p1Width * 0.5) : (concMinX + cw * 0.5), 3.65, concMidZ, 0xe4f1ff, 6.5, 28, 'concourse');
      addStationLight(jpoCX, 6.35, jpoZ, 0xf6e8cf, 5.0, 26, 'jpo');
      addStationLight(isIsland ? track2X + 2.5 : -8.5, 3.65, 0.0, 0xd8ecff, 5.5, 28, 'platform2');

      // =========================================================
      // 11. BUILD OPEN JAKARTA CITY DISTRICT AROUND STATION
      // =========================================================
      const endApronSpans = [[p1MinX, p1MaxX]];
      if (!isIsland) endApronSpans.push([p2MinX, p2MaxX]);
      else if (isCawang) endApronSpans.push([i2MinX, i2MaxX]);

      if (LRT.City && typeof LRT.City.build === 'function') {
        LRT.City.build(arch, rng, root, {
          corridorMinX: corridorMinX,
          corridorMaxX: corridorMaxX,
          platMinZ: platMinZ,
          platMaxZ: platMaxZ,
          trackXs: trackXs,
          endApronSpans: endApronSpans,
          isIsland: isIsland,
          isCawang: isCawang,
          moodKey: chosenMoodKey,
          tubeIntensity: tubeInt,
          usedIds: this._usedIds
        });
        const cityCols = LRT.City.getColliders ? LRT.City.getColliders() : [];
        for (let ci = 0; ci < cityCols.length; ci++) {
          const cc = cityCols[ci];
          this._addCollider(cc.minX, cc.minY, cc.minZ, cc.maxX, cc.maxY, cc.maxZ, cc.tag, {
            blocksWalk: cc.blocksWalk,
            blocksBullets: cc.blocksBullets,
            isFloor: cc.isFloor,
            isRamp: cc.isRamp,
            rampAxis: cc.rampAxis,
            y0: cc.y0,
            y1: cc.y1
          });
        }
      }

      // Finalize 2m x 2m Spatial Hash Grid (indexes BOTH station & city colliders!)
      this._buildSpatialGrid();

      // =========================================================
      // 12. GENERATE ZOMBIE SPAWN NODES (STATION + CITY STREETS)
      // =========================================================
      this.spawnNodes = [];
      const candidateZones = [
        { x: p1MinX + 2.5, z: platMinZ + 8, zone: 'platform_south' },
        { x: p1MinX + 4.2, z: platMinZ + 16, zone: 'platform_south' },
        { x: p1MinX + 2.6, z: -34, zone: 'platform_south' },
        { x: p1MinX + 4.0, z: -25, zone: 'platform_south' },
        { x: p1MinX + 2.6, z: 25, zone: 'platform_north' },
        { x: p1MinX + 4.2, z: 33, zone: 'platform_north' },
        { x: p1MinX + 2.8, z: platMaxZ - 16, zone: 'platform_north' },
        { x: p1MinX + 4.1, z: platMaxZ - 8, zone: 'platform_north' },
        { x: p1MinX + 3.4, z: 14, zone: 'platform_mid' },
        { x: p1MinX + 3.4, z: -14, zone: 'platform_mid' }
      ];
      if (!isIsland) {
        candidateZones.push(
          { x: concMinX + 3.8, z: concMidZ - 11, zone: 'concourse' },
          { x: concMinX + 6.5, z: concMidZ - 5, zone: 'concourse' },
          { x: concMinX + 8.5, z: concMidZ + 6, zone: 'concourse' },
          { x: concMinX + 4.5, z: concMidZ + 11, zone: 'concourse' },
          { x: concMinX + 9.8, z: concMidZ - 11, zone: 'concourse' },
          { x: -8.6, z: jpoZ, y: UPPER_FLOOR_Y, zone: 'jpo' },
          { x: -8.6, z: 0.0, zone: 'plat2' },
          { x: concMinX + 3.5, z: concMidZ + 8, y: UPPER_FLOOR_Y, zone: 'balcony' }
        );
      } else {
        candidateZones.push(
          { x: p1MaxX - 2.2, z: -38, zone: 'island_far' },
          { x: p1MaxX - 2.2, z: -18, zone: 'island_far' },
          { x: p1MaxX - 2.2, z: 18, zone: 'island_far' },
          { x: p1MaxX - 2.2, z: 38, zone: 'island_far' },
          { x: p1MinX + 4.8, z: jpoZ, y: UPPER_FLOOR_Y, zone: 'jpo' }
        );
        if (isCawang) {
          candidateZones.push(
            { x: i2MinX + 4.5, z: -30, zone: 'island2' },
            { x: i2MinX + 4.5, z: 30, zone: 'island2' }
          );
        }
        if (arch.hasDepotShed) candidateZones.push({ x: p1MaxX + 4.5, z: 56, zone: 'depot' });
        if (arch.hasGardenTerrace) candidateZones.push({ x: track2X + 7.5, z: -34, zone: 'garden' });
      }
      if (jpo2Z !== null) candidateZones.push({ x: p1MinX + 2.8, z: jpo2Z, y: UPPER_FLOOR_Y, zone: 'jpo2' });

      if (LRT.City && typeof LRT.City.getSpawnNodes === 'function') {
        const citySpawns = LRT.City.getSpawnNodes();
        for (let i = 0; i < citySpawns.length; i++) candidateZones.push(citySpawns[i]);
      }

      for (let i = 0; i < candidateZones.length; i++) {
        const n = candidateZones[i];
        const ny = n.y !== undefined ? n.y : 0.0;
        const nearby = this.spatialGrid.queryPoint(n.x, n.z, 0.55);
        let blocked = false;
        for (let j = 0; j < nearby.length; j++) {
          const c = nearby[j];
          if (!c.blocksWalk || c.isFloor || c.isRamp || c.tag === 'floor' || c.tag === 'ramp') continue;
          if (c.maxY <= ny + 0.1 || c.minY >= ny + 1.8) continue;
          if (n.x + 0.45 > c.minX && n.x - 0.45 < c.maxX && n.z + 0.45 > c.minZ && n.z - 0.45 < c.maxZ) {
            blocked = true;
            break;
          }
        }
        if (!blocked) this.spawnNodes.push({ x: n.x, y: ny, z: n.z, zone: n.zone });
      }

      // =========================================================
      // 13. MULTI-LEVEL & OPEN-STREET WAYPOINT NAVGRAPH (A* READY)
      // =========================================================
      const isNavPointClear = (nx, ny, nz) => {
        if (!this.spatialGrid) return true;
        const near = this.spatialGrid.queryPoint(nx, nz, 0.55);
        let hasFloor = false;
        const rad = 0.36;
        for (let k = 0; k < near.length; k++) {
          const c = near[k];
          if (!c || c.broken || c.disabled || c.blocksWalk === false || c.isTrigger) continue;
          const tag = c.tag || '';
          const floorLike = c.isFloor || c.isRamp || tag === 'floor' || tag === 'ramp' || tag === 'stair' || tag === 'stairs';
          if (floorLike) {
            if (nx >= c.minX - 0.15 && nx <= c.maxX + 0.15 && nz >= c.minZ - 0.15 && nz <= c.maxZ + 0.15) {
              if (c.maxY >= ny - 0.65 && c.minY <= ny + 0.55) hasFloor = true;
            }
            continue;
          }
          if (tag === 'interact') continue;
          if (c.maxY <= ny + 0.42 || c.minY >= ny + 1.55) continue;
          const cx = Math.max(c.minX, Math.min(nx, c.maxX));
          const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
          if ((nx - cx) * (nx - cx) + (nz - cz) * (nz - cz) < rad * rad) return false;
        }
        return hasFloor;
      };
      const addSafeNavNode = (x, y, z, tag, tol) => {
        if (isNavPointClear(x, y, z)) return addNavNode(x, y, z, tag, tol);
        const offsets = [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [1.4, 0], [-1.4, 0]];
        for (let oi = 0; oi < offsets.length; oi++) {
          const tx = x + offsets[oi][0], tz = z + offsets[oi][1];
          if (isNavPointClear(tx, y, tz)) return addNavNode(tx, y, tz, tag, tol);
        }
        return -1;
      };

      const p1WalkX = p1MinX + 1.02;
      for (const pz of [-60, -48, -36, -24, -18, -12, -5, 5, 12, 18, 24, 36, 48, 60]) {
        if (!isInStairExclusion(p1WalkX, pz, -0.9, -0.9)) addSafeNavNode(p1WalkX, 0.0, pz, 'platform1', 1.1);
        if (isIsland) {
          const ieX = isCawang ? (p1MaxX - 1.85) : (p1MaxX - 1.12);
          if (!isInStairExclusion(ieX, pz, -0.9, -0.9)) addSafeNavNode(ieX, 0.0, pz, 'island_east', 1.1);
          if (!isInStairExclusion(p1MinX + 4.8, pz, -0.9, -0.9)) addSafeNavNode(p1MinX + 4.8, 0.0, pz, 'island_mid', 1.2);
        } else {
          if (!isInStairExclusion(p1MaxX - 1.4, pz, -0.9, -0.9)) addSafeNavNode(p1MaxX - 1.4, 0.0, pz, 'platform1_east', 1.1);
        }
      }
      if (!isIsland) {
        for (const cz of [concMidZ - 9.0, concMidZ - 4.0, concMidZ, concMidZ + 5.0, concMidZ + 10.0]) {
          addSafeNavNode(concMinX + 5.2, 0.0, cz, 'concourse', 1.4);
          addSafeNavNode(concMaxX - 0.65, 0.0, cz, 'concourse', 1.4);
        }
        addSafeNavNode(concMaxX - 0.65, 0.0, concMidZ - 2.1, 'concourse_portal_stair', 1.4);
        addSafeNavNode(concMaxX - 0.65, 0.0, concMidZ + 2.6, 'concourse_portal_ramp', 1.4);
        addSafeNavNode(concMinX + 2.2, 0.0, concMidZ + 3.5, 'concourse_gate', 1.2);
        addSafeNavNode(concMinX + 2.2, 0.0, concMidZ - 8.5, 'concourse_gate', 1.2);
        addSafeNavNode(concMinX + 3.4, UPPER_FLOOR_Y, concMidZ, 'balcony', 1.4);
        addSafeNavNode(concMinX + 3.4, UPPER_FLOOR_Y, (concMidZ + jpoZ) * 0.5, 'balcony', 1.4);
        addSafeNavNode(concMinX + 3.4, UPPER_FLOOR_Y, jpoZ, 'balcony', 1.4);
        for (const p2z of [-60, -46, -32, -18, -6, 6, 18, 32, 46, 60]) {
          addSafeNavNode((p2MinX + p2MaxX) * 0.5, 0.0, p2z, 'platform2', 1.2);
        }
        addSafeNavNode(-9.4, UPPER_FLOOR_Y, jpoZ, 'jpo_west', 1.2);
      } else {
        for (const jx of [jpoSpanMinX + 1.8, p1MinX + 3.2, p1MaxX - 1.8, jpoSpanMaxX - 1.8]) {
          addSafeNavNode(jx, UPPER_FLOOR_Y, jpoZ, 'jpo_deck', 1.2);
        }
        if (isCawang) {
          addSafeNavNode(i2MinX + 4.5, UPPER_FLOOR_Y, jpoZ, 'jpo_cawang', 1.2);
          for (const i2z of [-60, -48, -36, -24, -12, 0, 12, 24, 36, 48, 60]) {
            addSafeNavNode(i2MinX + 4.5, 0.0, i2z, 'island2', 1.2);
          }
        }
        if (arch.hasDepotShed) {
          addSafeNavNode(-4.0, 0.0, 38, 'depot_west', 1.2);
          addSafeNavNode(-4.0, 0.0, 48, 'depot_west', 1.2);
          addSafeNavNode(-4.0, SIDEWALK_Y, 32, 'depot_plaza_west', 1.2);
          addSafeNavNode(track2X + 3.8, 0.0, 38, 'depot_east', 1.2);
          addSafeNavNode(track2X + 3.8, 0.0, 48, 'depot_east', 1.2);
          addSafeNavNode(track2X + 3.8, SIDEWALK_Y, 32, 'depot_plaza_east', 1.2);
          addSafeNavNode(depotMaxX + 2.2, SIDEWALK_Y, 43, 'depot_door_east', 1.2);
        }
        if (arch.hasGardenTerrace) {
          addSafeNavNode(track2X + 4.5, 0.0, -44, 'garden', 1.2);
          addSafeNavNode(track2X + 4.5, 0.0, -32, 'garden', 1.2);
          addSafeNavNode(track2X + 4.5, 0.0, -21, 'garden', 1.2);
          addSafeNavNode(gardenMaxX - 1.0, 0.0, -21, 'garden_door', 1.2);
          addSafeNavNode(track2X + 3.25, 0.0, -24.5, 'garden_stair_foot', 1.2);
        }
      }
      if (jpo2Z !== null) {
        addSafeNavNode(p1MinX + 3.2, UPPER_FLOOR_Y, jpo2Z, 'jpo2', 1.2);
        if (!isIsland) addSafeNavNode(-9.4, UPPER_FLOOR_Y, jpo2Z, 'jpo2_west', 1.2);
        if (isCawang) addSafeNavNode(i2MinX + 4.5, UPPER_FLOOR_Y, jpo2Z, 'jpo2_i2', 1.2);
        if (arch.hasGardenTerrace) addSafeNavNode(track2X + 3.25, UPPER_FLOOR_Y, jpo2Z, 'jpo2_garden', 1.2);
      }

      // Level Crossings (-74 / +74) & Outer/Inner Street Spine Nodes (dense <= 16m spacing!)
      const crossMidX = (corridorMinX + corridorMaxX) * 0.5;
      for (const cz of [CROSSING_Z_SOUTH, CROSSING_Z_NORTH]) {
        addNavChain([
          [corridorMinX - 18.0, SIDEWALK_Y, cz, 1.4],
          [corridorMinX - 10.5, STREET_GROUND_Y, cz, 1.4],
          [corridorMinX - 3.0, SIDEWALK_Y, cz, 1.4],
          [corridorMinX - 0.5, STREET_GROUND_Y, cz, 1.4],
          [crossMidX, STREET_GROUND_Y, cz, 1.4],
          [corridorMaxX + 0.5, STREET_GROUND_Y, cz, 1.4],
          [corridorMaxX + 3.0, SIDEWALK_Y, cz, 1.4],
          [corridorMaxX + 10.5, STREET_GROUND_Y, cz, 1.4],
          [corridorMaxX + 18.0, SIDEWALK_Y, cz, 1.4]
        ], 'crossing');
      }
      // Track-trough exit chains so any zombie down on rails always routes cleanly out to crossings
      for (let ti = 0; ti < trackXs.length; ti++) {
        const tx = trackXs[ti];
        addNavChain([
          [tx, STREET_GROUND_Y, CROSSING_Z_SOUTH, 1.4],
          [tx, TRACK_BED_Y + 0.08, -62.0, 1.4],
          [tx, TRACK_BED_Y + 0.08, -42.0, 1.4],
          [tx, TRACK_BED_Y + 0.08, -22.0, 1.4],
          [tx, TRACK_BED_Y + 0.08, 0.0, 1.4],
          [tx, TRACK_BED_Y + 0.08, 22.0, 1.4],
          [tx, TRACK_BED_Y + 0.08, 42.0, 1.4],
          [tx, TRACK_BED_Y + 0.08, 62.0, 1.4],
          [tx, STREET_GROUND_Y, CROSSING_Z_NORTH, 1.4]
        ], 'track_bed');
      }
      for (const sz of [-58, -42, -26, -12, 0, 12, 26, 42, 58]) {
        addSafeNavNode(corridorMinX - 3.2, SIDEWALK_Y, sz, 'west_prom', 1.4);
        addSafeNavNode(corridorMaxX + 3.2, SIDEWALK_Y, sz, 'east_prom', 1.4);
        addSafeNavNode(corridorMinX - 10.5, STREET_GROUND_Y, sz, 'west_blvd', 1.6);
        addSafeNavNode(corridorMaxX + 10.5, STREET_GROUND_Y, sz, 'east_blvd', 1.6);
      }
      for (let i = 0; i < this.spawnNodes.length; i++) {
        const sp = this.spawnNodes[i];
        addSafeNavNode(sp.x, sp.y, sp.z, sp.zone, 1.6);
      }

      const isNavSegWalkable = (a, b) => {
        const horiz = Math.hypot(b.x - a.x, b.z - a.z);
        if (horiz < 0.25 || horiz > 25.0) return false;
        const steps = Math.max(3, Math.ceil(horiz / 0.90));
        const rad = 0.36;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;
          const pz = a.z + (b.z - a.z) * t;
          const near = this.spatialGrid.queryPoint(px, pz, 0.65);
          let hasFloor = false;
          for (let k = 0; k < near.length; k++) {
            const c = near[k];
            if (!c || c.broken || c.disabled || c.blocksWalk === false || c.isTrigger) continue;
            const tag = c.tag || '';
            const floorLike = c.isFloor || c.isRamp || tag === 'floor' || tag === 'ramp' || tag === 'stair' || tag === 'stairs';
            if (floorLike) {
              if (px >= c.minX - 0.15 && px <= c.maxX + 0.15 && pz >= c.minZ - 0.15 && pz <= c.maxZ + 0.15) {
                if (c.maxY >= py - 0.60 && c.minY <= py + 0.50) hasFloor = true;
              }
              continue;
            }
            if (tag === 'interact') continue;
            if (c.maxY <= py + 0.42 || c.minY >= py + 1.55) continue;
            const cx = Math.max(c.minX, Math.min(px, c.maxX));
            const cz = Math.max(c.minZ, Math.min(pz, c.maxZ));
            const dx = px - cx, dz = pz - cz;
            if (dx * dx + dz * dz < rad * rad) return false;
          }
          if (!hasFloor) return false;
        }
        return true;
      };

      const nCount = navNodes.length;
      const adj = new Array(nCount);
      for (let i = 0; i < nCount; i++) adj[i] = [];
      const addAdjBidir = (aId, bId, cost) => {
        if (!adj[aId].some((e) => e.to === bId)) adj[aId].push({ to: bId, cost });
        if (!adj[bId].some((e) => e.to === aId)) adj[bId].push({ to: aId, cost });
      };
      for (let i = 0; i < navEdges.length; i++) {
        const e = navEdges[i];
        addAdjBidir(e.a, e.b, e.cost);
      }
      for (let i = 0; i < nCount; i++) {
        const na = navNodes[i];
        for (let j = i + 1; j < nCount; j++) {
          const nb = navNodes[j];
          if (Math.abs(na.y - nb.y) > 0.45) continue;
          const dist = Math.hypot(nb.x - na.x, nb.z - na.z);
          if (dist < 0.35 || dist > 24.0) continue;
          if (isNavSegWalkable(na, nb)) {
            addAdjBidir(i, j, Math.hypot(nb.x - na.x, (nb.y - na.y) * 1.4, nb.z - na.z));
          }
        }
      }
      this.navGraph = { nodes: navNodes, adj: adj };

      root.updateMatrixWorld(true);
      this.destructibles = {
        glassPanes: this.glassPanes,
        pillars: this.pillars,
        tubes: this.tubes,
        dynamicProps: this.dynamicProps
      };
      this._drawCallsEst = 12 + this.pillars.length + 18;
      return this;
    },

    setPsdOpen: function (amount, trackDir) {
      const clamped = Math.max(0, Math.min(1, amount));
      this._psdTarget = clamped;
      this._psdOpen = clamped;
      const useTrack2 = trackDir === -1;
      const doors = useTrack2 ? (this.psdDoors2 || []) : (this.psdDoors || []);
      const frameInst = useTrack2 ? this._psdFrameInst2 : this._psdFrameInst;
      const slideDist = 0.78 * clamped;
      const isPassable = clamped > 0.62;

      for (let i = 0; i < doors.length; i++) {
        const d = doors[i];
        const coll = this.colliders[d.colliderIdx];
        if (coll) {
          coll.isOpen = isPassable;
          coll.blocksWalk = !isPassable;
          coll.disabled = isPassable;
          coll.blocksBullets = !isPassable;
        }
        const gL = this.glassPanes[d.leftGlassIdx];
        const gR = this.glassPanes[d.rightGlassIdx];

        if (frameInst) {
          _tmpDummy.rotation.set(0, 0, 0);
          _tmpDummy.scale.set(1, 1, 1);
          _tmpDummy.position.set(gL.cx, 0.18, gL.cz - slideDist);
          _tmpDummy.updateMatrix();
          frameInst.setMatrixAt(d.leftFrameInst, _tmpDummy.matrix);

          _tmpDummy.position.set(gR.cx, 0.18, gR.cz + slideDist);
          _tmpDummy.updateMatrix();
          frameInst.setMatrixAt(d.rightFrameInst, _tmpDummy.matrix);
        }

        if (this._glassInst) {
          if (!gL.broken) {
            _tmpDummy.position.set(gL.cx, gL.cy, gL.cz - slideDist);
            _tmpDummy.rotation.set(0, gL.ry, 0);
            _tmpDummy.scale.set(gL.w, gL.h, gL.d);
            _tmpDummy.updateMatrix();
            this._glassInst.setMatrixAt(gL.instIdx, _tmpDummy.matrix);
          }
          if (!gR.broken) {
            _tmpDummy.position.set(gR.cx, gR.cy, gR.cz + slideDist);
            _tmpDummy.rotation.set(0, gR.ry, 0);
            _tmpDummy.scale.set(gR.w, gR.h, gR.d);
            _tmpDummy.updateMatrix();
            this._glassInst.setMatrixAt(gR.instIdx, _tmpDummy.matrix);
          }
        }
      }

      if (frameInst) frameInst.instanceMatrix.needsUpdate = true;
      if (this._glassInst) this._glassInst.instanceMatrix.needsUpdate = true;
    },

    setLightingFactor: function (factor) {
      this._lightingFactor = Math.max(0, factor !== undefined ? factor : 1.0);
      const tubeInt = this._mood && this._mood.tubeIntensity !== undefined ? this._mood.tubeIntensity : 0.85;
      const pwr = this._powerRestored ? 1.0 : 0.22;
      for (let i = 0; i < this.stationLights.length; i++) {
        const sl = this.stationLights[i];
        sl.light.intensity = sl.baseIntensity * tubeInt * this._lightingFactor * pwr;
      }
      if (LRT.City && typeof LRT.City.setLightingFactor === 'function') {
        LRT.City.setLightingFactor(this._lightingFactor);
      }
    },

    setStreetLightIntensity: function (val) {
      const num = Number(val);
      const factor = Number.isFinite(num) ? Math.max(0.25, num) : 1.0;
      const tubeInt = this._mood && this._mood.tubeIntensity !== undefined ? this._mood.tubeIntensity : 0.85;
      const pwr = this._powerRestored ? 1.0 : 0.22;
      for (let i = 0; i < this.stationLights.length; i++) {
        const sl = this.stationLights[i];
        sl.light.intensity = sl.baseIntensity * tubeInt * factor * pwr;
      }
    },

    setLightingIntensity: function (val) {
      return this.setStreetLightIntensity(val);
    },

    update: function (dt) {
      if (!this.rootGroup) return;
      this._timeAccum += dt;

      if (LRT.City && typeof LRT.City.update === 'function') {
        LRT.City.update(dt, this._timeAccum);
      }

      // Dim blinking / flickering station ceiling lights during night & dark modes
      const isNight = !this._mood || !this._mood.isDaylight;
      const tubeInt = this._mood && this._mood.tubeIntensity !== undefined ? this._mood.tubeIntensity : 0.85;
      if (this.stationLights && this.stationLights.length > 0) {
        for (let i = 0; i < this.stationLights.length; i++) {
          const sl = this.stationLights[i];
          let flick = 1.0;
          if (isNight) {
            const wave = Math.sin(this._timeAccum * (5.8 + i * 2.1) + i * 1.7);
            const jitter = Math.sin(this._timeAccum * 19.0 + i * 4.3);
            if (i % 2 === 1) {
              const cyc = (this._timeAccum * 0.7 + i * 0.9) % 3.8;
              flick = (cyc > 2.4 && wave > -0.25) ? 0.16 : (jitter < -0.55 ? 0.38 : 0.82);
            } else {
              flick = (wave < -0.78 && jitter < -0.3) ? 0.25 : (0.72 + 0.22 * wave);
            }
          }
          const pwr = this._powerRestored ? 1.0 : 0.22;
          sl.light.intensity = sl.baseIntensity * tubeInt * this._lightingFactor * flick * pwr;
        }
      }

      if (this._amberInst && this._amberBasePositions.length > 0) {
        for (let a = 1; a < this._amberBasePositions.length; a++) {
          const ap = this._amberBasePositions[a];
          const pulse = 0.55 + 0.45 * Math.sin(this._timeAccum * 5.2 + a * 2.1);
          _tmpDummy.position.set(ap[0], ap[1], ap[2]);
          _tmpDummy.rotation.set(0, this._timeAccum * 3.0 + a, 0);
          _tmpDummy.scale.set(ap[3] * pulse, ap[4] * pulse, ap[5] * pulse);
          _tmpDummy.updateMatrix();
          this._amberInst.setMatrixAt(a, _tmpDummy.matrix);
        }
        this._amberInst.instanceMatrix.needsUpdate = true;
      }

      let paintDirty = false;
      let metalDirty = false;
      let barricadeDirty = false;
      for (let i = 0; i < this.dynamicProps.length; i++) {
        const p = this.dynamicProps[i];
        if (p.spinTimer > 0) {
          p.spinTimer = Math.max(0, p.spinTimer - dt);
          p.ry += dt * 7.5;
          _tmpDummy.position.set(p.x, p.y, p.z);
          _tmpDummy.rotation.set(p.rx, p.ry, p.rz);
          _tmpDummy.scale.set(p.sx, p.sy, p.sz);
          _tmpDummy.updateMatrix();
          p.instMesh.setMatrixAt(p.instIdx, _tmpDummy.matrix);
          metalDirty = true;
        }
        if (p.detached && p.settleTimer > 0) {
          p.settleTimer -= dt;
          p.vy -= 18.0 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.rx += p.avx * dt;
          p.ry += p.avy * dt;
          p.rz += p.avz * dt;

          const floorY = p.halfH;
          if (p.y < floorY) {
            p.y = floorY;
            p.vy = Math.abs(p.vy) * 0.36;
            p.vx *= 0.65;
            p.vz *= 0.65;
            p.avx *= 0.6;
            p.avy *= 0.6;
            p.avz *= 0.6;
          }
          _tmpDummy.position.set(p.x, p.y, p.z);
          _tmpDummy.rotation.set(p.rx, p.ry, p.rz);
          _tmpDummy.scale.set(p.sx, p.sy, p.sz);
          _tmpDummy.updateMatrix();
          p.instMesh.setMatrixAt(p.instIdx, _tmpDummy.matrix);
          if (p.instMesh === this._propsPaintInst) paintDirty = true;
          else if (p.instMesh === this._barricadeInst) barricadeDirty = true;
          else metalDirty = true;
        }
      }
      if (paintDirty && this._propsPaintInst) this._propsPaintInst.instanceMatrix.needsUpdate = true;
      if (metalDirty && this._propsMetalInst) this._propsMetalInst.instanceMatrix.needsUpdate = true;
      if (barricadeDirty && this._barricadeInst) this._barricadeInst.instanceMatrix.needsUpdate = true;
    },

    getBVHMeshes: function () {
      const cityMeshes = (LRT.City && typeof LRT.City.getBVHMeshes === 'function') ? LRT.City.getBVHMeshes() : [];
      if (!cityMeshes || cityMeshes.length === 0) return this.bvhMeshes;
      return this.bvhMeshes.concat(cityMeshes);
    },

    getBVHMesh: function () {
      return this.bvhMeshes[0] || null;
    },

    getLights: function () {
      const cityLights = (LRT.City && typeof LRT.City.getStreetLights === 'function') ? LRT.City.getStreetLights() : [];
      if (!cityLights || cityLights.length === 0) return this.stationLights;
      return this.stationLights.concat(cityLights);
    },

    getStreetLights: function () {
      return (LRT.City && typeof LRT.City.getStreetLights === 'function') ? LRT.City.getStreetLights() : this.stationLights;
    },

    getSpatialGrid: function () {
      return this.spatialGrid;
    },

    getColliders: function () {
      return this.colliders;
    },

    getSpawnNodes: function () {
      return this.spawnNodes;
    },

    getPsdDoors: function () {
      return this.psdDoors;
    },

    getRoot: function () {
      return this.rootGroup;
    },

    setOffsetZ: function (z) {
      if (this.rootGroup) {
        this.rootGroup.position.z = z;
        this.rootGroup.updateMatrixWorld(true);
      }
    },

    getAtmosphere: function () {
      return {
        moodKey: this._moodKey,
        mood: this._mood,
        wetness: this._mood ? this._mood.wetness : 0.65
      };
    },

    getCruiseTemplate: function () {
      return {
        stationIndex: this._stationIndex,
        archetypeId: this._archetype ? this._archetype.id : 'dukuh_atas',
        canopyColor: this._archetype ? this._archetype.canopyColor : '#A85E32',
        moodKey: this._moodKey,
        mood: this._mood,
        isCawang: this._archetype && this._archetype.layout === 'CAWANG_HUB',
        vineDensity: this._archetype && this._archetype.heavyOvergrowth ? 1.0 : 0.45
      };
    },

    getRailConfig: function () {
      return this._railConfig || {
        isIsland: false, track1X: 0.0, track2X: -4.70,
        psd1X: 1.46, psd2X: -6.16, platEdge1X: 1.46, platEdge2X: -6.16,
        p1MinX: 1.46, p1MaxX: 7.06, p2MinX: -11.36, p2MaxX: -6.16
      };
    },

    getNavGraph: function () {
      return this.navGraph || { nodes: [], adj: [] };
    },

    getStats: function () {
      const archName = this._archetype ? this._archetype.name : 'Dukuh Atas BSI';
      const archCode = this._archetype ? this._archetype.code : 'CB01 / BK01';
      return {
        stationIndex: this._stationIndex,
        name: archName,
        stationName: archName,
        code: archCode,
        stationCode: archCode,
        layout: this._archetype ? this._archetype.layout : 'SIDE_DUAL',
        atmosphere: this._moodKey,
        moodKey: this._moodKey,
        mood: this._mood,
        spawnPos: { x: 4.2, y: 0.05, z: -6.0, yaw: 0.45 },
        brokenGlassCount: this._brokenGlassCount,
        totalGlassCount: this.glassPanes.length,
        destroyedPillars: this._destroyedPillars,
        totalPillars: this.pillars.length,
        damagedTubes: this._damagedTubes,
        drawCallEstimate: this._drawCallsEst,
        disposableGeoCount: this.disposableGeometries.length,
        bvhMeshCount: this.getBVHMeshes().length,
        lightCount: this.getLights().length
      };
    },

    raycastWorld: function (origin, dir, maxDist) {
      if (!this.rootGroup) return null;
      const offsetZ = this.rootGroup.position.z;
      const ox = origin.x;
      const oy = origin.y;
      const oz = origin.z - offsetZ;
      const dx = dir.x;
      const dy = dir.y;
      const dz = dir.z;
      const invX = dx !== 0 ? 1 / dx : 1e12;
      const invY = dy !== 0 ? 1 / dy : 1e12;
      const invZ = dz !== 0 ? 1 / dz : 1e12;

      let best = null;
      let bestDist = maxDist || 200;

      // 1. Test destructibles & dynamic AABB colliders
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (!c.blocksBullets) continue;
        const hit = intersectRayAABB(ox, oy, oz, invX, invY, invZ, c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ, bestDist);
        if (hit && hit.t < bestDist) {
          let hitTag = c.tag;
          let isGlassHit = c.tag === 'glass';
          if (c.tag === 'psd_door') {
            const hitY = oy + dy * hit.t;
            const hitZ = oz + dz * hit.t;
            const doorMidZ = (c.minZ + c.maxZ) * 0.5;
            const doorRec = this.psdDoors.find((d) => d.colliderIdx === c.id)
              || (this.psdDoors2 && this.psdDoors2.find((d) => d.colliderIdx === c.id));
            if (hitY <= 0.36) {
              hitTag = 'metal';
              isGlassHit = false;
            } else if (doorRec) {
              const leaf = hitZ < doorMidZ ? this.glassPanes[doorRec.leftGlassIdx] : this.glassPanes[doorRec.rightGlassIdx];
              if (leaf && leaf.broken) {
                continue;
              }
              hitTag = 'glass';
              isGlassHit = true;
            }
          }
          bestDist = hit.t;
          best = {
            dist: hit.t,
            point: new THREE.Vector3(origin.x + dx * hit.t, origin.y + dy * hit.t, origin.z + dz * hit.t),
            normal: new THREE.Vector3(hit.nx, hit.ny, hit.nz),
            tag: hitTag,
            isGlass: isGlassHit,
            collider: c,
            glassId: c.glassId,
            pillarId: c.pillarId,
            propId: c.propId,
            tubeId: c.tubeId,
            barrelId: c.barrelId !== undefined ? c.barrelId : -1
          };
        }
      }

      // 2. Test overhead fluorescent tubes
      for (let t = 0; t < this.tubes.length; t++) {
        const tb = this.tubes[t];
        if (tb.health <= 0.05) continue;
        const hit = intersectRayAABB(ox, oy, oz, invX, invY, invZ,
          tb.x - 0.14, tb.y - 0.08, tb.z - 1.12,
          tb.x + 0.14, tb.y + 0.08, tb.z + 1.12, bestDist);
        if (hit && hit.t < bestDist) {
          bestDist = hit.t;
          best = {
            dist: hit.t,
            point: new THREE.Vector3(origin.x + dx * hit.t, origin.y + dy * hit.t, origin.z + dz * hit.t),
            normal: new THREE.Vector3(hit.nx, hit.ny, hit.nz),
            tag: 'tube',
            collider: null,
            glassId: -1,
            pillarId: -1,
            propId: -1,
            tubeId: tb.id
          };
        }
      }

      // 3. Test merged MeshBVH geometry (non-square city buildings, curbs, ramps, stairs, cars, canopies!)
      const bvhMeshes = this.getBVHMeshes();
      if (bvhMeshes.length > 0) {
        _tmpRayOrigin.set(origin.x, origin.y, origin.z);
        _tmpRayDir.set(dx, dy, dz).normalize();
        this._raycaster.set(_tmpRayOrigin, _tmpRayDir);
        this._raycaster.near = 0.02;
        this._raycaster.far = bestDist;
        const bvhHits = this._raycaster.intersectObjects(bvhMeshes, false);
        if (bvhHits.length > 0) {
          const bh = bvhHits[0];
          if (bh.distance < bestDist) {
            bestDist = bh.distance;
            if (bh.face && bh.face.normal) {
              _tmpNormal.copy(bh.face.normal).transformDirection(bh.object.matrixWorld).normalize();
              if (_tmpNormal.dot(_tmpRayDir) > 0) _tmpNormal.negate();
            } else {
              _tmpNormal.set(0, 1, 0);
            }
            best = {
              dist: bh.distance,
              point: bh.point.clone(),
              normal: _tmpNormal.clone(),
              tag: inferTagFromMeshName(bh.object.name),
              isGlass: false,
              collider: null,
              glassId: -1,
              pillarId: -1,
              propId: -1,
              tubeId: -1
            };
          }
        }
      }

      return best;
    },

    damageAt: function (origin, radius, maxDmg, impulse, isExplosion) {
      if (!this.rootGroup) return;
      const offsetZ = this.rootGroup.position.z;
      const lx = origin.x;
      const ly = origin.y;
      const lz = origin.z - offsetZ;
      const rad = Math.max(0.25, radius || 0.5);
      const radSq = rad * rad;
      const dmgVal = maxDmg || 25;
      const impVal = impulse || 2;
      const slideDist = 0.78 * this._psdOpen;

      let glassDirty = false;
      let glassBrokenNow = false;
      for (let i = 0; i < this.glassPanes.length; i++) {
        const g = this.glassPanes[i];
        if (g.broken) continue;
        const curZ = g.isPsdDoor ? (g.cz + g.slideSign * slideDist) : g.cz;
        const halfW = g.ry > 0.5 ? g.d * 0.5 : g.w * 0.5;
        const halfD = g.ry > 0.5 ? g.w * 0.5 : g.d * 0.5;
        const cx = Math.max(g.cx - halfW, Math.min(lx, g.cx + halfW));
        const cy = Math.max(g.cy - g.h * 0.5, Math.min(ly, g.cy + g.h * 0.5));
        const cz = Math.max(curZ - halfD, Math.min(lz, curZ + halfD));
        const dSq = (cx - lx) * (cx - lx) + (cy - ly) * (cy - ly) + (cz - lz) * (cz - lz);

        if (dSq <= radSq) {
          const dist = Math.sqrt(dSq);
          const falloff = isExplosion ? Math.max(0.15, 1.0 - dist / rad) : 1.0;
          g.hp -= dmgVal * falloff;
          if (g.hp <= 0) {
            g.broken = true;
            this._brokenGlassCount++;
            glassBrokenNow = true;
            glassDirty = true;
            _tmpDummy.position.set(g.cx, g.cy, curZ);
            _tmpDummy.scale.set(0, 0, 0);
            _tmpDummy.updateMatrix();
            if (this._glassInst) this._glassInst.setMatrixAt(g.instIdx, _tmpDummy.matrix);

            const coll = this.colliders[g.colliderIdx];
            if (coll) {
              if (!g.isPsdDoor) {
                coll.blocksBullets = false;
                if (coll.minY > 0.2) {
                  coll.blocksWalk = false;
                  coll.disabled = true;
                }
              } else {
                const doorRec = this.psdDoors[g.psdDoorIdx];
                if (doorRec && this.glassPanes[doorRec.leftGlassIdx].broken && this.glassPanes[doorRec.rightGlassIdx].broken) {
                  coll.blocksBullets = false;
                }
              }
            }
            if (LRT.Weapons && LRT.Weapons.spawnGlassShards) {
              _tmpVec.set(g.cx, g.cy, curZ + offsetZ);
              LRT.Weapons.spawnGlassShards(_tmpVec, 20, null);
            }
          }
        }
      }
      if (glassDirty && this._glassInst) this._glassInst.instanceMatrix.needsUpdate = true;
      if (glassBrokenNow && LRT.Audio && LRT.Audio.play) {
        LRT.Audio.play('glass_shatter', { pos: origin, gain: 0.85, pitchVar: 0.12 });
      }

      if (this.explosiveBarrels && this.explosiveBarrels.length > 0) {
        for (let b = 0; b < this.explosiveBarrels.length; b++) {
          const barrel = this.explosiveBarrels[b];
          if (barrel.exploded) continue;
          const dist = Math.hypot(barrel.x - lx, barrel.y - ly, barrel.z - lz);
          if (dist <= rad + 0.65) {
            barrel.hp -= dmgVal;
            if (barrel.hp <= 0 || isExplosion) {
              this.triggerBarrel(barrel.id);
            }
          }
        }
      }

      for (let p = 0; p < this.pillars.length; p++) {
        const pl = this.pillars[p];
        if (pl.destroyed) continue;
        const dx = pl.x - lx;
        const dy = Math.max(0, Math.abs(pl.y - ly) - 1.8);
        const dz = pl.z - lz;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq > (rad + 0.65) * (rad + 0.65)) continue;

        const dist = Math.sqrt(dSq);
        const falloff = isExplosion ? Math.max(0.2, 1.0 - dist / (rad + 0.65)) : 1.0;
        pl.hp -= dmgVal * falloff;

        if (pl.hp <= 0) {
          pl.destroyed = true;
          pl.shellMesh.visible = false;
          this._destroyedPillars++;
          const coll = this.colliders[pl.colliderIdx];
          if (coll) {
            coll.minX = pl.x - 0.22;
            coll.maxX = pl.x + 0.22;
            coll.minZ = pl.z - 0.22;
            coll.maxZ = pl.z + 0.22;
          }
          if (LRT.Weapons && LRT.Weapons.spawnRubble) {
            _tmpVec.set(pl.x, Math.max(0.4, ly), pl.z + offsetZ);
            LRT.Weapons.spawnRubble(_tmpVec, 14);
          }
          if (LRT.Audio && LRT.Audio.play) {
            LRT.Audio.play('debris_crumble', { pos: origin, gain: 0.9 });
          }
        } else if (pl.hp <= 75) {
          const geo = pl.shellMesh.geometry;
          const posAttr = geo.attributes.position;
          const colAttr = geo.attributes.color;
          const base = pl.basePos;
          const hitRelX = lx - pl.x;
          const hitRelY = ly - pl.y;
          const hitRelZ = lz - pl.z;
          const defRad = Math.max(1.2, rad * 0.55);

          for (let v = 0; v < posAttr.count; v++) {
            const vx = posAttr.getX(v);
            const vy = posAttr.getY(v);
            const vz = posAttr.getZ(v);
            const dV = Math.hypot(vx - hitRelX, vy - hitRelY, vz - hitRelZ);
            if (dV < defRad) {
              const w = 1.0 - dV / defRad;
              const jx = ((v * 37) % 11 - 5) * 0.012;
              const jz = ((v * 53) % 11 - 5) * 0.012;
              posAttr.setXYZ(v,
                base[v * 3] * (1.0 - 0.34 * w) + jx * w,
                vy,
                base[v * 3 + 2] * (1.0 - 0.34 * w) + jz * w
              );
              const soot = 1.0 - 0.78 * w;
              colAttr.setXYZ(v, soot, soot * 0.95, soot * 0.90);
            }
          }
          posAttr.needsUpdate = true;
          colAttr.needsUpdate = true;
          geo.computeVertexNormals();
          pl.deformed = true;
          if (LRT.Weapons && LRT.Weapons.spawnRubble) {
            LRT.Weapons.spawnRubble(origin, 6);
          }
        }
      }

      if (isExplosion || impVal >= 6.0) {
        for (let i = 0; i < this.dynamicProps.length; i++) {
          const dp = this.dynamicProps[i];
          if (!dp.dynamic) continue;
          const dx = dp.x - lx;
          const dy = dp.y - ly;
          const dz = dp.z - lz;
          const dist = Math.hypot(dx, dy, dz);
          if (dist <= rad) {
            const k = Math.max(0.25, 1.0 - dist / rad);
            if (!dp.detached) {
              dp.detached = true;
              const coll = this.colliders[dp.colliderIdx];
              if (coll) {
                coll.blocksWalk = false;
                coll.disabled = true;
                coll.blocksBullets = false;
              }
            }
            const inv = 1.0 / Math.max(0.25, dist);
            dp.vx += dx * inv * impVal * k * 0.75;
            dp.vz += dz * inv * impVal * k * 0.75;
            dp.vy += (4.5 + impVal * 0.35) * k;
            dp.avx = (Math.sin(i * 9.1) * 7.0) * k;
            dp.avy = (Math.cos(i * 4.3) * 8.0) * k;
            dp.avz = (Math.sin(i * 2.7) * 6.0) * k;
            dp.settleTimer = 2.6;
          }
        }
      }

      if (this._tubeInst) {
        const attr = this._tubeInst.geometry.attributes.aTubeState;
        let tubeDirty = false;
        const tubeBlastRad = isExplosion ? Math.max(rad, 8.5) : rad + 0.35;
        for (let t = 0; t < this.tubes.length; t++) {
          const tb = this.tubes[t];
          if (tb.health <= 0.05) continue;
          const dist = Math.hypot(tb.x - lx, tb.y - ly, tb.z - lz);
          if (dist <= tubeBlastRad) {
            const prev = tb.health;
            if (!isExplosion || dist <= 4.0) {
              tb.health = 0.0;
            } else {
              tb.health = Math.min(tb.health, 0.30);
            }
            if (tb.health !== prev) {
              tubeDirty = true;
              attr.setY(t, tb.health);
              if (prev > 0.5) this._damagedTubes++;
              if (tb.health <= 0.05 && this._tubeHaloInst) {
                _tmpDummy.scale.set(0, 0, 0);
                _tmpDummy.updateMatrix();
                this._tubeHaloInst.setMatrixAt(t, _tmpDummy.matrix);
                this._tubeHaloInst.instanceMatrix.needsUpdate = true;
              }
              if (LRT.Weapons && LRT.Weapons.spawnSparks) {
                _tmpVec.set(tb.x, tb.y, tb.z + offsetZ);
                LRT.Weapons.spawnSparks(_tmpVec, 8);
              }
            }
          }
        }
        if (tubeDirty) attr.needsUpdate = true;
      }

      return { shardsSpawned: glassBrokenNow, sfxPlayed: glassBrokenNow };
    },

    getInteractableNear: function (pos, lookDir) {
      if (!this.rootGroup) return null;
      const offsetZ = this.rootGroup.position.z;
      let best = null;
      let bestScore = -999;

      for (let i = 0; i < this.interactables.length; i++) {
        const it = this.interactables[i];
        const dx = it.x - pos.x;
        const dy = it.y - pos.y;
        const dz = (it.z + offsetZ) - pos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 2.75) continue;
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
      const it = this.interactables.find((x) => x.id === id);
      if (!it) return { ok: false };

      if (it.type === 'call_train') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('station_chime', { gain: 0.75 });
        return {
          ok: true, type: 'call_train', action: 'call_train', direction: 1, triggerTrainCall: true,
          message: 'Sinyal dikirim: Kereta LRT segera merapat ke Peron 1!'
        };
      }

      if (it.type === 'call_train_prev') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('station_chime', { gain: 0.75 });
        return {
          ok: true, type: 'call_train_prev', action: 'call_train_prev', direction: -1, triggerTrainCall: true,
          message: 'Sinyal arah pulang dikirim: Kereta LRT merapat ke Peron 2!'
        };
      }

      if (it.type === 'turnstile') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.7 });
        for (let i = 0; i < this.dynamicProps.length; i++) {
          if (this.dynamicProps[i].interactId === id) {
            this.dynamicProps[i].spinTimer = 0.65;
          }
        }
        return {
          ok: true, type: 'turnstile',
          message: 'Access by KAI: Saldo KUE terverifikasi — Silakan lewat!'
        };
      }

      if (it.type === 'generator' || it.id === 'portable_generator') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.8 });
        this._powerRestored = true;
        this.setLightingFactor(this._lightingFactor);
        it.used = true;
        it.label = '[E] Generator Darurat (Aktif)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        if (LRT.Enemies && LRT.Enemies.alertAllTo) {
          LRT.Enemies.alertAllTo({ x: it.x, y: it.y, z: it.z }, 45.0);
        }
        return {
          ok: true,
          type: 'generator',
          action: 'generator',
          lurePos: { x: it.x, y: it.y, z: it.z },
          message: 'Generator Darurat Aktif — Lampu & Gerbang KAI Menyala!'
        };
      }

      if (it.type === 'derelict_fuse' || it.id === 'cawang_derelict_cab') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.8 });
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Kabin Bangkai LRT Cawang (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        return {
          ok: true,
          type: 'derelict_fuse',
          action: 'derelict_fuse',
          ammo: fresh ? { type: 'shotgun', amount: 18 } : null,
          logTitle: 'KOTAK HITAM INKA #08 — CAWANG',
          logBody: 'Hendra di sini! Seluruh tim mundur ke Peron Empat! Kereta dari Bekasi anjlok menabrak wesel pemindah jalur. Jangan biarkan mereka mendekati tangki hidrogen tambahan! Budi, bawa perisai antihuru-hara! Mereka bukan komuter biasa... mereka kebal peluru karet! Kalau kamu dengar rekaman ini, potong kabel relai sinyal sebelum seluruh flyover ini meledak!',
          message: fresh ? 'Sekring Bypass & Shotgun 12G Ditemukan!' : 'Kabin bangkai LRT Cawang sudah digeledah.'
        };
      }

      if (it.type === 'field_log' || it.id === 'loket_counter') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.5 });
        it.used = true;
        it.label = '[E] Meja Loket Stasiun (Sudah Diperiksa)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        return {
          ok: true,
          type: 'field_log',
          action: 'field_log',
          logTitle: 'CATATAN BUKU PIKET LOKET DUKUH ATAS',
          logBody: 'Pukul 17:15 WIB: Panggilan darurat dari OCC Halim. Seluruh operator GoA 3 ditarik dari kabin stasiun. Sistem driverless otomatis kehilangan sinyal interlocking di petak Cawang–Cikoko. Kami diinstruksikan menahan penumpang di dalam concourse, tapi pintu kaca selatan mulai retak dihantam orang-orang yang melompat dari flyover Sudirman. Mereka tidak berbicara... hanya menggeram seperti hewan buas.',
          message: 'Buku Catatan Piket Loket ditemukan — Arsip Log #3 Terbaca.'
        };
      }

      if (it.type === 'relay' || it.id === 'setiabudi_jpo_switch') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.8 });
        it.used = true;
        it.label = '[E] Sakelar Relai Sinyal Master JPO Setiabudi (Terhubung)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        if (LRT.Enemies && LRT.Enemies.alertAllTo) {
          LRT.Enemies.alertAllTo({ x: it.x, y: it.y, z: it.z }, 45.0);
        }
        return {
          ok: true,
          type: 'relay',
          action: 'relay',
          lurePos: { x: it.x, y: it.y, z: it.z },
          logTitle: 'TELEMETRI SINYAL DARURAT SETIABUDI',
          logBody: 'Transmisi Data Dr. Rina terhubung ke OCC Bekasi dan RSPAD Gatot Soebroto. Frekuensi akustik klakson LRT Jabodebek diverifikasi melumpuhkan spora CB-9. Gerbang evakuasi militer utara bersiap dibuka!',
          message: 'Relai Sinyal JPO Terhubung — Data Vaksin Ditransmisikan ke OCC!'
        };
      }

      if (it.type === 'rotio') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('station_chime', { gain: 0.55 });
        const heal = it.used ? 0 : 25;
        it.used = true;
        it.label = "[E] Etalase Roti'O Coffee Bun (Kosong)";
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        const res = {
          ok: true, type: 'rotio', heal: heal, healAmount: heal,
          message: heal > 0 ? "Roti'O Coffee Bun hangat ditemukan! (+25 HP) — Bahkan kiamat pun nggak bisa ngalahin aroma oven Roti'O." : "Etalase Roti'O sudah diambil."
        };
        if (this._archetype && this._archetype.id === 'dukuh_atas' && heal > 0) {
          res.logTitle = "MEMO KASIR ROTI'O — RESEP ANTI-PANIK";
          res.logBody = "Jumat, 16 Nov, 16:30 WIB. Mas Doni, kalau listrik padam lagi, jangan matikan oven gas. Di luar orang-orang mulai teriak dan mata mereka memerah aneh, tapi aroma kopi dan mentega vanila kita bikin suasana tetap tenang. Tadi ada petugas KAI minta sepuluh roti buat dibagiin ke anak-anak di peron dua. Katanya kereta GoA 3 mogok mendadak. Tenang aja, stok tepung kita masih cukup sampai Senin. Jakarta udah sering banjir dan demo, masa kalah sama jamur? — Mas Budi";
        }
        return res;
      }

      if (it.type === 'coway') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.45 });
        const heal = it.used ? 0 : 15;
        it.used = true;
        it.label = '[E] Dispenser Coway (Sudah Minum)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        return {
          ok: true, type: 'coway', heal: heal, healAmount: heal,
          message: heal > 0 ? 'Air mineral steril Coway menyegarkan! (+15 HP)' : 'Air Coway sudah diminum di stasiun ini.'
        };
      }

      if (it.type === 'jaklingko') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.6 });
        const bonus = it.used ? 0 : 1;
        it.used = true;
        it.label = '[E] Terminal JakLingko (Sudah Diambil)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        const res = {
          ok: true, type: 'jaklingko',
          ammo: bonus > 0 ? { type: 'rifle', amount: 30 } : null, ammoBonus: bonus,
          message: bonus > 0 ? 'Menemukan suplai amunisi darurat di loker JakLingko!' : 'Terminal JakLingko kosong.'
        };
        if (bonus > 0) {
          res.logTitle = 'SLIP KARTU JAKLINGKO — SALDO TIDAK CUKUP';
          res.logBody = '[STRUK TRANSAKSI GAGAL — KONSORSIUM JAKLINGKO] ID KARTU: 0892-4411-9021-004. SISA SALDO: Rp 1.500,- (MINIMUM Rp 5.000,- UNTUK BUKA GATE). Coretan spidol di bawah struk: Pintu gerbang otomatis sialan! Di belakang kami ratusan orang panik karena kabut spora masuk lewat tangga feeder, dan mesin ini masih nolak kartu gara-gara kurang seribu perak!';
        }
        return res;
      }

      if (it.type === 'balcony_supply') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.65 });
        const fresh = !it.used;
        it.used = true;
        it.label = it.label.replace(/\(\+[^)]+\)/, '(Sudah Diambil)');
        if (!it.label.includes('(Sudah Diambil)')) it.label += ' (Sudah Diambil)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        const res = {
          ok: true, type: 'balcony_supply',
          heal: fresh ? 25 : 0, healAmount: fresh ? 25 : 0,
          ammo: fresh ? (it.id === 'depot_supply' ? { type: 'rpg', amount: 3 } : { type: 'all', amount: 30 }) : null,
          ammoBonus: fresh ? 1 : 0,
          message: fresh ? (it.id === 'garden_supply' ? 'Kotak Medis Kebun Atap: Antiviral Serum & Amunisi Diamankan!' : (it.id === 'depot_supply' ? 'Loker Taktis Depot: RPG-7 & Amunisi Diambil!' : 'Loker Taktis: +30 Amunisi & +25 HP!')) : 'Loker persediaan sudah diambil.'
        };
        if (fresh) {
          if (it.id === 'garden_supply') {
            res.logTitle = 'JURNAL LABORATORIUM DR. RINA: SPESIMEN CB-9';
            res.logBody = 'Hari ke-4 Uji Spora Tanaman — Dr. Rina Wulandari. Fasilitas Cibubur keliru. Ini bukan penyakit tanaman hortikultura biasa. Hifa jamur ini mengonsumsi seng sulfat dari pelat rel dan menyerap muatan listrik statis dari catenary LRT. Spora ini menyukai kegelapan malam, namun membran selnya mengalami resonansi destruktif jika terpapar gelombang akustik frekuensi rendah (75–85 desibel)—sama persis dengan klakson pneumatik kereta INKA! Jika operator kereta membunyikan klakson darurat, sistem saraf infected akan lumpuh sesaat.';
          } else if (it.id === 'depot_supply') {
            res.logTitle = 'MEMO PERAWATAN DEPO HARJAMUKTI — TANGKI HIDROGEN';
            res.logBody = 'Untuk Teknisi Shift Malam: Kereta Rangkaian 04 adalah prototipe sel bahan bakar hidrogen pertama yang disuplai langsung oleh PT Pindad dan PT INKA. Rangkaian ini tidak bergantung pada pasokan listrik kawat atas PLN. Bila gardu traksi padam, putar tuas bypass merah di bawah kabin masinis. Selama katup hidrogen di atap tidak tertembak peluru, kereta ini mampu berjalan menembus enam stasiun tanpa berhenti.';
            if (LRT.Weapons && typeof LRT.Weapons.addAmmo === 'function') {
              LRT.Weapons.addAmmo('rifle', 30);
            }
          }
        }
        return res;
      }

      if (it.type === 'info') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('station_chime', { gain: 0.5 });
        const arch = this._archetype || {};
        const res = {
          ok: true, type: 'info',
          message: (arch.name || 'LRT') + ' (' + (arch.code || 'CB/BK') + ') — ' + (arch.destinationHint || 'LRT Jabodebek')
        };
        if (arch.id === 'setiabudi') {
          res.logTitle = 'PERINTAH TEMBAK DI TEMPAT — SATGAS SETIABUDI (YONIF 201)';
          res.logBody = 'OPERATIONAL ORDER — KODAM JAYA / SATGAS PENGAMANAN PERIMETER V. Dilarang keras meloloskan kendaraan atau pejalan kaki dari arah Selatan Rasuna Said melewati batas Stasiun Setiabudi. Seluruh subjek yang memperlihatkan gejala mata merah, batuk berdarah, atau calcifikasi kulit dianggap infected. Hanya rangkaian kereta LRT resmi berbendera Merah Putih dari arah Dukuh Atas yang diizinkan melintasi pintu gerbang utara menuju Monas.';
        } else {
          res.logTitle = 'PETA RUTE KORIDOR CB/BK LRT JABODEBEK';
          res.logBody = 'Koridor Utama: Dukuh Atas BSI (CB01/BK01) — Cawang (CB08/BK08) — Harjamukti (CB12) — Kuningan (CB04) — Cikoko (CB06) — Setiabudi (CB02). Sistem GoA 3 Terisolasi karena pemadaman total gardu induk Cawang 500kV.';
        }
        return res;
      }

      return { ok: false };
    },

    triggerBarrel: function (id) {
      if (!this.explosiveBarrels || !this.explosiveBarrels.length) return;
      const b = this.explosiveBarrels.find((x) => x.id === id);
      if (!b || b.exploded) return;
      b.exploded = true;
      if (b.mesh) b.mesh.visible = false;
      if (b.colliderIdx !== undefined && this.colliders[b.colliderIdx]) {
        const c = this.colliders[b.colliderIdx];
        c.blocksWalk = false;
        c.blocksBullets = false;
        c.disabled = true;
      }
      const offsetZ = this.rootGroup ? this.rootGroup.position.z : 0;
      const pos = { x: b.x, y: b.y + 0.6, z: b.z + offsetZ };
      if (LRT.Weapons && typeof LRT.Weapons.applyExplosion === 'function') {
        LRT.Weapons.applyExplosion(pos, 7.5, 260, 18.0, false);
      }
    },

    getUsedIds: function () {
      return Array.from(this._usedIds || []);
    }
  };

  LRT.Station = Station;
})(window.LRT = window.LRT || {});
