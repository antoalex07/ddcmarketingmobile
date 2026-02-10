# Stack Research

**Domain:** Field Worker Appointment Creation Feature
**Researched:** 2026-02-10
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React Native | 0.81.5 | Mobile framework | Already in use, proven stable for field worker tracking |
| Expo | 54.x | Development platform | Already in use, provides SQLite and location services without ejecting |
| expo-sqlite | 16.0.10 | Local database | Already in use for location tracking, supports offline-first pattern with async/await API |
| @react-native-community/datetimepicker | 8.4.4 | Date/time input | Already in use in AppointmentUpdateScreen, proven working for iOS & Android |
| axios | 1.6.2+ | HTTP client | Already in use for API calls, handles auth headers consistently |
| react-navigation | 6.1.9+ | Navigation | Already in use, native stack navigator established |

### Supporting Libraries for Appointment Creation

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-native-dropdown-picker | 5.4.6+ | Dropdown selection | For appointment type, status, and client selection when list is < 50 items |
| react-native-autocomplete-dropdown | 4.0.0+ | Autocomplete search | For client database lookup when list > 50 items, supports search as you type |
| React Hook Form | 7.51.0+ | Form state management | Form validation, field management, better performance than Formik for mobile |
| Zod | 3.22.0+ | Schema validation | TypeScript-first validation, integrates with React Hook Form via @hookform/resolvers |
| @react-native-async-storage/async-storage | 2.2.0 | Key-value storage | Already in use, for caching client lookups and form drafts |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript (optional) | Type safety | Recommended if adding Zod validation, improves DX for form schemas |
| React DevTools | Debugging | Form state inspection during development |
| Expo Go | Testing | Quick iteration on form UI without rebuilds |

## Installation

```bash
# Required for appointment creation feature
npm install react-native-dropdown-picker
npm install react-native-autocomplete-dropdown
npm install react-hook-form
npm install zod
npm install @hookform/resolvers

# Optional but recommended
npm install -D @types/react-native
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| React Hook Form | Formik | If team is already familiar with Formik; however, RHF has better mobile performance due to fewer re-renders |
| Zod | Yup | If existing codebase uses Yup (none found); Zod is faster and TypeScript-first |
| react-native-dropdown-picker | @react-native-picker/picker | For simple, iOS-native picker wheels; dropdown-picker provides consistent cross-platform styling |
| react-native-autocomplete-dropdown | react-native-autocomplete-input | If simpler autocomplete needed; dropdown version has better UX for search + select |
| expo-sqlite | WatermelonDB | For apps needing complex relational queries or built-in sync primitives; overkill for this use case |
| expo-sqlite | Drizzle ORM | For TypeScript projects needing type-safe query builder; adds complexity without major benefit here |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| react-native-picker-select | Not well maintained in 2026, styling issues with Expo | react-native-dropdown-picker |
| Custom SQLite wrapper | expo-sqlite now has native async/await support | Use expo-sqlite async API directly |
| Redux for form state | Unnecessary complexity for local form state | React Hook Form with local state |
| Google Places Autocomplete | Requires API key, costs money, needs ejecting from Expo | Local client database search with autocomplete-dropdown |
| AsyncStorage for appointments | Not queryable, no transactions | expo-sqlite with dedicated appointments table |

## Stack Patterns by Variant

**If client database is small (< 50 clients):**
- Use react-native-dropdown-picker with static list
- Pre-load all clients on screen mount
- Simple, fast, no search needed

**If client database is medium (50-500 clients):**
- Use react-native-autocomplete-dropdown
- Load clients on search input (debounced)
- Cache recent selections in AsyncStorage

**If client database is large (> 500 clients):**
- Use react-native-autocomplete-dropdown
- Implement backend search endpoint
- Return paginated results (20-50 at a time)
- Cache recent selections locally

**If offline appointment creation is critical:**
- Queue appointments in SQLite with `synced = 0` flag
- Use same pattern as location tracking (already implemented in locationDB.js)
- Sync on connectivity restore with background task

## Database Schema Requirements

### New Table: appointments_queue

```sql
CREATE TABLE IF NOT EXISTS appointments_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  client_name TEXT NOT NULL,
  client_address TEXT,
  appointment_type TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  time_from TEXT NOT NULL,
  time_to TEXT NOT NULL,
  status INTEGER DEFAULT 1,
  notes TEXT,
  staff_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced INTEGER DEFAULT 0,
  remote_id INTEGER
);
```

### New Table: clients_cache (optional but recommended)

```sql
CREATE TABLE IF NOT EXISTS clients_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remote_id INTEGER UNIQUE,
  client_name TEXT NOT NULL,
  client_address TEXT,
  client_type TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoint Contracts Needed

