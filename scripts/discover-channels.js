const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

// YouTube API 설정
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

// 하드코딩된 정치 채널 리스트 (90개)
const HARDCODED_CHANNELS = [
  'ytnnews24', 'tvchosunnews', 'SPEAKS_TV', 'mediamongu', 'golfcola',
  '빛의혁명', 'jamjam9787', '오른뉴스', '이마까TV', '오늘의이슈는',
  '어쩌다만든뉴스', '뉴스철철', 'mbcnews7670', 'MBCGN_TV', '정치일주',
  '정치현안뉴스', 'youtube뉴스정보', 'jknews97', '정보특공대TV', '정치보스',
  '정치정보TV-v3d', '청와대로1', '더민숏전시관', '파랑정치', '정치핫이슈-hot',
  'beckettfc4331', '정치가밥먹여줌', '대한시민김상식', 'Uncovered-TV', '정치밸런스',
  '정치랑', '정의봉tv', '한국의목소리', '정치한스푼tv', '이슈카톡',
  '잼있는뉴스', '옳소TV', 'linkingranking', '주관적정치', '일구팔구1989',
  '정.길.희', 'minjupick', '민주톡톡-d5v', 'tv17314', '정치공감TV',
  '세상만사-n6h', '슬기로운정치생활-x1e', '짧은뉴스', '정치도시', '정치브리프-d3l',
  '갑질정치', 'CuriositySoIver', 'as_tecc', 'human_issue', 'bright_politics',
  '콰트로매거진', '잘들어뉴스', '파랑만장-h9y', 'mychokuk', 'RealKoreabroadcasting',
  '다알려줌TV', '정치핫소스', '오늘또뉴스', '재밌는설문', '민주데이',
  '폴리티카POLITICA', '정치라이프', '정치파일', 'politicsgogo', 'leejaemTV',
  '국민이주인인나라-q8d', 'news_walk', '지구뉴스', '이슈이슈특공대', '민주깃발',
  '한줄조언', '정치는코미디', '정치토크', '정치파란', 'Lee_Teacher',
  '방구석정치', 'trdshorts777'
];

// 검색어 리스트 (YouTube 필터와 함께 사용)
const SEARCH_TERMS = [
  '정치', '국회', '대통령', '여당', '야당',
  '윤석열', '이재명', '한동훈', '국민의힘', '민주당',
  '뉴스', '시사', '정치분석', '국정감사', '선거'
];

// 채널 ID 추출 함수
function extractChannelId(urlOrHandle) {
  // @handle 형식
  if (urlOrHandle.startsWith('@')) {
    return urlOrHandle.substring(1);
  }
  // 전체 URL에서 추출
  const match = urlOrHandle.match(/youtube\.com\/@?([^\/\?]+)/);
  return match ? match[1] : urlOrHandle;
}

// 채널 정보 가져오기
async function getChannelInfo(handle) {
  try {
    // 먼저 search로 채널 찾기 (handle은 직접 조회 불가)
    const searchResponse = await youtube.search.list({
      q: handle,
      type: 'channel',
      maxResults: 1,
      part: 'snippet'
    });

    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      const channelId = searchResponse.data.items[0].snippet.channelId;
      
      // 채널 상세 정보 조회
      const channelResponse = await youtube.channels.list({
        id: channelId,
        part: 'snippet,statistics,contentDetails'
      });

      if (channelResponse.data.items && channelResponse.data.items.length > 0) {
        return channelResponse.data.items[0];
      }
    }
  } catch (error) {
    console.error(`Error fetching channel ${handle}:`, error.message);
  }
  return null;
}

