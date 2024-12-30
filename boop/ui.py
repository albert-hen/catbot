import logging
import pygame
import copy

# Set up logging
logging.basicConfig(level=logging.DEBUG)

# Colors
LIGHT_BLUE = (173, 216, 230)
LIGHTER_BLUE = (224, 255, 255)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
ORANGE_KITTEN_COLOR = (255, 165, 0)  # Orange for Orange Kittens
GRAY_KITTEN_COLOR = (169, 169, 169)  # Gray for Gray Kittens
ORANGE_CAT_COLOR = (255, 69, 0)  # Darker Orange for Orange Cats
GRAY_CAT_COLOR = (105, 105, 105)  # Darker Gray for Gray Cats

# Constants
BOARD_SIZE = 6
SQUARE_SIZE = 100
BOARD_WIDTH = BOARD_SIZE * SQUARE_SIZE
UI_WIDTH = 400
WINDOW_HEIGHT = BOARD_SIZE * SQUARE_SIZE
WINDOW_WIDTH = BOARD_WIDTH + UI_WIDTH
FONT_SIZE = 36
TEXT_PADDING = 5
MARGIN = 10
BUTTON_WIDTH = 200
BUTTON_HEIGHT = 50
BUTTON_PADDING = 20


class Button:
    def __init__(self, x, y, width, height, text, font, color, hover_color, action):
        self.rect = pygame.Rect(x, y, width, height)
        self.text = text
        self.font = font
        self.color = color
        self.hover_color = hover_color
        self.action = action
        self.is_hovered = False

    def draw(self, screen):
        color = self.hover_color if self.is_hovered else self.color
        pygame.draw.rect(screen, color, self.rect)
        text_surface = self.font.render(self.text, True, BLACK)
        screen.blit(
            text_surface,
            (
                self.rect.x + (self.rect.width - text_surface.get_width()) // 2,
                self.rect.y + (self.rect.height - text_surface.get_height()) // 2,
            ),
        )

    def handle_event(self, event):
        if event.type == pygame.MOUSEMOTION:
            self.is_hovered = self.rect.collidepoint(event.pos)
        elif event.type == pygame.MOUSEBUTTONDOWN and self.is_hovered:
            logging.debug(f"Button '{self.text}' clicked")
            self.action()


