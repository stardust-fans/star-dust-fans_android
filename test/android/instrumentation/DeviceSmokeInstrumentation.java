package com.stardust.fans.test;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.IntentFilter;
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

            currentTest = "fullscreen_back_exit";
            verifyFullscreenBackExit();
            result.putString("passed_2", currentTest);

            currentTest = "file_picker_extension_multi_cancel";
            verifyFilePickerCancel();
            result.putString("passed_3", currentTest);

            currentTest = "pending_picker_finish_and_late_bridge";
            verifyFinishAndLateBridge();
            result.putString("passed_4", currentTest);
            result.putString("status", "passed");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("status", "failed");
            result.putString("failed_test", currentTest);
            result.putString("failure_type", failure.getClass().getSimpleName());
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
            Activity picker = monitor.waitForActivityWithTimeout(WAIT_MS);
            check(picker != null, "system file picker did not open");
            Intent pickerIntent = monitor.lastIntent;
            check(pickerIntent != null && Intent.ACTION_OPEN_DOCUMENT.equals(pickerIntent.getAction()),
                    "unexpected file picker action");
            check(pickerIntent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false),
                    "file picker did not enable multiple selection");
            String[] mimeTypes = pickerIntent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES);
            check(hasMime(mimeTypes, "application/pdf") && hasMime(mimeTypes, "application/zip"),
                    "extension accept list was not mapped to MIME types");
            check(readField(activity, "pendingFileCallback") != null, "chooser callback was not retained");
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

        runOnMainSync(() -> activity.finish());
        waitForDestroyed(activity);
        check(callback.called && callback.value == null, "destroy did not release pending chooser callback");
        check(readField(activity, "webView") == null, "WebView remained after Activity destroy");
        routeChanged.invoke(bridge, "https://stardustinfinity.top/videos");
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

        CapturingMonitor() {
            super(new IntentFilter(Intent.ACTION_OPEN_DOCUMENT), null, false);
        }

        @Override
        public ActivityResult onStartActivity(Intent intent) {
            lastIntent = intent == null ? null : new Intent(intent);
            return super.onStartActivity(intent);
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
