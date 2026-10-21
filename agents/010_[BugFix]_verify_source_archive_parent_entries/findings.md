The source archive validator derives a child name from every ZIP entry below `Products/` and `Applications/`. An explicit entry for either parent directory derives an empty child and makes a valid Xcode archive fail. The fix excludes only the exact parent-entry names; other empty or unexpected directories remain visible to the existing strict set checks.

`validate_ipa` consumes the regular-file list returned by `validate_zip_infos`, which intentionally excludes directory entries. Its app discovery and path checks therefore do not have the same parent-entry defect and were left unchanged.
