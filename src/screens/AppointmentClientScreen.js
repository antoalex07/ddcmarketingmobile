import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { appointmentService } from '../services/AppointmentService';
import MapPickerModal from '../components/MapPickerModal';

// client_type numbers: 0 = Doctor, 1 = Hospital, 2 = Clinic
const CLIENT_TYPES = [
  { label: 'Doctor', value: 0 },
  { label: 'Hospital', value: 1 },
  { label: 'Clinic', value: 2 },
];

// ─── Existing Client Tab ──────────────────────────────────────────────────────

const ExistingClientTab = ({ navigation, staffId, token }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClients, setLoadingClients] = useState(false);

  const fetchClients = async (typeValue) => {
    setSelectedType(typeValue);
    setSelectedClient(null);
    setClients([]);
    setLoadingClients(true);
    try {
      let result;
      if (typeValue === 0) {
        result = await appointmentService.getDoctorsByStaff(token, staffId);
        if (result.success) setClients(result.data?.doctors || []);
      } else if (typeValue === 1) {
        result = await appointmentService.getHospitalsByStaff(token, staffId);
        if (result.success) setClients(result.data?.hospitals || []);
      } else {
        result = await appointmentService.getClinicsByStaff(token, staffId);
        if (result.success) setClients(result.data?.clinics || []);
      }
      if (!result.success) {
        Alert.alert('Error', result.message || 'Failed to fetch clients');
      }
    } catch {
      Alert.alert('Error', 'Failed to fetch clients');
    } finally {
      setLoadingClients(false);
    }
  };

  const getClientId = (item) => {
    if (selectedType === 0) return item.doctor_id;
    if (selectedType === 1) return item.hosp_id;
    return item.clinic_id;
  };

  const getClientName = (item) => {
    if (selectedType === 0) return item.doctor_name;
    if (selectedType === 1) return item.hosp_name;
    return item.clinic_name;
  };

  const handleConfirm = () => {
    if (!selectedClient) {
      Alert.alert('Select a client', 'Please tap on a client from the list to select them.');
      return;
    }
    navigation.navigate('AppointmentCreate', {
      clientType: selectedType,
      clientId: getClientId(selectedClient),
      clientName: getClientName(selectedClient),
    });
  };

  return (
    <View style={styles.tabContent}>
      <FlatList
        data={clients}
        keyExtractor={(item, index) => String(getClientId(item) ?? index)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.flatListContent}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionLabel}>Select Type</Text>
            <View style={styles.typeRow}>
              {CLIENT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeBtn, selectedType === t.value && styles.typeBtnActive]}
                  onPress={() => fetchClients(t.value)}
                >
                  <Text style={[styles.typeBtnText, selectedType === t.value && styles.typeBtnTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loadingClients && (
              <View style={styles.centeredLoader}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loaderText}>Fetching clients…</Text>
              </View>
            )}

            {!loadingClients && selectedType !== null && clients.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No clients found for this category.</Text>
              </View>
            )}

            {!loadingClients && clients.length > 0 && (
              <Text style={styles.sectionLabel}>
                {CLIENT_TYPES[selectedType].label}s under your territory
              </Text>
            )}
          </>
        }
        renderItem={({ item }) => {
          const isSelected =
            selectedClient && getClientId(selectedClient) === getClientId(item);
          return (
            <TouchableOpacity
              style={[styles.clientItem, isSelected && styles.clientItemSelected]}
              onPress={() => setSelectedClient(item)}
            >
              <View style={styles.clientItemRow}>
                <View style={[styles.radioCircle, isSelected && styles.radioCircleFilled]} />
                <Text style={[styles.clientItemText, isSelected && styles.clientItemTextSelected]}>
                  {getClientName(item)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <>
            {selectedClient && (
              <View style={styles.selectionSummary}>
                <Text style={styles.selectionSummaryLabel}>Selected:</Text>
                <Text style={styles.selectionSummaryValue}>{getClientName(selectedClient)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.confirmBtn, !selectedClient && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!selectedClient}
            >
              <Text style={styles.confirmBtnText}>Confirm &amp; Continue →</Text>
            </TouchableOpacity>
          </>
        }
      />
    </View>
  );
};

// ─── New Client Tab ───────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { id: 1, label: 'Male' },
  { id: 2, label: 'Female' },
  { id: 3, label: 'Other' },
];

const NewClientTab = ({ navigation, staffId, userId, token }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = React.useRef(null);

  // Unified form state
  const [form, setForm] = useState({});
  const update = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  // Cascading location dropdowns
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  useEffect(() => {
    const fetchCountries = async () => {
      setLoadingCountries(true);
      try {
        const result = await appointmentService.getCountries(token);
        if (result.success) setCountries(result.data?.countries || []);
      } catch {}
      setLoadingCountries(false);
    };
    if (token) fetchCountries();
  }, [token]);

  const handleCountrySelect = async (country) => {
    setSelectedCountry(country);
    setSelectedState(null);
    setSelectedDistrict(null);
    setStates([]);
    setDistricts([]);
    if (!country) return;
    setLoadingStates(true);
    try {
      const result = await appointmentService.getStates(token, country.cntry_id);
      if (result.success) setStates(result.data?.states || []);
    } catch {}
    setLoadingStates(false);
  };

  const handleStateSelect = async (state) => {
    setSelectedState(state);
    setSelectedDistrict(null);
    setDistricts([]);
    if (!state) return;
    setLoadingDistricts(true);
    try {
      const result = await appointmentService.getDistricts(token, state.state_id);
      if (result.success) setDistricts(result.data?.districts || []);
    } catch {}
    setLoadingDistricts(false);
  };

  const resetForm = () => {
    setForm({});
    setSelectedCountry(null);
    setSelectedState(null);
    setSelectedDistrict(null);
    setStates([]);
    setDistricts([]);
  };

  const handleTypeSelect = (typeValue) => {
    resetForm();
    setSelectedType(typeValue);
  };

  // Return entered value or fallback default
  const v = (key, fallback = 'N/A') => {
    const val = (form[key] || '').trim();
    return val || fallback;
  };

  const handleSubmit = async () => {
    if (!v('name', '')) {
      Alert.alert('Missing Name', 'Please enter the name.');
      return;
    }
    if (!v('coords', '')) {
      Alert.alert('Missing Coordinates', 'Please pick a location on the map.');
      return;
    }

    const countryId = selectedCountry?.cntry_id || 1;
    const stateId = selectedState?.state_id || 1;
    const districtId = selectedDistrict?.district_id || 1;
    const trimmedName = v('name', '');

    setLoading(true);
    try {
      let result;

      if (selectedType === 0) {
        const genderVal = form.gender?.id ?? 1;
        result = await appointmentService.createDoctor(token, {
          doctor_name: trimmedName,
          doctor_qualification: v('qualification'),
          doctor_mobile: v('mobile'),
          doctor_email: v('email'),
          doctor_gender: genderVal,
          doctor_address: v('address'),
          doctor_countryname: countryId,
          doctor_statename: stateId,
          doctor_districtname: districtId,
          doctor_pin: v('pin'),
          doctor_coordinates: v('coords', ''),
          doctor_servedby: staffId,
          doctor_introby: userId,
          doctor_status: 1,
          doctor_crtby: userId,
        });
      } else if (selectedType === 1) {
        result = await appointmentService.createHospital(token, {
          hospital_name: trimmedName,
          hospital_code: v('code'),
          contact: v('contact'),
          country: countryId,
          state: stateId,
          district: districtId,
          address: v('address'),
          pincode: v('pincode'),
          coordinates: v('coords', ''),
          email: v('email'),
          website: v('website'),
          hospital_servedby: staffId,
          introby: userId,
          userid: userId,
        });
      } else {
        result = await appointmentService.createClinic(token, {
          clinic_name: trimmedName,
          clinic_code: v('code'),
          contact: v('contact'),
          country: countryId,
          state: stateId,
          district: districtId,
          address: v('address'),
          pincode: v('pincode'),
          coordinates: v('coords', ''),
          email: v('email'),
          website: v('website'),
          clinic_servedby: staffId,
          introby: userId,
          userid: userId,
        });
      }

      if (result.success) {
        const typeLabel = CLIENT_TYPES[selectedType].label;
        const clientId =
          selectedType === 0 ? result.data?.doctor_id :
          selectedType === 1 ? result.data?.hosp_id :
          result.data?.clinic_id;

        Alert.alert(`${typeLabel} Added`, `${trimmedName} has been added successfully.`, [
          {
            text: 'Continue to Appointment',
            onPress: () =>
              navigation.navigate('AppointmentCreate', {
                clientType: selectedType,
                clientId: clientId ?? null,
                clientName: trimmedName,
              }),
          },
        ]);
      } else {
        Alert.alert('Error', result.message || 'Failed to add client');
      }
    } catch {
      Alert.alert('Error', 'Failed to add client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.sectionLabel}>Select Type</Text>
        <View style={styles.typeRow}>
          {CLIENT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeBtn, selectedType === t.value && styles.typeBtnActive]}
              onPress={() => handleTypeSelect(t.value)}
            >
              <Text style={[styles.typeBtnText, selectedType === t.value && styles.typeBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedType !== null && (
          <View>
            {/* ── Text fields ── */}
            <Field
              label={`${CLIENT_TYPES[selectedType].label} Name`}
              value={form.name || ''}
              onChangeText={(t) => update('name', t)}
              required
            />

            {selectedType === 0 && (
              <Field
                label="Qualification"
                value={form.qualification || ''}
                onChangeText={(t) => update('qualification', t)}
              />
            )}

            {(selectedType === 1 || selectedType === 2) && (
              <Field
                label={`${CLIENT_TYPES[selectedType].label} Code`}
                value={form.code || ''}
                onChangeText={(t) => update('code', t)}
              />
            )}

            <Field
              label="Address"
              value={form.address || ''}
              onChangeText={(t) => update('address', t)}
              multiline
            />

            {/* ── Contact fields ── */}
            <Field
              label={selectedType === 0 ? 'Mobile' : 'Contact'}
              value={form[selectedType === 0 ? 'mobile' : 'contact'] || ''}
              onChangeText={(t) => update(selectedType === 0 ? 'mobile' : 'contact', t)}
              keyboardType="phone-pad"
            />

            <Field
              label="Email"
              value={form.email || ''}
              onChangeText={(t) => update('email', t)}
              keyboardType="email-address"
            />

            {(selectedType === 1 || selectedType === 2) && (
              <Field
                label="Website"
                value={form.website || ''}
                onChangeText={(t) => update('website', t)}
                keyboardType="url"
              />
            )}

            {/* ── Numeric fields ── */}
            <Field
              label={selectedType === 0 ? 'PIN Code' : 'Pincode'}
              value={form[selectedType === 0 ? 'pin' : 'pincode'] || ''}
              onChangeText={(t) => update(selectedType === 0 ? 'pin' : 'pincode', t)}
              keyboardType="numeric"
            />

            {/* ── Gender (doctor only) ── */}
            {selectedType === 0 && (
              <DropdownField
                label="Gender"
                items={GENDER_OPTIONS}
                selectedItem={form.gender || null}
                onSelect={(g) => update('gender', g)}
                displayKey="label"
                placeholder="Select gender"
              />
            )}

            {/* ── Location dropdowns ── */}
            <DropdownField
              label="Country"
              items={countries}
              selectedItem={selectedCountry}
              onSelect={handleCountrySelect}
              displayKey="cntry_name"
              loading={loadingCountries}
              placeholder="Select a country"
            />

            <DropdownField
              label="State"
              items={states}
              selectedItem={selectedState}
              onSelect={handleStateSelect}
              displayKey="state_name"
              loading={loadingStates}
              placeholder={selectedCountry ? 'Select a state' : 'Select country first'}
              disabled={!selectedCountry}
            />

            <DropdownField
              label="District"
              items={districts}
              selectedItem={selectedDistrict}
              onSelect={(d) => setSelectedDistrict(d)}
              displayKey="district_name"
              loading={loadingDistricts}
              placeholder={selectedState ? 'Select a district' : 'Select state first'}
              disabled={!selectedState}
            />

            {/* ── Map picker ── */}
            <CoordField value={form.coords || ''} onChange={(c) => update('coords', c)} required />

            <SubmitBtn
              label={`Add ${CLIENT_TYPES[selectedType].label} & Continue →`}
              onPress={handleSubmit}
              loading={loading}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ─── Coordinate picker field ──────────────────────────────────────────────────

const CoordField = ({ value, onChange, required }) => {
  const [modalVisible, setModalVisible] = useState(false);
  return (
    <>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Coordinates{required ? ' *' : ''}</Text>
        <TouchableOpacity
          style={styles.coordPickerBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={value ? styles.coordPickerValue : styles.coordPickerPlaceholder}>
            {value || 'Tap to pick from map'}
          </Text>
          <Text style={styles.coordPickerIcon}>🗺</Text>
        </TouchableOpacity>
      </View>
      <MapPickerModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={(coords) => { onChange(coords); setModalVisible(false); }}
        initialCoords={value}
      />
    </>
  );
};

// ─── Dropdown Field ───────────────────────────────────────────────────────────

const DropdownField = ({ label, items, selectedItem, onSelect, displayKey, loading, placeholder, disabled }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? items.filter((item) => item[displayKey]?.toLowerCase().includes(search.toLowerCase()))
    : items;

  const handleSelect = (item) => {
    onSelect(item);
    setModalVisible(false);
    setSearch('');
  };

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.dropdownBtn, disabled && styles.dropdownBtnDisabled]}
          onPress={() => { if (!disabled) setModalVisible(true); }}
          disabled={disabled}
        >
          <Text style={selectedItem ? styles.dropdownValue : styles.dropdownPlaceholder}>
            {loading ? 'Loading…' : selectedItem ? selectedItem[displayKey] : (placeholder || `Select ${label}`)}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.dropdownModalOverlay}>
          <View style={styles.dropdownModalContent}>
            <View style={styles.dropdownModalHeader}>
              <Text style={styles.dropdownModalTitle}>Select {label}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setSearch(''); }}>
                <Text style={styles.dropdownModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.dropdownSearchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${label.toLowerCase()}…`}
              placeholderTextColor="#9ca3af"
              autoCorrect={false}
            />

            {filtered.length === 0 ? (
              <View style={styles.dropdownEmptyState}>
                <Text style={styles.dropdownEmptyText}>
                  {items.length === 0 ? 'No items available' : 'No matches found'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item, idx) => String(item[Object.keys(item)[0]] ?? idx)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isActive = selectedItem && item[displayKey] === selectedItem[displayKey];
                  return (
                    <TouchableOpacity
                      style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                      onPress={() => handleSelect(item)}
                    >
                      <Text style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]}>
                        {item[displayKey]}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

// ─── Form sub-components ──────────────────────────────────────────────────────

const Field = ({ label, value, onChangeText, placeholder, required, keyboardType, multiline }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>
      {label}{required ? ' *' : ''}
    </Text>
    <TextInput
      style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder || `Enter ${label.toLowerCase()}`}
      placeholderTextColor="#9ca3af"
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  </View>
);

const SubmitBtn = ({ label, onPress, loading }) => (
  <TouchableOpacity
    style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
    onPress={onPress}
    disabled={loading}
  >
    {loading ? (
      <ActivityIndicator color="#fff" />
    ) : (
      <Text style={styles.submitBtnText}>{label}</Text>
    )}
  </TouchableOpacity>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

const AppointmentClientScreen = ({ navigation }) => {
  const { token, staffId, user, setStaffInfo } = useAuth();
  const [activeTab, setActiveTab] = useState('existing');
  const [resolvedStaffId, setResolvedStaffId] = useState(staffId);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState(null);

  // If staffId is null (e.g. app restarted before this screen was hit),
  // re-fetch it using the stored userId
  useEffect(() => {
    if (staffId != null) {
      setResolvedStaffId(staffId);
      return;
    }
    if (!token) return;

    const refetch = async () => {
      setStaffLoading(true);
      setStaffError(null);
      try {
        const result = await appointmentService.getStaffDetails(token);
        if (result.success && result.data?.staff) {
          await setStaffInfo(result.data.staff);
          setResolvedStaffId(result.data.staff.staff_id);
        } else {
          setStaffError('Could not load staff details. Please go back and try again.');
        }
      } catch {
        setStaffError('Could not load staff details. Please go back and try again.');
      } finally {
        setStaffLoading(false);
      }
    };

    refetch();
  }, [staffId, token, user?.userId]);

  if (staffLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredLoader}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loaderText}>Loading staff details…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (staffError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredLoader}>
          <Text style={[styles.loaderText, { color: '#ef4444' }]}>{staffError}</Text>
          <TouchableOpacity style={styles.confirmBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.confirmBtnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBarBtn, activeTab === 'existing' && styles.tabBarBtnActive]}
          onPress={() => setActiveTab('existing')}
        >
          <Text style={[styles.tabBarBtnText, activeTab === 'existing' && styles.tabBarBtnTextActive]}>
            Existing Client
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBarBtn, activeTab === 'new' && styles.tabBarBtnActive]}
          onPress={() => setActiveTab('new')}
        >
          <Text style={[styles.tabBarBtnText, activeTab === 'new' && styles.tabBarBtnTextActive]}>
            New Client
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
          {activeTab === 'existing' ? (
            <ExistingClientTab navigation={navigation} staffId={resolvedStaffId} token={token} />
          ) : (
            <NewClientTab navigation={navigation} staffId={resolvedStaffId} userId={user?.userId} token={token} />
          )}
      </View>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabBarBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabBarBtnActive: {
    borderBottomColor: '#2563eb',
  },
  tabBarBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabBarBtnTextActive: {
    color: '#2563eb',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  flatListContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tabContent: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
    marginTop: 4,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  typeBtnTextActive: {
    color: '#fff',
  },
  centeredLoader: {
    alignItems: 'center',
    marginVertical: 32,
  },
  loaderText: {
    marginTop: 10,
    color: '#6b7280',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    marginVertical: 32,
  },
  emptyStateText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  clientList: {
    maxHeight: 320,
    marginBottom: 12,
  },
  clientItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  clientItemSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  clientItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9ca3af',
    marginRight: 12,
  },
  radioCircleFilled: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  clientItemText: {
    fontSize: 15,
    color: '#1f2937',
    flex: 1,
  },
  clientItemTextSelected: {
    fontWeight: '600',
    color: '#1d4ed8',
  },
  selectionSummary: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionSummaryLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  selectionSummaryValue: {
    fontSize: 14,
    color: '#1d4ed8',
    fontWeight: '700',
    flex: 1,
  },
  confirmBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmBtnDisabled: {
    backgroundColor: '#93c5fd',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // New client form
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  fieldInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  coordPickerBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coordPickerValue: {
    fontSize: 14,
    color: '#1f2937',
    flex: 1,
  },
  coordPickerPlaceholder: {
    fontSize: 14,
    color: '#9ca3af',
    flex: 1,
  },
  coordPickerIcon: {
    fontSize: 18,
    marginLeft: 8,
  },
  submitBtn: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Dropdown styles
  dropdownBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownBtnDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  dropdownValue: {
    fontSize: 14,
    color: '#1f2937',
    flex: 1,
  },
  dropdownPlaceholder: {
    fontSize: 14,
    color: '#9ca3af',
    flex: 1,
  },
  dropdownArrow: {
    fontSize: 10,
    color: '#9ca3af',
    marginLeft: 8,
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  dropdownModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  dropdownModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  dropdownModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
  },
  dropdownModalClose: {
    fontSize: 18,
    color: '#6b7280',
    paddingHorizontal: 8,
  },
  dropdownSearchInput: {
    margin: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  dropdownEmptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  dropdownEmptyText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownItemActive: {
    backgroundColor: '#eff6ff',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#1f2937',
  },
  dropdownItemTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
});

export default AppointmentClientScreen;
