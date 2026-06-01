/**
 * Boop Game - React Hook for game state management
 */

import { useState, useCallback, useEffect } from 'react';
import type {
  Position,
  PieceType,
  GraduationChoice,
  MoveEffects,
} from '../game';
import {
  GameState,
  ANIMATION_DURATION_MS,
} from '../game';
import { useAlphaZeroReady } from '../contexts/AlphaZeroContext';
import { useAIPlayer } from './useAIPlayer';
import type { AIPlayerMoveResult } from './useAIPlayer';

export interface PlayerConfig {
  orange: 'human' | 'ai';
  gray: 'human' | 'ai';
}

export interface AIConfig {
  numSimulations: number;
  moveDelayMs: number;
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

export interface LastMoveHighlights {
  placedAt: Position | null;
  graduatedPositions: Position[];
}

export interface UseBoopGameResult {
  gameState: GameState;
  selectedPieceType: PieceType | null;
  hoveredGraduation: GraduationChoice | null;
  isAIThinking: boolean;
  isAIReady: boolean;
  isAnimating: boolean;
  lastMoveHighlights: LastMoveHighlights;
  moveEffects: MoveEffects | null;
  gamePhase: GamePhase;
  isPaused: boolean;
  isViewingHistory: boolean;
  historyIndex: number;
  historyLength: number;
  canGoBack: boolean;
  canGoForward: boolean;
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
  options: UseBoopGameOptions
): UseBoopGameResult {
  const [gameState, setGameState] = useState(() => new GameState());
  const [selectedPieceType, setSelectedPieceType] = useState<PieceType | null>(null);
  const [hoveredGraduation, setHoveredGraduation] = useState<GraduationChoice | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [gameHistory, setGameHistory] = useState<GameState[]>([]);
  const [moveEffects, setMoveEffects] = useState<MoveEffects | null>(null);
  const [lastMoveHighlights, setLastMoveHighlights] = useState<LastMoveHighlights>({
    placedAt: null,
    graduatedPositions: [],
  });
  const [gamePhase, setGamePhase] = useState<GamePhase>('setup');
  const [isPaused, setIsPaused] = useState(false);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(null);

  const isAIReady = useAlphaZeroReady();

  // Apply AI move results (called by useAIPlayer)
  const handleAIMove = useCallback((result: AIPlayerMoveResult) => {
    const { previousState, newState, effects } = result;

    setGameHistory(prev => [...prev, previousState.clone()]);

    setMoveEffects(effects);
    setLastMoveHighlights({
      placedAt: effects?.placedAt ?? null,
      graduatedPositions: effects?.graduatedPositions ?? [],
    });

    if (options.animationConfig.enabled && effects && effects.boops.length > 0) {
      setIsAnimating(true);
      setTimeout(() => {
        setIsAnimating(false);
      }, ANIMATION_DURATION_MS);
    }

    setGameState(newState);
  }, [options.animationConfig.enabled]);

  // AI player orchestration
  const { isAIThinking, resetGeneration } = useAIPlayer(
    gameState,
    gamePhase,
    isPaused,
    isAnimating,
    viewingHistoryIndex,
    handleAIMove,
    options.aiConfig,
    options.playerConfig,
    options.onAIThinking,
  );

  // Detect game over
  useEffect(() => {
    if (gamePhase === 'playing' && gameState.gameOver) {
      setGamePhase('game_over');
    }
  }, [gameState.gameOver, gamePhase]);

  // Toggle pause
  const togglePause = useCallback(() => {
    if (gamePhase !== 'playing') return;
    setIsPaused(prev => !prev);
    if (isPaused && viewingHistoryIndex !== null) {
      setViewingHistoryIndex(null);
    }
  }, [isPaused, viewingHistoryIndex, gamePhase]);

  // History navigation
  const goBack = useCallback(() => {
    if (!isPaused && gamePhase !== 'game_over') return;
    if (viewingHistoryIndex === null) {
      if (gameHistory.length > 0) {
        setViewingHistoryIndex(gameHistory.length - 1);
      }
    } else if (viewingHistoryIndex > 0) {
      setViewingHistoryIndex(viewingHistoryIndex - 1);
    }
  }, [isPaused, viewingHistoryIndex, gameHistory.length, gamePhase]);

  const goForward = useCallback(() => {
    if ((!isPaused && gamePhase !== 'game_over') || viewingHistoryIndex === null) return;
    if (viewingHistoryIndex >= gameHistory.length - 1) {
      setViewingHistoryIndex(null);
    } else {
      setViewingHistoryIndex(viewingHistoryIndex + 1);
    }
  }, [isPaused, viewingHistoryIndex, gameHistory.length, gamePhase]);

  const goToPresent = useCallback(() => {
    setViewingHistoryIndex(null);
  }, []);

  const playFromHistory = useCallback(() => {
    if (viewingHistoryIndex === null) return;
    const historicalState = gameHistory[viewingHistoryIndex];
    setGameState(historicalState.clone());
    setGameHistory(gameHistory.slice(0, viewingHistoryIndex));
    setSelectedPieceType(null);
    setHoveredGraduation(null);
    setMoveEffects(null);
    setLastMoveHighlights({ placedAt: null, graduatedPositions: [] });
    setViewingHistoryIndex(null);
    setIsPaused(false);
    setGamePhase('playing');
  }, [viewingHistoryIndex, gameHistory]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'p' && gamePhase === 'playing') {
        e.preventDefault();
        togglePause();
      } else if (key === 'u' && (isPaused || gamePhase === 'game_over')) {
        e.preventDefault();
        goBack();
      } else if (key === 'i' && (isPaused || gamePhase === 'game_over')) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause, goBack, goForward, isPaused, gamePhase]);

  // Save state to history before each move
  const pushToHistory = useCallback(() => {
    setGameHistory(prev => [...prev, gameState.clone()]);
  }, [gameState]);

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
    if (isAIThinking || isAnimating || isPaused) return;
    if (options.playerConfig[gameState.currentTurn] !== 'human') return;

    try {
      pushToHistory();
      const newState = gameState.clone();
      const effects = newState.placePiece(selectedPieceType, position);

      setMoveEffects(effects);
      setLastMoveHighlights({
        placedAt: effects.placedAt,
        graduatedPositions: effects.graduatedPositions ?? [],
      });

      if (options.animationConfig.enabled && effects.boops.length > 0) {
        setIsAnimating(true);
        setTimeout(() => {
          setIsAnimating(false);
        }, ANIMATION_DURATION_MS);
      }

      setGameState(newState);
    } catch (error) {
      console.error('Invalid move:', error);
    }
  }, [gameState, selectedPieceType, isAIThinking, isAnimating, isPaused, options, pushToHistory]);

  const selectGraduation = useCallback((choice: GraduationChoice) => {
    if (gameState.stateMode !== 'waiting_for_graduation_choice') return;
    if (isAIThinking || isAnimating || isPaused) return;
    if (options.playerConfig[gameState.currentTurn] !== 'human') return;

    try {
      pushToHistory();
      const newState = gameState.clone();
      const graduatedPositions = newState.chooseGraduation(choice);

      setLastMoveHighlights(prev => ({
        ...prev,
        graduatedPositions,
      }));
      setMoveEffects(null);

      setGameState(newState);
      setHoveredGraduation(null);
    } catch (error) {
      console.error('Invalid graduation choice:', error);
    }
  }, [gameState, isAIThinking, isAnimating, isPaused, options, pushToHistory]);

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
    setIsAnimating(false);
    setIsPaused(false);
    setViewingHistoryIndex(null);
    setGamePhase('setup');
    resetGeneration();
  }, [resetGeneration]);

  // Derived state
  const isViewingHistory = viewingHistoryIndex !== null;
  const historyIndex = viewingHistoryIndex ?? gameHistory.length;
  const canGoBack = (isPaused || gamePhase === 'game_over') && (viewingHistoryIndex === null ? gameHistory.length > 0 : viewingHistoryIndex > 0);
  const canGoForward = (isPaused || gamePhase === 'game_over') && viewingHistoryIndex !== null;

  const displayState = viewingHistoryIndex !== null
    ? gameHistory[viewingHistoryIndex]
    : gameState;

  return {
    gameState: displayState,
    selectedPieceType,
    hoveredGraduation,
    isAIThinking,
    isAIReady,
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
