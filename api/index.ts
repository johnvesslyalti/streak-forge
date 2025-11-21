import axios from "axios";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import "dotenv/config";

const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.warn("⚠️ Warning: GITHUB_TOKEN is not set in environment variables.");
}

/* ------------------------------------------------------------
   1. GraphQL Query & Interfaces
------------------------------------------------------------ */

const query = `
  query($userName:String!) {
    user(login: $userName) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }
`;

interface ContributionDay {
  contributionCount: number;
  date: string;
}

interface ContributionWeek {
  contributionDays: ContributionDay[];
}

interface CalendarData {
  totalContributions: number;
  weeks: ContributionWeek[];
}

interface GitHubData {
  user: {
    contributionsCollection: {
      contributionCalendar: CalendarData;
    };
  } | null;
}

interface GitHubApiResponse {
  data: GitHubData;
  errors?: { message: string }[];
}

/* ------------------------------------------------------------
   2. Helpers
------------------------------------------------------------ */

function flattenDays(data: GitHubData): ContributionDay[] {
  return (
    data.user?.contributionsCollection.contributionCalendar.weeks
      .flatMap((w) => w.contributionDays) || []
  );
}

/* ------------------------------------------------------------
   3. Stats Logic
   - Current Streak
   - Most Productive Day (FULL calendar)
   - Average Weekly Contributions (CURRENT YEAR)
------------------------------------------------------------ */

function calculateCurrentStreak(data: GitHubData): number {
  const days = flattenDays(data);
  let currentStreak = 0;
  const today = new Date().toISOString().split("T")[0];

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (!day) continue;

    // if the most recent day is today and has 0 contributions, skip it (user might not have pushed yet)
    if (day.date === today && day.contributionCount === 0) continue;

    if (day.contributionCount > 0) currentStreak++;
    else break;
  }
  return currentStreak;
}

function calculateMostProductiveDayFull(data: GitHubData): { date: string; count: number } {
  const days = flattenDays(data);
  if (days.length === 0) return { date: "N/A", count: 0 };

  let best = { date: "", count: -1 };
  for (const d of days) {
    if (d.contributionCount > best.count) {
      best.count = d.contributionCount;
      best.date = d.date;
    }
  }
  if (best.count < 0) return { date: "N/A", count: 0 };
  return best;
}

function calculateAverageWeeklyCurrentYear(data: GitHubData): number {
  const days = flattenDays(data);
  const year = new Date().getFullYear().toString();
  const yearDays = days.filter((d) => d.date.startsWith(year));
  if (yearDays.length === 0) return 0;

  const sum = yearDays.reduce((s, d) => s + d.contributionCount, 0);
  const weeks = Math.max(1, Math.ceil(yearDays.length / 7));
  const avgPerWeek = sum / weeks;
  // round to one decimal
  return Math.round(avgPerWeek * 10) / 10;
}

function calculateMaxYearStreak(data: GitHubData): number {
  const days = flattenDays(data);
  const year = new Date().getFullYear().toString();
  const list = days.filter((d) => d.date.startsWith(year));

  let max = 0;
  let temp = 0;

  for (const d of list) {
    if (d.contributionCount > 0) {
      temp++;
      max = Math.max(max, temp);
    } else {
      temp = 0;
    }
  }
  return max;
}

