"""Tests for the Slickk Deterministic Truth Core."""

import unittest

from slickk_core.brain import (
    Claim,
    ClaimType,
    DeterministicTruthCore,
    TruthCoreError,
    UniversalPrimitiveCompiler,
    VerificationStatus,
)


class DeterministicTruthCoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.truth_core = DeterministicTruthCore()

    def test_evaluates_basic_arithmetic(self) -> None:
        result = self.truth_core.evaluate("2 + 3")

        self.assertEqual(result.exact_value, "5")
        self.assertTrue(result.verified)

    def test_preserves_exact_division(self) -> None:
        result = self.truth_core.evaluate("1 / 3")

        self.assertEqual(result.exact_value, "1/3")

    def test_avoids_decimal_floating_point_error(self) -> None:
        result = self.truth_core.evaluate(
            "0.1 + 0.2 = 0.3"
        )

        self.assertEqual(result.exact_value, "True")
        self.assertTrue(result.verified)

    def test_respects_order_of_operations(self) -> None:
        result = self.truth_core.evaluate(
            "2 + 3 * 4"
        )

        self.assertEqual(result.exact_value, "14")

    def test_evaluates_comparison_chain(self) -> None:
        result = self.truth_core.evaluate(
            "1 < 2 < 3"
        )

        self.assertTrue(result.verified)

    def test_understands_mathematical_words(self) -> None:
        result = self.truth_core.evaluate(
            "12 divided by 3 equals 4"
        )

        self.assertEqual(result.exact_value, "True")

    def test_understands_unicode_operators(self) -> None:
        result = self.truth_core.evaluate(
            "8 ÷ 2 × 3"
        )

        self.assertEqual(result.exact_value, "12")

    def test_rejects_division_by_zero(self) -> None:
        with self.assertRaises(TruthCoreError):
            self.truth_core.evaluate("10 / 0")

    def test_rejects_executable_code(self) -> None:
        with self.assertRaises(TruthCoreError):
            self.truth_core.evaluate(
                "__import__('os').system('dir')"
            )

    def test_rejects_excessive_exponents(self) -> None:
        with self.assertRaises(TruthCoreError):
            self.truth_core.evaluate("2 ** 1000")

    def test_verifies_true_arithmetic_claim(self) -> None:
        claim = Claim(
            text="12 divided by 3 equals 4",
            claim_type=ClaimType.ARITHMETIC,
        )

        verified = self.truth_core.verify_claim(claim)

        self.assertEqual(
            verified.verification_status,
            VerificationStatus.VERIFIED,
        )
        self.assertEqual(verified.confidence, 1.0)

    def test_contradicts_false_arithmetic_claim(self) -> None:
        claim = Claim(
            text="12 divided by 3 equals 5",
            claim_type=ClaimType.ARITHMETIC,
        )

        verified = self.truth_core.verify_claim(claim)

        self.assertEqual(
            verified.verification_status,
            VerificationStatus.CONTRADICTED,
        )

    def test_evaluates_full_grouped_compiler_expression(self) -> None:
        compiler = UniversalPrimitiveCompiler()

        query = compiler.compile(
            "Work out (5 + 3) multiplied by 2."
        )

        results = self.truth_core.verify_query_expressions(
            query
        )

        self.assertEqual(
            query.variables["expressions"],
            ["(5 + 3) * 2"],
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].exact_value, "16")

    def test_verifies_compiler_expressions(self) -> None:
        compiler = UniversalPrimitiveCompiler()
        query = compiler.compile(
            "What is 12 divided by 3?"
        )

        results = self.truth_core.verify_query_expressions(
            query
        )

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].exact_value, "4")


if __name__ == "__main__":
    unittest.main()
