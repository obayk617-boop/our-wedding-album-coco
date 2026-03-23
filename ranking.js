import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseClient = createClient(
  "https://vysdoicwyroygakdrwyt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5c2RvaWN3eXJveWdha2Ryd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDExMzEsImV4cCI6MjA4NzIxNzEzMX0.uBpCtpMy8pIHTi0bU3GkwcquW-15QcQOr6Pw58TNlAw"
);

/* ==========================
席番号を取得（自分が1位かどうかの判定用）
========================== */

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function getMySeat() {
  // 優先順位: URLクエリ → Cookie → localStorage → ゲスト(100)
  const params = new URLSearchParams(window.location.search);
  const seatParam = params.get("seat");
  if (seatParam) return seatParam;

  const cookieSeat = getCookie("wedding_seat_number");
  if (cookieSeat && cookieSeat !== "100") return cookieSeat;

  return localStorage.getItem("wedding_seat_number") || "100";
}

const mySeat = getMySeat();

/* ==========================
いいね数集計＋ランキング構築
========================== */

async function buildRanking() {
  // 全写真を取得
  const { data: files, error: filesError } = await supabaseClient.storage
    .from("photos")
    .list("", { sortBy: { column: "created_at", order: "desc" }, limit: 1000 });

  if (filesError || !files || files.length === 0) {
    return [];
  }

  const fileNames = files.map(f => f.name);

  // 全いいねを一括取得
  const { data: likesData, error: likesError } = await supabaseClient
    .from("likes")
    .select("file_name")
    .in("file_name", fileNames);

  // ファイルごとのいいね数を集計
  const countMap = {};
  if (!likesError && likesData) {
    for (const row of likesData) {
      countMap[row.file_name] = (countMap[row.file_name] || 0) + 1;
    }
  }

  // 写真単位でいいね数を集計・降順ソート
  // 【定義】いいねが1以上の写真のみ対象。多い順にトップ5順位まで表示。
  const sorted = files
    .map(file => {
      const seatMatch = file.name.match(/_seat(\d+)\./);
      const seat = seatMatch ? seatMatch[1] : "100";
      const count = countMap[file.name] || 0;
      const { data: urlData } = supabaseClient.storage.from("photos").getPublicUrl(file.name);
      return { seat, fileName: file.name, count, url: urlData.publicUrl };
    })
    .filter(item => item.count > 0)   // いいね0は除外
    .sort((a, b) => b.count - a.count);

  // 同率を考慮した順位付け（5順位まで）
  const ranked = [];
  let rank = 1;
  let i = 0;

  while (i < sorted.length && ranked.length < 5) {
    const currentCount = sorted[i].count;
    const group = [];

    while (i < sorted.length && sorted[i].count === currentCount) {
      group.push(sorted[i]);
      i++;
    }

    ranked.push({ rank, items: group });
    rank += 1; // 同率でも次は必ず+1（1,2,3,4,5固定）
  }

  return ranked;
}

/* ==========================
ランキング画面を描画
========================== */

// 表示中の全写真URLを保持（一括DL用）
let renderedPhotoUrls = [];

async function renderRanking() {
  const rankList = document.getElementById("rankList");
  rankList.innerHTML = "";
  renderedPhotoUrls = [];

  const ranked = await buildRanking();

  if (ranked.length === 0) {
    rankList.innerHTML = `<div class="empty-state">📷<br>まだ写真がありません</div>`;
    return;
  }

  const rankLabels = ["🥇 No.1", "🥈 No.2", "🥉 No.3", "No.4", "No.5"];
  const rankClasses = ["rank-1", "rank-2", "rank-3", "rank-4", "rank-5"];
  const rankNums = ["1", "2", "3", "4", "5"];

  ranked.forEach((group, index) => {
    const block = document.createElement("div");
    block.className = `rank-block ${rankClasses[index] || ""}`;

    const label = document.createElement("div");
    label.className = "rank-label";
    const rawLabel = rankLabels[index] || `No.${index + 1}`;
    label.innerHTML = `<span class="cinzel">${rawLabel}</span>`;
    block.appendChild(label);

    const cards = document.createElement("div");
    // 枚数に応じてsingle/multiクラスを付与
    cards.className = `rank-cards ${group.items.length === 1 ? "single" : "multi"}`;

    for (const item of group.items) {
      renderedPhotoUrls.push(item.url);

      const card = document.createElement("div");
      card.className = "rank-card";

      const badge = document.createElement("div");
      badge.className = "rank-badge";
      badge.textContent = rankNums[index] || (index + 1);

      const img = document.createElement("img");
      img.className = "rank-card-photo";
      img.src = item.url;
      img.alt = `席 ${item.seat}`;

      const info = document.createElement("div");
      info.className = "rank-card-info";

      const seatLabel = document.createElement("span");
      seatLabel.className = "rank-card-seat";
      seatLabel.textContent = item.seat === "100" ? "ゲスト" : `席番号 ${item.seat}`;

      const countLabel = document.createElement("span");
      countLabel.className = "rank-card-count";
      countLabel.textContent = `❤️ ${item.count}`;

      info.appendChild(seatLabel);
      info.appendChild(countLabel);

      // ③ 個別ダウンロードボタン
      const dlBtn = document.createElement("button");
      dlBtn.className = "rank-card-dl";
      dlBtn.textContent = "この写真を保存";
      dlBtn.onclick = () => downloadPhoto(item.url, `ranking-${index + 1}.jpg`);

      card.appendChild(badge);
      card.appendChild(img);
      card.appendChild(info);
      card.appendChild(dlBtn);
      cards.appendChild(card);
    }

    block.appendChild(cards);
    rankList.appendChild(block);
  });

  // ① 戻るボタンを表示
  document.getElementById("backBtn").style.display = "";

  // 各ブロックの高さをスペーサーで事前確保
  // → prependで追加してもレイアウトがずれない
  const allBlocks = Array.from(rankList.querySelectorAll(".rank-block"));
  const spacers = allBlocks.map(block => {
    const spacer = document.createElement("div");
    spacer.style.height = block.offsetHeight + "px";
    spacer.style.marginTop = "16px";
    spacer.style.flexShrink = "0";
    spacer.style.transition = "height 5.0s cubic-bezier(0.25, 1, 0.5, 1), margin-top 5.0s cubic-bezier(0.25, 1, 0.5, 1)";
    return spacer;
  });

  // 全ブロックをDOMから取り出してスペーサーに置き換える
  rankList.innerHTML = "";
  spacers.forEach(s => rankList.appendChild(s));

  // 5位から順にprependで追加、対応スペーサーをアニメーションしながら縮小
  const reversed = [...allBlocks].reverse();
  const reversedSpacers = [...spacers].reverse();
  reversed.forEach((block, idx) => {
    setTimeout(() => {
      const spacer = reversedSpacers[idx];
      // スペーサーをゆっくり縮小（押し下げアニメーション）
      requestAnimationFrame(() => {
        spacer.style.height = "0px";
        spacer.style.marginTop = "0px";
      });
      // ブロックを先頭に追加してフェードイン
      rankList.prepend(block);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        block.classList.add("visible");
      }));
      // スペーサー縮小完了後に削除
      setTimeout(() => spacer.remove(), 5100);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, idx * 1500);
  });

  // 自分が1位グループにいるか確認
  const firstGroup = ranked[0];
  if (firstGroup) {
    const isWinner = firstGroup.items.some(item => item.seat === mySeat);
    if (isWinner) {
      const totalDelay = (reversed.length - 1) * 1500 + 2000;
      setTimeout(() => showWinnerBanner(), totalDelay);
    }
  }
}

