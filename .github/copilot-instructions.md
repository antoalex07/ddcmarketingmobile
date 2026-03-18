# Copilot Instructions — DDC Marketing Mobile

React Native (Expo) field-sales tracking app. Reps start/stop work sessions, record appointments, and have GPS location streamed to a backend while working.

---

## Build & Run Commands

```bash
# Start dev server (requires a custom dev client build, NOT Expo Go)
npm start              # expo start --dev-client

# Build & run natively
npm run android        # expo run:android
npm run ios            # expo run:ios
```

No test suite or linter is configured.

---

## Architecture Overview

The app has three main concerns that work together:

### 1. Session lifecycle
`SessionScreen` is the hub. A rep starts a session → `SessionService` creates a backend session → `TrackingController` starts background GPS via `expo-location` → `LocationTask` (registered with `expo-task-manager`) receives location events and writes them to `locationDB` (SQLite) → `LocationUploader` batches and POSTs 50 points at a time to `/sessions/locations/bulk` every 5 minutes and on app start. When the session ends the inverse happens.

### 2. Appointments (offline-first)
New appointments are created locally with a **negative temp ID** (e.g. `-1`, `-2`) and `synced=0`. `AppointmentUploader` syncs them per-appointment to `/appointment/createappointment`, then replaces the temp ID with the real backend ID and sets `synced=1`. `AppointmentsScreen` merges backend appointments (server source of truth) with local unsynced rows, tagging locals with `_isLocal: true`.

### 3. Auth
`AuthContext` holds `user`, `token`, and `staffData`. On login these are persisted to AsyncStorage. On app start `loadStoredAuth()` hydrates from storage. Token is passed explicitly to every service call as a parameter (not injected in the Axios interceptor).

---

## Key Conventions

### Service return shape
All service functions return `{ success: boolean, data?, message?, ... }` — never throw. Callers always check `result.success`.

### Exports
- **Screens** → `export default` (PascalCase filename)
- **Services** → named export of a plain object with async methods: `export const appointmentService = { ... }`
- **Context** → named exports for both the hook (`useAuth`) and provider (`AuthProvider`)
- No barrel/index files; import directly from the module path

### File naming
- Screens: `PascalCase` (`AppointmentUpdateScreen.js`)
- Services, utils, DB modules: `camelCase` (`locationDB.js`, `batteryOptimization.js`)
- Context providers: `PascalCase` (`AuthContext.js`)

### Constants
Module-level constants in `UPPER_SNAKE_CASE`: `BATCH_SIZE`, `MAX_RETRIES`, `DATABASE_NAME`.

### API field names
API response/request fields use `snake_case` with a domain prefix: `appoint_id`, `appoint_status`, `user_name`. Map to camelCase in local state when needed.

### Screen component structure (in order)
1. Imports (React/RN → third-party → local context/services/DB)
2. `const MyScreen = ({ navigation }) => { ... }`
3. Hooks (`useState`, `useAuth`, `useFocusEffect`/`useEffect`)
4. Event handlers (`handleLogin`, `handleSubmit`, …)
5. Return JSX
6. `const styles = StyleSheet.create({ ... })`
7. `export default MyScreen`

### Navigation
Stack-only (`@react-navigation/native-stack`). Login → Session uses `navigation.replace()` (removes Login from stack). Session and Report screens set `headerLeft: () => null` to prevent back navigation.

### SQLite singletons
Both `locationDB.js` and `appointmentDB.js` keep a module-level `db` variable. If an operation throws, the module resets `db = null` and `tableCreated = false` so the next call re-initializes cleanly.

### Background location
The TaskManager task name is defined in `LocationTask.js` and must match the string passed to `TrackingController.js`. The task reads `active_session_id` from AsyncStorage (not passed as an argument, since TaskManager tasks can't receive live parameters).

---

## Important AsyncStorage Keys

| Key | Value |
|-----|-------|
| `token` | Bearer token string |
| `user` | JSON of user object |
| `active_session_id` | Integer string of current session |
| `staff_data` | JSON of staff details |
| `battery_optimization_prompted` | `"true"` once shown |

---

## API

Base URL: `http://ddcpharmacy.com/api/`  
Auth header: `Authorization: Bearer <token>` — added per-request in each service, not in the Axios interceptor.  
Timeout: 30 seconds.
