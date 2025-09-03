#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { discoverTrendingChannels } = require('./discover-channels');
const { analyzeVideos } = require('./analyze-videos');

// 데이터 디렉토리 확인 및 생성
function ensureDataDirectory() {
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 data 디렉토리 생성');
  }
}

// API 사용량 계산
function calculateQuotaUsage(channels, videos) {
  // YouTube API v3 할당량 계산
  // search.list = 100 units
  // channels.list = 1 unit
  // videos.list = 1 unit
  
  const searchQuota = 30 * 100; // 30개 검색어 * 100 units
  const channelQuota = channels * 1; // 채널 정보
  const videoQuota = videos * 1; // 동영상 정보
  
  return {
    search: searchQuota,
    channels: channelQuota,
    videos: videoQuota,
    total: searchQuota + channelQuota + videoQuota,
    percentage: ((searchQuota + channelQuota + videoQuota) / 10000 * 100).toFixed(2)
  };
}

// 데이터 병합 (중복 제거)
function mergeWithExistingData(newData) {
  try {
    const latestPath = path.join(__dirname, '../data/latest.json');
    if (fs.existsSync(latestPath)) {
      const existingData = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
      
      // 채널 병합 (ID 기준 중복 제거)
      const channelMap = new Map();
      
      // 기존 채널
      if (existingData.channels) {
        existingData.channels.forEach(ch => channelMap.set(ch.channelId, ch));
      }
      
      // 새 채널 (더 최신 데이터로 업데이트)
      if (newData.channels) {
        newData.channels.forEach(ch => channelMap.set(ch.channelId, ch));
      }
      
      // 동영상 병합
      const videoMap = new Map();
      
      // 기존 동영상
      if (existingData.spikes) {
        existingData.spikes.forEach(v => videoMap.set(v.videoId, v));
      }
      
      // 새 동영상
      if (newData.spikes) {
        newData.spikes.forEach(v => videoMap.set(v.videoId, v));
      }
      
      return {
        ...newData,
        channels: Array.from(channelMap.values()),
        spikes: Array.from(videoMap.values())
      };
    }
  } catch (error) {
    console.error('병합 중 오류:', error.message);
  }
  
  return newData;
}

// 통계 요약 생성
function generateSummaryStats(data) {
  const totalChannels = data.channels?.length || 0;
  const totalViewGrowth = data.channels?.reduce((sum, ch) => sum + (ch.viewGrowth || 0), 0) || 0;
  const avgGrowthRate = totalChannels > 0 ? 
    (data.channels.reduce((sum, ch) => sum + parseFloat(ch.dailyGrowthRate || 0), 0) / totalChannels).toFixed(2) : 0;
  
  // 가장 빠르게 성장하는 채널
  const topGrowingChannels = data.channels?.slice(0, 5).map(ch => ({
    title: ch.channelTitle,
    growthRate: ch.dailyGrowthRate,
    viewGrowth: ch.viewGrowth
  })) || [];
  
  // 가장 조회수가 높은 동영상
  const topVideos = data.spikes?.slice(0, 5).map(v => ({
    title: v.title,
    views: v.viewCount,
    growth: v.viewGrowth
  })) || [];
  
  return {
    overview: {
      totalChannels,
      totalViewGrowth,
      avgGrowthRate,
      totalSpikingVideos: data.spikes?.length || 0,
      totalAboveAverage: data.aboveAverage?.length || 0
    },
    topGrowingChannels,
    topVideos
  };
}

// 대시보드용 데이터 포맷팅 (숏츠 중심)
function formatForDashboard(channels, videoAnalysis) {
  // 채널 데이터 포맷 (숏츠 성과 기준)
  const formattedChannels = channels.map(ch => ({
    id: ch.channelId,
    title: ch.channelTitle,
    description: ch.description?.substring(0, 200) || '',
    customUrl: ch.customUrl,
    thumbnail: ch.thumbnail,
    
    // 숏츠 중심 통계
    viewCount: ch.totalShortsViews || 0,  // 숏츠 총 조회수
    subscriberCount: ch.subscriberCount,
    videoCount: ch.shortsCount || 0,      // 숏츠 개수
    
    // 숏츠 성장 지표
    viewCountDiff: ch.shortsViewGrowth || 0,
    growthRate: ch.shortsGrowthRate || 0,
    dailyGrowthRate: ch.dailyShortsGrowthRate || 0,
    avgShortsViews: ch.avgShortsViews || 0,
    
    // 전체 통계 (참고용)
    totalVideos: ch.totalVideoCount,
    totalViewCount: ch.viewCount,
    
    lastFetched: ch.lastChecked,
    dataSource: 'youtube-api-shorts'
  }));
  
  // 동영상 데이터 포맷 (숏츠/짧은 영상만)
  const formattedVideos = videoAnalysis.spikes?.map(v => ({
    videoId: v.videoId,
    channelId: v.channelId,
    title: v.title,
    published: v.publishedAt,
    thumbnail: v.thumbnail,
    
    // 동영상 정보
    views: v.viewCount,
    durationInSeconds: v.durationInSeconds,
    isShorts: v.isShorts,
    videoType: v.videoType,
    
    // 성장 지표
    viewCountDiff: v.viewGrowth,
    viewsPerHour: v.viewsPerHour,
    recentGrowthRate: v.recentGrowthRate,
    
    // 참여도
    likeCount: v.likeCount,
    commentCount: v.commentCount,
    engagementRate: v.engagementRate,
    
    description: ''
  })) || [];
  
  return {
    timestamp: new Date().toISOString(),
    type: 'shorts-focused',
    channels: formattedChannels,
    videos: formattedVideos,
    spikes: videoAnalysis.spikes || [],
    aboveAverage: videoAnalysis.aboveAverage || [],
    statistics: {
      totalChannels: formattedChannels.length,
      totalVideos: formattedVideos.length,
      totalShorts: videoAnalysis.summary?.totalShorts || 0,
      totalShortVideos: videoAnalysis.summary?.totalShortVideos || 0,
      quotaUsed: 0,
      cacheHits: 0
    }
  };
}

