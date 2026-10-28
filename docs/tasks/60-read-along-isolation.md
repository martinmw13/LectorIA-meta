# 60: read-along render isolation

Move `useNarration`, `useReadSync` and `<ReadMark>` out of `BookView` into
`<ReadAlong columnRef={readColRef} />` rendered inside `.read-col`, so the
narration context and the word clock never re-render the book. Pin it with
a render-count test. Also add the missing BUILT_DURING_HACKATHON.md row
for #58.
