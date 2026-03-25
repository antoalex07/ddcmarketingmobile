import api from '../config/api';

const SESSION_ID_KEYS = ['sessionId', 'session_id', 'id', 'active_session_id'];
const STARTED_AT_KEYS = [
  'startedAt',
  'started_at',
  'session_start_time',
  'session_start',
  'start_time',
  'session_started_at',
];
const ENDED_AT_KEYS = [
  'endedAt',
  'ended_at',
  'session_end_time',
  'session_end',
  'end_time',
  'session_ended_at',
];
const MESSAGE_KEYS = ['message', 'error', 'detail'];
const ACTIVE_FLAG_KEYS = [
  'active',
  'is_active',
  'has_active_session',
  'hasActiveSession',
  'session_active',
];

const getContainers = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  return [
    payload,
    payload.data,
    payload.session,
    payload.active_session,
  ].filter((item) => item && typeof item === 'object');
};

const getField = (payload, keys) => {
  const containers = getContainers(payload);

  for (const container of containers) {
    for (const key of keys) {
      const value = container[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
  }

  return null;
};

const parseSessionId = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseActiveFlag = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }

  return null;
};

const buildSessionData = (payload) => {
  const sessionId = parseSessionId(getField(payload, SESSION_ID_KEYS));
  const startedAt = getField(payload, STARTED_AT_KEYS);
  const endedAt = getField(payload, ENDED_AT_KEYS);
  const active = parseActiveFlag(getField(payload, ACTIVE_FLAG_KEYS));

  return {
    sessionId,
    startedAt,
    endedAt,
    active,
  };
};

const getErrorMessage = (error, fallbackMessage) => {
  const message = getField(error?.response?.data, MESSAGE_KEYS);
  return message || fallbackMessage;
};

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

      const session = buildSessionData(response.data);

      return {
        success: true,
        sessionId: session.sessionId,
        startedAt: session.startedAt,
      };
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = getErrorMessage(error, 'Failed to start session. Please try again.');

        if (status === 409) {
          return {
            success: false,
            status,
            message: message || 'Session already active',
          };
        }
      }

      return {
        success: false,
        status: error.response?.status || null,
        message: getErrorMessage(error, 'Failed to start session. Please try again.'),
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

      const session = buildSessionData(response.data);

      return {
        success: true,
        data: {
          sessionId: session.sessionId,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
        },
      };
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = getErrorMessage(error, 'Failed to stop session. Please try again.');

        if (status === 400) {
          return {
            success: false,
            status,
            message: message || 'No active session found',
          };
        }
      }

      return {
        success: false,
        status: error.response?.status || null,
        message: getErrorMessage(error, 'Failed to stop session. Please try again.'),
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

      const session = buildSessionData(response.data);

      if (session.sessionId === null) {
        if (session.active === false) {
          return {
            success: true,
            session: null,
          };
        }

        // If API returns 200 without session identifiers, treat as no active session.
        return {
          success: true,
          session: null,
        };
      }

      return {
        success: true,
        session: {
          sessionId: session.sessionId,
          startedAt: session.startedAt,
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
        status: error.response?.status || null,
        message: getErrorMessage(error, 'Failed to fetch active session'),
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
