"""Resolves who holds the application's admin role, from GCP IAM.

No email address is configured in this codebase. Administrators are the
principals bound to a marker IAM role on the project (`admin_iam_role_id`,
`appAdmin` by default) — a custom role that deliberately carries no GCP
permissions of its own. Granting or revoking admin is therefore an ordinary
IAM change in the console or `gcloud`, with the usual audit trail, and needs
no redeploy.
"""

import asyncio
import logging
import time

from google.cloud import resourcemanager_v3
from google.iam.v1 import iam_policy_pb2, options_pb2

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Only real humans can be app admins: `serviceAccount:` and `group:` members
# are ignored, as is `deleted:user:...`, which keeps its own prefix.
_USER_PREFIX = "user:"

_CACHE_TTL_SECONDS = 300
# Backoff after a failed refresh, so a sustained IAM outage doesn't turn into
# one API call per request.
_ERROR_RETRY_SECONDS = 30

_client: resourcemanager_v3.ProjectsAsyncClient | None = None
_lock = asyncio.Lock()
_cache: tuple[float, frozenset[str]] | None = None


def _get_client() -> resourcemanager_v3.ProjectsAsyncClient:
    global _client
    if _client is None:
        _client = resourcemanager_v3.ProjectsAsyncClient()
    return _client


async def _fetch() -> frozenset[str]:
    settings = get_settings()
    project = settings.gcp_project_id
    admin_role = f"projects/{project}/roles/{settings.admin_iam_role_id}"

    policy = await _get_client().get_iam_policy(
        request=iam_policy_pb2.GetIamPolicyRequest(
            resource=f"projects/{project}",
            # v3 or conditional bindings come back stripped, which would let a
            # condition-guarded grant read as unconditional.
            options=options_pb2.GetPolicyOptions(requested_policy_version=3),
        )
    )

    emails = set()
    for binding in policy.bindings:
        if binding.role != admin_role:
            continue
        if binding.HasField("condition"):
            # CEL conditions can't be evaluated here (they may depend on request
            # attributes we don't have), so a conditional grant is not honoured
            # rather than being silently treated as permanent.
            logger.warning("Ignoring conditional binding on %s", admin_role)
            continue
        emails.update(
            member.removeprefix(_USER_PREFIX).casefold()
            for member in binding.members
            if member.startswith(_USER_PREFIX)
        )
    return frozenset(emails)


async def admin_emails() -> frozenset[str]:
    """Cached set of casefolded admin email addresses.

    Cached because this is consulted on every authenticated request, not just
    at login, so an IAM change takes up to `_CACHE_TTL_SECONDS` to take effect.

    If a refresh fails but an earlier one succeeded, the last known good set is
    reused: the alternative is demoting a working admin because of a transient
    API error. Before any successful fetch it returns empty — unknown means
    nobody is an admin, never everybody.
    """
    global _cache
    async with _lock:
        now = time.monotonic()
        if _cache is not None and now < _cache[0]:
            return _cache[1]

        try:
            emails = await _fetch()
        except Exception:  # noqa: BLE001 - any failure here must not 500 the request
            known = _cache[1] if _cache else frozenset()
            logger.warning("Could not refresh admin IAM bindings", exc_info=True)
            _cache = (now + _ERROR_RETRY_SECONDS, known)
            return known

        _cache = (now + _CACHE_TTL_SECONDS, emails)
        return emails


def reset_cache() -> None:
    global _cache
    _cache = None
