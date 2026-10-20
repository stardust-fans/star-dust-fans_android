package com.stardust.fans;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;

/**
 * 30 分钟兜底任务。
 * 主路径是 AlarmManager 的 5 分钟闹钟；万一闹钟被系统清理，靠这个把轮询拉回来。
 */
public final class PollJobService extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context app = getApplicationContext();
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    PollWorker.run(app);
                } finally {
                    jobFinished(params, false);
                }
            }
        }, "stardust-job");
        worker.start();
        // 返回 true 表示任务还在跑，结束时自己调用 jobFinished
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // 系统中断时不重试，交给下一次周期
        return false;
    }
}
