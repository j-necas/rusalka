# Third-party libraries

| library | used for | licence |
|---|---|---|
| [Verovio](https://www.verovio.org) (`static/vendor/verovio-toolkit-wasm.js`, npm `verovio`; also installed by the skill) | drawing the score, note timing; pictures of sheet music in the skill | LGPL-3.0-only |
| [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) (`static/vendor/fonts`, npm `@fontsource/atkinson-hyperlegible-next`) | the app's typeface | SIL OFL 1.1 |
| [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm (`static/sounds/piano`, the subset published by [Tone.js](https://tonejs.github.io/audio/salamander/)) | the piano sound | CC BY 3.0 |
| [GoatCounter](https://www.goatcounter.com) `count.js` (`static/goatcounter/count.js`, the official file from https://gc.zgo.at/count.js, unmodified) | the anonymous visit counter of the published website | ISC (stated in the file's header) |
| [@xmldom/xmldom](https://github.com/xmldom/xmldom) (tests, skill) | DOMParser in Node | MIT |
| [resvg-js](https://github.com/thx/resvg-js) (skill only, npm `@resvg/resvg-js`) | pictures of sheet music for checking, reading images | MPL-2.0 |

Verovio is licensed under LGPL-3.0 (licence text: [LICENSES/LGPL-3.0.txt](LICENSES/LGPL-3.0.txt), which refers to
[LICENSES/GPL-3.0.txt](LICENSES/GPL-3.0.txt)). The app uses it as a separate, unmodified file that can be replaced
with another version (`npm install verovio@… && npm run vendor`); the skill installs it from npm on first use. Verovio's source
code is at https://github.com/rism-digital/verovio. The Leipzig/Bravura music font inside Verovio is licensed under
the SIL Open Font License 1.1.

The animal pictures (`static/animals/`) were drawn for this project with an image generation tool from the
project's own prompts and are part of the project.
