# 进度
- 核验同一台 Android 14/API34 真机的 USB/wireless transport 后固定 USB；安装 1.3.0 并原位升级同签名 1.3.1/code7，保留数据。
- 开启 package UID 限定 logcat，分别保存启动界面、公共页面和 exit-info。手工截图确认同人/量贩/论坛登录页面正常显示，设置页控件可见。
- 原生搜索 ADB 文本被当前中文 IME 改写 -> 不改变输入法或剪贴板 -> instrumentation 改用 EditText 精确填入已知公开 BV 查询，后续检查网络结果。
- UIAutomator 在 fanart 页面返回137而 PID 与渲染截图正常；设置、量贩和登录页 dump 成功。测试工具失败单独登记，未计为应用崩溃。
- Android 子分支交付生命周期 guard 修复和 fixture；独立审核未发现 guard 的剩余可确认崩溃路径，并识别/修正 fixture 外部 Activity monitor 和队列覆盖问题。
- 最终 instrumentation 五组及 tabs/pages/settings/search 子项全部通过，包含 11 轮销毁/回调、原生实际选择器取消与 MIME、多选、全屏返回。
- 冷启 445ms、后台恢复保持同一 PID、显式 force-stop 后进程重建冷启 459ms；最终 UID logcat fatal/native/ANR 匹配 0，package exit-info crash/native crash/ANR reason4/5/6为0。安装、instrumentation 起止、显式 force-stop 单独记录为预期退出。
- 从设备回读 base.apk，与输出 APK 的 SHA256 同为 D238E3E153A115E949792C3DB2B498B46439E1FA76B7DF1F951918D07DFA73F5；只卸载本次创建的独立测试包，保留主应用与其数据。停止 UID collector。
- 用户明确新增中央 IPA 签名功能，并授权前往 Apple Developer 创建缺少的材料；两个独立 worktree 分别实施中央控制面及固定 recipe，root处理凭据、部署、移动 workflow 接入。Apple 登录/2FA仍待用户完成。
- 受 ACL 保护的本地目录已生成加密 RSA2048 私钥、DPAPI保护密码和验过自签名的 public CSR，未输出材料/密码、未提交到仓库。
- 2026-10-20：载入项目规则，检查 main 干净、现有 worktree 和已交付工件。
- 查询 ADB，发现同型号 USB 与无线 transport；开始开发证书和签名环境的只读发现。

- Follow-up after continued idle time: the application UID crash buffer remains empty (0 bytes), and exit-info still has no reason 4/5/6 crash or ANR entries. These private evidence files stay under the workspace work/device-test directory.
- Central IPA support is now deployed with a pinned private executor after 252 integrated tests. Development certificate/profile exist locally; signed IPA generation awaits the separate signing-center administrator login and encrypted credential import. Current mobile CI f226cc6 has passed contract/navigation, Android and generic iOS-device build jobs; simulator tests are still in progress and are not reported as a final success.
