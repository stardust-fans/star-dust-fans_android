# Findings

- Android uses Java and a platform WebView. Existing navigation hardcoded five routes and used substring route matching after page finish; the page layout already had an error retry overlay.
- Existing file picker forced single image selection. WebChromeClient lacked target=_blank handling.
- Existing internal URL policy allowed every subdomain and arbitrary URI properties. Forum SSO uses the exact `omew.stardustinfinity.top` host and depends on third-party cookies.
- The shared contract is not present in this branch yet; Android Gradle and standalone build paths now consume `packages/site-contract/site.json` when parent integration brings it in. No fallback route data is defined.
- Android SDK is absent in this checkout environment, so APK compilation awaits parent provisioning. Pure Java route policy checks run without Android dependencies.
- Song search must use the server query and nested `owner.name` fields; results now carry validated Bilibili video URLs and are opened outside MainActivity's root-site deep-link path.