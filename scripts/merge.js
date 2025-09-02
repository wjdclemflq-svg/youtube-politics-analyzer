// optimized-merge.js
const fs = require('fs');
const path = require('path');

class OptimizedDataMerger {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.cacheDir = path.join(this.dataDir, 'cache');
    this.today = new Date().toISOString().split('T')[0];
    this.timestamp = new Date().toISOString();
  }

  async merge() {
    console.log('🔄 최적화 데이터 병합 시작...');
    console.log(`📅 날짜: ${this.today}`);
    
    // 오늘 수집된 모든 파일 찾기
    const todayFiles = this.getTodayFiles();
    console.log(`📁 발견된 파일: ${todayFiles.length}개`);
    
    // 통합 데이터 구조 초기화
    let integratedData = {
      lastUpdated: this.timestamp,
      date: this.today,
      channels: new Map(),
      videos: new Map(),
      spikes: [],
      aboveAverage: [],
      trends: [],
      social: [],
      categorySummary: [],
      hourlyStats: [],
      statistics: {
        totalChannels: 0,
        totalVideos: 0,
        totalViews: 0,
        dailyQuotaUsed: 0,
        totalRSSCalls: 0,
        totalAPICalls: 0,
        cacheEfficiency: 0
      }
    };
    
    // 모든 파일 병합
    for (const file of todayFiles) {
      const filePath = path.join(this.dataDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.mergeData(integratedData, data, file);
      } catch (error) {
        console.error(`파일 로드 실패 ${file}:`, error.message);
      }
    }
    
    // Map을 Array로 변환
    integratedData.channels = Array.from(integratedData.channels.values());
    integratedData.videos = Array.from(integratedData.videos.values());
    
    // 이전 데이터와 비교하여 변화량 계산
    await this.calculateChanges(integratedData);
    
    // 급상승 동영상 분석
    this.analyzeSpikes(integratedData);
    
    // 평균 대비 우수 동영상 분석
    this.analyzeAboveAverage(integratedData);
    
    // 카테고리별 요약
    this.generateCategorySummary(integratedData);
    
    // 시간대별 통계
    this.generateHourlyStats(integratedData, todayFiles);
    
    // 캐시 효율성 계산
    this.calculateCacheEfficiency(integratedData);
    
    // 통계 업데이트
    this.updateStatistics(integratedData);
    
    // 파일 저장
    await this.saveIntegratedData(integratedData);
    
    // 대시보드용 경량 데이터 생성
    await this.createDashboardData(integratedData);
    
    // 리포트 생성
    this.generateReport(integratedData);
    
    console.log('✅ 데이터 병합 완료!\n');
  }
  
  getTodayFiles() {
    const files = fs.readdirSync(this.dataDir);
    return files.filter(file => 
      file.startsWith(this.today) && 
      file.endsWith('.json') &&
      !file.includes('integrated') &&
      !file.includes('dashboard')
    ).sort();
  }
  
  mergeData(integrated, newData, filename) {
    // 채널 데이터 병합 (최신 정보 우선)
    if (newData.channels) {
      newData.channels.forEach(channel => {
        const existing = integrated.channels.get(channel.id);
        if (!existing || new Date(channel.lastFetched) > new Date(existing.lastFetched)) {
          integrated.channels.set(channel.id, channel);
        }
      });
    }
    
    // 비디오 데이터 병합 (중복 제거, 최신 정보 우선)
    if (newData.videos) {
      newData.videos.forEach(video => {
        const existing = integrated.videos.get(video.videoId);
        if (!existing || (video.viewCount || video.views || 0) > (existing.viewCount || existing.views || 0)) {
          integrated.videos.set(video.videoId, video);
        }
      });
    }
    
    // 통계 누적
    if (newData.statistics) {
      integrated.statistics.dailyQuotaUsed += newData.statistics.quotaUsed || 0;
      integrated.statistics.totalAPICalls += newData.statistics.quotaUsed || 0;
      integrated.statistics.totalRSSCalls += newData.videos?.length || 0;
    }
    
    console.log(`  ✅ ${filename} 병합 완료`);
  }
  
  async calculateChanges(data) {
    // 어제 데이터 로드
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split('T')[0];
    const yesterdayFile = path.join(this.dataDir, `${yesterdayDate}-integrated.json`);
    
    if (!fs.existsSync(yesterdayFile)) {
      console.log('📊 어제 데이터 없음 - 변화량 계산 스킵');
      return;
    }
    
    try {
      const yesterdayData = JSON.parse(fs.readFileSync(yesterdayFile, 'utf8'));
      
      // 채널별 변화량 계산
      const yesterdayChannelMap = new Map();
      yesterdayData.channels?.forEach(ch => 
        yesterdayChannelMap.set(ch.id, {
          viewCount: ch.viewCount,
          subscriberCount: ch.subscriberCount,
          videoCount: ch.videoCount
        })
      );
      
      data.channels = data.channels.map(channel => {
        const yesterday = yesterdayChannelMap.get(channel.id);
        if (yesterday) {
          channel.viewCountDiff = channel.viewCount - yesterday.viewCount;
          channel.subscriberDiff = channel.subscriberCount - yesterday.subscriberCount;
          channel.videoCountDiff = channel.videoCount - yesterday.videoCount;
          channel.growthRate = yesterday.viewCount > 0 
            ? ((channel.viewCount - yesterday.viewCount) / yesterday.viewCount * 100).toFixed(2)
            : 0;
        } else {
          channel.viewCountDiff = 0;
          channel.subscriberDiff = 0;
          channel.videoCountDiff = 0;
          channel.growthRate = 0;
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
        const currentViews = video.viewCount || video.views || 0;
        video.viewCountDiff = currentViews - yesterdayViews;
        video.growthRate = yesterdayViews > 0
          ? ((currentViews - yesterdayViews) / yesterdayViews * 100).toFixed(2)
          : 0;
        return video;
      });
      
      console.log('📈 변화량 계산 완료');
    } catch (error) {
      console.error('어제 데이터 로드 실패:', error.message);
    }
  }
  
  analyzeSpikes(data) {
    // 최근 48시간 내 업로드된 동영상 중 급성장
    const recentVideos = data.videos.filter(v => {
      const publishDate = new Date(v.published || v.publishedAt);
      const hoursSincePublish = (Date.now() - publishDate) / (1000 * 60 * 60);
      return hoursSincePublish < 48;
    });
    
    // 조회수 증가 기준 정렬
    data.spikes = recentVideos
      .filter(v => (v.viewCountDiff || 0) > 5000) // 5천 이상 증가
      .sort((a, b) => (b.viewCountDiff || 0) - (a.viewCountDiff || 0))
      .slice(0, 50) // 상위 50개
      .map(v => {
        const channel = data.channels.find(ch => ch.id === v.channelId);
        return {
          ...v,
          channelTitle: channel?.title || 'Unknown',
          channelThumbnail: channel?.thumbnail,
          spikeRatio: v.viewCountDiff / ((v.viewCount || v.views || 1) - v.viewCountDiff),
          hoursSinceUpload: Math.floor((Date.now() - new Date(v.published || v.publishedAt)) / (1000 * 60 * 60))
        };
      });
    
    console.log(`🔥 급상승 동영상 ${data.spikes.length}개 발견`);
  }
  
  analyzeAboveAverage(data) {
    // 채널별 평균 조회수 계산
    const channelStats = new Map();
    
    data.channels.forEach(channel => {
      const channelVideos = data.videos.filter(v => v.channelId === channel.id);
      if (channelVideos.length > 0) {
        const views = channelVideos.map(v => v.viewCount || v.views || 0);
        const avgViews = views.reduce((sum, v) => sum + v, 0) / views.length;
        const medianViews = views.sort((a, b) => a - b)[Math.floor(views.length / 2)];
        
        channelStats.set(channel.id, {
          avgViews,
          medianViews,
          totalVideos: channelVideos.length
        });
      }
    });
    
    // 평균 대비 우수 동영상
    data.aboveAverage = data.videos
      .map(v => {
        const stats = channelStats.get(v.channelId);
        if (!stats || stats.totalVideos < 5) return null; // 최소 5개 영상 필요
        
        const currentViews = v.viewCount || v.views || 0;
        const uplift = stats.avgViews > 0 ? currentViews / stats.avgViews : 0;
        
        return {
          ...v,
          uplift: uplift.toFixed(2),
          channelAvgViews: Math.floor(stats.avgViews),
          performanceScore: uplift * (v.growthRate || 1)
        };
      })
      .filter(v => v && v.uplift > 1.5) // 평균 1.5배 이상
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 30);
    
    console.log(`⭐ 우수 성과 동영상 ${data.aboveAverage.length}개 발견`);
  }
  
  generateCategorySummary(data) {
    // 전체 통계
    const totalViews = data.channels.reduce((sum, ch) => sum + (ch.viewCount || 0), 0);
    const totalViewsDiff = data.channels.reduce((sum, ch) => sum + (ch.viewCountDiff || 0), 0);
    const totalSubscribers = data.channels.reduce((sum, ch) => sum + (ch.subscriberCount || 0), 0);
    const totalSubscribersDiff = data.channels.reduce((sum, ch) => sum + (ch.subscriberDiff || 0), 0);
    
    // 상위 채널 분석
    const topChannels = [...data.channels]
      .sort((a, b) => (b.viewCountDiff || 0) - (a.viewCountDiff || 0))
      .slice(0, 10);
    
    data.categorySummary = [{
      date: this.today,
      category: '정치',
      totalChannels: data.channels.length,
      totalVideos: data.videos.length,
      totalViews,
      prevTotalViews: totalViews - totalViewsDiff,
      viewsGrowth: totalViewsDiff,
      viewsGrowthRate: totalViewsDiff > 0 ? ((totalViewsDiff / (totalViews - totalViewsDiff)) * 100).toFixed(2) : 0,
      totalSubscribers,
      subscribersGrowth: totalSubscribersDiff,
      topPerformers: topChannels.map(ch => ({
        title: ch.title,
        viewsGrowth: ch.viewCountDiff || 0,
        growthRate: ch.growthRate || 0
      }))
    }];
  }
  
  generateHourlyStats(data, files) {
    // 시간대별 수집 통계
    data.hourlyStats = files.map(file => {
      const match = file.match(/(\d{2})h-(.+)\.json$/);
      if (!match) return null;
      
      const hour = parseInt(match[1]);
      const type = match[2];
      
      try {
        const fileData = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf8'));
        return {
          hour,
          type,
          channels: fileData.channels?.length || 0,
          videos: fileData.videos?.length || 0,
          quotaUsed: fileData.statistics?.quotaUsed || 0
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  }
  
  calculateCacheEfficiency(data) {
    // 캐시 효율성 계산
    const totalPossibleAPICalls = data.channels.length * 6; // 하루 6회 수집
    const actualAPICalls = data.statistics.totalAPICalls;
    data.statistics.cacheEfficiency = totalPossibleAPICalls > 0
      ? ((1 - actualAPICalls / totalPossibleAPICalls) * 100).toFixed(1)
      : 0;
    
    console.log(`💾 캐시 효율성: ${data.statistics.cacheEfficiency}%`);
  }
  
  updateStatistics(data) {
    data.statistics.totalChannels = data.channels.length;
    data.statistics.totalVideos = data.videos.length;
    data.statistics.totalViews = data.channels.reduce((sum, ch) => sum + (ch.viewCount || 0), 0);
    data.statistics.avgViewsPerChannel = Math.floor(data.statistics.totalViews / data.statistics.totalChannels);
    data.statistics.avgVideosPerChannel = Math.floor(data.statistics.totalVideos / data.statistics.totalChannels);
    data.statistics.topChannelViews = Math.max(...data.channels.map(ch => ch.viewCount || 0));
  }
  
  async saveIntegratedData(data) {
    // 전체 통합 데이터 저장
    const integratedPath = path.join(this.dataDir, `${this.today}-integrated.json`);
    fs.writeFileSync(integratedPath, JSON.stringify(data, null, 2));
    console.log(`💾 통합 데이터 저장: ${this.today}-integrated.json`);
    
    // Latest 파일 업데이트
    const latestPath = path.join(this.dataDir, 'integrated-latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(data, null, 2));
  }
  
  async createDashboardData(data) {
    // 대시보드용 경량 데이터 (필요한 필드만)
    const dashboardData = {
      lastUpdated: data.lastUpdated,
      date: data.date,
      channels: data.channels
        .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
        .slice(0, 100)
        .map(ch => ({
          id: ch.id,
          title: ch.title,
          thumbnail: ch.thumbnail,
          viewCount: ch.viewCount,
          viewCountDiff: ch.viewCountDiff,
          subscriberCount: ch.subscriberCount,
          growthRate: ch.growthRate
        })),
      videos: data.videos
        .sort((a, b) => (b.viewCountDiff || 0) - (a.viewCountDiff || 0))
        .slice(0, 500)
        .map(v => ({
          videoId: v.videoId,
          title: v.title,
          channelId: v.channelId,
          thumbnail: v.thumbnail,
          views: v.viewCount || v.views,
          viewCountDiff: v.viewCountDiff,
          published: v.published
        })),
      spikes: data.spikes.slice(0, 30),
      aboveAverage: data.aboveAverage.slice(0, 20),
      categorySummary: data.categorySummary,
      statistics: {
        totalChannels: data.statistics.totalChannels,
        totalVideos: data.statistics.totalVideos,
        totalViews: data.statistics.totalViews,
        dailyQuotaUsed: data.statistics.dailyQuotaUsed,
        cacheEfficiency: data.statistics.cacheEfficiency
      },
      hourlyStats: data.hourlyStats
    };
    
    const dashboardPath = path.join(this.dataDir, 'dashboard-data.json');
    fs.writeFileSync(dashboardPath, JSON.stringify(dashboardData, null, 2));
    console.log('📊 대시보드 데이터 생성 완료');
  }
  
  generateReport(data) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 일일 수집 리포트');
    console.log('='.repeat(60));
    console.log(`📅 날짜: ${this.today}`);
    console.log(`⏰ 생성 시간: ${new Date().toLocaleString('ko-KR')}`);
    console.log();
    console.log('📈 전체 통계');
    console.log(`  • 총 채널: ${data.statistics.totalChannels}개`);
    console.log(`  • 총 동영상: ${data.statistics.totalVideos}개`);
    console.log(`  • 총 조회수: ${(data.statistics.totalViews / 1000000).toFixed(1)}M`);
    console.log(`  • 일일 API 사용: ${data.statistics.dailyQuotaUsed} 유닛 (${(data.statistics.dailyQuotaUsed / 300).toFixed(1)}%)`);
    console.log(`  • 캐시 효율성: ${data.statistics.cacheEfficiency}%`);
    console.log();
    console.log('🔥 급상승 TOP 5');
    data.spikes.slice(0, 5).forEach((v, i) => {
      console.log(`  ${i + 1}. ${v.title.substring(0, 40)}...`);
      console.log(`     +${(v.viewCountDiff || 0).toLocaleString()} views (${v.channelTitle})`);
    });
    console.log();
    console.log('⭐ 우수 성과 TOP 5');
    data.aboveAverage.slice(0, 5).forEach((v, i) => {
      console.log(`  ${i + 1}. ${v.title.substring(0, 40)}...`);
      console.log(`     ${v.uplift}x 평균 대비 (${(v.viewCount || v.views || 0).toLocaleString()} views)`);
    });
    console.log('='.repeat(60));
  }
}

// 실행
if (require.main === module) {
  const merger = new OptimizedDataMerger();
  merger.merge().catch(error => {
    console.error('❌ 병합 오류:', error);
    process.exit(1);
  });
}

module.exports = OptimizedDataMerger;
