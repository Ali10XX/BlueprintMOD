import { useEffect, useCallback } from 'react';
import { useBlueprintStore } from '../../store/blueprintStore';

export function LayerControls() {
  const { slice, setSliceAxis, setSliceLayer, setSliceMode, size } = useBlueprintStore();

  const maxLayer = slice.maxLayers[slice.axis];
  const hasBlocks = size.x > 0 && size.y > 0 && size.z > 0;

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!hasBlocks) return;

    switch (e.key) {
      case '1':
        setSliceAxis('x');
        break;
      case '2':
        setSliceAxis('y');
        break;
      case '3':
        setSliceAxis('z');
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSliceLayer(slice.layer + 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSliceLayer(slice.layer - 1);
        break;
      case 'Home':
        setSliceLayer(0);
        break;
      case 'End':
        setSliceLayer(maxLayer);
        break;
      case 'a':
        setSliceMode('all');
        break;
      case 's':
        setSliceMode('single');
        break;
      case 'r':
        setSliceMode('range');
        break;
    }
  }, [hasBlocks, slice.layer, maxLayer, setSliceAxis, setSliceLayer, setSliceMode]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!hasBlocks) {
    return null;
  }

  return (
    <div className="absolute top-4 right-4 bg-slate-800/90 backdrop-blur rounded-xl p-4 w-64 text-white shadow-xl">
      <h3 className="text-lg font-bold mb-4 text-green-400">Layer Controls</h3>

      {/* Axis Selection */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-2">Axis (1/2/3)</label>
        <div className="flex gap-2">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <button
              key={axis}
              onClick={() => setSliceAxis(axis)}
              className={`flex-1 py-2 px-3 rounded-lg font-bold transition-colors ${
                slice.axis === axis
                  ? 'bg-green-500 text-black'
                  : 'bg-slate-700 hover:bg-slate-600'
              }`}
            >
              {axis.toUpperCase()} <span className="text-xs opacity-60">({i + 1})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mode Selection */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-2">Mode (A/S/R)</label>
        <div className="flex gap-2">
          <button
            onClick={() => setSliceMode('all')}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors ${
              slice.mode === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setSliceMode('range')}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors ${
              slice.mode === 'range'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            Range
          </button>
          <button
            onClick={() => setSliceMode('single')}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors ${
              slice.mode === 'single'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            Single
          </button>
        </div>
      </div>

      {/* Layer Slider */}
      {slice.mode !== 'all' && (
        <div className="mb-4">
          <label className="text-sm text-gray-400 block mb-2">
            Layer {slice.axis.toUpperCase()}: {slice.layer} / {maxLayer}
          </label>
          <input
            type="range"
            min={0}
            max={maxLayer}
            value={slice.layer}
            onChange={(e) => setSliceLayer(Number(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between mt-2 gap-2">
            <button
              onClick={() => setSliceLayer(0)}
              className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600 text-sm"
            >
              Start
            </button>
            <div className="flex gap-1">
              <button
                onClick={() => setSliceLayer(slice.layer - 1)}
                disabled={slice.layer <= 0}
                className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ◀
              </button>
              <button
                onClick={() => setSliceLayer(slice.layer + 1)}
                disabled={slice.layer >= maxLayer}
                className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ▶
              </button>
            </div>
            <button
              onClick={() => setSliceLayer(maxLayer)}
              className="px-3 py-1 bg-slate-700 rounded hover:bg-slate-600 text-sm"
            >
              End
            </button>
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="text-xs text-gray-500 border-t border-slate-700 pt-3 mt-2">
        <div className="flex justify-between mb-1">
          <span>Navigate layers:</span>
          <span className="font-mono">↑ ↓</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Jump to start/end:</span>
          <span className="font-mono">Home / End</span>
        </div>
      </div>
    </div>
  );
}
