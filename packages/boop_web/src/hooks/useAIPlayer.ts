/**
 * useAIPlayer - React hook for AI move orchestration
 *
 * Watches game state and triggers AI moves when it's AI's turn.
 * Uses the shared AlphaZeroService from context.
 *
 * Guard values (isPaused, isAnimating, gamePhase, etc.) are stored in refs
 * so that checkAndMakeAIMove's dependency list stays short — it only
 * recreates when gameState, isAIReady, or onMove actually change, not on
 * every paint tick or pause toggle.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  PieceType,
  GraduationChoice,
  MoveEffects,
} from '../game';
import {
  GameState,
  actionToMove,
  MoveType,
} from '../game';
import { useAlphaZeroService, useAlphaZeroReady } from '../contexts/AlphaZeroContext';
import type { PlayerConfig, AIConfig, GamePhase } from './useBoopGame';

export interface AIPlayerMoveResult {
  previousState: GameState;
  newState: GameState;
  effects: MoveEffects | null;
}

export interface UseAIPlayerReturn {
  isAIThinking: boolean;
  resetGeneration: () => void;
}

export function useAIPlayer(
  gameState: GameState,
  gamePhase: GamePhase,
  isPaused: boolean,
  isAnimating: boolean,
  viewingHistoryIndex: number | null,
  onMove: (result: AIPlayerMoveResult) => void,
  aiConfig: AIConfig,
  playerConfig: PlayerConfig,
  onAIThinking?: (thinking: boolean) => void,
): UseAIPlayerReturn {
  const service = useAlphaZeroService();
  const isAIReady = useAlphaZeroReady();
  const [isAIThinking, setIsAIThinking] = useState(false);
  const processingRef = useRef(false);
  const generationRef = useRef(0);

  // Guards stored in refs — always read the latest value without
  // forcing checkAndMakeAIMove to recreate.
  const guardsRef = useRef({
    gamePhase,
    isPaused,
    isAnimating,
    viewingHistoryIndex,
    isAIReady,
    aiConfig,
    playerConfig,
    onAIThinking,
  });
  guardsRef.current = {
    gamePhase,
    isPaused,
    isAnimating,
    viewingHistoryIndex,
    isAIReady,
    aiConfig,
    playerConfig,
    onAIThinking,
  };

  const resetGeneration = useCallback(() => {
    generationRef.current++;
    processingRef.current = false;
    setIsAIThinking(false);
  }, []);

  const checkAndMakeAIMove = useCallback(async () => {
    const g = guardsRef.current;
    if (processingRef.current) return;
    if (gameState.gameOver) return;
    if (g.gamePhase !== 'playing') return;
    if (!g.isAIReady) return;
    if (g.isAnimating) return;
    if (g.isPaused) return;
    if (g.viewingHistoryIndex !== null) return;

    const currentPlayer = gameState.currentTurn;
    if (g.playerConfig[currentPlayer] !== 'ai') return;

    processingRef.current = true;
    setIsAIThinking(true);
    g.onAIThinking?.(true);
    const gen = generationRef.current;

    try {
      const delay = Math.max(100, g.aiConfig.moveDelayMs || 100);
      await new Promise(resolve => setTimeout(resolve, delay));

      if (gen !== generationRef.current || g.isPaused) return;

      const player: 1 | -1 = currentPlayer === 'orange' ? 1 : -1;
      const action = await service.selectAction(
        gameState,
        player,
        g.aiConfig.numSimulations
      );

      if (gen !== generationRef.current) return;

      const { position, moveType } = actionToMove(action);

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
        effects = {
          placedAt: position,
          placedPiece: currentPlayer === 'orange' ? 'oc' : 'gc',
          boops: [],
          graduatedPositions,
        };
      }

      onMove({ previousState: gameState, newState, effects });
    } catch (error) {
      console.error('AI move failed:', error);
    } finally {
      processingRef.current = false;
      setIsAIThinking(false);
      g.onAIThinking?.(false);
    }
  }, [gameState, service, onMove]);

  // Trigger AI move when it becomes AI's turn.
  // Depend on both the callback AND the guard values so the effect fires
  // when, e.g., the game starts or unpauses — even though the callback
  // reads the latest values from guardsRef.
  useEffect(() => {
    checkAndMakeAIMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkAndMakeAIMove, gamePhase, isPaused, isAnimating, viewingHistoryIndex, isAIReady]);

  // Keep the worker's position in sync with the game state
  useEffect(() => {
    if (!isAIReady || gamePhase === 'setup') return;
    const player: 1 | -1 = gameState.currentTurn === 'orange' ? 1 : -1;
    service.setPosition(gameState, player);
  }, [gameState, gamePhase, isAIReady, service]);

  return { isAIThinking, resetGeneration };
}
