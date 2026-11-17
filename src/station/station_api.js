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
  const _emptyArr = Object.freeze([]);
  const _sharedStationMats = new Map();
  const _sharedCanopyMats = new Map();
  const _stationStepInProgress = Object.freeze({ done: false, stats: null });

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
    _turnstileGates: [],
    _fieldLogGlints: [],
    _fieldLogPropAssets: null,
    _activeObjectiveIds: new Set(),
    _objectiveBeacons: [],
    _beaconMats: null,
    _beaconSharedTime: { value: 0 },
    _objectiveMarkersCache: [],
    _timeAccum: 0,
    _raycaster: new THREE.Raycaster(),
    _isBuilding: false,
    _buildState: null,

    _resolveMat: function (key, texKey, opts) {
      const mats = (LRT.Materials && LRT.Materials.mats) || {};
      if (mats[key]) return mats[key];
      if (_sharedStationMats.has(key)) return _sharedStationMats.get(key);

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
      }
      const mat = new THREE.MeshStandardMaterial(params);
      _sharedStationMats.set(key, mat);
      return mat;
    },

    _resolveCanopyMat: function (arch, mats) {
      const colHex = (arch && arch.canopyColor) ? arch.canopyColor.toUpperCase() : '#A85E32';
      if (colHex === '#C27C28' && mats.roofOchre) return mats.roofOchre;
      if (colHex === '#A85E32' && mats.roofTerracotta) return mats.roofTerracotta;

      const cacheKey = 'canopy_' + colHex;
      if (_sharedCanopyMats.has(cacheKey)) return _sharedCanopyMats.get(cacheKey);

      const base = mats.roofTerracotta || mats.roofOchre;
      if (base && typeof base.clone === 'function') {
        const cloned = base.clone();
        cloned.color.set(colHex);
        _sharedCanopyMats.set(cacheKey, cloned);
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
        isTrackGate: !!o.isTrackGate,
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
      for (let i = 0; i < this.stationLights.length; i++) {
        const sl = this.stationLights[i];
        if (sl && sl.light) {
          sl.light.visible = true; // NEVER toggle light.visible!
          sl.light.intensity = 0;
        }
      }
      if (LRT.City && typeof LRT.City.dispose === 'function') {
        LRT.City.dispose();
      }
      if (LRT.Audio && typeof LRT.Audio.stopLoop === 'function') {
        LRT.Audio.stopLoop('generator_loop', 0.15);
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
      this._turnstileGates = [];
      this._fieldLogGlints = [];
      this._fieldLogPropAssets = null;
      this._activeObjectiveIds = new Set();
      this._objectiveBeacons = [];
      this._beaconMats = null;
      this._beaconSharedTime.value = 0;
      this._objectiveMarkersCache = [];
      this._matCache = null;
      this._lightingFactor = 1.0;
      this.destructibles = null;
      this.explosiveBarrels = [];
      this._barrelCueVisual = null;
      this._barrelCueActive = false;
      this._barrelCueMarker = null;
      this._cikokoBarricade = null;
      this._track1Barricade = null;
      this._groundPickups = null;
      this._groundPickupAssets = null;
      this._powerRestored = true;
      this._usedIds = new Set();
      this._isBuilding = false;
      this._buildState = null;
    },

    beginIncrementalBuild: function (index, seed, mode, scene, offsetZ, opts) {
      if (this.rootGroup) this.dispose(scene);

      const o = opts || {};
      this._stationIndex = typeof index === 'number' ? index : 0;
      this._usedIds = (o.usedIds) ? (o.usedIds instanceof Set ? new Set(o.usedIds) : new Set(o.usedIds)) : (this._usedIds || new Set());
      this._powerRestored = (mode === 'exploration') || !!o.powerRestored || (this._stationIndex > 0);
      this._isBuilding = true;

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
      if (S.arch && typeof S.arch.computeRailConfig === 'function') {
        this._railConfig = S.arch.computeRailConfig(arch, dims);
      }

      const root = new THREE.Group();
      root.name = 'StationRoot_' + arch.id;
      if (offsetZ) root.position.z = offsetZ;
      this.rootGroup = root;

      const M = LRT.Materials;
      const mats = (M && M.mats) ? M.mats : {};
      const STALL_UV = M.STALL_UV;
      const SIGN_UV = M.SIGN_UV;

      const core = LRT.Main || null;
      const mBlend = (core && typeof core.getMoodBlendState === 'function') ? core.getMoodBlendState() : null;
      const preserveFog = !!(o.preserveFog || (mBlend && mBlend.active) || (core && core.isMoodLerping === true));
      if (scene && !preserveFog) {
        if (scene.fog && scene.fog.isFogExp2) {
          scene.fog.color.setHex(mood.fogColor);
          scene.fog.density = mood.fogDensity;
        } else {
          scene.fog = new THREE.FogExp2(mood.fogColor, mood.fogDensity);
        }
        if (scene.background && scene.background.isColor) {
          scene.background.setHex(mood.fogColor);
        } else {
          scene.background = new THREE.Color(mood.fogColor);
        }
      }
      if (M && M.uGlobals && !preserveFog) {
        M.uGlobals.uWetness.value = mood.wetness;
        M.uGlobals.uFogHazeColor.value.setHex(mood.fogColor);
        M.uGlobals.uFogHazeDensity.value = chosenMoodKey === 'TOXIC_SMOG' ? 0.52 : 0.38;
      }

      const displayName = sectorLoop > 0 ? arch.name + ' II' : arch.name;
      const bannerCfg = (M && typeof M.repaintStationBanner === 'function') ? {
        codeCB: arch.id === 'harjamukti' ? 'CB 12' : arch.code.split('/')[0].trim(),
        codeBK: arch.id === 'harjamukti' ? null : (arch.code.split('/')[1] || 'BK 01').trim(),
        name: displayName,
        subtitle: (arch.destinationHint || 'LRT JABODEBEK') + '  •  PERON 1',
        accentColor: arch.lineColor
      } : null;

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
        scene: scene || null,
        arch, dims, mood, chosenMoodKey, rng, root, mats, STALL_UV, SIGN_UV,
        matConcrete, matConcreteRough, matDarkWood, matCanopy,
        buckets,
        navNodes, navEdges, addNavNode, addNavLink, addNavChain,
        glassRecords: [],
        stairZones, registerStairZone, isInStairExclusion
      };

      this._buildState = {
        phase: 0,
        scene: scene || null,
        M: M,
        bannerCfg: bannerCfg,
        ctx: ctx
      };

      return this;
    },

    stepIncrementalBuild: function () {
      const st = this._buildState;
      if (!st) {
        this._isBuilding = false;
        return { done: true, stats: this.getStats() };
      }
      const ctx = st.ctx;
      const phase = st.phase;

      if (phase === 0) {
        if (st.bannerCfg && st.M && typeof st.M.repaintStationBanner === 'function') {
          st.M.repaintStationBanner(st.bannerCfg);
        }
        S.arch.buildArchitecture(this, ctx);
        st.phase = 1;
        return _stationStepInProgress;
      }

      if (phase === 1) {
        S.navProps.buildStallsAndTubes(this, ctx);
        st.phase = 2;
        return _stationStepInProgress;
      }

      if (phase === 2 || phase === 3 || phase === 4) {
        const batchIdx = phase - 2;
        if (typeof S.arch.mergeStaticBucketsBatch === 'function') {
          S.arch.mergeStaticBucketsBatch(this, ctx, batchIdx);
          st.phase = phase + 1;
        } else {
          S.arch.mergeStaticBuckets(this, ctx);
          st.phase = 5;
        }
        return _stationStepInProgress;
      }

      if (phase === 5) {
        S.navProps.buildDestructiblesAndNav(this, ctx, { onlyDestructibles: true });
        st.phase = 6;
        return _stationStepInProgress;
      }

      if (phase === 6) {
        if (LRT.City && typeof LRT.City.beginIncrementalBuild === 'function') {
          LRT.City.beginIncrementalBuild(ctx.arch, ctx.rng, ctx.root, ctx.cityBuildOpts);
          const cRes = LRT.City.stepIncrementalBuild();
          st.phase = (cRes && cRes.done) ? 8 : 7;
          return _stationStepInProgress;
        }
        if (LRT.City && typeof LRT.City.build === 'function') {
          LRT.City.build(ctx.arch, ctx.rng, ctx.root, ctx.cityBuildOpts);
        }
        st.phase = 8;
        return _stationStepInProgress;
      }

      if (phase === 7) {
        const cRes = (LRT.City && typeof LRT.City.stepIncrementalBuild === 'function')
          ? LRT.City.stepIncrementalBuild()
          : { done: true };
        if (cRes && !cRes.done) return _stationStepInProgress;
        st.phase = 8;
        return _stationStepInProgress;
      }

      if (phase === 8) {
        S.navProps.buildDestructiblesAndNav(this, ctx, { onlyFinalizeNav: true });
        st.phase = 9;
        return _stationStepInProgress;
      }

      this._buildState = null;
      this._isBuilding = false;
      if (st.scene && this.rootGroup && !this.rootGroup.parent) {
        st.scene.add(this.rootGroup);
      }
      if (this.rootGroup) this.rootGroup.updateMatrixWorld(true);
      const finalOz = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
      if (LRT.Enemies && typeof LRT.Enemies.setOffsetZ === 'function') {
        LRT.Enemies.setOffsetZ(finalOz);
      }
      for (let i = 0; i < this.stationLights.length; i++) {
        const sl = this.stationLights[i];
        if (sl && sl.light) {
          sl.light.visible = true;
          sl.light.position.set(
            sl.homeX !== undefined ? sl.homeX : sl.light.position.x,
            sl.homeY !== undefined ? sl.homeY : sl.light.position.y,
            (sl.homeZ !== undefined ? sl.homeZ : sl.light.position.z) + finalOz
          );
        }
      }
      this.setLightingFactor(this._lightingFactor);
      this._initCachedBVH();
      this._buildObjectiveBeacons();
      this.setActiveObjectiveIds([]);
      const core = LRT.Main || null;
      if (core && typeof core.updateCityVisibility === 'function') {
        core.updateCityVisibility();
      }
      return { done: true, stats: this.getStats() };
    },

    isIncrementalBuilding: function () {
      return !!this._isBuilding;
    },

    build: function (index, seed, mode, scene, offsetZ, opts) {
      this.beginIncrementalBuild(index, seed, mode, scene, offsetZ, opts);
      while (!this.stepIncrementalBuild().done) {}
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
      const mBlend = (LRT.Main && typeof LRT.Main.getMoodBlendState === 'function') ? LRT.Main.getMoodBlendState() : null;
      const tubeInt = (mBlend && mBlend.active && mBlend.tubeIntensity !== undefined)
        ? mBlend.tubeIntensity
        : (this._mood && this._mood.tubeIntensity !== undefined ? this._mood.tubeIntensity : 0.85);
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
      if (!this.rootGroup || this._isBuilding) return;
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
      const mBlend = (LRT.Main && typeof LRT.Main.getMoodBlendState === 'function') ? LRT.Main.getMoodBlendState() : null;
      const nightMix = (mBlend && mBlend.active)
        ? (1.0 - (mBlend.daylightBlend !== undefined ? mBlend.daylightBlend : 0.0))
        : ((!this._mood || !this._mood.isDaylight) ? 1.0 : 0.0);
      const tubeInt = (mBlend && mBlend.active && mBlend.tubeIntensity !== undefined)
        ? mBlend.tubeIntensity
        : (this._mood && this._mood.tubeIntensity !== undefined ? this._mood.tubeIntensity : 0.85);
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
            sl.light.position.z += ((bestA.z + offsetZ) - sl.light.position.z) * lerpAlpha;
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
              sl.light.position.z += ((bestA.z + offsetZ) - sl.light.position.z) * lerpAlpha;
            } else {
              tubeAliveFactor = 0.08;
            }
          }

          let flick = 1.0;
          if (nightMix > 0.01) {
            const wave = Math.sin(this._timeAccum * (5.8 + i * 2.1) + i * 1.7);
            const jitter = Math.sin(this._timeAccum * 19.0 + i * 4.3);
            let rawFlick = 1.0;
            if (i % 2 === 1) {
              const cyc = (this._timeAccum * 0.7 + i * 0.9) % 3.8;
              rawFlick = (cyc > 2.4 && wave > -0.25) ? 0.16 : (jitter < -0.55 ? 0.38 : 0.82);
            } else {
              rawFlick = (wave < -0.78 && jitter < -0.3) ? 0.25 : (0.72 + 0.22 * wave);
            }
            flick = 1.0 + (rawFlick - 1.0) * nightMix;
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

      if (this.explosiveBarrels && this.explosiveBarrels.length > 0) {
        const t = this._timeAccum;
        const hPulse = 0.55 + 0.45 * Math.sin(t * 4.2);
        let nearestBarrel = null;
        let nearestD2 = Infinity;
        for (let i = 0; i < this.explosiveBarrels.length; i++) {
          const b = this.explosiveBarrels[i];
          if (b.exploded) {
            if (b.haloGroup && b.haloGroup.visible) b.haloGroup.visible = false;
            continue;
          }
          if (b.haloGroup) {
            b.haloGroup.visible = true;
            const rSc = 0.94 + 0.14 * hPulse;
            if (b.haloRing) b.haloRing.scale.set(rSc, rSc, rSc);
            if (b.haloShell) {
              const sSc = 0.98 + 0.06 * hPulse;
              b.haloShell.scale.set(sSc, 1.0, sSc);
            }
          }
          const dx = b.x - px;
          const dz = b.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 < nearestD2) {
            nearestD2 = d2;
            nearestBarrel = b;
          }
        }
        if (this._barrelCueVisual) {
          this._barrelCueVisual.ringMat.opacity = 0.56 + 0.30 * hPulse;
          this._barrelCueVisual.shellMat.opacity = 0.16 + 0.14 * hPulse;
          const showCue = !!(this._barrelCueActive && nearestBarrel);
          this._barrelCueVisual.group.visible = showCue;
          if (showCue) {
            this._barrelCueVisual.group.position.set(nearestBarrel.x, nearestBarrel.y, nearestBarrel.z);
            const orbY = 1.62 + Math.sin(t * 3.6) * 0.14;
            this._barrelCueVisual.orb.position.y = orbY;
            this._barrelCueVisual.orb.rotation.y = t * 1.8;
            this._barrelCueVisual.shell.position.y = orbY;
            this._barrelCueVisual.shell.rotation.y = -t * 2.4;
          }
          if (this._barrelCueMarker) {
            if (showCue) {
              this._barrelCueMarker.active = true;
              this._barrelCueMarker.used = false;
              this._barrelCueMarker.x = nearestBarrel.x;
              this._barrelCueMarker.y = nearestBarrel.y + 1.55;
              this._barrelCueMarker.z = nearestBarrel.z + offsetZ;
            } else {
              this._barrelCueMarker.active = false;
              this._barrelCueMarker.used = true;
            }
          }
        }
      } else if (this._barrelCueVisual && this._barrelCueVisual.group.visible) {
        this._barrelCueVisual.group.visible = false;
        if (this._barrelCueMarker) this._barrelCueMarker.active = false;
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

      // Access by KAI tripod turnstile smooth 120-deg ease-out rotation & LED flash
      if (this._turnstileGates && this._turnstileGates.length > 0) {
        for (let i = 0; i < this._turnstileGates.length; i++) {
          const tg = this._turnstileGates[i];
          if (tg.animating && tg.rotorSpinGroup) {
            tg.animElapsed += dt;
            const rawT = tg.animDuration > 0 ? Math.min(1, tg.animElapsed / tg.animDuration) : 1;
            const inv = 1 - rawT;
            const ease = 1 - inv * inv * inv;
            tg.rotorSpinGroup.rotation.z = tg.startAngle + (tg.targetAngle - tg.startAngle) * ease;
            if (rawT >= 1) {
              tg.rotorSpinGroup.rotation.z = tg.targetAngle;
              tg.baseAngle = tg.targetAngle;
              tg.animating = false;
            }
          }
          if (tg.ledTimer > 0 && tg.ledMat) {
            tg.ledTimer = Math.max(0, tg.ledTimer - dt);
            if (tg.ledTimer > 0) {
              tg.ledMat.emissiveIntensity = 1.6 + 0.8 * (tg.ledTimer / tg.ledDuration);
            } else {
              tg.ledMat.color.setHex(0x22d3ee);
              tg.ledMat.emissive.setHex(0xf59e0b);
              tg.ledMat.emissiveIntensity = 1.35;
            }
          }
        }
      }

      // Subtle warm glint pulse on unread 3D field log folders
      if (this._fieldLogGlints && this._fieldLogGlints.length > 0) {
        const t = this._timeAccum;
        for (let i = 0; i < this._fieldLogGlints.length; i++) {
          const fg = this._fieldLogGlints[i];
          if (fg.used || !fg.mesh || !fg.mesh.visible) continue;
          if (fg.mat) fg.mat.opacity = 0.22 + 0.14 * Math.sin(t * 2.8 + i * 1.1);
        }
      }

      // Ground enemy drop pickup rotation & proximity auto-collect
      if (this._groundPickups && this._groundPickups.length > 0) {
        const core = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core;
        for (let i = 0; i < this._groundPickups.length; i++) {
          const pu = this._groundPickups[i];
          if (!pu.active) continue;
          pu.age += dt;
          pu.mesh.rotation.y += dt * 2.3;
          pu.mesh.position.y = 0.34 + Math.sin(this._timeAccum * 4.0 + i) * 0.08;
          if (pRef && pu.age >= 0.25) {
            const dx = px - pu.x;
            const dz = pz - pu.z;
            const dy = py - pu.y;
            if ((dx * dx + dz * dz) <= (1.85 * 1.85) && Math.abs(dy) < 2.3) {
              pu.active = false;
              pu.group.visible = false;
              if (core && typeof core.collectEnemyDrop === 'function') {
                core.collectEnemyDrop(pu.type, pu.meta);
              }
            }
          }
        }
      }

      // Setiabudi final extraction departure: ram through Track 1 Quarantine Barricade
      if (this._track1Barricade && !this._track1Barricade.smashed) {
        const core = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core;
        const states = (LRT.Config && LRT.Config.STATES) || {};
        if (
          core &&
          core.stationIndex === 5 &&
          core.activeTravelDir === 1 &&
          (core.gameState === states.TRAIN_DEPARTING || core.gameState === states.TRAIN_CRUISE)
        ) {
          const tbWorldZ = this._track1Barricade.z + offsetZ;
          if (tbWorldZ <= 27.5) {
            this.smashTrack1Barricade();
          }
        }
      }
    },

    _initCachedBVH: function () {
      const cityMeshes = (LRT.City && typeof LRT.City.getBVHMeshes === 'function') ? LRT.City.getBVHMeshes() : [];
      this._cachedAllBVH = (cityMeshes && cityMeshes.length > 0)
        ? this.bvhMeshes.concat(cityMeshes)
        : this.bvhMeshes.slice();
    },

    getBVHMeshes: function () {
      if (this._isBuilding || !this.rootGroup) return _emptyArr;
      if (this._cachedAllBVH) return this._cachedAllBVH;
      const cityMeshes = (LRT.City && typeof LRT.City.getBVHMeshes === 'function') ? LRT.City.getBVHMeshes() : _emptyArr;
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
        'cikoko_barricade',
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

      if (this.explosiveBarrels && this.explosiveBarrels.length > 0) {
        this._barrelCueMarker = {
          id: 'explosive_barrel_cue',
          x: this.explosiveBarrels[0].x,
          y: this.explosiveBarrels[0].y + 1.55,
          z: this.explosiveBarrels[0].z,
          label: 'TEMBAK BAREL PELEDAK',
          kind: 'hazard',
          used: true,
          active: false
        };
        this._objectiveMarkersCache.push(this._barrelCueMarker);
      } else {
        this._barrelCueMarker = null;
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

    setBarrelCueActive: function (active) {
      this._barrelCueActive = !!active;
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
      if (this._isBuilding || !this.rootGroup) return _emptyArr;
      const offsetZ = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
      const activeSet = this._activeObjectiveIds;
      for (let i = 0; i < this._objectiveMarkersCache.length; i++) {
        const m = this._objectiveMarkersCache[i];
        if (!m.item) continue;
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
      if (this._isBuilding || !this.rootGroup) return null;
      return this.bvhMeshes[0] || null;
    },

    getLights: function () {
      if (this._isBuilding || !this.rootGroup) return _emptyArr;
      const cityLights = (LRT.City && typeof LRT.City.getStreetLights === 'function') ? LRT.City.getStreetLights() : _emptyArr;
      if (!cityLights || cityLights.length === 0) return this.stationLights;
      return this.stationLights.concat(cityLights);
    },

    getStreetLights: function () {
      if (this._isBuilding || !this.rootGroup) return _emptyArr;
      return (LRT.City && typeof LRT.City.getStreetLights === 'function') ? LRT.City.getStreetLights() : this.stationLights;
    },

    getSpatialGrid: function () {
      return this.spatialGrid;
    },

    getColliders: function () {
      if (this._isBuilding || !this.rootGroup) return _emptyArr;
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
      const nextZ = z || 0;
      if (this.rootGroup) {
        this.rootGroup.position.z = nextZ;
        this.rootGroup.updateMatrixWorld(true);
      }
      for (let i = 0; i < this.stationLights.length; i++) {
        const sl = this.stationLights[i];
        if (sl && sl.light && sl.homeZ !== undefined) {
          sl.light.position.z = sl.homeZ + nextZ;
        }
      }
      if (LRT.Enemies && typeof LRT.Enemies.setOffsetZ === 'function') {
        LRT.Enemies.setOffsetZ(nextZ);
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
      if (!this.rootGroup || this._isBuilding) return null;
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
      if (!this.rootGroup || this._isBuilding) return;
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

      if (this._cikokoBarricade && !this._cikokoBarricade.cleared) {
        const bc = this._cikokoBarricade;
        const nearX = Math.abs(lx - bc.x) <= (3.4 + rad);
        const nearZ = Math.abs(lz - bc.z) <= (0.9 + rad);
        const nearY = Math.abs(ly - (bc.y + 0.7)) <= (1.8 + rad);
        if (nearX && nearZ && nearY) {
          bc.hp -= (isExplosion ? dmgVal * 1.6 : dmgVal);
          if (bc.hp <= 0) {
            this.breachCikokoBarricade();
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
      if (!this.rootGroup || this._isBuilding) return null;
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

    _markFieldLogGlintUsed: function (id) {
      if (!this._fieldLogGlints || !this._fieldLogGlints.length) return;
      for (let i = 0; i < this._fieldLogGlints.length; i++) {
        const fg = this._fieldLogGlints[i];
        if (fg.id === id) {
          fg.used = true;
          if (fg.mesh) fg.mesh.visible = false;
        }
      }
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
        if (this._turnstileGates) {
          for (let i = 0; i < this._turnstileGates.length; i++) {
            const tg = this._turnstileGates[i];
            if (tg.id === id) {
              tg.startAngle = tg.rotorSpinGroup ? tg.rotorSpinGroup.rotation.z : tg.targetAngle;
              tg.targetAngle = tg.targetAngle + (Math.PI * 2) / 3;
              tg.animElapsed = 0;
              tg.animating = true;
              tg.ledTimer = tg.ledDuration || 1.2;
              if (tg.ledMat) {
                tg.ledMat.color.setHex(0x10b981);
                tg.ledMat.emissive.setHex(0x10b981);
                tg.ledMat.emissiveIntensity = 2.4;
              }
            }
          }
        }
        return {
          ok: true, type: 'turnstile',
          message: 'Access by KAI: Saldo KUE terverifikasi — Silakan lewat!'
        };
      }

      if (it.type === 'generator' || it.id === 'portable_generator') {
        if (LRT.Audio) {
          if (LRT.Audio.play) LRT.Audio.play('generator_start', { gain: 0.9 });
          if (LRT.Audio.startLoop) LRT.Audio.startLoop('generator_loop', 0.32, 1.2, 1.0);
        }
        this._powerRestored = true;
        this.setLightingFactor(this._lightingFactor);
        it.used = true;
        it.label = '[E] Generator Darurat (Aktif)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
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
        if (LRT.Audio && LRT.Audio.play) {
          LRT.Audio.play('electric_box_open', { gain: 0.8 });
          LRT.Audio.play('breaker_throw', { gain: 0.65 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Kabin Bangkai LRT Cawang (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
        return {
          ok: true,
          type: 'derelict_fuse',
          action: 'derelict_fuse',
          ammo: fresh ? { type: 'shotgun', amount: 18 } : null,
          logTitle: 'Catatan Masinis Kereta Rangkaian Delapan',
          logBody: '16 November, pukul 18.40 WIB.\n\nKereta dari arah Bekasi anjlok menabrak wesel pemindah jalur di Cawang. Seluruh petugas stasiun sudah mundur ke Peron Empat. Jangan biarkan orang-orang yang terinfeksi itu mendekati tangki hidrogen cadangan.\n\nPeluru karet sama sekali tidak mempan terhadap mereka. Bagi siapa pun yang menemukan catatan ini di kabin, segera ambil sekring di bawah meja kendali dan nyalakan kembali aliran listrik peron sebelum terlambat.\n\nHendra, Masinis Utama',
          message: fresh ? 'Sekring Bypass dan Shotgun ditemukan' : 'Kabin bangkai kereta Cawang sudah digeledah.'
        };
      }

      if (it.type === 'field_log' || it.id === 'loket_counter') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('paper_rustle', { gain: 0.72 });
        it.used = true;
        it.label = 'Meja Loket Stasiun (Sudah Diperiksa)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
        return {
          ok: true,
          type: 'field_log',
          action: 'field_log',
          logTitle: 'Buku Piket Loket Dukuh Atas',
          logBody: '16 November, pukul 17.15 WIB.\n\nKami baru saja menerima panggilan darurat dari pusat kendali di Halim. Seluruh petugas stasiun diminta segera meninggalkan ruang loket karena kereta kehilangan sinyal kendali otomatis di jalur Cawang sampai Cikoko.\n\nKami sempat mengunci pintu kaca di lantai bawah untuk menahan penumpang yang berlarian dari arah jalan raya Sudirman, tetapi kaca itu mulai retak dihantam dari luar. Orang-orang di luar sana sudah tidak bisa diajak bicara. Mata mereka memerah dan mereka menyerang siapa saja yang bergerak.\n\nRizal, Petugas Loket Sore',
          message: 'Buku Catatan Piket Loket ditemukan.'
        };
      }

      if (it.type === 'relay' || it.id === 'setiabudi_jpo_switch') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('breaker_throw', { gain: 0.85 });
        it.used = true;
        it.label = 'Sakelar Relai Sinyal JPO Setiabudi (Terhubung)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
        if (LRT.Enemies && LRT.Enemies.alertAllTo) {
          LRT.Enemies.alertAllTo({ x: it.x, y: it.y, z: it.z }, 45.0);
        }
        return {
          ok: true,
          type: 'relay',
          action: 'relay',
          lurePos: { x: it.x, y: it.y, z: it.z },
          logTitle: 'Pesan Radio Darurat Stasiun Setiabudi',
          logBody: 'Kepada regu penyelamat di jalur selatan,\n\nSambungan pemancar dari atap Setiabudi akhirnya berhasil terhubung ke pusat komando Bekasi dan Rumah Sakit Gatot Soebroto. Catatan penelitian Dokter Rina sudah kami teruskan.\n\nSuara klakson frekuensi rendah dari kereta terbukti mampu mengganggu saraf mereka untuk sementara waktu. Begitu ketiga pemancar di stasiun ini menyala, gerbang evakuasi di ujung utara peron akan segera dibuka.',
          message: 'Relai Sinyal JPO terhubung, data dikirim ke pusat komando.'
        };
      }

      if (it.type === 'rotio') {
        if (LRT.Audio && LRT.Audio.play) {
          LRT.Audio.play(it.used ? 'paper_rustle' : 'pickup_medkit', { gain: 0.68 });
        }
        const heal = it.used ? 0 : 25;
        it.used = true;
        it.label = "Etalase Roti'O Coffee Bun (Kosong)";
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
        const res = {
          ok: true, type: 'rotio', heal: heal, healAmount: heal,
          message: heal > 0 ? "Roti'O Coffee Bun hangat ditemukan (+25 HP)" : "Etalase Roti'O sudah diambil."
        };
        if (this._archetype && this._archetype.id === 'dukuh_atas' && heal > 0) {
          res.logTitle = 'Pesan untuk Shift Malam Gerai Roti';
          res.logBody = 'Jumat sore, pukul 16.30.\n\nMas Doni, kalau nanti malam listrik stasiun mati lagi, tolong oven gas jangan langsung dimatikan. Dari tadi di luar banyak orang berlarian dan berteriak, tapi wangi kopi dan mentega dari kedai kita lumayan bikin anak-anak yang mengungsi di peron dua jadi sedikit lebih tenang.\n\nTadi petugas stasiun sempat minta sepuluh bungkus roti hangat karena kereta tujuan Harjamukti berhenti mendadak di tengah jalur. Persediaan tepung kita masih cukup sampai hari Senin. Jaga diri baik-baik ya.\n\nSalam,\nBudi';
        }
        return res;
      }

      if (it.type === 'coway') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('water_pour', { gain: 0.72 });
        const heal = it.used ? 0 : 15;
        it.used = true;
        it.label = 'Dispenser Coway (Sudah Minum)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
        return {
          ok: true, type: 'coway', heal: heal, healAmount: heal,
          message: heal > 0 ? 'Air mineral steril Coway menyegarkan (+15 HP)' : 'Air Coway sudah diminum di stasiun ini.'
        };
      }

      if (it.type === 'jaklingko') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('electric_box_open', { gain: 0.7 });
        const bonus = it.used ? 0 : 1;
        it.used = true;
        it.label = 'Terminal JakLingko (Sudah Diambil)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
        const res = {
          ok: true, type: 'jaklingko',
          ammo: bonus > 0 ? { type: 'rifle', amount: 30 } : null, ammoBonus: bonus,
          message: bonus > 0 ? 'Menemukan suplai amunisi darurat di loker JakLingko.' : 'Terminal JakLingko kosong.'
        };
        if (bonus > 0) {
          res.logTitle = 'Catatan di Atas Mesin Tiket';
          res.logBody = 'Mesin gerbang tiket otomatis ini sudah tidak berguna. Ketika kabut mulai naik dari tangga jalan raya dan ratusan penumpang panik mendorong dari belakang, palang besi ini tetap terkunci hanya karena saldo kartu kurang beberapa ribu rupiah.\n\nSaya tinggalkan sisa amunisi cadangan di dalam laci mesin ini untuk petugas keamanan yang masih bertahan di peron. Kalau gerbang macet, lompati saja palangnya.';
        }
        return res;
      }

      if (it.type === 'balcony_supply') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('crate_open', { gain: 0.78 });
        const fresh = !it.used;
        it.used = true;
        it.label = it.label.replace(/\(\+[^)]+\)/, '(Sudah Diambil)');
        if (!it.label.includes('(Sudah Diambil)')) it.label += ' (Sudah Diambil)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
        const res = {
          ok: true, type: 'balcony_supply',
          heal: fresh ? 25 : 0, healAmount: fresh ? 25 : 0,
          ammo: fresh ? (it.id === 'depot_supply' ? { type: 'rpg', amount: 3 } : { type: 'all', amount: 30 }) : null,
          ammoBonus: fresh ? 1 : 0,
          message: fresh ? (it.id === 'garden_supply' ? 'Kotak Medis Kebun Atap: Antiviral Serum dan Amunisi diamankan.' : (it.id === 'depot_supply' ? 'Loker Taktis Depot: Pelontar Roket dan Amunisi diambil.' : 'Loker Taktis: Amunisi dan Medkit diambil.')) : 'Loker persediaan sudah diambil.'
        };
        if (fresh) {
          if (it.id === 'garden_supply') {
            res.logTitle = 'Catatan Penelitian Dokter Rina Wulandari';
            res.logBody = 'Hari keempat pengamatan di kebun atap Harjamukti.\n\nDugaan awal kami di laboratorium Cibubur ternyata keliru. Spora ini bukan sekadar jamur tanaman biasa. Jaringannya menyerap karat besi dari rel kereta dan berkembang jauh lebih cepat di tempat yang gelap dan lembap.\n\nNamun ada satu kelemahan yang baru saya temukan sore ini. Saat kereta di jalur uji membunyikan klakson panjang, getaran suara rendahnya membuat mereka langsung terhuyung dan kehilangan arah. Jangan sampai catatan ini hilang, tim medis di pusat kota sangat membutuhkannya.\n\nDokter Rina Wulandari';
          } else if (it.id === 'depot_supply') {
            res.logTitle = 'Surat Tugas Teknisi Depo Harjamukti';
            res.logBody = 'Untuk rekan teknisi jaga malam,\n\nKereta rangkaian keempat yang parkir di jalur timur adalah kereta cadangan berbahan bakar hidrogen. Kereta ini tetap bisa berjalan meskipun aliran listrik dari gardu induk padam sepenuhnya.\n\nJika kalian harus keluar dari Harjamukti malam ini, nyalakan lebih dulu sakelar cadangan di ruang mesin, lalu panggil kereta dari ujung peron. Selama tabung bahan bakar di bagian atap tidak bocor terkena tembakan, kereta ini sanggup membawa kalian menembus jalur selatan sampai ke titik penjemputan.';
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
        if (LRT.Audio && LRT.Audio.play) {
          LRT.Audio.play('crate_open', { gain: 0.85 });
          if (!it.used) LRT.Audio.play('loot_chime', { gain: 0.65 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = it.label.replace(/\([^)]+\)/, '(Sudah Dibuka)');
        if (!it.label.includes('(Sudah Dibuka)')) it.label += ' (Sudah Dibuka)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(id);
        this._markFieldLogGlintUsed(id);
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

      if (it.id === 'cikoko_barricade' || it.type === 'barricade_breach') {
        const breachedNow = this.breachCikokoBarricade();
        return {
          ok: true,
          type: 'barricade_breach',
          action: 'barricade_breach',
          fresh: breachedNow,
          message: breachedNow
            ? 'Muatan peledak diledakkan — Barikade Tol Cikoko hancur!'
            : 'Barikade jalan tol Cikoko sudah ditembus.'
        };
      }

      if (it.type === 'info') {
        if (LRT.Audio && LRT.Audio.play) LRT.Audio.play('station_chime', { gain: 0.5 });
        this._markFieldLogGlintUsed(id);
        const arch = this._archetype || {};
        const res = {
          ok: true, type: 'info',
          message: (arch.name || 'Stasiun') + ' ' + (arch.destinationHint || 'LRT Jabodebek')
        };
        if (arch.id === 'setiabudi') {
          res.logTitle = 'Surat Perintah Penjagaan Stasiun Setiabudi';
          res.logBody = 'Kepada seluruh anggota regu jaga di jalur Rasuna Said,\n\nSeluruh akses jalan raya di bawah stasiun telah ditutup karena tumpukan kendaraan yang ditinggalkan pemiliknya. Anggota yang berjaga di jembatan penyeberangan wajib menahan siapa pun yang menunjukkan gejala mata memerah atau perilaku agresif.\n\nJangan tinggalkan pos sebelum kereta evakuasi terakhir dari arah Dukuh Atas tiba di peron. Nyalakan ketiga pemancar darurat di sekitar stasiun agar helikopter penjemput dapat mengenali posisi kita.';
        } else {
          res.logTitle = 'Pemberitahuan Gangguan Perjalanan Kereta';
          res.logBody = 'Diberitahukan kepada seluruh penumpang bahwa perjalanan kereta jalur selatan yang melewati Dukuh Atas, Cawang, Harjamukti, Kuningan, Cikoko, hingga Setiabudi saat ini mengalami gangguan akibat pemadaman gardu induk.\n\nPara penumpang diharapkan tetap tenang dan mengikuti arahan petugas menuju peron keberangkatan darurat.';
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
      if (b.haloGroup) b.haloGroup.visible = false;
      if (b.colliderIdx !== undefined && this.colliders[b.colliderIdx]) {
        const c = this.colliders[b.colliderIdx];
        c.blocksWalk = false;
        c.blocksBullets = false;
        c.disabled = true;
      }
      const core = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core;
      if (core && typeof core.onBarrelExploded === 'function') {
        core.onBarrelExploded(id);
      }
      const offsetZ = this.rootGroup ? this.rootGroup.position.z : 0;
      const pos = { x: b.x, y: b.y + 0.6, z: b.z + offsetZ };
      if (LRT.Weapons && typeof LRT.Weapons.applyExplosion === 'function') {
        LRT.Weapons.applyExplosion(pos, 7.5, 260, 18.0, false);
      }
    },

    breachCikokoBarricade: function () {
      const bc = this._cikokoBarricade;
      if (!bc || bc.cleared) return false;
      bc.cleared = true;
      bc.hp = 0;
      if (bc.group) bc.group.visible = false;
      if (bc.colliderIdx !== undefined && this.colliders[bc.colliderIdx]) {
        const col = this.colliders[bc.colliderIdx];
        col.blocksWalk = false;
        col.blocksBullets = false;
        col.disabled = true;
      }
      if (bc.interactItem) {
        bc.interactItem.used = true;
        bc.interactItem.label = '[E] Barikade Jalan Tol Ditembus';
        bc.interactItem.prompt = bc.interactItem.label;
      }
      if (this._usedIds) this._usedIds.add('cikoko_barricade');
      this._syncObjectiveBeacons();
      const offsetZ = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
      if (LRT.Weapons && typeof LRT.Weapons.applyExplosion === 'function') {
        LRT.Weapons.applyExplosion({ x: bc.x, y: bc.y + 0.65, z: bc.z + offsetZ }, 6.5, 180, 14.0, false);
      }
      const core = window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core;
      if (core && typeof core.onCikokoBarricadeCleared === 'function') {
        core.onCikokoBarricadeCleared();
      }
      return true;
    },

    smashTrack1Barricade: function () {
      const tb = this._track1Barricade;
      if (!tb || tb.smashed) return false;
      tb.smashed = true;
      if (tb.group) tb.group.visible = false;
      const offsetZ = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
      const worldPos = { x: tb.x, y: tb.y + 0.9, z: tb.z + offsetZ };
      if (LRT.Weapons) {
        if (typeof LRT.Weapons.applyExplosion === 'function') {
          LRT.Weapons.applyExplosion(worldPos, 5.2, 0, 14.0, false);
        }
        if (typeof LRT.Weapons.spawnSparks === 'function') LRT.Weapons.spawnSparks(worldPos, 24);
        if (typeof LRT.Weapons.spawnRubble === 'function') LRT.Weapons.spawnRubble(worldPos, 18);
      }
      if (LRT.PlayerUI) {
        if (typeof LRT.PlayerUI.addTrauma === 'function') LRT.PlayerUI.addTrauma(0.45);
        if (typeof LRT.PlayerUI.setNotice === 'function') {
          LRT.PlayerUI.setNotice('BARIKADE KARANTINA SETIABUDI HANCUR — EKSTRAKSI BERHASIL!', '#4ade80');
        }
      }
      if (LRT.Audio && typeof LRT.Audio.play === 'function') {
        LRT.Audio.play('debris_crumble', { gain: 0.95 });
      }
      return true;
    },

    _buildPickupVisual: function (kind, assets) {
      const wrap = new THREE.Group();
      const addPart = (parent, geo, mat, px, py, pz, rx, ry, rz) => {
        this.disposableGeometries.push(geo);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px || 0, py || 0, pz || 0);
        if (rx) m.rotation.x = rx;
        if (ry) m.rotation.y = ry;
        if (rz) m.rotation.z = rz;
        m.castShadow = false;
        m.receiveShadow = true;
        parent.add(m);
        return m;
      };

      const tryGltf = (modelId, targetSpan, emissiveHex) => {
        if (!LRT.AssetLoader || typeof LRT.AssetLoader.instantiateModel !== 'function') return null;
        const inst = LRT.AssetLoader.instantiateModel(modelId);
        if (!inst) return null;
        const box = new THREE.Box3().setFromObject(inst);
        const sz = new THREE.Vector3();
        const ctr = new THREE.Vector3();
        box.getSize(sz);
        box.getCenter(ctr);
        const maxDim = Math.max(sz.x, sz.y, sz.z, 0.01);
        const sc = targetSpan / maxDim;
        inst.scale.setScalar(sc);
        inst.position.set(-ctr.x * sc, -ctr.y * sc, -ctr.z * sc);
        inst.traverse((ch) => {
          if (ch.isMesh) {
            ch.castShadow = false;
            ch.receiveShadow = true;
            if (ch.material && emissiveHex && ch.material.emissive) {
              ch.material = ch.material.clone();
              this.disposableMaterials.push(ch.material);
              ch.material.emissive.setHex(emissiveHex);
              ch.material.emissiveIntensity = 0.16;
            }
          }
        });
        wrap.add(inst);
        return wrap;
      };

      if (kind === 'health') {
        if (tryGltf('medical_box', 0.44, 0x16a34a)) {
          // Subtle glowing crimson cross badge on top so medkit pops in blackout stations
          addPart(wrap, new THREE.BoxGeometry(0.14, 0.012, 0.045), assets.crossRed, 0, 0.13, 0);
          addPart(wrap, new THREE.BoxGeometry(0.045, 0.012, 0.14), assets.crossRed, 0, 0.13, 0);
          return wrap;
        }
        // Fallback detailed multi-part procedural first-aid kit
        addPart(wrap, new THREE.BoxGeometry(0.38, 0.18, 0.28), assets.medWhite, 0, 0, 0);
        addPart(wrap, new THREE.BoxGeometry(0.40, 0.035, 0.30), assets.medGreen, 0, 0.07, 0);
        addPart(wrap, new THREE.BoxGeometry(0.15, 0.018, 0.048), assets.crossRed, 0, 0.095, 0);
        addPart(wrap, new THREE.BoxGeometry(0.048, 0.018, 0.15), assets.crossRed, 0, 0.095, 0);
        addPart(wrap, new THREE.BoxGeometry(0.14, 0.025, 0.03), assets.steelDark, 0, 0.11, -0.11);
        for (const lx of [-0.11, 0.11]) {
          addPart(wrap, new THREE.BoxGeometry(0.035, 0.07, 0.02), assets.steelDark, lx, 0.03, 0.145);
        }
        return wrap;
      }

      if (kind === 'ammo') {
        if (tryGltf('ammo_box', 0.42, 0xb45309)) return wrap;
        // Fallback military ammo tin with brass belt & top handle
        addPart(wrap, new THREE.BoxGeometry(0.34, 0.22, 0.20), assets.oliveMetal, 0, 0, 0);
        addPart(wrap, new THREE.BoxGeometry(0.36, 0.045, 0.22), assets.oliveRim, 0, 0.10, 0);
        addPart(wrap, new THREE.BoxGeometry(0.14, 0.025, 0.026), assets.steelDark, 0, 0.135, 0);
        addPart(wrap, new THREE.BoxGeometry(0.045, 0.08, 0.02), assets.brass, 0, 0.03, 0.105);
        for (let i = -2; i <= 2; i++) {
          addPart(wrap, new THREE.CylinderGeometry(0.011, 0.011, 0.065, 6), assets.brass, i * 0.032, 0.14, 0.04);
        }
        return wrap;
      }

      if (kind === 'rpg') {
        // Detailed PG-7V warhead pickup angled on tactical cradle
        const rocket = new THREE.Group();
        rocket.rotation.z = 0.34;
        rocket.rotation.y = 0.25;
        addPart(rocket, new THREE.CylinderGeometry(0.034, 0.050, 0.18, 10), assets.oliveMetal, 0, 0.08, 0);
        addPart(rocket, new THREE.ConeGeometry(0.050, 0.14, 10), assets.oliveRim, 0, 0.24, 0);
        addPart(rocket, new THREE.CylinderGeometry(0.012, 0.018, 0.06, 8), assets.copper, 0, 0.32, 0);
        addPart(rocket, new THREE.CylinderGeometry(0.024, 0.032, 0.24, 8), assets.steelDark, 0, -0.12, 0);
        for (let f = 0; f < 4; f++) {
          const ang = (f / 4) * Math.PI * 2;
          addPart(rocket, new THREE.BoxGeometry(0.006, 0.075, 0.048), assets.steelDark, Math.cos(ang) * 0.034, -0.22, Math.sin(ang) * 0.034, 0, -ang, 0);
        }
        wrap.add(rocket);
        return wrap;
      }

      // 'lootcrate' field drop
      if (tryGltf('old_military_crate', 0.50, 0x7e22ce)) return wrap;
      addPart(wrap, new THREE.BoxGeometry(0.46, 0.24, 0.32), assets.cratePurple, 0, 0, 0);
      addPart(wrap, new THREE.BoxGeometry(0.48, 0.04, 0.34), assets.steelDark, 0, 0.11, 0);
      for (const lx of [-0.14, 0.14]) {
        addPart(wrap, new THREE.BoxGeometry(0.04, 0.09, 0.025), assets.brass, lx, 0.04, 0.165);
      }
      return wrap;
    },

    _ensureGroundPickupPool: function () {
      if (this._groundPickupAssets) return this._groundPickupAssets;
      const ringGeo = new THREE.RingGeometry(0.30, 0.44, 18);
      ringGeo.rotateX(-Math.PI * 0.5);
      const ringMats = {
        health: new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        ammo: new THREE.MeshBasicMaterial({ color: 0xe0b422, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        rpg: new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        lootcrate: new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      };
      const sharedMats = {
        medWhite: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.42, metalness: 0.15 }),
        medGreen: new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.45, metalness: 0.25, emissive: 0x052e16, emissiveIntensity: 0.35 }),
        crossRed: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.1, emissive: 0x991b1b, emissiveIntensity: 0.55 }),
        oliveMetal: new THREE.MeshStandardMaterial({ color: 0x3f4e36, roughness: 0.48, metalness: 0.55 }),
        oliveRim: new THREE.MeshStandardMaterial({ color: 0x2d3826, roughness: 0.42, metalness: 0.65 }),
        brass: new THREE.MeshStandardMaterial({ color: 0xd9a738, roughness: 0.28, metalness: 0.85, emissive: 0x451a03, emissiveIntensity: 0.25 }),
        copper: new THREE.MeshStandardMaterial({ color: 0xc26a3d, roughness: 0.32, metalness: 0.82 }),
        steelDark: new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.38, metalness: 0.78 }),
        cratePurple: new THREE.MeshStandardMaterial({ color: 0x3b2654, roughness: 0.44, metalness: 0.45, emissive: 0x581c87, emissiveIntensity: 0.35 })
      };
      this.disposableGeometries.push(ringGeo);
      for (const m of Object.values(ringMats)) this.disposableMaterials.push(m);
      for (const m of Object.values(sharedMats)) this.disposableMaterials.push(m);
      this._groundPickupAssets = Object.assign({ ringGeo, ringMats }, sharedMats);
      return this._groundPickupAssets;
    },

    spawnGroundPickup: function (worldPos, dropType, dropMeta) {
      if (!this.rootGroup || this._isBuilding || !worldPos) return null;
      const assets = this._ensureGroundPickupPool();
      if (!this._groundPickups) this._groundPickups = [];

      const kind = (dropType === 'health' || dropType === 'rpg' || dropType === 'lootcrate') ? dropType : 'ammo';
      let slot = this._groundPickups.find((p) => !p.active);
      if (!slot && this._groundPickups.length >= 18) {
        slot = this._groundPickups.reduce((a, b) => (a.age > b.age ? a : b));
      }
      if (!slot) {
        const grp = new THREE.Group();
        const meshHolder = new THREE.Group();
        meshHolder.position.y = 0.34;
        const variants = {
          health: this._buildPickupVisual('health', assets),
          ammo: this._buildPickupVisual('ammo', assets),
          rpg: this._buildPickupVisual('rpg', assets),
          lootcrate: this._buildPickupVisual('lootcrate', assets)
        };
        for (const vk of Object.keys(variants)) {
          variants[vk].visible = false;
          meshHolder.add(variants[vk]);
        }
        const ring = new THREE.Mesh(assets.ringGeo, assets.ringMats[kind]);
        ring.position.y = 0.04;
        grp.add(ring);
        grp.add(meshHolder);
        this.rootGroup.add(grp);
        slot = { group: grp, mesh: meshHolder, variants, ring, active: false, age: 0, x: 0, y: 0, z: 0, type: kind, meta: null };
        this._groundPickups.push(slot);
      }

      const offsetZ = this.rootGroup.position.z || 0;
      const lx = worldPos.x;
      const ly = Math.max(-1.0, (worldPos.y !== undefined ? worldPos.y : 0) - 0.32);
      const lz = worldPos.z - offsetZ;
      slot.active = true;
      slot.age = 0;
      slot.x = lx;
      slot.y = ly;
      slot.z = lz;
      slot.type = kind;
      slot.meta = dropMeta || null;
      for (const vk of Object.keys(slot.variants)) {
        slot.variants[vk].visible = (vk === kind);
      }
      slot.ring.material = assets.ringMats[kind];
      slot.group.position.set(lx, ly, lz);
      slot.group.visible = true;
      return slot;
    },

    getActiveGroundPickups: function () {
      if (!this._groundPickups || !this.rootGroup) return [];
      const offsetZ = this.rootGroup.position.z || 0;
      const out = [];
      for (let i = 0; i < this._groundPickups.length; i++) {
        const pu = this._groundPickups[i];
        if (!pu.active) continue;
        out.push({ x: pu.x, y: pu.y, z: pu.z + offsetZ, type: pu.type, age: pu.age });
      }
      return out;
    },

    getUsedIds: function () {
      return Array.from(this._usedIds || []);
    }
  };

  LRT.Station = Station;
})(window.LRT = window.LRT || {});
