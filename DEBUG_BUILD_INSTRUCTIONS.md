# DDC Marketing Debug Build - Instructions for Remote Users

This is a **lightweight debug-only APK** designed to extract diagnostic logs from devices experiencing issues with the main application.

## What this app does:
- ✅ Opens directly to the Debug screen (no login required)
- ✅ Can read diagnostic logs from the **main app** (if previously installed)
- ✅ Can read native crash logs
- ✅ Can copy all diagnostics to clipboard
- ✅ No background services or location tracking

## When to use:
- Main app keeps crashing or freezing
- Main app won't start
- Need to collect diagnostic data without complex app functionality

## For End Users - Simple Steps:

### Step 1: Install the Debug APK
```
Receive the APK file "app-release.apk"
→ Open it to install
→ If prompted, allow the installation
```

### Step 2: Open the Debug App
```
Find "DDC Marketing Debug" in your apps
→ Tap to open
→ The Debug screen appears immediately
```

### Step 3: Read the Diagnostics
```
You should see three buttons:
  • "Read Crashes" - Click this
  • "Read Diagnostics" - Click this  
  • "Copy to Clipboard" - Click this
```

### Step 4: Send the Report
```
→ A detailed JSON report is now copied to your clipboard
→ Open WhatsApp, email, or Slack
→ Paste the report and send to support
```

## What the report contains:
- App version and build info
- Permission status
- GPS/Location service status
- Network status
- Background task status
- Session state
- All diagnostic logs from the main app
- Crash logs (if any)

## If you still see errors:
- Try clearing app cache: Settings → Apps → DDC Marketing Debug → Storage → Clear Cache
- Uninstall and reinstall the APK
- Take a screenshot of any error messages and include it in your report

## For Developers:

The debug APK reads from:
```
/data/data/com.antoalex07.ddcmarketingmobile/files/location_diagnostics.jsonl
/data/data/com.antoalex07.ddcmarketingmobile/files/native_crash_logs.jsonl
```

These files are created by the main app when diagnostics are enabled and persist even if the main app crashes.

### Branch Information:
- Branch: `debug-diagnostics-only`
- Built from minimal App.js (no navigation, auth, or background services)
- Same diagnostic services as main build
- Easier to install on problematic devices

### Build command:
```bash
cd android
./gradlew.bat assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```
