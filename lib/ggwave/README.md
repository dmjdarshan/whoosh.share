# ggwave WASM Integration

This directory contains the browser build used for sound-based discovery.

## Current Build

The repository currently uses:

```text
lib/ggwave/
├── README.md
└── ggwave.js
```

This `ggwave.js` copy is self-contained: it exposes `window.ggwave_factory` and embeds the WASM payload, so there is no separate `ggwave.wasm` file in this repo.

`src/discovery.js` expects this API shape:

```javascript
const ggwave = await window.ggwave_factory();
const params = ggwave.getDefaultParameters();
const instance = ggwave.init(params);

const samples = ggwave.encode(
  instance,
  payload,
  ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST,
  10
);

const decodedBytes = ggwave.decode(instance, samples);
```

The current binding accepts signed 8-bit PCM samples reliably, so the app converts browser microphone `Float32Array` frames to `Int8Array` before decoding and normalizes encoded `Int8Array` samples back to floats before playback.

## Replacing ggwave

If you download a different build from upstream, it may require a separate `ggwave.wasm` file or expose a different JavaScript API. After replacing the file, verify:

- `window.ggwave_factory` exists
- `getDefaultParameters()`, `init(params)`, `encode(instance, ...)`, and `decode(instance, ...)` work
- `ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST` exists
- Discovery starts in the browser without binding errors

Useful upstream links:

- ggwave GitHub: https://github.com/ggerganov/ggwave
- WASM example: https://github.com/ggerganov/ggwave/tree/master/examples/ggwave-wasm
- Live demo: https://wasm.ggerganov.com/

## Troubleshooting

If discovery does not work:

- Check microphone permission and browser console errors
- Turn volume up and keep devices close together
- Try ultrasonic mode only after audible mode works; some devices cannot reliably capture it
- Test on Chrome first, then Safari/iOS after the basic flow is confirmed
