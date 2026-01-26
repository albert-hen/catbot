/**
 * Boop Game - Main Application
 */

import { useState, useEffect, useCallback } from 'react';
import { Board, ControlPanel, SettingsPanel } from './components';
import { useBoopGame } from './hooks';
import type { PlayerConfig, AIConfig, AnimationConfig } from './hooks';
import { ONNXNeuralNetwork } from './game';
import type { Position } from './game';
import './App.css';

function App() {
  // Neural network state
  const [nnet, setNnet] = useState<ONNXNeuralNetwork | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  
  // Game configuration
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig>({
    orange: 'human',
    gray: 'human',
  });
  const [aiConfig, setAIConfig] = useState<AIConfig>({
    numSimulations: 256,
  });
  const [animationConfig, setAnimationConfig] = useState<AnimationConfig>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('boop_animation_enabled');
    return { enabled: saved !== null ? saved === 'true' : true };
  });
  
  // Load the model on mount
  useEffect(() => {
    const loadModel = async () => {
      setModelLoading(true);
      try {
        const network = new ONNXNeuralNetwork('/model.onnx');
        await network.load();
        setNnet(network);
        setModelLoaded(true);
        console.log('Model loaded successfully');
      } catch (error) {
        console.error('Failed to load model:', error);
      } finally {
        setModelLoading(false);
      }
    };
    
    loadModel();
  }, []);
  
  // Game hook
  const {
    gameState,
    selectedPieceType,
    hoveredGraduation,
    isAIThinking,
    isAnimating,
    lastMoveHighlights,
    moveEffects,
    canUndo,
    selectPieceType,
    placePiece,
    selectGraduation,
    setHoveredGraduation,
    resetGame,
    undo,
  } = useBoopGame(nnet, {
    playerConfig,
    aiConfig,
    animationConfig,
  });
  
  // Handle cell click
  const handleCellClick = useCallback((position: Position) => {
    if (gameState.stateMode === 'waiting_for_placement') {
      placePiece(position);
    }
  }, [gameState.stateMode, placePiece]);
  
  // Handle player config change (reset game when changing)
  const handlePlayerConfigChange = useCallback((config: PlayerConfig) => {
    setPlayerConfig(config);
    // Reset game when player configuration changes
    resetGame();
  }, [resetGame]);
  
  // Handle AI config change
  const handleAIConfigChange = useCallback((config: AIConfig) => {
    setAIConfig(config);
  }, []);
  
  // Handle animation config change (persist to localStorage)
  const handleAnimationConfigChange = useCallback((config: AnimationConfig) => {
    setAnimationConfig(config);
    localStorage.setItem('boop_animation_enabled', String(config.enabled));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>boop.</h1>
      </header>
      
      <main className="app-main">
        <div className="game-container">
          <Board
            gameState={gameState}
            onCellClick={handleCellClick}
            graduationHighlight={hoveredGraduation}
            lastMoveHighlights={lastMoveHighlights}
            moveEffects={moveEffects}
            animationEnabled={animationConfig.enabled}
            isAnimating={isAnimating}
          />
          
          <div className="side-panel">
            <ControlPanel
              gameState={gameState}
              selectedPieceType={selectedPieceType}
              onSelectPieceType={selectPieceType}
              onSelectGraduation={selectGraduation}
              onHoverGraduation={setHoveredGraduation}
              isAIThinking={isAIThinking}
            />
            
            <SettingsPanel
              playerConfig={playerConfig}
              aiConfig={aiConfig}
              animationConfig={animationConfig}
              onPlayerConfigChange={handlePlayerConfigChange}
              onAIConfigChange={handleAIConfigChange}
              onAnimationConfigChange={handleAnimationConfigChange}
              onReset={resetGame}
              canUndo={canUndo}
              onUndo={undo}
              modelLoaded={modelLoaded}
              modelLoading={modelLoading}
            />
          </div>
        </div>
      </main>
      
      <footer className="app-footer">
        <p>
          <a href="https://boardgamegeek.com/boardgame/355433/boop" target="_blank" rel="noopener noreferrer">
            Learn more about boop.
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
