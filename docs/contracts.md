# Contracts

Music generation must never block the reader. Each module below owns one
job and can be swapped without touching the others. Import direction is
`core <- server` and `core <- app`. Server and client components never
import each other. `app/page.tsx` may import `server/books.ts`. Client
files never do.

Details live in these files:

- [Book data](contracts/book-data.md)
- [Scene reader](contracts/scene-reader.md)
- [Music library](contracts/music-library.md)
- [Selection](contracts/selection.md)
- [Next track and style change](contracts/next-track-and-style-change.md)
- [Playlist mode](contracts/playlist-mode.md)
- [Similarity and config](contracts/similarity-and-config.md)
- [Music session](contracts/music-session.md)
- [Selection scheduler](contracts/selection-scheduler.md)
- [Player](contracts/player.md)
- [Image api](contracts/image-api.md)
- [Picture vault and style pref](contracts/picture-vault-and-style-pref.md)
- [Chat api](contracts/chat-api.md)
- [Quotas and budget](contracts/quotas-and-budget.md)
- [Chapter panels](contracts/chapter-panels.md)
