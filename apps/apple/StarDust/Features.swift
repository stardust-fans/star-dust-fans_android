import SwiftUI
import Foundation

struct SearchHit: Identifiable, Sendable { let id = UUID(); let kind: String; let title: String; let subtitle: String; let path: String }
struct SearchView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var hits: [SearchHit] = []
    @State private var busy = false
    @State private var message = "Enter a search term"
    @State private var searchTask: Task<Void, Never>?
    var body: some View {
        NavigationStack {
            List {
                Section { TextField("Videos, fanart, shop", text: $query).submitLabel(.search).onSubmit { submit() }; Button(action: submit) { Label("Search all content", systemImage: "magnifyingglass") }.disabled(query.trimmingCharacters(in: .whitespaces).isEmpty) }
                if busy { ProgressView() }
                if hits.isEmpty { Text(message).foregroundStyle(.secondary) }
                ForEach(hits) { hit in Button { model.openSearchResult(hit.path); dismiss() } label: { VStack(alignment: .leading) { Text(hit.title).font(.headline); Text("\(hit.kind) · \(hit.subtitle)").font(.caption).foregroundStyle(.secondary) } } }
            }.navigationTitle("Search").toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }.onDisappear { searchTask?.cancel() }
    }
    private func submit() {
        searchTask?.cancel()
        searchTask = Task { await search() }
    }
    @MainActor private func search() async {
        guard let contract = model.contract, let base = URL(string: contract.origin) else { return }
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return }
        busy = true; hits = []; message = "Searching…"
        let endpoints = [("Videos", contract.search.videos), ("Fanart", contract.search.fanart), ("Shop", contract.search.shop)]
        var all: [SearchHit] = []
        await withTaskGroup(of: [SearchHit].self) { group in
            for (kind, path) in endpoints { group.addTask { await Self.fetch(kind: kind, path: path, base: base, query: term) } }
            for await values in group { all.append(contentsOf: values) }
        }
        guard !Task.isCancelled else { return }
        hits = Array(all.prefix(60)); busy = false; message = hits.isEmpty ? "No matching content found" : ""
    }
    nonisolated private static func fetch(kind: String, path: String, base: URL, query: String) async -> [SearchHit] {
        guard let endpoint = URL(string: path, relativeTo: base)?.absoluteURL else { return [] }
        do {
            var requestURL = endpoint
            if kind == "Videos" {
                guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else { return [] }
                components.queryItems = [URLQueryItem(name: "q", value: query), URLQueryItem(name: "limit", value: "20"), URLQueryItem(name: "offset", value: "0")]
                guard let encoded = components.url else { return [] }
                requestURL = encoded
                let (data, _) = try await URLSession.shared.data(from: requestURL)
                let records = try JSONDecoder().decode([VideoSearchRecord].self, from: data)
                return records.compactMap { record in
                    guard record.title.localizedCaseInsensitiveContains(query) || record.bvid.localizedCaseInsensitiveContains(query) || (record.owner?.name ?? "").localizedCaseInsensitiveContains(query),
                          !record.bvid.isEmpty else { return nil }
                    return SearchHit(kind: kind, title: record.title, subtitle: record.owner?.name ?? "", path: "https://www.bilibili.com/video/\(record.bvid)")
                }
            }
            let (data, _) = try await URLSession.shared.data(from: requestURL)
            guard let array = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
            let needle = query.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            return array.compactMap { item in
                let title = item["title"] as? String ?? ""
                let subtitle = kind == "Fanart" ? (item["author"] as? String ?? "") : String(describing: item["price"] ?? "")
                guard (title + " " + subtitle).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current).contains(needle) else { return nil }
                let id = item["id"] as? Int ?? 0
                return SearchHit(kind: kind, title: title, subtitle: subtitle, path: "\(path)/\(id)")
            }
        } catch { return [] }
    }
}
struct PageDirectoryView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                ForEach(Dictionary(grouping: (model.contract?.pages ?? []).filter(\.entry), by: \.section).keys.sorted(), id: \.self) { section in
                    Section(section.capitalized) {
                        ForEach((model.contract?.pages ?? []).filter { $0.entry && $0.section == section }) { page in
                            Button(page.title) { model.open(page.path); dismiss() }
                        }
                    }
                }
            }.navigationTitle("All pages").toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("notify.fanart") private var fanart = false
    @AppStorage("notify.shop") private var shop = false
    @AppStorage("notify.interval") private var interval = 60
    @State private var status = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("New posts") {
                    Toggle("Fanart", isOn: $fanart).onChange(of: fanart) { _ in changed() }
                    Toggle("Shop", isOn: $shop).onChange(of: shop) { _ in changed() }
                    Picker("Check while app is open", selection: $interval) { Text("15 minutes").tag(15); Text("30 minutes").tag(30); Text("1 hour").tag(60); Text("3 hours").tag(180) }.onChange(of: interval) { _ in NotificationService.shared.schedule() }
                    Text("Background checks are scheduled by iOS and may run less often or not at all. Video alerts are not available.").font(.footnote).foregroundStyle(.secondary)
                    if !status.isEmpty { Text(status).font(.footnote) }
                }
                Section("Privacy") { Text("Pages and sign-in use a persistent website data store on this device. Forum SSO depends on Safari/WebKit privacy policy and the forum provider.").font(.footnote) }
            }.navigationTitle("Settings").toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
    private func changed() { Task { status = await NotificationService.shared.setEnabled(fanart || shop) } }
}

