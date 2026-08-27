import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Username rules, and finding a free one.
 *
 * The cases worth pinning are the ones where a near-miss would let two
 * accounts exist that are indistinguishable to a reader — differing only by
 * case, by surrounding whitespace, or by a trailing dot — and the ones where
 * a suggestion is offered that the validator would then turn around and
 * reject.
 */

/** Rows the stubbed database will claim are registered. */
let registered: string[] = [];

vi.mock("../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        // The action filters on lower(name) IN (...); the stub returns every
        // registered row and lets the caller's own normalisation do the rest,
        // which is what the real query does after Postgres has matched.
        where: () => Promise.resolve(registered.map((name) => ({ name }))),
      }),
    }),
  }),
  isDatabaseConfigured: () => true,
}));

const {
  describeUsernameProblem,
  normalizeUsername,
  isUsernameTaken,
  suggestUsernames,
  MIN_USERNAME,
  MAX_USERNAME,
} = await import("./username");

beforeEach(() => {
  registered = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what counts as a username", () => {
  it("accepts an ordinary one", () => {
    for (const ok of ["Yashik07", "bob", "a_b-c.d", "trader2026", "AAA"]) {
      expect(describeUsernameProblem(ok)).toBeNull();
    }
  });

  it("enforces the length bounds", () => {
    expect(describeUsernameProblem("ab")).toContain(String(MIN_USERNAME));
    expect(describeUsernameProblem("a".repeat(MAX_USERNAME + 1))).toContain(String(MAX_USERNAME));
    expect(describeUsernameProblem("a".repeat(MAX_USERNAME))).toBeNull();
  });

  /*
    A space is the difference between a display name and an identifier, and
    the message says which one this field is rather than just refusing.
  */
  it("refuses spaces, and says what to use instead", () => {
    const problem = describeUsernameProblem("John Smith");
    expect(problem).toContain("spaces");
    expect(problem).toMatch(/dot|dash|underscore/);
  });

  it("refuses characters outside the set", () => {
    for (const bad of ["bob@home", "bob!", "bob/smith", "bob#1", "émile"]) {
      expect(describeUsernameProblem(bad)).not.toBeNull();
    }
  });

  /*
    "bob." and "bob" read as the same name in a sentence. Allowing both means
    two accounts nobody can tell apart.
  */
  it("refuses leading and trailing punctuation", () => {
    expect(describeUsernameProblem(".bob")).toContain("start and end");
    expect(describeUsernameProblem("bob.")).toContain("start and end");
    expect(describeUsernameProblem("-bob-")).toContain("start and end");
  });

  it("refuses doubled punctuation, which reads as a typo", () => {
    expect(describeUsernameProblem("bob..smith")).toContain("two punctuation");
    expect(describeUsernameProblem("bob__smith")).toContain("two punctuation");
    expect(describeUsernameProblem("bob_smith")).toBeNull();
  });

  /*
    Not moderation — impersonation. A message from "Support" carries an
    authority a stranger's account should not be able to borrow.
  */
  it("reserves the names that would impersonate the service", () => {
    for (const reserved of ["admin", "Support", "STOCKFILTER", "no-reply", "billing"]) {
      expect(describeUsernameProblem(reserved)).toContain("reserved");
    }
  });

  it("ignores surrounding whitespace when judging", () => {
    expect(describeUsernameProblem("  bob  ")).toBeNull();
  });
});

describe("comparing two usernames", () => {
  it("treats case as the same claim", () => {
    expect(normalizeUsername("Yashik07")).toBe(normalizeUsername("yashik07"));
    expect(normalizeUsername("  BOB  ")).toBe("bob");
  });
});

describe("checking availability", () => {
  it("finds a name that is registered", async () => {
    registered = ["yashik07"];
    expect(await isUsernameTaken("yashik07")).toBe(true);
  });

  /*
    The case the database index exists to stop. Without case-insensitive
    comparison here, the check passes and the insert then fails — the reader
    gets a crash where they should have got a suggestion.
  */
  it("finds it regardless of case", async () => {
    registered = ["Yashik07"];
    expect(await isUsernameTaken("yashik07")).toBe(true);
    expect(await isUsernameTaken("YASHIK07")).toBe(true);
  });

  it("says a free name is free", async () => {
    registered = ["someone-else"];
    expect(await isUsernameTaken("yashik07")).toBe(false);
  });
});

describe("suggesting an alternative", () => {
  it("offers names close to the one that was wanted", async () => {
    registered = ["yashik07"];
    const suggestions = await suggestUsernames("yashik07");

    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(s.toLowerCase()).toContain("yashik07");
  });

  /*
    A suggestion that is also taken is worse than no suggestion: the reader
    tries it and is refused a second time by the same form.
  */
  it("never offers a name that is already registered", async () => {
    registered = ["bob", "bob1", "bob2", "bob3"];
    const suggestions = await suggestUsernames("bob");

    for (const s of suggestions) {
      expect(registered.map((r) => r.toLowerCase())).not.toContain(s.toLowerCase());
    }
  });

  /*
    Every suggestion has to survive the same validator a typed name does —
    otherwise the form offers a choice it will reject on submit.
  */
  it("only offers names its own rules accept", async () => {
    registered = ["bob"];
    for (const s of await suggestUsernames("bob")) {
      expect(describeUsernameProblem(s)).toBeNull();
    }
  });

  it("keeps suggestions inside the length limit for a name already at it", async () => {
    const long = "a".repeat(MAX_USERNAME);
    registered = [long];
    const suggestions = await suggestUsernames(long);

    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.length).toBeLessThanOrEqual(MAX_USERNAME);
      expect(describeUsernameProblem(s)).toBeNull();
    }
  });

  it("returns nothing for an empty base rather than inventing one", async () => {
    expect(await suggestUsernames("")).toEqual([]);
    expect(await suggestUsernames("   ")).toEqual([]);
  });

  it("does not suffix onto trailing punctuation", async () => {
    registered = ["bob"];
    const suggestions = await suggestUsernames("bob-");
    for (const s of suggestions) expect(s).not.toContain("-1");
  });

  it("caps how many it offers", async () => {
    registered = ["bob"];
    expect((await suggestUsernames("bob", 2)).length).toBeLessThanOrEqual(2);
  });
});
