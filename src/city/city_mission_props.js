(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const P = (I.city = I.city || {});

  function buildDukuhAtasProps(ctx) {
    const { city, root, cornerHubCoords, layoutBounds } = ctx;
    const SE = cornerHubCoords && cornerHubCoords.SE;
    if (!SE) return;
    const swY = (layoutBounds && typeof layoutBounds.SIDEWALK_Y === 'number') ? layoutBounds.SIDEWALK_Y : -0.82;

    // 3D Red Diesel Jerrycan placed cleanly under the warm warung/pos ronda light at SE corner
    const fx = SE.cx + 0.95;
    const fy = swY;
    const fz = SE.cz - 0.65;
    const grp = new THREE.Group();
    grp.name = 'MissionProp_dukuh_fuel_can';
    grp.position.set(fx, fy, fz);
    grp.rotation.y = 0.35;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x450a0a,
      emissiveIntensity: 0.35,
      roughness: 0.42,
      metalness: 0.32
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.1,
      roughness: 0.30,
      metalness: 0.45
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.48, metalness: 0.72 });

    const bodyGeo = new THREE.BoxGeometry(0.36, 0.48, 0.20);
    const ribAGeo = new THREE.BoxGeometry(0.28, 0.04, 0.22);
    const handleTopGeo = new THREE.BoxGeometry(0.24, 0.045, 0.055);
    const handlePostGeo = new THREE.BoxGeometry(0.045, 0.11, 0.055);
    const spoutGeo = new THREE.CylinderGeometry(0.032, 0.040, 0.14, 10);
    const capGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.045, 10);
    const stripeGeo = new THREE.BoxGeometry(0.37, 0.06, 0.21);

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.24, 0);
    const ribA = new THREE.Mesh(ribAGeo, trimMat);
    ribA.position.set(0, 0.25, 0);
    ribA.rotation.z = 0.65;
    const ribB = new THREE.Mesh(ribAGeo, trimMat);
    ribB.position.set(0, 0.25, 0);
    ribB.rotation.z = -0.65;
    const stripe = new THREE.Mesh(stripeGeo, capMat);
    stripe.position.set(0, 0.41, 0);
    const handleTop = new THREE.Mesh(handleTopGeo, bodyMat);
    handleTop.position.set(-0.04, 0.56, 0);
    const hPost1 = new THREE.Mesh(handlePostGeo, bodyMat);
    hPost1.position.set(-0.14, 0.50, 0);
    const hPost2 = new THREE.Mesh(handlePostGeo, bodyMat);
    hPost2.position.set(0.06, 0.50, 0);
    const spout = new THREE.Mesh(spoutGeo, trimMat);
    spout.position.set(0.13, 0.52, 0);
    spout.rotation.z = -0.45;
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(0.16, 0.58, 0);
    cap.rotation.z = -0.45;

    grp.add(body, ribA, ribB, stripe, handleTop, hPost1, hPost2, spout, cap);
    addEmissivePulse(city, capMat, 0.75, 0.85, 4.4, 0.0);

    registerMissionProp(city, root, {
      id: 'dukuh_fuel_can',
      type: 'mission_item',
      group: grp,
      geometries: [bodyGeo, ribAGeo, handleTopGeo, handlePostGeo, spoutGeo, capGeo, stripeGeo],
      materials: [bodyMat, capMat, trimMat],
      x: fx,
      y: fy + 0.45,
      z: fz,
      label: '[E] Ambil Jerigen Solar Cadangan',
      usedLabel: '[E] Jerigen Solar (Sudah Diambil)',
      keyItemId: 'fuel_can',
      sfxKey: 'pickup_ammo',
      revealDist: 20.0,
      pickupMessage: 'JERIGEN SOLAR DIAMBIL — KEMBALI KE GENERATOR CONCOURSE!'
    });
  }

  function buildCawangProps(ctx) {
    const { city, root, cornerHubCoords, layoutBounds } = ctx;
    const NE = cornerHubCoords && cornerHubCoords.NE;
    if (!NE) return;
    const swY = (layoutBounds && typeof layoutBounds.SIDEWALK_Y === 'number') ? layoutBounds.SIDEWALK_Y : -0.82;

    // 3D KAI Master Bypass Keycard + Emergency VHF Radio on NE Security Booth counter (secX - 1.56, secZ = 98.4)
    const kx = NE.cx + 3.74;
    const ky = swY + 0.84;
    const kz = 98.82;
    const grp = new THREE.Group();
    grp.name = 'MissionProp_cawang_bypass_keycard';
    grp.position.set(kx, ky, kz);
    grp.rotation.y = -0.45;

    const cardMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.0,
      roughness: 0.25,
      metalness: 0.35
    });
    const chipMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xca8a04, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.85 });
    const radioMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.55 });
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.4, roughness: 0.2 });

    const cardGeo = new THREE.BoxGeometry(0.22, 0.014, 0.14);
    const chipGeo = new THREE.BoxGeometry(0.055, 0.018, 0.045);
    const lanyardGeo = new THREE.BoxGeometry(0.28, 0.008, 0.03);
    const radioGeo = new THREE.BoxGeometry(0.16, 0.22, 0.10);
    const antGeo = new THREE.CylinderGeometry(0.008, 0.012, 0.26, 6);
    const ledGeo = new THREE.BoxGeometry(0.04, 0.03, 0.02);

    const card = new THREE.Mesh(cardGeo, cardMat);
    card.position.set(-0.08, 0.012, 0.02);
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.set(-0.12, 0.016, 0.02);
    const lanyard = new THREE.Mesh(lanyardGeo, ledMat);
    lanyard.position.set(0.02, 0.006, 0.09);
    lanyard.rotation.y = 0.42;
    const radio = new THREE.Mesh(radioGeo, radioMat);
    radio.position.set(0.14, 0.11, -0.04);
    const ant = new THREE.Mesh(antGeo, radioMat);
    ant.position.set(0.18, 0.34, -0.04);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.14, 0.17, 0.015);

    grp.add(card, chip, lanyard, radio, ant, led);
    addEmissivePulse(city, cardMat, 0.65, 0.85, 4.8, 0.0);
    addEmissivePulse(city, ledMat, 0.5, 1.3, 8.0, 1.2);

    registerMissionProp(city, root, {
      id: 'cawang_bypass_keycard',
      type: 'mission_item',
      group: grp,
      geometries: [cardGeo, chipGeo, lanyardGeo, radioGeo, antGeo, ledGeo],
      materials: [cardMat, chipMat, radioMat, ledMat],
      x: kx,
      y: ky + 0.18,
      z: kz,
      label: '[E] Ambil Kartu Akses Bypass 750V KAI',
      usedLabel: '[E] Kartu Akses Bypass 750V (Sudah Diambil)',
      keyItemId: 'cawang_keycard',
      sfxKey: 'turnstile_beep',
      revealDist: 20.0,
      pickupMessage: 'KARTU AKSES 750V DIAMBIL — KEMBALI KE KABIN BANGKAI JALUR 4!'
    });
  }

  function buildHarjamuktiProps(ctx) {
    const { city, root, cornerHubCoords, layoutBounds } = ctx;
    const NW = cornerHubCoords && cornerHubCoords.NW;
    if (!NW) return;
    const swY = (layoutBounds && typeof layoutBounds.SIDEWALK_Y === 'number') ? layoutBounds.SIDEWALK_Y : -0.82;

    // 1) Pulsing Red/Blue Emissive Ambulance Roof Strobe Bar (zero extra PointLights!)
    const ambX = NW.cx - 5.2;
    const ambZ = 96.5;
    const strobeGrp = new THREE.Group();
    strobeGrp.name = 'Harja_AmbulanceStrobeBar';
    strobeGrp.position.set(ambX, swY + 2.48, ambZ);
    strobeGrp.rotation.y = -0.18;

    const barBaseGeo = new THREE.BoxGeometry(1.16, 0.08, 0.24);
    const lensGeo = new THREE.BoxGeometry(0.46, 0.12, 0.22);
    const barBaseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 });
    const redStrobeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.8, roughness: 0.2 });
    const blueStrobeMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 1.8, roughness: 0.2 });

    const barBase = new THREE.Mesh(barBaseGeo, barBaseMat);
    const redLens = new THREE.Mesh(lensGeo, redStrobeMat);
    redLens.position.set(-0.30, 0.08, 0);
    const blueLens = new THREE.Mesh(lensGeo, blueStrobeMat);
    blueLens.position.set(0.30, 0.08, 0);
    strobeGrp.add(barBase, redLens, blueLens);
    root.add(strobeGrp);
    strobeGrp.updateMatrixWorld(true);

    city.disposableGeometries.push(barBaseGeo, lensGeo);
    city.disposableMaterials.push(barBaseMat, redStrobeMat, blueStrobeMat);
    addEmissivePulse(city, redStrobeMat, 0.25, 2.2, 9.5, 0.0);
    addEmissivePulse(city, blueStrobeMat, 0.25, 2.2, 9.5, Math.PI);

    // 2) 3D PMI Triage Override Key + Trauma Med-Case at rear bay of NW Ambulance
    const kx = NW.cx - 4.85;
    const ky = swY;
    const kz = 93.25;
    const grp = new THREE.Group();
    grp.name = 'MissionProp_harja_pmi_key';
    grp.position.set(kx, ky, kz);
    grp.rotation.y = 0.22;

    const caseMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42, metalness: 0.12 });
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.65, roughness: 0.3 });
    const keyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.25, roughness: 0.25, metalness: 0.55 });
    const fobMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.65 });

    const crateGeo = new THREE.BoxGeometry(0.46, 0.22, 0.34);
    const crossAGeo = new THREE.BoxGeometry(0.18, 0.02, 0.055);
    const crossBGeo = new THREE.BoxGeometry(0.055, 0.02, 0.18);
    const fobGeo = new THREE.BoxGeometry(0.16, 0.032, 0.11);
    const keyBladeGeo = new THREE.BoxGeometry(0.09, 0.014, 0.032);

    const medCase = new THREE.Mesh(crateGeo, caseMat);
    medCase.position.set(0, 0.11, 0);
    const cA = new THREE.Mesh(crossAGeo, crossMat);
    cA.position.set(-0.08, 0.225, 0);
    const cB = new THREE.Mesh(crossBGeo, crossMat);
    cB.position.set(-0.08, 0.225, 0);
    const fob = new THREE.Mesh(fobGeo, fobMat);
    fob.position.set(0.10, 0.235, 0.04);
    const keyBlade = new THREE.Mesh(keyBladeGeo, keyMat);
    keyBlade.position.set(0.20, 0.238, 0.04);

    grp.add(medCase, cA, cB, fob, keyBlade);
    addEmissivePulse(city, keyMat, 0.85, 1.0, 5.2, 0.0);

    registerMissionProp(city, root, {
      id: 'harja_pmi_key',
      type: 'mission_item',
      group: grp,
      geometries: [crateGeo, crossAGeo, crossBGeo, fobGeo, keyBladeGeo],
      materials: [caseMat, crossMat, keyMat, fobMat],
      x: kx,
      y: ky + 0.38,
      z: kz,
      label: '[E] Ambil Kunci Triage PMI & Medkit Ambulans',
      usedLabel: '[E] Kunci Triage PMI (Sudah Diambil)',
      keyItemId: 'harja_pmi_key',
      sfxKey: 'pickup_medkit',
      revealDist: 20.0,
      onInteract: (c, it) => {
        if (it.used) {
          return { ok: true, type: it.type, fresh: false, message: it.usedLabel };
        }
        it.used = true;
        it.label = it.usedLabel;
        it.prompt = it.usedLabel;
        if (c._usedIds) c._usedIds.add(it.id);
        if (it.group) {
          it.group.visible = false;
          it.group.updateMatrixWorld(true);
        }
        if (it.haloRec) {
          it.haloRec.used = true;
          if (it.haloRec.halo && typeof it.haloRec.halo.setMode === 'function') it.haloRec.halo.setMode('off');
        }
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('pickup_medkit', { gain: 0.82 });
          LRT.Audio.play('loot_chime', { gain: 0.65 });
        }
        return {
          ok: true,
          type: 'mission_item',
          action: 'harja_pmi_key',
          fresh: true,
          keyItemId: 'harja_pmi_key',
          heal: 25,
          healAmount: 25,
          message: 'KUNCI TRIAGE PMI & MEDKIT (+25 HP) DIAMBIL — KEMBALI KE DEPO VAKSIN!'
        };
      }
    });
  }

  function buildKuninganProps(ctx) {
    const { city, root, layoutBounds, usedSet } = ctx;
    if (!layoutBounds) return;
    const swY = typeof layoutBounds.SIDEWALK_Y === 'number' ? layoutBounds.SIDEWALK_Y : -0.82;
    const roadY = typeof layoutBounds.STREET_GROUND_Y === 'number' ? layoutBounds.STREET_GROUND_Y : -1.0;

    const westAlready = !!(usedSet && usedSet.has('kuningan_feeder_west'));
    const eastAlready = !!(usedSet && usedSet.has('city_pln_box'));
    city._feederMask = { west: westAlready ? 1 : 0, east: eastAlready ? 1 : 0 };

    // 1) Feeder A — West Avenue Street Transformer Switchgear Box
    const fx = layoutBounds.westOuterSwMaxX - 1.15;
    const fz = 14.0;
    const grp = new THREE.Group();
    grp.name = 'MissionProp_kuningan_feeder_west';
    grp.position.set(fx, swY, fz);

    const padGeo = new THREE.BoxGeometry(0.95, 0.22, 1.32);
    const bodyGeo = new THREE.BoxGeometry(0.68, 1.48, 1.12);
    const roofGeo = new THREE.BoxGeometry(0.78, 0.10, 1.24);
    const leverGeo = new THREE.BoxGeometry(0.10, 0.34, 0.10);
    const beaconGeo = new THREE.BoxGeometry(0.20, 0.16, 0.32);

    const padMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, metalness: 0.08 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.52, metalness: 0.62 });
    const leverMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.38, metalness: 0.3 });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: westAlready ? 0x22c55e : 0xef4444,
      emissive: westAlready ? 0x22c55e : 0xef4444,
      emissiveIntensity: 1.5,
      roughness: 0.25
    });

    const padM = new THREE.Mesh(padGeo, padMat);
    padM.position.set(0, 0.11, 0);
    const bodyM = new THREE.Mesh(bodyGeo, bodyMat);
    bodyM.position.set(0, 0.96, 0);
    const roofM = new THREE.Mesh(roofGeo, bodyMat);
    roofM.position.set(0, 1.74, 0);
    const leverM = new THREE.Mesh(leverGeo, leverMat);
    leverM.position.set(0.36, 1.08, 0.24);
    const beaconM = new THREE.Mesh(beaconGeo, beaconMat);
    beaconM.position.set(0, 1.88, 0);
    grp.add(padM, bodyM, roofM, leverM, beaconM);

    city._addCollider(fx - 0.50, swY, fz - 0.68, fx + 0.50, swY + 1.85, fz + 0.68, 'metal');
    city._kuninganWestBeaconMat = beaconMat;

    // 2) Two batched static insulated yellow power cables snaking out from station exits across the asphalt
    const westCable = buildAsphaltCableRun(city, root, [
      { x: layoutBounds.westInnerSwMaxX - 0.4, y: swY, z: 14.0 },
      { x: layoutBounds.westInnerSwMinX, y: swY, z: 14.0 },
      { x: layoutBounds.westRoadMaxX, y: roadY, z: 14.0 },
      { x: layoutBounds.westRoadMinX, y: roadY, z: 14.0 },
      { x: fx + 0.42, y: swY, z: fz }
    ], {
      name: 'KuninganFeederCable_West',
      color: westAlready ? 0x22c55e : 0xeab308,
      emissive: westAlready ? 0x15803d : 0x854d0e,
      emissiveIntensity: westAlready ? 1.1 : 0.45
    });
    city._kuninganWestCableMat = westCable ? westCable.mat : null;

    const plnEastX = layoutBounds.eastOuterSwMinX + 1.0;
    const plnEastZ = -10.5;
    const eastCable = buildAsphaltCableRun(city, root, [
      { x: layoutBounds.eastInnerSwMinX + 0.4, y: swY, z: 14.0 },
      { x: layoutBounds.eastInnerSwMaxX, y: swY, z: 14.0 },
      { x: layoutBounds.eastInnerSwMaxX, y: swY, z: plnEastZ },
      { x: layoutBounds.eastRoadMinX, y: roadY, z: plnEastZ },
      { x: layoutBounds.eastRoadMaxX, y: roadY, z: plnEastZ },
      { x: plnEastX - 0.42, y: swY, z: plnEastZ }
    ], {
      name: 'KuninganFeederCable_East',
      color: eastAlready ? 0x22c55e : 0xeab308,
      emissive: eastAlready ? 0x15803d : 0x854d0e,
      emissiveIntensity: eastAlready ? 1.1 : 0.45
    });
    city._kuninganEastCableMat = eastCable ? eastCable.mat : null;

    registerMissionProp(city, root, {
      id: 'kuningan_feeder_west',
      type: 'feeder_switch',
      group: grp,
      geometries: [padGeo, bodyGeo, roofGeo, leverGeo, beaconGeo],
      materials: [padMat, bodyMat, leverMat, beaconMat],
      x: fx + 0.38,
      y: swY + 1.15,
      z: fz,
      hideWhenUsed: false,
      label: westAlready ? '[E] Feeder Jalan Barat (Aktif)' : '[E] Nyalakan Feeder Listrik Jalan Barat',
      usedLabel: '[E] Feeder Jalan Barat (Aktif)',
      revealDist: 20.0,
      onInteract: (c, it) => {
        if (it.used) {
          return { ok: true, type: 'feeder_switch', action: 'kuningan_feeder_west', fresh: false, message: 'Feeder Jalan Barat sudah aktif.' };
        }
        it.used = true;
        it.label = it.usedLabel;
        it.prompt = it.usedLabel;
        if (c._usedIds) c._usedIds.add(it.id);
        if (it.haloRec) {
          it.haloRec.used = true;
          if (it.haloRec.halo && typeof it.haloRec.halo.setMode === 'function') it.haloRec.halo.setMode('off');
        }
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('electric_box_open', { gain: 0.82 });
          LRT.Audio.play('breaker_throw', { gain: 0.85 });
        }
        if (typeof c.setKuninganFeederState === 'function') {
          c.setKuninganFeederState('west', true);
        }
        return {
          ok: true,
          type: 'feeder_switch',
          action: 'kuningan_feeder_west',
          fresh: true,
          lurePos: { x: it.x, y: it.y, z: it.z },
          message: 'FEEDER BARAT AKTIF — LAMPU JALAN BARAT MENYALA!'
        };
      }
    });
  }

  function buildCikokoProps(ctx) {
    const { city, root, cornerHubCoords, layoutBounds } = ctx;
    const SW = cornerHubCoords && cornerHubCoords.SW;
    if (!SW) return;
    const swY = (layoutBounds && typeof layoutBounds.SIDEWALK_Y === 'number') ? layoutBounds.SIDEWALK_Y : -0.82;

    // 1) Flickering Red Road Flare + Rising Dark Smoke Column above SW Military Truck (zero extra PointLights!)
    const trkX = SW.cx - 4.8;
    const trkZ = -101.0;
    const beaconGrp = new THREE.Group();
    beaconGrp.name = 'Cikoko_SW_ConvoySmokeAndFlare';
    beaconGrp.position.set(trkX, swY, trkZ);

    const flareBodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.28, 8);
    const flareTipGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const smokeGeo = new THREE.DodecahedronGeometry(1.15, 0);
    const flareBodyMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 });
    const flareGlowMat = new THREE.MeshStandardMaterial({
      color: 0xff3b1f,
      emissive: 0xff2a00,
      emissiveIntensity: 2.2,
      roughness: 0.15
    });
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.96,
      metalness: 0.0,
      transparent: true,
      opacity: 0.46,
      depthWrite: false
    });

    const flareBody = new THREE.Mesh(flareBodyGeo, flareBodyMat);
    flareBody.position.set(2.35, 0.04, 3.10);
    flareBody.rotation.z = Math.PI * 0.46;
    const flareTip = new THREE.Mesh(flareTipGeo, flareGlowMat);
    flareTip.position.set(2.50, 0.06, 3.10);
    beaconGrp.add(flareBody, flareTip);

    // Static rising smoke column above the military truck hood (visible as a landmark across the boulevard)
    const smokePuffs = [
      [0.2, 3.2, 1.4, 0.9],
      [-0.3, 5.4, 1.8, 1.25],
      [0.4, 8.0, 2.2, 1.55],
      [-0.2, 11.0, 2.5, 1.85],
      [0.3, 14.2, 2.8, 2.1]
    ];
    for (let i = 0; i < smokePuffs.length; i++) {
      const sp = smokePuffs[i];
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      puff.position.set(sp[0], sp[1], sp[2]);
      puff.scale.setScalar(sp[3]);
      puff.rotation.set(i * 0.7, i * 1.1, i * 0.4);
      beaconGrp.add(puff);
    }
    root.add(beaconGrp);
    beaconGrp.updateMatrixWorld(true);
    city.disposableGeometries.push(flareBodyGeo, flareTipGeo, smokeGeo);
    city.disposableMaterials.push(flareBodyMat, flareGlowMat, smokeMat);
    addEmissivePulse(city, flareGlowMat, 1.2, 1.6, 11.5, 0.0);

    // 2) 3D Military C4 Breaching Pack + RPG-7 Ordnance Crate beside SW Military Truck
    const cx = SW.cx - 2.35;
    const cy = swY;
    const cz = -98.1;
    const grp = new THREE.Group();
    grp.name = 'MissionProp_cikoko_c4_charge';
    grp.position.set(cx, cy, cz);
    grp.rotation.y = 0.42;

    const bagMat = new THREE.MeshStandardMaterial({ color: 0x3f4e36, roughness: 0.72, metalness: 0.15 });
    const brickMat = new THREE.MeshStandardMaterial({ color: 0xd6c7a1, roughness: 0.68, metalness: 0.05 });
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.65 });
    const c4LedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.6, roughness: 0.2 });

    const caseGeo = new THREE.BoxGeometry(0.56, 0.24, 0.36);
    const brickGeo = new THREE.BoxGeometry(0.18, 0.075, 0.12);
    const timerGeo = new THREE.BoxGeometry(0.10, 0.04, 0.08);
    const ledGeo = new THREE.BoxGeometry(0.035, 0.025, 0.035);

    const bag = new THREE.Mesh(caseGeo, bagMat);
    bag.position.set(0, 0.12, 0);
    const b1 = new THREE.Mesh(brickGeo, brickMat);
    b1.position.set(-0.11, 0.275, 0.02);
    const b2 = new THREE.Mesh(brickGeo, brickMat);
    b2.position.set(0.11, 0.275, -0.02);
    const timerBox = new THREE.Mesh(timerGeo, wireMat);
    timerBox.position.set(0, 0.32, 0.0);
    const c4Led = new THREE.Mesh(ledGeo, c4LedMat);
    c4Led.position.set(0, 0.345, 0.0);
    grp.add(bag, b1, b2, timerBox, c4Led);
    addEmissivePulse(city, c4LedMat, 0.6, 1.6, 7.5, 0.5);

    registerMissionProp(city, root, {
      id: 'cikoko_c4_charge',
      type: 'mission_item',
      group: grp,
      geometries: [caseGeo, brickGeo, timerGeo, ledGeo],
      materials: [bagMat, brickMat, wireMat, c4LedMat],
      x: cx,
      y: cy + 0.38,
      z: cz,
      label: '[E] Ambil Muatan C4 & Peluncur RPG-7 Konvoi TNI',
      usedLabel: '[E] Tas Peledak C4 & RPG-7 (Sudah Diambil)',
      keyItemId: 'c4_charge',
      sfxKey: 'crate_open',
      revealDist: 20.0,
      pickupMessage: 'C4 & RPG-7 DIPEROLEH — PASANG C4 [E] ATAU TEMBAK ROKET KE BARIKADE TOL!'
    });
  }

  function buildSetiabudiProps(ctx) {
    const { city, root, layoutBounds, usedSet } = ctx;
    if (!layoutBounds) return;
    const swY = typeof layoutBounds.SIDEWALK_Y === 'number' ? layoutBounds.SIDEWALK_Y : -0.82;
    const used = !!(usedSet && usedSet.has('setiabudi_relay_street'));

    // Zone 1 Street Signal Relay on East Rasuna Said Boulevard outer sidewalk
    const rx = layoutBounds.eastOuterSwMinX + 1.35;
    const rz = -34.0;
    const grp = new THREE.Group();
    grp.name = 'MissionProp_setiabudi_relay_street';
    grp.position.set(rx, swY, rz);

    const cabMat = new THREE.MeshStandardMaterial({ color: 0x26313f, roughness: 0.45, metalness: 0.72 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.32, metalness: 0.85 });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: used ? 0x22c55e : 0xef4444,
      emissive: used ? 0x22c55e : 0xef4444,
      emissiveIntensity: 1.7,
      roughness: 0.2
    });

    const baseGeo = new THREE.BoxGeometry(0.76, 0.16, 0.64);
    const bodyGeo = new THREE.BoxGeometry(0.64, 1.32, 0.52);
    const mastGeo = new THREE.CylinderGeometry(0.035, 0.05, 2.2, 8);
    const dishGeo = new THREE.CylinderGeometry(0.28, 0.08, 0.14, 10);
    const beaconGeo = new THREE.SphereGeometry(0.11, 10, 8);

    const baseM = new THREE.Mesh(baseGeo, trimMat);
    baseM.position.set(0, 0.08, 0);
    const bodyM = new THREE.Mesh(bodyGeo, cabMat);
    bodyM.position.set(0, 0.82, 0);
    const mastM = new THREE.Mesh(mastGeo, trimMat);
    mastM.position.set(0, 2.55, 0);
    const dishM = new THREE.Mesh(dishGeo, trimMat);
    dishM.position.set(-0.18, 3.15, 0);
    dishM.rotation.z = Math.PI * 0.42;
    const beaconM = new THREE.Mesh(beaconGeo, beaconMat);
    beaconM.position.set(0, 3.72, 0);
    grp.add(baseM, bodyM, mastM, dishM, beaconM);

    city._addCollider(rx - 0.42, swY, rz - 0.36, rx + 0.42, swY + 1.65, rz + 0.36, 'metal');
    const pulseEntry = addEmissivePulse(city, beaconMat, used ? 1.2 : 0.7, used ? 0.25 : 1.4, used ? 2.0 : 6.2, 0.0);

    registerMissionProp(city, root, {
      id: 'setiabudi_relay_street',
      type: 'setiabudi_relay',
      group: grp,
      geometries: [baseGeo, bodyGeo, mastGeo, dishGeo, beaconGeo],
      materials: [cabMat, trimMat, beaconMat],
      x: rx - 0.36,
      y: swY + 1.15,
      z: rz,
      hideWhenUsed: false,
      label: used ? '[E] Relai Sinyal Jalan Rasuna Said (Terhubung)' : '[E] Aktifkan Relai Sinyal Jalanan (Zona 1)',
      usedLabel: '[E] Relai Sinyal Jalan Rasuna Said (Terhubung)',
      revealDist: 20.0,
      onInteract: (c, it) => {
        if (it.used) {
          return { ok: true, type: 'setiabudi_relay', action: 'setiabudi_relay_street', fresh: false, message: 'Relai Sinyal Jalanan sudah terhubung.' };
        }
        it.used = true;
        it.label = it.usedLabel;
        it.prompt = it.usedLabel;
        if (c._usedIds) c._usedIds.add(it.id);
        beaconMat.color.setHex(0x22c55e);
        beaconMat.emissive.setHex(0x22c55e);
        if (pulseEntry) {
          pulseEntry.base = 1.2;
          pulseEntry.amp = 0.25;
          pulseEntry.speed = 2.0;
        }
        if (it.haloRec) {
          it.haloRec.used = true;
          if (it.haloRec.halo && typeof it.haloRec.halo.setMode === 'function') it.haloRec.halo.setMode('off');
        }
        if (LRT.Audio && typeof LRT.Audio.play === 'function') {
          LRT.Audio.play('breaker_throw', { gain: 0.85 });
          LRT.Audio.play('turnstile_beep', { gain: 0.75 });
        }
        return {
          ok: true,
          type: 'setiabudi_relay',
          action: 'setiabudi_relay_street',
          fresh: true,
          lurePos: { x: it.x, y: it.y, z: it.z },
          message: 'RELAI JALAN RASUNA SAID TERHUBUNG — LANJUTKAN KE JPO & PERON!'
        };
      }
    });
  }

  // Station-specific builders:
  //   Phase B: dukuh_atas (SE fuel run), cawang (NE keycard raid)
  //   Phase C: harjamukti (NW PMI key + strobe), kuningan (West/East street feeders + asphalt cables)
  //   Phase D: cikoko (SW C4 breaching pack + smoke/flare), setiabudi (Street signal relay)
  const STATION_BUILDERS = {
    dukuh_atas: buildDukuhAtasProps,
    cawang: buildCawangProps,
    harjamukti: buildHarjamuktiProps,
    kuningan: buildKuninganProps,
    cikoko: buildCikokoProps,
    setiabudi: buildSetiabudiProps
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
