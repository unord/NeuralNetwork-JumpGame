from __future__ import annotations

import math


class Score:
    def __init__(self):
        self.value = 0
        self.frames_alive = 0
        self.last_platform = None
        self.target_platform = None
        self.last_distance = None
        self.safe_timer = 0

    def reset(self, player):
        self.value = 0
        self.frames_alive = 0
        self.last_platform = None
        self.target_platform = None
        self.last_distance = None
        self.safe_timer = 0

    def _platform_left(self, platform):
        return getattr(platform, "left", None) if not isinstance(platform, dict) else platform.get("left")

    def _platform_right(self, platform):
        return getattr(platform, "right", None) if not isinstance(platform, dict) else platform.get("right")

    def _platform_top(self, platform):
        if isinstance(platform, dict):
            if "top" in platform:
                return platform.get("top")
            return platform.get("y")
        return getattr(platform, "top", getattr(platform, "y", None))

    def _platform_center_x(self, platform):
        left = self._platform_left(platform)
        right = self._platform_right(platform)
        if left is None or right is None:
            return None
        return (float(left) + float(right)) / 2.0

    def _platform_key(self, platform):
        if platform is None:
            return None
        if isinstance(platform, dict):
            return (
                platform.get("platformIndex"),
                platform.get("platformRank"),
                platform.get("left"),
                platform.get("right"),
                platform.get("top", platform.get("y")),
            )
        return id(platform)

    def _is_same_platform(self, left, right):
        return self._platform_key(left) == self._platform_key(right)

    def update(self, player, current_platform=None, next_platform=None):
        self.frames_alive += 1

        # tiny alive reward so standing is not completely useless,
        # but not enough to become the best strategy
        self.value += 0.01

        if next_platform is None:
            return self.value

        # lock target until reached
        if self.target_platform is None:
            self.target_platform = next_platform

        # DO NOT reward height by itself anymore
        # This prevents agents from trying to jump to platform 2 first.

        px = float(getattr(player, "x", 0.0))
        py = float(getattr(player, "y", 0.0))

        target_x = self._platform_center_x(self.target_platform)
        target_y = self._platform_top(self.target_platform)
        if target_x is None or target_y is None:
            return self.value

        distance = math.dist((px, py), (float(target_x), float(target_y)))

        if self.last_distance is not None:
            improvement = self.last_distance - distance

            # reward moving closer to the CURRENT target platform only
            self.value += improvement * 1.5

        self.last_distance = distance

        # reward being under / near the target horizontally
        horizontal_distance = abs(px - float(target_x))
        self.value += max(0, 200 - horizontal_distance) * 0.02

        # reward jumping only when grounded and not already flying randomly
        if getattr(player, "on_ground", False):
            self.value += 0.2

        # reached correct next platform
        if self._is_same_platform(current_platform, self.target_platform):
            self.value += 500

            self.last_platform = current_platform
            self.target_platform = next_platform
            self.last_distance = None
            self.safe_timer = 25

        # reward staying after landing
        if self.safe_timer > 0:
            self.safe_timer -= 1

            if getattr(player, "on_ground", False):
                self.value += 3

            if not getattr(player, "on_ground", False) and getattr(player, "vel_y", 0) > 1:
                self.value -= 200
                self.safe_timer = 0

        # punish falling/death hard
        if getattr(player, "dead", False):
            self.value -= 300

        return self.value


def calculate_score(player, current_platform=None, next_platform=None):
    if not hasattr(player, "score_tracker") or player.score_tracker is None:
        player.score_tracker = Score()
        player.score_tracker.reset(player)

    return player.score_tracker.update(
        player,
        current_platform=current_platform,
        next_platform=next_platform,
    )
