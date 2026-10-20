# Android teardown follow-up

- [x] Confirm the branch includes the merged teardown guard and has no local changes.
- [x] Inline the WebView lifecycle checks and remove the helper-only JVM test.
- [x] Bump Android version metadata to 1.3.1/code 7.
- [x] Run scoped tests and review the diff.
- [x] Commit only assigned paths.
- [x] Add a platform-only Android instrumentation fixture for production lifecycle, file picker, and fullscreen boundaries.
- [x] Add a portable APK build helper using the existing SDK/JDK and supplied debug key.
- [x] Validate source/build helper without ADB.
- [x] Commit only the requested test paths and audit records.
