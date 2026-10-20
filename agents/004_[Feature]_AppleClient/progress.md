# Progress

- Added `apps/apple/StarDust` SwiftUI application sources with one shared persistent WKWebsiteDataStore session, native five-tab navigation, contract-driven page directory, URL validation, cross-origin frame support, JavaScript dialogs, history, reload, recovery, share sheet and external HTTPS dispatch.
- Added native search with server-side `/api/songs?q=&limit=20&offset=0`, nested owner decoding and Bilibili video destinations; fanart and shop results link to exact detail pages. Search tasks cancel superseded requests.
- Added fanart/shop-only notifications with permission handling, first-read ID baselines, deduplication, notification tap routing and best-effort BGAppRefresh scheduling.
- Added iOS 16 Xcode app/test targets, shared StarDust scheme, bundle reference to `packages/site-contract/site.json`, app/privacy manifests and reused Android launcher artwork for AppIcon.
- Added XCTest URL-policy, notification feed and nested video-owner decoding cases in root `test/apple`.
- Follow-up review fixes retain `WKWebView` strongly, keep the URL observer, use JSONEncoder for CSS literals, use iOS 16 toolbar APIs, enable testability, and compile the icon catalog as a resource. Background task work now cancels on expiration and completes once; feed baseline writes are generation-checked across disable/re-enable and polling is single-flight.
- Search detail links use web detail routes, video queries are server-filtered, notification deep links preserve encoded path/query/fragment, and web navigation now allows only exact trusted top-level hosts while leaving subframe redirects untouched. Attachment links hand off to the system browser for saving, and explicit mailto links open the mail handler.
- Added regression coverage for forum-host allowlisting, unsafe/custom deep links, fanart/shop destinations, retained WebView ownership, baseline monotonicity, and toggle-generation invalidation.
- Follow-up launch routing claims the initial tab only once and preserves an already requested incoming route; search now checks HTTP status and distinguishes failed sources from valid empty results. Share sheet identity is stable per URL.
- Foreground notification presentation now shows banners/list/sound only for still-enabled fanart or shop feeds.
- SwiftUI scene-phase transitions now stop foreground polling outside the active state and submit best-effort background refresh when entering background; the app declares a single scene for its persistent WebView session.
- Validation: XML property lists and asset catalog JSON parse successfully; Xcode/Swift toolchain is unavailable on this Windows host, so no simulator build or XCTest execution was possible here. Parent macOS CI must run the shared scheme on iPhone and iPad simulators.
