"""
MCSTRUCTURE TO BLUEPRINT CONVERTER
===================================
Converts Minecraft Bedrock .mcstructure files to compressed JSON for the Blueprint add-on.

USAGE:
    python convert_structure.py myhouse.mcstructure

OUTPUT:
    Creates myhouse.json - copy contents into blueprints.js

REQUIREMENTS:
    pip install nbtlib

HOW TO GET .MCSTRUCTURE FILES:
    1. In Minecraft, use a Structure Block (give yourself one with /give @s structure_block)
    2. Set it to "Save" mode
    3. Define the area and save
    4. File is saved to: com.mojang/structures/
"""

import sys
import json
import gzip
import struct
from pathlib import Path

def read_mcstructure(filepath):
    """
    Parse a .mcstructure file (NBT format with little-endian encoding).
    Returns the block data as a dictionary.
    """
    try:
        # Try using nbtlib if available
        import nbtlib
        from nbtlib import File

        # mcstructure uses little-endian NBT
        nbt_file = nbtlib.load(filepath, gzipped=False, byteorder='little')
        return parse_nbt_structure(nbt_file)
    except ImportError:
        print("nbtlib not found. Install with: pip install nbtlib")
        print("Falling back to manual parsing...")
        return parse_mcstructure_manual(filepath)

def parse_nbt_structure(nbt_data):
    """Extract block data from parsed NBT structure."""
    blocks = []

    # Get structure data
    structure = nbt_data.get('structure', nbt_data)

    # Get size
    size = structure.get('size', [0, 0, 0])
    size_x, size_y, size_z = int(size[0]), int(size[1]), int(size[2])

    # Get block palette (list of block types)
    palette = structure.get('palette', {}).get('default', {}).get('block_palette', [])
    block_names = []
    for block in palette:
        name = str(block.get('name', 'minecraft:air'))
        block_names.append(name)

    # Get block indices
    indices = structure.get('palette', {}).get('default', {}).get('block_position_data', {})
    block_indices = structure.get('block_indices', [[]])

    if len(block_indices) > 0 and len(block_indices[0]) > 0:
        layer = block_indices[0]  # First layer contains the block indices

        idx = 0
        for y in range(size_y):
            for z in range(size_z):
                for x in range(size_x):
                    if idx < len(layer):
                        block_idx = int(layer[idx])
                        if block_idx >= 0 and block_idx < len(block_names):
                            block_type = block_names[block_idx]
                            # Skip air blocks
                            if block_type != 'minecraft:air':
                                blocks.append({
                                    'x': x,
                                    'y': y,
                                    'z': z,
                                    't': block_type
                                })
                    idx += 1

    return {
        'size': {'x': size_x, 'y': size_y, 'z': size_z},
        'blocks': blocks
    }

def parse_mcstructure_manual(filepath):
    """
    Manual parsing fallback for .mcstructure files.
    This is a simplified parser - may not work for all structures.
    """
    print("Manual parsing not fully implemented. Please install nbtlib:")
    print("  pip install nbtlib")
    sys.exit(1)

def compress_blocks(blocks):
    """
    Compress block data using multiple techniques:
    1. Create a palette of unique block types (short IDs instead of full names)
    2. Use run-length encoding for consecutive same blocks
    3. Store positions as deltas where possible
    """
    if not blocks:
        return {'palette': [], 'data': []}

    # Create palette - map full block names to short indices
    unique_types = list(set(b['t'] for b in blocks))
    palette = {name: idx for idx, name in enumerate(unique_types)}

    # Sort blocks by position for better compression
    sorted_blocks = sorted(blocks, key=lambda b: (b['y'], b['z'], b['x']))

    # Encode blocks as [x, y, z, type_index]
    # Use run-length encoding for same block types
    compressed = []

    i = 0
    while i < len(sorted_blocks):
        block = sorted_blocks[i]
        type_idx = palette[block['t']]

        # Count consecutive blocks of same type in a row (same Y and Z, incrementing X)
        run_length = 1
        while (i + run_length < len(sorted_blocks)):
            next_block = sorted_blocks[i + run_length]
            if (next_block['t'] == block['t'] and
                next_block['y'] == block['y'] and
                next_block['z'] == block['z'] and
                next_block['x'] == block['x'] + run_length):
                run_length += 1
            else:
                break

        if run_length > 2:
            # Use run-length encoding: [x, y, z, type_idx, -run_length]
            # Negative number indicates RLE
            compressed.append([block['x'], block['y'], block['z'], type_idx, -run_length])
        else:
            # Store individual blocks
            for j in range(run_length):
                b = sorted_blocks[i + j]
                compressed.append([b['x'], b['y'], b['z'], type_idx])

        i += run_length

    return {
        'palette': unique_types,
        'data': compressed
    }

def main():
    if len(sys.argv) < 2:
        print("Usage: python convert_structure.py <structure_file.mcstructure>")
        print("\nThis converts .mcstructure files to compressed JSON for the Blueprint add-on.")
        sys.exit(1)

    input_file = Path(sys.argv[1])

    if not input_file.exists():
        print(f"Error: File not found: {input_file}")
        sys.exit(1)

    print(f"Reading: {input_file}")

    # Parse the structure
    structure_data = read_mcstructure(input_file)

    size = structure_data['size']
    blocks = structure_data['blocks']

    print(f"Size: {size['x']}x{size['y']}x{size['z']}")
    print(f"Blocks: {len(blocks)} (excluding air)")

    # Check size limits
    if size['x'] > 100 or size['y'] > 100 or size['z'] > 100:
        print(f"Warning: Structure exceeds 100x100x100 limit!")
        print("The structure will be truncated.")
        blocks = [b for b in blocks if b['x'] < 100 and b['y'] < 100 and b['z'] < 100]

    # Compress the data
    compressed = compress_blocks(blocks)

    # Create output
    output = {
        'name': input_file.stem,
        'size': size,
        'blockCount': len(blocks),
        'palette': compressed['palette'],
        'data': compressed['data']
    }

    # Write JSON
    output_file = input_file.with_suffix('.json')
    with open(output_file, 'w') as f:
        json.dump(output, f, separators=(',', ':'))  # Compact JSON

    # Calculate sizes
    original_size = len(json.dumps(structure_data))
    compressed_size = output_file.stat().st_size

    print(f"\nOutput: {output_file}")
    print(f"Size: {compressed_size:,} bytes ({compressed_size/1024:.1f} KB)")
    print(f"Compression: {(1 - compressed_size/original_size)*100:.1f}% smaller")

    print(f"\n--- NEXT STEPS ---")
    print(f"1. Open {output_file}")
    print(f"2. Copy the entire contents")
    print(f"3. Paste into blueprint_bp/scripts/blueprints.js")
    print(f"   Format: export const BLUEPRINTS = {{ '{input_file.stem}': <paste here> }};")

if __name__ == '__main__':
    main()
