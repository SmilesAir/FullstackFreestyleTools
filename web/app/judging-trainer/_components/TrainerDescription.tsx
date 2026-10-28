// The trainer's Description: what the Fpa2027 (VizGraph) judging system is,
// summarised from its design document, then how these tools carry it out. The
// numbers are the defaults in lib/judging-settings.ts; keep them in step. The
// screenshots are of the trainer's own judge screens; retake them when those
// screens change.

import Image from 'next/image';

const DOC_URL =
  'https://docs.google.com/document/d/e/2PACX-1vRskNk2d0YvphJ49_W0yIWAH9JkRYS_piyiQEWD3tA7CGe4Fb_bBpPJViHHi-D0mxrEsX9vxP9uF-El/pub';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-gray-800">{children}</code>;
}

// A picture of a real screen (in public/images/judging-trainer/), with a caption.
function Shot({ src, alt, width = 1100, height = 800, children }: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-1">
      <Image
        src={`/images/judging-trainer/${src}`}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full rounded border border-gray-300"
      />
      <figcaption className="text-xs text-gray-600">{children}</figcaption>
    </figure>
  );
}

const table = 'w-full border-collapse text-sm';
const th = 'border border-gray-300 px-2 py-1 text-left font-medium';
const td = 'border border-gray-300 px-2 py-1';

