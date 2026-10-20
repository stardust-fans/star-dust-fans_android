import XCTest
@testable import StarDust

final class NavigationTests: XCTestCase {
    func testOnlyHTTPSOriginAndExplicitForumHostAreInternal() {
        let policy = SafeNavigation(origin: "https://stardustinfinity.top")
        XCTAssertNotNil(policy.validated(URL(string: "https://stardustinfinity.top/videos")!))
        XCTAssertNil(policy.validated(URL(string: "https://cdn.stardustinfinity.top/a")!))
        XCTAssertNotNil(policy.validated(URL(string: "https://omew.stardustinfinity.top/authorize")!))
        XCTAssertNil(policy.validated(URL(string: "https://stardustinfinity.top.attacker.example/")!))
        XCTAssertNil(policy.validated(URL(string: "http://stardustinfinity.top/")!))
        XCTAssertNil(policy.validated(URL(string: "https://user@stardustinfinity.top/")!))
        XCTAssertNil(policy.validated(URL(string: "https://stardustinfinity.top:8443/")!))
    }
    func testDeepLinkRequiresSafeAbsolutePath() {
        let policy = SafeNavigation(origin: "https://stardustinfinity.top")
        let destination = policy.deepLink(URL(string: "stardust://open?path=%2Ffanart%2F3%3Fimage%3D2%23preview")!)
        XCTAssertEqual(destination?.path, "/fanart/3")
        XCTAssertEqual(destination?.query, "image=2")
        XCTAssertEqual(destination?.fragment, "preview")
        XCTAssertNil(policy.deepLink(URL(string: "stardust://open?path=%2F%2Fevil.example")!))
        XCTAssertNil(policy.deepLink(URL(string: "stardust://open?path=%2F%5C%5Cevil.example")!))
        XCTAssertNil(policy.deepLink(URL(string: "stardust://evil?path=%2Fvideos")!))
        XCTAssertNil(policy.deepLink(URL(string: "stardust://open?path=%2Fvideos&extra=1")!))
    }

    func testForumHostIsExplicitlyTrustedButArbitrarySubdomainsAreNot() {
        let policy = SafeNavigation(origin: "https://stardustinfinity.top")
        XCTAssertNotNil(policy.validated(URL(string: "https://omew.stardustinfinity.top/forum")!))
        XCTAssertNil(policy.validated(URL(string: "https://evil.stardustinfinity.top/forum")!))
        XCTAssertNil(policy.validated(URL(string: "https://stardustinfinity.top:443/forum")!))
    }
}
import XCTest
@testable import StarDust

final class NotificationModelTests: XCTestCase {
    func testFeedRecordDecodesFieldsUsedForAlerts() throws {
        let record = try JSONDecoder().decode(FeedRecord.self, from: #"{"id":7,"title":"New","author":"Artist"}"#.data(using: .utf8)!)
        XCTAssertEqual(record.id, 7)
        XCTAssertEqual(record.title, "New")
    }
}


final class SearchAPITests: XCTestCase {
    func testVideoSearchUsesNestedOwnerShape() throws {
        let json = #"[{"bvid":"BV123","title":"Song","owner":{"name":"Singer","mid":9,"face":"https://example.com/a.png"}}]"#
        let values = try JSONDecoder().decode([VideoSearchRecord].self, from: json.data(using: .utf8)!)
        XCTAssertEqual(values.first?.owner?.name, "Singer")
        XCTAssertEqual(values.first?.bvid, "BV123")
    }

    func testSearchResultUsesWebDetailRouteInsteadOfAPIEndpoint() {
        XCTAssertEqual(SearchDestination.detail(prefix: "/fanart/", itemID: 17), "/fanart/17")
        XCTAssertEqual(SearchDestination.detail(prefix: "/shop/", itemID: 23), "/shop/23")
    }
}

@MainActor final class WebSessionTests: XCTestCase {
    func testSessionRetainsItsWebView() {
        let session = WebSession()
        weak var weakView = session.view
        XCTAssertNotNil(weakView)
        XCTAssertTrue(session.view.configuration.websiteDataStore === session.store)
    }
}

final class FeedBaselineTests: XCTestCase {
    func testFirstReadEstablishesBaselineWithoutHistoricalAlerts() {
        let baseline = FeedBaseline.establish(existing: nil, fetchedMaximum: 42)
        XCTAssertEqual(baseline, 42)
        XCTAssertEqual(FeedBaseline.unseen(existing: baseline, itemIDs: [40, 41, 42]), [])
    }

    func testOnlyItemsAboveBaselineAreNewAndAdvancementIsMonotonic() {
        XCTAssertEqual(FeedBaseline.unseen(existing: 7, itemIDs: [9, 7, 8, 10]), [8, 9, 10])
        XCTAssertEqual(FeedBaseline.advance(existing: 12, newest: 10), 12)
        XCTAssertEqual(FeedBaseline.establish(existing: 12, fetchedMaximum: 30), 12)
    }

    func testDisableAndReenableInvalidatesAnInFlightBaselineWrite() {
        let suite = "FeedPreferenceStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = FeedPreferenceStore(defaults: defaults)
        store.setEnabled(true, feedID: "fanart")
        let stale = store.snapshot(feedID: "fanart")

        store.setEnabled(false, feedID: "fanart")
        store.setEnabled(true, feedID: "fanart")

        XCTAssertFalse(store.establishBaseline(42, feedID: "fanart", ifCurrent: stale))
        XCTAssertNil(store.baseline(feedID: "fanart"))

        let current = store.snapshot(feedID: "fanart")
        XCTAssertTrue(store.establishBaseline(17, feedID: "fanart", ifCurrent: current))
        XCTAssertEqual(store.baseline(feedID: "fanart"), 17)
    }
}
