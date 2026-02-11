# Phase 1: Offline Foundation - Research

**Researched:** 2026-02-11
**Domain:** Offline-first React Native app with SQLite persistence and automatic sync
**Confidence:** HIGH

## Summary

Phase 1 implements local SQLite persistence for appointment creation with automatic background synchronization to the backend, following the proven pattern already working for location tracking in this codebase. The existing location sync system provides a solid reference implementation using expo-sqlite async API, retry logic with exponential backoff, and synced flag tracking.

The research confirms that expo-sqlite 16.x (currently in use) provides all necessary features: async transaction support, parameterized queries for security, and singleton database connections. Network detection should use @react-native-community/netinfo for reliable connection monitoring. The temporary negative ID pattern (unique to this project) requires careful implementation during sync to replace local IDs with backend IDs after successful creation.

**Primary recommendation:** Mirror the existing location sync architecture (locationDB.js + LocationUploader.js) for appointments, creating appointmentDB.js for local storage and AppointmentUploader.js for sync logic. Use withExclusiveTransactionAsync for atomicity, implement 3-retry pattern matching location sync, and trigger uploads on connection restoration via NetInfo event listeners.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Database Schema:**
- Local SQLite table mirroring backend `appointments_tbl` structure
- Temporary negative IDs (-1, -2, etc.) for locally created appointments, replaced with real backend IDs after sync
- Track sync status with `synced` integer field (0=unsynced, 1=synced) - matches existing location pattern
- Store full client snapshot (doctor/clinic/hospital data) for complete offline display capability

**Sync Timing & Triggers:**
- Trigger sync on connection return - app detects when internet connection is restored
- Manual retry button available for workers to force sync attempt
- Send appointments one at a time (not batched) - clearer error handling per appointment
- Active app only - sync happens when app is open/foreground, not in background

**Conflict Resolution:**
- Phase 1 only handles NEW appointment creation - conflicts deferred to later phase
- Duplicate detection before sync: check for similar appointments (same client, date, time), warn worker before syncing
- No conflict resolution logic needed since these are new records that don't exist on backend yet

**Error & Retry Behavior:**
- Match location sync pattern: 3 retry attempts with delays between attempts
- Visual indicators only - icon/badge on appointment showing sync status (subtle, non-disruptive)
- Friendly error messages - no technical details for workers ("Couldn't sync appointment")

### Claude's Discretion

- Specific retry delay timing (exponential backoff or fixed intervals)
- Handling appointments that fail after all retries (safest approach for critical appointment data)
- Duplicate detection logic and similarity threshold
- Local SQLite field types, constraints, and indexes

### Deferred Ideas (OUT OF SCOPE)

- Conflict resolution for appointment edits - future phase when appointment updates are supported
- Background sync capability - keeping it simple for Phase 1, only sync when app is active
- Batch sync for efficiency - deferring to maintain clarity on which appointment fails

</user_constraints>

## Standard Stack

### Core Dependencies (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-sqlite | ~16.0.10 | Local SQLite database with async API | Official Expo solution, proven in location tracking, 6M+ weekly downloads |
| @react-native-async-storage/async-storage | 2.2.0 | Key-value storage for simple data | Official React Native Community library, already used for session management |
| axios | ^1.6.2 | HTTP client for API requests | Standard HTTP client, already configured in project with interceptors |
| react-navigation | ^6.1.9 | Screen navigation | Official navigation solution, already integrated |

### Required Addition

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-native-community/netinfo | ^11.x | Network connectivity detection | Detect connection restoration to trigger sync, standard for offline-first React Native apps (10M+ weekly downloads) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| expo-sqlite | Realm / WatermelonDB | More features but heavier (30-50MB), overkill for this phase's simple CRUD operations |
| @react-native-community/netinfo | Manual axios timeout checks | Unreliable, doesn't detect actual connectivity vs just internet access |
| Custom sync queue | react-native-offline | Redux dependency, architectural mismatch with current Context-based state |

**Installation:**
```bash
npx expo install @react-native-community/netinfo
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── locationDB.js         # Existing - reference pattern
│   └── appointmentDB.js      # New - mirrors location pattern
├── services/
│   ├── LocationUploader.js   # Existing - reference pattern
│   ├── AppointmentUploader.js # New - mirrors location pattern
│   └── AppointmentService.js # Existing - extend for create
├── screens/
│   ├── AppointmentsScreen.js # Existing - add create navigation
│   └── AppointmentCreateScreen.js # New - offline-capable form
└── context/
    └── SyncContext.js        # New - centralize sync state/triggers
```

