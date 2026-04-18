// AI Run Coach - Garmin Connect IQ Companion App
// Main Application Entry Point
// Now uses RunView as the default screen with overlay messaging for auth flow.

using Toybox.Application as App;
using Toybox.WatchUi as Ui;
using Toybox.System as Sys;

class AiRunCoachApp extends App.AppBase {

    private var _runView = null;

    function initialize() {
        AppBase.initialize();
    }

    // Called when the app is launched
    function onStart(state) {
        Sys.println("AI Run Coach started");
    }

    // Called when the app is stopped
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

    // Called by DataStreamer.onDataSent when the backend piggybacks a coaching cue
    // on the metrics POST response.  Forwards to RunView so it can show the overlay.
    function onCoachingCue(cueText) {
        if (_runView != null) {
            _runView.setCoachingCue(cueText);
            Ui.requestUpdate();
        }
    }
}
