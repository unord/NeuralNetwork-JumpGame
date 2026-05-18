/**
 * Jump-Game GameAPI - Provides interface for AI agents to control and sense the game
 * Mirrors the GameOld API structure for compatibility with existing Python AI code
 */

// Configuration for AI gameplay
window.GameConfig = {
  aiPlaying: true,
  playerControlled: true,
  devDebug: false,
  drawAllAgentRays: true,
  debugRayCount: 72,
  debugRayMaxDistance: 1200,
  drawRayHitMarkers: true,
  rayHitMarkerRadius: 2,
  seed: 0,

  get canvasWidth() {
    const c = window.canvas || document.getElementById('game');
    return c ? c.width : window.innerWidth;
  },

  get canvasHeight() {
    const c = window.canvas || document.getElementById('game');
    return c ? c.height : window.innerHeight;
  }
};



function getCurrentLevelSafe() {
  const idx = typeof currentLevelIndex !== 'undefined' ? currentLevelIndex : Number(window.currentLevelIndex || 0);
  if (typeof levels !== 'undefined' && levels && levels[idx]) return levels[idx];
  if (window.levels && window.levels[idx]) return window.levels[idx];
  return null;
}

function getLandingSurfaces(level = getCurrentLevelSafe()) {
  if (!level || !Array.isArray(level.lines)) return [];

  const surfaces = [];
  for (const line of level.lines) {
    if (!line || typeof line.isHorizontal !== 'function' || !line.isHorizontal()) continue;

    const x1 = Math.min(Number(line.x1), Number(line.x2));
    const x2 = Math.max(Number(line.x1), Number(line.x2));
    const y = Number(line.y1);
    const width = x2 - x1;

    // Ignore tiny decorative/collision fragments. Real standable tops are wider.
    if (!Number.isFinite(y) || width < 24) continue;

    surfaces.push({ x1, x2, y, width });
  }

  // Platform rank: 0 is the lowest/start surface, higher rank means a higher platform.
  // Y grows downward in canvas coordinates, so lower y is higher in the level.
  const uniqueYs = [...new Set(surfaces.map(s => Math.round(s.y)))].sort((a, b) => b - a);
  const rankByY = new Map(uniqueYs.map((y, index) => [y, index]));

  surfaces.sort((a, b) => {
    if (b.y !== a.y) return b.y - a.y;
    return a.x1 - b.x1;
  });

  return surfaces.map((surface, index) => ({
    ...surface,
    index,
    platformRank: rankByY.get(Math.round(surface.y)) || 0
  }));
}

function getAgentLandingState(agentId = 0) {
  const id = Number.isFinite(Number(agentId)) ? Number(agentId) : 0;
  const p = (typeof agents !== 'undefined' && agents) ? agents[id] : (window.agents ? window.agents[id] : null);
  const level = getCurrentLevelSafe();

  if (!p || !level) {
    return {
      onPlatform: false,
      platformRank: -1,
      platformIndex: -1,
      surfaceY: null,
      surfaceX1: null,
      surfaceX2: null
    };
  }

  const footY = Number(p.y) + Number(p.h || 0);
  const centerX = Number(p.x) + Number(p.w || 0) / 2;
  const leftX = Number(p.x);
  const rightX = Number(p.x) + Number(p.w || 0);

  let best = null;
  for (const surface of getLandingSurfaces(level)) {
    const overlaps = rightX > surface.x1 && leftX < surface.x2;
    const footClose = Math.abs(footY - surface.y) <= 8;
    if (!overlaps || !footClose) continue;

    const horizontalDistance = centerX < surface.x1
      ? surface.x1 - centerX
      : centerX > surface.x2
        ? centerX - surface.x2
        : 0;

    const candidate = { ...surface, horizontalDistance };
    if (!best || candidate.horizontalDistance < best.horizontalDistance) best = candidate;
  }

  if (!best) {
    return {
      onPlatform: false,
      platformRank: -1,
      platformIndex: -1,
      surfaceY: null,
      surfaceX1: null,
      surfaceX2: null
    };
  }

  return {
    onPlatform: true,
    platformRank: best.platformRank,
    platformIndex: best.index,
    surfaceY: best.y,
    surfaceX1: best.x1,
    surfaceX2: best.x2
  };
}

