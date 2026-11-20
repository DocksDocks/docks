import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { kitDbFile } from "../../src/engine-native/kitDb";
import {
  engineHome,
  readOmpSessionModel,
  writeOmpSessionModel,
} from "../../src/engine-native/ompSession";

let home = "";

function legacyFile(): string {
  return join(home, ".docks-kit", "state.json");
}

function writeLegacyState(content: string): void {
  mkdirSync(join(home, ".docks-kit"), { recursive: true });
  writeFileSync(legacyFile(), content);
}

/** The rows of `harness_selection`, which schema 1 keeps and nothing reads. */
function harnessRows(): Array<unknown> {
  const db = new DatabaseSync(kitDbFile(home), { readOnly: true });
  try {
    return db.prepare("SELECT harness FROM harness_selection").all();
  } finally {
    db.close();
  }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "docks-omp-session-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("kit store", () => {
  it("imports the session model of a valid legacy state.json once and renames it", () => {
    writeLegacyState(
      JSON.stringify({
        version: 1,
        harnesses: ["omp", "agents"],
        ompSession: { selector: "a/b", thinking: "high" },
      }),
    );

    expect(readOmpSessionModel(home)).toEqual({ selector: "a/b", thinking: "high" });
    expect(existsSync(legacyFile())).toBe(false);
    expect(existsSync(`${legacyFile()}.migrated`)).toBe(true);
  });

  it("imports no harness selection from a legacy state.json", () => {
    writeLegacyState(
      JSON.stringify({
        version: 1,
        harnesses: ["omp", "agents"],
        ompSession: { selector: "a/b" },
      }),
    );

    expect(readOmpSessionModel(home)).toEqual({ selector: "a/b" });
    expect(harnessRows()).toEqual([]);
  });

  it("does not replace a stored session model with a late legacy file", () => {
    writeOmpSessionModel(home, { selector: "provider/current", thinking: "high" });
    writeLegacyState(
      JSON.stringify({
        version: 1,
        ompSession: { selector: "provider/old", thinking: "low" },
      }),
    );

    expect(readOmpSessionModel(home)).toEqual({
      selector: "provider/current",
      thinking: "high",
    });
    expect(existsSync(legacyFile())).toBe(false);
    expect(existsSync(`${legacyFile()}.migrated`)).toBe(true);
  });

  it("imports nothing from an invalid legacy file and still renames it", () => {
    writeLegacyState("{invalid");

    expect(readOmpSessionModel(home)).toBeUndefined();
    expect(existsSync(legacyFile())).toBe(false);
    expect(existsSync(`${legacyFile()}.migrated`)).toBe(true);
  });

  it("ignores an unsupported legacy state version", () => {
    writeLegacyState(
      JSON.stringify({
        version: 2,
        ompSession: { selector: "provider/too-new" },
      }),
    );

    expect(readOmpSessionModel(home)).toBeUndefined();
    expect(existsSync(legacyFile())).toBe(false);
    expect(existsSync(`${legacyFile()}.migrated`)).toBe(true);
  });

  it("creates no store when a read finds neither file", () => {
    expect(readOmpSessionModel(home)).toBeUndefined();
    expect(existsSync(kitDbFile(home))).toBe(false);
  });

  it("treats a corrupt SQLite store as a missing session model", () => {
    mkdirSync(join(home, ".docks-kit"));
    writeFileSync(kitDbFile(home), "not a SQLite database");

    expect(readOmpSessionModel(home)).toBeUndefined();
  });

  it("refuses a store from a newer schema", () => {
    writeOmpSessionModel(home, { selector: "provider/current" });
    const db = new DatabaseSync(kitDbFile(home));
    db.exec("PRAGMA user_version = 99");
    db.close();

    expect(readOmpSessionModel(home)).toBeUndefined();
    expect(() => writeOmpSessionModel(home, { selector: "provider/next" })).toThrow(
      /schema 99.*Upgrade docks-kit/s,
    );
    const after = new DatabaseSync(kitDbFile(home), { readOnly: true });
    const version = after.prepare("PRAGMA user_version").get()?.["user_version"];
    const rows = after.prepare("SELECT selector FROM omp_session").all();
    after.close();
    expect(version).toBe(99);
    expect(rows).toEqual([{ selector: "provider/current" }]);
  });

  it("records the schema migration and preserves rows across opens", () => {
    writeOmpSessionModel(home, { selector: "a/b" });

    const db = new DatabaseSync(kitDbFile(home), { readOnly: true });
    const version = db.prepare("PRAGMA user_version").get()?.["user_version"];
    db.close();
    expect(version).toBe(1);
    expect(readOmpSessionModel(home)).toEqual({ selector: "a/b" });
  });

  it("creates a private store and directory under the selected home", () => {
    writeOmpSessionModel(home, { selector: "a/b" });

    const stateFile = kitDbFile(home);
    expect(existsSync(stateFile)).toBe(true);
    if (process.platform !== "win32") {
      expect(statSync(stateFile).mode & 0o777).toBe(0o600);
      expect(statSync(join(home, ".docks-kit")).mode & 0o777).toBe(0o700);
    }
  });

  it("tightens an existing permissive state directory to 0700", () => {
    if (process.platform === "win32") return;
    mkdirSync(`${home}/.docks-kit`, { recursive: true, mode: 0o755 });
    chmodSync(`${home}/.docks-kit`, 0o755);

    writeOmpSessionModel(home, { selector: "a/b" });

    expect(statSync(`${home}/.docks-kit`).mode & 0o777).toBe(0o700);
  });

  it("reads an existing store without changing its permissions", () => {
    if (process.platform === "win32") return;
    writeOmpSessionModel(home, { selector: "a/b" });
    chmodSync(`${home}/.docks-kit`, 0o755);
    chmodSync(kitDbFile(home), 0o644);

    expect(readOmpSessionModel(home)).toEqual({ selector: "a/b" });
    expect(statSync(`${home}/.docks-kit`).mode & 0o777).toBe(0o755);
    expect(statSync(kitDbFile(home)).mode & 0o777).toBe(0o644);
  });

  it("keeps the session models of separate homes independent", () => {
    const otherHome = mkdtempSync(join(tmpdir(), "docks-omp-session-other-"));
    try {
      writeOmpSessionModel(home, { selector: "provider/first" });
      writeOmpSessionModel(otherHome, { selector: "provider/second" });

      expect(readOmpSessionModel(home)).toEqual({ selector: "provider/first" });
      expect(readOmpSessionModel(otherHome)).toEqual({ selector: "provider/second" });
    } finally {
      rmSync(otherHome, { recursive: true, force: true });
    }
  });

  it("resolves the engine home from HOME with a homedir fallback", () => {
    expect(engineHome({ HOME: "/fixture/home" }, "linux")).toBe("/fixture/home");
    expect(engineHome({}, "linux")).toBe(homedir());
    expect(engineHome({ HOME: "" }, "darwin")).toBe(homedir());
  });

  it("resolves the engine home from USERPROFILE on Windows and ignores HOME", () => {
    expect(engineHome({ HOME: "C:\\msys64\\home\\u", USERPROFILE: "C:\\Users\\u" }, "win32")).toBe(
      "C:\\Users\\u",
    );
    expect(engineHome({ HOME: "C:\\msys64\\home\\u" }, "win32")).toBe(homedir());
    expect(engineHome({ HOME: "C:\\msys64\\home\\u", USERPROFILE: "" }, "win32")).toBe(homedir());
  });
});

