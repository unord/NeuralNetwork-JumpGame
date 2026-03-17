const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');

const { settings, playerDefaults, canvasWidth, canvasHeight, wallPadding } = window.GameConfig;

canvas.width = canvasWidth;
canvas.height = canvasHeight;

const W = canvas.width;
const H = canvas.height;

const players = [];
const agentById = new Map();
let nextAgentId = 0;

function addPlayerAgent() {
  const player = window.PlayerController.createPlayer(W, H, playerDefaults);
  player.agentId = nextAgentId;
  player.isDead = false;
  players.push(player);
  agentById.set(nextAgentId, player);
  nextAgentId += 1;
  return player.agentId;
}

const mapState = window.MapGenerator.createState(W, H, settings);

let keyboardKeys = { left: false, right: false };
let keys = { left: false, right: false };
let score = 0;
let best = Number(localStorage.getItem('jumpBest') || 0);
let gameOver = false;

bestEl.textContent = best;

function isAIPlaying() {
  return window.GameConfig.aiPlaying === true;
}

function isPlayerControlled() {
  return !isAIPlaying() && window.GameConfig.playerControlled !== false;
}

function resetGame() {
  if (players.length === 0 && !isAIPlaying()) {
    addPlayerAgent();
  }

  for (const player of players) {
    window.PlayerController.resetPlayer(player, W, H);
    player.isDead = false;
  }

  window.MapGenerator.initPlatforms(mapState);
  score = 0;
  gameOver = false;
  scoreEl.textContent = score;
}

window.GameRuntime = {
  spawnPlayer() {
    const agentId = addPlayerAgent();
    const player = agentById.get(agentId);
    if (player) {
      window.PlayerController.resetPlayer(player, W, H);
      player.isDead = false;
    }
    return agentId;
  },
  getGameOver() {
    return gameOver;
  },
  getScore() {
    return score;
  },
  getAgentCount() {
    return players.length;
  },
  setAIPlaying(active = true) {
    const enabled = Boolean(active);
    window.GameConfig.aiPlaying = enabled;
    window.GameConfig.playerControlled = !enabled;

    if (enabled) {
      players.length = 0;
      agentById.clear();
      nextAgentId = 0;
      keyboardKeys.left = false;
      keyboardKeys.right = false;
      keys.left = false;
      keys.right = false;
      score = 0;
      scoreEl.textContent = score;
      gameOver = false;
      window.MapGenerator.initPlatforms(mapState);
      return true;
    }

    if (players.length === 0) {
      addPlayerAgent();
      resetGame();
    }
    return false;
  }
};

function update() {
  if (gameOver) return;

  window.MapGenerator.updateMovingPlatforms(mapState, wallPadding);

  for (const player of players) {
    if (player.isDead) continue;
    window.MapGenerator.carryPlayerOnMovingPlatform(player);

    const controlState = window.GameControl ? window.GameControl.getState(player.agentId) : null;
    const keyboardEnabled = isPlayerControlled() && player.agentId === 0;
    keys.left = (keyboardEnabled && keyboardKeys.left) || Boolean(controlState && controlState.left);
    keys.right = (keyboardEnabled && keyboardKeys.right) || Boolean(controlState && controlState.right);

    if (window.GameControl) {
      const jumpEdges = window.GameControl.consumeJumpEdges(player.agentId);
      if (jumpEdges.jumpJustPressed) {
        window.PlayerController.startJumpCharge(player);
      }
      if (jumpEdges.jumpJustReleased) {
        window.PlayerController.releaseJump(player, settings);
      }
    }

    window.PlayerController.updateFacing(player, keys);
    window.PlayerController.updateHorizontalVelocity(player, keys, settings);

    window.MapGenerator.resolveHorizontalCollisions(player, mapState, wallPadding);
    window.MapGenerator.resolveVerticalCollisions(player, mapState, settings.gravity);

    window.PlayerController.updateCharge(player, settings);

    if (player.y > H + 60) {
      player.isDead = true;
    }
  }

  const alivePlayers = players.filter((p) => !p.isDead);
  if (alivePlayers.length === 0) {
    if (isAIPlaying()) {
      return;
    }

    gameOver = true;
    if (score > best) {
      best = score;
      localStorage.setItem('jumpBest', String(best));
      bestEl.textContent = best;
    }
    return;
  }

  const leader = alivePlayers.reduce((bestPlayer, current) => (current.y < bestPlayer.y ? current : bestPlayer));
  const leaderYBeforeScroll = leader.y;

  window.MapGenerator.scrollMapAndRespawn(mapState, leader, (added) => {
    score += added;
    scoreEl.textContent = score;
  });

  const scrollDelta = leader.y - leaderYBeforeScroll;
  if (scrollDelta > 0) {
    for (const player of alivePlayers) {
      if (player === leader) continue;
      player.y += scrollDelta;
    }
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
  ctx.fillRect(0, 0, wallPadding, H);
  ctx.fillRect(W - wallPadding, 0, wallPadding, H);
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
  window.MapGenerator.drawPlatforms(ctx, mapState);

  for (const player of players) {
    if (player.isDead) continue;
    window.PlayerController.drawPlayer(ctx, player);
  }

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

document.addEventListener('keydown', (e) => {
  if (!isPlayerControlled()) return;

  const key = e.key.toLowerCase();

  if (key === 'arrowleft' || key === 'a') keyboardKeys.left = true;
  if (key === 'arrowright' || key === 'd') keyboardKeys.right = true;

  if (e.code === 'Space') {
    e.preventDefault();
    if (gameOver) {
      resetGame();
      return;
    }
    const humanPlayer = agentById.get(0);
    if (!e.repeat && humanPlayer && !humanPlayer.isDead) window.PlayerController.startJumpCharge(humanPlayer);
  }
});

document.addEventListener('keyup', (e) => {
  if (!isPlayerControlled()) return;

  const key = e.key.toLowerCase();

  if (key === 'arrowleft' || key === 'a') keyboardKeys.left = false;
  if (key === 'arrowright' || key === 'd') keyboardKeys.right = false;

  if (e.code === 'Space') {
    e.preventDefault();
    const humanPlayer = agentById.get(0);
    if (humanPlayer && !humanPlayer.isDead) window.PlayerController.releaseJump(humanPlayer, settings);
  }
});

canvas.addEventListener('pointerdown', restartIfOver);

if (!isAIPlaying()) {
  addPlayerAgent();
}
resetGame();
loop();
