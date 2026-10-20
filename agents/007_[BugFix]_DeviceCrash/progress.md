# Progress

- Confirmed `codex/android-parity` is clean and already contains mainline commit `3697f25` plus the merged teardown fix.
- Started simplifying the predicate wrapper/test and preparing Android-only version metadata update. No ADB commands or device interaction performed.
- Inlined the checks in `MainActivity`, removed `CallbackPolicy` and its JVM test/runner entries, and bumped both Android build paths to 1.3.1/code 7.
- `test/android/run-navigation-policy.ps1`, forced offline `:app:compileDebugJavaWithJavac`, and `git diff --check` passed. No ADB or UI interaction performed.
- Parent requested a platform `Instrumentation` APK fixture and standalone builder for device-side lifecycle validation; fixture construction is in progress. The agent will not run ADB or interact with the phone.
- Added platform-only instrumentation coverage for cold contract launch, a real `.pdf,.zip` multi-file picker open/cancel, pending callback release on Activity finish, late bridge delivery after destroy, and fullscreen Back exit. Build helper signs with the specified debug key argument and packages with local SDK tools.
- First fixture build caught the manifest instrumentation element at the wrong XML level; corrected it. Test source compiled, APK package/version/runner metadata checked, APK signing verified, and no ADB command was run.
- Final fixture source and manifest compile/package successfully. Navigation policy JVM tests pass and the instrumentation APK was signed and verified using the parent checkout's local debug keystore. The APK remains available for parent-owned device execution; no device result is claimed.
- Expanded the fixture with native dock navigation, all-pages menu selection, Settings/Search launches, picker intent capture without interception, and 11 queued teardown races. Rebuilt and signed the APK, reran navigation policy checks and `git diff --check`; no device result is claimed.
