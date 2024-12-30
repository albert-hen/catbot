from util import generate_random_game_state
from ui import GameUI
from game import GameState
import pygame
import sys

# Colors
LIGHT_BLUE = (173, 216, 230)
LIGHTER_BLUE = (224, 255, 255)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
ORANGE_KITTEN_COLOR = (255, 165, 0)  # Orange for Orange Kittens
GRAY_KITTEN_COLOR = (169, 169, 169)  # Gray for Gray Kittens
ORANGE_CAT_COLOR = (255, 69, 0)  # Darker Orange for Orange Cats
GRAY_CAT_COLOR = (105, 105, 105)  # Darker Gray for Gray Cats


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
