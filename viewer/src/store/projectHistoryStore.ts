/**
 * projectHistoryStore.ts - Persistent storage for saved blueprint projects
 * 
 * Stores projects in localStorage so users can:
 * - Save analyzed blueprints
 * - View project history
 * - Reload previous projects
 * - Delete old projects
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Block, Size3D } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface SavedProject {
  id: string;
  name: string;
  createdAt: number;           // Unix timestamp
  updatedAt: number;           // Unix timestamp
  source: 'video' | 'image' | 'file' | 'manual';
  sourceDetails?: string;      // e.g., YouTube URL, filename
  thumbnail?: string;          // Base64 data URL of preview image
  blockCount: number;
  size: Size3D;
  blocks: Block[];
  notes?: string;
}

export interface ProjectHistoryState {
  projects: SavedProject[];
  
  // Actions
  saveProject: (project: Omit<SavedProject, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateProject: (id: string, updates: Partial<Omit<SavedProject, 'id' | 'createdAt'>>) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => SavedProject | undefined;
  clearAllProjects: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Maximum number of projects to keep (older ones are auto-deleted)
const MAX_PROJECTS = 50;

// Maximum blocks to store per project (to avoid localStorage limits)
const MAX_BLOCKS_PER_PROJECT = 100000;

// ============================================================================
// STORE
// ============================================================================

export const useProjectHistoryStore = create<ProjectHistoryState>()(
  persist(
    (set, get) => ({
      projects: [],
      
      saveProject: (projectData) => {
        const id = generateId();
        const now = Date.now();
        
        // Limit blocks to avoid localStorage size limits
        const blocks = projectData.blocks.slice(0, MAX_BLOCKS_PER_PROJECT);
        
        const newProject: SavedProject = {
          ...projectData,
          id,
          createdAt: now,
          updatedAt: now,
          blocks,
          blockCount: projectData.blocks.length,
        };
        
        set((state) => {
          // Add new project at the beginning
          let updatedProjects = [newProject, ...state.projects];
          
          // Enforce max projects limit (remove oldest)
          if (updatedProjects.length > MAX_PROJECTS) {
            updatedProjects = updatedProjects.slice(0, MAX_PROJECTS);
          }
          
          return { projects: updatedProjects };
        });
        
        console.log(`[ProjectHistory] Saved project: ${newProject.name} (${blocks.length} blocks)`);
        return id;
      },
      
      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: Date.now() }
              : p
          ),
        }));
      },
      
      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        }));
        console.log(`[ProjectHistory] Deleted project: ${id}`);
      },
      
      getProject: (id) => {
        return get().projects.find((p) => p.id === id);
      },
      
      clearAllProjects: () => {
        set({ projects: [] });
        console.log('[ProjectHistory] Cleared all projects');
      },
    }),
    {
      name: 'blueprint-project-history',
      version: 1,
      // Only persist certain fields to avoid localStorage limits
      partialize: (state) => ({
        projects: state.projects.map((p) => ({
          ...p,
          // Store thumbnail at lower quality if present
          thumbnail: p.thumbnail?.substring(0, 5000) || undefined,
        })),
      }),
    }
  )
);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Formats a timestamp as a human-readable relative time
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Formats block count with K/M suffix
 */
export function formatBlockCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
}
