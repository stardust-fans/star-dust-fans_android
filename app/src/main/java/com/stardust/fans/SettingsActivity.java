package com.stardust.fans;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.Toast;

/**
 * App 内推送设置页。
 * 通知权限、渠道、轮询频率都是 App 本地能力，所以放在这里而不是网站 /settings。
 */
public final class SettingsActivity extends Activity {
    private static final String TAG = "StarDustSettings";
    private static final int REQ_NOTIFICATIONS = 5001;

    private static final int[] FOREGROUND_OPTIONS = {30, 60, 120};
    private static final int[] BACKGROUND_OPTIONS = {3, 5, 10, 15, 30};

    private Prefs prefs;
    private Switch fanartSwitch;
    private Switch shopSwitch;
    private Spinner foregroundSpinner;
    private Spinner backgroundSpinner;
    private Button checkButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);
        prefs = new Prefs(this);

        fanartSwitch = findViewById(R.id.switch_fanart);
        shopSwitch = findViewById(R.id.switch_shop);
        foregroundSpinner = findViewById(R.id.spinner_foreground);
        backgroundSpinner = findViewById(R.id.spinner_background);
        checkButton = findViewById(R.id.btn_check_now);

        setupSpinners();

        fanartSwitch.setChecked(prefs.isFanartEnabled());
        shopSwitch.setChecked(prefs.isShopEnabled());

        fanartSwitch.setOnCheckedChangeListener((buttonView, isChecked) -> {
            prefs.setFanartEnabled(isChecked);
            afterToggleChanged();
        });
        shopSwitch.setOnCheckedChangeListener((buttonView, isChecked) -> {
            prefs.setShopEnabled(isChecked);
            afterToggleChanged();
        });

        checkButton.setOnClickListener(v -> checkNow());
        findViewById(R.id.btn_battery).setOnClickListener(v -> openBatterySettings());
        findViewById(R.id.btn_system_notifications).setOnClickListener(v -> openSystemNotificationSettings());
        findViewById(R.id.btn_web_settings).setOnClickListener(v -> openWebSettings());
    }

    private void setupSpinners() {
        String[] foregroundLabels = new String[FOREGROUND_OPTIONS.length];
        for (int i = 0; i < FOREGROUND_OPTIONS.length; i++) {
            foregroundLabels[i] = FOREGROUND_OPTIONS[i] + " 秒";
        }
        String[] backgroundLabels = new String[BACKGROUND_OPTIONS.length];
        for (int i = 0; i < BACKGROUND_OPTIONS.length; i++) {
            backgroundLabels[i] = BACKGROUND_OPTIONS[i] + " 分钟";
        }

        foregroundSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, foregroundLabels));
        backgroundSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, backgroundLabels));

        foregroundSpinner.setSelection(indexOf(FOREGROUND_OPTIONS, prefs.getForegroundSeconds()));
        backgroundSpinner.setSelection(indexOf(BACKGROUND_OPTIONS, prefs.getBackgroundMinutes()));

        // 注意：先 setSelection 再挂监听，避免初始化时误触发
        foregroundSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                prefs.setForegroundSeconds(FOREGROUND_OPTIONS[position]);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
        backgroundSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                prefs.setBackgroundMinutes(BACKGROUND_OPTIONS[position]);
                Scheduler.reschedule(getApplicationContext());
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
    }

    private static int indexOf(int[] values, int target) {
        for (int i = 0; i < values.length; i++) {
            if (values[i] == target) {
                return i;
            }
        }
        return 0;
    }

    private void afterToggleChanged() {
        if (prefs.anyEnabled()) {
            prefs.resetBaseline();      // 重新开启时避免补推停用期间的历史
            ensureNotificationPermission();
        }
        Scheduler.reschedule(getApplicationContext());
    }

    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }
        if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
    }

    private void checkNow() {
        checkButton.setEnabled(false);
        checkButton.setText("检查中…");
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            PollWorker.run(app);
            runOnUiThread(() -> {
                checkButton.setEnabled(true);
                checkButton.setText("立即检查一次");
                Toast.makeText(this, "已检查，有新内容会立即通知", Toast.LENGTH_SHORT).show();
            });
        }, "stardust-manual-check").start();
    }

    private void openBatterySettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ignored) {
                Toast.makeText(this, "当前系统不支持跳转电池优化设置", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void openSystemNotificationSettings() {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
            }
            startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "cannot open notification settings", e);
        }
    }

    /** 在 App 内打开网站设置（复用 WebView，而不是跳系统浏览器） */
    private void openWebSettings() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(ApiClient.BASE + "/settings"));
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
}
