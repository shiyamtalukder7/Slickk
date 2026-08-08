"""Tests for the Universal Primitive Compiler."""

import unittest

from slickk_core.brain import (
    PrimitiveCompilerError,
    UniversalPrimitiveCompiler,
)


class UniversalPrimitiveCompilerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.compiler = UniversalPrimitiveCompiler()

    def test_compiles_basic_division_question(self) -> None:
        result = self.compiler.compile(
            "What is 12 divided by 3?"
        )

        self.assertEqual(result.subject, "Mathematics")
        self.assertEqual(result.topic, "Division")
        self.assertEqual(result.intent, "solve_and_teach")
        self.assertTrue(result.requires_calculation)
        self.assertIn("calculator", result.required_tools)
        self.assertEqual(result.variables["numbers"], [12, 3])
        self.assertIn("division_by_zero_is_undefined", result.axioms)

    def test_compiles_algebra_question(self) -> None:
        result = self.compiler.compile(
            "Solve the algebra equation x + 5 = 12."
        )

        self.assertEqual(result.subject, "Mathematics")
        self.assertEqual(result.topic, "Algebra")
        self.assertIn("calculator", result.required_tools)
        self.assertIn("sympy", result.required_tools)
        self.assertIn(
            "equivalent_operations_preserve_equation_equality",
            result.axioms,
        )

    def test_detects_biology_topic(self) -> None:
        result = self.compiler.compile(
            "Explain photosynthesis step by step."
        )

        self.assertEqual(result.subject, "Biology")
        self.assertEqual(result.topic, "Photosynthesis")
        self.assertEqual(result.intent, "explain_concept")

    def test_detects_requested_bangla_language(self) -> None:
        result = self.compiler.compile(
            "Explain photosynthesis in Bangla."
        )

        self.assertEqual(result.requested_language, "Bangla")

    def test_detects_bangla_characters(self) -> None:
        result = self.compiler.compile(
            "প্রকাশ-সংশ্লেষণ কী?"
        )

        self.assertEqual(result.requested_language, "Bangla")

    def test_detects_external_evidence_requirement(self) -> None:
        result = self.compiler.compile(
            "Who discovered penicillin? Give a source."
        )

        self.assertTrue(result.requires_external_evidence)
        self.assertIn("trusted_retrieval", result.required_tools)
        self.assertIn("citation_validator", result.required_tools)

    def test_detects_visual_request(self) -> None:
        result = self.compiler.compile(
            "Draw a diagram of a plant cell."
        )

        self.assertEqual(result.subject, "Biology")
        self.assertTrue(result.requires_visual_explanation)
        self.assertIn("diagram_renderer", result.required_tools)

    def test_extracts_constraints_and_selects_z3(self) -> None:
        result = self.compiler.compile(
            "Find x where x must be at least 5 and x < 10."
        )

        self.assertTrue(result.constraints)
        self.assertIn("z3", result.required_tools)

    def test_detects_practice_intent(self) -> None:
        result = self.compiler.compile(
            "Quiz me on chemical reactions."
        )

        self.assertEqual(result.subject, "Chemistry")
        self.assertEqual(result.topic, "Chemical Reactions")
        self.assertEqual(result.intent, "practice_and_assess")

    def test_preserves_grouped_arithmetic_expression(self) -> None:
        result = self.compiler.compile(
            "Work out (5 + 3) multiplied by 2."
        )

        self.assertEqual(
            result.variables["expressions"],
            ["(5 + 3) * 2"],
        )

    def test_rejects_empty_input(self) -> None:
        with self.assertRaises(PrimitiveCompilerError):
            self.compiler.compile("   ")


if __name__ == "__main__":
    unittest.main()