### Pattern 1: Database Layer (Singleton + Async API)

**What:** Initialize database once, reuse connection, use async methods for all operations

**When to use:** For all database operations in React Native with expo-sqlite

**Example:**
```javascript
// Source: Current codebase D:\ddcmarketingmobile\src\db\locationDB.js
// HIGH confidence - proven working pattern in this project

import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'appointments.db';
let db = null;
let tableCreated = false;

const getDatabase = async () => {
  try {
    if (!db) {
      db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    }

    if (!tableCreated && db) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS appointments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          appoint_id INTEGER,  -- Backend ID after sync (-1, -2 before)
          appoint_clientname TEXT,
          appoint_appointmentdate TEXT,
          appoint_timefrom TEXT,
          appoint_timeto TEXT,
          synced INTEGER DEFAULT 0,
          created_at TEXT,
          -- ... other backend fields
        );
      `);
      tableCreated = true;
    }
    return db;
  } catch (error) {
    db = null;
    tableCreated = false;
    throw error;
  }
};

export const insertAppointment = async (appointment) => {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO appointments (...) VALUES (?, ?, ...)`,
    [appointment.clientName, appointment.date, ...]
  );
  return result.lastInsertRowId;
};
```

### Pattern 2: Sync Uploader with Retry Logic

**What:** Separate service handles fetching unsynced records, uploading to backend, marking as synced

**When to use:** For any offline-first sync operation

**Example:**
```javascript
// Source: Current codebase D:\ddcmarketingmobile\src\services\LocationUploader.js
// HIGH confidence - proven working pattern in this project

import { getUnsyncedAppointments, markAsSynced } from '../db/appointmentDB';
import api from '../config/api';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const uploadUnsyncedAppointments = async (token) => {
  const unsyncedAppointments = await getUnsyncedAppointments();

  let uploaded = 0;
  let failed = 0;

  // Process one at a time (per user decision)
  for (const appointment of unsyncedAppointments) {
    let success = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await api.post(
          '/appointment/create',
          appointment,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // CRITICAL: Update local record with backend ID
        await updateAppointmentId(appointment.id, response.data.appoint_id);
        await markAsSynced(appointment.id);
        uploaded++;
        success = true;
        break;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS * attempt); // Linear backoff
        }
      }
    }

    if (!success) {
      failed++;
    }
  }

  return { uploaded, failed };
};
```

### Pattern 3: Connection Detection with NetInfo

**What:** Subscribe to network state changes, trigger sync when connection returns

**When to use:** To detect connectivity restoration for automatic sync

**Example:**
```javascript
// Source: Official @react-native-community/netinfo docs
// HIGH confidence - official pattern from library documentation

import NetInfo from '@react-native-community/netinfo';
import { uploadUnsyncedAppointments } from '../services/AppointmentUploader';

useEffect(() => {
  const unsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable) {
      // Connection restored - trigger sync
      uploadUnsyncedAppointments(token)
        .then(result => {
          if (result.uploaded > 0) {
            // Show subtle success indicator
          }
        })
        .catch(err => {
          // Silent failure, will retry next time
        });
    }
  });

  return () => unsubscribe();
}, [token]);
```

### Pattern 4: Temporary Negative ID Management

**What:** Use negative integers (-1, -2, -3...) for locally created records, replace with real backend ID after sync

**When to use:** When backend uses auto-increment IDs and you need to reference records before sync

**Example:**
```javascript
// Source: Project-specific pattern from CONTEXT.md
// MEDIUM confidence - custom pattern, not widely documented

let nextTempId = -1;

export const insertAppointment = async (appointmentData) => {
  const database = await getDatabase();

  const result = await database.runAsync(
    `INSERT INTO appointments (appoint_id, ..., synced) VALUES (?, ..., 0)`,
    [nextTempId, ...] // Start with negative ID
  );

  nextTempId--; // Decrement for next local appointment

  return {
    localId: result.lastInsertRowId,
    tempAppointId: nextTempId + 1
  };
};

export const updateAppointmentId = async (localId, backendId) => {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE appointments SET appoint_id = ? WHERE id = ?',
    [backendId, localId]
  );
};
```

### Pattern 5: Duplicate Detection Before Sync

**What:** Query local and recent backend data to check for similar appointments before syncing

**When to use:** To prevent accidental duplicate submissions

**Example:**
```javascript
// Source: SQLite duplicate detection patterns from web research
// MEDIUM confidence - standard SQL pattern adapted to use case

export const checkForDuplicates = async (appointment) => {
  const database = await getDatabase();

  // Check local unsynced appointments
  const localDupes = await database.getAllAsync(
    `SELECT * FROM appointments
     WHERE appoint_clientautoid = ?
     AND appoint_appointmentdate = ?
     AND ABS(strftime('%s', appoint_timefrom) - strftime('%s', ?)) < 1800
     AND synced = 0`,
    [appointment.clientAutoId, appointment.date, appointment.timeFrom]
  );

  return localDupes.length > 0 ? localDupes : null;
};

// Use before sync:
const duplicates = await checkForDuplicates(appointment);
if (duplicates) {
  // Show warning to user with option to proceed or cancel
  Alert.alert(
    'Similar Appointment Found',
    'An appointment with this client at a similar time already exists. Continue?',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Create Anyway', onPress: () => proceedWithSync(appointment) }
    ]
  );
}
```

### Anti-Patterns to Avoid

- **Creating new database connection per query:** Always use singleton pattern - unnecessary overhead and potential for locked database
- **Using execAsync with user input:** SQL injection risk - always use runAsync with parameterized queries
- **Batching appointment uploads:** User decided one-at-a-time for clearer error handling per appointment
- **Optimistic backend ID assignment:** Never assign expected backend ID locally - always wait for actual response
- **Silent sync failures:** User must be able to see which appointments failed to sync via visual indicators

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Network connectivity detection | Custom axios timeout loops | @react-native-community/netinfo | Handles edge cases (captive portals, wifi without internet), cross-platform, battle-tested |
| Date/time parsing and formatting | String manipulation | SQLite's built-in date functions OR JavaScript Date with ISO8601 | Timezone edge cases, DST transitions, locale variations |
| Retry logic with backoff | Manual setTimeout chains | Structured retry function with configurable delays | Easy to get wrong (promise chains, cancellation, max attempts) |
| Form validation | Custom regex per field | React Hook Form with schema validation | Performance (fewer re-renders), accessibility, error messages |
| SQLite transactions | Manual BEGIN/COMMIT/ROLLBACK | expo-sqlite withExclusiveTransactionAsync | Automatic rollback on error, prevents external query interference |

**Key insight:** The location sync implementation already exists and works reliably in production. Don't reinvent patterns - mirror the structure and adapt for appointments. The complexity is in the domain (appointments vs locations), not the sync mechanism.

## Common Pitfalls

### Pitfall 1: Database Locked Errors

**What goes wrong:** Multiple simultaneous database writes cause "database is locked" errors

**Why it happens:** SQLite allows only one write at a time; non-exclusive transactions can interfere with each other

**How to avoid:** Use `withExclusiveTransactionAsync` for all write operations that must be atomic

**Warning signs:** "Database is locked" errors in logs, intermittent write failures under load

**Example:**
```javascript
// BAD - non-exclusive allows interference
await db.withTransactionAsync(async () => {
  await db.runAsync('INSERT INTO appointments ...');
  await db.runAsync('UPDATE appointments SET synced = 1 ...');
});

// GOOD - exclusive prevents interference
await db.withExclusiveTransactionAsync(async () => {
  await db.runAsync('INSERT INTO appointments ...');
  await db.runAsync('UPDATE appointments SET synced = 1 ...');
});
```

### Pitfall 2: Negative ID Collision with Backend

**What goes wrong:** Backend already has appointments with negative IDs, causing confusion after sync

**Why it happens:** Backend schema doesn't prevent negative IDs; temporary local IDs conflict with real data

**How to avoid:**
1. Ensure backend schema uses unsigned integers or positive-only constraint
2. Start temporary IDs at very negative number (e.g., -1000000) to avoid collision
3. Always replace temp ID immediately after successful backend insert

**Warning signs:** Appointments display wrong data after sync, duplicate appointments appearing

### Pitfall 3: Syncing Deleted Appointments

**What goes wrong:** User creates appointment offline, deletes it locally, but it still syncs to backend on connection

**Why it happens:** No `is_deleted` flag tracked, only `synced` flag

**How to avoid:** Add `is_deleted INTEGER DEFAULT 0` field, check before syncing:

```javascript
export const getUnsyncedAppointments = async () => {
  const database = await getDatabase();
  return await database.getAllAsync(
    'SELECT * FROM appointments WHERE synced = 0 AND is_deleted = 0 ORDER BY created_at ASC'
  );
};
```

**Warning signs:** Appointments reappear after deletion, backend has records user "deleted"

### Pitfall 4: ISO8601 Format Inconsistency

**What goes wrong:** Date/time fields stored in different formats break SQLite date functions and backend parsing

**Why it happens:** JavaScript Date.toString(), toLocaleString(), and toISOString() produce different formats

**How to avoid:** Always use `toISOString()` for storage, SQLite date functions for queries:

```javascript
// ALWAYS use this for storage
const timestamp = new Date().toISOString(); // "2026-02-11T14:30:00.000Z"

// SQLite can sort and compare these directly
await db.runAsync(
  'SELECT * FROM appointments WHERE appoint_appointmentdate >= ? ORDER BY appoint_appointmentdate',
  [timestamp]
);
```

**Warning signs:** Date queries return wrong results, backend rejects date format, sorting doesn't work

### Pitfall 5: Context Re-render Cascade

**What goes wrong:** Updating sync status in Context causes every screen to re-render

**Why it happens:** Context value object changes identity on every state update

**How to avoid:** Split contexts - SyncStateContext (changes frequently) vs SyncActionsContext (stable):

```javascript
// GOOD - split by update frequency
const SyncStateContext = createContext();
const SyncActionsContext = createContext();

function SyncProvider({ children }) {
  const [syncStatus, setSyncStatus] = useState({});

  // Actions are stable - won't cause re-renders
  const actions = useMemo(() => ({
    triggerSync: () => uploadUnsyncedAppointments(token),
    updateStatus: (id, status) => setSyncStatus(prev => ({ ...prev, [id]: status }))
  }), [token]);

  return (
    <SyncActionsContext.Provider value={actions}>
      <SyncStateContext.Provider value={syncStatus}>
        {children}
      </SyncStateContext.Provider>
    </SyncActionsContext.Provider>
  );
}
```

**Warning signs:** Entire app sluggish during sync, unrelated screens re-rendering, React DevTools shows excessive renders

### Pitfall 6: No Retry Limit for Permanently Failed Records

**What goes wrong:** Appointments that can't sync (e.g., invalid client ID) retry forever, blocking newer appointments

**Why it happens:** No max retry count tracked per record

**How to avoid:** Add `retry_count INTEGER DEFAULT 0` field, skip after threshold:

```javascript
export const getUnsyncedAppointments = async () => {
  const database = await getDatabase();
  return await database.getAllAsync(
    'SELECT * FROM appointments WHERE synced = 0 AND retry_count < 3 ORDER BY created_at'
  );
};

// After failed sync
await database.runAsync(
  'UPDATE appointments SET retry_count = retry_count + 1 WHERE id = ?',
  [localId]
);
```

**Warning signs:** Sync never completes, same error repeating in logs, newer appointments not syncing

## Code Examples

### Database Initialization with Migrations

```javascript
// Source: Expo SQLite documentation + project pattern
// HIGH confidence

import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'appointments.db';
const CURRENT_SCHEMA_VERSION = 1;

let db = null;
let initialized = false;

const getDatabase = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  if (!initialized) {
    await runMigrations(db);
    initialized = true;
  }

  return db;
};

const runMigrations = async (database) => {
  const result = await database.getFirstAsync('PRAGMA user_version');
  const currentVersion = result?.user_version || 0;

  if (currentVersion < 1) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appoint_id INTEGER NOT NULL,
        appoint_userid INTEGER,
        appoint_staffname TEXT,
        appoint_clientautoid INTEGER,
        appoint_clientname TEXT,
        appoint_clientaddress TEXT,
        appoint_clienttype TEXT,
        appoint_appointmentdate TEXT NOT NULL,
        appoint_timefrom TEXT NOT NULL,
        appoint_timeto TEXT NOT NULL,
        appoint_notes TEXT,
        appoint_latitude REAL,
        appoint_longitude REAL,
        synced INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );

      CREATE INDEX idx_appointments_synced ON appointments(synced);
      CREATE INDEX idx_appointments_date ON appointments(appoint_appointmentdate);

      PRAGMA user_version = 1;
    `);
  }

  // Future migrations: if (currentVersion < 2) { ... }
};

