package com.stardust.fans;

public final class NavigationPolicyTest {
    public static void main(String[] args) {
        require(NavigationPolicy.isInternalMainFrame("https://stardustinfinity.top/videos"));
        require(!NavigationPolicy.isInternalMainFrame("http://stardustinfinity.top/videos"));
        require(!NavigationPolicy.isInternalMainFrame("https://www.stardustinfinity.top/videos"));
        require(!NavigationPolicy.isInternalMainFrame("https://stardustinfinity.top.evil.example/videos"));
        require(!NavigationPolicy.isInternalMainFrame("https://user@stardustinfinity.top/videos"));
        require(!NavigationPolicy.isInternalMainFrame("https://stardustinfinity.top:8443/videos"));
        require(NavigationPolicy.isInternalMainFrame("https://omew.stardustinfinity.top/login"));
        require(!NavigationPolicy.isRootDeepLink("https://omew.stardustinfinity.top/login"));
        require(NavigationPolicy.isForumUrl("https://omew.stardustinfinity.top/category/1"));
        require(!NavigationPolicy.isForumUrl("https://x.omew.stardustinfinity.top/category/1"));
        require(NavigationPolicy.isRootDeepLink("https://stardustinfinity.top/user/profile"));
        require(NavigationPolicy.isBilibiliVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD"));
        require(!NavigationPolicy.isBilibiliVideoUrl("http://www.bilibili.com/video/BV1xx411c7mD"));
        require(!NavigationPolicy.isBilibiliVideoUrl("https://bilibili.com/video/BV1xx411c7mD"));
        require(!NavigationPolicy.isBilibiliVideoUrl("https://www.bilibili.com/video/BV1xx411c7mD?foo=1"));
        require(!NavigationPolicy.isBilibiliVideoUrl("https://www.bilibili.com/video/not-a-bvid"));
        require(!NavigationPolicy.isInternalMainFrame("javascript:alert(1)"));
        require(NavigationPolicy.routeMatches("https://stardustinfinity.top/videos?id=1", "/videos"));
        require(NavigationPolicy.routeMatches("https://stardustinfinity.top/videos/item/1", "/videos"));
        require(!NavigationPolicy.sameRoute("https://stardustinfinity.top/videos/item/1", "/videos"));
        require(NavigationPolicy.sameRoute("https://stardustinfinity.top/videos/?id=1", "/videos"));
        require(!NavigationPolicy.routeMatches("https://stardustinfinity.top/videos-old", "/videos"));
        require(!NavigationPolicy.routeMatches("https://stardustinfinity.top/videos%2Fadmin", "/videos"));
        require(!NavigationPolicy.routeMatches("https://stardustinfinity.top/fanart", "/videos"));
        require(NavigationPolicy.isSafePath("/omew"));
        require(!NavigationPolicy.isSafePath("//evil.example/path"));
        require(!NavigationPolicy.isSafePath("https://stardustinfinity.top/videos"));
    }

    private static void require(boolean condition) {
        if (!condition) throw new AssertionError();
    }
}
