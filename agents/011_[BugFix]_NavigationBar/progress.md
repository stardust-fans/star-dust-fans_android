# Progress

- 从健康 mobile main `724c914` 创建隔离 worktree `ios-clean-tabbar`，分支 `codex/ios-clean-tabbar`。
- 之前的 apple-client worktree 在检查时报告 `0000000 (error)`，其 worktree HEAD 元数据为全零；按主控要求原样保留，未修复、移动或删除。新 worktree 由健康 primary 创建并可正常使用。
- 检查 Apple SwiftUI 导航、站点 contract tabs、更多页面入口和现有测试覆盖后，记录最小方案；尚未修改应用代码。
- 根目录没有针对 SwiftUI 底栏布局的 UI 测试；现有 XCTest 覆盖 Foundation 导航策略及模型，不新增实现镜像测试。计划仅触及 `App.swift` 与 iOS `CURRENT_PROJECT_VERSION` 两个配置值，并由主控 macOS workflow 编译/真机复核。
- 更新 `apps/apple/StarDust/App.swift`：底栏仅呈现 contract tabs，每个按钮均分宽度并提供 44pt 最小高度及选中无障碍状态；顶部 ellipsis 菜单放置返回、刷新和分享动作。未替换 WebView 或改变其数据/路由。
- 菜单动作使用 `Button` + `Label` 写法，避免依赖较新的 title/systemImage 按钮初始化器。
- 更新 Xcode app target Debug/Release `CURRENT_PROJECT_VERSION` 为 7，并将 `Info.plist` 的 `CFBundleVersion` 绑定到该设置；营销版本仍为 1.3.0。
- Windows 主机没有 Xcode 构建环境；Swift compile 与既有 XCTest 留给主控 macOS workflow 验证。尚未做设备 UI 复核。
- Build 7 source run `39550930654` 与 CI run `39550930834` 的所有 checks 通过，私有签名与独立 IPA verification 成功。安装 proxy 更新安装后 readback 为 1.3.0/build 7；操作者确认应用正在前台。三轮 20 秒启动/存活检查通过，每轮 5 秒与 20 秒相同 PID 均存活、无新的 StarDust crash report。ScreenCaptureService 仍返回黑色内容；用户确认实际应用在运行一段时间后黑屏，视觉验收暂停并转入任务 012 取证。
- 最终 UI 验收：手动重开后采集到顶栏、网页及五个等宽栏目，返回/刷新/分享不再挤占 tab 区域；120 秒同 PID 正常观测，60 秒和 120 秒截图完整。CoreDevice `kill_existing=true` fresh launch 也显示正常。视觉布局通过；黑页只在先前 DVT 自动启动模式观察到，未证明为应用代码缺陷。
