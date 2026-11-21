// Players' teams ("Drużyny"): a player founds a team and owns it; others join by its link, by the owner's invitation
// or by asking (the owner accepts). Not the teams of a team tournament (lib/tournaments.ts).

export type ClubPerson = { id: string; name: string; since: string };
export type ClubListed = { id: string; name: string; owner: string; members: number };
export type ClubView = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  members: ClubPerson[];
  you: "OWNER" | "MEMBER" | "INVITED" | "REQUESTED" | "NONE";
  /** For the owner: players they invited and players who asked to join. */
  invitations: ClubPerson[];
  requests: ClubPerson[];
  hasLink: boolean;
};
/** The player's own team, the teams that invited them and the teams they asked to join. */
export type MyClubs = { club: ClubView | null; invitations: ClubListed[]; requests: ClubListed[] };
