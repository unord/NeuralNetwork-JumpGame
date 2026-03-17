import torch
import torch.nn as nn
import torch.optim as optim

# Define a simple feedforward neural network
x = torch.tensor([[0, 0], [0, 1], [1, 0], [1, 1]], dtype=torch.float32)
y = torch.tensor([[0], [1], [1], [0]], dtype=torch.float32)

# Define the neural network
class XQRNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = nn.Sequential(
            nn.Linear (2, 4),
            nn.Sigmoid(),
            nn.Linear (4, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.model(x)
    
# Create the model, loss function, and optimizer
model = XQRNet()
loss_function = nn.MSELoss()
optimizer = optim.SGD(model.parameters(), lr=0.1)

# Training loop
epochs = 10000
for epoch in range(epochs):
    # Forward pass
    output = model(x)
    loss = loss_function(output, y)
    
    # Backward pass and optimization
    optimizer.zero_grad() # Zero the gradients
    loss.backward() # Compute the gradients
    optimizer.step() # Update the parameters of our network

    if (epoch + 1) % 10 == 0:
        print(f'Epoch [{epoch + 1}/{epochs}], Loss: {loss.item():.4f}')

# Test the model
with torch.no_grad():
    test_output = model(x)
    predicted = (test_output > 0.5).float()
    print("\nFinal Predictions:")
    for i in range(len(x)):
        print(f"Input: {x[i].numpy()}, Predicted: {predicted[i].item()}, Actual: {y[i].item(): .0f}")