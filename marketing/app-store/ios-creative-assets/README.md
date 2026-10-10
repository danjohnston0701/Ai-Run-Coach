# iOS App Store creative assets (iOS 27) + iPhone Duo screenshots

Final files are in `out/`. Re-render with `./render.sh` (source `assets.html`); `./render.sh --guides`
writes `out-guides/` with Apple's art-safe-area boxes drawn on, to check placement.

| File | Placement | Spec (Apple) |
|---|---|---|
| `product-page-header-3840x1646.png` | Product page header (main) | 21:9, 3840×1646, JPEG/PNG, no alpha |
| `product-page-header-group-runs-3840x1646.png` | Header **alternative** for product page optimisation (tests "Run together" against the brand header) | same |
| `search-results-3840x2560.png` | Search results asset | 3:2, 1920×1280 – 3840×2560, JPEG/PNG |
| `universal-5244x2950.png` | Universal creative asset (header **and** search, "Use header asset in search results") | 16:9, 5244×2950, PNG |
| `product-page-header-video-3840x1646.mp4` | Product page header **video** — 12 s seamless loop, real iPhone run recording with the live coach message | 21:9, 3840×1646, 30 fps, H.264, no audio (5–30 s allowed) |
| `iphone-6.9-1…4-1320x2868.png` | **Upload these now** — iPhone 6.9" (Dynamic Island, large) | 1320×2868 portrait |
| `iphone-6.3-1…4-1206x2622.png` | **Upload these now** — iPhone 6.3" (Dynamic Island, medium — the required size) | 1206×2622 portrait |
| `iphone-duo-outer-1…4-1398x2034.png` | iPhone Duo screenshots, outer display (hold until Duo uploads open) | 1398×2034 portrait |
| `iphone-duo-inner-1…4-2007x2853.png` | iPhone Duo screenshots, inner display | 2007×2853 portrait |

Use **either** the universal asset **or** the dedicated header + search pair. The dedicated pair
follows Apple's split better: the header leads with the brand ("first-time visitor"), and the
search asset shows the real run screen ("state the obvious / show the firsthand experience").

## Safe areas (measured from Apple's official PSD templates)

All copy, the icon and the key UI sit inside these; only the background and decoration bleed out.

| Canvas | Art safe area |
|---|---|
| Header 3840×1646 | x 1097–2742, y 493–1153 |
| Search 3840×2560 | x 836–3003, y 765–1794 |
| Universal 5244×2950 | x 1921–3322, y 660–1621 (sits above centre) |

## What's real

Every phone and watch screen is a genuine capture of the iOS app: iPhone 17 Pro simulator recordings
(1206×2622) and the Apple Watch app (416×496) from the deterministic demo 5 km run used by the
how-to videos (`marketing/how-to-videos/edit/public/clips`). Only the headlines, device frames and
backgrounds are added. The coach message reads "Well, Daniel, …" because the demo run used the
developer's account.

## Notes

- Creative assets show on **iOS/iPadOS 27 and later**. Upload them in App Store Connect › Asset
  Library (standalone submission) or with a version; they're reviewed against the latest version.
- Header video source: `marketing/how-to-videos/edit/src/AppStoreHeader.tsx`
  (`npm run render:app-store-header`), then re-encode for App Store Connect:
  `ffmpeg -i out/app-store-header.mp4 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -color_range tv -profile:v high -level 5.1 -r 30 -an -movflags +faststart product-page-header-video-3840x1646.mp4`.
  Loop is seamless (background and rings cycle on the loop period; the phone screen dips through the seam).
- **iPhone Duo:** sizes match Apple's screenshot specification exactly, but App Store Connect
  doesn't accept Duo uploads yet (support is due later in 2026) — uploading them into the standard
  iPhone slot fails with "File dimensions are invalid" because that slot only allows its own sizes.
  Use the 6.9" / 6.3" files now and add the Duo set when the Duo slot appears. There's no Duo simulator in
  Xcode 26.6, so these frame real iPhone screens rather than the Duo's own inner-display layout.
  Re-capture natively once an iOS 27 SDK with a Duo simulator is available.
- Duo screenshots don't replace the required 6.9"/6.3" iPhone sets; they're an addition.
