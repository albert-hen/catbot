# Boop Desktop UI (Pygame)

Desktop application for playing Boop with human and AI players.

## Installation

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

### Human vs Human (Default)

```bash
python -m packages.boop_pygame.main
```

### Playing Against AI

**Minimax Agent:**
```bash
# Orange (you) vs Gray AI
python -m packages.boop_pygame.main --gray-ai

# Orange AI vs Gray (you)
python -m packages.boop_pygame.main --orange-ai

# Watch two Minimax AIs play
python -m packages.boop_pygame.main --both-ai
```

**AlphaZero Agent:**
```bash
# Orange (you) vs Gray AlphaZero
python -m packages.boop_pygame.main --gray-alphazero=temp/best.pth.tar

# Orange AlphaZero vs Gray (you)
python -m packages.boop_pygame.main --orange-alphazero=temp/best.pth.tar

# Watch two AlphaZero agents play
python -m packages.boop_pygame.main --both-alphazero=temp/best.pth.tar
```

Replace `temp/best.pth.tar` with the path to your trained model checkpoint.

## Demo Scripts

Explore game states and mechanics:

```bash
# Random game state visualization
python -m packages.boop_pygame.demo.demo_random_game_state_ui

# Eight cat win condition demo
python -m packages.boop_pygame.demo.demo_eight_cat_win

# Graduation with eight pieces on board
python -m packages.boop_pygame.demo.demo_graduate_eight_on_board
```

## UI Controls

- **Click** to select and place pieces
- **ESC** or close window to quit
- Game automatically handles graduation choices when multiple options are available

## Agent Behavior

- When an AI agent is assigned to a player, human input is ignored for that player
- Agents make moves with a small delay for better visualization
- Both minimax and AlphaZero agents handle placement and graduation moves

## Training AI Agents

- **Minimax**: Ready to use, no training required
- **AlphaZero**: See [../boop_agents/alphazero/README.md](../boop_agents/alphazero/README.md) for training instructions
