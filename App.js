import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import SessionScreen from './src/screens/SessionScreen';
import ReportScreen from './src/screens/ReportScreen';
import AppointmentsScreen from './src/screens/AppointmentsScreen';
import AppointmentUpdateScreen from './src/screens/AppointmentUpdateScreen';
import AppointmentClientScreen from './src/screens/AppointmentClientScreen';
import AppointmentCreateScreen from './src/screens/AppointmentCreateScreen';
import DebugScreen from './src/screens/DebugScreen';
import './src/services/LocationTask';
import { errorLogService } from './src/services/errorLogService';
import { createTable as createLocationTable } from './src/db/locationDB';
import { createTable as createAppointmentTable } from './src/db/appointmentDB';
import { startTracking, stopTracking } from './src/services/TrackingController';

const Stack = createNativeStackNavigator();
const LAST_SEEN_APP_VERSION_KEY = 'last_seen_app_version';
const ACTIVE_SESSION_ID_KEY = 'active_session_id';

const getCurrentAppVersion = () => {
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' && version.trim() ? version : 'unknown';
};

const parseSessionId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const resetTrackingAfterUpgrade = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  const currentVersion = getCurrentAppVersion();
  const previousVersion = await AsyncStorage.getItem(LAST_SEEN_APP_VERSION_KEY);

  if (!previousVersion) {
    await AsyncStorage.setItem(LAST_SEEN_APP_VERSION_KEY, currentVersion);
    return;
  }

  if (previousVersion === currentVersion) {
    return;
  }

  try {
    await stopTracking();

    const storedSessionId = await AsyncStorage.getItem(ACTIVE_SESSION_ID_KEY);
    if (parseSessionId(storedSessionId) !== null) {
      await startTracking();
    }
  } catch (error) {
    await errorLogService.logError(error, {
      source: 'upgrade_tracking_reset',
      details: {
        previous_version: previousVersion,
        current_version: currentVersion,
      },
    });
  } finally {
    await AsyncStorage.setItem(LAST_SEEN_APP_VERSION_KEY, currentVersion);
  }
};

const AppNavigator = () => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <NavigationContainer key={token ? 'auth' : 'guest'}>
      <Stack.Navigator
        initialRouteName={token ? 'Session' : 'Login'}
        screenOptions={{
          headerStyle: {
            backgroundColor: '#2563eb',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Session"
          component={SessionScreen}
          options={{
            title: 'Work Session',
            headerLeft: () => null,
          }}
        />
        <Stack.Screen
          name="Appointments"
          component={AppointmentsScreen}
          options={{ title: 'My Appointments' }}
        />
        <Stack.Screen
          name="AppointmentUpdate"
          component={AppointmentUpdateScreen}
          options={{ title: 'Update Appointment' }}
        />
        <Stack.Screen
          name="AppointmentClient"
          component={AppointmentClientScreen}
          options={{ title: 'Select Client' }}
        />
        <Stack.Screen
          name="AppointmentCreate"
          component={AppointmentCreateScreen}
          options={{ title: 'New Appointment' }}
        />
        <Stack.Screen
          name="Debug"
          component={DebugScreen}
          options={{ title: 'Debug' }}
        />
        <Stack.Screen
          name="Report"
          component={ReportScreen}
          options={{
            title: 'Session Report',
            headerLeft: () => null,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      errorLogService.installGlobalErrorHandler();
      createLocationTable();
      createAppointmentTable();
      await resetTrackingAfterUpgrade();
      errorLogService.flushPendingLogs();
    };

    initializeApp();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
