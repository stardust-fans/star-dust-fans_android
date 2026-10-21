# Apple 底栏栏目布局

- [x] 检查当前 Apple 底栏、顶部菜单、contract tabs 和用户反馈截图。
- [x] 先记录最小布局方案，再调整为五个等宽 tab，保持适当触控尺寸和无障碍选中态。
- [x] 将返回、刷新和分享放入顶部“更多”菜单；保留返回禁用条件、当前 WebView 刷新与 nil 安全分享行为。
- [x] 检查受影响的现有测试；当前没有覆盖底栏 SwiftUI UI test，既有 XCTest 不覆盖呈现布局。
- [x] 将 Apple CFBundleVersion 从 6 提升至 7（Debug/Release 一致），保留版本 1.3.0。
- [ ] 请求主控运行 macOS Xcode 构建及既有测试。
- [x] 检查 diff 仅包含 Apple 导航 UI/build number 与本任务审计，提交本地分支。
- [ ] 由主控重建安装后进行真机截图复核；用户可见结果仍待主控确认。
