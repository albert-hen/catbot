# AlphaZero Agent for Boop

Self-play reinforcement learning agent using neural networks and Monte Carlo Tree Search (MCTS).

## Training

### Setup

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Start Training

```bash
python -m packages.boop_agents.alphazero.main
```

### Training Configuration

Edit training parameters in [main.py](main.py):

```python
args = dotdict({
    'numIters': 1000,           # Number of training iterations
    'numEps': 100,              # Self-play games per iteration
    'tempThreshold': 15,        # Temperature threshold for exploration
    'updateThreshold': 0.6,     # Win rate needed to accept new model
    'maxlenOfQueue': 200000,    # Training examples to keep
    'numMCTSSims': 32,          # MCTS simulations per move
    'arenaCompare': 20,         # Games for model comparison
    'cpuct': 1,                 # MCTS exploration constant
    'checkpoint': './temp/',    # Where to save models
    'load_model': False,        # Whether to resume training
})
```

Neural network parameters in [NNet.py](NNet.py):

```python
args = dotdict({
    'lr': 0.001,                # Learning rate
    'dropout': 0.3,             # Dropout rate
    'epochs': 10,               # Training epochs per iteration
    'batch_size': 64,           # Batch size
    'num_channels': 128,        # Neural network channels
})
```

### Output

Trained models are saved to `temp/` directory:
- `checkpoint_N.pth.tar` - Model after iteration N
- `best.pth.tar` - Best model so far
- Training logs printed to console

## Using Trained Models

### In Desktop UI

```bash
python -m packages.boop_pygame.main --orange-alphazero=temp/best.pth.tar
```

See [../../boop_pygame/README.md](../../boop_pygame/README.md) for more options.

### In Web UI

Export the model to ONNX format:

```bash
python scripts/export_onnx.py
```

This automatically saves to `packages/boop_web/public/model.onnx`.

See [../../boop_web/README.md](../../boop_web/README.md) for web UI setup.

## Architecture

### Neural Network
- **Input**: 9-channel tensor (6×6 board)
  - Channel 0: State mode (placement vs graduation)
  - Channels 1-4: Piece positions by type (orange/gray kitten/cat)
  - Channels 5-8: Available piece counts
- **Output**: 
  - Policy head: Probability distribution over all possible moves
  - Value head: Predicted game outcome (-1 to 1)

### Training Process
1. **Self-play**: Agent plays games against itself using MCTS
2. **Training examples**: (board state, move probabilities, game outcome) tuples collected
3. **Neural network update**: Train on collected examples
4. **Arena comparison**: New model must beat old model to be accepted
5. **Repeat**: Continue for specified number of iterations

### Key Files
- [BoopGame.py](BoopGame.py) - Game interface for AlphaZero
- [BoopNNet.py](BoopNNet.py) - Neural network architecture
- [MCTS.py](MCTS.py) - Monte Carlo Tree Search implementation
- [Coach.py](Coach.py) - Training orchestration
- [Arena.py](Arena.py) - Model comparison

## Testing

```bash
python -m unittest packages.boop_agents.alphazero.tests.test_boop_game
```

## Performance

Training on CPU is slow. For faster training:
- Use a GPU (CUDA automatically detected)
- Reduce `numMCTSSims` for faster but weaker play
- Reduce `numEps` for faster iterations
