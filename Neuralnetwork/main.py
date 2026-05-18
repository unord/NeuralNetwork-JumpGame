from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import deque
from types import SimpleNamespace

import numpy as np

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.common.exceptions import NoSuchWindowException, WebDriverException

import nn_config as cfg
from API import GameAPI
from Neuralnetwork import NeuralNetwork, normalize_ray_data, flatten_rays
from score import calculate_score


# Core config
TICK_SECONDS = cfg.TICK_SECONDS
EPISODE_SECONDS = cfg.EPISODE_SECONDS
GAME_URL = cfg.GAME_URL
dev_debug = cfg.dev_debug
DRAW_ALL_AGENT_RAYS = getattr(cfg, "DRAW_ALL_AGENT_RAYS", True)
DEBUG_RAY_COUNT = getattr(cfg, "DEBUG_RAY_COUNT", 72)
DEBUG_RAY_MAX_DISTANCE = getattr(cfg, "DEBUG_RAY_MAX_DISTANCE", 1200)
DRAW_RAY_HIT_MARKERS = getattr(cfg, "DRAW_RAY_HIT_MARKERS", True)
RAY_HIT_MARKER_RADIUS = getattr(cfg, "RAY_HIT_MARKER_RADIUS", 2)

RAY_COUNT = cfg.RAY_COUNT
RAY_MAX_DISTANCE = cfg.RAY_MAX_DISTANCE
RAY_FEATURES_PER_RAY = cfg.RAY_FEATURES_PER_RAY

GENERATIONS = cfg.GENERATIONS
GAME_SEED = cfg.GAME_SEED

POPULATION_SIZE = cfg.POPULATION_SIZE
MUTATION_RATE = cfg.MUTATION_RATE
MUTATION_MAGNITUDE = cfg.MUTATION_MAGNITUDE
ELITE_KEEP_RATE = cfg.ELITE_KEEP_RATE
RANDOM_INJECT_RATE = cfg.RANDOM_INJECT_RATE
HALL_OF_FAME_KEEP = getattr(cfg, "HALL_OF_FAME_KEEP", True)


GROUND_RAY_MAX_DISTANCE = getattr(cfg, "GROUND_RAY_MAX_DISTANCE", 1200.0)
GROUNDED_DISTANCE_TOLERANCE = getattr(cfg, "GROUNDED_DISTANCE_TOLERANCE", 6.0)
EXTRA_AGENT_FEATURES = 12
PLAYER_START_Y = getattr(cfg, "PLAYER_START_Y", 2333)


# Jump in this game is charge/release based. Holding jump forever can produce
# very few useful jumps, and a random fresh population may never request jump.
# These settings convert NN/exploration jump requests into actual press/release pulses.
JUMP_HOLD_TICKS = getattr(cfg, "JUMP_HOLD_TICKS", 18)
JUMP_RELEASE_TICKS = getattr(cfg, "JUMP_RELEASE_TICKS", 4)
EXPLORATION_JUMP_PERIOD_TICKS = getattr(cfg, "EXPLORATION_JUMP_PERIOD_TICKS", 55)
EXPLORATION_JUMP_SPREAD_TICKS = getattr(cfg, "EXPLORATION_JUMP_SPREAD_TICKS", 23)


def create_random_network(input_size: int) -> NeuralNetwork:
    return NeuralNetwork(
        input_size=input_size,
        hidden_size=128,
        output_size=4,
        learning_rate=0.01,
    )


def sigmoid(value: np.ndarray | float) -> np.ndarray | float:
    return 1.0 / (1.0 + np.exp(-value))


def decode_action(logits: np.ndarray, agent_id: int = 0) -> np.ndarray:
    """
    Deterministic action decoder with explicit do-nothing option and continuous jump charge.

    Mutation/random injection provide exploration.
    Evaluation itself should be stable, so a good strategy does not disappear
    just because action sampling was unlucky.
    
    Returns:
        [left, right, jump_charge] where jump_charge is 0.0-1.0 representing
        how long to hold jump (0=no jump, 1.0=max charge).
    """
    left_logit = float(logits[0])
    right_logit = float(logits[1])
    do_nothing_logit = float(logits[2])
    jump_logit = float(logits[3])

    left = 0
    right = 0

    # Pick the highest logit among left, right, and do_nothing
    max_movement_logit = max(left_logit, right_logit, do_nothing_logit)
    
    if max_movement_logit == left_logit and left_logit > 0:
        left = 1
    elif max_movement_logit == right_logit and right_logit > 0:
        right = 1
    # else: do_nothing is selected (both left and right stay 0)

    # Continuous jump charge: sigmoid maps logit to 0-1 range
    # This allows the network to vary jump duration based on the input
    jump_charge = float(sigmoid(jump_logit))

    return np.array([left, right, jump_charge], dtype=float)


