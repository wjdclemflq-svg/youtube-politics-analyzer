const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// API 키 설정
const API_KEYS = [
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3
].filter(key => key);

console.log(`🔑 ${API_KEYS.length}개의 API 키 발견\n`);

let currentKeyIndex = 0;
let youtube;

function initializeYouTube(keyIndex) {
    youtube = google.youtube({
        version: 'v3',
        auth: API_KEYS[keyIndex]
    });
    console.log(`🔑 API Key ${keyIndex + 1} 사용 중`);
}

async function updateThumbnails() {
    console.log('🚀 썸네일 업데이트 시작...\n');
    
    const channelsPath = path.join(__dirname, '..', 'data', 'channels.json');
    
    if (!fs.existsSync(channelsPath)) {
        console.error('❌ channels.json 파일을 찾을 수 없습니다.');
        console.log('📁 확인 경로:', channelsPath);
        return;
    }
    
    const data = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
    const channels = data.channels || data;
    console.log(`📊 총 ${channels.length}개 채널 발견\n`);
    
    initializeYouTube(currentKeyIndex);
    
    let updateCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        
        try {
            const response = await youtube.channels.list({
                part: 'snippet,statistics',
                id: channel.id || channel.channelId
            });
            
            if (response.data.items && response.data.items.length > 0) {
                const item = response.data.items[0];
                
                // 썸네일 업데이트
                const thumbnails = item.snippet.thumbnails;
                channel.thumbnail = thumbnails.high?.url || 
                                  thumbnails.medium?.url || 
                                  thumbnails.default?.url;
                
                // 채널 정보 업데이트
                channel.title = item.snippet.title;
                channel.subscriberCount = parseInt(item.statistics.subscriberCount) || 0;
                channel.viewCount = parseInt(item.statistics.viewCount) || 0;
                
                updateCount++;
                console.log(`✅ [${i + 1}/${channels.length}] ${channel.title}`);
                console.log(`   📸 썸네일 업데이트 완료`);
                console.log(`   👥 구독자: ${channel.subscriberCount.toLocaleString()}\n`);
            }
            
            // API 제한 방지 (1초 대기)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            errorCount++;
            console.error(`❌ [${i + 1}/${channels.length}] 오류: ${error.message}\n`);
            
            // API 키 소진시 다음 키로 전환
            if (error.code === 403 && currentKeyIndex < API_KEYS.length - 1) {
                currentKeyIndex++;
                console.log(`🔄 API Key ${currentKeyIndex + 1}로 전환\n`);
                initializeYouTube(currentKeyIndex);
                i--; // 다시 시도
            }
        }
    }
    
    // 저장
        data.channels = channels;
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(channelsPath, JSON.stringify(data, null, 2));
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 완료! ${updateCount}개 채널 업데이트`);
    console.log(`❌ 실패: ${errorCount}개`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// 실행
updateThumbnails().catch(console.error); 
