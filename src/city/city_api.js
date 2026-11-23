(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const P = I.city || {};
  const RAIL_TOP_Y = P.RAIL_TOP_Y !== undefined ? P.RAIL_TOP_Y : -1.00;

  const _tmpWorldOffset = new THREE.Vector3();
  const _tmpLocalCam = new THREE.Vector3();
  const _chosenLampIdx = [-1, -1, -1];
  const _chosenLampDSq = [Infinity, Infinity, Infinity];
  const _emptyArr = [];
  const _persistentCityMats = new Map();
  const PERSISTENT_MAT_KEYS = new Set(['cityStripeWhite', 'cityStripeYellow', 'citySkylineDistant']);
  let _sharedInvisCollMat = null;
  const _cityStepInProgress = Object.freeze({ done: false });
  const _cityStepDone = Object.freeze({ done: true });
  const _persistentCityLights = [];
  let _warungSprintTimer = 0;

  const CORNER_NOTES_DATA = {
    note_nw_corner: {
      title: 'Log Medis Posko PMI Barat Laut',
      body: 'POSKO DARURAT PMI — SEKTOR BARAT LAUT\n\nAmbulans unit JKT-04 terhenti di jalan kolektor barat saat gelombang panik menyebar dari persimpangan.\n\nSisa pelat pelindung PMI dan tas P3K darurat sudah kami siapkan di meja pemeriksaan utama. Jika masih ada petugas atau warga yang bertahan, ambil perlengkapan tersebut.'
    },
    note_ne_corner: {
      title: 'Manifes Gudang Logistik Utara',
      body: 'PT EKSPEDISI NUSANTARA — POS SEKURITI TIMUR LAUT\n\nPengiriman peti logistik darurat tertahan di dermaga muat utara sebelum gerbang tol ditutup total.\n\nDi balik tumpukan palet di atas dermaga terdapat peti cadangan amunisi penuh dan peluncur berat untuk unit respons cepat. Ramp barat dermaga masih bisa dilalui.'
    },
    note_sw_corner: {
      title: 'Perintah Sekat Konvoi Barat Daya',
      body: 'POS SEKAT MILITER — KORIDOR BARAT DAYA\n\nSemua akses dari jalan kolektor barat daya telah disekat dengan karung pasir dan truk taktis.\n\nCadangan pelat rompi dan dua magasin peluru masih tersimpan di peti amunisi di bawah tenda komando. Tetap waspada terhadap pergerakan dari arah perlintasan sebidang.'
    },
    note_se_corner: {
      title: 'Buku Jaga Poskamling RT/RW & Warung Kopi',
      body: 'POSKAMLING SEKTOR TENGGARA — CATATAN RONDA MALAM\n\nPak Hansip memukul kentongan tiga kali saat listrik padam dan sirine stasiun berbunyi.\n\nWarung Kopi di sebelah masih menyisakan termos kopi panas racikan khusus dan bekal malam di atas meja. Minumlah untuk memulihkan tenaga sebelum kembali ke peron.'
    }
  };

  function evalTrafficBlink(worldX, worldZ, t) {
    return typeof P.evalTrafficSignalBlink === 'function'
      ? P.evalTrafficSignalBlink(worldX, worldZ, t)
      : 1.0;
  }

  const City = {
    rootGroup: null,
    quadrants: null,
    clutterMeshes: [],
    clutterByQuadrant: null,
    cullChunks: [],
    litLampPositions: [],
    trafficSignalPositions: [],
    _lootboxGlows: null,
    _lootboxVisuals: null,
    _streetBeacons: null,
    _perimeterHalos: null,
    _hoveredInteractableId: null,
    _activeObjectiveIds: null,
    _missionPropsState: null,
    cornerHubs: null,
    layoutBounds: null,
    _fieldLogGlints: null,
    _fieldLogPropAssets: null,
    destructibleProps: null,
    _concourseBounds: null,
    _lastCamPos: null,
    _lastRootWorldX: NaN,
    _lastRootWorldY: NaN,
    _lastRootWorldZ: NaN,
    trackGates: [],
    _trackGatesOpen: false,
    disposableGeometries: [],
    disposableMaterials: [],
    disposableTextures: [],
    bvhMeshes: [],
    colliders: [],
    streetLights: [],
    spawnNodes: [],
    interactables: [],
    hydrants: [],
    _matCache: null,
    _timeAccum: 0,
    _lightingFactor: 1.0,
    _isBuilding: false,
    _buildRunner: null,

    _getInvisCollMat: function () {
      if (!_sharedInvisCollMat) {
        _sharedInvisCollMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      }
      return _sharedInvisCollMat;
    },

    _acquirePooledLight: function (slotIdx, targetScene, colorHex, initialInt, distance, decay) {
      let l = _persistentCityLights[slotIdx];
      if (!l) {
        l = new THREE.PointLight(colorHex, 0, distance, decay);
        l.visible = true; // NEVER toggle light.visible!
        l.castShadow = false;
        _persistentCityLights[slotIdx] = l;
      }
      l.color.setHex(colorHex);
      l.distance = distance;
      l.decay = decay;
      l.visible = true;
      l.intensity = initialInt;
      if (targetScene && l.parent !== targetScene) {
        targetScene.add(l);
      }
      return l;
    },

    _getMat: function (key, texKey, opts) {
      if (!this._matCache) this._matCache = new Map();
      const mats = (LRT.Materials && LRT.Materials.mats) || {};
      if (mats[key]) return mats[key];
      const isPersistent = PERSISTENT_MAT_KEYS.has(key);
      if (isPersistent && _persistentCityMats.has(key)) return _persistentCityMats.get(key);
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
      if (isPersistent) {
        _persistentCityMats.set(key, mat);
      } else {
        this._matCache.set(key, mat);
        this.disposableMaterials.push(mat);
      }
      return mat;
    },

    _registerHaloTarget: function (id, targetObj, opts) {
      if (!targetObj || !LRT.Render || typeof LRT.Render.attachPerimeterHalo !== 'function') return null;
      const o = opts || {};
      if (!this._perimeterHalos) this._perimeterHalos = [];
      for (let i = this._perimeterHalos.length - 1; i >= 0; i--) {
        if (this._perimeterHalos[i] && this._perimeterHalos[i].id === id) {
          if (this._perimeterHalos[i].halo && this._perimeterHalos[i].halo !== o.halo && typeof this._perimeterHalos[i].halo.dispose === 'function') {
            this._perimeterHalos[i].halo.dispose();
          }
          this._perimeterHalos.splice(i, 1);
        }
      }
      const used = !!o.used;
      const isObj = !!o.isObjective;
      const halo = o.halo || LRT.Render.attachPerimeterHalo(targetObj, {
        color: o.color !== undefined ? o.color : 0xfacc15,
        hoverColor: o.hoverColor !== undefined ? o.hoverColor : 0xfacc15,
        objectiveColor: o.objectiveColor !== undefined ? o.objectiveColor : 0xfde047,
        thicknessScale: o.thicknessScale !== undefined ? o.thicknessScale : 0.95,
        includeTransparent: o.includeTransparent,
        initialMode: used ? 'off' : (o.initialMode || (isObj ? 'objective' : 'subtle'))
      });
      const rec = {
        id: id,
        halo: halo,
        used: used,
        isObjective: isObj,
        x: o.x !== undefined ? o.x : (targetObj.position ? targetObj.position.x : 0),
        y: o.y !== undefined ? o.y : (targetObj.position ? targetObj.position.y : 0),
        z: o.z !== undefined ? o.z : (targetObj.position ? targetObj.position.z : 0)
      };
      this._perimeterHalos.push(rec);
      return rec;
    },

    setActiveObjectiveIds: function (idsArray) {
      if (!this._activeObjectiveIds) this._activeObjectiveIds = new Set();
      this._activeObjectiveIds.clear();
      if (Array.isArray(idsArray)) {
        for (let i = 0; i < idsArray.length; i++) {
          if (idsArray[i]) this._activeObjectiveIds.add(idsArray[i]);
        }
      }
      if (this._perimeterHalos && this._perimeterHalos.length > 0) {
        for (let i = 0; i < this._perimeterHalos.length; i++) {
          const ph = this._perimeterHalos[i];
          if (!ph) continue;
          const it = this.interactables ? this.interactables.find((x) => x && x.id === ph.id) : null;
          if (it && (it.isMissionProp || it.id === 'city_pln_box')) {
            ph.isObjective = this._activeObjectiveIds.has(ph.id);
          }
        }
      }
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

    _extractModelProto: function (key, targetHeight, filterFn, pivotOverride, protoCacheKey, lodTier) {
      return P.extractModelProto(key, targetHeight, filterFn, pivotOverride, protoCacheKey, lodTier);
    },

    _extractModelLodProtos: function (key, targetHeight, filterFn, pivotOverride, protoCacheKey) {
      return [
        P.extractModelProto(key, targetHeight, filterFn, pivotOverride, protoCacheKey, 0),
        P.extractModelProto(key, targetHeight, filterFn, pivotOverride, protoCacheKey, 1),
        P.extractModelProto(key, targetHeight, filterFn, pivotOverride, protoCacheKey, 2)
      ];
    },

    _emitInstancedProto: function (proto, placements, castShadow, receiveShadow, namePrefix, customGroup) {
      return P.emitInstancedProto(this, proto, placements, castShadow, receiveShadow, namePrefix, customGroup);
    },

    _emitInstancedLodProto: function (protos3, placements, castShadow, receiveShadow, namePrefix, customGroup, isStructural) {
      return P.emitInstancedLodProto(this, protos3, placements, castShadow, receiveShadow, namePrefix, customGroup, isStructural);
    },

    _placeSingleProto: function (proto, x, y, z, ry, scale, parentGroup, castShadow) {
      return P.placeSingleProto(this, proto, x, y, z, ry, scale, parentGroup, castShadow);
    },

    dispose: function () {
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
        if (sl && sl.light) {
          sl.light.intensity = 0;
        }
      }
      if (this.rootGroup) {
        this.rootGroup.traverse((obj) => {
          if (obj && obj.isInstancedMesh && typeof obj.dispose === 'function') {
            obj.dispose();
          }
        });
        if (this.rootGroup.parent) {
          this.rootGroup.parent.remove(this.rootGroup);
        }
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
      this.cullChunks = [];
      this.litLampPositions = [];
      this.trafficSignalPositions = [];
      if (this._perimeterHalos) {
        for (let i = 0; i < this._perimeterHalos.length; i++) {
          const ph = this._perimeterHalos[i];
          if (ph && ph.halo && typeof ph.halo.dispose === 'function') ph.halo.dispose();
        }
      }
      if (this._lootboxVisuals) {
        for (let i = 0; i < this._lootboxVisuals.length; i++) {
          const lv = this._lootboxVisuals[i];
          if (!lv) continue;
          if (lv.halo && typeof lv.halo.dispose === 'function') lv.halo.dispose();
          if (lv.slots) {
            for (let si = 0; si < lv.slots.length; si++) {
              if (lv.slots[si] && lv.slots[si].halo && typeof lv.slots[si].halo.dispose === 'function') {
                lv.slots[si].halo.dispose();
              }
            }
          }
        }
      }
      this._lootboxGlows = null;
      this._lootboxVisuals = null;
      this._streetBeacons = null;
      this._perimeterHalos = null;
      this._hoveredInteractableId = null;
      if (this._activeObjectiveIds) this._activeObjectiveIds.clear();
      if (P.missionProps && typeof P.missionProps.disposeMissionProps === 'function') {
        P.missionProps.disposeMissionProps(this);
      }
      this._missionPropsState = null;
      this._feederMask = null;
      this._kuninganWestBeaconMat = null;
      this._kuninganWestCableMat = null;
      this._kuninganEastCableMat = null;
      this.cornerHubs = null;
      this.layoutBounds = null;
      this._fieldLogGlints = null;
      if (_warungSprintTimer > 0) {
        _warungSprintTimer = 0;
        const pState = LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' ? LRT.PlayerUI.getState() : null;
        if (pState) pState.fastSprint = false;
      }
      this._fieldLogPropAssets = null;
      this.destructibleProps = null;
      this._concourseBounds = null;
      this._lastCamPos = null;
      this._lastRootWorldX = NaN;
      this._lastRootWorldY = NaN;
      this._lastRootWorldZ = NaN;
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
      this._isBuilding = false;
      this._buildRunner = null;
    },

    beginIncrementalBuild: function (arch, rngArg, parentGroup, opts) {
      this.dispose();

      const rng = typeof rngArg === 'function' ? rngArg : P.fallbackRng(4207);
      const o = opts || {};
      this._usedIds = (o.usedIds) ? (o.usedIds instanceof Set ? new Set(o.usedIds) : new Set(o.usedIds)) : new Set();
      this._plnRestored = !!o.plnRestored;
      this._arch = arch;
      this._isBuilding = true;

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
      this.cullChunks = [];
      this.litLampPositions = [];
      this.trafficSignalPositions = [];
      this._lootboxGlows = {};
      this._lootboxVisuals = [];
      this._streetBeacons = {};
      this._perimeterHalos = [];
      this._hoveredInteractableId = null;
      this._fieldLogGlints = [];
      this._fieldLogPropAssets = null;
      this.destructibleProps = [];
      this._concourseBounds = null;
      this._lastCamPos = null;
      this._lastRootWorldX = NaN;
      this._lastRootWorldY = NaN;
      this._lastRootWorldZ = NaN;
      this.trackGates = [];
      this._trackGatesOpen = false;

      if (typeof P.createDistrictBuilder === 'function') {
        this._buildRunner = P.createDistrictBuilder(this, arch, rng, root, o);
      } else {
        P.buildDistrict(this, arch, rng, root, o);
        this._buildRunner = null;
        this._isBuilding = false;
      }

      return this;
    },

    stepIncrementalBuild: function () {
      if (!this._buildRunner) {
        this._isBuilding = false;
        return _cityStepDone;
      }
      const done = !!this._buildRunner.step();
      if (done) {
        this._buildRunner = null;
        this._isBuilding = false;
        if (this.rootGroup) this.rootGroup.updateMatrixWorld(true);
        return _cityStepDone;
      }
      return _cityStepInProgress;
    },

    isIncrementalBuilding: function () {
      return !!this._isBuilding;
    },

    build: function (arch, rngArg, parentGroup, opts) {
      this.beginIncrementalBuild(arch, rngArg, parentGroup, opts);
      while (!this.stepIncrementalBuild().done) {}
      return this;
    },

    setKuninganFeederState: function (side, isOn) {
      if (!this._feederMask) this._feederMask = { west: 0, east: 0 };
      const val = isOn ? 1 : 0;
      if (side === 'west') {
        this._feederMask.west = val;
        if (this._kuninganWestBeaconMat) {
          this._kuninganWestBeaconMat.color.setHex(isOn ? 0x22c55e : 0xef4444);
          this._kuninganWestBeaconMat.emissive.setHex(isOn ? 0x22c55e : 0xef4444);
        }
        if (this._kuninganWestCableMat) {
          this._kuninganWestCableMat.color.setHex(isOn ? 0x22c55e : 0xeab308);
          this._kuninganWestCableMat.emissive.setHex(isOn ? 0x15803d : 0x854d0e);
          this._kuninganWestCableMat.emissiveIntensity = isOn ? 1.15 : 0.45;
        }
      } else if (side === 'east') {
        this._feederMask.east = val;
        if (this._kuninganEastCableMat) {
          this._kuninganEastCableMat.color.setHex(isOn ? 0x22c55e : 0xeab308);
          this._kuninganEastCableMat.emissive.setHex(isOn ? 0x15803d : 0x854d0e);
          this._kuninganEastCableMat.emissiveIntensity = isOn ? 1.15 : 0.45;
        }
      }
      this.setLightingFactor(Math.max(this._lightingFactor, 1.0));
    },

    _getFeederLampScale: function (localX) {
      if (!this._feederMask) return 1.0;
      const isWest = (localX < 0);
      const on = isWest ? !!this._feederMask.west : !!this._feederMask.east;
      return on ? 1.35 : 0.08;
    },

    setLightingFactor: function (factor) {
      const num = Number(factor);
      this._lightingFactor = Number.isFinite(num) ? Math.max(0, num) : 1.0;
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
        if (sl.light._tierDisabled) {
          sl.light.visible = false;
          sl.light.intensity = 0;
          continue;
        }
        const distScale = sl._distScale !== undefined ? sl._distScale : 1.0;
        const feederScale = sl._feederScale !== undefined ? sl._feederScale : 1.0;
        sl.light.visible = true;
        if (sl.kind === 'traffic') {
          const blinkScale = sl._blinkScale !== undefined
            ? sl._blinkScale
            : evalTrafficBlink(sl._worldX, sl._worldZ, this._timeAccum);
          sl._blinkScale = blinkScale;
          sl.light.intensity = sl.baseIntensity * this._lightingFactor * distScale * blinkScale;
        } else {
          sl.light.intensity = sl.baseIntensity * this._lightingFactor * distScale * feederScale;
        }
      }
    },

    setStreetLightIntensity: function (val) {
      return this.setLightingFactor(val);
    },

    setLightingIntensity: function (val) {
      return this.setLightingFactor(val);
    },

    _syncWorldBounds: function () {
      if (!this.rootGroup) return _tmpWorldOffset.set(0, 0, 0);
      this.rootGroup.updateMatrixWorld(false);
      this.rootGroup.getWorldPosition(_tmpWorldOffset);
      if (
        this._lastRootWorldX === _tmpWorldOffset.x &&
        this._lastRootWorldY === _tmpWorldOffset.y &&
        this._lastRootWorldZ === _tmpWorldOffset.z
      ) {
        return _tmpWorldOffset;
      }
      this._lastRootWorldX = _tmpWorldOffset.x;
      this._lastRootWorldY = _tmpWorldOffset.y;
      this._lastRootWorldZ = _tmpWorldOffset.z;

      for (let i = 0; i < this.cullChunks.length; i++) {
        const ch = this.cullChunks[i];
        if (ch.localBox && ch.box) {
          ch.box.copy(ch.localBox).translate(_tmpWorldOffset);
        }
      }
      for (let i = 0; i < this.clutterMeshes.length; i++) {
        const cm = this.clutterMeshes[i];
        if (cm.userData && cm.userData._localBox && cm.userData._worldBox) {
          cm.userData._worldBox.copy(cm.userData._localBox).translate(_tmpWorldOffset);
        }
      }
      return _tmpWorldOffset;
    },

    _repositionPooledLights: function (camPos, suppressLights) {
      if (!this.streetLights || this.streetLights.length === 0 || !camPos || !this.rootGroup) {
        return;
      }
      this.rootGroup.getWorldPosition(_tmpWorldOffset);
      _tmpLocalCam.set(
        camPos.x - _tmpWorldOffset.x,
        camPos.y - _tmpWorldOffset.y,
        camPos.z - _tmpWorldOffset.z
      );

      // Find the 3 closest lit streetlamps to camPos in local space
      const lamps = this.litLampPositions;
      let best0 = -1, bestD0 = Infinity;
      let best1 = -1, bestD1 = Infinity;
      let best2 = -1, bestD2 = Infinity;
      if (lamps && lamps.length > 0) {
        for (let i = 0; i < lamps.length; i++) {
          const lp = lamps[i];
          const dx = lp.x - _tmpLocalCam.x;
          const dy = lp.y - _tmpLocalCam.y;
          const dz = lp.z - _tmpLocalCam.z;
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq < bestD0) {
            bestD2 = bestD1; best2 = best1;
            bestD1 = bestD0; best1 = best0;
            bestD0 = dSq; best0 = i;
          } else if (dSq < bestD1) {
            bestD2 = bestD1; best2 = best1;
            bestD1 = dSq; best1 = i;
          } else if (dSq < bestD2) {
            bestD2 = dSq; best2 = i;
          }
        }
      }
      _chosenLampIdx[0] = best0;
      _chosenLampIdx[1] = best1 >= 0 ? best1 : best0;
      _chosenLampIdx[2] = best2 >= 0 ? best2 : _chosenLampIdx[1];
      _chosenLampDSq[0] = bestD0;
      _chosenLampDSq[1] = best1 >= 0 ? bestD1 : bestD0;
      _chosenLampDSq[2] = best2 >= 0 ? bestD2 : _chosenLampDSq[1];

      // Find the closest traffic signal pole to camPos in local space
      const sigs = this.trafficSignalPositions;
      let bestSig = -1, bestSigDSq = Infinity;
      if (sigs && sigs.length > 0) {
        for (let i = 0; i < sigs.length; i++) {
          const sp = sigs[i];
          const dx = sp.x - _tmpLocalCam.x;
          const dy = sp.y - _tmpLocalCam.y;
          const dz = sp.z - _tmpLocalCam.z;
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq < bestSigDSq) {
            bestSigDSq = dSq;
            bestSig = i;
          }
        }
      }

      let lampSlot = 0;
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
        if (sl.light._tierDisabled) {
          sl.light.visible = false;
          sl.light.intensity = 0;
          continue;
        }
        sl.light.visible = true; // NEVER toggle visible!

        if (sl.kind === 'traffic') {
          if (bestSig >= 0) {
            const sp = sigs[bestSig];
            sl.light.position.set(
              sp.x + _tmpWorldOffset.x,
              sp.y + _tmpWorldOffset.y,
              sp.z + _tmpWorldOffset.z
            );
            sl._worldX = sp.x + _tmpWorldOffset.x;
            sl._worldZ = sp.z + _tmpWorldOffset.z;
            if (suppressLights) {
              sl._distScale = 0.0;
            } else {
              const dist = Math.sqrt(bestSigDSq);
              sl._distScale = dist <= 50 ? 1.0 : (dist >= 88 ? 0.0 : (1.0 - (dist - 50) / 38.0));
            }
            sl._blinkScale = evalTrafficBlink(sl._worldX, sl._worldZ, this._timeAccum);
            sl.light.intensity = sl.baseIntensity * this._lightingFactor * sl._distScale * sl._blinkScale;
          } else {
            sl._distScale = 0.0;
            sl._blinkScale = 0.0;
            sl.light.intensity = 0.0;
          }
          continue;
        }

        const slotIdx = lampSlot % 3;
        lampSlot++;
        const idx = _chosenLampIdx[slotIdx];
        if (idx < 0 || !lamps) continue;
        const lp = lamps[idx];
        sl.light.position.set(
          lp.x + _tmpWorldOffset.x,
          lp.y + _tmpWorldOffset.y,
          lp.z + _tmpWorldOffset.z
        );
        sl.light.updateMatrixWorld(false);
        sl.flicker = !!lp.flicker;
        sl._feederScale = this._getFeederLampScale(lp.x);
        if (suppressLights) {
          sl._distScale = 0.0;
        } else {
          const dist = Math.sqrt(_chosenLampDSq[slotIdx]);
          sl._distScale = dist <= 50 ? 1.0 : (dist >= 88 ? 0.0 : (1.0 - (dist - 50) / 38.0));
        }
        if (!sl.flicker) {
          sl.light.intensity = sl.baseIntensity * this._lightingFactor * sl._distScale * sl._feederScale;
        }
      }
    },

    update: function (dt, t, camPos, camForward, difficultyKey) {
      if (!this.rootGroup || this._isBuilding) return;
      this._timeAccum = t !== undefined ? t : (this._timeAccum + dt);
      if (typeof P.updateTrafficSignalTime === 'function') {
        P.updateTrafficSignalTime(this._timeAccum);
      }
      if (P.missionProps && typeof P.missionProps.updateMissionProps === 'function') {
        P.missionProps.updateMissionProps(this, dt, this._timeAccum, camPos);
      }
      const oz = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
      this._hoveredInteractableId = (camPos && camForward) ? this._findCrosshairHoveredId(camPos, camForward, 8.0) : null;
      if (this._lootboxVisuals && this._lootboxVisuals.length > 0 && typeof P.updateLootboxVisuals === 'function') {
        P.updateLootboxVisuals(this._lootboxVisuals, dt, this._timeAccum, camPos, camForward, difficultyKey, oz, this._hoveredInteractableId);
      }
      if (this._perimeterHalos && this._perimeterHalos.length > 0) {
        const diff = String(difficultyKey || 'medium').toLowerCase();
        for (let i = 0; i < this._perimeterHalos.length; i++) {
          const ph = this._perimeterHalos[i];
          if (!ph || !ph.halo) continue;
          if (ph.used) {
            ph.halo.setMode('off');
            continue;
          }
          let inRange = true;
          if (camPos && diff !== 'easy' && ph.x !== undefined) {
            const dist = Math.hypot(ph.x - camPos.x, (ph.y || 0) - camPos.y, (ph.z + oz) - camPos.z);
            inRange = diff === 'medium' ? dist <= 16.0 : (diff === 'hard' ? dist <= 7.0 : dist <= 3.5);
          }
          if (!inRange && !ph.isObjective) {
            ph.halo.setMode('off');
          } else if (this._hoveredInteractableId && this._hoveredInteractableId === ph.id) {
            ph.halo.setMode('hover');
          } else if (ph.isObjective) {
            ph.halo.setMode('objective');
          } else {
            ph.halo.setMode('subtle');
          }
          ph.halo.update(this._timeAccum);
        }
      }
      if (_warungSprintTimer > 0) {
        const prevT = _warungSprintTimer;
        _warungSprintTimer = Math.max(0, _warungSprintTimer - Math.max(0, dt || 0));
        if (prevT > 0 && _warungSprintTimer === 0) {
          const pState = LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' ? LRT.PlayerUI.getState() : null;
          if (pState) pState.fastSprint = false;
          if (LRT.PlayerUI && typeof LRT.PlayerUI.setNotice === 'function') {
            LRT.PlayerUI.setNotice('Efek Kopi Warung habis — kecepatan lari kembali normal.', '#94a3b8');
          }
        }
      }
      const focusPos = camPos || this._lastCamPos;
      if (focusPos) {
        this._repositionPooledLights(focusPos, this._suppressPooledLights);
      }
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
        if (sl.light._tierDisabled) {
          sl.light.visible = false;
          sl.light.intensity = 0;
          continue;
        }
        const distScale = sl._distScale !== undefined ? sl._distScale : 1.0;
        if (sl.kind === 'traffic') {
          sl._blinkScale = evalTrafficBlink(sl._worldX, sl._worldZ, this._timeAccum);
          sl.light.visible = true;
          sl.light.intensity = sl.baseIntensity * this._lightingFactor * distScale * sl._blinkScale;
          continue;
        }
        if (!sl.flicker) continue;
        // Subtle sodium-vapor streetlamp buzz (NEVER toggles visible!)
        const pulse = 0.85 + 0.15 * Math.sin(this._timeAccum * 17.0 + i * 3.1) * Math.sin(this._timeAccum * 4.3);
        const feederScale = sl._feederScale !== undefined ? sl._feederScale : 1.0;
        sl.light.visible = true;
        sl.light.intensity = sl.baseIntensity * this._lightingFactor * distScale * feederScale * pulse;
      }
    },

    setTrackGatesOpen: function (open) {
      this._trackGatesOpen = !!open;
      for (let i = 0; i < this.trackGates.length; i++) {
        const tg = this.trackGates[i];
        if (tg.gateMesh) {
          tg.gateMesh.position.y = this._trackGatesOpen ? (RAIL_TOP_Y + 6.8) : (RAIL_TOP_Y + 1.4);
          tg.gateMesh.updateMatrixWorld(true);
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

    applyQualityTier: function (tier) {
      const t = tier || {};
      const maxLights = typeof t.maxPointLights === 'number' ? t.maxPointLights : 12;
      const allowCityLights = maxLights > 3;
      if (this.streetLights && this.streetLights.length > 0) {
        for (let i = 0; i < this.streetLights.length; i++) {
          const sl = this.streetLights[i];
          if (sl && sl.light) {
            sl.light._tierDisabled = !allowCityLights;
            sl.light.visible = allowCityLights;
            if (!allowCityLights) sl.light.intensity = 0;
          }
        }
      }
      const propShadow = !!t.propCastShadow;
      if (this.rootGroup) {
        this.rootGroup.traverse((obj) => {
          if (obj && obj.isMesh && obj.userData && obj.userData._origCastShadow) {
            obj.castShadow = propShadow;
          }
        });
      }
    },

    updateVisibility: function (camPos, qualityKey, frustum, playerContext) {
      if (!this.rootGroup || this._isBuilding) return;

      if (camPos) {
        if (!this._lastCamPos) this._lastCamPos = new THREE.Vector3();
        this._lastCamPos.copy(camPos);
      }

      const worldOffset = this._syncWorldBounds();
      const qKey = qualityKey || 'balanced';
      const isPotato = qKey === 'potato';
      const isBalanced = qKey === 'balanced' || qKey === 'low';
      const tierCfg = (LRT.Config && LRT.Config.QUALITY_TIERS && LRT.Config.QUALITY_TIERS[qKey]) || null;

      const bldgMaxDist = (tierCfg && typeof tierCfg.bldgMaxDist === 'number')
        ? tierCfg.bldgMaxDist
        : (isPotato ? 235 : (isBalanced ? 255 : 280));
      let bldgLodDist = (tierCfg && typeof tierCfg.bldgLodDist === 'number')
        ? tierCfg.bldgLodDist
        : (isPotato ? 72 : (isBalanced ? 105 : 145));
      const majorPropMaxDist = (tierCfg && typeof tierCfg.majorPropMaxDist === 'number')
        ? tierCfg.majorPropMaxDist
        : (isPotato ? 145 : (isBalanced ? 175 : 210));
      const clutterMaxDist = (tierCfg && typeof tierCfg.clutterMaxDist === 'number')
        ? tierCfg.clutterMaxDist
        : (isPotato ? 64 : (isBalanced ? 92 : 120));

      const ctx = playerContext || null;
      const trainCruising = !!(ctx && ctx.trainCruising);
      const insideConcourse = !!(ctx && ctx.insideConcourse);

      // Inside concourse: NEVER pop out visible buildings seen through East glass curtain wall or open arches!
      // Instead, gently shift distant sectors to 1-draw-call LOD1 slightly sooner to preserve 60 FPS.
      if (insideConcourse && !trainCruising) {
        let nearOpenPortal = false;
        if (camPos && this._concourseBounds) {
          const cb = this._concourseBounds;
          const lx = camPos.x - worldOffset.x;
          const lz = camPos.z - worldOffset.z;
          const halfPortal = cb.portalHalfW || 6.5;
          if (Math.abs(lx - cb.concMaxX) <= 5.5 && Math.abs(lz - cb.concMidZ) <= halfPortal) {
            nearOpenPortal = true;
          }
        }
        if (!nearOpenPortal) {
          bldgLodDist = Math.max(58, Math.round(bldgLodDist * 0.82));
        }
      }

      this._suppressPooledLights = trainCruising || isPotato;
      if (camPos) {
        this._repositionPooledLights(camPos, this._suppressPooledLights);
      }

      const hasFrustum = !!(frustum && typeof frustum.intersectsBox === 'function');

      // 1. Building & skyline spatial chunks: frustum culling + smooth LOD0 -> LOD1 swap out to fog horizon
      for (let i = 0; i < this.cullChunks.length; i++) {
        const chunk = this.cullChunks[i];
        let vis = true;

        if (trainCruising && chunk.isSkyline) {
          vis = false;
        }
        if (vis && hasFrustum && chunk.box && !frustum.intersectsBox(chunk.box)) {
          vis = false;
        }

        const dist = (camPos && chunk.box) ? chunk.box.distanceToPoint(camPos) : 0;
        const effMaxDist = chunk.isSkyline
          ? Math.max(360, chunk.maxDist || 420)
          : Math.max(bldgMaxDist, chunk.maxDist || bldgMaxDist);
        if (vis && camPos && dist > effMaxDist) {
          vis = false;
        }

        if (!vis) {
          if (chunk.mesh) chunk.mesh.visible = false;
          if (chunk.lodMesh) chunk.lodMesh.visible = false;
        } else if (chunk.lodMesh) {
          const lodThreshold = trainCruising
            ? 45
            : Math.min(bldgLodDist, chunk.lodDist || bldgLodDist);
          const useLod = camPos ? (dist > lodThreshold) : false;
          if (chunk.mesh) chunk.mesh.visible = !useLod;
          chunk.lodMesh.visible = useLod;
        } else if (chunk.mesh) {
          chunk.mesh.visible = true;
        }
      }

      // 2. Instanced props & vehicles: frustum culling + 3-tier distance LOD cascade (no 30m vanishing!)
      for (let i = 0; i < this.clutterMeshes.length; i++) {
        const cm = this.clutterMeshes[i];
        const ud = cm.userData || {};
        const tier = ud._propTier || (ud._alwaysStructural ? 'structural' : 'micro');
        const isStruct = tier === 'structural' || !!ud._alwaysStructural;
        const isMajor = tier === 'major';
        if (trainCruising && !isStruct) {
          cm.visible = false;
          continue;
        }
        const wBox = ud._worldBox;
        if (hasFrustum && wBox && !frustum.intersectsBox(wBox)) {
          cm.visible = false;
          continue;
        }
        const dist = (camPos && wBox) ? wBox.distanceToPoint(camPos) : 0;
        const maxD = isStruct ? bldgMaxDist : (isMajor ? majorPropMaxDist : clutterMaxDist);
        if (camPos && wBox && dist > maxD) {
          cm.visible = false;
          continue;
        }
        if (ud._lodTier !== undefined) {
          const d1Base = ud._lod1Dist || 44;
          const d2Base = ud._lod2Dist || 92;
          let activeTier;
          if (isPotato && !isStruct && !isMajor) {
            activeTier = dist <= 14 ? 1 : 2;
          } else {
            const d1 = isPotato ? d1Base * 0.58 : (isBalanced ? d1Base * 0.85 : d1Base);
            const d2 = isPotato ? d2Base * 0.65 : (isBalanced ? d2Base * 0.88 : d2Base);
            activeTier = dist <= d1 ? 0 : (dist <= d2 ? 1 : 2);
          }
          cm.visible = (ud._lodTier === activeTier);
          continue;
        }
        cm.visible = true;
      }
    },

    getBVHMeshes: function () {
      return this._isBuilding ? _emptyArr : this.bvhMeshes;
    },

    getBVHMesh: function () {
      return this._isBuilding ? null : (this.bvhMeshes[0] || null);
    },

    getRootGroup: function () {
      return this.rootGroup;
    },

    getColliders: function () {
      return this._isBuilding ? _emptyArr : this.colliders;
    },

    getStreetLights: function () {
      return this._isBuilding ? _emptyArr : this.streetLights;
    },

    getLights: function () {
      return this._isBuilding ? _emptyArr : this.streetLights;
    },

    getSpawnNodes: function () {
      return this.spawnNodes;
    },

    getInteractables: function () {
      return this.interactables || [];
    },

    _crateLookupMap: new Map(),

    _syncCrateLookup: function () {
      const m = this._crateLookupMap;
      m.clear();
      if (!this.interactables) return m;
      for (let i = 0; i < this.interactables.length; i++) {
        const it = this.interactables[i];
        if (it && it.type === 'lootbox') m.set(it.id, it);
      }
      return m;
    },

    _findCrosshairHoveredId: function (pos, lookDir, maxDist) {
      if (this._isBuilding || !this.interactables || !pos || !lookDir) return null;
      const limit = maxDist !== undefined ? maxDist : 8.0;
      const oz = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
      const pz = pos.z - oz;
      const crateMap = this._syncCrateLookup();
      let bestId = null;
      let bestPerp = 999;

      for (let i = 0; i < this.interactables.length; i++) {
        const it = this.interactables[i];
        if (!it || it.type === 'bench' || it.used) continue;
        if (it.isLootSlot) {
          const parentCrate = crateMap.get(it.crateId);
          if (!parentCrate || !parentCrate.opened || parentCrate.used || it.taken) continue;
        } else if (it.type === 'lootbox' && it.opened) {
          continue;
        }
        const dx = it.x - pos.x;
        const dy = it.y - pos.y;
        const dz = it.z - pz;
        const proj = dx * lookDir.x + dy * lookDir.y + dz * lookDir.z;
        if (proj < 0.1 || proj > limit) continue;
        const px = dx - proj * lookDir.x;
        const py = dy - proj * lookDir.y;
        const pzErr = dz - proj * lookDir.z;
        const perp = Math.hypot(px, py, pzErr);
        const rad = it.isLootSlot ? 0.24 : 0.56;
        if (perp <= rad && perp < bestPerp) {
          bestPerp = perp;
          bestId = it.id;
        }
      }
      return bestId;
    },

    getInteractableNear: function (pos, lookDir) {
      if (this._isBuilding || !this.interactables || !pos) return null;
      const oz = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
      const pz = pos.z - oz;
      const crateMap = this._syncCrateLookup();
      let best = null;
      let bestScore = -999;
      for (let i = 0; i < this.interactables.length; i++) {
        const it = this.interactables[i];
        if (!it) continue;
        if (it.isLootSlot) {
          const parentCrate = crateMap.get(it.crateId);
          if (!parentCrate || !parentCrate.opened || parentCrate.used || it.taken) continue;
        } else if (it.type === 'lootbox' && it.opened && !it.used) {
          continue;
        }
        const dx = it.x - pos.x;
        const dy = it.y - pos.y;
        const dz = it.z - pz;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 3.0) continue;
        let dot = 1.0;
        if (lookDir && dist > 0.05) {
          dot = (dx * lookDir.x + dy * lookDir.y + dz * lookDir.z) / dist;
        }
        if (it.isLootSlot) {
          if (dot < 0.65) continue;
          const slotScore = dot * 4.5 - dist * 0.35;
          if (slotScore > bestScore) {
            bestScore = slotScore;
            best = it;
          }
          continue;
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
      if (this._fieldLogGlints && this._fieldLogGlints.length) {
        for (let i = 0; i < this._fieldLogGlints.length; i++) {
          const fg = this._fieldLogGlints[i];
          if (fg.id === id) {
            fg.used = true;
            if (fg.mesh) fg.mesh.visible = false;
          }
        }
      }
      if (this._perimeterHalos && this._perimeterHalos.length) {
        for (let i = 0; i < this._perimeterHalos.length; i++) {
          const ph = this._perimeterHalos[i];
          if (ph && ph.id === id) {
            ph.used = true;
            if (ph.halo && typeof ph.halo.setMode === 'function') ph.halo.setMode('off');
          }
        }
      }
    },

    _syncStreetBeacons: function () {
      if (this._streetBeacons) {
        for (const id in this._streetBeacons) {
          const sb = this._streetBeacons[id];
          if (!sb) continue;
          const it = this.interactables ? this.interactables.find((x) => x.id === id) : null;
          const used = !!((it && it.used) || (this._usedIds && this._usedIds.has(id)));
          sb.used = used;
          if (sb.halo && typeof sb.halo.setMode === 'function') {
            sb.halo.setMode(used ? 'off' : 'subtle');
          }
          if (sb.mesh) sb.mesh.visible = !used;
          if (sb.mat) sb.mat.opacity = used ? 0.0 : 0.62;
          if (used) this._markFieldLogGlintUsed(id);
        }
      }
    },

    interactNote: function (id) {
      if (!this.interactables) return { ok: false };
      const it = this.interactables.find((x) => x.id === id);
      if (!it) return { ok: false };
      const note = CORNER_NOTES_DATA[it.id];
      if (!note) return { ok: false };
      if (LRT.Audio && typeof LRT.Audio.play === 'function') {
        LRT.Audio.play('paper_rustle', { gain: 0.72 });
      }
      it.used = true;
      if (it.label && it.label.indexOf('(Sudah Dibaca)') === -1) {
        it.label = it.label + ' (Sudah Dibaca)';
      }
      it.prompt = it.label;
      if (this._usedIds) this._usedIds.add(it.id);
      this._markFieldLogGlintUsed(it.id);
      return {
        ok: true,
        type: 'field_log',
        action: 'field_log',
        logTitle: note.title,
        logBody: note.body,
        message: 'Membaca: ' + note.title
      };
    },

    interact: function (id) {
      if (!this.interactables) return { ok: false };
      const it = this.interactables.find((x) => x.id === id);
      if (!it) return { ok: false };

      if (it.isMissionProp && P.missionProps && typeof P.missionProps.interactMissionProp === 'function') {
        const mRes = P.missionProps.interactMissionProp(this, it);
        if (mRes) return mRes;
      }

      if (it.type === 'field_log' || CORNER_NOTES_DATA[it.id]) {
        return this.interactNote(id);
      }

      if (it.id === 'city_nw_medpost' || it.type === 'corner_medpost') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('crate_open', { gain: 0.80 });
          if (!it.used) LRT.Audio.play('loot_chime', { gain: 0.65 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Kotak Medis Darurat PMI (Sudah Diambil)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._syncStreetBeacons();
        return {
          ok: true,
          type: 'corner_medpost',
          action: 'street_stash',
          heal: fresh ? 25 : 0,
          healAmount: fresh ? 25 : 0,
          armor: fresh ? 35 : 0,
          armorBonus: fresh ? 35 : 0,
          message: fresh ? 'Kotak Medis Darurat PMI: +35 Armor & +25 HP!' : 'Kotak Medis Darurat PMI sudah diambil.'
        };
      }

      if (it.id === 'city_ne_depot' || it.type === 'corner_depot') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('crate_open', { gain: 0.85 });
          if (!it.used) LRT.Audio.play('loot_chime', { gain: 0.65 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Peti Logistik Gudang Utara (Sudah Diambil)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._syncStreetBeacons();
        if (fresh && LRT.Weapons) {
          const prog = typeof LRT.Weapons.getProgressionState === 'function' ? LRT.Weapons.getProgressionState() : null;
          const unlocked = prog && Array.isArray(prog.unlockedWeapons) ? prog.unlockedWeapons : [];
          if (unlocked.indexOf('rpg') === -1 && typeof LRT.Weapons.unlockWeapon === 'function') {
            LRT.Weapons.unlockWeapon('rpg', 3);
          }
          if (typeof LRT.Weapons.addAmmo === 'function') {
            LRT.Weapons.addAmmo('all', 999);
            LRT.Weapons.addAmmo('rpg', 3);
          }
        }
        return {
          ok: true,
          type: 'corner_depot',
          action: 'street_stash',
          ammo: fresh ? { type: 'all', amount: 999 } : null,
          message: fresh ? 'Peti Logistik Gudang Utara: Amunisi Penuh & Heavy Ammo!' : 'Peti Logistik Gudang Utara sudah kosong.'
        };
      }

      if (it.id === 'city_sw_convoy' || it.type === 'corner_convoy') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('crate_open', { gain: 0.82 });
          if (!it.used) LRT.Audio.play('loot_chime', { gain: 0.65 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Peti Amunisi Konvoi Militer (Sudah Diambil)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._syncStreetBeacons();
        return {
          ok: true,
          type: 'corner_convoy',
          action: 'street_stash',
          armor: fresh ? 25 : 0,
          armorBonus: fresh ? 25 : 0,
          ammo: fresh ? { type: 'all', amount: 34 } : null,
          message: fresh ? 'Peti Amunisi Konvoi Militer: +25 Armor & +2 Mag!' : 'Peti Amunisi Konvoi Militer sudah diambil.'
        };
      }

      if (it.id === 'city_se_warung' || it.type === 'corner_warung') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('paper_rustle', { gain: 0.72 });
          if (!it.used) LRT.Audio.play('loot_chime', { gain: 0.62 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Termos Kopi & Bekal Pos Ronda (Sudah Diminum)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._syncStreetBeacons();
        if (fresh) {
          const pState = LRT.PlayerUI && typeof LRT.PlayerUI.getState === 'function' ? LRT.PlayerUI.getState() : null;
          if (pState) pState.fastSprint = true;
          _warungSprintTimer = 45.0;
        }
        return {
          ok: true,
          type: 'corner_warung',
          action: 'street_stash',
          heal: fresh ? 25 : 0,
          healAmount: fresh ? 25 : 0,
          fastSprint: fresh ? 45 : 0,
          message: fresh ? 'Termos Kopi & Bekal Pos Ronda: +25 HP & Fast Sprint 45s aktif!' : 'Termos Kopi & Bekal Pos Ronda sudah habis.'
        };
      }

      if (it.type === 'street_micro_spot') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('crate_open', { gain: 0.72 });
          if (!it.used) LRT.Audio.play('loot_chime', { gain: 0.62 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = it._usedLabel || '[E] Suplai Trotoar (Kosong)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._syncStreetBeacons();
        if (it.id === 'city_apotek_shelf') {
          return {
            ok: true, type: 'street_micro_spot', action: 'street_stash',
            heal: fresh ? 35 : 0, healAmount: fresh ? 35 : 0,
            message: fresh ? 'Paket Medis Apotek K-24: +35 HP!' : 'Paket Medis Apotek K-24 sudah diambil.'
          };
        }
        if (it.id === 'city_atm_cache') {
          return {
            ok: true, type: 'street_micro_spot', action: 'street_stash',
            armor: fresh ? 20 : 0, armorBonus: fresh ? 20 : 0,
            ammo: fresh ? { type: 'all', amount: 24 } : null,
            message: fresh ? 'Tas Satpam ATM Mandiri: +20 Armor & +24 Peluru!' : 'Tas Satpam ATM Mandiri sudah kosong.'
          };
        }
        return {
          ok: true, type: 'street_micro_spot', action: 'street_stash',
          heal: fresh ? 25 : 0, healAmount: fresh ? 25 : 0,
          ammo: fresh ? { type: 'shotgun', amount: 8 } : null,
          message: fresh ? 'Tas P3K Halte TransJakarta: +25 HP & +8 Peluru 12G!' : 'Tas P3K Halte TransJakarta sudah kosong.'
        };
      }

      if (it.type === 'power_box' || it.id === 'city_pln_box') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('electric_box_open', { gain: 0.85 });
          LRT.Audio.play('breaker_throw', { gain: 0.72 });
        }
        this._plnRestored = true;
        if (this._plnBeaconMat) {
          this._plnBeaconMat.color.setHex(0x22c55e);
          this._plnBeaconMat.emissive.setHex(0x22c55e);
        }
        if (this._arch && this._arch.id === 'kuningan') {
          this.setKuninganFeederState('east', true);
        }
        this.setLightingFactor(Math.max(this._lightingFactor, 1.35));
        it.used = true;
        it.label = '[E] Kotak Relai PLN Jalanan (Daya Aktif)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._markFieldLogGlintUsed(it.id);
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
          LRT.Audio.play('paper_rustle', { gain: 0.72 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Gerobak Kopi East Promenade (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._markFieldLogGlintUsed(it.id);
        return {
          ok: true,
          type: 'street_stash',
          action: 'street_stash',
          heal: fresh ? 15 : 0,
          healAmount: fresh ? 15 : 0,
          ammo: fresh ? { type: 'rifle', amount: 45 } : null,
          logTitle: 'Catatan Pedagang Kopi Tepi Jalan',
          logBody: 'Sore ini jalanan mulai kacau, banyak pengendara meninggalkan mobilnya begitu saja di tengah kemacetan.\n\nSaya terpaksa menutup gerobak lebih cepat dan meninggalkan sisa kopi hangat serta kotak perbekalan milik petugas patroli yang tadi sempat mampir. Semoga bermanfaat bagi siapa pun yang lewat.\n\nBudi',
          message: fresh ? 'Gerobak Kopi Promenade: Amunisi Senapan dan Kopi Hangat ditemukan.' : 'Gerobak Kopi sudah digeledah.'
        };
      }

      if (it.id === 'city_convoy_car') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('car_trunk_open', { gain: 0.82 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = 'Mobil Patroli MT Haryono (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._markFieldLogGlintUsed(it.id);
        return {
          ok: true,
          type: 'street_stash',
          action: 'street_stash',
          ammo: fresh ? { type: 'shotgun', amount: 18 } : null,
          logTitle: 'Catatan Regu Patroli Jalan Haryono',
          logBody: 'Jalur tol dalam kota dan persimpangan Cawang sudah tertutup kendaraan yang bertabrakan.\n\nRegu kami diperintahkan naik ke peron stasiun untuk membantu pengamanan di atas. Di dalam bagasi mobil ini masih tersisa beberapa kotak peluru senapan laras pendek, gunakan seperlunya untuk menjaga jarak dari kerumunan.',
          message: fresh ? 'Bagasi Mobil Patroli: Amunisi Shotgun ditemukan.' : 'Bagasi mobil patroli sudah kosong.'
        };
      }

      if (it.id === 'city_pocket_park') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('crate_open', { gain: 0.8 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = 'Peti Taktis Taman Kota (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._markFieldLogGlintUsed(it.id);
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
          logTitle: 'Pesan Regu Logistik Taman Kota',
          logBody: 'Peti perbekalan di sudut taman ini sengaja kami tinggalkan sebelum regu kami bergeser ke arah Setiabudi.\n\nDi dalamnya masih ada obat-obatan darurat dan pelontar roket untuk membuka jalan apabila barikade di Cikoko tertutup rapat.',
          message: fresh ? 'Peti Taktis Taman: Roket, Amunisi Senapan, dan Medkit ditemukan.' : 'Peti taktis taman sudah kosong.'
        };
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
          message: 'Duduk di bangku — tekan [E] atau WASD untuk berdiri'
        };
      }

      if (it.type === 'lootbox' && it.isLootSlot) {
        const vis = this._lootboxVisuals ? this._lootboxVisuals.find((v) => v && v.id === it.crateId) : null;
        const slot = (vis && vis.slots) ? vis.slots[it.slotIdx] : null;
        if (!vis || !vis.opened || !slot || slot.taken || it.taken) {
          return { ok: false };
        }
        slot.taken = true;
        it.taken = true;
        it.used = true;
        if (slot.mesh) slot.mesh.visible = false;
        if (slot.halo && typeof slot.halo.setMode === 'function') slot.halo.setMode('off');
        if (this._usedIds) this._usedIds.add(it.id);

        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          if (slot.itemType === 'weapon_variant' || slot.itemType === 'armor') {
            LRT.Audio.play('loot_chime', { gain: 0.72 });
          } else {
            LRT.Audio.play('ammo_pickup', { gain: 0.72 });
          }
        }

        const allTaken = vis.slots.every((s) => !s || s.taken);
        if (allTaken) {
          vis.used = true;
          const parentIt = this.interactables.find((c) => c && c.id === it.crateId);
          if (parentIt) {
            parentIt.used = true;
            parentIt.label = parentIt._usedLabel || parentIt.label;
            parentIt.prompt = parentIt.label;
          }
          if (this._usedIds) this._usedIds.add(it.crateId);
        }

        if (slot.itemType === 'weapon_variant') {
          return {
            ok: true,
            type: 'lootbox',
            action: 'lootbox_item',
            individualSlot: true,
            skipRandomRoll: true,
            weaponId: slot.weaponId,
            variantId: slot.variantId,
            variantLabel: slot.variantLabel,
            message: 'Senjata Diperoleh: ' + (slot.variantLabel || slot.variantId)
          };
        }
        if (slot.itemType === 'ammo') {
          return {
            ok: true,
            type: 'lootbox',
            action: 'lootbox_item',
            individualSlot: true,
            skipRandomRoll: true,
            ammo: { type: slot.ammoType || 'all', amount: slot.ammoAmount || 30 },
            message: 'Amunisi Diperoleh: +' + (slot.ammoAmount || 30) + ' ' + String(slot.ammoType || 'all').toUpperCase()
          };
        }
        if (slot.itemType === 'armor') {
          return {
            ok: true,
            type: 'lootbox',
            action: 'lootbox_item',
            individualSlot: true,
            skipRandomRoll: true,
            armor: slot.armorAmount || 25,
            armorBonus: slot.armorAmount || 25,
            message: 'Pelat Rompi Diperoleh: +' + (slot.armorAmount || 25) + ' Armor'
          };
        }
        return {
          ok: true,
          type: 'lootbox',
          action: 'lootbox_item',
          individualSlot: true,
          skipRandomRoll: true,
          heal: slot.healAmount || 30,
          healAmount: slot.healAmount || 30,
          message: 'Medkit Diperoleh: +' + (slot.healAmount || 30) + ' HP'
        };
      }

      if (it.type === 'lootbox') {
        const vis = this._lootboxVisuals ? this._lootboxVisuals.find((v) => v && v.id === it.id) : null;
        if (it.used) {
          return {
            ok: true,
            type: 'lootbox',
            action: 'lootbox',
            fresh: false,
            used: true,
            skipRandomRoll: true,
            message: 'Peti taktis jalanan sudah kosong.'
          };
        }
        const riskLuck = it.riskLuck !== undefined ? it.riskLuck : 0.55;
        const isAlley = it.id === 'city_alley_lootbox' || riskLuck >= 0.75;
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('crate_open', { gain: 0.85 });
          if (!it.opened) LRT.Audio.play('loot_chime', { gain: 0.55 });
        }
        if (vis && vis.slots && vis.slots.length > 0) {
          it.opened = true;
          vis.opened = true;
          if (vis.halo && typeof vis.halo.setMode === 'function') vis.halo.setMode('off');
          if (this._usedIds) this._usedIds.add(`${it.id}__opened`);
          if (isAlley && LRT.Enemies && typeof LRT.Enemies.alertAllTo === 'function') {
            LRT.Enemies.alertAllTo({ x: it.x, y: it.y, z: it.z }, 32.0);
          }
          return {
            ok: true,
            type: 'lootbox',
            action: 'crate_open',
            openedOnly: true,
            skipRandomRoll: true,
            fresh: true,
            lurePos: isAlley ? { x: it.x, y: it.y, z: it.z } : null,
            message: 'Peti terbuka — arahkan kursor & tekan [E] untuk mengambil isi!'
          };
        }

        // Fallback if called on legacy non-slot lootbox
        const fresh = !it.used;
        const isWest = it.id === 'city_west_plaza_lootbox';
        it.used = true;
        it.label = it._usedLabel || (isAlley
          ? '[E] Peti Suplai Gang Samping (Kosong)'
          : (isWest ? '[E] Peti Suplai Trotoar Barat (Kosong)' : '[E] Peti Taktis Taman & Busway (Kosong)'));
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        if (vis) {
          vis.used = true;
          if (vis.halo && typeof vis.halo.setMode === 'function') vis.halo.setMode('off');
        }
        if (fresh && isAlley && LRT.Enemies && typeof LRT.Enemies.alertAllTo === 'function') {
          LRT.Enemies.alertAllTo({ x: it.x, y: it.y, z: it.z }, 32.0);
        }
        return {
          ok: true,
          type: 'lootbox',
          action: 'lootbox',
          fresh: fresh,
          riskLuck: riskLuck,
          lurePos: (fresh && isAlley) ? { x: it.x, y: it.y, z: it.z } : null,
          message: fresh
            ? (isAlley ? 'Membuka Peti Suplai Gang Samping (High-Risk)...' : 'Membuka Peti Taktis Taman & Busway...')
            : 'Peti taktis jalanan sudah kosong.'
        };
      }

      return { ok: false };
    },

    getUsedIds: function () {
      return Array.from(this._usedIds || []);
    },

    damageAt: function (worldPos, radius, dmg, isExplosion) {
      if (!this.rootGroup || this._isBuilding || !worldPos) return null;
      const oz = this.rootGroup.position.z || 0;
      const lx = worldPos.x;
      const ly = worldPos.y;
      const lz = worldPos.z - oz;
      const rad = Math.max(0.4, radius || 1.2);
      const events = [];

      // Check fire hydrants for pressurized water-jet burst
      if (this.hydrants && this.hydrants.length > 0) {
        for (let i = 0; i < this.hydrants.length; i++) {
          const h = this.hydrants[i];
          if (h.burst) continue;
          const dx = h.x - lx;
          const dz = h.z - lz;
          if (dx * dx + dz * dz <= (rad + 0.75) * (rad + 0.75)) {
            h.burst = true;
            events.push({ kind: 'hydrant', x: h.x, y: h.y + 0.6, z: h.z + oz });
            if (LRT.Audio && typeof LRT.Audio.play === 'function') {
              LRT.Audio.play('impact_metal', { gain: 0.75, pitchVar: 0.12 });
              LRT.Audio.play('hydrant_spray', { gain: 0.65 });
            }
          }
        }
      }

      // Check street vehicles, stalls, barriers & streetlamps for reactive FX
      if (this.destructibleProps && this.destructibleProps.length > 0) {
        for (let i = 0; i < this.destructibleProps.length; i++) {
          const p = this.destructibleProps[i];
          const hitR = p.radius + (isExplosion ? rad : 0.4);
          const dx = p.x - lx;
          const dz = p.z - lz;
          if (dx * dx + dz * dz <= hitR * hitR && Math.abs(p.y - ly) <= 3.5) {
            p.hp = Math.max(0, p.hp - (dmg || 25));
            const justDamaged = !p.damaged && p.hp <= 55;
            if (justDamaged) p.damaged = true;
            events.push({
              kind: p.kind,
              justDamaged,
              x: p.x,
              y: p.y + 0.5,
              z: p.z + oz
            });
            if (!isExplosion) break;
          }
        }
      }
      return events;
    },

    raycastHydrants: function (origin, dir, maxDist) {
      if (this._isBuilding || !this.hydrants || !origin || !dir) return null;
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
        LRT.Audio.play('impact_metal', { gain: 0.72, pitchVar: 0.1 });
        LRT.Audio.play('hydrant_spray', { gain: 0.75 });
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
