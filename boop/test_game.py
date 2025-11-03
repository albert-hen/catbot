import unittest
from game import (
    GameState,
    PIECE_COUNT,
    STATE_WAITING_FOR_GRADUATION_CHOICE,
)


class TestBoopPieces(unittest.TestCase):
    def setUp(self):
        self.game_state = GameState()

    def test_boop_piece_to_empty_square(self):
        # Place a piece at (2, 2)
        self.game_state.board[2][2] = "ok"
        # Place a piece at (2, 3) to be booped
        self.game_state.board[2][3] = "gk"
        # Boop pieces from (2, 2)
        self.game_state.boop_pieces((2, 2))
        # Check that the piece at (2, 3) moved to (2, 4)
        self.assertEqual(self.game_state.board[2][3], None)
        self.assertEqual(self.game_state.board[2][4], "gk")

    def test_boop_piece_off_board(self):
        # Place a piece at (0, 0)
        self.game_state.board[0][0] = "ok"
        # Place a piece at (0, 1) to be booped
        self.game_state.board[0][1] = "gk"
        # Boop pieces from (0, 0)
        self.game_state.boop_pieces((0, 0))
        # Check that the piece at (0, 1) is removed (booped off the board)
        self.assertEqual(self.game_state.board[0][1], None)

    def test_boop_piece_into_occupied_square(self):
        # Place a piece at (2, 2)
        self.game_state.board[2][2] = "ok"
        # Place a piece at (2, 3) to be booped
        self.game_state.board[2][3] = "gk"
        # Place another piece at (2, 4) to block the boop
        self.game_state.board[2][4] = "oc"
        # Boop pieces from (2, 2)
        self.game_state.boop_pieces((2, 2))
        # Check that the piece at (2, 3) did not move
        self.assertEqual(self.game_state.board[2][3], "gk")
        self.assertEqual(self.game_state.board[2][4], "oc")

    def test_boop_multiple_pieces(self):
        # Place a piece at (2, 2)
        self.game_state.board[2][2] = "ok"
        # Place pieces to be booped
        self.game_state.board[1][2] = "gk"  # Above
        self.game_state.board[3][2] = "gk"  # Below
        self.game_state.board[2][1] = "gk"  # Left
        self.game_state.board[2][3] = "gk"  # Right
        # Boop pieces from (2, 2)
        self.game_state.boop_pieces((2, 2))
        # Check that pieces moved to correct positions
        self.assertEqual(self.game_state.board[1][2], None)
        self.assertEqual(self.game_state.board[0][2], "gk")
        self.assertEqual(self.game_state.board[3][2], None)
        self.assertEqual(self.game_state.board[4][2], "gk")
        self.assertEqual(self.game_state.board[2][1], None)
        self.assertEqual(self.game_state.board[2][0], "gk")
        self.assertEqual(self.game_state.board[2][3], None)
        self.assertEqual(self.game_state.board[2][4], "gk")

    def test_boop_pieces_in_line(self):
        # Place a piece at (2, 2)
        self.game_state.board[2][2] = "ok"
        # Place pieces in a line
        self.game_state.board[2][3] = "gk"
        self.game_state.board[2][4] = "gk"
        # Boop pieces from (2, 2)
        self.game_state.boop_pieces((2, 2))
        # Check that the pieces in the line did not move
        self.assertEqual(self.game_state.board[2][3], "gk")
        self.assertEqual(self.game_state.board[2][4], "gk")

    def test_boop_pieces_in_diagonal(self):
        # Set up the board with four Gray Kittens in an X shape
        self.game_state.board = [
            [None, None, None, None, None, None],
            [None, "gk", None, "gk", None, None],
            [None, None, None, None, None, None],
            [None, "gk", None, "gk", None, None],
            [None, None, None, None, "ok", None],
            [None, None, None, None, None, None],
        ]
        self.game_state.available_pieces["gk"] = PIECE_COUNT - 4
        self.game_state.available_pieces["ok"] = PIECE_COUNT - 1

        # Call place_piece in the middle of the X
        self.game_state.place_piece("ok", (2, 2))
        expected_board = [
            ["gk", None, None, None, "gk", None],
            [None, None, None, None, None, None],
            [None, None, "ok", None, None, None],
            [None, None, None, "gk", None, None],
            ["gk", None, None, None, "ok", None],
            [None, None, None, None, None, None],
        ]
        self.assertEqual(self.game_state.board, expected_board)
        self.assertEqual(self.game_state.available_pieces["ok"], PIECE_COUNT - 2)
        self.assertEqual(self.game_state.available_pieces["gk"], PIECE_COUNT - 4)


