/**
 * Boop Game - Tensor Encoding
 * 
 * Converts between GameState and tensor format for neural network inference.
 * Also handles action encoding/decoding.
 */

import { GameState } from './GameState';
import type {
  Position,
  Player,
  PieceType,
  GraduationChoice,
} from './types';
import { BOARD_SIZE } from './types';

/**
 * Neural network input/output constants.
 * 
 * Input tensor: 9 channels of 6x6
 * Channel 0: Game state mode (0 = placement, 1 = graduation)
 * Channel 1: Player 1 (orange) kitten positions
 * Channel 2: Player 2 (gray) kitten positions
 * Channel 3: Player 1 (orange) cat positions
 * Channel 4: Player 2 (gray) cat positions
 * Channel 5: Player 1 kitten count (filled with count value)
 * Channel 6: Player 2 kitten count
 * Channel 7: Player 1 cat count
 * Channel 8: Player 2 cat count
 */
export const NUM_CHANNELS = 9;

/**
 * Action space size:
 * 6x6 = 36 kitten placements
 * 6x6 = 36 cat placements
 * 6x6 = 36 single graduation options
 * 6x4 = 24 horizontal triple graduations
 * 4x6 = 24 vertical triple graduations
 * 4x4 = 16 diagonal up graduations
 * 4x4 = 16 diagonal down graduations
 * Total = 188
 */
export const ACTION_SIZE = 188;

// Action space cumulative indices
const ACTION_KITTEN_END = 36;
const ACTION_CAT_END = 72;
const ACTION_SINGLE_GRAD_END = 108;
const ACTION_HORIZ_GRAD_END = 132;
const ACTION_VERT_GRAD_END = 156;
const ACTION_DIAG_UP_END = 172;
// ACTION_SIZE (188) is used as the end for diagonal down

/**
 * Move types for action encoding
 */
export const MoveType = {
  PLACE_KITTEN: 0,
  PLACE_CAT: 1,
  SINGLE_GRADUATION: 2,
  HORIZONTAL_TRIPLE_GRADUATION: 3,
  VERTICAL_TRIPLE_GRADUATION: 4,
  DIAGONAL_TRIPLE_GRADUATION_UP: 5,
  DIAGONAL_TRIPLE_GRADUATION_DOWN: 6,
} as const;
export type MoveType = typeof MoveType[keyof typeof MoveType];

/**
 * Decoded action information
 */
export interface DecodedAction {
  position: Position;
  moveType: MoveType;
}

/**
 * Convert game state to tensor format for neural network input.
 * 
 * @param state - The current game state
 * @returns Float32Array of shape [9, 6, 6] flattened
 */
export function gameStateToTensor(state: GameState): Float32Array {
  const tensor = new Float32Array(NUM_CHANNELS * BOARD_SIZE * BOARD_SIZE);
  
  // Helper to set value at [channel, row, col]
  const setAt = (channel: number, row: number, col: number, value: number) => {
    tensor[channel * BOARD_SIZE * BOARD_SIZE + row * BOARD_SIZE + col] = value;
  };
  
  // Helper to fill entire channel
  const fillChannel = (channel: number, value: number) => {
    const start = channel * BOARD_SIZE * BOARD_SIZE;
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      tensor[start + i] = value;
    }
  };
  
  // Channel 0: state mode (0 = placement, 1 = graduation)
  const stateValue = state.stateMode === 'waiting_for_graduation_choice' ? 1 : 0;
  fillChannel(0, stateValue);
  
  // Channels 1-4: piece positions
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = state.board[row][col];
      if (piece === 'ok') setAt(1, row, col, 1);
      else if (piece === 'gk') setAt(2, row, col, 1);
      else if (piece === 'oc') setAt(3, row, col, 1);
      else if (piece === 'gc') setAt(4, row, col, 1);
    }
  }
  
  // Channels 5-8: piece counts (fill entire channel with count)
  fillChannel(5, state.availablePieces.ok);
  fillChannel(6, state.availablePieces.gk);
  fillChannel(7, state.availablePieces.oc);
  fillChannel(8, state.availablePieces.gc);
  
  return tensor;
}

