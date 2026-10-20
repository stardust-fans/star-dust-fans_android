package com.stardust.fans;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

/** 崩溃报告页：展示堆栈，支持一键复制 / 重新打开 App。 */
public final class CrashReportActivity extends Activity {
    static final String EXTRA_REPORT = "report";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_crash);

        String report = getIntent().getStringExtra(EXTRA_REPORT);
        if (report == null) {
            report = CrashHandler.readLast(this);
        }
        if (report == null) {
            report = "没有拿到崩溃信息";
        }

        TextView text = findViewById(R.id.crash_text);
        text.setText(report);

        final String finalReport = report;

        Button copy = findViewById(R.id.crash_copy);
        copy.setOnClickListener(v -> {
            ClipboardManager clipboard =
                    (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) {
                clipboard.setPrimaryClip(ClipData.newPlainText("StarDust crash", finalReport));
                Toast.makeText(this, "崩溃信息已复制", Toast.LENGTH_SHORT).show();
            }
        });

        Button restart = findViewById(R.id.crash_restart);
        restart.setOnClickListener(v -> {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(intent);
            finish();
        });
    }
}
