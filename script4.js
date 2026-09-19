/* =====================================================================
   Aptitrio - Module 3 (Tests + Interview System) - script4.js
   Sections:
     1. Settings
     2. Saved data (shared data other modules can read)
     3. Question generators (all questions are original)
     4. Test list (3 level tests + 42 interview tests)
     5. Home screen
     6. Test engine (start, timer, questions, submit)
     7. Fullscreen + violation detection
     8. Results + review
     9. Public API for other modules
   ===================================================================== */

/* ---------- 1. SETTINGS ---------- */
const TOTAL_QUESTIONS = 25;
const PASS_MARK = 20;
const DURATION_MINUTES = 30;
const MAX_VIOLATIONS = 3;                // auto-submit after this many. Set to 0 to turn auto-submit off.
const COUNT_ONLY_PASSED_INTERVIEWS = false; // false = every submitted interview test counts as completed
const LEVELS = [
  { id: "beginner", name: "Beginner", difficulty: 1 },
  { id: "intermediate", name: "Intermediate", difficulty: 2 },
  { id: "advanced", name: "Advanced", difficulty: 3 }
];
const DIFFICULTY_NAMES = ["Beginner", "Intermediate", "Advanced"];

/* ---------- 2. SAVED DATA ---------- */
const KEYS = {
  results: "aptitrio_testResults",
  scores: "aptitrio_levelTestScores",
  passed: "aptitrio_passedLevelTests",
  interview: "aptitrio_interviewTestsCompletedIds",
  topics: "aptitrio_topicsCompleted"   // the Topics module should write { beginner: true, ... } here
};

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
}

let testResults = load(KEYS.results, []);          // every finished test
let levelTestScores = load(KEYS.scores, {});       // best score per level, e.g. { beginner: 22 }
let passedLevelTests = load(KEYS.passed, {});      // e.g. { beginner: true }
let interviewIds = load(KEYS.interview, []);       // ids of completed interview tests
let topicsCompleted = load(KEYS.topics, {});       // set by the main app (demo switches here)

