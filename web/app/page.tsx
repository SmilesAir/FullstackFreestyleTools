import Link from 'next/link';
import { auth, signOut } from '@/auth';

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto mt-24 max-w-sm px-4 text-center">
      <h1 className="mb-6 text-xl font-semibold">Fullstack Freestyle Tools</h1>
      {session?.user ? (
        <div className="flex flex-col items-center gap-3">
          <Link href="/control-panel" className="text-blue-600 underline">
            Control panel
          </Link>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button type="submit" className="text-sm text-gray-500 underline">
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <Link href="/login" className="text-blue-600 underline">
          Log in
        </Link>
      )}
    </main>
  );
}
