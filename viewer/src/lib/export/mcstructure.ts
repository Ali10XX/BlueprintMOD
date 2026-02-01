import type { Block, Size3D } from '../../types';

// NBT Writer for Bedrock Edition (little-endian)
class NBTWriter {
  private chunks: Uint8Array[] = [];

  private writeByte(value: number): void {
    this.chunks.push(new Uint8Array([value & 0xff]));
  }

  private writeShort(value: number): void {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  private writeInt(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  private writeLong(value: number): void {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(0, value >>> 0, true);
    view.setInt32(4, Math.floor(value / 0x100000000), true);
    this.chunks.push(new Uint8Array(buf));
  }

  private writeFloat(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  private writeDouble(value: number): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  private writeString(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.writeShort(bytes.length);
    this.chunks.push(bytes);
  }

  private writeByteArray(arr: number[]): void {
    this.writeInt(arr.length);
    this.chunks.push(new Uint8Array(arr.map(v => v & 0xff)));
  }

  private writeIntArray(arr: number[]): void {
    this.writeInt(arr.length);
    for (const val of arr) {
      this.writeInt(val);
    }
  }

  private writeLongArray(arr: number[]): void {
    this.writeInt(arr.length);
    for (const val of arr) {
      this.writeLong(val);
    }
  }

  private writeTag(name: string, value: unknown): void {
    const tagType = this.getTagType(value);
    this.writeByte(tagType);
    this.writeString(name);
    this.writeTagPayload(value, tagType);
  }

  private writeTagPayload(value: unknown, tagType: number): void {
    switch (tagType) {
      case 1: // Byte
        this.writeByte(value as number);
        break;
      case 2: // Short
        this.writeShort(value as number);
        break;
      case 3: // Int
        this.writeInt(value as number);
        break;
      case 4: // Long
        this.writeLong(value as number);
        break;
      case 5: // Float
        this.writeFloat(value as number);
        break;
      case 6: // Double
        this.writeDouble(value as number);
        break;
      case 7: // Byte Array
        this.writeByteArray(value as number[]);
        break;
      case 8: // String
        this.writeString(value as string);
        break;
      case 9: // List
        this.writeList(value as unknown[]);
        break;
      case 10: // Compound
        this.writeCompound(value as Record<string, unknown>);
        break;
      case 11: // Int Array
        this.writeIntArray(value as number[]);
        break;
      case 12: // Long Array
        this.writeLongArray(value as number[]);
        break;
    }
  }

  private writeList(arr: unknown[]): void {
    if (arr.length === 0) {
      this.writeByte(0); // End tag type for empty list
      this.writeInt(0);
      return;
    }

    const itemType = this.getTagType(arr[0]);
    this.writeByte(itemType);
    this.writeInt(arr.length);

    for (const item of arr) {
      this.writeTagPayload(item, itemType);
    }
  }

  private writeCompound(obj: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        this.writeTag(key, value);
      }
    }
    this.writeByte(0); // End tag
  }

  private getTagType(value: unknown): number {
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (value >= -128 && value <= 127) return 1; // Byte
        if (value >= -32768 && value <= 32767) return 2; // Short
        if (value >= -2147483648 && value <= 2147483647) return 3; // Int
        return 4; // Long
      }
      return 5; // Float (could also be double)
    }
    if (typeof value === 'string') return 8;
    if (Array.isArray(value)) {
      if (value.length === 0) return 9;
      if (typeof value[0] === 'number' && value.every(v => Number.isInteger(v))) {
        // Check if it fits in int array
        if (value.every(v => v >= -2147483648 && v <= 2147483647)) {
          return 11; // Int Array
        }
        return 12; // Long Array
      }
      return 9; // List
    }
    if (typeof value === 'object' && value !== null) return 10; // Compound
    return 0;
  }

  writeRoot(name: string, value: Record<string, unknown>): Uint8Array {
    // Bedrock NBT header (8 bytes: version + length placeholder)
    const header = new Uint8Array(8);
    const headerView = new DataView(header.buffer);
    headerView.setInt32(0, 8, true); // NBT version
    // Length will be filled after

    this.chunks = [];
    this.writeByte(10); // Compound tag
    this.writeString(name);
    this.writeCompound(value);

    // Calculate total length
    let totalLength = 0;
    for (const chunk of this.chunks) {
      totalLength += chunk.length;
    }

    // Set length in header
    headerView.setInt32(4, totalLength, true);

    // Combine all chunks
    const result = new Uint8Array(8 + totalLength);
    result.set(header, 0);

    let offset = 8;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }
}

interface BlockPaletteEntry {
  name: string;
  states: Record<string, unknown>;
  version: number;
}

export function exportMCStructure(
  blocks: Block[],
  size: Size3D,
  _name: string = 'structure'
): Uint8Array {
  // Build palette
  const blockTypes = ['minecraft:air', ...new Set(blocks.map(b => b.type))];
  const palette: BlockPaletteEntry[] = blockTypes.map(type => ({
    name: type,
    states: {},
    version: 18100737, // Bedrock 1.20 block version
  }));

  const paletteIndex = new Map<string, number>();
  blockTypes.forEach((type, i) => paletteIndex.set(type, i));

  // Build block indices (YZX order as per Bedrock spec)
  const totalBlocks = size.x * size.y * size.z;
  const blockIndices = new Array(totalBlocks).fill(-1); // -1 means air
  const waterlogIndices = new Array(totalBlocks).fill(-1);

  // Create lookup for block positions
  const blockLookup = new Map<string, Block>();
  for (const block of blocks) {
    blockLookup.set(`${block.x},${block.y},${block.z}`, block);
  }

  // Fill indices in YZX order
  for (let y = 0; y < size.y; y++) {
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++) {
        const index = y * size.z * size.x + z * size.x + x;
        const block = blockLookup.get(`${x},${y},${z}`);

        if (block) {
          blockIndices[index] = paletteIndex.get(block.type) ?? 0;
        } else {
          blockIndices[index] = 0; // Air
        }
        waterlogIndices[index] = -1;
      }
    }
  }

  // Construct NBT data
  const nbtData = {
    format_version: 1,
    size: [size.x, size.y, size.z],
    structure_world_origin: [0, 0, 0],
    structure: {
      block_indices: [blockIndices, waterlogIndices],
      entities: [],
      palette: {
        default: {
          block_palette: palette,
          block_position_data: {},
        },
      },
    },
  };

  const writer = new NBTWriter();
  return writer.writeRoot('', nbtData);
}

export function downloadMCStructure(
  blocks: Block[],
  size: Size3D,
  name: string = 'structure'
): void {
  const data = exportMCStructure(blocks, size, name);
  // Copy to regular ArrayBuffer for Blob compatibility
  const buffer = new ArrayBuffer(data.length);
  new Uint8Array(buffer).set(data);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.mcstructure`;
  a.click();

  URL.revokeObjectURL(url);
}