class TestBoopGraduation(unittest.TestCase):
    def setUp(self):
        # Initialize the game instance
        self.game = GameState()

    def test_check_for_graduation_horizontal(self):
        # Set up a horizontal line of Orange Kittens
        self.game.board[2][1] = "ok"
        self.game.board[2][2] = "ok"
        self.game.board[2][3] = "ok"

        self.game.available_pieces["ok"] -= 3

        # Place a piece to trigger graduation
        self.game.place_piece("ok", (5, 5))

        # Check if the Kittens are graduated to Cats
        self.assertEqual(self.game.board[2][1], None)
        self.assertEqual(self.game.board[2][2], None)
        self.assertEqual(self.game.board[2][3], None)
        self.assertEqual(self.game.available_pieces["ok"], PIECE_COUNT - 3 - 1)
        self.assertEqual(self.game.available_pieces["oc"], 3)
        self.assertEqual(self.game.graduated_count["oc"], 3)

    def test_check_for_graduation_vertical(self):
        # Set up a vertical line of Gray Kittens
        self.game.board[1][2] = "gk"
        self.game.board[2][2] = "gk"
        self.game.board[3][2] = "gk"

        self.game.available_pieces["gk"] -= 3
        self.game.current_turn = "gray"
        # Place a piece to trigger graduation
        self.game.place_piece("gk", (5, 5))

        # Check if the Kittens are graduated to Cats
        self.assertEqual(self.game.board[1][2], None)
        self.assertEqual(self.game.board[2][2], None)
        self.assertEqual(self.game.board[3][2], None)
        self.assertEqual(self.game.available_pieces["gk"], PIECE_COUNT - 4)
        self.assertEqual(self.game.available_pieces["gc"], 3)
        self.assertEqual(self.game.graduated_count["gc"], 3)

    def test_check_for_graduation_diagonal(self):
        # Set up a diagonal line of Orange Kittens
        self.game.board[1][1] = "ok"
        self.game.board[2][2] = "ok"
        self.game.board[3][3] = "ok"

        self.game.available_pieces["ok"] -= 3

        # Place a piece to trigger graduation
        self.game.place_piece("ok", (5, 5))

        # Check if the Kittens are graduated to Cats
        self.assertEqual(self.game.board[1][1], None)
        self.assertEqual(self.game.board[2][2], None)
        self.assertEqual(self.game.board[3][3], None)
        self.assertEqual(self.game.available_pieces["ok"], PIECE_COUNT - 3 - 1)
        self.assertEqual(self.game.available_pieces["oc"], 3)
        self.assertEqual(self.game.graduated_count["oc"], 3)

    def test_perform_graduation(self):
        # Set up positions for graduation
        positions = [(2, 1), (2, 2), (2, 3)]
        self.game.board[2][1] = "ok"
        self.game.board[2][2] = "ok"
        self.game.board[2][3] = "ok"

        self.game.available_pieces["ok"] -= 3

        # Call perform_graduation
        self.game.perform_graduation(positions)

        # Check if the Kittens are graduated to Cats
        self.assertEqual(self.game.board[2][1], None)
        self.assertEqual(self.game.board[2][2], None)
        self.assertEqual(self.game.board[2][3], None)
        self.assertEqual(self.game.available_pieces["ok"], PIECE_COUNT - 3)
        self.assertEqual(self.game.available_pieces["oc"], 3)
        self.assertEqual(self.game.graduated_count["oc"], 3)

    def test_graduation_mixed_cats_and_kittens(self):
        # Set up a line with a mix of Cats and Kittens
        self.game.board[2][1] = "ok"
        self.game.board[2][2] = "oc"
        self.game.board[2][3] = "ok"

        self.game.available_pieces["ok"] -= 3
        self.game.graduated_count["oc"] = 1

        # Place a piece to trigger graduation
        self.game.place_piece("ok", (5, 5))

        # Check if the Kittens are graduated to Cats
        self.assertEqual(self.game.board[2][1], None)
        self.assertEqual(self.game.board[2][2], None)
        self.assertEqual(self.game.board[2][3], None)
        self.assertEqual(self.game.available_pieces["ok"], PIECE_COUNT - 3 - 1)
        self.assertEqual(self.game.available_pieces["oc"], 3)
        self.assertEqual(self.game.graduated_count["oc"], 3)

    def test_graduation_mixed_cats_and_kittens_diagonal(self):
        # Set up a diagonal line with a mix of Cats and Kittens
        self.game.board[1][1] = "gk"
        self.game.board[2][2] = "gc"
        self.game.board[3][3] = "gk"

        self.game.available_pieces["gk"] -= 3
        self.game.graduated_count["gc"] = 1
        self.game.current_turn = "gray"
        # Place a piece to trigger graduation
        self.game.place_piece("gk", (5, 5))
        # Check if the Kittens are graduated to Cats
        self.assertEqual(self.game.board[1][1], None)
        self.assertEqual(self.game.board[2][2], None)
        self.assertEqual(self.game.board[3][3], None)
        self.assertEqual(self.game.available_pieces["gk"], PIECE_COUNT - 4)
        self.assertEqual(self.game.available_pieces["gc"], 3)
        self.assertEqual(self.game.graduated_count["gc"], 3)

    def test_no_graduation_for_mixed_colors(self):
        # Set up a line with three Cats of different colors
        self.game.board[2][1] = "oc"
        self.game.board[2][2] = "gc"
        self.game.board[2][3] = "oc"

        # Place a piece to trigger graduation
        self.game.place_piece("ok", (5, 5))

        # Check that no graduation occurred
        self.assertEqual(self.game.board[2][1], "oc")
        self.assertEqual(self.game.board[2][2], "gc")
        self.assertEqual(self.game.board[2][3], "oc")
        self.assertEqual(self.game.graduated_count["oc"], 0)
        self.assertEqual(self.game.graduated_count["gc"], 0)


