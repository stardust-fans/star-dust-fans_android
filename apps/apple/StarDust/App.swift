import SwiftUI
import WebKit
import UserNotifications
import BackgroundTasks

@main struct StarDustApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(model) }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    static let refreshID = "top.stardustinfinity.mobile.refresh"
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshID, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else { task.setTaskCompleted(success: false); return }
            refresh.expirationHandler = { refresh.setTaskCompleted(success: false) }
            Task { await NotificationService.shared.poll(); refresh.setTaskCompleted(success: true); NotificationService.shared.schedule() }
        }
        return true
    }
    func applicationDidEnterBackground(_ application: UIApplication) { NotificationService.shared.schedule() }
}

@MainActor final class AppModel: ObservableObject {
    @Published var contract: SiteContract?
    @Published var contractError: String?
    @Published var selectedTab = ""
    @Published var currentURL: URL?
    @Published var canGoBack = false
    @Published var loading = false
    @Published var failure: String?
    @Published var showSearch = false
    @Published var showSettings = false
    @Published var showAllPages = false
    @Published var shareURL: URL?
    let web = WebSession()
    init() {
        do { contract = try SiteContract.load(); selectedTab = contract?.tabs.first?.id ?? "" }
        catch { contractError = "The bundled site contract is missing or invalid. Rebuild the app with packages/site-contract/site.json." }
    }
    func open(_ path: String) {
        guard let contract, let base = URL(string: contract.origin), let url = URL(string: path, relativeTo: base)?.absoluteURL,
              SafeNavigation(origin: contract.origin).validated(url) != nil else { failure = "This page address is not allowed."; return }
        selectedTab = contract.tabs.first(where: { path == $0.path || path.hasPrefix($0.path + "/") })?.id ?? selectedTab
        failure = nil; web.view?.load(URLRequest(url: url))
    }
    func sync(_ url: URL?) {
        currentURL = url; canGoBack = web.view?.canGoBack ?? false
        guard let url, let contract else { return }
        if let tab = contract.tabs.first(where: { url.path == $0.path || url.path.hasPrefix($0.path + "/") }) { selectedTab = tab.id }
    }
    func openSearchResult(_ destination: String) {
        guard let contract, let base = URL(string: contract.origin), let url = URL(string: destination, relativeTo: base)?.absoluteURL else { return }
        let policy = SafeNavigation(origin: contract.origin)
        if policy.validated(url) != nil { open(url.path + (url.query.map { "?\($0)" } ?? "")); return }
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil else { return }
        UIApplication.shared.open(url)
    }
}

final class WebSession: ObservableObject {
    let controller: WKUserContentController
    let store: WKWebsiteDataStore
    weak var view: WKWebView?
    init() {
        store = .default(); controller = WKUserContentController()
        let config = WKWebViewConfiguration(); config.websiteDataStore = store; config.userContentController = controller
        let web = WKWebView(frame: .zero, configuration: config); web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .automatic; self.view = web
    }
}

