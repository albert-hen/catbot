/**
 * Boop Game - Monte Carlo Tree Search
 * 
 * MCTS implementation for AlphaZero-style search.
 */

import { GameState } from './GameState';
import {
  gameStateToTensor,
  getCanonicalForm,
  getValidMoves,
  applyAction,
  tensorToString,
  ACTION_SIZE,
} from './tensor';

const EPS = 1e-8;

/**
 * Neural network interface - predicts policy and value for a board state.
 */
export interface NeuralNetwork {
  predict(boardState: Float32Array): Promise<{ policy: Float32Array; value: number }>;
}

/**
 * MCTS configuration options.
 */
export interface MCTSOptions {
  numSimulations: number;
  cpuct: number; // Exploration constant
}

const DEFAULT_OPTIONS: MCTSOptions = {
  numSimulations: 256,
  cpuct: 1.0,
};

/**
 * Monte Carlo Tree Search for AlphaZero.
 */
export class MCTS {
  private nnet: NeuralNetwork;
  private options: MCTSOptions;
  
  // MCTS state dictionaries (keyed by board string representation)
  private Qsa: Map<string, number>; // Q values for (s, a)
  private Nsa: Map<string, number>; // Visit counts for (s, a)
  private Ns: Map<string, number>;  // Visit counts for s
  private Ps: Map<string, Float32Array>; // Policy from neural net for s
  private Es: Map<string, number>;  // Game ended status for s
  private Vs: Map<string, Float32Array>; // Valid moves for s

  constructor(nnet: NeuralNetwork, options: Partial<MCTSOptions> = {}) {
    this.nnet = nnet;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    this.Qsa = new Map();
    this.Nsa = new Map();
    this.Ns = new Map();
    this.Ps = new Map();
    this.Es = new Map();
    this.Vs = new Map();
  }

  /**
   * Reset the MCTS tree (call between games).
   */
  reset(): void {
    this.Qsa.clear();
    this.Nsa.clear();
    this.Ns.clear();
    this.Ps.clear();
    this.Es.clear();
    this.Vs.clear();
  }

  /**
   * Get action probabilities for the given game state.
   * 
   * @param state - Current game state
   * @param player - Current player (1 = orange, -1 = gray)
   * @param temp - Temperature for action selection (0 = deterministic, 1 = proportional)
   * @returns Array of action probabilities
   */
  async getActionProb(
    state: GameState, 
    player: 1 | -1, 
    temp: number = 1
  ): Promise<Float32Array> {
    // Convert to tensor and get canonical form
    const tensor = gameStateToTensor(state);
    const canonicalBoard = getCanonicalForm(tensor, player);
    
    // Run MCTS simulations
    for (let i = 0; i < this.options.numSimulations; i++) {
      await this.search(canonicalBoard, new Set());
    }
    
    // Get visit counts for each action
    const s = tensorToString(canonicalBoard);
    const counts = new Float32Array(ACTION_SIZE);
    
    for (let a = 0; a < ACTION_SIZE; a++) {
      const key = `${s},${a}`;
      counts[a] = this.Nsa.get(key) ?? 0;
    }
    
    const probs = new Float32Array(ACTION_SIZE);
    
    if (temp === 0) {
      // Deterministic: pick best action(s)
      let maxCount = 0;
      const bestActions: number[] = [];
      
      for (let a = 0; a < ACTION_SIZE; a++) {
        if (counts[a] > maxCount) {
          maxCount = counts[a];
          bestActions.length = 0;
          bestActions.push(a);
        } else if (counts[a] === maxCount && maxCount > 0) {
          bestActions.push(a);
        }
      }
      
      if (bestActions.length > 0) {
        const bestA = bestActions[Math.floor(Math.random() * bestActions.length)];
        probs[bestA] = 1;
      }
    } else {
      // Proportional to visit counts raised to 1/temp
      let sum = 0;
      for (let a = 0; a < ACTION_SIZE; a++) {
        const powered = Math.pow(counts[a], 1 / temp);
        probs[a] = powered;
        sum += powered;
      }
      
      if (sum > 0) {
        for (let a = 0; a < ACTION_SIZE; a++) {
          probs[a] /= sum;
        }
      }
    }
    
    return probs;
  }

  /**
   * Select best action for the given state.
   * 
   * @param state - Current game state
   * @param player - Current player (1 = orange, -1 = gray)
   * @returns Best action index
   */
  async selectAction(state: GameState, player: 1 | -1): Promise<number> {
    const probs = await this.getActionProb(state, player, 0);
    
    // Find action with highest probability
    let bestAction = 0;
    let bestProb = probs[0];
    
    for (let a = 1; a < ACTION_SIZE; a++) {
      if (probs[a] > bestProb) {
        bestProb = probs[a];
        bestAction = a;
      }
    }
    
    return bestAction;
  }

