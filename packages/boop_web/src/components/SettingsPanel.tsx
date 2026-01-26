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
      {(playerConfig.orange === 'ai' || playerConfig.gray === 'ai') && (
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
        <button 
          className="undo-button" 
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo last move (U)"
        >
          ↩ Undo
        </button>
        <button className="reset-button" onClick={onReset}>
          New Game
        </button>
      </div>
    </div>
  );
};
