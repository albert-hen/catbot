# python -m unittest boop/tests/test_boop_game.py
import unittest
import numpy as np
import sys
from pathlib import Path

# Add the parent directory to the Python path
sys.path.append(str(Path(__file__).parent.parent.parent))

from boop.BoopGame import Game, MoveType, NNChannel

class TestBoopGame(unittest.TestCase):
    def setUp(self):
        self.game = Game()
        self.initial_board = self.game.getInitBoard()

    def test_init_board(self):
        """Test initial board setup"""
        self.assertEqual(self.initial_board.shape, (9, 6, 6))
        # Check initial piece counts (8 kittens each)
        self.assertEqual(self.initial_board[5, 0, 0], 8)  # p1 kittens
        self.assertEqual(self.initial_board[6, 0, 0], 8)  # p2 kittens
        self.assertEqual(self.initial_board[7, 0, 0], 0)  # p1 cats
        self.assertEqual(self.initial_board[8, 0, 0], 0)  # p2 cats

    def test_board_size(self):
        """Test board dimensions"""
        self.assertEqual(self.game.getBoardSize(), (6, 6))

    def test_action_size(self):
        """Test action space size"""
        expected_size = (
            6 * 6 * 2 +  # placement options (kittens and cats)
            6 * 6 +      # single graduations
            6 * 4 +      # horizontal triple graduations
            4 * 6 +      # vertical triple graduations
            4 * 4 * 2    # diagonal triple graduations (up and down)
        )
        self.assertEqual(self.game.getActionSize(), expected_size)

    def test_action_to_move_conversion(self):
        """Test conversion from action index to move type and location"""
        test_cases = [
            (0, ((0, 0), MoveType.PLACE_KITTEN)),
            (35, ((5, 5), MoveType.PLACE_KITTEN)),
            (36, ((0, 0), MoveType.PLACE_CAT)),
            (71, ((5, 5), MoveType.PLACE_CAT)),
            (72, ((0, 0), MoveType.SINGLE_GRADUATION)),
            (108, ((0, 1), MoveType.HORIZONTAL_TRIPLE_GRADUATION)),
            (132, ((1, 0), MoveType.VERTICAL_TRIPLE_GRADUATION)),
            (156, ((1, 1), MoveType.DIAGONAL_TRIPLE_GRADUATION_UP)),
            (172, ((1, 1), MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN)),
        ]
        
        for action, expected in test_cases:
            result = self.game._Game__action_to_move(action)
            self.assertEqual(result, expected, f"Failed for action {action}")

    def test_valid_moves_initial_state(self):
        """Test valid moves in initial state"""
        valid_moves = self.game.getValidMoves(self.initial_board, 1)
        
        # In initial state, only placements should be valid
        placement_moves = valid_moves[:72]  # First 72 moves are placements
        graduation_moves = valid_moves[72:]  # Rest are graduations
        
        self.assertTrue(np.any(placement_moves == 1))  # Some placement moves should be valid
        self.assertTrue(np.all(graduation_moves == 0))  # No graduation moves should be valid

    def test_game_ended_conditions(self):
        """Test game ending conditions"""
        # Test empty board (no winner)
        self.assertEqual(self.game.getGameEnded(self.initial_board, 1), 0)

        # Test three cats in a row for player 1
        winning_board = np.zeros((9, 6, 6))
        winning_board[3, 0, 0:3] = 1  # Three cats in a row for player 1
        self.assertEqual(self.game.getGameEnded(winning_board, 1), 1)
        self.assertEqual(self.game.getGameEnded(winning_board, -1), -1)

        # Test eight cats on board for player 1
        eight_cats_board = np.zeros((9, 6, 6))
        # Place 8 cats for player 1 in a scattered pattern
        eight_cats_board[3, 0, 0] = 1
        eight_cats_board[3, 0, 2] = 1
        eight_cats_board[3, 1, 1] = 1
        eight_cats_board[3, 2, 2] = 1
        eight_cats_board[3, 3, 3] = 1
        eight_cats_board[3, 4, 1] = 1
        eight_cats_board[3, 4, 4] = 1
        eight_cats_board[3, 5, 5] = 1
        self.assertEqual(self.game.getGameEnded(eight_cats_board, 1), 1)
        self.assertEqual(self.game.getGameEnded(eight_cats_board, -1), -1)

    def test_canonical_form(self):
        """Test canonical form conversion"""
        # Create a test board with some pieces
        test_board = np.zeros((9, 6, 6))
        # Set piece positions
        test_board[1, 0, 0] = 1  # p1 kitten at (0,0)
        test_board[3, 1, 1] = 1  # p1 cat at (1,1)
        test_board[2, 2, 2] = 1  # p2 kitten at (2,2)
        test_board[4, 3, 3] = 1  # p2 cat at (3,3)
        # Set piece counts (max 8 pieces total including those on board)
        # Each player has 1 kitten + 1 cat on board, so 6 kittens remaining
        test_board[5].fill(6)  # p1 remaining kittens
        test_board[6].fill(6)  # p2 remaining kittens
        test_board[7].fill(0)  # p1 remaining cats (0 since the only cat is on board)
        test_board[8].fill(0)  # p2 remaining cats (0 since the only cat is on board)

        # Get canonical form for player 1 (should be unchanged)
        canon_p1 = self.game.getCanonicalForm(test_board, 1)
        np.testing.assert_array_equal(canon_p1, test_board)

        # Get canonical form for player -1 (should swap p1/p2 pieces and counts)
        canon_p2 = self.game.getCanonicalForm(test_board, -1)
        # Check piece positions are swapped
        self.assertEqual(canon_p2[1, 0, 0], test_board[2, 0, 0])  # p1/p2 kitten positions
        self.assertEqual(canon_p2[2, 2, 2], test_board[1, 2, 2])
        self.assertEqual(canon_p2[3, 1, 1], test_board[4, 1, 1])  # p1/p2 cat positions
        self.assertEqual(canon_p2[4, 3, 3], test_board[3, 3, 3])
        # Check counts are swapped
        self.assertEqual(canon_p2[5, 0, 0], test_board[6, 0, 0])  # p1/p2 kitten counts
        self.assertEqual(canon_p2[6, 0, 0], test_board[5, 0, 0])
        self.assertEqual(canon_p2[7, 0, 0], test_board[8, 0, 0])  # p1/p2 cat counts
        self.assertEqual(canon_p2[8, 0, 0], test_board[7, 0, 0])

    def test_string_representation(self):
        """Test board string representation"""
        board_str = self.game.stringRepresentation(self.initial_board)
        self.assertIsInstance(board_str, str)
        # Should contain initial piece counts
        self.assertIn("8", board_str)

