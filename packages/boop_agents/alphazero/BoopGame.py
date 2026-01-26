from __future__ import print_function

from packages.boop_core.game import GameState, STATE_WAITING_FOR_GRADUATION_CHOICE, STATE_WAITING_FOR_PLACEMENT, BOARD_SIZE
import numpy as np
from enum import Enum

class NNChannel(Enum):
    """
    Neural network input/output channel mapping.
    Total channels: 9
    
    Channel 0: Game state mode (0 = placement, 1 = graduation)
    Channels 1-4: Piece positions
    Channels 5-8: Available piece counts
    """
    # Game state
    STATE_MODE = 0  # 0 = waiting for placement, 1 = waiting for graduation
    
    # Piece positions on board
    P1_KITTEN = 1  # Orange kitten positions
    P2_KITTEN = 2  # Gray kitten positions
    P1_CAT = 3     # Orange cat positions
    P2_CAT = 4     # Gray cat positions
    
    # Available piece counts (stored in [channel, 0, 0])
    P1_KITTEN_COUNT = 5  # Number of orange kittens available
    P2_KITTEN_COUNT = 6  # Number of gray kittens available
    P1_CAT_COUNT = 7     # Number of orange cats available
    P2_CAT_COUNT = 8     # Number of gray cats available

class MoveType(Enum):
    PLACE_KITTEN = 0
    PLACE_CAT = 1
    SINGLE_GRADUATION = 2
    HORIZONTAL_TRIPLE_GRADUATION = 3
    VERTICAL_TRIPLE_GRADUATION = 4
    DIAGONAL_TRIPLE_GRADUATION_UP = 5
    DIAGONAL_TRIPLE_GRADUATION_DOWN = 6

