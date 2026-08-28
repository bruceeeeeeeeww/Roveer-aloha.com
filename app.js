
const API_URL = "https://script.google.com/macros/s/AKfycbyDWx4lHtCGnAoiiLEubgnrInu_6UnqCjqSk2ky7IlqP1inBb2Z3AckYGTRsBgXQTLe_A/exec";

const state = {
  voteCode: "",
  candidates: [],
  selected: null
};

const $ = (id) => document.getElementById(id);

function setMessage(el, text = "", ok = false) {
  el.textContent = text;
  el.classList.toggle("ok", ok);
}

function normalizeCode(value) {
  const suffix = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^ALOHA-/, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);

  return suffix ? `ALOHA-${suffix}` : "";
}

async function apiGet(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(body) {
  // text/plain 可避免瀏覽器先送 CORS preflight；Apps Script 仍可 JSON.parse 內容。
  const res = await fetch(API_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function validateCode() {
  const btn = $("validateBtn");
  const msg = $("gateMsg");
  const code = normalizeCode($("voteCode").value);

  if (!code || code.length !== 10) {
    setMessage(msg, "請輸入投票碼後四碼");
    return;
  }

  btn.disabled = true;
  btn.textContent = "驗證中…";
  setMessage(msg, "");

  try {
    const result = await apiGet({ action: "validateCode", code });
    if (!result.ok) {
      setMessage(msg, result.message || "投票碼驗證失敗");
      return;
    }

    state.voteCode = code;
    $("codeBadge").textContent = code;
    setMessage(msg, "驗證成功，正在載入參賽者…", true);

    await loadCandidates();

    $("gateView").classList.add("hidden");
    $("voteView").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    setMessage(msg, "目前無法連線投票系統，請稍後再試");
  } finally {
    btn.disabled = false;
    btn.textContent = "開始投票";
  }
}

async function loadCandidates() {
  const result = await apiGet({ action: "candidates" });
  if (!result.ok) throw new Error(result.message || "無法讀取候選人");
  state.candidates = Array.isArray(result.candidates) ? result.candidates : [];
  renderCandidates();
}

function renderCandidates() {
  const grid = $("candidateGrid");
  grid.innerHTML = "";

  if (!state.candidates.length) {
    grid.innerHTML = '<div class="panel">目前尚無參賽資料。</div>';
    return;
  }

  state.candidates.forEach(c => {
    const card = document.createElement("article");
    card.className = "candidate-card";

    const safePhoto = c.photoUrl || "";
    const displayName = c.nickname && c.nickname !== "無" ? c.nickname : c.name;
    const story = c.story || "這位夥伴還沒有留下選歌故事。";

    card.innerHTML = `
      <div class="photo-wrap">
        ${safePhoto
          ? `<img src="${escapeAttr(safePhoto)}" alt="${escapeAttr(displayName)}的照片"
               referrerpolicy="no-referrer">`
          : '<div class="photo-fallback">🌺</div>'}
      </div>
      <div class="card-body">
        <div class="person-row">
          <div>
            <div class="nickname">${escapeHtml(displayName)}</div>
            ${displayName !== c.name ? `<div class="real-name">${escapeHtml(c.name)}</div>` : ""}
          </div>
          <span class="candidate-no">${escapeHtml(c.candidateId)}</span>
        </div>

        <div class="song-box">
          <div class="song-name">🎵 ${escapeHtml(c.song || "未填歌曲")}</div>
          <div class="artist">🎤 ${escapeHtml(c.artist || "—")}</div>
        </div>

        <div class="story-preview">${escapeHtml(story)}</div>
        <button class="story-btn" type="button">一首歌，一段故事 →</button>
        <button class="vote-btn" type="button">♡ 投給 ${escapeHtml(displayName)}</button>
      </div>
    `;

    const img = card.querySelector("img");
    if (img) {
      img.addEventListener("error", () => {
        const wrap = img.parentElement;
        wrap.innerHTML = '<div class="photo-fallback">🌺</div>';
      });
    }

    card.querySelector(".story-btn").addEventListener("click", () => openStory(c));
    card.querySelector(".vote-btn").addEventListener("click", () => openConfirm(c));

    grid.appendChild(card);
  });
}

function openStory(c) {
  const displayName = c.nickname && c.nickname !== "無" ? c.nickname : c.name;
  $("storyTitle").textContent = `${displayName}｜${c.song || "選歌故事"}`;
  $("storyBody").textContent = c.story || "這位夥伴還沒有留下選歌故事。";
  $("storyModal").classList.remove("hidden");
}

function openConfirm(c) {
  state.selected = c;
  const displayName = c.nickname && c.nickname !== "無" ? c.nickname : c.name;
  $("confirmCandidate").innerHTML = `
    <strong>${escapeHtml(displayName)}</strong><br>
    🎵 ${escapeHtml(c.song || "未填歌曲")}<br>
    🎤 ${escapeHtml(c.artist || "—")}
  `;
  setMessage($("confirmMsg"), "");
  $("confirmModal").classList.remove("hidden");
}

async function submitVote() {
  if (!state.voteCode || !state.selected) return;

  const btn = $("submitVoteBtn");
  const msg = $("confirmMsg");

  btn.disabled = true;
  btn.textContent = "送出中…";
  setMessage(msg, "");

  try {
    const result = await apiPost({
      action: "vote",
      code: state.voteCode,
      candidateId: state.selected.candidateId
    });

    if (!result.ok) {
      setMessage(msg, result.message || "投票失敗");
      return;
    }

    const c = result.candidate || state.selected;
    const displayName = c.nickname && c.nickname !== "無" ? c.nickname : c.name;

    $("confirmModal").classList.add("hidden");
    $("voteView").classList.add("hidden");
    $("successView").classList.remove("hidden");
    $("successText").innerHTML =
      `你已將這一票投給 <strong>${escapeHtml(displayName)}</strong><br>🎵 ${escapeHtml(c.song || "")}`;

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    setMessage(msg, "送出失敗，請確認網路後再試一次");
  } finally {
    btn.disabled = false;
    btn.textContent = "確認投票";
  }
}

function closeModal(name) {
  $(name + "Modal").classList.add("hidden");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

$("validateBtn").addEventListener("click", validateCode);
$("voteCode").addEventListener("keydown", e => {
  if (e.key === "Enter") validateCode();
});
$("cancelVoteBtn").addEventListener("click", () => closeModal("confirm"));
$("submitVoteBtn").addEventListener("click", submitVote);

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", e => {
    if (e.target === modal) modal.classList.add("hidden");
  });
});


