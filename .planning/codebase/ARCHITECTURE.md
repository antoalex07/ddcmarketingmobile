# Architecture

**Analysis Date:** 2026-02-10

## Pattern Overview

**Overall:** Layered MVC-like architecture with React Context state management and service-based API abstraction

**Key Characteristics:**
- Screen components handle UI and user interaction
- Services encapsulate API communication with normalized response patterns
- Context provides global authentication and user state
- Local SQLite database for location data caching and sync retry
- Background task handling for location tracking during app suspension
- React Navigation for screen routing with stack navigator

## Layers

**Presentation Layer (Screens):**
- Purpose: Render UI components and handle user interactions
- Location: `src/screens/`
- Contains: React Native screen components with local state management
- Depends on: Context (AuthContext), Services (AppointmentService, SessionService), Navigation
- Used by: App.js (root component)
- Examples: `LoginScreen.js`, `SessionScreen.js`, `AppointmentsScreen.js`, `AppointmentUpdateScreen.js`, `ReportScreen.js`

**State Management Layer (Context):**
- Purpose: Provide global authentication state and token management
- Location: `src/context/AuthContext.js`
- Contains: Auth context provider with login/logout/token persistence
- Depends on: AsyncStorage (device persistence)
- Used by: All screens access via useAuth hook
- Pattern: React Context + useState for user, token, loading state

**Service Layer (Business Logic):**
- Purpose: Encapsulate API calls and data transformations with consistent error handling
- Location: `src/services/`
- Contains: API service objects with normalized response format
- Services:
  - `AuthService.js`: Authentication endpoints (login)
  - `SessionService.js`: Work session management (start/stop/active)
  - `AppointmentService.js`: Appointment CRUD and staff details
  - `LocationUploader.js`: Batch upload of location data with retry logic
  - `TrackingController.js`: Location tracking lifecycle management (start/stop)
  - `LocationRecorder.js`: Background task callback handler (not shown but referenced)
  - `LocationTask.js`: Expo TaskManager task definition for background location collection
- Depends on: `src/config/api.js` for HTTP client, `src/db/locationDB.js` for data persistence
- Used by: Screen components

**Data Persistence Layer:**
- Purpose: Local caching and sync state management for location data
- Location: `src/db/locationDB.js`
- Contains: SQLite database operations via expo-sqlite
- Key functions:
  - `insertPoint()`: Save location data with synced flag (0 = pending, 1 = uploaded)
  - `getUnsyncedPoints()`: Retrieve pending locations for upload
  - `markAsSynced()`: Mark batch as uploaded
  - `clearSyncedPoints()`: Cleanup old synced data (7+ days)
- Depends on: expo-sqlite
- Used by: LocationTask, LocationUploader

**Configuration & Integration Layer:**
- Purpose: HTTP client setup and interceptors
- Location: `src/config/api.js`
- Contains: Axios instance with base URL, timeout, request/response interceptors for logging
- Features: Logs all API calls and responses to console for debugging

**Utilities Layer:**
- Purpose: Cross-cutting concerns and platform-specific operations
- Location: `src/utils/`
- Contains:
  - `locationPermissions.js`: Location permission request workflow (foreground + background)
  - `batteryOptimization.js`: Battery optimization prompts for Android

## Data Flow

**Authentication Flow:**
1. LoginScreen captures username/password
2. Calls AuthService.login() which posts to `/auth/login`
3. Backend returns token + user data
4. AuthContext.login() stores both in AsyncStorage and React state
5. Navigation replaced to SessionScreen

**Session Tracking Flow:**
1. SessionScreen calls sessionService.startSession()
2. Backend returns sessionId
3. SessionId stored in AsyncStorage (SESSION_ID_KEY)
4. TrackingController.startTracking() initiates expo-location updates
5. Background LocationTask receives location updates
6. LocationTask calls LocationDB.insertPoint() to store each point with synced=0

**Location Upload Flow:**
1. SessionScreen periodically calls LocationUploader.uploadUnsyncedLocations() (every 5 minutes)
2. LocationUploader retrieves unsync points from SQLite
3. Groups points by session_id
4. Batches points (50 per batch) and POSTs to `/sessions/locations/bulk`
5. On success, marks batch as synced=1
6. Retries failed batches up to 3 times with exponential backoff
7. Returns upload/failed counts

