# Layout
### **UI Layout Summary for "Boop"**

The UI layout should be simple, intuitive, and responsive to the player’s actions, with clear feedback at each stage of the game. Below is a detailed breakdown of the layout and interactions, including what is clickable, what updates according to the game state, and key design elements.

---

### **1. Board Area**
#### **Description:**
The central part of the screen is dedicated to the 6x6 board where the game pieces (Kittens and Cats) are placed.

#### **Layout Details:**
- **Positioning:**
  - The board occupies the majority of the screen’s central area, arranged in a grid of 6x6 squares.
  - Each square should be large enough for easy clicking and visibility of the game pieces.

- **Interactions:**
  - **Clickable Elements:**
    - Each square on the board is clickable **only when it is a valid move**. After a player selects a piece (Kitten or Cat), the valid squares are highlighted, and the player can click on one to place the piece.
    - If the player is required to graduate a Kitten, only eligible Kittens are clickable, with the rest of the board greyed out.
  
  - **Updates Based on Game State:**
    - The game pieces (Kittens and Cats) are rendered on the board based on the current game state.
    - After a piece is placed, the booping logic is applied immediately, and the booped pieces are moved to their new positions.
    - The board updates to reflect graduations, where Kittens are removed and Cats are placed on the board.
    - The board highlights valid placement positions dynamically according to the selected piece type and the current game state.

---

### **2. Piece Selection Area**
#### **Description:**
Below or adjacent to the board is the piece selection area where the player can choose to place either a Kitten or a Cat.

#### **Layout Details:**
- **Positioning:**
  - This section can be placed just below the board or in a sidebar, depending on the layout preferences.
  - Two buttons: **"Place Kitten"** and **"Place Cat."**

- **Interactions:**
  - **Clickable Elements:**
    - The **"Place Kitten"** and **"Place Cat"** buttons are clickable based on the player's available pieces.
    - If the player has no Cats in their pool, the **"Place Cat"** button is disabled (greyed out) to prevent selection.

  - **Updates Based on Game State:**
    - The **Cat** button becomes clickable only if the player has Cats available in their pool.
    - The selection buttons highlight the currently selected piece type.
    - The button states (enabled/disabled) update dynamically depending on the availability of Kittens and Cats in the player’s pool.

---

### **3. Turn Indicator**
#### **Description:**
A turn indicator at the top or bottom of the screen shows whose turn it is.

#### **Layout Details:**
- **Positioning:**
  - The turn indicator should be placed clearly at the top or bottom of the screen.
  - The indicator shows **"Orange's Turn"** or **"Gray's Turn"**, along with a small colored background matching the player’s color (Orange or Gray).

- **Interactions:**
  - **Non-clickable:** This is a passive display area and is not interactive.
  
  - **Updates Based on Game State:**
    - The text and color of the turn indicator update automatically at the end of each player’s turn.
    - After all actions (booping, graduation, etc.) are resolved, the indicator switches to display the next player's turn.

---

### **4. Notifications and Prompts**
#### **Description:**
This area displays important notifications or prompts for special situations, such as selecting a group for graduation or being required to graduate a Kitten when all pieces are on the board.

#### **Layout Details:**
- **Positioning:**
  - Appears as a **pop-up message** or text bar at the top or center of the screen.

- **Interactions:**
  - **Clickable Elements:**
    - If a player must select which group of Kittens to graduate (in the case of multiple valid lines), the prompt is displayed, and the valid groups on the board are clickable.
    - If the player must graduate a Kitten because they have no available pieces, the prompt is displayed, and only Kittens are clickable on the board.
  
  - **Updates Based on Game State:**
    - Prompts appear dynamically when the game enters special conditions, such as forced graduation or multiple groups of three Kittens for graduation.
    - The prompt disappears after the player makes their selection.

---

### **5. Winning Message and End-of-Game Options**
#### **Description:**
When a player wins, the game displays a clear winning message along with options to restart or exit the game.

#### **Layout Details:**
- **Positioning:**
  - A large, centered message that says **"Orange Wins!"** or **"Gray Wins!"**, covering part of the board but not obscuring the pieces.

- **Interactions:**
  - **Clickable Elements:**
    - Buttons appear with options like **"Play Again"** or **"Return to Menu"**.
  
  - **Updates Based on Game State:**
    - The message and buttons only appear once the game detects a win condition (e.g., three Cats in a row or all 8 Cats on the board).
    - After the player selects an option, the game either restarts or exits to the menu.

---

### **Summary of Key Interactions and Updates:**

