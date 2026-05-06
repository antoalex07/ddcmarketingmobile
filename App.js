import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DebugScreen from './src/screens/DebugScreen';
import './src/services/LocationTask';
import { errorLogService } from './src/services/errorLogService';
import { createTable as createLocationTable } from './src/db/locationDB';

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      errorLogService.installGlobalErrorHandler();
      createLocationTable();
    };

    initializeApp();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <DebugScreen />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});

