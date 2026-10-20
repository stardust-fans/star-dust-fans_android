# Android parity implementation plan

- [x] Inspect current Android navigation, WebView lifecycle, and standalone build path.
- [x] Load shared site contract at runtime and render dynamic tabs plus all entry pages.
- [x] Implement exact route syncing, safe same-host navigation, external/new-window handling, and file chooser behavior.
- [x] Correct hidden-navbar page offsets and make retry/back/reload behavior usable.
- [x] Add focused Android behavioral checks under root test/android.
- [ ] Validate contract/build integration and commit only assigned paths.