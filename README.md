# Whoosh.share

> Serverless, peer-to-peer file transfer between devices on the same network using sound-based discovery.

**No cloud. No installation. Just open the page on both devices and share.**

---

## 🎯 What is Whoosh?

Whoosh is a web app that lets you transfer files between devices on the same WiFi network without any server in between. It uses **sound** to discover nearby devices and establish a direct peer-to-peer connection via WebRTC.

### Key Features

- 🔊 **Sound-based discovery** — No server needed for device pairing
- 🚀 **Fast transfers** — Direct peer-to-peer at full WiFi speed (80-150 Mbps)
- 🔒 **Private** — Files never touch any server, everything stays local
- 📱 **Cross-platform** — Works on phones, tablets, and computers
- 🌐 **Pure web** — No app installation required
- ✨ **Beautiful UI** — iOS-inspired design that feels native

---

## 🏗️ Architecture

Whoosh combines three technologies:

1. **ggwave (WASM)** — Encodes/decodes data as audio tones for device discovery
2. **WebRTC DataChannel** — Establishes direct peer-to-peer connection for file transfer
3. **Web Audio API** — Plays and captures audio for the discovery handshake

See [Architecture.md](Architecture.md) for detailed technical documentation.

---

## 🚀 Quick Start

### Prerequisites

