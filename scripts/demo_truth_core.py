"""Demonstration of compiler-to-truth-core verification."""

import sys
from pathlib import Path
from pprint import pprint

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from slickk_core.brain import (
    Claim,
    ClaimType,
    DeterministicTruthCore,
    UniversalPrimitiveCompiler,
)


compiler = UniversalPrimitiveCompiler()
truth_core = DeterministicTruthCore()

questions = [
    "What is 12 divided by 3?",
    "Calculate 0.1 plus 0.2.",
    "Work out (5 + 3) multiplied by 2.",
]

for question in questions:
    compiled = compiler.compile(question)
    results = truth_core.verify_query_expressions(compiled)

    print("\n" + "=" * 72)
    print("QUESTION:", question)
    print("COMPILED EXPRESSIONS:")
    pprint(compiled.variables.get("expressions", []))
    print("DETERMINISTIC RESULTS:")

    for result in results:
        pprint(result.to_dict())

claims = [
    Claim(
        text="12 divided by 3 equals 4",
        claim_type=ClaimType.ARITHMETIC,
    ),
    Claim(
        text="12 divided by 3 equals 5",
        claim_type=ClaimType.ARITHMETIC,
    ),
]

print("\n" + "=" * 72)
print("CLAIM AUDIT:")

for claim in truth_core.verify_claims(claims):
    pprint(
        {
            "claim": claim.text,
            "status": claim.verification_status.value,
            "confidence": claim.confidence,
            "evidence": claim.evidence,
            "explanation": claim.explanation,
        }
    )
