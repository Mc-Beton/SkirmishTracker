package com.skirmishchronicle.pairing;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Maximum-weight matching in a general graph (Edmonds' blossom algorithm, O(n^3)).
 *
 * <p>Java port of Joris van Rantwijk's public-domain {@code mwmatching.py}. With {@code maxCardinality}
 * it returns, among all maximum-cardinality matchings, one of maximum total weight – so a perfect matching
 * is found whenever one exists. Weights are integers; all arithmetic is exact.
 */
public final class MaxWeightMatching {

    private final int nvertex;
    private final int nedge;
    private final int[] edgeI;
    private final int[] edgeJ;
    private final long[] edgeW;
    private final boolean maxCardinality;

    private final int[] endpoint;
    private final int[][] neighbend;
    private final int[] mate;
    private final int[] label;
    private final int[] labelend;
    private final int[] inblossom;
    private final int[] blossomparent;
    private final int[][] blossomchilds;
    private final int[] blossombase;
    private final int[][] blossomendps;
    private final int[] bestedge;
    private final int[][] blossombestedges;
    private final ArrayDeque<Integer> unusedblossoms = new ArrayDeque<>();
    private final long[] dualvar;
    private final boolean[] allowedge;
    private final ArrayList<Integer> queue = new ArrayList<>();

    private MaxWeightMatching(int nvertex, int[] ei, int[] ej, long[] ew, boolean maxCardinality) {
        this.nvertex = nvertex;
        this.nedge = ei.length;
        this.edgeI = ei;
        this.edgeJ = ej;
        // Doubling keeps every dual variable integral (the algorithm halves slacks of S-S edges).
        this.edgeW = new long[nedge];
        long maxweight = 0;
        for (int k = 0; k < nedge; k++) {
            edgeW[k] = ew[k] * 2;
            maxweight = Math.max(maxweight, edgeW[k]);
        }
        this.maxCardinality = maxCardinality;

        endpoint = new int[2 * nedge];
        for (int p = 0; p < 2 * nedge; p++) {
            endpoint[p] = (p % 2 == 0) ? edgeI[p / 2] : edgeJ[p / 2];
        }
        List<List<Integer>> nb = new ArrayList<>();
        for (int i = 0; i < nvertex; i++) {
            nb.add(new ArrayList<>());
        }
        for (int k = 0; k < nedge; k++) {
            nb.get(edgeI[k]).add(2 * k + 1);
            nb.get(edgeJ[k]).add(2 * k);
        }
        neighbend = new int[nvertex][];
        for (int i = 0; i < nvertex; i++) {
            neighbend[i] = nb.get(i).stream().mapToInt(Integer::intValue).toArray();
        }
        mate = new int[nvertex];
        Arrays.fill(mate, -1);
        label = new int[2 * nvertex];
        labelend = new int[2 * nvertex];
        Arrays.fill(labelend, -1);
        inblossom = new int[nvertex];
        for (int i = 0; i < nvertex; i++) {
            inblossom[i] = i;
        }
        blossomparent = new int[2 * nvertex];
        Arrays.fill(blossomparent, -1);
        blossomchilds = new int[2 * nvertex][];
        blossombase = new int[2 * nvertex];
        for (int i = 0; i < 2 * nvertex; i++) {
            blossombase[i] = i < nvertex ? i : -1;
        }
        blossomendps = new int[2 * nvertex][];
        bestedge = new int[2 * nvertex];
        Arrays.fill(bestedge, -1);
        blossombestedges = new int[2 * nvertex][];
        for (int b = nvertex; b < 2 * nvertex; b++) {
            unusedblossoms.push(b);
        }
        dualvar = new long[2 * nvertex];
        for (int i = 0; i < nvertex; i++) {
            dualvar[i] = maxweight;
        }
        allowedge = new boolean[nedge];
    }

    /**
     * @param n number of vertices (0..n-1)
     * @param i edge endpoints (i[k], j[k]) with weight w[k]; each pair at most once, no self loops
     * @return mate[v] = matched vertex or -1
     */
    public static int[] solve(int n, int[] i, int[] j, long[] w, boolean maxCardinality) {
        if (i.length == 0) {
            int[] none = new int[n];
            Arrays.fill(none, -1);
            return none;
        }
        return new MaxWeightMatching(n, i, j, w, maxCardinality).run();
    }

    private long slack(int k) {
        return dualvar[edgeI[k]] + dualvar[edgeJ[k]] - 2 * edgeW[k];
    }

    private void blossomLeaves(int b, List<Integer> out) {
        if (b < nvertex) {
            out.add(b);
        } else {
            for (int t : blossomchilds[b]) {
                if (t < nvertex) {
                    out.add(t);
                } else {
                    blossomLeaves(t, out);
                }
            }
        }
    }

    private List<Integer> leaves(int b) {
        List<Integer> out = new ArrayList<>();
        blossomLeaves(b, out);
        return out;
    }

    private void assignLabel(int w, int t, int p) {
        int b = inblossom[w];
        label[w] = label[b] = t;
        labelend[w] = labelend[b] = p;
        bestedge[w] = bestedge[b] = -1;
        if (t == 1) {
            queue.addAll(leaves(b));
        } else if (t == 2) {
            int base = blossombase[b];
            assignLabel(endpoint[mate[base]], 1, mate[base] ^ 1);
        }
    }

    private int scanBlossom(int v, int w) {
        List<Integer> path = new ArrayList<>();
        int base = -1;
        while (v != -1 || w != -1) {
            int b = inblossom[v];
            if ((label[b] & 4) != 0) {
                base = blossombase[b];
                break;
            }
            path.add(b);
            label[b] = 5;
            if (labelend[b] == -1) {
                v = -1;
            } else {
                v = endpoint[labelend[b]];
                b = inblossom[v];
                v = endpoint[labelend[b]];
            }
            if (w != -1) {
                int tmp = v;
                v = w;
                w = tmp;
            }
        }
        for (int b : path) {
            label[b] = 1;
        }
        return base;
    }

    private void addBlossom(int base, int k) {
        int v = edgeI[k];
        int w = edgeJ[k];
        int bb = inblossom[base];
        int bv = inblossom[v];
        int bw = inblossom[w];
        int b = unusedblossoms.pop();
        blossombase[b] = base;
        blossomparent[b] = -1;
        blossomparent[bb] = b;
        List<Integer> path = new ArrayList<>();
        List<Integer> endps = new ArrayList<>();
        while (bv != bb) {
            blossomparent[bv] = b;
            path.add(bv);
            endps.add(labelend[bv]);
            v = endpoint[labelend[bv]];
            bv = inblossom[v];
        }
        path.add(bb);
        java.util.Collections.reverse(path);
        java.util.Collections.reverse(endps);
        endps.add(2 * k);
        while (bw != bb) {
            blossomparent[bw] = b;
            path.add(bw);
            endps.add(labelend[bw] ^ 1);
            w = endpoint[labelend[bw]];
            bw = inblossom[w];
        }
        blossomchilds[b] = path.stream().mapToInt(Integer::intValue).toArray();
        blossomendps[b] = endps.stream().mapToInt(Integer::intValue).toArray();
        label[b] = 1;
        labelend[b] = labelend[bb];
        dualvar[b] = 0;
        for (int leaf : leaves(b)) {
            if (label[inblossom[leaf]] == 2) {
                queue.add(leaf);
            }
            inblossom[leaf] = b;
        }
        int[] bestedgeto = new int[2 * nvertex];
        Arrays.fill(bestedgeto, -1);
        for (int child : blossomchilds[b]) {
            List<int[]> nblists = new ArrayList<>();
            if (blossombestedges[child] == null) {
                for (int leaf : leaves(child)) {
                    int[] list = new int[neighbend[leaf].length];
                    for (int x = 0; x < list.length; x++) {
                        list[x] = neighbend[leaf][x] / 2;
                    }
                    nblists.add(list);
                }
            } else {
                nblists.add(blossombestedges[child]);
            }
            for (int[] nblist : nblists) {
                for (int kk : nblist) {
                    int i = edgeI[kk];
                    int j = edgeJ[kk];
                    if (inblossom[j] == b) {
                        int tmp = i;
                        i = j;
                        j = tmp;
                    }
                    int bj = inblossom[j];
                    if (bj != b && label[bj] == 1
                            && (bestedgeto[bj] == -1 || slack(kk) < slack(bestedgeto[bj]))) {
                        bestedgeto[bj] = kk;
                    }
                }
            }
            blossombestedges[child] = null;
            bestedge[child] = -1;
        }
        blossombestedges[b] = Arrays.stream(bestedgeto).filter(x -> x != -1).toArray();
        bestedge[b] = -1;
        for (int kk : blossombestedges[b]) {
            if (bestedge[b] == -1 || slack(kk) < slack(bestedge[b])) {
                bestedge[b] = kk;
            }
        }
    }

    private static int indexOf(int[] arr, int value) {
        for (int x = 0; x < arr.length; x++) {
            if (arr[x] == value) {
                return x;
            }
        }
        throw new IllegalStateException("child not found");
    }

    /** Python-style index: negative counts from the end. */
    private static int at(int[] arr, int idx) {
        return arr[idx < 0 ? idx + arr.length : idx];
    }

    private void expandBlossom(int b, boolean endstage) {
        for (int s : blossomchilds[b]) {
            blossomparent[s] = -1;
            if (s < nvertex) {
                inblossom[s] = s;
            } else if (endstage && dualvar[s] == 0) {
                expandBlossom(s, endstage);
            } else {
                for (int leaf : leaves(s)) {
                    inblossom[leaf] = s;
                }
            }
        }
        if (!endstage && label[b] == 2) {
            int[] childs = blossomchilds[b];
            int[] endps = blossomendps[b];
            int entrychild = inblossom[endpoint[labelend[b] ^ 1]];
            int j = indexOf(childs, entrychild);
            int jstep;
            int endptrick;
            if ((j & 1) != 0) {
                j -= childs.length;
                jstep = 1;
                endptrick = 0;
            } else {
                jstep = -1;
                endptrick = 1;
            }
            int p = labelend[b];
            while (j != 0) {
                label[endpoint[p ^ 1]] = 0;
                label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]] = 0;
                assignLabel(endpoint[p ^ 1], 2, p);
                allowedge[at(endps, j - endptrick) / 2] = true;
                j += jstep;
                p = at(endps, j - endptrick) ^ endptrick;
                allowedge[p / 2] = true;
                j += jstep;
            }
            int bv = at(childs, j);
            label[endpoint[p ^ 1]] = label[bv] = 2;
            labelend[endpoint[p ^ 1]] = labelend[bv] = p;
            bestedge[bv] = -1;
            j += jstep;
            while (at(childs, j) != entrychild) {
                bv = at(childs, j);
                if (label[bv] == 1) {
                    j += jstep;
                    continue;
                }
                List<Integer> lv = leaves(bv);
                int v = lv.get(lv.size() - 1);
                for (int leaf : lv) {
                    if (label[leaf] != 0) {
                        v = leaf;
                        break;
                    }
                }
                if (label[v] != 0) {
                    label[v] = 0;
                    label[endpoint[mate[blossombase[bv]]]] = 0;
                    assignLabel(v, 2, labelend[v]);
                }
                j += jstep;
            }
        }
        label[b] = labelend[b] = -1;
        blossomchilds[b] = blossomendps[b] = null;
        blossombase[b] = -1;
        blossombestedges[b] = null;
        bestedge[b] = -1;
        unusedblossoms.push(b);
    }

    private void augmentBlossom(int b, int v) {
        int t = v;
        while (blossomparent[t] != b) {
            t = blossomparent[t];
        }
        if (t >= nvertex) {
            augmentBlossom(t, v);
        }
        int[] childs = blossomchilds[b];
        int[] endps = blossomendps[b];
        int i = indexOf(childs, t);
        int j = i;
        int jstep;
        int endptrick;
        if ((i & 1) != 0) {
            j -= childs.length;
            jstep = 1;
            endptrick = 0;
        } else {
            jstep = -1;
            endptrick = 1;
        }
        while (j != 0) {
            j += jstep;
            t = at(childs, j);
            int p = at(endps, j - endptrick) ^ endptrick;
            if (t >= nvertex) {
                augmentBlossom(t, endpoint[p]);
            }
            j += jstep;
            t = at(childs, j);
            if (t >= nvertex) {
                augmentBlossom(t, endpoint[p ^ 1]);
            }
            mate[endpoint[p]] = p ^ 1;
            mate[endpoint[p ^ 1]] = p;
        }
        blossomchilds[b] = rotate(childs, i);
        blossomendps[b] = rotate(endps, i);
        blossombase[b] = blossombase[blossomchilds[b][0]];
    }

    private static int[] rotate(int[] arr, int i) {
        int[] out = new int[arr.length];
        for (int x = 0; x < arr.length; x++) {
            out[x] = arr[(x + i) % arr.length];
        }
        return out;
    }

    private void augmentMatching(int k) {
        int[][] starts = {{edgeI[k], 2 * k + 1}, {edgeJ[k], 2 * k}};
        for (int[] start : starts) {
            int s = start[0];
            int p = start[1];
            while (true) {
                int bs = inblossom[s];
                if (bs >= nvertex) {
                    augmentBlossom(bs, s);
                }
                mate[s] = p;
                if (labelend[bs] == -1) {
                    break;
                }
                int t = endpoint[labelend[bs]];
                int bt = inblossom[t];
                s = endpoint[labelend[bt]];
                int j = endpoint[labelend[bt] ^ 1];
                if (bt >= nvertex) {
                    augmentBlossom(bt, j);
                }
                mate[j] = labelend[bt];
                p = labelend[bt] ^ 1;
            }
        }
    }

    private int[] run() {
        for (int stage = 0; stage < nvertex; stage++) {
            Arrays.fill(label, 0);
            Arrays.fill(bestedge, -1);
            for (int b = nvertex; b < 2 * nvertex; b++) {
                blossombestedges[b] = null;
            }
            Arrays.fill(allowedge, false);
            queue.clear();
            for (int v = 0; v < nvertex; v++) {
                if (mate[v] == -1 && label[inblossom[v]] == 0) {
                    assignLabel(v, 1, -1);
                }
            }
            boolean augmented = false;
            while (true) {
                while (!queue.isEmpty() && !augmented) {
                    int v = queue.remove(queue.size() - 1);
                    for (int p : neighbend[v]) {
                        int k = p / 2;
                        int w = endpoint[p];
                        if (inblossom[v] == inblossom[w]) {
                            continue;
                        }
                        long kslack = 0;
                        if (!allowedge[k]) {
                            kslack = slack(k);
                            if (kslack <= 0) {
                                allowedge[k] = true;
                            }
                        }
                        if (allowedge[k]) {
                            if (label[inblossom[w]] == 0) {
                                assignLabel(w, 2, p ^ 1);
                            } else if (label[inblossom[w]] == 1) {
                                int base = scanBlossom(v, w);
                                if (base >= 0) {
                                    addBlossom(base, k);
                                } else {
                                    augmentMatching(k);
                                    augmented = true;
                                    break;
                                }
                            } else if (label[w] == 0) {
                                label[w] = 2;
                                labelend[w] = p ^ 1;
                            }
                        } else if (label[inblossom[w]] == 1) {
                            int b = inblossom[v];
                            if (bestedge[b] == -1 || kslack < slack(bestedge[b])) {
                                bestedge[b] = k;
                            }
                        } else if (label[w] == 0) {
                            if (bestedge[w] == -1 || kslack < slack(bestedge[w])) {
                                bestedge[w] = k;
                            }
                        }
                    }
                }
                if (augmented) {
                    break;
                }
                int deltatype = -1;
                long delta = 0;
                int deltaedge = -1;
                int deltablossom = -1;
                if (!maxCardinality) {
                    deltatype = 1;
                    delta = Long.MAX_VALUE;
                    for (int v = 0; v < nvertex; v++) {
                        delta = Math.min(delta, dualvar[v]);
                    }
                }
                for (int v = 0; v < nvertex; v++) {
                    if (label[inblossom[v]] == 0 && bestedge[v] != -1) {
                        long d = slack(bestedge[v]);
                        if (deltatype == -1 || d < delta) {
                            delta = d;
                            deltatype = 2;
                            deltaedge = bestedge[v];
                        }
                    }
                }
                for (int b = 0; b < 2 * nvertex; b++) {
                    if (blossomparent[b] == -1 && label[b] == 1 && bestedge[b] != -1) {
                        long kslack = slack(bestedge[b]);
                        if ((kslack & 1) != 0) {
                            throw new IllegalStateException("odd slack – integrality violated");
                        }
                        long d = kslack / 2;
                        if (deltatype == -1 || d < delta) {
                            delta = d;
                            deltatype = 3;
                            deltaedge = bestedge[b];
                        }
                    }
                }
                for (int b = nvertex; b < 2 * nvertex; b++) {
                    if (blossombase[b] >= 0 && blossomparent[b] == -1 && label[b] == 2
                            && (deltatype == -1 || dualvar[b] < delta)) {
                        delta = dualvar[b];
                        deltatype = 4;
                        deltablossom = b;
                    }
                }
                if (deltatype == -1) {
                    deltatype = 1;
                    long min = Long.MAX_VALUE;
                    for (int v = 0; v < nvertex; v++) {
                        min = Math.min(min, dualvar[v]);
                    }
                    delta = Math.max(0, min);
                }
                for (int v = 0; v < nvertex; v++) {
                    if (label[inblossom[v]] == 1) {
                        dualvar[v] -= delta;
                    } else if (label[inblossom[v]] == 2) {
                        dualvar[v] += delta;
                    }
                }
                for (int b = nvertex; b < 2 * nvertex; b++) {
                    if (blossombase[b] >= 0 && blossomparent[b] == -1) {
                        if (label[b] == 1) {
                            dualvar[b] += delta;
                        } else if (label[b] == 2) {
                            dualvar[b] -= delta;
                        }
                    }
                }
                if (deltatype == 1) {
                    break;
                } else if (deltatype == 2) {
                    allowedge[deltaedge] = true;
                    int i = edgeI[deltaedge];
                    int j = edgeJ[deltaedge];
                    if (label[inblossom[i]] == 0) {
                        i = j;
                    }
                    queue.add(i);
                } else if (deltatype == 3) {
                    allowedge[deltaedge] = true;
                    queue.add(edgeI[deltaedge]);
                } else {
                    expandBlossom(deltablossom, false);
                }
            }
            if (!augmented) {
                break;
            }
            for (int b = nvertex; b < 2 * nvertex; b++) {
                if (blossomparent[b] == -1 && blossombase[b] >= 0 && label[b] == 1 && dualvar[b] == 0) {
                    expandBlossom(b, true);
                }
            }
        }
        int[] result = new int[nvertex];
        for (int v = 0; v < nvertex; v++) {
            result[v] = mate[v] >= 0 ? endpoint[mate[v]] : -1;
        }
        return result;
    }
}
