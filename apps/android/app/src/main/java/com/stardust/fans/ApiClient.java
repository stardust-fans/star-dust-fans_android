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
import java.util.Locale;

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

    static final class Profile {
        final String avatarUrl;
        final String displayName;

        Profile(String avatarUrl, String displayName) {
            this.avatarUrl = avatarUrl;
            this.displayName = displayName;
        }
    }

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

    static List<SearchResult> search(String keyword, SiteContract contract) {
        List<SearchResult> results = new ArrayList<>();
        String kw = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        if (kw.isEmpty()) {
            return results;
        }

        collectSongs(kw, results, contract.search.videos);
        collectItems(kw, results, TYPE_FANART, contract.search.fanart, tabPath(contract, "fanart"));
        collectItems(kw, results, TYPE_SHOP, contract.search.shop, tabPath(contract, "shop"));

        if (results.size() > 60) {
            return new ArrayList<>(results.subList(0, 60));
        }
        return results;
    }

    private static void collectSongs(String kw, List<SearchResult> out, String endpoint) {
        try {
            String query = java.net.URLEncoder.encode(kw, "UTF-8");
            JSONArray array = fetchPath(endpoint + "?q=" + query + "&limit=20&offset=0");
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.optJSONObject(i);
                if (object == null) {
                    continue;
                }
                String title = str(object, "title", "");
                JSONObject ownerObject = object.optJSONObject("owner");
                String owner = ownerObject == null ? "" : str(ownerObject, "name", "");
                String bvid = str(object, "bvid", "");
                if ((title.toLowerCase(Locale.ROOT).contains(kw)
                        || owner.toLowerCase(Locale.ROOT).contains(kw)
                        || bvid.toLowerCase().contains(kw)) && bvid.matches("BV[0-9A-Za-z]+")) {
                    out.add(new SearchResult(
                            "视频",
                            title.isEmpty() ? "未知标题" : title,
                            owner,
                            "https://www.bilibili.com/video/" + bvid));
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "search songs failed", e);
        }
    }

    private static void collectItems(String kw, List<SearchResult> out, String type, String endpoint, String route) {
        boolean fanart = TYPE_FANART.equals(type);
        try {
            JSONArray array = fetchPath(endpoint);
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
                if (title.toLowerCase(Locale.ROOT).contains(kw)
                        || subtitle.toLowerCase(Locale.ROOT).contains(kw)) {
                    out.add(new SearchResult(
                            fanart ? "同人" : "量贩",
                            title.isEmpty() ? "无题" : title,
                            subtitle,
                            BASE + route + "/" + id));
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "search " + type + " failed", e);
        }
    }

    private static String tabPath(SiteContract contract, String id) {
        for (SiteContract.Entry tab : contract.tabs) if (id.equals(tab.id)) return tab.path;
        throw new IllegalStateException("Required site tab is missing: " + id);
    }
}
