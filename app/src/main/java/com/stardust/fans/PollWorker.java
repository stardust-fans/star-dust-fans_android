package com.stardust.fans;

import android.content.Context;
import android.util.Log;

import java.util.List;

/**
 * 轮询核心，三个入口共用：
 *   - PollReceiver（后台闹钟，5 分钟级）
 *   - PollJobService（30 分钟兜底）
 *   - MainActivity（前台定时器，60 秒级）
 *
 * 只处理 fanart 与 shop，视频不参与。
 */
final class PollWorker {
    private static final String TAG = "StarDustPoll";

    private PollWorker() {
    }

    static synchronized void run(Context context) {
        Context app = context.getApplicationContext();
        Prefs prefs = new Prefs(app);
        if (!prefs.anyEnabled()) {
            return;
        }

        Notifier.ensureChannels(app);

        if (!prefs.isBaselineDone()) {
            establishBaseline(app, prefs);
            return;
        }

        if (prefs.isFanartEnabled()) {
            pollType(app, prefs, ApiClient.TYPE_FANART);
        }
        if (prefs.isShopEnabled()) {
            pollType(app, prefs, ApiClient.TYPE_SHOP);
        }
    }

    /** 首次启用：只记录当前最大 id 作为基线，避免把历史内容全部推一遍 */
    private static void establishBaseline(Context app, Prefs prefs) {
        boolean fanartDone = !prefs.isFanartEnabled();
        boolean shopDone = !prefs.isShopEnabled();

        if (prefs.isFanartEnabled()) {
            try {
                prefs.setLastFanartId(ApiClient.maxId(ApiClient.TYPE_FANART));
                fanartDone = true;
            } catch (Exception e) {
                Log.w(TAG, "baseline fanart failed", e);
            }
        }
        if (prefs.isShopEnabled()) {
            try {
                prefs.setLastShopId(ApiClient.maxId(ApiClient.TYPE_SHOP));
                shopDone = true;
            } catch (Exception e) {
                Log.w(TAG, "baseline shop failed", e);
            }
        }
        if (fanartDone && shopDone) {
            prefs.setBaselineDone(true);
            Log.i(TAG, "baseline established");
        }
    }

    private static void pollType(Context app, Prefs prefs, String type) {
        boolean fanart = ApiClient.TYPE_FANART.equals(type);
        long lastId = fanart ? prefs.getLastFanartId() : prefs.getLastShopId();
        try {
            List<ApiClient.Item> items = ApiClient.fetchNewItems(type, lastId);
            if (items.isEmpty()) {
                return;
            }
            Notifier.notifyNew(app, type, items);
            long newest = items.get(items.size() - 1).id;
            if (fanart) {
                prefs.setLastFanartId(newest);
            } else {
                prefs.setLastShopId(newest);
            }
            Log.i(TAG, "notified " + items.size() + " new " + type + " item(s)");
        } catch (Exception e) {
            // 拉取失败静默跳过，下个周期再试
            Log.w(TAG, "poll " + type + " failed", e);
        }
    }
}
