from __future__ import annotations

import time
import numpy as np

from selenium import webdriver
from selenium.webdriver.common.by import By

from nn_config import (
    TICK_SECONDS, EPISODE_SECONDS, GAME_URL, dev_debug,
    RAY_COUNT, RAY_MAX_DISTANCE, GENERATIONS, GAME_SEED,
    POPULATION_SIZE, MUTATION_RATE, MUTATION_MAGNITUDE, ELITE_KEEP_RATE
)
from API import GameAPI
from Neuralnetwork import NeuralNetwork, normalize_ray_data, flatten_rays


def create_random_network(input_size: int) -> NeuralNetwork:
    return NeuralNetwork(
        input_size=input_size,
        hidden_size=64,
        output_size=3,
        learning_rate=0.01,
    )


def sigmoid(value: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-value))


def softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    exp_values = np.exp(shifted)
    return exp_values / np.sum(exp_values)


def decode_action(logits: np.ndarray, agent_id: int) -> np.ndarray:
    """Convert network logits into a slightly stochastic but agent-specific action."""
    bias = ((agent_id % 7) - 3) * 0.035

    move_logits = np.array([logits[0] + bias, logits[1] - bias, 0.0], dtype=np.float32)
    move_probs = softmax(move_logits)
    move_choice = int(np.random.choice(3, p=move_probs))

    jump_prob = float(sigmoid(np.array([logits[2] + bias * 0.5]))[0])
    jump_active = np.random.random() < jump_prob

    return np.array([
        1 if move_choice == 0 else 0,
        1 if move_choice == 1 else 0,
        1 if jump_active else 0,
    ], dtype=int)


def build_session() -> tuple[webdriver.Chrome, GameAPI]:
    driver = webdriver.Chrome()
    driver.get(GAME_URL)

    canvas = driver.find_element(By.ID, "game")
    canvas.click()

    api = GameAPI(driver)
    # Set deterministic map seed before enabling AI mode so initial platforms are seeded
    api.set_map_seed(GAME_SEED)
    api.set_nn_mode(dev_debug=dev_debug)
    return driver, api


def collect_episode_data(
    api: GameAPI,
    agent_id: int,
    nn: NeuralNetwork,
    episode_seconds: float,
) -> dict:
    """
    Run a single agent for an episode using a neural network.
    
    Returns:
        Dictionary with episode data: rays, actions, timesteps, final_score
    """
    agent_data = {
        'rays': [],
        'actions': [],
        'timesteps': 0,
        'final_score': 0
    }
    
    end_at = time.time() + episode_seconds
    while time.time() < end_at:
        # Get ray data
        rays = api.get_rays(agent_id, RAY_COUNT, RAY_MAX_DISTANCE)
        
        if rays:
            # Normalize and flatten rays
            normalized_rays = normalize_ray_data(rays, RAY_MAX_DISTANCE)
            ray_input = flatten_rays(normalized_rays).reshape(1, -1)
            
            # Get action from neural network logits, then decode into an agent-specific action
            logits = nn.predict_continuous(ray_input)[0]
            action = decode_action(logits, agent_id)
            
            # Store experience
            agent_data['rays'].append(ray_input[0])
            agent_data['actions'].append(action)
            agent_data['timesteps'] += 1
            
            # Execute action
            api.goleft(agent_id, bool(action[0]))
            api.goright(agent_id, bool(action[1]))
            api.holdjump(agent_id, bool(action[2]))
        
        time.sleep(TICK_SECONDS)
    
    # Get final score
    score = api.get_agent_score(agent_id)
    agent_data['final_score'] = score
    
    return agent_data


def run_generation(
    api: GameAPI,
    population: list[NeuralNetwork],
    episode_seconds: float,
) -> tuple[list[tuple[NeuralNetwork, float]], list[dict]]:
    """
    Run a full generation with all networks in population.
    
    Returns:
        Tuple of (scored networks as [(nn, score), ...], all episode data)
    """
    # Spawn all agents first so they appear simultaneously in the game
    # Ensure the entire game state is reset with the configured seed before spawning this generation
    try:
        api.set_map_seed(GAME_SEED)
        api.set_nn_mode(dev_debug=dev_debug)
    except Exception:
        pass

    agent_ids: list[int] = []
    for _ in population:
        agent_ids.append(api.spawnplayer())

    # Per-agent episode storage (aligned with population)
    per_agent_data = [
        {'rays': [], 'actions': [], 'timesteps': 0, 'final_score': 0}
        for _ in population
    ]

    # Track start y and minimal y (highest reached) per agent
    start_y = [None for _ in population]
    min_y = [None for _ in population]
    for idx, agent_id in enumerate(agent_ids):
        st = api.get_player_state(agent_id)
        sy = None
        if isinstance(st, dict) and 'y' in st:
            sy = float(st.get('y', 0))
        else:
            # default spawn y (matches player.reset)
            sy = float(api.driver.execute_script('return window.GameConfig.canvasHeight - 120;'))
        start_y[idx] = sy
        min_y[idx] = sy

    end_at = time.time() + episode_seconds
    # Run the episode loop, stepping all agents each tick
    while time.time() < end_at:
        for idx, agent_id in enumerate(agent_ids):
            nn = population[idx]
            rays = api.get_rays(agent_id, RAY_COUNT, RAY_MAX_DISTANCE)

            if rays:
                normalized_rays = normalize_ray_data(rays, RAY_MAX_DISTANCE)
                ray_input = flatten_rays(normalized_rays).reshape(1, -1)

                logits = nn.predict_continuous(ray_input)[0]
                action = decode_action(logits, agent_id)

                per_agent_data[idx]['rays'].append(ray_input[0])
                per_agent_data[idx]['actions'].append(action)
                per_agent_data[idx]['timesteps'] += 1

                # Execute action for this agent
                api.goleft(agent_id, bool(action[0]))
                api.goright(agent_id, bool(action[1]))
                api.holdjump(agent_id, bool(action[2]))

            # Poll player state to update best height (min y)
            st = api.get_player_state(agent_id)
            if isinstance(st, dict) and 'y' in st:
                y = float(st.get('y', start_y[idx]))
                if min_y[idx] is None or y < min_y[idx]:
                    min_y[idx] = y

        time.sleep(TICK_SECONDS)

    # After episode, collect scores and clean up agents
    scored_networks = []
    all_episode_data = []
    for idx, agent_id in enumerate(agent_ids):
        # Compute best height-based score: how far above start the agent reached
        sy = start_y[idx] if start_y[idx] is not None else 0.0
        my = min_y[idx] if min_y[idx] is not None else sy
        best_height = max(0.0, sy - my)

        per_agent_data[idx]['final_score'] = best_height
        scored_networks.append((population[idx], best_height))
        all_episode_data.append(per_agent_data[idx])
        api.release_agent(agent_id)
        print(f"  Agent {idx + 1}/{len(population)} Best height: {best_height:.1f}")

    return scored_networks, all_episode_data


