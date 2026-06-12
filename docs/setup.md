# Setup

Whoosh has no build step. Serve the static files and open the page in a modern browser.

## Requirements

- Chrome, Edge, Firefox, or Safari 16+
- HTTPS or `localhost` for microphone permission
- Two devices on the same Wi-Fi/local network for real transfer testing
- Speakers and microphone enabled on both devices

## Run Locally

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

Other static servers work too:

```bash
npx http-server -p 8000
php -S localhost:8000
```

## Two-Device Test

1. Start the local server on the laptop.
2. Find the laptop's LAN IP address.
3. Open `http://localhost:8000` on the laptop.
4. Open `http://YOUR_LAN_IP:8000` on the phone.
5. Keep both devices on the same Wi-Fi.
6. Tap `Start Sending` on one device.
7. Tap `Ready to Receive` on the other device.
8. Tap the discovered device bubble on the receiver.
9. Wait for the data channel to open, then select one or more files.

## ggwave

The repo includes a self-contained browser build:

```text
lib/ggwave/ggwave.js
```

The current code expects this API shape:

```js
const ggwave = await window.ggwave_factory();
const params = ggwave.getDefaultParameters();
const instance = ggwave.init(params);
ggwave.encode(instance, payload, protocol, volume);
ggwave.decode(instance, samples);
```

If you replace `ggwave.js`, verify that the build exposes the same API. Some upstream builds expect a separate `.wasm` file or different bindings.

## Browser Permissions

Microphone permission is required for discovery. The sender also listens during offer gaps so it can decode the receiver's answer tone.

If permission is denied:

1. Open the browser site settings.
2. Allow microphone access.
3. Reload the page.

## Development Notes

- Use cache-buster query strings when editing deployed static files.
- Keep the tab active during discovery; background tabs may throttle audio.
- Use `chrome://webrtc-internals` for lower-level WebRTC debugging in Chromium browsers.
