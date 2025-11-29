from .ui import GameUI
from packages.boop_core.game import GameState
from packages.boop_agents.minimax.minimax import minimax_agent
from packages.boop_agents.alphazero.alphazero_agent import create_alphazero_agent
import pygame
import sys
import time
import logging
import os

def main():
    # Parse command line arguments for agent configuration
    orange_agent = None
    gray_agent = None

    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            if arg == "--orange-ai":
                orange_agent = minimax_agent
            elif arg == "--gray-ai":
                gray_agent = minimax_agent
            elif arg == "--both-ai":
                orange_agent = minimax_agent
                gray_agent = minimax_agent
            elif arg.startswith("--orange-alphazero="):
                checkpoint_path = arg.split("=", 1)[1]
                checkpoint_folder, checkpoint_filename = os.path.split(checkpoint_path)
                if not checkpoint_folder:
                    checkpoint_folder = "."
                try:
                    orange_agent = create_alphazero_agent(checkpoint_folder, checkpoint_filename)
                    print(f"Loaded AlphaZero agent for orange from {checkpoint_path}")
                except Exception as e:
                    logging.error(f"Failed to load AlphaZero agent for orange: {e}")
                    sys.exit(1)
            elif arg.startswith("--gray-alphazero="):
                checkpoint_path = arg.split("=", 1)[1]
                checkpoint_folder, checkpoint_filename = os.path.split(checkpoint_path)
                if not checkpoint_folder:
                    checkpoint_folder = "."
                try:
                    gray_agent = create_alphazero_agent(checkpoint_folder, checkpoint_filename)
                    print(f"Loaded AlphaZero agent for gray from {checkpoint_path}")
                except Exception as e:
                    logging.error(f"Failed to load AlphaZero agent for gray: {e}")
                    sys.exit(1)
            elif arg.startswith("--both-alphazero="):
                checkpoint_path = arg.split("=", 1)[1]
                checkpoint_folder, checkpoint_filename = os.path.split(checkpoint_path)
                if not checkpoint_folder:
                    checkpoint_folder = "."
                try:
                    orange_agent = create_alphazero_agent(checkpoint_folder, checkpoint_filename)
                    gray_agent = create_alphazero_agent(checkpoint_folder, checkpoint_filename)
                    print(f"Loaded AlphaZero agents for both players from {checkpoint_path}")
                except Exception as e:
                    logging.error(f"Failed to load AlphaZero agents: {e}")
                    sys.exit(1)
            elif arg.startswith("--log-level="):
                level_str = arg.split("=", 1)[1].upper()
                if level_str in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
                    logging.getLogger().setLevel(getattr(logging, level_str))
            else:
                logging.warning(f"Unknown argument: {arg}")

    ui = GameUI(game_state=GameState(), orange_agent=orange_agent, gray_agent=gray_agent)
    ui.render()

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            else:
                ui.handle_event(event)
            ui.render()


if __name__ == "__main__":
    main()
