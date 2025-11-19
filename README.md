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