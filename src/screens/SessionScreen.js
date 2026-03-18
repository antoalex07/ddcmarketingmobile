import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { sessionService } from '../services/SessionService';
import { requestLocationPermissions, openSettings, openLocationSettings, checkLocationStatus } from '../utils/locationPermissions';
import { startTracking, stopTracking, isTracking } from '../services/TrackingController';
import { uploadUnsyncedLocations } from '../services/LocationUploader';
import { promptBatteryOptimization } from '../utils/batteryOptimization';

const SESSION_ID_KEY = 'active_session_id';

const SessionScreen = ({ navigation }) => {
  const { user, token, logout, staffData } = useAuth();
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [loading, setLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const toValidDate = (value) => {
    if (!value) {
      return new Date();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  // Recovery effect - restore session state from backend and local fallback
  useEffect(() => {
    const recoverSession = async () => {
      let storedSessionId = null;

      try {
        storedSessionId = await AsyncStorage.getItem(SESSION_ID_KEY);

        if (token) {
          const response = await sessionService.getActiveSession(token);

          if (response.success && response.session) {
            const activeSessionId = response.session.sessionId;
            await AsyncStorage.setItem(SESSION_ID_KEY, String(activeSessionId));

            setSessionId(activeSessionId);
            setSessionActive(true);
            setSessionStartTime(toValidDate(response.session.startedAt));

            const trackingActive = await isTracking();
            if (!trackingActive) {
              await startTracking();
            }
            return;
          }

          if (response.success && !response.session) {
            await AsyncStorage.removeItem(SESSION_ID_KEY);
            const trackingActive = await isTracking();
            if (trackingActive) {
              await stopTracking();
            }
            setSessionActive(false);
            setSessionId(null);
            setSessionStartTime(null);
            setElapsedTime(0);
            return;
          }
        }

        if (storedSessionId) {
          const parsedStoredSessionId = parseInt(storedSessionId, 10);
          if (!Number.isNaN(parsedStoredSessionId)) {
            setSessionId(parsedStoredSessionId);
            setSessionActive(true);
            setSessionStartTime(new Date());

            const trackingActive = await isTracking();
            if (!trackingActive) {
              await startTracking();
            }
            return;
          }

          await AsyncStorage.removeItem(SESSION_ID_KEY);
        }

        setSessionActive(false);
        setSessionId(null);
        setSessionStartTime(null);
        setElapsedTime(0);
      } catch (error) {
        if (storedSessionId) {
          const parsedStoredSessionId = parseInt(storedSessionId, 10);
          if (!Number.isNaN(parsedStoredSessionId)) {
            setSessionId(parsedStoredSessionId);
            setSessionActive(true);
            setSessionStartTime(new Date());
          }
        }
      }
    };

    recoverSession();
  }, [token]);

  // Upload safety net - attempt upload on app open for any leftover unsynced points
  useEffect(() => {
    const uploadLeftoverPoints = async () => {
      if (!token) return;

      try {
        const result = await uploadUnsyncedLocations(token);
        if (result.uploaded > 0) {
        }
        if (result.failed > 0) {
        }
      } catch (error) {
      }
    };

    uploadLeftoverPoints();
  }, [token]);

  // Periodic upload retry during active session (every 5 minutes)
  useEffect(() => {
    if (!sessionActive || !token) return;

    const RETRY_INTERVAL_MS = 1 * 60 * 1000; // 5 minutes

    const retryUpload = async () => {
      try {
        const result = await uploadUnsyncedLocations(token);
        if (result.uploaded > 0) {
        }
      } catch (error) {
      }
    };

    const interval = setInterval(retryUpload, RETRY_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionActive, token]);

  // Timer effect
  useEffect(() => {
    let interval;
    if (sessionActive && sessionStartTime) {
      interval = setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now - sessionStartTime) / 1000);
        setElapsedTime(diff);
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [sessionActive, sessionStartTime]);

  // Location status monitoring - check every 10 seconds during active session
  useEffect(() => {
    if (!sessionActive) return;

    let alertShown = false; // Prevent multiple alerts

    const checkLocation = async () => {
      try {
        const status = await checkLocationStatus();

        // Only show alert if not already shown and location is not functional
        if (!status.isFullyFunctional && !alertShown) {
          alertShown = true;

          if (!status.servicesEnabled) {
            // GPS is turned off
            Alert.alert(
              'Location Services Disabled',
              'Location services have been turned off. Please enable GPS to continue tracking your session.',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                  onPress: () => {
                    alertShown = false; // Allow another alert after dismissal
                  }
                },
                {
                  text: 'Enable Location',
                  onPress: () => {
                    openLocationSettings();
                    alertShown = false; // Allow checking again after user returns
                  }
                }
              ]
            );
          } else if (!status.permissionsGranted) {
            // Permissions were revoked
            Alert.alert(
              'Location Permission Required',
              'Location permissions have been revoked. Please grant location permissions to continue tracking.',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                  onPress: () => {
                    alertShown = false;
                  }
                },
                {
                  text: 'Open Settings',
                  onPress: () => {
                    openSettings();
                    alertShown = false;
                  }
                }
              ]
            );
          }
        } else if (status.isFullyFunctional) {
          // Reset alert flag when location is working again
          alertShown = false;
        }
      } catch (error) {
      }
    };

    // Initial check
    checkLocation();

    // Check every 10 seconds
    const interval = setInterval(checkLocation, 10000);

    return () => clearInterval(interval);
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
      // Request location permissions first
      const { granted, canAskAgain, locationDisabled, error } = await requestLocationPermissions();

      if (!granted) {
        if (locationDisabled) {
          Alert.alert(
            'Location Disabled',
            error,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Enable Location', onPress: openLocationSettings }
            ]
          );
        } else if (!canAskAgain) {
          Alert.alert(
            'Permission Required',
            `${error}. Please enable location permissions in settings.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: openSettings }
            ]
          );
        } else {
          Alert.alert('Permission Required', error);
        }
        setLoading(false);
        return;
      }

      const result = await sessionService.startSession(token);

      if (result.success) {
        let activeSession = {
          sessionId: result.sessionId,
          startedAt: result.startedAt,
        };

        const activeSessionResult = await sessionService.getActiveSession(token);
        if (activeSessionResult.success && activeSessionResult.session) {
          activeSession = activeSessionResult.session;
        }

        if (!activeSession.sessionId) {
          Alert.alert('Error', 'Session started but could not read active session details.');
          return;
        }

        await AsyncStorage.setItem(SESSION_ID_KEY, String(activeSession.sessionId));
        await startTracking();
        setSessionId(activeSession.sessionId);
        setSessionActive(true);
        setSessionStartTime(toValidDate(activeSession.startedAt));
        setElapsedTime(0);

        // Prompt for battery optimization on first session
        const hasPrompted = await AsyncStorage.getItem('battery_optimization_prompted');
        if (!hasPrompted) {
          await AsyncStorage.setItem('battery_optimization_prompted', 'true');
          setTimeout(() => promptBatteryOptimization(), 1000);
        }

        Alert.alert('Success', 'Work session started successfully');
      } else {
        if (result.status === 409) {
          const activeSessionResponse = await sessionService.getActiveSession(token);

          if (activeSessionResponse.success && activeSessionResponse.session) {
            const activeSessionId = activeSessionResponse.session.sessionId;
            await AsyncStorage.setItem(SESSION_ID_KEY, String(activeSessionId));
            const trackingActive = await isTracking();
            if (!trackingActive) {
              await startTracking();
            }
            setSessionId(activeSessionId);
            setSessionActive(true);
            setSessionStartTime(toValidDate(activeSessionResponse.session.startedAt));
            setElapsedTime(0);
            Alert.alert('Session Active', 'Found your active session. You can now stop it.');
            return;
          }
        }

        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSession = async () => {
    Alert.alert(
      'Stop Session',
      'Are you sure you want to end this work session?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);

            try {
              // 1. Stop tracking first to prevent new points
              await stopTracking();

              // 2. Upload all pending points
              const uploadResult = await uploadUnsyncedLocations(token);

              // 3. Mark session complete on backend
              const result = await sessionService.stopSession(token);

              if (result.success) {
                // 4. Clear local state
                await AsyncStorage.removeItem(SESSION_ID_KEY);
                setSessionActive(false);
                setSessionId(null);
                setSessionStartTime(null);
                setElapsedTime(0);

                // 5. Navigate to report screen
                navigation.navigate('Report', {
                  sessionId: result.data.sessionId,
                  startedAt: result.data.startedAt,
                  endedAt: result.data.endedAt,
                  uploaded: uploadResult.uploaded,
                  failed: uploadResult.failed,
                });
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to stop session. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    if (sessionActive) {
      Alert.alert(
        'Cannot Logout',
        'You have an active session. Please stop your session before logging out.',
        [
          {
            text: 'OK',
            style: 'default',
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.replace('Login');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.userInfoContainer}>
          <View style={styles.userInfoContent}>
            <View style={styles.userInfoDetails}>
              <Text style={styles.welcomeText}>Welcome,</Text>
              <Text style={styles.userName}>
                {staffData?.staff_name || user?.userName}
              </Text>
              {staffData ? (
                <>
                  {staffData.staff_email ? (
                    <Text style={styles.userMeta}>✉  {staffData.staff_email}</Text>
                  ) : null}
                  {staffData.staff_phone ? (
                    <Text style={styles.userMeta}>📞  {staffData.staff_phone}</Text>
                  ) : null}
                  {staffData.staff_region ? (
                    <Text style={styles.userMeta}>📍  {staffData.staff_region}{staffData.staff_area ? ` · ${staffData.staff_area}` : ''}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.userRole}>Role ID: {user?.roleId}</Text>
              )}
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
              <View
                style={[
                  styles.statusIndicator,
                  sessionActive ? styles.activeIndicator : styles.inactiveIndicator,
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  sessionActive ? styles.activeText : styles.inactiveText,
                ]}
              >
                {sessionActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          {sessionActive && (
            <View style={styles.timerCard}>
              <Text style={styles.timerLabel}>Session Duration</Text>
              <Text style={styles.timerText}>{formatTime(elapsedTime)}</Text>
              {sessionId && (
                <Text style={styles.sessionIdText}>Session ID: {sessionId}</Text>
              )}
            </View>
          )}

          <View style={styles.buttonContainer}>
            {!sessionActive ? (
              <TouchableOpacity
                style={[styles.button, styles.startButton, loading && styles.buttonDisabled]}
                onPress={handleStartSession}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Start Session</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.stopButton, loading && styles.buttonDisabled]}
                onPress={handleStopSession}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Stop Session</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.appointmentsButton}
          onPress={() => navigation.navigate('Appointments')}
        >
          <Text style={styles.appointmentsButtonText}>View Appointments</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.debugButton}
          onPress={() => navigation.navigate('Debug')}
        >
          <Text style={styles.debugButtonText}>Debug</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  userInfoContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  userInfoContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userInfoDetails: {
    flex: 1,
    marginRight: 12,
  },
  logoutButtonTop: {
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutButtonTopDisabled: {
    backgroundColor: '#fca5a5',
    opacity: 0.6,
  },
  logoutButtonTopText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  logoutButtonTopTextDisabled: {
    color: '#fff',
  },
  welcomeText: {
    fontSize: 16,
    color: '#6b7280',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 4,
  },
  userRole: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  userMeta: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  sessionContainer: {
    marginBottom: 20,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  activeIndicator: {
    backgroundColor: '#10b981',
  },
  inactiveIndicator: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
  },
  activeText: {
    color: '#10b981',
  },
  inactiveText: {
    color: '#ef4444',
  },
  timerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  timerLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  timerText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2563eb',
    fontVariant: ['tabular-nums'],
  },
  sessionIdText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
  },
  buttonContainer: {
    marginTop: 4,
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#10b981',
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  appointmentsButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  appointmentsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  debugButton: {
    marginTop: 12,
    padding: 10,
    alignItems: 'center',
  },
  debugButtonText: {
    color: '#9ca3af',
    fontSize: 12,
  },
});

export default SessionScreen;
