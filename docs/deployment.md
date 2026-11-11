# Official deployment

1. Create an Ubuntu 24.04 Incus container named `vuyorin` on fwerkor85, with independent CPU/memory limits and a stable Incus DNS name.
2. Install Node.js 22 LTS and deploy the tagged repository under `/opt/vuyorin`; `npm ci && npm run build`.
3. Configure the systemd unit in `deploy/vuyorin.service`, copy `.env.example` to an untracked `/etc/vuyorin.env` and set the public URL, issuer and registered client ID.
4. Register an Auctor OAuth web application `vuyorin-web` with redirect `https://vuyorin.fwerkor.com/auth/callback`.
5. Add NPM reverse proxy `vuyorin.fwerkor.com` -> `http://vuyorin.incus:3000`; enable websocket support, force SSL, HTTP/2, and use wildcard fwerkor.com certificate.
6. Verify `/api/health`, OAuth redirect/callback, multiplayer connections and browser render. Never expose the container's port 3000 directly to the Internet.
