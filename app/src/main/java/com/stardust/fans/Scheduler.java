package com.stardust.fans;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * 轮询调度。
 *
 * 后台节奏用 AlarmManager.setAndAllowWhileIdle + 每次触发后自链下一次实现，
 * 因为 JobScheduler.setPeriodic 有 15 分钟硬下限，而一次性闹钟没有。
 * 另外挂一个 30 分钟的 JobScheduler 周期任务兜底（闹钟被系统清理时可自愈）。
 */
final class Scheduler {
    private static final String TAG = "StarDustScheduler";

    static final int FALLBACK_JOB_ID = 1001;
    private static final int ALARM_REQUEST_CODE = 2001;
    private static final long FALLBACK_PERIOD_MS = 30L * 60L * 1000L;

    private Scheduler() {
    }

    private static PendingIntent alarmIntent(Context context) {
        Intent intent = new Intent(context, PollReceiver.class);
        intent.setAction(PollReceiver.ACTION_POLL);
        return PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * 重排下一次轮询。设置变更（开关/频率）与每轮结束后都会调用，可重复调用。
     */
    static void reschedule(Context context) {
        Context app = context.getApplicationContext();
        Prefs prefs = new Prefs(app);

        AlarmManager alarmManager = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        PendingIntent alarm = alarmIntent(app);
        if (alarmManager != null) {
            alarmManager.cancel(alarm);
        }

        JobScheduler jobScheduler = (JobScheduler) app.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (!prefs.anyEnabled()) {
            if (jobScheduler != null) {
                jobScheduler.cancel(FALLBACK_JOB_ID);
            }
            Log.d(TAG, "all notifications disabled, polling stopped");
            return;
        }

        if (alarmManager != null) {
            long intervalMs = Math.max(3, prefs.getBackgroundMinutes()) * 60L * 1000L;
            long triggerAt = System.currentTimeMillis() + intervalMs;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, alarm);
                } else {
                    alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, alarm);
                }
            } catch (SecurityException e) {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, alarm);
            }
        }

        if (jobScheduler != null) {
            JobInfo job = new JobInfo.Builder(
                    FALLBACK_JOB_ID,
                    new ComponentName(app, PollJobService.class))
                    .setPeriodic(FALLBACK_PERIOD_MS)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .build();
            jobScheduler.schedule(job);
        }

        Log.d(TAG, "next background poll in " + prefs.getBackgroundMinutes() + " min");
    }
}
