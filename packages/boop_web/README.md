# Boop Web UI

Browser-based implementation of the Boop board game with React, TypeScript, and ONNX Runtime for AI inference.

## Features

- Play the Boop game directly in your browser
- AI opponents powered by AlphaZero neural networks (runs locally via ONNX Runtime)
- Real-time game state visualization
- Responsive board UI with piece interactions

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

### Testing

```bash
npm run test          # Run tests in watch mode
npm run test:run      # Run tests once
```

## Architecture

The web UI is a single-page React application that:
- Loads the ONNX model from `public/model.onnx` (exported via `scripts/export_onnx.py`)
- Implements Monte Carlo Tree Search (MCTS) in TypeScript for AlphaZero agent decisions
- Converts game state to tensor format matching the Python backend

### Key Files

- `src/components/Board.tsx` - Game board UI and piece rendering
- `src/game/GameState.ts` - Game state management
- `src/game/MCTS.ts` - Monte Carlo Tree Search implementation
- `src/game/NeuralNetwork.ts` - ONNX model inference wrapper
- `src/game/tensor.ts` - Game state to tensor conversion

## Model Setup

To use AlphaZero agents in the web UI:

1. **Set up Python environment** (from project root):
   ```bash
   cd /path/to/catbot
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Train AlphaZero model**:
   ```bash
   python -m packages.boop_agents.alphazero.main
   ```

3. **Export model to ONNX** (automatically saves to `packages/boop_web/public/model.onnx`):
   ```bash
   python scripts/export_onnx.py
   ```

4. **Restart dev server** (from `packages/boop_web/`):
   ```bash
   npm run dev
   ```
