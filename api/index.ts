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
------------------------------------------------------------ */

/**
 * Calculates consistency over the LAST 90 DAYS specifically.
 */
function calculateConsistency90Days(data: GitHubData): number {
  const days = flattenDays(data);
  if (days.length === 0) return 0;

  // Get the last 90 days from the array
  const last90 = days.slice(-90);

  const activeDays = last90.filter(d => d.contributionCount > 0).length;
  return Math.round((activeDays / last90.length) * 100);
}

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

function calculateAverageWeeklyCurrentYear(data: GitHubData): number {
  const days = flattenDays(data);
  const year = new Date().getFullYear().toString();
  const yearDays = days.filter((d) => d.date.startsWith(year));
  if (yearDays.length === 0) return 0;

  const sum = yearDays.reduce((s, d) => s + d.contributionCount, 0);
  const weeks = Math.max(1, Math.ceil(yearDays.length / 7));
  return Math.round(sum / weeks);
}

/* ------------------------------------------------------------
   4. Main Handler
------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = Array.isArray(req.query.user) ? req.query.user[0] : req.query.user;
    if (!user) return res.status(400).send("Missing user param");

    const response = await axios.post<GitHubApiResponse>(
      "https://api.github.com/graphql",
      { query, variables: { userName: user } },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    if (response.data.errors || !response.data.data.user) {
      return res.status(404).send(
        `<svg width="280" height="64" xmlns="http://www.w3.org/2000/svg"><text x="10" y="32" fill="red" font-family='Segoe UI' font-size='14'>User not found</text></svg>`
      );
    }

    const rawData = response.data.data;

    // Updated Stats
    const consistency = calculateConsistency90Days(rawData);
    const currentStreak = calculateCurrentStreak(rawData);
    const avgWeekly = calculateAverageWeeklyCurrentYear(rawData);

    // Layout Constants
    const width = 720;
    const cardGap = 18;
    const padding = 24;
    const cardWidth = Math.floor((width - padding * 2 - cardGap * 2) / 3);
    const cardHeight = 130;

    const svg = `
      <svg width="${width}" height="${cardHeight + 20}" viewBox="0 0 ${width} ${cardHeight + 20}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#22d3ee"/>
            <stop offset="100%" stop-color="#3b82f6"/>
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
            .stat-unit { font-weight: 500; font-size: 11px; fill: #525252; margin-top: 2px;}
            .icon-bg { fill: #ffffff; opacity: 0.12; }
          </style>
        </defs>

        <g transform="translate(${padding}, 5)" class="font-base">

          <g transform="translate(0,0)">
            <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="url(#cardBg)" stroke="#262626" stroke-width="1"/>
            <path d="M1 ${cardHeight} L1 12 Q1 1 12 1 L${cardWidth - 12} 1 Q${cardWidth - 1} 1 ${cardWidth - 1} 12 L${cardWidth - 1} ${cardHeight}" stroke="url(#topSheen)" stroke-width="1.5" fill="none" opacity="0.6"/>
            
            <g transform="translate(20, 24)">
              <text class="label">Consistency</text>
              <text class="stat-value" x="0" y="42" fill="url(#textGrad)">${consistency}%</text>
              <text class="stat-unit" x="0" y="62">last 90 days active</text>
            </g>
            
            <path class="icon-bg" transform="translate(${cardWidth - 55}, ${cardHeight - 55}) scale(1.5)" d="M19,4H18V2H16V4H8V2H6V4H5A2,2,0,0,0,3,6V20a2,2,0,0,0,2,2H19a2,2,0,0,0,2-2V6A2,2,0,0,0,19,4Zm0,16H5V10H19ZM19,8H5V6H19Zm-4.7,7.12,1.4,1.4L11,21.24,8.3,18.54l1.4-1.4L11,18.42Z"/>
          </g>

          <g transform="translate(${cardWidth + cardGap},0)">
            <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="url(#cardBg)" stroke="#333333" stroke-width="1"/>
            <path d="M1 ${cardHeight} L1 12 Q1 1 12 1 L${cardWidth - 12} 1 Q${cardWidth - 1} 1 ${cardWidth - 1} 12 L${cardWidth - 1} ${cardHeight}" stroke="url(#topSheen)" stroke-width="1.5" fill="none"/>

            <g transform="translate(20, 24)">
                <text class="label" style="fill: #9ca3af;">Current Streak</text>
                <text class="stat-value" x="0" y="42">${currentStreak}</text>
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
    return res.status(500).send(`<svg width=160 height=48 xmlns='http://www.w3.org/2000/svg'><text x='8' y='24' fill='red' font-family='Segoe UI'>Error</text></svg>`);
  }
}