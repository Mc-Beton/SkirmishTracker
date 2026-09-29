#!/usr/bin/env python3
"""
Generates tools/seed/demo_meta.sql: a DEMO community for the publisher reports (/admin/reports).

48 players from PL, PT, ES and DE, 18 finished tournaments (Swiss, 3–5 rounds, missions per round, warband
lists) and ~420 own games between January and September 2026 – roughly 830 rated games. Everything is marked:
tournament names start with "[DEMO]", own games carry notes = '[demo]', accounts use
demo-<nick>@example.invalid. Re-running the SQL first removes the previous demo data.

Results are simulated from hidden "true" effects, so the report has real findings to show:
  * Oni Clans are the most played faction and the favourite of the strongest players; their results are
    explained by the players' ELO (no surplus).
  * Helian League is genuinely strong – thanks to Paladin of the Order – until the (fictional) errata of
    2026-07-01 that removes the Paladin's edge (compare date ranges before / after).
  * Sand Kingdoms are weak overall but strong in Treasure Hunt.
  * Empire of Soga is clearly below expectation: its players love Great Guard and the Imported Crossbow.
  * Goblin Wartribes appear only from April; the Adventurers' Guild is played by too few people to report.
  * Snail Chase ends in a draw far more often than other missions.
  * Items: King of the Battlefield (2 pts) is underpriced, the Imported Crossbow (5 pts) overpriced, the
    Flying Carpet is strong but nearly always carried by the Vizier of Conjurations, and four items are
    never taken (Camaraderie, Glyphscribe: Reduce Weight, Devotion: Paimon, Kassen Buki: Kanabou-tsukai).

Accounts (password DruzynyTest2026 like the other seed accounts):
  demo-wydawca@example.invalid    role PUBLISHER – log in as the publisher and open /admin/reports
  demo-<nick>@example.invalid     players, demo-organizator@example.invalid owns the tournaments

Usage:  python3 tools/seed/make_demo_meta.py
Run:    docker compose exec -T postgres psql -U skirmish -d skirmish < tools/seed/demo_meta.sql      (Git Bash)
Remove: docker compose exec -T postgres psql -U skirmish -d skirmish < tools/seed/demo_meta_remove.sql
"""
import datetime as dt
import json
import math
import random
import unicodedata
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARMIES = json.loads((ROOT / "backend/src/main/resources/content/eldfall-armies.json").read_text(encoding="utf-8"))
OUT = ROOT / "tools/seed/demo_meta.sql"
OUT_REMOVE = ROOT / "tools/seed/demo_meta_remove.sql"
# Argon2id hash of DruzynyTest2026 (Spring Security defaults v5.8), shared by all seed accounts.
PASSWORD_HASH = "$argon2id$v=19$m=16384,t=2,p=1$ecJFJfDX8tXq7qgNWKm7yg$YMlEscuP0KId5BGmWRDiWQ5qDlb/QG6YCELO8qVr6YA"

rng = random.Random(20261001)


def ascii_slug(nick):
    """demo-<nick>@example.invalid needs a plain ASCII local part (ł/ż/á … → l/z/a)."""
    s = unicodedata.normalize("NFKD", nick.lower().replace("ł", "l"))
    return "".join(c for c in s if c.isascii() and c.isalnum())


def uid():
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


units = {u["code"]: u for u in ARMIES["units"]}
items = {i["code"]: i for i in ARMIES["items"]}
factions = {f["code"]: f for f in ARMIES["factions"]}

ONI, HEL, COA, SOGA, SAND, GOB, AG = ("ONI_CLANS", "HELIAN_LEAGUE", "COALITION_OF_THENION", "EMPIRE_OF_SOGA",
                                      "SAND_KINGDOMS", "GOBLIN_WARTRIBES", "ADVENTURERS_GUILD")
ERRATA = dt.date(2026, 7, 1)
GOBLIN_RELEASE = dt.date(2026, 4, 1)
START = dt.date(2026, 1, 10)
END = dt.date(2026, 9, 26)

# Hidden truth (logit units, ~0.25 ≈ 6 percentage points in an even game).
FACTION_BASE = {ONI: -0.15, HEL: 0.0, COA: 0.1, SOGA: 0.15, SAND: -0.25, GOB: -0.1, AG: 0.0}
UNIT_POWER = {
    "PALADIN_OF_THE_ORDER": (0.9, 0.0),   # (before errata, after errata)
    "GREAT_GUARD": (-0.55, -0.55),
    "LUPUS_REX": (0.35, 0.35),
    "TROLL_PROWLER": (0.4, 0.4),
}
# How often a faction's list includes a highlighted character.
PICK = {"PALADIN_OF_THE_ORDER": 0.75, "GREAT_GUARD": 0.6, "LUPUS_REX": 0.4, "TROLL_PROWLER": 0.55,
        "VIZIER_OF_CONJURATIONS": 0.6}