/* ==========================
③ ダウンロード処理
========================== */

// トースト（ranking画面用）
function showRankingToast(message, duration = 3000) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 50px; left: 50%;
    transform: translateX(-50%);
    background: rgba(30,30,30,0.92); color: white;
    padding: 12px 20px; border-radius: 25px;
    font-size: 13px; line-height: 1.6; text-align: center;
    z-index: 9999; white-space: pre-line;
    animation: rankToastIn 0.3s ease;
  `;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes rankToastIn  { from { opacity:0; transform:translateX(-50%) translateY(16px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
    @keyframes rankToastOut { from { opacity:1; transform:translateX(-50%) translateY(0); } to { opacity:0; transform:translateX(-50%) translateY(16px); } }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "rankToastOut 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Share APIが使えるか判定
function canShareFiles(file) {
  return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
}

// downloadPhoto：保存結果を返す（"saved" | "cancelled" | "fallback"）
async function downloadPhoto(url, fileName) {
  const res = await fetch(url);
  const blob = await res.blob();
  const file = new File([blob], fileName, { type: "image/jpeg" });

  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: "Wedding Photo" });
      return "saved";
    } catch (err) {
      if (err.name === "AbortError") return "cancelled";
      console.error("Share失敗:", err);
      return "cancelled";
    }
  } else {
    // Share API非対応 → ダウンロードフォルダ
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    return "fallback";
  }
}


/* ==========================
紙吹雪
========================== */

function launchConfetti() {
  const colors = ["#f5c842", "#29b6d8", "#ff4081", "#ffffff", "#a5f3fc"];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.top = "-20px";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width  = (Math.random() * 8 + 6) + "px";
    piece.style.height = (Math.random() * 8 + 6) + "px";
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    piece.style.animationDuration = (Math.random() * 2 + 2) + "s";
    piece.style.animationDelay    = (Math.random() * 1.5) + "s";
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 5000);
  }
}

function showWinnerBanner() {
  launchConfetti();
  document.getElementById("winnerBanner").classList.add("show");
}

/* ==========================
カウントダウン → ランキング表示
========================== */

function startCountdown() {
  const waiting   = document.getElementById("waitingScreen");
  const countdown = document.getElementById("countdownScreen");
  const ranking   = document.getElementById("rankingScreen");
  const numEl     = document.getElementById("countdownNumber");

  waiting.style.display = "none";
  countdown.style.display = "flex";

  let count = 5;
  numEl.textContent = count;

  const tick = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(tick);
      countdown.style.display = "none";
      ranking.style.display   = "flex";
      renderRanking();
    } else {
      // アニメーションをリセットして再適用
      numEl.style.animation = "none";
      void numEl.offsetWidth;
      numEl.style.animation = "";
      numEl.textContent = count;
    }
  }, 1000);
}

/* ==========================
発表フラグを監視
========================== */

async function checkAndStart() {
  const { data } = await supabaseClient
    .from("settings")
    .select("value")
    .eq("key", "reveal_ranking")
    .single();

  if (data?.value === "true") {
    startCountdown();
    return true;
  }
  return false;
}

// 起動時にすでに発表済みか確認
const alreadyRevealed = await checkAndStart();

// 未発表ならリアルタイム監視
if (!alreadyRevealed) {
  const channel = supabaseClient
    .channel("settings-watch")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "settings", filter: "key=eq.reveal_ranking" },
      (payload) => {
        if (payload.new?.value === "true") {
          channel.unsubscribe();
          startCountdown();
        }
      }
    )
    .subscribe();
}

// 自動更新なし（発表後はそのまま固定表示）