def build_session(
    window_x: int = 0,
    window_y: int = 0,
    window_width: int = 960,
    window_height: int = 540,
) -> tuple[webdriver.Chrome, GameAPI]:
    driver = webdriver.Chrome()
    driver.get(GAME_URL)
    driver.set_window_rect(
        x=int(window_x),
        y=int(window_y),
        width=int(window_width),
        height=int(window_height),
    )
    time.sleep(3)

    max_retries = 30

    for attempt in range(max_retries):
        try:
            check_result = driver.execute_script(
                """
                return {
                    hasCanvas: document.getElementById('game') !== null,
                    hasGameConfig: typeof window.GameConfig !== 'undefined',
                    hasGameRuntime: typeof window.GameRuntime !== 'undefined',
                    hasGameAPI: typeof window.GameAPI !== 'undefined',
                    hasRaycastAPI: typeof window.RaycastAPI !== 'undefined',
                    hasGetRays: typeof window.getrays === 'function',
                    hasCheckRays: typeof window.checkrays === 'function',
                    hasGoLeft: typeof window.goleft === 'function',
                    hasGoRight: typeof window.goright === 'function',
                    hasJump: typeof window.holdjump === 'function',
                    hasPlayerState: typeof window.getplayerstate === 'function',
                    hasLevels: typeof levels !== 'undefined' && levels.length > 0,
                    hasPlayer: typeof player !== 'undefined' && player !== null,
                    raySummary: window.checkrays ? window.checkrays(0, 16, 1200) : null
                };
                """
            )

            if attempt % 5 == 0:
                summary = check_result.get("raySummary") or {}
                print(
                    f"  Attempt {attempt + 1}: "
                    f"GameConfig={check_result.get('hasGameConfig')}, "
                    f"GameRuntime={check_result.get('hasGameRuntime')}, "
                    f"RaycastAPI={check_result.get('hasRaycastAPI')}, "
                    f"rays={summary.get('count', 0)}, "
                    f"levels={check_result.get('hasLevels')}, "
                    f"player={check_result.get('hasPlayer')}"
                )

            if (
                check_result.get("hasCanvas")
                and check_result.get("hasGameConfig")
                and check_result.get("hasGameRuntime")
                and check_result.get("hasGameAPI")
                and check_result.get("hasRaycastAPI")
                and check_result.get("hasGetRays")
                and check_result.get("hasCheckRays")
                and check_result.get("hasGoLeft")
                and check_result.get("hasGoRight")
                and check_result.get("hasJump")
                and check_result.get("hasPlayerState")
                and check_result.get("hasLevels")
                and check_result.get("hasPlayer")
                and (check_result.get("raySummary") or {}).get("ok")
            ):
                print(f"✓ Game API + raycast loaded (attempt {attempt + 1})")
                break

        except Exception as e:
            print(f"  Loading game... attempt {attempt + 1}: {str(e)[:100]}")

        if attempt == max_retries - 1:
            raise RuntimeError(f"Game API/raycast failed to load from {GAME_URL}.")

        time.sleep(1)

    canvas = driver.find_element(By.ID, "game")
    canvas.click()

    api = GameAPI(driver)
    api.set_nn_mode(dev_debug=dev_debug)

    return driver, api


def safe_state(api: GameAPI, agent_id: int) -> dict:
    try:
        state = api.get_player_state(agent_id)
        return state if isinstance(state, dict) else {}
    except Exception:
        return {}


def state_x(state: dict, fallback: float = 0.0) -> float:
    try:
        return float(state.get("x", fallback))
    except Exception:
        return fallback


def state_y(state: dict, fallback: float = 0.0) -> float:
    try:
        return float(state.get("y", fallback))
    except Exception:
        return fallback


