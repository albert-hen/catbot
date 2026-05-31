/**
 * AlphaZero Worker
 *
 * Web worker with a single ONNX runtime and persistent MCTS tree.
 * Searches continuously in the background. The main thread controls
 * position and requests moves/snapshots via simple messages.
 */

import * as ort from 'onnxruntime-web';
import type {
  AnalysisResult,
  AlphaZeroWorkerMessage,
  AlphaZeroWorkerResponse,
  MoveCandidate,
  PolicyOverlay,
  ActionStats,
} from '../game/analysisTypes';
import {
  GameState,
  ACTION_SIZE,
  NUM_CHANNELS,
  actionToMove,
  MoveType,
  gameStateToTensor,
  getCanonicalForm,
  getValidMoves,
  applyAction,
} from '../game';

const BOARD_SIZE = 6;
const EPS = 1e-8;
const CPUCT = 1.0;
// ONNX session
let session: ort.InferenceSession | null = null;

// Persistent MCTS tree
let Qsa: Map<string, number> = new Map();
let Nsa: Map<string, number> = new Map();
let Ns: Map<string, number> = new Map();
let Ps: Map<string, Float32Array> = new Map();
let Es: Map<string, number> = new Map();
let Vs: Map<string, Float32Array> = new Map();

// Current position (swapped atomically by message handler)
let currentPosition: Float32Array | null = null;
let currentPlayer: 1 | -1 = 1;
let positionSetTime: number = Date.now();

// Move request (set by message handler, consumed by background loop)
let searchingForMove = false;
let moveTargetSims = 0;

function sendMessage(msg: AlphaZeroWorkerResponse): void {
  self.postMessage(msg);
}

async function initModel(modelUrl: string): Promise<void> {
  try {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

    console.log('[AlphaZeroWorker] Loading ONNX model...');
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    console.log('[AlphaZeroWorker] Model loaded successfully');

    sendMessage({ type: 'ready' });

    // Start the background search loop
    backgroundLoop();
  } catch (error) {
    console.error('[AlphaZeroWorker] Failed to load model:', error);
    sendMessage({ type: 'error', message: `Failed to load model: ${error}` });
  }
}

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

function checkGameEndedFromTensor(tensor: Float32Array): number {
  const channelSize = BOARD_SIZE * BOARD_SIZE;

  const getAt = (channel: number, row: number, col: number): number => {
    return tensor[channel * channelSize + row * BOARD_SIZE + col];
  };

  const checkThreeCats = (catChannel: number): boolean => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (getAt(catChannel, r, c) !== 1) continue;
        if (c <= 3 && getAt(catChannel, r, c + 1) === 1 && getAt(catChannel, r, c + 2) === 1) return true;
        if (r <= 3 && getAt(catChannel, r + 1, c) === 1 && getAt(catChannel, r + 2, c) === 1) return true;
        if (r <= 3 && c <= 3 && getAt(catChannel, r + 1, c + 1) === 1 && getAt(catChannel, r + 2, c + 2) === 1) return true;
        if (r <= 3 && c >= 2 && getAt(catChannel, r + 1, c - 1) === 1 && getAt(catChannel, r + 2, c - 2) === 1) return true;
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

  if (checkThreeCats(3) || checkEightCats(3)) return 1;
  if (checkThreeCats(4) || checkEightCats(4)) return -1;

  return 0;
}

function getValidMovesFromTensor(tensor: Float32Array): Float32Array {
  const channelSize = BOARD_SIZE * BOARD_SIZE;
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

  return getValidMoves(state, 1);
}

function applyActionToTensor(tensor: Float32Array, action: number): [Float32Array, 1 | -1] {
  const channelSize = BOARD_SIZE * BOARD_SIZE;
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

  const [newState, nextPlayer] = applyAction(state, 1, action);
  const newTensor = gameStateToTensor(newState);

  return [newTensor, nextPlayer];
}

