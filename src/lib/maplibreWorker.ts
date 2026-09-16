import * as maplibregl from 'maplibre-gl'
// MapLibre resolves its worker script's URL at runtime, relative to its own
// module's import.meta.url — Vite can't statically see that reference, so
// the worker file never gets emitted as a real build asset. In production
// that request 404s (Vercel's SPA catch-all serves index.html for it, which
// the browser then refuses to run as a module: "non-JavaScript MIME type"),
// silently breaking every map on the page. The `?url` import below forces
// Vite to emit the worker as a proper hashed asset, and setWorkerUrl points
// MapLibre at it explicitly instead of guessing.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

maplibregl.setWorkerUrl(workerUrl)
