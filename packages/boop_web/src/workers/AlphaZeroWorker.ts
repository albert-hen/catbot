/**
 * AlphaZero Worker
 *
 * Unified web worker that runs a single ONNX runtime and persistent MCTS tree.
 * Handles both AI move selection and continuous analysis from a single thread.
 * The MCTS tree persists across moves, reusing explored nodes.
 */

import * as ort from 'onnxruntime-web';
import type {
  AnalysisConfig,
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
const MAX_NODES = 1000000;

// ONNX session
let session: ort.InferenceSession | null = null;

// Persistent MCTS tree (shared across AI and analysis)
let Qsa: Map<string, number> = new Map();
let Nsa: Map<string, number> = new Map();
let Ns: Map<string, number> = new Map();
let Ps: Map<string, Float32Array> = new Map();
let Es: Map<string, number> = new Map();
let Vs: Map<string, Float32Array> = new Map();

// Current position state
let currentPosition: Float32Array | null = null;
let currentPlayer: 1 | -1 = 1;

// Analysis state
let analysisEnabled = false;
let analysisConfig: AnalysisConfig | null = null;
let analysisRunning = false;
let abortAnalysis = false;

// Move request state
let moveRequested = false;
let moveNumSimulations = 0;
let moveResolve: (() => void) | null = null;

/**
 * Send a message to the main thread
 */
function sendMessage(msg: AlphaZeroWorkerResponse): void {
  self.postMessage(msg);
}

/**
 * Initialize ONNX Runtime and load the model
 */
async function initModel(modelUrl: string): Promise<void> {
  try {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

    console.log('[AlphaZeroWorker] Loading ONNX model...');
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    console.log('[AlphaZeroWorker] Model loaded successfully');

    sendMessage({ type: 'ready' });
  } catch (error) {
    console.error('[AlphaZeroWorker] Failed to load model:', error);
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

/**
 * Get valid moves from tensor representation.
 */
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

/**
 * Apply action to tensor and return new tensor + next player.
 */
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

/**
 * Prune MCTS tree by evicting least-visited nodes when over budget.
 */
function pruneIfNeeded(): void {
  if (Ns.size <= MAX_NODES) return;

  // Collect all state keys with their visit counts
  const entries: [string, number][] = [];
  for (const [key, visits] of Ns) {
    entries.push([key, visits]);
  }

  // Sort by visits ascending (evict least visited first)
  entries.sort((a, b) => a[1] - b[1]);

  // Keep the current root if we have one
  const rootHash = currentPosition ? tensorToString(currentPosition) : null;

  // Evict until under budget
  const toEvict = entries.length - MAX_NODES;
  let evicted = 0;
  for (const [stateKey] of entries) {
    if (evicted >= toEvict) break;
    if (stateKey === rootHash) continue; // Never evict root

    // Remove from all maps
    Ns.delete(stateKey);
    Ps.delete(stateKey);
    Es.delete(stateKey);
    Vs.delete(stateKey);

    // Remove all (state, action) entries for this state
    for (let a = 0; a < ACTION_SIZE; a++) {
      const saKey = `${stateKey},${a}`;
      Qsa.delete(saKey);
      Nsa.delete(saKey);
    }

    evicted++;
  }

  if (evicted > 0) {
    console.log(`[AlphaZeroWorker] Pruned ${evicted} nodes, ${Ns.size} remaining`);
  }
}

/**
 * Perform one MCTS simulation
 */
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

  // Leaf node - expand
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

/**
 * Get the number of simulations run for the current root position
 */
function getRootSimCount(): number {
  if (!currentPosition) return 0;
  const s = tensorToString(currentPosition);
  return Ns.get(s) ?? 0;
}

/**
 * Get best action from current tree for the root position
 */
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

/**
 * Get move description from action
 */
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

/**
 * Build analysis result from current MCTS state
 */
function buildAnalysisResult(startTime: number): AnalysisResult {
  if (!currentPosition) {
    throw new Error('No position to analyze');
  }

  const s = tensorToString(currentPosition);
  const positionHash = s;
  const totalSims = Ns.get(s) ?? 0;

  const ps = Ps.get(s);
  const ns = totalSims;
  const valids = Vs.get(s);

  // Calculate value from weighted Q values
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

  // Build top moves
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

  // Build policy overlay from visit counts
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

  // Convert value to Orange's perspective
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
    positionHash,
    currentPlayer: player,
    evaluation,
    topMoves,
    policyOverlay,
    searchStats: {
      totalSimulations: totalSims,
      nodesExplored: Ns.size,
      searchTimeMs: Date.now() - startTime,
    },
    status: 'analyzing',
  };
}

/**
 * Main continuous search loop.
 * Runs MCTS simulations on the current position.
 * Pauses when a move is requested, fulfills it, then resumes.
 * Sends analysis updates periodically when analysis is enabled.
 */
async function runSearchLoop(): Promise<void> {
  if (!session || !currentPosition) return;

  analysisRunning = true;
  abortAnalysis = false;

  const startTime = Date.now();
  let lastUpdateTime = startTime;

  try {
    while (!abortAnalysis) {
      // Check if a move has been requested
      if (moveRequested) {
        // Run additional sims if needed to reach the requested count
        const currentSims = getRootSimCount();
        const remaining = moveNumSimulations - currentSims;

        if (remaining > 0) {
          let lastMoveUpdateTime = Date.now();
          for (let i = 0; i < remaining && !abortAnalysis; i++) {
            await mctsSearch(currentPosition!, new Set());
            if (analysisEnabled && analysisConfig) {
              const now = Date.now();
              if (now - lastMoveUpdateTime >= analysisConfig.updateIntervalMs) {
                try {
                  const result = buildAnalysisResult(startTime);
                  sendMessage({ type: 'analysisUpdate', result });
                } catch (_) {}
                lastMoveUpdateTime = now;
              }
            }
          }
        }

        // Return the best action
        const action = getBestAction();
        if (action >= 0) {
          sendMessage({ type: 'moveResult', action });
        } else {
          sendMessage({ type: 'error', message: 'No valid action found' });
        }

        moveRequested = false;
        moveNumSimulations = 0;
        if (moveResolve) {
          moveResolve();
          moveResolve = null;
        }

        // Send analysis update with the fully-searched tree
        if (analysisEnabled && analysisConfig) {
          try {
            const result = buildAnalysisResult(startTime);
            sendMessage({ type: 'analysisUpdate', result });
          } catch (_) {}
        }

        // Continue searching after returning the move
        continue;
      }

      // Run a batch of simulations
      const batchSize = 10;
      for (let i = 0; i < batchSize && !abortAnalysis && !moveRequested; i++) {
        try {
          await mctsSearch(currentPosition!, new Set());
        } catch (searchError) {
          console.error('[AlphaZeroWorker] Error in mctsSearch:', searchError);
        }
      }

      // Prune if tree is too large
      pruneIfNeeded();

      // Send analysis update if enabled and enough time has passed
      if (analysisEnabled && analysisConfig) {
        const now = Date.now();
        if (now - lastUpdateTime >= analysisConfig.updateIntervalMs) {
          try {
            const result = buildAnalysisResult(startTime);
            sendMessage({ type: 'analysisUpdate', result });
            lastUpdateTime = now;
          } catch (buildError) {
            console.error('[AlphaZeroWorker] Error building result:', buildError);
          }
        }
      }

      // Yield to allow message processing
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) {
    console.error('[AlphaZeroWorker] Error in search loop:', error);
    sendMessage({ type: 'error', message: `Search error: ${error}` });
  } finally {
    analysisRunning = false;
    console.log('[AlphaZeroWorker] Search loop ended');
  }
}

/**
 * Set a new position. The tree is kept (nodes are reused).
 */
function setPosition(position: Float32Array, player: 1 | -1): void {
  currentPosition = position;
  currentPlayer = player;

  // Tree is kept — existing nodes for this position (and its children)
  // will be reused automatically on the next search.
  console.log(`[AlphaZeroWorker] Position set, tree has ${Ns.size} nodes`);
}

/**
 * Start or restart the search loop for the current position
 */
async function ensureSearchRunning(): Promise<void> {
  if (analysisRunning) {
    // Already running, it will pick up the new position naturally
    return;
  }

  if (!session || !currentPosition) return;

  runSearchLoop().catch(err => {
    console.error('[AlphaZeroWorker] Unhandled error in search loop:', err);
    sendMessage({ type: 'error', message: `Search error: ${err}` });
  });
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<AlphaZeroWorkerMessage>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init':
        console.log('[AlphaZeroWorker] Received init message');
        await initModel(msg.modelUrl);
        break;

      case 'setPosition': {
        // Stop current search loop
        abortAnalysis = true;

        // Wait for loop to stop
        let waitCount = 0;
        while (analysisRunning && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 10));
          waitCount++;
        }
        if (analysisRunning) {
          console.warn('[AlphaZeroWorker] Timeout waiting for search loop to stop');
          analysisRunning = false;
        }

        setPosition(msg.position, msg.player);

        // Restart the search loop
        ensureSearchRunning();
        break;
      }

      case 'requestMove':
        console.log(`[AlphaZeroWorker] Move requested (${msg.numSimulations} sims)`);
        moveRequested = true;
        moveNumSimulations = msg.numSimulations;

        // If the loop isn't running, we need to start it
        if (!analysisRunning && currentPosition) {
          ensureSearchRunning();
        }
        break;

      case 'setAnalysisEnabled':
        analysisEnabled = msg.enabled;
        if (msg.config) {
          analysisConfig = msg.config;
        }
        console.log(`[AlphaZeroWorker] Analysis ${msg.enabled ? 'enabled' : 'disabled'}`);

        // If enabling and we have a position, ensure search is running
        if (msg.enabled && currentPosition && !analysisRunning) {
          ensureSearchRunning();
        }
        break;

      case 'stop':
        console.log('[AlphaZeroWorker] Received stop message');
        abortAnalysis = true;
        break;
    }
  } catch (error) {
    console.error('[AlphaZeroWorker] Error handling message:', error);
    sendMessage({ type: 'error', message: `Worker error: ${error}` });
  }
};

console.log('[AlphaZeroWorker] Worker initialized');
