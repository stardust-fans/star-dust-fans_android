# Findings

- Pinned source is the Vite/Vue public app at commit `cf7f6f7c5f399d17340f00542e1591a160a18914`; route definitions are in `src/public/router/index.js`.
- Registered public routes include `/`, `/videos`, `/daily`, `/fanart`, `/shop`, `/starmap`, `/omew`, `/about`, `/login`, `/change-username`, `/register`, `/fanart/:id`, `/shop/:id`, `/guide`, `/user`, `/settings`, `/fallback`, `/aspirateur`, and `/user/:id`; catch-all redirects home.
- Search endpoint mappings are specified by task owner as `/api/songs`, `/api/fanart`, `/api/shop`; notification detail routes map to `/fanart/` and `/shop/`.
- Public interaction surfaces contain credential forms, protected routes carrying `return_to`, profile avatar and contribution file inputs, and API-backed fanart/shop submissions. Static source review cannot establish authentication or upload success in native WebViews.
- WebView chrome selectors should be narrow: exact `.navbar` and Live2D wrapper selectors. Omew's stage currently measures navbar height in `OmewView.vue`; overriding its `top` allows full viewport after native navigation takes over.

- Follow-up: admin is a separate Vite HTML entry at /admin/index.html with Vue hash history. Its router registers nine concrete module routes: songs, daily, fanart, shop, audit-log, admins, pending, thanks, and tags; / and catch-all redirect and are not module destinations.
- Public #app has padding-top: 92px solely for its fixed navbar. Override this exact property in the injected chrome rules; keep the existing public content max-width, horizontal gutters, and all other layout intact. Admin's .main-content uses 24px top padding and has no navigation-bar spacer.
