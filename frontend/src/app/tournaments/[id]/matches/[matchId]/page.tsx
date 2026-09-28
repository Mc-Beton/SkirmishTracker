import { GameTracker } from "./game-tracker";

export default async function GamePage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  return <GameTracker tournamentId={id} matchId={matchId} />;
}