### 1. Get Clients List
```
GET /client/getallclients
Headers: Authorization: Bearer {token}
Response: {
  success: boolean,
  data: {
    clients: [{
      client_id: number,
      client_name: string,
      client_address: string,
      client_type: string,
      client_status: number
    }]
  }
}
```

### 2. Search Clients (if backend search)
```
GET /client/searchclients?q={searchTerm}&limit=50
Headers: Authorization: Bearer {token}
Response: {
  success: boolean,
  data: {
    clients: [...],
    hasMore: boolean
  }
}
```

### 3. Create Appointment
```
POST /appointment/createappointment
Headers: Authorization: Bearer {token}
Body: {
  appoint_clientid: number,
  appoint_clientname: string,
  appoint_clientaddress: string,
  appoint_type: string,
  appoint_appointmentdate: string, // YYYY-MM-DD
  appoint_timefrom: string, // HH:mm
  appoint_timeto: string, // HH:mm
  appoint_status: number,
  appoint_assignedstaffid: number,
  appoint_notes: string
}
Response: {
  success: boolean,
  data: {
    appointment: {
      appoint_id: number,
      ...
    }
  }
}
```

### 4. Get Appointment Types (if dynamic)
```
GET /appointment/getappointmenttypes
Headers: Authorization: Bearer {token}
Response: {
  success: boolean,
  data: {
    types: [
      { type_id: number, type_name: string, type_code: string }
    ]
  }
}
```

## Form Validation Schema Example

```javascript
import { z } from 'zod';

export const appointmentSchema = z.object({
  clientId: z.number().nullable(),
  clientName: z.string().min(2, 'Client name required'),
  clientAddress: z.string().min(5, 'Address required'),
  appointmentType: z.string().min(1, 'Type required'),
  appointmentDate: z.date({
    required_error: 'Date required',
    invalid_type_error: 'Invalid date',
  }),
  timeFrom: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  timeTo: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  notes: z.string().optional(),
}).refine((data) => {
  // Validate timeTo is after timeFrom
  const [fromH, fromM] = data.timeFrom.split(':').map(Number);
  const [toH, toM] = data.timeTo.split(':').map(Number);
  const fromMinutes = fromH * 60 + fromM;
  const toMinutes = toH * 60 + toM;
  return toMinutes > fromMinutes;
}, {
  message: 'End time must be after start time',
  path: ['timeTo'],
});
```

## Offline-First Implementation Pattern

Based on existing location tracking implementation in `locationDB.js`, apply same pattern:

1. **Write to SQLite first** - All appointment creations write to `appointments_queue` table
2. **Mark as unsynced** - Use `synced = 0` flag (same as location tracking)
3. **Background sync** - Similar to `LocationUploader.js`, create `AppointmentUploader.js`
4. **Mark as synced** - Update `synced = 1` and store `remote_id` on success
5. **Retry logic** - Keep trying failed syncs with exponential backoff

Example service structure (mirrors existing `LocationUploader.js`):

```javascript
// src/services/AppointmentUploader.js
export const startAppointmentSync = async () => {
  // Check connectivity
  // Get unsynced appointments from SQLite
  // Batch POST to backend
  // Mark as synced on success
  // Schedule next sync
};
```

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| react-hook-form@7.51.0+ | React Native 0.81.5 | Confirmed working, uses React 19.1.0 |
| zod@3.22.0+ | TypeScript 5.0+ | No TypeScript in current project; can use without TS but less type safety |
| @hookform/resolvers@3.3.0+ | react-hook-form@7.x + zod@3.x | Bridge package for Zod validation |
| react-native-dropdown-picker@5.4.6+ | Expo 54 | No ejecting required, works with Expo Go |
| react-native-autocomplete-dropdown@4.0.0+ | React Native 0.70+ | Compatible with 0.81.5, requires expo-dev-client (not Expo Go) |
| expo-sqlite@16.0.10 | Expo 54 | Already installed, async API available since Expo 51+ |

## Missing Dependencies in Current Stack

Based on `package.json` review:

1. **Form handling library** - None present, need React Hook Form
2. **Validation library** - None present, need Zod (or can use vanilla JS validation)
3. **Dropdown/picker** - Only has @react-native-community/datetimepicker, need dropdown-picker
4. **Autocomplete** - None present, need autocomplete-dropdown for client search

All other dependencies for appointment creation are already present:
- SQLite for offline storage ✓
- DateTimePicker for date/time input ✓
- AsyncStorage for caching ✓
- axios for API calls ✓
- Navigation for screen routing ✓

## Integration with Existing Stack

### Leverage Existing Patterns

