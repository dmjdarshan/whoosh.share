# Whoosh.share — Architecture

> Serverless, peer-to-peer file transfer between devices on the same network.
> No cloud. No installation. Just open the page on both devices and share.

---

## The Core Idea

Two devices open the same webpage. They discover each other using **sound** — a tone plays through one device's speaker, the other device's mic picks it up and decodes it. A direct WebRTC connection is established. Files transfer peer-to-peer at full local Wi-Fi speed. Nothing leaves the local network.

---

## Inspirations

| Project | What we learned from it | Link |
|---|---|---|
| **Snapdrop** | Device discovery UX, grouping devices by network, WebRTC for LAN file transfer | [snapdrop.net](https://snapdrop.net) / [github](https://github.com/RobinLinus/snapdrop) |
| **PairDrop** | Snapdrop fork with improvements — room codes, persistent connections | [github](https://github.com/schlagmichdoch/PairDrop) |
| **ggwave** | FSK audio encoding/decoding library, WASM build for browsers, the core of our discovery mechanism | [github](https://github.com/ggerganov/ggwave) |
| **wave-share** | Proof of concept: full WebRTC handshake over audio tones. Validates our approach entirely | [github](https://github.com/ggerganov/wave-share) / [demo](https://ggerganov.github.io/wave-share) |

---

## Why No Server

Every "serverless" LAN tool still has a process outside the browser:

- AirDrop → OS daemon (`awdd`) with AWDL + BLE advertising
- Snapdrop → WebSocket server groups devices by IP
- mDNS tools → native process with raw UDP socket access

The browser sandbox blocks UDP broadcast, mDNS multicast, BLE advertising, and raw sockets — everything needed for auto-discovery.

**Our solution:** Use the Web Audio API (available in all modern browsers) to transmit the WebRTC handshake as sound. The browser *can* play audio and capture mic input. This is the only discovery mechanism that works cross-platform in a pure browser with no server.

---

## Architecture Overview

```
Device A (Sender)                        Device B (Receiver)
─────────────────                        ────────────────────

1. Sender taps "Start Sending"; receiver taps "Ready to Receive"
2. Sender creates WebRTC offer
3. Sender repeatedly encodes offer via ggwave → audio tones
4. Receiver decodes offer and taps sender to accept
5. Play tones through speaker
                          ────────────►  6. Mic captures tones
                                         7. ggwave decodes → SDP offer
                                         8. Create WebRTC answer
                                         9. Encode answer → audio tones
                                         10. Play tones through speaker
11. Mic captures tones   ◄────────────
12. ggwave decodes → SDP answer
13. Apply answer → WebRTC connected
                          ◄────────────► 14. DataChannel open
15. Chunk file → send over DataChannel
                          ────────────►  16. Receive chunks → reassemble → download
```

---

## Tech Stack

### Discovery — ggwave (WASM)
- Library: [ggwave](https://github.com/ggerganov/ggwave)
- Encodes arbitrary bytes into FSK audio tones
- Decodes tones back to bytes from mic input
- WASM build available — runs in browser at native speed
- Includes Reed-Solomon error correction for ambient noise resilience
- Audible mode for the MVP path; ultrasonic mode can be added later as a preference with fallback
- The WebRTC SDP payload is ~500 bytes — transmits in ~5 seconds

### File Transfer — WebRTC DataChannel
- Pure browser API, no library needed
- Establishes direct peer-to-peer connection between devices
- Uses SCTP over DTLS — low overhead, UDP-based
- Expected throughput on home Wi-Fi: **80–150 Mbps**
- No data routes through any server after handshake

### File Chunking
- `file.slice()` to split file into chunks
- Chunk size: **512KB** (tuned for throughput — larger than Snapdrop's 64KB)
- Track sent/received chunks for resumption on connection drop
- SHA-256 checksum on full file for integrity verification (optional, post-MVP)

### PWA Shell
- Service Worker for offline app shell
- Installable on home screen (Android + desktop Chrome)
- Web App Manifest
- No backend — static files only, host on any CDN or your own domain

---

## File Structure

```
whoosh-share/
├── index.html              # App shell
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline shell only)
├── src/
│   ├── main.js             # Entry point
│   ├── discovery.js        # ggwave integration — sound encode/decode
│   ├── connection.js       # WebRTC setup — offer, answer, ICE
│   ├── transfer.js         # File chunking, sending, receiving, progress
│   └── ui.js               # Device list, file picker, progress UI
├── lib/
│   └── ggwave/
│       ├── ggwave.js       # ggwave JS wrapper
│       └── ggwave.wasm     # ggwave WASM binary
└── ARCHITECTURE.md
```

---

## Connection Flow (Detailed)

### 1. Discovery Phase (via sound, ~5-10 seconds)

```javascript
// Sender side
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
await waitForICEGathering()

const payload = JSON.stringify({
  sdp: pc.localDescription.sdp,
  type: pc.localDescription.type
})

// Encode and play
ggwave.encode(payload, GGWave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST)
```

```javascript
// Receiver side — mic always listening after "Ready to Receive" tap
ggwave.onRxData = async (data) => {
  const offer = JSON.parse(data)
  await pc.setRemoteDescription(offer)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  ggwave.encode(JSON.stringify(answer), GGWave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST)
}
```

### 2. Transfer Phase (via WebRTC DataChannel)

```javascript
// Sender
const CHUNK_SIZE = 512 * 1024 // 512KB
const buffer = await file.arrayBuffer()

dc.send(JSON.stringify({ name: file.name, size: file.size, type: file.type }))

for (let offset = 0; offset < buffer.byteLength; offset += CHUNK_SIZE) {
  // Respect bufferedAmountLowThreshold to avoid overflow
  if (dc.bufferedAmount > CHUNK_SIZE * 4) {
    await waitForBufferDrain()
  }
  dc.send(buffer.slice(offset, offset + CHUNK_SIZE))
}
```

---

## Browser Support

| Browser | Discovery (Sound) | Transfer (WebRTC) | Notes |
|---|---|---|---|
| Chrome Android | ✅ | ✅ | Primary target |
| Chrome Desktop | ✅ | ✅ | Primary target |
| Safari iOS 16+ | ⚠️ Needs testing | ✅ | Requires user gesture before audio (tap Start Sending or Ready to Receive) |
| Safari macOS | ⚠️ Needs testing | ✅ | Same as iOS |
| Firefox | ✅ | ✅ | |

**iOS note:** Safari suspends AudioContext until a user gesture. The Start Sending or Ready to Receive button tap serves as that gesture. This should unblock iOS — wave-share's iOS issues were reported in 2019 on older Safari. Modern iOS Safari (16+) has significantly improved Web Audio support. Needs real device testing.

---

## What Never Touches a Server

- File bytes — always peer-to-peer via WebRTC DataChannel
- Local IP addresses of devices
- File names, sizes, types
- Any part of the WebRTC handshake — transmitted via sound, not network

**What does touch your domain:**
- The static HTML/JS/WASM files (loaded once on first visit, then cached by Service Worker)
- Nothing else, ever

---

## UI & UX Design

### Design Philosophy

Whoosh should feel like it belongs on your phone next to AirDrop. Not a developer tool, not a utility with settings panels — a consumer app that feels calm, considered, and almost invisible. The interface gets out of the way. The only thing that matters is "I want to send this file to that device."

Reference aesthetic: Apple AirDrop, Apple AirPlay picker, iOS Share Sheet. Clean whites, soft shadows, generous spacing, subtle motion. Nothing loud.

---

### Visual Language

**Typography**
- Font: `Inter` or system-ui as fallback (`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`)
- Weights: 400 for body, 500 for labels, 600 for device names
- Sizes: 13px labels, 15px body, 17px device names, 11px captions
- Letter spacing: slightly tight (-0.01em) for headings, normal for body

**Colors — Light Mode (primary target)**
```css
--background:       #F2F2F7;   /* iOS system grouped background */
--surface:          #FFFFFF;   /* Cards, panels */
--surface-2:        #F2F2F7;   /* Inset areas */
--text-primary:     #000000;
--text-secondary:   #6C6C70;   /* Labels, captions */
--text-tertiary:    #AEAEB2;   /* Placeholders, disabled */
--accent:           #007AFF;   /* iOS blue — CTAs, active states */
--accent-light:     #E8F1FF;   /* Accent tinted backgrounds */
--success:          #34C759;   /* Transfer complete */
--border:           rgba(0,0,0,0.08);
--shadow-sm:        0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
--shadow-md:        0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
--shadow-device:    0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06);
```

**Spacing** — 8px base grid. Use multiples: 4, 8, 12, 16, 20, 24, 32, 48.

**Border radius**
```css
--radius-sm:   10px   /* Chips, badges */
--radius-md:   14px   /* Input fields, small cards */
--radius-lg:   20px   /* Device bubbles, main panels */
--radius-xl:   28px   /* Bottom sheets, large modals */
```

**Motion**
- All transitions: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-out) at 200–300ms
- Device bubble appearance: scale from 0.6 + fade in, spring feel
- Pulse rings: CSS keyframe animation, `opacity: 0.6 → 0`, `scale: 1 → 2.2`, duration 2s, infinite, staggered
- Progress fill: smooth `width` transition, no janky jumps
- State changes (connecting → connected): crossfade, never hard cuts

---

### Layout — Responsive

**Mobile (< 640px)**
- Full viewport height, no scroll ideally
- Bottom-anchored action area (file picker, status)
- Radar takes up top 55–60% of screen
- Safe area insets respected (`env(safe-area-inset-bottom)`)

**Desktop (≥ 640px)**
- Centered card, max-width 480px, vertically centered on screen
- Same proportions as mobile, just contained
- Radar area slightly larger — 280px diameter

---

### Screens & States

#### Screen 1 — Landing / Idle

The first screen a user sees. App is not yet listening.

```
┌─────────────────────────────┐
│                             │
│       whoosh                │  ← app name, top left, 17px medium
│                             │
│                             │
│   ┌─────────────────────┐   │
│   │                     │   │
│   │    [radar area]     │   │  ← circular, ~240px diameter
│   │   soft grey rings   │   │     inactive state: static grey rings
│   │   no pulse yet      │   │     center: mic icon, grey
│   │                     │   │
│   └─────────────────────┘   │
│                             │
│   "Tap to find nearby       │  ← 15px, text-secondary
│    devices"                 │
│                             │
│   ┌─────────────────────┐   │
│   │   Start Sending     │   │  ← primary CTA button, accent blue
│   │  Ready to Receive   │   │  ← secondary action
│   └─────────────────────┘   │
│                             │
│   Your device: Rohan's      │  ← 13px, text-tertiary
│   iPhone                    │     device name from navigator.userAgent
└─────────────────────────────┘
```

#### Screen 2 — Listening / Scanning

User tapped Start Sending. Mic is active and offer tones are being broadcast. A receiving device should tap Ready to Receive.

```
┌─────────────────────────────┐
│                             │
│       whoosh                │
│                             │
│   ┌─────────────────────┐   │
│   │  ·  ·  ·            │   │  ← animated pulse rings expanding outward
│   │    [  ●  ]          │   │     center: waveform / sound wave icon, accent blue
│   │  ·  ·  ·            │   │     rings: 3 concentric, staggered timing
│   │                     │   │     color: accent blue at low opacity
│   └─────────────────────┘   │
│                             │
│   "Listening for devices…"  │  ← animated ellipsis, text-secondary
│                             │
│   ┌─────────────────────┐   │
│   │      Cancel         │   │  ← secondary button, no fill
│   └─────────────────────┘   │
│                             │
│   🔊 Keep volume up         │  ← 13px hint, text-tertiary, important UX hint
│   📱 Keep screen on         │
└─────────────────────────────┘
```

**Implementation note:** Show "Keep volume up" and "Keep screen on" hints. These are critical. Users don't know the discovery uses sound. Use `navigator.wakeLock.request('screen')` to prevent screen off during discovery.

#### Screen 3 — Device Found

A device appears on the radar. Bubble animates in from center outward, spring effect.

```
┌─────────────────────────────┐
│                             │
│       whoosh                │
│                             │
│   ┌─────────────────────┐   │
│   │         ┌───┐       │   │  ← device bubble appears, positioned
│   │  pulse  │ 💻│ Rohan │   │     on radar ring (not center, not edge)
│   │  rings  │   │'s Mac │   │     device icon based on UA
│   │    ●    └───┘       │   │     name below icon, 13px medium
│   │                     │   │
│   └─────────────────────┘   │
│                             │
│   "1 device nearby"         │  ← updates as more devices appear
│                             │
│   Tap a device to send      │  ← 13px, text-tertiary
└─────────────────────────────┘
```

**Device bubble anatomy:**
```
┌──────────────┐
│              │  ← white circle, 72px diameter, shadow-device
│   [device    │  ← device type icon (laptop/phone/tablet), 28px
│    icon]     │     derived from navigator.userAgent of that peer
│              │
└──────────────┘
  Rohan's Mac    ← device name, 12px, medium, text-primary, centered below
```

Device icon mapping:
- `MacIntel` / `Win` / `Linux` → laptop icon
- `iPhone` / `Android` (mobile UA) → phone icon
- `iPad` → tablet icon

Device name: `navigator.platform` + a short random adjective+noun if platform is generic (e.g. "Swift Falcon") — so users can distinguish multiple phones.

**Multiple devices:** Each gets its own bubble, placed at different angles around the radar ring. Stagger their entrance animations by 150ms each.

#### Screen 4 — File Picker (after tapping a device)

User tapped a device bubble. A bottom sheet slides up.

```
┌─────────────────────────────┐
│   [dimmed radar behind]     │
│                             │
│ ┌─────────────────────────┐ │  ← bottom sheet, radius-xl top corners
│ │  ────                   │ │     drag handle at top, 32px wide, 4px tall
│ │                         │ │
│ │  Sending to             │ │  ← 13px, text-secondary
│ │  Rohan's MacBook   💻   │ │  ← 17px semibold + device icon
│ │                         │ │
│ │  ┌───────────────────┐  │ │
│ │  │                   │  │ │  ← drop zone, dashed border, radius-md
│ │  │  Drop file here   │  │ │     or tap to browse
│ │  │  or tap to browse │  │ │
│ │  │                   │  │ │
│ │  └───────────────────┘  │ │
│ │                         │ │
│ │  ┌───────────────────┐  │ │  ← only shown after file is chosen
│ │  │  [icon] photo.jpg │  │ │     file name + size, radius-md card
│ │  │         3.2 MB    │  │ │
│ │  └───────────────────┘  │ │
│ │                         │ │
│ │  ┌───────────────────┐  │ │
│ │  │      Send →       │  │ │  ← accent blue, disabled until file chosen
│ │  └───────────────────┘  │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

#### Screen 5 — Transferring

File is in flight. Bottom sheet transitions to transfer state.

```
│ ┌─────────────────────────┐ │
│ │  ────                   │ │
│ │                         │ │
│ │  [icon]  photo.jpg      │ │  ← file name
│ │          3.2 MB → 💻    │ │  ← from → to, with arrow
│ │                         │ │
│ │  ████████████░░░░░░░░░  │ │  ← progress bar, accent blue fill
│ │                         │ │     height 6px, radius 99px
│ │  2.1 MB / 3.2 MB · 65% │ │  ← monospace font, 13px, text-secondary
│ │  ~4 seconds left        │ │  ← estimated time, updates live
│ │                         │ │
│ │  ┌───────────────────┐  │ │
│ │  │      Cancel       │  │ │  ← secondary, only during transfer
│ │  └───────────────────┘  │ │
│ └─────────────────────────┘ │
```

Speed calculation: track bytes sent per second over a rolling 2s window. Show estimated time remaining only after 3 seconds of transfer (to avoid wild early estimates).

#### Screen 6 — Transfer Complete

```
│ ┌─────────────────────────┐ │
│ │                         │ │
│ │         ✓               │ │  ← checkmark, 48px, success green
│ │                         │ │     animate in: scale 0 → 1, spring
│ │    Sent successfully    │ │  ← 17px semibold
│ │    photo.jpg · 3.2 MB   │ │  ← 13px, text-secondary
│ │                         │ │
│ │  ┌───────────────────┐  │ │
│ │  │   Send another    │  │ │  ← returns to file picker for same device
│ │  └───────────────────┘  │ │
│ │                         │ │
│ │       Done              │ │  ← text button, dismisses sheet
│ └─────────────────────────┘ │
```

#### Screen 7 — Receiving (on the other device)

The receiver's UI while a file is incoming. Automatically switches to this state when a file starts arriving.

```
┌─────────────────────────────┐
│                             │
│       whoosh                │
│                             │
│   ┌─────────────────────┐   │
│   │   [pulse rings]     │   │  ← rings still animating, green tint
│   │       ●             │   │     center icon: download arrow
│   └─────────────────────┘   │
│                             │
│  Receiving from             │
│  Rohan's iPhone   📱        │
│                             │
│  ████████████░░░░░░░░░░░░   │
│  2.1 MB / 3.2 MB · 65%     │
│                             │
│  photo.jpg                  │
└─────────────────────────────┘
```

On complete: full screen flash of green checkmark (subtle, 300ms), then:

```
│  ✓  photo.jpg received      │
│     ┌──────────────────┐    │
│     │   Save to device │    │  ← triggers browser download
│     └──────────────────┘    │
```

Use `URL.createObjectURL(blob)` + programmatic `<a download>` click to save. On iOS this opens the share sheet automatically — do not try to intercept it.

---

### Radar Animation — Implementation Detail

The radar is the centrepiece. Build it in pure CSS + a small JS layer for device bubble placement.

```css
/* Radar container */
.radar {
  position: relative;
  width: 260px;
  height: 260px;
  border-radius: 50%;
}

/* Static background rings — always visible */
.radar-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.06);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
.radar-ring:nth-child(1) { width: 80px;  height: 80px;  }
.radar-ring:nth-child(2) { width: 150px; height: 150px; }
.radar-ring:nth-child(3) { width: 220px; height: 220px; }

/* Pulse rings — only when listening */
@keyframes radar-pulse {
  0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.5; }
  100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
}

.radar-pulse {
  position: absolute;
  width: 220px; height: 220px;
  border-radius: 50%;
  border: 1.5px solid #007AFF;
  top: 50%; left: 50%;
  animation: radar-pulse 2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
}
.radar-pulse:nth-child(2) { animation-delay: 0.66s; }
.radar-pulse:nth-child(3) { animation-delay: 1.33s; }

/* Center dot */
.radar-center {
  position: absolute;
  width: 48px; height: 48px;
  background: white;
  border-radius: 50%;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  box-shadow: var(--shadow-md);
  display: flex; align-items: center; justify-content: center;
}
```

Device bubble placement — JS:
```javascript
// Place device bubbles evenly around the radar ring
// radius = 95px from center (sits on the middle ring)
function getDevicePosition(index, total) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2 // start from top
  const radius = 95
  return {
    x: Math.cos(angle) * radius, // offset from center
    y: Math.sin(angle) * radius
  }
}
```

---

### Micro-interactions

These details separate a polished app from a generic one. Implement all of them.

- **Device bubble entrance:** `transform: scale(0.5)` + `opacity: 0` → `scale(1)` + `opacity: 1`, spring easing, 350ms
- **Device bubble hover/tap:** slight scale up `1.0 → 1.06`, shadow deepens, 150ms
- **Button press:** `scale(0.97)` on active, snap back on release
- **Progress bar:** never jump — interpolate smoothly. Update every 100ms max
- **Success checkmark:** draw-on SVG stroke animation OR scale-in with a slight overshoot (scale to 1.15 then settle at 1.0)
- **Bottom sheet:** slides up from bottom over 350ms, spring curve. Backdrop fades in simultaneously
- **Cancel/dismiss:** sheet slides down, backdrop fades, radar resumes pulse
- **Sound playing indicator:** small animated waveform icon (3 bars, wave animation) shown near "Listening…" text while ggwave is transmitting

---

### UX Decisions & Rules

1. **Never show technical terms.** No "WebRTC", "SDP", "ICE candidates", "DataChannel". Ever.
2. **Sound hint is mandatory.** Always show "Keep volume up" during discovery. Users will think it's broken otherwise.
3. **WakeLock during discovery.** Request `navigator.wakeLock.request('screen')` immediately on Start Sending or Ready to Receive tap. Release on cancel or after connection. Without this, screen dims and mic capture can be interrupted.
4. **File drag-and-drop on desktop.** The entire radar area should be a drop target when a device is selected — not just the sheet's drop zone. Dragging a file onto the app should naturally open the send flow.
5. **One file at a time for MVP.** Don't complicate the UI with multi-file queues initially.
6. **No settings screen.** Nothing to configure. If something needs a choice, make the right default.
7. **Device name shown immediately on the bubble.** Not "Device 1" — use the actual name derived from UA. People need to recognise their own device instantly.
8. **The receiver never has to do anything special.** They just have the page open and listening. The send flow is entirely initiated by the sender.
9. **Error states must be human.** Not "ICE connection failed". Say "Couldn't connect — make sure both devices are on the same WiFi and volume is up."
10. **iOS file save:** After receiving, trigger the download programmatically. On iOS this opens the native share sheet — don't fight it. Add a note "File saved to Downloads" only on desktop where you can be sure.

---

### Permissions Flow

Both mic and (on some browsers) audio output require user permission. Handle gracefully.

```
User taps Start Sending or Ready to Receive
        ↓
Request mic permission
        ↓
[ Granted ]─────────────────→ Start listening; Start Sending also transmits offers
        ↓
[ Denied ]
        ↓
Show inline message (not alert):
"Whoosh needs mic access to find nearby devices.
 [Open Settings] to allow it."
```

Never use `alert()` for permission errors. Show an inline state within the UI, styled consistently with the rest of the app.

---

## MVP Milestone

The first thing to validate on real hardware:

1. Two devices open the page
2. Sender taps Start Sending; receiver taps Ready to Receive
3. Receiver decodes the offer and taps the sender to answer
4. Sound plays, connection establishes
5. One file transfers successfully

Everything else — multiple files, transfer history, pretty UI, resumption — comes after this works.

---

## Key Dependencies

- [ggwave](https://github.com/ggerganov/ggwave) — MIT License — audio data transmission
- WebRTC — built into all modern browsers, no library needed
- Web Audio API — built into all modern browsers
- No other runtime dependencies

---

## References

- [wave-share](https://github.com/ggerganov/wave-share) — WebRTC over audio, proof of concept
- [ggwave demo](https://wasm.ggerganov.com/) — test ggwave in browser right now
- [Snapdrop source](https://github.com/RobinLinus/snapdrop) — reference for WebRTC + device discovery UX
- [WebRTC DataChannel MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)
- [ggwave WASM usage](https://github.com/ggerganov/ggwave/tree/master/examples/ggwave-wasm)
