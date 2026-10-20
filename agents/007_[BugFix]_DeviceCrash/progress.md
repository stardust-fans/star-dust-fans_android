# Progress

- Confirmed `codex/android-parity` is clean and already contains mainline commit `3697f25` plus the merged teardown fix.
- Started simplifying the predicate wrapper/test and preparing Android-only version metadata update. No ADB commands or device interaction performed.
- Inlined the checks in `MainActivity`, removed `CallbackPolicy` and its JVM test/runner entries, and bumped both Android build paths to 1.3.1/code 7.
- `test/android/run-navigation-policy.ps1`, forced offline `:app:compileDebugJavaWithJavac`, and `git diff --check` passed. No ADB or UI interaction performed.
