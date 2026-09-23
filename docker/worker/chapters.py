"""Finding a textbook's chapters. Pure logic: no database, no subprocesses.

Two sources, best first:
  1. the PDF's own bookmarks (already in PDF page numbers), and
  2. the printed contents page ("5  Cell Structure ........ 101"), whose page
     numbers are the book's own and need converting to PDF pages (the "offset":
     PDF page = printed page + offset, because of the cover, preface, etc.).

Everything is a best guess that the user can see and correct, so when in doubt
these functions return nothing rather than something misleading.
"""
import re
from collections import Counter

MAX_TOC_PAGES = 40           # a contents page is near the front
MIN_CHAPTERS = 3             # fewer than this is more likely a coincidence than a table of contents
OFFSET_WINDOW = 60           # how far past the contents to look for a chapter's first page
OFFSET_PROBES = 5            # how many chapters to locate when working out the offset
MAX_OCR_PROBES = 25          # pages OCR'd (beyond the front matter) to locate chapter starts

_CHAPTER_WORD = re.compile(r"^\s*(?:chapter|ch\.?)\s*(\d{1,3})\b\s*[:.\-–—]?\s*(.*)$", re.IGNORECASE)
_NUMBERED = re.compile(r"^\s*(\d{1,3})\s*[.:\-–—)]?\s+(\S.*)$")
_TRAILING_PAGE = re.compile(r"(?:^|\s)(\d{1,4})\s*$")
_LEADER = re.compile(r"(?:\.{2,}|(?:\.\s){2,}|[·…_]{2,}|\s{2,})\s*$")
_LEADER_TRIM = re.compile(r"[\s.·…_\-]+$")


def parse_title(title):
    """Split "Chapter 5: Cells" / "5. Cells" into (5, "Cells"); (None, title) if it isn't numbered."""
    title = " ".join(title.split())
    match = _CHAPTER_WORD.match(title) or _NUMBERED.match(title)
    if not match:
        return None, title
    return int(match.group(1)), match.group(2).strip(" :.-–—")


# --- 1. Bookmarks ---------------------------------------------------------------


def from_outline(items, total_pages):
    """Chapters from a bookmark tree: [{'title', 'page', 'kids': [...]}, ...].

    Textbooks nest bookmarks (Part > Chapter > Section), so pick the shallowest
    level that holds at least MIN_CHAPTERS numbered chapters. Each chapter runs to
    the next bookmark at that level or above (so a trailing Index or Appendix
    isn't swallowed).
    """
    flat = []

    def walk(nodes, depth):
        for node in nodes:
            flat.append((depth, node.get("title", ""), node.get("page")))
            walk(node.get("kids") or [], depth + 1)

    walk(items, 0)

    def usable(page):
        return isinstance(page, int) and 1 <= page <= total_pages

    depths = sorted({depth for depth, _, _ in flat})
    for depth in depths:
        numbered = [(i, parse_title(title)) for i, (d, title, page) in enumerate(flat) if d == depth and usable(page)]
        numbered = [(i, parsed) for i, parsed in numbered if parsed[0] is not None]
        if len(numbered) < MIN_CHAPTERS:
            continue

        chapters, seen = [], set()
        for i, (number, title) in numbered:
            start = flat[i][2]
            if number in seen:
                continue
            seen.add(number)
            end = total_pages
            for d, _, page in flat[i + 1 :]:
                if d <= depth and usable(page):
                    end = max(start, page - 1)
                    break
            chapters.append({"number": number, "title": title, "start": start, "end": end, "source": "outline"})
        chapters.sort(key=lambda chapter: chapter["start"])
        if len(chapters) >= MIN_CHAPTERS:
            return chapters
    return []


# --- 2. Contents page -------------------------------------------------------------


def _toc_lines(page_texts):
    """(printed_page, title, number, had_leader, pdf_page) for each contents-looking line in the front pages."""
    entries = []
    for pdf_page, text in enumerate(page_texts[:MAX_TOC_PAGES], start=1):
        for raw in text.splitlines():
            line = raw.rstrip()
            trailing = _TRAILING_PAGE.search(line)
            if not trailing:
                continue
            body = line[: trailing.start(1)]
            has_leader = bool(_LEADER.search(body))
            body = _LEADER_TRIM.sub("", body)
            if sum(ch.isalpha() for ch in body) < 2:
                continue
            number, title = parse_title(body)
            if number is not None and not (has_leader or _CHAPTER_WORD.match(body)):
                # "3 Cells 45" with no dot leader or wide gap could be anything.
                number, title = None, body
            entries.append((int(trailing.group(1)), title, number, has_leader, pdf_page))
    return entries


