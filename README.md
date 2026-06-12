# Whoosh.share

Serverless, Cross-platform, pure browser nearby file sharing.

Whoosh lets phones, tablets, and computers share files on the same local network with no app install. Open the page on both devices, pair them with sound, and send files directly over a local WebRTC connection. There is no backend, no account, and no relay server for file bytes.

## How It Works

1. Open the same Whoosh page on both devices.
2. Keep both devices on the same Wi-Fi or local network.
3. Tap `Start Sending` on the sender.
4. Tap `Ready to Receive` on the receiver.
5. The sender broadcasts a short sound offer.
6. The receiver shows the sender on the radar; tap it to answer with sound.
7. A WebRTC data channel opens.
8. Send one file or multiple files over the direct connection.

Recent devices are remembered locally in browser storage only. They are shown as history and active-session shortcuts, not permanent reconnect credentials. Closed WebRTC sessions still require sound discovery again.

## Features

- Sound-based pairing with bundled `ggwave` WASM
- Serverless LAN WebRTC connection
- Single-file and multi-file transfer
- Large-file chunking with backpressure
- Reuse of the live data channel for `Send another`
- Local-only recent-device history
- PWA manifest and installable icons
- Cross-platform web app for mobile and desktop browsers
- Pure browser implementation with vanilla HTML/CSS/JavaScript and no build step

## Live Demo

https://dmjdarshan.github.io/whoosh.share/

## Local Development

Serve the repo over `localhost` or HTTPS. Microphone access does not work from `file://`.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

For a real two-device test, open the page on both devices on the same Wi-Fi. If testing from a phone against a laptop-hosted local server, open the laptop's LAN IP on the phone, for example `http://192.168.1.100:8000`.

## Project Structure

```text
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
├── lib/ggwave/
│   ├── README.md
│   └── ggwave.js
├── docs/
│   ├── architecture.md
│   ├── setup.md
│   ├── deployment.md
│   └── troubleshooting.md
└── README.md
```

## Documentation

- [Architecture](docs/architecture.md)
- [Setup](docs/setup.md)
- [Deployment](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)

## Privacy Model

Whoosh loads static app files from the host. Pairing data is transmitted as sound between nearby devices. File bytes move through the WebRTC data channel between peers.

Nothing is uploaded to an app server. Recent-device history is stored in `localStorage` and is cleared when browser storage/cache is cleared.

## Current Limitations

- Devices must be on the same local network.
- Public Wi-Fi with client isolation, strict firewalls, or VPNs can block WebRTC.
- Closed or reloaded sessions cannot reconnect from cached device history alone.
- Transfers do not resume after disconnection.
- Received multi-file batches are offered as individual downloads.

## References And Acknowledgements

Whoosh builds on ideas and tools from:

- [ggwave](https://github.com/ggerganov/ggwave): audio data transmission and the bundled WASM-based sound encoder/decoder.
- [wave-share](https://github.com/ggerganov/wave-share): proof that a WebRTC handshake can be exchanged through sound in the browser.
- [Snapdrop](https://snapdrop.net) and [Snapdrop GitHub](https://github.com/RobinLinus/snapdrop): the broader browser-based local file sharing UX pattern.
- [PairDrop](https://github.com/schlagmichdoch/PairDrop): improvements and product thinking around peer-to-peer sharing workflows.
- [WebRTC](https://webrtc.org/): encrypted browser peer-to-peer data channels.
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API): microphone capture and speaker playback for sound pairing.

## License

See [LICENSE](LICENSE).
