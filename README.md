Live site: [VibeCat After Hours](https://tonidondoni.github.io/vibecat/)

# VibeCat After Hours

A living, code-painted cafe scene with an orange cat, a laptop, coffee, and an endless instrumental hip-hop groove. The 1024 x 1024 artwork is inspired by neo-impressionism and pointillism. Everything runs locally in the browser after the static assets have loaded.

## Experience

- Two lamps swing with different periods and phases. Tap a lamp to switch it on or off.
- Distant windows turn on and off after randomized dwell times.
- Individual steam particles rise, curl, disperse, and respawn above the coffee.
- Light rain crosses the unobstructed window areas, and the cat occasionally blinks.
- The animation runs continuously without a timeline reset. Pause it, change the evening rhythm, or enter full screen using the lower-right controls.
- Select **Play the groove** in the lower-left corner to start the music. The tempo slider adjusts the beat from 50 to 140 BPM (74 by default), including during playback. A separate volume slider appears while music plays. Audio starts only after a user gesture and can be paused independently of the animation.
- The animation respects the browser's reduced-motion preference. Music remains opt-in.
- Move the pointer across the painting for a small depth-based viewpoint change.
  **3D ON/OFF** toggles it; **VIEW** provides a keyboard-accessible horizontal angle.

## Depth parallax experiment

This branch uses a real Depth Anything V2 Small FP16 prediction of `assets/cafe.jpg`.
The cat, laptop and foreground table move relative to the distant windows. It is
a limited 2.5D viewpoint shift, not a complete 3D reconstruction. Large rotations
or newly revealed surfaces are not available from one image.

Depth is baked once into `dist/assets/cafe-depth.png`. The browser loads that map
once and warps the existing live Canvas painting with WebGL. No model, Python
server, account, API key or remote inference is needed during playback. Lamps,
steam, rain, blink animation and music keep their original implementations. The
WebGL output never becomes input to the source painting. The fixed depth map does
not follow the small moving lamps and steam exactly; that approximation is part
of this first experiment.

Pointer movement is smoothed and returns to center on exit. The effect starts
disabled with reduced motion. A missing map or unavailable WebGL leaves the
original painting usable. The controls remain outside the warped image. A small
crop leaves room for near layers to shift without exposing the frame edges.

To regenerate depth on an Apple Silicon Mac, use Python 3.11 with the optional
packages in `scripts/depth-requirements.txt`, then run:

```sh
python scripts/make_depth.py --model PATH_TO/DepthAnythingV2SmallF16.mlpackage
```

The official package is [Apple's Core ML Small FP16 model](https://huggingface.co/apple/coreml-depth-anything-v2-small).
Its pinned revision, source/depth/weights hashes and package versions are recorded
in `dist/assets/cafe-depth.json`. The model is licensed Apache-2.0. Letterboxing
preserves the square image's proportions in the 518 x 392 model input; prediction
padding is removed before saving the 512 x 512 map. White means nearer, not a
distance in meters. Timing reports stay under ignored `output/depth/`.

An optional browser check requires Playwright and Chromium, with the static server
already running. Set `PLAYWRIGHT_MODULE` for an existing Playwright installation
and `BROWSER_EXECUTABLE` for an existing browser if needed:

```sh
VIBECAT_URL=http://127.0.0.1:8000/ node scripts/check-parallax.mjs
```

It checks visible image changes, unchanged source pixels while the camera moves,
live animation, lamp clicks, controls, reduced motion, WebGL fallback, one depth
load, no external runtime requests, and 390/320 px layouts. Captures and measured
display callback throughput are saved in ignored `output/parallax-check/`. These
short desktop-browser checks do not establish physical-phone or sustained 60 fps
performance.

## How the image is made

The illustration is drawn entirely by `scripts/draw_vibecat.py`, using Python, Pillow, and NumPy. It does not use a diffusion model, downloaded artwork, or a reference photograph.

1. A hand-authored composition defines the cafe, buildings, cat, laptop, table, coffee, and croissant as filled shapes and sampled Bezier curves.
2. A small palette establishes the warm interior lighting and cool evening window colors.
3. Three passes of randomized pigment dabs sample the underlying colors and add neighboring complementary colors. Short directional strokes add fur detail; fine curves add whiskers.
4. A larger working raster is downsampled to 1024 x 1024, then a subtle grain is added.
5. The script writes an actual uncompressed 24-bit BMP itself: a file header, a DIB header, and bottom-up BGR pixel rows with row padding. Pillow also saves a JPEG copy.

The drawing uses fixed random seeds, so the same code and dependency versions reproduce the same pixels. A texture pass intentionally introduces the appearance of irregular paint without requiring a learned image generator.

## How the animation is made

`scripts/make_layers.py` reuses the drawing code to produce a background without fixed lamps or steam, two transparent lamp sprites, and window-position data. The generated assets are committed in `dist/assets/` so the website requires no Python installation or build step.

`dist/scene.js` composites those layers with the Canvas 2D API. Pendulum angles combine sine waves; window brightness eases toward randomly selected states; steam and rain use small bounded particle collections. Each particle fades or exits before respawning. The result has continuous motion and recurring motifs without an obvious loop boundary. Random parameters are regenerated when the page is loaded or the evening rhythm is changed.

## How the music is made

`dist/groove-core.mjs` is a small procedural instrument and sequencer written in plain JavaScript. It computes PCM samples at 24 kHz. It does not download drum samples, stream a track, or call a music-generation service. There are no vocals.

The 4/4 arrangement defaults to 74 BPM and combines:

- **Kick:** a sine oscillator with a fast downward pitch envelope, a short noise transient, exponential decay, and soft saturation.
- **Snare:** filtered random noise, decaying resonances, and quiet delayed noise bursts.
- **Hi-hats and rim:** short high-frequency noise and decaying sinusoidal partials, with velocity differences and alternating stereo positions.
- **Bass:** a low fundamental with a few harmonics and a short amplitude envelope.
- **Electric-piano-like chords:** frequency modulation, detuned partials, exponential decay, low-pass filtering, subtle pitch drift, and quiet stereo delay taps.
- **Texture and glitches:** very quiet filtered noise, held and quantized noise accents, occasional pitched repeats, and phrase-ending drum fills.

A stable backbeat anchors the groove. Odd sixteenths are delayed to create swing, while small timing and velocity changes keep it loose. A 16-bar harmonic cycle supplies continuity; probabilistic hats, ghost notes, fills, sparse breakdowns, and glitch events create ongoing variation. The rhythm stays recognizable instead of becoming an unstructured random sequence.

`dist/music.mjs` schedules newly rendered bars with the Web Audio clock, several seconds ahead of playback. Each bar includes its sound tails, which overlap the next bar rather than being cut at the boundary. Changing BPM rebuilds the queued bars at the selected tempo and fades the audio across the transition. Ended audio nodes disconnect, and the synthesis cache contains only the small set of notes used by the arrangement. Playback continues generating bars for as long as it is enabled. Volume changes are smoothed, and output filtering and compression tame the mix.

## Run locally

Serve the existing static files with Python 3:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. Use an HTTP server rather than opening the HTML file directly, because the page loads a JavaScript module and a JSON asset.

## Regenerate the artwork

Python 3.10 or newer is recommended.

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/draw_vibecat.py
python scripts/make_layers.py
```

The first command that draws artwork writes BMP and JPEG files into `output/`. The layer generator updates the committed web assets in `dist/assets/`. Commit those updated assets when changing the drawing.

## Check the project

Node.js 22 or newer is recommended. There are no JavaScript package dependencies.

```sh
node scripts/check.mjs
```

The check verifies English-only source text, local asset references, reproducible synthesis for a fixed seed, finite stereo audio samples, signal headroom, and bounded note caching over 32 rendered bars.

## Publish to GitHub Pages

The workflow `.github/workflows/pages.yml` publishes only `dist/`. It runs on pushes to `main` and can also be started with **Actions > Publish to GitHub Pages > Run workflow**.

For initial setup, select **Settings > Pages > Build and deployment > Source > GitHub Actions**. Once Pages is configured, successful workflow runs update the live site automatically. Relative asset paths support deployment under a repository subdirectory as well as at a domain root.

The workflow checks the JavaScript and project contents, configures Pages, uploads the static artifact, and deploys it to the `github-pages` environment. No personal access token or custom repository secret is required for routine deployment.

## Project layout

| Path | Purpose |
| --- | --- |
| `dist/index.html` | Accessible page structure and controls |
| `dist/style.css` | Responsive gallery layout |
| `dist/scene.js` | Canvas animation and interactions |
| `dist/parallax.js` | Mouse-controlled WebGL depth warp of the live painting |
| `dist/assets/cafe-depth.png`, `cafe-depth.json` | Baked neural depth and provenance |
| `dist/groove-core.mjs` | Pure procedural synthesis and musical arrangement |
| `dist/music.mjs` | Browser audio scheduling and music controls |
| `dist/assets/` | Generated raster layers and window positions |
| `scripts/draw_vibecat.py` | Complete original drawing and direct BMP writer |
| `scripts/make_layers.py` | Animated-layer asset generator |
| `scripts/check.mjs` | Source, asset, and audio checks |
| `scripts/make_depth.py` | Optional local Core ML depth baking |
| `scripts/check-parallax.mjs` | Browser checks and parallax captures |
| `.github/workflows/pages.yml` | Automatic and manual Pages publication |

## References and attribution

The drawing, animation, synthesis, and arrangement algorithms were written specifically for this project. No third-party application repository or algorithm implementation was copied or adapted. The following documentation informed the implementation:

- [Pillow documentation](https://pillow.readthedocs.io/en/stable/) for raster drawing, resizing, and image encoding.
- [NumPy documentation](https://numpy.org/doc/stable/) for pixel arrays and deterministic noise.
- [MDN: Advanced techniques - creating and sequencing audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques) for sound synthesis and audio-clock scheduling concepts.
- [W3C Web Audio API specification](https://www.w3.org/TR/webaudio/) for audio buffers, scheduled sources, filters, and compression.
- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) for browser raster compositing.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for deployment configuration.

The deployment workflow uses the official [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [configure-pages](https://github.com/actions/configure-pages), [upload-pages-artifact](https://github.com/actions/upload-pages-artifact), and [deploy-pages](https://github.com/actions/deploy-pages) actions. These are deployment dependencies, not sources of the music or animation algorithms.

## Privacy

The application has no accounts, analytics, tracking scripts, API keys, or external media services. Its browser storage entries remember the visitor's chosen music volume and tempo. Raster assets contain no EXIF identity or location information. The live URL at the top necessarily includes the account namespace required by the standard Pages address.

## License

MIT. See [LICENSE](LICENSE).
