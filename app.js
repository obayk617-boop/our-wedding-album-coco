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
いいね機能 - 最適化版
========================== */

async function getLikesForImage(fileName) {
  try {
    const { count, error } = await supabaseClient
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("file_name", fileName);
    
    if (error) {
      console.warn(`Like count error for ${fileName}:`, error.message);
      return likesCache[fileName] || 0;
    }
    
    return count || 0;
  } catch (error) {
    console.error("いいね数取得エラー:", error);
    return likesCache[fileName] || 0;
  }
}

async function checkUserLike(fileName) {
  try {
    const { data } = await supabaseClient
      .from("likes")
      .select("id")
      .eq("file_name", fileName)
      .eq("user_id", currentUserId);
    
    return data && data.length > 0;
  } catch (error) {
    console.error("ユーザーいいね確認エラー:", error);
    return false;
  }
}

async function toggleLike(fileName) {
  try {
    const hasLiked = await checkUserLike(fileName);
    
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
Gallery - 最適化版（新規画像検出）
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
  
  // 新しい画像があったかチェック
  const newPhotoCount = newFiles.length;
  const photosAdded = newPhotoCount - lastCheckedPhotoCount;
  
  if (photosAdded > 0) {
    console.log(`新しい画像が${photosAdded}個追加されました`);
    lastCheckedPhotoCount = newPhotoCount;
  }

  allFiles = newFiles;
  displayedCount = 0;
  gallery.innerHTML = "";
  
  // 最初の画像を読み込む
  displayMoreImages();
  
  // 新しい画像のいいね数を読み込む（バックグラウンド）
  if (!isInitialLoadDone) {
    isInitialLoadDone = true;
    loadLikesData();
  } else if (photosAdded > 0) {
    // 新しく追加された画像のみいいね数を取得（最初の5枚のみ）
    const newPhotos = allFiles.slice(0, Math.min(photosAdded, 5));
    for (const file of newPhotos) {
      try {
        const count = await getLikesForImage(file.name);
        likesCache[file.name] = count;
        
        const isLiked = await checkUserLike(file.name);
        userLikes[file.name] = isLiked;
        
        updateLikeButtons(file.name);
      } catch (error) {
        console.error(`Error loading likes for ${file.name}:`, error);
      }
    }
  }
}

// いいねデータを非同期で読み込む（最初の30枚のみ）
async function loadLikesData() {
  const filesToLoad = allFiles.slice(0, 30);
  
  for (const file of filesToLoad) {
    try {
      const count = await getLikesForImage(file.name);
      likesCache[file.name] = count;
      
      const isLiked = await checkUserLike(file.name);
      userLikes[file.name] = isLiked;
      
      updateLikeButtons(file.name);
    } catch (error) {
      if (error?.message?.includes('429')) {
        console.warn('レート制限に達しました');
        break;
      }
      console.error(`Error loading likes for ${file.name}:`, error);
    }
  }
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

    const count = likesCache[file.name];
    const isLiked = userLikes[file.name] || false;
    
    // いいね数が未取得の場合は "？"を表示
    if (count === undefined) {
      likeBtn.textContent = `❓ ?`;
      likeBtn.style.color = "#999";
      
      // 非同期でいいね数を取得
      getLikesForImage(file.name)
        .then(cnt => {
          likesCache[file.name] = cnt;
          updateLikeButtons(file.name);
        })
        .catch(err => console.error(`Error loading likes for ${file.name}:`, err));
    } else {
      likeBtn.textContent = isLiked ? `❤️ ${count}` : `🤍 ${count}`;
      likeBtn.style.color = isLiked ? "#ff4081" : "#999";
    }

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
Realtime - WebSocket最適化版（ポーリングなし）
========================== */

let photosChannel = null;
let likesChannel = null;
let isLikesChannelConnected = false;

function setupRealtimeListeners() {
  console.log('Setting up realtime listeners...');
  
  // ★ いいね更新のWebSocket監視（リクエストカウント対象外）
  likesChannel = supabaseClient.channel('public:likes');

  likesChannel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'likes'
      },
      (payload) => {
        console.log('いいね更新受信:', payload);
        const fileName = payload.new?.file_name || payload.old?.file_name;
        
        if (fileName) {
          const event = payload.eventType;
          
          if (event === 'INSERT') {
            likesCache[fileName] = (likesCache[fileName] || 0) + 1;
            console.log(`いいねが追加: ${fileName} (${likesCache[fileName]})`);
          } else if (event === 'DELETE') {
            likesCache[fileName] = Math.max(0, (likesCache[fileName] || 1) - 1);
            console.log(`いいねが削除: ${fileName} (${likesCache[fileName]})`);
          }
          
          updateLikeButtons(fileName);
        }
      }
    )
    .subscribe((status) => {
      console.log('Likes channel status:', status);
      if (status === 'SUBSCRIBED') {
        isLikesChannelConnected = true;
        showToast('✅ リアルタイム接続成功');
      } else if (status === 'CLOSED') {
        isLikesChannelConnected = false;
        showToast('⚠️ リアルタイム接続切断（自動再接続中）');
        
        // 自動再接続
        setTimeout(() => {
          setupRealtimeListeners();
        }, 3000);
      }
    });

  // 新しい写真追加の監視
  photosChannel = supabaseClient.channel('public:objects');

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
  if (!isLikesChannelConnected) {
    console.warn('WebSocket接続が失われています。再接続します...');
    setupRealtimeListeners();
  }
}, 30000);

// ページを離れる時にクリーンアップ
window.addEventListener('beforeunload', () => {
  if (likesChannel) {
    likesChannel.unsubscribe();
    console.log('Likes channel unsubscribed');
  }
  if (photosChannel) {
    photosChannel.unsubscribe();
    console.log('Photos channel unsubscribed');
  }
});

// ページを非表示になった時はチャンネル削除、復帰時に再接続
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (likesChannel) likesChannel.unsubscribe();
    if (photosChannel) photosChannel.unsubscribe();
    console.log('Page hidden - channels paused');
  } else {
    setupRealtimeListeners();
    console.log('Page visible - channels reconnected');
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