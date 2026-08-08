"""Universal Primitive Compiler for the Slickk AI Tutor.

The compiler converts natural-language student input into a structured,
machine-readable NormalizedQuery.

This first version is deliberately deterministic and dependency-free.
Future versions may add embeddings, curriculum classifiers, OCR, speech
processing, and trained intent models without changing the public interface.
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from typing import Any

from .schemas import NormalizedQuery


class PrimitiveCompilerError(ValueError):
    """Raised when an input cannot be compiled safely."""


class UniversalPrimitiveCompiler:
    """Convert student language into instructional and logical primitives."""

    SUBJECT_KEYWORDS: dict[str, set[str]] = {
        "Mathematics": {
            "calculate",
            "equation",
            "algebra",
            "geometry",
            "fraction",
            "decimal",
            "percentage",
            "percent",
            "divide",
            "division",
            "multiply",
            "multiplication",
            "subtract",
            "addition",
            "plus",
            "minus",
            "ratio",
            "probability",
            "integer",
            "quadratic",
            "derivative",
            "integral",
            "angle",
            "triangle",
            "circle",
        },
        "Biology": {
            "biology",
            "cell",
            "organism",
            "photosynthesis",
            "respiration",
            "genetics",
            "gene",
            "dna",
            "ecosystem",
            "enzyme",
            "plant",
            "animal",
            "tissue",
            "organ",
            "mitosis",
            "meiosis",
        },
        "Physics": {
            "physics",
            "force",
            "motion",
            "velocity",
            "speed",
            "acceleration",
            "energy",
            "power",
            "electricity",
            "current",
            "voltage",
            "resistance",
            "gravity",
            "momentum",
            "wave",
            "frequency",
        },
        "Chemistry": {
            "chemistry",
            "atom",
            "molecule",
            "element",
            "compound",
            "reaction",
            "acid",
            "base",
            "alkali",
            "bond",
            "periodic",
            "oxidation",
            "reduction",
            "mole",
        },
        "Computer Science": {
            "code",
            "coding",
            "program",
            "programming",
            "python",
            "javascript",
            "java",
            "algorithm",
            "database",
            "computer",
            "function",
            "variable",
            "loop",
            "array",
            "api",
        },
        "Economics": {
            "economics",
            "economy",
            "demand",
            "supply",
            "inflation",
            "market",
            "price",
            "gdp",
            "interest rate",
            "opportunity cost",
            "elasticity",
            "revenue",
            "cost",
            "profit",
        },
        "History": {
            "history",
            "historical",
            "war",
            "empire",
            "revolution",
            "independence",
            "civilization",
            "king",
            "queen",
            "president",
            "century",
            "ancient",
        },
        "Geography": {
            "geography",
            "country",
            "capital",
            "continent",
            "river",
            "mountain",
            "climate",
            "population",
            "map",
            "ocean",
            "latitude",
            "longitude",
        },
        "Literature": {
            "literature",
            "poem",
            "poetry",
            "novel",
            "story",
            "character",
            "theme",
            "metaphor",
            "simile",
            "author",
            "paragraph",
            "essay",
        },
    }

    TOPIC_RULES: dict[str, list[tuple[str, set[str]]]] = {
        "Mathematics": [
            (
                "Division",
                {"divide", "division", "divided", "/"},
            ),
            (
                "Multiplication",
                {"multiply", "multiplication", "multiplied", "*"},
            ),
            (
                "Fractions",
                {"fraction", "fractions"},
            ),
            (
                "Percentages",
                {"percentage", "percent", "%"},
            ),
            (
                "Algebra",
                {"algebra", "equation", "solve for", "quadratic"},
            ),
            (
                "Geometry",
                {"geometry", "angle", "triangle", "circle", "area", "perimeter"},
            ),
            (
                "Calculus",
                {"derivative", "differentiate", "integral", "integrate"},
            ),
            (
                "Probability",
                {"probability", "chance", "random"},
            ),
        ],
        "Biology": [
            (
                "Photosynthesis",
                {"photosynthesis", "chlorophyll", "chloroplast"},
            ),
            (
                "Cell Biology",
                {"cell", "nucleus", "membrane", "cytoplasm"},
            ),
            (
                "Respiration",
                {"respiration", "glucose", "aerobic", "anaerobic"},
            ),
            (
                "Genetics",
                {"genetics", "gene", "dna", "chromosome", "inheritance"},
            ),
            (
                "Ecology",
                {"ecosystem", "food chain", "habitat", "population"},
            ),
        ],
        "Physics": [
            (
                "Motion",
                {"motion", "speed", "velocity", "acceleration", "distance"},
            ),
            (
                "Forces",
                {"force", "gravity", "friction", "weight", "newton"},
            ),
            (
                "Electricity",
                {"electricity", "current", "voltage", "resistance", "circuit"},
            ),
            (
                "Energy",
                {"energy", "power", "work", "kinetic", "potential"},
            ),
            (
                "Waves",
                {"wave", "frequency", "wavelength", "amplitude"},
            ),
        ],
        "Chemistry": [
            (
                "Atomic Structure",
                {"atom", "proton", "neutron", "electron"},
            ),
            (
                "Chemical Reactions",
                {"reaction", "reactant", "product", "equation"},
            ),
            (
                "Acids and Bases",
                {"acid", "base", "alkali", "ph"},
            ),
            (
                "Chemical Bonding",
                {"bond", "ionic", "covalent", "metallic"},
            ),
        ],
        "Computer Science": [
            (
                "Programming Fundamentals",
                {"variable", "loop", "function", "array", "condition"},
            ),
            (
                "Algorithms",
                {"algorithm", "sorting", "searching", "complexity"},
            ),
            (
                "Databases",
                {"database", "sql", "table", "query"},
            ),
            (
                "Web Development",
                {"html", "css", "javascript", "api", "website"},
            ),
        ],
    }

    OPERATOR_REPLACEMENTS: tuple[tuple[str, str], ...] = (
        (r"\bdivided\s+by\b", "/"),
        (r"\bdivide\s+by\b", "/"),
        (r"\bmultiplied\s+by\b", "*"),
        (r"\bmultiply\s+by\b", "*"),
        (r"\btimes\b", "*"),
        (r"\bplus\b", "+"),
        (r"\bminus\b", "-"),
        (r"\bequals\b", "="),
        (r"\bequal\s+to\b", "="),
    )

    CONSTRAINT_PATTERNS: tuple[str, ...] = (
        r"\bat least\s+-?\d+(?:\.\d+)?",
        r"\bat most\s+-?\d+(?:\.\d+)?",
        r"\bmore than\s+-?\d+(?:\.\d+)?",
        r"\bless than\s+-?\d+(?:\.\d+)?",
        r"\bgreater than\s+-?\d+(?:\.\d+)?",
        r"\bno more than\s+-?\d+(?:\.\d+)?",
        r"\bno less than\s+-?\d+(?:\.\d+)?",
        r"\bmaximum(?:\s+of)?\s+-?\d+(?:\.\d+)?",
        r"\bminimum(?:\s+of)?\s+-?\d+(?:\.\d+)?",
        r"\bmust\b[^.!?]*",
        r"\bonly\b[^.!?]*",
        r"\bwithout\b[^.!?]*",
    )

    LANGUAGE_PATTERNS: dict[str, tuple[str, ...]] = {
        "Bangla": (
            r"\bin bangla\b",
            r"\bin bengali\b",
            r"\bbangla language\b",
        ),
        "English": (
            r"\bin english\b",
            r"\benglish language\b",
        ),
        "Hindi": (
            r"\bin hindi\b",
            r"\bhindi language\b",
        ),
        "Arabic": (
            r"\bin arabic\b",
            r"\barabic language\b",
        ),
        "French": (
            r"\bin french\b",
            r"\bfrench language\b",
        ),
        "Spanish": (
            r"\bin spanish\b",
            r"\bspanish language\b",
        ),
    }

    def compile(
        self,
        text: str,
        *,
        default_language: str = "English",
    ) -> NormalizedQuery:
        """Compile one student message into a NormalizedQuery.

        Args:
            text:
                Raw student message.
            default_language:
                Language used when the student does not explicitly request
                another language.

        Returns:
            A validated NormalizedQuery.

        Raises:
            PrimitiveCompilerError:
                If the input is empty or not textual.
        """

        if not isinstance(text, str):
            raise PrimitiveCompilerError("Student input must be text")

        original_text = text.strip()

        if not original_text:
            raise PrimitiveCompilerError("Student input cannot be empty")

        normalized_text = self._normalize_text(original_text)
        requested_language = self._detect_language(
            original_text,
            default_language=default_language,
        )

        subject = self._detect_subject(normalized_text)
        topic = self._detect_topic(normalized_text, subject)
        requires_calculation = self._requires_calculation(
            normalized_text,
            subject,
        )
        intent = self._detect_intent(
            normalized_text,
            requires_calculation=requires_calculation,
        )

        variables = self._extract_variables(normalized_text)
        constraints = self._extract_constraints(normalized_text)
        axioms = self._derive_axioms(normalized_text)
        requires_external_evidence = self._requires_external_evidence(
            normalized_text
        )
        requires_visual_explanation = self._requires_visual_explanation(
            normalized_text
        )

        required_tools = self._select_tools(
            subject=subject,
            topic=topic,
            normalized_text=normalized_text,
            constraints=constraints,
            requires_calculation=requires_calculation,
            requires_external_evidence=requires_external_evidence,
            requires_visual_explanation=requires_visual_explanation,
        )

        return NormalizedQuery(
            original_text=original_text,
            normalized_text=normalized_text,
            subject=subject,
            topic=topic,
            intent=intent,
            variables=variables,
            constraints=constraints,
            axioms=axioms,
            requested_language=requested_language,
            requires_calculation=requires_calculation,
            requires_external_evidence=requires_external_evidence,
            requires_visual_explanation=requires_visual_explanation,
            required_tools=required_tools,
        )

    def _normalize_text(self, text: str) -> str:
        """Normalize Unicode, spacing, operators, and letter casing."""

        normalized = unicodedata.normalize("NFKC", text)
        normalized = normalized.replace("×", "*")
        normalized = normalized.replace("÷", "/")
        normalized = normalized.replace("−", "-")
        normalized = normalized.replace("–", "-")
        normalized = normalized.lower()

        for pattern, replacement in self.OPERATOR_REPLACEMENTS:
            normalized = re.sub(pattern, replacement, normalized)

        normalized = re.sub(r"\s+", " ", normalized)
        normalized = re.sub(r"\s*([+\-*/=<>])\s*", r" \1 ", normalized)
        normalized = re.sub(r"\s+", " ", normalized)

        return normalized.strip()

    def _detect_language(
        self,
        original_text: str,
        *,
        default_language: str,
    ) -> str:
        """Detect an explicitly requested response language."""

        lowered = original_text.lower()

        for language, patterns in self.LANGUAGE_PATTERNS.items():
            if any(re.search(pattern, lowered) for pattern in patterns):
                return language

        if re.search(r"[\u0980-\u09FF]", original_text):
            return "Bangla"

        return default_language.strip() or "English"

    def _detect_subject(self, normalized_text: str) -> str:
        """Score keyword matches and select the most probable subject."""

        scores: defaultdict[str, int] = defaultdict(int)

        for subject, keywords in self.SUBJECT_KEYWORDS.items():
            for keyword in keywords:
                if self._contains_keyword(normalized_text, keyword):
                    scores[subject] += 1

        if self._contains_mathematical_expression(normalized_text):
            scores["Mathematics"] += 4

        if not scores:
            return "General Knowledge"

        return max(
            scores,
            key=lambda subject: (scores[subject], subject != "General Knowledge"),
        )

    def _detect_topic(self, normalized_text: str, subject: str) -> str:
        """Detect a subject-specific topic using ordered rules."""

        for topic, keywords in self.TOPIC_RULES.get(subject, []):
            if any(
                self._contains_keyword(normalized_text, keyword)
                for keyword in keywords
            ):
                return topic

        if subject == "History":
            return "Historical Study"

        if subject == "Geography":
            return "Geographical Study"

        if subject == "Economics":
            return "Economic Concepts"

        if subject == "Literature":
            return "Literary Analysis"

        if subject == "General Knowledge":
            return "General Inquiry"

        return f"General {subject}"

    def _detect_intent(
        self,
        normalized_text: str,
        *,
        requires_calculation: bool,
    ) -> str:
        """Determine the student's instructional goal."""

        if re.search(
            r"\b(check|verify|is my answer|am i correct|correct my)\b",
            normalized_text,
        ):
            return "verify_student_answer"

        if re.search(
            r"\b(quiz|test me|practice|give me questions|exercise)\b",
            normalized_text,
        ):
            return "practice_and_assess"

        if re.search(r"\b(compare|difference between|versus|vs)\b", normalized_text):
            return "compare_concepts"

        if re.search(r"\b(summarize|summary|short notes|revision notes)\b", normalized_text):
            return "summarize"

        if re.search(r"\btranslate\b", normalized_text):
            return "translate"

        if re.search(r"\b(draw|diagram|graph|visualize|show visually)\b", normalized_text):
            return "visual_explanation"

        if requires_calculation:
            return "solve_and_teach"

        if re.search(r"\b(why|how|explain|teach|what is|what are)\b", normalized_text):
            return "explain_concept"

        return "general_learning_request"

    def _extract_variables(self, normalized_text: str) -> dict[str, Any]:
        """Extract numbers, symbolic assignments, and expressions."""

        variables: dict[str, Any] = {}

        number_tokens = re.findall(
            r"(?<![\w.])-?\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)?",
            normalized_text,
        )

        parsed_numbers: list[int | float | str] = []

        for token in number_tokens:
            if "/" in token:
                parsed_numbers.append(token)
            elif "." in token:
                parsed_numbers.append(float(token))
            else:
                parsed_numbers.append(int(token))

        if parsed_numbers:
            variables["numbers"] = parsed_numbers

        assignments = re.findall(
            r"\b([a-z])\s*=\s*(-?\d+(?:\.\d+)?)\b",
            normalized_text,
        )

        if assignments:
            variables["assignments"] = {
                name: float(value) if "." in value else int(value)
                for name, value in assignments
            }

        expressions = self._extract_expressions(
            normalized_text
        )

        if expressions:
            variables["expressions"] = expressions

        unknowns = sorted(
            {
                symbol
                for symbol in re.findall(r"\b[a-z]\b", normalized_text)
                if symbol not in {"a", "i"}
            }
        )

        assigned_names = set(variables.get("assignments", {}).keys())
        unassigned_unknowns = [
            symbol for symbol in unknowns if symbol not in assigned_names
        ]

        if unassigned_unknowns:
            variables["unknown_symbols"] = unassigned_unknowns

        operations: list[str] = []

        operator_names = {
            "+": "addition",
            "-": "subtraction",
            "*": "multiplication",
            "/": "division",
            "=": "equality",
            ">": "greater_than",
            "<": "less_than",
        }

        for operator, operation_name in operator_names.items():
            if operator in normalized_text:
                operations.append(operation_name)

        if operations:
            variables["operations"] = operations

        return variables

    def _extract_expressions(
        self,
        normalized_text: str,
    ) -> list[str]:
        """Extract complete mathematical spans, including parentheses.

        Examples preserved as single expressions:

        12 / 3
        x + 5 = 12
        (5 + 3) * 2

        This parser intentionally accepts only simple numerical or
        one-letter symbolic atoms at this stage. More advanced algebra
        will later be delegated to the symbolic mathematics engine.
        """

        atom = r"(?:-?\d+(?:\.\d+)?|[a-z])"

        grouped_atom = (
            rf"(?:{atom}|"
            rf"\(\s*{atom}"
            rf"(?:\s*[+\-*/]\s*{atom})+"
            rf"\s*\))"
        )

        expression_pattern = re.compile(
            rf"(?<!\w){grouped_atom}"
            rf"(?:"
            rf"\s*(?:==|!=|<=|>=|[+\-*/=<>])\s*"
            rf"{grouped_atom}"
            rf")+"
            rf"(?!\w)"
        )

        expressions: list[str] = []

        for match in expression_pattern.finditer(normalized_text):
            expression = re.sub(
                r"\s+",
                " ",
                match.group(0),
            ).strip()

            if expression and expression not in expressions:
                expressions.append(expression)

        return expressions

    def _extract_constraints(self, normalized_text: str) -> list[str]:
        """Extract explicit numerical and linguistic restrictions."""

        constraints: list[str] = []

        for pattern in self.CONSTRAINT_PATTERNS:
            for match in re.findall(pattern, normalized_text):
                cleaned = re.sub(r"\s+", " ", match).strip()

                if cleaned and cleaned not in constraints:
                    constraints.append(cleaned)

        symbolic_constraints = re.findall(
            r"(?:[a-z]|\d+(?:\.\d+)?)\s*(?:<=|>=|<|>)\s*"
            r"(?:[a-z]|\d+(?:\.\d+)?)",
            normalized_text,
        )

        for constraint in symbolic_constraints:
            cleaned = re.sub(r"\s+", " ", constraint).strip()

            if cleaned not in constraints:
                constraints.append(cleaned)

        return constraints

    def _derive_axioms(self, normalized_text: str) -> list[str]:
        """Add safe formal rules required to reason about the query."""

        axioms: list[str] = []

        if "/" in normalized_text:
            axioms.append("division_by_zero_is_undefined")

        arithmetic_operators = {
            operator
            for operator in ("+", "-", "*", "/")
            if operator in normalized_text
        }

        if len(arithmetic_operators) > 1:
            axioms.append("standard_order_of_operations")

        if "=" in normalized_text and re.search(r"\b[a-z]\b", normalized_text):
            axioms.append(
                "equivalent_operations_preserve_equation_equality"
            )

        if any(
            symbol in normalized_text
            for symbol in ("<", ">", "<=", ">=")
        ):
            axioms.append("inequality_ordering_rules_apply")

        return axioms

    def _requires_calculation(
        self,
        normalized_text: str,
        subject: str,
    ) -> bool:
        """Determine whether deterministic numerical execution is needed."""

        calculation_words = (
            "calculate",
            "solve",
            "work out",
            "find the value",
            "how much",
            "how many",
        )

        if any(word in normalized_text for word in calculation_words):
            return True

        if self._contains_mathematical_expression(normalized_text):
            return True

        if subject == "Mathematics" and re.search(r"\d", normalized_text):
            return True

        return False

    def _requires_external_evidence(self, normalized_text: str) -> bool:
        """Detect questions requiring trusted retrieval or citations."""

        evidence_patterns = (
            r"\bcurrent\b",
            r"\blatest\b",
            r"\btoday\b",
            r"\baccording to\b",
            r"\bsource\b",
            r"\bcitation\b",
            r"\bevidence\b",
            r"\bwho (is|was|invented|discovered)\b",
            r"\bwhen did\b",
            r"\bwhere is\b",
        )

        return any(
            re.search(pattern, normalized_text)
            for pattern in evidence_patterns
        )

    def _requires_visual_explanation(self, normalized_text: str) -> bool:
        """Detect requests that benefit from a generated visual."""

        return bool(
            re.search(
                r"\b(draw|diagram|graph|chart|visualize|visual|picture|map)\b",
                normalized_text,
            )
        )

    def _select_tools(
        self,
        *,
        subject: str,
        topic: str,
        normalized_text: str,
        constraints: list[str],
        requires_calculation: bool,
        requires_external_evidence: bool,
        requires_visual_explanation: bool,
    ) -> list[str]:
        """Select deterministic tools needed by later brain modules."""

        tools: list[str] = []

        if requires_calculation:
            tools.append("calculator")

        if subject == "Mathematics" and topic in {
            "Algebra",
            "Calculus",
            "Geometry",
        }:
            tools.append("sympy")

        logical_markers = (
            "if",
            "then",
            "must",
            "constraint",
            "possible",
            "impossible",
            "satisfy",
        )

        if constraints or any(
            re.search(rf"\b{marker}\b", normalized_text)
            for marker in logical_markers
        ):
            tools.append("z3")

        if requires_external_evidence:
            tools.append("trusted_retrieval")
            tools.append("citation_validator")

        if requires_visual_explanation:
            tools.append("diagram_renderer")

        tools.append("response_auditor")

        return list(dict.fromkeys(tools))

    def _contains_mathematical_expression(self, text: str) -> bool:
        """Return True when text contains a basic symbolic expression."""

        return bool(
            re.search(
                r"(?:\d+(?:\.\d+)?|[a-z])"
                r"\s*[+\-*/=<>]\s*"
                r"(?:\d+(?:\.\d+)?|[a-z])",
                text,
            )
        )

    def _contains_keyword(self, text: str, keyword: str) -> bool:
        """Match keywords and common English plural forms safely.

        Exact phrase matching is preserved for multi-word concepts.
        Single words also support common plural forms such as:

        reaction -> reactions
        class -> classes
        city -> cities
        """

        if keyword in {"+", "-", "*", "/", "%"}:
            return keyword in text

        variants = {keyword}

        if " " not in keyword and keyword.isalpha():
            lowered = keyword.lower()

            if (
                lowered.endswith("y")
                and len(lowered) > 1
                and lowered[-2] not in "aeiou"
            ):
                variants.add(keyword[:-1] + "ies")

            elif lowered.endswith(
                ("s", "x", "z", "ch", "sh")
            ):
                variants.add(keyword + "es")

            else:
                variants.add(keyword + "s")

        escaped_variants = sorted(
            (re.escape(value) for value in variants),
            key=len,
            reverse=True,
        )

        pattern = (
            rf"(?<!\w)(?:{'|'.join(escaped_variants)})(?!\w)"
        )

        return bool(re.search(pattern, text))
