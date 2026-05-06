import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenStorage } from './tokenStorage';

const LOCAL_TOKEN = 'local-debug-token';

export const authService = {
  login: async (username, _password) => {
    const userName = String(username || '').trim();

    if (!userName) {
      return {
        success: false,
        message: 'Enter a username',
      };
    }

    const tokens = {
      accessToken: LOCAL_TOKEN,
      refreshToken: `${LOCAL_TOKEN}-refresh`,
    };

    await tokenStorage.setTokens(tokens);
    await AsyncStorage.setItem(
      'user',
      JSON.stringify({
        userId: userName,
        userName,
        roleId: 'debug',
      })
    );

    return {
      success: true,
      data: {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          userId: userName,
          userName,
          roleId: 'debug',
        },
        status: 'success',
      },
    };
  },

  refresh: async (refreshToken) => {
    if (!refreshToken) {
      return {
        success: false,
        status: 400,
        message: 'Refresh token is missing',
      };
    }

    return {
      success: true,
      data: {
        token: LOCAL_TOKEN,
        refreshToken: `${LOCAL_TOKEN}-refresh`,
      },
    };
  },

  logout: async () => {
    await tokenStorage.clearTokens();
    await AsyncStorage.multiRemove(['user', 'staff_data', 'active_session_id']);
    return {
      success: true,
      status: 200,
    };
  },
};
