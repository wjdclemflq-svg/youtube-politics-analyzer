const { google } = require('googleapis');
const youtube = google.youtube('v3');
const fs = require('fs');
const path = require('path');

// API 키 설정
const API_KEY = process.env.YOUTUBE_API_KEY;

// 동영상 이전 데이터 로드
function loadVideoHistory() {
  try {
    const historyPath = path.join(__dirname, '../data/video-history.json');
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading video history:', error.message);
  }
  return {};
}

// 동영상 상세 정보 가져오기
async function getVideoDetails(videoIds) {
  if (!videoIds.length) return [];
  
  try {
    const response = await youtube.videos.list({
      key: API_KEY,
      part: 'statistics,snippet,contentDetails',
      id: videoIds.join(','),
      maxResults: 50
    });
    
    return response.data.items || [];
  } catch (error) {
    console.error('Error fetching video details:', error.message);
    return [];
  }
}

// 채널의 최근 동영상 가져오기
async function getChannelRecentVideos(channelId, maxResults = 50) {
  try {
    const response = await youtube.search.list({
      key: API_KEY,
      part: 'id,snippet',
      channelId: channelId,
      type: 'video',
      order: 'date',
      maxResults: maxResults
    });
    
    return response.data.items || [];
  } catch (error) {
    console.error(`Error fetching videos for channel ${channelId}:`, error.message);
    return [];
  }
}

// 동영상 성장률 계산
function calculateVideoGrowth(video, previousData) {
  const currentViews = parseInt(video.statistics.viewCount || 0);
  const currentLikes = parseInt(video.statistics.likeCount || 0);
  const currentComments = parseInt(video.statistics.commentCount || 0);
  
  // 업로드 경과 시간 계산
  const publishedAt = new Date(video.snippet.publishedAt);
  const ageInHours = (Date.now() - publishedAt) / (1000 * 60 * 60);
  const ageInDays = ageInHours / 24;
  
  // 이전 데이터와 비교
  const previous = previousData[video.id] || {};
  const previousViews = previous.viewCount || 0;
  const viewGrowth = currentViews - previousViews;
  
  // 시간당 조회수 (초기 속도)
  const viewsPerHour = currentViews / Math.max(ageInHours, 1);
  
  // 최근 증가율 (이전 체크 이후)
  let recentGrowthRate = 0;
  if (previous.timestamp) {
    const hoursSinceLastCheck = (Date.now() - new Date(previous.timestamp).getTime()) / (1000 * 60 * 60);
    recentGrowthRate = viewGrowth / Math.max(hoursSinceLastCheck, 1);
  }
  
  // 참여도 지표
  const engagementRate = currentViews > 0 ? 
    ((currentLikes + currentComments) / currentViews * 100) : 0;
  
  return {
    videoId: video.id,
    title: video.snippet.title,
    channelId: video.snippet.channelId,
    channelTitle: video.snippet.channelTitle,
    thumbnail: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
    publishedAt: video.snippet.publishedAt,
    
    // 현재 통계
    viewCount: currentViews,
    likeCount: currentLikes,
    commentCount: currentComments,
    
    // 이전 통계
    previousViewCount: previousViews,
    viewGrowth,
    
    // 성장 지표
    ageInHours: Math.round(ageInHours),
    ageInDays: ageInDays.toFixed(1),
    viewsPerHour: Math.round(viewsPerHour),
    recentGrowthRate: Math.round(recentGrowthRate),
    
    // 참여도
    engagementRate: engagementRate.toFixed(2),
    
    // 동영상 길이
    duration: video.contentDetails?.duration,
    
    // 카테고리
    categoryId: video.snippet.categoryId,
    tags: video.snippet.tags || []
  };
}

// 채널 평균 성과 계산
function calculateChannelAverages(videos) {
  if (!videos.length) return null;
  
  const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
  const avgViews = Math.round(totalViews / videos.length);
  
  const totalEngagement = videos.reduce((sum, v) => sum + parseFloat(v.engagementRate), 0);
  const avgEngagement = (totalEngagement / videos.length).toFixed(2);
  
  // 24시간 이내 동영상의 평균 조회수
  const recentVideos = videos.filter(v => v.ageInHours <= 24);
  const avgRecentViews = recentVideos.length > 0 ?
    Math.round(recentVideos.reduce((sum, v) => sum + v.viewCount, 0) / recentVideos.length) : 0;
  
  return {
    totalVideos: videos.length,
    avgViews,
    avgEngagement,
    avgRecentViews,
    recentVideoCount: recentVideos.length
  };
}

// 급증 동영상 찾기
function findSpikingVideos(allVideos) {
  // 최근 48시간 이내 업로드된 동영상 중
  // 시간당 조회수가 높거나 최근 증가율이 높은 동영상
  
  return allVideos
    .filter(v => v.ageInHours <= 48)
    .filter(v => v.viewCount >= 1000) // 최소 1000뷰 이상
    .sort((a, b) => {
      // 최근 증가율 우선, 없으면 시간당 조회수로 정렬
      if (a.recentGrowthRate > 0 && b.recentGrowthRate > 0) {
        return b.recentGrowthRate - a.recentGrowthRate;
      }
      return b.viewsPerHour - a.viewsPerHour;
    });
}

