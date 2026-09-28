import { HomePage } from '../_components/HomePage';

// The app's home page at an address the old FPA Judging System doesn't use, so it is
// reachable on the hosted site while the old system still answers `/`.
export default function NewHome() {
  return <HomePage />;
}
