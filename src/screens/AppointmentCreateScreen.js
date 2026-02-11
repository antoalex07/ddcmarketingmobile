import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { insertAppointment } from '../db/appointmentDB';

const AppointmentCreateScreen = ({ navigation }) => {
  const { user } = useAuth();

  const [clientName, setClientName] = useState('');
  const [clientType, setClientType] = useState('doctor');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const clientTypeOptions = [
    { value: 'doctor', label: 'Doctor' },
    { value: 'clinic', label: 'Clinic' },
    { value: 'hospital', label: 'Hospital' },
  ];

  const handleCreate = async () => {
    // Basic validation: all required fields must be filled
    if (!clientName.trim() || !appointmentDate.trim() || !timeFrom.trim() || !timeTo.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields (Client Name, Date, Time From, Time To).');
      return;
    }

    setLoading(true);

    try {
      const appointmentData = {
        appoint_userid: user?.userid || user?.id,
        appoint_staffname: user?.staffname || user?.name || '',
        appoint_assigneduserid: user?.userid || user?.id,
        appoint_assignedstaffname: user?.staffname || user?.name || '',
        appoint_clientname: clientName.trim(),
        appoint_clienttype: clientType,
        appoint_clientautoid: 0,    // No client ID in Phase 1, Phase 2 adds client selection
        appoint_clientaddress: '',   // Phase 2 adds address from client record
        appoint_appointmentdate: appointmentDate.trim(),
        appoint_timefrom: timeFrom.trim(),
        appoint_timeto: timeTo.trim(),
        appoint_notes: notes.trim(),
        appoint_status: 1,           // 1 = Scheduled
        appoint_crtdby: user?.staffname || user?.name || '',
        appoint_crton: new Date().toISOString(),
      };

      await insertAppointment(appointmentData);

      Alert.alert(
        'Success',
        'Appointment created! It will sync when you\'re online.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error creating appointment:', error);
      Alert.alert('Error', 'Couldn\'t save appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Client Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Client Name *</Text>
          <TextInput
            style={styles.input}
            value={clientName}
            onChangeText={setClientName}
            placeholder="Enter client name"
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Client Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Client Type *</Text>
          <View style={styles.clientTypeGrid}>
            {clientTypeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.clientTypeOption,
                  clientType === option.value && styles.clientTypeOptionActive,
                ]}
                onPress={() => setClientType(option.value)}
              >
                <Text
                  style={[
                    styles.clientTypeOptionText,
                    clientType === option.value && styles.clientTypeOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Appointment Date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Appointment Date *</Text>
          <TextInput
            style={styles.input}
            value={appointmentDate}
            onChangeText={setAppointmentDate}
            placeholder="YYYY-MM-DD (e.g., 2026-02-15)"
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Time From */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Time From *</Text>
          <TextInput
            style={styles.input}
            value={timeFrom}
            onChangeText={setTimeFrom}
            placeholder="HH:MM (e.g., 09:00)"
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Time To */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Time To *</Text>
          <TextInput
            style={styles.input}
            value={timeTo}
            onChangeText={setTimeTo}
            placeholder="HH:MM (e.g., 10:00)"
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes (optional)</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any notes about this appointment..."
            placeholderTextColor="#9ca3af"
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
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
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textArea: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 100,
  },
  clientTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  clientTypeOption: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  clientTypeOptionActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  clientTypeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  clientTypeOptionTextActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#2563eb',
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

export default AppointmentCreateScreen;
