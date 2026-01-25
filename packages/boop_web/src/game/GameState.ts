/**
 * Boop Game - Game State
 * 
 * Core game logic for the Boop board game, ported from Python.
 */

import type {
  PieceType,
  CellState,
  Player,
  StateMode,
  Position,
  AvailablePieces,
  GraduatedCount,
  GraduationChoice,
  SerializableGameState,
} from './types';
import {
  BOARD_SIZE,
  PIECE_COUNT,
  DIRECTIONS,
  LINE_DIRECTIONS,
  isValidPosition,
  getPieceColor,
  isCat,
  isKitten,
  graduationChoicesEqual,
} from './types';

/**
 * GameState class - the single source of truth for game state.
 * 
 * The only two methods that update the game state are placePiece and chooseGraduation.
 */
export class GameState {
  board: CellState[][];
  currentTurn: Player;
  availablePieces: AvailablePieces;
  graduatedCount: GraduatedCount;
  gameOver: boolean;
  winner: Player | null;
  stateMode: StateMode;
  
  // Caches for valid moves (derived from state)
  placeableSquares: Position[];
  placeablePieces: PieceType[];
  graduationChoices: GraduationChoice[];

  constructor() {
    // Initialize empty 6x6 board
    this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    
    // Orange goes first
    this.currentTurn = 'orange';
    
    // Initial piece counts
    this.availablePieces = {
      ok: PIECE_COUNT,
      oc: 0,
      gk: PIECE_COUNT,
      gc: 0,
    };
    
    this.graduatedCount = {
      oc: 0,
      gc: 0,
    };
    
    this.gameOver = false;
    this.winner = null;
    this.stateMode = 'waiting_for_placement';
    
    // Initialize caches
    this.placeableSquares = [];
    this.placeablePieces = [];
    this.graduationChoices = [];
    
    this.updateValidMoves();
  }

  /**
   * Create a deep clone of this game state
   */
  clone(): GameState {
    const state = new GameState();
    state.board = this.board.map(row => [...row]);
    state.currentTurn = this.currentTurn;
    state.availablePieces = { ...this.availablePieces };
    state.graduatedCount = { ...this.graduatedCount };
    state.gameOver = this.gameOver;
    state.winner = this.winner;
    state.stateMode = this.stateMode;
    state.placeableSquares = this.placeableSquares.map(p => [...p] as Position);
    state.placeablePieces = [...this.placeablePieces];
    state.graduationChoices = this.graduationChoices.map(c => c.map(p => [...p] as Position));
    return state;
  }

  /**
   * Serialize game state to JSON-compatible object
   */
  toJSON(): SerializableGameState {
    return {
      board: this.board.map(row => [...row]),
      currentTurn: this.currentTurn,
      availablePieces: { ...this.availablePieces },
      graduatedCount: { ...this.graduatedCount },
      gameOver: this.gameOver,
      winner: this.winner,
      stateMode: this.stateMode,
      placeableSquares: this.placeableSquares.map(p => [...p] as Position),
      placeablePieces: [...this.placeablePieces],
      graduationChoices: this.graduationChoices.map(c => c.map(p => [...p] as Position)),
    };
  }

  /**
   * Create GameState from serialized JSON
   */
  static fromJSON(json: SerializableGameState): GameState {
    const state = new GameState();
    state.board = json.board.map(row => [...row]);
    state.currentTurn = json.currentTurn;
    state.availablePieces = { ...json.availablePieces };
    state.graduatedCount = { ...json.graduatedCount };
    state.gameOver = json.gameOver;
    state.winner = json.winner;
    state.stateMode = json.stateMode;
    state.placeableSquares = json.placeableSquares.map(p => [...p] as Position);
    state.placeablePieces = [...json.placeablePieces];
    state.graduationChoices = json.graduationChoices.map(c => c.map(p => [...p] as Position));
    return state;
  }

