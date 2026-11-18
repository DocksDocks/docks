# Escape draw

## Frozen

- Cutoff (exclusive): 2026-11-18T03:58:00.000Z
- Script commit: 841e5a0752721613e45b496708e079b5687f6309
- Draw script commit: 67d54713d039cd72f52ee41b31b1c94e3ea64f1a
- Seed (JSON): "146-2026-11-18-2"
- Source snapshot SHA-256: 9f8de17b39e9cf2d103e564cb552b80462a438c72ae356690316465d94bbb22b
- Restricted frozen record SHA-256: d8f8186c776d5292eb6b3c3a6192a366fb8bdac888cf4f0d50b9bb056609ad1c

| Split | Kind | Units |
|---|---|---:|
| dev | code | 8 |
| dev | code-delta | 4 |
| dev | plan | 6 |
| dev | plan-delta | 2 |
| heldout | code | 13 |
| heldout | code-delta | 8 |
| heldout | plan | 8 |
| heldout | plan-delta | 4 |

### Dev units

A commitment is the SHA-256 of the canonical JSON of the unit in the restricted record.

| Issue | Reviewer | Missed round | Kind | Commitment |
|---:|---|---:|---|---|
| #22 | code | 2 | code | d5b531625ee5667b648c6b4d35b657d0cedede05696cef3d31abd4e7758cd456 |
| #89 | plan | 1 | plan | a505a045b18b8b708138e9c506cccae9e1ea6923d7cdcf830b6b351d13fe1418 |
| #98 | code | 3 | code-delta | 8e3fec81e4cb656d55dbe51a6cb4d66ea3c8b396d1d3bfaa99a24acbd7cbcde8 |
| #98 | code | 5 | code-delta | 39ce305d05e72d1c9ec8cd4058a32e0ca0951934f29e3cb35b025f03f6b3ea5c |
| #98 | plan | 1 | plan | 7b3894520c1e8b340c6e22aae17e6c1e924c454603f19fef4e3367aadbb874b1 |
| #98 | plan | 3 | plan | 8dda0ae286cfac8738774aa1d6d8a470f1b17732321920325c1d9a52c7215265 |
| #98 | plan | 5 | plan | 75615ccb27212b18ccac03a9fbc52d007a1556ab7e058f51e7f03b3b47d3f03a |
| #100 | plan | 4 | plan-delta | 9de205126d57c3f03539f1f6379c8ec7e4820a6f2abc7b5e16625b6e3434a0e9 |
| #102 | code | 1 | code | 5c410c9d4d74cbe4588f1031f3607e96e3fce45d2dae1a49477baf50526734e7 |
| #102 | code | 2 | code | 3446494ed90a6d73206f68415062a98620d491979bd7adbf1284f9ef40279c4f |
| #103 | plan | 1 | plan | 438dd1a460999d8414ce603d95937fd1dda34eb06677079fdb9e184ddcc9fc2d |
| #109 | code | 1 | code | 3277a6e0cba8eac17e7bd7470fef3fed601ee7ac155ea3d0b43360be7c8a1c35 |
| #109 | plan | 1 | plan | 9b70d9b36c3c466a179ead2d78aeb995ff9a1f52b6d5a08e87538b6632c0b0b8 |
| #111 | code | 1 | code | 909e61c076d3e268243d358485e76ac3023117fb5d506f9315a832bce69c64ea |
| #119 | code | 1 | code | 3f89e162b844680c8b78d9f6eead1a9f4c056483acb9daa16aa1258e46360b77 |
| #123 | code | 1 | code | 05b585b06ef52c8de31f09d442f5d9bfe675011718da353597f6869a45f20c65 |
| #123 | code | 2 | code-delta | 3ebc56ccbd5f0a8745b3bf50568fefdcbbaca8d23297aa6411ffb87efd5122b5 |
| #123 | code | 4 | code-delta | a450b3ef720e0034e7a9a386a685e5efa7f41ecafcad337d6f2086d9d979a48c |
| #123 | plan | 3 | plan-delta | 397a1610f884f1c7d0e2d362ddacb91a88f1a0d5990e1b7b8b2d3067324faf33 |
| #129 | code | 1 | code | 7e0ffbae593e1758c378258ae62ecffe57a00c864854f5c22cc2ae6f60be4fd1 |

## Outcomes

