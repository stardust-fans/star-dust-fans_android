package com.stardust.fans;

import java.net.URI;
import java.net.URISyntaxException;

final class NavigationPolicy {
    private NavigationPolicy() {}

    static boolean isCanonicalOrigin(String value) {
        URI uri = parse(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && "stardustinfinity.top".equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null && uri.getPort() == -1
                && (uri.getPath() == null || uri.getPath().isEmpty())
                && uri.getQuery() == null && uri.getFragment() == null;
    }

    static boolean isSafePath(String value) {
        if (value == null || !value.startsWith("/") || value.startsWith("//")) return false;
        URI uri = parse(value);
        return uri != null && uri.getScheme() == null && uri.getRawAuthority() == null;
    }

    static boolean isInternalMainFrame(String value) {
        URI uri = parse(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && ("stardustinfinity.top".equalsIgnoreCase(uri.getHost())
                    || "omew.stardustinfinity.top".equalsIgnoreCase(uri.getHost()))
                && uri.getUserInfo() == null && uri.getPort() == -1;
    }

    static boolean isRootDeepLink(String value) {
        URI uri = parse(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && "stardustinfinity.top".equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null && uri.getPort() == -1;
    }

    static boolean isForumUrl(String value) {
        URI uri = parse(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && "omew.stardustinfinity.top".equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null && uri.getPort() == -1;
    }

    static boolean isSiteAttachmentDownload(String value) {
        URI uri = parse(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && "stardustinfinity.top".equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null && uri.getPort() == -1
                && uri.getRawPath() != null && uri.getRawPath().startsWith("/attachments/");
    }

    static boolean isBilibiliVideoUrl(String value) {
        URI uri = parse(value);
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || !"www.bilibili.com".equalsIgnoreCase(uri.getHost())
                || uri.getUserInfo() != null || uri.getPort() != -1 || uri.getQuery() != null) return false;
        String path = uri.getPath();
        return path != null && path.matches("/video/BV[0-9A-Za-z]+/?");
    }

    static String routeKey(String value) {
        URI uri = parse(value);
        if (uri == null || uri.getRawPath() == null || uri.getRawPath().isEmpty()) return "/";
        String path = uri.getRawPath();
        while (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
        return path;
    }

    static boolean routeMatches(String url, String route) {
        if (!isSafePath(route)) return false;
        String path = routeKey(url);
        String expected = routeKey(route);
        return path.equals(expected) || ("/".equals(expected) ? false : path.startsWith(expected + "/"));
    }

    static boolean sameRoute(String url, String route) {
        return isSafePath(route) && routeKey(url).equals(routeKey(route));
    }

    private static URI parse(String value) {
        try { return new URI(value); } catch (URISyntaxException | NullPointerException e) { return null; }
    }
}
