import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertPoint } from '../db/locationDB';
import { diagnosticsService } from './diagnosticsService';
import { checkLocationPermissions } from '../utils/locationPermissions';
import { LOCATION_TASK_NAME } from './locationTaskConstants';

const SESSION_ID_KEY = 'active_session_id';
const MAX_CONSECUTIVE_FAILURES = 10;

// Track consecutive failures
let consecutiveFailures = 0;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const toOptionalNumber = (value) => (isFiniteNumber(value) ? value : null);

const isValidCoordinatePair = (latitude, longitude) => (
  isFiniteNumber(latitude) &&
  isFiniteNumber(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180
);

const getErrorDetails = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error || 'Unknown error'),
  stack: typeof error?.stack === 'string' ? error.stack : null,
});

const summarizeLocation = (location) => {
  if (!location || typeof location !== 'object') {
    return {
      value_type: typeof location,
      valid_object: false,
    };
  }

  const coords = location.coords;

  return {
    valid_object: true,
    has_coords: Boolean(coords && typeof coords === 'object'),
    has_latitude: isFiniteNumber(coords?.latitude),
    has_longitude: isFiniteNumber(coords?.longitude),
    has_accuracy: isFiniteNumber(coords?.accuracy),
    has_speed: isFiniteNumber(coords?.speed),
    has_heading: isFiniteNumber(coords?.heading),
    timestamp_type: typeof location.timestamp,
    timestamp_valid: !Number.isNaN(new Date(location.timestamp).getTime()),
  };
};

const summarizeTaskPayload = (taskPayload) => {
  const data = taskPayload?.data;
  const locations = Array.isArray(data?.locations) ? data.locations : null;

  return {
    has_payload: Boolean(taskPayload),
    has_error: Boolean(taskPayload?.error),
    data_type: typeof data,
    has_locations_array: Array.isArray(data?.locations),
    locations_length: locations ? locations.length : null,
    first_location: locations && locations.length > 0 ? summarizeLocation(locations[0]) : null,
  };
};

const recordLocationDiagnostic = (event, details = {}, options = {}) => {
  diagnosticsService
    .appendLocationDiagnostic(
      event,
      {
        consecutive_failures: consecutiveFailures,
        ...details,
      },
      {
        source: 'LocationTask',
        ...options,
      }
    )
    .catch(() => {});
};

const parseLocationPayload = (location, index) => {
  if (!location || typeof location !== 'object') {
    return {
      valid: false,
      reason: `location at index ${index} is not an object`,
    };
  }

  const parsedTimestamp = new Date(location.timestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return {
      valid: false,
      reason: `location at index ${index} has invalid timestamp`,
    };
  }

  const coords = location.coords;
  const hasCoords = coords && typeof coords === 'object';
  const latitude = hasCoords ? coords.latitude : null;
  const longitude = hasCoords ? coords.longitude : null;
  const hasValidCoordinates = isValidCoordinatePair(latitude, longitude);

  return {
    valid: true,
    point: {
      latitude: hasValidCoordinates ? latitude : null,
      longitude: hasValidCoordinates ? longitude : null,
      accuracy: hasCoords ? toOptionalNumber(coords.accuracy) : null,
      speed: hasCoords ? toOptionalNumber(coords.speed) : null,
      heading: hasCoords ? toOptionalNumber(coords.heading) : null,
      timestamp: parsedTimestamp.toISOString(),
    },
    coordinatesMissing: !hasValidCoordinates,
    reason: hasValidCoordinates ? null : `location at index ${index} has unavailable coordinates`,
  };
};

const insertLocationPointWithRetry = async (point, details = {}) => {
  let retries = 3;

  while (retries > 0) {
    try {
      await insertPoint(point);
      return true;
    } catch (err) {
      retries--;

      if (retries > 0) {
        // Wait briefly before retrying a transient database failure.
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        consecutiveFailures++;
        console.warn('[LocationTask] Failed to insert location after retries:', err);
        recordLocationDiagnostic(
          'task_insert_failed',
          {
            ...details,
            error: getErrorDetails(err),
          },
          { force: true }
        );
      }
    }
  }

  return false;
};

