import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseClient = createClient(
  "https://vysdoicwyroygakdrwyt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5c2RvaWN3eXJveWdha2Ryd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDExMzEsImV4cCI6MjA4NzIxNzEzMX0.uBpCtpMy8pIHTi0bU3GkwcquW-15QcQOr6Pw58TNlAw"
);

/* ==========================
DOM
========================== */

const gallery = document.getElementById("gallery");

const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");
const downloadBtn = document.getElementById("downloadBtn");
const closeViewer = document.getElementById("closeViewer");

const uploadStatus = document.getElementById("uploadStatus");
const spinner = document.getElementById("spinner");

const fab = document.getElementById("fab");
const menu = document.getElementById("menu");

const cameraBtn = document.getElementById("cameraBtn");
const fileBtn = document.getElementById("fileBtn");

const cameraInput = document.getElementById("cameraInput");
const fileSelectInput = document.getElementById("fileSelectInput");

const previewModal = document.getElementById("previewModal");
const previewImage = document.getElementById("previewImage");

const confirmUpload = document.getElementById("confirmUpload");
const cancelUpload = document.getElementById("cancelUpload");

let selectedFile = null;
let currentImageUrl = null;
let currentImageFileName = null;
let menuOpen = false;

/* ==========================
ユーザーID管理
========================== */

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
無限スクロール用の変数
========================== */

let allFiles = [];
let displayedCount = 0;
const itemsPerPage = 12;
let isLoading = false;
let likesCache = {};
let userLikes = {};
let isInitialLoadDone = false;
let lastCheckedPhotoCount = 0;

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

