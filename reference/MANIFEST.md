# reference/ — licence-clean reference images (never shipped)

Owner: gates-perf (plan §2; top-level file). Every visual gate is judged by an R29 judge against a licence-clean
reference that a lane keeps under `reference/r5/<lane>/` with its own `MANIFEST.md` (plan §10.2 item 4):

- **stored** rows: PD, CC0-1.0, CC-BY-x.y (with the exact attribution string) or own photo; each row names the
  file, the gates it serves, the author, the licence, the source URL, the retrieved date and the file's sha256;
- **URL-only** rows: share-alike or unclear sources, recorded as a link and never stored;
- nothing from Horizon / Sony / Guerrilla / Epic / Fortnite, no ripped or fan material (plan §0 rule 9).

Fetch and verify with `tools/r5-refs/fetch.mjs` (Wikimedia Commons API, filtered to PD / CC0 / CC BY; `--verify` is
offline). Gates: `A-reference-clean`, `A-reference-set` (`tools/gates/gates-perf.w0b.mjs`).

## Lane folders

| folder | rows | serves |
|---|---|---|
| `reference/r5/gates-perf/` | 13 stored (11 PD, 1 CC0, 1 CC BY 2.0) | the carried Round-4 visual rows gates-perf re-staged: V1–V4, V12–V14, V21 (R33 c) and the lance slots V46–V49 name |

Other lanes add `reference/r5/<lane>/` (e.g. hero-body's `reference/r5/hero/`) with the same MANIFEST format.

## Deleted at W0b (R30): the Round-4 stills

These 19 files were Guerrilla Games / Sony Interactive Entertainment marketing stills and trailer frames used as
pose references in Rounds 3–4. They were deleted from the working tree at W0b (plan §6). Their sha256 stays here so
`A-reference-clean` can refuse them under any name. **They remain in the repository's git history** (plan §11,
decision 2: a history rewrite or a fresh repository is Kevin's action).

| file | sha256 | bytes | source | deleted |
|---|---|---|---|---|
| `draw-back-2-hud.jpg` | `ecfaf53cc51cf1416897182ef47fa201a9fd87e321ae32ceb5350ba9b5ed13bb` | 197211 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `draw-back.jpg` | `8028b04ad21836970cd2a6659d29f25b3953e25b9460e2e08bfd7addd8c41eca` | 635014 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `draw-front.jpg` | `c53f294578f4e7bd41087f01885e92e6c3ea9918baf12d1849a44666ed6b666f` | 452538 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `draw-side-2.jpg` | `0bc555c9b14d48f8afabad30961fb4e5062f601a964820054e879aa962004837` | 589891 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `draw-side-3.jpg` | `216b75d225aed5068947c1a9338c61bca27c3df4e8813761be501fe469c63e7e` | 219284 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `draw-side.jpg` | `67b888c8d9ef08d340cba811e4429436b568782868e2869ae3c02325f836013d` | 736187 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `run-back-2-walking.jpg` | `4d40353b45f0a68ecfb8931f4b47e447f8ecc98754b94bd6ff1ae03aa2c3e99f` | 1604378 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `run-back.jpg` | `1e5f60fee3380f6ba40df77e9255d2968d5b0b42eb10c95b42af9d31b7942386` | 409884 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `run-front-2.jpg` | `711d53215a91faba350a8fd521a23ffe1e9aa48d25ac1b62b3c31470775a6de3` | 460600 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `run-front.jpg` | `ba6ef84b3acb3da3556b7a4ca86596d41a1f0c2ec9b8f8b501848d901ad03da5` | 573610 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `run-side.jpg` | `03ebe86b0ab7c81720187bbc173dd1e405319a8f729e20899ccd88ce9c778c0a` | 491763 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `spear-grip-closeup.jpg` | `1423efcdb41cc953f16b22910b091aabec60d2979577523f05713fbb897f005f` | 318167 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `spear-holster-back-hfw.jpg` | `d3c18c4ef614540fd296d4673bce1d35158e20ffd622f08701bfd8e3c46e7d4d` | 969188 | Guerrilla Games / Sony Interactive Entertainment (Horizon Forbidden West marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `spear-light-follow.jpg` | `74ab53e539d33940ebab89bfca55582b58b1f35b552bfcfb98ce734bdbe13268` | 419963 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `spear-light-strike.jpg` | `2cf8951b48a47eae054d31f9d578e89c4ffc0c3f2950f6bd9ac262b65c1791d3` | 393941 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `spear-light-windup.jpg` | `df0720ee8a9dcbe1451bd3fc0b0b6ac44699990f165a751bdfd8921fe3ffecfa` | 354921 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `spear-ready-side.jpg` | `03fbbe301df6004899962faacd4c1e94479edd00d045ab6b6b709631577c5678` | 322497 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `spear-sweep-back-hfw.jpg` | `13d4443dd07e7b1ac1a636e63bf5ba006ef96162c03a5f915a92d32c510b6eec` | 365497 | Guerrilla Games / Sony Interactive Entertainment (Horizon Forbidden West marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
| `spear-thrust-front.jpg` | `8fe2190cedab06722f3e5c567398543b67ac700944a94fcbc8860823b9bdd823` | 551006 | Guerrilla Games / Sony Interactive Entertainment (Horizon Zero Dawn marketing still or trailer frame) | 2026-10-19 (gates-perf W0b) |
