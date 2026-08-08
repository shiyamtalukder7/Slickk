"""Public interface for the Slickk Universal AI Tutor brain."""

from .compiler import (
    PrimitiveCompilerError,
    UniversalPrimitiveCompiler,
)
from .mastery import (
    MasteryEvaluationEngine,
    MasteryEvaluationError,
    MasteryEvaluationReport,
)
from .mastery_loop import (
    MasteryLoopController,
    MasteryLoopResult,
)
from .orchestrator import (
    BrainTurnResult,
    UniversalTutorBrain,
    UniversalTutorBrainError,
)
from .planner import (
    SocraticPlannerError,
    SocraticTeachingPlanner,
)
from .response_gate import (
    ResponseAuditReport,
    ResponseGateError,
    ResponseVerificationGate,
    TutorResponseComposer,
)
from .schemas import (
    Claim,
    ClaimType,
    DifficultyLevel,
    LearningStage,
    MasteryResult,
    NormalizedQuery,
    StudentProfile,
    StudentState,
    TutorPlan,
    TutorResponse,
    VerificationStatus,
)
from .session import (
    SessionStateError,
    SessionStatus,
    SessionTurnResult,
    TutorSession,
    TutorSessionStateMachine,
)
from .student_mirror import (
    BrainMirrorUpdate,
    StudentBrainMirror,
    StudentBrainMirrorError,
)
from .truth_core import (
    ArithmeticExecutionError,
    ArithmeticResult,
    DeterministicTruthCore,
    TruthCoreError,
    UnsafeExpressionError,
)

__all__ = [
    "ArithmeticExecutionError",
    "ArithmeticResult",
    "BrainMirrorUpdate",
    "BrainTurnResult",
    "Claim",
    "ClaimType",
    "DeterministicTruthCore",
    "DifficultyLevel",
    "LearningStage",
    "MasteryEvaluationEngine",
    "MasteryEvaluationError",
    "MasteryEvaluationReport",
    "MasteryLoopController",
    "MasteryLoopResult",
    "MasteryResult",
    "NormalizedQuery",
    "PrimitiveCompilerError",
    "ResponseAuditReport",
    "ResponseGateError",
    "ResponseVerificationGate",
    "SessionStateError",
    "SessionStatus",
    "SessionTurnResult",
    "SocraticPlannerError",
    "SocraticTeachingPlanner",
    "StudentBrainMirror",
    "StudentBrainMirrorError",
    "StudentProfile",
    "StudentState",
    "TruthCoreError",
    "TutorPlan",
    "TutorResponse",
    "TutorResponseComposer",
    "TutorSession",
    "TutorSessionStateMachine",
    "UniversalPrimitiveCompiler",
    "UniversalTutorBrain",
    "UniversalTutorBrainError",
    "UnsafeExpressionError",
    "VerificationStatus",
]
