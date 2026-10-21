import SwiftUI
import WebKit
import UserNotifications
import BackgroundTasks

@main struct StarDustApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel()
    var body: some Scene { WindowGroup { RootView().environmentObject(model) } }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    nonisolated static let refreshID = "top.stardustinfinity.mobile.refresh"
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshID, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else { task.setTaskCompleted(success: false); return }
            let completion = RefreshCompletion(refresh)
            let work = Task {
                await NotificationService.shared.poll()
                guard !Task.isCancelled else { completion.finish(false); return }
                completion.finish(true)
                await NotificationService.shared.schedule()
            }
            refresh.expirationHandler = { work.cancel(); completion.finish(false) }
        }
        return true
    }
}

private final class RefreshCompletion {
    private let task: BGAppRefreshTask
    private let lock = NSLock()
    private var completed = false
    init(_ task: BGAppRefreshTask) { self.task = task }
    func finish(_ success: Bool) {
        lock.lock(); defer { lock.unlock() }
        guard !completed else { return }
        completed = true
        task.setTaskCompleted(success: success)
    }
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
    private var navigationRequests = NavigationRequestState()

    init() {
        do { contract = try SiteContract.load(); selectedTab = contract?.tabs.first?.id ?? "" }
        catch { contractError = "无法加载站点配置：\(error.localizedDescription)" }
    }
    func open(_ path: String) {
        guard let contract, let base = URL(string: contract.origin), let url = URL(string: path, relativeTo: base)?.absoluteURL else {
            failure = "无法打开此页面地址。"; return
        }
        open(url)
    }
    func open(_ url: URL) {
        guard let contract, SafeNavigation(origin: contract.origin).validated(url) != nil else {
            failure = "此页面地址不受信任。"; return
        }
        selectedTab = contract.tabs.first(where: { url.path == $0.path || url.path.hasPrefix($0.path + "/") })?.id ?? selectedTab
        failure = nil
        navigationRequests.recordRequest()
        web.view.load(URLRequest(url: url))
    }
    func openInitialPageIfNeeded() {
        guard navigationRequests.claimInitialRequest(), let first = contract?.tabs.first else { return }
        open(first.path)
    }
    func sync(_ url: URL?) {
        currentURL = url
        canGoBack = web.view.canGoBack
        guard let url, let contract else { return }
        if let tab = contract.tabs.first(where: { url.path == $0.path || url.path.hasPrefix($0.path + "/") }) { selectedTab = tab.id }
    }
    func handleIncomingURL(_ url: URL) {
        guard let contract else { return }
        let policy = SafeNavigation(origin: contract.origin)
        if let destination = policy.deepLink(url) {
            open(destination)
        } else if let destination = policy.validated(url) {
            open(destination)
        }
    }
    func openSearchResult(_ destination: String) {
        guard let contract, let base = URL(string: contract.origin), let url = URL(string: destination, relativeTo: base)?.absoluteURL else { return }
        let policy = SafeNavigation(origin: contract.origin)
        if policy.validated(url) != nil { open(url); return }
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil else { return }
        UIApplication.shared.open(url)
    }
}

@MainActor final class WebSession: ObservableObject {
    let controller: WKUserContentController
    let store: WKWebsiteDataStore
    let view: WKWebView
    init() {
        store = .default()
        controller = WKUserContentController()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = store
        config.userContentController = controller
        view = WKWebView(frame: .zero, configuration: config)
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.contentInsetAdjustmentBehavior = .automatic
    }
}

