package com.stardust.fans;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import java.util.List;

/**
 * 本地通知：两个渠道（同人上新 / 量贩上新）。
 * 注意：这里**没有视频渠道**，配合 ApiClient 不轮询 songs，视频更新不可能产生通知。
 */
final class Notifier {
    static final String CHANNEL_FANART = "fanart_new";
    static final String CHANNEL_SHOP = "shop_new";

    /** 单次同步最多弹几条，避免刷屏 */
    static final int MAX_PER_SYNC = 5;

    private Notifier() {
    }

    static void ensureChannels(Context context) {
        try {
            ensureChannelsInternal(context);
        } catch (Exception e) {
            Log.w("StarDustNotify", "ensureChannels failed", e);
        }
    }

    private static void ensureChannelsInternal(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        createChannel(manager, CHANNEL_FANART, "同人上新", "有新同人作品发布时通知");
        createChannel(manager, CHANNEL_SHOP, "量贩上新", "有新量贩商品上架时通知");
    }

    private static void createChannel(NotificationManager manager, String id, String name, String description) {
        if (manager.getNotificationChannel(id) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(description);
        manager.createNotificationChannel(channel);
    }

    static void notifyNew(Context context, String type, List<ApiClient.Item> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        ensureChannels(context);

        boolean fanart = ApiClient.TYPE_FANART.equals(type);
        int shown = 0;
        for (ApiClient.Item item : items) {
            if (shown >= MAX_PER_SYNC) {
                break;
            }
            post(context, manager, item, fanart);
            shown++;
        }
        if (items.size() > MAX_PER_SYNC) {
            int rest = items.size() - MAX_PER_SYNC;
            postSummary(context, manager, rest, fanart);
        }
    }

    private static Notification.Builder builder(Context context, boolean fanart) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Notification.Builder(context, fanart ? CHANNEL_FANART : CHANNEL_SHOP);
        }
        return new Notification.Builder(context);
    }

    private static void post(Context context, NotificationManager manager, ApiClient.Item item, boolean fanart) {
        String target = ApiClient.BASE + (fanart ? "/fanart/" : "/shop/") + item.id;
        int notificationId = notificationId(item.id, fanart);

        String title = fanart ? "同人上新" : "量贩上新";
        String text = item.title;
        if (item.subtitle != null && !item.subtitle.isEmpty()) {
            text = text + " · " + item.subtitle;
        }

        Notification.Builder builder = builder(context, fanart);
        builder.setSmallIcon(R.drawable.ic_stat_star)
                .setContentTitle(title)
                .setContentText(item.title)
                .setStyle(new Notification.BigTextStyle().bigText(fanart
                        ? item.title + "\n作者：" + item.subtitle
                        : item.title + "\n价格：" + item.subtitle))
                .setContentIntent(contentIntent(context, target, notificationId))
                .setAutoCancel(true)
                .setShowWhen(true);
        manager.notify(notificationId, builder.build());
    }

    private static void postSummary(Context context, NotificationManager manager, int rest, boolean fanart) {
        String title = fanart ? "同人上新" : "量贩上新";
        String text = "还有 " + rest + " 件" + (fanart ? "新同人作品" : "新商品") + "，打开 App 查看";
        int notificationId = (fanart ? 9001 : 9002);

        Notification.Builder builder = builder(context, fanart);
        builder.setSmallIcon(R.drawable.ic_stat_star)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(contentIntent(context, ApiClient.BASE + (fanart ? "/fanart" : "/shop"), notificationId))
                .setAutoCancel(true)
                .setShowWhen(true);
        manager.notify(notificationId, builder.build());
    }

    private static PendingIntent contentIntent(Context context, String url, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static int notificationId(long itemId, boolean fanart) {
        int base = (int) (itemId % 100000L);
        return fanart ? base : base + 100000;
    }
}
