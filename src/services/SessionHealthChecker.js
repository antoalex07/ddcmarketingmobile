import { sessionService } from './SessionService';

export const validateSessionHealth = async (_token, sessionId) => {
  if (!sessionId) {
    return {
      healthy: false,
      action: 'clear',
      reason: 'Missing session ID',
    };
  }

  try {
    const response = await sessionService.getActiveSession();

    if (response.success && !response.session) {
      return {
        healthy: false,
        action: 'clear',
        reason: 'No active local session',
      };
    }

    if (response.success && response.session) {
      const localSessionId = response.session.sessionId;
      if (localSessionId !== sessionId) {
        return {
          healthy: false,
          action: 'resync',
          backendSessionId: localSessionId,
          reason: `Session ID mismatch: stored=${sessionId}, current=${localSessionId}`,
        };
      }

      return {
        healthy: true,
        action: 'continue',
        backendSessionId: localSessionId,
        reason: 'Session is valid locally',
      };
    }

    return {
      healthy: false,
      action: 'continue',
      reason: response.message || 'Failed to validate local session health',
    };
  } catch (error) {
    return {
      healthy: true,
      action: 'continue',
      reason: error?.message || 'Local health check failed, continuing',
    };
  }
};
