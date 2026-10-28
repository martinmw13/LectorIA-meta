// Display fonts for the home spread only, one per skin (plus the ink
// label face). Self-hosted: the CSP allows font-src 'self'. Body text
// stays on var(--font-book).
import {
  Bangers,
  Caveat,
  Comic_Neue,
  Cormorant_Garamond,
  IM_Fell_English,
  IM_Fell_English_SC,
  Kalam,
  Klee_One,
} from "next/font/google";

const fell = IM_Fell_English({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-fell", display: "swap" });
const fellSc = IM_Fell_English_SC({ subsets: ["latin"], weight: "400", variable: "--font-fell-sc", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-caveat", display: "swap" });
const kalam = Kalam({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-kalam", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap" });
const bangers = Bangers({ subsets: ["latin"], weight: "400", variable: "--font-bangers", display: "swap" });
const comicNeue = Comic_Neue({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-comic-neue", display: "swap" });
const klee = Klee_One({ subsets: ["latin"], weight: "600", variable: "--font-klee", display: "swap" });

export const homeFontClass =
  `${fell.variable} ${fellSc.variable} ${caveat.variable} ${kalam.variable} ${cormorant.variable} ${bangers.variable} ${comicNeue.variable} ${klee.variable}`;