// 평균 대비 우수 동영상 찾기
function findAboveAverageVideos(videosByChannel) {
  const aboveAverageVideos = [];
  
  for (const [channelId, data] of Object.entries(videosByChannel)) {
    const { videos, averages } = data;
    
    if (!averages || averages.avgViews === 0) continue;
    
    // 평균 대비 성과 계산
    videos.forEach(video => {
      const performanceRatio = video.viewCount / averages.avgViews;
      
      // 평균의 2배 이상 성과를 낸 동영상
      if (performanceRatio >= 2 && video.viewCount >= 10000) {
        aboveAverageVideos.push({
          ...video,
          channelAvgViews: averages.avgViews,
          performanceRatio: performanceRatio.toFixed(2)
        });
      }
    });
  }
  
  // 성과 비율로 정렬
  return aboveAverageVideos.sort((a, b) => 
    parseFloat(b.performanceRatio) - parseFloat(a.performanceRatio)
  );
}

// 메인 분석 함수 (숏츠 중심)
async function analyzeVideos(channels) {
  console.log('📊 숏츠 및 4분 미만 동영상 분석 시작');
  console.log(`📺 ${channels.length}개 채널 분석 예정`);
  
  const videoHistory = loadVideoHistory();
  const allVideos = [];
  const videosByChannel = {};
  
  // 숏츠 통계
  let totalShorts = 0;
  let totalShortVideos = 0;
  
  // 채널별로 동영상 분석
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    console.log(`  [${i + 1}/${channels.length}] ${channel.channelTitle} 분석 중...`);
    
    try {
      // 1. 채널의 최근 숏츠/짧은 동영상 목록 가져오기
      const recentVideos = await getChannelRecentVideos(channel.channelId, 30);
      
      if (recentVideos.length === 0) {
        console.log(`    ⚠️ 숏츠/짧은 동영상 없음`);
        continue;
      }
      
      // 2. 동영상 상세 정보 가져오기
      const videoIds = recentVideos.map(v => v.id.videoId);
      const videoDetails = await getVideoDetails(videoIds);
      
      // 3. 각 동영상의 성장률 계산 (4분 미만만)
      const analyzedVideos = videoDetails
        .map(video => calculateVideoGrowth(video, videoHistory))
        .filter(v => v !== null);  // 4분 초과 영상 제외
      
      // 숏츠 통계 업데이트
      totalShorts += analyzedVideos.filter(v => v.isShorts).length;
      totalShortVideos += analyzedVideos.filter(v => !v.isShorts).length;
      
      // 4. 채널 평균 계산
      const channelAverages = calculateChannelAverages(analyzedVideos);
      
      // 결과 저장
      videosByChannel[channel.channelId] = {
        channelTitle: channel.channelTitle,
        videos: analyzedVideos,
        averages: channelAverages,
        shortsCount: analyzedVideos.filter(v => v.isShorts).length,
        shortVideoCount: analyzedVideos.filter(v => !v.isShorts).length
      };
      
      allVideos.push(...analyzedVideos);
      
      console.log(`    ✅ ${analyzedVideos.length}개 숏츠/짧은 동영상 분석 완료`);
      console.log(`       - 숏츠: ${analyzedVideos.filter(v => v.isShorts).length}개`);
      console.log(`       - 1-4분: ${analyzedVideos.filter(v => !v.isShorts).length}개`);
      
      // API 할당량 보호
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`    ❌ 오류: ${error.message}`);
    }
  }
  
  console.log(`\n📈 분석 결과 정리 중...`);
  console.log(`  🎬 총 숏츠: ${totalShorts}개`);
  console.log(`  📹 총 짧은 영상 (1-4분): ${totalShortVideos}개`);
  
  // 급증 동영상 찾기 (숏츠 우선)
  const spikingVideos = findSpikingVideos(allVideos);
  console.log(`  🔥 급증 숏츠/동영상: ${spikingVideos.length}개`);
  
  // 평균 대비 우수 동영상 찾기
  const aboveAverageVideos = findAboveAverageVideos(videosByChannel);
  console.log(`  ⭐ 평균 대비 우수: ${aboveAverageVideos.length}개`);
  
  // 동영상 이력 업데이트
  const newHistory = {};
  allVideos.forEach(video => {
    newHistory[video.videoId] = {
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      isShorts: video.isShorts,
      durationInSeconds: video.durationInSeconds,
      timestamp: new Date().toISOString()
    };
  });
  
  const historyPath = path.join(__dirname, '../data/video-history.json');
  fs.writeFileSync(historyPath, JSON.stringify(newHistory, null, 2));
  
  // 결과 반환
  return {
    summary: {
      totalChannelsAnalyzed: Object.keys(videosByChannel).length,
      totalVideosAnalyzed: allVideos.length,
      totalShorts,
      totalShortVideos,
      spikingVideosCount: spikingVideos.length,
      aboveAverageCount: aboveAverageVideos.length
    },
    spikes: spikingVideos.slice(0, 50),      // 상위 50개
    aboveAverage: aboveAverageVideos.slice(0, 30), // 상위 30개
    channelDetails: videosByChannel,
    timestamp: new Date().toISOString()
  };
}

// 모듈 내보내기
module.exports = {
  analyzeVideos,
  getChannelRecentVideos,
  calculateVideoGrowth
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
  // 테스트용 채널 데이터
  const testChannels = [
    {
      channelId: 'UCTHCOPwqNfZ0uiKOvFyhGwg',
      channelTitle: '연합뉴스TV'
    }
  ];
  
  analyzeVideos(testChannels)
    .then(results => {
      console.log('\n✅ 분석 완료');
      console.log('📊 요약:', results.summary);
      
      // 결과 저장
      const outputPath = path.join(__dirname, '../data/video-analysis.json');
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`💾 결과 저장: ${outputPath}`);
    })
    .catch(console.error);
}
