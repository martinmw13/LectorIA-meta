# 65: home library port

Port the chosen 05a open-book prototype into `app/page.tsx`: shelf grid
on the left page, the selected book's plate on the right, the ex-libris
style stamp, and the drop zone with Free and Bring-your-own-key picks.
Oz is the only ready book; the other nine show a coming-soon plate.
Skins pencil, comic, and chihiro are new, drawn from their studies.

Swapping final covers in later means editing `app/home/covers.ts`
only: it maps every shelf book and skin to a path, with pencil, comic,
and chihiro reusing the painted sets until theirs exist.

The idle Bring your own key! pick opens the prototype's key field: a
password input with a show/hide eye. The key lives in `UploadSection`
state only, prefills the key step after parsing, and is cleared on Free,
reset, and submit.

Skipped: cover preloading.
