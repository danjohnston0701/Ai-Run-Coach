# 🎨 Garmin Watch Icon - Quick Reference

## Icon Files

```
📦 garmin-companion-app/resources/drawables/
├── app_icon_128.png              ← 24-bit color (main icon)
├── device_64_color_128.png       ← 64 colors (device compatible)
├── drawables.xml                 ← Resource definitions
└── launcher_icon.png             ← Old version (can delete)
```

## Configuration Files

### drawables.xml
```xml
<bitmap id="LauncherIcon" filename="app_icon_128.png" />
<bitmap id="Device64Color" filename="device_64_color_128.png" />
<bitmap id="Device24BitColor" filename="app_icon_128.png" />
```

### manifest.xml
```xml
<iq:application launcherIcon="@Drawables.LauncherIcon" ...>
```

## Icon Specifications

| Aspect | 24-bit Color | 64 Color |
|--------|--------------|----------|
| File | `app_icon_128.png` | `device_64_color_128.png` |
| Size | 128 × 128 px | 128 × 128 px |
| Colors | Full RGB | ~64 colors |
| Gradients | Yes | Minimize |
| Details | Full detail | Simplified |
| Purpose | Main icon | Device fallback |

## Rebuild & Test

```bash
# 1. Rebuild IQ file
cd /Users/danieljohnston/AndroidStudioProjects/AiRunCoach
bash build-iq-automated.sh

# 2. Test in simulator
connectiq
# File → Load Device → Select watch
# File → Load App → Select bin/AiRunCoach_new.iq

# 3. Verify icon displays on home screen
```

## Icon Locations on Watch

- **Home Screen**: Icon appears in app grid
- **App Drawer**: Icon appears when browsing apps
- **Store Listing**: Icon shown in Garmin Connect IQ Store

## Why Bitmap Resources?

✅ **Better Than Code Generation**:
- Professional quality
- Better performance
- Gradients & transparency
- Follows Garmin best practices
- Easy to optimize
- No CPU overhead

❌ **Not Code Generation**:
- Hard to get right
- Slow rendering
- Limited graphics
- Not optimized

## Common Issues & Fixes

| Problem | Solution |
|---------|----------|
| Icon doesn't show | Rebuild with `build-iq-automated.sh` |
| Icon is pixelated | Ensure PNG is exactly 128×128 |
| Icon colors wrong | Use `app_icon_128.png` (24-bit) for main |
| Device compatibility issues | Include both icons in drawables.xml |

## Files Status

| File | Status | Action |
|------|--------|--------|
| `app_icon_128.png` | ✅ Ready | Use as main icon |
| `device_64_color_128.png` | ✅ Ready | Use for device fallback |
| `drawables.xml` | ✅ Updated | All icons referenced |
| `manifest.xml` | ✅ Correct | Points to LauncherIcon |
| `launcher_icon.png` | ⏳ Old | Can delete (saves 68 KB) |

## Ready to Build! 🚀

Everything is configured. Just run:

```bash
bash build-iq-automated.sh
```

Then test the icon in the simulator or on your watch.