async function mctsSearch(canonicalBoard: Float32Array, visited: Set<string>): Promise<number> {
  const s = tensorToString(canonicalBoard);

  if (visited.has(s)) return 0;
  visited.add(s);

  if (!Es.has(s)) {
    Es.set(s, checkGameEndedFromTensor(canonicalBoard));
  }

  const ended = Es.get(s)!;
  if (ended !== 0) {
    visited.delete(s);
    return ended;
  }

  if (!Ps.has(s)) {
    const { policy, value } = await predict(canonicalBoard);
    const valids = getValidMovesFromTensor(canonicalBoard);

    const maskedPolicy = new Float32Array(ACTION_SIZE);
    let sum = 0;
    for (let a = 0; a < ACTION_SIZE; a++) {
      maskedPolicy[a] = policy[a] * valids[a];
      sum += maskedPolicy[a];
    }

    if (sum > 0) {
      for (let a = 0; a < ACTION_SIZE; a++) {
        maskedPolicy[a] /= sum;
      }
    } else {
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
  const [nextState, nextPlayer] = applyActionToTensor(canonicalBoard, a);
  const nextCanonical = getCanonicalForm(nextState, nextPlayer);

  let v: number;
  if (nextPlayer === 1) {
    v = await mctsSearch(nextCanonical, visited);
  } else {
    v = -(await mctsSearch(nextCanonical, visited));
  }

  visited.delete(s);

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

function getRootSimCount(): number {
  if (!currentPosition) return 0;
  const s = tensorToString(currentPosition);
  return Ns.get(s) ?? 0;
}

function getBestAction(): number {
  if (!currentPosition) return -1;

  const s = tensorToString(currentPosition);
  const valids = Vs.get(s);
  if (!valids) return -1;

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

  return bestAction;
}

function getMoveDescription(action: number): string {
  const { position, moveType } = actionToMove(action);
  const [row, col] = position;

  switch (moveType) {
    case MoveType.PLACE_KITTEN:
      return `Place kitten at (${row}, ${col})`;
    case MoveType.PLACE_CAT:
      return `Place cat at (${row}, ${col})`;
    case MoveType.SINGLE_GRADUATION:
      return `Graduate piece at (${row}, ${col})`;
    case MoveType.HORIZONTAL_TRIPLE_GRADUATION:
      return `Graduate 3 horizontal at row ${row}`;
    case MoveType.VERTICAL_TRIPLE_GRADUATION:
      return `Graduate 3 vertical at col ${col}`;
    case MoveType.DIAGONAL_TRIPLE_GRADUATION_UP:
      return `Graduate 3 diagonal (/) at (${row}, ${col})`;
    case MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN:
      return `Graduate 3 diagonal (\\) at (${row}, ${col})`;
    default:
      return `Action ${action}`;
  }
}

function buildAnalysisResult(): AnalysisResult {
  if (!currentPosition) {
    throw new Error('No position to analyze');
  }

  const s = tensorToString(currentPosition);
  const totalSims = Ns.get(s) ?? 0;

  const ps = Ps.get(s);
  const ns = totalSims;
  const valids = Vs.get(s);

  let rawValue = 0;
  if (ps) {
    let totalVisits = 0;
    let weightedQ = 0;
    for (let a = 0; a < ACTION_SIZE; a++) {
      const key = `${s},${a}`;
      const nsa = Nsa.get(key) ?? 0;
      const qsa = Qsa.get(key) ?? 0;
      if (nsa > 0) {
        weightedQ += qsa * nsa;
        totalVisits += nsa;
      }
    }
    if (totalVisits > 0) {
      rawValue = weightedQ / totalVisits;
    }
  }

  const topMoves: MoveCandidate[] = [];
  if (ps && valids) {
    const actions: ActionStats[] = [];

    for (let a = 0; a < ACTION_SIZE; a++) {
      if (valids[a] > 0) {
        const key = `${s},${a}`;
        const nsa = Nsa.get(key) ?? 0;
        const qsa = Qsa.get(key) ?? 0;

        actions.push({
          action: a,
          visits: nsa,
          qValue: qsa,
          prior: ps[a],
        });
      }
    }

    actions.sort((a, b) => b.visits - a.visits);

    for (const a of actions) {
      if (a.visits === 0) continue;
      const { position, moveType } = actionToMove(a.action);

      topMoves.push({
        action: a.action,
        position,
        moveType,
        moveDescription: getMoveDescription(a.action),
        visitCount: a.visits,
        qValue: a.qValue,
        priorProbability: a.prior,
        visitPercentage: ns > 0 ? (a.visits / ns) * 100 : 0,
        winProbability: ((a.qValue + 1) / 2) * 100,
      });
    }
  }

  const cellProbabilities = new Map<string, number>();
  let maxProbability = 0;

  if (valids && ns > 0) {
    for (let a = 0; a < 72; a++) {
      if (valids[a] > 0) {
        const key = `${s},${a}`;
        const nsa = Nsa.get(key) ?? 0;
        if (nsa === 0) continue;

        const { position } = actionToMove(a);
        const [row, col] = position;
        const cellKey = `${row},${col}`;

        const existing = cellProbabilities.get(cellKey) ?? 0;
        const newCount = existing + nsa;
        cellProbabilities.set(cellKey, newCount);

        if (newCount > maxProbability) {
          maxProbability = newCount;
        }
      }
    }
  }

  const policyOverlay: PolicyOverlay = {
    cellProbabilities,
    maxProbability,
  };

  const orangeValue = currentPlayer === 1 ? rawValue : -rawValue;
  const winProb = ((orangeValue + 1) / 2) * 100;
  const player = currentPlayer === 1 ? 'orange' : 'gray';
  const evaluation = {
    value: orangeValue,
    winProbability: winProb,
    description: orangeValue > 0.1
      ? `Orange is winning (+${orangeValue.toFixed(2)})`
      : orangeValue < -0.1
      ? `Gray is winning (${orangeValue.toFixed(2)})`
      : 'Position is even',
  };

  return {
    timestamp: Date.now(),
    positionHash: s,
    currentPlayer: player,
    evaluation,
    topMoves,
    policyOverlay,
    searchStats: {
      totalSimulations: totalSims,
      nodesExplored: Ns.size,
      searchTimeMs: Date.now() - positionSetTime,
    },
    status: 'analyzing',
  };
}

/**
 * Background search loop. Runs forever after model loads.
 * Searches the current position continuously. When a move is requested,
 * runs remaining sims and returns the result, then resumes background search.
 */
async function backgroundLoop(): Promise<void> {
  while (true) {
    const pos = currentPosition;
    if (!pos) {
      await new Promise(resolve => setTimeout(resolve, 50));
      continue;
    }

    // Fulfill move request: run sims until target, return best action
    if (searchingForMove) {
      const remaining = moveTargetSims - getRootSimCount();
      for (let i = 0; i < remaining; i++) {
        await mctsSearch(pos, new Set());
        // Yield every 50 sims to allow getSnapshot messages through
        if (i % 50 === 49) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      const action = getBestAction();
      if (action >= 0) {
        sendMessage({ type: 'moveResult', action });
      } else {
        sendMessage({ type: 'error', message: 'No valid action found' });
      }

      searchingForMove = false;
      moveTargetSims = 0;
      continue;
    }

    // Background search: run a batch, yield
    for (let i = 0; i < 10; i++) {
      await mctsSearch(pos, new Set());
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<AlphaZeroWorkerMessage>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init':
        await initModel(msg.modelUrl);
        break;

      case 'setPosition':
        currentPosition = msg.position;
        currentPlayer = msg.player;
        positionSetTime = Date.now();
        break;

      case 'requestMove':
        searchingForMove = true;
        moveTargetSims = msg.numSimulations;
        break;

      case 'getSnapshot':
        if (currentPosition) {
          sendMessage({ type: 'snapshot', result: buildAnalysisResult() });
        } else {
          sendMessage({ type: 'error', message: 'No position set' });
        }
        break;
    }
  } catch (error) {
    console.error('[AlphaZeroWorker] Error handling message:', error);
    sendMessage({ type: 'error', message: `Worker error: ${error}` });
  }
};
