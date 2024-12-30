# boop/game.py

import numpy as np
import logging

PIECE_COUNT = 8
STATE_WAITING_FOR_PLACEMENT = "waiting_for_placement"
STATE_WAITING_FOR_GRADUATION_CHOICE = "waiting_for_graduation_choice"
BOARD_SIZE = 6


class GameState:
    """
    The only two methods that update the game state are place_piece and choose_graduation.
    """

    def __init__(self):
        # Initialize the game board, a 6x6 grid with all None objects
        self.board = np.full((BOARD_SIZE, BOARD_SIZE), None, dtype=object)

        # Track whose turn it is ('orange' or 'gray')
        self.current_turn = "orange"

        # Track the pool of available pieces for each player
        # 'ok' = Orange Kitten, 'gk' = Gray Kitten, 'oc' = Orange Cat, 'gc' = Gray Cat
        self.available_pieces = {
            "ok": PIECE_COUNT,
            "oc": 0,
            "gk": PIECE_COUNT,
            "gc": 0,
        }

        self.graduated_count = {
            "oc": 0,
            "gc": 0,
        }

        # Game status flags
        self.game_over = False
        self.winner = None

        self.state_mode = STATE_WAITING_FOR_PLACEMENT

        # calculated everytime the state mode becomes waiting_for_placement
        # treat as a cache of valid moves, can always be derived from the state
        self.placeable_pieces = []
        self.placeable_squares = []
        # calculated every time the state mode becomes waiting_for_graduation_choice
        self.graduation_choices = []

        self.update_valid_moves()

        logging.debug("Game initialized: %s", self)

    def __repr__(self) -> str:
        # Create a string representation of the game state
        state = ""

        # Add the board state
        state += "Board:\n"
        for row in self.board:
            for cell in row:
                if cell == "ok":
                    state += "ok "
                elif cell == "gk":
                    state += "gk "
                elif cell == "oc":
                    state += "oc "
                elif cell == "gc":
                    state += "gc "
                else:
                    state += "-- "
            state += "\n"

        # Add the current turn
        state += f"Current Turn: {self.current_turn}\n"

        # Add the available pieces
        state += "Available Pieces:\n"
        for piece, count in self.available_pieces.items():
            state += f"{piece}: {count}\n"
        state += "state_mode: " + self.state_mode + "\n"
        return state

    def place_piece(self, piece_type, position):
        """
        Places a piece on the board at the specified position. Handles the logic until
        the next required input (graduation choice of current player, or input for the
        next player after switch turn).

        Parameters:
            piece_type (str): The type of piece to place ('ok', 'gk', 'oc', 'gc').
            position (tuple): The (row, column) position on the board to place the piece.

        Raises:
            ValueError: If the game is already over, if the piece placement is invalid,
            or if there are no avialable pieces left of that type.

        Description:
            - Places the specified piece on the board if the position is valid and the piece is available.
            - Decreases the count of the placed piece in the available pieces pool.
            - Boops adjacent pieces according to the game rules.
            - Checks for win conditions and updates the game state if a win is detected.
            - Checks for the graduation of Kittens to Cats and performs the graduation if applicable.
            - Switches the turn to the other player.
            - Handles any special cases or rules.
        """
        if self.game_over:
            raise ValueError("Game is already over.")

        if self.board[position[0]][position[1]] is not None:
            raise ValueError("Board postion is already occupied.")

        if self.state_mode == STATE_WAITING_FOR_GRADUATION_CHOICE:
            raise ValueError(
                f"Game is waiting for graduation choice from {self.current_turn}."
            )

        if self.available_pieces[piece_type] == 0:
            raise ValueError("No more pieces of this type available.")

        self.board[position[0]][position[1]] = piece_type
        self.available_pieces[piece_type] -= 1
        logging.debug("Placed piece %s at position %s", piece_type, position)

        # Check for adjacent pieces to boop
        self.boop_pieces(position)

        # Check for win condition
        self.check_for_win()

        # Check for graduation of Kittens to Cats
        graduation_choices = [
            (pos,) for pos in self.get_grad_options_eight()
        ] + self.get_grad_options_three()

        if len(graduation_choices) == 1:
            # only one graduation choice, perform it, switch turn
            self.perform_graduation(graduation_choices[0])
            self.switch_turn()
        elif len(graduation_choices) > 1:
            # update game state to waiting for graduation choice, no switch turn
            self.graduation_choices = graduation_choices
            self._clear_valid_moves()
            logging.debug("Waiting for graduation choice from %s.", self.current_turn)
            self.state_mode = STATE_WAITING_FOR_GRADUATION_CHOICE
        else:
            # no graduation choices, switch turn
            self.switch_turn()

    def _clear_valid_moves(self):
        """
        Clears the valid moves and available squares attributes.
        """
        self.placeable_squares = []
        self.placeable_pieces = []

    def choose_graduation(self, choice):
        """
        Chooses the graduation option from the list of available graduation choices.
        Choices are either 3-tuples of positions of pieces in a line or a single tuple of a position.
        Checks if choices is within the available choices and performs the graduation.

        Parameters:
            choice (tuple): The positions of the pieces to be graduated.

        Raises:
            ValueError: If the game is not in the waiting for graduation choice state.
            Or if the choice is not within the available graduation choices.

        """
        if self.state_mode != STATE_WAITING_FOR_GRADUATION_CHOICE:
            raise ValueError("Game is not waiting for graduation choice.")

        if choice not in self.graduation_choices:
            raise ValueError("Invalid graduation choice.")

        self.perform_graduation(choice)
        self.switch_turn()

    def boop_pieces(self, position):
        """
        Boops all the pieces adjacent to the given position.

        Parameters:
            position (tuple): The position of the placed piece.

        Description:
            - When a piece is added to the board, it “boops” all of the pieces
                adjacent to it, pushing them one space away, including
                diagonally.
            - A piece can be booped off the bed, returning it to the owner’s
                pool of pieces.
            - A booped piece does not cause a chain reaction when it moves into
                a new space.
            - When any two pieces are already in a line, another piece played
                into that line cannot push those pieces. However, they can still
                be booped from other directions.
            - Cats cannot be booped by Kittens but can boop other Cats and
                Kittens.

        Parameters:
            position (tuple): The position of the placed piece.
        """
        # Get the current piece type
        current_piece = str(self.board[position[0]][position[1]])

        # Define the directions to check for adjacent pieces
        directions = [
            (0, 1),
            (0, -1),
            (1, 0),
            (-1, 0),
            (1, 1),
            (1, -1),
            (-1, 1),
            (-1, -1),
        ]

        # Iterate over the directions
        for direction in directions:
            # Get the adjacent position
            adjacent_position = (position[0] + direction[0], position[1] + direction[1])

            # Check if the adjacent position is within the board boundaries
            if 0 <= adjacent_position[0] < len(self.board) and 0 <= adjacent_position[
                1
            ] < len(self.board[0]):
                # Get the adjacent piece type
                adjacent_piece = self.board[adjacent_position[0]][adjacent_position[1]]
                # Check if the adjacent piece is not None
                if adjacent_piece is not None:
                    # Check if the current piece can boop the adjacent piece
                    if current_piece.endswith("c") or (
                        current_piece.endswith("k") and adjacent_piece.endswith("k")
                    ):
                        # Calculate the new position for the adjacent piece
                        new_position = (
                            adjacent_position[0] + direction[0],
                            adjacent_position[1] + direction[1],
                        )
                        # Check if the new position is within the board boundaries
                        if 0 <= new_position[0] < len(self.board) and 0 <= new_position[
                            1
                        ] < len(self.board[0]):
                            # Check if the new position is empty
                            if self.board[new_position[0]][new_position[1]] is None:
                                # Move the adjacent piece to the new position
                                self.board[new_position[0]][
                                    new_position[1]
                                ] = adjacent_piece
                                self.board[adjacent_position[0]][
                                    adjacent_position[1]
                                ] = None
                                logging.debug(
                                    "Booped piece %s from %s to %s",
                                    adjacent_piece,
                                    adjacent_position,
                                    new_position,
                                )

                        else:
                            # Boop the adjacent piece off the board
                            self.board[adjacent_position[0]][
                                adjacent_position[1]
                            ] = None
                            self.available_pieces[adjacent_piece] += 1
                            logging.debug(
                                "Booped piece %s off the board from %s",
                                adjacent_piece,
                                adjacent_position,
                            )

    def get_grad_options_eight(self):
        """
        Checks if all the pieces of the current player are on the bed. If so, return all
        positions of pieces as choices for graduation.
        """
        current_positions = []

        for row in range(len(self.board)):
            for col in range(len(self.board[0])):
                if self.current_turn == "orange" and self.board[row][col] in [
                    "ok",
                    "oc",
                ]:
                    current_positions.append((row, col))
                elif self.current_turn == "gray" and self.board[row][col] in [
                    "gk",
                    "gc",
                ]:
                    current_positions.append((row, col))

        if len(current_positions) == PIECE_COUNT:
            logging.debug(
                "All %s pieces are on the bed: %s", self.current_turn, current_positions
            )
            return list(tuple(current_positions))

        return []

    def get_grad_options_three(self):
        """
        Checks if any pieces can be graduated that are in a three in a row. Returns a
        list of tuples of positions of pieces that can be graduated.
        """
        graduation_choices = set()
        # Define the directions to check for lines (horizontal, vertical, diagonal)
        directions = [
            (0, 1),  # Horizontal
            (1, 0),  # Vertical
            (1, 1),  # Diagonal down-right
            (1, -1),  # Diagonal down-left
        ]

        # Helper function to determine the color of a piece
        def get_piece_color(piece):
            if piece in ["ok", "oc"]:
                return "orange"
            elif piece in ["gk", "gc"]:
                return "gray"
            return None

        # Iterate over the board
        for row in range(len(self.board)):
            for col in range(len(self.board[0])):
                # Check if the cell contains a piece
                if self.board[row][col] in ["ok", "gk", "oc", "gc"]:
                    current_piece = self.board[row][col]
                    current_color = get_piece_color(current_piece)
                    # Check for lines in all directions
                    for direction in directions:
                        positions = [(row, col)]
                        for i in range(1, 3):
                            new_row = row + direction[0] * i
                            new_col = col + direction[1] * i
                            # Check if the new position is within the board boundaries
                            if 0 <= new_row < len(self.board) and 0 <= new_col < len(
                                self.board[0]
                            ):
                                new_piece = self.board[new_row][new_col]
                                # Check if the new position contains a piece of the same color
                                if get_piece_color(new_piece) == current_color:
                                    positions.append((new_row, new_col))
                                else:
                                    break
                            else:
                                break
                        # If a line of three pieces of the same color is found, perform graduation
                        if len(positions) == 3:
                            logging.debug(
                                "Graduation detected at positions: %s", positions
                            )
                            graduation_choices.add(tuple(positions))
        return list(graduation_choices)

    def update_valid_moves(self):
        """
        Updates available squares and pieces based on the color of the current turn.
        """
        self.placeable_squares = []
        for row in range(len(self.board)):
            for col in range(len(self.board[0])):
                if self.board[row][col] is None:
                    self.placeable_squares.append((row, col))

        if self.current_turn == "orange":
            self.placeable_pieces = [
                p for p in ["ok", "oc"] if self.available_pieces[p] > 0
            ]
        else:
            self.placeable_pieces = [
                p for p in ["gk", "gc"] if self.available_pieces[p] > 0
            ]

    def perform_graduation(self, positions):
        """
        Performs the graduation of Kittens to Cats.

        Parameters:
            positions (list of tuples): The positions of the pieces to be graduated.
        """
        for row, col in positions:
            piece = self.board[row][col]
            if piece in ["ok", "gk"]:
                # if pieces are kittens, then they graduate to cats
                cat = "oc" if piece == "ok" else "gc"
                # Remove the Kitten from the board
                self.board[row][col] = None
                # Add the Cat to the player's pool
                self.available_pieces[cat] += 1
                self.graduated_count[cat] += 1
                logging.debug(
                    "Graduated piece %s to %s at position %s", piece, cat, (row, col)
                )

            else:
                # Remove the Cat from the board
                self.board[row][col] = None
                # Add the Cat back to the player's pool
                self.available_pieces[piece] += 1
                logging.debug("Removed Cat %s from position %s", piece, (row, col))

    def check_for_win(self):
        """
        Checks if a player has won the game.
        """
        # Check for the first win condition: lining up three Cats in a row
        directions = [
            (0, 1),  # Horizontal
            (1, 0),  # Vertical
            (1, 1),  # Diagonal down-right
            (1, -1),  # Diagonal down-left
        ]

        for row in range(len(self.board)):
            for col in range(len(self.board[0])):
                if self.board[row][col] in ["oc", "gc"]:
                    current_piece = self.board[row][col]
                    for direction in directions:
                        positions = [(row, col)]
                        for i in range(1, 3):
                            new_row = row + direction[0] * i
                            new_col = col + direction[1] * i
                            if 0 <= new_row < len(self.board) and 0 <= new_col < len(
                                self.board[0]
                            ):
                                if self.board[new_row][new_col] == current_piece:
                                    positions.append((new_row, new_col))
                                else:
                                    break
                            else:
                                break
                        if len(positions) == 3:
                            self.game_over = True
                            self.winner = "orange" if current_piece == "oc" else "gray"
                            logging.info("Game over! Winner: %s", self.winner)
                            return

        # Check for the second win condition: having all 8 Cats on the bed
        orange_cats_on_bed = np.count_nonzero(self.board == "oc")
        gray_cats_on_bed = np.count_nonzero(self.board == "gc")

        if orange_cats_on_bed == 8:
            self.game_over = True
            self.winner = "orange"
            logging.info("Game over! Winner: %s", self.winner)
        elif gray_cats_on_bed == 8:
            self.game_over = True
            self.winner = "gray"
            logging.info("Game over! Winner: %s", self.winner)

    def switch_turn(self):
        """
        Switches the turn between players. Toggles `current_turn` between "gray" and
        "orange". Updates valid moves and sets the state mode to waiting for placement.
        """
        self.state_mode = STATE_WAITING_FOR_PLACEMENT
        self.update_valid_moves()
        self.current_turn = "gray" if self.current_turn == "orange" else "orange"
        logging.debug("Switched turn to: %s", self.current_turn)
