# VUYORIN · 雾曜纪

Browser-native, open-source, multiplayer world exploration. Three.js/WebGL, custom procedural environments, authoritative WebSocket server, and Auctor (account.fwerkor.com) OIDC SSO.

> v0.1 is a playable experimental shared-world vertical slice, not a production-scale MMO.

## Local development

Requirements: Node.js 20+ (Node 18 works for the currently pinned Vite 5 toolchain).

```sh
npm ci
npm run bake:world
cp .env.example .env
# Set PUBLIC_BASE_URL, OIDC_ISSUER, OIDC_CLIENT_ID in .env
npm run dev
```

Open http://localhost:5173. Register http://localhost:3000/auth/callback as an allowed redirect URI for local OIDC testing. The Vite proxy forwards API and WS calls to port 3000. For production, `npm run build && npm start` serves the built site on port 3000.

## Features

- Pre-baked 3.936 × 3.936 km bounded world, 1,681 static map tiles, HTTPS tile streaming and three-tier LOD.
- Fixed, detailed harbor-city layout with multiple architectural styles, mountain/forest biomes and client/server shared collisions.
- Auctor SSO using OIDC Authorization Code + PKCE; login is required to move or connect.
- Multiplayer avatars, server-authoritative movement, client smoothing, proximity snapshots.
- Health endpoint `/api/health`, unit tests and basic deployment documentation.

See [architecture](docs/architecture.md), [world streaming](docs/world-streaming.md), and [deployment](docs/deployment.md).

## License
MIT for original code in this repository. **The external 几猫 HTML and its assets are not redistributed**, because no reuse license has been confirmed.