# Items: hidden effect (logit), how often a list buys one copy, and items nobody takes.
ITEM_POWER = {"KING_OF_THE_BATTLEFIELD": 0.55, "IMPORTED_CROSSBOW": -0.5, "FLYING_CARPET": 0.8}
ITEM_PICK = {"KING_OF_THE_BATTLEFIELD": 0.4, "IMPORTED_CROSSBOW": 0.25, "FLYING_CARPET": 0.6}
DEAD_ITEMS = {"CAMARADERIE", "GLYPHSCRIBE_REDUCE_WEIGHT", "DEVOTION_PAIMON", "KASSEN_BUKI_KANABOU_TSUKAI"}
MISSION_BONUS = {(SAND, "TREASURE_HUNT"): 0.9}
QUESTS = [q["code"] for q in json.loads((ROOT / "backend/src/main/resources/content/eldfall-core.json")
                                        .read_text(encoding="utf-8"))["quests"]]
DRAW_RATE = {"SNAIL_CHASE": 0.26}

NICKS = {
    "PL": ["Wilkołak", "Szeptucha", "Borsuk", "Kruk", "Mściwój", "Jaskier", "Rogata", "Zbrojmir", "Dziewanna",
           "Topielec", "Żmij", "Welesław", "Grzmot", "Sokolica", "Ogar", "Bies", "Rusałka", "Lutomir", "Jastrząb",
           "Kostrzewa", "Tur", "Mora"],
    "PT": ["Navegador", "Corsário", "Lusitano", "Faroleiro", "Alquimista", "Cartógrafo", "Tempestade", "Condestável",
           "Marinheira", "Trovador", "Galeão", "Albatroz"],
    "ES": ["Hidalgo", "Morisca", "Conquista", "Alcaide", "Bandolero", "Almogávar", "Tercio", "Duende", "Sereno",
           "Caballera"],
    "DE": ["Landsknecht", "Hexer", "Wanderer", "Eisenfaust"],
}
CITIES = {"PL": ["Warszawa", "Kraków", "Puławy", "Wrocław", "Gdańsk"], "PT": ["Lisboa", "Porto", "Coimbra"],
          "ES": ["Madrid", "Barcelona", "Valencia"], "DE": ["Berlin"]}


def pool(faction):
    f = factions[faction]
    codes = []
    for src in [faction, *f["alwaysAvailable"]]:
        for c in ARMIES["lists"].get(src, []):
            if c not in codes:
                codes.append(c)
    return codes


def item_pool(faction):
    lists = ARMIES["itemLists"]
    return list(dict.fromkeys(lists.get("NEUTRAL", []) + lists.get(faction, [])))


def make_list(faction):
    codes = pool(faction)
    chosen = [c for c in PICK if c in codes and rng.random() < PICK[c]]
    rest = [c for c in codes if c not in chosen and c not in PICK]
    rng.shuffle(rest)
    chosen += rest[: max(0, rng.randint(4, 5) - len(chosen))]
    rng.shuffle(chosen)
    ipool = [c for c in item_pool(faction) if c not in DEAD_ITEMS and c not in ITEM_PICK]
    out = [{"unit": c, "leader": i == 0, "items": []} for i, c in enumerate(chosen)]
    for u in out:
        for code in (rng.sample(ipool, k=rng.choice([0, 0, 0, 1, 1, 2])) if ipool else []):
            u["items"].append({"item": code, "reduced": False})
    available = set(item_pool(faction))
    for code, chance in ITEM_PICK.items():
        if code in available and rng.random() < chance:
            if code == "FLYING_CARPET":  # the Vizier's carpet – nearly inseparable
                carrier = next((u for u in out if u["unit"] == "VIZIER_OF_CONJURATIONS"), None)
                if carrier is None and rng.random() < 0.85:
                    continue
                carrier = carrier or rng.choice(out)
            elif code == "KING_OF_THE_BATTLEFIELD":
                carrier = out[0]  # on the leader
            else:
                carrier = rng.choice(out)
            carrier["items"].append({"item": code, "reduced": False})
    total = sum(units[u["unit"]]["points"] + sum(items[x["item"]]["points"] for x in u["items"]) for u in out)
    return out, total


