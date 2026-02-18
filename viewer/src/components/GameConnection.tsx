/**
 * GameConnection.tsx - Minecraft Bedrock Connection Status & Sync Component
 * 
 * Displays connection status to the Minecraft client and provides controls
 * for syncing blueprints, managing layer mode, and viewing progress.
 */

import { useState, useEffect, useCallback } from 'react';
import { useBlueprintStore } from '../store/blueprintStore';
import { 
  blueprintSync, 
  type SyncStatus, 
  type ConnectionStatus 
} from '../lib/ws/blueprintSync';

export function GameConnection() {
  const { blocks, size, name } = useBlueprintStore();
  
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Subscribe to connection status changes
  useEffect(() => {
    const unsubConnection = blueprintSync.onConnectionChange((status) => {
      setConnectionStatus(status);
      if (status === 'error') {
        setLastError('Connection failed - is the server running?');
      } else {
        setLastError(null);
      }
    });

    const unsubStatus = blueprintSync.onStatusChange((status) => {
      setSyncStatus(status);
    });

    return () => {
      unsubConnection();
      unsubStatus();
    };
  }, []);

  // Start polling
  const handleStartPolling = useCallback(() => {
    setIsPolling(true);
    blueprintSync.startPolling(1000);
  }, []);

  // Stop polling
  const handleStopPolling = useCallback(() => {
    setIsPolling(false);
    blueprintSync.stopPolling();
  }, []);

  // Auto-start polling on mount
  useEffect(() => {
    handleStartPolling();
    return () => {
      blueprintSync.stopPolling();
    };
  }, [handleStartPolling]);

  // Sync current blueprint to Minecraft
  const handleSyncBlueprint = async () => {
    if (blocks.length === 0) {
      setLastError('No blueprint loaded to sync');
      return;
    }

    setIsSyncing(true);
    setLastError(null);

    const result = await blueprintSync.loadBlueprint(
      name || 'Blueprint',
      blocks,
      size
    );

    setIsSyncing(false);

    if (!result.success) {
      setLastError(result.error || 'Sync failed');
    }
  };

  // Clear blueprint in Minecraft
  const handleClearBlueprint = async () => {
    const result = await blueprintSync.clearBlueprint();
    if (!result.success) {
      setLastError(result.error || 'Failed to clear');
    }
  };

  // Update layer mode
  const handleLayerChange = async (delta: number) => {
    if (!syncStatus) return;
    
    const newLayer = Math.max(0, syncStatus.layerMode.currentY + delta);
    await blueprintSync.setLayerMode({ currentY: newLayer });
  };

  const handleToggleLayerMode = async () => {
    if (!syncStatus) return;
    await blueprintSync.setLayerMode({ enabled: !syncStatus.layerMode.enabled });
  };

  // Get connection status color
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // Calculate progress percentage
  const progressPercent = syncStatus?.progress 
    ? Math.round((syncStatus.progress.placedBlocks / Math.max(1, syncStatus.progress.totalBlocks)) * 100)
    : 0;

  return (
    <div className="absolute top-4 right-4 z-10">
      {/* Compact Connection Status */}
      <div className="bg-slate-800/90 backdrop-blur rounded-xl shadow-xl overflow-hidden">
        {/* Header - always visible */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`} />
            
            <div className="text-left">
              <div className="text-white font-medium text-sm">
                {connectionStatus === 'connected' 
                  ? `${syncStatus?.clientCount || 0} player${(syncStatus?.clientCount || 0) !== 1 ? 's' : ''} connected`
                  : connectionStatus === 'connecting'
                  ? 'Connecting...'
                  : 'Minecraft Sync'
                }
              </div>
              {syncStatus?.activeBlueprint && (
                <div className="text-gray-400 text-xs">
                  {syncStatus.activeBlueprint.name} • {progressPercent}%
                </div>
              )}
            </div>
          </div>
          
          <svg 
            className={`w-4 h-4 text-gray-400 transition-transform ${showDetails ? 'rotate-180' : ''}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded details */}
        {showDetails && (
          <div className="px-4 pb-4 border-t border-slate-700">
            {/* Error message */}
            {lastError && (
              <div className="mt-3 p-2 bg-red-500/20 border border-red-500/50 rounded-lg">
                <p className="text-red-400 text-xs">{lastError}</p>
              </div>
            )}

            {/* Connected clients */}
            {syncStatus?.clients && syncStatus.clients.length > 0 && (
              <div className="mt-3">
                <h4 className="text-gray-400 text-xs font-semibold mb-2">CONNECTED PLAYERS</h4>
                <div className="space-y-1">
                  {syncStatus.clients.map((client, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-white">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      <span>{client.playerName || 'Unknown'}</span>
                      <span className="text-gray-500 text-xs">({client.dimension})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sync controls */}
            <div className="mt-4 space-y-2">
              <button
                onClick={handleSyncBlueprint}
                disabled={blocks.length === 0 || isSyncing || connectionStatus !== 'connected'}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isSyncing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync to Minecraft
                  </>
                )}
              </button>

              {syncStatus?.activeBlueprint && (
                <button
                  onClick={handleClearBlueprint}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 px-3 rounded-lg transition-colors"
                >
                  Clear Blueprint
                </button>
              )}
            </div>

            {/* Layer mode controls */}
            {syncStatus?.activeBlueprint && (
              <div className="mt-4">
                <h4 className="text-gray-400 text-xs font-semibold mb-2">LAYER MODE</h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleLayerMode}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      syncStatus.layerMode.enabled
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                    }`}
                  >
                    {syncStatus.layerMode.enabled ? 'ON' : 'OFF'}
                  </button>
                  
                  {syncStatus.layerMode.enabled && (
                    <>
                      <button
                        onClick={() => handleLayerChange(-1)}
                        className="w-8 h-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="text-white text-sm font-mono min-w-[3rem] text-center">
                        Y={syncStatus.layerMode.currentY}
                      </span>
                      <button
                        onClick={() => handleLayerChange(1)}
                        className="w-8 h-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center justify-center"
                      >
                        +
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Progress bar */}
            {syncStatus?.activeBlueprint && syncStatus.progress.totalBlocks > 0 && (
              <div className="mt-4">
                <h4 className="text-gray-400 text-xs font-semibold mb-2">BUILD PROGRESS</h4>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-gray-400">
                  <span>{syncStatus.progress.placedBlocks} placed</span>
                  <span>{syncStatus.progress.totalBlocks - syncStatus.progress.placedBlocks} remaining</span>
                </div>
                {syncStatus.progress.wrongBlocks > 0 && (
                  <p className="text-red-400 text-xs mt-1">
                    ⚠️ {syncStatus.progress.wrongBlocks} wrong blocks
                  </p>
                )}
              </div>
            )}

            {/* Connection toggle */}
            <div className="mt-4 pt-3 border-t border-slate-700">
              <button
                onClick={isPolling ? handleStopPolling : handleStartPolling}
                className="text-gray-400 hover:text-white text-xs transition-colors"
              >
                {isPolling ? '⏸ Pause sync' : '▶ Resume sync'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
