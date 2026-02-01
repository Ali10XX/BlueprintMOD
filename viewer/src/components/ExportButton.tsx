import { useBlueprintStore } from '../store/blueprintStore';
import { downloadMCStructure } from '../lib/export/mcstructure';

export function ExportButton() {
  const { blocks, size, name } = useBlueprintStore();

  if (blocks.length === 0) {
    return null;
  }

  const handleExport = () => {
    downloadMCStructure(blocks, size, name || 'structure');
  };

  const handleExportJSON = () => {
    // Create compressed JSON format (same as converter)
    const uniqueTypes = [...new Set(blocks.map(b => b.type))];
    const paletteMap = new Map(uniqueTypes.map((t, i) => [t, i]));

    // Sort blocks for better compression
    const sorted = [...blocks].sort((a, b) =>
      a.y - b.y || a.z - b.z || a.x - b.x
    );

    // Compress with RLE
    const compressed: number[][] = [];
    let i = 0;

    while (i < sorted.length) {
      const block = sorted[i];
      const typeIdx = paletteMap.get(block.type)!;

      let runLength = 1;
      while (i + runLength < sorted.length) {
        const next = sorted[i + runLength];
        if (next.type === block.type &&
            next.y === block.y &&
            next.z === block.z &&
            next.x === block.x + runLength) {
          runLength++;
        } else {
          break;
        }
      }

      if (runLength > 2) {
        compressed.push([block.x, block.y, block.z, typeIdx, -runLength]);
      } else {
        for (let j = 0; j < runLength; j++) {
          const b = sorted[i + j];
          compressed.push([b.x, b.y, b.z, typeIdx]);
        }
      }

      i += runLength;
    }

    const output = {
      name: name || 'blueprint',
      size,
      blockCount: blocks.length,
      palette: uniqueTypes,
      data: compressed
    };

    const jsonStr = JSON.stringify(output);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'blueprint'}.json`;
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute bottom-4 right-4 flex gap-2">
      <button
        onClick={handleExport}
        className="bg-green-500 hover:bg-green-600 text-black font-bold py-2 px-4 rounded-lg shadow-xl transition-colors"
      >
        Export .mcstructure
      </button>
      <button
        onClick={handleExportJSON}
        className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg shadow-xl transition-colors"
      >
        Export JSON
      </button>
    </div>
  );
}
