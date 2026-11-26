#!/usr/bin/env python3
"""Generate a thesis-ready Word document describing the HireGen database schema.

Source of truth: packages/api/database/schema/*.sql (declarative schema) plus
the incremental migration files. Run from anywhere:

    python Doccumentation/build_db_schema_doc.py

Output: Doccumentation/HireGen_Database_Schema.docx
"""

from __future__ import annotations

import re
from collections import OrderedDict
from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "packages" / "api" / "database" / "schema"
OUTPUT = Path(__file__).resolve().parent / "HireGen_Database_Schema.docx"


def clean(text: str) -> str:
    text = text.replace("\ufffd", " ").replace("\u00ad", "")
    return re.sub(r"\s+", " ", text).strip()


def read_sql_files(folder: str) -> list[Path]:
    path = SCHEMA / folder
    return sorted(path.glob("*.sql")) if path.exists() else []


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

CREATE_TABLE = re.compile(r"CREATE TABLE (?:IF NOT EXISTS )?([\w\"]+)\s*\(", re.I)
REFS = re.compile(
    r"REFERENCES\s+([\w\"]+)\s*\(\s*([\w\"]+)\s*\)\s*(?:ON DELETE\s+(SET NULL|CASCADE|RESTRICT|NO ACTION))?",
    re.I,
)
ADD_COLUMN = re.compile(
    r"ALTER TABLE\s+([\w\"]+)\s+ADD COLUMN (?:IF NOT EXISTS )?([\w\"]+)\s+([^,]+)", re.I
)
CREATE_INDEX = re.compile(
    r"CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)"
    r"(?:\s+USING\s+(\w+))?\s*\((.+?)\)",
    re.I,
)


def split_definitions(lines: list[str]) -> list[tuple[str, str]]:
    """Split a CREATE TABLE body into (definition, inline/pending comment)."""
    definitions: list[tuple[str, str]] = []
    buffer: list[str] = []
    pending_comments: list[str] = []
    depth = 0
    for raw in lines:
        stripped = raw.strip()
        if stripped.startswith("--"):
            pending_comments.append(clean(stripped.lstrip("-")))
            continue
        code = raw.split("--")[0]
        depth += code.count("(") - code.count(")")
        buffer.append(stripped)
        if depth <= 0:
            definition = clean(" ".join(buffer).rstrip(",").strip())
            if definition:
                definitions.append((definition, " ".join(pending_comments)))
            buffer, depth, pending_comments = [], 0, []
    if buffer:
        definitions.append((clean(" ".join(buffer).rstrip(", ")), " ".join(pending_comments)))
    return definitions


def parse_tables() -> "OrderedDict[str, dict]":
    tables: "OrderedDict[str, dict]" = OrderedDict()

    for file in read_sql_files("tables"):
        text = file.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        i = 0
        while i < len(lines):
            match = CREATE_TABLE.search(lines[i])
            if not match:
                i += 1
                continue
            name = match.group(1).strip('"')
            body: list[str] = []
            depth = lines[i].count("(") - lines[i].count(")")
            i += 1
            while i < len(lines) and depth > 0:
                line = lines[i]
                depth += line.split("--")[0].count("(") - line.split("--")[0].count(")")
                if depth > 0 or line.strip().startswith(")"):
                    body.append(line)
                i += 1
            table = tables.setdefault(name, {"columns": OrderedDict(), "constraints": [], "source": file.name})
            for definition, comment in split_definitions(body):
                upper = definition.upper()
                if upper.startswith(("CONSTRAINT ", "PRIMARY KEY", "UNIQUE", "CHECK", "FOREIGN KEY")):
                    table["constraints"].append(definition)
                    continue
                col_match = re.match(r'^(?:"?([\w]+)"?)\s+(.+)$', definition)
                if not col_match:
                    continue
                column, rest = col_match.group(1), col_match.group(2)
                type_match = re.match(r"^(\w+(?:\([^)]*\))?(?:\[\])?)", rest)
                datatype = type_match.group(1) if type_match else rest.split()[0]
                modifiers = rest[len(datatype):].strip()
                table["columns"][column] = {
                    "type": datatype,
                    "modifiers": modifiers,
                    "comment": comment,
                    "source": file.name,
                }

    # ALTER TABLE ... ADD COLUMN statements can extend a table declared in a
    # different file (e.g. the candidate platform layer extends job_postings).
    for file in read_sql_files("tables"):
        joined = clean(file.read_text(encoding="utf-8", errors="replace"))
        for add in ADD_COLUMN.finditer(joined):
            target = add.group(1).strip('"')
            column, rest = add.group(2).strip('"'), clean(add.group(3))
            if target not in tables:
                continue
            type_match = re.match(r"^(\w+(?:\([^)]*\))?(?:\[\])?)", rest)
            datatype = type_match.group(1) if type_match else rest.split()[0]
            tables[target]["columns"][column] = {
                "type": datatype,
                "modifiers": clean(rest[len(datatype):]),
                "comment": "",
                "source": file.name,
            }

    return tables


