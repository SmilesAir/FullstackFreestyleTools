import { SeatPage } from '@/app/judge/_components/SeatPage';

export default function ExecutionSeatPage(props: {
  params: Promise<{ eventId: string; seat: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return <SeatPage slug="execution" {...props} />;
}
