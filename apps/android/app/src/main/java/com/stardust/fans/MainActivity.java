package com.stardust.fans;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Outline;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.ViewGroup;
import android.view.Gravity;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.os.Message;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.app.AlertDialog;
import android.widget.LinearLayout;
import android.widget.Toast;
import android.content.ClipData;

/**
 * 主界面：原生顶栏与页面菜单、WebView 内容和五项原生导航。
 *
 * 内容仍然是站点本身（不打包前端副本），这样登录 cookie、投稿、评论、上传都天然可用；
 * 原生层负责 App 的外观与导航，并把站点自带的导航栏隐藏掉，避免两层导航。
 */
public final class MainActivity extends Activity {
    private static final String TAG = "StarDustMain";
    private static final String BASE = ApiClient.BASE;
    private static final int DEFAULT_TAB = 0;

    private static final int REQ_FILE_CHOOSER = 4001;

    private WebView webView;
    private ProgressBar progressBar;
    private View errorView;
    private TextView errorText;
    private ImageView avatarView;
    private LinearLayout dock;
    private SiteContract contract;

    private ValueCallback<Uri[]> pendingFileCallback;
    private int currentTab = -1;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable foregroundPoll;

    /**
     * 前台定时轮询：网络请求必须离开主线程。
     * 具名内部类（而不是字段初始化器里的匿名类），避免 d8 处理 EnclosingMethod 为 null 的类。
     */
    private final class ForegroundPoll implements Runnable {
        @Override
        public void run() {
            final Context app = getApplicationContext();
            new Thread(() -> PollWorker.run(app), "stardust-fg-poll").start();

            int seconds = new Prefs(app).getForegroundSeconds();
            handler.postDelayed(this, Math.max(15, seconds) * 1000L);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.web_view);
        progressBar = findViewById(R.id.progress_bar);
        errorView = findViewById(R.id.error_view);
        errorText = findViewById(R.id.error_text);
        avatarView = findViewById(R.id.top_avatar);
        dock = findViewById(R.id.bottom_dock);

        try {
            contract = SiteContract.load(this);
            if (!BASE.equals(contract.origin)) throw new org.json.JSONException("Site origin mismatch");
        } catch (Exception e) {
            Toast.makeText(this, "站点导航配置不可用", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        setupTopBar();
        setupDock();
        configureWebView();

        foregroundPoll = new ForegroundPoll();
        Notifier.ensureChannels(this);
        Scheduler.reschedule(this);

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
            syncTabFromUrl(webView.getUrl());
        } else {
            String deepLink = resolveDeepLink(getIntent());
            if (deepLink != null) {
                webView.loadUrl(deepLink);
                syncTabFromUrl(deepLink);
            } else {
                selectTab(DEFAULT_TAB);
            }
        }
    }

    // ---------------------------------------------------------------- 顶栏 / dock

