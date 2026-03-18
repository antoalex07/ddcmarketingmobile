import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { appointmentService } from '../services/AppointmentService';

const AppointmentUpdateScreen = ({ route, navigation }) => {
  const { appointment } = route.params;
  const { token } = useAuth();

  const [followUpDate, setFollowUpDate] = useState(
    appointment.appoint_followupdate ? new Date(appointment.appoint_followupdate) : null
  );
  const [followUpTimeFrom, setFollowUpTimeFrom] = useState(
    appointment.appoint_followuptimefrom || ''
  );
  const [followUpTimeTo, setFollowUpTimeTo] = useState(
    appointment.appoint_followuptimeto || ''
  );
  const [meetingNotes, setMeetingNotes] = useState(appointment.appoint_update || '');
  const [status, setStatus] = useState(appointment.appoint_status);

  // Store original values to track changes
  const originalValues = {
    followUpDate: appointment.appoint_followupdate,
    followUpTimeFrom: appointment.appoint_followuptimefrom || '',
    followUpTimeTo: appointment.appoint_followuptimeto || '',
    meetingNotes: appointment.appoint_update || '',
    status: appointment.appoint_status,
  };

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimeFromPicker, setShowTimeFromPicker] = useState(false);
  const [showTimeToPicker, setShowTimeToPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const statusOptions = [
    { value: 0, label: 'Pending', color: '#f59e0b' },
    { value: 1, label: 'Completed', color: '#10b981' },
  ];

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (date) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const formatTimeForDisplay = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFollowUpDate(selectedDate);
    }
  };

  const handleTimeFromChange = (event, selectedTime) => {
    setShowTimeFromPicker(false);
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      setFollowUpTimeFrom(`${hours}:${minutes}`);
    }
  };

  const handleTimeToChange = (event, selectedTime) => {
    setShowTimeToPicker(false);
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      setFollowUpTimeTo(`${hours}:${minutes}`);
    }
  };

  const parseTimeToDate = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10));
    date.setMinutes(parseInt(minutes, 10));
    return date;
  };

  const handleSubmit = async () => {
    // Check if any changes were made
    const currentFollowUpDate = followUpDate ? formatDate(followUpDate) : null;
    const originalFollowUpDate = originalValues.followUpDate
      ? formatDate(new Date(originalValues.followUpDate))
      : null;

    const hasChanges =
      currentFollowUpDate !== originalFollowUpDate ||
      followUpTimeFrom !== originalValues.followUpTimeFrom ||
      followUpTimeTo !== originalValues.followUpTimeTo ||
      meetingNotes !== originalValues.meetingNotes ||
      status !== originalValues.status;

    if (!hasChanges) {
      Alert.alert('No Changes', 'Please make at least one change before submitting');
      return;
    }

    setLoading(true);

    try {
      // Build payload with only fields that have values
      const payload = {
        appoint_id: appointment.appoint_id,
        appoint_status: status,
      };

      // Only add optional fields if they have actual values
      if (followUpDate) {
        payload.appoint_followupdate = formatDate(followUpDate);
      }
      if (followUpTimeFrom) {
        payload.appoint_followuptimefrom = followUpTimeFrom;
      }
      if (followUpTimeTo) {
        payload.appoint_followuptimeto = followUpTimeTo;
      }
      if (meetingNotes && meetingNotes.trim()) {
        payload.appoint_update = meetingNotes.trim();
      }

      console.log('Submitting appointment update with payload:', payload);
      const result = await appointmentService.updateAppointment(token, payload);

      if (result.success) {
        Alert.alert('Success', 'Appointment updated successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        console.error('Update failed:', result.message);
        Alert.alert('Error', result.message || 'Failed to update appointment');
      }
    } catch (error) {
      console.error('Unexpected error during update:', error);
      Alert.alert('Error', `Failed to update appointment: ${error.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Appointment Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Appointment Details</Text>
          <Text style={styles.clientName}>{appointment.appoint_clientname}</Text>
          <Text style={styles.infoText}>
            📅 {formatDisplayDate(new Date(appointment.appoint_appointmentdate))}
          </Text>
          <Text style={styles.infoText}>
            🕒 {formatTimeForDisplay(appointment.appoint_timefrom)} -{' '}
            {formatTimeForDisplay(appointment.appoint_timeto)}
          </Text>
          {appointment.appoint_clientaddress && (
            <Text style={styles.infoText}>📍 {appointment.appoint_clientaddress}</Text>
          )}
        </View>

        {/* Status Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Update Status</Text>
          <View style={styles.statusGrid}>
            {statusOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.statusOption,
                  status === option.value && {
                    backgroundColor: option.color,
                    borderColor: option.color,
                  },
                ]}
                onPress={() => setStatus(option.value)}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    status === option.value && styles.statusOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Meeting Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Meeting Notes</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={6}
            value={meetingNotes}
            onChangeText={setMeetingNotes}
            placeholder="Enter what happened at the meeting..."
            placeholderTextColor="#9ca3af"
            textAlignVertical="top"
          />
        </View>

        {/* Follow-up Date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Follow-up Date</Text>
          <View style={styles.inputWithClear}>
            <TouchableOpacity
              style={[styles.dateInput, styles.dateInputWithClear]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.dateInputText, !followUpDate && styles.placeholderText]}>
                {followUpDate ? `📅 ${formatDisplayDate(followUpDate)}` : 'Select follow-up date (optional)'}
              </Text>
            </TouchableOpacity>
            {followUpDate && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setFollowUpDate(null)}
              >
                <Text style={styles.clearButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {showDatePicker && (
            <DateTimePicker
              value={followUpDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}
        </View>

        {/* Follow-up Time From */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Follow-up Time From</Text>
          <View style={styles.inputWithClear}>
            <TouchableOpacity
              style={[styles.dateInput, styles.dateInputWithClear]}
              onPress={() => setShowTimeFromPicker(true)}
            >
              <Text style={[styles.dateInputText, !followUpTimeFrom && styles.placeholderText]}>
                {followUpTimeFrom ? `🕒 ${formatTimeForDisplay(followUpTimeFrom)}` : 'Select start time (optional)'}
              </Text>
            </TouchableOpacity>
            {followUpTimeFrom && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setFollowUpTimeFrom('')}
              >
                <Text style={styles.clearButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {showTimeFromPicker && (
            <DateTimePicker
              value={followUpTimeFrom ? parseTimeToDate(followUpTimeFrom) : new Date()}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeFromChange}
            />
          )}
        </View>

        {/* Follow-up Time To */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Follow-up Time To</Text>
          <View style={styles.inputWithClear}>
            <TouchableOpacity
              style={[styles.dateInput, styles.dateInputWithClear]}
              onPress={() => setShowTimeToPicker(true)}
            >
              <Text style={[styles.dateInputText, !followUpTimeTo && styles.placeholderText]}>
                {followUpTimeTo ? `🕒 ${formatTimeForDisplay(followUpTimeTo)}` : 'Select end time (optional)'}
              </Text>
            </TouchableOpacity>
            {followUpTimeTo && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setFollowUpTimeTo('')}
              >
                <Text style={styles.clearButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {showTimeToPicker && (
            <DateTimePicker
              value={followUpTimeTo ? parseTimeToDate(followUpTimeTo) : new Date()}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeToChange}
            />
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Update Appointment</Text>
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
  },
  infoCard: {
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
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  clientName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusOption: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statusOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  statusOptionTextActive: {
    color: '#fff',
  },
  textArea: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 120,
  },
  inputWithClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dateInputWithClear: {
    flex: 1,
  },
  dateInputText: {
    fontSize: 14,
    color: '#1f2937',
  },
  placeholderText: {
    color: '#9ca3af',
  },
  clearButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
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

export default AppointmentUpdateScreen;
