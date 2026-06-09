# ggwave WASM Integration

This directory should contain the ggwave WebAssembly files required for audio-based device discovery.

## Required Files

You need to download these files from the official ggwave repository:

1. **ggwave.js** — JavaScript wrapper for the WASM module
2. **ggwave.wasm** — WebAssembly binary

## Download Instructions

### Option 1: Download Pre-built Files

Visit the ggwave WASM demo and download the files:

1. Go to: https://wasm.ggerganov.com/
2. Open browser DevTools (F12)
3. Go to Network tab
4. Refresh the page
5. Download these files:
   - `ggwave.js`
   - `ggwave.wasm`
6. Place them in this directory (`lib/ggwave/`)

### Option 2: Build from Source

```bash
# Clone ggwave repository
git clone https://github.com/ggerganov/ggwave.git
cd ggwave

# Install Emscripten (if not already installed)
# Follow: https://emscripten.org/docs/getting_started/downloads.html

# Build WASM
mkdir build-wasm
cd build-wasm
emcmake cmake ..
make

# Copy files to Whoosh
cp examples/ggwave-wasm/ggwave.js /path/to/whoosh.share/lib/ggwave/
cp examples/ggwave-wasm/ggwave.wasm /path/to/whoosh.share/lib/ggwave/
```

### Option 3: Use CDN (Not Recommended for Production)

For quick testing, you can load ggwave from a CDN, but this requires modifying `src/discovery.js`:

```javascript
// In src/discovery.js, replace loadGGWave() with:
async loadGGWave() {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/gh/ggerganov/ggwave@master/examples/ggwave-wasm/ggwave.js';
  document.head.appendChild(script);
  
  await new Promise((resolve) => {
    script.onload = resolve;
  });
  
  this.ggwave = await window.GGWave.init({
    wasmPath: 'https://cdn.jsdelivr.net/gh/ggerganov/ggwave@master/examples/ggwave-wasm/ggwave.wasm'
  });
}
```

## Verification

After placing the files, your directory structure should look like:

```
lib/ggwave/
├── README.md (this file)
├── ggwave.js
└── ggwave.wasm
```

Test that the files are accessible:

```bash
# Start a local server from the project root
python3 -m http.server 8000

# Visit in browser
http://localhost:8000/lib/ggwave/ggwave.js
http://localhost:8000/lib/ggwave/ggwave.wasm

# Both should download/display without 404 errors
```

## Integration Status

Current status: **MOCK IMPLEMENTATION**

The app currently uses a mock ggwave implementation in `src/discovery.js`. This allows the UI to work, but audio discovery will not function.

To enable real audio discovery:

1. Download the ggwave files (see above)
2. Update `src/discovery.js` in the `loadGGWave()` method
3. Replace the mock with actual ggwave initialization

See the main [README.md](../../README.md) for detailed integration instructions.

## ggwave Protocol

Whoosh uses the **ULTRASOUND_FASTEST** protocol:

- **Frequency range:** 18-22 kHz (inaudible to most humans)
- **Data rate:** ~100 bytes/second
- **Error correction:** Reed-Solomon encoding
- **Typical SDP payload:** ~500 bytes → ~5 seconds transmission time

## Troubleshooting

### Files not loading

- Ensure you're serving over HTTP/HTTPS (not `file://`)
- Check browser console for CORS errors
- Verify file paths are correct

### Audio not working

- Check microphone permissions
- Ensure volume is up (ultrasonic tones are quiet)
- Test with audible mode first (modify protocol ID in discovery.js)
- Some devices can't produce/capture 18-22kHz frequencies

### WASM initialization fails

- Check browser console for detailed error messages
- Ensure WASM is enabled in browser settings
- Try a different browser (Chrome/Firefox recommended)

## References

- **ggwave GitHub:** https://github.com/ggerganov/ggwave
- **WASM Example:** https://github.com/ggerganov/ggwave/tree/master/examples/ggwave-wasm
- **Live Demo:** https://wasm.ggerganov.com/
- **wave-share (reference):** https://github.com/ggerganov/wave-share