package com.katomus.godard.sgbd;

import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.List;
import org.junit.jupiter.api.Test;

class SgbdLogRedactionTest {

  @Test
  void doesNotIncludeCredentialsOrQueryContentInDiagnosticText() {
    String secret = "must-not-appear-in-logs";
    SgbdConnectionDraft draft =
        new SgbdConnectionDraft(
            "local",
            "redis",
            "127.0.0.1",
            6379,
            "user",
            secret,
            true,
            "0",
            false,
            false,
            true,
            false,
            List.of());
    SgbdConnectionController.ExecuteRequest request =
        new SgbdConnectionController.ExecuteRequest(secret, secret);
    SgbdQueryResult result =
        new SgbdQueryResult(secret, List.of("value"), List.of(List.of(secret)), null, false, 1);
    SgbdConsoleDraft console = new SgbdConsoleDraft(secret);
    SgbdConsoleUpdate update =
        new SgbdConsoleUpdate(secret, secret, secret, 50, secret, secret, false);
    SgbdConsoleView view =
        new SgbdConsoleView(1, secret, secret, secret, 50, true, secret, secret, false);

    assertFalse(draft.toString().contains(secret));
    assertFalse(request.toString().contains(secret));
    assertFalse(result.toString().contains(secret));
    assertFalse(console.toString().contains(secret));
    assertFalse(update.toString().contains(secret));
    assertFalse(view.toString().contains(secret));
  }
}
