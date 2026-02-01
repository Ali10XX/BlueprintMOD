import { useState, useCallback } from 'react';
import { useBlueprintStore } from '../store/blueprintStore';
import type { Block, Size3D } from '../types';

// Simple NBT reader for .mcstructure files (little-endian)
class NBTReader {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.offset = 0;
  }

  readByte(): number {
    return this.view.getInt8(this.offset++);
  }

  readShort(): number {
    const val = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readInt(): number {
    const val = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readLong(): number {
    const low = this.view.getUint32(this.offset, true);
    const high = this.view.getInt32(this.offset + 4, true);
    this.offset += 8;
    return high * 0x100000000 + low;
  }

  readFloat(): number {
    const val = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readDouble(): number {
    const val = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readString(): string {
    const length = this.readShort();
    if (length < 0 || length > 32767) {
      throw new Error(`Invalid string length: ${length}`);
    }
    const bytes = new Uint8Array(this.buffer, this.offset, length);
    this.offset += length;
    return new TextDecoder('utf-8').decode(bytes);
  }

  readByteArray(): number[] {
    const length = this.readInt();
    const arr = new Int8Array(this.buffer, this.offset, length);
    this.offset += length;
    return Array.from(arr);
  }

  readIntArray(): number[] {
    const length = this.readInt();
    const arr: number[] = [];
    for (let i = 0; i < length; i++) {
      arr.push(this.readInt());
    }
    return arr;
  }

  readLongArray(): number[] {
    const length = this.readInt();
    const arr: number[] = [];
    for (let i = 0; i < length; i++) {
      arr.push(this.readLong());
    }
    return arr;
  }

  readTag(tagType: number): unknown {
    switch (tagType) {
      case 0: return null;
      case 1: return this.readByte();
      case 2: return this.readShort();
      case 3: return this.readInt();
      case 4: return this.readLong();
      case 5: return this.readFloat();
      case 6: return this.readDouble();
      case 7: return this.readByteArray();
      case 8: return this.readString();
      case 9: return this.readList();
      case 10: return this.readCompound();
      case 11: return this.readIntArray();
      case 12: return this.readLongArray();
      default:
        throw new Error(`Unknown tag type: ${tagType}`);
    }
  }

  readList(): unknown[] {
    const itemType = this.readByte();
    const length = this.readInt();
    const arr: unknown[] = [];
    for (let i = 0; i < length; i++) {
      arr.push(this.readTag(itemType));
    }
    return arr;
  }

  readCompound(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    while (true) {
      const tagType = this.readByte();
      if (tagType === 0) break;
      const name = this.readString();
      obj[name] = this.readTag(tagType);
    }
    return obj;
  }

  parse(): Record<string, unknown> {
    const firstByte = this.view.getUint8(0);

    if (firstByte !== 10) {
      for (let i = 0; i < Math.min(16, this.buffer.byteLength); i++) {
        if (this.view.getUint8(i) === 10) {
          this.offset = i;
          break;
        }
      }
    }

    const rootType = this.readByte();
    if (rootType !== 10) {
      throw new Error('Invalid NBT: Root must be TAG_Compound');
    }
    this.readString(); // root name
    return this.readCompound();
  }
}

function parseStructure(nbt: Record<string, unknown>): { blocks: Block[]; size: Size3D } {
  const blocks: Block[] = [];

  const structure = (nbt.structure || nbt) as Record<string, unknown>;
  const sizeArr = (structure.size || [0, 0, 0]) as number[];
  const sizeX = sizeArr[0] || 0;
  const sizeY = sizeArr[1] || 0;
  const sizeZ = sizeArr[2] || 0;

  const palette = ((structure.palette as Record<string, unknown>)?.default as Record<string, unknown>)?.block_palette as Array<Record<string, unknown>> || [];
  const blockNames = palette.map(b => (b.name as string) || 'minecraft:air');

  const blockIndices = (structure.block_indices || [[]]) as number[][];
  const layer = blockIndices[0] || [];

  let idx = 0;
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        if (idx < layer.length) {
          const blockIdx = layer[idx];
          if (blockIdx >= 0 && blockIdx < blockNames.length) {
            const blockType = blockNames[blockIdx];
            if (blockType !== 'minecraft:air') {
              blocks.push({ x, y, z, type: blockType });
            }
          }
        }
        idx++;
      }
    }
  }

  return {
    size: { x: sizeX, y: sizeY, z: sizeZ },
    blocks
  };
}

// Parse JSON blueprint format (from the converter)
function parseJSONBlueprint(data: {
  name?: string;
  size?: { x: number; y: number; z: number };
  palette?: string[];
  data?: number[][];
}): { blocks: Block[]; size: Size3D; name: string } {
  const blocks: Block[] = [];
  const palette = data.palette || [];
  const size = data.size || { x: 0, y: 0, z: 0 };

  for (const entry of data.data || []) {
    const x = entry[0];
    const y = entry[1];
    const z = entry[2];
    const typeIdx = entry[3];
    const blockType = palette[typeIdx];

    if (entry.length > 4 && entry[4] < 0) {
      const runLength = -entry[4];
      for (let i = 0; i < runLength; i++) {
        blocks.push({ x: x + i, y, z, type: blockType });
      }
    } else {
      blocks.push({ x, y, z, type: blockType });
    }
  }

  return { blocks, size, name: data.name || 'Blueprint' };
}

export function FileUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setBlocks, blocks, name, size } = useBlueprintStore();

  const processFile = useCallback(async (file: File) => {
    setError(null);

    try {
      if (file.name.endsWith('.mcstructure')) {
        const buffer = await file.arrayBuffer();
        const reader = new NBTReader(buffer);
        const nbt = reader.parse();
        const result = parseStructure(nbt);

        if (result.blocks.length === 0) {
          throw new Error('No blocks found in structure');
        }

        setBlocks(result.blocks, result.size, file.name.replace('.mcstructure', ''));
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        const result = parseJSONBlueprint(data);

        if (result.blocks.length === 0) {
          throw new Error('No blocks found in JSON');
        }

        setBlocks(result.blocks, result.size, result.name);
      } else {
        throw new Error('Unsupported file type. Use .mcstructure or .json');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }, [setBlocks]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const hasBlueprint = blocks.length > 0;

  return (
    <div className="absolute top-4 left-4 z-10">
      {!hasBlueprint ? (
        <div
          className={`bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl transition-all ${
            isDragging ? 'ring-2 ring-green-400 scale-105' : ''
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <h2 className="text-xl font-bold text-green-400 mb-2">Blueprint Viewer</h2>
          <p className="text-gray-400 text-sm mb-4">
            Drop a .mcstructure or .json file here
          </p>

          <label className="block">
            <span className="bg-green-500 hover:bg-green-600 text-black font-bold py-2 px-4 rounded-lg cursor-pointer inline-block transition-colors">
              Choose File
            </span>
            <input
              type="file"
              accept=".mcstructure,.json"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>

          {error && (
            <p className="mt-3 text-red-400 text-sm">{error}</p>
          )}
        </div>
      ) : (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-4 text-white shadow-xl">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="font-bold text-green-400">{name}</h3>
              <p className="text-sm text-gray-400">
                {size.x}×{size.y}×{size.z} • {blocks.length.toLocaleString()} blocks
              </p>
            </div>
            <label className="ml-4">
              <span className="bg-slate-700 hover:bg-slate-600 text-white text-sm py-1 px-3 rounded cursor-pointer transition-colors">
                Load New
              </span>
              <input
                type="file"
                accept=".mcstructure,.json"
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
          </div>
          {error && (
            <p className="mt-2 text-red-400 text-sm">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