function esc(str: unknown): string {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------
   4. Main Handler - Layout A: three equal cards in one row
   Includes: Current Streak | Most Productive Day | Avg Weekly (current year)
   NOTE: an uploaded image path is referenced below for optional avatar.
------------------------------------------------------------ */

// Local path of uploaded image (provided): use as-is in the SVG href
const UPLOADED_IMAGE_PATH = "/mnt/data/43706ee6-a5e9-4423-b020-47299f016640.png";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = Array.isArray(req.query.user) ? req.query.user[0] : req.query.user;
    if (!user) return res.status(400).send("Missing user param");

    const prefers = req.headers["sec-ch-prefers-color-scheme"] || "light";
    const isDark = prefers === "dark";

    const response = await axios.post<GitHubApiResponse>(
      "https://api.github.com/graphql",
      { query, variables: { userName: user } },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    if (response.data.errors) {
      return res.status(404).send(
        `<svg width="280" height="64" xmlns="http://www.w3.org/2000/svg"><text x="10" y="32" fill="red" font-family='Segoe UI' font-size='14'>User not found</text></svg>`
      );
    }

    const rawData = response.data.data;
    if (!rawData.user) return res.status(404).send("User not found");

    // Calculate required stats
    const currentStreak = calculateCurrentStreak(rawData);
    const maxYearStreak = calculateMaxYearStreak(rawData);
    const mostProductive = calculateMostProductiveDayFull(rawData); // FULL calendar per your choice
    const avgWeekly = calculateAverageWeeklyCurrentYear(rawData); // current year average per week
    const total = rawData.user.contributionsCollection.contributionCalendar.totalContributions;

    // Visuals
    const width = 720;
    const height = 220;
    const cardGap = 18;
    const padding = 24;
    const cardWidth = Math.floor((width - padding * 2 - cardGap * 2) / 3);
    const cardHeight = 130;

    const bgStart = isDark ? "#0f1724" : "#f6fbff";
    const bgEnd = isDark ? "#071021" : "#eef7ff";
    const accent = isDark ? "#7dd3fc" : "#2563eb";
    const cardFill = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)";

    const svg = `
      <svg width="${width}" height="${cardHeight + 20}" viewBox="0 0 ${width} ${cardHeight + 20}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>

    <linearGradient id="fireGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#f87171"/>
    </linearGradient>

    <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0a0a" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.95"/>
    </linearGradient>

    <linearGradient id="topSheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(255,255,255,0.05)"/>
      <stop offset="50%" stop-color="rgba(255,255,255,0.2)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.05)"/>
    </linearGradient>

    <style>
      .font-base { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .label { font-weight: 700; font-size: 10px; fill: #525252; letter-spacing: 1.2px; text-transform: uppercase; }
      .stat-value { font-weight: 800; font-size: 32px; fill: #f8fafc; }
      .stat-unit { font-weight: 500; font-size: 12px; fill: #525252; margin-top: 2px;}
      .icon-bg { fill: #262626; opacity: 0.2; }
    </style>
  </defs>

  <g transform="translate(${padding}, 5)" class="font-base">

    <g transform="translate(0,0)">
      <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="url(#cardBg)" stroke="#262626" stroke-width="1"/>
      <path d="M1 ${cardHeight} L1 12 Q1 1 12 1 L${cardWidth - 12} 1 Q${cardWidth - 1} 1 ${cardWidth - 1} 12 L${cardWidth - 1} ${cardHeight}" stroke="url(#topSheen)" stroke-width="1.5" fill="none" opacity="0.6"/>
      
      <g transform="translate(20, 24)">
        <text class="label">Top Day</text>
        <text class="stat-value" x="0" y="42" fill="url(#textGrad)">${mostProductive.count}</text>
        <text class="stat-unit" x="0" y="62">${mostProductive.date}</text>
      </g>
      
      <path class="icon-bg" transform="translate(${cardWidth - 55}, ${cardHeight - 55}) scale(1.5)" d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zM16.2 13H19v6h-2.8z"/>
    </g>

    <g transform="translate(${cardWidth + cardGap},0)">
      <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="url(#cardBg)" stroke="#333333" stroke-width="1"/>
      <path d="M1 ${cardHeight} L1 12 Q1 1 12 1 L${cardWidth - 12} 1 Q${cardWidth - 1} 1 ${cardWidth - 1} 12 L${cardWidth - 1} ${cardHeight}" stroke="url(#topSheen)" stroke-width="1.5" fill="none"/>

      <g transform="translate(20, 24)">
          <text class="label" style="fill: #9ca3af;">Current Streak</text>
          
          <text class="stat-value" x="0" y="42" style="fill: #4ade80; filter: drop-shadow(0 0 8px rgba(34, 245, 11, 1));">${currentStreak}</text>
          
          <text class="stat-unit" x="0" y="62">days in a row</text>
      </g>

      <path class="icon-bg" transform="translate(${cardWidth - 50}, ${cardHeight - 55}) scale(1.2)" d="M19.48,13.03A34.24,34.24,0,0,0,16.36,6c-1.54-2.8-4.2-4.78-4.2-4.78A1,1,0,0,0,11,1.5a.76.76,0,0,0-.19.43,16.88,16.88,0,0,0,0,3.4,8,8,0,0,1-1.92,5.11,6.79,6.79,0,0,1-3.79,2.1,1,1,0,0,0-.71,1.27,10.64,10.64,0,0,0,1.15,3.14,10,10,0,1,0,19-3.48ZM12,20a7,7,0,0,1-7-7,7.77,7.77,0,0,1,.26-2A9.78,9.78,0,0,0,9,12.47a11,11,0,0,0,3.36-7.36,13.56,13.56,0,0,1,1,2.27,31.13,31.13,0,0,1,2.8,6.63A7,7,0,0,1,12,20Z"/>
    </g>

    <g transform="translate(${2 * (cardWidth + cardGap)},0)">
      <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="url(#cardBg)" stroke="#262626" stroke-width="1"/>
      <path d="M1 ${cardHeight} L1 12 Q1 1 12 1 L${cardWidth - 12} 1 Q${cardWidth - 1} 1 ${cardWidth - 1} 12 L${cardWidth - 1} ${cardHeight}" stroke="url(#topSheen)" stroke-width="1.5" fill="none" opacity="0.6"/>

      <g transform="translate(20, 24)">
        <text class="label">Weekly Avg</text>
        <text class="stat-value" x="0" y="42" fill="url(#textGrad)">${avgWeekly}</text>
        <text class="stat-unit" x="0" y="62">commits / wk</text>
      </g>

      <path class="icon-bg" transform="translate(${cardWidth - 55}, ${cardHeight - 55}) scale(1.5)" d="M16,6l-6,9l-4-5L0,16h3l2-3l4,5l7-10.5V13h3V3h-8V6z"/>
    </g>

  </g>
</svg>
    `;

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.send(svg);

  } catch (err: any) {
    console.error(err?.response?.data || err);
    return res.status(500).send(`<svg width=160 height=48 xmlns='http://www.w3.org/2000/svg'><text x='8' y='24' fill='red' font-family='Segoe UI'>Internal Server Error</text></svg>`);
  }
}

// Helper exported for the footer label calculation (kept local to the file)
function calculateHighestCommittedMonth(data: GitHubData): { label: string; count: number } {
  const days = flattenDays(data);
  const map = new Map<string, number>();

  for (const d of days) {
    const monthKey = d.date.slice(0, 7);
    map.set(monthKey, (map.get(monthKey) || 0) + d.contributionCount);
  }

  if (map.size === 0) return { label: "N/A", count: 0 };

  let bestKey = "";
  let bestVal = -1;

  for (const [k, v] of map) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }

  const [year, month] = bestKey.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  return {
    label: `${monthNames[Number(month) - 1]} ${year}`,
    count: bestVal,
  };
}
