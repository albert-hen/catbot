#!/usr/bin/env python3
"""
Export the trained AlphaZero model to ONNX format for browser inference.

Usage:
    python scripts/export_onnx.py [checkpoint_path] [output_path]

Example:
    python scripts/export_onnx.py temp/best.pth.tar packages/boop_web/public/model.onnx
"""

import sys
import os
import torch
import numpy as np

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from packages.boop_agents.alphazero.BoopGame import Game
from packages.boop_agents.alphazero.BoopNNet import BoopNNet
from packages.boop_agents.alphazero.utils import dotdict


def export_to_onnx(checkpoint_path: str, output_path: str):
    """
    Load a trained checkpoint and export it to ONNX format.
    
    Args:
        checkpoint_path: Path to the .pth.tar checkpoint file
        output_path: Path where the .onnx file will be saved
    """
    # Initialize game to get dimensions
    game = Game()
    
    # Model args (must match training args)
    args = dotdict({
        'num_channels': 128,
        'dropout': 0.3,
    })
    
    # Create model
    model = BoopNNet(game, args)
    
    # Load checkpoint
    print(f"Loading checkpoint from {checkpoint_path}...")
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    model.load_state_dict(checkpoint['state_dict'])
    model.eval()
    
    # Create dummy input matching expected shape
    # Input: (batch_size, channels, height, width) = (1, 9, 6, 6)
    dummy_input = torch.zeros(1, 9, 6, 6, dtype=torch.float32)
    
    # Export to ONNX
    print(f"Exporting to ONNX format...")
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=['board_state'],
        output_names=['policy', 'value'],
        dynamic_axes={
            'board_state': {0: 'batch_size'},
            'policy': {0: 'batch_size'},
            'value': {0: 'batch_size'},
        }
    )
    
    print(f"✓ Model exported successfully to {output_path}")
    
    # Verify the exported model
    try:
        import onnx
        onnx_model = onnx.load(output_path)
        onnx.checker.check_model(onnx_model)
        print("✓ ONNX model validation passed")
        
        # Print model info
        print(f"\nModel info:")
        print(f"  Input: board_state with shape (batch, 9, 6, 6)")
        print(f"  Output 1: policy with shape (batch, {game.getActionSize()})")
        print(f"  Output 2: value with shape (batch, 1)")
        print(f"  Action space size: {game.getActionSize()}")
        
    except ImportError:
        print("Note: Install 'onnx' package to validate the exported model")
    except Exception as e:
        print(f"Warning: ONNX validation failed: {e}")
    
    # Test with ONNX Runtime if available
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(output_path)
        
        # Run inference with dummy input
        test_input = np.zeros((1, 9, 6, 6), dtype=np.float32)
        policy, value = session.run(None, {'board_state': test_input})
        
        print(f"\n✓ ONNX Runtime test passed")
        print(f"  Test policy shape: {policy.shape}")
        print(f"  Test value shape: {value.shape}")
        
    except ImportError:
        print("\nNote: Install 'onnxruntime' package to test inference")
    except Exception as e:
        print(f"\nWarning: ONNX Runtime test failed: {e}")


def main():
    # Default paths
    default_checkpoint = "temp/best.pth.tar"
    default_output = "packages/boop_web/public/model.onnx"
    
    # Parse arguments
    checkpoint_path = sys.argv[1] if len(sys.argv) > 1 else default_checkpoint
    output_path = sys.argv[2] if len(sys.argv) > 2 else default_output
    
    if not os.path.exists(checkpoint_path):
        print(f"Error: Checkpoint not found at {checkpoint_path}")
        print(f"\nUsage: python {sys.argv[0]} [checkpoint_path] [output_path]")
        sys.exit(1)
    
    export_to_onnx(checkpoint_path, output_path)


if __name__ == "__main__":
    main()
