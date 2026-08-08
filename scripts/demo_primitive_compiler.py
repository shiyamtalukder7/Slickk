"""Manual demonstration of the Universal Primitive Compiler."""

from pprint import pprint

from slickk_core.brain import UniversalPrimitiveCompiler


compiler = UniversalPrimitiveCompiler()

questions = [
    "What is 12 divided by 3?",
    "Solve the algebra equation x + 5 = 12.",
    "Explain photosynthesis in Bangla.",
    "Draw a diagram of a plant cell.",
    "Who discovered penicillin? Give a source.",
]

for question in questions:
    compiled = compiler.compile(question)

    print("\n" + "=" * 70)
    print("STUDENT INPUT:", question)
    print("-" * 70)

    pprint(
        {
            "normalized_text": compiled.normalized_text,
            "subject": compiled.subject,
            "topic": compiled.topic,
            "intent": compiled.intent,
            "variables": compiled.variables,
            "constraints": compiled.constraints,
            "axioms": compiled.axioms,
            "requested_language": compiled.requested_language,
            "requires_calculation": compiled.requires_calculation,
            "requires_external_evidence": (
                compiled.requires_external_evidence
            ),
            "requires_visual_explanation": (
                compiled.requires_visual_explanation
            ),
            "required_tools": compiled.required_tools,
        },
        sort_dicts=False,
    )
