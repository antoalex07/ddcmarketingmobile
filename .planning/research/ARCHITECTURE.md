# Architecture Research

**Domain:** React Native Field Worker App - Appointment Creation Integration
**Researched:** 2026-02-10
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Session    │  │ Appointments │  │ Appointment  │          │
│  │   Screen     │  │   Screen     │  │Update Screen │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         │          ┌───────┴──────────────────┘                 │
│         │          │                                             │
├─────────┴──────────┴─────────────────────────────────────────────┤
│                        SERVICE LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Session    │  │ Appointment  │  │  Location    │          │
│  │   Service    │  │   Service    │  │  Uploader    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                 │
│                            │                                     │
│                    ┌───────┴───────┐                            │
│                    │   API Client  │                            │
│                    │   (axios)     │                            │
│                    └───────────────┘                            │
├─────────────────────────────────────────────────────────────────┤
│                     DATA PERSISTENCE LAYER                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────┐  ┌───────────────────────┐          │
│  │   SQLite Database      │  │   AsyncStorage        │          │
│  │   - locations          │  │   - token             │          │
│  │   (offline cache)      │  │   - user              │          │
│  └────────────────────────┘  │   - session_id        │          │
│                               └───────────────────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                     BACKGROUND SERVICES                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌────────────────────────┐          │
│  │  Location Tracking   │  │  Periodic Sync Timer   │          │
│  │  (TaskManager)       │  │  (5-min intervals)     │          │
│  └──────────────────────┘  └────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Screens** | UI rendering, local state, user interaction | React functional components with useState hooks |
| **Services** | API communication, normalized response format | Async functions returning `{success, data, message}` |
| **SQLite DB** | Offline data storage, synced flag management | expo-sqlite with async/await pattern |
| **AsyncStorage** | Auth persistence (token, user, session_id) | Key-value store for authentication state |
| **AuthContext** | Global auth state, token management | React Context with provider pattern |
| **Location Uploader** | Batch upload with retry logic | Groups by session, 50-point batches, 3 retries |
| **TaskManager** | Background location tracking | expo-task-manager for persistent background work |

## Recommended Project Structure

```
src/
├── screens/            # React Native screens
│   ├── SessionScreen.js
│   ├── AppointmentsScreen.js
│   ├── AppointmentUpdateScreen.js
│   └── AppointmentCreateScreen.js    # NEW - Appointment creation form
├── services/           # API service layer
│   ├── SessionService.js
│   ├── AppointmentService.js          # EXTEND - Add createAppointment method
│   ├── LocationUploader.js
│   └── AppointmentUploader.js         # NEW - Handles offline appointment sync
├── db/                 # SQLite database layer
│   ├── locationDB.js
│   └── appointmentDB.js               # NEW - Appointment offline cache
├── context/            # React context providers
│   └── AuthContext.js
├── config/             # Configuration
│   └── api.js                         # Axios instance with interceptors
└── utils/              # Utility functions
    └── batteryOptimization.js
```

### Structure Rationale

