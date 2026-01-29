/**
 * Boop Game - Main Application
 */

import { useState, useCallback } from 'react';
import { Board, ControlPanel, SettingsPanel, AnalysisPanel } from './components';
import { useBoopGame, useAnalysis } from './hooks';
import type { PlayerConfig, AIConfig, AnimationConfig } from './hooks';
import type { Position } from './game';
import type { AnalysisConfig } from './game/analysisTypes';
import './App.css';

function App() {
  // Game configuration
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig>({
    orange: 'human',
    gray: 'human',
  });
  const [aiConfig, setAIConfig] = useState<AIConfig>(() => {
    // Load delay from localStorage if available
    const savedDelay = localStorage.getItem('boop_ai_delay');
    return { 
      numSimulations: 256,
      moveDelayMs: savedDelay !== null ? parseInt(savedDelay, 10) : 1000,
    };
  });
  const [animationConfig, setAnimationConfig] = useState<AnimationConfig>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('boop_animation_enabled');
    return { enabled: saved !== null ? saved === 'true' : true };
  });

  // Analysis configuration
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig>(() => {
    const saved = localStorage.getItem('boop_analysis_enabled');
    return {
      enabled: saved !== null ? saved === 'true' : false,
      simulationsPerCycle: 100,
      topMovesCount: 5,
      updateIntervalMs: 500,
      showPolicyOverlay: true,
      overlayThreshold: 0.01,
    };
  });

  // Analysis highlight (when hovering over a move in the analysis panel)
  const [analysisHighlight, setAnalysisHighlight] = useState<Position | null>(null);

  // Game hook (AI model is loaded in the worker)
  const {
    gameState,
    selectedPieceType,
    hoveredGraduation,
    isAIThinking,
    isAIReady,
    isAnimating,
    lastMoveHighlights,
    moveEffects,
    gamePhase,
    isPaused,
    isViewingHistory,
    historyIndex,
    historyLength,
    canGoBack,
    canGoForward,
    selectPieceType,
    placePiece,
    selectGraduation,
    setHoveredGraduation,
    startGame,
    resetGame,
    togglePause,
    goBack,
    goForward,
    goToPresent,
    playFromHistory,
  } = useBoopGame({
    playerConfig,
    aiConfig,
    animationConfig,
    modelUrl: `${import.meta.env.BASE_URL}model.onnx`,
  });

  // Determine current player for analysis
  const currentPlayer: 1 | -1 = gameState.currentTurn === 'orange' ? 1 : -1;

  // Analysis hook
  const {
    analysis,
    isAnalyzing,
    isReady: analysisReady,
    error: analysisError,
    config: analysisConfigState,
    updateConfig: updateAnalysisConfig,
  } = useAnalysis(gameState, currentPlayer, {
    enabled: analysisConfig.enabled && !gameState.gameOver && gamePhase !== 'setup',
    modelUrl: `${import.meta.env.BASE_URL}model.onnx`,
    config: analysisConfig,
  });
  
  // Handle cell click
  const handleCellClick = useCallback((position: Position) => {
    if (gameState.stateMode === 'waiting_for_placement') {
      placePiece(position);
    }
  }, [gameState.stateMode, placePiece]);

  // Handle analysis config change
  const handleAnalysisConfigChange = useCallback((config: Partial<AnalysisConfig>) => {
    setAnalysisConfig(prev => {
      const updated = { ...prev, ...config };
      localStorage.setItem('boop_analysis_enabled', String(updated.enabled));
      updateAnalysisConfig(updated);
      return updated;
    });
  }, [updateAnalysisConfig]);

  // Handle move hover from analysis panel
  const handleMoveHover = useCallback((position: Position | null) => {
    setAnalysisHighlight(position);
  }, []);
  
  // Handle player config change (only in setup phase, so no reset needed)
  const handlePlayerConfigChange = useCallback((config: PlayerConfig) => {
    setPlayerConfig(config);
  }, []);
  
  // Handle AI config change (persist delay to localStorage)
  const handleAIConfigChange = useCallback((config: AIConfig) => {
    setAIConfig(config);
    localStorage.setItem('boop_ai_delay', String(config.moveDelayMs));
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
          <div className="left-panel">
            <ControlPanel
              gameState={gameState}
              selectedPieceType={selectedPieceType}
              onSelectPieceType={selectPieceType}
              onSelectGraduation={selectGraduation}
              onHoverGraduation={setHoveredGraduation}
              isAIThinking={isAIThinking}
              analysis={analysisConfig.showPolicyOverlay ? analysis : null}
            />
          </div>

          <Board
            gameState={gameState}
            onCellClick={handleCellClick}
            graduationHighlight={hoveredGraduation}
            lastMoveHighlights={lastMoveHighlights}
            moveEffects={moveEffects}
            animationEnabled={animationConfig.enabled}
            isAnimating={isAnimating}
            gamePhase={gamePhase}
            policyOverlay={analysisConfig.showPolicyOverlay ? analysis?.policyOverlay : null}
            showPolicyOverlay={analysisConfig.enabled && analysisConfig.showPolicyOverlay}
            analysisHighlight={analysisHighlight}
          />

          <div className="right-panel">
            <SettingsPanel
              playerConfig={playerConfig}
              aiConfig={aiConfig}
              animationConfig={animationConfig}
              gamePhase={gamePhase}
              onPlayerConfigChange={handlePlayerConfigChange}
              onAIConfigChange={handleAIConfigChange}
              onAnimationConfigChange={handleAnimationConfigChange}
              onStartGame={startGame}
              onReset={resetGame}
              isPaused={isPaused}
              isViewingHistory={isViewingHistory}
              historyIndex={historyIndex}
              historyLength={historyLength}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onTogglePause={togglePause}
              onGoBack={goBack}
              onGoForward={goForward}
              onGoToPresent={goToPresent}
              onPlayFromHistory={playFromHistory}
              modelLoaded={isAIReady}
              modelLoading={!isAIReady}
            />
          </div>
        </div>

        <div className="analysis-container">
          <AnalysisPanel
            analysis={analysis}
            isAnalyzing={isAnalyzing}
            isReady={analysisReady}
            config={analysisConfigState}
            onConfigChange={handleAnalysisConfigChange}
            onMoveHover={handleMoveHover}
            error={analysisError}
          />
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
