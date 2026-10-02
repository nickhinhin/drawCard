// Coordinates are measured against the 16:9 stream frame in the supplied
// reference screenshot. Each row widens slightly towards the camera.
const TABLE_ROWS = [
  { top: 155, bottom: 280, leftTop: 657, rightTop: 1190, leftBottom: 655, rightBottom: 1195 },
  { top: 284, bottom: 424, leftTop: 654, rightTop: 1203, leftBottom: 652, rightBottom: 1211 },
  { top: 432, bottom: 585, leftTop: 650, rightTop: 1230, leftBottom: 648, rightBottom: 1241 },
  { top: 597, bottom: 766, leftTop: 647, rightTop: 1261, leftBottom: 645, rightBottom: 1268 },
];

// Map a number to the physical card space, leaving a small gap between spaces.
export function getTableSpace(number) {
  const row = TABLE_ROWS[Math.floor((number - 1) / 5)];
  const column = (number - 1) % 5;
  const gap = 9;
  const topWidth = (row.rightTop - row.leftTop - gap * 4) / 5;
  const bottomWidth = (row.rightBottom - row.leftBottom - gap * 4) / 5;
  const topLeft = row.leftTop + column * (topWidth + gap);
  const bottomLeft = row.leftBottom + column * (bottomWidth + gap);
  const topY = row.top - column * 2;
  const bottomY = row.bottom - column * 2;

  return {
    artX: (topLeft + bottomLeft) / 2 + (topWidth + bottomWidth) * 0.055,
    artY: topY + 26,
    artWidth: (topWidth + bottomWidth) * 0.39,
    artHeight: bottomY - topY - 34,
  };
}

// Slot purchase fields are written from the same purchase record shown in 購買紀錄.
// Use its saved target image, so later card-library edits cannot change the display.
export default function StreamTableOverlay({ slots = [], opacity = 0.82 }) {
  const slotsByNumber = new Map(slots.map((slot) => [Number(slot.number), slot]));

  return (
    <svg className="stream-table-overlay" viewBox="0 0 1544 868" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 20 }, (_unused, index) => {
        const number = index + 1;
        const space = getTableSpace(number);
        const slot = slotsByNumber.get(number);
        const cardImage = slot?.purchaseRecordId && slot.status !== "available"
          ? slot.targetCardImageUrl : "";

        return cardImage ? (
          <image
            key={number}
            href={cardImage}
            x={space.artX}
            y={space.artY}
            width={space.artWidth}
            height={space.artHeight}
            opacity={opacity}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null;
      })}
    </svg>
  );
}