1. **Board Area:**
   - **Clickable:** Only valid squares are clickable for piece placement.
   - **Updates:** Reflects piece placement, booping, and graduations.
  
2. **Piece Selection Area:**
   - **Clickable:** Buttons for selecting Kitten or Cat.
   - **Updates:** Dynamically updates based on the player’s available pieces.

3. **Turn Indicator:**
   - **Non-clickable:** Displays the current player’s turn.
   - **Updates:** Automatically switches based on the game state.

4. **Notifications and Prompts:**
   - **Clickable:** Prompts for graduation choices or forced Kitten graduation.
   - **Updates:** Displays dynamically based on game conditions.

5. **Winning Message:**
   - **Clickable:** Options to restart or exit the game.
   - **Updates:** Only appears when a player wins.

---

This layout focuses on clear visual feedback, dynamic updates based on game state, and simple, intuitive interaction points. It ensures that the game flows smoothly, with the UI guiding the player through their valid actions. Let me know if you need any further refinements or have other elements you'd like to discuss!

# Flows

Here's a breakdown of an intuitive yet simple UI design for each of the possible moves and actions described in the game rules. The goal is to make the UI clear, responsive, and easy to use, while ensuring that all possible actions are accessible and logical for the players.

---

### **1. Piece Selection (Kitten or Cat)**

#### **Description:**
Before placing a piece on the board, the player must choose whether to place a **Kitten** or a **Cat**.

#### **UI Design:**
- **Selection Buttons:** 
  - Place two buttons at the bottom of the screen labeled **"Place Kitten"** and **"Place Cat."**
  - The buttons are color-coded according to the player’s color (Orange or Gray).
  - If a player has no Cats available in their pool, the **"Place Cat"** button is disabled (greyed out) to prevent selection.
- **Visual Feedback:**
  - The selected button is highlighted to indicate which piece type the player is about to place.
  - The unselected button appears dimmer.

#### **Interaction Flow:**
1. The player clicks the **"Place Kitten"** or **"Place Cat"** button.
2. The board highlights valid positions where the selected piece type can be placed.

---

### **2. Placing a Piece on the Board**

#### **Description:**
Once a piece type is selected, the player places it on an available square on the board.

#### **UI Design:**
- **Highlight Available Squares:**
  - Once a piece is selected, all valid, unoccupied positions on the board are highlighted with a **soft glow** or **outline**. This indicates where the player can place their piece.
  - The highlight is in the color of the current player (Orange or Gray).
- **Click to Place:**
  - The player clicks on a highlighted square to place the piece.
- **Immediate Feedback:**
  - The piece is immediately drawn on the board in the clicked position.
  - The board state is updated right after placement, and any adjacent pieces are booped automatically.

#### **Interaction Flow:**
1. The player clicks on a highlighted square.
2. The piece is placed immediately, the board updates, and booping is resolved without additional input.

---

### **3. Booping Pieces**

#### **Description:**
After placing a piece, adjacent pieces may be "booped" one space away, following the game’s booping rules.

#### **UI Design:**
- **No Input Required:** The booping process is automatic, with no need for additional player interaction.
- **Visual Feedback:** 
  - When pieces are booped, they can either blink briefly or be redrawn in their new positions immediately, so the player knows which pieces have moved.
  - Alternatively, a **short visual pulse** can be shown on booped pieces to indicate the movement before they snap to their new location.

#### **Interaction Flow:**
1. The player places a piece.
2. The UI handles all booping automatically and updates the board without requiring player input.

---

### **4. Graduating Kittens to Cats**

#### **Description:**
When a player lines up three Kittens in a row (horizontally, vertically, or diagonally), those Kittens graduate to Cats.

#### **UI Design:**
- **Automatic Graduation:**
  - The UI automatically detects when a line of three Kittens is formed.
  - A brief highlight or pulse effect on the three aligned Kittens shows they are about to be graduated.
  - The Kittens are removed from the board and replaced with Cats from the player’s pool.

- **Cat Pool Update:**
  - The player’s available pool of Cats is updated as soon as the graduation happens, allowing them to place Cats on their future turns.

#### **Interaction Flow:**
1. After booping is resolved, the game checks for any three-in-a-row Kittens.
2. Graduated Kittens are removed, Cats are added to the player's pool, and the board is updated.
3. No player input is required; graduation happens automatically.

---

### **5. No Available Pieces (Graduation by Force)**

#### **Description:**
When all 8 pieces (Kittens and Cats) are on the board and the player has no available pieces in their pool, they must graduate one Kitten to a Cat by removing a Kitten from the board.

