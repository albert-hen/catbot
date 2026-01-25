/**
 * Boop Game - Board Component
 */

import type { 
  Position, 
  GraduationChoice,
} from '../game';
import { 
  GameState, 
  BOARD_SIZE,
} from '../game';
import './Board.css';

interface BoardProps {
  gameState: GameState;
  onCellClick: (position: Position) => void;
  highlightedCells?: Position[];
  graduationHighlight?: GraduationChoice | null;
}

const PIECE_INFO: Record<string, { className: string; label: string }> = {
  ok: { className: 'piece-img orange-kitten', label: 'Orange Kitten' },
  gk: { className: 'piece-img gray-kitten', label: 'Gray Kitten' },
  oc: { className: 'piece-img orange-cat', label: 'Orange Cat' },
  gc: { className: 'piece-img gray-cat', label: 'Gray Cat' },
};

export const Board: React.FC<BoardProps> = ({
  gameState,
  onCellClick,
  highlightedCells = [],
  graduationHighlight = null,
}) => {
  const isHighlighted = (row: number, col: number): boolean => {
    return highlightedCells.some(([r, c]) => r === row && c === col);
  };

  const isGraduationHighlighted = (row: number, col: number): boolean => {
    if (!graduationHighlight) return false;
    return graduationHighlight.some(([r, c]) => r === row && c === col);
  };

  const isPlaceable = (row: number, col: number): boolean => {
    if (gameState.stateMode !== 'waiting_for_placement') return false;
    return gameState.placeableSquares.some(([r, c]) => r === row && c === col);
  };

  const renderCell = (row: number, col: number) => {
    const piece = gameState.board[row][col];
    const highlighted = isHighlighted(row, col);
    const gradHighlighted = isGraduationHighlighted(row, col);
    const placeable = isPlaceable(row, col);
    
    const classNames = [
      'board-cell',
      piece ? `has-piece piece-cell-${piece}` : 'empty',
      highlighted ? 'highlighted' : '',
      gradHighlighted ? 'graduation-highlight' : '',
      placeable ? 'placeable' : '',
    ].filter(Boolean).join(' ');

    return (
      <div
        key={`${row}-${col}`}
        className={classNames}
        onClick={() => onCellClick([row, col])}
        role="button"
        tabIndex={0}
        aria-label={
          piece 
            ? `${PIECE_INFO[piece].label} at row ${row + 1}, column ${col + 1}` 
            : `Empty cell at row ${row + 1}, column ${col + 1}`
        }
      >
        {piece && (
          <div className={PIECE_INFO[piece].className} aria-label={PIECE_INFO[piece].label} />
        )}
      </div>
    );
  };

  return (
    <div className="board-container">
      <div className="board" role="grid" aria-label="Boop game board">
        {Array.from({ length: BOARD_SIZE }, (_, row) => (
          <div key={row} className="board-row" role="row">
            {Array.from({ length: BOARD_SIZE }, (_, col) => renderCell(row, col))}
          </div>
        ))}
      </div>
    </div>
  );
};
