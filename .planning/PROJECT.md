# Lab Field Worker Tracking App

## What This Is

A mobile app for lab field workers to track their visits to client sites (doctors, clinics, hospitals) for sample collection and service delivery. Workers start location tracking sessions during work hours, visit scheduled appointments, and can add new clients they encounter. The app provides accurate travel reimbursement data and proof of service delivery through continuous location tracking and appointment management.

## Core Value

Accurate travel expense tracking and accountability for service delivery. Workers must be able to prove where they went, when, and how long they spent at each location to receive proper reimbursement.

## Requirements

### Validated

<!-- Shipped features - already working in the codebase -->

- ✓ User can log in with username and password — existing
- ✓ User can start work session to begin location tracking — existing
- ✓ User can stop work session to pause location tracking — existing
- ✓ Location updates sent to backend every minute during active session — existing
- ✓ Location tracking continues in background when app is suspended — existing
- ✓ Location data stores locally (offline) and syncs when connection returns — existing
- ✓ User can view their scheduled appointments for the day — existing
- ✓ User can view their staff details — existing
- ✓ User can update appointment status after visit — existing
- ✓ User can add visit notes to appointments — existing
- ✓ User can mark appointments for follow-up (will visit again) — existing
- ✓ Session state persists and recovers after app restart — existing
- ✓ App works without internet connection with automatic sync — existing

### Active

<!-- Current scope - what needs to be built -->

- [ ] User can add new appointment during their route
- [ ] User can select appointment type (doctor, clinic, or hospital)
- [ ] User can select existing client from database or add new client
- [ ] User can set location/address for new appointment
- [ ] User can set scheduled time for new appointment
- [ ] User can set initial status for new appointment
- [ ] New appointments sync to backend when connection is available

### Out of Scope

- Real-time route optimization — Workers plan their own routes
- Voice notes — Text notes are sufficient for now
- Photo documentation — Not required for initial version
- Multi-language support — English-only for v1
- iOS version — Android-first, iOS later if needed

## Context

**Industry:** Medical/diagnostic lab field services
**Users:** Field workers who travel to client sites (doctors' offices, clinics, hospitals) to collect samples or provide lab services

**Current State:** The app is mostly functional with authentication, session management, location tracking, appointment viewing, and updates all working. Location data syncs reliably with offline support. The missing piece is the ability to add new appointments when workers encounter clients not on their pre-scheduled route.

**Backend:** Existing API at ddcpharmacy.com/api with endpoints for authentication, sessions, locations, and appointments. Backend expects location data in batches and stores session tracking information.

**Offline Priority:** Field workers often work in areas with poor connectivity. Offline capability is not optional - the app must queue all data locally and sync automatically when connection returns.

## Constraints

- **Platform**: React Native + Expo (existing stack) — Already implemented, continue using
- **Target**: Android-first — iOS may come later but not in v1
- **Offline**: Must work completely offline — Location tracking and appointment management cannot depend on connectivity
- **Battery**: Location tracking runs all day — Must optimize for battery life, use battery optimization prompts
- **Backend**: Must integrate with existing ddcpharmacy.com API — Cannot change backend contract
- **Data Sync**: Location updates every minute when moving — Backend expects this frequency, do not change

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite for offline storage | Reliable local database for location queue and appointment cache | ✓ Good — Working well for location data |
| Expo Location for tracking | Provides background tracking with foreground service on Android | ✓ Good — Stable location updates |
| Batch upload strategy | Group 50 locations per POST to reduce network requests | ✓ Good — Efficient syncing |
| AsyncStorage for auth | Simple key-value store sufficient for token and user data | ✓ Good — Fast and reliable |

---
*Last updated: 2026-02-10 after initialization*
