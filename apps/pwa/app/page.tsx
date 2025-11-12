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

  // Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importConfirmFile, setImportConfirmFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mobile responsive state
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');

  // Gesture control state (use ref for immediate updates during event handlers)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [contextMenuNote, setContextMenuNote] = useState<Note | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  // Drag-and-drop state
  const [draggedFolder, setDraggedFolder] = useState<Folder | null>(null);
  const [draggedNote, setDraggedNote] = useState<Note | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Initialize database on mount
  useEffect(() => {
    async function initializeDatabase() {
      console.log('[PWA] ===== START DATABASE INITIALIZATION =====');
      try {
        console.log('[PWA] Step 1: About to check for backup...');

        // WORKAROUND: absurder-sql sync() causes corruption
        // ALWAYS check for backup FIRST before trying to init database
        const backupData = await new Promise<Uint8Array | null>((resolve) => {
          // FIX: Always increment version to ensure 'exports' store exists
          const checkRequest = indexedDB.open('basalt-vault-backup');
          checkRequest.onsuccess = (event: any) => {
            const checkDb = event.target.result;
            const currentVersion = checkDb.version;
            checkDb.close();
            console.log('[PWA] Backup DB current version:', currentVersion);

            // Open with incremented version to trigger onupgradeneeded if needed
            const request = indexedDB.open('basalt-vault-backup', currentVersion + 1);

            request.onupgradeneeded = (event: any) => {
              const db = event.target.result;
              console.log('[PWA] Upgrade needed, ensuring exports store exists...');
              if (!db.objectStoreNames.contains('exports')) {
                db.createObjectStore('exports');
                console.log('[PWA] Created exports store during read');
              }
            };

            request.onsuccess = (event: any) => {
              const db = event.target.result;

              if (!db.objectStoreNames.contains('exports')) {
                console.log('[PWA] Backup DB exists but no exports store (should not happen after upgrade)');
                db.close();
                resolve(null);
                return;
              }

              const transaction = db.transaction(['exports'], 'readonly');
              const store = transaction.objectStore('exports');
              const getRequest = store.get('latest');

              getRequest.onsuccess = () => {
                const result = getRequest.result;
                db.close();
                if (result && result.byteLength > 0) {
                  console.log('[PWA] Found backup (' + result.byteLength + ' bytes)');
                  resolve(result);
                } else {
                  console.log('[PWA] Backup exists but is empty');
                  resolve(null);
                }
              };
              getRequest.onerror = () => {
                console.log('[PWA] Error reading backup');
                db.close();
                resolve(null);
              };
            };

            request.onerror = () => {
              console.log('[PWA] Error opening backup DB with version');
              resolve(null);
            };
          };

          checkRequest.onerror = () => {
            console.log('[PWA] No backup database found (first run)');
            resolve(null);
          };
        });

        console.log('[PWA] Step 2: Backup check complete, backupData size:', backupData ? backupData.byteLength : 0);

        let database;
        if (backupData) {
          console.log('[PWA] Step 3: Restoring from backup instead of using potentially corrupted database...');
          // ALWAYS use a fresh database name to avoid corruption
          const freshDbName = 'basalt-vault-' + Date.now();
          console.log('[PWA] Step 3a: Creating database directly from backup (no migrations needed)');

          // Import absurder-sql to create database without migrations
          const absurderSql = await import('@npiesco/absurder-sql');
          const initWasm = absurderSql.default || absurderSql;
          const Database = absurderSql.Database;

          // Initialize WASM
          if (typeof initWasm === 'function') {
            await initWasm();
          }

          // Create empty database
          console.log('[PWA] Step 3b: Creating empty database:', freshDbName);
          database = await Database.newDatabase(freshDbName);

          // Enable non-leader writes for BroadcastChannel sync
          if (typeof database.allowNonLeaderWrites === 'function') {
            await database.allowNonLeaderWrites(true);
            console.log('[DEBUG] Non-leader writes enabled for restored database');
          }

          // Import backup (which already contains schema and data)
          console.log('[PWA] Step 3c: Importing backup data (', backupData.byteLength, 'bytes)...');
          await database.importFromFile(backupData);
          console.log('[PWA] Step 3d: Backup imported successfully');

          // CRITICAL: After importFromFile, close and reopen the database
          // This is required because importFromFile puts the connection in an invalid state
          console.log('[PWA] Step 3e: Closing database to finalize import...');
          await database.close();

          // Wait for IndexedDB sync and close to complete
          await new Promise(resolve => setTimeout(resolve, 500));

          // Reopen the database - now it will have the imported data
          console.log('[PWA] Step 3f: Reopening database after import...');
          database = await Database.newDatabase(freshDbName);

          // Re-enable non-leader writes
          if (typeof database.allowNonLeaderWrites === 'function') {
            await database.allowNonLeaderWrites(true);
            console.log('[DEBUG] Non-leader writes re-enabled after reopen');
          }

          console.log('[PWA] Step 3g: Database ready after import and reopen');
        } else {
          console.log('[PWA] Step 3: No backup found, initializing fresh database with basalt-vault-main');
          database = await initBasaltDb('basalt-vault-main');
          console.log('[PWA] Step 3a: Fresh database initialized');
        }

        setDb(database);
        dbRef.current = database;

        // Expose database to window for E2E testing and multi-tab sync
        if (typeof window !== 'undefined') {
          const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
          const absurderSql = await import('@npiesco/absurder-sql');

          // Expose database instance for leader election testing
          (window as any).__db__ = database;

          (window as any).basaltDb = {
            executeQuery: async (sql: string, params: any[]) => {
              return executeQuery(database, sql, params);
            }
          };
          (window as any).Database = absurderSql.Database;

          // Set up BroadcastChannel for multi-tab sync
          const syncChannel = new BroadcastChannel('basalt-sync');

          // Listen for changes from other tabs
          syncChannel.onmessage = async (event) => {
            console.log('[PWA] Received sync message from another tab:', event.data);

            // Store last sync message for testing
            (window as any).__lastSyncMessage__ = event.data;

            if (event.data.type === 'data-changed') {
              // Execute the same SQL on this tab's database to stay in sync
              if (dbRef.current && event.data.sql) {
                try {
                  // Temporarily allow non-leader writes to execute the synced SQL
                  if (typeof dbRef.current.allowNonLeaderWrites === 'function') {
                    await dbRef.current.allowNonLeaderWrites(true);
                  }

                  // Execute SQL directly, bypassing executeQuery() to avoid leader election checks
                  const params = event.data.params || [];
                  if (params.length > 0) {
                    // Convert params to ColumnValue format
                    const columnValues = params.map((value: any) => {
                      if (value === null || value === undefined) return { type: 'Null' };
                      if (typeof value === 'number') {
                        return Number.isInteger(value)
                          ? { type: 'Integer', value }
                          : { type: 'Real', value };
                      }
                      if (typeof value === 'string') return { type: 'Text', value };
                      return { type: 'Text', value: String(value) };
                    });
                    await dbRef.current.executeWithParams(event.data.sql, columnValues);
                  } else {
                    await dbRef.current.execute(event.data.sql);
                  }
                  console.log('[PWA] Executed synced SQL:', event.data.sql.substring(0, 50));

                  // Re-disable non-leader writes
                  if (typeof dbRef.current.allowNonLeaderWrites === 'function') {
                    await dbRef.current.allowNonLeaderWrites(false);
                  }

                  // Then reload data to refresh UI
                  await loadNotes(dbRef.current);
                  await loadFolders(dbRef.current);
                  console.log('[PWA] Data reloaded after sync message');
                } catch (err) {
                  console.error('[PWA] Failed to execute synced SQL:', err);
                  // Re-enable leader election even on error
                  if (typeof dbRef.current.allowNonLeaderWrites === 'function') {
                    await dbRef.current.allowNonLeaderWrites(false);
                  }
                }
              } else if (dbRef.current) {
                // Fallback: just reload without executing SQL
                await loadNotes(dbRef.current);
                await loadFolders(dbRef.current);
                console.log('[PWA] Data reloaded after sync message (no SQL)');
              } else {
                console.log('[PWA] Database not ready yet, skipping sync');
              }
            }
          };

          // Store channel for cleanup
          (window as any).__syncChannel__ = syncChannel;
        }

        // Ensure root folder exists
        const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

        let rootFolderResult = await executeQuery(
          database,
          'SELECT folder_id FROM folders WHERE folder_id = ?',
          ['root']
        );

        if (rootFolderResult.rows.length === 0) {
          // Create root folder (all tabs can do this, it's idempotent)
          // Temporarily allow non-leader writes for this one-time setup
          if (typeof database.allowNonLeaderWrites === 'function') {
            await database.allowNonLeaderWrites(true);
          }

          const now = new Date().toISOString();
          // Call database.executeWithParams directly to bypass queueWrite logic
          const columnValues = [
            { type: 'Text', value: 'root' },
            { type: 'Text', value: '/' },
            { type: 'Null' },
            { type: 'Text', value: now },
            { type: 'Text', value: now }
          ];
          await database.executeWithParams(
            'INSERT OR IGNORE INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            columnValues
          );

          // Only leader persists to IndexedDB
          const isLeader = await database.isLeader();
          if (isLeader) {
            // CRITICAL FIX: Use TRUNCATE mode for checkpoint
            await database.execute('PRAGMA wal_checkpoint(TRUNCATE)');
            await new Promise(resolve => setTimeout(resolve, 100));
            await database.sync();
            console.log('[PWA] Created root folder as leader (synced to IndexedDB)');
          } else {
            console.log('[PWA] Created root folder as follower (local only)');
          }

          // Keep non-leader writes enabled for BroadcastChannel sync
          // Non-leaders need to execute SQL received from leader
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

  // Multi-tab sync: Ensure non-leader can write (for BroadcastChannel sync)
  async function ensureWriteEnabled(database: any) {
    if (!database) return;

    try {
      const isLeader = await database.isLeader();
      if (!isLeader && typeof database.allowNonLeaderWrites === 'function') {
        await database.allowNonLeaderWrites(true);
        console.log('[PWA] Ensured non-leader writes enabled');
      }
    } catch (err) {
      console.error('[PWA] Failed to enable non-leader writes:', err);
    }
  }

  // Multi-tab sync: Only leader persists to IndexedDB
  // WORKAROUND: absurder-sql's built-in sync() causes corruption
  // Instead, we manually export to .db file and store in IndexedDB
  async function syncIfLeader(database: any) {
    if (!database) return;

    try {
      const isLeader = await database.isLeader();
      if (isLeader) {
        console.log('[PWA] WORKAROUND: Manual export/import instead of broken sync()');

        // Checkpoint WAL first
        await database.execute('PRAGMA wal_checkpoint(TRUNCATE)');

        // Export database to Uint8Array
        const exportData = await database.exportToFile();
        console.log('[PWA] Exported database:', exportData.byteLength, 'bytes');

        // Store in IndexedDB manually
        const dbName = 'basalt-vault-backup';
        // Always increment version to trigger onupgradeneeded
        const currentVersion = await new Promise<number>((resolve) => {
          const checkRequest = indexedDB.open(dbName);
          checkRequest.onsuccess = (event: any) => {
            const db = event.target.result;
            const version = db.version;
            db.close();
            resolve(version);
          };
          checkRequest.onerror = () => resolve(0);
        });

        const request = indexedDB.open(dbName, currentVersion + 1);

        await new Promise((resolve, reject) => {
          request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            // Always try to create exports store (will throw if exists, that's ok)
            try {
              db.createObjectStore('exports');
              console.log('[PWA] Created backup object store');
            } catch (e) {
              console.log('[PWA] Object store already exists');
            }
          };

          request.onsuccess = (event: any) => {
            try {
              const db = event.target.result;
              const transaction = db.transaction(['exports'], 'readwrite');
              const store = transaction.objectStore('exports');
              const putRequest = store.put(exportData, 'latest');

              putRequest.onsuccess = () => {
                console.log('[PWA] Put request succeeded');
              };

              putRequest.onerror = (err) => {
                console.error('[PWA] Put request failed:', putRequest.error);
              };

              transaction.oncomplete = () => {
                console.log('[PWA] Backup stored in IndexedDB (' + exportData.byteLength + ' bytes)');
                db.close();
                resolve(undefined);
              };

              transaction.onerror = (err) => {
                console.error('[PWA] Transaction error:', transaction.error);
                db.close();
                reject(transaction.error);
              };
            } catch (err) {
              console.error('[PWA] Error in onsuccess:', err);
              reject(err);
            }
          };

          request.onerror = () => {
            console.error('[PWA] IndexedDB open failed:', request.error);
            reject(request.error);
          };
        });
      } else {
        console.log('[PWA] Follower skipped sync (leader handles persistence)');
      }
    } catch (err) {
      console.error('[PWA] Sync failed:', err);
      console.error('[PWA] Error stack:', err.stack);
    }
  }

  // Multi-tab sync: Broadcast changes to other tabs
  async function broadcastDataChange(sql?: string, params?: any[], operation?: string) {
    // Wait for IndexedDB to finish persisting before broadcasting
    // Increased delay to ensure transaction commits fully
    await new Promise(resolve => setTimeout(resolve, 500));

    if (typeof window !== 'undefined' && (window as any).__syncChannel__) {
      const channel = (window as any).__syncChannel__;
      channel.postMessage({
        type: 'data-changed',
        timestamp: Date.now(),
        sql,
        params,
        operation
      });
      console.log('[PWA] Broadcasted SQL to other tabs:', sql?.substring(0, 50), operation);
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

      // Ensure non-leader writes are enabled
      await ensureWriteEnabled(db);

      const insertSql = 'INSERT INTO folders (folder_id, name, parent_folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)';
      const insertParams = [folderId, newFolderName, 'root', now, now];

      await executeQuery(db, insertSql, insertParams);

      await syncIfLeader(db);
      setNewFolderName('');
      setError(null);
      await loadFolders(db);

      // Notify other tabs with the SQL to execute
      broadcastDataChange(insertSql, insertParams, 'create-folder');
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
      await ensureWriteEnabled(db);
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const now = new Date().toISOString();

      const updateSql = 'UPDATE folders SET name = ?, updated_at = ? WHERE folder_id = ?';
      const updateParams = [renameFolderName, now, renameFolderId];

      await executeQuery(db, updateSql, updateParams);

      await syncIfLeader(db);
      setRenameFolderId(null);
      setRenameFolderName('');
      setError(null);
      await loadFolders(db);

      // Notify other tabs with the SQL to execute
      broadcastDataChange(updateSql, updateParams, 'rename-folder');
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
      await ensureWriteEnabled(db);
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      const deleteSql = 'DELETE FROM folders WHERE folder_id = ?';
      const deleteParams = [deleteFolderConfirmId];

      await executeQuery(db, deleteSql, deleteParams);

      await syncIfLeader(db);
      setDeleteFolderConfirmId(null);
      setDeleteFolderConfirmName('');
      setError(null);

      if (selectedFolderId === deleteFolderConfirmId) {
        setSelectedFolderId('root');
      }

      await loadFolders(db);
      await loadNotes(db);

      // Notify other tabs with the SQL to execute
      broadcastDataChange(deleteSql, deleteParams, 'delete-folder');
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

  // ===== DRAG-AND-DROP HANDLERS =====

  // Root drop zone handlers for un-nesting
  function handleRootDropZoneDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId('root-drop-zone');
  }

  function handleRootDropZoneDragLeave(e: React.DragEvent<HTMLDivElement>) {
    setDragOverFolderId(null);
  }

  async function handleRootDropZoneDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverFolderId(null);

    if (!db) return;

    try {
      await ensureWriteEnabled(db);
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const now = new Date().toISOString();

      if (draggedFolder) {
        // Move folder to root level
        const updateSql = 'UPDATE folders SET parent_folder_id = ?, updated_at = ? WHERE folder_id = ?';
        const updateParams = ['root', now, draggedFolder.folder_id];

        await executeQuery(db, updateSql, updateParams);
        console.log('[PWA] Folder moved to root:', draggedFolder.name);

        await syncIfLeader(db);
        await loadFolders(db);
        setDraggedFolder(null);

        // Notify other tabs
        broadcastDataChange(updateSql, updateParams, 'drag-drop-folder-to-root');
      } else if (draggedNote) {
        // Move note to root folder
        const updateSql = 'UPDATE notes SET folder_id = ?, updated_at = ? WHERE note_id = ?';
        const updateParams = ['root', now, draggedNote.note_id];

        await executeQuery(db, updateSql, updateParams);
        console.log('[PWA] Note moved to root folder:', draggedNote.title);

        await syncIfLeader(db);
        await loadNotes(db);
        setDraggedNote(null);

        // Notify other tabs
        broadcastDataChange(updateSql, updateParams, 'drag-drop-note-to-root');
      }
    } catch (err) {
      console.error('[PWA] Failed to drop on root zone:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleFolderDragStart(folder: Folder, e: React.DragEvent<HTMLDivElement>) {
    setDraggedFolder(folder);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', folder }));
    console.log('[PWA] Drag started:', folder.name);
  }

  function handleFolderDragOver(folder: Folder, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folder.folder_id);
  }

  function handleFolderDragLeave(folder: Folder, e: React.DragEvent<HTMLDivElement>) {
    setDragOverFolderId(null);
  }

  async function handleFolderDrop(targetFolder: Folder, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverFolderId(null);

    if (!db || !draggedFolder) return;

    // Can't drop folder onto itself
    if (draggedFolder.folder_id === targetFolder.folder_id) {
      console.log('[PWA] Cannot drop folder onto itself');
      return;
    }

    // Can't drop folder onto its own child (would create circular reference)
    // For now, skip this check - implement later if needed

    try {
      await ensureWriteEnabled(db);
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const now = new Date().toISOString();

      const updateSql = 'UPDATE folders SET parent_folder_id = ?, updated_at = ? WHERE folder_id = ?';
      const updateParams = [targetFolder.folder_id, now, draggedFolder.folder_id];

      await executeQuery(db, updateSql, updateParams);
      console.log('[PWA] Folder dropped:', draggedFolder.name, '→', targetFolder.name);

      await syncIfLeader(db);
      await loadFolders(db);
      setDraggedFolder(null);

      // Notify other tabs
      broadcastDataChange(updateSql, updateParams, 'drag-drop-folder');
    } catch (err) {
      console.error('[PWA] Failed to drop folder:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleFolderDragEnd(e: React.DragEvent<HTMLDivElement>) {
    setDraggedFolder(null);
    setDragOverFolderId(null);
  }

  function handleNoteDragStart(note: Note, e: React.DragEvent<HTMLDivElement>) {
    setDraggedNote(note);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'note', note }));
    console.log('[PWA] Note drag started:', note.title);
  }

  async function handleNoteDropOnFolder(targetFolder: Folder, e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverFolderId(null);

    if (!db || !draggedNote) return;

    try {
      await ensureWriteEnabled(db);
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const now = new Date().toISOString();

      const updateSql = 'UPDATE notes SET folder_id = ?, updated_at = ? WHERE note_id = ?';
      const updateParams = [targetFolder.folder_id, now, draggedNote.note_id];

      await executeQuery(db, updateSql, updateParams);
      console.log('[PWA] Note dropped on folder:', draggedNote.title, '→', targetFolder.name);

      await syncIfLeader(db);
      await loadNotes(db);
      setDraggedNote(null);

      // Notify other tabs
      broadcastDataChange(updateSql, updateParams, 'drag-drop-note');
    } catch (err) {
      console.error('[PWA] Failed to drop note:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleNoteDragEnd(e: React.DragEvent<HTMLDivElement>) {
    setDraggedNote(null);
    setDragOverFolderId(null);
  }

  // ===== END DRAG-AND-DROP HANDLERS =====

  async function handleCreateNote() {
    if (!db || !newNoteTitle.trim()) {
      setError('Note title cannot be empty');
      return;
    }

    try {
      await ensureWriteEnabled(db);
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const insertSql = 'INSERT INTO notes (note_id, title, body, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)';
      const insertParams = [noteId, newNoteTitle, '', selectedFolderId, now, now];

      await executeQuery(db, insertSql, insertParams);

      await syncIfLeader(db);
      setNewNoteTitle('');
      setError(null);
      await loadNotes(db);

      // Auto-select the newly created note
      setSelectedNoteId(noteId);
      setEditTitle(newNoteTitle);
      setEditBody('');

      // Notify other tabs with the SQL to execute
      broadcastDataChange(insertSql, insertParams, 'create-note');
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
      await ensureWriteEnabled(db);
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');
      const now = new Date().toISOString();

      const updateSql = 'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE note_id = ?';
      const updateParams = [editTitle, editBody, now, selectedNoteId];

      await executeQuery(db, updateSql, updateParams);

      await syncIfLeader(db);
      setError(null);
      await loadNotes(db);

      // Notify other tabs with the SQL to execute
      broadcastDataChange(updateSql, updateParams, 'update-note');
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
      await ensureWriteEnabled(db);
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      const deleteSql = 'DELETE FROM notes WHERE note_id = ?';
      const deleteParams = [deleteConfirmNoteId];

      await executeQuery(db, deleteSql, deleteParams);

      await syncIfLeader(db);
      setDeleteConfirmNoteId(null);
      setDeleteConfirmTitle('');

      if (selectedNoteId === deleteConfirmNoteId) {
        setSelectedNoteId(null);
        setEditTitle('');
        setEditBody('');
      }

      setError(null);
      await loadNotes(db);

      // Notify other tabs with the SQL to execute
      broadcastDataChange(deleteSql, deleteParams, 'delete-note');
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

  // Export database to .db file
  async function handleExport() {
    if (!db || isExporting) return;

    setIsExporting(true);
    console.log('[PWA] Starting database export...');

    try {
      // Export database to Uint8Array
      const exportedData = await db.exportToFile();
      console.log('[PWA] Database exported,', exportedData.length, 'bytes');

      // Create blob and download
      const blob = new Blob([exportedData], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `basalt-vault-${timestamp}.db`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('[PWA] ✓ Export complete:', filename);
      setError(null);
    } catch (err) {
      console.error('[PWA] Export failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  }

  // Handle import file selection
  function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('[PWA] File selected for import:', file.name, file.size, 'bytes');

    // Show confirmation dialog
    setImportConfirmFile(file);
  }

  // Import database from .db file
  async function handleImportConfirm() {
    if (!db || !importConfirmFile || isImporting) return;

    setIsImporting(true);
    console.log('[PWA] Starting database import...');

    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await importConfirmFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      console.log('[PWA] File read,', uint8Array.length, 'bytes');

      // Import into database
      await db.importFromFile(uint8Array);
      console.log('[PWA] Database imported successfully');

      // CRITICAL: After importFromFile, we need to reconnect
      // This is required by absurder-sql to apply the imported data
      console.log('[PWA] Reconnecting to database after import...');

      // Close confirmation dialog
      setImportConfirmFile(null);

      // Reload data
      await loadNotes(db);
      await loadFolders(db);

      console.log('[PWA] ✓ Import complete, data reloaded');
      setError(null);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('[PWA] Import failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  }

  // Cancel import
  function handleImportCancel() {
    console.log('[PWA] Import canceled');
    setImportConfirmFile(null);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // Mobile: Quick add note
  async function handleQuickAddSubmit() {
    if (!db || !quickAddTitle.trim()) {
      return;
    }

    try {
      await ensureWriteEnabled(db);
      const noteId = `note-${Date.now()}`;
      const now = new Date().toISOString();
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      const insertSql = 'INSERT INTO notes (note_id, title, body, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)';
      const insertParams = [noteId, quickAddTitle, '', selectedFolderId === 'root' ? null : selectedFolderId, now, now];

      await executeQuery(db, insertSql, insertParams);

      console.log('[PWA] Quick-added note:', noteId);

      // Reload notes
      await loadNotes();

      // Close dialog and reset
      setIsQuickAddOpen(false);
      setQuickAddTitle('');

      // Keep sidebar open so user can see the new note
      setIsLeftSidebarOpen(true);

      // Notify other tabs with the SQL to execute
      broadcastDataChange(insertSql, insertParams, 'quick-add-note');
    } catch (err) {
      console.error('[PWA] Quick add failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Gesture: Handle touch start for swipe gestures
  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  // Gesture: Handle mouse down for swipe gestures (for testing/desktop)
  function handleMouseDownForSwipe(e: React.MouseEvent) {
    touchStartRef.current = { x: e.clientX, y: e.clientY };
  }

  // Gesture: Handle touch move for swipe detection
  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Detect horizontal swipe (deltaX > deltaY)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      // Swipe right to open sidebar
      if (deltaX > 0 && touchStartRef.current.x < 50 && !isLeftSidebarOpen) {
        setIsLeftSidebarOpen(true);
        touchStartRef.current = null;
      }
      // Swipe left to close sidebar
      else if (deltaX < 0 && isLeftSidebarOpen) {
        setIsLeftSidebarOpen(false);
        touchStartRef.current = null;
      }
    }
  }

  // Gesture: Handle mouse move for swipe detection (for testing/desktop)
  function handleMouseMoveForSwipe(e: React.MouseEvent) {
    if (!touchStartRef.current) return;

    // Only process if button is pressed (e.buttons & 1 means left button)
    if ((e.buttons & 1) === 0) return;

    const deltaX = e.clientX - touchStartRef.current.x;
    const deltaY = e.clientY - touchStartRef.current.y;

    // Detect horizontal swipe (deltaX > deltaY)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      // Swipe right to open sidebar
      if (deltaX > 0 && touchStartRef.current.x < 50 && !isLeftSidebarOpen) {
        setIsLeftSidebarOpen(true);
        touchStartRef.current = null;
      }
      // Swipe left to close sidebar
      else if (deltaX < 0 && isLeftSidebarOpen) {
        setIsLeftSidebarOpen(false);
        touchStartRef.current = null;
      }
    }
  }

  // Gesture: Handle touch end
  function handleTouchEnd() {
    touchStartRef.current = null;
  }

  // Gesture: Handle mouse up (for testing/desktop)
  function handleMouseUpForSwipe() {
    touchStartRef.current = null;
  }

  // Gesture: Handle long press start on note
  function handleNoteLongPressStart(note: Note, e: React.TouchEvent | React.MouseEvent) {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // Start long press timer (600ms)
    const timer = setTimeout(() => {
      // Show context menu
      setContextMenuNote(note);
      setContextMenuPosition({ x: clientX, y: clientY });

      // Also enter selection mode
      setSelectionMode(true);
      setSelectedNoteIds(new Set([note.note_id]));

      console.log('[PWA] Long press detected on note:', note.note_id);
    }, 600);

    setLongPressTimer(timer);
  }

  // Gesture: Cancel long press
  function handleNoteLongPressCancel() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }

  // Context menu: Delete note
  async function handleContextMenuDelete() {
    if (!contextMenuNote) return;

    setDeleteConfirmNoteId(contextMenuNote.note_id);
    setDeleteConfirmTitle(contextMenuNote.title);
    setContextMenuNote(null);
    setContextMenuPosition(null);
  }

  // Context menu: Rename note
  function handleContextMenuRename() {
    if (!contextMenuNote) return;

    // Open edit mode for the note
    setSelectedNoteId(contextMenuNote.note_id);
    setEditTitle(contextMenuNote.title);
    setEditBody(contextMenuNote.body || '');

    setContextMenuNote(null);
    setContextMenuPosition(null);
    setIsLeftSidebarOpen(false);
  }

  // Selection mode: Toggle note selection
  function handleToggleNoteSelection(noteId: string) {
    if (!selectionMode) return;

    const newSelected = new Set(selectedNoteIds);
    if (newSelected.has(noteId)) {
      newSelected.delete(noteId);
    } else {
      newSelected.add(noteId);
    }
    setSelectedNoteIds(newSelected);

    // Exit selection mode if no notes selected
    if (newSelected.size === 0) {
      setSelectionMode(false);
    }
  }

  // Selection mode: Bulk delete
  async function handleBulkDelete() {
    if (selectedNoteIds.size === 0) return;

    try {
      const { executeQuery } = await import('../../../packages/domain/src/dbClient.js');

      for (const noteId of selectedNoteIds) {
        await executeQuery(
          db,
          'DELETE FROM notes WHERE note_id = ?',
          [noteId]
        );
        console.log('[PWA] Deleted note (bulk):', noteId);
      }

      // Clear selection and exit selection mode
      setSelectedNoteIds(new Set());
      setSelectionMode(false);

      // Reload notes
      await loadNotes();
    } catch (err) {
      console.error('[PWA] Bulk delete failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Selection mode: Cancel
  function handleCancelSelection() {
    setSelectionMode(false);
    setSelectedNoteIds(new Set());
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
    <div
      className="min-h-screen bg-gray-100 flex flex-col"
      data-testid="app-ready"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDownCapture={handleMouseDownForSwipe}
      onMouseMoveCapture={handleMouseMoveForSwipe}
      onMouseUpCapture={handleMouseUpForSwipe}
    >
      {/* Top Header Bar */}
      <header className="bg-white border-b border-gray-300 px-4 py-3 flex items-center gap-4 flex-shrink-0" style={{ position: 'relative', zIndex: 50 }}>
        {/* Mobile: Left Sidebar Toggle */}
        <button
          data-testid="toggle-left-sidebar"
          onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
          className="mobile-toggle"
          aria-label="Toggle notes sidebar"
        >
          <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

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

        {/* Export/Import Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Export Button */}
          <button
            data-testid="export-button"
            onClick={handleExport}
            disabled={isExporting || !db}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Exporting...
              </>
            ) : (
              <>
                ⬇️ Export
              </>
            )}
          </button>

          {/* Import Button */}
          <button
            data-testid="import-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || !db}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isImporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Importing...
              </>
            ) : (
              <>
                ⬆️ Import
              </>
            )}
          </button>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".db"
            data-testid="import-file-input"
            onChange={handleImportFileChange}
            className="hidden"
          />
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
          className={`sidebar-mobile ${isLeftSidebarOpen ? 'open' : ''}`}
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

            {/* Root Drop Zone (for un-nesting folders/notes) */}
            <div
              data-testid="root-drop-zone"
              onDragOver={handleRootDropZoneDragOver}
              onDragLeave={handleRootDropZoneDragLeave}
              onDrop={handleRootDropZoneDrop}
              className={`px-3 py-2 mb-2 border-2 border-dashed rounded text-xs text-center transition-colors ${
                dragOverFolderId === 'root-drop-zone'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-500'
              }`}
            >
              {dragOverFolderId === 'root-drop-zone' ? '⬇️ Drop here to move to root' : '📁 Root Level'}
            </div>

            {/* Folder List */}
            <div className="space-y-1">
              {folders.map((folder) => (
                <div
                  key={folder.folder_id}
                  data-testid="folder-item"
                  data-nested={folder.parent_folder_id !== 'root' && folder.parent_folder_id !== null ? 'true' : 'false'}
                  draggable={folder.folder_id !== 'root'}
                  onDragStart={(e) => handleFolderDragStart(folder, e)}
                  onDragOver={(e) => handleFolderDragOver(folder, e)}
                  onDragLeave={(e) => handleFolderDragLeave(folder, e)}
                  onDrop={(e) => {
                    if (draggedNote) {
                      handleNoteDropOnFolder(folder, e);
                    } else if (draggedFolder) {
                      handleFolderDrop(folder, e);
                    }
                  }}
                  onDragEnd={handleFolderDragEnd}
                  className={`px-2 py-1 text-sm border border-gray-200 rounded bg-gray-50 transition-colors ${
                    dragOverFolderId === folder.folder_id ? 'bg-blue-100 border-blue-400' : ''
                  } ${folder.parent_folder_id !== 'root' && folder.parent_folder_id !== null ? 'ml-4' : ''} ${
                    folder.folder_id !== 'root' ? 'cursor-move' : ''
                  }`}
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
                    data-selected={selectedNoteIds.has(note.note_id) ? 'true' : 'false'}
                    draggable={true}
                    onDragStart={(e) => handleNoteDragStart(note, e)}
                    onDragEnd={handleNoteDragEnd}
                    onClick={() => selectionMode ? handleToggleNoteSelection(note.note_id) : handleSelectNote(note)}
                    onTouchStart={(e) => handleNoteLongPressStart(note, e)}
                    onTouchEnd={handleNoteLongPressCancel}
                    onTouchMove={handleNoteLongPressCancel}
                    onMouseDown={(e) => handleNoteLongPressStart(note, e)}
                    onMouseUp={handleNoteLongPressCancel}
                    onMouseLeave={handleNoteLongPressCancel}
                    className={`p-2 border rounded cursor-move transition-colors ${
                      selectedNoteIds.has(note.note_id)
                        ? 'border-green-500 bg-green-100'
                        : selectedNoteId === note.note_id
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
          className="sidebar-right-mobile w-80 bg-white border-l border-gray-300 p-4 overflow-y-auto"
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

      {/* Import Confirmation Dialog */}
      {importConfirmFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            data-testid="import-confirm-dialog"
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">⚠️ Import Database</h2>
            <div className="mb-6">
              <p className="text-gray-700 mb-3">
                You are about to import: <span className="font-semibold">{importConfirmFile.name}</span>
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-yellow-800 text-sm">
                  <strong>Warning:</strong> This will <strong>overwrite</strong> all existing data in your current vault.
                  Make sure you have exported a backup before proceeding.
                </p>
              </div>
            </div>
            <div className="flex gap-4 justify-end">
              <button
                data-testid="import-cancel-button"
                onClick={handleImportCancel}
                disabled={isImporting}
                className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                data-testid="import-confirm-button"
                onClick={handleImportConfirm}
                disabled={isImporting}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Importing...
                  </>
                ) : (
                  'Import and Overwrite'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Quick Add Dialog */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div
            data-testid="quick-add-dialog"
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Add Note</h2>
            <div className="mb-4">
              <label htmlFor="quick-add-title" className="block text-sm font-medium text-gray-700 mb-2">
                Note Title
              </label>
              <input
                id="quick-add-title"
                type="text"
                data-testid="quick-add-title"
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickAddTitle.trim()) {
                    handleQuickAddSubmit();
                  } else if (e.key === 'Escape') {
                    setIsQuickAddOpen(false);
                    setQuickAddTitle('');
                  }
                }}
                placeholder="Enter note title..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsQuickAddOpen(false);
                  setQuickAddTitle('');
                }}
                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium"
                style={{ minHeight: '44px' }}
              >
                Cancel
              </button>
              <button
                data-testid="quick-add-submit"
                onClick={handleQuickAddSubmit}
                disabled={!quickAddTitle.trim()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ minHeight: '44px' }}
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Floating Add Button */}
      <button
        data-testid="floating-add-button"
        onClick={() => setIsQuickAddOpen(true)}
        className="floating-add-mobile"
        aria-label="Add new note"
      >
        <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Context Menu */}
      {contextMenuNote && contextMenuPosition && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setContextMenuNote(null);
              setContextMenuPosition(null);
            }}
          />
          {/* Menu */}
          <div
            data-testid="note-context-menu"
            className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
            style={{
              top: `${contextMenuPosition.y}px`,
              left: `${contextMenuPosition.x}px`,
              minWidth: '200px'
            }}
          >
            <button
              data-testid="context-menu-rename"
              onClick={handleContextMenuRename}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
            >
              <span>✏️</span> Rename
            </button>
            <button
              data-testid="context-menu-delete"
              onClick={handleContextMenuDelete}
              className="w-full px-4 py-2 text-left text-sm hover:bg-red-100 text-red-600 flex items-center gap-2"
            >
              <span>🗑️</span> Delete
            </button>
          </div>
        </>
      )}

      {/* Selection Mode Indicator */}
      {selectionMode && (
        <div
          data-testid="selection-mode-active"
          className="fixed top-16 left-0 right-0 bg-green-600 text-white py-2 px-4 z-40 flex items-center justify-between"
        >
          <span className="text-sm font-medium">
            {selectedNoteIds.size} note{selectedNoteIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleCancelSelection}
            className="text-sm underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      {selectionMode && selectedNoteIds.size > 0 && (
        <div
          data-testid="bulk-action-toolbar"
          className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white rounded-full shadow-xl px-6 py-3 z-40 flex items-center gap-4"
        >
          <button
            data-testid="bulk-delete-button"
            onClick={handleBulkDelete}
            className="flex items-center gap-2 text-sm hover:text-red-300"
          >
            <span>🗑️</span> Delete ({selectedNoteIds.size})
          </button>
        </div>
      )}

      {/* Mobile: Sidebar Overlay */}
      {isLeftSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={() => setIsLeftSidebarOpen(false)}
        />
      )}
    </div>
  );
}
