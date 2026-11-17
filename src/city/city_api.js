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

    _extractModelProto: function (key, targetHeight, filterFn, pivotOverride, protoCacheKey) {
      return P.extractModelProto(key, targetHeight, filterFn, pivotOverride, protoCacheKey);
    },

    _emitInstancedProto: function (proto, placements, castShadow, receiveShadow, namePrefix, customGroup) {
      return P.emitInstancedProto(this, proto, placements, castShadow, receiveShadow, namePrefix, customGroup);
    },

    _placeSingleProto: function (proto, x, y, z, ry, scale, parentGroup, castShadow) {
      return P.placeSingleProto(this, proto, x, y, z, ry, scale, parentGroup, castShadow);
    },

    dispose: function () {
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
        if (sl && sl.light) {
          sl.light.visible = true; // NEVER toggle light.visible!
          sl.light.intensity = 0;
        }
      }
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
      this.cullChunks = [];
      this.litLampPositions = [];
      this.trafficSignalPositions = [];
      this._lootboxGlows = null;
      this._lootboxVisuals = null;
      this._fieldLogGlints = null;
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

    setLightingFactor: function (factor) {
      const num = Number(factor);
      this._lightingFactor = Number.isFinite(num) ? Math.max(0, num) : 1.0;
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
        const distScale = sl._distScale !== undefined ? sl._distScale : 1.0;
        sl.light.visible = true;
        if (sl.kind === 'traffic') {
          const blinkScale = sl._blinkScale !== undefined
            ? sl._blinkScale
            : evalTrafficBlink(sl._worldX, sl._worldZ, this._timeAccum);
          sl._blinkScale = blinkScale;
          sl.light.intensity = sl.baseIntensity * this._lightingFactor * distScale * blinkScale;
        } else {
          sl.light.intensity = sl.baseIntensity * this._lightingFactor * distScale;
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
        sl.flicker = !!lp.flicker;
        if (suppressLights) {
          sl._distScale = 0.0;
        } else {
          const dist = Math.sqrt(_chosenLampDSq[slotIdx]);
          sl._distScale = dist <= 50 ? 1.0 : (dist >= 88 ? 0.0 : (1.0 - (dist - 50) / 38.0));
        }
        if (!sl.flicker) {
          sl.light.intensity = sl.baseIntensity * this._lightingFactor * sl._distScale;
        }
      }
    },

    update: function (dt, t, camPos, camForward, difficultyKey) {
      if (!this.rootGroup || this._isBuilding) return;
      this._timeAccum = t !== undefined ? t : (this._timeAccum + dt);
      if (typeof P.updateTrafficSignalTime === 'function') {
        P.updateTrafficSignalTime(this._timeAccum);
      }
      if (this._lootboxVisuals && this._lootboxVisuals.length > 0 && typeof P.updateLootboxVisuals === 'function') {
        const oz = this.rootGroup ? (this.rootGroup.position.z || 0) : 0;
        P.updateLootboxVisuals(this._lootboxVisuals, dt, this._timeAccum, camPos, camForward, difficultyKey, oz);
      }
      if (this._fieldLogGlints && this._fieldLogGlints.length > 0) {
        for (let i = 0; i < this._fieldLogGlints.length; i++) {
          const fg = this._fieldLogGlints[i];
          if (fg.used || !fg.mesh || !fg.mesh.visible) continue;
          if (fg.mat) fg.mat.opacity = 0.22 + 0.14 * Math.sin(this._timeAccum * 2.8 + i * 1.1);
        }
      }
      const focusPos = camPos || this._lastCamPos;
      if (focusPos) {
        this._repositionPooledLights(focusPos, this._suppressPooledLights);
      }
      for (let i = 0; i < this.streetLights.length; i++) {
        const sl = this.streetLights[i];
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
        sl.light.visible = true;
        sl.light.intensity = sl.baseIntensity * this._lightingFactor * distScale * pulse;
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

    updateVisibility: function (camPos, qualityKey, frustum, playerContext) {
      if (!this.rootGroup || this._isBuilding) return;

      if (camPos) {
        if (!this._lastCamPos) this._lastCamPos = new THREE.Vector3();
        this._lastCamPos.copy(camPos);
      }

      const worldOffset = this._syncWorldBounds();
      const qKey = qualityKey || 'balanced';
      const isPotato = qKey === 'potato';
      const isBalanced = qKey === 'balanced';

      let bldgMaxDist = isPotato ? 95 : (isBalanced ? 105 : 160);
      const clutterMaxDist = isPotato ? 0 : (isBalanced ? 45 : 75);

      const ctx = playerContext || null;
      const trainCruising = !!(ctx && ctx.trainCruising);
      const insideConcourse = !!(ctx && ctx.insideConcourse);

      // Deep enclosed concourse occlusion: hide far outer blocks > 75m when away from open street portals
      if (insideConcourse && !trainCruising) {
        let nearOpenPortal = false;
        if (camPos && this._concourseBounds) {
          const cb = this._concourseBounds;
          const lx = camPos.x - worldOffset.x;
          const lz = camPos.z - worldOffset.z;
          const halfPortal = cb.portalHalfW || 5.5;
          if (Math.abs(lx - cb.concMaxX) <= 4.0 && Math.abs(lz - cb.concMidZ) <= halfPortal) {
            nearOpenPortal = true;
          }
        }
        if (!nearOpenPortal) {
          bldgMaxDist = Math.min(bldgMaxDist, 75);
        }
      }

      this._suppressPooledLights = trainCruising || isPotato;
      if (camPos) {
        this._repositionPooledLights(camPos, this._suppressPooledLights);
      }

      const hasFrustum = !!(frustum && typeof frustum.intersectsBox === 'function');

      // 1. Cull building/skyline spatial chunks (FOV + distance + concourse occlusion + trainCruising + LOD1 swap)
      for (let i = 0; i < this.cullChunks.length; i++) {
        const chunk = this.cullChunks[i];
        let vis = true;

        if (trainCruising && (chunk.isFar || chunk.isSkyline)) {
          vis = false;
        }
        if (vis && hasFrustum && chunk.box && !frustum.intersectsBox(chunk.box)) {
          vis = false;
        }

        const dist = (camPos && chunk.box) ? chunk.box.distanceToPoint(camPos) : 0;
        const effMaxDist = Math.min(bldgMaxDist, chunk.maxDist || bldgMaxDist);
        if (vis && camPos && dist > effMaxDist) {
          vis = false;
        }

        if (!vis) {
          if (chunk.mesh) chunk.mesh.visible = false;
          if (chunk.lodMesh) chunk.lodMesh.visible = false;
        } else if (chunk.lodMesh) {
          const useLod = camPos ? (dist > (chunk.lodDist || 80)) : false;
          if (chunk.mesh) chunk.mesh.visible = !useLod;
          chunk.lodMesh.visible = useLod;
        } else if (chunk.mesh) {
          chunk.mesh.visible = true;
        }
      }

      // 2. Cull street clutter InstancedMeshes (FOV + distance + potato/trainCruising)
      for (let i = 0; i < this.clutterMeshes.length; i++) {
        const cm = this.clutterMeshes[i];
        if (isPotato || trainCruising) {
          cm.visible = false;
          continue;
        }
        const wBox = cm.userData && cm.userData._worldBox;
        if (hasFrustum && wBox && !frustum.intersectsBox(wBox)) {
          cm.visible = false;
          continue;
        }
        if (camPos && wBox && wBox.distanceToPoint(camPos) > clutterMaxDist) {
          cm.visible = false;
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

    getInteractableNear: function (pos, lookDir) {
      if (this._isBuilding || !this.interactables || !pos) return null;
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
      if (!this.interactables) return { ok: false };
      const it = this.interactables.find((x) => x.id === id);
      if (!it) return { ok: false };

      if (it.type === 'power_box' || it.id === 'city_pln_box') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('electric_box_open', { gain: 0.85 });
          LRT.Audio.play('breaker_throw', { gain: 0.72 });
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
          logTitle: "MEMO KASIR ROTI'O & KOPI — RESEP ANTI-PANIK",
          logBody: "Jumat, 16 Nov, 16:30 WIB. Di luar orang-orang mulai teriak dan mata mereka memerah aneh, tapi aroma kopi dan mentega vanila kita bikin suasana tetap tenang. Stok masih cukup sampai Senin. Jakarta udah sering banjir dan demo, masa kalah sama jamur? — Mas Budi",
          message: fresh ? 'Gerobak Kopi Promenade: +45 Amunisi Senapan & +15 HP Kopi Hangat!' : 'Gerobak Kopi East Promenade sudah digeledah.'
        };
      }

      if (it.id === 'city_convoy_car') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('car_trunk_open', { gain: 0.82 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Mobil Patroli TNI MT Haryono (Sudah Digeledah)';
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        this._markFieldLogGlintUsed(it.id);
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
          LRT.Audio.play('crate_open', { gain: 0.8 });
        }
        const fresh = !it.used;
        it.used = true;
        it.label = '[E] Peti Taktis Taman East Pocket (Sudah Digeledah)';
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
          logTitle: 'CATATAN LOGISTIK TAMAN KOTA — MAS BUDI',
          logBody: 'Peti darurat ditinggalkan oleh regu pengawal logistik sebelum mereka mundur ke arah Setiabudi. Terdapat satu roket RPG cadangan dan amunisi kaliber 5.56mm. Jika situasi memburuk, gunakan roket untuk menghancurkan barikade atau kawanan Brute!',
          message: fresh ? 'Peti Taktis Taman: +1 Roket RPG, +30 Amunisi Senapan, dan Medkit +25 HP!' : 'Peti taktis taman sudah kosong.'
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

      if (it.type === 'lootbox') {
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('crate_open', { gain: 0.85 });
          if (!it.used) LRT.Audio.play('loot_chime', { gain: 0.65 });
        }
        const fresh = !it.used;
        const riskLuck = it.riskLuck !== undefined ? it.riskLuck : 0.55;
        const isAlley = it.id === 'city_alley_lootbox' || riskLuck >= 0.75;
        const isWest = it.id === 'city_west_plaza_lootbox';
        it.used = true;
        it.label = isAlley
          ? '[E] Peti Suplai Gang Samping (Sudah Diambil)'
          : (isWest ? '[E] Peti Suplai Trotoar Barat (Sudah Diambil)' : '[E] Peti Taktis Taman & Busway (Sudah Diambil)');
        it.prompt = it.label;
        if (this._usedIds) this._usedIds.add(it.id);
        if (this._lootboxGlows && this._lootboxGlows[it.id]) {
          this._lootboxGlows[it.id].visible = false;
        }
        if (this._lootboxVisuals) {
          for (let i = 0; i < this._lootboxVisuals.length; i++) {
            if (this._lootboxVisuals[i].id === it.id) {
              this._lootboxVisuals[i].used = true;
            }
          }
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
