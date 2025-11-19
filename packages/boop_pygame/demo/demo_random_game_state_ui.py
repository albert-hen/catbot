from packages.boop_core.util import generate_random_game_state
from ..ui import GameUI
import pygame
import sys
import logging


def main():
    ui = GameUI(game_state=generate_random_game_state())
    logging.debug("Game generated: %s", ui.game_state)
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