export function TrainerDescription() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 text-sm leading-relaxed">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Fpa2027 judging (VizGraph)</h1>
        <p className="text-gray-600">
          A summary of the system from its{' '}
          <a href={DOC_URL} target="_blank" rel="noreferrer" className="text-blue-600 underline">
            design document
          </a>
          , then how this app works it out.
        </p>
      </header>

      <Section title="The system">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Three categories, each with its own judges: <strong>Difficulty</strong>, <strong>Artistic Impression</strong>{' '}
            and <strong>Execution</strong>.
          </li>
          <li>
            Judges take notes <strong>in real time</strong> with buttons while the routine plays. Most of the judging
            happens during the routine, not after it.
          </li>
          <li>
            When the routine ends, the notes become a <strong>graph</strong> for each category, and the computer works
            out a <strong>baseline estimate</strong> of the score from them.
          </li>
          <li>
            The judge compares their impression with the graph and can <strong>adjust</strong> the estimate. The
            computer only suggests; the judge may submit any score.
          </li>
          <li>
            Each team&apos;s graphs are shown together so teams can be compared, and the{' '}
            <strong>other judges&apos; graphs are overlaid</strong> so a judge sees everyone&apos;s opinion before
            submitting.
          </li>
          <li>
            Each judge submits <strong>one score</strong>. A team&apos;s scores are <strong>added together</strong>,
            and the team with the most points wins.
          </li>
        </ul>
      </Section>

      <Section title="The notes">
        <h3 className="font-semibold">Difficulty: two steps</h3>
        <p>
          The judge taps a <strong>numberline</strong> (with move names on it) for how hard the move was, then rates how
          well it was done: <strong>Bad</strong>, <strong>Average</strong> or <strong>Good</strong>.
        </p>
        <h3 className="font-semibold">Artistic Impression: three areas</h3>
        <ul className="list-disc pl-5">
          <li>Teamwork: Minor, Decent, Great</li>
          <li>Music: Decent, Great</li>
          <li>Form: Bad, Good</li>
        </ul>
        <h3 className="font-semibold">Execution: penalties and cleanliness</h3>
        <p>Large Error, Medium Error, Minor Error, Average Completion, Clean Completion.</p>
      </Section>

      <Section title="The judge's screens">
        <p>
          Each judge has two tabs: <strong>Play</strong> for taking notes while the routine runs, and{' '}
          <strong>Review</strong> for every team in the pool.
        </p>
        <h3 className="font-semibold">Play: taking notes</h3>
        <Shot src="ex-play.png" alt="The Execution judge's Play tab: five note buttons, each with a minus button">
          Execution. Tap a button each time it happens; the count shows on the button and the − beside it removes the
          latest one. The team and the routine&apos;s time are along the top.
        </Shot>
        <Shot src="ai-play.png" alt="The Artistic Impression judge's Play tab: buttons grouped under Teamwork, Music and Form">
          Artistic Impression, with its buttons under Teamwork, Music and Form.
        </Shot>
        <Shot src="diff-play.png" alt="The Difficulty judge's Play tab: a numberline marked Chair, Gitis and Double Barrell Gitis, with notes in a row below">
          Difficulty. Tap the numberline at the move&apos;s difficulty, then rate it. Each note shows in the row below
          with its rating and time; tap one to move, re-rate or delete it.
        </Shot>
        <h3 className="font-semibold">Enter Score</h3>
        <Shot src="ex-dialog.png" alt="The Enter score dialog: the notes as a graph, note buttons, the baseline estimate, adjust arrows, Back and Submit">
          When the routine&apos;s time is up, Enter Score opens this: the notes as a graph, the buttons to add or fix
          notes, the Baseline Estimate, and the arrows that adjust Your Score before Submit.
        </Shot>
        <Shot src="diff-dialog.png" alt="The Difficulty judge's Enter score dialog, with the graph above the numberline">
          The same for Difficulty, with the numberline under the graph.
        </Shot>
        <h3 className="font-semibold">Review: every team</h3>
        <Shot src="ex-review.png" alt="The Review tab: one graph per team with the judge's score and adjust arrows beside it">
          Each team as a graph with its score beside it. An earlier score can be changed here with the arrows; the
          routine still running shows its estimate until it is submitted.
        </Shot>
      </Section>

      <Section title="How the app scores it">
        <p>
          The design document leaves the graph and estimate maths open. This is what the app does, with its default
          settings (a head judge can change them for one event on the Head Judge&apos;s Settings tab).
        </p>

        <h3 className="font-semibold">What each note is worth</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Execution</th>
                <th className={th}>Points</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Clean Completion', '+2'],
                ['Average Completion', '+1'],
                ['Minor Error', '−1'],
                ['Medium Error', '−2'],
                ['Large Error', '−3'],
              ].map(([n, v]) => (
                <tr key={n}>
                  <td className={td}>{n}</td>
                  <td className={`${td} tabular-nums`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Artistic Impression</th>
                <th className={th}>Points</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Teamwork Great / Decent / Minor', '+3 / +2 / +1'],
                ['Music Great / Decent', '+2 / +1'],
                ['Form Good / Bad', '+1 / −1'],
              ].map(([n, v]) => (
                <tr key={n}>
                  <td className={td}>{n}</td>
                  <td className={`${td} tabular-nums`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>Difficulty</strong>: the numberline runs from 0 at the bottom to 3 points at the top, with Chair at
          0.6, Gitis at 1.5 and Double Barrell Gitis at 2.4. A note is worth <strong>where it was tapped × the
          rating&apos;s multiplier</strong>: Good ×2, Average ×1, Bad ×0.3. A well-done Gitis is 1.5 × 2 = 3 points.
        </p>

        <h3 className="font-semibold">The graph</h3>
        <p>
          Every note adds a smooth bell-shaped bump at its moment (about 4 seconds wide). The line is all the bumps added
          together, so notes close together stack into a tall hill and notes far apart stay separate. Above zero is
          green, below is red.
        </p>

        <h3 className="font-semibold">The baseline estimate</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Execution and Artistic Impression</strong>: the worth of every note added up. Timing doesn&apos;t
            matter.
          </li>
          <li>
            <strong>Difficulty</strong>: the area under the whole graph, scaled so each note counts its own points. The
            area runs past the start and end, so when a note was taken doesn&apos;t matter: it is the notes&apos; points
            added up.
          </li>
          <li>Rounded to 1 decimal.</li>
        </ul>

        <h3 className="font-semibold">The judge&apos;s adjustment</h3>
        <p>
          The arrows change the score by 1% or 10% of the baseline&apos;s size, so up always means higher, even below
          zero. Near 0 the baseline has almost no size, so the size is never less than ten ordinary notes (an Average
          Completion, a Minor teamwork, an Average Chair): there 10% is one such note and 1% a tenth of one. Score =
          baseline + max(|baseline|, 10 × note) × percent ÷ 100, rounded to 2 decimals.
        </p>

        <h3 className="font-semibold">Results</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Per team: each judge&apos;s score, a total per category, and the team total (all scores added).</li>
          <li>
            Place by team total, highest first. Equal totals share a place (two 2nds, then 4th). No score yet, no place.
          </li>
          <li>
            A team played more than once (judges scoring one at a time, as in this trainer) counts each judge&apos;s
            newest score. A cancelled routine doesn&apos;t count.
          </li>
          <li>The graphs show each category&apos;s judges averaged into one line, and every team&apos;s line together.</li>
        </ul>
        <Shot
          src="pool-compare.png"
          alt="Two teams' graphs one above the other on the same time axis, each with its score and adjust arrows"
          width={1587}
          height={328}
        >
          Teams side by side: the same time axis for each, so a judge can see how one routine compares with another
          before settling the scores.
        </Shot>
      </Section>

      <Section title="How the code works">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Live event.</strong> The head judge starts a routine; each judge&apos;s screen polls the server, taps
            are saved as notes (<Code>fpa2027_judge_notes</Code>) with their time, and are kept in the browser until
            the server has them.
          </li>
          <li>
            <strong>Enter Score.</strong> At the routine&apos;s length the screen draws the graph and the estimate (
            <Code>score-curve.ts</Code>). On Submit the server works the baseline out again from the saved notes with
            the same code (<Code>judging-estimate.ts</Code>) and stores it with the percent and score (
            <Code>fpa2027_judge_scores</Code>), so the stored number is the one the judge saw.
          </li>
          <li>
            <strong>Other judges&apos; lines</strong> come from the server already averaged per category (
            <Code>judging-curves.ts</Code>): one judge&apos;s notes are never sent to another.
          </li>
          <li>
            <strong>Results</strong> add the scores up and rank the teams (<Code>pool-standings.ts</Code>), the same
            numbers the Head Judge, the public results page and Discord show.
          </li>
          <li>
            <strong>This trainer</strong> runs the same screens and the same maths, but keeps the notes and scores in
            this browser instead of the database (<Code>judging-trainer.ts</Code>). Nobody else sees them.
          </li>
        </ol>
      </Section>
    </main>
  );
}
