"""Heuristic, review-first extraction for candidate resumes.

The parser deliberately leaves unknown facts blank. It is designed to return
editable suggestions, not silently invent profile values from nearby text.
"""

import os
import re
from typing import Any


def _normalise_line(value: str) -> str:
    """Repair names whose PDF font extraction inserts spaces between glyphs."""
    line = value.strip()
    groups = re.split(r"\s{2,}", line)
    if len(groups) > 1 and all(re.fullmatch(r"[A-Za-z](?:\s+[A-Za-z])+", group.strip()) for group in groups):
        line = " ".join(re.sub(r"\s+", "", group.strip()) for group in groups)
    return re.sub(r"[ \t]+", " ", line).strip()


def _heading(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", value.lower())).strip()


def _section(lines: list[str], names: set[str], stop_names: set[str], *, prefix: bool = False) -> list[str]:
    start = None
    for index, line in enumerate(lines):
        heading = _heading(line)
        if heading in names or (prefix and any(heading.startswith(name + " ") for name in names)):
            start = index + 1
            break
    if start is None:
        return []
    stop = len(lines)
    for index in range(start, len(lines)):
        if _heading(lines[index]) in stop_names:
            stop = index
            break
    return lines[start:stop]


def _unique(values: list[str], limit: int = 80) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = re.sub(r"\s+", " ", value).strip(" \t,;|•-*\uFFFD")
        key = cleaned.casefold()
        if cleaned and key not in seen:
            result.append(cleaned[:120])
            seen.add(key)
        if len(result) >= limit:
            break
    return result


_SECTION_HEADINGS = {
    "experience", "work experience", "professional experience", "employment history",
    "internship experience", "internship training", "projects", "personal projects",
    "academic projects", "certifications", "certificates", "licenses and certifications",
    "skills", "technical skills", "core skills", "key skills", "competencies",
    "education", "academic background", "education and training", "summary",
    "professional summary", "career summary", "objective", "profile", "interests",
    "awards", "achievements", "projects achievements", "contact", "personal details", "career objective",
}

_SKILL_GROUP_HEADINGS = {
    "programming languages", "core ai technologies", "frameworks libraries",
    "frameworks and libraries", "databases", "tools and platforms", "core skills",
    "technical skills", "web technologies", "cloud technologies", "soft skills",
}


def _collect_skill_lines(lines: list[str]) -> list[str]:
    skill_lines: list[str] = []
    collecting = False
    for line in lines:
        heading = _heading(line)
        if heading in _SKILL_GROUP_HEADINGS:
            collecting = True
            continue
        if heading in _SECTION_HEADINGS:
            collecting = False
            continue
        if collecting:
            skill_lines.append(line)
    return skill_lines

_MONTH = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_PERIOD = re.compile(
    rf"\b{_MONTH}\s+(?:19|20)\d{{2}}\s*(?:[-–—]|to)\s*(?:{_MONTH}\s+)?(?:19|20)\d{{2}}|"
    rf"\b{_MONTH}\s+(?:19|20)\d{{2}}\s*(?:[-–—]|to)\s*(?:now|present|current)\b",
    re.IGNORECASE,
)


def _parse_training(lines: list[str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    pending = ""
    for raw_line in lines:
        line = raw_line.strip(" \t-•*\uFFFD")
        if not line:
            continue
        period_match = _PERIOD.search(line)
        if period_match:
            title = (line[:period_match.start()] + " " + line[period_match.end():]).strip(" -|,:;\t")
            period = period_match.group(0).strip()
            if title:
                entries.append({"title": title[:200], "company": "", "period": period[:100], "description": ""})
            elif pending:
                entries.append({"title": pending[:200], "company": "", "period": period[:100], "description": ""})
                pending = ""
            elif entries and not entries[-1]["period"]:
                entries[-1]["period"] = period[:100]
            continue
        if pending:
            entries.append({"title": pending[:200], "company": "", "period": "", "description": ""})
        pending = line
    if pending:
        entries.append({"title": pending[:200], "company": "", "period": "", "description": ""})
    return entries[:20]


def _parse_projects(lines: list[str]) -> list[dict[str, Any]]:
    projects: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    achievement_line = re.compile(r"\b(?:\d+(?:st|nd|rd|th)\s+rank|hackathon|participants?\b|team leader|best ui/ux|state[- ]level|national[- ]level)\b", re.IGNORECASE)
    for raw_line in lines:
        line = raw_line.strip(" \t-•*")
        if not line or _heading(line) in {"projects", "achievements"}:
            continue
        if achievement_line.search(line):
            continue
        marker = re.search(r"\s+[\uFFFD–—•]\s+", line)
        if marker:
            title, description = line[:marker.start()], line[marker.end():]
            title = title.strip(" \t-•*|,:;")
            if title:
                current = {"name": title[:200], "description": description.strip(" \t-•*|,:;"), "technologies": []}
                projects.append(current)
                continue
        if current:
            current["description"] = (current["description"] + " " + line).strip()[:2000]

    known = (
        "Python", "C++", "C", "HTML", "CSS", "Machine Learning", "Deep Learning", "NLP",
        "Transformers", "Generative AI", "Data Science", "TensorFlow", "Hugging Face",
        "Flutter", "FastAPI", "Firebase", "Firestore", "SQL", "Docker", "Jira", "Git",
        "GitHub", "VS Code", "Android Studio", "Google Colab", "Figma",
    )
    for project in projects:
        text = project["description"]
        project["technologies"] = [skill for skill in known if re.search(r"(?<![A-Za-z0-9])" + re.escape(skill) + r"(?![A-Za-z0-9])", text, re.IGNORECASE)]
    return projects[:30]


def parse_resume_profile(raw_text: str, filename: str) -> dict[str, Any]:
    text = re.sub(r"\r\n?", "\n", raw_text)
    lines = [_normalise_line(line) for line in text.splitlines() if line.strip()]
    text = "\n".join(lines)

    major_headings = _SECTION_HEADINGS
    header_lines: list[str] = []
    for line in lines:
        heading = _heading(line)
        if heading in major_headings or heading.startswith("professional summary"):
            break
        header_lines.append(line)
    header_text = "\n".join(header_lines[:20])

    excluded_name_terms = (
        "resume", "curriculum", "profile", "portfolio", "experience", "education", "skills",
        "bachelor", "master", "doctor", "ph.d", "b.tech", "b.e.", "b.sc", "bca", "mca",
        "mba", "diploma", "degree", "university", "college", "institute", "engineering",
        "technology", "computer science", "information technology", "commerce", "arts", "science",
        "developer", "engineer", "analyst", "manager", "designer", "scientist", "consultant",
        "specialist", "intern", "architect", "professional", "associate", "recruiter",
    )

    def looks_like_name(value: str) -> bool:
        cleaned = re.sub(r"\s+", " ", value).strip(" |·,;:-")
        words = cleaned.split()
        if not 1 <= len(words) <= 4 or len(cleaned) > 64 or re.search(r"\d|[@:/|•]", cleaned):
            return False
        if any(term in cleaned.casefold() for term in excluded_name_terms):
            return False
        return bool(re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’-]*(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’-]*){0,3}", cleaned))

    explicit = re.search(r"(?:full\s+name|candidate\s+name|name)\s*[:|-]\s*([^\n|]{2,64})", header_text, re.IGNORECASE)
    name = explicit.group(1).strip() if explicit and looks_like_name(explicit.group(1)) else ""
    if not name:
        name = next((line for line in header_lines if looks_like_name(line) and not re.search(r"@|https?://|\b(?:phone|mobile|email|linkedin)\b", line, re.IGNORECASE)), "")

    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.IGNORECASE)
    phone_match = re.search(r"(?:phone|mobile|tel|contact)\s*[:|-]?\s*(\+?\d[\d ()-]{8,}\d)", header_text, re.IGNORECASE)
    if not phone_match:
        phone_match = next((match for match in re.finditer(r"(?:\+?\d[\d ()-]{8,}\d)", header_text) if 10 <= len(re.sub(r"\D", "", match.group(0))) <= 15), None)

    headline = ""
    if name:
        try:
            name_index = lines.index(name)
        except ValueError:
            name_index = -1
        for possible in lines[name_index + 1:name_index + 7] if name_index >= 0 else []:
            if (not re.search(r"@|https?://|\b(?:resume|curriculum|email|phone|mobile|bachelor|master|b\.tech|university|college|institute|education)\b", possible, re.IGNORECASE)
                    and not re.search(r"\d{5,}", possible)):
                headline = possible[:200]
                break

    summary_lines = _section(lines, {"professional summary", "career summary", "summary", "career objective", "objective", "profile"}, major_headings - {"professional summary", "career summary", "summary", "career objective", "objective", "profile"})
    skills_lines = _collect_skill_lines(lines)
    skill_text = ", ".join(skills_lines)
    skill_text = re.sub(r"natural\s+language\s*,\s*processing", "Natural language processing", skill_text, flags=re.IGNORECASE)
    skill_text = re.sub(r"google\s*,\s*collab", "Google Colab", skill_text, flags=re.IGNORECASE)
    skills = _unique(re.split(r"[,;|\n]+", skill_text))
    # Normalize a common typo while preserving the user's listed skill.
    skills = ["Generative AI" if value.casefold() == "genrative ai" else value for value in skills]

    education_lines = _section(lines, {"education", "academic background", "education and training"}, major_headings - {"education", "academic background", "education and training"})
    degree_line = re.compile(r"\b(?:b\.?tech|b\.?e\.?|bachelor|master|m\.?tech|mca|bca|diploma|secondary|12th)\b", re.IGNORECASE)
    batch_line = re.compile(r"\b(?:batch\s+)?(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)?\d{2}\b", re.IGNORECASE)
    education_line = next((line for line in lines if degree_line.search(line) and batch_line.search(line)), "")
    if not education_line:
        education_line = next((line for line in education_lines if degree_line.search(line)), "")
    education = re.sub(r"\s*\|\s*", ", ", education_line).strip()[:160]
    if not education:
        degree_match = re.search(r"\b((?:B\.?Tech|B\.?E\.?|B\.?Sc\.?|BCA|MCA|M\.?Tech|MBA|Bachelor(?:'s)?|Master(?:'s)?|Ph\.?D)[^\n]{0,140})", text, re.IGNORECASE)
        education = degree_match.group(1).strip()[:160] if degree_match else ""

    internship_headings = {"internship training", "internship and training", "experience", "work experience", "professional experience", "employment history", "internship experience"}
    experience_lines = _section(lines, internship_headings, (major_headings - internship_headings) | _SKILL_GROUP_HEADINGS)
    project_lines = _section(lines, {"projects", "personal projects", "academic projects"}, set(), prefix=True)
    certifications_lines = _section(lines, {"certifications", "certificates", "licenses and certifications"}, major_headings - {"certifications", "certificates", "licenses and certifications"})
    experience = _parse_training(experience_lines)
    projects = _parse_projects(project_lines)
    certifications = _unique([line.strip(" \t-•*") for line in certifications_lines])[:30]

    location_match = re.search(r"(?:location|based in|address)\s*[:|-]\s*([^\n|]{2,80})", header_text, re.IGNORECASE)
    summary = re.sub(r"\s+", " ", " ".join(summary_lines)).strip()[:1200]
    exp_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:\+|to|-)?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|work)", text, re.IGNORECASE)

    return {
        "filename": os.path.basename(filename),
        "text_characters": len(text),
        "suggested_profile": {
            "full_name": name,
            "headline": headline,
            "email": email_match.group(0) if email_match else "",
            "phone": phone_match.group(1).strip() if phone_match and phone_match.lastindex else phone_match.group(0).strip() if phone_match else "",
            "location": location_match.group(1).strip() if location_match else "",
            "skills": skills,
            "experience_years": float(exp_match.group(1)) if exp_match else 0,
            "education_level": education,
            "summary": summary,
            "experience": experience,
            "projects": projects,
            "certifications": certifications,
        },
        "review_required": True,
    }
