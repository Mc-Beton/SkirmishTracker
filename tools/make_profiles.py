"""Builds eldfall-profiles.json: model stats for the online table (WarBracket online play).

Source: faction profile cards (eld docs, 2026-10-12), transcribed by hand from card images.
Only numeric stats, size, classes and the NAMES of traits/skills that matter for movement and
line of sight are stored - no rules text (copyright).
"""
import json, sys

# Usage (repo root): python3 tools/make_profiles.py backend/src/main/resources/content/eldfall-armies.json

A = ["OFF", "DEF", "ACC", "INT", "AG", "T", "M"]

# code, name, factions, classes, size, (STA, SPD, ARM, HP), (OFF..M), movement/LoS keywords
P = [
 ("NIGHTSHADE","Nightshade",["COALITION_OF_THENION"],["ASSASSIN","ROGUE"],"MEDIUM",(2,6,1,1),(17,8,10,13,16,10,8),["DUAL_WIELD","FLICKER","INFILTRATION_II","STEALTH_II"]),
 ("RANGERS_GUILD_HUNTER","Rangers-Guild Hunter",["COALITION_OF_THENION"],["ASSASSIN","RANGER"],"MEDIUM",(2,6,2,1),(13,8,14,10,13,10,10),["SURVIVAL:FOREST,DIFFICULT","CLIMBING","INFILTRATION_I","STEALTH_II","TRACKING"]),
 ("THENRIN_SWASHBUCKLER","Thenrin Swashbuckler",["COALITION_OF_THENION","ADVENTURERS_GUILD"],["ROGUE","WARRIOR"],"MEDIUM",(2,6,3,2),(15,10,10,11,13,12,10),["DASH","DUAL_WIELD"]),
 ("NIGHT_TEMPLE_PRIESTESS","Night-Temple Priestess",["COALITION_OF_THENION"],["ENCHANTER","MAGE"],"LARGE",(2,5,2,1),(13,8,8,14,14,12,8),["FLIGHT","LEAP"]),
 ("SLAYER_DRAGOON","Slayer Dragoon",["COALITION_OF_THENION","ADVENTURERS_GUILD"],["ASSASSIN","RIDER"],"MEDIUM",(2,6,5,2),(17,8,8,10,12,12,15),["DASH","FOLLOW_UP"]),
 ("BLADEBRETHREN_ELITE","Bladebrethren Elite",["COALITION_OF_THENION"],["ROGUE","WARRIOR"],"MEDIUM",(2,6,3,2),(16,13,11,11,14,12,12),["DASH","DUAL_WIELD","FOLLOW_UP","STEALTH_I"]),
 ("HIRED_BLADE","Hired Blade",["COALITION_OF_THENION","ADVENTURERS_GUILD"],["ASSASSIN","ROGUE"],"MEDIUM",(2,6,1,1),(15,8,10,10,14,10,8),["DUAL_WIELD","INFILTRATION_II","STEALTH_II"]),
 ("THAROS_ONE_EYED_WOLF","Tharos, One-Eyed Wolf",["COALITION_OF_THENION"],["ALCHEMIST","ROGUE"],"MEDIUM",(2,6,3,2),(13,10,14,13,13,12,12),["CLAIRVOYANCE","SURVIVAL:DIFFICULT,HAZY","CLIMBING","STEALTH_II"]),
 ("CLAN_CHAMPION","Clan Champion",["EMPIRE_OF_SOGA"],["ARMSMASTER","WARRIOR"],"MEDIUM",(2,5,5,3),(16,12,12,13,10,13,17),["VIGILANCE","DASH"]),
 ("BUSHI_ATTENDANT","Bushi Attendant",["EMPIRE_OF_SOGA"],["WARRIOR"],"MEDIUM",(2,5,4,2),(12,10,12,10,10,13,16),[]),
 ("ONITAOSHI","Onitaoshi",["EMPIRE_OF_SOGA","ADVENTURERS_GUILD"],["ARMSMASTER","WARRIOR"],"MEDIUM",(2,6,6,3),(16,10,8,10,10,13,17),[]),
 ("KITSUNE_SPELLMAIDEN","Kitsune Spellmaiden",["EMPIRE_OF_SOGA"],["MYSTIC"],"MEDIUM",(2,6,1,1),(8,8,8,14,14,8,15),["ACUTE_SENSES","VIGILANCE"]),
 ("MUSHA_BOWMASTER","Musha Bowmaster",["EMPIRE_OF_SOGA"],["MARKSMAN","WARRIOR"],"MEDIUM",(2,5,2,2),(12,12,14,10,11,13,17),[]),
 ("MUSHA_BLADEMASTER","Musha Blademaster",["EMPIRE_OF_SOGA","ADVENTURERS_GUILD"],["BERSERKER","WARRIOR"],"MEDIUM",(2,5,2,2),(14,12,12,10,11,13,17),[]),
 ("SCHOLAR_OF_THE_TRUE_WORD","Scholar of the True Word",["EMPIRE_OF_SOGA","ADVENTURERS_GUILD"],["ARTIFICER","MYSTIC"],"MEDIUM",(2,5,1,2),(12,12,8,13,10,13,16),[]),
 ("GREAT_GUARD","Great Guard",["EMPIRE_OF_SOGA"],["SENTINEL","WARRIOR"],"MEDIUM",(2,4,7,3),(12,16,10,10,8,13,17),["VIGILANCE","WATCHFUL"]),
 ("SEIGEN_OF_THE_KESHOBARAI","Seigen, of the Keshōbarai",["EMPIRE_OF_SOGA"],["RANGER","SENTINEL"],"MEDIUM",(2,5,6,3),(14,16,12,13,11,13,17),["VIGILANCE"]),
 ("EXPEDITIONARY_HIEROPHANT","Expeditionary Hierophant",["HELIAN_LEAGUE"],["MAGE","VITALIST"],"MEDIUM",(2,5,4,1),(8,8,8,15,11,8,12),["CLAIRVOYANCE"]),
 ("CITADEL_GUARD","Citadel Guard",["HELIAN_LEAGUE"],["SENTINEL","SOLDIER"],"MEDIUM",(2,4,6,2),(12,16,8,12,10,12,14),["VIGILANCE","FOLLOW_UP"]),
 ("FLAMESHAPER","Flameshaper",["HELIAN_LEAGUE"],["SOLDIER","SORCERER"],"MEDIUM",(2,6,1,1),(8,8,8,12,12,8,12),[]),
 ("HELRIN_EXPATRIATE","Helrin Expatriate",["HELIAN_LEAGUE","ADVENTURERS_GUILD"],["ARTIFICER","RANGER"],"MEDIUM",(2,5,6,2),(13,13,8,10,10,12,16),["SURVIVAL:DIFFICULT,FOREST"]),
 ("FLAMEWEAVER_ERRANT","Flameweaver Errant",["HELIAN_LEAGUE"],["ARTIFICER","SOLDIER"],"MEDIUM",(2,5,3,2),(14,14,8,13,12,12,16),[]),
 ("FLAMEWEAVER_NOBLE","Flameweaver Noble",["HELIAN_LEAGUE"],["ENCHANTER","MAGE"],"MEDIUM",(2,5,3,2),(8,10,8,14,12,8,12),[]),
 ("PALADIN_OF_THE_ORDER","Paladin of the Order",["HELIAN_LEAGUE"],["MYSTIC","SOLDIER"],"MEDIUM",(2,5,6,2),(14,14,10,12,10,12,15),[]),
 ("EONIAN_RUNNER","Eonian Runner",["HELIAN_LEAGUE","ADVENTURERS_GUILD"],["RANGER"],"MEDIUM",(2,6,3,2),(12,10,14,8,12,13,12),["TRACKING","LEAP","HIT_AND_RETREAT"]),
 ("ANARI_ERUDITE_PRODIGY","Anari, Erudite Prodigy",["HELIAN_LEAGUE"],["ENCHANTER","MAGE"],"MEDIUM",(2,5,3,2),(9,9,8,16,12,8,12),[]),
 ("VIZIER_OF_CONJURATIONS","Vizier of Conjurations",["SAND_KINGDOMS"],["MAGE","SUMMONER"],"MEDIUM",(2,5,0,1),(8,8,8,16,10,8,8),[]),
 ("ACADEMY_EXPEDITIONER","Academy Expeditioner",["SAND_KINGDOMS"],["MAGE","SORCERER"],"MEDIUM",(2,5,4,2),(10,8,8,14,10,10,12),["SURVIVAL:SCORCHING"]),
 ("TASKMAGE_EXPLORER","Taskmage Explorer",["SAND_KINGDOMS","ADVENTURERS_GUILD"],["MAGE","WIZARD"],"MEDIUM",(2,5,0,1),(8,8,8,14,12,10,12),["SURVIVAL:SCORCHING","STEALTH_I","TRACKING"]),
 ("FARIS_OUTRIDER","Faris Outrider",["SAND_KINGDOMS"],["ARTIFICER","ROGUE"],"MEDIUM",(2,5,1,2),(14,11,8,13,12,13,12),["SURVIVAL:SCORCHING","FOLLOW_UP","STEALTH_I"]),
 ("SPELLDANCER_VOIDCASTER","Spelldancer Voidcaster",["SAND_KINGDOMS"],["ARTIFICER","WIZARD"],"MEDIUM",(2,6,0,1),(8,8,8,12,14,8,12),["SURVIVAL:SCORCHING","HIT_AND_RETREAT"]),
 ("SPELLDANCER_AEROTURGE","Spelldancer Aeroturge",["SAND_KINGDOMS"],["ENCHANTER","MAGE"],"MEDIUM",(2,6,0,1),(8,8,8,12,14,8,12),["SURVIVAL:SCORCHING"]),
 ("NARA_VEIL_WATCHER","Na’ra, Veil Watcher",["SAND_KINGDOMS"],["ARTIFICER"],"MEDIUM",(2,7,0,2),(15,12,8,13,13,12,14),["ACUTE_SENSES","SURVIVAL:SCORCHING,DARK","CLIMBING","DASH","HIT_AND_RETREAT","LEAP","STEALTH_I"]),
 ("ONI_MARAUDER","Oni Marauder",["ONI_CLANS"],["CREATURE"],"HUGE",(2,5,3,4),(14,10,8,8,8,15,14),["SURVIVAL:DIFFICULT","LEAP"]),
 ("RED_RASETSU","Red Rasetsu",["ONI_CLANS"],["BERSERKER"],"MEDIUM",(3,6,3,6),(16,13,13,10,13,15,16),["SURVIVAL:DIFFICULT","DASH","LEAP"]),
 ("BLUE_RASETSU","Blue Rasetsu",["ONI_CLANS"],["SENTINEL"],"MEDIUM",(3,6,3,4),(13,16,13,15,13,15,16),["SURVIVAL:DIFFICULT","VIGILANCE"]),
 ("RED_YAKSHA","Red Yaksha",["ONI_CLANS"],["CREATURE"],"LARGE",(3,5,3,5),(16,12,8,12,13,15,14),["SURVIVAL:DIFFICULT","DASH","HIT_AND_RETREAT","LEAP","STEALTH_I"]),
 ("BLUE_YAKSHA","Blue Yaksha",["ONI_CLANS"],["CREATURE"],"LARGE",(3,5,3,4),(15,13,10,12,14,15,14),["SURVIVAL:DIFFICULT","FLICKER","HIT_AND_RETREAT","STEALTH_I"]),
 ("CHIYOHIME","Chiyohime",["ONI_CLANS"],["MAGE","SORCERER"],"MEDIUM",(3,5,3,4),(12,12,10,17,13,15,16),["SURVIVAL:DIFFICULT"]),
 ("ONI_PARIAH","Oni Pariah",["ONI_CLANS"],["CREATURE","BERSERKER"],"GIGANTIC",(3,5,4,8),(16,10,8,8,8,17,18),["SURVIVAL:DIFFICULT","UNSTOPPABLE"]),
 ("CHANRA_GOBLIN_SHAMAN","Chanra, Goblin Shaman",["GOBLIN_WARTRIBES"],["MYSTIC","RANGER"],"MEDIUM",(2,5,0,3),(12,10,10,13,12,12,15),["SURVIVAL:DIFFICULT","HIT_AND_RETREAT","INFILTRATION_I"]),
 ("GOBLIN_SHAMAN","Goblin Shaman",["GOBLIN_WARTRIBES"],["MYSTIC","RANGER"],"MEDIUM",(2,5,0,2),(12,10,10,12,12,12,14),["SURVIVAL:DIFFICULT","HIT_AND_RETREAT","INFILTRATION_I"]),
 ("GOBLIN_BRAWLERS","Goblin Brawlers",["GOBLIN_WARTRIBES"],["SOLDIER"],"SMALL",(2,5,3,1),(10,10,8,6,10,12,8),["SURVIVAL:DIFFICULT","CLIMBING","INFILTRATION_I"]),
 ("GOBLIN_SKIRMISHERS","Goblin Skirmishers",["GOBLIN_WARTRIBES"],["SOLDIER"],"SMALL",(2,5,1,1),(8,8,10,6,10,10,8),["SURVIVAL:DIFFICULT","CLIMBING","INFILTRATION_I"]),
 ("GOBLIN_WARCHIEF","Goblin Warchief",["GOBLIN_WARTRIBES"],["SOLDIER"],"LARGE",(2,5,3,5),(14,10,8,8,8,14,12),["SURVIVAL:DIFFICULT","INFILTRATION_I"]),
 ("TROLL_PROWLER","Troll Prowler",["GOBLIN_WARTRIBES"],["CREATURE"],"HUGE",(2,5,3,6),(16,8,10,6,8,15,10),["SURVIVAL:AQUATIC,DIFFICULT,TOXIC","INFILTRATION_I"]),
 ("VENGEFUL_SPIRIT","Vengeful Spirit",["UNDEAD"],["CREATURE"],"MEDIUM",(2,5,0,1),(10,8,8,6,8,10,20),["INCORPOREAL","INFILTRATION_I","STEALTH_I"]),
 ("BONEWALKER","Bonewalker",["UNDEAD"],["CREATURE"],"MEDIUM",(2,5,2,1),(10,10,8,6,8,10,20),[]),
 ("FORGOTTEN_HERO","Forgotten Hero",["UNDEAD"],["WARRIOR","MARKSMAN"],"MEDIUM",(2,5,6,2),(14,14,14,8,8,13,20),["VIGILANCE"]),
 ("AMAZON_GLADIATRIX","Amazon Gladiatrix",["ADVENTURERS_GUILD"],["BERSERKER"],"MEDIUM",(3,5,2,3),(16,12,8,8,12,14,16),["SURVIVAL:SCORCHING"]),
 ("TOMOE_ENDLESS_RAIN","Tomoe, Endless Rain",["ADVENTURERS_GUILD"],["MAGE","MYSTIC","SORCERER"],"MEDIUM",(2,6,1,2),(10,10,12,10,12,10,14),[]),
 ("RENEGADE_RASETSU","Renegade Rasetsu",["ADVENTURERS_GUILD"],["BERSERKER"],"MEDIUM",(2,6,3,4),(16,13,8,10,13,15,16),["SURVIVAL:DIFFICULT","DASH","LEAP"]),
 ("KOGETSU_CURSED_MONK","Kogetsu, Cursed Monk",["ADVENTURERS_GUILD"],["WARRIOR","SENTINEL"],"LARGE",(2,5,3,3),(14,16,10,10,10,13,14),["VIGILANCE","LEAP"]),
 ("GUILDSWORN_KNIGHT","Guildsworn Knight",["ADVENTURERS_GUILD"],["WARRIOR","ARMSMASTER"],"MEDIUM",(2,5,7,4),(15,15,12,13,8,14,17),["FOLLOW_UP"]),
 # summoned / creature profiles (not recruitable in WarBracket lists, used as tokens)
 ("BLIGHTED_RIFTSPAWN","Blighted Riftspawn",["UNDEAD"],["CREATURE"],"EPIC",(3,4,4,16),(16,13,8,8,8,18,20),["UNSTOPPABLE","VIGILANCE"]),
 ("WATER_ELEMENTAL","Water Elemental",["CREATURES"],["CREATURE"],"GIGANTIC",(2,4,2,5),(14,14,14,8,8,14,20),["SURVIVAL:AQUATIC","VIGILANCE"]),
 ("GARGOYLE","Gargoyle",["CREATURES"],["CREATURE"],"SMALL",(2,5,5,1),(12,8,8,8,8,12,20),["SURVIVAL:SCORCHING","CLIMBING","LEAP"]),
 ("GOLEM","Golem",["CREATURES"],["CREATURE"],"HUGE",(2,3,8,3),(10,13,8,8,6,15,20),["SURVIVAL:SCORCHING"]),
 ("EARTH_ELEMENTAL","Earth Elemental",["CREATURES"],["CREATURE"],"GIGANTIC",(2,4,10,4),(12,14,10,8,6,16,20),["SURVIVAL:FOREST,SCORCHING,SWAMP","WATCHFUL"]),
 ("COLOSSUS","Colossus",["CREATURES"],["CREATURE"],"COLOSSAL",(3,4,10,6),(14,14,8,8,6,17,20),["SURVIVAL:SCORCHING","UNSTOPPABLE"]),
]

