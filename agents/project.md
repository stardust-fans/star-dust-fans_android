# 星尘移动客户端
> 最后更新：2026-10-20

## 项目目标
将现有安卓仓库整理为移动端 monorepo，加入 iPhone/iPad 客户端，对照线上网页全部公开功能提供入口与原有网页交互。

## 技术栈
- Android：Java / 平台 WebView / Gradle。
- Apple：SwiftUI / WKWebView / UserNotifications / BackgroundTasks。
- 共享：站点路由及功能契约；网站仍由原仓库独立部署。

## 模块结构
- apps/android：保留安卓构建方式和应用标识。
- apps/apple：iPhone/iPad 应用和 Xcode 项目。
- packages/site-contract：网页功能、原生导航和来源清单。
- test：所有验证脚本、测试与测试工程。

## 项目规则
见 [local.instructions.md](local.instructions.md)。
