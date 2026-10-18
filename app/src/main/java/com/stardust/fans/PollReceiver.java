package com.stardust.fans;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 后台闹钟的落点。
 * 先排下一次闹钟，再跑本轮网络请求——即使本轮失败/被杀，轮询链也不会断。
 * 网络请求必须离开主线程（BroadcastReceiver 运行在主线程），
 * 所以这里用 goAsync() + 工作线程，结束时 finish()。
 */
public final class PollReceiver extends BroadcastReceiver {
    static final String ACTION_POLL = "com.stardust.fans.action.POLL";

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context app = context.getApplicationContext();

        Scheduler.reschedule(app);

        final PendingResult pendingResult = goAsync();
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    PollWorker.run(app);
                } finally {
                    pendingResult.finish();
                }
            }
        }, "stardust-poll");
        worker.start();
    }
}
