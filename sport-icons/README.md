# Sport icons — Studio 3D

Transparent icons (no tile). Place each on a rounded tile in the app.

Files: svg/ (scalable), png-512/, png-128/
Keys: mytv, football, motorsport, golf, cricket, darts, rugby, snooker, specials

## Tile backgrounds (CSS)
Sports: linear-gradient(165deg, oklch(0.975 0.02 H), oklch(0.9 0.055 H))
- football H=255 · motorsport 27 · golf 145 · cricket 60 · rugby 290 · darts 345 · snooker 175 · specials 88

My TV: linear-gradient(165deg, oklch(0.56 0.12 155), oklch(0.42 0.1 155))

## Sizing
Tile 84px, radius 26px, icon 60px (66px when selected, tile lifts 4px).
Selected ring: inset 0 0 0 2px oklch(0.55 0.15 H) (My TV: oklch(0.32 0.09 155)).

## About these copies

Source: the "Icons theme_3D" zip delivered on 18 Oct 2026 (kept outside the repository). The SVGs in this
folder are copies with the embedded `<metadata>` block removed to save about 7 KB per file. That block
was a C2PA "content credentials" manifest, which normally means the pictures were made or edited with an
AI tool. Keep the original zip for provenance, and check the licence and ownership before a commercial
release. The app's tile sizes differ from the spec above: 64 px tile, radius 20 px, icon 72% of the tile.
