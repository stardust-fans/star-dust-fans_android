# 签名与真机验证
- [x] 确认开发证书用途、私钥可用性与现有签名工具；不输出密钥或密码。
- [x] 确认可构建 Apple iphoneos 真机二进制的环境。
- [x] 配置有效 development provisioning profile。
- [ ] 确认新固定 recipe 已在线，并取得成功签署的 IPA。
- [ ] 独立核验 IPA 签名、profile 和授权设备范围。
- [ ] IPA 验签通过后，重新连接并解锁已登记 iPhone，完成安装验收。
- [ ] 启动应用并完成 iPhone 启动及崩溃/ANR 验收。
- [x] 核对 Android USB/网络 ADB 是否同一设备、已装应用版本和签名，保留用户应用数据。
- [x] 安装/更新安卓包；如果签名不匹配，不自动卸载或清空数据。
- [x] 记录启动、导航、搜索、文件选择、全屏、后台/恢复和进程重建后的运行证据。
- [x] 捕捉 Java/native 崩溃、ANR、WebView renderer 异常；发现问题后交回独立 worktree 修复、构建并复测。
- [ ] 按仓库规则合并已验证修复并交付包和准确的验收结论。
- [x] 为设备工具失败保留退出码和诊断输出；将 UIAutomator 137 与应用崩溃分开记录。
- [x] 安装同签名的独立 instrumentation 测试包，在实际 Activity/WebView 边界验证选择器取消、全屏返回、销毁后回调和导航。
- [x] 以 instrumentation 作为唯一自动化真机入口，移除本次新增但受网页 accessibility dump 限制的导航脚本。
- [x] 用户确认没有其他 iOS 签名入口并授权扩展中央服务；完成 IPA recipe、控制面、部署和当前应用调用。
- [x] 用户授权前往 Apple Developer 新建开发签名材料；安全生成 CSR，登录后已创建 certificate/App ID/profile，保留旧证书。

## 当前状态（2026-10-21）

- Mac 已完成 Xcode 27.1 首次启动、许可、SDK 检查；GitEdge 私有 Mac runner 可用。无需再等待 Xcode 初始化。
- profile 覆盖两台已登记设备，包含 iPhone 14 Pro。当前 USB 设备数为 0；待 IPA 验签完成后再连接设备。
- 现代 PKCS#12 导入失败已通过合成材料对照确认；中心凭据已用同一证书与私钥的原生 PKCS#12 格式更新。native run `39546696981` 成功导入，但随后被旧的证书 CN 后缀匹配逻辑拦截。
- identity SHA 绑定修复已审核，74 项测试通过；recipe `21-3` / `1bc3bd9` 正在部署。需确认新 recipe live 并取得成功签名产物后继续。
- Android ADB 真机安装、运行及崩溃验收已通过，保持完成，不重复测试。iOS 尚无 IPA，尚未进行 iPhone 安装或启动验收，本任务仍进行中。