class TestBoopWin(unittest.TestCase):
    def setUp(self):
        # Initialize the game instance
        self.game = GameState()

    def test_check_for_win_three_cats_in_a_row(self):
        # Set up a line with three Cats in a row
        self.game.board[2][1] = "oc"
        self.game.board[2][2] = "oc"
        self.game.board[2][3] = "oc"

        # Call check_for_win
        self.game.check_for_win()

        # Check if the game is over and the winner is Orange
        self.assertTrue(self.game.game_over)
        self.assertEqual(self.game.winner, "orange")

    def test_check_for_win_all_cats_on_bed(self):
        # Set up the board with all 8 Cats for Orange
        self.game.board[0][0] = "oc"
        self.game.board[0][1] = "oc"
        self.game.board[0][2] = "oc"
        self.game.board[0][3] = "oc"
        self.game.board[0][4] = "oc"
        self.game.board[0][5] = "oc"
        self.game.board[1][0] = "oc"
        self.game.board[1][1] = "oc"

        # Call check_for_win
        self.game.check_for_win()

        # Check if the game is over and the winner is Orange
        self.assertTrue(self.game.game_over)
        self.assertEqual(self.game.winner, "orange")

    def test_check_for_win_no_winner(self):
        # Set up the board with no winning condition
        self.game.board[2][1] = "ok"
        self.game.board[2][2] = "ok"
        self.game.board[2][3] = "ok"

        # Call check_for_win
        self.game.check_for_win()

        # Check if the game is not over and there is no winner
        self.assertFalse(self.game.game_over)
        self.assertIsNone(self.game.winner)


class TestGameState(unittest.TestCase):
    def setUp(self):
        self.game_state = GameState()

    def test_valid_moves_at_start(self):
        # Expected valid moves at the start of the game (all positions on a 6x6 board)
        expected_valid_moves = [(row, col) for row in range(6) for col in range(6)]

        # Check that placeable_squares contains all positions on the board
        self.assertEqual(
            sorted(self.game_state.placeable_squares), sorted(expected_valid_moves)
        )


