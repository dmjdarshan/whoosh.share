# Whoosh.share — Setup Guide

Complete setup instructions for getting Whoosh running locally.

---

## Prerequisites

### Required

- **Modern web browser** (Chrome 90+, Firefox 88+, or Safari 16+)
- **HTTPS or localhost** (required for microphone/audio permissions)
- **Two devices** on the same WiFi network (for testing)

### Optional

- Python 3, Node.js, or PHP (for local server)
- Git (for cloning repository)

---

## Step-by-Step Setup

### 1. Get the Code

```bash
# Clone the repository
git clone https://github.com/yourusername/whoosh.share.git
cd whoosh.share

# Or download ZIP and extract
```

### 2. Verify ggwave WASM Files

**This is the most important step!** The app won't work without a compatible ggwave browser build.

This repository currently includes `lib/ggwave/ggwave.js`, a self-contained build that exposes `window.ggwave_factory` and embeds the WASM payload. If you replace it with a different upstream build, that build may also require a separate `ggwave.wasm` file.

#### Option A: Download from ggwave Demo (Easiest)

1. Visit https://wasm.ggerganov.com/
2. Open browser DevTools (F12 or Cmd+Option+I)
3. Go to **Network** tab
4. Refresh the page
5. Find and download `ggwave.js` (right-click → Save as)
6. If that build loads an external WASM file, also download `ggwave.wasm`
7. Place the file(s) in `lib/ggwave/` directory

#### Option B: Build from Source

```bash
# Clone ggwave
git clone https://github.com/ggerganov/ggwave.git
cd ggwave

# Install Emscripten (if not installed)
# Follow: https://emscripten.org/docs/getting_started/downloads.html

# Build
mkdir build-wasm && cd build-wasm
emcmake cmake ..
make

# Copy files
cp examples/ggwave-wasm/ggwave.js /path/to/whoosh.share/lib/ggwave/
cp examples/ggwave-wasm/ggwave.wasm /path/to/whoosh.share/lib/ggwave/ # only if generated separately
```

### 3. Verify File Structure

Your project should look like this:

```
whoosh.share/
├── index.html
├── styles.css
├── manifest.json
├── sw.js
├── src/
│   ├── main.js
│   ├── ui.js
│   ├── discovery.js
│   ├── connection.js
│   └── transfer.js
└── lib/
    └── ggwave/
        └── ggwave.js      ← Must exist; current build embeds WASM
```

### 4. Start Local Server

You **must** serve the app over HTTP/HTTPS (not `file://`) for microphone access.

#### Using Python (Recommended)

```bash
# Python 3
python3 -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

#### Using Node.js

```bash
# Install http-server globally (one time)
npm install -g http-server

# Run server
http-server -p 8000
```

#### Using PHP

```bash
php -S localhost:8000
```

#### Using VS Code

Install "Live Server" extension and click "Go Live" button.

### 5. Open in Browser

```
http://localhost:8000
```

**Important:** Use `localhost`, not `127.0.0.1` or your local IP, for initial testing. Some browsers have stricter permissions for non-localhost addresses.

### 6. Test on Two Devices

#### Same Computer (Quick Test)

1. Open two browser windows/tabs
2. Go to `http://localhost:8000` in both
3. Tap "Start Sending" in one window and "Ready to Receive" in the other
4. The broadcaster should appear on the listener's radar

