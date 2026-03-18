import api from '../config/api';

export const appointmentService = {
  getStaffDetails: async (token) => {
    try {
      console.log('Fetching staff details...');
      const response = await api.get('/staff/getstaff', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('Staff details fetched successfully');
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error fetching staff details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code,
      });
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch staff details',
      };
    }
  },

  getStaffDetailsByUserId: async (token, userId) => {
    try {
      const response = await api.get(`/staff/getstaff/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch staff details',
      };
    }
  },

  getDoctorsByStaff: async (token, staffId) => {
    try {
      const response = await api.get(`/appointment/bystaff/${staffId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch doctors',
      };
    }
  },

  getHospitalsByStaff: async (token, staffId) => {
    try {
      const response = await api.get(`/appointment/hospitalbystaff/${staffId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch hospitals',
      };
    }
  },

  getClinicsByStaff: async (token, staffId) => {
    try {
      const response = await api.get(`/appointment/clinicbystaff/${staffId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch clinics',
      };
    }
  },

  createDoctor: async (token, data) => {
    try {
      const response = await api.post('/doctors/adddoctor', data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to add doctor',
      };
    }
  },

  createHospital: async (token, data) => {
    try {
      const response = await api.post('/hospital/addhospital', data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to add hospital',
      };
    }
  },

  createClinic: async (token, data) => {
    try {
      const response = await api.post('/clinic/addclinic', data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to add clinic',
      };
    }
  },

  getAppointments: async (token, staffId) => {
    try {
      console.log('Fetching appointments for staffId:', staffId);
      const response = await api.get(`/appointment/getallappointments/${staffId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('Appointments fetched successfully:', response.data);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error fetching appointments:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code,
      });
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch appointments',
      };
    }
  },

  updateAppointment: async (token, appointmentData) => {
    try {
      console.log('Updating appointment with data:', appointmentData);
      const response = await api.post('/appointment/updateappointmentstatus', appointmentData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('Appointment updated successfully:', response.data);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('Error updating appointment:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code,
      });
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to update appointment',
      };
    }
  },

  getCountries: async (token) => {
    try {
      const response = await api.get('/staff/getallcountry', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch countries',
      };
    }
  },

  getStates: async (token, countryId) => {
    try {
      const response = await api.get(`/staff/getstates/${countryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch states',
      };
    }
  },

  getDistricts: async (token, stateId) => {
    try {
      const response = await api.get(`/staff/getdistricts/${stateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch districts',
      };
    }
  },

  createAppointment: async (token, appointmentData) => {
    try {
      const response = await api.post('/appointment/addappointment', appointmentData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to create appointment',
      };
    }
  },
};