/**
 * Convert tensor back to game state.
 * Note: This creates a new GameState and sets values directly.
 * 
 * @param tensor - Float32Array of shape [9, 6, 6] flattened
 * @param player - Current player (1 = orange, -1 = gray)
 * @returns GameState
 */
export function tensorToGameState(tensor: Float32Array, player: 1 | -1): GameState {
  const state = new GameState();
  
  // Helper to get value at [channel, row, col]
  const getAt = (channel: number, row: number, col: number): number => {
    return tensor[channel * BOARD_SIZE * BOARD_SIZE + row * BOARD_SIZE + col];
  };
  
  // Read piece positions from channels 1-4
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (getAt(1, row, col) === 1) state.board[row][col] = 'ok';
      else if (getAt(2, row, col) === 1) state.board[row][col] = 'gk';
      else if (getAt(3, row, col) === 1) state.board[row][col] = 'oc';
      else if (getAt(4, row, col) === 1) state.board[row][col] = 'gc';
      else state.board[row][col] = null;
    }
  }
  
  // Read piece counts from channels 5-8
  state.availablePieces.ok = getAt(5, 0, 0);
  state.availablePieces.gk = getAt(6, 0, 0);
  state.availablePieces.oc = getAt(7, 0, 0);
  state.availablePieces.gc = getAt(8, 0, 0);
  
  // Set current turn based on player
  state.currentTurn = player === 1 ? 'orange' : 'gray';
  
  // Set state mode based on channel 0
  if (getAt(0, 0, 0) === 0) {
    state.stateMode = 'waiting_for_placement';
    // Need to manually call updateValidMoves since we're bypassing normal state
    (state as any).updateValidMoves();
  } else {
    state.stateMode = 'waiting_for_graduation_choice';
    // Calculate graduation choices
    (state as any).calculateGraduationChoices();
  }
  
  return state;
}

/**
 * Get canonical form of tensor (from perspective of current player).
 * When player is -1 (gray), swap orange and gray channels.
 * 
 * @param tensor - Input tensor
 * @param player - Current player (1 = orange, -1 = gray)
 * @returns Canonical tensor
 */
export function getCanonicalForm(tensor: Float32Array, player: 1 | -1): Float32Array {
  if (player === 1) return tensor;
  
  const canonical = new Float32Array(tensor.length);
  
  // Copy channel 0 as-is
  const channelSize = BOARD_SIZE * BOARD_SIZE;
  for (let i = 0; i < channelSize; i++) {
    canonical[i] = tensor[i];
  }
  
  // Swap odd/even channels for pieces and counts (1<->2, 3<->4, 5<->6, 7<->8)
  for (let c = 1; c < 8; c += 2) {
    const start1 = c * channelSize;
    const start2 = (c + 1) * channelSize;
    for (let i = 0; i < channelSize; i++) {
      canonical[start1 + i] = tensor[start2 + i];
      canonical[start2 + i] = tensor[start1 + i];
    }
  }
  
  return canonical;
}

/**
 * Convert action index to decoded action (position + move type).
 * 
 * Action space layout:
 * 0-35: Place kitten at (action // 6, action % 6)
 * 36-71: Place cat at ((action-36) // 6, (action-36) % 6)
 * 72-107: Single graduation at ((action-72) // 6, (action-72) % 6)
 * 108-131: Horizontal triple graduation, center at (action-108) // 4, 1 + (action-108) % 4)
 * 132-155: Vertical triple graduation, center at (1 + (action-132) // 6, (action-132) % 6)
 * 156-171: Diagonal up triple graduation, center at (1 + (action-156) // 4, 1 + (action-156) % 4)
 * 172-187: Diagonal down triple graduation, center at (1 + (action-172) // 4, 1 + (action-172) % 4)
 */