**Appointment Flow:**
1. AppointmentsScreen uses useFocusEffect to fetch data when screen comes into view
2. Calls appointmentService.getStaffDetails() and appointmentService.getAppointments()
3. Renders staff info header + appointment list (FlatList with RefreshControl)
4. User taps appointment -> navigates to AppointmentUpdateScreen with appointment data
5. User submits changes -> appointmentService.updateAppointment() POSTs to backend
6. Success -> navigates back to AppointmentsScreen

**State Management:**
- Global: AuthContext (user, token, loading)
- Local: Each screen manages its own component state (textInput values, loading flags, UI states)
- Persistent: AsyncStorage stores auth token, session ID, location data (SQLite)
- Background: Expo TaskManager maintains location updates even when app is backgrounded

## Key Abstractions

**Service Pattern (Normalized Response):**
All services return consistent response object structure:
```javascript
{
  success: boolean,
  data?: object,        // On success
  message?: string,     // On error
  sessionId?: number,   // Session-specific
  uploaded?: number,    // Upload-specific
  failed?: number       // Upload-specific
}
```
Pattern used in: AuthService, SessionService, AppointmentService, LocationUploader

**Location Data Model:**
Database schema in `src/db/locationDB.js`:
```
locations table:
- id: INTEGER PRIMARY KEY
- session_id: INT (foreign key to backend session)
- latitude, longitude: DECIMAL
- accuracy, speed, heading: FLOAT
- timestamp: DATETIME
- synced: INTEGER (0 = pending, 1 = uploaded)
```

**Auth Token Pattern:**
Token is obtained during login and passed via Bearer token in Authorization header for all protected endpoints:
```javascript
headers: {
  Authorization: `Bearer ${token}`,
}
```

## Entry Points

**App Initialization:**
- Location: `index.js` and `App.js`
- Triggers: App startup (Expo registerRootComponent)
- Responsibilities:
  - index.js: Registers root component with Expo
  - App.js: Sets up providers (SafeAreaProvider, AuthProvider), creates navigation stack, initializes DB table

**Background Location Task:**
- Location: `src/services/LocationTask.js`
- Triggers: Expo TaskManager when location update occurs (configured with timeInterval=5000ms, distanceInterval=10m)
- Responsibilities: Receives location batch, retrieves active session ID from AsyncStorage, inserts each point to SQLite with retry logic

**App Lifecycle Hooks:**
- SessionScreen uses useEffect for recovery, periodic upload, timer, and location monitoring
- AppointmentsScreen uses useFocusEffect to refresh data when screen gains focus

## Error Handling

**Strategy:** Try-catch blocks in services with consistent error response format

**Patterns:**
- Auth errors: Network errors return "Network error. Please check your connection."
- API errors: Attempt to extract error message from backend response, fallback to generic message
- Database errors: Retry logic in LocationTask (3 retries, 500ms delay between retries)
- Upload errors: Failed batches tracked, return failed count to caller, data remains synced=0 for future retry
- Offline handling: SessionScreen catches network errors during getActiveSession() and uses local time as fallback
- Location permission errors: Handled by locationPermissions.js utility with detailed error messages

## Cross-Cutting Concerns

**Logging:**
- Approach: console.log/console.error throughout codebase
- Locations: API interceptors log all requests/responses, services log before API calls, screens log user actions
- No centralized logging service; all goes to React Native console

**Validation:**
- Frontend: LoginScreen validates empty username/password
- API Interceptors: Request interceptor logs URLs for debugging
- Form validation: AppointmentUpdateScreen validates changes exist before submission
- Location permission validation: locationPermissions.js checks both services and permissions before proceeding

**Authentication:**
- Approach: Token-based via Bearer scheme in Authorization header
- Persistence: AsyncStorage stores token and user JSON
- Persistence loading: AuthContext.loadStoredAuth() called on app init (though not visible in App.js - may be called from parent)
- Session recovery: SessionScreen recovers session state from AsyncStorage on mount, verifies with backend if online

---

*Architecture analysis: 2026-02-10*
