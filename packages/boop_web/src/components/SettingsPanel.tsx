/**
 * Boop Game - Settings Panel Component
 */

import { useState } from 'react';
import type { PlayerConfig, AIConfig, AnimationConfig, GamePhase } from '../hooks/useBoopGame';
import './SettingsPanel.css';

interface SettingsPanelProps {
  playerConfig: PlayerConfig;
  aiConfig: AIConfig;
  animationConfig: AnimationConfig;
  gamePhase: GamePhase;
  onPlayerConfigChange: (config: PlayerConfig) => void;
  onAIConfigChange: (config: AIConfig) => void;
  onAnimationConfigChange: (config: AnimationConfig) => void;
  onStartGame: () => void;
  onReset: () => void;
  canUndo: boolean;
  onUndo: () => void;
  // Pause/replay controls
  isPaused: boolean;
  isViewingHistory: boolean;
  historyIndex: number;
  historyLength: number;
  canGoForward: boolean;
  onTogglePause: () => void;
  onGoForward: () => void;
  onGoToPresent: () => void;
  modelLoaded: boolean;
  modelLoading: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  playerConfig,
  aiConfig,
  animationConfig,
  gamePhase,
  onPlayerConfigChange,
  onAIConfigChange,
  onAnimationConfigChange,
  onStartGame,
  onReset,
  canUndo,
  onUndo,
  isPaused,
  isViewingHistory,
  historyIndex,
  historyLength,
  canGoForward,
  onTogglePause,
  onGoForward,
  onGoToPresent,
  modelLoaded,
  modelLoading,
}) => {
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  
  const handlePlayerToggle = (player: 'orange' | 'gray') => {
    // Only allow toggling in setup phase
    if (gamePhase !== 'setup') return;
    onPlayerConfigChange({
      ...playerConfig,
      [player]: playerConfig[player] === 'human' ? 'ai' : 'human',
    });
  };

  const handleSimulationsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow changes in setup phase
    if (gamePhase !== 'setup') return;
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      onAIConfigChange({ ...aiConfig, numSimulations: value });
    }
  };
  
  const handleDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0) {
      onAIConfigChange({ ...aiConfig, moveDelayMs: value });
    }
  };
  
  const handleNewGameClick = () => {
    if (gamePhase === 'playing') {
      setShowConfirmReset(true);
    } else {
      onReset();
    }
  };
  
  const handleConfirmReset = () => {
    setShowConfirmReset(false);
    onReset();
  };
  
  const handleCancelReset = () => {
    setShowConfirmReset(false);
  };
  
  // Check if any AI is playing
  const hasAI = playerConfig.orange === 'ai' || playerConfig.gray === 'ai';
  const isSetup = gamePhase === 'setup';
  const isPlaying = gamePhase === 'playing';
  const isGameOver = gamePhase === 'game_over';

  return (
    <div className="settings-panel">
      <h3>Game Settings</h3>
      
      {/* Model Status */}
      <div className="model-status">
        <span className={`status-indicator ${modelLoaded ? 'loaded' : modelLoading ? 'loading' : 'not-loaded'}`}></span>
        <span>
          {modelLoading 
            ? 'Loading AI model...' 
            : modelLoaded 
              ? 'AI model ready' 
              : 'AI model not loaded'}
        </span>
      </div>

      {/* Player Configuration */}
      <div className={`player-config ${!isSetup ? 'disabled' : ''}`}>
        <div className="player-toggle">
          <span className="player-name"><span className="turn-icon orange"></span> Orange</span>
          <button 
            className={`toggle-button ${playerConfig.orange}`}
            onClick={() => handlePlayerToggle('orange')}
            disabled={!isSetup || (!modelLoaded && playerConfig.orange === 'human')}
          >
            {playerConfig.orange === 'human' ? 'Human' : 'AI'}
          </button>
        </div>
        <div className="player-toggle">
          <span className="player-name"><span className="turn-icon gray"></span> Gray</span>
          <button 
            className={`toggle-button ${playerConfig.gray}`}
            onClick={() => handlePlayerToggle('gray')}
            disabled={!isSetup || (!modelLoaded && playerConfig.gray === 'human')}
          >
            {playerConfig.gray === 'human' ? 'Human' : 'AI'}
          </button>
        </div>
        {!isSetup && (
          <p className="config-locked-hint">Settings locked during game</p>
        )}
      </div>

      {/* AI Configuration */}
      {hasAI && (
        <div className={`ai-config ${!isSetup ? 'read-only' : ''}`}>
          <label>
            <span>MCTS Simulations</span>
            <input
              type="number"
              min="1"
              max="1000"
              step="10"
              value={aiConfig.numSimulations}
              onChange={handleSimulationsChange}
              disabled={!isSetup}
            />
          </label>
          <p className="config-hint">
            More simulations = stronger play but slower
          </p>
          <label>
            <span>AI Move Delay (ms)</span>
            <input
              type="number"
              min="0"
              max="5000"
              step="100"
              value={aiConfig.moveDelayMs}
              onChange={handleDelayChange}
            />
          </label>
          <p className="config-hint">
            Pause before each AI move (0 = instant)
          </p>
        </div>
      )}
      
      {/* Pause/Replay Controls (only show when AI is playing during playing/game_over phase) */}
      {hasAI && (isPlaying || isGameOver) && (
        <div className="pause-controls">
          {isPlaying && (
            <button
              className={`pause-button ${isPaused ? 'paused' : ''}`}
              onClick={onTogglePause}
              title="Pause/Resume (P)"
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
          )}
          
          {(isPaused || isGameOver) && (
            <div className="history-navigation">
              <div className="history-position">
                Move {historyIndex} / {historyLength}
                {isViewingHistory && ' (viewing history)'}
              </div>
              <div className="history-buttons">
                <button
                  onClick={onUndo}
                  disabled={historyIndex === 0}
                  title="Go back (U)"
                >
                  ← Back
                </button>
                <button
                  onClick={onGoForward}
                  disabled={!canGoForward}
                  title="Go forward (I)"
                >
                  Forward →
                </button>
                {isViewingHistory && (
                  <button
                    onClick={onGoToPresent}
                    className="go-to-present"
                    title="Return to current game"
                  >
                    ⏭ Present
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Animation Settings */}
      <div className="animation-config">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={animationConfig.enabled}
            onChange={(e) => onAnimationConfigChange({ enabled: e.target.checked })}
          />
          <span>Enable move animations</span>
        </label>
      </div>

      {/* Game Controls */}
      <div className="game-controls">
        {/* Undo button only for human vs human during play */}
        {!hasAI && isPlaying && (
          <button 
            className="undo-button" 
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo last move (U)"
          >
            ↩ Undo
          </button>
        )}
        
        {/* Start Game button in setup phase */}
        {isSetup && (
          <button 
            className="start-button" 
            onClick={onStartGame}
            disabled={!modelLoaded && hasAI}
          >
            ▶ Start Game
          </button>
        )}
        
        {/* New Game button during play or game over */}
        {(isPlaying || isGameOver) && (
          <button className="reset-button" onClick={handleNewGameClick}>
            New Game
          </button>
        )}
      </div>
      
      {/* Confirmation Dialog */}
      {showConfirmReset && (
        <div className="confirm-dialog-overlay">
          <div className="confirm-dialog">
            <p>Are you sure you want to start a new game?</p>
            <p className="confirm-subtext">Current game progress will be lost.</p>
            <div className="confirm-buttons">
              <button className="confirm-cancel" onClick={handleCancelReset}>
                Cancel
              </button>
              <button className="confirm-ok" onClick={handleConfirmReset}>
                New Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
