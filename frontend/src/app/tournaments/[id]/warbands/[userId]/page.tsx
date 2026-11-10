import { TournamentListPage } from "@/components/ba-lists/list-page";

export default async function WarbandPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  return <TournamentListPage tournamentId={id} userId={userId} />;
}
