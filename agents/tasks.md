# 星尘移动端任务追踪
> 准则版本: v0.2.2

| 编号 | 任务名称 | 任务描述 | 变更动机 | 状态 |
| :--: | :------: | :------: | :------: | :--: |
| 001 | [Feature] MobileMonorepo | 迁移安卓目录、加入 Apple 客户端、统一网页功能契约并完成集成验证 | 用户要求双端完整覆盖现有网站 | ✅ 已完成 |
| 002 | [Feature] SiteContract | 网页功能清单及来源验证 | 双端共享功能依据 | ✅ 已完成 |
| 003 | [Feature] AndroidParity | 安卓完整导航和系统交互 | 对齐网页能力 | ✅ 已完成 |
| 004 | [Feature] AppleClient | iPhone/iPad 原生外壳 | 新增苹果端 | ✅ 已完成 |
| 005 | [Validation] DeviceSigning | iOS 签署、IPA 验收及 iPhone 真机测试（Android ADB 真机测试已完成） | 用户要求自签与本机实测 | ✅ 已完成 |
| 006 | [Validation] AppleSigning | 核验中央签名能力并构建 unsigned iphoneos 产物 | 明确 iOS 签名前置条件 | ✅ 已完成 |
| 007 | [BugFix] DeviceCrash | 修复 WebView 销毁回调并补充真机 instrumentation | 防止退出时空引用与选择器回调泄漏 | ✅ 已完成 |
| 008 | [Feature] CentralIOSSigning | 中央签名提交流程与 iOS 真机验收 | 通过已授权签名服务产出可验证真机包 | ✅ 已完成 |
| 009 | [Feature] SignedIPAValidation | 为已签名 iOS IPA 提供独立、只读的归档和签名报告验收工具 | 用户要求签名产物本地可复核 | ✅ 已完成 |
| 010 | [BugFix] VerifySourceArchiveParentEntries | 接受合法 xcarchive 显式父目录项并拒绝额外目录 | 真实归档带有目录记录 | ✅ 已完成 |
| 011 | [BugFix] NavigationBar | 清理 Apple 底栏栏目布局并将返回/刷新/分享移入顶部更多菜单 | 真机确认原有控件挤压栏目按钮 | ✅ 已完成 |
| 012 | [Investigation] WebViewBlackScreen | 对照启动方式下黑屏与正常显示证据并记录验收建议 | 宿主进程仍前台存活但页面不可见 | ✅ 已完成 |
| 013 | [Ops] GitEdgeiOSSigning | 将 iOS 签名请求迁移到 GitEdge 原生来源工件合同 | 完成旧签名执行器退役准备 | 🔄 进行中 |
| 014 | [Ops] GitEdgeMaintenanceController | 在正确 Android 仓库中安装固定的一次性主机维护 controller | 使用授权的 Runner API 凭据执行主机验收 | 🔄 进行中 |
| 015 | [Feature] CompleteGitEdgeIOSSigningWorkflow | 等待 GitEdge iOS 签名完成，下载并验证 IPA 后发布验收产物 | 让自动签名链路以本地既有验证器验收并输出可安装产物 | 🔄 进行中 |
| 016 | [Ops] WindowsBrokerReadback | 安全读取 Windows broker 更新回执并清理已完成的一次性任务 | 验证真实主机更新而不影响普通工作 | 🔄 进行中 |
