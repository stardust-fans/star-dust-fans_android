package com.stardust.fans;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
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
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * 主界面：原生顶栏（头像 + 搜索框 + 设置）+ WebView 内容 + 原生底部 dock。
 *
 * 内容仍然是站点本身（不打包前端副本），这样登录 cookie、投稿、评论、上传都天然可用；
 * 原生层负责 App 的外观与导航，并把站点自带的导航栏隐藏掉，避免两层导航。
 */
public final class MainActivity extends Activity {
    private static final String TAG = "StarDustMain";
    private static final String BASE = ApiClient.BASE;

    /** dock 顺序（从左到右）：视频 / 同人 / 量贩 / 论坛 / 我的 */
    private static final String[] ROUTES = {"/videos", "/fanart", "/shop", "/omew", "/user"};
    private static final int[] TAB_IDS = {
            R.id.tab_videos, R.id.tab_fanart, R.id.tab_shop, R.id.tab_forum, R.id.tab_my
    };
    /** 「我的」在最右侧 */
    private static final int TAB_MY = 4;
    /** 默认落在「视频」 */
    private static final int DEFAULT_TAB = 0;

    /** 隐藏站点自带的导航栏与 Live2D 悬浮角色，避免和我们自己的 UI 打架 */
    private static final String HIDE_SITE_CHROME_JS =
            "(function(){"
                    + "var css='.navbar{display:none !important}'"
                    + "+'#app{padding-top:0 !important}'"
                    + "+'[class*=\"live2d\"]{display:none !important}';"
                    + "var s=document.getElementById('__sd_app_css');"
                    + "if(!s){s=document.createElement('style');s.id='__sd_app_css';"
                    + "(document.head||document.documentElement).appendChild(s);}"
                    + "s.textContent=css;"
                    + "})();";

    private static final int REQ_FILE_CHOOSER = 4001;

    private WebView webView;
    private ProgressBar progressBar;
    private View errorView;
    private TextView errorText;
    private ImageView avatarView;

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
        // 点头像 = 进「我的」（最右侧那个 tab）
        avatarView.setOnClickListener(v -> selectTab(TAB_MY));

        findViewById(R.id.top_search).setOnClickListener(v ->
                startActivity(new Intent(MainActivity.this, SearchActivity.class)));

        findViewById(R.id.top_settings).setOnClickListener(v -> openSettings());
    }

    private void setupDock() {
        for (int i = 0; i < TAB_IDS.length; i++) {
            final int index = i;
            View tab = findViewById(TAB_IDS[i]);
            if (tab != null) {
                tab.setOnClickListener(v -> selectTab(index));
            }
        }
    }

    private void selectTab(int index) {
        if (index < 0 || index >= ROUTES.length) {
            return;
        }
        currentTab = index;
        updateDockState();

        String target = BASE + ROUTES[index];
        String current = webView.getUrl();
        if (current == null || !current.startsWith(target)) {
            webView.loadUrl(target);
        }
    }

    /** 根据当前 URL 反推高亮哪个 dock 项（通知深链、页面跳转后调用） */
    private void syncTabFromUrl(String url) {
        if (url == null) {
            return;
        }
        for (int i = 0; i < ROUTES.length; i++) {
            if (url.contains(ROUTES[i])) {
                currentTab = i;
                updateDockState();
                return;
            }
        }
    }

    private void updateDockState() {
        for (int i = 0; i < TAB_IDS.length; i++) {
            TextView tab = findViewById(TAB_IDS[i]);
            if (tab == null) {
                continue;
            }
            int color = getResources().getColor(
                    i == currentTab ? R.color.dock_active : R.color.dock_inactive, getTheme());
            tab.setTextColor(color);
            tab.setCompoundDrawableTintList(ColorStateList.valueOf(color));
        }
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
        settings.setUserAgentString(settings.getUserAgentString() + " StarDustMobile/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        // 论坛（OMEW）是 iframe + SSO，必须允许三方 cookie
        cookieManager.setAcceptThirdPartyCookies(webView, true);
        cookieManager.flush();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorView.setVisibility(View.GONE);
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                view.evaluateJavascript(HIDE_SITE_CHROME_JS, null);
                syncTabFromUrl(url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    showError();
                }
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
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");
                    startActivityForResult(Intent.createChooser(intent, "选择图片"), REQ_FILE_CHOOSER);
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingFileCallback = null;
                    return false;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }
        });
    }

    private boolean handleUrl(Uri uri) {
        if (uri == null) {
            return false;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost();

        if (("http".equals(scheme) || "https".equals(scheme)) && isInternalHost(host)) {
            return false;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "no handler for " + uri, e);
        }
        return true;
    }

    private static boolean isInternalHost(String host) {
        return "stardustinfinity.top".equals(host) || host.endsWith(".stardustinfinity.top");
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
        String host = data.getHost() == null ? "" : data.getHost();
        if (!isInternalHost(host)) {
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
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    results = new Uri[]{data.getData()};
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
