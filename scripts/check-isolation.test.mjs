import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkIsolation, excerpt, normalize } from "./check-isolation.mjs";

const own = "Dorothy lived in the midst of the great Kansas prairies, with Uncle Henry.";
const other = "She was awakened by a shock, so sudden and severe that she was thrown.";

function scenes() {
  return [
    { id: "s1", texts: [own] },
    { id: "s2", texts: [other] },
  ];
}

describe("checkIsolation", () => {
  it("passes when each route carries the whole book", () => {
    const both = `<p>${own}</p><p>${other}</p>`;
    assert.deepEqual(checkIsolation({ scenes: scenes(), readFile: () => both, filesFor: (id) => [`/out/${id}.html`] }), []);
  });

  it("fails when the scene's own text is missing, and on blind scans", () => {
    assert.match(
      checkIsolation({ scenes: scenes(), readFile: () => `<p>${other}</p>`, filesFor: (id) => [`/out/${id}.html`] }).join("\n"),
      /s1: own text missing/,
    );
    assert.match(
      checkIsolation({ scenes: scenes(), readFile: () => "<p>other words entirely here</p>", filesFor: (id) => [`/out/${id}.html`] }).join("\n"),
      /own text missing/,
    );
  });

  it("fails when the own text lives only in the RSC payload, not the HTML", () => {
    const readFile = (path) =>
      path.endsWith(".rsc") ? `<p>${own}</p>` : "<p>other words entirely here</p>";
    const filesFor = (id) => [`/out/${id}.html`, `/out/${id}.rsc`];
    assert.match(
      checkIsolation({ scenes: scenes(), readFile, filesFor }).join("\n"),
      /s1: own text missing from HTML/,
    );
  });

  it("sees through JSON and HTML escaping", () => {
    assert.equal(normalize("farmer\\u2019s wife\\nnext"), normalize("farmer’s wife next"));
    assert.equal(normalize("farmer&#x27;s wife"), normalize("farmer’s wife"));
    assert.ok(excerpt(own).length >= 40);
  });
});
