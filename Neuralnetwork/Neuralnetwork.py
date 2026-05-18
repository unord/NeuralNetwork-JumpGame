"""Neural network for agent control based on ray input."""

import numpy as np
import pickle
import os



class Layer_Dense:
    """Fully connected dense layer."""
    
    def __init__(self, n_inputs, n_neurons, learning_rate=0.01):
        self.learning_rate = learning_rate
        # Initialize weights with small random values
        self.weights = 0.05 * np.random.randn(n_inputs, n_neurons)
        self.biases = np.zeros((1, n_neurons))
        
        # For backprop
        self.inputs = None
        self.output = None
        self.dweights = None
        self.dbiases = None
    
    def forward(self, inputs):
        """Forward pass through the layer."""
        self.inputs = inputs
        self.output = np.dot(inputs, self.weights) + self.biases
        return self.output
    
    def backward(self, dvalues):
        """Backward pass (calculate gradients)."""
        # Gradient of weights
        self.dweights = np.dot(self.inputs.T, dvalues)
        # Gradient of biases
        self.dbiases = np.sum(dvalues, axis=0, keepdims=True)
        # Gradient for previous layer
        dvalues_prev = np.dot(dvalues, self.weights.T)
        
        # Update weights and biases
        self.weights -= self.learning_rate * self.dweights
        self.biases -= self.learning_rate * self.dbiases
        
        return dvalues_prev


class Activation_ReLU:
    """ReLU activation function."""
    
    def __init__(self):
        self.inputs = None
        self.output = None
    
    def forward(self, inputs):
        """Forward pass."""
        self.inputs = inputs
        self.output = np.maximum(0, inputs)
        return self.output
    
    def backward(self, dvalues):
        """Backward pass."""
        dvalues = dvalues.copy()
        # Gradient of ReLU: 0 where input < 0, 1 where input >= 0
        dvalues[self.inputs <= 0] = 0
        return dvalues


class Activation_Linear:
    """Linear activation (identity)."""
    
    def __init__(self):
        self.output = None
    
    def forward(self, inputs):
        self.output = inputs
        return self.output
    
    def backward(self, dvalues):
        return dvalues


