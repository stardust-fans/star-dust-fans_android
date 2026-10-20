package com.stardust.fans;

final class CallbackPolicy {
    private CallbackPolicy() {}

    static boolean shouldDeliver(Object target, Object current, boolean finishing, boolean destroyed) {
        return target != null && target == current && !finishing && !destroyed;
    }
}
