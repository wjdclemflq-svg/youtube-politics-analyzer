const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

// YouTube API 설정
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

// Duration을 초 단위로 변환 (ISO 8601 형식)
function parseDuration(duration) {
  if (!duration) return 0;
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  
  return hours * 3600 + minutes * 60 + seconds;
}

// 숏츠 판별 함수 (개선된 로직)
function isShorts(video) {
  const duration = parseDuration(video.contentDetails?.duration);
  const title = (video.snippet?.title || '').toLowerCase();
  const description = (video.snippet?.description || '').toLowerCase();
  
  // 1. 60초 이하는 무조건 숏츠
  if (duration > 0 && duration <= 60) {
    return true;
  }
  
  // 2. 61-90초 사이인데 제목/설명에 shorts 키워드가 있는 경우
  if (duration > 60 && duration <= 90) {
    if (title.includes('shorts') || title.includes('#shorts') || 
        description.includes('#shorts') || title.includes('숏츠') ||
        title.includes('쇼츠')) {
      return true;
    }
  }
  
  // 3. 세로 형식 비디오 확인 (9:16 비율)
  const thumbnails = video.snippet?.thumbnails;
  if (thumbnails?.high) {
    const aspectRatio = thumbnails.high.width / thumbnails.high.height;
    if (aspectRatio < 0.6) { // 세로 비디오 (9:16 = 0.5625)
      return duration <= 90;
    }
  }
  
  return false;
}

// 채널의 최신 비디오 가져오기
async function getChannelVideos(channelId, maxResults = 50) {
  try {
    // 채널의 uploads 플레이리스트 ID 가져오기
    const channelResponse = await youtube.channels.list({
      id: channelId,
      part: 'contentDetails'
    });
    
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.log(`Channel not found: ${channelId}`);
      return [];
    }
    
    const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
    
    // 플레이리스트에서 최신 비디오 가져오기
    const playlistResponse = await youtube.playlistItems.list({
      playlistId: uploadsPlaylistId,
      part: 'snippet,contentDetails',
      maxResults: maxResults
    });
    
    const videoIds = playlistResponse.data.items.map(item => item.contentDetails.videoId);
    
    if (videoIds.length === 0) {
      return [];
    }
    
    // 비디오 상세 정보 가져오기
    const videosResponse = await youtube.videos.list({
      id: videoIds.join(','),
      part: 'snippet,contentDetails,statistics'
    });
    
    return videosResponse.data.items || [];
    
  } catch (error) {
    console.error(`Error fetching videos for channel ${channelId}:`, error.message);
    return [];
  }
}

// 검색으로 최신 숏츠 찾기
async function searchRecentShorts(query, maxResults = 50) {
  try {
    const searchResponse = await youtube.search.list({
      q: query,
      type: 'video',
      videoDuration: 'short', // 0-4분
      order: 'date',          // 최신순
      publishedAfter: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24시간 이내
      maxResults: maxResults,
      part: 'id',
      regionCode: 'KR',
      relevanceLanguage: 'ko'
    });
    
    const videoIds = searchResponse.data.items.map(item => item.id.videoId);
    
    if (videoIds.length === 0) {
      return [];
    }
    
    // 비디오 상세 정보 가져오기
    const videosResponse = await youtube.videos.list({
      id: videoIds.join(','),
      part: 'snippet,contentDetails,statistics'
    });
    
    return videosResponse.data.items || [];
    
  } catch (error) {
    console.error(`Search error for query "${query}":`, error.message);
    return [];
  }
}