def clear_extra_agents(api: GameAPI) -> None:
    """
    Remove all spawned training agents from previous generations.
    Keeps player/agent 0 alive.
    """
    try:
        api.driver.execute_script(
            """
            if (window.getagents && window.killgent) {
                for (const id of window.getagents()) {
                    if (Number(id) !== 0) {
                        window.killgent(Number(id));
                    }
                }
            }
            """
        )
    except Exception:
        pass


def get_downward_ray_distance(
    api: GameAPI,
    agent_id: int,
    max_distance: float = GROUND_RAY_MAX_DISTANCE,
) -> float | None:
    """
    Downward-ground probe based on a direct downward ray.

    We request 4 rays: angles [0, pi/2, pi, 3pi/2]. In canvas coordinates,
    +Y is down, so index 1 (pi/2) is straight downward.
    """
    try:
        rays = api.get_rays(agent_id, 4, max_distance)
    except Exception:
        return None

    if not rays or len(rays) < 2:
        return None

    down_ray = rays[1]
    if not isinstance(down_ray, (list, tuple)) or len(down_ray) < 2:
        return None

    try:
        return float(down_ray[1])
    except Exception:
        return None


def safe_float(value: object, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(fallback)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def platform_left(platform: dict | object | None) -> float | None:
    if platform is None:
        return None
    if isinstance(platform, dict):
        value = platform.get("left", platform.get("x1"))
    else:
        value = getattr(platform, "left", getattr(platform, "x1", None))
    return safe_float(value) if value is not None else None


def platform_right(platform: dict | object | None) -> float | None:
    if platform is None:
        return None
    if isinstance(platform, dict):
        value = platform.get("right", platform.get("x2"))
    else:
        value = getattr(platform, "right", getattr(platform, "x2", None))
    return safe_float(value) if value is not None else None


def platform_top(platform: dict | object | None) -> float | None:
    if platform is None:
        return None
    if isinstance(platform, dict):
        value = platform.get("top", platform.get("y", platform.get("y1")))
    else:
        value = getattr(platform, "top", getattr(platform, "y", getattr(platform, "y1", None)))
    return safe_float(value) if value is not None else None


def platform_center_x(platform: dict | object | None) -> float | None:
    left = platform_left(platform)
    right = platform_right(platform)
    if left is None or right is None:
        return None
    return (left + right) / 2.0


def platform_key(platform: dict | object | None) -> tuple | None:
    if platform is None:
        return None
    if isinstance(platform, dict):
        return (
            platform.get("platformIndex"),
            platform.get("platformRank"),
            platform.get("left", platform.get("x1")),
            platform.get("right", platform.get("x2")),
            platform.get("top", platform.get("y", platform.get("y1"))),
        )
    return id(platform)


def same_platform(left: dict | object | None, right: dict | object | None) -> bool:
    return platform_key(left) == platform_key(right)


def get_ordered_platforms(level_state: dict | None) -> list[dict]:
    if not isinstance(level_state, dict):
        return []
    platforms = level_state.get("landingSurfaces", []) or []
    return list(platforms)


def get_platform_by_index(platforms: list[dict], index: int | None) -> dict | None:
    if index is None:
        return None
    try:
        idx = int(index)
    except Exception:
        return None
    if 0 <= idx < len(platforms):
        return platforms[idx]
    return None


def get_next_platform(platforms: list[dict], current_platform: dict | None) -> dict | None:
    if not platforms:
        return None

    current_index = None
    if current_platform is not None:
        current_index = current_platform.get("platformIndex")
        if current_index is None:
            current_rank = current_platform.get("platformRank")
            if current_rank is not None:
                for idx, platform in enumerate(platforms):
                    if platform.get("platformRank") == current_rank:
                        current_index = idx
                        break

    if current_index is None:
        return platforms[0] if len(platforms) > 0 else None

    next_index = int(current_index) + 1
    if 0 <= next_index < len(platforms):
        return platforms[next_index]
    return None


def build_agent_features(
    api: GameAPI,
    agent_id: int,
    state: dict,
    score_state,
    grounded: bool,
    downward_distance: float | None,
    current_platform: dict | None,
    next_platform: dict | None,
) -> np.ndarray:
    landing = state.get("landing", {}) if isinstance(state, dict) else {}
    grounded_value = 1.0 if grounded else 0.0
    vx = safe_float(state.get("vx", 0.0))
    vy = safe_float(state.get("vy", 0.0))
    jump_charge = safe_float(state.get("jumpCharge", 0.0))
    current_y = safe_float(state.get("y", PLAYER_START_Y))
    start_y = safe_float(getattr(score_state, "start_y", current_y))

    down_norm = clamp(safe_float(downward_distance, GROUND_RAY_MAX_DISTANCE) / GROUND_RAY_MAX_DISTANCE, 0.0, 1.0)
    vx_norm = clamp(vx / 24.0, -1.0, 1.0)
    vy_norm = clamp(vy / 24.0, -1.0, 1.0)
    height_gain_norm = clamp(max(0.0, start_y - current_y) / GROUND_RAY_MAX_DISTANCE, 0.0, 1.0)
    landing_on = 1.0 if bool(landing.get("onPlatform", False)) else 0.0

    surface_x1 = safe_float(landing.get("surfaceX1", 0.0))
    surface_x2 = safe_float(landing.get("surfaceX2", 0.0))
    player_x = safe_float(state.get("x", 0.0))
    player_w = max(1.0, safe_float(state.get("w", 42.0), 42.0))

    left_edge_distance = 0.0
    right_edge_distance = 0.0
    if landing_on and surface_x2 > surface_x1:
        left_edge_distance = clamp((player_x - surface_x1) / GROUND_RAY_MAX_DISTANCE, -1.0, 1.0)
        right_edge_distance = clamp((surface_x2 - (player_x + player_w)) / GROUND_RAY_MAX_DISTANCE, -1.0, 1.0)

    current_center_x = platform_center_x(current_platform)
    current_top = platform_top(current_platform)
    next_center_x = platform_center_x(next_platform)
    next_top = platform_top(next_platform)

    current_dx = 0.0
    current_dy = 0.0
    next_dx = 0.0
    next_dy = 0.0

    if current_center_x is not None and current_top is not None:
        current_dx = clamp((current_center_x - player_x) / GROUND_RAY_MAX_DISTANCE, -1.0, 1.0)
        current_dy = clamp((current_top - current_y) / GROUND_RAY_MAX_DISTANCE, -1.0, 1.0)

    if next_center_x is not None and next_top is not None:
        next_dx = clamp((next_center_x - player_x) / GROUND_RAY_MAX_DISTANCE, -1.0, 1.0)
        next_dy = clamp((next_top - current_y) / GROUND_RAY_MAX_DISTANCE, -1.0, 1.0)

    on_target_platform = 1.0 if same_platform(current_platform, next_platform) else 0.0

    return np.array(
        [
            vx_norm,
            vy_norm,
            grounded_value,
            down_norm,
            current_dx,
            current_dy,
            next_dx,
            next_dy,
            left_edge_distance,
            right_edge_distance,
            clamp(jump_charge / 100.0, 0.0, 1.0),
            on_target_platform,
        ],
        dtype=np.float32,
    )




def get_training_spawn(api: GameAPI, x: int = 900) -> tuple[int, int]:
    """
    Spawn at a fixed training start Y.

    This is intentionally simple now: the game starts all agents at the same
    calibrated Y position, and the scorer/observations handle progression.
    """
    return int(x), int(PLAYER_START_Y)


def prepare_game_for_generation(api: GameAPI) -> None:
    clear_extra_agents(api)

    try:
        api.set_map_seed(GAME_SEED)
    except Exception:
        pass

    try:
        api.reset_map()
    except Exception:
        pass

    try:
        api.spawnplayer()
    except Exception:
        pass

    try:
        api.set_nn_mode(dev_debug=dev_debug)
    except Exception:
        pass

    try:
        api.set_debug_rays(
            draw_all_agents=DRAW_ALL_AGENT_RAYS,
            ray_count=DEBUG_RAY_COUNT,
            max_distance=DEBUG_RAY_MAX_DISTANCE,
            draw_hit_markers=DRAW_RAY_HIT_MARKERS,
            hit_marker_radius=RAY_HIT_MARKER_RADIUS,
        )
    except Exception:
        pass


def run_generation(
    api: GameAPI,
    population: list[NeuralNetwork],
    episode_seconds: float,
) -> tuple[list[tuple[NeuralNetwork, float]], list[dict]]:
    prepare_game_for_generation(api)

    agent_ids: list[int] = []

    spawn_x, spawn_y = get_training_spawn(api, x=900)
    print(f"  Spawning agents at x={spawn_x}, y={spawn_y}")

    for _ in population:
        agent_ids.append(api.spawngent(x=spawn_x, y=spawn_y))

    per_agent_data = [
        {
            "rays": [],
            "actions": [],
            "timesteps": 0,
            "final_score": 0.0,
            "grounded_events": [],
        }
        for _ in population
    ]

    level_state = api.getlevelstate() or {}
    ordered_platforms = get_ordered_platforms(level_state)
    player_proxies: list[SimpleNamespace] = []
    grounded_counts = [0 for _ in population]
    baseline_ground_distances = [GROUND_RAY_MAX_DISTANCE for _ in population]

    # Per-agent jump pulse state. The game needs jump to be held briefly and
    # then released. This also gives generation 1 enough exploration to produce
    # non-zero Y scores.
    jump_hold_ticks = [0 for _ in population]
    jump_release_ticks = [0 for _ in population]
    jump_requests_seen = [0 for _ in population]
    jump_pulses_sent = [0 for _ in population]

    for idx, agent_id in enumerate(agent_ids):
        st0 = safe_state(api, agent_id)
        for _ in range(20):
            if st0 and float(st0.get("y", 0.0)) > 0.0:
                break
            time.sleep(0.05)
            st0 = safe_state(api, agent_id)

        start_agent_y = state_y(st0, 0.0)
        baseline_ground_distance = get_downward_ray_distance(
            api,
            agent_id,
            max_distance=GROUND_RAY_MAX_DISTANCE,
        )
        if baseline_ground_distance is None:
            baseline_ground_distance = GROUND_RAY_MAX_DISTANCE

        baseline_ground_distances[idx] = baseline_ground_distance

        landing = st0.get("landing", {}) if st0 else {}
        platform_index = landing.get("platformIndex")
        current_platform = get_platform_by_index(ordered_platforms, platform_index)
        if current_platform is None and ordered_platforms:
            current_platform = ordered_platforms[0]

        next_platform = get_next_platform(ordered_platforms, current_platform)

        proxy = SimpleNamespace(
            x=state_x(st0, 0.0),
            y=start_agent_y,
            w=safe_float(st0.get("w", 42.0) if st0 else 42.0, 42.0),
            h=safe_float(st0.get("h", 70.0) if st0 else 70.0, 70.0),
            vx=safe_float(st0.get("vx", 0.0) if st0 else 0.0, 0.0),
            vy=safe_float(st0.get("vy", 0.0) if st0 else 0.0, 0.0),
            on_ground=False,
            vel_y=safe_float(st0.get("vy", 0.0) if st0 else 0.0, 0.0),
            dead=False,
            platform_index=platform_index if platform_index is not None else 0,
            score_tracker=None,
        )
        calculate_score(proxy, current_platform=current_platform, next_platform=next_platform)
        player_proxies.append(proxy)

        print(
            f"    Agent {idx + 1} baseline ground distance: "
            f"{baseline_ground_distance:.2f} "
            f"(grounded<= {baseline_ground_distance + GROUNDED_DISTANCE_TOLERANCE:.2f})"
        )

    end_at = time.time() + episode_seconds
    tick = 0

    while time.time() < end_at:
        tick += 1
        for idx, agent_id in enumerate(agent_ids):
            nn = population[idx]
            st_for_jump: dict = {}
            proxy = player_proxies[idx]

            try:
                rays = api.get_rays(agent_id, RAY_COUNT, RAY_MAX_DISTANCE)
            except NoSuchWindowException:
                raise
            except WebDriverException as e:
                raise RuntimeError(f"Browser/WebDriver failed while reading rays: {e}") from e
            except Exception:
                rays = []

            if rays:
                normalized_rays = normalize_ray_data(rays, RAY_MAX_DISTANCE)
                ray_input = flatten_rays(normalized_rays).reshape(1, -1)
                down_distance = get_downward_ray_distance(
                    api,
                    agent_id,
                    max_distance=GROUND_RAY_MAX_DISTANCE,
                )
                grounded = bool(
                    down_distance is not None
                    and down_distance <= baseline_ground_distances[idx] + GROUNDED_DISTANCE_TOLERANCE
                )

                st_for_jump = safe_state(api, agent_id)

                landing = st_for_jump.get("landing", {}) if st_for_jump else {}
                platform_index = landing.get("platformIndex")
                if platform_index is None and hasattr(proxy, "platform_index"):
                    platform_index = proxy.platform_index

                current_platform = get_platform_by_index(ordered_platforms, platform_index)
                if current_platform is None and ordered_platforms:
                    current_platform = ordered_platforms[min(max(int(platform_index or 0), 0), len(ordered_platforms) - 1)]

                next_platform = get_next_platform(ordered_platforms, current_platform)

                proxy.x = state_x(st_for_jump, proxy.x)
                proxy.y = state_y(st_for_jump, proxy.y)
                proxy.w = safe_float(st_for_jump.get("w", proxy.w), proxy.w)
                proxy.h = safe_float(st_for_jump.get("h", proxy.h), proxy.h)
                proxy.vx = safe_float(st_for_jump.get("vx", proxy.vx), proxy.vx)
                proxy.vy = safe_float(st_for_jump.get("vy", proxy.vy), proxy.vy)
                proxy.vel_y = proxy.vy
                proxy.on_ground = grounded
                proxy.dead = bool(st_for_jump.get("isDead", False)) if st_for_jump else False
                proxy.platform_index = int(platform_index or 0)

                score_value = calculate_score(
                    proxy,
                    current_platform=current_platform,
                    next_platform=next_platform,
                )

                agent_features = build_agent_features(
                    api,
                    agent_id,
                    st_for_jump,
                    proxy,
                    grounded,
                    down_distance,
                    current_platform,
                    next_platform,
                ).reshape(1, -1)
                nn_input = np.concatenate([ray_input, agent_features], axis=1)

                if proxy.score_tracker is not None and proxy.score_tracker.safe_timer > 0:
                    action = np.array([0, 0, 0], dtype=int)
                else:
                    logits = nn.predict_continuous(nn_input)[0]
                    action = decode_action(logits, agent_id)

                per_agent_data[idx]["rays"].append(nn_input[0])
                per_agent_data[idx]["actions"].append(action)
                per_agent_data[idx]["timesteps"] += 1

                # Jump-Game uses charge/release jumping, not a one-frame button.
                # action[2] is now continuous (0.0-1.0) representing jump charge.
                # We convert it to a hold duration: 0 means no jump, 1.0 means max charge.
                on_ground = grounded

                nn_jump_charge = float(action[2])
                jump_charge_threshold = 0.15  # Threshold to trigger jump
                nn_jump_request = nn_jump_charge > jump_charge_threshold
                
                if nn_jump_request:
                    jump_requests_seen[idx] += 1

                # Deterministic exploration: fresh random networks often never ask
                # for jump. This guarantees visible Y-gain signal from generation 1.
                period = EXPLORATION_JUMP_PERIOD_TICKS + (idx % max(1, EXPLORATION_JUMP_SPREAD_TICKS))
                phase = (idx * 7) % period
                exploration_jump_request = on_ground and ((tick + phase) % period == 0)

                if on_ground and jump_hold_ticks[idx] == 0 and jump_release_ticks[idx] == 0:
                    if nn_jump_request or exploration_jump_request:
                        # Map jump_charge (0.0-1.0) to hold duration
                        # 0.15-1.0 range maps to JUMP_HOLD_TICKS/3 to JUMP_HOLD_TICKS
                        if nn_jump_request:
                            charge_normalized = (nn_jump_charge - jump_charge_threshold) / (1.0 - jump_charge_threshold)
                            charge_normalized = min(1.0, max(0.0, charge_normalized))
                            min_hold = max(1, JUMP_HOLD_TICKS // 3)
                            max_hold = JUMP_HOLD_TICKS
                            jump_hold_ticks[idx] = int(min_hold + charge_normalized * (max_hold - min_hold))
                        else:
                            jump_hold_ticks[idx] = JUMP_HOLD_TICKS
                        jump_pulses_sent[idx] += 1

                if jump_hold_ticks[idx] > 0:
                    jump_button = True
                    jump_hold_ticks[idx] -= 1
                    if jump_hold_ticks[idx] == 0:
                        jump_release_ticks[idx] = JUMP_RELEASE_TICKS
                elif jump_release_ticks[idx] > 0:
                    jump_button = False
                    jump_release_ticks[idx] -= 1
                else:
                    jump_button = False

                try:
                    api.goleft(agent_id, bool(action[0]))
                    api.goright(agent_id, bool(action[1]))
                    api.holdjump(agent_id, jump_button)
                except NoSuchWindowException:
                    raise
                except WebDriverException as e:
                    raise RuntimeError(f"Browser/WebDriver failed while sending controls: {e}") from e
                except Exception:
                    pass

            if st_for_jump:
                if grounded:
                    grounded_counts[idx] += 1

                if proxy.score_tracker is not None:
                    per_agent_data[idx]["grounded_events"].append(
                        {
                            "score": float(proxy.score_tracker.value),
                            "safe_timer": int(proxy.score_tracker.safe_timer),
                            "platform_index": int(getattr(proxy, "platform_index", 0)),
                            "grounded": bool(grounded),
                        }
                    )

        if TICK_SECONDS > 0:
            time.sleep(TICK_SECONDS)

    scored_networks: list[tuple[NeuralNetwork, float]] = []
    all_episode_data: list[dict] = []

    for idx, agent_id in enumerate(agent_ids):
        proxy = player_proxies[idx]
        score = float(proxy.score_tracker.value if proxy.score_tracker is not None else 0.0)

        per_agent_data[idx]["final_score"] = score
        scored_networks.append((population[idx], score))
        all_episode_data.append(per_agent_data[idx])

        try:
            api.release_agent(agent_id)
        except Exception:
            pass

        print(
            f"  Agent {idx + 1}/{len(population)} "
            f"score={score:.1f}, "
            f"grounded_ticks={grounded_counts[idx]}, "
            f"jump_req={jump_requests_seen[idx]}, jump_pulses={jump_pulses_sent[idx]} "
            f"=> {score:.1f}"
        )

    clear_extra_agents(api)

    return scored_networks, all_episode_data


def select_and_breed(
    scored_networks: list[tuple[NeuralNetwork, float]],
    population_size: int,
    elite_keep_rate: float,
    mutation_rate: float,
    mutation_magnitude: float,
    champion: NeuralNetwork | None = None,
) -> list[NeuralNetwork]:
    ranked = sorted(
        list(enumerate(scored_networks)),
        key=lambda item: float(item[1][1]),
        reverse=True,
    )

    sorted_networks = [item[1] for item in ranked]
    scores = [float(score) for _, score in sorted_networks]

    print("\n  Generation Stats:")
    print(f"    Best: {scores[0]:.1f}")
    print(f"    Worst: {scores[-1]:.1f}")
    print(f"    Average: {np.mean(scores):.1f}")
    print(f"    Median: {np.median(scores):.1f}")

    num_elite = max(1, int(population_size * elite_keep_rate))

    # Keep top X% by rank, regardless of score.
    elite_ranked = ranked[:num_elite]
    elite_networks = [nn for _, (nn, _) in elite_ranked]

    print(f"    Keeping {len(elite_networks)} elite networks (top {elite_keep_rate*100:.0f}%)")

    if elite_ranked:
        print(
            "    Elite picks orig_idx:score: "
            + ", ".join(
                f"{orig_idx}:{score:.1f}"
                for orig_idx, (_, score) in elite_ranked
            )
        )

    new_population: list[NeuralNetwork] = []

    # Hall of fame.
    # Always keep the best network ever found.
    if champion is not None and HALL_OF_FAME_KEEP:
        new_population.append(champion.copy())

    for nn in elite_networks:
        if len(new_population) < population_size:
            new_population.append(nn.copy())

    if sorted_networks:
        base_input_size = sorted_networks[0][0].input_size
    elif champion is not None:
        base_input_size = champion.input_size
    else:
        raise RuntimeError("Cannot build new population: no scored networks available.")

    random_inject_count = max(1, int(population_size * RANDOM_INJECT_RATE))
    random_inject_count = min(random_inject_count, population_size - len(new_population))

    for _ in range(random_inject_count):
        new_population.append(create_random_network(base_input_size))

    if elite_networks:
        parent_pool = elite_networks
    elif champion is not None:
        parent_pool = [champion]
    else:
        parent_pool = [sorted_networks[0][0]]

    child_index = 0

    while len(new_population) < population_size:
        parent = parent_pool[child_index % len(parent_pool)]
        child_index += 1

        child = parent.copy()
        child.mutate(
            mutation_rate=mutation_rate,
            mutation_magnitude=mutation_magnitude,
        )

        new_population.append(child)

    return new_population


def run_training_loop() -> None:
    print("Starting training loop...")
    driver: webdriver.Chrome | None = None
    api: GameAPI | None = None

    best_network: NeuralNetwork | None = None
    best_score = float("-inf")

    try:
        print("Building session...")
        driver, api = build_session()
        print("Session built successfully.")

        input_size = RAY_COUNT * RAY_FEATURES_PER_RAY + EXTRA_AGENT_FEATURES

        print(f"Initializing population of {POPULATION_SIZE} networks...")
        print(
            f"Ray input: {RAY_COUNT} rays × "
            f"{RAY_FEATURES_PER_RAY} features + {EXTRA_AGENT_FEATURES} agent features = {input_size} inputs"
        )

        population = [create_random_network(input_size) for _ in range(POPULATION_SIZE)]

        # Try to load existing best model
        try:
            import os
            if os.path.exists("best_model_overall.pkl"):
                loaded_network = NeuralNetwork.load("best_model_overall.pkl")
                if loaded_network.input_size == input_size:
                    best_network = loaded_network
                    print("✓ Loaded existing best_model_overall.pkl")
                else:
                    print(
                        "  Skipping best_model_overall.pkl: input size mismatch "
                        f"({loaded_network.input_size} != {input_size})"
                    )
        except Exception as e:
            print(f"  Could not load existing model: {e}")

        if best_network is None:
            best_network = population[0].copy()

        print("\nOrdered-platform scoring:")
        print(f"  GROUND_RAY_MAX_DISTANCE = {GROUND_RAY_MAX_DISTANCE}")
        print(f"  GROUNDED_DISTANCE_TOLERANCE = {GROUNDED_DISTANCE_TOLERANCE}")
        print(f"  JUMP_HOLD_TICKS = {JUMP_HOLD_TICKS}")
        print(f"  JUMP_RELEASE_TICKS = {JUMP_RELEASE_TICKS}")
        print(f"  EXPLORATION_JUMP_PERIOD_TICKS = {EXPLORATION_JUMP_PERIOD_TICKS}")
        print(f"  DRAW_RAY_HIT_MARKERS = {DRAW_RAY_HIT_MARKERS}")
        print(f"  RAY_HIT_MARKER_RADIUS = {RAY_HIT_MARKER_RADIUS}")

        for generation in range(GENERATIONS):
            print(f"\n{'=' * 50}")
            print(f"Generation {generation + 1}/{GENERATIONS}")
            print(f"{'=' * 50}")

            # Evaluate best network ever every generation.
            if HALL_OF_FAME_KEEP and generation > 0 and best_network is not None:
                population[0] = best_network.copy()

            print("Running population...")

            scored_networks, _episode_data = run_generation(
                api,
                population,
                EPISODE_SECONDS,
            )

            scores = [score for _, score in scored_networks]
            gen_best_idx = int(np.argmax(scores))
            gen_best_score = float(scores[gen_best_idx])

            if gen_best_score > best_score:
                best_score = gen_best_score
                best_network = scored_networks[gen_best_idx][0].copy()

                print(f"\n✓ New best score: {best_score:.1f}")
                best_network.save("best_model_overall.pkl")
                print("Saved best model: best_model_overall.pkl")

            print("\nSelecting and breeding...")

            population = select_and_breed(
                scored_networks,
                POPULATION_SIZE,
                ELITE_KEEP_RATE,
                MUTATION_RATE,
                MUTATION_MAGNITUDE,
                champion=best_network,
            )

        print(f"\n{'=' * 50}")
        print(f"Training complete! Best score: {best_score:.1f}")
        print(f"{'=' * 50}")

    except NoSuchWindowException:
        print("\nChrome window was closed.")
        raise

    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass


if __name__ == "__main__":
    try:
        run_training_loop()
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()