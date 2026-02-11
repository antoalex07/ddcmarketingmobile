# Phase 1: Offline Foundation - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Local persistence and background synchronization for appointments. Workers can create appointments offline that are stored in local SQLite and automatically sync to the backend `appointments_tbl` when internet connection returns. This builds the data layer foundation for appointment creation, similar to how location tracking already works.

</domain>

<decisions>
## Implementation Decisions

### Database Schema
- Local SQLite table mirroring backend `appointments_tbl` structure
- Temporary negative IDs (-1, -2, etc.) for locally created appointments, replaced with real backend IDs after sync
- Track sync status with `synced` integer field (0=unsynced, 1=synced) - matches existing location pattern
- Store full client snapshot (doctor/clinic/hospital data) for complete offline display capability

### Sync Timing & Triggers
- Trigger sync on connection return - app detects when internet connection is restored
- Manual retry button available for workers to force sync attempt
- Send appointments one at a time (not batched) - clearer error handling per appointment
- Active app only - sync happens when app is open/foreground, not in background

### Conflict Resolution
- Phase 1 only handles NEW appointment creation - conflicts deferred to later phase
- Duplicate detection before sync: check for similar appointments (same client, date, time), warn worker before syncing
- No conflict resolution logic needed since these are new records that don't exist on backend yet

### Error & Retry Behavior
- Match location sync pattern: 3 retry attempts with delays between attempts
- Visual indicators only - icon/badge on appointment showing sync status (subtle, non-disruptive)
- Friendly error messages - no technical details for workers ("Couldn't sync appointment")

### Claude's Discretion
- Specific retry delay timing (exponential backoff or fixed intervals)
- Handling appointments that fail after all retries (safest approach for critical appointment data)
- Duplicate detection logic and similarity threshold
- Local SQLite field types, constraints, and indexes

</decisions>

<specifics>
## Specific Ideas

**Backend schema reference (appointments_tbl):**
```sql
- appoint_id (auto increment)
- appoint_userid, appoint_staffname
- appoint_assigneduserid, appoint_assignedstaffname
- appoint_clientautoid, appoint_clientname, appoint_clientaddress, appoint_clienttype
- appoint_appointmentdate, appoint_timefrom, appoint_timeto
- appoint_report, appoint_reportdate, appoint_notes
- appoint_followupdate, appoint_followuptimefrom, appoint_followuptimeto
- appoint_latitude, appoint_longitude
- appoint_status, appointapproval_status, appointapproval_by
- appoint_crtdby, appoint_crton, appoint_updby, appoint_updon
```

**Client tables:** `doctors_table`, `clinics_tbl`, `hospital_tbl` - separate tables for each client type

**Form workflow vision:**
1. Worker selects client type (hospital/clinic/doctor)
2. Search/select from existing clients in that category
3. If client doesn't exist, add to DB first (inline)
4. Then create appointment with selected client

</specifics>

<deferred>
## Deferred Ideas

- Conflict resolution for appointment edits - future phase when appointment updates are supported
- Background sync capability - keeping it simple for Phase 1, only sync when app is active
- Batch sync for efficiency - deferring to maintain clarity on which appointment fails

</deferred>

---

*Phase: 01-offline-foundation*
*Context gathered: 2026-02-11*
