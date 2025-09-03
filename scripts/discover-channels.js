const { google } = require('googleapis');
const youtube = google.youtube('v3');
const fs = require('fs');
const path = require('path');

// API 키 설정
const API_KEY = process.env.YOUTUBE_API_KEY;

// 한국 정치 관련 검색어
const POLITICAL_TERMS = [
  '정치', '국회', '대통령', '정부', '정책', '선거',
  '여당', '야당', '국정감사', '정치뉴스', '시사', '정치평론',
  '청와대', '국무총리', '장관', '의원', '정당', '민주당',
  '국민의힘', '정의당', '개혁', '법안', '외교', '안보',
  '경제정책', '복지정책', '부동산정책', '세금', '예산'
];

// 이전 데이터 로드
function loadPreviousData() {
  try {
    const historyPath = path.join(__dirname, '../data/channel-history.json');
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading previous data:', error.message);
  }
  return {};
}

// 채널 통계 가져오기
async function getChannelStats(channelIds) {
  if (!channelIds.length) return [];
  
  try {
    const response = await youtube.channels.list({
      key: API_KEY,
      part: 'statistics,snippet,contentDetails',
      id: channelIds.join(','),
      maxResults: 50
    });
    
    return response.data.items;
  } catch (error) {
    console.error('Error fetching channel stats:', error.message);
    return [];
  }
}

// 트렌딩 동영상으로 채널 발견
async function discoverChannelsFromTrending() {
  const channelMap = new Map();
  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  
  console.log('🔍 숏츠 및 4분 미만 영상 중심 채널 발견 중...');
  
  for (const term of POLITICAL_TERMS) {
    try {
      console.log(`  - "${term}" 숏츠 검색 중...`);
      
      // 숏츠 우선 검색 (videoDuration: short = 4분 미만)
      const searchResponse = await youtube.search.list({
        key: API_KEY,
        part: 'snippet',
        q: `${term} #shorts`,  // 숏츠 해시태그 추가
        type: 'video',
        videoDuration: 'short',  // 4분 미만 영상만
        regionCode: 'KR',
        relevanceLanguage: 'ko',
        order: 'viewCount',
        publishedAfter: yesterday.toISOString(),
        maxResults: 15,  // 숏츠는 더 많이 수집
        safeSearch: 'moderate'
      });
      
      // 채널별로 그룹화
      for (const item of searchResponse.data.items || []) {
        const channelId = item.snippet.channelId;
        const channelTitle = item.snippet.channelTitle;
        
        if (!channelMap.has(channelId)) {
          channelMap.set(channelId, {
            channelId,
            channelTitle,
            videoCount: 0,
            videos: []
          });
        }
        
        const channel = channelMap.get(channelId);
        channel.videoCount++;
        channel.videos.push({
          videoId: item.id.videoId,
          title: item.snippet.title,
          publishedAt: item.snippet.publishedAt
        });
      }
      
      // API 할당량 보호를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error searching for "${term}":`, error.message);
    }
  }
  
  console.log(`✅ ${channelMap.size}개 채널 발견`);
  return Array.from(channelMap.values());
}

// 채널 성장률 계산
async function calculateChannelGrowth(channels) {
  const previousData = loadPreviousData();
  const channelsWithGrowth = [];
  
  console.log('📊 채널 성장률 분석 중...');
  
  // 채널 ID 배치 처리 (50개씩)
  const batchSize = 50;
  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    const channelIds = batch.map(ch => ch.channelId);
    
    try {
      const channelStats = await getChannelStats(channelIds);
      
      for (const channelData of channelStats) {
        const channelId = channelData.id;
        const currentViews = parseInt(channelData.statistics.viewCount || 0);
        const subscriberCount = parseInt(channelData.statistics.subscriberCount || 0);
        const videoCount = parseInt(channelData.statistics.videoCount || 0);
        
        // 이전 데이터와 비교
        const previous = previousData[channelId] || {};
        const previousViews = previous.viewCount || currentViews;
        const viewGrowth = currentViews - previousViews;
        const growthRate = previousViews > 0 ? 
          ((viewGrowth / previousViews) * 100) : 0;
        
        // 하루 평균 성장률 계산
        const daysSinceLastCheck = previous.timestamp ? 
          (Date.now() - new Date(previous.timestamp).getTime()) / (1000 * 60 * 60 * 24) : 1;
        const dailyGrowthRate = growthRate / Math.max(daysSinceLastCheck, 1);
        
        // 트렌딩 동영상 정보 추가
        const originalChannel = channels.find(ch => ch.channelId === channelId);
        
        channelsWithGrowth.push({
          channelId,
          channelTitle: channelData.snippet.title,
          description: channelData.snippet.description,
          thumbnail: channelData.snippet.thumbnails?.default?.url,
          customUrl: channelData.snippet.customUrl,
          publishedAt: channelData.snippet.publishedAt,
          
          // 통계
          subscriberCount,
          viewCount: currentViews,
          videoCount,
          
          // 성장 지표
          previousViewCount: previousViews,
          viewGrowth,
          growthRate: growthRate.toFixed(2),
          dailyGrowthRate: dailyGrowthRate.toFixed(2),
          
          // 활동 지표
          recentVideos: originalChannel?.videoCount || 0,
          trendingVideos: originalChannel?.videos || [],
          
          // 메타데이터
          lastChecked: new Date().toISOString(),
          isNew: !previous.viewCount
        });
      }
      
    } catch (error) {
      console.error(`Error processing batch ${i / batchSize + 1}:`, error.message);
    }
  }
  
  // 성장률 기준 정렬 (일일 성장률 우선)
  channelsWithGrowth.sort((a, b) => {
    // 신규 채널은 뒤로
    if (a.isNew && !b.isNew) return 1;
    if (!a.isNew && b.isNew) return -1;
    
    // 일일 성장률로 정렬
    return parseFloat(b.dailyGrowthRate) - parseFloat(a.dailyGrowthRate);
  });
  
  console.log(`✅ ${channelsWithGrowth.length}개 채널 분석 완료`);
  return channelsWithGrowth;
}

