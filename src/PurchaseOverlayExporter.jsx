import { useEffect, useMemo, useState } from "react";
import { getTableSpace } from "./StreamTableOverlay.jsx";

const FRAME_WIDTH = 1544;
const FRAME_HEIGHT = 868;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

// Load a purchase-record image with CORS enabled so it can be saved in a PNG.
function loadCardImage(url, number) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`#${number} 卡圖讀取失敗，請重新下載或檢查該卡圖。`));
    const imageUrl = new URL(url, window.location.href);
    // Old cached responses can lack the bucket's newly added CORS header.
    if (imageUrl.hostname === "firebasestorage.googleapis.com") {
      imageUrl.searchParams.set("obsExport", String(Date.now()));
    }
    image.src = imageUrl.href;
  });
}

// Remove transparent padding around uploaded card art before sizing it for OBS.
function getVisibleBounds(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("瀏覽器無法讀取卡圖。");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left
    ? { x: 0, y: 0, width: canvas.width, height: canvas.height }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

// Fill most of the table cell without overlapping the next number or row.
function drawCard(context, { image, bounds, number }) {
  const space = getTableSpace(number);
  const artWidth = space.artWidth * 1.2;
  const artHeight = space.artHeight + 26;
  const artX = space.artX - (artWidth - space.artWidth) / 2;
  const artY = space.artY - 22;
  const scale = Math.min(artWidth / bounds.width, artHeight / bounds.height);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  context.drawImage(
    image,
    bounds.x, bounds.y, bounds.width, bounds.height,
    (artX + (artWidth - width) / 2) * EXPORT_WIDTH / FRAME_WIDTH,
    (artY + (artHeight - height) / 2) * EXPORT_HEIGHT / FRAME_HEIGHT,
    width * EXPORT_WIDTH / FRAME_WIDTH,
    height * EXPORT_HEIGHT / FRAME_HEIGHT,
  );
}

// Group the filtered purchase records by room and round; one PNG covers one table.
function getSessions(records, libraryCards) {
  const sessions = new Map();
  const cardsById = new Map(libraryCards.map((card) => [card.id, card]));
  records.forEach((record) => {
    const number = Number(record.number);
    if (!record.targetCardImageUrl || !Number.isInteger(number) || number < 1 || number > 20) return;
    const room = record.drawId || record.roomSlug || record.drawTitle || "room";
    const round = record.round || "round-001";
    const key = `${room}::${round}`;
    if (!sessions.has(key)) {
      sessions.set(key, {
        key,
        label: `${record.drawTitle || record.roomSlug || room} · ${round}`,
        room,
        round,
        cards: new Map(),
      });
    }
    const savedUrl = record.targetCardImageUrl;
    const libraryCard = cardsById.get(record.targetCardId);
    // Use the full image only when its thumbnail still matches the purchased art.
    const fullUrl = libraryCard?.thumbUrl === savedUrl ? libraryCard.imageUrl : "";
    sessions.get(key).cards.set(number, { url: fullUrl || savedUrl, fallbackUrl: savedUrl });
  });
  return Array.from(sessions.values());
}

// Load and measure each card once, then reuse the result for preview and download.
async function loadSessionCards(session) {
  return Promise.all(Array.from(session.cards, async ([number, { url, fallbackUrl }]) => {
    let image;
    try {
      image = await loadCardImage(url, number);
    } catch (error) {
      if (url === fallbackUrl) throw error;
      image = await loadCardImage(fallbackUrl, number);
    }
    return { number, image, bounds: getVisibleBounds(image) };
  }));
}

// Paint a transparent, full-HD OBS frame from the prepared card images.
function renderOverlay(cards, opacity) {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("瀏覽器無法建立圖片畫布。");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.globalAlpha = opacity;
  cards.forEach((card) => drawCard(context, card));
  return canvas;
}

// Save the prepared full-HD frame as a PNG for OBS.
async function downloadOverlay(session, cards, opacity) {
  const canvas = renderOverlay(cards, opacity);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("無法建立 PNG 圖片。")), "image/png");
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `live-cards-${session.room}-${session.round}.png`.replace(/[^a-zA-Z0-9._-]/g, "-");
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

// Let admins preview card placement and opacity before downloading the OBS image.
export default function PurchaseOverlayExporter({ records, cards = [] }) {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [opacity, setOpacity] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [loaded, setLoaded] = useState(null);
  const [preview, setPreview] = useState(null);
  const sessions = useMemo(() => getSessions(records, cards), [records, cards]);
  const session = sessions.find((item) => item.key === selectedKey) || sessions[0];
  const readyCards = session && loaded?.key === session.key ? loaded.cards : null;
  const previewUrl = session && preview?.key === session.key ? preview.url : "";

  useEffect(() => {
    if (!open || !session) return undefined;
    let cancelled = false;
    loadSessionCards(session).then((images) => {
      if (cancelled) return;
      setLoaded({ key: session.key, cards: images });
      setPreview({ key: session.key, url: renderOverlay(images, 1).toDataURL("image/png") });
      setError("");
    }).catch((loadError) => {
      if (!cancelled) setError(loadError.message || "未能載入卡圖，請重試。");
    });
    return () => { cancelled = true; };
  }, [open, session]);

  async function handleDownload() {
    if (!session || !readyCards || busy) return;
    setBusy(true);
    setError("");
    setDownloaded(false);
    try {
      await downloadOverlay(session, readyCards, opacity / 100);
      setDownloaded(true);
    } catch (downloadError) {
      setError(downloadError.message || "下載失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="purchase-overlay-exporter">
      <button className="purchase-overlay-toggle" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {open ? "收起直播卡圖" : "下載 OBS 直播卡圖"}
      </button>
      {open && (
        <div className="purchase-overlay-panel">
          <div className="purchase-overlay-controls">
            <label>
              場次
              {sessions.length === 1 ? (
                <span className="purchase-overlay-session">{session.label}（{session.cards.size} 張）</span>
              ) : (
                <select value={session?.key || ""} onChange={(event) => { setSelectedKey(event.target.value); setError(""); setDownloaded(false); }} disabled={!sessions.length}>
                  {sessions.length ? sessions.map((item) => <option key={item.key} value={item.key}>{item.label}（{item.cards.size} 張）</option>) : <option value="">沒有可匯出的購買卡圖</option>}
                </select>
              )}
            </label>
            <label>
              透明度 {opacity}%
              <input type="range" min="0" max="100" value={opacity} onChange={(event) => { setOpacity(Number(event.target.value)); setDownloaded(false); }} />
            </label>
            <button type="button" onClick={handleDownload} disabled={!readyCards || busy}>
              {busy ? "製作 PNG 中…" : readyCards ? "下載透明 PNG" : "載入清晰卡圖中…"}
            </button>
          </div>
          <div className="purchase-overlay-preview" role="img" aria-label="直播桌面卡圖位置預覽">
            {previewUrl && <img src={previewUrl} alt="" style={{ opacity: opacity / 100 }} />}
          </div>
          <p className="muted">1920 × 1080 透明底圖。下載後在 OBS 加入「圖片」來源，放在直播影片上方，保持 16:9 且不要裁切。</p>
          {downloaded && <p className="purchase-overlay-success" role="status">透明 PNG 已建立並開始下載。</p>}
          {error && <p className="purchase-overlay-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
