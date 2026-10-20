import SwiftUI
import Foundation
import BackgroundTasks

struct SearchHit: Identifiable, Sendable {
    let id = UUID()
    let kind: String
    let title: String
    let subtitle: String
    let path: String
    var displayKind: String { kind == "Videos" ? "视频" : (kind == "Fanart" ? "同人" : "量贩") }
}
private struct SearchFetchResult: Sendable {
    let hits: [SearchHit]
    let failed: Bool
}
struct SearchView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var hits: [SearchHit] = []
    @State private var busy = false
    @State private var message = "输入关键词开始搜索"
    @State private var searchTask: Task<Void, Never>?
    var body: some View {
        NavigationStack {
            List {
                Section { TextField("搜索视频、同人和量贩", text: $query).submitLabel(.search).onSubmit { submit() }; Button(action: submit) { Label("搜索全站内容", systemImage: "magnifyingglass") }.disabled(query.trimmingCharacters(in: .whitespaces).isEmpty) }
                if busy { ProgressView().accessibilityLabel("搜索中") }
                if hits.isEmpty { Text(message).foregroundStyle(.secondary) }
                ForEach(hits) { hit in Button { model.openSearchResult(hit.path); dismiss() } label: { VStack(alignment: .leading) { Text(hit.title).font(.headline); Text("\(hit.displayKind) · \(hit.subtitle)").font(.caption).foregroundStyle(.secondary) } } }
        }.navigationTitle("搜索").toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button("完成") { dismiss() } } }
        }.onDisappear { searchTask?.cancel() }
    }
    private func submit() {
        searchTask?.cancel()
        let term = query
        searchTask = Task { await search(term: term) }
    }
    @MainActor private func search(term rawTerm: String) async {
        guard let contract = model.contract, let base = URL(string: contract.origin) else { return }
        let term = rawTerm.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { hits = []; busy = false; message = "输入关键词开始搜索"; return }
        busy = true; hits = []; message = "搜索中…"
        var endpoints: [(String, String, String?)] = [("Videos", contract.search.videos, nil)]
        endpoints += contract.notificationFeeds.compactMap { feed in
            guard feed.id == "fanart" || feed.id == "shop" else { return nil }
            return (feed.id == "fanart" ? "Fanart" : "Shop", feed.path, feed.detailPath)
        }
        var all: [SearchHit] = []
        var hadFailure = false
        await withTaskGroup(of: SearchFetchResult.self) { group in
            for (kind, path, detailPath) in endpoints { group.addTask { await Self.fetch(kind: kind, path: path, detailPath: detailPath, base: base, query: term) } }
            for await result in group {
                all.append(contentsOf: result.hits)
                hadFailure = hadFailure || result.failed
            }
        }
        guard !Task.isCancelled else { return }
        hits = Array(all.prefix(60)); busy = false
        if hadFailure { message = hits.isEmpty ? "搜索服务暂不可用，请稍后重试" : "部分搜索来源暂不可用" }
        else { message = hits.isEmpty ? "没有找到匹配内容" : "" }
    }
    nonisolated private static func fetch(kind: String, path: String, detailPath: String?, base: URL, query: String) async -> SearchFetchResult {
        guard let endpoint = URL(string: path, relativeTo: base)?.absoluteURL else { return SearchFetchResult(hits: [], failed: true) }
        do {
            var requestURL = endpoint
            if kind == "Videos" {
                guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else { return SearchFetchResult(hits: [], failed: true) }
                components.queryItems = [URLQueryItem(name: "q", value: query), URLQueryItem(name: "limit", value: "20"), URLQueryItem(name: "offset", value: "0")]
                guard let encoded = components.url else { return SearchFetchResult(hits: [], failed: true) }
                requestURL = encoded
                let (data, response) = try await URLSession.shared.data(from: requestURL)
                guard (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) == true else { return SearchFetchResult(hits: [], failed: true) }
                let records = try JSONDecoder().decode([VideoSearchRecord].self, from: data)
                let hits = records.compactMap { record in
                    guard record.title.localizedCaseInsensitiveContains(query) || record.bvid.localizedCaseInsensitiveContains(query) || (record.owner?.name ?? "").localizedCaseInsensitiveContains(query),
                          !record.bvid.isEmpty else { return nil }
                    return SearchHit(kind: kind, title: record.title, subtitle: record.owner?.name ?? "", path: "https://www.bilibili.com/video/\(record.bvid)")
                }
                return SearchFetchResult(hits: hits, failed: false)
            }
            guard let detailPath else { return SearchFetchResult(hits: [], failed: true) }
            let (data, response) = try await URLSession.shared.data(from: requestURL)
            guard (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) == true,
                  let array = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return SearchFetchResult(hits: [], failed: true) }
            let needle = query.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            let hits = array.compactMap { item in
                let title = item["title"] as? String ?? ""
                let subtitle = kind == "Fanart" ? (item["author"] as? String ?? "") : String(describing: item["price"] ?? "")
                guard (title + " " + subtitle).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current).contains(needle) else { return nil }
                let id = item["id"] as? Int ?? 0
                guard id > 0 else { return nil }
                return SearchHit(kind: kind, title: title, subtitle: subtitle, path: SearchDestination.detail(prefix: detailPath, itemID: id))
            }
            return SearchFetchResult(hits: hits, failed: false)
        } catch { return SearchFetchResult(hits: [], failed: true) }
    }
}
struct PageDirectoryView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                ForEach(Dictionary(grouping: (model.contract?.pages ?? []).filter(\.entry), by: \.section).keys.sorted(), id: \.self) { section in
                    Section(sectionTitle(section)) {
                        ForEach((model.contract?.pages ?? []).filter { $0.entry && $0.section == section }) { page in
                            Button(page.title) { model.open(page.path); dismiss() }
                        }
                    }
                }
            }.navigationTitle("全部页面").toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button("完成") { dismiss() } } }
        }
    }
    private func sectionTitle(_ section: String) -> String {
        switch section {
        case "discover": return "发现"
        case "content": return "内容"
        case "account": return "账号"
        case "system": return "其他"
        default: return section
        }
    }
}

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var fanart: Bool
    @State private var shop: Bool
    @AppStorage("notify.interval") private var interval = 60
    @State private var status = ""
    init() {
        _fanart = State(initialValue: FeedPreferenceStore.shared.snapshot(feedID: "fanart").enabled)
        _shop = State(initialValue: FeedPreferenceStore.shared.snapshot(feedID: "shop").enabled)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("新内容提醒") {
                    Toggle("同人", isOn: Binding(get: { fanart }, set: { setFeed("fanart", enabled: $0) }))
                    Toggle("量贩", isOn: Binding(get: { shop }, set: { setFeed("shop", enabled: $0) }))
                    Picker("前台检查间隔", selection: $interval) { Text("15 分钟").tag(15); Text("30 分钟").tag(30); Text("1 小时").tag(60); Text("3 小时").tag(180) }.onChange(of: interval) { _ in Task { await NotificationService.shared.schedule() } }
                    Text("后台检查由 iOS 调度，实际间隔可能更长或跳过。视频暂无更新提醒。").font(.footnote).foregroundStyle(.secondary)
                    if !status.isEmpty { Text(status).font(.footnote) }
                }
                Section("隐私") { Text("网页和登录状态保存在本机。论坛单点登录是否可用，取决于 WebKit 隐私策略与论坛服务。").font(.footnote) }
            }.navigationTitle("设置").toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button("完成") { dismiss() } } }
        }
    }
    private func setFeed(_ feedID: String, enabled: Bool) {
        if feedID == "fanart" { fanart = enabled } else { shop = enabled }
        FeedPreferenceStore.shared.setEnabled(enabled, feedID: feedID)
        Task {
            status = await NotificationService.shared.feedSettingChanged(feedID)
            await NotificationService.shared.schedule()
        }
    }
}

