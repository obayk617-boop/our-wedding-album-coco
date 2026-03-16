import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseClient = createClient(
  "https://vysdoicwyroygakdrwyt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5c2RvaWN3eXJveWdha2Ryd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDExMzEsImV4cCI6MjA4NzIxNzEzMX0.uBpCtpMy8pIHTi0bU3GkwcquW-15QcQOr6Pw58TNlAw"
);

/* ==========================
席番号管理
========================== */

function getSeatNumber() {
  const params = new URLSearchParams(window.location.search);
  const seatParam = params.get("seat");
  if (seatParam) {
    localStorage.setItem("wedding_seat_number", seatParam);
    return seatParam;
  }
  const saved = localStorage.getItem("wedding_seat_number");
  if (saved) return saved;
  localStorage.setItem("wedding_seat_number", "100");
  return "100";
}

const currentSeatNumber = getSeatNumber();
const isGuest = currentSeatNumber === "100";

function getOrCreateUserId() {
  let userId = localStorage.getItem("wedding_album_user_id");
  if (!userId) {
    userId = "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("wedding_album_user_id", userId);
  }
  return userId;
}

const currentUserId = getOrCreateUserId();

/* ==========================
席番号バッジ表示
========================== */

const seatBadge = document.getElementById("seatBadge");
if (seatBadge) {
  seatBadge.textContent = isGuest ? "ゲスト" : `席番号 ${currentSeatNumber}`;
}

/* ==========================
DOM
========================== */

const gallery       = document.getElementById("gallery");
const viewer        = document.getElementById("viewer");
const viewerImg     = document.getElementById("viewerImg");
const downloadBtn   = document.getElementById("downloadBtn");
const closeViewer   = document.getElementById("closeViewer");
const uploadStatus  = document.getElementById("uploadStatus");
const spinner       = document.getElementById("spinner");
const fab           = document.getElementById("fab");
const fileSelectInput = document.getElementById("fileSelectInput");
const previewModal  = document.getElementById("previewModal");
const previewImage  = document.getElementById("previewImage");
const confirmUpload = document.getElementById("confirmUpload");
const cancelUpload  = document.getElementById("cancelUpload");

let selectedFile = null;
let currentImageUrl = null;
let currentImageFileName = null;

/* ==========================
無限スクロール用変数
========================== */

let allFiles = [];
let displayedCount = 0;
const itemsPerPage = 12;
let isLoading = false;
let userLikes = {};
let likeCounts = {};        // 各写真のいいね数キャッシュ
let isRevealMode = false;   // ランキング発表後フラグ
let isInitialLoadDone = false;

/* ==========================
トースト通知
========================== */

function showToast(message, duration = 2000) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 50px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: white;
    padding: 12px 24px;
    border-radius: 25px;
    font-size: 14px;
    z-index: 999;
    animation: slideUp 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "slideDown 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

const toastStyle = document.createElement("style");
toastStyle.textContent = `
  @keyframes slideUp {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @keyframes slideDown {
    from { opacity: 1; transform: translateX(-50%) translateY(0); }
    to   { opacity: 0; transform: translateX(-50%) translateY(20px); }
  }
  @keyframes heartPulse {
    0%  { transform: scale(1); }
    25% { transform: scale(1.3); }
    50% { transform: scale(1); }
  }
`;
document.head.appendChild(toastStyle);

/* ==========================
いいね機能（自分の状態のみ・数は非表示）
========================== */

async function bulkLoadLikes(fileNames) {
  if (!fileNames.length) return;
  try {
    const { data, error } = await supabaseClient
      .from("likes")
      .select("file_name")
      .in("file_name", fileNames)
      .eq("user_id", currentUserId);

    if (!error && data) {
      const mySet = new Set(data.map(r => r.file_name));
      for (const name of fileNames) {
        userLikes[name] = mySet.has(name);
      }
    }
    if (isRevealMode) await bulkLoadLikeCounts(fileNames);
    for (const name of fileNames) updateLikeButtons(name);
  } catch (err) {
    console.error("いいね取得エラー:", err);
  }
}

