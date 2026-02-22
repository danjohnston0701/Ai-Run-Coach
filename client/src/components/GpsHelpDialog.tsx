import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Smartphone, Settings, ChevronRight, ExternalLink } from "lucide-react";

interface GpsHelpDialogProps {
  open: boolean;
  onClose: () => void;
  currentAccuracy?: number;
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

export function GpsHelpDialog({ open, onClose, currentAccuracy }: GpsHelpDialogProps) {
  const isAndroidDevice = isAndroid();
  const isIOSDevice = isIOS();

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="gps-help-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Improve GPS Accuracy
          </DialogTitle>
          <DialogDescription>
            {currentAccuracy && currentAccuracy > 100 
              ? `Your current GPS accuracy is ${Math.round(currentAccuracy)}m. For best results during your run, we need accuracy under 30m.`
              : "Enable precise location for accurate distance and pace tracking."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {isAndroidDevice && (
            <>
              <div className="bg-card/50 border border-border/50 rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Android (Chrome)
                </h3>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                    <span>Open your phone's <strong className="text-foreground">Settings</strong> app</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                    <span>Tap <strong className="text-foreground">Apps</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
                    <span>Find and tap <strong className="text-foreground">Chrome</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">4</span>
                    <span>Tap <strong className="text-foreground">Permissions</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">5</span>
                    <span>Tap <strong className="text-foreground">Location</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">6</span>
                    <span>Enable <strong className="text-foreground">"Use precise location"</strong> toggle</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">7</span>
                    <span>Return to this app and refresh the page</span>
                  </li>
                </ol>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <p className="text-xs text-yellow-200">
                  <strong>Path:</strong> Settings → Apps → Chrome → Permissions → Location → Enable "Use precise location"
                </p>
              </div>
            </>
          )}

          {isIOSDevice && (
            <div className="bg-card/50 border border-border/50 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                iPhone / iPad
              </h3>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                  <span>Open <strong className="text-foreground">Settings</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                  <span>Tap <strong className="text-foreground">Privacy & Security</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
                  <span>Tap <strong className="text-foreground">Location Services</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">4</span>
                  <span>Scroll down and tap <strong className="text-foreground">Safari Websites</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">5</span>
                  <span>Enable <strong className="text-foreground">"Precise Location"</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">6</span>
                  <span>Return to this app and refresh</span>
                </li>
              </ol>
            </div>
          )}

          {!isAndroidDevice && !isIOSDevice && (
            <div className="bg-card/50 border border-border/50 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                General Instructions
              </h3>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                  <span>Open your device's <strong className="text-foreground">Settings</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                  <span>Find <strong className="text-foreground">Location</strong> or <strong className="text-foreground">Privacy</strong> settings</span>
                </li>
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
                  <span>Find your browser (Chrome, Safari, etc.)</span>
                </li>
                <li className="flex gap-2">
                  <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">4</span>
                  <span>Enable <strong className="text-foreground">"Precise Location"</strong> or <strong className="text-foreground">"High Accuracy"</strong></span>
                </li>
              </ol>
            </div>
          )}

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-xs text-blue-200">
              <strong>Tip:</strong> After changing settings, close and reopen this app, or pull down to refresh the page.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={onClose}
            data-testid="gps-help-close"
          >
            Close
          </Button>
          <Button 
            className="flex-1"
            onClick={() => {
              onClose();
              window.location.reload();
            }}
            data-testid="gps-help-refresh"
          >
            Refresh Page
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