def select_and_breed(
    scored_networks: list[tuple[NeuralNetwork, float]],
    population_size: int,
    elite_keep_rate: float,
    mutation_rate: float,
    mutation_magnitude: float,
) -> list[NeuralNetwork]:
    """
    Select top performers and create new population through mutation.
    
    Returns:
        New population of networks
    """
    # Sort by score (descending)
    sorted_networks = sorted(scored_networks, key=lambda x: x[1], reverse=True)
    scores = [score for _, score in sorted_networks]
    
    # Print stats
    print(f"\n  Generation Stats:")
    print(f"    Best: {scores[0]:.1f}")
    print(f"    Worst: {scores[-1]:.1f}")
    print(f"    Average: {np.mean(scores):.1f}")
    print(f"    Median: {np.median(scores):.1f}")
    
    # Select elite (top performers to keep)
    num_elite = max(1, int(population_size * elite_keep_rate))
    elite_networks = [nn for nn, _ in sorted_networks[:num_elite]]
    
    print(f"    Keeping {num_elite} elite networks")
    
    # Create new population
    new_population = []
    
    # Add elite directly
    for nn in elite_networks:
        new_population.append(nn.copy())

    # Keep a small exploration budget of fresh random networks so the population
    # does not collapse onto a single parent strategy.
    random_inject_count = max(1, int(population_size * 0.1))
    random_inject_count = min(random_inject_count, population_size - len(new_population))

    for _ in range(random_inject_count):
        new_population.append(create_random_network(elite_networks[0].input_size))
    
    # Fill rest with mutations
    child_index = 0
    while len(new_population) < population_size:
        # Round-robin through the elite so every top performer seeds offspring
        parent = elite_networks[child_index % len(elite_networks)]
        child_index += 1
        
        # Create mutated child
        child = parent.copy()
        child.mutate(
            mutation_rate=mutation_rate,
            mutation_magnitude=mutation_magnitude,
        )
        new_population.append(child)
    
    return new_population


def run_training_loop():
    """Main training loop with genetic algorithm."""
    driver: webdriver.Chrome | None = None
    api: GameAPI | None = None
    
    try:
        driver, api = build_session()
        
        # Initialize population with random networks
        print(f"Initializing population of {POPULATION_SIZE} networks...")
        input_size = RAY_COUNT * 3
        population = [create_random_network(input_size) for _ in range(POPULATION_SIZE)]
        
        best_score = 0
        best_network = population[0].copy()
        
        # Training loop
        for generation in range(GENERATIONS):
            print(f"\n{'='*50}")
            print(f"Generation {generation + 1}/{GENERATIONS}")
            print(f"{'='*50}")
            
            # Run generation
            print("Running population...")
            scored_networks, episode_data = run_generation(
                api, population, EPISODE_SECONDS
            )
            
            # Track best
            gen_best_score = max(score for _, score in scored_networks)
            if gen_best_score > best_score:
                best_score = gen_best_score
                best_network = scored_networks[np.argmax([score for _, score in scored_networks])][0].copy()
                print(f"\n✓ New best score: {best_score:.1f}")
            
            # Select and breed for next generation
            print("\nSelecting and breeding...")
            population = select_and_breed(
                scored_networks,
                POPULATION_SIZE,
                ELITE_KEEP_RATE,
                MUTATION_RATE,
                MUTATION_MAGNITUDE,
            )
            
            # Save best model periodically
            if generation % 5 == 0:
                best_network.save(f"best_model_gen_{generation}.pkl")
                print(f"Saved best model: best_model_gen_{generation}.pkl")
        
        print(f"\n{'='*50}")
        print(f"Training complete! Best score: {best_score:.1f}")
        print(f"{'='*50}")
        best_network.save("best_model_final.pkl")
        
    finally:
        if driver is not None:
            driver.quit()



if __name__ == "__main__":
    run_training_loop()

