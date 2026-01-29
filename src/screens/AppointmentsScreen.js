import React, { useState, useEffect } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { appointmentService } from '../services/AppointmentService';

const AppointmentsScreen = ({ navigation }) => {
  const { token } = useAuth();
  const [staffDetails, setStaffDetails] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch staff details first
      const staffResult = await appointmentService.getStaffDetails(token);

      if (!staffResult.success) {
        Alert.alert('Error', staffResult.message);
        setLoading(false);
        return;
      }

      setStaffDetails(staffResult.data);

      // Fetch appointments using staff_id
      const appointmentsResult = await appointmentService.getAppointments(
        token,
        staffResult.data.staff_id
      );

      if (appointmentsResult.success) {
        setAppointments(appointmentsResult.data || []);
      } else {
        Alert.alert('Error', appointmentsResult.message);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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
        // Navigate to appointment details if needed
        // navigation.navigate('AppointmentDetail', { appointment: item });
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
          staffDetails && (
            <View style={styles.staffHeader}>
              <Text style={styles.staffLabel}>Staff Details</Text>
              <Text style={styles.staffName}>{staffDetails.staff_name}</Text>
              <View style={styles.staffInfoRow}>
                <Text style={styles.staffInfo}>Code: {staffDetails.staff_code}</Text>
                {staffDetails.staff_status === 1 && (
                  <View style={styles.activebadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                )}
              </View>
              <Text style={styles.staffContact}>📧 {staffDetails.staff_email}</Text>
              <Text style={styles.staffContact}>📱 {staffDetails.staff_mobile}</Text>
            </View>
          )
        }
        data={appointments}
        renderItem={renderAppointmentItem}
        keyExtractor={(item) => item.appoint_id.toString()}
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
});

export default AppointmentsScreen;
