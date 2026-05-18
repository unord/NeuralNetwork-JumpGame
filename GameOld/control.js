window.GameControl = (() => {
  const agentStates = new Map();

  function ensureState(agentId = 0) {
    const id = Number.isFinite(Number(agentId)) ? Number(agentId) : 0;
    if (!agentStates.has(id)) {
      agentStates.set(id, {
        left: false,
        right: false,
        jumpHeld: false,
        jumpJustPressed: false,
        jumpJustReleased: false
      });
    }
    return agentStates.get(id);
  }

  function goleft(active = true, agentId = 0) {
    const state = ensureState(agentId);
    const isActive = Boolean(active);
    state.left = isActive;
    if (isActive) state.right = false;
  }

  function goright(active = true, agentId = 0) {
    const state = ensureState(agentId);
    const isActive = Boolean(active);
    state.right = isActive;
    if (isActive) state.left = false;
  }

  function holdjump(active = true, agentId = 0) {
    const state = ensureState(agentId);
    const isActive = Boolean(active);

    if (isActive && !state.jumpHeld) state.jumpJustPressed = true;
    if (!isActive && state.jumpHeld) state.jumpJustReleased = true;

    state.jumpHeld = isActive;
  }

  function spawnplayer() {
    if (window.GameRuntime && typeof window.GameRuntime.spawnPlayer === 'function') {
      return window.GameRuntime.spawnPlayer();
    }
    return -1;
  }

  function getState(agentId = 0) {
    return ensureState(agentId);
  }

  function consumeJumpEdges(agentId = 0) {
    const state = ensureState(agentId);
    const edges = {
      jumpJustPressed: state.jumpJustPressed,
      jumpJustReleased: state.jumpJustReleased
    };

    state.jumpJustPressed = false;
    state.jumpJustReleased = false;

    return edges;
  }

  return {
    goleft,
    goright,
    holdjump,
    spawnplayer,
    getState,
    consumeJumpEdges
  };
})();

window.goleft = window.GameControl.goleft;
window.goright = window.GameControl.goright;
window.holdjump = window.GameControl.holdjump;
window.spawnplayer = window.GameControl.spawnplayer;
