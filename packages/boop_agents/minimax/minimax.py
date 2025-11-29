import copy
from packages.boop_core.game import GameState, STATE_WAITING_FOR_PLACEMENT, STATE_WAITING_FOR_GRADUATION_CHOICE

def minimax_agent(game_state, max_depth=3):
    """
    Minimax agent function that takes a game state and returns the best move.

    Args:
        game_state: Current GameState object
        max_depth: Maximum search depth for minimax algorithm

    Returns:
        tuple: (move_type, move_data) representing the best move, or None if no moves available
    """
    return _get_best_move(game_state, max_depth)

def _evaluate_state(game_state, max_player_color):
    """
    Evaluate the game state for the current player.
    Positive scores favor the current player, negative scores favor the opponent.
    """

    if game_state.game_over:
        if game_state.winner == max_player_color:
            return 100000
        else:
            # if winner is not max player, then min player won
            return -100000

    score = 0

    # Cat advantage (cats are more valuable)
    orange_cats = game_state.available_pieces["oc"] + \
                 sum(1 for row in game_state.board for cell in row if cell == "oc")
    gray_cats = game_state.available_pieces["gc"] + \
               sum(1 for row in game_state.board for cell in row if cell == "gc")

    if max_player_color == "orange":
        score += (orange_cats - gray_cats) * 200
    else:
        score += (gray_cats - orange_cats) * 200

    # Center control (center squares are more valuable)
    center_squares = [(2, 2), (2, 3), (3, 2), (3, 3)]
    for row, col in center_squares:
        piece = game_state.board[row][col]
        if piece:
            if max_player_color == "orange" and piece in ["ok", "oc"]:
                score += 50
            elif max_player_color == "gray" and piece in ["gk", "gc"]:
                score += 50
            elif max_player_color == "orange" and piece in ["gk", "gc"]:
                score -= 50
            elif max_player_color == "gray" and piece in ["ok", "oc"]:
                score -= 50
    # Ring control (squares around center are valuable too)
    ring_squares = [
        (1, 1), (1, 2), (1, 3), (1, 4),
        (2, 1), (2, 4),
        (3, 1), (3, 4), 
        (4, 1), (4, 2), (4, 3), (4, 4)
    ]
    for row, col in ring_squares:
        piece = game_state.board[row][col]
        if piece:
            if max_player_color == "orange" and piece in ["ok", "oc"]:
                score += 20  # Less valuable than center
            elif max_player_color == "gray" and piece in ["gk", "gc"]:
                score += 20
            elif max_player_color == "orange" and piece in ["gk", "gc"]:
                score -= 20
            elif max_player_color == "gray" and piece in ["ok", "oc"]:
                score -= 20
    return score

def _get_possible_moves(game_state):
    """
    Generate all possible moves from the current game state.
    Returns a list of (move_type, move_data) tuples.
    """
    moves = []

    if game_state.state_mode == STATE_WAITING_FOR_PLACEMENT:
        # Generate placement moves
        for piece_type in game_state.placeable_pieces:
            for position in game_state.placeable_squares:
                moves.append(("place", (piece_type, position)))

    elif game_state.state_mode == STATE_WAITING_FOR_GRADUATION_CHOICE:
        # Generate graduation moves
        for choice in game_state.graduation_choices:
            moves.append(("graduate", choice))
    return moves

def _make_move(game_state, move):
    """
    Apply a move to a copy of the game state and return the new state.
    """
    new_state = copy.deepcopy(game_state)

    move_type, move_data = move

    if move_type == "place":
        piece_type, position = move_data
        new_state.place_piece(piece_type, position)
    elif move_type == "graduate":
        new_state.choose_graduation(move_data)

    return new_state

def _minimax(game_state, depth, max_player_color):
    """
    Minimax algorithm with alpha-beta pruning.
    """
    if depth == 0 or game_state.game_over:
        return _evaluate_state(game_state, max_player_color), None

    if max_player_color == game_state.current_turn:
        max_eval = float('-inf')
        best_move = None
        for move in _get_possible_moves(game_state):
            new_state = _make_move(game_state, move)
            eval_score, _ = _minimax(new_state, depth - 1, max_player_color)
            if eval_score > max_eval:
                max_eval = eval_score
                best_move = move
        return max_eval, best_move
    else:
        min_eval = float('inf')
        best_move = None
        for move in _get_possible_moves(game_state):
            new_state = _make_move(game_state, move)
            eval_score, _ = _minimax(new_state, depth - 1, max_player_color)
            if eval_score < min_eval:
                min_eval = eval_score
                best_move = move
        return min_eval, best_move

def _get_best_move(game_state, max_depth):
    """
    Get the best move for the current player using minimax.
    """
    max_player_color = game_state.current_turn
    score, best_move = _minimax(game_state, max_depth, max_player_color)
    print("best", score, best_move)
    return best_move