**Note:** This tests the UI but not real audio discovery (same device can't hear itself).

#### Two Different Devices (Real Test)

1. Find your computer's local IP:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet "
   
   # Windows
   ipconfig
   ```

2. On Device 1 (computer):
   - Open `http://localhost:8000`
   - Tap "Start Sending"

3. On Device 2 (phone/tablet):
   - Connect to same WiFi
   - Open `http://YOUR_IP:8000` (e.g., `http://192.168.1.100:8000`)
   - Tap "Ready to Receive"

4. Wait 5-10 seconds for the broadcaster to appear

5. Tap the device bubble on the listener to answer the broadcast

---

## Troubleshooting

### "Microphone permission denied"

**Solution:**
- Click the 🔒 icon in browser address bar
- Allow microphone access
- Refresh the page

### "ggwave not initialized" error

**Cause:** ggwave WASM files are missing or not loading.

**Solution:**
1. Check that `lib/ggwave/ggwave.js` exists
2. Open browser DevTools → Network tab
3. Refresh page and check if files load (should be 200 OK, not 404)
4. If using a separate WASM build, verify `ggwave.wasm` also loads successfully

### Devices not discovering each other

**Possible causes:**

1. **Volume too low**
   - Turn up volume on both devices
   - Ultrasonic tones are quiet

2. **Background noise**
   - Test in a quiet room
   - Move devices closer together

3. **Hardware limitations**
   - Some devices struggle with particular frequency ranges
   - The app currently uses audible tones for reliability

4. **Incompatible ggwave build**
   - Check browser console for binding errors from `init`, `encode`, or `decode`
   - Verify the build exposes `window.ggwave_factory`

### Testing with Ultrasonic Mode

Audible tones are the default because the wave-share reference notes that ultrasonic transmission is unreliable on many devices. After the basic flow works, you can try ultrasonic tones:

In `src/discovery.js`, change the assigned protocol:

```javascript
// Find this line in loadGGWave():
this.protocol = this.ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST;

// Change to ultrasonic mode:
this.protocol = this.ggwave.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_FASTEST;
```

You may hear nothing in ultrasonic mode; if discovery stops working, switch back to audible mode.

### WebRTC connection fails

**Possible causes:**

1. **Different WiFi networks**
   - Ensure both devices are on the same network
   - Check if network has AP isolation enabled (common in public WiFi)

2. **VPN active**
   - Disable VPN on both devices

3. **Firewall blocking**
   - Temporarily disable firewall for testing
   - Check router settings

### HTTPS Required Error

Some browsers require HTTPS for microphone access even on localhost.

**Solution:** Use a tool like [ngrok](https://ngrok.com/):

```bash
# Install ngrok
# Then run:
ngrok http 8000

# Use the HTTPS URL provided (e.g., https://abc123.ngrok.io)
```

---

## Browser-Specific Notes

### Chrome (Desktop & Android)

✅ **Best support** — Primary development target

- Full Web Audio API support
- Reliable microphone access
- Good audible frequency support

### Firefox

✅ **Fully supported**

- May need to allow microphone in settings
- Slightly different audio processing, but works well

### Safari (macOS & iOS)

⚠️ **Requires user gesture**

- AudioContext must be created after user tap
- The "Start Sending" or "Ready to Receive" button serves as the required gesture
- iOS 16+ required for best compatibility
- **Needs real device testing** — simulator won't work

**iOS-specific:**
- Keep app in foreground during discovery
- Screen lock will interrupt audio
- Test with volume at 70%+ for best results

---

## Performance Tips

### For Best Transfer Speed

1. **Keep devices close** (within 10 feet)
2. **Use 5GHz WiFi** if available (faster than 2.4GHz)
3. **Close other apps** using network
4. **Keep browser tab active** (background tabs may be throttled)

### For Reliable Discovery

1. **Quiet environment** (less ambient noise)
2. **Volume at 70-80%** (not muted, not max)
3. **Devices facing each other** (speaker toward mic)
4. **Wait 10 seconds** before retrying

---

## Development Mode

### Enable Debug Logging

```javascript
// In browser console
localStorage.setItem('whoosh-debug', 'true');
location.reload();
```

### Check WebRTC Stats

Chrome: `chrome://webrtc-internals`
Firefox: `about:webrtc`

### Monitor Audio

Use browser DevTools → Console to see:
- Audio encoding/decoding events
- WebRTC connection state changes
- Transfer progress
- Error messages

---

## Next Steps

Once you have it working:

1. **Test file transfers** — Start with small files (< 1MB)
2. **Try different devices** — Phone ↔ laptop, tablet ↔ phone
3. **Test edge cases** — Connection drops, cancelled transfers
4. **Generate PWA icons** — For installable app experience
5. **Deploy to production** — Host on GitHub Pages, Netlify, etc.

---

## Getting Help

- **Check browser console** for error messages
- **Review Architecture.md** for technical details
- **Open an issue** on GitHub with:
  - Browser version
  - Device type
  - Error messages
  - Steps to reproduce

---

## Production Deployment

### Hosting Options

**Static hosting (recommended):**
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

**Requirements:**
- HTTPS (mandatory for microphone access)
- Serve all files as static assets
- No server-side code needed

### Deployment Checklist

- [ ] ggwave WASM files included
- [ ] Service Worker registered
- [ ] PWA icons generated (192x192, 512x512)
- [ ] HTTPS enabled
- [ ] Tested on target devices
- [ ] Error tracking set up (optional)

---

**Ready to share files at the speed of sound! 🚀**
