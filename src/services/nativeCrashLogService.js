import * as FileSystem from 'expo-file-system';

const NATIVE_CRASH_LOG_FILE_NAME = 'native_crash_logs.jsonl';

const toParsedCrashLog = (line) => {
  try {
    return JSON.parse(line);
  } catch (error) {
    return {
      timestamp: null,
      platform: null,
      type: 'unknown',
      is_fatal: 1,
      message: line,
      raw: line,
    };
  }
};

const getLogFilePath = () => {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}${NATIVE_CRASH_LOG_FILE_NAME}`;
};

export const nativeCrashLogService = {
  getLogFilePath: () => {
    const filePath = getLogFilePath();

    if (!filePath) {
      return {
        success: false,
        message: 'Document directory is unavailable',
      };
    }

    return {
      success: true,
      path: filePath,
    };
  },

  readLogs: async () => {
    const filePath = getLogFilePath();

    if (!filePath) {
      return {
        success: false,
        message: 'Document directory is unavailable',
      };
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      if (!fileInfo.exists) {
        return {
          success: true,
          data: [],
          path: filePath,
        };
      }

      const content = await FileSystem.readAsStringAsync(filePath);
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const parsedLogs = lines.map(toParsedCrashLog).reverse();

      return {
        success: true,
        data: parsedLogs,
        path: filePath,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed to read native crash logs',
      };
    }
  },

  clearLogs: async () => {
    const filePath = getLogFilePath();

    if (!filePath) {
      return {
        success: false,
        message: 'Document directory is unavailable',
      };
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      if (fileInfo.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }

      return {
        success: true,
        path: filePath,
      };
    } catch (error) {
      return {
        success: false,
        message: error?.message || 'Failed to clear native crash logs',
      };
    }
  },
};
