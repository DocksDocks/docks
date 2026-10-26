# Judge instructions

You judge the findings of one benchmark workspace (`<ws>`). Use a model from another family than the reviewers, so that the judge does not share their blind spots.

## Inputs

- `<ws>/pairs.json`: for each case, the known defects and the protected decisions; for each run of the case, every finding, the candidate pairs of a finding and a known defect, and the protected pairs of a finding and a protected decision. Each review round of a loop is a run of its own. Finding ids (`F-...`) and run labels (`R-...`) are opaque.
- The case files and key files (`<id>.key.json`) of the cases in the workspace. A key file is next to its case file, or, for held-out cases while reviewers run, in the keys folder outside the repository that the operator names (the folder that `score.mjs pairs --keys <dir>` read). `pairs.json` already holds their known defects and protected decisions. Open them only to check a detail.
- `<ws>/<case>/snapshot/`: the reviewed tree. Next to it: `plan.md`, the diff files, and `previous-review.md` for delta cases.
- `<ws>/trees/<run label>/`: the reviewed tree of a run that is a round after round 1 of a review loop. The loop repaired findings before that round, so the case snapshot does not show the code of the round. When this folder exists for a run label, read it instead of `<ws>/<case>/snapshot/` for the findings of that run.

Do not open `findings.json`, `report.md`, `results.md`, or the arm folders of a case (the folders that hold `run-<k>` folders). They name the reviewer setups, and a judge that knows the setup can favor one. Do not guess the setup from the style or the length of a finding.

Read files, and read official documentation pages on the web when a finding or a known defect makes a claim about an external tool, library, API, or standard: for example the manual of a command or the text of a specification. Do not open any page of the DocksDocks/docks repository (`github.com/DocksDocks/docks`, `raw.githubusercontent.com/DocksDocks/docks`, or `api.github.com/repos/DocksDocks/docks`), because it can show the fixes. Do not run commands or write any file other than your output file: `<ws>/judgments.json`, or `<ws>/judgments-second.json` as the second judge.

## Match pass

For each case, read its known defects first. Then do these steps for each pair in each run:

1. Read the finding (`severity`, `category`, `locator`, `text`) and the known defect (`title`, `locator`, and the other fields).
2. Answer `match` when the finding describes the same underlying defect: the same cause and the same effect. Other words, another line of the same code, or another fix still match. A finding that names a defect class matches each known defect that is an instance of that class. In a later round of a loop, a finding can repeat a known defect that the loop already repaired; answer `match` when it describes that defect.
3. Answer `no` when the finding describes another defect, or names the same place with another cause.
4. Answer `unknown` when the texts, the snapshot, and official documentation do not decide the question.
5. Give one sentence of reasons.

One finding can match several known defects. Several findings can match one known defect. Judge each pair on its own.

## Decision pass

A case can list protected decisions: decisions that the user made, such as a request correction or a choice of the user that the plan records. A reviewer must not re-argue them. Each protected decision has an `id`, the plan `section` that records it, and a `summary`. `pairs.json` pairs each finding of a run with each protected decision of its case (`protectedPairs`), whatever files the finding names.

For each case, read its protected decisions and the plan sections that record them first. Then do these steps for each protected pair in each run:

1. Read the finding and the protected decision.
2. Answer `match` when the finding asks to undo or change the decision, or reports the chosen behavior as a defect, and does not show a false premise or a broken effect of the decision. A false premise is a fact that the decision relies on and that is false in the reviewed tree or in official documentation. A broken effect is a repository instruction file (`AGENTS.md`, `CLAUDE.md`), a rule of the plan contract, or the correctness of the code or the plan that the decided behavior breaks. A finding shows a false premise or a broken effect only when its claim holds: check the claim as the adjudication pass tells.
3. Answer `no` when the finding is about another subject than the decision.
4. Answer `unknown` otherwise: for example when the finding is about the subject of the decision and shows a false premise or a broken effect, or when the texts, the snapshot, and official documentation do not decide whether the finding re-argues the decision.
5. Give one sentence of reasons that names the plan section that you read.

A decision `match` does not replace a rating. It is no `match` answer for a known defect, so the finding still gets its answers of the match pass and, without a `match` answer there, its rating in the adjudication pass.

## Adjudication pass

Then rate each finding of each run that got no `match` answer in the match pass. Read the reviewed tree of the run at its locator and trace the claim through the code or the plan.

- `valid`: the defect is real in the reviewed tree. The severity of the finding does not change the rating.
- `wrong`: the claim is false in this code, the plan records the behavior as intended, or the finding describes no defect. A recorded intent does not make a finding wrong when the finding shows that the recorded behavior breaks a repository instruction file (`AGENTS.md`, `CLAUDE.md`), the plan contract, or the correctness of the code: rate it `valid` when the instruction or contract rule that it quotes applies to the path, or when the broken effect holds in the reviewed tree.
- `unknown`: neither the snapshot nor official documentation shows whether the claim is true. Say what is missing.

Give one sentence of reasons that names the file, plan section, or documentation URL that you read.

## Output

Write `<ws>/judgments.json` in this shape:

```json
{
  "matches": [{ "finding": "F-0123456789", "known": "D1", "verdict": "match", "reason": "..." }],
  "reargued": [{ "finding": "F-0123456789", "protected": "U1", "verdict": "no", "reason": "..." }],
  "adjudications": [{ "finding": "F-9876543210", "rating": "valid", "reason": "..." }]
}
```

- Give one `matches` entry for each candidate pair in `pairs.json`. You may add an entry for another pair of a finding and a known defect of the same case when they match.
- Give one `reargued` entry for each protected pair in `pairs.json`. A workspace without protected pairs needs no `reargued` array.
- Give one `adjudications` entry for each finding without a `match` answer in `matches`.
- `verdict` is `match`, `no`, or `unknown`. `rating` is `valid`, `wrong`, or `unknown`.
- Copy finding ids, known-defect ids, and protected-decision ids exactly. The scoring script refuses an unknown id, a `matches` entry that does not name a known defect of the case of its finding, a `reargued` entry that does not name a protected decision of that case, two different answers for one pair or one finding, a candidate pair without a `matches` entry, a protected pair without a `reargued` entry, and a finding with neither a `match` answer in `matches` nor an `adjudications` entry.

## Second judge

A second judge from another model family than the first judge checks a sample of the answers in `judgments.json`: a random 10% of the `matches` and `adjudications` entries, every `reargued` entry with the verdict `match`, and a random 10% of the other `reargued` entries. The report counts a re-argued decision only from a `match` answer, and such answers are few, so the sample takes each of them. The operator gives the second judge the sampled pairs (a finding and a known defect), the sampled protected pairs (a finding and a protected decision), and the sampled findings, mixed and without the first judge's answers.

- Do not open `judgments.json`.
- Judge each sampled pair as the match pass tells, each sampled protected pair as the decision pass tells, and each sampled finding as the adjudication pass tells.
- Write `<ws>/judgments-second.json` in the shape above, with one entry for each sampled pair, protected pair, and finding and no other entry.

`score.mjs report` compares each answer of `judgments-second.json` with the same answer of `judgments.json` and gives the agreement rate. It refuses an answer for a pair, a protected pair, or a finding that `judgments.json` does not answer.
