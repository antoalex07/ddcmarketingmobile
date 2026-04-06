import { sessionService } from './SessionService';

/**
 * Validates that the local session matches the backend's active session
 * @param {string} token - Auth token
 * @param {number} sessionId - Local session ID to validate
 * @returns {Promise<{healthy: boolean, action: string, backendSessionId?: number}>}
 */
export const validateSessionHealth = async (token, sessionId) => {
  if (!token || !sessionId) {
    return {
      healthy: false,
      action: 'clear',
      reason: 'Missing token or session ID',
    };
  }

  try {
    const response = await sessionService.getActiveSession(token);

    // No session on backend
    if (response.success && !response.session) {
      return {
        healthy: false,
        action: 'clear',
        reason: 'No active session on backend',
      };
    }

    // Session exists on backend
    if (response.success && response.session) {
      const backendSessionId = response.session.sessionId;

      // Session ID mismatch
      if (backendSessionId !== sessionId) {
        return {
          healthy: false,
          action: 'resync',
          backendSessionId,
          reason: `Session ID mismatch: local=${sessionId}, backend=${backendSessionId}`,
        };
      }

      // Session matches
      return {
        healthy: true,
        action: 'continue',
        backendSessionId,
        reason: 'Session is valid and matches backend',
      };
    }

    // API error
    return {
      healthy: false,
      action: 'continue',
      reason: response.message || 'Failed to validate session health',
    };
  } catch (error) {
    // Network or other error - assume healthy and continue
    return {
      healthy: true,
      action: 'continue',
      reason: 'Network error during health check - assuming valid',
    };
  }
};
