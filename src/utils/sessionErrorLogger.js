import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { isTracking } from '../services/TrackingController';
import { errorLogService } from '../services/errorLogService';

const SESSION_ID_KEY = 'active_session_id';

/**
 * Captures detailed session context for error logging
 * @returns {Promise<Object>} Session context object
 */
const captureSessionContext = async () => {
  try {
    const [sessionId, networkState, trackingActive, lastUploadStr] = await Promise.all([
      AsyncStorage.getItem(SESSION_ID_KEY),
      NetInfo.fetch(),
      isTracking(),
      AsyncStorage.getItem('last_successful_upload'),
    ]);

    return {
      session_id: sessionId || 'null',
      tracking_active: trackingActive,
      network_connected: networkState.isConnected,
      network_type: networkState.type,
      network_reachable: networkState.isInternetReachable,
      last_upload: lastUploadStr || 'never',
    };
  } catch (error) {
    return {
      session_id: 'error',
      tracking_active: 'unknown',
      network_connected: 'unknown',
      error: error.message,
    };
  }
};

/**
 * Logs a session-related error with full context
 * @param {string} operation - Operation that failed (e.g., 'upload_locations', 'start_session')
 * @param {Error|Object} error - Error object or response
 * @param {Object} additionalContext - Additional context to include
 */
export const logSessionError = async (operation, error, additionalContext = {}) => {
  const sessionContext = await captureSessionContext();

  const errorData = {
    prefix: '[SESSION_ERROR]',
    operation,
    timestamp: new Date().toISOString(),
    error_message: error?.message || error?.response?.data?.message || 'Unknown error',
    status_code: error?.response?.status,
    ...sessionContext,
    ...additionalContext,
  };

  // Log to console in development
  if (__DEV__) {
    console.log('[SESSION_ERROR]', operation, errorData);
  }

  // Send to error log service if available
  if (errorLogService && typeof errorLogService.logError === 'function') {
    try {
      await errorLogService.logError({
        type: 'session_error',
        details: errorData,
      });
    } catch (logError) {
      // Ignore logging errors
    }
  }
};

/**
 * Updates last successful upload timestamp
 */
export const updateLastUploadTimestamp = async () => {
  try {
    await AsyncStorage.setItem('last_successful_upload', new Date().toISOString());
  } catch (error) {
    // Ignore
  }
};