- **screens/**: Presentation layer separated by feature, each screen owns its local UI state
- **services/**: Business logic layer, all API calls go through services with normalized responses
- **db/**: Data persistence layer, SQLite for offline-capable data (locations, appointments)
- **context/**: Global state management using React Context (currently only auth)
- **config/**: Centralized API configuration with axios interceptors for logging
- **utils/**: Shared utility functions for cross-cutting concerns

## Architectural Patterns

### Pattern 1: Normalized Service Response

**What:** All service methods return a consistent response format: `{success: boolean, data?: any, message?: string}`

**When to use:** Every API call through the service layer

**Trade-offs:**
- Pros: Consistent error handling, predictable response structure, easy to mock for testing
- Cons: Slightly more verbose than throwing errors directly

**Example:**
```javascript
// AppointmentService.js
export const appointmentService = {
  getAppointments: async (token, staffId) => {
    try {
      const response = await api.get(`/appointment/getallappointments/${staffId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch appointments',
      };
    }
  },
};

// Usage in screen
const result = await appointmentService.getAppointments(token, staffId);
if (result.success) {
  setAppointments(result.data.appointments);
} else {
  Alert.alert('Error', result.message);
}
```

### Pattern 2: SQLite Offline Cache with Sync Flag

**What:** Local SQLite table caches data when offline, uses `synced` flag (0/1) to track upload status

**When to use:** For data that needs to work offline and sync later (locations, appointments)

**Trade-offs:**
- Pros: Reliable offline support, no data loss, works even with poor connectivity
- Cons: Requires sync logic, potential for sync conflicts, database maintenance overhead

**Example:**
```javascript
// locationDB.js pattern
export const insertPoint = async (point) => {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO locations (session_id, latitude, longitude, ..., synced)
     VALUES (?, ?, ?, ..., ?)`,
    [point.session_id, point.latitude, point.longitude, ..., 0] // synced = 0
  );
  return result.lastInsertRowId;
};

export const getUnsyncedPoints = async () => {
  const database = await getDatabase();
  return await database.getAllAsync(
    'SELECT * FROM locations WHERE synced = 0 ORDER BY timestamp ASC'
  );
};

export const markAsSynced = async (ids) => {
  const database = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await database.runAsync(
    `UPDATE locations SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
};
```

### Pattern 3: Batch Upload with Retry Logic

**What:** Group unsynced records by related entity (e.g., session_id), upload in batches with exponential backoff retry

**When to use:** Syncing cached offline data to backend

**Trade-offs:**
- Pros: Network-efficient, resilient to temporary failures, reduces API load
- Cons: More complex than single uploads, potential for partial batch failures

**Example:**
```javascript
// LocationUploader.js pattern
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export const uploadUnsyncedLocations = async (token) => {
  const unsyncedPoints = await getUnsyncedPoints();

  // Group by session_id
  const pointsBySession = {};
  for (const point of unsyncedPoints) {
    if (!pointsBySession[point.session_id]) {
      pointsBySession[point.session_id] = [];
    }
    pointsBySession[point.session_id].push(point);
  }

  let uploaded = 0;
  let failed = 0;

  // Upload each session's points in batches
  for (const [sessionId, points] of Object.entries(pointsBySession)) {
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(p => p.id);

      let success = false;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await uploadBatch(token, sessionId, batch);
          await markAsSynced(batchIds);
          uploaded += batch.length;
          success = true;
          break;
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            await delay(RETRY_DELAY_MS * attempt); // Exponential backoff
          }
        }
      }

      if (!success) {
        failed += batch.length;
      }
    }
  }

  return { uploaded, failed };
};
```

### Pattern 4: React Navigation with Param Passing

**What:** Navigation between screens with typed parameters for data passing

**When to use:** Navigating between related screens (list to detail, create to list)

**Trade-offs:**
- Pros: Simple, works offline, no global state pollution
- Cons: Data must be serializable, not suitable for large datasets

**Example:**
```javascript
// From AppointmentsScreen.js - navigating to update
<TouchableOpacity
  onPress={() => {
    navigation.navigate('AppointmentUpdate', { appointment: item });
  }}
>
  {/* Appointment card UI */}
</TouchableOpacity>

// In AppointmentUpdateScreen.js - receiving params
const AppointmentUpdateScreen = ({ route, navigation }) => {
  const { appointment } = route.params;
  // Use appointment data...
};
```

## Data Flow

### Request Flow for Appointment Creation

```
[User fills form in AppointmentCreateScreen]
    ↓
[Submit button pressed]
    ↓
[Check network connectivity]
    ↓
