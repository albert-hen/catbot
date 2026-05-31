/**
 * AlphaZero Service
 *
 * Thin main-thread wrapper for the AlphaZero web worker.
 * Provides position management, move selection, and tree snapshots.
 */

import type {
  AnalysisResult,
  AlphaZeroWorkerMessage,
  AlphaZeroWorkerResponse,
} from '../game/analysisTypes';
import { GameState, gameStateToTensor, getCanonicalForm } from '../game';

export type AlphaZeroServiceStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

export class AlphaZeroService {
  private worker: Worker | null = null;
  private status: AlphaZeroServiceStatus = 'uninitialized';
  private initResolve: (() => void) | null = null;
  private initReject: ((error: Error) => void) | null = null;
  private pendingMoveRequest: {
    resolve: (action: number) => void;
    reject: (error: Error) => void;
  } | null = null;
  private pendingSnapshot: {
    resolve: (result: AnalysisResult) => void;
    reject: (error: Error) => void;
  } | null = null;
  private currentPositionHash: string = '';

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

      case 'snapshot':
        if (this.pendingSnapshot) {
          this.pendingSnapshot.resolve(msg.result);
          this.pendingSnapshot = null;
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
        if (this.pendingSnapshot) {
          this.pendingSnapshot.reject(new Error(msg.message));
          this.pendingSnapshot = null;
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

    this.setPosition(gameState, player);

    return new Promise((resolve, reject) => {
      this.pendingMoveRequest = { resolve, reject };
      this.sendMessage({ type: 'requestMove', numSimulations });
    });
  }

  async getSnapshot(): Promise<AnalysisResult> {
    if (this.status !== 'ready') {
      throw new Error('AlphaZero service not ready');
    }

    // Drop if a snapshot request is already pending
    if (this.pendingSnapshot) {
      throw new Error('Snapshot request already in progress');
    }

    return new Promise((resolve, reject) => {
      this.pendingSnapshot = { resolve, reject };
      this.sendMessage({ type: 'getSnapshot' });
    });
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
    this.pendingSnapshot = null;
    this.initResolve = null;
    this.initReject = null;
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
