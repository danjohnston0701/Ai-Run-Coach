// AI Run Coach - Garmin Connect IQ Companion App
// Main Application Entry Point
// Now uses RunView as the default screen with overlay messaging for auth flow.

using Toybox.Application as App;
using Toybox.WatchUi as Ui;
using Toybox.System as Sys;

class AiRunCoachApp extends App.AppBase {

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
        var view     = new RunView();
        var delegate = new RunDelegate();
        delegate.setView(view);
        return [view, delegate];
    }

    // Handle settings changes (e.g. from Garmin Connect app)
    function onSettingsChanged() {
        Ui.requestUpdate();
    }
}
