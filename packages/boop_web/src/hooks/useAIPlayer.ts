/**
 * useAIPlayer - React hook for AI move orchestration
 *
 * Watches game state and triggers AI moves when it's AI's turn.
 * Uses the shared AlphaZeroService from context.
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
import type { PlayerConfig, AIConfig, AnimationConfig, GamePhase } from './useBoopGame';

export interface UseAIPlayerOptions {
  playerConfig: PlayerConfig;
  aiConfig: AIConfig;
  animationConfig: AnimationConfig;
  onAIThinking?: (thinking: boolean) => void;
}

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
  options: UseAIPlayerOptions,
): UseAIPlayerReturn {
  const service = useAlphaZeroService();
  const isAIReady = useAlphaZeroReady();
  const [isAIThinking, setIsAIThinking] = useState(false);
  const processingRef = useRef(false);
  const generationRef = useRef(0);

  const resetGeneration = useCallback(() => {
    generationRef.current++;
    processingRef.current = false;
    setIsAIThinking(false);
  }, []);

  const checkAndMakeAIMove = useCallback(async () => {
    if (processingRef.current) return;
    if (gameState.gameOver) return;
    if (gamePhase !== 'playing') return;
    if (!isAIReady) return;
    if (isAnimating) return;
    if (isPaused) return;
    if (viewingHistoryIndex !== null) return;

    const currentPlayer = gameState.currentTurn;
    const isAI = options.playerConfig[currentPlayer] === 'ai';
    if (!isAI) return;

    processingRef.current = true;
    setIsAIThinking(true);
    options.onAIThinking?.(true);
    const gen = generationRef.current;

    try {
      const delay = Math.max(100, options.aiConfig.moveDelayMs || 100);
      await new Promise(resolve => setTimeout(resolve, delay));

      if (gen !== generationRef.current || isPaused) return;

      const player: 1 | -1 = currentPlayer === 'orange' ? 1 : -1;
      const action = await service.selectAction(
        gameState,
        player,
        options.aiConfig.numSimulations
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
      options.onAIThinking?.(false);
    }
  }, [gameState, isAIReady, service, options, isAnimating, isPaused, viewingHistoryIndex, gamePhase, onMove]);

  useEffect(() => {
    checkAndMakeAIMove();
  }, [checkAndMakeAIMove]);

  // Keep the worker's position in sync with the game state
  useEffect(() => {
    if (!isAIReady || gamePhase === 'setup') return;
    const player: 1 | -1 = gameState.currentTurn === 'orange' ? 1 : -1;
    service.setPosition(gameState, player);
  }, [gameState, gamePhase, isAIReady, service]);

  return { isAIThinking, resetGeneration };
}
