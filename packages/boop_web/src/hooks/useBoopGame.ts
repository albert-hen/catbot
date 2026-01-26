/**
 * Boop Game - React Hook for game state management
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { 
  Position, 
  PieceType, 
  GraduationChoice,
  MoveEffects,
} from '../game';
import { 
  GameState, 
  MCTS,
  ONNXNeuralNetwork,
  actionToMove,
  MoveType,
  ANIMATION_DURATION_MS,
} from '../game';

export interface PlayerConfig {
  orange: 'human' | 'ai';
  gray: 'human' | 'ai';
}

export interface AIConfig {
  numSimulations: number;
  moveDelayMs: number; // Delay before AI makes a move (0 = no delay)
}

export interface AnimationConfig {
  enabled: boolean;
}

export type GamePhase = 'setup' | 'playing' | 'game_over';

export interface UseBoopGameOptions {
  playerConfig: PlayerConfig;
  aiConfig: AIConfig;
  animationConfig: AnimationConfig;
  onAIThinking?: (thinking: boolean) => void;
}

/**
 * Highlights to show on the board for the last move
 */
export interface LastMoveHighlights {
  placedAt: Position | null;
  graduatedPositions: Position[];
}

export interface UseBoopGameResult {
  gameState: GameState;
  selectedPieceType: PieceType | null;
  hoveredGraduation: GraduationChoice | null;
  isAIThinking: boolean;
  isAnimating: boolean;
  lastMoveHighlights: LastMoveHighlights;
  moveEffects: MoveEffects | null;
  
  // Game phase
  gamePhase: GamePhase;
  
  // Pause/replay state
  isPaused: boolean;
  isViewingHistory: boolean;
  historyIndex: number;
  historyLength: number;
  canGoBack: boolean;
  canGoForward: boolean;
  
  // Actions
  selectPieceType: (pieceType: PieceType) => void;
  placePiece: (position: Position) => void;
  selectGraduation: (choice: GraduationChoice) => void;
  setHoveredGraduation: (choice: GraduationChoice | null) => void;
  startGame: () => void;
  resetGame: () => void;
  togglePause: () => void;
  goBack: () => void;
  goForward: () => void;
  goToPresent: () => void;
  playFromHistory: () => void;
}

