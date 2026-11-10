import { TournamentListPage } from "@/components/ba-lists/list-page";

export default async function MyWarbandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentListPage tournamentId={id} />;
}
