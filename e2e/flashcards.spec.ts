import { test, expect, type Page } from "../playwright-fixture";
import { installFakeBackend, makeCourse, COURSE_ID, USER_ID, type FakeBackend, type Row } from "./support/fakeBackend";

const DECK_ID = "f0000000-0000-4000-8000-000000000001";
const EXAM_ID = "e0000000-0000-4000-8000-000000000001";
const QUIZ_ID = "90000000-0000-4000-8000-000000000001";

// Noon today, so it is on this month's calendar.
const noonToday = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};
const exam = (): Row => ({ id: EXAM_ID, user_id: USER_ID, course_id: COURSE_ID, title: "Midterm 1", exam_at: noonToday(), chapters: null, topics: null, created_at: new Date().toISOString() });
const quiz = (): Row => ({ id: QUIZ_ID, user_id: USER_ID, course_id: COURSE_ID, title: "Quiz 3", quiz_at: noonToday(), topics: null, created_at: new Date().toISOString() });

/** Fixed order everywhere, so the specs know which card comes next. */
const IN_ORDER = { flashcards: { shuffle: false }, write: { shuffle: false }, test: { shuffle: false, questionCount: null } };

function deck(overrides: Partial<Row> = {}): Row {
  return {
    id: DECK_ID, user_id: USER_ID, course_id: COURSE_ID, exam_id: null, quiz_id: null, title: "Cell biology", description: "Chapter 5 terms",
    settings: IN_ORDER, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...overrides,
  };
}

let n = 0;
const card = (term: string, definition: string, overrides: Partial<Row> = {}): Row => ({
  id: `c${String(++n).padStart(7, "0")}-1111-4000-8000-000000000001`, deck_id: DECK_ID, user_id: USER_ID, term, definition,
  position: n, starred: false, known: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...overrides,
});
const CARDS = () => [card("Mitochondria", "Makes energy for the cell"), card("Ribosome", "Builds proteins"), card("Nucleus", "Holds the DNA")];

async function setup(context: Parameters<typeof installFakeBackend>[0], options: { decks?: Row[]; cards?: Row[] } = {}) {
  return installFakeBackend(context, { courses: [makeCourse()], exams: [exam()], quizzes: [quiz()], decks: options.decks ?? [deck()], cards: options.cards ?? CARDS() });
}

const decksIn = (backend: FakeBackend) => backend.db.flashcard_decks;
const cardsOf = (backend: FakeBackend) => [...backend.db.flashcards].sort((a, b) => Number(a.position) - Number(b.position));

