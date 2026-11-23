(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const P = (I.city = I.city || {});

  // Station-specific builders populated in Phases B, C, and D:
  //   Phase B: dukuh_atas (SE fuel run), cawang (NE keycard raid)
  //   Phase C: harjamukti (NW PMI key + strobe), kuningan (West/East street feeders + asphalt cables)
  //   Phase D: cikoko (SW C4 breaching pack + smoke/flare), setiabudi (Street signal relay)
  const STATION_BUILDERS = {
    dukuh_atas: null,
    cawang: null,
    harjamukti: null,
    kuningan: null,
    cikoko: null,
    setiabudi: null
  };

  function ensureMissionState(city, archId) {
    if (!city._missionPropsState) {
      city._missionPropsState = {
        archId: archId || 'dukuh_atas',
        props: [],
        emissivePulses: []
      };
    } else if (archId) {
      city._missionPropsState.archId = archId;
    }
    return city._missionPropsState;
  }

  /**
   * Registers an interactive 3D mission prop inside the active city district.
   * Zero extra PointLights: relies on emissive materials, existing pooled corner lights,
   * and the universal perimeter halo system.
   */
  function registerMissionProp(city, root, spec) {
    if (!city || !root || !spec || !spec.id) return null;
    const state = ensureMissionState(city);
    const used = !!(spec.used || (city._usedIds && city._usedIds.has(spec.id)));

    if (Array.isArray(spec.geometries)) {
      for (let i = 0; i < spec.geometries.length; i++) {
        if (spec.geometries[i]) city.disposableGeometries.push(spec.geometries[i]);
      }
    }
    if (Array.isArray(spec.materials)) {
      for (let i = 0; i < spec.materials.length; i++) {
        if (spec.materials[i]) city.disposableMaterials.push(spec.materials[i]);
      }
    }

    const group = spec.group || null;
    if (group) {
      if (!group.name) group.name = 'MissionProp_' + spec.id;
      if (used && spec.hideWhenUsed !== false) {
        group.visible = false;
      }
      if (group.parent !== root) root.add(group);
      group.updateMatrixWorld(true);
    }

    const px = spec.x !== undefined ? spec.x : (group ? group.position.x : 0);
    const py = spec.y !== undefined ? spec.y : (group ? group.position.y : 0);
    const pz = spec.z !== undefined ? spec.z : (group ? group.position.z : 0);

    let haloRec = null;
    if (group && typeof city._registerHaloTarget === 'function') {
      haloRec = city._registerHaloTarget(spec.id, group, {
        x: px,
        y: py,
        z: pz,
        color: spec.haloColor !== undefined ? spec.haloColor : 0xfacc15,
        hoverColor: spec.hoverColor !== undefined ? spec.hoverColor : 0xfef08a,
        objectiveColor: spec.objectiveColor !== undefined ? spec.objectiveColor : 0xf59e0b,
        thicknessScale: spec.thicknessScale !== undefined ? spec.thicknessScale : 0.96,
        isObjective: spec.isObjective !== false,
        used: used
      });
    }

    const label = used && spec.usedLabel ? spec.usedLabel : (spec.label || spec.prompt || spec.id);
    const interactRec = {
      id: spec.id,
      type: spec.type || 'mission_item',
      isMissionProp: true,
      x: px,
      y: py,
      z: pz,
      label: label,
      prompt: label,
      usedLabel: spec.usedLabel || (label + ' (Diambil)'),
      used: used,
      alwaysShow: !!spec.alwaysShow,
      revealDist: typeof spec.revealDist === 'number' ? spec.revealDist : 20.0,
      keyItemId: spec.keyItemId || null,
      hideWhenUsed: spec.hideWhenUsed !== false,
      sfxKey: spec.sfxKey || 'loot_chime',
      pickupMessage: spec.pickupMessage || null,
      group: group,
      haloRec: haloRec,
      onInteract: typeof spec.onInteract === 'function' ? spec.onInteract : null
    };

    if (!city.interactables) city.interactables = [];
    city.interactables.push(interactRec);
    state.props.push(interactRec);
    return interactRec;
  }

  /**
   * Registers an emissive material pulse updated in updateMissionProps (zero extra PointLights).
   */
  function addEmissivePulse(city, mat, baseIntensity, amp, speed, phase) {
    if (!city || !mat) return null;
    const state = ensureMissionState(city);
    const entry = {
      mat: mat,
      base: typeof baseIntensity === 'number' ? baseIntensity : 0.75,
      amp: typeof amp === 'number' ? amp : 0.55,
      speed: typeof speed === 'number' ? speed : 4.2,
      phase: typeof phase === 'number' ? phase : 0.0,
      active: true
    };
    state.emissivePulses.push(entry);
    return entry;
  }

  /**
   * Builds a single batched static cable/conduit strip along a polyline of { x, y, z } points.
   * Zero per-frame allocations; merges all segments into 1 BufferGeometry.
   */
  function buildAsphaltCableRun(city, root, points, opts) {
    if (!city || !root || !Array.isArray(points) || points.length < 2) return null;
    const o = opts || {};
    const radius = o.width !== undefined ? o.width : 0.09;
    const height = o.height !== undefined ? o.height : 0.045;
    const geos = [];

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = (b.y || 0) - (a.y || 0);
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.05) continue;
      const g = new THREE.BoxGeometry(radius, height, len);
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.asin(Math.max(-1, Math.min(1, dy / len)));
      const mat4 = new THREE.Matrix4();
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      const pos = new THREE.Vector3((a.x + b.x) * 0.5, ((a.y || 0) + (b.y || 0)) * 0.5 + height * 0.5, (a.z + b.z) * 0.5);
      mat4.compose(pos, quat, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(mat4);
      geos.push(g);
    }

    if (geos.length === 0) return null;
    const merged = (window.THREE_UTILS && typeof window.THREE_UTILS.mergeGeometries === 'function')
      ? window.THREE_UTILS.mergeGeometries(geos, false)
      : geos[0];
    if (merged !== geos[0]) {
      for (let i = 0; i < geos.length; i++) geos[i].dispose();
    }
    if (!merged) return null;

    const mat = new THREE.MeshStandardMaterial({
      color: o.color !== undefined ? o.color : 0xeab308,
      emissive: o.emissive !== undefined ? o.emissive : 0x713f12,
      emissiveIntensity: o.emissiveIntensity !== undefined ? o.emissiveIntensity : 0.35,
      roughness: 0.55,
      metalness: 0.15
    });

    city.disposableGeometries.push(merged);
    city.disposableMaterials.push(mat);

    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = o.name || 'MissionAsphaltCable';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    return { mesh, mat };
  }

  function buildStationMissionProps(ctx) {
    if (!ctx || !ctx.city || !ctx.root) return null;
    const archId = (ctx.arch && ctx.arch.id) ? String(ctx.arch.id) : 'dukuh_atas';
    const state = ensureMissionState(ctx.city, archId);
    state.props.length = 0;
    state.emissivePulses.length = 0;

    const builder = STATION_BUILDERS[archId];
    if (typeof builder === 'function') {
      builder(ctx);
    }
    return state;
  }

  function updateMissionProps(city, dt, timeAccum) {
    const state = city && city._missionPropsState;
    if (!state) return;
    const pulses = state.emissivePulses;
    if (!pulses || pulses.length === 0) return;
    const t = timeAccum || 0;
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (!p || !p.active || !p.mat) continue;
      p.mat.emissiveIntensity = p.base + p.amp * (0.5 + 0.5 * Math.sin(t * p.speed + p.phase));
    }
  }

  function interactMissionProp(city, it) {
    if (!city || !it || !it.isMissionProp) return null;
    if (typeof it.onInteract === 'function') {
      return it.onInteract(city, it);
    }
    if (it.used) {
      return { ok: true, type: it.type, fresh: false, message: it.usedLabel || 'Sudah diambil.' };
    }
    it.used = true;
    it.label = it.usedLabel || it.label;
    it.prompt = it.label;
    if (city._usedIds) city._usedIds.add(it.id);
    if (it.group && it.hideWhenUsed) {
      it.group.visible = false;
      it.group.updateMatrixWorld(true);
    }
    if (it.haloRec) {
      it.haloRec.used = true;
      if (it.haloRec.halo && typeof it.haloRec.halo.setMode === 'function') {
        it.haloRec.halo.setMode('off');
      }
    }
    if (LRT.Audio && typeof LRT.Audio.play === 'function' && it.sfxKey) {
      LRT.Audio.play(it.sfxKey, { gain: 0.78 });
    }
    return {
      ok: true,
      type: it.type,
      action: 'mission_item',
      fresh: true,
      keyItemId: it.keyItemId || null,
      message: it.pickupMessage || ('Diperoleh: ' + it.id)
    };
  }

  function disposeMissionProps(city) {
    if (!city) return;
    if (city._missionPropsState) {
      city._missionPropsState.props.length = 0;
      city._missionPropsState.emissivePulses.length = 0;
      city._missionPropsState = null;
    }
  }

  const missionPropsApi = {
    STATION_BUILDERS,
    registerMissionProp,
    addEmissivePulse,
    buildAsphaltCableRun,
    buildStationMissionProps,
    updateMissionProps,
    interactMissionProp,
    disposeMissionProps
  };

  P.missionProps = missionPropsApi;
  LRT.CityMissionProps = missionPropsApi;
})(window.LRT = window.LRT || {});
