import { describe, expect, it } from "vitest";
import { displayTitle, nowPlaying } from "./music-credit";

// Fixtures copied verbatim from public/music/manifest.json (read only).
const tchaikovskySym6No4 = {
  title: 'Symphony No. 6 "Pathétique" – IV',
  composer: "Tchaikovsky",
  artist: "Musopen / CNSO",
  license: "Public domain",
  attribution: "Music: Musopen / Czech National Symphony Orchestra (public domain)",
};

const chopinBalladeNo1 = {
  title: "Ballade No. 1 in G minor, Op. 23",
  composer: "Chopin",
  artist: "Frank Lévy",
  license: "Public domain (CC0)",
  attribution:
    'Frédéric Chopin, performed by Frank Lévy. Recording: Musopen "Set Chopin Free" project (public domain, CC0).',
};

const jamendoLand = {
  title: "The land",
  composer: null,
  artist: "Pokki DJ",
  license: "CC BY 2.5 IT",
  attribution: "Music: Pokki DJ, “The land” (CC BY 2.5 IT), via Jamendo",
};

describe("displayTitle", () => {
  it("drops quoted nicknames", () => {
    expect(displayTitle('Symphony No. 6 "Pathétique" – IV')).toBe("Symphony No. 6 – IV");
  });

  it("drops key phrases and opus suffixes", () => {
    expect(displayTitle("Ballade No. 1 in G minor, Op. 23")).toBe("Ballade No. 1");
  });
});

describe("nowPlaying", () => {
  it("shows the display title with composer and platform source", () => {
    const credit = nowPlaying(tchaikovskySym6No4);
    expect(credit?.line).toBe("Symphony No. 6 – IV · Tchaikovsky · Musopen / CNSO");
    expect(credit?.full).toBe(
      'Symphony No. 6 "Pathétique" – IV · Tchaikovsky · Musopen / CNSO · Public domain · Music: Musopen / Czech National Symphony Orchestra (public domain)',
    );
  });

  it("adds the platform named in the attribution", () => {
    const credit = nowPlaying(chopinBalladeNo1);
    expect(credit?.line).toBe("Ballade No. 1 · Chopin · Frank Lévy / Musopen");
    expect(credit?.full).toContain("Ballade No. 1 in G minor, Op. 23");
    expect(credit?.full).toContain("Public domain (CC0)");
    expect(credit?.full).toContain("Set Chopin Free");
  });

  it("adds Jamendo to the source when the artist lacks it", () => {
    const credit = nowPlaying(jamendoLand);
    expect(credit?.line).toBe("The land · Pokki DJ / Jamendo");
    expect(credit?.full).toContain("CC BY 2.5 IT");
  });

  it("returns null with no track", () => {
    expect(nowPlaying(null)).toBeNull();
  });
});
