'use client';

import React, { useState, useEffect } from 'react';
import { initBasaltDb } from '../lib/db/client';

interface Note {
  note_id: string;
  title: string;
  body: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function HomePage(): JSX.Element {
  const [db, setDb] = useState<any>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  // Initialize database on mount
  useEffect(() => {
    async function initializeDatabase() {
      try {
        console.log('[PWA] Initializing database...');

        const database = await initBasaltDb('basalt-vault-main');

        console.log('[PWA] Database initialized successfully');
        setDb(database);

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
          console.log('[PWA] Created root folder');
        }

        // Load existing notes
        await loadNotes(database);

        setIsReady(true);
        console.log('[PWA] App ready');
      } catch (err) {
        console.error('[PWA] Failed to initialize database:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    initializeDatabase();
  }, []);

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
        [noteId, newNoteTitle, '', 'root', now, now]
      );

      console.log('[PWA] Note created successfully:', noteId);

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

        {/* Create Note Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Note</h2>
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
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <h3 className="font-medium text-gray-900">{note.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Updated: {new Date(note.updated_at).toLocaleString()}
                  </p>
                  {note.body && note.body.trim() && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {note.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