test.describe("making and editing decks", () => {
  test("Flashcards is in the menu, and an empty account explains what decks are", async ({ context, page }) => {
    await setup(context, { decks: [], cards: [] });
    await page.goto("/");
    await page.getByRole("link", { name: "Flashcards" }).first().click();
    await expect(page.getByRole("heading", { name: "Flashcards", exact: true })).toBeVisible();
    await expect(page.getByText("No flashcard decks yet")).toBeVisible();
  });

  test("a new deck: title, course, cards; blank rows are ignored; saved in order", async ({ context, page }) => {
    const backend = await setup(context, { decks: [], cards: [] });
    await page.goto("/flashcards/new");
    await page.getByLabel("Title").fill("Organelles");
    await page.getByLabel("Course").click();
    await page.getByRole("option", { name: /CHEM 111/ }).click();
    await page.getByLabel("Term for card 1").fill("Golgi body");
    await page.getByLabel("Definition for card 1").fill("Packages proteins");
    await page.getByLabel("Term for card 2").fill("Lysosome");
    await page.getByLabel("Definition for card 2").fill("Breaks down waste");
    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.getByLabel("Term for card 3")).toBeFocused();
    await page.getByRole("button", { name: "Add card" }).click(); // a 4th, left blank
    await page.getByLabel("Term for card 3").fill("Vacuole");
    await page.getByLabel("Definition for card 3").fill("Stores water");
    await page.getByRole("button", { name: "Create deck" }).first().click();

    await expect(page.getByRole("heading", { name: "Organelles" })).toBeVisible();
    expect(decksIn(backend)).toHaveLength(1);
    expect(decksIn(backend)[0]).toMatchObject({ title: "Organelles", course_id: COURSE_ID, exam_id: null, quiz_id: null, user_id: USER_ID });
    expect(cardsOf(backend).map((c) => [c.term, c.definition, c.position])).toEqual([
      ["Golgi body", "Packages proteins", 0],
      ["Lysosome", "Breaks down waste", 1],
      ["Vacuole", "Stores water", 2],
    ]);
    expect(page.url()).toContain(`/flashcards/${decksIn(backend)[0].id}`);
  });

  test("Ctrl+Enter adds a card right after the one you're typing in", async ({ context, page }) => {
    await setup(context, { decks: [], cards: [] });
    await page.goto("/flashcards/new");
    await page.getByLabel("Term for card 1").fill("first");
    await page.getByLabel("Term for card 1").press("Control+Enter");
    await expect(page.getByLabel("Term for card 2")).toBeFocused();
    await expect(page.getByLabel("Term for card 3")).toHaveValue(""); // the original 2nd row moved down
  });

  test("a missing title or a half-filled card stops the save and says why", async ({ context, page }) => {
    const backend = await setup(context, { decks: [], cards: [] });
    await page.goto("/flashcards/new");
    await page.getByLabel("Term for card 1").fill("Only a term");
    await page.getByRole("button", { name: "Create deck" }).first().click();
    await expect(page.getByText("Give the deck a title.").first()).toBeVisible();
    await page.getByLabel("Title").fill("Half");
    await page.getByRole("button", { name: "Create deck" }).first().click();
    await expect(page.getByText("Fill in both sides, or delete this card.")).toBeVisible();
    expect(decksIn(backend)).toHaveLength(0);
  });

  test("editing: reorder, star, delete and change a card; the rest keep their ids", async ({ context, page }) => {
    const backend = await setup(context);
    const ids = backend.db.flashcards.map((c) => c.id);
    await page.goto(`/flashcards/${DECK_ID}/edit`);
    await expect(page.getByLabel("Term for card 1")).toHaveValue("Mitochondria");
    await page.getByRole("button", { name: "Move card 1 down" }).click(); // Ribosome, Mitochondria, Nucleus
    await page.getByRole("button", { name: "Star card 3" }).click(); // Nucleus
    await page.getByRole("button", { name: "Delete card 1" }).click(); // Ribosome gone
    await page.getByLabel("Definition for card 1").fill("Powerhouse of the cell");
    await page.getByRole("button", { name: "Save" }).first().click();

    await expect(page.getByRole("heading", { name: "Cell biology" })).toBeVisible();
    expect(cardsOf(backend).map((c) => [c.id, c.term, c.definition, c.position, c.starred])).toEqual([
      [ids[0], "Mitochondria", "Powerhouse of the cell", 0, false],
      [ids[2], "Nucleus", "Holds the DNA", 1, true],
    ]);
  });

  test("swap terms and definitions", async ({ context, page }) => {
    const backend = await setup(context);
    await page.goto(`/flashcards/${DECK_ID}/edit`);
    await page.getByRole("button", { name: "Swap terms and definitions" }).click();
    await expect(page.getByLabel("Term for card 1")).toHaveValue("Makes energy for the cell");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect.poll(() => cardsOf(backend)[0]?.term).toBe("Makes energy for the cell");
  });

  test("importing a pasted Quizlet list adds the cards, says what was skipped, and can replace", async ({ context, page }) => {
    const backend = await setup(context);
    await page.goto(`/flashcards/${DECK_ID}/edit`);
    await page.getByRole("button", { name: "Import" }).click();
    await page.getByLabel("Cards to import").fill("Chloroplast\tDoes photosynthesis\nA heading with no tab\nCell wall\tRigid outer layer");
    await expect(page.getByText("2 cards found")).toBeVisible();
    await expect(page.getByText(/1 line skipped/)).toBeVisible();
    await page.getByRole("button", { name: "Add 2 cards" }).click();
    await expect(page.getByLabel("Term for card 4")).toHaveValue("Chloroplast");
    await expect(page.getByLabel("Term for card 5")).toHaveValue("Cell wall");

    await page.getByRole("button", { name: "Import" }).click();
    await page.getByLabel("Cards to import").fill("x, y; z, w");
    await page.getByLabel("Between term and definition").click();
    await page.getByRole("option", { name: "Comma" }).click();
    await page.getByLabel("Between cards").click();
    await page.getByRole("option", { name: "Semicolon" }).click();
    await page.getByLabel("Replace the cards already in the deck").click();
    await page.getByRole("button", { name: "Add 2 cards" }).click();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect.poll(() => cardsOf(backend).map((c) => c.term)).toEqual(["x", "z"]);
  });

  test("deleting a deck asks first and removes its cards", async ({ context, page }) => {
    const backend = await setup(context);
    await page.goto(`/flashcards/${DECK_ID}/edit`);
    await page.getByRole("button", { name: "Delete deck" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(decksIn(backend)).toHaveLength(1);
    await page.getByRole("button", { name: "Delete deck" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/flashcards$/);
    expect(decksIn(backend)).toHaveLength(0);
    expect(backend.db.flashcards).toHaveLength(0);
  });

  test("the deck list searches and shows progress", async ({ context, page }) => {
    await setup(context, {
      decks: [deck(), deck({ id: "f0000000-0000-4000-8000-000000000002", title: "Genetics", course_id: null })],
      cards: [card("a", "b", { known: true }), card("c", "d")],
    });
    await page.goto("/flashcards");
    await expect(page.getByText("2 cards · 1 known")).toBeVisible();
    await page.getByLabel("Search decks").fill("gene");
    await expect(page.getByRole("link", { name: /Genetics/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Cell biology/ })).toHaveCount(0);
  });
});

test.describe("decks for exams and quizzes", () => {
  test("a deck made from an exam's dialog starts linked to it, and shows up there", async ({ context, page }) => {
    const backend = await setup(context, { decks: [], cards: [] });
    await page.goto("/exams");
    await page.getByRole("button", { name: /Midterm 1/ }).last().click();
    await page.getByRole("link", { name: "Make flashcards for this exam" }).click();
    await expect(page.getByLabel("For exam")).toContainText("Midterm 1");
    await expect(page.getByLabel("Course")).toContainText("CHEM 111");
    await page.getByLabel("Title").fill("Midterm review");
    await page.getByLabel("Term for card 1").fill("t");
    await page.getByLabel("Definition for card 1").fill("d");
    await page.getByRole("button", { name: "Create deck" }).first().click();
    await expect(page.getByText(/For Midterm 1/)).toBeVisible();
    expect(decksIn(backend)[0]).toMatchObject({ exam_id: EXAM_ID, course_id: COURSE_ID, quiz_id: null });

    await page.goto("/exams");
    await page.getByRole("button", { name: /Midterm 1/ }).last().click();
    await expect(page.getByRole("link", { name: /Midterm review/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Another deck" })).toBeVisible();
  });

  test("a deck can be linked to a quiz too", async ({ context, page }) => {
    const backend = await setup(context);
    await page.goto(`/flashcards/${DECK_ID}/edit`);
    await page.getByLabel("For quiz").click();
    await page.getByRole("option", { name: /Quiz 3/ }).click();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText(/For Quiz 3/)).toBeVisible();
    expect(decksIn(backend)[0].quiz_id).toBe(QUIZ_ID);
  });
});

async function study(page: Page, mode: "cards" | "write" | "test") {
  await page.goto(`/flashcards/${DECK_ID}/${mode}`);
}

test.describe("flashcards mode", () => {
  test("flip with a click or Space, sort into know / still learning, then study the ones still learning", async ({ context, page }) => {
    const backend = await setup(context);
    await study(page, "cards");
    const flip = page.getByRole("button", { name: /Click to flip/ });
    await expect(flip).toHaveAccessibleName(/Term: Mitochondria/);
    await flip.click();
    await expect(page.getByRole("button", { name: /Definition: Makes energy for the cell/ })).toBeVisible();
    await page.getByRole("button", { name: "Know it" }).click();
    await expect(page.getByText("2 / 3")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: /Definition: Builds proteins/ })).toBeVisible();
    await page.keyboard.press("1"); // still learning
    await page.getByRole("button", { name: "Know it" }).click();

    await expect(page.getByText("You know 2, and you're still learning 1.")).toBeVisible();
    await expect.poll(() => backend.db.flashcards.map((c) => [c.term, c.known])).toEqual([
      ["Mitochondria", true],
      ["Ribosome", false],
      ["Nucleus", true],
    ]);
    await page.getByRole("button", { name: "Study the 1 you're still learning" }).click();
    await expect(page.getByRole("button", { name: /Term: Ribosome/ })).toBeVisible();
    await expect(page.getByText("1 / 1")).toBeVisible();
  });

  test("arrow keys move without sorting, and the definition can be shown first", async ({ context, page }) => {
    await setup(context, { decks: [deck({ settings: { ...IN_ORDER, flashcards: { shuffle: false, front: "definition" } } })] });
    await study(page, "cards");
    await expect(page.getByRole("button", { name: /Definition: Makes energy for the cell/ })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: /Definition: Builds proteins/ })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("button", { name: /Definition: Makes energy/ })).toBeVisible();
  });

  test("starring from the card", async ({ context, page }) => {
    const backend = await setup(context);
    await study(page, "cards");
    await page.getByRole("button", { name: "Star this card" }).click();
    await expect.poll(() => backend.db.flashcards[0].starred).toBe(true);
    await expect(page.getByRole("button", { name: "Unstar this card" })).toBeVisible();
  });

  test("'starred only' with nothing starred says so and offers the options", async ({ context, page }) => {
    await setup(context, { decks: [deck({ settings: { ...IN_ORDER, flashcards: { shuffle: false, filter: "starred" } } })] });
    await study(page, "cards");
    await expect(page.getByText("You've chosen starred cards only, and none are starred.")).toBeVisible();
    await page.getByRole("button", { name: "Change options" }).click();
    await expect(page.getByRole("dialog", { name: "Options" })).toBeVisible();
  });
});

