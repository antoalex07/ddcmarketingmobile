import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import SessionScreen from './src/screens/SessionScreen';
import DebugScreen from './src/screens/DebugScreen';
import ReportScreen from './src/screens/ReportScreen';
import './src/services/LocationTask';
import { createTable } from './src/db/locationDB';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    createTable().catch(err => console.error('Failed to create locations table:', err));
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
      </AuthProvider>
    </SafeAreaProvider>
  );
}