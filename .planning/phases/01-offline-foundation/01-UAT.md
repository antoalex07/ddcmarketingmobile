---
status: testing
phase: 01-offline-foundation
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md]
started: 2026-02-11T12:00:00Z
updated: 2026-02-11T12:06:00Z
---

## Current Test

number: 7
name: Merged list shows backend and local appointments
expected: |
  Appointments screen displays both appointments from backend (already synced) and newly created local appointments (not yet synced) in the same list.
awaiting: user response

## Tests

### 1. Navigate to create screen
expected: Tap the blue FAB (floating action button with "+" icon) at bottom-right of Appointments screen. New Appointment screen opens showing form with fields for client name, client type buttons, date, time from/to, and notes.
result: pass

### 2. Select client type
expected: On create form, tap the doctor/clinic/hospital buttons. Selected type highlights in blue. Default is doctor (pre-selected).
result: pass

### 3. Fill and submit appointment form
expected: Fill in client name (e.g., "Dr. Smith"), select client type, enter date (e.g., "2026-02-15"), time from (e.g., "09:00"), time to (e.g., "10:00"), optional notes. Tap "Create Appointment" button. Alert shows "Appointment created! It will sync when you're online." and returns to appointments list.
result: pass

### 4. Validation prevents empty submission
expected: Try to submit form with empty client name or date/time fields. Alert shows "Couldn't save appointment. Please try again." Form stays open (doesn't navigate away).
result: pass

### 5. New appointment appears in list
expected: After creating appointment, return to Appointments screen. New appointment appears in the list showing client name, date, and time. Appointment has "Pending sync" badge (small indicator).
result: pass

### 6. Appointment has temp negative ID
expected: (Technical verification) Newly created offline appointment is stored with negative temporary ID (e.g., -1, -2) until synced.
result: pass

### 3. Fill and submit appointment form
expected: Fill in client name (e.g., "Dr. Smith"), select client type, enter date (e.g., "2026-02-15"), time from (e.g., "09:00"), time to (e.g., "10:00"), optional notes. Tap "Create Appointment" button. Alert shows "Appointment created! It will sync when you're online." and returns to appointments list.
result: [pending]

### 4. Validation prevents empty submission
expected: Try to submit form with empty client name or date/time fields. Alert shows "Couldn't save appointment. Please try again." Form stays open (doesn't navigate away).
result: [pending]

### 5. New appointment appears in list
expected: After creating appointment, return to Appointments screen. New appointment appears in the list showing client name, date, and time. Appointment has "Pending sync" badge (small indicator).
result: [pending]

### 6. Appointment has temp negative ID
expected: (Technical verification) Newly created offline appointment is stored with negative temporary ID (e.g., -1, -2) until synced.
result: [pending]

### 7. Merged list shows backend and local appointments
expected: Appointments screen displays both appointments from backend (already synced) and newly created local appointments (not yet synced) in the same list.
result: [pending]

### 8. Auto-sync on connection
expected: Create appointment offline. Turn on internet/connect to network. Wait a few seconds. "Pending sync" badge disappears and appointment updates with permanent backend ID. (Auto-sync triggered by network connection restoration)
result: [pending]

### 9. Manual sync button
expected: Appointments screen has a "Sync" button (usually at top or in header). Tap it. Unsynced appointments upload to backend. "Pending sync" badges disappear after successful sync.
result: [pending]

### 10. Sync retry on failure
expected: (May require simulating backend unavailability) If sync fails, system retries automatically up to 3 times with increasing delays (1s, 2s, 3s). After 3 failed attempts, appointment shows "Failed" badge or error indicator.
result: [pending]

### 11. Duplicate detection warning
expected: Create appointment with same client name, date, and time (within 30 minutes of existing appointment). When manually syncing, system shows warning dialog: "This looks like a duplicate. Proceed anyway?" with Cancel/Proceed options.
result: [pending]

### 12. Offline mode displays local appointments
expected: Turn off internet/disconnect from network. Open Appointments screen. Local unsynced appointments still appear in list. Screen may show offline indicator but list is functional.
result: [pending]

### 13. Friendly error messages
expected: Throughout appointment creation and syncing, error messages use plain language (e.g., "Couldn't sync appointments" not "HTTP 500 Internal Server Error"). No technical jargon shown to user.
result: [pending]

## Summary

total: 13
passed: 6
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