/* ---------- 3. QUESTION GENERATORS ---------- */
// Small helpers
function hashText(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function makeRandom(seed) {              // tiny random number generator (mulberry32)
  let a = seed;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (r, min, max) => min + Math.floor(r() * (max - min + 1));
const pick = (r, list) => list[Math.floor(r() * list.length)];
function shuffle(r, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pickMany = (r, list, n) => shuffle(r, list).slice(0, n);
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

// Build a question. "wrong" holds 3 wrong options.
function mk(topic, q, correct, wrong, unit = "") {
  return { topic, q, correct: correct + unit, wrong: wrong.map(w => w + unit) };
}
// Make 3 different wrong numbers close to the correct one
function numWrongs(r, correct, step) {
  const set = new Set();
  while (set.size < 3) {
    const w = correct + rand(r, 1, 4) * step * (r() < 0.5 ? -1 : 1);
    if (w > 0 && w !== correct) set.add(w);
  }
  return [...set];
}

/* ----- Quantitative Aptitude (d = difficulty 1, 2 or 3) ----- */
function percentage(r, d) {
  const p = pick(r, [5, 10, 15, 20, 25, 30, 40, 50, 60, 75]);
  const n = rand(r, 2, 10 * d + 8) * 20;
  const a = (p * n) / 100;
  return mk("Percentages", `What is ${p}% of ${n}?`, a, numWrongs(r, a, 5 * d));
}
function profitLoss(r, d) {
  const p = pick(r, [5, 10, 20, 25]);
  const cp = rand(r, 3, 10 * d + 10) * 20;
  const sp = (cp * (100 + p)) / 100;
  if (d > 1 && r() < 0.5) {
    return mk("Profit & Loss", `An article is sold for Rs ${sp} at a profit of ${p}%. What is its cost price (in Rs)?`, cp, numWrongs(r, cp, 20));
  }
  return mk("Profit & Loss", `An article bought for Rs ${cp} is sold at a profit of ${p}%. What is the selling price (in Rs)?`, sp, numWrongs(r, sp, 10));
}
function timeWork(r) {
  const [a, b, t] = pick(r, [[12, 12, 6], [10, 15, 6], [20, 30, 12], [12, 24, 8], [15, 30, 10], [6, 12, 4], [18, 36, 12], [30, 60, 20], [20, 20, 10], [24, 24, 12]]);
  return mk("Time & Work", `A can finish a job in ${a} days and B can finish it in ${b} days. Working together, in how many days will they finish it?`, t, numWrongs(r, t, 2), " days");
}
function speedDistance(r, d) {
  if (d > 1 && r() < 0.5) {
    const [x, y, avg] = pick(r, [[40, 60, 48], [30, 60, 40], [20, 30, 24], [60, 90, 72], [30, 45, 36], [50, 75, 60]]);
    return mk("Speed & Distance", `A car covers the first half of a trip at ${x} km/h and the second half at ${y} km/h. What is its average speed for the whole trip?`, avg, numWrongs(r, avg, 4), " km/h");
  }
  const s = rand(r, 4, 10 + d * 4) * 10;
  const t = rand(r, 2, 3 + d * 2);
  return mk("Speed & Distance", `A train travels at ${s} km/h for ${t} hours. How far does it travel?`, s * t, numWrongs(r, s * t, 10), " km");
}
function simpleInterest(r, d) {
  const P = rand(r, 1, 5 * d) * 1000;
  const R = pick(r, [5, 8, 10, 12]);
  const T = rand(r, 2, 5);
  const si = (P * R * T) / 100;
  return mk("Simple Interest", `What is the simple interest on Rs ${P} at ${R}% per year for ${T} years (in Rs)?`, si, numWrongs(r, si, 50));
}
function ratio(r, d) {
  const a = rand(r, 1, 4);
  const b = rand(r, a + 1, 7);
  const k = rand(r, 2, 5 * d + 4) * 10;
  return mk("Ratio & Proportion", `Rs ${(a + b) * k} is divided between two people in the ratio ${a}:${b}. What is the larger share (in Rs)?`, b * k, numWrongs(r, b * k, 10));
}
function average(r) {
  const m = rand(r, 40, 70);
  const nums = [0, 1, 2, 3].map(() => m + rand(r, -8, 8));
  const fifth = 5 * m - nums.reduce((sum, x) => sum + x, 0);
  return mk("Averages", `The average of five numbers is ${m}. Four of them are ${nums.join(", ")}. What is the fifth number?`, fifth, numWrongs(r, fifth, 3));
}
function lcmHcf(r, d) {
  const a = rand(r, 4, 12 + d * 6);
  let b;
  do { b = rand(r, 4, 12 + d * 6); } while (b === a);
  const g = gcd(a, b);
  if (r() < 0.5) return mk("LCM & HCF", `Find the HCF of ${a} and ${b}.`, g, numWrongs(r, g, 1));
  return mk("LCM & HCF", `Find the LCM of ${a} and ${b}.`, (a * b) / g, numWrongs(r, (a * b) / g, 6));
}

/* ----- Logical Reasoning ----- */
function numberSeries(r, d) {
  const kind = rand(r, 0, d);   // harder levels allow more series types
  let s = [], next;
  if (kind === 0) {             // add the same number each time
    const a = rand(r, 2, 20), step = rand(r, 2, 9);
    s = [0, 1, 2, 3, 4].map(i => a + i * step);
    next = a + 5 * step;
  } else if (kind === 1) {      // the added number grows: +1, +2, +3 ...
    s = [rand(r, 1, 10)];
    for (let i = 1; i <= 5; i++) s.push(s[i - 1] + i);
    next = s.pop();
  } else if (kind === 2) {      // multiply each time
    const a = rand(r, 1, 5), m = rand(r, 2, 3);
    s = [0, 1, 2, 3, 4].map(i => a * Math.pow(m, i));
    next = a * Math.pow(m, 5);
  } else {                      // squares plus a constant
    const k = rand(r, 1, 9), c = rand(r, 0, 5);
    s = [0, 1, 2, 3, 4].map(i => (k + i) * (k + i) + c);
    next = (k + 5) * (k + 5) + c;
  }
  return mk("Number Series", `Find the next number in the series:\n${s.join(", ")}, ?`, next, numWrongs(r, next, 2));
}
function coding(r) {
  const word = pick(r, ["CAT", "DOG", "MANGO", "PLANE", "BRAIN", "STONE", "TRAIN", "LEMON"]);
  const k = rand(r, 1, 4);
  const shift = (w, n) => w.split("").map(c => String.fromCharCode(((c.charCodeAt(0) - 65 + n) % 26) + 65)).join("");
  return {
    topic: "Coding-Decoding",
    q: `In a certain code, every letter is replaced by the letter ${k} place${k > 1 ? "s" : ""} ahead in the alphabet. How is ${word} written in that code?`,
    correct: shift(word, k),
    wrong: [shift(word, k + 1), shift(word, k + 2), shift(word, k + 3)]
  };
}
function direction(r) {
  const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]);
  const [d1, d2] = pick(r, [["north", "east"], ["south", "west"], ["east", "south"], ["west", "north"]]);
  return mk("Direction Sense", `Ravi walks ${a} km ${d1}, then turns and walks ${b} km ${d2}. How far is he from his starting point (in km)?`, c, numWrongs(r, c, 1), " km");
}
function ranking(r) {
  const left = rand(r, 4, 20), right = rand(r, 4, 20);
  const total = left + right - 1;
  return mk("Ranking", `In a row, Meena is at position ${left} from the left end and position ${right} from the right end. How many people are in the row?`, total, numWrongs(r, total, 1));
}
const RELATIONS = ["Uncle", "Aunt", "Father", "Mother", "Son", "Nephew", "Cousin", "Brother", "Grandfather"];
const BLOOD = [
  ["A is the brother of B. B is the mother of C. How is A related to C?", "Uncle"],
  ["P is the father of Q. Q is the sister of R. How is P related to R?", "Father"],
  ["X is the son of Y. Y is the son of Z. How is Z related to X?", "Grandfather"],
  ["M is the brother of N. N is the daughter of O. How is M related to O?", "Son"],
  ["A's mother is the sister of B. How is B related to A?", "Aunt"],
  ["Pointing to a boy, Riya says, \"He is the son of my father's only son.\" How is the boy related to Riya?", "Nephew"]
];
function bloodRelation(r) {
  const [q, ans] = pick(r, BLOOD);
  return { topic: "Blood Relations", q, correct: ans, wrong: pickMany(r, RELATIONS.filter(x => x !== ans), 3) };
}
function syllogism(r) {
  const [a, b, c] = pick(r, [["pens", "books", "papers"], ["roses", "flowers", "plants"], ["cars", "vehicles", "machines"], ["doctors", "graduates", "professionals"]]);
  if (r() < 0.5) {
    return { topic: "Syllogisms", q: `Statements: All ${a} are ${b}. All ${b} are ${c}.\nWhich conclusion definitely follows?`, correct: `All ${a} are ${c}`, wrong: [`All ${c} are ${a}`, `No ${a} is ${c}`, `All ${c} are ${b}`] };
  }
  return { topic: "Syllogisms", q: `Statements: Some ${a} are ${b}. All ${b} are ${c}.\nWhich conclusion definitely follows?`, correct: `Some ${a} are ${c}`, wrong: [`All ${a} are ${c}`, `No ${a} is ${c}`, `All ${c} are ${a}`] };
}

/* ----- Verbal Ability ----- */
const SYNONYMS = [["Rapid", "Quick"], ["Abundant", "Plentiful"], ["Brave", "Courageous"], ["Ancient", "Old"], ["Assist", "Help"], ["Difficult", "Hard"], ["Silent", "Quiet"], ["Huge", "Enormous"], ["Begin", "Commence"], ["Fragile", "Delicate"], ["Honest", "Truthful"], ["Tired", "Weary"], ["Cautious", "Careful"], ["Reluctant", "Unwilling"], ["Diligent", "Hardworking"], ["Scarce", "Rare"]];
const ANTONYMS = [["Ancient", "Modern"], ["Generous", "Stingy"], ["Expand", "Shrink"], ["Victory", "Defeat"], ["Optimistic", "Pessimistic"], ["Transparent", "Opaque"], ["Temporary", "Permanent"], ["Accept", "Reject"], ["Increase", "Decrease"], ["Bold", "Timid"], ["Vague", "Clear"], ["Arrive", "Depart"], ["Rigid", "Flexible"], ["Sincere", "Deceitful"], ["Cheap", "Expensive"]];
const FILL = [
  ["She is good ___ mathematics.", "at", ["in", "on", "with"]],
  ["He has been waiting ___ two hours.", "for", ["since", "from", "by"]],
  ["Neither of the boys ___ present.", "was", ["were", "are", "have been"]],
  ["The team ___ won the match.", "has", ["have", "are", "were"]],
  ["I look forward ___ meeting you.", "to", ["for", "at", "on"]],
  ["She said that she ___ tired.", "was", ["is", "were", "be"]],
  ["If I ___ you, I would apply.", "were", ["am", "was", "be"]],
  ["The news ___ good.", "is", ["are", "were", "have"]],
  ["He is senior ___ me.", "to", ["than", "from", "of"]],
  ["Each of the students ___ a book.", "has", ["have", "are having", "were"]],
  ["We shared the sweets ___ the three children.", "among", ["between", "within", "across"]],
  ["She prefers tea ___ coffee.", "to", ["than", "over", "from"]]
];
const SPELLING = [
  ["Necessary", ["Neccessary", "Necesary", "Necessery"]], ["Accommodation", ["Accomodation", "Acommodation", "Accommadation"]],
  ["Embarrass", ["Embarass", "Embarrase", "Emberrass"]], ["Separate", ["Seperate", "Separete", "Seprate"]],
  ["Definitely", ["Definately", "Definitly", "Defenitely"]], ["Occurrence", ["Occurence", "Ocurrence", "Occurrance"]],
  ["Government", ["Goverment", "Governmant", "Govenment"]], ["Receive", ["Recieve", "Receve", "Riceive"]],
  ["Conscience", ["Consience", "Conscense", "Concience"]], ["Environment", ["Enviroment", "Envirenment", "Environmant"]]
];
function synonym(r) {
  const [word, ans] = pick(r, SYNONYMS);
  const wrong = pickMany(r, SYNONYMS.filter(x => x[0] !== word).map(x => x[1]), 3);
  return { topic: "Synonyms", q: `Choose the word closest in meaning to "${word}".`, correct: ans, wrong };
}
function antonym(r) {
  const [word, ans] = pick(r, ANTONYMS);
  const wrong = pickMany(r, ANTONYMS.filter(x => x[0] !== word).map(x => x[1]), 3);
  return { topic: "Antonyms", q: `Choose the word opposite in meaning to "${word}".`, correct: ans, wrong };
}
function sentence(r) {
  const [text, ans, wrong] = pick(r, FILL);
  return { topic: "Sentence Completion", q: `Fill in the blank:\n${text}`, correct: ans, wrong };
}
function spelling(r) {
  const [right, wrong] = pick(r, SPELLING);
  return { topic: "Spelling", q: "Which word is spelled correctly?", correct: right, wrong };
}

/* ----- Data Interpretation ----- */
function makeData(r) {
  const names = pick(r, [["Jan", "Feb", "Mar", "Apr"], ["Mon", "Tue", "Wed", "Thu"], ["Plant A", "Plant B", "Plant C", "Plant D"]]);
  let values;
  do { values = names.map(() => rand(r, 3, 15) * 20); } while (new Set(values).size < 4);
  const text = "Units produced: " + names.map((n, i) => `${n} = ${values[i]}`).join(", ") + ".";
  return { names, values, text, sum: values.reduce((s, x) => s + x, 0) };
}
function diTotal(r) {
  const d = makeData(r);
  return mk("Data Interpretation", `${d.text}\nWhat is the total production?`, d.sum, numWrongs(r, d.sum, 20));
}
function diAverage(r) {
  const d = makeData(r);
  return mk("Data Interpretation", `${d.text}\nWhat is the average production?`, d.sum / 4, numWrongs(r, d.sum / 4, 5));
}
function diHighest(r) {
  const d = makeData(r);
  const top = d.values.indexOf(Math.max(...d.values));
  return { topic: "Data Interpretation", q: `${d.text}\nWhich one had the highest production?`, correct: d.names[top], wrong: d.names.filter((n, i) => i !== top) };
}
function diDifference(r) {
  const d = makeData(r);
  const diff = Math.max(...d.values) - Math.min(...d.values);
  return mk("Data Interpretation", `${d.text}\nWhat is the difference between the highest and the lowest production?`, diff, numWrongs(r, diff, 20));
}
function diPercent(r) {
  const a = pick(r, [80, 100, 120, 160, 200, 250]);
  const p = pick(r, [10, 20, 25, 50]);
  const b = (a * (100 + p)) / 100;
  return mk("Data Interpretation", `Production rose from ${a} units in the first month to ${b} units in the second month. What is the percentage increase?`, p, numWrongs(r, p, 5), "%");
}

const QUANT = [percentage, profitLoss, timeWork, speedDistance, simpleInterest, ratio, average, lcmHcf];
const LOGIC = [numberSeries, coding, direction, ranking, bloodRelation, syllogism];
const VERBAL = [synonym, antonym, sentence, spelling];
const DATA = [diTotal, diAverage, diHighest, diDifference, diPercent];
const EVERYTHING = [...QUANT, ...LOGIC, ...VERBAL, ...DATA];

// Build 25 different questions from a pool of generators
function buildQuestions(pool, difficulty) {
  const r = makeRandom(hashText("aptitrio" + Date.now() + Math.random()));
  const list = [];
  const seen = new Set();
  let bag = [];
  let tries = 0;
  while (list.length < TOTAL_QUESTIONS && tries < 1000) {
    tries++;
    if (bag.length === 0) bag = shuffle(r, pool);   // use every generator once before repeating
    const q = bag.pop()(r, difficulty);
    if (seen.has(q.q)) continue;                     // skip duplicates
    seen.add(q.q);
    const options = shuffle(r, [q.correct, ...q.wrong]);
    list.push({ topic: q.topic, text: q.q, options, answer: options.indexOf(q.correct) });
  }
  return list;
}

/* ---------- 4. TEST LIST ---------- */
const LEVEL_TESTS = LEVELS.map(level => ({
  id: "level-" + level.id, type: "level", level: level.id,
  title: level.name + " Test", pool: EVERYTHING, difficulty: level.difficulty
}));

const CATEGORIES = [
  { name: "Quantitative Aptitude", pool: QUANT },
  { name: "Logical Reasoning", pool: LOGIC },
  { name: "Verbal Ability", pool: VERBAL },
  { name: "Data Interpretation", pool: DATA },
  { name: "Mixed Aptitude", pool: EVERYTHING },
  { name: "Placement Aptitude", pool: EVERYTHING },
  { name: "Interview Preparation", pool: EVERYTHING }
];
const INTERVIEW_TESTS = [];
CATEGORIES.forEach(cat => {
  for (let i = 0; i < 6; i++) {                       // 7 categories x 6 tests = 42 tests
    const number = INTERVIEW_TESTS.length + 1;
    const label = String(number).padStart(2, "0");
    INTERVIEW_TESTS.push({
      id: "interview-" + label, type: "interview", title: "INTERVIEW TEST #" + label,
      category: cat.name, pool: cat.pool, difficulty: (i % 3) + 1
    });
  }
});
const ALL_TESTS = [...LEVEL_TESTS, ...INTERVIEW_TESTS];

/* ---------- 5. HOME SCREEN ---------- */
const $ = id => document.getElementById(id);
const VIEWS = ["homeView", "instructionView", "examView", "resultView", "reviewView"];
let selectedCategory = "All";

function showView(id) {
  VIEWS.forEach(v => { $(v).hidden = v !== id; });
  window.scrollTo(0, 0);
}
function formatTime(seconds) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
function bestScore(testId) {
  const scores = testResults.filter(t => t.testId === testId).map(t => t.score);
  return scores.length ? Math.max(...scores) : null;
}

// Is this level test open? Returns { open, message }
function levelStatus(level) {
  const index = LEVELS.findIndex(l => l.id === level.id);
  const previous = LEVELS[index - 1];
  if (previous && !passedLevelTests[previous.id]) {
    return { open: false, message: `Pass the ${previous.name} Test (${PASS_MARK}/${TOTAL_QUESTIONS}) to unlock the ${level.name} level.` };
  }
  if (!topicsCompleted[level.id]) {
    return { open: false, message: `Complete all ${level.name} topics to unlock the test.` };
  }
  return { open: true, message: "" };
}

function renderLevelCards() {
  $("levelCards").innerHTML = LEVEL_TESTS.map((test, i) => {
    const level = LEVELS[i];
    const status = levelStatus(level);
    if (!status.open) {
      return `<div class="card locked"><h3>🔒 ${level.name.toUpperCase()} TEST</h3><p>${status.message}</p></div>`;
    }
    const best = levelTestScores[level.id];
    const note = passedLevelTests[level.id]
      ? `<p class="passed-note">Passed. Best score ${best} / ${TOTAL_QUESTIONS}</p>`
      : (best !== undefined ? `<p>Best score so far: ${best} / ${TOTAL_QUESTIONS}</p>` : "");
    return `<div class="card"><h3>${level.name.toUpperCase()} TEST</h3>
      <p>${TOTAL_QUESTIONS} questions · ${DURATION_MINUTES} minutes · pass ${PASS_MARK}/${TOTAL_QUESTIONS}</p>${note}
      <button class="btn primary" data-start="${test.id}">${best !== undefined ? "RETAKE TEST" : "START TEST"}</button></div>`;
  }).join("");

  $("demoControls").innerHTML = LEVELS.map(l =>
    `<label><input type="checkbox" data-topic="${l.id}" ${topicsCompleted[l.id] ? "checked" : ""}> All ${l.name} topics completed</label>`
  ).join("");
}

function renderInterviewCards() {
  $("interviewSummary").textContent = `Completed: ${interviewIds.length} of ${INTERVIEW_TESTS.length} interview tests`;
  const names = ["All", ...CATEGORIES.map(c => c.name)];
  $("categoryFilter").innerHTML = names.map(n =>
    `<button class="chip ${n === selectedCategory ? "active" : ""}" data-category="${n}">${n}</button>`).join("");

  const shown = INTERVIEW_TESTS.filter(t => selectedCategory === "All" || t.category === selectedCategory);
  $("interviewCards").innerHTML = shown.map(t => {
    const level = DIFFICULTY_NAMES[t.difficulty - 1];
    const best = bestScore(t.id);
    return `<div class="card"><h3>${t.title}</h3><p>${t.category}</p>
      <p>${TOTAL_QUESTIONS} Questions · ${DURATION_MINUTES} Minutes</p>
      <p>Difficulty: <span class="tag ${level}">${level}</span></p>
      ${best !== null ? `<p>Best score: ${best} / ${TOTAL_QUESTIONS}</p>` : ""}
      <button class="btn primary" data-start="${t.id}">START TEST</button></div>`;
  }).join("");
}

function renderHome() {
  const onInterview = location.hash === "#/tests/interview";   // /tests/interview page
  $("levelSection").hidden = onInterview;
  $("interviewSection").hidden = !onInterview;
  $("tabLevel").classList.toggle("active", !onInterview);
  $("tabInterview").classList.toggle("active", onInterview);
  renderLevelCards();
  renderInterviewCards();
}
function goHome() {
  showView("homeView");
  renderHome();
}

/* ---------- 6. TEST ENGINE ---------- */
let currentTest = null;
let questions = [], answers = [], current = 0;
let startTime = 0, endTime = 0, timerId = null;
let examActive = false;
let lastAttempt = null;   // kept so the review screen can show the questions

function openInstructions(test) {
  currentTest = test;
  $("instructionTitle").textContent = test.title + (test.category ? " · " + test.category : "");
  showView("instructionView");
}

function beginTest() {
  questions = buildQuestions(currentTest.pool, currentTest.difficulty);
  answers = new Array(questions.length).fill(-1);
  current = 0;
  violations = 0;
  lastViolationAt = 0;
  startTime = Date.now();                                  // timer starts NOW
  endTime = startTime + DURATION_MINUTES * 60 * 1000;
  examActive = true;
  $("examTitle").textContent = currentTest.title;
  updateViolationBadge();
  showView("examView");
  enterFullscreen();                                       // allowed because START was clicked
  renderQuestion();
  clearInterval(timerId);
  timerId = setInterval(tick, 500);
  tick();
}

function tick() {
  const left = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  $("timer").textContent = formatTime(left);
  $("timer").classList.toggle("low", left <= 300);
  if (left === 0) submitTest("Time is up. Your test was submitted automatically.");
}

function renderQuestion() {
  const q = questions[current];
  $("qCounter").textContent = `Question ${current + 1} / ${questions.length}`;
  $("qTopic").textContent = "1 mark";
  $("qText").textContent = q.text;
  $("options").innerHTML = q.options.map((opt, i) =>
    `<label class="option ${answers[current] === i ? "selected" : ""}">
       <input type="radio" name="option" value="${i}" ${answers[current] === i ? "checked" : ""}>
       <span>${String.fromCharCode(65 + i)}. ${opt}</span></label>`).join("");
  $("prevBtn").disabled = current === 0;
  $("nextBtn").disabled = current === questions.length - 1;
  renderNavigator();
}

function renderNavigator() {
  $("navGrid").innerHTML = questions.map((q, i) =>
    `<button class="nav-cell ${answers[i] !== -1 ? "answered" : ""} ${i === current ? "current" : ""}"
       data-goto="${i}" aria-label="Question ${i + 1}, ${answers[i] !== -1 ? "answered" : "unanswered"}">${i + 1}</button>`).join("");
  const done = answers.filter(a => a !== -1).length;
  $("answeredCount").textContent = `${done} answered, ${questions.length - done} unanswered`;
}

function goTo(index) {
  current = Math.min(Math.max(index, 0), questions.length - 1);
  renderQuestion();
}

function openConfirm() {
  const done = answers.filter(a => a !== -1).length;
  $("confirmInfo").textContent = `You have answered ${done} of ${questions.length} questions.` +
    (done < questions.length ? ` ${questions.length - done} unanswered will get 0 marks.` : "");
  $("confirmModal").hidden = false;
}

/* ---------- 7. FULLSCREEN + VIOLATION DETECTION ---------- */
// NOTE: a web page cannot block tab switching or minimizing.
// We can only detect it (where the browser supports it) and record it.
let violations = 0, lastViolationAt = 0, fullscreenWorked = false;

function enterFullscreen() {
  fullscreenWorked = false;
  const page = document.documentElement;
  if (!page.requestFullscreen) {
    $("examTitle").textContent = currentTest.title + " (fullscreen not supported)";
    return;
  }
  page.requestFullscreen()
    .then(() => { fullscreenWorked = true; })
    .catch(() => { $("examTitle").textContent = currentTest.title + " (fullscreen blocked)"; });
}
function leaveFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
function updateViolationBadge() {
  $("violationBadge").textContent = "Violations: " + violations;
  $("violationBadge").classList.toggle("hot", violations > 0);
}

function recordViolation(reason) {
  if (!examActive) return;
  const now = Date.now();
  if (now - lastViolationAt < 1500) return;   // one tab switch fires several events; count it once
  lastViolationAt = now;
  violations++;
  updateViolationBadge();
  if (MAX_VIOLATIONS > 0 && violations >= MAX_VIOLATIONS) {
    submitTest(`Your test was submitted automatically after ${MAX_VIOLATIONS} violations.`);
    return;
  }
  $("violationInfo").textContent = reason + (MAX_VIOLATIONS > 0
    ? ` Violation ${violations} of ${MAX_VIOLATIONS}. The test is submitted automatically at ${MAX_VIOLATIONS}.`
    : ` Violations so far: ${violations}.`);
  $("violationModal").hidden = false;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) recordViolation("You switched tabs or minimized the window.");
});
window.addEventListener("blur", () => recordViolation("The test window lost focus."));
document.addEventListener("fullscreenchange", () => {
  if (examActive && fullscreenWorked && !document.fullscreenElement) recordViolation("You exited fullscreen mode.");
});
window.addEventListener("beforeunload", e => {
  if (examActive) { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- 8. SUBMIT, RESULTS, REVIEW ---------- */
// Placeholder XP. The XP module owns the real calculation and can replace this.
function calculateXP(score, passed) {
  return score * 10 + (passed ? 30 : 0);
}

function submitTest(note) {
  if (!examActive) return;
  examActive = false;                        // stop violation tracking first
  clearInterval(timerId);
  leaveFullscreen();
  $("confirmModal").hidden = true;
  $("violationModal").hidden = true;

  let score = 0;
  const wrongByTopic = {};
  questions.forEach((q, i) => {
    if (answers[i] === q.answer) score++;
    else wrongByTopic[q.topic] = (wrongByTopic[q.topic] || 0) + 1;
  });
  const passed = score >= PASS_MARK;
  const result = {
    testId: currentTest.id,
    type: currentTest.type,
    score,
    totalMarks: questions.length,
    accuracy: Math.round((score / questions.length) * 100),
    timeTaken: Math.min(Math.round((Date.now() - startTime) / 1000), DURATION_MINUTES * 60),  // seconds
    passed,
    weakTopics: Object.entries(wrongByTopic).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]),
    completedAt: new Date().toISOString(),
    // extra details
    title: currentTest.title,
    xpEarned: calculateXP(score, passed),
    violations
  };

  // save shared data
  testResults.push(result);
  save(KEYS.results, testResults);
  let unlocked = "";
  if (currentTest.type === "level") {
    levelTestScores[currentTest.level] = Math.max(levelTestScores[currentTest.level] || 0, score);
    save(KEYS.scores, levelTestScores);
    if (passed) {
      passedLevelTests[currentTest.level] = true;
      save(KEYS.passed, passedLevelTests);
      const index = LEVELS.findIndex(l => l.id === currentTest.level);
      unlocked = index < LEVELS.length - 1 ? LEVELS[index + 1].id : "interview";
      document.dispatchEvent(new CustomEvent("aptitrio:levelUnlocked", { detail: { level: unlocked } }));
    }
  } else if ((passed || !COUNT_ONLY_PASSED_INTERVIEWS) && !interviewIds.includes(currentTest.id)) {
    interviewIds.push(currentTest.id);
    save(KEYS.interview, interviewIds);
  }
  document.dispatchEvent(new CustomEvent("aptitrio:testCompleted", { detail: result }));

  lastAttempt = { test: currentTest, result, questions, answers: [...answers], note, unlocked };
  showResult();
}

function showResult() {
  const { test, result, note, unlocked } = lastAttempt;
  const wrong = result.totalMarks - result.score;
  $("resultTitle").textContent = test.title + (note ? " · " + note : "");
  $("resultStatus").textContent = result.passed ? "Status: PASSED" : "Status: FAILED";
  $("resultStatus").className = "status " + (result.passed ? "pass" : "fail");
  $("resultFacts").innerHTML = [
    ["Score", `${result.score} / ${result.totalMarks}`], ["Accuracy", result.accuracy + "%"],
    ["Time taken", formatTime(result.timeTaken)], ["XP earned", "+" + result.xpEarned + " XP"],
    ["Correct answers", result.score], ["Incorrect answers", wrong], ["Violations", result.violations]
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  // level unlock message
  const message = $("unlockMessage");
  message.hidden = test.type !== "level";
  if (test.type === "level") {
    const next = LEVELS.find(l => l.id === unlocked);
    if (result.passed) message.textContent = next ? `🔓 ${next.name} level unlocked!` : "🔓 Advanced complete! Interview Preparation is next. Try the Interview Tests.";
    else message.textContent = "The next level stays locked. Score at least " + PASS_MARK + " / " + TOTAL_QUESTIONS + " to unlock it.";
  }

  // weak topics
  $("weakBox").innerHTML = result.weakTopics.length
    ? `<div class="weak"><strong>Weak topics</strong><ul>${result.weakTopics.map(t => `<li>${t}</li>`).join("")}</ul>
       <p class="muted">Recommended practice: revise ${result.weakTopics.join(", ")} in Topic Practice, then try again.</p></div>`
    : `<div class="weak"><strong>Weak topics</strong><p class="muted">None. Every answer was correct.</p></div>`;

  $("resultButtons").innerHTML = result.passed
    ? `<button class="btn" data-action="review-all">REVIEW ANSWERS</button>
       <button class="btn primary" data-action="home">BACK TO TESTS</button>`
    : `<button class="btn" data-action="review-weak">REVIEW WEAK TOPICS</button>
       <button class="btn primary" data-action="retake">RETAKE TEST</button>
       <button class="btn" data-action="home">BACK TO TESTS</button>`;
  showView("resultView");
}

function showReview(onlyWrong) {
  const { questions: qs, answers: given } = lastAttempt;
  $("reviewHeading").textContent = onlyWrong ? "Review weak topics" : "Review answers";
  let html = "";
  qs.forEach((q, i) => {
    const right = given[i] === q.answer;
    if (onlyWrong && right) return;
    html += `<div class="review-item ${right ? "right" : "wrong"}">
      <p class="muted">Question ${i + 1} · ${q.topic}</p>
      <p class="q">${q.text}</p>
      <p>Your answer: ${given[i] === -1 ? "Not answered" : q.options[given[i]]}</p>
      <p>Correct answer: <strong>${q.options[q.answer]}</strong></p></div>`;
  });
  $("reviewList").innerHTML = html || "<p>Nothing to review. Every answer was correct.</p>";
  showView("reviewView");
}

/* ---------- BUTTONS AND CLICKS ---------- */
document.addEventListener("click", e => {
  const start = e.target.closest("[data-start]");
  if (start) openInstructions(ALL_TESTS.find(t => t.id === start.dataset.start));

  const category = e.target.closest("[data-category]");
  if (category) { selectedCategory = category.dataset.category; renderInterviewCards(); }

  const jump = e.target.closest("[data-goto]");
  if (jump) goTo(Number(jump.dataset.goto));

  const action = e.target.closest("[data-action]");
  if (action) {
    if (action.dataset.action === "home") goHome();
    if (action.dataset.action === "retake") openInstructions(lastAttempt.test);
    if (action.dataset.action === "review-all") showReview(false);
    if (action.dataset.action === "review-weak") showReview(true);
  }
});

document.addEventListener("change", e => {
  if (e.target.name === "option") {                        // answer selected
    answers[current] = Number(e.target.value);
    [...$("options").children].forEach((label, i) => label.classList.toggle("selected", i === answers[current]));
    renderNavigator();
  }
  if (e.target.dataset.topic) {                            // demo switch
    topicsCompleted[e.target.dataset.topic] = e.target.checked;
    save(KEYS.topics, topicsCompleted);
    renderLevelCards();
  }
});

$("startBtn").addEventListener("click", beginTest);
$("cancelBtn").addEventListener("click", goHome);
$("prevBtn").addEventListener("click", () => goTo(current - 1));
$("nextBtn").addEventListener("click", () => goTo(current + 1));
$("clearBtn").addEventListener("click", () => { answers[current] = -1; renderQuestion(); });
$("submitBtn").addEventListener("click", openConfirm);
$("reviewAnswersBtn").addEventListener("click", () => {
  $("confirmModal").hidden = true;
  const firstEmpty = answers.indexOf(-1);
  if (firstEmpty !== -1) goTo(firstEmpty);                 // jump to the first unanswered question
});
$("confirmSubmitBtn").addEventListener("click", () => submitTest());
$("returnBtn").addEventListener("click", () => {
  $("violationModal").hidden = true;
  if (fullscreenWorked && !document.fullscreenElement) enterFullscreen();
});
$("reviewBackBtn").addEventListener("click", () => showView("resultView"));
$("resetAllBtn").addEventListener("click", () => {
  if (!confirm("Delete all saved test results and demo switches?")) return;
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  testResults = []; levelTestScores = {}; passedLevelTests = {}; interviewIds = []; topicsCompleted = {};
  renderHome();
});
window.addEventListener("hashchange", () => { if (!examActive && !$("homeView").hidden) renderHome(); });

/* ---------- 9. PUBLIC API FOR OTHER MODULES ---------- */
// Other modules can read:  AptitrioTests.testResults, .levelTestScores, .interviewTestsCompleted, .passedLevelTests
// They can listen for:     "aptitrio:levelUnlocked" and "aptitrio:testCompleted" events on document
window.AptitrioTests = {
  get testResults() { return testResults; },
  get levelTestScores() { return levelTestScores; },
  get interviewTestsCompleted() { return interviewIds.length; },
  get passedLevelTests() { return passedLevelTests; },
  setTopicsCompleted(levelId, done) {
    topicsCompleted[levelId] = !!done;
    save(KEYS.topics, topicsCompleted);
    if (!$("homeView").hidden) renderHome();
  }
};

renderHome();