class NeuralNetwork:
    """Neural network for controlling game agents."""
    
    def __init__(self, input_size, hidden_size=64, output_size=4, learning_rate=0.01):
        """
        Args:
            input_size: Number of ray inputs (ray_count * 3)
            hidden_size: Number of neurons in hidden layer
            output_size: Number of outputs (4: left/right/do_nothing/jump)
            learning_rate: Learning rate for weight updates
        """
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.output_size = output_size
        
        # Build network
        self.dense1 = Layer_Dense(input_size, hidden_size, learning_rate)
        self.activation1 = Activation_ReLU()
        self.dense2 = Layer_Dense(hidden_size, output_size, learning_rate)
        self.activation2 = Activation_Linear()
    
    def forward(self, X):
        """Forward pass through network."""
        output = self.dense1.forward(X)
        output = self.activation1.forward(output)
        output = self.dense2.forward(output)
        output = self.activation2.forward(output)
        return output
    
    def train_on_batch(self, X, y):
        """Train network on a batch with target outputs."""
        # Forward pass
        output = self.forward(X)
        
        # Calculate loss (simple MSE)
        loss = np.mean((output - y) ** 2)
        
        # Backward pass
        dvalues = 2 * (output - y) / len(y)  # MSE gradient
        dvalues = self.activation2.backward(dvalues)
        dvalues = self.dense2.backward(dvalues)
        dvalues = self.activation1.backward(dvalues)
        dvalues = self.dense1.backward(dvalues)
        
        return loss
    
    def predict(self, X):
        """Get predictions from network."""
        output = self.forward(X)
        # Convert output to actions: left, right, jump (0 or 1)
        return (output > 0.5).astype(int)
    
    def predict_continuous(self, X):
        """Get continuous predictions (0-1) from network."""
        return self.forward(X)
    
    def save(self, filepath):
        """Save network weights to file."""
        weights_data = {
            'input_size': self.input_size,
            'hidden_size': self.hidden_size,
            'output_size': self.output_size,
            'dense1_weights': self.dense1.weights,
            'dense1_biases': self.dense1.biases,
            'dense2_weights': self.dense2.weights,
            'dense2_biases': self.dense2.biases,
        }
        with open(filepath, 'wb') as f:
            pickle.dump(weights_data, f)
    
    @classmethod
    def load(cls, filepath):
        """Load network weights from file and return a new network instance."""
        with open(filepath, 'rb') as f:
            weights_data = pickle.load(f)

        new_nn = cls(
            weights_data['input_size'],
            weights_data['hidden_size'],
            weights_data['output_size'],
        )
        new_nn.dense1.weights = weights_data['dense1_weights']
        new_nn.dense1.biases = weights_data['dense1_biases']
        new_nn.dense2.weights = weights_data['dense2_weights']
        new_nn.dense2.biases = weights_data['dense2_biases']
        return new_nn
    
    def copy(self):
        """Create a deep copy of this network."""
        new_nn = NeuralNetwork(self.input_size, self.hidden_size, self.output_size, self.dense1.learning_rate)
        new_nn.dense1.weights = self.dense1.weights.copy()
        new_nn.dense1.biases = self.dense1.biases.copy()
        new_nn.dense2.weights = self.dense2.weights.copy()
        new_nn.dense2.biases = self.dense2.biases.copy()
        return new_nn
    
    def mutate(self, mutation_rate=0.1, mutation_magnitude=0.5):
        """Apply random mutations to weights and biases."""
        # Mutate dense1 weights
        mask = np.random.random(self.dense1.weights.shape) < mutation_rate
        self.dense1.weights[mask] += np.random.normal(0, mutation_magnitude, np.sum(mask))
        
        # Mutate dense1 biases
        mask = np.random.random(self.dense1.biases.shape) < mutation_rate
        self.dense1.biases[mask] += np.random.normal(0, mutation_magnitude, np.sum(mask))
        
        # Mutate dense2 weights
        mask = np.random.random(self.dense2.weights.shape) < mutation_rate
        self.dense2.weights[mask] += np.random.normal(0, mutation_magnitude, np.sum(mask))
        
        # Mutate dense2 biases
        mask = np.random.random(self.dense2.biases.shape) < mutation_rate
        self.dense2.biases[mask] += np.random.normal(0, mutation_magnitude, np.sum(mask))


def flatten_rays(rays):
    """Flatten numeric ray data into one NN input vector.

    Expected ray format after normalization:
        [angle_norm, distance_norm, hit_dx_norm, hit_dy_norm]
    """
    return np.array(rays, dtype=np.float32).flatten()


def normalize_ray_data(rays, max_distance=1200):
    """Normalize ray data to stable numeric input.

    JS ray format:
        [angle_radians, distance, hit_x, hit_y]

    NN normalized format:
        [angle_0_to_1, distance_0_to_1, hit_x_scaled, hit_y_scaled]

    hit_x_scaled / hit_y_scaled are absolute world coordinates scaled by max_distance.
    This keeps the platform/hit position information without using a string platform type.
    """
    normalized = []

    for ray in rays:
        if not isinstance(ray, (list, tuple)) or len(ray) < 2:
            normalized.append([0.0, 1.0, 0.0, 0.0])
            continue

        angle = float(ray[0])
        distance = float(ray[1])
        hit_x = float(ray[2]) if len(ray) > 2 and ray[2] is not None else 0.0
        hit_y = float(ray[3]) if len(ray) > 3 and ray[3] is not None else 0.0

        # JS angles are 0..2pi. Modulo keeps this safe even if a negative angle appears.
        norm_angle = (angle % (2 * np.pi)) / (2 * np.pi)
        norm_distance = min(max(distance / max_distance, 0.0), 1.0)

        # Platform/hit position info, kept numeric and bounded.
        norm_hit_x = max(min(hit_x / max_distance, 4.0), -4.0)
        norm_hit_y = max(min(hit_y / max_distance, 4.0), -4.0)

        normalized.append([norm_angle, norm_distance, norm_hit_x, norm_hit_y])

    return normalized
