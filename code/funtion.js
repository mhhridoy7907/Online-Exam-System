// Improved the existing code and am currently working on dynamic exam functionality.


(() => {
  "use strict";

  // MH2 IT Center Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyC9P2e4Fj07uvyXN85YlL0_0fSJrwtA2nY",
    authDomain: "mh2-it-center.firebaseapp.com",
    databaseURL:
      "https://mh2-it-center-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "mh2-it-center",
    storageBucket: "mh2-it-center.firebasestorage.app",
    messagingSenderId: "214594920215",
    appId: "1:214594920215:web:1dbcf7d2069ff32b3e2152",
    measurementId: "G-Q43HCD8PPR"
  };

  const db = firebase.initializeApp(firebaseConfig).database();

  // Database paths
  const PATH = {
    exam: "exams/active",
    students: "students",
    submissions: "submissions"
  };

  const $ = id => document.getElementById(id);

  const state = {
    exam: null,
    questions: [],
    student: null,
    answers: {},
    started: false,
    submitted: false,
    endTime: 0,
    timerInterval: null,
    saveKey: null,
    attemptId: null
  };

  function show(id) {
    $(id)?.classList.remove("hidden");
  }

  function hide(id) {
    $(id)?.classList.add("hidden");
  }

  function status(message, type = "") {
    const el = $("saveStatus");
    if (!el) return;
    el.textContent = message;
    el.className = "status" + (type ? " " + type : "");
  }

  function loginStatus(message, type = "") {
    const el = $("loginStatus");
    if (!el) return;
    el.textContent = message;
    el.className = "status" + (type ? " " + type : "");
  }

  function notice(title, message) {
    hide("loadingCard");
    hide("loginCard");
    hide("examCard");
    hide("resultCard");
    hide("timerBar");

    $("noticeTitle").textContent = title;
    $("noticeText").textContent = message;
    show("noticeCard");
  }

  function cleanText(value, max = 500) {
    return String(value ?? "").trim().slice(0, max);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
  }

  function normalize(value) {
    return cleanText(value, 500).toLowerCase().replace(/\s+/g, " ");
  }

  function getQuestionType(q) {
    const type = cleanText(q.type || q.questionType || "mcq")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

    if (["written", "long_answer", "essay"].includes(type)) {
      return "written";
    }

    if (["fill", "fill_blank", "fill_in_the_blank", "short_answer"]
      .includes(type)) {
      return "fill";
    }

    return "mcq";
  }

  function getQuestionList(raw) {
    const source = raw?.questions ?? {};
    const list = Array.isArray(source)
      ? source.map((q, i) => ({ ...q, id: q.id || String(i) }))
      : Object.entries(source).map(([id, q]) => ({ ...q, id }));

    return list.filter(q =>
      q && q.enabled !== false && q.active !== false &&
      cleanText(q.question || q.text)
    );
  }

  async function loadExam() {
    try {
      const snapshot = await db.ref(PATH.exam).once("value");
      const exam = snapshot.val();

      if (!exam || exam.enabled === false || exam.status === "closed") {
        notice("Exam Not Available",
          "The examination is currently unavailable. Please contact MH2 IT Center.");
        return;
      }

      const questions = getQuestionList(exam);

      if (!questions.length) {
        notice("No Questions Available",
          "The examination has no published questions yet.");
        return;
      }

      state.exam = exam;
      state.questions = questions;

      $("examTitle").textContent =
        cleanText(exam.title, 150) || "MH2 IT Center Examination";

      $("examInstructions").textContent =
        cleanText(exam.instructions, 1000) ||
        "Enter your registered student information to continue.";

      const types = [...new Set(questions.map(getQuestionType))];
      $("enabledTypes").textContent =
        "Question types: " + types.map(t => ({
          mcq: "MCQ",
          fill: "Fill in the Blank",
          written: "Written"
        })[t]).join(" · ");

      if (exam.requireCode === true) {
        show("examCodeField");
        $("examCode").required = true;
      } else {
        hide("examCodeField");
        $("examCode").required = false;
      }

      hide("loadingCard");
      hide("noticeCard");
      show("loginCard");

    } catch (error) {
      console.error(error);
      notice("Connection Error",
        "Could not load the examination. Check your internet connection and Firebase Database Rules.");
    }
  }

  async function verifyStudent(name, studentId, examCode) {
    const studentSnap = await db.ref(
      PATH.students + "/" + studentId
    ).once("value");

    const student = studentSnap.val();

    if (!student) {
      throw new Error("Student ID was not found in the registration database.");
    }

    if (student.active === false || student.enabled === false) {
      throw new Error("This student account is disabled.");
    }

    if (normalize(student.name) !== normalize(name)) {
      throw new Error("Student name does not match the registered name.");
    }

    if (state.exam.requireCode === true) {
      // This comparison is for convenience, not secure authorization.
      if (!state.exam.examCode ||
          String(examCode) !== String(state.exam.examCode)) {
        throw new Error("Invalid examination code.");
      }
    }

    // Recheck exam status immediately before starting.
    const latest = (await db.ref(PATH.exam).once("value")).val();

    if (!latest || latest.enabled === false || latest.status === "closed") {
      throw new Error("The examination has been closed by the administrator.");
    }

    return student;
  }

  function getStorageKey(studentId) {
    const examId = cleanText(state.exam.examId || state.exam.id || "active", 100);
    return "mh2_exam_" + examId + "_" + studentId;
  }

  function restoreDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(state.saveKey) || "null");

      if (!saved || !saved.answers || typeof saved.answers !== "object") {
        return;
      }

      if (saved.submitted === true) {
        throw new Error("This browser has already submitted this attempt.");
      }

      // Restore only answers belonging to current questions.
      for (const q of state.questions) {
        if (Object.prototype.hasOwnProperty.call(saved.answers, q.id)) {
          state.answers[q.id] = saved.answers[q.id];
        }
      }

      if (Number.isFinite(saved.endTime) && saved.endTime > 0) {
        state.endTime = saved.endTime;
      }

      status("Previous answers restored from this browser.");
    } catch (error) {
      console.warn("Draft recovery:", error.message);
    }
  }

  function saveDraft() {
    if (!state.started || state.submitted) return;

    try {
      localStorage.setItem(state.saveKey, JSON.stringify({
        answers: state.answers,
        endTime: state.endTime,
        submitted: false
      }));

      status("Answers saved in this browser.");
    } catch (error) {
      status("Browser storage unavailable. Keep a backup of your answers.");
    }
  }

  function renderQuestion(q, index) {
    const id = String(q.id);
    const type = getQuestionType(q);
    const question = cleanText(q.question || q.text, 2000);
    const marks = Math.max(0, Number(q.marks) || 1);
    const saved = state.answers[id];
    const options = Array.isArray(q.options)
      ? q.options
      : Object.values(q.options || {});

    let inputHTML = "";

    if (type === "mcq") {
      inputHTML = options.map((option, i) => {
        const value = typeof option === "object"
          ? String(option.value ?? option.text ?? option.label ?? i)
          : String(option);

        const label = typeof option === "object"
          ? String(option.text ?? option.label ?? option.value ?? "")
          : String(option);

        const checked = String(saved ?? "") === value ? "checked" : "";

        return `
          <label class="option">
            <input type="radio"
              name="answer_${escapeHTML(id)}"
              value="${escapeHTML(value)}"
              ${checked}
              ${state.submitted ? "disabled" : ""}>
            <span>${escapeHTML(label)}</span>
          </label>`;
      }).join("");

      if (!options.length) {
        inputHTML = '<p class="muted">No answer options are configured.</p>';
      }
    } else if (type === "fill") {
      inputHTML = `
        <input class="answer-input"
          type="text"
          data-question-id="${escapeHTML(id)}"
          value="${escapeHTML(saved ?? "")}"
          placeholder="Type your answer"
          maxlength="1000"
          ${state.submitted ? "disabled" : ""}>`;
    } else {
      inputHTML = `
        <textarea class="answer-input"
          data-question-id="${escapeHTML(id)}"
          rows="5"
          maxlength="10000"
          placeholder="Write your answer here"
          ${state.submitted ? "disabled" : ""}>${escapeHTML(saved ?? "")}</textarea>`;
    }

    return `
      <article class="card question-card"
        data-question-card="${escapeHTML(id)}">
        <h2>Question ${index + 1}</h2>
        <p>${escapeHTML(question)}</p>
        <p class="muted">${escapeHTML(type.toUpperCase())} · ${marks} mark(s)</p>
        <div class="answer-options">${inputHTML}</div>
      </article>`;
  }

  function renderExam() {
    $("activeExamTitle").textContent =
      cleanText(state.exam.title, 150) || "Examination";

    $("studentInfo").textContent =
      state.student.name + " · ID: " + state.student.id;

    $("questionCount").textContent =
      state.questions.length + " questions";

    $("questionsContainer").innerHTML = state.questions
      .map(renderQuestion)
      .join("");

    updateProgress();
  }

  function updateProgress() {
    const total = state.questions.length;
    const answered = state.questions.filter(q => {
      const a = state.answers[q.id];
      return a !== undefined && String(a).trim() !== "";
    }).length;

    $("questionCount").textContent =
      answered + " / " + total + " answered";

    $("progressBar").style.width =
      (total ? answered / total * 100 : 0) + "%";
  }

  function startTimer() {
    clearInterval(state.timerInterval);
    show("timerBar");

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;

      $("timer").textContent =
        String(minutes).padStart(2, "0") + ":" +
        String(seconds).padStart(2, "0");

      if (remaining <= 0) {
        clearInterval(state.timerInterval);
        submitExam(true);
      }
    };

    tick();
    state.timerInterval = setInterval(tick, 1000);
  }

  async function beginExam(name, studentId, examCode) {
    const student = await verifyStudent(name, studentId, examCode);

    state.student = {
      id: studentId,
      name: cleanText(student.name, 100)
    };

    state.saveKey = getStorageKey(studentId);
    state.attemptId = "attempt_" + Date.now() + "_" +
      Math.random().toString(36).slice(2, 10);

    state.answers = {};
    restoreDraft();

    const duration = Math.max(
      1,
      Number(state.exam.durationMinutes) || 30
    );

    if (!state.endTime) {
      state.endTime = Date.now() + duration * 60 * 1000;
    }

    if (state.endTime <= Date.now()) {
      throw new Error("The saved examination time has expired.");
    }

    state.started = true;

    hide("loginCard");
    hide("noticeCard");
    show("examCard");

    renderExam();
    startTimer();
    saveDraft();
  }

  // Read the current answers from the rendered form.
  function collectAnswers() {
    for (const q of state.questions) {
      const id = String(q.id);
      const type = getQuestionType(q);

      if (type === "mcq") {
        const selected = document.querySelector(
          'input[name="answer_' + CSS.escape(id) + '"]:checked'
        );

        if (selected) state.answers[id] = selected.value;
        else delete state.answers[id];

      } else {
        const input = document.querySelector(
          '[data-question-id="' + CSS.escape(id) + '"]'
        );

        if (input) state.answers[id] = input.value;
      }
    }
  }

  function markMCQ(q, answer) {
    if (getQuestionType(q) !== "mcq") return null;

    const correct = q.correctAnswer ?? q.answerKey ?? q.correctOption;

    if (correct === undefined || correct === null) return null;

    const normalizeAnswer = value => normalize(
      typeof value === "object"
        ? value.value ?? value.text ?? value.label ?? ""
        : value
    );

    return normalizeAnswer(answer) === normalizeAnswer(correct);
  }

  async function submitExam(auto = false) {
    if (!state.started || state.submitted) return;

    if (!auto && !confirm(
      "Are you sure you want to submit your examination? You cannot change your answers afterward."
    )) {
      return;
    }

    collectAnswers();

    state.submitted = true;
    clearInterval(state.timerInterval);

    $("submitButton").disabled = true;
    status("Submitting examination...", "");

    let score = 0;
    let autoMarked = 0;
    let manualReview = 0;

    const questionResults = {};

    for (const q of state.questions) {
      const id = String(q.id);
      const answer = state.answers[id] ?? "";
      const type = getQuestionType(q);
      const marks = Math.max(0, Number(q.marks) || 1);
      let isCorrect = null;

      if (type === "mcq") {
        isCorrect = markMCQ(q, answer);

        if (isCorrect !== null) {
          autoMarked++;
          if (isCorrect) score += marks;
        } else {
          manualReview++;
        }
      } else {
        manualReview++;
      }

      questionResults[id] = {
        answer: String(answer),
        type,
        marks,
        correct: isCorrect
      };
    }

    const submission = {
      attemptId: state.attemptId,
      examId: cleanText(state.exam.examId || state.exam.id || "active", 100),
      studentId: state.student.id,
      studentName: state.student.name,
      submittedAt: firebase.database.ServerValue.TIMESTAMP,
      status: "submitted",
      autoSubmitted: auto,
      answers: questionResults,
      score,
      autoMarkedQuestions: autoMarked,
      manualReviewQuestions: manualReview,
      totalQuestions: state.questions.length
    };

    try {
      // Save the submission using a unique attempt ID.
      await db.ref(PATH.submissions + "/" + state.attemptId)
        .set(submission);

      localStorage.setItem(state.saveKey, JSON.stringify({
        answers: state.answers,
        endTime: state.endTime,
        submitted: true,
        attemptId: state.attemptId
      }));

      hide("examCard");
      hide("timerBar");
      show("resultCard");

      $("resultTitle").textContent = "Examination Submitted";
      $("resultText").textContent =
        "Your answers have been submitted successfully.";

      $("resultStatus").textContent =
        "Automatically marked: " + autoMarked +
        " · Awaiting manual review: " + manualReview +
        (auto ? " · Submitted automatically when time expired." : "");

    } catch (error) {
      console.error("Submission failed:", error);

      // Keep the attempt recoverable if Firebase is unavailable.
      state.submitted = false;
      $("submitButton").disabled = false;

      status(
        "Submission failed. Your answers remain in this browser. " +
        "Check your connection and try submitting again.",
        "error"
      );
    }
  }

  $("studentForm").addEventListener("submit", async event => {
    event.preventDefault();

    const name = cleanText($("studentName").value, 100);
    const studentId = cleanText($("studentId").value, 50);
    const examCode = $("examCode").value;

    if (!name || !studentId) {
      loginStatus("Enter your registered name and Student ID.", "error");
      return;
    }

    const button = $("startButton");
    button.disabled = true;
    loginStatus("Verifying student information...", "");

    try {
      await beginExam(name, studentId, examCode);
    } catch (error) {
      console.error(error);
      loginStatus(error.message || "Unable to start the examination.", "error");
    } finally {
      button.disabled = false;
    }
  });

  $("questionsContainer").addEventListener("change", event => {
    if (!state.started || state.submitted) return;

    collectAnswers();
    saveDraft();
    updateProgress();
  });

  $("questionsContainer").addEventListener("input", event => {
    if (!state.started || state.submitted) return;

    collectAnswers();
    saveDraft();
    updateProgress();
  });

  $("submitButton").addEventListener("click", () => submitExam(false));

  window.addEventListener("beforeunload", event => {
    if (state.started && !state.submitted) {
      collectAnswers();
      saveDraft();
      event.preventDefault();
      event.returnValue = "";
    }
  });

  loadExam();
})();
