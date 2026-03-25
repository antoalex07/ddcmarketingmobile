import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { errorLogService } from '../services/errorLogService';
import { tokenStorage } from '../services/tokenStorage';
import { authService } from '../services/AuthService';
import { setApiAuthFailureHandler } from '../config/api';
import { stopTracking } from '../services/TrackingController';

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
      stopTracking(),
      Promise.all([
        tokenStorage.clearTokens(),
        AsyncStorage.removeItem('user'),
        AsyncStorage.removeItem('staff_data'),
        AsyncStorage.removeItem('active_session_id'),
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
    setApiAuthFailureHandler(async () => {
      try {
        await clearAuthStorage();
      } finally {
        clearAuthState();
      }
    });

    const restoreAuth = async () => {
      try {
        const storedToken = await tokenStorage.getAccessToken();
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

    return () => {
      setApiAuthFailureHandler(null);
    };
  }, []);

  const login = async (userData, authToken, refreshToken) => {
    try {
      await tokenStorage.setTokens({
        accessToken: authToken,
        refreshToken,
      });
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
      const refreshToken = await tokenStorage.getRefreshToken();

      if (refreshToken) {
        await authService.logout(refreshToken, token);
      }

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
      const storedToken = await tokenStorage.getAccessToken();
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
