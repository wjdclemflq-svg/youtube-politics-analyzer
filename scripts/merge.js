const fs = require('fs');
const path = require('path');

class DataMerger {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.today = new Date().toISOString().split('T')[0];
  }

  async merge() {
    console.log('🔄 데이터 병합 시작...');
    
    // 오늘 수집된 파일들 찾기
    const morningFile = path.join(this.dataDir, `${this.today}-morning.json`);
    const nightFile = path.join(this.dataDir, `${this.today}-night.json`);
    
    let integratedData = {
      lastUpdated: new Date().toISOString(),
      date: this.today,
      channels: [],
      videos: [],
      spikes: [],
      aboveAverage: [],
      trends: [],
      social: [],
      categorySummary: [],
      statistics: {
        totalChannels: 0,
        totalVideos: 0,
        totalViews: 0,
        dailyQuotaUsed: 0
      }
    };
    
    // Morning 데이터 로드
    if (fs.existsSync(morningFile)) {
      const morningData = JSON.parse(fs.readFileSync(morningFile, 'utf8'));
      this.mergeIntoIntegrated(integratedData, morningData);
    }
    
    // Night 데이터 로드
    if (fs.existsSync(nightFile)) {
      const nightData = JSON.parse(fs.readFileSync(nightFile, 'utf8'));
      this.mergeIntoIntegrated(integratedData, nightData);
    }
    
    // 이전 데이터와 비교하여 변화량 계산
    await this.calculateChanges(integratedData);
    
    // 급상승 동영상 분석
    this.analyzeSpikes(integratedData);
    
    // 평균 대비 우수 동영상 분석
    this.analyzeAboveAverage(integratedData);
    
    // 카테고리별 요약
    this.generateCategorySummary(integratedData);
    
    // 통계 업데이트
    this.updateStatistics(integratedData);
    
    // 통합 파일 저장
    const integratedPath = path.join(this.dataDir, 'integrated-latest.json');
    fs.writeFileSync(integratedPath, JSON.stringify(integratedData, null, 2));
    
    // 대시보드용 경량 파일 생성
    this.createDashboardFile(integratedData);
    
    console.log('✅ 데이터 병합 완료!');
    console.log(`📊 총 채널: ${integratedData.statistics.totalChannels}`);
    console.log(`📹 총 동영상: ${integratedData.statistics.totalVideos}`);
  }
  
  mergeIntoIntegrated(integrated, newData) {
    // 채널 데이터 병합 (중복 제거)
    const channelMap = new Map();
    integrated.channels.forEach(ch => channelMap.set(ch.id, ch));
    newData.channels?.forEach(ch => channelMap.set(ch.id, ch));
    integrated.channels = Array.from(channelMap.values());
    
    // 비디오 데이터 병합 (최신 정보 우선)
    const videoMap = new Map();
    integrated.videos.forEach(v => videoMap.set(v.videoId, v));
    newData.videos?.forEach(v => {
      const existing = videoMap.get(v.videoId);
      if (!existing || new Date(v.lastFetched || 0) > new Date(existing.lastFetched || 0)) {
        videoMap.set(v.videoId, v);
      }
    });
    integrated.videos = Array.from(videoMap.values());
    
    // API 사용량 누적
    integrated.statistics.dailyQuotaUsed += newData.statistics?.quotaUsed || 0;
  }
  
  async calculateChanges(data) {
    // 어제 데이터 로드
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split('T')[0];
    const yesterdayFile = path.join(this.dataDir, `${yesterdayDate}-night.json`);
    
    if (!fs.existsSync(yesterdayFile)) {
      console.log('📝 어제 데이터 없음 - 변화량 계산 스킵');
      return;
    }
    
    const yesterdayData = JSON.parse(fs.readFileSync(yesterdayFile, 'utf8'));
    const yesterdayChannelMap = new Map();
    yesterdayData.channels?.forEach(ch => 
      yesterdayChannelMap.set(ch.id, {
        viewCount: ch.viewCount,
        subscriberCount: ch.subscriberCount
      })
    );
    
    // 변화량 계산
    data.channels = data.channels.map(channel => {
      const yesterday = yesterdayChannelMap.get(channel.id);
      if (yesterday) {
        channel.viewCountDiff = channel.viewCount - yesterday.viewCount;
        channel.subscriberDiff = channel.subscriberCount - yesterday.subscriberCount;
      } else {
        channel.viewCountDiff = 0;
        channel.subscriberDiff = 0;
      }
      return channel;
    });
    
    // 비디오 조회수 변화
    const yesterdayVideoMap = new Map();
    yesterdayData.videos?.forEach(v => 
      yesterdayVideoMap.set(v.videoId, v.viewCount || v.views || 0)
    );
    
    data.videos = data.videos.map(video => {
      const yesterdayViews = yesterdayVideoMap.get(video.videoId) || 0;
      video.viewCountDiff = (video.viewCount || video.views || 0) - yesterdayViews;
      return video;
    });
  }
  
  analyzeSpikes(data) {
    // 조회수 급증 동영상 (24시간 내 업로드 + 높은 증가율)
    const recentVideos = data.videos.filter(v => {
      const publishDate = new Date(v.published);
      const hoursSincePublish = (Date.now() - publishDate) / (1000 * 60 * 60);
      return hoursSincePublish < 48; // 48시간 이내
    });
    
    data.spikes = recentVideos
      .filter(v => v.viewCountDiff > 10000) // 1만 이상 증가
      .sort((a, b) => b.viewCountDiff - a.viewCountDiff)
      .slice(0, 30)
      .map(v => {
        const channel = data.channels.find(ch => ch.id === v.channelId);
        return {
          ...v,
          channelTitle: channel?.title || 'Unknown',
          spikeRatio: v.viewCountDiff / (v.viewCount || 1)
        };
      });
  }
  
  analyzeAboveAverage(data) {
    // 채널별 평균 조회수 계산
    const channelAverages = new Map();
    
    data.channels.forEach(channel => {
      const channelVideos = data.videos.filter(v => v.channelId === channel.id);
      const avgViews = channelVideos.length > 0 
        ? channelVideos.reduce((sum, v) => sum + (v.viewCount || v.views || 0), 0) / channelVideos.length
        : 0;
      channelAverages.set(channel.id, avgViews);
    });
    
    // 평균 대비 우수 동영상
    data.aboveAverage = data.videos
      .map(v => {
        const avgViews = channelAverages.get(v.channelId) || 1;
        const currentViews = v.viewCount || v.views || 0;
        return {
          ...v,
          uplift: avgViews > 0 ? (currentViews / avgViews).toFixed(2) : 0
        };
      })
      .filter(v => v.uplift > 2) // 평균 2배 이상
      .sort((a, b) => b.uplift - a.uplift)
      .slice(0, 20);
  }
  
  generateCategorySummary(data) {
    // 정치 카테고리 일별 요약
    const totalViews = data.channels.reduce((sum, ch) => sum + (ch.viewCount || 0), 0);
    const totalViewsDiff = data.channels.reduce((sum, ch) => sum + (ch.viewCountDiff || 0), 0);
    
    data.categorySummary = [{
      date: this.today,
      category: '정치',
      totalViews: totalViews,
      prevTotalViews: totalViews - totalViewsDiff,
      dodChangePct: totalViewsDiff > 0 ? ((totalViewsDiff / (totalViews - totalViewsDiff)) * 100).toFixed(2) : 0,
      totalChannels: data.channels.length,
      totalVideos: data.videos.length
    }];
  }
  
  updateStatistics(data) {
    data.statistics.totalChannels = data.channels.length;
    data.statistics.totalVideos = data.videos.length;
    data.statistics.totalViews = data.channels.reduce((sum, ch) => sum + (ch.viewCount || 0), 0);
  }
  
  createDashboardFile(data) {
    // 대시보드용 경량 버전 (필요한 데이터만)
    const dashboardData = {
      lastUpdated: data.lastUpdated,
      channels: data.channels.slice(0, 100), // 상위 100개 채널
      videos: data.videos.slice(0, 500), // 최신 500개 동영상
      spikes: data.spikes,
      aboveAverage: data.aboveAverage,
      trends: [], // 추후 트렌드 API 연동시 추가
      social: [], // 추후 Reddit API 연동시 추가
      categorySummary: data.categorySummary,
      statistics: data.statistics
    };
    
    const dashboardPath = path.join(this.dataDir, 'dashboard-data.json');
    fs.writeFileSync(dashboardPath, JSON.stringify(dashboardData, null, 2));
    console.log('📊 대시보드 데이터 생성 완료');
  }
}

// 실행
if (require.main === module) {
  const merger = new DataMerger();
  merger.merge().catch(error => {
    console.error('❌ 병합 오류:', error);
    process.exit(1);
  });
}

module.exports = DataMerger;