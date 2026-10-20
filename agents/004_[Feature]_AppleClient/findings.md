# Findings

- Site contract commit 22abae1 defines 5 tabs, public page entries including `/admin/index.html`, and notification feed detail prefixes; app loads that JSON as a required bundle resource.
- The live OMEW host is `omew.stardustinfinity.top`. The app allows only the exact site origin and this explicit forum host for top-level navigation; all subframe navigation remains in WKWebView so OMEW SSO redirects are not broken by top-level routing rules.
- iOS WKWebView supplies its native file input panel on iOS 16. No custom open-panel delegate is available at this minimum OS level.
- Safari/WebKit cross-site tracking prevention can restrict third-party OMEW identity cookies. The app does not promise forum SSO will succeed on every device/session; real-device validation is needed.
- `BGAppRefreshTask` timing is controlled by iOS. Alerts cover fanart and shop only; there is no video feed notification path. The initial successful feed read establishes an ID baseline and failures do not establish a false baseline.
- Xcode is unavailable on the Windows implementation host; macOS simulator build and XCTest remain for the parent CI run.
- Top-level attachment links under the exact site host are handed to the system browser to support file saving; no download-completion behavior was verified in this Windows-only environment.
- Top-level external HTTPS links open outside the app only after explicit link activation. Other schemes remain blocked except explicit `mailto:` links; subframe requests are allowed for forum SSO compatibility.
- Initial navigation is claimed once so valid cold-start URLs take precedence; search API HTTP/decode/network errors are reported separately from successful empty search results.
