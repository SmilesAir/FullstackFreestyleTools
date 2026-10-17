// The guide the support chat answers from: how to use the tools and run an event,
// written for event staff (not developers). Keep it in step with the tools: when a
// button, tab or step changes, change it here too. It is sent to Claude as part of
// the support chat's system prompt (lib/claude-prompts.ts), which Settings shows.
// Fixed text only (no dates or ids), so Claude can cache it between questions.

export const SUPPORT_GUIDE = `# Freestyle judging tools: guide for event staff

## The tools and who uses them
- Control Panel: the home of the signed-in tools. Each tool shows only for people given its permission by an admin (Permissions Editor). Admins see everything.
- Event Creator: set up an event before it runs: its divisions, teams, rounds, pools, play order and judges.
- Head Judge: run the event on the day: choose the pool on stage, start and stop each routine, watch the judges, see and publish results.
- Judge screens: what each judge uses on their phone or tablet to score.
- Event Music: the computer that plays each team's song, and where time calls are set.
- Announcer: a read-only page for the announcer, opened from a link the Head Judge copies. No sign-in needed.
- Event Editor: a calendar of all events, where an event can be marked test or hidden, with shortcuts into the other tools.
- Results Parser: enter results of events that ran outside this system.
- Rankings Generator: build and publish the rankings and ratings.
- Player Editor: create and fix player records, hide players, and link duplicates.
- Settings, Permissions Editor, Backups and Public API: admin only.

## Event Creator (setting up an event)
Events
- Create an event with New event (name and dates), then choose it from the event list.
- An event starts with no divisions. Add each one with New division: pick the division type (Open Pairs, Mixed Pairs, Open Co-op, Women Pairs and so on) and Create division.
- Playing toggle: turn it on while the event is being judged. Only playing events list their judges on the public landing page and show up in Event Music.
- Test and hidden flags are set in the Event Editor. A test event is for practice; a hidden event or division is kept off public listings but can still be run.
- Discord: an event can have a Discord channel (Save channel / Change channel). The bot then posts play orders and results to a thread for the event. With no channel set, nothing is posted.

Division settings (in each division's tab)
- Division type, Routine time (3, 4 or 5 minutes; Open Co-op defaults to 4, others to 3) and Rules.
- Rules: the full judging system (Difficulty, Execution and Artistic Impression judges) or Simple Ranking (no assigned judges; anyone ranks the teams from the landing page; see below).

Adding teams
- One division: in the division's Add teams section, paste the teams in any format (one team per line, names separated by "/", "&", commas, a copied spreadsheet...) and press Parse with Claude.
- Several divisions at once: on the selected event, use Add teams to several divisions with Claude and paste, for example, a spreadsheet with a heading row per division. Divisions the event doesn't have yet are created.
- Each name is matched to a player. Review the list: Matched, Needs review (pick the right player) or New player? (create one). Teams with any unresolved player are skipped.
- Remove a team from the Teams list with its remove button.

Rounds, pools and play order
- Each division has rounds (for example Preliminaries, Quarterfinals, Semifinals, Finals). In a round, choose how many Pools (the Finals has one) and Save.
- Seed from rankings fills the round's pools from the current rankings. Teams can also be dragged from the Teams list into a pool, and dragged within or between pools to change the play order. clear round empties the round.
- The order of teams in a pool is the play order the Head Judge, the judges, Event Music and the Announcer all follow.
- Post Play Order/Judges to Discord posts the round to the event's Discord thread (when a channel is set).

Judges
- Each pool needs its judges: use Set Judges on the pool and pick players for each category (Difficulty, Execution, Artistic Impression). Simple Ranking pools have none.
- A pool locked by the Head Judge (🔒 Locked by the Head Judge) can't have its teams or judges changed until it is unlocked on the Head Judge's Pools tab.

## Head Judge (running the event)
Getting started
- Open Head Judge and pick the event on the Events tab. The tabs are Events, Pools, Play, Results and Settings.
- Next to the event's name is Copy announcer link (see Announcer below).
- The database pill at the top right shows which database the server uses and its health (see Running offline below).

Pools tab
- Every pool of every division and round, with how many teams and judges it has (a pool with no judges is highlighted). Click a pool's name to see its teams and judges.
- Set as playing pool makes it the pool on stage (it shows Playing). The pool can't be changed while a routine is running (cancel it first) or to a locked pool.
- Lock / Unlock: a locked pool's scores, teams and judges can't be changed anywhere, and no routine can be started in it. Lock a pool once it is finished. Locking is refused while a routine is running in that pool. Unlocking always works.
- Publish results / Unpublish and the pool's public link (Copy link): see Results and public links below.

Play tab (running each routine)
- Shows the playing pool, its teams in play order, the judges with a dot showing whether each judge's screen is connected, and the routine timer.
- Choose the team that is up by clicking it in the team list (the first team is chosen when the pool is picked).
- Click on First Throw: press it at the team's first throw. This starts the routine and the timer on every screen. It is disabled until a team is chosen, and while the pool is locked.
- While the routine runs, the big button says to wait for the judges. Each judge shows Finished once they have submitted their score.
- When every judge has finished, the button becomes Click to move to the next team (or Click to finish the last team). That ends the routine and puts the next team up.
- Cancel Routine (hold for 1 second): only if the routine must be restarted or something went wrong. The judges' notes and scores for that run are hidden.
- Restore Cancelled Routine Scores (hold for 1 second): appears when the team's last routine was cancelled but judges had notes or scores. It brings them back.
- Judging one judge at a time is allowed: start the same team's routine again for the next judge (no cancel needed). Every judge's newest score counts.
- Time calls: the playing team's time calls show on the Play tab (set them in Event Music).

Results tab and public links
- Choose a pool to see its results: each judge's score, the totals and the places. A Simple Ranking pool shows how many judges sent a ranking, each team's places, its total and final place, and Clear rankings.
- Every pool has a public link (no login), with Copy link. Before the pool is published, the link shows only the teams in play order and the judges' names. After Publish results, it shows the full results, with judges never named (only "Difficulty #1" and so on). Publishing also posts the results to the event's Discord thread if a channel is set. Unpublish hides them again.

Settings tab
- The judging settings for this event's judging system (for example the numberline and scoring constants). These values apply to this event only. Save as preset keeps a set of values to reuse at other events. Most events never need to change these.

## Judges
- Judges open the main landing page (when running offline, the laptop's address or the QR code in the Head Judge's database pill). For each playing event it shows a button per judge, with their name and category (Difficulty, Execution, Artistic Impression). The event must have Playing turned on in the Event Creator.
- The judge presses their own button and keeps that screen open. It is their seat: it follows the Head Judge's playing pool and team by itself, so a device can be set up once and left on the seat.
- They note and score each routine, then submit. The Head Judge's Play tab shows Finished for them.
- If a judge's dot on the Play tab shows Not connected, their screen isn't reaching the server: have them reload the page and check their Wi-Fi.

## Simple Ranking divisions
- No assigned judges: anyone can rank the playing pool from the Judge button on the main landing page while the event is playing.
- Each judge puts the teams in order from best to worst with the up and down arrows; Submit unlocks once every team has a rank. Sending again replaces that browser's ranking.
- Best team gets 1 point, the next 2, and so on. Fewest points wins; a tie goes to the team that plays later ("won on seed").

## Event Music
- For the computer that plays the songs. It lists the playing events and picks the only one by itself.
- Pools are shown with how many teams have no song. Choose a pool to see its teams with their song, Play to test one, and Set music / Change music to add an MP3 or a YouTube or Spotify link (for one round or All rounds).
- The player pinned at the bottom always holds the song of the team that is up on the Head Judge's screen. Testing another song shows Testing, with a way back.
- Time calls: each team's time calls (seconds left when "time" is called, e.g. Time, 10 s, 30 s) are set here and spoken over the music while the routine runs, with the music turned down. Callouts can be muted on that computer. Time calls can't be changed in a locked pool.
- Spotify plays only a 30-second preview unless that browser is signed in to Spotify.
- Songs need the internet. When the Head Judge runs offline, use Event Music on the main website; it still follows the team that is up within a few seconds.

## Announcer
- On Head Judge, Copy announcer link (next to the event's name) copies the event's unlisted link. Send it to the announcer; it works without signing in, on any phone or computer.
- It shows the pool on stage, its teams in play order, who is playing, who is up next, and the routine timer. It follows the Head Judge by itself.
- Print team lists: tick the pools to print (the one on stage is ticked to start) and Print. Each pool prints on its own page with a box for handwritten notes under every team, up to 8 teams per page. Print at 100% scale with default margins.
- If the Head Judge runs offline, get the announcer link while the laptop is online. The link then keeps working.

## Running offline at an event (local server)
When the venue's internet is weak, the Head Judge runs the app on a laptop with its own database, and the judges' phones connect to the laptop over a shared hotspot.

Before the event (once per laptop)
- Install Postgres on the laptop (keep port 5432, remember the admin password).
- Sign in on the laptop itself (http://localhost:3000), open Head Judge, click the database pill, and in Local database use Create the database and a login for me with the Postgres admin password. It sets everything up.

At the event
- In the database pill: choose the event, Take event offline (downloads it), then switch to Local server. Every screen switches at once, so do it between routines.
- Judges scan the QR code in the pill (or open the laptop's address shown there) and press their own button as usual.
- Event setup (pools, teams, judges, players) is still edited on the main website and pulled down to the laptop. What judging creates (routines, scores, results, play state) is sent up to the main website every 30 seconds; Sync with Neon in the pill does it at once. Switching back to Postgres sends everything first.
- Who is up and the routine timer reach the main website within seconds, so Event Music and the Announcer on the main website keep up.
- Google and Discord sign-in need the internet: on the laptop use email and password sign-in.

If a phone can't reach the laptop
- Allow the app through Windows Firewall for the hotspot network (it may be classed as Public).
- Make sure the hotspot doesn't isolate devices from each other (client or AP isolation off).
- Use the address shown in the pill; the .local name is a backup for when the IP address changes.
- If the page loads on the phone but never updates, the laptop's server needs restarting in its event mode; ask whoever set up the laptop.

## Common questions
- A judge's screen is stuck or shows the wrong team: reload the page on that device. Check its dot on the Play tab.
- Click on First Throw is greyed out: choose the playing team first, or the pool is locked (unlock it on the Pools tab).
- Can't change the pool or team: a routine is running. Finish it (all judges submitted) or Cancel Routine.
- Started the wrong team or started too early: Cancel Routine (hold), choose the right team, and start again.
- Results show "Not played yet": no routine for that team was finished (or it was cancelled).
- A judge submitted by mistake: start that team's routine again for that judge; their newest score replaces the earlier one.
- Teams or judges can't be edited in the Event Creator: the pool is locked by the Head Judge.
- The pool's public link shows no results: the pool isn't published yet (Publish results on Head Judge).
- A team's song is missing or wrong: Set music / Change music in Event Music.`;