actor NotificationService {
    static let shared = NotificationService()
    private let defaults = UserDefaults.standard
    private var contract: SiteContract? { try? SiteContract.load() }

    func setEnabled(_ enabled: Bool) async -> String {
        if enabled {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                do { guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) else { return "Notifications were not permitted." } }
                catch { return "Notification permission could not be requested." }
            } else if settings.authorizationStatus == .denied { return "Allow notifications in iOS Settings to receive alerts." }
        }
        for feed in contract?.notificationFeeds ?? [] {
            let key = "notify.\(feed.id)", baseline = "baseline.\(feed.id)"
            guard defaults.bool(forKey: key) else { defaults.removeObject(forKey: baseline); continue }
            if defaults.object(forKey: baseline) == nil, let current = await maxID(path: feed.path) { defaults.set(current, forKey: baseline) }
        }
        schedule()
        return "Notification preferences saved."
    }

    func schedule() {
        let feeds = contract?.notificationFeeds ?? []
        guard feeds.contains(where: { defaults.bool(forKey: "notify.\($0.id)") }) else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: AppDelegate.refreshID)
            return
        }
        let request = BGAppRefreshTaskRequest(identifier: AppDelegate.refreshID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: AppDelegate.refreshID)
        try? BGTaskScheduler.shared.submit(request)
    }

    func poll() async {
        guard let contract, let base = URL(string: contract.origin) else { return }
        for feed in contract.notificationFeeds where defaults.bool(forKey: "notify.\(feed.id)") {
            guard let url = URL(string: feed.path, relativeTo: base),
                  let (data, _) = try? await URLSession.shared.data(from: url),
                  let records = try? JSONDecoder().decode([FeedRecord].self, from: data) else { continue }
            let key = "baseline.\(feed.id)", last = defaults.integer(forKey: key), newest = records.map(\.id).max() ?? last
            guard defaults.object(forKey: key) != nil else { defaults.set(newest, forKey: key); continue }
            let fresh = records.filter { $0.id > last }.sorted { $0.id < $1.id }
            for item in fresh.prefix(5) {
                let content = UNMutableNotificationContent()
                content.title = "New \(feed.title)"
                content.body = item.title
                content.sound = .default
                content.userInfo = ["path": "\(feed.detailPath)\(item.id)"]
                try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "\(feed.id)-\(item.id)", content: content, trigger: nil))
            }
            defaults.set(max(last, newest), forKey: key)
        }
    }

    private func maxID(path: String) async -> Int? {
        guard let contract, let base = URL(string: contract.origin), let url = URL(string: path, relativeTo: base),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let values = try? JSONDecoder().decode([FeedRecord].self, from: data) else { return nil }
        return values.map(\.id).max() ?? 0
    }
}
import UIKit
import UserNotifications

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let path = response.notification.request.content.userInfo["path"] as? String,
           let url = URL(string: "stardust://open?path=\(path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") {
            DispatchQueue.main.async { UIApplication.shared.open(url) }
        }
        completionHandler()
    }
}
