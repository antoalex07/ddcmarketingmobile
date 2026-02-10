# External Integrations

**Analysis Date:** 2026-02-10

## APIs & External Services

**Backend API:**
- DDC Pharmacy API - Main business logic and data service
  - SDK/Client: axios ^1.6.2
  - Base URL: http://ddcpharmacy.com/api/
  - Auth: Bearer token (JWT-like)
  - Timeout: 30 seconds
  - Request/response interceptors for logging and error handling

**Key API Endpoints:**
- `POST /auth/login` - Authentication (username/password)
- `GET /staff/getstaff` - Fetch staff details
- `GET /appointment/getallappointments/{staffId}` - List appointments
- `POST /appointment/updateappointmentstatus` - Update appointment status
- `POST /sessions/start` - Start work session
- `POST /sessions/stop` - End work session
- `GET /sessions/active` - Get active session
- `POST /sessions/locations/bulk` - Bulk upload location data

## Data Storage

**Databases:**
- SQLite (via expo-sqlite ~16.0.10)
  - Database name: `locations.db`
  - Client: Expo SQLite async API
  - Storage: Local device filesystem (offlineFirstapproach)
  - Schema: Single `locations` table for GPS tracking data
    - Fields: id, session_id, latitude, longitude, accuracy, speed, heading, timestamp, synced
    - Syncing: Marks records with `synced` flag (0/1) for upload tracking

**Async Storage:**
- @react-native-async-storage/async-storage 2.2.0
  - Purpose: Persistent key-value storage
  - Keys used:
    - `token` - Authentication token (persisted after login)
    - `user` - User object (JSON stringified)
    - `active_session_id` - Current work session ID

**File Storage:**
- Local filesystem only - No cloud file storage detected

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Custom implementation
  - File: `src/context/AuthContext.js`
  - Method: Bearer token in Authorization header
  - Storage: AsyncStorage (non-encrypted)
  - Login endpoint: `POST /auth/login`
  - Expected response fields: token, user_id, user_name, roleid

**Auth Flow:**
1. Login credentials sent to backend API
2. Backend returns JWT-like token and user details
3. Token stored in AsyncStorage
4. All subsequent API calls include `Authorization: Bearer {token}` header

**Session Management:**
- Token persists across app restarts via AsyncStorage
- Auto-load stored auth on app initialization
- Logout clears token and user from storage

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Console logging only
- Request/response interceptors log to console
- Error details logged with status, message, and response data

## CI/CD & Deployment

**Hosting:**
- Expo platform for development and potential deployment
- Android APK generation via Expo CLI or gradle
- iOS IPA generation via Expo CLI or Xcode

**CI Pipeline:**
- None detected

**Build Artifacts:**
- Debug keystore: `android/app/debug.keystore` (hardcoded credentials)
- Release keystore: `release.keystore` (configured in gradle.properties)

## Environment Configuration

**Required env vars:**
- None explicitly required (.env files not used)
- API_BASE_URL hardcoded in `src/config/api.js`

**Configuration in Code:**
- API base URL: `http://ddcpharmacy.com/api/`
- Release keystore credentials stored in `android/gradle.properties` (WARNING: credentials in version control)
- Keystore alias: `ddcmarketing-release`
- App colors: Blue theme (#2563eb) used throughout

**Secrets location:**
- Not recommended - credentials visible in `android/gradle.properties`

## Location Services

**Expo Location Integration:**
- expo-location ~19.0.8
- Background tracking via TaskManager
- Task name: `background-location-task`
- Tracking parameters:
  - Accuracy: High
  - Distance interval: 10 meters
  - Time interval: 5000ms (5 seconds)
  - Foreground service: Required for background tracking
  - Pauses updates: Disabled (continuous tracking)

**Permissions Required:**
- ACCESS_FINE_LOCATION - Precise GPS location
- ACCESS_COARSE_LOCATION - Approximate location
- ACCESS_BACKGROUND_LOCATION - Background tracking
- FOREGROUND_SERVICE - Required for location updates
- FOREGROUND_SERVICE_LOCATION - Android 14+ requirement
- INTERNET - API communication

## Offline Capabilities

**Sync Strategy:**
- Location data stored locally in SQLite when offline
- Batch upload (50 records per batch) when connectivity restored
- Retry logic: 3 attempts per batch with exponential backoff
- Failed records remain in local database for later retry
- Synced records marked with flag, old synced records cleaned up after 7 days

**Implementation Files:**
- `src/db/locationDB.js` - SQLite operations
- `src/services/LocationUploader.js` - Batch upload with retry
- `src/services/LocationTask.js` - Background task definition

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Location data pushed to backend via bulk API endpoint
- No webhook subscriptions or push notifications detected

---

*Integration audit: 2026-02-10*
