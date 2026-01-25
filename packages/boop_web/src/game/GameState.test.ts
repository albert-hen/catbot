/**
 * Boop Game - Game State Tests
 * 
 * Test suite mirroring the Python tests in packages/boop_core/tests/test_game.py
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../game/GameState';
import type { Position } from '../game/types';
import { PIECE_COUNT } from '../game/types';

describe('TestBoopPieces', () => {
  let gameState: GameState;

  beforeEach(() => {
    gameState = new GameState();
  });

  it('should boop piece to empty square', () => {
    // Place a piece at (2, 2)
    gameState.board[2][2] = 'ok';
    // Place a piece at (2, 3) to be booped
    gameState.board[2][3] = 'gk';
    // Boop pieces from (2, 2)
    (gameState as any).boopPieces([2, 2]);
    // Check that the piece at (2, 3) moved to (2, 4)
    expect(gameState.board[2][3]).toBeNull();
    expect(gameState.board[2][4]).toBe('gk');
  });

  it('should boop piece off board', () => {
    // Place a piece at (0, 0)
    gameState.board[0][0] = 'ok';
    // Place a piece at (0, 1) to be booped
    gameState.board[0][1] = 'gk';
    // Boop pieces from (0, 0)
    (gameState as any).boopPieces([0, 0]);
    // Check that the piece at (0, 1) is removed (booped off the board)
    expect(gameState.board[0][1]).toBeNull();
  });

  it('should not boop piece into occupied square', () => {
    // Place a piece at (2, 2)
    gameState.board[2][2] = 'ok';
    // Place a piece at (2, 3) to be booped
    gameState.board[2][3] = 'gk';
    // Place another piece at (2, 4) to block the boop
    gameState.board[2][4] = 'oc';
    // Boop pieces from (2, 2)
    (gameState as any).boopPieces([2, 2]);
    // Check that the piece at (2, 3) did not move
    expect(gameState.board[2][3]).toBe('gk');
    expect(gameState.board[2][4]).toBe('oc');
  });

  it('should boop multiple pieces', () => {
    // Place a piece at (2, 2)
    gameState.board[2][2] = 'ok';
    // Place pieces to be booped
    gameState.board[1][2] = 'gk'; // Above
    gameState.board[3][2] = 'gk'; // Below
    gameState.board[2][1] = 'gk'; // Left
    gameState.board[2][3] = 'gk'; // Right
    // Boop pieces from (2, 2)
    (gameState as any).boopPieces([2, 2]);
    // Check that pieces moved to correct positions
    expect(gameState.board[1][2]).toBeNull();
    expect(gameState.board[0][2]).toBe('gk');
    expect(gameState.board[3][2]).toBeNull();
    expect(gameState.board[4][2]).toBe('gk');
    expect(gameState.board[2][1]).toBeNull();
    expect(gameState.board[2][0]).toBe('gk');
    expect(gameState.board[2][3]).toBeNull();
    expect(gameState.board[2][4]).toBe('gk');
  });

  it('should not boop pieces in a line', () => {
    // Place a piece at (2, 2)
    gameState.board[2][2] = 'ok';
    // Place pieces in a line
    gameState.board[2][3] = 'gk';
    gameState.board[2][4] = 'gk';
    // Boop pieces from (2, 2)
    (gameState as any).boopPieces([2, 2]);
    // Check that the pieces in the line did not move
    expect(gameState.board[2][3]).toBe('gk');
    expect(gameState.board[2][4]).toBe('gk');
  });

  it('should boop pieces in diagonal', () => {
    // Set up the board with four Gray Kittens in an X shape
    gameState.board = [
      [null, null, null, null, null, null],
      [null, 'gk', null, 'gk', null, null],
      [null, null, null, null, null, null],
      [null, 'gk', null, 'gk', null, null],
      [null, null, null, null, 'ok', null],
      [null, null, null, null, null, null],
    ];
    gameState.availablePieces.gk = PIECE_COUNT - 4;
    gameState.availablePieces.ok = PIECE_COUNT - 1;
    (gameState as any).updateValidMoves();

    // Call place_piece in the middle of the X
    gameState.placePiece('ok', [2, 2]);
    
    const expectedBoard = [
      ['gk', null, null, null, 'gk', null],
      [null, null, null, null, null, null],
      [null, null, 'ok', null, null, null],
      [null, null, null, 'gk', null, null],
      ['gk', null, null, null, 'ok', null],
      [null, null, null, null, null, null],
    ];
    
    expect(gameState.board).toEqual(expectedBoard);
    expect(gameState.availablePieces.ok).toBe(PIECE_COUNT - 2);
    expect(gameState.availablePieces.gk).toBe(PIECE_COUNT - 4);
  });
});

describe('TestBoopGraduation', () => {
  let game: GameState;

  beforeEach(() => {
    game = new GameState();
  });

  it('should graduate horizontal line', () => {
    // Set up a horizontal line of Orange Kittens
    game.board[2][1] = 'ok';
    game.board[2][2] = 'ok';
    game.board[2][3] = 'ok';
    game.availablePieces.ok -= 3;
    (game as any).updateValidMoves();

    // Place a piece to trigger graduation
    game.placePiece('ok', [5, 5]);

    // Check if the Kittens are graduated to Cats
    expect(game.board[2][1]).toBeNull();
    expect(game.board[2][2]).toBeNull();
    expect(game.board[2][3]).toBeNull();
    expect(game.availablePieces.ok).toBe(PIECE_COUNT - 3 - 1);
    expect(game.availablePieces.oc).toBe(3);
    expect(game.graduatedCount.oc).toBe(3);
  });

  it('should graduate vertical line', () => {
    // Set up a vertical line of Gray Kittens
    game.board[1][2] = 'gk';
    game.board[2][2] = 'gk';
    game.board[3][2] = 'gk';
    game.availablePieces.gk -= 3;
    game.currentTurn = 'gray';
    (game as any).updateValidMoves();

    // Place a piece to trigger graduation
    game.placePiece('gk', [5, 5]);

    // Check if the Kittens are graduated to Cats
    expect(game.board[1][2]).toBeNull();
    expect(game.board[2][2]).toBeNull();
    expect(game.board[3][2]).toBeNull();
    expect(game.availablePieces.gk).toBe(PIECE_COUNT - 4);
    expect(game.availablePieces.gc).toBe(3);
    expect(game.graduatedCount.gc).toBe(3);
  });

  it('should graduate diagonal line', () => {
    // Set up a diagonal line of Orange Kittens
    game.board[1][1] = 'ok';
    game.board[2][2] = 'ok';
    game.board[3][3] = 'ok';
    game.availablePieces.ok -= 3;
    (game as any).updateValidMoves();

    // Place a piece to trigger graduation
    game.placePiece('ok', [5, 5]);

    // Check if the Kittens are graduated to Cats
    expect(game.board[1][1]).toBeNull();
    expect(game.board[2][2]).toBeNull();
    expect(game.board[3][3]).toBeNull();
    expect(game.availablePieces.ok).toBe(PIECE_COUNT - 3 - 1);
    expect(game.availablePieces.oc).toBe(3);
    expect(game.graduatedCount.oc).toBe(3);
  });

  it('should perform graduation directly', () => {
    // Set up positions for graduation
    const positions: Position[] = [[2, 1], [2, 2], [2, 3]];
    game.board[2][1] = 'ok';
    game.board[2][2] = 'ok';
    game.board[2][3] = 'ok';
    game.availablePieces.ok -= 3;

    // Call perform_graduation
    (game as any).performGraduation(positions);

    // Check if the Kittens are graduated to Cats
    expect(game.board[2][1]).toBeNull();
    expect(game.board[2][2]).toBeNull();
    expect(game.board[2][3]).toBeNull();
    expect(game.availablePieces.ok).toBe(PIECE_COUNT - 3);
    expect(game.availablePieces.oc).toBe(3);
    expect(game.graduatedCount.oc).toBe(3);
  });

  it('should graduate mixed cats and kittens', () => {
    // Set up a line with a mix of Cats and Kittens
    game.board[2][1] = 'ok';
    game.board[2][2] = 'oc';
    game.board[2][3] = 'ok';
    game.availablePieces.ok -= 3;
    game.graduatedCount.oc = 1;
    (game as any).updateValidMoves();

    // Place a piece to trigger graduation
    game.placePiece('ok', [5, 5]);

    // Check if the Kittens are graduated to Cats
    expect(game.board[2][1]).toBeNull();
    expect(game.board[2][2]).toBeNull();
    expect(game.board[2][3]).toBeNull();
    expect(game.availablePieces.ok).toBe(PIECE_COUNT - 3 - 1);
    expect(game.availablePieces.oc).toBe(3);
    expect(game.graduatedCount.oc).toBe(3);
  });

  it('should graduate mixed cats and kittens diagonal', () => {
    // Set up a diagonal line with a mix of Cats and Kittens
    game.board[1][1] = 'gk';
    game.board[2][2] = 'gc';
    game.board[3][3] = 'gk';
    game.availablePieces.gk -= 3;
    game.graduatedCount.gc = 1;
    game.currentTurn = 'gray';
    (game as any).updateValidMoves();

    // Place a piece to trigger graduation
    game.placePiece('gk', [5, 5]);

    // Check if the Kittens are graduated to Cats
    expect(game.board[1][1]).toBeNull();
    expect(game.board[2][2]).toBeNull();
    expect(game.board[3][3]).toBeNull();
    expect(game.availablePieces.gk).toBe(PIECE_COUNT - 4);
    expect(game.availablePieces.gc).toBe(3);
    expect(game.graduatedCount.gc).toBe(3);
  });

  it('should not graduate mixed colors', () => {
    // Set up a line with three Cats of different colors
    game.board[2][1] = 'oc';
    game.board[2][2] = 'gc';
    game.board[2][3] = 'oc';
    (game as any).updateValidMoves();

    // Place a piece to trigger graduation
    game.placePiece('ok', [5, 5]);

    // Check that no graduation occurred
    expect(game.board[2][1]).toBe('oc');
    expect(game.board[2][2]).toBe('gc');
    expect(game.board[2][3]).toBe('oc');
    expect(game.graduatedCount.oc).toBe(0);
    expect(game.graduatedCount.gc).toBe(0);
  });
});

describe('TestBoopWin', () => {
  let game: GameState;

  beforeEach(() => {
    game = new GameState();
  });

  it('should detect win with three cats in a row', () => {
    // Set up a line with three Cats in a row
    game.board[2][1] = 'oc';
    game.board[2][2] = 'oc';
    game.board[2][3] = 'oc';

    // Call check_for_win
    (game as any).checkForWin();

    // Check if the game is over and the winner is Orange
    expect(game.gameOver).toBe(true);
    expect(game.winner).toBe('orange');
  });

  it('should detect win with all cats on bed', () => {
    // Set up the board with all 8 Cats for Orange
    game.board[0][0] = 'oc';
    game.board[0][1] = 'oc';
    game.board[0][2] = 'oc';
    game.board[0][3] = 'oc';
    game.board[0][4] = 'oc';
    game.board[0][5] = 'oc';
    game.board[1][0] = 'oc';
    game.board[1][1] = 'oc';

    // Call check_for_win
    (game as any).checkForWin();

    // Check if the game is over and the winner is Orange
    expect(game.gameOver).toBe(true);
    expect(game.winner).toBe('orange');
  });

  it('should not detect win with no winner', () => {
    // Set up the board with no winning condition
    game.board[2][1] = 'ok';
    game.board[2][2] = 'ok';
    game.board[2][3] = 'ok';

    // Call check_for_win
    (game as any).checkForWin();

    // Check if the game is not over and there is no winner
    expect(game.gameOver).toBe(false);
    expect(game.winner).toBeNull();
  });
});

describe('TestGameState', () => {
  let gameState: GameState;

  beforeEach(() => {
    gameState = new GameState();
  });

  it('should have valid moves at start', () => {
    // Expected valid moves at the start of the game (all positions on a 6x6 board)
    const expectedValidMoves: Position[] = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        expectedValidMoves.push([row, col]);
      }
    }

    // Check that placeable_squares contains all positions on the board
    const sortedActual = [...gameState.placeableSquares].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const sortedExpected = expectedValidMoves.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(sortedActual).toEqual(sortedExpected);
  });
});

describe('TestGraduationChoices', () => {
  let game: GameState;

  beforeEach(() => {
    game = new GameState();
  });

  it('should present graduation choices for orange kitten', () => {
    // Set up the board with two graduation options
    game.board = [
      [null, null, 'ok', null, null, null],
      [null, null, 'ok', null, null, null],
      ['ok', 'ok', null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
    ];
    game.availablePieces.ok = PIECE_COUNT - 4;
    (game as any).updateValidMoves();

    // Call choose_graduation
    game.placePiece('ok', [2, 2]);

    expect(game.stateMode).toBe('waiting_for_graduation_choice');
    
    // Should have two choices: vertical and horizontal
    expect(game.graduationChoices.length).toBe(2);
    
    // Verify the choices (order may vary)
    const choiceStrings = game.graduationChoices.map(c => 
      c.map(p => `${p[0]},${p[1]}`).sort().join('-')
    ).sort();
    
    const expectedStrings = [
      '0,2-1,2-2,2', // vertical
      '2,0-2,1-2,2', // horizontal
    ].sort();
    
    expect(choiceStrings).toEqual(expectedStrings);
  });
});

describe('TestSerialization', () => {
  it('should serialize and deserialize game state', () => {
    const game = new GameState();
    game.placePiece('ok', [2, 2]);
    game.placePiece('gk', [3, 3]);
    
    const json = game.toJSON();
    const restored = GameState.fromJSON(json);
    
    expect(restored.board).toEqual(game.board);
    expect(restored.currentTurn).toBe(game.currentTurn);
    expect(restored.availablePieces).toEqual(game.availablePieces);
    expect(restored.gameOver).toBe(game.gameOver);
  });
});

describe('TestClone', () => {
  it('should clone game state independently', () => {
    const game = new GameState();
    game.placePiece('ok', [2, 2]);
    
    const clone = game.clone();
    clone.placePiece('gk', [3, 3]);
    
    // Original should be unchanged
    expect(game.board[3][3]).toBeNull();
    // Clone should have the new piece
    expect(clone.board[3][3]).toBe('gk');
  });
});
