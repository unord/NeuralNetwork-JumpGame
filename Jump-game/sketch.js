let canvas, ctx, player, camera;
let level1Image, level2Image;
let levels = [];
let currentLevelIndex = 0;
let idle1, idle2, idle3, idle4;

// Multi-agent support
let agents = {}; // agentId -> Player instance
let agentControls = {}; // agentId -> {left, right, jump} key states
let nextAgentId = 0;

const keys = {};

function syncGlobalsToWindow() {
  window.canvas = canvas;
  window.ctx = ctx;
  window.player = player;
  window.camera = camera;
  window.levels = levels;
  window.currentLevelIndex = currentLevelIndex;
  window.agents = agents;
  window.agentControls = agentControls;
  window.nextAgentId = nextAgentId;
}


window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === 'r' || e.key === 'R') player?.reset();
});

window.addEventListener('keyup', e => {
  keys[e.key] = false;
});

window.addEventListener('load', () => {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  level1Image = new Image();
  level2Image = new Image();

  let loadedImages = 0;

  function imageLoaded() {
    loadedImages++;

    if (loadedImages === 2) {
      levels = [
        createLevel1(level1Image),
        createLevel2(level2Image)
      ];

      currentLevelIndex = 0;

      player = new Player(900, levels[currentLevelIndex].height - 400);
      agents[0] = player; // Register default player as agent 0
      agentControls[0] = { left: false, right: false, jump: false };
      nextAgentId = 1;
      camera = new Camera(canvas.width, canvas.height);

      syncGlobalsToWindow();
      requestAnimationFrame(loop);
    }
  }

  idle1 = new Image();
  idle2 = new Image();
  idle3 = new Image();
  idle4 = new Image();

  idle1.src = 'pictures/player/idle1.png';
  idle2.src = 'pictures/player/idle2.png';
  idle3.src = 'pictures/player/idle3.png';
  idle4.src = 'pictures/player/idle4.png';

  level1Image.onload = imageLoaded;
  level2Image.onload = imageLoaded;

  level1Image.src = 'pictures/levels/level1.png';
  level2Image.src = 'pictures/levels/level2.png';
});

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  if (camera) {
    camera.viewWidth = canvas.width;
    camera.viewHeight = canvas.height;
  }

  syncGlobalsToWindow();
}
function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Update all agents
  for (const agentId in agents) {
    const agent = agents[agentId];
    const ctrl = agentControls[agentId];
    
    // Apply agent-specific controls
    if (agent) {
      // Temporarily set keys for this agent
      keys['ArrowLeft'] = ctrl.left;
      keys['a'] = ctrl.left;
      keys['ArrowRight'] = ctrl.right;
      keys['d'] = ctrl.right;
      keys[' '] = ctrl.jump;
      keys['w'] = ctrl.jump;
      
      agent.update(levels[currentLevelIndex]);
    }
  }
  
  camera.update(player, levels[currentLevelIndex]);
  levels[currentLevelIndex].draw(ctx, camera);
  
  // Draw all agents
  for (const agentId in agents) {
    const agent = agents[agentId];
    if (agent) {
      agent.draw(ctx, camera);
    }
  }
  
  drawDebug();
  requestAnimationFrame(loop);
}

function drawDebug() {
  const level = levels[currentLevelIndex];

  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(8, 34, 400, 160);

  ctx.fillStyle = 'white';
  ctx.font = '13px Arial';

  ctx.fillText(`player: ${Math.round(player.x)}, ${Math.round(player.y)}`, 18, 56);
  ctx.fillText(`camera: ${Math.round(camera.x)}, ${Math.round(camera.y)}`, 18, 76);
  ctx.fillText(`level index: ${currentLevelIndex}`, 18, 96);
  ctx.fillText(`level size: ${level.width} x ${level.height}`, 18, 116);
  ctx.fillText(`charge: ${Math.round(player.jumpCharge * 100)}%`, 18, 136);
  ctx.fillText(`agents: ${Object.keys(agents).length}`, 18, 156);
  
  // Show controls for agent 0
  const ctrl = agentControls[0];
  if (ctrl) {
    ctx.fillText(`ctrl: L=${ctrl.left} R=${ctrl.right} J=${ctrl.jump}`, 18, 176);
  }
  
  // Draw a light debug sample of raycasts.
  // Training can use many rays, but drawing all rays every frame is expensive.
  if (window.GameConfig?.devDebug && window.RaycastAPI && typeof window.RaycastAPI.castRays === 'function') {
    const drawAllAgentRays = window.GameConfig?.drawAllAgentRays !== false;
    const debugRayCount = Number(window.GameConfig?.debugRayCount || 72);
    const debugRayMaxDistance = Number(window.GameConfig?.debugRayMaxDistance || 1200);
    const drawRayHitMarkers = window.GameConfig?.drawRayHitMarkers !== false;
    const rayHitMarkerRadius = Math.max(1, Number(window.GameConfig?.rayHitMarkerRadius || 2));
    const targetAgentIds = drawAllAgentRays ? Object.keys(agents).map(Number) : [0];

    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    for (const agentId of targetAgentIds) {
      const p = agents[agentId];
      if (!p) continue;

      const rays = window.RaycastAPI.castRays(agentId, debugRayCount, debugRayMaxDistance);
      if (!rays || rays.length === 0) continue;

      const originX = p.x + p.w / 2;
      const originY = p.y + p.h / 2;
      ctx.strokeStyle = agentId === 0 ? '#00ff66' : '#33ccff';

      for (const ray of rays) {
        const [, , hitX, hitY] = ray;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(hitX, hitY);
        ctx.stroke();

        if (drawRayHitMarkers) {
          ctx.beginPath();
          ctx.arc(hitX, hitY, rayHitMarkerRadius, 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }
}
