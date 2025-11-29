from .ui import GameUI
from packages.boop_core.game import GameState
from packages.boop_agents.minimax.minimax import minimax_agent
import pygame
import sys
import time
import logging

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
            elif arg.startswith("--log-level="):
                level_str = arg.split("=", 1)[1].upper()
                if level_str in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
                    logging.getLogger().setLevel(getattr(logging, level_str))
            else:
                logging.warning(f"Unknown log level: {level_str}")

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
