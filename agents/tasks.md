# 星尘移动端任务追踪
> 准则版本: v0.2.2

| 编号 | 任务名称 | 任务描述 | 变更动机 | 状态 |
| :--: | :------: | :------: | :------: | :--: |
| 001 | [Feature] MobileMonorepo | 迁移安卓目录、加入 Apple 客户端、统一网页功能契约并完成集成验证 | 用户要求双端完整覆盖现有网站 | ✅ 已完成 |
| 002 | [Feature] SiteContract | 网页功能清单及来源验证 | 双端共享功能依据 | ✅ 已完成 |
| 003 | [Feature] AndroidParity | 安卓完整导航和系统交互 | 对齐网页能力 | ✅ 已完成 |
| 004 | [Feature] AppleClient | iPhone/iPad 原生外壳 | 新增苹果端 | ✅ 已完成 |
| 005 | [Validation] DeviceSigning | iOS 签署、IPA 验收及 iPhone 真机测试（Android ADB 真机测试已完成） | 用户要求自签与本机实测 | 🔄 进行中 |
| 006 | [Validation] AppleSigning | 核验中央签名能力并构建 unsigned iphoneos 产物 | 明确 iOS 签名前置条件 | ✅ 已完成 |
| 007 | [BugFix] DeviceCrash | 修复 WebView 销毁回调并补充真机 instrumentation | 防止退出时空引用与选择器回调泄漏 | ✅ 已完成 |
| 008 | [Feature] CentralIOSSigning | 中央签名提交流程与 iOS 真机验收 | 通过已授权签名服务产出可验证真机包 | 🔄 进行中 |
| 009 | [Feature] SignedIPAValidation | 为已签名 iOS IPA 提供独立、只读的归档和签名报告验收工具 | 用户要求签名产物本地可复核 | ✅ 已完成 |
| 010 | [BugFix] VerifySourceArchiveParentEntries | 接受合法 xcarchive 显式父目录项并拒绝额外目录 | 真实归档带有目录记录 | 🔄 进行中 |
| 011 | [BugFix] NavigationBar | 清理 Apple 底栏栏目布局并将返回/刷新/分享移入顶部更多菜单 | 真机确认原有控件挤压栏目按钮 | 🔄 进行中 |
