"""Demonstration of a persistent automatic tutor session."""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from slickk_core.brain import (
    StudentProfile,
    StudentState,
    TutorSessionStateMachine,
    UniversalTutorBrain,
)


memory_path = Path(
    "tmp/session_state_student_memory.json"
)
session_path = Path(
    "tmp/session_state_demo.json"
)

memory_path.unlink(missing_ok=True)
session_path.unlink(missing_ok=True)

brain = UniversalTutorBrain(
    memory_path
)

brain.register_student(
    StudentProfile(
        student_id="mahir-001",
        name="Mahir",
        grade="Class 7",
        curriculum="IGCSE Edexcel",
    ),
    StudentState(
        student_id="mahir-001",
        focus=0.7,
    ),
)

sessions = TutorSessionStateMachine(
    brain,
    session_path,
)

print("\n" + "=" * 76)
print("STARTING LESSON")

turn = sessions.start_lesson(
    "mahir-001",
    "What is 12 divided by 3?",
)

print(
    json.dumps(
        turn.to_dict(),
        indent=2,
        ensure_ascii=False,
    )
)

print("\n" + "=" * 76)
print("STUDENT SENDS ONLY: 4")

turn = sessions.submit_answer(
    "mahir-001",
    "4",
)

print("Tutor:", turn.message)
print("Question:", turn.question_for_student)
print("Stage:", turn.session.stage.value)
print(
    "Remembered active question:",
    turn.session.active_question,
)

stress_query = brain.compiler.compile(
    turn.session.active_question
)

stress_answer = (
    brain.truth_core.verify_query_expressions(
        stress_query
    )[0].exact_value
)

print("\n" + "=" * 76)
print(
    "STUDENT SENDS ONLY:",
    f"{stress_answer} because division uses equal groups.",
)

turn = sessions.submit_answer(
    "mahir-001",
    (
        f"{stress_answer} because division separates "
        f"a total into equal groups."
    ),
)

print("Tutor:", turn.message)
print("Question:", turn.question_for_student)
print("Stage:", turn.session.stage.value)

print("\n" + "=" * 76)
print("STUDENT SENDS ONLY A TEACH-BACK")

turn = sessions.submit_answer(
    "mahir-001",
    (
        "The answer is 4 because 12 objects split into "
        "3 equal groups gives 4 objects in each group. "
        "For example, 12 apples shared among 3 students "
        "gives 4 apples each."
    ),
)

print("Tutor:", turn.message)
print("Stage:", turn.session.stage.value)
print("Status:", turn.session.status.value)
print("Question:", turn.question_for_student)

print("\n" + "=" * 76)
print("PERSISTENT SESSION DATABASE:")
print(session_path.resolve())

print("\nPERSISTENT STUDENT MEMORY:")
print(memory_path.resolve())
