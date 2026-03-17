from __future__ import annotations

import random
import time
from dataclasses import dataclass

from selenium import webdriver
from selenium.webdriver.common.by import By

from nn_config import AGENT_COUNT, EPISODE_SECONDS, GAME_URL, TICK_SECONDS


@dataclass
class GameAPI:
    driver: webdriver.Chrome

    def set_nn_mode(self) -> None:
        self.driver.execute_script(
            "if (window.GameRuntime && window.GameRuntime.setAIPlaying) { window.GameRuntime.setAIPlaying(true); } else { window.GameConfig.aiPlaying = true; window.GameConfig.playerControlled = false; }"
        )

    def spawnplayer(self) -> int:
        return int(self.driver.execute_script("return window.spawnplayer();"))

    def goleft(self, agent_id: int, active: bool = True) -> None:
        self.driver.execute_script("window.goleft(arguments[0], arguments[1]);", bool(active), int(agent_id))

    def goright(self, agent_id: int, active: bool = True) -> None:
        self.driver.execute_script("window.goright(arguments[0], arguments[1]);", bool(active), int(agent_id))

    def holdjump(self, agent_id: int, active: bool = True) -> None:
        self.driver.execute_script("window.holdjump(arguments[0], arguments[1]);", bool(active), int(agent_id))

    def release_agent(self, agent_id: int) -> None:
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


def build_session() -> tuple[webdriver.Chrome, GameAPI]:
    driver = webdriver.Chrome()
    driver.get(GAME_URL)

    canvas = driver.find_element(By.ID, "game")
    canvas.click()

    api = GameAPI(driver)
    api.set_nn_mode()
    return driver, api


if __name__ == "__main__":
    driver: webdriver.Chrome | None = None
    api: GameAPI | None = None
    agent_ids: list[int] = [0]

    try:
        driver, api = build_session()

        for _ in range(max(0, AGENT_COUNT - 1)):
            agent_ids.append(api.spawnplayer())

        end_at = time.time() + EPISODE_SECONDS
        while time.time() < end_at:
            for agent_id in agent_ids:
                api.random_step(agent_id)
            time.sleep(TICK_SECONDS)
    finally:
        if api is not None:
            for agent_id in agent_ids:
                api.release_agent(agent_id)
        if driver is not None:
            driver.quit()
