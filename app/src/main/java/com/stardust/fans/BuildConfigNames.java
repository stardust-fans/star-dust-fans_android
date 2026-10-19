package com.stardust.fans;

import android.content.Context;
import android.os.Build;

/** 版本信息小工具（避免依赖 BuildConfig，两套构建都能用）。 */
final class BuildConfigNames {
    private BuildConfigNames() {
    }

    static String versionLine(Context context) {
        String versionName = "?";
        int versionCode = 0;
        try {
            android.content.pm.PackageInfo info =
                    context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            versionName = info.versionName;
            versionCode = Build.VERSION.SDK_INT >= 28
                    ? (int) info.getLongVersionCode()
                    : info.versionCode;
        } catch (Exception ignored) {
        }
        return versionName + " (" + versionCode + "), API " + Build.VERSION.SDK_INT;
    }
}