struct RootView: View {
    @AppStorage("notify.interval") private var foregroundInterval = 60
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            if let error = model.contractError {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle").font(.largeTitle)
                    Text("应用配置异常").font(.headline)
                    Text(error).multilineTextAlignment(.center).foregroundStyle(.secondary)
                }.padding()
            } else { appShell }
        }
        .sheet(isPresented: $model.showSearch) { SearchView() }
        .sheet(isPresented: $model.showSettings) { SettingsView() }
        .sheet(isPresented: $model.showAllPages) { PageDirectoryView() }
        .sheet(item: Binding(get: { model.shareURL.map(ShareItem.init) }, set: { model.shareURL = $0?.url })) { item in ShareSheet(items: [item.url]) }
        .task(id: "\(foregroundInterval)-\(scenePhase == .active)") {
            guard scenePhase == .active else { return }
            while !Task.isCancelled && scenePhase == .active {
                await NotificationService.shared.poll()
                try? await Task.sleep(for: .seconds(foregroundInterval * 60))
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background {
                Task { await NotificationService.shared.schedule() }
            }
        }
        .onOpenURL { url in
            model.handleIncomingURL(url)
        }
    }
    private var appShell: some View {
        VStack(spacing: 0) {
            HStack {
                Button { model.showAllPages = true } label: { Image(systemName: "line.3.horizontal").font(.title3) }.accessibilityLabel("全部页面")
                Spacer()
                Button { model.showSearch = true } label: { Label("搜索", systemImage: "magnifyingglass") }
                Button { model.showSettings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("设置")
                Menu {
                    Button { model.web.view.goBack() } label: { Label("返回", systemImage: "chevron.backward") }
                        .disabled(!model.canGoBack)
                    Button { model.web.view.reload() } label: { Label("刷新", systemImage: "arrow.clockwise") }
                    Button { model.shareURL = model.currentURL } label: { Label("分享当前页面", systemImage: "square.and.arrow.up") }
                        .disabled(model.currentURL == nil)
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("更多")
            }.padding(.horizontal).padding(.vertical, 10)
            if model.loading { ProgressView().progressViewStyle(.linear) }
            if let failure = model.failure { Label(failure, systemImage: "wifi.exclamationmark").font(.callout).padding(8) }
            WebContent().environmentObject(model)
            HStack(spacing: 0) {
                ForEach(model.contract?.tabs ?? []) { tab in
                    let selected = model.selectedTab == tab.id
                    Button { model.open(tab.path) } label: {
                        VStack(spacing: 3) {
                            Image(systemName: tab.symbol)
                            Text(tab.title).font(.caption2).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(selected ? Color.accentColor : Color.secondary)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(tab.title)
                    .accessibilityValue(selected ? "已选中" : "")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 4)
            .padding(.bottom, 4)
            .background(.bar)
        }
        .task { model.openInitialPageIfNeeded() }
    }
}

struct WebContent: UIViewRepresentable {
    @EnvironmentObject var model: AppModel
    func makeCoordinator() -> Coordinator { Coordinator(model) }
    func makeUIView(context: Context) -> WKWebView {
        let web = model.web.view
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        context.coordinator.urlObservation = web.observe(\.url, options: [.new]) { [weak coordinator = context.coordinator] view, _ in
            DispatchQueue.main.async { coordinator?.model.sync(view.url) }
        }
        if let contract = model.contract,
           let data = try? JSONEncoder().encode(contract.chromeCSS),
           let cssLiteral = String(data: data, encoding: .utf8) {
            let script = "var s=document.createElement('style');s.textContent=" + cssLiteral + ";document.documentElement.appendChild(s);"
            model.web.controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        return web
    }
    func updateUIView(_ view: WKWebView, context: Context) {}

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let model: AppModel
        var urlObservation: NSKeyValueObservation?
        init(_ model: AppModel) { self.model = model }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
            guard let contract = model.contract else { decisionHandler(.cancel); return }
            if navigationAction.navigationType == .linkActivated,
               url.scheme == "https", url.host == "stardustinfinity.top", url.path.hasPrefix("/attachments/"),
               url.user == nil, url.password == nil, url.port == nil {
                UIApplication.shared.open(url)
            } else if SafeNavigation(origin: contract.origin).validated(url) != nil {
                decisionHandler(.allow); return
            } else if navigationAction.navigationType == .linkActivated, url.scheme == "https", url.user == nil, url.password == nil, url.port == nil {
                UIApplication.shared.open(url)
            } else if navigationAction.navigationType == .linkActivated, url.scheme == "mailto", url.host == nil, !url.path.isEmpty {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
            guard let contract = model.contract else { return nil }
            if navigationAction.navigationType == .linkActivated, url.scheme == "https", url.host == "stardustinfinity.top", url.path.hasPrefix("/attachments/"), url.user == nil, url.password == nil, url.port == nil { UIApplication.shared.open(url) }
            else if SafeNavigation(origin: contract.origin).validated(url) != nil { webView.load(navigationAction.request) }
            else if navigationAction.navigationType == .linkActivated, url.scheme == "https", url.user == nil, url.password == nil, url.port == nil { UIApplication.shared.open(url) }
            else if navigationAction.navigationType == .linkActivated, url.scheme == "mailto", url.host == nil, !url.path.isEmpty { UIApplication.shared.open(url) }
            return nil
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { model.loading = true; model.failure = nil }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { model.loading = false; model.sync(webView.url) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { model.loading = false; model.failure = "页面加载失败：\(error.localizedDescription)" }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { self.webView(webView, didFail: navigation, withError: error) }
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { alert(message, title: "Message", completion: completionHandler) }
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { let a = UIAlertController(title: "Confirm", message: message, preferredStyle: .alert); a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) }); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) }); presenter?.present(a, animated: true) }
        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) { let a = UIAlertController(title: "Input", message: prompt, preferredStyle: .alert); a.addTextField { $0.text = defaultText }; a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) }); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) }); presenter?.present(a, animated: true) }
        var presenter: UIViewController? { UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController }.first }
        func alert(_ message: String, title: String, completion: @escaping () -> Void) { let a = UIAlertController(title: title, message: message, preferredStyle: .alert); a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion() }); presenter?.present(a, animated: true) }
    }
}

struct ShareItem: Identifiable { var id: String { url.absoluteString }; let url: URL }
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
