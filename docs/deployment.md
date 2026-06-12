# Deployment

Whoosh is a static site. It can be deployed to GitHub Pages, Netlify, Vercel static hosting, Cloudflare Pages, or any normal web server.

## GitHub Pages

1. Push the repo to GitHub.
2. Open repository settings.
3. Go to `Pages`.
4. Select the main branch and root folder.
5. Save.

The app will be available at:

```text
https://USERNAME.github.io/REPOSITORY/
```

## Deployment Checklist

- `index.html` loads without 404s.
- `styles.css` and files in `src/` load with current cache-buster versions.
- `lib/ggwave/ggwave.js` loads successfully.
- `icon-192.png` and `icon-512.png` exist and match `manifest.json`.
- The app is served over HTTPS.
- Microphone permission prompt appears on `Start Sending` / `Ready to Receive`.
- Two devices on the same Wi-Fi can complete discovery and transfer.

## Service Worker

Caching is currently disabled:

```js
const CACHING_DISABLED = true;
```

Leave it disabled while the app is changing quickly. If you re-enable caching, update `CACHE_NAME` whenever you change app shell files and test a fresh browser session after deployment.

## Static Hosting Notes

Whoosh does not need an API server, WebSocket server, STUN server, or TURN server in the current local-network model.

The hosted site only serves static assets. Pairing happens through sound and file data moves through WebRTC between devices.
