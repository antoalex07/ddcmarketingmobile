import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ReportScreen = ({ navigation, route }) => {
  const { sessionId, startedAt, endedAt, uploaded, failed } = route.params || {};

  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const calculateDuration = () => {
    if (!startedAt || !endedAt) return '-';
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    const diffMs = end - start;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDone = () => {
    navigation.navigate('Session');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerContainer}>
          <Text style={styles.headerText}>Session Complete</Text>
          <Text style={styles.sessionIdText}>Session #{sessionId}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Time Summary</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Started</Text>
            <Text style={styles.value}>{formatDateTime(startedAt)}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Ended</Text>
            <Text style={styles.value}>{formatDateTime(endedAt)}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Duration</Text>
            <Text style={styles.valueHighlight}>{calculateDuration()}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location Data</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Points Uploaded</Text>
            <Text style={[styles.value, styles.successText]}>{uploaded || 0}</Text>
          </View>

          {failed > 0 && (
            <View style={styles.row}>
              <Text style={styles.label}>Failed Uploads</Text>
              <Text style={[styles.value, styles.errorText]}>{failed}</Text>
            </View>
          )}
        </View>

        {failed > 0 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Some location points failed to upload. They will be synced when you start your next session.
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleDone}>
          <Text style={styles.buttonText}>Done</Text>
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
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 4,
  },
  sessionIdText: {
    fontSize: 14,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
  },
  value: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  valueHighlight: {
    fontSize: 18,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  successText: {
    color: '#10b981',
  },
  errorText: {
    color: '#ef4444',
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 13,
    color: '#92400e',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 'auto',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReportScreen;
