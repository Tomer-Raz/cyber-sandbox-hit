from types import SimpleNamespace

import pytest

from app.services import scanner_job_service


class _FakeExecution:
    def __init__(self, succeeded=0, cancelled=0, failed=0, running=0, start_time=None, completion_time=None):
        self.succeeded_count = succeeded
        self.cancelled_count = cancelled
        self.failed_count = failed
        self.running_count = running
        self.start_time = start_time
        self.completion_time = completion_time

    def __contains__(self, key):
        return getattr(self, key, None) is not None


@pytest.mark.asyncio
async def test_start_execution_returns_execution_name(monkeypatch):
    operation = SimpleNamespace(metadata=SimpleNamespace(name="projects/p/locations/l/jobs/j/executions/e1"))

    class _FakeJobsClient:
        async def run_job(self, request):
            return operation

    monkeypatch.setattr(scanner_job_service, "_get_jobs_client", lambda: _FakeJobsClient())

    name = await scanner_job_service.start_execution("scan-1", "https://target.example", "baseline")

    assert name == "projects/p/locations/l/jobs/j/executions/e1"


@pytest.mark.asyncio
async def test_start_execution_wraps_client_failure(monkeypatch):
    class _FailingJobsClient:
        async def run_job(self, request):
            raise RuntimeError("Cloud Run unavailable")

    monkeypatch.setattr(scanner_job_service, "_get_jobs_client", lambda: _FailingJobsClient())

    with pytest.raises(scanner_job_service.ScannerJobError):
        await scanner_job_service.start_execution("scan-1", "https://target.example", "baseline")


@pytest.mark.asyncio
async def test_start_execution_raises_when_no_execution_name_returned(monkeypatch):
    operation = SimpleNamespace(metadata=SimpleNamespace(name=None))

    class _FakeJobsClient:
        async def run_job(self, request):
            return operation

    monkeypatch.setattr(scanner_job_service, "_get_jobs_client", lambda: _FakeJobsClient())

    with pytest.raises(scanner_job_service.ScannerJobError):
        await scanner_job_service.start_execution("scan-1", "https://target.example", "baseline")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "execution,expected_status",
    [
        (_FakeExecution(succeeded=1, completion_time="t"), "completed"),
        (_FakeExecution(cancelled=1), "cancelled"),
        (_FakeExecution(failed=1), "failed"),
        (_FakeExecution(running=1, start_time="t"), "running"),
        (_FakeExecution(), "pending"),
    ],
)
async def test_get_execution_status_maps_counts_to_status(monkeypatch, execution, expected_status):
    class _FakeExecutionsClient:
        async def get_execution(self, request):
            return execution

    monkeypatch.setattr(scanner_job_service, "_get_executions_client", lambda: _FakeExecutionsClient())

    result = await scanner_job_service.get_execution_status("projects/p/.../executions/e1")

    assert result["status"] == expected_status


@pytest.mark.asyncio
async def test_get_execution_status_wraps_client_failure(monkeypatch):
    class _FailingExecutionsClient:
        async def get_execution(self, request):
            raise RuntimeError("not found")

    monkeypatch.setattr(scanner_job_service, "_get_executions_client", lambda: _FailingExecutionsClient())

    with pytest.raises(scanner_job_service.ScannerJobError):
        await scanner_job_service.get_execution_status("projects/p/.../executions/e1")


@pytest.mark.asyncio
async def test_cancel_execution_succeeds(monkeypatch):
    calls = []

    class _FakeExecutionsClient:
        async def cancel_execution(self, request):
            calls.append(request)

    monkeypatch.setattr(scanner_job_service, "_get_executions_client", lambda: _FakeExecutionsClient())

    await scanner_job_service.cancel_execution("projects/p/.../executions/e1")

    assert len(calls) == 1


@pytest.mark.asyncio
async def test_cancel_execution_wraps_client_failure(monkeypatch):
    class _FailingExecutionsClient:
        async def cancel_execution(self, request):
            raise RuntimeError("already finished")

    monkeypatch.setattr(scanner_job_service, "_get_executions_client", lambda: _FailingExecutionsClient())

    with pytest.raises(scanner_job_service.ScannerJobError):
        await scanner_job_service.cancel_execution("projects/p/.../executions/e1")
