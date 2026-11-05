// Discord DMs to one person, in their own language. Posts to an event's shared channel
// stay in English (lib/discord-posts.ts).
export const discord = {
  testDm: 'This is a test message from Fullstack Freestyle Tools — if you got this, Discord notifications are working!',
  testDmLinkedPlayer: 'Linked player:',
  testDmNoPlayer: '(No player linked yet — you can link one on your profile page.)',
  reviewReady: (eventName: string, title: string) => `**${eventName}: ${title}** is ready for review.`,
  reviewCheck: (pools: string) => `${pools}: check the teams' play order and the judges before the round is played.`,
  couldNotReach: 'Could not reach Discord.',
};
