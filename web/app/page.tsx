import { HomePage } from './_components/HomePage';

// On the hosted site `/` is the old FPA Judging System while it is still in use (see
// next.config.ts); everywhere else (laptops at events, dev) it is the app's home page.
export default function Home() {
  return <HomePage />;
}