export const createTable = async () => {
  await getDatabase();
};
```

### Insert Appointment with Temp ID

```javascript
// Source: Project-specific pattern
// MEDIUM confidence

let nextTempId = -1;

export const insertAppointment = async (appointmentData) => {
  const database = await getDatabase();

  const now = new Date().toISOString();

  const result = await database.runAsync(
    `INSERT INTO appointments (
      appoint_id, appoint_userid, appoint_staffname,
      appoint_clientautoid, appoint_clientname, appoint_clientaddress, appoint_clienttype,
      appoint_appointmentdate, appoint_timefrom, appoint_timeto,
      appoint_notes, appoint_latitude, appoint_longitude,
      synced, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      nextTempId,
      appointmentData.userId,
      appointmentData.staffName,
      appointmentData.clientAutoId,
      appointmentData.clientName,
      appointmentData.clientAddress,
      appointmentData.clientType,
      appointmentData.date,
      appointmentData.timeFrom,
      appointmentData.timeTo,
      appointmentData.notes,
      appointmentData.latitude,
      appointmentData.longitude,
      now
    ]
  );

  const insertedTempId = nextTempId;
  nextTempId--; // Decrement for next appointment

  return {
    localId: result.lastInsertRowId,
    tempAppointId: insertedTempId
  };
};
```

### Get Unsynced Appointments

```javascript
// Source: Current location pattern
// HIGH confidence

export const getUnsyncedAppointments = async () => {
  const database = await getDatabase();
  const rows = await database.getAllAsync(
    `SELECT * FROM appointments
     WHERE synced = 0
     AND is_deleted = 0
     AND retry_count < 3
     ORDER BY created_at ASC`
  );
  return rows;
};

export const getUnsyncedCount = async () => {
  const database = await getDatabase();
  const result = await database.getFirstAsync(
    `SELECT COUNT(*) as count FROM appointments
     WHERE synced = 0 AND is_deleted = 0 AND retry_count < 3`
  );
  return result?.count || 0;
};
```

### Upload with ID Replacement

```javascript
// Source: Location uploader pattern + custom ID logic
// HIGH confidence

import api from '../config/api';
import { getUnsyncedAppointments, markAsSynced, updateAppointmentId, incrementRetryCount } from '../db/appointmentDB';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const uploadUnsyncedAppointments = async (token) => {
  const unsyncedAppointments = await getUnsyncedAppointments();

  if (unsyncedAppointments.length === 0) {
    return { uploaded: 0, failed: 0 };
  }

  let uploaded = 0;
  let failed = 0;

  // Process one at a time (per user decision)
  for (const appointment of unsyncedAppointments) {
    let success = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Transform to backend format
        const payload = {
          appoint_userid: appointment.appoint_userid,
          appoint_staffname: appointment.appoint_staffname,
          appoint_clientautoid: appointment.appoint_clientautoid,
          appoint_clientname: appointment.appoint_clientname,
          appoint_clientaddress: appointment.appoint_clientaddress,
          appoint_clienttype: appointment.appoint_clienttype,
          appoint_appointmentdate: appointment.appoint_appointmentdate,
          appoint_timefrom: appointment.appoint_timefrom,
          appoint_timeto: appointment.appoint_timeto,
          appoint_notes: appointment.appoint_notes,
          appoint_latitude: appointment.appoint_latitude,
          appoint_longitude: appointment.appoint_longitude
        };

        const response = await api.post(
          '/appointment/create',
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        // CRITICAL: Replace temp ID with real backend ID
        if (response.data && response.data.appoint_id) {
          await updateAppointmentId(appointment.id, response.data.appoint_id);
          await markAsSynced(appointment.id);
          uploaded++;
          success = true;
          break;
        }
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS * attempt); // Linear backoff
        }
      }
    }

    if (!success) {
      await incrementRetryCount(appointment.id);
      failed++;
    }
  }

  return { uploaded, failed };
};
```

### Network Detection and Auto-Sync

```javascript
// Source: NetInfo official docs
// HIGH confidence

import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { uploadUnsyncedAppointments } from '../services/AppointmentUploader';
import { useAuth } from '../context/AuthContext';

export const useAutoSync = () => {
  const { token } = useAuth();
  const isSyncing = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      // Only sync if connected and not already syncing
      if (state.isConnected && state.isInternetReachable && !isSyncing.current && token) {
        isSyncing.current = true;

        try {
          const result = await uploadUnsyncedAppointments(token);

          if (result.uploaded > 0) {
            console.log(`Synced ${result.uploaded} appointments`);
            // Could show subtle toast notification
          }

          if (result.failed > 0) {
            console.log(`Failed to sync ${result.failed} appointments`);
          }
        } catch (error) {
          console.error('Auto-sync error:', error);
        } finally {
          isSyncing.current = false;
        }
      }
    });

    return () => unsubscribe();
  }, [token]);
};
```

### Manual Retry Button

```javascript
// Source: Standard React Native pattern
// HIGH confidence

import { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native';
import { uploadUnsyncedAppointments } from '../services/AppointmentUploader';
import { getUnsyncedCount } from '../db/appointmentDB';
import { useAuth } from '../context/AuthContext';

const SyncButton = () => {
  const { token } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);

  useEffect(() => {
    const loadCount = async () => {
      const count = await getUnsyncedCount();
      setUnsyncedCount(count);
    };

    loadCount();
    const interval = setInterval(loadCount, 5000); // Update every 5s
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);

    try {
      const result = await uploadUnsyncedAppointments(token);

      if (result.uploaded > 0 || result.failed === 0) {
        Alert.alert('Sync Complete', `${result.uploaded} appointments synced successfully`);
      } else {
        Alert.alert('Sync Failed', `Couldn't sync ${result.failed} appointments. Please try again later.`);
      }

      // Refresh count
      const newCount = await getUnsyncedCount();
      setUnsyncedCount(newCount);
    } catch (error) {
      Alert.alert('Sync Error', 'Couldn't sync appointments. Check your connection.');
    } finally {
      setSyncing(false);
    }
  };

  if (unsyncedCount === 0) {
    return null; // Hide button when nothing to sync
  }

  return (
    <TouchableOpacity
      onPress={handleSync}
      disabled={syncing}
      style={styles.syncButton}
    >
      {syncing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.syncButtonText}>
          Sync {unsyncedCount} Appointment{unsyncedCount !== 1 ? 's' : ''}
        </Text>
      )}
    </TouchableOpacity>
  );
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| expo-sqlite callback API | expo-sqlite async/await API | Expo SDK 48+ (2023) | Cleaner async code, better error handling, no callback hell |
| Global NetInfo.fetch() polling | NetInfo.addEventListener() hook | NetInfo 5.x+ (2020) | Real-time updates, no polling overhead, instant sync trigger |
| Manual transaction BEGIN/COMMIT | withExclusiveTransactionAsync | Expo SDK 49+ (2023) | Automatic rollback, prevents query interference |
| Separate location/appointment DBs | Single DB with multiple tables | Not changed | Could consolidate but current separate DBs work fine |
| Fixed retry delays | Exponential backoff with jitter | Industry best practice (ongoing) | Better for server load, but linear backoff acceptable for low-volume |

