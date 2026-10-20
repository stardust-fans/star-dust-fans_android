# 迁移计划
- [x] 确认源仓库、权限与远端 main 保护状态。
- [x] 确认 Apple 沿用 SwiftUI + WKWebView。
- [x] 移动安卓源码到 apps/android 并保留历史。
- [x] 并行核对网页路由和交互，建立共享契约及覆盖测试。
- [x] 在独立 worktree 修复安卓完整导航及移动端网页能力。
- [x] 在独立 worktree 实现 iPhone/iPad 导航、WebKit 集成及系统能力。
- [ ] 集成子任务提交，运行契约、Android 构建和 Apple 可用验证。
- [x] 加入持续集成和准确的构建文档。
- [ ] 合并到本地 main，复查保护状态并推送。

## 交付边界
网页、Worker 与数据库继续由现有 star-dust-fans 仓库维护和部署。此仓库交付移动双端及共享契约，不迁入后端或触发网站生产部署。Apple 使用 Windows 无法本地运行的 Xcode 能力，需用 macOS CI 验证；未通过前不得报告 Apple 构建成功。论坛第三方 cookie 与实际登录、上传、外链交互需设备验证，不将静态检查等同于运行通过。
