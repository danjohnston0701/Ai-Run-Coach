// Lists on-screen simulator windows (iOS Simulator, Connect IQ) with their window IDs and bounds.
//   swift tools/winlist.swift        → "<id> <owner> | <title> <bounds>"
// Used to find the Connect IQ window for `screencapture -l<id>` and for the video-recording rect.
import CoreGraphics
import Foundation

let opts = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] ?? []
for w in list {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    let name = w[kCGWindowName as String] as? String ?? ""
    let id = w[kCGWindowNumber as String] as? Int ?? 0
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let o = owner.lowercased()
    if o.contains("simulator") || o.contains("connectiq") || o.contains("java") {
        let x = b["X"] as? Double ?? 0, y = b["Y"] as? Double ?? 0
        let wd = b["Width"] as? Double ?? 0, ht = b["Height"] as? Double ?? 0
        print(id, owner, "|", name, "|", Int(x), Int(y), Int(wd), Int(ht))
    }
}
