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
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${bgStart}"/>
            <stop offset="100%" stop-color="${bgEnd}"/>
          </linearGradient>
          <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${accent}" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.9"/>
          </linearGradient>
          <style>
            .title { font: 600 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#e6f7ff" : "#0b1220"}; }
            .muted { font: 400 11px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#b3cde6" : "#6b7280"}; }
            .stat-big { font: 700 26px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#fff" : "#0b1220"}; }
            .stat-small { font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#e6f7ff" : "#0b1220"}; }
            .label { font: 600 11px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#d7f3ff" : "#0b1220"}; }
          </style>
        </defs>

        <rect width="100%" height="100%" fill="url(#bgGrad)" />

        <!-- Card container -->
        <g transform="translate(${padding}, ${padding})">

          <!-- Optional avatar on the left of the header -->
          <g transform="translate(0,0)">
            <image href="${esc(UPLOADED_IMAGE_PATH)}" x="0" y="0" width="40" height="40" clip-path="circle(20px at 20px 20px)" />
            <text class="title" x="52" y="18">GitHub Contributions — ${esc(user)}</text>
            <text class="muted" x="52" y="36">Updated live from GitHub</text>
          </g>

          <!-- Three equal cards in a row -->
          <g transform="translate(0,56)">

            <!-- Card 1: Current Streak -->
            <g transform="translate(0,0)">
              <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="${cardFill}" stroke="rgba(0,0,0,0.04)" />
              <text class="label" x="16" y="28">Current Streak</text>
              <text class="stat-big" x="16" y="74">${currentStreak} <tspan class="muted" font-size="12">days</tspan></text>
            </g>

            <!-- Card 2: Most Productive Day -->
            <g transform="translate(${cardWidth + cardGap},0)">
              <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="${cardFill}" stroke="rgba(0,0,0,0.04)" />
              <text class="label" x="16" y="28">Most Productive Day</text>
              <text class="stat-big" x="16" y="60">${mostProductive.count}</text>
              <text class="muted" x="16" y="82">on ${mostProductive.date}</text>
            </g>

            <!-- Card 3: Average Weekly Contributions (current year) -->
            <g transform="translate(${2 * (cardWidth + cardGap)},0)">
              <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="${cardFill}" stroke="rgba(0,0,0,0.04)" />
              <text class="label" x="16" y="28">Avg Weekly (this year)</text>
              <text class="stat-big" x="16" y="74">${avgWeekly} <tspan class="muted" font-size="12">contribs / wk</tspan></text>
            </g>

          </g>

          <!-- Footer small stats on the right bottom -->
          <g transform="translate(0, ${56 + cardHeight + 12})">
            <text class="muted">Max Streak This Year: ${maxYearStreak} days</text>
            <text class="muted" x="260">Total Contributions: ${total}</text>
            <text class="muted" x="460">Highest Month: ${esc(calculateHighestCommittedMonth(rawData).label)} (${calculateHighestCommittedMonth(rawData).count})</text>
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