  /**
   * Places a piece on the board at the specified position.
   * Handles all game logic until the next required input.
   */
  placePiece(pieceType: PieceType, position: Position): void {
    if (this.gameOver) {
      throw new Error('Game is already over.');
    }

    if (this.stateMode === 'waiting_for_graduation_choice') {
      throw new Error(`Game is waiting for graduation choice from ${this.currentTurn}.`);
    }

    // Check if it's the correct player's turn
    if ((pieceType === 'ok' || pieceType === 'oc') && this.currentTurn !== 'orange') {
      throw new Error("It's not orange's turn.");
    }
    if ((pieceType === 'gk' || pieceType === 'gc') && this.currentTurn !== 'gray') {
      throw new Error("It's not gray's turn.");
    }

    const [row, col] = position;
    if (this.board[row][col] !== null) {
      throw new Error('Board position is already occupied.');
    }

    if (this.availablePieces[pieceType] === 0) {
      throw new Error('No more pieces of this type available.');
    }

    // Place the piece
    this.board[row][col] = pieceType;
    this.availablePieces[pieceType] -= 1;

    // Boop adjacent pieces
    this.boopPieces(position);

    // Check for win condition
    this.checkForWin();
    if (this.gameOver) {
      return;
    }

    // Calculate graduation choices
    this.calculateGraduationChoices();

    if (this.graduationChoices.length === 1) {
      // Only one graduation choice, perform it automatically
      this.performGraduation(this.graduationChoices[0]);
      this.graduationChoices = [];
      this.switchTurn();
    } else if (this.graduationChoices.length > 1) {
      // Multiple choices, wait for player decision
      this.clearValidMoves();
      this.stateMode = 'waiting_for_graduation_choice';
    } else {
      // No graduation, switch turn
      this.switchTurn();
    }
  }

  /**
   * Choose a graduation option from available choices.
   */
  chooseGraduation(choice: GraduationChoice): void {
    if (this.stateMode !== 'waiting_for_graduation_choice') {
      throw new Error('Game is not waiting for graduation choice.');
    }

    // Find matching choice in available choices
    const validChoice = this.graduationChoices.find(c => graduationChoicesEqual(c, choice));
    if (!validChoice) {
      throw new Error(`Invalid graduation choice. Available choices: ${JSON.stringify(this.graduationChoices)}`);
    }

    this.performGraduation(validChoice);
    this.graduationChoices = [];
    this.switchTurn();
  }

  /**
   * Boop all pieces adjacent to the given position.
   */
  private boopPieces(position: Position): void {
    const [row, col] = position;
    const currentPiece = this.board[row][col];
    if (!currentPiece) return;

    const currentIsCat = isCat(currentPiece);

    for (const [dRow, dCol] of DIRECTIONS) {
      const adjRow = row + dRow;
      const adjCol = col + dCol;

      // Check if adjacent position is within board
      if (!isValidPosition([adjRow, adjCol])) continue;

      const adjacentPiece = this.board[adjRow][adjCol];
      if (!adjacentPiece) continue;

      // Cats can boop anything, kittens can only boop kittens
      const canBoop = currentIsCat || (isKitten(currentPiece) && isKitten(adjacentPiece));
      if (!canBoop) continue;

      // Calculate new position
      const newRow = adjRow + dRow;
      const newCol = adjCol + dCol;

      if (isValidPosition([newRow, newCol])) {
        // Check if new position is empty
        if (this.board[newRow][newCol] === null) {
          // Move the piece
          this.board[newRow][newCol] = adjacentPiece;
          this.board[adjRow][adjCol] = null;
        }
        // If blocked, piece doesn't move
      } else {
        // Boop off the board - piece returns to pool
        this.board[adjRow][adjCol] = null;
        this.availablePieces[adjacentPiece] += 1;
      }
    }
  }

  /**
   * Calculate all available graduation choices.
   */
  private calculateGraduationChoices(): void {
    const eightOptions = this.getGradOptionsEight();
    const threeOptions = this.getGradOptionsThree();
    
    // Single piece graduations from eight-on-board rule
    const singleChoices: GraduationChoice[] = eightOptions.map(pos => [pos]);
    
    this.graduationChoices = [...singleChoices, ...threeOptions];
  }

