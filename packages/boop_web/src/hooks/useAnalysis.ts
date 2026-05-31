/**
 * useAnalysis - React hook for board analysis
 *
 * Polls the shared AlphaZeroService for tree snapshots on an interval.
 * The worker searches continuously; this hook just reads the results.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  AnalysisResult,
  AnalysisConfig,
} from '../game/analysisTypes';
import { useAlphaZeroService, useAlphaZeroReady } from '../contexts/AlphaZeroContext';

export interface UseAnalysisOptions {
  enabled: boolean;
  config?: Partial<AnalysisConfig>;
}

export interface UseAnalysisReturn {
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  isReady: boolean;
  error: string | null;
  config: AnalysisConfig;
  updateConfig: (config: Partial<AnalysisConfig>) => void;
}

export function useAnalysis(
  options: UseAnalysisOptions
): UseAnalysisReturn {
  const service = useAlphaZeroService();
  const isReady = useAlphaZeroReady();

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
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

  const enabled = options.enabled && isReady;

  // Poll for snapshots
  useEffect(() => {
    if (!enabled) {
      setAnalysis(null);
      return;
    }

    let polling = true;

    const poll = async () => {
      try {
        const result = await service.getSnapshot();
        if (polling) {
          setAnalysis(result);
          setError(null);
        }
      } catch {
        // Ignore errors (e.g. overlapping requests, no position set)
      }
    };

    // Initial poll
    poll();

    const interval = setInterval(poll, config.updateIntervalMs);

    return () => {
      polling = false;
      clearInterval(interval);
    };
  }, [enabled, service, config.updateIntervalMs]);

  const updateConfig = useCallback((newConfig: Partial<AnalysisConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  return {
    analysis,
    isAnalyzing: enabled && analysis !== null,
    isReady,
    error,
    config,
    updateConfig,
  };
}
