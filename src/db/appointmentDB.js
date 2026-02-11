import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'appointments.db';

let db = null;
let tableCreated = false;
let nextTempId = -1;
let tempIdInitialized = false;

const getDatabase = async () => {
  try {
    if (!db) {
      db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    }

    if (!tableCreated && db) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS appointments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          appoint_id INTEGER NOT NULL,
          appoint_userid INTEGER,
          appoint_staffname TEXT,
          appoint_assigneduserid INTEGER,
          appoint_assignedstaffname TEXT,
          appoint_clientautoid INTEGER,
          appoint_clientname TEXT,
          appoint_clientaddress TEXT,
          appoint_clienttype TEXT,
          appoint_appointmentdate TEXT NOT NULL,
          appoint_timefrom TEXT NOT NULL,
          appoint_timeto TEXT NOT NULL,
          appoint_report TEXT,
          appoint_reportdate TEXT,
          appoint_notes TEXT,
          appoint_followupdate TEXT,
          appoint_followuptimefrom TEXT,
          appoint_followuptimeto TEXT,
          appoint_latitude REAL,
          appoint_longitude REAL,
          appoint_status INTEGER DEFAULT 1,
          appointapproval_status INTEGER,
          appointapproval_by TEXT,
          appoint_crtdby TEXT,
          appoint_crton TEXT,
          appoint_updby TEXT,
          appoint_updon TEXT,
          synced INTEGER DEFAULT 0,
          is_deleted INTEGER DEFAULT 0,
          retry_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_appointments_synced ON appointments(synced);
        CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appoint_appointmentdate);
      `);
      tableCreated = true;
    }

    // Initialize nextTempId on first database access
    if (!tempIdInitialized && db) {
      const result = await db.getFirstAsync(
        'SELECT MIN(appoint_id) as minId FROM appointments WHERE appoint_id < 0'
      );
      if (result && result.minId !== null) {
        nextTempId = result.minId - 1;
      } else {
        nextTempId = -1;
      }
      tempIdInitialized = true;
    }

    return db;
  } catch (error) {
    // Reset state to allow retry
    db = null;
    tableCreated = false;
    tempIdInitialized = false;
    throw error;
  }
};

export const createTable = async () => {
  await getDatabase();
};

export const insertAppointment = async (appointmentData) => {
  try {
    const database = await getDatabase();

    if (!database) {
      throw new Error('Database not initialized');
    }

    const tempAppointId = nextTempId;
    nextTempId--; // Decrement for next appointment

    const createdAt = new Date().toISOString();

    const result = await database.runAsync(
      `INSERT INTO appointments (
        appoint_id, appoint_userid, appoint_staffname,
        appoint_assigneduserid, appoint_assignedstaffname,
        appoint_clientautoid, appoint_clientname, appoint_clientaddress,
        appoint_clienttype, appoint_appointmentdate, appoint_timefrom,
        appoint_timeto, appoint_report, appoint_reportdate, appoint_notes,
        appoint_followupdate, appoint_followuptimefrom, appoint_followuptimeto,
        appoint_latitude, appoint_longitude, appoint_status,
        appointapproval_status, appointapproval_by,
        appoint_crtdby, appoint_crton, appoint_updby, appoint_updon,
        synced, is_deleted, retry_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tempAppointId,
        appointmentData.appoint_userid ?? null,
        appointmentData.appoint_staffname ?? null,
        appointmentData.appoint_assigneduserid ?? null,
        appointmentData.appoint_assignedstaffname ?? null,
        appointmentData.appoint_clientautoid ?? null,
        appointmentData.appoint_clientname ?? null,
        appointmentData.appoint_clientaddress ?? null,
        appointmentData.appoint_clienttype ?? null,
        appointmentData.appoint_appointmentdate,
        appointmentData.appoint_timefrom,
        appointmentData.appoint_timeto,
        appointmentData.appoint_report ?? null,
        appointmentData.appoint_reportdate ?? null,
        appointmentData.appoint_notes ?? null,
        appointmentData.appoint_followupdate ?? null,
        appointmentData.appoint_followuptimefrom ?? null,
        appointmentData.appoint_followuptimeto ?? null,
        appointmentData.appoint_latitude ?? null,
        appointmentData.appoint_longitude ?? null,
        appointmentData.appoint_status ?? 1,
        appointmentData.appointapproval_status ?? null,
        appointmentData.appointapproval_by ?? null,
        appointmentData.appoint_crtdby ?? null,
        appointmentData.appoint_crton ?? null,
        appointmentData.appoint_updby ?? null,
        appointmentData.appoint_updon ?? null,
        0, // synced
        0, // is_deleted
        0, // retry_count
        createdAt
      ]
    );

    return {
      localId: result.lastInsertRowId,
      tempAppointId: tempAppointId
    };
  } catch (error) {
    throw error;
  }
};

export const getUnsyncedAppointments = async () => {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM appointments WHERE synced = 0 AND is_deleted = 0 AND retry_count < 3 ORDER BY created_at ASC'
  );
  return rows;
};

export const getUnsyncedCount = async () => {
  const database = await getDatabase();
  const result = await database.getFirstAsync(
    'SELECT COUNT(*) as count FROM appointments WHERE synced = 0 AND is_deleted = 0 AND retry_count < 3'
  );
  return result?.count || 0;
};

export const markAsSynced = async (localId) => {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE appointments SET synced = 1 WHERE id = ?',
    [localId]
  );
};

export const updateAppointmentId = async (localId, backendId) => {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE appointments SET appoint_id = ? WHERE id = ?',
    [backendId, localId]
  );
};

export const incrementRetryCount = async (localId) => {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE appointments SET retry_count = retry_count + 1 WHERE id = ?',
    [localId]
  );
};

export const getAllLocalAppointments = async () => {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    'SELECT * FROM appointments WHERE is_deleted = 0 ORDER BY appoint_appointmentdate DESC, appoint_timefrom ASC'
  );
  return rows;
};

export const checkForDuplicates = async (clientAutoId, date, timeFrom) => {
  const database = await getDatabase();

  // Parse the time to check within 30 minutes
  const [hours, minutes] = timeFrom.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  const lowerBound = totalMinutes - 30;
  const upperBound = totalMinutes + 30;

  const lowerTime = `${String(Math.floor(Math.max(0, lowerBound) / 60)).padStart(2, '0')}:${String(Math.max(0, lowerBound) % 60).padStart(2, '0')}`;
  const upperTime = `${String(Math.floor(Math.min(1439, upperBound) / 60)).padStart(2, '0')}:${String(Math.min(1439, upperBound) % 60).padStart(2, '0')}`;

  const rows = await database.getAllAsync(
    `SELECT * FROM appointments
     WHERE appoint_clientautoid = ?
     AND appoint_appointmentdate = ?
     AND appoint_timefrom >= ?
     AND appoint_timefrom <= ?
     AND synced = 0
     AND is_deleted = 0`,
    [clientAutoId, date, lowerTime, upperTime]
  );

  return rows.length > 0 ? rows : null;
};
