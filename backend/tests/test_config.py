"""`_export_google_credentials` — the bridge from `.env` to google-auth.

pydantic-settings parses `.env` into the settings models and stops there; ADC
reads `os.environ` and nothing else. These cover the gap between the two, which
is invisible at the call site: get it wrong and the app authenticates as the
wrong identity, or hangs on a connection it was never going to make.
"""

import os

import pytest

from app.core.config import _export_google_credentials

_ENV_VAR = "GOOGLE_APPLICATION_CREDENTIALS"


@pytest.fixture(autouse=True)
def _restore_env():
    """The function under test writes to the real environment, and monkeypatch
    records nothing for a variable that was never set — so it is restored here
    rather than leaking into whatever runs next.
    """
    original = os.environ.get(_ENV_VAR)
    os.environ.pop(_ENV_VAR, None)
    yield
    os.environ.pop(_ENV_VAR, None)
    if original is not None:
        os.environ[_ENV_VAR] = original


@pytest.fixture
def key_file(tmp_path):
    path = tmp_path / "sa-key.json"
    path.write_text("{}")
    return path


def test_a_configured_path_reaches_the_environment(key_file):
    """The whole point: a `.env` line google-auth would otherwise never see."""
    _export_google_credentials(str(key_file))

    assert os.environ[_ENV_VAR] == str(key_file.resolve())


def test_relative_paths_are_resolved(monkeypatch, key_file):
    """Stored absolute so the value survives a later change of directory —
    google-auth opens the file lazily, long after this runs.
    """
    monkeypatch.chdir(key_file.parent)

    _export_google_credentials(key_file.name)

    assert os.environ[_ENV_VAR] == str(key_file.resolve())


def test_an_existing_environment_value_wins(key_file):
    """Cloud Run's ambient identity and an explicit shell export both outrank a
    file named in `.env` — otherwise deploying with a stale `.env` in the image
    would silently swap the service's identity.
    """
    os.environ[_ENV_VAR] = "/ambient/credentials.json"

    _export_google_credentials(str(key_file))

    assert os.environ[_ENV_VAR] == "/ambient/credentials.json"


def test_unset_leaves_the_environment_alone():
    """The default. Nothing is invented for a deployment that never opted in."""
    _export_google_credentials("")

    assert _ENV_VAR not in os.environ


def test_a_missing_key_file_fails_loudly(tmp_path):
    """ADC treats an unreadable file as "try the next source", so without this
    the symptom is a connection timeout half a minute into the first request,
    naming neither the setting nor the path.
    """
    missing = tmp_path / "not-here.json"

    with pytest.raises(FileNotFoundError, match="not-here.json"):
        _export_google_credentials(str(missing))

    assert _ENV_VAR not in os.environ
