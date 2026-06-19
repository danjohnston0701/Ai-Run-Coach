// AI Run Coach - Garmin Connect IQ Companion App
// Main Application Entry Point
// RunView is the default screen with overlay messaging for auth flow.

using Toybox.Application as App;
using Toybox.WatchUi as Ui;
using Toybox.System as Sys;

class AiRunCoachApp extends App.AppBase {

    private var _runView = null;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
        Sys.println("AI Run Coach started");
    }

    function onStop(state) {
        Sys.println("AI Run Coach stopped");
    }

    // Return RunView as the initial view (no StartView).
    // RunView displays overlay messaging to guide the user through auth & run flow.
    function getInitialView() {
        _runView  = new RunView();
        var delegate = new RunDelegate();
        delegate.setView(_runView);
        return [_runView, delegate];
    }

    // Handle settings changes (e.g. from Garmin Connect app)
    function onSettingsChanged() {
        Ui.requestUpdate();
    }

    // Called by DataStreamer.onDataSent when the backend piggybacks a coaching cue.
    // Coaching audio plays on the phone/headphones — watch only delivers a haptic pulse.
    function onCoachingCue(cueText) {
        if (_runView != null) {
            _runView.setCoachingCue(cueText);
        }
    }

    // Called by DataStreamer when an HTTP data POST receives a 200 response.
    // Resets the HTTP failure counter so the offline buffer stays dormant when online.
    function onHttpSuccess() {
        if (_runView != null) {
            _runView.onHttpSuccess();
        }
    }

    // Called by DataStreamer when an HTTP data POST fails (non-200 / network error).
    // After HTTP_FAIL_THRESHOLD consecutive failures RunView activates the offline buffer.
    function onHttpFailure() {
        if (_runView != null) {
            _runView.onHttpFailure();
        }
    }

    // Called by DataStreamer.onBatchUploaded() when an offline batch syncs successfully.
    // Forwards to RunView so it can notify the phone via PhoneLink.
    function onBatchUploaded(sessionId, runId) {
        if (_runView != null) {
            _runView.onBatchUploaded(sessionId, runId);
        }
    }
}