Reasons: (a) the finding is on lines that the missed round did not see; (b) no later round confirms the fix; (c) the base, head, or plan body of the round cannot be rebuilt; (d) a case for the round existed before the cutoff; (e) a follow-up item that is no defect of this plan.

| Split | Units | Taken | Rejected (a) | Rejected (b) | Rejected (c) | Rejected (d) | Rejected (e) | Pending |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| dev | 20 | 5 | 5 | 0 | 0 | 9 | 1 | 0 |
| heldout | 33 | 15 | 14 | 0 | 0 | 4 | 0 | 0 |

### Dev outcomes

| Issue | Reviewer | Missed round | Kind | Commitment | Outcome | Case or reason |
|---:|---|---:|---|---|---|---|
| #22 | code | 2 | code | d5b531625ee5667b648c6b4d35b657d0cedede05696cef3d31abd4e7758cd456 | rejected | (e) |
| #89 | plan | 1 | plan | a505a045b18b8b708138e9c506cccae9e1ea6923d7cdcf830b6b351d13fe1418 | rejected | (d) |
| #98 | code | 3 | code-delta | 8e3fec81e4cb656d55dbe51a6cb4d66ea3c8b396d1d3bfaa99a24acbd7cbcde8 | taken | code-98-r3-e146 |
| #98 | code | 5 | code-delta | 39ce305d05e72d1c9ec8cd4058a32e0ca0951934f29e3cb35b025f03f6b3ea5c | taken | code-98-r5-e146 |
| #98 | plan | 1 | plan | 7b3894520c1e8b340c6e22aae17e6c1e924c454603f19fef4e3367aadbb874b1 | rejected | (d) |
| #98 | plan | 3 | plan | 8dda0ae286cfac8738774aa1d6d8a470f1b17732321920325c1d9a52c7215265 | taken | plan-98-r3-e146 |
| #98 | plan | 5 | plan | 75615ccb27212b18ccac03a9fbc52d007a1556ab7e058f51e7f03b3b47d3f03a | rejected | (a) |
| #100 | plan | 4 | plan-delta | 9de205126d57c3f03539f1f6379c8ec7e4820a6f2abc7b5e16625b6e3434a0e9 | rejected | (a) |
| #102 | code | 1 | code | 5c410c9d4d74cbe4588f1031f3607e96e3fce45d2dae1a49477baf50526734e7 | rejected | (d) |
| #102 | code | 2 | code | 3446494ed90a6d73206f68415062a98620d491979bd7adbf1284f9ef40279c4f | rejected | (a) |
| #103 | plan | 1 | plan | 438dd1a460999d8414ce603d95937fd1dda34eb06677079fdb9e184ddcc9fc2d | rejected | (d) |
| #109 | code | 1 | code | 3277a6e0cba8eac17e7bd7470fef3fed601ee7ac155ea3d0b43360be7c8a1c35 | taken | code-109-r1-e146 |
| #109 | plan | 1 | plan | 9b70d9b36c3c466a179ead2d78aeb995ff9a1f52b6d5a08e87538b6632c0b0b8 | rejected | (d) |
| #111 | code | 1 | code | 909e61c076d3e268243d358485e76ac3023117fb5d506f9315a832bce69c64ea | rejected | (d) |
| #119 | code | 1 | code | 3f89e162b844680c8b78d9f6eead1a9f4c056483acb9daa16aa1258e46360b77 | rejected | (d) |
| #123 | code | 1 | code | 05b585b06ef52c8de31f09d442f5d9bfe675011718da353597f6869a45f20c65 | rejected | (d) |
| #123 | code | 2 | code-delta | 3ebc56ccbd5f0a8745b3bf50568fefdcbbaca8d23297aa6411ffb87efd5122b5 | rejected | (a) |
| #123 | code | 4 | code-delta | a450b3ef720e0034e7a9a386a685e5efa7f41ecafcad337d6f2086d9d979a48c | taken | code-123-r4-e146 |
| #123 | plan | 3 | plan-delta | 397a1610f884f1c7d0e2d362ddacb91a88f1a0d5990e1b7b8b2d3067324faf33 | rejected | (a) |
| #129 | code | 1 | code | 7e0ffbae593e1758c378258ae62ecffe57a00c864854f5c22cc2ae6f60be4fd1 | rejected | (d) |
