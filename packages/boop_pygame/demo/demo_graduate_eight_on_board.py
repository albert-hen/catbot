from packages.boop_core.game import GameState
from ..ui import GameUI
import pygame
import sys


def main():
    gs = GameState()
    # Populate the board with 7 gray kittens to trigger the 8-on-board graduation
    gs.board = [
        ["gk", "gk", "gk", "gk", "gk", "gk"],
        ["gk", None, None, None, None, None],
        [None, None, None, None, None, None],
        [None, None, None, None, None, None],
        [None, None, None, None, None, None],
        [None, None, None, None, None, None],
    ]
    gs.available_pieces["gk"] = gs.available_pieces["gk"] - 7
    ui = GameUI(game_state=gs)
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
