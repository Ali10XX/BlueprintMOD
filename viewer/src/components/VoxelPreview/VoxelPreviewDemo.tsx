/**
 * VoxelPreviewDemo.tsx
 *
 * Demo page showcasing the VoxelPreview component with a procedurally generated
 * Al-Shaheed (Martyr's) Monument blueprint.
 * Supports multi-variant monument generation via a palette dropdown.
 */

import { useCallback, useMemo, useState } from 'react';
import { VoxelPreview } from './VoxelPreview';
import { generateAlShaheedLikeBlueprint } from '../../tools/generateMonumentBlueprint';
import { exportToMcStructure, downloadMcStructure } from '../../tools/exportMcStructure';
import { MONUMENT_VARIANTS, type VariantKey } from '../../tools/monumentVariants';

// ============================================================================
// DEMO COMPONENT
// ============================================================================

export function VoxelPreviewDemo() {
  const [scale, setScale] = useState(1);
  const [showJson, setShowJson] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [variantKey, setVariantKey] = useState<VariantKey>('copper');

  // Regenerate blueprint whenever the selected variant changes.
  // generateAlShaheedLikeBlueprint is synchronous and runs in ~50ms.
  const blueprint = useMemo(
    () => generateAlShaheedLikeBlueprint(true, MONUMENT_VARIANTS[variantKey]),
    [variantKey],
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const bytes = await exportToMcStructure(blueprint);
      downloadMcStructure(bytes);
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }, [blueprint]);

  return (
    <div className="w-full h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <div className="bg-slate-800/95 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            VoxelPreview Demo
          </h1>
          <p className="text-sm text-gray-400">
            Procedural Al-Shaheed Monument • {blueprint.slices.length} slices
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {/* Monument Variant dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400 whitespace-nowrap">Monument Variant:</label>
            <select
              value={variantKey}
              onChange={(e) => setVariantKey(e.target.value as VariantKey)}
              className="bg-slate-700 text-white text-sm rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              {Object.entries(MONUMENT_VARIANTS).map(([key, v]) => (
                <option key={key} value={key}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Scale control */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Scale:</label>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-24 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <span className="text-sm text-cyan-300 font-mono w-12">{scale.toFixed(1)}x</span>
          </div>

          {/* Export .mcstructure button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export .mcstructure'}
          </button>

          {/* Show JSON button */}
          <button
            onClick={() => setShowJson(!showJson)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showJson
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            {showJson ? 'Hide JSON' : 'View JSON'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Preview */}
        <div className={`flex-1 ${showJson ? 'w-1/2' : 'w-full'}`}>
          <VoxelPreview
            blueprint={blueprint}
            scale={scale}
            centerByDefault={true}
          />
        </div>

        {/* JSON Panel */}
        {showJson && (
          <div className="w-1/2 bg-slate-900 border-l border-slate-700 overflow-auto">
            <div className="p-4">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">Blueprint JSON</h3>
              <p className="text-sm text-gray-400 mb-2">
                Generated {blueprint.slices.length} slices • {blueprint.dimensions_estimate?.width}×{blueprint.dimensions_estimate?.depth}×{blueprint.dimensions_estimate?.height}
              </p>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-[calc(100vh-200px)] overflow-auto">
                {JSON.stringify(blueprint, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VoxelPreviewDemo;
