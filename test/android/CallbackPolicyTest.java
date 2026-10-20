package com.stardust.fans;

public final class CallbackPolicyTest {
    public static void main(String[] args) {
        Object current = new Object();
        check(CallbackPolicy.shouldDeliver(current, current, false, false), "current active target");
        check(!CallbackPolicy.shouldDeliver(null, current, false, false), "null target");
        check(!CallbackPolicy.shouldDeliver(current, new Object(), false, false), "replaced target");
        check(!CallbackPolicy.shouldDeliver(current, current, true, false), "finishing activity");
        check(!CallbackPolicy.shouldDeliver(current, current, false, true), "destroyed activity");
        System.out.println("CallbackPolicy checks passed.");
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }
}
