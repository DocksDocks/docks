# go test Conventions

Per-framework expansion of the parent SKILL.md. Load when the project's test runner is `go test`. Pairs with the universal 6-step procedure and `<constraint>` rules in `../SKILL.md`.

## Detection

| Signal | Confirms go test |
|---|---|
| `go.mod` present | Yes |
| `*_test.go` files alongside source | Yes |
| Imports of `testing` package | Confirmed |

## File Naming + Layout

Tests live in `*_test.go` files in the same package they test:

```
users/
├── users.go          # package users
├── users_test.go     # package users (white-box: access to unexported)
└── users_ext_test.go # package users_test (black-box: only public API)
```

`package users` in `_test.go` → white-box (can access lowercase identifiers).
`package users_test` in `_test.go` → black-box (treats the package as external).

## Assertion Idioms

Go's stdlib has no assertion library — use `t.Errorf` / `t.Fatalf`:

```go
package users

import "testing"

func TestParseDuration_HoursAndMinutes(t *testing.T) {
    got, err := ParseDuration("1h30m")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if want := 5_400_000; got != want {
        t.Errorf("got %d, want %d", got, want)
    }
}
```

`t.Errorf` records failure and continues; `t.Fatalf` records and stops. Use `Fatal` when subsequent assertions would be misleading (e.g., after `err != nil`).

`testify/assert` is widely used third-party:

```go
import "github.com/stretchr/testify/assert"

func TestParseDuration_Testify(t *testing.T) {
    got, err := ParseDuration("1h30m")
    assert.NoError(t, err)
    assert.Equal(t, 5_400_000, got)
}
```

`testify/require` is the fatal-on-failure variant.

## Table-Driven Tests + Subtests

The idiomatic Go pattern:

```go
func TestParseDuration(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    int64
        wantErr bool
    }{
        {"hour", "1h", 3_600_000, false},
        {"minutes", "30m", 1_800_000, false},
        {"compound", "1h30m", 5_400_000, false},
        {"invalid", "furlongs", 0, true},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            got, err := ParseDuration(tc.input)
            if (err != nil) != tc.wantErr {
                t.Fatalf("err = %v, wantErr = %v", err, tc.wantErr)
            }
            if got != tc.want {
                t.Errorf("got = %d, want = %d", got, tc.want)
            }
        })
    }
}
```

`t.Run` creates a subtest visible in the output and individually runnable via `go test -run TestParseDuration/compound`.

## Helpers + Cleanup

```go
func setupDB(t *testing.T) *sql.DB {
    t.Helper()                          // omits this fn from failure stack
    db, err := sql.Open("sqlite", ":memory:")
    if err != nil { t.Fatal(err) }
    t.Cleanup(func() { db.Close() })    // runs after the test (even on failure)
    return db
}

func TestStoreUser(t *testing.T) {
    db := setupDB(t)
    // ... db is closed automatically via Cleanup
}
```

`t.Cleanup` replaces `defer` for test resources — runs after the test (including subtests) regardless of pass/fail.

## Mocking

Go has no runtime monkey-patching — use interfaces:

```go
type UserRepo interface {
    Find(id int64) (*User, error)
}

type UserService struct { repo UserRepo }

// In tests:
type stubRepo struct{}
func (stubRepo) Find(id int64) (*User, error) {
    return &User{ID: id, Name: "Alice"}, nil
}

func TestGetName(t *testing.T) {
    svc := UserService{repo: stubRepo{}}
    name, _ := svc.GetName(1)
    if name != "Alice" { t.Errorf("got %s", name) }
}
```

For HTTP, use `httptest`:

```go
import "net/http/httptest"

func TestFetchUser(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte(`{"id":1,"name":"Alice"}`))
    }))
    defer srv.Close()

    client := &APIClient{BaseURL: srv.URL}
    user, _ := client.FetchUser(1)
    if user.Name != "Alice" { t.Errorf("got %s", user.Name) }
}
```

For complex mocks, use `go.uber.org/mock` (`mockgen`) or `gomock`.

## Running

```bash
go test ./...                           # All packages, recursive
go test ./users/...                     # Single package + subpackages
go test -run TestParseDuration          # Filter by name
go test -run TestParseDuration/compound # Subtest
go test -v                              # Verbose (per-test output)
go test -race                           # Race detector (CRITICAL for concurrent code)
go test -count=1                        # Disable cache (force re-run)
go test -timeout 30s                    # Per-package timeout
```

`-race` should be on in CI for any code that uses goroutines.

## Coverage

```bash
go test -cover ./...                              # Summary
go test -coverprofile=cov.out ./...               # Generate profile
go tool cover -html=cov.out                       # Open HTML report in browser
go tool cover -func=cov.out                       # Per-function summary
```

For coverage gates in CI, parse `go tool cover -func=cov.out | tail -1` and compare against a threshold.

## Common Gotchas

- **Same-name test function in different packages confuses `-run`.** Use package-qualified names: `go test -run '^TestFoo$' ./pkg/...`.
- **Loop-variable capture in subtests** before Go 1.22:
  ```go
  for _, tc := range tests {
      tc := tc                  // REQUIRED in Go <1.22 — capture by value
      t.Run(tc.name, ...)
  }
  ```
  Go 1.22+ fixes the loop-variable scope automatically.
- **`go test` caches passing tests** — change a file or use `-count=1` to force re-run.
- **`init()` runs once per test binary.** Each package has one test binary; shared state across packages still requires a fixture.
- **`*_test.go` files don't ship in releases** (excluded from `go build`).

## See Also

- `../SKILL.md` — universal 6-step procedure + constraints
- Go testing docs: https://pkg.go.dev/testing
- testify: https://github.com/stretchr/testify
- gomock (`go.uber.org/mock`): https://github.com/uber-go/mock
