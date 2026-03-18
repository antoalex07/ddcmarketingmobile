import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'locations.db';

let db = null;
let tableCreated = false;

const getDatabase = async () => {
  try {
    if (!db) {
      db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    }

    if (!tableCreated && db) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INT,
          latitude DECIMAL,
          longitude DECIMAL,
          accuracy FLOAT,
          speed FLOAT,
          heading FLOAT,
          timestamp DATETIME,
          synced INTEGER DEFAULT 0
        );
      `);
      tableCreated = true;
    }

    return db;
  } catch (error) {
    // Reset state to allow retry
    db = null;
    tableCreated = false;
    throw error;
  }
};

export const createTable = async () => {
  await getDatabase();
};

export const insertPoint = async (point) => {
  try {
    const database = await getDatabase();

    if (!database) {
      throw new Error('Database not initialized');
    }

    const result = await database.runAsync(
      `INSERT INTO locations (session_id, latitude, longitude, accuracy, speed, heading, timestamp, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        point.session_id,
        point.latitude,
        point.longitude,
        point.accuracy,
        point.speed,
        point.heading,
        point.timestamp,
        point.synced ?? 0
      ]
    );
    return result.lastInsertRowId;
  } catch (error) {
    throw error;
  }
};

export const getUnsyncedPoints = async () => {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM locations WHERE synced = 0 ORDER BY timestamp ASC'
  );
  return rows;
};

export const markAsSynced = async (ids) => {
  if (!ids || ids.length === 0) return;

  const database = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await database.runAsync(
    `UPDATE locations SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
};

export const markSingleAsSynced = async (id) => {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE locations SET synced = 1 WHERE id = ?',
    [id]
  );
};

export const getUnsyncedCount = async () => {
  const database = await getDatabase();
  const result = await database.getFirstAsync(
    'SELECT COUNT(*) as count FROM locations WHERE synced = 0'
  );
  return result?.count || 0;
};

export const clearSyncedPoints = async (olderThanDays = 7) => {
  const database = await getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  await database.runAsync(
    'DELETE FROM locations WHERE synced = 1 AND timestamp < ?',
    [cutoffDate.toISOString()]
  );
};
