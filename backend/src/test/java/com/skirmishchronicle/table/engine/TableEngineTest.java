package com.skirmishchronicle.table.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.skirmishchronicle.table.geo.Env;
import com.skirmishchronicle.table.geo.Geometry.MoveMode;
import com.skirmishchronicle.table.geo.Terrain;
import com.skirmishchronicle.table.geo.Vec;
import com.skirmishchronicle.table.rules.ModelState;
import com.skirmishchronicle.table.rules.Profiles;
import com.skirmishchronicle.table.rules.Stat;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.random.RandomGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TableEngineTest {

    private static final Profiles PROFILES = Profiles.load();
    private static final UUID A = UUID.randomUUID(), B = UUID.randomUUID();

    private List<Recorded> log;
    private TableEngine engine;
    private List<Terrain> terrain;

    /** Dice that roll 1, 2, 3, … so tests know the results. */
    private static RandomGenerator countingDice() {
        return new RandomGenerator() {
            int n;

            @Override
            public long nextLong() {
                return n++;
            }

            @Override
            public int nextInt(int origin, int bound) {
                return origin + (n++ % (bound - origin));
            }
        };
    }

    @BeforeEach
    void setUp() {
        log = new ArrayList<>();
        engine = new TableEngine(PROFILES, countingDice());
        terrain = List.of(
                new Terrain("wall", Terrain.Kind.OBSTACLE, List.of(new Vec(14, 16), new Vec(22, 16), new Vec(22, 17), new Vec(14, 17)), 3, Set.of()),
                new Terrain("river", Terrain.Kind.AREA, List.of(new Vec(0, 22), new Vec(36, 22), new Vec(36, 24), new Vec(0, 24)), 0, Set.of(Env.AQUATIC_SHALLOW)));
        system(new GameEvent.ModelAdded("a1", 0, "CITADEL_GUARD", null));      // STA 2 SPD 4 HP 2
        system(new GameEvent.ModelAdded("a2", 0, "EONIAN_RUNNER", null));      // STA 2 SPD 6 AG 12
        system(new GameEvent.ModelAdded("b1", 1, "RED_RASETSU", null));        // STA 3 SPD 6 HP 6
        system(new GameEvent.ModelAdded("b2", 1, "NIGHT_TEMPLE_PRIESTESS", null)); // Flight
        system(new GameEvent.PartyInfo(0, "HELIAN_LEAGUE", null, 12, "a1"));
        system(new GameEvent.PartyInfo(1, "ONI_CLANS", "UNDEAD", 10, "b1"));
    }

    private void system(GameEvent e) {
        log.add(new Recorded(log.size() + 1, -1, null, Instant.now(), e));
    }

    private GameState.Deployment deployment = GameState.Deployment.STANDARD;

    private GameState state() {
        return GameState.fold(36, 36, 8, deployment, terrain, log, PROFILES);
    }

    private List<GameEvent> run(int side, Command c) {
        List<GameEvent> evs = engine.decide(state(), log, side, c);
        for (GameEvent e : evs) {
            log.add(new Recorded(log.size() + 1, side, side == 0 ? A : B, Instant.now(), e));
        }
        return evs;
    }

    private String code(int side, Command c) {
        return assertThrows(RuleViolation.class, () -> run(side, c)).code();
    }

    private void deployAndStart() {
        run(0, new Command.Deploy("a1", new Vec(10, 33), 270));
        run(0, new Command.Deploy("a2", new Vec(20, 33), 270));
        run(1, new Command.Deploy("b1", new Vec(12, 3), 90));
        run(1, new Command.Deploy("b2", new Vec(24, 3), 90));
        run(0, new Command.SetFirstPlayer(0));
        run(0, new Command.Ready());
        run(1, new Command.Ready());
    }

    @Test
    void deploymentStaysInsideTheOwnZone() {
        assertEquals("TABLE_OUTSIDE_DEPLOYMENT", code(0, new Command.Deploy("a1", new Vec(10, 20), 0)));
        assertEquals("TABLE_OUTSIDE_DEPLOYMENT", code(1, new Command.Deploy("b1", new Vec(10, 33), 0)));
        assertEquals("TABLE_NOT_YOUR_MODEL", code(0, new Command.Deploy("b1", new Vec(10, 3), 0)));
        run(0, new Command.Deploy("a1", new Vec(10, 33), 270));
        assertEquals("TABLE_OVERLAPS_MODEL", code(0, new Command.Deploy("a2", new Vec(10.5, 33), 270)));
        assertEquals("TABLE_DEPLOY_ALL_FIRST", code(0, new Command.Ready()));
    }

    @Test
    void upkeepGivesEveryModelApEqualToStamina() {
        deployAndStart();
        GameState s = state();
        assertEquals(GameState.Status.PLAYING, s.status);
        assertEquals(1, s.round);
        assertEquals(0, s.active);
        assertEquals(2, s.model("a1").ap);
        assertEquals(3, s.model("b1").ap); // the reactive side also gets AP to react
    }

    @Test
    void activationSpendsApAndMovementIsLimitedBySpeed() {
        deployAndStart();
        assertEquals("TABLE_ACTIVATE_FIRST", code(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(20, 29)))));
        run(0, new Command.Activate("a2"));
        assertEquals(1, state().model("a2").ap);
        // Walk 6": asking for 10" stops after 6"
        GameEvent.Moved m = (GameEvent.Moved) run(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(20, 23)))).get(0);
        assertEquals(27.0, m.path().get(m.path().size() - 1).y(), 0.02);
        assertEquals("TABLE_NO_MOVEMENT_LEFT", code(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(20, 20)))));
        assertEquals("TABLE_MOVE_MODE_FIXED", code(0, new Command.Move("a2", MoveMode.RUN, List.of(new Vec(20, 20)))));
    }

    @Test
    void runDoublesAndShallowWaterCostsDouble() {
        deployAndStart();
        run(0, new Command.Activate("a2"));
        // Run 12" from y=33 north: 9.37" to touch the river (base r = 0.63"), the rest at half pace
        GameEvent.Moved m = (GameEvent.Moved) run(0, new Command.Move("a2", MoveMode.RUN, List.of(new Vec(20, 10)))).get(0);
        double endY = m.path().get(m.path().size() - 1).y();
        double r = 16 / 25.4;
        double expected = 33 - (33 - 24 - r) - (12 - (33 - 24 - r)) / 2;
        assertEquals(expected, endY, 0.06);
        // standing in water halves AG
        assertEquals(6, state().stats(state().model("a2")).get(Stat.AG));
    }

    @Test
    void onlyTheActivePlayerActsAndTheReactivePlayerReactsDuringAnActivation() {
        deployAndStart();
        assertEquals("TABLE_NOT_YOUR_TURN", code(1, new Command.Activate("b1")));
        assertEquals("TABLE_NOTHING_TO_REACT_TO", code(1, new Command.React("b1")));
        run(0, new Command.Activate("a1"));
        run(1, new Command.React("b1"));
        assertEquals(2, state().model("b1").ap);
        assertEquals("TABLE_REACT_ONLY_REACTIVE", code(0, new Command.React("a2")));
    }

    @Test
    void woundsIncapacitateThenKill() {
        deployAndStart();
        run(1, new Command.ChangeHp("a1", -2)); // Citadel Guard HP 2
        GameState s = state();
        assertEquals(0, s.model("a1").hp);
        assertTrue(s.model("a1").states.contains(ModelState.INCAPACITATED));
        assertTrue(s.model("a1").states.contains(ModelState.CROUCHED));
        assertEquals("TABLE_MODEL_OUT_OF_ACTION", code(0, new Command.Activate("a1")));
        run(1, new Command.ChangeHp("a1", -1));
        assertTrue(state().model("a1").states.contains(ModelState.DEAD));
        run(0, new Command.ChangeHp("a1", 1)); // Dead cannot regain HP
        assertEquals(0, state().model("a1").hp);
    }

    @Test
    void healingCancelsIncapacitated() {
        deployAndStart();
        run(1, new Command.ChangeHp("a1", -2));
        run(0, new Command.ChangeHp("a1", 1));
        GameState s = state();
        assertEquals(1, s.model("a1").hp);
        assertFalse(s.model("a1").states.contains(ModelState.INCAPACITATED));
    }

    @Test
    void statesChangeTheProfileAutomatically() {
        deployAndStart();
        run(0, new Command.SetState("a2", ModelState.CROUCHED, true));
        GameState s = state();
        assertEquals(3, s.stats(s.model("a2")).get(Stat.SPD)); // 6 halved
        assertEquals(2, s.stats(s.model("a2")).get(Stat.ARM)); // 3 halved, rounded up
        run(0, new Command.SetState("a2", ModelState.WEAKENED, true));
        s = state();
        assertEquals(1, s.stats(s.model("a2")).get(Stat.STA));
        assertEquals(7, s.stats(s.model("a2")).get(Stat.T)); // 13 halved, rounded up
        // Flying doubles SPD, Slowed halves it: they cancel out
        assertEquals("TABLE_NO_FLIGHT", code(0, new Command.SetState("a2", ModelState.FLYING, true)));
        run(1, new Command.SetState("b2", ModelState.FLYING, true));
        run(1, new Command.SetState("b2", ModelState.SLOWED, true));
        s = state();
        assertEquals(5, s.stats(s.model("b2")).get(Stat.SPD));
        assertEquals("TABLE_FLYING_CANNOT_CROUCH", code(1, new Command.SetState("b2", ModelState.CROUCHED, true)));
    }

    @Test
    void crouchedWalksOnly() {
        deployAndStart();
        run(0, new Command.SetState("a2", ModelState.CROUCHED, true));
        run(0, new Command.Activate("a2"));
        assertEquals("TABLE_CROUCHED_WALK_ONLY", code(0, new Command.Move("a2", MoveMode.RUN, List.of(new Vec(20, 25)))));
    }

    @Test
    void endTurnDiscardsApAndTheOtherPlayerGetsFreshAp() {
        deployAndStart();
        run(0, new Command.Activate("a1"));
        run(1, new Command.SetState("b1", ModelState.FATIGUED, true));
        run(0, new Command.EndTurn());
        GameState s = state();
        assertEquals(1, s.active);
        assertEquals(1, s.round);
        assertEquals(2, s.model("a1").ap);      // Upkeep refills everybody
        assertEquals(3, s.model("b1").ap);      // Fatigued ends in its own Strategic Phase, before Upkeep
        assertFalse(s.model("b1").states.contains(ModelState.FATIGUED));
        run(1, new Command.EndTurn());
        assertEquals(2, state().round);
        assertEquals(0, state().active);
    }

    @Test
    void fatiguedModelOfTheReactivePlayerGetsNoAp() {
        deployAndStart();
        run(0, new Command.SetState("a1", ModelState.FATIGUED, true));
        run(0, new Command.EndTurn()); // player 1 active now; a1 belongs to the reactive player
        assertEquals(0, state().model("a1").ap);
    }

    @Test
    void activePlayerUndoesOwnMoves() {
        deployAndStart();
        run(0, new Command.Activate("a2"));
        run(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(20, 30))));
        run(0, new Command.Undo());
        GameState s = state();
        assertEquals(33.0, s.model("a2").pos.y(), 1e-9);
        assertEquals(1, s.model("a2").ap);        // still activated
        run(0, new Command.Undo());               // takes back the activation too
        assertEquals(2, state().model("a2").ap);
        assertNull(state().activation);
        assertEquals("TABLE_NOTHING_TO_UNDO", code(0, new Command.Undo()));
    }

    @Test
    void undoTakesBackAReactionWithoutDiceButNotOneWithDice() {
        deployAndStart();
        run(0, new Command.Activate("a2"));
        run(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(20, 30))));
        run(1, new Command.React("b1"));          // declared Reaction, no roll yet
        run(0, new Command.Undo());               // move and the reaction to it go back
        GameState s = state();
        assertEquals(33.0, s.model("a2").pos.y(), 1e-9);
        assertEquals(3, s.model("b1").ap);

        run(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(20, 30))));
        run(1, new Command.React("b1"));
        run(1, new Command.Roll("Attack", "b1", 3, 16));
        assertEquals("TABLE_UNDO_AFTER_DICE", code(0, new Command.Undo()));
    }

    @Test
    void reactivePlayerCannotUndoAndUndoStopsAtTheTurnStart() {
        deployAndStart();
        run(0, new Command.Activate("a1"));
        run(1, new Command.React("b1"));
        assertEquals("TABLE_UNDO_ONLY_ACTIVE", code(1, new Command.Undo()));
        run(0, new Command.EndTurn());
        assertEquals("TABLE_NOTHING_TO_UNDO", code(1, new Command.Undo()));
    }

    @Test
    void diceAreRolledByTheServer() {
        deployAndStart();
        GameEvent.Rolled r = (GameEvent.Rolled) run(1, new Command.Roll("Dodge", "b1", 4, 13)).get(0);
        assertEquals(List.of(1, 2, 3, 4), r.results());
        assertEquals("TABLE_BAD_DICE_COUNT", code(1, new Command.Roll(null, null, 0, null)));
    }

    @Test
    void movementEndsInBaseContactAndBothBecomeEngaged() {
        deployAndStart();
        run(0, new Command.FreeMove("a2", new Vec(12, 10), 270));
        run(0, new Command.Activate("a2"));
        GameEvent.Moved m = (GameEvent.Moved) run(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(12, 4)))).get(0);
        assertEquals("b1", m.engagedWith());
        GameState s = state();
        assertTrue(s.model("a2").states.contains(ModelState.ENGAGED));
        assertTrue(s.model("b1").states.contains(ModelState.ENGAGED));
    }

    @Test
    void wallsStopMovement() {
        deployAndStart();
        run(0, new Command.FreeMove("a2", new Vec(18, 20), 270));
        run(0, new Command.Activate("a2"));
        GameEvent.Moved m = (GameEvent.Moved) run(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(18, 14)))).get(0);
        assertEquals(17 + 16 / 25.4, m.path().get(m.path().size() - 1).y(), 0.02);
    }

    @Test
    void cornerDeploymentUsesNineInchQuarterCirclesInOppositeCorners() {
        deployment = GameState.Deployment.CORNER;
        // player 1: bottom-left corner, player 2: top-right corner; the whole base inside 9"
        run(0, new Command.Deploy("a1", new Vec(3, 33), 270));
        assertEquals("TABLE_OUTSIDE_DEPLOYMENT", code(0, new Command.Deploy("a2", new Vec(7, 30), 270)));
        assertEquals("TABLE_OUTSIDE_DEPLOYMENT", code(0, new Command.Deploy("a2", new Vec(33, 3), 270)));
        assertEquals("TABLE_OUTSIDE_DEPLOYMENT", code(0, new Command.Deploy("a2", new Vec(3, 3), 270)));
        run(1, new Command.Deploy("b1", new Vec(33, 3), 90));
        // a standard belt spot far from the corner is outside
        assertEquals("TABLE_OUTSIDE_DEPLOYMENT", code(1, new Command.Deploy("b2", new Vec(18, 3), 90)));
    }

    @Test
    void schemesAreDrawnOnceInSetupAndOneIsKept() {
        List<GameEvent.SchemeCard> cards = List.of(new GameEvent.SchemeCard("VIRTUOUS_COMMANDER", 3),
                new GameEvent.SchemeCard("PEACEKEEPING_PARAGON", 20));
        run(0, new Command.DrawSchemes(cards));
        assertEquals("TABLE_SCHEMES_ALREADY_DRAWN", code(0, new Command.DrawSchemes(cards)));
        assertEquals("TABLE_SCHEME_NOT_DRAWN", code(0, new Command.KeepScheme("ASSASSINATION_CONTRACT")));
        assertEquals("TABLE_SCHEMES_NOT_DRAWN", code(1, new Command.KeepScheme("VIRTUOUS_COMMANDER")));
        run(0, new Command.KeepScheme("PEACEKEEPING_PARAGON"));
        assertEquals("TABLE_SCHEME_ALREADY_KEPT", code(0, new Command.KeepScheme("VIRTUOUS_COMMANDER")));
        GameState s = state();
        assertEquals("PEACEKEEPING_PARAGON", s.schemeKept.get(0));
        assertEquals("a1", s.parties[0].leaderId());
        deployAndStart();
        // a player who missed it may still draw in the first round
        run(1, new Command.DrawSchemes(cards));
        run(1, new Command.KeepScheme("VIRTUOUS_COMMANDER"));
        assertEquals("VIRTUOUS_COMMANDER", state().schemeKept.get(1));
    }

    @Test
    void questTokensArePlacedMovedAndRemovedByEitherPlayer() {
        run(0, new Command.PlaceToken("INTRIGUE", new Vec(18, 18), null));
        run(1, new Command.PlaceToken("MARKER", new Vec(10, 18), "  Altar of the Moon  "));
        assertEquals("TABLE_BAD_TOKEN", code(0, new Command.PlaceToken("BOMB", new Vec(1, 1), null)));
        assertEquals("TABLE_OFF_THE_TABLE", code(0, new Command.PlaceToken("CACHE", new Vec(40, 1), null)));
        run(1, new Command.MoveToken("t1", new Vec(17, 17)));
        GameState s = state();
        assertEquals(17.0, s.tokens.get("t1").pos().x(), 1e-9);
        assertEquals("Altar of the Moon", s.tokens.get("t2").label());
        run(0, new Command.RemoveToken("t2"));
        run(0, new Command.PlaceToken("CACHE", new Vec(5, 5), null));
        assertTrue(state().tokens.containsKey("t3")); // ids are never reused
        assertEquals("TABLE_TOKEN_NOT_FOUND", code(0, new Command.RemoveToken("t2")));
    }

    @Test
    void victoryPointsPerRoundAndTotals() {
        deployAndStart();
        run(0, new Command.SetVp(0, 1, 2, 1));
        run(1, new Command.SetVp(1, 1, 1, 0));
        assertEquals("TABLE_BAD_ROUND", code(0, new Command.SetVp(0, 2, 1, 0))); // round 2 has not started
        assertEquals("TABLE_BAD_VP", code(0, new Command.SetVp(0, 1, -1, 0)));
        run(0, new Command.SetVp(0, 1, 3, 1)); // a correction replaces the round
        GameState s = state();
        assertEquals(4, s.totalVp(0));
        assertEquals(1, s.totalVp(1));
    }

    @Test
    void templatesStayUntilRemoved() {
        deployAndStart();
        run(0, new Command.PlaceTemplate("CIRCLE_L", new Vec(12, 4), 0, null, "Fireball"));
        run(1, new Command.PlaceTemplate("SPRAY_S", new Vec(12, 3.7), 270, "b1", null));
        assertEquals("TABLE_BAD_TEMPLATE", code(0, new Command.PlaceTemplate("SQUARE", new Vec(1, 1), 0, null, null)));
        GameState s = state();
        assertEquals(2, s.templates.size());
        assertEquals(1, s.templates.get("s2").side());
        run(0, new Command.RemoveTemplate("s1"));
        assertEquals(1, state().templates.size());
    }

    @Test
    void theGameEndsWhenBothAgreeAndVictoryPointsDecide() {
        deployAndStart();
        run(1, new Command.SetVp(1, 1, 3, 0));
        run(0, new Command.EndGame());
        assertEquals(0, state().endProposedBy);
        run(0, new Command.EndGame()); // withdrawn
        assertNull(state().endProposedBy);
        run(0, new Command.EndGame());
        run(1, new Command.EndGame()); // accepted
        GameState s = state();
        assertEquals(GameState.Status.FINISHED, s.status);
        assertEquals("FINISHED", s.endReason);
        assertEquals(1, s.winner);
        assertEquals("TABLE_GAME_FINISHED", code(0, new Command.SetVp(0, 1, 1, 0)));
    }

    @Test
    void tokenMovesCanBeUndoneInTheOwnTurn() {
        deployAndStart();
        run(0, new Command.PlaceToken("OBJECTIVE", new Vec(18, 18), null));
        run(0, new Command.Undo());
        assertTrue(state().tokens.isEmpty());
    }

    @Test
    void theJudgeMovesAnyModelAndUndoesPastDiceAndTurns() {
        deployAndStart();
        int j = TableEngine.JUDGE;
        run(0, new Command.Activate("a2"));
        run(0, new Command.Move("a2", MoveMode.WALK, List.of(new Vec(20, 29))));
        run(1, new Command.Roll("dodge", "b1", 1, 10)); // dice: the player can no longer undo
        assertEquals("TABLE_UNDO_AFTER_DICE", code(0, new Command.Undo()));
        long beforeMove = state().turnStartSeq;
        run(0, new Command.EndTurn());

        // the judge corrects a model of either side, at any time
        run(j, new Command.FreeMove("b1", new Vec(15, 10), 90));
        run(j, new Command.SetAp("a1", 0));
        run(j, new Command.ChangeHp("b1", -1));
        assertEquals(new Vec(15, 10), state().model("b1").pos);
        assertEquals("TABLE_JUDGE_CANNOT", code(j, new Command.Activate("a1")));
        // players cannot undo the judge's steps
        assertEquals("TABLE_UNDO_AFTER_JUDGE", code(1, new Command.Undo()));

        // latest step only
        run(j, new Command.Undo());
        assertEquals(6, state().model("b1").hp);
        // back to the start of player A's first turn: the move, the roll and the turn change are gone
        run(j, new Command.Undo(beforeMove));
        GameState s = state();
        assertEquals(0, s.active);
        assertEquals(new Vec(20, 33), s.model("a2").pos);
        assertEquals(new Vec(12, 3), s.model("b1").pos);
        assertEquals(2, s.model("a1").ap);
    }

    @Test
    void theJudgeEndsTheGameAndCanReopenIt() {
        deployAndStart();
        int j = TableEngine.JUDGE;
        run(0, new Command.SetVp(0, 1, 3, 1));
        run(j, new Command.EndGame());
        assertEquals(GameState.Status.FINISHED, state().status);
        assertEquals(0, state().winner);
        assertEquals("TABLE_GAME_FINISHED", code(0, new Command.Undo()));
        run(j, new Command.Undo());
        assertEquals(GameState.Status.PLAYING, state().status);
        // the setup from the lists is never undone
        run(j, new Command.Undo(0L));
        assertEquals(GameState.Status.SETUP, state().status);
        assertEquals(4, state().models.size());
        assertEquals("TABLE_NOTHING_TO_UNDO", code(j, new Command.Undo()));
    }
}
