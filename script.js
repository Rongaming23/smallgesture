const lectures = Array.from({ length: 7 }, (_, i) => {
  const number = String(i + 1).padStart(2, "0");
  return {
    id: i,
    title: `Lecture ${number}`,
    file: `videos/lecture-${number}.mp4`
  };
});

const STORAGE_KEY = "pcbStudyRoomStateV1";

const defaultState = {
  completed: {},
  progress: {},
  studySeconds: 0,
  streak: 0,
  lastStudyDate: null
};

let state = loadState();
let currentLecture = 0;
let timerSeconds = 25 * 60;
let timerRunning = false;
let timerInterval = null;
let studyInterval = null;
let reminderTimer = null;

const $ = (id) => document.getElementById(id);

const videoPlayer = $("videoPlayer");
const videoSource = $("videoSource");
const videoPlaceholder = $("videoPlaceholder");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...defaultState,
      ...(saved || {}),
      completed: saved?.completed || {},
      progress: saved?.progress || {}
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function registerStudyDay() {
  const today = todayKey();
  if (state.lastStudyDate === today) return;

  if (state.lastStudyDate) {
    const previous = new Date(`${state.lastStudyDate}T00:00:00`);
    const current = new Date(`${today}T00:00:00`);
    const difference = Math.round((current - previous) / 86400000);
    state.streak = difference === 1 ? state.streak + 1 : 1;
  } else {
    state.streak = 1;
  }

  state.lastStudyDate = today;
  saveState();
  updateDashboard();
}

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(v => String(v).padStart(2, "0")).join(":");
}

function updateDashboard() {
  const completedCount = lectures.filter(l => state.completed[l.id]).length;
  const percent = Math.round((completedCount / lectures.length) * 100);

  $("completedCount").textContent = `${completedCount} / ${lectures.length}`;
  $("progressPercent").textContent = `${percent}%`;
  $("progressBadge").textContent = `${percent}%`;
  $("progressBar").style.width = `${percent}%`;
  $("studyTime").textContent = formatTime(state.studySeconds);
  $("streakCount").textContent = `${state.streak} ${state.streak === 1 ? "day" : "days"}`;

  $("progressText").textContent =
    completedCount === lectures.length
      ? "Excellent! All lectures are completed."
      : `${completedCount} lecture${completedCount === 1 ? "" : "s"} completed. Keep going!`;

  renderLectureList();
}

function renderLectureList() {
  $("lectureList").innerHTML = lectures.map((lecture, index) => {
    const completed = !!state.completed[lecture.id];
    const progress = Math.round(state.progress[lecture.id] || 0);

    return `
      <button class="lecture-item ${index === currentLecture ? "active" : ""} ${completed ? "completed" : ""}"
              data-index="${index}">
        <span class="lecture-number">${completed ? "✓" : String(index + 1).padStart(2, "0")}</span>
        <span>
          <p class="lecture-title">${lecture.title}</p>
          <p class="lecture-file">${lecture.file}</p>
        </span>
        <span class="lecture-status ${completed ? "done" : ""}">
          ${completed ? "Completed" : `${progress}%`}
        </span>
      </button>
    `;
  }).join("");

  document.querySelectorAll(".lecture-item").forEach(item => {
    item.addEventListener("click", () => {
      selectLecture(Number(item.dataset.index));
    });
  });
}

function selectLecture(index) {
  currentLecture = Math.max(0, Math.min(index, lectures.length - 1));
  const lecture = lectures[currentLecture];

  $("currentTitle").textContent = lecture.title;

  const completed = !!state.completed[lecture.id];
  $("currentStatus").textContent = completed ? "Completed" : "Not started";
  $("currentStatus").classList.toggle("completed", completed);

  const progress = Math.round(state.progress[lecture.id] || 0);
  $("lectureProgressBar").style.width = `${progress}%`;
  $("lectureProgressText").textContent = `${progress}%`;

  videoSource.src = lecture.file;
  videoPlayer.load();

  videoPlaceholder.classList.remove("visible");
  videoPlayer.style.visibility = "visible";

  videoPlayer.addEventListener("error", handleVideoError, { once: true });

  renderLectureList();
}

