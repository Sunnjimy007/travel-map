// MapLibre's worker script has a static `import ... from "./maplibre-gl-shared.mjs"`
// inside it — the two files must sit next to each other with their exact
// original names for that relative import to resolve. Vite's `?url` import
// copies a file verbatim (without rewriting its internal imports) to a
// hashed path, which breaks that sibling reference. Copying both files,
// unrenamed, into public/ sidesteps Vite's asset pipeline entirely: files
// in public/ are served as-is at a stable path, so the worker's own
// relative import finds its sibling correctly. Runs before dev/build so it
// never goes stale if maplibre-gl is upgraded, without committing
// third-party output into the repo.
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(root, '..', 'node_modules', 'maplibre-gl', 'dist')
const dest = path.join(root, '..', 'public', 'maplibre')

mkdirSync(dest, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(src, file), path.join(dest, file))
}