// アニメーション定義
const style = document.createElement("style");
style.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  
  @keyframes slideDown {
    from {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
  }

  @keyframes heartPulse {
    0% {
      transform: scale(1);
    }
    25% {
      transform: scale(1.3);
    }
    50% {
      transform: scale(1);
    }
  }
`;
document.head.appendChild(style);

/* ==========================
いいね機能 - バルク取得版（N+1解消）
========================== */

// 複数ファイルのいいね数を1回のクエリで取得
async function bulkLoadLikes(fileNames) {
  if (!fileNames.length) return;
  try {
    // いいね数を集計（グループ別カウント）
    const { data: countsData, error: countError } = await supabaseClient
      .from("likes")
      .select("file_name")
      .in("file_name", fileNames);

    if (!countError && countsData) {
      // ファイル名ごとにカウント集計
      const countMap = {};
      for (const row of countsData) {
        countMap[row.file_name] = (countMap[row.file_name] || 0) + 1;
      }
      for (const name of fileNames) {
        likesCache[name] = countMap[name] || 0;
      }
    }

    // 自分のいいねを一括取得
    const { data: myLikesData, error: myError } = await supabaseClient
      .from("likes")
      .select("file_name")
      .in("file_name", fileNames)
      .eq("user_id", currentUserId);

    if (!myError && myLikesData) {
      const mySet = new Set(myLikesData.map(r => r.file_name));
      for (const name of fileNames) {
        userLikes[name] = mySet.has(name);
      }
    }

    // 取得済みのボタンをまとめて更新
    for (const name of fileNames) {
      updateLikeButtons(name);
    }
  } catch (error) {
    console.error("バルクいいね取得エラー:", error);
  }
}

async function checkUserLike(fileName) {
  // toggleLike 内で使うため残す（単体確認用）
  return userLikes[fileName] ?? false;
}

async function toggleLike(fileName) {
  try {
    // キャッシュから判定（DBへの追加クエリ不要）
    const hasLiked = userLikes[fileName] ?? false;
    
    if (hasLiked) {
      const { error } = await supabaseClient
        .from("likes")
        .delete()
        .eq("file_name", fileName)
        .eq("user_id", currentUserId);
      
      if (error?.status === 429) {
        showToast("⚠️ 一時的に混雑しています。少し待ってから再度お試しください");
        return;
      }
      
      userLikes[fileName] = false;
      likesCache[fileName] = Math.max(0, (likesCache[fileName] || 0) - 1);
    } else {
      const { error } = await supabaseClient
        .from("likes")
        .insert([
          {
            file_name: fileName,
            user_id: currentUserId
          }
        ]);
      
      if (error?.status === 429) {
        showToast("⚠️ 一時的に混雑しています。少し待ってから再度お試しください");
        return;
      }
      
      userLikes[fileName] = true;
      likesCache[fileName] = (likesCache[fileName] || 0) + 1;
    }
    
    updateLikeButtons(fileName);
    
  } catch (error) {
    console.error("いいね操作エラー:", error);
    showToast("❌ エラーが発生しました");
  }
}

function updateLikeButtons(fileName) {
  const likeBtn = document.querySelector(`[data-like-btn="${fileName}"]`);
  if (likeBtn) {
    const count = likesCache[fileName] || 0;
    const isLiked = userLikes[fileName] || false;
    
    likeBtn.textContent = isLiked ? `❤️ ${count}` : `🤍 ${count}`;
    likeBtn.style.color = isLiked ? "#ff4081" : "#999";
  }
}

/* ==========================
Viewer
========================== */

viewer.onclick = (e) => {
  if (e.target === viewer) {
    viewer.classList.add("hidden");
  }
};

closeViewer.onclick = () => {
  viewer.classList.add("hidden");
};

viewerImg.onclick = (e) => {
  e.stopPropagation();
};

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
    
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], "photo.jpg", { type: "image/jpeg" })] })) {
      const file = new File([blob], `wedding-${Date.now()}.jpg`, { type: "image/jpeg" });
      
      try {
        await navigator.share({
          files: [file],
          title: "Wedding Photo",
          text: "Wedding Album Photo"
        });
        
        showToast("📸 写真を保存しました！");
        setTimeout(() => {
          viewer.classList.add("hidden");
        }, 1500);
        
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          showToast("❌ 保存に失敗しました");
        }
      }
      
    } else {
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      
      showToast("📸 画像を開きました");
      setTimeout(() => {
        viewer.classList.add("hidden");
      }, 1500);
    }
    
    downloadBtn.textContent = originalText;
    downloadBtn.disabled = false;
    
  } catch (error) {
    console.error("保存失敗:", error);
    showToast("❌ 保存に失敗しました");
    downloadBtn.textContent = "📥 保存";
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

    reader.onload = e => img.src = e.target.result;

    img.onload = () => {

      const scale = Math.min(maxWidth / img.width, 1);

      const canvas = document.createElement("canvas");

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => resolve(blob), "image/jpeg", quality);

    };

    reader.readAsDataURL(file);

  });
}

/* ==========================
Gallery - 差分更新版（全消去しない）
========================== */

async function loadAllImages() {

  const { data, error } = await supabaseClient.storage
    .from("photos")
    .list("", {
      sortBy: { column: "created_at", order: "desc" },
      limit: 1000
    });

  if (error) {
    console.error("画像読み込みエラー:", error);
    return;
  }

  const newFiles = data || [];

  // ── 初回ロード ──
  if (!isInitialLoadDone) {
    isInitialLoadDone = true;
    allFiles = newFiles;
    lastCheckedPhotoCount = newFiles.length;
    displayedCount = 0;
    gallery.innerHTML = "";

    displayMoreImages();
    updateObserver(); // DOM追加直後に確実に監視開始

    // 表示中の先頭をバルク取得
    const initialNames = allFiles.slice(0, itemsPerPage).map(f => f.name);
    await bulkLoadLikes(initialNames);
    return;
  }

  // ── 差分検出：新しく追加されたファイルのみ先頭に挿入 ──
  const existingNames = new Set(allFiles.map(f => f.name));
  const addedFiles = newFiles.filter(f => !existingNames.has(f.name));

  if (addedFiles.length > 0) {
    console.log(`新しい画像が ${addedFiles.length} 個追加されました`);

    // allFiles の先頭に追加（降順を維持）
    allFiles = [...addedFiles, ...allFiles];
    displayedCount += addedFiles.length;
    lastCheckedPhotoCount = allFiles.length;

    // 新しいカードを先頭に挿入（gallery.innerHTML は触らない）
    const fragment = document.createDocumentFragment();
    for (const file of [...addedFiles].reverse()) {
      fragment.prepend(createImageCard(file));
    }
    gallery.prepend(fragment);

    // 新しい写真のいいね数をバルク取得
    await bulkLoadLikes(addedFiles.map(f => f.name));
  }
}

// カード1枚を生成する関数（loadAllImages の差分挿入でも再利用）
function createImageCard(file) {
  const { data: urlData } = supabaseClient.storage
    .from("photos")
    .getPublicUrl(file.name);

  const container = document.createElement("div");
  container.style.cssText = `
    position: relative;
    width: 100%;
    aspect-ratio: 1;
  `;

  const img = document.createElement("img");
  img.src = urlData.publicUrl;
  img.loading = "lazy";
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 12px;
    cursor: pointer;
  `;

  img.onclick = () => {
    viewerImg.src = img.src;
    currentImageUrl = img.src;
    currentImageFileName = file.name;
    viewer.classList.remove("hidden");
    closeMenu();
  };

  const likeBtn = document.createElement("button");
  likeBtn.setAttribute("data-like-btn", file.name);
  likeBtn.style.cssText = `
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.9);
    border: none;
    border-radius: 20px;
    padding: 6px 12px;
    font-size: 14px;
    cursor: pointer;
    z-index: 10;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  `;

  const count = likesCache[file.name];
  const isLiked = userLikes[file.name] || false;

  likeBtn.textContent = isLiked ? `❤️ ${count ?? 0}` : `🤍 ${count ?? 0}`;
  likeBtn.style.color = isLiked ? "#ff4081" : "#999";

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
  
  if (isLoading) return;
  if (displayedCount >= allFiles.length) return;
  
  isLoading = true;
  
  const endIndex = Math.min(displayedCount + itemsPerPage, allFiles.length);
  const newlyRendered = [];

  for (let i = displayedCount; i < endIndex; i++) {
    const file = allFiles[i];
    gallery.appendChild(createImageCard(file));
    newlyRendered.push(file.name);
  }
  
  displayedCount = endIndex;
  isLoading = false;

  // スクロールで追加表示された分のいいね数をバルク取得（キャッシュ未取得分のみ）
  const uncached = newlyRendered.filter(name => likesCache[name] === undefined);
  if (uncached.length > 0) {
    bulkLoadLikes(uncached);
  }
}

