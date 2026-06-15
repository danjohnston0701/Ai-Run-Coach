// BackgroundService.mc
// Garmin Connect IQ Background Service
//
// Runs on a 20-minute temporal trigger while Garmin Connect is active.
// Checks App.Storage for any offline run batch saved during a phone-less run
// and uploads it directly to the AI Run Coach backend — no user action required.
//
// Flow:
//   1. Watch completes a run with no phone → RunView saves offline batch to Storage
//   2. Background service wakes up (every 20 min)
//   3. Finds pending batch + valid auth token → uploads via HTTP
//   4. On success: clears storage, sends "syncComplete" to phone via BT
//   5. On failure: leaves storage intact so next trigger retries
//
// NOTE: Background build is compiled separately with a reduced API surface.
// All code in this file is tagged (:background) and must not reference
// UI, Graphics, or any foreground-only API.

using Toybox.Background as Bg;
using Toybox.Communications as Comm;
using Toybox.Application as App;
using Toybox.System as Sys;
using Toybox.Lang as Lang;

(:background)
class BackgroundService extends Bg.ServiceDelegate {

    private var _pendingSessionId = null;

    function initialize() {
        Bg.ServiceDelegate.initialize();
    }

    // ── Temporal trigger ──────────────────────────────────────────────────────
    // Called every 20 minutes by the Connect IQ scheduler.
    // Checks for a pending offline run batch and uploads it if auth is available.

    function onTemporalEvent() {
        var pendingSid = App.Storage.getValue("offlineBatchSessionId");
        var pendingPts = App.Storage.getValue("offlineBatchPoints");
        var authToken  = App.Storage.getValue("authToken");

        // Nothing to upload or not authenticated yet
        if (pendingSid == null || authToken == null) {
            Sys.println("BgService: no pending batch or no auth token");
            Bg.exit(null);
            return;
        }

        // Guard against corrupt/stale storage (e.g. old SDK version wrote a non-Array)
        if (!(pendingPts instanceof Lang.Array) || pendingPts.size() == 0) {
            Sys.println("BgService: offline batch empty or invalid type — clearing stale storage");
            _clearStorage();
            Bg.exit(null);
            return;
        }

        // Save session ID so onUploadDone can reference it after the async callback
        _pendingSessionId = pendingSid;

        var dist = App.Storage.getValue("offlineBatchDistance");
        var dur  = App.Storage.getValue("offlineBatchDuration");
        var asc  = App.Storage.getValue("offlineBatchAscent");

        var payload = {
            "sessionId"   => pendingSid,
            "points"      => pendingPts,
            "distanceM"   => (dist != null) ? dist : 0.0,
            "durationSec" => (dur  != null) ? dur  : 0,
            "totalAscent" => (asc  != null) ? asc  : 0.0
        };
        var options = {
            :method       => Comm.HTTP_REQUEST_METHOD_POST,
            :headers      => {
                "Content-Type"  => Comm.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + authToken
            },
            :responseType => Comm.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        var url = "https://airuncoach.live/api/garmin-companion/session/" + pendingSid + "/upload-batch";

        try {
            Comm.makeWebRequest(url, payload, options, method(:onUploadDone));
            Sys.println("BgService: upload started — session=" + pendingSid + " points=" + pendingPts.size());
        } catch (ex) {
            // makeWebRequest can throw if BT/WiFi is unavailable right now.
            // Leave storage intact so next trigger retries.
            Sys.println("BgService: makeWebRequest threw — " + ex.toString());
            Bg.exit(null);
        }
    }

    // ── HTTP response ─────────────────────────────────────────────────────────

    function onUploadDone(responseCode as Lang.Number, data as Lang.Dictionary or Lang.String or Null) as Void {
        if (responseCode == 200) {
            Sys.println("BgService: upload succeeded — clearing storage");
            _clearStorage();

            // Notify phone so it can show the "Garmin run synced!" notification
            // with a deep link to the new run summary screen.
            var runId = null;
            if (data instanceof Lang.Dictionary) {
                runId = data.get("runId");
            }
            var msg = { "type" => "command", "action" => "syncComplete" };
            if (_pendingSessionId != null) { msg.put("sessionId", _pendingSessionId); }
            if (runId != null)             { msg.put("runId",     runId);             }

            try {
                Comm.transmit(msg, null, null);
                Sys.println("BgService: syncComplete sent to phone (runId=" + runId + ")");
            } catch (ex) {
                // BT may not be connected right now — that's OK, the phone will
                // see the run appear in history the next time it refreshes.
                Sys.println("BgService: transmit failed (phone not nearby?) — " + ex.toString());
            }
        } else {
            // Upload failed — leave storage intact for retry on next temporal event.
            Sys.println("BgService: upload failed (HTTP " + responseCode + ") — will retry in 20 min");
        }

        Bg.exit(null);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function _clearStorage() {
        App.Storage.deleteValue("offlineBatchSessionId");
        App.Storage.deleteValue("offlineBatchPoints");
        App.Storage.deleteValue("offlineBatchDistance");
        App.Storage.deleteValue("offlineBatchDuration");
        App.Storage.deleteValue("offlineBatchAscent");
    }
}
