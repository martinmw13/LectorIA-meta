# 64: style switcher stamp

The app has six skins but no switcher except `?skin=` in the URL. Add one
shared `<StyleStamp>` ex-libris button: large with a skin-name ring on the
home page, small next to the theme button in the reader top line.

Clicks cycle through `cycleSkin()` in `app/skin.ts`, which persists the
choice to `lectoria.skin`; a status pill confirms the new style for 1.8 s.
Faces and ring text are per-skin CSS in `app/style-stamp.css`, keyed on
`html[data-skin]`. Fonts and accent come from the existing tokens; no new
font loads.
