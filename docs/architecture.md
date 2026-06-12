# Architecture

Whoosh is a static browser app for nearby file transfer. It uses sound only for pairing, then switches to WebRTC for file data.

## System Overview

```text
Sender browser                         Receiver browser
--------------                         ----------------
Start Sending                          Ready to Receive
Create WebRTC offer
Compact offer to O|... tone  ------->  Decode offer tone
                                        Show sender on radar
                                        User taps sender
                                        Create WebRTC answer
Decode answer tone          <-------   Compact answer to A|... tone
Set remote answer
Data channel opens          <------->  Data channel opens
Send file chunks            ------->   Reassemble files
```

## Main Modules

### `src/main.js`

App orchestration and state machine:

- Initializes UI, discovery, WebRTC, and transfer managers.
- Owns sender/receiver roles.
- Runs the sender offer loop.
- Pauses/stops offer tones when a receiver starts connecting.
- Handles compact offer/answer messages.
- Stores local recent-device history in `localStorage`.

### `src/discovery.js`

Sound pairing through `ggwave`:

- Loads bundled `lib/ggwave/ggwave.js`.
- Requests microphone access.
- Uses Web Audio to capture mic samples and play encoded tones.
- Sends compact `O|...` offer and `A|...` answer signals.
- Uses `AUDIBLE_FASTEST` for offers and `AUDIBLE_FAST` for the answer path.

### `src/connection.js`

WebRTC setup:

- Creates `RTCPeerConnection` with `iceServers: []`.
- Uses same-LAN host candidates only.
- Creates a reliable ordered data channel.
- Compacts WebRTC SDP into a short sound payload.
- Rebuilds local SDP from compact fields on the other device.

### `src/transfer.js`

File transfer:

- Sends one or more files sequentially over the active data channel.
- Slices files into `64 KB` chunks to stay below WebRTC max-message-size limits.
- Reads file slices incrementally instead of loading the whole file into memory.
- Applies backpressure using `RTCDataChannel.bufferedAmount`.
- Reassembles received chunks into `Blob` downloads.

### `src/ui.js`

UI state and panels:

- Sender/receiver buttons.
- Radar device bubbles.
- File picker with multi-file support.
- Transfer progress and completion sheets.
- Recent devices side panel.

## Compact Audio Signal

Full SDP is too large and slow for audio. Whoosh compacts the WebRTC description into a pipe-delimited signal:

```text
O|ip|port|ufrag|pwd|fingerprint|deviceType|deviceName
A|ip|port|ufrag|pwd|fingerprint
```

The offer includes a short display name so the receiver can show a radar bubble. The answer omits display metadata to reduce tone duration and improve decode reliability.

## State Flow

```text
idle
  -> listening
    sender: broadcasting offers with quiet listening gaps
    receiver: listening for offers
  -> connected
    data channel is open
  -> transferring
    file batch in progress
  -> connected
    transfer complete; sender can send another file over the live channel
  -> idle
    user disconnects, cancels, reloads, or connection closes
```

## Privacy And Storage

The app stores only recent device metadata:

- `id`
- `name`
- `type`
- `lastSeen`

This is stored in browser `localStorage` under `whoosh-recent-devices`. It is local history only. It does not contain reusable WebRTC credentials, file data, or permanent pairing secrets.

## Network Model

Whoosh currently uses same-LAN WebRTC with no STUN/TURN servers:

```js
iceServers: []
```

That keeps the app serverless and local, but means both devices must be on the same local network and able to reach each other. Public Wi-Fi client isolation, VPNs, and strict firewalls can block the connection.

## Service Worker

`sw.js` is present, but caching is currently disabled during development:

```js
const CACHING_DISABLED = true;
```

This avoids stale JavaScript while the handshake and transfer code are changing quickly.
