# Codebase Concerns

**Analysis Date:** 2026-02-10

## Tech Debt

**Silent Error Handling in AuthContext:**
- Issue: Multiple catch blocks silently swallow errors without logging or user feedback
- Files: `src/context/AuthContext.js` (lines 25-27, 36-37, 50-53)
- Impact: Errors during login/logout/auth recovery go unnoticed, making debugging difficult. Users experience undefined behavior when auth operations fail.
- Fix approach: Add console.error() logging to all catch blocks. Consider user-facing error alerts for critical operations like login/logout.

**Unhandled Errors in LocationTask Background Worker:**
- Issue: Location task error handler (line 9-10 in `src/services/LocationTask.js`) returns early without logging
- Files: `src/services/LocationTask.js`
- Impact: Location capture failures are invisible. Users won't know if background tracking is broken until sync reveals gaps.
- Fix approach: Log errors to a persistent error queue. Add mechanism to alert user of tracking failures.

**Silent Failures in LocationUploader:**
- Issue: Errors in uploadBatch retry loop are caught but only silently incremented as "failed" counter (lines 67-72 in `src/services/LocationUploader.js`)
- Files: `src/services/LocationUploader.js`
- Impact: No diagnostic information when points fail to upload. Can't determine if it's network, auth, or server issues.
- Fix approach: Log error details (error.message, error.response.status) when batch fails. Consider separate handling for network vs auth vs server errors.

**Unvalidated Error Responses in AuthService:**
- Issue: Error responses assume `error.response.data` structure without guards (lines 31-32 in `src/services/AuthService.js`)
- Files: `src/services/AuthService.js`
- Impact: If backend returns unexpected error format, app crashes instead of showing user-friendly message.
- Fix approach: Add try-catch around response parsing. Provide fallback generic error message.

**No Error Recovery in AppointmentService:**
- Issue: All catch blocks in appointment service return generic failures without differentiating between 404, 401, 500, network errors (lines 18-29, 46-57, 74-85 in `src/services/AppointmentService.js`)
- Files: `src/services/AppointmentService.js`
- Impact: Users get same error message for "server down" and "not authenticated", making troubleshooting impossible.
- Fix approach: Add specific error type detection (401 = re-login, 404 = data not found, 5xx = server issue, etc).

**Missing Database Error Recovery:**
- Issue: Database operations throw errors without fallback. If database becomes corrupted, entire app becomes unusable (lines 44-70, 72-78 in `src/db/locationDB.js`)
- Files: `src/db/locationDB.js`
- Impact: Corrupted database could halt location tracking completely. No recovery mechanism.
- Fix approach: Add transaction rollback on insert failures. Implement database validation on getDatabase(). Consider WAL mode for better corruption recovery.

**Incomplete Error Handling in SessionScreen:**
- Issue: Multiple error handlers only log without any user feedback or recovery (lines 65-74, 91-92, 109-110, 199-200 in `src/screens/SessionScreen.js`)
- Files: `src/screens/SessionScreen.js`
- Impact: If session recovery fails, user has active UI state but backend state is unknown. Confusing state.
- Fix approach: Show toast/alert when recovery fails. Provide explicit "refresh" button or auto-retry mechanism.

---

## Security Considerations

**Plaintext Token Storage in AsyncStorage:**
- Risk: Authentication tokens stored in AsyncStorage without encryption
- Files: `src/context/AuthContext.js` (line 21), `src/screens/SessionScreen.js` (line 258)
- Current mitigation: AsyncStorage uses OS-level encryption on most platforms, but not guaranteed
- Recommendations: Use expo-secure-store instead of AsyncStorage for sensitive auth tokens. Or ensure minimum platform version with secure storage.

**Unencrypted Location Data in SQLite:**
- Risk: Raw location coordinates stored unencrypted in local database
- Files: `src/db/locationDB.js`
- Current mitigation: None - location data is user-sensitive PII
- Recommendations: Enable SQLite encryption (sqlcipher). Or hash/encrypt coordinates client-side before storage.