#### **UI Design:**
- **Graduation Mode:**
  - When this condition is triggered, the game enters a special **Graduation Mode**.
  - The UI prompts the player with a simple message: **"Select a Kitten to graduate."**
  - All valid Kittens that can be graduated are highlighted on the board. Non-Kitten pieces are greyed out to prevent selection.

- **Graduation Action:**
  - The player clicks on a highlighted Kitten, which is removed from the board and replaced by a Cat in their available pool.
  - The game then returns to normal, and the player can place their new Cat on their next turn.

#### **Interaction Flow:**
1. The game detects that the player has no available pieces and triggers **Graduation Mode**.
2. The player selects a Kitten to remove.
3. The selected Kitten is replaced by a Cat in their pool, and the game returns to normal play.

---

### **6. Switching Turns**

#### **Description:**
After a player completes their move, the game automatically switches to the other player’s turn.

#### **UI Design:**
- **Turn Indicator:**
  - A clear **turn indicator** is shown at the top or bottom of the screen, displaying the active player’s color and a message like **"Orange’s Turn"** or **"Gray’s Turn."**
  - The background of the turn indicator can glow or pulse slightly to indicate whose turn it is.
- **Smooth Transition:**
  - After a player places a piece and the game resolves all moves, the turn indicator smoothly transitions to the other player.
  - There should be no delay in switching turns unless a special condition like graduation occurs.

#### **Interaction Flow:**
1. The turn automatically switches after a player completes their move (including booping and graduation).
2. The turn indicator updates, and the new player can now select their piece.

---

### **7. Winning the Game**

#### **Description:**
The game is won when a player lines up three Cats in a row, or all 8 Cats are placed on the board.

#### **UI Design:**
- **Winning Message:**
  - When a win condition is met, the game shows a clear, celebratory message like **"Orange Wins!"** or **"Gray Wins!"** in large text.
  - Optionally, a small animation (like confetti or flashing colors) can accompany the message to celebrate the win.

- **Restart Option:**
  - After the winning message, the UI shows a button or prompt to **"Play Again"** or **"Return to Menu."**

#### **Interaction Flow:**
1. When the game detects a win, it shows the winning message and offers a restart option.
2. The players can choose to restart or exit the game.

---

### **8. Handling Multiple Graduations (More Than Three in a Row or Multiple Connected 3's)**

#### **Description:**
In the rare case where a player lines up more than three Kittens in a row (e.g., four or more Kittens in a straight line) or forms multiple connected groups of three, the player must choose **which group of three** Kittens they want to graduate.

#### **UI Design:**

- **Graduation Prompt:**
  - When more than one valid group of three Kittens is formed, the UI should prompt the player with a message like: **"Select which group of Kittens to graduate."**
  - All possible groups of Kittens (e.g., multiple connected lines) are highlighted for clarity.

- **Group Selection:**
  - The UI highlights each possible group of three Kittens with a different outline or glow (e.g., Group 1 could be highlighted in yellow, Group 2 in blue, etc.).
  - The player can click on one of the highlighted groups to choose which group of Kittens they want to graduate.
  - Once a group is selected, the Kittens from that group are graduated to Cats, and the rest of the board remains unchanged.

#### **Interaction Flow:**
1. The game detects multiple groups of three or more Kittens.
2. The UI displays a prompt asking the player to choose a group to graduate.
3. The possible groups are highlighted for the player to choose from.
4. The player clicks on the group they wish to graduate, and the selected group of Kittens is removed from the board and replaced with Cats.
5. The rest of the game continues as normal.

---

### **Key Considerations:**

1. **Visual Clarity:**
   - When multiple groups of three Kittens are possible, each group should be clearly differentiated (perhaps using different colors for outlines or a slight animation on each group).
   - This makes it easy for the player to see the options and choose which group to graduate.

2. **Preventing Confusion:**
   - The game should prevent the player from interacting with other elements of the board (e.g., placing a new piece or selecting an invalid group) until they have made their graduation choice.
   - The rest of the board should appear dimmed or less interactive while the player is choosing a group.

3. **Efficiency:**
   - Once the player makes their selection, the chosen group of Kittens should be removed and replaced with Cats immediately.
   - There should be no additional prompts or delays beyond the initial selection process.

---

### **Updated UI Design Considerations:**

Now that we've included this rule for handling multiple graduation groups, the UI should handle this specific case as follows:
1. The player is prompted to choose which group of three Kittens to graduate when multiple groups are formed.
2. The possible groups are highlighted.
3. The player selects one of the groups, which are graduated to Cats.
