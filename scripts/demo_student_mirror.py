"""Demonstration of the persistent Student-Brain Mirror."""

import sys
from pathlib import Path
from pprint import pprint

# Allow this script to import slickk_core when launched directly.
PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from slickk_core.brain import (
    StudentBrainMirror,
    StudentProfile,
)


storage_path = Path("tmp/student_brain_demo.json")
storage_path.unlink(missing_ok=True)

mirror = StudentBrainMirror(storage_path)

mirror.register_student(
    StudentProfile(
        student_id="mahir-001",
        name="Mahir",
        grade="Class 7",
        curriculum="IGCSE Edexcel",
        preferred_language="English",
        secondary_languages=["Bangla"],
        learning_preferences=[
            "short explanations",
            "one question at a time",
        ],
    )
)

interactions = [
    {
        "message": "I don't understand division. It is too hard.",
        "score": 0.2,
        "misconceptions": [
            "Division always makes a number larger"
        ],
    },
    {
        "message": "I understand now. 12 divided by 3 is 4.",
        "score": 1.0,
        "mastered_skills": ["Division as equal grouping"],
    },
    {
        "message": "Got it. Give me another question.",
        "score": 1.0,
        "mastered_skills": ["Basic division"],
    },
]

for interaction in interactions:
    update = mirror.process_interaction(
        student_id="mahir-001",
        message=interaction["message"],
        correctness_score=interaction["score"],
        subject="Mathematics",
        topic="Division",
        misconceptions=interaction.get("misconceptions"),
        mastered_skills=interaction.get("mastered_skills"),
    )

    print("\n" + "=" * 72)
    print("MESSAGE:", interaction["message"])
    print("SIGNALS:")
    pprint(update.detected_signals)
    print("STRATEGIES:")
    pprint(update.recommended_strategies)
    print("UPDATED STATE:")
    pprint(mirror.export_snapshot("mahir-001")["state"])

print("\nPERSISTED DATABASE:", storage_path.resolve())
