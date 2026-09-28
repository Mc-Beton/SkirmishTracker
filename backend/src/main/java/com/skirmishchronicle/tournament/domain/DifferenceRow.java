package com.skirmishchronicle.tournament.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * One row of the point-difference table: a game won by at most {@code upTo} small points
 * (null = any larger difference) gives the winner/loser these big points.
 */
public record DifferenceRow(Integer upTo, int winner, int loser) {

    /** Example default; organizers adjust it to the scenario's typical VP range. */
    public static final String DEFAULT = "0:10:10;2:11:9;4:12:8;6:13:7;8:14:6;*:15:5";

    public static List<DifferenceRow> parse(String encoded) {
        List<DifferenceRow> rows = new ArrayList<>();
        if (encoded == null || encoded.isBlank()) {
            return parse(DEFAULT);
        }
        for (String part : encoded.split(";")) {
            String[] f = part.split(":");
            rows.add(new DifferenceRow("*".equals(f[0]) ? null : Integer.valueOf(f[0]),
                    Integer.parseInt(f[1]), Integer.parseInt(f[2])));
        }
        return rows;
    }

    public static String format(List<DifferenceRow> rows) {
        return rows.stream()
                .map(r -> (r.upTo() == null ? "*" : r.upTo().toString()) + ":" + r.winner() + ":" + r.loser())
                .collect(Collectors.joining(";"));
    }

    /** Rows ascending by upTo, the last one open-ended. Returns an error code or null. */
    public static String validate(List<DifferenceRow> rows) {
        if (rows == null || rows.isEmpty() || rows.size() > 30) {
            return "DIFFERENCE_TABLE_INVALID";
        }
        Integer previous = null;
        for (int i = 0; i < rows.size(); i++) {
            DifferenceRow r = rows.get(i);
            boolean last = i == rows.size() - 1;
            if (last != (r.upTo() == null)) {
                return "DIFFERENCE_TABLE_INVALID";
            }
            if (r.upTo() != null && (r.upTo() < 0 || (previous != null && r.upTo() <= previous))) {
                return "DIFFERENCE_TABLE_INVALID";
            }
            if (r.winner() < 0 || r.loser() < 0 || r.winner() > 1000 || r.loser() > 1000) {
                return "DIFFERENCE_TABLE_INVALID";
            }
            previous = r.upTo();
        }
        return null;
    }
}