export function useBoopGame(
  nnet: ONNXNeuralNetwork | null,
  options: UseBoopGameOptions
): UseBoopGameResult {
  const [gameState, setGameState] = useState(() => new GameState());
  const [selectedPieceType, setSelectedPieceType] = useState<PieceType | null>(null);
  const [hoveredGraduation, setHoveredGraduation] = useState<GraduationChoice | null>(null);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [gameHistory, setGameHistory] = useState<GameState[]>([]);
  const [moveEffects, setMoveEffects] = useState<MoveEffects | null>(null);
  const [lastMoveHighlights, setLastMoveHighlights] = useState<LastMoveHighlights>({
    placedAt: null,
    graduatedPositions: [],
  });
  
  // Game phase: setup -> playing -> game_over
  const [gamePhase, setGamePhase] = useState<GamePhase>('setup');
  
  // Pause/replay state for AI vs AI
  const [isPaused, setIsPaused] = useState(false);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(null);
  
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
  
  // Detect game over and transition to game_over phase
  useEffect(() => {
    if (gamePhase === 'playing' && gameState.gameOver) {
      setGamePhase('game_over');
    }
  }, [gameState.gameOver, gamePhase]);
  
  // Check if current player is AI and trigger move
  const checkAndMakeAIMove = useCallback(async () => {
    if (processingRef.current) return;
    if (gameState.gameOver) return;
    if (gamePhase !== 'playing') return; // Only move during playing phase
    if (!mctsRef.current || !nnet) return;
    if (isAnimating) return; // Wait for animation to complete
    if (isPaused) return; // Don't move while paused
    if (viewingHistoryIndex !== null) return; // Don't move while viewing history
    
    const currentPlayer = gameState.currentTurn;
    const isAI = options.playerConfig[currentPlayer] === 'ai';
    
    if (!isAI) return;
    
    processingRef.current = true;
    setIsAIThinking(true);
    options.onAIThinking?.(true);
    
    try {
      // Apply configured delay before AI move
      const delay = Math.max(100, options.aiConfig.moveDelayMs || 100);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Check if we got paused during the delay
      if (isPaused) {
        return;
      }
      
      const player: 1 | -1 = currentPlayer === 'orange' ? 1 : -1;
      const action = await mctsRef.current.selectAction(gameState, player);
      
      const { position, moveType } = actionToMove(action);
      
      // Save state to history before AI move
      setGameHistory(prev => [...prev, gameState.clone()]);
      
      // Apply the move and capture effects
      const newState = gameState.clone();
      let effects: MoveEffects | null = null;
      
      if (moveType === MoveType.PLACE_KITTEN || moveType === MoveType.PLACE_CAT) {
        let piece: PieceType;
        if (moveType === MoveType.PLACE_KITTEN) {
          piece = currentPlayer === 'orange' ? 'ok' : 'gk';
        } else {
          piece = currentPlayer === 'orange' ? 'oc' : 'gc';
        }
        effects = newState.placePiece(piece, position);
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
        
        const graduatedPositions = newState.chooseGraduation(choice);
        // For graduation moves, we don't have placement info
        effects = {
          placedAt: position, // Not really placement, but marks the graduation center
          placedPiece: currentPlayer === 'orange' ? 'oc' : 'gc',
          boops: [],
          graduatedPositions,
        };
      }
      
      // Update effects and highlights
      setMoveEffects(effects);
      setLastMoveHighlights({
        placedAt: effects?.placedAt ?? null,
        graduatedPositions: effects?.graduatedPositions ?? [],
      });
      
      // Handle animation if enabled - set state before gameState so animation renders
      if (options.animationConfig.enabled && effects && effects.boops.length > 0) {
        setIsAnimating(true);
        // Clear animation state after duration (but keep moveEffects for arrows)
        setTimeout(() => {
          setIsAnimating(false);
        }, ANIMATION_DURATION_MS);
      }
      
      setGameState(newState);
    } catch (error) {
      console.error('AI move failed:', error);
    } finally {
      processingRef.current = false;
      setIsAIThinking(false);
      options.onAIThinking?.(false);
    }
  }, [gameState, nnet, options, isAnimating, isPaused, viewingHistoryIndex, gamePhase]);
  
  // Trigger AI move when it's AI's turn (also after animation completes or unpause)
  useEffect(() => {
    checkAndMakeAIMove();
  }, [gameState.currentTurn, gameState.stateMode, isAnimating, isPaused, viewingHistoryIndex, gamePhase, checkAndMakeAIMove]);
  
  // Toggle pause (works for all player configs during playing phase)
  const togglePause = useCallback(() => {
    if (gamePhase !== 'playing') return;
    setIsPaused(prev => !prev);
    // When unpausing, return to present if viewing history
    if (isPaused && viewingHistoryIndex !== null) {
      setViewingHistoryIndex(null);
    }
  }, [isPaused, viewingHistoryIndex, gamePhase]);
  
  // Go back in history (while paused or game over)
  const goBack = useCallback(() => {
    if (!isPaused && gamePhase !== 'game_over') return;
    
    if (viewingHistoryIndex === null) {
      // Currently at present, go to last history entry
      if (gameHistory.length > 0) {
        setViewingHistoryIndex(gameHistory.length - 1);
      }
    } else if (viewingHistoryIndex > 0) {
      // Go further back
      setViewingHistoryIndex(viewingHistoryIndex - 1);
    }
  }, [isPaused, viewingHistoryIndex, gameHistory.length, gamePhase]);
  
  // Go forward in history (while paused or game over)
  const goForward = useCallback(() => {
    if ((!isPaused && gamePhase !== 'game_over') || viewingHistoryIndex === null) return;
    if (viewingHistoryIndex >= gameHistory.length - 1) {
      // Go to present (current game state)
      setViewingHistoryIndex(null);
    } else {
      setViewingHistoryIndex(viewingHistoryIndex + 1);
    }
  }, [isPaused, viewingHistoryIndex, gameHistory.length, gamePhase]);
  
  // Go to present (exit history viewing)
  const goToPresent = useCallback(() => {
    setViewingHistoryIndex(null);
  }, []);
  
  // Play from the currently viewed historical state
  const playFromHistory = useCallback(() => {
    if (viewingHistoryIndex === null) return; // Already at present
    
    // Get the historical state we're viewing
    const historicalState = gameHistory[viewingHistoryIndex];
    
    // Make it the new present
    setGameState(historicalState.clone());
    
    // Truncate history to before this point
    setGameHistory(gameHistory.slice(0, viewingHistoryIndex));
    
    // Clear UI state
    setSelectedPieceType(null);
    setHoveredGraduation(null);
    setMoveEffects(null);
    setLastMoveHighlights({ placedAt: null, graduatedPositions: [] });
    
    // Resume play
    setViewingHistoryIndex(null);
    setIsPaused(false);
    setGamePhase('playing'); // In case we were in game_over
  }, [viewingHistoryIndex, gameHistory]);
  
  // Keyboard handler for history navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      
      // Pause toggle (p) - only during playing phase
      if (key === 'p' && gamePhase === 'playing') {
        e.preventDefault();
        togglePause();
        return;
      }
      
      // Back (u) - when paused or game over
      if (key === 'u' && (isPaused || gamePhase === 'game_over')) {
        e.preventDefault();
        goBack();
        return;
      }
      
      // Forward (i) - when paused or game over
      if (key === 'i' && (isPaused || gamePhase === 'game_over')) {
        e.preventDefault();
        goForward();
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause, goBack, goForward, isPaused, gamePhase]);
  
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
    if (isAIThinking || isAnimating) return;
    
    // Check if current player is human
    if (options.playerConfig[gameState.currentTurn] !== 'human') return;
    
    try {
      pushToHistory();
      const newState = gameState.clone();
      const effects = newState.placePiece(selectedPieceType, position);
      
      // Update effects and highlights
      setMoveEffects(effects);
      setLastMoveHighlights({
        placedAt: effects.placedAt,
        graduatedPositions: effects.graduatedPositions ?? [],
      });
      
      // Handle animation if enabled - set state before gameState so animation renders
      if (options.animationConfig.enabled && effects.boops.length > 0) {
        setIsAnimating(true);
        // Clear animation state after duration (but keep moveEffects for arrows)
        setTimeout(() => {
          setIsAnimating(false);
        }, ANIMATION_DURATION_MS);
      }
      
      setGameState(newState);
    } catch (error) {
      console.error('Invalid move:', error);
    }
  }, [gameState, selectedPieceType, isAIThinking, isAnimating, options, pushToHistory]);
  
  const selectGraduation = useCallback((choice: GraduationChoice) => {
    if (gameState.stateMode !== 'waiting_for_graduation_choice') return;
    if (isAIThinking || isAnimating) return;
    
    // Check if current player is human
    if (options.playerConfig[gameState.currentTurn] !== 'human') return;
    
    try {
      pushToHistory();
      const newState = gameState.clone();
      const graduatedPositions = newState.chooseGraduation(choice);
      
      // Update highlights to show graduation
      setLastMoveHighlights(prev => ({
        ...prev,
        graduatedPositions,
      }));
      setMoveEffects(null); // Clear move effects since this is just graduation
      
      setGameState(newState);
      setHoveredGraduation(null);
    } catch (error) {
      console.error('Invalid graduation choice:', error);
    }
  }, [gameState, isAIThinking, isAnimating, options, pushToHistory]);
  
  // Start the game (transition from setup to playing)
  const startGame = useCallback(() => {
    if (gamePhase === 'setup') {
      setGamePhase('playing');
    }
  }, [gamePhase]);
  
  const resetGame = useCallback(() => {
    setGameState(new GameState());
    setGameHistory([]);
    setSelectedPieceType(null);
    setHoveredGraduation(null);
    setMoveEffects(null);
    setLastMoveHighlights({ placedAt: null, graduatedPositions: [] });
    setIsAIThinking(false);
    setIsAnimating(false);
    setIsPaused(false);
    setViewingHistoryIndex(null);
    setGamePhase('setup'); // Go back to setup phase
    processingRef.current = false;
    if (mctsRef.current) {
      mctsRef.current.reset();
    }
  }, []);
  
  // Derived state
  const isViewingHistory = viewingHistoryIndex !== null;
  const historyIndex = viewingHistoryIndex ?? gameHistory.length;
  const canGoBack = (isPaused || gamePhase === 'game_over') && (viewingHistoryIndex === null ? gameHistory.length > 0 : viewingHistoryIndex > 0);
  const canGoForward = (isPaused || gamePhase === 'game_over') && viewingHistoryIndex !== null;
  
  // The state to display (either current or historical)
  const displayState = viewingHistoryIndex !== null 
    ? gameHistory[viewingHistoryIndex] 
    : gameState;
  
  return {
    gameState: displayState,
    selectedPieceType,
    hoveredGraduation,
    isAIThinking,
    isAnimating,
    lastMoveHighlights: isViewingHistory ? { placedAt: null, graduatedPositions: [] } : lastMoveHighlights,
    moveEffects: isViewingHistory ? null : moveEffects,
    gamePhase,
    isPaused,
    isViewingHistory,
    historyIndex,
    historyLength: gameHistory.length,
    canGoBack,
    canGoForward,
    selectPieceType,
    placePiece,
    selectGraduation,
    setHoveredGraduation,
    startGame,
    resetGame,
    togglePause,
    goBack,
    goForward,
    goToPresent,
    playFromHistory,
  };
}
