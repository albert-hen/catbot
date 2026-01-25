/**
 * Boop Game - Tensor Encoding Tests
 */

import { describe, it, expect } from 'vitest';
import { GameState } from '../game/GameState';
import {
  gameStateToTensor,
  tensorToGameState,
  getCanonicalForm,
  actionToMove,
  moveToAction,
  getValidMoves,
  MoveType,
  ACTION_SIZE,
  NUM_CHANNELS,
} from '../game/tensor';
import { BOARD_SIZE, PIECE_COUNT } from '../game/types';

describe('Tensor Encoding', () => {
  it('should encode empty board correctly', () => {
    const state = new GameState();
    const tensor = gameStateToTensor(state);
    
    // Check dimensions
    expect(tensor.length).toBe(NUM_CHANNELS * BOARD_SIZE * BOARD_SIZE);
    
    // Channel 0 should be all 0s (waiting for placement)
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      expect(tensor[i]).toBe(0);
    }
    
    // Channels 1-4 should be all 0s (no pieces)
    for (let c = 1; c <= 4; c++) {
      for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
        expect(tensor[c * BOARD_SIZE * BOARD_SIZE + i]).toBe(0);
      }
    }
    
    // Channel 5 should be 8 (orange kittens)
    expect(tensor[5 * BOARD_SIZE * BOARD_SIZE]).toBe(PIECE_COUNT);
    
    // Channel 6 should be 8 (gray kittens)
    expect(tensor[6 * BOARD_SIZE * BOARD_SIZE]).toBe(PIECE_COUNT);
    
    // Channel 7 should be 0 (orange cats)
    expect(tensor[7 * BOARD_SIZE * BOARD_SIZE]).toBe(0);
    
    // Channel 8 should be 0 (gray cats)
    expect(tensor[8 * BOARD_SIZE * BOARD_SIZE]).toBe(0);
  });

  it('should encode pieces correctly', () => {
    const state = new GameState();
    state.board[0][0] = 'ok';
    state.board[1][1] = 'gk';
    state.board[2][2] = 'oc';
    state.board[3][3] = 'gc';
    
    const tensor = gameStateToTensor(state);
    
    // Check piece positions
    expect(tensor[1 * BOARD_SIZE * BOARD_SIZE + 0 * BOARD_SIZE + 0]).toBe(1); // ok at (0,0)
    expect(tensor[2 * BOARD_SIZE * BOARD_SIZE + 1 * BOARD_SIZE + 1]).toBe(1); // gk at (1,1)
    expect(tensor[3 * BOARD_SIZE * BOARD_SIZE + 2 * BOARD_SIZE + 2]).toBe(1); // oc at (2,2)
    expect(tensor[4 * BOARD_SIZE * BOARD_SIZE + 3 * BOARD_SIZE + 3]).toBe(1); // gc at (3,3)
  });

  it('should roundtrip game state through tensor', () => {
    const state = new GameState();
    state.placePiece('ok', [2, 2]);
    state.placePiece('gk', [3, 3]);
    
    const tensor = gameStateToTensor(state);
    const restored = tensorToGameState(tensor, 1);
    
    // Check board matches
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        expect(restored.board[r][c]).toBe(state.board[r][c]);
      }
    }
    
    // Check piece counts
    expect(restored.availablePieces.ok).toBe(state.availablePieces.ok);
    expect(restored.availablePieces.gk).toBe(state.availablePieces.gk);
  });
});

describe('Canonical Form', () => {
  it('should not change board for player 1', () => {
    const state = new GameState();
    state.board[0][0] = 'ok';
    state.board[1][1] = 'gk';
    
    const tensor = gameStateToTensor(state);
    const canonical = getCanonicalForm(tensor, 1);
    
    expect(canonical).toEqual(tensor);
  });

  it('should swap colors for player -1', () => {
    const state = new GameState();
    state.board[0][0] = 'ok';
    state.board[1][1] = 'gk';
    state.availablePieces.ok = 7;
    state.availablePieces.gk = 6;
    state.availablePieces.oc = 1;
    state.availablePieces.gc = 2;
    
    const tensor = gameStateToTensor(state);
    const canonical = getCanonicalForm(tensor, -1);
    
    // Check that channels are swapped
    const channelSize = BOARD_SIZE * BOARD_SIZE;
    
    // Channel 1 (p1 kittens) and Channel 2 (p2 kittens) should be swapped
    expect(canonical[1 * channelSize + 1 * BOARD_SIZE + 1]).toBe(1); // gk position now in channel 1
    expect(canonical[2 * channelSize + 0 * BOARD_SIZE + 0]).toBe(1); // ok position now in channel 2
    
    // Piece counts should also be swapped
    expect(canonical[5 * channelSize]).toBe(6); // was gk count
    expect(canonical[6 * channelSize]).toBe(7); // was ok count
  });
});

