from .ui import GameUI
from packages.boop_core.game import GameState
import pygame
import sys


def main():
    ui = GameUI(game_state=GameState())
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
