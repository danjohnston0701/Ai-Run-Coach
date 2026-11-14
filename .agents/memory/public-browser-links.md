---
name: Public email links on mobile
description: Password-reset and other emailed web links must work in third-party iPhone browsers and email webviews.
---

Public account-recovery links are browser pages, including when opened inside email apps. All website clients should receive the normal web app rather than being classified by phone browser or device.

**Why:** A real iOS user's password-reset link opened the Expo Go testing page instead of account recovery. Chrome, Firefox, Edge and email webviews can identify themselves differently from Safari.

**How to apply:** Preserve token query strings and keep API token validation intact. Test third-party iOS browser identities, not only desktop Chrome and Safari.

Expo testing is retired for this project. Do not restore Expo Go prompts, manifest delivery, Metro proxying or Expo fallback pages on the website.

**Why:** The user explicitly said, "No one will ever use the expo testing app so we can get rid it completely." It also caused real users to receive a testing page instead of account recovery.

**How to apply:** Keep development and production web serving consistent. A missing web build should return an explicit unavailable response, never an Expo page. This does not authorize removing unrelated native-app code or shared dependencies.
