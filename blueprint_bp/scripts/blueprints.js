// ============================================================================
// BLUEPRINTS DATA FILE
// ============================================================================
// Paste your converted blueprints here.
// Use the Python converter: python convert_structure.py yourfile.mcstructure
//
// FORMAT:
// {
//   "name": "my_house",
//   "size": {"x": 10, "y": 8, "z": 10},
//   "blockCount": 245,
//   "palette": ["minecraft:stone", "minecraft:oak_planks", ...],
//   "data": [[x, y, z, paletteIndex], [x, y, z, paletteIndex, -runLength], ...]
// }
//
// Run-length encoding: if 5th element is negative, it means repeat that block
// for that many positions along the X axis.
// ============================================================================

export const BLUEPRINTS = {
    // EXAMPLE - Delete this and paste your converted structures:
    "example_tower": {
        "name": "example_tower",
        "size": { "x": 5, "y": 10, "z": 5 },
        "blockCount": 40,
        "palette": ["minecraft:stone_bricks", "minecraft:oak_planks", "minecraft:glass"],
        "data": [
            // Floor (stone bricks) - using run-length encoding
            [0, 0, 0, 0, -5],  // 5 stone bricks in a row
            [0, 0, 1, 0, -5],
            [0, 0, 2, 0, -5],
            [0, 0, 3, 0, -5],
            [0, 0, 4, 0, -5],
            // Walls (just corners for simplicity)
            [0, 1, 0, 0], [4, 1, 0, 0], [0, 1, 4, 0], [4, 1, 4, 0],
            [0, 2, 0, 0], [4, 2, 0, 0], [0, 2, 4, 0], [4, 2, 4, 0],
            [0, 3, 0, 0], [4, 3, 0, 0], [0, 3, 4, 0], [4, 3, 4, 0],
            // Windows (glass)
            [2, 2, 0, 2], [2, 2, 4, 2], [0, 2, 2, 2], [4, 2, 2, 2]
        ]
    }

    // ADD YOUR BLUEPRINTS BELOW:
    // "my_house": { paste converted JSON here },
    // "my_castle": { paste converted JSON here },
};
