(function (LRT) {
  'use strict';

  const I = (window.__LRT_INTERNAL__ = window.__LRT_INTERNAL__ || {});
  const E = (I.enemies = I.enemies || {});

  const MAX_NAV_NODES = 384;
  const _nearbyBoxes = [];
  const EMPTY_EDGES = [];

  // Pre-allocated A* scratch buffers
  const _astarG = new Float32Array(MAX_NAV_NODES);
  const _astarF = new Float32Array(MAX_NAV_NODES);
  const _astarParent = new Int16Array(MAX_NAV_NODES);
  const _astarClosed = new Uint8Array(MAX_NAV_NODES);
  const _astarInOpen = new Uint8Array(MAX_NAV_NODES);
  const _astarOpen = new Int16Array(MAX_NAV_NODES);
  const _astarPath = new Int16Array(MAX_NAV_NODES);

  function isPsdEdgePassable(ed) {
    if (!ed || ed.gatedPsdZ === undefined || ed.gatedTrack === undefined) return true;
    return !!(LRT.Station && typeof LRT.Station.isPsdOpeningClear === 'function'
      && LRT.Station.isPsdOpeningClear(ed.gatedPsdZ, ed.gatedTrack));
  }

  function gatherNearbyColliders(x, z, radius, spatialGrid, trainColliders) {
    _nearbyBoxes.length = 0;

    if (spatialGrid) {
      let raw = null;
      if (typeof spatialGrid.queryPoint === 'function') {
        raw = spatialGrid.queryPoint(x, z, radius);
      } else if (typeof spatialGrid.queryAABB === 'function') {
        raw = spatialGrid.queryAABB(x - radius, z - radius, x + radius, z + radius);
      } else if (typeof spatialGrid.query === 'function') {
        raw = spatialGrid.query(x, z, radius);
      } else if (typeof spatialGrid.queryRadius === 'function') {
        raw = spatialGrid.queryRadius(x, z, radius);
      } else if (Array.isArray(spatialGrid)) {
        raw = spatialGrid;
      }
      if (raw) {
        for (let i = 0; i < raw.length; i++) {
          const b = raw[i];
          if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
          const minX = b.min ? b.min.x : b.minX;
          const maxX = b.max ? b.max.x : b.maxX;
          const minZ = b.min ? b.min.z : b.minZ;
          const maxZ = b.max ? b.max.z : b.maxZ;
          if (maxX >= x - radius && minX <= x + radius && maxZ >= z - radius && minZ <= z + radius) {
            _nearbyBoxes.push(b);
          }
        }
      }
    } else if (LRT.Station && typeof LRT.Station.getColliders === 'function') {
      const all = LRT.Station.getColliders();
      if (all) {
        for (let i = 0; i < all.length; i++) {
          const b = all[i];
          if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
          const minX = b.min ? b.min.x : b.minX;
          const maxX = b.max ? b.max.x : b.maxX;
          const minZ = b.min ? b.min.z : b.minZ;
          const maxZ = b.max ? b.max.z : b.maxZ;
          if (maxX >= x - radius && minX <= x + radius && maxZ >= z - radius && minZ <= z + radius) {
            _nearbyBoxes.push(b);
          }
        }
      }
    }

    const tc = Array.isArray(trainColliders)
      ? trainColliders
      : ((LRT.Train && typeof LRT.Train.getColliders === 'function') ? LRT.Train.getColliders() : null);
    if (tc) {
      for (let i = 0; i < tc.length; i++) {
        const b = tc[i];
        if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
        const minX = b.min ? b.min.x : b.minX;
        const maxX = b.max ? b.max.x : b.maxX;
        const minZ = b.min ? b.min.z : b.minZ;
        const maxZ = b.max ? b.max.z : b.maxZ;
        if (maxX >= x - radius && minX <= x + radius && maxZ >= z - radius && minZ <= z + radius) {
          _nearbyBoxes.push(b);
        }
      }
    }
  }

  function isWalkableCollider(b) {
    if (b.isFloor || b.isRamp) return true;
    const tag = b.tag || '';
    return tag === 'floor' || tag === 'ramp' || tag === 'stair' || tag === 'stairs' || tag === 'train_floor' || tag === 'platform';
  }

  function isBlockedAt(x, y, z, rad) {
    for (let i = 0; i < _nearbyBoxes.length; i++) {
      const b = _nearbyBoxes[i];
      if (b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
      const tag = b.tag || '';
      if (isWalkableCollider(b) || tag === 'interact') continue;

      const minY = b.min ? b.min.y : b.minY;
      const maxY = b.max ? b.max.y : b.maxY;
      if (maxY <= y + 0.42 || minY >= y + 1.65) continue;

      const minX = b.min ? b.min.x : b.minX;
      const maxX = b.max ? b.max.x : b.maxX;
      const minZ = b.min ? b.min.z : b.minZ;
      const maxZ = b.max ? b.max.z : b.maxZ;

      const cx = Math.max(minX, Math.min(x, maxX));
      const cz = Math.max(minZ, Math.min(z, maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < rad * rad) {
        return true;
      }
    }
    return false;
  }

  function resolveCollisions(zObj, rad, dt) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < _nearbyBoxes.length; i++) {
        const b = _nearbyBoxes[i];
        if (b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
        const tag = b.tag || '';
        if (isWalkableCollider(b) || tag === 'interact') continue;

        const minY = b.min ? b.min.y : b.minY;
        const maxY = b.max ? b.max.y : b.maxY;
        if (maxY <= zObj.y + 0.42 || minY >= zObj.y + 1.65) continue;

        const minX = b.min ? b.min.x : b.minX;
        const maxX = b.max ? b.max.x : b.maxX;
        const minZ = b.min ? b.min.z : b.minZ;
        const maxZ = b.max ? b.max.z : b.maxZ;

        const cx = Math.max(minX, Math.min(zObj.x, maxX));
        const cz = Math.max(minZ, Math.min(zObj.z, maxZ));
        const dx = zObj.x - cx;
        const dz = zObj.z - cz;
        const distSq = dx * dx + dz * dz;

        if (distSq < rad * rad) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const push = rad - dist;
            zObj.x += (dx / dist) * push;
            zObj.z += (dz / dist) * push;
          } else {
            const dl = Math.abs(zObj.x - minX);
            const dr = Math.abs(maxX - zObj.x);
            const dtn = Math.abs(zObj.z - minZ);
            const db = Math.abs(maxZ - zObj.z);
            const m = Math.min(dl, dr, dtn, db);
            if (m === dl) zObj.x = minX - rad;
            else if (m === dr) zObj.x = maxX + rad;
            else if (m === dtn) zObj.z = minZ - rad;
            else zObj.z = maxZ + rad;
          }
        }
      }
    }

    // Precision surface Y tracking across ramps, stairs, sidewalks (-0.82), asphalt (-1.00), platforms (0.0) & JPO (4.25)
    let bestFloorY = -999;
    let bestRampY = -999;
    for (let i = 0; i < _nearbyBoxes.length; i++) {
      const b = _nearbyBoxes[i];
      if (b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
      const tag = b.tag || '';
      const minX = b.min ? b.min.x : b.minX;
      const maxX = b.max ? b.max.x : b.maxX;
      const minZ = b.min ? b.min.z : b.minZ;
      const maxZ = b.max ? b.max.z : b.maxZ;
      if (zObj.x < minX - 0.1 || zObj.x > maxX + 0.1 || zObj.z < minZ - 0.1 || zObj.z > maxZ + 0.1) continue;

      const minY = b.min ? b.min.y : b.minY;
      const maxY = b.max ? b.max.y : b.maxY;
      if (!isWalkableCollider(b) && !(tag === 'concrete' && maxY <= -0.5) && tag !== '') continue;

      let surfaceY = maxY;
      const isRamp = !!(b.isRamp || tag === 'ramp' || typeof b.getSurfaceY === 'function');
      const axis = b.rampAxis || b.slopeAxis;
      if (typeof b.getSurfaceY === 'function') {
        surfaceY = b.getSurfaceY(zObj.x, zObj.z);
      } else if (isRamp && typeof axis === 'string') {
        const y0 = b.y0 !== undefined ? b.y0 : minY;
        const y1 = b.y1 !== undefined ? b.y1 : maxY;
        if (axis === 'z') {
          const t = Math.max(0, Math.min(1, (zObj.z - minZ) / Math.max(0.01, maxZ - minZ)));
          surfaceY = y0 + (y1 - y0) * t;
        } else if (axis === 'x') {
          const t = Math.max(0, Math.min(1, (zObj.x - minX) / Math.max(0.01, maxX - minX)));
          surfaceY = y0 + (y1 - y0) * t;
        }
      }
      if (surfaceY <= zObj.y + 0.72) {
        if (isRamp && surfaceY > bestRampY) bestRampY = surfaceY;
        if (surfaceY > bestFloorY) bestFloorY = surfaceY;
      }
    }

    const chosenY = bestRampY > -50 && Math.abs(bestRampY - zObj.y) <= 0.72 ? bestRampY : bestFloorY;
    if (chosenY > -50) {
      if (chosenY >= zObj.y) {
        zObj.y += (chosenY - zObj.y) * Math.min(1.0, (dt || 0.016) * 18.0);
        zObj.vy = 0;
      } else {
        // Fast grounded descent down stair flights / sidewalks so feet never hover in mid-air
        zObj.vy = Math.min(14.0, (zObj.vy || 0) + 18.0 * (dt || 0.016));
        zObj.y = Math.max(chosenY, zObj.y - Math.max(zObj.vy * (dt || 0.016), (zObj.y - chosenY) * 0.55));
        if (Math.abs(zObj.y - chosenY) < 0.03) {
          zObj.y = chosenY;
          zObj.vy = 0;
        }
      }
    } else if (zObj.y > -1.05) {
      zObj.vy = Math.min(12.0, (zObj.vy || 0) + 14.0 * (dt || 0.016));
      zObj.y = Math.max(-1.05, zObj.y - zObj.vy * (dt || 0.016));
    }
  }

  // Multi-Level & Street A* Waypoint Pathfinder over LRT.Station.getNavGraph()
  function findNearestNavNode(nodes, x, y, z) {
    let bestId = -1;
    let bestScore = 1e9;
    const onRampBand = y > 0.12 && y < 4.08;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dy = n.y - y;
      const isRampNode = n.tag === 'stair_ramp' || n.tag === 'ada_ramp' || n.tag === 'jpo_stair';
      // Strongly avoid snapping a ground/track zombie up to an unreachable elevated platform face,
      // and avoid snapping a zombie climbing stairs down to the flat floor underneath the staircase
      let vertPenalty = Math.abs(dy) * 3.4;
      if (dy > 0.55 && !isRampNode) vertPenalty = Math.abs(dy) * 16.0;
      else if (onRampBand && dy < -0.45 && !isRampNode) vertPenalty = 24.0 + Math.abs(dy) * 4.0;
      else if (isRampNode) vertPenalty = Math.abs(dy) * 1.6;
      const d = Math.hypot(n.x - x, n.z - z) + vertPenalty;
      if (d < bestScore) {
        bestScore = d;
        bestId = i;
      }
    }
    return bestId;
  }

  function hasDirectWalkPath(spatialGrid, x0, y0, z0, x1, z1, trainColliders) {
    const hasGrid = !!(spatialGrid && typeof spatialGrid.queryPoint === 'function');
    const tc = Array.isArray(trainColliders)
      ? trainColliders
      : ((LRT.Train && typeof LRT.Train.getColliders === 'function') ? LRT.Train.getColliders() : null);
    if (!hasGrid && (!tc || tc.length === 0)) return false;

    const dist = Math.hypot(x1 - x0, z1 - z0);
    if (dist < 0.45) return true;
    if (dist > 28.0) return false;
    const steps = Math.max(2, Math.ceil(dist / 0.85));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      let hasFloor = false;

      if (hasGrid) {
        const near = spatialGrid.queryPoint(px, pz, 0.55);
        for (let k = 0; k < near.length; k++) {
          const b = near[k];
          if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
          if (isWalkableCollider(b)) {
            const minX = b.min ? b.min.x : b.minX, maxX = b.max ? b.max.x : b.maxX;
            const minZ = b.min ? b.min.z : b.minZ, maxZ = b.max ? b.max.z : b.maxZ;
            const maxY = b.max ? b.max.y : b.maxY, minY = b.min ? b.min.y : b.minY;
            if (px >= minX - 0.1 && px <= maxX + 0.1 && pz >= minZ - 0.1 && pz <= maxZ + 0.1 && maxY >= y0 - 0.55 && minY <= y0 + 0.55) {
              hasFloor = true;
            }
            continue;
          }
          if ((b.tag || '') === 'interact') continue;
          const minY = b.min ? b.min.y : b.minY, maxY = b.max ? b.max.y : b.maxY;
          if (maxY <= y0 + 0.42 || minY >= y0 + 1.65) continue;
          const minX = b.min ? b.min.x : b.minX, maxX = b.max ? b.max.x : b.maxX;
          const minZ = b.min ? b.min.z : b.minZ, maxZ = b.max ? b.max.z : b.maxZ;
          const cx = Math.max(minX, Math.min(px, maxX));
          const cz = Math.max(minZ, Math.min(pz, maxZ));
          if ((px - cx) * (px - cx) + (pz - cz) * (pz - cz) < 0.16) return false;
        }
      }

      if (tc && tc.length > 0) {
        for (let k = 0; k < tc.length; k++) {
          const b = tc[k];
          if (!b || b.broken || b.disabled || b.blocksWalk === false || b.isTrigger) continue;
          const minX = b.min ? b.min.x : b.minX, maxX = b.max ? b.max.x : b.maxX;
          const minZ = b.min ? b.min.z : b.minZ, maxZ = b.max ? b.max.z : b.maxZ;
          if (maxX < px - 0.55 || minX > px + 0.55 || maxZ < pz - 0.55 || minZ > pz + 0.55) continue;
          if (isWalkableCollider(b)) {
            const maxY = b.max ? b.max.y : b.maxY, minY = b.min ? b.min.y : b.minY;
            if (px >= minX - 0.1 && px <= maxX + 0.1 && pz >= minZ - 0.1 && pz <= maxZ + 0.1 && maxY >= y0 - 0.55 && minY <= y0 + 0.55) {
              hasFloor = true;
            }
            continue;
          }
          if ((b.tag || '') === 'interact') continue;
          const minY = b.min ? b.min.y : b.minY, maxY = b.max ? b.max.y : b.maxY;
          if (maxY <= y0 + 0.42 || minY >= y0 + 1.65) continue;
          const cx = Math.max(minX, Math.min(px, maxX));
          const cz = Math.max(minZ, Math.min(pz, maxZ));
          if ((px - cx) * (px - cx) + (pz - cz) * (pz - cz) < 0.16) return false;
        }
      }

      if (!hasFloor) return false;
    }
    return true;
  }

  function solveNavWaypoint(zObj, px, py, pz, spatialGrid, trainColliders) {
    const sameLevel = Math.abs((py || 0) - zObj.y) <= 0.65;
    if (sameLevel && hasDirectWalkPath(spatialGrid, zObj.x, zObj.y, zObj.z, px, pz, trainColliders)) {
      zObj.hasNavWp = false;
      return false;
    }

    const graph = (LRT.Station && typeof LRT.Station.getNavGraph === 'function') ? LRT.Station.getNavGraph() : null;
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      zObj.hasNavWp = false;
      return false;
    }

    const nodes = graph.nodes;
    const adj = graph.adj;
    const count = Math.min(nodes.length, MAX_NAV_NODES);
    const startId = findNearestNavNode(nodes, zObj.x, zObj.y, zObj.z);
    const goalId = findNearestNavNode(nodes, px, py || 0, pz);
    if (startId < 0 || goalId < 0) {
      zObj.hasNavWp = false;
      return false;
    }
    if (startId === goalId) {
      const gn = nodes[goalId];
      const dSelf = Math.hypot(gn.x - zObj.x, gn.z - zObj.z);
      if (dSelf > 1.2) {
        zObj.wpX = gn.x; zObj.wpY = gn.y; zObj.wpZ = gn.z; zObj.hasNavWp = true;
        return true;
      }
      zObj.hasNavWp = false;
      return false;
    }

    for (let i = 0; i < count; i++) {
      _astarG[i] = 1e9;
      _astarF[i] = 1e9;
      _astarParent[i] = -1;
      _astarClosed[i] = 0;
      _astarInOpen[i] = 0;
    }
    const goalNode = nodes[goalId];
    let openLen = 0;
    _astarG[startId] = 0;
    _astarF[startId] = Math.hypot(goalNode.x - nodes[startId].x, (goalNode.y - nodes[startId].y) * 1.4, goalNode.z - nodes[startId].z);
    _astarOpen[openLen++] = startId;
    _astarInOpen[startId] = 1;

    let found = false;
    while (openLen > 0) {
      let bestOpenIdx = 0;
      let bestF = _astarF[_astarOpen[0]];
      for (let i = 1; i < openLen; i++) {
        const f = _astarF[_astarOpen[i]];
        if (f < bestF) {
          bestF = f;
          bestOpenIdx = i;
        }
      }
      const cur = _astarOpen[bestOpenIdx];
      _astarOpen[bestOpenIdx] = _astarOpen[--openLen];
      _astarInOpen[cur] = 0;
      if (cur === goalId) {
        found = true;
        break;
      }
      _astarClosed[cur] = 1;

      const edges = adj[cur] || EMPTY_EDGES;
      const curG = _astarG[cur];
      for (let i = 0; i < edges.length; i++) {
        const ed = edges[i];
        if (!isPsdEdgePassable(ed)) continue;
        const nxt = ed.to;
        if (nxt >= count || _astarClosed[nxt]) continue;
        let edgeCost = ed.cost;
        if (zObj.variant === 'spitter' && Math.hypot(goalNode.x - zObj.x, goalNode.z - zObj.z) > 8.0 && nodes[nxt].y >= 3.8) {
          edgeCost *= 0.72;
        }
        const tentG = curG + edgeCost;
        if (tentG < _astarG[nxt]) {
          _astarParent[nxt] = cur;
          _astarG[nxt] = tentG;
          const nn = nodes[nxt];
          _astarF[nxt] = tentG + Math.hypot(goalNode.x - nn.x, (goalNode.y - nn.y) * 1.4, goalNode.z - nn.z);
          if (!_astarInOpen[nxt]) {
            _astarOpen[openLen++] = nxt;
            _astarInOpen[nxt] = 1;
          }
        }
      }
    }

    if (!found) {
      zObj.hasNavWp = false;
      return false;
    }

    let pathLen = 0;
    let cur = goalId;
    while (cur >= 0 && pathLen < MAX_NAV_NODES) {
      _astarPath[pathLen++] = cur;
      if (cur === startId) break;
      cur = _astarParent[cur];
    }
    if (pathLen <= 0) {
      zObj.hasNavWp = false;
      return false;
    }

    // Path array is reversed [goal .. start]; advance past start if near OR already on the forward side toward next waypoint
    let targetNodeId = _astarPath[pathLen - 1];
    if (pathLen >= 2) {
      const sn = nodes[startId];
      const nxt = nodes[_astarPath[pathLen - 2]];
      const distStart = Math.hypot(sn.x - zObj.x, sn.z - zObj.z);
      const fwdDot = (nxt.x - sn.x) * (sn.x - zObj.x) + (nxt.z - sn.z) * (sn.z - zObj.z);
      if ((distStart < 1.85 || fwdDot <= 0) && Math.abs(sn.y - zObj.y) < 0.85) {
        targetNodeId = _astarPath[pathLen - 2];
      }
    }
    // A* lookahead string-pulling: skip intermediate node if unobstructed direct walk path exists on same level
    if (pathLen >= 3) {
      const skipTarget = _astarPath[pathLen - 2];
      const nxt2 = nodes[skipTarget];
      if (nxt2 && Math.abs(nxt2.y - zObj.y) <= 0.65 && hasDirectWalkPath(spatialGrid, zObj.x, zObj.y, zObj.z, nxt2.x, nxt2.z, trainColliders)) {
        targetNodeId = skipTarget;
        if (pathLen >= 4) {
          const skipTarget2 = _astarPath[pathLen - 3];
          const nxt3 = nodes[skipTarget2];
          if (nxt3 && Math.abs(nxt3.y - zObj.y) <= 0.65 && hasDirectWalkPath(spatialGrid, zObj.x, zObj.y, zObj.z, nxt3.x, nxt3.z, trainColliders)) {
            targetNodeId = skipTarget2;
          }
        }
      }
    }
    const wp = nodes[targetNodeId];
    zObj.wpX = wp.x;
    zObj.wpY = wp.y;
    zObj.wpZ = wp.z;
    zObj.hasNavWp = true;
    return true;
  }

  function applyZombieSeparation(z, index, zombies, highWater, velOut) {
    let mx = velOut.x;
    let mz = velOut.z;
    for (let j = 0; j < highWater; j++) {
      if (index === j) continue;
      const other = zombies[j];
      if (!other.active || other.dead) continue;
      const sx = z.x - other.x;
      const sz = z.z - other.z;
      const dSq = sx * sx + sz * sz;
      if (dSq > 1e-4 && dSq < 0.78) {
        const d = Math.sqrt(dSq);
        const push = (0.88 - d) * 3.4;
        mx += (sx / d) * push;
        mz += (sz / d) * push;
      }
    }
    velOut.x = mx;
    velOut.z = mz;
  }

  function updateStuckRecovery(z, step, dist3D, stopDist) {
    // Net-progress stuck recovery so stragglers never stall indefinitely on rails or corners
    z.progTimer += step;
    if (z.progTimer >= 1.2) {
      const moved = Math.hypot(z.x - z.lastProgX, z.z - z.lastProgZ);
      z.lastProgX = z.x;
      z.lastProgZ = z.z;
      z.progTimer = 0;
      if (moved < 0.35 && dist3D > stopDist + 0.5 && z.alertDelay <= 0) {
        z.stuckTime += 1.2;
        z.navTimer = 0;
        z.steerDir *= -1;
        if (z.stuckTime >= 2.4 && z.hasNavWp) {
          // Nudge cleanly along active A* waypoint if jammed against minor lip/prop
          const nx = z.wpX - z.x, nz = z.wpZ - z.z;
          const nd = Math.hypot(nx, nz) || 1;
          const stepDist = Math.min(1.6, nd);
          z.x += (nx / nd) * stepDist;
          z.z += (nz / nd) * stepDist;
          if (Math.abs(z.wpY - z.y) < 1.25) z.y = z.wpY;
          z.stuckTime = 0;
        }
      } else {
        z.stuckTime = 0;
      }
    }
  }

  function pickAdjacentPatrolNode(graph, x, y, z, prevX, prevZ, outObj) {
    if (!graph || !graph.nodes || graph.nodes.length === 0 || !graph.adj || !outObj) return false;
    const nodes = graph.nodes;
    const adj = graph.adj;
    const startId = findNearestNavNode(nodes, x, y, z);
    if (startId < 0) return false;
    const edges = adj[startId] || EMPTY_EDGES;
    if (edges.length === 0) return false;

    let validCount = 0;
    let nonBackCount = 0;
    for (let i = 0; i < edges.length; i++) {
      if (!isPsdEdgePassable(edges[i])) continue;
      const nxt = nodes[edges[i].to];
      if (!nxt) continue;
      if (Math.abs(nxt.y - y) > 1.25) continue;
      const dist = Math.hypot(nxt.x - x, nxt.z - z);
      if (dist < 2.2) continue;
      validCount++;
      if (Math.hypot(nxt.x - prevX, nxt.z - prevZ) > 1.8) nonBackCount++;
    }
    if (validCount === 0) return false;

    const useNonBack = nonBackCount > 0;
    const pickIdx = Math.floor(Math.random() * (useNonBack ? nonBackCount : validCount));
    let seen = 0;
    for (let i = 0; i < edges.length; i++) {
      if (!isPsdEdgePassable(edges[i])) continue;
      const nxt = nodes[edges[i].to];
      if (!nxt) continue;
      if (Math.abs(nxt.y - y) > 1.25) continue;
      const dist = Math.hypot(nxt.x - x, nxt.z - z);
      if (dist < 2.2) continue;
      if (useNonBack && Math.hypot(nxt.x - prevX, nxt.z - prevZ) <= 1.8) continue;
      if (seen === pickIdx) {
        outObj.x = nxt.x;
        outObj.y = nxt.y;
        outObj.z = nxt.z;
        return true;
      }
      seen++;
    }
    return false;
  }

  E.gatherNearbyColliders = gatherNearbyColliders;
  E.isWalkableCollider = isWalkableCollider;
  E.isBlockedAt = isBlockedAt;
  E.resolveCollisions = resolveCollisions;
  E.findNearestNavNode = findNearestNavNode;
  E.hasDirectWalkPath = hasDirectWalkPath;
  E.solveNavWaypoint = solveNavWaypoint;
  E.applyZombieSeparation = applyZombieSeparation;
  E.updateStuckRecovery = updateStuckRecovery;
  E.pickAdjacentPatrolNode = pickAdjacentPatrolNode;
})(window.LRT = window.LRT || {});