describe('Action Encoding', () => {
  it('should decode kitten placement correctly', () => {
    const action = actionToMove(0);
    expect(action.position).toEqual([0, 0]);
    expect(action.moveType).toBe(MoveType.PLACE_KITTEN);
    
    const action35 = actionToMove(35);
    expect(action35.position).toEqual([5, 5]);
    expect(action35.moveType).toBe(MoveType.PLACE_KITTEN);
  });

  it('should decode cat placement correctly', () => {
    const action = actionToMove(36);
    expect(action.position).toEqual([0, 0]);
    expect(action.moveType).toBe(MoveType.PLACE_CAT);
    
    const action71 = actionToMove(71);
    expect(action71.position).toEqual([5, 5]);
    expect(action71.moveType).toBe(MoveType.PLACE_CAT);
  });

  it('should decode single graduation correctly', () => {
    const action = actionToMove(72);
    expect(action.position).toEqual([0, 0]);
    expect(action.moveType).toBe(MoveType.SINGLE_GRADUATION);
  });

  it('should decode horizontal triple graduation correctly', () => {
    const action = actionToMove(108);
    expect(action.position).toEqual([0, 1]); // Center of horizontal line
    expect(action.moveType).toBe(MoveType.HORIZONTAL_TRIPLE_GRADUATION);
  });

  it('should decode vertical triple graduation correctly', () => {
    const action = actionToMove(132);
    expect(action.position).toEqual([1, 0]); // Center of vertical line
    expect(action.moveType).toBe(MoveType.VERTICAL_TRIPLE_GRADUATION);
  });

  it('should roundtrip action encoding', () => {
    // Test kitten placement
    expect(moveToAction(MoveType.PLACE_KITTEN, [2, 3])).toBe(2 * 6 + 3);
    expect(actionToMove(moveToAction(MoveType.PLACE_KITTEN, [2, 3])).position).toEqual([2, 3]);
    
    // Test cat placement
    expect(moveToAction(MoveType.PLACE_CAT, [2, 3])).toBe(36 + 2 * 6 + 3);
    
    // Test single graduation
    expect(moveToAction(MoveType.SINGLE_GRADUATION, [2, 3])).toBe(72 + 2 * 6 + 3);
  });

  it('should have correct action size', () => {
    expect(ACTION_SIZE).toBe(188);
  });
});

describe('Valid Moves', () => {
  it('should return all placement moves for empty board', () => {
    const state = new GameState();
    const validMoves = getValidMoves(state, 1);
    
    // Count valid moves
    let validCount = 0;
    for (let i = 0; i < ACTION_SIZE; i++) {
      if (validMoves[i] > 0) validCount++;
    }
    
    // Should have 36 kitten placements (all squares)
    // Orange only has kittens at start, so only kitten placements
    expect(validCount).toBe(36);
  });

  it('should mask occupied squares', () => {
    const state = new GameState();
    // Place pieces without triggering turn switch for simplicity
    state.board[0][0] = 'ok';
    state.board[0][1] = 'gk';
    state.availablePieces.ok -= 1;
    state.availablePieces.gk -= 1;
    (state as any).updateValidMoves();
    
    const validMoves = getValidMoves(state, 1);
    
    // Position (0,0) and (0,1) should not be valid
    expect(validMoves[0]).toBe(0); // (0,0) kitten
    expect(validMoves[1]).toBe(0); // (0,1) kitten
    expect(validMoves[36]).toBe(0); // (0,0) cat
    expect(validMoves[37]).toBe(0); // (0,1) cat
    
    // But (0,2) should be valid
    expect(validMoves[2]).toBe(1); // (0,2) kitten
  });
});
