import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Instrument_Sans, Newsreader } from 'next/font/google';
import './globals.css';
import { DEFAULT_SKIN, SKIN_SCRIPT } from './skin';
import { THEME_SCRIPT } from './theme';

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Lectoria',
  description: 'A reader that plays orchestral music matched to each scene.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-skin={DEFAULT_SKIN} className={`${newsreader.variable} ${instrumentSans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SKIN_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