- A modern web browser (Chrome, Firefox, or Safari 16+)
- HTTPS or localhost (required for microphone access)
- Two devices on the same WiFi network

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/whoosh.share.git
   cd whoosh.share
   ```

2. **Verify ggwave WASM files:**
   
   The app requires a ggwave browser build. This repository includes a self-contained `lib/ggwave/ggwave.js`; if you replace it, download a compatible build from the official repository:
   
   ```bash
   # Create lib directory
   mkdir -p lib/ggwave
   
   # Download ggwave.js from:
   # https://github.com/ggerganov/ggwave/tree/master/examples/ggwave-wasm
   
   # Place it in lib/ggwave/
   ```
   
   Or build from source:
   ```bash
   git clone https://github.com/ggerganov/ggwave.git
   cd ggwave
   # Follow build instructions for WASM
   # Copy ggwave.js to whoosh.share/lib/ggwave/
   ```

3. **Serve the app:**
   
   You need HTTPS or localhost for microphone permissions. Use any static file server:
   
   ```bash
   # Using Python
   python3 -m http.server 8000
   
   # Using Node.js (http-server)
   npx http-server -p 8000
   
   # Using PHP
   php -S localhost:8000
   ```

4. **Open in browser:**
   ```
   http://localhost:8000
   ```

5. **Test with two devices:**
   - Open the same URL on two devices on the same WiFi
   - Tap "Start Sending" on the sending device
   - Tap "Ready to Receive" on the receiving device
   - When the sender appears on the receiver, tap it to send the answer tone
   - After the connection opens on the sender, choose a file to send

---

## 📁 Project Structure

```
whoosh.share/
├── index.html              # App shell
├── styles.css              # iOS-inspired design system
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline support)
├── src/
│   ├── main.js             # Entry point & orchestration
│   ├── ui.js               # UI state management
│   ├── discovery.js        # ggwave integration (audio discovery)
│   ├── connection.js       # WebRTC connection manager
│   └── transfer.js         # File chunking & transfer
├── lib/
│   └── ggwave/
│       └── ggwave.js       # ggwave WASM wrapper, current copy embeds WASM
├── Architecture.md         # Detailed technical documentation
└── README.md               # This file
```

---

## ⚙️ Integrating ggwave WASM

The current implementation loads the bundled `lib/ggwave/ggwave.js` build directly. This build exposes `window.ggwave_factory`, embeds the WASM payload, and uses the current ggwave API:

- `const ggwave = await window.ggwave_factory()`
- `const params = ggwave.getDefaultParameters()`
- `const instance = ggwave.init(params)`
- `ggwave.encode(instance, payload, protocol, volume)`
- `ggwave.decode(instance, samples)`

If you replace `ggwave.js` with a different upstream build, verify whether that build expects an external `ggwave.wasm` file and update `src/discovery.js` only if its API differs.

### Step 1: Download ggwave Files

Get a compatible ggwave WASM build:

- **Official repo:** https://github.com/ggerganov/ggwave
- **WASM example:** https://github.com/ggerganov/ggwave/tree/master/examples/ggwave-wasm
- **Pre-built demo:** https://wasm.ggerganov.com/ (inspect network tab for files)

You need either:
- A self-contained `ggwave.js` like the current bundled file
- Or `ggwave.js` plus `ggwave.wasm`, if your chosen build loads WASM separately

### Step 2: Place Files

```bash
lib/ggwave/
└── ggwave.js
```

### Step 3: Test

1. Open the app on two devices
2. Tap "Start Sending" on the sender and "Ready to Receive" on the receiver
3. You should hear repeated short tones from the sender while discovery is active
4. The sender should appear on the receiver within 5-10 seconds; tap it to respond with an answer tone

---

## 🧪 Testing

### Browser Compatibility

| Browser | Discovery | Transfer | Notes |
|---------|-----------|----------|-------|
| Chrome (Desktop) | ✅ | ✅ | Primary target |
| Chrome (Android) | ✅ | ✅ | Primary target |
| Firefox | ✅ | ✅ | Fully supported |
| Safari (macOS) | ⚠️ | ✅ | Requires user gesture for audio |
| Safari (iOS 16+) | ⚠️ | ✅ | Requires user gesture, needs testing |

### Testing Checklist

- [ ] Two devices discover each other via sound
- [ ] WebRTC connection establishes successfully
- [ ] Small file (< 1MB) transfers completely
- [ ] Large file (> 100MB) transfers with progress
- [ ] Transfer can be cancelled mid-flight
- [ ] Connection survives brief network interruption
- [ ] Works on different device types (phone ↔ laptop)
- [ ] Works with screen locked (wake lock active)
- [ ] Microphone permission handled gracefully
- [ ] Error messages are user-friendly

### Debug Mode

Enable verbose logging:

```javascript
// In browser console
localStorage.setItem('whoosh-debug', 'true');
location.reload();
```

Check WebRTC stats:
```
chrome://webrtc-internals
```

---

## 🎨 Design Philosophy

Whoosh should feel like it belongs on your phone next to AirDrop. The UI is inspired by iOS design language:

- **Clean & minimal** — No clutter, no settings panels
- **Generous spacing** — 8px grid system
- **Smooth animations** — Spring curves, no hard cuts
- **Human language** — No technical jargon in UI
- **Calm colors** — iOS system colors, soft shadows

See [Architecture.md](Architecture.md) for detailed design specifications.

---

## 🔧 Development

### No Build Step Required

Whoosh uses vanilla JavaScript with ES modules. No npm, no webpack, no build process.

Just edit the files and refresh the browser.

### Adding Features

The codebase is modular:

- **UI changes** → `src/ui.js` + `styles.css`
- **Discovery logic** → `src/discovery.js`
- **Connection logic** → `src/connection.js`
- **Transfer logic** → `src/transfer.js`
- **Orchestration** → `src/main.js`

### Code Style

- Use ES6+ features (async/await, arrow functions, etc.)
- Event-driven architecture (emit/on pattern)
- Human-readable error messages
- Extensive console logging for debugging

---

## 🚧 Known Limitations

### Current Implementation

- **ggwave API dependent** — Replacing the bundled ggwave build may require adapting `src/discovery.js`
- **Single file only** — No multi-file queue (MVP limitation)
- **No resume** — Transfer must complete in one session
- **No encryption** — Files are sent in plaintext over local network (WebRTC is encrypted by default with DTLS)

### Browser Limitations

- **iOS Safari** — Requires user tap before audio (handled by the Start Sending/Ready to Receive buttons)
- **Background tabs** — Audio may be throttled, keep tab active
- **Ultrasonic support** — Some devices can't produce/capture 18-22kHz frequencies

### Network Requirements

- **Same WiFi** — Devices must be on the same local network
- **No VPN** — VPNs may block peer-to-peer connections
- **No firewall** — Strict firewalls may block WebRTC

---

## 📚 References

### Inspirations

- [Snapdrop](https://snapdrop.net) — WebRTC file sharing with server-based discovery
- [PairDrop](https://github.com/schlagmichdoch/PairDrop) — Snapdrop fork with improvements
- [wave-share](https://github.com/ggerganov/wave-share) — WebRTC handshake over audio (proof of concept)

### Technologies

- [ggwave](https://github.com/ggerganov/ggwave) — FSK audio data transmission
- [WebRTC](https://webrtc.org/) — Peer-to-peer communication
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — Audio processing

---

## 🤝 Contributing

Contributions welcome! Areas that need work:

1. **ggwave integration** — Test and harden audio discovery across device/browser pairs
2. **iOS testing** — Validate audio discovery on real iOS devices
3. **Error handling** — More robust error recovery
4. **Multi-file support** — Queue multiple files
5. **Transfer resume** — Handle connection drops gracefully
6. **Dark mode** — Add dark color scheme
7. **Accessibility** — ARIA labels, keyboard navigation

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file.

---

## 🙏 Acknowledgments

- **Georgi Gerganov** for [ggwave](https://github.com/ggerganov/ggwave) — the core technology that makes serverless discovery possible
- **Robin Linus** for [Snapdrop](https://github.com/RobinLinus/snapdrop) — inspiration for the UX
- **Apple** for AirDrop — the gold standard for local file sharing

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/whoosh.share/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/whoosh.share/discussions)

---

**Made with ❤️ for a more private, decentralized web.**
