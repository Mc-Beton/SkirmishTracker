import { WarbandEditor } from "@/components/warbands/warband-editor";

export default async function MyWarbandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WarbandEditor tournamentId={id} />;
}
