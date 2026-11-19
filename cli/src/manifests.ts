import { existsSync, lstatSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { engineHome } from "./engine-native/harnesses";
import { skillBase } from "./engine-native/skillsManifest";
import { COPY_MARKER } from "./engine-native/skillsSync";
import { payloadText } from "./payload";

/** Universal skills: SoT manifest slugs vs ~/.agents/skills contents. */
export const skillsView = (): Array<{
  skill: string;
  declared: boolean;
  installed: boolean;
  /** Claude entry resolves to the canonical skill by symlink, junction, or kit-created copy. */
  claudeSymlink: boolean;
}> => {
  const declared = payloadText("SoT/.agents/skills.txt")
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l.length > 0)
    .map(skillBase);
  const home = engineHome();
  const skillsDir = join(home, ".agents", "skills");
  const installed = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
  const names = new Set([...declared, ...installed]);
  return [...names].sort().map((skill) => {
    const link = join(home, ".claude", "skills", skill);
    const canonical = resolve(skillsDir, skill);
    let claudeSymlink = false;
    try {
      const target = resolve(dirname(link), readlinkSync(link));
      claudeSymlink = target === canonical && existsSync(target);
    } catch {
      /* not a symlink or missing */
    }
    if (!claudeSymlink && installed.includes(skill)) {
      try {
        claudeSymlink = lstatSync(link).isDirectory() && existsSync(join(link, COPY_MARKER));
      } catch {
        /* missing Claude entry */
      }
    }
    return {
      skill,
      declared: declared.includes(skill),
      installed: installed.includes(skill),
      claudeSymlink,
    };
  });
};
