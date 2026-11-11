# VUYORIN World Streaming v1

## World ownership and authorship

All playable map content is **pre-baked before deployment**, versioned, and bounded.

- World v1 covers `-1968..1968 m` on each horizontal axis, about **3.936 × 3.936 km** (15.49 km²).
- Terrain tiles are **96 × 96 m**; 41 × 41 = **1,681** immutable tiles.
- The world is authored from deterministic elevation/biome functions and a checked-in static city plan (`shared/city-layout.v1.ts`). No runtime client-side world generation is required.
- Each tile contains high-resolution 33 × 33 heights, RGB ground colors, and placed trees/rocks, serialized in a compact binary format.
- Buildings, roads, street furniture, the harbor, foliage and rock meshes are instantiated *from the authored world* for the requested LOD. Procedural mesh construction is distinct from online map generation.
- The server enforces the same strict world bounds and uses matching deterministic terrain/obstacle definitions for collision. A later version can replace the analytic server collision with baked signed-distance/heightfield caches, particularly for hand-sculpted regions.

## Bake once, stream as needed

```sh
npm ci
npm run bake:world
npm run typecheck
npm test
npm run build
npm start
```

The baker writes `client/public/world/v1/manifest.json` and `client/public/world/v1/{cx}_{cz}.bin`, then Vite copies them to `dist/world/v1/`. Generated map assets are intentionally excluded from the Git source tree, keeping commits reviewable. Release archives **must contain** the built `dist/world/v1/` folder.

Production clients request `/world/v1/{cx}_{cz}.bin` over normal HTTPS; the browser caches tiles. The terrain worker decodes and resamples each baked heightfield for different LODs. No player can influence map generation or terrain shape.

Never silently alter already published `v1` tiles; create `v2` assets and update the client when the map is revised. This is important because tile URLs are immutable and long-lived.

## Three-ring streaming

- **Near (0–2 tiles, about 192 m):** full-res terrain, detailed facades, plants, rocks and street features.
- **Middle (2–5 tiles, about 480 m):** downsampled terrain and less-detailed architecture and plants.
- **Far (5–9 tiles, about 864 m):** silhouette terrain and massing only.

Only three tile fetches are active at a time. A single worker decodes binary payloads off the render thread. On unloading a chunk, all tile-specific geometry and instance buffers are disposed. The scene keeps a bounded set of tiles, regardless of map area.

## City source and expansion

The v1 harbor-city sits immediately inland of the starting port. `shared/city-layout.v1.ts` contains 95 fixed building footprints, heights and architectural styles in a grid of walkable streets. Client shaders and mesh instancing add shops, window bays, roof hardware, sidewalks, pedestrian crossings and street lights.

To customize city footprints, edit the static layout and rebake a new world version. To author more realistic districts, replace selected tile outputs with DCC-built glTF geometry and baked texture assets. The same tile/LOD system can stream those replacement models without changing the networking architecture.

## Limitations

This is a pre-generated, **bounded experimental world**, not a photogrammetry AAA city. Assets use original procedural meshes/materials, not imported commercial art. Current collision is simplified (AABBs for buildings/port props and cylinder-like approximations for trees/rocks). Rails/roads and cars remain future features. Natural boundaries, navmesh, climb animations, swimming, collision on all street furniture and seamless server-scaled multiplayer are not complete.

## CC0 prebuilt urban assets (interim upgrade)

The first commercial-quality authored city facades use Quaternius *Downtown City MegaKit* (May 2026, CC0), with three glTF buildings optimized to WebP by anshaneja5/skyline-run and verified by pinned SHA256. The default source checkout does not store these binary models; execute `npm run assets:fetch` and then `npm run build`. This downloads only 5.3 MiB in total and includes it in the deployed release, with no runtime dependency on GitHub. Building geometry is scaled to its authoritative physical AABB.

Source: https://quaternius.com/packs/downtowncitymegakit.html ; optimized package: https://github.com/anshaneja5/skyline-run (CC0 models).

This first replacement does **not** constitute a complete high-resolution city map. Two credible full-city open-data baselines have been identified for a later, collision-aware map transition:
- Helsinki official photogrammetric 3D Mesh and CityGML urban model (CC BY 4.0, with attribution): https://www.hel.fi/en/decision-making/information-on-helsinki/maps-and-geospatial-data/helsinki-3d
- Japan MLIT Project PLATEAU, with pretrained web-ready ~1 km glTF city tiles and collision meshes from https://huggingface.co/datasets/codepawl/plateau-city-glb (CC BY 4.0, source credit and modification notice required).

They must be imported together with their road/height and collision meshes before replacing the authoritative world. Rendering their geometry without matching physics would recreate the container/guardrail bug.

## Physics and visual parity (0.2)

- `shared/harbor.ts` defines every port crate, guardrail, crane structure, pole and gantry; the same data creates Three.js meshes and Rapier colliders. Walkway flooring is deliberately nonsolid because ground height handles it.
- `shared/city-furniture.ts` defines lampposts, parking bins, park items and decorations; solid shapes become Rapier boxes. City buildings are static cuboids using the same layout footprints.
- `shared/physics.ts` contains the authoritative kinematic capsule controller used for both the 20Hz server and client prediction. The controller sweeps and slides rather than rejecting any movement toward an obstacle. Vegetation colliders are loaded only near active actors. The terrain is still height-based; it will be converted to signed local collision tiles when real-city assets replace the synthetic world.
- An SMAA post-process pass runs before output mapping to remove jagged edges while retaining HDR bloom. Road markings are raised above asphalt, and asphalt above sidewalk to eliminate overlapping depth surfaces. The reticle is invisible when no other player is nearby and centered in the view.
