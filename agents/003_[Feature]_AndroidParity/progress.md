# Progress

- Read agent-mode, repository project/local instructions, and current Android implementation before editing.
- Added runtime site contract loading for tabs, entry pages, search endpoints, origin, and site CSS. Contract mismatch or missing assets stop the app instead of using duplicate route definitions.
- Replaced fixed tabs with the contract's five entries and added an all-pages dialog. The user avatar maps to contract tab `user`.
- Added root/OMEW exact-host URL policy, safe app deep-link checks, external HTTP(S) handling, target=_blank routing, SPA pushState/replaceState/popstate synchronization, and contract CSS injection.
- Updated file selection to honor accepted MIME types and multi-select; wired retry and retained WebView history for Back.
- Updated Gradle asset source and standalone aapt2 asset packaging; removed the checked-in Gradle localhost proxy and constrained standalone script recursive operations to the Android project root.
- Updated native song search to use contract endpoints, query the server, parse nested owner names, validate BVIDs, and open the selected Bilibili video URL through ACTION_VIEW.
- Added pure Java URL policy tests and Windows/Unix runners under root `test/android`.
- Verified the pure Java test suite, PowerShell syntax, Android layout XML parsing, and `git diff --check`. Full APK build is deferred to the parent integration because this worktree does not yet contain the shared contract or Android SDK.
- Follow-up: added Android 6 legacy popup navigation with user-gesture gating and one-time popup cleanup; added fullscreen WebView media handling with Back exit; normalized extension-list file chooser filters; routed canonical attachment downloads to the system browser and mailto links to a mail app; guarded asynchronous search by generation.
- Updated app/build metadata to 1.3.0/code 6, removed release debug signing and lint suppression, improved Java-home resolution, and hardened temporary test cleanup.
- Removed the two unused icon generators that depend on a non-portable workstation path; kept checked-in artwork.
- Validation: `test/android/run-navigation-policy.ps1` passed; PowerShell parser/JDK resolution, Android layout XML parsing, and `git diff --check` passed. Full Android APK build awaits parent integration tree.
