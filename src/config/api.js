import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { errorLogService } from '../services/errorLogService';
import { tokenStorage } from '../services/tokenStorage';

const isObject = (value) => value && typeof value === 'object';

const hasHeaderFlag = (headers, key, expectedValue) => {
  if (!isObject(headers)) {
    return false;
  }

  const normalizedKey = key.toLowerCase();
  const entries = Object.entries(headers);
  for (const [headerKey, headerValue] of entries) {
    if (String(headerKey).toLowerCase() !== normalizedKey) {
      continue;
    }
    if (String(headerValue) === expectedValue) {
      return true;
    }
  }

  return false;
};

const mergeRequestHeaders = (configHeaders, extraHeaders) => {
  if (typeof axios.AxiosHeaders?.from === 'function') {
    const mergedHeaders = axios.AxiosHeaders.from(configHeaders || {});
    Object.entries(extraHeaders).forEach(([key, value]) => {
      mergedHeaders.set(key, value);
    });
    return mergedHeaders;
  }

  return {
    ...(isObject(configHeaders) ? configHeaders : {}),
    ...extraHeaders,
  };
};

const shouldSkipErrorLogging = (headers) => {
  if (!headers) {
    return false;
  }

  return (
    hasHeaderFlag(headers, 'X-Skip-Error-Logging', 'true') ||
    hasHeaderFlag(headers, 'x-skip-error-logging', 'true')
  );
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout to 30 seconds for slower networks
  headers: {
    'Content-Type': 'application/json',
  },
});

let onAuthFailure = null;
let refreshPromise = null;

const shouldSkipAuthRetry = (headers) => {
  if (!headers) {
    return false;
  }

  return (
    hasHeaderFlag(headers, 'X-Skip-Auth-Retry', 'true') ||
    hasHeaderFlag(headers, 'x-skip-auth-retry', 'true')
  );
};

const shouldAttemptRefresh = (error) => {
  const status = error.response?.status;
  const config = error.config || {};

  if (config._retry) {
    return false;
  }

  if (shouldSkipAuthRetry(config.headers)) {
    return false;
  }

  return status === 401 || status === 403;
};

const clearAuthAndNotify = async () => {
  await tokenStorage.clearTokens();
  if (typeof onAuthFailure === 'function') {
    onAuthFailure();
  }
};

const refreshAccessToken = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = await tokenStorage.getRefreshToken();

    if (!refreshToken) {
      await clearAuthAndNotify();
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refresh_token: refreshToken },
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'x-client-type': 'mobile',
            'X-Skip-Auth-Retry': 'true',
            'X-Skip-Error-Logging': 'true',
          },
        }
      );

      const accessToken = response.data?.token;
      const rotatedRefreshToken = response.data?.refresh_token;

      if (!accessToken || !rotatedRefreshToken) {
        throw new Error('Token refresh response is incomplete');
      }

      const nextTokens = {
        accessToken,
        refreshToken: rotatedRefreshToken,
      };

      await tokenStorage.setTokens(nextTokens);
      return nextTokens;
    } catch (refreshError) {
      const status = refreshError.response?.status;
      if (status === 400 || status === 403) {
        await clearAuthAndNotify();
      }
      throw refreshError;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

export const setApiAuthFailureHandler = (handler) => {
  onAuthFailure = handler;
};

// Request interceptor to add token
api.interceptors.request.use(
  async (config) => {
    if (!shouldSkipAuthRetry(config.headers)) {
      const accessToken = await tokenStorage.getAccessToken();
      if (accessToken) {
        config.headers = mergeRequestHeaders(config.headers, {
          Authorization: `Bearer ${accessToken}`,
        });
      }
    }

    const fullUrl = `${config.baseURL}${config.url}`;
    console.log('API Request:', {
      method: config.method?.toUpperCase(),
      fullUrl: fullUrl,
      url: config.url,
      baseURL: config.baseURL,
    });
    // Token will be added in individual requests where needed
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    const fullUrl = `${response.config.baseURL}${response.config.url}`;
    console.log('API Response SUCCESS:', {
      fullUrl: fullUrl,
      status: response.status,
    });
    return response;
  },
  async (error) => {
    const fullUrl = error.config ? `${error.config.baseURL}${error.config.url}` : 'unknown';
    const method = error.config?.method ? String(error.config.method).toUpperCase() : null;

    console.error('API Response ERROR:', {
      fullUrl: fullUrl,
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      code: error.code,
      responseData: error.response?.data,
    });

    if (shouldAttemptRefresh(error)) {
      try {
        const refreshedTokens = await refreshAccessToken();
        const retryConfig = {
          ...error.config,
          _retry: true,
          headers: mergeRequestHeaders(error.config?.headers, {
            Authorization: `Bearer ${refreshedTokens.accessToken}`,
          }),
        };
        return api.request(retryConfig);
      } catch (refreshError) {
      }
    }

    if (!shouldSkipErrorLogging(error.config?.headers)) {
      errorLogService.logError(error, {
        source: 'api_response',
        is_fatal: false,
        details: {
          full_url: fullUrl,
          method: method,
          status: error.response?.status ?? null,
          status_text: error.response?.statusText ?? null,
          code: error.code ?? null,
          response_data: error.response?.data ?? null,
        },
      });
    }

    return Promise.reject(error);
  }
);

export default api;
export { API_BASE_URL };