// Runtime state and getters
window.GameRuntime = (() => {
  function setAIPlaying(active = true, devDebug = false) {
    window.GameConfig.aiPlaying = Boolean(active);
    window.GameConfig.playerControlled = !Boolean(active);
    window.GameConfig.devDebug = Boolean(devDebug);
  }

  function getWorldState() {
    if (typeof currentLevelIndex === 'undefined') return null;
    if (typeof levels === 'undefined' || !levels[currentLevelIndex]) return null;

    const lv = levels[currentLevelIndex];
    return {
      width: lv.width,
      height: lv.height,
      currentLevelIndex,
      platforms: lv.lines ? lv.lines.map(line => ({
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2
      })) : []
    };
  }

  function getPlayerState(agentId = 0) {
    const id = Number.isFinite(Number(agentId)) ? Number(agentId) : 0;
    if (typeof agents === 'undefined' || !agents[id]) return null;

    const p = agents[id];
    return {
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      vx: p.vx,
      vy: p.vy,
      onGround: p.onGround,
      isChargingJump: p.isChargingJump,
      jumpCharge: p.jumpCharge,
      jumpDirection: p.jumpDirection,
      facing: p.facing,
      currentLevelIndex: currentLevelIndex,
      landing: getAgentLandingState(id),
      isDead: p.y > (levels[currentLevelIndex]?.height || 1000)
    };
  }

  function spawnPlayer(x = 900, y = null) {
    if (typeof levels === 'undefined' || !levels[currentLevelIndex]) return -1;
    const spawnY = y !== null ? y : levels[currentLevelIndex].height - 400;
    const newAgent = new Player(x, spawnY);
    const agentId = nextAgentId++;
    agents[agentId] = newAgent;
    agentControls[agentId] = { left: false, right: false, jump: false };

    window.nextAgentId = nextAgentId;
    window.agents = agents;
    window.agentControls = agentControls;

    return agentId;
  }

  return {
    setAIPlaying,
    getWorldState,
    getPlayerState,
    spawnPlayer
  };
})();

