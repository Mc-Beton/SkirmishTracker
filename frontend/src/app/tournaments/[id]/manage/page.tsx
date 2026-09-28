import { Suspense } from "react";
import { ManageTournament } from "./manage-tournament";

export default async function ManageTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ManageTournament id={id} />
    </Suspense>
  );
}
