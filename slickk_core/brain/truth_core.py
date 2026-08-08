"""Deterministic arithmetic verification for the Slickk AI Tutor.

This module separates mathematical execution from language generation.

Security principles:
- Never use eval() or exec().
- Parse expressions through Python's Abstract Syntax Tree.
- Permit only explicitly approved arithmetic and comparison operations.
- Reject names, functions, attributes, collections, and executable code.
- Use Fraction arithmetic to avoid ordinary floating-point errors.
"""

from __future__ import annotations

import ast
import copy
import re
from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from .schemas import (
    Claim,
    ClaimType,
    NormalizedQuery,
    VerificationStatus,
)


class TruthCoreError(ValueError):
    """Base error raised by the deterministic truth core."""


class UnsafeExpressionError(TruthCoreError):
    """Raised when an expression contains forbidden syntax."""


class ArithmeticExecutionError(TruthCoreError):
    """Raised when safe arithmetic cannot be completed."""


@dataclass(slots=True)
class ArithmeticResult:
    """Exact result produced by deterministic arithmetic execution."""

    original_expression: str
    normalized_expression: str
    result_type: str
    exact_value: str
    decimal_value: float | None
    verified: bool
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-compatible result."""

        return {
            "original_expression": self.original_expression,
            "normalized_expression": self.normalized_expression,
            "result_type": self.result_type,
            "exact_value": self.exact_value,
            "decimal_value": self.decimal_value,
            "verified": self.verified,
            "explanation": self.explanation,
        }


class DeterministicTruthCore:
    """Safely evaluate and verify arithmetic expressions and claims."""

    MAX_EXPRESSION_LENGTH = 250
    MAX_AST_NODES = 80
    MAX_POWER = 20
    MAX_NUMBER_BITS = 4096

    WORD_REPLACEMENTS: tuple[tuple[str, str], ...] = (
        (r"\bgreater than or equal to\b", ">="),
        (r"\bless than or equal to\b", "<="),
        (r"\bnot equal to\b", "!="),
        (r"\bis not equal to\b", "!="),
        (r"\bdivided by\b", "/"),
        (r"\bdivide by\b", "/"),
        (r"\bmultiplied by\b", "*"),
        (r"\bmultiply by\b", "*"),
        (r"\btimes\b", "*"),
        (r"\bto the power of\b", "**"),
        (r"\bplus\b", "+"),
        (r"\bminus\b", "-"),
        (r"\bis equal to\b", "="),
        (r"\bequals\b", "="),
        (r"\bequal to\b", "="),
        (r"\bgreater than\b", ">"),
        (r"\bless than\b", "<"),
    )

    def evaluate(self, expression: str) -> ArithmeticResult:
        """Safely evaluate an arithmetic expression or comparison.

        Examples:
            12 / 3
            12 / 3 = 4
            (5 + 3) * 2
            0.1 + 0.2 = 0.3
        """

        if not isinstance(expression, str):
            raise TruthCoreError("Expression must be text")

        original_expression = expression.strip()

        if not original_expression:
            raise TruthCoreError("Expression cannot be empty")

        if len(original_expression) > self.MAX_EXPRESSION_LENGTH:
            raise UnsafeExpressionError(
                "Expression exceeds the permitted length"
            )

        normalized = self._normalize_expression(original_expression)

        try:
            syntax_tree = ast.parse(normalized, mode="eval")
        except SyntaxError as exc:
            raise ArithmeticExecutionError(
                f"Invalid arithmetic syntax: {normalized}"
            ) from exc

        node_count = sum(1 for _ in ast.walk(syntax_tree))

        if node_count > self.MAX_AST_NODES:
            raise UnsafeExpressionError(
                "Expression is too structurally complex"
            )

        self._reject_forbidden_nodes(syntax_tree)

        value = self._evaluate_node(syntax_tree.body)
        self._check_result_size(value)

        if isinstance(value, bool):
            return ArithmeticResult(
                original_expression=original_expression,
                normalized_expression=normalized,
                result_type="boolean",
                exact_value=str(value),
                decimal_value=None,
                verified=value,
                explanation=(
                    f"The comparison evaluated deterministically to "
                    f"{value}."
                ),
            )

        exact_value = self._format_fraction(value)

        return ArithmeticResult(
            original_expression=original_expression,
            normalized_expression=normalized,
            result_type="number",
            exact_value=exact_value,
            decimal_value=float(value),
            verified=True,
            explanation=(
                f"The expression was calculated exactly as {exact_value}."
            ),
        )

    def verify_claim(self, claim: Claim) -> Claim:
        """Return an independently verified copy of an arithmetic claim."""

        verified_claim = copy.deepcopy(claim)

        if claim.claim_type not in {
            ClaimType.ARITHMETIC,
            ClaimType.ALGEBRAIC,
            ClaimType.LOGICAL,
        }:
            verified_claim.verification_status = (
                VerificationStatus.UNVERIFIED
            )
            verified_claim.confidence = 0.0
            verified_claim.explanation = (
                "This claim type requires a different verification engine."
            )
            return verified_claim

        try:
            result = self.evaluate(claim.text)
        except TruthCoreError as exc:
            verified_claim.verification_status = (
                VerificationStatus.UNVERIFIED
            )
            verified_claim.confidence = 0.0
            verified_claim.tool_used = "deterministic_truth_core"
            verified_claim.explanation = str(exc)
            return verified_claim

        verified_claim.tool_used = "deterministic_truth_core"
        verified_claim.evidence = [
            (
                f"{result.normalized_expression} "
                f"produced {result.exact_value}"
            )
        ]
        verified_claim.confidence = 1.0

        if result.result_type == "boolean":
            if result.verified:
                verified_claim.verification_status = (
                    VerificationStatus.VERIFIED
                )
                verified_claim.explanation = (
                    "The arithmetic proposition is true."
                )
            else:
                verified_claim.verification_status = (
                    VerificationStatus.CONTRADICTED
                )
                verified_claim.explanation = (
                    "The arithmetic proposition is false."
                )
        else:
            verified_claim.verification_status = (
                VerificationStatus.VERIFIED
            )
            verified_claim.explanation = result.explanation

        return verified_claim

    def verify_claims(self, claims: list[Claim]) -> list[Claim]:
        """Verify multiple claims independently."""

        return [self.verify_claim(claim) for claim in claims]

    def verify_query_expressions(
        self,
        query: NormalizedQuery,
    ) -> list[ArithmeticResult]:
        """Evaluate expressions extracted by the Primitive Compiler."""

        expressions = query.variables.get("expressions", [])

        if not isinstance(expressions, list):
            raise TruthCoreError(
                "NormalizedQuery expressions must be a list"
            )

        results: list[ArithmeticResult] = []

        for expression in expressions:
            if not isinstance(expression, str):
                continue

            results.append(self.evaluate(expression))

        return results

    def _normalize_expression(self, expression: str) -> str:
        """Convert mathematical language and Unicode into safe syntax."""

        normalized = expression.lower()
        normalized = normalized.replace("×", "*")
        normalized = normalized.replace("÷", "/")
        normalized = normalized.replace("−", "-")
        normalized = normalized.replace("–", "-")
        normalized = normalized.replace("^", "**")
        normalized = normalized.replace(",", "")

        for pattern, replacement in self.WORD_REPLACEMENTS:
            normalized = re.sub(pattern, replacement, normalized)

        normalized = re.sub(
            r"(?<![<>=!])=(?!=)",
            "==",
            normalized,
        )

        normalized = normalized.strip().rstrip("?.;:")

        if re.search(r"[a-z_]", normalized):
            fragments = re.findall(
                r"[-+*/%().<>=!\d\s]+",
                normalized,
            )

            candidates = [
                fragment.strip()
                for fragment in fragments
                if re.search(r"\d", fragment)
                and re.search(r"[+\-*/<>=!]", fragment)
            ]

            if candidates:
                normalized = max(candidates, key=len)

        normalized = re.sub(r"\s+", " ", normalized).strip()

        return normalized

    def _reject_forbidden_nodes(
        self,
        syntax_tree: ast.AST,
    ) -> None:
        """Reject every form of executable or non-arithmetic syntax."""

        forbidden_types = (
            ast.Call,
            ast.Name,
            ast.Attribute,
            ast.Subscript,
            ast.Lambda,
            ast.List,
            ast.Tuple,
            ast.Set,
            ast.Dict,
            ast.ListComp,
            ast.SetComp,
            ast.DictComp,
            ast.GeneratorExp,
            ast.IfExp,
            ast.NamedExpr,
            ast.JoinedStr,
            ast.FormattedValue,
        )

        for node in ast.walk(syntax_tree):
            if isinstance(node, forbidden_types):
                raise UnsafeExpressionError(
                    f"Forbidden syntax: {type(node).__name__}"
                )

            if isinstance(node, ast.Constant):
                if isinstance(node.value, bool):
                    raise UnsafeExpressionError(
                        "Boolean constants are not arithmetic inputs"
                    )

                if not isinstance(node.value, (int, float)):
                    raise UnsafeExpressionError(
                        "Only numerical constants are permitted"
                    )

    def _evaluate_node(
        self,
        node: ast.AST,
    ) -> Fraction | bool:
        """Recursively execute only approved AST node types."""

        if isinstance(node, ast.Constant):
            return self._number_to_fraction(node.value)

        if isinstance(node, ast.UnaryOp):
            operand = self._require_fraction(
                self._evaluate_node(node.operand)
            )

            if isinstance(node.op, ast.UAdd):
                return operand

            if isinstance(node.op, ast.USub):
                return -operand

            raise UnsafeExpressionError(
                f"Unsupported unary operator: "
                f"{type(node.op).__name__}"
            )

        if isinstance(node, ast.BinOp):
            left = self._require_fraction(
                self._evaluate_node(node.left)
            )
            right = self._require_fraction(
                self._evaluate_node(node.right)
            )

            result = self._apply_binary_operator(
                node.op,
                left,
                right,
            )
            self._check_result_size(result)
            return result

        if isinstance(node, ast.Compare):
            return self._evaluate_comparison(node)

        raise UnsafeExpressionError(
            f"Unsupported syntax node: {type(node).__name__}"
        )

    def _apply_binary_operator(
        self,
        operator: ast.operator,
        left: Fraction,
        right: Fraction,
    ) -> Fraction:
        """Execute one approved binary arithmetic operation."""

        if isinstance(operator, ast.Add):
            return left + right

        if isinstance(operator, ast.Sub):
            return left - right

        if isinstance(operator, ast.Mult):
            return left * right

        if isinstance(operator, ast.Div):
            if right == 0:
                raise ArithmeticExecutionError(
                    "Division by zero is undefined"
                )

            return left / right

        if isinstance(operator, ast.FloorDiv):
            if right == 0:
                raise ArithmeticExecutionError(
                    "Floor division by zero is undefined"
                )

            return Fraction(left // right, 1)

        if isinstance(operator, ast.Mod):
            if right == 0:
                raise ArithmeticExecutionError(
                    "Modulo by zero is undefined"
                )

            return left % right

        if isinstance(operator, ast.Pow):
            if right.denominator != 1:
                raise UnsafeExpressionError(
                    "Fractional exponents are not enabled"
                )

            exponent = right.numerator

            if abs(exponent) > self.MAX_POWER:
                raise UnsafeExpressionError(
                    f"Exponent exceeds safe limit of "
                    f"{self.MAX_POWER}"
                )

            if left == 0 and exponent < 0:
                raise ArithmeticExecutionError(
                    "Zero cannot have a negative exponent"
                )

            return left ** exponent

        raise UnsafeExpressionError(
            f"Unsupported binary operator: "
            f"{type(operator).__name__}"
        )

    def _evaluate_comparison(
        self,
        node: ast.Compare,
    ) -> bool:
        """Evaluate equality or ordered comparisons, including chains."""

        left = self._require_fraction(
            self._evaluate_node(node.left)
        )

        for operator, comparator_node in zip(
            node.ops,
            node.comparators,
            strict=True,
        ):
            right = self._require_fraction(
                self._evaluate_node(comparator_node)
            )

            if isinstance(operator, ast.Eq):
                comparison = left == right
            elif isinstance(operator, ast.NotEq):
                comparison = left != right
            elif isinstance(operator, ast.Lt):
                comparison = left < right
            elif isinstance(operator, ast.LtE):
                comparison = left <= right
            elif isinstance(operator, ast.Gt):
                comparison = left > right
            elif isinstance(operator, ast.GtE):
                comparison = left >= right
            else:
                raise UnsafeExpressionError(
                    f"Unsupported comparison operator: "
                    f"{type(operator).__name__}"
                )

            if not comparison:
                return False

            left = right

        return True

    def _number_to_fraction(
        self,
        value: int | float,
    ) -> Fraction:
        """Convert integers and decimals into exact rational values."""

        if isinstance(value, bool):
            raise UnsafeExpressionError(
                "Boolean values are not permitted"
            )

        if isinstance(value, int):
            fraction = Fraction(value, 1)
        elif isinstance(value, float):
            fraction = Fraction(str(value))
        else:
            raise UnsafeExpressionError(
                "Unsupported numerical constant"
            )

        self._check_result_size(fraction)
        return fraction

    def _check_result_size(
        self,
        value: Fraction | bool,
    ) -> None:
        """Prevent excessively large integer or rational results."""

        if isinstance(value, bool):
            return

        if (
            abs(value.numerator).bit_length() > self.MAX_NUMBER_BITS
            or value.denominator.bit_length() > self.MAX_NUMBER_BITS
        ):
            raise UnsafeExpressionError(
                "Numerical result exceeds the safe size limit"
            )

    @staticmethod
    def _require_fraction(
        value: Fraction | bool,
    ) -> Fraction:
        """Require a numerical intermediate result."""

        if isinstance(value, bool):
            raise ArithmeticExecutionError(
                "A comparison result cannot be used as a number"
            )

        return value

    @staticmethod
    def _format_fraction(value: Fraction) -> str:
        """Create an exact human-readable representation."""

        if value.denominator == 1:
            return str(value.numerator)

        return f"{value.numerator}/{value.denominator}"
