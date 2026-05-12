# cargo test Conventions

Per-framework expansion of the parent SKILL.md. Load when the project's test runner is `cargo test`. Pairs with the universal 6-step procedure and `<constraint>` rules in `../SKILL.md`.

## Detection

| Signal | Confirms cargo test |
|---|---|
| `Cargo.toml` present | Yes |
| `[dev-dependencies]` section | Strong signal |
| `tests/` directory at crate root | Integration tests |
| `#[cfg(test)] mod tests { ... }` in source files | Unit tests inline |

## File Layout — Unit vs Integration

```
my_crate/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # public API
│   └── parser.rs              # contains `#[cfg(test)] mod tests` for unit tests
└── tests/
    └── integration_test.rs    # integration tests (linked as separate binary)
```

Unit tests live INSIDE the source file they test — access to private items. Integration tests live in `tests/` and treat the crate as an external user would.

## Assertion Idioms

```rust
// src/parser.rs
pub fn parse_duration(s: &str) -> Result<u64, ParseError> {
    // ...
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hours_and_minutes() {
        assert_eq!(parse_duration("1h30m"), Ok(5_400_000));
    }

    #[test]
    fn rejects_invalid_input() {
        let err = parse_duration("furlongs").unwrap_err();
        assert!(matches!(err, ParseError::Invalid));
    }

    #[test]
    #[should_panic(expected = "out of range")]
    fn panics_on_overflow() {
        parse_duration(&"9".repeat(100)).unwrap();
    }

    #[test]
    fn returns_result() -> Result<(), Box<dyn std::error::Error>> {
        let parsed = parse_duration("1h")?;
        assert_eq!(parsed, 3_600_000);
        Ok(())
    }
}
```

Macros: `assert!`, `assert_eq!`, `assert_ne!`. For pattern matching, use `assert!(matches!(...))`. The `#[should_panic]` form is for asserting panics.

## Async Tests

`#[test]` runs sync — async tests need a runtime attribute:

```rust
// Tokio (most common)
#[tokio::test]
async fn fetches_user() {
    let user = fetch_user(1).await.unwrap();
    assert_eq!(user.id, 1);
}

// async-std
#[async_std::test]
async fn fetches_user() { /* ... */ }
```

Add the runtime to `[dev-dependencies]`: `tokio = { version = "1", features = ["macros", "rt"] }`.

## Mocking

Rust lacks runtime monkey-patching. Common approaches:

```rust
// 1. Trait-object dependency injection (most idiomatic)
trait UserRepo {
    fn find(&self, id: u64) -> Option<User>;
}

struct UserService<R: UserRepo> { repo: R }

impl<R: UserRepo> UserService<R> {
    fn get_name(&self, id: u64) -> Option<String> {
        self.repo.find(id).map(|u| u.name)
    }
}

// In tests:
struct StubRepo;
impl UserRepo for StubRepo {
    fn find(&self, _id: u64) -> Option<User> {
        Some(User { id: 1, name: "Alice".into() })
    }
}

#[test]
fn returns_name() {
    let svc = UserService { repo: StubRepo };
    assert_eq!(svc.get_name(1), Some("Alice".into()));
}
```

```rust
// 2. mockall crate — derive mock implementations
use mockall::automock;

#[automock]
trait UserRepo {
    fn find(&self, id: u64) -> Option<User>;
}

#[test]
fn returns_name_with_mock() {
    let mut mock = MockUserRepo::new();
    mock.expect_find().returning(|_| Some(User { id: 1, name: "Alice".into() }));
    let svc = UserService { repo: mock };
    assert_eq!(svc.get_name(1), Some("Alice".into()));
}
```

For HTTP, use `wiremock` or `mockito` to stand up a local server instead of mocking the client.

## Running

```bash
cargo test                              # All tests + doctests
cargo test --lib                        # Unit tests only
cargo test --tests                      # Integration tests only
cargo test --doc                        # Doctests only
cargo test parser::tests::parses_hours  # Single test by path
cargo test -- --nocapture               # Show println! output
cargo test -- --test-threads=1          # Disable parallel (when tests share state)
```

## Coverage

```bash
# cargo-llvm-cov (recommended; uses LLVM's source-based coverage)
cargo install cargo-llvm-cov
cargo llvm-cov --html                   # HTML report in target/llvm-cov/html/
cargo llvm-cov --lcov --output-path lcov.info

# cargo-tarpaulin (Linux/x86_64 only)
cargo install cargo-tarpaulin
cargo tarpaulin --out Html
```

## Common Gotchas

- **Tests run in parallel by default.** Shared state (env vars, files, network ports) needs `--test-threads=1` or per-test isolation.
- **`#[cfg(test)]` excludes from non-test builds.** A helper imported only in tests must also be `#[cfg(test)]` or it'll be flagged as unused in `cargo build`.
- **Integration tests can't access private items.** That's by design — integration tests use only the public API.
- **Doctests run too.** A code block in a doc comment that compiles AND runs (the default) — use `ignore` or `no_run` for examples that shouldn't execute.
- **Async tests without a runtime macro silently never run their body.** Always use `#[tokio::test]` or equivalent.

## See Also

- `../SKILL.md` — universal 6-step procedure + constraints
- The Rust Book — Testing: https://doc.rust-lang.org/book/ch11-00-testing.html
- `mockall` docs: https://docs.rs/mockall/
- `cargo-llvm-cov`: https://github.com/taiki-e/cargo-llvm-cov
