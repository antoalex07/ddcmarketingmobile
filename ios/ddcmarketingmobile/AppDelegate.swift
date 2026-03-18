import Expo
import Foundation
import React
import ReactAppDependencyProvider

private let NATIVE_CRASH_LOG_FILE_NAME = "native_crash_logs.jsonl"
private let MAX_NATIVE_CRASH_LOG_ENTRIES = 100
private let NATIVE_CRASH_UPLOAD_URL = "http://ddcpharmacy.com/api/logs/mobile-native-crash/bulk"
private let NATIVE_CRASH_UPLOAD_TIMEOUT_SECONDS: TimeInterval = 10
private let NATIVE_CRASH_INSTALLATION_ID_KEY = "native_crash_logger_device_installation_id"

private func isoTimestamp() -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter.string(from: Date())
}

private func nativeCrashLogFileURL() -> URL? {
  return FileManager.default
    .urls(for: .documentDirectory, in: .userDomainMask)
    .first?
    .appendingPathComponent(NATIVE_CRASH_LOG_FILE_NAME)
}

private func getOrCreateNativeCrashInstallationId() -> String {
  if let existingId = UserDefaults.standard.string(forKey: NATIVE_CRASH_INSTALLATION_ID_KEY),
     !existingId.isEmpty {
    return existingId
  }

  let generatedId = "ios-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 100000...999999))"
  UserDefaults.standard.set(generatedId, forKey: NATIVE_CRASH_INSTALLATION_ID_KEY)
  return generatedId
}

private func appendNativeCrashLogEntry(_ entry: [String: Any]) {
  guard let fileURL = nativeCrashLogFileURL() else {
    return
  }

  do {
    let data = try JSONSerialization.data(withJSONObject: entry, options: [])
    guard let encodedLine = String(data: data, encoding: .utf8) else {
      return
    }

    var existingLines: [String] = []

    if FileManager.default.fileExists(atPath: fileURL.path) {
      let content = try String(contentsOf: fileURL, encoding: .utf8)
      existingLines = content
        .split(separator: "\n")
        .map(String.init)
    }

    existingLines.append(encodedLine)
    let limitedLines = Array(existingLines.suffix(MAX_NATIVE_CRASH_LOG_ENTRIES))
    let output = limitedLines.isEmpty ? "" : limitedLines.joined(separator: "\n") + "\n"

    try output.write(to: fileURL, atomically: true, encoding: .utf8)
  } catch {
    NSLog("Failed to persist iOS native crash log: \(error.localizedDescription)")
  }
}

private func handleNativeException(_ exception: NSException) {
  let payload: [String: Any] = [
    "timestamp": isoTimestamp(),
    "platform": "ios",
    "type": "uncaught_exception",
    "is_fatal": true,
    "thread": Thread.isMainThread ? "main" : "background",
    "name": exception.name.rawValue,
    "message": exception.reason ?? "Unknown native crash",
    "stack": exception.callStackSymbols.joined(separator: "\n")
  ]

  appendNativeCrashLogEntry(payload)
}

private func uploadPendingNativeCrashLogsIfNeeded() {
  guard let fileURL = nativeCrashLogFileURL() else {
    return
  }

  DispatchQueue.global(qos: .utility).async {
    do {
      guard FileManager.default.fileExists(atPath: fileURL.path) else {
        return
      }

      let content = try String(contentsOf: fileURL, encoding: .utf8)
      let lines = content
        .split(separator: "\n")
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

      if lines.isEmpty {
        return
      }

      var parsedLogs: [[String: Any]] = []
      parsedLogs.reserveCapacity(lines.count)

      for line in lines {
        if let lineData = line.data(using: .utf8),
           let logObject = try? JSONSerialization.jsonObject(with: lineData, options: []) as? [String: Any] {
          parsedLogs.append(logObject)
        } else {
          parsedLogs.append([
            "timestamp": isoTimestamp(),
            "platform": "ios",
            "type": "raw_line",
            "is_fatal": true,
            "message": line
          ])
        }
      }

      let payload: [String: Any] = [
        "platform": "ios",
        "bundle_id": Bundle.main.bundleIdentifier ?? "unknown",
        "app_version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
        "app_build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
        "device_installation_id": getOrCreateNativeCrashInstallationId(),
        "logs": parsedLogs
      ]

      guard let payloadData = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
        return
      }

      guard let uploadURL = URL(string: NATIVE_CRASH_UPLOAD_URL) else {
        return
      }

      var request = URLRequest(url: uploadURL)
      request.httpMethod = "POST"
      request.timeoutInterval = NATIVE_CRASH_UPLOAD_TIMEOUT_SECONDS
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue("application/json", forHTTPHeaderField: "Accept")
      request.httpBody = payloadData

      URLSession.shared.dataTask(with: request) { data, response, error in
        if error != nil {
          return
        }

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
          return
        }

        var shouldClearFile = true
        if let responseData = data, !responseData.isEmpty,
           let jsonResponse = try? JSONSerialization.jsonObject(with: responseData, options: []) as? [String: Any],
           let successFlag = jsonResponse["success"] as? Bool {
          shouldClearFile = successFlag
        }

        if shouldClearFile {
          try? FileManager.default.removeItem(at: fileURL)
        }
      }.resume()
    } catch {
      NSLog("Failed to upload iOS native crash logs: \(error.localizedDescription)")
    }
  }
}

private let nativeExceptionHandler: @convention(c) (NSException) -> Void = { exception in
  handleNativeException(exception)
}

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NSSetUncaughtExceptionHandler(nativeExceptionHandler)
    uploadPendingNativeCrashLogsIfNeeded()

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
