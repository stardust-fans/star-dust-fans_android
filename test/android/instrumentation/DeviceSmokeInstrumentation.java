package com.stardust.fans.test;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebChromeClient;

import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class DeviceSmokeInstrumentation extends Instrumentation {
    private static final String TARGET = "com.stardust.fans";
    private static final long WAIT_MS = 8000;
    private String currentTest = "startup";
    private Activity activity;

    @Override
    public void onStart() {
        super.onStart();
        Bundle result = new Bundle();
        try {
            currentTest = "cold_main_contract_load";
            activity = startMain();
            verifyContractLoaded();
            result.putString("passed_1", currentTest);

            currentTest = "native_tabs_pages_settings_search";
            verifyNativeNavigation();
            result.putString("passed_2", currentTest);

            currentTest = "fullscreen_back_exit";
            verifyFullscreenBackExit();
            result.putString("passed_3", currentTest);

            currentTest = "file_picker_extension_multi_cancel";
            verifyFilePickerCancel();
            result.putString("passed_4", currentTest);

            currentTest = "pending_picker_finish_and_late_bridge_stress";
            verifyFinishAndLateBridge();
            result.putString("passed_5", currentTest);
            result.putString("status", "passed");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("status", "failed");
            result.putString("failed_test", currentTest);
            result.putString("failure_type", failure.getClass().getSimpleName());
            if (failure.getMessage() != null) result.putString("failure_message", failure.getMessage());
            finish(Activity.RESULT_CANCELED, result);
        } finally {
            closeActivity();
        }
    }

    private Activity startMain() {
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.setClassName(TARGET, TARGET + ".MainActivity");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return startActivitySync(intent);
    }

    private void verifyContractLoaded() throws Exception {
        check(activity != null && !activity.isFinishing(), "main activity did not remain active");
        try (InputStream input = getTargetContext().getAssets().open("site.json")) {
            byte[] bytes = new byte[input.available()];
            int read = input.read(bytes);
            String contract = new String(bytes, 0, Math.max(0, read), StandardCharsets.UTF_8);
            check(contract.contains("https://stardustinfinity.top"), "site contract asset missing or invalid");
        }
        int id = activity.getResources().getIdentifier("web_view", "id", TARGET);
        check(id != 0 && activity.findViewById(id) instanceof WebView, "main WebView missing");
        check(readField(activity, "webView") != null, "main WebView field was not initialized");
    }

    private void verifyFullscreenBackExit() throws Exception {
        Class<?> mainClass = activity.getClass();
        Method show = mainClass.getDeclaredMethod("showFullscreenView", View.class,
                WebChromeClient.CustomViewCallback.class);
        show.setAccessible(true);
        TrackingCustomViewCallback callback = new TrackingCustomViewCallback();
        View customView = new View(activity);
        runOnMainSync(() -> invoke(show, activity, customView, callback));
        check(readField(activity, "fullscreenView") == customView, "fullscreen view was not installed");
        check(customView.getParent() instanceof ViewGroup, "fullscreen view was not attached");

        runOnMainSync(() -> activity.onBackPressed());
        check(readField(activity, "fullscreenView") == null, "Back did not exit fullscreen");
        check(callback.hidden, "fullscreen callback was not completed");
    }

    private void verifyNativeNavigation() throws Exception {
        String[] routes = {"/videos", "/fanart", "/shop", "/omew", "/user"};
        Object dock = readField(activity, "dock");
        check(dock instanceof ViewGroup, "native tab dock missing");
        ViewGroup tabs = (ViewGroup) dock;
        check(tabs.getChildCount() == routes.length, "native tab count does not match the site");
        for (int index = 0; index < routes.length; index++) {
            final int tabIndex = index;
            runOnMainSync(() -> check(tabs.getChildAt(tabIndex).performClick(), "native tab click failed"));
            waitForRouteAndTitle(routes[index], index == 4);
        }

        int pagesId = activity.getResources().getIdentifier("top_pages", "id", TARGET);
        check(pagesId != 0, "all-pages menu button missing");
        runOnMainSync(() -> check(activity.findViewById(pagesId).performClick(), "all-pages menu did not open"));
        sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_DOWN);
        sendKeyDownUpSync(KeyEvent.KEYCODE_ENTER);
        waitForRouteAndTitle("/", false);

        openNativeActivity("top_settings", "com.stardust.fans.SettingsActivity");
        openNativeActivity("top_search", "com.stardust.fans.SearchActivity");
    }

    private void openNativeActivity(String idName, String className) throws Exception {
        int id = activity.getResources().getIdentifier(idName, "id", TARGET);
        check(id != 0, idName + " button missing");
        ActivityMonitor monitor = new ActivityMonitor(className, null, false);
        addMonitor(monitor);
        try {
            runOnMainSync(() -> check(activity.findViewById(id).performClick(), idName + " click failed"));
            Activity opened = monitor.waitForActivityWithTimeout(WAIT_MS);
            check(opened != null && className.equals(opened.getClass().getName()),
                    className + " did not open");
            runOnMainSync(opened::finish);
            waitForMainResumed();
        } finally {
            removeMonitor(monitor);
        }
    }

    private void waitForRouteAndTitle(String expectedPath, boolean allowLogin) throws Exception {
        WebView webView = (WebView) readField(activity, "webView");
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            String[] state = new String[2];
            runOnMainSync(() -> {
                state[0] = webView.getUrl();
                state[1] = webView.getTitle();
            });
            String path = state[0] == null ? null : Uri.parse(state[0]).getPath();
            boolean routeMatches = expectedPath.equals(path)
                    || (allowLogin && "/login".equals(path));
            if (routeMatches && state[1] != null && !state[1].trim().isEmpty()) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("route or page title did not load: " + expectedPath);
    }

    private void waitForMainResumed() throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            if (activity != null && !activity.isFinishing() && !activity.isDestroyed()
                    && activity.hasWindowFocus()) return;
            SystemClock.sleep(50);
        }
        throw new AssertionError("main activity did not resume");
    }

    private void verifyFilePickerCancel() throws Exception {
        WebView webView = (WebView) readField(activity, "webView");
        String html = "<html><body style='margin:0'><input id='upload' type='file' "
                + "accept='.pdf,.zip' multiple style='width:100%;height:120px'></body></html>";
        runOnMainSync(() -> webView.loadDataWithBaseURL(
                "https://stardustinfinity.top/", html, "text/html", "UTF-8", null));
        waitForPage(webView);

        CapturingMonitor monitor = new CapturingMonitor();
        addMonitor(monitor);
        try {
            tapWebView(webView);
            check(monitor.awaitIntent(WAIT_MS), "system file picker launch was not observed");
            Intent pickerIntent = monitor.lastIntent;
            check(pickerIntent != null && Intent.ACTION_OPEN_DOCUMENT.equals(pickerIntent.getAction()),
                    "unexpected file picker action");
            check(pickerIntent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false),
                    "file picker did not enable multiple selection");
            String[] mimeTypes = pickerIntent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES);
            check(hasMime(mimeTypes, "application/pdf") && hasMime(mimeTypes, "application/zip"),
                    "extension accept list was not mapped to MIME types");
            check(readField(activity, "pendingFileCallback") != null, "chooser callback was not retained");
            waitForWindowLoss();
            sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            waitForFieldNull(activity, "pendingFileCallback");
        } finally {
            removeMonitor(monitor);
        }
    }

    private void verifyFinishAndLateBridge() throws Exception {
        TrackingFileCallback callback = new TrackingFileCallback();
        Field pending = field(activity.getClass(), "pendingFileCallback");
        runOnMainSync(() -> set(pending, activity, callback));
        Object bridge = createBridge(activity);
        Method routeChanged = bridge.getClass().getDeclaredMethod("routeChanged", String.class);
        routeChanged.setAccessible(true);

        finishWithQueuedRoute(activity, bridge, routeChanged,
                "https://stardustinfinity.top/videos");
        check(callback.called && callback.value == null, "destroy did not release pending chooser callback");
        check(readField(activity, "webView") == null, "WebView remained after Activity destroy");

        for (int i = 0; i < 10; i++) {
            Activity repeated = startMain();
            Object lateBridge = createBridge(repeated);
            Method lateRoute = lateBridge.getClass().getDeclaredMethod("routeChanged", String.class);
            lateRoute.setAccessible(true);
            finishWithQueuedRoute(repeated, lateBridge, lateRoute,
                    "https://stardustinfinity.top/fanart");
        }
    }

    private void finishWithQueuedRoute(Activity target, Object bridge, Method route, String url)
            throws Exception {
        AtomicReference<Throwable> invocationFailure = new AtomicReference<>();
        CountDownLatch queued = new CountDownLatch(1);
        runOnMainSync(() -> {
            Thread caller = new Thread(() -> {
                try {
                    route.invoke(bridge, url);
                } catch (Throwable failure) {
                    invocationFailure.set(failure);
                } finally {
                    queued.countDown();
                }
            }, "late-route-fixture");
            caller.start();
            try {
                if (!queued.await(WAIT_MS, TimeUnit.MILLISECONDS)) {
                    invocationFailure.set(new AssertionError("route callback was not queued"));
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                invocationFailure.set(e);
            }
            target.finish();
        });
        if (invocationFailure.get() != null) throw new AssertionError("route callback failed", invocationFailure.get());
        waitForDestroyed(target);
        waitForIdleSync();
        route.invoke(bridge, url);
        waitForIdleSync();
    }

    private void waitForPage(WebView webView) throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluate(webView, "!!document.getElementById('upload')"))) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("file input page did not load");
    }

    private String evaluate(WebView webView, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        runOnMainSync(() -> webView.evaluateJavascript(script, result -> {
            value.set(result);
            latch.countDown();
        }));
        check(latch.await(WAIT_MS, TimeUnit.MILLISECONDS), "WebView evaluation timed out");
        return value.get();
    }

    private void tapWebView(WebView webView) {
        int[] location = new int[2];
        webView.getLocationOnScreen(location);
        float x = location[0] + Math.max(20, webView.getWidth() / 2f);
        float y = location[1] + 60;
        long time = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(time, time + 50, MotionEvent.ACTION_UP, x, y, 0);
        try {
            sendPointerSync(down);
            sendPointerSync(up);
        } finally {
            down.recycle();
            up.recycle();
        }
    }

    private void waitForFieldNull(Activity target, String name) throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            if (readField(target, name) == null) return;
            SystemClock.sleep(50);
        }
        throw new AssertionError(name + " was not cleared");
    }

    private void waitForDestroyed(Activity target) throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            if (target.isDestroyed()) return;
            SystemClock.sleep(50);
        }
        throw new AssertionError("Activity did not reach destroyed state");
    }

    private void waitForWindowLoss() throws Exception {
        long deadline = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < deadline) {
            if (!activity.hasWindowFocus()) return;
            SystemClock.sleep(50);
        }
        throw new AssertionError("file picker launch did not pause the main window");
    }

    private static Object createBridge(Activity target) throws Exception {
        for (Class<?> nested : target.getClass().getDeclaredClasses()) {
            if ("NavigationBridge".equals(nested.getSimpleName())) {
                Constructor<?> constructor = nested.getDeclaredConstructor(target.getClass());
                constructor.setAccessible(true);
                return constructor.newInstance(target);
            }
        }
        throw new AssertionError("Navigation bridge class missing");
    }

    private static Object readField(Object target, String name) throws Exception {
        return field(target.getClass(), name).get(target);
    }

    private static Field field(Class<?> type, String name) throws Exception {
        Field field = type.getDeclaredField(name);
        field.setAccessible(true);
        return field;
    }

    private static void set(Field field, Object target, Object value) {
        try {
            field.set(target, value);
        } catch (IllegalAccessException e) {
            throw new AssertionError("cannot set fixture field");
        }
    }

    private static void invoke(Method method, Object target, Object... args) {
        try {
            method.invoke(target, args);
        } catch (Exception e) {
            throw new AssertionError("production callback invocation failed");
        }
    }

    private static boolean hasMime(String[] values, String expected) {
        if (values == null) return false;
        for (String value : values) if (expected.equals(value)) return true;
        return false;
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private void closeActivity() {
        Activity current = activity;
        if (current != null && !current.isDestroyed()) {
            try {
                runOnMainSync(current::finish);
            } catch (Throwable ignored) {
            }
        }
    }

    private static final class CapturingMonitor extends ActivityMonitor {
        volatile Intent lastIntent;
        private final CountDownLatch launched = new CountDownLatch(1);

        CapturingMonitor() {
            super();
        }

        @Override
        public ActivityResult onStartActivity(Intent intent) {
            lastIntent = intent == null ? null : new Intent(intent);
            if (intent != null && Intent.ACTION_OPEN_DOCUMENT.equals(intent.getAction())) launched.countDown();
            return null;
        }

        boolean awaitIntent(long timeoutMs) throws InterruptedException {
            return launched.await(timeoutMs, TimeUnit.MILLISECONDS);
        }
    }

    private static final class TrackingCustomViewCallback implements WebChromeClient.CustomViewCallback {
        volatile boolean hidden;

        @Override
        public void onCustomViewHidden() {
            hidden = true;
        }
    }

    private static final class TrackingFileCallback implements ValueCallback<Uri[]> {
        volatile boolean called;
        volatile Uri[] value;

        @Override
        public void onReceiveValue(Uri[] value) {
            this.value = value;
            called = true;
        }
    }
}
