const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API_KEYS = [
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3
].filter(key => key);

let currentKeyIndex = 0;
let youtube = google.youtube({
    version: 'v3',
    auth: API_KEYS[currentKeyIndex]
});

function switchKey() {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    youtube = google.youtube({
        version: 'v3',
        auth: API_KEYS[currentKeyIndex]
    });
    console.log(`🔄 API Key ${currentKeyIndex + 1}로 전환`);
}

async function getChannelsFromUrls() {
    // URL 파일 읽기
    const urlsPath = path.join(__dirname, '..', 'data', 'channel-urls.txt');
    const urls = fs.readFileSync(urlsPath, 'utf8').trim().split('\n');
    
    console.log(`📊 ${urls.length}개 URL 처리 시작...\n`);
    
    const channels = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i].trim();
        // @handle 추출 (URL 디코딩 포함)
        const handle = decodeURIComponent(url.split('@')[1]);
        
        if (!handle) continue;
        
        let retries = 0;
        let success = false;
        
        while (!success && retries < API_KEYS.length) {
            try {
                console.log(`[${i+1}/${urls.length}] @${handle} 검색 중... (Key ${currentKeyIndex + 1})`);
                
                // handle로 채널 검색
                const searchResponse = await youtube.search.list({
                    part: 'snippet',
                    q: `@${handle}`,
                    type: 'channel',
                    maxResults: 1
                });
                
                if (searchResponse.data.items && searchResponse.data.items.length > 0) {
                    const channelId = searchResponse.data.items[0].snippet.channelId;
                    
                    // 채널 상세 정보 가져오기
                    const channelResponse = await youtube.channels.list({
                        part: 'snippet,statistics',
                        id: channelId
                    });
                    
                    if (channelResponse.data.items && channelResponse.data.items.length > 0) {
                        const item = channelResponse.data.items[0];
                        channels.push({
                            id: item.id,
                            title: item.snippet.title,
                            handle: `@${handle}`,
                            thumbnail: item.snippet.thumbnails.high?.url || 
                                     item.snippet.thumbnails.default?.url,
                            subscriberCount: parseInt(item.statistics.subscriberCount) || 0,
                            viewCount: parseInt(item.statistics.viewCount) || 0,
                            videoCount: parseInt(item.statistics.videoCount) || 0,
                            description: item.snippet.description
                        });
                        successCount++;
                        console.log(`✅ ${item.snippet.title} - ${item.statistics.subscriberCount} 구독자`);
                    }
                }
                
                success = true;
                
                // API 제한 방지 (0.5초 대기)
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                if (error.code === 403 && error.message.includes('quota')) {
                    console.log(`⚠️ Key ${currentKeyIndex + 1} 할당량 초과`);
                    switchKey();
                    retries++;
                } else {
                    console.error(`❌ 에러: ${error.message}`);
                    errorCount++;
                    break;
                }
            }
        }
        
        if (!success) {
            console.log(`⏭️ @${handle} 건너뜀`);
            errorCount++;
        }
    }
    
    // 결과 저장
    const output = {
        timestamp: new Date().toISOString(),
        totalChannels: channels.length,
        channels: channels,
        videos: [],
        statistics: {
            totalChannels: channels.length,
            successCount: successCount,
            errorCount: errorCount,
            quotaUsed: successCount * 2 // search + channel.list
        }
    };
    
    const outputPath = path.join(__dirname, '..', 'data', 'channels.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 완료: ${successCount}개 채널 정보 수집`);
    console.log(`❌ 실패: ${errorCount}개`);
    console.log(`💾 channels.json 저장 완료`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

getChannelsFromUrls().catch(console.error);