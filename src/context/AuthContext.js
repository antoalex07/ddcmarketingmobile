import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hardStopTracking } from '../services/TrackingController';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [staffData, setStaffData] = useState(null);

  const clearAuthState = () => {
    setToken(null);
    setUser(null);
    setStaffData(null);
  };

  const clearAuthStorage = async () => {
    const [stopTrackingResult, clearStorageResult] = await Promise.allSettled([
      hardStopTracking('logout'),
      Promise.all([
        AsyncStorage.removeItem('user'),
        AsyncStorage.removeItem('staff_data'),
        AsyncStorage.removeItem('active_session_id'),
        AsyncStorage.removeItem('session_start_time'),
        AsyncStorage.removeItem('session_end_time'),
      ]),
    ]);

    if (stopTrackingResult.status === 'rejected') {
      console.warn('Failed to stop tracking during auth cleanup', stopTrackingResult.reason);
    }

    if (clearStorageResult.status === 'rejected') {
      throw clearStorageResult.reason;
    }
  };

  // Restore persisted auth + staff on app start
  useEffect(() => {
    const restoreAuth = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        const storedStaff = await AsyncStorage.getItem('staff_data');

        if (storedUser) {
          setToken('local-debug-token');
          setUser(JSON.parse(storedUser));
        }
        if (storedStaff) {
          setStaffData(JSON.parse(storedStaff));
        }
      } catch (error) {
        // Unable to restore — user will need to log in again
      } finally {
        setLoading(false);
      }
    };

    restoreAuth();
  }, []);

  const login = async (userData, authToken = 'local-debug-token') => {
    try {
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setToken(authToken);
      setUser(userData);
    } catch (error) {
      throw error;
    }
  };

  const setStaffInfo = async (staff) => {
    try {
      await AsyncStorage.setItem('staff_data', JSON.stringify(staff));
      setStaffData(staff);
    } catch (error) {
      // Non-fatal: staff info will be missing but app can still function
    }
  };

  const logout = async () => {
    try {
      await clearAuthStorage();
      clearAuthState();
    } catch (error) {
      await clearAuthStorage();
      clearAuthState();
    }
  };

  const loadStoredAuth = async () => {
    try {
      setLoading(true);
      const storedUser = await AsyncStorage.getItem('user');
      const storedStaff = await AsyncStorage.getItem('staff_data');

      if (storedUser) {
        setToken('local-debug-token');
        setUser(JSON.parse(storedUser));
      }
      if (storedStaff) {
        setStaffData(JSON.parse(storedStaff));
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    token,
    loading,
    staffData,
    staffId: staffData?.staff_id ?? null,
    login,
    setStaffInfo,
    logout,
    loadStoredAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
