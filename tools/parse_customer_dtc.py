"""Parse the customer-approved DTC table from Customer_Diag.pdf.

The customer table appears across pages 25-34 with this column layout:
 # | Fault Description (Chinese + English) | SPN | FMI | DTC Code | Fault Display | Repair Guide | Fault Level | 5000 | 6000

Output: tools/customer_dtc_table.json
"""

from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

import pdfplumber

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

PDF = Path(r"C:\Projects\Diag\Customer_Diag\Customer_Diag.pdf")
OUT = Path(r"c:\Projects\artha-v4\tools\customer_dtc_table.json")

DTC_RE = re.compile(r"^([PU])\s*1A\s*0?1\s*([0-9A-Fa-f]{2})\b")


def normalize_dtc(s: str) -> str:
    if not s:
        return ""
    m = DTC_RE.match(s.strip())
    if not m:
        return ""
    return f"{m.group(1)}1A 01 {m.group(2).upper()}"


def parse_fault_level(raw: str) -> tuple[str, str]:
    """Customer column sometimes shows 'A/3' or 'B/2' meaning Level 3=A, Level 2=B.

    Returns (severity_letter, level_number). Either may be empty.
    """
    if not raw:
        return ("", "")
    s = raw.strip().replace(" ", "")
    m = re.match(r"^([ABCD])(?:[/\\\-]?(\d))?$", s)
    if m:
        return (m.group(1), m.group(2) or "")
    m = re.match(r"^(\d)[/\\\-]?([ABCD])$", s)
    if m:
        return (m.group(2), m.group(1))
    if s in ("A", "B", "C", "D"):
        return (s, "")
    return ("", "")


def split_zh_en(desc: str) -> tuple[str, str]:
    if not desc:
        return ("", "")
    desc = desc.replace("\n", " ").strip()
    m = re.search(r"[A-Za-z][A-Za-z0-9 ,./()'\-]+", desc)
    if not m:
        return (desc, "")
    en = m.group(0).strip()
    zh = (desc[: m.start()] + desc[m.end() :]).strip()
    return (zh, en)


def main() -> None:
    table: dict[str, dict] = {}
    with pdfplumber.open(PDF) as pdf:
        for pi in range(20, 60):
            if pi - 1 >= len(pdf.pages):
                break
            page = pdf.pages[pi - 1]
            tabs = page.extract_tables() or []
            for tab in tabs:
                if not tab or not tab[0]:
                    continue
                # Customer DTC table has exactly 10 columns
                if len(tab[0]) != 10:
                    continue
                for row in tab:
                    if not row or len(row) != 10:
                        continue
                    dtc_raw = (row[4] or "").strip()
                    dtc = normalize_dtc(dtc_raw)
                    if not dtc:
                        continue
                    desc = (row[1] or "").strip()
                    spn = (row[2] or "").strip()
                    fmi = (row[3] or "").strip()
                    fl_raw = (row[7] or "").strip()
                    sev, lvl = parse_fault_level(fl_raw)
                    zh, en = split_zh_en(desc)
                    rec = {
                        "dtc": dtc,
                        "spn": spn,
                        "fmi": fmi,
                        "fault_level_raw": fl_raw,
                        "severity": sev,
                        "level": lvl,
                        "name_en": en,
                        "name_zh": zh,
                        "page": pi,
                    }
                    if dtc not in table:
                        table[dtc] = rec
    OUT.write_text(json.dumps(table, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} | {len(table)} unique customer DTCs")
    # show summary
    for k in sorted(table.keys()):
        v = table[k]
        print(f"  {k} SPN={v['spn']:<7} FMI={v['fmi']:<3} FL={v['fault_level_raw']:<5} | {v['name_en'][:60]}")


if __name__ == "__main__":
    main()
