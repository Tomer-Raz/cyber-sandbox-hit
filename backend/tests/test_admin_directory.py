import pytest
from google.iam.v1 import policy_pb2

from app.services import admin_directory

ADMIN_ROLE = "projects/test-project/roles/appAdmin"


@pytest.fixture(autouse=True)
def _clear_cache():
    admin_directory.reset_cache()
    yield
    admin_directory.reset_cache()


def _policy(*bindings) -> policy_pb2.Policy:
    return policy_pb2.Policy(bindings=list(bindings))


def _binding(role, members, condition=None) -> policy_pb2.Binding:
    binding = policy_pb2.Binding(role=role, members=members)
    if condition is not None:
        binding.condition.expression = condition
    return binding


def _stub_policy(monkeypatch, policy):
    calls = []

    class FakeClient:
        async def get_iam_policy(self, request):
            calls.append(request)
            return policy

    monkeypatch.setattr(admin_directory, "_get_client", lambda: FakeClient())
    return calls


@pytest.mark.asyncio
async def test_returns_members_of_the_admin_role(monkeypatch):
    _stub_policy(
        monkeypatch,
        _policy(
            _binding(ADMIN_ROLE, ["user:ada@example.com", "user:grace@example.com"]),
            _binding("roles/viewer", ["user:mallory@example.com"]),
        ),
    )
    assert await admin_directory.admin_emails() == frozenset(
        {"ada@example.com", "grace@example.com"}
    )


@pytest.mark.asyncio
async def test_ignores_non_human_and_deleted_principals(monkeypatch):
    """Only `user:` members are people; a service account must never be an admin."""
    _stub_policy(
        monkeypatch,
        _policy(
            _binding(
                ADMIN_ROLE,
                [
                    "user:ada@example.com",
                    "serviceAccount:backend@test-project.iam.gserviceaccount.com",
                    "group:admins@example.com",
                    "deleted:user:gone@example.com?uid=123",
                ],
            )
        ),
    )
    assert await admin_directory.admin_emails() == frozenset({"ada@example.com"})


@pytest.mark.asyncio
async def test_conditional_bindings_are_not_honoured(monkeypatch):
    """A CEL condition can't be evaluated here, so it must not read as a grant."""
    _stub_policy(
        monkeypatch,
        _policy(
            _binding(ADMIN_ROLE, ["user:ada@example.com"], condition="request.time < timestamp('2020-01-01T00:00:00Z')")
        ),
    )
    assert await admin_directory.admin_emails() == frozenset()


@pytest.mark.asyncio
async def test_members_are_casefolded(monkeypatch):
    _stub_policy(monkeypatch, _policy(_binding(ADMIN_ROLE, ["user:Ada@Example.COM"])))
    assert await admin_directory.admin_emails() == frozenset({"ada@example.com"})


@pytest.mark.asyncio
async def test_result_is_cached_across_calls(monkeypatch):
    calls = _stub_policy(monkeypatch, _policy(_binding(ADMIN_ROLE, ["user:ada@example.com"])))

    await admin_directory.admin_emails()
    await admin_directory.admin_emails()

    # This runs on every authenticated request, so it must not be one API call
    # per request.
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_grants_nobody_when_the_policy_cannot_be_read(monkeypatch):
    """Fail closed: an unknown policy means no admins, not every admin."""

    class ExplodingClient:
        async def get_iam_policy(self, request):
            raise RuntimeError("permission denied")

    monkeypatch.setattr(admin_directory, "_get_client", lambda: ExplodingClient())
    assert await admin_directory.admin_emails() == frozenset()


@pytest.mark.asyncio
async def test_a_transient_failure_does_not_demote_a_known_admin(monkeypatch):
    _stub_policy(monkeypatch, _policy(_binding(ADMIN_ROLE, ["user:ada@example.com"])))
    assert await admin_directory.admin_emails() == frozenset({"ada@example.com"})

    class ExplodingClient:
        async def get_iam_policy(self, request):
            raise RuntimeError("transient")

    monkeypatch.setattr(admin_directory, "_get_client", lambda: ExplodingClient())
    admin_directory._cache = (0.0, admin_directory._cache[1])  # force a refresh

    assert await admin_directory.admin_emails() == frozenset({"ada@example.com"})


@pytest.mark.asyncio
async def test_requests_policy_version_three(monkeypatch):
    """v1 responses drop conditional bindings, hiding grants we must inspect."""
    calls = _stub_policy(monkeypatch, _policy())
    await admin_directory.admin_emails()
    assert calls[0].options.requested_policy_version == 3
    assert calls[0].resource == "projects/test-project"
