const emptyList = [];

const disabled = (message = 'Backend is disabled in this build') => ({
  success: false,
  message,
});

export const appointmentService = {
  getStaffDetails: async () => ({
    success: true,
    data: { staff: null },
  }),

  getStaffDetailsByUserId: async () => ({
    success: true,
    data: { staff: null },
  }),

  getDoctorsByStaff: async () => ({
    success: true,
    data: emptyList,
  }),

  getHospitalsByStaff: async () => ({
    success: true,
    data: emptyList,
  }),

  getClinicsByStaff: async () => ({
    success: true,
    data: emptyList,
  }),

  createDoctor: async () => disabled(),

  createHospital: async () => disabled(),

  createClinic: async () => disabled(),

  getAppointments: async () => ({
    success: true,
    data: emptyList,
  }),

  updateAppointment: async () => disabled(),

  getCountries: async () => ({
    success: true,
    data: emptyList,
  }),

  getStates: async () => ({
    success: true,
    data: emptyList,
  }),

  getDistricts: async () => ({
    success: true,
    data: emptyList,
  }),

  createAppointment: async () => disabled(),
};
