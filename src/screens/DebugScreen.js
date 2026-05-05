import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import {
  createTable,
  insertPoint,
  getUnsyncedPoints,
  markAsSynced
} from '../db/locationDB';
import { nativeCrashLogService } from '../services/nativeCrashLogService';
import { diagnosticsService } from '../services/diagnosticsService';
import { startTracking, stopTracking, isTracking } from '../services/TrackingController';

const DATABASE_NAME = 'locations.db';
const SESSION_ID_KEY = 'active_session_id';

const DebugScreen = () => {
  const [log, setLog] = useState([]);
  const [points, setPoints] = useState([]);
  const [nativeCrashLogs, setNativeCrashLogs] = useState([]);
  const [nativeCrashLogPath, setNativeCrashLogPath] = useState('');
  const [locationDiagnostics, setLocationDiagnostics] = useState([]);
  const [locationDiagnosticsPath, setLocationDiagnosticsPath] = useState('');
  const [diagnosticsStatus, setDiagnosticsStatus] = useState({
    enabled: false,
    enabledUntil: 0,
  });

  useEffect(() => {
    initDB();
    const logPathResult = nativeCrashLogService.getLogFilePath();
    if (logPathResult.success) {
      setNativeCrashLogPath(logPathResult.path);
    }
    refreshDiagnosticsStatus();
  }, []);

  const addLog = (message) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  const refreshDiagnosticsStatus = async () => {
    try {
      const status = await diagnosticsService.getLocationDiagnosticsStatus();
      setDiagnosticsStatus(status);

      const filePath = diagnosticsService.getLocationDiagnosticsFilePath();
      if (filePath) {
        setLocationDiagnosticsPath(filePath);
      } else if (status.path) {
        setLocationDiagnosticsPath(status.path);
      }
    } catch (error) {
      addLog(`Diagnostics status error: ${error.message}`);
    }
  };

  const getDiagnosticsStatusText = () => {
    if (!diagnosticsStatus.enabled) {
      return 'Location diagnostics: Off';
    }

    const enabledUntil = Number(diagnosticsStatus.enabledUntil || 0);
    if (!enabledUntil) {
      return 'Location diagnostics: On';
    }

    return `Location diagnostics: On until ${new Date(enabledUntil).toLocaleString()}`;
  };

  const enableLocationDiagnostics = async () => {
    try {
      await diagnosticsService.setLocationDiagnosticsEnabled(true, 24);
      await diagnosticsService.appendLocationDiagnostic(
        'debug_mode_enabled',
        { ttl_hours: 24 },
        { source: 'debug_screen', force: true }
      );
      await refreshDiagnosticsStatus();
      addLog('Location diagnostics enabled for 24 hours');
    } catch (error) {
      addLog(`Enable diagnostics error: ${error.message}`);
    }
  };

  const disableLocationDiagnostics = async () => {
    try {
      await diagnosticsService.appendLocationDiagnostic(
        'debug_mode_disabled',
        {},
        { source: 'debug_screen', force: true }
      );
      await diagnosticsService.setLocationDiagnosticsEnabled(false);
      await refreshDiagnosticsStatus();
      addLog('Location diagnostics disabled');
    } catch (error) {
      addLog(`Disable diagnostics error: ${error.message}`);
    }
  };

  const captureLocationSnapshot = async () => {
    try {
      const snapshot = await diagnosticsService.captureLocationDebugSnapshot();
      addLog(
        `Snapshot: tracking=${snapshot.tracking_started} session=${snapshot.active_session_id || 'none'} unsynced=${snapshot.unsynced_location_count}`
      );
      await readLocationDiagnostics();
    } catch (error) {
      addLog(`Snapshot error: ${error.message}`);
    }
  };

  const readLocationDiagnostics = async () => {
    try {
      const result = await diagnosticsService.readLocationDiagnostics();

      if (!result.success) {
        addLog(`Location diagnostics read error: ${result.message}`);
        return;
      }

      setLocationDiagnostics(result.data);
      if (result.path) {
        setLocationDiagnosticsPath(result.path);
      }
      addLog(`Read ${result.data.length} location diagnostics`);
    } catch (error) {
      addLog(`Location diagnostics read error: ${error.message}`);
    }
  };

  const clearLocationDiagnostics = async () => {
    try {
      const result = await diagnosticsService.clearLocationDiagnostics();

      if (!result.success) {
        addLog(`Location diagnostics clear error: ${result.message}`);
        return;
      }

      setLocationDiagnostics([]);
      addLog('Cleared location diagnostics');
    } catch (error) {
      addLog(`Location diagnostics clear error: ${error.message}`);
    }
  };

  const uploadDiagnostics = async () => {
    try {
      const result = await diagnosticsService.uploadDiagnosticBundle();

      if (!result.success) {
        addLog(`Upload diagnostics error: ${result.message || 'unknown error'}`);
        return;
      }

      addLog(`Uploaded diagnostics bundle; remaining queued logs: ${result.remaining}`);
    } catch (error) {
      addLog(`Upload diagnostics error: ${error.message}`);
    }
  };

  const resetBackgroundLocationTask = () => {
    Alert.alert(
      'Reset Background Task',
      'This stops the current location job and starts it again only if an active session is stored on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              const [sessionId, trackingActive] = await Promise.all([
                AsyncStorage.getItem(SESSION_ID_KEY),
                isTracking(),
              ]);

              await stopTracking();

              const parsedSessionId = parseInt(sessionId, 10);
              if (!Number.isNaN(parsedSessionId) && parsedSessionId > 0) {
                await startTracking();
                addLog(`Background task reset for session ${parsedSessionId}`);
              } else {
                addLog('Background task stopped; no active session ID found');
              }

              await diagnosticsService.appendLocationDiagnostic(
                'debug_task_reset',
                {
                  stored_session_id: sessionId,
                  was_tracking: trackingActive,
                },
                { source: 'debug_screen', force: true }
              );
              await captureLocationSnapshot();
            } catch (error) {
              addLog(`Reset task error: ${error.message}`);
              await diagnosticsService.appendLocationDiagnostic(
                'debug_task_reset_failed',
                { message: error.message, stack: error.stack || null },
                { source: 'debug_screen', force: true }
              );
            }
          }
        }
      ]
    );
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

  const formatDiagnosticEntry = (entry) => {
    const timestamp = entry.timestamp || 'unknown';
    const source = entry.source || 'unknown';
    const event = entry.event || entry.type || entry.name || 'diagnostic';
    const details = entry.details || entry.message || entry.raw || {};
    const detailText =
      typeof details === 'string' ? details : JSON.stringify(details);

    return `[${timestamp}] ${source}:${event} ${detailText.slice(0, 500)}`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Debug Screen</Text>
      <Text style={styles.diagnosticStatusText}>{getDiagnosticsStatusText()}</Text>

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

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={enableLocationDiagnostics}>
          <Text style={styles.buttonText}>Enable Diag</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={disableLocationDiagnostics}>
          <Text style={styles.buttonText}>Disable</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={captureLocationSnapshot}>
          <Text style={styles.buttonText}>Snapshot</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={readLocationDiagnostics}>
          <Text style={styles.buttonText}>Read Diag</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={uploadDiagnostics}>
          <Text style={styles.buttonText}>Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={clearLocationDiagnostics}>
          <Text style={styles.buttonText}>Clear Diag</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.warningButton]} onPress={resetBackgroundLocationTask}>
          <Text style={styles.buttonText}>Reset Task</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={refreshDiagnosticsStatus}>
          <Text style={styles.buttonText}>Status</Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location Diagnostics ({locationDiagnostics.length})</Text>
        {locationDiagnosticsPath ? (
          <Text style={styles.metaText} numberOfLines={1}>
            {locationDiagnosticsPath}
          </Text>
        ) : null}
        <ScrollView style={styles.pointsContainer}>
          {locationDiagnostics.length === 0 ? (
            <Text style={styles.emptyText}>No location diagnostics found.</Text>
          ) : (
            locationDiagnostics.map((entry, index) => (
              <Text key={index} style={styles.pointText}>
                {formatDiagnosticEntry(entry)}
              </Text>
            ))
          )}
        </ScrollView>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a'
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center'
  },
  diagnosticStatusText: {
    color: '#d1d5db',
    fontSize: 12,
    marginBottom: 12,
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
  warningButton: {
    backgroundColor: '#92400e'
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center'
  },
  section: {
    marginTop: 12,
    minHeight: 120
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
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 8,
    maxHeight: 160
  },
  logText: {
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 4
  },
  pointsContainer: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 8,
    maxHeight: 160
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
