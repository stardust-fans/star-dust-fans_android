# Progress

- Added `packages/site-contract/site.json` with pinned website source, five native tabs, all 19 non-catch-all public routes, notification feed mappings, search API paths, and narrowly scoped chrome CSS.
- Added a checked-in route fixture and Node built-in tests. With `WEB_REFERENCE` pointed at the pinned website checkout, the test compares the complete registered route set directly to the website router.
- Documented functional coverage and the iPhone/iPad manual acceptance steps, including login return paths and image uploads.
- Ran `node --test test/site-contract.test.mjs` with source comparison enabled: all 6 tests passed.
- Test and agent files are globally ignored, so added them explicitly with `git add -f`. Prohibited marker scan on code, tests, and public documentation returned no matches.
