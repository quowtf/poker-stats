import { NextResponse } from "next/server";
import {
  getLeaderboard,
  getLastSession,
  getTotalSessions,
  getAdvancedStats,
  getRivalries,
  getFunLabels,
  getHandStats,
  getHandFunLabels,
} from "@/lib/stats";

export async function GET() {
  try {
    const [leaderboard, lastSession, totalSessions, advancedStats, rivalries, funLabels, handStats, handFunLabels] =
      await Promise.all([
        getLeaderboard(),
        getLastSession(),
        getTotalSessions(),
        getAdvancedStats(),
        getRivalries(),
        getFunLabels(),
        getHandStats(),
        getHandFunLabels(),
      ]);

    return NextResponse.json({
      leaderboard,
      lastSession,
      totalSessions,
      advancedStats,
      rivalries,
      funLabels,
      handStats,
      handFunLabels,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
