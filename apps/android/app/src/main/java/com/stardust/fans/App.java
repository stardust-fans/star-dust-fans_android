package com.stardust.fans;

import android.app.Application;

/**
 * 注册全局崩溃捕获：崩溃时把堆栈写到文件并弹出可复制的报告页面。
 * 在 App 启动最早期安装，能覆盖 Activity / WebView / 后台任务里的异常。
 */
public final class App extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        CrashHandler.install(this);
    }
}
