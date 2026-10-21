'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { safeNextPath } from '@/lib/login-redirect';

export type LoginState = { error: string | null };

// A sign-in that started from a link to a protected page (the form's hidden `next`) goes back
// to that page. Otherwise it lands on Profile, which highlights Linked player when none is
// linked and otherwise goes straight on to the home page (app/profile/page.tsx).
const AFTER_SIGN_IN = '/profile?welcome=1';

function afterSignIn(formData: FormData) {
  return safeNextPath(formData.get('next')) ?? AFTER_SIGN_IN;
}

export async function authenticate(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: afterSignIn(formData),
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password' };
        default:
          return { error: 'Something went wrong signing in' };
      }
    }
    throw error;
  }
}

export async function signInWithGoogle(formData: FormData) {
  await signIn('google', { redirectTo: afterSignIn(formData) });
}

export async function signInWithDiscord(formData: FormData) {
  await signIn('discord', { redirectTo: afterSignIn(formData) });
}
