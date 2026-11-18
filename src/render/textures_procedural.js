(function () {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2i(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function clamp255(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }

  // Tileable 2D value noise with integer period
  function tileableValueNoise(x, y, period, seed) {
    const px = x * period;
    const py = y * period;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % period) + period) % period;
    const y0 = ((iy % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const v00 = hash2i(x0, y0, seed);
    const v10 = hash2i(x1, y0, seed);
    const v01 = hash2i(x0, y1, seed);
    const v11 = hash2i(x1, y1, seed);
    return lerp(lerp(v00, v10, ux), lerp(v01, v11, ux), uy);
  }

  function makeTileableFbmBuffer(size, basePeriod, octaves, seed) {
    const out = new Float32Array(size * size);
    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      const ny = y * inv;
      const row = y * size;
      for (let x = 0; x < size; x++) {
        const nx = x * inv;
        let amp = 0.5;
        let sum = 0;
        let norm = 0;
        let p = basePeriod;
        for (let o = 0; o < octaves; o++) {
          sum += tileableValueNoise(nx, ny, p, seed + o * 101) * amp;
          norm += amp;
          amp *= 0.5;
          p *= 2;
        }
        out[row + x] = sum / norm;
      }
    }
    return out;
  }

  function heightToNormalDataTexture(heightBuf, size, strength, repeat, maxAniso) {
    const rgba = new Uint8Array(size * size * 4);
    const mask = size - 1;
    const isPow2 = (size & mask) === 0;
    const idxAt = isPow2
      ? (x, y) => ((y & mask) * size + (x & mask))
      : (x, y) => (((y % size + size) % size) * size + ((x % size + size) % size));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tl = heightBuf[idxAt(x - 1, y - 1)];
        const t = heightBuf[idxAt(x, y - 1)];
        const tr = heightBuf[idxAt(x + 1, y - 1)];
        const l = heightBuf[idxAt(x - 1, y)];
        const r = heightBuf[idxAt(x + 1, y)];
        const bl = heightBuf[idxAt(x - 1, y + 1)];
        const b = heightBuf[idxAt(x, y + 1)];
        const br = heightBuf[idxAt(x + 1, y + 1)];

        const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
        const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
        let nx = -dX * strength;
        let ny = -dY * strength;
        let nz = 1.0;
        const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= invLen;
        ny *= invLen;
        nz *= invLen;

        const o = (y * size + x) * 4;
        rgba[o] = clamp255((nx * 0.5 + 0.5) * 255);
        rgba[o + 1] = clamp255((ny * 0.5 + 0.5) * 255);
        rgba[o + 2] = clamp255((nz * 0.5 + 0.5) * 255);
        rgba[o + 3] = 255;
      }
    }

    const tex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = maxAniso;
    tex.needsUpdate = true;
    return tex;
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function finalizeCanvasTexture(canvas, isSRGB, repeat, maxAniso) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = maxAniso;
    tex.needsUpdate = true;
    return tex;
  }

  function makeScalarGrayTexture(buf, size, repeat, maxAniso) {
    const rgba = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const v = clamp255(buf[i] * 255);
      const o = i * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = maxAniso;
    tex.needsUpdate = true;
    return tex;
  }

  function buildConcreteSet(maxAniso) {
    const size = 512;
    const fbmLow = makeTileableFbmBuffer(size, 4, 4, 11);
    const fbmFine = makeTileableFbmBuffer(size, 16, 3, 43);
    const fbmDrip = makeTileableFbmBuffer(size, 8, 3, 79);

    const hBuf = new Float32Array(size * size);
    const rBuf = new Float32Array(size * size);
    const cCanvas = makeCanvas(size, size);
    const ctx = cCanvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;

    for (let y = 0; y < size; y++) {
      const panelY = y % 128;
      const seamY = panelY < 2 ? 1.0 : 0.0;
      const dripDecay = Math.exp(-panelY * 0.022);
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const panelX = x % 256;
        const seamX = panelX < 2 ? 1.0 : 0.0;
        const seam = Math.max(seamX, seamY);

        // Formwork tie-rod holes
        const tx = ((x + 64) % 128) - 64;
        const ty = ((y + 64) % 128) - 64;
        const tieDist = Math.sqrt(tx * tx + ty * ty);
        const tieHole = tieDist < 5.5 ? smoothstep(5.5, 2.0, tieDist) : 0.0;

        // Vertical rain stain streaks below horizontal seams & tie holes
        const streakMask = clamp01((fbmDrip[Math.floor(y * 0.25) * size + x] - 0.43) * 2.5);
        const streak = clamp01(streakMask * (0.45 + 0.55 * dripDecay) + (Math.abs(tx) < 5 && ty > 0 ? smoothstep(40, 0, ty) * 0.55 : 0));

        // Hairline concrete cracks
        const crackVal = Math.abs(fbmLow[i] - 0.5) * 2.0;
        const crack = crackVal < 0.014 ? smoothstep(0.014, 0.002, crackVal) * 0.8 : 0.0;

        const baseTone = 148 + (fbmLow[i] - 0.5) * 28 + (fbmFine[i] - 0.5) * 24;
        const stainDark = 1.0 - streak * 0.30 - seam * 0.28 - tieHole * 0.42 - crack * 0.35;
        const warmShift = streak * 5;
        const r = clamp255(baseTone * stainDark - warmShift * 0.3);
        const g = clamp255((baseTone - 2) * stainDark - warmShift * 0.1);
        const b = clamp255((baseTone - 9) * stainDark - warmShift * 0.5);

        const o = i * 4;
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 255;

        hBuf[i] = clamp01(0.65 + (fbmFine[i] - 0.5) * 0.25 - seam * 0.28 - tieHole * 0.45 - crack * 0.32);
        rBuf[i] = clamp01(0.74 + fbmFine[i] * 0.20 + seam * 0.08 - streak * 0.07);
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finalizeCanvasTexture(cCanvas, true, true, maxAniso),
      normalMap: heightToNormalDataTexture(hBuf, size, 2.2, true, maxAniso),
      roughnessMap: makeScalarGrayTexture(rBuf, size, true, maxAniso)
    };
  }

  function buildTerrazzoSet(maxAniso, isChecker) {
    const size = 512;
    const tilePx = 128; // 4x4 grid = 2.4m x 2.4m (60cm tiles)
    const fbm = makeTileableFbmBuffer(size, 6, 3, isChecker ? 211 : 107);
    const fine = makeTileableFbmBuffer(size, 32, 2, isChecker ? 313 : 151);

    const hBuf = new Float32Array(size * size);
    const rBuf = new Float32Array(size * size);
    const cCanvas = makeCanvas(size, size);
    const ctx = cCanvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;

    for (let y = 0; y < size; y++) {
      const ty = Math.floor(y / tilePx);
      const ly = y % tilePx;
      for (let x = 0; x < size; x++) {
        const tx = Math.floor(x / tilePx);
        const lx = x % tilePx;
        const i = y * size + x;

        const edgeDist = Math.min(lx, tilePx - 1 - lx, ly, tilePx - 1 - ly);
        const grout = edgeDist < 2 ? 1.0 : edgeDist < 4 ? 0.35 : 0.0;

        const tileHash = hash2i(tx, ty, 505);
        const checkerDark = isChecker && ((tx + ty) & 1) === 1;
        let base = checkerDark ? 174 : 210;
        base += (tileHash - 0.5) * 14;

        // Mineral terrazzo flecks
        const fleckSeed = hash2i(Math.floor(x / 2), Math.floor(y / 2), 909);
        const fleck = fleckSeed > 0.90 ? -24 : fleckSeed < 0.08 ? 16 : 0;

        // Boot scuff & dusty grime
        const scuff = smoothstep(0.64, 0.85, fbm[i]) * 26;
        const tone = lerp(base + fleck + (fine[i] - 0.5) * 10 - scuff, 108, grout);

        const o = i * 4;
        d[o] = clamp255(tone);
        d[o + 1] = clamp255(tone - 1);
        d[o + 2] = clamp255(tone - 5);
        d[o + 3] = 255;

        hBuf[i] = clamp01(0.75 + (fine[i] - 0.5) * 0.08 - grout * 0.45);
        rBuf[i] = clamp01(lerp(0.60 + (fine[i] - 0.5) * 0.12 + scuff * 0.006, 0.92, grout));
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finalizeCanvasTexture(cCanvas, true, true, maxAniso),
      normalMap: heightToNormalDataTexture(hBuf, size, 2.0, true, maxAniso),
      roughnessMap: makeScalarGrayTexture(rBuf, size, true, maxAniso)
    };
  }

  function buildTactileYellowSet(maxAniso) {
    const size = 256;
    const cell = 64; // 4x4 raised domes per tile
    const fine = makeTileableFbmBuffer(size, 12, 3, 401);
    const hBuf = new Float32Array(size * size);
    const rBuf = new Float32Array(size * size);
    const cCanvas = makeCanvas(size, size);
    const ctx = cCanvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;

    for (let y = 0; y < size; y++) {
      const cy = (y % cell) - cell * 0.5;
      for (let x = 0; x < size; x++) {
        const cx = (x % cell) - cell * 0.5;
        const i = y * size + x;
        const dist = Math.sqrt(cx * cx + cy * cy);
        // Truncated tactile dome: flat top radius ~11, bevel 11..18
        const dome = dist < 11 ? 1.0 : dist < 18 ? smoothstep(18, 11, dist) : 0.0;
        const baseCrevice = dist >= 16 && dist < 24 ? smoothstep(24, 18, dist) : 0.0;
        const grime = clamp01((fine[i] - 0.4) * 0.6 + baseCrevice * 0.55);

        const r = clamp255(lerp(224, 128, grime * 0.65) + dome * 14);
        const g = clamp255(lerp(180, 102, grime * 0.68) + dome * 10);
        const b = clamp255(lerp(34, 24, grime * 0.72));

        const o = i * 4;
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 255;

        hBuf[i] = clamp01(0.32 + dome * 0.62 + (fine[i] - 0.5) * 0.04);
        rBuf[i] = clamp01(lerp(0.78, 0.56, dome) + grime * 0.14);
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finalizeCanvasTexture(cCanvas, true, true, maxAniso),
      normalMap: heightToNormalDataTexture(hBuf, size, 3.2, true, maxAniso),
      roughnessMap: makeScalarGrayTexture(rBuf, size, true, maxAniso)
    };
  }

  function buildCorrugatedRoofSet(maxAniso, baseRGB, seed) {
    const size = 512;
    const fbm = makeTileableFbmBuffer(size, 6, 4, seed);
    const fine = makeTileableFbmBuffer(size, 24, 2, seed + 37);
    const hBuf = new Float32Array(size * size);
    const rBuf = new Float32Array(size * size);
    const cCanvas = makeCanvas(size, size);
    const ctx = cCanvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;

    for (let y = 0; y < size; y++) {
      const seamY = (y % 256) < 3 ? 1.0 : 0.0;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        // Ribbed architectural soffit / corrugated profile (16 ribs across 512px)
        const phase = (x / size) * 16.0 * Math.PI * 2.0;
        const rib = 0.5 + 0.5 * Math.sin(phase);
        const sharpRib = Math.pow(rib, 0.65);

        const rustMask = clamp01((fbm[i] - 0.54) * 3.0 + seamY * 0.55);
        const rustR = 107;
        const rustG = 53;
        const rustB = 30;

        const shade = (0.82 + 0.24 * sharpRib) * (1.0 - seamY * 0.35) + (fine[i] - 0.5) * 0.08;
        const r = clamp255(lerp(baseRGB[0] * shade, rustR, rustMask * 0.78));
        const g = clamp255(lerp(baseRGB[1] * shade, rustG, rustMask * 0.78));
        const b = clamp255(lerp(baseRGB[2] * shade, rustB, rustMask * 0.78));

        const o = i * 4;
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 255;

        hBuf[i] = clamp01(0.25 + sharpRib * 0.65 - seamY * 0.25 + (fine[i] - 0.5) * 0.06);
        rBuf[i] = clamp01(lerp(0.56 + (1.0 - sharpRib) * 0.10, 0.90, rustMask));
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finalizeCanvasTexture(cCanvas, true, true, maxAniso),
      normalMap: heightToNormalDataTexture(hBuf, size, 2.8, true, maxAniso),
      roughnessMap: makeScalarGrayTexture(rBuf, size, true, maxAniso)
    };
  }

  function buildTrainLiveryAtlas(maxAniso) {
    const w = 2048;
    const h = 1024;
    const cA = makeCanvas(w, h);
    const ctx = cA.getContext('2d');
    const cR = makeCanvas(w, h);
    const rtx = cR.getContext('2d');
    const cE = makeCanvas(w, h);
    const etx = cE.getContext('2d');
    ctx.scale(2, 2);
    rtx.scale(2, 2);
    etx.scale(2, 2);

    // Albedo base
    ctx.fillStyle = '#ECEDEF';
    ctx.fillRect(0, 0, w, h);
    rtx.fillStyle = '#6c6c6c';
    rtx.fillRect(0, 0, w, h);
    etx.fillStyle = '#000000';
    etx.fillRect(0, 0, w, h);

    // Top-left (0..512, 0..256): INKA iE203 Side Body Livery
    ctx.fillStyle = '#D8DBDF';
    ctx.fillRect(0, 0, 512, 256);
    // Upper white/silver panel + roof edge soot
    ctx.fillStyle = '#ECEDEF';
    ctx.fillRect(0, 22, 512, 56);
    // Dark window band
    ctx.fillStyle = '#181B20';
    ctx.fillRect(0, 74, 512, 74);
    rtx.fillStyle = '#242424';
    rtx.fillRect(0, 74, 512, 74);
    // Signal red belt stripe + diagonal dynamic swoosh
    ctx.fillStyle = '#C81E24';
    ctx.fillRect(0, 148, 512, 34);
    ctx.beginPath();
    ctx.moveTo(350, 74);
    ctx.lineTo(415, 74);
    ctx.lineTo(360, 182);
    ctx.lineTo(295, 182);
    ctx.closePath();
    ctx.fill();
    // Lower skirt dark grey
    ctx.fillStyle = '#5B6066';
    ctx.fillRect(0, 214, 512, 42);
    // Panel seam lines & grime drips
    ctx.strokeStyle = 'rgba(40,44,48,0.28)';
    ctx.lineWidth = 2;
    for (let sx = 64; sx < 512; sx += 128) {
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, 256);
      ctx.stroke();
    }
    // KAI LRT emblem on white flank
    ctx.fillStyle = '#16325C';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('KAI', 24, 198);
    ctx.fillStyle = '#C81E24';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('LRT JABODEBEK', 66, 198);

    // Bottom-left (0..512, 256..512): Door Leaves & Roof HVAC
    // Doors (0..256, 256..512)
    ctx.fillStyle = '#E4E6E9';
    ctx.fillRect(0, 256, 256, 256);
    ctx.fillStyle = '#1A1E24';
    ctx.fillRect(28, 286, 200, 110);
    ctx.fillStyle = '#C81E24';
    ctx.fillRect(0, 412, 256, 28);
    ctx.fillStyle = '#E0B422';
    ctx.fillRect(0, 494, 256, 18); // yellow threshold strip
    ctx.fillStyle = '#D62328';
    ctx.fillRect(10, 446, 76, 36);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('DILARANG', 16, 462);
    ctx.fillText('BERSANDAR', 16, 474);

    // Roof HVAC Pod texture (256..512, 256..512)
    ctx.fillStyle = '#9EA4AA';
    ctx.fillRect(256, 256, 256, 256);
    ctx.fillStyle = '#53585E';
    for (let ly = 276; ly < 490; ly += 16) {
      ctx.fillRect(276, ly, 216, 6);
    }

    // Right half (512..1024, 0..512): Nose Mask, LED Dest Display, Lights
    ctx.fillStyle = '#16181C';
    ctx.fillRect(512, 0, 512, 280);
    rtx.fillStyle = '#383838';
    rtx.fillRect(512, 0, 512, 280);
    ctx.fillStyle = '#C81E24';
    ctx.fillRect(512, 280, 512, 232);

    // LED Destination Sign (540..996, 36..118)
    ctx.fillStyle = '#0D0E10';
    ctx.fillRect(540, 36, 456, 82);
    ctx.fillStyle = '#FFB424';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DUKUH ATAS', 768, 92);
    etx.fillStyle = '#FF9F1A';
    etx.font = 'bold 42px monospace';
    etx.textAlign = 'center';
    etx.fillText('DUKUH ATAS', 768, 92);
    ctx.textAlign = 'left';
    etx.textAlign = 'left';

    // Headlight & Brow LED clusters (540..760, 140..250)
    ctx.fillStyle = '#F6FAFF';
    ctx.fillRect(548, 152, 180, 44);
    etx.fillStyle = '#FFFFFF';
    etx.fillRect(548, 152, 180, 44);

    // Taillight red cluster (780..996, 152..196)
    ctx.fillStyle = '#FF222A';
    ctx.fillRect(780, 152, 180, 44);
    etx.fillStyle = '#FF1A22';
    etx.fillRect(780, 152, 180, 44);

    // Subtle rain drip streaks across livery
    const rng = mulberry32(888);
    ctx.fillStyle = 'rgba(42,38,34,0.12)';
    for (let s = 0; s < 90; s++) {
      const sx = rng() * 1024;
      const sy = rng() * 440;
      const sw = 2 + rng() * 5;
      const sh = 24 + rng() * 70;
      ctx.fillRect(sx, sy, sw, sh);
    }

    return {
      map: finalizeCanvasTexture(cA, true, false, maxAniso),
      roughnessMap: finalizeCanvasTexture(cR, false, false, maxAniso),
      emissiveMap: finalizeCanvasTexture(cE, true, false, maxAniso)
    };
  }

  function buildTrainInteriorAtlas(maxAniso) {
    const w = 2048;
    const h = 1024;
    const cA = makeCanvas(w, h);
    const ctx = cA.getContext('2d');
    const cR = makeCanvas(w, h);
    const rtx = cR.getContext('2d');
    const cE = makeCanvas(w, h);
    const etx = cE.getContext('2d');
    ctx.scale(2, 2);
    rtx.scale(2, 2);
    etx.scale(2, 2);

    // Cream molded FRP cabin walls (0..512, 0..256)
    ctx.fillStyle = '#ECE8DD';
    ctx.fillRect(0, 0, 512, 256);
    rtx.fillStyle = '#999999';
    rtx.fillRect(0, 0, 512, 256);
    etx.fillStyle = '#000000';
    etx.fillRect(0, 0, w, h);

    // Cyan woven seat fabric (512..1024, 0..256)
    ctx.fillStyle = '#3F9EC2';
    ctx.fillRect(512, 0, 512, 256);
    ctx.fillStyle = '#3184A4';
    for (let y = 0; y < 256; y += 16) {
      for (let x = 512; x < 1024; x += 16) {
        ctx.fillRect(x + ((y >> 4) & 1) * 8, y, 5, 5);
      }
    }
    rtx.fillStyle = '#dcdcdc';
    rtx.fillRect(512, 0, 512, 256);

    // Olive-sage speckled aisle floor (0..512, 256..512)
    ctx.fillStyle = '#9AAE8F';
    ctx.fillRect(0, 256, 320, 256);
    ctx.fillStyle = '#6B6F73';
    ctx.fillRect(320, 256, 192, 256);
    const rng = mulberry32(321);
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(40,46,38,0.28)' : 'rgba(230,235,220,0.28)';
      ctx.fillRect(rng() * 512, 256 + rng() * 256, 2 + rng() * 3, 2 + rng() * 3);
    }
    rtx.fillStyle = '#bcbcbc';
    rtx.fillRect(0, 256, 512, 256);

    // Angled PIS LCD route screen & door header decals (512..1024, 256..512)
    ctx.fillStyle = '#142644';
    ctx.fillRect(512, 256, 512, 130);
    ctx.fillStyle = '#F2F6FC';
    ctx.fillRect(526, 270, 484, 102);
    ctx.fillStyle = '#16325C';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Next Station: Kuningan -> Cawang', 540, 304);
    // Blue CB + Green BK route bar
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(540, 326, 220, 12);
    ctx.fillStyle = '#15803D';
    ctx.fillRect(760, 326, 220, 12);
    ctx.fillStyle = '#E5D429';
    for (let n = 0; n < 7; n++) {
      ctx.beginPath();
      ctx.arc(556 + n * 68, 332, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    etx.fillStyle = '#B8D4F5';
    etx.fillRect(526, 270, 484, 102);

    // Yellow Indonesian door warning sticker (512..1024, 386..512)
    ctx.fillStyle = '#E5D429';
    ctx.fillRect(512, 386, 512, 126);
    ctx.fillStyle = '#181A1C';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('HATI-HATI TANGAN TERJEPIT!', 532, 434);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('AWAS CELAH PERON SAAT TURUN', 532, 474);

    return {
      map: finalizeCanvasTexture(cA, true, false, maxAniso),
      roughnessMap: finalizeCanvasTexture(cR, false, false, maxAniso),
      emissiveMap: finalizeCanvasTexture(cE, true, false, maxAniso)
    };
  }

  function buildStallAtlas(maxAniso) {
    const w = 2048;
    const h = 1024;
    const cA = makeCanvas(w, h);
    const ctx = cA.getContext('2d');
    const cR = makeCanvas(w, h);
    const rtx = cR.getContext('2d');
    const cE = makeCanvas(w, h);
    const etx = cE.getContext('2d');
    const hBuf = new Float32Array(w * h);
    hBuf.fill(0.5);

    ctx.scale(2, 2);
    rtx.scale(2, 2);
    etx.scale(2, 2);

    ctx.fillStyle = '#242424';
    ctx.fillRect(0, 0, 1024, 512);
    rtx.fillStyle = '#9e9e9e';
    rtx.fillRect(0, 0, 1024, 512);
    etx.fillStyle = '#000000';
    etx.fillRect(0, 0, 1024, 512);

    // 1) QUAD A (0..512, 0..256): Roti'O Fluted Gold-Brass Slats + Backlit Roti'O Sign
    for (let x = 0; x < 512; x++) {
      const rib = 0.5 + 0.5 * Math.sin((x / 512) * 56 * Math.PI * 2);
      const r = clamp255(lerp(92, 206, rib));
      const g = clamp255(lerp(64, 162, rib));
      const b = clamp255(lerp(20, 62, rib));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, 256);
      const rough = clamp255(lerp(130, 74, rib));
      rtx.fillStyle = `rgb(${rough},${rough},${rough})`;
      rtx.fillRect(x, 0, 1, 256);
      const hv = 0.3 + rib * 0.65;
      for (let y = 0; y < 512; y++) {
        hBuf[y * w + x * 2] = hv;
        hBuf[y * w + x * 2 + 1] = hv;
      }
    }
    // Warm amber cove glow strip along top/bottom of Roti'O slats
    ctx.fillStyle = '#FFCE68';
    ctx.fillRect(0, 240, 512, 16);
    etx.fillStyle = '#FFAA33';
    etx.fillRect(0, 240, 512, 16);
    // Giant backlit white serif-italic Roti'O® channel lettering in upper half (0..512, 0..150)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFDF5';
    ctx.font = 'italic bold 92px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText("Roti'O", 256, 108);
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('®', 392, 56);
    ctx.restore();
    etx.fillStyle = '#FFF4D8';
    etx.font = 'italic bold 92px Georgia, serif';
    etx.textAlign = 'center';
    etx.fillText("Roti'O", 256, 108);

    // 2) QUAD B (512..768, 0..256): Roti'O Cream Wall w/ Yellow Chef Medallion & Subway Tile
    // Left half (512..640): pale cream + yellow medallion
    ctx.fillStyle = '#E5D79D';
    ctx.fillRect(512, 0, 128, 256);
    // Yellow chef medallion
    ctx.fillStyle = '#FCE028';
    ctx.beginPath();
    ctx.arc(576, 118, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#C49B3E';
    ctx.stroke();
    // Chef hat & face + coffee bun illustration
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(576, 92, 18, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(562, 92, 28, 12);
    ctx.strokeStyle = '#1B1712';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(562, 92, 28, 12);
    ctx.fillStyle = '#F7D2B2';
    ctx.beginPath();
    ctx.arc(576, 114, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Golden coffee bun
    ctx.fillStyle = '#C87A35';
    ctx.beginPath();
    ctx.ellipse(576, 134, 17, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1B1712';
    ctx.font = 'italic bold 22px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText("Roti'O", 576, 158);
    etx.fillStyle = '#6A5410';
    etx.beginPath();
    etx.arc(576, 118, 52, 0, Math.PI * 2);
    etx.fill();

    // Right half (640..768): White glazed subway tiles
    ctx.fillStyle = '#EAECEB';
    ctx.fillRect(640, 0, 128, 256);
    rtx.fillStyle = '#4a4a4a';
    rtx.fillRect(640, 0, 128, 256);
    ctx.strokeStyle = '#C6CAC8';
    ctx.lineWidth = 2;
    for (let ty = 0; ty < 256; ty += 24) {
      ctx.beginPath();
      ctx.moveTo(640, ty);
      ctx.lineTo(768, ty);
      ctx.stroke();
      const offset = ((ty / 24) & 1) * 24;
      for (let tx = 640 + offset; tx < 768; tx += 48) {
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx, ty + 24);
        ctx.stroke();
      }
    }

    // 3) QUAD C (768..1024, 0..256): Roti'O Menu Lightbox & Golden Coffee Buns
    ctx.fillStyle = '#1D1916';
    ctx.fillRect(768, 0, 256, 256);
    // Warm menu board with balanced low-intensity glow so text stays super crisp
    ctx.fillStyle = '#2B1F16';
    ctx.fillRect(780, 12, 232, 32);
    ctx.fillStyle = '#F2E3BF';
    ctx.fillRect(780, 44, 232, 72);
    etx.fillStyle = '#4A3114';
    etx.fillRect(780, 12, 232, 32);
    etx.fillStyle = '#3D311E';
    etx.fillRect(780, 44, 232, 72);

    ctx.fillStyle = '#FFD65A';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText("ROTI'O COFFEE BUN", 790, 34);
    etx.fillStyle = '#9E7822';
    etx.font = 'bold 16px sans-serif';
    etx.textAlign = 'left';
    etx.fillText("ROTI'O COFFEE BUN", 790, 34);

    ctx.fillStyle = '#14100C';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Coffee Bun ......... Rp 14K', 788, 66);
    ctx.fillText('Butter Croissant ... Rp 18K', 788, 86);
    ctx.fillText("Kopi'O Brown Sugar . Rp 22K", 788, 106);
    etx.fillStyle = '#000000';
    etx.font = 'bold 13px sans-serif';
    etx.fillText('Coffee Bun ......... Rp 14K', 788, 66);
    etx.fillText('Butter Croissant ... Rp 18K', 788, 86);
    etx.fillText("Kopi'O Brown Sugar . Rp 22K", 788, 106);

    ctx.fillStyle = '#B91C1C';
    ctx.fillRect(786, 120, 220, 28);
    etx.fillStyle = '#460B0B';
    etx.fillRect(786, 120, 220, 28);
    ctx.fillStyle = '#FCE028';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('BELI 2 GRATIS 1', 822, 140);
    etx.fillStyle = '#806A12';
    etx.font = 'bold 15px sans-serif';
    etx.fillText('BELI 2 GRATIS 1', 822, 140);
    // Warm pastry tray lower graphic (768..1024, 164..256)
    ctx.fillStyle = '#382B22';
    ctx.fillRect(768, 164, 256, 92);
    for (let b = 0; b < 5; b++) {
      const bx = 796 + b * 48;
      ctx.fillStyle = '#C87A35';
      ctx.beginPath();
      ctx.ellipse(bx, 208, 19, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#E89E4A';
      ctx.beginPath();
      ctx.ellipse(bx - 3, 204, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4) QUAD D (0..384, 256..512): Indomaret Point / Alfaexpress Header & Drink Cooler
    // Upper header (0..384, 256..336)
    ctx.fillStyle = '#1E509E';
    ctx.fillRect(0, 256, 384, 34);
    ctx.fillStyle = '#D62328';
    ctx.fillRect(0, 290, 384, 26);
    ctx.fillStyle = '#F5C71A';
    ctx.fillRect(0, 316, 384, 18);
    etx.fillStyle = '#102A54';
    etx.fillRect(0, 256, 384, 34);
    etx.fillStyle = '#4B0C0E';
    etx.fillRect(0, 290, 384, 26);
    etx.fillStyle = '#4F3E06';
    etx.fillRect(0, 316, 384, 18);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('INDOMARET POINT', 16, 284);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('POINT COFFEE  •  SNACKS', 16, 310);

    // Illuminated drink cooler shelves (0..384, 336..512) - balanced glow + sharp dark rails/bottles
    ctx.fillStyle = '#AFC4D2';
    ctx.fillRect(0, 336, 384, 176);
    ctx.strokeStyle = '#1E242B';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 339, 378, 170);
    etx.fillStyle = '#162632';
    etx.fillRect(0, 336, 384, 176);
    const bottleCols = ['#D62328', '#15803D', '#1D4ED8', '#E0B422', '#FF6B1A', '#5E2B8F'];
    for (let sy = 348; sy < 500; sy += 42) {
      ctx.fillStyle = '#252B33';
      ctx.fillRect(8, sy + 28, 368, 7);
      etx.fillStyle = '#000000';
      etx.fillRect(8, sy + 28, 368, 7);
      for (let bx = 18; bx < 362; bx += 22) {
        const bCol = bottleCols[(bx + sy) % bottleCols.length];
        ctx.fillStyle = '#1A1E24';
        ctx.fillRect(bx + 3, sy, 8, 5); // bottle cap
        ctx.fillStyle = bCol;
        ctx.fillRect(bx, sy + 4, 15, 24);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(bx + 2, sy + 10, 11, 7);
        etx.fillStyle = '#05080B';
        etx.fillRect(bx, sy + 2, 15, 26);
      }
    }

    // 5) QUAD E (384..640, 256..512): JakLingko Blue Kiosk + Loket Wood Slats
    // Left (384..512): JakLingko Vending
    ctx.fillStyle = '#1A4BA0';
    ctx.fillRect(384, 256, 128, 256);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('JAKLINGKO', 404, 280);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('TOP UP KUE', 410, 296);
    // Glowing touchscreen
    ctx.fillStyle = '#26A4E8';
    ctx.fillRect(404, 312, 88, 72);
    etx.fillStyle = '#1A85C8';
    etx.fillRect(404, 312, 88, 72);
    // Tap pad & dispenser pocket
    ctx.fillStyle = '#0F1824';
    ctx.fillRect(412, 404, 72, 32);
    ctx.fillRect(408, 456, 80, 38);

    // Right (512..640): Loket Horizontal Teak Wood Slats
    ctx.fillStyle = '#8D5832';
    ctx.fillRect(512, 256, 128, 256);
    for (let sy = 256; sy < 512; sy += 14) {
      ctx.fillStyle = '#6A3D1E';
      ctx.fillRect(512, sy, 128, 3);
      for (let x = 1024; x < 1280; x++) {
        hBuf[(sy * 2) * w + x] = 0.25;
        hBuf[(sy * 2 + 1) * w + x] = 0.25;
      }
    }

    // 6) QUAD F (640..1024, 256..512): Coway + Access by KAI Turnstile + Shutter 260
    // Coway (640..768)
    ctx.fillStyle = '#E6EEF2';
    ctx.fillRect(640, 256, 128, 256);
    ctx.fillStyle = '#D41E2A';
    ctx.fillRect(640, 256, 128, 66);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('coway', 676, 294);
    ctx.fillStyle = '#1E3A8A';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('AIR STERIL', 672, 344);
    ctx.fillStyle = '#BAC4CB';
    ctx.fillRect(656, 366, 96, 84);

    // Access by KAI Purple Turnstile (768..896)
    const grad = ctx.createLinearGradient(768, 256, 896, 512);
    grad.addColorStop(0, '#6F2E91');
    grad.addColorStop(1, '#A3287B');
    ctx.fillStyle = grad;
    ctx.fillRect(768, 256, 128, 256);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Access', 804, 300);
    ctx.font = '11px sans-serif';
    ctx.fillText('by KAI', 810, 316);
    ctx.fillStyle = '#14181E';
    ctx.fillRect(796, 340, 72, 42);
    ctx.fillStyle = '#25E67A';
    ctx.beginPath();
    ctx.arc(832, 278, 8, 0, Math.PI * 2);
    ctx.fill();
    etx.fillStyle = '#25E67A';
    etx.beginPath();
    etx.arc(832, 278, 8, 0, Math.PI * 2);
    etx.fill();

    // Shuttered Kiosk 260 (896..1024)
    ctx.fillStyle = '#6A5B50';
    ctx.fillRect(896, 256, 128, 256);
    for (let sy = 264; sy < 512; sy += 12) {
      ctx.fillStyle = sy % 24 === 0 ? '#4D4138' : '#7D6C5F';
      ctx.fillRect(896, sy, 128, 6);
    }
    ctx.fillStyle = '#B82824';
    ctx.font = 'bold 26px serif';
    ctx.fillText('260', 936, 300);

    // Subtle grime pass over all stalls
    ctx.fillStyle = 'rgba(28, 26, 22, 0.14)';
    ctx.fillRect(0, 480, 1024, 32);

    return {
      map: finalizeCanvasTexture(cA, true, false, maxAniso),
      normalMap: heightToNormalDataTexture(hBuf, w, 1.8, false, maxAniso),
      roughnessMap: finalizeCanvasTexture(cR, false, false, maxAniso),
      emissiveMap: finalizeCanvasTexture(cE, true, false, maxAniso)
    };
  }

  function buildSignageAtlas(maxAniso) {
    const w = 2048;
    const h = 2048;
    const cA = makeCanvas(w, h);
    const ctx = cA.getContext('2d');
    const cE = makeCanvas(w, h);
    const etx = cE.getContext('2d');
    ctx.scale(2, 2);
    etx.scale(2, 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    etx.textAlign = 'left';
    etx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#16325C';
    ctx.fillRect(0, 0, 1024, 1024);
    etx.fillStyle = '#000000';
    etx.fillRect(0, 0, 1024, 1024);

    // TILE 1 (0..512, 0..160): PSD Navy Header (Kereta 3 Pintu 2 + CB/BK Directions)
    ctx.fillStyle = '#16325C';
    ctx.fillRect(0, 0, 512, 160);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Kereta 3  Pintu 2', 20, 42);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#C8D6EA';
    ctx.fillText('Car 3  Door 2', 20, 62);
    // 6-car schematic bar
    for (let c = 0; c < 6; c++) {
      ctx.fillStyle = c === 2 ? '#E5D429' : '#6C84A6';
      ctx.fillRect(20 + c * 28, 78, 24, 16);
    }
    // Direction arrows + CB & BK badges
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Ke Harjamukti', 220, 52);
    ctx.fillText('Ke Jati Mulya', 220, 98);
    ctx.fillStyle = '#1D4ED8';
    ctx.beginPath();
    ctx.arc(395, 45, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#15803D';
    ctx.beginPath();
    ctx.arc(395, 91, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('CB', 385, 50);
    ctx.fillText('BK', 385, 96);
    ctx.fillStyle = '#E5D429';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('1 →', 436, 78);
    ctx.fillStyle = '#C8D6EA';
    ctx.font = '12px sans-serif';
    ctx.fillText('Dahulukan penumpang yang turun', 20, 134);
    etx.fillStyle = '#243C66';
    etx.fillRect(0, 0, 512, 160);

    // TILE 2 (512..1024, 0..160): Yellow Overhead Exit Wayfinding + Green Evakuasi
    ctx.fillStyle = '#E5D429';
    ctx.fillRect(512, 0, 384, 160);
    ctx.fillStyle = '#181A1C';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('← Keluar / Exit A', 534, 52);
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText('Stasiun KRL • Transjakarta', 534, 88);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Peron 1 / Peron 2 →', 534, 132);
    etx.fillStyle = '#9E9018';
    etx.fillRect(512, 0, 384, 160);

    // Green Jalur Evakuasi (896..1024, 0..160)
    ctx.fillStyle = '#0E7C41';
    ctx.fillRect(896, 0, 128, 160);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('JALUR', 926, 56);
    ctx.fillText('EVAKUASI', 912, 82);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('EXIT →', 918, 126);
    etx.fillStyle = '#0C8C48';
    etx.fillRect(896, 0, 128, 160);

    // TILE 3 (0..512, 160..360): Smart Travel Live Better PSD Poster
    ctx.fillStyle = '#DCE2E8';
    ctx.fillRect(0, 160, 512, 200);
    // Viaduct stripe graphic
    ctx.fillStyle = '#C81E24';
    ctx.fillRect(0, 308, 512, 22);
    ctx.fillStyle = '#7A828B';
    ctx.fillRect(0, 330, 512, 30);
    // Stylized train silhouette
    ctx.fillStyle = '#ECEDEF';
    ctx.fillRect(48, 266, 250, 38);
    ctx.fillStyle = '#181B20';
    ctx.fillRect(62, 274, 210, 16);
    ctx.fillStyle = '#C81E24';
    ctx.fillRect(48, 294, 250, 10);
    // Typography
    ctx.fillStyle = '#16325C';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Smart Travel', 46, 212);
    ctx.fillStyle = '#C81E24';
    ctx.font = 'italic bold 28px sans-serif';
    ctx.fillText('Live Better', 58, 246);
    ctx.fillStyle = '#16325C';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('KAI  LRT JABODEBEK', 320, 204);
    // Weathered grime / tear corner
    ctx.fillStyle = 'rgba(46,42,36,0.28)';
    ctx.beginPath();
    ctx.moveTo(460, 160);
    ctx.lineTo(512, 160);
    ctx.lineTo(512, 218);
    ctx.closePath();
    ctx.fill();

    // TILE 4 (512..1024, 160..360): Red/Yellow Safety Signs + IHB 5 HYDRANT
    // Awas Celah Peron & Prohibitions (512..832, 160..360)
    ctx.fillStyle = '#F0F1F2';
    ctx.fillRect(512, 160, 320, 200);
    ctx.fillStyle = '#E5D429';
    ctx.fillRect(522, 170, 300, 44);
    ctx.fillStyle = '#181A1C';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('AWAS CELAH PERON!', 552, 199);

    ctx.fillStyle = '#C81E24';
    ctx.fillRect(522, 224, 300, 58);
    ctx.fillRect(522, 290, 300, 58);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('DILARANG BERSANDAR DI PINTU', 536, 250);
    ctx.fillText('DILARANG MEROKOK DI STASIUN', 536, 316);
    ctx.font = '12px sans-serif';
    ctx.fillText('NO LEANING ON PLATFORM DOORS', 536, 270);
    ctx.fillText('NO SMOKING / NO EATING', 536, 336);

    // IHB 5 HYDRANT Red Cabinet (832..1024, 160..360)
    ctx.fillStyle = '#C81E24';
    ctx.fillRect(832, 160, 192, 200);
    ctx.strokeStyle = '#7A1014';
    ctx.lineWidth = 4;
    ctx.strokeRect(842, 170, 172, 180);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('IHB 5', 890, 212);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('HYDRANT', 874, 246);
    ctx.fillStyle = '#202226';
    ctx.fillRect(872, 272, 112, 46); // recessed glass window

    // TILE 5 (0..512, 360..512): Standing System Map Totem + Batik Border
    ctx.fillStyle = '#F2F3F5';
    ctx.fillRect(0, 360, 512, 152);
    ctx.fillStyle = '#16325C';
    ctx.fillRect(0, 360, 512, 34);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('PETA RUTE LRT JABODEBEK  •  PERON 1', 16, 383);
    // CB & BK Y-lines
    ctx.strokeStyle = '#1D4ED8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(28, 434);
    ctx.lineTo(290, 434);
    ctx.lineTo(480, 412);
    ctx.stroke();
    ctx.strokeStyle = '#15803D';
    ctx.beginPath();
    ctx.moveTo(290, 434);
    ctx.lineTo(480, 462);
    ctx.stroke();
    const stops = ['Dukuh Atas', 'Setiabudi', 'Kuningan', 'Cikoko', 'Cawang'];
    ctx.fillStyle = '#181A1C';
    ctx.font = '11px sans-serif';
    for (let s = 0; s < stops.length; s++) {
      const sx = 36 + s * 64;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(sx, 434, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#16325C';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#181A1C';
      ctx.fillText(stops[s], sx - 18, 456);
    }
    // Batik geometric footer border
    ctx.fillStyle = '#9D6E32';
    ctx.fillRect(0, 492, 512, 20);
    ctx.fillStyle = '#E5D429';
    for (let bx = 8; bx < 512; bx += 24) {
      ctx.fillRect(bx, 496, 10, 10);
    }

    // TILE 6 (512..1024, 360..512): PANGGIL KERETA Console + Loket Header
    // Call Train Console (512..768)
    ctx.fillStyle = '#1B2430';
    ctx.fillRect(512, 360, 256, 152);
    ctx.fillStyle = '#E5D429';
    ctx.fillRect(528, 376, 224, 42);
    ctx.fillStyle = '#181A1C';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('PANGGIL KERETA LRT', 542, 403);
    ctx.fillStyle = '#16A34A';
    ctx.beginPath();
    ctx.arc(640, 458, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('TEKAN [E]', 602, 464);
    etx.fillStyle = '#22C55E';
    etx.beginPath();
    etx.arc(640, 458, 28, 0, Math.PI * 2);
    etx.fill();

    // Loket Ticket Counter Header (768..1024)
    ctx.fillStyle = '#142C52';
    ctx.fillRect(768, 360, 256, 152);
    ctx.fillStyle = '#E5B82E';
    ctx.fillRect(768, 360, 256, 12);
    ctx.fillRect(768, 500, 256, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('LOKET / TIKET', 792, 422);
    ctx.fillStyle = '#FFE08A';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('LAYANAN PENUMPANG LRT', 792, 462);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    etx.textAlign = 'left';
    etx.textBaseline = 'alphabetic';

    etx.fillStyle = '#1C3966';
    etx.fillRect(768, 360, 256, 152);
    etx.fillStyle = '#D49B1A';
    etx.fillRect(768, 360, 256, 10);
    etx.fillStyle = '#FFF5D6';
    etx.font = 'bold 26px sans-serif';
    etx.fillText('LOKET / TIKET', 792, 422);
    etx.fillStyle = '#FFE08A';
    etx.font = 'bold 14px sans-serif';
    etx.fillText('LAYANAN PENUMPANG LRT', 792, 462);

    // TILE 7 (0..512, 512..672): PSD Header Peron 2 (JALUR 2 • KERETA KEMBALI ← in Amber/Blue)
    ctx.fillStyle = '#16325C';
    ctx.fillRect(0, 512, 512, 160);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(0, 512, 512, 10);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(0, 664, 512, 8);
    etx.fillStyle = '#1B355C';
    etx.fillRect(0, 512, 512, 160);
    etx.fillStyle = '#D97706';
    etx.fillRect(0, 512, 512, 8);

    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.arc(54, 588, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    etx.fillStyle = '#D97706';
    etx.beginPath();
    etx.arc(54, 588, 26, 0, Math.PI * 2);
    etx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    etx.textAlign = 'center';
    etx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('2', 54, 589);
    etx.fillStyle = '#FFFBEB';
    etx.font = 'bold 30px sans-serif';
    etx.fillText('2', 54, 589);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    etx.textAlign = 'left';
    etx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FEF3C7';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('JALUR 2 • KERETA KEMBALI ←', 98, 572);
    etx.fillStyle = '#FDE68A';
    etx.font = 'bold 24px sans-serif';
    etx.fillText('JALUR 2 • KERETA KEMBALI ←', 98, 572);

    ctx.fillStyle = '#FDBA74';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('← ARAH KEMBALI STASIUN SEBELUMNYA', 98, 602);
    etx.fillStyle = '#F59E0B';
    etx.font = 'bold 14px sans-serif';
    etx.fillText('← ARAH KEMBALI STASIUN SEBELUMNYA', 98, 602);

    for (let c = 0; c < 6; c++) {
      ctx.fillStyle = c === 2 ? '#F59E0B' : '#64748B';
      ctx.fillRect(98 + c * 24, 624, 20, 12);
    }
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '12px sans-serif';
    ctx.fillText('DAHULUKAN PENUMPANG TURUN', 252, 635);

    // TILE 8 (512..1024, 512..672): Peron 1 Hanging Banner (PERON 1 • ARAH MISI MAJU →)
    ctx.fillStyle = '#0F2A4A';
    ctx.fillRect(512, 512, 512, 160);
    ctx.fillStyle = '#10B981';
    ctx.fillRect(512, 512, 512, 10);
    ctx.fillStyle = '#E5D429';
    ctx.fillRect(512, 664, 512, 8);
    etx.fillStyle = '#123359';
    etx.fillRect(512, 512, 512, 160);
    etx.fillStyle = '#10B981';
    etx.fillRect(512, 512, 512, 8);

    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(568, 592, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 4;
    ctx.stroke();
    etx.fillStyle = '#059669';
    etx.beginPath();
    etx.arc(568, 592, 32, 0, Math.PI * 2);
    etx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    etx.textAlign = 'center';
    etx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('1', 568, 593);
    etx.fillStyle = '#ECFDF5';
    etx.font = 'bold 38px sans-serif';
    etx.fillText('1', 568, 593);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    etx.textAlign = 'left';
    etx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 25px sans-serif';
    ctx.fillText('PERON 1 • ARAH MISI MAJU →', 618, 578);
    etx.fillStyle = '#D1FAE5';
    etx.font = 'bold 25px sans-serif';
    etx.fillText('PERON 1 • ARAH MISI MAJU →', 618, 578);

    ctx.fillStyle = '#6EE7B7';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('LRT JABODEBEK  •  KERETA MAJU', 618, 616);
    etx.fillStyle = '#34D399';
    etx.font = 'bold 16px sans-serif';
    etx.fillText('LRT JABODEBEK  •  KERETA MAJU', 618, 616);

    // TILE 9 (0..512, 672..832): Peron 2 Hanging Banner (PERON 2 • JALUR KEMBALI ←)
    ctx.fillStyle = '#24170B';
    ctx.fillRect(0, 672, 512, 160);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(0, 672, 512, 10);
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(0, 824, 512, 8);
    etx.fillStyle = '#2E1C0D';
    etx.fillRect(0, 672, 512, 160);
    etx.fillStyle = '#F59E0B';
    etx.fillRect(0, 672, 512, 8);

    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.arc(56, 752, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FCD34D';
    ctx.lineWidth = 4;
    ctx.stroke();
    etx.fillStyle = '#D97706';
    etx.beginPath();
    etx.arc(56, 752, 32, 0, Math.PI * 2);
    etx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    etx.textAlign = 'center';
    etx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('2', 56, 753);
    etx.fillStyle = '#FFFBEB';
    etx.font = 'bold 38px sans-serif';
    etx.fillText('2', 56, 753);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    etx.textAlign = 'left';
    etx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFBEB';
    ctx.font = 'bold 25px sans-serif';
    ctx.fillText('PERON 2 • JALUR KEMBALI ←', 106, 738);
    etx.fillStyle = '#FDE68A';
    etx.font = 'bold 25px sans-serif';
    etx.fillText('PERON 2 • JALUR KEMBALI ←', 106, 738);

    ctx.fillStyle = '#FDBA74';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('← KERETA KEMBALI KE STASIUN LALU', 106, 776);
    etx.fillStyle = '#FB923C';
    etx.font = 'bold 16px sans-serif';
    etx.fillText('← KERETA KEMBALI KE STASIUN LALU', 106, 776);

    // TILE 10 (0..1024, 832..1024): 2nd-Floor JPO Wayfinding Gantry
    ctx.fillStyle = '#111E33';
    ctx.fillRect(0, 832, 1024, 192);
    ctx.fillStyle = '#E5D429';
    ctx.fillRect(0, 832, 1024, 10);
    ctx.fillRect(0, 1014, 1024, 10);
    etx.fillStyle = '#13243D';
    etx.fillRect(0, 832, 1024, 192);
    etx.fillStyle = '#E5D429';
    etx.fillRect(0, 832, 1024, 6);

    // Zone cards
    ctx.fillStyle = '#0B2E26';
    ctx.fillRect(14, 850, 332, 156);
    ctx.fillStyle = '#10B981';
    ctx.fillRect(14, 850, 332, 6);
    etx.fillStyle = '#0F3B31';
    etx.fillRect(14, 850, 332, 156);

    ctx.fillStyle = '#1A2B45';
    ctx.fillRect(360, 850, 304, 156);
    ctx.fillStyle = '#E5D429';
    ctx.fillRect(360, 850, 304, 6);
    etx.fillStyle = '#203554';
    etx.fillRect(360, 850, 304, 156);

    ctx.fillStyle = '#2E1B08';
    ctx.fillRect(678, 850, 332, 156);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(678, 850, 332, 6);
    etx.fillStyle = '#3B220A';
    etx.fillRect(678, 850, 332, 156);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    etx.textAlign = 'center';
    etx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#ECFDF5';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('← PERON 1 (MAJU)', 180, 922);
    etx.fillStyle = '#A7F3D0';
    ctx.font = 'bold 24px sans-serif';
    etx.fillText('← PERON 1 (MAJU)', 180, 922);
    ctx.fillStyle = '#6EE7B7';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('ARAH MISI MAJU • BERIKUTNYA', 180, 964);
    etx.fillStyle = '#34D399';
    etx.font = 'bold 15px sans-serif';
    etx.fillText('ARAH MISI MAJU • BERIKUTNYA', 180, 964);

    ctx.fillStyle = '#FEF9C3';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('CONCOURSE ↓', 512, 922);
    etx.fillStyle = '#FDE047';
    etx.font = 'bold 26px sans-serif';
    etx.fillText('CONCOURSE ↓', 512, 922);
    ctx.fillStyle = '#E2E8F0';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('LOKET • EXIT JALAN RAYA', 512, 964);
    etx.fillStyle = '#CBD5E1';
    etx.font = 'bold 15px sans-serif';
    etx.fillText('LOKET • EXIT JALAN RAYA', 512, 964);

    ctx.fillStyle = '#FFFBEB';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('PERON 2 (KEMBALI) →', 844, 922);
    etx.fillStyle = '#FDE68A';
    etx.font = 'bold 24px sans-serif';
    etx.fillText('PERON 2 (KEMBALI) →', 844, 922);
    ctx.fillStyle = '#FDBA74';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('JALUR KEMBALI STASIUN LALU', 844, 964);
    etx.fillStyle = '#FB923C';
    etx.font = 'bold 15px sans-serif';
    etx.fillText('JALUR KEMBALI STASIUN LALU', 844, 964);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    etx.textAlign = 'left';
    etx.textBaseline = 'alphabetic';

    return {
      map: finalizeCanvasTexture(cA, true, false, maxAniso),
      emissiveMap: finalizeCanvasTexture(cE, true, false, maxAniso)
    };
  }

  function buildFoliageVineTexture(maxAniso) {
    const size = 256;
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const rng = mulberry32(777);

    // Draw hanging tropical vine stems & overlapping leaf silhouettes from top edge
    const stems = 9;
    for (let s = 0; s < stems; s++) {
      let x = 16 + (s / (stems - 1)) * (size - 32) + (rng() - 0.5) * 14;
      const len = 130 + rng() * 115;
      ctx.strokeStyle = '#25381A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 12; y < len; y += 18) {
        x += (rng() - 0.5) * 14;
        ctx.lineTo(x, y);
        // Pair of tropical fern leaves
        const leafCount = rng() > 0.35 ? 2 : 1;
        for (let k = 0; k < leafCount; k++) {
          const dir = k === 0 ? -1 : 1;
          const ang = dir * (0.4 + rng() * 0.65);
          const lx = x + Math.cos(ang) * 6 * dir;
          const ly = y + Math.sin(Math.abs(ang)) * 4;
          const rw = 11 + rng() * 9;
          const rh = 5 + rng() * 4;
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(ang);
          const shade = rng();
          ctx.fillStyle = shade < 0.33 ? '#2B4620' : shade < 0.66 ? '#395A27' : '#4C6E31';
          ctx.beginPath();
          ctx.ellipse(dir * rw * 0.5, 0, rw, rh, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.stroke();
    }
    return finalizeCanvasTexture(c, true, false, maxAniso);
  }

  function buildScorchDecalTexture(maxAniso) {
    const size = 128;
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const fbm = makeTileableFbmBuffer(size, 6, 3, 919);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - size * 0.5) / (size * 0.5);
        const dy = (y - size * 0.5) / (size * 0.5);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const ray = 0.82 + 0.18 * Math.sin(angle * 11.0 + fbm[y * size + x] * 6.0);
        const nDist = dist / ray + (fbm[y * size + x] - 0.5) * 0.22;
        const alpha = clamp01(1.0 - smoothstep(0.15, 0.92, nDist));
        const centerChar = smoothstep(0.55, 0.0, nDist);
        const tone = lerp(42, 12, centerChar);
        const o = (y * size + x) * 4;
        d[o] = tone;
        d[o + 1] = clamp255(tone * 0.92);
        d[o + 2] = clamp255(tone * 0.85);
        d[o + 3] = clamp255(alpha * 225);
      }
    }
    ctx.putImageData(img, 0, 0);
    return finalizeCanvasTexture(c, true, false, maxAniso);
  }

  function buildBarricadeTexture(maxAniso) {
    const size = 128;
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const rng = mulberry32(417);

    // Molded safety-orange HDPE body with panel recesses
    ctx.fillStyle = '#D45717';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#B8440E';
    ctx.fillRect(0, 0, size, 12);
    ctx.fillRect(0, 106, size, 22);
    for (let rx = 14; rx < size; rx += 28) {
      ctx.fillStyle = 'rgba(40,18,6,0.28)';
      ctx.fillRect(rx, 52, 6, 52);
    }

    // Reflective red/orange & white diagonal hazard chevron strip (y = 18..46)
    ctx.save();
    ctx.beginPath();
    ctx.rect(4, 18, size - 8, 28);
    ctx.clip();
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(4, 18, size - 8, 28);
    ctx.fillStyle = '#D83B14';
    for (let x = -48; x < size + 48; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 46);
      ctx.lineTo(x + 12, 46);
      ctx.lineTo(x + 28, 18);
      ctx.lineTo(x + 16, 18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 18, size - 8, 28);

    // Stenciled "LRT JABODEBEK" warning badge + weathered scuffs
    ctx.fillStyle = '#1E1B18';
    ctx.fillRect(26, 66, 76, 22);
    ctx.fillStyle = '#E5D429';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AWAS PERON', 64, 81);
    ctx.textAlign = 'left';

    for (let s = 0; s < 35; s++) {
      ctx.fillStyle = rng() > 0.4 ? 'rgba(28,24,20,0.24)' : 'rgba(255,210,170,0.14)';
      ctx.fillRect(rng() * size, 88 + rng() * 40, 4 + rng() * 14, 2 + rng() * 6);
    }

    return finalizeCanvasTexture(c, true, true, maxAniso);
  }

  function buildSkylineFacadeSet(maxAniso) {
    const size = 1024;
    const cA = makeCanvas(size, size);
    const ctx = cA.getContext('2d');
    const cR = makeCanvas(size, size);
    const rtx = cR.getContext('2d');
    const cE = makeCanvas(size, size);
    const etx = cE.getContext('2d');
    const rng = mulberry32(9421);

    // Base architectural precast / aluminium composite cladding
    ctx.fillStyle = '#4B5563';
    ctx.fillRect(0, 0, size, size);
    rtx.fillStyle = '#9C9C9C';
    rtx.fillRect(0, 0, size, size);
    etx.fillStyle = '#000000';
    etx.fillRect(0, 0, size, size);

    // 16 floors vertical x 16 window bays horizontal across tile
    const cols = 16;
    const rows = 16;
    const cw = size / cols; // 64px
    const rh = size / rows; // 64px

    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      // Floor slab spandrel band + aluminum drip trim
      const isMechFloor = (r === 0 || r === 8);
      ctx.fillStyle = isMechFloor ? '#374151' : '#5E6875';
      ctx.fillRect(0, y, size, rh * 0.34);
      ctx.fillStyle = '#2B323C';
      ctx.fillRect(0, y + rh * 0.31, size, 3);
      rtx.fillStyle = '#B8B8B8';
      rtx.fillRect(0, y, size, rh * 0.34);

      if (isMechFloor) {
        // Louver vents on mechanical floor
        ctx.fillStyle = '#262C34';
        for (let lx = 6; lx < size - 6; lx += 12) {
          ctx.fillRect(lx, y + 8, 8, rh - 16);
        }
        continue;
      }

      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        const winX = x + 6;
        const winY = y + rh * 0.34;
        const winW = cw - 12;
        const winH = rh * 0.62;

        // Vertical structural mullion column
        ctx.fillStyle = (c % 4 === 0) ? '#6B7482' : '#404854';
        ctx.fillRect(x, y, 6, rh);

        // Glazed office curtain-wall glass pane
        const glassVar = rng();
        const litRoll = rng();
        const tint = glassVar < 0.35 ? '#1D2B38' : glassVar < 0.7 ? '#243544' : '#192430';
        ctx.fillStyle = tint;
        ctx.fillRect(winX, winY, winW, winH);
        // Glossy glass reflection highlight
        const grad = ctx.createLinearGradient(winX, winY, winX + winW, winY + winH);
        grad.addColorStop(0, 'rgba(130, 175, 205, 0.24)');
        grad.addColorStop(0.55, 'rgba(40, 62, 84, 0.08)');
        grad.addColorStop(1, 'rgba(180, 210, 225, 0.16)');
        ctx.fillStyle = grad;
        ctx.fillRect(winX, winY, winW, winH);

        // Low roughness for sky reflection on window glass
        rtx.fillStyle = '#262626';
        rtx.fillRect(winX, winY, winW, winH);

        // Scattered surviving / emergency generator lit offices
        if (litRoll > 0.76) {
          const isWarm = litRoll < 0.90;
          const lCol = isWarm ? '#FFE1A3' : '#BFE8FF';
          ctx.fillStyle = isWarm ? 'rgba(255, 214, 130, 0.65)' : 'rgba(175, 224, 255, 0.55)';
          ctx.fillRect(winX + 2, winY + 2, winW - 4, winH - 4);
          etx.fillStyle = lCol;
          etx.fillRect(winX + 3, winY + 3, winW - 6, winH - 6);
          // Interior venetian blind / ceiling silhouette inside lit room
          ctx.fillStyle = 'rgba(28, 32, 38, 0.45)';
          ctx.fillRect(winX + 2, winY + 2, winW - 4, 7);
          etx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          etx.fillRect(winX + 2, winY + 2, winW - 4, 7);
        }
      }
    }

    // Monsoon grime & vertical weathering streaks across facade
    for (let s = 0; s < 140; s++) {
      ctx.fillStyle = 'rgba(24, 22, 18, 0.14)';
      ctx.fillRect(rng() * size, rng() * size, 2 + rng() * 5, 22 + rng() * 90);
    }

    return {
      map: finalizeCanvasTexture(cA, true, true, maxAniso),
      roughnessMap: finalizeCanvasTexture(cR, false, true, maxAniso),
      emissiveMap: finalizeCanvasTexture(cE, true, true, maxAniso)
    };
  }

  function buildHighwayRoadSet(maxAniso) {
    const size = 512;
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const rng = mulberry32(3105);

    ctx.fillStyle = '#2A2D32';
    ctx.fillRect(0, 0, size, size);

    // Asphalt grain aggregate & tire wear tracks
    for (let i = 0; i < 4500; i++) {
      const g = Math.floor(32 + rng() * 26);
      ctx.fillStyle = `rgb(${g},${g},${g + 2})`;
      ctx.fillRect(rng() * size, rng() * size, 2, 2);
    }
    ctx.fillStyle = 'rgba(18, 20, 22, 0.35)';
    ctx.fillRect(88, 0, 44, size);
    ctx.fillRect(160, 0, 44, size);
    ctx.fillRect(308, 0, 44, size);
    ctx.fillRect(380, 0, 44, size);

    // Solid outer shoulder lines + yellow median lines + dashed lane lines
    ctx.fillStyle = '#D8DDE4';
    ctx.fillRect(28, 0, 10, size);
    ctx.fillRect(size - 38, 0, 10, size);
    ctx.fillStyle = '#E0B422';
    ctx.fillRect(size * 0.5 - 10, 0, 7, size);
    ctx.fillRect(size * 0.5 + 3, 0, 7, size);
    ctx.fillStyle = '#DCE2EA';
    for (let y = 16; y < size; y += 96) {
      ctx.fillRect(size * 0.25 - 4, y, 8, 52);
      ctx.fillRect(size * 0.75 - 4, y, 8, 52);
    }

    return finalizeCanvasTexture(c, true, true, maxAniso);
  }

  I.render = Object.assign(I.render || {}, {
    mulberry32,
    hash2i,
    smoothstep,
    lerp,
    clamp01,
    clamp255,
    tileableValueNoise,
    makeTileableFbmBuffer,
    heightToNormalDataTexture,
    makeCanvas,
    finalizeCanvasTexture,
    makeScalarGrayTexture,
    buildConcreteSet,
    buildTerrazzoSet,
    buildTactileYellowSet,
    buildCorrugatedRoofSet,
    buildTrainLiveryAtlas,
    buildTrainInteriorAtlas,
    buildStallAtlas,
    buildSignageAtlas,
    buildFoliageVineTexture,
    buildScorchDecalTexture,
    buildBarricadeTexture,
    buildSkylineFacadeSet,
    buildHighwayRoadSet
  });
})();
