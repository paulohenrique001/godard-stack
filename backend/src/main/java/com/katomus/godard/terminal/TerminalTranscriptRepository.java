package com.katomus.godard.terminal;

import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class TerminalTranscriptRepository {

  public static final int MAX_CHARS = 256 * 1024;
  public static final String SESSION_END_MARKER = "\u001B]777;session-end\u0007";

  private static final Pattern ESCAPE_SEQUENCES =
      Pattern.compile("\u001B\\[[0-9;?]*[a-zA-Z]|\u001B\\][^\u0007]*\u0007");
  private static final Pattern PROMPT_LINE_END = Pattern.compile("[$#]\\s*$");

  private final JdbcClient jdbcClient;

  public TerminalTranscriptRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public String find(long tabId) {
    return jdbcClient
        .sql("SELECT content FROM terminal_transcript WHERE tab_id = :id")
        .param("id", tabId)
        .query(String.class)
        .optional()
        .orElse("");
  }

  public void append(long tabId, String text) {
    save(tabId, tail(find(tabId) + text));
  }

  public void replace(long tabId, String text) {
    save(tabId, tail(text));
  }

  public void closeOpenSession(long tabId) {
    if (!find(tabId).endsWith(SESSION_END_MARKER)) {
      endSession(tabId);
    }
  }

  public void endSession(long tabId) {
    String content = withoutTrailingPrompt(find(tabId));
    boolean blank = ESCAPE_SEQUENCES.matcher(content).replaceAll("").isBlank();
    save(tabId, blank ? "" : tail(content + SESSION_END_MARKER));
  }

  public static String tail(String text) {
    if (text.length() <= MAX_CHARS) {
      return text;
    }
    int start = text.length() - MAX_CHARS;
    int lineBreak = text.indexOf('\n', start);
    return text.substring(lineBreak < 0 ? start : lineBreak + 1);
  }

  private void save(long tabId, String content) {
    jdbcClient
        .sql(
            """
                        INSERT INTO terminal_transcript (tab_id, content)
                        VALUES (:id, :content)
                        ON CONFLICT(tab_id) DO UPDATE SET content = excluded.content
                        """)
        .param("id", tabId)
        .param("content", content)
        .update();
  }

  private static String withoutTrailingPrompt(String text) {
    int lineStart = text.lastIndexOf('\n') + 1;
    String lastLine = ESCAPE_SEQUENCES.matcher(text.substring(lineStart)).replaceAll("");
    return PROMPT_LINE_END.matcher(lastLine).find() ? text.substring(0, lineStart) : text;
  }
}