function openAdminLogin() {
  $("adminPinInput").value = "";
  setMessage($("adminLoginMsg"), "");
  $("adminLoginModal").classList.remove("hidden");
  setTimeout(() => $("adminPinInput").focus(), 50);
}

async function adminLogin() {
  const pin = String($("adminPinInput").value || "").trim();
  if (!pin) {
    setMessage($("adminLoginMsg"), "請輸入管理 PIN");
    return;
  }

  const btn = $("adminLoginBtn");
  btn.disabled = true;
  btn.textContent = "驗證中…";
  setMessage($("adminLoginMsg"), "");

  try {
    const result = await apiPost({ action: "adminAuth", pin });
    if (!result.ok) {
      const apiMsg = result.message || "管理 PIN 錯誤";
      setMessage(
        $("adminLoginMsg"),
        apiMsg.includes("未知的 API 動作")
          ? "管理功能尚未啟用，請先更新並重新部署 Apps Script。"
          : apiMsg
      );
      return;
    }
    sessionStorage.setItem("luofuAdminPin", pin);
    window.location.href = "./admin.html";
  } catch (err) {
    console.error(err);
    setMessage($("adminLoginMsg"), "目前無法連線管理系統");
  } finally {
    btn.disabled = false;
    btn.textContent = "進入管理頁";
  }
}


$("adminEntryBtn").addEventListener("click", openAdminLogin);
$("adminCancelBtn").addEventListener("click", () => closeModal("adminLogin"));
$("adminLoginBtn").addEventListener("click", adminLogin);
$("adminPinInput").addEventListener("keydown", e => {
  if (e.key === "Enter") adminLogin();
});


function resetToHome() {
  state.voteCode = "";
  state.selected = null;

  $("voteCode").value = "";
  $("codeBadge").textContent = "";
  setMessage($("gateMsg"), "");
  setMessage($("confirmMsg"), "");

  $("voteView").classList.add("hidden");
  $("successView").classList.add("hidden");
  $("gateView").classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => $("voteCode").focus(), 250);
}



$("voteCode").addEventListener("input", e => {
  e.target.value = e.target.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
});
$("backHomeBtn").addEventListener("click", resetToHome);
$("voteAgainBtn").addEventListener("click", resetToHome);



