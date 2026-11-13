"""Small text helpers shared by the learner and the checker."""
import re

_ABBREV = r"(?:Mr|Mrs|Ms|Dr|Prof|Sen|Rep|Gov|Gen|Col|Lt|Sgt|St|Jr|Sr|Inc|Ltd|Co|Corp|No|vs|Jan|Feb|Mar|Apr|Aug|Sept|Sep|Oct|Nov|Dec|U\.S|U\.K|a\.m|p\.m|e\.g|i\.e)"
_PLACEHOLDER = "\u0000"


def paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n|\r\n\s*\r\n", text) if p.strip()]


def sentences(text: str) -> list[str]:
    """Rough sentence splitter that tolerates common newsroom abbreviations."""
    protected = re.sub(rf"\b({_ABBREV})\.", lambda m: m.group(1) + _PLACEHOLDER, text)
    parts = re.split(r"(?:(?<=[.!?])|(?<=[.!?][\"'”’)]))\s+(?=[\"'“‘(]?[A-Z0-9])", protected)
    return [p.replace(_PLACEHOLDER, ".").strip() for p in parts if p.strip()]


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9][A-Za-z0-9'’\-]*", text)


def line_col(text: str, offset: int) -> tuple[int, int]:
    line = text.count("\n", 0, offset) + 1
    col = offset - (text.rfind("\n", 0, offset) + 1) + 1
    return line, col
