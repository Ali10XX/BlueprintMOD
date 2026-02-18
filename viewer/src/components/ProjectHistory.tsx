/**
 * ProjectHistory.tsx - Displays saved blueprint projects
 * 
 * Features:
 * - List of all saved projects with thumbnails
 * - Click to load a project
 * - Delete projects
 * - Search/filter projects
 */

import { useState, useMemo } from 'react';
import { 
  useProjectHistoryStore, 
  formatRelativeTime, 
  formatBlockCount,
  type SavedProject 
} from '../store/projectHistoryStore';
import { useBlueprintStore } from '../store/blueprintStore';

interface ProjectHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectHistory({ isOpen, onClose }: ProjectHistoryProps) {
  const { projects, deleteProject, clearAllProjects } = useProjectHistoryStore();
  const { setBlocks, name: currentName } = useBlueprintStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Filter projects by search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    
    const query = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.sourceDetails?.toLowerCase().includes(query) ||
        p.notes?.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  // Load a project into the viewer
  const handleLoadProject = (project: SavedProject) => {
    setBlocks(project.blocks, project.size, project.name);
    onClose();
  };

  // Delete a project with confirmation
  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      deleteProject(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  // Clear all projects with confirmation
  const handleClearAll = () => {
    if (confirmClearAll) {
      clearAllProjects();
      setConfirmClearAll(false);
    } else {
      setConfirmClearAll(true);
      setTimeout(() => setConfirmClearAll(false), 3000);
    }
  };

  // Get source icon
  const getSourceIcon = (source: SavedProject['source']) => {
    switch (source) {
      case 'video': return '📹';
      case 'image': return '🖼️';
      case 'file': return '📄';
      default: return '📦';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">📚</span>
            Saved Projects
            {projects.length > 0 && (
              <span className="text-sm text-gray-400 font-normal">
                ({projects.length})
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search & Actions */}
        {projects.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-700 flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full bg-slate-700 rounded-lg px-4 py-2 pl-10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              onClick={handleClearAll}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                confirmClearAll
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              {confirmClearAll ? 'Confirm Clear All?' : 'Clear All'}
            </button>
          </div>
        )}

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-4">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="text-5xl mb-4">📭</span>
              <p className="text-lg font-medium mb-2">No saved projects yet</p>
              <p className="text-sm text-center max-w-sm">
                Analyze a video or import a blueprint file, and it will automatically be saved here.
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="text-4xl mb-4">🔍</span>
              <p className="text-lg font-medium">No projects match "{searchQuery}"</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className={`bg-slate-700/50 hover:bg-slate-700 rounded-xl p-4 transition-colors cursor-pointer group ${
                    currentName === project.name ? 'ring-2 ring-purple-500' : ''
                  }`}
                  onClick={() => handleLoadProject(project)}
                >
                  <div className="flex gap-4">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-20 h-20 bg-slate-600 rounded-lg overflow-hidden flex items-center justify-center">
                      {project.thumbnail ? (
                        <img
                          src={project.thumbnail}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl">{getSourceIcon(project.source)}</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-white truncate">
                            {project.name}
                          </h3>
                          <p className="text-sm text-gray-400 flex items-center gap-2">
                            <span>{getSourceIcon(project.source)}</span>
                            <span>{formatRelativeTime(project.createdAt)}</span>
                          </p>
                        </div>
                        
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(project.id);
                          }}
                          className={`p-2 rounded-lg transition-colors ${
                            confirmDelete === project.id
                              ? 'bg-red-600 text-white'
                              : 'text-gray-400 hover:text-red-400 hover:bg-slate-600 opacity-0 group-hover:opacity-100'
                          }`}
                          title={confirmDelete === project.id ? 'Click again to confirm' : 'Delete project'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {/* Stats */}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        <span className="bg-slate-600 px-2 py-1 rounded text-gray-300">
                          {formatBlockCount(project.blockCount)} blocks
                        </span>
                        <span className="bg-slate-600 px-2 py-1 rounded text-gray-300">
                          {project.size.x}×{project.size.y}×{project.size.z}
                        </span>
                        {project.sourceDetails && (
                          <span className="bg-slate-600 px-2 py-1 rounded text-gray-300 truncate max-w-[150px]" title={project.sourceDetails}>
                            {project.sourceDetails}
                          </span>
                        )}
                      </div>

                      {/* Notes */}
                      {project.notes && (
                        <p className="mt-2 text-xs text-gray-400 line-clamp-2">
                          {project.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Current indicator */}
                  {currentName === project.name && (
                    <div className="mt-3 pt-3 border-t border-slate-600">
                      <span className="text-xs text-purple-400 font-medium flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Currently loaded
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 text-xs text-gray-500">
          Projects are stored locally in your browser. Maximum {50} projects, oldest are auto-removed.
        </div>
      </div>
    </div>
  );
}
