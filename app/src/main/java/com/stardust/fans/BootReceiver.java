package com.stardust.fans;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 设备重启后 AlarmManager 的闹钟会被清空，这里把它们重新排上。
 * 同时 reschedule() 会重建 JobScheduler 兜底任务。
 */
public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)) {
            Scheduler.reschedule(context.getApplicationContext());
        }
    }
}