// 메인 분석 함수
async function main() {
  console.log('=== Starting Video Analysis ===');
  
  // 1. 채널 목록 로드
  const channelsFile = path.join(process.cwd(), 'data', 'channels.json');
  let channels = [];
  
  try {
    const channelsData = await fs.readFile(channelsFile, 'utf-8');
    const parsedData = JSON.parse(channelsData);
    channels = parsedData.channels || [];
    console.log(`Loaded ${channels.length} channels`);
  } catch (error) {
    console.error('Error loading channels:', error.message);
    return;
  }
  
  // 2. 비디오 수집
  const allVideos = [];
  const allShorts = [];
  const processedChannels = [];
  
  // 채널별 비디오 수집
  for (let i = 0; i < Math.min(channels.length, 50); i++) { // 처음 50개 채널만
    const channel = channels[i];
    console.log(`\n[${i+1}/50] Analyzing channel: ${channel.title}`);
    
    const videos = await getChannelVideos(channel.id, 30); // 채널당 최신 30개
    
    let channelShorts = 0;
    let channelVideos = 0;
    
    for (const video of videos) {
      const videoData = {
        id: video.id,
        channelId: channel.id,
        channelTitle: channel.title,
        title: video.snippet.title,
        description: video.snippet.description?.substring(0, 200),
        publishedAt: video.snippet.publishedAt,
        duration: video.contentDetails.duration,
        durationSeconds: parseDuration(video.contentDetails.duration),
        viewCount: parseInt(video.statistics.viewCount || 0),
        likeCount: parseInt(video.statistics.likeCount || 0),
        commentCount: parseInt(video.statistics.commentCount || 0),
        thumbnails: video.snippet.thumbnails,
        tags: video.snippet.tags || [],
        isShorts: isShorts(video)
      };
      
      allVideos.push(videoData);
      
      if (videoData.isShorts) {
        allShorts.push(videoData);
        channelShorts++;
      } else {
        channelVideos++;
      }
    }
    
    processedChannels.push({
      ...channel,
      videosAnalyzed: videos.length,
      shortsCount: channelShorts,
      regularVideosCount: channelVideos
    });
    
    console.log(`  Found: ${channelShorts} shorts, ${channelVideos} regular videos`);
    
    // API 할당량 관리
    if ((i + 1) % 10 === 0) {
      console.log(`\nProcessed ${i + 1} channels, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // 3. 추가 숏츠 검색 (최신 트렌딩)
  console.log('\n=== Searching for additional trending shorts ===');
  const searchTerms = ['정치 shorts', '윤석열 shorts', '이재명 shorts', '국회 shorts', '뉴스 shorts'];
  
  for (const term of searchTerms) {
    console.log(`Searching: ${term}`);
    const searchVideos = await searchRecentShorts(term, 20);
    
    for (const video of searchVideos) {
      if (isShorts(video)) {
        const videoData = {
          id: video.id,
          channelId: video.snippet.channelId,
          channelTitle: video.snippet.channelTitle,
          title: video.snippet.title,
          description: video.snippet.description?.substring(0, 200),
          publishedAt: video.snippet.publishedAt,
          duration: video.contentDetails.duration,
          durationSeconds: parseDuration(video.contentDetails.duration),
          viewCount: parseInt(video.statistics.viewCount || 0),
          likeCount: parseInt(video.statistics.likeCount || 0),
          commentCount: parseInt(video.statistics.commentCount || 0),
          thumbnails: video.snippet.thumbnails,
          tags: video.snippet.tags || [],
          isShorts: true,
          fromSearch: true
        };
        
        // 중복 체크
        if (!allShorts.find(s => s.id === videoData.id)) {
          allShorts.push(videoData);
          allVideos.push(videoData);
        }
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 4. 통계 생성
  const stats = {
    lastUpdated: new Date().toISOString(),
    totalChannelsAnalyzed: processedChannels.length,
    totalVideos: allVideos.length,
    totalShorts: allShorts.length,
    totalRegularVideos: allVideos.length - allShorts.length,
    totalViewCount: allVideos.reduce((sum, v) => sum + v.viewCount, 0),
    totalLikeCount: allVideos.reduce((sum, v) => sum + v.likeCount, 0),
    averageViewsPerShort: Math.round(allShorts.reduce((sum, v) => sum + v.viewCount, 0) / (allShorts.length || 1)),
    topChannelsByShorts: processedChannels
      .filter(c => c.shortsCount > 0)
      .sort((a, b) => b.shortsCount - a.shortsCount)
      .slice(0, 10)
      .map(c => ({
        title: c.title,
        shortsCount: c.shortsCount,
        subscriberCount: c.subscriberCount
      })),
    topShortsByViews: allShorts
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10)
      .map(s => ({
        title: s.title,
        channelTitle: s.channelTitle,
        viewCount: s.viewCount,
        publishedAt: s.publishedAt
      }))
  };
  
  // 5. 데이터 저장
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  
  // 전체 비디오 데이터
  await fs.writeFile(
    path.join(dataDir, 'videos.json'),
    JSON.stringify({
      lastUpdated: new Date().toISOString(),
      videos: allVideos
    }, null, 2)
  );
  
  // 숏츠만 따로
  await fs.writeFile(
    path.join(dataDir, 'shorts.json'),
    JSON.stringify({
      lastUpdated: new Date().toISOString(),
      totalShorts: allShorts.length,
      shorts: allShorts
    }, null, 2)
  );
  
  // 통계 요약
  await fs.writeFile(
    path.join(dataDir, 'summary.json'),
    JSON.stringify(stats, null, 2)
  );
  
  // 최신 데이터 (대시보드용)
  await fs.writeFile(
    path.join(dataDir, 'latest.json'),
    JSON.stringify({
      ...stats,
      recentShorts: allShorts
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 50),
      channelStats: processedChannels.slice(0, 20)
    }, null, 2)
  );
  
  // 6. 결과 출력
  console.log('\n=== Analysis Complete ===');
  console.log(`Total channels analyzed: ${processedChannels.length}`);
  console.log(`Total videos analyzed: ${allVideos.length}`);
  console.log(`Total shorts found: ${allShorts.length}`);
  console.log(`Total regular videos: ${allVideos.length - allShorts.length}`);
  console.log(`Total views: ${stats.totalViewCount.toLocaleString()}`);
  console.log(`Average views per short: ${stats.averageViewsPerShort.toLocaleString()}`);
  console.log('\nTop 5 channels by shorts count:');
  stats.topChannelsByShorts.slice(0, 5).forEach((ch, i) => {
    console.log(`${i+1}. ${ch.title}: ${ch.shortsCount} shorts`);
  });
  console.log('\nTop 5 shorts by views:');
  stats.topShortsByViews.slice(0, 5).forEach((s, i) => {
    console.log(`${i+1}. ${s.title} (${s.channelTitle}): ${s.viewCount.toLocaleString()} views`);
  });
}

// 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { isShorts, parseDuration, getChannelVideos };