├─ ONLINE ──────────────────────────────────────────┐
│   ↓                                                │
│   [appointmentService.createAppointment(token, data)]
│   ↓                                                │
│   [POST /appointment/create via axios]             │
│   ↓                                                │
│   [Backend creates appointment, returns ID]        │
│   ↓                                                │
│   [Navigate back to Appointments list]             │
│   ↓                                                │
│   [List screen refetches appointments]             │
│                                                    │
└─ OFFLINE ─────────────────────────────────────────┤
    ↓                                                │
    [appointmentDB.insertAppointment(data, synced=0)]│
    ↓                                                │
    [Store in SQLite with temporary local ID]        │
    ↓                                                │
    [Navigate back with success message]             │
    ↓                                                │
    [Background sync picks up unsynced appointments] │
    ↓                                                │
    [appointmentUploader.uploadUnsyncedAppointments()]│
    ↓                                                │
    [POST to backend, receive real ID]               │
    ↓                                                │
    [Update local record: synced=1, real ID]         │
```

### State Management Flow

```
[AsyncStorage]
    ↓ (on app start)
[AuthContext loads token, user]
    ↓ (provides via context)
[Screens consume via useAuth() hook]
    ↓ (pass token to services)
[Services make authenticated API calls]
    ↓ (return normalized response)
[Screens update local state]
    ↓ (trigger re-render)
[UI reflects new data]
```

### Key Data Flows

1. **Appointment List Fetching:** AppointmentsScreen → appointmentService.getAppointments → Backend API → Normalize response → Update screen state → Render list
2. **Appointment Creation (Online):** AppointmentCreateScreen → appointmentService.createAppointment → POST to backend → Receive appointment ID → Navigate back → List screen refetches
3. **Appointment Creation (Offline):** AppointmentCreateScreen → appointmentDB.insertAppointment → SQLite with synced=0 → Navigate back → Background sync → appointmentUploader → Backend → Update synced=1
4. **Location Tracking:** TaskManager (background) → insertPoint(synced=0) → SQLite → LocationUploader (periodic) → Batch upload → markAsSynced → SQLite updated

## Integration Points for Appointment Creation

### 1. Navigation Integration

**Add to App.js:**
```javascript
<Stack.Screen
  name="AppointmentCreate"
  component={AppointmentCreateScreen}
  options={{ title: 'Create Appointment' }}
/>
```

**Add button to AppointmentsScreen.js:**
```javascript
<TouchableOpacity
  style={styles.createButton}
  onPress={() => navigation.navigate('AppointmentCreate')}
>
  <Text style={styles.createButtonText}>+ Create Appointment</Text>
</TouchableOpacity>
```

### 2. Service Layer Extension

**Extend AppointmentService.js:**
```javascript
export const appointmentService = {
  // ... existing methods ...

  createAppointment: async (token, appointmentData) => {
    try {
      const response = await api.post('/appointment/create', appointmentData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to create appointment',
      };
    }
  },
};
```

### 3. Database Schema Addition

**Create appointmentDB.js:**
```javascript
// Schema mirrors backend appointment structure
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appoint_id INTEGER,                  -- Real ID from backend (null if unsynced)
  staff_id INTEGER,                    -- From AuthContext user
  appoint_clientname TEXT,
  appoint_clientaddress TEXT,
  appoint_appointmentdate TEXT,        -- ISO date string
  appoint_timefrom TEXT,               -- HH:MM format
  appoint_timeto TEXT,                 -- HH:MM format
  appoint_status INTEGER DEFAULT 1,    -- 1 = Scheduled by default
  created_at TEXT,                     -- ISO timestamp
  synced INTEGER DEFAULT 0             -- 0 = unsynced, 1 = synced
);
```

### 4. Sync Strategy Integration

**Create AppointmentUploader.js (follows LocationUploader pattern):**
```javascript
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;

