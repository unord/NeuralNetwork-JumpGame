window.RaycastAPI = (() => {
  function rayAabbDistance(originX, originY, dirX, dirY, rect) {
    const epsilon = 1e-8;

    const tx1 = Math.abs(dirX) < epsilon ? -Infinity : (rect.x - originX) / dirX;
    const tx2 = Math.abs(dirX) < epsilon ? Infinity : (rect.x + rect.w - originX) / dirX;
    const ty1 = Math.abs(dirY) < epsilon ? -Infinity : (rect.y - originY) / dirY;
    const ty2 = Math.abs(dirY) < epsilon ? Infinity : (rect.y + rect.h - originY) / dirY;

    const tmin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
    const tmax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));

    if (tmax < 0 || tmin > tmax) return Infinity;
    if (tmin >= 0) return tmin;
    if (tmax >= 0) return tmax;
    return Infinity;
  }

  function getWorldAndPlayer(agentId) {
    if (!window.GameRuntime) return null;
    if (typeof window.GameRuntime.getWorldState !== 'function') return null;
    if (typeof window.GameRuntime.getPlayerState !== 'function') return null;

    const world = window.GameRuntime.getWorldState();
    const player = window.GameRuntime.getPlayerState(agentId);

    if (!world || !player || player.isDead) return null;
    return { world, player };
  }

  function buildRayAngles(rayCount) {
    const count = Math.max(1, Math.floor(rayCount));
    const step = (Math.PI * 2) / count;
    const angles = [];

    for (let i = 0; i < count; i++) {
      angles.push(i * step);
    }

    return angles;
  }

  function castRays(agentId = 0, rayCount = 8, maxDistance = 900) {
    const snapshot = getWorldAndPlayer(agentId);
    if (!snapshot) return [];

    const { world, player } = snapshot;
    const originX = player.x + player.w / 2;
    const originY = player.y + player.h / 2;
    const maxDist = Number.isFinite(maxDistance) ? Math.max(0, maxDistance) : 900;

    const colliders = world.platforms.map((p) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      type: p.type
    }));

    // Side walls are exposed as a collider type as well.
    colliders.push({
      x: 0,
      y: 0,
      w: world.wallPadding,
      h: world.height,
      type: 'wall-left'
    });
    colliders.push({
      x: world.width - world.wallPadding,
      y: 0,
      w: world.wallPadding,
      h: world.height,
      type: 'wall-right'
    });

    const angles = buildRayAngles(rayCount);

    return angles.map((angle) => {
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      let bestDist = maxDist;
      let hitType = null;

      for (const collider of colliders) {
        const dist = rayAabbDistance(originX, originY, dirX, dirY, collider);
        if (dist < bestDist) {
          bestDist = dist;
          hitType = collider.type;
        }
      }

      return [angle, bestDist, hitType];
    });
  }

  return {
    castRays
  };
})();
