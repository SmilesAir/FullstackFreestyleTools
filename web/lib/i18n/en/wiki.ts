// The Wiki's menu and page titles (lib/wiki.ts). The pages' own text is in
// app/wiki/_pages/, one component per language.
export const wiki = {
  intro: 'Step-by-step guides for running events with these tools.',
  pagesHeading: 'Guides',
  onThisPage: 'On this page',
  home: 'Home',
  pages: {
    headJudge: {
      title: 'Running an event as head judge',
      summary: 'From getting access to sharing the results: set up the event, run each routine, set up the judges.',
    },
    localServer: {
      title: 'Running the system locally',
      summary:
        "For venues with weak internet: run the app on a laptop with its own database, judges' phones on a hotspot, synced to the main site.",
    },
  },
};
