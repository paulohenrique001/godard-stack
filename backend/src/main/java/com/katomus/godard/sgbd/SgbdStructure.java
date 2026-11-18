package com.katomus.godard.sgbd;

import java.util.List;

public record SgbdStructure(List<Schema> schemas) {

  private static final SgbdStructure EMPTY = new SgbdStructure(List.of());

  public SgbdStructure {
    schemas = List.copyOf(schemas);
  }

  public static SgbdStructure empty() {
    return EMPTY;
  }

  public record Schema(String name, List<Table> tables) {

    public Schema {
      tables = List.copyOf(tables);
    }
  }

  public record Table(String name, List<Column> columns) {

    public Table {
      columns = List.copyOf(columns);
    }
  }

  public record Column(String name, String type) {}
}
