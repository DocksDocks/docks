# Judge instructions

You judge the findings of one benchmark workspace (`<ws>`). Use a model from another family than the reviewers, so that the judge does not share their blind spots.

## Inputs

- `<ws>/pairs.json`: for each case, the known defects; for each run of the case, every finding and the candidate pairs of a finding and a known defect. Each review round of a loop is a run of its own. Finding ids (`F-...`) and run labels (`R-...`) are opaque.
- The case files and key files (`<id>.key.json`) of the cases in the workspace. A key file is next to its case file, or, for held-out cases while reviewers run, in the keys folder outside the repository that the operator names (the folder that `score.mjs pairs --keys <dir>` read). `pairs.json` already holds their known defects. Open them only to check a detail.
- `<ws>/<case>/snapshot/`: the reviewed tree. Next to it: `plan.md`, the diff files, and `previous-review.md` for delta cases.

Do not open `findings.json`, `report.md`, `results.md`, or the arm folders of a case (the folders that hold `run-<k>` folders). They name the reviewer setups, and a judge that knows the setup can favor one. Do not guess the setup from the style or the length of a finding.

Read files only. Do not run commands, use the network, or write any file other than your output file: `<ws>/judgments.json`, or `<ws>/judgments-second.json` as the second judge.

## Match pass

For each case, read its known defects first. Then do these steps for each pair in each run:

1. Read the finding (`severity`, `category`, `locator`, `text`) and the known defect (`title`, `locator`, and the other fields).
2. Answer `match` when the finding describes the same underlying defect: the same cause and the same effect. Other words, another line of the same code, or another fix still match. A finding that names a defect class matches each known defect that is an instance of that class.
3. Answer `no` when the finding describes another defect, or names the same place with another cause.
4. Answer `unknown` when the texts and the snapshot do not decide the question.
5. Give one sentence of reasons.

One finding can match several known defects. Several findings can match one known defect. Judge each pair on its own.

## Adjudication pass

Then rate each finding of each run that got no `match` answer. Read the snapshot at its locator and trace the claim through the code or the plan.

- `valid`: the defect is real in the reviewed tree. The severity of the finding does not change the rating.
- `wrong`: the claim is false in this code, the plan records the behavior as intended, or the finding describes no defect.
- `unknown`: the snapshot does not show whether the claim is true. Say what is missing.

Give one sentence of reasons that names the file or plan section that you read.

## Output

Write `<ws>/judgments.json` in this shape:

```json
{
  "matches": [{ "finding": "F-0123456789", "known": "D1", "verdict": "match", "reason": "..." }],
  "adjudications": [{ "finding": "F-9876543210", "rating": "valid", "reason": "..." }]
}
```

- Give one `matches` entry for each candidate pair in `pairs.json`. You may add an entry for another pair of a finding and a known defect of the same case when they match.
- Give one `adjudications` entry for each finding without a `match` answer.
- `verdict` is `match`, `no`, or `unknown`. `rating` is `valid`, `wrong`, or `unknown`.
- Copy finding ids and known-defect ids exactly. The scoring script refuses an unknown id, two different answers for one pair or one finding, a candidate pair without a `matches` entry, and a finding with neither a `match` answer nor an `adjudications` entry.

## Second judge

A second judge from another model family than the first judge checks a random sample of about 10% of the answers in `judgments.json`. The operator gives it the sampled pairs (a finding and a known defect) and the sampled findings, without the first judge's answers.

- Do not open `judgments.json`.
- Judge each sampled pair as the match pass tells, and each sampled finding as the adjudication pass tells.
- Write `<ws>/judgments-second.json` in the shape above, with one entry for each sampled pair and finding and no other entry.

`score.mjs report` compares each answer of `judgments-second.json` with the same answer of `judgments.json` and gives the agreement rate. It refuses an answer for a pair or a finding that `judgments.json` does not answer.
