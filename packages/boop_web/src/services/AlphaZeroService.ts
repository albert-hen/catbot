/**
 * AlphaZero Service
 *
 * Unified main thread wrapper for the AlphaZero web worker.
 * Provides both AI move selection and analysis from a single worker/runtime.
 */

import type {
  AnalysisConfig,
  AnalysisResult,
  AlphaZeroWorkerMessage,
  AlphaZeroWorkerResponse,
} from '../game/analysisTypes';
import { GameState, gameStateToTensor, getCanonicalForm } from '../game';

export type AnalysisUpdateCallback = (result: AnalysisResult) => void;

export type AlphaZeroServiceStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

/**
 * AlphaZeroService - Manages the unified AlphaZero web worker
 */
export class AlphaZeroService {
  private worker: Worker | null = null;
  private status: AlphaZeroServiceStatus = 'uninitialized';
  private initResolve: (() => void) | null = null;
  private initReject: ((error: Error) => void) | null = null;
  private pendingMoveRequest: {
    resolve: (action: number) => void;
    reject: (error: Error) => void;
  } | null = null;
  private analysisCallback: AnalysisUpdateCallback | null = null;
  private currentPositionHash: string = '';

  /**
   * Initialize the worker and load the model
   */
  async initialize(modelUrl?: string): Promise<void> {
    modelUrl = modelUrl ?? `${import.meta.env.BASE_URL}model.onnx`;
    if (this.status === 'ready' || this.status === 'initializing') {
      return;
    }

    this.status = 'initializing';

    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(
          new URL('../workers/AlphaZeroWorker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (event: MessageEvent<AlphaZeroWorkerResponse>) => {
          this.handleWorkerMessage(event.data);
        };

        this.worker.onerror = (error) => {
          console.error('[AlphaZeroService] Worker error:', error);
          this.status = 'error';
          if (this.initReject) {
            this.initReject(new Error(error.message));
            this.initReject = null;
            this.initResolve = null;
          }
          if (this.pendingMoveRequest) {
            this.pendingMoveRequest.reject(new Error(error.message));
            this.pendingMoveRequest = null;
          }
        };

        this.initResolve = resolve;
        this.initReject = reject;

        this.sendMessage({ type: 'init', modelUrl });
      } catch (error) {
        this.status = 'error';
        reject(error);
      }
    });
  }

  private handleWorkerMessage(msg: AlphaZeroWorkerResponse): void {
    switch (msg.type) {
      case 'ready':
        this.status = 'ready';
        if (this.initResolve) {
          this.initResolve();
          this.initResolve = null;
          this.initReject = null;
        }
        break;

      case 'moveResult':
        if (this.pendingMoveRequest) {
          this.pendingMoveRequest.resolve(msg.action);
          this.pendingMoveRequest = null;
        }
        break;

      case 'analysisUpdate':
        if (this.analysisCallback) {
          this.analysisCallback(msg.result);
        }
        break;

      case 'error':
        console.error('[AlphaZeroService] Worker error:', msg.message);
        if (this.initReject) {
          this.initReject(new Error(msg.message));
          this.initReject = null;
          this.initResolve = null;
        }
        if (this.pendingMoveRequest) {
          this.pendingMoveRequest.reject(new Error(msg.message));
          this.pendingMoveRequest = null;
        }
        break;
    }
  }

  private sendMessage(msg: AlphaZeroWorkerMessage): void {
    if (!this.worker) {
      console.warn('[AlphaZeroService] Worker not initialized');
      return;
    }
    this.worker.postMessage(msg);
  }

  /**
   * Update the current game position for the worker to search.
   * The persistent MCTS tree is reused — existing nodes carry over.
   */
  setPosition(gameState: GameState, player: 1 | -1): void {
    if (this.status !== 'ready') return;

    const tensor = gameStateToTensor(gameState);
    const canonical = getCanonicalForm(tensor, player);

    const newHash = this.computePositionHash(canonical);
    if (newHash === this.currentPositionHash) return;
    this.currentPositionHash = newHash;

    this.sendMessage({
      type: 'setPosition',
      position: new Float32Array(canonical),
      player,
    });
  }

  /**
   * Request the best move for the current position.
   * The worker will ensure at least numSimulations have been run, then return.
   */
  async selectAction(
    gameState: GameState,
    player: 1 | -1,
    numSimulations: number
  ): Promise<number> {
    if (this.status !== 'ready') {
      throw new Error('AlphaZero service not ready');
    }

    if (this.pendingMoveRequest) {
      throw new Error('Move request already in progress');
    }

    // Ensure position is set
    this.setPosition(gameState, player);

    return new Promise((resolve, reject) => {
      this.pendingMoveRequest = { resolve, reject };
      this.sendMessage({ type: 'requestMove', numSimulations });
    });
  }

  /**
   * Enable or disable analysis updates
   */
  setAnalysisEnabled(enabled: boolean, config?: AnalysisConfig): void {
    this.sendMessage({ type: 'setAnalysisEnabled', enabled, config });
  }

  /**
   * Register a callback for analysis updates
   */
  onAnalysisUpdate(callback: AnalysisUpdateCallback | null): void {
    this.analysisCallback = callback;
  }

  getStatus(): AlphaZeroServiceStatus {
    return this.status;
  }

  isReady(): boolean {
    return this.status === 'ready';
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.status = 'uninitialized';
    this.pendingMoveRequest = null;
    this.initResolve = null;
    this.initReject = null;
    this.analysisCallback = null;
    this.currentPositionHash = '';
  }

  private computePositionHash(tensor: Float32Array): string {
    let hash = 0;
    for (let i = 0; i < tensor.length; i++) {
      hash = ((hash << 5) - hash + tensor[i]) | 0;
    }
    return hash.toString(36);
  }
}
