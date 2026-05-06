import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_ID_KEY = 'active_session_id';
const SESSION_START_TIME_KEY = 'session_start_time';
const SESSION_END_TIME_KEY = 'session_end_time';

const parseSessionId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getCurrentTimestamp = () => new Date().toISOString();

const readLocalSession = async () => {
  const [storedSessionId, storedStartTime, storedEndTime] = await Promise.all([
    AsyncStorage.getItem(SESSION_ID_KEY),
    AsyncStorage.getItem(SESSION_START_TIME_KEY),
    AsyncStorage.getItem(SESSION_END_TIME_KEY),
  ]);

  const sessionId = parseSessionId(storedSessionId);
  if (!sessionId) {
    return null;
  }

  return {
    sessionId,
    startedAt: storedStartTime || getCurrentTimestamp(),
    endedAt: storedEndTime || null,
  };
};

const createSessionId = () => Date.now();

export const sessionService = {
  startSession: async () => {
    const existingSession = await readLocalSession();
    if (existingSession) {
      return {
        success: true,
        sessionId: existingSession.sessionId,
        startedAt: existingSession.startedAt,
      };
    }

    const sessionId = createSessionId();
    const startedAt = getCurrentTimestamp();

    await Promise.all([
      AsyncStorage.setItem(SESSION_ID_KEY, String(sessionId)),
      AsyncStorage.setItem(SESSION_START_TIME_KEY, startedAt),
      AsyncStorage.removeItem(SESSION_END_TIME_KEY),
    ]);

    return {
      success: true,
      sessionId,
      startedAt,
    };
  },

  stopSession: async () => {
    const activeSession = await readLocalSession();
    if (!activeSession) {
      return {
        success: false,
        message: 'No active local session found',
      };
    }

    const endedAt = getCurrentTimestamp();

    await Promise.all([
      AsyncStorage.removeItem(SESSION_ID_KEY),
      AsyncStorage.removeItem(SESSION_START_TIME_KEY),
      AsyncStorage.setItem(SESSION_END_TIME_KEY, endedAt),
    ]);

    return {
      success: true,
      data: {
        sessionId: activeSession.sessionId,
        startedAt: activeSession.startedAt,
        endedAt,
      },
    };
  },

  getActiveSession: async () => {
    const session = await readLocalSession();

    if (!session) {
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
  },

  sendLocationBulk: async (_token, sessionId, points) => {
    return {
      success: true,
      data: {
        sessionId,
        uploaded: Array.isArray(points) ? points.length : 0,
        backend_disabled: true,
      },
    };
  },
};