struct RootView: View {
    @AppStorage("notify.interval") private var foregroundInterval = 60
    @EnvironmentObject private var model: AppModel
    var body: some View {
        Group {
            if let error = model.contractError { VStack(spacing: 12) { Image(systemName: "exclamationmark.triangle").font(.largeTitle); Text("App setup needed").font(.headline); Text(error).multilineTextAlignment(.center).foregroundStyle(.secondary) }.padding() }
            else { appShell }
        }
        .sheet(isPresented: $model.showSearch) { SearchView() }
        .sheet(isPresented: $model.showSettings) { SettingsView() }
        .sheet(isPresented: $model.showAllPages) { PageDirectoryView() }
        .sheet(item: Binding(get: { model.shareURL.map(ShareItem.init) }, set: { model.shareURL = $0?.url })) { item in ShareSheet(items: [item.url]) }
        .task(id: foregroundInterval) {
            while !Task.isCancelled {
                await NotificationService.shared.poll()
                try? await Task.sleep(for: .seconds(foregroundInterval * 60))
            }
        }
        .onOpenURL { url in if let path = model.contract.flatMap({ SafeNavigation(origin: $0.origin).deepLink(url) })?.path { model.open(path) } else if let valid = model.contract.flatMap({ SafeNavigation(origin: $0.origin).validated(url) }) { model.open(valid.path + (valid.query.map { "?\($0)" } ?? "")) } }
    }
    private var appShell: some View {
        VStack(spacing: 0) {
            HStack {
                Button { model.showAllPages = true } label: { Image(systemName: "line.3.horizontal").font(.title3) }.accessibilityLabel("All pages")
                Spacer()
                Button { model.showSearch = true } label: { Label("Search", systemImage: "magnifyingglass") }
                Button { model.showSettings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
            }.padding(.horizontal).padding(.vertical, 10)
            if model.loading { ProgressView().progressViewStyle(.linear) }
            if let failure = model.failure { Label(failure, systemImage: "wifi.exclamationmark").font(.callout).padding(8) }
            WebContent().environmentObject(model)
            HStack {
                Button { model.web.view?.goBack() } label: { Image(systemName: "chevron.backward") }.disabled(!model.canGoBack).accessibilityLabel("Back")
                Button { model.web.view?.reload() } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Reload")
                Spacer()
                ForEach(model.contract?.tabs ?? []) { tab in
                    Button { model.open(tab.path) } label: { VStack(spacing: 3) { Image(systemName: tab.symbol); Text(tab.title).font(.caption2).lineLimit(1) } }
                        .foregroundStyle(model.selectedTab == tab.id ? Color.accentColor : Color.secondary).frame(maxWidth: .infinity)
                }
                Spacer()
                Button { model.shareURL = model.currentURL } label: { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Share current page")
            }.padding(.horizontal, 10).padding(.top, 8).padding(.bottom, 4).background(.bar)
        }
        .task { if let first = model.contract?.tabs.first { model.open(first.path) } }
    }
}

struct WebContent: UIViewRepresentable {
    @EnvironmentObject var model: AppModel
    func makeCoordinator() -> Coordinator { Coordinator(model) }
    func makeUIView(context: Context) -> WKWebView {
        let web = model.web.view!; web.navigationDelegate = context.coordinator; web.uiDelegate = context.coordinator
        context.coordinator.urlObservation = web.observe(\.url, options: [.new]) { [weak coordinator = context.coordinator] view, _ in DispatchQueue.main.async { coordinator?.model.sync(view.url) } }
        if let contract = model.contract {
            let script = "var s=document.createElement('style');s.textContent=" + (try? String(data: JSONSerialization.data(withJSONObject: contract.chromeCSS), encoding: .utf8))! + ";document.documentElement.appendChild(s);"
            model.web.controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        return web
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let model: AppModel
        init(_ model: AppModel) { self.model = model }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            guard navigationAction.targetFrame?.isMainFrame != false else { decisionHandler(.allow); return }
            if SafeNavigation(origin: model.contract!.origin).validated(url) != nil { decisionHandler(.allow); return }
            if navigationAction.navigationType == .linkActivated, url.scheme == "https", url.user == nil, url.password == nil, url.port == nil { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
            if SafeNavigation(origin: model.contract!.origin).validated(url) != nil { webView.load(navigationAction.request) }
            else if navigationAction.navigationType == .linkActivated, url.scheme == "https", url.user == nil, url.password == nil, url.port == nil { UIApplication.shared.open(url) }
            return nil
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { model.loading = true; model.failure = nil }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { model.loading = false; model.sync(webView.url) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { model.loading = false; model.failure = "Page could not load. Check your connection and retry." }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { webView(webView, didFail: navigation, withError: error) }
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { alert(message, title: "Message", completion: completionHandler) }
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { let a = UIAlertController(title: "Confirm", message: message, preferredStyle: .alert); a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) }); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) }); presenter?.present(a, animated: true) }
        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) { let a = UIAlertController(title: "Input", message: prompt, preferredStyle: .alert); a.addTextField { $0.text = defaultText }; a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) }); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) }); presenter?.present(a, animated: true) }
        var presenter: UIViewController? { UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController }.first }
        func alert(_ message: String, title: String, completion: @escaping () -> Void) { let a = UIAlertController(title: title, message: message, preferredStyle: .alert); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion() }); presenter?.present(a, animated: true) }
    }
}
struct ShareItem: Identifiable { let id = UUID(); let url: URL }
struct ShareSheet: UIViewControllerRepresentable { let items: [Any]; func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }; func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {} }
