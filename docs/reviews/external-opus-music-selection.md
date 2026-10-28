External advisory input from Claude Opus 5.5 on music selection; no code in this repo was written by Opus.

I don't recommend any normalization step. Keep the Jev distribution as it is and match with the Bhattacharyya coefficient instead of plain cosine, with intensity and tempo as their own weighted terms. The bigger problems are elsewhere: about a third of the scenes have a differently shaped vector, which shows up as whole tracks, and a margin alone won't stop the music from switching.

I didn't change anything in the repo. The numbers below come from read-only scripts I ran on `analysis.json` and `music-clusters.json`.

**What the pipeline does today.** Your recollection is right. `pipeline/jev.ts` sends one `choice` question over the 8 ids plus `unknown`. It stores the probabilities, which sum to 1, and scores intensity and tempo separately on a 5-level scale. Scenes with confidence under 0.6 go to the Muse override, which writes a new 8-way mix: that's 45 of 133 scenes (33.8%). There is no matcher or hysteresis code yet.

## 1. Normalization

- **No min-max.** It stretches a flat, ambiguous scene until it looks peaky, which throws away the very signal that it's ambiguous.
- **No softmax.** Applied to values already between 0 and 1, it squashes everything toward uniform: the largest possible ratio between two entries becomes about 2.7.
- **L2 changes nothing.** Cosine already does it.
- **Raw dot product.** It favors whichever track is peakiest.

Plain cosine on probabilities squares the entries, so the top emotion dominates the score. A blended scene (aventura 0.48, asombro 0.38) then loses to a peaky single-mood track. Taking the square root first fixes that. The square-root vectors already have unit length, so their cosine equals the Bhattacharyya coefficient: bounded to 0..1, symmetric, and fair to blends. It is the 1 − Hellinger² affinity, close to Jensen-Shannon but cheaper and easier to read.

Recommended formula:

```
E(s,t)     = Σ_k sqrt(s_k · t_k)
score(s,t) = 0.70·E + 0.15·(1 − |I_s − I_t|) + 0.15·(1 − |T_s − T_t|)
```

- **Intensity and tempo:** keep them as separate terms. Don't fold them into the vector's length, because cosine discards length anyway. Don't gate on them either, since there are too few tracks per intensity level.
- **Sharpening:** skip it. The square root is already a gentle flattening, and Jev's own vectors are sharp: the median top value is 0.86.
- **The `unknown` dimension:** its mass is about 0.00 to 0.01 in this data. Dropping it and renormalizing, as the code does now, is fine.
- **If you move to independent scores** (section 2), the length now means something: all-low scores describe a neutral scene. In that case use the shape `s/Σs` in E, and send scenes whose top score is below about 0.3 to the calmest track.

## 2. One choice question vs independent per-emotion scores

I'd use independent scores, but only after a spike on about 15 scenes. Since the product rule says "full Jev probability vector", this is your call.

Reasons:
- A choice question is winner-take-all by design. That is why the spike's Kalidahs chase scored combate at exactly 0.000. Independent scores would give combate partial credit.
- In the current data, low confidence mostly means "this scene is a blend". The choice question treats that as uncertainty and pays a Muse call to rebuild the blend. Independent scores capture the blend directly.
- Cost stays flat: 8 more questions in the same request, about 100 ms, with output tokens free.

Risk: independent scorers tend to drift toward the middle of the scale. Correct each emotion against its own baseline across the book (subtract the book median, then clip at 0) before computing the shape.

If you keep the choice question, the next item in the list below matters even more.

## 3. Other concerns, ranked

1. **Two vector shapes from two sources.** Jev-only vectors have a median top value of 0.86; Muse overrides have 0.48. The clustering sorts by source as much as by mood:
   - Tracks t02, t06, t08 and t12 are made entirely of override scenes, and t03 is 10 of 11.
   - So roughly 4 or 5 of the 15 tracks are really "mixed-up scenes", not moods.
   - Fix: tell the override to keep the top emotion at 0.5 or above unless the scene truly mixes moods, or switch to independent scores.
2. **A margin alone barely reduces switching.** I simulated the current 15 centroids with per-scene argmax:

   | Margin | Track changes (of 132 boundaries) |
   | --- | --- |
   | 0 | 113 |
   | 0.10 | about 101 to 105 |
   | 0.15 | about 96 to 100 |

   Adjacent scenes really do differ, so the answer is a minimum dwell measured in reading time, not a bigger margin. See section 4.
3. **Tiny clusters.** t08 and t12 cover 2 scenes each, so two tracks would be generated for 4 scenes. Use k = 12 to 13, require at least 4 scenes per cluster, and merge the leftovers. That frees a slot for a deliberately designed "neutral or transition" track. Today the low-mood case falls to t02, a mush with every emotion near 0.15.
4. **Clustering and matching disagree.** k-means uses squared distance, while matching would use cosine or Bhattacharyya. 7 scenes land on a different track than their own cluster. Fit the clusters with the same measure you match with, or at least check the gap.
5. **Centroid tracks vs designed tracks.** Centroids are fine for prompts, but after generation, re-label each track's vector by listening, or by running Jev or Muse on a description of the music. MusicGen won't hit the centroid exactly. Then match against what each track actually sounds like.
6. **Similar emotions.** In the final vectors, suspenso, misterio and combate barely correlate, because the choice question forces exclusive answers. Sharpen the descriptions. For example, make combate "physical clash or chase with a threat", and define suspenso as "threat not yet acting".
7. **Evaluation.** Hand-label 25 scenes, chosen across chapters and across both sources, with the best track and an acceptable set. Report:
   - top-1 and top-3 accuracy,
   - how often the pick is in the acceptable set,
   - switches per hour of reading.

   Compare cosine with Bhattacharyya, and choice with scores, on that set. Use two labelers if possible.
8. **Determinism.** The matcher should be pure and run on frozen vectors with fixed tie-breaks: lower track id wins. The Muse override isn't deterministic, so treat `analysis.json` as frozen per `textVersion`. It already is.
9. **Crossfades.** Use an equal-power crossfade. Start it once the new scene is the reading position (its first paragraph is at the top) and has stayed there for the dwell time. If the reader scrolls fast, don't stack fades: aim for the newest target and drop any pending ones.

## 4. Suggested defaults

| Parameter | Value |
| --- | --- |
| Weights | emotion 0.70, intensity 0.15, tempo 0.15 |
| Switch margin | 0.06 to 0.08. That's about the 25th percentile of the gap between the best and second-best track (0.057), so it only filters near-ties. |
| Minimum dwell before switching | 20 s of the reading position sitting on the new scene. Scenes median 8 paragraphs, so this catches skimming. |
| Minimum time on a track | 45 s, unless the new score beats the current by 0.20 or more (a hard mood cut such as a fight starting) |
| Crossfade | 3 s normally, 1.5 s for hard cuts; respect reduced-motion only for visuals, not audio |
| Skip | Show the next 2 tracks by score; keep the reader's override until the next scene, as specified |
| Neutral fallback | Top score below 0.3 (scores mode) or Bhattacharyya below 0.6 (current mode): use the calm or transition track |

I did not hear any audio, test independent scores against Jev, or run your clustering again with these changes. The weights and margins are starting points to tune against the 25-scene labeled set. The main risk is that about a third of your tracks are shaped by how the override writes vectors rather than by mood; fix that before generating anything on Modal.