test.describe("write mode", () => {
  test("type the term for each definition; forgiving grading; misses come back until right", async ({ context, page }) => {
    const backend = await setup(context);
    await study(page, "write");
    const answer = page.getByLabel(/Type the term/);

    await expect(page.getByText("Makes energy for the cell")).toBeVisible();
    await answer.fill("mitochondria"); // different case
    await answer.press("Enter");
    await expect(page.getByRole("status")).toContainText("Correct");
    await page.keyboard.press("Enter"); // Continue is focused

    await expect(page.getByText("Builds proteins")).toBeVisible();
    await answer.fill("lysosome");
    await answer.press("Enter");
    await expect(page.getByRole("status")).toContainText("Not quite");
    await expect(page.getByRole("status")).toContainText("The answer: Ribosome");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Holds the DNA")).toBeVisible();
    await answer.fill("Nucleous"); // a typo
    await answer.press("Enter");
    await expect(page.getByRole("status")).toContainText("Correct, but check the spelling");
    await page.getByRole("button", { name: "Continue" }).click();

    // round 2: just the miss
    await expect(page.getByText("round 2")).toBeVisible();
    await expect(page.getByText("Builds proteins")).toBeVisible();
    await answer.fill("Ribosome");
    await answer.press("Enter");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Done: you got all 3")).toBeVisible();
    await expect(page.getByText("2 right first time, 1 needed another go (2 rounds).")).toBeVisible();
    await expect.poll(() => backend.db.flashcards.every((c) => c.known)).toBe(true);
  });

  test("'I was right' counts a miss as correct; 'Don't know' shows the answer", async ({ context, page }) => {
    await setup(context, { cards: [card("Mitochondria", "Makes energy for the cell"), card("Ribosome", "Builds proteins")] });
    await study(page, "write");
    const answer = page.getByLabel(/Type the term/);
    await answer.fill("powerhouse");
    await answer.press("Enter");
    await page.getByRole("button", { name: "I was right" }).click();
    await expect(page.getByRole("status")).toContainText("Counted as correct");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Don't know" }).click();
    await expect(page.getByRole("status")).toContainText("Here's the answer");
    await expect(page.getByRole("button", { name: "I was right" })).toHaveCount(0);
    await page.getByRole("button", { name: "Continue" }).click();
    await answer.fill("ribosome");
    await answer.press("Enter");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("1 right first time, 1 needed another go (2 rounds).")).toBeVisible();
  });

  test("options: answer with the definition, strict capitals; saved with the deck", async ({ context, page }) => {
    const backend = await setup(context);
    await study(page, "write");
    await page.getByRole("button", { name: "Options" }).click();
    await page.getByRole("dialog").getByLabel("Definition", { exact: true }).click();
    await page.getByLabel("Ignore capital letters").click();
    await page.getByLabel("Allow small typos").click();
    await page.getByRole("button", { name: "Apply and restart" }).click();

    await expect(page.getByText("Mitochondria", { exact: true })).toBeVisible();
    const answer = page.getByLabel(/Type the definition/);
    await answer.fill("makes energy for the cell"); // lower-case "makes" no longer counts
    await answer.press("Enter");
    await expect(page.getByRole("status")).toContainText("Not quite");

    await expect.poll(() => (decksIn(backend)[0].settings as { write?: { answerWith?: string } }).write?.answerWith).toBe("definition");
    const grading = (decksIn(backend)[0].settings as { grading: Record<string, boolean> }).grading;
    expect(grading).toMatchObject({ ignoreCase: false, allowTypos: false, ignorePunctuation: true });
  });
});

