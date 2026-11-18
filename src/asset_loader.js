(function (LRT) {
  'use strict';

  const hdris = new Map();
  const textures = new Map();
  const models = new Map();

  let manifest = null;
  let ready = false;
  let preloadPromise = null;
  let defaultAnisotropy = 4;

  const stats = {
    ready: false,
    hdrisLoaded: 0,
    texturesLoaded: 0,
    modelsLoaded: 0,
    failed: [],
    elapsedMs: 0,
  };

  function setAnisotropy(val) {
    const n = Number(val);
    if (Number.isFinite(n) && n >= 1) {
      defaultAnisotropy = Math.min(16, Math.round(n));
    }
  }

  function configureTexture(tex, colorSpace, repeatX, repeatY) {
    tex.colorSpace = colorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = defaultAnisotropy;
    tex.needsUpdate = true;
    return tex;
  }

  function applyTextureAnisotropy(mat) {
    if (!mat) return;
    const maps = [
      mat.map,
      mat.normalMap,
      mat.roughnessMap,
      mat.metalnessMap,
      mat.aoMap,
      mat.emissiveMap,
    ];
    for (let i = 0; i < maps.length; i++) {
      if (maps[i]) maps[i].anisotropy = defaultAnisotropy;
    }
  }

  async function runWithConcurrency(tasks, concurrency, onTaskDone) {
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
    const workers = [];

    for (let w = 0; w < workerCount; w++) {
      workers.push((async () => {
        while (cursor < tasks.length) {
          const idx = cursor++;
          const task = tasks[idx];
          let lastErr = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await task.run();
              lastErr = null;
              break;
            } catch (err) {
              lastErr = err;
              if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
              }
            }
          }
          if (lastErr) {
            const msg = String(lastErr && lastErr.message ? lastErr.message : lastErr);
            stats.failed.push({ type: task.type, key: task.key, error: msg });
            console.error(`[AssetLoader] Failed ${task.type}:${task.key}`, lastErr);
          }
          onTaskDone(task);
        }
      })());
    }

    await Promise.all(workers);
  }

  function preloadAll(onProgress) {
    if (preloadPromise) return preloadPromise;

    preloadPromise = (async () => {
      const t0 = performance.now();
      const report = (loaded, total, label) => {
        if (typeof onProgress === 'function') {
          try {
            onProgress(loaded, total, label);
          } catch (_) {}
        }
      };

      report(0, 1, 'Loading asset manifest...');
      const resp = await fetch('assets/manifest.json', { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`Failed to fetch assets/manifest.json (${resp.status})`);
      }
      manifest = await resp.json();

      const JSM = window.THREE_JSM || {};
      if (!JSM.RGBELoader || !JSM.GLTFLoader || !JSM.DRACOLoader) {
        throw new Error('THREE_JSM loaders missing (RGBELoader/GLTFLoader/DRACOLoader)');
      }

      const rgbeLoader = new JSM.RGBELoader();
      const texLoader = new THREE.TextureLoader();
      const dracoLoader = new JSM.DRACOLoader();
      dracoLoader.setDecoderPath('./vendor/three/draco/');
      const gltfLoader = new JSM.GLTFLoader();
      gltfLoader.setDRACOLoader(dracoLoader);

      const tasks = [];

      const hdriEntries = Object.entries(manifest.hdris || {});
      for (const [key, entry] of hdriEntries) {
        tasks.push({
          type: 'hdri',
          key,
          label: `HDRI: ${key}`,
          run: async () => {
            const tex = await rgbeLoader.loadAsync(entry.path);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            hdris.set(key, tex);
            stats.hdrisLoaded++;
          },
        });
      }

      const texEntries = Object.entries(manifest.textures || {});
      for (const [key, entry] of texEntries) {
        tasks.push({
          type: 'texture',
          key,
          label: `PBR: ${key}`,
          run: async () => {
            const [diff, nor, arm] = await Promise.all([
              texLoader.loadAsync(entry.diff),
              texLoader.loadAsync(entry.nor),
              texLoader.loadAsync(entry.arm),
            ]);
            configureTexture(diff, THREE.SRGBColorSpace, 1, 1);
            configureTexture(nor, THREE.NoColorSpace, 1, 1);
            configureTexture(arm, THREE.NoColorSpace, 1, 1);
            textures.set(key, { diff, nor, arm });
            stats.texturesLoaded++;
          },
        });
      }

      // Models replaced by lightweight procedural protos (avoid downloading/decoding 200+ MB of redundant 2K textures)
      const SKIP_REPLACED_MODELS = new Set([
        'concrete_road_barrier',
        'street_lamp_01',
        'fire_hydrant',
        'modular_electricity_poles',
        'power_box_01',
        'modular_street_seating',
        'water_manhole_cover',
        'metal_trash_can',
        'trashbag',
        'shrub_01',
        'shrub_02',
        'fern_02',
        'calathea_orbifolia_01'
      ]);

      const modelEntries = Object.entries(manifest.models || {});
      for (const [key, entry] of modelEntries) {
        if (SKIP_REPLACED_MODELS.has(key)) continue;
        tasks.push({
          type: 'model',
          key,
          label: `3D Model: ${key}`,
          run: async () => {
            const gltf = await gltfLoader.loadAsync(entry.gltf);
            if (gltf && gltf.scene) {
              gltf.scene.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                  if (child.isSkinnedMesh) {
                    child.frustumCulled = false;
                  }
                  if (Array.isArray(child.material)) {
                    child.material.forEach(applyTextureAnisotropy);
                  } else {
                    applyTextureAnisotropy(child.material);
                  }
                }
              });
            }
            models.set(key, gltf);
            stats.modelsLoaded++;
          },
        });
      }

      const total = tasks.length;
      let loaded = 0;
      report(0, Math.max(1, total), total > 0 ? `Loading ${total} asset bundles...` : 'No assets queued');

      await runWithConcurrency(tasks, 2, (task) => {
        loaded++;
        report(loaded, Math.max(1, total), task.label);
      });

      stats.elapsedMs = Math.round(performance.now() - t0);
      stats.ready = true;
      ready = true;
      report(Math.max(1, total), Math.max(1, total), 'Assets ready');
      return getStats();
    })();

    return preloadPromise;
  }

  function getTextureSet(key, repeatX, repeatY) {
    const base = textures.get(key);
    if (!base) return null;
    const rx = Number.isFinite(repeatX) ? repeatX : 1;
    const ry = Number.isFinite(repeatY) ? repeatY : 1;

    const map = configureTexture(base.diff.clone(), THREE.SRGBColorSpace, rx, ry);
    const normalMap = configureTexture(base.nor.clone(), THREE.NoColorSpace, rx, ry);
    const arm = configureTexture(base.arm.clone(), THREE.NoColorSpace, rx, ry);

    return {
      map,
      normalMap,
      roughnessMap: arm,
      aoMap: arm,
    };
  }

  function getHdri(key) {
    return hdris.get(key) || null;
  }

  function instantiateModel(key, opts) {
    const gltf = models.get(key);
    if (!gltf || !gltf.scene) return null;

    const options = opts || {};
    const cloneMaterials = !!options.cloneMaterials;
    const castShadow = options.castShadow !== undefined ? !!options.castShadow : true;
    const receiveShadow = options.receiveShadow !== undefined ? !!options.receiveShadow : true;
    const envMapIntensity =
      typeof options.envMapIntensity === 'number' ? options.envMapIntensity : null;

    const group = gltf.scene.clone(true);
    let hasLodNodes = false;
    group.traverse((node) => {
      if (node.isMesh && /_LOD([012])$/.test(node.name || '')) hasLodNodes = true;
    });
    if (hasLodNodes) {
      const prune = [];
      group.traverse((node) => {
        if (node.isMesh && /_LOD[12]$/.test(node.name || '')) prune.push(node);
      });
      for (let i = 0; i < prune.length; i++) prune[i].removeFromParent();
    }
    group.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = castShadow;
      node.receiveShadow = receiveShadow;
      if (node.isSkinnedMesh) {
        node.frustumCulled = false;
      }

      if (cloneMaterials || envMapIntensity !== null) {
        if (Array.isArray(node.material)) {
          node.material = node.material.map((m) => {
            if (!m) return m;
            const out = cloneMaterials ? m.clone() : m;
            if (envMapIntensity !== null && 'envMapIntensity' in out) {
              out.envMapIntensity = envMapIntensity;
            }
            return out;
          });
        } else if (node.material) {
          const out = cloneMaterials ? node.material.clone() : node.material;
          if (envMapIntensity !== null && 'envMapIntensity' in out) {
            out.envMapIntensity = envMapIntensity;
          }
          node.material = out;
        }
      }
    });

    if (options.scale !== undefined) {
      if (typeof options.scale === 'number') {
        group.scale.setScalar(options.scale);
      } else if (options.scale && typeof options.scale === 'object') {
        group.scale.set(
          options.scale.x ?? 1,
          options.scale.y ?? 1,
          options.scale.z ?? 1
        );
      }
    }

    return group;
  }

  function getModelRaw(key) {
    const gltf = models.get(key);
    return gltf ? gltf.scene : null;
  }

  function getModelGltf(key) {
    const gltf = models.get(key);
    if (!gltf) return null;
    return {
      scene: gltf.scene || null,
      animations: Array.isArray(gltf.animations) ? gltf.animations : []
    };
  }

  function getManifest() {
    return manifest;
  }

  function getStats() {
    return {
      ready: stats.ready,
      hdrisLoaded: stats.hdrisLoaded,
      texturesLoaded: stats.texturesLoaded,
      modelsLoaded: stats.modelsLoaded,
      failed: stats.failed.slice(),
      elapsedMs: stats.elapsedMs,
      hdriKeys: Array.from(hdris.keys()),
      textureKeys: Array.from(textures.keys()),
      modelKeys: Array.from(models.keys()),
    };
  }

  function isReady() {
    return ready;
  }

  LRT.AssetLoader = {
    preloadAll,
    getTextureSet,
    getHdri,
    instantiateModel,
    getModelRaw,
    getModelGltf,
    getManifest,
    getStats,
    isReady,
    setAnisotropy,
  };
})(window.LRT = window.LRT || {});
