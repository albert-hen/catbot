/**
 * useAnalysis - React hook for board analysis
 *
 * Consumes the shared AlphaZeroService to receive analysis updates.
 * Does NOT create its own worker — the service is shared with useBoopGame.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  AnalysisResult,
  AnalysisConfig,
} from '../game/analysisTypes';
import type { AlphaZeroService } from '../services/AlphaZeroService';
import type { GameState } from '../game';

/**
 * Options for the useAnalysis hook
 */
export interface UseAnalysisOptions {
  /** Whether analysis is enabled */
  enabled: boolean;
  /** Analysis configuration overrides */
  config?: Partial<AnalysisConfig>;
}

/**
 * Return type for the useAnalysis hook
 */
export interface UseAnalysisReturn {
  /** Current analysis result (null if not analyzing) */
  analysis: AnalysisResult | null;
  /** Whether analysis is currently running */
  isAnalyzing: boolean;
  /** Whether the analysis service is ready */
  isReady: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Current analysis configuration */
  config: AnalysisConfig;
  /** Update analysis configuration */
  updateConfig: (config: Partial<AnalysisConfig>) => void;
}

/**
 * Hook for managing board analysis via the shared AlphaZeroService.
 *
 * @param service - Shared AlphaZeroService instance (from useBoopGame)
 * @param gameState - Current game state to analyze
 * @param player - Current player (1 = orange, -1 = gray)
 * @param options - Analysis options
 */
export function useAnalysis(
  service: AlphaZeroService | null,
  gameState: GameState | null,
  player: 1 | -1,
  options: UseAnalysisOptions
): UseAnalysisReturn {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error] = useState<string | null>(null);
  const [config, setConfig] = useState<AnalysisConfig>(() => ({
    enabled: false,
    simulationsPerCycle: 100,
    topMovesCount: 5,
    updateIntervalMs: 500,
    showPolicyOverlay: true,
    overlayThreshold: 0.01,
    ...options.config,
  }));

  const isReady = service?.isReady() ?? false;

  const gameOver = gameState?.gameOver ?? false;

  // Enable/disable analysis and register callback (independent of position changes)
  useEffect(() => {
    if (!service || !isReady) return;

    if (!options.enabled || gameOver) {
      service.setAnalysisEnabled(false);
      service.onAnalysisUpdate(null);
      setIsAnalyzing(false);
      return;
    }

    service.setAnalysisEnabled(true, config);
    service.onAnalysisUpdate((result: AnalysisResult) => {
      setAnalysis(result);
      setIsAnalyzing(result.status === 'analyzing');
    });
    setIsAnalyzing(true);

    return () => {
      if (service) {
        service.setAnalysisEnabled(false);
        service.onAnalysisUpdate(null);
      }
    };
  }, [service, isReady, options.enabled, gameOver, config]);

  // Update position on the service when game state changes
  useEffect(() => {
    if (!service || !isReady || !options.enabled || !gameState || gameState.gameOver) {
      return;
    }
    service.setPosition(gameState, player);
  }, [service, gameState, player, isReady, options.enabled]);

  // Update config
  const updateConfig = useCallback((newConfig: Partial<AnalysisConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      if (service && isReady) {
        service.setAnalysisEnabled(options.enabled, updated);
      }
      return updated;
    });
  }, [service, isReady, options.enabled]);

  return {
    analysis,
    isAnalyzing,
    isReady,
    error,
    config,
    updateConfig,
  };
}
