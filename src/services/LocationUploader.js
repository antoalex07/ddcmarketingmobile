import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUnsyncedPoints, markAsSynced } from '../db/locationDB';

const SESSION_ID_KEY = 'active_session_id';
const LAST_UPLOAD_ATTEMPT_KEY = 'location_upload_last_attempt';
const LAST_UPLOAD_ERROR_KEY = 'location_upload_last_error';
const LAST_UPLOAD_UPLOADED_KEY = 'location_upload_uploaded_count';
const LAST_UPLOAD_FAILED_KEY = 'location_upload_failed_count';

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const hasUploadableCoordinates = (point) => (
  isFiniteNumber(point?.latitude) &&
  isFiniteNumber(point?.longitude) &&
  point.latitude >= -90 &&
  point.latitude <= 90 &&
  point.longitude >= -180 &&
  point.longitude <= 180
);

export const uploadUnsyncedLocations = async () => {
  const attemptedAt = new Date().toISOString();
  const [sessionId, unsyncedPoints] = await Promise.all([
    AsyncStorage.getItem(SESSION_ID_KEY),
    getUnsyncedPoints(),
  ]);
  const uploadablePoints = unsyncedPoints.filter(hasUploadableCoordinates);
  const skippedPointIds = unsyncedPoints
    .filter((point) => !hasUploadableCoordinates(point))
    .map((point) => point.id);

  if (skippedPointIds.length > 0) {
    await markAsSynced(skippedPointIds);
  }

  await AsyncStorage.multiSet([
    [LAST_UPLOAD_ATTEMPT_KEY, attemptedAt],
    [LAST_UPLOAD_ERROR_KEY, 'Backend is disabled in this build'],
    [LAST_UPLOAD_UPLOADED_KEY, '0'],
    [LAST_UPLOAD_FAILED_KEY, String(uploadablePoints.length)],
  ]);

  return {
    uploaded: 0,
    failed: uploadablePoints.length,
    skipped: true,
    skippedNullLocations: skippedPointIds.length,
    backend_disabled: true,
    reason: sessionId
      ? 'Backend is disabled in this build'
      : 'No active local session',
  };
};

export const getLocationUploadStatus = async () => {
  const [
    lastAttempt,
    lastError,
    uploadedCount,
    failedCount,
    unsyncedPoints,
  ] = await Promise.all([
    AsyncStorage.getItem(LAST_UPLOAD_ATTEMPT_KEY),
    AsyncStorage.getItem(LAST_UPLOAD_ERROR_KEY),
    AsyncStorage.getItem(LAST_UPLOAD_UPLOADED_KEY),
    AsyncStorage.getItem(LAST_UPLOAD_FAILED_KEY),
    getUnsyncedPoints(),
  ]);

  return {
    backend_disabled: true,
    last_attempt_time: lastAttempt,
    last_error: lastError,
    uploaded_count: Number(uploadedCount || 0),
    failed_count: Number(failedCount || 0),
    unsynced_location_count: unsyncedPoints.length,
  };
};
