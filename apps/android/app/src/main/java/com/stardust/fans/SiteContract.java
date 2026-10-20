package com.stardust.fans;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class SiteContract {
    final String origin;
    final String chromeCss;
    final List<Entry> tabs;
    final List<Entry> pages;
    final Search search;

    private SiteContract(String origin, String chromeCss, List<Entry> tabs, List<Entry> pages, Search search) {
        this.origin = origin;
        this.chromeCss = chromeCss;
        this.tabs = Collections.unmodifiableList(tabs);
        this.pages = Collections.unmodifiableList(pages);
        this.search = search;
    }

    static SiteContract load(Context context) throws IOException, JSONException {
        try (InputStream stream = context.getAssets().open("site.json")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) >= 0) output.write(buffer, 0, count);
            JSONObject json = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            if (json.getInt("version") != 1) throw new JSONException("Unsupported site contract version");
            JSONObject webSource = json.getJSONObject("webSource");
            String origin = json.getString("origin");
            String css = json.getString("chromeCSS");
            List<Entry> tabs = readEntries(json.getJSONArray("tabs"), false);
            List<Entry> pages = readEntries(json.getJSONArray("pages"), true);
            JSONObject search = json.getJSONObject("search");
            Search searchPaths = new Search(search.getString("videos"), search.getString("fanart"),
                    search.getString("shop"));
            if (!NavigationPolicy.isCanonicalOrigin(origin) || tabs.size() != 5 || pages.isEmpty()
                    || !hasTab(tabs, "videos") || !hasTab(tabs, "fanart") || !hasTab(tabs, "shop")
                    || !hasTab(tabs, "omew") || !hasTab(tabs, "user")) {
                throw new JSONException("Invalid site contract");
            }
            if (!NavigationPolicy.isSafePath(searchPaths.videos)
                    || !NavigationPolicy.isSafePath(searchPaths.fanart)
                    || !NavigationPolicy.isSafePath(searchPaths.shop)) {
                throw new JSONException("Invalid search paths");
            }
            if (webSource.getString("repository").isEmpty() || webSource.getString("commit").isEmpty()) {
                throw new JSONException("Invalid site source provenance");
            }
            return new SiteContract(origin, css, tabs, pages, searchPaths);
        }
    }

    private static List<Entry> readEntries(JSONArray array, boolean entryOnly) throws JSONException {
        List<Entry> result = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.getJSONObject(i);
            if (entryOnly && !item.optBoolean("entry", false)) continue;
            String path = item.getString("path");
            if (!NavigationPolicy.isSafePath(path)) throw new JSONException("Invalid site path");
            result.add(new Entry(item.getString("id"), item.getString("title"), path,
                    item.optString("symbol", "")));
        }
        return result;
    }

    private static boolean hasTab(List<Entry> tabs, String id) {
        for (Entry tab : tabs) if (id.equals(tab.id)) return true;
        return false;
    }

    static final class Entry {
        final String id;
        final String title;
        final String path;
        final String symbol;

        Entry(String id, String title, String path, String symbol) {
            this.id = id;
            this.title = title;
            this.path = path;
            this.symbol = symbol;
        }
    }

    static final class Search {
        final String videos;
        final String fanart;
        final String shop;

        Search(String videos, String fanart, String shop) {
            this.videos = videos;
            this.fanart = fanart;
            this.shop = shop;
        }
    }
}