class Game:
    """
    This class specifies the base Game class. To define your own game, subclass
    this class and implement the functions below. This works when the game is
    two-player, adversarial and turn-based.

    Use one-hot encoding for each piece type and count of pieces for each player.

    See othello/OthelloGame.py for an example implementation.
    """

    def __init__(self):
        self.board_input_channels = 9
        self.N = BOARD_SIZE

    def getInitBoard(self):
        """
        Returns:
            startBoard: a representation of the board (ideally this is the form
                        that will be the input to your neural network)
        """
        board = np.zeros((9, 6, 6), dtype=int)
        board[5] = 8
        board[6] = 8
        return board

    def getBoardSize(self):
        """
        Returns:
            (x,y): a tuple of board dimensions
        """
        return (6, 6)

    def getActionSize(self):
        """
        Boop action space:
        6x6    placement of kitten
        6x6    placement of cat
        6x6    single graduation options
        6x4    horizontal triple graduation
        4x6    vertical triple graduation
        4x4x2  diagonal triple graduation

        Returns:
            actionSize: number of all possible actions
        """
        return 6 * 6 * 2 + 6 * 6 + 6 * 4 + 4 * 6 + 4 * 4 * 2

    def getNextState(self, board, player, action):
        """
        Input:
            board: current board
            player: current player (1 or -1)
            action: action taken by current player

        Returns:
            nextBoard: board after applying action
            nextPlayer: player who plays in the next turn (should be -player if turn has switched other wise same player)
        """
        # Action is an index of the action space
        # Translate the action index to a move
        # Apply the move to the board
        # If the resulting state is a graduation choice, return tensor state with same player
        # If the resulting state is a placement choice, return tensor state with -player
        game_state = self.tensor_to_game_state(board, player)

        move_location, move_type = self.action_to_move(action)
        if move_type in [MoveType.PLACE_KITTEN, MoveType.PLACE_CAT]:
            # Determine piece type based on player
            if move_type == MoveType.PLACE_KITTEN:
                piece = "ok" if player == 1 else "gk"
            else:  # MoveType.PLACE_CAT
                piece = "oc" if player == 1 else "gc"

            game_state.place_piece(piece, move_location)
        else:
            # graduation choice
            row, col = move_location
            row, col = int(row), int(col)
            if move_type == MoveType.SINGLE_GRADUATION:
                game_state.choose_graduation(((row, col),))
            elif move_type == MoveType.HORIZONTAL_TRIPLE_GRADUATION:
                game_state.choose_graduation(((row, col-1), (row, col), (row, col+1)))
            elif move_type == MoveType.VERTICAL_TRIPLE_GRADUATION:
                game_state.choose_graduation(((row-1, col), (row, col), (row+1, col)))
            elif move_type == MoveType.DIAGONAL_TRIPLE_GRADUATION_UP:
                game_state.choose_graduation(((row-1, col+1), (row, col), (row+1, col-1)))
            elif move_type == MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN:
                game_state.choose_graduation(((row-1, col-1), (row, col), (row+1, col+1)))

        if game_state.state_mode == STATE_WAITING_FOR_GRADUATION_CHOICE:
            return (self.game_state_to_tensor(game_state), player)
        else:
            return (self.game_state_to_tensor(game_state), -player)

    def action_to_move(self, action):
        """
        Converts an action index into a move tuple.

        Input:
            action: index of action within action space

        Returns:
            move: tuple of move information

        Example:
        0 -> ((0,0), MoveType.PLACE_KITTEN)
        ...
        35 -> ((5,5), MoveType.PLACE_KITTEN)

        36 -> ((0,0), MoveType.PLACE_CAT)
        ...
        71 -> ((5,5), MoveType.PLACE_CAT)

        187 -> ((4,4), MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN)

               ACTION TYPE                      RANGE
        6x6    place kitten                     0    -   35        
        6x6    place cat                        36   -   71
        6x6    single graduation options        72   -   107
        6x4    horizontal triple graduation     108  -   131
        4x6    vertical triple graduation       132  -   155
        4x4    / diagonal triple graduation     156  -   171
        4x4    \ diagonal triple graduation     172  -   187
        """
        
        action_space = [6*6, 6*6, 6*6, 6*4, 4*6, 4*4, 4*4]
        # [ 36  72 108 132 156 172 188]
        action_space_cumsum = np.cumsum(action_space)

        if action < action_space_cumsum[0]:
            return ((action // 6, action % 6), MoveType.PLACE_KITTEN)
        elif action < action_space_cumsum[1]:
            action -= action_space_cumsum[0]
            return ((action // 6, action % 6), MoveType.PLACE_CAT)
        elif action < action_space_cumsum[2]:
            action -= action_space_cumsum[1]
            return ((action // 6, action % 6), MoveType.SINGLE_GRADUATION)
        elif action < action_space_cumsum[3]:
            action -= action_space_cumsum[2]
            return ((int(action // 4), int(1+(action % 4))), MoveType.HORIZONTAL_TRIPLE_GRADUATION)
        elif action < action_space_cumsum[4]:
            action -= action_space_cumsum[3]
            return ((int(1+(action // 6)), int(action % 6)), MoveType.VERTICAL_TRIPLE_GRADUATION)
        elif action < action_space_cumsum[5]:
            action -= action_space_cumsum[4]
            return ((int(1+(action // 4)), int(1+(action % 4))), MoveType.DIAGONAL_TRIPLE_GRADUATION_UP)
        else:
            action -= action_space_cumsum[5]
            return ((int(1+(action // 4)), int(1+(action % 4))), MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN)


    def tensor_to_game_state(self, board, player):
        st = GameState()
        for r in range(6):
            for c in range(6):
                if board[1, r, c] == 1:
                    st.board[r][c] = "ok"
                elif board[2, r, c] == 1:
                    st.board[r][c] = "gk"
                elif board[3, r, c] == 1:
                    st.board[r][c] = "oc"
                elif board[4, r, c] == 1:
                    st.board[r][c] = "gc"
        st.available_pieces["ok"] = int(board[5, 0, 0])
        st.available_pieces["gk"] = int(board[6, 0, 0])
        st.available_pieces["oc"] = int(board[7, 0, 0])
        st.available_pieces["gc"] = int(board[8, 0, 0])

        # set current turn
        st.current_turn = "orange" if player == 1 else "gray"
        # set game state mode
        if board[0, 0, 0] == 0:
            st.update_valid_moves()
            st.state_mode = STATE_WAITING_FOR_PLACEMENT
        else:
            st.calculate_graduation_choices()
            st.state_mode = STATE_WAITING_FOR_GRADUATION_CHOICE

        return st
    
    def game_state_to_tensor(self, gamestate: GameState):
        board = np.zeros((9, 6, 6), dtype=int)
        for r in range(6):
            for c in range(6):
                if gamestate.board[r][c] == "ok":
                    board[1, r, c] = 1
                elif gamestate.board[r][c] == "gk":
                    board[2, r, c] = 1
                elif gamestate.board[r][c] == "oc":
                    board[3, r, c] = 1
                elif gamestate.board[r][c] == "gc":
                    board[4, r, c] = 1
        board[5] = gamestate.available_pieces["ok"]
        board[6] = gamestate.available_pieces["gk"]
        board[7] = gamestate.available_pieces["oc"]
        board[8] = gamestate.available_pieces["gc"]
        if gamestate.state_mode == STATE_WAITING_FOR_PLACEMENT:
            board[0] = 0
        else:
            board[0] = 1
        return board

    def getValidMoves(self, board, player):
        """
        Input:
            board: current board
            player: current player (1 or -1)

        Returns:
            validMoves: a binary vector of length self.getActionSize(), 1 for
                        moves that are valid from the current board and player,
                        0 for invalid moves
        """
        game_state = self.tensor_to_game_state(board, player)
        valid_moves = [0] * self.getActionSize()

        # If waiting for graduation choice, only graduation moves are valid
        if game_state.state_mode == STATE_WAITING_FOR_GRADUATION_CHOICE:
            # Convert graduation choices to valid move indices
            # don't need to call get_graduation_choices because we already have them from __tensor_to_game_state
            for grad_choice in game_state.graduation_choices:
                if len(grad_choice) == 1:
                    # Single graduation
                    row, col = grad_choice[0]
                    action = 72 + row * 6 + col  # After placement actions (72 = 6*6*2)
                    valid_moves[action] = 1
                elif len(grad_choice) == 3:
                    # Triple graduation
                    row, col = grad_choice[1]  # Center piece
                    # Check orientation
                    if grad_choice[0][0] == grad_choice[1][0]:  # Same row = horizontal
                        if col > 0 and col < 5:
                            action = 108 + row * 4 + (col-1)  # After single graduations
                            valid_moves[action] = 1
                    elif grad_choice[0][1] == grad_choice[1][1]:  # Same column = vertical
                        if row > 0 and row < 5:
                            action = 132 + (row-1)*6+col  # After horizontal graduations
                            valid_moves[action] = 1
                    else:  # Diagonal
                        if row > 0 and row < 5 and col > 0 and col < 5:
                            sorted_triple = sorted(list(grad_choice))
                            if sorted_triple[0][1] > sorted_triple[1][1]:  # Up diagonal
                                action = 156 + (row-1) * 4 + (col-1)  # After vertical graduations
                                valid_moves[action] = 1
                            else:  # Down diagonal
                                action = 172 + (row-1) * 4 + (col-1)  # After up diagonals
                                valid_moves[action] = 1

        # If waiting for placement, only placement moves are valid
        else:
            game_state.update_valid_moves()
            # Convert placeable squares and pieces to valid move indices
            for row, col in game_state.placeable_squares:
                for piece in game_state.placeable_pieces:
                    if piece.endswith('k'):
                        action = row * 6 + col  # Kitten placement
                        valid_moves[action] = 1
                    else:  # piece.endswith('c')
                        action = 36 + row * 6 + col  # Cat placement (after kitten placements)
                        valid_moves[action] = 1

        return np.array(valid_moves)

    def getGameEnded(self, board, player):
        """
        Input:
            board: current board
            player: current player (1 or -1)

        Returns:
            r: 0 if game has not ended. 1 if player won, -1 if player lost,
               small non-zero value for draw.
        """
        def check_three_in_a_row_cats(board, player):
            # player 1 cat channel is board[2], player 2 cat channel is board[4]
            cat_channel = 3 if player == 1 else 4
            for r in range(6):
                for c in range(6):
                    # check horizontal triple
                    if c <= 3 and board[cat_channel, r, c] == 1 \
                       and board[cat_channel, r, c+1] == 1 \
                       and board[cat_channel, r, c+2] == 1:
                        return True
                    # check vertical triple
                    if r <= 3 and board[cat_channel, r, c] == 1 \
                       and board[cat_channel, r+1, c] == 1 \
                       and board[cat_channel, r+2, c] == 1:
                        return True
                    # check down-right diagonal triple
                    if r <= 3 and c <= 3 and board[cat_channel, r, c] == 1 \
                       and board[cat_channel, r+1, c+1] == 1 \
                       and board[cat_channel, r+2, c+2] == 1:
                        return True
                    # check down-left diagonal triple
                    if r <= 3 and c >= 2 and board[cat_channel, r, c] == 1 \
                       and board[cat_channel, r+1, c-1] == 1 \
                       and board[cat_channel, r+2, c-2] == 1:
                        return True
            return False

        def check_eight_cats(board, player):
            # player 1 cat channel is board[2], player 2 cat channel is board[4]
            cat_channel = 3 if player == 1 else 4
            return np.sum(board[cat_channel]) == 8

        def player_wins(board, player):
            return check_three_in_a_row_cats(board, player) or check_eight_cats(board, player)

        if player_wins(board, player):
            return 1
        elif player_wins(board, -player):
            return -1
        return 0

    def getCanonicalForm(self, board, player):
        """
        Input:
            board: current board
            player: current player (1 or -1)

        Returns:
            canonicalBoard: returns canonical form of board. The canonical form
                            should be independent of player. For e.g. in chess,
                            the canonical form can be chosen to be from the pov
                            of white. When the player is white, we can return
                            board as is. When the player is black, we can invert
                            the colors and return the board.
        """
        if player == 1:
            return board
        canonicalBoard = board.copy()
        for i in range(1, 8, 2):
            canonicalBoard[i] = board[i + 1]
            canonicalBoard[i + 1] = board[i]
        return canonicalBoard

    def getSymmetries(self, board, pi):
        """
        Input:
            board: current board (9x6x6)
            pi: policy vector of size self.getActionSize()

        Returns:
            symmForms: list of [(board,pi)] where each tuple is a symmetrical form
        """
        # Split pi into different move types for easier transformation
        pi = np.array(pi)
        pi_kitten_place = pi[:36].reshape(6, 6)          # First 36 moves are kitten placements
        pi_cat_place = pi[36:72].reshape(6, 6)           # Next 36 are cat placements
        pi_single_grad = pi[72:108].reshape(6, 6)        # Single graduations
        pi_horiz_grad = pi[108:132].reshape(6, 4)        # Horizontal triple graduations
        pi_vert_grad = pi[132:156].reshape(4, 6)         # Vertical triple graduations
        pi_diag_up_grad = pi[156:172].reshape(4, 4)      # Diagonal up triple graduations
        pi_diag_down_grad = pi[172:188].reshape(4, 4)    # Diagonal down triple graduations

        symmForms = []
        
        # For each transformation (rot0, rot90, rot180, rot270, flipH, flipV, diagFlip, antiDiagFlip)
        for i in range(8):
            rot = i % 4
            flip = i // 4
            
            # Transform the board layers
            newBoard = np.copy(board)
            for c in range(1, 5):  # Only transform piece channels
                if flip:
                    newBoard[c] = np.fliplr(board[c])
                newBoard[c] = np.rot90(newBoard[c], k=rot)
                
            # Transform the policy components
            new_pi_kitten = np.copy(pi_kitten_place)
            new_pi_cat = np.copy(pi_cat_place)
            new_pi_single = np.copy(pi_single_grad)
            new_pi_horiz = np.copy(pi_horiz_grad)
            new_pi_vert = np.copy(pi_vert_grad)
            new_pi_diag_up = np.copy(pi_diag_up_grad)
            new_pi_diag_down = np.copy(pi_diag_down_grad)
            
            if flip:
                new_pi_kitten = np.fliplr(new_pi_kitten)
                new_pi_cat = np.fliplr(new_pi_cat)
                new_pi_single = np.fliplr(new_pi_single)
                new_pi_horiz = np.fliplr(new_pi_horiz)
                new_pi_vert = np.fliplr(new_pi_vert)
                new_pi_diag_up = np.fliplr(new_pi_diag_up)
                new_pi_diag_down = np.fliplr(new_pi_diag_down)
                # Swap diagonal types when flipping
                new_pi_diag_up, new_pi_diag_down = new_pi_diag_down, new_pi_diag_up
                
            # Apply rotation
            new_pi_kitten = np.rot90(new_pi_kitten, k=rot)
            new_pi_cat = np.rot90(new_pi_cat, k=rot)
            new_pi_single = np.rot90(new_pi_single, k=rot)
            
            # For odd rotations (90, 270), swap horizontal and vertical graduations
            if rot % 2 == 1:
                new_pi_horiz, new_pi_vert = np.rot90(new_pi_vert, k=rot), np.rot90(new_pi_horiz, k=rot)
                # Also swap diagonal types for odd rotations
                new_pi_diag_up, new_pi_diag_down = np.rot90(new_pi_diag_down, k=rot), np.rot90(new_pi_diag_up, k=rot)
            else:
                new_pi_horiz = np.rot90(new_pi_horiz, k=rot)
                new_pi_vert = np.rot90(new_pi_vert, k=rot)
                new_pi_diag_up = np.rot90(new_pi_diag_up, k=rot)
                new_pi_diag_down = np.rot90(new_pi_diag_down, k=rot)
                
            # Reconstruct the policy vector
            newPi = np.concatenate([
                new_pi_kitten.flatten(),
                new_pi_cat.flatten(),
                new_pi_single.flatten(),
                new_pi_horiz.flatten(),
                new_pi_vert.flatten(),
                new_pi_diag_up.flatten(),
                new_pi_diag_down.flatten()
            ])
            
            symmForms.append((newBoard, newPi))
        
        return symmForms

    def stringRepresentation(self, board):
        """
        Input:
            board: current board

        Returns:
            boardString: a quick conversion of board to a string format.
                         Required by MCTS for hashing.
        """
        c0 = board[0, 0, 0] # decision type
        c5 = board[5, 0, 0] # p1 kitten count
        c6 = board[6, 0, 0] # p2 kitten count
        c7 = board[7, 0, 0] # p1 cat count
        c8 = board[8, 0, 0] # p2 cat count
        rest = []
        for i in [1, 2, 3, 4]:
            rest.extend(board[i].flatten())
        return f"{c0},{c5},{c6},{c7},{c8}" + ",".join(str(x) for x in rest)
