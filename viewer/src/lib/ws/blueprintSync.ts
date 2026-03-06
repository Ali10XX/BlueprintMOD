/**
 * blueprintSync.ts - WebSocket client for syncing blueprints with Minecraft Bedrock
 * 
 * This module provides a React-friendly interface for real-time synchronization
 * between the viewer app and Minecraft Bedrock clients via the WebSocket server.
 */

import type { Block, Size3D } from '../../types';

// ============================================================================
// TYPES
// ============================================================================

/** WebSocket connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Message types from server */
export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

/** Connected Minecraft client info */
export interface MinecraftClient {
  playerName: string | null;
  dimension: string | null;
  connectedAt: number;
}

/** Blueprint sync status from server */
export interface SyncStatus {
  connected: boolean;
  clientCount: number;
  clients: MinecraftClient[];
  activeBlueprint: {
    name: string;
    blockCount: number;
    size: Size3D;
  } | null;
  layerMode: {
    enabled: boolean;
    currentY: number;
    showBelow: boolean;
  };
  progress: {
    totalBlocks: number;
    placedBlocks: number;
    wrongBlocks: number;
  };
}

/** Callback types for event handling */
export type StatusCallback = (status: SyncStatus) => void;
export type ConnectionCallback = (status: ConnectionStatus) => void;

// ============================================================================
// API CLIENT
// ============================================================================

const API_BASE = 'http://localhost:3001';

/**
 * BlueprintSyncClient - Manages communication with the WebSocket server
 * via HTTP API endpoints (the actual WebSocket is between server and Minecraft)
 */
class BlueprintSyncClient {
  private statusCallbacks: Set<StatusCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  // @ts-ignore - NodeJS.Timeout type only available in Node environment
  private pollInterval: NodeJS.Timeout | null = null;
  private lastStatus: SyncStatus | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';

  /**
   * Starts polling for sync status updates
   * @param intervalMs - Poll interval in milliseconds (default: 1000)
   */
  startPolling(intervalMs: number = 1000): void {
    if (this.pollInterval) {
      console.log('[BlueprintSync] blueprintSync.ts: Already polling');
      return;
    }

    console.log('[BlueprintSync] blueprintSync.ts: Starting status polling');
    this.setConnectionStatus('connecting');

    // Initial fetch
    this.fetchStatus();

    // Set up interval
    this.pollInterval = setInterval(() => {
      this.fetchStatus();
    }, intervalMs);
  }

  /**
   * Stops polling for status updates
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[BlueprintSync] blueprintSync.ts: Stopped polling');
    }
    this.setConnectionStatus('disconnected');
  }

  /**
   * Fetches current sync status from server
   */
  private async fetchStatus(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/api/blueprint/status`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const status: SyncStatus = await response.json();
      this.lastStatus = status;
      this.setConnectionStatus('connected');
      
      // Notify all listeners
      for (const callback of this.statusCallbacks) {
        callback(status);
      }
    } catch (error) {
      console.error('[BlueprintSync] blueprintSync.ts: Failed to fetch status:', error);
      this.setConnectionStatus('error');
    }
  }

  /**
   * Updates connection status and notifies listeners
   */
  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      for (const callback of this.connectionCallbacks) {
        callback(status);
      }
    }
  }

  /**
   * Subscribe to status updates
   * @param callback - Function to call when status changes
   * @returns Unsubscribe function
   */
  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    
    // Send current status immediately if available
    if (this.lastStatus) {
      callback(this.lastStatus);
    }
    
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to connection status changes
   * @param callback - Function to call when connection status changes
   * @returns Unsubscribe function
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    callback(this.connectionStatus);
    
    return () => {
      this.connectionCallbacks.delete(callback);
    };
  }

  /**
   * Gets the current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Gets the last known sync status
   */
  getLastStatus(): SyncStatus | null {
    return this.lastStatus;
  }

  // ========== BLUEPRINT API METHODS ==========

  /**
   * Loads a blueprint and syncs to all connected Minecraft clients
   * @param name - Blueprint name
   * @param blocks - Array of blocks
   * @param size - Blueprint dimensions
   * @param anchor - World position anchor (optional)
   */
  async loadBlueprint(
    name: string,
    blocks: Block[],
    size: Size3D,
    anchor?: { x: number; y: number; z: number }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[BlueprintSync] blueprintSync.ts: Loading blueprint "${name}" with ${blocks.length} blocks`);
      
      const response = await fetch(`${API_BASE}/api/blueprint/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          blocks,
          size,
          anchor: anchor || { x: 0, y: 0, z: 0 },
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to load blueprint');
      }

      console.log(`[BlueprintSync] blueprintSync.ts: Blueprint loaded, ${result.connectedClients} clients notified`);
      
      // Refresh status
      await this.fetchStatus();
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BlueprintSync] blueprintSync.ts: Failed to load blueprint:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Clears the active blueprint
   */
  async clearBlueprint(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/blueprint/clear`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to clear blueprint');
      }

      console.log('[BlueprintSync] blueprintSync.ts: Blueprint cleared');
      await this.fetchStatus();
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Moves the blueprint anchor position
   * @param anchor - New anchor position
   */
  async moveBlueprint(anchor: { x: number; y: number; z: number }): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/blueprint/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchor }),
      });

      if (!response.ok) {
        throw new Error('Failed to move blueprint');
      }

      console.log(`[BlueprintSync] blueprintSync.ts: Blueprint moved to ${anchor.x}, ${anchor.y}, ${anchor.z}`);
      await this.fetchStatus();
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Updates layer mode settings
   * @param settings - Layer mode configuration
   */
  async setLayerMode(settings: {
    enabled?: boolean;
    currentY?: number;
    showBelow?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/blueprint/layer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to update layer mode');
      }

      console.log('[BlueprintSync] blueprintSync.ts: Layer mode updated:', settings);
      await this.fetchStatus();
      
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/** Singleton instance for app-wide use */
export const blueprintSync = new BlueprintSyncClient();

// Export class for testing/custom instances
export { BlueprintSyncClient };
