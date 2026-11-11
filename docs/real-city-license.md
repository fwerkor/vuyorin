# PLATEAU real-city pilot · attribution and provenance

**Map source:** Project PLATEAU, Ministry of Land, Infrastructure, Transport
and Tourism (MLIT), 2020 3D city model for Yokohama City, copyright of the
Yokohama local government.

**Conversion:** CodePawl, `plateau-city-glb`, tile
`yokohama-53391550`. The raw data was processed by CodePawl: buildings
kept in mesh cells, roads draped on terrain, façade textures packed,
coordinates shifted to local metres, WebP/meshopt compression, and collision
layers. VUYORIN further repacks the collision geometry for Rapier and embeds
the pilot into a discrete test world. This modified copy is not endorsed by
the data owners.

**License:** [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Redistribution, modification and commercial use are permitted with attribution.

Primary source: https://www.mlit.go.jp/plateau/open-data/
Processed dataset: https://huggingface.co/datasets/codepawl/plateau-city-glb
Dataset record: https://huggingface.co/datasets/codepawl/plateau-city-glb/blob/main/README.md

The importer pins SHA256 hashes for both original GLBs and fails closed on
unexpected downloaded bytes. Code and synthetic world assets retain their
separate MIT/CC0 terms. The real-city world is a geographically distinct pilot,
not a substitute for the original harbor until its terrain traversal,
performance and multiplayer interactions are validated.
