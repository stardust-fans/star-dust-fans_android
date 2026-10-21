# Findings

- The Apple app bundle identifier is `top.stardustinfinity.mobile`, app version is `1.3.0`, and the generic device Release build already exists in the mobile verification workflow.
- The Xcode archive is unsigned and uses `unsigned.xcarchive/` as its nested ZIP root. The uploaded artifact ZIP contains exactly `unsigned.xcarchive.zip` and `source.json`; source metadata has only `platform`, `architecture`, `bundle_id`, `version`, and `source_sha`, with architecture `arm64`.
- Control plane: `POST /v1/requests` accepts project `stardust-ios`, platform `ios`, run id/attempt, artifact id, version, source SHA, and `execution_visibility: auto`. It uses Bearer authentication and `Idempotency-Key`. Submit returns `request_id`; status returns `request_id`, `state`, and `output`.
- The mobile workflow only builds and submits because signed development profiles can disclose registered device identifiers. An authorized administrator retrieves the IPA from the central protected interface.
- Central signing uses the fixed Xcode `-exportArchive` recipe. The workflow does not manually codesign or repackage the output IPA.
- The submit helper uses the fixed signing-service origin, rejects redirects, applies a bounded timeout, and caps JSON response bodies.
- The source archive uses `ditto --norsrc --keepParent`, which omits resource-fork metadata that would otherwise add AppleDouble entries and preserves the archive directory root.

## Current signing and device-validation status

- The fixed iOS executor uses the private GitEdge macOS broker lane (`self-hosted`, `macOS`, `ARM64`, `signing-macos-private`) with Xcode 26.6 and Homebrew Python 3.13. Native broker smoke succeeded; this proves broker dispatch, not Xcode signing readiness.
- The approved recipe is tag `ios-runner-2026-10-20-4` at commit `a1883cd3042a05c7448a9c714d49070a423cc966`; the central service deployment is `0a786f49-bb6d-44e1-9ace-57825b9a7449`.
- Signing is blocked because the Mac has not accepted the Xcode license/completed first launch. A read-only `sudo -n -l <xcodebuild> -runFirstLaunch` capability check was denied; no sudo initialization was attempted. Diagnostic run `39503920257` is not evidence that Xcode is ready.
- Source run `39503031284` at commit `55cb1466ef04901b695dcb76192797da1716fa24` created request `cf4ea9c1-88ea-4889-8ea3-03a47049ddc0`. Native runs `39503178530` and `39503479163` failed preflight before releasing signing credentials. The request references expired recipe 3; after Mac setup, verify the central service uses recipe 4 and start a new source workflow at attempt 1 rather than rerunning the old run.
- No signed IPA exists yet. The development profile covers two registered devices and the iPhone was previously registered; however, the iPhone is currently absent from USB. Reconnect and unlock it before installation. Android real-device tests already passed and do not need to be repeated.
- Earlier progress describing a completed signing implementation refers to code/control-plane delivery only. It does not mean the IPA was signed, device-installed, or accepted.
The public mobile repository must not publish the signed development IPA because its embedded provisioning profile can disclose registered device identifiers. Signed-package retrieval belongs to the central service's protected administrator interface; the repository workflow only publishes the unsigned archive and submits the request.
- GitHub Actions run `39439884602`, job `118686612149`, exposed a stale local download path: 19/20 tests passed, and the archive-positive helper test failed with `ReferenceError: writeFile is not defined`. The repository-key download operation and its tests are removed because signed-package delivery is now restricted to the central administrator interface. This retires an unauthorized delivery path rather than weakening submit assertions; signing-center output verification remains independently enforced.

## 当前状态（2026-10-21）

先前等待 Xcode 许可/首次启动的状态已解除：Mac 已确认 Xcode 27.1、许可、首次启动和 SDK 均就绪，GitEdge 私有 runner 可用。中心凭据已采用同一证书及私钥的原生 PKCS#12 编码；native run `39546696981` 完成凭据导入，后续在旧 CN 后缀匹配条件处失败。identity SHA 绑定修复已审阅并通过 74 项测试；新 recipe `21-3` / `1bc3bd9` 正在部署，尚未确认 live。部署确认后需启动新 source run 并取得可验证 IPA；当前无 IPA、无 iPhone 安装或启动结果，任务仍进行中。设备 profile 包含两台已登记设备，其中有 iPhone 14 Pro；USB 当前为 0。Android ADB 实机验收已通过，不属于此处剩余阻塞。

## 验收更新（2026-10-21）

新 recipe `21-3` / `1bc3bd9` 已用于成功签署：source run `39548015544`（head `1402026`）生成 request `d8b09e55`，native run `39548167067` 成功。真实 IPA 版本 `1.3.0` build `6`，bundle `top.stardustinfinity.mobile`，大小 349147 bytes，SHA-256 `317501bb9a0a5695aac4baa99cd4aa19b9b611e6acbb0eb9c848d634dff65286`。profile 设备范围为两台登记设备，包含 iPhone 14 Pro。私有 Mac codesign 与 Windows 独立验包均通过，10 个 verifier fixture 与真实产物验证通过。

已在 iPhone `iPhone15,2` / iOS 26.7.1 安装成功。三轮 20 秒启动检查均通过，5 秒与 20 秒处目标 bundle PID 保持不变且仍运行；目标 StarDust crash reports 为 0，启动检查脚本退出码为 0（非目标 app 退出码；采样时目标仍运行）。操作者确认栏目可以切换，但发现底栏展示不理想，返回/刷新和分享控件位于 tab 两侧并压缩栏目区域。该 UI 问题仍待修复和人工复验；自动启动/崩溃验收通过不代表视觉 UI 验收完成。

## Build 7 验收（2026-10-21）

Source run `39550930654`（main `c03c55c43a87815f8dacb22118e87865bc3a250b`）对应 CI `39550930834`，contract、Android、unsigned iOS device archive 与 Apple checks 全部成功。private native run `39551035570` 和 request `b430b987-da25-418a-b573-a550a0beac6d` 成功。独立 verifier 通过：输出 ZIP SHA-256 `cd98944989c24085912f8ca86e761e9a8791b5d5fabc2ecef479e4afef04a6a1` / 353310 bytes，IPA SHA-256 `818f4c8a821be7d98ef2ff150fac88e6a668321cabc239ff062b671a1fda8b8a` / 352183 bytes。通过 installation proxy 更新安装到已登记 iPhone，readback 确认 1.3.0/build 7；操作者确认 StarDust 当前在前台。三轮 20 秒 build 7 冷启动检查通过，每轮 5 秒及 20 秒相同 bundle PID 均存活，目标 StarDust 新 crash reports 为 0。build 7 页面截图和视觉验收结果见下方最终调查结论；build 6 的验收历史不替代 build 7 当前轮次。

用户确认实际症状曾为运行一段时间后黑屏。最终对照显示 DVT 自动启动与手动重开/CoreDevice fresh launch 结果不同，详细过程见 012。手动重开后的常规 120 秒观测以及 CoreDevice fresh launch 均显示完整页面；没有证据支持 app-code 根因或永久修复，不加 speculative reload 逻辑。build 7 的产物和 UI 验收完成，当前工作流交付任务关闭。