def list_power(unit_list, day):
    k = 0 if day < ERRATA else 1
    power = sum(UNIT_POWER[u["unit"]][k] for u in unit_list if u["unit"] in UNIT_POWER)
    return power + sum(ITEM_POWER.get(i["item"], 0) for u in unit_list for i in u["items"])


# ------------------------------------------------------------------ players

players = []  # dict(id, nick, country, city, skill, main, second)
for country, nicks in NICKS.items():
    for nick in nicks:
        players.append({"id": uid(), "nick": nick, "country": country, "city": rng.choice(CITIES[country]),
                        "skill": rng.gauss(1500, 110)})
players.sort(key=lambda p: -p["skill"])
POPULAR = [(ONI, 18), (HEL, 17), (COA, 17), (SOGA, 16), (SAND, 14), (GOB, 12)]
for rank, p in enumerate(players):
    if rank in (7, 23, 40):  # three dedicated Adventurers' Guild players – too few to report on their own
        p["main"] = AG
    elif rank < 14 and rng.random() < 0.55:  # strong players gravitate to Oni
        p["main"] = ONI
    else:
        p["main"] = rng.choices([f for f, _ in POPULAR], weights=[w for _, w in POPULAR])[0]
    p["second"] = rng.choice([f for f, _ in POPULAR if f != p["main"]])
by_country = {c: [p for p in players if p["country"] == c] for c in NICKS}


def faction_for(p, day):
    f = p["main"] if rng.random() < 0.82 else p["second"]
    if f == GOB and day < GOBLIN_RELEASE:
        f = p["second"] if p["second"] != GOB else HEL
    if f == GOB and day < GOBLIN_RELEASE:
        f = COA
    return f


def play(a, b, fa, fb, la, lb, mission, day):
    """Returns (vp_a, vp_b) from the hidden model."""
    logit = (a["skill"] - b["skill"]) / 400 * math.log(10)
    logit += FACTION_BASE[fa] - FACTION_BASE[fb]
    logit += list_power(la, day) - list_power(lb, day)
    logit += MISSION_BONUS.get((fa, mission), 0) - MISSION_BONUS.get((fb, mission), 0)
    if rng.random() < DRAW_RATE.get(mission, 0.08):
        v = rng.randint(3, 9)
        return v, v
    winner = rng.randint(6, 13)
    loser = rng.randint(0, winner - 1)
    return (winner, loser) if rng.random() < 1 / (1 + math.exp(-logit)) else (loser, winner)


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def ts(d, hour=10, minute=0):
    return f"TIMESTAMPTZ '{d.isoformat()} {hour:02d}:{minute:02d}:00+00'"


sql = []


def insert(table, cols, rows):
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        sql.append(f"INSERT INTO {table} ({', '.join(cols)}) VALUES\n" + ",\n".join(
            "(" + ", ".join(r) + ")" for r in chunk) + ";")


# ------------------------------------------------------------------ accounts

organizer = {"id": uid(), "nick": "Organizator Demo", "email": "demo-organizator@example.invalid"}
publisher = {"id": uid(), "nick": "Wydawca Demo", "email": "demo-wydawca@example.invalid"}
created = ts(START - dt.timedelta(days=30))
user_rows = [[q(p["id"]), q(f"demo-{ascii_slug(p['nick'])}@example.invalid"), q(p["nick"]), "pwd", created, q("pl"),
              q(f"[DEMO] Klub {p['city']}"), q(p["city"]), created, created] for p in players]
user_rows += [[q(u["id"]), q(u["email"]), q(u["nick"]), "pwd", created, q("pl"), "NULL", "NULL", created, created]
              for u in (organizer, publisher)]

# ------------------------------------------------------------------ tournaments

T_PLAN = []  # (date, country, city, tier, size, rounds, name)
names = ["Puchar Wisły", "Liga Północy", "Taça do Tejo", "Copa Levante", "Kraków Clash", "Torneio do Porto",
         "Masters Polska", "Open Madrid", "Puławy Skirmish", "Gdańsk Cup", "Lisboa Masters", "Eldfall Europe Cup",
         "Warszawska Arena", "Coimbra Open", "Barcelona Duel", "Wrocław Night", "Berlin Grenzland", "Finał Sezonu"]