describe("omp session model state", () => {
  it("drops a blank legacy level and the retired advisor level on import", () => {
    writeLegacyState(
      JSON.stringify({
        version: 1,
        ompSession: { selector: "provider/model-free", thinking: "  ", advisorThinking: "low" },
      }),
    );

    expect(readOmpSessionModel(home)).toEqual({ selector: "provider/model-free" });
  });

  it("leaves no stale level behind when a level-free model overwrites a levelled one", () => {
    writeOmpSessionModel(home, { selector: "provider/model-free", thinking: "xhigh" });

    writeOmpSessionModel(home, { selector: "provider/other-free" });

    expect(readOmpSessionModel(home)).toEqual({ selector: "provider/other-free" });
  });

  it("stores whitespace-only levels as absent", () => {
    writeOmpSessionModel(home, { selector: "provider/model-free", thinking: "  " });

    expect(readOmpSessionModel(home)).toEqual({ selector: "provider/model-free" });
  });

  it("rejects a blank selector without losing the saved model", () => {
    writeOmpSessionModel(home, { selector: "provider/current", thinking: "high" });

    expect(() => writeOmpSessionModel(home, { selector: "  ", thinking: "xhigh" })).toThrow(
      /selector/i,
    );
    expect(readOmpSessionModel(home)).toEqual({ selector: "provider/current", thinking: "high" });
  });
});