1. **Database operations** - Follow `locationDB.js` pattern with async/await
2. **Service layer** - Follow `AppointmentService.js` pattern for API calls
3. **Form UI** - Follow `AppointmentUpdateScreen.js` patterns for consistency
4. **Offline sync** - Follow `LocationUploader.js` pattern for background sync
5. **Context** - Use existing `AuthContext` for token and user data

### Consistent Styling

AppointmentUpdateScreen already has established patterns:
- Card-based sections with white background, rounded corners
- Blue primary color (#3b82f6)
- Status badges with color coding
- TouchableOpacity buttons with consistent padding
- ScrollView with SafeAreaView wrapper

New appointment creation screen should match these patterns for UI consistency.

## Confidence Assessment

| Component | Confidence | Source |
|-----------|------------|--------|
| Core stack (React Native, Expo, SQLite) | HIGH | Already in use, verified in package.json |
| DateTimePicker | HIGH | Already in use in AppointmentUpdateScreen.js |
| React Hook Form | MEDIUM | Widely used in 2026, multiple sources confirm mobile compatibility |
| Zod validation | MEDIUM | Multiple sources confirm as best practice for 2026, TypeScript-first |
| react-native-dropdown-picker | MEDIUM | Expo-compatible, well-maintained, multiple sources recommend |
| react-native-autocomplete-dropdown | MEDIUM | Requires expo-dev-client, proven autocomplete solution |
| Offline-first pattern | HIGH | Pattern already proven in locationDB.js and LocationUploader.js |
| Database schema | HIGH | Mirrors existing location tracking schema pattern |
| API contracts | MEDIUM | Inferred from existing AppointmentService.js patterns |

## Sources

### Official Documentation
- [Expo SQLite Documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/) - Official Expo docs for async operations
- [Expo Location Documentation](https://docs.expo.dev/versions/latest/sdk/location/) - Official Expo location API reference
- [@react-native-picker/picker Documentation](https://docs.expo.dev/versions/latest/sdk/picker/) - Official Expo picker component docs

### Form Handling & Validation
- [Form Validation: Yup vs Zod vs Joi, Which One Should You Actually Use?](https://medium.com/@osmion/form-validation-yup-vs-zod-vs-joi-which-one-should-you-actually-use-681988f84692) - 2026 comparison
- [Comparing schema validation libraries: Zod vs. Yup - LogRocket Blog](https://blog.logrocket.com/comparing-schema-validation-libraries-zod-vs-yup/)
- [Creating and Validating Forms in React Native Expo: A Step-by-Step Guide](https://medium.com/@yildizfatma/creating-and-validating-forms-in-react-native-expo-a-step-by-step-guide-c0046753eb44)
- [The 10 best React Native UI libraries of 2026 - LogRocket Blog](https://blog.logrocket.com/best-react-native-ui-component-libraries/)

### Dropdown & Autocomplete Components
- [react-native-dropdown-picker GitHub](https://github.com/hossein-zare/react-native-dropdown-picker) - Single/multiple, searchable item picker
- [react-native-dropdown-picker Documentation](https://hossein-zare.github.io/react-native-dropdown-picker-website/) - Official docs with examples
- [react-native-autocomplete-dropdown GitHub](https://github.com/onmotion/react-native-autocomplete-dropdown) - Dropdown with search and autocomplete
- [10 Best Autocomplete Components For React And React Native (2026 Update)](https://reactscript.com/best-autocomplete/)

### Offline-First Patterns
- [Expo SQLite: A Complete Guide for Offline-First React Native Apps](https://medium.com/@aargon007/expo-sqlite-a-complete-guide-for-offline-first-react-native-apps-984fd50e3adb) - Complete implementation guide
- [Building an offline first app with React Native and SQLite: 2020 refresh](https://implementationdetails.dev/blog/2020/05/03/react-native-offline-first-db-with-sqlite-hooks/) - Sync queue patterns
- [Implementing Offline-First Architecture with Local Databases in React Native - InnovationM](https://www.innovationm.com/blog/react-native-offline-first-architecture-sqlite-local-database-guide/)
- [Best SQLite Solutions for React Native App Development in 2026](https://vibe.forem.com/eira-wexford/best-sqlite-solutions-for-react-native-app-development-in-2026-3b5l)

### Performance & Best Practices
- [React Native Database Performance Comparison](https://www.powersync.com/blog/react-native-database-performance-comparison) - Performance benchmarks
- [25 React Native Best Practices for High Performance Apps 2026](https://www.esparkinfo.com/blog/react-native-best-practices)

---
*Stack research for: Field Worker Appointment Creation Feature*
*Researched: 2026-02-10*
