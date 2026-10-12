#!/usr/bin/env python3
"""End-to-end check of flashcards against a RUNNING stack (used by CI).

The browser tests use a fake backend, so this is where the real database's
rules and PostgREST's behaviour are checked: the joins the app makes (deck ->
course, exam, quiz), the upsert the editor uses to save cards, row level
security between two users (including links to someone else's course, exam or
quiz), the size bounds, test-result trimming, and cascades.

Environment: API_URL (default http://localhost:8080), ANON_KEY, ACCESS_TOKEN
(user A). Signs up user B itself. Standard library only.
"""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

RESULTS = []


class Client:
    def __init__(self, base, anon):
        self.base = base.rstrip("/")
        self.anon = anon

    def call(self, method, path, token=None, body=None, prefer=None, accept=None):
        headers = {"apikey": self.anon, "Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if prefer:
            headers["Prefer"] = prefer
        if accept:
            headers["Accept"] = accept
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                status, payload = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read()
        try:
            return status, (json.loads(payload) if payload else None)
        except ValueError:
            return status, payload.decode(errors="replace")


class Session:
    def __init__(self, client, token, user_id):
        self.client, self.token, self.user_id = client, token, user_id

    def rest(self, method, path, **kw):
        return self.client.call(method, "/rest/v1" + path, token=self.token, **kw)

    def make(self, table, row):
        status, rows = self.rest("POST", f"/{table}", body={"user_id": self.user_id, **row}, prefer="return=representation")
        assert status == 201, (table, status, rows)
        return rows[0]["id"]

    def deck(self, **row):
        return self.rest("POST", "/flashcard_decks", body={"user_id": self.user_id, "title": "Deck", **row}, prefer="return=representation")

    def cards(self, deck_id):
        status, rows = self.rest("GET", f"/flashcards?deck_id=eq.{deck_id}&select=id,term,definition,position,starred,known&order=position.asc")
        return rows if status == 200 else []


def check(name, condition, detail=""):
    RESULTS.append((name, bool(condition)))
    print(f"  {'ok  ' if condition else 'FAIL'} - {name}" + ("" if condition else f"   [{str(detail)[:300]}]"), flush=True)


def main():
    client = Client(os.environ.get("API_URL", "http://localhost:8080"), os.environ["ANON_KEY"])
    token_a = os.environ["ACCESS_TOKEN"]
    status, user = client.call("GET", "/auth/v1/user", token=token_a)
    assert status == 200, ("could not identify user A", status, user)
    a = Session(client, token_a, user["id"])

    email_b = f"ci-flash-b-{uuid.uuid4().hex[:8]}@accounts.local"
    status, signup = client.call("POST", "/auth/v1/signup", body={"email": email_b, "password": "ci-test-password-123"})
    assert status == 200, ("could not sign up user B", status, signup)
    b = Session(client, signup["access_token"], signup["user"]["id"])

    course = a.make("courses", {"name": "Flash course", "short_code": "FL 1", "color": "#3b82f6"})
    exam = a.make("exams", {"course_id": course, "title": "Midterm", "exam_at": "2099-10-18T14:00:00Z"})
    quiz = a.make("quizzes", {"course_id": course, "title": "Quiz 1", "quiz_at": "2099-10-11T14:00:00Z"})
    b_course = b.make("courses", {"name": "B course", "short_code": "B 1", "color": "#000000"})
    b_exam = b.make("exams", {"course_id": b_course, "title": "B midterm", "exam_at": "2099-10-18T14:00:00Z"})
    b_quiz = b.make("quizzes", {"course_id": b_course, "title": "B quiz", "quiz_at": "2099-10-11T14:00:00Z"})

    print("== decks and the links to a course, exam and quiz")
    status, rows = a.deck(title="Organelles", course_id=course, exam_id=exam, quiz_id=quiz, settings={"write": {"answerWith": "definition"}})
    check("a deck linked to your own course, exam and quiz is created", status == 201, (status, rows))
    deck = rows[0]["id"]
    status, rows = a.rest(
        "GET",
        f"/flashcard_decks?id=eq.{deck}&select=*,course:courses(id,name,short_code,color),exam:exams(id,title,exam_at),quiz:quizzes(id,title,quiz_at)",
    )
    check(
        "the deck can be read with its course, exam and quiz joined in (the app's exact query)",
        status == 200 and rows and rows[0]["course"]["id"] == course and rows[0]["exam"]["id"] == exam and rows[0]["quiz"]["id"] == quiz,
        (status, rows),
    )
    check("its settings come back as stored", status == 200 and rows and rows[0]["settings"] == {"write": {"answerWith": "definition"}}, rows)
    for column, other in (("course_id", b_course), ("exam_id", b_exam), ("quiz_id", b_quiz)):
        status, body = a.deck(title="Sneaky", **{column: other})
        check(f"a deck can't link to someone else's {column[:-3]}", status in (401, 403), (status, body))
        status, body = a.rest("PATCH", f"/flashcard_decks?id=eq.{deck}", body={column: other})
        check("...nor be changed to link to it", status in (401, 403), (status, body))
    status, body = a.deck(title="   ")
    check("a blank title is refused", status in (400, 403), (status, body))
    status, body = a.deck(title="Bad settings", settings=[1, 2])
    check("settings must be an object", status in (400, 403), (status, body))

    print("== cards, saved the way the editor saves them")
    rows = [{"deck_id": deck, "user_id": a.user_id, "term": f"term {i}", "definition": f"definition {i}", "position": i, "starred": False} for i in range(3)]
    status, body = a.rest("POST", "/flashcards", body=rows)
    check("new cards are added", status == 201, (status, body))
    cards = a.cards(deck)
    check("and read back in order", [c["term"] for c in cards] == ["term 0", "term 1", "term 2"], cards)
    upsert = [
        {"id": cards[2]["id"], "deck_id": deck, "user_id": a.user_id, "term": "term 2 edited", "definition": "definition 2", "position": 0, "starred": True},
        {"id": cards[0]["id"], "deck_id": deck, "user_id": a.user_id, "term": "term 0", "definition": "definition 0", "position": 1, "starred": False},
    ]
    status, body = a.rest("POST", "/flashcards?on_conflict=id", body=upsert, prefer="resolution=merge-duplicates")
    check("the editor's upsert of existing cards works", status in (200, 201), (status, body))
    status, body = a.rest("DELETE", f"/flashcards?id=in.({cards[1]['id']})")
    check("removed cards are deleted by id list", status in (200, 204), (status, body))
    after = a.cards(deck)
    check(
        "edits, reorder and star all took, with ids kept",
        [(c["id"], c["term"], c["position"], c["starred"]) for c in after] == [(cards[2]["id"], "term 2 edited", 0, True), (cards[0]["id"], "term 0", 1, False)],
        after,
    )
    status, body = a.rest("PATCH", f"/flashcards?id=in.({after[0]['id']},{after[1]['id']})", body={"known": True})
    check("known can be set on several cards at once", status in (200, 204) and all(c["known"] for c in a.cards(deck)), (status, body))
    status, body = a.rest("POST", "/flashcards", body={"deck_id": deck, "user_id": a.user_id, "term": "", "definition": "x"})
    check("a card with an empty side is refused", status in (400, 403), (status, body))

    print("== another user")
    status, rows = b.rest("GET", f"/flashcard_decks?id=eq.{deck}&select=id")
    check("user B can't see A's deck", status == 200 and rows == [], (status, rows))
    status, rows = b.rest("GET", f"/flashcards?deck_id=eq.{deck}&select=id")
    check("...or its cards", status == 200 and rows == [], (status, rows))
    status, body = b.rest("POST", "/flashcards", body={"deck_id": deck, "user_id": b.user_id, "term": "x", "definition": "y"})
    check("user B can't add a card to A's deck", status in (401, 403), (status, body))
    status, body = b.rest("POST", "/flashcards", body={"deck_id": deck, "user_id": a.user_id, "term": "x", "definition": "y"})
    check("...nor by pretending to be A", status in (401, 403), (status, body))
    b.rest("PATCH", f"/flashcards?deck_id=eq.{deck}", body={"term": "hijacked"})
    check("B's edit of A's cards changes nothing", all(c["term"] != "hijacked" for c in a.cards(deck)), a.cards(deck))
    b.rest("DELETE", f"/flashcard_decks?id=eq.{deck}")
    status, rows = a.rest("GET", f"/flashcard_decks?id=eq.{deck}&select=id")
    check("B's delete of A's deck changes nothing", status == 200 and len(rows) == 1, (status, rows))
    b_deck = b.deck(title="B deck")[1][0]["id"]
    status, body = a.rest("POST", "/flashcards", body={"deck_id": b_deck, "user_id": a.user_id, "term": "x", "definition": "y"})
    check("A can't add a card to B's deck either", status in (401, 403), (status, body))
    status, body = client.call("GET", "/rest/v1/flashcard_decks?select=id")
    check("someone not signed in sees nothing", status in (401, 403) or body == [], (status, body))

    print("== test results")
    answers = [{"card_id": after[0]["id"], "prompt": "p", "expected": "e", "given": "g", "correct": False}]
    status, body = a.rest("POST", "/flashcard_test_results", body={"deck_id": deck, "user_id": a.user_id, "total": 1, "correct": 0, "answers": answers}, prefer="return=representation")
    check("a result is saved", status == 201, (status, body))
    result = body[0]["id"] if status == 201 else None
    status, body = a.rest("PATCH", f"/flashcard_test_results?id=eq.{result}", body={"correct": 1, "total": 1})
    check("...and can be corrected after review", status in (200, 204), (status, body))
    status, body = a.rest("POST", "/flashcard_test_results", body={"deck_id": deck, "user_id": a.user_id, "total": 1, "correct": 2})
    check("more correct than total is refused", status in (400, 403), (status, body))
    status, body = b.rest("POST", "/flashcard_test_results", body={"deck_id": deck, "user_id": b.user_id, "total": 1, "correct": 1})
    check("B can't save a result against A's deck", status in (401, 403), (status, body))
    for i in range(55):
        a.rest("POST", "/flashcard_test_results", body={"deck_id": deck, "user_id": a.user_id, "total": 10, "correct": i % 11})
    status, rows = a.rest("GET", f"/flashcard_test_results?deck_id=eq.{deck}&select=id")
    check("only the 50 most recent results per deck are kept", status == 200 and len(rows) == 50, (status, len(rows) if isinstance(rows, list) else rows))

    print("== unlinking and deleting")
    a.rest("DELETE", f"/exams?id=eq.{exam}")
    status, rows = a.rest("GET", f"/flashcard_decks?id=eq.{deck}&select=exam_id,quiz_id,course_id")
    check("deleting the exam keeps the deck and just unlinks it", status == 200 and rows and rows[0]["exam_id"] is None and rows[0]["quiz_id"] == quiz, (status, rows))
    a.rest("DELETE", f"/courses?id=eq.{course}")
    status, rows = a.rest("GET", f"/flashcard_decks?id=eq.{deck}&select=course_id,quiz_id")
    check("deleting the course keeps the deck too (its quiz goes with the course)", status == 200 and rows and rows[0]["course_id"] is None and rows[0]["quiz_id"] is None, (status, rows))
    status, _ = a.rest("DELETE", f"/flashcard_decks?id=eq.{deck}")
    check("a deck can be deleted", status in (200, 204), status)
    check("...and its cards go with it", a.cards(deck) == [], a.cards(deck))
    status, rows = a.rest("GET", f"/flashcard_test_results?deck_id=eq.{deck}&select=id")
    check("...and its results", status == 200 and rows == [], (status, rows))

    status, body = client.call("POST", "/functions/v1/delete-user", token=b.token)
    check("(user B removed again)", status == 200, (status, body))

    failed = [name for name, ok in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed")
    if failed:
        print("FAILED:\n  - " + "\n  - ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
