'use client';

import React, { useEffect, useState } from 'react';

export default function TestHarnessPage() {
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    async function initializeTestHarness() {
      try {
        console.log('[Harness] Starting initialization...');

        // Import absurder-sql and dbClient
        const absurderSql = await import('@npiesco/absurder-sql');
        const { initDb, executeQuery, exportToFile, importFromFile } = await import('../../../../packages/domain/src/dbClient.js');
        const { generateInitialMigration } = await import('../../../../packages/domain/src/migrations.js');

        console.log('[Harness] Modules loaded');

        // Make everything available globally for tests
        if (typeof window !== 'undefined') {
          (window as any).absurderSql = absurderSql;
          (window as any).dbClient = {
            initDb,
            executeQuery,
            exportToFile,
            importFromFile,
          };
          (window as any).generateInitialMigration = generateInitialMigration;
          (window as any).testHarnessReady = true;
        }

        setStatus('✓ Ready for testing');
        console.log('[Harness] Ready for testing');
      } catch (err) {
        console.error('[Harness] Initialization failed:', err);
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    initializeTestHarness();
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Database Import Test Harness</h1>
      <div id="status">{status}</div>
    </div>
  );
}
