# 发现
- 当前主机 Windows；ADB 36 可用。列出 USB 和网络两个 transport，设备型号相同，须先核对 ro.serialno，避免误认为两台设备。
- PATH 有既有 Get-Sign 脚本；需先核实其证书类型，不将 Windows Authenticode 证书冒充 Apple Development 身份。
- Windows 未发现 codesign / xcodebuild / zsign，Apple 真机包须使用 iphoneos 构建，不能给已交付 iphonesimulator 包重新签名后冒充 IPA。
- 用户已授权使用其现有 dev 证书和 ADB 本机测试；不撤销/新建证书，不上传私钥到 GitHub secret 或其他外部服务，若确需此类权限另行说明。
- 用户澄清使用 GitHub 中央签名服务 -> 核验 lsy-404/signing-center 及两个签名 executor 的源代码 -> 当前 platform 仅 windows/macos，macOS 为 Developer ID/公证流程，缺少 iOS profile/IPA 配方；组织许可也未包含 stardust-fans。等待用户确认是否另有 iOS 入口，不改服务权限或凭据。
- 真机为同一台 Honor RNA-AN00 / Android 14 API 34 的 USB 和无线 transport -> 使用 USB 安装 1.3.0，随后原位升级同 debug 签名的 1.3.1/code7 -> 未卸载、未清除数据。
- 导航 UI 脚本在视频与同人第一页验证后遇 UIAutomator shell exit 137 -> adb pidof、Activity 状态及截图显示应用仍运行 -> 原生设置 Activity 的 UI dump 成功，问题限定于网页 accessibility dump 工具，不能据此报告应用崩溃。补充脚本退出码诊断，并用真实 instrumentation 继续。
- 截至 instrumentation 之前，UID 限定 logcat 未发现 FATAL EXCEPTION、Fatal signal、ANR in；exit-info 只见安装升级导致的 PACKAGE UPDATED 和 WebView isolated not needed。该结论仅覆盖已执行流程。
- 首次 instrumentation 中 contract/WebView 初始化与五个 dock tab 通过，菜单 DPAD 猜测没有选到主页而中止 -> 修正为按原生无障碍文字点击菜单项；保持断言不变。完成 instrumentation 时系统 force-stop exit 原因为 finished inst，启动时为 start instr，均不计为崩溃。
- 合并测试分支时对方重写了前一提交，产生 fixture/audit 冲突 -> 以作者最新已审核 fixture 完整版本解决四个冲突并重新编译 -> 成功。冲突状态的首次编译失败未执行到设备。
- 不再保留本次新增的 UIAutomator 全网页树导航脚本；使用实际 instrumentation 入口，避免同一个页面 dump 问题成为长期脆弱测试。
- Android 真机验证已完成并通过，无需重跑。iOS 仍未签出 IPA：private GitEdge macOS broker native smoke 通过，但 Mac 的 Xcode 许可/首次启动尚未完成；只读 `sudo -n -l <xcodebuild> -runFirstLaunch` 权限检查被拒，未尝试 sudo 初始化。最新 recipe 4 为 `ios-runner-2026-10-20-4` / `a1883cd3042a05c7448a9c714d49070a423cc966`，中心部署 `0a786f49-bb6d-44e1-9ace-57825b9a7449`。此前请求依赖失效的 recipe 3；后续须使用 recipe 4 新开 attempt 1。诊断 probe 成功不代表签名工具链 ready；两次实际 native preflight 失败且未释放证书。iPhone 已登记但目前未连接 USB，profile 当前覆盖两台登记设备。
- 早期关于“尚无 iOS 入口/等待用户确认”的记录已被后续授权与中央服务实现取代；当前仅 Xcode 首启许可和设备连接仍阻塞真机验收。

## 状态更新（2026-10-21）

上条有关 Xcode 首启和许可的描述已过时：Mac 已确认 Xcode 27.1、许可、首次启动及 SDK 均就绪，私有 GitEdge runner 已可用。开发 profile 现覆盖两台设备且包含 iPhone 14 Pro；当前 USB 未连接设备，连接应安排在 IPA 验签之后。

中心凭据曾因现代 PKCS#12 格式导入失败；合成材料对照确认格式问题后，已更新为同一证书/私钥的原生 PKCS#12，native run `39546696981` 成功导入。该 run 随后在旧 CN 后缀与 Team ID 匹配假设处停止。identity SHA 绑定修复已通过审阅和 74 项测试；recipe `21-3` / `1bc3bd9` 正在部署，live 状态和签名输出尚未确认。尚无已签名 IPA，因此不报告 iPhone 安装或启动结果。Android ADB 验收保持已通过。
