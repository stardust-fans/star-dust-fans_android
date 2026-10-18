# 星尘粉丝站 · Android 客户端

把 [stardustinfinity.top](https://stardustinfinity.top) 包成原生 App，并加上**同人 / 量贩上新通知**。

- **纯前端**：App 内不含任何后端，直接加载线上站点；登录、投稿、评论、头像全部复用站点现有能力
- **无第三方推送**：不依赖 Firebase / FCM / 任何推送服务，通知由 App 自己轮询公开接口后本地发出
- **视频永不通知**：代码里只有 `/api/fanart` 与 `/api/shop` 两处请求，**不存在** `/api/songs` 调用
- `minSdk 23`（Android 6.0+）、`targetSdk 34`、零第三方依赖（不使用 AndroidX）

---

## 一、构建

### 方式 A：Android Studio（推荐日常开发）

> ⚠️ **必须用 ASCII 路径打开**：AGP 会直接拒绝含非 ASCII 字符的项目路径
> （本工程在 `粉丝站` 下）。已建好一个目录联接：
>
> ```
> F:\stardust-mobile  ->  F:\desktop\粉丝站\git\star-dust-mobile
> ```
>
> 在 Android Studio 里 **Open 这个 `F:\stardust-mobile`**，不要打开真实中文路径。
> 联接重启后依然有效（它不是 subst，是持久化的目录联接）。
> 若联接被删，重建命令：
>
> ```powershell
> New-Item -ItemType Junction -Path F:\stardust-mobile -Target "F:\desktop\粉丝站\git\star-dust-mobile"
> ```

1. Android Studio → **Open** → 选 `F:\stardust-mobile`
2. 首次 Gradle Sync 会下载 AGP 与依赖（走 Studio 自己的代理设置：
   *Settings → Appearance & Behavior → System Settings → HTTP Proxy*，
   填 `127.0.0.1:7890` 即可）
3. 等 Sync 完成 → 连手机（打开 USB 调试）或启动模拟器 → 点 ▶ Run
4. 出包：*Build → Build Bundle(s)/APK(s) → Build APK(s)*
   → 产物在 `app/build/outputs/apk/debug/app-debug.apk`

工程已包含：Gradle wrapper（8.9）、`local.properties`（指向你的 SDK）、
`buildToolsVersion '36.0.0'`、以及 SDK 里所需的 `platforms/android-34`。

> `gradle.properties` 里带了一组 `systemProp.*.proxyHost=127.0.0.1:7890`，
> 供命令行 Gradle 构建使用；不用代理时注释掉即可（Studio 不受其影响）。

### 方式 B：命令行（不需要 Gradle / Android Studio）

```powershell
# 在 PowerShell 里执行；执行策略受限时用下面第二种写法
.\build.ps1

# 若提示“running scripts is disabled”
cd F:\desktop\粉丝站\git\star-dust-mobile
Invoke-Expression (Get-Content .\build.ps1 -Raw)
```

脚本做的事：

```
aapt2 compile → aapt2 link（顺带生成 R.java）→ javac → d8
  → 把 classes.dex 塞进 APK → zipalign → apksigner 签名 → 自检
```

产物：`out\star-dust-mobile.apk`

**SDK 定位顺序**：`ANDROID_HOME` → `ANDROID_SDK_ROOT` → `%LOCALAPPDATA%\Android\Sdk`
→ 本项目 `sdk\`。都找不到时会自动下载
`build-tools_r36_windows.zip` 与 `platform-34-ext7_r03.zip`（约 120 MB，默认走
`127.0.0.1:7890` 代理，可用 `-Proxy` 改，或 `-Proxy ''` 走直连）。

> **为什么必须 build-tools 36**：build-tools 34 自带的 d8（R8 8.2.2）在转换含嵌套匿名类的
> class 时会抛内部 `NullPointerException`（本工程实测必现）。36 的 d8 正常。
> 若你手动指定了 34，请换 36。

产物：`out\star-dust-mobile.apk`（约 **45 KB**，零第三方依赖）。

可选参数：

| 参数 | 说明 |
|---|---|
| `-Clean` | 清空 `build\` 后重建 |
| `-Proxy http://127.0.0.1:7890` | 下载 SDK 时使用的代理 |
| `-NoSdkDownload` | 禁止自动下载（强制使用已装好的 SDK） |

---

## 二、安装

```powershell
adb install -r out\star-dust-mobile.apk
```

也可以把 APK 传到手机上点开安装（需允许“安装未知来源应用”）。

> 用调试密钥签名，仅供自用安装。要上架请换正式 keystore 并改 `app/build.gradle` 的 `signingConfig`。

---

## 三、界面

```
┌──────────────────────────────────┐
│  (头像)  🔍 搜索星尘…        ⚙   │  ← 原生顶栏
├──────────────────────────────────┤
│                                  │
│         WebView（站点内容）       │
│                                  │
├──────────────────────────────────┤
│  我的   视频   同人   量贩   论坛  │  ← 原生 dock
└──────────────────────────────────┘
```

| 元素 | 行为 |
|---|---|
| 顶栏头像 | 已登录显示头像（无则占位图标）；点击进入「我的」 |
| 搜索框 | 点击打开 App 内搜索页，搜视频 / 同人 / 量贩，点结果直达对应页面 |
| 顶栏齿轮 | App 的推送设置页（通知开关 / 频率 / 忽略电池优化） |
| 底部 5 个 tab | 分别对应站点 `/user` `/videos` `/fanart` `/shop` `/omew` |

- 内容仍是线上站点本身，所以登录、投稿、评论、头像、量贩购买链接全部照常可用
- App 内会**隐藏站点自带的导航栏和 Live2D 悬浮角色**（注入一段 CSS），避免出现两层导航；
  其余页面（关于、日报、星图、设置）仍可通过页面底部入口进入
- 选中态用主题色 `#9999FF` 染色，dock 图标是脚本生成的单色线性图标（`tools/make-ui-icons.cjs`）

---

## 四、通知机制

### 三级节奏

| 场景 | 默认频率 | 实现 |
|---|---|---|
| App 在前台 | **60 秒**（可选 30/60/120 秒） | `MainActivity` 内 `Handler` 定时；每次回到前台、切页面立刻查一次 |
| App 在后台 | **5 分钟**（可选 3/5/10/15/30 分钟） | `AlarmManager.setAndAllowWhileIdle` + 触发后自链下一次 |
| 兜底 | 30 分钟 | `JobScheduler` 周期任务，闹钟被系统清理时可自愈 |
| 重启后 | — | `BootReceiver` 重新排闹钟 |

### 判定逻辑

```
GET /api/fanart → 取 max(id)，与本地上次记录比较
GET /api/shop   → 取 max(id)，与本地上次记录比较
有新条目 → 逐条发通知（单次最多 5 条，超出的合并成「还有 N 件…」）→ 更新基线
```

- **首次启用只记录基线**，不会把历史内容全部推一遍
- 关掉再打开通知会重置基线，避免补推停用期间的内容
- 拉取失败静默跳过，下个周期再试

### 为什么没有视频通知

`ApiClient` 里只有 `fanart` 和 `shop` 两个类型、两条 URL，代码中不存在任何
`/api/songs` 请求。所以视频更新**在结构上不可能**触发通知——不是靠开关关掉的。

### 点击通知

通知携带 `https://stardustinfinity.top/fanart/<id>` 或 `/shop/<id>`，
`MainActivity` 读 `Intent.data` 直接跳到对应详情页。

---

## 五、App 内设置页

右上角半透明齿轮（老设备也可按实体菜单键）进入：

- 同人上新 / 量贩上新 开关
- 前台检查频率、后台检查频率
- **立即检查一次**（验收用）
- **忽略电池优化**：授权后后台延迟基本消失（不授权也能用，Doze 下会慢些）
- 系统通知设置、打开网站设置（账号 / 头像 / 密码那个页面）

> 网站的 `/settings` 页面保持不变；推送开关放 App 内，因为通知权限与轮询状态都是本地能力。

---

## 六、已知限制

1. **“支持 Android 6+”= 能装能启动；能否正常渲染取决于设备 WebView 版本。**
   Vue 3 需要较新引擎，Android 6 出厂 WebView 会白屏 —— 请把「Android System WebView」
   升级到较新版本。这是 WebView 路线的硬限制，任何外壳方案都一样。
2. **后台最快约 5 分钟**（Doze 深度省电时系统限流到约 9 分钟），这是 Android 的硬限制。
   要秒级只能上 FCM，那需要改站点 Worker 并发推送，本项目刻意没有这么做。
3. 需要联网，无离线内容；不是原生 UI，是响应式站点的 App 外壳。
4. 前台定时器只在 App 可见时运行。

---

## 七、常见改动

### 换站点地址

改 `app/src/main/java/com/stardust/fans/ApiClient.java` 里的 `BASE`，
以及 `MainActivity` 里的 `HOME_URL`（两处都改）。

### 换包名

1. `app/build.gradle`：`namespace` 与 `applicationId`
2. `build.ps1`：`$Package`
3. Java 源码的 `package com.stardust.fans;` 与目录路径

### 换图标

把站点 `static/logo.svg` 换成新图后重新生成：

```powershell
node tools\make-icons.cjs   # 实际文件名为 make-icons.mjs
```

脚本会用站点仓库里的 `sharp` 生成 5 个密度的启动图标与通知小图标。

### 重新签名

删掉 `keys\debug.keystore` 后重新构建会自动生成新的。**更换签名后必须先卸载旧版**才能安装。

---

## 八、构建踩坑记录（都已在脚本里处理）

| 现象 | 原因 | 脚本里的处理 |
|---|---|---|
| `aapt2: error: failed to open directory` | Windows 上 aapt2/zipalign 把 argv 当 UTF-8 解析，路径含中文（本项目在 `粉丝站` 下）就找不到目录 | 自动 `subst` 映射一个纯 ASCII 盘符（Z:…）来构建，结束自动解除 |
| d8 内部 `NullPointerException: String.length()` | build-tools 34 的 R8 8.2.2 处理嵌套匿名类有 bug | 固定使用 build-tools 36 |
| 改了代码但 dex 里还是旧类 | `build/classes` 残留上次的 `.class` | 每次构建前清空 `build/` |
| `javac` 报 bootclasspath 相关错误 | JDK 21 + `-bootclasspath` | 改用 `-source 8 -target 8 -classpath android.jar` |
| PowerShell 报“running scripts is disabled” | 执行策略 | 用 `powershell -ExecutionPolicy Bypass -File build.ps1` |
| 脚本中文乱码/解析失败 | PS 5.1 读无 BOM 的 UTF-8 会按 ANSI 解析 | `build.ps1` 以 **UTF-8 with BOM** 保存 |

> Android Studio 走的是 AGP 自带的 R8，不受上面前两条影响。

---

## 九、目录说明

```
app/src/main/
├─ AndroidManifest.xml          权限、四大组件声明
├─ java/com/stardust/fans/
│  ├─ MainActivity.java         WebView 外壳 + 前台轮询 + 深链
│  ├─ SettingsActivity.java     推送设置页
│  ├─ PollReceiver.java         后台闹钟落点（拉取→通知→自链）
│  ├─ BootReceiver.java         开机重排
│  ├─ PollJobService.java       30 分钟兜底
│  ├─ PollWorker.java           轮询核心（三个入口共用）
│  ├─ ApiClient.java            只读接口客户端（仅 fanart / shop）
│  ├─ Notifier.java             通知渠道与通知构建
│  ├─ Scheduler.java            闹钟 + 兜底任务调度
│  └─ Prefs.java                开关 / 频率 / 轮询基线
└─ res/                         主题、布局、图标
```
