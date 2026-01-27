/**
 * Analysis Service
 *
 * Main thread wrapper for the analysis web worker.
 * Handles communication with the worker and provides a clean API.
 */

import type {
  AnalysisConfig,
  AnalysisResult,
  AnalysisWorkerMessage,
  AnalysisWorkerResponse,
} from '../game/analysisTypes';
import { GameState, gameStateToTensor, getCanonicalForm } from '../game';

/**
 * Callback for analysis updates
 */
export type AnalysisUpdateCallback = (result: AnalysisResult) => void;

/**
 * Service status
 */
export type ServiceStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

/**
 * AnalysisService - Manages the analysis web worker
 */
export class AnalysisService {
  private worker: Worker | null = null;
  private status: ServiceStatus = 'uninitialized';
  private onUpdate: AnalysisUpdateCallback | null = null;
  private onReady: (() => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private config: AnalysisConfig;
  private currentPositionHash: string = '';

  constructor(config?: Partial<AnalysisConfig>) {
    this.config = {
      enabled: false,
      simulationsPerCycle: 100,
      topMovesCount: 5,
      updateIntervalMs: 500,
      showPolicyOverlay: true,
      overlayThreshold: 0.01,
      ...config,
    };
  }

  /**
   * Initialize the worker and load the model
   */
  async initialize(modelUrl: string = '/model.onnx'): Promise<void> {
    if (this.status === 'ready' || this.status === 'initializing') {
      return;
    }

    this.status = 'initializing';

    return new Promise((resolve, reject) => {
      try {
        // Create the worker
        this.worker = new Worker(
          new URL('../workers/AnalysisWorker.ts', import.meta.url),
          { type: 'module' }
        );

        // Set up message handler
        this.worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
          this.handleWorkerMessage(event.data);
        };

        this.worker.onerror = (error) => {
          console.error('[AnalysisService] Worker error:', error);
          this.status = 'error';
          if (this.onError) {
            this.onError(error.message);
          }
          reject(error);
        };

        // Store callbacks for initialization
        this.onReady = () => {
          this.status = 'ready';
          resolve();
        };

        this.onError = (error) => {
          this.status = 'error';
          reject(new Error(error));
        };

        // Send init message
        this.sendMessage({ type: 'init', modelUrl });
      } catch (error) {
        this.status = 'error';
        reject(error);
      }
    });
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(msg: AnalysisWorkerResponse): void {
    switch (msg.type) {
      case 'ready':
        if (this.onReady) {
          this.onReady();
          this.onReady = null;
        }
        break;

      case 'update':
        if (this.onUpdate) {
          this.onUpdate(msg.result);
        }
        break;

      case 'error':
        console.error('[AnalysisService] Worker error:', msg.message);
        if (this.onError) {
          this.onError(msg.message);
        }
        break;
    }
  }

  /**
   * Send a message to the worker
   */
  private sendMessage(msg: AnalysisWorkerMessage): void {
    if (!this.worker) {
      console.warn('[AnalysisService] Worker not initialized');
      return;
    }
    this.worker.postMessage(msg);
  }

  /**
   * Start analyzing a position
   */
  startAnalysis(
    gameState: GameState,
    player: 1 | -1,
    onUpdate: AnalysisUpdateCallback
  ): void {
    if (this.status !== 'ready') {
      console.warn('[AnalysisService] Service not ready');
      return;
    }

    this.onUpdate = onUpdate;

    // Convert to canonical tensor
    const tensor = gameStateToTensor(gameState);
    const canonical = getCanonicalForm(tensor, player);

    // Compute position hash for change detection
    this.currentPositionHash = this.computePositionHash(canonical);

    // Send analyze message with transferable array
    // Note: We need to copy since the original may still be used
    const positionCopy = new Float32Array(canonical);

    this.sendMessage({
      type: 'analyze',
      position: positionCopy,
      player,
      config: this.config,
    });
  }

  /**
   * Update the position being analyzed
   */
  updatePosition(gameState: GameState, player: 1 | -1): void {
    if (this.status !== 'ready' || !this.onUpdate) {
      return;
    }

    // Convert to canonical tensor
    const tensor = gameStateToTensor(gameState);
    const canonical = getCanonicalForm(tensor, player);

    // Check if position changed
    const newHash = this.computePositionHash(canonical);
    if (newHash === this.currentPositionHash) {
      return; // Same position, no update needed
    }

    this.currentPositionHash = newHash;

    // Send new position to analyze
    const positionCopy = new Float32Array(canonical);

    this.sendMessage({
      type: 'analyze',
      position: positionCopy,
      player,
      config: this.config,
    });
  }

  /**
   * Stop the current analysis
   */
  stopAnalysis(): void {
    this.onUpdate = null;
    this.sendMessage({ type: 'stop' });
  }

  /**
   * Update the analysis configuration
   */
  updateConfig(config: Partial<AnalysisConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AnalysisConfig {
    return { ...this.config };
  }

  /**
   * Get service status
   */
  getStatus(): ServiceStatus {
    return this.status;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.status === 'ready';
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.status = 'uninitialized';
    this.onUpdate = null;
    this.onReady = null;
    this.onError = null;
  }

  /**
   * Compute a simple hash for position change detection
   */
  private computePositionHash(tensor: Float32Array): string {
    // Use a simple sum-based hash for efficiency
    let hash = 0;
    for (let i = 0; i < tensor.length; i++) {
      hash = ((hash << 5) - hash + tensor[i]) | 0;
    }
    return hash.toString(36);
  }
}

/**
 * Create and initialize an analysis service
 */
export async function createAnalysisService(
  modelUrl?: string,
  config?: Partial<AnalysisConfig>
): Promise<AnalysisService> {
  const service = new AnalysisService(config);
  await service.initialize(modelUrl);
  return service;
}