async function bulkLoadLikeCounts(fileNames) {
  if (!fileNames.length) return;
  try {
    const { data, error } = await supabaseClient
      .from("likes")
      .select("file_name")
      .in("file_name", fileNames);
    if (!error && data) {
      for (const name of fileNames) likeCounts[name] = 0;
      for (const row of data) {
        likeCounts[row.file_name] = (likeCounts[row.file_name] || 0) + 1;
      }
    }
  } catch (err) {
    console.error("いいね数取得エラー:", err);
  }
}

// 1枚の写真のいいね数をDBから正確に取得して上書き
async function fetchLikeCount(fileName) {
  try {
    const { count, error } = await supabaseClient
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("file_name", fileName);
    if (!error) {
      likeCounts[fileName] = count || 0;
      updateLikeButtons(fileName);
    }
  } catch (err) {
    console.error("いいね数取得エラー:", err);
  }
}

async function toggleLike(fileName) {
  const wasLiked = userLikes[fileName] ?? false;
  userLikes[fileName] = !wasLiked;

  // 楽観的更新：いいね数も即座に反映
  if (isRevealMode) {
    likeCounts[fileName] = (likeCounts[fileName] || 0) + (wasLiked ? -1 : 1);
  }
  updateLikeButtons(fileName);

  try {
    if (wasLiked) {
      const { error } = await supabaseClient
        .from("likes").delete()
        .eq("file_name", fileName).eq("user_id", currentUserId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from("likes").insert([{ file_name: fileName, user_id: currentUserId }]);
      if (error) throw error;
    }
  } catch (err) {
    console.error("いいね操作エラー:", err);
    // 失敗時はロールバック（DBから正確な数字を取得）
    userLikes[fileName] = wasLiked;
    if (isRevealMode) await fetchLikeCount(fileName);
    else updateLikeButtons(fileName);
    showToast(err.status === 429 ? "混雑しています。少し後でお試しください" : "エラーが発生しました");
  }
}

function updateLikeButtons(fileName) {
  const btn = document.querySelector(`[data-like-btn="${fileName}"]`);
  if (btn) {
    const isLiked = userLikes[fileName] || false;
    const count   = likeCounts[fileName] || 0;
    btn.textContent = isRevealMode
      ? (isLiked ? `❤️ ${count}` : `🤍 ${count}`)
      : (isLiked ? "❤️" : "🤍");
    btn.style.background = isLiked ? "rgba(255,64,129,0.18)" : "rgba(255,255,255,0.18)";
    btn.style.border     = `1px solid ${isLiked ? "rgba(255,64,129,0.45)" : "rgba(255,255,255,0.35)"}`;
    btn.style.color      = isLiked ? "#ff4081" : "rgba(255,255,255,0.85)";
  }
}

/* ==========================
Viewer
========================== */

// 背景タップで閉じる（モーダルと同じ）
viewer.onclick = (e) => {
  if (e.target === viewer) viewer.classList.add("hidden");
};

closeViewer.onclick = () => viewer.classList.add("hidden");

downloadBtn.onclick = async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!currentImageUrl) return;

  try {
    downloadBtn.disabled = true;
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = "保存中…";

    const response = await fetch(currentImageUrl);
    const blob = await response.blob();
    const downloadFileName = "wedding-photo.jpg"; // 席番号を露出しない固定名

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [new File([blob], downloadFileName, { type: "image/jpeg" })] })
    ) {
      const file = new File([blob], downloadFileName, { type: "image/jpeg" });
      try {
        await navigator.share({ files: [file], title: "Wedding Photo", text: "Wedding Album Photo" });
        showToast("写真を保存しました");
        setTimeout(() => viewer.classList.add("hidden"), 1500);
      } catch (err) {
        if (err.name !== "AbortError") showToast("保存に失敗しました");
      }
    } else {
      window.open(URL.createObjectURL(blob), "_blank");
      showToast("画像を開きました");
      setTimeout(() => viewer.classList.add("hidden"), 1500);
    }

    downloadBtn.textContent = originalText;
    downloadBtn.disabled = false;
  } catch (err) {
    console.error("保存失敗:", err);
    showToast("保存に失敗しました");
    downloadBtn.textContent = "保存する";
    downloadBtn.disabled = false;
  }
};

