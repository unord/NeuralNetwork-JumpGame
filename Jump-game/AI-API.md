# Jump-Game Neural Network AI Integration

## Overview

The Jump-game now supports multiple AI agents controlled via a JavaScript API compatible with Python Selenium bridge. This allows neural networks to learn gameplay by controlling agents and receiving sensory input.

## API Functions

### Agent Management

#### `spawngent(x, y)` - Spawn a new AI agent
- **Parameters:**
  - `x` (number, default 900): X position to spawn at
  - `y` (number, optional): Y position to spawn at (defaults to spawn height)
- **Returns:** Agent ID (integer)
- **Usage:** `agentId = window.spawngent(100, 200);`

#### `spawnplayer()` - Reset the main player
- **Returns:** 0 if successful, -1 if failed
- **Usage:** `window.spawnplayer();`

#### `resetgent(agentId)` - Reset an agent to spawn position
- **Parameters:** `agentId` (integer)
- **Returns:** true if successful
- **Usage:** `window.resetgent(0);`

#### `killgent(agentId)` - Remove an agent
- **Parameters:** `agentId` (integer)
- **Returns:** false if trying to kill main player, true if successful
- **Usage:** `window.killgent(1);`

#### `getagents()` - Get all active agent IDs
- **Returns:** Array of agent IDs
- **Usage:** `agents = window.getagents();`

### Control Functions

#### `moveleft(agentId, hold)` - Move agent left
- **Parameters:**
  - `agentId` (integer, default 0)
  - `hold` (0 or 1, default 1): 1 = start moving, 0 = stop moving
- **Returns:** true
- **Usage:** `window.moveleft(0, 1);` // agent 0 moves left

#### `moveright(agentId, hold)` - Move agent right
- **Parameters:**
  - `agentId` (integer, default 0)
  - `hold` (0 or 1, default 1)
- **Returns:** true
- **Usage:** `window.moveright(0, 1);`

#### `jump(agentId, hold)` - Jump
- **Parameters:**
  - `agentId` (integer, default 0)
  - `hold` (0 or 1, default 1): 1 = start charging, 0 = release
- **Returns:** true
- **Usage:** `window.jump(0, 1);` // agent 0 starts jump

#### `stop(agentId)` - Stop all movement
- **Parameters:** `agentId` (integer, default 0)
- **Returns:** true
- **Usage:** `window.stop(0);`

### Sensor Functions

#### `getrays(agentId, rayCount, maxDistance)` - Cast rays for environment sensing
- **Parameters:**
  - `agentId` (integer, default 0)
  - `rayCount` (integer, default 8): Number of rays to cast
  - `maxDistance` (number, default 900): Max ray distance
- **Returns:** Array of `[angle, distance, hitType]` per ray
- **Usage:** `rays = window.getrays(0, 8, 900);`
- **Ray Types:** 'air', 'platform', 'slope', 'wall', 'boundary'

#### `getplayerstate(agentId)` - Get agent state
- **Parameters:** `agentId` (integer, default 0)
- **Returns:** Object with properties:
  ```javascript
  {
    x, y,                    // Position
    w, h,                    // Size
    vx, vy,                  // Velocity
    onGround,                // Is on platform?
    isChargingJump,          // Currently charging?
    jumpCharge,              // Charge 0.0-1.0
    jumpDirection,           // -1, 0, or 1
    facing,                  // -1 or 1 (direction)
    animFrame                // Current animation frame
  }
  ```
- **Usage:** `state = window.getplayerstate(0);`

#### `getlevelstate()` - Get level information
- **Returns:** Object with properties:
  ```javascript
  {
    width,
    height,
    currentLevelIndex,
    lineCount
  }
  ```

#### `getworldstate()` - Get full world state (debug)
- **Returns:** Combined level + player state

## Example Usage

```javascript
// Spawn 3 agents
const agent1 = spawngent(100, 0);
const agent2 = spawngent(200, 0);
const agent3 = spawngent(300, 0);

// Get all agents
const allAgents = getagents(); // [0, 1, 2, 3]

// Control them
moveleft(agent1, 1);    // agent1 moves left
moveright(agent2, 1);   // agent2 moves right
jump(agent3, 1);        // agent3 starts jump

// After 0.7 seconds of charging, release jump
jump(agent3, 0);        // agent3 releases jump

// Get input for neural network
const rays = getrays(agent1, 8, 900);
const state = getplayerstate(agent1);

// Stop agent
stop(agent1);

// Reset agent
resetgent(agent1);

// Remove agent
killgent(agent1);
```

## Python Integration Example

Using Selenium to control agents from Python:

```python
driver = webdriver.Chrome()
driver.get("http://localhost:8000/Jump-game/index.html")

# Spawn agents
agent_ids = [
    driver.execute_script("return spawngent(100, 0);"),
    driver.execute_script("return spawngent(200, 0);"),
    driver.execute_script("return spawngent(300, 0);")
]

# Control agents
for agent_id in agent_ids:
    driver.execute_script(f"moveleft({agent_id}, 1);")

# Get sensor data
rays = driver.execute_script(f"return getrays(0, 8, 900);")
state = driver.execute_script(f"return getplayerstate(0);")

# Process rays in neural network
# rays = [[angle, distance, type], ...]
distances = [ray[1] for ray in rays]  # Extract distances
```

## Implementation Notes

- Multiple agents can be active simultaneously
- Each agent has independent control state
- Ray casting is GPU-optimized for real-time performance
- Agents spawn at specified coordinates each time
- Default agent (ID 0) is the main player
- Removing agents frees memory immediately