**Deprecated/outdated:**
- **expo-sqlite SQLite.openDatabase()**: Replaced by SQLite.openDatabaseAsync() in Expo SDK 48+
- **NetInfo.isConnected**: Deprecated in NetInfo 4.0, use state.isConnected from addEventListener or fetch()
- **AsyncStorage from react-native**: Moved to @react-native-async-storage/async-storage community package

## Open Questions

### 1. Exponential vs Linear Backoff for Retries

**What we know:**
- Current location sync uses linear backoff (1s, 2s, 3s)
- Industry best practice is exponential with jitter
- User decision: "3 retry attempts with delays between attempts" (no specifics)

**What's unclear:**
- Whether to match location pattern exactly or upgrade to exponential
- If jitter is needed for appointment sync (low volume, unlikely to have thundering herd)

**Recommendation:**
- **Use linear backoff matching location pattern** for consistency
- Future optimization: Switch both to exponential when scaling up
- Formula: `delay = RETRY_DELAY_MS * attempt` (1000, 2000, 3000ms)

### 2. Client Data Storage Strategy

**What we know:**
- User decision: "Store full client snapshot for complete offline display capability"
- Backend has separate tables: doctors_table, clinics_tbl, hospital_tbl
- Need to support inline client creation if not found

**What's unclear:**
- Should we cache all clients locally in separate tables?
- Or only store client data within appointment records?
- How to handle client updates (name/address changes)?