  /**
   * Perform one iteration of MCTS search.
   */
  private async search(canonicalBoard: Float32Array, visited: Set<string>): Promise<number> {
    const s = tensorToString(canonicalBoard);
    
    // Check for cycles (transposition)
    if (visited.has(s)) {
      return 0;
    }
    visited.add(s);
    
    // Check if terminal state
    if (!this.Es.has(s)) {
      // Reconstruct game state to check if ended
      // Quick check using tensor values
      this.Es.set(s, this.checkGameEndedFromTensor(canonicalBoard));
    }
    
    const ended = this.Es.get(s)!;
    if (ended !== 0) {
      visited.delete(s);
      return ended;
    }
    
    // Check if leaf node (not yet expanded)
    if (!this.Ps.has(s)) {
      // Neural network evaluation
      const { policy, value } = await this.nnet.predict(canonicalBoard);
      
      // Get valid moves and mask invalid actions
      const valids = this.getValidMovesFromTensor(canonicalBoard);
      
      // Apply mask
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
        console.warn('All valid moves were masked, using uniform distribution');
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
      
      this.Ps.set(s, maskedPolicy);
      this.Vs.set(s, valids);
      this.Ns.set(s, 0);
      
      visited.delete(s);
      return value;
    }
    
    // Internal node - select action with highest UCB
    const valids = this.Vs.get(s)!;
    const ps = this.Ps.get(s)!;
    const ns = this.Ns.get(s)!;
    
    let curBest = -Infinity;
    let bestAct = -1;
    
    for (let a = 0; a < ACTION_SIZE; a++) {
      if (valids[a] > 0) {
        const key = `${s},${a}`;
        let u: number;
        
        if (this.Qsa.has(key)) {
          const q = this.Qsa.get(key)!;
          const nsa = this.Nsa.get(key)!;
          u = q + this.options.cpuct * ps[a] * Math.sqrt(ns) / (1 + nsa);
        } else {
          u = this.options.cpuct * ps[a] * Math.sqrt(ns + EPS);
        }
        
        if (u > curBest) {
          curBest = u;
          bestAct = a;
        }
      }
    }
    
    if (bestAct === -1) {
      console.error('No valid action found in MCTS search');
      visited.delete(s);
      return 0;
    }
    
    const a = bestAct;
    
    // Apply action and get next state
    const [nextState, nextPlayer] = this.applyActionToTensor(canonicalBoard, a);
    const nextCanonical = getCanonicalForm(nextState, nextPlayer);
    
    // Recursive search
    let v: number;
    if (nextPlayer === 1) {
      v = await this.search(nextCanonical, visited);
    } else {
      v = -(await this.search(nextCanonical, visited));
    }
    
    visited.delete(s);
    
    // Update Q and N values
    const key = `${s},${a}`;
    if (this.Qsa.has(key)) {
      const oldQ = this.Qsa.get(key)!;
      const oldN = this.Nsa.get(key)!;
      this.Qsa.set(key, (oldN * oldQ + v) / (oldN + 1));
      this.Nsa.set(key, oldN + 1);
    } else {
      this.Qsa.set(key, v);
      this.Nsa.set(key, 1);
    }
    
    this.Ns.set(s, ns + 1);
    
    return v;
  }

  /**
   * Check if game ended from tensor representation.
   * Returns 1 if player 1 (canonical) wins, -1 if loses, 0 if not ended.
   */
  private checkGameEndedFromTensor(tensor: Float32Array): number {
    const BOARD_SIZE = 6;
    const channelSize = BOARD_SIZE * BOARD_SIZE;
    
    // Helper to get value at [channel, row, col]
    const getAt = (channel: number, row: number, col: number): number => {
      return tensor[channel * channelSize + row * BOARD_SIZE + col];
    };
    
    // Check three cats in a row for each player
    const checkThreeCats = (catChannel: number): boolean => {
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (getAt(catChannel, r, c) !== 1) continue;
          
          // Horizontal
          if (c <= 3 && 
              getAt(catChannel, r, c + 1) === 1 && 
              getAt(catChannel, r, c + 2) === 1) {
            return true;
          }
          // Vertical
          if (r <= 3 && 
              getAt(catChannel, r + 1, c) === 1 && 
              getAt(catChannel, r + 2, c) === 1) {
            return true;
          }
          // Diagonal down-right
          if (r <= 3 && c <= 3 && 
              getAt(catChannel, r + 1, c + 1) === 1 && 
              getAt(catChannel, r + 2, c + 2) === 1) {
            return true;
          }
          // Diagonal down-left
          if (r <= 3 && c >= 2 && 
              getAt(catChannel, r + 1, c - 1) === 1 && 
              getAt(catChannel, r + 2, c - 2) === 1) {
            return true;
          }
        }
      }
      return false;
    };
    
    // Check 8 cats on board
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
  private getValidMovesFromTensor(tensor: Float32Array): Float32Array {
    const BOARD_SIZE = 6;
    const channelSize = BOARD_SIZE * BOARD_SIZE;
    
    // Reconstruct a minimal game state to get valid moves
    // This is a bit wasteful but ensures correctness
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
  private applyActionToTensor(tensor: Float32Array, action: number): [Float32Array, 1 | -1] {
    const BOARD_SIZE = 6;
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
}
