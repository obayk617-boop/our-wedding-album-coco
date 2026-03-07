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

/* ==========================
viewer
========================== */

viewer.onclick = (e) => {
  if (e.target === viewer) {
    viewer.classList.add("hidden");
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
      downloadBtn.href = img.src;

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
    alert("アップロード失敗");

    confirmUpload.disabled = false;
    cancelUpload.disabled = false;

    return;

  }

  uploadStatus.textContent = "アップロード完了！";
  spinner.classList.add("hidden");

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