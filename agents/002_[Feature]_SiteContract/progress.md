# Progress

- Added `/admin/index.html` as the admin entry and `adminPages` for all nine concrete Vue hash modules.
- Extended Node tests to separately compare public routes, admin hash routes, and the Vite admin HTML input against the pinned website checkout.
- Scoped the 92px layout correction to public `#app` top padding only; existing width and horizontal gutters remain intact. Kept Omew stage at viewport top.
- Updated package coverage and device acceptance to include admin rendering while avoiding live admin mutations.
- Ran source-backed `node --test test/site-contract.test.mjs`: all 7 tests passed.
