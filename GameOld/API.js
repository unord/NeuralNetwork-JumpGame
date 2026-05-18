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

  function spawnplayer() {
    if (!window.GameControl || typeof window.GameControl.spawnplayer !== 'function') return -1;
    return window.GameControl.spawnplayer();
  }

  function moveleft(agentId = 0, hold = 1) {
    if (!window.GameControl || typeof window.GameControl.goleft !== 'function') return false;
    window.GameControl.goleft(toHoldState(hold), toAgentId(agentId));
    return true;
  }

  function moveright(agentId = 0, hold = 1) {
    if (!window.GameControl || typeof window.GameControl.goright !== 'function') return false;
    window.GameControl.goright(toHoldState(hold), toAgentId(agentId));
    return true;
  }

  function jump(agentId = 0, hold = 1) {
    if (!window.GameControl || typeof window.GameControl.holdjump !== 'function') return false;
    window.GameControl.holdjump(toHoldState(hold), toAgentId(agentId));
    return true;
  }

  function stop(agentId = 0) {
    moveleft(agentId, 0);
    moveright(agentId, 0);
    jump(agentId, 0);
    return true;
  }

  function getplayerstate(agentId = 0) {
    if (!window.GameRuntime || typeof window.GameRuntime.getPlayerState !== 'function') return null;
    return window.GameRuntime.getPlayerState(toAgentId(agentId));
  }

  function getrays(agentId = 0, rayCount = 8, maxDistance = 900) {
    if (!window.RaycastAPI || typeof window.RaycastAPI.castRays !== 'function') return [];
    return window.RaycastAPI.castRays(toAgentId(agentId), Number(rayCount), Number(maxDistance));
  }

  return {
    spawnplayer,
    moveleft,
    moveright,
    jump,
    stop,
    getplayerstate,
    getrays
  };
})();

window.spawnplayer = window.GameAPI.spawnplayer;
window.moveleft = window.GameAPI.moveleft;
window.moveright = window.GameAPI.moveright;
window.jump = window.GameAPI.jump;
window.getrays = window.GameAPI.getrays;
window.getplayerstate = window.GameAPI.getplayerstate;

// Backwards compatibility with existing Python bridge names.
window.goleft = window.GameAPI.moveleft;
window.goright = window.GameAPI.moveright;
window.holdjump = window.GameAPI.jump;