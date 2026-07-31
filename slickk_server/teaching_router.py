"""Teaching-method selection for the Slickk universal tutor."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


SUPPORTED_METHODS = {
    "explain",
    "socratic",
    "worked-example",
    "guided-practice",
    "independent-practice",
    "quiz",
    "exam-preparation",
    "revision",
    "flashcards",
    "memory-trick",
    "real-life",
    "bilingual",
    "homework-help",
    "weakness-repair",
    "adaptive",
}


METHOD_INSTRUCTIONS = {
    "explain": (
        "Explain the concept clearly using age-appropriate language. "
        "Start with the main idea, then give a simple example."
    ),
    "socratic": (
        "Teach by asking one helpful question at a time. "
        "Do not reveal the full answer immediately."
    ),
    "worked-example": (
        "Demonstrate a complete example step by step. "
        "Explain why each step is performed."
    ),
    "guided-practice": (
        "Solve the task together with the learner. "
        "Give hints first and gradually reduce assistance."
    ),
    "independent-practice": (
        "Give the learner a suitable exercise. "
        "Do not show the answer until the learner attempts it."
    ),
    "quiz": (
        "Ask one short question at a time. "
        "Check the answer, explain mistakes and keep score."
    ),
    "exam-preparation": (
        "Teach according to the relevant examination format. "
        "Include marks, command words, timing and answer structure."
    ),
    "revision": (
        "Summarize the most important ideas, formulas and definitions. "
        "Finish with short recall questions."
    ),
    "flashcards": (
        "Create concise question-and-answer flashcards "
        "for active recall."
    ),
    "memory-trick": (
        "Use safe mnemonics, patterns and associations "
        "to make the lesson easier to remember."
    ),
    "real-life": (
        "Connect the concept to familiar real-life situations "
        "before introducing technical details."
    ),
    "bilingual": (
        "Teach using both Bangla and English. "
        "Keep technical terms in English and explain them in Bangla."
    ),
    "homework-help": (
        "Guide the learner through the homework without simply "
        "giving the final answer."
    ),
    "weakness-repair": (
        "Identify the learner's misconception or missing prerequisite. "
        "Reteach that foundation before continuing."
    ),
    "adaptive": (
        "Adjust explanation depth and question difficulty according "
        "to the learner's performance."
    ),
}


@dataclass(frozen=True)
class TeachingDecision:
    method: str
    reason: str
    instruction: str
    language: str
    difficulty: str

    def to_dict(self) -> dict[str, str]:
        return {
            "method": self.method,
            "reason": self.reason,
            "instruction": self.instruction,
            "language": self.language,
            "difficulty": self.difficulty,
        }


def _normalise(value: Any) -> str:
    return str(value or "").strip().lower()


def _detect_language(message: str, requested_language: str) -> str:
    language = _normalise(requested_language)

    if language in {"bangla", "bengali", "bn"}:
        return "Bangla"

    if language in {"bilingual", "bangla-english", "english-bangla"}:
        return "Bilingual"

    if language in {"english", "en"}:
        return "English"

    has_bangla = any("\u0980" <= character <= "\u09ff" for character in message)

    return "Bangla" if has_bangla else "English"


def _detect_difficulty(
    level: str,
    requested_difficulty: str,
    performance: float | None,
) -> str:
    difficulty = _normalise(requested_difficulty)

    if difficulty in {"beginner", "easy", "medium", "hard", "advanced"}:
        return difficulty

    if performance is not None:
        if performance < 0.4:
            return "easy"
        if performance < 0.75:
            return "medium"
        return "hard"

    level_text = _normalise(level)

    if any(token in level_text for token in ("class 1", "class 2", "class 3")):
        return "beginner"

    if any(token in level_text for token in ("class 4", "class 5", "class 6")):
        return "easy"

    if any(token in level_text for token in ("class 7", "class 8", "class 9")):
        return "medium"

    if any(
        token in level_text
        for token in (
            "class 10",
            "class 11",
            "class 12",
            "igcse",
            "o level",
            "a level",
            "university",
        )
    ):
        return "hard"

    return "medium"


def select_teaching_method(
    message: str,
    *,
    requested_method: str | None = None,
    language: str = "",
    level: str = "",
    difficulty: str = "",
    performance: float | None = None,
    previous_attempt_correct: bool | None = None,
) -> TeachingDecision:
    """Select the most suitable teaching method for a learner request."""

    text = _normalise(message)
    selected_language = _detect_language(message, language)
    selected_difficulty = _detect_difficulty(
        level,
        difficulty,
        performance,
    )

    explicit_method = _normalise(requested_method)

    if explicit_method in SUPPORTED_METHODS:
        method = explicit_method
        reason = "The learner explicitly requested this teaching method."

    elif selected_language == "Bilingual" or any(
        phrase in text
        for phrase in (
            "bangla and english",
            "english and bangla",
            "বাংলা ও ইংরেজি",
            "দুই ভাষায়",
        )
    ):
        method = "bilingual"
        reason = "The learner requested teaching in two languages."

    elif previous_attempt_correct is False:
        method = "weakness-repair"
        reason = "The learner's previous answer was incorrect."

    elif any(
        phrase in text
        for phrase in (
            "exam",
            "test preparation",
            "board question",
            "model answer",
            "mark scheme",
            "পরীক্ষা",
            "বোর্ড প্রশ্ন",
        )
    ):
        method = "exam-preparation"
        reason = "The request is focused on examination preparation."

    elif any(
        phrase in text
        for phrase in (
            "quiz",
            "test me",
            "ask me questions",
            "mcq",
            "কুইজ",
            "প্রশ্ন কর",
        )
    ):
        method = "quiz"
        reason = "The learner requested an interactive assessment."

    elif any(
        phrase in text
        for phrase in (
            "homework",
            "assignment",
            "solve this",
            "help me solve",
            "হোমওয়ার্ক",
            "সমাধান",
        )
    ):
        method = "homework-help"
        reason = "The learner requested help with a task or assignment."

    elif any(
        phrase in text
        for phrase in (
            "step by step",
            "show an example",
            "worked example",
            "ধাপে ধাপে",
            "উদাহরণ",
        )
    ):
        method = "worked-example"
        reason = "The learner requested a step-by-step example."

    elif any(
        phrase in text
        for phrase in (
            "revise",
            "revision",
            "summary",
            "summarize",
            "quick review",
            "পুনরাবৃত্তি",
            "সারাংশ",
        )
    ):
        method = "revision"
        reason = "The learner requested revision or a summary."

    elif any(
        phrase in text
        for phrase in (
            "flashcard",
            "flashcards",
            "ফ্ল্যাশকার্ড",
        )
    ):
        method = "flashcards"
        reason = "The learner requested flashcards."

    elif any(
        phrase in text
        for phrase in (
            "remember",
            "memory trick",
            "mnemonic",
            "memorize",
            "মনে রাখ",
            "মুখস্থ",
        )
    ):
        method = "memory-trick"
        reason = "The learner requested memorization support."

    elif any(
        phrase in text
        for phrase in (
            "real life",
            "daily life",
            "practical example",
            "বাস্তব জীবন",
        )
    ):
        method = "real-life"
        reason = "The learner requested a practical connection."

    elif any(
        phrase in text
        for phrase in (
            "give me practice",
            "practice question",
            "let me try",
            "আমি চেষ্টা করি",
            "অনুশীলন",
        )
    ):
        method = "independent-practice"
        reason = "The learner wants to practise independently."

    elif any(
        phrase in text
        for phrase in (
            "ask me one question",
            "don't tell me the answer",
            "guide me",
            "hint only",
            "ইঙ্গিত দাও",
            "উত্তর বলো না",
        )
    ):
        method = "socratic"
        reason = "The learner requested guided discovery."

    elif performance is not None:
        method = "adaptive"
        reason = "Performance data is available for adaptive teaching."

    else:
        method = "explain"
        reason = "A clear teacher explanation is the safest default."

    instruction = METHOD_INSTRUCTIONS[method]

    return TeachingDecision(
        method=method,
        reason=reason,
        instruction=instruction,
        language=selected_language,
        difficulty=selected_difficulty,
    )
