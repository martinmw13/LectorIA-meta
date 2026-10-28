## Picture vault and style pref

The pane shows the scene picture behind a `Picture this scene` pill on
a paper-grain placeholder (`Sketching…` while loading, retry on
error). The image fills the pane, expands on a 250 ms hover (max 72vw
by 78vh), and opens the shared lightbox on click. `Picture this` pops
8 px above a 3+ char selection and inserts one figure after the
selection end paragraph (`pickEndN` over ordinals), captioned with the
selected text. Figures persist per scene in client memory, one request
at a time. The vault lists the scene picture first, then figures in
text order, each with jump-to-figure pulse and expand; the style picker
below stores `{ kind: "preset", id } | { kind: "custom", text }` in
`lectoria.imageStyle`. `requestStyleFields` returns `{}` for Denslow
and `{ style: { preset } }` or `{ style: { custom } }` otherwise;
request bodies spread it; the credit is the preset label or the custom
text. The developer view (Shift+D or `?dev`, hidden otherwise) shows emotion
bars, intensity, tempo, and track from data the reader holds. Theme
persists in `lectoria.theme`; fonts are Newsreader and Instrument Sans
via `next/font/google`.

