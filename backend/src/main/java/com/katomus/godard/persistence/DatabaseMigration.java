package com.katomus.godard.persistence;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DatabaseMigration implements ApplicationRunner {

  private final DataSource dataSource;

  public DatabaseMigration(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  @Override
  public void run(ApplicationArguments arguments) {
    Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
  }
}
