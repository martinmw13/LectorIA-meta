import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TRAILER, isMuse, parseLog, render } from "./muse-stats.mjs";

const commit = (sha, author, message, numstat) => `\0${sha}\x1f${author}\x1f2026-10-28\x1f${message}\x1e\n${numstat}\n`;

describe("muse-stats", () => {
  it("counts the trailer and skips rescue commits", () => {
    assert.equal(isMuse(`Add x\n\n${TRAILER}\n`), true);
    assert.equal(isMuse(`Rescue: fix y\n\n${TRAILER}\n`), false);
    assert.equal(isMuse("Add z\n"), false);
  });

  it("tallies lines per scope and ignores the stats bot", () => {
    const log =
      commit("a", "dev", `Add core\n\n${TRAILER}`, "10\t2\tcore/a.ts\n5\t0\tagent-logs/01.jsonl\n-\t-\tpublic/x.png") +
      commit("b", "dev", "Fix\n\nRescue: Grok Bot", "1\t1\tapp/b.tsx") +
      commit("c", "github-actions[bot]", "Update docs/MUSE.md", "3\t3\tdocs/MUSE.md");
    const md = render({ commits: parseLog(log), prs: [{ number: 7, title: "A | B", merged: "2026-10-28", commits: 2, museCommits: 1 }] });
    assert.match(md, /Muse commits: 1 of 2 non-merge commits \(50%\)/);
    assert.match(md, /\| Source code .* \| 10 \| 2 \| 1 \| 1 \| 91% \|/);
    assert.match(md, /\| All files \| 15 \| 2 \| 1 \| 1 \| 94% \|/);
    assert.match(md, /\[#7\]\(https:\/\/github.com\/martinmw13\/LectorIA-meta\/pull\/7\) \| A \\\| B \|/);
  });
});
