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
Viewer - モバイル対応版
========================== */

// 背景クリックで閉じる
viewer.onclick = (e) => {
  if (e.target === viewer) {
    viewer.classList.add("hidden");
  }
};

// ×ボタンで閉じる
closeViewer.onclick = () => {
  viewer.classList.add("hidden");
};

// 画像クリックでは閉じない
viewerImg.onclick = (e) => {
  e.stopPropagation();
};

// ダウンロードボタン - スマホアルバムに直接保存
downloadBtn.onclick = async (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  if (!currentImageUrl) return;
  
  try {
    downloadBtn.disabled = true;
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = "保存中…";
    
    // 画像をfetchして、CanvasAPIで処理
    const response = await fetch(currentImageUrl);
    const blob = await response.blob();
    
    // HTMLCanvasを使用してダウンロード（モバイルフレンドリー）
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = async () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // ブラウザのダウンロード機能を使用
      canvas.toBlob((canvasBlob) => {
        const url = URL.createObjectURL(canvasBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `wedding-${Date.now()}.jpg`;
        
        // トリガー
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // 成功メッセージと自動閉じる
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;
        
        showToast("📸 写真を保存しました！");
        
        setTimeout(() => {
          viewer.classList.add("hidden");
        }, 1500);
      }, "image/jpeg", 0.95);
    };
    
    img.src = URL.createObjectURL(blob);
    
  } catch (error) {
    console.error("保存失敗:", error);
    showToast("❌ 保存に失敗しました");
    downloadBtn.textContent = "⬇ ダウンロード";
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
      
      // モーダルを表示
      viewer.classList.remove("hidden");

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
＋ボタン
========================== */

fab.onclick = () => {

  menu.classList.toggle("show");
  menu.classList.remove("hidden");

};

/* ==========================
カメラ
========================== */

cameraBtn.onclick = () => {
  cameraInput.click();
};

/* ==========================
アルバム
========================== */

fileBtn.onclick = () => {
  fileSelectInput.click();
};

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
  menu.classList.add("hidden");

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