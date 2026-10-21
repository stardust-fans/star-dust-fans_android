# Progress

- 已检查当前 app-shell、WebSession 和 WKNavigationDelegate：WebView 由 AppModel/WebSession 持有并复用，页面仍由原来的首次路由和导航回调加载。
- 确认当前 delegate 未实现 WebKit 内容进程终止回调；尚无证据表明黑屏期间发生过进程终止，未做运行时代码或测试改动。
- 主控正对照 CoreDevice（不终止现有进程）与 DVT 启动方式，并尝试应用自身截图。等待实际页面显示与采集结果比较，以及黑屏时 WebContent 进程状态证据。
- 完成有证据限定的启动方式对照：DVT 冷启动和其激活 existing process 后截图仍黑；手动重开后 PID 已变，之后120秒同 PID正常，60秒/120秒截图正常，无需 app kill/清数据/重装。CoreDevice `kill_existing=true` fresh launch 新 PID `4827` 后+30秒截图正常、进程稳定。
- 初始 CoreDevice monitor 因 DVT API 收到 `XpcInt64Type` 报 DTXNSCodingError，但 app launch 已成功；转换为 Python int 后监控同一 PID 完成，无重复启动。
- 未发现能证明应用代码导致此现象的证据；以后以 CoreDevice launch 做验收，调查记录结案，不修改 app/runtime。
