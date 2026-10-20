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
        XCTAssertEqual(policy.deepLink(URL(string: "stardust://open?path=%2Ffanart%2F3")!)?.path, "/fanart/3")
        XCTAssertNil(policy.deepLink(URL(string: "stardust://open?path=%2F%2Fevil.example")!))
        XCTAssertNil(policy.deepLink(URL(string: "stardust://evil?path=%2Fvideos")!))
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
}