# Mount: modifiers added to the rider (Mounted rules p.77)
MOUNTS = [
 {"code": "LUPUS_REX", "name": "Lupus Rex", "factions": ["COALITION_OF_THENION"], "size": "HUGE",
  "set": {"SPD": 9}, "mod": {"ARM": -2, "HP": 1, "DEF": 3, "T": 2}, "keywords": ["ACUTE_SENSES", "VIGILANCE", "HIT_AND_RETREAT"]},
]

# Hitbox: base diameter (mm) x height (mm), rulebook p.9 + errata APR 2026 (Epic 85+ mm)
SIZES = {
 "SMALL": {"baseMm": 25, "heightMm": 25}, "MEDIUM": {"baseMm": 32, "heightMm": 45},
 "LARGE": {"baseMm": 40, "heightMm": 45}, "HUGE": {"baseMm": 50, "heightMm": 50},
 "GIGANTIC": {"baseMm": 60, "heightMm": 60}, "COLOSSAL": {"baseMm": 80, "heightMm": 80},
 "EPIC": {"baseMm": 100, "heightMm": 100},
}

models = []
for code, name, fac, cls, size, (sta, spd, arm, hp), att, kw in P:
    m = {"code": code, "name": name, "factions": fac, "classes": cls, "size": size,
         "STA": sta, "SPD": spd, "ARM": arm, "HP": hp}
    m.update(dict(zip(A, att)))
    m["keywords"] = kw
    models.append(m)

