/**
 * Boop Game - Board Component
 */

import { useMemo } from 'react';
import type { 
  Position, 
  GraduationChoice,
  MoveEffects,
  BoopEffect,
} from '../game';
import { 
  GameState, 
  BOARD_SIZE,
  ANIMATION_DURATION_MS,
} from '../game';
import type { LastMoveHighlights } from '../hooks';
import type { GamePhase } from '../hooks/useBoopGame';
import './Board.css';

interface BoardProps {
  gameState: GameState;
  onCellClick: (position: Position) => void;
  highlightedCells?: Position[];
  graduationHighlight?: GraduationChoice | null;
  lastMoveHighlights?: LastMoveHighlights;
  moveEffects?: MoveEffects | null;
  animationEnabled?: boolean;
  isAnimating?: boolean;
  gamePhase?: GamePhase;
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
  lastMoveHighlights,
  moveEffects,
  animationEnabled = true,
  isAnimating = false,
  gamePhase = 'playing',
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
  
  // Check if this cell is the last placement
  const isLastPlacement = (row: number, col: number): boolean => {
    if (!lastMoveHighlights?.placedAt) return false;
    const [r, c] = lastMoveHighlights.placedAt;
    return r === row && c === col;
  };
  
  // Check if this cell was part of a graduation
  const isGraduatedCell = (row: number, col: number): boolean => {
    if (!lastMoveHighlights?.graduatedPositions) return false;
    return lastMoveHighlights.graduatedPositions.some(([r, c]) => r === row && c === col);
  };
  
  // Build a map of animations: destination position -> boop effect
  const boopAnimations = useMemo(() => {
    const map = new Map<string, BoopEffect>();
    if (animationEnabled && isAnimating && moveEffects?.boops) {
      for (const boop of moveEffects.boops) {
        if (boop.to) {
          map.set(`${boop.to[0]}-${boop.to[1]}`, boop);
        }
      }
    }
    return map;
  }, [animationEnabled, isAnimating, moveEffects]);
  
  // Get animation style for a piece that was booped to this position
  const getBoopAnimationStyle = (row: number, col: number): React.CSSProperties | undefined => {
    const key = `${row}-${col}`;
    const boop = boopAnimations.get(key);
    if (!boop || !boop.to) return undefined;
    
    // Calculate offset from source to destination
    const deltaRow = boop.from[0] - boop.to[0];
    const deltaCol = boop.from[1] - boop.to[1];
    
    // Cell is approximately 102px wide, 98px tall
    const offsetX = deltaCol * 104; // 102 + 2 gap
    const offsetY = deltaRow * 100; // 98 + 2 gap
    
    return {
      '--boop-start-x': `${offsetX}px`,
      '--boop-start-y': `${offsetY}px`,
      animationDuration: `${ANIMATION_DURATION_MS}ms`,
    } as React.CSSProperties;
  };

  const renderCell = (row: number, col: number) => {
    const piece = gameState.board[row][col];
    const highlighted = isHighlighted(row, col);
    const gradHighlighted = isGraduationHighlighted(row, col);
    const placeable = isPlaceable(row, col);
    const lastPlacement = isLastPlacement(row, col);
    const graduated = isGraduatedCell(row, col);
    const hasBoopAnimation = boopAnimations.has(`${row}-${col}`);
    
    const classNames = [
      'board-cell',
      piece ? `has-piece piece-cell-${piece}` : 'empty',
      highlighted ? 'highlighted' : '',
      gradHighlighted ? 'graduation-highlight' : '',
      placeable ? 'placeable' : '',
      lastPlacement ? 'last-placement' : '',
      graduated ? 'graduated-cell' : '',
    ].filter(Boolean).join(' ');
    
    const pieceClassNames = [
      PIECE_INFO[piece!]?.className ?? '',
      hasBoopAnimation ? 'piece-animating' : '',
    ].filter(Boolean).join(' ');
    
    const animationStyle = getBoopAnimationStyle(row, col);

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
          <div 
            className={pieceClassNames} 
            aria-label={PIECE_INFO[piece].label}
            style={animationStyle}
          />
        )}
      </div>
    );
  };
  
  // Render arrow trails for boops (visible until next move)
  const renderBoopArrows = () => {
    if (!animationEnabled || !moveEffects?.boops.length) {
      return null;
    }
    
    // Cell dimensions (including gap)
    const cellWidth = 104; // 102 + 2 gap
    const cellHeight = 100; // 98 + 2 gap
    const cellCenterOffsetX = 51; // half of 102
    const cellCenterOffsetY = 49; // half of 98
    
    return (
      <svg className="boop-arrows-overlay" aria-hidden="true">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#2196F3" />
          </marker>
        </defs>
        {moveEffects.boops.map((boop, index) => {
          const fromX = boop.from[1] * cellWidth + cellCenterOffsetX;
          const fromY = boop.from[0] * cellHeight + cellCenterOffsetY;
          
          if (boop.to) {
            // Arrow to destination
            const toX = boop.to[1] * cellWidth + cellCenterOffsetX;
            const toY = boop.to[0] * cellHeight + cellCenterOffsetY;
            
            return (
              <line
                key={index}
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                className="boop-arrow"
                markerEnd="url(#arrowhead)"
              />
            );
          } else {
            // Piece pushed off board - draw arrow pointing outward
            // Calculate direction from placement to this piece
            const placedRow = moveEffects.placedAt[0];
            const placedCol = moveEffects.placedAt[1];
            const dirRow = boop.from[0] - placedRow;
            const dirCol = boop.from[1] - placedCol;
            
            // Extend arrow beyond the piece
            const toX = fromX + dirCol * 60;
            const toY = fromY + dirRow * 60;
            
            return (
              <g key={index}>
                <line
                  x1={fromX}
                  y1={fromY}
                  x2={toX}
                  y2={toY}
                  className="boop-arrow boop-arrow-off-board"
                  markerEnd="url(#arrowhead)"
                />
                {/* X mark for off-board */}
                <text x={toX} y={toY + 5} className="boop-off-board-mark">✕</text>
              </g>
            );
          }
        })}
      </svg>
    );
  };

  return (
    <div className={`board-container ${gamePhase === 'setup' ? 'setup-phase' : ''}`}>
      <div className="board" role="grid" aria-label="Boop game board">
        {Array.from({ length: BOARD_SIZE }, (_, row) => (
          <div key={row} className="board-row" role="row">
            {Array.from({ length: BOARD_SIZE }, (_, col) => renderCell(row, col))}
          </div>
        ))}
      </div>
      {renderBoopArrows()}
      {gamePhase === 'setup' && (
        <div className="setup-overlay">
          <span className="setup-overlay-text">Click Start Game</span>
        </div>
      )}
    </div>
  );
};
