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
  const dbRef = useRef<any>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('root');
  const [error, setError] = useState<string | null>(null);

  // Selected note for editing in center pane
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  // Folder management state
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [deleteFolderConfirmId, setDeleteFolderConfirmId] = useState<string | null>(null);
  const [deleteFolderConfirmName, setDeleteFolderConfirmName] = useState('');

  // Delete confirmation state
  const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Note[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Initialize database on mount
  useEffect(() => {
    async function initializeDatabase() {
      try {
        console.log('[PWA] Initializing database...');

        const database = await initBasaltDb('basalt-vault-main');

        console.log('[PWA] Database initialized successfully');
        setDb(database);
        dbRef.current = database;

        // Expose database to window for E2E testing
        if (typeof window !== 'undefined') {
          const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
          const absurderSql = await import('@npiesco/absurder-sql');

          (window as any).basaltDb = {
            executeQuery: async (sql: string, params: any[]) => {
              return executeQuery(database, sql, params);
            }
          };
          (window as any).Database = absurderSql.Database;
        }

        // Ensure root folder exists
        const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

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
  }, []);

  async function loadNotes(database: any) {
    try {
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
    if (!db || !newFolderName.trim()) {
      setError('Folder name cannot be empty');
      return;
    }

    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [folderId, newFolderName, 'root', now, now]
      );

      await db.sync();
      setNewFolderName('');
      setError(null);
      await loadFolders(db);
    } catch (err) {
      console.error('[PWA] Failed to create folder:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleRenameClick(folder: Folder) {
    setRenameFolderId(folder.folder_id);
    setRenameFolderName(folder.name);
  }

  async function handleConfirmRename() {
    if (!db || !renameFolderId || !renameFolderName.trim()) return;

    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const now = new Date().toISOString();

      await executeQuery(
        db,
        'UPDATE folders SET name = ?, updated_at = ? WHERE folder_id = ?',
        [renameFolderName, now, renameFolderId]
      );

      await db.sync();
      setRenameFolderId(null);
      setRenameFolderName('');
      setError(null);
      await loadFolders(db);
    } catch (err) {
      console.error('[PWA] Failed to rename folder:', err);
      setError(err instanceof Error ? err.message : String(err));
      setRenameFolderId(null);
    }
  }

  function handleCancelRename() {
    setRenameFolderId(null);
    setRenameFolderName('');
  }

  function handleDeleteFolderClick(folder: Folder) {
    setDeleteFolderConfirmId(folder.folder_id);
    setDeleteFolderConfirmName(folder.name);
  }

  async function handleConfirmFolderDelete() {
    if (!db || !deleteFolderConfirmId) return;

    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      await executeQuery(
        db,
        'DELETE FROM folders WHERE folder_id = ?',
        [deleteFolderConfirmId]
      );

      await db.sync();
      setDeleteFolderConfirmId(null);
      setDeleteFolderConfirmName('');
      setError(null);

      if (selectedFolderId === deleteFolderConfirmId) {
        setSelectedFolderId('root');
      }

      await loadFolders(db);
      await loadNotes(db);
    } catch (err) {
      console.error('[PWA] Failed to delete folder:', err);
      setError(err instanceof Error ? err.message : String(err));
      setDeleteFolderConfirmId(null);
    }
  }

  function handleCancelFolderDelete() {
    setDeleteFolderConfirmId(null);
    setDeleteFolderConfirmName('');
  }

  async function handleCreateNote() {
    if (!db || !newNoteTitle.trim()) {
      setError('Note title cannot be empty');
      return;
    }

    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await executeQuery(
        db,
        'INSERT INTO notes (note_id, title, body, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [noteId, newNoteTitle, '', selectedFolderId, now, now]
      );

      await db.sync();
      setNewNoteTitle('');
      setError(null);
      await loadNotes(db);

      // Auto-select the newly created note
      setSelectedNoteId(noteId);
      setEditTitle(newNoteTitle);
      setEditBody('');
    } catch (err) {
      console.error('[PWA] Failed to create note:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleSelectNote(note: Note) {
    setSelectedNoteId(note.note_id);
    setEditTitle(note.title);
    setEditBody(note.body || '');
    setError(null);
  }

  async function handleSaveEdit() {
    if (!db || !selectedNoteId || !editTitle.trim()) {
      setError('Cannot save - invalid note data');
      return;
    }

    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const now = new Date().toISOString();

      await executeQuery(
        db,
        'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE note_id = ?',
        [editTitle, editBody, now, selectedNoteId]
      );

      await db.sync();
      setError(null);
      await loadNotes(db);
    } catch (err) {
      console.error('[PWA] Failed to update note:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDeleteClick(note: Note) {
    setDeleteConfirmNoteId(note.note_id);
    setDeleteConfirmTitle(note.title);
  }

  async function handleConfirmDelete() {
    if (!db || !deleteConfirmNoteId) return;

    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      await executeQuery(
        db,
        'DELETE FROM notes WHERE note_id = ?',
        [deleteConfirmNoteId]
      );

      await db.sync();
      setDeleteConfirmNoteId(null);
      setDeleteConfirmTitle('');

      if (selectedNoteId === deleteConfirmNoteId) {
        setSelectedNoteId(null);
        setEditTitle('');
        setEditBody('');
      }

      setError(null);
      await loadNotes(db);
    } catch (err) {
      console.error('[PWA] Failed to delete note:', err);
      setError(err instanceof Error ? err.message : String(err));
      setDeleteConfirmNoteId(null);
    }
  }

  function handleCancelDelete() {
    setDeleteConfirmNoteId(null);
    setDeleteConfirmTitle('');
  }

  // Search functionality using FTS5
  async function performSearch(query: string) {
    if (!db || !query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      // FTS5 search query - searches both title and body
      // FTS5 is case-insensitive by default for ASCII characters
      console.log('[PWA] Executing FTS5 search for:', query);
      const result = await executeQuery(
        db,
        `SELECT n.note_id, n.title, n.body, n.folder_id, n.created_at, n.updated_at
         FROM notes n
         WHERE n.note_id IN (
           SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?
         )
         ORDER BY n.updated_at DESC
         LIMIT 50`,
        [query]
      );
      console.log('[PWA] FTS5 query returned', result.rows.length, 'rows');

      const results: Note[] = result.rows.map((row: any) => {
        const note: any = {};
        result.columns.forEach((col: string, idx: number) => {
          const value = row.values[idx];
          note[col] = value.type === 'Null' ? null : value.value;
        });
        return note as Note;
      });

      setSearchResults(results);
      console.log('[PWA] Search found', results.length, 'results for:', query);
    } catch (err) {
      console.error('[PWA] Search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, db]);

  function handleSearchResultClick(note: Note) {
    setSelectedNoteId(note.note_id);
    setEditTitle(note.title);
    setEditBody(note.body || '');
    setError(null);
    // Optionally clear search
    // setSearchQuery('');
  }

  // Highlight search terms in text
  function highlightText(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-200 font-semibold">
          {part}
        </mark>
      ) : (
        part
      )
    );
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

  const selectedNote = notes.find(n => n.note_id === selectedNoteId);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" data-testid="app-ready">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-gray-300 px-4 py-3 flex items-center gap-4 flex-shrink-0">
        <div className="flex-shrink-0">
          <h1 className="text-2xl font-bold text-gray-900">Basalt</h1>
          <p className="text-xs text-gray-600">Your local-first knowledge base</p>
        </div>

        {/* Search Input */}
        <div className="flex-1 max-w-2xl relative">
          <div className="relative">
            <input
              type="text"
              data-testid="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes... (FTS5 powered)"
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
            {searchQuery && !isSearching && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && (
            <div
              data-testid="search-results"
              className="absolute z-50 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto"
            >
              {searchResults.length === 0 && !isSearching && (
                <div data-testid="search-empty-state" className="p-6 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p>No results found for "{searchQuery}"</p>
                </div>
              )}

              {searchResults.map((note) => (
                <div
                  key={note.note_id}
                  data-testid="search-result-item"
                  onClick={() => handleSearchResultClick(note)}
                  className="p-4 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <h3 data-testid="result-title" className="font-medium text-gray-900 mb-1">
                    {highlightText(note.title, searchQuery)}
                  </h3>
                  {note.body && (
                    <p data-testid="result-snippet" className="text-sm text-gray-600 line-clamp-2">
                      {highlightText(
                        note.body.substring(0, 200) + (note.body.length > 200 ? '...' : ''),
                        searchQuery
                      )}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    {note.folder_id && (
                      <span>📁 {folders.find(f => f.folder_id === note.folder_id)?.name || 'Unknown'}</span>
                    )}
                    <span>•</span>
                    <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded px-3 py-2">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </header>

      {/* Three-Pane Obsidian-Style Layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR: Folders + Notes */}
        <aside
          data-testid="left-sidebar"
          className="w-80 bg-white border-r border-gray-300 flex flex-col overflow-hidden"
        >
          {/* Folders Section */}
          <div data-testid="folders-section" className="border-b border-gray-200 p-4 flex-shrink-0 overflow-y-auto max-h-64">
            <h2 className="text-sm font-bold text-gray-700 uppercase mb-3">Folders</h2>

            {/* Create Folder */}
            <div className="flex gap-2 mb-3">
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
                placeholder="New folder..."
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <button
                data-testid="create-folder-button"
                onClick={handleCreateFolder}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                +
              </button>
            </div>

            {/* Folder List */}
            <div className="space-y-1">
              {folders.map((folder) => (
                <div
                  key={folder.folder_id}
                  data-testid="folder-item"
                  className="px-2 py-1 text-sm border border-gray-200 rounded bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">📁 {folder.name}</span>
                    {folder.folder_id !== 'root' && (
                      <div className="flex gap-1">
                        <button
                          data-testid="rename-folder-button"
                          onClick={() => handleRenameClick(folder)}
                          className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          Rename
                        </button>
                        <button
                          data-testid="delete-folder-button"
                          onClick={() => handleDeleteFolderClick(folder)}
                          className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
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

          {/* Notes Section */}
          <div data-testid="notes-section" className="flex-1 p-4 overflow-y-auto">
            <h2 className="text-sm font-bold text-gray-700 uppercase mb-3">Notes ({notes.length})</h2>

            {/* Create Note */}
            <div className="mb-4">
              <select
                data-testid="note-folder-select"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2"
              >
                {folders.map((folder) => (
                  <option key={folder.folder_id} value={folder.folder_id}>
                    {folder.name}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
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
                  placeholder="New note..."
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  data-testid="new-note-button"
                  onClick={handleCreateNote}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  +
                </button>
              </div>
            </div>

            {/* Notes List */}
            {notes.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No notes yet</p>
            ) : (
              <div className="space-y-1">
                {notes.map((note) => (
                  <div
                    key={note.note_id}
                    data-testid="note-item"
                    onClick={() => handleSelectNote(note)}
                    className={`p-2 border rounded cursor-pointer transition-colors ${
                      selectedNoteId === note.note_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <h3 className="text-sm font-medium text-gray-900 truncate">{note.title}</h3>
                    {note.folder_id && (
                      <p className="text-xs text-green-600 mt-0.5">
                        📁 {folders.find(f => f.folder_id === note.folder_id)?.name || 'Unknown'}
                      </p>
                    )}
                    {note.body && note.body.trim() && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {note.body}
                      </p>
                    )}
                    <button
                      data-testid="delete-note-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(note);
                      }}
                      className="mt-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER PANE: Editor */}
        <main
          data-testid="center-pane"
          className="flex-1 bg-gray-50 overflow-y-auto p-6"
        >
          {!selectedNoteId ? (
            <div data-testid="editor-empty-state" className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <svg className="w-24 h-24 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h2 className="text-2xl font-semibold mb-2">Welcome to Basalt</h2>
                <p className="text-gray-600">Select a note from the sidebar or create a new one to get started</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {/* Note Editor */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="space-y-4">
                  {/* Title Input */}
                  <div>
                    <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-2">
                      Title
                    </label>
                    <input
                      id="edit-title"
                      type="text"
                      data-testid="editor-note-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-4 py-2 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      data-testid="editor-note-body"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={20}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      placeholder="Write your note content here..."
                    />
                  </div>

                  {/* Action Buttons */}
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
                      onClick={() => {
                        setSelectedNoteId(null);
                        setEditTitle('');
                        setEditBody('');
                      }}
                      className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium"
                    >
                      Close
                    </button>
                    <button
                      data-testid="delete-note-button-edit"
                      onClick={() => selectedNote && handleDeleteClick(selectedNote)}
                      className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium ml-auto"
                    >
                      Delete Note
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR: Metadata */}
        <aside
          data-testid="right-sidebar"
          className="w-80 bg-white border-l border-gray-300 p-4 overflow-y-auto"
        >
          <h2 className="text-sm font-bold text-gray-700 uppercase mb-3">Metadata</h2>

          {!selectedNote ? (
            <p className="text-sm text-gray-500">Select a note to view metadata</p>
          ) : (
            <div className="space-y-4">
              {/* Created Date */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-1">Created</h3>
                <p data-testid="metadata-created-date" className="text-sm text-gray-800">
                  {new Date(selectedNote.created_at).toLocaleString()}
                </p>
              </div>

              {/* Updated Date */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-1">Updated</h3>
                <p data-testid="metadata-updated-date" className="text-sm text-gray-800">
                  {new Date(selectedNote.updated_at).toLocaleString()}
                </p>
              </div>

              {/* Folder */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-1">Folder</h3>
                <p data-testid="metadata-folder" className="text-sm text-gray-800">
                  📁 {folders.find(f => f.folder_id === selectedNote.folder_id)?.name || '/'}
                </p>
              </div>

              {/* Note ID */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-1">Note ID</h3>
                <p className="text-xs text-gray-600 font-mono break-all">
                  {selectedNote.note_id}
                </p>
              </div>

              {/* Word Count */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-1">Word Count</h3>
                <p className="text-sm text-gray-800">
                  {selectedNote.body ? selectedNote.body.split(/\s+/).filter(Boolean).length : 0} words
                </p>
              </div>

              {/* Character Count */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase mb-1">Characters</h3>
                <p className="text-sm text-gray-800">
                  {selectedNote.body ? selectedNote.body.length : 0} characters
                </p>
              </div>
            </div>
          )}
        </aside>

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

      {/* Delete Note Confirmation Dialog */}
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
    </div>
  );
}
