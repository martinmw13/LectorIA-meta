# Spikes, 2026-10-27

Throwaway scripts in `scripts/spikes/` (built-in fetch only, no SDK). Each script ran once. Image script ran exactly once and made 2 of its 3 capped images.

## Image generation (`meta-image.mjs`)

Prompt: cyclone farmhouse scene in Denslow 1900 style, silver shoes, no MGM look. `muse-image-1.0`, `n: 1`, `size: 1024x1024`, `output_format: webp`.

| Call | Status | Latency | Bytes | Dims | Usage in/out |
| --- | --- | --- | --- | --- | --- |
| (a) `response_format: url` | 200 | 31.5 s | 982152 | 1600x1600 VP8X | 31245 / 2459 |
| (b) `response_format: b64_json` | 200 | 40.2 s | 1047860 | 1600x1600 VP8X | 42495 / 3427 |
| (c) b64 plus low reasoning, search and shell off | 503 | 8.5 s | none | none | none |

Response keys were `created, data, output_format, background, usage`. URL host was `scontent.xx.fbcdn.net` with 8 query params but no expiry or signature param under a recognizable name. Both images saved to `scripts/spikes/out/`. No content policy block. The 503 body said the service was temporarily unavailable, so (c) gave no data on whether low reasoning is faster.

What this means: prefer `b64_json` for the app, since images are stored in Vercel Blob at deterministic paths and routes return Blob URLs. A provider URL is temporary and host controlled, so it cannot serve as the stored copy. Budget about 30 to 40 s for one Picture this generation, which is far too slow to run inline with a tap, so generate in the background and show a placeholder. The `size` value sets only aspect ratio: both files came back 1600x1600, not 1024x1024. The Denslow guard was inspected on both images: Art Nouveau floral border and bold ink outlines, a flatter limited palette closer to modern ink and wash than Denslow's flat poster color. Dorothy in blue and white gingham holds a dark Toto inside the tilting house, cyclone and gray prairie outside. Shoes are light gray or silver: no ruby slippers, no film look.

Surprise: the two full reasoning calls each burned 30k plus input tokens of built in search grounding, free of extra charge but slow. The low reasoning call that would have tested the faster path failed server side. Also, both images added an unprompted caption line at the bottom, so the production prompt must say "no text, no captions, no lettering".

## Structured scene split (`meta-structured.mjs`)

Input: 8 numbered paragraphs (cyclone 1 to 2, Kalidahs 3 to 5, poppy 6 to 8). Model `muse-spark-1.3-contributor`, strict JSON schema with all fields required and no extra properties.

| Run | Status | Latency | Parse | Schema valid | Coverage | Evidence verbatim | Prompt / completion tokens | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 200 | 12.6 s | yes | yes | full, no gaps | yes | 547 / 1807 | $0.000416 |
| 2 | 200 | 12.3 s | yes | yes | full, no gaps | yes | 547 / 1760 | $0.000407 |
| 3 | 200 | 12.2 s | yes | yes | full, no gaps | yes | 547 / 2088 | $0.000472 |

Reasoning tokens were 1567 to 1896 of each completion total. Cached tokens were 0 each run. A fourth request with a recursive `$ref` schema returned 400 with "Recursive JSON schemas are not currently supported", matching the docs.

What this means: strict mode works as documented and every run covered all 8 ordinals with verbatim quotes, so the schema plus coverage check is a usable pipeline shape. But each run returned exactly 3 scenes, one per passage, which suggests the model follows passage breaks more than story beats. Shorter input chunks may be needed for real scenes. Cost is about $0.0004 per split at Contributor rates.

Surprise: output is dominated by reasoning tokens (about 85 percent of completion), so cost and latency come from thinking, not from the JSON itself.

## Jev emotion vectors (`jev.mjs`)

Model `jev-1.14.0`, one request per passage, choice over the 8 ids plus 5 level intensity and tempo scores.

| Passage | Latency | Choice (conf) | Intensity (conf) | Tempo (conf) | In/out tokens |
| --- | --- | --- | --- | --- | --- |
| cyclone | 132 ms | aventura 0.41 | 2.15, norm 0.54 (0.59) | 1.21, norm 0.30 (0.76) | 749 / 116 |
| Kalidahs | 78 ms | suspenso 1.00 | 2.89, norm 0.72 (0.91) | 3.03, norm 0.76 (0.93) | 794 / 117 |
| poppy field | 103 ms | suspenso 0.95 | 2.08, norm 0.52 (0.66) | 1.52, norm 0.38 (0.52) | 848 / 117 |

Every response returned model `jev-1.14.0`, all 8 ids with probabilities summing to 1.000, and no `unknown` choice. Full vectors below come from the run's printed output.

| Passage | calma | alegria | tristeza | suspenso | misterio | aventura | combate | asombro |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cyclone | 0.000 | 0.000 | 0.000 | 0.070 | 0.070 | 0.480 | 0.000 | 0.380 |
| kalidahs | 0.000 | 0.000 | 0.000 | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| poppy field | 0.010 | 0.000 | 0.000 | 0.950 | 0.010 | 0.030 | 0.000 | 0.000 |

Scores are fractional on the 0 to 4 scale (for example intensity 2.15), an expected value over the 5 levels, not an integer level.

What this means: the vectors look usable as track selectors. Kalidahs is sharp (suspenso 1.00, high tempo), poppy is drowsy threat (suspenso 0.95, low tempo), cyclone split aventura 0.48 and asombro 0.38 at low confidence 0.41. That low confidence case is exactly what the Muse override is for, so the override will trigger on real data, not just in theory.

Surprise: latency is about 100 ms per call, so Jev can run live at scene boundaries with no caching worry. Jev prices `jev-1.14.0` at $0.042 per 1M input tokens with output tokens free, so the 2391 measured input tokens (749 + 794 + 848) cost about $0.000100. Surprise: the Kalidahs attack scored combate 0.000 and suspenso 1.000, so Jev reads a chase with a threat as suspense, not combat; the criteria descriptions for combate and suspenso may need sharpening before the pipeline relies on them.

## Total spend

Images: 2 at $0.01 each = $0.02. Structured: $0.001295. Jev: about $0.000100. Total measured: about $0.0214.
