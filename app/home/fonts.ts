// Display fonts for the home spread only (comic and chihiro). The other
// skins' faces come from app/fonts.ts on <html>. Self-hosted: the CSP
// allows font-src 'self'. Body text stays on var(--font-book).
import { Bangers, Comic_Neue, Klee_One } from "next/font/google";

const bangers = Bangers({ subsets: ["latin"], weight: "400", variable: "--font-bangers", display: "swap" });
const comicNeue = Comic_Neue({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-comic-neue", display: "swap" });
const klee = Klee_One({ subsets: ["latin"], weight: "600", variable: "--font-klee", display: "swap" });

export const homeFontClass = `${bangers.variable} ${comicNeue.variable} ${klee.variable}`;