def parse_constraints() -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for file in read_sql_files("constraints"):
        text = clean(file.read_text(encoding="utf-8", errors="replace"))
        for match in re.finditer(
            r"ALTER TABLE ([\w\"]+) ADD CONSTRAINT ([\w\"]+) (.+?)(?=;|EXCEPTION|$)",
            text,
            re.I,
        ):
            rows.append((match.group(1).strip('"'), match.group(2).strip('"'), clean(match.group(3))))
    return rows


def parse_indexes() -> list[tuple[str, str, str, bool]]:
    rows: list[tuple[str, str, str, bool]] = []
    files = read_sql_files("indexes") + read_sql_files("tables")
    for file in files:
        for line in file.read_text(encoding="utf-8", errors="replace").splitlines():
            match = CREATE_INDEX.search(line.split("--")[0])
            if not match:
                continue
            unique, index, table, _using, cols = match.groups()
            rows.append((index, table.strip('"'), clean(cols), bool(unique)))
    # de-duplicate by index name
    seen, result = set(), []
    for row in rows:
        if row[0] not in seen:
            seen.add(row[0])
            result.append(row)
    return result


# ---------------------------------------------------------------------------
# Description heuristics
# ---------------------------------------------------------------------------

DESCRIPTIONS = {
    "id": "Surrogate primary key generated with gen_random_uuid().",
    "created_at": "Record creation timestamp (server time).",
    "updated_at": "Timestamp of the last change to this row.",
    "user_id": "User who owns or performed this record; foreign key to users.",
    "email": "Login email address, stored case-insensitively and unique.",
    "password_hash": "BCrypt password hash. Plaintext passwords are never stored.",
    "role": "Security role: admin, sales_rep, viewer, candidate or user.",
    "api_keys": "Encrypted third-party credentials (AES-256-GCM).",
    "company_id": "Reference to the company this record belongs to.",
    "hr_contact_id": "Reference to the associated HR contact, when known.",
    "job_posting_id": "Reference to the job posting this record relates to.",
    "lead_id": "Reference to the lead this event or draft belongs to.",
    "status": "Current lifecycle state of the record.",
    "source": "Origin system or actor that created the record.",
    "payload": "Structured JSON content produced by the application.",
    "notes": "Free-text operator notes.",
    "reason": "Human-readable explanation for an action or state.",
    "model": "Provider or template model that produced this content.",
    "score": "Numeric score assigned by grading or matching.",
    "verdict": "Short textual verdict for a completed interview.",
    "summary": "Plain-text summary of an interview round.",
    "answer": "Candidate's typed or dictated answer, retained for admin review.",
    "question": "Interviewer question text, in proper English.",
    "topic": "Short topic label used to avoid repeated questions.",
    "idx": "Zero-based question position within an interview session.",
    "category": "Question category: intro, technical, project, behavioural, case or follow-up.",
    "ideal_points": "JSON array of points a strong answer should cover.",
    "interviewer_reply": "In-character spoken reaction to the candidate's answer.",
    "feedback": "Structured JSON grade with score, strengths and improvements.",
    "difficulty": "Interview intensity: calm, standard or brutal.",
    "question_count": "Target number of questions in the round.",
    "avatar_id": "Identifier of the selected interviewer avatar.",
    "opening_line": "Persona-specific greeting replayed when the session is reopened.",
    "answered_at": "Timestamp when the candidate submitted this answer.",
    "overall_score": "Mean grade for the completed interview round.",
    "title": "Display name or job title.",
    "description": "Text description of the entity.",
    "name": "Human-readable name.",
    "domain": "Company web domain used for deduplication and verification.",
    "company": "Company name captured with the interview context.",
    "url": "Source web address.",
    "value": "JSONB configuration value.",
}


