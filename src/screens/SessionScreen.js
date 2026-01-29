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
  const { user, token, logout } = useAuth();
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [loading, setLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Recovery effect - restore session state on app restart (hybrid approach)
  useEffect(() => {
    const recoverSession = async () => {
      try {
        const storedSessionId = await AsyncStorage.getItem(SESSION_ID_KEY);

        if (!storedSessionId) {
          return; // No local session to recover
        }

        // 1. Immediately restore UI state (works offline, instant feedback)
        setSessionId(parseInt(storedSessionId, 10));
        setSessionActive(true);

        // 2. Restart tracking if needed
        const trackingActive = await isTracking();
        if (!trackingActive) {
          console.log('Restarting tracking...');
          await startTracking();
        }

        // 3. Try to verify with backend and get actual start time
        if (token) {
          try {
            const response = await sessionService.getActiveSession(token);

            if (response.success && response.session) {
              // Session still active on backend, use actual start time
              setSessionStartTime(new Date(response.session.startedAt));
              console.log('Session verified with backend, start time restored');
            } else if (response.success && !response.session) {
              // Backend says no active session - clean up local state
              console.log('Backend has no active session, cleaning up...');
              await AsyncStorage.removeItem(SESSION_ID_KEY);
              await stopTracking();
              setSessionActive(false);
              setSessionId(null);
              setSessionStartTime(null);
            }
          } catch (networkErr) {
            // Offline - use current time as fallback, will verify later
            setSessionStartTime(new Date());
            console.log('Offline, using local recovery with reset timer');
          }
        } else {
          // No token yet, just use current time
          setSessionStartTime(new Date());
        }
      } catch (error) {
        console.error('Failed to recover session:', error);
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
          console.log(`Startup upload: ${result.uploaded} leftover points uploaded`);
        }
        if (result.failed > 0) {
          console.log(`Startup upload: ${result.failed} points still pending`);
        }
      } catch (error) {
        console.log('Startup upload failed, will retry later:', error.message);
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
          console.log(`Periodic upload: ${result.uploaded} points synced`);
        }
      } catch (error) {
        console.log('Periodic upload failed:', error.message);
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
        console.error('Error checking location status:', error);
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
        await AsyncStorage.setItem(SESSION_ID_KEY, String(result.sessionId));
        await startTracking();
        setSessionId(result.sessionId);
        setSessionActive(true);
        setSessionStartTime(new Date());
        setElapsedTime(0);

        // Prompt for battery optimization on first session
        const hasPrompted = await AsyncStorage.getItem('battery_optimization_prompted');
        if (!hasPrompted) {
          await AsyncStorage.setItem('battery_optimization_prompted', 'true');
          setTimeout(() => promptBatteryOptimization(), 1000);
        }

        Alert.alert('Success', 'Work session started successfully');
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start session. Please try again.');
      console.error('Start session error:', error);
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
              console.log('Upload result:', uploadResult);

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
              console.error('Stop session error:', error);
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
          <Text style={styles.welcomeText}>Welcome,</Text>
          <Text style={styles.userName}>{user?.userName}</Text>
          <Text style={styles.userRole}>Role ID: {user?.roleId}</Text>
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
          style={[styles.logoutButton, sessionActive && styles.logoutButtonDisabled]}
          onPress={handleLogout}
          disabled={sessionActive}
        >
          <Text
            style={[styles.logoutButtonText, sessionActive && styles.logoutButtonTextDisabled]}
          >
            {sessionActive ? 'Logout (Stop session first)' : 'Logout'}
          </Text>
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
  sessionContainer: {
    flex: 1,
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
    marginBottom: 20,
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
  logoutButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  logoutButtonDisabled: {
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
    opacity: 0.6,
  },
  logoutButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButtonTextDisabled: {
    color: '#9ca3af',
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