class TestBoopGameSymmetries(unittest.TestCase):
    def setUp(self):
        self.game = Game()
        self.start_board = self.game.getInitBoard()
    def test_single_graduation_symmetry(self):
        # 8 kittens on the board
        board = self.start_board
        board[NNChannel.P1_KITTEN_COUNT.value] = 0
        board[NNChannel.STATE_MODE.value] = 1
        kitten_positions = ((0,0), (0,4), (1,1), (2,5), (3,3), (4,1), (5,2), (5,5))
        kitten_coords = (
            NNChannel.P1_KITTEN.value,  # channel
            [x for x,_ in kitten_positions],   # rows
            [y for _,y in kitten_positions]    # cols
        )
        board[kitten_coords] = 1
        board[NNChannel.P2_KITTEN_COUNT.value] = 8
        board[NNChannel.P1_CAT_COUNT.value] = 0
        board[NNChannel.P2_CAT_COUNT.value] = 0

        pi = np.zeros(188)

        # set pi for single grad channel
        def sym_pi_pos_grad_single(row, col):
            return 72 + row*6 + col
        pi_spots = [sym_pi_pos_grad_single(row, col) for row, col in kitten_positions]
        pi[pi_spots] = 1

        #calculate symmetries
        syms = self.game.getSymmetries(board, pi)

        # check sym1: rot 90*1 flip 0
        sym1_board, sym1_pi = syms[1]
        expected_sym1_board = np.rot90(board[NNChannel.P1_KITTEN.value], 1)
        expected_sym1_locations = list(zip(*np.where(expected_sym1_board == 1)))
        sym1_pi_spots = [sym_pi_pos_grad_single(row, col) for row, col in expected_sym1_locations]
        expected_sym1_pi = np.zeros(188)
        expected_sym1_pi[sym1_pi_spots] = 1
        self.assertTrue(np.array_equal(expected_sym1_pi, sym1_pi))
        self.assertTrue(np.array_equal(expected_sym1_board, sym1_board[NNChannel.P1_KITTEN.value]))

        # check sym2: rot 90*2 flip 0
        sym2_board, sym2_pi = syms[2]
        expected_sym2_board = np.rot90(board[NNChannel.P1_KITTEN.value], 2)
        expected_sym2_locations = list(zip(*np.where(expected_sym2_board == 1)))
        sym2_pi_spots = [sym_pi_pos_grad_single(row, col) for row, col in expected_sym2_locations]
        expected_sym2_pi = np.zeros(188)
        expected_sym2_pi[sym2_pi_spots] = 1
        self.assertTrue(np.array_equal(expected_sym2_pi, sym2_pi))
        self.assertTrue(np.array_equal(expected_sym2_board, sym2_board[NNChannel.P1_KITTEN.value]))

        # check sym3: rot 90*3 flip 0
        sym3_board, sym3_pi = syms[3]
        expected_sym3_board = np.rot90(board[NNChannel.P1_KITTEN.value], 3)
        expected_sym3_locations = list(zip(*np.where(expected_sym3_board == 1)))
        sym3_pi_spots = [sym_pi_pos_grad_single(row, col) for row, col in expected_sym3_locations]
        expected_sym3_pi = np.zeros(188)
        expected_sym3_pi[sym3_pi_spots] = 1
        self.assertTrue(np.array_equal(expected_sym3_pi, sym3_pi))
        self.assertTrue(np.array_equal(expected_sym3_board, sym3_board[NNChannel.P1_KITTEN.value]))

        # check sym4: flip 1
        sym4_board, sym4_pi = syms[4]
        expected_sym4_board = np.fliplr(board[NNChannel.P1_KITTEN.value])
        expected_sym4_locations = list(zip(*np.where(expected_sym4_board == 1)))
        sym4_pi_spots = [sym_pi_pos_grad_single(row, col) for row, col in expected_sym4_locations]
        expected_sym4_pi = np.zeros(188)
        expected_sym4_pi[sym4_pi_spots] = 1
        self.assertTrue(np.array_equal(expected_sym4_pi, sym4_pi))
        self.assertTrue(np.array_equal(expected_sym4_board, sym4_board[NNChannel.P1_KITTEN.value]))

        # check sym5: flip 1 then rot 90*1 
        sym5_board, sym5_pi = syms[5]
        expected_sym5_board = np.fliplr(board[NNChannel.P1_KITTEN.value])
        expected_sym5_board = np.rot90(expected_sym5_board, 1)
        expected_sym5_locations = list(zip(*np.where(expected_sym5_board == 1)))
        sym5_pi_spots = [sym_pi_pos_grad_single(row, col) for row, col in expected_sym5_locations]
        expected_sym5_pi = np.zeros(188)
        expected_sym5_pi[sym5_pi_spots] = 1
        self.assertTrue(np.array_equal(expected_sym5_pi, sym5_pi))
        self.assertTrue(np.array_equal(expected_sym5_board, sym5_board[NNChannel.P1_KITTEN.value]))

        # check sym6: flip 1 then rot 90*2 
        sym6_board, sym6_pi = syms[6]
        expected_sym6_board = np.fliplr(board[NNChannel.P1_KITTEN.value])
        expected_sym6_board = np.rot90(expected_sym6_board, 2)
        expected_sym6_locations = list(zip(*np.where(expected_sym6_board == 1)))
        sym6_pi_spots = [sym_pi_pos_grad_single(row, col) for row, col in expected_sym6_locations]
        expected_sym6_pi = np.zeros(188)
        expected_sym6_pi[sym6_pi_spots] = 1
        self.assertTrue(np.array_equal(expected_sym6_pi, sym6_pi))
        self.assertTrue(np.array_equal(expected_sym6_board, sym6_board[NNChannel.P1_KITTEN.value]))

        # check sym7: flip 1 then rot 90*3 
        sym7_board, sym7_pi = syms[7]
        expected_sym7_board = np.fliplr(board[NNChannel.P1_KITTEN.value])
        expected_sym7_board = np.rot90(expected_sym7_board, 3)
        expected_sym7_locations = list(zip(*np.where(expected_sym7_board == 1)))
        sym7_pi_spots = [sym_pi_pos_grad_single(row, col) for row, col in expected_sym7_locations]
        expected_sym7_pi = np.zeros(188)
        expected_sym7_pi[sym7_pi_spots] = 1
        self.assertTrue(np.array_equal(expected_sym7_pi, sym7_pi))
        self.assertTrue(np.array_equal(expected_sym7_board, sym7_board[NNChannel.P1_KITTEN.value]))

    def test_horizontal_triple_graduation_symmetry(self):
        board = self.start_board
        # one kitten and two cats on the board for p1
        piece_positions = ((NNChannel.P1_KITTEN.value, 0,0), (NNChannel.P1_CAT.value, 0,1), (NNChannel.P1_CAT.value, 0,2))
        board[[chan for chan,_,_ in piece_positions], [row for _,row,_ in piece_positions], [col for _,_,col in piece_positions]] = 1
        board[NNChannel.P1_KITTEN_COUNT.value] = 5
        board[NNChannel.STATE_MODE.value] = 1

        pi = np.zeros(188)
        # 108 is the first horizontal triple graduation move in pi
        pi[108] = 1

        #calculate symmetries
        syms = self.game.getSymmetries(board, pi)
        
        # check sym1: rot 90*1
        expected_sym1_board_kitten = np.rot90(board[NNChannel.P1_KITTEN.value], 1)
        expected_sym1_board_cat = np.rot90(board[NNChannel.P1_CAT.value], 1)
        expected_sym1_pi = np.zeros(188)
        # horizontal triple graduation at (0,0) rotates into a vertical triple graduation at (3,0) within their corresponding action space for the action type
        expected_sym1_pi[132+ 3*6+0] = 1
        self.assertTrue(np.array_equal(expected_sym1_pi, syms[1][1]))
        self.assertTrue(np.array_equal(expected_sym1_board_kitten, syms[1][0][NNChannel.P1_KITTEN.value]))
        self.assertTrue(np.array_equal(expected_sym1_board_cat, syms[1][0][NNChannel.P1_CAT.value]))

        # check sym2: rot 90*2
        expected_sym2_board_kitten = np.rot90(board[NNChannel.P1_KITTEN.value], 2)
        expected_sym2_board_cat = np.rot90(board[NNChannel.P1_CAT.value], 2)
        expected_sym2_pi = np.zeros(188)
        # horizontal triple graduation at (0,0) rotates to (5,3) and stays a horizontal triple graduation
        expected_sym2_pi[108+ 5*4+3] = 1
        self.assertTrue(np.array_equal(expected_sym2_pi, syms[2][1]))
        self.assertTrue(np.array_equal(expected_sym2_board_kitten, syms[2][0][NNChannel.P1_KITTEN.value]))
        self.assertTrue(np.array_equal(expected_sym2_board_cat, syms[2][0][NNChannel.P1_CAT.value]))

        # check sym3: rot 90*3
        expected_sym3_board_kitten = np.rot90(board[NNChannel.P1_KITTEN.value], 3)
        expected_sym3_board_cat = np.rot90(board[NNChannel.P1_CAT.value], 3)
        expected_sym3_pi = np.zeros(188)
        # horizontal triple graduation at (0,0) in the horizontal grad space rotates to (0,5) in to the vertical grad space
        expected_sym3_pi[132 + 0*6 + 5] = 1
        self.assertTrue(np.array_equal(expected_sym3_pi, syms[3][1]))
        self.assertTrue(np.array_equal(expected_sym3_board_kitten, syms[3][0][NNChannel.P1_KITTEN.value]))
        self.assertTrue(np.array_equal(expected_sym3_board_cat, syms[3][0][NNChannel.P1_CAT.value]))

        # check sym4: flip 1
        expected_sym4_board_kitten = np.fliplr(board[NNChannel.P1_KITTEN.value])
        expected_sym4_board_cat = np.fliplr(board[NNChannel.P1_CAT.value])
        expected_sym4_pi = np.zeros(188)
        # horizontal triple graduation at (0,0) in the horizontal grad space flips to (0,3) in the same action space
        expected_sym4_pi[108+0*0+3] = 1
        self.assertTrue(np.array_equal(expected_sym4_pi, syms[4][1]))
        self.assertTrue(np.array_equal(expected_sym4_board_kitten, syms[4][0][NNChannel.P1_KITTEN.value]))
        self.assertTrue(np.array_equal(expected_sym4_board_cat, syms[4][0][NNChannel.P1_CAT.value]))

        # check sym5: flip 1 rot 90
        expected_sym5_board_kitten = np.fliplr(board[NNChannel.P1_KITTEN.value])
        expected_sym5_board_kitten = np.rot90(expected_sym5_board_kitten, 1)
        expected_sym5_board_cat = np.fliplr(board[NNChannel.P1_CAT.value])
        expected_sym5_board_cat = np.rot90(expected_sym5_board_cat, 1)
        expected_sym5_pi = np.zeros(188)
        # horizontal triple graduation at (0,0) in the horizontal grad space flips+rotate90 to (0,0) in the vertical action space
        expected_sym5_pi[132 + 0*6 + 0] = 1
        self.assertTrue(np.array_equal(expected_sym5_pi, syms[5][1]))
        self.assertTrue(np.array_equal(expected_sym5_board_kitten, syms[5][0][NNChannel.P1_KITTEN.value]))
        self.assertTrue(np.array_equal(expected_sym5_board_cat, syms[5][0][NNChannel.P1_CAT.value]))

        # check sym6: flip 1 rot 180
        expected_sym6_board_kitten = np.fliplr(board[NNChannel.P1_KITTEN.value])
        expected_sym6_board_kitten = np.rot90(expected_sym6_board_kitten, 2)
        expected_sym6_board_cat = np.fliplr(board[NNChannel.P1_CAT.value])
        expected_sym6_board_cat = np.rot90(expected_sym6_board_cat, 2)
        expected_sym6_pi = np.zeros(188)
        # horizontal triple graduation at (0,0) in the horizontal grad space flips+rotate180 to (5,0) in the same action type space
        expected_sym6_pi[108 + 5*4+0] = 1
        self.assertTrue(np.array_equal(expected_sym6_pi, syms[6][1]))
        self.assertTrue(np.array_equal(expected_sym6_board_kitten, syms[6][0][NNChannel.P1_KITTEN.value]))
        self.assertTrue(np.array_equal(expected_sym6_board_cat, syms[6][0][NNChannel.P1_CAT.value]))
        return
    
if __name__ == '__main__':
    unittest.main() 