def _longest_increasing(entries):
    """Longest run of numbered entries with rising chapter numbers and non-falling pages."""
    numbered = [entry for entry in entries if entry[2] is not None][:2000]
    best = []
    chains = []
    for i, entry in enumerate(numbered):
        chain = [entry]
        for j in range(i):
            candidate = chains[j]
            if candidate[-1][2] < entry[2] and candidate[-1][0] <= entry[0] and len(candidate) + 1 > len(chain):
                chain = candidate + [entry]
        chains.append(chain)
        if len(chain) > len(best):
            best = chain
    return best


def parse_toc(page_texts):
    """Read a printed table of contents.

    Returns (chapters, boundaries, contents_end): chapters as
    [(number, title, printed_page)]; the printed pages of unnumbered entries
    (Appendix, Index, ...) after the last chapter, which mark where the last
    chapter stops; and the last PDF page the contents occupy. ([], [], 0) if
    there is no contents page.
    """
    entries = _toc_lines(page_texts)
    chain = _longest_increasing(entries)
    if len(chain) < MIN_CHAPTERS:
        return [], [], 0
    last_page = chain[-1][0]
    boundaries = sorted({page for page, _, number, leader, _ in entries if number is None and leader and page > last_page})
    return [(number, title, page) for page, title, number, _, _ in chain], boundaries, max(entry[4] for entry in chain)


# --- Converting printed pages to PDF pages -------------------------------------------


def _norm(text):
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def is_chapter_start(text, number, title):
    """Does this page look like the first page of chapter `number` called `title`?"""
    lines = [line.strip() for line in text.splitlines() if line.strip()][:12]
    top = "\n".join(lines)
    if re.search(rf"^\s*(?:chapter|ch\.?)\s*{number}\b", top, re.IGNORECASE | re.MULTILINE):
        return True
    wanted = _norm(title)[:24]
    if len(wanted) >= 8 and wanted in _norm(top):
        return True
    return False


def find_offset(entries, total_pages, contents_end, page_text):
    """PDF page minus printed page, or None if it can't be established.

    `entries` are the contents chapters [(number, title, printed_page)];
    `contents_end` is the last PDF page the contents occupy; `page_text(n)` returns
    a page's text, or None to say "no more effort may be spent on this page" (the
    caller owns the OCR budget, see MAX_OCR_PROBES); a None ends the search for
    that chapter.
    """
    votes = Counter()
    probed = 0
    step = max(1, len(entries) // OFFSET_PROBES)
    for number, title, printed in entries[::step][:OFFSET_PROBES]:
        probed += 1
        first = max(1, printed, contents_end + 1)  # a chapter starts after the contents
        for page in range(first, min(total_pages, first + OFFSET_WINDOW) + 1):
            text = page_text(page)
            if text is None:
                break
            if is_chapter_start(text, number, title):
                votes[page - printed] += 1
                break
    if not votes:
        return None
    ranked = votes.most_common(2)
    best, count = ranked[0]
    if len(ranked) > 1 and ranked[1][1] == count:
        return None
    if probed > 1 and count < 2:
        return None
    return best


def from_toc(entries, boundaries, offset, total_pages):
    """Chapters in PDF pages from contents entries and an offset."""
    chapters = []
    for index, (number, title, printed) in enumerate(entries):
        start = printed + offset
        if not 1 <= start <= total_pages:
            continue
        if index + 1 < len(entries):
            end = entries[index + 1][2] + offset - 1
        else:
            later = [page + offset for page in boundaries if page + offset > start]
            end = (min(later) - 1) if later else total_pages
        chapters.append({"number": number, "title": title, "start": start, "end": min(max(end, start), total_pages), "source": "toc"})
    starts = [chapter["start"] for chapter in chapters]
    if len(chapters) < MIN_CHAPTERS or starts != sorted(set(starts)):
        return []
    return chapters


def offset_from_outline(outline_chapters, toc_entries):
    """When both a bookmark tree and a contents page exist, the difference between
    where they put the same chapter is the offset (the most common difference wins)."""
    printed = {number: page for number, _, page in toc_entries}
    votes = Counter(chapter["start"] - printed[chapter["number"]] for chapter in outline_chapters if chapter["number"] in printed)
    if not votes:
        return None
    (best, count), *rest = votes.most_common(2)
    if rest and rest[0][1] == count:
        return None
    return best
