# Fill Line design package

Start with [the complete design handoff](design-handoff.md). It defines the screens, state transitions, colors, geometry, input behavior, difficulty and animation timing.

- [Asset sheet](index.html): open in a browser for the supplied glass/water composition, palette, button feedback and material layers. It is a design reference, not a playable game.
- [CSS tokens](tokens.css): ready to import into implementation styles.
- [SVG assets](assets/): nine editable vector sources, including separate front/rear glass layers and an icon sprite.
- [Progress log](progress.md): decisions, delivered work and validation status.

Everything is local; the sheet has no network dependencies. Typography uses system fallbacks until the two specified font families are bundled. The handoff includes source links and packaging instructions.

Run the source checks from the workspace root with `python docs/check-assets.py`. They cover SVG parsing, asset/token references, four text contrast pairs and target bounds. They passed; browser visual review and physical-device performance remain unverified because no browser connection was available.
