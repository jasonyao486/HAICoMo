# Public artwork — 0.5.0

Runtime files are in `assets/runtime/local-assets/`, with per-file provenance, licence, adaptation description, size and SHA-256 in `assets/manifest.json`. Vite copies only this curated directory. Original videos, private correspondence, rejected variants and historical references stay outside the public repository and installers.

## Characters and portraits

Fourteen model families have transparent animation atlases and static/animated portraits. These are adaptations of the credited characters, not new independently owned designs. See [ASSET-LICENSES.md](../ASSET-LICENSES.md) for the confirmed non-commercial distribution scope and the whale's CC BY-NC-SA 4.0 attribution chain.

`src/shared/art.ts` specifies source regions, scale, anchor and per-pose frames. The contract covers walking, running, standing, sitting, sleeping, talking and a family-specific hobby; ERNIE retains wheelchair movement. `scripts/measure-sprite-regions.py` reads alpha projections for crop metadata without modifying pixels. Historical exact generation prompts are not all available; this specification is not presented as a verbatim reconstruction.

## Environment and relay furniture

Existing wall, floor, round table, tea table, stool and plant assets share pencil outlines and warm painted textures. The two 0.3.1 relay assets were created and revised with the built-in ImageGen tool, using the previous generated furniture as edit targets. Final files are `studio-desk.png` and `studio-sofa.png`; their alpha channels are preserved.

The desk has a laptop on the left, its main monitor and decorations in the centre, and an extended display, notebook and sports bottle on the right. The sofa faces straight forward from a slightly elevated camera; horizontal seat edges align with the fixed scene. Furniture and actors remain separate layers. Light, dark and reduced-motion screenshots verify placement in the actual application.

Final desk edit prompt (verbatim):

```text
Use case: precise-object-edit. Asset type: transparent furniture sprite for HAICoMo's hand-painted collaboration studio.
Input image: edit target, the existing wide wooden office desk. Preserve the desk shape, warm oak, fine pencil linework, gouache texture, lighting, three-person width, front-facing slightly elevated camera and all middle workstation decorations exactly as closely as possible.
Change only these workstation objects: LEFT: remove the separate monitor, keyboard and mouse, replace them with one open laptop at the left station. Keep the left potted plant, pencil/tool pot and sticky notes. CENTRE: retain its monitor, keyboard, mouse, mug with pens, and the stack of books. RIGHT: make its monitor look like the centre computer's extended second display: same screen and bezel style, move it closer to the central display with a gentle inward turn toward the centre. Remove the right keyboard and mouse, and put one paper notebook and one sports water bottle in front of this secondary display. Keep the right potted plant and organiser. Screens remain blank muted blue-grey, no text or logos.
Keep the entire piece inside the frame. No chairs or people, no room or floor plane. Actual transparent alpha background with no coloured haze, glow, backdrop or opaque shadow outside the object. Preserve the reference's refined hand-drawn cartoon style.
```

Final sofa edit prompt (verbatim):

```text
Use case: precise-object-edit. Asset type: transparent furniture sprite for HAICoMo's fixed-camera collaboration studio.
Input image: edit target, the existing sage-green two-seater sofa. Preserve the refined hand-painted cartoon style, fine pencil outlines, woven sage fabric, cream cushions, piping, understated brass feet and soft light.
Change its perspective ONLY: turn the sofa to face directly toward the viewer with zero left/right yaw or floor-plane rotation. Make the long top and front seat edges horizontally level across the canvas, with symmetric left and right arms. The camera is centred slightly above eye level, tilted down approximately 25 degrees, so both seat cushions are clearly visible from above and face the viewer, ready for characters to sit naturally. The sofa should be two-person width, centred, complete, and framed in a landscape image.
No people, text, logos, room or floor. Actual transparent alpha background, no coloured haze, halo, glow or opaque rectangular shadow. Preserve the reference's material colours and hand-painted texture; do not retain the original diagonal three-quarter yaw.
```

### 0.5.0: three-seat sofa (placeholder) and equal widths

The relay scene now seats up to three waiting agents per sofa (one sofa per waiting stage), so `studio-sofa.png` must show three seats. Until a newly painted three-seat sofa is supplied, the file is a **placeholder** spliced from the 0.3.1 two-seat painting: a pillow-free centre cushion (source columns 770–1030 followed by 510–770) was inserted at the centre seam, giving 2056×1024 pixels with an opaque extent of x 43–2013. No pixels were repainted. Default mode draws its three-seat sofa and three-workstation desk as inline SVG in `src/ui/figures.tsx` (`Sofa()`, `Workstation()`), so it needs no image.

Desk and sofa are displayed at the same visible width (`FURNITURE_WIDTH` = 264 CSS px). Because the paintings carry transparent margins, `figures.tsx` scales each `<img>` by its measured ratio of image width to opaque width (`DESK_VISIBLE_RATIO` = 1619/1519, `SOFA_VISIBLE_RATIO` = 2056/1971). Seats and workstations sit at 22 %, 50 % and 78 % of that width (`SLOT_FRACTIONS`).

Scenes fill the relay row: the desk scene and each sofa scene share the row's width (`flex: 1 1 296px`), while the furniture keeps its size and stays centred. Vertically, each drawing's visible part is centred in the 176 px scene (bottom = (176 − visible height) / 2 − transparent bottom margin), leaving the band below the desk for working agents to walk in; seated agents move with the cushions.

Replacement brief for the three-seat painting: same hand-painted style, fine pencil outlines, woven sage fabric, cream piped cushions and brass feet as the current sofa; facing straight forward from a slightly elevated camera with level seat edges; **three equal seat cushions** whose centres fall near 22 %, 50 % and 78 % of the sofa's width; landscape canvas around 2:1; real transparent alpha with no haze or opaque shadow; tightly framed. After replacing the file, update its `bytes`, `sha256` and `changes` in `assets/manifest.json` (`npm run check:assets` fails otherwise) and re-measure `SOFA_VISIBLE_RATIO`.

Environment artwork is offered under CC BY 4.0 to the extent rights are held; credit HAICoMo contributors and identify changes. Character and brand rights remain separate.

## Public screenshots

`scripts/create-demo.ts` creates an isolated synthetic project with 10 parent tasks, 50 subtasks, multiple model assignments, dependencies, proposals and a paused relay. No real conversations, credentials, deliverables or private project records are included. `tests/e2e/v031.spec.ts` captures the running Electron application in both presentation modes; it waits for the office renderer and images before capture. Retained UI screenshots are in `docs/images/0.3.2/`. The 0.3.3 relay scene is captured by `tests/e2e/readme-relay.spec.ts` using a held synthetic Claude CLI run and a paused ChatGPT relay, then reviewed before copying into `docs/images/0.3.3/`. No real model account is used.

Company and product marks are MIT-licensed LobeHub SVGs with retained attribution (CodeBuddy uses the colour variant so it stays visible in `<img>` tags). The WorkBuddy mark is the official desktop application icon, converted unmodified to PNG and recorded in the manifest as a third-party trademark. Neither these marks nor the characters imply provider endorsement.
