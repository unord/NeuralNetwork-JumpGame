const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');

const W = canvas.width;
const H = canvas.height;

const player = {
  x: W / 2 - 14,
  y: H - 120,
  w: 28,
  h: 34,
  vx: 0,
  vy: 0,
  speed: 4.8,
  jumpForce: 14.5,
  grounded: false,
  isCharging: false,
  jumpCharge: 0,
  facing: 1,
  lockPositionUntilRelease: false,
  standingPlatform: null
};

const settings = {
  gravity: 0.52,
  platformCount: 8,
  minPlatformGap: 88,
  maxPlatformGap: 128,
  platformWMin: 150,
  platformWMax: 260,
  platformH: 16,
  ledgeHMin: 12,
  ledgeHMax: 30,
  centerPlatformWMin: 100,
  centerPlatformWMax: 160,
  squareSizeMin: 44,
  squareSizeMax: 66,
  minJumpForce: 2.2,
  maxJumpForce: 15.5,
  chargePerFrame: 0.04,
  minDirectionalBoost: 2.4,
  maxDirectionalBoost: 7.2,
  airDrag: 0.985
};

let platforms = [];
let keys = { left: false, right: false };
let score = 0;
let best = Number(localStorage.getItem('jumpBest') || 0);
let gameOver = false;
let spawnCounter = 0;
let highestPlatformY = 0;

bestEl.textContent = best;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function makePlatform(y) {
  const slot = spawnCounter % 6;
  spawnCounter += 1;

  let w;
  let x;
  let type = 'ledge';
  let vx = 0;
  let h = settings.platformH;

  if (slot === 4) {
    type = 'square';
    w = rand(settings.squareSizeMin, settings.squareSizeMax);
    x = rand(18, W - w - 18);
    h = w;
  } else if (slot === 5) {
    type = 'moving-square';
    w = rand(settings.squareSizeMin + 4, settings.squareSizeMax + 6);
    x = rand(18, W - w - 18);
    vx = (Math.random() < 0.5 ? -1 : 1) * rand(0.85, 1.45);
    h = w;
  } else if (slot === 3) {
    type = 'center';
    w = rand(settings.centerPlatformWMin, settings.centerPlatformWMax);
    x = rand(20, W - w - 20);
    h = rand(settings.ledgeHMin, settings.ledgeHMax);
  } else {
    w = rand(settings.platformWMin, settings.platformWMax);
    const fromLeft = slot % 2 === 0;
    x = fromLeft ? 0 : W - w;
    h = rand(settings.ledgeHMin, settings.ledgeHMax);
  }

  return {
    x,
    y,
    w,
    h,
    type,
    vx,
    deltaX: 0
  };
}

function initPlatforms() {
  platforms = [];
  spawnCounter = 0;
  let y = H - 70;

  platforms.push({
    x: W / 2 - 55,
    y,
    w: 110,
    h: settings.platformH,
    type: 'start',
    vx: 0
  });

  for (let i = 1; i < settings.platformCount; i++) {
    y -= rand(settings.minPlatformGap, settings.maxPlatformGap);
    platforms.push(makePlatform(y));
  }

  highestPlatformY = Math.min(...platforms.map((p) => p.y));
}

function intersectsPlatform(p) {
  return (
    player.x < p.x + p.w &&
    player.x + player.w > p.x &&
    player.y < p.y + p.h &&
    player.y + player.h > p.y
  );
}

function resetGame() {
  player.x = W / 2 - 14;
  player.y = H - 120;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.isCharging = false;
  player.jumpCharge = 0;
  player.facing = 1;
  player.lockPositionUntilRelease = false;
  player.standingPlatform = null;
  score = 0;
  gameOver = false;
  initPlatforms();
  scoreEl.textContent = score;
}

