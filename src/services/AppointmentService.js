import api from '../config/api';

export const appointmentService = {
  getStaffDetails: async (token) => {
    try {
      const response = await api.get('/staff/getstaff', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Failed to fetch staff details:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch staff details',
      };
    }
  },

  getAppointments: async (token, staffId) => {
    try {
      const response = await api.get(`/appointment/getallappointments/${staffId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch appointments',
      };
    }
  },
};
