import { writeFile } from "node:fs/promises";

// Rebuilds public/sf-pickup-points.json from SF Express Hong Kong's official
// station and self-service locker lists. Re-run when SF updates its network:
//   node scripts/update-sf-pickup-points.mjs
const STATIONS_URL = "https://hk.sf-express.com/hk/tc/more/sf-store-address";
const LOCKERS_URL = "https://hk.sf-express.com/hk/tc/more/sf-locker";
const AREAS = ["香港島", "九龍", "新界"];

const decode = (text) => text
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/\s+/g, " ")
  .trim();

async function fetchTables(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const html = await response.text();
  const tables = [];
  let cursor = 0;
  for (const match of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    // The region heading (香港島 / 九龍 / 新界) is the last text before each table.
    const before = decode(html.slice(cursor, match.index));
    const area = AREAS.find((name) => before.endsWith(name)) || "";
    cursor = match.index + match[0].length;
    const rows = [...match[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((row) => (
      [...row[0].matchAll(/<td[\s\S]*?<\/td>/g)].map((cell) => decode(cell[0]))
    )).filter((cells) => cells.length);
    tables.push({ area, rows });
  }
  return tables;
}

// Tables use a rowspan for the district, so rows without a code cell inherit it.
function withDistrict(rows, isCode) {
  let district = "";
  return rows.map((cells) => {
    if (!isCode(cells[0])) {
      district = cells[0];
      return [district, ...cells.slice(1)];
    }
    return [district, ...cells];
  }).filter((cells) => isCode(cells[1]));
}

const cleanAddress = (address) => address
  .replace(/\^[^^]*\^/g, "")
  .replace(/[+^]+$/g, "")
  .replace(/\s+/g, " ")
  .trim();

const stationTables = await fetchTables(STATIONS_URL);
const stations = stationTables.flatMap(({ area, rows }) => (
  withDistrict(rows, (value) => /^852[A-Z0-9]+$/.test(value || ""))
    .filter((cells) => !/不設取件|只提供寄件/.test(cells[3]))
    .map(([district, code, name, address, weekday, saturday, sunday]) => ({
      type: "station",
      area,
      district,
      code,
      name,
      address: cleanAddress(address.replace(/[（(](不設取件服務|只提供寄件服務)[）)]/g, "")),
      hours: `一至五 ${weekday}；六 ${saturday}；日/假期 ${sunday}`,
    }))
));

const lockerTables = await fetchTables(LOCKERS_URL);
const lockers = lockerTables
  // Only the Hong Kong regional tables; cold-storage and Macau tables have no HK area heading.
  .filter(({ area }) => AREAS.includes(area))
  .flatMap(({ area, rows }) => (
    withDistrict(rows, (value) => /^H852[A-Z0-9]+$/.test(value || ""))
      // Residents-only lockers cannot be used by the public.
      .filter((cells) => !/只供住戶使用/.test(cells[2]))
      .map(([district, code, address, weekdayHours, holidayHours]) => ({
        type: "locker",
        area,
        district,
        code,
        name: `${district}順豐自助櫃`,
        address: cleanAddress(address),
        hours: `一至六 ${weekdayHours}；日/假期 ${holidayHours}`,
      }))
  ));

const points = [...stations, ...lockers];
if (stations.length < 50 || lockers.length < 100) {
  throw new Error(`Unexpectedly few points (stations ${stations.length}, lockers ${lockers.length}); SF page layout may have changed.`);
}

await writeFile("public/sf-pickup-points.json", `${JSON.stringify({
  source: [STATIONS_URL, LOCKERS_URL],
  updatedAt: new Date().toISOString().slice(0, 10),
  areas: AREAS,
  points: points.map(({ type, area, district, code, name, address, hours }) => [type, area, district, code, name, address, hours]),
})}\n`);
console.log(`Saved ${stations.length} stations and ${lockers.length} public lockers.`);
