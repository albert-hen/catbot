/**
 * AI Worker
 *
 * Web Worker that runs MCTS for AI game moves in a separate thread.
 * Uses full tree search MCTS (unlike AnalysisWorker which uses simplified MCTS).
 */

import * as ort from 'onnxruntime-web';
import type { AIWorkerMessage, AIWorkerResponse } from '../game/analysisTypes';
import {
  GameState,
  ACTION_SIZE,
  NUM_CHANNELS,
  gameStateToTensor,
  getCanonicalForm,
  getValidMoves,
  applyAction,
} from '../game';

const BOARD_SIZE = 6;
const EPS = 1e-8;
const CPUCT = 1.0;

// Worker state
let session: ort.InferenceSession | null = null;

// MCTS state
let Qsa: Map<string, number> = new Map(); // Q values for (s, a)
let Nsa: Map<string, number> = new Map(); // Visit counts for (s, a)
let Ns: Map<string, number> = new Map();  // Visit counts for s
let Ps: Map<string, Float32Array> = new Map(); // Policy from neural net for s
let Es: Map<string, number> = new Map();  // Game ended status for s
let Vs: Map<string, Float32Array> = new Map(); // Valid moves for s

/**
 * Send a message to the main thread
 */
function sendMessage(msg: AIWorkerResponse): void {
  self.postMessage(msg);
}

/**
 * Initialize ONNX Runtime and load the model
 */
async function initModel(modelUrl: string): Promise<void> {
  try {
    // Configure ONNX Runtime for worker context
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

    console.log('[AIWorker] Loading ONNX model...');
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    console.log('[AIWorker] Model loaded successfully');

    sendMessage({ type: 'ready' });
  } catch (error) {
    console.error('[AIWorker] Failed to load model:', error);
    sendMessage({ type: 'error', message: `Failed to load model: ${error}` });
  }
}

/**
 * Run neural network prediction
 */
async function predict(boardState: Float32Array): Promise<{ policy: Float32Array; value: number }> {
  if (!session) {
    throw new Error('Model not loaded');
  }

  const inputTensor = new ort.Tensor(
    'float32',
    boardState,
    [1, NUM_CHANNELS, BOARD_SIZE, BOARD_SIZE]
  );

  const feeds: Record<string, ort.Tensor> = {
    board_state: inputTensor,
  };

  const results = await session.run(feeds);

  const policyData = results.policy.data as Float32Array;
  const policy = new Float32Array(ACTION_SIZE);
  for (let i = 0; i < ACTION_SIZE; i++) {
    policy[i] = Math.exp(policyData[i]);
  }

  const valueData = results.value.data as Float32Array;
  const value = valueData[0];

  return { policy, value };
}

/**
 * Convert tensor to string for hashing
 */
function tensorToString(tensor: Float32Array): string {
  const channelSize = BOARD_SIZE * BOARD_SIZE;
  const c0 = tensor[0];
  const c5 = tensor[5 * channelSize];
  const c6 = tensor[6 * channelSize];
  const c7 = tensor[7 * channelSize];
  const c8 = tensor[8 * channelSize];

  const pieces: number[] = [];
  for (let c = 1; c <= 4; c++) {
    for (let i = 0; i < channelSize; i++) {
      pieces.push(tensor[c * channelSize + i]);
    }
  }

  return `${c0},${c5},${c6},${c7},${c8},${pieces.join('')}`;
}

/**
 * Check if game ended from tensor representation.
 * Returns 1 if player 1 (canonical) wins, -1 if loses, 0 if not ended.
 */
function checkGameEndedFromTensor(tensor: Float32Array): number {
  const channelSize = BOARD_SIZE * BOARD_SIZE;

  const getAt = (channel: number, row: number, col: number): number => {
    return tensor[channel * channelSize + row * BOARD_SIZE + col];
  };

  const checkThreeCats = (catChannel: number): boolean => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (getAt(catChannel, r, c) !== 1) continue;

        // Horizontal
        if (c <= 3 && getAt(catChannel, r, c + 1) === 1 && getAt(catChannel, r, c + 2) === 1) {
          return true;
        }
        // Vertical
        if (r <= 3 && getAt(catChannel, r + 1, c) === 1 && getAt(catChannel, r + 2, c) === 1) {
          return true;
        }
        // Diagonal down-right
        if (r <= 3 && c <= 3 && getAt(catChannel, r + 1, c + 1) === 1 && getAt(catChannel, r + 2, c + 2) === 1) {
          return true;
        }
        // Diagonal down-left
        if (r <= 3 && c >= 2 && getAt(catChannel, r + 1, c - 1) === 1 && getAt(catChannel, r + 2, c - 2) === 1) {
          return true;
        }
      }
    }
    return false;
  };

  const checkEightCats = (catChannel: number): boolean => {
    let count = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (getAt(catChannel, r, c) === 1) count++;
      }
    }
    return count === 8;
  };

  // Player 1 (orange in canonical) cats are channel 3
  // Player 2 (gray in canonical) cats are channel 4
  if (checkThreeCats(3) || checkEightCats(3)) return 1;
  if (checkThreeCats(4) || checkEightCats(4)) return -1;

  return 0;
}

