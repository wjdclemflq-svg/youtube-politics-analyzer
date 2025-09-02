const fs = require('fs');
const path = require('path');

class DashboardGenerator {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
  }

  generate() {
    console.log('📊 대시보드 데이터 생성 중...');
    
    const latestPath = path.join(this.dataDir, 'integrated-latest.json');
    if (!fs.existsSync(latestPath)) {
      console.error('통합 데이터 없음');
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    
    // 대시보드용 최소화 데이터
    const dashboard = {
      lastUpdated: data.lastUpdated,
      summary: {
        channels: data.statistics.totalChannels,
        videos: data.statistics.totalVideos,
        views: data.statistics.totalViews,
        quotaUsed: data.statistics.dailyQuotaUsed,
        cacheEfficiency: data.statistics.cacheEfficiency
      },
      topChannels: data.channels
        .sort((a, b) => (b.viewCountDiff || 0) - (a.viewCountDiff || 0))
        .slice(0, 50)
        .map(ch => ({
          id: ch.id,
          title: ch.title,
          thumbnail: ch.thumbnail,
          views: ch.viewCount,
          growth: ch.viewCountDiff,
          rate: ch.growthRate
        })),
      trending: data.spikes.slice(0, 30),
      performance: data.aboveAverage.slice(0, 20),
      hourly: data.hourlyStats || []
    };
    
    fs.writeFileSync(
      path.join(this.dataDir, 'dashboard.json'),
      JSON.stringify(dashboard, null, 2)
    );
    
    console.log('✅ 대시보드 데이터 생성 완료');
  }
}

if (require.main === module) {
  new DashboardGenerator().generate();
}
