import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCATION_TASK_NAME } from './locationTaskConstants';
import { diagnosticsService } from './diagnosticsService';

const SESSION_KEYS = [
  'active_session_id',
  'session_start_time',
  'session_end_time',
  'pending_session_restart',
  'pending_tracking_restart',
  'pending_session_stop',
];

const normalizeError = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error || 'Unknown error'),
});

const appendTrackingDiagnostic = (event, details = {}, force = true) =>
  diagnosticsService
    .appendLocationDiagnostic(event, details, {
      source: 'TrackingController',
      force,
    })
    .catch(() => {});

export const getTrackingPreconditionStatus = async () => {
  const [
    taskManagerAvailable,
    servicesEnabled,
    foregroundPermission,
    backgroundPermission,
  ] = await Promise.all([
    TaskManager.isAvailableAsync().catch(() => false),
    Location.hasServicesEnabledAsync().catch(() => false),
    Location.getForegroundPermissionsAsync().catch((error) => ({ status: 'error', error })),
    Location.getBackgroundPermissionsAsync().catch((error) => ({ status: 'error', error })),
  ]);

  const taskDefined =
    typeof TaskManager.isTaskDefined === 'function'
      ? TaskManager.isTaskDefined(LOCATION_TASK_NAME)
      : false;

  return {
    taskManagerAvailable,
    taskDefined,
    servicesEnabled,
    foregroundGranted: foregroundPermission.status === 'granted',
    backgroundGranted: backgroundPermission.status === 'granted',
    foregroundPermission,
    backgroundPermission,
    valid:
      taskManagerAvailable &&
      taskDefined &&
      servicesEnabled &&
      foregroundPermission.status === 'granted' &&
      backgroundPermission.status === 'granted',
  };
};

const readTrackingState = async () => {
  const [activeSessionId, trackingStarted, taskRegistered] = await Promise.all([
    AsyncStorage.getItem('active_session_id').catch(() => null),
    Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false),
    typeof TaskManager.isTaskRegisteredAsync === 'function'
      ? TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).catch(() => false)
      : Promise.resolve(false),
  ]);

  return {
    activeSessionId,
    hasActiveSession: Boolean(activeSessionId && activeSessionId !== 'null' && activeSessionId !== 'undefined'),
    trackingStarted,
    taskRegistered,
  };
};

export const hardStopTracking = async (reason = 'hard_stop') => {
  const results = await Promise.allSettled([
    Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME),
    AsyncStorage.multiRemove(SESSION_KEYS),
  ]);

  let taskRegistered = false;
  if (typeof TaskManager.isTaskRegisteredAsync === 'function') {
    taskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).catch(() => false);
  }

  let unregisterResult = null;
  if (taskRegistered && typeof TaskManager.unregisterTaskAsync === 'function') {
    unregisterResult = await TaskManager.unregisterTaskAsync(LOCATION_TASK_NAME)
      .then(() => ({ success: true }))
      .catch((error) => ({ success: false, error: normalizeError(error) }));
  }

  await appendTrackingDiagnostic('tracking_hard_stopped', {
    reason,
    stop_updates: results[0].status,
    clear_session_state: results[1].status,
    task_registered_after_stop: taskRegistered,
    unregister_result: unregisterResult,
  });

  return {
    stopped: true,
    reason,
    stopUpdatesStatus: results[0].status,
    clearSessionStatus: results[1].status,
    unregisterResult,
  };
};

const ensureTrackingPreconditions = async () => {
  const status = await getTrackingPreconditionStatus();

  if (!status.taskManagerAvailable) {
    throw new Error('Background task manager is not available on this device.');
  }

  if (!status.taskDefined) {
    throw new Error('Background location task is not defined.');
  }

  if (!status.servicesEnabled) {
    throw new Error('Location services are disabled.');
  }

  if (!status.foregroundGranted || !status.backgroundGranted) {
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

export const reconcileLocationTrackingState = async (reason = 'unknown') => {
  const [preconditions, trackingState] = await Promise.all([
    getTrackingPreconditionStatus(),
    readTrackingState(),
  ]);

  const hasTrackingState =
    trackingState.hasActiveSession ||
    trackingState.trackingStarted ||
    trackingState.taskRegistered;

  if (!hasTrackingState) {
    return {
      changed: false,
      valid: preconditions.valid,
      reason,
      preconditions,
      trackingState,
    };
  }

  if (!preconditions.valid) {
    const hardStopResult = await hardStopTracking(reason);
    return {
      changed: true,
      valid: false,
      reason,
      preconditions,
      trackingState,
      hardStopResult,
    };
  }

  await appendTrackingDiagnostic('tracking_reconciled_valid', {
    reason,
    tracking_started: trackingState.trackingStarted,
    task_registered: trackingState.taskRegistered,
    has_active_session: trackingState.hasActiveSession,
  }, false);

  return {
    changed: false,
    valid: true,
    reason,
    preconditions,
    trackingState,
  };
};
