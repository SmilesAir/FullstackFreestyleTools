import { SeatPage } from '@/app/judge/_components/SeatPage';

export default function ArtisticImpressionSeatPage(props: {
  params: Promise<{ eventId: string; seat: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return <SeatPage slug="artistic-impression" {...props} />;
}
