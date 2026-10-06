// iOS navigation simulation harness — replays the same fixtures as Android's
// RouteNavigatorSimulationTest through the iOS app's own RouteNavigator.swift.
//
//   tools/nav-sim/ios/run.sh        (from the monorepo root)
//
// Writes app/build/nav-sim/ios/<fixture>.json; tools/nav-sim/evaluate.ts scores them and compares
// them with the Android transcripts.
import Foundation

let root = FileManager.default.currentDirectoryPath
let fixturesDir = URL(fileURLWithPath: root).appendingPathComponent("app/src/test/resources/nav")
let outDir = URL(fileURLWithPath: root).appendingPathComponent("app/build/nav-sim/ios")
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let files = try FileManager.default.contentsOfDirectory(at: fixturesDir, includingPropertiesForKeys: nil)
    .filter { $0.pathExtension == "json" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
guard !files.isEmpty else { fatalError("no fixtures in \(fixturesDir.path) — run tools/nav-sim/generate-fixtures.ts") }

for file in files {
    let fx = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [String: Any]
    let id = fx["id"] as! String
    let route = fx["route"] as! [String: Any]
    let points = (route["points"] as! [[Double]]).map { RouteNavigator.GeoPoint(lat: $0[0], lng: $0[1]) }
    let turns = (fx["turns"] as! [[String: Any]]).map { t in
        RouteNavigator.NavTurn(text: t["text"] as! String, lat: t["lat"] as! Double, lng: t["lng"] as! Double,
                               routeMetersHint: (t["distance"] as? Double) ?? Double(t["distance"] as? Int ?? 0),
                               streetName: t["streetName"] as? String)
    }
    let nav = RouteNavigator(routePoints: points, turns: turns)
    var cues: [[String: Any]] = []
    for f in fx["fixes"] as! [[String: Any]] {
        let t = Int64((f["t"] as! NSNumber).int64Value)
        let out = nav.update(lat: f["lat"] as! Double, lng: f["lng"] as! Double,
                             accuracyM: (f["acc"] as! NSNumber).doubleValue, speedMps: (f["speed"] as! NSNumber).doubleValue, timeMs: t)
        for c in out {
            cues.append(["t": t, "kind": c.kind.rawValue, "text": c.text,
                         "turnIndex": c.turnIndex.map { $0 as Any } ?? NSNull(),
                         "s": (f["s"] as? NSNumber).map { $0.doubleValue as Any } ?? NSNull()])
        }
    }
    let json = try JSONSerialization.data(withJSONObject: ["id": id, "platform": "ios", "cues": cues], options: [.sortedKeys])
    try json.write(to: outDir.appendingPathComponent("\(id).json"))
}
print("iOS: replayed \(files.count) fixtures → \(outDir.path)")
