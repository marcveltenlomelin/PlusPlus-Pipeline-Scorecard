import { describe, expect, it } from "vitest";
import { STAGE_GOALS } from "./config";
import { applyAnnotationOp, applyPatch, latestVersion, versionPathname } from "./store";
import { defaultDigest, type AnnotationOp, type Store } from "./types";

function emptyStore(): Store {
  return {
    goals: Object.fromEntries(
      Object.entries(STAGE_GOALS).map(([k, v]) => [k, { ...v }])
    ) as Store["goals"],
    overrides: {},
    sdrs: [],
    digest: defaultDigest(),
    annotations: [],
  };
}

describe("applyPatch — SDR roster semantics", () => {
  it("adds trimmed, deduped SDR names", () => {
    const s = applyPatch(emptyStore(), { addSdrs: ["Ana", "  Ana  ", "Ben", ""] });
    expect(s.sdrs).toEqual(["Ana", "Ben"]);
  });

  it("removes names from the roster only (assignments live in HubSpot)", () => {
    let s = applyPatch(emptyStore(), { addSdrs: ["Ana", "Ben"] });
    s = applyPatch(s, { removeSdrs: ["Ana"] });
    expect(s.sdrs).toEqual(["Ben"]);
  });

  it("leaves the legacy goals/overrides contract intact", () => {
    const s = applyPatch(emptyStore(), {
      goals: { sal: { month: 40 } },
      setOverrides: { "tp:sal:2026-06": { value: 9, at: 1 } },
    });
    expect(s.goals.sal.month).toBe(40);
    expect(s.goals.sal.year).toBe(STAGE_GOALS.sal.year); // merge, not replace
    expect(s.overrides["tp:sal:2026-06"].value).toBe(9);
    const cleared = applyPatch(s, { clearOverrides: ["tp:sal:2026-06"] });
    expect(cleared.overrides).toEqual({});
  });
});

describe("applyPatch — digest settings", () => {
  it("merges digest config shallowly with per-key section merge", () => {
    const s = applyPatch(emptyStore(), {
      digest: { cadence: "biweekly", sections: { stale: false } },
    });
    expect(s.digest.cadence).toBe("biweekly");
    expect(s.digest.sections.stale).toBe(false);
    expect(s.digest.sections.headline).toBe(true); // untouched keys survive
    expect(s.digest.recipients).toEqual([]);
  });

  it("normalizes recipients: trim, lowercase, dedupe, must contain @", () => {
    const s = applyPatch(emptyStore(), {
      digest: { recipients: [" Marc@PlusPlus.co ", "marc@plusplus.co", "not-an-email", "x@y.co"] },
    });
    expect(s.digest.recipients).toEqual(["marc@plusplus.co", "x@y.co"]);
  });
});

describe("blob version pathnames", () => {
  it("sort chronologically as strings (zero-padded ms)", () => {
    const early = versionPathname(999, "aaaaaaaa");
    const late = versionPathname(1765000000000, "00000000");
    expect(early < late).toBe(true); // padding beats digit-count pitfalls
    expect(early).toBe("store/00000000000999-aaaaaaaa.json");
  });

  it("latestVersion picks the newest and ignores foreign pathnames", () => {
    const v1 = versionPathname(1765000000000, "aaaaaaaa");
    const v2 = versionPathname(1765000000001, "00000000");
    expect(latestVersion([v2, "other/zzz.json", v1])).toBe(v2);
    expect(latestVersion(["other/zzz.json"])).toBeNull();
    expect(latestVersion([])).toBeNull();
  });
});

describe("applyAnnotationOp", () => {
  const base = (): Store => ({
    ...emptyStore(),
    annotations: [
      {
        id: "a1",
        monthIso: "2026-04",
        title: "Webinar ran",
        color: "good",
        authorEmail: "milos@plusplus.co",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  });
  const milos = { email: "milos@plusplus.co", isAdmin: false };
  const daniela = { email: "daniela@plusplus.co", isAdmin: false };
  const admin = { email: "marc@plusplus.co", isAdmin: true };
  const stamp = { id: "a2", now: 2000 };

  it("creates with server-stamped author and timestamps", () => {
    const s = applyAnnotationOp(
      base(),
      { kind: "create", monthIso: "2026-06", title: "  Launch  ", color: "accent" },
      daniela,
      stamp
    );
    const a = s.annotations.find((x) => x.id === "a2")!;
    expect(a.authorEmail).toBe("daniela@plusplus.co");
    expect(a.title).toBe("Launch"); // trimmed
    expect(a.createdAt).toBe(2000);
  });

  it("validates title, description, color, and month format", () => {
    const create = (over: object) =>
      applyAnnotationOp(base(), { kind: "create", monthIso: "2026-06", title: "t", color: "good", ...over } as AnnotationOp, milos, stamp);
    expect(() => create({ title: "" })).toThrow(/required/);
    expect(() => create({ title: "x".repeat(61) })).toThrow(/60/);
    expect(() => create({ description: "x".repeat(281) })).toThrow(/280/);
    expect(() => create({ color: "magenta" })).toThrow(/color/i);
    expect(() => create({ monthIso: "June 2026" })).toThrow(/YYYY-MM/);
  });

  it("lets the author update their own, preserving createdAt", () => {
    const s = applyAnnotationOp(
      base(),
      { kind: "update", id: "a1", title: "Webinar + LinkedIn push", color: "warn" },
      milos,
      stamp
    );
    const a = s.annotations[0];
    expect(a.title).toBe("Webinar + LinkedIn push");
    expect(a.createdAt).toBe(1000);
    expect(a.updatedAt).toBe(2000);
  });

  it("blocks non-authors and allows admins", () => {
    expect(() =>
      applyAnnotationOp(base(), { kind: "delete", id: "a1" }, daniela, stamp)
    ).toThrow(/author or an admin/);
    const s = applyAnnotationOp(base(), { kind: "delete", id: "a1" }, admin, stamp);
    expect(s.annotations).toHaveLength(0);
  });

  it("404s on unknown ids", () => {
    expect(() => applyAnnotationOp(base(), { kind: "delete", id: "nope" }, admin, stamp)).toThrow(/not found/);
  });
});
