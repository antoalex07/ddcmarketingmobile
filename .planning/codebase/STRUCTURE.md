# Codebase Structure

**Analysis Date:** 2026-02-10

## Directory Layout

```
ddcmarketingmobile/
├── android/                        # Android native project
│   └── app/
│       ├── build.gradle           # Build configuration
│       ├── proguard-rules.pro      # Code obfuscation rules
│       └── src/main/
│           ├── AndroidManifest.xml # App manifest, permissions
│           └── res/xml/            # Android resources (network security config)
├── ios/                            # iOS native project
├── src/                            # JavaScript source code
│   ├── config/
│   │   └── api.js                 # Axios HTTP client with interceptors
│   ├── context/
│   │   └── AuthContext.js         # Global auth state provider
│   ├── db/
│   │   └── locationDB.js          # SQLite database operations
│   ├── screens/
│   │   ├── LoginScreen.js         # Login form UI
│   │   ├── SessionScreen.js       # Work session management UI
│   │   ├── AppointmentsScreen.js  # Appointments list UI
│   │   ├── AppointmentUpdateScreen.js # Appointment edit form UI
│   │   ├── ReportScreen.js        # Session completion report UI
│   │   └── DebugScreen.js         # Debug utilities (incomplete)
│   ├── services/
│   │   ├── AuthService.js         # Login API
│   │   ├── SessionService.js      # Session start/stop/active APIs
│   │   ├── AppointmentService.js  # Appointment CRUD APIs
│   │   ├── LocationUploader.js    # Batch location upload with retry
│   │   ├── LocationTask.js        # Expo background task handler
│   │   ├── TrackingController.js  # Location tracking lifecycle
│   │   ├── LocationRecorder.js    # Potential location recording utility (exists but not shown)
│   │ └── utils/
│   │   ├── locationPermissions.js # Permission request workflow
│   │   └── batteryOptimization.js # Android battery optimization prompt
├── App.js                          # Root component (navigation setup)
├── index.js                        # Expo entry point
├── app.json                        # Expo app config
├── package.json                    # Dependencies
├── package-lock.json               # Locked dependency versions
├── metro.config.js                 # Metro bundler config
└── .planning/                      # Planning documents (created by gsd:map-codebase)
    └── codebase/                   # This directory
```

## Directory Purposes

**android/ & ios/:**
- Purpose: Native code and platform-specific configurations
- Contains: Gradle build files, Xcode project, manifest files, resource files
- Key files:
  - `android/app/build.gradle`: Compile options, build variants, dependencies
  - `android/app/src/main/AndroidManifest.xml`: Permissions (LOCATION, INTERNET, VIBRATE), foreground service declaration
  - `android/gradle.properties`: JVM memory, SDK versions

**src/config/:**
- Purpose: Application configuration and HTTP client setup
- Contains: Axios instance with base URL and interceptors
- Key files: `api.js` - Base URL configured to `http://ddcpharmacy.com/api/`, request/response logging

**src/context/:**
- Purpose: Global state management using React Context
- Contains: Auth provider with login/logout/token persistence
- Key files: `AuthContext.js` - Provides useAuth hook for accessing user, token, loading state

**src/db/:**
- Purpose: Local data persistence via SQLite
- Contains: Database initialization and CRUD operations for location points
- Key files: `locationDB.js` - Single table "locations" with pending/synced tracking

**src/screens/:**
- Purpose: UI screen components (pages)
- Contains: React Native screens for each user-facing view
- Key files:
  - `LoginScreen.js` - Username/password form, calls AuthService.login()
  - `SessionScreen.js` - Main hub, displays session status/timer, starts/stops tracking, manages app lifecycle
  - `AppointmentsScreen.js` - Lists appointments per staff, calls AppointmentService for data
  - `AppointmentUpdateScreen.js` - Form to update appointment status, notes, follow-up date/time
  - `ReportScreen.js` - Shows session completion summary (duration, upload stats)

**src/services/:**
- Purpose: Business logic and API communication
- Contains: Service objects with normalized response patterns
- Key files:
  - `AuthService.js` - POST /auth/login
  - `SessionService.js` - POST /sessions/start|stop, GET /sessions/active
  - `AppointmentService.js` - GET /staff/getstaff, /appointment/getallappointments/{id}, POST /appointment/updateappointmentstatus
  - `LocationUploader.js` - Batch POST /sessions/locations/bulk with retry logic
  - `TrackingController.js` - Wrapper for expo-location start/stop/check
  - `LocationTask.js` - Expo TaskManager task definition

**src/utils/:**
- Purpose: Utility functions and cross-cutting concerns
- Contains: Permission helpers, battery optimization prompts
- Key files:
  - `locationPermissions.js` - Request foreground + background permissions, check location services
  - `batteryOptimization.js` - Android battery optimization exemption prompt

## Key File Locations