/* ==========================
画像圧縮
========================== */

async function compressImage(file, maxWidth = 1280, quality = 0.7) {
  const img = new Image();
  const reader = new FileReader();
  return new Promise(resolve => {
    reader.onload = e => (img.src = e.target.result);
    img.onload = () => {
      const scale = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob), "image/jpeg", quality);
    };
    reader.readAsDataURL(file);
  });
}

/* ==========================
Gallery
========================== */

let loadAllImagesTimer = null;
function loadAllImages() {
  if (!isInitialLoadDone) { _loadAllImages(); return; }
  if (loadAllImagesTimer) clearTimeout(loadAllImagesTimer);
  loadAllImagesTimer = setTimeout(_loadAllImages, 2000);
}

async function _loadAllImages() {
  const { data, error } = await supabaseClient.storage
    .from("photos")
    .list("", { sortBy: { column: "created_at", order: "desc" }, limit: 1000 });

  if (error) { console.error("画像読み込みエラー:", error); return; }

  const newFiles = data || [];

  if (!isInitialLoadDone) {
    isInitialLoadDone = true;
    allFiles = newFiles;
    displayedCount = 0;
    gallery.innerHTML = "";
    displayMoreImages();
    updateObserver();
    await bulkLoadLikes(allFiles.slice(0, itemsPerPage).map(f => f.name));
    return;
  }

  const existingNames = new Set(allFiles.map(f => f.name));
  const addedFiles = newFiles.filter(f => !existingNames.has(f.name));

  if (addedFiles.length > 0) {
    allFiles = [...addedFiles, ...allFiles];
    displayedCount += addedFiles.length;

    const fragment = document.createDocumentFragment();
    for (const file of [...addedFiles].reverse()) fragment.prepend(createImageCard(file));
    gallery.prepend(fragment);

    await bulkLoadLikes(addedFiles.map(f => f.name));
  }
}

function createImageCard(file) {
  const { data: urlData } = supabaseClient.storage.from("photos").getPublicUrl(file.name);

  const container = document.createElement("div");
  container.style.cssText = "position: relative; width: 100%; aspect-ratio: 1;";

  const img = document.createElement("img");
  img.src = urlData.publicUrl;
  img.loading = "lazy";
  img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 12px; cursor: pointer;";
  img.onclick = () => {
    viewerImg.src = img.src;
    currentImageUrl = img.src;
    currentImageFileName = file.name;
    viewer.classList.remove("hidden");
  };

  const likeBtn = document.createElement("button");
  likeBtn.setAttribute("data-like-btn", file.name);
  const isLiked = userLikes[file.name] || false;
  likeBtn.textContent = isLiked ? "❤️" : "🤍";
  likeBtn.style.cssText = `
    position: absolute; bottom: 8px; right: 8px;
    background: ${isLiked ? "rgba(255,64,129,0.18)" : "rgba(255,255,255,0.18)"};
    border: 1px solid ${isLiked ? "rgba(255,64,129,0.45)" : "rgba(255,255,255,0.35)"};
    border-radius: 20px;
    padding: 6px 10px; font-size: 16px; cursor: pointer;
    color: ${isLiked ? "#ff4081" : "rgba(255,255,255,0.85)"};
    z-index: 10; transition: all 0.2s ease;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    touch-action: manipulation;
  `;
  likeBtn.onclick = async (e) => {
    e.stopPropagation();
    likeBtn.style.animation = "heartPulse 0.4s ease";
    await toggleLike(file.name);
    setTimeout(() => { likeBtn.style.animation = ""; }, 400);
  };

  container.appendChild(img);
  container.appendChild(likeBtn);
  return container;
}

