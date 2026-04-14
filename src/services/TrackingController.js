import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LOCATION_TASK_NAME } from './LocationTask';

const ensureTrackingPreconditions = async () => {
  const isTaskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!isTaskManagerAvailable) {
    throw new Error('Background task manager is not available on this device.');
  }

  if (typeof TaskManager.isTaskDefined === 'function' && !TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
    throw new Error('Background location task is not defined.');
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error('Location services are disabled.');
  }

  const [foregroundPermission, backgroundPermission] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);

  if (foregroundPermission.status !== 'granted' || backgroundPermission.status !== 'granted') {
    throw new Error('Foreground and background location permissions are required for tracking.');
  }
};

export const startTracking = async () => {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

  if (isTracking) {
    return;
  }

  await ensureTrackingPreconditions();

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