export const uploadUnsyncedAppointments = async (token) => {
  const unsyncedAppointments = await getUnsyncedAppointments();

  let uploaded = 0;
  let failed = 0;

  // Upload in batches
  for (let i = 0; i < unsyncedAppointments.length; i += BATCH_SIZE) {
    const batch = unsyncedAppointments.slice(i, i + BATCH_SIZE);

    for (const appointment of batch) {
      let success = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await appointmentService.createAppointment(token, appointment);

          if (result.success) {
            // Update local record with real ID and mark as synced
            await updateAppointmentWithRealId(
              appointment.id,
              result.data.appointmentId
            );
            await markAppointmentAsSynced(appointment.id);
            uploaded++;
            success = true;
            break;
          }
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            await delay(1000 * attempt);
          }
        }
      }

      if (!success) {
        failed++;
      }
    }
  }

  return { uploaded, failed };
};
```

**Add periodic sync to SessionScreen.js (or App.js):**
```javascript
useEffect(() => {
  if (!token) return;

  const syncAppointments = async () => {
    try {
      await uploadUnsyncedAppointments(token);
    } catch (error) {
      // Silent fail, will retry next interval
    }
  };

  // Initial sync on mount
  syncAppointments();

  // Periodic sync every 5 minutes
  const interval = setInterval(syncAppointments, 5 * 60 * 1000);

  return () => clearInterval(interval);
}, [token]);
```

### 5. Data Flow Summary

**AppointmentCreateScreen → appointmentService.createAppointment() → Check connectivity:**
- **Online:** POST to backend → Success → Navigate back
- **Offline:** appointmentDB.insertAppointment(synced=0) → Navigate back → Background sync uploads later

**Background sync triggers:**
- On app startup (safety net for leftover unsynced appointments)
- Every 5 minutes during active session
- When user manually refreshes appointments list

## Build Order Recommendation

Based on dependency analysis, implement in this order:

### Phase 1: Database Layer (Foundation)
1. **Create appointmentDB.js** with schema matching backend appointment structure
   - Implement: createTable, insertAppointment, getUnsyncedAppointments, markAsSynced, updateAppointmentWithRealId
   - Initialize table in App.js (similar to locationDB)
   - Dependencies: None

### Phase 2: Service Layer (API Integration)
2. **Extend AppointmentService.js** with createAppointment method
   - Follow existing normalized response pattern
   - Dependencies: API endpoint available on backend

### Phase 3: Sync Layer (Offline Support)
3. **Create AppointmentUploader.js** for batch upload with retry
   - Follow LocationUploader pattern
   - Dependencies: Phase 1 (appointmentDB), Phase 2 (AppointmentService)

### Phase 4: Presentation Layer (UI)
4. **Create AppointmentCreateScreen.js** with form
   - Form fields: client name, address, date, time from/to
   - Try online POST first, fallback to SQLite if offline
   - Dependencies: Phase 2 (AppointmentService), Phase 1 (appointmentDB)

### Phase 5: Navigation Integration
5. **Add navigation route** in App.js
   - Add stack screen for AppointmentCreate
   - Dependencies: Phase 4 (AppointmentCreateScreen)

6. **Add create button** to AppointmentsScreen
   - Floating action button or header button
   - Dependencies: Phase 5 (navigation route)

### Phase 6: Background Sync Integration
7. **Add periodic sync** for appointments
   - Add useEffect in SessionScreen.js or App.js
   - Initial sync on app start + periodic 5-min sync
   - Dependencies: Phase 3 (AppointmentUploader)

### Rationale for Build Order:
- **Database first:** Foundation for offline support, no external dependencies
- **Service layer second:** Connects to backend, independent of UI
- **Sync layer third:** Bridges database and service, requires both
- **UI fourth:** Consumes service and database layers
- **Navigation fifth:** Requires UI to be complete
- **Background sync last:** Integrates all layers, requires everything to be working

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 field workers | Current architecture is sufficient. SQLite handles thousands of appointments locally. Single-instance backend. |
| 100-1k field workers | No major changes needed. Consider adding database indexes on `synced` flag and `staff_id` for faster queries. Backend may need horizontal scaling. |
| 1k+ field workers | Consider moving to a more robust local database solution (Realm, WatermelonDB). Implement conflict resolution for appointment updates. Backend requires load balancing and distributed database. |

### Scaling Priorities

1. **First bottleneck:** SQLite query performance on large datasets
   - **Fix:** Add indexes on frequently queried columns (staff_id, synced, appoint_appointmentdate)
   - **When:** When appointment list load time exceeds 1 second (typically 5k+ local records)

2. **Second bottleneck:** Sync conflicts when multiple edits to same appointment
   - **Fix:** Implement last-write-wins or versioning strategy with conflict resolution UI
   - **When:** When field workers regularly update appointments from multiple devices

3. **Third bottleneck:** Network bandwidth for large batch uploads
   - **Fix:** Implement delta sync (only send changed fields), compress payloads
   - **When:** Upload times exceed 30 seconds for typical batch sizes

## Anti-Patterns

### Anti-Pattern 1: Mixing Online/Offline Code Paths

**What people do:** Check network status before every operation, different code paths for online/offline

**Why it's wrong:**
- Network status can change mid-operation
- Duplicates business logic
- Harder to test
- Leads to inconsistent behavior

**Do this instead:**
- **Always write to local database first** (single source of truth)
- **Sync in background** regardless of network status
- Service layer handles retry automatically
- User sees immediate feedback from local data

**Example:**
```javascript
// BAD - separate online/offline paths
const handleSubmit = async () => {
  if (isOnline) {
    const result = await appointmentService.createAppointment(token, data);
    if (result.success) {
      navigation.goBack();
    }
  } else {
    await appointmentDB.insertAppointment(data);
    navigation.goBack();
  }
};