// 메인 실행 함수
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🚀 동적 채널 수집 시스템 시작');
  console.log('═══════════════════════════════════════════');
  console.log(`📅 ${new Date().toLocaleString('ko-KR')}\n`);
  
  const startTime = Date.now();
  
  try {
    // 0. 데이터 디렉토리 확인
    ensureDataDirectory();
    
    // 1. 트렌딩 채널 발견
    console.log('【1단계】 트렌딩 채널 발견');
    console.log('─────────────────────────────');
    const trendingChannels = await discoverTrendingChannels();
    
    if (trendingChannels.length === 0) {
      console.log('⚠️ 발견된 채널이 없습니다. 프로세스 종료.');
      return;
    }
    
    console.log(`✅ ${trendingChannels.length}개 채널 발견 완료\n`);
    
    // 2. 동영상 분석
    console.log('【2단계】 동영상 성장 분석');
    console.log('─────────────────────────────');
    
    // 상위 50개 채널만 동영상 분석 (API 할당량 절약)
    const channelsToAnalyze = trendingChannels.slice(0, 50);
    const videoAnalysis = await analyzeVideos(channelsToAnalyze);
    
    console.log(`✅ ${videoAnalysis.summary.totalVideosAnalyzed}개 동영상 분석 완료\n`);
    
    // 3. 대시보드용 데이터 포맷팅
    console.log('【3단계】 데이터 포맷팅');
    console.log('─────────────────────────────');
    const dashboardData = formatForDashboard(trendingChannels, videoAnalysis);
    
    // 4. 기존 데이터와 병합
    const mergedData = mergeWithExistingData(dashboardData);
    
    // 5. 통계 생성
    const summaryStats = generateSummaryStats(mergedData);
    
    // 6. 파일 저장
    console.log('【4단계】 데이터 저장');
    console.log('─────────────────────────────');
    
    // latest.json (대시보드용)
    const latestPath = path.join(__dirname, '../data/latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(mergedData, null, 2));
    console.log(`  ✅ ${latestPath}`);
    
    // summary.json (통계)
    const summaryPath = path.join(__dirname, '../data/summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summaryStats, null, 2));
    console.log(`  ✅ ${summaryPath}`);
    
    // 백업 (일별)
    const today = new Date().toISOString().split('T')[0];
    const backupDir = path.join(__dirname, '../data/daily');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupPath = path.join(backupDir, `${today}_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(mergedData, null, 2));
    console.log(`  ✅ ${backupPath}\n`);
    
    // 7. 실행 결과 출력
    console.log('═══════════════════════════════════════════');
    console.log('📊 숏츠 수집 결과 요약');
    console.log('═══════════════════════════════════════════');
    console.log(`  • 총 채널 수: ${summaryStats.overview.totalChannels}개`);
    console.log(`  • 총 조회수 증가: ${summaryStats.overview.totalViewGrowth.toLocaleString()}`);
    console.log(`  • 평균 일일 성장률: ${summaryStats.overview.avgGrowthRate}%`);
    console.log(`  • 급증 숏츠/동영상: ${summaryStats.overview.totalSpikingVideos}개`);
    console.log(`  • 평균 대비 우수: ${summaryStats.overview.totalAboveAverage}개`);
    
    // 숏츠 통계 추가
    if (videoAnalysis.summary) {
      console.log(`\n  📱 숏츠 통계:`);
      console.log(`  • 숏츠 (≤60초): ${videoAnalysis.summary.totalShorts || 0}개`);
      console.log(`  • 짧은 영상 (1-4분): ${videoAnalysis.summary.totalShortVideos || 0}개`);
      console.log(`  • 총 분석 영상: ${videoAnalysis.summary.totalVideosAnalyzed || 0}개`);
    }
    
    // API 사용량
    const quota = calculateQuotaUsage(
      trendingChannels.length,
      videoAnalysis.summary.totalVideosAnalyzed
    );
    console.log(`\n  • API 사용량: ${quota.total.toLocaleString()} units (${quota.percentage}%)`);
    
    // 실행 시간
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  • 실행 시간: ${executionTime}초`);
    
    // Top 5 채널
    if (summaryStats.topGrowingChannels.length > 0) {
      console.log('\n📈 급성장 채널 TOP 5:');
      summaryStats.topGrowingChannels.forEach((ch, i) => {
        console.log(`  ${i + 1}. ${ch.title}`);
        console.log(`     성장률: ${ch.growthRate || 0}% | 조회수 증가: ${(ch.viewGrowth || 0).toLocaleString()}`);
      });
    }
    
    console.log('\n✅ 모든 작업이 완료되었습니다!');
    console.log('═══════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ 실행 중 오류 발생:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  // 환경 변수 체크
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY 환경 변수가 설정되지 않았습니다.');
    console.error('다음과 같이 실행하세요:');
    console.error('YOUTUBE_API_KEY=your_api_key node scripts/collect-dynamic.js');
    process.exit(1);
  }
  
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
