const fs = require('fs').promises;
const path = require('path');

async function createDashboardData() {
  console.log('🔧 대시보드용 통합 데이터 생성 시작...');
  
  try {
    // 1. 기존 데이터 파일들 로드
    const channelsPath = path.join(process.cwd(), 'data', 'channels.json');
    const videosPath = path.join(process.cwd(), 'data', 'videos.json');
    const summaryPath = path.join(process.cwd(), 'data', 'summary.json');
    
    const channelsData = JSON.parse(await fs.readFile(channelsPath, 'utf-8'));
    const videosData = JSON.parse(await fs.readFile(videosPath, 'utf-8'));
    const summaryData = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
    
    console.log(`📊 로드 완료:`);
    console.log(`- 채널: ${channelsData.channels?.length || 0}개`);
    console.log(`- 동영상: ${videosData.videos?.length || 0}개`);
    console.log(`- 통계 데이터: ${summaryData.totalShorts || 0}개 숏츠`);
    
    // 2. 대시보드가 기대하는 구조로 통합
    const dashboardData = {
      // 메타 정보
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      
      // 메인 데이터 배열 (대시보드 JavaScript가 찾는 구조)
      channels: channelsData.channels || [],
      videos: videosData.videos || [],
      
      // 통계 정보
      statistics: {
        totalChannels: channelsData.channels?.length || 0,
        totalVideos: videosData.videos?.length || 0,
        totalShorts: summaryData.totalShorts || 0,
        totalRegularVideos: summaryData.totalRegularVideos || 0,
        totalViewCount: summaryData.totalViewCount || 0,
        totalLikeCount: summaryData.totalLikeCount || 0,
        averageViewsPerShort: summaryData.averageViewsPerShort || 0
      },
      
      // 요약 데이터
      topChannelsByShorts: summaryData.topChannelsByShorts || [],
      topShortsByViews: summaryData.topShortsByViews || [],
      
      // 추가 메타데이터
      dataSource: 'github-actions',
      version: '1.0.0'
    };
    
    // 3. latest.json으로 저장
    const latestPath = path.join(process.cwd(), 'data', 'latest.json');
    await fs.writeFile(latestPath, JSON.stringify(dashboardData, null, 2));
    
    console.log('✅ 대시보드용 데이터 생성 완료!');
    console.log(`📄 파일 크기: ${JSON.stringify(dashboardData).length}바이트`);
    console.log(`🎯 구조 확인:`);
    console.log(`- channels: ${dashboardData.channels.length}개`);
    console.log(`- videos: ${dashboardData.videos.length}개`);
    console.log(`- totalViewCount: ${dashboardData.statistics.totalViewCount.toLocaleString()}`);
    
    return dashboardData;
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    throw error;
  }
}

// 실행
if (require.main === module) {
  createDashboardData().catch(console.error);
}

module.exports = createDashboardData;