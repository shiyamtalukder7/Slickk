from unittest.mock import patch

from slickk_server.knowledge_base import (
    retrieve_knowledge,
)
from slickk_server.tutor_engine import (
    select_tutor_response,
)


def sample_documents():
    return [
        {
            "id": "bandana-lesson",
            "curriculum": "nctb-english-version",
            "subject": "buddhist-religion-studies",
            "grade": "Class 7",
            "language": "english",
            "topic": "Bandana worship",
            "title": "Rules of worshipping the triple gem",
            "keywords": [
                "bandana",
                "worship",
                "triple gem",
            ],
            "facts": [
                (
                    "Bandana includes respectful worship "
                    "of the triple gem."
                )
            ],
        },
        {
            "id": "biology-lesson",
            "curriculum": "nctb-english-version",
            "subject": "biology",
            "grade": "Class 7",
            "language": "english",
            "topic": "Plant cells",
            "title": "Plant cell structure",
            "keywords": [
                "plant",
                "cell",
            ],
            "facts": [
                "Plant cells contain a cell wall."
            ],
        },
    ]


def test_general_studies_can_find_relevant_subject():
    with patch(
        "slickk_server.knowledge_base.load_documents",
        return_value=sample_documents(),
    ):
        documents = retrieve_knowledge(
            subject="General Studies",
            topic=(
                "Explain Bandana worship in simple "
                "Class 7 language"
            ),
            grade="Class 7",
            curriculum="nctb-english-version",
            query=(
                "Explain Bandana worship in simple "
                "Class 7 language"
            ),
            language="english",
        )

    assert documents
    assert documents[0]["id"] == "bandana-lesson"


def test_general_studies_does_not_return_random_lesson():
    with patch(
        "slickk_server.knowledge_base.load_documents",
        return_value=sample_documents(),
    ):
        documents = retrieve_knowledge(
            subject="General Studies",
            topic="Quantum teleportation",
            grade="Class 7",
            curriculum="nctb-english-version",
            query="Explain quantum teleportation",
            language="english",
        )

    assert documents == []


def test_bad_ungrounded_answer_uses_safe_fallback():
    safe_response = (
        "I do not have verified local lesson material "
        "for this topic yet, so I should not invent an answer."
    )

    bad_response = (
        "Bandan waters are created from imaginary temple "
        "machines and ancient electrical systems that produce "
        "many random stages without explaining the real lesson "
        "or asking the student any understanding question."
    )

    selected, rejected = select_tutor_response(
        bad_response,
        {
            "grounded": False,
            "topic": "Bandana worship",
            "teaching_mode": "explain",
            "language": "english",
            "_verified_response": safe_response,
        },
    )

    assert rejected is True
    assert selected == safe_response


def test_valid_ungrounded_answer_is_not_automatically_rejected():
    response = (
        "I do not have a verified textbook passage for that "
        "topic. Could you provide the chapter or page?"
    )

    selected, rejected = select_tutor_response(
        response,
        {
            "grounded": False,
            "topic": "Unknown topic",
            "teaching_mode": "explain",
            "language": "english",
            "_verified_response": (
                "I do not have verified local lesson material "
                "for this topic yet, so I should not invent an answer."
            ),
        },
    )

    assert rejected is False
    assert selected == response
