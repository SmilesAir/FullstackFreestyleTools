import type { TrainerView } from './DebugBar';

const link = 'cursor-pointer text-blue-600 underline';

// The trainer's landing page: what it is and how to use it, with the way on
// to the results (where routines start) and the FPA2027 Description.
export function TrainerStartGuide({ onView }: { onView: (view: TrainerView) => void }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 text-sm leading-relaxed">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Judging Trainer</h1>
        <p className="text-gray-600">
          Practice FPA2027 judging on a made-up pool of 8 teams. You play every judge: Diff Judge, AI Judge and Ex
          Judge. You use the real judge screens and the real scoring, but everything stays in this browser. Nothing is
          saved to the server, and nobody else sees it.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">How to use it</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open{' '}
            <button type="button" onClick={() => onView('results')} className={link}>
              Results
            </button>
            . The Summary table has a <strong>Start</strong> button under each judge for each team.
          </li>
          <li>
            Press <strong>Start</strong> under a judge. That team&apos;s routine starts for that judge (3:00), and their
            screen opens.
          </li>
          <li>
            Take notes as the routine plays. Execution and Artistic Impression use buttons. Difficulty uses the
            numberline: tap how hard the move was, then rate it Good, Average or Bad.
          </li>
          <li>
            At 3:00, <strong>Enter Score</strong> appears at the top. To get there sooner, press{' '}
            <strong>End early</strong> in the bar. Check the graph and the baseline, raise or lower the score with the
            arrows if you want, and press <strong>Submit</strong>.
          </li>
          <li>
            Go back to Results. The score is in the table, and the Start button for that judge and team is gone. Do
            the same for the other judges and teams, and watch the totals and places fill in.
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">The bar at the top</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>New test event</strong> clears every note and score, and puts all 8 teams back to unplayed.
          </li>
          <li>
            <strong>Start Guide</strong> is this page.
          </li>
          <li>
            <strong>Diff Judge</strong>, <strong>AI Judge</strong> and <strong>Ex Judge</strong> open that
            judge&apos;s screen. Switch whenever you like. Each judge&apos;s <strong>Review</strong> tab shows their
            graphs for every team.
          </li>
          <li>
            <strong>Results</strong> shows the full pool results, as the head judge sees them. Routines start from
            here.
          </li>
          <li>
            <strong>End early</strong> stops the running routine, so the score can be entered straight away.
          </li>
          <li>The text beside them shows which team and judge are playing, and the routine&apos;s time.</li>
        </ul>
        <p className="text-gray-600">
          What you do is kept in this browser, so a reload carries on where you left off.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">Learn more</h2>
        <p>
          <button type="button" onClick={() => onView('description')} className={link}>
            FPA2027 Description
          </button>{' '}
          explains the judging system: the notes in each category, what each note is worth, how the graph and the
          baseline are worked out, and how results and places are decided. You can also ask questions in the chat
          (the button in the bottom-right corner).
        </p>
      </section>
    </main>
  );
}
