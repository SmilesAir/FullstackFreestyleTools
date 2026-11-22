import { HomePage } from './_components/HomePage';

// The app's home page. Old FPA Judging System links to `/?…` are redirected to /old before
// they get here (next.config.ts).
export default function Home() {
  return <HomePage />;
}