// 검색으로 새 채널 발견
async function discoverNewChannels(existingChannelIds) {
  const discoveredChannels = [];
  
  for (const term of SEARCH_TERMS) {
    try {
      console.log(`Searching for: ${term}`);
      
      // YouTube API 검색 - 올바른 필터 사용
      const searchResponse = await youtube.search.list({
        q: term,
        type: 'video',
        videoDuration: 'short',  // 0-4분 (shorts 포함)
        order: 'viewCount',      // 조회수 순
        publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 최근 7일
        maxResults: 50,          // 최대 결과
        part: 'snippet',
        regionCode: 'KR',        // 한국
        relevanceLanguage: 'ko'  // 한국어
      });

      // 채널 ID 추출 및 중복 제거
      const channelIds = [...new Set(
        searchResponse.data.items.map(item => item.snippet.channelId)
      )];

      for (const channelId of channelIds) {
        if (!existingChannelIds.has(channelId)) {
          try {
            const channelInfo = await youtube.channels.list({
              id: channelId,
              part: 'snippet,statistics'
            });

            if (channelInfo.data.items && channelInfo.data.items[0]) {
              const channel = channelInfo.data.items[0];
              
              // 정치 관련 채널인지 확인 (제목/설명에 키워드 포함)
              const title = channel.snippet.title.toLowerCase();
              const description = (channel.snippet.description || '').toLowerCase();
              const politicsKeywords = ['정치', '뉴스', '시사', '국회', '대통령', '정당'];
              
              const isPolitical = politicsKeywords.some(keyword => 
                title.includes(keyword) || description.includes(keyword)
              );

              if (isPolitical) {
                discoveredChannels.push(channel);
                existingChannelIds.add(channelId);
                console.log(`Discovered new channel: ${channel.snippet.title}`);
              }
            }
          } catch (error) {
            console.error(`Error fetching channel details: ${error.message}`);
          }
        }
      }

      // API 할당량 관리를 위한 지연
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Search error for term "${term}":`, error.message);
    }
  }

  return discoveredChannels;
}

// 메인 함수
async function main() {
  const channels = [];
  const channelIds = new Set();
  
  console.log('=== Starting Channel Discovery ===');
  console.log(`Processing ${HARDCODED_CHANNELS.length} hardcoded channels...`);
  
  // 1. 하드코딩된 채널 처리
  for (let i = 0; i < HARDCODED_CHANNELS.length; i++) {
    const handle = extractChannelId(HARDCODED_CHANNELS[i]);
    console.log(`[${i+1}/${HARDCODED_CHANNELS.length}] Processing: ${handle}`);
    
    const channelInfo = await getChannelInfo(handle);
    if (channelInfo) {
      channels.push(channelInfo);
      channelIds.add(channelInfo.id);
      console.log(`✓ Added: ${channelInfo.snippet.title} (${channelInfo.statistics.subscriberCount} subscribers)`);
    } else {
      console.log(`✗ Could not find channel: ${handle}`);
    }
    
    // API 할당량 관리
    if ((i + 1) % 10 === 0) {
      console.log(`Processed ${i + 1} channels, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\nHardcoded channels processed: ${channels.length}`);
  
  // 2. 추가 채널 검색
  console.log('\n=== Discovering Additional Channels ===');
  const discoveredChannels = await discoverNewChannels(channelIds);
  channels.push(...discoveredChannels);
  
  console.log(`\nTotal discovered channels: ${discoveredChannels.length}`);
  console.log(`Total channels: ${channels.length}`);
  
  // 3. 채널 데이터 정리
  const channelData = channels.map(channel => ({
    id: channel.id,
    title: channel.snippet.title,
    description: channel.snippet.description,
    customUrl: channel.snippet.customUrl || '',
    publishedAt: channel.snippet.publishedAt,
    subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
    videoCount: parseInt(channel.statistics.videoCount || 0),
    viewCount: parseInt(channel.statistics.viewCount || 0),
    thumbnails: channel.snippet.thumbnails,
    country: channel.snippet.country || 'KR'
  }));
  
  // 구독자 수로 정렬
  channelData.sort((a, b) => b.subscriberCount - a.subscriberCount);
  
  // 4. 데이터 저장
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  
  // 채널 리스트 저장
  const channelsFile = path.join(dataDir, 'channels.json');
  await fs.writeFile(
    channelsFile,
    JSON.stringify({
      lastUpdated: new Date().toISOString(),
      totalChannels: channelData.length,
      hardcodedChannels: HARDCODED_CHANNELS.length,
      discoveredChannels: discoveredChannels.length,
      channels: channelData
    }, null, 2)
  );
  
  console.log(`\n✅ Channel data saved to ${channelsFile}`);
  console.log('\n=== Summary ===');
  console.log(`Total channels found: ${channelData.length}`);
  console.log(`Top 5 channels by subscribers:`);
  channelData.slice(0, 5).forEach((ch, i) => {
    console.log(`${i + 1}. ${ch.title} - ${ch.subscriberCount.toLocaleString()} subscribers`);
  });
}

// 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { 
  getChannelInfo, 
  discoverNewChannels, 
  discoverTrendingChannels: discoverNewChannels,  // 별칭 추가
  HARDCODED_CHANNELS 
};
