/**
 * Boop Game - Analysis Panel Component
 *
 * Displays live position analysis including evaluation bar,
 * top moves table, and search statistics.
 */

import type { AnalysisResult, AnalysisConfig, MoveCandidate } from '../game/analysisTypes';
import type { Position } from '../game/types';
import './AnalysisPanel.css';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  isReady: boolean;
  config: AnalysisConfig;
  onConfigChange: (config: Partial<AnalysisConfig>) => void;
  onMoveHover?: (position: Position | null) => void;
  error?: string | null;
}

/**
 * Evaluation bar showing who's winning
 */
const EvaluationBar: React.FC<{ evaluation: AnalysisResult['evaluation'] }> = ({ evaluation }) => {
  // Map value from [-1, 1] to [0, 100] for the bar position
  const orangePercent = Math.round(((evaluation.value + 1) / 2) * 100);
  const grayPercent = 100 - orangePercent;

  return (
    <div className="evaluation-bar-container">
      <div className="evaluation-labels">
        <span className="eval-label orange">Orange: {orangePercent}%</span>
        <span className="eval-label gray">Gray: {grayPercent}%</span>
      </div>
      <div className="evaluation-bar">
        <div
          className="evaluation-fill orange"
          style={{ width: `${orangePercent}%` }}
        />
        <div
          className="evaluation-fill gray"
          style={{ width: `${grayPercent}%` }}
        />
        <div
          className="evaluation-marker"
          style={{ left: `${orangePercent}%` }}
        />
      </div>
      <div className="evaluation-description">{evaluation.description}</div>
    </div>
  );
};

/**
 * Table of top moves
 */
const TopMovesTable: React.FC<{
  moves: MoveCandidate[];
  onMoveHover?: (position: Position | null) => void;
}> = ({ moves, onMoveHover }) => {
  if (moves.length === 0) {
    return <div className="no-moves">No moves analyzed yet</div>;
  }

  return (
    <div className="top-moves-table">
      <div className="table-header">
        <span className="col-rank">#</span>
        <span className="col-move">Move</span>
        <span className="col-visits">Visits</span>
        <span className="col-win">Win%</span>
        <span className="col-q">Q</span>
      </div>
      <div className="table-body">
        {moves.map((move, index) => (
          <div
            key={move.action}
            className={`table-row ${index === 0 ? 'best-move' : ''}`}
            onMouseEnter={() => onMoveHover?.(move.position)}
            onMouseLeave={() => onMoveHover?.(null)}
          >
            <span className="col-rank">{index + 1}</span>
            <span className="col-move">{move.moveDescription}</span>
            <span className="col-visits">{move.visitCount}</span>
            <span className="col-win">{move.winProbability.toFixed(0)}%</span>
            <span className="col-q">{move.qValue >= 0 ? '+' : ''}{move.qValue.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Search statistics display
 */
const SearchStats: React.FC<{ stats: AnalysisResult['searchStats']; status: AnalysisResult['status'] }> = ({
  stats,
  status,
}) => {
  return (
    <div className="search-stats">
      <span className="stat">
        <span className="stat-label">Sims:</span> {stats.totalSimulations}
      </span>
      <span className="stat">
        <span className="stat-label">Nodes:</span> {stats.nodesExplored}
      </span>
      <span className="stat">
        <span className="stat-label">Time:</span> {stats.searchTimeMs}ms
      </span>
      {status === 'analyzing' && <span className="analyzing-dot" />}
    </div>
  );
};

/**
 * Main Analysis Panel Component
 */
export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysis,
  isAnalyzing,
  isReady,
  config,
  onConfigChange,
  onMoveHover,
  error,
}) => {
  if (error) {
    return (
      <div className="analysis-panel error">
        <div className="analysis-header">
          <h3>Analysis</h3>
        </div>
        <div className="analysis-error">
          <span className="error-icon">⚠</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!isReady && config.enabled) {
    return (
      <div className="analysis-panel loading">
        <div className="analysis-header">
          <h3>Analysis</h3>
        </div>
        <div className="analysis-loading">
          <span className="spinner" />
          <span>Loading analysis engine...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`analysis-panel ${config.enabled ? 'enabled' : 'disabled'}`}>
      <div className="analysis-header">
        <h3>Position Analysis</h3>
        <div className="analysis-controls">
          {config.enabled && (
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={config.showPolicyOverlay}
                onChange={(e) => onConfigChange({ showPolicyOverlay: e.target.checked })}
              />
              <span>Overlay</span>
            </label>
          )}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onConfigChange({ enabled: e.target.checked })}
            />
            <span>Enable</span>
          </label>
        </div>
      </div>

      {config.enabled && analysis && (
        <div className="analysis-content">
          <EvaluationBar evaluation={analysis.evaluation} />

          <div className="moves-section">
            <h4>Top Moves</h4>
            <TopMovesTable moves={analysis.topMoves} onMoveHover={onMoveHover} />
          </div>

          <SearchStats stats={analysis.searchStats} status={analysis.status} />
        </div>
      )}

      {config.enabled && !analysis && isAnalyzing && (
        <div className="analysis-content">
          <div className="analysis-loading">
            <span className="spinner" />
            <span>Analyzing position...</span>
          </div>
        </div>
      )}

      {config.enabled && !analysis && !isAnalyzing && (
        <div className="analysis-content disabled-message">
          <span>Analysis engine ready</span>
        </div>
      )}

      {!config.enabled && (
        <div className="analysis-content disabled-message">
          <span>Enable analysis to see position evaluation</span>
        </div>
      )}
    </div>
  );
};
