/**
 * Boop Game - Neural Network (ONNX Runtime)
 * 
 * Wrapper for ONNX Runtime Web to run the AlphaZero model in the browser.
 */

import * as ort from 'onnxruntime-web';
import type { NeuralNetwork } from './MCTS';
import { ACTION_SIZE, NUM_CHANNELS } from './tensor';

const BOARD_SIZE = 6;

/**
 * ONNX Neural Network wrapper implementing the NeuralNetwork interface for MCTS.
 */
export class ONNXNeuralNetwork implements NeuralNetwork {
  private session: ort.InferenceSession | null = null;
  private modelPath: string;
  private loadPromise: Promise<void> | null = null;

  constructor(modelPath?: string) {
    this.modelPath = modelPath ?? `${import.meta.env.BASE_URL}model.onnx`;
  }

  /**
   * Load the ONNX model.
   */
  async load(): Promise<void> {
    if (this.session) return;
    
    if (this.loadPromise) {
      return this.loadPromise;
    }
    
    this.loadPromise = this._load();
    
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async _load(): Promise<void> {
    try {
      // Configure ONNX Runtime
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
      
      console.log(`Loading ONNX model from ${this.modelPath}...`);
      this.session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['wasm'],
      });
      console.log('ONNX model loaded successfully');
      
      // Log input/output info
      console.log('Input names:', this.session.inputNames);
      console.log('Output names:', this.session.outputNames);
    } catch (error) {
      console.error('Failed to load ONNX model:', error);
      throw error;
    }
  }

  /**
   * Check if the model is loaded.
   */
  isLoaded(): boolean {
    return this.session !== null;
  }

  /**
   * Predict policy and value for a board state.
   * 
   * @param boardState - Float32Array of shape [9, 6, 6] flattened (324 values)
   * @returns Object with policy (Float32Array of size 188) and value (number in [-1, 1])
   */
  async predict(boardState: Float32Array): Promise<{ policy: Float32Array; value: number }> {
    if (!this.session) {
      await this.load();
    }
    
    if (!this.session) {
      throw new Error('Model not loaded');
    }
    
    // Create input tensor with shape [1, 9, 6, 6]
    const inputTensor = new ort.Tensor(
      'float32',
      boardState,
      [1, NUM_CHANNELS, BOARD_SIZE, BOARD_SIZE]
    );
    
    // Run inference
    const feeds: Record<string, ort.Tensor> = {
      board_state: inputTensor,
    };
    
    const results = await this.session.run(feeds);
    
    // Extract policy (log_softmax output, need to exp it)
    const policyOutput = results.policy;
    const policyData = policyOutput.data as Float32Array;
    
    // Convert from log probabilities to probabilities
    const policy = new Float32Array(ACTION_SIZE);
    for (let i = 0; i < ACTION_SIZE; i++) {
      policy[i] = Math.exp(policyData[i]);
    }
    
    // Extract value (tanh output, already in [-1, 1])
    const valueOutput = results.value;
    const valueData = valueOutput.data as Float32Array;
    const value = valueData[0];
    
    return { policy, value };
  }

  /**
   * Batch predict for multiple board states.
   * 
   * @param boardStates - Array of Float32Array board states
   * @returns Array of { policy, value } for each input
   */
  async batchPredict(boardStates: Float32Array[]): Promise<{ policy: Float32Array; value: number }[]> {
    if (!this.session) {
      await this.load();
    }
    
    if (!this.session) {
      throw new Error('Model not loaded');
    }
    
    if (boardStates.length === 0) {
      return [];
    }
    
    const batchSize = boardStates.length;
    const inputSize = NUM_CHANNELS * BOARD_SIZE * BOARD_SIZE;
    
    // Concatenate all board states into single array
    const batchData = new Float32Array(batchSize * inputSize);
    for (let i = 0; i < batchSize; i++) {
      batchData.set(boardStates[i], i * inputSize);
    }
    
    // Create batch input tensor
    const inputTensor = new ort.Tensor(
      'float32',
      batchData,
      [batchSize, NUM_CHANNELS, BOARD_SIZE, BOARD_SIZE]
    );
    
    const feeds: Record<string, ort.Tensor> = {
      board_state: inputTensor,
    };
    
    const results = await this.session.run(feeds);
    
    // Extract results
    const policyData = results.policy.data as Float32Array;
    const valueData = results.value.data as Float32Array;
    
    const outputs: { policy: Float32Array; value: number }[] = [];
    
    for (let i = 0; i < batchSize; i++) {
      const policy = new Float32Array(ACTION_SIZE);
      for (let j = 0; j < ACTION_SIZE; j++) {
        policy[j] = Math.exp(policyData[i * ACTION_SIZE + j]);
      }
      
      outputs.push({
        policy,
        value: valueData[i],
      });
    }
    
    return outputs;
  }
}

/**
 * Create and load an ONNX neural network.
 */
export async function createNeuralNetwork(modelPath?: string): Promise<ONNXNeuralNetwork> {
  const nn = new ONNXNeuralNetwork(modelPath);
  await nn.load();
  return nn;
}
