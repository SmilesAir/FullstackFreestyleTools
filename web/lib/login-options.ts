// Which sign-in options the login page and Profile offer. Discord only on the hosted site
// for now; everything stays configured in auth.ts, so turning one back on is changing a line
// here.

// Google sign-in (and Profile's "Connect Google"). Existing Google connections still work.
export const SHOW_GOOGLE = false;

// Email and password: not on the hosted site (Vercel sets VERCEL there), but on the event
// laptop and in dev, where it's how head judges sign in without internet.
export const showPasswordLogin = () => !process.env.VERCEL;
