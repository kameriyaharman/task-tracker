/**
 * Expo config plugin: Android native crash reporter.
 * Adds to MainApplication.onCreate():
 *   - a "native-start" ping (proves the app process starts and has network)
 *   - an uncaught-exception handler that POSTs the Java/Kotlin stack trace to <API>/client-log
 *     before the app closes, then lets Android handle the crash as usual.
 */
const { withMainApplication } = require('expo/config-plugins');

const MARKER = '// keshav-native-crash-reporter';

module.exports = function withNativeCrashReporter(config, props = {}) {
  const endpoint = `${String(props.apiUrl || process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '')}/client-log`;
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const helper = `
  ${MARKER}
  private fun keshavReport(event: String, detail: String) {
    val sender = Thread {
      try {
        val body = org.json.JSONObject()
          .put("sid", "native")
          .put("event", event)
          .put("os", "android")
          .put("osv", android.os.Build.VERSION.SDK_INT.toString() + " " + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL + " " + (android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: ""))
          .put("detail", if (detail.length > 3900) detail.substring(0, 3900) else detail)
          .toString()
        val conn = java.net.URL("${endpoint}").openConnection() as java.net.HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 4000
        conn.readTimeout = 4000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.use { it.write(body.toByteArray()) }
        conn.responseCode
        conn.disconnect()
      } catch (_: Throwable) {
      }
    }
    sender.start()
    if (event == "native-crash") sender.join(5000)
  }
`;
    const install = `
    ${MARKER}
    keshavReport("native-start", "versionName=" + (try { packageManager.getPackageInfo(packageName, 0).versionName } catch (_: Throwable) { "?" }))
    val keshavPrevious = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val sw = java.io.StringWriter()
        error.printStackTrace(java.io.PrintWriter(sw))
        keshavReport("native-crash", "thread=" + thread.name + "\\n" + sw.toString())
      } catch (_: Throwable) {
      }
      keshavPrevious?.uncaughtException(thread, error)
    }
`;
    // install as the very first thing in onCreate (before super.onCreate / React Native load)
    src = src.replace(/override fun onCreate\(\) \{\n/, (m) => m + install);
    // helper inside the class (before the last closing brace)
    const last = src.lastIndexOf('}');
    src = src.slice(0, last) + helper + src.slice(last);
    cfg.modResults.contents = src;
    return cfg;
  });
};
