import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertPoint } from '../db/locationDB';

export const LOCATION_TASK_NAME = 'background-location-task';
const SESSION_ID_KEY = 'active_session_id';
const MAX_CONSECUTIVE_FAILURES = 10;

// Track consecutive failures
let consecutiveFailures = 0;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    consecutiveFailures++;
    console.error('[LocationTask] Error:', error);

    // Stop task after too many consecutive errors
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error('[LocationTask] Too many consecutive failures, stopping task');
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch (stopError) {
        // Ignore
      }
    }
    return;
  }

  if (data) {
    const { locations } = data;

    // Validate session exists before writing locations
    const sessionIdStr = await AsyncStorage.getItem(SESSION_ID_KEY);
    
    if (!sessionIdStr || sessionIdStr === 'null' || sessionIdStr === 'undefined') {
      consecutiveFailures++;
      console.error('[LocationTask] No active session ID - task running without session');

      // Stop task if running without a session
      if (consecutiveFailures >= 3) {
        console.error('[LocationTask] Stopping task - no active session');
        try {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        } catch (stopError) {
          // Ignore
        }
      }
      return;
    }

    const sessionId = parseInt(sessionIdStr, 10);
    
    if (Number.isNaN(sessionId) || sessionId <= 0) {
      consecutiveFailures++;
      console.error('[LocationTask] Invalid session ID format:', sessionIdStr);
      return;
    }

    for (const location of locations) {
      let retries = 3;
      let inserted = false;

      while (retries > 0 && !inserted) {
        try {
          await insertPoint({
            session_id: sessionId,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: location.coords.speed,
            heading: location.coords.heading,
            timestamp: new Date(location.timestamp).toISOString()
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

    // Stop task if too many consecutive failures
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error('[LocationTask] Too many consecutive failures, stopping task');
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch (stopError) {
        // Ignore
      }
    }
  }
});