**Entry Points:**
- `index.js`: Expo registerRootComponent entry, calls App.js
- `App.js`: Root component, sets up providers (SafeAreaProvider, AuthProvider), initializes database, creates stack navigator

**Configuration:**
- `src/config/api.js`: HTTP client (base URL, timeout, interceptors)
- `app.json`: Expo app metadata (name, version, plugins, permissions)
- `metro.config.js`: Metro bundler configuration

**Core Logic:**
- `src/context/AuthContext.js`: Global auth state and persistence
- `src/db/locationDB.js`: SQLite schema and CRUD operations
- `src/services/SessionService.js`: Session lifecycle (start/stop)
- `src/services/LocationUploader.js`: Batch upload retry logic

**Testing:**
- No test files present in repository

## Naming Conventions

**Files:**
- Screens: PascalCase + "Screen" suffix (e.g., `LoginScreen.js`)
- Services: camelCase + "Service" suffix (e.g., `AuthService.js`, `LocationUploader.js`)
- Utilities: camelCase (e.g., `locationPermissions.js`, `batteryOptimization.js`)
- Context: PascalCase + "Context" suffix (e.g., `AuthContext.js`)
- Database: camelCase (e.g., `locationDB.js`)

**Directories:**
- Feature-based organization: `screens/`, `services/`, `utils/`, `context/`, `db/`, `config/`
- All lowercase plural form
- No nested feature folders; flat structure per category

**Functions & Exports:**
- Service exports: Named export object (e.g., `export const authService = {}`)
- Hook exports: Named export with "use" prefix (e.g., `export const useAuth = () => {}`)
- Utility exports: Named exports for individual functions
- Screen exports: Default export of component

**Variables & Constants:**
- React state: camelCase (e.g., `sessionActive`, `elapsedTime`)
- Constants: UPPER_SNAKE_CASE (e.g., `DATABASE_NAME`, `LOCATION_TASK_NAME`, `SESSION_ID_KEY`)
- Storage keys: UPPER_SNAKE_CASE or descriptive constant (e.g., `SESSION_ID_KEY`, `battery_optimization_prompted`)

## Where to Add New Code

**New Feature (e.g., new API endpoint):**
- Primary code:
  - Screen: `src/screens/[FeatureName]Screen.js`
  - Service: `src/services/[Feature]Service.js`
  - Context (if global state needed): `src/context/[Feature]Context.js`
- Tests: Not yet established; create test directory when testing framework added
- Add route: `App.js` - add `<Stack.Screen>` entry

**New Component/Module:**
- If reusable UI: Create `src/components/[ComponentName].js` directory (not present; new)
- If business logic: Create service in `src/services/`
- If state: Create context in `src/context/` or use local component state

**Utilities:**
- Shared helpers: `src/utils/[utility].js`
- Permission-related: `src/utils/locationPermissions.js`
- Platform-specific: `src/utils/batteryOptimization.js`

**Database Queries:**
- New location-related schema changes: `src/db/locationDB.js` - add export function
- Only one database file used currently (SQLite locations table)

## Special Directories

**android/ & ios/:**
- Purpose: Native platform code
- Generated: Partially (node_modules linked)
- Committed: Yes (source code committed, builds generated)

**node_modules/:**
- Purpose: NPM package dependencies
- Generated: Yes (npm install)
- Committed: No (.gitignore)

**.expo/:**
- Purpose: Expo CLI cache and metadata
- Generated: Yes (Expo CLI)
- Committed: No (.gitignore)

**.git/:**
- Purpose: Git version control
- Generated: Yes (git init)
- Committed: Yes

**.planning/codebase/:**
- Purpose: GSD planning documents
- Generated: Yes (by gsd:map-codebase)
- Committed: Yes (recommended)

## Architecture-Specific Patterns

**Context Subscriptions:**
Screens access auth via `useAuth()` hook. Pattern:
```javascript
const { user, token, logout } = useAuth();
```

**Service Response Normalization:**
All services return structure:
```javascript
{ success: boolean, data?: object, message?: string, ...serviceSpecific }
```

**Database Persistence:**
Location points marked with `synced` flag (0=pending, 1=synced). Upload process:
1. Query `synced=0` points
2. Batch and POST to backend
3. Mark batch `synced=1` on success
4. On failure, leave `synced=0` for next retry window

**Navigation Stack:**
Single stack navigator in App.js with screens:
- Login (initial, headerShown=false)
- Session (main hub after login)
- Appointments (list view)
- AppointmentUpdate (detail/edit)
- Report (post-session summary)

**Local Storage Keys:**
Used via AsyncStorage (key-value store):
- `token`: Auth token string
- `user`: User object JSON
- `active_session_id`: Current session ID
- `battery_optimization_prompted`: Boolean flag for one-time prompt

---

*Structure analysis: 2026-02-10*
