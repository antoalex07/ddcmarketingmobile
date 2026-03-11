import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertPoint } from '../db/locationDB';

export const LOCATION_TASK_NAME = 'background-location-task';
const SESSION_ID_KEY = 'active_session_id';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    return;
  }

  if (data) {
    const { locations } = data;

    const sessionIdStr = await AsyncStorage.getItem(SESSION_ID_KEY);
    const sessionId = sessionIdStr ? parseInt(sessionIdStr, 10) : null;

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
        } catch (err) {
          retries--;

          if (retries > 0) {
            // Wait 500ms before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    }
  }
});