function displayMoreImages() {
  if (isLoading || displayedCount >= allFiles.length) return;
  isLoading = true;

  const endIndex = Math.min(displayedCount + itemsPerPage, allFiles.length);
  const newlyRendered = [];

  for (let i = displayedCount; i < endIndex; i++) {
    gallery.appendChild(createImageCard(allFiles[i]));
    newlyRendered.push(allFiles[i].name);
  }
  displayedCount = endIndex;
  isLoading = false;

  const uncached = newlyRendered.filter(name => userLikes[name] === undefined);
  if (uncached.length > 0) bulkLoadLikes(uncached);
}

loadAllImages();

/* ==========================
無限スクロール
========================== */

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && displayedCount < allFiles.length) {
      displayMoreImages();
      updateObserver();
    }
  });
}, { root: null, rootMargin: "200px", threshold: 0 });

function updateObserver() {
  const containers = gallery.querySelectorAll("div");
  if (containers.length > 0) observer.observe(containers[containers.length - 1]);
}

/* ==========================
Realtime + ポーリング（新着写真の反映）
Supabase StorageのRealtimeは届かない環境があるため
ポーリングをメインにしてRealtimeをサブとして使う
========================== */

let photosChannel = null;
let photosPollTimer = null;

function startPhotosPolling() {
  if (photosPollTimer) return;
  // 10秒ごとに新着確認
  photosPollTimer = setInterval(() => {
    loadAllImages();
  }, 10000);
}

function stopPhotosPolling() {
  if (photosPollTimer) { clearInterval(photosPollTimer); photosPollTimer = null; }
}

function setupRealtimeListeners() {
  if (photosChannel) { supabaseClient.removeChannel(photosChannel); photosChannel = null; }

  photosChannel = supabaseClient.channel(`photos-${Date.now()}`);
  photosChannel
    .on("postgres_changes", { event: "INSERT", schema: "storage", table: "objects" }, (payload) => {
      if (payload.new.bucket_id === "photos") loadAllImages();
    })
    .subscribe((status) => console.log("Photos channel:", status));
}

setupRealtimeListeners();
startPhotosPolling();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPhotosPolling();
    if (photosChannel) supabaseClient.removeChannel(photosChannel);
    photosChannel = null;
  } else {
    // 復帰時：即座に新着確認してから再接続
    loadAllImages();
    setupRealtimeListeners();
    startPhotosPolling();
  }
});

window.addEventListener("beforeunload", () => {
  stopPhotosPolling();
  if (photosChannel) supabaseClient.removeChannel(photosChannel);
});

/* ==========================
FAB：タップで直接ピッカーを開く
========================== */

fab.onclick = (e) => {
  e.stopPropagation();
  fileSelectInput.click();
};

/* ==========================
隠しボタン：席番号バッジを5回タップでranking.htmlへ
========================== */

let seatTapCount = 0;
let seatTapTimer = null;

const seatBadgeEl = document.getElementById("seatBadge");
if (seatBadgeEl) {
  // ボタンっぽいスタイルをJSで付与
  seatBadgeEl.style.cursor = "pointer";
  seatBadgeEl.style.webkitUserSelect = "none";
  seatBadgeEl.style.userSelect = "none";

  seatBadgeEl.addEventListener("click", () => {
    seatTapCount++;
    if (seatTapTimer) clearTimeout(seatTapTimer);
    // 軽くフラッシュして「反応してる」感を出す
    seatBadgeEl.style.opacity = "0.5";
    setTimeout(() => { seatBadgeEl.style.opacity = ""; }, 100);
    seatTapTimer = setTimeout(() => { seatTapCount = 0; }, 2000);
    if (seatTapCount >= 5) {
      seatTapCount = 0;
      window.location.href = "ranking.html";
    }
  });
}

/* ==========================
ファイル選択
========================== */

fileSelectInput.onchange = handleFile;

function handleFile(e) {
  selectedFile = e.target.files[0];
  if (!selectedFile) return;
  if (previewImage.src.startsWith("blob:")) URL.revokeObjectURL(previewImage.src);
  previewImage.src = URL.createObjectURL(selectedFile);
  previewModal.classList.remove("hidden");
}

/* ==========================
キャンセル
========================== */

