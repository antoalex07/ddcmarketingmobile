import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
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

const Stack = createNativeStackNavigator();

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
    errorLogService.installGlobalErrorHandler();
    errorLogService.flushPendingLogs();
    createLocationTable();
    createAppointmentTable();
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
