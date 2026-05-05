import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertPoint } from '../db/locationDB';
import { diagnosticsService } from './diagnosticsService';
import { LOCATION_TASK_NAME } from './locationTaskConstants';

const SESSION_ID_KEY = 'active_session_id';
const MAX_CONSECUTIVE_FAILURES = 10;

// Track consecutive failures
let consecutiveFailures = 0;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const toOptionalNumber = (value) => (isFiniteNumber(value) ? value : null);

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

  const coords = location.coords;
  if (!coords || typeof coords !== 'object') {
    return {
      valid: false,
      reason: `location at index ${index} is missing coords`,
    };
  }

  const { latitude, longitude } = coords;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    return {
      valid: false,
      reason: `location at index ${index} has invalid latitude/longitude`,
    };
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      valid: false,
      reason: `location at index ${index} has out-of-range coordinates`,
    };
  }

  const parsedTimestamp = new Date(location.timestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return {
      valid: false,
      reason: `location at index ${index} has invalid timestamp`,
    };
  }

  return {
    valid: true,
    point: {
      latitude,
      longitude,
      accuracy: toOptionalNumber(coords.accuracy),
      speed: toOptionalNumber(coords.speed),
      heading: toOptionalNumber(coords.heading),
      timestamp: parsedTimestamp.toISOString(),
    },
  };
};

const stopTaskSafely = async (reason) => {
  console.error(`[LocationTask] ${reason}`);
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
    console.error('[LocationTask] Failed to stop location updates:', stopError);
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
  const { data, error } = taskPayload || {};
  const diagnosticsEnabled = await diagnosticsService
    .isLocationDiagnosticsEnabled()
    .catch(() => false);

  if (diagnosticsEnabled) {
    recordLocationDiagnostic('task_received', summarizeTaskPayload(taskPayload));
  }

  if (error) {
    consecutiveFailures++;
    console.error('[LocationTask] Error:', error);
    recordLocationDiagnostic(
      'task_error_payload',
      {
        error: getErrorDetails(error),
      },
      { force: true }
    );

    // Stop task after too many consecutive errors
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      await stopTaskSafely('Too many consecutive failures, stopping task');
    }
    return;
  }

  if (!data || typeof data !== 'object') {
    consecutiveFailures++;
    console.error('[LocationTask] Invalid task payload: expected object', {
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
    console.error('[LocationTask] Invalid task payload: missing or empty locations array', {
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
    console.error('[LocationTask] No active session ID - task running without session');
    recordLocationDiagnostic(
      'task_missing_session',
      {
        locations_length: locations.length,
        stored_session_id: sessionIdStr,
      },
      { force: true }
    );

    // Stop task if running without a session
    if (consecutiveFailures >= 3) {
      await stopTaskSafely('Stopping task - no active session');
    }
    return;
  }

  const sessionId = parseInt(sessionIdStr, 10);
  
  if (Number.isNaN(sessionId) || sessionId <= 0) {
    consecutiveFailures++;
    console.error('[LocationTask] Invalid session ID format:', sessionIdStr);
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

  for (const [index, location] of locations.entries()) {
    const parsedLocation = parseLocationPayload(location, index);
    if (!parsedLocation.valid) {
      malformedLocationCount++;
      console.error('[LocationTask] Skipping malformed location payload', {
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

    let retries = 3;
    let inserted = false;

    while (retries > 0 && !inserted) {
      try {
        await insertPoint({
          session_id: sessionId,
          latitude: parsedLocation.point.latitude,
          longitude: parsedLocation.point.longitude,
          accuracy: parsedLocation.point.accuracy,
          speed: parsedLocation.point.speed,
          heading: parsedLocation.point.heading,
          timestamp: parsedLocation.point.timestamp
        });
        inserted = true;
        insertedLocationCount++;
        consecutiveFailures = 0; // Reset on success
      } catch (err) {
        retries--;

        if (retries > 0) {
          // Wait 500ms before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          consecutiveFailures++;
          console.error('[LocationTask] Failed to insert location after retries:', err);
          recordLocationDiagnostic(
            'task_insert_failed',
            {
              session_id: sessionId,
              location_index: index,
              error: getErrorDetails(err),
            },
            { force: true }
          );
        }
      }
    }
  }

  if (malformedLocationCount > 0) {
    if (malformedLocationCount === locations.length) {
      consecutiveFailures++;
    }

    console.error('[LocationTask] Malformed locations skipped from payload batch', {
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
    });
  }

  // Stop task if too many consecutive failures
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    await stopTaskSafely('Too many consecutive failures, stopping task');
  }
});
