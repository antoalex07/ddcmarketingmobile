import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { errorLogService } from '../services/errorLogService';

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

  // Restore persisted auth + staff on app start
  useEffect(() => {
    const restoreAuth = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('token');
        const storedUser = await AsyncStorage.getItem('user');
        const storedStaff = await AsyncStorage.getItem('staff_data');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          errorLogService.flushPendingLogs();
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

  const login = async (userData, authToken) => {
    try {
      await AsyncStorage.setItem('token', authToken);
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setToken(authToken);
      setUser(userData);
      errorLogService.flushPendingLogs();
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
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('staff_data');
      setToken(null);
      setUser(null);
      setStaffData(null);
    } catch (error) {
    }
  };

  const loadStoredAuth = async () => {
    try {
      setLoading(true);
      const storedToken = await AsyncStorage.getItem('token');
      const storedUser = await AsyncStorage.getItem('user');
      const storedStaff = await AsyncStorage.getItem('staff_data');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        errorLogService.flushPendingLogs();
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