// 채널 필터링 (정치 관련성 체크)
function filterPoliticalChannels(channels) {
  const politicalKeywords = [
    '정치', '뉴스', '시사', '정책', '국회', '정부', '대통령',
    '장관', '의원', '정당', 'TV', '방송', '언론', '신문'
  ];
  
  return channels.filter(channel => {
    const text = `${channel.channelTitle} ${channel.description}`.toLowerCase();
    
    // 제목이나 설명에 정치 관련 키워드가 있는지 체크
    const isPolitical = politicalKeywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
    
    // 최근 트렌딩 동영상이 2개 이상인 활발한 채널
    const isActive = channel.recentVideos >= 2;
    
    // 구독자 1000명 이상 (스팸 필터링)
    const hasMinSubscribers = channel.subscriberCount >= 1000;
    
    return isPolitical && isActive && hasMinSubscribers;
  });
}

// 메인 함수
async function discoverTrendingChannels() {
  console.log('🚀 트렌딩 채널 발견 프로세스 시작');
  console.log(`⏰ ${new Date().toLocaleString('ko-KR')}`);
  
  try {
    // 1. 트렌딩 동영상에서 채널 발견
    const discoveredChannels = await discoverChannelsFromTrending();
    
    if (discoveredChannels.length === 0) {
      console.log('⚠️ 발견된 채널이 없습니다');
      return [];
    }
    
    // 2. 채널 성장률 계산
    const channelsWithGrowth = await calculateChannelGrowth(discoveredChannels);
    
    // 3. 정치 관련 채널만 필터링
    const politicalChannels = filterPoliticalChannels(channelsWithGrowth);
    
    console.log(`📌 정치 관련 채널: ${politicalChannels.length}개`);
    
    // 4. 이전 데이터 업데이트 (다음 비교용)
    const newHistory = {};
    channelsWithGrowth.forEach(channel => {
      newHistory[channel.channelId] = {
        viewCount: channel.viewCount,
        subscriberCount: channel.subscriberCount,
        timestamp: channel.lastChecked
      };
    });
    
    const historyPath = path.join(__dirname, '../data/channel-history.json');
    fs.writeFileSync(historyPath, JSON.stringify(newHistory, null, 2));
    
    // 5. 상위 200개 채널 반환
    const topChannels = politicalChannels.slice(0, 200);
    
    console.log('📈 상위 10개 급성장 채널 (숏츠 기준):');
    topChannels.slice(0, 10).forEach((channel, index) => {
      console.log(`  ${index + 1}. ${channel.channelTitle}`);
      console.log(`     📱 숏츠 일일 성장률: ${channel.dailyShortsGrowthRate}%`);
      console.log(`     📊 숏츠 조회수 증가: ${(channel.shortsViewGrowth || 0).toLocaleString()}`);
      console.log(`     🎬 숏츠 개수: ${channel.shortsCount || 0}개`);
      console.log(`     👁️ 평균 숏츠 조회수: ${(channel.avgShortsViews || 0).toLocaleString()}`);
      console.log(`     👥 구독자: ${channel.subscriberCount.toLocaleString()}`);
    });
    
    return topChannels;
    
  } catch (error) {
    console.error('❌ 채널 발견 중 오류:', error);
    return [];
  }
}

// 모듈 내보내기
module.exports = {
  discoverTrendingChannels,
  loadPreviousData,
  POLITICAL_TERMS
};

// 직접 실행 시
if (require.main === module) {
  discoverTrendingChannels()
    .then(channels => {
      console.log(`\n✅ 총 ${channels.length}개 트렌딩 채널 발견 완료`);
      
      // 결과 저장
      const outputPath = path.join(__dirname, '../data/discovered-channels.json');
      fs.writeFileSync(outputPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        total: channels.length,
        channels: channels
      }, null, 2));
      
      console.log(`💾 결과 저장: ${outputPath}`);
    })
    .catch(console.error);
}
