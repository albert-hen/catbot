"""
AlphaZero agent wrapper for playing against AlphaZero-trained models.

This module provides a function that wraps the AlphaZero neural network and MCTS
to work with the pygame UI, similar to how minimax_agent works.
"""

import sys
import os
import numpy as np
from packages.boop_agents.alphazero.BoopGame import Game
from packages.boop_agents.alphazero.NNet import NNetWrapper
from packages.boop_agents.alphazero.MCTS import MCTS
from packages.boop_agents.alphazero.utils import dotdict


class AlphaZeroAgent:
    """
    Wrapper class for an AlphaZero agent that can be used in the pygame UI.
    """

    def __init__(self, checkpoint_folder, checkpoint_filename, num_mcts_sims=256):
        """
        Initialize the AlphaZero agent with a trained checkpoint.

        Args:
            checkpoint_folder: Path to folder containing checkpoint
            checkpoint_filename: Name of checkpoint file (e.g., 'best.pth.tar')
            num_mcts_sims: Number of MCTS simulations to run per move
        """
        self.game = Game()
        self.nnet = NNetWrapper(self.game)

        # Load the checkpoint
        try:
            self.nnet.load_checkpoint(checkpoint_folder, checkpoint_filename)
            print(f"Loaded AlphaZero checkpoint from {checkpoint_folder}/{checkpoint_filename}")
        except Exception as e:
            raise RuntimeError(f"Failed to load checkpoint: {e}")

        # Set up MCTS arguments
        self.mcts_args = dotdict({
            'numMCTSSims': num_mcts_sims,
            'cpuct': 1.0,
        })

        self.mcts = None  # Will be initialized per game

    def get_move(self, game_state_tensor, player):
        """
        Get the best move for the current board state using MCTS + neural network.

        Args:
            game_state_tensor: Board state as numpy array (from BoopGame.tensor format)
            player: Current player (1 or -1)

        Returns:
            action: Integer action index in the BoopGame action space
        """
        # Initialize MCTS if needed
        if self.mcts is None:
            self.mcts = MCTS(self.game, self.nnet, self.mcts_args)

        # Get the canonical board for current player
        canonical_board = self.game.getCanonicalForm(game_state_tensor, player)

        # Get action probabilities from MCTS (temp=0 for deterministic play)
        action_probs = self.mcts.getActionProb(canonical_board, temp=0)

        # Return the action with highest probability
        action = np.argmax(action_probs)

        return action

    def reset(self):
        """Reset the MCTS tree for a new game."""
        self.mcts = None


def create_alphazero_agent(checkpoint_folder, checkpoint_filename, num_mcts_sims=256):
    """
    Factory function to create an AlphaZero agent function compatible with pygame UI.

    Args:
        checkpoint_folder: Path to folder containing checkpoint
        checkpoint_filename: Name of checkpoint file (e.g., 'best.pth.tar')
        num_mcts_sims: Number of MCTS simulations to run per move

    Returns:
        agent_func: A function that takes a GameState and returns the best move
    """
    agent = AlphaZeroAgent(checkpoint_folder, checkpoint_filename, num_mcts_sims)
    boop_game = Game()  # Create once for reuse

    def agent_func(game_state):
        """
        Agent function compatible with pygame UI.

        Args:
            game_state: packages.boop_core.game.GameState object

        Returns:
            tuple: (move_type, move_data) representing the best move
        """
        # Convert GameState to BoopGame tensor representation
        # We need to figure out the current player from the GameState
        player = 1 if game_state.current_turn == "orange" else -1

        # Convert GameState to tensor using public method
        board_tensor = boop_game.game_state_to_tensor(game_state)

        # Get the action from AlphaZero
        action = agent.get_move(board_tensor, player)

        # Convert action to move in GameState format
        move_location, move_type = boop_game.action_to_move(action)

        # Convert to GameState move format
        from packages.boop_agents.alphazero.BoopGame import MoveType

        if move_type == MoveType.PLACE_KITTEN:
            piece = "ok" if player == 1 else "gk"
            return ("place", (piece, tuple(move_location)))
        elif move_type == MoveType.PLACE_CAT:
            piece = "oc" if player == 1 else "gc"
            return ("place", (piece, tuple(move_location)))
        else:
            # Graduation move
            row, col = move_location
            row, col = int(row), int(col)
            if move_type == MoveType.SINGLE_GRADUATION:
                return ("graduate", ((row, col),))
            elif move_type == MoveType.HORIZONTAL_TRIPLE_GRADUATION:
                return ("graduate", ((row, col-1), (row, col), (row, col+1)))
            elif move_type == MoveType.VERTICAL_TRIPLE_GRADUATION:
                return ("graduate", ((row-1, col), (row, col), (row+1, col)))
            elif move_type == MoveType.DIAGONAL_TRIPLE_GRADUATION_UP:
                return ("graduate", ((row-1, col+1), (row, col), (row+1, col-1)))
            elif move_type == MoveType.DIAGONAL_TRIPLE_GRADUATION_DOWN:
                return ("graduate", ((row-1, col-1), (row, col), (row+1, col+1)))

    return agent_func
