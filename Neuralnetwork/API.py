from __future__ import annotations

import random

from selenium import webdriver


"""API for controlling the game through JavaScript."""
class GameAPI:
    def __init__(self, driver: webdriver.Chrome):
        self.driver = driver

    def set_nn_mode(self, dev_debug: bool = False) -> None:
        self.driver.execute_script(
            "if (window.GameRuntime && window.GameRuntime.setAIPlaying) { "
            "window.GameRuntime.setAIPlaying(true, arguments[0]); "
            "} else { "
            "window.GameConfig.aiPlaying = true; "
            "window.GameConfig.playerControlled = false; "
            "window.GameConfig.devDebug = Boolean(arguments[0]); "
            "}",
            bool(dev_debug),
        )

    def set_debug_rays(
        self,
        draw_all_agents: bool = True,
        ray_count: int = 72,
        max_distance: float = 1200,
        draw_hit_markers: bool = True,
        hit_marker_radius: float = 2,
    ) -> None:
        self.driver.execute_script(
            "if (!window.GameConfig) { window.GameConfig = {}; } "
            "window.GameConfig.drawAllAgentRays = Boolean(arguments[0]); "
            "window.GameConfig.debugRayCount = Number(arguments[1]); "
            "window.GameConfig.debugRayMaxDistance = Number(arguments[2]); "
            "window.GameConfig.drawRayHitMarkers = Boolean(arguments[3]); "
            "window.GameConfig.rayHitMarkerRadius = Number(arguments[4]);",
            bool(draw_all_agents),
            int(ray_count),
            float(max_distance),
            bool(draw_hit_markers),
            float(hit_marker_radius),
        )

    def set_map_seed(self, seed: int) -> None:
        """Set the seed for map generation to ensure consistent levels."""
        self.driver.execute_script(
            "if (window.GameConfig) { window.GameConfig.seed = arguments[0]; } "
            "if (window.MapGenerator && window.MapGenerator.setSeed) { window.MapGenerator.setSeed(arguments[0]); }",
            int(seed),
        )

    def spawnplayer(self) -> int:
        return int(self.driver.execute_script("return window.spawnplayer();"))

    def spawngent(self, x: int = 900, y: int = None) -> int:
        """Spawn a new AI agent at the specified position. Returns the agent ID."""
        script = """
            const x = arguments[0];
            const y = arguments[1];

            const candidates = [
                window.spawngent,
                window.GameAPI && window.GameAPI.spawngent,
                window.GameRuntime && window.GameRuntime.spawnPlayer,
            ];

            for (const fn of candidates) {
                if (typeof fn === 'function') {
                    return y === null ? fn(x) : fn(x, y);
                }
            }

            return -1;
        """
        if y is None:
            return int(self.driver.execute_script(script, int(x), None))
        return int(self.driver.execute_script(script, int(x), int(y)))
    
    def goleft(self, agent_id: int, active: bool = True) -> None:
        self.driver.execute_script(
            "window.goleft(arguments[0], arguments[1]);",
            int(agent_id),
            bool(active),
        )

    def goright(self, agent_id: int, active: bool = True) -> None:
        self.driver.execute_script(
            "window.goright(arguments[0], arguments[1]);",
            int(agent_id),
            bool(active),
        )

    def holdjump(self, agent_id: int, active: bool = True) -> None:
        self.driver.execute_script(
            "window.holdjump(arguments[0], arguments[1]);",
            int(agent_id),
            bool(active),
        )

    def release_agent(self, agent_id: int) -> None:
        """Release controls and remove spawned AI agents so old generations do not accumulate."""
        try:
            self.goleft(agent_id, False)
            self.goright(agent_id, False)
            self.holdjump(agent_id, False)
        except Exception:
            pass

        # Agent 0 is the original player; spawned training agents should be deleted.
        try:
            self.driver.execute_script(
                "if (window.killgent) { return window.killgent(arguments[0]); } return false;",
                int(agent_id),
            )
        except Exception:
            pass

    def random_step(self, agent_id: int) -> None:
        direction = random.random()

        if direction < 0.33:
            self.goleft(agent_id, True)
            self.goright(agent_id, False)
        elif direction < 0.66:
            self.goright(agent_id, True)
            self.goleft(agent_id, False)
        else:
            self.goleft(agent_id, False)
            self.goright(agent_id, False)

        if random.random() < 0.18:
            self.holdjump(agent_id, True)
        if random.random() < 0.22:
            self.holdjump(agent_id, False)

    def get_rays(self, agent_id: int, ray_count: int = 360, max_distance: float = 1200) -> list:
        """Get ray data for agent: list of [angle_rad, distance, hit_x, hit_y]."""
        result = self.driver.execute_script(
            "return window.getrays(arguments[0], arguments[1], arguments[2]);",
            int(agent_id),
            int(ray_count),
            float(max_distance),
        )
        return result if result is not None else []

    def get_player_state(self, agent_id: int) -> dict | None:
        """Return the raw player state dictionary from the browser for the given agent id."""
        try:
            state = self.driver.execute_script(
                "return window.getplayerstate(arguments[0]);",
                int(agent_id),
            )
            return state
        except Exception:
            return None


    def get_landing_state(self, agent_id: int) -> dict | None:
        """Return platform/landing state for the given agent."""
        try:
            state = self.driver.execute_script(
                "return window.getlandingstate ? window.getlandingstate(arguments[0]) : null;",
                int(agent_id),
            )
            return state
        except Exception:
            return None

    def getlevelstate(self) -> dict | None:
        """Return the current level state, including ordered landing surfaces."""
        try:
            state = self.driver.execute_script("return window.getlevelstate ? window.getlevelstate() : null;")
            return state
        except Exception:
            return None

    def get_agent_score(self, agent_id: int) -> float:
        """Get the agent's height score (how high they got)"""
        try:
            state = self.driver.execute_script(
                "return window.getplayerstate(arguments[0]);",
                int(agent_id),
            )
            if state is None:
                return 0.0
            # Prefer explicit per-agent score if available
            if isinstance(state, dict):
                if "score" in state:
                    return float(state.get("score", 0))
                # Fallback to y position as inverse height (lower y => higher)
                if "y" in state:
                    # Convert to a positive score relative to canvas bottom
                    try:
                        return float(max(0, -state.get("y", 0)))
                    except Exception:
                        return 0.0
            try:
                return float(state)
            except Exception:
                return 0.0
        except Exception as e:
            # Fallback: return 0 if we can't get the score
            return 0.0

    def reset_map(self) -> None:
        """Force the MapGenerator to re-initialize platforms using the current seed."""
        try:
            self.driver.execute_script(
                "if (window.MapGenerator && window.MapGenerator.initPlatforms && window.mapState) { window.MapGenerator.initPlatforms(window.mapState); }"
            )
        except Exception:
            # ignore errors; map reset is best-effort
            pass

    def check_game_state(self) -> dict:
        """Check current game state for debugging."""
        try:
            return self.driver.execute_script("""
                return {
                    agents_count: (typeof agents !== 'undefined' ? Object.keys(agents).length : 0),
                    currentLevelIndex: (typeof currentLevelIndex !== 'undefined' ? currentLevelIndex : null),
                    hasLevels: (typeof levels !== 'undefined' && levels.length > 0),
                    player_exists: (typeof player !== 'undefined' && player !== null),
                    agent_0_state: window.getplayerstate ? window.getplayerstate(0) : null,
                    agent_0_controls: (typeof agentControls !== 'undefined' && agentControls[0]) ? agentControls[0] : null,
                    config: (typeof window.GameConfig !== 'undefined' ? window.GameConfig : null)
                };
            """)
        except Exception as e:
            return {"error": str(e)}

    def check_rays(self, agent_id: int = 0) -> list:
        """Check if rays are working."""
        try:
            rays = self.driver.execute_script(
                "return window.getrays(arguments[0], 360, 1200);",
                int(agent_id),
            )
            return rays if rays else []
        except Exception as e:
            print(f"Error getting rays: {e}")
            return []