loadAllImages();

/* ==========================
無限スクロール検出
========================== */

const observerOptions = {
  root: null,
  rootMargin: '200px',
  threshold: 0
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && displayedCount < allFiles.length) {
      displayMoreImages();
      updateObserver(); // displayMoreImagesは同期処理なので直後で確実
    }
  });
}, observerOptions);

function updateObserver() {
  const containers = gallery.querySelectorAll('div');
  if (containers.length > 0) {
    const lastContainer = containers[containers.length - 1];
    observer.observe(lastContainer);
  }
}

// loadAllImages()はawaitで呼んでいないのでここでは呼ばない
// （初回ロード完了後にloadAllImages内部でupdateObserverを呼ぶ）

/* ==========================
Realtime - WebSocket最適化版（ポーリングなし）
========================== */

let photosChannel = null;
let likesChannel = null;
let isLikesChannelConnected = false;
let isReconnecting = false; // 再接続中フラグ（多重実行防止）

function setupRealtimeListeners() {
  // 再接続中は多重実行しない
  if (isReconnecting) return;
  isReconnecting = true;
  console.log('Setting up realtime listeners...');

  // 既存チャンネルを破棄（このremoveChannelがCLOSEDを発火させるが、
  // isReconnecting=trueなので内部のCLOSEDハンドラは無視される）
  if (likesChannel) {
    supabaseClient.removeChannel(likesChannel);
    likesChannel = null;
  }
  if (photosChannel) {
    supabaseClient.removeChannel(photosChannel);
    photosChannel = null;
  }

  const ts = Date.now();
  likesChannel = supabaseClient.channel(`likes-${ts}`);

  likesChannel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'likes'
      },
      (payload) => {
        const fileName = payload.new?.file_name || payload.old?.file_name;
        if (fileName) {
          if (payload.eventType === 'INSERT') {
            likesCache[fileName] = (likesCache[fileName] || 0) + 1;
          } else if (payload.eventType === 'DELETE') {
            likesCache[fileName] = Math.max(0, (likesCache[fileName] || 1) - 1);
          }
          updateLikeButtons(fileName);
        }
      }
    )
    .subscribe((status) => {
      console.log('Likes channel status:', status);
      if (status === 'SUBSCRIBED') {
        isLikesChannelConnected = true;
        isReconnecting = false; // 接続成功でフラグ解除
      } else if ((status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !isReconnecting) {
        // isReconnecting=false の時だけ再接続（removeChannelによるCLOSEDは無視）
        isLikesChannelConnected = false;
        isReconnecting = true;
        console.warn('Likes channel lost, reconnecting in 3s...');
        setTimeout(() => {
          isReconnecting = false;
          setupRealtimeListeners();
        }, 3000);
      }
    });

  // 新しい写真追加の監視
  photosChannel = supabaseClient.channel(`photos-${ts}`);

  photosChannel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'storage',
        table: 'objects'
      },
      (payload) => {
        console.log('新しい写真が追加されました:', payload);
        if (payload.new.bucket_id === "photos") {
          loadAllImages();
        }
      }
    )
    .subscribe((status) => {
      console.log('Photos channel status:', status);
    });
}

