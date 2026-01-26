/**
 * Boop Game - Control Panel Component
 */

import type { 
  PieceType, 
  GraduationChoice,
} from '../game';
import { 
  GameState, 
} from '../game';
import './ControlPanel.css';

interface ControlPanelProps {
  gameState: GameState;
  selectedPieceType: PieceType | null;
  onSelectPieceType: (pieceType: PieceType) => void;
  onSelectGraduation: (choice: GraduationChoice) => void;
  onHoverGraduation: (choice: GraduationChoice | null) => void;
  isAIThinking: boolean;
}

const PIECE_INFO: Record<PieceType, { spriteClass: string; label: string }> = {
  ok: { spriteClass: 'sprite-orange-kitten', label: 'Kitten' },
  gk: { spriteClass: 'sprite-gray-kitten', label: 'Kitten' },
  oc: { spriteClass: 'sprite-orange-cat', label: 'Cat' },
  gc: { spriteClass: 'sprite-gray-cat', label: 'Cat' },
};

export const ControlPanel: React.FC<ControlPanelProps> = ({
  gameState,
  selectedPieceType,
  onSelectPieceType,
  onSelectGraduation,
  onHoverGraduation,
  isAIThinking,
}) => {
  const isOrangeTurn = gameState.currentTurn === 'orange';
  const isGraduation = gameState.stateMode === 'waiting_for_graduation_choice';

  const formatGraduationChoice = (choice: GraduationChoice): string => {
    if (choice.length === 1) {
      const [row, col] = choice[0];
      return `Single at (${row + 1}, ${col + 1})`;
    }
    
    // Determine orientation
    const [r0, c0] = choice[0];
    const [r1, c1] = choice[1];
    
    if (r0 === r1) {
      return `Horizontal line`;
    } else if (c0 === c1) {
      return `Vertical line`;
    } else {
      return `Diagonal line`;
    }
  };

  // Generate status message - use consistent player name width
  const getStatusMessage = (): { text: string; isThinking: boolean } => {
    if (gameState.gameOver) {
      return { text: `Game over - ${gameState.winner === 'orange' ? 'Orange' : 'Gray'} wins!`, isThinking: false };
    }
    
    // Use "Orange" for sizing since it's longer - Gray will just have extra space
    const playerName = isOrangeTurn ? 'Orange' : 'Gray';
    const action = isGraduation ? 'choose graduation' : 'place a piece';
    
    if (isAIThinking) {
      return { text: `${playerName} AI is thinking...`, isThinking: true };
    }
    
    return { text: `Waiting for ${playerName} to ${action}`, isThinking: false };
  };

  const status = getStatusMessage();

  return (
    <div className="control-panel">
      {/* Current Turn */}
      <div className="turn-indicator">
        <h2>
          {gameState.gameOver 
            ? <><span className={`turn-icon ${gameState.winner}`}></span> {gameState.winner === 'orange' ? 'Orange' : 'Gray'} Wins!</>
            : <><span className={`turn-icon ${isOrangeTurn ? 'orange' : 'gray'}`}></span> {isOrangeTurn ? 'Orange' : 'Gray'}'s Turn</>
          }
        </h2>
      </div>

      {/* Status Area - always visible to prevent layout shifts */}
      <div className="game-status">
        {status.isThinking && <span className="spinner"></span>}
        <span className="status-text">{status.text}</span>
      </div>

      {/* Piece Selection (only during placement) */}
      {!gameState.gameOver && !isGraduation && (
        <div className="piece-selection">
          <h3>Select Piece Type</h3>
          <div className="piece-buttons">
            {(isOrangeTurn ? ['ok', 'oc'] as PieceType[] : ['gk', 'gc'] as PieceType[]).map((piece) => {
              const count = gameState.availablePieces[piece];
              const isAvailable = count > 0;
              return (
                <button
                  key={piece}
                  className={`piece-button ${selectedPieceType === piece ? 'selected' : ''} ${!isAvailable ? 'unavailable' : ''}`}
                  onClick={() => isAvailable && onSelectPieceType(piece)}
                  disabled={isAIThinking || !isAvailable}
                >
                  <span className={`piece-sprite ${PIECE_INFO[piece].spriteClass}`}></span>
                  <span className="piece-label">{PIECE_INFO[piece].label}</span>
                  <span className="piece-count">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Graduation Choices */}
      {!gameState.gameOver && isGraduation && (
        <div className="graduation-selection">
          <h3>Choose Graduation</h3>
          <div className="graduation-buttons">
            {gameState.graduationChoices.map((choice, index) => (
              <button
                key={index}
                className="graduation-button"
                onClick={() => onSelectGraduation(choice)}
                onMouseEnter={() => onHoverGraduation(choice)}
                onMouseLeave={() => onHoverGraduation(null)}
                disabled={isAIThinking}
              >
                {formatGraduationChoice(choice)}
                <span className="graduation-positions">
                  {choice.map(([r, c]) => `(${r + 1},${c + 1})`).join(' → ')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Piece Counts */}
      <div className="piece-counts">
        <h3>Available Pieces</h3>
        <div className="counts-grid">
          <div className="count-row orange">
            <span className="player-label"><span className="turn-icon orange"></span> Orange</span>
            <span className="count-item"><span className="piece-sprite-small sprite-orange-kitten"></span> {gameState.availablePieces.ok}</span>
            <span className="count-item"><span className="piece-sprite-small sprite-orange-cat"></span> {gameState.availablePieces.oc}</span>
          </div>
          <div className="count-row gray">
            <span className="player-label"><span className="turn-icon gray"></span> Gray</span>
            <span className="count-item"><span className="piece-sprite-small sprite-gray-kitten"></span> {gameState.availablePieces.gk}</span>
            <span className="count-item"><span className="piece-sprite-small sprite-gray-cat"></span> {gameState.availablePieces.gc}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
