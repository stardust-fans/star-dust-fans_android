# 星尘移动端

Android 与 iPhone/iPad 客户端的 monorepo。两个客户端通过持久化 WebView 访问 [星尘站](https://stardustinfinity.top)，复用网站的登录、投稿、评论、头像、论坛和后台，不复制网站后端。

| 目录 | 内容 |
| --- | --- |
| `apps/android` | Java / Android WebView 客户端，Android 6.0+ |
| `apps/apple` | SwiftUI / WKWebView 客户端，iOS / iPadOS 16+ |
| `packages/site-contract` | 两端共用的页面、导航、搜索和通知契约 |
| `test` | 契约、Android 与 Apple 测试 |

五个主入口为视频、同人、量贩、论坛和我的。全部页面菜单提供首页、日报、星图、指南、关于、账号入口和管理后台；详情、投稿、评论、分页排序和账号操作沿用网页。管理后台沿用网站权限校验。附件上传使用系统文件选择器，附件下载交给系统浏览器保存，邮件联系链接打开邮件应用。

## Android

在 Android Studio 中打开 `apps/android`，使用 JDK 17，安装 Android SDK 34 与 Build Tools 36.0.0。

```sh
cd apps/android
./gradlew :app:assembleDebug
```

Windows 使用 `gradlew.bat`，也可以在仓库根目录运行 `npm run build:android`。调试 APK 位于 `apps/android/app/build/outputs/apk/debug/`。

Windows 的独立构建方式无需 Gradle：

```powershell
& ./apps/android/build.ps1 -Proxy ''
```

脚本优先使用 `ANDROID_HOME`、`ANDROID_SDK_ROOT` 或 Android Studio SDK，也支持下载缺少的组件。APK 位于 `apps/android/out/star-dust-mobile.apk`，以本地调试密钥签名。正式发布需要另行配置发布签名；不要提交签名密钥。

## iPhone / iPad

在 macOS 上用 Xcode 打开 `apps/apple/StarDust.xcodeproj`，选择 `StarDust` scheme 和设备。真机安装需要在 Signing & Capabilities 中选择自己的开发团队。

```sh
xcodebuild -project apps/apple/StarDust.xcodeproj -scheme StarDust \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

无签名的模拟器构建无需开发者账号，不能直接作为真机 IPA 安装。应用使用持久化网站存储，保留登录会话，并通过系统文件选择支持上传；登录、论坛单点登录和上传仍需设备验收。

## 通知

仅同人和量贩更新可产生本地通知。首次启用以及关闭后重新启用会建立新基线，避免补发历史条目。视频不参与通知轮询。

Android 保留前台轮询、后台闹钟和 JobScheduler。iOS 使用前台检查与系统调度的后台刷新；后台时间由系统决定，强制退出、关闭后台刷新或系统节能策略都可能阻止检查，不能保证固定间隔。系统通知权限与应用内开关需要同时启用。

## 验证

Node.js 22+ 无需安装依赖：

```sh
npm test
```

设置 `WEB_REFERENCE` 为网页源码目录可把契约与该版本网页路由直接比对。网页来源版本记录在共享契约中。Apple 的 XCTest 和无签名模拟器构建由 macOS CI 执行，Android 的 APK 由 Linux CI 构建。

实际账号、论坛、附件上传及通知送达的验收清单见 `packages/site-contract/README.md`。静态测试和构建通过不代表这些线上交互已在真机完成验收。

### 中央真机签名

仓库管理员需配置 `SIGNING_API_KEY` Actions secret。在默认分支运行 `iOS signing` workflow 会生成 unsigned Xcode archive 并提交签名请求。完成后，从运行摘要取得 request ID，再由获授权的管理员通过中央签名服务的受保护下载界面取回已签名 IPA；公开仓库的 Actions artifacts 只包含 unsigned archive，不包含签名包。

Android 原生真机测试 APK 可用本机 Android SDK 与 JDK 构建。测试 APK 必须使用与待测应用相同的签名密钥：

```powershell
./apps/android/build.ps1 -Proxy ''
./test/android/build-instrumentation.ps1 -SdkRoot $env:ANDROID_HOME -Keystore "apps/android/keys/debug.keystore"
adb install -r "apps/android/out/star-dust-mobile.apk"
adb install -r "test/android/instrumentation/device-smoke.apk"
adb shell am instrument -w -r com.stardust.fans.test/.DeviceSmokeInstrumentation
```

测试会打开系统文件选择器并立即取消，不会选择或上传文件。所有检查通过时，instrumentation 结果会显示 `status=passed`。

源网站继续在 [网页仓库](https://github.com/stardust-fans/star-dust-fans) 维护与部署。本仓库沿用 AGPL-3.0 许可证。
