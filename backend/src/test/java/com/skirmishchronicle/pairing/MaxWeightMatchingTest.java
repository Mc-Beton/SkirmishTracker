package com.skirmishchronicle.pairing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Compares the blossom implementation with exhaustive search on thousands of random small graphs. */
class MaxWeightMatchingTest {

    private int n;
    private long[][] weight;
    private boolean[][] edge;
    private long bestCard;
    private long bestWeight;

    private void brute(int[] mate, int v, long card, long w) {
        while (v < n && mate[v] != -2) {
            v++;
        }
        if (v >= n) {
            if (card > bestCard || (card == bestCard && w > bestWeight)) {
                bestCard = card;
                bestWeight = w;
            }
            return;
        }
        mate[v] = -1;
        brute(mate, v + 1, card, w);
        for (int u = v + 1; u < n; u++) {
            if (mate[u] == -2 && edge[v][u]) {
                mate[v] = u;
                mate[u] = v;
                brute(mate, v + 1, card + 1, w + weight[v][u]);
                mate[u] = -2;
            }
        }
        mate[v] = -2;
    }

    @Test
    void matchesExhaustiveSearch() {
        Random r = new Random(42);
        for (int it = 0; it < 5000; it++) {
            n = 1 + r.nextInt(10);
            weight = new long[n][n];
            edge = new boolean[n][n];
            double density = r.nextDouble();
            int maxWeight = r.nextBoolean() ? 5 : 1_000_000;
            List<int[]> edges = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                for (int j = i + 1; j < n; j++) {
                    if (r.nextDouble() < density) {
                        edge[i][j] = edge[j][i] = true;
                        weight[i][j] = weight[j][i] = r.nextInt(maxWeight) + 1;
                        edges.add(new int[] {i, j});
                    }
                }
            }
            int[] ei = new int[edges.size()];
            int[] ej = new int[edges.size()];
            long[] ew = new long[edges.size()];
            for (int k = 0; k < edges.size(); k++) {
                ei[k] = edges.get(k)[0];
                ej[k] = edges.get(k)[1];
                ew[k] = weight[ei[k]][ej[k]];
            }
            int[] mate = MaxWeightMatching.solve(n, ei, ej, ew, true);
            long card = 0;
            long w = 0;
            for (int v = 0; v < n; v++) {
                if (mate[v] >= 0) {
                    assertTrue(mate[mate[v]] == v && edge[v][mate[v]], "invalid matching");
                    if (mate[v] > v) {
                        card++;
                        w += weight[v][mate[v]];
                    }
                }
            }
            int[] m = new int[n];
            Arrays.fill(m, -2);
            bestCard = -1;
            bestWeight = -1;
            brute(m, 0, 0, 0);
            assertEquals(bestCard, card, "cardinality");
            assertEquals(bestWeight, w, "weight");
        }
    }
}
