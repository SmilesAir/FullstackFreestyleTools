// The support chat (app/_components/SupportChat.tsx, app/api/support-chat) and other Claude calls.
export const supportChat = {
  supportTitle: 'Tech support',
  supportIntro:
    'Ask how to do something with these tools or how to run your event. For example: “How do I publish a pool’s results?” or “A judge’s screen isn’t updating.”',
  trainerTitle: 'Fpa2027 help',
  trainerIntro:
    'Ask how Fpa2027 judging and scoring work. For example: “How is the Difficulty baseline worked out?” or “What does +10% do to my score?”',
  chat: (title: string) => `${title} chat`,
  newChat: 'New chat',
  thinking: 'Thinking…',
  askPlaceholder: 'Ask a question…',
  send: 'Send',
  disclaimer: 'Answers are from Claude and can be wrong. Chats are kept 90 days so admins can improve this help.',
  somethingWrong: 'Something went wrong. Try again.',
  noAnswer: 'No answer came back. Try again.',
  couldntReachServer: "Couldn't reach the server. Check the connection and try again.",

  // From the server
  signIn: 'Sign in to use the support chat.',
  couldNotSend: 'That message could not be sent.',
  noAccess: "You don't have access to the support chat.",
  tooLong: (max: string) => `Keep a question under ${max} characters.`,
  notSetUp: "The support chat isn't set up yet.",
  lookingUpResults: '(Looking up the results…)\n\n',
  lookingUpPools: '(Looking up the pools…)\n\n',
  keyRejected: 'The saved Anthropic API key was rejected. Ask an admin to update it in Settings.',
  busy: 'Claude is busy right now. Try again in a minute.',
  outOfCredit: 'The Anthropic account is out of credit. Ask an admin to top it up under Plans & Billing in the Anthropic Console.',
  apiError: (status: number | undefined) => `Claude couldn't answer (error ${status}). Try again shortly.`,
  couldntReachClaude: "Couldn't reach Claude. Check the internet connection and try again.",
  noKey: "The support chat isn't set up yet: an admin needs to add the Anthropic API key in Settings.",
  turnedOff: 'The support chat is turned off. An admin can turn it on in Settings.',
  noTable: "The support chat isn't set up on this database yet.",
  budgetUsed: "The support chat has used this month's budget. It starts again next month, or an admin can raise the budget in Settings.",
  dayFull: (wait: string) => `The support chat has answered as many questions as it can today. Try again in ${wait}.`,
  userDay: (n: number, wait: string) => `You've asked ${n} questions in the last day. Try again in ${wait}.`,
  userHour: (n: number, wait: string) => `You've asked ${n} questions in the last hour. Try again in ${wait}.`,
  aboutMinutes: (n: number) => `about ${n} minute${n === 1 ? '' : 's'}`,
  aboutHours: (n: number) => `about ${n} hours`,
  // Added to Claude's instructions so it answers in the viewer's language (empty for English).
  replyIn: '',
};
