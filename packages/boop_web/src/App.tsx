/**
 * Boop Game - Main Application
 */

import { useState, useEffect, useCallback } from 'react';
import { Board, ControlPanel, SettingsPanel } from './components';
import { useBoopGame } from './hooks';
import type { PlayerConfig, AIConfig } from './hooks';
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
    selectPieceType,
    placePiece,
    selectGraduation,
    setHoveredGraduation,
    resetGame,
  } = useBoopGame(nnet, {
    playerConfig,
    aiConfig,
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
              onPlayerConfigChange={handlePlayerConfigChange}
              onAIConfigChange={handleAIConfigChange}
              onReset={resetGame}
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
