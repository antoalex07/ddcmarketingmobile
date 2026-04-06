import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_ID_KEY = 'active_session_id';

/**
 * Validates current session state before API operations
 * @param {string|null} token - Auth token
 * @returns {Promise<{valid: boolean, sessionId: number|null, reason: string}>}
 */
export const validateSession = async (token) => {
  // Check token exists
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return {
      valid: false,
      sessionId: null,
      reason: 'No authentication token available',
    };
  }

  // Check session ID exists in storage
  let storedSessionId;
  try {
    storedSessionId = await AsyncStorage.getItem(SESSION_ID_KEY);
  } catch (error) {
    return {
      valid: false,
      sessionId: null,
      reason: `Failed to read session from storage: ${error.message}`,
    };
  }

  // Validate session ID value
  if (!storedSessionId || storedSessionId === 'null' || storedSessionId === 'undefined') {
    return {
      valid: false,
      sessionId: null,
      reason: 'No active session ID in storage',
    };
  }

  // Parse session ID to number
  const sessionId = parseInt(storedSessionId, 10);
  if (Number.isNaN(sessionId) || sessionId <= 0) {
    return {
      valid: false,
      sessionId: null,
      reason: `Invalid session ID format: ${storedSessionId}`,
    };
  }

  return {
    valid: true,
    sessionId,
    reason: 'Session validation passed',
  };
};

/**
 * Quick check if session exists (synchronous-safe version for guards)
 * @param {number|null} sessionId - Session ID from state
 * @param {string|null} token - Auth token
 * @returns {boolean}
 */
export const hasValidSessionState = (sessionId, token) => {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return false;
  }

  if (!sessionId || typeof sessionId !== 'number' || sessionId <= 0) {
    return false;
  }

  return true;
};