def describe(column: str, meta: dict, table_name: str) -> str:
    comment = meta.get("comment", "")
    if comment and "\ufffd" not in comment:
        return comment
    lower = column.lower()
    if lower in DESCRIPTIONS:
        return DESCRIPTIONS[lower]
    reference = REFS.search(meta.get("modifiers", ""))
    if lower.endswith("_id") or reference:
        if reference:
            return f"Foreign key to {reference.group(1)}({reference.group(2)})." + (
                f" ON DELETE {reference.group(3)}." if reference.group(3) else ""
            )
        return "Identifier reference to a related entity."
    if lower.endswith("_at"):
        return "Timestamp for " + lower[:-3].replace("_", " ") + "."
    if lower.endswith("_score"):
        return "Normalized score used for ranking or evaluation."
    if lower.endswith("_status"):
        return "State of the " + lower[:-7].replace("_", " ") + " workflow."
    if lower.startswith("is_") or lower.startswith("has_"):
        return "Boolean flag indicating " + lower.replace("_", " ") + "."
    if meta.get("type", "").startswith("JSONB"):
        return "Structured JSON data (validated by the application layer)."
    if meta.get("type", "").startswith(("TEXT[]",)):
        return "Array of text values used for matching or filtering."
    return lower.replace("_", " ").capitalize() + "."


def key_info(column: str, meta: dict, table: dict) -> str:
    modifiers = meta.get("modifiers", "")
    bits: list[str] = []
    if modifiers.upper().find("PRIMARY KEY") >= 0 or any(
        c.upper().startswith("PRIMARY KEY") and column in c for c in table["constraints"]
    ):
        bits.append("PK")
    reference = REFS.search(modifiers)
    if reference:
        bits.append(f"FK → {reference.group(1)}({reference.group(2)})")
        if reference.group(3):
            bits.append(f"ON DELETE {reference.group(3)}")
    if re.search(r"\bUNIQUE\b", modifiers, re.I):
        bits.append("UNIQUE")
    if "GENERATED ALWAYS AS" in modifiers.upper():
        bits.append("GENERATED")
    if column.endswith("_id") and not bits:
        bits.append("FK")
    return " · ".join(bits) if bits else "—"


def null_default(meta: dict, is_pk: bool = False) -> str:
    modifiers = meta.get("modifiers", "")
    parts = []
    if is_pk or re.search(r"\bNOT NULL\b", modifiers, re.I):
        parts.append("NOT NULL")
    else:
        parts.append("nullable")
    default = re.search(r"DEFAULT\s+((?:'[^']*'|\(?[^,)]*\)?))", modifiers, re.I)
    if default:
        value = clean(default.group(1))
        if len(value) > 28:
            value = value[:25] + "..."
        parts.append(f"default {value}")
    if "GENERATED ALWAYS AS" in modifiers.upper():
        parts.append("computed")
    return " · ".join(parts)


# ---------------------------------------------------------------------------
# Word document helpers
# ---------------------------------------------------------------------------

BLUE = RGBColor(0x1F, 0x3A, 0x5F)
LIGHT = "DCE6F1"


def shade(cell, color: str = LIGHT) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), color)
    tc_pr.append(shd)


def repeat_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:tblHeader")
    el.set(qn("w:val"), "true")
    tr_pr.append(el)


def add_page_number(paragraph) -> None:
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr)
    run._r.append(fld_char2)


def table(doc, headers: list[str], rows: list[list[str]], widths: list[float] | None = None):
    tbl = doc.add_table(rows=1, cols=len(headers))
    tbl.style = "Table Grid"
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = tbl.rows[0]
    repeat_header(hdr)
    for index, label in enumerate(headers):
        cell = hdr.cells[index]
        cell.text = label
        shade(cell)
        for paragraph in cell.paragraphs:
            for run in paragraph.runs:
                run.bold = True
                run.font.size = Pt(8.5)
    for row_values in rows:
        cells = tbl.add_row().cells
        for index, value in enumerate(row_values):
            cells[index].text = str(value)
            for paragraph in cells[index].paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(8.5)
    if widths:
        for row in tbl.rows:
            for index, width in enumerate(widths):
                row.cells[index].width = Inches(width)
    doc.add_paragraph()
    return tbl


