package com.stardust.fans;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 站点公开接口的只读客户端。
 *
 * 关键设计：这里**只存在 fanart 与 shop 两类目标**，代码里没有任何 /api/songs 的调用。
 * 因此"视频更新不通知"不是靠开关关掉的，而是根本没有这条代码路径。
 */
final class ApiClient {
    private static final String TAG = "StarDustApi";

    static final String BASE = "https://stardustinfinity.top";
    static final String TYPE_FANART = "fanart";
    static final String TYPE_SHOP = "shop";

    private ApiClient() {
    }

    static final class Item {
        final long id;
        final String title;
        final String subtitle;

        Item(long id, String title, String subtitle) {
            this.id = id;
            this.title = title;
            this.subtitle = subtitle;
        }
    }

    private static String pathFor(String type) {
        return TYPE_FANART.equals(type) ? "/api/fanart" : "/api/shop";
    }

    private static JSONArray fetchArray(String type) throws Exception {
        return fetchPath(pathFor(type));
    }

    private static JSONArray fetchPath(String path) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(BASE + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "StarDustMobile/1.0 (Android)");

            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("HTTP " + code);
            }
            return new JSONArray(readAll(connection.getInputStream()));
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String readAll(InputStream input) throws Exception {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /** 当前最大 id，用于首次建立基线；空列表返回 0 */
    static long maxId(String type) throws Exception {
        JSONArray array = fetchArray(type);
        long max = 0L;
        for (int i = 0; i < array.length(); i++) {
            JSONObject object = array.optJSONObject(i);
            if (object == null) {
                continue;
            }
            long id = object.optLong("id", 0L);
            if (id > max) {
                max = id;
            }
        }
        return max;
    }

    /** 比 lastId 更新的条目，按 id 升序（先发布的先通知） */
    static List<Item> fetchNewItems(String type, long lastId) throws Exception {
        JSONArray array = fetchArray(type);
        List<Item> items = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            JSONObject object = array.optJSONObject(i);
            if (object == null) {
                continue;
            }
            long id = object.optLong("id", 0L);
            if (id <= lastId) {
                continue;
            }
            String title = object.optString("title", "");
            if (title.isEmpty()) {
                title = "无题";
            }
            String subtitle = TYPE_FANART.equals(type)
                    ? object.optString("author", "匿名")
                    : object.optString("price", "价格待定");
            items.add(new Item(id, title, subtitle));
        }
        Collections.sort(items, (a, b) -> Long.compare(a.id, b.id));
        Log.d(TAG, type + " new items = " + items.size());
        return items;
    }

    // ============================================================
    // 头像 / 资料：WebView 里的登录态是 cookie，这里由调用方把 token 传进来
    // ============================================================

    static final class Profile {
        final String avatarUrl;
        final String displayName;

        Profile(String avatarUrl, String displayName) {
            this.avatarUrl = avatarUrl;
            this.displayName = displayName;
        }
    }

    /** 读取当前登录用户资料；未登录 / 失败返回 null */
    static Profile fetchProfile(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        HttpURLConnection connection = null;
        try {
            URL url = new URL(BASE + "/api/user/profile");
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("User-Agent", "StarDustMobile/1.0 (Android)");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }
            JSONObject object = new JSONObject(readAll(connection.getInputStream()));

            String avatar = object.optString("avatar_url", "");
            if (avatar.isEmpty() || "null".equals(avatar)) {
                avatar = null;
            } else if (avatar.startsWith("/")) {
                avatar = BASE + avatar;
            }
            String name = object.optString("display_name", "");
            if (name.isEmpty() || "null".equals(name)) {
                name = object.optString("username", null);
            }
            return new Profile(avatar, name);
        } catch (Exception e) {
            Log.w(TAG, "fetchProfile failed", e);
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    static Bitmap downloadBitmap(String url) {
        if (url == null || url.isEmpty()) {
            return null;
        }
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(12000);
            connection.setRequestProperty("User-Agent", "StarDustMobile/1.0 (Android)");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }
            return BitmapFactory.decodeStream(connection.getInputStream());
        } catch (Exception e) {
            Log.w(TAG, "downloadBitmap failed", e);
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    // ============================================================
    // 搜索：视频（歌曲）/ 同人 / 量贩，全部走公开接口
    // ============================================================

    static final class SearchResult {
        final String type;
        final String title;
        final String subtitle;
        final String url;

        SearchResult(String type, String title, String subtitle, String url) {
            this.type = type;
            this.title = title;
            this.subtitle = subtitle;
            this.url = url;
        }
    }

    private static String str(JSONObject object, String key, String fallback) {
        String value = object.optString(key, "");
        if (value.isEmpty() || "null".equals(value)) {
            return fallback;
        }
        return value;
    }

    /** 关键词搜索；空关键词返回空列表。最多返回 60 条。 */
    static List<SearchResult> search(String keyword) {
        List<SearchResult> results = new ArrayList<>();
        String kw = keyword == null ? "" : keyword.trim().toLowerCase();
        if (kw.isEmpty()) {
            return results;
        }

        collectSongs(kw, results);
        collectItems(kw, results, TYPE_FANART);
        collectItems(kw, results, TYPE_SHOP);

        if (results.size() > 60) {
            return new ArrayList<>(results.subList(0, 60));
        }
        return results;
    }

    private static void collectSongs(String kw, List<SearchResult> out) {
        try {
            JSONArray array = fetchPath("/api/songs");
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.optJSONObject(i);
                if (object == null) {
                    continue;
                }
                String title = str(object, "title", "");
                String owner = str(object, "owner_name", "");
                if (title.toLowerCase().contains(kw) || owner.toLowerCase().contains(kw)) {
                    out.add(new SearchResult(
                            "视频",
                            title.isEmpty() ? "未知标题" : title,
                            owner,
                            BASE + "/videos"));
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "search songs failed", e);
        }
    }

    private static void collectItems(String kw, List<SearchResult> out, String type) {
        boolean fanart = TYPE_FANART.equals(type);
        try {
            JSONArray array = fetchArray(type);
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.optJSONObject(i);
                if (object == null) {
                    continue;
                }
                long id = object.optLong("id", 0L);
                String title = str(object, "title", "");
                String subtitle = fanart
                        ? str(object, "author", "匿名")
                        : str(object, "price", "价格待定");
                if (title.toLowerCase().contains(kw) || subtitle.toLowerCase().contains(kw)) {
                    out.add(new SearchResult(
                            fanart ? "同人" : "量贩",
                            title.isEmpty() ? "无题" : title,
                            subtitle,
                            BASE + (fanart ? "/fanart/" : "/shop/") + id));
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "search " + type + " failed", e);
        }
    }
}
