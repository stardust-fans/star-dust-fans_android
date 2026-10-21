# 签名与真机验证
- [x] 确认开发证书用途、私钥可用性与现有签名工具；不输出密钥或密码。
- [x] 确认可构建 Apple iphoneos 真机二进制的环境。
- [x] 配置有效 development provisioning profile。
- [x] 确认新固定 recipe 已在线，并取得成功签署的 IPA。
- [x] 独立核验 IPA 签名、profile 和授权设备范围。
- [x] IPA 验签通过后，重新连接并解锁已登记 iPhone，完成安装验收。
- [x] 对 build 7 完成启动/进程存活与崩溃/ANR 验收。
- [x] 人工复核 build 7 首页和五个栏目底栏的视觉效果。
- [x] 核对 Android USB/网络 ADB 是否同一设备、已装应用版本和签名，保留用户应用数据。
- [x] 安装/更新安卓包；如果签名不匹配，不自动卸载或清空数据。
- [x] 记录启动、导航、搜索、文件选择、全屏、后台/恢复和进程重建后的运行证据。
- [x] 捕捉 Java/native 崩溃、ANR、WebView renderer 异常；发现问题后交回独立 worktree 修复、构建并复测。
- [x] 按仓库规则合并已验证修复并交付包和准确的验收结论。
- [x] 为设备工具失败保留退出码和诊断输出；将 UIAutomator 137 与应用崩溃分开记录。
- [x] 安装同签名的独立 instrumentation 测试包，在实际 Activity/WebView 边界验证选择器取消、全屏返回、销毁后回调和导航。
- [x] 以 instrumentation 作为唯一自动化真机入口，移除本次新增但受网页 accessibility dump 限制的导航脚本。
- [x] 用户确认没有其他 iOS 签名入口并授权扩展中央服务；完成 IPA recipe、控制面、部署和当前应用调用。
- [x] 用户授权前往 Apple Developer 新建开发签名材料；安全生成 CSR，登录后已创建 certificate/App ID/profile，保留旧证书。

## 当前状态（2026-10-21）

- build 6 的签名、独立验包、安装及自动启动/崩溃验收已完成并保留历史记录。
- build 7 已通过移动 CI、recipe `21-3` / `1bc3bd9` 签名、独立 IPA 验证，并成功更新安装到登记 iPhone 14 Pro。
- build 7 的三轮 20 秒冷启动/进程存活检查通过；每轮 5 秒及 20 秒采样均确认相同目标 bundle PID 存活，未发现新的目标 StarDust crash report。
- Android ADB 真机安装、运行及崩溃验收已通过，保持完成，不重复测试。
- build 7 正常页面截图确认顶栏、Web 页面和五个等宽栏目正常显示；一度出现的 DVT 启动黑屏作为启动方式差异单独调查，记录在 012。
