"""Neural network runner settings."""

TICK_SECONDS = 0.01 # each time we will make a move
EPISODE_SECONDS = 10 # how long we will run before evaluating the model
GAME_URL = "http://127.0.0.1:5500/Game/main.html"
dev_debug = True # when True, the game renders AI raycasts

# Neural network settings
RAY_COUNT = 8  # number of angles/rays for raycast input
RAY_MAX_DISTANCE = 900  # maximum distance for raycast
LEARNING_RATE = 0.01
GENERATIONS = 100

# Genetic algorithm settings
POPULATION_SIZE = 20  # number of networks per generation
MUTATION_RATE = 0.2  # probability of mutating each weight
MUTATION_MAGNITUDE = 1.3  # standard deviation of mutation
ELITE_KEEP_RATE = 0.2  # fraction of top performers to keep (e.g., 0.2 = keep top 20%)

# Game seed for consistent level generation
GAME_SEED = 42
