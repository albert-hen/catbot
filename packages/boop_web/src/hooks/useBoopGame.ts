/**
 * Boop Game - React Hook for game state management
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { 
  Position, 
  PieceType, 
  GraduationChoice,
} from '../game';
import { 
  GameState, 
  MCTS,
  ONNXNeuralNetwork,
  actionToMove,
  MoveType,
} from '../game';

export interface PlayerConfig {
  orange: 'human' | 'ai';
  gray: 'human' | 'ai';
}

export interface AIConfig {
  numSimulations: number;
}

export interface UseBoopGameOptions {
  playerConfig: PlayerConfig;
  aiConfig: AIConfig;
  onAIThinking?: (thinking: boolean) => void;
}

export interface UseBoopGameResult {
  gameState: GameState;
  selectedPieceType: PieceType | null;
  hoveredGraduation: GraduationChoice | null;
  isAIThinking: boolean;
  
  // Actions
  selectPieceType: (pieceType: PieceType) => void;
  placePiece: (position: Position) => void;
  selectGraduation: (choice: GraduationChoice) => void;
  setHoveredGraduation: (choice: GraduationChoice | null) => void;
  resetGame: () => void;
}

export function useBoopGame(
  nnet: ONNXNeuralNetwork | null,
  options: UseBoopGameOptions
): UseBoopGameResult {
  const [gameState, setGameState] = useState(() => new GameState());
  const [selectedPieceType, setSelectedPieceType] = useState<PieceType | null>(null);
  const [hoveredGraduation, setHoveredGraduation] = useState<GraduationChoice | null>(null);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [gameHistory, setGameHistory] = useState<GameState[]>([]);
  
  const mctsRef = useRef<MCTS | null>(null);
  const processingRef = useRef(false);
  
  // Initialize MCTS when nnet is available
  useEffect(() => {
    if (nnet && !mctsRef.current) {
      mctsRef.current = new MCTS(nnet, {
        numSimulations: options.aiConfig.numSimulations,
        cpuct: 1.0,
      });
    }
  }, [nnet, options.aiConfig.numSimulations]);
  
  // Update MCTS simulation count when config changes
  useEffect(() => {
    if (mctsRef.current) {
      mctsRef.current = new MCTS(nnet!, {
        numSimulations: options.aiConfig.numSimulations,
        cpuct: 1.0,
      });
    }
  }, [nnet, options.aiConfig.numSimulations]);
  
  // Check if current player is AI and trigger move
  const checkAndMakeAIMove = useCallback(async () => {
    if (processingRef.current) return;
    if (gameState.gameOver) return;
    if (!mctsRef.current || !nnet) return;
    
    const currentPlayer = gameState.currentTurn;
    const isAI = options.playerConfig[currentPlayer] === 'ai';
    
    if (!isAI) return;
    
    processingRef.current = true;
    setIsAIThinking(true);
    options.onAIThinking?.(true);
    
    try {
      // Small delay to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const player: 1 | -1 = currentPlayer === 'orange' ? 1 : -1;
      const action = await mctsRef.current.selectAction(gameState, player);
      
      const { position, moveType } = actionToMove(action);
      
      // Apply the move
      const newState = gameState.clone();
      
      if (moveType === MoveType.PLACE_KITTEN || moveType === MoveType.PLACE_CAT) {
        let piece: PieceType;
        if (moveType === MoveType.PLACE_KITTEN) {
          piece = currentPlayer === 'orange' ? 'ok' : 'gk';
        } else {
          piece = currentPlayer === 'orange' ? 'oc' : 'gc';
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
      
      setGameState(newState);
    } catch (error) {
      console.error('AI move failed:', error);
    } finally {
      processingRef.current = false;
      setIsAIThinking(false);
      options.onAIThinking?.(false);
    }
  }, [gameState, nnet, options]);
  
  // Trigger AI move when it's AI's turn
  useEffect(() => {
    checkAndMakeAIMove();
  }, [gameState.currentTurn, gameState.stateMode, checkAndMakeAIMove]);
  
  // Keyboard handler for undo (only when both players are human)
  useEffect(() => {
    const bothHuman = options.playerConfig.orange === 'human' && options.playerConfig.gray === 'human';
    if (!bothHuman || gameHistory.length === 0) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'u' && !isAIThinking) {
        e.preventDefault();
        // Pop from history and restore that state
        const previousState = gameHistory[gameHistory.length - 1];
        setGameState(previousState);
        setGameHistory(gameHistory.slice(0, -1));
        setSelectedPieceType(null);
        setHoveredGraduation(null);
        
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameHistory, isAIThinking, options.playerConfig, gameState.gameOver]);
  
  // Save state to history before each move
  const pushToHistory = useCallback(() => {
    setGameHistory(prev => [...prev, gameState.clone()]);
  }, [gameState]);;
  
  // Set default piece type when turn changes
  useEffect(() => {
    if (gameState.stateMode === 'waiting_for_placement') {
      const defaultPiece = gameState.currentTurn === 'orange' ? 'ok' : 'gk';
      if (gameState.placeablePieces.includes(defaultPiece)) {
        setSelectedPieceType(defaultPiece);
      } else if (gameState.placeablePieces.length > 0) {
        setSelectedPieceType(gameState.placeablePieces[0]);
      } else {
        setSelectedPieceType(null);
      }
    }
  }, [gameState.currentTurn, gameState.stateMode, gameState.placeablePieces]);
  
  const selectPieceType = useCallback((pieceType: PieceType) => {
    if (gameState.placeablePieces.includes(pieceType)) {
      setSelectedPieceType(pieceType);
    }
  }, [gameState.placeablePieces]);
  
  const placePiece = useCallback((position: Position) => {
    if (gameState.stateMode !== 'waiting_for_placement') return;
    if (!selectedPieceType) return;
    if (isAIThinking) return;
    
    // Check if current player is human
    if (options.playerConfig[gameState.currentTurn] !== 'human') return;
    
    try {
      pushToHistory();
      const newState = gameState.clone();
      newState.placePiece(selectedPieceType, position);
      setGameState(newState);
    } catch (error) {
      console.error('Invalid move:', error);
    }
  }, [gameState, selectedPieceType, isAIThinking, options.playerConfig, pushToHistory]);
  
  const selectGraduation = useCallback((choice: GraduationChoice) => {
    if (gameState.stateMode !== 'waiting_for_graduation_choice') return;
    if (isAIThinking) return;
    
    // Check if current player is human
    if (options.playerConfig[gameState.currentTurn] !== 'human') return;
    
    try {
      pushToHistory();
      const newState = gameState.clone();
      newState.chooseGraduation(choice);
      setGameState(newState);
      setHoveredGraduation(null);
    } catch (error) {
      console.error('Invalid graduation choice:', error);
    }
  }, [gameState, isAIThinking, options.playerConfig, pushToHistory]);
  
  const resetGame = useCallback(() => {
    setGameState(new GameState());
    setGameHistory([]);
    setSelectedPieceType(null);
    setHoveredGraduation(null);
    setIsAIThinking(false);
    processingRef.current = false;
    if (mctsRef.current) {
      mctsRef.current.reset();
    }
  }, []);
  
  return {
    gameState,
    selectedPieceType,
    hoveredGraduation,
    isAIThinking,
    selectPieceType,
    placePiece,
    selectGraduation,
    setHoveredGraduation,
    resetGame,
  };
}
