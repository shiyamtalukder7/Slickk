"""Demonstration of response composition and delivery approval."""

import sys
from pathlib import Path
from pprint import pprint

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from slickk_core.brain import (
    DeterministicTruthCore,
    ResponseVerificationGate,
    SocraticTeachingPlanner,
    StudentProfile,
    StudentState,
    TutorResponseComposer,
    UniversalPrimitiveCompiler,
)


compiler = UniversalPrimitiveCompiler()
truth_core = DeterministicTruthCore()
planner = SocraticTeachingPlanner()
composer = TutorResponseComposer()
gate = ResponseVerificationGate()

profile = StudentProfile(
    student_id="mahir-001",
    name="Mahir",
    grade="Class 7",
    curriculum="IGCSE Edexcel",
)

state = StudentState(
    student_id="mahir-001",
    current_subject="Mathematics",
    current_topic="Division",
    confidence=0.5,
    focus=0.7,
)

question = "What is 12 divided by 3?"

query = compiler.compile(question)
plan = planner.plan(query, profile, state)
results = truth_core.verify_query_expressions(query)

candidate = composer.compose(
    query,
    plan,
    state,
    arithmetic_results=results,
)

audited, report = gate.audit(
    candidate,
    query,
    plan,
    arithmetic_results=results,
)

print("\n" + "=" * 72)
print("INTERNAL VERIFIED RESULT:")
pprint([result.to_dict() for result in results])

print("\nSTUDENT-FACING RESPONSE:")
pprint(
    {
        "message": audited.message,
        "question": audited.question_for_student,
        "hints": audited.hints,
        "safe_to_deliver": audited.safe_to_deliver,
    },
    sort_dicts=False,
)

print("\nAUDIT REPORT:")
pprint(report.to_dict(), sort_dicts=False)

print("\n" + "=" * 72)
print("SIMULATED LEAK ATTEMPT:")

leaked = copy_response = type(audited)(
    message="The answer is 4.",
    stage=plan.stage,
    question_for_student=plan.socratic_question,
)

blocked, blocked_report = gate.audit(
    leaked,
    query,
    plan,
    arithmetic_results=results,
)

pprint(
    {
        "safe_to_deliver": blocked.safe_to_deliver,
        "violations": blocked_report.violations,
        "answer_leak_detected": (
            blocked_report.answer_leak_detected
        ),
    },
    sort_dicts=False,
)
