import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_BASE_URL, ERROR_LOG_ENDPOINT } from '../config/apiConfig';

const PENDING_ERROR_LOGS_KEY = 'pending_error_logs';
const DEVICE_INSTALLATION_ID_KEY = 'device_installation_id';
const MAX_PENDING_ERROR_LOGS = 100;

const safeJsonParse = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const serializeUnknown = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
};

const normalizeError = (error) => {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack || null,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
      stack: null,
    };
  }

  if (error && typeof error === 'object') {
    return {
      name: typeof error.name === 'string' ? error.name : 'Error',
      message:
        typeof error.message === 'string' ? error.message : serializeUnknown(error),
      stack: typeof error.stack === 'string' ? error.stack : null,
    };
  }

  return {
    name: 'Error',
    message: 'Unknown error',
    stack: null,
  };
};

const normalizeSessionId = (rawSessionId) => {
  if (rawSessionId === null || rawSessionId === undefined) {
    return null;
  }

  const parsed = Number(rawSessionId);
  return Number.isFinite(parsed) ? parsed : null;
};

const getOrCreateDeviceInstallationId = async () => {
  const existingId = await AsyncStorage.getItem(DEVICE_INSTALLATION_ID_KEY);
  if (existingId) {
    return existingId;
  }

  const generatedId = `${Platform.OS}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  await AsyncStorage.setItem(DEVICE_INSTALLATION_ID_KEY, generatedId);
  return generatedId;
};

const readPendingLogs = async () => {
  const rawLogs = await AsyncStorage.getItem(PENDING_ERROR_LOGS_KEY);
  const parsedLogs = safeJsonParse(rawLogs, []);
  return Array.isArray(parsedLogs) ? parsedLogs : [];
};

const writePendingLogs = async (logs) => {
  const trimmedLogs = logs.slice(-MAX_PENDING_ERROR_LOGS);
  await AsyncStorage.setItem(PENDING_ERROR_LOGS_KEY, JSON.stringify(trimmedLogs));
};

const buildErrorPayload = async (error, context = {}) => {
  const [storedUser, storedStaff, storedSessionId] = await Promise.all([
    AsyncStorage.getItem('user'),
    AsyncStorage.getItem('staff_data'),
    AsyncStorage.getItem('active_session_id'),
  ]);

  const normalizedError = normalizeError(error);
  const user = safeJsonParse(storedUser, {});
  const staff = safeJsonParse(storedStaff, {});
  const deviceInstallationId = await getOrCreateDeviceInstallationId();

  return {
    error_name: normalizedError.name,
    error_message: normalizedError.message,
    error_stack: normalizedError.stack,
    source: context.source || 'unknown',
    is_fatal: context.is_fatal === true ? 1 : 0,
    details: serializeUnknown(context.details),
    happened_at: new Date().toISOString(),
    platform: Platform.OS,
    platform_version: String(Platform.Version),
    device_installation_id: deviceInstallationId,
    user_id: user?.userId ?? user?.user_id ?? null,
    user_name: user?.userName ?? user?.user_name ?? null,
    staff_id: staff?.staff_id ?? null,
    active_session_id: normalizeSessionId(storedSessionId),
  };
};

const uploadLog = async (token, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}${ERROR_LOG_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Error log upload failed with status ${response.status}`,
        status: response.status,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error?.message || 'Failed to upload error log',
    };
  }
};

const flushPendingLogsInternal = async () => {
  try {
    const pendingLogs = await readPendingLogs();

    if (pendingLogs.length === 0) {
      return {
        success: true,
        uploaded: 0,
        remaining: 0,
      };
    }

    const token = await AsyncStorage.getItem('token');
    if (!token) {
      return {
        success: false,
        uploaded: 0,
        remaining: pendingLogs.length,
        message: 'No auth token available for error log upload',
      };
    }

    let uploaded = 0;
    const remainingLogs = [];

    for (const log of pendingLogs) {
      const result = await uploadLog(token, log);
      if (result.success) {
        uploaded += 1;
      } else {
        remainingLogs.push(log);
      }
    }

    await writePendingLogs(remainingLogs);

    return {
      success: remainingLogs.length === 0,
      uploaded,
      remaining: remainingLogs.length,
      message:
        remainingLogs.length > 0
          ? 'Some error logs could not be uploaded'
          : undefined,
    };
  } catch (error) {
    return {
      success: false,
      uploaded: 0,
      remaining: 0,
      message: error?.message || 'Failed to flush pending error logs',
    };
  }
};

let globalHandlerInstalled = false;

const installGlobalErrorHandler = () => {
  if (globalHandlerInstalled) {
    return {
      success: true,
      installed: true,
    };
  }

  const errorUtils = global?.ErrorUtils;
  if (
    !errorUtils ||
    typeof errorUtils.getGlobalHandler !== 'function' ||
    typeof errorUtils.setGlobalHandler !== 'function'
  ) {
    return {
      success: false,
      installed: false,
      message: 'Global error handler API is not available',
    };
  }

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    errorLogService.logError(error, {
      source: 'global_handler',
      is_fatal: Boolean(isFatal),
    });

    if (typeof previousHandler === 'function') {
      previousHandler(error, isFatal);
    }
  });

  globalHandlerInstalled = true;

  return {
    success: true,
    installed: true,
  };
};

export const errorLogService = {
  logError: async (error, context = {}) => {
    try {
      const payload = await buildErrorPayload(error, context);
      const pendingLogs = await readPendingLogs();
      pendingLogs.push(payload);
      await writePendingLogs(pendingLogs);

      const flushResult = await flushPendingLogsInternal();
      return {
        success: true,
        queued: true,
        uploaded: flushResult.uploaded,
        remaining: flushResult.remaining,
      };
    } catch (queueError) {
      return {
        success: false,
        message: queueError?.message || 'Failed to queue error log',
      };
    }
  },

  flushPendingLogs: async () => {
    return flushPendingLogsInternal();
  },

  installGlobalErrorHandler: () => {
    return installGlobalErrorHandler();
  },
};
