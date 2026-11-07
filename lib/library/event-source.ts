// The value that goes in events.source for a show imported from a CSV.
//
// Historically source was an adapter family key ("swapcard", "dimedis", …),
// chosen per show. Those adapters are gone — acquisition happens outside this
// repo now — so every show created from here carries this one value, and the
// older values survive only on rows that predate the change.
export const CSV_SOURCE = "csv";