**Hardcoded API Base URL:**
- Risk: API endpoint hardcoded in source (line 4 in `src/config/api.js`)
- Files: `src/config/api.js`
- Current mitigation: None for production builds
- Recommendations: Move to environment variable. Use different endpoints for dev/staging/prod. Consider SSL pinning for certificate verification.

**No Input Validation Before API Submission:**
- Risk: Appointment updates sent to API without validation of date/time format consistency
- Files: `src/screens/AppointmentUpdateScreen.js` (line 109-150)
- Current mitigation: Client-side date picker restricts format, but no server-side validation confirmed
- Recommendations: Add explicit validation for date < endTime. Validate appointment_id exists in local cache before submission.

**Logging Sensitive Data:**
- Risk: API logs include response data and potentially sensitive appointment details
- Files: `src/config/api.js` (line 51), `src/services/AppointmentService.js` (multiple console.log calls)
- Current mitigation: None
- Recommendations: Remove console.log of response data in production. Use structured logging with PII filtering.

---

## Performance Bottlenecks

**N+1 Location Upload Problem:**
- Problem: Each location point uploaded individually in retry loops with 500ms delays between retries
- Files: `src/services/LocationTask.js` (lines 23-43), `src/services/LocationUploader.js` (lines 54-78)
- Cause: Batch logic exists in LocationUploader but task manager inserts points one-by-one with blocking retries
- Improvement path: Collect 10-20 locations in memory before inserting, or increase batch size threshold

**SessionScreen Renders on Every Property Change:**
- Problem: Multiple independent useEffect hooks trigger full re-renders (timer, upload retry, location check all setState)
- Files: `src/screens/SessionScreen.js` (lines 99-116, 119-134, 137-210)
- Cause: Each useEffect independently updates state without memoization or consolidation
- Improvement path: Consolidate timer/upload/location check into single useEffect. Use useReducer for state management.

**Unoptimized FlatList Rendering in AppointmentsScreen:**
- Problem: No keyExtractor memoization, renderAppointmentItem re-creates on every render
- Files: `src/screens/AppointmentsScreen.js` (lines 122-175, 211)
- Cause: Inline function definitions and missing useMemo for item renderers
- Improvement path: Extract renderAppointmentItem to useMemo. Use React.memo for list items.

**Unused Location Data Growth:**
- Problem: Synced location data cleared only every 7 days (line 107 in `src/db/locationDB.js`), can grow unbounded during long sessions
- Files: `src/db/locationDB.js`
- Cause: No trigger to clean old data except manual call. Background tracking runs continuously.
- Improvement path: Add automatic cleanup when database size exceeds threshold. Or implement retention based on last sync date, not just synced status.

**Exponential Retry Delay in LocationUploader:**
- Problem: Retry delay increases exponentially (RETRY_DELAY_MS * attempt), could slow upload significantly on network issues
- Files: `src/services/LocationUploader.js` (line 70)
- Cause: Retry multiplier applied linearly but could backoff too aggressively
- Improvement path: Implement exponential backoff with max delay cap. Consider jitter to avoid thundering herd.

---

## Known Bugs

**Session Recovery Time Discrepancy:**
- Symptoms: When session is recovered after app restart, elapsed time shows wrong duration (starts from current time instead of actual session start)
- Files: `src/screens/SessionScreen.js` (lines 29-78)
- Trigger: 1. Start session 2. Force close app 3. Reopen app 4. Timer shows ~0 seconds instead of actual elapsed time
- Workaround: Backend timestamp from getActiveSession is used but only on successful verify. Offline mode uses current time as fallback, creating discrepancy.
- Root cause: Line 67 uses `new Date()` as fallback instead of loading stored start time from AsyncStorage

**Timezone Issues in DateTime Display:**
- Symptoms: Appointment times display incorrectly across different timezones or after midnight
- Files: `src/screens/AppointmentUpdateScreen.js` (lines 101-107), `src/utils/batteryOptimization.js`
- Trigger: User views appointments late at night or with timezone offset
- Cause: formatDate/parseTimeToDate don't handle timezone - uses local system time without UTC conversion
- Risk: Staff scheduled for wrong time slots if system timezone differs from business timezone

