import { WarbandEditor } from "@/components/warbands/warband-editor";

export default async function WarbandPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  return <WarbandEditor tournamentId={id} userId={userId} />;
}
