window.RaycastAPI = (() => {
  const EPSILON = 1e-9;

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function getAgent(agentId = 0) {
    const id = safeNumber(agentId, 0);
    if (typeof agents !== 'undefined' && agents && agents[id]) return agents[id];
    if (window.agents && window.agents[id]) return window.agents[id];
    return null;
  }

  function getLevel() {
    const idx = typeof currentLevelIndex !== 'undefined'
      ? currentLevelIndex
      : safeNumber(window.currentLevelIndex, 0);

    if (typeof levels !== 'undefined' && levels && levels[idx]) return levels[idx];
    if (window.levels && window.levels[idx]) return window.levels[idx];
    return null;
  }

  function raySegmentHit(originX, originY, dirX, dirY, line) {
    const x1 = safeNumber(line.x1);
    const y1 = safeNumber(line.y1);
    const x2 = safeNumber(line.x2);
    const y2 = safeNumber(line.y2);

    const segX = x2 - x1;
    const segY = y2 - y1;
    const denom = dirX * segY - dirY * segX;

    if (Math.abs(denom) < EPSILON) return null;

    const relX = x1 - originX;
    const relY = y1 - originY;
    const t = (relX * segY - relY * segX) / denom;
    const u = (relX * dirY - relY * dirX) / denom;

    if (t < 0 || u < 0 || u > 1) return null;

    return {
      distance: t,
      x: originX + dirX * t,
      y: originY + dirY * t
    };
  }

  function considerBoundary(originX, originY, dirX, dirY, maxDist, level) {
    const hits = [];
    const width = safeNumber(level?.width, 0);
    const height = safeNumber(level?.height, 0);

    if (dirX < -EPSILON) {
      const t = (0 - originX) / dirX;
      if (t >= 0 && t <= maxDist) hits.push({ distance: t, x: 0, y: originY + dirY * t });
    }

    if (width > 0 && dirX > EPSILON) {
      const t = (width - originX) / dirX;
      if (t >= 0 && t <= maxDist) hits.push({ distance: t, x: width, y: originY + dirY * t });
    }

    if (dirY < -EPSILON) {
      const t = (0 - originY) / dirY;
      if (t >= 0 && t <= maxDist) hits.push({ distance: t, x: originX + dirX * t, y: 0 });
    }

    if (height > 0 && dirY > EPSILON) {
      const t = (height - originY) / dirY;
      if (t >= 0 && t <= maxDist) hits.push({ distance: t, x: originX + dirX * t, y: height });
    }

    if (!hits.length) return null;
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0];
  }

  function castRays(agentId = 0, rayCount = 360, maxDistance = 1200) {
    const p = getAgent(agentId);
    const level = getLevel();
    if (!p || !level) return [];

    const count = Math.max(1, Math.floor(safeNumber(rayCount, 360)));
    const maxDist = Math.max(1, safeNumber(maxDistance, 1200));
    const originX = safeNumber(p.x) + safeNumber(p.w, 42) / 2;
    const originY = safeNumber(p.y) + safeNumber(p.h, 70) / 2;
    const lines = Array.isArray(level.lines) ? level.lines : [];
    
    // Debug: Log on first ray of first agent
    if (agentId === 0 && typeof window._raycastDebugLogged === 'undefined') {
      window._raycastDebugLogged = true;
      console.log(`[Raycast] Agent=${agentId}, Origin=(${originX.toFixed(0)}, ${originY.toFixed(0)}), Lines=${lines.length}, MaxDist=${maxDist}`);
    }
    
    const out = new Array(count);

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      let best = null;

      for (const line of lines) {
        const hit = raySegmentHit(originX, originY, dirX, dirY, line);
        if (!hit || hit.distance > maxDist) continue;
        if (!best || hit.distance < best.distance) best = hit;
      }

      const boundaryHit = considerBoundary(originX, originY, dirX, dirY, maxDist, level);
      if (boundaryHit && (!best || boundaryHit.distance < best.distance)) best = boundaryHit;

      if (!best) {
        best = {
          distance: maxDist,
          x: originX + dirX * maxDist,
          y: originY + dirY * maxDist
        };
      }

      // Numeric-only output for the NN: [angleRadians, distance, hitX, hitY]
      // No platform type / string values, so Python input is stable and dense.
      out[i] = [angle, best.distance, best.x, best.y];
    }

    return out;
  }

  function debugRaySummary(agentId = 0, rayCount = 360, maxDistance = 1200) {
    const rays = castRays(agentId, rayCount, maxDistance);
    if (!rays.length) return { ok: false, count: 0 };
    
    let minDistance = Infinity;
    let maxDistanceSeen = 0;
    let hitCount = 0;
    let missCount = 0;
    
    for (const [, distance] of rays) {
      minDistance = Math.min(minDistance, distance);
      maxDistanceSeen = Math.max(maxDistanceSeen, distance);
      if (Math.abs(distance - maxDistance) < 0.01) {
        missCount++;
      } else {
        hitCount++;
      }
    }
    
    return { 
      ok: true, 
      count: rays.length, 
      minDistance, 
      maxDistanceSeen, 
      hitCount,
      missCount,
      hitRate: hitCount / (hitCount + missCount),
      first: rays[0] 
    };
  }

  return {
    castRays,
    debugRaySummary
  };
})();
