window.MapGenerator = (() => {
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function createState(width, height, settings) {
    return {
      width,
      height,
      settings,
      platforms: [],
      spawnCounter: 0,
      highestPlatformY: 0
    };
  }

  function makePlatform(state, y) {
    const { settings, width } = state;
    const slot = state.spawnCounter % 6;
    state.spawnCounter += 1;

    let w;
    let x;
    let type = 'ledge';
    let vx = 0;
    let h = settings.platformH;

    if (slot === 4) {
      type = 'square';
      w = rand(settings.squareSizeMin, settings.squareSizeMax);
      x = rand(18, width - w - 18);
      h = w;
    } else if (slot === 5) {
      type = 'moving-square';
      w = rand(settings.squareSizeMin + 4, settings.squareSizeMax + 6);
      x = rand(18, width - w - 18);
      vx = (Math.random() < 0.5 ? -1 : 1) * rand(0.85, 1.45);
      h = w;
    } else if (slot === 3) {
      type = 'center';
      w = rand(settings.centerPlatformWMin, settings.centerPlatformWMax);
      x = rand(20, width - w - 20);
      h = rand(settings.ledgeHMin, settings.ledgeHMax);
    } else {
      w = rand(settings.platformWMin, settings.platformWMax);
      const fromLeft = slot % 2 === 0;
      x = fromLeft ? 0 : width - w;
      h = rand(settings.ledgeHMin, settings.ledgeHMax);
    }

    return { x, y, w, h, type, vx, deltaX: 0 };
  }

  function initPlatforms(state) {
    const { settings, width, height } = state;
    state.platforms = [];
    state.spawnCounter = 0;

    let y = height - 70;
    state.platforms.push({
      x: width / 2 - 55,
      y,
      w: 110,
      h: settings.platformH,
      type: 'start',
      vx: 0,
      deltaX: 0
    });

    for (let i = 1; i < settings.platformCount; i++) {
      y -= rand(settings.minPlatformGap, settings.maxPlatformGap);
      state.platforms.push(makePlatform(state, y));
    }

    state.highestPlatformY = Math.min(...state.platforms.map((p) => p.y));
  }

  function intersectsPlayer(player, p) {
    return (
      player.x < p.x + p.w &&
      player.x + player.w > p.x &&
      player.y < p.y + p.h &&
      player.y + player.h > p.y
    );
  }

  function updateMovingPlatforms(state, wallPadding) {
    const rightBound = state.width - wallPadding;
    for (const p of state.platforms) {
      p.deltaX = 0;
      if (p.type !== 'moving-square') continue;

      const prevX = p.x;
      p.x += p.vx;

      if (p.x <= wallPadding) {
        p.x = wallPadding;
        p.vx *= -1;
      }
      if (p.x + p.w >= rightBound) {
        p.x = rightBound - p.w;
        p.vx *= -1;
      }

      p.deltaX = p.x - prevX;
    }
  }

  function carryPlayerOnMovingPlatform(player) {
    if (player.grounded && player.standingPlatform && player.standingPlatform.type === 'moving-square') {
      player.x += player.standingPlatform.deltaX;
    }
  }

  function resolveHorizontalCollisions(player, state, wallPadding) {
    const prevX = player.x;
    player.x += player.vx;

    if (player.x < 0) {
      player.x = 0;
      player.vx = Math.abs(player.vx);
    }
    if (player.x + player.w > state.width) {
      player.x = state.width - player.w;
      player.vx = -Math.abs(player.vx);
    }

    for (const p of state.platforms) {
      if (!intersectsPlayer(player, p)) continue;

      if (player.vx > 0 && prevX + player.w <= p.x) {
        player.x = p.x - player.w;
        player.vx = -Math.abs(player.vx);
      } else if (player.vx < 0 && prevX >= p.x + p.w) {
        player.x = p.x + p.w;
        player.vx = Math.abs(player.vx);
      }
    }

    if (player.x < wallPadding) {
      player.x = wallPadding;
      player.vx = Math.abs(player.vx);
    }
    if (player.x + player.w > state.width - wallPadding) {
      player.x = state.width - wallPadding - player.w;
      player.vx = -Math.abs(player.vx);
    }
  }

  function resolveVerticalCollisions(player, state, gravity) {
    player.grounded = false;
    player.standingPlatform = null;

    player.vy += gravity;
    const prevY = player.y;
    player.y += player.vy;

    for (const p of state.platforms) {
      if (!intersectsPlayer(player, p)) continue;

      if (player.vy > 0 && prevY + player.h <= p.y) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.grounded = true;
        player.standingPlatform = p;
        continue;
      }

      if (player.vy < 0 && prevY >= p.y + p.h) {
        player.y = p.y + p.h;
        player.vy = 0;
        continue;
      }

      const overlapLeft = player.x + player.w - p.x;
      const overlapRight = p.x + p.w - player.x;
      const overlapTop = player.y + player.h - p.y;
      const overlapBottom = p.y + p.h - player.y;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      if (minOverlap === overlapTop) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.grounded = true;
        player.standingPlatform = p;
      } else if (minOverlap === overlapBottom) {
        player.y = p.y + p.h;
        if (player.vy < 0) player.vy = 0;
      } else if (minOverlap === overlapLeft) {
        player.x = p.x - player.w;
        if (player.vx > 0) player.vx = -Math.abs(player.vx);
      } else {
        player.x = p.x + p.w;
        if (player.vx < 0) player.vx = Math.abs(player.vx);
      }
    }
  }

  function scrollMapAndRespawn(state, player, onScore) {
    if (!(player.y < state.height * 0.35 && player.vy < 0)) return;

    const scroll = -player.vy;
    player.y += scroll;

    for (const p of state.platforms) {
      p.y += scroll;
      if (p.y > state.height + 20) {
        const newY = state.highestPlatformY - rand(state.settings.minPlatformGap, state.settings.maxPlatformGap);
        Object.assign(p, makePlatform(state, newY));
        state.highestPlatformY = Math.min(state.highestPlatformY, newY);
        onScore(10);
      }
    }

    state.highestPlatformY = Math.min(...state.platforms.map((p) => p.y));
  }

  function drawPlatforms(ctx, state) {
    for (const p of state.platforms) {
      if (p.type === 'square') {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(p.x, p.y, p.w, 4);
        continue;
      }

      if (p.type === 'moving-square') {
        ctx.fillStyle = '#a78bfa';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#c4b5fd';
        ctx.fillRect(p.x, p.y, p.w, 4);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        const mid = p.y + p.h / 2;
        ctx.fillRect(p.x + 8, mid - 2, p.w - 16, 4);
        continue;
      }

      ctx.fillStyle = '#4ade80';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(p.x, p.y, p.w, 3);
    }
  }

  return {
    createState,
    initPlatforms,
    updateMovingPlatforms,
    carryPlayerOnMovingPlatform,
    resolveHorizontalCollisions,
    resolveVerticalCollisions,
    scrollMapAndRespawn,
    drawPlatforms
  };
})();