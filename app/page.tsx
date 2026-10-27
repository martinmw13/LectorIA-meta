import { paragraphId } from '@/core/ids';

export default function Home() {
  return (
    <>
      <header className="topbar">Lectoria</header>
      <div className="shell">
        <main className="book">
          <h1>The Wonderful Wizard of Oz</h1>
          <p id={paragraphId(1, 1)}>
            Dorothy lived in the midst of the great Kansas prairies, with Uncle Henry, who was a
            farmer, and Aunt Em, who was the farmer&apos;s wife.
          </p>
          <p id={paragraphId(1, 2)}>
            When Dorothy stood in the doorway and looked around, she could see nothing but the
            great gray prairie on every side.
          </p>
        </main>
        <aside className="companion" aria-label="Companion">
          Chat comes later.
        </aside>
      </div>
    </>
  );
}
