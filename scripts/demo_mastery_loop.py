"""Demonstration of the complete verified mastery loop."""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from slickk_core.brain import (
    LearningStage,
    MasteryLoopController,
    StudentProfile,
    StudentState,
    UniversalTutorBrain,
)


memory_path = Path(
    "tmp/mastery_loop_demo.json"
)
memory_path.unlink(missing_ok=True)

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

loop = MasteryLoopController(
    brain
)

attempts = [
    {
        "question": "What is 12 divided by 3?",
        "answer": "5",
        "stage": LearningStage.SOCRATIC_SCAFFOLDING,
    },
    {
        "question": "What is 12 divided by 3?",
        "answer": "4",
        "stage": LearningStage.SOCRATIC_SCAFFOLDING,
    },
    {
        "question": "What is 14 divided by 2?",
        "answer": (
            "7 because division separates the total "
            "into equal groups."
        ),
        "stage": LearningStage.STRESS_TESTING,
    },
    {
        "question": "What is 12 divided by 3?",
        "answer": (
            "The answer is 4 because 12 objects split "
            "into 3 equal groups gives 4 objects in "
            "each group. For example, 12 apples shared "
            "between 3 students gives 4 apples each."
        ),
        "stage": LearningStage.REVERSE_TEACHING,
    },
]

for attempt in attempts:
    result = loop.assess(
        student_id="mahir-001",
        original_question=attempt["question"],
        student_answer=attempt["answer"],
        stage=attempt["stage"],
    )

    print("\n" + "=" * 76)
    print("QUESTION:", attempt["question"])
    print("STUDENT ANSWER:", attempt["answer"])
    print("CURRENT STAGE:", attempt["stage"].value)

    print(
        json.dumps(
            result.to_dict(),
            indent=2,
            ensure_ascii=False,
        )
    )

print("\n" + "=" * 76)
print("PERSISTENT MASTERY MEMORY:")
print(memory_path.resolve())