function showSongRequest() {
  $("gateView").classList.add("hidden");
  $("voteView").classList.add("hidden");
  $("successView").classList.add("hidden");
  $("songRequestView").classList.remove("hidden");
  setMessage($("songRequestMsg"), "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function hideSongRequest() {
  $("songRequestView").classList.add("hidden");
  $("gateView").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function imageFileToPayload(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("請選擇圖片檔案");

  const bitmap = await createImageBitmap(file);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("照片處理失敗");

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("照片讀取失敗"));
    reader.readAsDataURL(blob);
  });

  return {
    name: (file.name || "onsite-photo").replace(/\.[^.]+$/, "") + ".jpg",
    mimeType: "image/jpeg",
    base64: String(dataUrl).split(",")[1]
  };
}

async function submitSongRequest(event) {
  event.preventDefault();

  const btn = $("submitSongRequestBtn");
  const msg = $("songRequestMsg");

  const name = $("reqName").value.trim();
  const song = $("reqSong").value.trim();

  if (!name || !song) {
    setMessage(msg, "請至少填寫中文全名與歌曲名稱");
    return;
  }

  btn.disabled = true;
  btn.textContent = "正在加入歌單…";
  setMessage(msg, "");

  try {
    let photo = null;
    const file = $("reqPhotoCamera").files[0] || $("reqPhotoGallery").files[0];
    if (file) {
      if (file.size > 12 * 1024 * 1024) {
        throw new Error("原始照片請小於 12 MB");
      }
      photo = await imageFileToPayload(file);
    }

    const result = await apiPost({
      action: "submitSongRequest",
      data: {
        county: $("reqCounty").value.trim(),
        group: $("reqGroup").value.trim(),
        name,
        nickname: $("reqNickname").value.trim(),
        song,
        artist: $("reqArtist").value.trim(),
        songUrl: $("reqSongUrl").value.trim(),
        story: $("reqStory").value.trim(),
        photo
      }
    });

    if (!result.ok) {
      setMessage(msg, result.message || "送出失敗");
      return;
    }

    $("songRequestSuccessText").textContent =
      `${result.displayName || name}｜${song} 已成功加入，之後重新進入投票頁就會出現在候選名單中。`;
    $("songRequestSuccessModal").classList.remove("hidden");
    $("songRequestForm").reset();
    $("reqPhotoCamera").value = "";
    $("reqPhotoGallery").value = "";
    $("photoPreviewWrap").classList.add("hidden");
    $("photoPreview").removeAttribute("src");
  } catch (err) {
    console.error(err);
    setMessage(msg, err.message || "目前無法送出，請稍後再試");
  } finally {
    btn.disabled = false;
    btn.textContent = "🌺 加入今晚歌單";
  }
}

function previewRequestPhoto(sourceId) {
  const cameraFile = $("reqPhotoCamera").files[0];
  const galleryFile = $("reqPhotoGallery").files[0];
  const file = sourceId === "camera" ? cameraFile : galleryFile;

  if (!file) {
    $("photoPreviewWrap").classList.add("hidden");
    $("photoPreview").removeAttribute("src");
    return;
  }

  // 選了其中一種來源後，清掉另一個來源，避免送出時拿錯舊檔案
  if (sourceId === "camera") {
    $("reqPhotoGallery").value = "";
  } else {
    $("reqPhotoCamera").value = "";
  }

  const url = URL.createObjectURL(file);
  $("photoPreview").src = url;
  $("photoPreviewWrap").classList.remove("hidden");
  $("photoPreview").onload = () => URL.revokeObjectURL(url);
}


$("openSongRequestBtn").addEventListener("click", showSongRequest);
$("songRequestBackBtn").addEventListener("click", hideSongRequest);
$("songRequestForm").addEventListener("submit", submitSongRequest);
$("takePhotoBtn").addEventListener("click", () => $("reqPhotoCamera").click());
$("choosePhotoBtn").addEventListener("click", () => $("reqPhotoGallery").click());
$("reqPhotoCamera").addEventListener("change", () => previewRequestPhoto("camera"));
$("reqPhotoGallery").addEventListener("change", () => previewRequestPhoto("gallery"));
$("songRequestDoneBtn").addEventListener("click", () => {
  $("songRequestSuccessModal").classList.add("hidden");
  hideSongRequest();
});
