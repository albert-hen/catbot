/**
 * Analysis Worker
 *
 * Web Worker that runs MCTS analysis in a separate thread.
 * Communicates with the main thread via postMessage.
 */

import * as ort from 'onnxruntime-web';
import type {
  AnalysisConfig,
  AnalysisResult,
  AnalysisWorkerMessage,
  AnalysisWorkerResponse,
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

// Worker state
let session: ort.InferenceSession | null = null;
let isAnalyzing = false;
let currentPosition: Float32Array | null = null;
let currentPlayer: 1 | -1 = 1;
let currentConfig: AnalysisConfig | null = null;
let abortAnalysis = false;

// MCTS state (rebuilt on each position change)
let Qsa: Map<string, number> = new Map();
let Nsa: Map<string, number> = new Map();
let Ns: Map<string, number> = new Map();
let Ps: Map<string, Float32Array> = new Map();
let Es: Map<string, number> = new Map();  // Game ended status
let Vs: Map<string, Float32Array> = new Map();

const EPS = 1e-8;
const CPUCT = 1.0;

/**
 * Send a message to the main thread
 */
function sendMessage(msg: AnalysisWorkerResponse): void {
  self.postMessage(msg);
}

/**
 * Initialize ONNX Runtime and load the model
 */
async function initModel(modelUrl: string): Promise<void> {
  try {
    // Configure ONNX Runtime for worker context
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

    console.log('[AnalysisWorker] Loading ONNX model...');
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    console.log('[AnalysisWorker] Model loaded successfully');

    sendMessage({ type: 'ready' });
  } catch (error) {
    console.error('[AnalysisWorker] Failed to load model:', error);
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
 * Get valid moves from tensor representation.
 * Reconstructs GameState to properly calculate valid moves.
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
 * Check if game ended from tensor representation.
 * Returns 1 if player 1 (canonical) wins, -1 if loses, 0 if not ended.
 */
function checkGameEnded(tensor: Float32Array): number {
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

  return 0; // Not ended
}

/**
 * Run a single MCTS simulation
 */
async function mctsSearch(canonicalBoard: Float32Array, visited: Set<string>): Promise<number> {
  const s = tensorToString(canonicalBoard);

  // Check for cycles
  if (visited.has(s)) return 0;
  visited.add(s);

  // Check if terminal state (with caching)
  if (!Es.has(s)) {
    Es.set(s, checkGameEnded(canonicalBoard));
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

  // Select action with highest UCB
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
    v = await mctsSearch(nextCanonical, visited);
  } else {
    v = -(await mctsSearch(nextCanonical, visited));
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
function buildAnalysisResult(
  positionHash: string,
  totalSims: number,
  startTime: number
): AnalysisResult {
  if (!currentPosition || !currentConfig) {
    throw new Error('No position to analyze');
  }

  const s = tensorToString(currentPosition);

  // Get state statistics
  const ps = Ps.get(s);
  const ns = Ns.get(s) ?? 0;
  const valids = Vs.get(s);

  // Calculate raw value from neural network
  let rawValue = 0;
  if (ps) {
    // Use weighted Q values as estimate
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

  // Build top moves list
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

    // Sort by visits
    actions.sort((a, b) => b.visits - a.visits);

    // Show all moves with visits > 0
    for (const a of actions) {
      if (a.visits === 0) continue; // Skip unvisited moves
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

  // Build policy overlay from visit counts (not policy priors)
  const cellProbabilities = new Map<string, number>();
  let maxProbability = 0;

  if (valids && ns > 0) {
    for (let a = 0; a < 72; a++) {  // Only placement actions for overlay
      if (valids[a] > 0) {
        const key = `${s},${a}`;
        const nsa = Nsa.get(key) ?? 0;
        if (nsa === 0) continue;

        const { position } = actionToMove(a);
        const [row, col] = position;
        const cellKey = `${row},${col}`;

        // Combine kitten and cat visit counts for same position
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

  // Convert value to always be from Orange's perspective for display
  // rawValue is from current player's perspective, so negate if Gray's turn
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
 * Reset MCTS state for new position
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
 * Main analysis loop
 */
async function runAnalysis(): Promise<void> {
  if (!session || !currentPosition || !currentConfig) {
    console.log('[AnalysisWorker] Cannot start analysis - missing session, position, or config');
    return;
  }

  console.log('[AnalysisWorker] Starting analysis loop');
  isAnalyzing = true;
  abortAnalysis = false;
  resetMCTS();

  const positionHash = tensorToString(currentPosition);
  const startTime = Date.now();
  let totalSims = 0;
  let lastUpdateTime = startTime;

  try {
    while (!abortAnalysis && isAnalyzing) {
      // Run a batch of simulations
      const batchSize = 10;
      for (let i = 0; i < batchSize && !abortAnalysis; i++) {
        try {
          await mctsSearch(currentPosition!, new Set());
          totalSims++;
        } catch (searchError) {
          console.error('[AnalysisWorker] Error in mctsSearch:', searchError);
        }
      }

      // Send update if enough time has passed
      const now = Date.now();
      if (now - lastUpdateTime >= currentConfig!.updateIntervalMs) {
        try {
          const result = buildAnalysisResult(positionHash, totalSims, startTime);
          sendMessage({ type: 'update', result });
          lastUpdateTime = now;
          console.log(`[AnalysisWorker] Sent update: ${totalSims} sims, ${result.topMoves.length} top moves`);
        } catch (buildError) {
          console.error('[AnalysisWorker] Error building result:', buildError);
        }
      }

      // Yield to allow message processing
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Send final result
    if (!abortAnalysis && currentPosition) {
      const result = buildAnalysisResult(positionHash, totalSims, startTime);
      result.status = 'complete';
      sendMessage({ type: 'update', result });
      console.log('[AnalysisWorker] Sent final result');
    }
  } catch (error) {
    console.error('[AnalysisWorker] Error in analysis loop:', error);
    sendMessage({ type: 'error', message: `Analysis error: ${error}` });
  } finally {
    isAnalyzing = false;
    console.log('[AnalysisWorker] Analysis loop ended');
  }
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<AnalysisWorkerMessage>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init':
        console.log('[AnalysisWorker] Received init message');
        await initModel(msg.modelUrl);
        break;

      case 'analyze':
        console.log('[AnalysisWorker] Received analyze message');
        // Stop any current analysis
        abortAnalysis = true;

        // Wait for current analysis to stop (with timeout)
        let waitCount = 0;
        while (isAnalyzing && waitCount < 100) {
          await new Promise(resolve => setTimeout(resolve, 10));
          waitCount++;
        }
        if (isAnalyzing) {
          console.warn('[AnalysisWorker] Timeout waiting for previous analysis to stop');
          isAnalyzing = false;
        }

        // Start new analysis
        currentPosition = msg.position;
        currentPlayer = msg.player;
        currentConfig = msg.config;
        // Don't await - let it run in background
        runAnalysis().catch(err => {
          console.error('[AnalysisWorker] Unhandled error in runAnalysis:', err);
          sendMessage({ type: 'error', message: `Analysis error: ${err}` });
        });
        break;

      case 'stop':
        console.log('[AnalysisWorker] Received stop message');
        abortAnalysis = true;
        break;
    }
  } catch (error) {
    console.error('[AnalysisWorker] Error handling message:', error);
    sendMessage({ type: 'error', message: `Worker error: ${error}` });
  }
};

// Signal that worker is ready to receive messages
console.log('[AnalysisWorker] Worker initialized');
