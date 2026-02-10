# Coding Conventions

**Analysis Date:** 2026-02-10

## Naming Patterns

**Files:**
- PascalCase for screens: `LoginScreen.js`, `SessionScreen.js`, `AppointmentUpdateScreen.js`
- camelCase for utilities and services: `api.js`, `batteryOptimization.js`, `locationPermissions.js`
- camelCase for database modules: `locationDB.js`
- PascalCase for context providers: `AuthContext.js`

**Functions:**
- camelCase for all function names: `handleLogin`, `handleDateChange`, `uploadBatch`, `getUnsyncedPoints`
- Prefix handler functions with `handle`: `handleLogin`, `handleSubmit`, `handleDateChange`
- Prefix utility functions descriptively: `getDatabase`, `insertPoint`, `markAsSynced`, `uploadUnsyncedLocations`
- Hook names follow React convention with `use` prefix: `useAuth`

**Variables:**
- camelCase for all variables: `username`, `password`, `loading`, `token`, `sessionId`
- Boolean flags prefixed with `is` or `show`: `isOptimized`, `showDatePicker`, `loading`, `editable`
- State variables use corresponding setters: `const [username, setUsername] = useState('')`
- Constants in UPPERCASE with underscores: `BATCH_SIZE`, `MAX_RETRIES`, `RETRY_DELAY_MS`, `DATABASE_NAME`, `API_BASE_URL`

**Types:**
- Object property names match API response structure with underscores: `appoint_id`, `appoint_status`, `appoint_followupdate`, `user_id`, `user_name`, `session_id`, `synced`
- Mapped data uses camelCase: `sessionId`, `startedAt`, `endedAt`, `staffDetails`

## Code Style

**Formatting:**
- No explicit linter/formatter configuration detected
- Consistent 2-space indentation observed throughout
- Object properties aligned with readable spacing
- StyleSheet objects organized logically by component section

**Linting:**
- No ESLint or Prettier configuration found
- No pre-commit hooks enforced

## Import Organization

**Order:**
1. React and React Native framework imports
2. Third-party libraries (axios, navigation, context, native modules)
3. Local imports (context, services, utilities, database)
4. Styles (StyleSheet.create)

**Example from `LoginScreen.js`:**
```javascript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/AuthService';
```

**Path Aliases:**
- Relative paths using `../` patterns: `../context/AuthContext`, `../services/AppointmentService`, `../db/locationDB`
- No absolute path aliases configured

## Error Handling

**Patterns:**
- Try-catch blocks for all async operations
- Errors caught and returned as structured response objects with `success` flag
- Response format: `{ success: boolean, message?: string, data?: object }`
- User-facing errors returned in `message` field

**Example from `AppointmentService.js`:**
```javascript
try {
  const response = await api.get('/staff/getstaff', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return {
    success: true,
    data: response.data,
  };
} catch (error) {
  console.error('Error fetching staff details:', {
    message: error.message,
    response: error.response?.data,
    status: error.response?.status,
    code: error.code,
  });
  return {
    success: false,
    message: error.response?.data?.message || error.message || 'Failed to fetch staff details',
  };
}
```

**Silent Catch Blocks:**
- Observed in `AuthContext.js` logout and loadStoredAuth methods where errors are caught but not logged
- Not recommended pattern but currently in use

## Logging

**Framework:** console (console.log, console.error)

**Patterns:**
- Informational logging on operation start: `console.log('Fetching staff details...')`
- Success logging with data: `console.log('Staff details fetched successfully')`
- Error logging with detailed context object: `console.error('Error fetching staff details:', { message, response, status, code })`
- Debug logging in API interceptors showing full request/response details
- Screen component errors logged with context: `console.error('Update failed:', result.message)`

**Example from `api.js`:**
```javascript
console.log('API Request:', {
  method: config.method?.toUpperCase(),
  fullUrl: fullUrl,
  url: config.url,
  baseURL: config.baseURL,
});
```

## Comments

**When to Comment:**
- Minimal comments observed in codebase
- Inline comments used for clarifying non-obvious logic
- Comments explaining constraints or special handling

**JSDoc/TSDoc:**
- No JSDoc comments observed
- Not used in this codebase

**Example from `AppointmentUpdateScreen.js`:**
```javascript
// Store original values to track changes
const originalValues = {
  followUpDate: appointment.appoint_followupdate,
  // ...
};

// Only add optional fields if they have actual values
if (followUpDate) {
  payload.appoint_followupdate = formatDate(followUpDate);
}
```

## Function Design

**Size:**
- Compact functions preferred (under 50 lines typical)
- Larger screen components may exceed 500 lines but structured with clear sections
- Utility functions stay focused on single responsibility

**Parameters:**
- No destructuring from props typically seen
- Named parameters used: `const uploadBatch = async (token, sessionId, points) => {}`
- Object parameters for complex data: `handleLogin(appointmentData)`

**Return Values:**
- Service functions return structured objects: `{ success, message, data }`
- Component functions return JSX
- Utility functions return typed values or null
- Async functions always wrapped in try-catch

**Example from `LocationUploader.js`:**
```javascript
export const uploadUnsyncedLocations = async (token) => {
  const unsyncedPoints = await getUnsyncedPoints();

  if (unsyncedPoints.length === 0) {
    return { uploaded: 0, failed: 0 };
  }

  // Process and return results
  return { uploaded, failed };
};
```

## Module Design

**Exports:**
- Default exports for Screen components: `export default LoginScreen;`
- Named exports for services, utilities, and context: `export const authService = {}`, `export const useAuth = () => {}`
- Single service object export with methods:
  ```javascript
  export const appointmentService = {
    getStaffDetails: async (token) => {},
    getAppointments: async (token, staffId) => {},
    updateAppointment: async (token, appointmentData) => {},
  };
  ```

**Barrel Files:**
- Not used in this codebase
- Direct imports from service/utility modules

**File-Level Constants:**
- Database name at module level: `const DATABASE_NAME = 'locations.db';`
- API configuration at module level: `const API_BASE_URL = 'http://ddcpharmacy.com/api/';`
- State management flags at module level: `let db = null; let tableCreated = false;`

## Screen Component Pattern

**Structure:**
1. Import declarations
2. Component function declaration with props
3. Hook calls (useState, useContext, useFocusEffect)
4. Event handlers
5. Render logic (JSX)
6. StyleSheet.create at bottom
7. Default export

**Example from `LoginScreen.js` (simplified):**
```javascript
const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    // Implementation
  };

  return (
    <KeyboardAvoidingView>
      {/* JSX */}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  // Styles
});

export default LoginScreen;
```

## Service Pattern

**Structure:**
- Exported object with named async methods
- Each method handles API communication and error handling
- Consistent response format across all methods

**Example from `AuthService.js`:**
```javascript
export const authService = {
  login: async (username, password) => {
    try {
      const response = await api.post('/auth/login', {
        user_name: username,
        user_pass: password,
      });
      // Handle success
      return { success: true, data: {...} };
    } catch (error) {
      // Handle error
      return { success: false, message: '...' };
    }
  },
};
```

## Context Provider Pattern

**Structure:**
- Creates context with `createContext()`
- Exports custom hook: `useAuth()` with error checking
- Exports provider component: `AuthProvider({ children })`
- Provider manages state and exposes value object

**Example from `AuthContext.js`:**
```javascript
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

  const value = { user, token, login, logout, loadStoredAuth };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

---

*Convention analysis: 2026-02-10*
