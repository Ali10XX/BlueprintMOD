import { useState, useEffect, useCallback } from 'react';
import { Scene } from './components/VoxelViewer/Scene';
import { VideoAnalyzer } from './components/VideoAnalyzer';
import { MaterialsList } from './components/MaterialsList';
import { ExportButton } from './components/ExportButton';
import { GameConnection } from './components/GameConnection';
import { ProjectHistory } from './components/ProjectHistory';
import { useBlueprintStore } from './store/blueprintStore';
import { useProjectHistoryStore } from './store/projectHistoryStore';
import type { Block, Size3D } from './types';

// NBT Reader for drag-drop file support
class NBTReader {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.offset = 0;
  }

  readByte(): number { return this.view.getInt8(this.offset++); }
  readShort(): number { const val = this.view.getInt16(this.offset, true); this.offset += 2; return val; }
  readInt(): number { const val = this.view.getInt32(this.offset, true); this.offset += 4; return val; }
  readLong(): number { const low = this.view.getUint32(this.offset, true); const high = this.view.getInt32(this.offset + 4, true); this.offset += 8; return high * 0x100000000 + low; }
  readFloat(): number { const val = this.view.getFloat32(this.offset, true); this.offset += 4; return val; }
  readDouble(): number { const val = this.view.getFloat64(this.offset, true); this.offset += 8; return val; }

  readString(): string {
    const length = this.readShort();
    if (length < 0 || length > 32767) throw new Error(`Invalid string length: ${length}`);
    const bytes = new Uint8Array(this.buffer, this.offset, length);
    this.offset += length;
    return new TextDecoder('utf-8').decode(bytes);
  }

  readByteArray(): number[] { const length = this.readInt(); const arr = new Int8Array(this.buffer, this.offset, length); this.offset += length; return Array.from(arr); }
  readIntArray(): number[] { const length = this.readInt(); const arr: number[] = []; for (let i = 0; i < length; i++) arr.push(this.readInt()); return arr; }
  readLongArray(): number[] { const length = this.readInt(); const arr: number[] = []; for (let i = 0; i < length; i++) arr.push(this.readLong()); return arr; }

  readTag(tagType: number): unknown {
    switch (tagType) {
      case 0: return null; case 1: return this.readByte(); case 2: return this.readShort();
      case 3: return this.readInt(); case 4: return this.readLong(); case 5: return this.readFloat();
      case 6: return this.readDouble(); case 7: return this.readByteArray(); case 8: return this.readString();
      case 9: return this.readList(); case 10: return this.readCompound();
      case 11: return this.readIntArray(); case 12: return this.readLongArray();
      default: throw new Error(`Unknown tag type: ${tagType}`);
    }
  }

  readList(): unknown[] { const itemType = this.readByte(); const length = this.readInt(); const arr: unknown[] = []; for (let i = 0; i < length; i++) arr.push(this.readTag(itemType)); return arr; }

  readCompound(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    while (true) { const tagType = this.readByte(); if (tagType === 0) break; const name = this.readString(); obj[name] = this.readTag(tagType); }
    return obj;
  }

  parse(): Record<string, unknown> {
    const firstByte = this.view.getUint8(0);
    if (firstByte !== 10) { for (let i = 0; i < Math.min(16, this.buffer.byteLength); i++) { if (this.view.getUint8(i) === 10) { this.offset = i; break; } } }
    const rootType = this.readByte();
    if (rootType !== 10) throw new Error('Invalid NBT: Root must be TAG_Compound');
    this.readString();
    return this.readCompound();
  }
}

function parseStructure(nbt: Record<string, unknown>): { blocks: Block[]; size: Size3D } {
  const blocks: Block[] = [];
  const structure = (nbt.structure || nbt) as Record<string, unknown>;
  const sizeArr = (structure.size || [0, 0, 0]) as number[];
  const sizeX = sizeArr[0] || 0, sizeY = sizeArr[1] || 0, sizeZ = sizeArr[2] || 0;
  const palette = ((structure.palette as Record<string, unknown>)?.default as Record<string, unknown>)?.block_palette as Array<Record<string, unknown>> || [];
  const blockNames = palette.map(b => (b.name as string) || 'minecraft:air');
  const blockIndices = (structure.block_indices || [[]]) as number[][];
  const layer = blockIndices[0] || [];
  let idx = 0;
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        if (idx < layer.length) { const blockIdx = layer[idx]; if (blockIdx >= 0 && blockIdx < blockNames.length) { const blockType = blockNames[blockIdx]; if (blockType !== 'minecraft:air') blocks.push({ x, y, z, type: blockType }); } }
        idx++;
      }
    }
  }
  return { size: { x: sizeX, y: sizeY, z: sizeZ }, blocks };
}

