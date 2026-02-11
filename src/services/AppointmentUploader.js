import {
  getUnsyncedAppointments,
  markAsSynced,
  updateAppointmentId,
  incrementRetryCount
} from '../db/appointmentDB';
import api from '../config/api';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const uploadUnsyncedAppointments = async (token) => {
  const unsyncedAppointments = await getUnsyncedAppointments();

  if (unsyncedAppointments.length === 0) {
    return { uploaded: 0, failed: 0 };
  }

  let uploaded = 0;
  let failed = 0;

  // Process appointments one at a time (not batched per user decision)
  for (const appointment of unsyncedAppointments) {
    // Transform local record to backend payload format
    const payload = {
      appoint_userid: appointment.appoint_userid,
      appoint_staffname: appointment.appoint_staffname,
      appoint_assigneduserid: appointment.appoint_assigneduserid,
      appoint_assignedstaffname: appointment.appoint_assignedstaffname,
      appoint_clientautoid: appointment.appoint_clientautoid,
      appoint_clientname: appointment.appoint_clientname,
      appoint_clientaddress: appointment.appoint_clientaddress,
      appoint_clienttype: appointment.appoint_clienttype,
      appoint_appointmentdate: appointment.appoint_appointmentdate,
      appoint_timefrom: appointment.appoint_timefrom,
      appoint_timeto: appointment.appoint_timeto,
      appoint_notes: appointment.appoint_notes,
      appoint_latitude: appointment.appoint_latitude,
      appoint_longitude: appointment.appoint_longitude,
      appoint_status: appointment.appoint_status,
      appoint_report: appointment.appoint_report,
      appoint_reportdate: appointment.appoint_reportdate,
      appoint_followupdate: appointment.appoint_followupdate,
      appoint_followuptimefrom: appointment.appoint_followuptimefrom,
      appoint_followuptimeto: appointment.appoint_followuptimeto,
      appoint_crtdby: appointment.appoint_crtdby,
      appoint_crton: appointment.appoint_crton,
    };

    let success = false;

    // Retry up to MAX_RETRIES times
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await api.post('/appointment/createappointment', payload, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // On success: update with backend ID and mark as synced
        if (response.data && response.data.appoint_id) {
          await updateAppointmentId(appointment.id, response.data.appoint_id);
          await markAsSynced(appointment.id);
          uploaded++;
          success = true;
          break;
        }
      } catch (err) {
        // If not the last attempt, wait with linear backoff
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS * attempt);
        }
      }
    }

    // If all retries exhausted, increment retry count
    if (!success) {
      await incrementRetryCount(appointment.id);
      failed++;
    }
  }

  return { uploaded, failed };
};
