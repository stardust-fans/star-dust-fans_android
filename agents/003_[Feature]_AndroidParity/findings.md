# Findings

- Android uses Java and a platform WebView. Existing navigation hardcoded five routes and used substring route matching after page finish; the page layout already had an error retry overlay.
- Existing file picker forced single image selection. WebChromeClient lacked target=_blank handling.
- Existing internal URL policy allowed every subdomain and arbitrary URI properties. Forum SSO uses the exact `omew.stardustinfinity.top` host and depends on third-party cookies.
- The shared contract is not present in this branch yet; Android Gradle and standalone build paths now consume `packages/site-contract/site.json` when parent integration brings it in. No fallback route data is defined.
- Android SDK is absent in this checkout environment, so APK compilation awaits parent provisioning. Pure Java route policy checks run without Android dependencies.
- Song search must use the server query and nested `owner.name` fields; results now carry validated Bilibili video URLs and are opened outside MainActivity's root-site deep-link path.
- Website attachment inputs accept extension lists, so Android maps known extensions to MIME types and falls back to `*/*` for unknown extensions while preserving multi-select. Same-site `/attachments/` links use the system browser for downloads; `mailto:` opens only through `ACTION_SENDTO`.
- Legacy WebView popup callback is supported for API 23, user-initiated popups only, with one-shot routing and cleanup. Fullscreen custom media hides/restores native chrome and Back exits fullscreen. Search results are generation-guarded against stale worker completion.
- The standalone builder resolves Java from runtime settings when PATH points to the Oracle javapath shim; version metadata is `1.3.0`/code 6. Release builds no longer reuse debug signing. Two unused icon generators hardcoded to a stale workstation path were removed; checked-in icon assets remain.
- Focused validation passed: NavigationPolicy PowerShell runner, build script PowerShell parser and JDK resolution, layout XML parse, and `git diff --check`. Full APK build is left to parent integration with shared contract and provisioned SDK.
