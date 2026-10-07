# Public artwork — 0.3.1

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

Environment artwork is offered under CC BY 4.0 to the extent rights are held; credit HAICoMo contributors and identify changes. Character and brand rights remain separate.

## Public screenshots

`scripts/create-demo.ts` creates an isolated synthetic project with 10 parent tasks, 50 subtasks, multiple model assignments, dependencies, proposals and a paused relay. No real conversations, credentials, deliverables or private project records are included. `tests/e2e/v031.spec.ts` captures the running Electron application in both presentation modes; it waits for the office renderer and images before capture. Screenshots are stored in `docs/images/0.3.1/` after review.

Company and product marks are MIT-licensed LobeHub SVGs with retained attribution. The WorkBuddy W is a generic authored badge. Neither these marks nor the characters imply provider endorsement.
