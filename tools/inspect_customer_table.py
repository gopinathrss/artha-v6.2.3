"""Inspect raw customer PDF tables on the DTC pages."""
from __future__ import annotations

import sys
import io
from pathlib import Path

import pdfplumber

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

PDF = Path(r"C:\Projects\Diag\Customer_Diag\Customer_Diag.pdf")
OUT = Path(r"c:\Projects\artha-v4\tools\customer_table_dump.txt")


def main() -> None:
    parts: list[str] = []
    with pdfplumber.open(PDF) as pdf:
        for pi in range(25, 60):  # DTC pages
            page = pdf.pages[pi - 1]
            tabs = page.extract_tables() or []
            for ti, tab in enumerate(tabs):
                if not tab:
                    continue
                parts.append(f"=== Page {pi} Table {ti + 1}: {len(tab)} rows x {len(tab[0])} cols ===")
                for r in tab:
                    parts.append(" | ".join((c or "").replace("\n", " ").strip()[:50] for c in r))
                parts.append("")
    OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {OUT} | {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
