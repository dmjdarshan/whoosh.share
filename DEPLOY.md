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

### ggwave Library Issue
The ggwave library currently has an API mismatch. The error "Cannot pass non-string to std::string" indicates the library expects different parameter types than documented.

**Temporary workaround:** The app UI and WebRTC logic are complete and working. The audio discovery feature needs the correct ggwave API parameters to be determined through testing.

### Service Worker
Service worker caching is currently disabled (`CACHING_DISABLED = true` in `sw.js`) to avoid cache issues during development. Re-enable it for production by setting it to `false`.

### Missing Files
- `icon-192.png` and `icon-512.png` - Create these for PWA installation
- Use any 192x192 and 512x512 PNG images, or generate at https://www.favicon-generator.org/

## Testing After Deployment

1. Open the GitHub Pages URL on two devices
2. Both devices should be on the same WiFi network
3. Click "Start Discovery" on both
4. The audio discovery will work once the ggwave API is corrected

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
│   ├── discovery.js       # Audio discovery (needs ggwave fix)
│   ├── connection.js      # WebRTC connection
│   └── transfer.js        # File transfer
└── lib/ggwave/
    └── ggwave.js          # Audio encoding library
```

## Known Issues

1. **ggwave API**: Parameters need adjustment for encode/decode functions
2. **Browser caching**: Very aggressive - may need hard refresh after updates
3. **Icons**: Placeholder files need to be replaced with actual PNGs

## Next Steps

1. Deploy to GitHub Pages
2. Test on fresh browser (no cache)
3. Debug ggwave API with browser dev tools
4. Add proper icon files
5. Re-enable service worker caching