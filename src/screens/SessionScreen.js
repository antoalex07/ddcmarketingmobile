import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { sessionService } from '../services/SessionService';
import {
  requestLocationPermissions,
  openSettings,
  openLocationSettings,
  checkLocationStatus,
} from '../utils/locationPermissions';
import {
  startTracking,
  hardStopTracking,
  isTracking,
  reconcileLocationTrackingState,
  getTrackingPreconditionStatus,
} from '../services/TrackingController';
import { promptBatteryOptimization } from '../utils/batteryOptimization';

const SESSION_ID_KEY = 'active_session_id';
const SESSION_START_KEY = 'session_start_time';

const SessionScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [loading, setLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRestoring, setIsRestoring] = useState(true);
  const [locationHealthy, setLocationHealthy] = useState(true);
  const [recoveryMessage, setRecoveryMessage] = useState(null);

  const resetSessionUiState = () => {
    setSessionActive(false);
    setSessionId(null);
    setSessionStartTime(null);
    setElapsedTime(0);
  };

  const clearLocalSessionState = async () => {
    await hardStopTracking('session_screen_clear_local_state');
    resetSessionUiState();
  };

  const toValidDate = (value) => {
    if (!value) {
      return new Date();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  useEffect(() => {
    const restoreSession = async () => {
      setIsRestoring(true);
      try {
        const reconciliation = await reconcileLocationTrackingState('session_screen_restore');
        if (reconciliation.changed && !reconciliation.valid) {
          setRecoveryMessage('Location permission changed. Tracking was stopped; grant permissions before starting a new session.');
          resetSessionUiState();
          return;
        }

        const response = await sessionService.getActiveSession();
        if (response.success && response.session) {
          const preconditions = await getTrackingPreconditionStatus();
          if (!preconditions.valid) {
            await clearLocalSessionState();
            setRecoveryMessage('Location permissions or services are unavailable. Grant permissions before starting a new session.');
            return;
          }

          const activeSession = response.session;
          setSessionActive(true);
          setSessionId(activeSession.sessionId);
          setSessionStartTime(toValidDate(activeSession.startedAt));

          const trackingActive = await isTracking();
          if (!trackingActive) {
            await startTracking();
          }
        } else {
          await clearLocalSessionState();
        }
      } catch (error) {
        await clearLocalSessionState();
        setRecoveryMessage('Session restore failed. Tracking was stopped locally.');
      } finally {
        setIsRestoring(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    let interval;
    if (sessionActive && sessionStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - sessionStartTime.getTime()) / 1000));
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [sessionActive, sessionStartTime]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState !== 'active') {
        return;
      }

      const reconciliation = await reconcileLocationTrackingState('app_foreground');
      if (reconciliation.changed && !reconciliation.valid) {
        resetSessionUiState();
        setLocationHealthy(false);
        setRecoveryMessage('Location permission changed. Tracking was stopped; grant permissions before starting a new session.');
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!sessionActive) {
      setLocationHealthy(true);
      return undefined;
    }

    let cancelled = false;
    const checkLocation = async () => {
      try {
        const status = await checkLocationStatus();
        if (!cancelled) {
          setLocationHealthy(Boolean(status.isFullyFunctional));
          if (!status.isFullyFunctional) {
            await hardStopTracking('active_session_location_invalid');
            resetSessionUiState();
            setRecoveryMessage('Location permission changed. Tracking was stopped; grant permissions before starting a new session.');

            if (!status.servicesEnabled) {
              Alert.alert(
                'Location Services Disabled',
                'Tracking was stopped. Enable location services before starting a new session.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: openLocationSettings },
                ]
              );
            } else if (!status.permissionsGranted) {
              Alert.alert(
                'Location Permission Required',
                'Tracking was stopped. Grant location permissions before starting a new session.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: openSettings },
                ]
              );
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLocationHealthy(false);
        }
      }
    };

    checkLocation();
    const interval = setInterval(checkLocation, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionActive]);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartSession = async () => {
    setLoading(true);

    try {
      const { granted, canAskAgain, locationDisabled, error } = await requestLocationPermissions();
      setRecoveryMessage(null);

      if (!granted) {
        if (locationDisabled) {
          Alert.alert('Location Disabled', error, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enable Location', onPress: openLocationSettings },
          ]);
        } else if (!canAskAgain) {
          Alert.alert('Permission Required', `${error}. Please enable location permissions.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openSettings },
          ]);
        } else {
          Alert.alert('Permission Required', error);
        }
        return;
      }

      const result = await sessionService.startSession();
      if (!result.success) {
        Alert.alert('Error', result.message || 'Failed to start session');
        return;
      }

      const activeSession = {
        sessionId: result.sessionId,
        startedAt: result.startedAt,
      };

      await AsyncStorage.multiSet([
        [SESSION_ID_KEY, String(activeSession.sessionId)],
        [SESSION_START_KEY, activeSession.startedAt],
      ]);

      try {
        await startTracking();
      } catch (trackingError) {
        await clearLocalSessionState();
        Alert.alert(
          'Error',
          trackingError?.message || 'Started the session but could not enable tracking'
        );
        return;
      }

      setSessionId(activeSession.sessionId);
      setSessionActive(true);
      setSessionStartTime(toValidDate(activeSession.startedAt));
      setElapsedTime(0);

      const hasPrompted = await AsyncStorage.getItem('battery_optimization_prompted');
      if (!hasPrompted) {
        await AsyncStorage.setItem('battery_optimization_prompted', 'true');
        setTimeout(() => promptBatteryOptimization(), 1000);
      }

      Alert.alert('Success', 'Local session started');
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSession = async () => {
    Alert.alert('Stop Session', 'End this local work session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const result = await sessionService.stopSession();
            await hardStopTracking('session_screen_stop_session');
            await clearLocalSessionState();

            if (result.success) {
              navigation.navigate('Report', {
                sessionId: result.data.sessionId,
                startedAt: result.data.startedAt,
                endedAt: result.data.endedAt,
                uploaded: 0,
                failed: 0,
              });
              return;
            }

            Alert.alert('Session Ended', result.message || 'Session cleared locally');
          } catch (error) {
            Alert.alert('Error', error?.message || 'Failed to stop session');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    if (sessionActive) {
      Alert.alert('Cannot Logout', 'Stop the session first.');
      return;
    }

    Alert.alert('Logout', 'Leave the local debugger?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.replace('Login');
        },
      },
    ]);
  };

  if (isRestoring) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.userInfoContainer}>
          <View style={styles.userInfoContent}>
            <View style={styles.userInfoDetails}>
              <Text style={styles.welcomeText}>Welcome,</Text>
              <Text style={styles.userName}>{user?.userName || 'Local Debug'}</Text>
              <Text style={styles.userRole}>Offline session mode</Text>
            </View>

            <TouchableOpacity
              style={[styles.logoutButtonTop, sessionActive && styles.logoutButtonTopDisabled]}
              onPress={handleLogout}
              disabled={sessionActive}
            >
              <Text style={[styles.logoutButtonTopText, sessionActive && styles.logoutButtonTopTextDisabled]}>
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sessionContainer}>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Session Status</Text>
            <View style={styles.statusBadge}>
              <View style={[styles.statusIndicator, sessionActive ? styles.activeIndicator : styles.inactiveIndicator]} />
              <Text style={[styles.statusText, sessionActive ? styles.activeText : styles.inactiveText]}>
                {sessionActive ? 'Active' : 'Inactive'}
              </Text>
            </View>

            {sessionActive && (
              <View style={styles.sessionDetails}>
                <Text style={styles.sessionIdText}>Session ID: {sessionId}</Text>
                <Text style={styles.elapsedText}>{formatTime(elapsedTime)}</Text>
                <Text style={styles.metaText}>
                  Location: {locationHealthy ? 'OK' : 'Needs attention'}
                </Text>
              </View>
            )}

            {!sessionActive && recoveryMessage ? (
              <Text style={styles.recoveryText}>{recoveryMessage}</Text>
            ) : null}
          </View>

          <View style={styles.buttonGrid}>
            {!sessionActive ? (
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleStartSession}
                disabled={loading}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Starting...' : 'Start Session'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.stopButton, loading && styles.buttonDisabled]}
                onPress={handleStopSession}
                disabled={loading}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Stopping...' : 'Stop Session'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('Debug')}
            >
              <Text style={styles.secondaryButtonText}>Debug</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  userInfoContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  userInfoContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  userInfoDetails: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
    color: '#6b7280',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  userRole: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  logoutButtonTop: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutButtonTopDisabled: {
    backgroundColor: '#fca5a5',
  },
  logoutButtonTopText: {
    color: '#fff',
    fontWeight: '600',
  },
  logoutButtonTopTextDisabled: {
    color: '#fee2e2',
  },
  sessionContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    elevation: 2,
  },
  statusLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  activeIndicator: {
    backgroundColor: '#22c55e',
  },
  inactiveIndicator: {
    backgroundColor: '#9ca3af',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '700',
  },
  activeText: {
    color: '#16a34a',
  },
  inactiveText: {
    color: '#6b7280',
  },
  sessionDetails: {
    marginTop: 20,
  },
  sessionIdText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  elapsedText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  metaText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  recoveryText: {
    color: '#92400e',
    fontSize: 13,
    marginTop: 16,
  },
  buttonGrid: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default SessionScreen;
