"""The real command-line tools, run defensively.

Uploaded files are untrusted and are parsed by native code (poppler, qpdf,
tesseract), so every call here has a timeout, a memory ceiling and a file-size
ceiling, gets no stdin and a minimal environment, and reports failures in words
a user can act on rather than as a stack trace.
"""
import json
import os
import resource
import shutil
import subprocess
import tempfile

import docproc


class ProcessingError(Exception):
    """A problem with the upload itself. The message is shown to the user, so keep it plain."""


class Config:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.mem_mb = int(env.get("WORKER_MEM_MB", "3072"))
        self.ocr_lang = env.get("WORKER_OCR_LANG", "eng")
        self.ocr_dpi = int(env.get("WORKER_OCR_DPI", "300"))
        # Textbooks: only OCR this many pages from the front (the contents live there).
        self.textbook_ocr_pages = int(env.get("WORKER_TEXTBOOK_OCR_PAGES", "40"))
        self.max_seconds = int(env.get("WORKER_MAX_SECONDS", "7200"))
        self.poll_seconds = float(env.get("WORKER_POLL_SECONDS", "3"))
        self.tmpdir = env.get("WORKER_TMPDIR", tempfile.gettempdir())


def _limits(cfg):
    def apply():
        memory = cfg.mem_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        biggest_file = 4 * 1024 ** 3
        resource.setrlimit(resource.RLIMIT_FSIZE, (biggest_file, biggest_file))

    return apply


class Tools:
    def __init__(self, cfg):
        self.cfg = cfg
        self.env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "LANG": "C.UTF-8",
            "HOME": self.cfg.tmpdir,
            "TMPDIR": self.cfg.tmpdir,
            "OMP_THREAD_LIMIT": "1",  # tesseract: one thread; the worker runs one job at a time
        }

    def missing(self):
        """Names of required programs that aren't installed (empty when all is well)."""
        return [name for name in ("qpdf", "pdftotext", "pdftoppm", "tesseract") if shutil.which(name) is None]

    def _run(self, command, timeout, what, ok_codes=(0,)):
        try:
            done = subprocess.run(
                command,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                timeout=timeout,
                env=self.env,
                preexec_fn=_limits(self.cfg),
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise ProcessingError(f"{what} took too long, so it was stopped. The file may be damaged or too complex.")
        except OSError as error:
            raise ProcessingError(f"{what} could not run ({error.strerror or error}).")
        if done.returncode not in ok_codes:
            raise ProcessingError(f"{what} failed. The file may be damaged.")
        return done

    # --- PDF ---------------------------------------------------------------
    def page_count(self, path):
        done = self._run(["qpdf", "--show-npages", path], 60, "Reading the PDF")
        try:
            return int(done.stdout.decode().strip())
        except ValueError:
            raise ProcessingError("That doesn't look like a readable PDF.")

    def needs_password(self, path):
        # qpdf --requires-password: 0 = a password is needed, 2 = not encrypted,
        # 3 = encrypted but opens without one (common for "no printing" textbooks).
        done = self._run(["qpdf", "--requires-password", path], 60, "Checking the PDF", ok_codes=(0, 2, 3))
        return done.returncode == 0

    def outline(self, path):
        """The PDF's bookmarks as [{'title', 'page', 'kids': [...]}], [] if it has none."""
        # qpdf exits 3 for a file it had to repair, which still yields usable output.
        done = self._run(["qpdf", "--json=2", "--json-key=outlines", path], 120, "Reading the PDF's bookmarks", ok_codes=(0, 3))
        try:
            data = json.loads(done.stdout.decode("utf-8", errors="replace"))
        except ValueError:
            return []
        budget = [5000]  # a hostile file shouldn't be able to make this walk forever

        def walk(nodes, depth):
            found = []
            if not isinstance(nodes, list) or depth > 6:
                return found
            for node in nodes:
                if not isinstance(node, dict) or budget[0] <= 0:
                    break
                budget[0] -= 1
                page = node.get("destpageposfrom1")
                found.append(
                    {
                        "title": str(node.get("title") or "")[:300],
                        "page": page if isinstance(page, int) and not isinstance(page, bool) else None,
                        "kids": walk(node.get("kids"), depth + 1),
                    }
                )
            return found

        return walk(data.get("outlines") if isinstance(data, dict) else None, 0)

    def extract_pages(self, path, first, last, destination):
        """Copy pages first..last of `path` into a new PDF (no re-encoding, so it's fast and lossless)."""
        self._run(
            ["qpdf", "--empty", "--pages", path, f"{first}-{last}", "--", destination],
            600,
            "Cutting out those pages",
            ok_codes=(0, 3),
        )

    def text(self, path, first, last):
        done = self._run(
            ["pdftotext", "-f", str(first), "-l", str(last), "-layout", "-enc", "UTF-8", path, "-"],
            180,
            "Reading the PDF's text",
        )
        return done.stdout.decode("utf-8", errors="replace")

    def ocr_page(self, path, page):
        """OCR a single page of a PDF (render it, then read the image)."""
        work = tempfile.mkdtemp(dir=self.cfg.tmpdir, prefix="ocr-")
        try:
            prefix = os.path.join(work, "page")
            self._run(
                ["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(self.cfg.ocr_dpi), "-gray", "-png", "-singlefile", path, prefix],
                180,
                f"Rendering page {page}",
            )
            return self.ocr_image(prefix + ".png")
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def ocr_image(self, image_path):
        done = self._run(
            ["tesseract", image_path, "stdout", "-l", self.cfg.ocr_lang, "--psm", "3"],
            240,
            "Reading the text in the image",
        )
        return done.stdout.decode("utf-8", errors="replace")


__all__ = ["Config", "ProcessingError", "Tools", "docproc"]
