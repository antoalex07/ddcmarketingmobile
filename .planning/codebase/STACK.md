# Technology Stack

**Analysis Date:** 2026-02-10

## Languages

**Primary:**
- JavaScript (ES6+) - All application code and business logic
- XML - Android manifest configuration

**Secondary:**
- Groovy - Android build configuration (`android/app/build.gradle`)

## Runtime

**Environment:**
- React Native 0.81.5 - Native mobile application framework
- Expo ~54.0.32 - Development environment and managed service

**Package Manager:**
- npm (Node Package Manager)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 19.1.0 - UI library for React Native
- React Native 0.81.5 - Cross-platform mobile framework
- Expo 54.0.32 - Development platform and native module hosting

**Navigation:**
- @react-navigation/native ^6.1.9 - Navigation library
- @react-navigation/native-stack ^6.9.17 - Stack-based navigation
- react-native-safe-area-context ~5.6.0 - Safe area utilities
- react-native-screens ~4.16.0 - Native screen components

**Testing:**
- Not detected

**Build/Dev:**
- Expo CLI - Build and deployment tooling
- React Native CLI - Development tooling

## Key Dependencies

**Critical:**
- axios ^1.6.2 - HTTP client for API requests
- @react-native-async-storage/async-storage 2.2.0 - Persistent key-value storage (non-encrypted)
- expo-sqlite ~16.0.10 - Local SQLite database for offline storage
- expo-location ~19.0.8 - GPS and location services with background tracking
- expo-task-manager ~14.0.9 - Background task scheduling and management
- @react-native-community/datetimepicker 8.4.4 - Date/time picker UI component

**Infrastructure:**
- expo-status-bar ~3.0.9 - System status bar styling

## Configuration

**Environment:**
- API endpoint configured in `src/config/api.js`
- Base URL: `http://ddcpharmacy.com/api/`
- Timeout: 30000ms (30 seconds) for network requests
- No .env file detected - configuration hardcoded

**Build:**
- `app.json` - Expo configuration with platform-specific settings
- `android/app/build.gradle` - Android build configuration
- `android/gradle.properties` - Gradle system properties
- `android/app/AndroidManifest.xml` - Android permissions and manifest

**Runtime Configuration:**
- Expo plugins defined in `app.json`:
  - `expo-sqlite` - SQLite module
  - `expo-location` - Location tracking with foreground service
  - `@react-native-community/datetimepicker` - Date picker

## Platform Requirements

**Development:**
- Node.js (via package.json scripts)
- Expo development server
- Android SDK (for Android builds via `expo run:android`)
- Xcode (for iOS builds via `expo run:ios`)

**Production:**
- Android minSdkVersion: configurable (set in gradle.properties)
- targetSdkVersion: configurable (set in gradle.properties)
- App versionCode: 1
- App versionName: 1.0.0
- Package name: com.antoalex07.ddcmarketingmobile (Android)

**Build Environment:**
- Hermes JavaScript engine enabled (`hermesEnabled=true`)
- New React Native architecture enabled (`newArchEnabled=true`)
- Edge-to-edge display support enabled
- PNG crunching in release builds enabled
- Code minification in release builds enabled

**Target Features:**
- Background location tracking via foreground service (Android)
- Background location tracking with UIBackgroundModes (iOS)
- Animated WebP support disabled (iOS compatibility)
- Animated GIF support enabled

---

*Stack analysis: 2026-02-10*
