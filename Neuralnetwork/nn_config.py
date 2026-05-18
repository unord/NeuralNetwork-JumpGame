"""Neural network runner settings."""

# 360 rays is much heavier than 8 rays. 0.03 keeps Selenium/Chrome much more stable
TICK_SECONDS = 0.03
EPISODE_SECONDS = 10
GAME_URL = "http://127.0.0.1:5500/Jump-game/index.html"
dev_debug = True

# Debug ray overlay settings (visible when dev_debug=True)
DRAW_ALL_AGENT_RAYS = True
DEBUG_RAY_COUNT = 72
DEBUG_RAY_MAX_DISTANCE = 1200
DRAW_RAY_HIT_MARKERS = True
RAY_HIT_MARKER_RADIUS = 2

# Ground detection + scoring (downward-ray based)
GROUND_RAY_MAX_DISTANCE = 1200.0
GROUNDED_DISTANCE_TOLERANCE = 6.0
LANDING_REWARD = 200.0
STAY_ALIVE_REWARD = 0.2
FALL_AFTER_LANDING_PENALTY = 150.0
UPWARD_PROGRESS_MULTIPLIER = 0.5
HEIGHT_GAIN_SCORE_MULTIPLIER = 12.0
HIGHER_GROUNDED_BONUS = 30.0
LANDING_LOCK_TICKS = 10

# Neural network settings
RAY_COUNT = 180
RAY_MAX_DISTANCE = 750
RAY_FEATURES_PER_RAY = 4  # [angle, distance, hitX, hitY]
LEARNING_RATE = 0.1
GENERATIONS = 800

# Genetic algorithm settings
POPULATION_SIZE = 20
MUTATION_RATE = 0.08
MUTATION_MAGNITUDE = 0.35
ELITE_KEEP_RATE = 0.10
RANDOM_INJECT_RATE = 0.18

# Keep the best ever model alive even if one noisy episode evaluates badly.
HALL_OF_FAME_KEEP = True

# Game seed for consistent level generation
GAME_SEED = 113

# Platform-achievement scoring. The agent only gets major progress after it has
# landed and become stationary on a higher platform.
# Stationary landing scoring
STATIONARY_TICKS_REQUIRED = 6
STATIONARY_VELOCITY_EPS = 0.45
MIN_STATIONARY_Y_GAIN = 32.0
STATIONARY_LANDING_SCORE = 1000.0


# Y-stable landing scoring
Y_STABLE_WINDOW = 6
Y_STABLE_EPS = 3.0
MIN_STABLE_Y_GAIN = 40.0
LANDING_SCORE = 10000.0
PLATFORM_Y_BUCKET = 20.0

# Y achievement scoring (base points per unit of height gained)
Y_ACHIEVEMENT_MULTIPLIER = 1.0

# Fall penalty settings: only apply when an agent has achieved a meaningful
# height gain and then falls back down. Penalty = distance_fallen * multiplier
# Per-platform score unit: points per platform-rank difference when transitioning
PLATFORM_SCORE_UNIT = 10000.0