def setup_styles(doc: Document) -> None:
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10)
    for name, size in (("Title", 26), ("Heading 1", 15), ("Heading 2", 12), ("Heading 3", 10.5)):
        style = doc.styles[name]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.color.rgb = BLUE


def build() -> None:
    tables = parse_tables()
    constraints = parse_constraints()
    indexes = parse_indexes()

    # Include CHECK/UNIQUE rules declared inline inside CREATE TABLE bodies.
    seen_constraints = {(table, name) for table, name, _ in constraints}
    for table_name, table_data in tables.items():
        for rule in table_data["constraints"]:
            named = re.match(r"CONSTRAINT\s+([\w\"]+)", rule, re.I)
            label = named.group(1).strip('"') if named else "table rule"
            if (table_name, label) not in seen_constraints:
                constraints.append((table_name, label, rule))
                seen_constraints.add((table_name, label))

    doc = Document()
    setup_styles(doc)
    section = doc.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.6)
    section.right_margin = Inches(0.6)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run("HireGen · Database Schema · Page ")
    add_page_number(footer)

    # Title page
    doc.add_paragraph()
    title = doc.add_paragraph(style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.add_run("HireGen — Database Schema")
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.add_run("PostgreSQL relational design for job intelligence, candidate career tools,\nAI interview practice and administrative governance").italic = True

    doc.add_paragraph()
    table(doc, ["Document detail", "Value"], [
        ["Project", "HireGen — Job Intelligence & Application Platform"],
        ["Database", "PostgreSQL 16 (leads_db)"],
        ["Source of truth", "packages/api/database/schema/*.sql and database/migrations/*.ts"],
        ["Generated", date.today().isoformat()],
        ["Tables documented", str(len(tables))],
        ["Foreign-key relationships", str(sum(1 for t in tables.values() for c in t["columns"].values() if REFS.search(c["modifiers"])))],
        ["Indexes documented", str(len(indexes))],
    ], widths=[2.0, 4.5])

    doc.add_paragraph("This document is generated directly from the project's SQL schema files; it can be regenerated after schema changes with build_db_schema_doc.py.", style="Intense Quote")

    doc.add_page_break()

    # 1. Design overview
    doc.add_heading("1. Schema design overview", level=1)
    for line in [
        "The database is organised into four connected layers: (a) recruitment lead intelligence, (b) candidate job discovery and application tracking, (c) AI interview practice with adaptive questions and learning tracks, and (d) administrative configuration, credits, engagement and AI usage governance.",
        "Primary keys are UUIDs generated by pgcrypto. Timestamps use TIMESTAMPTZ and default to server time. Structured provider output and audit metadata are stored in JSONB columns so the relational layer stays stable while product features evolve.",
        "Referential actions are explicit: child records normally cascade when their parent is removed, while audit, attribution and optional associations use ON DELETE SET NULL to preserve history. Constraint checks encode lifecycle states and score ranges inside the database rather than relying only on application code.",
        "Candidate answers and interviewer questions are persisted in interview_questions, so an administrator can review every answer even when the Gemini provider is unavailable or disabled. Webcam snapshots are never stored — only the written presentation review is.",
    ]:
        doc.add_paragraph(line)

    doc.add_heading("1.1 Table inventory", level=2)
    inventory_rows = []
    for name, table_data in tables.items():
        fk_count = sum(1 for c in table_data["columns"].values() if REFS.search(c["modifiers"]))
        pk = "composite" if any(c.upper().startswith("PRIMARY KEY") for c in table_data["constraints"]) else next(
            (c for c, m in table_data["columns"].items() if "PRIMARY KEY" in m["modifiers"].upper()), "—"
        )
        inventory_rows.append([name, str(len(table_data["columns"])), pk, str(fk_count), table_data["source"]])
    table(doc, ["Table", "Columns", "Primary key", "FKs", "Schema file"], inventory_rows, widths=[2.1, 0.8, 1.5, 0.5, 1.6])

    doc.add_heading("1.2 Logical grouping", level=2)
    groups = OrderedDict([
        ("Recruitment lead intelligence", ["companies", "hr_contacts", "users", "job_postings", "leads", "enrichment_log", "verification_log", "outreach_drafts", "outreach_log", "scrape_runs", "source_health", "suppressions", "outreach_tokens"]),
        ("Administration and audit", ["audit_log", "settings", "daily_runs", "plan_catalog", "candidate_subscriptions", "credit_wallets", "credit_ledger", "ai_usage_events"]),
        ("Candidate platform", ["job_sources", "candidate_profiles", "job_recommendations", "applications", "application_events", "application_documents", "job_verifications", "candidate_feedback", "placement_outcomes", "onboarding_progress", "preparation_artifacts"]),
        ("AI interview practice", ["practice_subscriptions", "practice_upgrade_requests", "interview_sessions", "interview_questions", "learning_tracks", "learning_module_progress"]),
    ])
    for label, names in groups.items():
        paragraph = doc.add_paragraph()
        paragraph.add_run(f"{label}: ").bold = True
        paragraph.add_run(", ".join(name for name in names if name in tables))

    doc.add_page_break()

    # 2. Relationships
    doc.add_heading("2. Entity relationships", level=1)
    doc.add_paragraph("All foreign keys declared in the schema are listed below. They form the backbone of the entity–relationship model used in this project.")
    relation_rows = []
    for table_name, table_data in tables.items():
        for column, meta in table_data["columns"].items():
            reference = REFS.search(meta.get("modifiers", ""))
            if not reference:
                continue
            relation_rows.append([
                table_name,
                column,
                f"{reference.group(1)}.{reference.group(2)}",
                reference.group(3) or "restrict",
            ])
    table(doc, ["Child table", "Child column", "Parent table.column", "On delete"], relation_rows,
          widths=[2.0, 1.8, 2.0, 0.9])

    doc.add_page_break()

    # 3. Detailed definitions
    doc.add_heading("3. Table definitions", level=1)
    for number, (name, table_data) in enumerate(tables.items(), start=1):
        doc.add_heading(f"3.{number} {name}", level=2)
        doc.add_paragraph(f"Defined in {table_data['source']} · {len(table_data['columns'])} columns", style="Caption")
        rows = []
        for column, meta in table_data["columns"].items():
            rows.append([
                column,
                meta["type"],
                null_default(meta, "PK" in key_info(column, meta, table_data).split(" · ")),
                key_info(column, meta, table_data),
                describe(column, meta, name),
            ])
        table(doc, ["Column", "Data type", "Null / default", "Key / reference", "Description"], rows,
              widths=[1.45, 1.05, 1.25, 1.5, 2.0])
        if table_data["constraints"]:
            doc.add_paragraph("Table-level rules: " + "; ".join(table_data["constraints"][:4]) + (" …" if len(table_data["constraints"]) > 4 else ""), style="Caption")

    doc.add_page_break()

    # 4. Check constraints
    doc.add_heading("4. Check constraints and domain rules", level=1)
    doc.add_paragraph("These constraints are enforced by PostgreSQL. They prevent invalid lifecycle states, out-of-range scores and inconsistent workflow data.")
    table(doc, ["Table", "Constraint", "Rule"],
          [[t, n, rule] for t, n, rule in constraints], widths=[1.6, 2.2, 2.8])

    doc.add_page_break()

    # 5. Indexes
    doc.add_heading("5. Indexes", level=1)
    table(doc, ["Index", "Table", "Columns", "Unique"],
          [[name, tbl, cols, "yes" if unique else "no"] for name, tbl, cols, unique in indexes],
          widths=[2.2, 1.7, 2.0, 0.7])

    # 6. Supporting objects
    doc.add_heading("6. Supporting database objects", level=1)
    extensions = clean((SCHEMA / "tables" / "000_extensions.sql").read_text(encoding="utf-8", errors="replace"))
    doc.add_paragraph("Extensions: " + ", ".join(re.findall(r'CREATE EXTENSION IF NOT EXISTS "?([\w-]+)"?', extensions)))
    for folder, label in (("functions", "Functions"), ("triggers", "Triggers"), ("views", "Views"), ("enums", "Enumerated types")):
        files = read_sql_files(folder)
        if files:
            doc.add_paragraph(f"{label}: " + ", ".join(file.stem for file in files))

    doc.add_paragraph()
    note = doc.add_paragraph(style="Intense Quote")
    note.add_run("Note for the thesis: migration files in database/migrations apply incremental production changes on top of this declarative schema. Both layers are idempotent and converge to the structure documented above.")

    doc.save(OUTPUT)
    print(f"Wrote {OUTPUT} ({len(tables)} tables, {len(relation_rows)} FK relations, {len(indexes)} indexes)")


if __name__ == "__main__":
    build()
