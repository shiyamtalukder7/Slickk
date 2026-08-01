import json
import unittest
from pathlib import Path


CATALOG_PATH = (
    Path(__file__).resolve().parents[1]
    / "slickk_server"
    / "knowledge"
    / "textbook_catalog.json"
)


class TextbookCatalogTests(unittest.TestCase):
    def load_books(self) -> list[dict]:
        payload = json.loads(
            CATALOG_PATH.read_text(
                encoding="utf-8-sig"
            )
        )

        books = payload.get("books")

        self.assertIsInstance(books, list)
        return books

    def test_catalogue_has_44_unique_records(self) -> None:
        books = self.load_books()

        self.assertEqual(len(books), 44)

        identifiers = [
            str(book.get("id") or "")
            for book in books
        ]

        self.assertEqual(
            len(identifiers),
            len(set(identifiers)),
        )

    def test_titles_are_not_corrupted(self) -> None:
        books = self.load_books()

        for book in books:
            title = str(
                book.get("title") or ""
            )

            self.assertTrue(
                title.strip(),
                msg=str(book.get("id")),
            )
            self.assertNotIn(
                "?",
                title,
                msg=str(book.get("id")),
            )
            self.assertNotIn(
                "\ufffd",
                title,
                msg=str(book.get("id")),
            )

    def test_bangla_titles_contain_bengali_unicode(
        self,
    ) -> None:
        books = self.load_books()

        for book in books:
            if book.get("language") != "Bangla":
                continue

            title = str(book.get("title") or "")

            self.assertTrue(
                any(
                    0x0980 <= ord(character) <= 0x09FF
                    for character in title
                ),
                msg=(
                    f"{book.get('id')}: {ascii(title)}"
                ),
            )


if __name__ == "__main__":
    unittest.main()
