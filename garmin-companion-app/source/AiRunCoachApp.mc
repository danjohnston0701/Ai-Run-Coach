// AI Run Coach - Garmin Connect IQ Companion App
// Main Application Entry Point

using Toybox.Application as App;
using Toybox.WatchUi as Ui;
using Toybox.System as Sys;

class AiRunCoachApp extends App.AppBase {
    
    private var _session = null;
    
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
        
        // Clean up session if active
        if (_session != null) {
            _session.stop();
            _session = null;
        }
    }

    // Return the initial view
    function getInitialView() {
        return [new StartView(), new StartDelegate()];
    }
    
    // Handle settings changes
    function onSettingsChanged() {
        Ui.requestUpdate();
    }
}