// リアルタイムリスナー開始
setupRealtimeListeners();

// 定期的に接続確認（30秒ごと）
setInterval(() => {
  if (!isLikesChannelConnected && !isReconnecting) {
    console.warn('WebSocket接続が失われています。再接続します...');
    setupRealtimeListeners();
  }
}, 30000);

// ページを離れる時にクリーンアップ
window.addEventListener('beforeunload', () => {
  if (likesChannel) supabaseClient.removeChannel(likesChannel);
  if (photosChannel) supabaseClient.removeChannel(photosChannel);
});

// ページを非表示になった時はチャンネル停止、復帰時に再接続
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    isReconnecting = true; // removeChannelのCLOSEDで再接続ループしないよう先にセット
    if (likesChannel) supabaseClient.removeChannel(likesChannel);
    if (photosChannel) supabaseClient.removeChannel(photosChannel);
    likesChannel = null;
    photosChannel = null;
    isLikesChannelConnected = false;
    isReconnecting = false;
  } else {
    setupRealtimeListeners();
  }
});

/* ==========================
メニュー開閉
========================== */

function openMenu() {
  menuOpen = true;
  menu.classList.remove("hidden");
  menu.classList.add("show");
}

function closeMenu() {
  menuOpen = false;
  menu.classList.remove("show");
  menu.classList.add("hidden");
}

function toggleMenu() {
  if (menuOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

fab.onclick = (e) => {
  e.stopPropagation();
  toggleMenu();
};

cameraBtn.onclick = () => {
  cameraInput.click();
  closeMenu();
};

fileBtn.onclick = () => {
  fileSelectInput.click();
  closeMenu();
};

document.addEventListener("click", (e) => {
  if (menuOpen && !fab.contains(e.target) && !menu.contains(e.target)) {
    closeMenu();
  }
});

/* ==========================
ファイル選択
========================== */

cameraInput.onchange = handleFile;
fileSelectInput.onchange = handleFile;

function handleFile(e) {

  selectedFile = e.target.files[0];

  if (!selectedFile) return;

  previewImage.src = URL.createObjectURL(selectedFile);

  previewModal.classList.remove("hidden");

}

/* ==========================
キャンセル
========================== */

cancelUpload.onclick = () => {

  previewModal.classList.add("hidden");

};

/* ==========================
アップロード
========================== */

confirmUpload.onclick = async () => {

  if (!selectedFile) return;

  confirmUpload.disabled = true;
  cancelUpload.disabled = true;

  uploadStatus.textContent = "圧縮中…";
  spinner.classList.remove("hidden");

  const compressedBlob = await compressImage(selectedFile);

  uploadStatus.textContent = "アップロード中…";

  const fileName = Date.now() + ".jpg";

  const { error } = await supabaseClient.storage
    .from("photos")
    .upload(fileName, compressedBlob, {
      contentType: "image/jpeg"
    });

  if (error) {

    uploadStatus.textContent = "";
    showToast("❌ アップロード失敗");

    confirmUpload.disabled = false;
    cancelUpload.disabled = false;

    return;

  }

  uploadStatus.textContent = "アップロード完了！";
  spinner.classList.add("hidden");

  showToast("✅ アップロードしました！");

  setTimeout(() => {

    previewModal.classList.add("hidden");

    confirmUpload.disabled = false;
    cancelUpload.disabled = false;

    uploadStatus.textContent = "";

  }, 800);

  loadAllImages();

};

/* ==========================
初期状態
========================== */

menu.classList.add("hidden");
previewModal.classList.add("hidden");
viewer.classList.add("hidden");