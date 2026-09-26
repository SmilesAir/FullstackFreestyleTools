import { SeatPage } from '@/app/judge/_components/SeatPage';

export default function DifficultySeatPage(props: {
  params: Promise<{ eventId: string; seat: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return <SeatPage slug="difficulty" {...props} />;
}
