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

    def set_map_seed(self, seed: int) -> None:
        """Set the seed for map generation to ensure consistent levels."""
        self.driver.execute_script(
            "if (window.GameConfig) { window.GameConfig.seed = arguments[0]; } "
            "if (window.MapGenerator && window.MapGenerator.setSeed) { window.MapGenerator.setSeed(arguments[0]); }",
            int(seed),
        )

    def spawnplayer(self) -> int:
        return int(self.driver.execute_script("return window.spawnplayer();"))

    
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
        # Release all controls for the given agent
        self.goleft(agent_id, False)
        self.goright(agent_id, False)
        self.holdjump(agent_id, False)

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

    def get_rays(self, agent_id: int, ray_count: int = 8, max_distance: float = 900) -> list:
        """Get ray data for agent: list of [angle_rad, distance, object_type]"""
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

