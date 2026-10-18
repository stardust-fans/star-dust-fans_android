package com.stardust.fans;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 本地偏好：通知开关、轮询频率、轮询基线。
 * 只保存"上次见到的最大 id"这类本地状态，不保存任何账号信息
 * （登录态由 WebView 的 cookie 负责，App 完全不碰）。
 */
final class Prefs {
    private static final String FILE = "stardust_mobile_prefs";

    private static final String KEY_FANART_ENABLED = "notify_fanart";
    private static final String KEY_SHOP_ENABLED = "notify_shop";
    private static final String KEY_FOREGROUND_SECONDS = "poll_foreground_seconds";
    private static final String KEY_BACKGROUND_MINUTES = "poll_background_minutes";
    private static final String KEY_LAST_FANART_ID = "last_fanart_id";
    private static final String KEY_LAST_SHOP_ID = "last_shop_id";
    private static final String KEY_BASELINE_DONE = "baseline_done";

    static final int DEFAULT_FOREGROUND_SECONDS = 60;
    static final int DEFAULT_BACKGROUND_MINUTES = 5;

    private final SharedPreferences sp;

    Prefs(Context context) {
        this.sp = context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    boolean isFanartEnabled() {
        return sp.getBoolean(KEY_FANART_ENABLED, true);
    }

    boolean isShopEnabled() {
        return sp.getBoolean(KEY_SHOP_ENABLED, true);
    }

    boolean anyEnabled() {
        return isFanartEnabled() || isShopEnabled();
    }

    void setFanartEnabled(boolean enabled) {
        sp.edit().putBoolean(KEY_FANART_ENABLED, enabled).apply();
    }

    void setShopEnabled(boolean enabled) {
        sp.edit().putBoolean(KEY_SHOP_ENABLED, enabled).apply();
    }

    int getForegroundSeconds() {
        return Math.max(15, sp.getInt(KEY_FOREGROUND_SECONDS, DEFAULT_FOREGROUND_SECONDS));
    }

    void setForegroundSeconds(int seconds) {
        sp.edit().putInt(KEY_FOREGROUND_SECONDS, Math.max(15, seconds)).apply();
    }

    int getBackgroundMinutes() {
        return Math.max(3, sp.getInt(KEY_BACKGROUND_MINUTES, DEFAULT_BACKGROUND_MINUTES));
    }

    void setBackgroundMinutes(int minutes) {
        sp.edit().putInt(KEY_BACKGROUND_MINUTES, Math.max(3, minutes)).apply();
    }

    long getLastFanartId() {
        return sp.getLong(KEY_LAST_FANART_ID, 0L);
    }

    void setLastFanartId(long id) {
        sp.edit().putLong(KEY_LAST_FANART_ID, id).apply();
    }

    long getLastShopId() {
        return sp.getLong(KEY_LAST_SHOP_ID, 0L);
    }

    void setLastShopId(long id) {
        sp.edit().putLong(KEY_LAST_SHOP_ID, id).apply();
    }

    boolean isBaselineDone() {
        return sp.getBoolean(KEY_BASELINE_DONE, false);
    }

    void setBaselineDone(boolean done) {
        sp.edit().putBoolean(KEY_BASELINE_DONE, done).apply();
    }

    /** 清空基线：下次轮询会重新记录当前最大 id（不会补推历史内容） */
    void resetBaseline() {
        sp.edit()
                .putBoolean(KEY_BASELINE_DONE, false)
                .putLong(KEY_LAST_FANART_ID, 0L)
                .putLong(KEY_LAST_SHOP_ID, 0L)
                .apply();
    }
}
