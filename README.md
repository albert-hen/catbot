# catbot

boop with alphazero (coming soon)

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/albert-hen/catbot.git
    cd catbot
    ```

2. Create and activate a virtual environment (recommended):
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate
    ```

3. Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

## Running the Game

From the project root directory, start the game with:
```bash
python -m packages.boop_pygame.main
```

## Running Tests

To run unit tests:
```bash
python -m unittest packages.boop_core.tests.test_game
```

## Running Demo Scripts

To run a demo (e.g., random game):
```bash
python -m packages.boop_pygame.demo.demo_random_game_state_ui
```

## AlphaZero Training

```bash
cd packages/boop_agents/alphazero
python train.py
```


# Boop Game Agent System

The Boop game now supports a flexible agent system where you can configure different AI agents for each player.

## Running the Game

### Human vs Human (default)
```bash
python -m packages.boop_pygame.main
```

### Human (Orange) vs AI (Gray)
```bash
python -m packages.boop_pygame.main --gray-ai
```

### AI (Orange) vs Human (Gray)
```bash
python -m packages.boop_pygame.main --orange-ai
```

### AI vs AI (watch two agents play)
```bash
python -m packages.boop_pygame.main --both-ai
```

## Agent Interface

Agents are functions that take a `GameState` object and return the best move as a tuple:
- `("place", (piece_type, position))` for piece placement moves
- `("graduate", graduation_choice)` for graduation moves

Example agent function:
```python
def my_agent(game_state):
    # Analyze game_state and return best move
    return ("place", ("ok", (0, 0)))  # Place orange kitten at (0,0)
```

## Available Agents

- `minimax_agent`: Uses minimax algorithm with evaluation function
- Custom agents can be created following the same interface

## UI Behavior

- When a player has an agent assigned, the UI ignores human input for that player
- Agents automatically make moves with a small delay for better visualization
- The UI shows which players are controlled by AI vs human
- All game mechanics work the same regardless of agent configuration