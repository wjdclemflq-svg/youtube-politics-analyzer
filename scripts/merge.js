const fs = require('fs');
const path = require('path');

class DataMerger {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.today = new Date().toISOString().split('T')[0];
  }

  async merge() {
    console.log('🔄 데이터 병합 시작...');
    
    const latestPath = path.join(this.dataDir, 'latest.json');
    if (!fs.existsSync(latestPath)) {
      console.log('최신 데이터 없음');
      return;
    }
    
    const latestData = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    
    let integratedData = {
      lastUpdated: new Date().toISOString(),
      date: this.today,
      channels: latestData.channels || [],
      videos: latestData.videos || [],
      spikes: [],
      aboveAverage: [],
      categorySummary: [],
      statistics: {
        totalChannels: 0,
        totalVideos: 0,
        totalViews: 0
      }
    };
    
    // 급상승 분석
    const recentVideos = integratedData.videos.filter(v => {
      const age = (Date.now() - new Date(v.published)) / (1000 * 60 * 60);
      return age < 48;
    });
    
    integratedData.spikes = recentVideos
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 30);
    
    // 통계 업데이트
    integratedData.statistics.totalChannels = integratedData.channels.length;
    integratedData.statistics.totalVideos = integratedData.videos.length;
    integratedData.statistics.totalViews = integratedData.channels.reduce(
      (sum, ch) => sum + (ch.viewCount || 0), 0
    );
    
    // 카테고리 요약
    integratedData.categorySummary = [{
      date: this.today,
      category: '정치',
      totalViews: integratedData.statistics.totalViews,
      totalChannels: integratedData.statistics.totalChannels,
      totalVideos: integratedData.statistics.totalVideos
    }];
    
    // 저장
    const integratedPath = path.join(this.dataDir, 'integrated-latest.json');
    fs.writeFileSync(integratedPath, JSON.stringify(integratedData, null, 2));
    
    // 대시보드용 경량 버전
    const dashboardData = {
      lastUpdated: integratedData.lastUpdated,
      channels: integratedData.channels.slice(0, 100),
      videos: integratedData.videos.slice(0, 500),
      spikes: integratedData.spikes,
      categorySummary: integratedData.categorySummary,
      statistics: integratedData.statistics
    };
    
    fs.writeFileSync(
      path.join(this.dataDir, 'dashboard-data.json'),
      JSON.stringify(dashboardData, null, 2)
    );
    
    console.log('✅ 병합 완료!');
    console.log(`  - 채널: ${integratedData.statistics.totalChannels}개`);
    console.log(`  - 영상: ${integratedData.statistics.totalVideos}개`);
  }
}

if (require.main === module) {
  const merger = new DataMerger();
  merger.merge().catch(console.error);
}

module.exports = DataMerger;
