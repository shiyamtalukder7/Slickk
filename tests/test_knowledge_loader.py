import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from slickk_server import knowledge_base


class KnowledgeLoaderSafetyTests(unittest.TestCase):
    def write_json(
        self,
        path: Path,
        payload: dict,
    ) -> None:
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        path.write_text(
            json.dumps(
                payload,
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    def test_only_exact_runtime_overlay_is_loaded_from_imports(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            knowledge_directory = Path(directory)

            self.write_json(
                knowledge_directory / "normal_lesson.json",
                {
                    "documents": [
                        {
                            "id": "normal-lesson",
                            "title": "Normal lesson",
                        }
                    ]
                },
            )

            self.write_json(
                knowledge_directory
                / "_imports"
                / "raw-staging.json",
                {
                    "documents": [
                        {
                            "id": "raw-staging",
                            "title": "Unsafe raw staging",
                        }
                    ]
                },
            )

            self.write_json(
                knowledge_directory
                / "_imports"
                / "_machine_validated"
                / "textbook_teaching_overlay.json",
                {
                    "documents": [
                        {
                            "id": "original-overlay",
                            "title": "Original overlay",
                        }
                    ]
                },
            )

            self.write_json(
                knowledge_directory
                / "_imports"
                / "_machine_validated"
                / "textbook_teaching_overlay_clean.json",
                {
                    "documents": [
                        {
                            "id": "clean-intermediate",
                            "title": "Clean intermediate",
                        }
                    ]
                },
            )

            self.write_json(
                knowledge_directory
                / "_imports"
                / "_machine_validated"
                / "textbook_teaching_overlay_runtime.json",
                {
                    "format": (
                        "slickk-runtime-textbook-overlay-v1"
                    ),
                    "automatic_production_promotion": False,
                    "human_reviewed": False,
                    "documents": [
                        {
                            "id": "runtime-overlay",
                            "title": "Runtime overlay",
                        }
                    ],
                },
            )

            with patch.object(
                knowledge_base,
                "KNOWLEDGE_DIR",
                knowledge_directory,
            ):
                documents = knowledge_base.load_documents()

            document_ids = {
                document.get("id")
                for document in documents
            }

            self.assertEqual(
                document_ids,
                {
                    "normal-lesson",
                    "runtime-overlay",
                },
            )

            self.assertNotIn(
                "raw-staging",
                document_ids,
            )

            self.assertNotIn(
                "original-overlay",
                document_ids,
            )

            self.assertNotIn(
                "clean-intermediate",
                document_ids,
            )

    def test_runtime_overlay_fails_closed_for_invalid_metadata(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            knowledge_directory = Path(directory)

            runtime_path = (
                knowledge_directory
                / "_imports"
                / "_machine_validated"
                / "textbook_teaching_overlay_runtime.json"
            )

            self.write_json(
                runtime_path,
                {
                    "format": (
                        "slickk-runtime-textbook-overlay-v1"
                    ),
                    "automatic_production_promotion": True,
                    "human_reviewed": False,
                    "documents": [
                        {
                            "id": "unsafe-runtime-document",
                        }
                    ],
                },
            )

            with patch.object(
                knowledge_base,
                "KNOWLEDGE_DIR",
                knowledge_directory,
            ):
                documents = knowledge_base.load_documents()

            self.assertEqual(
                documents,
                [],
            )

    def test_duplicate_document_ids_are_loaded_once(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            knowledge_directory = Path(directory)

            self.write_json(
                knowledge_directory / "lesson-a.json",
                {
                    "documents": [
                        {
                            "id": "duplicate-id",
                            "title": "First copy",
                        }
                    ]
                },
            )

            self.write_json(
                knowledge_directory / "lesson-b.json",
                {
                    "documents": [
                        {
                            "id": "duplicate-id",
                            "title": "Second copy",
                        }
                    ]
                },
            )

            with patch.object(
                knowledge_base,
                "KNOWLEDGE_DIR",
                knowledge_directory,
            ):
                documents = knowledge_base.load_documents()

            matching = [
                document
                for document in documents
                if document.get("id") == "duplicate-id"
            ]

            self.assertEqual(
                len(matching),
                1,
            )


    def test_unapproved_root_knowledge_is_blocked(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            knowledge_directory = Path(directory)

            self.write_json(
                knowledge_directory / "draft-payload.json",
                {
                    "status": "needs_human_review",
                    "production_knowledge": False,
                    "documents": [
                        {
                            "id": "draft-payload-document",
                            "title": "Draft payload document",
                        }
                    ],
                },
            )

            self.write_json(
                knowledge_directory / "draft-document.json",
                {
                    "status": "approved",
                    "production_knowledge": True,
                    "documents": [
                        {
                            "id": "draft-review-document",
                            "title": "Draft review document",
                            "review": {
                                "status": "needs_human_review",
                            },
                        }
                    ],
                },
            )

            with patch.object(
                knowledge_base,
                "KNOWLEDGE_DIR",
                knowledge_directory,
            ):
                documents = knowledge_base.load_documents()

            document_ids = {
                document.get("id")
                for document in documents
            }

            self.assertNotIn(
                "draft-payload-document",
                document_ids,
            )
            self.assertNotIn(
                "draft-review-document",
                document_ids,
            )

    def test_approved_and_legacy_root_knowledge_loads(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            knowledge_directory = Path(directory)

            self.write_json(
                knowledge_directory / "approved.json",
                {
                    "status": "approved",
                    "production_knowledge": True,
                    "documents": [
                        {
                            "id": "approved-document",
                            "title": "Approved document",
                            "review": {
                                "status": "approved",
                            },
                        }
                    ],
                },
            )

            self.write_json(
                knowledge_directory / "legacy.json",
                {
                    "documents": [
                        {
                            "id": "legacy-document",
                            "title": "Legacy document",
                        }
                    ],
                },
            )

            with patch.object(
                knowledge_base,
                "KNOWLEDGE_DIR",
                knowledge_directory,
            ):
                documents = knowledge_base.load_documents()

            document_ids = {
                document.get("id")
                for document in documents
            }

            self.assertIn(
                "approved-document",
                document_ids,
            )
            self.assertIn(
                "legacy-document",
                document_ids,
            )



if __name__ == "__main__":
    unittest.main()
