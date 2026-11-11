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
