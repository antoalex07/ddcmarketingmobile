# Roadmap: Field Worker Appointment Creation

## Overview

This roadmap adds appointment creation capability to the existing field worker app. Workers need to add new appointments when encountering clients not on their pre-scheduled route. The feature builds on proven offline-first patterns from location tracking and extends the existing appointment management system. Four phases deliver the complete capability: offline foundation, core creation workflow, client management, and sync visibility.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Offline Foundation** - Local storage and sync infrastructure for appointments
- [ ] **Phase 2: Core Appointment Creation** - Complete form workflow with validation
- [ ] **Phase 3: Client Management** - Search existing clients and add new ones inline
- [ ] **Phase 4: Sync Visibility & Polish** - Status indicators and conflict resolution

## Phase Details

### Phase 1: Offline Foundation
**Goal**: Workers can create appointments that persist locally and sync automatically
**Depends on**: Nothing (first phase)
**Requirements**: OFFLINE-01, OFFLINE-02, OFFLINE-03
**Success Criteria** (what must be TRUE):
  1. Appointments created offline save to local database immediately
  2. Appointments sync to backend automatically when connection returns
  3. App continues working if network drops during appointment creation
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Database layer and sync uploader (appointmentDB + AppointmentUploader)
- [ ] 01-02-PLAN.md — App integration (DB init, NetInfo auto-sync, merged appointment list with duplicate check before sync)
- [ ] 01-03-PLAN.md — Appointment creation screen (minimal form saving to local SQLite for OFFLINE-01)

### Phase 2: Core Appointment Creation
**Goal**: Workers can create complete appointments with all required details
**Depends on**: Phase 1
**Requirements**: CREATE-01, CREATE-02, CREATE-06, CREATE-07, CREATE-08, CREATE-09, CREATE-10, CREATE-11, CREATE-12, CREATE-13, VALID-01, VALID-02, VALID-03, VALID-04
**Success Criteria** (what must be TRUE):
  1. Worker can navigate to appointment creation screen from appointments list
  2. Worker can select appointment type, date, and time range for new appointment
  3. Worker can enter location/address and optional notes
  4. Worker cannot select past dates or invalid time ranges (end before start)
  5. Worker sees confirmation when appointment is created successfully
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Client Management
**Goal**: Workers can select existing clients or add new ones during appointment creation
**Depends on**: Phase 2
**Requirements**: CREATE-03, CREATE-04, CREATE-05, VALID-05
**Success Criteria** (what must be TRUE):
  1. Worker can search for client using type-ahead autocomplete
  2. Worker can select existing client from search results
  3. Worker can create new client inline without leaving appointment form
  4. Worker sees suggested existing clients when typing to prevent duplicates
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Sync Visibility & Polish
**Goal**: Workers can see sync status and resolve any sync failures
**Depends on**: Phase 3
**Requirements**: OFFLINE-04, OFFLINE-05, OFFLINE-06, OFFLINE-07
**Success Criteria** (what must be TRUE):
  1. Worker can see which appointments are pending sync (visual indicator)
  2. Worker can see which appointments have synced successfully
  3. Worker can see which appointments failed to sync with error message
  4. Worker can manually retry syncing failed appointments
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Offline Foundation | 0/3 | Planned | - |
| 2. Core Appointment Creation | 0/TBD | Not started | - |
| 3. Client Management | 0/TBD | Not started | - |
| 4. Sync Visibility & Polish | 0/TBD | Not started | - |
