import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DebugScreen from './src/screens/DebugScreen';
import LoginScreen from './src/screens/LoginScreen';
import ReportScreen from './src/screens/ReportScreen';
import SessionScreen from './src/screens/SessionScreen';
import { AuthProvider } from './src/context/AuthContext';
import './src/services/LocationTask';
import { errorLogService } from './src/services/errorLogService';
import { createTable as createLocationTable } from './src/db/locationDB';
import { reconcileLocationTrackingState } from './src/services/TrackingController';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      errorLogService.installGlobalErrorHandler();
      createLocationTable();
      await reconcileLocationTrackingState('app_startup');
    };

    initializeApp();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Session"
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="Session" component={SessionScreen} />
            <Stack.Screen name="Debug" component={DebugScreen} />
            <Stack.Screen name="Report" component={ReportScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

