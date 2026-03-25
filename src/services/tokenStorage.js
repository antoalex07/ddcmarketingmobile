import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const LEGACY_TOKEN_KEY = 'token';

const SECURE_STORE_OPTIONS = {
  keychainService: 'ddcmarketingmobile.auth',
};

const readSecureValue = async (key) => {
  try {
    return await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  } catch (error) {
    return null;
  }
};

const writeSecureValue = async (key, value) => {
  await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
};

const deleteSecureValue = async (key) => {
  await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
};

let accessTokenCache = null;
let refreshTokenCache = null;
let cacheLoaded = false;

const loadTokensFromStorage = async () => {
  if (cacheLoaded) {
    return {
      accessToken: accessTokenCache,
      refreshToken: refreshTokenCache,
    };
  }

  const [storedAccessToken, storedRefreshToken, legacyToken] = await Promise.all([
    readSecureValue(ACCESS_TOKEN_KEY),
    readSecureValue(REFRESH_TOKEN_KEY),
    AsyncStorage.getItem(LEGACY_TOKEN_KEY),
  ]);

  accessTokenCache = storedAccessToken || legacyToken || null;
  refreshTokenCache = storedRefreshToken || null;
  cacheLoaded = true;

  if (!storedAccessToken && legacyToken) {
    await writeSecureValue(ACCESS_TOKEN_KEY, legacyToken);
    await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  return {
    accessToken: accessTokenCache,
    refreshToken: refreshTokenCache,
  };
};

export const tokenStorage = {
  getAccessToken: async () => {
    const { accessToken } = await loadTokensFromStorage();
    return accessToken;
  },

  getRefreshToken: async () => {
    const { refreshToken } = await loadTokensFromStorage();
    return refreshToken;
  },

  getTokens: async () => {
    return loadTokensFromStorage();
  },

  setTokens: async ({ accessToken, refreshToken }) => {
    if (!accessToken || !refreshToken) {
      throw new Error('Both access and refresh tokens are required');
    }

    await Promise.all([
      writeSecureValue(ACCESS_TOKEN_KEY, accessToken),
      writeSecureValue(REFRESH_TOKEN_KEY, refreshToken),
      AsyncStorage.removeItem(LEGACY_TOKEN_KEY),
    ]);

    accessTokenCache = accessToken;
    refreshTokenCache = refreshToken;
    cacheLoaded = true;
  },

  clearTokens: async () => {
    await Promise.all([
      deleteSecureValue(ACCESS_TOKEN_KEY),
      deleteSecureValue(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(LEGACY_TOKEN_KEY),
    ]);

    accessTokenCache = null;
    refreshTokenCache = null;
    cacheLoaded = true;
  },

  setAccessToken: async (accessToken) => {
    if (!accessToken) {
      throw new Error('Access token is required');
    }

    await Promise.all([
      writeSecureValue(ACCESS_TOKEN_KEY, accessToken),
      AsyncStorage.removeItem(LEGACY_TOKEN_KEY),
    ]);
    accessTokenCache = accessToken;
    cacheLoaded = true;
  },
};
