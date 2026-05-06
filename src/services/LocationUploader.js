import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUnsyncedPoints } from '../db/locationDB';

const SESSION_ID_KEY = 'active_session_id';

export const uploadUnsyncedLocations = async () => {
  const [sessionId, unsyncedPoints] = await Promise.all([
    AsyncStorage.getItem(SESSION_ID_KEY),
    getUnsyncedPoints(),
  ]);

  return {
    uploaded: 0,
    failed: unsyncedPoints.length,
    skipped: true,
    backend_disabled: true,
    reason: sessionId
      ? 'Backend is disabled in this build'
      : 'No active local session',
  };
};
