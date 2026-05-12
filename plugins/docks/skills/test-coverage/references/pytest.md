# pytest Conventions

Per-framework expansion of the parent SKILL.md. Load when the project's test runner is pytest. Pairs with the universal 6-step procedure and `<constraint>` rules in `../SKILL.md`.

## Detection

| Signal | Confirms pytest |
|---|---|
| `[tool.pytest.ini_options]` in `pyproject.toml` | Yes |
| `pytest.ini` / `setup.cfg [tool:pytest]` | Yes |
| `conftest.py` files anywhere in repo | Yes (shared fixtures live here) |
| `tests/` directory next to source | Strong signal |
| Imports of `pytest` in `test_*.py` files | Confirmed |

## File Naming + Discovery

pytest discovers by glob: `test_*.py` and `*_test.py` (configurable via `python_files`). Test functions must start with `test_`. Test classes must start with `Test` and have no `__init__`.

Project structure conventions:

```
src/myapp/users.py
tests/test_users.py            # mirroring tree (most common)
tests/conftest.py              # shared fixtures
tests/integration/test_api.py  # split by tier (often)
```

`conftest.py` fixtures are visible to every test file in the same directory and below — no import needed.

## Assertion Idioms

pytest uses plain `assert` statements (rewritten for nice diffs):

```python
def test_parse_duration_returns_ms():
    assert parse_duration("1h30m") == 5_400_000

def test_parse_duration_raises_on_invalid():
    with pytest.raises(ValueError, match=r"invalid"):
        parse_duration("furlongs")

@pytest.mark.parametrize("inp,expected", [
    ("1h", 3_600_000),
    ("30m", 1_800_000),
    ("500ms", 500),
])
def test_parse_duration_table(inp, expected):
    assert parse_duration(inp) == expected
```

`pytest.approx` for floats; `pytest.raises` for exceptions; `pytest.warns` for warnings.

## Fixtures

```python
import pytest

@pytest.fixture
def db():                              # function-scoped (default)
    conn = create_test_db()
    yield conn
    conn.close()                       # teardown after yield

@pytest.fixture(scope="session")
def app_config():                      # session-scoped — once per test run
    return load_config("test.yaml")

@pytest.fixture
def user(db):                          # fixtures can depend on fixtures
    return db.insert("users", {"name": "Alice"})

def test_login(user, db):              # request fixtures as args
    assert db.find("users", user.id).name == "Alice"
```

Fixture scopes: `function` (default), `class`, `module`, `package`, `session`. Pick the narrowest that works — broader scopes leak state.

## Mocking

```python
# unittest.mock.patch (stdlib, most common)
from unittest.mock import patch, MagicMock

@patch("myapp.users.requests.get")
def test_fetch_user_calls_api(mock_get):
    mock_get.return_value.json.return_value = {"id": 1}
    result = fetch_user(1)
    mock_get.assert_called_with("https://api.example.com/users/1")
    assert result["id"] == 1

# pytest's monkeypatch (fixture, scoped to test)
def test_env_var(monkeypatch):
    monkeypatch.setenv("API_KEY", "test-key")
    assert read_api_key() == "test-key"

# pytest-mock (third-party, wraps unittest.mock)
def test_with_mocker(mocker):
    mock_get = mocker.patch("myapp.users.requests.get")
    mock_get.return_value.json.return_value = {"id": 1}
```

Patch *where the name is looked up*, not where it's defined: if `myapp/users.py` does `import requests`, patch `myapp.users.requests`, not `requests`.

## Async Tests

```python
# pytest-asyncio (most common)
import pytest

@pytest.mark.asyncio
async def test_async_fetch():
    result = await fetch_user_async(1)
    assert result.id == 1
```

Set `asyncio_mode = "auto"` in `pyproject.toml [tool.pytest.ini_options]` to auto-detect async tests without the marker.

## Coverage

```bash
# pytest-cov (most common)
pytest --cov=src --cov-report=term-missing --cov-report=html
pytest --cov=src --cov-fail-under=80      # fail CI under threshold

# Config in pyproject.toml
# [tool.coverage.run]
# source = ["src"]
# omit = ["src/myapp/migrations/*"]
# [tool.coverage.report]
# fail_under = 80
# show_missing = true
```

Use `# pragma: no cover` sparingly (and follow `lint-no-suppressions` discipline — never silence coverage just to make CI green).

## Common Gotchas

- **`async def` test with no marker → silently skipped** by pytest-asyncio in non-auto mode. Add the marker or enable auto mode.
- **Patch target is import location, not definition.** Patching `requests.get` doesn't affect `from requests import get` in another module — patch `that_module.get`.
- **Fixture in same file overrides one in conftest.py.** Surprising precedence; rename if you want both available.
- **`scope="session"` fixtures with database state** leak across tests. Use transactions + rollback or `scope="function"` for DB.
- **Mutable default arg in fixture factory** — same trap as in any Python function; use a factory fixture instead.

## See Also

- `../SKILL.md` — universal 6-step procedure + constraints
- pytest docs: https://docs.pytest.org/
- pytest-asyncio: https://pytest-asyncio.readthedocs.io/
- coverage.py: https://coverage.readthedocs.io/
