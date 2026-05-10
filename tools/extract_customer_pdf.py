"""Extract text from customer DTC PDF and save to UTF-8 file."""

from pathlib import Path

import pdfplumber

PDF = Path(r"C:\Projects\Diag\Customer_Diag\Customer_Diag.pdf")
OUT = Path(r"c:\Projects\artha-v4\tools\customer_pdf_text.txt")


def main() -> None:
    with pdfplumber.open(PDF) as pdf:
        pages = []
        for i, page in enumerate(pdf.pages):
            t = page.extract_text() or ""
            pages.append(f"=== Page {i + 1} ({len(t)} chars) ===\n{t}\n")
            tables = page.extract_tables() or []
            for ti, tab in enumerate(tables):
                pages.append(f"--- Page {i + 1} Table {ti + 1} ---")
                for row in tab:
                    pages.append(
                        "\t".join("" if c is None else str(c).replace("\n", " ") for c in row)
                    )
                pages.append("")
    OUT.write_text("\n".join(pages), encoding="utf-8")
    print(f"Wrote {OUT} | pages={len(pdf.pages) if False else 'see file'} size={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
