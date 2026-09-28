import { PlayerProfileView } from "./player-profile";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayerProfileView id={id} />;
}
