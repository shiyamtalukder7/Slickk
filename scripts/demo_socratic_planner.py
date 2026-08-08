"""Demonstration of the complete planning pipeline."""

import sys
from pathlib import Path
from pprint import pprint

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from slickk_core.brain import (
    DeterministicTruthCore,
    DifficultyLevel,
    SocraticTeachingPlanner,
    StudentBrainMirror,
    StudentProfile,
    StudentState,
    UniversalPrimitiveCompiler,
)


compiler = UniversalPrimitiveCompiler()
truth_core = DeterministicTruthCore()
planner = SocraticTeachingPlanner()
mirror = StudentBrainMirror()

profile = StudentProfile(
    student_id="mahir-001",
    name="Mahir",
    grade="Class 7",
    curriculum="IGCSE Edexcel",
    preferred_language="English",
    secondary_languages=["Bangla"],
)

mirror.register_student(
    profile,
    StudentState(
        student_id="mahir-001",
        current_subject="Mathematics",
        current_topic="Division",
        difficulty=DifficultyLevel.BEGINNER,
        confidence=0.5,
        focus=0.7,
    ),
)

question = "What is 12 divided by 3?"

query = compiler.compile(question)
state = mirror.get_state("mahir-001")
strategies = mirror.recommend_strategies(state)

plan = planner.plan(
    query,
    profile,
    state,
    recommended_strategies=strategies,
)

verified_results = truth_core.verify_query_expressions(
    query
)

print("\n" + "=" * 72)
print("STUDENT QUESTION:")
print(question)

print("\nINTERNAL VERIFIED ANSWER:")
for result in verified_results:
    pprint(result.to_dict())

print("\nSOCRATIC PLAN:")
pprint(
    {
        "learning_objective": plan.learning_objective,
        "stage": plan.stage.value,
        "explanation_strategy": plan.explanation_strategy,
        "socratic_question": plan.socratic_question,
        "required_tools": plan.required_tools,
        "prerequisite_skills": plan.prerequisite_skills,
        "stress_test_variations": plan.stress_test_variations,
        "maximum_attempts": plan.maximum_attempts,
    },
    sort_dicts=False,
)

print("\nIMPORTANT:")
print(
    "The verified answer remains internal. "
    "The first student-facing action is the Socratic question."
)
