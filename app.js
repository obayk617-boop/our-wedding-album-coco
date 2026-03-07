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
let menuOpen = false;

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
`;
document.head.appendChild(style);

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
Gallery
========================== */

async function loadImages() {

  const { data, error } = await supabaseClient.storage
    .from("photos")
    .list("", {
      sortBy: { column: "created_at", order: "desc" }
    });

  if (error) return;

  gallery.innerHTML = "";

  data.forEach(file => {

    const { data: urlData } = supabaseClient.storage
      .from("photos")
      .getPublicUrl(file.name);

    const img = document.createElement("img");

    img.src = urlData.publicUrl;

    img.onclick = () => {

      viewerImg.src = img.src;
      currentImageUrl = img.src;
      
      viewer.classList.remove("hidden");
      
      // メニュー閉じる
      closeMenu();

    };

    gallery.appendChild(img);

  });

}

loadImages();

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
        loadImages();
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

// ＋ボタン
fab.onclick = (e) => {
  e.stopPropagation();
  toggleMenu();
};

// メニューボタン
cameraBtn.onclick = () => {
  cameraInput.click();
  closeMenu();
};

fileBtn.onclick = () => {
  fileSelectInput.click();
  closeMenu();
};

// ページ全体をクリックしてメニュー閉じる
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

  loadImages();

};

/* ==========================
初期状態
========================== */

menu.classList.add("hidden");
previewModal.classList.add("hidden");
viewer.classList.add("hidden");