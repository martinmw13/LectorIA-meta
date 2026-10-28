## Chat api

Contract only, no routes. Request `{ bookId, textVersion, positionN,
spoilerMode, messages }` carries the chat history and the reader
position. The response is streamed text. The server builds context from
the book text up to `positionN`, or the whole book when `spoilerMode` is
on, with the book prefix first and the question last so readers share
the prompt cache. The system prompt answers only from that text and
refuses the rest. Types live in `core/types.ts`.