actor NotificationService {
    static let shared = NotificationService()
    private let preferences = FeedPreferenceStore.shared
    private var contract: SiteContract? { try? SiteContract.load() }
    private var isPolling = false

    func feedSettingChanged(_ feedID: String) async -> String {
        guard contract?.notificationFeeds.contains(where: { $0.id == feedID }) == true else { return "找不到此提醒来源。" }
        guard preferences.snapshot(feedID: feedID).enabled else {
            return "提醒设置已保存。"
        }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            do {
                guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) else { return "未获得通知权限。可在系统设置中开启。" }
            } catch { return "无法申请通知权限：\(error.localizedDescription)" }
        } else if settings.authorizationStatus == .denied {
            return "请在系统设置中允许通知。"
        }
        await poll()
        schedule()
        return "提醒设置已保存。"
    }

    func schedule() {
        let feeds = contract?.notificationFeeds ?? []
        guard feeds.contains(where: { preferences.snapshot(feedID: $0.id).enabled }) else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: AppDelegate.refreshID)
            return
        }
        let request = BGAppRefreshTaskRequest(identifier: AppDelegate.refreshID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: AppDelegate.refreshID)
        try? BGTaskScheduler.shared.submit(request)
    }

    func poll() async {
        guard !isPolling else { return }
        isPolling = true
        defer { isPolling = false }
        let permission = await UNUserNotificationCenter.current().notificationSettings()
        guard permission.authorizationStatus == .authorized || permission.authorizationStatus == .provisional else { return }
        guard let contract, let base = URL(string: contract.origin) else { return }
        for feed in contract.notificationFeeds {
            guard !Task.isCancelled else { return }
            let snapshot = preferences.snapshot(feedID: feed.id)
            guard snapshot.enabled else { continue }
            guard let url = URL(string: feed.path, relativeTo: base),
                  let (data, _) = try? await URLSession.shared.data(from: url),
                  let records = try? JSONDecoder().decode([FeedRecord].self, from: data) else { continue }
            let afterFetch = preferences.snapshot(feedID: feed.id)
            guard !Task.isCancelled, afterFetch.enabled, afterFetch.generation == snapshot.generation else { continue }
            let existing = preferences.baseline(feedID: feed.id)
            let newest = records.map(\.id).max() ?? existing ?? 0
            guard let existing else {
                if let baseline = FeedBaseline.establish(existing: nil, fetchedMaximum: newest) {
                    preferences.establishBaseline(baseline, feedID: feed.id, ifCurrent: snapshot)
                }
                continue
            }
            for id in FeedBaseline.unseen(existing: existing, itemIDs: records.map(\.id)).prefix(5) {
                let current = preferences.snapshot(feedID: feed.id)
                guard !Task.isCancelled, current.enabled, current.generation == snapshot.generation,
                      let item = records.first(where: { $0.id == id }) else { break }
                let content = UNMutableNotificationContent()
                content.title = "有新内容：\(feed.title)"
                content.body = item.title
                content.sound = .default
                content.userInfo = ["path": "\(feed.detailPath)\(item.id)"]
                try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "\(feed.id)-\(item.id)", content: content, trigger: nil))
            }
            let beforeAdvance = preferences.snapshot(feedID: feed.id)
            guard !Task.isCancelled, beforeAdvance.enabled, beforeAdvance.generation == snapshot.generation else { continue }
            preferences.advanceBaseline(FeedBaseline.advance(existing: existing, newest: newest), feedID: feed.id, ifCurrent: snapshot)
        }
    }

}
import UIKit
import UserNotifications

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let identifier = notification.request.identifier
        let enabled = ["fanart", "shop"].contains { feedID in
            identifier.hasPrefix("\(feedID)-") && FeedPreferenceStore.shared.snapshot(feedID: feedID).enabled
        }
        completionHandler(enabled ? [.banner, .list, .sound] : [])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let path = response.notification.request.content.userInfo["path"] as? String,
           path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("\\") {
            var components = URLComponents()
            components.scheme = "stardust"
            components.host = "open"
            components.queryItems = [URLQueryItem(name: "path", value: path)]
            if let url = components.url {
                DispatchQueue.main.async { UIApplication.shared.open(url) }
            }
        }
        completionHandler()
    }
}
