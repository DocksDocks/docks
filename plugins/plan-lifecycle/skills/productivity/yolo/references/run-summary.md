# Run summary

Keep the summary short. Use this shape:

```markdown
## Yolo run: #<n> <title>

Pull request: <url>. Checks: <state>. Reviewed head: `<sha>`.

### What changed
- <behavior change> (`<path>`)

### Decisions and corrections
- <decision or request correction, with its evidence>

### Reviews
Plan review passed in round <k>. Code review passed in round <k>.
Open findings: <MEDIUM or LOW findings left at the ceiling, or none>.

### Verification
- `<command>`: <result>

### Limits and failures
- <failed or partial check, check not run, skipped platform, or baseline failure, with its cause; or none>

### After merge
- <steps that need their own question, the merged local branch, or none>
```

Copy each failure and limitation from Verification Results into Limits and
failures. Report a check that partly failed as a failure with its cause, not as
a pass.
