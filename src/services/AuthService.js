import api from '../config/api';
import { tokenStorage } from './tokenStorage';

const USER_ID_KEYS = ['user_id', 'userid', 'userId'];
const USER_NAME_KEYS = ['user_name', 'username', 'userName'];
const ROLE_ID_KEYS = ['roleid', 'role_id', 'roleId'];
const MESSAGE_KEYS = ['message', 'error', 'detail'];

const getValue = (source, keys) => {
  if (!source || typeof source !== 'object') {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
};

export const authService = {
  login: async (username, password) => {
    try {
      const response = await api.post(
        '/auth/login',
        {
          user_name: username,
          user_pass: password,
        },
        {
          headers: {
            'x-client-type': 'mobile',
            'X-Skip-Auth-Retry': 'true',
            'X-Skip-Error-Logging': 'true',
          },
        }
      );

      const payload = response.data || {};
      const status = payload.status;

      if (status && status !== 'success') {
        return {
          success: false,
          status: response.status,
          message: getValue(payload, MESSAGE_KEYS) || 'Login failed',
        };
      }

      const accessToken = payload.token;
      const refreshToken = payload.refresh_token;

      if (!accessToken || !refreshToken) {
        return {
          success: false,
          status: response.status,
          message: getValue(payload, MESSAGE_KEYS) || 'Login failed',
        };
      }

      await tokenStorage.setTokens({
        accessToken,
        refreshToken,
      });

      return {
        success: true,
        data: {
          token: accessToken,
          refreshToken,
          user: {
            userId: getValue(payload, USER_ID_KEYS),
            userName: getValue(payload, USER_NAME_KEYS),
            roleId: getValue(payload, ROLE_ID_KEYS),
          },
          status,
        },
      };
    } catch (error) {
      if (error.response) {
        const status = error.response.data?.status;
        const message = getValue(error.response.data, MESSAGE_KEYS);

        if (status === 'notfound') {
          return {
            success: false,
            message: message || 'Invalid username or password',
          };
        }
      }

      return {
        success: false,
        status: error.response?.status || null,
        message: 'Network error. Please check your connection.',
      };
    }
  },

  refresh: async (refreshToken) => {
    if (!refreshToken) {
      return {
        success: false,
        status: 400,
        message: 'Refresh token is missing',
      };
    }

    try {
      const response = await api.post(
        '/auth/refresh',
        { refresh_token: refreshToken },
        {
          headers: {
            'X-Skip-Auth-Retry': 'true',
            'X-Skip-Error-Logging': 'true',
            'x-client-type': 'mobile',
          },
        }
      );

      const payload = response.data || {};
      const accessToken = payload.token;
      const rotatedRefreshToken = payload.refresh_token;

      if (!accessToken || !rotatedRefreshToken) {
        return {
          success: false,
          status: response.status,
          message: getValue(payload, MESSAGE_KEYS) || 'Token refresh failed',
        };
      }

      return {
        success: true,
        data: {
          token: accessToken,
          refreshToken: rotatedRefreshToken,
        },
      };
    } catch (error) {
      return {
        success: false,
        status: error.response?.status || null,
        message:
          getValue(error.response?.data, MESSAGE_KEYS) ||
          'Token refresh failed',
      };
    }
  },

  logout: async (refreshToken, accessToken) => {
    if (!refreshToken) {
      return {
        success: false,
        status: 400,
        message: 'Refresh token is missing',
      };
    }

    try {
      const response = await api.post(
        '/auth/logout',
        { refresh_token: refreshToken },
        {
          headers: {
            'X-Skip-Auth-Retry': 'true',
            'X-Skip-Error-Logging': 'true',
            'x-client-type': 'mobile',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        }
      );

      return {
        success: true,
        status: response.status,
      };
    } catch (error) {
      return {
        success: false,
        status: error.response?.status || null,
        message:
          getValue(error.response?.data, MESSAGE_KEYS) ||
          'Logout request failed',
      };
    }
  },
};