const stopTaskSafely = async (reason) => {
  console.warn(`[LocationTask] ${reason}`);
  recordLocationDiagnostic(
    'task_stop_requested',
    {
      reason,
    },
    { force: true }
  );

  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (stopError) {
    console.warn('[LocationTask] Failed to stop location updates:', stopError);
    recordLocationDiagnostic(
      'task_stop_failed',
      {
        reason,
        error: getErrorDetails(stopError),
      },
      { force: true }
    );
  }
};

TaskManager.defineTask(LOCATION_TASK_NAME, async (taskPayload) => {
  try {
    const { data, error } = taskPayload || {};
    const diagnosticsEnabled = await diagnosticsService
      .isLocationDiagnosticsEnabled()
      .catch(() => false);

    if (diagnosticsEnabled) {
      recordLocationDiagnostic('task_received', summarizeTaskPayload(taskPayload));
    }

    if (error) {
      console.warn('[LocationTask] Error in task payload:', error);
      recordLocationDiagnostic(
        'task_error_payload',
        {
          error: getErrorDetails(error),
        },
        { force: true }
      );

      const sessionIdStr = await AsyncStorage.getItem(SESSION_ID_KEY);
      const sessionId = parseInt(sessionIdStr, 10);

      if (!Number.isNaN(sessionId) && sessionId > 0) {
        const inserted = await insertLocationPointWithRetry(
          {
            session_id: sessionId,
            latitude: null,
            longitude: null,
            accuracy: null,
            speed: null,
            heading: null,
            timestamp: new Date().toISOString(),
          },
          {
            session_id: sessionId,
            location_index: null,
            reason: 'task error payload recorded as null coordinate placeholder',
          }
        );

        if (inserted) {
          consecutiveFailures = 0;
        }
        return;
      }

      consecutiveFailures++;
      recordLocationDiagnostic(
        'task_error_without_session',
        {
          stored_session_id: sessionIdStr,
        },
        { force: true }
      );

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await stopTaskSafely('Too many consecutive failures, stopping task');
      }
      return;
    }

    // Permission check at task start to prevent native exceptions
    const permissionStatus = await checkLocationPermissions().catch(() => ({
      foreground: false,
      background: false,
      fullyGranted: false,
    }));

    if (!permissionStatus.fullyGranted) {
      consecutiveFailures++;
      console.warn('[LocationTask] Permissions denied during task execution', {
        foreground: permissionStatus.foreground,
        background: permissionStatus.background,
      });
      recordLocationDiagnostic(
        'task_permissions_denied',
        {
          foreground: permissionStatus.foreground,
          background: permissionStatus.background,
        },
        { force: true }
      );

      // Stop tracking immediately to prevent repeated crashes
      await stopTaskSafely('Permissions were revoked; stopping tracking');
      return;
    }

    if (!data || typeof data !== 'object') {
      consecutiveFailures++;
      console.warn('[LocationTask] Invalid task payload: expected object', {
        payloadType: typeof data,
      });
      recordLocationDiagnostic(
        'task_invalid_data',
        {
          payload_summary: summarizeTaskPayload(taskPayload),
        },
        { force: true }
      );

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await stopTaskSafely('Too many consecutive failures from invalid payloads, stopping task');
      }
      return;
    }

    const locations = Array.isArray(data.locations) ? data.locations : null;
    if (!locations || locations.length === 0) {
      consecutiveFailures++;
      console.warn('[LocationTask] Invalid task payload: missing or empty locations array', {
        locationsType: typeof data.locations,
        locationsLength: Array.isArray(data.locations) ? data.locations.length : null,
      });
      recordLocationDiagnostic(
        'task_invalid_locations_array',
        {
          payload_summary: summarizeTaskPayload(taskPayload),
        },
        { force: true }
      );

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await stopTaskSafely('Too many consecutive failures from invalid location arrays, stopping task');
      }
      return;
    }

    // Validate session exists before writing locations
    const sessionIdStr = await AsyncStorage.getItem(SESSION_ID_KEY);

    if (!sessionIdStr || sessionIdStr === 'null' || sessionIdStr === 'undefined') {
      consecutiveFailures++;
      console.warn('[LocationTask] No active session ID - task running without session');
      recordLocationDiagnostic(
        'task_missing_session',
        {
          locations_length: locations.length,
          stored_session_id: sessionIdStr,
        },
        { force: true }
      );

      if (consecutiveFailures >= 3) {
        await stopTaskSafely('Stopping task - no active session');
      }
      return;
    }

    const sessionId = parseInt(sessionIdStr, 10);

    if (Number.isNaN(sessionId) || sessionId <= 0) {
      consecutiveFailures++;
      console.warn('[LocationTask] Invalid session ID format:', sessionIdStr);
      recordLocationDiagnostic(
        'task_invalid_session',
        {
          stored_session_id: sessionIdStr,
        },
        { force: true }
      );
      return;
    }

    let malformedLocationCount = 0;
    let insertedLocationCount = 0;
    let nullCoordinateLocationCount = 0;

    for (const [index, location] of locations.entries()) {
      const parsedLocation = parseLocationPayload(location, index);
      if (!parsedLocation.valid) {
        malformedLocationCount++;
        console.warn('[LocationTask] Skipping malformed location payload', {
          reason: parsedLocation.reason,
        });
        recordLocationDiagnostic(
          'task_malformed_location',
          {
            reason: parsedLocation.reason,
            location_summary: summarizeLocation(location),
          },
          { force: true }
        );
        continue;
      }

      if (parsedLocation.coordinatesMissing) {
        nullCoordinateLocationCount++;
        recordLocationDiagnostic(
          'task_null_coordinate_location',
          {
            reason: parsedLocation.reason,
            location_summary: summarizeLocation(location),
          },
          { force: true }
        );
      }

      const inserted = await insertLocationPointWithRetry(
        {
          session_id: sessionId,
          latitude: parsedLocation.point.latitude,
          longitude: parsedLocation.point.longitude,
          accuracy: parsedLocation.point.accuracy,
          speed: parsedLocation.point.speed,
          heading: parsedLocation.point.heading,
          timestamp: parsedLocation.point.timestamp,
        },
        {
          session_id: sessionId,
          location_index: index,
        }
      );

      if (inserted) {
        insertedLocationCount++;
        consecutiveFailures = 0; // Reset on success, including null coordinate placeholders.
      }
    }

    if (malformedLocationCount > 0) {
      if (malformedLocationCount === locations.length) {
        consecutiveFailures++;
      }

      console.warn('[LocationTask] Malformed locations skipped from payload batch', {
        malformedCount: malformedLocationCount,
        totalCount: locations.length,
      });
    }

    if (diagnosticsEnabled) {
      recordLocationDiagnostic('task_batch_complete', {
        session_id: sessionId,
        locations_received: locations.length,
        locations_inserted: insertedLocationCount,
        malformed_locations: malformedLocationCount,
        null_coordinate_locations: nullCoordinateLocationCount,
      });
    }

    // Stop task if too many consecutive failures
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      await stopTaskSafely('Too many consecutive failures, stopping task');
    }
  } catch (taskError) {
    // Catch any uncaught exceptions to prevent native crashes
    consecutiveFailures++;
    console.warn('[LocationTask] Uncaught exception in task:', taskError);
    recordLocationDiagnostic(
      'task_uncaught_exception',
      {
        error: getErrorDetails(taskError),
      },
      { force: true }
    );

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      try {
        await stopTaskSafely('Uncaught exception - stopping task to prevent crash loop');
      } catch (cleanupError) {
        console.warn('[LocationTask] Failed to stop task after exception:', cleanupError);
      }
    }
  }
});
