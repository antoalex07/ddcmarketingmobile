import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { appointmentService } from '../services/AppointmentService';

const CLIENT_TYPE_LABELS = { 0: 'Doctor', 1: 'Hospital', 2: 'Clinic' };

const AppointmentCreateScreen = ({ navigation, route }) => {
  const { user, token, staffId, staffData } = useAuth();
  const { clientType, clientId, clientName } = route.params || {};

  // Date picker state
  const [appointmentDate, setAppointmentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Time picker state
  const [timeFromDate, setTimeFromDate] = useState(null);
  const [timeToDate, setTimeToDate] = useState(null);
  const [showTimeFromPicker, setShowTimeFromPicker] = useState(false);
  const [showTimeToPicker, setShowTimeToPicker] = useState(false);

  const [loading, setLoading] = useState(false);

  const formatDateDisplay = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatTimeDisplay = (date) => {
    if (!date) return '';
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  const handleCreate = async () => {
    if (!timeFromDate || !timeToDate) {
      Alert.alert('Missing Information', 'Please select Time From and Time To.');
      return;
    }

    setLoading(true);

    try {
      const resolvedStaffId = staffId ?? user?.userId;
      const resolvedStaffName = staffData?.staff_name || user?.userName || '';

      const payload = {
        staff_id: resolvedStaffId,
        staff_name: resolvedStaffName,
        client_type: clientType,
        client_id: clientId,
        client_name: clientName,
        appointment_date: formatDateDisplay(appointmentDate),
        time_from: formatTimeDisplay(timeFromDate),
        time_to: formatTimeDisplay(timeToDate),
        userid: user?.userId,
        assigned_userid: resolvedStaffId,
        assigned_staffname: resolvedStaffName,
      };

      const result = await appointmentService.createAppointment(token, payload);

      if (result.success) {
        Alert.alert('Success', 'Appointment created successfully!', [
          { text: 'OK', onPress: () => navigation.navigate('Appointments') },
        ]);
      } else {
        Alert.alert('Error', result.message || 'Failed to create appointment');
      }
    } catch (error) {
      Alert.alert('Error', "Couldn't save appointment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>

        {/* Client Summary Card (read-only) */}
        <View style={styles.clientCard}>
          <Text style={styles.clientCardLabel}>Client</Text>
          <View style={styles.clientCardRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>
                {CLIENT_TYPE_LABELS[clientType] ?? '—'}
              </Text>
            </View>
            <Text style={styles.clientCardName}>{clientName ?? '—'}</Text>
          </View>
        </View>

        {/* Appointment Date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Appointment Date *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>{formatDateDisplay(appointmentDate)}</Text>
            <Text style={styles.dateButtonIcon}>📅</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={appointmentDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={(event, date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (date) setAppointmentDate(date);
              }}
            />
          )}
        </View>

        {/* Time From */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Time From *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowTimeFromPicker(true)}
          >
            <Text style={timeFromDate ? styles.dateButtonText : styles.timePlaceholder}>
              {timeFromDate ? formatTimeDisplay(timeFromDate) : 'Select start time'}
            </Text>
            <Text style={styles.dateButtonIcon}>🕐</Text>
          </TouchableOpacity>
          {showTimeFromPicker && (
            <DateTimePicker
              value={timeFromDate || new Date()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowTimeFromPicker(Platform.OS === 'ios');
                if (date) setTimeFromDate(date);
              }}
            />
          )}
        </View>

        {/* Time To */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Time To *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowTimeToPicker(true)}
          >
            <Text style={timeToDate ? styles.dateButtonText : styles.timePlaceholder}>
              {timeToDate ? formatTimeDisplay(timeToDate) : 'Select end time'}
            </Text>
            <Text style={styles.dateButtonIcon}>🕐</Text>
          </TouchableOpacity>
          {showTimeToPicker && (
            <DateTimePicker
              value={timeToDate || new Date()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowTimeToPicker(Platform.OS === 'ios');
                if (date) setTimeToDate(date);
              }}
            />
          )}
        </View>

        {/* Staff info (informational, not editable) */}
        <View style={styles.staffInfoCard}>
          <Text style={styles.staffInfoLabel}>Assigned Staff</Text>
          <Text style={styles.staffInfoValue}>
            {staffData?.staff_name || user?.userName || '—'}
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Create Appointment</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  clientCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 3,
  },
  clientCardLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  clientCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '700',
  },
  clientCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dateButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '500',
  },
  dateButtonIcon: {
    fontSize: 18,
  },
  timePlaceholder: {
    fontSize: 15,
    color: '#9ca3af',
    fontWeight: '500',
  },
  staffInfoCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  staffInfoLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  staffInfoValue: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AppointmentCreateScreen;
