import { describe, expect, it } from "vitest";
import { nowPlaying } from "./music-credit";

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

describe("nowPlaying", () => {
  it("keeps the title as given and joins composer and short source credit", () => {
    const credit = nowPlaying(tchaikovskySym6No4);
    expect(credit?.line).toBe('Symphony No. 6 "Pathétique" – IV · Tchaikovsky · Musopen / CNSO');
    expect(credit?.full).toBe(
      'Symphony No. 6 "Pathétique" – IV · Tchaikovsky · Musopen / CNSO · Public domain · Music: Musopen / Czech National Symphony Orchestra (public domain)',
    );
  });

  it("names the performer once as the source in Chopin mode", () => {
    const credit = nowPlaying(chopinBalladeNo1);
    expect(credit?.line).toBe("Ballade No. 1 in G minor, Op. 23 · Chopin · Frank Lévy");
    expect(credit?.full).toContain("Public domain (CC0)");
    expect(credit?.full).toContain("Set Chopin Free");
  });

  it("never repeats the performer when there is no composer", () => {
    const credit = nowPlaying(jamendoLand);
    expect(credit?.line).toBe("The land · Pokki DJ");
    expect(credit?.full).toContain("CC BY 2.5 IT");
  });

  it("returns null with no track", () => {
    expect(nowPlaying(null)).toBeNull();
  });
});
