#!/usr/bin/env python3
"""
Generates tools/seed/stats_player.sql: a complete test account "Tester" with 20 confirmed own games (warband
lists, missions, a rising ELO curve) plus 12 games between its opponents, so the profile statistics and the
ranking have something to show. Unlike test1_games.sql it does not need an existing account.

Accounts: seed-tester@example.invalid (nick Tester) and seed-<nick>@example.invalid for the opponents,
password DruzynyTest2026 (same as the other seed accounts). Deterministic and re-runnable: the SQL first
removes the games it created earlier (notes = '[seed-stats]').

Usage:  python3 tools/seed/make_stats_player.py
Run:    Get-Content tools/seed/stats_player.sql | docker compose exec -T postgres psql -U skirmish -d skirmish
"""
import datetime
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARMIES = json.loads((ROOT / "backend/src/main/resources/content/eldfall-armies.json").read_text(encoding="utf-8"))
OUT = ROOT / "tools/seed/stats_player.sql"
TAG = "[seed-stats]"
# Argon2id hash of DruzynyTest2026 (Spring Security defaults v5.8), shared by all seed accounts.
PASSWORD_HASH = "$argon2id$v=19$m=16384,t=2,p=1$ecJFJfDX8tXq7qgNWKm7yg$YMlEscuP0KId5BGmWRDiWQ5qDlb/QG6YCELO8qVr6YA"

rng = random.Random(20260929)
units = {u["code"]: u for u in ARMIES["units"]}
items = {i["code"]: i for i in ARMIES["items"]}
factions = {f["code"]: f for f in ARMIES["factions"]}
QUESTS = [q["code"] for q in json.loads((ROOT / "backend/src/main/resources/content/eldfall-core.json")
                                        .read_text(encoding="utf-8"))["quests"]]


def pool(faction, allied):
    f = factions[faction]
    codes = []
    for src in [faction, *f["alwaysAvailable"], *([allied] if allied else [])]:
        for c in ARMIES["lists"].get(src, []):
            if c not in codes:
                codes.append(c)
    return codes


def item_pool(faction):
    lists = ARMIES["itemLists"]
    return list(dict.fromkeys(lists.get("NEUTRAL", []) + lists.get(faction, [])))


def make_list(faction, allied=None, core=()):
    codes = pool(faction, allied)
    chosen = [c for c in core if c in codes]
    rest = [c for c in codes if c not in chosen]
    rng.shuffle(rest)
    chosen += rest[: max(0, rng.randint(3, 5) - len(chosen))]
    ipool = item_pool(faction)
    out, total = [], 0
    for i, c in enumerate(chosen):
        its = []
        for code in (rng.sample(ipool, k=rng.choice([0, 0, 1, 1, 2])) if ipool else []):
            its.append({"item": code, "reduced": False})
            total += items[code]["points"]
        total += units[c]["points"]
        out.append({"unit": c, "leader": i == 0, "items": its})
    return {"faction": faction, "alliedFaction": allied, "units": out, "totalPoints": total}


ME = "Tester"
# Tester mainly plays Sand Kingdoms, sometimes Soga, rarely the Adventurers' Guild.
MY_SETUPS = [
    ("SAND_KINGDOMS", None, ["VIZIER_OF_CONJURATIONS", "FARIS_OUTRIDER"]),
    ("SAND_KINGDOMS", None, ["SPELLDANCER_VOIDCASTER", "FARIS_OUTRIDER"]),
    ("EMPIRE_OF_SOGA", None, ["MUSHA_BLADEMASTER", "KITSUNE_SPELLMAIDEN"]),
    ("ADVENTURERS_GUILD", None, ["AMAZON_GLADIATRIX", "GUILDSWORN_KNIGHT"]),
]
MY_WEIGHTS = [6, 4, 4, 2]
OPPONENTS = {
    "Aldric": [("COALITION_OF_THENION", None, ["NIGHTSHADE"]), ("EMPIRE_OF_SOGA", None, ["GREAT_GUARD"])],
    "Brena": [("HELIAN_LEAGUE", None, ["FLAMEWEAVER_NOBLE", "PALADIN_OF_THE_ORDER"])],
    "Cador": [("GOBLIN_WARTRIBES", None, ["TROLL_PROWLER"]), ("ADVENTURERS_GUILD", None, [])],
    "Dara": [("EMPIRE_OF_SOGA", None, ["CLAN_CHAMPION"]), ("SAND_KINGDOMS", None, [])],
    "Eryk": [("ONI_CLANS", "UNDEAD", ["CHIYOHIME", "RED_RASETSU"]), ("ONI_CLANS", None, ["BLUE_YAKSHA"])],
    "Fenna": [("COALITION_OF_THENION", None, ["LUPUS_REX", "SLAYER_DRAGOON"])],
}
# Opponent strength (0–1): how often they beat Tester early on.
STRENGTH = {"Aldric": 0.5, "Brena": 0.65, "Cador": 0.35, "Dara": 0.45, "Eryk": 0.7, "Fenna": 0.4}
QUEST_WEIGHTS = [5, 4, 4, 3, 2, 2, 1][: len(QUESTS)]