day = START + dt.timedelta(days=7)
for i, name in enumerate(names):
    if "Europe" in name:
        country, tier, size = "PL", "INTERNATIONAL", 24
    elif "Masters" in name or "Finał" in name:
        country, tier, size = ("PT" if "Lisboa" in name else "PL"), "MASTER", 16
    else:
        country = {"Taça": "PT", "Torneio": "PT", "Coimbra": "PT", "Copa": "ES", "Open Madrid": "ES",
                   "Barcelona": "ES", "Berlin": "DE"}
        country = next((v for k, v in country.items() if k in name), "PL")
        tier, size = "LOCAL", rng.choice([8, 10, 12])
    city = next((c for c in sum(CITIES.values(), []) if c.split()[0][:5] in name), rng.choice(CITIES[country]))
    rounds = 5 if tier != "LOCAL" else rng.choice([3, 4])
    T_PLAN.append((day, country, city, tier, size, rounds, f"[DEMO] {name}"))
    day += dt.timedelta(days=rng.randint(10, 17))

t_rows, part_rows, war_rows, round_rows, match_rows = [], [], [], [], []
games_total = 0
for (tday, country, city, tier, size, n_rounds, name) in T_PLAN:
    tid = uid()
    local = by_country[country] if country != "DE" else by_country["DE"] + by_country["PL"]
    field = rng.sample(local, min(size, len(local)))
    if tier != "LOCAL" or len(field) < size:
        others = [p for p in players if p not in field]
        field += rng.sample(others, size - len(field))
    if len(field) % 2:
        field = field[:-1]
    t_rows.append([q(tid), q(organizer["id"]), q(name), q("Turniej demonstracyjny (dane wygenerowane)."),
                   ts(tday, 9), ts(tday, 20), q(city), q(country), q(tier), q("SWISS"), q(len(field)), q(n_rounds),
                   q("FINISHED"), ts(tday - dt.timedelta(days=21)), ts(tday, 20)])
    sides = {}
    for p in field:
        f = faction_for(p, tday)
        lst, total = make_list(f)
        sides[p["id"]] = (f, lst)
        stored = [{"unit": u["unit"], "extraPoints": 0, "notes": None, "leader": u["leader"], "items": u["items"]}
                  for u in lst]
        part_rows.append([q(uid()), q(tid), q(p["id"]), q("REGISTERED"), ts(tday - dt.timedelta(days=14)), "TRUE",
                          q("APPROVED"), q(p["city"]), q(f)])
        war_rows.append([q(uid()), q(tid), q(p["id"]), q(f), "NULL", q(rng.randint(3, 6)), q(total),
                         q(json.dumps(stored)), ts(tday - dt.timedelta(days=10)), ts(tday - dt.timedelta(days=10))])
    points = {p["id"]: 0 for p in field}
    met = set()
    missions = rng.sample(QUESTS, k=min(n_rounds, len(QUESTS)))
    for r in range(1, n_rounds + 1):
        rid = uid()
        mission = missions[r - 1]
        start_h = 10 + (r - 1) * 2 + (r - 1) // 2
        round_rows.append([q(rid), q(tid), q(r), q("COMPLETED"), "3", "0", ts(tday, start_h), ts(tday, start_h),
                           ts(tday, start_h + 2), q(mission)])
        order = sorted(field, key=lambda p: (-points[p["id"]], rng.random()))
        pairs = []
        while order:
            a = order.pop(0)
            j = next((k for k, b in enumerate(order) if frozenset((a["id"], b["id"])) not in met), 0)
            b = order.pop(j)
            met.add(frozenset((a["id"], b["id"])))
            pairs.append((a, b))
        for table, (a, b) in enumerate(pairs, start=1):
            fa, la = sides[a["id"]]
            fb, lb = sides[b["id"]]
            va, vb = play(a, b, fa, fb, la, lb, mission, tday)
            points[a["id"]] += 3 if va > vb else 1 if va == vb else 0
            points[b["id"]] += 3 if vb > va else 1 if va == vb else 0
            match_rows.append([q(uid()), q(rid), q(tid), q(table), q(a["id"]), q(b["id"]), q("PLAYED"), q(va), q(vb),
                               q("CONFIRMED"), q(a["id"]), ts(tday, start_h + 2), q(b["id"]), ts(tday, start_h + 2)])
            games_total += 1

# ------------------------------------------------------------------ own games

