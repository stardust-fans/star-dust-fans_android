# Findings

- The previous change used a pure predicate helper only to test object identity and lifecycle booleans. The device teardown stress test is a better validation for this Android callback boundary, so the helper-only test is being removed.
- Keep the real `NavigationPolicy` tests and inline the WebView identity/lifecycle checks at the callback boundaries.
- Increment Android versionName and versionCode together to identify the teardown test build without changing signing or application data.
- Instrumentation manifest packaging first failed because `<instrumentation>` was nested in `<application>`; moved it to the required manifest-level sibling. The subsequent test APK built and signature verification passed.
- The built APK uses the existing local debug key supplied by path and is available at `test/android/instrumentation/device-smoke.apk` in this worktree for parent-owned installation. It is a generated, unstaged artifact and is not part of the source commit.
- The fixture has not been run on hardware. Its result labels describe checks it will perform; no device pass is claimed.
- The file picker is an external activity, so the fixture must observe its launch intent without intercepting it or expecting its Activity instance from the app instrumentation.
- Native navigation coverage should use the app's dock and top controls directly, then assert WebView routes and nonempty titles; user-account navigation may resolve to the site's login route.
- Queue the deliberately late route callback and drain the main looper before reporting success so an asynchronous lifecycle failure cannot escape the fixture.
- The lifecycle stress test posts from a worker while the main thread is blocked, destroys the Activity before the queued callback can drain, then waits for the main queue; it also checks direct delivery after destruction.
- The test drives all five dock buttons, waits for their expected routes and page titles, selects the home entry from the all-pages dialog, and launches/closes Settings and Search.
- The external picker monitor uses the default non-blocking monitor callback, records `ACTION_OPEN_DOCUMENT`, and lets the system picker launch; it no longer expects an external Activity object from the target package.
- Android-34 compilation, APK packaging/signing with the provided local key path, navigation policy tests, and whitespace checks pass. ADB and device interaction are parent-owned.
- Search validation must set the native EditText directly and invoke its search editor action so the result does not depend on the phone's active IME; assert both a matching BV URL in the Activity result model and a nonempty rendered `result_title`.
- A custom platform Instrumentation must start its runner from `onCreate`; status bundles before each case make progress observable while the parent owns device execution.
- The Activity now checks WebView identity and lifecycle directly before posting and before executing the JS route callback. The helper class and synthetic predicate test are removed.
- Android version metadata now matches at 1.3.1/code 7 in Gradle and the standalone builder. Navigation policy tests and forced offline Gradle Java compilation pass.