def score(a_wins_prob):
    """Small points 0–10: winner 5–10, loser 0–(winner-1); ~1 in 8 games level."""
    if rng.random() < 0.125:
        v = rng.randint(3, 8)
        return v, v
    w = rng.randint(5, 10)
    l = rng.randint(0, w - 1)
    return (w, l) if rng.random() < a_wins_prob else (l, w)


today = datetime.date(2026, 9, 27)
games = []  # (player_a, player_b, small_a, small_b, played_on, quest, list_a, list_b)

# 20 games of Tester over ~6 months; the win rate grows over time, so the ELO curve climbs.
names = list(OPPONENTS)
for n in range(20):
    opp = names[(n * 5) % len(names)] if n % 4 else rng.choice(names)
    played = today - datetime.timedelta(days=(19 - n) * 9 + rng.randint(0, 3))
    progress = n / 19
    p_win = max(0.15, min(0.85, (1 - STRENGTH[opp]) * 0.7 + progress * 0.35))
    mine_score, their_score = score(p_win)
    setup = rng.choices(MY_SETUPS, weights=MY_WEIGHTS)[0]
    mine = make_list(*setup)
    theirs = make_list(*rng.choice(OPPONENTS[opp]))
    if n in (2, 11):          # two games recorded with factions only (no lists)
        mine = {"faction": mine["faction"], "none": True}
        theirs = {"faction": theirs["faction"], "none": True}
    quest = None if n in (5, 16) else rng.choices(QUESTS, weights=QUEST_WEIGHTS)[0]
    if n % 3 == 0:  # the opponent reported: sides swap
        games.append((opp, ME, their_score, mine_score, played, quest, theirs, mine))
    else:
        games.append((ME, opp, mine_score, their_score, played, quest, mine, theirs))

# 12 games between opponents, so the ranking has more than one moving player.
for n in range(12):
    a, b = rng.sample(names, 2)
    played = today - datetime.timedelta(days=rng.randint(5, 170))
    p = 0.5 + (STRENGTH[a] - STRENGTH[b]) * 0.6
    sa, sb = score(p)
    games.append((a, b, sa, sb, played, rng.choices(QUESTS, weights=QUEST_WEIGHTS)[0],
                  make_list(*rng.choice(OPPONENTS[a])), make_list(*rng.choice(OPPONENTS[b]))))


def q(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def list_sql(lst):
    return "NULL" if lst.get("none") else q(json.dumps(lst))


PROFILE = {ME: ("Klub Testowy", "Warszawa")}
lines = [
    "-- Generated by tools/seed/make_stats_player.py – test data only, do not run in production.",
    "-- Test account: seed-tester@example.invalid / DruzynyTest2026 (nick Tester).",
    "DO $$",
    "DECLARE",
    "    pa UUID;",
    "    pb UUID;",
    "    pwd TEXT := " + q(PASSWORD_HASH) + ";",
    "BEGIN",
    f"    DELETE FROM friendly_games WHERE notes = {q(TAG)};",
]
for name in [ME, *names]:
    club, city = PROFILE.get(name, (None, None))
    email = "seed-" + name.lower() + "@example.invalid"
    lines += [
        f"    SELECT id INTO pa FROM users WHERE lower(display_name) = lower({q(name)});",
        "    IF pa IS NULL THEN",
        "        INSERT INTO users (id, email, display_name, password_hash, email_verified_at, locale, club, home_city,",
        "                           created_at, updated_at)",
        f"        VALUES (gen_random_uuid(), {q(email)}, {q(name)}, pwd, now(), 'pl', {q(club)}, {q(city)},",
        "                now() - interval '200 days', now())",
        "        RETURNING id INTO pa;",
        "        INSERT INTO user_roles (user_id, role) VALUES (pa, 'USER');",
        f"    ELSIF (SELECT email FROM users WHERE id = pa) <> {q(email)} THEN",
        f"        RAISE EXCEPTION 'Nick {name} jest zajęty przez inne konto – zmień nazwę w make_stats_player.py';",
        "    ELSE",
        "        UPDATE users SET password_hash = coalesce(password_hash, pwd) WHERE id = pa;",
        "    END IF;",
    ]
for a, b, sa, sb, played, quest, la, lb in games:
    lines += [
        f"    SELECT id INTO pa FROM users WHERE lower(display_name) = lower({q(a)});",
        f"    SELECT id INTO pb FROM users WHERE lower(display_name) = lower({q(b)});",
        "    INSERT INTO friendly_games (id, player_a, player_b, small_a, small_b, played_on, scenario_code, faction_a,",
        "        faction_b, league_id, notes, status, reported_by, created_at, decided_at, list_a, list_b)",
        f"    VALUES (gen_random_uuid(), pa, pb, {sa}, {sb}, DATE {q(played.isoformat())}, {q(quest)},",
        f"        {q(la['faction'])}, {q(lb['faction'])}, NULL, {q(TAG)}, 'CONFIRMED', pa, now(), now(),",
        f"        {list_sql(la)}, {list_sql(lb)});",
    ]
mine_count = sum(1 for g in games if ME in (g[0], g[1]))
lines += [f"    RAISE NOTICE 'Dodano % gier (w tym % gracza Tester)', {len(games)}, {mine_count};", "END $$;", ""]
OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"{len(games)} games ({mine_count} of {ME}) -> {OUT.relative_to(ROOT)}")
