package com.skirmishchronicle.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RateLimitFilterTest {

    @Test
    void blocksAfterLimitAndResetsAfterWindow() {
        RateLimitFilter filter = new RateLimitFilter(3);
        long t0 = 1_000_000;
        assertThat(filter.tryAcquire("1.2.3.4", t0)).isTrue();
        assertThat(filter.tryAcquire("1.2.3.4", t0 + 1)).isTrue();
        assertThat(filter.tryAcquire("1.2.3.4", t0 + 2)).isTrue();
        assertThat(filter.tryAcquire("1.2.3.4", t0 + 3)).isFalse();
        assertThat(filter.tryAcquire("5.6.7.8", t0 + 3)).isTrue();
        assertThat(filter.tryAcquire("1.2.3.4", t0 + 60_001)).isTrue();
    }
}
