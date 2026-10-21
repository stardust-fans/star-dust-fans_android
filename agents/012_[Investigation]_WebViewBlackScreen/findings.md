# Findings

- 用户确认真实现象为 StarDust 前台运行一段时间后页面显示黑屏；应用仍然前台运行不等于 WKWebView 内容进程正常。
- 黑屏时 DVT 报告目标 bundle 宿主 PID 仍为 application/foreground-running，PID 自上次冷启动稳定，suspend count 为 0。宿主主线程和 UIKit eventfetch 线程处于 Mach message 风格等待；这本身没有指出 WebView 内容为何黑屏。
- 仅目标 app 的 20 秒 os_trace 只有一条关于 child PID 的 Security entitlement `cs_flags` 信息，没有清晰的崩溃或 WebKit 错误证据。当前未确认该 child PID 是 WKWebContent，也未证明它触发了症状。
- 初始 ScreenCaptureService 结果只有状态栏与黑色内容，且用户观察到实际黑屏，故不能先归咎截图工具；后续跨启动方式的截图结果见操作性结论。
- `CoreDevice getlockstate` 在当前 OS 不实现；记录为能力限制，不重复调用。
- `WebContent.Coordinator` 实现了 WKNavigationDelegate 的策略、加载开始/完成/失败回调，但没有实现 `webViewWebContentProcessDidTerminate(_:)`。若 WebKit 内容进程实际终止，当前代码没有显式恢复/记录处理；目前 trace 未证明该 callback 曾发生，因此它只是一个应取证的候选路径，不是已确认根因。先查证 WebKit 进程状态/termination，再决定是否添加处理。
- `WebSession` 持有 WKWebView 的强引用；`WebContent.makeUIView` 复用该实例。底栏变更仅改 SwiftUI chrome 布局，没有替换/重建 WebView、改 WebView 数据存储或变更导航来源。

## 操作性结论（2026-10-21）

- DVT 冷启动模式下曾连续观察到黑色内容；CoreDevice 激活已运行应用且 `kill_existing=false` 后独立 DVT 截图仍黑。随后操作者手动重新打开应用时进程 PID 已变化，因此不能称为同进程恢复，也不宣称用户 force quit。
- 手动打开后的常规 120 秒观测中，同一 PID 持续运行，60 秒和 120 秒截图均显示完整页面。之后 CoreDevice `launch_application(kill_existing=true,start_suspended=false)` 启动新 PID `4827`；+30 秒截图仍为完整 UI，进程稳定。
- 一次初始 CoreDevice 冷启动监控出现 DTXNSCodingError，因为 DVT `is_running_pid` 收到 `XpcInt64Type` 而非 Python int；launch 本身已成功。转换 PID 类型后继续监控同一个 `4827`，没有再次 launch。
- 现有证据关联的是启动/自动化入口差异：DVT 自动启动时黑屏，手动打开后的持续观察与 CoreDevice fresh launch 均正常。未来设备验收使用 CoreDevice launch 路径。未定位应用代码根因，不能据此宣称未知用户场景中的黑屏 bug 已永久修复；不添加 speculative WKWebView reload patch。
- 采集来源交叉结果：DVT automatic launch 与激活该进程后 DVT screenshot 为黑；手动重开后的 ScreenCaptureService 截图呈现完整 UI，CoreDevice fresh launch +30 秒截图亦完整。用户确认的“运行一段时间后黑屏”症状与本轮 DVT 启动路径关联，但当前没有应用自身状态或 WKWebContent termination 证据可证明其底层原因。
