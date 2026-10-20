package com.stardust.fans;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 全局未捕获异常处理：
 *   1. 打到 logcat（TAG = StarDustCrash），方便 adb logcat 抓
 *   2. 写入 files/crash-last.txt（下次启动也能读到）
 *   3. 拉起 CrashReportActivity 展示堆栈，可一键复制
 *   4. 最后交回系统默认处理，保证原崩溃行为不丢
 */
final class CrashHandler implements Thread.UncaughtExceptionHandler {
    private static final String TAG = "StarDustCrash";
    private static final String FILE_NAME = "crash-last.txt";

    private final Context appContext;
    private final Thread.UncaughtExceptionHandler previous;

    private CrashHandler(Context context, Thread.UncaughtExceptionHandler previous) {
        this.appContext = context.getApplicationContext();
        this.previous = previous;
    }

    static void install(Context context) {
        Thread.UncaughtExceptionHandler current = Thread.getDefaultUncaughtExceptionHandler();
        if (current instanceof CrashHandler) {
            return;
        }
        Thread.setDefaultUncaughtExceptionHandler(
                new CrashHandler(context, current));
    }

    /** 上次崩溃记录（没有则返回 null） */
    static String readLast(Context context) {
        File file = new File(context.getFilesDir(), FILE_NAME);
        if (!file.exists()) {
            return null;
        }
        try {
            byte[] bytes = new byte[(int) file.length()];
            java.io.FileInputStream in = new java.io.FileInputStream(file);
            try {
                int read = in.read(bytes);
                if (read <= 0) {
                    return null;
                }
                return new String(bytes, 0, read, "UTF-8");
            } finally {
                in.close();
            }
        } catch (Exception e) {
            return null;
        }
    }

    private String buildReport(Thread thread, Throwable throwable) {
        String time = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
        StringBuilder sb = new StringBuilder();
        sb.append("时间: ").append(time).append('\n');
        sb.append("线程: ").append(thread.getName()).append('\n');
        sb.append("设备: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n');
        sb.append("系统: Android ").append(Build.VERSION.RELEASE)
                .append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
        sb.append("App : ").append(BuildConfigNames.versionLine(appContext)).append('\n');
        sb.append("\n--- 堆栈 ---\n");
        sb.append(Log.getStackTraceString(throwable));
        return sb.toString();
    }

    @Override
    public void uncaughtException(Thread thread, Throwable throwable) {
        String report = buildReport(thread, throwable);

        Log.e(TAG, report);

        try {
            File file = new File(appContext.getFilesDir(), FILE_NAME);
            FileOutputStream out = new FileOutputStream(file);
            Writer writer = new OutputStreamWriter(out, "UTF-8");
            try {
                writer.write(report);
            } finally {
                writer.close();
            }
        } catch (Exception ignored) {
            // 写不进就算了，logcat 里还有
        }

        try {
            Intent intent = new Intent(appContext, CrashReportActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            intent.putExtra(CrashReportActivity.EXTRA_REPORT, report);
            appContext.startActivity(intent);
        } catch (Exception ignored) {
            // 起点失败也不影响下面的默认处理
        }

        if (previous != null) {
            previous.uncaughtException(thread, throwable);
        } else {
            android.os.Process.killProcess(android.os.Process.myPid());
            System.exit(1);
        }
    }
}
