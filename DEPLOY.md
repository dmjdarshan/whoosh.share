# Deploying Whoosh.share to GitHub Pages

## Quick Deploy

```bash
# 1. Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - Whoosh.share"

# 2. Create GitHub repo and push
git remote add origin https://github.com/YOUR_USERNAME/whoosh-share.git
git branch -M main
git push -u origin main

# 3. Enable GitHub Pages
# Go to: Settings → Pages → Source: main branch → Save
```

Your app will be live at: `https://YOUR_USERNAME.github.io/whoosh-share/`

## Important Notes

### ggwave Library
The bundled `lib/ggwave/ggwave.js` build exposes `window.ggwave_factory` and is initialized through `getDefaultParameters()` plus `init(params)`. If you replace this file with another upstream build, smoke-test discovery before deploying because ggwave browser builds can expose different binding shapes.

### Service Worker
Service worker caching is currently disabled (`CACHING_DISABLED = true` in `sw.js`) to avoid cache issues during development. Re-enable it for production by setting it to `false`.

### Missing Files
- `icon-192.png` and `icon-512.png` - Create these for PWA installation
- Use any 192x192 and 512x512 PNG images, or generate at https://www.favicon-generator.org/

## Testing After Deployment

1. Open the GitHub Pages URL on two devices
2. Both devices should be on the same WiFi network
3. Click "Start Sending" on the sender and "Ready to Receive" on the receiver
4. Confirm the receiver decodes the broadcast without ggwave binding errors

## File Structure

```
whoosh-share/
├── index.html              # Main app
├── styles.css              # iOS-inspired UI
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── src/
│   ├── main.js            # App initialization
│   ├── ui.js              # UI management
│   ├── discovery.js       # Audio discovery
│   ├── connection.js      # WebRTC connection
│   └── transfer.js        # File transfer
└── lib/ggwave/
    └── ggwave.js          # Audio encoding library
```

## Known Issues

1. **Device audio support**: Some speakers/microphones do not reliably handle ultrasonic frequencies
2. **Browser caching**: Very aggressive - may need hard refresh after updates
3. **Icons**: Placeholder files need to be replaced with actual PNGs

## Next Steps

1. Deploy to GitHub Pages
2. Test on fresh browser (no cache)
3. Test discovery on target devices with browser dev tools open
4. Add proper icon files
5. Re-enable service worker caching