// GOOD - always write local first, sync handles online/offline
const handleSubmit = async () => {
  // Write to local database immediately
  const localId = await appointmentDB.insertAppointment(data, synced=0);

  // Navigate back immediately (optimistic UI)
  navigation.goBack();

  // Background sync will upload when online
  // (handled by periodic sync interval)
};
```

### Anti-Pattern 2: Not Following Existing Service Response Pattern

**What people do:** Return raw axios response or throw errors directly from service methods

**Why it's wrong:**
- Breaks consistency with existing codebase
- Forces screens to handle different response types
- Makes error handling inconsistent
- Harder to maintain

**Do this instead:**
- Always return `{success: boolean, data?: any, message?: string}`
- Catch errors in service layer, normalize to consistent format
- Screens only check `result.success` and handle accordingly

### Anti-Pattern 3: Storing Complex Objects in AsyncStorage

**What people do:** Store entire appointment lists or complex state in AsyncStorage

**Why it's wrong:**
- AsyncStorage is key-value store, not designed for querying
- No indexing, slow for large datasets
- No relationships between records
- 6MB limit on Android

**Do this instead:**
- **Use SQLite for structured data** (appointments, locations)
- **Use AsyncStorage for simple primitives** (token, user object, session_id)
- SQLite provides querying, indexing, relationships, transactions

### Anti-Pattern 4: Creating New Database Patterns Instead of Reusing Existing

**What people do:** Create a completely different database pattern for appointments vs. locations

**Why it's wrong:**
- Increases cognitive load for developers
- Duplicates testing effort
- Inconsistent behavior between features
- Harder to onboard new developers

**Do this instead:**
- **Follow the locationDB.js pattern exactly** for appointmentDB.js
- Same method names (insertX, getUnsyncedX, markAsSynced)
- Same sync flag approach (synced: 0/1)
- Same uploader pattern (batch, retry, exponential backoff)

## Sources

- **Codebase Analysis:** Direct examination of existing React Native app architecture
  - D:\ddcmarketingmobile\src\services\AppointmentService.js (normalized response pattern)
  - D:\ddcmarketingmobile\src\db\locationDB.js (SQLite offline cache pattern)
  - D:\ddcmarketingmobile\src\services\LocationUploader.js (batch upload with retry pattern)
  - D:\ddcmarketingmobile\src\screens\AppointmentsScreen.js (screen structure, navigation)
  - D:\ddcmarketingmobile\src\context\AuthContext.js (global state management)
  - D:\ddcmarketingmobile\App.js (navigation structure)

---
*Architecture research for: Field worker appointment creation integration*
*Researched: 2026-02-10*
