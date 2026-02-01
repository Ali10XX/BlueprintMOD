import { useMemo } from 'react';
import { useBlueprintStore } from '../store/blueprintStore';
import { getBlockDisplayName, getBlockCategory } from '../lib/minecraft/blocks';

interface MaterialItem {
  type: string;
  displayName: string;
  count: number;
  stacks: number;
  remainder: number;
  category: string;
}

export function MaterialsList() {
  const { blocks, name } = useBlueprintStore();

  const materials = useMemo(() => {
    const counts = new Map<string, number>();

    for (const block of blocks) {
      counts.set(block.type, (counts.get(block.type) || 0) + 1);
    }

    const items: MaterialItem[] = [];

    for (const [type, count] of counts) {
      items.push({
        type,
        displayName: getBlockDisplayName(type),
        count,
        stacks: Math.floor(count / 64),
        remainder: count % 64,
        category: getBlockCategory(type),
      });
    }

    // Sort by count (descending)
    items.sort((a, b) => b.count - a.count);

    return items;
  }, [blocks]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, MaterialItem[]>();

    for (const item of materials) {
      if (!groups.has(item.category)) {
        groups.set(item.category, []);
      }
      groups.get(item.category)!.push(item);
    }

    return groups;
  }, [materials]);

  const totalBlocks = blocks.length;
  const uniqueTypes = materials.length;

  const downloadCSV = () => {
    const rows = [
      ['Block Type', 'Display Name', 'Count', 'Stacks', 'Remainder', 'Category'],
      ...materials.map(m => [
        m.type,
        m.displayName,
        m.count.toString(),
        m.stacks.toString(),
        m.remainder.toString(),
        m.category
      ])
    ];

    const csv = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'blueprint'}_materials.csv`;
    a.click();

    URL.revokeObjectURL(url);
  };

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-4 bg-slate-800/90 backdrop-blur rounded-xl p-4 w-80 max-h-96 overflow-hidden text-white shadow-xl flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold text-green-400">Materials</h3>
        <button
          onClick={downloadCSV}
          className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-3 text-sm">
        <div className="bg-slate-700/50 px-3 py-1 rounded">
          <span className="text-gray-400">Total:</span>{' '}
          <span className="font-bold">{totalBlocks.toLocaleString()}</span>
        </div>
        <div className="bg-slate-700/50 px-3 py-1 rounded">
          <span className="text-gray-400">Types:</span>{' '}
          <span className="font-bold">{uniqueTypes}</span>
        </div>
      </div>

      {/* Materials list */}
      <div className="overflow-y-auto flex-1 pr-2 space-y-3">
        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category}>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
              {category} ({items.reduce((sum, i) => sum + i.count, 0)})
            </h4>
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.type}
                  className="flex justify-between items-center bg-slate-700/50 rounded px-2 py-1 text-sm"
                >
                  <span className="truncate flex-1" title={item.type}>
                    {item.displayName}
                  </span>
                  <span className="text-gray-400 ml-2 whitespace-nowrap">
                    {item.count}
                    {item.stacks > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        ({item.stacks}×64{item.remainder > 0 ? `+${item.remainder}` : ''})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
