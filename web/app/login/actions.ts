'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export type LoginState = { error: string | null };

// Every sign-in lands on Profile, which highlights Linked player when none is linked and
// otherwise goes straight on to the Control Panel (app/profile/page.tsx).
const AFTER_SIGN_IN = '/profile?welcome=1';

export async function authenticate(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: AFTER_SIGN_IN,
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

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: AFTER_SIGN_IN });
}

export async function signInWithDiscord() {
  await signIn('discord', { redirectTo: AFTER_SIGN_IN });
}
