package com.godardstack;

final class JsonStrings {

    private static final int FIRST_PRINTABLE = 0x20;

    private JsonStrings() {
    }

    static String quote(String value) {
        if (value == null) {
            return "null";
        }
        StringBuilder quoted = new StringBuilder("\"");
        value.chars().forEach(character -> append(quoted, (char) character));
        return quoted.append('"').toString();
    }

    private static void append(StringBuilder quoted, char character) {
        switch (character) {
            case '"' -> quoted.append("\\\"");
            case '\\' -> quoted.append("\\\\");
            case '\n' -> quoted.append("\\n");
            case '\r' -> quoted.append("\\r");
            case '\t' -> quoted.append("\\t");
            default -> {
                if (character < FIRST_PRINTABLE) {
                    quoted.append(String.format("\\u%04x", (int) character));
                } else {
                    quoted.append(character);
                }
            }
        }
    }
}