**Recommendation:**
- **Phase 1: Store only within appointment records** (appoint_clientname, appoint_clientaddress fields)
- Fetch client lists on-demand when creating appointment (requires connection)
- Phase 2: Add local client cache tables for full offline client selection

### 3. Handling Permanently Failed Appointments

**What we know:**
- User decision: "3 retry attempts with delays"
- After 3 retries, appointment remains in local DB with retry_count = 3
- Worker needs to see which appointments failed

**What's unclear:**
- Should failed appointments be manually retryable?
- Should they be editable to fix issues (e.g., wrong client ID)?
- Should there be a "discard failed appointment" option?

**Recommendation:**
- **Add "Failed to Sync" status badge** on appointments with retry_count >= 3
- **Provide "Retry Now" button** on individual failed appointments (resets retry_count)
- **No automatic discard** - critical appointment data, worker decides
- Include in manual sync button (retry all failures)

## Sources

### Primary (HIGH confidence)

- **Expo SQLite Documentation**: https://docs.expo.dev/versions/latest/sdk/sqlite/ - Transaction methods, runAsync vs execAsync, migration patterns
- **Current Codebase**: D:\ddcmarketingmobile\src\db\locationDB.js, src\services\LocationUploader.js - Working reference implementation
- **@react-native-community/netinfo NPM**: https://www.npmjs.com/package/@react-native-community/netinfo - Network detection API
- **SQLite.org Datatypes**: https://sqlite.org/datatype3.html - Date/time storage recommendations

