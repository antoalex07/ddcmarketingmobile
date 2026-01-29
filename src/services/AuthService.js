import api from '../config/api';

export const authService = {
  login: async (username, password) => {
    try {
      const response = await api.post('/auth/login', {
        user_name: username,
        user_pass: password,
      });

      if (response.data.status === 'success') {
        return {
          success: true,
          data: {
            token: response.data.token,
            user: {
              userId: response.data.user_id,
              userName: response.data.user_name,
              roleId: response.data.roleid,
            },
          },
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Login failed',
        };
      }
    } catch (error) {
      if (error.response) {
        const status = error.response.data.status;
        const message = error.response.data.message;

        if (status === 'notfound') {
          return {
            success: false,
            message: message || 'Invalid username or password',
          };
        }
      }

      return {
        success: false,
        message: 'Network error. Please check your connection.',
      };
    }
  },
};