/**
 * Get valid moves from tensor representation.
 */
function getValidMovesFromTensor(tensor: Float32Array): Float32Array {
  const channelSize = BOARD_SIZE * BOARD_SIZE;

  // Reconstruct game state to get valid moves
  const state = new GameState();

  const getAt = (channel: number, row: number, col: number): number => {
    return tensor[channel * channelSize + row * BOARD_SIZE + col];
  };

  // Read piece positions
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (getAt(1, row, col) === 1) state.board[row][col] = 'ok';
      else if (getAt(2, row, col) === 1) state.board[row][col] = 'gk';
      else if (getAt(3, row, col) === 1) state.board[row][col] = 'oc';
      else if (getAt(4, row, col) === 1) state.board[row][col] = 'gc';
      else state.board[row][col] = null;
    }
  }

  state.availablePieces.ok = getAt(5, 0, 0);
  state.availablePieces.gk = getAt(6, 0, 0);
  state.availablePieces.oc = getAt(7, 0, 0);
  state.availablePieces.gc = getAt(8, 0, 0);

  // Canonical form always has player 1 (orange) as current
  state.currentTurn = 'orange';

  if (getAt(0, 0, 0) === 0) {
    state.stateMode = 'waiting_for_placement';
    (state as any).updateValidMoves();
  } else {
    state.stateMode = 'waiting_for_graduation_choice';
    (state as any).calculateGraduationChoices();
  }

  return getValidMoves(state, 1);
}

/**
 * Apply action to tensor and return new tensor + next player.
 */
function applyActionToTensor(tensor: Float32Array, action: number): [Float32Array, 1 | -1] {
  const channelSize = BOARD_SIZE * BOARD_SIZE;

  // Reconstruct game state
  const state = new GameState();

  const getAt = (channel: number, row: number, col: number): number => {
    return tensor[channel * channelSize + row * BOARD_SIZE + col];
  };

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (getAt(1, row, col) === 1) state.board[row][col] = 'ok';
      else if (getAt(2, row, col) === 1) state.board[row][col] = 'gk';
      else if (getAt(3, row, col) === 1) state.board[row][col] = 'oc';
      else if (getAt(4, row, col) === 1) state.board[row][col] = 'gc';
      else state.board[row][col] = null;
    }
  }

  state.availablePieces.ok = getAt(5, 0, 0);
  state.availablePieces.gk = getAt(6, 0, 0);
  state.availablePieces.oc = getAt(7, 0, 0);
  state.availablePieces.gc = getAt(8, 0, 0);

  state.currentTurn = 'orange';

  if (getAt(0, 0, 0) === 0) {
    state.stateMode = 'waiting_for_placement';
    (state as any).updateValidMoves();
  } else {
    state.stateMode = 'waiting_for_graduation_choice';
    (state as any).calculateGraduationChoices();
  }

  // Apply action
  const [newState, nextPlayer] = applyAction(state, 1, action);

  // Convert back to tensor
  const newTensor = gameStateToTensor(newState);

  return [newTensor, nextPlayer];
}

/**
 * Reset MCTS state
 */
function resetMCTS(): void {
  Qsa.clear();
  Nsa.clear();
  Ns.clear();
  Ps.clear();
  Es.clear();
  Vs.clear();
}

/**
 * Perform one MCTS simulation (full tree search)
 */