function update() {
  if (gameOver) return;

  for (const p of platforms) {
    p.deltaX = 0;
    if (p.type !== 'moving-square') continue;

    const prevPlatformX = p.x;
    p.x += p.vx;

    if (p.x <= 4) {
      p.x = 4;
      p.vx *= -1;
    }
    if (p.x + p.w >= W - 4) {
      p.x = W - 4 - p.w;
      p.vx *= -1;
    }

    p.deltaX = p.x - prevPlatformX;
  }

  if (player.grounded && player.standingPlatform && player.standingPlatform.type === 'moving-square') {
    player.x += player.standingPlatform.deltaX;
  }

  if (keys.left && !keys.right) {
    player.facing = -1;
  } else if (keys.right && !keys.left) {
    player.facing = 1;
  } else {
    player.facing = 0;
  }

  if (player.lockPositionUntilRelease) {
    player.vx = 0;
  } else if (player.grounded) {
    player.vx = 0;
    if (keys.left) player.vx = -player.speed;
    if (keys.right) player.vx = player.speed;
  } else {
    if (keys.left) player.vx -= 0.12;
    if (keys.right) player.vx += 0.12;
    if (player.vx > player.speed) player.vx = player.speed;
    if (player.vx < -player.speed) player.vx = -player.speed;
    player.vx *= settings.airDrag;
  }

  const prevX = player.x;
  player.x += player.vx;

  if (player.x < 0) {
    player.x = 0;
    player.vx = Math.abs(player.vx);
  }
  if (player.x + player.w > W) {
    player.x = W - player.w;
    player.vx = -Math.abs(player.vx);
  }

  for (const p of platforms) {
    if (!intersectsPlatform(p)) continue;

    if (player.vx > 0 && prevX + player.w <= p.x) {
      player.x = p.x - player.w;
      player.vx = -Math.abs(player.vx);
    } else if (player.vx < 0 && prevX >= p.x + p.w) {
      player.x = p.x + p.w;
      player.vx = Math.abs(player.vx);
    }
  }

  player.grounded = false;
  player.standingPlatform = null;
  player.vy += settings.gravity;

  const prevY = player.y;
  player.y += player.vy;

  for (const p of platforms) {
    if (!intersectsPlatform(p)) continue;

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

  if (player.isCharging && player.grounded) {
    player.jumpCharge = Math.min(1, player.jumpCharge + settings.chargePerFrame);
    if (player.jumpCharge >= 1) {
      releaseJump();
    }
  }

  if (!player.grounded && player.isCharging) {
    player.isCharging = false;
    player.jumpCharge = 0;
  }

  if (player.y < H * 0.35 && player.vy < 0) {
    const scroll = -player.vy;
    player.y += scroll;
    for (const p of platforms) {
      p.y += scroll;
      if (p.y > H + 20) {
        const newY = highestPlatformY - rand(settings.minPlatformGap, settings.maxPlatformGap);
        Object.assign(p, makePlatform(newY));
        highestPlatformY = Math.min(highestPlatformY, newY);
        score += 10;
        scoreEl.textContent = score;
      }
    }

    highestPlatformY = Math.min(...platforms.map((p) => p.y));
  }

  if (player.y > H + 60) {
    gameOver = true;
    if (score > best) {
      best = score;
      localStorage.setItem('jumpBest', String(best));
      bestEl.textContent = best;
    }
  }
}

function drawPlayer() {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(player.x, player.y, player.w, player.h);

  const eyeOffset = player.facing < 0 ? -2 : player.facing > 0 ? 2 : 0;

  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(player.x + 5 + eyeOffset, player.y + 7, 6, 6);
  ctx.fillRect(player.x + player.w - 11 + eyeOffset, player.y + 7, 6, 6);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(player.x + 7, player.y + 22, player.w - 14, 4);

  if (player.isCharging) {
    const barW = player.w;
    const fillW = Math.floor(barW * player.jumpCharge);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(player.x, player.y - 8, barW, 4);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(player.x, player.y - 8, fillW, 4);
  }
}

function drawPlatforms() {
  for (const p of platforms) {
    if (p.type === 'square') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(p.x, p.y, p.w, p.w);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(p.x, p.y, p.w, 4);
      continue;
    }

    if (p.type === 'moving-square') {
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(p.x, p.y, p.w, p.w);
      ctx.fillStyle = '#c4b5fd';
      ctx.fillRect(p.x, p.y, p.w, 4);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      const mid = p.y + p.w / 2;
      ctx.fillRect(p.x + 8, mid - 2, p.w - 16, 4);
      continue;
    }

    ctx.fillStyle = '#4ade80';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(p.x, p.y, p.w, 3);
  }
}

function drawBackgroundDots() {
  for (let i = 0; i < 36; i++) {
    const x = (i * 91) % W;
    const y = (i * 67 + score * 0.2) % H;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWalls() {
  ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.fillRect(0, 0, 4, H);
  ctx.fillRect(W - 4, 0, 4, H);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.font = '700 36px Inter, sans-serif';
  ctx.fillText('Game Over', W / 2, H / 2 - 40);

  ctx.font = '600 20px Inter, sans-serif';
  ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 2);
  ctx.fillText(`Best: ${best}`, W / 2, H / 2 + 34);

  ctx.font = '500 16px Inter, sans-serif';
  ctx.fillStyle = '#a5b4fc';
  ctx.fillText('Press Space or Click to Restart', W / 2, H / 2 + 76);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackgroundDots();
  drawWalls();
  drawPlatforms();
  drawPlayer();

  if (gameOver) drawGameOver();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

function restartIfOver() {
  if (gameOver) resetGame();
}

function startJumpCharge() {
  if (player.grounded && !player.isCharging) {
    player.isCharging = true;
    player.jumpCharge = 0;
    player.lockPositionUntilRelease = true;
    player.vx = 0;
  }
}

function releaseJump() {
  if (!player.isCharging || !player.grounded) return;

  const forceRange = settings.maxJumpForce - settings.minJumpForce;
  const jumpForce = settings.minJumpForce + forceRange * player.jumpCharge;
  const directionalRange = settings.maxDirectionalBoost - settings.minDirectionalBoost;
  const directionalBoost = settings.minDirectionalBoost + directionalRange * player.jumpCharge;

  player.vy = -jumpForce;
  player.vx = directionalBoost * player.facing;
  player.grounded = false;
  player.isCharging = false;
  player.jumpCharge = 0;
  player.lockPositionUntilRelease = false;
  player.standingPlatform = null;
}

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  if (key === 'arrowleft' || key === 'a') keys.left = true;
  if (key === 'arrowright' || key === 'd') keys.right = true;

  if (e.code === 'Space') {
    e.preventDefault();
    if (gameOver) {
      resetGame();
      return;
    }
    if (!e.repeat) startJumpCharge();
  }
});

document.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'arrowleft' || key === 'a') keys.left = false;
  if (key === 'arrowright' || key === 'd') keys.right = false;
  if (e.code === 'Space') {
    e.preventDefault();
    releaseJump();
  }
});

canvas.addEventListener('pointerdown', restartIfOver);

resetGame();
loop();
