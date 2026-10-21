# Apple 底栏栏目布局

- [x] 检查当前 Apple 底栏、顶部菜单、contract tabs 和用户反馈截图。
- [x] 先记录最小布局方案，再调整为五个等宽 tab，保持适当触控尺寸和无障碍选中态。
- [x] 将返回、刷新和分享放入顶部“更多”菜单；保留返回禁用条件、当前 WebView 刷新与 nil 安全分享行为。
- [x] 检查受影响的现有测试；当前没有覆盖底栏 SwiftUI UI test，既有 XCTest 不覆盖呈现布局。
- [x] 将 Apple CFBundleVersion 从 6 提升至 7（Debug/Release 一致），保留版本 1.3.0。
- [x] 主控 macOS CI 的 iOS archive 与 Apple checks 通过（source run `39550930654` / CI run `39550930834`）。
- [x] 主控通过 installation proxy 安装 build 7 并确认 readback 为 1.3.0/build 7，操作者确认应用前台可见。
- [x] 收到 build 7 三轮 20 秒启动/存活与 crash 检查结果；检查通过。
- [x] 取得 build 7 设备截图并完成底栏人工视觉复核。
- [x] 检查 diff 仅包含 Apple 导航 UI/build number 与本任务审计，提交本地分支。