doc = {
  "version": 1,
  "source": "Eldfall profile cards (eld docs, 2026-10-12); transcribed by hand, stats only",
  "units": "inches for distances; mm for hitboxes (25.4 mm = 1 in)",
  "sizes": SIZES,
  "templates": {"circularSmallDiameterMm": 70, "circularLargeDiameterMm": 120,
                 "spraySmallLengthMm": 213, "sprayLargeLengthMm": 260},
  "field": {"widthIn": 36, "heightIn": 36, "deploymentDepthIn": 8},
  "models": models,
  "mounts": MOUNTS,
}

# sanity checks
codes = [m["code"] for m in models]
assert len(codes) == len(set(codes)), "duplicate code"
for m in models:
    assert m["size"] in SIZES, m
    for k in ["STA", "SPD", "ARM", "HP"] + A:
        assert isinstance(m[k], int) and 0 <= m[k] <= 30, (m["code"], k)

if len(sys.argv) > 1:
    armies = json.load(open(sys.argv[1]))
    known = {u["code"] for u in armies["units"]}
    have = set(codes) | {x["code"] for x in MOUNTS}
    print("missing profiles:", sorted(known - have))
    print("extra (summons):", sorted(have - known))

json.dump(doc, open("backend/src/main/resources/content/eldfall-profiles.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(len(models), "models written")
