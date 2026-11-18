package com.katomus.godard.sgbd;

interface SgbdClient {

  SgbdHealth test(ConnectionTarget target) throws SgbdClientException;

  SgbdQueryResult execute(ConnectionTarget target, String command) throws SgbdClientException;
}
