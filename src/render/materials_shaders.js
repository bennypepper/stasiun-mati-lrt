(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const R = I.render || {};

  // GLSL Shader Helpers (Three.js r170 verified)
  const GLSL_NOISE_CHUNK = `
    uniform float uTime;
    uniform float uWetness;
    uniform vec3 uFogHazeColor;
    uniform float uFogHazeDensity;
    varying vec3 vLrtWorldPos;
    varying vec3 vLrtWorldNorm;
    float lrtHash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float lrtNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(lrtHash21(i), lrtHash21(i + vec2(1.0, 0.0)), f.x),
        mix(lrtHash21(i + vec2(0.0, 1.0)), lrtHash21(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }
    float lrtFbm(vec2 p) {
      return lrtNoise(p) * 0.65 + lrtNoise(p * 2.15 + 3.7) * 0.35;
    }
  `;

  function injectWorldVaryingsVertex(vertexShader, includeLocal) {
    const extraDecl = includeLocal
      ? 'varying vec3 vLrtWorldPos;\nvarying vec3 vLrtWorldNorm;\nvarying vec3 vLrtLocalPos;'
      : 'varying vec3 vLrtWorldPos;\nvarying vec3 vLrtWorldNorm;';
    const extraAssign = includeLocal ? '\nvLrtLocalPos = position;' : '';

    return vertexShader
      .replace('#include <common>', `#include <common>\n${extraDecl}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 lrtWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lrtWp = instanceMatrix * lrtWp;
        #endif
        lrtWp = modelMatrix * lrtWp;
        vLrtWorldPos = lrtWp.xyz;
        vec3 lrtWn = objectNormal;
        #ifdef USE_INSTANCING
          lrtWn = mat3(instanceMatrix) * lrtWn;
        #endif
        vLrtWorldNorm = normalize(mat3(modelMatrix) * lrtWn);${extraAssign}`
      );
  }

  function applyWorldWeatheringShader(mat, uGlobals, opts) {
    const isWetTerrazzo = !!(opts && opts.wetTerrazzo);
    const minRough = (opts && opts.minRough !== undefined) ? opts.minRough : 0.56;
    const mossStrength = (opts && opts.mossStrength !== undefined) ? opts.mossStrength : 0.36;
    const key = isWetTerrazzo
      ? `lrt_wet_terrazzo_v2_${minRough.toFixed(2)}`
      : `lrt_world_weathering_v2_${minRough.toFixed(2)}_${mossStrength.toFixed(2)}`;

    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uGlobals.uTime;
      shader.uniforms.uWetness = uGlobals.uWetness;
      shader.uniforms.uFogHazeColor = uGlobals.uFogHazeColor;
      shader.uniforms.uFogHazeDensity = uGlobals.uFogHazeDensity;

      shader.vertexShader = injectWorldVaryingsVertex(shader.vertexShader, false);

      let frag = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_NOISE_CHUNK}`);

      const colorInjection = isWetTerrazzo
        ? `#include <color_fragment>
          float grimeN = lrtFbm(vLrtWorldPos.xz * 0.45);
          float microGrit = lrtNoise(vLrtWorldPos.xz * 7.5 + vLrtWorldPos.y * 5.0);
          diffuseColor.rgb *= mix(1.0, 0.78, grimeN * 0.36);
          diffuseColor.rgb *= (0.95 + 0.08 * microGrit);
          float puddleN = lrtNoise(vLrtWorldPos.xz * 0.30 + 4.1) * 0.68 + lrtNoise(vLrtWorldPos.xz * 1.15) * 0.32;
          float puddleMask = smoothstep(0.54, 0.67, puddleN) * smoothstep(0.85, 0.98, vLrtWorldNorm.y) * uWetness;
          diffuseColor.rgb *= mix(1.0, 0.66, puddleMask);
        `
        : `#include <color_fragment>
          float grimeN = lrtFbm(vLrtWorldPos.xz * 0.45 + vLrtWorldPos.y * 0.18);
          float heightDamp = 1.0 - smoothstep(-0.1, 1.35, mod(vLrtWorldPos.y + 1.0, 4.25));
          float microGrit = lrtNoise(vLrtWorldPos.xz * 6.5 + vLrtWorldPos.y * 4.5);
          diffuseColor.rgb *= mix(1.0, 0.70, grimeN * (0.28 + 0.40 * heightDamp));
          diffuseColor.rgb *= (0.94 + 0.10 * microGrit);
          float upMask = smoothstep(0.58, 0.95, vLrtWorldNorm.y);
          float mossNoise = lrtNoise(vLrtWorldPos.xz * 0.75 + 11.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.24, 0.12), smoothstep(0.68, 0.86, mossNoise) * upMask * ${mossStrength.toFixed(2)});
        `;

      const roughInjection = isWetTerrazzo
        ? `#include <roughnessmap_fragment>
          roughnessFactor = max(roughnessFactor, ${minRough.toFixed(2)});
          roughnessFactor = mix(roughnessFactor, 0.05, puddleMask);
        `
        : `#include <roughnessmap_fragment>
          roughnessFactor = max(roughnessFactor, ${minRough.toFixed(2)});
        `;

      const fogInjection = `#include <fog_fragment>
        #ifdef USE_FOG
          float hMist = clamp(1.0 - smoothstep(-2.0, 10.0, vLrtWorldPos.y), 0.0, 1.0);
          float distFade = 1.0 - exp(-0.0045 * vFogDepth * vFogDepth * (0.45 + 0.85 * hMist));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, uFogHazeColor, hMist * 0.55), clamp(distFade * uFogHazeDensity, 0.0, 0.72));
        #endif
      `;

      frag = frag
        .replace('#include <color_fragment>', colorInjection)
        .replace('#include <roughnessmap_fragment>', roughInjection)
        .replace('#include <fog_fragment>', fogInjection);

      shader.fragmentShader = frag;
    };
    return mat;
  }

  function applyTrainMetalShader(mat, uGlobals) {
    mat.customProgramCacheKey = () => 'lrt_train_metal_v1';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uGlobals.uTime;
      shader.uniforms.uWetness = uGlobals.uWetness;
      shader.uniforms.uFogHazeColor = uGlobals.uFogHazeColor;
      shader.uniforms.uFogHazeDensity = uGlobals.uFogHazeDensity;

      shader.vertexShader = injectWorldVaryingsVertex(shader.vertexShader, true);
      let frag = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_NOISE_CHUNK}\nvarying vec3 vLrtLocalPos;`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float streakNoise = lrtNoise(vec2(vLrtLocalPos.z * 2.4 + vLrtLocalPos.x * 1.9, vLrtLocalPos.y * 0.45));
          float dripTop = smoothstep(1.3, 2.35, vLrtLocalPos.y);
          float skirtDirt = 1.0 - smoothstep(-0.8, 0.35, vLrtLocalPos.y);
          float grimeBand = clamp((dripTop * 0.65 + skirtDirt * 0.85) * smoothstep(0.38, 0.78, streakNoise), 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 0.62, grimeBand);
        `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.78, grimeBand * 0.65);
        `
        );
      shader.fragmentShader = frag;
    };
    return mat;
  }

  function applyFlickerEmissiveShader(mat, uGlobals) {
    mat.customProgramCacheKey = () => 'lrt_flicker_emissive_v1';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uGlobals.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aTubeState;\nvarying vec2 vTubeState;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTubeState = aTubeState;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vTubeState;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float tHealth = vTubeState.y;
          float tSeed = vTubeState.x;
          float stepClk = floor(uTime * 18.0);
          float rnd = fract(sin(stepClk + tSeed * 73.17) * 43758.5453);
          float hum = 0.94 + 0.06 * sin(uTime * 34.0 + tSeed * 31.0);
          float thresh = 0.18 + (1.0 - tHealth) * 0.58;
          float flick = step(thresh, rnd);
          float arcBurst = step(0.86, fract(sin(floor(uTime * 28.0) + tSeed * 19.3) * 19341.7)) * (1.0 - tHealth);
          float aliveMask = step(0.05, tHealth);
          float dmgMode = 1.0 - step(0.92, tHealth);
          float finalGain = mix(hum, flick * (0.45 + 0.95 * arcBurst), dmgMode) * aliveMask;
          vec3 arcTint = mix(vec3(1.0), vec3(1.35, 0.82, 0.42), arcBurst * dmgMode);
          totalEmissiveRadiance *= finalGain * arcTint;
        `
        );
    };
    return mat;
  }

  const Materials = {
    envRT: null,
    _pmremCache: new Map(),
    _pmremGen: null,
    _renderer: null,
    _scene: null,
    _fallbackEnvRT: null,
    uGlobals: {
      uTime: { value: 0 },
      uWetness: { value: 0.28 },
      uFogHazeColor: { value: new THREE.Color(0x9eb8cc) },
      uFogHazeDensity: { value: 0.22 }
    },
    textures: {},
    mats: {},
    _initialized: false,

    // Exact UV sub-rects [u0, v0, u1, v1] (Three.js bottom-up V: v = 1 - canvasY/H)
    STALL_UV: {
      rotioFascia: [0.0, 0.5, 0.5, 1.0],
      rotioSignTop: [0.0, 0.68, 0.5, 1.0],
      rotioSlatsOnly: [0.0, 0.5, 0.5, 0.68],
      rotioMedallion: [0.5, 0.5, 0.625, 1.0],
      rotioCreamSolid: [0.501, 0.52, 0.508, 0.98],
      rotioSubwayTile: [0.625, 0.5, 0.75, 1.0],
      rotioMenu: [0.75, 0.5, 1.0, 1.0],
      rotioMenuBoard: [0.75, 0.68, 1.0, 1.0],
      rotioBuns: [0.75, 0.5, 1.0, 0.68],
      indomaretHeader: [0.0, 0.34, 0.375, 0.5],
      indomaretCooler: [0.0, 0.0, 0.375, 0.34],
      jaklingko: [0.375, 0.0, 0.5, 0.5],
      loketWood: [0.5, 0.0, 0.625, 0.5],
      coway: [0.625, 0.0, 0.75, 0.5],
      turnstilePurple: [0.75, 0.0, 0.875, 0.5],
      shutter260: [0.875, 0.0, 1.0, 0.5]
    },
    SIGN_UV: {
      psdHeader: [0.0, 0.6875, 0.5, 1.0],
      exitYellow: [0.5, 0.6875, 0.875, 1.0],
      evakuasiGreen: [0.875, 0.6875, 1.0, 1.0],
      smartTravelAd: [0.0, 0.296875, 0.5, 0.6875],
      safetyWarn: [0.5, 0.296875, 0.8125, 0.6875],
      hydrantRed: [0.8125, 0.296875, 1.0, 0.6875],
      hydrantRedSolid: [0.8135, 0.32, 0.820, 0.66],
      routeMap: [0.0, 0.0, 0.5, 0.296875],
      callTrain: [0.5, 0.0, 0.75, 0.296875],
      loketHeader: [0.75, 0.0, 1.0, 0.296875]
    },

    setEnvironmentTexture: function (envTexOrKey, scene, renderer) {
      const targetRenderer = renderer || this._renderer;
      const targetScene = scene || this._scene;
      if (targetRenderer) this._renderer = targetRenderer;
      if (targetScene) this._scene = targetScene;

      let hdrTex = null;
      if (typeof envTexOrKey === 'string') {
        if (LRT.AssetLoader && typeof LRT.AssetLoader.getHdri === 'function') {
          hdrTex = LRT.AssetLoader.getHdri(envTexOrKey);
        }
      } else if (envTexOrKey && envTexOrKey.isTexture) {
        hdrTex = envTexOrKey;
      }

      if (hdrTex && targetRenderer) {
        const cacheKey = typeof envTexOrKey === 'string' ? `${envTexOrKey}_${hdrTex.uuid}` : hdrTex.uuid;
        let rt = this._pmremCache.get(cacheKey);
        if (!rt) {
          if (!this._pmremGen) {
            this._pmremGen = new THREE.PMREMGenerator(targetRenderer);
            this._pmremGen.compileEquirectangularShader();
          }
          rt = this._pmremGen.fromEquirectangular(hdrTex);
          this._pmremCache.set(cacheKey, rt);
        }
        this.envRT = rt;
        if (targetScene) targetScene.environment = rt.texture;
        return rt.texture;
      }

      if (this._fallbackEnvRT) {
        this.envRT = this._fallbackEnvRT;
        if (targetScene) targetScene.environment = this._fallbackEnvRT.texture;
        return this._fallbackEnvRT.texture;
      }
      return null;
    },

    init: function (renderer, scene) {
      if (renderer) this._renderer = renderer;
      if (scene) this._scene = scene;

      if (this._initialized) {
        if (scene && this.envRT) scene.environment = this.envRT.texture;
        return this;
      }

      const maxAniso = renderer && renderer.capabilities
        ? Math.min(8, renderer.capabilities.getMaxAnisotropy())
        : 4;

      if (LRT.AssetLoader && typeof LRT.AssetLoader.setAnisotropy === 'function') {
        LRT.AssetLoader.setAnisotropy(maxAniso);
      }

      // 1. PMREM Environment Map (Real Poly Haven HDRI if loaded, fast procedural fallback otherwise)
      if (renderer) {
        const initialHdri = (LRT.AssetLoader && LRT.AssetLoader.getHdri)
          ? (LRT.AssetLoader.getHdri('day_clear') || LRT.AssetLoader.getHdri('night_station'))
          : null;
        if (initialHdri) {
          this.setEnvironmentTexture(initialHdri, scene, renderer);
        } else {
          const envC = R.makeCanvas(128, 64);
          const ectx = envC.getContext('2d');
          const g = ectx.createLinearGradient(0, 0, 0, 64);
          g.addColorStop(0.0, '#3a6fa8');
          g.addColorStop(0.45, '#a8c6dc');
          g.addColorStop(0.55, '#464a52');
          g.addColorStop(1.0, '#1c1d20');
          ectx.fillStyle = g;
          ectx.fillRect(0, 0, 128, 64);
          const envTex = new THREE.CanvasTexture(envC);
          envTex.mapping = THREE.EquirectangularReflectionMapping;
          envTex.colorSpace = THREE.SRGBColorSpace;
          if (!this._pmremGen) {
            this._pmremGen = new THREE.PMREMGenerator(renderer);
            this._pmremGen.compileEquirectangularShader();
          }
          this._fallbackEnvRT = this._pmremGen.fromEquirectangular(envTex);
          this.envRT = this._fallbackEnvRT;
          if (scene) scene.environment = this.envRT.texture;
          envTex.dispose();
        }
      }

      const getPolySet = (key, rx, ry, fallbackBuilder) => {
        if (LRT.AssetLoader && typeof LRT.AssetLoader.getTextureSet === 'function') {
          const set = LRT.AssetLoader.getTextureSet(key, rx || 1, ry || 1);
          if (set && set.map) return set;
        }
        return typeof fallbackBuilder === 'function' ? fallbackBuilder() : null;
      };

      // 2. Real Poly Haven PBR Texture Cache (with fast fallback ONLY if AssetLoader didn't load a key)
      const concrete = getPolySet('concrete_station', 1, 1, () => R.buildConcreteSet(maxAniso));
      const concreteRough = getPolySet('concrete_rough', 1, 1, () => concrete);
      const terrazzo = getPolySet('platform_granite', 1, 1, () => R.buildTerrazzoSet(maxAniso, false));
      const checker = getPolySet('concourse_tile', 1, 1, () => R.buildTerrazzoSet(maxAniso, true));
      const asphalt = getPolySet('asphalt_road', 1, 1, () => ({ map: R.buildHighwayRoadSet(maxAniso) }));
      const sidewalkPaver = getPolySet('sidewalk_paver', 1, 1, () => concrete);
      const roofPoly = getPolySet('roof_corrugated', 1, 1, null);
      const roofTerra = roofPoly || R.buildCorrugatedRoofSet(maxAniso, [168, 94, 50], 601);
      const roofOchre = roofPoly || R.buildCorrugatedRoofSet(maxAniso, [194, 124, 40], 613);
      const roofSteel = roofPoly || R.buildCorrugatedRoofSet(maxAniso, [142, 148, 154], 629);
      const rustMetal = getPolySet('rust_metal', 1, 1, () => roofSteel);
      const facadeModern = getPolySet('building_facade_1', 1, 1, () => concrete);
      const facadePlaster = getPolySet('building_facade_2', 1, 1, () => concrete);
      const brickWall = getPolySet('brick_wall', 1, 1, () => concrete);
      const darkWood = getPolySet('dark_wood', 1, 1, () => concrete);

      const tactile = R.buildTactileYellowSet(maxAniso);
      const trainLivery = R.buildTrainLiveryAtlas(maxAniso);
      const trainInterior = R.buildTrainInteriorAtlas(maxAniso);
      const stall = R.buildStallAtlas(maxAniso);
      const signage = R.buildSignageAtlas(maxAniso);
      const foliageVine = R.buildFoliageVineTexture(maxAniso);
      const decalScorch = R.buildScorchDecalTexture(maxAniso);
      const barricadeTex = R.buildBarricadeTexture(maxAniso);
      const skylineFacade = R.buildSkylineFacadeSet(maxAniso);

      // Reusable 1024x256 Station Banner CanvasTexture (high-res crisp sign!)
      const bCanvas = R.makeCanvas(1024, 256);
      const beCanvas = R.makeCanvas(1024, 256);
      this._bannerCanvas = bCanvas;
      this._bannerCtx = bCanvas.getContext('2d');
      this._bannerECanvas = beCanvas;
      this._bannerECtx = beCanvas.getContext('2d');
      const bannerMap = R.finalizeCanvasTexture(bCanvas, true, false, maxAniso);
      const bannerEmissive = R.finalizeCanvasTexture(beCanvas, true, false, maxAniso);

      this.textures = {
        concrete_weathered: concrete,
        concrete_rough: concreteRough,
        terrazzo_tile: terrazzo,
        checker_tile: checker,
        asphalt_road: asphalt,
        sidewalk_paver: sidewalkPaver,
        tactile_yellow: tactile,
        corrugated_roof: roofTerra,
        corrugated_ochre: roofOchre,
        corrugated_steel: roofSteel,
        rust_metal: rustMetal,
        facade_modern: facadeModern,
        facade_plaster: facadePlaster,
        brick_wall: brickWall,
        dark_wood: darkWood,
        train_livery_atlas: trainLivery,
        train_interior_atlas: trainInterior,
        stall_atlas: stall,
        signage_atlas: signage,
        station_banner: { map: bannerMap, emissiveMap: bannerEmissive },
        foliage_vine: foliageVine,
        decal_scorch: decalScorch,
        barricade: barricadeTex,
        skyline_facade: skylineFacade,
        highway_road: asphalt.map || asphalt
      };

      this.repaintStationBanner({
        codeCB: 'CB 01',
        codeBK: 'BK 01',
        name: 'Dukuh Atas BSI',
        subtitle: 'LRT JABODEBEK  •  PERON 1'
      });

      const makePbrProps = (texSet, extra) => {
        const props = Object.assign({}, extra);
        if (texSet) {
          if (texSet.map) props.map = texSet.map;
          if (texSet.normalMap) {
            props.normalMap = texSet.normalMap;
            if (!props.normalScale) props.normalScale = new THREE.Vector2(1.0, 1.0);
          }
          if (texSet.roughnessMap) props.roughnessMap = texSet.roughnessMap;
          if (texSet.aoMap) {
            props.aoMap = texSet.aoMap;
            if (props.aoMapIntensity === undefined) props.aoMapIntensity = 0.65;
          }
        }
        return props;
      };

      // 3. Shared PBR Materials (calibrated matte/rough vs shiny clearcoat & brushed metal)
      const u = this.uGlobals;
      this.mats = {
        concrete: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(concrete, {
          normalScale: new THREE.Vector2(1.0, 1.0),
          roughness: 0.88,
          metalness: 0.0
        })), u, { minRough: 0.62, mossStrength: 0.30 }),

        concreteRough: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(concreteRough, {
          normalScale: new THREE.Vector2(1.15, 1.15),
          roughness: 0.92,
          metalness: 0.0
        })), u, { minRough: 0.68, mossStrength: 0.32 }),

        concretePillar: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(concrete, {
          normalScale: new THREE.Vector2(1.05, 1.05),
          roughness: 0.90,
          metalness: 0.0,
          vertexColors: true
        })), u, { minRough: 0.64, mossStrength: 0.36 }),

        concreteRebar: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(concreteRough, {
          color: 0xc8c2b8,
          normalScale: new THREE.Vector2(1.15, 1.15),
          roughness: 0.86,
          metalness: 0.24,
          vertexColors: true
        })), u, { minRough: 0.58, mossStrength: 0.08 }),

        terrazzo: applyWorldWeatheringShader(new THREE.MeshPhysicalMaterial(makePbrProps(terrazzo, {
          normalScale: new THREE.Vector2(0.85, 0.85),
          roughness: 0.42,
          metalness: 0.04,
          clearcoat: 0.45,
          clearcoatRoughness: 0.24,
          envMapIntensity: 1.25
        })), u, { wetTerrazzo: true, minRough: 0.26 }),

        checkerFloor: applyWorldWeatheringShader(new THREE.MeshPhysicalMaterial(makePbrProps(checker, {
          normalScale: new THREE.Vector2(0.85, 0.85),
          roughness: 0.36,
          metalness: 0.04,
          clearcoat: 0.58,
          clearcoatRoughness: 0.18,
          envMapIntensity: 1.35
        })), u, { wetTerrazzo: true, minRough: 0.22 }),

        asphaltRoad: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(asphalt, {
          color: 0x4c515a,
          normalScale: new THREE.Vector2(1.08, 1.08),
          roughness: 0.78,
          metalness: 0.04
        })), u, { minRough: 0.28, mossStrength: 0.06 }),

        highwayAsphalt: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(asphalt, {
          color: 0x4c515a,
          normalScale: new THREE.Vector2(1.08, 1.08),
          roughness: 0.78,
          metalness: 0.04
        })), u, { minRough: 0.28, mossStrength: 0.06 }),

        sidewalkPaver: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(sidewalkPaver, {
          normalScale: new THREE.Vector2(1.0, 1.0),
          roughness: 0.82,
          metalness: 0.02
        })), u, { minRough: 0.56, mossStrength: 0.18 }),

        tactile: applyWorldWeatheringShader(new THREE.MeshStandardMaterial({
          map: tactile.map,
          normalMap: tactile.normalMap,
          normalScale: new THREE.Vector2(1.4, 1.4),
          roughnessMap: tactile.roughnessMap,
          roughness: 0.72,
          metalness: 0.02
        }), u, { minRough: 0.52, mossStrength: 0.05 }),

        roofTerracotta: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(roofTerra, {
          color: roofPoly ? 0xbd6e42 : 0xffffff,
          roughness: 0.54,
          metalness: 0.42,
          side: THREE.DoubleSide
        })), u, { minRough: 0.44, mossStrength: 0.16 }),

        roofOchre: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(roofOchre, {
          color: roofPoly ? 0xd28e3c : 0xffffff,
          roughness: 0.54,
          metalness: 0.42,
          side: THREE.DoubleSide
        })), u, { minRough: 0.44, mossStrength: 0.16 }),

        rustMetal: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(rustMetal, {
          roughness: 0.68,
          metalness: 0.62,
          side: THREE.DoubleSide
        })), u, { minRough: 0.48, mossStrength: 0.14 }),

        facadeModern: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(facadeModern, {
          normalScale: new THREE.Vector2(0.95, 0.95),
          roughness: 0.62,
          metalness: 0.12
        })), u, { minRough: 0.48, mossStrength: 0.14 }),

        facadePlaster: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(facadePlaster, {
          normalScale: new THREE.Vector2(0.95, 0.95),
          roughness: 0.76,
          metalness: 0.04
        })), u, { minRough: 0.54, mossStrength: 0.18 }),

        brickWall: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(brickWall, {
          normalScale: new THREE.Vector2(1.1, 1.1),
          roughness: 0.84,
          metalness: 0.02
        })), u, { minRough: 0.58, mossStrength: 0.22 }),

        darkWood: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(darkWood, {
          normalScale: new THREE.Vector2(0.9, 0.9),
          roughness: 0.72,
          metalness: 0.04
        })), u, { minRough: 0.50, mossStrength: 0.08 }),

        steelTruss: applyWorldWeatheringShader(new THREE.MeshStandardMaterial({
          color: 0xd8dde3,
          roughness: 0.24,
          metalness: 0.88,
          envMapIntensity: 1.4
        }), u, { minRough: 0.20, mossStrength: 0.08 }),

        steelDark: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(roofSteel, {
          color: 0x4c5259,
          roughness: 0.52,
          metalness: 0.68
        })), u, { minRough: 0.42, mossStrength: 0.12 }),

        jpoOrange: applyWorldWeatheringShader(new THREE.MeshStandardMaterial(makePbrProps(roofSteel, {
          color: 0xe04628,
          roughness: 0.52,
          metalness: 0.30
        })), u, { minRough: 0.45, mossStrength: 0.12 }),

        stallAtlas: new THREE.MeshStandardMaterial({
          map: stall.map,
          normalMap: stall.normalMap,
          normalScale: new THREE.Vector2(0.9, 0.9),
          roughnessMap: stall.roughnessMap,
          roughness: 0.62,
          metalness: 0.25,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: stall.emissiveMap,
          emissiveIntensity: 0.72
        }),

        signageAtlas: new THREE.MeshStandardMaterial({
          map: signage.map,
          roughness: 0.42,
          metalness: 0.18,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: signage.emissiveMap,
          emissiveIntensity: 0.56
        }),

        stationBanner: new THREE.MeshStandardMaterial({
          map: bannerMap,
          roughness: 0.38,
          metalness: 0.20,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: bannerEmissive,
          emissiveIntensity: 0.62
        }),

        glassPsd: new THREE.MeshPhysicalMaterial({
          color: 0x3b5360,
          roughness: 0.05,
          metalness: 0.12,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.65,
          transparent: true,
          opacity: 0.36,
          depthWrite: false
        }),

        glassClear: new THREE.MeshPhysicalMaterial({
          color: 0xa4c8d8,
          roughness: 0.05,
          metalness: 0.10,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.65,
          transparent: true,
          opacity: 0.28,
          depthWrite: false
        }),

        glassBuilding: new THREE.MeshPhysicalMaterial({
          color: 0x243846,
          roughness: 0.09,
          metalness: 0.32,
          clearcoat: 0.92,
          clearcoatRoughness: 0.06,
          envMapIntensity: 1.15,
          ior: 1.52,
          reflectivity: 0.88
        }),

        foliageVine: new THREE.MeshStandardMaterial({
          map: foliageVine,
          alphaTest: 0.45,
          side: THREE.DoubleSide,
          roughness: 0.85,
          metalness: 0.0
        }),

        propsPaint: applyWorldWeatheringShader(new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.58,
          metalness: 0.22
        }), u, { minRough: 0.48, mossStrength: 0.08 }),

        propsMetal: new THREE.MeshStandardMaterial({
          color: 0xe4e8ed,
          roughness: 0.24,
          metalness: 0.88,
          envMapIntensity: 1.4
        }),

        barricade: applyWorldWeatheringShader(new THREE.MeshStandardMaterial({
          map: barricadeTex,
          roughness: 0.60,
          metalness: 0.06
        }), u, { minRough: 0.50, mossStrength: 0.04 }),

        amberBeacon: new THREE.MeshStandardMaterial({
          color: 0xff5a14,
          emissive: new THREE.Color(0xff4400),
          emissiveIntensity: 2.2,
          roughness: 0.25,
          metalness: 0.2
        }),

        skylineBuilding: new THREE.MeshPhysicalMaterial({
          color: 0xc2cbd6,
          map: skylineFacade.map,
          roughnessMap: skylineFacade.roughnessMap,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: skylineFacade.emissiveMap,
          emissiveIntensity: 0.36,
          roughness: 0.45,
          metalness: 0.35,
          clearcoat: 0.45,
          clearcoatRoughness: 0.16,
          envMapIntensity: 1.35
        }),

        foliageTree: new THREE.MeshStandardMaterial({
          color: 0x3b5c2c,
          roughness: 0.88,
          metalness: 0.0
        }),

        skylineLit: new THREE.MeshStandardMaterial({
          color: 0xffe4a8,
          emissive: new THREE.Color(0xffc970),
          emissiveIntensity: 1.0,
          roughness: 0.4
        }),

        tubeHalo: new THREE.MeshBasicMaterial({
          color: 0xbcd9f5,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        }),

        trainBody: applyTrainMetalShader(new THREE.MeshPhysicalMaterial({
          map: trainLivery.map,
          roughnessMap: trainLivery.roughnessMap,
          roughness: 0.36,
          metalness: 0.34,
          clearcoat: 0.55,
          clearcoatRoughness: 0.22,
          envMapIntensity: 1.45,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: trainLivery.emissiveMap,
          emissiveIntensity: 1.05,
          vertexColors: false
        }), u),

        trainInterior: applyTrainMetalShader(new THREE.MeshPhysicalMaterial({
          map: trainInterior.map,
          roughnessMap: trainInterior.roughnessMap,
          roughness: 0.62,
          metalness: 0.08,
          clearcoat: 0.32,
          clearcoatRoughness: 0.26,
          envMapIntensity: 1.20,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: trainInterior.emissiveMap,
          emissiveIntensity: 0.72
        }), u),

        scorchDecal: new THREE.MeshBasicMaterial({
          map: decalScorch,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          side: THREE.DoubleSide
        })
      };

      this.mats.flickerTube = this.createFlickerMat({
        color: 0xe2f2ff,
        emissive: 0xcce8ff,
        emissiveIntensity: 1.65,
        roughness: 0.22
      });

      this._initialized = true;
      return this;
    },

    createFlickerMat: function (opts) {
      const o = opts || {};
      const mat = new THREE.MeshStandardMaterial({
        color: o.color !== undefined ? o.color : 0xeaf6ff,
        emissive: new THREE.Color(o.emissive !== undefined ? o.emissive : 0xd9f0ff),
        emissiveIntensity: o.emissiveIntensity !== undefined ? o.emissiveIntensity : 1.9,
        roughness: o.roughness !== undefined ? o.roughness : 0.25,
        metalness: o.metalness !== undefined ? o.metalness : 0.05
      });
      return applyFlickerEmissiveShader(mat, this.uGlobals);
    },

    repaintStationBanner: function (info) {
      if (!this._bannerCtx) return;
      const ctx = this._bannerCtx;
      const etx = this._bannerECtx;
      const cfg = info || {};

      ctx.setTransform(2, 0, 0, 2, 0, 0);
      etx.setTransform(2, 0, 0, 2, 0, 0);

      ctx.fillStyle = '#16325C';
      ctx.fillRect(0, 0, 512, 128);
      etx.fillStyle = '#142B52';
      etx.fillRect(0, 0, 512, 128);

      // Top accent stripe
      ctx.fillStyle = cfg.accentColor || '#E5D429';
      ctx.fillRect(0, 0, 512, 7);

      // Line badges
      let textStartX = 24;
      if (cfg.codeCB) {
        ctx.fillStyle = '#1D4ED8';
        ctx.beginPath();
        ctx.arc(46, 56, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cfg.codeCB, 46, 61);
        etx.fillStyle = '#2563EB';
        etx.beginPath();
        etx.arc(46, 56, 20, 0, Math.PI * 2);
        etx.fill();
        textStartX = 82;
      }
      if (cfg.codeBK) {
        const cx = cfg.codeCB ? 98 : 46;
        ctx.fillStyle = '#15803D';
        ctx.beginPath();
        ctx.arc(cx, 56, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cfg.codeBK, cx, 61);
        etx.fillStyle = '#16A34A';
        etx.beginPath();
        etx.arc(cx, 56, 20, 0, Math.PI * 2);
        etx.fill();
        textStartX = cx + 36;
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(cfg.name || 'Dukuh Atas BSI', textStartX, 64);
      etx.textAlign = 'left';
      etx.fillStyle = '#9EC5F8';
      etx.font = 'bold 34px sans-serif';
      etx.fillText(cfg.name || 'Dukuh Atas BSI', textStartX, 64);

      ctx.fillStyle = '#C8D6EA';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(cfg.subtitle || 'LRT JABODEBEK  •  PERON 1', textStartX, 96);

      // Subtle weathering smudges
      ctx.fillStyle = 'rgba(22,20,18,0.22)';
      ctx.fillRect(0, 114, 512, 14);

      this.textures.station_banner.map.needsUpdate = true;
      this.textures.station_banner.emissiveMap.needsUpdate = true;
    },

    registerScorchShader: function (mat) {
      return applyWorldWeatheringShader(mat, this.uGlobals, { minRough: 0.62 });
    },

    update: function (time, wetness) {
      this.uGlobals.uTime.value = time;
      if (wetness !== undefined && wetness !== null) {
        this.uGlobals.uWetness.value = wetness;
      }
    }
  };

  LRT.Materials = Materials;
  LRT.Assets = Materials;
})(window.LRT = window.LRT || {});
