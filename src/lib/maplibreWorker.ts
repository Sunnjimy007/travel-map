import * as maplibregl from 'maplibre-gl'
// MapLibre resolves its worker script's URL at runtime, relative to its own
// module's import.meta.url — Vite can't see that reference statically, so
// the worker was never emitted as a real build asset. In production that
// request hit Vercel's SPA catch-all (which serves index.html for anything
// that isn't a real file), and the browser correctly refused to run HTML as
// a JS module. Without its worker, MapLibre can't parse map tiles, so
// `load` never meaningfully fires — breaking every map on the page.
//
// The worker file also has its own static `import ... from
// "./maplibre-gl-shared.mjs"`, so it must be served from a path where that
// sibling file sits right next to it under its exact original name — see
// scripts/copy-maplibre-worker.mjs, which copies both into public/maplibre
// before dev/build so they're served as plain static files, untouched by
// Vite's asset hashing.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
