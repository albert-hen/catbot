import sys

sys.path.append("..")
from packages.boop_agents.alphazero.utils import *

import torch
import torch.nn as nn
import torch.nn.functional as F

# canonical board is p1 is orange

# channel zero is the decision type: 0 for place 1 for graduate
# ch 1 p1 kitten pieces, one hot encoding in the 6x6 grid for positions of p1 kitten pieces
# ch 2 p2 kitten pieces, one hot encoding in the 6x6 grid for positions of p2 kitten pieces
# ch 3 p1 cat pieces, one hot encoding in the 6x6 grid for positions of p1 cat pieces
# ch 4 p2 cat pieces, one hot encoding in the 6x6 grid for positions of p2 cat pieces
# ch 5 p1 kitten count, filled with the number of p1 kitten pieces
# ch 6 p2 kitten count, filled with the number of p2 kitten pieces
# ch 7 p1 cat count, filled with the number of p1 cat pieces
# ch 8 p2 cat count, filled with the number of p2 cat pieces


class BoopNNet(nn.Module):
    def __init__(self, game, args):
        # game params
        self.board_x, self.board_y = 6, 6
        self.action_size = game.getActionSize()
        self.args = args
        self.input_channels = game.board_input_channels

        super(BoopNNet, self).__init__()
        self.conv1 = nn.Conv2d(
            self.input_channels, args.num_channels, 3, stride=1, padding=1
        )
        self.conv2 = nn.Conv2d(
            args.num_channels, args.num_channels, 3, stride=1, padding=1
        )
        self.conv3 = nn.Conv2d(args.num_channels, args.num_channels, 3, stride=1)
        self.conv4 = nn.Conv2d(args.num_channels, args.num_channels, 3, stride=1)

        self.bn1 = nn.BatchNorm2d(args.num_channels)
        self.bn2 = nn.BatchNorm2d(args.num_channels)
        self.bn3 = nn.BatchNorm2d(args.num_channels)
        self.bn4 = nn.BatchNorm2d(args.num_channels)

        self.fc1 = nn.Linear(
            args.num_channels * (self.board_x - 4) * (self.board_y - 4), 1024
        )
        self.fc_bn1 = nn.BatchNorm1d(1024)

        self.fc2 = nn.Linear(1024, 512)
        self.fc_bn2 = nn.BatchNorm1d(512)

        self.fc3 = nn.Linear(512, self.action_size)

        self.fc4 = nn.Linear(512, 1)

    def forward(self, s):
        #                                                           s: batch_size x board_x x board_y
        s = s.view(
            -1, self.input_channels, self.board_x, self.board_y
        )  # batch_size x 1 x board_x x board_y
        s = F.relu(
            self.bn1(self.conv1(s))
        )  # batch_size x num_channels x board_x x board_y
        s = F.relu(
            self.bn2(self.conv2(s))
        )  # batch_size x num_channels x board_x x board_y
        s = F.relu(
            self.bn3(self.conv3(s))
        )  # batch_size x num_channels x (board_x-2) x (board_y-2)
        s = F.relu(
            self.bn4(self.conv4(s))
        )  # batch_size x num_channels x (board_x-4) x (board_y-4)
        s = s.view(-1, self.args.num_channels * (self.board_x - 4) * (self.board_y - 4))

        s = F.dropout(
            F.relu(self.fc_bn1(self.fc1(s))),
            p=self.args.dropout,
            training=self.training,
        )  # batch_size x 1024
        s = F.dropout(
            F.relu(self.fc_bn2(self.fc2(s))),
            p=self.args.dropout,
            training=self.training,
        )  # batch_size x 512

        pi = self.fc3(s)  # batch_size x action_size
        v = self.fc4(s)  # batch_size x 1

        return F.log_softmax(pi, dim=1), torch.tanh(v)
