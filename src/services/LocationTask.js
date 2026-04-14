import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertPoint } from '../db/locationDB';

export const LOCATION_TASK_NAME = 'background-location-task';
const SESSION_ID_KEY = 'active_session_id';
const MAX_CONSECUTIVE_FAILURES = 10;

// Track consecutive failures
let consecutiveFailures = 0;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const toOptionalNumber = (value) => (isFiniteNumber(value) ? value : null);

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
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (stopError) {
    console.error('[LocationTask] Failed to stop location updates:', stopError);
  }
};

TaskManager.defineTask(LOCATION_TASK_NAME, async (taskPayload) => {
  const { data, error } = taskPayload || {};

  if (error) {
    consecutiveFailures++;
    console.error('[LocationTask] Error:', error);

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
    return;
  }

  let malformedLocationCount = 0;

  for (const [index, location] of locations.entries()) {
    const parsedLocation = parseLocationPayload(location, index);
    if (!parsedLocation.valid) {
      malformedLocationCount++;
      console.error('[LocationTask] Skipping malformed location payload', {
        reason: parsedLocation.reason,
      });
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
        consecutiveFailures = 0; // Reset on success
      } catch (err) {
        retries--;

        if (retries > 0) {
          // Wait 500ms before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          consecutiveFailures++;
          console.error('[LocationTask] Failed to insert location after retries:', err);
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

  // Stop task if too many consecutive failures
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    await stopTaskSafely('Too many consecutive failures, stopping task');
  }
});
