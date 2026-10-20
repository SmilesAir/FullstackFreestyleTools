// What the Judging Trainer's chat knows: how the Fpa2027 judging system works
// in these tools, written from the code that does it (judging.ts,
// judging-settings.ts, score-curve.ts, judging-estimate.ts, pool-standings.ts),
// and how to use the trainer. Fixed text, so the prompt it goes in is cached.
// Keep it in step when the rules, defaults or screens change.

export const FPA2027_GUIDE = `# Fpa2027 judging: how it works in these tools

## The idea
The system's design document calls it VizGraph (visual graph judging). Its principles: judges note in real time with buttons, so most judging happens during the routine; the notes become a graph per category; the computer gives a baseline estimate but the judge may submit any score; each team's graphs are shown together for comparison and the other judges' graphs are overlaid so a judge sees everyone's opinion before submitting; each judge submits one score, they are added up, and the team with the most points wins. The document leaves the graph and estimate maths open; the rest of this guide is how these tools do it.
Each routine is judged in three categories by separate judges: Difficulty (Diff), Artistic Impression (AI) and Execution (Ex). A pool usually has one or more judges per category. While the routine plays, each judge taps notes on their phone or tablet as things happen. When the routine's time is up, the screen works out a baseline score from the judge's notes, the judge can raise or lower it by a percentage, and submits it. A team's result is all its judges' submitted scores added up.

## The judge's screen
- Two tabs: Play (taking notes during the routine) and Review (every team in the pool as a graph, with its score).
- The timer at the top right runs from the routine's start. When it reaches the routine length (3:00 in the trainer), a big Enter Score button appears at the top of the screen.
- Enter Score opens the score dialog: the judge's notes as a graph over the routine, the Baseline Estimate and Your Score, the adjust buttons, and Back and Submit.
- Notes can still be added, moved or deleted from the score dialog until the score is submitted. Once submitted, that routine's notes are locked.
- Review lists the earlier teams, the current one, and the teams still to play as empty graphs. An earlier score can be changed from Review (its baseline stays as it was; only the percent changes). A team that never got started can be given a backup score from Review.
- The faint lines under a judge's own graph are the other categories' judges, averaged per category, so a judge can see how the others saw the same routine.

## Execution (Ex)
Five buttons, best at the top: Clean Completion, Average Completion, Minor Error, Medium Error, Large Error. Tap a button each time it happens; the minus button beside it removes the latest one of that kind.
Default worth of each note: Clean Completion +2, Average Completion +1, Minor Error -1, Medium Error -2, Large Error -3.
Baseline = the worth of every note added up (rounded to 1 decimal). Timing doesn't change an Ex baseline.

## Artistic Impression (AI)
Three areas, each with its own levels:
- Teamwork: Great +3, Decent +2, Minor +1
- Music: Great +2, Decent +1
- Form: Good +1, Bad -1
Baseline = the worth of every note added up (rounded to 1 decimal), like Execution.

## Difficulty (Diff)
- The Difficulty judge has a numberline instead of buttons: bottom is 0, top is the line's max (1 by default). Named moves are marked on it as guides: Chair at 0.2, Gitis at 0.5, Double Barrell Gitis at 0.8.
- To note a move: tap the numberline where the move's difficulty sits, then rate how well it was done: Good, Average or Bad. The note is timed at the tap.
- A note's points = its numberline value x its rating's multiplier. Default multipliers: Good x2, Average x1, Bad x0.3. Example: a Gitis (0.5) done well is 0.5 x 2 = 1 point.
- Notes show in a row under the line; tapping one lets the judge move it, re-rate it or delete it.
- Baseline = the area under the Difficulty curve (see below). When a move happens doesn't change its worth.

## The curve and the Difficulty baseline
- Every note adds a smooth bump at its moment (a bell shape about 4 seconds wide). The line on the graph is all the bumps added together, so notes close together stack into one tall hill and notes far apart stay separate. Green above zero, red below.
- Difficulty's baseline is the area under the whole line, scaled so each note counts its own points. The area is measured past the routine's start and end, so a note right at the start, at the end or after the routine length counts in full: the baseline is the notes' points added up.
- The baseline is rounded to 1 decimal.

## Your Score: the percent adjustment
- The judge adjusts the baseline with the arrow buttons: single arrows are 1%, double arrows 10%, up or down. The change is a percent of the baseline's size, so raising always raises the score, even below zero.
- A baseline of 0 has no size, so there each 1% is 0.1 points (10% = 1 point).
- Your Score = baseline + (size of baseline x percent / 100), rounded to 2 decimals. That is what is submitted.

## Results and places
- For each team: each judge's submitted score, a total per category, and the team total (every submitted score added up, rounded to 2 decimals).
- Place is by team total, highest first. Equal totals share a place (two teams on the same total are both 2nd, and the next is 4th). A team with no submitted score yet has no total or place.
- The results also show, per team, the categories' averaged curves as a graph, and per category a table of each judge's note counts (or Difficulty's numberline / rating pairs), baseline and score. A combined graph puts every team's averaged line together.
- If a routine is cancelled, its notes and scores don't count. If a team is played more than once, each judge's newest submitted score counts.

## Where the numbers come from
The note worths, multipliers, numberline and estimate settings above are the defaults. A head judge can change them for one event on the Head Judge's Settings tab (and save them as a preset), so a real event may use different numbers. The trainer always uses the defaults.

## The Judging Trainer
A practice pool played only in this browser: nothing is saved to the server, and other people can't see it. The pool has 8 teams (Team 1 Member 1 / Team 1 Member 2, and so on) and 3 judges: Diff Judge, AI Judge and Ex Judge. The person practicing plays the head judge and all three judges.
The dark bar at the top:
- New test event: clears every note and score and puts all 8 teams back to unplayed.
- Start Guide: the page the trainer opens on, explaining how to use it.
- Diff Judge, AI Judge, Ex Judge: switch to that judge's real screen. Switching is free at any time.
- FPA2027 Description: a summary of the judging system and how the app scores it.
- Results: the pool's full results, as the head judge sees them. This is where routines are started.
- End early: stops the running routine now, so its judge's Enter Score comes up straight away instead of after the full 3:00.
- The text beside them shows which team and judge are playing and the routine's time.
Starting a routine: in the Results Summary table, each judge's score cell for each team has a Start button until that judge has a score for that team. Start plays that team's routine for that judge (3:00, unless ended early) and opens that judge's screen. So each team is judged three times, once per judge. While a routine is running the other Start buttons wait; the running one's cell says Judging…, then Enter score to go back to it. Once the score is submitted, the cell shows the score.
A good way to practice: open Results, press Start under one judge for Team 1, take that judge's notes, press End early (or wait for 3:00), press Enter Score and submit, then come back to Results for the next judge or team, and watch the totals and places fill in.
`;
