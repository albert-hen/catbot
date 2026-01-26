/**
 * Boop Game - Core Types
 * 
 * Type definitions for the Boop board game.
 */

// Piece types
export type PieceType = 'ok' | 'gk' | 'oc' | 'gc';
export type CellState = PieceType | null;
export type Player = 'orange' | 'gray';
export type StateMode = 'waiting_for_placement' | 'waiting_for_graduation_choice';

// Board is 6x6
export const BOARD_SIZE = 6;
export const PIECE_COUNT = 8;

// Position on the board
export type Position = [number, number]; // [row, col]

// Available pieces for each player
export interface AvailablePieces {
  ok: number; // Orange Kittens
  gk: number; // Gray Kittens
  oc: number; // Orange Cats
  gc: number; // Gray Cats
}

// Graduated count for tracking
export interface GraduatedCount {
  oc: number;
  gc: number;
}

// Graduation choice - either single position or three positions in a line
export type GraduationChoice = readonly Position[];

// Move types for the game
export interface PlacementMove {
  type: 'place';
  pieceType: PieceType;
  position: Position;
}

export interface GraduationMove {
  type: 'graduate';
  choice: GraduationChoice;
}

export type GameMove = PlacementMove | GraduationMove;

/**
 * Effect of a single piece being booped
 */
export interface BoopEffect {
  piece: PieceType;
  from: Position;
  to: Position | null; // null = pushed off board
}

/**
 * Effects of a move, used for animation and highlighting
 */
export interface MoveEffects {
  placedAt: Position;
  placedPiece: PieceType;
  boops: BoopEffect[];
  graduatedPositions: Position[] | null; // positions where pieces were graduated from
}

/**
 * Animation duration in milliseconds (configurable)
 */
export const ANIMATION_DURATION_MS = 300;

/**
 * Serializable game state for JSON communication
 */
export interface SerializableGameState {
  board: (CellState)[][];
  currentTurn: Player;
  availablePieces: AvailablePieces;
  graduatedCount: GraduatedCount;
  gameOver: boolean;
  winner: Player | null;
  stateMode: StateMode;
  placeableSquares: Position[];
  placeablePieces: PieceType[];
  graduationChoices: GraduationChoice[];
}

// Direction vectors for checking lines and booping
export const DIRECTIONS: readonly Position[] = [
  [0, 1],   // Right
  [0, -1],  // Left
  [1, 0],   // Down
  [-1, 0],  // Up
  [1, 1],   // Down-right
  [1, -1],  // Down-left
  [-1, 1],  // Up-right
  [-1, -1], // Up-left
] as const;

// Line directions for checking three-in-a-row (only need 4, not 8)
export const LINE_DIRECTIONS: readonly Position[] = [
  [0, 1],   // Horizontal
  [1, 0],   // Vertical
  [1, 1],   // Diagonal down-right
  [1, -1],  // Diagonal down-left
] as const;

/**
 * Helper to check if a position is within board bounds
 */
export function isValidPosition(pos: Position): boolean {
  return pos[0] >= 0 && pos[0] < BOARD_SIZE && pos[1] >= 0 && pos[1] < BOARD_SIZE;
}

/**
 * Get the color (player) of a piece
 */
export function getPieceColor(piece: PieceType | null): Player | null {
  if (piece === 'ok' || piece === 'oc') return 'orange';
  if (piece === 'gk' || piece === 'gc') return 'gray';
  return null;
}

/**
 * Check if a piece is a cat
 */
export function isCat(piece: PieceType | null): boolean {
  return piece === 'oc' || piece === 'gc';
}

/**
 * Check if a piece is a kitten
 */
export function isKitten(piece: PieceType | null): boolean {
  return piece === 'ok' || piece === 'gk';
}

/**
 * Get the kitten piece type for a player
 */
export function getKittenType(player: Player): PieceType {
  return player === 'orange' ? 'ok' : 'gk';
}

/**
 * Get the cat piece type for a player
 */
export function getCatType(player: Player): PieceType {
  return player === 'orange' ? 'oc' : 'gc';
}

/**
 * Compare two positions for equality
 */
export function positionsEqual(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Compare two graduation choices for equality
 */
export function graduationChoicesEqual(a: GraduationChoice, b: GraduationChoice): boolean {
  if (a.length !== b.length) return false;
  // Sort both by position to ensure consistent comparison
  const sortedA = [...a].sort((p1, p2) => p1[0] - p2[0] || p1[1] - p2[1]);
  const sortedB = [...b].sort((p1, p2) => p1[0] - p2[0] || p1[1] - p2[1]);
  return sortedA.every((pos, i) => positionsEqual(pos, sortedB[i]));
}
