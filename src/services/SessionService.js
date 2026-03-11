import api from '../config/api';

export const sessionService = {
  startSession: async (token) => {
    try {
      const response = await api.post(
        '/sessions/start',
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return {
        success: true,
        sessionId: response.data.sessionId,
      };
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data.message;

        if (status === 409) {
          return {
            success: false,
            message: message || 'Session already active',
          };
        }
      }

      return {
        success: false,
        message: 'Failed to start session. Please try again.',
      };
    }
  },

  stopSession: async (token) => {
    try {
      const response = await api.post(
        '/sessions/stop',
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return {
        success: true,
        data: {
          sessionId: response.data.sessionId,
          startedAt: response.data.startedAt,
          endedAt: response.data.endedAt,
        },
      };
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data.message;

        if (status === 400) {
          return {
            success: false,
            message: message || 'No active session found',
          };
        }
      }

      return {
        success: false,
        message: 'Failed to stop session. Please try again.',
      };
    }
  },

  getActiveSession: async (token) => {
    try {
      const response = await api.get('/sessions/active', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        session: {
          sessionId: response.data.sessionId,
          startedAt: response.data.startedAt,
        },
      };
    } catch (error) {
      if (error.response?.status === 404) {
        // No active session
        return {
          success: true,
          session: null,
        };
      }

      return {
        success: false,
        message: 'Failed to fetch active session',
      };
    }
  },

  sendLocationBulk: async (token, sessionId, points) => {
    try {
      const response = await api.post(
        '/sessions/locations/bulk',
        {
          sessionId,
          points,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to send location data',
      };
    }
  },
};