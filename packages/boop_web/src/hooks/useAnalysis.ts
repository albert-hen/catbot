/**
 * useAnalysis - React hook for board analysis
 *
 * Manages the analysis service and provides analysis results to components.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AnalysisResult,
  AnalysisConfig,
} from '../game/analysisTypes';
import { AnalysisService } from '../services/AnalysisService';
import type { GameState } from '../game';

/**
 * Options for the useAnalysis hook
 */
export interface UseAnalysisOptions {
  /** Whether analysis is enabled */
  enabled: boolean;
  /** Model URL for the neural network */
  modelUrl?: string;
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

  /** Manually trigger analysis restart */
  restartAnalysis: () => void;
}

/**
 * Hook for managing board analysis
 *
 * @param gameState - Current game state to analyze
 * @param player - Current player (1 = orange, -1 = gray)
 * @param options - Analysis options
 */
export function useAnalysis(
  gameState: GameState | null,
  player: 1 | -1,
  options: UseAnalysisOptions
): UseAnalysisReturn {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AnalysisConfig>(() => ({
    enabled: false,
    simulationsPerCycle: 100,
    topMovesCount: 5,
    updateIntervalMs: 500,
    showPolicyOverlay: true,
    overlayThreshold: 0.01,
    ...options.config,
  }));

  const serviceRef = useRef<AnalysisService | null>(null);
  const initializingRef = useRef(false);

  // Initialize the analysis service on mount (always load the engine)
  useEffect(() => {
    if (initializingRef.current || serviceRef.current) {
      return;
    }

    initializingRef.current = true;

    const initService = async () => {
      try {
        const service = new AnalysisService(config);
        await service.initialize(options.modelUrl);
        serviceRef.current = service;
        setIsReady(true);
        setError(null);
      } catch (err) {
        console.error('[useAnalysis] Failed to initialize:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize analysis');
      } finally {
        initializingRef.current = false;
      }
    };

    initService();

    return () => {
      if (serviceRef.current) {
        serviceRef.current.terminate();
        serviceRef.current = null;
      }
      setIsReady(false);
    };
  }, [options.modelUrl]);

  // Handle analysis updates
  const handleAnalysisUpdate = useCallback((result: AnalysisResult) => {
    setAnalysis(result);
    setIsAnalyzing(result.status === 'analyzing');
  }, []);

  // Start/stop analysis based on options and game state
  useEffect(() => {
    if (!serviceRef.current || !isReady || !gameState) {
      return;
    }

    if (!options.enabled || gameState.gameOver) {
      // Stop analysis
      serviceRef.current.stopAnalysis();
      setIsAnalyzing(false);
      return;
    }

    // Start or update analysis
    setIsAnalyzing(true);
    serviceRef.current.startAnalysis(gameState, player, handleAnalysisUpdate);

    return () => {
      if (serviceRef.current) {
        serviceRef.current.stopAnalysis();
      }
    };
  }, [options.enabled, isReady, gameState, player, handleAnalysisUpdate]);

  // Update position when game state changes
  useEffect(() => {
    if (!serviceRef.current || !isReady || !options.enabled || !gameState || gameState.gameOver) {
      return;
    }

    serviceRef.current.updatePosition(gameState, player);
  }, [gameState, player, isReady, options.enabled]);

  // Update config
  const updateConfig = useCallback((newConfig: Partial<AnalysisConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      if (serviceRef.current) {
        serviceRef.current.updateConfig(updated);
      }
      return updated;
    });
  }, []);

  // Restart analysis manually
  const restartAnalysis = useCallback(() => {
    if (!serviceRef.current || !isReady || !gameState || !options.enabled) {
      return;
    }

    serviceRef.current.stopAnalysis();
    setAnalysis(null);
    setIsAnalyzing(true);
    serviceRef.current.startAnalysis(gameState, player, handleAnalysisUpdate);
  }, [isReady, gameState, player, options.enabled, handleAnalysisUpdate]);

  return {
    analysis,
    isAnalyzing,
    isReady,
    error,
    config,
    updateConfig,
    restartAnalysis,
  };
}
