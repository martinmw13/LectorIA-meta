import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkIsolation, excerpt, normalize } from "./check-isolation.mjs";

const own = "Dorothy lived in the midst of the great Kansas prairies, with Uncle Henry.";
const neighbor = "She was awakened by a shock, so sudden and severe that she was thrown.";

function scenes() {
  return [
    { id: "s1", texts: [own] },
    { id: "s2", texts: [neighbor] },
  ];
}

describe("checkIsolation", () => {
  it("passes when each route carries only its own text", () => {
    const readFile = (path) => (path.includes("s1") ? `<p>${own}</p>` : `<p>${neighbor}</p>`);
    const filesFor = (id) => [`/out/${id}.html`];
    assert.deepEqual(checkIsolation({ scenes: scenes(), readFile, filesFor }), []);
  });

  it("fails when a route carries neighbor text, and on blind scans", () => {
    const leaked = `<p>${own}</p><p>${neighbor}</p>`;
    assert.match(
      checkIsolation({ scenes: scenes(), readFile: () => leaked, filesFor: (id) => [`/out/${id}.html`] }).join("\n"),
      /s1: leaks text of neighbor s2/,
    );
    assert.match(
      checkIsolation({ scenes: scenes(), readFile: () => "<p>other words entirely here</p>", filesFor: (id) => [`/out/${id}.html`] }).join("\n"),
      /own text missing/,
    );
  });

  it("sees through JSON and HTML escaping", () => {
    assert.equal(normalize("farmer\\u2019s wife\\nnext"), normalize("farmer’s wife next"));
    assert.equal(normalize("farmer&#x27;s wife"), normalize("farmer’s wife"));
    assert.ok(excerpt(own).length >= 40);
  });
});
