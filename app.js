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
let likesCache = {}; // ファイル名: いいね数のキャッシュ
let userLikes = {}; // ファイル名: ユーザーがいいねしたかどうか

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
いいね機能
========================== */

async function getLikesForImage(fileName) {
  const { count } = await supabaseClient
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("file_name", fileName);
  
  return count || 0;
}

async function checkUserLike(fileName) {
  const { data } = await supabaseClient
    .from("likes")
    .select("id")
    .eq("file_name", fileName)
    .eq("user_id", currentUserId);
  
  return data && data.length > 0;
}

async function toggleLike(fileName) {
  try {
    const hasLiked = await checkUserLike(fileName);
    
    if (hasLiked) {
      // いいねを削除
      await supabaseClient
        .from("likes")
        .delete()
        .eq("file_name", fileName)
        .eq("user_id", currentUserId);
      
      userLikes[fileName] = false;
    } else {
      // いいねを追加
      await supabaseClient
        .from("likes")
        .insert([
          {
            file_name: fileName,
            user_id: currentUserId
          }
        ]);
      
      userLikes[fileName] = true;
    }
    
    // いいね数を更新
    const newCount = await getLikesForImage(fileName);
    likesCache[fileName] = newCount;
    updateLikeButtons(fileName);
    
  } catch (error) {
    console.error("いいね操作エラー:", error);
  }
}

function updateLikeButtons(fileName) {
  // ギャラリー内のボタン
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
Gallery - いいね機能付き
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

  allFiles = data || [];
  displayedCount = 0;
  gallery.innerHTML = "";
  
  // 全画像のいいね数を取得
  for (const file of allFiles) {
    likesCache[file.name] = await getLikesForImage(file.name);
    userLikes[file.name] = await checkUserLike(file.name);
  }
  
  displayMoreImages();
}

function displayMoreImages() {
  
  if (isLoading) return;
  if (displayedCount >= allFiles.length) return;
  
  isLoading = true;
  
  const endIndex = Math.min(displayedCount + itemsPerPage, allFiles.length);
  
  for (let i = displayedCount; i < endIndex; i++) {
    const file = allFiles[i];
    
    const { data: urlData } = supabaseClient.storage
      .from("photos")
      .getPublicUrl(file.name);

    // コンテナ
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

    // いいねボタン
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

    const count = likesCache[file.name] || 0;
    const isLiked = userLikes[file.name] || false;
    likeBtn.textContent = isLiked ? `❤️ ${count}` : `🤍 ${count}`;
    likeBtn.style.color = isLiked ? "#ff4081" : "#999";

    likeBtn.onclick = async (e) => {
      e.stopPropagation();
      likeBtn.style.animation = "heartPulse 0.4s ease";
      await toggleLike(file.name);
      setTimeout(() => {
        likeBtn.style.animation = "";
      }, 400);
    };

    container.appendChild(img);
    container.appendChild(likeBtn);
    gallery.appendChild(container);
  }
  
  displayedCount = endIndex;
  isLoading = false;
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

const originalDisplayMoreImages = displayMoreImages;
displayMoreImages = function() {
  originalDisplayMoreImages();
  setTimeout(updateObserver, 100);
};

updateObserver();

/* ==========================
Realtime
========================== */

supabaseClient
  .channel("photos-realtime")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "storage",
      table: "objects"
    },
    (payload) => {

      if (payload.new.bucket_id === "photos") {
        loadAllImages();
      }

    }
  )
  .subscribe();

// いいね更新のリアルタイム監視
supabaseClient
  .channel("likes-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "likes"
    },
    async (payload) => {
      const fileName = payload.new?.file_name || payload.old?.file_name;
      if (fileName) {
        likesCache[fileName] = await getLikesForImage(fileName);
        updateLikeButtons(fileName);
      }
    }
  )
  .subscribe();

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