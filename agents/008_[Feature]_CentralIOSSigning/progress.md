# Progress

- Confirmed the existing Apple-client worktree was clean and `main` was an ancestor; fast-forwarded it to the requested integration commit.
- Confirmed bundle identifier/version and aligned source archive, source metadata, request body, polling, download header, and output report with signing owners and the service implementation.
- Added the default-branch-only two-operation workflow, unsigned Xcode archive envelope, authenticated Node API client, download verification, root-level tests, and README instructions.
- `node --check` passed. After the follow-up, `npm test` passed all 15 executed tests; 4 archive extraction tests were skipped on Windows because the host has no `unzip`. `git diff --check` passed. Workflow syntax was reviewed directly; no YAML parser or actionlint is installed on this host.
- Follow-up hardened workflow operation wiring (`build` maps directly to submission), pinned requests to the central HTTPS origin with redirects disabled, bounded JSON/archive streaming, validated future expiration dates and profile UUIDs, and rejected ZIP symlinks with `lstat`. Added negative tests for operation mismatch, oversized responses, invalid report metadata, archive bounds, and symlink outputs.
Removed the helper's repo-key status/download/report and IPA extraction path, leaving only bounded, fixed-origin request submission. The public workflow only builds and submits an unsigned archive; its summary directs administrators to retrieve the signed IPA from the central protected interface. Run `39439884602`, job `118686612149`, had 19/20 checks pass; the obsolete archive-positive download check failed because `writeFile` was not imported. The download flow and its tests were removed with the retired public delivery path, while submit binding, API error, response bound, and workflow-scope checks remain.
- `node --check .github/scripts/ios-sign-api.mjs`, `npm test` (13/13 passed), and `git diff --check` passed after the cleanup.
- Latest operational update: the GitEdge private macOS broker passed its native smoke check, but the Mac cannot run the iOS recipe until a user accepts the Xcode license and completes first launch. A read-only `sudo -n -l <xcodebuild> -runFirstLaunch` capability check was denied; no sudo initialization was attempted. Diagnostic run `39503920257` confirmed the probe path only, not Xcode readiness.
- The existing request from source run `39503031284` uses expired recipe 3. Native attempts `39503178530` and `39503479163` stopped at preflight and did not release signing credentials. Once Xcode is initialized, verify recipe 4 is active and launch a new source run at attempt 1. No signed IPA has been produced.
- The iPhone is currently disconnected from USB and must be reconnected/unlocked before installation. Android device validation is complete and remains passed.

## 当前状态（2026-10-21）

Mac Xcode 27.1、许可、首次启动及 SDK 已验证，私有 GitEdge runner 正常；无需再等待用户初始化。中心凭据更新为经合成对照确认可导入的原生 PKCS#12 格式。native run `39546696981` 成功完成导入，之后被旧 CN 后缀与 Team 匹配逻辑拦截；identity SHA 绑定修复已审阅且 74 项测试通过。recipe `21-3` / `1bc3bd9` 部署中，待确认 live 后启动新的 source run。无签名 IPA，故尚不能进行独立产物验签及 iPhone 安装/启动验收。USB 当前无设备，待 IPA 验签后再连接。Android ADB 验收保持通过。