cancelUpload.onclick = () => {
  previewModal.classList.add("hidden");
  if (previewImage.src.startsWith("blob:")) { URL.revokeObjectURL(previewImage.src); previewImage.src = ""; }
  fileSelectInput.value = "";
  selectedFile = null;
};

/* ==========================
アップロード
========================== */

let isUploading = false;

confirmUpload.onclick = async () => {
  if (!selectedFile || isUploading) return;

  isUploading = true;
  confirmUpload.disabled = true;
  cancelUpload.disabled = true;

  uploadStatus.textContent = "圧縮中…";
  spinner.classList.remove("hidden");

  const compressedBlob = await compressImage(selectedFile);
  uploadStatus.textContent = "アップロード中…";

  // ファイル名にseat番号を埋め込む（ランキング集計用）
  const fileName = `${Date.now()}_seat${currentSeatNumber}.jpg`;

  const { error } = await supabaseClient.storage
    .from("photos")
    .upload(fileName, compressedBlob, { contentType: "image/jpeg" });

  if (error) {
    uploadStatus.textContent = "";
    spinner.classList.add("hidden");
    showToast("アップロードに失敗しました");
    isUploading = false;
    confirmUpload.disabled = false;
    cancelUpload.disabled = false;
    return;
  }

  uploadStatus.textContent = "アップロード完了！";
  spinner.classList.add("hidden");
  showToast("アップロードしました");

  setTimeout(() => {
    previewModal.classList.add("hidden");
    fileSelectInput.value = "";
    selectedFile = null;
    isUploading = false;
    confirmUpload.disabled = false;
    cancelUpload.disabled = false;
    uploadStatus.textContent = "";
  }, 800);

  // Realtimeが届かない環境へのフォールバック
  setTimeout(() => loadAllImages(), 3000);
};

/* ==========================
初期状態
========================== */

previewModal.classList.add("hidden");
viewer.classList.add("hidden");

/* ==========================
ランキング発表監視
発表後：いいね数表示 + Realtimeで更新 + 60秒ポーリング
========================== */

let likeCountChannel = null;
let likeCountPollTimer = null;

// 全表示済み写真のいいね数を更新して画面に反映
async function refreshAllLikeCounts() {
  const names = allFiles.slice(0, displayedCount).map(f => f.name);
  if (!names.length) return;
  await bulkLoadLikeCounts(names);
  for (const name of names) updateLikeButtons(name);
}

// 発表後モードに切り替え
async function enterRevealMode() {
  if (isRevealMode) return;
  isRevealMode = true;

  // 全ボタンのいいね数を取得して表示
  await refreshAllLikeCounts();

  // Realtimeはトリガーとしてだけ使い、必ずDBから正確な数字を取得
  // ※自分の操作は楽観的更新済みのためスキップ
  likeCountChannel = supabaseClient
    .channel("likes-watch")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "likes" },
      async (payload) => {
        const fileName = payload.new?.file_name;
        const userId   = payload.new?.user_id;
        if (!fileName || userId === currentUserId) return;
        await fetchLikeCount(fileName);
      }
    )
    .on("postgres_changes",
      { event: "DELETE", schema: "public", table: "likes" },
      async (payload) => {
        const fileName = payload.old?.file_name;
        const userId   = payload.old?.user_id;
        if (!fileName || userId === currentUserId) return;
        await fetchLikeCount(fileName);
      }
    )
    .subscribe();

  // 30秒ポーリング（Realtimeのフォールバック・DELETE未検知の補完）
  likeCountPollTimer = setInterval(refreshAllLikeCounts, 30000);
}

// 起動時にフラグ確認
async function checkRevealStatus() {
  const { data } = await supabaseClient
    .from("settings")
    .select("value")
    .eq("key", "reveal_ranking")
    .single();

  if (data?.value === "true") {
    enterRevealMode();
    return;
  }

  // 未発表ならRealtimeで発表を待つ
  supabaseClient
    .channel("reveal-watch")
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "settings", filter: "key=eq.reveal_ranking" },
      (payload) => {
        if (payload.new?.value === "true") enterRevealMode();
      }
    )
    .subscribe();
}

checkRevealStatus();