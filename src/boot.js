import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  MeshBVH,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';
import { N8AOPass, N8AOPostPass } from 'n8ao';

window.__LRT_MANAGED_BOOT__ = true;

window.THREE = THREE;
window.THREE_UTILS = BufferGeometryUtils;
window.THREE_JSM = {
  GLTFLoader,
  DRACOLoader,
  RGBELoader,
  BufferGeometryUtils,
  RoundedBoxGeometry,
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  OutputPass,
  ShaderPass,
  Sky,
};
window.MeshBVH = {
  MeshBVH,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
};

// In n8ao@1.9.3, N8AOPass extends Three.js Pass (for EffectComposer), whereas
// N8AOPostPass extends pmndrs postprocessing Pass. Expose N8AOPass on both
// window.N8AOPass and window.N8AOPostPass so Three.js EffectComposer works cleanly.
window.N8AOPass = N8AOPass;
window.N8AOPostPass = N8AOPass;
window.N8AO = { N8AOPass, N8AOPostPass };

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const SCRIPT_ORDER = [
  { path: 'src/config.js', file: 'config.js', optional: false },
  { path: 'src/audio.js', file: 'audio.js', optional: false },
  { path: 'src/asset_loader.js', file: 'asset_loader.js', optional: false },
  { path: 'src/textures_shaders.js', file: 'textures_shaders.js', optional: false },
  { path: 'src/world_city.js', file: 'world_city.js', optional: false },
  { path: 'src/world_station.js', file: 'world_station.js', optional: false },
  { path: 'src/train.js', file: 'train.js', optional: false },
  { path: 'src/weapons_fx.js', file: 'weapons_fx.js', optional: false },
  { path: 'src/enemies.js', file: 'enemies.js', optional: false },
  { path: 'src/player_ui.js', file: 'player_ui.js', optional: false },
  { path: 'src/main.js', file: 'main.js', optional: false },
];

let cachedSrcListing = null;

async function optionalScriptExists(entry) {
  if (cachedSrcListing === null) {
    try {
      const dirResp = await fetch('src/', { cache: 'no-store' });
      if (dirResp.ok) {
        const ct = dirResp.headers.get('content-type') || '';
        if (ct.includes('text/html')) {
          cachedSrcListing = await dirResp.text();
        }
      }
    } catch (_) {
      cachedSrcListing = '';
    }
    if (cachedSrcListing === null) cachedSrcListing = '';
  }

  if (cachedSrcListing.includes('Directory listing') || cachedSrcListing.includes('<ul>')) {
    return (
      cachedSrcListing.includes(`href="${entry.file}"`) ||
      cachedSrcListing.includes(`>${entry.file}<`)
    );
  }

  try {
    const headResp = await fetch(entry.path, { method: 'HEAD', cache: 'no-store' });
    return headResp.ok;
  } catch (_) {
    return false;
  }
}

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(el);
  });
}

function updateLoadingUI(loaded, total, label) {
  const fill = document.getElementById('loading-bar-fill');
  const status = document.getElementById('loading-status');
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeLoaded = Math.max(0, Math.min(safeTotal, Number(loaded) || 0));
  const pct = Math.round((safeLoaded / safeTotal) * 100);
  if (fill) fill.style.width = `${pct}%`;
  if (status) {
    status.textContent = label ? `${label} (${safeLoaded}/${safeTotal})` : `${pct}%`;
  }
}

function setLoadingFraction(fraction, text) {
  const fill = document.getElementById('loading-bar-fill');
  const status = document.getElementById('loading-status');
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  if (fill) fill.style.width = `${pct}%`;
  if (status && text) status.textContent = text;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

async function bootstrap() {
  try {
    setLoadingFraction(0.03, 'Loading game modules...');
    for (let i = 0; i < SCRIPT_ORDER.length; i++) {
      const entry = SCRIPT_ORDER[i];
      if (entry.optional) {
        const exists = await optionalScriptExists(entry);
        if (!exists) continue;
      }
      setLoadingFraction(0.03 + 0.10 * ((i + 1) / SCRIPT_ORDER.length), `Loading ${entry.file}...`);
      await loadClassicScript(entry.path);
    }

    if (window.LRT && window.LRT.AssetLoader && typeof window.LRT.AssetLoader.preloadAll === 'function') {
      await window.LRT.AssetLoader.preloadAll((loaded, total, label) => {
        const frac = 0.14 + 0.78 * (loaded / Math.max(1, total));
        const fill = document.getElementById('loading-bar-fill');
        const status = document.getElementById('loading-status');
        if (fill) fill.style.width = `${Math.round(frac * 100)}%`;
        if (status) status.textContent = `${label} (${loaded}/${total})`;
      });
    } else {
      updateLoadingUI(1, 1, 'AssetLoader unavailable');
    }

    setLoadingFraction(0.95, 'Initializing renderer & shaders...');
    if (!window.__LRT_DEBUG__ && window.LRT && window.LRT.Main && typeof window.LRT.Main.boot === 'function') {
      await window.LRT.Main.boot();
    }

    setLoadingFraction(1.0, 'Ready');
    hideLoadingOverlay();
  } catch (err) {
    console.error('[boot] Fatal bootstrap error:', err);
    const status = document.getElementById('loading-status');
    if (status) {
      status.textContent = `Boot error: ${err && err.message ? err.message : String(err)}`;
    }
  }
}

bootstrap();
