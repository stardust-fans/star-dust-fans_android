# Findings

- The previous change used a pure predicate helper only to test object identity and lifecycle booleans. The device teardown stress test is a better validation for this Android callback boundary, so the helper-only test is being removed.
- Keep the real `NavigationPolicy` tests and inline the WebView identity/lifecycle checks at the callback boundaries.
- Increment Android versionName and versionCode together to identify the teardown test build without changing signing or application data.
- Instrumentation manifest packaging first failed because `<instrumentation>` was nested in `<application>`; moved it to the required manifest-level sibling. The subsequent test APK built and signature verification passed.
- The built APK uses the existing local debug key supplied by path and is available at `test/android/instrumentation/device-smoke.apk` in this worktree for parent-owned installation. It is a generated, unstaged artifact and is not part of the source commit.
- The fixture has not been run on hardware. Its result labels describe checks it will perform; no device pass is claimed.
- The Activity now checks WebView identity and lifecycle directly before posting and before executing the JS route callback. The helper class and synthetic predicate test are removed.
- Android version metadata now matches at 1.3.1/code 7 in Gradle and the standalone builder. Navigation policy tests and forced offline Gradle Java compilation pass.
