import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getUnsyncedPoints, markAsSynced } from '../db/locationDB';
import api from '../config/api';
import { stopTracking } from './TrackingController';
import { validateSession } from '../utils/SessionValidator';
import { logSessionError, updateLastUploadTimestamp } from '../utils/sessionErrorLogger';

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const SESSION_ID_KEY = 'active_session_id';
const UPLOAD_CIRCUIT_COOLDOWN_MS = 30000; // 30 seconds

// Circuit breaker state
let uploadCircuitOpen = false;
let circuitOpenedAt = null;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error) => {
  const responseData = error?.response?.data;

  if (typeof responseData === 'string') {
    return responseData;
  }

  if (responseData && typeof responseData === 'object') {
    const candidates = [responseData.message, responseData.error, responseData.detail];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  }

  return '';
};

const isTerminalSessionUploadError = (error) => {
  const status = error?.response?.status;
  if (status !== 401 && status !== 403) {
    return false;
  }

  const message = getErrorMessage(error).toLowerCase();
  if (status === 401) {
    return true;
  }

  return (
    message.includes('invalid or inactive session') ||
    message.includes('invalid session') ||
    message.includes('inactive session') ||
    message.includes('forbidden')
  );
};

const clearLocalSessionMarkers = async () => {
  await Promise.allSettled([
    stopTracking(),
    AsyncStorage.removeItem(SESSION_ID_KEY),
  ]);
};

const openCircuitBreaker = () => {
  uploadCircuitOpen = true;
  circuitOpenedAt = Date.now();
};

const checkCircuitBreaker = () => {
  if (!uploadCircuitOpen) {
    return { open: false };
  }

  const elapsed = Date.now() - circuitOpenedAt;
  if (elapsed >= UPLOAD_CIRCUIT_COOLDOWN_MS) {
    // Reset circuit breaker after cooldown
    uploadCircuitOpen = false;
    circuitOpenedAt = null;
    return { open: false, wasReset: true };
  }

  const remainingMs = UPLOAD_CIRCUIT_COOLDOWN_MS - elapsed;
  return {
    open: true,
    remainingSeconds: Math.ceil(remainingMs / 1000),
  };
};

const uploadBatch = async (token, sessionId, points) => {
  const payload = points.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    accuracy: p.accuracy,
    speed: p.speed,
    heading: p.heading,
    timestamp: p.timestamp,
  }));

  await api.post(
    '/sessions/locations/bulk',
    { sessionId, points: payload },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

export const uploadUnsyncedLocations = async (token) => {
  // Check circuit breaker first
  const circuitStatus = checkCircuitBreaker();
  if (circuitStatus.open) {
    return {
      uploaded: 0,
      failed: 0,
      circuitOpen: true,
      terminalSessionError: false,
      reason: `Upload blocked for ${circuitStatus.remainingSeconds}s after terminal session error`,
    };
  }

  // Check network status before attempting upload
  const networkState = await NetInfo.fetch();
  const isConnected = networkState.isConnected && networkState.isInternetReachable !== false;

  if (!isConnected) {
    return {
      uploaded: 0,
      failed: 0,
      offline: true,
      terminalSessionError: false,
      reason: 'No network connection available',
    };
  }

  // Validate session before attempting upload
  const validation = await validateSession(token);
  if (!validation.valid) {
    return {
      uploaded: 0,
      failed: 0,
      skipped: true,
      terminalSessionError: false,
      reason: validation.reason,
    };
  }

  const unsyncedPoints = await getUnsyncedPoints();

  if (unsyncedPoints.length === 0) {
    return { uploaded: 0, failed: 0, terminalSessionError: false };
  }

  // Group points by session_id
  const pointsBySession = {};
  for (const point of unsyncedPoints) {
    const sid = point.session_id;
    if (sid === null) continue; // Skip points without session
    if (!pointsBySession[sid]) {
      pointsBySession[sid] = [];
    }
    pointsBySession[sid].push(point);
  }

  let uploaded = 0;
  let failed = 0;

  // Upload each session's points in batches
  for (const [sessionId, points] of Object.entries(pointsBySession)) {
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map((p) => p.id);

      let success = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await uploadBatch(token, parseInt(sessionId, 10), batch);
          await markAsSynced(batchIds);
          await updateLastUploadTimestamp(); // Track successful upload
          uploaded += batch.length;
          success = true;
          break;
        } catch (err) {
          if (isTerminalSessionUploadError(err)) {
            await clearLocalSessionMarkers();
            openCircuitBreaker(); // Activate circuit breaker
            
            // Log terminal session error with context
            await logSessionError('upload_locations', err, {
              session_id: sessionId,
              batch_size: batch.length,
              attempt,
              total_unsynced: unsyncedPoints.length,
            });

            return {
              uploaded,
              failed: unsyncedPoints.length - uploaded,
              terminalSessionError: true,
              message: getErrorMessage(err) || 'Session is no longer valid for location uploads.',
              status: err?.response?.status ?? null,
            };
          }

          // Log non-terminal upload error
          if (attempt === MAX_RETRIES) {
            await logSessionError('upload_locations_retry_failed', err, {
              session_id: sessionId,
              batch_size: batch.length,
              attempts: MAX_RETRIES,
            });
          }

          if (attempt < MAX_RETRIES) {
            await delay(RETRY_DELAY_MS * attempt);
          }
        }
      }

      if (!success) {
        failed += batch.length;
      }
    }
  }

  return { uploaded, failed, terminalSessionError: false };
};
