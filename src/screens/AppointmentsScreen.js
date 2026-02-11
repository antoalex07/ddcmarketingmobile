import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../context/AuthContext';
import { appointmentService } from '../services/AppointmentService';
import { getAllLocalAppointments, getUnsyncedCount, getUnsyncedAppointments, checkForDuplicates } from '../db/appointmentDB';
import { uploadUnsyncedAppointments } from '../services/AppointmentUploader';

const AppointmentsScreen = ({ navigation }) => {
  const { token, user } = useAuth();
  const [staffDetails, setStaffDetails] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      console.log('Starting to fetch data...');
      console.log('Token available:', !!token);
      const staffResult = await appointmentService.getStaffDetails(token);

      if (!staffResult.success) {
        console.error('Staff fetch failed:', staffResult.message);
        Alert.alert(
          'Error Loading Staff',
          `${staffResult.message}\n\nPlease check the logs for the full URL being called.`
        );
        setLoading(false);
        return;
      }

      console.log('Staff data received:', staffResult.data);
      setStaffDetails(staffResult.data.staff);

      const appointmentsResult = await appointmentService.getAppointments(
        token,
        staffResult.data.staff.staff_id
      );

      if (appointmentsResult.success) {
        // Merge backend appointments with local unsynced appointments
        const backendAppointments = appointmentsResult.data.appointments || [];
        const localAppointments = await getAllLocalAppointments();

        // Filter local appointments to only show unsynced ones
        const unsyncedLocal = localAppointments.filter(a => a.synced === 0);

        // Mark local appointments with a _isLocal flag for UI differentiation
        const markedLocal = unsyncedLocal.map(a => ({ ...a, _isLocal: true }));

        // Merge: backend appointments first, then unsynced local at end
        const merged = [...backendAppointments, ...markedLocal];
        setAppointments(merged);

        // Update unsynced count
        const count = await getUnsyncedCount();
        setUnsyncedCount(count);
      } else {
        console.error('Appointments fetch failed:', appointmentsResult.message);

        // When backend fetch fails (offline), still show local appointments
        const localAppointments = await getAllLocalAppointments();
        setAppointments(localAppointments.map(a => ({ ...a, _isLocal: a.synced === 0 })));

        const count = await getUnsyncedCount();
        setUnsyncedCount(count);

        Alert.alert(
          'Offline Mode',
          'Could not load appointments from server. Showing local appointments only.'
        );
      }
    } catch (error) {
      console.error('Unexpected error in fetchData:', error);
      Alert.alert('Error', `Failed to load data: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      // Per user decision: check for duplicates before syncing and warn worker
      const unsynced = await getUnsyncedAppointments();
      const duplicates = [];
      for (const appt of unsynced) {
        const dupes = await checkForDuplicates(
          appt.appoint_clientautoid,
          appt.appoint_appointmentdate,
          appt.appoint_timefrom
        );
        // If checkForDuplicates returns matches OTHER than the current appointment
        if (dupes && dupes.length > 1) {
          duplicates.push(appt);
        }
      }

      if (duplicates.length > 0) {
        // Warn worker about potential duplicates before proceeding
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            'Possible Duplicates Found',
            `${duplicates.length} appointment${duplicates.length !== 1 ? 's' : ''} may be duplicates (same client, date, and similar time). Sync anyway?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Sync Anyway', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) {
          setSyncing(false);
          return;
        }
      }

      const result = await uploadUnsyncedAppointments(token);
      if (result.failed > 0) {
        Alert.alert('Sync Incomplete', `Couldn't sync ${result.failed} appointment${result.failed !== 1 ? 's' : ''}. Will retry later.`);
      } else if (result.uploaded > 0) {
        Alert.alert('Sync Complete', `${result.uploaded} appointment${result.uploaded !== 1 ? 's' : ''} synced successfully.`);
      }
      fetchData(); // Refresh list
    } catch (error) {
      Alert.alert('Sync Error', 'Couldn\'t sync appointments. Check your connection.');
    } finally {
      setSyncing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // NetInfo auto-sync listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && state.isInternetReachable && !syncing && token) {
        const count = await getUnsyncedCount();
        if (count > 0) {
          setSyncing(true);
          try {
            await uploadUnsyncedAppointments(token);
            // Refresh the list after sync
            fetchData();
          } catch (err) {
            console.error('Auto-sync failed:', err);
          } finally {
            setSyncing(false);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [token, syncing, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 0:
        return '#ef4444'; // Red - Cancelled/Inactive
      case 1:
        return '#3b82f6'; // Blue - Scheduled
      case 2:
        return '#10b981'; // Green - Completed
      case 3:
        return '#f59e0b'; // Orange - In Progress
      default:
        return '#6b7280'; // Gray - Unknown
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 0:
        return 'Cancelled';
      case 1:
        return 'Scheduled';
      case 2:
        return 'Completed';
      case 3:
        return 'In Progress';
      default:
        return 'Unknown';
    }
  };

  const renderAppointmentItem = ({ item }) => (
    <TouchableOpacity
      style={styles.appointmentCard}
      onPress={() => {
        navigation.navigate('AppointmentUpdate', { appointment: item });
      }}
    >
      <View style={styles.appointmentHeader}>
        <Text style={styles.clientName} numberOfLines={1}>
          {item.appoint_clientname}
        </Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.appoint_status) },
          ]}
        >
          <Text style={styles.statusText}>{getStatusText(item.appoint_status)}</Text>
        </View>
      </View>

      <View style={styles.appointmentDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📅</Text>
          <Text style={styles.detailText}>
            {formatDate(item.appoint_appointmentdate)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>🕒</Text>
          <Text style={styles.detailText}>
            {formatTime(item.appoint_timefrom)} - {formatTime(item.appoint_timeto)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📍</Text>
          <Text style={styles.detailText} numberOfLines={2}>
            {item.appoint_clientaddress}
          </Text>
        </View>

        {item.appoint_assignedstaffname && (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>👤</Text>
            <Text style={styles.detailText}>
              {item.appoint_assignedstaffname}
            </Text>
          </View>
        )}
      </View>

      {item._isLocal && item.retry_count >= 3 ? (
        <View style={styles.syncFailedBadge}>
          <Text style={styles.syncFailedText}>Failed to sync</Text>
        </View>
      ) : item._isLocal ? (
        <View style={styles.syncPendingBadge}>
          <Text style={styles.syncPendingText}>Pending sync</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading appointments...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <>
            {staffDetails && (
              <View style={styles.staffHeader}>
                <Text style={styles.staffLabel}>Staff Details</Text>
                <Text style={styles.staffName}>{staffDetails.staff_name}</Text>
                <View style={styles.staffInfoRow}>
                  <Text style={styles.staffInfo}>Code: {staffDetails.staff_code}</Text>
                  {staffDetails.staff_status === 1 && (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>Active</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.staffContact}>📧 {staffDetails.staff_email}</Text>
                <Text style={styles.staffContact}>📱 {staffDetails.staff_mobile}</Text>
              </View>
            )}
            {unsyncedCount > 0 && (
              <TouchableOpacity
                style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
                onPress={handleManualSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.syncButtonText}>
                    Sync {unsyncedCount} Pending Appointment{unsyncedCount !== 1 ? 's' : ''}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        }
        data={appointments}
        renderItem={renderAppointmentItem}
        keyExtractor={(item) => item._isLocal ? `local-${item.id}` : item.appoint_id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No appointments found</Text>
          </View>
        }
      />
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  listContent: {
    padding: 16,
  },
  staffHeader: {
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
  staffLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  staffName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  staffInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  staffInfo: {
    fontSize: 14,
    color: '#6b7280',
    marginRight: 12,
  },
  activeBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  staffContact: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 3,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  appointmentDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailIcon: {
    fontSize: 16,
    marginRight: 8,
    width: 20,
  },
  detailText: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
  },
  syncButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  syncButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  syncPendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  syncPendingText: {
    fontSize: 11,
    color: '#92400e',
    fontWeight: '500',
  },
  syncFailedBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  syncFailedText: {
    fontSize: 11,
    color: '#991b1b',
    fontWeight: '500',
  },
});

export default AppointmentsScreen;
