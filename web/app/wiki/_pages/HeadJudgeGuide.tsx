import Link from 'next/link';
import { Bullets, Contents, Note, Numbered, Page, Section, Shot, Step, link } from './parts';

// The Spanish one is HeadJudgeGuideEs.tsx; keep the two in step (and lib/support-guide.ts,
// which the support chat answers from, when a button or step changes).
export function HeadJudgeGuide() {
  return (
    <Page
      title="Running an event as head judge"
      intro={
        <p>
          How to run an event with these tools, from getting access to sharing the results. The site is{' '}
          <a href="https://freestylejudge.com/new" className={link}>
            freestylejudge.com/new
          </a>
          . If the venue&apos;s internet is weak, also read{' '}
          <Link href="/wiki/local-server" className={link}>
            Running the system locally
          </Link>
          .
        </p>
      }
    >
      <Contents
        label="On this page"
        items={[
          { id: 'permissions', title: 'Step 1: Get permissions' },
          { id: 'setup', title: 'Step 2: Set up the event' },
          { id: 'run', title: 'Step 3: Run the event' },
          { id: 'judges', title: 'Step 4: Set up the judges' },
          { id: 'results', title: 'Step 5: Get the results' },
          { id: 'help', title: 'Practice and help' },
        ]}
      />

      <Section id="permissions" title="Step 1: Get permissions">
        <Step title="Create an account">
          <p>
            Go to{' '}
            <a href="https://freestylejudge.com/new" className={link}>
              freestylejudge.com/new
            </a>
            , click <strong>Log in</strong> and sign in with Discord. Signing in the first time makes your account.
          </p>
          <p>
            Then open <strong>Profile</strong> in the Control Panel and link your player, so your account knows which
            player you are.
          </p>
        </Step>
        <Step title="Ask for Event Creator and Head Judge access">
          <p>
            Email Ryan Young at <strong>ryan@smilesair.com</strong> and ask for access to the Event Creator and Head
            Judge. Once it is given, the <strong>Control Panel</strong> shows those tools.
          </p>
          <Shot name="control-panel" lang="en" alt="The Control Panel, with a card for each tool the account can use" />
          <p>
            If you will run the event on a laptop without internet, ask for an email and password sign-in too
            (Discord needs the internet). Profile shows whether your account has one.
          </p>
        </Step>
        <Note tone="warn">
          <strong>Please be responsible and only change your own events.</strong>
        </Note>
      </Section>

      <Section id="setup" title="Step 2: Set up the event">
        <p>
          Everything here is in the <strong>Event Creator</strong> (Control Panel → Event Creator).
        </p>
        <Step title="Create the event">
          <p>
            On the <strong>Events</strong> tab, under <strong>New event</strong>, enter the event&apos;s name and dates
            and click <strong>Create event</strong>. Then choose it from the event list.
          </p>
          <Shot name="ec-new-event" lang="en" alt="The New event form: event name, start and end dates, and Create event" />
        </Step>
        <Step title="Add divisions">
          <p>
            An event starts with no divisions. Open the <strong>+ New division</strong> tab, pick the division type
            (Open Pairs, Mixed Pairs, Open Co-op, Women Pairs and so on) and click <strong>Create division</strong>. Each
            division then has its own tab.
          </p>
          <Shot name="ec-new-division" lang="en" alt="The + New division tab with the Division type menu and Create division" />
        </Step>
        <Step title="Set the judging rules">
          <p>In each division&apos;s tab, set the routine time (3, 4 or 5 minutes) and the Rules:</p>
          <Bullets>
            <li>
              <strong>Fpa2027</strong>: the full judging system, with Difficulty, Execution and Artistic Impression
              judges. Every judge&apos;s score is added up and the team with the most points wins.
            </li>
            <li>
              <strong>Simple Ranking</strong>: no assigned judges. Anyone ranks the teams from best to worst on their
              phone. The best team gets 1 point, the next 2, and so on; the team with the fewest points wins.
            </li>
          </Bullets>
          <p>
            Click <strong>Save settings</strong>. Changing the dropdown alone doesn&apos;t save it. An older division
            may show Fpa2020 (the old system): its judges never appear on the judging page, so switch it to Fpa2027.
          </p>
          <Shot name="ec-division-settings" lang="en" alt="Division settings: division type, routine time, rules and Save settings" />
        </Step>
        <Step title="Add teams to the divisions">
          <Bullets>
            <li>
              <strong>One division</strong>: in the division&apos;s Add teams section, paste the teams in any format
              (one team per line, a copied spreadsheet…) and click <strong>Parse with Claude</strong>.
            </li>
            <li>
              <strong>Several divisions at once</strong>: on the event, use{' '}
              <strong>Add teams to several divisions with Claude</strong> (for example a spreadsheet with a heading
              row per division). Divisions the event doesn&apos;t have yet are created.
            </li>
            <li>
              <strong>From registration</strong>: <strong>Add players and teams from registration</strong> builds the
              teams from the Event Registration sign-ups. Tick Only paid registrations to leave out unpaid ones.
            </li>
          </Bullets>
          <p>
            Each name is matched to a player. Check the list: <em>Matched</em>, <em>Needs review</em> (pick the right
            player) or <em>New player?</em> (create one). A team with an unresolved player is skipped.
          </p>
          <Shot name="ec-add-teams" lang="en" alt="The Add teams box with three teams pasted in and Parse with Claude" />
        </Step>
        <Step title="Add rounds and teams to the pools">
          <p>
            Each division has rounds (Preliminaries, Quarterfinals, Semifinals, Finals). In a round, choose how many
            pools and click <strong>Save</strong>.
          </p>
          <p>
            For the first round, <strong>Seed from rankings</strong> fills the pools from the current rankings, in
            seed order. You can also drag teams from the Teams list into a pool, and drag them within or between pools.
            The order in a pool is the play order everyone follows.
          </p>
          <p>
            For a later round, set <strong>Teams per pool</strong> and click <strong>Fill from results</strong> once every
            pool of the round before has its results. Teams that had a bye go in first, then the teams that advanced by
            place (every 1st, then every 2nd, and so on).
          </p>
        </Step>
        <Step title="Add judges to each pool">
          <p>
            Click <strong>Set Judges</strong> under a pool. A list of players opens at the bottom of the screen: drag
            each judge into their category&apos;s column (Diff, AI, Ex). Simple Ranking pools have no judges.
          </p>
          <Shot
            name="ec-round"
            lang="en"
            alt="A Semifinals round with two pools: each pool's teams in play order, and its judges in Diff, AI and Ex columns"
          />
        </Step>
        <Step title="Optional">
          <Bullets>
            <li>
              <strong>Send for Review</strong> on a round asks the division&apos;s directors and the event&apos;s
              committee to check its pools in Pool Review (by Discord message).
            </li>
            <li>
              Set the event&apos;s Discord channel to have the play orders and results posted there.
            </li>
          </Bullets>
        </Step>
        <Step title="Turn on Playing when judging starts">
          <p>
            On the <strong>Events</strong> tab, turn on the <strong>Playing</strong> switch in the event&apos;s row under
            Recent events. Only playing events show their judges on the judging page.
          </p>
          <Shot name="ec-playing" lang="en" alt="The event's row under Recent events, with the Playing switch on" />
        </Step>
      </Section>

      <Section id="run" title="Step 3: Run the event">
        <Step title="Open Head Judge">
          <p>
            Sign in on the head judge&apos;s computer, open <strong>Head Judge</strong> from the Control Panel and pick
            your event on the <strong>Events</strong> tab.
          </p>
          <p>
            Next to the event&apos;s name is the <strong>Judge PIN</strong> (2 digits). Every judging device enters it
            once. <strong>New PIN</strong> makes a new one and signs every device out. Test events have no PIN.
          </p>
          <Shot name="hj-header" lang="en" alt="The top of Head Judge: the event, Copy announcer link, the Judge PIN and the tabs" />
        </Step>
        <Step title="Set the playing pool">
          <p>
            On the <strong>Pools</strong> tab, click <strong>Set as playing pool</strong> on the pool that plays next.
            Every judge&apos;s screen follows it by itself.
          </p>
          <Shot
            name="hj-pools"
            lang="en"
            alt="The Pools tab: each pool with Set as playing pool, Lock, Publish results and Copy link; pool B is Playing"
          />
        </Step>
        <Note>
          For <strong>Fpa2027</strong>, follow the steps below. For <strong>Simple Ranking</strong>, setup is finished
          and play can start: the judges rank the playing pool (Step 4).
        </Note>
        <Step title="Choose the team that is up">
          <p>
            On the <strong>Play</strong> tab, click the team in the team list. The first team is chosen when the pool
            is set. The judges are listed with a dot that shows whether each judge&apos;s screen is connected.
          </p>
          <Shot
            name="hj-play"
            lang="en"
            alt="The Play tab before the routine: Click on First Throw, the teams with the first one Now playing, and the judges"
          />
        </Step>
        <Step title="Click on First Throw on the first throw of the routine">
          <p>This starts the routine and the timer on every screen.</p>
          <p>
            Wait for the judges. Each one shows <strong>Finished</strong> once they have submitted their score. When
            all of them have, click <strong>Click to move to the next team</strong> (or{' '}
            <strong>Click to finish the last team</strong>). Then repeat for the next team.
          </p>
          <Shot
            name="hj-play-running"
            lang="en"
            alt="The Play tab during a routine: the timer running, the button asking to wait for the judges, and one judge connected"
          />
        </Step>
        <Step title="If something goes wrong">
          <Bullets>
            <li>
              Started the wrong team or too early: hold <strong>Cancel Routine</strong> for 1 second, choose the right
              team and start again.
            </li>
            <li>
              Cancelled by mistake: hold <strong>Restore Cancelled Routine Scores</strong> for 1 second.
            </li>
            <li>
              A judge submitted by mistake: start that team&apos;s routine again for that judge. Their newest score
              counts.
            </li>
          </Bullets>
        </Step>
        <Step title="Lock the pool when it is finished">
          <p>
            <strong>Lock</strong> on the Pools tab stops its scores, teams and judges from being changed anywhere.
            Unlock always works.
          </p>
        </Step>
        <Step title="Optional: the announcer and the music">
          <Bullets>
            <li>
              <strong>Copy announcer link</strong> (next to the event&apos;s name) gives a page for the announcer, with
              the pool on stage, who is up and the timer. No sign-in needed.
            </li>
            <li>
              <strong>Event Music</strong> plays each team&apos;s song on the music computer and follows the team that
              is up.
            </li>
          </Bullets>
        </Step>
      </Section>

      <Section id="judges" title="Step 4: Set up the judges">
        <Step title="On each judge device, go to freestylejudge.com/new">
          <p>
            <strong>Do not sign in on these devices.</strong> The judge buttons only show when signed out (or use a
            private window).
          </p>
        </Step>
        <Step title="Press the judge's own button">
          <p>
            Each playing event shows a button per judge of the playing pool, with their name and category. Each judge
            presses their own.
          </p>
          <Shot name="judge-home" lang="en" alt="A phone showing the event's judge buttons, each with a name and category" />
          <p>
            For a Simple Ranking pool, judges press the event&apos;s <strong>Judge</strong> button instead and rank the
            teams with the up and down arrows; <strong>Submit</strong> unlocks once every team has a rank.
          </p>
        </Step>
        <Step title="Enter the judge PIN">
          <p>
            Type the 2-digit PIN from the Head Judge page. Tick <strong>Remember this device</strong> so it isn&apos;t
            asked again.
          </p>
          <Shot name="judge-pin" lang="en" alt="The PIN pad on a judge's phone, with Remember this device ticked" />
        </Step>
        <Step title="Leave the screen open">
          <p>
            The screen is the judge&apos;s seat. It follows the playing pool and team by itself, so set it up once and
            leave it. When the head judge clicks on the first throw, the judge&apos;s timer starts and they take notes.
          </p>
          <Shot name="judge-screen" lang="en" alt="An Execution judge's phone during a routine: the timer and the note buttons" />
        </Step>
        <Step title="If a judge's button is missing, check in this order">
          <Numbered>
            <li>The division&apos;s Rules are Fpa2027 (not Fpa2020), and Save settings was clicked.</li>
            <li>The event has Playing turned on.</li>
            <li>The judge is assigned to the pool that is playing right now.</li>
            <li>The device is signed out.</li>
          </Numbered>
        </Step>
      </Section>

      <Section id="results" title="Step 5: Get the results">
        <Step title="Watch the results live">
          <p>
            The <strong>Results</strong> tab on Head Judge shows a pool&apos;s results as the judges submit: every
            judge&apos;s score, the totals and places, and a graph of each team&apos;s routine.
          </p>
          <Shot
            name="hj-results"
            lang="en"
            alt="A pool's results: the Summary table with every judge's score, totals and places, and the teams' graph"
          />
        </Step>
        <Step title="Publish and share the link">
          <p>
            Every pool has its own public link (no sign-in), like <strong>freestylejudge.com/r/Yx7Kp2Qm</strong>. At
            the top of the pool&apos;s results, click <strong>Publish results</strong>, then{' '}
            <strong>Copy link</strong>. Paste it into an email, a chat or a post.
          </p>
          <Bullets>
            <li>Before publishing, the link shows only the teams in play order and the judges&apos; names.</li>
            <li>
              After publishing, it shows the full results, with the judges never named (only &quot;Difficulty
              #1&quot; and so on), so it is safe to post publicly.
            </li>
            <li>
              The page has Division, Round and Pool menus to reach every other pool of the event, so one link is enough
              for the whole event.
            </li>
            <li>Publishing also posts the results to the event&apos;s Discord channel, if one is set.</li>
          </Bullets>
          <Shot
            name="public-results"
            lang="en"
            alt="The public results page: Division, Round and Pool menus, and the Summary with judges shown as Execution #1 and so on"
          />
        </Step>
      </Section>

      <Section id="help" title="Practice and help">
        <Bullets>
          <li>
            The <strong>Judging Trainer</strong> (Control Panel) is a practice pool of 8 teams where you play the head
            judge and every judge. Nothing is saved.
          </li>
          <li>
            Head Judge and the Event Creator have a chat button (bottom right) that answers questions about the tools.
          </li>
        </Bullets>
      </Section>
    </Page>
  );
}
