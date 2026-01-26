# Boop Core Game Engine

Core game logic for the Boop board game. No dependencies on UI or AI agents.

## Overview

This package provides the fundamental game mechanics:
- Board state management
- Piece placement and booping
- Graduation (kitten → cat promotion)
- Win condition checking

## Key Components

### GameState

The main class representing the current game state:

```python
from packages.boop_core.game import GameState

game = GameState()
game.place_piece("ok", (2, 2))  # Place orange kitten at position (2, 2)
```

### Game States

The game operates in two modes:

```python
STATE_WAITING_FOR_PLACEMENT        # Normal play - place a piece
STATE_WAITING_FOR_GRADUATION_CHOICE # Player has multiple graduation options
```

After placing a piece that creates three-in-a-row, the game may enter graduation mode before switching turns.

### Piece Types

- `ok` - Orange kitten
- `gk` - Gray kitten  
- `oc` - Orange cat
- `gc` - Gray cat

### Core Methods

```python
# Place a piece and handle booping
result = game.place_piece(piece_type, position)

# Choose graduation when multiple options available
game.choose_graduation(choice)

# Get valid moves for current state
moves = game.get_valid_moves()

# Check for win condition
winner = game.check_win()
```

## Booping Rules

When a piece is placed:
1. Adjacent pieces in all 8 directions are "booped" (pushed away)
2. Kittens can only boop kittens
3. Cats can boop both kittens and cats
4. Pieces pushed off the board are returned to the player

## Graduation Rules

When a player gets three pieces of the same type in a row:
1. Those three pieces are removed from the board
2. The player gets 3 cats to place (or returns 3 cats if already graduated)
3. If multiple sets of three exist, the player chooses which to graduate

## Win Conditions

A player wins by:
- Getting **three cats** in a row, OR
- Placing **eight cats** on the board (when no more cats available)

## Testing

```bash
python -m unittest packages.boop_core.tests.test_game
```

Tests cover:
- Basic piece placement and movement
- Booping mechanics
- Graduation logic
- Win conditions
- Edge cases

## Usage in AI Agents

AI agents receive a `GameState` object and return moves:

```python
def my_agent(game_state: GameState) -> tuple:
    if game_state.state == STATE_WAITING_FOR_PLACEMENT:
        return ("place", (piece_type, position))
    else:
        return ("graduate", choice)
```

See [../boop_agents/](../boop_agents/) for AI implementation examples.