class GameUI:
    def __init__(self, game_state):
        pygame.init()
        self.game_state = game_state
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption("Boop Game")
        self.font = pygame.font.SysFont(None, FONT_SIZE)
        self.selected_piece_type = {"orange": "ok", "gray": "gk"}  # Default selections
        self.create_buttons()
        self.history = []

        # Add attributes to store the loaded images
        self.orange_kitten_img = None
        self.gray_kitten_img = None
        self.orange_cat_img = None
        self.gray_cat_img = None

        self.load_assets()

    def load_assets(self):
        kittens_sheet = pygame.image.load("assets/kittens.png").convert_alpha()
        cats_sheet = pygame.image.load("assets/cats.png").convert_alpha()

        # Extract individual sprites
        self.gray_kitten_img = kittens_sheet.subsurface((0, 0, 75, 75))
        self.orange_kitten_img = kittens_sheet.subsurface((75, 0, 75, 75))
        self.gray_cat_img = cats_sheet.subsurface((0, 0, 75, 75))
        self.orange_cat_img = cats_sheet.subsurface((75, 0, 75, 75))
        print("HI WE ARE LOADING SPRITS")
        print(self.gray_kitten_img)

    def create_buttons(self):
        self.buttons = [
            Button(
                BOARD_WIDTH + MARGIN,
                WINDOW_HEIGHT - 2 * (BUTTON_HEIGHT + BUTTON_PADDING),
                BUTTON_WIDTH,
                BUTTON_HEIGHT,
                "Place Kitten",
                self.font,
                LIGHT_BLUE,
                LIGHTER_BLUE,
                self.select_kitten,
            ),
            Button(
                BOARD_WIDTH + MARGIN,
                WINDOW_HEIGHT - (BUTTON_HEIGHT + BUTTON_PADDING),
                BUTTON_WIDTH,
                BUTTON_HEIGHT,
                "Place Cat",
                self.font,
                LIGHT_BLUE,
                LIGHTER_BLUE,
                self.select_cat,
            ),
        ]

    def select_kitten(self):
        logging.debug("Kitten button selected")
        self.selected_piece_type[self.game_state.current_turn] = (
            "ok" if self.game_state.current_turn == "orange" else "gk"
        )

    def select_cat(self):
        logging.debug("Cat button selected")
        self.selected_piece_type[self.game_state.current_turn] = (
            "oc" if self.game_state.current_turn == "orange" else "gc"
        )

    def handle_event(self, event):
        if event.type == pygame.MOUSEBUTTONDOWN and self.game_state.game_over:
            logging.debug("Game is over. Click is a no-op.")
            return

        for button in self.buttons:
            button.handle_event(event)

        # handle mouse click
        if event.type == pygame.MOUSEBUTTONDOWN:
            mouse_pos = pygame.mouse.get_pos()
            # logging.debug(f"Mouse clicked at position {mouse_pos}")
            # check if click on board
            board_pos = self.get_board_position(mouse_pos)
            if board_pos:
                logging.debug(f"Click on board at position {board_pos}")
                try:
                    self.process_move(board_pos)
                except ValueError as e:
                    logging.error(f"Invalid move: {e}")
        # handle key press
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_u:
                logging.debug("Undo key pressed")
                self.undo_move()

    def get_board_position(self, mouse_pos):
        # Convert mouse click to board position
        col = mouse_pos[0] // SQUARE_SIZE
        row = mouse_pos[1] // SQUARE_SIZE
        if col < BOARD_SIZE and row < BOARD_SIZE:
            return row, col
        return None

    def process_move(self, board_pos):
        current_piece_type = self.selected_piece_type[self.game_state.current_turn]
        logging.debug(
            f"Processing move at position {board_pos} with piece type {current_piece_type}"
        )
        # Save the current state to history before making a move
        old_state = copy.deepcopy(self.game_state)

        # Place piece and immediately update the board state, can raise an exception
        self.game_state.place_piece(current_piece_type, board_pos)

        # only save when the move succeeds (does not raise an exception)
        self.history.append(old_state)

        self.render()  # Update the UI after placing the piece

    def undo_move(self):
        if self.history:
            self.game_state = self.history.pop()
            logging.debug("Reverted to previous game state")
            self.render()
        else:
            logging.debug("No moves to undo")

    def update(self):
        # No need to manage animations, just update the game state
        pass

    def render(self):
        # Draw the board and pieces in their final positions
        self.screen.fill(WHITE)
        self.draw_board()
        self.draw_pieces()
        self.draw_ui()
        pygame.display.flip()

    def draw_board(self):
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                color = LIGHTER_BLUE if (row + col) % 2 == 0 else LIGHT_BLUE
                pygame.draw.rect(
                    self.screen,
                    color,
                    (col * SQUARE_SIZE, row * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE),
                )

    def draw_pieces(self):
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                piece = self.game_state.board[row][col]
                if piece:
                    self.draw_piece(piece, row, col)

    def draw_piece(self, piece, row, col):
        screen_y = row * SQUARE_SIZE + SQUARE_SIZE // 2
        screen_x = col * SQUARE_SIZE + SQUARE_SIZE // 2

        if piece == "ok":
            self.screen.blit(self.orange_kitten_img, (screen_x - 37, screen_y - 37))
        elif piece == "gk":
            self.screen.blit(self.gray_kitten_img, (screen_x - 37, screen_y - 37))
        elif piece == "oc":
            self.screen.blit(self.orange_cat_img, (screen_x - 37, screen_y - 37))
        elif piece == "gc":
            self.screen.blit(self.gray_cat_img, (screen_x - 37, screen_y - 37))

    # Helper function to get the full piece name
    def get_full_piece_name(self, piece_code):
        piece_names = {
            "ok": "Orange Kitten",
            "gk": "Gray Kitten",
            "oc": "Orange Cat",
            "gc": "Gray Cat",
        }
        return piece_names.get(piece_code, "Unknown Piece")

    def draw_ui(self):
        # Display current turn
        y_offset = MARGIN
        turn_text = self.font.render(
            f"Current Turn: {self.game_state.current_turn}", True, BLACK
        )
        self.screen.blit(turn_text, (BOARD_WIDTH + MARGIN, y_offset))
        y_offset += FONT_SIZE + TEXT_PADDING

        # Display available pieces
        orange_kittens_text = self.font.render(
            f"Orange Kittens: {self.game_state.available_pieces['ok']}",
            True,
            BLACK,
        )
        self.screen.blit(orange_kittens_text, (BOARD_WIDTH + MARGIN, y_offset))
        y_offset += FONT_SIZE + TEXT_PADDING

        gray_kittens_text = self.font.render(
            f"Gray Kittens: {self.game_state.available_pieces['gk']}",
            True,
            BLACK,
        )
        self.screen.blit(gray_kittens_text, (BOARD_WIDTH + MARGIN, y_offset))
        y_offset += FONT_SIZE + TEXT_PADDING

        orange_cats_text = self.font.render(
            f"Orange Cats: {self.game_state.available_pieces['oc']}",
            True,
            BLACK,
        )
        self.screen.blit(orange_cats_text, (BOARD_WIDTH + MARGIN, y_offset))
        y_offset += FONT_SIZE + TEXT_PADDING

        gray_cats_text = self.font.render(
            f"Gray Cats: {self.game_state.available_pieces['gc']}", True, BLACK
        )
        self.screen.blit(gray_cats_text, (BOARD_WIDTH + MARGIN, y_offset))
        y_offset += FONT_SIZE + TEXT_PADDING

        # Display selected piece type
        selected_piece_code = self.selected_piece_type[self.game_state.current_turn]
        selected_piece_name = self.get_full_piece_name(selected_piece_code)
        selected_piece_text = self.font.render(
            f"Selected Piece: {selected_piece_name}",
            True,
            BLACK,
        )
        self.screen.blit(selected_piece_text, (BOARD_WIDTH + MARGIN, y_offset))
        y_offset += FONT_SIZE + TEXT_PADDING

        # Draw piece selection buttons
        self.draw_piece_selection_buttons()

    def draw_piece_selection_buttons(self):
        for button in self.buttons:
            button.draw(self.screen)
