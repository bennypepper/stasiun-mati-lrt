(function (LRT) {
  'use strict';

  const S = window.__LRT_INTERNAL__.station;
  const { RAIL_TOP_Y, STREET_GROUND_Y, PLATFORM_TOP_Y } = S.CONST;
  const { mulberry32, intersectRayAABB, inferTagFromMeshName, tmp } = S;
  const _tmpDummy = tmp.dummy;
  const _tmpVec = tmp.vec;
  const _tmpRayOrigin = tmp.rayOrigin;
  const _tmpRayDir = tmp.rayDir;
  const _tmpNormal = tmp.normal;

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
    _cachedAllBVH: null,
    _warmLightAnchors: [],
    _coolLightAnchors: [],
    _cawangHazardRing: null,
    _lootboxGlows: null,
    _lootboxVisuals: null,
    _activeObjectiveIds: new Set(),
    _objectiveBeacons: [],
    _beaconMats: null,
    _beaconSharedTime: { value: 0 },
    _objectiveMarkersCache: [],
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
      return S._placeNormalizedModel(this, key, x, y, z, ry, targetHeight, filterFn, addCollTag, protoCacheKey);
    },

    _buildSpatialGrid: function () {
      this.spatialGrid = S.SpatialHashGrid(this.colliders);
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
      this._cachedAllBVH = null;
      this._warmLightAnchors = [];
      this._coolLightAnchors = [];
      this._cawangHazardRing = null;
      this._lootboxGlows = null;
      this._lootboxVisuals = null;
      this._activeObjectiveIds = new Set();
      this._objectiveBeacons = [];
      this._beaconMats = null;
      this._beaconSharedTime.value = 0;
      this._objectiveMarkersCache = [];
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
      const chosenMoodKey = (o.moodKey && moods[o.moodKey])
        ? o.moodKey
        : (sectorLoop === 0 && moods[arch.moodBias]
          ? arch.moodBias
          : moodKeys[Math.floor(rng() * moodKeys.length)]);
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

      const buckets = {
        bConcrete: [],
        bConcreteRough: [],
        bTerrazzo: [],
        bChecker: [],
        bTactile: [],
        bRoof: [],
        bTruss: [],
        bSteelDark: [],
        bJpo: [],
        bStall: [],
        bSign: [],
        bBanner: [],
        bStairStepsConc: [],
        bStairStepsSteel: [],
        bStairSlopeBvh: []
      };

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

      const ctx = {
        arch, dims, mood, chosenMoodKey, rng, root, mats, STALL_UV, SIGN_UV,
        matConcrete, matConcreteRough, matDarkWood, matCanopy,
        buckets,
        navNodes, navEdges, addNavNode, addNavLink, addNavChain,
        glassRecords: [],
        stairZones, registerStairZone, isInStairExclusion
      };

      S.arch.buildArchitecture(this, ctx);
      S.navProps.buildStallsAndTubes(this, ctx);
      S.arch.mergeStaticBuckets(this, ctx);
      S.navProps.buildDestructiblesAndNav(this, ctx);

      this._initCachedBVH();
      this._buildObjectiveBeacons();
      this.setActiveObjectiveIds([]);

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

    setMood: function (moodKey) {
      const moods = (LRT.Config && LRT.Config.MOODS) || null;
      if (!moods || !moodKey || !moods[moodKey]) return;
      this._moodKey = moodKey;
      this._mood = moods[moodKey];
    },

    setLightingFactor: function (factor) {
      this._lightingFactor = Math.max(0, factor !== undefined ? factor : 1.0);
      const tubeInt = this._mood && this._mood.tubeIntensity !== undefined ? this._mood.tubeIntensity : 0.85;
      const pwr = this._powerRestored ? 1.0 : 0.22;
      for (let i = 0; i < this.stationLights.length; i++) {
        const sl = this.stationLights[i];
        sl.light.intensity = sl.baseIntensity * tubeInt * this._lightingFactor * pwr;
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

    update: function (dt, playerPos, camForward, difficultyKey) {
      if (!this.rootGroup) return;
      this._timeAccum += dt;
      this._beaconSharedTime.value = this._timeAccum;

      const offsetZ = this.rootGroup.position.z || 0;
      const pRef = playerPos || (LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' ? LRT.PlayerUI.getState().pos : null);

      if (LRT.City && typeof LRT.City.update === 'function') {
        LRT.City.update(dt, this._timeAccum, pRef, camForward, difficultyKey);
      }
      const cityInt = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.city;
      if (this._lootboxVisuals && this._lootboxVisuals.length > 0 && cityInt && typeof cityInt.updateLootboxVisuals === 'function') {
        cityInt.updateLootboxVisuals(this._lootboxVisuals, dt, this._timeAccum, pRef, camForward, difficultyKey, offsetZ);
      }

      // Resolve local player coordinates for pooled light tracking
      const px = pRef ? pRef.x : 4.2;
      const py = pRef ? pRef.y : 0.0;
      const pz = (pRef ? pRef.z : -6.0) - offsetZ;
      const lerpAlpha = 1.0 - Math.exp(-6.5 * Math.min(dt, 0.1));

      // Dim blinking / flickering & smoothly reposition the 2 pooled station lights
      const isNight = !this._mood || !this._mood.isDaylight;
      const tubeInt = this._mood && this._mood.tubeIntensity !== undefined ? this._mood.tubeIntensity : 0.85;
      if (this.stationLights && this.stationLights.length > 0) {
        for (let i = 0; i < this.stationLights.length; i++) {
          const sl = this.stationLights[i];
          sl.light.visible = true; // NEVER toggle light.visible!
          let tubeAliveFactor = 1.0;

          if (sl.kind === 'warm' && this._warmLightAnchors && this._warmLightAnchors.length > 0) {
            let bestA = this._warmLightAnchors[0];
            let bestD2 = Infinity;
            for (let k = 0; k < this._warmLightAnchors.length; k++) {
              const a = this._warmLightAnchors[k];
              const dx = a.x - px;
              const dy = (a.y - 1.8 - py) * 1.4;
              const dz = a.z - pz;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < bestD2) {
                bestD2 = d2;
                bestA = a;
              }
            }
            sl.light.position.x += (bestA.x - sl.light.position.x) * lerpAlpha;
            sl.light.position.y += (bestA.y - sl.light.position.y) * lerpAlpha;
            sl.light.position.z += (bestA.z - sl.light.position.z) * lerpAlpha;
          } else if (sl.kind === 'cool' && this._coolLightAnchors && this._coolLightAnchors.length > 0) {
            let bestA = null;
            let bestD2 = Infinity;
            for (let k = 0; k < this._coolLightAnchors.length; k++) {
              const a = this._coolLightAnchors[k];
              if (a.tubeIdx >= 0 && this.tubes[a.tubeIdx] && this.tubes[a.tubeIdx].health <= 0.1) continue;
              const dx = a.x - px;
              const dy = (a.y - 2.0 - py) * 1.6;
              const dz = a.z - pz;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < bestD2) {
                bestD2 = d2;
                bestA = a;
              }
            }
            if (bestA) {
              sl.light.position.x += (bestA.x - sl.light.position.x) * lerpAlpha;
              sl.light.position.y += (bestA.y - sl.light.position.y) * lerpAlpha;
              sl.light.position.z += (bestA.z - sl.light.position.z) * lerpAlpha;
            } else {
              tubeAliveFactor = 0.08;
            }
          }

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
          sl.light.intensity = sl.baseIntensity * tubeInt * this._lightingFactor * flick * pwr * tubeAliveFactor;
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

      if (this._cawangHazardRing) {
        const hz = this._cawangHazardRing;
        const strobe = 0.45 + 0.55 * Math.abs(Math.sin(this._timeAccum * 4.8));
        const spark = Math.sin(this._timeAccum * 29.0) > 0.72 ? 1.35 : 1.0;
        const sc = 0.85 + 0.35 * strobe;
        hz.ring.scale.set(sc, sc, sc);
        hz.ringMat.opacity = Math.min(0.95, 0.35 + 0.50 * strobe * spark);
        hz.flare.rotation.y = this._timeAccum * 2.4;
        hz.flareMat.opacity = Math.min(0.85, 0.25 + 0.42 * strobe * spark);
      }

      if (this._objectiveBeacons && this._objectiveBeacons.length > 0) {
        const t = this._timeAccum;
        for (let i = 0; i < this._objectiveBeacons.length; i++) {
          const b = this._objectiveBeacons[i];
          if (b.item && b.item.used) {
            if (b.group.visible) b.group.visible = false;
            continue;
          }
          if (!b.group.visible) continue;
          b.diamond.rotation.y = t * 2.1 + i * 0.7;
          b.diamond.position.y = b.baseDiamondY + Math.sin(t * 3.2 + i) * 0.10;
          b.outline.rotation.y = -t * 1.4 + i * 0.7;
          b.outline.position.y = b.diamond.position.y;
          const rScale = 0.92 + 0.14 * Math.sin(t * 3.8 + i);
          b.ring.scale.set(rScale, rScale, rScale);
        }
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

    _initCachedBVH: function () {
      const cityMeshes = (LRT.City && typeof LRT.City.getBVHMeshes === 'function') ? LRT.City.getBVHMeshes() : [];
      this._cachedAllBVH = (cityMeshes && cityMeshes.length > 0)
        ? this.bvhMeshes.concat(cityMeshes)
        : this.bvhMeshes.slice();
    },

    getBVHMeshes: function () {
      if (this._cachedAllBVH) return this._cachedAllBVH;
      const cityMeshes = (LRT.City && typeof LRT.City.getBVHMeshes === 'function') ? LRT.City.getBVHMeshes() : [];
      if (!cityMeshes || cityMeshes.length === 0) return this.bvhMeshes;
      this._cachedAllBVH = this.bvhMeshes.concat(cityMeshes);
      return this._cachedAllBVH;
    },

    _buildObjectiveBeacons: function () {
      if (!this.rootGroup) return;
      const MISSION_IDS = new Set([
        'portable_generator', 'jaklingko_kiosk', 'balcony_supply',
        'cawang_derelict_cab', 'island2_supply', 'garden_supply', 'depot_supply',
        'city_pln_box', 'city_coffee_cart', 'city_convoy_car', 'city_pocket_park',
        'route_totem', 'setiabudi_jpo_switch', 'call_train', 'call_train_prev', 'call_train_p2'
      ]);

      const beamGeo = new THREE.CylinderGeometry(0.08, 0.36, 1.50, 16, 1, true);
      const ringGeo = new THREE.RingGeometry(0.36, 0.54, 24);
      ringGeo.rotateX(-Math.PI * 0.5);
      const diamondGeo = new THREE.OctahedronGeometry(0.16, 0);
      const outlineGeo = new THREE.OctahedronGeometry(0.22, 0);
      this.disposableGeometries.push(beamGeo, ringGeo, diamondGeo, outlineGeo);

      const vertShader = [
        'varying vec2 vUv;',
        'varying vec3 vViewNormal;',
        'varying vec3 vViewPos;',
        'void main() {',
        '  vUv = uv;',
        '  vViewNormal = normalize(normalMatrix * normal);',
        '  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
        '  vViewPos = -mvPos.xyz;',
        '  gl_Position = projectionMatrix * mvPos;',
        '}'
      ].join('\n');

      const fragShader = [
        'uniform float uTime;',
        'uniform vec3 uColor;',
        'uniform float uIntensity;',
        'varying vec2 vUv;',
        'varying vec3 vViewNormal;',
        'varying vec3 vViewPos;',
        'void main() {',
        '  vec3 V = normalize(vViewPos);',
        '  vec3 N = normalize(vViewNormal);',
        '  float ndotv = abs(dot(N, V));',
        '  float fresnel = pow(clamp(1.0 - ndotv, 0.0, 1.0), 1.55);',
        '  float vertFade = smoothstep(0.0, 0.14, vUv.y) * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.25);',
        '  float wave = 0.65 + 0.35 * sin(uTime * 4.2 - vUv.y * 7.0);',
        '  float pulse = 0.78 + 0.22 * sin(uTime * 3.0);',
        '  float alpha = (0.18 + 0.82 * fresnel) * vertFade * wave * pulse * uIntensity;',
        '  gl_FragColor = vec4(uColor * (1.1 + fresnel * 0.6), clamp(alpha, 0.0, 0.92));',
        '}'
      ].join('\n');

      const makeTier = (hex, intensity, ringOp) => {
        const col = new THREE.Color(hex);
        const beamMat = new THREE.ShaderMaterial({
          uniforms: {
            uTime: this._beaconSharedTime,
            uColor: { value: col },
            uIntensity: { value: intensity }
          },
          vertexShader: vertShader,
          fragmentShader: fragShader,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        });
        const solidMat = new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: Math.min(0.95, 0.62 * intensity),
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const ringMat = new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: ringOp,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        });
        const outlineMat = new THREE.MeshBasicMaterial({
          color: hex,
          wireframe: true,
          transparent: true,
          opacity: Math.min(0.75, 0.42 * intensity),
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        this.disposableMaterials.push(beamMat, solidMat, ringMat, outlineMat);
        return { beamMat, solidMat, ringMat, outlineMat };
      };

      this._beaconMats = {
        amber: makeTier(0xffb33a, 1.05, 0.68),
        cyan: makeTier(0x38bdf8, 1.05, 0.72),
        lootEmerald: makeTier(0x34d399, 0.62, 0.45),
        lootViolet: makeTier(0xc084fc, 0.72, 0.52)
      };

      this._objectiveBeacons = [];
      this._objectiveMarkersCache = [];

      const cityItems = (LRT.City && typeof LRT.City.getInteractables === 'function')
        ? LRT.City.getInteractables()
        : [];
      const allItems = [];
      for (let i = 0; i < this.interactables.length; i++) allItems.push(this.interactables[i]);
      for (let i = 0; i < cityItems.length; i++) allItems.push(cityItems[i]);

      for (let i = 0; i < allItems.length; i++) {
        const it = allItems[i];
        if (!it || it.type === 'turnstile') continue;
        const isTrain = it.type === 'call_train' || it.type === 'call_train_prev' || it.id === 'call_train' || it.id === 'call_train_prev' || it.id === 'call_train_p2';
        const isLootbox = it.type === 'lootbox';

        this._objectiveMarkersCache.push({
          id: it.id,
          x: it.x,
          y: it.y,
          z: it.z,
          localZ: it.z,
          label: it.label || it.prompt || it.id,
          kind: isLootbox ? 'lootbox' : (isTrain ? 'train' : 'supply'),
          used: !!it.used,
          item: it
        });

        if (isLootbox || !MISSION_IDS.has(it.id)) continue;

        const defaultTier = isTrain ? this._beaconMats.cyan : this._beaconMats.amber;

        const grp = new THREE.Group();
        grp.position.set(it.x, it.y, it.z);
        grp.visible = false;

        const baseOffsetY = isLootbox ? -0.35 : -0.45;
        const beam = new THREE.Mesh(beamGeo, defaultTier.beamMat);
        beam.position.y = baseOffsetY + 0.75;
        const ring = new THREE.Mesh(ringGeo, defaultTier.ringMat);
        ring.position.y = baseOffsetY + 0.02;
        const diamond = new THREE.Mesh(diamondGeo, defaultTier.solidMat);
        const baseDiamondY = isLootbox ? 0.62 : 0.92;
        diamond.position.y = baseDiamondY;
        const outline = new THREE.Mesh(outlineGeo, defaultTier.outlineMat);
        outline.position.y = baseDiamondY;

        grp.add(beam);
        grp.add(ring);
        grp.add(diamond);
        grp.add(outline);
        this.rootGroup.add(grp);

        this._objectiveBeacons.push({
          id: it.id,
          item: it,
          group: grp,
          beam: beam,
          ring: ring,
          diamond: diamond,
          outline: outline,
          baseDiamondY: baseDiamondY,
          isTrain: isTrain,
          isLootbox: isLootbox
        });
      }
    },

    _syncObjectiveBeacons: function () {
      if (!this._beaconMats) return;
      const activeSet = this._activeObjectiveIds;
      for (let i = 0; i < this._objectiveBeacons.length; i++) {
        const b = this._objectiveBeacons[i];
        const used = !!(b.item && b.item.used);
        if (used) {
          b.group.visible = false;
          continue;
        }
        const isActive = activeSet && activeSet.has(b.id);
        let tier = null;
        if (b.isTrain) {
          if (isActive) tier = this._beaconMats.cyan;
        } else if (b.isLootbox) {
          tier = isActive
            ? this._beaconMats.amber
            : ((b.item && (b.item.riskLuck || 0) >= 0.5) ? this._beaconMats.lootViolet : this._beaconMats.lootEmerald);
        } else if (isActive) {
          tier = this._beaconMats.amber;
        }

        if (!tier) {
          b.group.visible = false;
          continue;
        }
        if (b.beam.material !== tier.beamMat) {
          b.beam.material = tier.beamMat;
          b.ring.material = tier.ringMat;
          b.diamond.material = tier.solidMat;
          b.outline.material = tier.outlineMat;
        }
        b.group.visible = true;
      }
    },

    setActiveObjectiveIds: function (idsArray) {
      if (!this._activeObjectiveIds) this._activeObjectiveIds = new Set();
      this._activeObjectiveIds.clear();
      if (Array.isArray(idsArray)) {
        for (let i = 0; i < idsArray.length; i++) {
          const id = idsArray[i];
          if (!id) continue;
          this._activeObjectiveIds.add(id);
          if (id === 'call_train_p2') this._activeObjectiveIds.add('call_train_prev');
          if (id === 'call_train_prev') this._activeObjectiveIds.add('call_train_p2');
        }
      }
      this._syncObjectiveBeacons();
    },

    getObjectiveMarkers: function () {
      const offsetZ = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
      const activeSet = this._activeObjectiveIds;
      for (let i = 0; i < this._objectiveMarkersCache.length; i++) {
        const m = this._objectiveMarkersCache[i];
        const it = m.item;
        m.x = it.x;
        m.y = it.y;
        m.z = it.z + offsetZ;
        m.used = !!it.used;
        m.label = it.label || it.prompt || m.id;
        const isTrain = it.type === 'call_train' || it.type === 'call_train_prev' || m.id === 'call_train' || m.id === 'call_train_prev' || m.id === 'call_train_p2';
        if (it.type === 'lootbox') m.kind = 'lootbox';
        else if (isTrain) m.kind = 'train';
        else if (activeSet && activeSet.has(m.id)) m.kind = 'objective';
        else m.kind = 'supply';
      }
      return this._objectiveMarkersCache;
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

      if (it.type === 'bench') {
        const oz = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
        const sp = it.seatPos || { x: it.x, y: it.y - 0.5, z: it.z };
        const stp = it.standPos || { x: it.x, y: it.y - 0.5, z: it.z };
        return {
          ok: true,
          type: 'bench',
          action: 'sit_bench',
          seatPos: { x: sp.x, y: sp.y, z: sp.z + oz },
          standPos: { x: stp.x, y: stp.y, z: stp.z + oz },
          yaw: typeof it.yaw === 'number' ? it.yaw : undefined,
          message: 'Duduk di bangku peron — tekan [E] atau WASD untuk berdiri'
        };
      }

      if (it.type === 'lootbox') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('turnstile_beep', { gain: 0.7 });
        const fresh = !it.used;
        it.used = true;
        it.label = it.label.replace(/\([^)]+\)/, '(Sudah Dibuka)');
        if (!it.label.includes('(Sudah Dibuka)')) it.label += ' (Sudah Dibuka)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        if (this._lootboxGlows && this._lootboxGlows.has(id)) {
          const gm = this._lootboxGlows.get(id);
          if (gm) gm.visible = false;
        }
        if (this._lootboxVisuals) {
          for (let i = 0; i < this._lootboxVisuals.length; i++) {
            if (this._lootboxVisuals[i].id === id) {
              this._lootboxVisuals[i].used = true;
            }
          }
        }
        this._syncObjectiveBeacons();
        return {
          ok: true,
          type: 'lootbox',
          action: 'lootbox',
          fresh: fresh,
          riskLuck: it.riskLuck || 0,
          message: fresh
            ? 'Membuka Peti Taktis...'
            : 'Peti Taktis sudah dibuka.'
        };
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
