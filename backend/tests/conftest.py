import os

os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("DB_INSTANCE_CONNECTION_NAME", "test-project:europe-west1:test-instance")
os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("JWT_SIGNING_KEY", "test-signing-key")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")


class FakeResult:
    """Stands in for a SQLAlchemy Result — enough of the surface that
    routers/services use (`.scalars().all()`, `.scalar_one_or_none()`,
    `.scalar_one()`, `.first()`) without a real engine.
    """

    def __init__(self, items):
        self._items = list(items)

    def scalars(self):
        return self

    def all(self):
        return self._items

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None

    def scalar_one(self):
        return self._items[0]

    def first(self):
        return self._items[0] if self._items else None


def apply_orm_defaults(obj):
    """Fills in mapped_column `default=` values (id, created_at, ...) that a
    real flush/insert would apply. Bare `Model(...)` construction — what
    every test here does instead of hitting a real DB — leaves those None,
    which trips response-model validation on fields like `created_at`.
    """
    for col in type(obj).__table__.columns:
        if getattr(obj, col.name, None) is None and col.default is not None:
            value = col.default.arg(None) if col.default.is_callable else col.default.arg
            setattr(obj, col.name, value)
    return obj


def make(model_cls, **kwargs):
    """Builds an ORM row for a fixture with realistic defaults applied —
    use this instead of calling the model class directly when a test doesn't
    care about a specific id/created_at value.
    """
    return apply_orm_defaults(model_cls(**kwargs))


class FakeSession:
    """Stands in for an AsyncSession. Tests queue up the Result each
    `execute()` call should return, in call order — the routes under test
    make a known, fixed sequence of queries, read off the source.
    """

    def __init__(self, execute_results=None, scalar_results=None, get_results=None):
        self._results = list(execute_results or [])
        # Queued separately from execute(): `session.scalar()` is used for the
        # standalone COUNT/MIN lookups, so interleaving them in one queue would
        # make each test depend on the order the two kinds happen to be called.
        self._scalars = list(scalar_results or [])
        self._gets = dict(get_results or {})
        self.added = []
        self.deleted = []
        self.committed = False
        self.rolled_back = False

    async def execute(self, *_args, **_kwargs):
        if not self._results:
            raise AssertionError("FakeSession.execute() called more times than results queued")
        return self._results.pop(0)

    async def scalar(self, *_args, **_kwargs):
        if not self._scalars:
            raise AssertionError("FakeSession.scalar() called more times than results queued")
        return self._scalars.pop(0)

    async def get(self, _model, pk):
        return self._gets.get(pk)

    def add(self, obj):
        apply_orm_defaults(obj)
        self.added.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    async def refresh(self, _obj):
        pass

    async def delete(self, obj):
        self.deleted.append(obj)


class FakeDoc:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return self._data


class FakeQuery:
    def __init__(self, docs):
        self._docs = docs

    def where(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    async def stream(self):
        for doc in self._docs:
            yield FakeDoc(doc)


class FakeCollection:
    def __init__(self, docs=None):
        self._docs = docs or []
        self.added = []

    def where(self, *_args, **_kwargs):
        return FakeQuery(self._docs)

    def order_by(self, *_args, **_kwargs):
        return FakeQuery(self._docs)

    def limit(self, *_args, **_kwargs):
        return FakeQuery(self._docs)

    async def add(self, data):
        self.added.append(data)


class FakeFirestoreClient:
    """Single fixed collection regardless of name — fine here since every
    caller in this codebase only ever touches one collection per client.
    """

    def __init__(self, docs=None):
        self.collection_ref = FakeCollection(docs)

    def collection(self, _name):
        return self.collection_ref


async def passthrough_target_url(url):
    """Stand-in for `validate_target_url` in tests that aren't testing the SSRF
    gate. Async because the routers await it.
    """
    return url
