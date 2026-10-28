// The shared next/font faces, set on <html> by the root layout. The home
// adds only its own faces (app/home/fonts.ts). Self-hosted: the CSP
// allows font-src 'self'.
import {
  Caveat,
  Cormorant_Garamond,
  Crimson_Pro,
  EB_Garamond,
  IM_Fell_English,
  IM_Fell_English_SC,
  Instrument_Sans,
  Jost,
  Kalam,
  Lora,
  Newsreader,
} from "next/font/google";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

// Engraving skin faces. Engraving is the default skin, so they preload;
// the skin's tokens fall back to Georgia until they arrive.
const fell = IM_Fell_English({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-fell",
  display: "swap",
});

const fellSC = IM_Fell_English_SC({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fell-sc",
  display: "swap",
});

const garamond = EB_Garamond({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-garamond",
  display: "swap",
});

// Watercolor skin faces. Not the default skin, so they load only when a
// page uses them.
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-caveat",
  display: "swap",
  preload: false,
});

const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

// Ink skin hand for labels and buttons (Caveat and Newsreader are shared).
const kalam = Kalam({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-kalam",
  display: "swap",
  preload: false,
});

// Pencil skin faces: Jost labels, Crimson Pro book, Cormorant titles.
const jost = Jost({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jost",
  display: "swap",
  preload: false,
});

const crimson = Crimson_Pro({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
  display: "swap",
  preload: false,
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});

export const rootFontClass =
  `${newsreader.variable} ${instrumentSans.variable} ${fell.variable} ${fellSC.variable} ${garamond.variable} ${caveat.variable} ${lora.variable} ${kalam.variable} ${jost.variable} ${crimson.variable} ${cormorant.variable}`;

