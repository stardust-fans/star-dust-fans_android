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
    enum ContractError: Error { case missing, invalid }
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
              let path = components.queryItems?.first(where: { $0.name == "path" })?.value,
              path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
        return URL(string: path, relativeTo: origin)?.absoluteURL
    }
}

struct FeedRecord: Decodable, Identifiable { let id: Int; let title: String; let author: String?; let price: String? }


struct VideoSearchRecord: Decodable {
    struct Owner: Decodable { let name: String? }
    let bvid: String
    let title: String
    let owner: Owner?
}
