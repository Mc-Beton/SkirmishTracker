# Drużyny graczy

Stała drużyna gracza (w kodzie „club", żeby nie mylić z drużynami turnieju drużynowego – tabele `teams`, `team_members`).

- **Model**: `clubs` (nazwa unikalna bez względu na wielkość liter, właściciel, hash linku), `club_members` (gracz należy
  do najwyżej jednej drużyny), `club_requests` (`INVITE` – właściciel zaprosił gracza, `REQUEST` – gracz prosi o przyjęcie).
  Migracja `V32__clubs.sql`. Dostęp przez JDBC (`ClubStore`), logika w `ClubService`, API `/api/clubs` (`ClubController`).
- **Dołączanie**: link drużyny (otwarcie po zalogowaniu = dołączenie), zaproszenie po nicku (gracz przyjmuje lub odrzuca),
  prośba gracza (zatwierdza właściciel). Zaproszenie i prośba w obie strony naraz = dołączenie.
- **Właściciel**: zmienia nazwę, zaprasza, przyjmuje i usuwa członków, tworzy/wyłącza link, przekazuje drużynę, rozwiązuje ją.
  Nie może odejść – najpierw przekazuje drużynę albo ją rozwiązuje. Każda metoda sprawdza, kto pyta.
- **`users.club`**: nazwa drużyny gracza, ustawiana przy dołączeniu, zmianie nazwy i odejściu. Czytają ją profil, ranking,
  sezony i preferencja „unikaj parowań z tej samej drużyny" (kopiowana do uczestnika turnieju przy zapisie). Pole w profilu
  nie jest już edytowalne; nazwy wpisane ręcznie przed wprowadzeniem drużyn zostają do czasu dołączenia gracza do drużyny.
- **Limity**: 100 członków, 60 otwartych zaproszeń/próśb na drużynę, 5 próśb jednego gracza naraz.
- **Powiadomienia**: `CLUB_INVITATION`, `CLUB_REQUEST`, `CLUB_DECISION`.
- **Frontend**: `/teams` (`app/teams/teams-view.tsx`), link w nagłówku dla zalogowanych, `/teams?invite=…` dla linku.
