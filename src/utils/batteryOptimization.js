import { NativeModules, Platform, Linking, Alert } from 'react-native';

const { PowerManager } = NativeModules;

export const checkBatteryOptimization = async () => {
  if (Platform.OS !== 'android') {
    return { isOptimized: false };
  }

  try {
    // This requires a native module - for now we'll use a settings prompt approach
    return { isOptimized: null, canCheck: false };
  } catch (error) {
    console.error('Failed to check battery optimization:', error);
    return { isOptimized: null, canCheck: false };
  }
};

export const openBatteryOptimizationSettings = () => {
  if (Platform.OS === 'android') {
    Linking.openSettings();
  }
};

export const promptBatteryOptimization = () => {
  if (Platform.OS !== 'android') return;

  Alert.alert(
    'Background Activity Required',
    'To track your location reliably during work sessions, please disable battery optimization for this app.\n\n' +
    'Go to: Settings > Apps > DDC Marketing > Battery > Unrestricted',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Open Settings', onPress: openBatteryOptimizationSettings }
    ]
  );
};
