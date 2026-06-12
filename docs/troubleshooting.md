# Troubleshooting

## Discovery Does Not Start

Check the browser console for microphone or audio errors.

Common fixes:

- Use HTTPS or `localhost`.
- Allow microphone permission.
- Keep the tab active.
- Turn up speaker volume.
- Move devices closer together.

## Receiver Does Not See Sender

The sender broadcasts offer tones repeatedly during discovery.

Check:

- Both devices have the page open.
- Both devices are on the same Wi-Fi/local network.
- Sender tapped `Start Sending`.
- Receiver tapped `Ready to Receive`.
- Volume is audible on the sender.
- Receiver microphone permission is allowed.

## Sender Does Not Decode Answer

The receiver sends a compact `A|...` answer tone after the user taps the sender bubble.

Check:

- Sender logs include `Receiver started connecting; stopping offer broadcasts`.
- Receiver logs include `Sending compact signal`.
- Devices are close enough for the sender mic to hear the receiver speaker.
- Avoid speaking/noise during the answer tone.

## WebRTC Fails After Audio Works

If the offer and answer decode but the data channel does not open:

- Confirm both devices are on the same local network.
- Disable VPNs.
- Avoid guest Wi-Fi or public Wi-Fi with client isolation.
- Check firewall/router settings.
- In Chromium, inspect `chrome://webrtc-internals`.

## Transfer Fails With `max-message-size`

Older versions used `512 KB` chunks, which can exceed the WebRTC max message size advertised by this app. Current transfer chunks are `64 KB`.

Hard refresh both devices and make sure the sender loads:

```text
transfer.js?v=4
main.js?v=27
```

## Large Files Are Slow

Large files are sliced and sent through WebRTC in `64 KB` chunks. This is more compatible with mobile browsers but can be slower than larger chunks.

Keep both screens awake and stay on the page until the transfer completes.

## Recent Device Does Not Reconnect

Recent devices are local history, not reusable connection credentials. They help users remember devices and reopen the file picker for active sessions.

If the page reloaded, the browser closed, or the connection ended, run sound discovery again.

## PWA Icons 404

Ensure these files exist at the site root:

```text
icon-192.png
icon-512.png
```

They are referenced by `manifest.json`.
