from google.cloud import run_v2

from app.core.config import get_settings

_jobs_client: run_v2.JobsAsyncClient | None = None
_executions_client: run_v2.ExecutionsAsyncClient | None = None


class ScannerJobError(Exception):
    """Raised when the scanner Cloud Run Job can't be started, polled, or cancelled."""


def _get_jobs_client() -> run_v2.JobsAsyncClient:
    global _jobs_client
    if _jobs_client is None:
        _jobs_client = run_v2.JobsAsyncClient()
    return _jobs_client


def _get_executions_client() -> run_v2.ExecutionsAsyncClient:
    global _executions_client
    if _executions_client is None:
        _executions_client = run_v2.ExecutionsAsyncClient()
    return _executions_client


def _job_name() -> str:
    settings = get_settings()
    return (
        f"projects/{settings.gcp_project_id}/locations/{settings.gcp_region}"
        f"/jobs/{settings.scanner_job_name}"
    )


async def start_execution(scan_id: str, target_url: str, scan_policy: str) -> str:
    """Starts a new execution of the scanner job for one scan.

    Does not wait for the execution to finish (it can run up to
    scanner_timeout, ~30 min) — only for Cloud Run to accept and start it.
    Returns the execution's resource name, used to poll status later.
    """
    client = _get_jobs_client()
    overrides = run_v2.RunJobRequest.Overrides(
        container_overrides=[
            run_v2.RunJobRequest.Overrides.ContainerOverride(
                env=[
                    run_v2.EnvVar(name="TARGET_URL", value=target_url),
                    run_v2.EnvVar(name="SCAN_ID", value=scan_id),
                    run_v2.EnvVar(name="SCAN_POLICY", value=scan_policy),
                ]
            )
        ]
    )
    try:
        operation = await client.run_job(
            request=run_v2.RunJobRequest(name=_job_name(), overrides=overrides)
        )
    except Exception as exc:
        raise ScannerJobError(f"Failed to start scanner job execution: {exc}") from exc

    # The Execution resource is populated as in-progress operation metadata
    # immediately — no need to await operation.result(), which would block
    # until the whole scan finishes.
    execution_name = getattr(operation.metadata, "name", None)
    if not execution_name:
        raise ScannerJobError("Cloud Run did not return an execution name")
    return execution_name


async def get_execution_status(execution_name: str) -> dict:
    """Returns {"status", "started_at", "finished_at"} for a running execution."""
    client = _get_executions_client()
    try:
        execution = await client.get_execution(
            request=run_v2.GetExecutionRequest(name=execution_name)
        )
    except Exception as exc:
        raise ScannerJobError(f"Failed to fetch execution status: {exc}") from exc

    started_at = execution.start_time if "start_time" in execution else None
    finished_at = execution.completion_time if "completion_time" in execution else None

    # Task counts, not completion_time, are the source of truth: a job
    # cancelled before its task ever started (still importing the image, as
    # in an early-cancel race) reaches cancelled_count=1 without ever getting
    # a start_time or completion_time.
    if execution.succeeded_count > 0:
        status = "completed"
    elif execution.cancelled_count > 0:
        status = "cancelled"
    elif execution.failed_count > 0:
        status = "failed"
    elif started_at or execution.running_count > 0:
        status = "running"
    else:
        status = "pending"

    return {"status": status, "started_at": started_at, "finished_at": finished_at}


async def cancel_execution(execution_name: str) -> None:
    client = _get_executions_client()
    try:
        await client.cancel_execution(request=run_v2.CancelExecutionRequest(name=execution_name))
    except Exception as exc:
        raise ScannerJobError(f"Failed to cancel execution: {exc}") from exc
