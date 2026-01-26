# Catbot

Implementation of the Boop board game with AI agents, featuring minimax and AlphaZero players.

## Project Overview

This project provides multiple ways to play and develop AI for the Boop board game:

- **[Desktop UI](packages/boop_pygame/)** - Pygame application with human and AI players
- **[Web UI](packages/boop_web/)** - Browser-based React app with ONNX model inference
- **[AlphaZero Training](packages/boop_agents/alphazero/)** - Self-play reinforcement learning
- **[Game Engine](packages/boop_core/)** - Core game logic and rules

## Quick Start

### Play the Desktop Game

```bash
# Setup
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run
python -m packages.boop_pygame.main
```

See [packages/boop_pygame/](packages/boop_pygame/) for AI opponent options and advanced usage.

### Play in Browser

```bash
cd packages/boop_web
npm install
npm run dev
```

See [packages/boop_web/README.md](packages/boop_web/README.md) for details.

## Project Structure

```
packages/
├── boop_core/          # Game logic (board state, rules, movement)
├── boop_pygame/        # Desktop Pygame UI
├── boop_agents/
│   ├── minimax/        # Minimax search AI
│   └── alphazero/      # AlphaZero training and agent
└── boop_web/           # React/TypeScript web UI
```

## Testing

```bash
# Core game tests
python -m unittest packages.boop_core.tests.test_game

# AlphaZero tests
python -m unittest packages.boop_agents.alphazero.tests.test_boop_game

# Web UI tests
cd packages/boop_web && npm run test
```