function parseJSONBlueprint(data: { name?: string; size?: { x: number; y: number; z: number }; palette?: string[]; data?: number[][]; }): { blocks: Block[]; size: Size3D; name: string } {
  const blocks: Block[] = [];
  const palette = data.palette || [];
  const size = data.size || { x: 0, y: 0, z: 0 };
  for (const entry of data.data || []) {
    const x = entry[0], y = entry[1], z = entry[2], typeIdx = entry[3];
    const blockType = palette[typeIdx];
    if (entry.length > 4 && entry[4] < 0) { const runLength = -entry[4]; for (let i = 0; i < runLength; i++) blocks.push({ x: x + i, y, z, type: blockType }); }
    else blocks.push({ x, y, z, type: blockType });
  }
  return { blocks, size, name: data.name || 'Blueprint' };
}

function App() {
  const { setBlocks, blocks, name, size, clearBlocks } = useBlueprintStore();
  const { saveProject, projects } = useProjectHistoryStore();
  const [showProjectHistory, setShowProjectHistory] = useState(false);

  const processFile = useCallback(async (file: File) => {
    try {
      if (file.name.endsWith('.mcstructure')) {
        const buffer = await file.arrayBuffer();
        const reader = new NBTReader(buffer);
        const nbt = reader.parse();
        const result = parseStructure(nbt);
        if (result.blocks.length > 0) {
          const projectName = file.name.replace('.mcstructure', '');
          setBlocks(result.blocks, result.size, projectName);
          
          // Save to project history
          saveProject({
            name: projectName,
            source: 'file',
            sourceDetails: file.name,
            blockCount: result.blocks.length,
            size: result.size,
            blocks: result.blocks,
          });
        }
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        const result = parseJSONBlueprint(data);
        if (result.blocks.length > 0) {
          setBlocks(result.blocks, result.size, result.name);
          
          // Save to project history
          saveProject({
            name: result.name,
            source: 'file',
            sourceDetails: file.name,
            blockCount: result.blocks.length,
            size: result.size,
            blocks: result.blocks,
          });
        }
      }
    } catch (err) {
      console.error('Failed to parse file:', err);
    }
  }, [setBlocks, saveProject]);

  // Global drag-drop handler
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && (file.name.endsWith('.mcstructure') || file.name.endsWith('.json'))) {
        processFile(file);
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => { window.removeEventListener('dragover', handleDragOver); window.removeEventListener('drop', handleDrop); };
  }, [processFile]);

  const hasBlocks = blocks.length > 0;

  return (
    <div className="w-full h-full">
      <Scene />

      {/* Video analyzer (shows when no blocks) */}
      <VideoAnalyzer />

      {/* Blueprint info bar (shows when blocks loaded) */}
      {hasBlocks && (
        <div className="absolute top-4 left-4 z-10 bg-slate-800/90 backdrop-blur rounded-xl p-4 text-white shadow-xl">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="font-bold text-green-400">{name}</h3>
              <p className="text-sm text-gray-400">
                {size.x}×{size.y}×{size.z} • {blocks.length.toLocaleString()} blocks
              </p>
            </div>
            <button
              onClick={clearBlocks}
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm py-1 px-3 rounded transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <MaterialsList />
      <ExportButton />
      <GameConnection />

      {/* Saved Projects Button - Always visible */}
      <button
        onClick={() => setShowProjectHistory(true)}
        className="absolute bottom-4 left-4 z-20 bg-slate-800/90 backdrop-blur hover:bg-slate-700 text-white rounded-xl px-4 py-3 shadow-xl transition-colors flex items-center gap-3"
      >
        <span className="text-xl">📚</span>
        <div className="text-left">
          <span className="font-medium">Saved Projects</span>
          {projects.length > 0 && (
            <span className="text-xs text-gray-400 ml-2">({projects.length})</span>
          )}
        </div>
      </button>

      {/* Project History Modal */}
      <ProjectHistory 
        isOpen={showProjectHistory} 
        onClose={() => setShowProjectHistory(false)} 
      />

      {/* Drop hint overlay */}
      {!hasBlocks && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-gray-500 text-sm pointer-events-none">
          Drop .mcstructure or .json files anywhere
        </div>
      )}
    </div>
  );
}

export default App;