    private void setupTopBar() {
        avatarView.setClipToOutline(true);
        avatarView.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setOval(0, 0, view.getWidth(), view.getHeight());
            }
        });
        // 头像打开契约定义的用户页。
        avatarView.setOnClickListener(v -> selectAccountTab());

        findViewById(R.id.top_search).setOnClickListener(v ->
                startActivity(new Intent(MainActivity.this, SearchActivity.class)));

        findViewById(R.id.top_settings).setOnClickListener(v -> openSettings());
        findViewById(R.id.top_pages).setOnClickListener(v -> showAllPages());
        findViewById(R.id.error_retry).setOnClickListener(v -> {
            errorView.setVisibility(View.GONE);
            webView.reload();
        });
    }

    private void setupDock() {
        dock.removeAllViews();
        for (int i = 0; i < contract.tabs.size(); i++) {
            SiteContract.Entry item = contract.tabs.get(i);
            TextView tab = new TextView(this);
            tab.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
            tab.setGravity(Gravity.CENTER);
            tab.setText(item.title);
            tab.setTextSize(10);
            tab.setCompoundDrawablePadding(Math.round(3 * getResources().getDisplayMetrics().density));
            int icon = tabIcon(item.symbol);
            if (icon != 0) tab.setCompoundDrawablesWithIntrinsicBounds(0, icon, 0, 0);
            tab.setTextColor(getResources().getColor(R.color.dock_inactive, getTheme()));
            tab.setBackgroundResource(android.R.drawable.list_selector_background);
            final int index = i;
            tab.setOnClickListener(v -> selectTab(index));
            dock.addView(tab);
        }
        updateDockState();
    }

    private void selectTab(int index) {
        if (contract == null || index < 0 || index >= contract.tabs.size()) {
            return;
        }
        currentTab = index;
        updateDockState();

        String target = BASE + contract.tabs.get(index).path;
        String current = webView.getUrl();
        if (current == null || !NavigationPolicy.sameRoute(current, contract.tabs.get(index).path)) {
            webView.loadUrl(target);
        }
    }

    private void selectAccountTab() {
        for (int i = 0; i < contract.tabs.size(); i++) {
            if ("user".equals(contract.tabs.get(i).id)) {
                selectTab(i);
                return;
            }
        }
    }

    /** 根据当前 URL 反推高亮哪个 dock 项（通知深链、页面跳转后调用） */
    private void syncTabFromUrl(String url) {
        if (url == null || contract == null) return;
        for (int i = 0; i < contract.tabs.size(); i++) {
            SiteContract.Entry tab = contract.tabs.get(i);
            if (("omew".equals(tab.id) && NavigationPolicy.isForumUrl(url))
                    || NavigationPolicy.routeMatches(url, tab.path)) {
                currentTab = i;
                updateDockState();
                return;
            }
        }
        currentTab = -1;
        updateDockState();
    }

    private void updateDockState() {
        for (int i = 0; dock != null && i < dock.getChildCount(); i++) {
            TextView tab = (TextView) dock.getChildAt(i);
            int color = getResources().getColor(
                    i == currentTab ? R.color.dock_active : R.color.dock_inactive, getTheme());
            tab.setTextColor(color);
            tab.setCompoundDrawableTintList(android.content.res.ColorStateList.valueOf(color));
        }
    }

    private static int tabIcon(String symbol) {
        switch (symbol) {
            case "play.rectangle": return R.drawable.ic_tab_videos;
            case "paintpalette": return R.drawable.ic_tab_fanart;
            case "bag": return R.drawable.ic_tab_shop;
            case "bubble.left.and.bubble.right": return R.drawable.ic_tab_forum;
            case "person.crop.circle": return R.drawable.ic_tab_my;
            default: return 0;
        }
    }

    private void showAllPages() {
        if (contract == null) return;
        String[] titles = new String[contract.pages.size()];
        for (int i = 0; i < titles.length; i++) titles[i] = contract.pages.get(i).title;
        new AlertDialog.Builder(this).setTitle("全部页面").setItems(titles, (dialog, which) ->
                webView.loadUrl(BASE + contract.pages.get(which).path)).show();
    }

    private void openSettings() {
        startActivity(new Intent(this, SettingsActivity.class));
    }

    // ---------------------------------------------------------------- 头像

    private void loadAvatar() {
        new Thread(() -> {
            String cookie = CookieManager.getInstance().getCookie(BASE);
            String token = cookieValue(cookie, "authToken");
            if (token == null || token.isEmpty()) {
                runOnUiThread(() -> showAvatar(null, null));
                return;
            }
            ApiClient.Profile profile = ApiClient.fetchProfile(token);
            Bitmap bitmap = null;
            if (profile != null && profile.avatarUrl != null) {
                bitmap = ApiClient.downloadBitmap(profile.avatarUrl);
            }
            final Bitmap result = bitmap;
            final String name = profile == null ? null : profile.displayName;
            runOnUiThread(() -> showAvatar(result, name));
        }, "stardust-avatar").start();
    }

    private void showAvatar(Bitmap bitmap, String displayName) {
        if (avatarView == null) {
            return;
        }
        if (bitmap != null) {
            avatarView.setPadding(0, 0, 0, 0);
            avatarView.setImageBitmap(bitmap);
        } else {
            int pad = Math.round(6 * getResources().getDisplayMetrics().density);
            avatarView.setPadding(pad, pad, pad, pad);
            avatarView.setImageResource(R.drawable.ic_avatar_placeholder);
        }
        avatarView.setContentDescription(displayName == null ? "我的" : displayName);
    }

    private static String cookieValue(String cookieHeader, String name) {
        if (cookieHeader == null) {
            return null;
        }
        String prefix = name + "=";
        for (String part : cookieHeader.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith(prefix)) {
                return Uri.decode(trimmed.substring(prefix.length()));
            }
        }
        return null;
    }

    // ---------------------------------------------------------------- WebView

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString() + " StarDustMobile/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        // 论坛（OMEW）是 iframe + SSO，必须允许三方 cookie
        cookieManager.setAcceptThirdPartyCookies(webView, true);
        cookieManager.flush();

        webView.addJavascriptInterface(new NavigationBridge(), "StarDustNavigation");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl(), request.isForMainFrame());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url), true);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorView.setVisibility(View.GONE);
                progressBar.setVisibility(View.VISIBLE);
                syncTabFromUrl(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                view.evaluateJavascript(chromeScript(), null);
                syncTabFromUrl(url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    showError();
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                            android.webkit.WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 100) {
                    progressBar.setVisibility(View.GONE);
                } else {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }
                pendingFileCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    String[] accepted = params.getAcceptTypes();
                    java.util.ArrayList<String> types = new java.util.ArrayList<>();
                    if (accepted != null) for (String type : accepted) {
                        if (type != null && !type.trim().isEmpty()) types.add(type.trim());
                    }
                    if (types.isEmpty() || types.contains("*/*")) {
                        intent.setType("*/*");
                    } else if (types.size() == 1) {
                        intent.setType(types.get(0));
                    } else {
                        intent.setType("*/*");
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
                    }
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                            params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingFileCallback.onReceiveValue(null);
                    pendingFileCallback = null;
                    return true;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                                          Message resultMsg) {
                WebView popup = new WebView(MainActivity.this);
                popup.getSettings().setJavaScriptEnabled(true);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        Uri uri = request.getUrl();
                        if (request.isForMainFrame()) {
                            if (NavigationPolicy.isInternalMainFrame(uri.toString())) {
                                webView.loadUrl(uri.toString());
                            } else {
                                handleUrl(uri, true);
                            }
                        }
                        popupView.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    private String chromeScript() {
        return "(function(){var s=document.getElementById('__sd_app_css');"
                + "if(!s){s=document.createElement('style');s.id='__sd_app_css';"
                + "(document.head||document.documentElement).appendChild(s);}s.textContent="
                + org.json.JSONObject.quote(contract.chromeCss) + ";"
                + "if(window.__sdHistoryHooked)return;window.__sdHistoryHooked=true;"
                + "['pushState','replaceState'].forEach(function(k){var f=history[k];history[k]=function(){"
                + "var r=f.apply(this,arguments);StarDustNavigation.routeChanged(location.href);return r;};});"
                + "['popstate','hashchange'].forEach(function(k){addEventListener(k,function(){"
                + "StarDustNavigation.routeChanged(location.href);});});})();";
    }

    private final class NavigationBridge {
        @JavascriptInterface
        public void routeChanged(String url) {
            runOnUiThread(() -> {
                String current = webView.getUrl();
                if (current != null && NavigationPolicy.isInternalMainFrame(current)
                        && NavigationPolicy.routeKey(current).equals(NavigationPolicy.routeKey(url))) {
                    syncTabFromUrl(current);
                }
            });
        }
    }

    private boolean handleUrl(Uri uri, boolean mainFrame) {
        if (uri == null) {
            return true;
        }
        if (!mainFrame) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
        if (NavigationPolicy.isInternalMainFrame(uri.toString())) return false;
        if ((!"http".equals(scheme) && !"https".equals(scheme))
                || uri.getHost() == null || uri.getUserInfo() != null || uri.getPort() != -1) return true;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "no handler for external link", e);
        }
        return true;
    }

    private void showError() {
        progressBar.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
        errorText.setText("网络似乎不太顺畅\n请检查连接后重试");
    }

    // ---------------------------------------------------------------- 生命周期 / 交互

    private static String resolveDeepLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return null;
        }
        Uri data = intent.getData();
        if (data == null) {
            return null;
        }
        if (!NavigationPolicy.isRootDeepLink(data.toString())) {
            return null;
        }
        return data.toString();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String deepLink = resolveDeepLink(intent);
        if (deepLink != null && webView != null) {
            webView.loadUrl(deepLink);
            syncTabFromUrl(deepLink);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.removeCallbacks(foregroundPoll);
        handler.post(foregroundPoll);
        loadAvatar();
    }

    @Override
    protected void onPause() {
        if (foregroundPoll != null) {
            handler.removeCallbacks(foregroundPoll);
        }
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            openSettings();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (pendingFileCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        ClipData clip = data.getClipData();
                        results = new Uri[clip.getItemCount()];
                        for (int i = 0; i < clip.getItemCount(); i++) results[i] = clip.getItemAt(i).getUri();
                    } else if (data.getData() != null) {
                        results = new Uri[]{data.getData()};
                    }
                }
                pendingFileCallback.onReceiveValue(results);
                pendingFileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (foregroundPoll != null) {
            handler.removeCallbacks(foregroundPoll);
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
