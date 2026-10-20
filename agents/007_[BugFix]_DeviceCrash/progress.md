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
- Committed the scoped follow-up as `41bc971`; the rebuilt APK remains an untracked local artifact for parent-owned installation.
- Added native search using a fixed public BV query and asserted the rendered result title plus matching result URL. Instrumentation now starts from `onCreate` and publishes case progress. Official API docs confirm the lifecycle: `onCreate` should call `start()` before execution continues in `onStart`. Rebuilt/signed APK and reran navigation policy checks; no device result is claimed.
- Committed this follow-up as `2c5df57`; generated APK remains untracked and is excluded from source history.
- Parent-owned hardware execution passed contract startup and all five tabs, then exposed unreliable DPAD selection in the all-pages dialog. Replaced the guessed key sequence with an exact accessible-text click and added navigation subcase status updates. Rebuilt/signed APK and reran static policy checks; no device claim is made by this agent.
- Committed the menu-selection fix as `3d29654`; the rebuilt APK remains an untracked local artifact for parent-owned execution.