export function actionToMove(action: number): DecodedAction {
  if (action < ACTION_KITTEN_END) {
    return {
      position: [Math.floor(action / 6), action % 6],
      moveType: MoveType.PLACE_KITTEN,
    };
  } else if (action < ACTION_CAT_END) {
    const a = action - ACTION_KITTEN_END;
    return {
      position: [Math.floor(a / 6), a % 6],
      moveType: MoveType.PLACE_CAT,
    };
  } else if (action < ACTION_SINGLE_GRAD_END) {
    const a = action - ACTION_CAT_END;
    return {
      position: [Math.floor(a / 6), a % 6],
      moveType: MoveType.SINGLE_GRADUATION,
    };
  } else if (action < ACTION_HORIZ_GRAD_END) {
    const a = action - ACTION_SINGLE_GRAD_END;
    return {
      position: [Math.floor(a / 4), 1 + (a % 4)],
      moveType: MoveType.HORIZONTAL_TRIPLE_GRADUATION,
    };
  } else if (action < ACTION_VERT_GRAD_END) {
    const a = action - ACTION_HORIZ_GRAD_END;
    return {
      position: [1 + Math.floor(a / 6), a % 6],
      moveType: MoveType.VERTICAL_TRIPLE_GRADUATION,
    };
  } else if (action < ACTION_DIAG_UP_END) {
    const a = action - ACTION_VERT_GRAD_END;
    return {
      position: [1 + Math.floor(a / 4), 1 + (a % 4)],
      moveType: MoveType.DIAGONAL_TRIPLE_GRADUATION_UP,
    };
  } else {
    const a = action - ACTION_DIAG_UP_END;
    return {
      position: [1 + Math.floor(a / 4), 1 + (a % 4)],
      moveType: MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN,
    };
  }
}

/**
 * Convert a game move to action index.
 */
export function moveToAction(
  moveType: MoveType,
  position: Position
): number {
  const [row, col] = position;
  
  switch (moveType) {
    case MoveType.PLACE_KITTEN:
      return row * 6 + col;
    case MoveType.PLACE_CAT:
      return 36 + row * 6 + col;
    case MoveType.SINGLE_GRADUATION:
      return 72 + row * 6 + col;
    case MoveType.HORIZONTAL_TRIPLE_GRADUATION:
      return 108 + row * 4 + (col - 1);
    case MoveType.VERTICAL_TRIPLE_GRADUATION:
      return 132 + (row - 1) * 6 + col;
    case MoveType.DIAGONAL_TRIPLE_GRADUATION_UP:
      return 156 + (row - 1) * 4 + (col - 1);
    case MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN:
      return 172 + (row - 1) * 4 + (col - 1);
  }
}

/**
 * Get valid moves mask for current game state.
 * Returns array of 0s and 1s, where 1 means the action is valid.
 * 
 * @param state - Current game state
 * @param _player - Current player (1 = orange, -1 = gray) - unused but kept for API compatibility
 * @returns Float32Array of length ACTION_SIZE
 */
export function getValidMoves(state: GameState, _player: 1 | -1): Float32Array {
  const validMoves = new Float32Array(ACTION_SIZE);
  
  if (state.stateMode === 'waiting_for_graduation_choice') {
    // Only graduation moves are valid
    for (const choice of state.graduationChoices) {
      if (choice.length === 1) {
        // Single graduation
        const [row, col] = choice[0];
        const action = 72 + row * 6 + col;
        validMoves[action] = 1;
      } else if (choice.length === 3) {
        // Triple graduation - need to determine orientation
        const [r0, c0] = choice[0];
        const [r1, c1] = choice[1];
        const [r2, c2] = choice[2];
        
        // Sort by position to get consistent center
        const sorted = [...choice].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const center = sorted[1]; // Middle element is center
        const [row, col] = center;
        
        if (r0 === r1 && r1 === r2) {
          // Horizontal
          if (col > 0 && col < 5) {
            const action = 108 + row * 4 + (col - 1);
            validMoves[action] = 1;
          }
        } else if (c0 === c1 && c1 === c2) {
          // Vertical
          if (row > 0 && row < 5) {
            const action = 132 + (row - 1) * 6 + col;
            validMoves[action] = 1;
          }
        } else {
          // Diagonal
          if (row > 0 && row < 5 && col > 0 && col < 5) {
            // Determine if it's up (/) or down (\) diagonal
            // Up diagonal: row decreases as col increases
            // Down diagonal: row increases as col increases
            const isUpDiagonal = sorted[0][1] > sorted[1][1];
            
            if (isUpDiagonal) {
              const action = 156 + (row - 1) * 4 + (col - 1);
              validMoves[action] = 1;
            } else {
              const action = 172 + (row - 1) * 4 + (col - 1);
              validMoves[action] = 1;
            }
          }
        }
      }
    }
  } else {
    // Placement moves
    for (const [row, col] of state.placeableSquares) {
      for (const piece of state.placeablePieces) {
        if (piece.endsWith('k')) {
          // Kitten placement
          const action = row * 6 + col;
          validMoves[action] = 1;
        } else {
          // Cat placement
          const action = 36 + row * 6 + col;
          validMoves[action] = 1;
        }
      }
    }
  }
  
  return validMoves;
}

