import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getUnsyncedCount } from '../db/locationDB';
import { errorLogService } from './errorLogService';
import { nativeCrashLogService } from './nativeCrashLogService';
import { LOCATION_TASK_NAME } from './locationTaskConstants';

const LOCATION_DIAGNOSTICS_FILE_NAME = 'location_diagnostics.jsonl';
const LOCATION_DIAGNOSTICS_ENABLED_KEY = 'location_diagnostics_enabled';
const LOCATION_DIAGNOSTICS_ENABLED_UNTIL_KEY = 'location_diagnostics_enabled_until';
const MAX_LOCATION_DIAGNOSTIC_LOGS = 300;
const DEFAULT_TTL_HOURS = 24;

const nativeDiagnostics = NativeModules.DDCNativeDiagnostics;

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

  if (error && typeof error === 'object') {
    return {
      name: typeof error.name === 'string' ? error.name : 'Error',
      message: typeof error.message === 'string' ? error.message : serializeUnknown(error),
      stack: typeof error.stack === 'string' ? error.stack : null,
    };
  }

  return {
    name: 'Error',
    message: typeof error === 'string' ? error : 'Unknown error',
    stack: null,
  };
};

const getDiagnosticsFilePath = () => {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}${LOCATION_DIAGNOSTICS_FILE_NAME}`;
};

const readJsonLines = async (filePath) => {
  if (!filePath) {
    return [];
  }

  const fileInfo = await FileSystem.getInfoAsync(filePath);
  if (!fileInfo.exists) {
    return [];
  }

  const content = await FileSystem.readAsStringAsync(filePath);
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => safeJsonParse(line, { raw: line }))
    .reverse();
};

const writeJsonLines = async (filePath, entries) => {
  if (!filePath) {
    return;
  }

  const lines = entries
    .slice(-MAX_LOCATION_DIAGNOSTIC_LOGS)
    .map((entry) => JSON.stringify(entry));
  await FileSystem.writeAsStringAsync(
    filePath,
    lines.length > 0 ? `${lines.join('\n')}\n` : ''
  );
};

const getStoredDiagnosticsStatus = async () => {
  const [enabledValue, enabledUntilValue] = await Promise.all([
    AsyncStorage.getItem(LOCATION_DIAGNOSTICS_ENABLED_KEY),
    AsyncStorage.getItem(LOCATION_DIAGNOSTICS_ENABLED_UNTIL_KEY),
  ]);

  const enabledUntil = Number(enabledUntilValue || 0);
  const now = Date.now();
  const enabled = enabledValue === 'true' && (!enabledUntil || enabledUntil > now);

  if (enabledValue === 'true' && enabledUntil && enabledUntil <= now) {
    await AsyncStorage.multiSet([
      [LOCATION_DIAGNOSTICS_ENABLED_KEY, 'false'],
      [LOCATION_DIAGNOSTICS_ENABLED_UNTIL_KEY, '0'],
    ]);
  }

  return {
    enabled,
    enabledUntil: enabled ? enabledUntil : 0,
    source: 'js',
  };
};

const setStoredDiagnosticsStatus = async (enabled, ttlHours = DEFAULT_TTL_HOURS) => {
  const enabledUntil = enabled
    ? Date.now() + Math.max(1, Number(ttlHours) || DEFAULT_TTL_HOURS) * 60 * 60 * 1000
    : 0;

  await AsyncStorage.multiSet([
    [LOCATION_DIAGNOSTICS_ENABLED_KEY, enabled ? 'true' : 'false'],
    [LOCATION_DIAGNOSTICS_ENABLED_UNTIL_KEY, String(enabledUntil)],
  ]);

  return {
    enabled,
    enabledUntil,
    source: 'js',
  };
};

export const diagnosticsService = {
  getLocationDiagnosticsFilePath: () => getDiagnosticsFilePath(),

  getLocationDiagnosticsStatus: async () => {
    if (Platform.OS === 'android' && nativeDiagnostics?.getLocationDiagnosticsStatus) {
      try {
        const nativeStatus = await nativeDiagnostics.getLocationDiagnosticsStatus();
        const storedStatus = await getStoredDiagnosticsStatus();

        return {
          ...storedStatus,
          ...nativeStatus,
          source: 'native',
        };
      } catch (error) {
        return getStoredDiagnosticsStatus();
      }
    }

    return getStoredDiagnosticsStatus();
  },

  setLocationDiagnosticsEnabled: async (enabled, ttlHours = DEFAULT_TTL_HOURS) => {
    const storedStatus = await setStoredDiagnosticsStatus(enabled, ttlHours);

    if (Platform.OS === 'android' && nativeDiagnostics?.setLocationDiagnosticsEnabled) {
      try {
        const nativeStatus = await nativeDiagnostics.setLocationDiagnosticsEnabled(
          Boolean(enabled),
          Number(ttlHours) || DEFAULT_TTL_HOURS
        );

        return {
          ...storedStatus,
          ...nativeStatus,
          source: 'native',
        };
      } catch (error) {
        return storedStatus;
      }
    }

    return storedStatus;
  },

  isLocationDiagnosticsEnabled: async () => {
    const status = await diagnosticsService.getLocationDiagnosticsStatus();
    return Boolean(status.enabled);
  },

  appendLocationDiagnostic: async (event, details = {}, options = {}) => {
    const force = options.force === true;
    const status = force
      ? { enabled: true }
      : await diagnosticsService.getLocationDiagnosticsStatus();

    if (!status.enabled) {
      return {
        success: true,
        skipped: true,
      };
    }

    const filePath = getDiagnosticsFilePath();
    if (!filePath) {
      return {
        success: false,
        message: 'Document directory is unavailable',
      };
    }

    try {
      const existingEntries = await readJsonLines(filePath);
      const entry = {
        timestamp: new Date().toISOString(),
        source: options.source || 'js',
        event,
        app_version: Constants.expoConfig?.version || 'unknown',
        patch_level: Constants.expoConfig?.extra?.patch_level || 'unknown',
        platform: Platform.OS,
        platform_version: String(Platform.Version),
        details,
      };

      await writeJsonLines(filePath, [...existingEntries.reverse(), entry]);

      return {
        success: true,
        path: filePath,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed to append location diagnostic',
      };
    }
  },

  readLocationDiagnostics: async () => {
    const filePath = getDiagnosticsFilePath();
    if (!filePath) {
      return {
        success: false,
        message: 'Document directory is unavailable',
      };
    }

    try {
      const data = await readJsonLines(filePath);
      return {
        success: true,
        data,
        path: filePath,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed to read location diagnostics',
      };
    }
  },

  clearLocationDiagnostics: async () => {
    const filePath = getDiagnosticsFilePath();
    if (!filePath) {
      return {
        success: false,
        message: 'Document directory is unavailable',
      };
    }

    try {
      await FileSystem.deleteAsync(filePath, { idempotent: true });

      if (Platform.OS === 'android' && nativeDiagnostics?.clearLocationDiagnostics) {
        try {
          await nativeDiagnostics.clearLocationDiagnostics();
        } catch (error) {
          // JS-side deletion is enough for the in-app debug view.
        }
      }

      return {
        success: true,
        path: filePath,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed to clear location diagnostics',
      };
    }
  },

  captureLocationDebugSnapshot: async () => {
    const snapshot = {
      captured_at: new Date().toISOString(),
      app_version: Constants.expoConfig?.version || 'unknown',
      patch_level: Constants.expoConfig?.extra?.patch_level || 'unknown',
      platform: Platform.OS,
      platform_version: String(Platform.Version),
      location_task_name: LOCATION_TASK_NAME,
    };

    const assignResult = async (key, operation) => {
      try {
        snapshot[key] = await operation();
      } catch (error) {
        snapshot[key] = {
          error: normalizeError(error),
        };
      }
    };

    await Promise.all([
      assignResult('network', async () => {
        const networkState = await NetInfo.fetch();
        return {
          type: networkState.type,
          is_connected: networkState.isConnected,
          is_reachable: networkState.isInternetReachable,
        };
      }),
      assignResult('task_manager_available', () => TaskManager.isAvailableAsync()),
      assignResult('task_defined', async () => {
        if (typeof TaskManager.isTaskDefined !== 'function') {
          return 'unavailable';
        }

        return TaskManager.isTaskDefined(LOCATION_TASK_NAME);
      }),
      assignResult('tracking_started', () =>
        Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      ),
      assignResult('foreground_permission', () => Location.getForegroundPermissionsAsync()),
      assignResult('background_permission', () => Location.getBackgroundPermissionsAsync()),
      assignResult('location_services_enabled', () => Location.hasServicesEnabledAsync()),
      assignResult('provider_status', () => Location.getProviderStatusAsync()),
      assignResult('active_session_id', () => AsyncStorage.getItem('active_session_id')),
      assignResult('pending_session_stop', () => AsyncStorage.getItem('pending_session_stop')),
      assignResult('last_successful_upload', () => AsyncStorage.getItem('last_successful_upload')),
      assignResult('unsynced_location_count', () => getUnsyncedCount()),
      assignResult('diagnostics_status', () =>
        diagnosticsService.getLocationDiagnosticsStatus()
      ),
    ]);

    await diagnosticsService.appendLocationDiagnostic('debug_snapshot', snapshot, {
      source: 'debug_screen',
      force: true,
    });

    return snapshot;
  },

  uploadDiagnosticBundle: async () => {
    const snapshot = await diagnosticsService.captureLocationDebugSnapshot();

    const [locationDiagnosticsResult, nativeCrashResult] = await Promise.all([
      diagnosticsService.readLocationDiagnostics(),
      nativeCrashLogService.readLogs(),
    ]);

    const locationDiagnostics = locationDiagnosticsResult.success
      ? locationDiagnosticsResult.data.slice(0, 50)
      : [];
    const nativeCrashLogs = nativeCrashResult.success
      ? nativeCrashResult.data.slice(0, 25)
      : [];

    return errorLogService.logError(new Error('Location diagnostic bundle'), {
      source: 'location_diagnostics',
      is_fatal: false,
      details: {
        snapshot,
        location_diagnostics_count: locationDiagnosticsResult.data?.length || 0,
        native_crash_log_count: nativeCrashResult.data?.length || 0,
        location_diagnostics: locationDiagnostics,
        native_crash_logs: nativeCrashLogs,
      },
    });
  },
};
