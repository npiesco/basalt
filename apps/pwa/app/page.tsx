'use client';

import React, { useState, useEffect, useRef } from 'react';
import { initBasaltDb } from '../lib/db/client';

interface Note {
  note_id: string;
  title: string;
  body: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Folder {
  folder_id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function HomePage(): JSX.Element {
  const [db, setDb] = useState<any>(null);
  const dbRef = useRef<any>(null); // Ref to hold database for cleanup handlers
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('root');
  const [error, setError] = useState<string | null>(null);

  // Folder management state
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [deleteFolderConfirmId, setDeleteFolderConfirmId] = useState<string | null>(null);
  const [deleteFolderConfirmName, setDeleteFolderConfirmName] = useState('');

  // Edit state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  // Delete confirmation state
  const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('');

  // Initialize database on mount
  useEffect(() => {
    async function initializeDatabase() {
      try {
        console.log('[PWA] Initializing database...');

        const database = await initBasaltDb('basalt-vault-main');

        console.log('[PWA] Database initialized successfully');
        setDb(database);
        dbRef.current = database; // Store in ref for cleanup handlers

        // Expose database to window for E2E testing
        if (typeof window !== 'undefined') {
          const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
          (window as any).basaltDb = {
            executeQuery: async (sql: string, params: any[]) => {
              return executeQuery(database, sql, params);
            }
          };
        }

        // Ensure root folder exists
        const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

        // Try to get or create root folder
        const rootFolderResult = await executeQuery(
          database,
          'SELECT folder_id FROM folders WHERE folder_id = ?',
          ['root']
        );

        if (rootFolderResult.rows.length === 0) {
          const now = new Date().toISOString();
          await executeQuery(
            database,
            'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            ['root', '/', null, now, now]
          );
          // CRITICAL: Persist to IndexedDB
          await database.sync();
          console.log('[PWA] Created root folder');
        }

        // Load existing notes and folders
        await loadNotes(database);
        await loadFolders(database);

        setIsReady(true);
        console.log('[PWA] App ready');
      } catch (err) {
        console.error('[PWA] Failed to initialize database:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    initializeDatabase();

    // CRITICAL: Close database on page unload to ensure IndexedDB persistence
    // Based on MultiTabDatabase wrapper pattern (line 32-38)
    const handleBeforeUnload = () => {
      console.log('[PWA] Page unloading, closing database for persistence');
      if (dbRef.current) {
        dbRef.current.close().catch((err: Error) => {
          console.error('[PWA] Error closing database on unload:', err);
        });
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // Cleanup on component unmount
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      if (dbRef.current) {
        console.log('[PWA] Component unmounting, closing database');
        dbRef.current.close().catch((err: Error) => {
          console.error('[PWA] Error closing database on unmount:', err);
        });
      }
    };
  }, []); // Empty deps - only run once on mount

  async function loadNotes(database: any) {
    try {
      // Import executeQuery helper that handles ColumnValue conversion
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      const result = await executeQuery(
        database,
        'SELECT note_id, title, body, folder_id, created_at, updated_at FROM notes ORDER BY updated_at DESC',
        []
      );

      const noteList: Note[] = result.rows.map((row: any) => {
        const note: any = {};
        result.columns.forEach((col: string, idx: number) => {
          const value = row.values[idx];
          note[col] = value.type === 'Null' ? null : value.value;
        });
        return note as Note;
      });

      setNotes(noteList);
      console.log('[PWA] Loaded notes:', noteList.length);
    } catch (err) {
      console.error('[PWA] Failed to load notes:', err);
    }
  }

  async function loadFolders(database: any) {
    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      const result = await executeQuery(
        database,
        'SELECT folder_id, name, parent_folder_id, created_at, updated_at FROM folders ORDER BY name ASC',
        []
      );

      const folderList: Folder[] = result.rows.map((row: any) => {
        const folder: any = {};
        result.columns.forEach((col: string, idx: number) => {
          const value = row.values[idx];
          folder[col] = value.type === 'Null' ? null : value.value;
        });
        return folder as Folder;
      });

      setFolders(folderList);
      console.log('[PWA] Loaded folders:', folderList.length);
    } catch (err) {
      console.error('[PWA] Failed to load folders:', err);
    }
  }

  async function handleCreateFolder() {
    if (!db) {
      setError('Database not initialized');
      return;
    }

    if (!newFolderName.trim()) {
      setError('Folder name cannot be empty');
      return;
    }

    try {
      console.log('[PWA] Creating folder:', newFolderName);

      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      const folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [folderId, newFolderName, 'root', now, now]
      );

      // CRITICAL: Persist to IndexedDB
      await db.sync();
      console.log('[PWA] Folder created successfully:', folderId);

      // Clear input
      setNewFolderName('');
      setError(null);

      // Reload folders
      await loadFolders(db);
    } catch (err) {
      console.error('[PWA] Failed to create folder:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleRenameClick(folder: Folder) {
    console.log('[PWA] Rename requested for folder:', folder.folder_id);
    setRenameFolderId(folder.folder_id);
    setRenameFolderName(folder.name);
  }

  async function handleConfirmRename() {
    if (!db || !renameFolderId) return;

    if (!renameFolderName.trim()) {
      setError('Folder name cannot be empty');
      return;
    }

    try {
      console.log('[PWA] Renaming folder:', renameFolderId, 'to', renameFolderName);

      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const now = new Date().toISOString();

      await executeQuery(
        db,
        'UPDATE folders SET name = ?, updated_at = ? WHERE folder_id = ?',
        [renameFolderName, now, renameFolderId]
      );

      // CRITICAL: Persist to IndexedDB
      await db.sync();
      console.log('[PWA] Folder renamed successfully');

      // Clear rename state
      setRenameFolderId(null);
      setRenameFolderName('');
      setError(null);

      // Reload folders
      await loadFolders(db);
    } catch (err) {
      console.error('[PWA] Failed to rename folder:', err);
      setError(err instanceof Error ? err.message : String(err));
      setRenameFolderId(null);
      setRenameFolderName('');
    }
  }

  function handleCancelRename() {
    console.log('[PWA] Rename canceled');
    setRenameFolderId(null);
    setRenameFolderName('');
  }

  function handleDeleteFolderClick(folder: Folder) {
    console.log('[PWA] Delete requested for folder:', folder.folder_id);
    setDeleteFolderConfirmId(folder.folder_id);
    setDeleteFolderConfirmName(folder.name);
  }

  async function handleConfirmFolderDelete() {
    if (!db || !deleteFolderConfirmId) return;

    try {
      console.log('[PWA] Deleting folder:', deleteFolderConfirmId);

      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      // Delete folder (CASCADE will delete notes in this folder)
      await executeQuery(
        db,
        'DELETE FROM folders WHERE folder_id = ?',
        [deleteFolderConfirmId]
      );

      // CRITICAL: Persist to IndexedDB
      await db.sync();
      console.log('[PWA] Folder deleted successfully');

      // Clear delete confirmation state
      setDeleteFolderConfirmId(null);
      setDeleteFolderConfirmName('');
      setError(null);

      // If the deleted folder was selected, switch to root
      if (selectedFolderId === deleteFolderConfirmId) {
        setSelectedFolderId('root');
      }

      // Reload folders and notes
      await loadFolders(db);
      await loadNotes(db);
    } catch (err) {
      console.error('[PWA] Failed to delete folder:', err);
      setError(err instanceof Error ? err.message : String(err));
      setDeleteFolderConfirmId(null);
      setDeleteFolderConfirmName('');
    }
  }

  function handleCancelFolderDelete() {
    console.log('[PWA] Folder delete canceled');
    setDeleteFolderConfirmId(null);
    setDeleteFolderConfirmName('');
  }

  async function handleCreateNote() {
    if (!db) {
      setError('Database not initialized');
      return;
    }

    if (!newNoteTitle.trim()) {
      setError('Note title cannot be empty');
      return;
    }

    try {
      console.log('[PWA] Creating note:', newNoteTitle);

      // Import executeQuery helper that handles ColumnValue conversion
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        'INSERT INTO notes (note_id, title, body, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [noteId, newNoteTitle, '', selectedFolderId, now, now]
      );

      // CRITICAL: Persist to IndexedDB
      console.log('[PWA] Syncing to IndexedDB...');
      await db.sync();
      console.log('[PWA] Sync complete! Note created successfully:', noteId);

      // Clear input
      setNewNoteTitle('');
      setError(null);

      // Reload notes
      await loadNotes(db);
    } catch (err) {
      console.error('[PWA] Failed to create note:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleEditNote(note: Note) {
    console.log('[PWA] Editing note:', note.note_id);
    setEditingNoteId(note.note_id);
    setEditTitle(note.title);
    setEditBody(note.body || '');
    setError(null);
  }

  async function handleSaveEdit() {
    if (!db || !editingNoteId) {
      setError('Cannot save - no note being edited');
      return;
    }

    if (!editTitle.trim()) {
      setError('Note title cannot be empty');
      return;
    }

    try {
      console.log('[PWA] Saving note:', editingNoteId);

      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      const now = new Date().toISOString();

      await executeQuery(
        db,
        'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE note_id = ?',
        [editTitle, editBody, now, editingNoteId]
      );

      // CRITICAL: Persist to IndexedDB
      await db.sync();
      console.log('[PWA] Note updated successfully');

      // Close edit mode
      setEditingNoteId(null);
      setEditTitle('');
      setEditBody('');
      setError(null);

      // Reload notes
      await loadNotes(db);
    } catch (err) {
      console.error('[PWA] Failed to update note:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleCancelEdit() {
    console.log('[PWA] Canceling edit');
    setEditingNoteId(null);
    setEditTitle('');
    setEditBody('');
    setError(null);
  }

  function handleDeleteClick(note: Note, event: React.MouseEvent) {
    // Stop event propagation so clicking delete doesn't trigger edit
    event.stopPropagation();
    console.log('[PWA] Delete requested for note:', note.note_id);
    setDeleteConfirmNoteId(note.note_id);
    setDeleteConfirmTitle(note.title);
  }

  async function handleConfirmDelete() {
    if (!db || !deleteConfirmNoteId) {
      setError('Cannot delete - no note selected');
      return;
    }

    try {
      console.log('[PWA] Deleting note:', deleteConfirmNoteId);

      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      await executeQuery(
        db,
        'DELETE FROM notes WHERE note_id = ?',
        [deleteConfirmNoteId]
      );

      // CRITICAL: Persist to IndexedDB
      await db.sync();
      console.log('[PWA] Note deleted successfully');

      // Close confirmation dialog
      setDeleteConfirmNoteId(null);
      setDeleteConfirmTitle('');

      // If we were editing this note, close edit mode
      if (editingNoteId === deleteConfirmNoteId) {
        setEditingNoteId(null);
        setEditTitle('');
        setEditBody('');
      }

      setError(null);

      // Reload notes
      await loadNotes(db);
    } catch (err) {
      console.error('[PWA] Failed to delete note:', err);
      setError(err instanceof Error ? err.message : String(err));
      setDeleteConfirmNoteId(null);
      setDeleteConfirmTitle('');
    }
  }

  function handleCancelDelete() {
    console.log('[PWA] Delete canceled');
    setDeleteConfirmNoteId(null);
    setDeleteConfirmTitle('');
  }

  if (error && !isReady) {
    return (
      <div className="min-h-screen bg-red-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-red-700 mb-4">Error</h1>
          <div className="bg-white p-6 rounded-lg shadow border border-red-200">
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-100 p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100" data-testid="app-ready">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Basalt</h1>
          <p className="text-gray-600">Your local-first knowledge base</p>
        </header>

        {/* Error Display */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Folder Management Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Folders</h2>

          {/* Create Folder */}
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              data-testid="folder-name-input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFolder();
                }
              }}
              placeholder="Enter folder name..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              data-testid="create-folder-button"
              onClick={handleCreateFolder}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
            >
              Create Folder
            </button>
          </div>

          {/* Folder List */}
          <div className="space-y-2">
            {folders.map((folder) => (
              <div
                key={folder.folder_id}
                data-testid="folder-item"
                className="p-3 border border-gray-200 rounded-lg bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 font-medium">📁 {folder.name}</span>
                  {folder.folder_id !== 'root' && (
                    <div className="flex gap-2">
                      <button
                        data-testid="rename-folder-button"
                        onClick={() => handleRenameClick(folder)}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        data-testid="delete-folder-button"
                        onClick={() => handleDeleteFolderClick(folder)}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rename Folder Dialog */}
        {renameFolderId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div
              data-testid="rename-folder-dialog"
              className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Rename Folder</h2>
              <input
                data-testid="rename-folder-input"
                type="text"
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmRename();
                  }
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                placeholder="Enter new folder name..."
                autoFocus
              />
              <div className="flex gap-4 justify-end">
                <button
                  data-testid="cancel-rename-button"
                  onClick={handleCancelRename}
                  className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium"
                >
                  Cancel
                </button>
                <button
                  data-testid="confirm-rename-button"
                  onClick={handleConfirmRename}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  Rename
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Folder Confirmation Dialog */}
        {deleteFolderConfirmId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div
              data-testid="delete-folder-confirm-dialog"
              className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Delete Folder</h2>
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete "{deleteFolderConfirmName}"?
                <span className="font-semibold text-red-600"> This will also delete all notes in this folder.</span> This action cannot be undone.
              </p>
              <div className="flex gap-4 justify-end">
                <button
                  data-testid="cancel-folder-delete-button"
                  onClick={handleCancelFolderDelete}
                  className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium"
                >
                  Cancel
                </button>
                <button
                  data-testid="confirm-folder-delete-button"
                  onClick={handleConfirmFolderDelete}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
                >
                  Delete Folder
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Note Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Note</h2>

          {/* Folder Selector */}
          <div className="mb-4">
            <label htmlFor="folder-select" className="block text-sm font-medium text-gray-700 mb-2">
              Folder
            </label>
            <select
              id="folder-select"
              data-testid="note-folder-select"
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {folders.map((folder) => (
                <option key={folder.folder_id} value={folder.folder_id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-4">
            <input
              type="text"
              data-testid="note-title-input"
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateNote();
                }
              }}
              placeholder="Enter note title..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              data-testid="new-note-button"
              onClick={handleCreateNote}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              Create Note
            </button>
          </div>
        </div>

        {/* Edit Note Section */}
        {editingNoteId && (
          <div className="bg-white rounded-lg shadow p-6 mb-8 border-2 border-blue-500">
            <h2 className="text-xl font-semibold mb-4">Edit Note</h2>

            <div className="space-y-4">
              {/* Title Input */}
              <div>
                <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-2">
                  Title
                </label>
                <input
                  id="edit-title"
                  type="text"
                  data-testid="edit-note-title-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Note title..."
                />
              </div>

              {/* Body Textarea */}
              <div>
                <label htmlFor="edit-body" className="block text-sm font-medium text-gray-700 mb-2">
                  Content
                </label>
                <textarea
                  id="edit-body"
                  data-testid="edit-note-body-textarea"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={10}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="Write your note content here..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-between">
                <div className="flex gap-4">
                  <button
                    data-testid="save-note-button"
                    onClick={handleSaveEdit}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium"
                  >
                    Save Changes
                  </button>
                  <button
                    data-testid="cancel-edit-button"
                    onClick={handleCancelEdit}
                    className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium"
                  >
                    Cancel
                  </button>
                </div>
                <button
                  data-testid="delete-note-button-edit"
                  onClick={(e) => {
                    const note = notes.find(n => n.note_id === editingNoteId);
                    if (note) handleDeleteClick(note, e);
                  }}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
                >
                  Delete Note
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirmNoteId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div
              data-testid="delete-confirm-dialog"
              className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Confirm Delete</h2>
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete "{deleteConfirmTitle}"? This action cannot be undone.
              </p>
              <div className="flex gap-4 justify-end">
                <button
                  data-testid="cancel-delete-button"
                  onClick={handleCancelDelete}
                  className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium"
                >
                  Cancel
                </button>
                <button
                  data-testid="confirm-delete-button"
                  onClick={handleConfirmDelete}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Notes ({notes.length})
          </h2>
          {notes.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No notes yet. Create your first note above!
            </p>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  key={note.note_id}
                  data-testid="note-item"
                  onClick={() => handleEditNote(note)}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer relative"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{note.title}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm text-gray-500">
                          Updated: {new Date(note.updated_at).toLocaleString()}
                        </p>
                        {note.folder_id && (
                          <p className="text-sm text-green-600 font-medium">
                            📁 {folders.find(f => f.folder_id === note.folder_id)?.name || 'Unknown'}
                          </p>
                        )}
                      </div>
                      {note.body && note.body.trim() && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                          {note.body}
                        </p>
                      )}
                    </div>
                    <button
                      data-testid="delete-note-button"
                      onClick={(e) => handleDeleteClick(note, e)}
                      className="ml-4 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
