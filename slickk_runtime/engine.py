"""Core runtime contracts for the Slickk local AI engine."""

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GenerationRequest:
    prompt: str
    max_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


@dataclass(frozen=True)
class GenerationResult:
    text: str
    tokens_generated: int
    finish_reason: str


class SlickkEngine(ABC):
    """Interface every Slickk inference backend must implement."""

    @abstractmethod
    def load_model(self, model_path: Path) -> None:
        """Load a local model into memory."""

    @abstractmethod
    def unload_model(self) -> None:
        """Release the currently loaded model."""

    @abstractmethod
    def generate(self, request: GenerationRequest) -> GenerationResult:
        """Generate a complete response."""

    @abstractmethod
    def stream(self, request: GenerationRequest) -> Iterator[str]:
        """Yield generated text incrementally."""

    @abstractmethod
    def is_loaded(self) -> bool:
        """Return whether a model is currently loaded."""
