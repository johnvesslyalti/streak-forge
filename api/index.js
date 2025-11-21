const axios = require('axios');
require('dotenv').config();

const TOKEN = process.env.GITHUB_TOKEN;

// 1. The GraphQL Query to fetch contribution history
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

// 2. Function to calculate the streak
function calculateStreak(data) {
    const weeks = data.user.contributionsCollection.contributionCalendar.weeks;
    let currentStreak = 0;
    let maxStreak = 0;
    let today = new Date().toISOString().split('T')[0];

    // Flatten the weeks into a single array of days
    const days = weeks.flatMap(week => week.contributionDays);

    // Iterate backwards (from today to past)
    // Note: This is a simplified logic. Production apps handle timezones strictly.
    let streakActive = true;

    for (let i = days.length - 1; i >= 0; i--) {
        const day = days[i];

        if (day.date === today && day.contributionCount === 0) {
            // If it's today and we haven't coded yet, the streak isn't broken technically
            continue;
        }

        if (day.contributionCount > 0) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else {
            // Streak broken
            break;
        }
    }

    return { currentStreak, total: data.user.contributionsCollection.contributionCalendar.totalContributions };
}

// 3. The Main API Handler (Vercel Serverless Format)
module.exports = async (req, res) => {
    try {
        const { user } = req.query;

        if (!user) return res.status(400).send('Missing "user" query parameter');

        // Fetch Data from GitHub
        const response = await axios.post(
            'https://api.github.com/graphql',
            { query, variables: { userName: user } },
            { headers: { Authorization: `Bearer ${TOKEN}` } }
        );

        if (response.data.errors) {
            return res.send(`<svg width="200" height="50"><text x="10" y="30" fill="red">User not found</text></svg>`);
        }

        // Calculate Stats
        const stats = calculateStreak(response.data.data);

        // 4. Create the SVG
        // We use basic SVG shapes and text interpolation
        const svg = `
      <svg width="400" height="120" xmlns="http://www.w3.org/2000/svg">
        <style>
          .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #2f80ed; }
          .stat { font: 800 30px 'Segoe UI', Ubuntu, Sans-Serif; fill: #333; }
          .label { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: #666; }
          .bg { fill: #fff; stroke: #e4e2e2; stroke-width: 1px; rx: 5px; }
        </style>
        <rect x="1" y="1" width="398" height="118" class="bg"/>
        
        <text x="25" y="45" font-size="30">🔥</text>
        
        <text x="70" y="40" class="header">Current Streak</text>
        <text x="70" y="80" class="stat">${stats.currentStreak} Days</text>
        
        <line x1="220" y1="25" x2="220" y2="95" stroke="#e4e2e2" />

        <text x="250" y="40" class="header">Total Contribs</text>
        <text x="250" y="80" class="stat">${stats.total}</text>
      </svg>
    `;

        // Set header so GitHub treats this as an image
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache for 1 hour
        res.send(svg);

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
};