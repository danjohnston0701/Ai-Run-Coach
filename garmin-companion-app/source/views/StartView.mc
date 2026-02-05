// Start View - Initial screen before starting run

using Toybox.WatchUi as Ui;
using Toybox.Graphics as Gfx;
using Toybox.System as Sys;
using Toybox.Application as App;

class StartView extends Ui.View {
    
    private var _statusText = "Ready to Start";
    private var _isAuthenticated = false;
    
    function initialize() {
        View.initialize();
    }

    // Load resources
    function onLayout(dc) {
        // Don't use layout, draw directly in onUpdate
    }

    // Called when view becomes visible
    function onShow() {
        // Check if authenticated with backend
        checkAuthentication();
    }

    // Update the view
    function onUpdate(dc) {
        dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
        dc.clear();
        
        var width = dc.getWidth();
        var height = dc.getHeight();
        
        // Draw app title
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            width / 2,
            height / 4,
            Gfx.FONT_LARGE,
            "AI Run Coach",
            Gfx.TEXT_JUSTIFY_CENTER
        );
        
        // Draw status
        dc.setColor(
            _isAuthenticated ? Gfx.COLOR_GREEN : Gfx.COLOR_YELLOW,
            Gfx.COLOR_TRANSPARENT
        );
        dc.drawText(
            width / 2,
            height / 2,
            Gfx.FONT_MEDIUM,
            _statusText,
            Gfx.TEXT_JUSTIFY_CENTER
        );
        
        // Draw instructions
        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            width / 2,
            height * 3 / 4,
            Gfx.FONT_SMALL,
            _isAuthenticated ? "Press START to begin" : "Connecting...",
            Gfx.TEXT_JUSTIFY_CENTER
        );
    }
    
    // Set status text from delegate
    function setStatusText(text) {
        _statusText = text;
        Ui.requestUpdate();
    }
    
    function setAuthenticated(authenticated) {
        _isAuthenticated = authenticated;
        Ui.requestUpdate();
    }
    
    private function checkAuthentication() {
        // Check if we have stored auth token
        var authToken = App.Storage.getValue("authToken");
        
        if (authToken != null && authToken.length() > 0) {
            _isAuthenticated = true;
            _statusText = "Ready to Start";
        } else {
            _isAuthenticated = false;
            _statusText = "Not Connected";
            // Trigger authentication flow
            requestAuthentication();
        }
        
        Ui.requestUpdate();
    }
    
    private function requestAuthentication() {
        // This will be handled by the AuthManager
        // For now, show message
        _statusText = "Open phone app";
    }
}

class StartDelegate extends Ui.BehaviorDelegate {
    
    function initialize() {
        BehaviorDelegate.initialize();
    }

    // Handle START button press
    function onSelect() {
        Sys.println("Start button pressed");
        
        // Check if authenticated
        var authToken = App.Storage.getValue("authToken");
        if (authToken == null || authToken.length() == 0) {
            // Show error - need to authenticate via phone
            Ui.pushView(
                new Ui.Confirmation("Connect your phone app first"),
                new ConfirmationDelegate(false),
                Ui.SLIDE_IMMEDIATE
            );
            return true;
        }
        
        // Start the run activity
        Ui.pushView(
            new RunView(),
            new RunDelegate(),
            Ui.SLIDE_IMMEDIATE
        );
        
        return true;
    }
    
    // Handle BACK button press
    function onBack() {
        // Exit app
        Sys.exit();
        return true;
    }
}

class ConfirmationDelegate extends Ui.ConfirmationDelegate {
    private var _shouldExit;
    
    function initialize(shouldExit) {
        ConfirmationDelegate.initialize();
        _shouldExit = shouldExit;
    }
    
    function onResponse(response) {
        if (_shouldExit && response == Ui.CONFIRM_YES) {
            Sys.exit();
            return true;
        }
        return false;
    }
}
