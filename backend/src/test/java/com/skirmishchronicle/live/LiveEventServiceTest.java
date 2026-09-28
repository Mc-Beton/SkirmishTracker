package com.skirmishchronicle.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.skirmishchronicle.common.ApiException;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class LiveEventServiceTest {

    private final LiveEventService live = new LiveEventService();

    @AfterEach
    void close() {
        live.shutdown();
    }

    @Test
    void limitsStreamsPerClient() {
        UUID user = UUID.randomUUID();
        IntStream.range(0, LiveEventService.MAX_STREAMS_PER_CLIENT)
                .forEach(i -> live.open(user, List.of(), "u:" + user));
        assertThat(live.openStreams()).isEqualTo(LiveEventService.MAX_STREAMS_PER_CLIENT);
        assertThatThrownBy(() -> live.open(user, List.of(), "u:" + user))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("LIVE_TOO_MANY_STREAMS");
        // Another client is not affected.
        live.open(null, List.of(), "ip:10.0.0.1");
        assertThat(live.openStreams()).isEqualTo(LiveEventService.MAX_STREAMS_PER_CLIENT + 1);
    }

    @Test
    void limitsTopicsPerStream() {
        List<UUID> many = IntStream.range(0, LiveEventService.MAX_TOURNAMENTS_PER_STREAM + 1)
                .mapToObj(i -> UUID.randomUUID()).toList();
        assertThatThrownBy(() -> live.open(null, many, "ip:10.0.0.2"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("LIVE_TOO_MANY_TOPICS");
    }

    @Test
    void publishingWithoutListenersIsANoOp() {
        live.tournamentChanged(UUID.randomUUID(), "changed");
        live.notificationsChanged(UUID.randomUUID());
        live.tournamentChanged(null, "changed");
        live.notificationsChanged(null);
        assertThat(live.openStreams()).isZero();
    }

    @Test
    void extractsTournamentIdFromMutatingPaths() {
        UUID id = UUID.randomUUID();
        assertThat(TournamentChangeInterceptor.tournamentId("/api/tournaments/" + id)).isEqualTo(id);
        assertThat(TournamentChangeInterceptor.tournamentId("/api/tournaments/" + id + "/matches/x/report")).isEqualTo(id);
        assertThat(TournamentChangeInterceptor.tournamentId("/api/tournaments/mine")).isNull();
        assertThat(TournamentChangeInterceptor.tournamentId("/api/tournaments")).isNull();
        assertThat(TournamentChangeInterceptor.tournamentId("/api/leagues/" + id)).isNull();
    }
}
