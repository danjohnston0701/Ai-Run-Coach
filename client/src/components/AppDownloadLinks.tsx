export function AppDownloadLinks() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <a
        href="https://apps.apple.com/nz/app/ai-run-coach/id6762181649"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="link-download-ios"
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-bold text-background hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        Download on the App Store
      </a>
      <a
        href="https://play.google.com/store/apps/details?id=live.airuncoach.airuncoach"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="link-download-android"
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-primary px-6 py-3 text-sm font-bold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        Get it on Google Play
      </a>
    </div>
  );
}
