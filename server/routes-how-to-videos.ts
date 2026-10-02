/**
 * Watch + phone "how to" demo videos, played in-app from the Connected Devices tiles.
 *
 *   GET /api/how-to-videos?platform=ios|android
 *     → { videos: [{ id, watch, phone, title, subtitle, url, posterUrl, durationSec }] }
 *
 * The MP4s (720p, made in marketing/how-to-videos) are served as static files from
 * assets/videos/how-to/ (express.static at /assets, which handles the Range requests AVPlayer and
 * ExoPlayer stream with). Only *published* videos are listed, so a tile shows its "Watch the
 * demo" link only once its video is live — a video can be held back (e.g. until the watch-app
 * version it shows is in the store) without an app release:
 *   - defaults: the `published` flags below;
 *   - override: HOW_TO_VIDEOS_PUBLISHED="garmin-iphone,applewatch-iphone" (comma list of ids;
 *     "none" hides all) — a Replit secret, takes effect on restart.
 * Public (no auth): the onboarding tour shows the same tiles to guests.
 */
import type { Express, Request, Response } from "express";

type HowToVideo = {
  id: string;
  watch: "garmin" | "apple_watch" | "wear_os";
  phone: "ios" | "android";
  title: string;
  subtitle: string;
  durationSec: number;
  published: boolean;
};

const VIDEOS: HowToVideo[] = [
  {
    id: "garmin-iphone",
    watch: "garmin",
    phone: "ios",
    title: "Garmin + iPhone",
    subtitle: "Install, pair, and run with your coach",
    durationSec: 103,
    // Footage shows the Garmin watch app's 3.4.10 screens plus the red HR ring and prompt-free
    // FINISHED screen (2026-10-03) — publish once that build is live in Connect IQ.
    published: false,
  },
  {
    id: "garmin-android",
    watch: "garmin",
    phone: "android",
    title: "Garmin + Android",
    subtitle: "Install, link, and run with your coach",
    durationSec: 97,
    // Same Garmin watch footage as garmin-iphone — same publishing condition.
    published: false,
  },
  {
    id: "applewatch-iphone",
    watch: "apple_watch",
    phone: "ios",
    title: "Apple Watch + iPhone",
    subtitle: "Set up, prepare, and run with your coach",
    durationSec: 96,
    published: true,
  },
  {
    id: "galaxywatch-android",
    watch: "wear_os",
    phone: "android",
    title: "Galaxy Watch + Android",
    subtitle: "Install, prepare, and run with your coach",
    durationSec: 98,
    // Shows the Wear OS app's on-screen START / RESUME / FINISH controls (2026-10-03) —
    // publish once that build is live on Google Play.
    published: false,
  },
];

function publishedIds(): Set<string> {
  const env = process.env.HOW_TO_VIDEOS_PUBLISHED?.trim();
  if (env) {
    return new Set(env.split(",").map((s) => s.trim()).filter((s) => s && s !== "none"));
  }
  return new Set(VIDEOS.filter((v) => v.published).map((v) => v.id));
}

export function registerHowToVideoRoutes(app: Express) {
  app.get("/api/how-to-videos", (req: Request, res: Response) => {
    const platform = String(req.query.platform ?? "").toLowerCase();
    // No `trust proxy` here, so req.protocol is "http" behind Replit's proxy — and the apps'
    // players refuse cleartext. Same SITE_URL convention as the OAuth redirects in routes.ts.
    const origin = (process.env.SITE_URL || "https://airuncoach.live").replace(/\/$/, "");
    const live = publishedIds();
    const videos = VIDEOS.filter((v) => live.has(v.id))
      .filter((v) => (platform === "ios" || platform === "android" ? v.phone === platform : true))
      .map(({ published: _p, ...v }) => ({
        ...v,
        url: `${origin}/assets/videos/how-to/${v.id}.mp4`,
        posterUrl: `${origin}/assets/videos/how-to/${v.id}.jpg`,
      }));
    res.set("Cache-Control", "public, max-age=300");
    res.json({ videos });
  });
}
