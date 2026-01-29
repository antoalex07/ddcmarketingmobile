import * as Location from 'expo-location';
import { LOCATION_TASK_NAME } from './LocationTask';

export const startTracking = async () => {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

  if (isTracking) {
    return;
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 10,
    timeInterval: 5000,
    foregroundService: {
      notificationTitle: 'DDC Marketing',
      notificationBody: 'Tracking your work session location',
      notificationColor: '#2563eb'
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true
  });
};

export const stopTracking = async () => {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
};

export const isTracking = async () => {
  return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
};
