# HolaMundo — 3D Configurator

Parametric configurator generated from `definition.ir.json` (Grasshopper `adHolaMundo.ghx`).
Static site: no build step, no server, no data collection.

## Run locally

ES modules need HTTP, so `file://` will not work:

```bash
npx serve .
# or
python -m http.server 8000
```

## Deploy

- **GitHub Pages:** upload the contents of this folder to a public repo, Settings → Pages → branch `main`, root. URL: `https://<user>.github.io/<repo>/`
- **Cloudflare Pages:** Dashboard → Pages → Create → Direct Upload → drop the zip.

## Structure

| file | role |
|---|---|
| `index.html` | UI shell + importmap (three, rhino3dm via CDN) |
| `solver.js` | graph translation: Line → Divide Curve → Evaluate Curve → Distance → Circle → Loft |
| `app.js` | sliders, Three.js viewer, STL/3DM export |
| `styles.css` | grayscale UI, desktop left-panel / mobile viewer-first layout |

## Inputs

- `height` — line length (21–84)
- `sections` — divisions of the line (3–7)
- `attraction point` — 0–1 along the line; circle radius = distance from each section to that point

Geometry is generated locally in the browser. Export: STL (built-in) or 3DM (loads rhino3dm from CDN on first use).
