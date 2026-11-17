(function () {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const P = I.city || {};

  function buildCityDistrict(city, arch, rng, root, o) {
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
    const matInvisColl = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    city.disposableMaterials.push(matInvisColl);

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

    // =========================================================
    // 1. ASPHALT ROADS & LEVEL RAIL CROSSINGS (y = -1.00)
    // =========================================================
    const addAsphaltSlab = (x0, z0, x1, z1, walkable) => {
      const w = x1 - x0;
      const d = z1 - z0;
      if (w <= 0.05 || d <= 0.05) return;
      addBox(bAsphalt, w, 0.24, d, (x0 + x1) * 0.5, STREET_GROUND_Y - 0.12, (z0 + z1) * 0.5, 0, 0, 0, 6.0);
      if (walkable !== false) {
        city._addCollider(x0, STREET_GROUND_Y - 0.24, z0, x1, STREET_GROUND_Y, z1, 'floor', {
          isFloor: true, blocksWalk: true, blocksBullets: false
        });
      }
    };

    // West & East Side Road Networks (strictly zero-overlap abutting slabs to prevent Z-fighting!)
    addAsphaltSlab(DIST_X_MIN, DIST_Z_MIN, westInnerSwMinX, DIST_Z_MAX, true);
    addAsphaltSlab(eastInnerSwMaxX, DIST_Z_MIN, DIST_X_MAX, DIST_Z_MAX, true);

    // Extended outer urban terrain skirt & perimeter bounds (cleanly abutting outer edges, zero overlap!)
    const OUTER_SKIRT = 90.0;
    addAsphaltSlab(DIST_X_MIN - OUTER_SKIRT, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MIN, DIST_Z_MAX + OUTER_SKIRT, true);
    addAsphaltSlab(DIST_X_MAX, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MAX + OUTER_SKIRT, DIST_Z_MAX + OUTER_SKIRT, true);
    addAsphaltSlab(DIST_X_MIN, DIST_Z_MIN - OUTER_SKIRT, cMinX - 0.02, DIST_Z_MIN, true);
    addAsphaltSlab(cMaxX + 0.02, DIST_Z_MIN - OUTER_SKIRT, DIST_X_MAX, DIST_Z_MIN, true);
    addAsphaltSlab(DIST_X_MIN, DIST_Z_MAX, cMinX - 0.02, DIST_Z_MAX + OUTER_SKIRT, true);
    addAsphaltSlab(cMaxX + 0.02, DIST_Z_MAX, DIST_X_MAX, DIST_Z_MAX + OUTER_SKIRT, true);
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

    // Outer corridor ballasted tracks beyond z = ±80 (ground level -1.18 .. -1.00)
    for (const [tz0, tz1] of [[DIST_Z_MIN, southCrossZ0], [northCrossZ1, DIST_Z_MAX]]) {
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
    const self = city;
    const fireEscapePlacements = [];
    const airconPlacements = [];
    const facadeModulePlacements = [];

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
        buildUCourtyardComplex(sb, bx0, bz0, bx1, bz1, 'east', 14.5);
      } else if (blk.zi === 1) {
        buildRukoRow(sb, midX + 1.5, bz0, bx1, bz1, 'east', 5, false);
        buildChamferedTower(sb, bx0, bz0 + 1.5, midX - 0.5, bz1 - 1.5, 28.0);
      } else if (blk.zi === 2) {
        buildLShapedTower(sb, bx0 + 1.0, bz0 + 1.0, bx1 - 1.0, bz1 - 1.0, 2, 34.0);
      } else if (blk.zi === 3) {
        buildRukoRow(sb, midX + 1.5, bz0, bx1, bz1, 'east', 5, true);
        buildDiagonalCivic(sb, bx0, bz0 + 1.0, midX - 0.5, bz1 - 1.0, 14.0);
      } else {
        buildChamferedTower(sb, bx0 + 1.5, bz0 + 1.5, bx1 - 1.5, bz1 - 1.5, 24.0);
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
        buildLShapedTower(sb, bx0 + 1.0, bz0 + 1.0, bx1 - 1.0, bz1 - 1.0, 0, 29.0);
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
        buildDiagonalCivic(sb, bx0 + 1.0, bz0 + 1.0, bx1 - 1.0, bz1 - 1.0, 18.0);
      }
    }

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

    // Streetlamps along Boulevards & Level Crossings (2 Pooled PointLights + emissive bulbs on ALL poles!)
    const lampSpecs = [
      { x: eastInnerSwMaxX - 0.55, z: -66, ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: -20, ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: 0, ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: 20, ry: 0, lit: true },
      { x: eastInnerSwMaxX - 0.55, z: 66, ry: 0, lit: true },
      { x: westInnerSwMinX + 0.55, z: -66, ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: -18, ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: 18, ry: Math.PI, lit: true },
      { x: westInnerSwMinX + 0.55, z: 66, ry: Math.PI, lit: true },
      { x: eastOuterSwMinX + 0.55, z: -42, ry: 0, lit: true },
      { x: eastOuterSwMinX + 0.55, z: 42, ry: 0, lit: false },
      { x: westOuterSwMaxX - 0.55, z: -42, ry: Math.PI, lit: false },
      { x: westOuterSwMaxX - 0.55, z: 42, ry: Math.PI, lit: true },
      { x: cMinX - 1.5, z: CROSSING_Z_SOUTH - 6.8, ry: -Math.PI * 0.5, lit: false },
      { x: cMaxX + 1.5, z: CROSSING_Z_NORTH + 6.8, ry: Math.PI * 0.5, lit: false }
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
          y: SIDEWALK_Y + 4.35,
          z: headZ,
          flicker: (i % 3 === 2)
        });
      }
    }
    // Emit ONLY 2 pooled PointLights (repositioned dynamically near camPos in updateVisibility/update!)
    const poolCount = Math.min(2, city.litLampPositions.length);
    for (let pi = 0; pi < poolCount; pi++) {
      const lp = city.litLampPositions[pi];
      const baseInt = 6.2 * tubeIntensity;
      const ptLight = new THREE.PointLight(0xffa84c, baseInt, 38, 1.22);
      ptLight.position.set(lp.x, lp.y, lp.z);
      ptLight.visible = true; // NEVER toggle visible! Control strictly via intensity.
      ptLight.castShadow = false;
      root.add(ptLight);
      city.streetLights.push({
        light: ptLight,
        baseIntensity: 6.2,
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
    const sedanPlacements = [];
    const mpvAjarPlacements = [];
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
    const angkotPlacements = [];
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
    const busPlacements = [];
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
    const ojolPlacements = [];
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
    const gerobakPlacements = [];
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

    // Traffic Signal Poles at crossing corners (0 PointLights, shader blinking amber!)
    const trafficSignalPlacements = [];
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
        addBox(bCurb, 3.2, 2.85, 4.2, boothX, STREET_GROUND_Y + 1.425, hz + dir * 2.6, 0, 0, 0, 2.5);
        addBox(bSteelDark, 3.5, 0.24, 4.5, boothX, STREET_GROUND_Y + 2.95, hz + dir * 2.6);
        addBox(bAmber, 0.30, 0.22, 0.30, boothX, STREET_GROUND_Y + 3.16, hz + dir * 2.6);
      }
      // Elevated Jakarta Inner-Ring Toll Viaduct Bridge closing deep street sightlines cleanly
      const bridgeZ = hz + dir * 13.0;
      const westBridgeX0 = DIST_X_MIN - 32.0;
      const westBridgeX1 = cMinX - 1.5;
      const eastBridgeX0 = cMaxX + 1.5;
      const eastBridgeX1 = DIST_X_MAX + 32.0;
      for (const [bx0, bx1] of [[westBridgeX0, westBridgeX1], [eastBridgeX0, eastBridgeX1]]) {
        const bw = bx1 - bx0;
        const bcx = (bx0 + bx1) * 0.5;
        // Box girder deck + jersey parapets + support piers
        addBox(bCurb, bw, 1.85, 11.5, bcx, STREET_GROUND_Y + 7.2, bridgeZ, 0, 0, 0, 6.0);
        addBox(bCurb, bw, 1.05, 0.45, bcx, STREET_GROUND_Y + 8.65, bridgeZ - 5.4, 0, 0, 0, 4.0);
        addBox(bCurb, bw, 1.05, 0.45, bcx, STREET_GROUND_Y + 8.65, bridgeZ + 5.4, 0, 0, 0, 4.0);
        for (let px = bx0 + 8.0; px <= bx1 - 6.0; px += 20.0) {
          addBox(bCurb, 2.6, 6.8, 3.2, px, STREET_GROUND_Y + 3.4, bridgeZ, 0, 0, 0, 4.0);
          addBox(bSteelDark, 2.9, 0.5, 5.2, px, STREET_GROUND_Y + 6.4, bridgeZ);
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
      city.disposableGeometries.push(gateMesh.geometry);
      root.add(gateGroup);

      const col = city._addCollider(cMinX, RAIL_TOP_Y, gz - 0.35, cMaxX, RAIL_TOP_Y + 3.5, gz + 0.35, 'metal', {
        blocksWalk: true,
        blocksBullets: false
      });
      col.isTrackGate = true;
      city.trackGates.push({ group: gateGroup, gateMesh, collider: col, z: gz });
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

    // =========================================================
    // 6. MERGE STATIC BUCKETS, SPATIAL PERIMETER CHUNKS, LOD1 & BVH
    // =========================================================
    city._mergeAndRegisterBVH(bAsphalt, matAsphalt, false, true, 'CityRoads', true);
    city._mergeAndRegisterBVH(bSidewalk, matSidewalk, false, true, 'CitySidewalks', true);
    city._mergeAndRegisterBVH(bCurb, matCurb, false, true, 'CityCurbsAndCrossings', true);
    city._mergeAndRegisterBVH(bTactile, matTactile, false, true, 'CityTactile', false);
    city._mergeAndRegisterBVH(bWhiteMark, matMarkWhite, false, true, 'CityMarkingsWhite', false);
    city._mergeAndRegisterBVH(bYellowMark, matMarkYellow, false, true, 'CityMarkingsYellow', false);

    // Unified always-visible invisible BVH hull for all city buildings (never hidden by frustum/LOD culling!)
    city._mergeAndRegisterBVH(bBuildingColl, matInvisColl, false, false, 'CityBuildingCollisionHull', true);

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

    for (let si = 0; si < SECTOR_KEYS.length; si++) {
      const sk = SECTOR_KEYS[si];
      const sb = sectorBuckets[sk];
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
        continue;
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

    city._mergeAndRegisterBVH(bSteelDark, matSteelDark, false, true, 'CitySteelDark', true);
    city._mergeAndRegisterBVH(bTruss, matTruss, false, true, 'CityTrimMetal', true);
    city._mergeAndRegisterBVH(bJpo, matJpo, true, true, 'CityCrossGates', true);
    city._mergeAndRegisterBVH(bGantryFrame, matSteelDark, true, true, 'CityGantryFrame', false);
    city._mergeAndRegisterBVH(bGantrySign, P.getHighwaySignMaterial(), false, false, 'CityGantrySigns', false);
    city._mergeAndRegisterBVH(bLampBulbs, P.getLampBulbMaterial(), false, false, 'CityLampBulbs', false);
    city._mergeAndRegisterBVH(bAmber, matAmber, false, false, 'CityBeacons', false);
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

    buildSkylineSilhouetteRing(city, cMinX, cMaxX, root);

    // =========================================================
    // 7. OPTIMIZED LOW-POLY JAKARTA PROPS + INSTANCED STREET SCENERY
    // =========================================================
    const protoLamp = P.getStreetLampProto();
    const protoCar = city._extractModelProto('covered_car', 1.65);
    const protoBarrier = P.getRoadBarrierProto();
    const protoFence = city._extractModelProto('modular_chainlink_fence', 2.35,
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
    const protoAircon = city._extractModelProto('exterior_aircon_unit', 0.82,
      (n) => n.name === 'exterior_aircon_unit'
    );
    const protoFireEscape = city._extractModelProto('modular_fire_escape', 8.2,
      (n) => n.name !== 'modular_fire_escape_ladder_bottom'
    );
    const protoFacadeMod = city._extractModelProto('modular_urban_apartments_facade', 4.0,
      (n) => /^(wall_door_centered_large_01|door_centered_large_01|dado_door_centered_large_01)$/.test(n.name || '')
    );
    const protoCoffeeCart = city._extractModelProto('CoffeeCart_01', 1.85);
    const protoShrub1 = P.getFoliageCardProto(1.5, 0.72, 1);

    // Shadow casting pruned from minor props (lamps, poles, barriers, fences, trash, trees, etc.)
    city._emitInstancedProto(protoLamp, lampPlacements, false, false, 'StreetLamp');
    city._emitInstancedProto(protoCar, carPlacements, false, true, 'CoveredCar');
    city._emitInstancedProto(protoBarrier, barrierPlacements, false, true, 'RoadBarrier');
    city._emitInstancedProto(protoFence, fencePlacements, false, false, 'ChainlinkFence');
    city._emitInstancedProto(protoPole1, pole1Placements, false, false, 'PowerPoleA');
    city._emitInstancedProto(protoPole2, pole2Placements, false, false, 'PowerPoleB');
    city._emitInstancedProto(protoHydrant, hydrantPlacements, false, true, 'FireHydrant');
    city._emitInstancedProto(protoManhole, manholePlacements, false, true, 'ManholeCover');
    city._emitInstancedProto(protoPowerBox, powerBoxPlacements, false, true, 'PowerBox');
    city._emitInstancedProto(protoTrashCan, trashCanPlacements, false, true, 'TrashCan');
    city._emitInstancedProto(protoTrashBag, trashBagPlacements, false, true, 'TrashBag');
    city._emitInstancedProto(protoBench, seatingPlacements, false, true, 'StreetBench');
    city._emitInstancedProto(protoPlanter, planterPlacements, false, true, 'PlanterBox');
    city._emitInstancedProto(protoAircon, airconPlacements, false, true, 'AirconUnit');
    city._emitInstancedProto(protoFireEscape, fireEscapePlacements, false, true, 'FireEscape');
    city._emitInstancedProto(protoFacadeMod, facadeModulePlacements, false, true, 'FacadeModule');
    city._emitInstancedProto(protoShrub1, shrub1Placements, false, true, 'ShrubHedge');

    // Procedural Jakarta Street Vehicles & Street Dressing (cached low-draw-call merged prototypes)
    city._emitInstancedProto(P.getSedanMpvProto('sedan_closed'), sedanPlacements, false, true, 'JakartaSedan');
    city._emitInstancedProto(P.getSedanMpvProto('mpv_ajar'), mpvAjarPlacements, false, true, 'JakartaMpvAjar');
    city._emitInstancedProto(P.getAngkotProto(), angkotPlacements, false, true, 'JakartaAngkot');
    city._emitInstancedProto(P.getTransJakartaBusProto(), busPlacements, true, true, 'TransJakartaBus');
    city._emitInstancedProto(P.getOjolProto(), ojolPlacements, false, true, 'OjolMotorbike');
    city._emitInstancedProto(P.getGerobakProto(), gerobakPlacements, false, true, 'GerobakKakiLima');
    city._emitInstancedProto(P.getTrafficSignalProto(), trafficSignalPlacements, false, true, 'TrafficSignal');

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
    regDestruct(mpvAjarPlacements, 'vehicle', 2.4);
    regDestruct(angkotPlacements, 'vehicle', 2.4);
    regDestruct(carPlacements, 'vehicle', 2.4);
    regDestruct(busPlacements, 'bus', 4.8);
    regDestruct(ojolPlacements, 'bike', 1.3);
    regDestruct(gerobakPlacements, 'wood_stall', 1.6);
    regDestruct(barrierPlacements, 'concrete', 1.4);
    regDestruct(lampPlacements, 'lamp', 1.2);

    // CoffeeCart_01 vendor cart on East Concourse outer promenade plaza
    city._placeSingleProto(protoCoffeeCart, eastInnerSwMinX + 4.4, SIDEWALK_Y, 10.5, -Math.PI * 0.5, 1.0, city.quadrants ? city.quadrants.SE : null, false);
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

    const plnUsed = usedSet.has('city_pln_box') || city._plnRestored;
    city.interactables.push({
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

    const parkUsed = usedSet.has('city_pocket_park');
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

    // Sittable East Pocket Park Benches
    for (let si = 0; si < seatingPlacements.length; si++) {
      const sp = seatingPlacements[si];
      city.interactables.push({
        id: 'bench_park_' + si,
        type: 'bench',
        x: sp.x,
        y: sp.y + 0.55,
        z: sp.z,
        seatPos: { x: sp.x - 0.12, y: sp.y + 0.02, z: sp.z },
        standPos: { x: sp.x - 0.95, y: sp.y + 0.02, z: sp.z },
        yaw: Math.PI * 0.5,
        label: '[E] Duduk di Bangku Taman',
        prompt: '[E] Duduk di Bangku Taman'
      });
    }

    // 2 Tactical Street Lootboxes (detailed hinged crate + difficulty-scaled yellow halo!)
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

  I.city = Object.assign(I.city || {}, {
    buildDistrict: buildCityDistrict
  });
})();
