/**
 * AI Service
 *
 * Main thread wrapper for the AI web worker.
 * Handles communication with the worker and provides a clean API.
 */

import type { AIWorkerMessage, AIWorkerResponse } from '../game/analysisTypes';
import { GameState, gameStateToTensor, getCanonicalForm } from '../game';

/**
 * Service status
 */
export type AIServiceStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

/**
 * AIService - Manages the AI web worker
 */
export class AIService {
  private worker: Worker | null = null;
  private status: AIServiceStatus = 'uninitialized';
  private pendingRequest: {
    resolve: (action: number) => void;
    reject: (error: Error) => void;
  } | null = null;
  private initResolve: (() => void) | null = null;
  private initReject: ((error: Error) => void) | null = null;

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
          new URL('../workers/AIWorker.ts', import.meta.url),
          { type: 'module' }
        );

        // Set up message handler
        this.worker.onmessage = (event: MessageEvent<AIWorkerResponse>) => {
          this.handleWorkerMessage(event.data);
        };

        this.worker.onerror = (error) => {
          console.error('[AIService] Worker error:', error);
          this.status = 'error';
          if (this.initReject) {
            this.initReject(new Error(error.message));
            this.initReject = null;
            this.initResolve = null;
          }
          if (this.pendingRequest) {
            this.pendingRequest.reject(new Error(error.message));
            this.pendingRequest = null;
          }
        };

        // Store callbacks for initialization
        this.initResolve = resolve;
        this.initReject = reject;

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
  private handleWorkerMessage(msg: AIWorkerResponse): void {
    switch (msg.type) {
      case 'ready':
        this.status = 'ready';
        if (this.initResolve) {
          this.initResolve();
          this.initResolve = null;
          this.initReject = null;
        }
        break;

      case 'action':
        if (this.pendingRequest) {
          this.pendingRequest.resolve(msg.action);
          this.pendingRequest = null;
        }
        break;

      case 'error':
        console.error('[AIService] Worker error:', msg.message);
        if (this.initReject) {
          this.initReject(new Error(msg.message));
          this.initReject = null;
          this.initResolve = null;
        }
        if (this.pendingRequest) {
          this.pendingRequest.reject(new Error(msg.message));
          this.pendingRequest = null;
        }
        break;
    }
  }

  /**
   * Send a message to the worker
   */
  private sendMessage(msg: AIWorkerMessage): void {
    if (!this.worker) {
      console.warn('[AIService] Worker not initialized');
      return;
    }
    this.worker.postMessage(msg);
  }

  /**
   * Select the best action for the given game state
   */
  async selectAction(
    gameState: GameState,
    player: 1 | -1,
    numSimulations: number
  ): Promise<number> {
    if (this.status !== 'ready') {
      throw new Error('AI service not ready');
    }

    if (this.pendingRequest) {
      throw new Error('Action selection already in progress');
    }

    return new Promise((resolve, reject) => {
      this.pendingRequest = { resolve, reject };

      // Convert to canonical tensor
      const tensor = gameStateToTensor(gameState);
      const canonical = getCanonicalForm(tensor, player);

      // Send selectAction message
      this.sendMessage({
        type: 'selectAction',
        position: new Float32Array(canonical),
        player,
        numSimulations,
      });
    });
  }

  /**
   * Get service status
   */
  getStatus(): AIServiceStatus {
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
    this.pendingRequest = null;
    this.initResolve = null;
    this.initReject = null;
  }
}

/**
 * Create and initialize an AI service
 */
export async function createAIService(modelUrl?: string): Promise<AIService> {
  const service = new AIService();
  await service.initialize(modelUrl);
  return service;
}