test.describe("test mode", () => {
  test("a graded test: score, review, override, retake missed, and it's saved", async ({ context, page }) => {
    const backend = await setup(context);
    await study(page, "test");
    await expect(page.getByText("3 questions: you'll type the term.")).toBeVisible();
    await page.getByRole("button", { name: "Start test" }).click();

    await page.getByLabel("Answer 1: type the term").fill("Mitochondria");
    await page.getByLabel("Answer 1: type the term").press("Enter");
    await expect(page.getByLabel("Answer 2: type the term")).toBeFocused(); // Enter moves on
    await page.getByLabel("Answer 2: type the term").fill("Golgi");
    // question 3 left blank
    await page.getByRole("button", { name: "Submit test" }).click();
    await expect(page.getByText("Submit with 1 blank answer?")).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText("33%")).toBeVisible();
    await expect(page.getByText("1 of 3 correct")).toBeVisible();
    await expect.poll(() => backend.db.flashcard_test_results.length).toBe(1);
    expect(backend.db.flashcard_test_results[0]).toMatchObject({ deck_id: DECK_ID, total: 3, correct: 1 });

    // "Golgi" was a fair answer, say: count it
    await page.getByRole("button", { name: "Count as correct" }).first().click();
    await expect(page.getByText("2 of 3 correct")).toBeVisible();
    await expect.poll(() => backend.db.flashcard_test_results[0].correct).toBe(2);
    await expect.poll(() => backend.db.flashcards.map((c) => c.known)).toEqual([true, true, false]);

    await page.getByRole("button", { name: "Retake the 1 you missed" }).click();
    await expect(page.getByText("Holds the DNA")).toBeVisible();
    await expect(page.getByLabel(/Answer 2/)).toHaveCount(0);
  });

  test("the number of questions and which side are options", async ({ context, page }) => {
    await setup(context);
    await study(page, "test");
    await page.getByRole("button", { name: "Options" }).first().click();
    await page.getByLabel("Number of questions").fill("2");
    await page.getByRole("dialog").getByLabel("Both (mixed)").click();
    await page.getByRole("button", { name: "Apply and restart" }).click();
    await expect(page.getByText("2 questions: you'll type the term or the definition (mixed).")).toBeVisible();
    await page.getByRole("button", { name: "Start test" }).click();
    await expect(page.getByLabel(/^Answer \d/)).toHaveCount(2);
  });

  test("past tests are listed on the deck and can be reviewed", async ({ context, page }) => {
    const backend = await setup(context);
    backend.db.flashcard_test_results.push({
      id: "r0000000-0000-4000-8000-000000000001", deck_id: DECK_ID, user_id: USER_ID, total: 2, correct: 1, created_at: new Date().toISOString(),
      answers: [
        { card_id: "x", prompt: "Builds proteins", expected: "Ribosome", given: "Golgi", correct: false },
        { card_id: "y", prompt: "Holds the DNA", expected: "Nucleus", given: "Nucleus", correct: true },
      ],
    });
    await page.goto(`/flashcards/${DECK_ID}`);
    await page.getByRole("button", { name: /1\/2 · 50%/ }).click();
    await expect(page.getByText("You wrote: “Golgi” · Answer: “Ribosome”")).toBeVisible();
  });
});

test.describe("deck page", () => {
  test("shows the cards, which you know, stars, and resets progress", async ({ context, page }) => {
    const backend = await setup(context, { cards: [card("A", "a", { known: true }), card("B", "b")] });
    await page.goto(`/flashcards/${DECK_ID}`);
    await expect(page.getByText("1 of 2 cards known")).toBeVisible();
    await page.getByRole("button", { name: "Star card 2" }).click();
    await expect.poll(() => backend.db.flashcards[1].starred).toBe(true);
    await page.getByRole("button", { name: "Reset progress" }).click();
    await expect.poll(() => backend.db.flashcards.map((c) => c.known)).toEqual([false, false]);
  });

  test("a deck that doesn't exist says so", async ({ context, page }) => {
    await setup(context, { decks: [], cards: [] });
    await page.goto("/flashcards/f0000000-0000-4000-8000-00000000dead");
    await expect(page.getByText("That deck doesn't exist.")).toBeVisible();
  });
});
