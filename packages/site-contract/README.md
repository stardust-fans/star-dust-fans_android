# Site contract

`site.json` is the shared source for native tabs, route coverage, notification feeds, search endpoints, and WebView chrome adjustments. It describes the pinned public website source and does not include website backend implementation.

The page list covers home, video and daily browsing, fanart and shop lists/details, starmap, the Omew forum, account registration/login/profile/settings/username changes, guide/about, fallback, and the Aspirateur page. Parameterized details and the fallback have no native tab entry. Protected routes retain the website's login and `return_to` behavior inside the WebView.

Static Node tests verify contract shape, route snapshot parity, same-origin API paths, and scoped chrome CSS. They do not verify a real account, session, upload, push delivery, or external forum login.

## Device acceptance

- On iPhone and iPad, open each native tab and navigate every listed page, including fanart/shop details, public profiles, fallback, and Aspirateur.
- Sign in, register, open protected profile/settings/forum pages while signed out, and confirm sign-in returns to the requested page; complete username changes when prompted.
- Search videos, fanart, and shop; open notification feed items and verify their detail destinations.
- Submit fanart and shop contributions, attach images, and change the profile avatar using the native photo picker.
- Confirm the native navigation hides the website navbar and Live2D companion, and the forum occupies the full WebView below native safe areas.
- Exercise forum authentication, file inputs, keyboard/rotation, and back navigation on both device families; these depend on live services and platform WebView behavior.
