import Foundation

struct SiteContract: Decodable {
    struct Tab: Decodable, Identifiable { let id: String; let title: String; let path: String; let symbol: String }
    struct Page: Decodable, Identifiable { let id: String; let title: String; let path: String; let section: String; let entry: Bool }
    struct Feed: Decodable, Identifiable { let id: String; let path: String; let detailPath: String; let title: String }
    struct Search: Decodable { let videos: String; let fanart: String; let shop: String }
    let version: Int
    let origin: String
    let webSource: WebSource
    let tabs: [Tab]
    let pages: [Page]
    let notificationFeeds: [Feed]
    let search: Search
    let chromeCSS: String
    struct WebSource: Decodable { let repository: String; let commit: String }

    static func load(bundle: Bundle = .main) throws -> SiteContract {
        guard let url = bundle.url(forResource: "site", withExtension: "json") else { throw ContractError.missing }
        let value = try JSONDecoder().decode(SiteContract.self, from: Data(contentsOf: url))
        guard let origin = URL(string: value.origin), origin.scheme == "https", origin.host == "stardustinfinity.top", origin.port == nil, origin.user == nil, origin.password == nil,
              value.version == 1, !value.tabs.isEmpty, !value.pages.isEmpty else { throw ContractError.invalid }
        return value
    }
    enum ContractError: LocalizedError {
        case missing, invalid
        var errorDescription: String? {
            switch self {
            case .missing: return "找不到打包的站点配置文件 site.json。"
            case .invalid: return "站点配置版本、HTTPS 来源或页面清单无效。"
            }
        }
    }
}

struct SafeNavigation {
    let origin: URL
    init(origin: String) { self.origin = URL(string: origin)! }
    func validated(_ url: URL) -> URL? {
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased(),
              url.user == nil, url.password == nil, url.port == nil else { return nil }
        let root = origin.host!.lowercased()
        guard host == root || host == "omew.stardustinfinity.top" else { return nil }
        return url
    }
    func deepLink(_ url: URL) -> URL? {
        guard url.scheme == "stardust", url.host == "open", url.user == nil, url.password == nil,
              url.port == nil, let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let items = components.queryItems, items.count == 1, items[0].name == "path",
              let path = items[0].value, path.hasPrefix("/"), !path.hasPrefix("//"),
              !path.contains("\\"), !path.lowercased().contains("%5c"),
              let destination = URL(string: path, relativeTo: origin)?.absoluteURL,
              validated(destination) != nil else { return nil }
        return destination
    }
}

struct FeedRecord: Decodable, Identifiable { let id: Int; let title: String; let author: String?; let price: String? }

enum FeedBaseline {
    static func establish(existing: Int?, fetchedMaximum: Int) -> Int? {
        existing ?? fetchedMaximum
    }
    static func unseen(existing: Int?, itemIDs: [Int]) -> [Int] {
        guard let existing else { return [] }
        return itemIDs.filter { $0 > existing }.sorted()
    }
    static func advance(existing: Int?, newest: Int) -> Int {
        max(existing ?? newest, newest)
    }
}

final class FeedPreferenceStore: @unchecked Sendable {
    struct Snapshot { let enabled: Bool; let generation: Int }
    static let shared = FeedPreferenceStore()
    private let defaults: UserDefaults
    private let lock = NSLock()

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    func setEnabled(_ enabled: Bool, feedID: String) {
        lock.lock(); defer { lock.unlock() }
        let generationKey = "generation.\(feedID)"
        defaults.set(defaults.integer(forKey: generationKey) &+ 1, forKey: generationKey)
        defaults.set(enabled, forKey: "notify.\(feedID)")
        if !enabled { defaults.removeObject(forKey: "baseline.\(feedID)") }
    }
    func snapshot(feedID: String) -> Snapshot {
        lock.lock(); defer { lock.unlock() }
        return Snapshot(enabled: defaults.bool(forKey: "notify.\(feedID)"), generation: defaults.integer(forKey: "generation.\(feedID)"))
    }
    func baseline(feedID: String) -> Int? {
        lock.lock(); defer { lock.unlock() }
        return defaults.object(forKey: "baseline.\(feedID)") as? Int
    }
    @discardableResult func establishBaseline(_ value: Int, feedID: String, ifCurrent snapshot: Snapshot) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard defaults.bool(forKey: "notify.\(feedID)"), defaults.integer(forKey: "generation.\(feedID)") == snapshot.generation else { return false }
        guard defaults.object(forKey: "baseline.\(feedID)") == nil else { return false }
        defaults.set(value, forKey: "baseline.\(feedID)")
        return true
    }
    @discardableResult func advanceBaseline(_ value: Int, feedID: String, ifCurrent snapshot: Snapshot) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard defaults.bool(forKey: "notify.\(feedID)"), defaults.integer(forKey: "generation.\(feedID)") == snapshot.generation else { return false }
        defaults.set(value, forKey: "baseline.\(feedID)")
        return true
    }
}

enum SearchDestination {
    static func detail(prefix: String, itemID: Int) -> String {
        prefix + String(itemID)
    }
}

struct NavigationRequestState {
    private(set) var hasRequest = false

    mutating func claimInitialRequest() -> Bool {
        guard !hasRequest else { return false }
        hasRequest = true
        return true
    }

    mutating func recordRequest() {
        hasRequest = true
    }
}


struct VideoSearchRecord: Decodable {
    struct Owner: Decodable { let name: String? }
    let bvid: String
    let title: String
    let owner: Owner?
}
