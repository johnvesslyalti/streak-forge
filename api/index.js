const axios = require('axios');
require('dotenv').config();

const TOKEN = process.env.GITHUB_TOKEN;

// -----------------------------------------------
// 1. GitHub GraphQL Query
// -----------------------------------------------
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


// -----------------------------------------------
// 2. Current Streak Calculator
// -----------------------------------------------
function calculateStreak(data) {
  const weeks = data.user.contributionsCollection.contributionCalendar.weeks;
  const days = weeks.flatMap(week => week.contributionDays);

  let currentStreak = 0;
  const today = new Date().toISOString().split('T')[0];

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];

    if (day.date === today && day.contributionCount === 0) {
      continue;
    }

    if (day.contributionCount > 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  return currentStreak;
}


// -----------------------------------------------
// 3. Max Streak for Current Year
// -----------------------------------------------
function calculateMaxYearStreak(data) {
  const weeks = data.user.contributionsCollection.contributionCalendar.weeks;
  const days = weeks.flatMap(w => w.contributionDays);

  const year = new Date().getFullYear();
  const yearDays = days.filter(d => d.date.startsWith(year));

  let maxStreak = 0;
  let temp = 0;

  for (const d of yearDays) {
    if (d.contributionCount > 0) {
      temp++;
      maxStreak = Math.max(maxStreak, temp);
    } else {
      temp = 0;
    }
  }

  return maxStreak;
}



// -----------------------------------------------
// 4. Main API Handler
// -----------------------------------------------
module.exports = async (req, res) => {
  try {
    const { user } = req.query;
    if (!user) return res.status(400).send('Missing "user" query parameter');

    // Read GitHub dark/light header
    const scheme = req.headers["sec-ch-prefers-color-scheme"] || "light";
    const isDark = scheme === "dark";

    // Fetch from GitHub GraphQL
    const response = await axios.post(
      "https://api.github.com/graphql",
      { query, variables: { userName: user } },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    if (response.data.errors) {
      return res.send(`<svg width="200" height="50"><text x="10" y="30" fill="red">User not found</text></svg>`);
    }

    const data = response.data.data;

    const currentStreak = calculateStreak(data);
    const maxStreakYear = calculateMaxYearStreak(data);
    const total = data.user.contributionsCollection.contributionCalendar.totalContributions;


    // -----------------------------------------------
    // 5. Final SVG
    // -----------------------------------------------
    const svg = `
<svg width="480" height="170" xmlns="http://www.w3.org/2000/svg">

  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${isDark ? "#1e1e1e" : "#e3f2fd"}"/>
      <stop offset="100%" stop-color="${isDark ? "#0d0d0d" : "#bbdefb"}"/>
    </linearGradient>

    <!-- Fire Glow -->
    <radialGradient id="glow">
      <stop offset="0%" stop-color="orange" stop-opacity="0.9" />
      <stop offset="100%" stop-color="red" stop-opacity="0" />
    </radialGradient>

    <style>
      .card {
        fill: url(#bg);
        stroke: ${isDark ? "#333" : "#90caf9"};
        stroke-width: 1.5;
        rx: 14;
        filter: drop-shadow(0px 4px 10px rgba(0,0,0,0.20));
      }

      .title {
        font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif;
        fill: ${isDark ? "#90caf9" : "#0d47a1"};
      }

      .stat {
        font: 700 32px 'Segoe UI', Ubuntu, Sans-Serif;
        fill: ${isDark ? "#e3f2fd" : "#0d47a1"};
        opacity: 0;
        animation: fadeIn 0.9s ease forwards;
      }

      .label {
        font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif;
        fill: ${isDark ? "#cfd8dc" : "#333"};
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes glowPulse {
        0% { opacity: 0.3; }
        50% { opacity: 0.8; }
        100% { opacity: 0.3; }
      }
    </style>
  </defs>

  <!-- Card Background -->
  <rect x="1" y="1" width="478" height="168" class="card"/>

  <!-- Fire Glow -->
  <circle cx="45" cy="75" r="28" fill="url(#glow)" style="animation: glowPulse 2s infinite" />

  <!-- Fire Icon -->
  <text x="28" y="85" font-size="45">🔥</text>

  <!-- Current Streak -->
  <text x="90" y="40" class="title">Current Streak</text>
  <text x="90" y="85" class="stat">${currentStreak} Days</text>

  <!-- Divider -->
  <line x1="250" y1="25" x2="250" y2="145" stroke="${isDark ? "#333" : "#90caf9"}" stroke-width="1" />

  <!-- Max Streak -->
  <text x="280" y="40" class="title">Max Streak (Year)</text>
  <text x="280" y="85" class="stat">${maxStreakYear} Days</text>

  <!-- Total Contributions -->
  <text x="280" y="125" class="label">Total Contributions: ${total}</text>

</svg>
`;

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    res.send(svg);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
};
