"""Educational prompt engine for Slickk Tutor."""

from typing import Any

from slickk_runtime.manager import RuntimeManagerError


TEACHING_MODES = {
    "socratic",
    "explain",
    "practice",
    "quiz",
    "homework",
    "revision",
}


def require_text(
    value: Any,
    field_name: str,
    default: str | None = None,
) -> str:
    """Validate and normalize a required text field."""

    if value is None and default is not None:
        return default

    if not isinstance(value, str) or not value.strip():
        raise RuntimeManagerError(
            code=f"{field_name}_required",
            message=f"{field_name} must be a non-empty string.",
            status_code=400,
        )

    return value.strip()


def optional_text(
    value: Any,
    default: str,
) -> str:
    """Return normalized optional text."""

    if value is None:
        return default

    if not isinstance(value, str):
        raise RuntimeManagerError(
            code="invalid_student_profile",
            message="Student profile values must be text.",
            status_code=400,
        )

    return value.strip() or default


def normalize_messages(messages: Any) -> list[dict[str, str]]:
    """Validate tutor conversation messages."""

    if not isinstance(messages, list) or not messages:
        raise RuntimeManagerError(
            code="messages_required",
            message="Provide a non-empty messages array.",
            status_code=400,
        )

    normalized: list[dict[str, str]] = []

    for message in messages:
        if not isinstance(message, dict):
            raise RuntimeManagerError(
                code="invalid_message",
                message="Every message must be a JSON object.",
                status_code=400,
            )

        role = message.get("role")
        content = message.get("content")

        if role not in {"user", "assistant"}:
            raise RuntimeManagerError(
                code="invalid_tutor_role",
                message=(
                    "Tutor messages may only use user "
                    "or assistant roles."
                ),
                status_code=400,
            )

        if not isinstance(content, str) or not content.strip():
            raise RuntimeManagerError(
                code="invalid_message_content",
                message="Every message must contain non-empty text.",
                status_code=400,
            )

        normalized.append(
            {
                "role": role,
                "content": content.strip(),
            }
        )

    return normalized


def mode_instructions(mode: str) -> str:
    """Return instructions for the selected teaching mode."""

    instructions = {
        "socratic": (
            "Guide the student with hints and ask exactly one "
            "useful question at a time. Do not reveal the complete "
            "answer immediately."
        ),
        "explain": (
            "Explain the idea in small steps using simple examples. "
            "Check understanding after the explanation."
        ),
        "practice": (
            "Give one practice problem at a time. Wait for the "
            "student's answer before giving the next problem."
        ),
        "quiz": (
            "Run a short interactive quiz. Ask one question at a "
            "time, check the answer, explain mistakes, and track "
            "the score."
        ),
        "homework": (
            "Help the student understand the homework without simply "
            "doing all the work for them. Show the method and let the "
            "student complete meaningful steps."
        ),
        "revision": (
            "Review the most important ideas, common mistakes, key "
            "terms, and likely examination questions."
        ),
    }

    return instructions[mode]


def build_tutor_prompt(
    payload: dict[str, Any],
) -> tuple[str, dict[str, str]]:
    """Build a structured educational prompt from a tutor request."""

    if not isinstance(payload, dict):
        raise RuntimeManagerError(
            code="invalid_payload",
            message="Request body must be a JSON object.",
            status_code=400,
        )

    student = payload.get("student", {})

    if not isinstance(student, dict):
        raise RuntimeManagerError(
            code="invalid_student",
            message="student must be a JSON object.",
            status_code=400,
        )

    name = optional_text(
        student.get("name"),
        "Student",
    )
    grade = optional_text(
        student.get("grade"),
        "Not specified",
    )
    curriculum = optional_text(
        student.get("curriculum"),
        "General curriculum",
    )

    language = optional_text(
        payload.get(
            "language",
            student.get("preferred_language"),
        ),
        "English",
    )

    subject = require_text(
        payload.get("subject"),
        "subject",
    )
    topic = optional_text(
        payload.get("topic"),
        "Current lesson",
    )

    mode = optional_text(
        payload.get("teaching_mode"),
        "socratic",
    ).lower()

    if mode not in TEACHING_MODES:
        raise RuntimeManagerError(
            code="invalid_teaching_mode",
            message=(
                "teaching_mode must be one of: "
                + ", ".join(sorted(TEACHING_MODES))
            ),
            status_code=400,
        )

    messages = normalize_messages(
        payload.get("messages")
    )

    conversation: list[str] = []

    for message in messages:
        label = (
            "Student"
            if message["role"] == "user"
            else "Tutor"
        )
        conversation.append(
            f"{label}: {message['content']}"
        )

    system_prompt = f"""
You are Slickk Tutor, a highly capable private teacher.

STUDENT PROFILE
Name: {name}
Grade or level: {grade}
Curriculum: {curriculum}
Preferred language: {language}

LESSON
Subject: {subject}
Topic: {topic}
Teaching mode: {mode}

TEACHING BEHAVIOUR
1. Teach at the student's stated grade and curriculum level.
2. Use clear, accurate and age-appropriate language.
3. Break difficult ideas into small steps.
4. Teach one main concept at a time.
5. Use relatable examples before abstract explanations.
6. Detect misconceptions from the student's answers.
7. Correct mistakes kindly and explain why they are mistakes.
8. Ask only one question at a time during interactive teaching.
9. Do not pretend the student understands; check understanding.
10. Do not invent facts, quotations, textbook pages or sources.
11. Respond primarily in {language}.
12. Preserve useful context from the conversation.
13. Avoid unnecessarily long answers.
14. When useful, include a short memory tip.
15. For mathematics and science, show logical working clearly.
16. For language subjects, explain grammar and vocabulary simply.
17. Never shame the student for an incorrect answer.

MODE INSTRUCTION
{mode_instructions(mode)}

Continue the following lesson naturally.
""".strip()

    prompt = (
        f"{system_prompt}\n\n"
        + "\n\n".join(conversation)
        + "\n\nTutor:"
    )

    metadata = {
        "student_name": name,
        "grade": grade,
        "curriculum": curriculum,
        "language": language,
        "subject": subject,
        "topic": topic,
        "teaching_mode": mode,
    }

    return prompt, metadata