**Unmatched Location Permission Error Message:**
- Symptoms: User sees "Background location permission denied" but granted foreground permission
- Files: `src/utils/locationPermissions.js` (lines 40-48)
- Trigger: iOS user grants foreground but denies background permission
- Root cause: Line 43 comment says "Step 2" but is actually step 3. Error message at line 47 doesn't distinguish foreground vs background failure

**AsyncStorage Session ID Type Mismatch:**
- Symptoms: Occasionally session operations fail with "Session ID not a number" errors
- Files: `src/screens/SessionScreen.js` (line 40), `src/services/LocationTask.js` (line 17)
- Trigger: Rapid start/stop session operations
- Root cause: Session ID stored as string in AsyncStorage (line 258 in SessionScreen uses String()), but parsed as int without validation. Race conditions possible.

---

## Fragile Areas

**SessionScreen Component (657 lines):**
- Files: `src/screens/SessionScreen.js`
- Why fragile: Monolithic component managing session state, tracking, uploads, location checks, timers, and auth all in one. 5 separate useEffect hooks with complex interdependencies and state mutations.
- Safe modification: Extract each concern into custom hooks: useSessionRecovery, useLocationMonitoring, useUploadRetry. Add integration tests for state transitions.
- Test coverage: Missing integration tests for session recovery after app crash. No tests for offline->online transitions during active session.

**LocationUploader Service (82 lines):**
- Files: `src/services/LocationUploader.js`
- Why fragile: Complex nested loops with retry logic. Silent failure accumulation. Mutation of external database state without transaction isolation.
- Safe modification: Add transaction wrapper around entire upload flow. Break into smaller functions: uploadBatch, handleRetry, markPoints. Add error event emitter.
- Test coverage: No tests for batch edge cases (empty batch, single item, failed partway through, network timeout). No tests for session_id=null skipping.

**Database Location Insert Flow:**
- Files: `src/db/locationDB.js`, `src/services/LocationTask.js`
- Why fragile: getDatabase() creates singleton with side effects. tableCreated flag could become stale if database closes. insertPoint silently fails and retries without informing caller of final state.
- Safe modification: Add explicit initialization phase. Use connection pooling. Return operation status (success/failed/timeout) instead of throwing.
- Test coverage: No tests for database reinitialization after close/corrupt.

**AppointmentUpdateScreen Time Handling (483 lines):**
- Files: `src/screens/AppointmentUpdateScreen.js`
- Why fragile: Multiple date/time formatting functions with manual string parsing. Time validation happens only on submit (not on input). No timezone awareness.
- Safe modification: Use date-fns or moment.js for timezone-aware formatting. Add real-time validation on time field changes. Validate endTime > startTime before allowing submit.
- Test coverage: No tests for time picker edge cases (midnight, DST transitions). No tests for validation messages.

---

## Test Coverage Gaps

**Missing Location Tracking Tests:**
- What's not tested: Background location collection during active session. Location task error handling. Retry logic with network failures.
- Files: `src/services/LocationTask.js`, `src/services/LocationUploader.js`, `src/db/locationDB.js`
- Risk: Silent tracking failures go undetected. Users might not know location data isn't being recorded.
- Priority: HIGH - Core business feature

**Missing Session State Recovery Tests:**
- What's not tested: App restart with active session. Session recovery when backend disagrees. Offline session resume.
- Files: `src/screens/SessionScreen.js`, `src/context/AuthContext.js`
- Risk: Data loss if app crashes mid-session. Session state inconsistency between client and server.
- Priority: HIGH - Data integrity risk

**Missing Authentication Error Handling Tests:**
- What's not tested: Login with invalid credentials. Token expiration during session. Auth service network errors.
- Files: `src/services/AuthService.js`, `src/context/AuthContext.js`
- Risk: Unhandled auth errors leave app in broken state.
- Priority: MEDIUM - Affects user experience

**Missing Appointment API Integration Tests:**
- What's not tested: Appointment fetch failures. Update failures due to validation. Concurrent appointment updates.
- Files: `src/services/AppointmentService.js`, `src/screens/AppointmentsScreen.js`
- Risk: Silent failures when backend returns errors. Data consistency issues on concurrent edits.
- Priority: MEDIUM - Data integrity

