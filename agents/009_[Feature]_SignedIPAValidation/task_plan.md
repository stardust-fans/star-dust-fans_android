# Signed IPA validation plan

- [x] Inspect the mobile and runner contracts, preserve pre-existing worktree changes, and define a read-only CLI.
- [x] Implement ZIP, source binding, IPA plist/Mach-O, provisioning profile and output digest checks using standard-library parsing and OpenSSL CMS verification.
- [x] Add root-level tests with synthetic archives and tamper negatives; ensure no private material enters fixtures.
- [x] Run tests and static checks, record evidence, and commit only owned files.