own_rows = []
span = (END - START).days
for _ in range(420):
    day = START + dt.timedelta(days=rng.randint(0, span))
    country = rng.choices(list(NICKS), weights=[22, 12, 10, 4])[0]
    local = by_country[country] if rng.random() < 0.9 else players
    a, b = rng.sample(local, 2)
    fa, fb = faction_for(a, day), faction_for(b, day)
    la, _ = make_list(fa)
    lb, _ = make_list(fb)
    mission = rng.choice(QUESTS) if rng.random() < 0.8 else None
    va, vb = play(a, b, fa, fb, la, lb, mission, day)
    kind = rng.random()
    if kind < 0.85:
        list_a = json.dumps({"faction": fa, "alliedFaction": None, "units": la, "totalPoints": 0})
        list_b = json.dumps({"faction": fb, "alliedFaction": None, "units": lb, "totalPoints": 0})
    else:
        list_a = list_b = None
    if kind > 0.95:
        fa_s, fb_s = None, None  # reported without factions
    else:
        fa_s, fb_s = fa, fb
    own_rows.append([q(uid()), q(a["id"]), q(b["id"]), q(va), q(vb), f"DATE '{day.isoformat()}'", q(mission), q(fa_s),
                     q(fb_s), "NULL", q("[demo]"), q("CONFIRMED"), q(a["id"]), ts(day, 18), ts(day, 20), q(list_a),
                     q(list_b)])
    games_total += 1

# ------------------------------------------------------------------ SQL

REMOVE = """DELETE FROM tournaments WHERE name LIKE '[DEMO]%';
DELETE FROM friendly_games WHERE notes = '[demo]'
    OR player_a IN (SELECT id FROM users WHERE email LIKE 'demo-%@example.invalid')
    OR player_b IN (SELECT id FROM users WHERE email LIKE 'demo-%@example.invalid');
DELETE FROM league_members WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'demo-%@example.invalid');
DELETE FROM users WHERE email LIKE 'demo-%@example.invalid';"""

header = ["-- Generated by tools/seed/make_demo_meta.py – DEMO data for the publisher reports, never run in production.",
          f"-- {len(players)} players, {len(T_PLAN)} tournaments, {games_total} rated games. "
          "Publisher login: demo-wydawca@example.invalid / DruzynyTest2026.",
          "BEGIN;", REMOVE]
sql.append("CREATE TEMP TABLE demo_pwd (h TEXT) ON COMMIT DROP;")
sql.append(f"INSERT INTO demo_pwd VALUES ({q(PASSWORD_HASH)});")
insert("users", ["id", "email", "display_name", "password_hash", "email_verified_at", "locale", "club", "home_city",
                 "created_at", "updated_at"],
       [[r[0], r[1], r[2], "(SELECT h FROM demo_pwd)", *r[4:]] for r in user_rows])
insert("user_roles", ["user_id", "role"], [[r[0], q("USER")] for r in user_rows] + [[q(publisher["id"]), q("PUBLISHER")]])
insert("tournaments", ["id", "owner_id", "name", "description", "starts_at", "ends_at", "city", "country",
                       "tournament_rank", "format", "max_players", "rounds_planned", "status", "created_at",
                       "updated_at"], t_rows)
insert("tournament_participants", ["id", "tournament_id", "user_id", "status", "registered_at", "paid", "list_status",
                                   "city", "faction"], part_rows)
insert("warbands", ["id", "tournament_id", "user_id", "faction", "allied_faction", "leader_int", "total_points",
                    "units", "created_at", "updated_at"], war_rows)
insert("tournament_rounds", ["id", "tournament_id", "number", "status", "bye_big_points", "bye_small_points",
                             "created_at", "started_at", "completed_at", "scenario_code"], round_rows)
insert("tournament_matches", ["id", "round_id", "tournament_id", "table_number", "player_a", "player_b",
                              "result_type", "small_a", "small_b", "status", "reported_by", "reported_at",
                              "confirmed_by", "confirmed_at"], match_rows)
insert("friendly_games", ["id", "player_a", "player_b", "small_a", "small_b", "played_on", "scenario_code",
                          "faction_a", "faction_b", "league_id", "notes", "status", "reported_by", "created_at",
                          "decided_at", "list_a", "list_b"], own_rows)
footer = ["COMMIT;", f"\\echo 'Demo: {len(players)} graczy, {len(T_PLAN)} turniejów, {games_total} gier. "
          "Wydawca: demo-wydawca@example.invalid'", ""]
OUT.write_text("\n".join(header + sql + footer), encoding="utf-8")
OUT_REMOVE.write_text("-- Removes the DEMO data created by tools/seed/demo_meta.sql.\nBEGIN;\n" + REMOVE +
                      "\nCOMMIT;\n", encoding="utf-8")
print(f"{len(players)} players, {len(T_PLAN)} tournaments, {games_total} games -> {OUT.relative_to(ROOT)}")