**Missing DateTime Validation Tests:**
- What's not tested: Date parsing edge cases (DST transitions, leap years, timezone changes). Invalid time format handling.
- Files: `src/screens/AppointmentUpdateScreen.js`, `src/utils/locationPermissions.js`
- Risk: Incorrect appointment scheduling due to timezone bugs.
- Priority: MEDIUM - Business logic correctness

---

## Missing Critical Features

**No Offline Queue for Unsent Updates:**
- Problem: Appointment updates posted directly to API with no queue. If network fails mid-request, update is lost. No retry.
- Blocks: Reliable appointment tracking in poor network conditions

**No Data Validation on Backend Response:**
- Problem: Assume all API responses have expected structure. No defensive parsing.
- Blocks: Robustness against API schema changes

**No Session Conflict Detection:**
- Problem: User can start new session while backend still has old one active. Creates duplicate location data.
- Blocks: Multi-device session management

**No Battery Usage Optimization:**
- Problem: Location tracking runs at HIGH accuracy continuously. No power-saving modes.
- Blocks: Extended session duration without battery drain concerns

**No Resume After Network Reconnection:**
- Problem: If device goes offline, upload stops. No automatic retry when network returns.
- Blocks: Seamless mobile experience on unreliable networks

**No User Notification System:**
- Problem: Errors and upload status only shown on active screen via console.log. Background failures invisible.
- Blocks: Reliable delivery confirmation to user

---

## Scaling Limits

**SQLite Database File Growth:**
- Current capacity: ~50 points/minute * 60 minutes = 3000 points/hour. Each point ~200 bytes = 600 KB/hour = 14.4 MB/day
- Limit: SQLite default file limit varies by filesystem, but typical limit 1-2 GB per file on mobile
- Scaling path: Implement data archival to cloud after 7 days. Or implement tiered storage (in-memory cache + SQLite hot + cloud cold).

**In-Memory Retry Queues:**
- Current capacity: No limit on retry attempts per upload batch. On poor network, could accumulate unbounded queue.
- Limit: Mobile device available RAM ~100-500 MB. If upload queue grows larger than 10% of available RAM, OOM risk.
- Scaling path: Implement max queue size with FIFO eviction. Persist failed uploads to SQLite for recovery.

**Background Task Performance:**
- Current capacity: Location updates every 5 seconds. Each update triggers insertPoint with 3 retries (worst case 1.5 seconds per point)
- Limit: If 6+ location updates arrive in parallel (burst), retry queue could block. Task manager might skip updates if previous task still running.
- Scaling path: Batch 10 locations before insert attempt. Use async queuing instead of sequential retries.

---

## Dependencies at Risk

**expo-location ^19.0.8:**
- Risk: Expo dependency with background location tasks. If expo-task-manager breaks, tracking stops.
- Impact: Core feature dependent on single library. No fallback tracking mechanism.
- Migration plan: Could implement native module wrapper around Android LocationManager + iOS CLLocationManager for direct control. Estimate 2-3 weeks.

**axios ^1.6.2:**
- Risk: Axios might deprecate in favor of fetch API. No error retry middleware integrated.
- Impact: Every service has own error handling. Changes require updating 4+ files.
- Migration plan: Wrap axios in API client class with centralized error handling. Or migrate to fetch with retry wrapper.

**expo-sqlite ~16.0.10:**
- Risk: Expo SQLite uses newer API. Upgrading could break migrations.
- Impact: Schema changes require careful testing on all target devices.
- Migration plan: Add database versioning and migration system. Consider migrating to WatermelonDB for better ORM support.

**@react-native-async-storage/async-storage 2.2.0:**
- Risk: AsyncStorage deprecated in some contexts (not recommended for sensitive data). Breaking changes in storage format between versions.
- Impact: Token storage vulnerable. Upgrade could lose stored data.
- Migration plan: Migrate to expo-secure-store for tokens. Use AsyncStorage for non-sensitive app state only.

---

*Concerns audit: 2026-02-10*
