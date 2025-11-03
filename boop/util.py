import random
from boop.game import GameState


def generate_random_game_state():
    game_state = GameState()
    board_size = game_state.board.__len__()

    # randomly pick the number of cats to graduate
    orange_cats_to_graduate = random.randint(0, game_state.available_pieces["ok"])
    gray_cats_to_graduate = random.randint(0, game_state.available_pieces["gk"])

    game_state.available_pieces["ok"] -= orange_cats_to_graduate
    game_state.available_pieces["oc"] = orange_cats_to_graduate
    game_state.graduated_count["oc"] = orange_cats_to_graduate

    game_state.available_pieces["gk"] -= gray_cats_to_graduate
    game_state.available_pieces["gc"] = gray_cats_to_graduate
    game_state.graduated_count["gc"] = gray_cats_to_graduate
    random_locations = set()

    for key in game_state.available_pieces:

        for _ in range(game_state.available_pieces[key]):
            if random.choice([True, False]):
                # generate new random location until it is unique
                while True:
                    location = (
                        random.randint(0, board_size - 1),
                        random.randint(0, board_size - 1),
                    )
                    if location not in random_locations:
                        random_locations.add(location)
                        game_state.board[location[0]][location[1]] = key
                        game_state.available_pieces[key] -= 1
                        break

    return game_state
