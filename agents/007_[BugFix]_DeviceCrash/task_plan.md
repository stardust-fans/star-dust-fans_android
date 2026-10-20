# Android device crash audit

- [x] Confirm the Android worktree is clean and fast-forward it to current main.
- [x] Audit Activity teardown, WebView callbacks, picker completion, and background network callbacks.
- [x] Guard WebView bridge work queued across Activity teardown and cover the state transition with a focused test.
- [x] Run root Android checks and inspect the final diff.
- [x] Commit only assigned paths.
