"""Demonstration of the complete Universal Tutor Brain."""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from slickk_core.brain import (
    StudentProfile,
    StudentState,
    UniversalTutorBrain,
)


memory_path = Path(
    "tmp/universal_tutor_brain_demo.json"
)
memory_path.unlink(missing_ok=True)

brain = UniversalTutorBrain(memory_path)

brain.register_student(
    StudentProfile(
        student_id="mahir-001",
        name="Mahir",
        grade="Class 7",
        curriculum="IGCSE Edexcel",
        preferred_language="English",
        secondary_languages=["Bangla"],
        learning_preferences=[
            "one question at a time",
            "short explanations",
        ],
    ),
    StudentState(
        student_id="mahir-001",
        focus=0.7,
        confidence=0.5,
    ),
)

questions = [
    "What is 12 divided by 3?",
    "Check my answer: 12 divided by 3 equals 4.",
    "Explain photosynthesis.",
    "Who discovered penicillin? Give a source.",
]

for question in questions:
    result = brain.process_turn(
        "mahir-001",
        question,
    )

    print("\n" + "=" * 76)
    print("STUDENT:", question)

    print("\nINTERNAL PIPELINE:")
    print(
        json.dumps(
            {
                "subject": result.query.subject,
                "topic": result.query.topic,
                "intent": result.query.intent,
                "stage": result.plan.stage.value,
                "internal_results": [
                    item.to_dict()
                    for item in result.arithmetic_results
                ],
                "audit": result.audit_report.to_dict(),
            },
            indent=2,
            ensure_ascii=False,
        )
    )

    print("\nAPPROVED STUDENT RESPONSE:")
    print(result.response.message)

    if result.response.hints:
        print("Hint:", result.response.hints[0])

    if result.response.question_for_student:
        print(
            "Question:",
            result.response.question_for_student,
        )

    print(
        "Safe to deliver:",
        result.response.safe_to_deliver,
    )

print("\n" + "=" * 76)
print("PERSISTENT BRAIN MEMORY:")
print(memory_path.resolve())
