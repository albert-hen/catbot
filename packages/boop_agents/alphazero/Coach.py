import logging
import os
import sys
from collections import deque
from pickle import Pickler, Unpickler
from random import shuffle
from datetime import datetime

import numpy as np
from tqdm import tqdm

from packages.boop_agents.alphazero.Arena import Arena
from packages.boop_agents.alphazero.MCTS import MCTS


log = logging.getLogger(__name__)

MAX_EPISODE_LENGTH = 500



class Coach():
    """
    This class executes the self-play + learning. It uses the functions defined
    in Game and NeuralNet. args are specified in main.py.
    """

    def __init__(self, game, nnet, args):
        self.game = game
        self.nnet = nnet
        self.pnet = self.nnet.__class__(self.game)  # the competitor network
        self.args = args
        self.mcts = MCTS(self.game, self.nnet, self.args)
        self.trainExamplesHistory = []  # history of examples from args.numItersForTrainExamplesHistory latest iterations
        self.skipFirstSelfPlay = False  # can be overriden in loadTrainExamples()

    def _format_policy_columns(self, policy_list):
        """Helper to format the policy into up to 3 columns."""
        if not policy_list:
            return ""

        # Sort by probability, descending
        sorted_policy = sorted(policy_list, key=lambda x: x['prob'], reverse=True)

        # Format each policy item into a display string
        formatted_items = []
        for item in sorted_policy:
            prob_percent = item['prob'] * 100
            # Simple parsing of the move string for better display
            move_str = str(item['move'][0]) + " " + item['move'][1].name.replace("_", " ").title()
            formatted_items.append(f"{prob_percent:02.0f}%  {move_str}")

        # Define columns
        max_per_col = 6
        cols = [formatted_items[i:i + max_per_col] for i in range(0, len(formatted_items), max_per_col)]
        
        # Find the width for each column to align them
        col_widths = [max(len(s) for s in col) if col else 0 for col in cols]
        
        output_lines = ["Policy:"]
        # Interleave items from columns row by row
        for i in range(max_per_col):
            line_parts = []
            for col_idx, col in enumerate(cols):
                if i < len(col):
                    # Pad string to align columns
                    line_parts.append(col[i].ljust(col_widths[col_idx]))
            if line_parts:
                output_lines.append("   ".join(line_parts))
        
        return "\n".join(output_lines)

    def save_episode_trace_txt(self, episode_trace, result, episode_id=None, filename="episode_traces.txt"):
        """
        Appends a human-readable trace of a single episode to a text file.
        """
        if episode_id is None:
            episode_id = datetime.now().strftime("%Y%m%d-%H%M%S")

        with open(filename, "a") as f:
            f.write("-" * 60 + "\n")
            f.write(f"Episode ID: {episode_id}\n\n")

            for step in episode_trace:
                f.write(f"--- Step {step['step']} ---\n")
                f.write(f"Player Turn: {step['player'].title()}\n\n")
                
                # Write the formatted policy
                policy_str = self._format_policy_columns(step['pi'])
                f.write(policy_str + "\n\n")

                # Write the chosen move
                chosen_move_str = step['action']
                f.write(f"Randomly Chosen Move: {chosen_move_str}\n\n")

                # Write the resulting board state
                f.write("Resulting Board State:\n")
                f.write(step['board'] + "\n\n")

            f.write(f"Winner: {result.title()}\n")
            f.write("-" * 60 + "\n\n")

    def executeEpisode(self):
        """
        This function executes one episode of self-play, starting with player 1.
        As the game is played, each turn is added as a training example to
        trainExamples. The game is played till the game ends. After the game
        ends, the outcome of the game is used to assign values to each example
        in trainExamples.

        It uses a temp=1 if episodeStep < tempThreshold, and thereafter
        uses temp=0.

        Returns:
            trainExamples: a list of examples of the form (canonicalBoard, currPlayer, pi,v)
                           pi is the MCTS informed policy vector, v is +1 if
                           the player eventually won the game, else -1.
        """
        trainExamples = []
        board = self.game.getInitBoard()
        self.curPlayer = 1
        episodeStep = 0
        episode_trace = []

        while True:
            episodeStep += 1

            if episodeStep > MAX_EPISODE_LENGTH:
                log.warning("Episode exceeded max length, dropping episode.")
                return []
    
            canonicalBoard = self.game.getCanonicalForm(board, self.curPlayer)
            temp = int(episodeStep < self.args.tempThreshold)

            pi = self.mcts.getActionProb(canonicalBoard, temp=temp)
            sym = self.game.getSymmetries(canonicalBoard, pi)
            for b, p in sym:
                trainExamples.append([b, self.curPlayer, p, None])

            action = np.random.choice(len(pi), p=pi)
            acted_player = self.curPlayer
            board, self.curPlayer = self.game.getNextState(board, self.curPlayer, action)

            move_probs = []
            for i, prob in enumerate(pi):
                if prob > 0:
                    move = self.game.action_to_move(i)
                    move_probs.append({"move": move, "prob": float(prob)})
            game_state_after = self.game.tensor_to_game_state(board, self.curPlayer)
            episode_trace.append({
                "step": episodeStep, 
                "player": "orange" if acted_player == 1 else "gray", 
                "pi": move_probs,
                "action": self.game.action_to_move(action),
                "board": str(game_state_after)
            })

            r = self.game.getGameEnded(board, self.curPlayer)

            if r != 0:
                # it is possible to win starting a turn becaues the other play bumped the new turn player into a win
                winner = "gray" if ((r == -1 and self.curPlayer == 1) or (r == 1 and self.curPlayer == -1)) else "orange"
                self.save_episode_trace_txt(episode_trace, winner)
                return [(x[0], x[2], r * ((-1) ** (x[1] != self.curPlayer))) for x in trainExamples]

    def learn(self):
        """
        Performs numIters iterations with numEps episodes of self-play in each
        iteration. After every iteration, it retrains neural network with
        examples in trainExamples (which has a maximum length of maxlenofQueue).
        It then pits the new neural network against the old one and accepts it
        only if it wins >= updateThreshold fraction of games.
        """

        for i in range(1, self.args.numIters + 1):
            # bookkeeping
            log.info(f'Starting Iter #{i} ...')
            # examples of the iteration
            if not self.skipFirstSelfPlay or i > 1:
                iterationTrainExamples = deque([], maxlen=self.args.maxlenOfQueue)

                for _ in tqdm(range(self.args.numEps), desc="Self Play"):
                    self.mcts = MCTS(self.game, self.nnet, self.args)  # reset search tree
                    iterationTrainExamples += self.executeEpisode()

                # save the iteration examples to the history 
                self.trainExamplesHistory.append(iterationTrainExamples)

            if len(self.trainExamplesHistory) > self.args.numItersForTrainExamplesHistory:
                log.warning(
                    f"Removing the oldest entry in trainExamples. len(trainExamplesHistory) = {len(self.trainExamplesHistory)}")
                self.trainExamplesHistory.pop(0)
            # backup history to a file
            # NB! the examples were collected using the model from the previous iteration, so (i-1)  
            self.saveTrainExamples(i - 1)

            # shuffle examples before training
            trainExamples = []
            for e in self.trainExamplesHistory:
                trainExamples.extend(e)
            shuffle(trainExamples)

            # training new network, keeping a copy of the old one
            self.nnet.save_checkpoint(folder=self.args.checkpoint, filename='temp.pth.tar')
            self.pnet.load_checkpoint(folder=self.args.checkpoint, filename='temp.pth.tar')
            pmcts = MCTS(self.game, self.pnet, self.args)

            self.nnet.train(trainExamples)
            nmcts = MCTS(self.game, self.nnet, self.args)

            log.info('PITTING AGAINST PREVIOUS VERSION')
            arena = Arena(lambda x: np.argmax(pmcts.getActionProb(x, temp=0)),
                          lambda x: np.argmax(nmcts.getActionProb(x, temp=0)), self.game)
            pwins, nwins, draws = arena.playGames(self.args.arenaCompare)

            log.info('NEW/PREV WINS : %d / %d ; DRAWS : %d' % (nwins, pwins, draws))
            if pwins + nwins == 0 or float(nwins) / (pwins + nwins) < self.args.updateThreshold:
                log.info('REJECTING NEW MODEL')
                self.nnet.load_checkpoint(folder=self.args.checkpoint, filename='temp.pth.tar')
            else:
                log.info('ACCEPTING NEW MODEL')
                self.nnet.save_checkpoint(folder=self.args.checkpoint, filename=self.getCheckpointFile(i))
                self.nnet.save_checkpoint(folder=self.args.checkpoint, filename='best.pth.tar')

    def getCheckpointFile(self, iteration):
        return 'checkpoint_' + str(iteration) + '.pth.tar'

    def saveTrainExamples(self, iteration):
        folder = self.args.checkpoint
        if not os.path.exists(folder):
            os.makedirs(folder)
        filename = os.path.join(folder, self.getCheckpointFile(iteration) + ".examples")
        with open(filename, "wb+") as f:
            Pickler(f).dump(self.trainExamplesHistory)
        f.closed

    def loadTrainExamples(self):
        modelFile = os.path.join(self.args.load_folder_file[0], self.args.load_folder_file[1])
        examplesFile = modelFile + ".examples"
        if not os.path.isfile(examplesFile):
            log.warning(f'File "{examplesFile}" with trainExamples not found!')
            r = input("Continue? [y|n]")
            if r != "y":
                sys.exit()
        else:
            log.info("File with trainExamples found. Loading it...")
            with open(examplesFile, "rb") as f:
                self.trainExamplesHistory = Unpickler(f).load()
            log.info('Loading done!')

            # examples based on the model were already collected (loaded)
            self.skipFirstSelfPlay = True