class TestGraduationChoices(unittest.TestCase):
    def setUp(self):
        self.game = GameState()

    def test_choose_graduation_orange_kitten(self):
        # Set up the board two graduation options
        self.game.board = [
            [None, None, "ok", None, None, None],
            [None, None, "ok", None, None, None],
            ["ok", "ok", None, None, None, None],
            [None, None, None, None, None, None],
            [None, None, None, None, None, None],
            [None, None, None, None, None, None],
        ]
        self.game.available_pieces["ok"] = PIECE_COUNT - 4
        # Call choose_graduation
        self.game.place_piece("ok", (2, 2))

        self.assertEqual(self.game.state_mode, STATE_WAITING_FOR_GRADUATION_CHOICE)
        expected_grad_choices = [((0, 2), (1, 2), (2, 2)), ((2, 0), (2, 1), (2, 2))]
        self.assertEqual(self.game.graduation_choices, expected_grad_choices)

    def test_choose_graduation_orange_kitten_more(self):
        """
        Test the graduation choices for Orange Kitten when there are 8 kittens on the
        board and several three-in-a-row options.
        """
        # Set up the board two graduation options
        self.game.board = [
            [None, None, "ok", None, None, None],
            [None, None, "ok", None, None, None],
            ["ok", "ok", None, "ok", "ok", None],
            [None, None, "ok", None, None, None],
            [None, None, "gk", None, None, None],
            [None, None, None, None, None, None],
        ]
        self.game.available_pieces["ok"] = PIECE_COUNT - 7
        self.game.available_pieces["gk"] = PIECE_COUNT - 1

        # Call choose_graduation
        self.game.place_piece("ok", (2, 2))

        self.assertEqual(self.game.state_mode, STATE_WAITING_FOR_GRADUATION_CHOICE)
        expected_grad_choices = [
            ((0, 2),),
            ((1, 2),),
            ((2, 0),),
            ((2, 1),),
            ((2, 2),),
            ((2, 3),),
            ((2, 4),),
            ((3, 2),),
            ((0, 2), (1, 2), (2, 2)),
            ((1, 2), (2, 2), (3, 2)),
            ((2, 0), (2, 1), (2, 2)),
            ((2, 1), (2, 2), (2, 3)),
            ((2, 2), (2, 3), (2, 4)),
        ]
        self.assertEqual(self.game.graduation_choices, expected_grad_choices)

    def test_two_graduation_choices(self):
        # Set up the board with two possible graduation choices for Orange

        self.game.board = [
            [None, None, None, None, None, None],
            [None, None, None, None, None, None],
            [None, "ok", "ok", "ok", None, None],
            [None, "ok", "ok", "ok", None, None],
            [None, None, None, None, None, None],
            [None, None, None, None, None, None],
        ]

        self.game.available_pieces["ok"] -= 6

        # Call place_piece to trigger graduation check
        self.game.place_piece("ok", (5, 5))

        # Check if the game is waiting for graduation choice
        self.assertEqual(self.game.state_mode, STATE_WAITING_FOR_GRADUATION_CHOICE)

        # Check if the graduation choices are correct
        expected_choices = [((2, 1), (2, 2), (2, 3)), ((3, 1), (3, 2), (3, 3))]
        self.assertEqual(self.game.graduation_choices, expected_choices)

    def test_a_bunch_of_graduation_choices(self):
        # Set up the board with two possible graduation choices for Orange

        self.game.board = [
            ["ok", None, None, None, None, None],
            [None, "ok", None, "ok", None, None],
            [None, None, "ok", None, None, None],
            [None, "ok", "ok", "ok", None, None],
            [None, None, None, None, None, None],
            [None, None, None, "ok", None, None],
        ]

        self.game.available_pieces["ok"] -= 8

        self.game.calculate_graduation_choices()

        # Check if the graduation choices are correct
        self.assertEqual(
            self.game.graduation_choices,
            [
                ((0, 0),),
                ((1, 1),),
                ((1, 3),),
                ((2, 2),),
                ((3, 1),),
                ((3, 2),),
                ((3, 3),),
                ((5, 3),),
                ((0, 0), (1, 1), (2, 2)),
                ((1, 1), (2, 2), (3, 3)),
                ((1, 3), (2, 2), (3, 1)),
                ((3, 1), (3, 2), (3, 3)),
            ],
        )


if __name__ == "__main__":
    unittest.main()