  /**
   * Check if all 8 pieces are on the board (eight-on-board graduation rule).
   * Returns positions of all pieces if so.
   */
  private getGradOptionsEight(): Position[] {
    const positions: Position[] = [];
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (!piece) continue;
        
        const color = getPieceColor(piece);
        if (color === this.currentTurn) {
          positions.push([row, col]);
        }
      }
    }
    
    // Only return positions if exactly 8 pieces on board
    return positions.length === PIECE_COUNT ? positions : [];
  }

  /**
   * Find all three-in-a-row graduation options for current player.
   */
  private getGradOptionsThree(): GraduationChoice[] {
    const choices: GraduationChoice[] = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (!piece) continue;
        
        const color = getPieceColor(piece);
        if (color !== this.currentTurn) continue;

        // Check each line direction
        for (const [dRow, dCol] of LINE_DIRECTIONS) {
          const positions: Position[] = [[row, col]];
          
          for (let i = 1; i < 3; i++) {
            const newRow = row + dRow * i;
            const newCol = col + dCol * i;
            
            if (!isValidPosition([newRow, newCol])) break;
            
            const newPiece = this.board[newRow][newCol];
            if (!newPiece || getPieceColor(newPiece) !== color) break;
            
            positions.push([newRow, newCol]);
          }
          
          if (positions.length === 3) {
            choices.push(positions);
          }
        }
      }
    }

    return choices;
  }

  /**
   * Perform graduation for the given positions.
   */
  private performGraduation(positions: GraduationChoice): void {
    for (const [row, col] of positions) {
      const piece = this.board[row][col];
      if (!piece) continue;

      if (isKitten(piece)) {
        // Graduate kitten to cat
        const catType = piece === 'ok' ? 'oc' : 'gc';
        this.board[row][col] = null;
        this.availablePieces[catType] += 1;
        this.graduatedCount[catType] += 1;
      } else {
        // Remove cat from board, return to pool
        this.board[row][col] = null;
        this.availablePieces[piece] += 1;
      }
    }
  }

  /**
   * Check for win conditions.
   */
  private checkForWin(): void {
    // Check for three cats in a row
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (!isCat(piece)) continue;

        for (const [dRow, dCol] of LINE_DIRECTIONS) {
          let count = 1;
          
          for (let i = 1; i < 3; i++) {
            const newRow = row + dRow * i;
            const newCol = col + dCol * i;
            
            if (!isValidPosition([newRow, newCol])) break;
            if (this.board[newRow][newCol] !== piece) break;
            
            count++;
          }
          
          if (count === 3) {
            this.gameOver = true;
            this.winner = piece === 'oc' ? 'orange' : 'gray';
            return;
          }
        }
      }
    }

    // Check for 8 cats on board
    let orangeCats = 0;
    let grayCats = 0;
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (this.board[row][col] === 'oc') orangeCats++;
        if (this.board[row][col] === 'gc') grayCats++;
      }
    }
    
    if (orangeCats === 8) {
      this.gameOver = true;
      this.winner = 'orange';
    } else if (grayCats === 8) {
      this.gameOver = true;
      this.winner = 'gray';
    }
  }

  /**
   * Switch turn to the other player.
   */
  private switchTurn(): void {
    this.currentTurn = this.currentTurn === 'orange' ? 'gray' : 'orange';
    this.stateMode = 'waiting_for_placement';
    this.updateValidMoves();
  }

  /**
   * Update the valid moves caches.
   */
  private updateValidMoves(): void {
    // Find all empty squares
    this.placeableSquares = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (this.board[row][col] === null) {
          this.placeableSquares.push([row, col]);
        }
      }
    }

    // Find available piece types for current player
    if (this.currentTurn === 'orange') {
      this.placeablePieces = (['ok', 'oc'] as PieceType[]).filter(p => this.availablePieces[p] > 0);
    } else {
      this.placeablePieces = (['gk', 'gc'] as PieceType[]).filter(p => this.availablePieces[p] > 0);
    }
  }

  /**
   * Clear valid moves caches.
   */
  private clearValidMoves(): void {
    this.placeableSquares = [];
    this.placeablePieces = [];
  }

  /**
   * Get a string representation of the board for debugging.
   */
  toString(): string {
    let result = 'Board:\n';
    for (const row of this.board) {
      for (const cell of row) {
        result += cell ? `${cell} ` : '-- ';
      }
      result += '\n';
    }
    result += `Current Turn: ${this.currentTurn}\n`;
    result += `State Mode: ${this.stateMode}\n`;
    result += `Available: ok=${this.availablePieces.ok} oc=${this.availablePieces.oc} gk=${this.availablePieces.gk} gc=${this.availablePieces.gc}\n`;
    if (this.gameOver) {
      result += `Game Over! Winner: ${this.winner}\n`;
    }
    return result;
  }
}
