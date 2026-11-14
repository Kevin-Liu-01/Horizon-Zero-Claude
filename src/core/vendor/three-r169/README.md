# three r169 post passes, kept at r169 (M0.7)

Copied unchanged from three 0.169.0 (`examples/jsm/`, MIT, see `LICENSE`), except that `Pass.js` and
`SimplexNoise.js` are imported from the installed three (their code did not change between r169 and r187), and that in the comment block of `shaders/GTAOShader.js` one reference URL is dropped and one algorithm is named by its initials (both titles trip the Tier 0 name lint).

| file | why it stays at r169 |
|---|---|
| `postprocessing/UnrealBloomPass.js`, `shaders/LuminosityHighPassShader.js`, `shaders/CopyShader.js` | the engine replaces `render()` (the bloom fold into the grade), patches the high pass and the composite, and swaps the blur weights (`_bloomFold`). r187 rewrote the blur (paired taps, sigma = R/3, kernels 6-22) and the composite's alpha, so the look would move with the version |
| `postprocessing/GTAOPass.js`, `shaders/GTAOShader.js`, `shaders/PoissonDenoiseShader.js` | the engine patches the GTAO fragment shader on four anchors, replaces the denoise noise and `render()`; r187 renamed the internals it reads |
| `postprocessing/SMAAPass.js`, `shaders/SMAAShader.js` | the engine re-types `edgesRT` / `weightsRT` (RGBA8 at `high`); r187 made them private and dropped the size arguments |

Plan v2 asks the upgrade to change the frame only in shadow softness and environment light. Moving these passes to
the r187 versions is a look change with its own before and after; it is a backlog item, not part of the engine bump.
