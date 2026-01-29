import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

export const openSettings = () => {
  Linking.openSettings();
};

export const openLocationSettings = () => {
  if (Platform.OS === 'android') {
    Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
  } else {
    Linking.openURL('App-Prefs:Privacy&path=LOCATION');
  }
};

export const requestLocationPermissions = async () => {
  // Step 1: Check if location services are enabled
  const locationEnabled = await Location.hasServicesEnabledAsync();

  if (!locationEnabled) {
    return {
      granted: false,
      canAskAgain: true,
      locationDisabled: true,
      error: 'Location services are disabled. Please enable GPS.'
    };
  }

  // Step 2: Request foreground permission
  const foreground = await Location.requestForegroundPermissionsAsync();

  if (foreground.status !== 'granted') {
    return {
      granted: false,
      canAskAgain: foreground.canAskAgain,
      error: 'Foreground location permission denied'
    };
  }

  // Step 2: Request background permission
  const background = await Location.requestBackgroundPermissionsAsync();

  if (background.status !== 'granted') {
    return {
      granted: false,
      canAskAgain: background.canAskAgain,
      error: 'Background location permission denied'
    };
  }

  return {
    granted: true,
    canAskAgain: true,
    error: null
  };
};

export const checkLocationPermissions = async () => {
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();

  return {
    foreground: foreground.status === 'granted',
    background: background.status === 'granted',
    fullyGranted: foreground.status === 'granted' && background.status === 'granted'
  };
};

export const checkLocationStatus = async () => {
  // Check if GPS/location services are enabled
  const locationEnabled = await Location.hasServicesEnabledAsync();

  // Check if permissions are granted
  const permissions = await checkLocationPermissions();

  return {
    servicesEnabled: locationEnabled,
    permissionsGranted: permissions.fullyGranted,
    isFullyFunctional: locationEnabled && permissions.fullyGranted
  };
};
