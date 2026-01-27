/**
 * Boop Game - Analysis Types
 *
 * Type definitions for the live board analysis feature.
 */

import type { Position, Player } from './types';
import type { MoveType } from './tensor';

/**
 * Individual move candidate with statistics from MCTS
 */
export interface MoveCandidate {
  action: number;              // Action index (0-187)
  position: Position;          // Board position [row, col]
  moveType: MoveType;          // Type of move (placement, graduation, etc.)
  moveDescription: string;     // Human-readable: "Place kitten at (3,4)"

  // MCTS statistics
  visitCount: number;          // Nsa - number of times this action was visited
  qValue: number;              // Qsa - mean action value [-1, 1]
  priorProbability: number;    // Ps[a] - neural net's initial policy probability

  // Derived metrics
  visitPercentage: number;     // visitCount / totalVisits (0-100)
  winProbability: number;      // Converted Q to win% (0-100)
}

/**
 * Policy overlay data for board visualization
 */
export interface PolicyOverlay {
  // Map of position string "row,col" -> probability (0-1)
  cellProbabilities: Map<string, number>;

  // Max probability for normalization
  maxProbability: number;
}

/**
 * Position evaluation info
 */
export interface PositionEvaluation {
  value: number;            // [-1, 1] from current player's perspective
  winProbability: number;   // Win% for current player (0-100)
  description: string;      // "Orange is winning (+0.45)"
}

/**
 * Search statistics from MCTS
 */
export interface SearchStats {
  totalSimulations: number;
  nodesExplored: number;
  searchTimeMs: number;
}

/**
 * Analysis status
 */
export type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error';

/**
 * Complete analysis result from one analysis cycle
 */
export interface AnalysisResult {
  // Timestamp for staleness detection
  timestamp: number;

  // Position being analyzed (for cache invalidation)
  positionHash: string;

  // Current player perspective
  currentPlayer: Player;

  // Position evaluation
  evaluation: PositionEvaluation;

  // Top move candidates (sorted by visit count)
  topMoves: MoveCandidate[];

  // Policy overlay for board visualization
  policyOverlay: PolicyOverlay;

  // Search statistics
  searchStats: SearchStats;

  // Analysis status
  status: AnalysisStatus;
  error?: string;
}

/**
 * Configuration for analysis service
 */
export interface AnalysisConfig {
  enabled: boolean;

  // Number of MCTS simulations per analysis cycle
  simulationsPerCycle: number;

  // How many top moves to track
  topMovesCount: number;

  // Update frequency (ms between analysis result updates)
  updateIntervalMs: number;

  // Whether to show policy overlay on board
  showPolicyOverlay: boolean;

  // Threshold for showing move in overlay (0-1)
  overlayThreshold: number;
}

/**
 * Default analysis configuration
 */
export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  enabled: false,
  simulationsPerCycle: 100,
  topMovesCount: 5,
  updateIntervalMs: 500,
  showPolicyOverlay: true,
  overlayThreshold: 0.01,
};

/**
 * Messages sent to the analysis worker
 */
export type AnalysisWorkerMessage =
  | { type: 'init'; modelUrl: string }
  | { type: 'analyze'; position: Float32Array; player: 1 | -1; config: AnalysisConfig }
  | { type: 'stop' };

/**
 * Messages sent from the analysis worker
 */
export type AnalysisWorkerResponse =
  | { type: 'ready' }
  | { type: 'update'; result: AnalysisResult }
  | { type: 'error'; message: string };

/**
 * Statistics from MCTS for a single state (returned by getStateStatistics)
 */
export interface MCTSStateStats {
  totalVisits: number;
  actions: ActionStats[];
  rawPolicy: Float32Array;
  rawValue: number;
}

/**
 * Statistics for a single action
 */
export interface ActionStats {
  action: number;
  visits: number;
  qValue: number;
  prior: number;
}

/**
 * Messages sent to the AI worker
 */
export type AIWorkerMessage =
  | { type: 'init'; modelUrl: string }
  | { type: 'selectAction'; position: Float32Array; player: 1 | -1; numSimulations: number };

/**
 * Messages sent from the AI worker
 */
export type AIWorkerResponse =
  | { type: 'ready' }
  | { type: 'action'; action: number }
  | { type: 'error'; message: string };
