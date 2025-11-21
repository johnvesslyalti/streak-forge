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

// [FIX] We define the shape of the HTTP Body returned by GitHub
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
------------------------------------------------------------ */

function calculateCurrentStreak(data: GitHubData): number {
  const days = flattenDays(data);
  let currentStreak = 0;
  const today = new Date().toISOString().split("T")[0];

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (!day) continue;

    if (day.date === today && day.contributionCount === 0) continue;

    if (day.contributionCount > 0) currentStreak++;
    else break;
  }
  return currentStreak;
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

interface HighestMonth {
  label: string;
  count: number;
}

function calculateHighestCommittedMonth(data: GitHubData): HighestMonth {
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

function esc(str: unknown): string {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------
   4. Main Handler
------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = Array.isArray(req.query.user) ? req.query.user[0] : req.query.user;
    if (!user) return res.status(400).send("Missing user param");

    const prefers = req.headers["sec-ch-prefers-color-scheme"] || "light";
    const isDark = prefers === "dark";

    // [FIX] We added <GitHubApiResponse> here so TS knows what 'response.data' is
    const response = await axios.post<GitHubApiResponse>(
      "https://api.github.com/graphql",
      { query, variables: { userName: user } },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    // Now TS knows 'errors' exists on response.data
    if (response.data.errors) {
      return res.status(404).send(
        `<svg width="200" height="60"><text x="10" y="30" fill="red">User not found</text></svg>`
      );
    }

    // Now TS knows 'data' exists on response.data
    const rawData = response.data.data;

    if (!rawData.user) {
      return res.status(404).send("User not found");
    }

    // Calculate
    const currentStreak = calculateCurrentStreak(rawData);
    const maxYearStreak = calculateMaxYearStreak(rawData);
    const highestMonth = calculateHighestCommittedMonth(rawData);
    const total = rawData.user.contributionsCollection.contributionCalendar.totalContributions;

    // Styles
    const bgStart = isDark ? "#0f1724" : "#f6fbff";
    const bgEnd = isDark ? "#071021" : "#eef7ff";
    const accent = isDark ? "#7dd3fc" : "#2563eb";
    const cardFill = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.7)";

    const width = 520;
    const height = 200;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow"><feDropShadow dx="0" dy="6" stdDeviation="12" flood-opacity="${isDark ? 0.6 : 0.1}" /></filter>
          <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${bgStart}"/>
            <stop offset="100%" stop-color="${bgEnd}"/>
          </linearGradient>
          <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${accent}" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.9"/>
          </linearGradient>
          <style>
            .name { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#e6f7ff" : "#0b1220"}; }
            .muted { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#b3cde6" : "#4b5563"}; }
            .stat-big { font: 700 28px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#fff" : "#0b1220"}; }
            .stat-small { font: 700 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#e6f7ff" : "#0b1220"}; }
            .label { font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#d7f3ff" : "#0b1220"}; }
            .badge { font: 600 11px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${isDark ? "#062c36" : "#07316a"}; }
          </style>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgGrad)" />
        <g transform="translate(20,18)" filter="url(#shadow)">
          <rect width="${width - 40}" height="${height - 36}" rx="16" fill="${cardFill}" stroke="${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}" />
        </g>
        <g transform="translate(40,40)">
          <text class="name">GitHub Contributions — ${esc(user)}</text>
          <g transform="translate(0,20)">
            <rect width="220" height="110" rx="12" fill="${isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.85)"}" />
            <text class="label" x="20" y="40">Current Streak</text>
            <text class="stat-big" x="20" y="80">${currentStreak} <tspan class="muted" font-size="12">days</tspan></text>
          </g>
          <g transform="translate(260,30)">
            <text class="muted">Max Streak This Year</text>
            <text class="stat-small" y="24">${maxYearStreak} days</text>
            <g transform="translate(0,60)">
              <text class="muted">Highest Month</text>
              <rect x="0" y="10" width="200" height="36" rx="18" fill="url(#accentGrad)" />
              <text class="badge" x="14" y="34">${highestMonth.label}</text>
              <text class="muted" x="140" y="34">${highestMonth.count}</text>
            </g>
            <g transform="translate(0,120)">
              <text class="muted">Total Contributions</text>
              <text class="stat-small" y="26">${total}</text>
            </g>
          </g>
        </g>
      </svg>
    `;

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.send(svg);

  } catch (err: any) {
    console.error(err);
    return res.status(500).send(`<svg><text>Error</text></svg>`);
  }
}