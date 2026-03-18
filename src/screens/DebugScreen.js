import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import {
  createTable,
  insertPoint,
  getUnsyncedPoints,
  markAsSynced
} from '../db/locationDB';
import { nativeCrashLogService } from '../services/nativeCrashLogService';

const DATABASE_NAME = 'locations.db';

const DebugScreen = () => {
  const [log, setLog] = useState([]);
  const [points, setPoints] = useState([]);
  const [nativeCrashLogs, setNativeCrashLogs] = useState([]);
  const [nativeCrashLogPath, setNativeCrashLogPath] = useState('');

  useEffect(() => {
    initDB();
    const logPathResult = nativeCrashLogService.getLogFilePath();
    if (logPathResult.success) {
      setNativeCrashLogPath(logPathResult.path);
    }
  }, []);

  const addLog = (message) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  const initDB = async () => {
    try {
      await createTable();
      addLog('Database initialized');
    } catch (error) {
      addLog(`Init error: ${error.message}`);
    }
  };

  const insertFakePoint = async () => {
    try {
      const fakePoint = {
        session_id: Math.floor(Math.random() * 100),
        latitude: 37.7749 + (Math.random() - 0.5) * 0.01,
        longitude: -122.4194 + (Math.random() - 0.5) * 0.01,
        accuracy: Math.random() * 20,
        speed: Math.random() * 10,
        heading: Math.random() * 360,
        timestamp: new Date().toISOString()
      };
      const id = await insertPoint(fakePoint);
      addLog(`Inserted point with id: ${id}`);
    } catch (error) {
      addLog(`Insert error: ${error.message}`);
    }
  };

  const insertBulkPoints = async () => {
    try {
      const sessionId = Math.floor(Math.random() * 100);
      for (let i = 0; i < 10; i++) {
        await insertPoint({
          session_id: sessionId,
          latitude: 37.7749 + (Math.random() - 0.5) * 0.01,
          longitude: -122.4194 + (Math.random() - 0.5) * 0.01,
          accuracy: Math.random() * 20,
          speed: Math.random() * 10,
          heading: Math.random() * 360,
          timestamp: new Date().toISOString()
        });
      }
      addLog(`Inserted 10 points for session ${sessionId}`);
    } catch (error) {
      addLog(`Bulk insert error: ${error.message}`);
    }
  };

  const readPoints = async () => {
    try {
      const unsyncedPoints = await getUnsyncedPoints();
      setPoints(unsyncedPoints);
      addLog(`Read ${unsyncedPoints.length} unsynced points`);
    } catch (error) {
      addLog(`Read error: ${error.message}`);
    }
  };

  const getCounts = async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      const total = await db.getFirstAsync('SELECT COUNT(*) as count FROM locations');
      const unsynced = await db.getFirstAsync('SELECT COUNT(*) as count FROM locations WHERE synced = 0');
      const synced = await db.getFirstAsync('SELECT COUNT(*) as count FROM locations WHERE synced = 1');
      addLog(`Total: ${total.count} | Unsynced: ${unsynced.count} | Synced: ${synced.count}`);
    } catch (error) {
      addLog(`Count error: ${error.message}`);
    }
  };

  const simulateUpload = async () => {
    try {
      const unsyncedPoints = await getUnsyncedPoints();
      if (unsyncedPoints.length === 0) {
        addLog('No unsynced points to upload');
        return;
      }
      const ids = unsyncedPoints.map(p => p.id);
      await markAsSynced(ids);
      addLog(`Simulated upload: marked ${ids.length} points as synced`);
      setPoints([]);
    } catch (error) {
      addLog(`Upload simulation error: ${error.message}`);
    }
  };

  const clearDatabase = async () => {
    Alert.alert(
      'Clear Database',
      'Are you sure you want to delete all location data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
              await db.execAsync('DELETE FROM locations');
              setPoints([]);
              addLog('Database cleared');
            } catch (error) {
              addLog(`Clear error: ${error.message}`);
            }
          }
        }
      ]
    );
  };

  const clearLog = () => {
    setLog([]);
  };

  const readNativeCrashLogs = async () => {
    try {
      const result = await nativeCrashLogService.readLogs();

      if (!result.success) {
        addLog(`Native crash read error: ${result.message}`);
        return;
      }

      setNativeCrashLogs(result.data);
      if (result.path) {
        setNativeCrashLogPath(result.path);
      }
      addLog(`Read ${result.data.length} native crash logs`);
    } catch (error) {
      addLog(`Native crash read error: ${error.message}`);
    }
  };

  const clearNativeCrashLogs = async () => {
    try {
      const result = await nativeCrashLogService.clearLogs();

      if (!result.success) {
        addLog(`Native crash clear error: ${result.message}`);
        return;
      }

      setNativeCrashLogs([]);
      addLog('Cleared native crash logs');
    } catch (error) {
      addLog(`Native crash clear error: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Debug Screen</Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={insertFakePoint}>
          <Text style={styles.buttonText}>Insert 1</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={insertBulkPoints}>
          <Text style={styles.buttonText}>Insert 10</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={readPoints}>
          <Text style={styles.buttonText}>Read</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={getCounts}>
          <Text style={styles.buttonText}>Counts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={simulateUpload}>
          <Text style={styles.buttonText}>Sim Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={clearDatabase}>
          <Text style={styles.buttonText}>Clear DB</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={readNativeCrashLogs}>
          <Text style={styles.buttonText}>Read Crashes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={clearNativeCrashLogs}>
          <Text style={styles.buttonText}>Clear Crashes</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Log</Text>
          <TouchableOpacity onPress={clearLog}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.logContainer}>
          {log.map((entry, index) => (
            <Text key={index} style={styles.logText}>{entry}</Text>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Unsynced Points ({points.length})</Text>
        <ScrollView style={styles.pointsContainer}>
          {points.map((point, index) => (
            <Text key={index} style={styles.pointText}>
              #{point.id} | S:{point.session_id} | {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
            </Text>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Native Crash Logs ({nativeCrashLogs.length})</Text>
        {nativeCrashLogPath ? (
          <Text style={styles.metaText} numberOfLines={1}>
            {nativeCrashLogPath}
          </Text>
        ) : null}
        <ScrollView style={styles.pointsContainer}>
          {nativeCrashLogs.length === 0 ? (
            <Text style={styles.emptyText}>No native crash logs found.</Text>
          ) : (
            nativeCrashLogs.map((entry, index) => (
              <Text key={index} style={styles.pointText}>
                [{entry.timestamp || 'unknown'}] {entry.name || entry.type || 'Crash'}: {entry.message || 'No message'}
              </Text>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1a1a1a'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center'
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  button: {
    flex: 1,
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center'
  },
  dangerButton: {
    backgroundColor: '#8b0000'
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600'
  },
  section: {
    flex: 1,
    marginTop: 12
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8
  },
  clearText: {
    color: '#666',
    fontSize: 14
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 8
  },
  logText: {
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 4
  },
  pointsContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 8
  },
  pointText: {
    color: '#0ff',
    fontFamily: 'monospace',
    fontSize: 11,
    marginBottom: 2
  },
  metaText: {
    color: '#9ca3af',
    fontSize: 11,
    marginBottom: 6
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 12
  }
});

export default DebugScreen;
