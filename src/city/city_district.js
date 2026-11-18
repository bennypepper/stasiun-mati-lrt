(function () {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const P = I.city || {};

  function placeCityFieldLogProp(city, root, id, x, y, z, ry, used) {
    if (!root) return;
    if (!city._fieldLogPropAssets) {
      const folderGeo = new THREE.BoxGeometry(0.26, 0.012, 0.33);
      const tabGeo = new THREE.BoxGeometry(0.08, 0.012, 0.032);
      const paperGeo = new THREE.BoxGeometry(0.22, 0.010, 0.29);
      const lineGeo = new THREE.BoxGeometry(0.145, 0.004, 0.012);
      const stampGeo = new THREE.BoxGeometry(0.044, 0.004, 0.026);
      const glintGeo = new THREE.PlaneGeometry(0.46, 0.46);
      glintGeo.rotateX(-Math.PI * 0.5);

      const folderMat = new THREE.MeshStandardMaterial({ color: 0xd4ab6a, roughness: 0.72, metalness: 0.04 });
      const paperMat = new THREE.MeshStandardMaterial({
        color: 0xf7efd8,
        emissive: 0x3b2a10,
        emissiveIntensity: 0.24,
        roughness: 0.82,
        metalness: 0.02
      });
      const inkMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.90, metalness: 0.0 });
      const stampMat = new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        emissive: 0x450a0a,
        emissiveIntensity: 0.25,
        roughness: 0.65,
        metalness: 0.0
      });

      city.disposableGeometries.push(folderGeo, tabGeo, paperGeo, lineGeo, stampGeo, glintGeo);
      city.disposableMaterials.push(folderMat, paperMat, inkMat, stampMat);
      city._fieldLogPropAssets = {
        folderGeo, tabGeo, paperGeo, lineGeo, stampGeo, glintGeo,
        folderMat, paperMat, inkMat, stampMat
      };
    }

    const a = city._fieldLogPropAssets;
    city._fieldLogGlints = city._fieldLogGlints || [];

    const grp = new THREE.Group();
    grp.name = 'CityFieldLogProp_' + id;
    grp.position.set(x, y, z);
    if (ry) grp.rotation.y = ry;
    root.add(grp);

    const folder = new THREE.Mesh(a.folderGeo, a.folderMat);
    folder.position.set(0, 0.006, 0);
    folder.receiveShadow = true;
    grp.add(folder);

    const tab = new THREE.Mesh(a.tabGeo, a.folderMat);
    tab.position.set(0.08, 0.006, -0.175);
    grp.add(tab);

    const paper = new THREE.Mesh(a.paperGeo, a.paperMat);
    paper.position.set(0.01, 0.016, 0.012);
    paper.rotation.y = 0.14;
    grp.add(paper);

    for (let li = 0; li < 3; li++) {
      const ln = new THREE.Mesh(a.lineGeo, a.inkMat);
      ln.position.set(0.01, 0.022, -0.05 + li * 0.042);
      ln.rotation.y = 0.14;
      grp.add(ln);
    }

    const stamp = new THREE.Mesh(a.stampGeo, a.stampMat);
    stamp.position.set(0.055, 0.022, 0.095);
    stamp.rotation.y = 0.24;
    grp.add(stamp);

    const glintMat = new THREE.MeshBasicMaterial({
      color: 0xffd27d,
      transparent: true,
      opacity: 0.30,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    city.disposableMaterials.push(glintMat);
    const glint = new THREE.Mesh(a.glintGeo, glintMat);
    glint.position.set(0, 0.004, 0);
    glint.visible = !used;
    grp.add(glint);

    city._fieldLogGlints.push({
      id: id,
      mesh: glint,
      mat: glintMat,
      used: !!used
    });
  }

  function createDistrictBuilder(city, arch, rng, root, o) {
    const {
      STREET_GROUND_Y,
      SIDEWALK_Y,
      RAIL_TOP_Y,
      CROSSING_Z_SOUTH,
      CROSSING_Z_NORTH,
      CROSSING_HALF_W,
      _tmpDummy,
      prepGeo,
      applyMetricUVs,
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
      buildSkylineSilhouetteRing
    } = P;

    const cMinX = o.corridorMinX !== undefined ? o.corridorMinX : -11.5;
    const cMaxX = o.corridorMaxX !== undefined ? o.corridorMaxX : 22.0;
    const platMinZ = o.platMinZ !== undefined ? o.platMinZ : -62.0;
    const platMaxZ = o.platMaxZ !== undefined ? o.platMaxZ : 62.0;
    const trackXs = Array.isArray(o.trackXs) && o.trackXs.length > 0 ? o.trackXs : [0.0, -4.70];
    const tubeIntensity = o.tubeIntensity !== undefined ? o.tubeIntensity : 0.85;
    const streetLampIntensity = o.streetLampIntensity !== undefined ? o.streetLampIntensity : tubeIntensity;

    // Resolve Poly Haven PBR materials (using LRT.Materials.mats when present, AssetLoader PBR fallback otherwise)
    const matAsphalt = city._getMat('asphaltRoad', 'asphalt_road', { color: 0x3b3d42, roughness: 0.82, metalness: 0.04 });
    const matSidewalk = city._getMat('sidewalkPaver', 'sidewalk_paver', { color: 0x9c978d, roughness: 0.88, metalness: 0.02 });
    const matCurb = city._getMat('concreteRough', 'concrete_rough', { color: 0x96938c, roughness: 0.90, metalness: 0.02 });
    const matTactile = city._getMat('tactile', null, { color: 0xe0b422, roughness: 0.72, metalness: 0.02 });
    const matFacadeModern = city._getMat('facadeModern', 'building_facade_1', { color: 0xc2cbd4, roughness: 0.64, metalness: 0.16 });
    const matFacadePlaster = city._getMat('facadePlaster', 'building_facade_2', { color: 0xd0d4d8, roughness: 0.86, metalness: 0.02 });
    const matBrick = city._getMat('brickWall', 'brick_wall', { color: 0xb08a76, roughness: 0.88, metalness: 0.02 });
    const matDarkWood = city._getMat('darkWood', 'dark_wood', { color: 0x7a5b45, roughness: 0.76, metalness: 0.04 });
    const matRoofTerra = city._getMat('roofTerracotta', 'roof_corrugated', { color: 0xa85e32, roughness: 0.64, metalness: 0.30, side: THREE.DoubleSide });
    const matRoofOchre = city._getMat('roofOchre', 'roof_corrugated', { color: 0xc27c28, roughness: 0.64, metalness: 0.30, side: THREE.DoubleSide });
    const matSteelDark = city._getMat('steelDark', 'rust_metal', { color: 0x454a52, roughness: 0.56, metalness: 0.65 });
    const matTruss = city._getMat('steelTruss', null, { color: 0xd4d8dc, roughness: 0.54, metalness: 0.45 });
    const matJpo = city._getMat('jpoOrange', null, { color: 0xe04628, roughness: 0.58, metalness: 0.28 });
    const matAmber = city._getMat('amberBeacon', null, { color: 0xff6a1a, roughness: 0.25, metalness: 0.2 });
    const matGlassBldg = city._getMat('glassBuilding', null, {
      isPhysical: true, color: 0x2f5368, roughness: 0.12, metalness: 0.22, transparent: true, opacity: 0.82
    });
    const matMarkWhite = city._getMat('cityStripeWhite', null, { color: 0xe2e6ec, roughness: 0.75, metalness: 0.02 });
    const matMarkYellow = city._getMat('cityStripeYellow', null, { color: 0xe2b424, roughness: 0.72, metalness: 0.02 });
    const matInvisColl = city._getInvisCollMat();

    // Geometry buckets (roads/street infra vs spatial building sectors)
    const bAsphalt = [];
    const bSidewalk = [];
    const bCurb = [];
    const bTactile = [];
    const bWhiteMark = [];
    const bYellowMark = [];
    const bSteelDark = [];
    const bTruss = [];
    const bJpo = [];
    const bAmber = [];
    const bCables = [];
    const bCollHull = [];
    const bBuildingColl = [];
    const bLampBulbs = [];
    const bGantryFrame = [];
    const bGantrySign = [];
    const bInfraConcrete = [];
    const bTunnelDark = [];
    const bTunnelSignalRed = [];
    const bCornerWood = [];
    const bCornerRoof = [];
    const bCornerWhite = [];
    const bCornerRed = [];
    const bCornerSandbag = [];
    const bCornerWarmBulb = [];
    const bCornerGlass = [];

    const SECTOR_KEYS = ['Sector_N', 'Sector_S', 'Sector_E_Near', 'Sector_E_Far', 'Sector_W_Near', 'Sector_W_Far'];
    const sectorBuckets = {};
    for (let i = 0; i < SECTOR_KEYS.length; i++) {
      const sk = SECTOR_KEYS[i];
      sectorBuckets[sk] = {
        key: sk,
        isNear: sk === 'Sector_E_Near' || sk === 'Sector_W_Near',
        isFar: sk === 'Sector_E_Far' || sk === 'Sector_W_Far' || sk === 'Sector_N' || sk === 'Sector_S',
        facadeModern: [],
        facadePlaster: [],
        brick: [],
        darkWood: [],
        roofTerra: [],
        roofOchre: [],
        glass: [],
        curb: [],
        truss: [],
        steelDark: [],
        amber: [],
        lod: []
      };
    }

    // Cache concourse bounds for interior occlusion culling
    if (!o.isIsland && arch) {
      const concLen = Math.min(arch.concourseLen || 36.0, 48.0);
      const rawConcMin = arch.concourseEnd === 'south' ? Math.round(-concLen - 2)
        : arch.concourseEnd === 'north' ? 2 : Math.round(-concLen * 0.5);
      const concMinZ = Math.max(platMinZ + 4, Math.min(platMaxZ - concLen - 4, rawConcMin));
      const concMaxZ = concMinZ + concLen;
      city._concourseBounds = {
        concMaxX: cMaxX - 0.2,
        concMinZ,
        concMaxZ,
        concMidZ: (concMinZ + concMaxZ) * 0.5,
        portalHalfW: 5.5
      };
    }

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

    const westRoadCX = (westRoadMinX + westRoadMaxX) * 0.5;
    const eastRoadCX = (eastRoadMinX + eastRoadMaxX) * 0.5;
    const parkX = eastOuterSwMinX + 4.2;

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
      innerWestBlocks.push({ x0: westColRoadMaxX, z0: bz0, x1: westOuterSwMaxX, z1: bz1, zi });
      innerEastBlocks.push({ x0: eastOuterSwMinX, z0: bz0, x1: eastColRoadMinX, z1: bz1, zi });
      outerWestBlocks.push({ x0: DIST_X_MIN, z0: bz0, x1: westColRoadMinX, z1: bz1, zi });
      outerEastBlocks.push({ x0: eastColRoadMaxX, z0: bz0, x1: DIST_X_MAX, z1: bz1, zi });
    }

    const cornerHubCoords = {
      NW: {
        id: 'city_nw_medpost',
        noteId: 'note_nw_corner',
        name: 'Pojok NW — Posko Medis PMI',
        cx: westColRoadMaxX + 8.5,
        cz: 98.0,
        teleport: { x: westColRoadMaxX + 9.0, y: SIDEWALK_Y + 0.05, z: 94.5, yaw: Math.PI }
      },
      NE: {
        id: 'city_ne_depot',
        noteId: 'note_ne_corner',
        name: 'Pojok NE — Gudang Logistik',
        cx: eastColRoadMinX - 8.5,
        cz: 98.0,
        teleport: { x: eastColRoadMinX - 9.0, y: SIDEWALK_Y + 0.05, z: 94.5, yaw: Math.PI }
      },
      SW: {
        id: 'city_sw_convoy',
        noteId: 'note_sw_corner',
        name: 'Pojok SW — Konvoi Militer',
        cx: westColRoadMaxX + 8.5,
        cz: -98.0,
        teleport: { x: westColRoadMaxX + 8.7, y: SIDEWALK_Y + 0.05, z: -97.0, yaw: 0 }
      },
      SE: {
        id: 'city_se_warung',
        noteId: 'note_se_corner',
        name: 'Pojok SE — Pos Ronda & Warung',
        cx: eastColRoadMinX - 8.5,
        cz: -98.0,
        teleport: { x: eastColRoadMinX - 9.0, y: SIDEWALK_Y + 0.05, z: -94.5, yaw: 0 }
      }
    };
    city.layoutBounds = {
      cMinX, cMaxX, platMinZ, platMaxZ,
      DIST_X_MIN, DIST_X_MAX, DIST_Z_MIN, DIST_Z_MAX,
      westInnerSwMinX, westInnerSwMaxX, westRoadMinX, westRoadMaxX,
      westOuterSwMinX, westOuterSwMaxX, westColRoadMinX, westColRoadMaxX,
      eastInnerSwMinX, eastInnerSwMaxX, eastRoadMinX, eastRoadMaxX,
      eastOuterSwMinX, eastOuterSwMaxX, eastColRoadMinX, eastColRoadMaxX,
      SIDEWALK_Y, STREET_GROUND_Y, RAIL_TOP_Y
    };
    city.cornerHubs = {
      NW: Object.assign({ id: cornerHubCoords.NW.id, noteId: cornerHubCoords.NW.noteId, name: cornerHubCoords.NW.name }, cornerHubCoords.NW.teleport),
      NE: Object.assign({ id: cornerHubCoords.NE.id, noteId: cornerHubCoords.NE.noteId, name: cornerHubCoords.NE.name }, cornerHubCoords.NE.teleport),
      SW: Object.assign({ id: cornerHubCoords.SW.id, noteId: cornerHubCoords.SW.noteId, name: cornerHubCoords.SW.name }, cornerHubCoords.SW.teleport),
      SE: Object.assign({ id: cornerHubCoords.SE.id, noteId: cornerHubCoords.SE.noteId, name: cornerHubCoords.SE.name }, cornerHubCoords.SE.teleport)
    };

    const self = city;
    const fireEscapePlacements = [];
    const airconPlacements = [];
    const facadeModulePlacements = [];

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
    const pachiraPlacements = [[], [], [], []];
    const shrub1Placements = [];
    const shrub2Placements = [[], [], [], []];
    const fernPlacements = [[], [], [], []];
    const calatheaPlacements = [[], [], []];
    const angsanaTransforms = [];
    const sedanPlacements = [];
    const mpvAjarPlacements = [];
    const angkotPlacements = [];
    const busPlacements = [];
    const ojolPlacements = [];
    const gerobakPlacements = [];
    const trafficSignalPlacements = [];
    const monoblocChairPlacements = [];
    const outdoorTablePlacements = [];
    const chalkboardPlacements = [];
    const plasticCratePlacements = [];
    const militaryCratePlacements = [];
    const jerrycanPlacements = [];
    const fuelBarrelPlacements = [];
    const oldTyrePlacements = [];
    const cardboardBoxPlacements = [];
    const bermudaGrassPlacements = [];
    const handTruckPlacements = [];
    const palletPlacements = [];
    const ammoBoxPlacements = [];
    const ambulancePlacements = [];
    const militaryTruckPlacements = [];

    const sectorPartDefs = [
      { key: 'facadeModern', mat: matFacadeModern, canShadow: true, receiveShadow: true, prefix: 'BuildingsModern' },
      { key: 'facadePlaster', mat: matFacadePlaster, canShadow: true, receiveShadow: true, prefix: 'BuildingsPlaster' },
      { key: 'brick', mat: matBrick, canShadow: true, receiveShadow: true, prefix: 'BuildingsBrick' },
      { key: 'darkWood', mat: matDarkWood, canShadow: true, receiveShadow: true, prefix: 'RukoWood' },
      { key: 'roofTerra', mat: matRoofTerra, canShadow: true, receiveShadow: true, prefix: 'RoofsTerra' },
      { key: 'roofOchre', mat: matRoofOchre, canShadow: true, receiveShadow: true, prefix: 'RoofsOchre' },
      { key: 'curb', mat: matCurb, canShadow: true, receiveShadow: true, prefix: 'BuildingCurb' },
      { key: 'truss', mat: matTruss, canShadow: false, receiveShadow: true, prefix: 'BuildingTrim' },
      { key: 'steelDark', mat: matSteelDark, canShadow: false, receiveShadow: true, prefix: 'BuildingSteel' },
      { key: 'amber', mat: matAmber, canShadow: false, receiveShadow: false, prefix: 'BuildingBeacons' },
      { key: 'glass', mat: matGlassBldg, canShadow: false, receiveShadow: true, prefix: 'BuildingGlass' }
    ];

    function buildRoadsAndMarkingsStage() {
    // =========================================================
    // 1. ASPHALT ROADS & LEVEL RAIL CROSSINGS (y = -1.00)
    // =========================================================
    const addAsphaltSlab = (x0, z0, x1, z1, walkable, topY) => {
      const w = x1 - x0;
      const d = z1 - z0;
      if (w <= 0.05 || d <= 0.05) return;
      const yTop = topY !== undefined ? topY : STREET_GROUND_Y;
      addBox(bAsphalt, w, 0.24, d, (x0 + x1) * 0.5, yTop - 0.12, (z0 + z1) * 0.5, 0, 0, 0, 6.0);
      if (walkable !== false) {
        city._addCollider(x0, yTop - 0.24, z0, x1, yTop, z1, 'floor', {
          isFloor: true, blocksWalk: true, blocksBullets: false
        });
      }
    };

    // West & East Side Road Networks (strictly zero-overlap abutting slabs to prevent Z-fighting!)
    addAsphaltSlab(DIST_X_MIN, DIST_Z_MIN, westInnerSwMinX, DIST_Z_MAX, true);
    addAsphaltSlab(eastInnerSwMaxX, DIST_Z_MIN, DIST_X_MAX, DIST_Z_MAX, true);

    // Extended outer urban terrain skirt & perimeter bounds spanning continuous full X width (zero sky-void holes!)
    const OUTER_SKIRT = 90.0;
    const RAIL_EXT_Z = 145.0;
    addAsphaltSlab(DIST_X_MIN - OUTER_SKIRT, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MIN, DIST_Z_MAX + OUTER_SKIRT, true);
    addAsphaltSlab(DIST_X_MAX, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MAX + OUTER_SKIRT, DIST_Z_MAX + OUTER_SKIRT, true);
    addAsphaltSlab(DIST_X_MIN, DIST_Z_MIN - OUTER_SKIRT, cMinX - 0.02, DIST_Z_MIN, true);
    addAsphaltSlab(cMaxX + 0.02, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MAX, DIST_Z_MIN, true);
    addAsphaltSlab(DIST_X_MIN, DIST_Z_MAX, cMinX - 0.02, DIST_Z_MAX + OUTER_SKIRT, true);
    addAsphaltSlab(cMaxX + 0.02, DIST_Z_MAX, DIST_X_MAX, DIST_Z_MAX + OUTER_SKIRT, true);
    // Seal rail corridor sub-base continuously across [cMinX - 0.02 .. cMaxX + 0.02] (sits cleanly beneath -1.20..-1.12 ballast)
    addAsphaltSlab(cMinX - 0.02, DIST_Z_MIN - OUTER_SKIRT, cMaxX + 0.02, -RAIL_EXT_Z, false);
    addAsphaltSlab(cMinX - 0.02, -RAIL_EXT_Z, cMaxX + 0.02, southCrossZ0, false, STREET_GROUND_Y - 0.20);
    addAsphaltSlab(cMinX - 0.02, northCrossZ1, cMaxX + 0.02, RAIL_EXT_Z, false, STREET_GROUND_Y - 0.20);
    addAsphaltSlab(cMinX - 0.02, RAIL_EXT_Z, cMaxX + 0.02, DIST_Z_MAX + OUTER_SKIRT, false);
    // Physical Quarantine Roadblocks along outer edges (z = ±116.5 & outer collector/cross exits)
    // (Replaces invisible walls with concrete road barriers, covered car blockades, chainlink fences & amber warning beacons)
    city._addCollider(DIST_X_MIN, STREET_GROUND_Y, -117.2, cMinX - 0.2, STREET_GROUND_Y + 3.0, -115.8, 'concrete', { blocksBullets: false });
    city._addCollider(cMaxX + 0.2, STREET_GROUND_Y, -117.2, DIST_X_MAX, STREET_GROUND_Y + 3.0, -115.8, 'concrete', { blocksBullets: false });
    city._addCollider(DIST_X_MIN, STREET_GROUND_Y, 115.8, cMinX - 0.2, STREET_GROUND_Y + 3.0, 117.2, 'concrete', { blocksBullets: false });
    city._addCollider(cMaxX + 0.2, STREET_GROUND_Y, 115.8, DIST_X_MAX, STREET_GROUND_Y + 3.0, 117.2, 'concrete', { blocksBullets: false });
    city._addCollider(DIST_X_MIN, STREET_GROUND_Y, -116.5, DIST_X_MIN + 1.2, STREET_GROUND_Y + 3.0, 116.5, 'concrete', { blocksBullets: false });
    city._addCollider(DIST_X_MAX - 1.2, STREET_GROUND_Y, -116.5, DIST_X_MAX, STREET_GROUND_Y + 3.0, 116.5, 'concrete', { blocksBullets: false });

    // Station Promenade Apron Road Connection & Level Rail Crossings at z = -74 & z = +74 (y = -1.00)
    for (const [cz0, cz1] of [[southCrossZ0, southCrossZ1], [northCrossZ0, northCrossZ1]]) {
      // Keep asphalt strictly outside the track crossing slab [cMinX .. cMaxX] so zero Z-fighting occurs!
      addAsphaltSlab(westInnerSwMinX, cz0, cMinX - 0.02, cz1, true);
      addAsphaltSlab(cMaxX + 0.02, cz0, eastInnerSwMaxX, cz1, true);
      city._addCollider(cMinX - 0.1, STREET_GROUND_Y - 0.24, cz0, cMaxX + 0.1, STREET_GROUND_Y, cz1, 'floor', {
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
        city._addCollider(gc.gx - 0.30, SIDEWALK_Y, Math.min(gc.gz, postZ) - 0.30, gc.gx + 0.30, SIDEWALK_Y + 3.4, Math.max(gc.gz, postZ) + 0.30, 'metal', { blocksBullets: false });
      }
    }

    // Outer corridor ballasted tracks & rails extended continuously out to z = ±145m inside tunnel chambers
    for (const [tz0, tz1] of [[-RAIL_EXT_Z, southCrossZ0], [northCrossZ1, RAIL_EXT_Z]]) {
      const tLen = tz1 - tz0;
      const tMidZ = (tz0 + tz1) * 0.5;
      addBox(bCurb, cMaxX - cMinX, 0.08, tLen, (cMinX + cMaxX) * 0.5, -1.16, tMidZ, 0, 0, 0, 4.0);
      city._addCollider(cMinX, -1.24, tz0, cMaxX, -1.12, tz1, 'floor', { isFloor: true, blocksWalk: true, blocksBullets: false });
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
        addBox(bYellowMark, 0.14, 0.010, 4.8, cx - 0.12, STREET_GROUND_Y + 0.010, z);
        addBox(bYellowMark, 0.14, 0.010, 4.8, cx + 0.12, STREET_GROUND_Y + 0.010, z);
        if (isMajor) {
          addBox(bWhiteMark, 0.12, 0.010, 2.8, cx - laneW, STREET_GROUND_Y + 0.010, z);
          addBox(bWhiteMark, 0.12, 0.010, 2.8, cx + laneW, STREET_GROUND_Y + 0.010, z);
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
        if (x > westInnerSwMinX - 3.0 && x < eastInnerSwMaxX + 3.0) continue;
        if (x > westRoadMinX - 2.5 && x < westRoadMaxX + 2.5) continue;
        if (x > eastRoadMinX - 2.5 && x < eastRoadMaxX + 2.5) continue;
        if (x > westOuterSwMinX - 2.0 && x < westOuterSwMaxX + 2.0) continue;
        if (x > eastOuterSwMinX - 2.0 && x < eastOuterSwMaxX + 2.0) continue;
        addBox(bYellowMark, 3.2, 0.010, 0.14, x, STREET_GROUND_Y + 0.010, cz - 0.11);
        addBox(bYellowMark, 3.2, 0.010, 0.14, x, STREET_GROUND_Y + 0.010, cz + 0.11);
      }
    };
    addRoadMarkingsEW(southCrossZ0, southCrossZ1, DIST_X_MIN, DIST_X_MAX);
    addRoadMarkingsEW(northCrossZ0, northCrossZ1, DIST_X_MIN, DIST_X_MAX);
    city._mergeAndRegisterBVH(bAsphalt, matAsphalt, false, true, 'CityRoads', true);
    city._mergeAndRegisterBVH(bYellowMark, matMarkYellow, false, true, 'CityMarkingsYellow', false);
    }

    function buildSidewalksAndCurbsStage() {
    const addZebraCrosswalk = (cx, cz, span, isAlongX, ySurf) => {
      const yMark = (ySurf !== undefined ? ySurf : STREET_GROUND_Y) + 0.014;
      const stripePitch = 0.95;
      const count = Math.max(4, Math.floor(span / stripePitch));
      const start = -((count - 1) * stripePitch) * 0.5;
      for (let i = 0; i < count; i++) {
        const off = start + i * stripePitch;
        if (isAlongX) {
          addBox(bWhiteMark, 0.46, 0.010, 2.8, cx + off, yMark, cz);
        } else {
          addBox(bWhiteMark, 2.8, 0.010, 0.46, cx, yMark, cz + off);
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
        city._addCollider(minX, STREET_GROUND_Y - 0.05, minZ, maxX, SIDEWALK_Y, maxZ, 'floor', {
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
        const col = city._addCollider(cx - hr, STREET_GROUND_Y - 0.1, cz - hw, cx + hr, SIDEWALK_Y + 0.05, cz + hw, 'ramp', {
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
        const col = city._addCollider(cx - hw, STREET_GROUND_Y - 0.1, cz - hr, cx + hw, SIDEWALK_Y + 0.05, cz + hr, 'ramp', {
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

    // Station North & South Platform-End Aprons: handled continuously by Station 3B Plaza Aprons (avoid duplicate SIDEWALK_Y Z-fighting!)
    const endSpans = Array.isArray(o.endApronSpans) && o.endApronSpans.length > 0
      ? o.endApronSpans
      : [[cMinX + 3.2, cMaxX]];
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

    for (let zi = 0; zi < zSpans.length; zi++) {
      const [bz0, bz1] = zSpans[zi];
      // Inner West block (between West Boulevard and West Collector)
      addSidewalkBlock(westColRoadMaxX, bz0, westOuterSwMaxX, bz1, 3.2, true);
      // Inner East block (between East Boulevard and East Collector)
      addSidewalkBlock(eastOuterSwMinX, bz0, eastColRoadMinX, bz1, 3.2, true);
      // Outer West & East skyline blocks
      addSidewalkBlock(DIST_X_MIN, bz0, westColRoadMinX, bz1, 3.0, true);
      addSidewalkBlock(eastColRoadMaxX, bz0, DIST_X_MAX, bz1, 3.0, true);
    }

    // Zebra Crosswalks & ADA Curb Ramps at all key pedestrian intersections!

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
    // Collector-road ADA curb ramps leading directly into the 4 Far-Corner Exploration Hubs (NW, NE, SW, SE)
    for (const cz of [-98.0, 98.0]) {
      addAdaCurbRamp(westColRoadMaxX - 0.55, cz, 3.2, 1.15, 'x', 1);
      addAdaCurbRamp(eastColRoadMinX + 0.55, cz, 3.2, 1.15, 'x', -1);
    }
    city._mergeAndRegisterBVH(bSidewalk, matSidewalk, false, true, 'CitySidewalks', true);
    city._mergeAndRegisterBVH(bCurb, matCurb, false, true, 'CityCurbsAndCrossings', true);
    city._mergeAndRegisterBVH(bTactile, matTactile, false, true, 'CityTactile', false);
    city._mergeAndRegisterBVH(bWhiteMark, matMarkWhite, false, true, 'CityMarkingsWhite', false);
    }

    // =========================================================
    // 4. NON-SQUARE EXTRUDED JAKARTA ARCHITECTURE (NO BORING BOXES!)
    // =========================================================
    const addExtrudedTier = (sb, bucketKey, ptsXZ, yBot, height, tileM, emitCollider, tag, addToBvh) => {
      const ccw = ensureCCWShapeXZ(ptsXZ);
      const shape = makePolyShapeXZ(ccw);
      const geo = extrudeShapeXZ(shape, yBot, height, null, tileM || 4.5);
      sb[bucketKey].push(geo);
      if (addToBvh !== false && bucketKey !== 'glass' && bucketKey !== 'truss' && bucketKey !== 'amber') {
        bBuildingColl.push(geo.clone());
      }
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

    const addBuildingBox = (sb, bucketKey, w, h, d, x, y, z, rx, ry, rz, tileM, addToBvh) => {
      const bucket = sb[bucketKey];
      const before = bucket.length;
      addBox(bucket, w, h, d, x, y, z, rx, ry, rz, tileM);
      if (addToBvh && bucket.length > before) {
        bBuildingColl.push(bucket[bucket.length - 1].clone());
      }
    };

    // A) Indonesian 2-3 Story Ruko (Shophouse) Row with Ground Colonnade Arcade, Recessed Shopfronts & Pitched Roofs
    const buildRukoRow = (sb, x0, z0, x1, z1, faceSide, bays, hasThreeFloors) => {
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

      if (sb.isFar) {
        const totH = gfH + ufH + 1.4;
        addColoredBox(sb.lod, w, totH, d, (minX + maxX) * 0.5, baseY + totH * 0.5, (minZ + maxZ) * 0.5, 0, 0, 0, 0xa89282, 0.78);
      }

      for (let b = 0; b < bayCount; b++) {
        const b0 = (alongZ ? minZ : minX) + b * baySpan + 0.08;
        const b1 = b0 + baySpan - 0.16;
        const depthVar = (b % 2 === 1 ? -0.45 : 0.0);
        const hVar = (b % 3 === 0 ? 0.35 : 0.0);
        const wallKey = b % 3 === 0 ? 'facadePlaster' : (b % 3 === 1 ? 'brick' : 'facadeModern');
        const roofKey = b % 2 === 0 ? 'roofTerra' : 'roofOchre';

        if (alongZ) {
          const frontX = faceSide === 'east' ? maxX : minX;
          const backX = faceSide === 'east' ? minX - depthVar : maxX + depthVar;
          const coreX0 = faceSide === 'east' ? Math.min(backX, frontX - overhangDepth) : frontX + overhangDepth;
          const coreX1 = faceSide === 'east' ? frontX - overhangDepth : Math.max(backX, frontX + overhangDepth);
          const colX = faceSide === 'east' ? frontX - 0.24 : frontX + 0.24;

          // Ground floor recessed shopfront core (leaves walkable colonnade under overhang!)
          const gfPts = [[coreX0, b0], [coreX1, b0], [coreX1, b1], [coreX0, b1]];
          addExtrudedTier(sb, wallKey, gfPts, baseY, gfH, 3.6, true, 'building', true);

          // Recessed glazed shopfront & wood fascia signage beam
          const shopFaceX = faceSide === 'east' ? coreX1 + 0.04 : coreX0 - 0.04;
          addBuildingBox(sb, 'glass', 0.12, 2.55, baySpan - 0.85, shopFaceX, SIDEWALK_Y + 1.40, (b0 + b1) * 0.5, 0, 0, 0, 2.0, false);
          addBuildingBox(sb, 'darkWood', 0.28, 0.58, baySpan - 0.2, colX, SIDEWALK_Y + gfH - 0.28, (b0 + b1) * 0.5, 0, 0, 0, 2.5, false);

          // Colonnade arcade columns supporting overhanging 2nd floor
          for (const cz of [b0 + 0.22, b1 - 0.22]) {
            addBuildingBox(sb, 'curb', 0.34, gfH, 0.34, colX, baseY + gfH * 0.5, cz, 0, 0, 0, 2.0, true);
            self._addCollider(colX - 0.19, baseY, cz - 0.19, colX + 0.19, baseY + gfH, cz + 0.19, 'concrete', { blocksBullets: false });
          }

          // Upper 2nd/3rd story cantilevered out over colonnade + chamfered corner bay on end unit!
          const ufPts = (b === 0)
            ? [[Math.min(coreX0, frontX), b0 + 1.1], [Math.min(coreX0, frontX) + 1.1, b0], [Math.max(coreX1, frontX), b0], [Math.max(coreX1, frontX), b1], [Math.min(coreX0, frontX), b1]]
            : [[Math.min(coreX0, frontX), b0], [Math.max(coreX1, frontX), b0], [Math.max(coreX1, frontX), b1], [Math.min(coreX0, frontX), b1]];
          addExtrudedTier(sb, wallKey, ufPts, baseY + gfH, ufH + hVar, 3.8, true, 'building', true);

          // Upper recessed windows & metal balcony rail
          const winX = faceSide === 'east' ? frontX + 0.03 : frontX - 0.03;
          addBuildingBox(sb, 'glass', 0.10, 1.55, baySpan * 0.62, winX, SIDEWALK_Y + gfH + 1.55, (b0 + b1) * 0.5, 0, 0, 0, 2.0, false);
          if (sb.isNear) {
            addBuildingBox(sb, 'steelDark', 0.55, 0.90, baySpan * 0.72, faceSide === 'east' ? frontX + 0.24 : frontX - 0.24, SIDEWALK_Y + gfH + 0.55, (b0 + b1) * 0.5, 0, 0, 0, 2.0, false);
          }

          // Hipped corrugated metal / terracotta roof
          const roofBaseY = baseY + gfH + ufH + hVar;
          addHippedRoof(sb[roofKey], Math.min(coreX0, frontX), b0, Math.max(coreX1, frontX), b1, roofBaseY, 1.75 + (b % 2) * 0.35, 0.48, 2.8);

          // Rooftop blue/steel water tank ("toren") & AC outdoor unit (skip AC clutter on far blocks!)
          if (sb.isNear) {
            const torenX = (coreX0 + coreX1) * 0.5;
            addCylinder(sb.steelDark, 0.45, 0.45, 1.10, 10, torenX, roofBaseY + 1.55, (b0 + b1) * 0.5);
            if (b % 2 === 0) {
              airconPlacements.push({
                x: faceSide === 'east' ? frontX + 0.18 : frontX - 0.18,
                y: SIDEWALK_Y + gfH + 0.55,
                z: (b0 + b1) * 0.5 + baySpan * 0.28,
                ry: faceSide === 'east' ? Math.PI * 0.5 : -Math.PI * 0.5
              });
            }
          }
        } else {
          // Oriented along X facing North/South cross-street
          const frontZ = faceSide === 'south' ? maxZ : minZ;
          const backZ = faceSide === 'south' ? minZ - depthVar : maxZ + depthVar;
          const coreZ0 = faceSide === 'south' ? Math.min(backZ, frontZ - overhangDepth) : frontZ + overhangDepth;
          const coreZ1 = faceSide === 'south' ? frontZ - overhangDepth : Math.max(backZ, frontZ + overhangDepth);
          const colZ = faceSide === 'south' ? frontZ - 0.24 : frontZ + 0.24;

          addExtrudedTier(sb, wallKey, [[b0, coreZ0], [b1, coreZ0], [b1, coreZ1], [b0, coreZ1]], baseY, gfH, 3.6, true, 'building', true);
          const shopFaceZ = faceSide === 'south' ? coreZ1 + 0.04 : coreZ0 - 0.04;
          addBuildingBox(sb, 'glass', baySpan - 0.85, 2.55, 0.12, (b0 + b1) * 0.5, SIDEWALK_Y + 1.40, shopFaceZ, 0, 0, 0, 2.0, false);
          addBuildingBox(sb, 'darkWood', baySpan - 0.2, 0.58, 0.28, (b0 + b1) * 0.5, SIDEWALK_Y + gfH - 0.28, colZ, 0, 0, 0, 2.5, false);
          for (const cx of [b0 + 0.22, b1 - 0.22]) {
            addBuildingBox(sb, 'curb', 0.34, gfH, 0.34, cx, baseY + gfH * 0.5, colZ, 0, 0, 0, 2.0, true);
            self._addCollider(cx - 0.19, baseY, colZ - 0.19, cx + 0.19, baseY + gfH, colZ + 0.19, 'concrete', { blocksBullets: false });
          }
          addExtrudedTier(sb, wallKey, [[b0, Math.min(coreZ0, frontZ)], [b1, Math.min(coreZ0, frontZ)], [b1, Math.max(coreZ1, frontZ)], [b0, Math.max(coreZ1, frontZ)]], baseY + gfH, ufH + hVar, 3.8, true, 'building', true);
          const winZ = faceSide === 'south' ? frontZ + 0.03 : frontZ - 0.03;
          addBuildingBox(sb, 'glass', baySpan * 0.62, 1.55, 0.10, (b0 + b1) * 0.5, SIDEWALK_Y + gfH + 1.55, winZ, 0, 0, 0, 2.0, false);
          const roofBaseY = baseY + gfH + ufH + hVar;
          addHippedRoof(sb[roofKey], b0, Math.min(coreZ0, frontZ), b1, Math.max(coreZ1, frontZ), roofBaseY, 1.75, 0.48, 2.8);
        }
      }
    };

    // B) L-Shaped Sudirman Corporate Tower (non-square L-footprint + chamfered podium + marquee + spire)
    const buildLShapedTower = (sb, x0, z0, x1, z1, cornerRot, totalH) => {
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
      addExtrudedTier(sb, 'glass', podPts, baseY, podH - 0.7, 3.5, false, 'building', false);
      for (let ci = 0; ci < lPts.length; ci++) {
        const [cxp, czp] = lPts[ci];
        addBuildingBox(sb, 'curb', 0.90, podH - 0.7, 0.90, cxp, baseY + (podH - 0.7) * 0.5, czp, 0, 0, 0, 2.0, true);
      }
      addExtrudedTier(sb, 'curb', lPts, baseY + podH - 0.7, 0.85, 4.0, false, 'building', false);

      // Accurate 2-wing L-colliders (leaves the open L plaza corner walkable!)
      for (const wg of [wingA, wingB]) {
        self._addCollider(wg[0], baseY, wg[1], wg[2], baseY + totalH, wg[3], 'building', {
          blocksWalk: true, blocksBullets: false
        });
        if (sb.isFar) {
          addColoredBox(sb.lod, wg[2] - wg[0], totalH, wg[3] - wg[1], (wg[0] + wg[2]) * 0.5, baseY + totalH * 0.5, (wg[1] + wg[3]) * 0.5, 0, 0, 0, 0x7b8998, 0.72);
        }
      }

      const shaftH = Math.max(12.0, totalH - podH - 0.15);
      const shaftPts = insetTowardCenter(lPts, 0.45);
      addExtrudedTier(sb, 'facadeModern', shaftPts, baseY + podH + 0.15, shaftH, 5.0, false, 'building', true);

      // Horizontal architectural sun-shading fins every ~7m (only on near/detailed towers)
      if (!sb.isFar) {
        for (let fy = baseY + podH + 6.0; fy < baseY + totalH - 2.0; fy += 7.0) {
          addExtrudedTier(sb, 'truss', lPts, fy, 0.28, 4.0, false, 'building', false);
        }
      }

      const crownX = (wingA[0] + wingA[2]) * 0.5;
      const crownZ = (wingA[1] + wingA[3]) * 0.5;
      const cw = (wingA[2] - wingA[0]) * 0.55;
      const cd = (wingA[3] - wingA[1]) * 0.55;
      addExtrudedTier(sb, 'curb', [
        [crownX - cw * 0.5, crownZ - cd * 0.5],
        [crownX + cw * 0.5, crownZ - cd * 0.5],
        [crownX + cw * 0.5, crownZ + cd * 0.5],
        [crownX - cw * 0.5, crownZ + cd * 0.5]
      ], baseY + totalH, 3.6, 3.0, false, 'building', false);
      addCylinder(sb.truss, 0.08, 0.16, 6.5, 6, crownX, baseY + totalH + 6.8, crownZ);
      addBuildingBox(sb, 'amber', 0.42, 0.42, 0.42, crownX, baseY + totalH + 10.1, crownZ, 0, 0, 0, 1.0, false);
    };

    // C) Chamfered Octagonal Landmark Tower (angled corners + stepped podium + curved canopy)
    const buildChamferedTower = (sb, x0, z0, x1, z1, totalH) => {
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

      if (sb.isFar) {
        addColoredBox(sb.lod, w * 0.86, totalH + 5.0, d * 0.86, cx, baseY + (totalH + 5.0) * 0.5, cz, 0, 0, 0, 0x8996a4, 0.72);
      }

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

      addExtrudedTier(sb, 'curb', podPts, baseY, 0.9, 4.0, true, 'building', true);
      addExtrudedTier(sb, 'glass', makeOct(cx, cz, w * 0.94, d * 0.94, ch), baseY + 0.9, 3.5, 3.0, false, 'building', true);
      addExtrudedTier(sb, 'curb', makeOct(cx, cz, w * 0.98, d * 0.98, ch), baseY + 4.4, 0.8, 4.0, false, 'building', false);
      addExtrudedTier(sb, 'facadeModern', midPts, baseY + 5.2, totalH * 0.62, 4.8, false, 'building', true);
      addExtrudedTier(sb, 'glass', makeOct(cx, cz, w * 0.74, d * 0.74, ch * 0.85), baseY + 5.2 + totalH * 0.62, totalH * 0.24, 4.0, false, 'building', false);
      addExtrudedTier(sb, 'facadePlaster', topPts, baseY + 5.2 + totalH * 0.86, totalH * 0.14, 3.5, false, 'building', false);

      if (sb.isNear) {
        const marqShape = new THREE.Shape();
        marqShape.moveTo(0, 0);
        marqShape.quadraticCurveTo(1.6, 0.75, 3.2, 0.05);
        marqShape.lineTo(3.2, -0.18);
        marqShape.quadraticCurveTo(1.6, 0.50, 0, -0.22);
        marqShape.closePath();
        const marqGeo = new THREE.ExtrudeGeometry(marqShape, { depth: 7.0, bevelEnabled: false, curveSegments: 8 });
        marqGeo.translate(maxX - 0.4, SIDEWALK_Y + 3.6, cz - 3.5);
        sb.truss.push(applyMetricUVs(marqGeo, 2.5));
      }

      addBuildingBox(sb, 'amber', 0.40, 0.40, 0.40, cx, baseY + totalH + 5.6, cz, 0, 0, 0, 1.0, false);
    };

    // D) U-Shaped Courtyard Complex (open walkable courtyard + fire escape + apartments facade + AC units)
    const buildUCourtyardComplex = (sb, x0, z0, x1, z1, openSide, h) => {
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

      addExtrudedTier(sb, 'brick', uPts, baseY, 3.4, 3.2, false, 'building', true);
      addExtrudedTier(sb, 'facadePlaster', uPts, baseY + 3.4, Math.max(4.0, h - 3.4), 4.2, false, 'building', true);
      for (let bi = 0; bi < boxes.length; bi++) {
        const bx = boxes[bi];
        self._addCollider(bx[0], baseY, bx[1], bx[2], baseY + h, bx[3], 'building', {
          blocksWalk: true, blocksBullets: false
        });
        if (sb.isFar) {
          addColoredBox(sb.lod, bx[2] - bx[0], h, bx[3] - bx[1], (bx[0] + bx[2]) * 0.5, baseY + h * 0.5, (bx[1] + bx[3]) * 0.5, 0, 0, 0, 0xb0a99f, 0.78);
        }
        addBuildingBox(sb, 'curb', bx[2] - bx[0] + 0.24, 0.55, bx[3] - bx[1] + 0.24, (bx[0] + bx[2]) * 0.5, baseY + h + 0.275, (bx[1] + bx[3]) * 0.5, 0, 0, 0, 3.0, false);
      }

      if (sb.isNear) {
        addCylinder(sb.steelDark, 0.55, 0.55, 1.35, 10, (boxes[0][0] + boxes[0][2]) * 0.5, baseY + h + 0.9, (boxes[0][1] + boxes[0][3]) * 0.5);
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
      }
    };

    // E) Diagonal / Trapezoidal Civic Podium with Terraced Roof
    const buildDiagonalCivic = (sb, x0, z0, x1, z1, h) => {
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
      addExtrudedTier(sb, 'brick', trapPts, baseY, 4.0, 3.5, true, 'building', true);
      const diagCX = (minX + maxX) * 0.5;
      const diagCZ = (minZ + maxZ) * 0.5;
      if (sb.isFar) {
        addColoredBox(sb.lod, (maxX - minX) * 0.90, h + 1.5, (maxZ - minZ) * 0.90, diagCX, baseY + (h + 1.5) * 0.5, diagCZ, 0, 0, 0, 0x9b8677, 0.78);
      }
      const glassTrap = trapPts.map(([px, pz]) => [
        diagCX + (px - diagCX) * 0.88,
        diagCZ + (pz - diagCZ) * 0.88
      ]);
      const midTrap = trapPts.map(([px, pz]) => [
        diagCX + (px - diagCX) * 0.90,
        diagCZ + (pz - diagCZ) * 0.90
      ]);
      addExtrudedTier(sb, 'glass', glassTrap, baseY + 4.0, 2.5, 3.0, false, 'building', true);
      addExtrudedTier(sb, 'curb', midTrap, baseY + 6.5, 0.45, 3.5, false, 'building', false);
      addExtrudedTier(sb, 'facadeModern', midTrap, baseY + 6.95, Math.max(4.0, h - 6.95), 4.2, false, 'building', true);
      addHippedRoof(sb.roofTerra, diagCX - (maxX - minX) * 0.42, diagCZ - (maxZ - minZ) * 0.42, diagCX + (maxX - minX) * 0.42, diagCZ + (maxZ - minZ) * 0.42, baseY + h, 2.2, 0.5, 3.0);
    };

    const getInnerSector = (isEast, zi) => {
      if (zi === 0) return sectorBuckets.Sector_S;
      if (zi === 4) return sectorBuckets.Sector_N;
      return isEast ? sectorBuckets.Sector_E_Near : sectorBuckets.Sector_W_Near;
    };

    function buildInnerBlocksStage() {
    // Populate Inner West Blocks (facing West Boulevard)
    for (let i = 0; i < innerWestBlocks.length; i++) {
      const blk = innerWestBlocks[i];
      const sb = getInnerSector(false, blk.zi);
      const bx0 = blk.x0 + 2.0;
      const bx1 = blk.x1 - 2.0;
      const bz0 = blk.z0 + 2.2;
      const bz1 = blk.z1 - 2.2;
      const midX = (bx0 + bx1) * 0.5;
      if (blk.zi === 0) {
        // Leave outer SW corner half open for SW Military Checkpoint & Convoy Hub
        buildUCourtyardComplex(sb, midX + 1.0, bz0, bx1, bz1, 'east', 14.5);
      } else if (blk.zi === 1) {
        buildRukoRow(sb, midX + 1.5, bz0, bx1, bz1, 'east', 5, false);
        buildChamferedTower(sb, bx0, bz0 + 1.5, midX - 0.5, bz1 - 1.5, 28.0);
      } else if (blk.zi === 2) {
        buildLShapedTower(sb, bx0 + 1.0, bz0 + 1.0, bx1 - 1.0, bz1 - 1.0, 2, 34.0);
      } else if (blk.zi === 3) {
        buildRukoRow(sb, midX + 1.5, bz0, bx1, bz1, 'east', 5, true);
        buildDiagonalCivic(sb, bx0, bz0 + 1.0, midX - 0.5, bz1 - 1.0, 14.0);
      } else {
        // Leave outer NW corner half open for NW PMI Emergency Medical Hub & Ambulance
        buildChamferedTower(sb, midX + 1.0, bz0 + 1.5, bx1 - 1.0, bz1 - 1.5, 24.0);
      }
    }

    // Populate Inner East Blocks (facing East Boulevard across from station!)
    for (let i = 0; i < innerEastBlocks.length; i++) {
      const blk = innerEastBlocks[i];
      const sb = getInnerSector(true, blk.zi);
      const bx0 = blk.x0 + 2.0;
      const bx1 = blk.x1 - 2.0;
      const bz0 = blk.z0 + 2.2;
      const bz1 = blk.z1 - 2.2;
      const midX = (bx0 + bx1) * 0.5;
      if (blk.zi === 0) {
        // Leave outer SE corner half open for SE Pos Ronda & Warung Kopi Hub
        buildLShapedTower(sb, bx0 + 1.0, bz0 + 1.0, midX - 1.0, bz1 - 1.0, 0, 26.0);
      } else if (blk.zi === 1) {
        buildRukoRow(sb, bx0, bz0, midX - 1.5, bz1, 'west', 5, true);
        buildLShapedTower(sb, midX + 0.5, bz0 + 1.0, bx1, bz1 - 1.0, 1, 26.0);
      } else if (blk.zi === 2) {
        // Hero Block E3 directly across East Boulevard from Main Concourse Entrance:
        // Leave front 10m open as a walkable pocket plaza & build iconic Chamfered Tower + Café Ruko behind it!
        buildChamferedTower(sb, bx0 + 9.0, bz0 + 1.5, bx1 - 0.5, bz1 - 8.5, 38.0);
        buildRukoRow(sb, bx0 + 1.0, bz1 - 7.5, bx1 - 1.0, bz1, 'north', 4, false);
      } else if (blk.zi === 3) {
        buildUCourtyardComplex(sb, bx0, bz0, bx1, bz1, 'west', 15.5);
      } else {
        // Leave outer NE corner half open for NE Expedition Logistics Yard & Security Booth
        buildDiagonalCivic(sb, bx0 + 1.0, bz0 + 1.0, midX - 1.0, bz1 - 1.0, 18.0);
      }
    }
    }

    function buildOuterBlocksStage() {
    // Populate Outer West & East Jakarta CBD Skyline Blocks (tall non-square towers > 80m -> Far Sectors w/ LOD1!)
    const outerSets = [
      { blks: outerWestBlocks, sb: sectorBuckets.Sector_W_Far, openSide: 'east' },
      { blks: outerEastBlocks, sb: sectorBuckets.Sector_E_Far, openSide: 'west' }
    ];
    for (let s = 0; s < outerSets.length; s++) {
      const { blks, sb, openSide } = outerSets[s];
      for (let i = 0; i < blks.length; i++) {
        const blk = blks[i];
        const bx0 = blk.x0 + 2.5;
        const bx1 = blk.x1 - 2.5;
        const bz0 = blk.z0 + 2.5;
        const bz1 = blk.z1 - 2.5;
        const h = (arch && arch.id === 'harjamukti' ? 18 : 32) + rng() * 26;
        const kind = (i + s) % 4;
        if (kind === 0) buildLShapedTower(sb, bx0, bz0, bx1, bz1, (i + s) % 4, h);
        else if (kind === 1) buildChamferedTower(sb, bx0, bz0, bx1, bz1, h);
        else if (kind === 2) buildUCourtyardComplex(sb, bx0, bz0, bx1, bz1, openSide, Math.min(h, 22));
        else buildDiagonalCivic(sb, bx0, bz0, bx1, bz1, Math.min(h, 24));
      }
    }
    }

    function buildStreetInfraStage() {
    // =========================================================
    // 5. RAIL CORRIDOR CHAINLINK FENCES, UTILITY POLES & CATENARY CABLES
    // =========================================================

    // Rail right-of-way chainlink fences & concrete barriers guarding open track gaps (leaving z = ±74 level crossings & station plazas OPEN!)
    const fenceRuns = [
      { x: cMinX + 0.15, z0: southCrossZ1 + 1.5, z1: platMinZ - 2.5, ry: Math.PI * 0.5 },
      { x: cMinX + 0.15, z0: platMaxZ + 2.5, z1: northCrossZ0 - 1.5, ry: Math.PI * 0.5 },
      { x: cMaxX - 0.15, z0: southCrossZ1 + 1.5, z1: platMinZ - 2.5, ry: Math.PI * 0.5 },
      { x: cMaxX - 0.15, z0: platMaxZ + 2.5, z1: northCrossZ0 - 1.5, ry: Math.PI * 0.5 },
      { x: cMinX + 0.15, z0: -118.0, z1: southCrossZ0 - 1.5, ry: Math.PI * 0.5 },
      { x: cMaxX - 0.15, z0: -118.0, z1: southCrossZ0 - 1.5, ry: Math.PI * 0.5 },
      { x: cMinX + 0.15, z0: northCrossZ1 + 1.5, z1: 118.0, ry: Math.PI * 0.5 },
      { x: cMaxX - 0.15, z0: northCrossZ1 + 1.5, z1: 118.0, ry: Math.PI * 0.5 }
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
      city._addCollider(run.x - 0.14, SIDEWALK_Y, run.z0, run.x + 0.14, SIDEWALK_Y + 1.8, run.z1, 'metal', { blocksBullets: false });
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
        city._addCollider(pr.x - 0.22, SIDEWALK_Y, pz - 0.22, pr.x + 0.22, SIDEWALK_Y + poleHeight, pz + 0.22, 'metal', { blocksBullets: false });
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

    // Streetlamps along Boulevards, Station Promenade Portals & Level Crossings (3 Pooled PointLights + emissive bulbs on ALL poles!)
    const lampSpecs = [
      // East inner promenade curb (along East Boulevard & station portals)
      { x: eastInnerSwMaxX - 0.55, z: -88, ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: -66, ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: -41, ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: -20, ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: 0,   ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: 20,  ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: 41,  ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: 66,  ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: 88,  ry: 0, lit: true },
      // West inner promenade curb (along West Boulevard & platform edges)
      { x: westInnerSwMinX + 0.55, z: -88, ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: -66, ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: -41, ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: -18, ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: 0,   ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: 18,  ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: 41,  ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: 66,  ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: 88,  ry: Math.PI, lit: true },
      // Outer boulevard curbs
      { x: eastOuterSwMinX + 0.55, z: -42, ry: Math.PI, lit: true },
      { x: eastOuterSwMinX + 0.55, z: 42,  ry: Math.PI, lit: true },
      { x: westOuterSwMaxX - 0.55, z: -42, ry: 0, lit: true },
      { x: westOuterSwMaxX - 0.55, z: 42,  ry: 0, lit: true },
      // Level crossing flank lamps (z = ±74 crossings)
      { x: cMinX - 2.2, z: CROSSING_Z_SOUTH - 6.8, ry: -Math.PI * 0.5, lit: true },
      { x: cMaxX + 2.2, z: CROSSING_Z_SOUTH - 6.8, ry: -Math.PI * 0.5, lit: true },
      { x: cMinX - 2.2, z: CROSSING_Z_NORTH + 6.8, ry: Math.PI * 0.5, lit: true },
      { x: cMaxX + 2.2, z: CROSSING_Z_NORTH + 6.8, ry: Math.PI * 0.5, lit: true }
    ];
    for (let i = 0; i < lampSpecs.length; i++) {
      const ls = lampSpecs[i];
      lampPlacements.push({ x: ls.x, y: SIDEWALK_Y, z: ls.z, ry: ls.ry });
      city._addCollider(ls.x - 0.18, SIDEWALK_Y, ls.z - 0.18, ls.x + 0.18, SIDEWALK_Y + 4.8, ls.z + 0.18, 'metal', { blocksBullets: false });

      const headX = ls.x + Math.cos(ls.ry) * 1.05;
      const headZ = ls.z - Math.sin(ls.ry) * 1.05;

      if (ls.lit) {
        city.litLampPositions.push({
          x: headX,
          y: SIDEWALK_Y + 4.05,
          z: headZ,
          flicker: (i % 3 === 2)
        });
      }
    }
    // Register the 4 Far-Corner Hub focal lighting anchors into the pooled streetlamp system (zero extra PointLights!)
    city.litLampPositions.push(
      { x: cornerHubCoords.NW.cx + 3.2, y: SIDEWALK_Y + 3.3, z: cornerHubCoords.NW.cz + 2.0, flicker: false },
      { x: cornerHubCoords.NE.cx + 2.8, y: SIDEWALK_Y + 3.0, z: cornerHubCoords.NE.cz + 1.0, flicker: false },
      { x: cornerHubCoords.SW.cx + 3.4, y: SIDEWALK_Y + 3.2, z: cornerHubCoords.SW.cz + 1.6, flicker: true },
      { x: cornerHubCoords.SE.cx - 0.5, y: SIDEWALK_Y + 2.55, z: cornerHubCoords.SE.cz - 2.4, flicker: false }
    );
    // Emit 3 persistent pooled streetlamp PointLights (attached to main scene so NUM_POINT_LIGHTS never shifts!)
    const poolTargetScene = o.scene || (window.__LRT_INTERNAL__ && window.__LRT_INTERNAL__.core && window.__LRT_INTERNAL__.core.scene) || root;
    const poolCount = Math.min(3, city.litLampPositions.length);
    const initialStreetFactor = Math.max(0, streetLampIntensity / 1.8);
    const parentWorldZ = (root && root.parent && root.parent.position) ? (root.parent.position.z || 0) : 0;
    for (let pi = 0; pi < poolCount; pi++) {
      const lp = city.litLampPositions[pi];
      const baseInt = 16.0;
      const initInt = city._isBuilding ? 0.0 : (baseInt * initialStreetFactor);
      const ptLight = typeof city._acquirePooledLight === 'function'
        ? city._acquirePooledLight(pi, poolTargetScene, 0xffa84c, initInt, 48, 1.05)
        : new THREE.PointLight(0xffa84c, initInt, 48, 1.05);
      ptLight.position.set(lp.x, lp.y, lp.z + parentWorldZ);
      ptLight.visible = true; // NEVER toggle visible! Control strictly via intensity.
      ptLight.castShadow = false;
      if (typeof city._acquirePooledLight !== 'function') root.add(ptLight);
      city.streetLights.push({
        light: ptLight,
        baseIntensity: baseInt,
        kind: 'streetlamp',
        flicker: !!lp.flicker,
        _distScale: 1.0
      });
    }

    // Helper for rotated vehicle colliders & BVH hulls
    const addVehicleHull = (x, y, z, ry, halfW, halfL, bodyH, cabW, cabH, cabL) => {
      const cos = Math.abs(Math.cos(ry));
      const sin = Math.abs(Math.sin(ry));
      const hx = cos * halfW + sin * halfL;
      const hz = sin * halfW + cos * halfL;
      city._addCollider(x - hx, y, z - hz, x + hx, y + bodyH + (cabH || 0), z + hz, 'metal', {
        blocksWalk: true, blocksBullets: false
      });
      addBox(bCollHull, halfW * 1.96, bodyH, halfL * 1.96, x, y + bodyH * 0.5, z, 0, ry, 0);
      if (cabH > 0) {
        addBox(bCollHull, cabW, cabH, cabL, x, y + bodyH + cabH * 0.5, z, 0, ry, 0);
      }
    };

    // 1) TNI Patrol Car (covered_car GLTF) near South West checkpoint (~20% total vehicles with roadblocks)
    const convoyCarSpec = { x: westRoadCX + 3.5, z: -46.0, ry: Math.PI + 0.12 };
    carPlacements.push({ x: convoyCarSpec.x, y: STREET_GROUND_Y, z: convoyCarSpec.z, ry: convoyCarSpec.ry });
    addVehicleHull(convoyCarSpec.x, STREET_GROUND_Y, convoyCarSpec.z, convoyCarSpec.ry, 0.92, 2.22, 0.82, 1.62, 0.78, 2.30);

    // 2) Abandoned Indonesian Sedans & MPVs (Avanza/Innova silhouette) in 5 muted urban colors
    const URBAN_CAR_COLORS = [0xb8bec6, 0x202328, 0x6b2228, 0x1e3554, 0xdadfe4];
    const sedanMpvSpecs = [
      { x: eastRoadCX + 3.8, z: -50.0, ry: Math.PI - 0.08, ajar: false, col: 0 },
      { x: eastRoadCX + 3.6, z: -34.0, ry: Math.PI + 0.14, ajar: true,  col: 2 },
      { x: eastRoadCX + 3.7, z: 16.0,  ry: Math.PI - 0.16, ajar: false, col: 3 },
      { x: eastRoadCX + 3.5, z: 49.0,  ry: 0.12,           ajar: true,  col: 1 },
      { x: eastRoadCX + 2.8, z: -90.0, ry: 2.90,           ajar: false, col: 4 },
      { x: westRoadCX - 3.6, z: -52.0, ry: 0.10,           ajar: true,  col: 4 },
      { x: westRoadCX - 3.5, z: -14.0, ry: -0.08,          ajar: false, col: 1 },
      { x: westRoadCX - 3.6, z: 16.0,  ry: 0.16,           ajar: true,  col: 3 },
      { x: westRoadCX - 3.4, z: 89.0,  ry: 0.22,           ajar: false, col: 0 },
      { x: (eastOuterSwMaxX + eastColRoadMinX) * 0.5, z: -24.5, ry: Math.PI * 0.5 + 0.10, ajar: true, col: 2 }
    ];
    for (let i = 0; i < sedanMpvSpecs.length; i++) {
      const vs = sedanMpvSpecs[i];
      const pl = { x: vs.x, y: STREET_GROUND_Y, z: vs.z, ry: vs.ry, color: URBAN_CAR_COLORS[vs.col % URBAN_CAR_COLORS.length] };
      if (vs.ajar) mpvAjarPlacements.push(pl);
      else sedanPlacements.push(pl);
      addVehicleHull(vs.x, STREET_GROUND_Y, vs.z, vs.ry, 0.90, 2.20, 0.80, 1.56, 0.72, 2.24);
    }

    // 3) Blue Bird / JakLingko Angkot Minivans
    const angkotSpecs = [
      { x: eastRoadCX + 3.6, z: 34.0, ry: Math.PI + 0.08 },
      { x: eastRoadCX + 3.2, z: 90.0, ry: -0.18 },
      { x: westRoadCX - 3.5, z: -90.0, ry: Math.PI - 0.14 },
      { x: (westColRoadMaxX + westOuterSwMinX) * 0.5, z: 24.2, ry: -Math.PI * 0.5 - 0.12 }
    ];
    for (let i = 0; i < angkotSpecs.length; i++) {
      const as = angkotSpecs[i];
      angkotPlacements.push({ x: as.x, y: STREET_GROUND_Y, z: as.z, ry: as.ry });
      addVehicleHull(as.x, STREET_GROUND_Y, as.z, as.ry, 0.84, 1.98, 0.88, 1.52, 0.80, 2.80);
    }

    // 4) TransJakarta BRT Bus Wrecks (dramatic tactical cover + BVH hulls, clear of crossings & navGraph spines!)
    const busSpecs = [
      { x: eastRoadCX + 3.8, z: -10.5, ry: Math.PI - 0.10 }, // Across from East Pocket Park & Plaza Lootbox
      { x: westRoadCX - 3.8, z: 38.0,  ry: 0.12 }            // West Boulevard north section
    ];
    for (let i = 0; i < busSpecs.length; i++) {
      const bs = busSpecs[i];
      busPlacements.push({ x: bs.x, y: STREET_GROUND_Y, z: bs.z, ry: bs.ry });
      addVehicleHull(bs.x, STREET_GROUND_Y, bs.z, bs.ry, 1.25, 5.30, 1.55, 2.38, 1.50, 9.80);
    }

    // 5) Abandoned Ojol Motorbikes clustered cleanly along outer-mid promenade curbs (clear of portals/ramps/nav nodes)
    const ojolSpecs = [
      { x: eastInnerSwMaxX - 1.15, z: -38.5, ry: -0.35 },
      { x: eastInnerSwMaxX - 1.25, z: -36.6, ry: -0.22 },
      { x: eastInnerSwMaxX - 1.15, z: 36.6,  ry: 0.30 },
      { x: eastInnerSwMaxX - 1.25, z: 38.4,  ry: 0.18 },
      { x: westInnerSwMinX + 1.15, z: -38.2, ry: Math.PI + 0.28 },
      { x: westInnerSwMinX + 1.25, z: -36.4, ry: Math.PI + 0.15 },
      { x: westInnerSwMinX + 1.15, z: 36.4,  ry: Math.PI - 0.24 },
      { x: westInnerSwMinX + 1.25, z: 38.2,  ry: Math.PI - 0.38 }
    ];
    for (let i = 0; i < ojolSpecs.length; i++) {
      const os = ojolSpecs[i];
      ojolPlacements.push({ x: os.x, y: SIDEWALK_Y, z: os.z, ry: os.ry });
      city._addCollider(os.x - 0.45, SIDEWALK_Y, os.z - 0.90, os.x + 0.45, SIDEWALK_Y + 1.15, os.z + 0.90, 'metal', {
        blocksWalk: true, blocksBullets: false
      });
    }

    // 6) Jakarta Street Dressing: Gerobak Kaki Lima, Overhead Green Highway Gantries, Traffic Signal Poles
    const gerobakSpecs = [
      { x: eastOuterSwMinX + 3.5, z: 7.2,   ry: Math.PI * 0.92 },
      { x: eastInnerSwMaxX - 1.45, z: 34.0, ry: Math.PI * 0.5 },
      { x: westInnerSwMinX + 1.45, z: -34.0, ry: -Math.PI * 0.5 }
    ];
    for (let i = 0; i < gerobakSpecs.length; i++) {
      const gs = gerobakSpecs[i];
      gerobakPlacements.push({ x: gs.x, y: SIDEWALK_Y, z: gs.z, ry: gs.ry });
      city._addCollider(gs.x - 0.65, SIDEWALK_Y, gs.z - 0.95, gs.x + 0.65, SIDEWALK_Y + 1.9, gs.z + 0.95, 'wood', {
        blocksWalk: true, blocksBullets: false
      });
      addBox(bCollHull, 0.90, 1.65, 1.60, gs.x, SIDEWALK_Y + 0.85, gs.z, 0, gs.ry, 0);
    }

    // Overhead Green Highway Gantry Signs over East & West Boulevards (columns strictly on sidewalks!)
    const gantrySpecs = [
      { x0: eastInnerSwMaxX - 0.35, x1: eastOuterSwMinX + 0.35, z: -44.0, signRotY: 0 },
      { x0: westOuterSwMaxX - 0.35, x1: westInnerSwMinX + 0.35, z: 44.0,  signRotY: Math.PI }
    ];
    for (let gi = 0; gi < gantrySpecs.length; gi++) {
      const g = gantrySpecs[gi];
      const cx = (g.x0 + g.x1) * 0.5;
      const span = g.x1 - g.x0;
      const colH = 6.9;
      for (const px of [g.x0, g.x1]) {
        addCylinder(bGantryFrame, 0.22, 0.26, colH, 8, px, SIDEWALK_Y + colH * 0.5, g.z);
        city._addCollider(px - 0.28, SIDEWALK_Y, g.z - 0.28, px + 0.28, SIDEWALK_Y + colH, g.z + 0.28, 'metal', { blocksBullets: false });
      }
      // Overhead horizontal truss beam (y = 5.4..6.8m clear above street!)
      addBox(bGantryFrame, span + 0.6, 0.28, 0.36, cx, SIDEWALK_Y + 6.55, g.z);
      addBox(bGantryFrame, span + 0.6, 0.22, 0.32, cx, SIDEWALK_Y + 5.45, g.z);
      // Green highway directional signboard mounted to truss
      const signGeo = new THREE.BoxGeometry(Math.min(11.5, span - 1.8), 2.15, 0.16);
      if (g.signRotY) signGeo.rotateY(g.signRotY);
      signGeo.translate(cx, SIDEWALK_Y + 6.05, g.z);
      bGantrySign.push(prepGeo(signGeo, false));
    }

    // Traffic Signal Poles at crossing corners (1 Pooled amber PointLight + shader blinking amber!)
    city.trafficSignalPositions = [];
    const sigSpecs = [
      { x: eastInnerSwMaxX - 0.50, z: southCrossZ0 - 0.85, ry: 0 },
      { x: eastOuterSwMinX + 0.50, z: southCrossZ1 + 0.85, ry: Math.PI },
      { x: eastInnerSwMaxX - 0.50, z: northCrossZ0 - 0.85, ry: 0 },
      { x: eastOuterSwMinX + 0.50, z: northCrossZ1 + 0.85, ry: Math.PI },
      { x: westOuterSwMaxX - 0.50, z: southCrossZ0 - 0.85, ry: 0 },
      { x: westInnerSwMinX + 0.50, z: northCrossZ1 + 0.85, ry: Math.PI }
    ];
    for (let si = 0; si < sigSpecs.length; si++) {
      const ss = sigSpecs[si];
      trafficSignalPlacements.push({ x: ss.x, y: SIDEWALK_Y, z: ss.z, ry: ss.ry });
      city._addCollider(ss.x - 0.22, SIDEWALK_Y, ss.z - 0.22, ss.x + 0.22, SIDEWALK_Y + 4.9, ss.z + 0.22, 'metal', { blocksBullets: false });
      city.trafficSignalPositions.push({
        x: ss.x + Math.cos(ss.ry) * 2.45,
        y: SIDEWALK_Y + 4.35,
        z: ss.z - Math.sin(ss.ry) * 2.45
      });
    }
    if (city.trafficSignalPositions.length > 0) {
      const sp0 = city.trafficSignalPositions[0];
      const sigLight = typeof city._acquirePooledLight === 'function'
        ? city._acquirePooledLight(3, poolTargetScene, 0xff941a, 0, 26, 1.15)
        : new THREE.PointLight(0xff941a, 0, 26, 1.15);
      sigLight.position.set(sp0.x, sp0.y, sp0.z + parentWorldZ);
      sigLight.visible = true; // NEVER toggle visible! Control strictly via intensity.
      sigLight.castShadow = false;
      if (typeof city._acquirePooledLight !== 'function') root.add(sigLight);
      city.streetLights.push({
        light: sigLight,
        baseIntensity: 9.0,
        kind: 'traffic',
        flicker: false,
        _distScale: 1.0,
        _blinkScale: 0.0,
        _worldX: sp0.x,
        _worldZ: sp0.z + parentWorldZ
      });
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
      city._addCollider(bs.x - hx, by, bs.z - hz, bs.x + hx, by + 0.85, bs.z + hz, 'concrete', {
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

    // Perimeter World Dressing: Corrugated Zinc Construction Hoardings ("Pagar Proyek") + Elevated Jakarta Toll Viaduct Overpasses (z = ±130) + Guardhouse Shacks
    const hoardZs = [-118.4, 118.4];
    for (let hi = 0; hi < hoardZs.length; hi++) {
      const hz = hoardZs[hi];
      const dir = hi === 0 ? -1 : 1;
      for (const [hx0, hx1] of [[DIST_X_MIN, cMinX - 0.8], [cMaxX + 0.8, DIST_X_MAX]]) {
        const hw = hx1 - hx0;
        const hcx = (hx0 + hx1) * 0.5;
        // Corrugated steel/zinc construction hoarding backing right behind roadblocks & fences
        addBox(bSteelDark, hw, 2.55, 0.26, hcx, STREET_GROUND_Y + 1.28, hz);
        addBox(bJpo, hw, 0.28, 0.30, hcx, STREET_GROUND_Y + 2.35, hz);
        // Checkpoint guardhouse container / booth near main avenue shoulders
        const boothX = hx0 < 0 ? westRoadMaxX - 1.6 : eastRoadMinX + 1.6;
        addBox(bInfraConcrete, 3.2, 2.85, 4.2, boothX, STREET_GROUND_Y + 1.425, hz + dir * 2.6, 0, 0, 0, 2.5);
        addBox(bCornerGlass, 2.6, 0.95, 0.10, boothX, STREET_GROUND_Y + 1.85, hz + dir * 0.48);
        addBox(bSteelDark, 3.5, 0.24, 4.5, boothX, STREET_GROUND_Y + 2.95, hz + dir * 2.6);
        addBox(bAmber, 0.30, 0.22, 0.30, boothX, STREET_GROUND_Y + 3.16, hz + dir * 2.6);
      }
      // Elevated Jakarta Inner-Ring Toll Viaduct Bridge spanning continuously across entire X width & rail corridor (y = 7.4m deck)
      const bridgeZ = hz + dir * 13.0;
      const bX0 = DIST_X_MIN - 32.0;
      const bX1 = DIST_X_MAX + 32.0;
      const bW = bX1 - bX0;
      const bCX = (bX0 + bX1) * 0.5;
      addBox(bInfraConcrete, bW, 0.85, 11.6, bCX, 7.425, bridgeZ, 0, 0, 0, 6.0);
      addBox(bInfraConcrete, bW, 1.05, 0.45, bCX, 8.375, bridgeZ - 5.55, 0, 0, 0, 4.0);
      addBox(bInfraConcrete, bW, 1.05, 0.45, bCX, 8.375, bridgeZ + 5.55, 0, 0, 0, 4.0);
      addBox(bInfraConcrete, bW, 0.72, 0.36, bCX, 8.21, bridgeZ, 0, 0, 0, 4.0);
      for (const [bx0, bx1] of [[bX0, cMinX - 2.1], [cMaxX + 2.1, bX1]]) {
        const bw = bx1 - bx0;
        if (bw > 0.5) {
          addBox(bInfraConcrete, bw, 1.00, 7.2, (bx0 + bx1) * 0.5, 6.50, bridgeZ, 0, 0, 0, 4.0);
        }
      }
      for (let px = bX0 + 8.0; px <= bX1 - 6.0; px += 20.0) {
        if (px >= cMinX - 4.2 && px <= cMaxX + 4.2) continue;
        addBox(bInfraConcrete, 2.6, 7.0, 3.2, px, 2.50, bridgeZ, 0, 0, 0, 4.0);
        addBox(bSteelDark, 3.0, 0.48, 5.4, px, 5.76, bridgeZ);
      }

      // Twin-Bore Concrete Rail Tunnel Portal & Wing Retaining Walls directly beneath viaduct (z = ±133.5m)
      const sortedTracks = trackXs.slice().sort((a, b) => a - b);
      const pMinX = cMinX - 2.0;
      const pMaxX = cMaxX + 2.0;
      const pSpanX = pMaxX - pMinX;
      const pMidX = (pMinX + pMaxX) * 0.5;
      const portalZ = dir * 133.5;
      const boreHalfW = 1.92;
      const boreBotY = -1.35;
      const boreTopY = 4.65;
      const boreH = boreTopY - boreBotY;
      const boreMidY = (boreBotY + boreTopY) * 0.5;
      const collarZ = portalZ - dir * 1.54;

      let curX = pMinX;
      for (let ti = 0; ti < sortedTracks.length; ti++) {
        const tx = sortedTracks[ti];
        const bL = tx - boreHalfW;
        const bR = tx + boreHalfW;
        const pierW = bL - curX;
        if (pierW > 0.04) {
          addBox(bInfraConcrete, pierW, boreH, 3.2, (curX + bL) * 0.5, boreMidY, portalZ, 0, 0, 0, 2.5);
        }
        // Corner haunches & dark steel bore collar frame (clears train halfWidth 1.37m & HVAC 3.80m)
        addBox(bInfraConcrete, 0.36, 0.42, 0.36, bL + 0.18, boreTopY - 0.21, collarZ);
        addBox(bInfraConcrete, 0.36, 0.42, 0.36, bR - 0.18, boreTopY - 0.21, collarZ);
        addBox(bSteelDark, 0.22, boreH, 0.24, bL + 0.09, boreMidY, collarZ - dir * 0.06);
        addBox(bSteelDark, 0.22, boreH, 0.24, bR - 0.09, boreMidY, collarZ - dir * 0.06);
        addBox(bSteelDark, boreHalfW * 2.0 + 0.20, 0.26, 0.28, tx, boreTopY + 0.13, collarZ - dir * 0.06);

        // Red tunnel block signal head mounted on concrete headwall above each bore opening
        const sigZ = portalZ - dir * 1.72;
        addBox(bSteelDark, 0.42, 0.68, 0.24, tx - 1.25, 5.20, sigZ);
        addBox(bSteelDark, 0.32, 0.08, 0.28, tx - 1.25, 5.42, sigZ - dir * 0.12);
        addBox(bTunnelSignalRed, 0.22, 0.22, 0.08, tx - 1.25, 5.28, sigZ - dir * 0.12);
        addBox(bTunnelSignalRed, 0.16, 0.16, 0.08, tx - 1.25, 5.02, sigZ - dir * 0.12);

        // Pitch-black interior tunnel bore liner walls (visual-only, zero colliders/BVH)
        addBox(bTunnelDark, 0.16, boreH + 0.10, 10.8, bL - 0.08, boreMidY, dir * 140.2);
        addBox(bTunnelDark, 0.16, boreH + 0.10, 10.8, bR + 0.08, boreMidY, dir * 140.2);
        // Interior concrete tunnel ribs at 3m spacing
        for (const ribAbsZ of [137.0, 140.0, 143.0]) {
          const ribZ = dir * ribAbsZ;
          addBox(bInfraConcrete, 0.20, boreH - 0.10, 0.42, bL + 0.10, boreMidY - 0.05, ribZ);
          addBox(bInfraConcrete, 0.20, boreH - 0.10, 0.42, bR - 0.10, boreMidY - 0.05, ribZ);
          addBox(bInfraConcrete, boreHalfW * 2.0, 0.20, 0.42, tx, boreTopY - 0.10, ribZ);
        }
        // Overhead longitudinal catenary contact & messenger wires
        addBox(bCables, 0.035, 0.035, 22.0, tx, 4.35, dir * 125.0);
        addBox(bCables, 0.030, 0.030, 22.0, tx, 4.95, dir * 125.0);
        curX = bR;
      }
      if (pMaxX - curX > 0.04) {
        addBox(bInfraConcrete, pMaxX - curX, boreH, 3.2, (curX + pMaxX) * 0.5, boreMidY, portalZ, 0, 0, 0, 2.5);
      }
      // Solid concrete headwall + coping cap flush against viaduct soffit (y = 7.00m)
      addBox(bInfraConcrete, pSpanX, 2.10, 3.2, pMidX, 5.70, portalZ, 0, 0, 0, 3.0);
      addBox(bInfraConcrete, pSpanX + 0.4, 0.25, 3.5, pMidX, 6.875, portalZ - dir * 0.15, 0, 0, 0, 3.0);

      // Wing retaining walls flanking approach (z = dir * 124 .. dir * 132)
      for (const wx of [cMinX - 1.25, cMaxX + 1.25]) {
        addBox(bInfraConcrete, 1.5, 4.4, 4.1, wx, 0.85, dir * 126.0, 0, 0, 0, 2.5);
        addBox(bInfraConcrete, 1.75, 0.22, 4.2, wx, 3.16, dir * 126.0, 0, 0, 0, 2.5);
        addBox(bInfraConcrete, 1.7, 6.5, 4.1, wx, 1.90, dir * 130.0, 0, 0, 0, 2.5);
        addBox(bInfraConcrete, 1.95, 0.24, 4.2, wx, 5.27, dir * 130.0, 0, 0, 0, 2.5);
      }
      // Trackside auxiliary tunnel block signal heads on portal flanks
      for (const sx of [cMinX - 0.90, cMaxX + 0.90]) {
        const msZ = portalZ - dir * 1.72;
        addBox(bSteelDark, 0.34, 0.72, 0.24, sx, 2.95, msZ);
        addBox(bTunnelSignalRed, 0.18, 0.18, 0.08, sx, 3.08, msZ - dir * 0.12);
        addBox(bTunnelSignalRed, 0.18, 0.18, 0.08, sx, 2.78, msZ - dir * 0.12);
      }
      // Pitch-black interior chamber ceiling, outer walls & far blackout plate (visual-only, NO collider/BVH)
      addBox(bTunnelDark, pSpanX, 0.26, 11.2, pMidX, boreTopY + 0.13, dir * 140.4);
      addBox(bTunnelDark, 0.30, boreH + 0.30, 11.2, pMinX + 0.15, boreMidY + 0.05, dir * 140.4);
      addBox(bTunnelDark, 0.30, boreH + 0.30, 11.2, pMaxX - 0.15, boreMidY + 0.05, dir * 140.4);
      addBox(bTunnelDark, pSpanX, boreH + 0.40, 0.40, pMidX, boreMidY + 0.10, dir * 145.6);

      // Overhead steel catenary gantries along outer track approach (z = ±120.5m & ±127.0m)
      const gantrySpan = cMaxX - cMinX;
      for (const gAbsZ of [120.5, 127.0]) {
        const gz = dir * gAbsZ;
        addBox(bSteelDark, 0.30, 7.0, 0.30, cMinX + 0.22, 2.15, gz);
        addBox(bSteelDark, 0.30, 7.0, 0.30, cMaxX - 0.22, 2.15, gz);
        if (gantrySpan > 12.0 && sortedTracks.every((tx) => Math.abs(tx - pMidX) > 2.3)) {
          addBox(bSteelDark, 0.28, 7.0, 0.28, pMidX, 2.15, gz);
        }
        addBox(bSteelDark, gantrySpan, 0.28, 0.30, (cMinX + cMaxX) * 0.5, 5.45, gz);
        addBox(bSteelDark, gantrySpan, 0.18, 0.22, (cMinX + cMaxX) * 0.5, 4.65, gz);
        for (let ti = 0; ti < sortedTracks.length; ti++) {
          addBox(bSteelDark, 0.08, 0.90, 0.08, sortedTracks[ti], 4.82, gz);
        }
      }
    }
    // Outer East & West End Boundary Hoardings behind cross-street ends (x = DIST_X_MIN - 0.6 & DIST_X_MAX + 0.6)
    for (let ci = 0; ci < crossExits.length; ci++) {
      const [cz0, cz1] = crossExits[ci];
      const cw = cz1 - cz0;
      const cmz = (cz0 + cz1) * 0.5;
      addBox(bSteelDark, 0.30, 2.65, cw + 1.0, DIST_X_MIN - 0.5, STREET_GROUND_Y + 1.325, cmz);
      addBox(bJpo, 0.34, 0.28, cw + 1.0, DIST_X_MIN - 0.5, STREET_GROUND_Y + 2.45, cmz);
      addBox(bSteelDark, 0.30, 2.65, cw + 1.0, DIST_X_MAX + 0.5, STREET_GROUND_Y + 1.325, cmz);
      addBox(bJpo, 0.34, 0.28, cw + 1.0, DIST_X_MAX + 0.5, STREET_GROUND_Y + 2.45, cmz);
    }

    // Rail Corridor Security Gates at z = ±108.0 (x in [cMinX - 0.6 .. cMaxX + 0.6])
    const railGateZs = [-108.0, 108.0];
    for (let gi = 0; gi < railGateZs.length; gi++) {
      const gz = railGateZs[gi];
      addBox(bSteelDark, 0.6, 5.8, 0.6, cMinX + 0.3, RAIL_TOP_Y + 2.9, gz);
      addBox(bSteelDark, 0.6, 5.8, 0.6, cMaxX - 0.3, RAIL_TOP_Y + 2.9, gz);
      addBox(bSteelDark, (cMaxX - cMinX) + 1.30, 0.5, 0.6, (cMinX + cMaxX) * 0.5, RAIL_TOP_Y + 5.5, gz);
      addBox(bAmber, 0.26, 0.26, 0.26, cMinX + 0.3, RAIL_TOP_Y + 5.95, gz);
      addBox(bAmber, 0.26, 0.26, 0.26, cMaxX - 0.3, RAIL_TOP_Y + 5.95, gz);

      // Extended security fence wings & static colliders closing sidewalk gap around gate posts
      for (const side of [
        { cx: cMinX - 0.30, x0: cMinX - 0.68, x1: cMinX + 0.08, postX: cMinX - 0.62, barrierX: cMinX - 0.35 },
        { cx: cMaxX + 0.30, x0: cMaxX - 0.08, x1: cMaxX + 0.68, postX: cMaxX + 0.62, barrierX: cMaxX + 0.35 }
      ]) {
        addBox(bSteelDark, 0.14, 2.35, 0.14, side.postX, SIDEWALK_Y + 1.175, gz);
        addBox(bSteelDark, 0.72, 0.08, 0.08, side.cx, SIDEWALK_Y + 2.25, gz);
        addBox(bSteelDark, 0.72, 0.08, 0.08, side.cx, SIDEWALK_Y + 1.20, gz);
        addBox(bSteelDark, 0.72, 0.08, 0.08, side.cx, SIDEWALK_Y + 0.22, gz);
        for (const pxOff of [-0.22, 0.0, 0.22]) {
          addBox(bSteelDark, 0.05, 2.15, 0.05, side.cx + pxOff, SIDEWALK_Y + 1.15, gz);
        }
        city._addCollider(side.x0, RAIL_TOP_Y, gz - 0.35, side.x1, RAIL_TOP_Y + 3.5, gz + 0.35, 'metal', {
          blocksWalk: true, blocksBullets: false
        });
        addBox(bCollHull, side.x1 - side.x0, 3.5, 0.70, (side.x0 + side.x1) * 0.5, RAIL_TOP_Y + 1.75, gz);

        // Concrete Jersey barrier flanking each gate post
        barrierPlacements.push({ x: side.barrierX, y: SIDEWALK_Y, z: gz, ry: 0 });
        city._addCollider(side.barrierX - 0.78, SIDEWALK_Y, gz - 0.34, side.barrierX + 0.78, SIDEWALK_Y + 0.85, gz + 0.34, 'concrete', {
          blocksWalk: true, blocksBullets: false
        });
        addBox(bCollHull, 1.56, 0.85, 0.66, side.barrierX, SIDEWALK_Y + 0.425, gz, 0, 0, 0);
      }

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
      city.disposableGeometries.push(gateMesh.geometry);
      root.add(gateGroup);

      const col = city._addCollider(cMinX, RAIL_TOP_Y, gz - 0.35, cMaxX, RAIL_TOP_Y + 3.5, gz + 0.35, 'metal', {
        blocksWalk: true,
        blocksBullets: false
      });
      col.isTrackGate = true;
      city.trackGates.push({ group: gateGroup, gateMesh, collider: col, z: gz });
    }

    // Sidewalk Street Furniture & Details (Hydrants, Manholes, Grounded PLN Feeder Pillars, Trash Cans, Trash Bags)
    for (const hz of [-54, -14, 14, 54]) {
      hydrantPlacements.push({ x: eastOuterSwMinX + 0.7, y: SIDEWALK_Y, z: hz, ry: -Math.PI * 0.5 });
      hydrantPlacements.push({ x: westOuterSwMaxX - 0.7, y: SIDEWALK_Y, z: hz + 6, ry: Math.PI * 0.5 });
      manholePlacements.push({ x: eastRoadCX - 1.8, y: STREET_GROUND_Y + 0.01, z: hz + 4, ry: 0 });
      manholePlacements.push({ x: westRoadCX + 1.8, y: STREET_GROUND_Y + 0.01, z: hz - 4, ry: 0 });
      trashCanPlacements.push({ x: eastInnerSwMaxX - 0.85, y: SIDEWALK_Y, z: hz + 3, ry: 0 });
      trashCanPlacements.push({ x: westInnerSwMinX + 0.85, y: SIDEWALK_Y, z: hz - 3, ry: Math.PI });
      trashBagPlacements.push({ x: eastInnerSwMaxX - 1.45, y: SIDEWALK_Y, z: hz + 3.4, ry: rng() * 3 });
      trashBagPlacements.push({ x: eastOuterSwMinX + 1.2, y: SIDEWALK_Y, z: hz + 0.6, ry: rng() * 3 });
    }
    // Grounded outer-curb PLN feeder pillars well clear of food carts / gerobak
    for (const pbZ of [-56, -34, 34, 56]) {
      powerBoxPlacements.push({ x: eastOuterSwMinX + 1.35, y: SIDEWALK_Y, z: pbZ, ry: -Math.PI * 0.5 });
      powerBoxPlacements.push({ x: westOuterSwMaxX - 1.35, y: SIDEWALK_Y, z: pbZ - 4, ry: Math.PI * 0.5 });
      city._addCollider(eastOuterSwMinX + 1.05, SIDEWALK_Y, pbZ - 0.42, eastOuterSwMinX + 1.65, SIDEWALK_Y + 1.5, pbZ + 0.42, 'metal', { blocksBullets: false });
      city._addCollider(westOuterSwMaxX - 1.65, SIDEWALK_Y, pbZ - 4.42, westOuterSwMaxX - 1.05, SIDEWALK_Y + 1.5, pbZ - 3.58, 'metal', { blocksBullets: false });
    }

    // East Pocket Park Plaza (Block E3 front apron at z in [-14..+6], x = eastOuterSwMinX + 1.5..+7.5)
    for (const pz of [-9.5, -3.5, 3.5]) {
      seatingPlacements.push({ x: parkX, y: SIDEWALK_Y, z: pz, ry: -Math.PI * 0.5 });
      city._addCollider(parkX - 0.45, SIDEWALK_Y, pz - 0.95, parkX + 0.45, SIDEWALK_Y + 0.85, pz + 0.95, 'wood', { blocksBullets: false });
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
      city._addCollider(tx - 0.28, SIDEWALK_Y, tz - 0.28, tx + 0.28, SIDEWALK_Y + 3.5, tz + 0.28, 'wood', { blocksBullets: false });
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

    // 4 Far-Corner City Exploration Hubs (NW PMI Medpost, NE Logistics Depot, SW Military Convoy, SE Poskamling & Warung)
    (function buildCornerHubsStaticStage() {
      const NW = cornerHubCoords.NW;
      const NE = cornerHubCoords.NE;
      const SW = cornerHubCoords.SW;
      const SE = cornerHubCoords.SE;

      // --- 1) NW CORNER: Posko Medis Darurat PMI & Ambulans ---
      {
        const cx = NW.cx;
        const tentZ = 100.8;
        // Weatherproof rubberized triage pad floor
        addBox(bSteelDark, 7.6, 0.05, 5.4, cx, SIDEWALK_Y + 0.025, tentZ);
        // Tent corner steel stanchions (colliders on posts only, open walk-in canopy)
        for (const [px, pz] of [
          [cx - 3.45, tentZ - 2.35], [cx + 3.45, tentZ - 2.35],
          [cx - 3.45, tentZ + 2.35], [cx + 3.45, tentZ + 2.35]
        ]) {
          addBox(bSteelDark, 0.12, 2.95, 0.12, px, SIDEWALK_Y + 1.475, pz);
          city._addCollider(px - 0.12, SIDEWALK_Y, pz - 0.12, px + 0.12, SIDEWALK_Y + 2.95, pz + 0.12, 'metal', { blocksBullets: false });
        }
        // White PMI canopy roof + red perimeter valance & Red Cross emblem
        addHippedRoof(bCornerWhite, cx - 3.6, tentZ - 2.5, cx + 3.6, tentZ + 2.5, SIDEWALK_Y + 2.90, 1.05, 0.35, 2.0);
        addBox(bCornerRed, 7.4, 0.24, 0.08, cx, SIDEWALK_Y + 2.82, tentZ - 2.52);
        addBox(bCornerRed, 7.4, 0.24, 0.08, cx, SIDEWALK_Y + 2.82, tentZ + 2.52);
        addBox(bCornerRed, 0.90, 0.26, 0.08, cx, SIDEWALK_Y + 3.25, tentZ - 2.56);
        addBox(bCornerRed, 0.26, 0.90, 0.08, cx, SIDEWALK_Y + 3.25, tentZ - 2.56);
        addBox(bCornerWarmBulb, 1.6, 0.08, 0.14, cx, SIDEWALK_Y + 2.86, tentZ);
        // Main medical examination table & interactive Kotak Medis Darurat PMI
        const medX = cx + 0.25, medZ = 101.3;
        addBox(bSteelDark, 2.1, 0.76, 0.90, medX, SIDEWALK_Y + 0.38, medZ);
        addBox(bCornerWhite, 2.2, 0.08, 0.96, medX, SIDEWALK_Y + 0.80, medZ);
        addBox(bCornerWhite, 0.56, 0.24, 0.38, medX, SIDEWALK_Y + 0.96, medZ);
        addBox(bCornerRed, 0.24, 0.06, 0.06, medX, SIDEWALK_Y + 1.09, medZ);
        addBox(bCornerRed, 0.06, 0.06, 0.24, medX, SIDEWALK_Y + 1.09, medZ);
        // IV drip stand beside triage table
        addCylinder(bSteelDark, 0.025, 0.03, 2.05, 6, medX + 1.35, SIDEWALK_Y + 1.025, medZ + 0.15);
        addBox(bCornerWhite, 0.14, 0.22, 0.08, medX + 1.25, SIDEWALK_Y + 1.88, medZ + 0.15);
        city._addCollider(medX - 1.12, SIDEWALK_Y, medZ - 0.50, medX + 1.12, SIDEWALK_Y + 1.05, medZ + 0.50, 'metal', { blocksBullets: false });
        addBox(bCollHull, 2.24, 1.05, 1.00, medX, SIDEWALK_Y + 0.525, medZ);
        // Folding desk holding note_nw_corner
        const deskX = cx - 2.1, deskZ = 100.9;
        addBox(bSteelDark, 0.96, 0.76, 0.64, deskX, SIDEWALK_Y + 0.38, deskZ);
        addBox(bCornerWood, 1.04, 0.06, 0.70, deskX, SIDEWALK_Y + 0.79, deskZ);
        city._addCollider(deskX - 0.54, SIDEWALK_Y, deskZ - 0.36, deskX + 0.54, SIDEWALK_Y + 0.84, deskZ + 0.36, 'wood', { blocksBullets: false });
        // Floodlight tripod mast + warm flood head
        const mastX = cx + 4.8, mastZ = 99.8;
        addCylinder(bSteelDark, 0.04, 0.06, 3.8, 6, mastX, SIDEWALK_Y + 1.9, mastZ);
        addBox(bSteelDark, 0.72, 0.28, 0.24, mastX, SIDEWALK_Y + 3.85, mastZ, 0, -0.45, 0);
        addBox(bCornerWarmBulb, 0.58, 0.18, 0.08, mastX - 0.05, SIDEWALK_Y + 3.85, mastZ - 0.10, 0, -0.45, 0);
        city._addCollider(mastX - 0.45, SIDEWALK_Y, mastZ - 0.45, mastX + 0.45, SIDEWALK_Y + 3.9, mastZ + 0.45, 'metal', { blocksBullets: false });
        // Ambulance parked on west side of NW lot facing south/collector entrance
        const ambX = cx - 5.2, ambZ = 96.5, ambRy = -0.18;
        ambulancePlacements.push({ x: ambX, y: SIDEWALK_Y, z: ambZ, ry: ambRy });
        city._addCollider(ambX - 1.32, SIDEWALK_Y, ambZ - 2.85, ambX + 1.32, SIDEWALK_Y + 2.45, ambZ + 2.85, 'metal', { blocksBullets: true });
        addBox(bCollHull, 2.35, 2.45, 5.65, ambX, SIDEWALK_Y + 1.225, ambZ, 0, ambRy, 0);
        // Surrounding PMI supply crates & seating
        plasticCratePlacements.push({ x: cx + 2.7, y: SIDEWALK_Y, z: 102.0, ry: 0.25 });
        plasticCratePlacements.push({ x: cx + 2.7, y: SIDEWALK_Y + 0.26, z: 102.0, ry: 0.42 });
        cardboardBoxPlacements.push({ x: cx - 2.9, y: SIDEWALK_Y, z: 99.2, ry: 0.15 });
        monoblocChairPlacements.push({ x: cx + 1.9, y: SIDEWALK_Y, z: 98.4, ry: -0.6 });
        barrierPlacements.push({ x: cx - 6.6, y: SIDEWALK_Y, z: 92.2, ry: 0.25 });
        city._addCollider(cx - 7.38, SIDEWALK_Y, 91.65, cx - 5.82, SIDEWALK_Y + 0.85, 92.75, 'concrete', { blocksBullets: false });
        addBox(bCollHull, 1.56, 0.85, 0.66, cx - 6.6, SIDEWALK_Y + 0.425, 92.2, 0, 0.25, 0);
      }

      // --- 2) NE CORNER: Gudang Logistik Ekspedisi & Pos Sekuriti ---
      {
        const cx = NE.cx;
        const dockY = SIDEWALK_Y + 0.62;
        const dockX0 = cx - 6.0, dockX1 = cx + 4.0, dockZ0 = 100.2, dockZ1 = 108.2;
        const dockW = dockX1 - dockX0, dockD = dockZ1 - dockZ0;
        const dockCX = (dockX0 + dockX1) * 0.5, dockCZ = (dockZ0 + dockZ1) * 0.5;
        // Raised concrete loading bay dock + BVH-walkable front ramp
        addBox(bInfraConcrete, dockW, 0.62, dockD, dockCX, SIDEWALK_Y + 0.31, dockCZ, 0, 0, 0, 3.0);
        addWedgeRamp(bInfraConcrete, cx - 5.8, 97.4, cx - 2.6, 100.2, SIDEWALK_Y, dockY, 'z', 2.0);
        addBox(bAmber, dockW - 3.6, 0.08, 0.14, cx + 0.9, dockY - 0.04, dockZ0 - 0.03);
        // Front vertical drop collider ONLY east of ramp so ramp walk-on stays smooth!
        city._addCollider(cx - 2.55, SIDEWALK_Y, dockZ0 - 0.18, dockX1, dockY - 0.06, dockZ0 + 0.18, 'concrete', { blocksBullets: false });
        // Corrugated steel warehouse canopy sheltering rear loading bay
        for (const [px, pz] of [
          [dockX0 + 0.35, dockZ0 + 0.45], [dockX1 - 0.35, dockZ0 + 0.45],
          [dockX0 + 0.35, dockZ1 - 0.45], [dockX1 - 0.35, dockZ1 - 0.45]
        ]) {
          addBox(bSteelDark, 0.18, 3.6, 0.18, px, dockY + 1.8, pz);
          city._addCollider(px - 0.16, dockY, pz - 0.16, px + 0.16, dockY + 3.6, pz + 0.16, 'metal', { blocksBullets: false });
        }
        addBox(bCornerRoof, dockW + 0.8, 0.14, dockD + 0.6, dockCX, dockY + 3.68, dockCZ, -0.06, 0, 0);
        addBox(bCornerWarmBulb, 2.2, 0.08, 0.16, dockCX, dockY + 3.55, dockCZ - 0.5);
        // Warehouse parapet walls & railing along north & east edges of dock
        addBox(bSteelDark, dockW, 0.95, 0.14, dockCX, dockY + 0.475, dockZ1 - 0.12);
        city._addCollider(dockX0, dockY, dockZ1 - 0.25, dockX1, dockY + 1.0, dockZ1 + 0.15, 'metal', { blocksBullets: false });

        // Interactive Peti Logistik Gudang Utara on dock apron + cargo pallet stacks
        const depotX = cx + 0.5, depotZ = 102.3;
        palletPlacements.push({ x: depotX, y: dockY, z: depotZ, ry: 0.08 });
        // Multi-part heavy armored Expedition Supply Chest on timber pallet
        addBox(bSteelDark, 0.96, 0.08, 0.68, depotX, dockY + 0.19, depotZ);
        addBox(bCornerRed, 0.88, 0.42, 0.60, depotX, dockY + 0.44, depotZ);
        addBox(bCornerRed, 0.92, 0.10, 0.64, depotX, dockY + 0.68, depotZ);
        // Dark-steel corner angle guards & protective lid rim bands
        for (const [cxOff, czOff] of [[-0.43, -0.29], [0.43, -0.29], [-0.43, 0.29], [0.43, 0.29]]) {
          addBox(bSteelDark, 0.09, 0.54, 0.09, depotX + cxOff, dockY + 0.46, depotZ + czOff);
        }
        addBox(bSteelDark, 0.95, 0.06, 0.67, depotX, dockY + 0.62, depotZ);
        // Side carry handles + twin front padlock clasps & amber stencil band
        addBox(bTruss, 0.05, 0.08, 0.28, depotX - 0.47, dockY + 0.45, depotZ);
        addBox(bTruss, 0.05, 0.08, 0.28, depotX + 0.47, dockY + 0.45, depotZ);
        addBox(bTruss, 0.10, 0.16, 0.05, depotX - 0.24, dockY + 0.56, depotZ - 0.32);
        addBox(bTruss, 0.10, 0.16, 0.05, depotX + 0.24, dockY + 0.56, depotZ - 0.32);
        addBox(bAmber, 0.66, 0.06, 0.04, depotX, dockY + 0.42, depotZ - 0.30);
        addBox(bAmber, 0.66, 0.05, 0.14, depotX, dockY + 0.74, depotZ);
        ammoBoxPlacements.push({ x: depotX - 0.18, y: dockY + 0.73, z: depotZ, ry: 0.14 });
        city._addCollider(depotX - 0.58, dockY, depotZ - 0.48, depotX + 0.58, dockY + 0.76, depotZ + 0.48, 'wood', { blocksBullets: false });
        addBox(bCollHull, 1.16, 0.76, 0.96, depotX, dockY + 0.38, depotZ);

        // Background palletized warehouse freight clusters (off main walkway)
        for (const [px, pz, pry] of [
          [cx - 4.4, 105.6, 0.05], [cx - 2.2, 106.0, -0.06], [cx + 2.4, 105.6, 0.12], [cx + 2.6, 102.4, -0.15]
        ]) {
          palletPlacements.push({ x: px, y: dockY, z: pz, ry: pry });
          plasticCratePlacements.push({ x: px - 0.2, y: dockY + 0.15, z: pz, ry: pry });
          cardboardBoxPlacements.push({ x: px + 0.25, y: dockY + 0.15, z: pz + 0.05, ry: pry + 0.4 });
          city._addCollider(px - 0.68, dockY, pz - 0.58, px + 0.68, dockY + 0.95, pz + 0.58, 'wood', { blocksBullets: false });
        }
        militaryCratePlacements.push({ x: cx - 4.5, y: dockY + 0.15, z: 103.5, ry: 0.1 });
        fuelBarrelPlacements.push({ x: cx - 5.4, y: SIDEWALK_Y, z: 95.8, ry: 0.5 });
        handTruckPlacements.push({ x: cx - 2.2, y: dockY, z: 102.0, ry: -0.7 });

        // Security Gatehouse Booth on east collector edge + manifest counter for note_ne_corner
        const secX = cx + 5.3, secZ = 98.4;
        addBox(bInfraConcrete, 2.4, 2.65, 2.5, secX, SIDEWALK_Y + 1.325, secZ, 0, 0, 0, 2.0);
        addBox(bCornerGlass, 2.48, 0.85, 2.0, secX, SIDEWALK_Y + 1.65, secZ);
        addBox(bCornerRoof, 2.9, 0.18, 3.0, secX, SIDEWALK_Y + 2.74, secZ);
        addBox(bCornerWarmBulb, 0.45, 0.08, 0.45, secX, SIDEWALK_Y + 2.52, secZ);
        city._addCollider(secX - 1.25, SIDEWALK_Y, secZ - 1.30, secX + 1.25, SIDEWALK_Y + 2.8, secZ + 1.30, 'concrete', { blocksBullets: true });
        addBox(bCollHull, 2.5, 2.8, 2.6, secX, SIDEWALK_Y + 1.4, secZ);
        // Manifest desk counter protruding on west booth wall holding note_ne_corner
        addBox(bCornerWood, 0.72, 0.84, 1.45, secX - 1.56, SIDEWALK_Y + 0.42, secZ);
        city._addCollider(secX - 1.94, SIDEWALK_Y, secZ - 0.74, secX - 1.20, SIDEWALK_Y + 0.86, secZ + 0.74, 'wood', { blocksBullets: false });
      }

      // --- 3) SW CORNER: Pos Sekat Militer & Konvoi Taktis ---
      {
        const cx = SW.cx;
        // Multi-course stacked sandbag defensive perimeter facing intersection (+Z shoulder)
        const sbCourses = [
          { x: cx - 0.8, z: -92.4, w: 3.4, ry: -0.10 },
          { x: cx + 2.6, z: -92.8, w: 3.4, ry: 0.12 },
          { x: cx + 4.8, z: -94.6, w: 2.6, ry: 1.22 }
        ];
        for (let si = 0; si < sbCourses.length; si++) {
          const s = sbCourses[si];
          for (let row = 0; row < 3; row++) {
            addBox(bCornerSandbag, s.w - row * 0.12, 0.27, 0.78 - row * 0.06, s.x, SIDEWALK_Y + 0.135 + row * 0.27, s.z, 0, s.ry, 0);
          }
          const cos = Math.abs(Math.cos(s.ry)), sin = Math.abs(Math.sin(s.ry));
          const hx = cos * (s.w * 0.5) + sin * 0.42;
          const hz = sin * (s.w * 0.5) + cos * 0.42;
          city._addCollider(s.x - hx, SIDEWALK_Y, s.z - hz, s.x + hx, SIDEWALK_Y + 0.86, s.z + hz, 'concrete', { blocksBullets: true });
          addBox(bCollHull, s.w, 0.86, 0.82, s.x, SIDEWALK_Y + 0.43, s.z, 0, s.ry, 0);
        }
        // Tactical olive/steel shelter canopy over SW ammo staging area
        const tentX = cx + 1.6, tentZ = -101.6;
        for (const [px, pz] of [
          [tentX - 2.4, tentZ - 1.6], [tentX + 2.4, tentZ - 1.6],
          [tentX - 2.4, tentZ + 1.6], [tentX + 2.4, tentZ + 1.6]
        ]) {
          addBox(bSteelDark, 0.10, 2.85, 0.10, px, SIDEWALK_Y + 1.425, pz);
          city._addCollider(px - 0.12, SIDEWALK_Y, pz - 0.12, px + 0.12, SIDEWALK_Y + 2.85, pz + 0.12, 'metal', { blocksBullets: false });
        }
        addBox(bSteelDark, 5.3, 0.10, 3.7, tentX, SIDEWALK_Y + 2.88, tentZ, 0.05, 0, 0);
        addBox(bCornerWarmBulb, 1.3, 0.08, 0.14, tentX, SIDEWALK_Y + 2.78, tentZ);
        // Interactive Peti Amunisi Konvoi Militer (reinforced military ordnance chest + GLTF ammo box) + operations crate
        const crateX = cx + 1.8, crateZ = -101.2;
        addBox(bCornerWood, 1.12, 0.10, 0.78, crateX, SIDEWALK_Y + 0.05, crateZ);
        addBox(bSteelDark, 1.00, 0.44, 0.68, crateX, SIDEWALK_Y + 0.32, crateZ);
        addBox(bSteelDark, 1.04, 0.11, 0.72, crateX, SIDEWALK_Y + 0.595, crateZ);
        for (const [cxOff, czOff] of [[-0.49, -0.33], [0.49, -0.33], [-0.49, 0.33], [0.49, 0.33]]) {
          addBox(bTruss, 0.08, 0.55, 0.08, crateX + cxOff, SIDEWALK_Y + 0.375, crateZ + czOff);
        }
        addBox(bTruss, 0.06, 0.08, 0.30, crateX - 0.52, SIDEWALK_Y + 0.35, crateZ);
        addBox(bTruss, 0.06, 0.08, 0.30, crateX + 0.52, SIDEWALK_Y + 0.35, crateZ);
        addBox(bTruss, 0.10, 0.16, 0.05, crateX - 0.26, SIDEWALK_Y + 0.48, crateZ + 0.36);
        addBox(bTruss, 0.10, 0.16, 0.05, crateX + 0.26, SIDEWALK_Y + 0.48, crateZ + 0.36);
        addBox(bAmber, 0.72, 0.06, 0.04, crateX, SIDEWALK_Y + 0.33, crateZ + 0.35);
        addBox(bAmber, 0.72, 0.05, 0.14, crateX, SIDEWALK_Y + 0.66, crateZ);
        ammoBoxPlacements.push({ x: crateX - 0.22, y: SIDEWALK_Y + 0.65, z: crateZ, ry: -0.22 });
        city._addCollider(crateX - 0.58, SIDEWALK_Y, crateZ - 0.42, crateX + 0.58, SIDEWALK_Y + 0.68, crateZ + 0.42, 'metal', { blocksBullets: false });
        addBox(bCollHull, 1.16, 0.68, 0.84, crateX, SIDEWALK_Y + 0.34, crateZ);

        const opX = cx - 0.4, opZ = -101.4;
        addBox(bCornerWood, 0.88, 0.70, 0.66, opX, SIDEWALK_Y + 0.35, opZ);
        ammoBoxPlacements.push({ x: opX + 0.22, y: SIDEWALK_Y + 0.70, z: opZ - 0.10, ry: 0.38 });
        city._addCollider(opX - 0.48, SIDEWALK_Y, opZ - 0.36, opX + 0.48, SIDEWALK_Y + 0.72, opZ + 0.36, 'wood', { blocksBullets: false });

        // Tactical warning amber beacon tripod near sandbag corner
        addCylinder(bSteelDark, 0.04, 0.07, 2.2, 6, cx + 4.8, SIDEWALK_Y + 1.1, -93.6);
        addBox(bAmber, 0.28, 0.30, 0.28, cx + 4.8, SIDEWALK_Y + 2.30, -93.6);

        // Tactical Military Utility Truck parked on west apron facing NE
        const trkX = cx - 4.8, trkZ = -101.0, trkRy = 0.38;
        militaryTruckPlacements.push({ x: trkX, y: SIDEWALK_Y, z: trkZ, ry: trkRy });
        city._addCollider(trkX - 1.65, SIDEWALK_Y, trkZ - 3.05, trkX + 1.65, SIDEWALK_Y + 2.65, trkZ + 3.05, 'metal', { blocksBullets: true });
        addBox(bCollHull, 2.38, 2.65, 6.10, trkX, SIDEWALK_Y + 1.325, trkZ, 0, trkRy, 0);

        // Military cargo & barrier dressing
        militaryCratePlacements.push({ x: cx + 3.4, y: SIDEWALK_Y, z: -102.2, ry: -0.25 });
        fuelBarrelPlacements.push({ x: cx - 2.3, y: SIDEWALK_Y, z: -103.5, ry: 0.6 });
        jerrycanPlacements.push({ x: cx - 1.8, y: SIDEWALK_Y, z: -102.8, ry: 1.1 });
        oldTyrePlacements.push({ x: cx + 4.9, y: SIDEWALK_Y, z: -96.5, ry: 0.4 });
        oldTyrePlacements.push({ x: cx + 4.9, y: SIDEWALK_Y + 0.165, z: -96.5, ry: 1.1 });
        barrierPlacements.push({ x: cx - 6.6, y: SIDEWALK_Y, z: -92.0, ry: -0.20 });
        city._addCollider(cx - 7.38, SIDEWALK_Y, -92.55, cx - 5.82, SIDEWALK_Y + 0.85, -91.45, 'concrete', { blocksBullets: false });
        addBox(bCollHull, 1.56, 0.85, 0.66, cx - 6.6, SIDEWALK_Y + 0.425, -92.0, 0, -0.20, 0);
      }

      // --- 4) SE CORNER: Poskamling RT/RW & Warung Kopi Malam ---
      {
        const cx = SE.cx;
        const posX = cx - 1.6, posZ = -101.8;
        const plinthY = SIDEWALK_Y + 0.30;
        // Concrete Pos Ronda raised foundation plinth & front entrance step
        addBox(bInfraConcrete, 3.8, 0.30, 3.6, posX, SIDEWALK_Y + 0.15, posZ, 0, 0, 0, 2.0);
        addBox(bInfraConcrete, 3.2, 0.15, 0.72, posX, SIDEWALK_Y + 0.075, posZ + 2.15, 0, 0, 0, 1.5);
        // 4 corner timber posts
        for (const [px, pz] of [
          [posX - 1.70, posZ - 1.60], [posX + 1.70, posZ - 1.60],
          [posX - 1.70, posZ + 1.60], [posX + 1.70, posZ + 1.60]
        ]) {
          addBox(bCornerWood, 0.15, 2.70, 0.15, px, plinthY + 1.35, pz);
          city._addCollider(px - 0.12, SIDEWALK_Y, pz - 0.12, px + 0.12, plinthY + 2.75, pz + 0.12, 'wood', { blocksBullets: false });
        }
        // Wooden half-height waist walls (back, left, right) & built-in bale-bale guard bench
        addBox(bCornerWood, 3.35, 0.90, 0.10, posX, plinthY + 0.45, posZ - 1.60);
        addBox(bCornerWood, 0.10, 0.90, 3.15, posX - 1.70, plinthY + 0.45, posZ);
        addBox(bCornerWood, 0.10, 0.90, 3.15, posX + 1.70, plinthY + 0.45, posZ);
        addBox(bCornerWood, 2.95, 0.42, 0.95, posX, plinthY + 0.21, posZ - 0.95);
        city._addCollider(posX - 1.82, SIDEWALK_Y, posZ - 1.72, posX + 1.82, plinthY + 1.0, posZ - 1.45, 'wood', { blocksBullets: false });
        city._addCollider(posX - 1.82, SIDEWALK_Y, posZ - 1.72, posX - 1.55, plinthY + 1.0, posZ + 1.68, 'wood', { blocksBullets: false });
        city._addCollider(posX + 1.55, SIDEWALK_Y, posZ - 1.72, posX + 1.82, plinthY + 1.0, posZ + 1.68, 'wood', { blocksBullets: false });
        // Pitched terracotta Genteng hipped roof
        addHippedRoof(bCornerRoof, posX - 1.9, posZ - 1.8, posX + 1.9, posZ + 1.8, plinthY + 2.70, 1.35, 0.48, 2.0);
        // Iconic Indonesian Kentongan hanging on front-right timber post
        addCylinder(bCornerWood, 0.095, 0.095, 0.68, 8, posX + 1.94, plinthY + 1.72, posZ + 1.58);
        addCylinder(bSteelDark, 0.020, 0.020, 0.34, 6, posX + 1.94, plinthY + 2.16, posZ + 1.58);
        addCylinder(bCornerWood, 0.025, 0.025, 0.38, 6, posX + 2.08, plinthY + 1.68, posZ + 1.58, 0.0, 0.0, 0.22);
        // Front Poskamling guard ledger sill holding note_se_corner
        addBox(bCornerWood, 1.15, 0.92, 0.48, posX + 0.95, SIDEWALK_Y + 0.46, posZ + 1.82);
        city._addCollider(posX + 0.34, SIDEWALK_Y, posZ + 1.54, posX + 1.56, SIDEWALK_Y + 0.95, posZ + 2.10, 'wood', { blocksBullets: false });

        // Warung Kopi Malam stall right beside Poskamling
        const warX = cx + 3.0, warZ = -101.2;
        for (const [px, pz] of [
          [warX - 1.65, warZ - 1.15], [warX + 1.65, warZ - 1.15],
          [warX - 1.65, warZ + 1.15], [warX + 1.65, warZ + 1.15]
        ]) {
          addBox(bCornerWood, 0.11, 2.55, 0.11, px, SIDEWALK_Y + 1.275, pz);
        }
        addBox(bCornerRoof, 3.9, 0.12, 2.9, warX, SIDEWALK_Y + 2.62, warZ, -0.10, 0, 0);
        // Serving counter & rear shelf
        addBox(bCornerWood, 3.4, 0.90, 0.72, warX, SIDEWALK_Y + 0.45, warZ + 1.05);
        addBox(bCornerWood, 3.2, 0.85, 0.50, warX, SIDEWALK_Y + 0.425, warZ - 0.85);
        city._addCollider(warX - 1.76, SIDEWALK_Y, warZ - 1.22, warX + 1.76, SIDEWALK_Y + 2.6, warZ + 1.42, 'wood', { blocksBullets: false });
        addBox(bCollHull, 3.5, 2.5, 2.6, warX, SIDEWALK_Y + 1.25, warZ);
        // Illuminated glass etalase display cabinet on east counter end
        addBox(bSteelDark, 0.96, 0.06, 0.48, warX + 0.85, SIDEWALK_Y + 0.93, warZ + 1.05);
        addBox(bCornerGlass, 0.92, 0.54, 0.44, warX + 0.85, SIDEWALK_Y + 1.23, warZ + 1.05);
        addBox(bCornerWarmBulb, 0.78, 0.06, 0.10, warX + 0.85, SIDEWALK_Y + 1.46, warZ + 1.05);
        // Interactive Red/Silver Kopi Thermos & snack jar on front counter (city_se_warung)
        addCylinder(bCornerRed, 0.11, 0.11, 0.36, 8, warX - 0.65, SIDEWALK_Y + 1.10, warZ + 1.08);
        addCylinder(bSteelDark, 0.08, 0.10, 0.08, 8, warX - 0.65, SIDEWALK_Y + 1.32, warZ + 1.08);
        addCylinder(bCornerGlass, 0.09, 0.09, 0.24, 8, warX - 0.30, SIDEWALK_Y + 1.04, warZ + 1.08);
        // Festive warm string bulbs draped across Poskamling & Warung facade
        const strX0 = posX - 1.5, strX1 = warX + 1.6, strZ = -99.85;
        addBox(bCables, strX1 - strX0, 0.025, 0.025, (strX0 + strX1) * 0.5, SIDEWALK_Y + 2.82, strZ);
        for (let bx = strX0 + 0.35; bx <= strX1 - 0.25; bx += 0.78) {
          const tNorm = (bx - strX0) / (strX1 - strX0);
          const sagY = Math.sin(tNorm * Math.PI) * 0.22;
          addBox(bCornerWarmBulb, 0.10, 0.12, 0.10, bx, SIDEWALK_Y + 2.74 - sagY, strZ);
        }
        // Outdoor Warung Kopi bench + table + plastic crates
        seatingPlacements.push({ x: cx + 3.4, y: SIDEWALK_Y, z: -96.6, ry: Math.PI });
        city._addCollider(cx + 2.45, SIDEWALK_Y, -97.05, cx + 4.35, SIDEWALK_Y + 0.85, -96.15, 'wood', { blocksBullets: false });
        outdoorTablePlacements.push({ x: cx + 3.4, y: SIDEWALK_Y, z: -97.8, ry: 0.2 });
        monoblocChairPlacements.push({ x: cx + 4.4, y: SIDEWALK_Y, z: -98.0, ry: -1.1 });
        plasticCratePlacements.push({ x: warX + 2.1, y: SIDEWALK_Y, z: warZ + 0.4, ry: 0.3 });
      }
    })();

    city._mergeAndRegisterBVH(bSteelDark, matSteelDark, false, true, 'CitySteelDark', true);
    city._mergeAndRegisterBVH(bTruss, matTruss, false, true, 'CityTrimMetal', true);
    city._mergeAndRegisterBVH(bGantryFrame, matSteelDark, true, true, 'CityGantryFrame', false);
    city._mergeAndRegisterBVH(bGantrySign, P.getHighwaySignMaterial(), false, false, 'CityGantrySigns', false);
    city._mergeAndRegisterBVH(bLampBulbs, P.getLampBulbMaterial(), false, false, 'CityLampBulbs', false);
    city._mergeAndRegisterBVH(bAmber, matAmber, false, false, 'CityBeacons', false);

    // Merge rail tunnel, viaduct concrete & corner exploration hub buckets
    const matInfraConcrete = city._getMat('infraConcrete', 'concrete_station', { color: 0x767a80, roughness: 0.88, metalness: 0.06 });
    const matTunnelDark = city._getMat('tunnelDark', null, { color: 0x050608, roughness: 0.96, metalness: 0.02 });
    const matTunnelSignalRed = new THREE.MeshStandardMaterial({
      color: 0x330404, emissive: 0xff2222, emissiveIntensity: 3.2, roughness: 0.18, metalness: 0.1
    });
    const matCornerWood = city._getMat('cornerWood', 'dark_wood', { color: 0x8b5d3b, roughness: 0.72, metalness: 0.05 });
    const matCornerWhite = city._getMat('cornerWhite', null, {
      color: 0xf1f5f9, roughness: 0.62, metalness: 0.06, side: THREE.DoubleSide
    });
    const matCornerRed = city._getMat('cornerRed', null, { color: 0xd92626, roughness: 0.42, metalness: 0.14 });
    const matCornerSandbag = city._getMat('cornerSandbag', null, { color: 0xa69473, roughness: 0.92, metalness: 0.02 });
    const matCornerWarmBulb = new THREE.MeshStandardMaterial({
      color: 0xfff0c8, emissive: 0xffb347, emissiveIntensity: 2.8, roughness: 0.22, metalness: 0.05
    });
    city.disposableMaterials.push(matTunnelSignalRed, matCornerWarmBulb);

    city._mergeAndRegisterBVH(bInfraConcrete, matInfraConcrete, true, true, 'CityInfraConcrete', true);
    city._mergeAndRegisterBVH(bTunnelDark, matTunnelDark, false, false, 'CityTunnelDark', false);
    city._mergeAndRegisterBVH(bTunnelSignalRed, matTunnelSignalRed, false, false, 'CityTunnelSignals', false);
    city._mergeAndRegisterBVH(bCornerWood, matCornerWood, true, true, 'CityCornerWood', true);
    city._mergeAndRegisterBVH(bCornerRoof, matRoofTerra, true, true, 'CityCornerRoof', true);
    city._mergeAndRegisterBVH(bCornerWhite, matCornerWhite, true, true, 'CityCornerWhite', true);
    city._mergeAndRegisterBVH(bCornerRed, matCornerRed, false, true, 'CityCornerRed', false);
    city._mergeAndRegisterBVH(bCornerSandbag, matCornerSandbag, true, true, 'CityCornerSandbags', true);
    city._mergeAndRegisterBVH(bCornerWarmBulb, matCornerWarmBulb, false, false, 'CityCornerWarmBulbs', false);
    city._mergeAndRegisterBVH(bCornerGlass, matGlassBldg, false, true, 'CityCornerGlass', false);
    }

    // =========================================================
    // 6. MERGE STATIC BUCKETS, SPATIAL PERIMETER CHUNKS, LOD1 & BVH
    // =========================================================
    function mergeBuildingCollStage() {
      // Unified always-visible invisible BVH hull for all city buildings (never hidden by frustum/LOD culling!)
      city._mergeAndRegisterBVH(bBuildingColl, matInvisColl, false, false, 'CityBuildingCollisionHull', true);
    }

    function mergeSectorStage(sk) {
      const sb = sectorBuckets[sk];
      if (!sb) return;
      const sectorGroup = new THREE.Group();
      sectorGroup.name = sk;
      const localBox = new THREE.Box3();
      let hasGeo = false;

      for (let pi = 0; pi < sectorPartDefs.length; pi++) {
        const pd = sectorPartDefs[pi];
        const bucket = sb[pd.key];
        if (!bucket || bucket.length === 0) continue;
        const merged = THREE_UTILS.mergeGeometries(bucket, false);
        for (let bi = 0; bi < bucket.length; bi++) bucket[bi].dispose();
        if (!merged) continue;
        if (!merged.boundingBox) merged.computeBoundingBox();
        localBox.union(merged.boundingBox);
        hasGeo = true;

        city.disposableGeometries.push(merged);
        const mesh = new THREE.Mesh(merged, pd.mat);
        // Only nearby corridor buildings cast shadows; outer >60m sectors drop shadow draws!
        mesh.castShadow = !!(sb.isNear && pd.canShadow);
        mesh.receiveShadow = !!pd.receiveShadow;
        mesh.name = `${sk}_${pd.prefix}`;
        sectorGroup.add(mesh);
      }

      if (!hasGeo) {
        for (let li = 0; li < sb.lod.length; li++) sb.lod[li].dispose();
        return;
      }

      root.add(sectorGroup);

      let lodMesh = null;
      if (sb.isFar && sb.lod.length > 0) {
        const lodGeo = THREE_UTILS.mergeGeometries(sb.lod, false);
        for (let li = 0; li < sb.lod.length; li++) sb.lod[li].dispose();
        if (lodGeo) {
          if (!lodGeo.boundingBox) lodGeo.computeBoundingBox();
          city.disposableGeometries.push(lodGeo);
          lodMesh = new THREE.Mesh(lodGeo, P.getCityLodMaterial());
          lodMesh.castShadow = false;
          lodMesh.receiveShadow = true;
          lodMesh.visible = false;
          lodMesh.name = `${sk}_LOD1`;
          root.add(lodMesh);
        }
      } else {
        for (let li = 0; li < sb.lod.length; li++) sb.lod[li].dispose();
      }

      const chunkEntry = {
        name: sk,
        sector: sk,
        mesh: sectorGroup,
        box: localBox.clone(),
        localBox: localBox,
        maxDist: 200,
        isFar: !!sb.isFar,
        isSkyline: false
      };
      if (lodMesh) {
        chunkEntry.lodMesh = lodMesh;
        chunkEntry.lodDist = 80;
      }
      city.cullChunks.push(chunkEntry);
    }

    function mergeInfraAndTreesStage() {
    city._mergeAndRegisterBVH(bJpo, matJpo, true, true, 'CityCrossGates', true);
    city._mergeAndRegisterBVH(bCables, matSteelDark, false, false, 'CityPowerCables', false);
    city._mergeAndRegisterBVH(bCollHull, matInvisColl, false, false, 'CityPropCollisionHull', true);

    // Non-blob procedural Angsana Street Trees (cached assets, castShadow = false on bark & leaves!)
    if (angsanaTransforms.length > 0) {
      const treeParts = getCachedAngsanaTreeParts();
      const matLeaf = getCachedAngsanaLeafMaterial();

      const emitTreeGroup = (list, targetGroup, suffix) => {
        if (!list || list.length === 0) return;
        const barkInst = new THREE.InstancedMesh(treeParts.barkGeo, matDarkWood, list.length);
        barkInst.castShadow = false;
        barkInst.receiveShadow = true;
        barkInst.name = `AngsanaBark${suffix}`;

        const leafInst = new THREE.InstancedMesh(treeParts.leafGeo, matLeaf, list.length);
        leafInst.castShadow = false;
        leafInst.receiveShadow = true;
        leafInst.name = `AngsanaLeaf${suffix}`;

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
        targetGroup.add(barkInst);
        targetGroup.add(leafInst);
      };

      if (angsanaTransforms.length >= 16) {
        const qTrees = { NW: [], NE: [], SW: [], SE: [] };
        for (let i = 0; i < angsanaTransforms.length; i++) {
          const t = angsanaTransforms[i];
          const q = (t.x < 0) ? (t.z < 0 ? 'NW' : 'SW') : (t.z < 0 ? 'NE' : 'SE');
          qTrees[q].push(t);
        }
        for (const q of ['NW', 'NE', 'SW', 'SE']) {
          emitTreeGroup(qTrees[q], city.quadrants[q], `_${q}`);
        }
      } else {
        emitTreeGroup(angsanaTransforms, root, '');
      }
    }
    }

    // Shared 48m spatial grid + 3-tier LOD batch emitter for all Poly Haven exterior props
    const emitSpatialLodBatches = (protos3, placements, baseName, isStructural, collHalfW, collH, collMat) => {
      if (!protos3 || !protos3[0] || !placements || placements.length === 0) return;
      const cells = new Map();
      for (let i = 0; i < placements.length; i++) {
        const pl = placements[i];
        const qk = (pl.z < 0 ? 'N' : 'S') + (pl.x >= 0 ? 'E' : 'W');
        const gx = Math.floor(pl.x / 48);
        const gz = Math.floor(pl.z / 48);
        const key = `${qk}_${gx}_${gz}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(pl);
        if (collHalfW && collH) {
          city._addCollider(
            pl.x - collHalfW, pl.y, pl.z - collHalfW,
            pl.x + collHalfW, pl.y + collH, pl.z + collHalfW,
            collMat || 'wood', { blocksBullets: false }
          );
        }
      }
      for (const [cellKey, list] of cells.entries()) {
        city._emitInstancedLodProto(protos3, list, false, true, `${baseName}_${cellKey}`, null, isStructural);
      }
    };

    function buildSkylineAndPropsStage() {
    // Pad rail corridor exclusion by >= 24m so 46m-wide distant skyline silhouettes never intrude on tracks
    const skyMinX = Math.min(cMinX, Math.min.apply(null, trackXs) - 2.5) - 22.0;
    const skyMaxX = Math.max(cMaxX, Math.max.apply(null, trackXs) + 2.5) + 22.0;
    buildSkylineSilhouetteRing(city, skyMinX, skyMaxX, root);

    // =========================================================
    // 7. OPTIMIZED LOW-POLY JAKARTA PROPS + 3-TIER LOD INSTANCED SCENERY
    // =========================================================
    const protoLamp = P.getStreetLampProto();
    const protosCar = city._extractModelLodProtos('covered_car', 1.65);
    const protoBarrier = P.getRoadBarrierProto();
    const protosFence = city._extractModelLodProtos('modular_chainlink_fence', 2.35,
      (n) => n.name === 'modular_chainlink_fence_double',
      { x: -1.0, y: 0, z: 0.02 }
    );
    const protoPole1 = P.getPowerPoleProto(0);
    const protoPole2 = P.getPowerPoleProto(1);
    const protoHydrant = P.getFireHydrantProto();
    const protoManhole = P.getManholeProto();
    const protoPowerBox = P.getPowerBoxProto();
    const protoTrashCan = P.getTrashCanProto();
    const protoTrashBag = P.getTrashBagProto();
    const protoBench = P.getParkBenchProto();
    const protoPlanter = P.getPlanterBoxProto();
    const protosAircon = city._extractModelLodProtos('exterior_aircon_unit', 0.82,
      (n) => n.name === 'exterior_aircon_unit'
    );
    const protosFireEscape = city._extractModelLodProtos('modular_fire_escape', 8.2,
      (n) => n.name !== 'modular_fire_escape_ladder_bottom'
    );
    const protosFacadeMod = city._extractModelLodProtos('modular_urban_apartments_facade', 4.0,
      (n) => /^(wall_door_centered_large_01|door_centered_large_01|dado_door_centered_large_01)$/.test(n.name || '')
    );
    const protoShrub1 = P.getFoliageCardProto(1.5, 0.72, 1);

    // Shadow casting pruned from minor props (lamps, poles, barriers, fences, trash, trees, etc.)
    city._emitInstancedProto(protoLamp, lampPlacements, false, false, 'StreetLamp');
    emitSpatialLodBatches(protosCar, carPlacements, 'CoveredCar', true, 0, 0, null);
    city._emitInstancedProto(protoBarrier, barrierPlacements, false, true, 'RoadBarrier');
    emitSpatialLodBatches(protosFence, fencePlacements, 'ChainlinkFence', true, 0, 0, null);
    city._emitInstancedProto(protoPole1, pole1Placements, false, false, 'PowerPoleA');
    city._emitInstancedProto(protoPole2, pole2Placements, false, false, 'PowerPoleB');
    city._emitInstancedProto(protoHydrant, hydrantPlacements, false, true, 'FireHydrant');
    city._emitInstancedProto(protoManhole, manholePlacements, false, true, 'ManholeCover');
    city._emitInstancedProto(protoPowerBox, powerBoxPlacements, false, true, 'PowerBox');
    city._emitInstancedProto(protoTrashCan, trashCanPlacements, false, true, 'TrashCan');
    city._emitInstancedProto(protoTrashBag, trashBagPlacements, false, true, 'TrashBag');
    city._emitInstancedProto(protoBench, seatingPlacements, false, true, 'StreetBench');
    city._emitInstancedProto(protoPlanter, planterPlacements, false, true, 'PlanterBox');
    emitSpatialLodBatches(protosAircon, airconPlacements, 'AirconUnit', false, 0, 0, null);
    emitSpatialLodBatches(protosFireEscape, fireEscapePlacements, 'FireEscape', false, 0, 0, null);
    emitSpatialLodBatches(protosFacadeMod, facadeModulePlacements, 'FacadeModule', true, 0, 0, null);
    city._emitInstancedProto(protoShrub1, shrub1Placements, false, true, 'ShrubHedge');
    }

    function finalizeVehiclesFoliageAndInteractablesStage() {
    const protosCoffeeCart = city._extractModelLodProtos('CoffeeCart_01', 1.85);

    // Procedural Jakarta Street Vehicles & Street Dressing (cached low-draw-call merged prototypes)
    city._emitInstancedProto(P.getSedanMpvProto('sedan_closed'), sedanPlacements, false, true, 'JakartaSedan');
    city._emitInstancedProto(P.getSedanMpvProto('mpv_ajar'), mpvAjarPlacements, false, true, 'JakartaMpvAjar');
    city._emitInstancedProto(P.getAngkotProto(), angkotPlacements, false, true, 'JakartaAngkot');
    city._emitInstancedProto(P.getTransJakartaBusProto(), busPlacements, true, true, 'TransJakartaBus');
    city._emitInstancedProto(P.getOjolProto(), ojolPlacements, false, true, 'OjolMotorbike');
    city._emitInstancedProto(P.getGerobakProto(), gerobakPlacements, false, true, 'GerobakKakiLima');
    city._emitInstancedProto(P.getTrafficSignalProto(), trafficSignalPlacements, false, true, 'TrafficSignal');
    city._emitInstancedProto(P.getAmbulanceProto(), ambulancePlacements, true, true, 'CornerAmbulance');
    city._emitInstancedProto(P.getMilitaryTruckProto(), militaryTruckPlacements, true, true, 'CornerMilitaryTruck');
    city._emitInstancedProto(P.getPalletProto(), palletPlacements, false, true, 'CornerCargoPallet');

    // Register destructible/reactive environment prop anchors for ballistic & RPG impacts
    city.destructibleProps = [];
    const regDestruct = (list, kind, rad) => {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        city.destructibleProps.push({
          kind, x: list[i].x, y: (list[i].y || 0) + 0.7, z: list[i].z,
          radius: rad, hp: 100, damaged: false
        });
      }
    };
    regDestruct(sedanPlacements, 'vehicle', 2.4);
    regDestruct(ambulancePlacements, 'vehicle', 2.8);
    regDestruct(militaryTruckPlacements, 'bus', 3.4);
    regDestruct(mpvAjarPlacements, 'vehicle', 2.4);
    regDestruct(angkotPlacements, 'vehicle', 2.4);
    regDestruct(carPlacements, 'vehicle', 2.4);
    regDestruct(busPlacements, 'bus', 4.8);
    regDestruct(ojolPlacements, 'bike', 1.3);
    regDestruct(gerobakPlacements, 'wood_stall', 1.6);
    regDestruct(barrierPlacements, 'concrete', 1.4);
    regDestruct(lampPlacements, 'lamp', 1.2);

    // CoffeeCart_01 vendor cart on East Concourse outer promenade plaza (3-tier LOD instanced, always preserved)
    emitSpatialLodBatches(protosCoffeeCart, [{ x: eastInnerSwMinX + 4.4, y: SIDEWALK_Y, z: 10.5, ry: -Math.PI * 0.5 }], 'CoffeeCart', true, 0, 0, null);
    city._addCollider(eastInnerSwMinX + 3.6, SIDEWALK_Y, 9.2, eastInnerSwMinX + 5.2, SIDEWALK_Y + 1.8, 11.8, 'wood', { blocksBullets: false });

    // Alpha-masked Tropical Foliage variants (~12 tris each; zero multi-hundred-thousand-poly bloat!)
    for (let vi = 0; vi < 4; vi++) {
      city._emitInstancedProto(P.getFoliageCardProto(1.85, 2.05, vi + 1), pachiraPlacements[vi], false, true, 'Pachira_' + vi);
      city._emitInstancedProto(P.getFoliageCardProto(1.45, 1.05, vi + 5), shrub2Placements[vi], false, true, 'Shrub2_' + vi);
      city._emitInstancedProto(P.getFoliageCardProto(0.95, 0.52, vi + 9), fernPlacements[vi], false, true, 'Fern_' + vi);
      if (vi < 3) {
        city._emitInstancedProto(P.getFoliageCardProto(0.90, 0.54, vi + 13), calatheaPlacements[vi], false, true, 'Calathea_' + vi);
      }
    }

    // =========================================================
    // POPULATE SPARSE EXTERIOR ZONES WITH BLENDER-DECIMATED 3-LOD POLY HAVEN PROPS
    // =========================================================

    // 1) East Pocket Park, Gerobak Kaki Lima Seating, Ruko Arcades & West Promenade Coffee Nooks
    for (const pz of [-9.2, -3.2, 2.2]) {
      outdoorTablePlacements.push({ x: parkX + 2.2, y: SIDEWALK_Y, z: pz, ry: Math.PI * 0.5 + (rng() - 0.5) * 0.25 });
    }
    // Café Patio & Ruko Colonnade Dining Tables (East zi=1 & zi=3 + West zi=1 & zi=3)
    for (const tz of [-56, -42, 42, 56]) {
      outdoorTablePlacements.push({ x: eastOuterSwMinX + 2.75, y: SIDEWALK_Y, z: tz, ry: -Math.PI * 0.5 + (rng() - 0.5) * 0.2 });
      outdoorTablePlacements.push({ x: westOuterSwMaxX - 2.75, y: SIDEWALK_Y, z: tz + 3.0, ry: Math.PI * 0.5 + (rng() - 0.5) * 0.2 });
    }
    // Monobloc warung plastic chairs clustered beside all 3 Gerobaks and along shopfronts
    for (let gi = 0; gi < gerobakPlacements.length; gi++) {
      const gs = gerobakPlacements[gi];
      const offX = gi === 0 ? 1.85 : (gi === 1 ? -1.45 : 1.45);
      monoblocChairPlacements.push({ x: gs.x + offX, y: SIDEWALK_Y, z: gs.z - 0.85, ry: gs.ry + 0.6 });
      monoblocChairPlacements.push({ x: gs.x + offX, y: SIDEWALK_Y, z: gs.z + 0.95, ry: gs.ry + 2.2 });
      plasticCratePlacements.push({ x: gs.x + offX * 0.65, y: SIDEWALK_Y, z: gs.z - 1.55, ry: 0.2 + gi });
      plasticCratePlacements.push({ x: gs.x + offX * 0.65, y: SIDEWALK_Y + 0.25, z: gs.z - 1.55, ry: 0.35 + gi });
    }
    // Warung menu chalkboards outside Hero Ruko, CoffeeCart & Inner Ruko blocks
    chalkboardPlacements.push({ x: eastOuterSwMinX + 2.6, y: SIDEWALK_Y, z: 9.2, ry: -Math.PI * 0.65 });
    chalkboardPlacements.push({ x: eastInnerSwMinX + 4.3, y: SIDEWALK_Y, z: 8.2, ry: -Math.PI * 0.35 });
    for (const cz of [-52, -38, 38, 52]) {
      chalkboardPlacements.push({ x: eastOuterSwMinX + 2.1, y: SIDEWALK_Y, z: cz, ry: -Math.PI * 0.5 });
      chalkboardPlacements.push({ x: westOuterSwMaxX - 2.1, y: SIDEWALK_Y, z: cz - 4.0, ry: Math.PI * 0.5 });
      monoblocChairPlacements.push({ x: eastOuterSwMinX + 2.1, y: SIDEWALK_Y, z: cz + 2.2, ry: -Math.PI * 0.4 });
      monoblocChairPlacements.push({ x: westOuterSwMaxX - 2.1, y: SIDEWALK_Y, z: cz + 2.0, ry: Math.PI * 0.45 });
    }

    // 2) West Promenade & East Inner Sidewalk Evacuation Luggage, Supply Boxes & Hand Trucks (breaks up long bare sidewalks!)
    for (const wz of [-60, -48, -32, -12, 4, 14, 34, 48, 60]) {
      cardboardBoxPlacements.push({ x: westInnerSwMaxX - 1.35, y: SIDEWALK_Y, z: wz, ry: rng() * Math.PI });
      cardboardBoxPlacements.push({ x: westInnerSwMaxX - 1.85, y: SIDEWALK_Y, z: wz + 0.55, ry: rng() * Math.PI });
      plasticCratePlacements.push({ x: westInnerSwMinX + 1.4, y: SIDEWALK_Y, z: wz + 2.2, ry: rng() * 1.5 });
      if (Math.abs(wz) === 12 || Math.abs(wz) === 48) {
        handTruckPlacements.push({ x: westInnerSwMaxX - 1.5, y: SIDEWALK_Y, z: wz - 1.4, ry: Math.PI * 0.35 + wz * 0.1 });
        plasticCratePlacements.push({ x: eastInnerSwMaxX - 1.4, y: SIDEWALK_Y, z: wz + 1.1, ry: rng() * 2.0 });
      }
    }
    // Near CoffeeCart & East Inner Sidewalk utility spots
    plasticCratePlacements.push({ x: eastInnerSwMinX + 5.2, y: SIDEWALK_Y, z: 12.1, ry: 0.4 });
    plasticCratePlacements.push({ x: eastInnerSwMinX + 5.2, y: SIDEWALK_Y + 0.25, z: 12.1, ry: 0.65 });
    cardboardBoxPlacements.push({ x: eastInnerSwMinX + 4.9, y: SIDEWALK_Y, z: 12.7, ry: 0.2 });
    handTruckPlacements.push({ x: eastInnerSwMinX + 5.5, y: SIDEWALK_Y, z: 11.4, ry: -Math.PI * 0.7 });

    // 3) U-Shaped Courtyards & L-Tower Plazas + Collector Roads (evacuation supply stacks, barrels & tires)
    const courtyardHubs = [
      { x: eastColRoadMinX - 1.8, z: -108.5, ry: -Math.PI * 0.5 },
      { x: westOuterSwMaxX - 6.5, z: 48.0, ry: Math.PI * 0.5 },
      { x: eastOuterSwMinX + 5.5, z: 2.0, ry: 0.0 },
      { x: westOuterSwMaxX - 5.5, z: -98.0, ry: Math.PI * 0.25 },
      { x: eastColRoadMinX + 1.6, z: -46.0, ry: 0.0 },
      { x: westColRoadMaxX - 1.6, z: 46.0, ry: Math.PI },
    ];
    for (let hi = 0; hi < courtyardHubs.length; hi++) {
      const h = courtyardHubs[hi];
      const baseY = hi >= 4 ? STREET_GROUND_Y : SIDEWALK_Y;
      militaryCratePlacements.push({ x: h.x, y: baseY, z: h.z, ry: h.ry });
      fuelBarrelPlacements.push({ x: h.x + 1.15, y: baseY, z: h.z + 0.45, ry: rng() * 3 });
      fuelBarrelPlacements.push({ x: h.x + 1.25, y: baseY, z: h.z - 0.35, ry: rng() * 3 });
      jerrycanPlacements.push({ x: h.x - 0.85, y: baseY, z: h.z + 0.5, ry: rng() * 2 });
      oldTyrePlacements.push({ x: h.x - 1.2, y: baseY, z: h.z - 0.75, ry: rng() * 2 });
      oldTyrePlacements.push({ x: h.x - 1.2, y: baseY + 0.165, z: h.z - 0.75, ry: rng() * 2 });
      handTruckPlacements.push({ x: h.x + 0.35, y: baseY, z: h.z - 1.05, ry: h.ry + 0.8 });
    }

    // 4) TNI Patrol Car staging & Quarantine Checkpoint Roadblocks (z = ±116.5 & Level Crossings)
    militaryCratePlacements.push({ x: westRoadCX + 1.8, y: STREET_GROUND_Y, z: -47.8, ry: 0.35 });
    jerrycanPlacements.push({ x: westRoadCX + 1.45, y: STREET_GROUND_Y, z: -46.9, ry: 0.9 });
    fuelBarrelPlacements.push({ x: westRoadCX + 1.75, y: STREET_GROUND_Y, z: -44.2, ry: 0.2 });

    for (const rz of [-112.4, 112.4]) {
      for (const rx of [westRoadCX - 3.6, westRoadCX + 3.6, eastRoadCX - 3.6, eastRoadCX + 3.6]) {
        militaryCratePlacements.push({ x: rx, y: STREET_GROUND_Y, z: rz, ry: (rng() - 0.5) * 0.4 });
        fuelBarrelPlacements.push({ x: rx + (rx < 0 ? 1.1 : -1.1), y: STREET_GROUND_Y, z: rz + (rz < 0 ? 0.5 : -0.5), ry: rng() * 3 });
        jerrycanPlacements.push({ x: rx - 0.55, y: STREET_GROUND_Y, z: rz - 0.65, ry: rng() * 2 });
        oldTyrePlacements.push({ x: rx + 0.6, y: STREET_GROUND_Y, z: rz + (rz < 0 ? 1.1 : -1.1), ry: rng() * 3 });
      }
    }
    // Level crossings (z = ±74) road shoulders: warning tires & sandbag/barrel stations cleanly clear of tracks & roadway
    for (const cz of [CROSSING_Z_SOUTH, CROSSING_Z_NORTH]) {
      for (const sideX of [westInnerSwMinX + 1.4, eastInnerSwMaxX - 1.4]) {
        oldTyrePlacements.push({ x: sideX, y: SIDEWALK_Y, z: cz - 6.8, ry: rng() * 2 });
        oldTyrePlacements.push({ x: sideX, y: SIDEWALK_Y + 0.165, z: cz - 6.8, ry: rng() * 2 });
        fuelBarrelPlacements.push({ x: sideX, y: SIDEWALK_Y, z: cz + 6.8, ry: rng() * 2 });
      }
    }

    // 5) Urban Tropical Curb Grass Tufts (grass_bermuda_01) across Promenades, Pocket Park, Crossings & Alley Curbs
    for (let gz = -110; gz <= 110; gz += 7.5) {
      if (Math.abs(Math.abs(gz) - 24) < 5.2 || Math.abs(Math.abs(gz) - 74) < 6.2) continue;
      const j = (rng() - 0.5) * 2.2;
      bermudaGrassPlacements.push({ x: westInnerSwMinX + 0.55, y: SIDEWALK_Y, z: gz + j, ry: rng() * Math.PI * 2, sx: 0.72, sy: 1.5, sz: 0.72 });
      bermudaGrassPlacements.push({ x: eastInnerSwMaxX - 0.55, y: SIDEWALK_Y, z: gz - j, ry: rng() * Math.PI * 2, sx: 0.70, sy: 1.45, sz: 0.70 });
      if (Math.abs(gz) > 18) {
        bermudaGrassPlacements.push({ x: westOuterSwMaxX - 0.45, y: SIDEWALK_Y, z: gz + 1.8, ry: rng() * Math.PI * 2, sx: 0.65, sy: 1.35, sz: 0.65 });
        bermudaGrassPlacements.push({ x: eastOuterSwMinX + 0.45, y: SIDEWALK_Y, z: gz - 1.8, ry: rng() * Math.PI * 2, sx: 0.65, sy: 1.35, sz: 0.65 });
      }
    }
    for (let pz = -13.0; pz <= 5.0; pz += 3.0) {
      bermudaGrassPlacements.push({ x: parkX + (rng() - 0.5) * 2.4, y: SIDEWALK_Y, z: pz, ry: rng() * Math.PI * 2, sx: 0.80, sy: 1.7, sz: 0.80 });
    }

    // Extract Blender-optimized 3-LOD GLTF protos & emit spatial-cell LOD InstancedMeshes
    const pMonobloc = city._extractModelLodProtos('plastic_monobloc_chair_01', 0.88);
    const pTableSet = city._extractModelLodProtos('outdoor_table_chair_set_01', 0.86);
    const pChalk    = city._extractModelLodProtos('standing_chalkboard_01', 1.46);
    const pCrate2   = city._extractModelLodProtos('plastic_crate_02', 0.28);
    const pMilCrate = city._extractModelLodProtos('wooden_military_crate', 0.50);
    const pJerry    = city._extractModelLodProtos('metal_jerrycan_green', 0.48);
    const pBarrel   = city._extractModelLodProtos('barrel_03', 0.92);
    const pTyre     = city._extractModelLodProtos('old_tyre', 0.17);
    const pCardBox  = city._extractModelLodProtos('cardboard_box_01', 0.44);
    const pGrass    = city._extractModelLodProtos('grass_bermuda_01', 0.24);
    const pHandTrk  = city._extractModelLodProtos('hand_truck', 1.36);
    const pGen      = city._extractModelLodProtos('portable_generator', 0.72);
    const pMedBox   = city._extractModelLodProtos('medical_box', 0.36);
    const pAmmoBox  = city._extractModelLodProtos('ammo_box', 0.36);

    emitSpatialLodBatches(pMonobloc, monoblocChairPlacements, 'MonoblocChair', false, 0.28, 0.85, 'wood');
    emitSpatialLodBatches(pTableSet, outdoorTablePlacements, 'OutdoorTableSet', false, 0.55, 0.82, 'wood');
    emitSpatialLodBatches(pChalk, chalkboardPlacements, 'Chalkboard', false, 0.30, 1.42, 'wood');
    emitSpatialLodBatches(pCrate2, plasticCratePlacements, 'PlasticCrate', false, 0.24, 0.52, 'wood');
    emitSpatialLodBatches(pMilCrate, militaryCratePlacements, 'MilitaryCrate', false, 0.52, 0.52, 'wood');
    emitSpatialLodBatches(pJerry, jerrycanPlacements, 'Jerrycan', false, 0.18, 0.48, 'metal');
    emitSpatialLodBatches(pBarrel, fuelBarrelPlacements, 'FuelBarrel', false, 0.32, 0.92, 'metal');
    emitSpatialLodBatches(pTyre, oldTyrePlacements, 'OldTyre', false, 0.28, 0.32, 'wood');
    emitSpatialLodBatches(pCardBox, cardboardBoxPlacements, 'CardboardBox', false, 0.22, 0.44, 'wood');
    emitSpatialLodBatches(pGrass, bermudaGrassPlacements, 'BermudaGrass', false, 0, 0, null);
    emitSpatialLodBatches(pHandTrk, handTruckPlacements, 'HandTruck', false, 0.28, 1.30, 'metal');
    emitSpatialLodBatches(pGen, [
      { x: cornerHubCoords.NW.cx + 4.7, y: SIDEWALK_Y, z: 100.6, ry: -0.4 },
      { x: cornerHubCoords.SW.cx + 3.8, y: SIDEWALK_Y, z: -99.6, ry: 0.8 }
    ], 'CornerGenerator', false, 0.42, 0.72, 'metal');
    emitSpatialLodBatches(pMedBox, [
      { x: cornerHubCoords.NW.cx + 2.35, y: SIDEWALK_Y, z: 101.2, ry: 0.15 },
      { x: cornerHubCoords.NW.cx + 2.35, y: SIDEWALK_Y + 0.36, z: 101.2, ry: -0.20 },
      { x: cornerHubCoords.NW.cx - 1.4, y: SIDEWALK_Y, z: 101.6, ry: 0.45 }
    ], 'CornerMedicalBox', false, 0.28, 0.42, 'metal');
    emitSpatialLodBatches(pAmmoBox, ammoBoxPlacements, 'CornerAmmoBox', false, 0, 0, null);

    // =========================================================
    // 8. CITY STREET & PLAZA SPAWN NODES (FOR ROAMING ZOMBIES)
    // =========================================================
    city.spawnNodes = [
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
    // 9. STREET INTERACTABLES, TACTICAL LOOTBOXES & HYDRANT HAZARDS
    // =========================================================
    city.interactables = [];
    const usedSet = city._usedIds || new Set();

    const coffeeCartUsed = usedSet.has('city_coffee_cart');
    city.interactables.push({
      id: 'city_coffee_cart',
      type: 'street_stash',
      x: eastInnerSwMinX + 4.4,
      y: SIDEWALK_Y + 0.9,
      z: 10.5,
      label: coffeeCartUsed ? '[E] Gerobak Kopi East Promenade (Sudah Digeledah)' : '[E] Geledah Gerobak Kopi East Promenade (+Amunisi SS2 & Kopi Hangat)',
      prompt: coffeeCartUsed ? '[E] Gerobak Kopi East Promenade (Sudah Digeledah)' : '[E] Geledah Gerobak Kopi East Promenade (+Amunisi SS2 & Kopi Hangat)',
      used: coffeeCartUsed
    });
    placeCityFieldLogProp(city, root, 'city_coffee_cart', eastInnerSwMinX + 4.25, SIDEWALK_Y + 0.92, 10.25, -Math.PI * 0.5 + 0.16, coffeeCartUsed);

    const plnUsed = usedSet.has('city_pln_box') || city._plnRestored;
    const plnX = eastOuterSwMinX + 2.45;
    const plnZ = -16.2;
    // Detailed Canvas-Textured PLN Substation Distribution Cabinet (Gardu Distribusi TM/TR)
    const plnGroup = new THREE.Group();
    plnGroup.position.set(plnX, SIDEWALK_Y, plnZ);

    const plnCvs = document.createElement('canvas');
    plnCvs.width = 512;
    plnCvs.height = 512;
    const pctx = plnCvs.getContext('2d');
    pctx.fillStyle = '#364352';
    pctx.fillRect(0, 0, 512, 512);
    // Subtle weathering/grime gradient at bottom + brushed metal streaks
    const pGrad = pctx.createLinearGradient(0, 0, 0, 512);
    pGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    pGrad.addColorStop(0.7, 'rgba(0,0,0,0.0)');
    pGrad.addColorStop(1, 'rgba(20,18,14,0.45)');
    pctx.fillStyle = pGrad;
    pctx.fillRect(0, 0, 512, 512);
    // Double recessed panel door frames & center seam
    pctx.strokeStyle = '#182028';
    pctx.lineWidth = 8;
    pctx.strokeRect(24, 34, 224, 444);
    pctx.strokeRect(264, 34, 224, 444);
    pctx.strokeStyle = '#536477';
    pctx.lineWidth = 3;
    pctx.strokeRect(30, 40, 212, 432);
    pctx.strokeRect(270, 40, 212, 432);
    // Hinges & latch bolts
    pctx.fillStyle = '#111827';
    for (const hy of [90, 250, 410]) {
      pctx.fillRect(14, hy, 18, 28);
      pctx.fillRect(480, hy, 18, 28);
    }
    // Pressed cooling louver slats (top & bottom of both doors)
    for (let ly = 338; ly <= 446; ly += 16) {
      pctx.fillStyle = '#141a22';
      pctx.fillRect(48, ly, 176, 8);
      pctx.fillRect(288, ly, 176, 8);
      pctx.fillStyle = '#5b6c7f';
      pctx.fillRect(48, ly + 8, 176, 2);
      pctx.fillRect(288, ly + 8, 176, 2);
    }
    // PLN Corporate Header Plate + High Voltage 20kV Hazard Warning Plaque
    pctx.fillStyle = '#0f294a';
    pctx.fillRect(44, 54, 424, 52);
    pctx.fillStyle = '#facc15';
    pctx.fillRect(44, 102, 424, 8);
    pctx.fillStyle = '#ffffff';
    pctx.font = 'bold 24px sans-serif';
    pctx.fillText('PT PLN (PERSERO)', 62, 84);
    pctx.fillStyle = '#fde047';
    pctx.font = 'bold 14px sans-serif';
    pctx.fillText('SAKELAR PJU • JTR 20kV', 284, 83);
    // Left door: Yellow/Black Warning Triangle + Lightning Bolt
    pctx.fillStyle = '#eab308';
    pctx.fillRect(54, 134, 164, 126);
    pctx.strokeStyle = '#111827';
    pctx.lineWidth = 5;
    pctx.strokeRect(58, 138, 156, 118);
    pctx.fillStyle = '#111827';
    pctx.beginPath();
    pctx.moveTo(136, 150); pctx.lineTo(182, 224); pctx.lineTo(90, 224); pctx.closePath();
    pctx.fill();
    pctx.fillStyle = '#fde047';
    pctx.beginPath();
    pctx.moveTo(142, 168); pctx.lineTo(124, 196); pctx.lineTo(138, 196); pctx.lineTo(128, 218); pctx.lineTo(152, 190); pctx.lineTo(136, 190); pctx.closePath();
    pctx.fill();
    pctx.fillStyle = '#111827';
    pctx.font = 'bold 14px sans-serif';
    pctx.fillText('TEGANGAN TINGGI', 68, 246);
    // Right door: Analog kWh Meter Inspection Window & Dial
    pctx.fillStyle = '#0b1220';
    pctx.fillRect(294, 136, 160, 112);
    pctx.fillStyle = '#cbd5e1';
    pctx.fillRect(306, 148, 136, 86);
    pctx.fillStyle = '#0f172a';
    pctx.font = 'bold 16px monospace';
    pctx.fillText('kWh 04821.9', 318, 178);
    pctx.fillStyle = '#ef4444';
    pctx.fillRect(322, 196, 104, 14);
    pctx.fillStyle = '#1e293b';
    pctx.font = '12px sans-serif';
    pctx.fillText('PANEL RELAI UTAMA', 312, 226);

    const plnTex = new THREE.CanvasTexture(plnCvs);
    plnTex.colorSpace = THREE.SRGBColorSpace;
    const plnCabMat = new THREE.MeshStandardMaterial({ map: plnTex, roughness: 0.52, metalness: 0.58 });
    const plnPadMat = city._getMat('cityPlnPad', null, { color: 0x64748b, roughness: 0.92, metalness: 0.06 });
    const plnDarkMat = city._getMat('cityPlnBody', null, { color: 0x1e293b, roughness: 0.55, metalness: 0.72 });
    const plnHazardMat = city._getMat('cityPlnHazard', null, { color: 0xf59e0b, roughness: 0.42, metalness: 0.28 });
    const plnBeaconMat = new THREE.MeshStandardMaterial({
      color: plnUsed ? 0x22c55e : 0xef4444,
      emissive: plnUsed ? 0x22c55e : 0xef4444,
      emissiveIntensity: 1.4,
      roughness: 0.25
    });

    const plnPadGeo = new THREE.BoxGeometry(1.00, 0.24, 1.48);
    const plnFlangeGeo = new THREE.BoxGeometry(0.76, 0.08, 1.26);
    const plnBodyGeo = new THREE.BoxGeometry(0.68, 1.56, 1.20);
    const plnRoofGeo = new THREE.BoxGeometry(0.80, 0.10, 1.32);
    const plnConduitGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.42, 8);
    const plnFinGeo = new THREE.BoxGeometry(0.56, 1.18, 0.04);
    const plnLeverArmGeo = new THREE.BoxGeometry(0.08, 0.32, 0.08);
    const plnLeverGripGeo = new THREE.BoxGeometry(0.14, 0.08, 0.16);
    const plnLatchGeo = new THREE.BoxGeometry(0.04, 0.22, 0.10);
    const plnBeaconGeo = new THREE.BoxGeometry(0.16, 0.14, 0.28);
    city.disposableTextures.push(plnTex);
    city.disposableGeometries.push(plnPadGeo, plnFlangeGeo, plnBodyGeo, plnRoofGeo, plnConduitGeo, plnFinGeo, plnLeverArmGeo, plnLeverGripGeo, plnLatchGeo, plnBeaconGeo);
    city.disposableMaterials.push(plnCabMat, plnBeaconMat);
    city._plnBeaconMat = plnBeaconMat;

    const plnPadM = new THREE.Mesh(plnPadGeo, plnPadMat); plnPadM.position.set(0, 0.12, 0);
    const plnFlangeM = new THREE.Mesh(plnFlangeGeo, plnDarkMat); plnFlangeM.position.set(0, 0.28, 0);
    const plnBodyM = new THREE.Mesh(plnBodyGeo, [plnDarkMat, plnCabMat, plnDarkMat, plnDarkMat, plnCabMat, plnCabMat]);
    plnBodyM.position.set(0, 1.10, 0);
    const plnRoofM = new THREE.Mesh(plnRoofGeo, plnDarkMat); plnRoofM.position.set(0, 1.92, 0);
    plnGroup.add(plnPadM, plnFlangeM, plnBodyM, plnRoofM);
    for (const cz of [-0.36, -0.12, 0.12, 0.36]) {
      const cPipe = new THREE.Mesh(plnConduitGeo, plnDarkMat);
      cPipe.position.set(0.18, 0.42, cz);
      plnGroup.add(cPipe);
    }
    for (const fz of [-0.62, 0.62]) {
      const fin = new THREE.Mesh(plnFinGeo, plnDarkMat);
      fin.position.set(0, 1.10, fz);
      plnGroup.add(fin);
    }
    const doorLatch = new THREE.Mesh(plnLatchGeo, plnDarkMat); doorLatch.position.set(-0.35, 1.00, 0.0);
    const leverArm = new THREE.Mesh(plnLeverArmGeo, plnHazardMat); leverArm.position.set(0.06, 1.14, 0.66);
    const leverGrip = new THREE.Mesh(plnLeverGripGeo, plnHazardMat); leverGrip.position.set(0.06, 1.30, 0.70);
    const plnBeaconM = new THREE.Mesh(plnBeaconGeo, plnBeaconMat); plnBeaconM.position.set(-0.18, 2.04, 0);
    plnGroup.add(doorLatch, leverArm, leverGrip, plnBeaconM);
    root.add(plnGroup);
    city._addCollider(plnX - 0.50, SIDEWALK_Y, plnZ - 0.74, plnX + 0.50, SIDEWALK_Y + 1.98, plnZ + 0.74, 'metal');

    city.interactables.push({
      id: 'city_pln_box',
      type: 'power_box',
      x: plnX - 0.35,
      y: SIDEWALK_Y + 1.25,
      z: plnZ,
      label: plnUsed ? '[E] Kotak Relai PLN Jalanan (Daya Aktif)' : '[E] Sakelar Utama PLN Jalanan (Pulihkan Penerangan Jalan)',
      prompt: plnUsed ? '[E] Kotak Relai PLN Jalanan (Daya Aktif)' : '[E] Sakelar Utama PLN Jalanan (Pulihkan Penerangan Jalan)',
      used: plnUsed
    });

    const convoyUsed = usedSet.has('city_convoy_car');
    city.interactables.push({
      id: 'city_convoy_car',
      type: 'street_stash',
      x: westRoadCX + 3.5,
      y: STREET_GROUND_Y + 0.9,
      z: -46.0,
      label: convoyUsed ? '[E] Mobil Patroli TNI MT Haryono (Sudah Digeledah)' : '[E] Buka Bagasi Mobil Patroli TNI (+18 Shotgun Shells)',
      prompt: convoyUsed ? '[E] Mobil Patroli TNI MT Haryono (Sudah Digeledah)' : '[E] Buka Bagasi Mobil Patroli TNI (+18 Shotgun Shells)',
      used: convoyUsed
    });
    placeCityFieldLogProp(city, root, 'city_convoy_car', westRoadCX + 3.5, STREET_GROUND_Y + 0.88, -47.25, 0.20, convoyUsed);

    const parkUsed = usedSet.has('city_pocket_park');
    const parkCrateGeo = new THREE.BoxGeometry(0.56, 0.42, 0.40);
    const parkCrateMat = new THREE.MeshStandardMaterial({ color: 0x3f4739, roughness: 0.72, metalness: 0.25 });
    city.disposableGeometries.push(parkCrateGeo);
    city.disposableMaterials.push(parkCrateMat);
    const parkCrateMesh = new THREE.Mesh(parkCrateGeo, parkCrateMat);
    parkCrateMesh.position.set(parkX, SIDEWALK_Y + 0.21, 0.0);
    parkCrateMesh.receiveShadow = true;
    root.add(parkCrateMesh);
    city._addCollider(parkX - 0.30, SIDEWALK_Y, -0.22, parkX + 0.30, SIDEWALK_Y + 0.44, 0.22, 'wood', { blocksBullets: false });
    city.interactables.push({
      id: 'city_pocket_park',
      type: 'street_stash',
      x: parkX,
      y: SIDEWALK_Y + 0.85,
      z: 0.0,
      label: parkUsed ? '[E] Peti Taktis Taman East Pocket (Sudah Digeledah)' : '[E] Buka Peti Taktis Taman East Pocket (+RPG, +Senapan, +25 HP)',
      prompt: parkUsed ? '[E] Peti Taktis Taman East Pocket (Sudah Digeledah)' : '[E] Buka Peti Taktis Taman East Pocket (+RPG, +Senapan, +25 HP)',
      used: parkUsed
    });
    placeCityFieldLogProp(city, root, 'city_pocket_park', parkX, SIDEWALK_Y + 0.425, 0.0, -Math.PI * 0.5 + 0.14, parkUsed);

    // Sittable East Pocket Park & Warung Kopi Benches
    for (let si = 0; si < seatingPlacements.length; si++) {
      const sp = seatingPlacements[si];
      const isWarung = Math.abs(sp.ry - Math.PI) < 0.25 && sp.z < -80;
      city.interactables.push({
        id: 'bench_park_' + si,
        type: 'bench',
        x: sp.x,
        y: sp.y + 0.55,
        z: sp.z,
        seatPos: isWarung
          ? { x: sp.x, y: sp.y + 0.02, z: sp.z + 0.12 }
          : { x: sp.x - 0.12, y: sp.y + 0.02, z: sp.z },
        standPos: isWarung
          ? { x: sp.x, y: sp.y + 0.02, z: sp.z + 0.95 }
          : { x: sp.x - 0.95, y: sp.y + 0.02, z: sp.z },
        yaw: isWarung ? 0 : Math.PI * 0.5,
        label: isWarung ? '[E] Duduk di Bangku Warung Kopi' : '[E] Duduk di Bangku Taman',
        prompt: isWarung ? '[E] Duduk di Bangku Warung Kopi' : '[E] Duduk di Bangku Taman'
      });
    }

    // 4 Far-Corner Exploration Hub Rewards & Field Notes (NW, NE, SW, SE)
    city._streetBeacons = city._streetBeacons || {};
    const addCornerBeacon = (id, bx, by, bz, hexColor) => {
      const ringGeo = new THREE.RingGeometry(0.42, 0.56, 20);
      ringGeo.rotateX(-Math.PI * 0.5);
      const ringMat = new THREE.MeshBasicMaterial({
        color: hexColor,
        transparent: true,
        opacity: usedSet.has(id) ? 0.08 : 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      city.disposableGeometries.push(ringGeo);
      city.disposableMaterials.push(ringMat);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(bx, by, bz);
      ringMesh.visible = !usedSet.has(id);
      root.add(ringMesh);
      city._streetBeacons[id] = { mesh: ringMesh, mat: ringMat, used: usedSet.has(id) };
    };

    const nwMedUsed = usedSet.has('city_nw_medpost');
    city.interactables.push({
      id: 'city_nw_medpost',
      type: 'corner_medpost',
      corner: 'NW',
      x: cornerHubCoords.NW.cx + 0.25,
      y: SIDEWALK_Y + 0.96,
      z: 101.3,
      label: nwMedUsed ? '[E] Kotak Medis Darurat PMI (Sudah Diambil)' : '[E] Ambil Kotak Medis Darurat PMI (+35 Armor & +25 HP)',
      prompt: nwMedUsed ? '[E] Kotak Medis Darurat PMI (Sudah Diambil)' : '[E] Ambil Kotak Medis Darurat PMI (+35 Armor & +25 HP)',
      used: nwMedUsed
    });
    addCornerBeacon('city_nw_medpost', cornerHubCoords.NW.cx + 0.25, SIDEWALK_Y + 0.86, 101.3, 0x38bdf8);

    const neDockY = SIDEWALK_Y + 0.62;
    const neDepotUsed = usedSet.has('city_ne_depot');
    city.interactables.push({
      id: 'city_ne_depot',
      type: 'corner_depot',
      corner: 'NE',
      x: cornerHubCoords.NE.cx + 0.5,
      y: neDockY + 0.55,
      z: 102.3,
      label: neDepotUsed ? '[E] Peti Logistik Gudang Utara (Sudah Diambil)' : '[E] Bongkar Peti Logistik Gudang Utara (Amunisi Penuh & Heavy Ammo)',
      prompt: neDepotUsed ? '[E] Peti Logistik Gudang Utara (Sudah Diambil)' : '[E] Bongkar Peti Logistik Gudang Utara (Amunisi Penuh & Heavy Ammo)',
      used: neDepotUsed
    });
    addCornerBeacon('city_ne_depot', cornerHubCoords.NE.cx + 0.5, neDockY + 0.72, 102.3, 0xfbbf24);

    const swConvoyUsed = usedSet.has('city_sw_convoy');
    city.interactables.push({
      id: 'city_sw_convoy',
      type: 'corner_convoy',
      corner: 'SW',
      x: cornerHubCoords.SW.cx + 1.8,
      y: SIDEWALK_Y + 0.65,
      z: -101.2,
      label: swConvoyUsed ? '[E] Peti Amunisi Konvoi Militer (Sudah Diambil)' : '[E] Ambil Peti Amunisi Konvoi Militer (+25 Armor & +2 Mag)',
      prompt: swConvoyUsed ? '[E] Peti Amunisi Konvoi Militer (Sudah Diambil)' : '[E] Ambil Peti Amunisi Konvoi Militer (+25 Armor & +2 Mag)',
      used: swConvoyUsed
    });
    addCornerBeacon('city_sw_convoy', cornerHubCoords.SW.cx + 1.8, SIDEWALK_Y + 0.66, -101.2, 0x4ade80);

    const seWarungUsed = usedSet.has('city_se_warung');
    city.interactables.push({
      id: 'city_se_warung',
      type: 'corner_warung',
      corner: 'SE',
      x: cornerHubCoords.SE.cx + 2.35,
      y: SIDEWALK_Y + 1.05,
      z: -100.12,
      label: seWarungUsed ? '[E] Termos Kopi & Bekal Pos Ronda (Sudah Diminum)' : '[E] Minum Termos Kopi & Bekal Pos Ronda (+25 HP & Fast Sprint 45s)',
      prompt: seWarungUsed ? '[E] Termos Kopi & Bekal Pos Ronda (Sudah Diminum)' : '[E] Minum Termos Kopi & Bekal Pos Ronda (+25 HP & Fast Sprint 45s)',
      used: seWarungUsed
    });
    addCornerBeacon('city_se_warung', cornerHubCoords.SE.cx + 2.35, SIDEWALK_Y + 0.94, -100.12, 0xf59e0b);

    const cornerNotes = [
      {
        id: 'note_nw_corner',
        x: cornerHubCoords.NW.cx - 2.1,
        y: SIDEWALK_Y + 0.83,
        z: 100.9,
        ry: 0.22,
        label: '[E] Baca Log Medis Posko PMI NW'
      },
      {
        id: 'note_ne_corner',
        x: cornerHubCoords.NE.cx + 3.74,
        y: SIDEWALK_Y + 0.85,
        z: 98.4,
        ry: -Math.PI * 0.5 + 0.15,
        label: '[E] Baca Manifes Kargo Pos Sekuriti NE'
      },
      {
        id: 'note_sw_corner',
        x: cornerHubCoords.SW.cx - 0.4,
        y: SIDEWALK_Y + 0.71,
        z: -101.4,
        ry: -0.30,
        label: '[E] Baca Perintah Sekat Konvoi SW'
      },
      {
        id: 'note_se_corner',
        x: cornerHubCoords.SE.cx - 0.65,
        y: SIDEWALK_Y + 0.93,
        z: -99.98,
        ry: 0.12,
        label: '[E] Baca Buku Jaga Poskamling SE'
      }
    ];
    for (let ni = 0; ni < cornerNotes.length; ni++) {
      const cn = cornerNotes[ni];
      const nUsed = usedSet.has(cn.id);
      city.interactables.push({
        id: cn.id,
        type: 'field_log',
        x: cn.x,
        y: cn.y + 0.04,
        z: cn.z,
        label: nUsed ? cn.label + ' (Sudah Dibaca)' : cn.label,
        prompt: nUsed ? cn.label + ' (Sudah Dibaca)' : cn.label,
        used: nUsed
      });
      placeCityFieldLogProp(city, root, cn.id, cn.x, cn.y, cn.z, cn.ry, nUsed);
    }
    if (typeof city._syncStreetBeacons === 'function') {
      city._syncStreetBeacons();
    }

    // Tactical Street Lootboxes (detailed hinged crate + difficulty-scaled yellow halo!)
    city._lootboxVisuals = city._lootboxVisuals || [];
    const lootboxSpecs = [
      {
        id: 'city_alley_lootbox',
        x: eastColRoadMinX - 1.1,
        y: SIDEWALK_Y,
        z: -30.2,
        ry: 0.25,
        riskLuck: 0.85,
        labelOpen: '[E / Klik] Buka Peti Suplai Gang Samping (High-Risk • RPG & Medkit)',
        labelUsed: '[E] Peti Suplai Gang Samping (Sudah Diambil)'
      },
      {
        id: 'city_plaza_lootbox',
        x: parkX + 2.2,
        y: SIDEWALK_Y,
        z: -15.5,
        ry: -0.35,
        riskLuck: 0.55,
        labelOpen: '[E / Klik] Buka Peti Taktis Taman & Busway (+Amunisi & Medkit)',
        labelUsed: '[E] Peti Taktis Taman & Busway (Sudah Diambil)'
      }
    ];
    if (rng() < 0.5) {
      lootboxSpecs.push({
        id: 'city_west_plaza_lootbox',
        x: westInnerSwMaxX - 2.4,
        y: SIDEWALK_Y,
        z: 18.0,
        ry: Math.PI * 0.5,
        riskLuck: 0.45,
        labelOpen: '[E / Klik] Buka Peti Suplai Trotoar Barat (+Amunisi & Medkit)',
        labelUsed: '[E] Peti Suplai Trotoar Barat (Sudah Diambil)'
      });
    }
    const bLootColl = [];
    for (let li = 0; li < lootboxSpecs.length; li++) {
      const lb = lootboxSpecs[li];
      const lbUsed = usedSet.has(lb.id);
      city.interactables.push({
        id: lb.id,
        type: 'lootbox',
        riskLuck: lb.riskLuck,
        x: lb.x,
        y: lb.y + 0.58,
        z: lb.z,
        label: lbUsed ? lb.labelUsed : lb.labelOpen,
        prompt: lbUsed ? lb.labelUsed : lb.labelOpen,
        used: lbUsed
      });

      const vis = P.createLootboxVisual(
        root, city.disposableGeometries, city.disposableMaterials,
        lb.id, lb.x, lb.y, lb.z, lb.ry, lbUsed
      );
      city._lootboxVisuals.push(vis);
      if (city._lootboxGlows) city._lootboxGlows[lb.id] = vis.haloGroup;

      city._addCollider(lb.x - 0.52, lb.y, lb.z - 0.52, lb.x + 0.52, lb.y + 0.66, lb.z + 0.52, 'metal', {
        blocksWalk: true, blocksBullets: false
      });
      addBox(bLootColl, 0.98, 0.62, 0.68, lb.x, lb.y + 0.31, lb.z, 0, lb.ry, 0);
    }
    city._mergeAndRegisterBVH(bLootColl, matInvisColl, false, false, 'CityLootboxCollisionHull', true);

    city.hydrants = [];
    for (let i = 0; i < hydrantPlacements.length; i++) {
      const hp = hydrantPlacements[i];
      city.hydrants.push({
        id: 'hydrant_' + i,
        x: hp.x,
        y: hp.y,
        z: hp.z,
        burst: false
      });
    }
    }

    let stage = 0;
    return {
      step: function () {
        switch (stage) {
          case 0: buildRoadsAndMarkingsStage(); stage = 1; return false;
          case 1: buildSidewalksAndCurbsStage(); stage = 2; return false;
          case 2: buildInnerBlocksStage(); stage = 3; return false;
          case 3: buildOuterBlocksStage(); stage = 4; return false;
          case 4: mergeBuildingCollStage(); stage = 5; return false;
          case 5: mergeSectorStage(SECTOR_KEYS[0]); stage = 6; return false;
          case 6: mergeSectorStage(SECTOR_KEYS[1]); stage = 7; return false;
          case 7: mergeSectorStage(SECTOR_KEYS[2]); stage = 8; return false;
          case 8: mergeSectorStage(SECTOR_KEYS[3]); stage = 9; return false;
          case 9: mergeSectorStage(SECTOR_KEYS[4]); stage = 10; return false;
          case 10: mergeSectorStage(SECTOR_KEYS[5]); stage = 11; return false;
          case 11: buildStreetInfraStage(); stage = 12; return false;
          case 12: mergeInfraAndTreesStage(); stage = 13; return false;
          case 13: buildSkylineAndPropsStage(); stage = 14; return false;
          case 14: finalizeVehiclesFoliageAndInteractablesStage(); stage = 15; return true;
          default: return true;
        }
      }
    };
  }

  function buildCityDistrict(city, arch, rng, root, o) {
    const builder = createDistrictBuilder(city, arch, rng, root, o);
    while (!builder.step()) {}
  }

  I.city = Object.assign(I.city || {}, {
    createDistrictBuilder: createDistrictBuilder,
    buildDistrict: buildCityDistrict
  });
})();
