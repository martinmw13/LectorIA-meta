## Next track and style change

`nextTrack` cycles same-emotion tracks in score order across the whole
style, wrapping and skipping the current, then the best same-style track
overall when the emotion is missing. A null scene cycles the style set
in id order. One track or none gives null.

`requestStyleChange` picks the best match for the scene in the new style
by score. It never crosses styles. The scheduler applies it at once
with the normal crossfade and holds the choice like a Next. There is no
mix toggle and no soundtrack-change button.

