import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { errorLogService } from '../services/errorLogService';

const shouldSkipErrorLogging = (headers) => {
  if (!headers) {
    return false;
  }

  return (
    headers['X-Skip-Error-Logging'] === 'true' ||
    headers['x-skip-error-logging'] === 'true'
  );
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout to 30 seconds for slower networks
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token
api.interceptors.request.use(
  (config) => {
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
  (error) => {
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
