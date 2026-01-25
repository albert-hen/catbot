import os
import sys
import time

import numpy as np
from tqdm import tqdm

sys.path.append("../../")
from packages.boop_agents.alphazero.utils import *
from packages.boop_agents.alphazero.NeuralNet import NeuralNet

import torch
import torch.optim as optim

from packages.boop_agents.alphazero.BoopNNet import BoopNNet as boopnnet

# Determine the best device to use
def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif torch.backends.mps.is_available():
        return torch.device("mps")
    else:
        return torch.device("cpu")

args = dotdict(
    {
        "lr": 0.001,
        "dropout": 0.3,
        "epochs": 10,
        "batch_size": 64,
        "device": get_device(),
        "num_channels": 128,
    }
)


class NNetWrapper(NeuralNet):
    def __init__(self, game):
        self.nnet = boopnnet(game, args)
        self.board_x, self.board_y = game.getBoardSize()
        self.input_channels = game.board_input_channels
        self.action_size = game.getActionSize()

        self.nnet.to(args.device)

    def train(self, examples):
        """
        examples: list of examples, each example is of form (board, pi, v)
        """
        optimizer = optim.Adam(self.nnet.parameters())

        for epoch in range(args.epochs):
            print("EPOCH ::: " + str(epoch + 1))
            self.nnet.train()
            pi_losses = AverageMeter()
            v_losses = AverageMeter()

            batch_count = int(len(examples) / args.batch_size)

            t = tqdm(range(batch_count), desc="Training Net")
            for _ in t:
                sample_ids = np.random.randint(len(examples), size=args.batch_size)
                boards, pis, vs = list(zip(*[examples[i] for i in sample_ids]))
                boards = torch.FloatTensor(np.array(boards).astype(np.float64))
                target_pis = torch.FloatTensor(np.array(pis))
                target_vs = torch.FloatTensor(np.array(vs).astype(np.float64))

                # predict
                if args.device.type != "cpu":
                    boards, target_pis, target_vs = (
                        boards.to(args.device),
                        target_pis.to(args.device),
                        target_vs.to(args.device),
                    )

                # compute output
                out_pi, out_v = self.nnet(boards)
                l_pi = self.loss_pi(target_pis, out_pi)
                l_v = self.loss_v(target_vs, out_v)
                total_loss = l_pi + l_v

                # record loss
                pi_losses.update(l_pi.item(), boards.size(0))
                v_losses.update(l_v.item(), boards.size(0))
                t.set_postfix(Loss_pi=pi_losses, Loss_v=v_losses)

                # compute gradient and do SGD step
                optimizer.zero_grad()
                total_loss.backward()
                optimizer.step()

    def predict(self, board):
        """
        board: np array with board
        """
        # timing
        start = time.time()

        # preparing input
        board = torch.FloatTensor(board.astype(np.float64))
        if args.device.type != "cpu":
            board = board.to(args.device)
        board = board.view(1, self.input_channels, self.board_x, self.board_y)
        self.nnet.eval()
        with torch.no_grad():
            pi, v = self.nnet(board)

        # print('PREDICTION TIME TAKEN : {0:03f}'.format(time.time()-start))
        return torch.exp(pi).data.cpu().numpy()[0], v.data.cpu().numpy()[0]

    def batch_predict(self, boards):
        """
        Batch prediction for multiple boards - optimized for GPU performance.
        boards: list of numpy arrays, each with shape matching single board
        
        Returns:
            batch_pis: numpy array of shape (batch_size, action_size)
            batch_vs: numpy array of shape (batch_size,)
        """
        if not boards:
            return np.array([]), np.array([])
        
        # Stack boards into batch
        boards_array = np.array([b.astype(np.float64) for b in boards])
        boards_tensor = torch.FloatTensor(boards_array)
        
        if args.device.type != "cpu":
            boards_tensor = boards_tensor.to(args.device)
        
        # Reshape for network input: (batch_size, channels, height, width)
        batch_size = boards_tensor.size(0)
        boards_tensor = boards_tensor.view(batch_size, self.input_channels, self.board_x, self.board_y)
        
        self.nnet.eval()
        with torch.no_grad():
            pis, vs = self.nnet(boards_tensor)
        
        # Convert to numpy and return
        batch_pis = torch.exp(pis).data.cpu().numpy()
        batch_vs = vs.data.cpu().numpy().flatten()
        
        return batch_pis, batch_vs

    def loss_pi(self, targets, outputs):
        return -torch.sum(targets * outputs) / targets.size()[0]

    def loss_v(self, targets, outputs):
        return torch.sum((targets - outputs.view(-1)) ** 2) / targets.size()[0]

    def save_checkpoint(self, folder="checkpoint", filename="checkpoint.pth.tar"):
        filepath = os.path.join(folder, filename)
        if not os.path.exists(folder):
            print(
                "Checkpoint Directory does not exist! Making directory {}".format(
                    folder
                )
            )
            os.mkdir(folder)
        else:
            print("Checkpoint Directory exists! ")
        torch.save(
            {
                "state_dict": self.nnet.state_dict(),
            },
            filepath,
        )

    def load_checkpoint(self, folder="checkpoint", filename="checkpoint.pth.tar"):
        # https://github.com/pytorch/examples/blob/master/imagenet/main.py#L98
        filepath = os.path.join(folder, filename)
        if not os.path.exists(filepath):
            raise ("No model in path {}".format(filepath))
        map_location = args.device
        checkpoint = torch.load(filepath, map_location=map_location)
        self.nnet.load_state_dict(checkpoint["state_dict"])
