# Requirements: Lab Field Worker Tracking App

**Defined:** 2026-02-10
**Core Value:** Accurate travel expense tracking and accountability for service delivery

## v1 Requirements

Requirements for adding appointment creation capability to the existing field worker app.

### Appointment Creation

- [ ] **CREATE-01**: User can navigate to appointment creation screen from appointments list
- [ ] **CREATE-02**: User can select appointment type (doctor, clinic, hospital) from dropdown
- [ ] **CREATE-03**: User can search for client using autocomplete search with type-ahead
- [ ] **CREATE-04**: User can select existing client from search results
- [ ] **CREATE-05**: User can create new client inline with name, type, and location
- [ ] **CREATE-06**: User can enter appointment location/address manually
- [ ] **CREATE-07**: User can select appointment date from date picker
- [ ] **CREATE-08**: User can select appointment start time from time picker
- [ ] **CREATE-09**: User can select appointment end time from time picker
- [ ] **CREATE-10**: User can select initial appointment status from dropdown
- [ ] **CREATE-11**: User can add optional visit notes to new appointment
- [ ] **CREATE-12**: User can mark whether appointment requires follow-up visit
- [ ] **CREATE-13**: User receives confirmation when appointment is created successfully

### Offline Capability

- [ ] **OFFLINE-01**: User can create appointments without internet connection
- [ ] **OFFLINE-02**: Appointments created offline save to local SQLite database
- [ ] **OFFLINE-03**: Offline appointments sync to backend automatically when connection returns
- [ ] **OFFLINE-04**: User can see which appointments are pending sync (visual indicator)
- [ ] **OFFLINE-05**: User can see which appointments have synced successfully (visual indicator)
- [ ] **OFFLINE-06**: User can see which appointments failed to sync with error message
- [ ] **OFFLINE-07**: User can manually retry syncing failed appointments

### Data Validation

- [ ] **VALID-01**: User cannot select past dates for new appointments
- [ ] **VALID-02**: User cannot select end time before start time
- [ ] **VALID-03**: User must complete all required fields before submitting appointment
- [ ] **VALID-04**: User receives inline validation errors for invalid inputs as they type
- [ ] **VALID-05**: User sees suggested existing clients when typing to prevent duplicate entries

## v2 Requirements

Deferred enhancements for future releases.

### Smart Features

- **SMART-01**: System suggests typical appointment times based on appointment type
- **SMART-02**: System auto-captures worker's GPS location when creating appointment
- **SMART-03**: User can quick-duplicate their last appointment with pre-filled data
- **SMART-04**: User can use voice-to-text for entering appointment notes

### Advanced Creation

- **ADV-01**: User can attach photos to new appointments
- **ADV-02**: User can create multiple appointments in batch mode
- **ADV-03**: User receives suggestions for nearby clients based on current location
- **ADV-04**: User can set recurring appointment patterns

## Out of Scope

Explicitly excluded to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time appointment approval workflow | Adds complexity and latency, workers need to schedule immediately |
| Calendar view in create flow | Context switching slows data entry, separate view is sufficient |
| Multi-client appointments | Edge case that adds significant complexity |
| Advanced scheduling optimization | Workers manage their own routes effectively |
| Integration with external calendar apps | Not needed, app is the system of record |
| Mandatory photo documentation | Not required for sample collection workflow |
| Address validation services | Costs money, works offline with manual entry |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CREATE-01 | Phase 2 | Pending |
| CREATE-02 | Phase 2 | Pending |
| CREATE-03 | Phase 3 | Pending |
| CREATE-04 | Phase 3 | Pending |
| CREATE-05 | Phase 3 | Pending |
| CREATE-06 | Phase 2 | Pending |
| CREATE-07 | Phase 2 | Pending |
| CREATE-08 | Phase 2 | Pending |
| CREATE-09 | Phase 2 | Pending |
| CREATE-10 | Phase 2 | Pending |
| CREATE-11 | Phase 2 | Pending |
| CREATE-12 | Phase 2 | Pending |
| CREATE-13 | Phase 2 | Pending |
| OFFLINE-01 | Phase 1 | Pending |
| OFFLINE-02 | Phase 1 | Pending |
| OFFLINE-03 | Phase 1 | Pending |
| OFFLINE-04 | Phase 4 | Pending |
| OFFLINE-05 | Phase 4 | Pending |
| OFFLINE-06 | Phase 4 | Pending |
| OFFLINE-07 | Phase 4 | Pending |
| VALID-01 | Phase 2 | Pending |
| VALID-02 | Phase 2 | Pending |
| VALID-03 | Phase 2 | Pending |
| VALID-04 | Phase 2 | Pending |
| VALID-05 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-10*
*Last updated: 2026-02-10 after roadmap creation*
