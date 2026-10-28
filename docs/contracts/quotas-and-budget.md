## Quotas and budget

Server only. Spend is counted in integer micro-dollars: reserve with
Redis `INCRBY` before each model call, refund with `DECRBY` after, one
reserve per call including retries. The server clamps every model tool
argument. Clients never see keys or raw errors. Generic messages go to
the client, details stay in server logs.
