# 调研
- 源安卓 main：e2a031547e9544a04a8150256f18740b2974f39b，GitHub 权限 admin/push，main 未保护且无 rulesets。
- 源安卓是 Java 平台 WebView，五个 dock 入口，原生搜索与同人/量贩轮询，最小 Android 23。
- 网页公开路由包括首页、视频、同人、量贩、论坛、日报、星图、关于、指南、注册、登录、强制改名、设置、用户公开页、详情页、fallback 与彩蛋。
- 网页来源：https://github.com/stardust-fans/star-dust-fans；只读参考克隆位于当前工作区 work/web-reference。
- 当前主机 Windows，已有 git、gh、Node、Java；未发现 swift/xcodebuild 或默认位置 Android SDK。
- 用户确认保留 WebView 架构；所有网页功能复用站点，原生层补全入口、文件选择、导航、错误恢复和系统通知。
