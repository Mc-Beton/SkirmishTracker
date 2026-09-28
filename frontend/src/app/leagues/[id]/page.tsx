import { LeagueView } from "./league-view";

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeagueView id={id} />;
}
