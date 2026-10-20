# Site contract

`site.json` is the shared source for native tabs, route coverage, notification feeds, search endpoints, and WebView chrome adjustments. It describes the pinned public and admin website entries and does not include website backend implementation.

The page list covers home, video and daily browsing, fanart and shop lists/details, starmap, the Omew forum, account registration/login/profile/settings/username changes, guide/about, fallback, Aspirateur, and the separate admin HTML entry. `adminPages` maps the admin app's nine hash modules; its own sidebar handles navigation among them. Parameterized details and the fallback have no native tab entry. Protected routes retain the website's login and `return_to` behavior inside the WebView. Admin access remains subject to the website's own authentication.

Static Node tests verify contract shape, public/admin route snapshot parity, same-origin API paths, and scoped chrome CSS. They do not verify a real account, session, upload, push delivery, admin authorization, or external forum login.

## Device acceptance

- On iPhone and iPad, open each native tab and navigate every listed page, including fanart/shop details, public profiles, fallback, and Aspirateur.
- Open the admin entry and inspect that its nine modules render and the web sidebar remains usable. Use an authorized admin account; do not perform live edits during this acceptance pass.
- Sign in, register, open protected profile/settings/forum pages while signed out, and confirm sign-in returns to the requested page; complete username changes when prompted.
- Search videos, fanart, and shop; open notification feed items and verify their detail destinations.
- Submit fanart and shop contributions, attach images, and change the profile avatar using the native photo picker.
- Attach allowed document/archive extensions and multiple files; download an existing fanart attachment through the system browser and check the contact email opens a mail app.
- Enter and exit fullscreen media in the forum, then check hardware/back gestures restore the normal navigation.
- Confirm the native navigation hides the website navbar and Live2D companion, public content no longer reserves space for the hidden navbar, and the forum occupies the full WebView below native safe areas.
- Exercise forum authentication, file inputs, keyboard/rotation, and back navigation on both device families; these depend on live services and platform WebView behavior.
