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
      highestPlatformY: 0,
      lastSpawnCenter: width / 2
    };
  }

  function getEnabledSpawnTypes(settings) {
    const spawn = settings.platformTypes || {};
    const types = [];

    if (spawn.ledge !== false) types.push('ledge');
    if (spawn.center !== false) types.push('center');
    if (spawn.square !== false) types.push('square');
    if (spawn.movingSquare !== false) types.push('moving-square');
    if (spawn.icy !== false) types.push('icy');
    if (spawn.belt !== false) types.push('belt');

    return types.length > 0 ? types : ['ledge'];
  }

  function makePlatform(state, y) {
    const { settings, width, spawnCounter } = state;
    const enabledTypes = getEnabledSpawnTypes(settings);
    const type = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    state.spawnCounter += 1;

    let w;
    let x;
    let vx = 0;
    let h = settings.platformH;

    if (type === 'square') {
      w = rand(settings.squareSizeMin, settings.squareSizeMax);
      x = rand(18, width - w - 18);
      h = w;
    } else if (type === 'moving-square') {
      w = rand(settings.squareSizeMin + 4, settings.squareSizeMax + 6);
      x = rand(18, width - w - 18);
      vx = (Math.random() < 0.5 ? -1 : 1) * rand(0.85, 1.45);
      h = w;
    } else if (type === 'center') {
      w = rand(settings.centerPlatformWMin, settings.centerPlatformWMax);
      x = rand(20, width - w - 20);
      h = rand(settings.ledgeHMin, settings.ledgeHMax);
    } else if (type === 'icy') {
      w = rand(settings.icyWMin, settings.icyWMax);
      const fromLeft = spawnCounter % 2 === 0;
      x = fromLeft ? 0 : width - w;
      h = rand(settings.icyHMin, settings.icyHMax);
    } else if (type === 'belt') {
      w = rand(settings.beltWMin, settings.beltWMax);
      x = rand(18, width - w - 18);
      h = rand(settings.beltHMin, settings.beltHMax);
    } else {
      w = rand(settings.platformWMin, settings.platformWMax);
      const fromLeft = spawnCounter % 2 === 0;
      x = fromLeft ? 0 : width - w;
      h = rand(settings.ledgeHMin, settings.ledgeHMax);
    }

    const edgePadding = 18;
    const minCenter = w / 2 + edgePadding;
    const maxCenter = width - w / 2 - edgePadding;
    const spawnDrift = settings.maxSpawnDrift || Math.floor(width * 0.33);
    const desiredCenter = x + w / 2;
    const clampedCenter = Math.max(
      minCenter,
      Math.min(
        maxCenter,
        Math.max(state.lastSpawnCenter - spawnDrift, Math.min(state.lastSpawnCenter + spawnDrift, desiredCenter))
      )
    );
    x = clampedCenter - w / 2;
    state.lastSpawnCenter = clampedCenter;

    const beltDir = type === 'belt' ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const beltSpeed = type === 'belt' ? rand(settings.beltSpeedMin, settings.beltSpeedMax) : 0;

    return { x, y, w, h, type, vx, deltaX: 0, beltDir, beltSpeed };
  }

  function initPlatforms(state) {
    const { settings, width, height } = state;
    state.platforms = [];
    state.spawnCounter = 0;
    state.lastSpawnCenter = width / 2;

    let y = height - 70;
    state.platforms.push({
      x: width / 2 - 55,
      y,
      w: 110,
      h: settings.platformH,
      type: 'start',
      vx: 0,
      deltaX: 0,
      beltDir: 0,
      beltSpeed: 0
    });
    state.lastSpawnCenter = width / 2;

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
    if (!player.grounded || !player.standingPlatform) return;

    const platform = player.standingPlatform;

    if (platform.type === 'moving-square') {
      player.x += platform.deltaX;
      return;
    }

    if (platform.type === 'belt') {
      player.x += platform.beltDir * platform.beltSpeed;
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
      // Keep side-collisions only for chunky square obstacles.
      // Thin platforms (ledge/center/icy/belt/start) should be passable from the side
      // so they don't create unavoidable wall-like blockers.
      if (p.type !== 'square' && p.type !== 'moving-square') continue;
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

      if (p.type === 'icy') {
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#a5f3fc';
        ctx.fillRect(p.x, p.y, p.w, 4);
        ctx.fillStyle = 'rgba(224, 242, 254, 0.6)';
        ctx.fillRect(p.x + 10, p.y + p.h * 0.45, p.w - 20, 2);
        continue;
      }

      if (p.type === 'belt') {
        ctx.fillStyle = '#05070b';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);

        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x + 1, p.y + 1, Math.max(0, p.w - 2), Math.max(0, p.h - 2));
        ctx.clip();

        ctx.fillStyle = '#374151';
        ctx.fillRect(p.x, p.y, p.w, 3);

        const stripeStep = 12;
        const t = performance.now() * 0.03 * p.beltDir;
        const offset = ((t % stripeStep) + stripeStep) % stripeStep;
        ctx.fillStyle = 'rgba(250, 204, 21, 0.8)';
        for (let sx = p.x - stripeStep + offset; sx < p.x + p.w; sx += stripeStep) {
          ctx.fillRect(sx, p.y + 4, 6, Math.max(2, p.h - 6));
        }

        ctx.fillStyle = '#f9fafb';
        const arrowY = p.y + p.h * 0.52;
        const center = p.x + p.w / 2;
        const arrowSpacing = 24;
        for (let ax = center - arrowSpacing; ax <= center + arrowSpacing; ax += arrowSpacing) {
          ctx.beginPath();
          if (p.beltDir < 0) {
            ctx.moveTo(ax + 4, arrowY - 4);
            ctx.lineTo(ax - 4, arrowY);
            ctx.lineTo(ax + 4, arrowY + 4);
          } else {
            ctx.moveTo(ax - 4, arrowY - 4);
            ctx.lineTo(ax + 4, arrowY);
            ctx.lineTo(ax - 4, arrowY + 4);
          }
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();

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