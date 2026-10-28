// The 10 open-book shelf entries, in grid order. Oz's facts come from the
// library manifest; a shelf book is READY only when the manifest lists it.
import { library, readingMinutes } from "@/core/library";

export interface ShelfBook {
  id: string;
  title: string;
  label: string;
  author: string;
  year: number;
  time: string;
  tag: string;
  favorite: boolean;
  hook: string;
  alt: string;
  ready: boolean;
}

interface ShelfDraft extends Omit<ShelfBook, "ready"> {}

const DRAFTS: ShelfDraft[] = [
  {
    id: "oz",
    title: "The Wonderful Wizard of Oz",
    label: "Wizard of Oz",
    author: "L. Frank Baum",
    year: 1900,
    time: "",
    tag: "Our favorite",
    favorite: true,
    hook: "A cyclone lifts Dorothy and Toto out of Kansas and sets them down at the start of a yellow brick road.",
    alt: "Dorothy holds Toto as the cyclone lifts the house above the Kansas prairie",
  },
  {
    id: "alice",
    title: "Alice's Adventures in Wonderland",
    label: "Alice",
    author: "Lewis Carroll",
    year: 1865,
    time: "About 1 h 46 min",
    tag: "Whimsical",
    favorite: false,
    hook: "A girl follows a white rabbit down a hole, into a world that refuses to make sense.",
    alt: "Alice follows the White Rabbit, who checks his pocket watch",
  },
  {
    id: "frankenstein",
    title: "Frankenstein",
    label: "Frankenstein",
    author: "Mary Shelley",
    year: 1818,
    time: "About 5 h",
    tag: "Gothic",
    favorite: false,
    hook: "A young scientist brings a man to life, then runs from what he has made.",
    alt: "The creature stands in a stormy laboratory lit by lightning",
  },
  {
    id: "pride",
    title: "Pride and Prejudice",
    label: "Pride & Prejudice",
    author: "Jane Austen",
    year: 1813,
    time: "About 8 h",
    tag: "Witty romance",
    favorite: false,
    hook: "Five sisters, one proud gentleman, and the sharpest first impressions in English fiction.",
    alt: "Elizabeth and Mr Darcy meet in a country garden",
  },
  {
    id: "sherlock",
    title: "The Adventures of Sherlock Holmes",
    label: "Sherlock Holmes",
    author: "Arthur Conan Doyle",
    year: 1892,
    time: "About 7 h",
    tag: "Mystery",
    favorite: false,
    hook: "Twelve cases in foggy London, and the one man who notices everything you missed.",
    alt: "Sherlock Holmes with his pipe on a foggy London street",
  },
  {
    id: "dracula",
    title: "Dracula",
    label: "Dracula",
    author: "Bram Stoker",
    year: 1897,
    time: "About 10 h 40 min",
    tag: "Horror",
    favorite: false,
    hook: "A young lawyer travels to a castle in the Carpathians, and something follows him home.",
    alt: "A dark castle on a crag under a full moon, with bats",
  },
  {
    id: "peterpan",
    title: "Peter Pan",
    label: "Peter Pan",
    author: "J. M. Barrie",
    year: 1911,
    time: "About 3 h 8 min",
    tag: "Adventure",
    favorite: false,
    hook: "Second star to the right, and straight on till morning, with a boy who will not grow up.",
    alt: "Peter Pan flies over the rooftops of London at night",
  },
  {
    id: "treasure",
    title: "Treasure Island",
    label: "Treasure Island",
    author: "Robert Louis Stevenson",
    year: 1883,
    time: "About 4 h 28 min",
    tag: "Pirates",
    favorite: false,
    hook: "An innkeeper\u2019s boy finds a map, and a one-legged cook with a parrot wants it too.",
    alt: "A pirate ship anchored off an island with palm trees",
  },
  {
    id: "jungle",
    title: "The Jungle Book",
    label: "Jungle Book",
    author: "Rudyard Kipling",
    year: 1894,
    time: "About 3 h 24 min",
    tag: "Wild tales",
    favorite: false,
    hook: "A boy raised by wolves learns the law of the jungle from a bear and a panther.",
    alt: "Mowgli with Baloo the bear and Bagheera the panther in the jungle",
  },
  {
    id: "carol",
    title: "A Christmas Carol",
    label: "Christmas Carol",
    author: "Charles Dickens",
    year: 1843,
    time: "About 1 h 56 min",
    tag: "Ghost story",
    favorite: false,
    hook: "Three ghosts, one long winter night, and a miser who gets one more chance.",
    alt: "Scrooge by candlelight, visited by a ghost",
  },
];

const byManifestId = new Map(library.map((book) => [book.id, book]));

export const shelf: ShelfBook[] = DRAFTS.map((draft) => {
  const live = byManifestId.get(draft.id);
  if (!live) return { ...draft, ready: false };
  return {
    ...draft,
    title: live.title,
    author: live.author,
    year: live.year,
    time: readingMinutes(live.words),
    ready: true,
  };
});

export function shelfById(id: string): ShelfBook | undefined {
  return shelf.find((book) => book.id === id);
}
