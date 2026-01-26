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

  const formatGraduationChoice = (choice: GraduationChoice): { type: string; coordinates: string } => {
    if (choice.length === 1) {
      const [row, col] = choice[0];
      return {
        type: 'Single',
        coordinates: `(${row + 1},${col + 1})`
      };
    }
    
    // Determine orientation and format coordinates
    const [r0, c0] = choice[0];
    const [r1, c1] = choice[1];
    const [r2, c2] = choice[2];
    const coords = `(${r0 + 1},${c0 + 1})->(${r1 + 1},${c1 + 1})->(${r2 + 1},${c2 + 1})`;
    
    if (r0 === r1) {
      return { type: 'Horizontal', coordinates: coords };
    } else if (c0 === c1) {
      return { type: 'Vertical', coordinates: coords };
    } else {
      return { type: 'Diagonal', coordinates: coords };
    }
  };

  // Generate status message - use consistent player name width
  const getStatusMessage = (): { text: string; isThinking: boolean } => {
    if (gameState.gameOver) {
      return { text: `Game over - ${gameState.winner === 'orange' ? 'Orange' : 'Gray'} wins!`, isThinking: false };
    }
    
    // Use "Orange" for sizing since it's longer - Gray will just have extra space
    const playerName = isOrangeTurn ? 'Orange' : 'Gray';
    const action = isGraduation ? 'graduate' : 'place';
    
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

      {/* Piece Selection & Counts - always visible */}
      <div className="piece-selection">
        <h3>Select Piece</h3>
        <div className={`piece-groups ${isOrangeTurn ? 'orange-turn' : 'gray-turn'}`}>
          <div className={`piece-group orange ${isOrangeTurn && !isGraduation ? 'active' : ''}`}>
            {(['ok', 'oc'] as PieceType[]).map((piece) => {
              const count = gameState.availablePieces[piece];
              const isAvailable = count > 0 && !gameState.gameOver && !isGraduation && isOrangeTurn;
              const isSelected = selectedPieceType === piece;
              const shouldDisable = isAIThinking || count === 0 || !isOrangeTurn || isGraduation;
              return (
                <button
                  key={piece}
                  className={`piece-button ${isSelected ? 'selected' : ''}`}
                  onClick={() => isAvailable && onSelectPieceType(piece)}
                  disabled={shouldDisable}
                >
                  <span className={`piece-sprite ${PIECE_INFO[piece].spriteClass}`}></span>
                  <span className="piece-count">x {count}</span>
                </button>
              );
            })}
          </div>
          <div className={`piece-group gray ${!isOrangeTurn && !isGraduation ? 'active' : ''}`}>
            {(['gk', 'gc'] as PieceType[]).map((piece) => {
              const count = gameState.availablePieces[piece];
              const isAvailable = count > 0 && !gameState.gameOver && !isGraduation && !isOrangeTurn;
              const isSelected = selectedPieceType === piece;
              const shouldDisable = isAIThinking || count === 0 || isOrangeTurn || isGraduation;
              return (
                <button
                  key={piece}
                  className={`piece-button ${isSelected ? 'selected' : ''}`}
                  onClick={() => isAvailable && onSelectPieceType(piece)}
                  disabled={shouldDisable}
                >
                  <span className={`piece-sprite ${PIECE_INFO[piece].spriteClass}`}></span>
                  <span className="piece-count">x {count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Graduation Choices */}
      {!gameState.gameOver && isGraduation && (
        <div className="graduation-selection">
          <h3>Choose Graduation</h3>
          <div className="graduation-buttons">
            {gameState.graduationChoices.map((choice, index) => {
              const formatted = formatGraduationChoice(choice);
              return (
                <button
                  key={index}
                  className="graduation-button"
                  onClick={() => onSelectGraduation(choice)}
                  onMouseEnter={() => onHoverGraduation(choice)}
                  onMouseLeave={() => onHoverGraduation(null)}
                  disabled={isAIThinking}
                >
                  <span className="graduation-type">{formatted.type}</span>
                  <span className="graduation-coords">{formatted.coordinates}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