function handleVideoError() {
  videoPlayer.style.visibility = "hidden";
  videoPlaceholder.classList.add("visible");
  videoPlaceholder.querySelector("h3").textContent = lectures[currentLecture].title;
  videoPlaceholder.querySelector("p").innerHTML =
    `Place <strong>${lectures[currentLecture].file.split("/").pop()}</strong> inside the <strong>videos</strong> folder.`;
}

function updateLectureProgress() {
  if (!videoPlayer.duration || !Number.isFinite(videoPlayer.duration)) return;

  const percent = Math.min(100, Math.round((videoPlayer.currentTime / videoPlayer.duration) * 100));
  state.progress[lectures[currentLecture].id] = percent;

  $("lectureProgressBar").style.width = `${percent}%`;
  $("lectureProgressText").textContent = `${percent}%`;

  if (percent >= 95 && !state.completed[lectures[currentLecture].id]) {
    state.completed[lectures[currentLecture].id] = true;
    showToast("Lecture completed 🎉");
    registerStudyDay();
    saveState();
    updateDashboard();
  } else {
    saveState();
  }
}

function markComplete() {
  const id = lectures[currentLecture].id;
  state.completed[id] = true;
  state.progress[id] = 100;
  registerStudyDay();
  saveState();
  updateDashboard();
  selectLecture(currentLecture);
  showToast(`${lectures[currentLecture].title} marked complete.`);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2800);
}

// Study time counter: counts active page time.
function startStudyClock() {
  if (studyInterval) return;

  studyInterval = setInterval(() => {
    state.studySeconds += 1;
    if (state.studySeconds % 5 === 0) saveState();
    updateDashboard();
  }, 1000);
}

function setTimer(minutes) {
  timerSeconds = minutes * 60;
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  updateTimerDisplay();
  $("timerMode").textContent = "Focus session";
}

function updateTimerDisplay() {
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  $("timerDisplay").textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  $("timerMode").textContent = "Focus in progress";

  timerInterval = setInterval(() => {
    if (timerSeconds > 0) {
      timerSeconds--;
      updateTimerDisplay();
    } else {
      clearInterval(timerInterval);
      timerInterval = null;
      timerRunning = false;
      $("timerMode").textContent = "Session complete";
      showToast("Focus session complete! Take a short break. 🎉");
      notify("PCB Study Room", "Your study session is complete.");
    }
  }, 1000);
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  $("timerMode").textContent = "Paused";
}

async function enableReminder() {
  if (!("Notification" in window)) {
    showToast("Browser notifications are not supported here.");
    return;
  }

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission === "granted") {
    showToast("Reminder enabled for this browser session.");
    clearTimeout(reminderTimer);

    reminderTimer = setTimeout(() => {
      notify("PCB Study Room", "Time to get back to your lecture.");
    }, 30 * 60 * 1000);
  } else {
    showToast("Notification permission was not granted.");
  }
}

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function resetProgress() {
  const confirmed = confirm(
    "Reset all lecture progress, study time and streak? This cannot be undone."
  );
  if (!confirmed) return;

  state = { ...defaultState, completed: {}, progress: {} };
  saveState();
  currentLecture = 0;
  setTimer(25);
  selectLecture(0);
  updateDashboard();
  showToast("Progress reset.");
}

$("prevBtn").addEventListener("click", () => selectLecture(currentLecture - 1));
$("nextBtn").addEventListener("click", () => selectLecture(currentLecture + 1));
$("completeBtn").addEventListener("click", markComplete);
$("resetBtn").addEventListener("click", resetProgress);
$("reminderBtn").addEventListener("click", enableReminder);

$("timerStart").addEventListener("click", startTimer);
$("timerPause").addEventListener("click", pauseTimer);
$("timerReset").addEventListener("click", () => setTimer(25));

document.querySelectorAll(".timer-presets button").forEach(button => {
  button.addEventListener("click", () => setTimer(Number(button.dataset.minutes)));
});

videoPlayer.addEventListener("timeupdate", updateLectureProgress);
videoPlayer.addEventListener("play", () => {
  registerStudyDay();
  startStudyClock();
});
videoPlayer.addEventListener("ended", markComplete);

window.addEventListener("beforeunload", saveState);

updateDashboard();
selectLecture(0);
startStudyClock();
