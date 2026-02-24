function onUpdate(dc) {

    dc.setColor(Gfx.COLOR_BLACK, Gfx.COLOR_BLACK);
    dc.clear();
    
    var width  = dc.getWidth();
    var height = dc.getHeight();
    var centerX = width / 2;
    var centerY = height / 2;

    // --------------------------------------------------
    // Subtle Outer Ring Accent (Always Visible)
    // --------------------------------------------------
    dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
    dc.drawCircle(
        centerX,
        centerY,
        (width / 2) - 4
    );

    // --------------------------------------------------
    // Title
    // --------------------------------------------------
    dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
    dc.drawText(
        centerX,
        height * 0.22,
        Gfx.FONT_LARGE,
        "AI RUN COACH",
        Gfx.TEXT_JUSTIFY_CENTER
    );

    // Thin divider
    dc.setColor(Gfx.COLOR_DK_GRAY, Gfx.COLOR_TRANSPARENT);
    dc.drawLine(
        width * 0.2,
        height * 0.30,
        width * 0.8,
        height * 0.30
    );

    // --------------------------------------------------
    // Center Content
    // --------------------------------------------------
    if (_isAuthenticated) {

        // Subtle pulse ring inside
        var pulseRadius = 40 + (_pulseScale / 4);
        dc.setColor(0x00CFFF, Gfx.COLOR_TRANSPARENT);
        dc.drawCircle(centerX, centerY, pulseRadius);

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            centerX,
            centerY,
            Gfx.FONT_LARGE,
            "Ready",
            Gfx.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            centerX,
            height * 0.72,
            Gfx.FONT_SMALL,
            "Press START",
            Gfx.TEXT_JUSTIFY_CENTER
        );

    } else {

        var dots = "";
        for (var i = 0; i < _dotCount; i++) {
            dots += ".";
        }

        dc.setColor(Gfx.COLOR_LT_GRAY, Gfx.COLOR_TRANSPARENT);
        dc.drawText(
            centerX,
            centerY,
            Gfx.FONT_MEDIUM,
            "Waiting for phone" + dots,
            Gfx.TEXT_JUSTIFY_CENTER
        );

        dc.drawText(
            centerX,
            height * 0.72,
            Gfx.FONT_SMALL,
            "Open AI Run Coach",
            Gfx.TEXT_JUSTIFY_CENTER
        );
    }
}