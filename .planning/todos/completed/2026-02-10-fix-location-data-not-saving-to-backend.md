---
created: 2026-02-10T14:16:02.328Z
title: Fix location data not saving to backend
area: api
files:
  - src/services/LocationUploader.js
  - src/services/LocationTask.js
  - src/db/locationDB.js
  - src/config/api.js
---

## Problem

Location transfer messages are being sent from the mobile app to the backend, but the data is not actually being persisted/added in the backend database. The communication appears to be happening (messages are being sent), but the backend is not saving the location data properly.

This is a critical issue for travel expense tracking and accountability, as location data is core to the app's value proposition.

## Solution

TBD - Investigation needed:
1. Verify backend endpoint is receiving the data correctly
2. Check data format/schema compatibility between mobile and backend
3. Investigate backend database insertion logic
4. Check for errors in backend logs
5. Validate authentication/authorization for the endpoint