async function search(canonicalBoard: Float32Array, visited: Set<string>): Promise<number> {
  const s = tensorToString(canonicalBoard);

  // Check for cycles
  if (visited.has(s)) {
    return 0;
  }
  visited.add(s);

  // Check if terminal state
  if (!Es.has(s)) {
    Es.set(s, checkGameEndedFromTensor(canonicalBoard));
  }

  const ended = Es.get(s)!;
  if (ended !== 0) {
    visited.delete(s);
    return ended;
  }

  // Leaf node - expand
  if (!Ps.has(s)) {
    const { policy, value } = await predict(canonicalBoard);
    const valids = getValidMovesFromTensor(canonicalBoard);

    // Mask invalid actions
    const maskedPolicy = new Float32Array(ACTION_SIZE);
    let sum = 0;
    for (let a = 0; a < ACTION_SIZE; a++) {
      maskedPolicy[a] = policy[a] * valids[a];
      sum += maskedPolicy[a];
    }

    // Renormalize
    if (sum > 0) {
      for (let a = 0; a < ACTION_SIZE; a++) {
        maskedPolicy[a] /= sum;
      }
    } else {
      // If all valid moves were masked, make all valid moves equally probable
      let validCount = 0;
      for (let a = 0; a < ACTION_SIZE; a++) {
        if (valids[a] > 0) validCount++;
      }
      if (validCount > 0) {
        for (let a = 0; a < ACTION_SIZE; a++) {
          maskedPolicy[a] = valids[a] / validCount;
        }
      }
    }

    Ps.set(s, maskedPolicy);
    Vs.set(s, valids);
    Ns.set(s, 0);

    visited.delete(s);
    return value;
  }

  // Internal node - select action with highest UCB
  const valids = Vs.get(s)!;
  const ps = Ps.get(s)!;
  const ns = Ns.get(s)!;

  let curBest = -Infinity;
  let bestAct = -1;

  for (let a = 0; a < ACTION_SIZE; a++) {
    if (valids[a] > 0) {
      const key = `${s},${a}`;
      let u: number;

      if (Qsa.has(key)) {
        const q = Qsa.get(key)!;
        const nsa = Nsa.get(key)!;
        u = q + CPUCT * ps[a] * Math.sqrt(ns) / (1 + nsa);
      } else {
        u = CPUCT * ps[a] * Math.sqrt(ns + EPS);
      }

      if (u > curBest) {
        curBest = u;
        bestAct = a;
      }
    }
  }

  if (bestAct === -1) {
    visited.delete(s);
    return 0;
  }

  const a = bestAct;

  // Apply action and get next state
  const [nextState, nextPlayer] = applyActionToTensor(canonicalBoard, a);
  const nextCanonical = getCanonicalForm(nextState, nextPlayer);

  // Recursive search
  let v: number;
  if (nextPlayer === 1) {
    v = await search(nextCanonical, visited);
  } else {
    v = -(await search(nextCanonical, visited));
  }

  visited.delete(s);

  // Update Q and N values
  const key = `${s},${a}`;
  if (Qsa.has(key)) {
    const oldQ = Qsa.get(key)!;
    const oldN = Nsa.get(key)!;
    Qsa.set(key, (oldN * oldQ + v) / (oldN + 1));
    Nsa.set(key, oldN + 1);
  } else {
    Qsa.set(key, v);
    Nsa.set(key, 1);
  }

  Ns.set(s, ns + 1);

  return v;
}

/**
 * Run MCTS and return best action
 */
async function selectAction(
  canonicalBoard: Float32Array,
  numSimulations: number
): Promise<number> {
  resetMCTS();

  // Run simulations
  for (let i = 0; i < numSimulations; i++) {
    await search(canonicalBoard, new Set());
  }

  // Get best action by visit count
  const s = tensorToString(canonicalBoard);
  const valids = Vs.get(s);

  if (!valids) {
    throw new Error('No valid moves found after MCTS');
  }

  let bestAction = -1;
  let maxVisits = -1;

  for (let a = 0; a < ACTION_SIZE; a++) {
    if (valids[a] > 0) {
      const key = `${s},${a}`;
      const visits = Nsa.get(key) ?? 0;
      if (visits > maxVisits) {
        maxVisits = visits;
        bestAction = a;
      }
    }
  }

  if (bestAction === -1) {
    throw new Error('No action selected by MCTS');
  }

  return bestAction;
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<AIWorkerMessage>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init':
        console.log('[AIWorker] Received init message');
        await initModel(msg.modelUrl);
        break;

      case 'selectAction':
        console.log(`[AIWorker] Received selectAction message (${msg.numSimulations} sims)`);
        try {
          const action = await selectAction(msg.position, msg.numSimulations);
          console.log(`[AIWorker] Selected action: ${action}`);
          sendMessage({ type: 'action', action });
        } catch (error) {
          console.error('[AIWorker] Error selecting action:', error);
          sendMessage({ type: 'error', message: `Action selection error: ${error}` });
        }
        break;
    }
  } catch (error) {
    console.error('[AIWorker] Error handling message:', error);
    sendMessage({ type: 'error', message: `Worker error: ${error}` });
  }
};

console.log('[AIWorker] Worker initialized');
