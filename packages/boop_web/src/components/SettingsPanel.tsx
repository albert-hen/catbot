/**
 * Boop Game - Settings Panel Component
 */

import type { PlayerConfig, AIConfig, AnimationConfig } from '../hooks/useBoopGame';
import './SettingsPanel.css';

interface SettingsPanelProps {
  playerConfig: PlayerConfig;
  aiConfig: AIConfig;
  animationConfig: AnimationConfig;
  onPlayerConfigChange: (config: PlayerConfig) => void;
  onAIConfigChange: (config: AIConfig) => void;
  onAnimationConfigChange: (config: AnimationConfig) => void;
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
  onPlayerConfigChange,
  onAIConfigChange,
  onAnimationConfigChange,
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
  const handlePlayerToggle = (player: 'orange' | 'gray') => {
    onPlayerConfigChange({
      ...playerConfig,
      [player]: playerConfig[player] === 'human' ? 'ai' : 'human',
    });
  };

  const handleSimulationsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  
  // Check if any AI is playing
  const hasAI = playerConfig.orange === 'ai' || playerConfig.gray === 'ai';

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
      <div className="player-config">
        <div className="player-toggle">
          <span className="player-name"><span className="turn-icon orange"></span> Orange</span>
          <button 
            className={`toggle-button ${playerConfig.orange}`}
            onClick={() => handlePlayerToggle('orange')}
            disabled={!modelLoaded && playerConfig.orange === 'human'}
          >
            {playerConfig.orange === 'human' ? 'Human' : 'AI'}
          </button>
        </div>
        <div className="player-toggle">
          <span className="player-name"><span className="turn-icon gray"></span> Gray</span>
          <button 
            className={`toggle-button ${playerConfig.gray}`}
            onClick={() => handlePlayerToggle('gray')}
            disabled={!modelLoaded && playerConfig.gray === 'human'}
          >
            {playerConfig.gray === 'human' ? 'Human' : 'AI'}
          </button>
        </div>
      </div>

      {/* AI Configuration */}
      {hasAI && (
        <div className="ai-config">
          <label>
            <span>MCTS Simulations</span>
            <input
              type="number"
              min="1"
              max="1000"
              step="10"
              value={aiConfig.numSimulations}
              onChange={handleSimulationsChange}
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
      
      {/* Pause/Replay Controls (only show when AI is playing) */}
      {hasAI && (
        <div className="pause-controls">
          <button
            className={`pause-button ${isPaused ? 'paused' : ''}`}
            onClick={onTogglePause}
            title="Pause/Resume (P)"
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          
          {isPaused && (
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
        {!hasAI && (
          <button 
            className="undo-button" 
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo last move (U)"
          >
            ↩ Undo
          </button>
        )}
        <button className="reset-button" onClick={onReset}>
          New Game
        </button>
      </div>
    </div>
  );
};