window.GameAPI = (() => {
  function toHoldState(value = 1) {
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    return Boolean(value);
  }

  function toAgentId(agentId = 0) {
    const id = Number(agentId);
    return Number.isFinite(id) ? id : 0;
  }

  /**
   * Spawn a new agent at a given position
   * Returns the agent ID
   */
  function spawngent(x = 900, y = null) {
    if (window.GameRuntime && typeof window.GameRuntime.spawnPlayer === 'function') {
      return window.GameRuntime.spawnPlayer(x, y);
    }
    return -1;
  }

  /**
   * Spawn/reset player to starting position (agent 0)
   */
  function spawnplayer() {
    if (typeof player === 'undefined' || !player) return -1;
    player.reset();
    if (agents[0]) agents[0].reset();
    window.player = player;
    window.agents = agents;
    return 0;
  }

  /**
   * Move player left
   * agentId: agent to control
   * hold: 1 to start holding left, 0 to release
   */
  function moveleft(agentId = 0, hold = 1) {
    const holdState = toHoldState(hold);
    const id = toAgentId(agentId);
    
    if (!agentControls[id]) agentControls[id] = { left: false, right: false, jump: false };
    agentControls[id].left = holdState;
    return true;
  }

  /**
   * Move player right
   * agentId: agent to control
   * hold: 1 to start holding right, 0 to release
   */
  function moveright(agentId = 0, hold = 1) {
    const holdState = toHoldState(hold);
    const id = toAgentId(agentId);
    
    if (!agentControls[id]) agentControls[id] = { left: false, right: false, jump: false };
    agentControls[id].right = holdState;
    return true;
  }

  /**
   * Jump action
   * agentId: agent to control
   * hold: 1 to start charging jump, 0 to release
   */
  function jump(agentId = 0, hold = 1) {
    const holdState = toHoldState(hold);
    const id = toAgentId(agentId);
    
    if (!agentControls[id]) agentControls[id] = { left: false, right: false, jump: false };
    agentControls[id].jump = holdState;
    return true;
  }

  /**
   * Stop all movement and jumping for an agent
   */
  function stop(agentId = 0) {
    const id = toAgentId(agentId);
    if (!agentControls[id]) agentControls[id] = { left: false, right: false, jump: false };
    agentControls[id].left = false;
    agentControls[id].right = false;
    agentControls[id].jump = false;
    return true;
  }

  /**
   * Get current player state for an agent
   * Returns: {x, y, w, h, vx, vy, onGround, isChargingJump, jumpCharge, ...}
   */
  function getplayerstate(agentId = 0) {
    const id = toAgentId(agentId);
    const p = agents[id];
    
    if (!p) return null;

    return {
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      vx: p.vx,
      vy: p.vy,
      onGround: p.onGround,
      isChargingJump: p.isChargingJump,
      jumpCharge: p.jumpCharge,
      jumpDirection: p.jumpDirection,
      facing: p.facing,
      currentLevelIndex: currentLevelIndex,
      landing: getAgentLandingState(id),
      animFrame: p.animFrame
    };
  }

  /**
   * Get current landing/platform state for an agent.
   * platformRank is the main progress signal: 0=start/lowest surface, 1=next platform up, etc.
   */
  function getlandingstate(agentId = 0) {
    return getAgentLandingState(toAgentId(agentId));
  }

  /**
   * Get level state information
   * Returns: {width, height, currentLevelIndex}
   */
  function getlevelstate() {
    if (typeof currentLevelIndex === 'undefined') return null;
    if (typeof levels === 'undefined' || !levels[currentLevelIndex]) return null;

    const lv = levels[currentLevelIndex];
    return {
      width: lv.width,
      height: lv.height,
      currentLevelIndex,
      lineCount: lv.lines ? lv.lines.length : 0,
      landingSurfaces: getLandingSurfaces(lv)
    };
  }

  /**
   * Cast rays from an agent to detect environment
   * agentId: which agent to get rays for
   * rayCount: number of rays (default 8)
   * maxDistance: max ray distance (default 900)
   * Returns: [[angle, distance, hitX, hitY], ...]
   */
  function getrays(agentId = 0, rayCount = 360, maxDistance = 1200) {
    if (!window.RaycastAPI || typeof window.RaycastAPI.castRays !== 'function') return [];
    return window.RaycastAPI.castRays(toAgentId(agentId), Number(rayCount), Number(maxDistance));
  }

  /**
   * Get world state (for debugging/analysis)
   */
  function getworldstate() {
    if (typeof currentLevelIndex === 'undefined') return null;
    if (typeof levels === 'undefined' || !levels[currentLevelIndex]) return null;

    const lv = levels[currentLevelIndex];
    return {
      level: getlevelstate(),
      player: getplayerstate(),
      platform_count: lv.lines ? lv.lines.length : 0,
      landingSurfaces: getLandingSurfaces(lv)
    };
  }

  /**
   * Get list of all active agents
   * Returns array of agent IDs
   */
  function getagents() {
    return Object.keys(agents).map(Number);
  }

  /**
   * Remove/kill an agent
   */
  function killgent(agentId = 0) {
    const id = toAgentId(agentId);
    if (id === 0) return false; // Don't kill the main player
    delete agents[id];
    delete agentControls[id];
    window.agents = agents;
    window.agentControls = agentControls;
    return true;
  }

  /**
   * Reset an agent to its spawn position
   */
  function resetgent(agentId = 0) {
    const id = toAgentId(agentId);
    if (agents[id]) {
      agents[id].reset();
      return true;
    }
    return false;
  }

  // Public API
  return {
    spawngent,
    spawnplayer,
    moveleft,
    moveright,
    jump,
    stop,
    getplayerstate,
    getlandingstate,
    getlevelstate,
    getrays,
    getworldstate,
    getagents,
    killgent,
    resetgent
  };
})();

// Export functions to global scope for Python bridge compatibility
window.spawngent = window.GameAPI.spawngent;
window.spawnplayer = window.GameAPI.spawnplayer;
window.moveleft = window.GameAPI.moveleft;
window.moveright = window.GameAPI.moveright;
window.jump = window.GameAPI.jump;
window.stop = window.GameAPI.stop;
window.getrays = window.GameAPI.getrays;
window.getplayerstate = window.GameAPI.getplayerstate;
window.getlandingstate = window.GameAPI.getlandingstate;
window.getlevelstate = window.GameAPI.getlevelstate;
window.getworldstate = window.GameAPI.getworldstate;
window.getagents = window.GameAPI.getagents;
window.killgent = window.GameAPI.killgent;
window.resetgent = window.GameAPI.resetgent;

// Backwards compatibility with existing Python bridge names
// These match the calling convention: goleft(agentId, active)
window.goleft = function(agentId, active) {
  return window.moveleft(agentId, active);
};
window.goright = function(agentId, active) {
  return window.moveright(agentId, active);
};
window.holdjump = function(agentId, active) {
  return window.jump(agentId, active);
};


window.checkrays = function(agentId = 0, rayCount = 360, maxDistance = 1200) {
  if (!window.RaycastAPI || typeof window.RaycastAPI.debugRaySummary !== 'function') return { ok: false, count: 0 };
  return window.RaycastAPI.debugRaySummary(agentId, rayCount, maxDistance);
};
