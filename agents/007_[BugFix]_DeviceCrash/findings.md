# Findings

- The assigned worktree was clean at `96e4d6b` and fast-forwarded to `main` at `00b4384`.
- `MainActivity.NavigationBridge.routeChanged` posts work to the UI thread, then dereferences the mutable `webView` field. `onDestroy` destroys and nulls that field. A bridge callback queued before teardown can therefore execute afterward and throw a main-thread `NullPointerException`.
- File chooser callbacks are released when the picker returns, but not when the Activity is destroyed while the external picker is active. This is a stale callback/liveness issue; no direct application crash path has been established yet.
- `SearchActivity` already guards posted search results by request generation, finishing, and destroyed state. Avatar and Settings callbacks still post after teardown, but their current view references are retained and do not show the same direct null-dereference path.
- The bridge callback now requires the captured WebView to remain the current instance and the Activity to remain active both before posting and when the UI-thread work executes. Destroy removes the JavaScript interface and completes any outstanding file-picker callback before destroying the WebView.
- Focused policy tests pass on the Windows runner, and Gradle `:app:compileDebugJavaWithJavac --offline --rerun-tasks` succeeds against the shared SDK/JDK. No ADB or device access was performed.
