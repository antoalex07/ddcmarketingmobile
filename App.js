import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import SessionScreen from './src/screens/SessionScreen';
import ReportScreen from './src/screens/ReportScreen';
import AppointmentsScreen from './src/screens/AppointmentsScreen';
import AppointmentUpdateScreen from './src/screens/AppointmentUpdateScreen';
import './src/services/LocationTask';
import { createTable as createLocationTable } from './src/db/locationDB';
import { createTable as createAppointmentTable } from './src/db/appointmentDB';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    createLocationTable();
    createAppointmentTable();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Login"
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
              name="Report"
              component={ReportScreen}
              options={{
                title: 'Session Report',
                headerLeft: () => null,
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}