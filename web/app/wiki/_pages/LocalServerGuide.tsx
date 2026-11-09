import Link from 'next/link';
import { Bullets, Code, Commands, Contents, Note, Numbered, Page, Section, Shot, Step, Table, link } from './parts';

// The Spanish one is LocalServerGuideEs.tsx; keep the two in step (and the README's
// "Running a local server at an event", which has the technical details).
export function LocalServerGuide() {
  return (
    <Page
      title="Running the system locally"
      intro={
        <>
          <p>
            Venues often have weak or no internet. The system can run on a laptop instead: the laptop runs the app with
            its own database, and the judges&apos; phones connect to it over a shared hotspot, so judging never depends
            on the internet. When the laptop has internet, it syncs with the main site in the background.
          </p>
          <p className="mt-2">
            Everything else works as in{' '}
            <Link href="/wiki/head-judge" className={link}>
              Running an event as head judge
            </Link>
            ; this page covers only what is different.
          </p>
        </>
      }
    >
      <Contents
        label="On this page"
        items={[
          { id: 'need', title: 'What you need' },
          { id: 'setup', title: 'One-time setup on the laptop' },
          { id: 'event', title: 'At the event' },
          { id: 'where', title: 'What happens where' },
          { id: 'trouble', title: "If a phone can't reach the laptop" },
          { id: 'backups', title: 'Backups and starting over' },
          { id: 'dev', title: 'For developers' },
        ]}
      />

      <Section id="need" title="What you need">
        <Bullets>
          <li>A laptop (these steps are for Windows) that stays plugged in for the event.</li>
          <li>
            A Wi-Fi hotspot or router that the laptop and every judge device join. A phone hotspot works. It
            doesn&apos;t need internet, but internet lets the results reach the main site during the event.
          </li>
          <li>
            An account with an <strong>email and password</strong> sign-in and Head Judge access. Discord sign-in
            needs the internet, so it can&apos;t be used on the laptop. Ask an admin if you don&apos;t have one.
          </li>
          <li>
            The app&apos;s settings file, <Code>web/.env.local</Code>, from the project owner. It holds the passwords
            the laptop uses to sync with the main site: keep it private and never share it.
          </li>
        </Bullets>
      </Section>

      <Section id="setup" title="One-time setup on the laptop">
        <p>Do this at home with good internet, a few days before the event.</p>
        <Step title="1. Install Postgres">
          <p>
            Download it from{' '}
            <a href="https://www.postgresql.org/download/" className={link}>
              postgresql.org/download
            </a>{' '}
            (on Windows, the EDB installer). Keep the default port 5432 and remember the <Code>postgres</Code>{' '}
            password you choose. You don&apos;t need to create a database: the app does that.
          </p>
        </Step>
        <Step title="2. Install Node.js and Git">
          <p>
            Install the LTS version of{' '}
            <a href="https://nodejs.org" className={link}>
              Node.js
            </a>{' '}
            and{' '}
            <a href="https://git-scm.com" className={link}>
              Git
            </a>
            .
          </p>
        </Step>
        <Step title="3. Get the app and build it">
          <p>
            Open a terminal and run these. Put the <Code>.env.local</Code> file into the <Code>web</Code> folder
            before building.
          </p>
          <Commands
            lines={[
              'git clone https://github.com/SmilesAir/FullstackFreestyleTools.git',
              'cd FullstackFreestyleTools/web',
              'npm install',
              'npm run build',
              'npm run start:local',
            ]}
          />
          <p>
            <Code>npm run start:local</Code> starts the app and prints the addresses the judges will open. Leave the
            terminal open while the app runs; closing it stops the app.
          </p>
        </Step>
        <Step title="4. Create the local database from the page">
          <Numbered>
            <li>
              On the laptop itself, open <Code>http://localhost:3000</Code> (not its network address) and sign in
              with your email and password.
            </li>
            <li>
              Open <strong>Head Judge</strong> and click the database pill at the top (it says{' '}
              <strong>Postgres (Neon)</strong>).
            </li>
            <li>
              Under <strong>Local database</strong>, open <strong>Create the database and a login for me</strong>,
              enter the Postgres admin password from step 1 and click <strong>Create database and login</strong>.
            </li>
          </Numbered>
          <p>
            That makes the database and its tables, and saves its address on the laptop. The admin password is used
            once and never stored. Doing it again is safe.
          </p>
          <Shot
            name="db-create"
            lang="en"
            alt="The database panel on a fresh laptop: Create the database and a login for me, with the Postgres admin password box"
          />
        </Step>
        <Note>
          Before each event, get the newest version of the app: in the <Code>web</Code> folder run{' '}
          <Code>git pull</Code>, <Code>npm install</Code> and <Code>npm run build</Code>, then{' '}
          <Code>npm run start:local</Code>.
        </Note>
      </Section>

      <Section id="event" title="At the event">
        <Step title="1. Set up the event on the main site first">
          <p>
            Set up the divisions, pools, teams and judges in the Event Creator as usual (on the main site, or on the
            laptop while it is online). Any later change is still made there and is pulled down to the laptop.
          </p>
        </Step>
        <Step title="2. Start the laptop">
          <p>
            Join the laptop to the hotspot and run <Code>npm run start:local</Code> in the <Code>web</Code> folder.
            Open <Code>http://localhost:3000</Code>, sign in and open Head Judge.
          </p>
        </Step>
        <Step title="3. Take the event offline and switch to the local server">
          <Numbered>
            <li>Click the database pill and choose the event.</li>
            <li>
              Click <strong>Take event offline (download it)</strong>. This needs internet.
            </li>
            <li>
              Switch to <strong>Local server</strong>. Every screen switches at once, so do it between routines.
            </li>
          </Numbered>
          <Shot
            name="db-offline"
            lang="en"
            alt="The database panel with the event chosen under Event on the local server, and Take event offline"
          />
        </Step>
        <Step title="4. Connect the judges">
          <p>
            Each judge joins the same hotspot and scans the <strong>QR code</strong> in the database pill (or types the
            address shown there, like <Code>http://192.168.1.20:3000</Code>). From there it is the same as Step 4 of the
            head judge guide: don&apos;t sign in, press their own button and enter the judge PIN.
          </p>
          <Shot
            name="db-local"
            lang="en"
            alt="The database panel on the local server: Local server in use, the sync status, and the QR code and addresses judges open"
          />
        </Step>
        <Step title="5. Run the event as usual">
          <p>
            Head Judge works the same. On the local server, the head judge&apos;s and judges&apos; screens update every
            second.
          </p>
        </Step>
        <Step title="6. Finish">
          <p>
            Before shutting the laptop down, connect it to the internet and switch the pill back to{' '}
            <strong>Postgres (Neon)</strong>. That sends everything first. Check the pill says nothing is waiting to
            send.
          </p>
        </Step>
      </Section>

      <Section id="where" title="What happens where">
        <Table
          head={['What', 'Where it happens']}
          rows={[
            [
              'Event setup (divisions, pools, teams, judges, players)',
              'Edited on the main site, and pulled down to the laptop when it changes.',
            ],
            [
              'Judging (routines, notes, scores, results, play state)',
              <>
                Made on the laptop, and sent up to the main site every 30 seconds when there is internet.{' '}
                <strong>Sync now</strong> in the pill sends it at once.
              </>,
            ],
            [
              'Who is up and the routine timer',
              'Sent to the main site straight away, so screens there keep up within a few seconds.',
            ],
            [
              'Event Music and the announcer page',
              'Use them on the main site (songs need the internet). They still follow the team that is up.',
            ],
            [
              'Public results links',
              'Served by the main site, so they show the results once the laptop has synced.',
            ],
            [
              'Sign-in',
              'Email and password on the laptop. Discord sign-in needs the internet.',
            ],
          ]}
        />
        <Note>
          Get the announcer link (<strong>Copy announcer link</strong>) while the laptop is online. The link keeps
          working after that.
        </Note>
      </Section>

      <Section id="trouble" title="If a phone can't reach the laptop">
        <Bullets>
          <li>
            Allow the app through Windows Firewall for the hotspot&apos;s network. Windows may class it as Public.
          </li>
          <li>Make sure the hotspot doesn&apos;t isolate devices from each other (client or AP isolation off).</li>
          <li>
            Use the address shown in the pill. The <Code>.local</Code> name is a backup for when the IP address
            changes.
          </li>
          <li>
            If the page loads on the phone but never updates and nothing can be pressed, the app was started with{' '}
            <Code>npm run dev</Code>. Stop it and use <Code>npm run build</Code> then <Code>npm run start:local</Code>.
          </li>
        </Bullets>
      </Section>

      <Section id="backups" title="Backups and starting over">
        <Step title="Safety backups">
          <p>
            The laptop backs up its database before anything in it is replaced (the newest 20 are kept in{' '}
            <Code>web/.local/backups</Code>). To restore one, stop the app, then:
          </p>
          <Commands lines={['npm run local:restore              # lists the backups', 'npm run local:restore -- <file name>']} />
        </Step>
        <Step title="Starting over with a fresh laptop">
          <Numbered>
            <li>
              Switch the pill to <strong>Postgres (Neon)</strong> (this sends anything not yet sent), then stop the
              app.
            </li>
            <li>
              Delete the database and its login in Postgres, for example in <Code>psql -U postgres</Code>:{' '}
              <Code>DROP DATABASE freestyle_local WITH (FORCE); DROP ROLE freestyle;</Code>
            </li>
            <li>
              Delete the <Code>web/.local</Code> folder.
            </li>
            <li>Start the app and do step 4 of the one-time setup again.</li>
          </Numbered>
          <p>Nothing on the main site is touched by this.</p>
        </Step>
      </Section>

      <Section id="dev" title="For developers">
        <p>
          To work on the app, run <Code>npm run dev</Code> in the <Code>web</Code> folder and open{' '}
          <Code>http://localhost:3000</Code>. It uses the database named in <Code>.env.local</Code> until the pill is
          switched to the local server. Use <Code>npm run start:local</Code> for events, since <Code>npm run dev</Code>{' '}
          can block other devices. The README has the technical details.
        </p>
      </Section>
    </Page>
  );
}
