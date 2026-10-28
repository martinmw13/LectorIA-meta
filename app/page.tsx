import type { Metadata } from "next";
import { Hero } from "./home/hero";
import { UploadSection } from "./home/upload";
import "./home/home.css";

export const metadata: Metadata = { title: "Lectoria" };

export default function Home() {
  return (
    <main className="home-root">
      <div className="home-wrap">
        <header>
          <span className="home-brand">LECTORIA</span>
          <hr className="home-rule" />
        </header>
        <Hero />
        <UploadSection />
      </div>
    </main>
  );
}
