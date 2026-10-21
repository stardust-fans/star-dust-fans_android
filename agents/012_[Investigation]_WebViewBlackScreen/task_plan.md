# iOS WebView 延时黑屏调查

- [x] 记录用户确认的实际症状和当前设备证据；分清宿主 app 存活与 Web 内容进程状态。
- [x] 检查 `RootView` 生命周期、WKWebView 保留方式及 `WKNavigationDelegate` 生命周期回调。
- [x] 对照 CoreDevice 与 DVT 启动方式并收集目标 app 可见性证据。
- [x] 将设备显示与 ScreenCaptureService / DVT 截图交叉比对。
- [x] 汇总可取得的宿主进程状态与目标日志，并标明 WKWebContent 状态/termination 未被当前证据确认。
- [x] 记录证据支持的操作性结论；没有 app-code 根因证据，未添加猜测性修复。
