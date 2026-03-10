// AI Run Coach - Garmin Connect IQ Companion App
// Main Application Entry Point

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

    // Return the initial view — pass the view to its delegate so the delegate
    // can call view methods (isAuthenticated, launchRunView).
    function getInitialView() {
        var view     = new StartView();
        var delegate = new StartDelegate(view);
        return [view, delegate];
    }

    // Handle settings changes (e.g. from Garmin Connect app)
    function onSettingsChanged() {
        Ui.requestUpdate();
    }
}
