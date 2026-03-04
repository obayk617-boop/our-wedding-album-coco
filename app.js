import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseClient = createClient(
  "https://vysdoicwyroygakdrwyt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5c2RvaWN3eXJveWdha2Ryd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDExMzEsImV4cCI6MjA4NzIxNzEzMX0.uBpCtpMy8pIHTi0bU3GkwcquW-15QcQOr6Pw58TNlAw"
);

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const gallery = document.getElementById("gallery");
const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");

uploadBtn.addEventListener("click", upload);

viewer.onclick = () => viewer.style.display = "none";

/* ---------- 画像圧縮 ---------- */
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

/* ---------- Upload ---------- */
async function upload() {
  const file = fileInput.files[0];
  if (!file) {
    alert("写真を選択してください");
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = "アップロード中…";

  try {
    const compressedBlob = await compressImage(file);
    const fileName = Date.now() + ".jpg";

    const { error } = await supabaseClient.storage
      .from("photos")
      .upload(fileName, compressedBlob, {
        contentType: "image/jpeg"
      });

    if (error) throw error;

    alert("📸 アップロード成功！");
    fileInput.value = "";
    loadImages();

  } catch (err) {
    console.error(err);
    alert("アップロード失敗");
  }

  uploadBtn.disabled = false;
  uploadBtn.textContent = "アップロード";
}

/* ---------- Gallery ---------- */
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
      viewer.style.display = "flex";
      viewerImg.src = urlData.publicUrl;
    };

    gallery.appendChild(img);
  });
}

/* ---------- 自動更新 ---------- */
setInterval(loadImages, 5000);
loadImages();