const { YouTubeAPIRotation } = require('./api-key-rotation');
const fs = require('fs').promises;
const path = require('path');

// 하드코딩된 정치 채널 리스트 (전체 90개)
const HARDCODED_CHANNELS = [
  'ytnnews24', 'tvchosunnews', 'mbcnews7670', 'MBCGN_TV',
  'SPEAKS_TV', 'mediamongu', 'golfcola', '빛의혁명', 'jamjam9787',
  '오른뉴스', '이마까TV', '오늘의이슈는', '어쩌다만든뉴스', '뉴스철철',
  '정치일주', '정치현안뉴스', 'youtube뉴스정보', 'jknews97', '정보특공대TV',
  '정치보스', '정치정보TV-v3d', '오른뉴스', '청와대로1', '더민숏전시관', 
  '파랑정치', '정치핫이슈-hot', 'beckettfc4331', '정치가밥먹여줌', '잼잼9787',
  '대한시민김상식', 'Uncovered-TV', '정치밸런스', '정치랑', '정의봉tv',
  '한국의목소리', '정치한스푼tv', '이슈카톡', '잼있는뉴스', '옳소TV',
  'linkingranking', '주관적정치', '일구팔구1989', '정.길.희', 'minjupick',
  '민주톡톡-d5v', 'tv17314', '정치공감TV', '세상만사-n6h', '슬기로운정치생활-x1e',
  '짧은뉴스', '정치도시', '정치브리프-d3l', '갑질정치', 'CuriositySoIver',
  'as_tecc', 'human_issue', 'bright_politics', '콰트로매거진', '잘들어뉴스',
  '어쩌다만든뉴스', '파랑만장-h9y', 'mychokuk', 'RealKoreabroadcasting', '다알려줌TV',
  '정치핫소스', '오늘또뉴스', '재밌는설문', '민주데이', '폴리티카POLITICA',
  '정치라이프', '정치파일', '뉴스철철', 'politicsgogo', 'leejaemTV',
  '국민이주인인나라-q8d', 'news_walk', '지구뉴스', '이슈이슈특공대', '민주깃발',
  '한줄조언', '정치는코미디', '정치토크', '정치파란', 'Lee_Teacher',
  '이마까TV', '방구석정치', 'trdshorts777'
];

async function main() {
  console.log('=== YouTube Politics Analyzer with 3 API Keys ===');
  
  // API 로테이션 시스템 초기화
  const apiRotation = new YouTubeAPIRotation();
  console.log(`📊 Available API Keys: ${apiRotation.getStatus().totalKeys}`);
  
  const channels = [];
  const channelIds = new Set();
  let successCount = 0;
  let failCount = 0;
  
  console.log(`\n🎯 Processing ${HARDCODED_CHANNELS.length} channels...`);
  
  for (let i = 0; i < HARDCODED_CHANNELS.length; i++) {
    const handle = HARDCODED_CHANNELS[i];
    console.log(`\n[${i+1}/${HARDCODED_CHANNELS.length}] Processing: ${handle}`);
    
    try {
      // API 로테이션을 사용한 채널 정보 가져오기
      const channelInfo = await apiRotation.executeWithRotation(async (youtube) => {
        // 채널 검색
        const searchResponse = await youtube.search.list({
          q: handle,
          type: 'channel',
          maxResults: 1,
          part: 'snippet'
        });
        
        if (searchResponse.data.items && searchResponse.data.items.length > 0) {
          const channelId = searchResponse.data.items[0].snippet.channelId;
          
          // 채널 상세 정보
          const channelResponse = await youtube.channels.list({
            id: channelId,
            part: 'snippet,statistics,contentDetails'
          });
          
          return channelResponse.data.items[0];
        }
        return null;
      });
      
      if (channelInfo) {
        channels.push(channelInfo);
        channelIds.add(channelInfo.id);
        successCount++;
        console.log(`✅ Added: ${channelInfo.snippet.title} (${channelInfo.statistics.subscriberCount} subscribers)`);
      } else {
        failCount++;
        console.log(`⚠️ Channel not found: ${handle}`);
      }
      
    } catch (error) {
      if (error.message.includes('All API keys have exceeded quota')) {
        console.log('\n❌ All 3 API keys exhausted. Saving collected data...');
        break;
      }
      failCount++;
      console.log(`❌ Error: ${error.message}`);
    }
    
    // 10개마다 상태 체크
    if ((i + 1) % 10 === 0) {
      const status = apiRotation.getStatus();
      console.log(`\n📊 Status Check:`);
      console.log(`  - Processed: ${i + 1}/${HARDCODED_CHANNELS.length}`);
      console.log(`  - Success: ${successCount}, Failed: ${failCount}`);
      console.log(`  - Current Key: #${status.currentKey}`);
      console.log(`  - Key Usage: ${status.usage.join(', ')}`);
      console.log(`  - Available Keys: ${status.availableKeys}`);
      
      // 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // 결과 저장
  console.log('\n=== Saving Results ===');
  console.log(`Total channels collected: ${channels.length}/${HARDCODED_CHANNELS.length}`);
  
  // 채널 데이터 정리
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
    uploads: channel.contentDetails.relatedPlaylists.uploads,
    country: channel.snippet.country || 'KR'
  }));
  
  // 구독자 수로 정렬
  channelData.sort((a, b) => b.subscriberCount - a.subscriberCount);
  
  // 파일 저장
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  
  const channelsFile = path.join(dataDir, 'channels.json');
  await fs.writeFile(
    channelsFile,
    JSON.stringify({
      lastUpdated: new Date().toISOString(),
      totalChannels: channelData.length,
      hardcodedChannels: HARDCODED_CHANNELS.length,
      channels: channelData
    }, null, 2)
  );
  
  // 최종 리포트
  const finalStatus = apiRotation.getStatus();
  console.log('\n=== Final Report ===');
  console.log(`✅ Successfully collected: ${successCount} channels`);
  console.log(`❌ Failed: ${failCount} channels`);
  console.log(`📊 API Key Usage:`);
  finalStatus.usage.forEach((count, index) => {
    const status = finalStatus.quotaExceeded[index] ? '(Exhausted)' : '(Available)';
    console.log(`  Key #${index + 1}: ${count} calls ${status}`);
  });
  console.log(`\n💾 Data saved to: ${channelsFile}`);
  
  // Top 5 채널
  console.log('\n🏆 Top 5 Channels by Subscribers:');
  channelData.slice(0, 5).forEach((ch, i) => {
    console.log(`${i + 1}. ${ch.title}: ${ch.subscriberCount.toLocaleString()} subscribers`);
  });
}

// 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { HARDCODED_CHANNELS };
