import { initDb } from '../../../../packages/domain/src/dbClient.js';

export async function initBasaltDb(storageKey, options = {}) {
  if (!storageKey || typeof storageKey !== 'string' || storageKey.trim() === '') {
    throw new Error('storageKey is required to initialize the Basalt database');
  }

  const {
    loadModule = () => import('@npiesco/absurder-sql'),
    migrations = [],
    initDbImpl = initDb,
  } = options;

  const absurderSql = await loadModule();

  return initDbImpl({
    absurderSql,
    storageKey,
    migrations,
  });
}