/**
 * Apply an action to the game state, returning the new state and next player.
 * 
 * @param state - Current game state
 * @param player - Current player (1 = orange, -1 = gray)
 * @param action - Action index
 * @returns Tuple of [new state, next player]
 */
export function applyAction(
  state: GameState,
  player: 1 | -1,
  action: number
): [GameState, 1 | -1] {
  const newState = state.clone();
  const { position, moveType } = actionToMove(action);
  
  if (moveType === MoveType.PLACE_KITTEN || moveType === MoveType.PLACE_CAT) {
    // Determine piece type based on player and move type
    let piece: PieceType;
    if (moveType === MoveType.PLACE_KITTEN) {
      piece = player === 1 ? 'ok' : 'gk';
    } else {
      piece = player === 1 ? 'oc' : 'gc';
    }
    
    newState.placePiece(piece, position);
  } else {
    // Graduation move
    const [row, col] = position;
    let choice: GraduationChoice;
    
    switch (moveType) {
      case MoveType.SINGLE_GRADUATION:
        choice = [[row, col]];
        break;
      case MoveType.HORIZONTAL_TRIPLE_GRADUATION:
        choice = [[row, col - 1], [row, col], [row, col + 1]];
        break;
      case MoveType.VERTICAL_TRIPLE_GRADUATION:
        choice = [[row - 1, col], [row, col], [row + 1, col]];
        break;
      case MoveType.DIAGONAL_TRIPLE_GRADUATION_UP:
        choice = [[row - 1, col + 1], [row, col], [row + 1, col - 1]];
        break;
      case MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN:
        choice = [[row - 1, col - 1], [row, col], [row + 1, col + 1]];
        break;
      default:
        throw new Error(`Unknown move type: ${moveType}`);
    }
    
    newState.chooseGraduation(choice);
  }
  
  // Determine next player
  // If still waiting for graduation, same player continues
  // Otherwise, player switches
  const nextPlayer = newState.stateMode === 'waiting_for_graduation_choice' 
    ? player 
    : (-player as 1 | -1);
  
  return [newState, nextPlayer];
}

/**
 * Check if game has ended and return result from perspective of given player.
 * 
 * @param state - Game state
 * @param player - Player to check from perspective of (1 = orange, -1 = gray)
 * @returns 0 if not ended, 1 if player won, -1 if player lost
 */
export function getGameEnded(state: GameState, player: 1 | -1): number {
  if (!state.gameOver) return 0;
  
  const playerColor: Player = player === 1 ? 'orange' : 'gray';
  if (state.winner === playerColor) return 1;
  return -1;
}

/**
 * Get string representation of tensor for hashing (used in MCTS).
 */
export function tensorToString(tensor: Float32Array): string {
  const channelSize = BOARD_SIZE * BOARD_SIZE;
  
  const c0 = tensor[0]; // decision type
  const c5 = tensor[5 * channelSize]; // p1 kitten count
  const c6 = tensor[6 * channelSize]; // p2 kitten count
  const c7 = tensor[7 * channelSize]; // p1 cat count
  const c8 = tensor[8 * channelSize]; // p2 cat count
  
  // Extract piece positions from channels 1-4
  const pieces: number[] = [];
  for (let c = 1; c <= 4; c++) {
    for (let i = 0; i < channelSize; i++) {
      pieces.push(tensor[c * channelSize + i]);
    }
  }
  
  return `${c0},${c5},${c6},${c7},${c8},${pieces.join('')}`;
}
