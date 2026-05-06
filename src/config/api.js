const disabledApiMethod = async () => {
  throw new Error('Backend calls are disabled in this build');
};

const api = {
  get: disabledApiMethod,
  post: disabledApiMethod,
  put: disabledApiMethod,
  patch: disabledApiMethod,
  delete: disabledApiMethod,
};

export default api;
export const setApiAuthFailureHandler = () => {};
export const API_BASE_URL = 'backend-disabled';
