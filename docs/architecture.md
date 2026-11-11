# VUYORIN Architecture (v0.1)

## Goals
One URL opens a real-time multiplayer, GPU-rendered world. Native browser client, no installer or UE5, OIDC-only login with the existing Auctor provider, progressive deployment in an Incus LXC behind Nginx Proxy Manager.

## Boundaries
- **Browser:** Three.js/WebGL 2; custom deterministic procedural terrain, water and weather shaders; chunked geometry and instanced objects; responsive UI; local prediction and interpolation.
- **Server:** single Node.js/TypeScript HTTP+WebSocket process. HTTP serves immutable Vite output, API and OAuth endpoints; WS upgrade validates session and Origin. Server validates and integrates movement and sends proximity snapshots.
- **Authentication:** Authorization Code + PKCE (S256), random state and nonce; verifies RS256 ID token with provider JWKS (issuer/audience/nonce); opaque, HttpOnly, Secure, SameSite=Lax session cookie; WS shares same session, no query tokens. Sessions are in-memory until durable storage is implemented.
- **World:** shared terrainHeight(x,z) deterministic, geographically bounded initial region; spawn at the harbor, dynamic sky and ocean. World state is server-authoritative. 20 Hz simulation, 10 Hz snapshots; limited interest range.
- **Deployment:** Incus LXC `vuyorin` on fwerkor85; service listens on 0.0.0.0:3000 inside container; NPM forwards `vuyorin.fwerkor.com` with WebSocket upgrade and wildcard certificate; explicit callback URI `https://vuyorin.fwerkor.com/auth/callback` registered with Auctor.

## Message protocol
JSON with explicit `type`: client input (sequence, movement intent and yaw), server welcome, snapshot, presence, error. Strict limits on frames and movement. No client-provided identity or position authority.

## Next milestones
Persistent world states/accounts via PostgreSQL; regional partitioning and transfer; moderation and chat; adaptive streaming LOD; more sophisticated physics; anti-cheat and load testing.

## Security and licensing
Do not commit credentials or third-party proprietary shaders. The supplied 几猫 HTML is used as a visual reference only; **no code is copied** pending license verification. MIT applies to new project code.
