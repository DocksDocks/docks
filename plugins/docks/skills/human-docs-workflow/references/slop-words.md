# AI Slop Word List

Phrases that signal generated-without-grounding text. Reject them in docs and rewrite with project-specific facts (concrete numbers, real file paths, actual stack components).

## Banned phrases

- "leverage" / "leveraging" — say "use"
- "robust" — say what specifically makes it sturdy (test coverage %, fuzz tested, etc.)
- "seamless" / "seamlessly" — drop or describe the actual integration
- "comprehensive" — name what's actually covered (cite the surface area)
- "world-class" / "best-in-class" — drop entirely; subjective marketing
- "harness the power of" — name the specific feature being used
- "elegant" — describe the property concretely (composable, single-responsibility, etc.)
- "powerful" — name the specific capability and its limits
- "easy to use" — show a copy-pasteable example instead
- "intuitive" — drop; readers decide if it's intuitive
- "modern" — cite the version / standard
- "cutting-edge" / "state-of-the-art" — cite the year and benchmark

## Replacement pattern

Any sentence that contains a banned phrase needs the same factual content stated with a project-specific anchor:

- BEFORE: "Leverage our robust auth system to seamlessly handle multi-tenant access."
- AFTER: "Auth uses JWT-signed sessions stored in HTTP-only cookies; per-tenant scoping is enforced at the route layer (`src/auth/middleware.ts:42`)."

## Test

If a sentence could appear in any project's README without modification, it doesn't belong in this project's README. Replace with content that names files, numbers, versions, or behaviors specific to this project.

## Common slop carriers

These section headers tend to invite slop — flag them for rewrite:

- "Why X?" sections that praise the project rather than explain choices
- "Features" lists with adjectives rather than capabilities
- "About" sections that read like product copy
- Tagline subtitles after the H1
