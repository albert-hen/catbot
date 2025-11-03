from boop.game import GameState
from boop.ui import GameUI
import pygame
import sys


def main():
    gs = GameState()
    # Populate the board with 7 orange cats to test the 8-on-board win condition
    gs.board = [
        ["oc", "oc", "oc", "oc", "oc", "oc"],
        ["oc", None, None, None, None, None],
        [None, None, None, None, None, None],
        [None, None, None, None, None, None],
        [None, None, None, None, None, None],
        [None, None, None, None, None, None],
    ]
    gs.available_pieces["oc"] = 1  # 1 orange cat left in the pool
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