### Secondary (MEDIUM confidence)

- [Expo SQLite: A Complete Guide for Offline-First React Native Apps](https://medium.com/@aargon007/expo-sqlite-a-complete-guide-for-offline-first-react-native-apps-984fd50e3adb) - Offline-first patterns
- [Implementing Offline-First Architecture with Local Databases in React Native](https://www.innovationm.com/blog/react-native-offline-first-architecture-sqlite-local-database-guide/) - Sync queue patterns
- [Building Offline-First React Native Apps with React Query and TypeScript](https://www.whitespectre.com/ideas/how-to-build-offline-first-react-native-apps-with-react-query-and-typescript/) - Sync strategies
- [Best Practices of using Offline Storage (AsyncStorage, SQLite) in React Native](https://medium.com/@tusharkumar27864/best-practices-of-using-offline-storage-asyncstorage-sqlite-in-react-native-projects-dae939e28570) - When to use SQLite vs AsyncStorage
- [How to Implement Retry Logic with Exponential Backoff in Node.js](https://oneuptime.com/blog/post/2026-01-06-nodejs-retry-exponential-backoff/view) - Retry patterns
- [React Native Dropdown Picker](https://hossein-zare.github.io/react-native-dropdown-picker-website/) - Client selection UI
- [Date and Time Handling with SQLite Functions: Best Practices](https://www.slingacademy.com/article/date-and-time-handling-with-sqlite-functions-best-practices/) - ISO8601 storage
- [How to Handle React Context Performance Issues](https://oneuptime.com/blog/post/2026-01-24-react-context-performance-issues/view) - Context optimization
- [Error Handling in Mobile Apps: Best Practices](https://maestro.dev/insights/error-handling-mobile-apps-best-practices) - User-friendly error messages
- [Optimizing FlatList Configuration - React Native](https://reactnative.dev/docs/optimizing-flatlist-configuration) - List performance

### Tertiary (LOW confidence)

- Web search results on temporary negative ID patterns - custom implementation, not widely documented
- SQLite duplicate detection patterns - need to adapt generic patterns to appointment-specific logic

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing packages in use, proven in production location sync
- Architecture: HIGH - Direct reference from working location sync implementation
- Pitfalls: MEDIUM-HIGH - Mix of documented issues and extrapolation from codebase patterns
- Negative ID pattern: MEDIUM - Custom to this project, no official documentation found
- Network detection: HIGH - Official NetInfo documentation and examples

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (30 days - stable ecosystem, unlikely to change rapidly)

**Key research gaps filled:**
- Confirmed expo-sqlite 16.x supports all required features
- Identified NetInfo as standard for connection detection
- Validated location sync pattern as solid foundation
- Researched duplicate detection approaches
- Investigated retry strategies (linear vs exponential)

**Known limitations:**
- No official documentation for temporary negative ID pattern
- Client data caching strategy needs Phase 2 planning
- Form validation library choice deferred (can use plain React Native for MVP)
