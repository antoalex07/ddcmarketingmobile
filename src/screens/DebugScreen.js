import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUnsyncedPoints } from '../db/locationDB';
import { errorLogService } from '../services/errorLogService';
import { nativeCrashLogService } from '../services/nativeCrashLogService';
import { diagnosticsService } from '../services/diagnosticsService';
import {
  startTracking,
  stopTracking,
  isTracking,
  getTrackingPreconditionStatus,
  reconcileLocationTrackingState,
} from '../services/TrackingController';

const SESSION_ID_KEY = 'active_session_id';
const MAX_VISIBLE_LOGS = 120;

const DebugScreen = () => {
  const [debugLog, setDebugLog] = useState([]);
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
    initializeDebugScreen();
  }, []);

  const addDebugLog = async (message, details = null) => {
    const entry = {
      timestamp: new Date().toISOString(),
      message,
      details,
    };

    setDebugLog((previous) => [entry, ...previous].slice(0, MAX_VISIBLE_LOGS));

    await diagnosticsService.appendLocationDiagnostic(
      'debug_screen_log',
      entry,
      { source: 'debug_screen', force: true }
    );
  };

  const initializeDebugScreen = async () => {
    const logPathResult = nativeCrashLogService.getLogFilePath();
    if (logPathResult.success) {
      setNativeCrashLogPath(logPathResult.path);
    }

    await refreshDiagnosticsStatus();
    await readUnsyncedPoints(false);
    await addDebugLog('Debug screen opened');
  };

  const refreshDiagnosticsStatus = async () => {
    try {
      const status = await diagnosticsService.getLocationDiagnosticsStatus();
      setDiagnosticsStatus(status);

      const filePath = await diagnosticsService.getLocationDiagnosticsFilePath();
      if (filePath) {
        setLocationDiagnosticsPath(filePath);
      } else if (status.path) {
        setLocationDiagnosticsPath(status.path);
      }
    } catch (error) {
      await addDebugLog('Diagnostics status read failed', {
        message: error.message,
      });
    }
  };

  const getDiagnosticsStatusText = () => {
    if (!diagnosticsStatus.enabled) {
      return 'Session diagnostics: Off';
    }

    const enabledUntil = Number(diagnosticsStatus.enabledUntil || 0);
    if (!enabledUntil) {
      return 'Session diagnostics: On';
    }

    return `Session diagnostics: On until ${new Date(enabledUntil).toLocaleString()}`;
  };

  const startSessionDiagnostics = async () => {
    try {
      await diagnosticsService.setLocationDiagnosticsEnabled(true, 24);
      await diagnosticsService.appendLocationDiagnostic(
        'session_debug_started',
        { ttl_hours: 24 },
        { source: 'debug_screen', force: true }
      );
      await refreshDiagnosticsStatus();
      await captureSessionSnapshot('Session diagnostics enabled for 24 hours');
    } catch (error) {
      await addDebugLog('Session diagnostics enable failed', {
        message: error.message,
      });
    }
  };

  const stopSessionDiagnostics = async () => {
    try {
      await diagnosticsService.appendLocationDiagnostic(
        'session_debug_stopped',
        {},
        { source: 'debug_screen', force: true }
      );
      await diagnosticsService.setLocationDiagnosticsEnabled(false);
      await refreshDiagnosticsStatus();
      await addDebugLog('Session diagnostics disabled');
    } catch (error) {
      await addDebugLog('Session diagnostics disable failed', {
        message: error.message,
      });
    }
  };

  const captureSessionSnapshot = async (message = 'Session snapshot captured') => {
    try {
      const snapshot = await diagnosticsService.captureLocationDebugSnapshot();
      await addDebugLog(message, {
        tracking_started: snapshot.tracking_started,
        active_session_id: snapshot.active_session_id,
        unsynced_location_count: snapshot.unsynced_location_count,
        task_defined: snapshot.task_defined,
        task_manager_available: snapshot.task_manager_available,
        location_services_enabled: snapshot.location_services_enabled,
      });
      await readUnsyncedPoints(false);
      await readLocationDiagnostics(false);
      return snapshot;
    } catch (error) {
      await addDebugLog('Session snapshot failed', {
        message: error.message,
      });
      return null;
    }
  };

  const resetBackgroundLocationTask = () => {
    Alert.alert(
      'Reset Background Task',
      'This stops the current Android location job and starts it again only if an active session is stored on this device.',
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
                const preconditions = await getTrackingPreconditionStatus();
                if (!preconditions.valid) {
                  await reconcileLocationTrackingState('debug_reset_invalid_preconditions');
                  await addDebugLog('Background task stopped; tracking preconditions are invalid', {
                    active_session_id: parsedSessionId,
                    preconditions,
                    was_tracking: trackingActive,
                  });
                  await captureSessionSnapshot('Snapshot after invalid background task reset');
                  return;
                }

                await startTracking();
                await addDebugLog('Background task reset and restarted', {
                  active_session_id: parsedSessionId,
                  was_tracking: trackingActive,
                });
              } else {
                await addDebugLog('Background task stopped; no active session ID found', {
                  stored_session_id: sessionId,
                  was_tracking: trackingActive,
                });
              }

              await diagnosticsService.appendLocationDiagnostic(
                'debug_task_reset',
                {
                  stored_session_id: sessionId,
                  was_tracking: trackingActive,
                },
                { source: 'debug_screen', force: true }
              );
              await captureSessionSnapshot('Snapshot after background task reset');
            } catch (error) {
              await addDebugLog('Background task reset failed', {
                message: error.message,
                stack: error.stack || null,
              });
            }
          },
        },
      ]
    );
  };

  const readUnsyncedPoints = async (showLog = true) => {
    try {
      const unsyncedPoints = await getUnsyncedPoints();
      setPoints(unsyncedPoints);
      if (showLog) {
        await addDebugLog(`Read ${unsyncedPoints.length} unsynced location points`);
      }
      return unsyncedPoints;
    } catch (error) {
      await addDebugLog('Unsynced point read failed', {
        message: error.message,
      });
      return [];
    }
  };

  const readNativeCrashLogs = async (showLog = true) => {
    try {
      const result = await nativeCrashLogService.readLogs();

      if (!result.success) {
        await addDebugLog('Native crash log read failed', {
          message: result.message,
        });
        return [];
      }

      setNativeCrashLogs(result.data);
      if (result.path) {
        setNativeCrashLogPath(result.path);
      }
      if (showLog) {
        await addDebugLog(`Read ${result.data.length} native crash logs`);
      }
      return result.data;
    } catch (error) {
      await addDebugLog('Native crash log read failed', {
        message: error.message,
      });
      return [];
    }
  };

  const readLocationDiagnostics = async (showLog = true) => {
    try {
      const result = await diagnosticsService.readLocationDiagnostics();

      if (!result.success) {
        await addDebugLog('Location diagnostics read failed', {
          message: result.message,
        });
        return [];
      }

      setLocationDiagnostics(result.data);
      if (result.path) {
        setLocationDiagnosticsPath(result.path);
      }
      if (showLog) {
        await addDebugLog(`Read ${result.data.length} location diagnostics`);
      }
      return result.data;
    } catch (error) {
      await addDebugLog('Location diagnostics read failed', {
        message: error.message,
      });
      return [];
    }
  };

  const clearDebugEvidence = () => {
    Alert.alert(
      'Clear Debug Evidence',
      'This clears only diagnostic/crash logs shown on this screen. It does not clear app data or the location database.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const [crashResult, diagnosticResult] = await Promise.all([
              nativeCrashLogService.clearLogs(),
              diagnosticsService.clearLocationDiagnostics(),
            ]);

            setNativeCrashLogs([]);
            setLocationDiagnostics([]);
            setDebugLog([]);

            await addDebugLog('Debug evidence cleared', {
              crash_clear_success: crashResult.success,
              diagnostic_clear_success: diagnosticResult.success,
            });
          },
        },
      ]
    );
  };

  const buildCopyReport = async () => {
    const snapshot = await diagnosticsService.captureLocationDebugSnapshot();
    const [crashes, diagnostics, unsyncedPoints, queuedErrors] = await Promise.all([
      readNativeCrashLogs(false),
      readLocationDiagnostics(false),
      readUnsyncedPoints(false),
      errorLogService.readQueuedLogs(),
    ]);

    return {
      copied_at: new Date().toISOString(),
      purpose: 'DDC Marketing active-session null-pointer diagnostic report',
      snapshot,
      screen_log: debugLog,
      native_crash_logs_count: crashes.length,
      native_crash_logs: crashes.slice(0, 25),
      location_diagnostics_count: diagnostics.length,
      location_diagnostics: diagnostics.slice(0, 75),
      queued_error_logs_count: queuedErrors.length,
      queued_error_logs: queuedErrors.slice(0, 25),
      unsynced_location_count: unsyncedPoints.length,
      unsynced_location_preview: unsyncedPoints.slice(0, 20),
    };
  };

  const copyDebugReport = async () => {
    try {
      const report = await buildCopyReport();
      const text = JSON.stringify(report, null, 2);
      const result = await diagnosticsService.copyTextToClipboard(
        'DDC session debug report',
        text
      );

      if (!result.success) {
        await addDebugLog('Copy debug report failed', {
          message: result.message,
        });
        return;
      }

      await addDebugLog('Debug report copied to clipboard', {
        characters: text.length,
      });
    } catch (error) {
      await addDebugLog('Copy debug report failed', {
        message: error.message,
      });
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

  const formatDebugLogEntry = (entry) => {
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : '';
    return `[${entry.timestamp}] ${entry.message}${details}`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Session Debug</Text>
      <Text style={styles.diagnosticStatusText}>{getDiagnosticsStatusText()}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Session Crash Tools</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={startSessionDiagnostics}>
            <Text style={styles.buttonText}>Start Debug</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => captureSessionSnapshot()}>
            <Text style={styles.buttonText}>Snapshot</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={copyDebugReport}>
            <Text style={styles.buttonText}>Copy</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.warningButton]} onPress={resetBackgroundLocationTask}>
            <Text style={styles.buttonText}>Reset Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={stopSessionDiagnostics}>
            <Text style={styles.buttonText}>Stop Debug</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={() => readNativeCrashLogs()}>
            <Text style={styles.buttonText}>Read Crashes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => readLocationDiagnostics()}>
            <Text style={styles.buttonText}>Read Diag</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => readUnsyncedPoints()}>
            <Text style={styles.buttonText}>Read Points</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={clearDebugEvidence}>
            <Text style={styles.buttonText}>Clear Evidence</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={refreshDiagnosticsStatus}>
            <Text style={styles.buttonText}>Status</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Debug Session Log ({debugLog.length})</Text>
        <ScrollView style={styles.logContainer}>
          {debugLog.length === 0 ? (
            <Text style={styles.emptyText}>No debug events yet.</Text>
          ) : (
            debugLog.map((entry, index) => (
              <Text key={index} style={styles.logText}>
                {formatDebugLogEntry(entry)}
              </Text>
            ))
          )}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Unsynced Session Points ({points.length})</Text>
        <ScrollView style={styles.pointsContainer}>
          {points.length === 0 ? (
            <Text style={styles.emptyText}>No unsynced points found.</Text>
          ) : (
            points.map((point, index) => (
              <Text key={index} style={styles.pointText}>
                #{point.id} | S:{point.session_id} | {Number(point.latitude).toFixed(4)}, {Number(point.longitude).toFixed(4)} | {point.timestamp}
              </Text>
            ))
          )}
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
    backgroundColor: '#1a1a1a',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  diagnosticStatusText: {
    color: '#d1d5db',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#8b0000',
  },
  warningButton: {
    backgroundColor: '#92400e',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
  section: {
    marginTop: 12,
    minHeight: 120,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
  },
  logContainer: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 8,
    maxHeight: 180,
  },
  logText: {
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: 11,
    marginBottom: 4,
  },
  pointsContainer: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 8,
    maxHeight: 180,
  },
  pointText: {
    color: '#0ff',
    fontFamily: 'monospace',
    fontSize: 11,
    marginBottom: 2,
  },
  metaText: {
    color: '#9ca3af',
    fontSize: 11,
    marginBottom: 6,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 12,
  },
});

export default DebugScreen;
