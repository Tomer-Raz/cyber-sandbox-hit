from pydantic import BaseModel, Field


class AnomalyFeature(BaseModel):
    name: str
    value: float
    mean: float
    stdev: float
    z_score: float


class AnomalyOut(BaseModel):
    """Leave-one-out z-score assessment against this scan's target history.

    `evaluated=False` is an honest abstention (not enough completed history
    for this target yet), not a false "not anomalous" — see `reason`.
    """

    evaluated: bool = False
    is_anomaly: bool = False
    score: float = 0.0
    sample_size: int = 0
    reason: str = ""
    features: list[AnomalyFeature] = Field(default_factory=list)
